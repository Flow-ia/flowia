// src/pages/booking-page/components/StripePaymentSection.jsx
// Bloc de paiement Stripe Elements pour Step6 — 3 modes :
//
//   1. DirectPay (selectedPmId=null, saveCard=false) :
//      Cree un PaymentIntent sur le compte connecte du salon, le client
//      saisit sa carte dans PaymentElement, confirmation directe. Flow
//      historique, pas de sauvegarde.
//
//   2. SaveCardThenPay (selectedPmId=null, saveCard=true, client connecte) :
//      "SetupIntent dual flow" -- limitation Stripe Direct Charges qui
//      n'autorise pas le clonage connected -> platform. On cree d'abord un
//      SetupIntent sur la PLATEFORME FlowIA, le client saisit sa carte
//      (PaymentElement avec Stripe instance plateforme), confirmSetup
//      attache le PM au customer plateforme du client. Puis on cree un PI
//      sur le connected du salon avec use_saved_pm_id (le backend clone le
//      PM plateforme -> connected). Si SCA off_session declenche 3DS,
//      stripe.handleNextAction sur l'instance Stripe connected.
//
//   3. SavedCardPay (selectedPmId set, payment 1-clic) :
//      Pas de saisie carte. Bouton "Payer X EUR avec ma carte". Au clic,
//      createPaymentIntent({use_saved_pm_id}) -> backend confirme le PI
//      cote serveur avec off_session=true. Si requires_action,
//      stripe.handleNextAction cote front pour le 3DS.

import { useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements, PaymentElement, useStripe, useElements,
} from '@stripe/react-stripe-js';
import { pubApi, globalClientApi } from '../../../utils/api';

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const PAY_TIMEOUT_MS = 90000;

// ── Singletons Stripe ────────────────────────────────────────────────────
// stripeAccount=undefined -> instance plateforme (pour SetupIntent global).
// stripeAccount=connected -> instance Direct Charge (pour PaymentIntent).
const stripePromiseCache = {};
function getStripeForAccount(accountId) {
  if (!STRIPE_PK) return null;
  const key = accountId || '__platform__';
  if (!stripePromiseCache[key]) {
    stripePromiseCache[key] = accountId
      ? loadStripe(STRIPE_PK, { stripeAccount: accountId })
      : loadStripe(STRIPE_PK);
  }
  return stripePromiseCache[key];
}

// ── Helper UX : watchdog + capture unhandledrejection autour d'une promesse
// Stripe (cas hCaptcha bloque par extension navigateur, voir commit 1).
function runStripeWithWatchdog(stripeCall, onTimeout, onChallengeFailed) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let onUnhandled = null;
    let watchdog = null;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      if (onUnhandled) window.removeEventListener('unhandledrejection', onUnhandled);
      if (watchdog) clearTimeout(watchdog);
      err ? reject(err) : resolve(val);
    };
    onUnhandled = (ev) => {
      const reason = ev?.reason;
      const txt = typeof reason === 'string' ? reason : (reason?.message || reason?.code || '');
      if (/challenge-?closed|hcaptcha/i.test(String(txt))) {
        finish(new Error(onChallengeFailed));
      }
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    watchdog = setTimeout(() => finish(new Error(onTimeout)), PAY_TIMEOUT_MS);
    Promise.resolve().then(stripeCall).then(v => finish(null, v), e => finish(e));
  });
}

const TIMEOUT_MSG = "La verification du paiement n'a pas abouti. Reessayez ou utilisez un autre navigateur si une extension bloque la verification anti-fraude.";
const CHALLENGE_MSG = "Verification anti-fraude interrompue. Desactivez les extensions de blocage ou utilisez un autre navigateur.";

function payButtonStyle(th, busy) {
  return {
    width: '100%', marginTop: 12, padding: '14px',
    borderRadius: 99, background: th.accent, border: 'none',
    fontWeight: 500, fontSize: 14, color: th.accentText,
    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
    letterSpacing: '-0.01em',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  };
}
function spinner() {
  return (
    <span style={{
      width: 16, height: 16, borderRadius: 99,
      border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white',
      animation: 'spin .7s linear infinite',
    }} />
  );
}
function errorBlock(msg) {
  return (
    <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8, fontWeight: 500 }}>
      {msg}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Mode 1 : DirectPay -- carte saisie, paiement immediat sur connected
// ─────────────────────────────────────────────────────────────────────────
function DirectPayForm({ th, amountCents, onPaid, busy, setBusy }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [errMsg, setErrMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true); setErrMsg('');
    try {
      const { error, paymentIntent } = await runStripeWithWatchdog(
        () => stripe.confirmPayment({ elements, redirect: 'if_required' }),
        TIMEOUT_MSG, CHALLENGE_MSG,
      );
      if (error) {
        setErrMsg(error.message || 'Erreur de paiement.');
        setBusy(false);
        return;
      }
      if (paymentIntent && paymentIntent.status === 'succeeded') {
        // busy reste true : le parent enchaine sur /book.
        onPaid(paymentIntent.id);
      } else {
        setErrMsg(`Paiement non confirme (${paymentIntent?.status || 'inconnu'}).`);
        setBusy(false);
      }
    } catch (e) {
      setErrMsg(e.message || 'Erreur reseau.');
      setBusy(false);
    }
  };

  const amountStr = (amountCents / 100).toFixed(2) + ' €';

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {errMsg && errorBlock(errMsg)}
      <button type="submit" disabled={!stripe || busy} style={payButtonStyle(th, busy)}>
        {busy ? <>{spinner()}{"Paiement en cours…"}</> : `Payer ${amountStr} et reserver`}
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Mode 2 : SaveCardThenPay -- SetupIntent plateforme puis PI use_saved_pm_id
// ─────────────────────────────────────────────────────────────────────────
function SaveCardForm({
  th, amountCents, slug, booking, onPaid, busy, setBusy, onSavedNewCard,
}) {
  const platformStripe = useStripe(); // instance plateforme via Elements parent
  const elements       = useElements();
  const [errMsg, setErrMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!platformStripe || !elements || busy) return;
    setBusy(true); setErrMsg('');

    try {
      // 1) Confirm SetupIntent plateforme -> PM attache au customer plateforme
      const { error: setupErr, setupIntent } = await runStripeWithWatchdog(
        () => platformStripe.confirmSetup({ elements, redirect: 'if_required' }),
        TIMEOUT_MSG, CHALLENGE_MSG,
      );
      if (setupErr) {
        setErrMsg(setupErr.message || 'Erreur sauvegarde carte.');
        setBusy(false);
        return;
      }
      if (!setupIntent || setupIntent.status !== 'succeeded') {
        setErrMsg(`Sauvegarde non confirmee (${setupIntent?.status || 'inconnu'}).`);
        setBusy(false);
        return;
      }

      // 2) Persiste la carte cote backend (immediat, le webhook fera idempotent)
      const saved = await globalClientApi.savePaymentMethod(setupIntent.payment_method);
      const newDbId = saved?.method?.id;
      if (!newDbId) {
        setErrMsg("Carte sauvegardee mais introuvable. Reessayez.");
        setBusy(false);
        return;
      }
      onSavedNewCard?.(newDbId);

      // 3) Cree le PI sur connected avec use_saved_pm_id (clone + confirm
      //    cote serveur, off_session=true).
      const intent = await pubApi.createPaymentIntent(slug, {
        ...booking, use_saved_pm_id: newDbId,
      });

      // 4) Si 3DS / SCA -> handleNextAction sur instance Stripe connected.
      if (intent.pi_status === 'requires_action') {
        const connectedStripe = await getStripeForAccount(intent.connected_account_id);
        const { error: actErr, paymentIntent: pi } = await runStripeWithWatchdog(
          () => connectedStripe.handleNextAction({ clientSecret: intent.client_secret }),
          TIMEOUT_MSG, CHALLENGE_MSG,
        );
        if (actErr) { setErrMsg(actErr.message || 'Erreur 3DS.'); setBusy(false); return; }
        if (pi?.status === 'succeeded') { onPaid(intent.payment_intent_id); return; }
        setErrMsg(`Paiement non confirme (${pi?.status || 'inconnu'}).`);
        setBusy(false);
        return;
      }
      if (intent.pi_status === 'succeeded') { onPaid(intent.payment_intent_id); return; }
      setErrMsg(`Paiement non confirme (${intent.pi_status || 'inconnu'}).`);
      setBusy(false);
    } catch (e) {
      setErrMsg(e?.message || 'Erreur reseau.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {errMsg && errorBlock(errMsg)}
      <button type="submit" disabled={!platformStripe || busy} style={payButtonStyle(th, busy)}>
        {busy
          ? <>{spinner()}{"Paiement en cours…"}</>
          : "Payer, sauvegarder ma carte et reserver"}
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Mode 3 : SavedCardPay -- 1 clic, le backend confirme cote serveur
// ─────────────────────────────────────────────────────────────────────────
function SavedCardPay({
  th, slug, booking, selectedPmId, onPaid, savedMethodLabel,
}) {
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [intentInfo, setIntentInfo] = useState(null); // pour afficher le montant

  // Pre-fetch montant via createPaymentIntent SANS confirmation cote backend
  // n'est pas possible : la route confirme directement avec use_saved_pm_id.
  // On affiche donc le bouton avec un montant "?" et on declenche le PI au clic.
  // Pour eviter la latence visuelle, on pourrait faire un payment-config
  // call mais le montant exact (avec promo) est calcule dans payment-intent.
  // Compromis : on affiche "Payer maintenant" et on revele le montant
  // dans le bouton apres le 1er clic. Les utilisateurs voient le total dans
  // le recap au-dessus de toute facon.

  const handlePay = async () => {
    if (busy) return;
    setBusy(true); setErrMsg('');
    try {
      const intent = await pubApi.createPaymentIntent(slug, {
        ...booking, use_saved_pm_id: selectedPmId,
      });
      setIntentInfo({ amount_cents: intent.amount_cents });

      if (intent.pi_status === 'requires_action') {
        const connectedStripe = await getStripeForAccount(intent.connected_account_id);
        const { error, paymentIntent } = await runStripeWithWatchdog(
          () => connectedStripe.handleNextAction({ clientSecret: intent.client_secret }),
          TIMEOUT_MSG, CHALLENGE_MSG,
        );
        if (error) { setErrMsg(error.message || 'Erreur 3DS.'); setBusy(false); return; }
        if (paymentIntent?.status === 'succeeded') { onPaid(intent.payment_intent_id); return; }
        setErrMsg(`Paiement non confirme (${paymentIntent?.status || 'inconnu'}).`);
        setBusy(false);
        return;
      }
      if (intent.pi_status === 'succeeded') { onPaid(intent.payment_intent_id); return; }
      setErrMsg(`Paiement non confirme (${intent.pi_status || 'inconnu'}).`);
      setBusy(false);
    } catch (e) {
      setErrMsg(e?.message || 'Erreur reseau.');
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 11, color: th.muted, margin: '0 0 8px' }}>
        {`Paiement avec ${savedMethodLabel}`}
      </p>
      {errMsg && errorBlock(errMsg)}
      <button type="button" onClick={handlePay} disabled={busy} style={payButtonStyle(th, busy)}>
        {busy
          ? <>{spinner()}{"Paiement en cours…"}</>
          : (intentInfo
              ? `Payer ${(intentInfo.amount_cents/100).toFixed(2)} € et reserver`
              : "Payer et reserver")}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Composant exporte -- orchestre les 3 modes
// ─────────────────────────────────────────────────────────────────────────
export function StripePaymentSection({
  th, slug, booking, onPaid, bookingError,
  selectedPmId, saveCard, isLoggedGlobal, onSavedNewCard,
}) {
  // Effective mode :
  //   - 'saved' si le client a choisi une carte sauvegardee
  //   - 'save'  si nouvelle carte + checkbox sauvegarder + connecte global
  //   - 'direct' sinon (flow standard)
  const mode = selectedPmId
    ? 'saved'
    : (saveCard && isLoggedGlobal ? 'save' : 'direct');

  // ── Mode SAVED : pas d'Elements, juste un bouton 1-clic. ───────────────
  if (mode === 'saved') {
    return (
      <SavedCardPaySectionWrapper
        th={th} slug={slug} booking={booking}
        selectedPmId={selectedPmId} onPaid={onPaid}
      />
    );
  }

  // ── Modes DIRECT et SAVE : on initialise le bon Intent. ────────────────
  return (
    <PaymentIntentOrSetupWrapper
      th={th} slug={slug} booking={booking} mode={mode}
      onPaid={onPaid} bookingError={bookingError}
      onSavedNewCard={onSavedNewCard}
    />
  );
}

// Wrapper SavedCardPay : recupere le label de la carte (depuis l'API) pour
// l'afficher au-dessus du bouton, sans block sur le rendu (label optionnel).
function SavedCardPaySectionWrapper({ th, slug, booking, selectedPmId, onPaid }) {
  const [label, setLabel] = useState("votre carte sauvegardee");
  useEffect(() => {
    let cancelled = false;
    globalClientApi.paymentMethods()
      .then(r => {
        if (cancelled) return;
        const m = (r?.methods || []).find(x => x.id === selectedPmId);
        if (m) {
          const brand = (m.brand || 'carte').replace(/^./, c => c.toUpperCase());
          setLabel(`${brand} ****${m.last4 || '????'}`);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedPmId]);

  return (
    <div style={{
      marginTop: 16, padding: 16, borderRadius: 12,
      background: th.card, border: `0.5px solid ${th.border}`,
    }}>
      <p style={{ fontSize: 12, fontWeight: 500, color: th.text, margin: '0 0 4px' }}>
        {"Paiement par carte"}
      </p>
      <SavedCardPay
        th={th} slug={slug} booking={booking}
        selectedPmId={selectedPmId} onPaid={onPaid}
        savedMethodLabel={label}
      />
    </div>
  );
}

// Wrapper Direct/Save : cree le bon Intent au mount (PI connected ou
// SetupIntent plateforme) puis monte Elements avec la bonne instance Stripe.
function PaymentIntentOrSetupWrapper({
  th, slug, booking, mode, onPaid, bookingError, onSavedNewCard,
}) {
  // intent : { client_secret, payment_intent_id?, setup_intent_id?, amount_cents,
  //           connected_account_id?, ... }
  const [intent, setIntent]   = useState(null);
  const [error,  setError]    = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);

  // Reset busy si une erreur apres paiement remonte du parent (ex. /book ko).
  useEffect(() => {
    if (bookingError && busy) setBusy(false);
  }, [bookingError]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cle stable pour relancer l'effect si le booking change vraiment
  const bookingKey = `${booking?.service_id}|${booking?.date}|${booking?.start_time}|${booking?.promo_code_id || ''}|${booking?.referral_code || ''}|${mode}`;

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

    const promise = mode === 'save'
      ? globalClientApi.createSetupIntent()
          .then(si => ({
            client_secret:        si.client_secret,
            setup_intent_id:      si.setup_intent_id,
            connected_account_id: null,           // PI sera cree apres save
            amount_cents:         null,           // recap uniquement
          }))
      : pubApi.createPaymentIntent(slug, booking);

    promise
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

  // Stripe instance :
  // - mode 'save'   -> plateforme (sans stripeAccount) pour le SetupIntent
  // - mode 'direct' -> connected account du salon
  const stripePromise = useMemo(() => {
    if (mode === 'save') return getStripeForAccount(null);
    return intent?.connected_account_id ? getStripeForAccount(intent.connected_account_id) : null;
  }, [mode, intent?.connected_account_id]);

  // En mode 'save' on doit aussi prefetch le compte connecte du salon pour
  // pouvoir gerer le 3DS du PI cree apres save -- on le recoit dans la
  // reponse createPaymentIntent (use_saved_pm_id), pas besoin de prefetch.

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

  // Pour le mode 'save', on a besoin de connaitre le connected_account_id
  // au moment du clone post-setup. Le backend createPaymentIntent retourne
  // ce field. On le passe via SaveCardForm qui le recoit en retour.

  return (
    <div style={{
      marginTop: 16, padding: 16, borderRadius: 12,
      background: th.card, border: `0.5px solid ${th.border}`,
    }}>
      <p style={{ fontSize: 12, fontWeight: 500, color: th.text, margin: '0 0 4px' }}>
        {mode === 'save' ? "Paiement par carte (sauvegarde)" : "Paiement par carte"}
      </p>
      {mode === 'direct' && intent.amount_cents != null && (
        <p style={{ fontSize: 11, color: th.muted, margin: '0 0 4px' }}>
          {"Montant : "}
          <span style={{ fontWeight: 500, color: th.text }}>
            {(intent.amount_cents / 100).toFixed(2)} {"€"}
          </span>
          {intent.payment_percentage && intent.payment_percentage < 100 && (
            <span style={{ color: th.muted }}>
              {` (acompte ${intent.payment_percentage}%)`}
            </span>
          )}
        </p>
      )}
      <Elements stripe={stripePromise} options={{
        clientSecret: intent.client_secret,
        appearance: { theme: 'stripe' },
      }}>
        {mode === 'save' ? (
          <SaveCardFormBridge
            th={th} slug={slug} booking={booking}
            onPaid={(piId) => onPaid(piId)}
            onSavedNewCard={onSavedNewCard}
            busy={busy} setBusy={setBusy}
          />
        ) : (
          <DirectPayForm
            th={th}
            amountCents={intent.amount_cents || 0}
            onPaid={(piId) => onPaid(piId, intent.amount_cents)}
            busy={busy} setBusy={setBusy}
          />
        )}
      </Elements>
    </div>
  );
}

// Bridge SaveCardForm : passage direct des props -- le connected_account_id
// est recupere a la volee dans la reponse createPaymentIntent (handleSubmit).
function SaveCardFormBridge({ th, slug, booking, onPaid, onSavedNewCard, busy, setBusy }) {
  return (
    <SaveCardForm
      th={th} amountCents={0}
      slug={slug} booking={booking}
      onPaid={onPaid}
      onSavedNewCard={onSavedNewCard}
      busy={busy} setBusy={setBusy}
    />
  );
}
