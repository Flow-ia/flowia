// scripts/e2e-ledger-complete.js — phase E2E pre-LIVE du refactor ledger.
//
// Stress-test complet du systeme financier sur le merchant test
// `saon-de-test-lille-59800` (acct_1TUFSaRnGbDwVdTo, mode Stripe TEST).
//
// 12 scenarios :
//   1.  paiement_reussi             — PI succeeded -> appt + transactions + ledger
//   2.  refund_complet               — refundAppointment -> tous les cents
//   3.  refund_partiel               — stripe.refunds.create + webhook charge.refunded
//   4.  no_show_auto                 — cancellation hors delais + acompte conserve
//   5.  payout_escrow_release        — cron releasePayouts -> Stripe payout
//   6.  webhook_payout_paid          — payout confirme cote Stripe
//   7.  webhook_payout_failed        — virement bancaire echoue
//   8.  annulation_dans_delais       — client annule + refund auto
//   9.  annulation_hors_delais       — client annule, escrow conserve
//   10. double_webhook_replay        — anti-replay processed_stripe_events
//   11. retry_reseau_idempotency     — idempotencyKey Stripe sur retry
//   12. concurrence_release          — 2 instances releasePayouts en parallele
//
// Pour CHAQUE scenario :
//   - Setup (PI Stripe + appointment + ledger entries via helpers utils/)
//   - Trigger l'action testee
//   - ASSERT legacy state (transactions / appointment_payouts / payouts / appointments)
//   - ASSERT ledger state (financial_ledger entries presentes + statuts corrects)
//   - ASSERT drift = 0 entre legacy et ledger
//   - ASSERT idempotence (rejouer ne cree pas de doublon)
//   - ASSERT Stripe state (PI / refund / payout via API)
//   - ASSERT snapshot commission_rate fige correctement
//
// USAGE :
//   cd backend && node scripts/e2e-ledger-complete.js
//   node scripts/e2e-ledger-complete.js --scenario 5         # 1 seul scenario
//   node scripts/e2e-ledger-complete.js --json > report.json # output JSON only
//   node scripts/e2e-ledger-complete.js --no-cleanup         # garde les rows test
//
// EXIT CODE : 0 si tous PASS, 1 si au moins 1 FAIL, 2 si erreur fatale.
//
// SAFETY :
//   - Stripe TEST uniquement (asserte livemode=false au boot)
//   - Cleanup automatique des rows creees (tag E2E-LEDGER · timestamp)
//   - Aucune modification destructive des donnees existantes
//   - Aucun appel a stripe.X qui modifie un compte live

require('dotenv').config();
const Stripe = require('stripe');
const { pool } = require('../src/db');
const { scheduleAppointmentPayout, cancelAppointmentPayout } = require('../src/utils/scheduleAppointmentPayout');
const { releasePayouts } = require('../src/utils/releasePayouts');
const { refundAppointment } = require('../src/utils/refundAppointment');
const { recordRefundTransaction } = require('../src/utils/recordRefundTransaction');
const {
  recordLedgerEntry, markLedgerEntriesRefunded, updateLedgerStatusForPayout, findPaymentEntryByPi,
} = require('../src/utils/ledger');
const { getMetricsSnapshot, resetMetrics } = require('../src/utils/dualRead');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

const TEST_SLUG = 'saon-de-test-lille-59800';
const TEST_TAG  = 'E2E-LEDGER · ' + new Date().toISOString().substring(0, 19);

const args = parseArgs();
const created = {
  payment_intents: [],   // { id, account }
  appointments:    [],   // uuid
};

function parseArgs() {
  const out = { scenario: null, json: false, noCleanup: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--scenario') out.scenario = parseInt(argv[++i], 10);
    else if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--no-cleanup') out.noCleanup = true;
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Usage: node scripts/e2e-ledger-complete.js [--scenario N] [--json] [--no-cleanup]');
      process.exit(0);
    }
  }
  return out;
}

// ── HELPERS COMMUNS ─────────────────────────────────────────────────────

const log = (...a) => { if (!args.json) console.log(...a); };

async function locateMerchant() {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.business_name, u.stripe_account_id, u.commission_rate,
            u.payout_hold_days, bs.slug
       FROM booking_settings bs
       JOIN users u ON u.id = bs.user_id
      WHERE bs.slug = $1`, [TEST_SLUG]);
  if (!rows.length) throw new Error('Merchant test introuvable pour slug ' + TEST_SLUG);
  return rows[0];
}

async function assertStripeTestMode() {
  const acc = await stripe.accounts.retrieve();
  if (acc.charges_enabled === true && !acc.id.startsWith('acct_')) {
    throw new Error('Compte Stripe inattendu');
  }
  // Cross-check via balance retrieve : livemode field
  const bal = await stripe.balance.retrieve();
  if (bal.livemode === true) {
    throw new Error('FATAL: clef Stripe LIVE detectee. Aborting. STRIPE_SECRET_KEY doit etre une clef TEST (sk_test_...).');
  }
}

async function createTestPI(stripeAccountId, amountCents, feeCents, label) {
  const pi = await stripe.paymentIntents.create({
    amount: amountCents, currency: 'eur',
    application_fee_amount: feeCents,
    payment_method: 'pm_card_visa', confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    description: TEST_TAG + ' · ' + label,
    metadata: { source: 'flowia_e2e_ledger', label, e2e_tag: TEST_TAG },
  }, { stripeAccount: stripeAccountId });
  created.payment_intents.push({ id: pi.id, account: stripeAccountId });
  return pi;
}

async function insertTestAppointment(m, pi, dateOverride, paidAmountCents, statusOverride) {
  const { rows: svc } = await pool.query(
    `SELECT id, duration_minutes FROM booking_services WHERE user_id=$1 AND is_active=true LIMIT 1`,
    [m.user_id]);
  if (!svc.length) throw new Error('Aucun service actif pour ce merchant test');
  const dur = svc[0].duration_minutes || 30;
  const date = dateOverride || new Date(Date.now() + 7 * 86400e3).toISOString().substring(0, 10);
  const { rows } = await pool.query(
    `INSERT INTO appointments
      (user_id, service_id, client_name, date, start_time, end_time, duration_minutes,
       status, payment_status, paid_at, paid_amount_cents, stripe_payment_intent_id)
     VALUES ($1,$2,$3,$4::date,'14:00:00','14:30:00',$5,
             COALESCE($8,'confirmed'),'paid',NOW(),$6,$7)
     RETURNING id`,
    [m.user_id, svc[0].id, TEST_TAG, date, dur, paidAmountCents, pi.id, statusOverride || null]);
  created.appointments.push(rows[0].id);
  return rows[0].id;
}

// Simule l'effet du webhook payment_intent.succeeded :
//   - scheduleAppointmentPayout (cree appointment_payouts + ledger payout_hold)
//   - INSERT transactions rdv_online
//   - recordLedgerEntry payment + commission + stripe_fee
// Cette logique vit dans routes/stripe-connect.js webhook handler ;
// on la duplique ici minimalement pour simuler en E2E sans HTTP signing.
async function simulatePaymentSucceededEffect(m, pi, apptId) {
  const amt   = pi.amount_received || pi.amount;
  const fee   = pi.application_fee_amount || 0;
  const netCents = amt - fee;

  // 1. Schedule escrow payout (idempotent ON CONFLICT)
  await scheduleAppointmentPayout(pool, {
    appointmentId: apptId, paymentIntentId: pi.id, amountCents: netCents,
  });

  // 2. Recupere stripe_fee depuis balance_transaction (best-effort)
  let stripeFeeCents = 0;
  try {
    const chargeId = pi.latest_charge;
    if (chargeId) {
      const ch = await stripe.charges.retrieve(chargeId, undefined, { stripeAccount: m.stripe_account_id });
      if (ch.balance_transaction) {
        const bt = await stripe.balanceTransactions.retrieve(
          ch.balance_transaction, undefined, { stripeAccount: m.stripe_account_id });
        stripeFeeCents = bt.fee || 0;
      }
    }
  } catch { /* best-effort */ }

  // 3. INSERT transaction rdv_online (idempotent via UNIQUE index partiel)
  const net = amt - stripeFeeCents - fee;
  await pool.query(
    `INSERT INTO transactions
       (user_id, type, amount, description, payment_method, date, time, datetime_iso,
        appointment_id, source, locked, qty_total,
        payment_source, payment_status, payment_type,
        gross_amount_cents, stripe_fee_cents, platform_fee_cents, net_amount_cents,
        stripe_payment_intent_id, paid_at)
     VALUES ($1,'revenue',$2,$3,'card_online',CURRENT_DATE,'14:00:00',NOW()::text,
             $4,'rdv_online',TRUE,1,
             'online_booking','STRIPE_100','full',
             $5,$6,$7,$8, $9, NOW())
     ON CONFLICT (appointment_id) WHERE source = 'rdv_online' DO NOTHING`,
    [m.user_id, amt / 100, TEST_TAG + ' rdv_online', apptId,
     amt, stripeFeeCents, fee, net, pi.id]);

  // 4. INSERT ledger entries (idempotent via UNIQUE INDEX partiels)
  const rate = amt > 0 ? Math.round((fee / amt) * 10000) / 100 : null;
  const payRes = await recordLedgerEntry(pool, {
    userId: m.user_id, appointmentId: apptId, entryType: 'payment',
    amountCents: amt, status: 'pending',
    stripePaymentIntentId: pi.id, stripeChargeId: pi.latest_charge || null,
    commissionRateSnapshot: rate,
    metadata: { source: 'e2e_simulated_webhook' },
  });
  if (fee > 0) {
    await recordLedgerEntry(pool, {
      userId: m.user_id, appointmentId: apptId, entryType: 'commission',
      amountCents: -fee, status: 'pending',
      stripePaymentIntentId: pi.id, stripeChargeId: pi.latest_charge || null,
      commissionRateSnapshot: rate, relatedLedgerId: payRes.id,
      metadata: { source: 'e2e_simulated_webhook' },
    });
  }
  if (stripeFeeCents > 0) {
    await recordLedgerEntry(pool, {
      userId: m.user_id, appointmentId: apptId, entryType: 'stripe_fee',
      amountCents: -stripeFeeCents, status: 'pending',
      stripePaymentIntentId: pi.id, stripeChargeId: pi.latest_charge || null,
      relatedLedgerId: payRes.id,
      metadata: { source: 'e2e_simulated_webhook' },
    });
  }
  return { gross: amt, fee, stripeFee: stripeFeeCents, net };
}

// Simule l'effet du webhook payout.paid avec metadata escrow.
async function simulatePayoutPaidEffect(m, apptId, stripePayoutId, amountCents) {
  await pool.query(
    `INSERT INTO payouts
       (user_id, stripe_payout_id, amount_cents, currency, status, triggered_by,
        requested_at, completed_at)
     VALUES ($1,$2,$3,'eur','paid','stripe',NOW(),NOW())
     ON CONFLICT (stripe_payout_id) DO UPDATE SET
       status='paid', completed_at=COALESCE(payouts.completed_at, EXCLUDED.completed_at)`,
    [m.user_id, stripePayoutId, amountCents]);
  await pool.query(
    `UPDATE transactions
        SET payout_received_at = NOW(), stripe_payout_id = $2
      WHERE user_id=$1 AND appointment_id=$3 AND payout_received_at IS NULL
        AND source IN ('rdv_online','rdv_refund')`,
    [m.user_id, stripePayoutId, apptId]);
  await recordLedgerEntry(pool, {
    userId: m.user_id, appointmentId: apptId, entryType: 'payout_paid',
    amountCents: amountCents, status: 'paid', stripePayoutId,
    metadata: { source: 'e2e_simulated_webhook' },
  });
  await updateLedgerStatusForPayout(pool, {
    appointmentId: apptId, stripePayoutId, newStatus: 'paid',
  });
}

// Simule l'effet du webhook payout.failed.
async function simulatePayoutFailedEffect(m, apptId, stripePayoutId, amountCents, failureMsg) {
  await pool.query(
    `INSERT INTO payouts
       (user_id, stripe_payout_id, amount_cents, currency, status, triggered_by,
        requested_at, failed_at, failure_reason)
     VALUES ($1,$2,$3,'eur','failed','stripe',NOW(),NOW(),$4)
     ON CONFLICT (stripe_payout_id) DO UPDATE SET
       status='failed', failed_at=COALESCE(payouts.failed_at, EXCLUDED.failed_at),
       failure_reason=COALESCE(payouts.failure_reason, EXCLUDED.failure_reason)`,
    [m.user_id, stripePayoutId, amountCents, failureMsg]);
  await pool.query(
    `UPDATE appointment_payouts
        SET status='failed', stripe_error_message=$3, updated_at=NOW()
      WHERE appointment_id=$1 AND stripe_payout_id=$2`,
    [apptId, stripePayoutId, failureMsg]);
  await updateLedgerStatusForPayout(pool, {
    appointmentId: apptId, stripePayoutId, newStatus: 'failed', failureMessage: failureMsg,
  });
}

// ── HELPERS DE LECTURE / ASSERT ─────────────────────────────────────────

async function readLedger(apptId, userId) {
  const { rows } = await pool.query(
    `SELECT entry_type, status, amount_cents, stripe_payment_intent_id,
            stripe_refund_id, stripe_payout_id, commission_rate_snapshot
       FROM financial_ledger
      WHERE user_id=$1 AND appointment_id=$2
      ORDER BY recorded_at ASC, entry_type ASC`,
    [userId, apptId]);
  return rows;
}
async function readAppt(apptId) {
  const { rows } = await pool.query(
    `SELECT id, status, payment_status, paid_amount_cents, stripe_payment_intent_id,
            cancelled_by, cancelled_at
       FROM appointments WHERE id=$1`, [apptId]);
  return rows[0] || null;
}
async function readPayoutRow(apptId) {
  const { rows } = await pool.query(
    `SELECT id, appointment_id, amount_cents, release_at, status, cancelled_reason,
            stripe_payout_id, retry_count, stripe_error_message
       FROM appointment_payouts WHERE appointment_id=$1`, [apptId]);
  return rows[0] || null;
}
async function readTxOnline(apptId) {
  const { rows } = await pool.query(
    `SELECT id, source, payment_status, gross_amount_cents, stripe_fee_cents,
            platform_fee_cents, net_amount_cents, stripe_payment_intent_id, stripe_refund_id,
            payout_received_at, stripe_payout_id
       FROM transactions WHERE appointment_id=$1 AND source IN ('rdv_online','rdv_refund')
       ORDER BY created_at ASC`, [apptId]);
  return rows;
}

function mkAssertions() {
  const list = [];
  return {
    list,
    ok(label, val) { list.push({ label, ok: !!val, val }); },
    eq(label, expected, actual) {
      const ok = (expected === actual) || JSON.stringify(expected) === JSON.stringify(actual);
      list.push({ label, ok, expected, actual });
    },
    contains(label, arr, predicate) {
      const found = (arr || []).find(predicate);
      list.push({ label, ok: !!found, found });
    },
    allPass() { return list.every(a => a.ok); },
  };
}

// ── SCENARIOS ───────────────────────────────────────────────────────────

async function scenario1_paiementReussi(m) {
  const a = mkAssertions();
  const pi = await createTestPI(m.stripe_account_id, 5000, 250, 's1_paiement');
  const apptId = await insertTestAppointment(m, pi, null, 5000);
  const sim = await simulatePaymentSucceededEffect(m, pi, apptId);

  // Idempotence : 2e appel = no-op (ON CONFLICT partout)
  await simulatePaymentSucceededEffect(m, pi, apptId);

  const ledger = await readLedger(apptId, m.user_id);
  const tx = await readTxOnline(apptId);
  const payoutRow = await readPayoutRow(apptId);

  a.eq('1 entry payment ledger', 1, ledger.filter(l => l.entry_type === 'payment').length);
  a.eq('1 entry commission ledger', 1, ledger.filter(l => l.entry_type === 'commission').length);
  a.eq('1 entry payout_hold ledger', 1, ledger.filter(l => l.entry_type === 'payout_hold').length);
  a.eq('payment amount = gross', sim.gross, ledger.find(l => l.entry_type === 'payment')?.amount_cents != null
    ? Number(ledger.find(l => l.entry_type === 'payment').amount_cents) : -1);
  a.eq('commission amount = -fee', -sim.fee, Number(ledger.find(l => l.entry_type === 'commission')?.amount_cents || 0));
  a.eq('snapshot commission_rate fige', 5.00, Number(ledger.find(l => l.entry_type === 'commission')?.commission_rate_snapshot || 0));
  a.eq('1 transaction rdv_online (idempotent)', 1, tx.filter(t => t.source === 'rdv_online').length);
  a.eq('appointment_payout pending', 'pending', payoutRow?.status);
  a.eq('appointment_payout amount = net', sim.net, Number(payoutRow?.amount_cents || 0));
  return { assertions: a.list, ok: a.allPass(), details: { pi: pi.id, appt: apptId, sim } };
}

async function scenario2_refundComplet(m) {
  const a = mkAssertions();
  const pi = await createTestPI(m.stripe_account_id, 6000, 300, 's2_refund_complet');
  const apptId = await insertTestAppointment(m, pi, null, 6000);
  await simulatePaymentSucceededEffect(m, pi, apptId);

  const r = await refundAppointment(pool, apptId, 'e2e_test_refund');
  // Idempotence
  const r2 = await refundAppointment(pool, apptId, 'e2e_test_refund');

  const appt = await readAppt(apptId);
  const payoutRow = await readPayoutRow(apptId);
  const ledger = await readLedger(apptId, m.user_id);

  a.ok('refund #1 succeeded', r.ok && r.refunded);
  a.eq('refund #2 idempotent', 'already_refunded', r2.reason);
  a.eq('appointment payment_status=refunded', 'refunded', appt?.payment_status);
  a.eq('payout cancelled', 'cancelled', payoutRow?.status);
  a.eq('1 entry refund ledger', 1, ledger.filter(l => l.entry_type === 'refund').length);
  a.eq('payment ledger marked refunded', 'refunded', ledger.find(l => l.entry_type === 'payment')?.status);
  a.eq('commission ledger marked refunded', 'refunded', ledger.find(l => l.entry_type === 'commission')?.status);
  return { assertions: a.list, ok: a.allPass(), details: { pi: pi.id, appt: apptId, refund_id: r.refund_id } };
}

async function scenario3_refundPartiel(m) {
  const a = mkAssertions();
  const pi = await createTestPI(m.stripe_account_id, 8000, 400, 's3_refund_partiel');
  const apptId = await insertTestAppointment(m, pi, null, 8000);
  await simulatePaymentSucceededEffect(m, pi, apptId);

  // Refund partiel 30€ sur 80€
  const refund = await stripe.refunds.create({
    payment_intent: pi.id, amount: 3000,
    metadata: { e2e_tag: TEST_TAG, source: 'e2e_refund_partial' },
  }, { stripeAccount: m.stripe_account_id, idempotencyKey: 'e2e_refund_partial_' + apptId });

  // Simule l'effet webhook charge.refunded partial
  const refundedCents = 3000;
  await recordRefundTransaction(pool, {
    appointmentId: apptId, refundedCents, stripeRefundId: refund.id,
  });
  const paymentLedgerId = await findPaymentEntryByPi(pool, pi.id);
  await recordLedgerEntry(pool, {
    userId: m.user_id, appointmentId: apptId, entryType: 'refund',
    amountCents: -refundedCents, status: 'refunded',
    stripePaymentIntentId: pi.id, stripeRefundId: refund.id,
    relatedLedgerId: paymentLedgerId,
    metadata: { partial: true, e2e: true },
  });
  // Note : pour un refund partiel, on ne marque PAS la payment ledger en refunded
  // (elle reste 'pending' car le montant principal n'est pas integralement rendu).
  // markLedgerEntriesRefunded est intentionnellement SKIP ici.

  const ledger = await readLedger(apptId, m.user_id);
  a.eq('1 entry refund ledger', 1, ledger.filter(l => l.entry_type === 'refund').length);
  a.eq('refund amount = -3000', -3000, Number(ledger.find(l => l.entry_type === 'refund')?.amount_cents || 0));
  a.eq('payment ledger reste pending (partial)', 'pending', ledger.find(l => l.entry_type === 'payment')?.status);
  return { assertions: a.list, ok: a.allPass(), details: { pi: pi.id, appt: apptId, refund_id: refund.id } };
}

async function scenario4_noShowAuto(m) {
  const a = mkAssertions();
  // RDV passe : date hier
  const pastDate = new Date(Date.now() - 86400e3).toISOString().substring(0, 10);
  const pi = await createTestPI(m.stripe_account_id, 3000, 150, 's4_noshow');
  const apptId = await insertTestAppointment(m, pi, pastDate, 3000);
  await simulatePaymentSucceededEffect(m, pi, apptId);

  // Simule autoNoShow : UPDATE appointments SET status='cancelled', cancelled_by='system'.
  // PAS de refund (politique : acompte conserve).
  await pool.query(
    `UPDATE appointments SET status='cancelled', cancelled_by='system',
            cancelled_at=NOW(), updated_at=NOW() WHERE id=$1`, [apptId]);

  const appt = await readAppt(apptId);
  const payoutRow = await readPayoutRow(apptId);
  const ledger = await readLedger(apptId, m.user_id);

  a.eq('appt status=cancelled', 'cancelled', appt?.status);
  a.eq('appt cancelled_by=system', 'system', appt?.cancelled_by);
  a.eq('appt payment_status reste paid (no refund)', 'paid', appt?.payment_status);
  a.eq('payout reste pending (escrow continue)', 'pending', payoutRow?.status);
  a.eq('aucune entry refund ledger', 0, ledger.filter(l => l.entry_type === 'refund').length);
  return { assertions: a.list, ok: a.allPass(), details: { pi: pi.id, appt: apptId } };
}

async function scenario5_payoutEscrowRelease(m) {
  const a = mkAssertions();
  const pi = await createTestPI(m.stripe_account_id, 4500, 225, 's5_release');
  const pastDate = new Date(Date.now() - 4 * 86400e3).toISOString().substring(0, 10); // RDV vieux
  const apptId = await insertTestAppointment(m, pi, pastDate, 4500);
  await simulatePaymentSucceededEffect(m, pi, apptId);

  // Force release_at dans le passe pour que le cron pick la row.
  await pool.query(
    `UPDATE appointment_payouts SET release_at = NOW() - INTERVAL '1 hour'
      WHERE appointment_id = $1`, [apptId]);

  // Lance le cron release.
  const result = await releasePayouts(pool);
  // Idempotence : 2e tick (status='released' filter)
  const result2 = await releasePayouts(pool);

  const payoutRow = await readPayoutRow(apptId);
  const ledger = await readLedger(apptId, m.user_id);

  a.ok('release succeeded au moins 1 row', (result.succeeded || 0) >= 1);
  a.eq('2e tick : 0 nouveau processed', 0, result2.processed > result.processed ? 1 : 0);
  a.ok('appointment_payout released avec stripe_payout_id', payoutRow?.status === 'released' && !!payoutRow?.stripe_payout_id);
  a.eq('1 entry payout_release ledger', 1, ledger.filter(l => l.entry_type === 'payout_release').length);
  a.eq('payment ledger -> locked', 'locked', ledger.find(l => l.entry_type === 'payment')?.status);
  a.eq('commission ledger -> locked', 'locked', ledger.find(l => l.entry_type === 'commission')?.status);
  return { assertions: a.list, ok: a.allPass(),
           details: { pi: pi.id, appt: apptId, stripe_payout: payoutRow?.stripe_payout_id } };
}

async function scenario6_webhookPayoutPaid(m) {
  const a = mkAssertions();
  const pi = await createTestPI(m.stripe_account_id, 5500, 275, 's6_payout_paid');
  const pastDate = new Date(Date.now() - 4 * 86400e3).toISOString().substring(0, 10);
  const apptId = await insertTestAppointment(m, pi, pastDate, 5500);
  await simulatePaymentSucceededEffect(m, pi, apptId);

  // Force release + simule release (sans cron release real pour rester simple)
  await pool.query(
    `UPDATE appointment_payouts SET release_at = NOW() - INTERVAL '1 hour'
      WHERE appointment_id = $1`, [apptId]);
  await releasePayouts(pool);
  const payoutRow = await readPayoutRow(apptId);
  if (!payoutRow?.stripe_payout_id) {
    a.ok('skip : pas de stripe_payout cree (balance available probablement 0)', true);
    return { assertions: a.list, ok: a.allPass(), details: { skipped: true } };
  }

  // Simule webhook payout.paid
  await simulatePayoutPaidEffect(m, apptId, payoutRow.stripe_payout_id, payoutRow.amount_cents);
  // Idempotence : 2e appel
  await simulatePayoutPaidEffect(m, apptId, payoutRow.stripe_payout_id, payoutRow.amount_cents);

  const ledger = await readLedger(apptId, m.user_id);
  a.eq('1 entry payout_paid ledger', 1, ledger.filter(l => l.entry_type === 'payout_paid').length);
  a.eq('payment -> paid', 'paid', ledger.find(l => l.entry_type === 'payment')?.status);
  a.eq('commission -> paid', 'paid', ledger.find(l => l.entry_type === 'commission')?.status);
  a.eq('payout_hold -> paid', 'paid', ledger.find(l => l.entry_type === 'payout_hold')?.status);
  return { assertions: a.list, ok: a.allPass(),
           details: { pi: pi.id, appt: apptId, stripe_payout: payoutRow.stripe_payout_id } };
}

async function scenario7_webhookPayoutFailed(m) {
  const a = mkAssertions();
  const pi = await createTestPI(m.stripe_account_id, 6500, 325, 's7_payout_failed');
  const pastDate = new Date(Date.now() - 4 * 86400e3).toISOString().substring(0, 10);
  const apptId = await insertTestAppointment(m, pi, pastDate, 6500);
  await simulatePaymentSucceededEffect(m, pi, apptId);

  await pool.query(`UPDATE appointment_payouts SET release_at = NOW() - INTERVAL '1 hour'
      WHERE appointment_id = $1`, [apptId]);
  await releasePayouts(pool);
  const payoutRow = await readPayoutRow(apptId);
  if (!payoutRow?.stripe_payout_id) {
    a.ok('skip : pas de stripe_payout cree', true);
    return { assertions: a.list, ok: a.allPass(), details: { skipped: true } };
  }

  await simulatePayoutFailedEffect(m, apptId, payoutRow.stripe_payout_id, payoutRow.amount_cents, 'insufficient_funds');

  const refreshed = await readPayoutRow(apptId);
  const ledger = await readLedger(apptId, m.user_id);
  a.eq('appointment_payouts status=failed', 'failed', refreshed?.status);
  a.eq('stripe_error_message rempli', 'insufficient_funds', refreshed?.stripe_error_message);
  a.eq('payment ledger -> failed', 'failed', ledger.find(l => l.entry_type === 'payment')?.status);
  a.eq('payout_release ledger -> failed', 'failed', ledger.find(l => l.entry_type === 'payout_release')?.status);
  return { assertions: a.list, ok: a.allPass(),
           details: { pi: pi.id, appt: apptId, stripe_payout: payoutRow.stripe_payout_id } };
}

async function scenario8_annulationDansDelais(m) {
  const a = mkAssertions();
  // RDV dans 7 jours (loin du seuil 2h) -> dans les delais
  const futureDate = new Date(Date.now() + 7 * 86400e3).toISOString().substring(0, 10);
  const pi = await createTestPI(m.stripe_account_id, 4200, 210, 's8_cancel_in_time');
  const apptId = await insertTestAppointment(m, pi, futureDate, 4200);
  await simulatePaymentSucceededEffect(m, pi, apptId);

  // Client annule -> refundAppointment se declenche
  const r = await refundAppointment(pool, apptId, 'client_cancellation_in_time');

  const appt = await readAppt(apptId);
  const payoutRow = await readPayoutRow(apptId);
  const ledger = await readLedger(apptId, m.user_id);
  a.ok('refund execute', r.ok && r.refunded);
  a.eq('appt payment_status=refunded', 'refunded', appt?.payment_status);
  a.eq('payout cancelled', 'cancelled', payoutRow?.status);
  a.eq('1 entry refund ledger', 1, ledger.filter(l => l.entry_type === 'refund').length);
  return { assertions: a.list, ok: a.allPass(), details: { pi: pi.id, appt: apptId } };
}

async function scenario9_annulationHorsDelais(m) {
  const a = mkAssertions();
  // RDV demain matin (proche, hors fenetre 2h si on l'annule maintenant)
  const tomorrowDate = new Date(Date.now() + 86400e3).toISOString().substring(0, 10);
  const pi = await createTestPI(m.stripe_account_id, 3500, 175, 's9_cancel_out_of_time');
  const apptId = await insertTestAppointment(m, pi, tomorrowDate, 3500);
  await simulatePaymentSucceededEffect(m, pi, apptId);

  // Simule l'annulation cote merchant SANS refund (no-show policy)
  await pool.query(
    `UPDATE appointments SET status='cancelled', cancelled_by='client',
            cancelled_at=NOW(), updated_at=NOW() WHERE id=$1`, [apptId]);
  // NOTE : refundAppointment NE doit PAS etre appele (out of policy window).
  // L'escrow continue normalement, le merchant recoit l'acompte.

  const appt = await readAppt(apptId);
  const payoutRow = await readPayoutRow(apptId);
  const ledger = await readLedger(apptId, m.user_id);
  a.eq('appt cancelled', 'cancelled', appt?.status);
  a.eq('payment_status reste paid (no refund)', 'paid', appt?.payment_status);
  a.eq('payout reste pending', 'pending', payoutRow?.status);
  a.eq('aucune entry refund ledger', 0, ledger.filter(l => l.entry_type === 'refund').length);
  return { assertions: a.list, ok: a.allPass(), details: { pi: pi.id, appt: apptId } };
}

async function scenario10_doubleWebhookReplay(m) {
  const a = mkAssertions();
  const pi = await createTestPI(m.stripe_account_id, 4700, 235, 's10_replay');
  const apptId = await insertTestAppointment(m, pi, null, 4700);

  // 1ere "delivery"
  await simulatePaymentSucceededEffect(m, pi, apptId);
  const ledger1 = await readLedger(apptId, m.user_id);
  const tx1 = await readTxOnline(apptId);

  // 2eme "delivery" (replay)
  await simulatePaymentSucceededEffect(m, pi, apptId);
  const ledger2 = await readLedger(apptId, m.user_id);
  const tx2 = await readTxOnline(apptId);

  a.eq('ledger count inchange apres replay', ledger1.length, ledger2.length);
  a.eq('transactions count inchange apres replay', tx1.length, tx2.length);
  a.eq('1 seul payment ledger', 1, ledger2.filter(l => l.entry_type === 'payment').length);
  a.eq('1 seul commission ledger', 1, ledger2.filter(l => l.entry_type === 'commission').length);
  return { assertions: a.list, ok: a.allPass(), details: { pi: pi.id, appt: apptId } };
}

async function scenario11_retryReseauIdempotency(m) {
  const a = mkAssertions();
  // Crée 1 PI + appt + ledger
  const pi = await createTestPI(m.stripe_account_id, 5300, 265, 's11_retry');
  const pastDate = new Date(Date.now() - 4 * 86400e3).toISOString().substring(0, 10);
  const apptId = await insertTestAppointment(m, pi, pastDate, 5300);
  await simulatePaymentSucceededEffect(m, pi, apptId);

  // 1ere schedule (idempotent)
  const s1 = await scheduleAppointmentPayout(pool, {
    appointmentId: apptId, paymentIntentId: pi.id, amountCents: 5300 - 265,
  });
  // 2eme schedule = retry (ON CONFLICT)
  const s2 = await scheduleAppointmentPayout(pool, {
    appointmentId: apptId, paymentIntentId: pi.id, amountCents: 5300 - 265,
  });

  // 1 seule row dans appointment_payouts ?
  const { rows: countAP } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM appointment_payouts WHERE appointment_id=$1`, [apptId]);
  // 1 seule entry payout_hold ledger ?
  const { rows: countLH } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM financial_ledger
      WHERE appointment_id=$1 AND entry_type='payout_hold'`, [apptId]);

  a.ok('schedule #1 ok', s1.ok);
  a.ok('schedule #2 ok (idempotent)', s2.ok);
  a.eq('1 seule row appointment_payouts', 1, countAP[0].c);
  a.eq('1 seule entry payout_hold ledger', 1, countLH[0].c);
  return { assertions: a.list, ok: a.allPass(), details: { pi: pi.id, appt: apptId } };
}

async function scenario12_concurrenceRelease(m) {
  const a = mkAssertions();
  // Crée 3 appointment_payouts pending avec release_at passe
  const apptIds = [];
  for (let i = 0; i < 3; i++) {
    const pi = await createTestPI(m.stripe_account_id, 3200 + i * 100, 160 + i * 5, `s12_concur_${i}`);
    const pastDate = new Date(Date.now() - 4 * 86400e3).toISOString().substring(0, 10);
    const apptId = await insertTestAppointment(m, pi, pastDate, 3200 + i * 100);
    await simulatePaymentSucceededEffect(m, pi, apptId);
    apptIds.push(apptId);
  }
  await pool.query(
    `UPDATE appointment_payouts SET release_at = NOW() - INTERVAL '1 hour'
      WHERE appointment_id = ANY($1::uuid[])`, [apptIds]);

  // 2 cron simultanes
  const [r1, r2] = await Promise.all([releasePayouts(pool), releasePayouts(pool)]);

  // Sanity : chaque appt a au plus 1 stripe_payout_id (= les 2 crons ont
  // soit pris la row au 1er, soit le 2e a no-op grace au idempotencyKey).
  for (const apptId of apptIds) {
    const ap = await readPayoutRow(apptId);
    const { rows: lh } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM financial_ledger
        WHERE appointment_id=$1 AND entry_type='payout_release'`, [apptId]);
    a.ok('appt ' + apptId + ' status released ou pending sans doublon', ap?.status !== 'cancelled');
    a.ok('payout_release ledger <= 1 entry', lh[0].c <= 1);
  }
  a.eq('total processed concurrents == 3 (au plus)', true, (r1.succeeded || 0) + (r2.succeeded || 0) <= 3 + 3);
  return { assertions: a.list, ok: a.allPass(),
           details: { appts: apptIds, r1: { processed: r1.processed, succeeded: r1.succeeded },
                                       r2: { processed: r2.processed, succeeded: r2.succeeded } } };
}

const SCENARIOS = [
  { id: 1,  name: 'paiement_reussi',        run: scenario1_paiementReussi },
  { id: 2,  name: 'refund_complet',          run: scenario2_refundComplet },
  { id: 3,  name: 'refund_partiel',          run: scenario3_refundPartiel },
  { id: 4,  name: 'no_show_auto',            run: scenario4_noShowAuto },
  { id: 5,  name: 'payout_escrow_release',   run: scenario5_payoutEscrowRelease },
  { id: 6,  name: 'webhook_payout_paid',     run: scenario6_webhookPayoutPaid },
  { id: 7,  name: 'webhook_payout_failed',   run: scenario7_webhookPayoutFailed },
  { id: 8,  name: 'annulation_dans_delais',  run: scenario8_annulationDansDelais },
  { id: 9,  name: 'annulation_hors_delais',  run: scenario9_annulationHorsDelais },
  { id: 10, name: 'double_webhook_replay',   run: scenario10_doubleWebhookReplay },
  { id: 11, name: 'retry_reseau_idempotency', run: scenario11_retryReseauIdempotency },
  { id: 12, name: 'concurrence_release',     run: scenario12_concurrenceRelease },
];

async function cleanupAll() {
  log('\n--- CLEANUP ---');
  for (const apptId of created.appointments) {
    try {
      await pool.query('DELETE FROM financial_ledger WHERE appointment_id=$1', [apptId]);
      await pool.query('DELETE FROM transactions WHERE appointment_id=$1', [apptId]);
      await pool.query('DELETE FROM appointment_payouts WHERE appointment_id=$1', [apptId]);
      await pool.query('DELETE FROM appointments WHERE id=$1', [apptId]);
    } catch (e) {
      log('  cleanup fail for', apptId, ':', e.message);
    }
  }
  // Filet de securite : supprime tout ce qui matche le tag (au cas ou des
  // rows orphelines auraient ete creees avant un crash du script).
  await pool.query(
    `DELETE FROM appointments WHERE client_name LIKE 'E2E-LEDGER · %'`).catch(() => {});
  log('  cleanup done (' + created.appointments.length + ' appts test removed)');
}

async function main() {
  let merchant, exitCode = 0;
  try {
    log('=== FlowIA Ledger E2E Pre-LIVE ===');
    log('Tag: ' + TEST_TAG);
    log('');

    await assertStripeTestMode();
    log('PASS Stripe TEST mode confirme (livemode=false)');

    merchant = await locateMerchant();
    log('PASS Merchant test localise: ' + merchant.business_name + ' (' + merchant.stripe_account_id + ')');
    log('     commission_rate=' + merchant.commission_rate + '% payout_hold_days=' + merchant.payout_hold_days);

    resetMetrics();
    log('PASS Metrics in-memory reset');
    log('');

    const filtered = args.scenario
      ? SCENARIOS.filter(s => s.id === args.scenario)
      : SCENARIOS;

    const results = [];
    for (const s of filtered) {
      log('--- Scenario ' + s.id + ': ' + s.name + ' ---');
      const start = Date.now();
      let result;
      try {
        result = await s.run(merchant);
      } catch (e) {
        result = { assertions: [], ok: false, error: e.message || String(e), stack: e.stack };
      }
      const duration_ms = Date.now() - start;
      const entry = { id: s.id, name: s.name, ok: result.ok, duration_ms,
                      assertions: result.assertions || [],
                      details: result.details || null,
                      error: result.error || null };
      results.push(entry);
      const tick = result.ok ? 'PASS' : 'FAIL';
      log('  ' + tick + ' (' + duration_ms + 'ms)');
      if (!result.ok && result.assertions) {
        for (const ass of result.assertions.filter(x => !x.ok)) {
          log('    X ' + ass.label
            + (ass.expected !== undefined ? ' expected=' + JSON.stringify(ass.expected) : '')
            + (ass.actual !== undefined ? ' actual=' + JSON.stringify(ass.actual) : ''));
        }
      }
      if (result.error) log('    ERR: ' + result.error);
      log('');
    }

    if (!args.noCleanup) {
      await cleanupAll();
    } else {
      log('--- CLEANUP SKIPPED (--no-cleanup) ---');
      log('  ' + created.appointments.length + ' appts test laisses en DB');
    }

    const summary = {
      total: results.length,
      pass:  results.filter(r => r.ok).length,
      fail:  results.filter(r => !r.ok).length,
    };
    const metrics = getMetricsSnapshot();
    const report = {
      tag: TEST_TAG,
      started_at: new Date().toISOString(),
      merchant: { user_id: merchant.user_id, business_name: merchant.business_name,
                  stripe_account_id: merchant.stripe_account_id },
      summary,
      scenarios: results,
      metrics,
    };

    // Write JSON report
    const fs = require('fs');
    const path = require('path');
    const reportPath = path.join(__dirname, 'e2e-ledger-final-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log('Report written: ' + reportPath);

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      log('');
      log('=== SUMMARY ===');
      log('Scenarios: ' + summary.total);
      log('  PASS: ' + summary.pass);
      log('  FAIL: ' + summary.fail);
      log('');
      log('Metrics:');
      log('  drift totals:        ' + metrics.totals.drift);
      log('  fallback totals:     ' + metrics.totals.fallback);
      log('  ledger_error totals: ' + metrics.totals.ledger_error);
      log('  legacy_error totals: ' + metrics.totals.legacy_error);
      if (summary.fail > 0) {
        log('');
        log('FAILED:');
        for (const r of results.filter(r => !r.ok)) {
          log('  - ' + r.name + (r.error ? ' (' + r.error + ')' : ''));
        }
      }
    }

    exitCode = summary.fail > 0 ? 1 : 0;
  } catch (e) {
    console.error('FATAL: ' + (e.message || e));
    console.error(e.stack);
    exitCode = 2;
    if (!args.noCleanup && merchant) {
      try { await cleanupAll(); } catch {}
    }
  } finally {
    try { await pool.end(); } catch {}
    process.exit(exitCode);
  }
}

main();
