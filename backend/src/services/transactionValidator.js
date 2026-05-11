// transactionValidator.js — Validation anti-double-paiement et calcul du
// reste à encaisser pour le modèle 4-source (refonte v3, Commit 1).
//
// Appelé avant chaque INSERT dans transactions par les routes API du
// Commit 2. Garantit qu'un RDV ne peut pas être encaissé 2 fois (STRIPE_100
// + CASH_PAID), qu'un refund n'est pas appliqué 2 fois, et calcule le
// reste à encaisser quand un acompte Stripe a déjà été payé.
//
// Adaptation au schéma réel : utilise transactions.payment_status (nouvelle
// colonne, 6 valeurs) et appointments.total_price_cents (avec fallback
// total_amount * 100 pour les rows non encore migrées).

const { pool } = require('../db');

const PAID_STATUSES = ['STRIPE_100', 'CASH_PAID'];

// canCreateCashTransaction(appointmentId)
//
// Détermine si un encaissement caisse peut être créé pour ce RDV.
// Retourne :
//   { allow: true,  type: 'full' }                                  → aucun paiement existant, encaisser le total
//   { allow: true,  type: 'remaining', deposit_cents }              → acompte Stripe payé, encaisser le solde
//   { allow: false, reason: 'already_paid', existing_id, status }   → déjà payé (STRIPE_100 ou CASH_PAID)
//   { allow: true,  type: 'full' }                                  → appointmentId NULL (= walk-in)
async function canCreateCashTransaction(appointmentId) {
  if (!appointmentId) return { allow: true, type: 'full' };

  const { rows } = await pool.query(
    `SELECT id, payment_status, gross_amount_cents
       FROM transactions
      WHERE appointment_id = $1
        AND deleted_at IS NULL
        AND payment_status IN ('STRIPE_100','STRIPE_ACOMPTE','CASH_PAID')`,
    [appointmentId]
  );

  const fullyPaid = rows.find(r => PAID_STATUSES.includes(r.payment_status));
  if (fullyPaid) {
    return {
      allow: false,
      reason: 'already_paid',
      existing_id: fullyPaid.id,
      existing_status: fullyPaid.payment_status,
    };
  }

  const deposit = rows.find(r => r.payment_status === 'STRIPE_ACOMPTE');
  if (deposit) {
    return {
      allow: true,
      type: 'remaining',
      deposit_cents: parseInt(deposit.gross_amount_cents || 0, 10),
    };
  }

  return { allow: true, type: 'full' };
}

// getRemainingAmount(appointmentId)
//
// Quand un acompte Stripe a été payé, retourne le reste à encaisser
// (total_price_cents - somme des acomptes). Retourne null si aucun acompte
// ou RDV introuvable.
async function getRemainingAmount(appointmentId) {
  if (!appointmentId) return null;

  const { rows } = await pool.query(
    `SELECT a.total_price_cents,
            a.total_amount,
            COALESCE((
              SELECT SUM(t.gross_amount_cents)
                FROM transactions t
               WHERE t.appointment_id = a.id
                 AND t.deleted_at IS NULL
                 AND t.payment_status = 'STRIPE_ACOMPTE'
            ), 0) AS deposit_cents
       FROM appointments a
      WHERE a.id = $1`,
    [appointmentId]
  );

  if (!rows.length) return null;
  const a = rows[0];
  const depositCents = parseInt(a.deposit_cents || 0, 10);
  if (depositCents <= 0) return null;

  // total_price_cents prioritaire (post-migration v3) ; fallback sur
  // total_amount NUMERIC(10,2) legacy pour les RDV non encore rétro-remplis.
  const totalCents = a.total_price_cents != null
    ? parseInt(a.total_price_cents, 10)
    : (a.total_amount != null ? Math.round(parseFloat(a.total_amount) * 100) : 0);

  return {
    total_cents: totalCents,
    deposit_cents: depositCents,
    remaining_cents: Math.max(0, totalCents - depositCents),
  };
}

// canRefund(transactionId)
//
// Vérifie qu'aucun remboursement n'a déjà été enregistré pour cette
// transaction (même tx ou row REFUNDED partageant le stripe_payment_intent_id).
// Retourne :
//   { allow: true,  transaction }                          → refund possible
//   { allow: false, reason: 'transaction_not_found' }
//   { allow: false, reason: 'already_refunded' }
//   { allow: false, reason: 'refund_already_recorded', existing_refund_id }
async function canRefund(transactionId) {
  if (!transactionId) {
    return { allow: false, reason: 'missing_transaction_id' };
  }

  const { rows: txRows } = await pool.query(
    `SELECT id, user_id, appointment_id, payment_status, payment_type,
            stripe_payment_intent_id, stripe_charge_id,
            gross_amount_cents, amount
       FROM transactions
      WHERE id = $1`,
    [transactionId]
  );

  if (!txRows.length) {
    return { allow: false, reason: 'transaction_not_found' };
  }

  const tx = txRows[0];

  if (tx.payment_status === 'REFUNDED') {
    return { allow: false, reason: 'already_refunded' };
  }

  // Si la transaction d'origine porte un stripe_payment_intent_id, vérifier
  // qu'aucune row REFUNDED associée n'existe déjà (peut arriver via webhook
  // charge.refunded reçu en doublon ou via refund déclenché depuis le
  // dashboard Stripe).
  if (tx.stripe_payment_intent_id) {
    const { rows: existingRefund } = await pool.query(
      `SELECT id FROM transactions
        WHERE payment_status = 'REFUNDED'
          AND stripe_payment_intent_id = $1
          AND id <> $2
        LIMIT 1`,
      [tx.stripe_payment_intent_id, transactionId]
    );
    if (existingRefund.length) {
      return {
        allow: false,
        reason: 'refund_already_recorded',
        existing_refund_id: existingRefund[0].id,
      };
    }
  }

  return { allow: true, transaction: tx };
}

module.exports = {
  canCreateCashTransaction,
  getRemainingAmount,
  canRefund,
};
