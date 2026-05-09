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
//   type='revenue'           : SUM(amount) WHERE type='revenue' donne
//                              automatiquement le CA NET (revenus - refunds).
//   amount=-X                : valeur EUR negative (X cents -> X/100 EUR).
//   source='rdv_refund'      : discriminant pour les KPIs Performance et
//                              les filtres de campagnes (amount > 0 exclut).
//   payment_method='card_online' : meme moyen que le rdv_online correspondant.
//   locked=TRUE              : ligne caisse non-editable cote UI.
//   qty_total=0              : refund != prestation (sinon le compteur
//                              'nb prestations' du jour s'incremente a tort).

/**
 * Insere une transaction 'rdv_refund' pour un RDV. Idempotent.
 *
 * @param {object}   pool             - pg Pool
 * @param {object}   opts
 * @param {string}   opts.appointmentId - UUID du RDV
 * @param {number}   opts.refundedCents - Montant rembourse en cents (positif)
 * @returns {Promise<{ ok:boolean, inserted?:boolean, reason?:string, error?:string }>}
 *          ok=true + inserted=true   : row creee
 *          ok=true + inserted=false  : row deja existante (race-safe), no-op
 *          ok=true + reason='no_amount' : refundedCents <= 0, rien a faire
 *          ok=true + reason='appt_not_found' : RDV introuvable
 *          ok=false + error          : erreur SQL inattendue
 */
async function recordRefundTransaction(pool, { appointmentId, refundedCents }) {
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
  const negAmount  = -(cents / 100);
  const desc       = `Remboursement RDV — ${clientName || 'client'}`;
  const now        = new Date();

  try {
    const ins = await pool.query(
      `INSERT INTO transactions
         (user_id, type, amount, description, employee_id, payment_method,
          date, time, datetime_iso, appointment_id, source, locked, qty_total)
       VALUES ($1,'revenue',$2,$3,$4,'card_online',$5,$6,$7,$8,'rdv_refund',TRUE,0)
       ON CONFLICT (appointment_id) WHERE source = 'rdv_refund' DO NOTHING
       RETURNING id`,
      [userId, negAmount, desc, employeeId || null,
       now.toISOString().substring(0, 10),
       now.toTimeString().substring(0, 8),
       now.toISOString(), appointmentId]
    );
    return { ok: true, inserted: ins.rowCount > 0 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { recordRefundTransaction };
