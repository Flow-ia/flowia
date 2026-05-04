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
        subscription_status               AS status,
        subscription_plan                 AS plan,
        subscription_period               AS period,
        subscription_current_period_end   AS current_period_end,
        subscription_trial_ends_at        AS trial_ends_at,
        subscription_cancel_at_period_end AS cancel_at_period_end,
        stripe_subscription_id
      FROM users
      WHERE id=$1
    `, [userId]);

    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });

    const sub = rows[0];
    res.json({
      status:               sub.status,
      plan:                 sub.plan,
      period:               sub.period,
      current_period_end:   sub.current_period_end,
      trial_ends_at:        sub.trial_ends_at,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      // Helpers calculés côté backend pour simplifier le front.
      is_active:            ['active', 'trialing'].includes(sub.status),
      is_past_due:          sub.status === 'past_due',
      has_subscription:     !!sub.stripe_subscription_id,
    });
  } catch (e) {
    console.error('[SUB ME ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/subscriptions/cancel ───────────────────────────────────────────
// Annule l'abonnement EN FIN DE PÉRIODE. L'utilisateur garde l'accès jusqu'à
// current_period_end, puis status passe à 'canceled' via webhook automatique.
// Aucun remboursement (pratique standard SaaS — Notion, Slack, Linear).
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      `SELECT stripe_subscription_id, subscription_status
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });
    const subId  = rows[0].stripe_subscription_id;
    const status = rows[0].subscription_status;
    if (!subId) return res.status(400).json({ error: 'Aucun abonnement actif' });
    if (!['active', 'trialing', 'past_due'].includes(status)) {
      return res.status(400).json({ error: 'Abonnement non actif' });
    }

    const stripe = getStripe();
    const updated = await stripe.subscriptions.update(subId, {
      cancel_at_period_end: true,
    });

    // Update DB direct pour réponse immédiate (webhook confirmera).
    await pool.query(
      `UPDATE users SET subscription_cancel_at_period_end = TRUE WHERE id = $1`,
      [userId]
    );

    res.json({
      ok: true,
      cancel_at_period_end: true,
      cancels_on: updated.current_period_end
        ? new Date(updated.current_period_end * 1000).toISOString() : null,
    });
  } catch (e) {
    console.error('[SUB CANCEL ERR]', e.message);
    res.status(500).json({ error: "Erreur lors de l'annulation" });
  }
});

// ── POST /api/subscriptions/reactivate ───────────────────────────────────────
// Annule l'annulation programmée. Possible uniquement si l'abonnement est
// encore en cours (current_period_end pas atteint).
router.post('/reactivate', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      `SELECT stripe_subscription_id, subscription_status,
              subscription_cancel_at_period_end
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });
    const subId = rows[0].stripe_subscription_id;
    if (!subId) return res.status(400).json({ error: 'Aucun abonnement' });
    if (!rows[0].subscription_cancel_at_period_end) {
      return res.status(400).json({ error: 'Abonnement non annulé' });
    }
    if (!['active', 'trialing', 'past_due'].includes(rows[0].subscription_status)) {
      return res.status(400).json({ error: 'Abonnement non actif' });
    }

    const stripe = getStripe();
    await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
    await pool.query(
      `UPDATE users SET subscription_cancel_at_period_end = FALSE WHERE id = $1`,
      [userId]
    );

    res.json({ ok: true, cancel_at_period_end: false });
  } catch (e) {
    console.error('[SUB REACTIVATE ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors de la réactivation' });
  }
});

// ── POST /api/subscriptions/change-plan ──────────────────────────────────────
// Body : { plan: 'essentiel'|'equipe', period: 'monthly'|'yearly' }
// Change le plan/période avec proration immédiate :
// - Upgrade   → différence facturée maintenant
// - Downgrade → crédit appliqué sur la prochaine facture
// Le webhook customer.subscription.updated met à jour la DB.
router.post('/change-plan', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { plan, period } = req.body || {};

    if (!['essentiel', 'equipe'].includes(plan)) {
      return res.status(400).json({ error: 'Plan invalide' });
    }
    if (!['monthly', 'yearly'].includes(period)) {
      return res.status(400).json({ error: 'Période invalide' });
    }

    const newPriceId = getPriceId(plan, period);
    if (!newPriceId) {
      return res.status(500).json({ error: 'Configuration Stripe incomplète' });
    }

    const { rows } = await pool.query(
      `SELECT stripe_subscription_id, subscription_status,
              subscription_plan, subscription_period
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });
    const sub = rows[0];
    if (!sub.stripe_subscription_id) {
      return res.status(400).json({ error: 'Aucun abonnement actif' });
    }
    if (sub.subscription_plan === plan && sub.subscription_period === period) {
      return res.status(400).json({ error: 'Vous êtes déjà sur ce plan' });
    }
    if (!['active', 'trialing', 'past_due'].includes(sub.subscription_status)) {
      return res.status(400).json({ error: 'Abonnement non actif' });
    }

    const stripe = getStripe();
    // Fetch sub courante pour avoir l'item ID à modifier.
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const itemId = stripeSub.items?.data?.[0]?.id;
    if (!itemId) {
      console.error('[SUB CHANGE-PLAN] item ID introuvable sur', sub.stripe_subscription_id);
      return res.status(500).json({ error: 'Item subscription introuvable' });
    }

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'create_prorations',
    });

    res.json({ ok: true, plan, period });
  } catch (e) {
    console.error('[SUB CHANGE-PLAN ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors du changement de plan' });
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
    // past_due, canceled, etc.), la période courante, et cancel_at_period_end.
    // Source de vérité.
    if (event.type === 'customer.subscription.created'
     || event.type === 'customer.subscription.updated'
     || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const customerId   = sub.customer;
      const priceId      = sub.items?.data?.[0]?.price?.id;
      const { plan, period } = planPeriodFromPriceId(priceId);
      const periodEnd    = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
      const trialEnd     = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
      const status       = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;
      // cancel_at_period_end : flag Stripe natif. À reset quand la sub est
      // 'deleted' (déjà annulée définitivement, plus de pending cancel).
      const cancelAtEnd  = event.type === 'customer.subscription.deleted'
                            ? false : !!sub.cancel_at_period_end;

      // Update par stripe_customer_id (toujours présent et stable).
      // Si plan/period non identifiables (price_id inconnu = config env manquante),
      // on les laisse intacts pour éviter NULL accidentel.
      // Construction dynamique des SET selon disponibilité plan/period.
      const setParts = [
        'subscription_status = $1',
        'subscription_current_period_end = $2',
        'subscription_trial_ends_at = $3',
        'stripe_subscription_id = $4',
        'subscription_cancel_at_period_end = $5',
      ];
      const params = [status, periodEnd, trialEnd, sub.id, cancelAtEnd];
      if (plan && period) {
        setParts.push('subscription_plan = $6');
        setParts.push('subscription_period = $7');
        params.push(plan, period);
      }
      params.push(customerId);
      const customerIdIndex = params.length;
      await pool.query(
        `UPDATE users SET ${setParts.join(', ')}
         WHERE stripe_customer_id = $${customerIdIndex}`,
        params
      );
      console.log('[SUB WEBHOOK]', event.type, customerId, status,
        plan || '?', cancelAtEnd ? '(cancel_at_end)' : '');
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

// ── GET /api/subscriptions/billing-info ────────────────────────────────────
// Renvoie les infos de facturation Stripe (nom, email, adresse, TVA).
// Permet l'édition inline sans passer par le portail Stripe.
router.get('/billing-info', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id=$1', [userId]
    );
    if (!rows.length || !rows[0].stripe_customer_id) {
      return res.json({ billing: null });
    }
    const stripe = getStripe();
    const customer = await stripe.customers.retrieve(rows[0].stripe_customer_id);
    if (customer.deleted) return res.json({ billing: null });

    res.json({
      billing: {
        name:    customer.name || '',
        email:   customer.email || '',
        phone:   customer.phone || '',
        address: customer.address || {
          line1: '', line2: '', city: '', postal_code: '', state: '', country: 'FR',
        },
      },
    });
  } catch (e) {
    console.error('[SUB BILLING GET ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors du chargement des informations' });
  }
});

// ── PUT /api/subscriptions/billing-info ────────────────────────────────────
// Met à jour les infos de facturation côté Stripe (customer.update).
// Body : { name, email, phone, address: { line1, line2, city, postal_code,
//                                          state, country } }
router.put('/billing-info', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, email, phone, address } = req.body || {};

    // Validations légères. Stripe renverra ses propres erreurs sur format.
    if (email && typeof email !== 'string') {
      return res.status(400).json({ error: 'Email invalide' });
    }
    if (name && name.length > 200) {
      return res.status(400).json({ error: 'Nom trop long' });
    }

    const customerId = await ensureStripeCustomer(userId);
    const stripe     = getStripe();
    const update     = {};
    if (typeof name  === 'string') update.name  = name.trim();
    if (typeof email === 'string') update.email = email.trim();
    if (typeof phone === 'string') update.phone = phone.trim();
    if (address && typeof address === 'object') {
      update.address = {
        line1:       address.line1 || null,
        line2:       address.line2 || null,
        city:        address.city  || null,
        postal_code: address.postal_code || null,
        state:       address.state || null,
        country:     address.country || 'FR',
      };
    }

    await stripe.customers.update(customerId, update);
    res.json({ ok: true });
  } catch (e) {
    console.error('[SUB BILLING PUT ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// ── GET /api/subscriptions/invoices ─────────────────────────────────────────
// Liste les 12 dernières factures du customer. Inclut un PDF téléchargeable
// et l'URL de la page Stripe hébergée pour consultation.
router.get('/invoices', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id=$1', [userId]
    );
    if (!rows.length || !rows[0].stripe_customer_id) {
      return res.json({ invoices: [] });
    }
    const stripe = getStripe();
    const list = await stripe.invoices.list({
      customer: rows[0].stripe_customer_id,
      limit: 12,
    });
    res.json({
      invoices: list.data.map(inv => ({
        id:          inv.id,
        number:      inv.number,
        status:      inv.status,             // paid, open, void, draft, uncollectible
        amount:      (inv.amount_paid || inv.amount_due || 0) / 100,
        currency:    inv.currency,
        created:     inv.created ? new Date(inv.created * 1000).toISOString() : null,
        pdf:         inv.invoice_pdf,        // URL du PDF (auth via signed URL Stripe)
        hosted_url:  inv.hosted_invoice_url, // page Stripe consultation
        period_start: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
        period_end:   inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
      })),
    });
  } catch (e) {
    console.error('[SUB INVOICES ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors du chargement des factures' });
  }
});

// ─── GESTION DES MOYENS DE PAIEMENT ─────────────────────────────────────────
// Endpoints dédiés au namespace abonnement. Particularité vs /payments/sms/* :
// le set-default met aussi à jour customer.invoice_settings.default_payment_method
// + subscription.default_payment_method côté Stripe pour que la facturation
// récurrente automatique utilise la bonne carte.

// ── GET /api/subscriptions/payment-methods ─────────────────────────────────
// Liste les cartes du customer + flag isDefault selon Stripe.
router.get('/payment-methods', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id=$1', [userId]
    );
    if (!rows.length || !rows[0].stripe_customer_id) {
      return res.json({ methods: [], default: null });
    }

    const stripe = getStripe();
    const customerId = rows[0].stripe_customer_id;
    // Fetch customer pour avoir invoice_settings.default_payment_method (Stripe).
    const [customer, list] = await Promise.all([
      stripe.customers.retrieve(customerId),
      stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 10 }),
    ]);
    const defaultPmId = customer?.invoice_settings?.default_payment_method || null;

    res.json({
      default: defaultPmId,
      methods: list.data.map(pm => ({
        id:        pm.id,
        brand:     pm.card?.brand,
        last4:     pm.card?.last4,
        exp_month: pm.card?.exp_month,
        exp_year:  pm.card?.exp_year,
        isDefault: pm.id === defaultPmId,
      })),
    });
  } catch (e) {
    console.error('[SUB PM LIST ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors du chargement des cartes' });
  }
});

// ── POST /api/subscriptions/payment-methods/setup-intent ───────────────────
// Crée un SetupIntent pour ajouter une nouvelle carte SANS la débiter.
// Le client_secret est consommé par stripe.confirmCardSetup() côté frontend.
// usage: 'off_session' = la carte servira plus tard pour des prélèvements
// automatiques (renouvellement abonnement) sans présence du marchand.
router.post('/payment-methods/setup-intent', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const customerId = await ensureStripeCustomer(userId);
    const stripe = getStripe();
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    });
    res.json({ client_secret: setupIntent.client_secret });
  } catch (e) {
    console.error('[SUB PM SI ERR]', e.message);
    res.status(500).json({ error: 'Erreur création SetupIntent' });
  }
});

// ── POST /api/subscriptions/payment-methods/:id/default ────────────────────
// Définit la carte par défaut côté Stripe (customer.invoice_settings) ET
// côté abonnement actif si présent. Met aussi à jour la colonne DB legacy
// default_payment_method (utilisée par SMS off_session).
router.post('/payment-methods/:id/default', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const pmId   = req.params.id;
    const { rows } = await pool.query(
      'SELECT stripe_customer_id, stripe_subscription_id FROM users WHERE id=$1',
      [userId]
    );
    if (!rows.length || !rows[0].stripe_customer_id) {
      return res.status(400).json({ error: 'Aucun customer Stripe' });
    }
    const customerId = rows[0].stripe_customer_id;
    const subId      = rows[0].stripe_subscription_id;

    const stripe = getStripe();
    // Vérif ownership : la PM doit appartenir à ce customer.
    const pm = await stripe.paymentMethods.retrieve(pmId);
    if (pm.customer !== customerId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // 1) Met à jour la default PM du customer (utilisée pour les invoices futures).
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pmId },
    });
    // 2) Si abonnement actif, force aussi sa default PM (sinon Stripe peut
    //    encore tenter avec l'ancienne au prochain renouvellement).
    if (subId) {
      try {
        await stripe.subscriptions.update(subId, { default_payment_method: pmId });
      } catch (e) {
        // L'abonnement peut être canceled/incomplete_expired — non bloquant.
        console.warn('[SUB PM DEFAULT] sub update fail (non bloquant):', e.message);
      }
    }
    // 3) DB legacy column (utilisée par SMS off_session aussi).
    await pool.query(
      'UPDATE users SET default_payment_method=$1 WHERE id=$2',
      [pmId, userId]
    );

    res.json({ ok: true, defaultPaymentMethod: pmId });
  } catch (e) {
    console.error('[SUB PM DEFAULT ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// ── DELETE /api/subscriptions/payment-methods/:id ──────────────────────────
// Détache la carte du customer. SÉCURITÉ : refuse si c'est la dernière
// carte ET qu'un abonnement est actif (sinon prochain renouvellement
// échouera et le marchand basculera en past_due).
router.delete('/payment-methods/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const pmId   = req.params.id;
    const { rows } = await pool.query(
      `SELECT stripe_customer_id, default_payment_method, subscription_status
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length || !rows[0].stripe_customer_id) {
      return res.status(404).json({ error: 'Aucune carte enregistrée' });
    }
    const customerId = rows[0].stripe_customer_id;

    const stripe = getStripe();
    const pm = await stripe.paymentMethods.retrieve(pmId);
    if (pm.customer !== customerId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Garde-fou : ne pas supprimer la dernière carte si abo actif.
    const isActiveSub = ['active', 'trialing', 'past_due'].includes(rows[0].subscription_status);
    if (isActiveSub) {
      const list = await stripe.paymentMethods.list({
        customer: customerId, type: 'card', limit: 5,
      });
      if (list.data.length <= 1) {
        return res.status(400).json({
          error: "Impossible de supprimer votre dernière carte tant qu'un abonnement est actif. Ajoutez une autre carte d'abord ou annulez votre abonnement."
        });
      }
    }

    await stripe.paymentMethods.detach(pmId);
    if (rows[0].default_payment_method === pmId) {
      await pool.query(
        'UPDATE users SET default_payment_method=NULL WHERE id=$1', [userId]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[SUB PM DELETE ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

module.exports = router;
