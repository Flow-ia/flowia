// scripts/compare-ledger-vs-legacy.js — phase 3 du refactor ledger.
//
// Compare financial_ledger vs les tables legacy (transactions,
// appointment_payouts, payouts) par merchant sur une fenetre temporelle.
// Objectif : 0 ecart pendant ~1 semaine = greenlight phase 4 (bascule UI).
//
// USAGE :
//   cd backend && node scripts/compare-ledger-vs-legacy.js
//   node scripts/compare-ledger-vs-legacy.js --since 2026-05-12
//   node scripts/compare-ledger-vs-legacy.js --user <uuid>
//   node scripts/compare-ledger-vs-legacy.js --json > drift-report.json
//   node scripts/compare-ledger-vs-legacy.js --tolerance 5
//
// EXIT CODE :
//   0  pas de drift > tolerance
//   1  drift detecte (utilisable en cron pour alerter)
//   2  erreur fatale (DB unreachable, etc.)
//
// METRIQUES COMPAREES :
//   A. Gross payments         (transactions.gross_amount_cents source='rdv_online'
//                              vs ledger entry_type='payment')
//   B. Commission FlowIA      (transactions.platform_fee_cents vs ledger 'commission')
//   C. Stripe fees            (transactions.stripe_fee_cents vs ledger 'stripe_fee')
//   D. Refunds                (transactions.gross_amount_cents source='rdv_refund'
//                              vs ledger entry_type='refund')
//   E. Escrow open            (informationnel — divergences lifecycle attendues)
//   F. Payouts paid           (informationnel — meme raison)
//
// Les drifts sur A/B/C/D sont CRITIQUES (= bug ledger).
// Les drifts sur E/F sont attendus tant que le legacy n'a pas etat 'paid'.

require('dotenv').config();
const { pool } = require('../src/db');

function parseArgs() {
  const args = { since: null, user: null, json: false, tolerance: 0, verbose: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--since') args.since = argv[++i];
    else if (a === '--user') args.user = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--verbose') args.verbose = true;
    else if (a === '--tolerance') args.tolerance = parseInt(argv[++i], 10) || 0;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/compare-ledger-vs-legacy.js [--since YYYY-MM-DD|ISO] [--user UUID] [--json] [--tolerance CENTS] [--verbose]');
      process.exit(0);
    }
  }
  if (!args.since) {
    const d = new Date(Date.now() - 24 * 3600 * 1000);
    args.since = d.toISOString();
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(args.since)) {
    args.since = args.since + 'T00:00:00.000Z';
  }
  return args;
}

const FMT = (cents) => (Number(cents || 0) / 100).toFixed(2);
const PAD = (s, n) => String(s).padEnd(n);
const PADL = (s, n) => String(s).padStart(n);

async function getActiveMerchants(since, userId) {
  const where = userId ? 'WHERE user_id = $2' : '';
  const params = userId ? [since, userId] : [since];
  const { rows } = await pool.query(`
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM financial_ledger        WHERE recorded_at >= $1
      UNION
      SELECT user_id FROM transactions
       WHERE created_at >= $1 AND source IN ('rdv_online','rdv_refund')
      UNION
      SELECT user_id FROM appointment_payouts     WHERE created_at >= $1
    ) all_users
    ${where}
  `, params);
  if (!rows.length) return [];
  const ids = rows.map(r => r.user_id);
  const { rows: info } = await pool.query(`
    SELECT id, business_name FROM users
     WHERE id = ANY($1::uuid[])
     ORDER BY business_name NULLS LAST
  `, [ids]);
  return info;
}

async function compareMerchant(userId, since) {
  const r = { user_id: userId, since };

  // ── LEDGER aggregations ────────────────────────────────────────────────
  const { rows: ledgerRows } = await pool.query(`
    SELECT entry_type, status, SUM(amount_cents)::bigint AS sum
      FROM financial_ledger
     WHERE user_id = $1 AND recorded_at >= $2
     GROUP BY entry_type, status
  `, [userId, since]);
  // L(type, statuses?) : somme amount_cents (signed) pour ce type, optionnel
  // filtre statuses.
  const L = (type, statuses) => ledgerRows
    .filter(row => row.entry_type === type && (!statuses || statuses.includes(row.status)))
    .reduce((s, row) => s + Number(row.sum || 0), 0);
  r.ledger = {
    gross_payment:    L('payment'),                       // positif
    commission:      -L('commission'),                    // stocke negatif, on retourne positif
    stripe_fee:      -L('stripe_fee'),                    // idem
    refund:          -L('refund'),                        // idem
    payout_hold_open: L('payout_hold', ['locked']),       // info
    payout_paid:      L('payout_paid', ['paid']),         // info
  };

  // ── LEGACY aggregations ────────────────────────────────────────────────
  const { rows: lt } = await pool.query(`
    SELECT
      COALESCE(SUM(gross_amount_cents) FILTER (WHERE source='rdv_online'), 0)::bigint AS gross,
      COALESCE(SUM(platform_fee_cents) FILTER (WHERE source='rdv_online'), 0)::bigint AS commission,
      COALESCE(SUM(stripe_fee_cents)   FILTER (WHERE source='rdv_online'), 0)::bigint AS stripe_fee,
      COALESCE(SUM(gross_amount_cents) FILTER (WHERE source='rdv_refund'), 0)::bigint AS refund
      FROM transactions
     WHERE user_id = $1
       AND created_at >= $2
       AND source IN ('rdv_online','rdv_refund')
  `, [userId, since]);
  const { rows: ap } = await pool.query(`
    SELECT COALESCE(SUM(amount_cents) FILTER (WHERE status='pending'), 0)::bigint AS escrow_pending
      FROM appointment_payouts
     WHERE user_id = $1 AND created_at >= $2
  `, [userId, since]);
  const { rows: po } = await pool.query(`
    SELECT COALESCE(SUM(amount_cents) FILTER (WHERE status='paid'), 0)::bigint AS payout_paid
      FROM payouts
     WHERE user_id = $1 AND COALESCE(completed_at, created_at) >= $2
  `, [userId, since]);
  r.legacy = {
    gross_payment:    Number(lt[0].gross),
    commission:       Number(lt[0].commission),
    stripe_fee:       Number(lt[0].stripe_fee),
    refund:           Number(lt[0].refund),
    payout_hold_open: Number(ap[0].escrow_pending),
    payout_paid:      Number(po[0].payout_paid),
  };

  // ── DELTAS ─────────────────────────────────────────────────────────────
  r.delta = {};
  for (const k of Object.keys(r.ledger)) {
    r.delta[k] = r.legacy[k] - r.ledger[k];
  }

  // ── COUNT sanity check ─────────────────────────────────────────────────
  const { rows: cntLed } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE entry_type='payment') AS payments,
      COUNT(*) FILTER (WHERE entry_type='refund')  AS refunds
      FROM financial_ledger
     WHERE user_id = $1 AND recorded_at >= $2
  `, [userId, since]);
  const { rows: cntLeg } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE source='rdv_online') AS payments,
      COUNT(*) FILTER (WHERE source='rdv_refund') AS refunds
      FROM transactions
     WHERE user_id = $1 AND created_at >= $2
       AND source IN ('rdv_online','rdv_refund')
  `, [userId, since]);
  r.counts = {
    ledger: { payments: Number(cntLed[0].payments), refunds: Number(cntLed[0].refunds) },
    legacy: { payments: Number(cntLeg[0].payments), refunds: Number(cntLeg[0].refunds) },
  };

  return r;
}

// Champs CRITIQUES (drift = bug ledger).
const CRITICAL_FIELDS = ['gross_payment', 'commission', 'stripe_fee', 'refund'];
// Champs INFORMATIONNELS (drift attendu pour raisons lifecycle).
const INFO_FIELDS = ['payout_hold_open', 'payout_paid'];

function statusOf(r, tolerance) {
  const drifts = CRITICAL_FIELDS
    .filter(k => Math.abs(r.delta[k]) > tolerance)
    .map(k => ({ field: k, delta_cents: r.delta[k] }));
  return { ok: drifts.length === 0, drifts };
}

function printMerchant(name, r, tolerance) {
  const st = statusOf(r, tolerance);
  console.log('');
  console.log(`Merchant: ${name || '(no business name)'}  user_id=${r.user_id}`);
  const allFields = [
    ['A. Gross payments',     'gross_payment',    true],
    ['B. Commission FlowIA',  'commission',       true],
    ['C. Stripe fees',        'stripe_fee',       true],
    ['D. Refunds',            'refund',           true],
    ['E. Escrow open (info)', 'payout_hold_open', false],
    ['F. Payouts paid (info)','payout_paid',      false],
  ];
  for (const [label, k, isCritical] of allFields) {
    const d = r.delta[k];
    const mark = isCritical
      ? (Math.abs(d) > tolerance ? 'X' : 'OK')
      : (Math.abs(d) > tolerance ? '~ ' : 'OK');
    console.log('  ' + PAD(label, 26)
      + 'Ledger: ' + PADL(FMT(r.ledger[k]) + 'E', 12)
      + '  Legacy: ' + PADL(FMT(r.legacy[k]) + 'E', 12)
      + '  D: ' + PADL(FMT(d) + 'E', 10) + '  ' + mark);
  }
  console.log('  Counts: payments ledger=' + r.counts.ledger.payments + ' legacy=' + r.counts.legacy.payments
    + ' | refunds ledger=' + r.counts.ledger.refunds + ' legacy=' + r.counts.legacy.refunds);
  console.log('  Status: ' + (st.ok ? 'OK' : 'DRIFT on ' + st.drifts.map(d => d.field).join(',')));
}

async function main() {
  const args = parseArgs();
  const since = new Date(args.since).toISOString();
  if (Number.isNaN(new Date(since).getTime())) {
    console.error('FATAL: invalid --since value: ' + args.since);
    process.exit(2);
  }

  if (!args.json) {
    console.log('=== FlowIA Financial Ledger vs Legacy comparison ===');
    console.log('Generated at: ' + new Date().toISOString());
    console.log('Since:        ' + since);
    console.log('Tolerance:    ' + args.tolerance + 'c');
    if (args.user) console.log('Filter user:  ' + args.user);
  }

  const merchants = await getActiveMerchants(since, args.user);
  if (!merchants.length) {
    if (!args.json) {
      console.log('\nNo merchants with activity since ' + since);
    } else {
      console.log(JSON.stringify({
        since, tolerance: args.tolerance, merchants: [],
        summary: { total: 0, ok: 0, drift: 0 }
      }, null, 2));
    }
    await pool.end();
    process.exit(0);
  }

  const results = [];
  for (const m of merchants) {
    const r = await compareMerchant(m.id, since);
    r.business_name = m.business_name;
    const st = statusOf(r, args.tolerance);
    r.status = st.ok ? 'OK' : 'DRIFT';
    r.drift_fields = st.drifts;
    results.push(r);
    if (!args.json) printMerchant(m.business_name, r, args.tolerance);
  }

  const summary = {
    total: results.length,
    ok: results.filter(r => r.status === 'OK').length,
    drift: results.filter(r => r.status === 'DRIFT').length,
  };

  if (args.json) {
    console.log(JSON.stringify({
      generated_at: new Date().toISOString(),
      since, tolerance: args.tolerance,
      merchants: results, summary,
    }, null, 2));
  } else {
    console.log('\n=== SUMMARY ===');
    console.log('Merchants checked: ' + summary.total);
    console.log('  OK:    ' + summary.ok);
    console.log('  DRIFT: ' + summary.drift);
    if (summary.drift > 0) {
      console.log('\nDrifting merchants:');
      for (const r of results.filter(r => r.status === 'DRIFT')) {
        console.log('  - ' + (r.business_name || '(no name)') + ' (' + r.user_id + ')');
        for (const d of r.drift_fields) {
          console.log('    . ' + d.field + ' delta=' + FMT(d.delta_cents) + 'E (legacy - ledger)');
        }
      }
    }
  }

  await pool.end();
  process.exit(summary.drift > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(2);
});
