// scripts/fix-escrow-amounts.js — corrige amount_cents sur les
// appointment_payouts pending dont le montant a ete calcule sans
// soustraire stripe_fee (bug pre-fix 2026-05-12).
//
// Pour chaque row pending :
//   1. Retrieve charge.balance_transaction.fee depuis Stripe (via PI)
//   2. netCents = gross - app_fee - stripe_fee
//   3. UPDATE appointment_payouts SET amount_cents = netCents
//      WHERE status='pending' AND amount_cents > netCents
//      (= ne touche que si surevalue ; idempotent)
//   4. INSERT ledger entry stripe_fee si absente
//   5. UPDATE transactions.stripe_fee_cents/net_amount_cents si rdv_online
//      a stripe_fee_cents=0
//
// USAGE :
//   node scripts/fix-escrow-amounts.js                 # dry-run
//   node scripts/fix-escrow-amounts.js --apply         # ecrit
//   node scripts/fix-escrow-amounts.js --user UUID     # 1 merchant
//
// Idempotent : peut etre relance sans risque (UNIQUE indexes + WHERE garde-fou).

require('dotenv').config();
const Stripe = require('stripe');
const { pool } = require('../src/db');
const { fetchStripeFeeForPI } = require('../src/utils/stripeFeeForPI');
const { recordLedgerEntry } = require('../src/utils/ledger');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

const args = parseArgs();
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
  console.log('=== fix-escrow-amounts ' + (args.apply ? '(APPLY)' : '(DRY-RUN)') + ' ===');
  const bal = await stripe.balance.retrieve();
  console.log('Stripe mode:', bal.livemode ? 'LIVE' : 'TEST');

  const params = [];
  let where = `ap.status = 'pending' AND ap.stripe_payout_id IS NULL`;
  if (args.user) {
    params.push(args.user);
    where += ` AND ap.user_id = $${params.length}`;
  }
  const { rows } = await pool.query(`
    SELECT ap.id AS escrow_id, ap.appointment_id, ap.amount_cents, ap.user_id,
           ap.payment_intent_id, ap.stripe_account_id,
           a.paid_amount_cents, a.stripe_payment_intent_id AS appt_pi
      FROM appointment_payouts ap
      LEFT JOIN appointments a ON a.id = ap.appointment_id
     WHERE ${where}
     ORDER BY ap.created_at ASC
  `, params);

  console.log('Escrows pending a inspecter :', rows.length);
  if (!rows.length) return;

  const report = { scanned: 0, fixed: 0, already_ok: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    report.scanned++;
    const piId = row.payment_intent_id || row.appt_pi;
    if (!piId) {
      report.skipped++;
      report.errors.push({ escrow_id: row.escrow_id, reason: 'no_pi_id' });
      continue;
    }
    try {
      const pi = await stripe.paymentIntents.retrieve(
        piId, undefined, { stripeAccount: row.stripe_account_id });
      const gross = pi.amount_received || pi.amount || row.paid_amount_cents || 0;
      const appFee = pi.application_fee_amount || 0;
      const feeRes = await fetchStripeFeeForPI(
        stripe, pi, row.stripe_account_id, { retries: 1, retryDelayMs: 1000 });
      if (feeRes.source !== 'bt') {
        report.skipped++;
        report.errors.push({
          escrow_id: row.escrow_id, reason: 'fee_unavailable', detail: feeRes.error,
        });
        continue;
      }
      const stripeFee = feeRes.stripeFee;
      const netCents = gross - appFee - stripeFee;
      const drift = Number(row.amount_cents) - netCents;

      if (drift <= 0) {
        // amount actuel <= net reel : OK ou meme sous-evalue, on ne touche pas
        report.already_ok++;
        console.log(`  [OK] escrow=${row.escrow_id} amount=${row.amount_cents} <= net=${netCents}`);
        continue;
      }

      console.log(`  [FIX] escrow=${row.escrow_id} appt=${row.appointment_id} ` +
        `gross=${gross} app_fee=${appFee} stripe_fee=${stripeFee} ` +
        `OLD amount=${row.amount_cents} NEW amount=${netCents} drift=${drift}`);

      if (!args.apply) {
        report.fixed++;
        continue;
      }

      // 1. UPDATE escrow amount
      await pool.query(`
        UPDATE appointment_payouts
           SET amount_cents = $2, updated_at = NOW()
         WHERE id = $1 AND status = 'pending' AND amount_cents > $2
      `, [row.escrow_id, netCents]);

      // 2. INSERT ledger stripe_fee si manquante (idempotent UNIQUE index)
      await recordLedgerEntry(pool, {
        userId: row.user_id,
        appointmentId: row.appointment_id,
        entryType: 'stripe_fee',
        amountCents: -stripeFee,
        status: 'pending',
        stripePaymentIntentId: piId,
        metadata: { source: 'fix_escrow_amounts_backfill' },
      });

      // 3. UPDATE transactions.stripe_fee_cents si manquant
      await pool.query(`
        UPDATE transactions
           SET stripe_fee_cents = $2,
               net_amount_cents = $3
         WHERE stripe_payment_intent_id = $1
           AND source = 'rdv_online'
           AND (stripe_fee_cents IS NULL OR stripe_fee_cents = 0)
      `, [piId, stripeFee, netCents]);

      report.fixed++;
    } catch (e) {
      report.errors.push({ escrow_id: row.escrow_id, error: e.message });
      console.error(`  [ERR] escrow=${row.escrow_id}`, e.message);
    }
  }

  console.log('\n=== REPORT ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(e => {
  console.error('FATAL', e);
  process.exitCode = 1;
}).finally(() => pool.end());
