// utils/transactionLock.js — Verrouillage anti-fraude pour les opérations
// destructives (PATCH / DELETE) sur transactions. Miroir exact du helper
// frontend (utils/transactionLock.js) — toute modification doit être
// répliquée des 2 côtés pour cohérence UX/serveur.
//
// Règle métier : un commerçant ne peut éditer/supprimer que ses propres
// encaissements caisse (cash, walk-in, RDV manuel). Tout ce qui touche à
// Stripe (paiement en ligne / acompte / remboursement) est verrouillé :
//   - audit comptable FEC (les frais Stripe et la traçabilité PI doivent
//     être préservés)
//   - anti-fraude (impossible de fabriquer un faux remboursement en
//     supprimant la ligne Stripe et en repartant à zéro)
//   - cohérence Stripe Connect (PI / refund / payout liés)

const LOCKED_STATUSES = new Set(["REFUNDED", "STRIPE_100", "STRIPE_ACOMPTE"]);

function isTransactionLocked(tx) {
  if (!tx) return true;
  if (tx.stripe_payment_intent_id) return true;
  if (LOCKED_STATUSES.has(tx.payment_status)) return true;
  if (tx.payment_type === "refund") return true;
  if (tx.payment_method === "card_online") return true;
  if (tx.payment_source === "online_booking") return true;
  return false;
}

function lockReason(tx) {
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

module.exports = { isTransactionLocked, lockReason };
