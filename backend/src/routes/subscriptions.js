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
// SÉCURITÉ : verify que le customer existe DANS LE MODE STRIPE COURANT.
// Cas réel : un user créé en mode Test (SMS recharge) puis on bascule
// STRIPE_SECRET_KEY en Live → l'ID stocké en DB n'existe pas en Live → 500.
// Solution : retrieve, et si 'No such customer' on recrée un Customer
// dans le mode courant et on UPDATE l'ID en DB.
async function ensureStripeCustomer(userId) {
  const { rows } = await pool.query(
    'SELECT stripe_customer_id, email, business_name FROM users WHERE id=$1',
    [userId]
  );
  if (!rows.length) throw new Error('User introuvable');
  const stripe = getStripe();
  const existingId = rows[0].stripe_customer_id;

  if (existingId) {
    try {
      const cust = await stripe.customers.retrieve(existingId);
      if (cust && !cust.deleted) return existingId;
      // Customer 'deleted' Stripe (rare) → on recréée comme s'il n'existait pas.
    } catch (e) {
      // 'No such customer' = mode Stripe différent OU customer purgé.
      // Tout autre code Stripe = on remonte (network, auth, etc.).
      const isNoSuch = e.code === 'resource_missing'
                    || (e.message && e.message.includes('No such customer'));
      if (!isNoSuch) throw e;
      console.warn('[SUB ensureCustomer] customer', existingId,
        'introuvable dans le mode courant, recréation');
    }
  }

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
      // payment_method_collection: 'if_required' → CB NON demandée pendant
      // le trial (rien à payer immédiatement). Aligne avec le claim site
      // marketing 'sans carte bancaire'. Stripe demandera la CB avant fin
      // d'essai via email 'trial_will_end' (J-3) puis l'email automatique
      // 'invoice.payment_failed' si le client n'a pas ajouté de CB.
      ...(plan === 'essentiel' && {
        subscription_data: { trial_period_days: 14 },
        payment_method_collection: 'if_required',
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

// ── Helper : reverse mapping price_id → plan/period ─────────────────────────
// Permet d'extraire plan/period depuis un objet subscription Stripe sans devoir
// stocker le mapping en DB.
function planPeriodFromPriceId(priceId) {
  if (!priceId) return { plan: null, period: null };
  if (priceId === process.env.STRIPE_PRICE_ESSENTIEL_MONTHLY) return { plan: 'essentiel', period: 'monthly' };
  if (priceId === process.env.STRIPE_PRICE_ESSENTIEL_YEARLY)  return { plan: 'essentiel', period: 'yearly'  };
  if (priceId === process.env.STRIPE_PRICE_EQUIPE_MONTHLY)    return { plan: 'equipe',    period: 'monthly' };
  if (priceId === process.env.STRIPE_PRICE_EQUIPE_YEARLY)     return { plan: 'equipe',    period: 'yearly'  };
  return { plan: null, period: null };
}

// ── Helper : vérification signature webhook (dual-mode Test + Live) ─────────
// L'endpoint reçoit des events des 2 modes (Test pendant dev, Live en prod).
// On essaie chaque secret ; le bon vérifie, l'autre échoue silencieusement.
function verifyWebhookEvent(rawBody, signature) {
  const secrets = [
    process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET_TEST,
    process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET_LIVE,
  ].filter(Boolean);
  if (!secrets.length) {
    throw new Error('Aucun STRIPE_SUBSCRIPTION_WEBHOOK_SECRET_* configuré');
  }
  const stripe = getStripe();
  let lastErr;
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// ── POST /api/subscriptions/webhook ─────────────────────────────────────────
// Endpoint séparé du webhook SMS existant (/api/payments/sms/webhook).
// Reçoit les events checkout.session.completed, customer.subscription.*,
// invoice.paid, invoice.payment_failed (configurés côté Stripe Dashboard).
// SÉCURITÉ : signature obligatoire, dual-mode Test+Live.
//
// Idempotence : les UPDATE sont par stripe_subscription_id ou
// stripe_customer_id (uniques). Stripe peut retry — c'est safe.
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('[SUB WEBHOOK] Pas de signature');
    return res.status(400).json({ error: 'no signature' });
  }
  let event;
  try {
    event = verifyWebhookEvent(req.body, sig);
  } catch (e) {
    console.error('[SUB WEBHOOK] Signature invalide:', e.message);
    return res.status(400).json({ error: 'invalid signature' });
  }

  // Acquitter Stripe avant le traitement DB pour éviter retry inutile.
  res.json({ received: true });

  try {
    // ── checkout.session.completed : souscription initiale finalisée ─────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.mode !== 'subscription') return;
      const userId = session.metadata?.user_id;
      const plan   = session.metadata?.plan;
      const period = session.metadata?.period;
      const subId  = session.subscription;
      if (!userId || !subId) {
        console.warn('[SUB WEBHOOK] checkout.session.completed sans user_id/sub_id');
        return;
      }
      await pool.query(`
        UPDATE users
        SET stripe_subscription_id = $1,
            subscription_plan      = $2,
            subscription_period    = $3
        WHERE id = $4
      `, [subId, plan, period, userId]);
      console.log('[SUB WEBHOOK] checkout completed:', userId, plan, period);
    }

    // ── customer.subscription.created/updated/deleted ─────────────────────
    // L'event subscription.* contient le statut autoritatif (active, trialing,
    // past_due, canceled, etc.) et la période courante. Source de vérité.
    if (event.type === 'customer.subscription.created'
     || event.type === 'customer.subscription.updated'
     || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const customerId = sub.customer;
      const priceId    = sub.items?.data?.[0]?.price?.id;
      const { plan, period } = planPeriodFromPriceId(priceId);
      const periodEnd  = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
      const trialEnd   = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
      const status     = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;

      // Update par stripe_customer_id (toujours présent et stable).
      // Si plan/period non identifiables (price_id inconnu = config env manquante),
      // on les laisse intacts pour éviter NULL accidentel.
      const params = [status, periodEnd, trialEnd, sub.id, customerId];
      let extraSet = '';
      if (plan && period) {
        extraSet = `, subscription_plan = $6, subscription_period = $7`;
        params.splice(4, 0, plan, period); // insérer avant customerId
      }
      const customerIdIndex = params.length;
      await pool.query(`
        UPDATE users
        SET subscription_status = $1,
            subscription_current_period_end = $2,
            subscription_trial_ends_at = $3,
            stripe_subscription_id = $4
            ${extraSet}
        WHERE stripe_customer_id = $${customerIdIndex}
      `, params);
      console.log('[SUB WEBHOOK]', event.type, customerId, status, plan || '?');
    }

    // ── invoice.paid : renouvellement réussi (mensuel/annuel) ─────────────
    // subscription.updated arrivera derrière avec current_period_end actualisé.
    // Ce hook est défensif : remet status=active si on était past_due.
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      if (!invoice.subscription) return; // ignore invoices one-shot
      await pool.query(`
        UPDATE users
        SET subscription_status = 'active'
        WHERE stripe_customer_id = $1
          AND subscription_status IN ('past_due', 'unpaid', 'incomplete')
      `, [customerId]);
      console.log('[SUB WEBHOOK] invoice.paid:', customerId);
    }

    // ── invoice.payment_failed : carte refusée au renouvellement ──────────
    // Stripe va retry plusieurs fois ; subscription.updated changera status
    // en past_due puis canceled si tous échecs. Ici juste log + future point
    // d'extension pour notifier le marchand par email.
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      console.log('[SUB WEBHOOK] invoice.payment_failed:', invoice.customer,
        'attempt', invoice.attempt_count);
    }

    // ── customer.subscription.trial_will_end : J-3 fin d'essai ─────────────
    // Event envoyé par Stripe 3 jours avant la fin du trial Essentiel.
    // Idéal pour relance email "ajoutez votre CB" si user n'a pas de PM.
    // Stripe envoie aussi son email automatique de relance par défaut.
    if (event.type === 'customer.subscription.trial_will_end') {
      const sub = event.data.object;
      console.log('[SUB WEBHOOK] trial_will_end:', sub.customer,
        'trial_end:', sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null);
      // Future hook : envoyer email Brevo "votre essai termine bientôt".
    }
  } catch (e) {
    // Stripe est déjà acquitté ; pas de 500. Log pour investigation.
    console.error('[SUB WEBHOOK ERR]', event.type, e.message);
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
