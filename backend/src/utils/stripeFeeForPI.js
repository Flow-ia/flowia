// utils/stripeFeeForPI.js — helper centralise pour recuperer les frais
// Stripe (balance_transaction.fee) sur un PaymentIntent.
//
// Pourquoi un helper dedie : la formule "net merchant" se calcule
// gross - application_fee_amount - stripe_fee. Sans le stripe_fee, le
// payout demande plus que ce qui est disponible sur le balance Connect
// -> Stripe rejette en 'balance_insufficient' et le cron releasePayouts
// retentera 5x avant 'failed'. Bug observe 2026-05-12 lors de la QA E2E.
//
// 3 callers :
//   - book.js (sync, race-safe) : appel best-effort sans retry pour ne pas
//     trop allonger la latence /book. Si fee=null -> fallback amount sans fee
//     + UPDATE rectifiera plus tard depuis le webhook.
//   - stripe-connect.js webhook payment_intent.succeeded : appel avec retry
//     court (1x apres 2s) car balance_transaction parfois pas dispo
//     immediatement apres confirm.
//   - backfill-escrow-ledger.js : appel obligatoire sur charges anciennes,
//     balance_transaction toujours dispo (charge stabilisee).

/**
 * Recupere stripe_fee (cents) depuis charge.balance_transaction.fee.
 *
 * @param {object} stripe instance Stripe SDK
 * @param {string|object} piOrId payment_intent id ou objet PI
 * @param {string} accountId stripe_account_id du merchant (header)
 * @param {object} opts
 *   - retries   number, default 0 (0 = best-effort sync, 1 = webhook).
 *   - retryDelayMs number, default 2000.
 * @returns {Promise<{stripeFee: number|null, source: 'bt'|'fallback'|null,
 *                    error: string|null, latencyMs: number}>}
 *   stripeFee : cents, ou null si introuvable. source='bt' si vraie valeur
 *   Stripe, 'fallback' si on n'a rien (caller doit decider).
 */
async function fetchStripeFeeForPI(stripe, piOrId, accountId, opts = {}) {
  const startMs = Date.now();
  const retries = Number.isFinite(opts.retries) ? opts.retries : 0;
  const delay   = Number.isFinite(opts.retryDelayMs) ? opts.retryDelayMs : 2000;

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, delay));
    try {
      let pi = piOrId;
      if (typeof piOrId === 'string') {
        pi = await stripe.paymentIntents.retrieve(
          piOrId, undefined, { stripeAccount: accountId });
      }
      const chargeId = pi.latest_charge || pi.charges?.data?.[0]?.id || null;
      if (!chargeId) {
        lastErr = 'no_latest_charge';
        continue;
      }
      const ch = await stripe.charges.retrieve(
        chargeId, undefined, { stripeAccount: accountId });
      if (!ch?.balance_transaction) {
        lastErr = 'balance_transaction_not_yet_available';
        continue;
      }
      const btId = typeof ch.balance_transaction === 'string'
        ? ch.balance_transaction
        : ch.balance_transaction.id;
      const bt = await stripe.balanceTransactions.retrieve(
        btId, undefined, { stripeAccount: accountId });
      const fee = bt?.fee;
      if (typeof fee !== 'number') {
        lastErr = 'fee_missing_on_balance_transaction';
        continue;
      }
      return {
        stripeFee: fee,
        source: 'bt',
        error: null,
        latencyMs: Date.now() - startMs,
      };
    } catch (e) {
      lastErr = e?.message || String(e);
    }
  }

  return {
    stripeFee: null,
    source: null,
    error: lastErr,
    latencyMs: Date.now() - startMs,
  };
}

module.exports = { fetchStripeFeeForPI };
