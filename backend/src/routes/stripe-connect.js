// routes/stripe-connect.js — Onboarding Stripe Connect pour les commercants.
//
// Pattern : Direct charges via Controller API (Stripe API 2024+, remplace
// l'ancien OAuth Standard). Le commercant a son propre compte Stripe avec
// dashboard.stripe.com complet, recoit l'argent direct sur son compte, paie
// les frais Stripe (controller.fees.payer='account'), Stripe absorbe les
// pertes (controller.losses.payments='stripe'). FlowIA prend une commission
// configurable via application_fee_amount sur chaque PaymentIntent.
//
// Voir memory/project_stripe_connect_config.md pour la decision validee.

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

// ── POST /api/stripe-connect/onboard ─────────────────────────────────────────
// Cree (ou recree) un compte Stripe Connect pour le marchand connecte et
// retourne l'URL d'onboarding Stripe-hosted. Le marchand est redirige sur
// Stripe pour saisir ses infos legales/bancaires, puis revient sur l'app.
router.post('/onboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const stripe = getStripe();

    const { rows } = await pool.query(
      `SELECT email, business_name, country, stripe_account_id
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });
    const u = rows[0];

    // 1) Creer le compte si inexistant. Sinon reutiliser pour relancer
    //    un onboarding (cas user qui n'a pas finalise).
    let accountId = u.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        controller: {
          stripe_dashboard:       { type: 'full' },
          fees:                   { payer: 'account' },
          losses:                 { payments: 'stripe' },
          requirement_collection: 'stripe',
        },
        country: (u.country || 'FR').toUpperCase().slice(0, 2),
        email:   u.email,
        business_profile: {
          name: u.business_name || undefined,
        },
        metadata: { user_id: userId },
      });
      accountId = account.id;
      await pool.query(
        `UPDATE users SET stripe_account_id=$1,
                          stripe_account_email=$2
         WHERE id=$3`,
        [accountId, u.email, userId]
      );
    }

    // 2) Generer un AccountLink pour la session d'onboarding hostee.
    const front = getFrontendUrl();
    const link = await stripe.accountLinks.create({
      account:     accountId,
      refresh_url: `${front}/reglages/paiements?stripe_connect=refresh`,
      return_url:  `${front}/reglages/paiements?stripe_connect=return`,
      type:        'account_onboarding',
    });

    res.json({ url: link.url, account_id: accountId });
  } catch (e) {
    console.error('[CONNECT ONBOARD ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors de la création du compte Stripe' });
  }
});

// ── GET /api/stripe-connect/account ─────────────────────────────────────────
// Retourne l'etat du compte Connect du marchand (depuis DB, avec backfill
// silencieux si on a pas encore reçu le webhook account.updated).
router.get('/account', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      `SELECT stripe_account_id, stripe_account_email,
              stripe_charges_enabled, stripe_payouts_enabled,
              stripe_account_connected_at, online_payments_enabled,
              commission_rate
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });
    const u = rows[0];

    if (!u.stripe_account_id) {
      return res.json({
        connected:           false,
        account_id:          null,
        charges_enabled:     false,
        payouts_enabled:     false,
        details_submitted:   false,
        online_payments_enabled: !!u.online_payments_enabled,
        commission_rate:     parseFloat(u.commission_rate) || 0,
      });
    }

    // Best-effort refresh depuis Stripe live pour avoir charges_enabled
    // a jour meme si le webhook n'est pas encore arrive.
    let charges_enabled = !!u.stripe_charges_enabled;
    let payouts_enabled = !!u.stripe_payouts_enabled;
    let details_submitted = false;
    let requirements_due = [];
    try {
      const stripe = getStripe();
      const acc = await stripe.accounts.retrieve(u.stripe_account_id);
      charges_enabled   = !!acc.charges_enabled;
      payouts_enabled   = !!acc.payouts_enabled;
      details_submitted = !!acc.details_submitted;
      requirements_due  = acc.requirements?.currently_due || [];
      // Persist le state si ca a change (eventual consistency).
      if (charges_enabled !== u.stripe_charges_enabled
        || payouts_enabled !== u.stripe_payouts_enabled) {
        await pool.query(
          `UPDATE users SET stripe_charges_enabled=$1, stripe_payouts_enabled=$2,
                            stripe_account_connected_at = COALESCE(stripe_account_connected_at, $3)
           WHERE id=$4`,
          [charges_enabled, payouts_enabled, charges_enabled ? new Date() : null, userId]
        );
      }
    } catch (e) {
      console.warn('[CONNECT ACCOUNT] retrieve fail (non bloquant):', e.message);
    }

    res.json({
      connected:           true,
      account_id:          u.stripe_account_id,
      account_email:       u.stripe_account_email,
      charges_enabled,
      payouts_enabled,
      details_submitted,
      requirements_due,
      connected_at:        u.stripe_account_connected_at,
      online_payments_enabled: !!u.online_payments_enabled,
      commission_rate:     parseFloat(u.commission_rate) || 0,
    });
  } catch (e) {
    console.error('[CONNECT ACCOUNT ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors de la récupération du compte' });
  }
});

// ── POST /api/stripe-connect/dashboard-link ────────────────────────────────
// Genere un login link Stripe pour acceder au dashboard Stripe du compte
// connecte (consultation/configuration depuis FlowIA sans repartir de zero).
router.post('/dashboard-link', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      'SELECT stripe_account_id FROM users WHERE id=$1', [userId]
    );
    if (!rows.length || !rows[0].stripe_account_id) {
      return res.status(400).json({ error: 'Aucun compte Stripe connecté' });
    }
    const stripe = getStripe();
    const link = await stripe.accounts.createLoginLink(rows[0].stripe_account_id);
    res.json({ url: link.url });
  } catch (e) {
    console.error('[CONNECT DASHBOARD LINK ERR]', e.message);
    res.status(500).json({ error: 'Erreur ouverture dashboard Stripe' });
  }
});

// ── POST /api/stripe-connect/disconnect ────────────────────────────────────
// Deconnecte le compte Connect du marchand (n'efface pas le compte Stripe
// cote Stripe, juste l'association avec FlowIA). Le marchand pourra se
// reconnecter via /onboard plus tard.
router.post('/disconnect', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    await pool.query(
      `UPDATE users SET stripe_account_id           = NULL,
                        stripe_account_email        = NULL,
                        stripe_charges_enabled      = FALSE,
                        stripe_payouts_enabled      = FALSE,
                        stripe_account_connected_at = NULL,
                        online_payments_enabled     = FALSE
       WHERE id=$1`, [userId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[CONNECT DISCONNECT ERR]', e.message);
    res.status(500).json({ error: 'Erreur déconnexion' });
  }
});

// ── POST /api/stripe-connect/webhook ───────────────────────────────────────
// Webhook DEDIE aux events Connect (account.updated principalement, +
// payment_intent.succeeded / charge.refunded sur comptes connectes pour
// les paiements de RDV plus tard). Verifie la signature avec
// STRIPE_CONNECT_WEBHOOK_SECRET (different du webhook plateforme).
router.post('/webhook', async (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret || !sig) {
    console.error('[CONNECT WEBHOOK] secret ou signature manquant');
    return res.status(400).json({ error: 'webhook signature required' });
  }
  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (e) {
    console.error('[CONNECT WEBHOOK] signature invalide:', e.message);
    return res.status(400).json({ error: 'invalid signature' });
  }

  // Anti-replay (table partagee avec subscription webhook).
  let alreadyProcessed = false;
  try {
    await pool.query(
      `INSERT INTO processed_stripe_events (event_id, event_type, source)
       VALUES ($1, $2, 'connect')`,
      [event.id, event.type]
    );
  } catch (e) {
    if (e.code === '23505') {
      alreadyProcessed = true;
      console.log('[CONNECT WEBHOOK] event already processed:', event.id);
    } else {
      console.error('[CONNECT WEBHOOK] anti-replay INSERT err:', e.message);
    }
  }

  res.json({ received: true });
  if (alreadyProcessed) return;

  try {
    if (event.type === 'account.updated') {
      const acc = event.data.object;
      await pool.query(
        `UPDATE users SET stripe_charges_enabled=$1,
                          stripe_payouts_enabled=$2,
                          stripe_account_connected_at = COALESCE(stripe_account_connected_at,
                            CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END)
         WHERE stripe_account_id=$3`,
        [!!acc.charges_enabled, !!acc.payouts_enabled, acc.id]
      );
      console.log('[CONNECT WEBHOOK] account.updated:', acc.id,
        acc.charges_enabled ? 'charges_OK' : 'charges_pending');
    }
    // Les events payment_intent.* / charge.refunded sur comptes connectes
    // seront traites en Phase 5 (booking payment flow).
  } catch (e) {
    console.error('[CONNECT WEBHOOK ERR]', event.type, e.message);
  }
});

module.exports = router;
