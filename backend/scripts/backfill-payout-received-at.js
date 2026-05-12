// scripts/backfill-payout-received-at.js — rattrape les transactions
// online dont payout_received_at est NULL alors qu'un payout Stripe
// 'paid' existe pour le meme user et anterieur a la tx.
//
// CONTEXTE 2026-05-12 :
// Le webhook payout.paid stampe transactions.payout_received_at via :
//   UPDATE WHERE source IN ('rdv_online','rdv_refund') AND ...
// Or certaines rows legacy ont source != 'rdv_online' (SMS, fix race,
// chemins anciens) mais portent stripe_payment_intent_id. Le filtre les
// excluait -> stats UI affichait "Payouts recus = 0" alors que la table
// payouts contenait des status='paid'.
//
// Ce script :
//   1. selectionne payouts.status='paid' (et fallback completed_at
//      sinon requested_at pour le cutoff).
//   2. UPDATE transactions WHERE created_at <= cutoff AND
//      payout_received_at IS NULL AND
//      (source IN ('rdv_online','rdv_refund') OR
//       stripe_payment_intent_id IS NOT NULL).
//   3. ne touche QUE les rows non encore stampees par un autre payout
//      (anti-double-stamp).
//
// USAGE :
//   node scripts/backfill-payout-received-at.js              # dry-run (defaut)
//   node scripts/backfill-payout-received-at.js --apply      # ecrit
//   node scripts/backfill-payout-received-at.js --user UUID  # 1 user
//
// Idempotent : peut etre relance sans risque (garde-fou
// payout_received_at IS NULL).

require('dotenv').config();
const { pool } = require('../src/db');

function parseArgs() {
  const out = { apply: false, user: null };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--apply') out.apply = true;
    else if (a[i] === '--user') out.user = a[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs();
  console.log('=== backfill-payout-received-at ' + (args.apply ? '(APPLY)' : '(DRY-RUN)') + ' ===');

  // 1. Inventaire des payouts.paid eligibles
  const userFilter = args.user ? 'AND user_id = $1' : '';
  const userParams = args.user ? [args.user] : [];
  const { rows: payouts } = await pool.query(`
    SELECT id, user_id, stripe_payout_id, amount_cents,
           COALESCE(completed_at, requested_at) AS stamp_at,
           requested_at
      FROM payouts
     WHERE status = 'paid'
       ${userFilter}
     ORDER BY requested_at ASC
  `, userParams);

  console.log('Payouts paid trouves : ' + payouts.length);
  if (!payouts.length) {
    console.log('Rien a backfill.');
    await pool.end();
    return;
  }

  // 2. Pour chaque payout, recenser les tx candidates
  let totalCandidates = 0;
  let totalUpdated    = 0;
  const perUser = {};

  for (const p of payouts) {
    const { rows: candidates } = await pool.query(`
      SELECT id, source, stripe_payment_intent_id, created_at, amount
        FROM transactions
       WHERE user_id = $1
         AND payout_received_at IS NULL
         AND created_at <= $2
         AND (
           source IN ('rdv_online','rdv_refund')
           OR stripe_payment_intent_id IS NOT NULL
         )
         AND NOT EXISTS (
           SELECT 1 FROM transactions t2
            WHERE t2.user_id = transactions.user_id
              AND t2.id <> transactions.id
              AND t2.stripe_payout_id = $3
              AND t2.payout_received_at IS NOT NULL
         )
    `, [p.user_id, p.requested_at, p.stripe_payout_id]);

    totalCandidates += candidates.length;
    perUser[p.user_id] = (perUser[p.user_id] || 0) + candidates.length;

    if (!args.apply) {
      if (candidates.length) {
        console.log(`  payout=${p.stripe_payout_id} user=${p.user_id} amount=${(p.amount_cents/100).toFixed(2)}€ -> ${candidates.length} tx a stamper`);
      }
      continue;
    }

    // APPLY : UPDATE par batch (1 query par payout, atomique implicite)
    const r = await pool.query(`
      UPDATE transactions t
         SET payout_received_at = $4,
             stripe_payout_id   = COALESCE(t.stripe_payout_id, $3)
       WHERE t.user_id = $1
         AND t.payout_received_at IS NULL
         AND t.created_at <= $2
         AND (
           t.source IN ('rdv_online','rdv_refund')
           OR t.stripe_payment_intent_id IS NOT NULL
         )
         AND NOT EXISTS (
           SELECT 1 FROM transactions t2
            WHERE t2.user_id = t.user_id
              AND t2.id <> t.id
              AND t2.stripe_payout_id = $3
              AND t2.payout_received_at IS NOT NULL
         )
    `, [p.user_id, p.requested_at, p.stripe_payout_id, p.stamp_at]);

    totalUpdated += r.rowCount;
    if (r.rowCount) {
      console.log(`  payout=${p.stripe_payout_id} user=${p.user_id} -> ${r.rowCount} tx stampees`);
    }
  }

  console.log('');
  console.log('=== RESUME ===');
  console.log('Payouts traites    : ' + payouts.length);
  console.log('Candidates totales : ' + totalCandidates);
  if (args.apply) {
    console.log('Tx stampees        : ' + totalUpdated);
  } else {
    console.log('(DRY-RUN, rien ecrit. Relancer avec --apply pour appliquer.)');
  }

  // Sanity check final
  const { rows: sanity } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM transactions
        WHERE payout_received_at IS NOT NULL ${args.user ? 'AND user_id = $1' : ''})::int AS tx_stamped,
      (SELECT COUNT(*) FROM payouts
        WHERE status = 'paid' ${args.user ? 'AND user_id = $1' : ''})::int AS payouts_paid
  `, userParams);
  console.log('');
  console.log('Sanity check :');
  console.log('  transactions.payout_received_at NOT NULL : ' + sanity[0].tx_stamped);
  console.log('  payouts.status=paid                      : ' + sanity[0].payouts_paid);

  await pool.end();
}

main().catch(err => {
  console.error('ERREUR :', err.message);
  process.exit(1);
});
