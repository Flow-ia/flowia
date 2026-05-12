// utils/scheduleAppointmentPayout.js — gestion de l'escrow des paiements
// en ligne. Insere/annule les rows dans appointment_payouts.
//
// Architecture :
//   1. Direct Charge sur compte Connect avec application_fee_amount (FlowIA
//      preleve sa commission au moment du paiement)
//   2. Compte Connect en payout manuel (configure a l'onboarding ou migre)
//      -> les fonds restent sur le balance Connect du commerçant, jamais
//      reverses automatiquement vers son IBAN
//   3. Sur payment_intent.succeeded : on programme un payout futur (cf
//      scheduleAppointmentPayout) avec release_at = appointment_date +
//      payout_hold_days du commerçant (defaut 3j).
//   4. Cron releasePayouts.js (worker 1, daily) -> stripe.payouts.create
//      pour les payouts dus.
//   5. Sur refund (annulation client/merchant) : on annule la row payout
//      via cancelAppointmentPayout, le payout n'aura jamais lieu et les
//      fonds sont rembourses depuis le balance Connect intact.
//
// Idempotence : UNIQUE(appointment_id) sur la table -> ON CONFLICT DO NOTHING
// pour resister aux replays webhook.

/**
 * Insere une row payout en attente pour un RDV qui vient d'etre paye en
 * ligne. Calcule release_at = (appointment_date + start_time) + payout_hold_days.
 * Si une row existe deja (replay webhook), no-op.
 *
 * @param {object} pool pg Pool
 * @param {object} args { appointmentId, paymentIntentId, amountCents }
 *        amountCents = montant net pour le commerçant (= total - application_fee).
 *        Si non fourni, on prend appt.paid_amount_cents (montant total payé,
 *        comprenant la commission FlowIA — on retranchera l'application_fee
 *        cote payout via le balance Connect, qui est deja a jour).
 */
async function scheduleAppointmentPayout(pool, { appointmentId, paymentIntentId, amountCents }) {
  // Recupere les infos necessaires : merchant, RDV, hold days config.
  const { rows } = await pool.query(`
    SELECT a.id, a.user_id, a.date, a.start_time, a.paid_amount_cents,
           a.payment_status, a.stripe_payment_intent_id,
           u.stripe_account_id, u.payout_hold_days,
           bs.timezone
      FROM appointments a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN booking_settings bs ON bs.user_id = u.id
     WHERE a.id = $1
     LIMIT 1
  `, [appointmentId]);

  if (!rows.length) return { ok: false, reason: 'appointment_not_found' };
  const a = rows[0];

  if (!a.stripe_account_id) return { ok: false, reason: 'no_stripe_account' };
  if (a.payment_status === 'refunded') return { ok: false, reason: 'already_refunded' };

  const piId = paymentIntentId || a.stripe_payment_intent_id;
  if (!piId) return { ok: false, reason: 'no_payment_intent' };

  const amt = amountCents != null ? amountCents : a.paid_amount_cents;
  if (!amt || amt <= 0) return { ok: false, reason: 'no_amount' };

  const holdDays = parseInt(a.payout_hold_days, 10);
  const safeHold = Number.isFinite(holdDays) && holdDays >= 0 && holdDays <= 30 ? holdDays : 3;
  const tz = a.timezone || 'Europe/Paris';

  // INSERT idempotent. release_at calcule cote SQL via la timezone du
  // commerçant pour gerer DST proprement. ON CONFLICT (appointment_id) ->
  // DO NOTHING : webhook payment_intent.succeeded peut etre delivre 2x.
  // RETURNING id : si rowCount=0 -> conflit (replay), on skip le ledger
  // dual-write pour ne pas creer de doublon payout_hold.
  const ins = await pool.query(`
    INSERT INTO appointment_payouts
      (appointment_id, user_id, stripe_account_id, payment_intent_id,
       amount_cents, release_at, status)
    VALUES (
      $1, $2, $3, $4, $5,
      ($6::date + $7::time) AT TIME ZONE $8 + ($9 || ' days')::interval,
      'pending'
    )
    ON CONFLICT (appointment_id) DO NOTHING
    RETURNING id
  `, [
    a.id, a.user_id, a.stripe_account_id, piId, amt,
    typeof a.date === 'string' ? a.date.substring(0, 10) : a.date,
    typeof a.start_time === 'string' ? a.start_time.substring(0, 8) : a.start_time,
    tz, String(safeHold)
  ]);

  // PHASE 2 LEDGER : entry payout_hold (informationnel) si nouvelle row.
  // Si conflit (rowCount=0), le payout_hold a deja ete ecrit au 1er passage,
  // on no-op. amount=+amt (montant net attendu en escrow, positif pour
  // s'aligner avec payout_release/payout_paid). Status='locked' tant que
  // l'escrow n'est pas libere par le cron releasePayouts.
  if (ins.rowCount > 0) {
    try {
      const { recordLedgerEntry } = require('./ledger');
      await recordLedgerEntry(pool, {
        userId: a.user_id,
        appointmentId: a.id,
        appointmentPayoutId: ins.rows[0].id,
        entryType: 'payout_hold',
        amountCents: amt,
        status: 'locked',
        stripePaymentIntentId: piId,
        metadata: { hold_days: safeHold, stripe_account_id: a.stripe_account_id },
      });
    } catch (ledgerErr) {
      console.error('[scheduleAppointmentPayout] ledger payout_hold fail',
        ledgerErr.message || ledgerErr);
    }
  }

  return { ok: true, hold_days: safeHold };
}

/**
 * Annule une row payout en attente (suite a un refund ou cancellation).
 * Aucune action Stripe : on flague juste la row pour que le cron ignore.
 * Si la row n'existe pas (cas RDV pas encore programme) ou est deja
 * 'released', no-op.
 */
async function cancelAppointmentPayout(pool, appointmentId, reason = 'cancelled') {
  const r = await pool.query(`
    UPDATE appointment_payouts
       SET status = 'cancelled',
           cancelled_reason = $2,
           updated_at = NOW()
     WHERE appointment_id = $1 AND status = 'pending'
     RETURNING id
  `, [appointmentId, reason]);
  return { ok: true, cancelled: r.rowCount > 0 };
}

module.exports = { scheduleAppointmentPayout, cancelAppointmentPayout };
