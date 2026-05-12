// scripts/backfill-escrow-ledger.js
//
// Backfill ponctuel pour reparer l'historique avant fix du commit 52f0f78
// (race condition webhook qui laissait appointment_payouts + financial_ledger
// vides alors que transactions OK).
//
// Pour chaque transaction source='rdv_online' SANS escrow correspondant :
//   1. INSERT appointment_payouts (status='pending', release_at calcule)
//   2. INSERT ledger payment + commission + stripe_fee (status='pending')
//
// Puis pour chaque transaction source='rdv_refund' SANS ledger refund :
//   3. INSERT ledger refund (status='refunded', amount negatif)
//   4. UPDATE ledger payment/commission/stripe_fee SET status='refunded'
//   5. UPDATE appointment_payouts SET status='cancelled' (escrow annule)
//
// Idempotent via UNIQUE INDEX partiels du ledger + ON CONFLICT
// appointment_payouts.appointment_id.
//
// USAGE :
//   cd backend && node scripts/backfill-escrow-ledger.js              # dry-run
//   node scripts/backfill-escrow-ledger.js --apply                    # vraiment ecrire
//   node scripts/backfill-escrow-ledger.js --apply --user <uuid>      # 1 user
//   node scripts/backfill-escrow-ledger.js --apply --json > report.json

require('dotenv').config();
const { pool } = require('../src/db');
const { scheduleAppointmentPayout, cancelAppointmentPayout } = require('../src/utils/scheduleAppointmentPayout');
const {
  recordLedgerEntry, markLedgerEntriesRefunded, findPaymentEntryByPi,
} = require('../src/utils/ledger');

function parseArgs() {
  const out = { apply: false, user: null, json: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--user') out.user = argv[++i];
    else if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Usage: node scripts/backfill-escrow-ledger.js [--apply] [--user UUID] [--json]');
      process.exit(0);
    }
  }
  return out;
}
const args = parseArgs();
const log = (...a) => { if (!args.json) console.log(...a); };
const FMT = (cents) => (Number(cents || 0) / 100).toFixed(2) + ' EUR';

const counters = {
  online_found: 0,
  online_processed: 0,
  refund_found: 0,
  refund_processed: 0,
  escrow_created: 0,
  ledger_payment_created: 0,
  ledger_commission_created: 0,
  ledger_stripe_fee_created: 0,
  ledger_refund_created: 0,
  escrow_cancelled: 0,
  payment_marked_refunded: 0,
  errors: [],
};

async function pass1Online() {
  // Trouve les rdv_online qui n'ont PAS d'appointment_payouts row.
  const userFilter = args.user ? ' AND t.user_id = $1' : '';
  const params = args.user ? [args.user] : [];
  const { rows } = await pool.query(`
    SELECT t.id              AS tx_id,
           t.user_id,
           t.appointment_id,
           t.stripe_payment_intent_id,
           t.gross_amount_cents,
           t.stripe_fee_cents,
           t.platform_fee_cents,
           t.net_amount_cents,
           t.payment_status,
           t.payment_type,
           t.created_at,
           t.paid_at,
           a.date AS appt_date,
           a.start_time AS appt_start_time,
           a.payment_status AS appt_payment_status
      FROM transactions t
      JOIN appointments a ON a.id = t.appointment_id
     WHERE t.source = 'rdv_online'
       AND t.deleted_at IS NULL
       AND t.stripe_payment_intent_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM appointment_payouts ap WHERE ap.appointment_id = t.appointment_id
       )
       ${userFilter}
     ORDER BY t.created_at ASC
  `, params);

  counters.online_found = rows.length;
  log('--- PASS 1 : rdv_online sans escrow (' + rows.length + ' rows) ---');

  for (const tx of rows) {
    const grossCents    = parseInt(tx.gross_amount_cents || 0, 10);
    const platformFee   = parseInt(tx.platform_fee_cents || 0, 10);
    const stripeFee     = parseInt(tx.stripe_fee_cents || 0, 10);
    const netCents      = parseInt(tx.net_amount_cents || (grossCents - platformFee - stripeFee), 10);
    // Net pour escrow = montant que le merchant doit recevoir sur balance Connect
    // = gross - application_fee (= platform_fee_cents Stripe). Pas - stripe_fee
    // car stripe_fee est deja deduit du balance Connect par Stripe.
    const escrowAmount  = grossCents - platformFee;
    log('  appt=' + tx.appointment_id.substring(0, 8)
      + ' pi=' + tx.stripe_payment_intent_id.substring(0, 12)
      + ' gross=' + FMT(grossCents)
      + ' fee=' + FMT(stripeFee)
      + ' platform=' + FMT(platformFee)
      + ' net=' + FMT(netCents)
      + ' escrow=' + FMT(escrowAmount));

    if (!args.apply) {
      counters.online_processed++;
      continue;
    }

    try {
      // 1. INSERT escrow + ledger payout_hold via helper (idempotent)
      if (escrowAmount > 0) {
        const sched = await scheduleAppointmentPayout(pool, {
          appointmentId: tx.appointment_id,
          paymentIntentId: tx.stripe_payment_intent_id,
          amountCents: escrowAmount,
        });
        if (sched.ok) counters.escrow_created++;
      }

      // 2. Ledger payment (snapshot rate calcule depuis platform_fee_cents fige)
      const rateSnapshot = grossCents > 0
        ? Math.round((platformFee / grossCents) * 10000) / 100 : null;
      const paymentRes = await recordLedgerEntry(pool, {
        userId: tx.user_id,
        appointmentId: tx.appointment_id,
        entryType: 'payment',
        amountCents: grossCents,
        status: 'pending',
        stripePaymentIntentId: tx.stripe_payment_intent_id,
        commissionRateSnapshot: rateSnapshot,
        occurredAt: tx.paid_at || tx.created_at,
        metadata: { source: 'backfill_2026_05_12', tx_id: tx.tx_id },
      });
      if (paymentRes.inserted) counters.ledger_payment_created++;

      // 3. Ledger commission (si > 0)
      if (platformFee > 0) {
        const r = await recordLedgerEntry(pool, {
          userId: tx.user_id,
          appointmentId: tx.appointment_id,
          entryType: 'commission',
          amountCents: -platformFee,
          status: 'pending',
          stripePaymentIntentId: tx.stripe_payment_intent_id,
          commissionRateSnapshot: rateSnapshot,
          relatedLedgerId: paymentRes.id,
          occurredAt: tx.paid_at || tx.created_at,
          metadata: { source: 'backfill_2026_05_12' },
        });
        if (r.inserted) counters.ledger_commission_created++;
      }

      // 4. Ledger stripe_fee (si > 0)
      if (stripeFee > 0) {
        const r = await recordLedgerEntry(pool, {
          userId: tx.user_id,
          appointmentId: tx.appointment_id,
          entryType: 'stripe_fee',
          amountCents: -stripeFee,
          status: 'pending',
          stripePaymentIntentId: tx.stripe_payment_intent_id,
          relatedLedgerId: paymentRes.id,
          occurredAt: tx.paid_at || tx.created_at,
          metadata: { source: 'backfill_2026_05_12' },
        });
        if (r.inserted) counters.ledger_stripe_fee_created++;
      }

      counters.online_processed++;
    } catch (e) {
      counters.errors.push({ pass: 1, tx_id: tx.tx_id, error: e.message });
      log('    ERR : ' + e.message);
    }
  }
}

async function pass2Refunds() {
  const userFilter = args.user ? ' AND t.user_id = $1' : '';
  const params = args.user ? [args.user] : [];
  const { rows } = await pool.query(`
    SELECT t.id              AS tx_id,
           t.user_id,
           t.appointment_id,
           t.stripe_payment_intent_id,
           t.stripe_refund_id,
           t.gross_amount_cents,
           t.refunded_at,
           t.created_at,
           a.payment_status AS appt_payment_status
      FROM transactions t
      JOIN appointments a ON a.id = t.appointment_id
     WHERE t.source = 'rdv_refund'
       AND t.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM financial_ledger fl
          WHERE fl.appointment_id = t.appointment_id AND fl.entry_type = 'refund'
       )
       ${userFilter}
     ORDER BY t.created_at ASC
  `, params);

  counters.refund_found = rows.length;
  log('\n--- PASS 2 : rdv_refund sans ledger refund (' + rows.length + ' rows) ---');

  for (const tx of rows) {
    const refundedCents = Math.abs(parseInt(tx.gross_amount_cents || 0, 10));
    log('  appt=' + tx.appointment_id.substring(0, 8)
      + ' pi=' + (tx.stripe_payment_intent_id ? tx.stripe_payment_intent_id.substring(0, 12) : 'NULL')
      + ' refund=' + (tx.stripe_refund_id ? tx.stripe_refund_id.substring(0, 12) : 'NULL')
      + ' amount=' + FMT(refundedCents));

    if (!args.apply) {
      counters.refund_processed++;
      continue;
    }

    try {
      // 1. Recupere le PI depuis l'appointment (les rows rdv_refund ont pi=NULL
      // car la colonne stripe_payment_intent_id n'est pas remplie sur le miroir
      // de refund — fallback : on lit depuis appointments.stripe_payment_intent_id).
      let piId = tx.stripe_payment_intent_id || null;
      if (!piId) {
        const { rows: apptR } = await pool.query(
          'SELECT stripe_payment_intent_id FROM appointments WHERE id = $1', [tx.appointment_id]);
        piId = apptR[0]?.stripe_payment_intent_id || null;
      }

      // 2. Lookup parent payment entry (pour chainage related_ledger_id)
      const paymentLedgerId = piId ? await findPaymentEntryByPi(pool, piId) : null;

      // 3. INSERT ledger refund
      const refundRes = await recordLedgerEntry(pool, {
        userId: tx.user_id,
        appointmentId: tx.appointment_id,
        entryType: 'refund',
        amountCents: -refundedCents,
        status: 'refunded',
        stripePaymentIntentId: piId,
        stripeRefundId: tx.stripe_refund_id,
        relatedLedgerId: paymentLedgerId,
        occurredAt: tx.refunded_at || tx.created_at,
        metadata: { source: 'backfill_2026_05_12', tx_id: tx.tx_id, pi_recovered_from_appt: !tx.stripe_payment_intent_id },
      });
      if (refundRes.inserted) counters.ledger_refund_created++;

      // 4. UPDATE ledger entries payment/commission/stripe_fee -> 'refunded'.
      // Fallback sur appointment_id si PI inconnu (sécurité).
      const mark = await markLedgerEntriesRefunded(pool, piId
        ? { stripePaymentIntentId: piId }
        : { appointmentId: tx.appointment_id });
      counters.payment_marked_refunded += mark.updated || 0;

      // 4. Cancel escrow appointment_payouts pour cet appt
      const cancel = await cancelAppointmentPayout(pool, tx.appointment_id, 'backfill_refund');
      if (cancel.cancelled) counters.escrow_cancelled++;

      counters.refund_processed++;
    } catch (e) {
      counters.errors.push({ pass: 2, tx_id: tx.tx_id, error: e.message });
      log('    ERR : ' + e.message);
    }
  }
}

(async () => {
  try {
    log('=== Backfill escrow + ledger (correction race condition pre-52f0f78) ===');
    log(args.apply ? 'MODE : APPLY (ecriture reelle)' : 'MODE : DRY-RUN (aucune ecriture)');
    if (args.user) log('Filter user_id : ' + args.user);
    log('');

    await pass1Online();
    await pass2Refunds();

    log('\n=== RESUME ===');
    log('PASS 1 (rdv_online sans escrow) : ' + counters.online_found + ' trouves, ' + counters.online_processed + ' traites');
    log('  escrow appointment_payouts crees      : ' + counters.escrow_created);
    log('  ledger payment crees                  : ' + counters.ledger_payment_created);
    log('  ledger commission crees               : ' + counters.ledger_commission_created);
    log('  ledger stripe_fee crees               : ' + counters.ledger_stripe_fee_created);
    log('PASS 2 (rdv_refund sans ledger refund) : ' + counters.refund_found + ' trouves, ' + counters.refund_processed + ' traites');
    log('  ledger refund crees                   : ' + counters.ledger_refund_created);
    log('  ledger payment/commission/fee refunded: ' + counters.payment_marked_refunded);
    log('  escrow appointment_payouts cancelled  : ' + counters.escrow_cancelled);
    log('errors : ' + counters.errors.length);
    if (counters.errors.length) for (const e of counters.errors) log('  - ' + JSON.stringify(e));

    if (!args.apply) {
      log('\n[DRY-RUN] Rien n a ete ecrit. Relancer avec --apply pour appliquer.');
    } else {
      log('\nDone.');
    }

    if (args.json) {
      const fs = require('fs');
      const path = require('path');
      const report = {
        applied: args.apply, user_filter: args.user || null,
        ran_at: new Date().toISOString(), counters,
      };
      console.log(JSON.stringify(report, null, 2));
      fs.writeFileSync(path.join(__dirname, 'backfill-escrow-ledger-report.json'), JSON.stringify(report, null, 2));
    }
  } catch (e) {
    console.error('FATAL : ' + (e.message || e));
    console.error(e.stack);
    process.exitCode = 2;
  } finally {
    try { await pool.end(); } catch {}
  }
})();
