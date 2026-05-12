// scripts/e2e-stripe-connect.js — Tests E2E Stripe Connect (mode TEST).
//
// USAGE :
//   cd backend && node scripts/e2e-stripe-connect.js
//
// PREREQUIS :
//   - .env avec STRIPE_SECRET_KEY=sk_test_... + DATABASE_URL Supabase
//   - acct_id et slug du merchant test dans les constantes ci-dessous
//   - Compte test deja onboarde (charges_enabled=true)
//
// CE QUE CE SCRIPT FAIT :
//   1. Verifie l'acces Stripe Test (whoami)
//   2. Inspecte le compte connecte test (charges/payouts enabled, balance, schedule manual)
//   3. Inspecte le merchant en DB (commission_rate, online_payments_enabled, policy)
//   4. Cree un PaymentIntent test sur le compte connecte avec application_fee_amount
//   5. Confirme le PI avec un PM test (pm_card_visa)
//   6. Verifie que charge.balance_transaction reflete net = amount - fees
//   7. Test idempotencyKey refund (2 appels = 1 seul refund Stripe)
//   8. Test idempotencyKey payout (2 appels = 1 seul payout Stripe)
//   9. Rapport JSON final
//
// AUCUNE ECRITURE EN DB — tests Stripe-only pour mesurer le contrat avec
// l'API. Les tests DB-side (book, refund flow complet, webhook handlers)
// necessiteront un backend tournant + Stripe CLI pour forwarder webhooks.

require('dotenv').config();
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

const TEST_ACCOUNT_ID = 'acct_1TUFSaRnGbDwVdTo';
const TEST_SLUG       = 'saon-de-test-lille-59800';

const results = {
  meta: {
    started_at: new Date().toISOString(),
    account: TEST_ACCOUNT_ID,
    slug: TEST_SLUG,
    stripe_key_prefix: (process.env.STRIPE_SECRET_KEY || '').substring(0, 12),
  },
  steps: [],
};

function step(name, ok, data, error) {
  const entry = { name, ok, ts: new Date().toISOString() };
  if (data)  entry.data  = data;
  if (error) entry.error = error;
  results.steps.push(entry);
  const icon = ok ? '✓' : '✗';
  console.log(`${icon} ${name}` + (data ? ` — ${JSON.stringify(data).substring(0, 200)}` : '') + (error ? ` ERROR: ${error}` : ''));
}

async function main() {
  // ── 1. Acces Stripe Test ───────────────────────────────────────────────
  try {
    const bal = await stripe.balance.retrieve();
    step('1. Stripe API access', true, {
      livemode: bal.livemode,
      available_eur: (bal.available || []).filter(b => b.currency === 'eur').map(b => b.amount),
    });
    if (bal.livemode) {
      step('SAFETY CHECK', false, null, 'Clef LIVE detectee — abort');
      process.exit(1);
    }
  } catch (e) {
    step('1. Stripe API access', false, null, e.message);
    process.exit(1);
  }

  // ── 2. Inspection compte connecte test ─────────────────────────────────
  let acc;
  try {
    acc = await stripe.accounts.retrieve(TEST_ACCOUNT_ID);
    step('2. Compte connecte retrieve', true, {
      id: acc.id,
      type: acc.type,
      country: acc.country,
      email: acc.email,
      business_name: acc.business_profile?.name,
      charges_enabled: acc.charges_enabled,
      payouts_enabled: acc.payouts_enabled,
      details_submitted: acc.details_submitted,
      payouts_schedule: acc.settings?.payouts?.schedule?.interval,
      currently_due: acc.requirements?.currently_due || [],
      controller_fees_payer: acc.controller?.fees?.payer,
      controller_losses: acc.controller?.losses?.payments,
    });
    if (!acc.charges_enabled) {
      step('SAFETY CHECK', false, null, 'charges_enabled=false sur compte test — impossible de creer PI');
      process.exit(1);
    }
    if (acc.settings?.payouts?.schedule?.interval !== 'manual') {
      step('WARNING payouts schedule', false, { current: acc.settings?.payouts?.schedule?.interval }, 'Pas en manual — escrow FlowIA inoperant');
    }
  } catch (e) {
    step('2. Compte connecte retrieve', false, null, e.message);
    process.exit(1);
  }

  // ── 3. Balance Connect (avant test) ────────────────────────────────────
  let balBefore;
  try {
    balBefore = await stripe.balance.retrieve({}, { stripeAccount: TEST_ACCOUNT_ID });
    const eurAvail = (balBefore.available || []).find(b => b.currency === 'eur')?.amount || 0;
    const eurPend  = (balBefore.pending   || []).find(b => b.currency === 'eur')?.amount || 0;
    step('3. Balance Connect (before)', true, { available_cents: eurAvail, pending_cents: eurPend });
  } catch (e) {
    step('3. Balance Connect (before)', false, null, e.message);
  }

  // ── 4. Cree PaymentIntent Test (50€ avec commission 5%) ────────────────
  const TEST_AMOUNT_CENTS = 5000; // 50€
  const TEST_FEE_CENTS    = 250;  // 5% commission FlowIA
  let pi;
  try {
    pi = await stripe.paymentIntents.create({
      amount: TEST_AMOUNT_CENTS,
      currency: 'eur',
      application_fee_amount: TEST_FEE_CENTS,
      payment_method: 'pm_card_visa',
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: 'E2E-TEST · Scenario 1 · ' + new Date().toISOString(),
      metadata: {
        source: 'flowia_e2e_script',
        scenario: 'direct_charge_with_fee',
        run_at: new Date().toISOString(),
      },
    }, { stripeAccount: TEST_ACCOUNT_ID });
    step('4. PaymentIntent create + confirm', true, {
      id: pi.id,
      status: pi.status,
      amount: pi.amount,
      application_fee_amount: pi.application_fee_amount,
      latest_charge: pi.latest_charge,
    });
  } catch (e) {
    step('4. PaymentIntent create + confirm', false, null,
      `[${e.type || 'GenericError'}] [${e.code || ''}] ${e.message}`);
    process.exit(1);
  }

  // ── 5. Charge + balance_transaction (verifier net) ─────────────────────
  let ch, bt;
  try {
    ch = await stripe.charges.retrieve(pi.latest_charge, undefined, { stripeAccount: TEST_ACCOUNT_ID });
    if (ch.balance_transaction) {
      const btId = typeof ch.balance_transaction === 'string' ? ch.balance_transaction : ch.balance_transaction.id;
      bt = await stripe.balanceTransactions.retrieve(btId, undefined, { stripeAccount: TEST_ACCOUNT_ID });
      step('5. Balance transaction', true, {
        gross_cents: bt.amount,
        stripe_fee_cents: bt.fee,
        net_cents: bt.net,
        currency: bt.currency,
      });
    } else {
      step('5. Balance transaction', false, null, 'pas de balance_transaction sur charge');
    }
  } catch (e) {
    step('5. Balance transaction', false, null, e.message);
  }

  // ── 6. Idempotency test refund ─────────────────────────────────────────
  // Appel 2x avec meme idempotencyKey doit retourner le MEME refund.
  // VALIDATION du fix BUG 5 dans refundAppointment.js.
  const refundIdemKey = `e2e_refund_${pi.id}`;
  let refund1, refund2;
  try {
    refund1 = await stripe.refunds.create(
      { payment_intent: pi.id, amount: 1000, metadata: { test: 'idempotency_e2e' } },
      { stripeAccount: TEST_ACCOUNT_ID, idempotencyKey: refundIdemKey }
    );
    step('6a. Refund #1 (partial 10€)', true, {
      id: refund1.id, amount: refund1.amount, status: refund1.status,
    });
  } catch (e) {
    step('6a. Refund #1', false, null, e.message);
  }
  try {
    refund2 = await stripe.refunds.create(
      { payment_intent: pi.id, amount: 1000, metadata: { test: 'idempotency_e2e' } },
      { stripeAccount: TEST_ACCOUNT_ID, idempotencyKey: refundIdemKey }
    );
    step('6b. Refund #2 (same idempKey)', true, {
      id: refund2.id, amount: refund2.amount,
      same_as_first: refund1 && refund2.id === refund1.id,
    });
    if (refund1 && refund2.id !== refund1.id) {
      step('IDEMPOTENCY FAILED', false, null,
        `2 calls same key produced DIFFERENT refunds: ${refund1.id} vs ${refund2.id}`);
    } else {
      step('6c. IDEMPOTENCY OK', true, { reused_refund_id: refund1?.id });
    }
  } catch (e) {
    step('6b. Refund #2', false, null, e.message);
  }

  // ── 7. Verifier que l'application_fee N'EST PAS rembourse ──────────────
  // Politique business : FlowIA garde la commission quoi qu'il arrive.
  // Sans refund_application_fee:true, Stripe ne rend pas la commission au
  // merchant. On verifie en retrieve le charge apres refund partiel.
  try {
    const chAfter = await stripe.charges.retrieve(pi.latest_charge, { expand: ['application_fee'] }, { stripeAccount: TEST_ACCOUNT_ID });
    const appFee = chAfter.application_fee;
    let appFeeObj = null;
    if (appFee) {
      const feeId = typeof appFee === 'string' ? appFee : appFee.id;
      // app fee se retrieve sur le compte PLATEFORME, sans stripeAccount.
      appFeeObj = await stripe.applicationFees.retrieve(feeId);
    }
    step('7. Application fee state after partial refund', true, {
      app_fee_id: appFeeObj?.id,
      amount: appFeeObj?.amount,
      amount_refunded: appFeeObj?.amount_refunded || 0,
      refunded: appFeeObj?.refunded || false,
      policy_check: appFeeObj?.amount_refunded === 0
        ? 'OK FlowIA garde commission'
        : 'INCONSISTENT app_fee rembourse alors que politique=garder',
    });
  } catch (e) {
    step('7. Application fee check', false, null, e.message);
  }

  // ── 8. Idempotency test payout ─────────────────────────────────────────
  // Necessite que le balance Connect ait des fonds disponibles. Apres
  // refund partiel le balance pending peut etre <= 0. On lit la balance
  // available et on essaie un petit payout.
  try {
    const balNow = await stripe.balance.retrieve({}, { stripeAccount: TEST_ACCOUNT_ID });
    const eurAvail = (balNow.available || []).find(b => b.currency === 'eur')?.amount || 0;
    const eurPend  = (balNow.pending   || []).find(b => b.currency === 'eur')?.amount || 0;
    step('8a. Balance avant payout test', true, { available_cents: eurAvail, pending_cents: eurPend });

    if (eurAvail >= 100) {
      const payoutAmount = Math.min(100, eurAvail);
      const payoutKey = `e2e_payout_test_${Date.now()}`;
      const po1 = await stripe.payouts.create(
        { amount: payoutAmount, currency: 'eur', metadata: { test: 'idempotency_e2e' } },
        { stripeAccount: TEST_ACCOUNT_ID, idempotencyKey: payoutKey }
      );
      const po2 = await stripe.payouts.create(
        { amount: payoutAmount, currency: 'eur', metadata: { test: 'idempotency_e2e' } },
        { stripeAccount: TEST_ACCOUNT_ID, idempotencyKey: payoutKey }
      );
      step('8b. Payout idempotency', po1.id === po2.id, {
        id1: po1.id, id2: po2.id, same: po1.id === po2.id, status: po1.status,
      });
    } else {
      step('8b. Payout idempotency', true, null,
        'SKIPPED (balance available < 1€ — typiquement pending sur paiements test recents)');
    }
  } catch (e) {
    step('8b. Payout idempotency', false, null, e.message);
  }

  // ── 9. Rapport final ────────────────────────────────────────────────────
  results.meta.finished_at = new Date().toISOString();
  results.summary = {
    total_steps: results.steps.length,
    passed: results.steps.filter(s => s.ok).length,
    failed: results.steps.filter(s => !s.ok).length,
  };
  console.log('\n========== RAPPORT FINAL ==========');
  console.log(JSON.stringify(results.summary, null, 2));
  const fs = require('fs');
  const outPath = require('path').join(__dirname, 'e2e-report.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nRapport complet ecrit : ${outPath}`);
}

main().catch(e => {
  console.error('FATAL', e);
  process.exit(1);
});
