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

import { useEffect, useMemo, useRef, useState } from 'react';
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

// Checkbox "Sauvegarder ma carte" affichee sous le PaymentElement, juste
// avant le bouton Payer. Uniquement quand le client est connecte global.
// Au changement, le parent (Step6) recoit setSaveCard et change le mode
// du composant -> SetupIntent dual flow recree.
function SaveCardCheckbox({ th, checked, onChange, disabled }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      marginTop: 14, padding: '10px 12px', borderRadius: 10,
      background: th.cardAlt || 'rgba(0,0,0,0.03)',
      border: `0.5px solid ${th.border}`,
      cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none',
      opacity: disabled ? 0.6 : 1,
    }}>
      <input type="checkbox" checked={checked} disabled={disabled}
             onChange={e => onChange?.(e.target.checked)}
             style={{ marginTop: 2, accentColor: th.accent }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: th.text }}>
          {"Sauvegarder cette carte"}
        </span>
        <span style={{ fontSize: 11, color: th.muted, lineHeight: 1.45 }}>
          {"Reutilisable en 1 clic sur tous les salons FlowIA. Carte chiffree par Stripe, supprimable a tout moment."}
        </span>
      </span>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Mode 1 : DirectPay -- carte saisie, paiement immediat sur connected
// ─────────────────────────────────────────────────────────────────────────
function DirectPayForm({ th, amountCents, onPaid, busy, setBusy,
                         showSaveCheckbox, saveCard, onSaveCardChange }) {
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
      {showSaveCheckbox && (
        <SaveCardCheckbox th={th} checked={saveCard} disabled={busy}
                          onChange={onSaveCardChange} />
      )}
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
  showSaveCheckbox, saveCard, onSaveCardChange,
}) {
  const platformStripe = useStripe(); // instance plateforme via Elements parent
  const elements       = useElements();
  const [errMsg, setErrMsg] = useState('');
  // saveCard est lu au moment du submit (pas en deps de l'effect -- pas de
  // remount). On capture la valeur dans une ref pour l'avoir a jour dans
  // handleSubmit meme si elle change pendant le confirmSetup async.
  const saveCardRef = useRef(saveCard);
  useEffect(() => { saveCardRef.current = saveCard; }, [saveCard]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!platformStripe || !elements || busy) return;
    setBusy(true); setErrMsg('');

    try {
      // 1) Confirm SetupIntent plateforme -> PM attache au customer plateforme.
      // confirm.payment_method est dispo dans le SetupIntent retourne.
      const { error: setupErr, setupIntent } = await runStripeWithWatchdog(
        () => platformStripe.confirmSetup({ elements, redirect: 'if_required' }),
        TIMEOUT_MSG, CHALLENGE_MSG,
      );
      if (setupErr) {
        setErrMsg(setupErr.message || 'Erreur de paiement.');
        setBusy(false);
        return;
      }
      if (!setupIntent || setupIntent.status !== 'succeeded') {
        setErrMsg(`Paiement non confirme (${setupIntent?.status || 'inconnu'}).`);
        setBusy(false);
        return;
      }

      // 2) Persiste la carte en DB. Si la checkbox sera decochee a la fin,
      //    on detachera apres -- mais le save est necessaire pour avoir un
      //    use_saved_pm_id a passer au PI.
      const saved = await globalClientApi.savePaymentMethod(setupIntent.payment_method);
      const newDbId = saved?.method?.id;
      if (!newDbId) {
        setErrMsg("Erreur lors de la finalisation du paiement.");
        setBusy(false);
        return;
      }

      // 3) Cree le PI sur connected avec use_saved_pm_id (clone + confirm
      //    cote serveur, off_session=true).
      const intent = await pubApi.createPaymentIntent(slug, {
        ...booking, use_saved_pm_id: newDbId,
      });

      // 4) Si 3DS / SCA -> handleNextAction sur instance Stripe connected.
      let piSucceeded = false;
      if (intent.pi_status === 'requires_action') {
        const connectedStripe = await getStripeForAccount(intent.connected_account_id);
        const { error: actErr, paymentIntent: pi } = await runStripeWithWatchdog(
          () => connectedStripe.handleNextAction({ clientSecret: intent.client_secret }),
          TIMEOUT_MSG, CHALLENGE_MSG,
        );
        if (actErr) { setErrMsg(actErr.message || 'Erreur de paiement.'); setBusy(false); return; }
        piSucceeded = pi?.status === 'succeeded';
        if (!piSucceeded) {
          setErrMsg(`Paiement non confirme (${pi?.status || 'inconnu'}).`);
          setBusy(false);
          return;
        }
      } else if (intent.pi_status === 'succeeded') {
        piSucceeded = true;
      } else {
        setErrMsg(`Paiement non confirme (${intent.pi_status || 'inconnu'}).`);
        setBusy(false);
        return;
      }

      // 5) Decision finale "garder ou detach" -- la checkbox saveCard a pu
      //    etre decochee pendant le confirmSetup async, on lit la ref a jour.
      const keep = saveCardRef.current;
      if (!keep) {
        // Best-effort detach -- si echec, la carte reste en DB (l'user
        // pourra la supprimer manuellement depuis Compte > Cartes).
        try { await globalClientApi.deletePaymentMethod(newDbId); } catch {}
      } else {
        onSavedNewCard?.(newDbId);
      }

      onPaid(intent.payment_intent_id);
    } catch (e) {
      // Affichage enrichi : si l'API a renvoye un code Stripe (e.data.stripe_code),
      // on l'inclut pour faciliter le diagnostic des 500.
      const code = e?.data?.stripe_code || e?.data?.error_type;
      setErrMsg(code ? `${e.message || 'Erreur'} [${code}]` : (e?.message || 'Erreur reseau.'));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {showSaveCheckbox && (
        <SaveCardCheckbox th={th} checked={saveCard} disabled={busy}
                          onChange={onSaveCardChange} />
      )}
      {errMsg && errorBlock(errMsg)}
      <button type="submit" disabled={!platformStripe || busy} style={payButtonStyle(th, busy)}>
        {busy
          ? <>{spinner()}{"Paiement en cours…"}</>
          : (amountCents > 0
              ? `Payer ${(amountCents/100).toFixed(2)} € et reserver`
              : "Payer et reserver")}
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
  selectedPmId, saveCard, onSaveCardChange,
  isLoggedGlobal, onSavedNewCard,
}) {
  // Effective mode -- DECIDE UNIQUEMENT par selectedPmId et isLoggedGlobal,
  // PAS par saveCard. Cocher/decocher la checkbox ne doit JAMAIS remonter
  // le PaymentElement (sinon perte de la saisie carte). saveCard sert
  // uniquement a decider de garder ou detach le PM apres paiement.
  //   - 'saved' si le client a choisi une carte sauvegardee deja en DB
  //   - 'save'  si client connecte global (SetupIntent + clone vers connected)
  //   - 'direct' sinon (PaymentIntent direct, pas de save)
  const mode = selectedPmId
    ? 'saved'
    : (isLoggedGlobal ? 'save' : 'direct');

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
      showSaveCheckbox={isLoggedGlobal}
      saveCard={saveCard}
      onSaveCardChange={onSaveCardChange}
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
  showSaveCheckbox, saveCard, onSaveCardChange,
}) {
  // intent : { client_secret, payment_intent_id?, setup_intent_id?, amount_cents,
  //           connected_account_id?, ... }
  const [intent, setIntent]   = useState(null);
  const [error,  setError]    = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);

  // Planity-style PI reuse : on garde le payment_intent_id du dernier intent
  // dans une ref qui survit aux re-renders. Au prochain createPaymentIntent
  // (changement de prix, promo, date...), on le passe au backend qui UPDATE
  // le meme PI au lieu d'en creer un nouveau. Evite les PIs orphelins
  // 'Incomplet' dans le dashboard Stripe + preserve la saisie carte du
  // client (le client_secret reste identique -> Elements ne re-monte pas).
  const previousPiIdRef = useRef(null);

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
    // PAS de setIntent(null) : si le backend update le meme PI, le
    // client_secret reste identique et Stripe Elements ne re-monte pas
    // (la carte saisie est preservee). Le render bypasse le skeleton de
    // chargement quand on a deja un intent (cf. `if (loading && !intent)`).

    const promise = mode === 'save'
      ? globalClientApi.createSetupIntent()
          .then(si => ({
            client_secret:        si.client_secret,
            setup_intent_id:      si.setup_intent_id,
            connected_account_id: null,           // PI sera cree apres save
            amount_cents:         null,           // recap uniquement
          }))
      : pubApi.createPaymentIntent(slug, {
          ...booking,
          // Reuse PI : le backend tente UPDATE si present, sinon CREATE.
          pi_id: previousPiIdRef.current,
        });

    promise
      .then(r => {
        if (cancelled) return;
        // Memorise le PI courant pour le prochain refresh (update plutot
        // que create). En mode 'save', payment_intent_id est absent
        // (SetupIntent) -> on garde l'ancien ref tel quel.
        if (r && r.payment_intent_id) {
          previousPiIdRef.current = r.payment_intent_id;
        }
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

  // Skeleton uniquement au PREMIER chargement (intent absent). Sur un
  // refresh (update PI), on garde l'UI Elements montee avec l'ancien
  // intent jusqu'a l'arrivee du nouveau -> pas de flash, pas de
  // re-mount Elements, carte saisie preservee.
  if (loading && !intent) {
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
      <Elements key={intent.client_secret} stripe={stripePromise} options={{
        clientSecret: intent.client_secret,
        appearance: {
          theme: 'stripe',
          variables: {
            // Custom FlowIA : palette claire, bordures fines, radius doux,
            // typo systeme. Donne a PaymentElement un rendu coherent avec
            // le reste de l'app sans changer la securite Stripe.
            colorPrimary:    th.accent || '#111111',
            colorBackground: th.cardAlt || '#f7f7f8',
            colorText:       th.text || '#111111',
            colorDanger:     '#ef4444',
            fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            spacingUnit:     '4px',
            borderRadius:    '12px',
          },
          rules: {
            '.Input': {
              border:      `0.5px solid ${th.border || 'rgba(0,0,0,0.12)'}`,
              boxShadow:   'none',
              padding:     '12px 14px',
              fontSize:    '14px',
            },
            '.Input:focus': {
              border:      `1px solid ${th.accent || '#111111'}`,
              boxShadow:   `0 0 0 1px ${th.accent || '#111111'}`,
            },
            '.Label': {
              fontSize:    '11px',
              fontWeight:  '500',
              color:       th.muted || '#6B7280',
              marginBottom: '4px',
            },
            '.Tab':       { borderRadius: '10px' },
            '.TabIcon':   { fill: th.text || '#111111' },
          },
        },
      }}>
        {mode === 'save' ? (
          <SaveCardFormBridge
            th={th} slug={slug} booking={booking}
            onPaid={(piId) => onPaid(piId)}
            onSavedNewCard={onSavedNewCard}
            busy={busy} setBusy={setBusy}
            showSaveCheckbox={showSaveCheckbox}
            saveCard={saveCard}
            onSaveCardChange={onSaveCardChange}
          />
        ) : (
          <DirectPayForm
            th={th}
            amountCents={intent.amount_cents || 0}
            onPaid={(piId) => onPaid(piId, intent.amount_cents)}
            busy={busy} setBusy={setBusy}
            showSaveCheckbox={showSaveCheckbox}
            saveCard={saveCard}
            onSaveCardChange={onSaveCardChange}
          />
        )}
      </Elements>
    </div>
  );
}

// Bridge SaveCardForm : passage direct des props -- le connected_account_id
// est recupere a la volee dans la reponse createPaymentIntent (handleSubmit).
function SaveCardFormBridge({
  th, slug, booking, onPaid, onSavedNewCard, busy, setBusy,
  showSaveCheckbox, saveCard, onSaveCardChange,
}) {
  return (
    <SaveCardForm
      th={th} amountCents={0}
      slug={slug} booking={booking}
      onPaid={onPaid}
      onSavedNewCard={onSavedNewCard}
      busy={busy} setBusy={setBusy}
      showSaveCheckbox={showSaveCheckbox}
      saveCard={saveCard}
      onSaveCardChange={onSaveCardChange}
    />
  );
}
