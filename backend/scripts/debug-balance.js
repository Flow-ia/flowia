// scripts/debug-balance.js — debug ad-hoc pour comparer ce que Stripe
// declare comme balance (available / pending / in_transit) vs ce que
// FlowIA pense (appointment_payouts, transactions rdv_online, ledger).
//
// USAGE :
//   cd backend && node scripts/debug-balance.js
//   node scripts/debug-balance.js --slug saon-de-test-lille-59800

require('dotenv').config();
const Stripe = require('stripe');
const { pool } = require('../src/db');

const SLUG = process.argv.includes('--slug') ? process.argv[process.argv.indexOf('--slug') + 1] : 'saon-de-test-lille-59800';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

const eur = (cents) => (Number(cents || 0) / 100).toFixed(2).replace('.', ',') + ' €';

(async () => {
  try {
    const { rows: m } = await pool.query(
      `SELECT u.id AS user_id, u.business_name, u.stripe_account_id, u.commission_rate, u.payout_hold_days
         FROM booking_settings bs JOIN users u ON u.id = bs.user_id
        WHERE bs.slug = $1`, [SLUG]);
    if (!m.length) throw new Error('Merchant introuvable pour slug ' + SLUG);
    const merchant = m[0];

    console.log('=== Debug balance Stripe Connect ===');
    console.log('Merchant: ' + merchant.business_name);
    console.log('user_id:  ' + merchant.user_id);
    console.log('stripe_account_id: ' + merchant.stripe_account_id);
    console.log('commission_rate:   ' + merchant.commission_rate + '%');
    console.log('payout_hold_days:  ' + merchant.payout_hold_days);
    console.log('');

    // ── 1. Stripe Balance API ──────────────────────────────────────────
    console.log('--- 1. Stripe Balance API (source de verite Stripe) ---');
    const bal = await stripe.balance.retrieve({}, { stripeAccount: merchant.stripe_account_id });
    const sumEur = (arr) => (arr || []).filter(b => (b.currency || '').toLowerCase() === 'eur')
                                        .reduce((s, b) => s + (b.amount || 0), 0);
    const available = sumEur(bal.available);
    const pending   = sumEur(bal.pending);
    const inTransit = sumEur(bal.in_transit);
    console.log('  available  (settled, payoutable):  ' + eur(available));
    console.log('  pending    (en attente settlement): ' + eur(pending));
    console.log('  in_transit (payout en cours):       ' + eur(inTransit));
    console.log('  TOTAL      (= ce que tu as au total): ' + eur(available + pending + inTransit));
    console.log('  livemode:', bal.livemode);

    // ── 2. Escrow FlowIA (appointment_payouts) ─────────────────────────
    console.log('\n--- 2. Escrow FlowIA (appointment_payouts) ---');
    const { rows: ap } = await pool.query(`
      SELECT status, COUNT(*)::int AS n, COALESCE(SUM(amount_cents),0)::bigint AS total_cents
        FROM appointment_payouts
       WHERE user_id = $1
       GROUP BY status ORDER BY status`, [merchant.user_id]);
    if (!ap.length) console.log('  (aucune row)');
    for (const row of ap) console.log('  ' + row.status.padEnd(12) + ' : ' + String(row.n).padStart(4) + ' rows · ' + eur(row.total_cents));
    const pendingEscrow = ap.find(r => r.status === 'pending');
    if (pendingEscrow) {
      console.log('  → ' + pendingEscrow.n + ' paiements bloques par escrow FlowIA (release_at futur ou pas encore tique par cron)');
    }

    // ── 3. Transactions source='rdv_online' ─────────────────────────────
    console.log('\n--- 3. Transactions rdv_online (legacy, vue payments) ---');
    const { rows: tx } = await pool.query(`
      SELECT payment_status,
             COUNT(*)::int AS n,
             COALESCE(SUM(gross_amount_cents),0)::bigint AS gross,
             COALESCE(SUM(stripe_fee_cents),0)::bigint AS stripe_fee,
             COALESCE(SUM(platform_fee_cents),0)::bigint AS platform_fee,
             COALESCE(SUM(net_amount_cents),0)::bigint AS net,
             COUNT(*) FILTER (WHERE payout_received_at IS NULL)::int AS not_yet_paid
        FROM transactions
       WHERE user_id = $1 AND source IN ('rdv_online','rdv_refund')
       GROUP BY payment_status ORDER BY payment_status`, [merchant.user_id]);
    for (const row of tx) console.log('  ' + (row.payment_status || '(null)').padEnd(20) +
      ' : ' + String(row.n).padStart(4) + ' · brut ' + eur(row.gross) + ' · net ' + eur(row.net) +
      ' · non payouté ' + row.not_yet_paid);

    // ── 4. Financial ledger ─────────────────────────────────────────────
    console.log('\n--- 4. Financial ledger (truth layer) ---');
    const { rows: led } = await pool.query(`
      SELECT entry_type, status,
             COUNT(*)::int AS n,
             COALESCE(SUM(amount_cents),0)::bigint AS total
        FROM financial_ledger
       WHERE user_id = $1
       GROUP BY entry_type, status ORDER BY entry_type, status`, [merchant.user_id]);
    if (!led.length) console.log('  (aucune row — la migration phase 1 n a pas encore tourne en prod, ou aucun payment apres phase 2)');
    for (const row of led) console.log('  ' + row.entry_type.padEnd(16) + ' · ' + row.status.padEnd(10) +
      ' : ' + String(row.n).padStart(4) + ' rows · ' + eur(row.total));

    // ── 5. Diagnostic ───────────────────────────────────────────────────
    console.log('\n--- 5. Diagnostic ---');
    const netTheorique = tx.reduce((s, r) => s + Number(r.net), 0);
    console.log('  Net theorique FlowIA (= ce qui s affiche "Net pour vous"): ' + eur(netTheorique));
    console.log('  Solde dispo Stripe (= ce qui s affiche "À reverser maintenant"): ' + eur(available));
    console.log('');
    if (available === 0 && pending > 0) {
      console.log('  CAUSE PRINCIPALE: ' + eur(pending) + ' encore en "pending" Stripe (settlement pas');
      console.log('    encore termine). En TEST mode avec pm_card_visa, ce pending reste typiquement');
      console.log('    bloque indefiniment. En LIVE, settlement = T+2 jours ouvrables.');
    }
    if (available === 0 && pending === 0 && inTransit === 0) {
      console.log('  CAUSE: balance totalement vide (paiements compenses par refunds ou jamais reellement');
      console.log('    settles). Verifier dans Stripe Dashboard test → Payments le detail.');
    }
    if (pendingEscrow && pendingEscrow.n > 0) {
      console.log('  ESCROW FLOWIA: ' + pendingEscrow.n + ' paiements (' + eur(pendingEscrow.total_cents) +
        ') aussi bloques par escrow FlowIA (release_at futur ou cron pas encore passe).');
      console.log('    → 2 conditions doivent etre remplies pour reverser:');
      console.log('       (a) release_at <= NOW() (RDV passe + ' + merchant.payout_hold_days + ' jours)');
      console.log('       (b) balance.available >= amount (Stripe a settle)');
    }
    if (available > 0) {
      console.log('  Le bouton "Reverser maintenant" devrait etre actif (available > 0).');
    } else {
      console.log('  Le bouton "Reverser maintenant" est DESACTIVE car available = 0.');
    }
  } catch (e) {
    console.error('FATAL:', e.message || e);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
  }
})();
