// utils/recordRefundTransaction.js — Insert d'une row 'rdv_refund' dans
// `transactions` (caisse / historique / stats merchant).
//
// Source unique de verite pour les 2 chemins de refund :
//   (a) sync : utils/refundAppointment.js apres l'appel API Stripe refund
//       reussi (annulation client/merchant via le flow FlowIA).
//   (b) async : routes/stripe-connect.js webhook charge.refunded (refund
//       initie depuis le Stripe Dashboard direct, hors flow FlowIA).
//
// Idempotence : ON CONFLICT (appointment_id) WHERE source='rdv_refund'
// DO NOTHING via index unique partiel idx_transactions_rdv_refund_appt
// -> 1 seule row par appointment quel que soit l'ordre/le nombre
// d'appels concurrents.
//
// Conventions de la row inseree :
//   type='revenue'           : SUM(amount) WHERE source='rdv_refund' donne
//                              le total rembourse (positif) — les KPIs
//                              soustraient ce montant du CA brut au lieu de
//                              s'appuyer sur le signe legacy.
//   amount=+X                : valeur EUR POSITIVE. Le CHECK constraint
//                              transactions_amount_nonneg (amount >= 0) interdit
//                              les valeurs negatives. Le sens refund est porte
//                              par payment_status='REFUNDED' + source='rdv_refund'.
//   source='rdv_refund'      : discriminant pour les KPIs Performance et
//                              les filtres de campagnes.
//   payment_method='card_online' : meme moyen que le rdv_online correspondant.
//   locked=TRUE              : ligne caisse non-editable cote UI.
//   qty_total=0              : refund != prestation (sinon le compteur
//                              'nb prestations' du jour s'incremente a tort).

/**
 * Insere une transaction 'rdv_refund' pour un RDV. Idempotent.
 *
 * @param {object}   pool                - pg Pool
 * @param {object}   opts
 * @param {string}   opts.appointmentId  - UUID du RDV
 * @param {number}   opts.refundedCents  - Montant rembourse en cents (positif)
 * @param {string?}  opts.stripeRefundId - ID Stripe du refund (re_xxx). Optional ;
 *                                         set sur la row refund ET sur la row originale.
 * @returns {Promise<{ ok:boolean, inserted?:boolean, reason?:string, error?:string }>}
 *          ok=true + inserted=true   : row creee
 *          ok=true + inserted=false  : row deja existante (race-safe), no-op
 *          ok=true + reason='no_amount' : refundedCents <= 0, rien a faire
 *          ok=true + reason='appt_not_found' : RDV introuvable
 *          ok=false + error          : erreur SQL inattendue
 */
async function recordRefundTransaction(pool, { appointmentId, refundedCents, stripeRefundId = null }) {
  if (!appointmentId) return { ok: false, error: 'appointmentId requis' };
  const cents = Number(refundedCents || 0);
  if (cents <= 0) return { ok: true, inserted: false, reason: 'no_amount' };

  // Lit les champs necessaires depuis appointments (client_name pour la
  // description visible /historique, user_id et employee_id pour le scope
  // multi-tenant + KPI par employe).
  const { rows } = await pool.query(
    `SELECT user_id, client_name, employee_id
       FROM appointments
      WHERE id = $1
      LIMIT 1`,
    [appointmentId]
  );
  if (!rows.length) return { ok: true, inserted: false, reason: 'appt_not_found' };

  const { user_id: userId, client_name: clientName, employee_id: employeeId } = rows[0];
  // CHECK constraint transactions_amount_nonneg interdit amount<0. On stocke
  // donc une valeur POSITIVE ; le sens "refund" est porte par
  // payment_status='REFUNDED' + payment_type='refund' + source='rdv_refund'.
  const posAmount = cents / 100;
  const desc      = `Remboursement RDV — ${clientName || 'client'}`;
  const now       = new Date();

  // M2f — INSERT rdv_refund + UPDATE rdv_online dans UNE SEULE transaction.
  // Avant : 2 pool.query separes + UPDATE en catch SILENCIEUX -> si l'UPDATE
  // echouait, la row rdv_online restait STRIPE_100 et etait comptee dans le
  // CA brut alors que l'argent etait rembourse (CA surevalue, regle "ops
  // financieres jamais fail-safe"). Desormais atomique : si l'UPDATE echoue,
  // tout rollback et on renvoie ok=false. Backstop : le webhook
  // charge.refunded rejouera (recordRefundTransaction idempotent via
  // ON CONFLICT) et completera les 2 ops.
  const client = await pool.connect();
  let inserted = false;
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO transactions
         (user_id, type, amount, description, employee_id, payment_method,
          date, time, datetime_iso, appointment_id, source, locked, qty_total,
          payment_source, payment_status, payment_type,
          gross_amount_cents, net_amount_cents, refunded_at, stripe_refund_id)
       VALUES ($1,'revenue',$2,$3,$4,'card_online',$5,$6,$7,$8,'rdv_refund',TRUE,0,
               'online_booking','REFUNDED','refund',
               $9,$9, NOW(), $10)
       ON CONFLICT (appointment_id) WHERE source = 'rdv_refund' DO NOTHING
       RETURNING id`,
      [userId, posAmount, desc, employeeId || null,
       now.toISOString().substring(0, 10),
       now.toTimeString().substring(0, 8),
       now.toISOString(), appointmentId,
       cents, stripeRefundId]
    );
    inserted = ins.rowCount > 0;
    // Met aussi a jour la transaction d'origine 'rdv_online' pour qu'elle
    // reflete le statut REFUNDED (les KPIs en ligne passent du brut au net).
    // PLUS de catch silencieux : un echec ici rollback l'insert refund.
    if (inserted) {
      await client.query(
        `UPDATE transactions
            SET payment_status   = 'REFUNDED',
                refunded_at      = COALESCE(refunded_at, NOW()),
                stripe_refund_id = COALESCE(stripe_refund_id, $2)
          WHERE appointment_id = $1
            AND source = 'rdv_online'`,
        [appointmentId, stripeRefundId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return { ok: false, error: e.message };
  } finally {
    client.release();
  }
  if (inserted) {
    // Invalide le cache stats v3 du user (refund visible immediat dans
    // /historique). Side-effect non-DB -> apres COMMIT.
    try {
      const { invalidateUserStatsCache } = require('./paymentV3');
      invalidateUserStatsCache(userId);
    } catch {}
  }
  return { ok: true, inserted };
}

module.exports = { recordRefundTransaction };
