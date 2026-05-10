// utils/refundAppointment.js — remboursement Stripe Connect d'un RDV.
//
// Usage : appele automatiquement lorsque un commercant annule un RDV qui a
// ete paye en ligne par le client (PUT /appointments/:id avec
// status='cancelled' AND payment_status='paid' AND stripe_payment_intent_id).
//
// Pourquoi le commercant NE PEUT PAS bypasser : la plateforme FlowIA appelle
// l'API Stripe Connect avec sa cle plateforme + l'`account_id` du
// commercant via header `Stripe-Account: <acct>`. Le refund est applique
// directement sur le compte connecte du commercant SANS lui demander
// l'autorisation. Si le commercant a annule le RDV (donc faute du salon),
// c'est lui qui supporte le refund — c'est conforme au business : le client
// ne doit pas perdre de l'argent quand le salon ferme/annule.
//
// Mode degrade : si l'API Stripe echoue (compte deconnecte, fonds
// insuffisants, etc.), le refund est insere dans `failed_refunds` pour
// retry manuel par l'admin (audit Phase 5 — voir routes/admin/failed-refunds.js).
// Le refund n'echoue PAS silencieusement.
//
// Idempotence : on verifie payment_status avant l'appel pour eviter de
// rembourser 2x. Si deja 'refunded', on no-op.

const { recordRefundTransaction } = require('./recordRefundTransaction');

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY non configuree');
  return require('stripe')(key);
}

/**
 * Tente un remboursement automatique du RDV via Stripe Connect.
 * @param {object} pool - pg Pool
 * @param {string} apptId - UUID du RDV (deja verifie appartenir au merchant)
 * @param {string} reason - Raison interne (ex 'merchant_cancelled', 'client_cancelled')
 * @returns {Promise<{ ok:boolean, refunded?:boolean, reason?:string, error?:string }>}
 *          ok=true + refunded=true   : refund Stripe valide et DB mise a jour
 *          ok=true + refunded=false  : rien a faire (pas paye, deja rembourse, etc.)
 *          ok=false + error          : echec apres tentative — un row failed_refunds est cree
 */
async function refundAppointment(pool, apptId, reason = 'merchant_cancelled') {
  // Recupere l'etat courant du RDV + l'account Stripe du merchant.
  const { rows } = await pool.query(`
    SELECT a.id, a.user_id, a.payment_status, a.paid_amount_cents,
           a.stripe_payment_intent_id, a.client_email,
           u.stripe_account_id
      FROM appointments a
      JOIN users u ON u.id = a.user_id
     WHERE a.id = $1
     LIMIT 1
  `, [apptId]);

  if (!rows.length) return { ok: false, error: 'RDV introuvable' };
  const a = rows[0];

  // Pas de paiement en ligne : rien a rembourser.
  if (!a.stripe_payment_intent_id || !a.paid_amount_cents) {
    return { ok: true, refunded: false, reason: 'no_payment' };
  }
  // Deja rembourse : idempotence.
  if (a.payment_status === 'refunded') {
    return { ok: true, refunded: false, reason: 'already_refunded' };
  }
  // Statut non 'paid' (echec, en attente, etc.) — on ne refund pas.
  if (a.payment_status !== 'paid') {
    return { ok: true, refunded: false, reason: 'not_paid' };
  }
  // Pas de stripe_account_id : le merchant a deconnecte son compte.
  // -> on flague en failed_refund pour traitement admin.
  if (!a.stripe_account_id) {
    await pool.query(`
      INSERT INTO failed_refunds
        (user_id, stripe_account_id, payment_intent_id, amount_cents, slug, reason, stripe_error_message)
      VALUES ($1, $2, $3, $4, NULL, $5, 'no_stripe_account')
      ON CONFLICT (payment_intent_id) WHERE resolved_at IS NULL DO NOTHING
    `, [a.user_id, '', a.stripe_payment_intent_id, a.paid_amount_cents, reason]);
    return { ok: false, error: 'Compte Stripe du commerce indisponible' };
  }

  // FlowIA utilise des DIRECT CHARGES : les PaymentIntents sont crees sur
  // le compte connecte du commercant via { stripeAccount: acct }. Les
  // appels paymentIntents.retrieve et refunds.create DOIVENT donc passer
  // { stripeAccount: a.stripe_account_id } en 2e arg.
  //
  // Auto-detection direct vs destination charges (defensif) :
  //   1. Tente PI retrieve AVEC stripeAccount  -> direct charges (cas FlowIA)
  //   2. Si "No such payment_intent" : retente SANS stripeAccount (cas
  //      hypothetique destination charges) et applique alors les flags
  //      refund_application_fee + reverse_transfer.
  //
  // Direct charges : Stripe rembourse automatiquement l'application_fee au
  // prorata du refund (default behavior). On NE passe PAS
  // refund_application_fee ni reverse_transfer (incompatibles avec direct
  // charges, Stripe rejetterait).
  let succeeded   = false;
  let stripeError = null;
  let refundId    = null;
  let chargeMode  = null; // 'direct' | 'destination'
  try {
    const stripe = getStripe();

    let pi = null;
    try {
      // 3-arg form (id, params, options) : le 2-arg (id, { stripeAccount })
      // est rejete car le SDK Node 22.x interprete le 2e arg comme params
      // de retrieve (parametres comme `expand`) et envoie 'stripeAccount'
      // comme query param -> "Received unknown parameter: stripeAccount".
      pi = await stripe.paymentIntents.retrieve(
        a.stripe_payment_intent_id,
        undefined,
        { stripeAccount: a.stripe_account_id }
      );
      chargeMode = 'direct';
    } catch (rErr) {
      if (/No such payment_intent/i.test(rErr.message || '')) {
        try {
          pi = await stripe.paymentIntents.retrieve(a.stripe_payment_intent_id);
          chargeMode = 'destination';
          console.warn('[refundAppointment] destination_charge_path detected (rare) appt=' + a.id);
        } catch (rErr2) {
          console.warn('[refundAppointment] PI retrieve fail in both paths', rErr2.message);
        }
      } else {
        console.warn('[refundAppointment] PI retrieve unexpected error', rErr.message);
      }
    }
    console.log('[refundAppointment] charge_mode=' + (chargeMode || 'unknown'),
                'appt=' + a.id, 'pi=' + a.stripe_payment_intent_id);

    const refundParams = {
      payment_intent: a.stripe_payment_intent_id,
      reason: 'requested_by_customer',
      metadata: {
        appointment_id: a.id,
        flowia_reason:  reason,
        source:         'auto_refund_on_cancel',
        charge_mode:    chargeMode || 'direct_assumed',
      },
    };

    let refund;
    if (chargeMode === 'destination') {
      // Cas hypothetique non-FlowIA : refund sur la plateforme + flags
      // explicites pour rendre la commission et inverser le transfert.
      const hasAppFee   = !!(pi && pi.application_fee_amount && pi.application_fee_amount > 0);
      const hasTransfer = !!(pi && (pi.transfer_data || pi.transfer_group));
      if (hasAppFee)   refundParams.refund_application_fee = true;
      if (hasTransfer) refundParams.reverse_transfer       = true;
      refund = await stripe.refunds.create(refundParams);
    } else {
      // Direct charges (cas FlowIA standard) : refund sur le compte connecte
      // du commercant. Pas de flag app_fee ni reverse_transfer (Stripe
      // gere automatiquement la commission au prorata).
      refund = await stripe.refunds.create(
        refundParams,
        { stripeAccount: a.stripe_account_id }
      );
    }
    refundId  = refund?.id || null;
    succeeded = true;
  } catch (e) {
    stripeError = e.message || String(e);
    console.error('[refundAppointment] Stripe error charge_mode=' + chargeMode, stripeError);
  }

  if (succeeded) {
    // Marque le RDV comme rembourse. Le webhook charge.refunded peut
    // aussi declencher cette mise a jour mais on l'applique tout de suite
    // pour que le frontend voie le statut a jour sans attendre le webhook.
    await pool.query(`
      UPDATE appointments
         SET payment_status = 'refunded', updated_at = NOW()
       WHERE id = $1
    `, [a.id]);
    // Annule la row appointment_payouts en attente (escrow) pour que le
    // cron releasePayouts ne tente pas un payout vers l'IBAN du commerçant
    // alors que les fonds viennent d'etre rembourses au client.
    try {
      const { cancelAppointmentPayout } = require('./scheduleAppointmentPayout');
      await cancelAppointmentPayout(pool, a.id, reason || 'refunded');
    } catch (cancelErr) {
      console.error('[refundAppointment] cancelAppointmentPayout', cancelErr.message);
    }
    // Tracabilite caisse / stats : insere une row 'rdv_refund' POSITIVE
    // (CHECK constraint transactions_amount_nonneg interdit amount<0). Le
    // sens "refund" est porte par payment_status='REFUNDED' + payment_type
    // ='refund' + source='rdv_refund'. Idempotent (UNIQUE index partiel
    // sur appointment_id WHERE source='rdv_refund'). Erreur d'insert ne
    // bloque pas le refund — l'argent est deja rendu cote Stripe.
    const txRes = await recordRefundTransaction(pool, {
      appointmentId: a.id,
      refundedCents: a.paid_amount_cents,
      stripeRefundId: refundId,
    });
    if (!txRes.ok) {
      console.error('[refundAppointment] tx insert failed', txRes.error);
    }
    return { ok: true, refunded: true, refund_id: refundId };
  }

  // Echec Stripe : insert dans failed_refunds pour retry admin.
  // Conflict ON pi : un refund deja en attente pour ce PI -> NO_OP, on
  // garde le row existant (l'admin verra l'erreur la plus recente via
  // updated_at).
  try {
    await pool.query(`
      INSERT INTO failed_refunds
        (user_id, stripe_account_id, payment_intent_id, amount_cents, slug, reason, stripe_error_message)
      VALUES ($1, $2, $3, $4, NULL, $5, $6)
      ON CONFLICT (payment_intent_id) WHERE resolved_at IS NULL DO UPDATE
        SET retry_count = failed_refunds.retry_count + 1,
            stripe_error_message = EXCLUDED.stripe_error_message,
            updated_at = NOW()
    `, [a.user_id, a.stripe_account_id, a.stripe_payment_intent_id,
        a.paid_amount_cents, reason, stripeError]);
  } catch (insErr) {
    console.error('[refundAppointment] failed_refunds insert', insErr.message);
  }
  return { ok: false, error: stripeError || 'Stripe refund failed' };
}

module.exports = { refundAppointment };
