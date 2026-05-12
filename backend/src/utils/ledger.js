// utils/ledger.js — helper centralise pour ecrire dans financial_ledger.
//
// Phase 2 (dual-write) : appele en parallele des INSERT legacy
// (transactions, appointment_payouts, payouts). Le ledger n'est PAS encore
// source de verite — il sera valide via script de comparaison (phase 3)
// avant bascule UI (phase 4).
//
// Idempotence DB-level : UNIQUE INDEX partiels sur (stripe_payment_intent_id,
// entry_type) / (stripe_refund_id, entry_type) / (stripe_payout_id,
// entry_type) garantissent qu'un retry webhook ne cree pas de doublon.
// ON CONFLICT DO NOTHING : si une row existe deja, on no-op et on retourne
// l'id existant pour permettre le chainage (related_ledger_id).
//
// Convention amount_cents (BIGINT signe) :
//   payment        : positif (entree merchant)
//   stripe_fee     : negatif (sortie merchant)
//   commission     : negatif (sortie merchant, va a la plateforme FlowIA)
//   refund         : negatif (sortie merchant)
//   payout_hold    : negatif (sortie merchant, mise en escrow)
//   payout_release : negatif (sortie merchant, libere vers IBAN)
//   payout_paid    : informationnel (montant payout confirme)
//
// Best-effort : toute erreur d'INSERT est loggee mais n'est jamais relevee
// au caller. Le flow business (Stripe + tables legacy) doit continuer meme
// si le ledger ecriture echoue. Phase 4 (bascule UI) sera bloquee tant que
// le script de comparaison phase 3 ne reporte pas 0 ecart.

/**
 * INSERT idempotent dans financial_ledger.
 *
 * @param {object} pool pg Pool
 * @param {object} entry
 *   - userId               (UUID, requis)
 *   - entryType            ('payment'|'stripe_fee'|'commission'|'refund'|
 *                           'payout_hold'|'payout_release'|'payout_paid', requis)
 *   - amountCents          (BIGINT signe, requis)
 *   - appointmentId        (UUID|null)
 *   - appointmentPayoutId  (UUID|null)
 *   - currency             ('EUR' par defaut)
 *   - status               ('pending'|'available'|'locked'|'paid'|'refunded'|'failed',
 *                           'pending' par defaut)
 *   - stripePaymentIntentId, stripeChargeId, stripeRefundId, stripePayoutId,
 *     stripeBalanceTxnId   (VARCHAR|null)
 *   - commissionRateSnapshot (NUMERIC|null) — % FlowIA fige au moment du
 *                            payment ; pour les autres entry_types, null
 *   - relatedLedgerId      (UUID|null) — chainage refund→payment etc.
 *   - occurredAt           (Date|ISO|null) — defaut NOW()
 *   - metadata             (object) — JSONB, defaut {}
 *
 * @returns {Promise<{ok:boolean, inserted:boolean, id:string|null, error?:string}>}
 *   ok=true + inserted=true   : row creee
 *   ok=true + inserted=false  : row existait deja (conflit unique index) — id = existant
 *   ok=false                  : erreur SQL, ledger non ecrit, business flow doit continuer
 */
async function recordLedgerEntry(pool, entry) {
  if (!entry || !entry.userId || !entry.entryType || entry.amountCents == null) {
    return { ok: false, inserted: false, id: null, error: 'missing required fields' };
  }
  const params = [
    entry.userId,
    entry.appointmentId || null,
    entry.appointmentPayoutId || null,
    entry.entryType,
    entry.amountCents,
    (entry.currency || 'EUR').toUpperCase(),
    entry.status || 'pending',
    entry.stripePaymentIntentId || null,
    entry.stripeChargeId || null,
    entry.stripeRefundId || null,
    entry.stripePayoutId || null,
    entry.stripeBalanceTxnId || null,
    entry.commissionRateSnapshot != null ? entry.commissionRateSnapshot : null,
    entry.relatedLedgerId || null,
    entry.occurredAt || null,
    JSON.stringify(entry.metadata || {}),
  ];
  try {
    const { rows } = await pool.query(`
      INSERT INTO financial_ledger
        (user_id, appointment_id, appointment_payout_id, entry_type,
         amount_cents, currency, status,
         stripe_payment_intent_id, stripe_charge_id, stripe_refund_id,
         stripe_payout_id, stripe_balance_txn_id,
         commission_rate_snapshot, related_ledger_id,
         occurred_at, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
              COALESCE($15::timestamptz, NOW()), $16::jsonb)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, params);

    if (rows.length > 0) {
      return { ok: true, inserted: true, id: rows[0].id };
    }
    // Conflit unique : lookup id existant pour permettre le chainage.
    const existing = await lookupExistingId(pool, entry);
    return { ok: true, inserted: false, id: existing };
  } catch (e) {
    console.error('[ledger] insert fail entry_type=' + entry.entryType
      + ' user=' + entry.userId
      + ' pi=' + (entry.stripePaymentIntentId || '-')
      + ' err=' + (e.message || e));
    return { ok: false, inserted: false, id: null, error: e.message || String(e) };
  }
}

// Lookup l'id existant via la cle unique qui a probablement matche.
// Retourne null si rien trouve (cas tres rare : conflit sur autre contrainte).
async function lookupExistingId(pool, entry) {
  let sql, args;
  if (entry.stripePaymentIntentId &&
      ['payment', 'commission', 'stripe_fee'].includes(entry.entryType)) {
    sql = `SELECT id FROM financial_ledger
            WHERE stripe_payment_intent_id = $1 AND entry_type = $2
            LIMIT 1`;
    args = [entry.stripePaymentIntentId, entry.entryType];
  } else if (entry.stripeRefundId && entry.entryType === 'refund') {
    sql = `SELECT id FROM financial_ledger
            WHERE stripe_refund_id = $1 AND entry_type = 'refund'
            LIMIT 1`;
    args = [entry.stripeRefundId];
  } else if (entry.stripePayoutId &&
             ['payout_release', 'payout_paid'].includes(entry.entryType)) {
    sql = `SELECT id FROM financial_ledger
            WHERE stripe_payout_id = $1 AND entry_type = $2
            LIMIT 1`;
    args = [entry.stripePayoutId, entry.entryType];
  } else {
    return null;
  }
  try {
    const { rows } = await pool.query(sql, args);
    return rows[0]?.id || null;
  } catch {
    return null;
  }
}

/**
 * UPDATE status des entries ledger liees a un payout Stripe.
 * Utilise sur payout.paid (status='paid') / payout.failed (status='failed').
 *
 * 2 strategies :
 *   (a) Si stripePayoutId fourni : match direct via stripe_payout_id
 *       (cas escrow release qui a deja insere payout_release avec ce payout_id).
 *   (b) Si appointmentId fourni en plus : match via appointment_id pour
 *       cibler les payment/commission/stripe_fee de ce RDV specifique
 *       (cas escrow ou metadata.appointment_id est present).
 *
 * @returns {Promise<{ok:boolean, updated:number}>}
 */
async function updateLedgerStatusForPayout(pool, { stripePayoutId, appointmentId, newStatus, failureMessage }) {
  if (!newStatus || !['paid', 'failed', 'available', 'locked'].includes(newStatus)) {
    return { ok: false, updated: 0, error: 'invalid status' };
  }
  try {
    if (appointmentId) {
      // Cible payment/commission/stripe_fee + payout_release de cet appointment.
      // payment_intent.succeeded a deja ecrit ces rows en status='pending' ;
      // on les passe a 'paid' (succes) ou 'failed' (echec virement).
      const r = await pool.query(`
        UPDATE financial_ledger
           SET status = $2,
               stripe_payout_id = COALESCE(stripe_payout_id, $3),
               metadata = CASE WHEN $4::text IS NOT NULL
                               THEN COALESCE(metadata,'{}'::jsonb)
                                    || jsonb_build_object('failure_message', $4::text)
                               ELSE metadata END
         WHERE appointment_id = $1
           AND status IN ('pending','available','locked')
           AND entry_type IN ('payment','commission','stripe_fee','payout_hold','payout_release')
      `, [appointmentId, newStatus, stripePayoutId || null, failureMessage || null]);
      return { ok: true, updated: r.rowCount };
    }
    if (stripePayoutId) {
      const r = await pool.query(`
        UPDATE financial_ledger
           SET status = $2,
               metadata = CASE WHEN $3::text IS NOT NULL
                               THEN COALESCE(metadata,'{}'::jsonb)
                                    || jsonb_build_object('failure_message', $3::text)
                               ELSE metadata END
         WHERE stripe_payout_id = $1
           AND status IN ('pending','available','locked')
      `, [stripePayoutId, newStatus, failureMessage || null]);
      return { ok: true, updated: r.rowCount };
    }
    return { ok: false, updated: 0, error: 'no key provided' };
  } catch (e) {
    console.error('[ledger] updateStatusForPayout fail err=' + (e.message || e));
    return { ok: false, updated: 0, error: e.message || String(e) };
  }
}

/**
 * UPDATE status d'une chaine d'entries liees a un PaymentIntent vers 'refunded'.
 * Appele depuis charge.refunded webhook + refundAppointment.js apres succes.
 * Idempotent : ne touche que les rows pas deja en 'refunded'/'failed'.
 */
async function markLedgerEntriesRefunded(pool, { stripePaymentIntentId, appointmentId }) {
  try {
    if (stripePaymentIntentId) {
      const r = await pool.query(`
        UPDATE financial_ledger
           SET status = 'refunded'
         WHERE stripe_payment_intent_id = $1
           AND entry_type IN ('payment','commission','stripe_fee')
           AND status NOT IN ('refunded','failed')
      `, [stripePaymentIntentId]);
      return { ok: true, updated: r.rowCount };
    }
    if (appointmentId) {
      const r = await pool.query(`
        UPDATE financial_ledger
           SET status = 'refunded'
         WHERE appointment_id = $1
           AND entry_type IN ('payment','commission','stripe_fee')
           AND status NOT IN ('refunded','failed')
      `, [appointmentId]);
      return { ok: true, updated: r.rowCount };
    }
    return { ok: false, updated: 0 };
  } catch (e) {
    console.error('[ledger] markRefunded fail err=' + (e.message || e));
    return { ok: false, updated: 0, error: e.message || String(e) };
  }
}

/**
 * Lookup le ledger entry 'payment' d'un PaymentIntent pour chainage
 * related_ledger_id (refund pointe vers payment, etc.).
 */
async function findPaymentEntryByPi(pool, paymentIntentId) {
  if (!paymentIntentId) return null;
  try {
    const { rows } = await pool.query(`
      SELECT id FROM financial_ledger
       WHERE stripe_payment_intent_id = $1 AND entry_type = 'payment'
       LIMIT 1
    `, [paymentIntentId]);
    return rows[0]?.id || null;
  } catch {
    return null;
  }
}

module.exports = {
  recordLedgerEntry,
  updateLedgerStatusForPayout,
  markLedgerEntriesRefunded,
  findPaymentEntryByPi,
};
