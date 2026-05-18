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
import { Confirm } from './UI';

// ── Cle publique Stripe (env Vite) ──────────────────────────────────────────
const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
let stripePromise = null;
function getStripeSingleton() {
  if (!stripePromise && STRIPE_PK) stripePromise = loadStripe(STRIPE_PK);
  return stripePromise;
}

export default function SMSRechargeModal({ open, theme, onClose, onSuccess, showToast }) {
  const stripe = getStripeSingleton();
  const elementsOptions = useMemo(() => ({
    appearance: {
      theme: theme.mode === 'dark' ? 'night' : 'stripe',
      variables: { colorPrimary: theme.text || '#111827', borderRadius: '8px', fontSizeBase: '14px' },
    },
  }), [theme.mode, theme.text]);

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
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 300,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
        }}
      />
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 460,
        background: theme.elevated || theme.card,
        borderRadius: 16,
        border: `0.5px solid ${theme.border}`,
        padding: '24px 22px',
        maxHeight: '92vh',
        overflowY: 'auto',
        boxShadow: theme.shadowModal || '0 20px 60px rgba(0,0,0,0.14)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: theme.muted }}>
              Recharge SMS
            </p>
            <h2 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 500, color: theme.text }}>
              Paiement securise
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: `0.5px solid ${theme.border}`,
              cursor: 'pointer',
              background: 'transparent',
              color: theme.muted,
              fontSize: 15,
              fontFamily: 'inherit',
            }}
          >✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfigMissing({ theme }) {
  return (
    <div style={{ padding: '16px 8px', textAlign: 'left' }}>
      <div style={{
        padding: '12px 14px',
        borderRadius: 8,
        background: '#fffbeb',
        borderLeft: '2px solid #f59e0b',
      }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#92400e' }}>
          Stripe non configure
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
          La variable{' '}
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>VITE_STRIPE_PUBLISHABLE_KEY</span>
          {' '}doit être definie dans l{"'"}environnement Vercel.
        </p>
      </div>
    </div>
  );
}

// ── Etapes du paiement ──────────────────────────────────────────────────────
const STEPS = [
  { id: 'idle',       label: 'Informations' },
  { id: 'loading',    label: 'Creation du paiement' },
  { id: 'processing', label: 'Traitement' },
  { id: 'finalizing', label: 'Finalisation' },
  { id: 'success',    label: 'Recharge approuvee' },
];

function RechargeInner({ theme, onClose, onSuccess, showToast }) {
  const stripe   = useStripe();
  const elements = useElements();

  const [step, setStep]             = useState('idle');
  const [amount, setAmount]         = useState('20');
  const [methods, setMethods]       = useState([]);
  const [defaultPm, setDefaultPm]   = useState(null);
  const [selectedPm, setSelectedPm] = useState(null);
  const [loadingPm, setLoadingPm]   = useState(true);
  const [saveCard, setSaveCard]     = useState(true);
  const [cardReady, setCardReady]   = useState({ number: false, expiry: false, cvc: false });
  const [cardMounted, setCardMounted] = useState({ number: false, expiry: false, cvc: false });
  const [cardError, setCardError]   = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [result, setResult]         = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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

  useEffect(() => {
    setCardReady({ number: false, expiry: false, cvc: false });
    setCardMounted({ number: false, expiry: false, cvc: false });
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
      let paymentMethodId = isNew ? null : selectedPm;
      if (isNew) {
        const cardEl = elements.getElement(CardNumberElement);
        if (!cardEl) throw new Error('Formulaire de carte non charge, reessayez.');
        const { paymentMethod, error: pmErr } = await stripe.createPaymentMethod({
          type: 'card', card: cardEl,
        });
        if (pmErr) { setCardError(pmErr.message); throw pmErr; }
        paymentMethodId = paymentMethod.id;
      }

      setStep('loading');

      const r = await paymentsApi.createIntent({
        amount: numAmt,
        payment_method_id: paymentMethodId,
        save_card: isNew && saveCard,
        new_card: isNew,
      });

      setStep('processing');
      if (r.status === 'requires_action' || r.status === 'requires_confirmation') {
        const { error: confErr, paymentIntent } = await stripe.confirmCardPayment(r.client_secret);
        if (confErr) throw new Error(confErr.message);
        if (paymentIntent.status !== 'succeeded')
          throw new Error('Statut inattendu : ' + paymentIntent.status);
      } else if (r.status !== 'succeeded') {
        throw new Error('Statut inattendu : ' + r.status);
      }

      setStep('finalizing');
      const verified = await paymentsApi.verifyIntent(r.intent_id);

      setResult(verified);
      setStep('success');
      onSuccess?.(verified);
      await reload();
    } catch (e) {
      setError(e.message || 'Erreur de paiement');
      setStep('idle');
    } finally { setSubmitting(false); }
  }

  function deleteCard(id) { setConfirmDeleteId(id); }
  async function doDeleteCard() {
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    if (!id) return;
    try { await paymentsApi.deletePaymentMethod(id); await reload(); showToast?.('Carte supprimee'); }
    catch (e) { showToast?.(e.message, 'error'); }
  }
  async function setAsDefault(id) {
    try { await paymentsApi.setDefaultPaymentMethod(id); await reload(); showToast?.('Carte par defaut mise a jour'); }
    catch (e) { showToast?.(e.message, 'error'); }
  }

  return (
    <ModalShell theme={theme} onClose={onClose}>
      <StepBar step={step} theme={theme} />
      <Confirm
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={doDeleteCard}
        title="Supprimer la carte"
        message="Cette carte enregistree sera definitivement supprimee."
        danger
        theme={theme}
      />

      {step === 'success' && result ? (
        <SuccessView theme={theme} info={result} onClose={onClose} />
      ) : step === 'loading' ? (
        <CenterMessage theme={theme} title="Creation du paiement..." subtitle="Connexion securisee a Stripe." />
      ) : step === 'processing' ? (
        <CenterMessage theme={theme} title="Traitement en cours..." subtitle="Votre banque verifie la transaction." />
      ) : step === 'finalizing' ? (
        <CenterMessage theme={theme} title="Finalisation..." subtitle="Mise a jour de votre solde SMS." />
      ) : (
        <>
          <AmountField theme={theme} amount={amount} setAmount={setAmount} />
          <PaymentMethods
            theme={theme} methods={methods} loadingPm={loadingPm}
            selectedPm={selectedPm} setSelectedPm={setSelectedPm}
            defaultPm={defaultPm}
            onDelete={deleteCard} onSetDefault={setAsDefault}
          />
          {isNew && (
            <CardForm
              theme={theme}
              cardError={cardError} setCardError={setCardError}
              setCardReady={setCardReady}
              setCardMounted={setCardMounted}
              saveCard={saveCard} setSaveCard={setSaveCard}
            />
          )}

          {error && (
            <div style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: '#fef2f2',
              borderLeft: '2px solid #ef4444',
              marginBottom: 12,
            }}>
              <p style={{ margin: 0, fontSize: 12, color: '#991b1b', fontWeight: 500 }}>{error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handlePay}
            disabled={!canPay}
            style={{
              width: '100%',
              padding: 13,
              borderRadius: 8,
              border: 'none',
              fontWeight: 500,
              fontSize: 14,
              cursor: canPay ? 'pointer' : 'not-allowed',
              background: canPay ? theme.text : theme.cardAlt,
              color: canPay ? theme.bg : theme.muted,
              opacity: canPay ? 1 : 0.6,
              fontFamily: 'inherit',
            }}
          >
            {submitting
              ? 'Traitement...'
              : !amountOk
                ? 'Montant minimum : 5 EUR'
                : isNew && !cardAllMounted
                  ? 'Chargement du formulaire...'
                  : isNew && !cardComplete
                    ? 'Completez les infos de carte'
                    : `Payer ${numAmt.toFixed(2)} EUR`}
          </button>
          <p style={{
            margin: '10px 0 0',
            fontSize: 11,
            textAlign: 'center',
            color: theme.muted,
            lineHeight: 1.5,
          }}>
            Paiement securise Stripe · 3D Secure · aucune donnee carte stockee chez nous
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {STEPS.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          const success = s.id === 'success' && active;
          const color = success ? '#10b981' : (active || done) ? theme.text : theme.border;
          return (
            <div
              key={s.id}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 99,
                background: color,
                opacity: done || active ? 1 : 0.4,
                transition: 'all 0.3s',
              }}
            />
          );
        })}
      </div>
      <p style={{
        margin: '0 0 16px',
        fontSize: 11,
        fontWeight: 500,
        color: theme.muted,
        textAlign: 'center',
      }}>
        {STEPS[Math.max(0, idx)]?.label || STEPS[0].label}
      </p>
    </>
  );
}

function CenterMessage({ theme, title, subtitle }) {
  return (
    <div style={{ padding: '24px 8px 6px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: `0.5px solid ${theme.border}`,
          borderTopColor: theme.text,
          animation: 'ffsp 0.9s linear infinite',
        }} />
      </div>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: theme.text }}>{title}</p>
      {subtitle && <p style={{ margin: '6px 0 0', fontSize: 12, color: theme.muted }}>{subtitle}</p>}
      <style>{`@keyframes ffsp { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function AmountField({ theme, amount, setAmount }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 12,
      border: `0.5px solid ${theme.border}`,
      background: theme.cardAlt,
      marginBottom: 14,
    }}>
      <label style={{
        fontSize: 11,
        fontWeight: 500,
        color: theme.muted,
      }}>Montant</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <input
          type="number"
          min="5"
          step="1"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{
            flex: 1,
            fontSize: 22,
            fontWeight: 500,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: theme.text,
            padding: 0,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        />
        <span style={{ fontWeight: 500, color: theme.muted, fontSize: 14 }}>EUR</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {[10, 20, 50, 100].map(v => {
          const active = String(amount) === String(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(String(v))}
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                border: `0.5px solid ${active ? theme.borderStrong : theme.border}`,
                background: active ? theme.card : 'transparent',
                color: active ? theme.text : theme.muted,
                fontFamily: 'inherit',
              }}
            >
              {v} €
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PaymentMethods({ theme, methods, loadingPm, selectedPm, setSelectedPm, defaultPm, onDelete, onSetDefault }) {
  const brandLabel = (b) => ({
    visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex',
    discover: 'Discover', jcb: 'JCB', unionpay: 'UnionPay',
  }[b] || (b || 'Carte'));

  return (
    <>
      <p style={{
        margin: '0 0 8px',
        fontSize: 11,
        fontWeight: 500,
        color: theme.muted,
      }}>
        Moyen de paiement
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {loadingPm && <p style={{ margin: 0, fontSize: 13, color: theme.muted }}>Chargement des cartes...</p>}
        {!loadingPm && methods.map(pm => {
          const active = selectedPm === pm.id;
          const isDefault = defaultPm === pm.id;
          return (
            <div
              key={pm.id}
              onClick={() => setSelectedPm(pm.id)}
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                cursor: 'pointer',
                border: `0.5px solid ${active ? theme.borderStrong : theme.border}`,
                background: active ? theme.cardAlt : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{
                width: 40,
                height: 28,
                borderRadius: 6,
                background: theme.text,
                color: theme.bg,
                fontSize: 9,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {brandLabel(pm.brand).toUpperCase().slice(0, 4)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 500,
                  color: theme.text,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}>
                  •••• {pm.last4}
                </p>
                <p style={{
                  margin: '2px 0 0',
                  fontSize: 11,
                  color: theme.muted,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                }}>
                  {brandLabel(pm.brand)} · {String(pm.exp_month).padStart(2, '0')}/{String(pm.exp_year).slice(-2)}
                  {isDefault && (
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: 8,
                      background: '#f0fdf4',
                      color: '#065f46',
                      fontWeight: 500,
                    }}>
                      Par defaut
                    </span>
                  )}
                </p>
              </div>
              {!isDefault && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSetDefault(pm.id); }}
                  style={{
                    background: 'transparent',
                    border: `0.5px solid ${theme.border}`,
                    color: theme.muted,
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '4px 8px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Par defaut
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(pm.id); }}
                aria-label="Supprimer"
                style={{
                  background: 'transparent',
                  border: '0.5px solid rgba(239,68,68,0.3)',
                  color: '#991b1b',
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: 0,
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'inherit',
                }}
              >✕</button>
            </div>
          );
        })}
        <div
          onClick={() => setSelectedPm('new')}
          style={{
            padding: '12px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            border: `0.5px dashed ${selectedPm === 'new' ? theme.borderStrong : theme.border}`,
            background: selectedPm === 'new' ? theme.cardAlt : 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{
            width: 40,
            height: 28,
            borderRadius: 6,
            background: theme.cardAlt,
            color: theme.muted,
            fontSize: 18,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>+</div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: theme.text }}>
            Nouvelle carte
          </p>
        </div>
      </div>
    </>
  );
}

function CardForm({ theme, cardError, setCardError, setCardReady, setCardMounted, saveCard, setSaveCard }) {
  const isDark = theme.mode === 'dark';
  const baseStyle = useMemo(() => ({
    style: {
      base: {
        fontSize: '15px',
        color: isDark ? '#e6edf3' : '#111827',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        '::placeholder': { color: isDark ? '#768390' : '#9CA3AF' },
      },
      invalid: { color: '#ef4444' },
    },
  }), [isDark]);
  const numberOpts = useMemo(() => ({ ...baseStyle, showIcon: true, placeholder: '1234 1234 1234 1234' }), [baseStyle]);
  const expiryOpts = useMemo(() => ({ ...baseStyle, placeholder: 'MM / AA' }), [baseStyle]);
  const cvcOpts    = useMemo(() => ({ ...baseStyle, placeholder: '123' }), [baseStyle]);

  const fieldWrap = {
    padding: '11px 14px',
    borderRadius: 8,
    border: `0.5px solid ${theme.borderInput}`,
    background: theme.inputBg,
  };
  const label = {
    display: 'block',
    fontSize: 11,
    fontWeight: 500,
    color: theme.muted,
    marginBottom: 5,
  };

  const handleChange = (field) => (e) => {
    setCardReady(prev => ({ ...prev, [field]: e.complete }));
    setCardError(e.error ? e.error.message : null);
  };
  const handleReady = (field) => () => {
    setCardMounted(prev => ({ ...prev, [field]: true }));
  };

  return (
    <div style={{
      padding: '14px',
      borderRadius: 12,
      border: `0.5px solid ${theme.border}`,
      background: theme.cardAlt,
      marginBottom: 14,
    }}>
      <p style={{
        margin: '0 0 12px',
        fontSize: 12,
        fontWeight: 500,
        color: theme.text,
      }}>Informations de carte</p>

      <label style={label}>Numero de carte</label>
      <div style={{ ...fieldWrap, marginBottom: 10 }}>
        <CardNumberElement options={numberOpts} onChange={handleChange('number')} onReady={handleReady('number')} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={label}>Expiration</label>
          <div style={fieldWrap}>
            <CardExpiryElement options={expiryOpts} onChange={handleChange('expiry')} onReady={handleReady('expiry')} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={label}>CVC</label>
          <div style={fieldWrap}>
            <CardCvcElement options={cvcOpts} onChange={handleChange('cvc')} onReady={handleReady('cvc')} />
          </div>
        </div>
      </div>

      {cardError && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#991b1b', fontWeight: 500 }}>
          {cardError}
        </p>
      )}

      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: theme.text,
        marginTop: 14,
        cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={saveCard}
          onChange={e => setSaveCard(e.target.checked)}
        />
        Enregistrer cette carte pour les prochaines recharges
      </label>
    </div>
  );
}

function SuccessView({ theme, info, onClose }) {
  return (
    <div style={{ padding: '16px 8px 0', textAlign: 'center' }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: 16,
        background: '#f0fdf4',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
        color: '#10b981',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 500, color: theme.text }}>
        Recharge approuvee
      </h3>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: theme.muted }}>
        Votre solde SMS a ete credite.
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={{
          flex: 1,
          padding: '12px 10px',
          borderRadius: 8,
          background: '#f0fdf4',
          borderLeft: '2px solid #10b981',
          textAlign: 'left',
        }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: '#065f46' }}>
            Nouveau solde
          </p>
          <p style={{
            margin: '4px 0 0',
            fontSize: 18,
            fontWeight: 500,
            color: '#065f46',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}>{info.new_balance} €</p>
        </div>
        <div style={{
          flex: 1,
          padding: '12px 10px',
          borderRadius: 8,
          background: '#eef2ff',
          borderLeft: '2px solid #6366f1',
          textAlign: 'left',
        }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: '#4338ca' }}>
            SMS disponibles
          </p>
          <p style={{
            margin: '4px 0 0',
            fontSize: 18,
            fontWeight: 500,
            color: '#4338ca',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}>≈ {info.new_sms_estimated}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{
          width: '100%',
          padding: 12,
          borderRadius: 8,
          border: 'none',
          fontWeight: 500,
          fontSize: 14,
          background: theme.text,
          color: theme.bg,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Fermer
      </button>
    </div>
  );
}
