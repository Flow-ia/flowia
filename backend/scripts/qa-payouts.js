// scripts/qa-payouts.js — QA E2E payouts apres commits 52f0f78 + 1749567.
//
// Flow :
//   1. Sign JWT scope='client' pour un client_account existant
//   2. POST /api/pub/:slug/booking/payment-intent  -> PI cree sur compte connecte
//   3. Stripe API: confirm PI avec pm_card_bypassPending (fonds available immediatement)
//   4. POST /api/pub/:slug/book                    -> RDV cree + escrow + ledger
//   5. Snapshot 4 tables apres book
//   6. Stripe balance retrieve (available / pending)
//   7. UPDATE appointment_payouts.release_at = NOW() - 1h
//   8. releasePayouts(pool) direct
//   9. Snapshot apres release
//  10. Cleanup --no-cleanup ou --cleanup
//
// USAGE :
//   node scripts/qa-payouts.js                 # complet, cleanup auto
//   node scripts/qa-payouts.js --no-cleanup    # garde le RDV (debug)
//   node scripts/qa-payouts.js --skip-release  # arrete avant releasePayouts

require('dotenv').config();
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');
const { pool } = require('../src/db');
const { releasePayouts } = require('../src/utils/releasePayouts');
const { getSlots } = require('../src/routes/public-booking/helpers');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
const BASE   = process.env.QA_BASE || 'http://127.0.0.1:5001';
const SLUG   = 'saon-de-test-lille-59800';
const CLIENT_ID = 'd69e4198-67fe-46ca-a701-6df6318b30fe';
const MERCHANT_USER_ID = '6f4d62dd-a241-48d6-a280-59eb0d1004b5';
const STRIPE_ACCT = 'acct_1TUFSaRnGbDwVdTo';

const noCleanup  = process.argv.includes('--no-cleanup');
const skipRelease = process.argv.includes('--skip-release');

// QA tag pour cleanup
const TAG = 'QA-PAYOUTS-' + Date.now();

let testApptId = null;
let testPiId   = null;

async function http(method, path, body, headers={}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function snapshotTables(label) {
  const { rows: c } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM appointment_payouts WHERE user_id=$1)::int AS escrow_total,
      (SELECT COUNT(*) FROM appointment_payouts WHERE user_id=$1 AND status='pending')::int AS escrow_pending,
      (SELECT COUNT(*) FROM appointment_payouts WHERE user_id=$1 AND status='released')::int AS escrow_released,
      (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1)::int AS ledger_total,
      (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1 AND entry_type='payment')::int AS ledger_payment,
      (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1 AND entry_type='commission')::int AS ledger_commission,
      (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1 AND entry_type='payout_hold')::int AS ledger_payout_hold,
      (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1 AND entry_type='payout_release')::int AS ledger_payout_release
  `, [MERCHANT_USER_ID]);
  console.log(`[SNAP ${label}]`, c[0]);
  return c[0];
}

async function findOpenSlot() {
  // Bypass HTTP /slots (backend running peut etre stale) : call getSlots() direct.
  const services = await pool.query(
    `SELECT id, duration_minutes FROM booking_services WHERE user_id=$1 AND is_active=TRUE LIMIT 1`,
    [MERCHANT_USER_ID]);
  const svc = services.rows[0];
  for (let d = 2; d < 14; d++) {
    const date = new Date(Date.now() + d * 86400e3).toISOString().substring(0, 10);
    const slots = await getSlots(MERCHANT_USER_ID, null, date, svc.duration_minutes, 60, 'Europe/Paris');
    if (slots.length) return { date, start_time: slots[0], service_id: svc.id };
  }
  throw new Error('Aucun slot libre trouve');
}

async function main() {
  console.log('=== QA Payouts E2E ===');
  console.log('Tag:', TAG);

  // 0. Sanity Stripe TEST
  const bal0 = await stripe.balance.retrieve();
  if (bal0.livemode) throw new Error('Stripe LIVE detecte. Aborting.');
  console.log('OK Stripe TEST');

  const snapBefore = await snapshotTables('BEFORE');

  // 1. JWT client
  const clientToken = jwt.sign(
    { clientId: CLIENT_ID, merchantId: MERCHANT_USER_ID, globalClientId: '942d299b-144b-442f-85d4-dd5102401470', scope: 'client' },
    process.env.JWT_SECRET, { expiresIn: '1h' }
  );
  console.log('OK JWT client signe');

  // Update phone_e164 for client if missing (book.js exige E.164 valide)
  await pool.query(
    `UPDATE client_accounts SET phone_e164='+33759274192'
     WHERE id=$1 AND (phone_e164 IS NULL OR phone_e164='')`, [CLIENT_ID]);

  // 2. Trouve un slot libre
  const slot = await findOpenSlot();
  console.log('OK Slot:', slot);

  // 3. POST /booking/payment-intent
  let r = await http('POST', `/api/pub/${SLUG}/booking/payment-intent`, {
    service_id: slot.service_id, date: slot.date, start_time: slot.start_time,
  }, { Authorization: `Bearer ${clientToken}` });
  if (r.status !== 200) {
    console.error('payment-intent fail', r.status, r.data);
    throw new Error('PI fail');
  }
  testPiId = r.data.payment_intent_id || r.data.pi_id || r.data.id;
  const clientSecret = r.data.client_secret;
  console.log('OK PI cree:', testPiId, 'amount=', r.data.amount, 'fee=', r.data.application_fee_amount);

  // 4. Confirm PI avec pm_card_bypassPending (Stripe TEST helper)
  // pm_card_bypassPending : carte test qui rend les fonds available
  // immediatement (bypass T+2 hold sur balance Connect). Critique pour
  // tester payout sans devoir attendre 2 jours.
  const confirmed = await stripe.paymentIntents.confirm(testPiId, {
    payment_method: 'pm_card_bypassPending',
    return_url: 'http://localhost:3000/booking-return',
  }, { stripeAccount: STRIPE_ACCT });
  console.log('OK PI confirmed status=', confirmed.status,
    'amount_received=', confirmed.amount_received,
    'app_fee=', confirmed.application_fee_amount);
  if (confirmed.status !== 'succeeded') throw new Error('PI not succeeded: ' + confirmed.status);

  // 5. POST /book
  r = await http('POST', `/api/pub/${SLUG}/book`, {
    service_id: slot.service_id, date: slot.date, start_time: slot.start_time,
    notes: TAG, payment_intent_id: testPiId, client_token: clientToken,
  }, { Authorization: `Bearer ${clientToken}` });
  if (r.status !== 201 && r.status !== 200) {
    console.error('/book fail', r.status, r.data);
    throw new Error('/book fail');
  }
  testApptId = r.data.id;
  console.log('OK Booking cree appt=', testApptId);

  // 6. Snapshot apres /book
  await new Promise(r => setTimeout(r, 800)); // laisse le temps aux side effects
  const snapAfter = await snapshotTables('AFTER_BOOK');

  // 7. Lecture detaillee des 4 tables pour le RDV cree
  const { rows: appt } = await pool.query(
    `SELECT id, status, payment_status, paid_amount_cents, stripe_payment_intent_id, paid_at
       FROM appointments WHERE id=$1`, [testApptId]);
  const { rows: tx } = await pool.query(
    `SELECT id, source, payment_status, gross_amount_cents, stripe_fee_cents,
            platform_fee_cents, net_amount_cents, stripe_payment_intent_id
       FROM transactions WHERE appointment_id=$1 AND source IN ('rdv_online','rdv_refund')`, [testApptId]);
  const { rows: escrow } = await pool.query(
    `SELECT id, status, amount_cents, release_at, stripe_payout_id, retry_count
       FROM appointment_payouts WHERE appointment_id=$1`, [testApptId]);
  const { rows: ledger } = await pool.query(
    `SELECT id, entry_type, status, amount_cents, commission_rate_snapshot,
            stripe_payment_intent_id, stripe_payout_id
       FROM financial_ledger WHERE appointment_id=$1 ORDER BY recorded_at ASC, entry_type ASC`,
    [testApptId]);

  console.log('\n=== ETAT APRES BOOK ===');
  console.log('APPT:', JSON.stringify(appt, null, 2));
  console.log('TX:', JSON.stringify(tx, null, 2));
  console.log('ESCROW:', JSON.stringify(escrow, null, 2));
  console.log('LEDGER:', JSON.stringify(ledger, null, 2));

  // 8. Stripe balance
  const bal = await stripe.balance.retrieve({}, { stripeAccount: STRIPE_ACCT });
  console.log('\n=== STRIPE BALANCE ACCT ===');
  console.log('Available:', bal.available.map(b => `${b.amount}c ${b.currency}`).join(', '));
  console.log('Pending:', bal.pending.map(b => `${b.amount}c ${b.currency}`).join(', '));

  // 9. Test releasePayouts
  if (skipRelease) {
    console.log('\n--SKIP RELEASE (flag --skip-release)--');
    return;
  }

  // Force release_at to past for our escrow row
  const ur = await pool.query(
    `UPDATE appointment_payouts SET release_at = NOW() - INTERVAL '1 hour'
      WHERE appointment_id=$1 RETURNING id, release_at`, [testApptId]);
  console.log('OK release_at force au passe:', ur.rows[0]);

  console.log('\n=== APPEL releasePayouts() ===');
  const releaseResult = await releasePayouts(pool);
  console.log('releaseResult:', releaseResult);

  // 10. Snapshot final + idempotence (2e appel)
  await new Promise(r => setTimeout(r, 500));
  const snapRelease = await snapshotTables('AFTER_RELEASE');

  console.log('\n=== IDEMPOTENCE: 2e appel releasePayouts ===');
  const release2 = await releasePayouts(pool);
  console.log('release2:', release2);
  const snapIdem = await snapshotTables('AFTER_RELEASE_2');

  // Diffs idempotence
  const drift_release2_ledger = snapIdem.ledger_total - snapRelease.ledger_total;
  const drift_release2_escrow = snapIdem.escrow_total - snapRelease.escrow_total;
  console.log('DRIFT 2e release (doit etre 0):',
    'ledger=', drift_release2_ledger, 'escrow=', drift_release2_escrow);

  // 11. Etat final RDV
  const { rows: escrowF } = await pool.query(
    `SELECT id, status, amount_cents, stripe_payout_id, retry_count, stripe_error_message,
            released_at
       FROM appointment_payouts WHERE appointment_id=$1`, [testApptId]);
  const { rows: ledgerF } = await pool.query(
    `SELECT id, entry_type, status, amount_cents, stripe_payout_id
       FROM financial_ledger WHERE appointment_id=$1 ORDER BY recorded_at ASC, entry_type ASC`,
    [testApptId]);

  console.log('\n=== ETAT FINAL ===');
  console.log('ESCROW:', JSON.stringify(escrowF, null, 2));
  console.log('LEDGER:', JSON.stringify(ledgerF, null, 2));

  // 12. Stripe payouts list pour le compte
  const payoutsList = await stripe.payouts.list({ limit: 5 }, { stripeAccount: STRIPE_ACCT });
  console.log('\nSTRIPE PAYOUTS (recent):',
    payoutsList.data.map(p => ({ id: p.id, amount: p.amount, status: p.status, arrival_date: p.arrival_date, metadata: p.metadata })));

  // Diff snapshot
  console.log('\n=== DIFF SNAPSHOT BEFORE -> AFTER_BOOK ===');
  console.log('escrow_total +', snapAfter.escrow_total - snapBefore.escrow_total,
    '| ledger_total +', snapAfter.ledger_total - snapBefore.ledger_total,
    '| ledger_payment +', snapAfter.ledger_payment - snapBefore.ledger_payment,
    '| ledger_commission +', snapAfter.ledger_commission - snapBefore.ledger_commission,
    '| ledger_payout_hold +', snapAfter.ledger_payout_hold - snapBefore.ledger_payout_hold);

  console.log('\n=== DIFF AFTER_BOOK -> AFTER_RELEASE ===');
  console.log('escrow_pending', snapAfter.escrow_pending, '->', snapRelease.escrow_pending,
    '| escrow_released', snapAfter.escrow_released, '->', snapRelease.escrow_released,
    '| ledger_payout_release +', snapRelease.ledger_payout_release - snapAfter.ledger_payout_release);
}

async function cleanup() {
  if (!testApptId || noCleanup) {
    if (testApptId) console.log('\n--CLEANUP SKIPPED appt=' + testApptId + '--');
    return;
  }
  console.log('\n--- CLEANUP ---');
  try {
    await pool.query('DELETE FROM financial_ledger WHERE appointment_id=$1', [testApptId]);
    await pool.query('DELETE FROM transactions WHERE appointment_id=$1', [testApptId]);
    await pool.query('DELETE FROM appointment_payouts WHERE appointment_id=$1', [testApptId]);
    await pool.query('DELETE FROM appointments WHERE id=$1', [testApptId]);
    console.log('  appt + cascade deletes OK');
  } catch (e) {
    console.warn('  cleanup partial fail', e.message);
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exitCode = 1;
}).finally(async () => {
  await cleanup();
  await pool.end();
});
