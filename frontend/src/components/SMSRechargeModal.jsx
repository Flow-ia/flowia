import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { paymentsApi } from '../utils/api';

// ── Clé publique Stripe (env Vite) ──────────────────────────────────────────
const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
let stripePromise = null;
function getStripeSingleton() {
  if (!stripePromise && STRIPE_PK) stripePromise = loadStripe(STRIPE_PK);
  return stripePromise;
}

// Wrapper qui met Elements autour du form — Elements doit envelopper tout composant qui utilise useStripe/useElements
// CRITIQUE: options doit avoir une référence STABLE (useMemo). Sinon React-Stripe
// re-crée les Elements à chaque render → erreur "Element not mounted / ready not emitted".
export default function SMSRechargeModal({ open, theme, onClose, onSuccess, showToast }) {
  const stripe = getStripeSingleton();
  // Appearance figée — dépend uniquement du mode (dark/light), pas du reste
  const elementsOptions = useMemo(() => ({
    appearance: {
      theme: theme.mode === 'dark' ? 'night' : 'stripe',
      variables: { colorPrimary: '#6366f1', borderRadius: '10px', fontSizeBase: '15px' },
    },
  }), [theme.mode]);

  if (!open) return null;
  if (!stripe) {
    return (
      <ModalShell theme={theme} onClose={onClose}>
        <ConfigMissing theme={theme} />
      </ModalShell>
    );
  }
  return (
    <Elements stripe={stripe} options={elementsOptions}>
      <RechargeInner theme={theme} onClose={onClose} onSuccess={onSuccess} showToast={showToast} />
    </Elements>
  );
}

function ModalShell({ theme, onClose, children }) {
  const isDark = theme.mode === 'dark';
  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(12px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:460, background: isDark ? '#161622' : '#fff',
        borderRadius:24, border:`1px solid ${theme.border}`, padding:'28px 26px', maxHeight:'92vh', overflowY:'auto',
        boxShadow:'0 30px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div>
            <p style={{ margin:0, fontSize:12, fontWeight:800, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>Recharge SMS</p>
            <h2 style={{ margin:'4px 0 0', fontSize:22, fontWeight:900, color:theme.text }}>Paiement sécurisé</h2>
          </div>
          <button onClick={onClose} aria-label="Fermer"
            style={{ width:34, height:34, borderRadius:10, border:'none', cursor:'pointer',
              background:isDark?'rgba(255,255,255,0.06)':'#f1f5f9', color:theme.muted, fontSize:18 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfigMissing({ theme }) {
  return (
    <div style={{ padding:'24px 8px', textAlign:'center' }}>
      <div style={{ fontSize:42, marginBottom:14 }}>⚠️</div>
      <p style={{ margin:0, fontSize:15, fontWeight:800, color:theme.text }}>Stripe non configuré</p>
      <p style={{ margin:'8px 0 0', fontSize:13, color:theme.muted }}>
        La variable <code>VITE_STRIPE_PUBLISHABLE_KEY</code> doit être définie dans l'environnement Vercel.
      </p>
    </div>
  );
}

// ── Étapes du paiement ──────────────────────────────────────────────────────
const STEPS = [
  { id: 'idle',       label: 'Informations' },
  { id: 'loading',    label: 'Création du paiement' },
  { id: 'processing', label: 'Traitement' },
  { id: 'finalizing', label: 'Finalisation' },
  { id: 'success',    label: 'Recharge approuvée' },
];

function RechargeInner({ theme, onClose, onSuccess, showToast }) {
  const stripe   = useStripe();
  const elements = useElements();
  const isDark   = theme.mode === 'dark';

  const [step, setStep]             = useState('idle');
  const [amount, setAmount]         = useState('20');
  const [methods, setMethods]       = useState([]);
  const [defaultPm, setDefaultPm]   = useState(null);
  const [selectedPm, setSelectedPm] = useState(null);
  const [loadingPm, setLoadingPm]   = useState(true);
  const [saveCard, setSaveCard]     = useState(true);
  const [cardReady, setCardReady]   = useState({ number:false, expiry:false, cvc:false });
  const [cardMounted, setCardMounted] = useState({ number:false, expiry:false, cvc:false });
  const [cardError, setCardError]   = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [result, setResult]         = useState(null);

  const reload = useCallback(async () => {
    setLoadingPm(true);
    try {
      const r = await paymentsApi.listPaymentMethods();
      setMethods(r.methods || []);
      setDefaultPm(r.default || null);
      const first = (r.methods?.[0]?.id) || 'new';
      setSelectedPm(r.default || first);
    } catch {
      setMethods([]); setSelectedPm('new');
    } finally { setLoadingPm(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Reset des états de la carte quand on bascule entre carte existante et nouvelle
  useEffect(() => {
    setCardReady({ number:false, expiry:false, cvc:false });
    setCardMounted({ number:false, expiry:false, cvc:false });
    setCardError(null);
  }, [selectedPm]);

  const numAmt = parseFloat(amount) || 0;
  const amountOk = numAmt >= 5;
  const isNew  = selectedPm === 'new';
  const cardComplete = cardReady.number && cardReady.expiry && cardReady.cvc;
  const cardAllMounted = cardMounted.number && cardMounted.expiry && cardMounted.cvc;
  const canPay = amountOk && !!selectedPm && (!isNew || (cardComplete && cardAllMounted)) && !submitting;

  async function handlePay() {
    if (!stripe || !elements) return;
    setError(null);
    setSubmitting(true);

    try {
      // ── Étape 1 — Tokenisation carte neuve AVANT tout changement de step ─
      // Important: ne pas démonter le CardForm tant que createPaymentMethod
      // n'a pas terminé, sinon Stripe ne trouve plus les éléments CVC/Expiry.
      let paymentMethodId = isNew ? null : selectedPm;
      if (isNew) {
        const cardEl = elements.getElement(CardNumberElement);
        if (!cardEl) throw new Error('Formulaire de carte non chargé, réessayez.');
        const { paymentMethod, error: pmErr } = await stripe.createPaymentMethod({
          type: 'card', card: cardEl,
        });
        if (pmErr) { setCardError(pmErr.message); throw pmErr; }
        paymentMethodId = paymentMethod.id;
      }

      // Désormais on peut changer le step — les éléments ne sont plus nécessaires
      setStep('loading');

      // ── Étape 2 — Création du PaymentIntent côté serveur ─────────────────
      // new_card=true → user on-session, peut gérer 3DS, save_card autorisé
      // new_card=false + pm_id → carte enregistrée, confirm off-session 1-clic
      const r = await paymentsApi.createIntent({
        amount: numAmt,
        payment_method_id: paymentMethodId,
        save_card: isNew && saveCard,
        new_card: isNew,
      });

      // ── Étape 3 — Traitement (gestion SCA 3DS si nécessaire) ─────────────
      setStep('processing');
      if (r.status === 'requires_action' || r.status === 'requires_confirmation') {
        // Typiquement 3D Secure — on laisse Stripe afficher sa modale
        const { error: confErr, paymentIntent } = await stripe.confirmCardPayment(r.client_secret);
        if (confErr) throw new Error(confErr.message);
        if (paymentIntent.status !== 'succeeded')
          throw new Error('Statut inattendu : ' + paymentIntent.status);
      } else if (r.status !== 'succeeded') {
        throw new Error('Statut inattendu : ' + r.status);
      }

      // ── Étape 4 — Finalisation (crédit du solde) ─────────────────────────
      setStep('finalizing');
      const verified = await paymentsApi.verifyIntent(r.intent_id);

      setResult(verified);
      setStep('success');
      onSuccess?.(verified);
      await reload();
    } catch(e) {
      setError(e.message || 'Erreur de paiement');
      setStep('idle');
    } finally { setSubmitting(false); }
  }

  async function deleteCard(id) {
    if (!confirm('Supprimer cette carte ?')) return;
    try { await paymentsApi.deletePaymentMethod(id); await reload(); showToast?.('Carte supprimée'); }
    catch(e) { showToast?.(e.message, 'error'); }
  }
  async function setAsDefault(id) {
    try { await paymentsApi.setDefaultPaymentMethod(id); await reload(); showToast?.('Carte par défaut mise à jour'); }
    catch(e) { showToast?.(e.message, 'error'); }
  }

  return (
    <ModalShell theme={theme} onClose={onClose}>
      <StepBar step={step} theme={theme} />

      {step === 'success' && result ? (
        <SuccessView theme={theme} info={result} onClose={onClose} />
      ) : step === 'loading' ? (
        <CenterMessage theme={theme} title="Création du paiement..." subtitle="Connexion sécurisée à Stripe." />
      ) : step === 'processing' ? (
        <CenterMessage theme={theme} title="Traitement en cours..." subtitle="Votre banque vérifie la transaction." />
      ) : step === 'finalizing' ? (
        <CenterMessage theme={theme} title="Finalisation..." subtitle="Mise à jour de votre solde SMS." />
      ) : (
        // IDLE — formulaire complet Amazon-like
        <>
          <AmountField theme={theme} amount={amount} setAmount={setAmount} />
          <PaymentMethods
            theme={theme} methods={methods} loadingPm={loadingPm}
            selectedPm={selectedPm} setSelectedPm={setSelectedPm}
            defaultPm={defaultPm}
            onDelete={deleteCard} onSetDefault={setAsDefault}
          />
          {isNew && (
            <CardForm theme={theme}
              cardError={cardError} setCardError={setCardError}
              setCardReady={setCardReady}
              setCardMounted={setCardMounted}
              saveCard={saveCard} setSaveCard={setSaveCard}
            />
          )}

          {error && (
            <div style={{ padding:'10px 14px', borderRadius:10, background:'rgba(239,68,68,0.08)',
              border:'1px solid rgba(239,68,68,0.25)', marginBottom:12 }}>
              <p style={{ margin:0, fontSize:13, color:'#ef4444' }}>{error}</p>
            </div>
          )}

          <button onClick={handlePay} disabled={!canPay}
            style={{ width:'100%', padding:14, borderRadius:12, border:'none', fontWeight:800, fontSize:15,
              cursor: canPay ? 'pointer' : 'not-allowed',
              background: canPay ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : (isDark?'rgba(255,255,255,0.08)':theme.border),
              color: canPay ? 'white' : theme.muted,
              boxShadow: canPay ? '0 6px 16px rgba(99,102,241,0.35)' : 'none' }}>
            {submitting
              ? 'Traitement...'
              : !amountOk
                ? 'Montant minimum : 5 EUR'
                : isNew && !cardAllMounted
                  ? 'Chargement du formulaire...'
                  : isNew && !cardComplete
                    ? 'Complétez les infos de carte'
                    : `Payer ${numAmt.toFixed(2)} EUR`}
          </button>
          <p style={{ margin:'10px 0 0', fontSize:10, textAlign:'center', color:theme.muted }}>
            🔒 Paiement sécurisé Stripe · 3D Secure · aucune donnée carte stockée chez nous
          </p>
        </>
      )}
    </ModalShell>
  );
}

// ── Sous-composants UI ──────────────────────────────────────────────────────

function StepBar({ step, theme }) {
  const idx = STEPS.findIndex(s => s.id === step);
  return (
    <>
      <div style={{ display:'flex', gap:4, marginBottom:10 }}>
        {STEPS.map((s, i) => {
          const done   = i < idx;
          const active = i === idx;
          const color  = (s.id === 'success' && active) ? '#10b981'
                       : (active || done) ? '#6366f1' : theme.border;
          return (
            <div key={s.id} style={{
              flex:1, height:6, borderRadius:3, background:color,
              opacity: done || active ? 1 : 0.4, transition:'all 0.3s',
            }} />
          );
        })}
      </div>
      <p style={{ margin:'0 0 16px', fontSize:11, fontWeight:700, color:theme.muted, textAlign:'center',
        textTransform:'uppercase', letterSpacing:'0.08em' }}>
        {STEPS[Math.max(0, idx)]?.label || STEPS[0].label}
      </p>
    </>
  );
}

function CenterMessage({ theme, title, subtitle }) {
  return (
    <div style={{ padding:'28px 8px 6px', textAlign:'center' }}>
      <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
        <div style={{ width:36, height:36, borderRadius:'50%',
          border:`3px solid ${theme.border}`, borderTopColor:'#6366f1',
          animation:'ffsp 0.9s linear infinite' }} />
      </div>
      <p style={{ margin:0, fontSize:16, fontWeight:800, color:theme.text }}>{title}</p>
      {subtitle && <p style={{ margin:'6px 0 0', fontSize:13, color:theme.muted }}>{subtitle}</p>}
      <style>{`@keyframes ffsp { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function AmountField({ theme, amount, setAmount }) {
  const isDark = theme.mode === 'dark';
  return (
    <div style={{ padding:'14px 16px', borderRadius:14, border:`1px solid ${theme.border}`,
      background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', marginBottom:14 }}>
      <label style={{ fontSize:11, fontWeight:700, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>Montant</label>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:6 }}>
        <input type="number" min="5" step="1" value={amount} onChange={e => setAmount(e.target.value)}
          style={{ flex:1, fontSize:24, fontWeight:800, border:'none', outline:'none',
            background:'transparent', color:theme.text, padding:0 }} />
        <span style={{ fontWeight:800, color:theme.muted, fontSize:16 }}>EUR</span>
      </div>
      <div style={{ display:'flex', gap:6, marginTop:10 }}>
        {[10, 20, 50, 100].map(v => {
          const active = String(amount) === String(v);
          return (
            <button key={v} onClick={() => setAmount(String(v))}
              style={{ flex:1, padding:'6px 0', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                border:`1px solid ${active ? '#6366f1' : theme.border}`,
                background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: active ? '#6366f1' : theme.muted }}>
              {v}€
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PaymentMethods({ theme, methods, loadingPm, selectedPm, setSelectedPm, defaultPm, onDelete, onSetDefault }) {
  const isDark = theme.mode === 'dark';
  const brandLabel = (b) => ({ visa:'Visa', mastercard:'Mastercard', amex:'Amex',
    discover:'Discover', jcb:'JCB', unionpay:'UnionPay' }[b] || (b || 'Carte'));

  return (
    <>
      <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:700, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
        Moyen de paiement
      </p>
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
        {loadingPm && <p style={{ margin:0, fontSize:13, color:theme.muted }}>Chargement des cartes...</p>}
        {!loadingPm && methods.map(pm => {
          const active = selectedPm === pm.id;
          const isDefault = defaultPm === pm.id;
          return (
            <div key={pm.id} onClick={() => setSelectedPm(pm.id)}
              style={{ padding:'12px 14px', borderRadius:12, cursor:'pointer',
                border:`2px solid ${active ? '#6366f1' : theme.border}`,
                background: active ? 'rgba(99,102,241,0.06)' : (isDark ? 'rgba(255,255,255,0.03)' : '#fff'),
                display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:40, height:28, borderRadius:6, background:'#111', color:'white',
                fontSize:9, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {brandLabel(pm.brand).toUpperCase().slice(0,4)}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:14, fontWeight:700, color:theme.text, fontFamily:'monospace' }}>
                  •••• {pm.last4}
                </p>
                <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>
                  {brandLabel(pm.brand)} · {String(pm.exp_month).padStart(2,'0')}/{String(pm.exp_year).slice(-2)}
                  {isDefault && <span style={{ marginLeft:6, padding:'1px 6px', borderRadius:5,
                    background:'rgba(16,185,129,0.14)', color:'#10b981', fontWeight:700 }}>Par défaut</span>}
                </p>
              </div>
              {!isDefault && (
                <button onClick={(e) => { e.stopPropagation(); onSetDefault(pm.id); }}
                  style={{ background:'transparent', border:`1px solid ${theme.border}`,
                    color:theme.muted, fontSize:10, padding:'3px 8px', borderRadius:6, cursor:'pointer' }}>
                  Par défaut
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); onDelete(pm.id); }} aria-label="Supprimer"
                style={{ background:'transparent', border:'none', color:'#ef4444',
                  fontSize:18, cursor:'pointer', padding:4, lineHeight:1 }}>×</button>
            </div>
          );
        })}
        <div onClick={() => setSelectedPm('new')}
          style={{ padding:'12px 14px', borderRadius:12, cursor:'pointer',
            border:`2px dashed ${selectedPm==='new' ? '#6366f1' : theme.border}`,
            background: selectedPm==='new' ? 'rgba(99,102,241,0.06)' : 'transparent',
            display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:40, height:28, borderRadius:6, background: isDark?'rgba(255,255,255,0.06)':'#f1f5f9',
            color: selectedPm==='new' ? '#6366f1' : theme.muted, fontSize:20, fontWeight:700,
            display:'flex', alignItems:'center', justifyContent:'center' }}>+</div>
          <p style={{ margin:0, fontSize:14, fontWeight:700, color:theme.text }}>Nouvelle carte</p>
        </div>
      </div>
    </>
  );
}

function CardForm({ theme, cardError, setCardError, setCardReady, setCardMounted, saveCard, setSaveCard }) {
  const isDark = theme.mode === 'dark';
  // Options Stripe figées (memoisées) pour éviter les re-montages intempestifs
  const baseStyle = useMemo(() => ({
    style: {
      base: {
        fontSize: '16px',
        color: isDark ? '#f1f5f9' : '#0f172a',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        '::placeholder': { color: isDark ? '#64748b' : '#94a3b8' },
      },
      invalid: { color: '#ef4444' },
    },
  }), [isDark]);
  const numberOpts = useMemo(() => ({ ...baseStyle, showIcon: true, placeholder: '1234 1234 1234 1234' }), [baseStyle]);
  const expiryOpts = useMemo(() => ({ ...baseStyle, placeholder: 'MM / AA' }), [baseStyle]);
  const cvcOpts    = useMemo(() => ({ ...baseStyle, placeholder: '123' }), [baseStyle]);

  const fieldWrap = {
    padding: '12px 14px',
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: isDark ? 'rgba(255,255,255,0.04)' : '#fff',
  };
  const label = {
    display: 'block', fontSize: 11, fontWeight: 700, color: theme.muted,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
  };

  const handleChange = (field) => (e) => {
    setCardReady(prev => ({ ...prev, [field]: e.complete }));
    setCardError(e.error ? e.error.message : null);
  };
  const handleReady = (field) => () => {
    setCardMounted(prev => ({ ...prev, [field]: true }));
  };

  return (
    <div style={{ padding:'14px 14px 12px', borderRadius:14, border:`1px solid ${theme.border}`,
      background: isDark ? 'rgba(255,255,255,0.02)' : '#fafbfc', marginBottom:14 }}>
      <p style={{ margin:'0 0 12px', fontSize:12, fontWeight:800, color:theme.text,
        textTransform:'uppercase', letterSpacing:'0.06em' }}>Informations de carte</p>

      <label style={label}>Numéro de carte</label>
      <div style={{ ...fieldWrap, marginBottom:10 }}>
        <CardNumberElement options={numberOpts}
          onChange={handleChange('number')} onReady={handleReady('number')} />
      </div>

      <div style={{ display:'flex', gap:10 }}>
        <div style={{ flex:1 }}>
          <label style={label}>Expiration</label>
          <div style={fieldWrap}>
            <CardExpiryElement options={expiryOpts}
              onChange={handleChange('expiry')} onReady={handleReady('expiry')} />
          </div>
        </div>
        <div style={{ flex:1 }}>
          <label style={label}>CVC</label>
          <div style={fieldWrap}>
            <CardCvcElement options={cvcOpts}
              onChange={handleChange('cvc')} onReady={handleReady('cvc')} />
          </div>
        </div>
      </div>

      {cardError && (
        <p style={{ margin:'10px 0 0', fontSize:12, color:'#ef4444', fontWeight:600 }}>{cardError}</p>
      )}

      <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:theme.text,
        marginTop:14, cursor:'pointer' }}>
        <input type="checkbox" checked={saveCard} onChange={e => setSaveCard(e.target.checked)} />
        Enregistrer cette carte pour les prochaines recharges
      </label>
    </div>
  );
}

function SuccessView({ theme, info, onClose }) {
  return (
    <div style={{ padding:'18px 8px 0', textAlign:'center' }}>
      <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(16,185,129,0.12)',
        display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16,
        border:'2px solid rgba(16,185,129,0.25)' }}>
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h3 style={{ margin:'0 0 6px', fontSize:22, fontWeight:900, color:theme.text }}>Recharge approuvée</h3>
      <p style={{ margin:'0 0 18px', fontSize:13, color:theme.muted }}>Votre solde SMS a été crédité.</p>
      <div style={{ display:'flex', gap:10, marginBottom:18 }}>
        <div style={{ flex:1, padding:'14px 10px', borderRadius:14, background:'rgba(16,185,129,0.08)',
          border:'1px solid rgba(16,185,129,0.25)' }}>
          <p style={{ margin:0, fontSize:10, fontWeight:800, color:'#10b981', textTransform:'uppercase', letterSpacing:'0.06em' }}>Nouveau solde</p>
          <p style={{ margin:'4px 0 0', fontSize:20, fontWeight:900, color:theme.text, fontFamily:'monospace' }}>{info.new_balance} €</p>
        </div>
        <div style={{ flex:1, padding:'14px 10px', borderRadius:14, background:'rgba(99,102,241,0.08)',
          border:'1px solid rgba(99,102,241,0.25)' }}>
          <p style={{ margin:0, fontSize:10, fontWeight:800, color:'#6366f1', textTransform:'uppercase', letterSpacing:'0.06em' }}>SMS disponibles</p>
          <p style={{ margin:'4px 0 0', fontSize:20, fontWeight:900, color:theme.text, fontFamily:'monospace' }}>≈ {info.new_sms_estimated}</p>
        </div>
      </div>
      <button onClick={onClose}
        style={{ width:'100%', padding:13, borderRadius:12, border:'none', fontWeight:800, fontSize:14,
          background:'#10b981', color:'white', cursor:'pointer',
          boxShadow:'0 6px 16px rgba(16,185,129,0.35)' }}>
        Fermer
      </button>
    </div>
  );
}
