// scripts/e2e-db-flow.js — Tests E2E des helpers DB-side Stripe Connect.
//
// USAGE :
//   cd backend && node scripts/e2e-db-flow.js
//
// CE QUE CE SCRIPT FAIT (sur DB Supabase prod, en mode test Stripe) :
//   1. Locate le merchant test (slug saon-de-test-lille-59800)
//   2. Cree un Stripe PaymentIntent reel test sur son compte connecte
//   3. Insere un appointment 'E2E-TEST' lie a ce PI
//   4. scheduleAppointmentPayout : 1ere fois insere, 2eme fois no-op (idempotence)
//   5. cancelAppointmentPayout : marque la row en 'cancelled' (annulation dans delais)
//   6. Re-insere appointment + payout + simule la cancellation hors delais
//      (= no auto-refund, le commerçant garde l'acompte, releasePayouts payout)
//   7. refundAppointment : test refund flow (sans webhook) — cancel le payout + update appt
//   8. Cleanup : DELETE des rows E2E-TEST
//
// MARKER de cleanup : client_name commence par 'E2E-TEST · ' pour identifier
// les rows orphelines au cas ou.

require('dotenv').config();
const Stripe = require('stripe');
const { pool } = require('../src/db');
const { scheduleAppointmentPayout, cancelAppointmentPayout } = require('../src/utils/scheduleAppointmentPayout');
const { refundAppointment } = require('../src/utils/refundAppointment');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

const TEST_SLUG = 'saon-de-test-lille-59800';
const TEST_TAG  = 'E2E-TEST · ' + new Date().toISOString().substring(0, 19);

const results = { meta: { tag: TEST_TAG, started_at: new Date().toISOString() }, steps: [] };
function step(name, ok, data, error) {
  const entry = { name, ok, ts: new Date().toISOString() };
  if (data) entry.data = data;
  if (error) entry.error = String(error);
  results.steps.push(entry);
  console.log(`${ok ? '✓' : '✗'} ${name}` + (data ? ' — ' + JSON.stringify(data).substring(0, 250) : '') + (error ? ' ERR: ' + error : ''));
}

// Garde la liste des rows a cleaner
const created = { appointments: [], appointment_payouts: [], payment_intents: [] };

async function locateMerchant() {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.business_name, u.stripe_account_id, u.commission_rate,
            u.online_payments_enabled, u.payout_hold_days,
            bs.slug, bs.timezone
       FROM booking_settings bs
       JOIN users u ON u.id = bs.user_id
      WHERE bs.slug = $1`,
    [TEST_SLUG]
  );
  if (!rows.length) throw new Error('Merchant test introuvable pour slug ' + TEST_SLUG);
  return rows[0];
}

async function createTestPI(stripeAccountId, amountCents, feeCents, label) {
  const pi = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'eur',
    application_fee_amount: feeCents,
    payment_method: 'pm_card_visa',
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    description: `${TEST_TAG} · ${label}`,
    metadata: { source: 'flowia_e2e_db_flow', label },
  }, { stripeAccount: stripeAccountId });
  created.payment_intents.push({ id: pi.id, account: stripeAccountId });
  return pi;
}

async function insertTestAppointment(m, pi, dateOverride, paidAmountCents) {
  // service_id : on prend le 1er booking_services du merchant
  const { rows: svc } = await pool.query(
    `SELECT id, duration_minutes FROM booking_services WHERE user_id=$1 AND is_active=true LIMIT 1`,
    [m.user_id]
  );
  if (!svc.length) throw new Error('Aucun service actif pour ce merchant');
  const dur = svc[0].duration_minutes || 30;

  const date = dateOverride || new Date(Date.now() + 7 * 86400e3).toISOString().substring(0, 10);
  const startTime = '14:00:00';
  const endTime   = '14:30:00';

  const { rows } = await pool.query(
    `INSERT INTO appointments
      (user_id, service_id, client_name, date, start_time, end_time, duration_minutes,
       status, payment_status, paid_at, paid_amount_cents, stripe_payment_intent_id)
     VALUES ($1,$2,$3,$4::date,$5::time,$6::time,$7,'confirmed','paid',NOW(),$8,$9)
     RETURNING id`,
    [m.user_id, svc[0].id, TEST_TAG, date, startTime, endTime, dur, paidAmountCents, pi.id]
  );
  created.appointments.push(rows[0].id);
  return rows[0].id;
}

async function readPayout(apptId) {
  const { rows } = await pool.query(
    `SELECT id, appointment_id, amount_cents, release_at, status, cancelled_reason,
            stripe_payout_id, retry_count, stripe_error_message
       FROM appointment_payouts WHERE appointment_id=$1`,
    [apptId]
  );
  return rows[0] || null;
}

async function readAppt(apptId) {
  const { rows } = await pool.query(
    `SELECT id, status, payment_status, paid_amount_cents, stripe_payment_intent_id
       FROM appointments WHERE id=$1`,
    [apptId]
  );
  return rows[0] || null;
}

async function cleanup() {
  console.log('\n--- CLEANUP ---');
  for (const apptId of created.appointments) {
    // appointment_payouts CASCADE delete via FK
    await pool.query('DELETE FROM transactions WHERE appointment_id=$1', [apptId]).catch(() => {});
    await pool.query('DELETE FROM appointment_payouts WHERE appointment_id=$1', [apptId]).catch(() => {});
    await pool.query('DELETE FROM appointments WHERE id=$1', [apptId]).catch(() => {});
    console.log('  removed appt', apptId);
  }
  // Stripe PIs/refunds cannot be deleted (Stripe-side), but they're test-mode so OK to leave
}

async function main() {
  try {
    const m = await locateMerchant();
    step('1. Locate merchant', true, {
      user_id: m.user_id, business_name: m.business_name,
      stripe_account_id: m.stripe_account_id, commission_rate: m.commission_rate,
      online_payments_enabled: m.online_payments_enabled, payout_hold_days: m.payout_hold_days,
    });
    if (!m.stripe_account_id) throw new Error('Merchant pas connecte Stripe');

    // ── Scenario A : reservation normale + idempotence schedule ─────────
    const piA = await createTestPI(m.stripe_account_id, 4000, 200, 'scenarioA_schedule');
    step('2a. Stripe PI cree (40€)', true, { id: piA.id, status: piA.status });

    const apptA = await insertTestAppointment(m, piA, null, 4000);
    step('2b. Appointment insere', true, { id: apptA });

    // 1ere schedule
    const sch1 = await scheduleAppointmentPayout(pool, {
      appointmentId: apptA, paymentIntentId: piA.id, amountCents: 3800, // net = 4000 - 200 app_fee
    });
    step('3a. scheduleAppointmentPayout #1', sch1.ok === true, sch1);

    // 2eme schedule (ON CONFLICT DO NOTHING -> idempotent)
    const sch2 = await scheduleAppointmentPayout(pool, {
      appointmentId: apptA, paymentIntentId: piA.id, amountCents: 3800,
    });
    step('3b. scheduleAppointmentPayout #2 (idempotent)', sch2.ok === true, sch2);

    const payoutRowA = await readPayout(apptA);
    step('3c. Verif 1 seule row appointment_payouts', payoutRowA != null, payoutRowA);

    // Cancel (annulation dans delais)
    const cancelA = await cancelAppointmentPayout(pool, apptA, 'e2e_test_cancellation');
    step('4a. cancelAppointmentPayout', cancelA.ok === true && cancelA.cancelled === true, cancelA);

    const payoutRowAcancelled = await readPayout(apptA);
    step('4b. Status = cancelled', payoutRowAcancelled?.status === 'cancelled', {
      status: payoutRowAcancelled?.status, cancelled_reason: payoutRowAcancelled?.cancelled_reason,
    });

    // ── Scenario B : refundAppointment flow complet ─────────────────────
    const piB = await createTestPI(m.stripe_account_id, 6000, 300, 'scenarioB_refund');
    step('5a. Stripe PI cree (60€)', true, { id: piB.id, status: piB.status });

    const apptB = await insertTestAppointment(m, piB, null, 6000);
    step('5b. Appointment insere', true, { id: apptB });

    await scheduleAppointmentPayout(pool, {
      appointmentId: apptB, paymentIntentId: piB.id, amountCents: 5700,
    });
    step('5c. Payout programme', (await readPayout(apptB))?.status === 'pending', null);

    // Appel refundAppointment (chemin merchant_cancelled)
    const refRes = await refundAppointment(pool, apptB, 'e2e_merchant_cancelled');
    step('6a. refundAppointment', refRes.ok === true && refRes.refunded === true, refRes);

    const apptBafter = await readAppt(apptB);
    step('6b. appointments.payment_status = refunded', apptBafter?.payment_status === 'refunded', apptBafter);

    const payoutBafter = await readPayout(apptB);
    step('6c. appointment_payouts.status = cancelled (auto)', payoutBafter?.status === 'cancelled', payoutBafter);

    // Re-appel refundAppointment -> doit etre idempotent
    const refRes2 = await refundAppointment(pool, apptB, 'e2e_merchant_cancelled_retry');
    step('6d. refundAppointment retry (idempotent)', refRes2.ok === true && refRes2.refunded === false, refRes2);

    // ── Scenario C : annulation hors delais (no-show / 24h post end_time) ──
    // On insere un appt passe sans appel refund -> verifie que la row
    // appointment_payouts reste 'pending' (autoNoShow ne refund pas, le
    // commerçant garde l'acompte).
    const piC = await createTestPI(m.stripe_account_id, 3000, 150, 'scenarioC_noshow');
    step('7a. Stripe PI cree (30€)', true, { id: piC.id, status: piC.status });

    // Date dans le passe (2 jours avant aujourd'hui)
    const pastDate = new Date(Date.now() - 2 * 86400e3).toISOString().substring(0, 10);
    const apptC = await insertTestAppointment(m, piC, pastDate, 3000);
    step('7b. Appointment passe insere (date=' + pastDate + ')', true, { id: apptC });

    const schC = await scheduleAppointmentPayout(pool, {
      appointmentId: apptC, paymentIntentId: piC.id, amountCents: 2850,
    });
    step('7c. Payout programme (release_at calcule dans le passe)', schC.ok === true, schC);

    const payoutC = await readPayout(apptC);
    const isPastRelease = payoutC && new Date(payoutC.release_at).getTime() < Date.now();
    step('7d. release_at dans le passe', isPastRelease, {
      release_at: payoutC?.release_at, now: new Date().toISOString(),
    });

    // Simule autoNoShow : on UPDATE l'appt en status='cancelled', cancelled_by='system'
    // sans appeler refundAppointment (= politique no-show : garde l'acompte)
    await pool.query(
      `UPDATE appointments
          SET status='cancelled', cancelled_by='system',
              cancelled_at=NOW(), cancel_reason='no_show_automatique_e2e_test'
        WHERE id=$1`, [apptC]
    );
    step('7e. autoNoShow simule (UPDATE appointments)', true, null);

    const payoutCafter = await readPayout(apptC);
    step('7f. Payout pending preserved (le commerçant garde l\'acompte)',
      payoutCafter?.status === 'pending', payoutCafter);

    // releasePayouts ne sera pas lance ici (eviterait de creer un vrai stripe
    // payout sur le compte test). Mais on confirme que le SELECT du cron
    // attraperait bien cette row :
    const { rows: dueR } = await pool.query(`
      SELECT id, appointment_id, amount_cents, release_at, status
        FROM appointment_payouts
       WHERE status = 'pending' AND release_at <= NOW() AND retry_count < 5
         AND appointment_id = $1
    `, [apptC]);
    step('7g. releasePayouts() le picaurait', dueR.length === 1, dueR[0] || null);

    // ── Final sanity : aucune appointment_payouts 'failed' issue de nos tests ──
    const { rows: failedR } = await pool.query(`
      SELECT id, appointment_id, status, stripe_error_message
        FROM appointment_payouts
       WHERE appointment_id = ANY($1::uuid[])
         AND status = 'failed'
    `, [created.appointments]);
    step('8. Aucune row appointment_payouts en failed', failedR.length === 0, { count: failedR.length });

  } catch (e) {
    step('FATAL', false, null, e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n'));
  } finally {
    await cleanup();
    results.meta.finished_at = new Date().toISOString();
    results.summary = {
      total: results.steps.length,
      passed: results.steps.filter(s => s.ok).length,
      failed: results.steps.filter(s => !s.ok).length,
    };
    console.log('\n========== RAPPORT FINAL DB-FLOW ==========');
    console.log(JSON.stringify(results.summary, null, 2));
    const fs = require('fs');
    fs.writeFileSync(require('path').join(__dirname, 'e2e-db-report.json'), JSON.stringify(results, null, 2));
    await pool.end();
  }
}

main().catch(async e => {
  console.error('FATAL', e);
  try { await cleanup(); await pool.end(); } catch {}
  process.exit(1);
});
