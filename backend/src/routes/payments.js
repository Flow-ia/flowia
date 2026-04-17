// routes/payments.js — Recharge SMS via Stripe
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

const SMS_COST   = parseFloat(process.env.SMS_COST_UNIT)      || 0.045;
const SMS_MARGIN = parseFloat(process.env.SMS_MARGIN_PERCENT)  || 30;
const SMS_PRICE  = parseFloat((SMS_COST * (1 + SMS_MARGIN / 100)).toFixed(4));

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante sur Render');
  return require('stripe')(key);
}

// Garantit qu'un Customer Stripe existe pour ce merchant (réutilise les cartes)
async function ensureStripeCustomer(userId) {
  const { rows } = await pool.query(
    'SELECT stripe_customer_id, email, business_name FROM users WHERE id=$1', [userId]
  );
  if (!rows.length) throw new Error('User introuvable');
  if (rows[0].stripe_customer_id) return rows[0].stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: rows[0].email,
    name:  rows[0].business_name || undefined,
    metadata: { user_id: userId },
  });
  await pool.query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [customer.id, userId]);
  return customer.id;
}

// ── POST /api/payments/sms/intent — PaymentIntent embarqué ────────────────────
// 3 modes possibles:
//   A) new_card     = true  → carte neuve tokenisée (user on-session)
//                             → confirm=true, setup_future_usage si save_card
//   B) saved_card   = true  → carte déjà enregistrée (paiement 1-clic off-session)
//                             → off_session=true, confirm=true, PAS de setup_future_usage
//   C) aucun pm_id          → pré-création pour PaymentElement côté client
//                             → automatic_payment_methods, pas de confirm
// IMPORTANT: Stripe interdit off_session=true + setup_future_usage simultanément.
router.post('/sms/intent', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const amount = parseFloat(req.body.amount);
    const { payment_method_id, save_card, new_card } = req.body;
    if (!amount || amount < 5) return res.status(400).json({ error: 'Montant minimum : 5 EUR' });

    const stripe = getStripe();
    const customerId = await ensureStripeCustomer(userId);
    const estimatedSms = Math.floor(amount / SMS_PRICE);

    const intentOpts = {
      amount: Math.round(amount * 100),
      currency: 'eur',
      customer: customerId,
      description: `Recharge SMS FlowIA — environ ${estimatedSms} SMS`,
      metadata: { user_id: userId, amount: amount.toString(), sms_count: estimatedSms.toString() },
    };

    if (payment_method_id && new_card) {
      // A) Carte neuve — user on-session, peut gérer 3DS, option save_card
      intentOpts.payment_method = payment_method_id;
      intentOpts.confirm        = true;
      // return_url nécessaire pour la redirection éventuelle 3DS
      intentOpts.return_url     = (process.env.FRONTEND_URL || '').split(',')[0]?.replace(/\/$/, '')
                                  + '/settings/marketing/solde';
      if (save_card) intentOpts.setup_future_usage = 'off_session';
    } else if (payment_method_id) {
      // B) Carte enregistrée — paiement off-session 1-clic
      intentOpts.payment_method = payment_method_id;
      intentOpts.confirm        = true;
      intentOpts.off_session    = true;
      // PAS de setup_future_usage (carte déjà enregistrée → interdit par Stripe)
    } else {
      // C) Pré-création pour PaymentElement (pas de pm_id encore)
      intentOpts.automatic_payment_methods = { enabled: true };
    }

    const intent = await stripe.paymentIntents.create(intentOpts);

    await pool.query(`
      INSERT INTO sms_transactions
        (user_id, type, amount, sms_count, description, sumup_checkout_id, status)
      VALUES ($1,'credit',$2,$3,$4,$5,'pending')
      ON CONFLICT DO NOTHING
    `, [userId, amount, estimatedSms, `Recharge ${amount} EUR`, intent.id]);

    res.json({
      client_secret: intent.client_secret,
      intent_id: intent.id,
      status: intent.status,
      next_action: intent.next_action?.type || null,
      estimated_sms: estimatedSms,
    });
  } catch(e) {
    console.error('[STRIPE INTENT ERR]', e.message);
    // Erreur de paiement Stripe (carte refusée, fonds insuffisants, etc.)
    if (e.type === 'StripeCardError' || e.code) {
      return res.status(400).json({ error: e.message, code: e.code });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/payments/sms/payment-methods ─────────────────────────────────────
router.get('/sms/payment-methods', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      'SELECT stripe_customer_id, default_payment_method FROM users WHERE id=$1', [userId]
    );
    if (!rows.length || !rows[0].stripe_customer_id) return res.json({ methods: [], default: null });

    const stripe = getStripe();
    const list = await stripe.paymentMethods.list({
      customer: rows[0].stripe_customer_id, type: 'card', limit: 10,
    });
    res.json({
      default: rows[0].default_payment_method,
      methods: list.data.map(pm => ({
        id:        pm.id,
        brand:     pm.card?.brand,
        last4:     pm.card?.last4,
        exp_month: pm.card?.exp_month,
        exp_year:  pm.card?.exp_year,
      })),
    });
  } catch(e) {
    console.error('[STRIPE METHODS ERR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/payments/sms/payment-methods/:id ──────────────────────────────
router.delete('/sms/payment-methods/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      'SELECT stripe_customer_id, default_payment_method FROM users WHERE id=$1', [userId]
    );
    if (!rows.length || !rows[0].stripe_customer_id)
      return res.status(404).json({ error: 'Aucune carte enregistrée' });

    const stripe = getStripe();
    const pm = await stripe.paymentMethods.retrieve(req.params.id);
    if (pm.customer !== rows[0].stripe_customer_id)
      return res.status(403).json({ error: 'Non autorisé' });

    await stripe.paymentMethods.detach(req.params.id);
    if (rows[0].default_payment_method === req.params.id) {
      await pool.query('UPDATE users SET default_payment_method=NULL WHERE id=$1', [userId]);
    }
    res.json({ ok: true });
  } catch(e) {
    console.error('[STRIPE DETACH ERR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/payments/sms/set-default — défini la carte par défaut ───────────
router.post('/sms/set-default', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { payment_method_id } = req.body;
    const { rows } = await pool.query('SELECT stripe_customer_id FROM users WHERE id=$1', [userId]);
    if (!rows.length || !rows[0].stripe_customer_id)
      return res.status(400).json({ error: 'Aucun customer Stripe' });
    const stripe = getStripe();
    const pm = await stripe.paymentMethods.retrieve(payment_method_id);
    if (pm.customer !== rows[0].stripe_customer_id)
      return res.status(403).json({ error: 'Non autorisé' });
    await pool.query('UPDATE users SET default_payment_method=$1 WHERE id=$2', [payment_method_id, userId]);
    res.json({ ok: true });
  } catch(e) {
    console.error('[STRIPE DEFAULT ERR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/payments/sms/verify-intent — crédite après confirmation ─────────
router.post('/sms/verify-intent', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { intent_id } = req.body;
    if (!intent_id) return res.status(400).json({ error: 'intent_id requis' });

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(intent_id);
    if (intent.metadata?.user_id !== userId)
      return res.status(403).json({ error: 'Non autorisé' });
    if (intent.status !== 'succeeded')
      return res.json({ credited: false, status: intent.status });

    const { rows: existing } = await pool.query(
      "SELECT * FROM sms_transactions WHERE sumup_checkout_id=$1", [intent.id]
    );
    if (existing.length && existing[0].status === 'completed') {
      const { rows: [u] } = await pool.query('SELECT sms_balance FROM users WHERE id=$1', [userId]);
      return res.json({
        credited: false, already_credited: true,
        new_balance: parseFloat(u.sms_balance).toFixed(2),
        new_sms_estimated: Math.floor(parseFloat(u.sms_balance) / SMS_PRICE),
      });
    }

    const amount   = parseFloat(intent.metadata?.amount || 0);
    const smsCount = parseInt(intent.metadata?.sms_count || 0);
    await pool.query('UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2', [amount, userId]);
    await pool.query(
      "UPDATE sms_transactions SET status='completed' WHERE sumup_checkout_id=$1", [intent.id]
    );
    const { rows: [u] } = await pool.query('SELECT sms_balance FROM users WHERE id=$1', [userId]);
    res.json({
      credited: true, amount, sms_count: smsCount,
      new_balance: parseFloat(u.sms_balance).toFixed(2),
      new_sms_estimated: Math.floor(parseFloat(u.sms_balance) / SMS_PRICE),
    });
  } catch(e) {
    console.error('[STRIPE VERIFY INTENT ERR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/payments/sms/checkout
router.post('/sms/checkout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const amount = parseFloat(req.body.amount);
    if (!amount || amount < 5) {
      return res.status(400).json({ error: 'Montant minimum : 5EUR' });
    }
    const stripe = getStripe();
    const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://haircoifflille.fr')
      .match(/https?:\/\/[^\s,]+/)?.[0]?.replace(/\/$/, '') || 'https://haircoifflille.fr';
    const estimatedSms = Math.floor(amount / SMS_PRICE);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Recharge SMS FlowIA',
            description: `environ ${estimatedSms} SMS`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      metadata: {
        user_id: userId,
        amount: amount.toString(),
        sms_count: estimatedSms.toString(),
      },
      success_url: `${FRONTEND_URL}/settings/marketing/solde?recharge=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${FRONTEND_URL}/settings/marketing/solde?recharge=cancelled`,
    });

    // Enregistrer EN ATTENTE — ne pas crediter ici
    await pool.query(`
      INSERT INTO sms_transactions
        (user_id, type, amount, sms_count, description, sumup_checkout_id, status)
      VALUES ($1,'credit',$2,$3,$4,$5,'pending')
    `, [userId, amount, estimatedSms, `Recharge ${amount}EUR`, session.id]);

    console.log('[STRIPE] Session creee:', session.id, '| Montant:', amount, '| User:', userId);
    res.json({ checkout_url: session.url, session_id: session.id, estimated_sms: estimatedSms });

  } catch(e) {
    console.error('[STRIPE CHECKOUT ERROR]', e.message);
    res.status(500).json({ error: 'Erreur paiement: ' + e.message });
  }
});

// POST /api/payments/sms/webhook — Stripe envoie l'evenement ici
router.post('/sms/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    res.json({ received: true }); // repondre immediatement

    try {
      let event;
      const sig = req.headers['stripe-signature'];
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      const stripe = getStripe();

      if (secret && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig, secret);
      } else {
        event = JSON.parse(req.body.toString());
        console.warn('[STRIPE WEBHOOK] Pas de secret — signature non verifiee');
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.payment_status !== 'paid') return;

        const userId   = session.metadata?.user_id;
        const amount   = parseFloat(session.metadata?.amount || 0);
        const smsCount = parseInt(session.metadata?.sms_count || 0);

        // Protection doublon
        const { rows: existing } = await pool.query(
          "SELECT id FROM sms_transactions WHERE sumup_checkout_id=$1 AND status='completed'",
          [session.id]
        );
        if (existing.length > 0) return;

        await pool.query(
          'UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2',
          [amount, userId]
        );
        await pool.query(
          "UPDATE sms_transactions SET status='completed' WHERE sumup_checkout_id=$1",
          [session.id]
        );
        console.log('[STRIPE WEBHOOK] Credite:', amount, 'EUR ->', userId, '|', smsCount, 'SMS');
      }

      if (event.type === 'payment_intent.succeeded') {
        const intent   = event.data.object;
        const userId   = intent.metadata?.user_id;
        const amount   = parseFloat(intent.metadata?.amount || 0);
        const smsCount = parseInt(intent.metadata?.sms_count || 0);
        if (!userId || !amount) return;

        const { rows: existing } = await pool.query(
          "SELECT id, status FROM sms_transactions WHERE sumup_checkout_id=$1",
          [intent.id]
        );
        if (existing.length && existing[0].status === 'completed') return;

        await pool.query('UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2',
          [amount, userId]);
        if (existing.length) {
          await pool.query("UPDATE sms_transactions SET status='completed' WHERE sumup_checkout_id=$1",
            [intent.id]);
        } else {
          await pool.query(
            `INSERT INTO sms_transactions (user_id, type, amount, sms_count, description, sumup_checkout_id, status)
             VALUES ($1,'credit',$2,$3,$4,$5,'completed')`,
            [userId, amount, smsCount, `Recharge ${amount} EUR`, intent.id]
          );
        }
        console.log('[STRIPE WEBHOOK intent.succeeded] Credite:', amount, 'EUR ->', userId);
      }
    } catch(e) {
      console.error('[STRIPE WEBHOOK ERROR]', e.message);
    }
  }
);

// GET /api/payments/sms/verify/:sessionId
router.get('/sms/verify/:sessionId', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log('[STRIPE VERIFY]', sessionId, '| Status:', session.payment_status);

    if (session.payment_status !== 'paid') {
      return res.json({
        credited: false,
        status: session.payment_status,
        message: 'Paiement non confirme'
      });
    }

    if (session.metadata?.user_id !== userId) {
      return res.status(403).json({ error: 'Non autorise' });
    }

    const { rows: txRows } = await pool.query(
      'SELECT * FROM sms_transactions WHERE sumup_checkout_id=$1 AND user_id=$2',
      [sessionId, userId]
    );
    if (!txRows.length) return res.status(404).json({ error: 'Transaction introuvable' });

    const tx = txRows[0];
    if (tx.status === 'completed') {
      const { rows: [u] } = await pool.query('SELECT sms_balance FROM users WHERE id=$1', [userId]);
      return res.json({
        credited: false, already_credited: true,
        new_balance: parseFloat(u.sms_balance).toFixed(2)
      });
    }

    // Crediter
    await pool.query('UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2', [tx.amount, userId]);
    await pool.query("UPDATE sms_transactions SET status='completed' WHERE id=$1", [tx.id]);

    const { rows: [u] } = await pool.query('SELECT sms_balance FROM users WHERE id=$1', [userId]);
    console.log('[STRIPE VERIFY] Credite:', tx.amount, 'EUR ->', userId);

    res.json({
      credited: true,
      amount: tx.amount,
      sms_count: tx.sms_count,
      new_balance: parseFloat(u.sms_balance).toFixed(2),
      new_sms_estimated: Math.floor(parseFloat(u.sms_balance) / SMS_PRICE),
    });
  } catch(e) {
    console.error('[STRIPE VERIFY ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/payments/sms/balance
router.get('/sms/balance', authMiddleware, async (req, res) => {
  try {
    const { rows: [u] } = await pool.query(
      'SELECT sms_balance FROM users WHERE id=$1', [req.user.userId]
    );
    const balance = parseFloat(u?.sms_balance || 0);
    res.json({
      balance: balance.toFixed(2),
      estimated_sms: Math.floor(balance / SMS_PRICE),
      price_per_sms: SMS_PRICE,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/payments/sms/transactions
router.get('/sms/transactions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM sms_transactions
      WHERE user_id=$1 AND status NOT IN ('pending','expired')
      ORDER BY created_at DESC LIMIT 10
    `, [req.user.userId]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
