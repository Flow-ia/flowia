// routes/subscriptions.js — Abonnement plateforme FlowIA (Stripe Billing)
//
// SÉPARÉ du flux Connect (qui gère les paiements clients->commerçants).
// Ici : le commerçant paie un abonnement à FlowIA pour utiliser le SaaS.
// Plans : Découverte (gratuit, sans Stripe) / Essentiel / Équipe.
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante sur Render');
  return require('stripe')(key);
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')[0].replace(/\/$/, '');
}

// Mapping plan+période → variable d'environnement contenant le price_id Stripe.
// Permet de changer les prix sans redéployer (Render → Environment).
function getPriceId(plan, period) {
  const map = {
    'essentiel:monthly': process.env.STRIPE_PRICE_ESSENTIEL_MONTHLY,
    'essentiel:yearly':  process.env.STRIPE_PRICE_ESSENTIEL_YEARLY,
    'equipe:monthly':    process.env.STRIPE_PRICE_EQUIPE_MONTHLY,
    'equipe:yearly':     process.env.STRIPE_PRICE_EQUIPE_YEARLY,
  };
  return map[`${plan}:${period}`];
}

// Garantit qu'un Customer Stripe existe (réutilise si déjà créé pour SMS).
async function ensureStripeCustomer(userId) {
  const { rows } = await pool.query(
    'SELECT stripe_customer_id, email, business_name FROM users WHERE id=$1',
    [userId]
  );
  if (!rows.length) throw new Error('User introuvable');
  if (rows[0].stripe_customer_id) return rows[0].stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: rows[0].email,
    name:  rows[0].business_name || undefined,
    metadata: { user_id: userId },
  });
  await pool.query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2',
    [customer.id, userId]);
  return customer.id;
}

// ── POST /api/subscriptions/checkout ─────────────────────────────────────────
// Crée une session Stripe Checkout pour souscrire à un plan.
// Body : { plan: 'essentiel'|'equipe', period: 'monthly'|'yearly' }
// Retour : { url } — URL Stripe vers laquelle rediriger le marchand
router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { plan, period } = req.body || {};

    if (!['essentiel', 'equipe'].includes(plan)) {
      return res.status(400).json({ error: 'Plan invalide' });
    }
    if (!['monthly', 'yearly'].includes(period)) {
      return res.status(400).json({ error: 'Période invalide' });
    }

    const priceId = getPriceId(plan, period);
    if (!priceId) {
      console.error('[SUB CHECKOUT] STRIPE_PRICE_* manquant pour', plan, period);
      return res.status(500).json({ error: 'Configuration Stripe incomplète' });
    }

    // Bloque si abonnement déjà actif → utiliser portail pour changer.
    const { rows } = await pool.query(
      'SELECT subscription_status FROM users WHERE id=$1', [userId]
    );
    const status = rows[0]?.subscription_status;
    if (status && ['active', 'trialing', 'past_due'].includes(status)) {
      return res.status(409).json({
        error: 'Abonnement déjà actif',
        action: 'use_portal',
      });
    }

    const customerId = await ensureStripeCustomer(userId);
    const stripe = getStripe();
    const frontUrl = getFrontendUrl();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // Essai gratuit 14 jours sur Essentiel uniquement (pas Équipe).
      ...(plan === 'essentiel' && {
        subscription_data: { trial_period_days: 14 },
      }),
      success_url: `${frontUrl}/abonnement?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${frontUrl}/abonnement?status=cancel`,
      metadata:    { user_id: userId, plan, period },
      // Permet d'utiliser des codes promo configurés côté Stripe Dashboard.
      allow_promotion_codes: true,
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('[SUB CHECKOUT ERR]', e.message);
    res.status(500).json({ error: 'Erreur création checkout' });
  }
});

// ── GET /api/subscriptions/me ────────────────────────────────────────────────
// Renvoie l'état d'abonnement du marchand connecté.
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(`
      SELECT
        subscription_status            AS status,
        subscription_plan              AS plan,
        subscription_period            AS period,
        subscription_current_period_end AS current_period_end,
        subscription_trial_ends_at     AS trial_ends_at,
        stripe_subscription_id
      FROM users
      WHERE id=$1
    `, [userId]);

    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });

    const sub = rows[0];
    res.json({
      status:             sub.status,
      plan:               sub.plan,
      period:             sub.period,
      current_period_end: sub.current_period_end,
      trial_ends_at:      sub.trial_ends_at,
      // Helpers calculés côté backend pour simplifier le front.
      is_active:          ['active', 'trialing'].includes(sub.status),
      is_past_due:        sub.status === 'past_due',
      has_subscription:   !!sub.stripe_subscription_id,
    });
  } catch (e) {
    console.error('[SUB ME ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/subscriptions/portal ───────────────────────────────────────────
// Crée une session Stripe Customer Portal — page hébergée Stripe où le
// marchand peut changer de plan, mettre à jour sa CB, voir ses factures, résilier.
// Prérequis : Customer Portal activé dans Stripe Dashboard (Settings → Billing → Customer Portal).
router.post('/portal', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id=$1', [userId]
    );
    if (!rows.length || !rows[0].stripe_customer_id) {
      return res.status(404).json({ error: 'Aucun client Stripe associé' });
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer:   rows[0].stripe_customer_id,
      return_url: `${getFrontendUrl()}/abonnement`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('[SUB PORTAL ERR]', e.message);
    if (e.message && e.message.includes('No configuration')) {
      return res.status(503).json({
        error: 'Customer Portal non configuré dans Stripe Dashboard',
      });
    }
    res.status(500).json({ error: 'Erreur ouverture portail' });
  }
});

module.exports = router;
