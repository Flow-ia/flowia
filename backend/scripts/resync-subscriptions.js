// scripts/resync-subscriptions.js — resync DB users.subscription_* depuis
// Stripe API. Cas reel observe 2026-05-12 : Hair Coiff Lille avait
// subscription_id en DB mais subscription_status=NULL (webhook
// customer.subscription.* tombe en silence ou perdu).
//
// Pour chaque user ayant stripe_subscription_id non null :
//   1. stripe.subscriptions.retrieve(sub_id)
//   2. UPDATE users SET subscription_status = stripe.status,
//      subscription_current_period_end = ..., subscription_trial_ends_at = ...,
//      subscription_cancel_at_period_end = ...
//   3. Reporte les divergences avant/apres
//
// USAGE :
//   node scripts/resync-subscriptions.js                 # dry-run
//   node scripts/resync-subscriptions.js --apply         # ecrit
//   node scripts/resync-subscriptions.js --user UUID     # 1 merchant
//
// Idempotent : peut etre relance sans risque.

require('dotenv').config();
const Stripe = require('stripe');
const { pool } = require('../src/db');

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

function planPeriodFromPrice(priceId) {
  if (!priceId) return { plan: null, period: null };
  if (priceId === process.env.STRIPE_PRICE_ESSENTIEL_MONTHLY) return { plan: 'essentiel', period: 'monthly' };
  if (priceId === process.env.STRIPE_PRICE_ESSENTIEL_YEARLY)  return { plan: 'essentiel', period: 'yearly'  };
  if (priceId === process.env.STRIPE_PRICE_EQUIPE_MONTHLY)    return { plan: 'equipe',    period: 'monthly' };
  if (priceId === process.env.STRIPE_PRICE_EQUIPE_YEARLY)     return { plan: 'equipe',    period: 'yearly'  };
  return { plan: null, period: null };
}

(async () => {
  console.log('=== resync-subscriptions ' + (args.apply ? '(APPLY)' : '(DRY-RUN)') + ' ===');
  const bal = await stripe.balance.retrieve();
  console.log('Stripe mode:', bal.livemode ? 'LIVE' : 'TEST');

  const params = [];
  let where = `stripe_subscription_id IS NOT NULL`;
  if (args.user) {
    params.push(args.user);
    where += ` AND id = $${params.length}`;
  }
  const { rows } = await pool.query(`
    SELECT id, email, business_name, stripe_subscription_id, stripe_customer_id,
           subscription_status, subscription_plan, subscription_period,
           subscription_current_period_end, subscription_trial_ends_at,
           subscription_cancel_at_period_end
      FROM users
     WHERE ${where}
     ORDER BY created_at DESC
  `, params);

  console.log('Users a auditer :', rows.length);
  const report = { scanned: 0, synced: 0, in_sync: 0, errors: [] };

  for (const u of rows) {
    report.scanned++;
    try {
      const sub = await stripe.subscriptions.retrieve(u.stripe_subscription_id);
      const it  = sub.items?.data?.[0];
      const priceId = it?.price?.id;
      const pp = planPeriodFromPrice(priceId);
      const periodEnd = sub.current_period_end || it?.current_period_end || sub.trial_end || null;
      const trialEnd  = sub.trial_end || null;
      const cancelAtEnd = !!sub.cancel_at_period_end;

      const drifts = [];
      if (u.subscription_status !== sub.status) drifts.push(`status: ${u.subscription_status||'NULL'} -> ${sub.status}`);
      if (pp.plan && u.subscription_plan !== pp.plan) drifts.push(`plan: ${u.subscription_plan||'NULL'} -> ${pp.plan}`);
      if (pp.period && u.subscription_period !== pp.period) drifts.push(`period: ${u.subscription_period||'NULL'} -> ${pp.period}`);
      const dbEndSec = u.subscription_current_period_end
        ? Math.floor(new Date(u.subscription_current_period_end).getTime()/1000) : null;
      if (periodEnd && dbEndSec !== periodEnd) drifts.push(`period_end: ${dbEndSec} -> ${periodEnd}`);
      if (!!u.subscription_cancel_at_period_end !== cancelAtEnd)
        drifts.push(`cancel_at_end: ${u.subscription_cancel_at_period_end} -> ${cancelAtEnd}`);

      if (drifts.length === 0) {
        report.in_sync++;
        console.log(`  [OK] ${u.business_name} status=${u.subscription_status}`);
        continue;
      }

      console.log(`  [DRIFT] ${u.business_name} <${u.email}>`);
      drifts.forEach(d => console.log(`    ${d}`));

      if (!args.apply) {
        report.synced++;
        continue;
      }

      // UPDATE : on respecte le plan/period existant si Stripe price inconnu
      // (env STRIPE_PRICE_* manquante = ne pas ecraser avec NULL).
      const setParts = [
        'subscription_status = $2',
        'subscription_current_period_end = COALESCE(to_timestamp($3), subscription_current_period_end)',
        'subscription_trial_ends_at = CASE WHEN $4::int IS NULL THEN subscription_trial_ends_at ELSE to_timestamp($4) END',
        'subscription_cancel_at_period_end = $5',
      ];
      const upParams = [u.id, sub.status, periodEnd, trialEnd, cancelAtEnd];
      if (pp.plan) { setParts.push(`subscription_plan = $${upParams.length+1}`); upParams.push(pp.plan); }
      if (pp.period) { setParts.push(`subscription_period = $${upParams.length+1}`); upParams.push(pp.period); }
      await pool.query(
        `UPDATE users SET ${setParts.join(', ')} WHERE id = $1`,
        upParams
      );
      report.synced++;
    } catch (e) {
      report.errors.push({ user_id: u.id, business_name: u.business_name, error: e.message });
      console.error(`  [ERR] ${u.business_name}`, e.message);
    }
  }

  console.log('\n=== REPORT ===');
  console.log(JSON.stringify(report, null, 2));
  await pool.end();
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
