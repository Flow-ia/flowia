// utils/transactionLock.js — Verrouillage cote frontend pour /historique.
//
// Miroir du backend Commit E : determine si une transaction peut etre
// modifiee ou supprimee par le commercant via le drawer detail. Les
// transactions Stripe (paiement en ligne), remboursements et reservations
// online_booking sont en lecture seule (anti-fraude + cohérence comptable).
//
// IMPORTANT : la verification reelle reste cote backend (PIN admin + lock).
// Ce helper est uniquement UX pour griser/cacher les actions destructives.

const LOCKED_STATUSES = new Set(["REFUNDED", "STRIPE_100", "STRIPE_ACOMPTE"]);

export function isTransactionLocked(tx) {
  if (!tx) return true;
  if (tx.stripe_payment_intent_id) return true;
  if (LOCKED_STATUSES.has(tx.payment_status)) return true;
  if (tx.payment_type === "refund") return true;
  if (tx.payment_method === "card_online") return true;
  if (tx.payment_source === "online_booking") return true;
  return false;
}

export function lockReason(tx) {
  if (!tx) return "Transaction introuvable";
  if (tx.stripe_payment_intent_id) return "Paiement Stripe non modifiable";
  if (tx.payment_status === "REFUNDED") return "Transaction remboursée non modifiable";
  if (tx.payment_status === "STRIPE_100" || tx.payment_status === "STRIPE_ACOMPTE") {
    return "Paiement Stripe non modifiable";
  }
  if (tx.payment_type === "refund") return "Ligne de remboursement non modifiable";
  if (tx.payment_method === "card_online") return "Paiement en ligne non modifiable";
  if (tx.payment_source === "online_booking") return "Réservation en ligne non modifiable";
  return null;
}
