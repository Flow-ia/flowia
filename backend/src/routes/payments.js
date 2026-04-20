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

// ── Helper : crédite le solde UNE SEULE FOIS pour un checkoutId donné ────────
// Protège contre le double-crédit (race webhook + verify-intent + verify-session)
// via UPDATE ... RETURNING atomique + UNIQUE index sur sumup_checkout_id.
// Renvoie { credited: true } si le crédit a été appliqué par cet appel,
// { credited: false, already: true } si un autre process l'a déjà fait.
async function creditSmsOnce({ userId, amount, smsCount, description, checkoutId }) {
  if (!userId || !amount || !checkoutId) {
    throw new Error('creditSmsOnce: userId/amount/checkoutId requis');
  }
  // Étape 1 : "claim" la ligne pending de façon atomique. Un seul appelant
  // peut passer 'pending' → 'completed' grâce au WHERE.
  const claimed = await pool.query(
    `UPDATE sms_transactions SET status='completed'
      WHERE sumup_checkout_id=$1 AND status='pending'
      RETURNING id`,
    [checkoutId]
  );
  if (claimed.rows.length === 0) {
    // Pas de pending : soit déjà completed, soit aucune ligne (webhook
    // arrivé avant l'INSERT pending). On vérifie.
    const { rows: ex } = await pool.query(
      `SELECT status FROM sms_transactions WHERE sumup_checkout_id=$1`,
      [checkoutId]
    );
    if (ex.length && ex[0].status === 'completed') {
      return { credited: false, already: true };
    }
    // Cas rare : INSERT direct en 'completed'. La contrainte UNIQUE
    // (uq_sms_tx_checkout) garantit qu'un seul INSERT réussit.
    try {
      await pool.query(
        `INSERT INTO sms_transactions
           (user_id, type, amount, sms_count, description, sumup_checkout_id, status)
         VALUES ($1,'credit',$2,$3,$4,$5,'completed')`,
        [userId, amount, smsCount || 0, description || `Recharge ${amount} EUR`, checkoutId]
      );
    } catch (e) {
      if (e.code === '23505') return { credited: false, already: true };
      throw e;
    }
  }
  // Crédit du solde uniquement si on a remporté le "claim"
  await pool.query(
    'UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2',
    [amount, userId]
  );
  return { credited: true };
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

    const amount   = parseFloat(intent.metadata?.amount || 0);
    const smsCount = parseInt(intent.metadata?.sms_count || 0);
    const result = await creditSmsOnce({
      userId, amount, smsCount,
      description: `Recharge ${amount} EUR`,
      checkoutId: intent.id,
    });
    const { rows: [u] } = await pool.query('SELECT sms_balance FROM users WHERE id=$1', [userId]);
    res.json({
      credited: result.credited,
      already_credited: !!result.already,
      amount: result.credited ? amount : undefined,
      sms_count: result.credited ? smsCount : undefined,
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

    // Enregistrer EN ATTENTE — ne pas crediter ici. ON CONFLICT protège
    // contre un double INSERT (impossible avec une session fresh, mais safe).
    await pool.query(`
      INSERT INTO sms_transactions
        (user_id, type, amount, sms_count, description, sumup_checkout_id, status)
      VALUES ($1,'credit',$2,$3,$4,$5,'pending')
      ON CONFLICT (sumup_checkout_id) DO NOTHING
    `, [userId, amount, estimatedSms, `Recharge ${amount}EUR`, session.id]);

    console.log('[STRIPE] Session creee:', session.id, '| Montant:', amount, '| User:', userId);
    res.json({ checkout_url: session.url, session_id: session.id, estimated_sms: estimatedSms });

  } catch(e) {
    console.error('[STRIPE CHECKOUT ERROR]', e.message);
    res.status(500).json({ error: 'Erreur paiement: ' + e.message });
  }
});

// POST /api/payments/sms/webhook — Stripe envoie l'evenement ici
// SÉCURITÉ : signature OBLIGATOIRE. Sans STRIPE_WEBHOOK_SECRET ou sans header
// 'stripe-signature' valide, l'endpoint rejette 400. Évite qu'un attaquant
// forge un event payment_intent.succeeded et crédite n'importe quel compte.
// On répond APRÈS la vérification signature pour que Stripe retry en cas
// d'échec (ne pas renvoyer 200 à un payload invalide).
router.post('/sms/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !sig) {
      console.error('[STRIPE WEBHOOK] Rejete : secret ou signature manquant');
      return res.status(400).json({ error: 'webhook signature required' });
    }
    let event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (e) {
      console.error('[STRIPE WEBHOOK] Signature invalide:', e.message);
      return res.status(400).json({ error: 'invalid signature' });
    }
    // Signature OK → on peut acquitter Stripe avant le traitement DB
    res.json({ received: true });

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.payment_status !== 'paid') return;
        const userId   = session.metadata?.user_id;
        const amount   = parseFloat(session.metadata?.amount || 0);
        const smsCount = parseInt(session.metadata?.sms_count || 0);
        if (!userId || !amount) return;
        const r = await creditSmsOnce({
          userId, amount, smsCount,
          description: `Recharge ${amount} EUR`,
          checkoutId: session.id,
        });
        if (r.credited) console.log('[STRIPE WEBHOOK session] Credite:', amount, 'EUR ->', userId);
      }

      if (event.type === 'payment_intent.succeeded') {
        const intent   = event.data.object;
        const userId   = intent.metadata?.user_id;
        const amount   = parseFloat(intent.metadata?.amount || 0);
        const smsCount = parseInt(intent.metadata?.sms_count || 0);
        if (!userId || !amount) return;
        const r = await creditSmsOnce({
          userId, amount, smsCount,
          description: `Recharge ${amount} EUR`,
          checkoutId: intent.id,
        });
        if (r.credited) console.log('[STRIPE WEBHOOK intent] Credite:', amount, 'EUR ->', userId);
      }
    } catch(e) {
      console.error('[STRIPE WEBHOOK handler error]', e.message);
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
    const amount = parseFloat(session.metadata?.amount || tx.amount || 0);
    const smsCount = parseInt(session.metadata?.sms_count || tx.sms_count || 0);
    const r = await creditSmsOnce({
      userId, amount, smsCount,
      description: tx.description || `Recharge ${amount} EUR`,
      checkoutId: sessionId,
    });

    const { rows: [u] } = await pool.query('SELECT sms_balance FROM users WHERE id=$1', [userId]);
    if (r.credited) console.log('[STRIPE VERIFY] Credite:', amount, 'EUR ->', userId);
    res.json({
      credited: r.credited,
      already_credited: !!r.already,
      amount: r.credited ? amount : undefined,
      sms_count: r.credited ? smsCount : undefined,
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
