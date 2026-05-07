// src/pages/booking-page/components/StripePaymentSection.jsx
// Phase 5/5 — Bloc de paiement Stripe Elements pour Step6.
//
// Flow :
//   1. Au mount, cree un PaymentIntent cote backend (POST .../payment-intent).
//   2. Initialise Stripe (loadStripe avec connected account) avec le
//      client_secret recu.
//   3. Affiche le PaymentElement + bouton "Payer X €".
//   4. Sur confirm OK → callback onPaid(payment_intent_id) au parent.

import { useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements, PaymentElement, useStripe, useElements,
} from '@stripe/react-stripe-js';
import { pubApi } from '../../../utils/api';

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// ── Singleton Stripe par compte connecte ─────────────────────────────────
// Stripe demande loadStripe(pk, { stripeAccount }) pour les Direct Charges.
// On cache par account_id pour ne pas recharger la lib a chaque mount.
const stripePromiseCache = {};
function getStripeForAccount(accountId) {
  if (!STRIPE_PK || !accountId) return null;
  if (!stripePromiseCache[accountId]) {
    stripePromiseCache[accountId] = loadStripe(STRIPE_PK, { stripeAccount: accountId });
  }
  return stripePromiseCache[accountId];
}

// Watchdog : si stripe.confirmPayment ne resout pas en 90s (challenge
// hCaptcha bloque par extension navigateur, iframe Stripe cross-origin
// cassee, etc.), on debloque le bouton pour permettre une retry. Le PI
// reste valide cote Stripe → confirmation idempotente, pas de double-charge.
const PAY_TIMEOUT_MS = 90000;

// ── Formulaire de saisie carte (enfant Elements) ─────────────────────────
function PayForm({ th, amountCents, onPaid, onError, busy, setBusy }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [errMsg, setErrMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true); setErrMsg('');

    let settled = false;
    let watchdog = null;
    let onUnhandled = null;
    const release = (msg) => {
      if (settled) return;
      settled = true;
      if (watchdog) clearTimeout(watchdog);
      if (onUnhandled) window.removeEventListener('unhandledrejection', onUnhandled);
      if (msg) setErrMsg(msg);
      setBusy(false);
    };

    // Si le challenge anti-fraude (hCaptcha invisible declenche par Stripe
    // Radar) est casse par une extension du navigateur, le promise rejette
    // en "uncaught" sans passer par notre await → on l'attrape globalement.
    onUnhandled = (ev) => {
      const reason = ev?.reason;
      const txt = typeof reason === 'string'
        ? reason
        : (reason?.message || reason?.code || '');
      if (/challenge-?closed|hcaptcha/i.test(String(txt))) {
        release("Verification anti-fraude interrompue. Desactivez les extensions de blocage ou utilisez un autre navigateur.");
      }
    };
    window.addEventListener('unhandledrejection', onUnhandled);

    watchdog = setTimeout(() => {
      release("La verification du paiement n'a pas abouti. Reessayez ou utilisez un autre navigateur si une extension bloque la verification anti-fraude.");
    }, PAY_TIMEOUT_MS);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        // redirect: 'if_required' → on reste inline pour les CB classiques,
        // redirect uniquement pour 3DS / methodes redirect (Bancontact, etc.).
        redirect: 'if_required',
      });
      if (settled) return;
      if (error) {
        if (onError) onError(error);
        release(error.message || 'Erreur de paiement.');
        return;
      }
      if (paymentIntent && paymentIntent.status === 'succeeded') {
        // busy reste true : le parent enchaine sur /book.
        if (watchdog) clearTimeout(watchdog);
        if (onUnhandled) window.removeEventListener('unhandledrejection', onUnhandled);
        settled = true;
        onPaid(paymentIntent.id);
      } else {
        release(`Paiement non confirme (${paymentIntent?.status || 'inconnu'}).`);
      }
    } catch (e) {
      release(e.message || 'Erreur reseau.');
    }
  };

  const amountStr = (amountCents / 100).toFixed(2) + ' €';

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {errMsg && (
        <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8, fontWeight: 500 }}>
          {errMsg}
        </p>
      )}
      <button type="submit" disabled={!stripe || busy}
        style={{
          width: '100%', marginTop: 12, padding: '14px',
          borderRadius: 99, background: th.accent, border: 'none',
          fontWeight: 500, fontSize: 14, color: th.accentText,
          cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
          letterSpacing: '-0.01em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
        {busy ? (
          <>
            <span style={{
              width: 16, height: 16, borderRadius: 99,
              border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white',
              animation: 'spin .7s linear infinite',
            }} />
            {"Paiement en cours…"}
          </>
        ) : `Payer ${amountStr} et reserver`}
      </button>
    </form>
  );
}

// ── Composant exporte ─────────────────────────────────────────────────────
export function StripePaymentSection({
  th, slug, booking, onPaid, bookingError,
}) {
  // booking : { service_id, date, start_time, promo_code_id, referral_code }
  // bookingError : si le parent (handleBook) echoue apres paiement, le passer
  // en prop pour reset busy = permettre a l'utilisateur de retenter.
  const [intent, setIntent]   = useState(null); // { client_secret, payment_intent_id, connected_account_id, amount_cents, ... }
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);

  // Si une erreur de /book remonte du parent apres paiement reussi, on
  // sort du busy pour que le bouton "Payer" redevienne cliquable. Stripe
  // renverra le meme PI deja succeeded (idempotent) → handleBook re-tente.
  useEffect(() => {
    if (bookingError && busy) setBusy(false);
  }, [bookingError]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cle stable pour relancer l'effect si le booking change vraiment
  const bookingKey = `${booking?.service_id}|${booking?.date}|${booking?.start_time}|${booking?.promo_code_id || ''}|${booking?.referral_code || ''}`;

  useEffect(() => {
    if (!booking?.service_id || !booking?.date || !booking?.start_time) {
      setLoading(false);
      setError('Donnees de reservation incompletes.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setIntent(null);
    pubApi.createPaymentIntent(slug, booking)
      .then(r => {
        if (cancelled) return;
        setIntent(r);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e.message || 'Erreur creation paiement.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bookingKey, slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const stripePromise = useMemo(
    () => intent?.connected_account_id ? getStripeForAccount(intent.connected_account_id) : null,
    [intent?.connected_account_id]
  );

  if (loading) {
    return (
      <div style={{
        marginTop: 12, padding: 16, borderRadius: 12,
        background: th.card, border: `0.5px solid ${th.border}`,
        textAlign: 'center', fontSize: 13, color: th.muted,
      }}>
        {"Preparation du paiement…"}
      </div>
    );
  }
  if (error) {
    return (
      <div style={{
        marginTop: 12, padding: 14, borderRadius: 9,
        background: 'rgba(239,68,68,0.07)',
        border: '1px solid rgba(239,68,68,0.25)',
        fontSize: 12, color: '#ef4444', fontWeight: 500,
      }}>
        {error}
      </div>
    );
  }
  if (!STRIPE_PK) {
    return (
      <div style={{
        marginTop: 12, padding: 14, borderRadius: 9,
        background: 'rgba(245,158,11,0.07)',
        border: '1px solid rgba(245,158,11,0.25)',
        fontSize: 12, color: '#92400e', fontWeight: 500,
      }}>
        {"Configuration Stripe manquante (VITE_STRIPE_PUBLISHABLE_KEY)."}
      </div>
    );
  }
  if (!intent || !stripePromise) return null;

  return (
    <div style={{
      marginTop: 16, padding: 16, borderRadius: 12,
      background: th.card, border: `0.5px solid ${th.border}`,
    }}>
      <p style={{ fontSize: 12, fontWeight: 500, color: th.text, margin: '0 0 4px' }}>
        {"Paiement par carte"}
      </p>
      <p style={{ fontSize: 11, color: th.muted, margin: '0 0 4px' }}>
        {"Montant : "}
        <span style={{ fontWeight: 500, color: th.text }}>
          {(intent.amount_cents / 100).toFixed(2)} €
        </span>
        {intent.payment_percentage && intent.payment_percentage < 100 && (
          <span style={{ color: th.muted }}>
            {` (acompte ${intent.payment_percentage}%)`}
          </span>
        )}
      </p>
      <Elements stripe={stripePromise} options={{
        clientSecret: intent.client_secret,
        appearance: { theme: 'stripe' },
      }}>
        <PayForm
          th={th}
          amountCents={intent.amount_cents}
          onPaid={(piId) => onPaid(piId, intent.amount_cents)}
          busy={busy} setBusy={setBusy}
        />
      </Elements>
    </div>
  );
}
