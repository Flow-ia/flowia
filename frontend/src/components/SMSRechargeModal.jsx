import { useEffect, useMemo, useState, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { paymentsApi } from '../utils/api';

// Clé publique Stripe — via env Vite
const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
let stripePromise = null;
function getStripeSingleton() {
  if (!stripePromise && STRIPE_PK) stripePromise = loadStripe(STRIPE_PK);
  return stripePromise;
}

// Étapes visibles pour le commerçant
const STEPS = [
  { id: 'idle',       label: 'Montant' },
  { id: 'loading',    label: 'Chargement du paiement' },
  { id: 'processing', label: 'Traitement en cours' },
  { id: 'finalizing', label: 'Finalisation' },
  { id: 'success',    label: 'Recharge approuvée' },
];

export default function SMSRechargeModal({ open, theme, onClose, onSuccess, showToast }) {
  const [step, setStep]         = useState('idle');
  const [amount, setAmount]     = useState('20');
  const [methods, setMethods]   = useState([]);
  const [defaultPm, setDefault] = useState(null);
  const [loadingPm, setLoadingPm] = useState(true);
  const [selectedPm, setSelectedPm] = useState(null);   // id ou 'new'
  const [saveCard, setSaveCard] = useState(true);
  const [clientSecret, setClientSecret] = useState(null);
  const [intentId, setIntentId] = useState(null);
  const [estimatedSms, setEstimatedSms] = useState(0);
  const [creditedInfo, setCreditedInfo] = useState(null);
  const [error, setError]       = useState(null);

  const reload = useCallback(async () => {
    setLoadingPm(true);
    try {
      const r = await paymentsApi.listPaymentMethods();
      setMethods(r.methods || []);
      setDefault(r.default || null);
      const first = (r.methods && r.methods[0]) ? r.methods[0].id : 'new';
      setSelectedPm(r.default || first);
    } catch {
      setMethods([]); setSelectedPm('new');
    } finally { setLoadingPm(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep('idle'); setError(null); setClientSecret(null); setCreditedInfo(null);
    reload();
  }, [open, reload]);

  const numAmt = parseFloat(amount) || 0;
  const canPay = numAmt >= 5 && !!selectedPm;

  // Démarre le process : création du PaymentIntent
  const start = async () => {
    if (!canPay) return;
    setError(null); setStep('loading');
    try {
      const isNewCard = selectedPm === 'new';
      const body = { amount: numAmt };
      if (!isNewCard) body.payment_method_id = selectedPm;
      body.save_card = isNewCard && saveCard;

      const r = await paymentsApi.createIntent(body);
      setEstimatedSms(r.estimated_sms || 0);
      setIntentId(r.intent_id);

      if (isNewCard) {
        // Flux carte neuve → PaymentElement confirme côté client
        setClientSecret(r.client_secret);
        setStep('processing');
      } else {
        // Flux carte enregistrée → server a déjà confirm off_session
        if (r.status === 'succeeded') {
          setStep('finalizing');
          const v = await paymentsApi.verifyIntent(r.intent_id);
          setCreditedInfo(v);
          setStep('success');
          onSuccess?.(v);
        } else if (r.status === 'requires_action') {
          // SCA requis — on passe par PaymentElement pour handleNextAction
          setClientSecret(r.client_secret);
          setStep('processing');
        } else {
          throw new Error('Statut paiement inattendu : ' + r.status);
        }
      }
    } catch(e) {
      setError(e.message || 'Erreur paiement');
      setStep('idle');
    }
  };

  const stripeInstance = getStripeSingleton();

  const isDark = theme.mode === 'dark';
  if (!open) return null;
  const bg = isDark ? '#161622' : '#ffffff';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={step === 'success' || step === 'idle' ? onClose : undefined}
        style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(12px)' }} />

      <div style={{ position:'relative', width:'100%', maxWidth:460, background:bg, borderRadius:24,
        border:`1px solid ${theme.border}`, padding:'28px 26px', maxHeight:'92vh', overflowY:'auto',
        boxShadow:'0 30px 80px rgba(0,0,0,0.45)' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div>
            <p style={{ margin:0, fontSize:12, fontWeight:800, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>Recharge SMS</p>
            <h2 style={{ margin:'4px 0 0', fontSize:22, fontWeight:900, color:theme.text }}>Paiement sécurisé</h2>
          </div>
          <button onClick={onClose} aria-label="Fermer"
            style={{ width:34, height:34, borderRadius:10, border:'none', cursor:'pointer',
              background:isDark?'rgba(255,255,255,0.06)':'#f1f5f9', color:theme.muted, fontSize:18 }}>×</button>
        </div>

        {/* Stepper */}
        <StepBar step={step} theme={theme} />

        {step === 'idle' && (
          <IdleView
            theme={theme} amount={amount} setAmount={setAmount}
            methods={methods} loadingPm={loadingPm}
            selectedPm={selectedPm} setSelectedPm={setSelectedPm}
            saveCard={saveCard} setSaveCard={setSaveCard}
            onReload={reload} onStart={start} canPay={canPay}
            defaultPm={defaultPm} error={error}
            showToast={showToast}
          />
        )}

        {step === 'loading' && (
          <CenterMessage theme={theme} icon="⏳" title="Création du paiement..." subtitle="Connexion sécurisée à Stripe." />
        )}

        {step === 'processing' && clientSecret && stripeInstance && (
          <Elements stripe={stripeInstance} options={{
            clientSecret,
            appearance: { theme: isDark ? 'night' : 'stripe',
              variables: { colorPrimary: '#6366f1', borderRadius: '12px' } },
          }}>
            <NewCardConfirm
              theme={theme} clientSecret={clientSecret} intentId={intentId}
              onProcessing={() => setStep('processing')}
              onFinalizing={() => setStep('finalizing')}
              onSuccess={async (pi) => {
                try {
                  const v = await paymentsApi.verifyIntent(pi.id);
                  setCreditedInfo(v);
                  setStep('success');
                  onSuccess?.(v);
                } catch(e) { setError(e.message); setStep('idle'); }
              }}
              onError={(msg) => { setError(msg); setStep('idle'); }}
            />
          </Elements>
        )}

        {step === 'finalizing' && (
          <CenterMessage theme={theme} icon="🔄" title="Finalisation..." subtitle="Mise à jour de votre solde SMS." />
        )}

        {step === 'success' && creditedInfo && (
          <SuccessView theme={theme} info={creditedInfo} estimatedSms={estimatedSms} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

// ── Sous-composants ─────────────────────────────────────────────────────────

function StepBar({ step, theme }) {
  const idx = STEPS.findIndex(s => s.id === step);
  return (
    <div style={{ display:'flex', gap:4, marginBottom:22 }}>
      {STEPS.map((s, i) => {
        const done   = i < idx;
        const active = i === idx;
        const color  = s.id === 'success' && active ? '#10b981'
                     : active ? '#6366f1'
                     : done   ? '#6366f1'
                     : theme.border;
        return (
          <div key={s.id} title={s.label} style={{
            flex:1, height:6, borderRadius:3, background: color,
            opacity: done || active ? 1 : 0.4,
            transition:'background 0.3s, opacity 0.3s',
          }} />
        );
      })}
    </div>
  );
}

function CenterMessage({ theme, icon, title, subtitle }) {
  return (
    <div style={{ padding:'30px 16px', textAlign:'center' }}>
      <div style={{ fontSize:42, marginBottom:14 }}>{icon}</div>
      <p style={{ margin:0, fontSize:16, fontWeight:800, color:theme.text }}>{title}</p>
      {subtitle && <p style={{ margin:'6px 0 0', fontSize:13, color:theme.muted }}>{subtitle}</p>}
      <div style={{ marginTop:22, display:'flex', justifyContent:'center' }}>
        <div style={{ width:28, height:28, borderRadius:'50%', border:`3px solid ${theme.border}`,
          borderTopColor:'#6366f1', animation:'spin 0.9s linear infinite' }} />
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function IdleView({ theme, amount, setAmount, methods, loadingPm, selectedPm, setSelectedPm,
  saveCard, setSaveCard, onReload, onStart, canPay, defaultPm, error, showToast }) {
  const isDark = theme.mode === 'dark';

  const brandLabel = (b) => ({ visa:'Visa', mastercard:'Mastercard', amex:'Amex',
    discover:'Discover', jcb:'JCB', unionpay:'UnionPay' }[b] || (b || 'Carte'));

  const deleteCard = async (id) => {
    if (!confirm('Supprimer cette carte ?')) return;
    try { await paymentsApi.deletePaymentMethod(id); await onReload(); showToast?.('Carte supprimée'); }
    catch(e) { showToast?.(e.message, 'error'); }
  };
  const setAsDefault = async (id) => {
    try { await paymentsApi.setDefaultPaymentMethod(id); await onReload(); showToast?.('Carte par défaut'); }
    catch(e) { showToast?.(e.message, 'error'); }
  };

  return (
    <>
      {/* Montant */}
      <div style={{ padding:'14px 16px', borderRadius:14, border:`1px solid ${theme.border}`,
        background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', marginBottom:14 }}>
        <label style={{ fontSize:11, fontWeight:700, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>Montant</label>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:6 }}>
          <input type="number" min="5" step="1" value={amount} onChange={e => setAmount(e.target.value)}
            style={{ flex:1, fontSize:22, fontWeight:800, border:'none', outline:'none',
              background:'transparent', color:theme.text, padding:0 }} />
          <span style={{ fontWeight:800, color:theme.muted }}>EUR</span>
        </div>
        <div style={{ display:'flex', gap:6, marginTop:10 }}>
          {[10, 20, 50, 100].map(v => (
            <button key={v} onClick={() => setAmount(String(v))}
              style={{ flex:1, padding:'6px 0', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                border:`1px solid ${String(amount)===String(v)?'#6366f1':theme.border}`,
                background: String(amount)===String(v) ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: String(amount)===String(v) ? '#6366f1' : theme.muted }}>
              {v}€
            </button>
          ))}
        </div>
      </div>

      {/* Cartes enregistrées */}
      <p style={{ margin:'4px 0 8px', fontSize:11, fontWeight:700, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
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
                fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {brandLabel(pm.brand).toUpperCase().slice(0,4)}
              </div>
              <div style={{ flex:1 }}>
                <p style={{ margin:0, fontSize:14, fontWeight:700, color:theme.text, fontFamily:'monospace' }}>
                  •••• •••• •••• {pm.last4}
                </p>
                <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>
                  {brandLabel(pm.brand)} · exp. {String(pm.exp_month).padStart(2,'0')}/{String(pm.exp_year).slice(-2)}
                  {isDefault && <span style={{ marginLeft:6, padding:'1px 6px', borderRadius:5,
                    background:'rgba(16,185,129,0.14)', color:'#10b981', fontWeight:700 }}>Par défaut</span>}
                </p>
              </div>
              {!isDefault && (
                <button onClick={(e) => { e.stopPropagation(); setAsDefault(pm.id); }}
                  style={{ background:'transparent', border:`1px solid ${theme.border}`,
                    color:theme.muted, fontSize:10, padding:'3px 8px', borderRadius:6, cursor:'pointer' }}>
                  Par défaut
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); deleteCard(pm.id); }}
                aria-label="Supprimer"
                style={{ background:'transparent', border:'none', color:'#ef4444',
                  fontSize:16, cursor:'pointer', padding:4 }}>×</button>
            </div>
          );
        })}
        {/* Nouvelle carte */}
        <div onClick={() => setSelectedPm('new')}
          style={{ padding:'12px 14px', borderRadius:12, cursor:'pointer',
            border:`2px dashed ${selectedPm==='new' ? '#6366f1' : theme.border}`,
            background: selectedPm==='new' ? 'rgba(99,102,241,0.06)' : 'transparent',
            display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:40, height:28, borderRadius:6, background: isDark?'rgba(255,255,255,0.06)':'#f1f5f9',
            color:theme.muted, fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>+</div>
          <p style={{ margin:0, fontSize:14, fontWeight:700, color:theme.text }}>Nouvelle carte</p>
        </div>
      </div>

      {/* Option save card */}
      {selectedPm === 'new' && (
        <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:theme.text,
          marginBottom:14, cursor:'pointer' }}>
          <input type="checkbox" checked={saveCard} onChange={e => setSaveCard(e.target.checked)} />
          Enregistrer cette carte pour les prochaines recharges
        </label>
      )}

      {error && (
        <div style={{ padding:'10px 14px', borderRadius:10, background:'rgba(239,68,68,0.08)',
          border:'1px solid rgba(239,68,68,0.25)', marginBottom:12 }}>
          <p style={{ margin:0, fontSize:13, color:'#ef4444' }}>{error}</p>
        </div>
      )}

      <button onClick={onStart} disabled={!canPay}
        style={{ width:'100%', padding:14, borderRadius:12, border:'none', fontWeight:800, fontSize:15,
          cursor: canPay ? 'pointer' : 'not-allowed',
          background: canPay ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : theme.border,
          color: canPay ? 'white' : theme.muted,
          boxShadow: canPay ? '0 6px 16px rgba(99,102,241,0.35)' : 'none' }}>
        {selectedPm === 'new' ? `Payer ${parseFloat(amount||0).toFixed(2)} EUR` : `Recharger ${parseFloat(amount||0).toFixed(2)} EUR`}
      </button>
      <p style={{ margin:'10px 0 0', fontSize:10, textAlign:'center', color:theme.muted }}>
        🔒 Paiement sécurisé par Stripe · aucune donnée carte stockée sur nos serveurs
      </p>
    </>
  );
}

function NewCardConfirm({ theme, clientSecret, intentId, onProcessing, onFinalizing, onSuccess, onError }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    onProcessing?.();
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements, redirect: 'if_required',
    });
    if (error) {
      onError?.(error.message || 'Erreur de paiement');
      setSubmitting(false);
      return;
    }
    onFinalizing?.();
    if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess?.(paymentIntent);
    } else {
      onError?.('Statut inattendu : ' + paymentIntent?.status);
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={submit}>
      <PaymentElement options={{ layout: 'tabs' }} />
      <button type="submit" disabled={!stripe || submitting}
        style={{ width:'100%', padding:14, borderRadius:12, border:'none', fontWeight:800, fontSize:15,
          marginTop:16, cursor:'pointer',
          background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white',
          boxShadow:'0 6px 16px rgba(99,102,241,0.35)', opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Paiement en cours...' : 'Confirmer le paiement'}
      </button>
    </form>
  );
}

function SuccessView({ theme, info, estimatedSms, onClose }) {
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
          <p style={{ margin:'4px 0 0', fontSize:20, fontWeight:900, color:theme.text, fontFamily:'monospace' }}>≈ {info.new_sms_estimated || estimatedSms}</p>
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
