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
      success_url: `${FRONTEND_URL}/settings/marketing?recharge=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${FRONTEND_URL}/settings/marketing?recharge=cancelled`,
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
