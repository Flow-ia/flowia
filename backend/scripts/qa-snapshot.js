// scripts/qa-snapshot.js — snapshot DB pour QA payouts.
// Lit toutes les rows liees au merchant test "Saon de Test".
require('dotenv').config();
const { pool } = require('../src/db');

const SLUG = 'saon-de-test-lille-59800';

(async () => {
  try {
    const { rows: mRows } = await pool.query(
      `SELECT u.id AS user_id, u.business_name, u.stripe_account_id,
              u.commission_rate, u.payout_hold_days, u.online_payments_enabled,
              u.stripe_charges_enabled, bs.slug, bs.is_enabled
         FROM booking_settings bs JOIN users u ON u.id=bs.user_id
        WHERE bs.slug=$1`, [SLUG]);
    if (!mRows.length) throw new Error('Merchant introuvable');
    const m = mRows[0];
    console.log('MERCHANT:', JSON.stringify(m, null, 2));

    const userId = m.user_id;

    // Counts
    const { rows: cnt } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM appointments WHERE user_id=$1)::int AS appointments,
        (SELECT COUNT(*) FROM appointments WHERE user_id=$1 AND stripe_payment_intent_id IS NOT NULL)::int AS appointments_with_pi,
        (SELECT COUNT(*) FROM transactions WHERE user_id=$1 AND source IN ('rdv_online','rdv_refund'))::int AS tx_online,
        (SELECT COUNT(*) FROM appointment_payouts WHERE user_id=$1)::int AS escrow_total,
        (SELECT COUNT(*) FROM appointment_payouts WHERE user_id=$1 AND status='pending')::int AS escrow_pending,
        (SELECT COUNT(*) FROM appointment_payouts WHERE user_id=$1 AND status='released')::int AS escrow_released,
        (SELECT COUNT(*) FROM appointment_payouts WHERE user_id=$1 AND status='cancelled')::int AS escrow_cancelled,
        (SELECT COUNT(*) FROM appointment_payouts WHERE user_id=$1 AND status='failed')::int AS escrow_failed,
        (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1)::int AS ledger_total,
        (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1 AND entry_type='payment')::int AS ledger_payment,
        (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1 AND entry_type='commission')::int AS ledger_commission,
        (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1 AND entry_type='stripe_fee')::int AS ledger_stripe_fee,
        (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1 AND entry_type='refund')::int AS ledger_refund,
        (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1 AND entry_type='payout_hold')::int AS ledger_payout_hold,
        (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1 AND entry_type='payout_release')::int AS ledger_payout_release,
        (SELECT COUNT(*) FROM financial_ledger WHERE user_id=$1 AND entry_type='payout_paid')::int AS ledger_payout_paid,
        (SELECT COUNT(*) FROM payouts WHERE user_id=$1)::int AS payouts
    `, [userId]);
    console.log('COUNTS:', JSON.stringify(cnt[0], null, 2));

    // Last 5 escrow rows
    const { rows: escrow } = await pool.query(
      `SELECT id, appointment_id, amount_cents, status, release_at, stripe_payout_id, retry_count, stripe_error_message, created_at
         FROM appointment_payouts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5`, [userId]);
    console.log('ESCROW_LAST5:', JSON.stringify(escrow, null, 2));

    // Client account check (need 1 for /book login)
    const { rows: cli } = await pool.query(
      `SELECT id, email, first_name, last_name, phone_e164, global_client_id, is_booking_blocked
         FROM client_accounts WHERE user_id=$1 AND phone_e164 IS NOT NULL
         ORDER BY created_at DESC LIMIT 3`, [userId]);
    console.log('CLIENT_ACCOUNTS_SAMPLE:', JSON.stringify(cli, null, 2));

    // Booking services
    const { rows: svc } = await pool.query(
      `SELECT id, name, price, duration_minutes, is_active
         FROM booking_services WHERE user_id=$1 AND is_active=TRUE LIMIT 3`, [userId]);
    console.log('SERVICES_ACTIVE:', JSON.stringify(svc, null, 2));

    // Employees
    const { rows: emp } = await pool.query(
      `SELECT id, name, is_active, show_on_booking FROM employees
        WHERE user_id=$1 AND is_active=TRUE AND show_on_booking=TRUE LIMIT 3`, [userId]);
    console.log('EMPLOYEES_ACTIVE:', JSON.stringify(emp, null, 2));
  } catch (e) {
    console.error('FATAL', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
