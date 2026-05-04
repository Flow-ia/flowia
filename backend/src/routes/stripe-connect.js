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

// ── GET /api/stripe-connect/payment-config ─────────────────────────────────
// Retourne la config paiement RDV du marchand : active/inactif, politique
// (optionnel/obligatoire), pourcentage d'acompte.
router.get('/payment-config', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      `SELECT online_payments_enabled, booking_payment_policy,
              booking_payment_percentage, stripe_charges_enabled
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });
    const u = rows[0];
    res.json({
      enabled:    !!u.online_payments_enabled,
      policy:     u.booking_payment_policy || 'optional',
      percentage: parseInt(u.booking_payment_percentage, 10) || 100,
      // Indique si le marchand peut activer (Connect doit etre charges_enabled).
      can_enable: !!u.stripe_charges_enabled,
    });
  } catch (e) {
    console.error('[CONNECT PAYMENT-CONFIG GET ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── PUT /api/stripe-connect/payment-config ─────────────────────────────────
// Met a jour la config. Validation stricte :
// - enabled requiert stripe_charges_enabled=TRUE (sinon le client ne pourrait
//   pas payer, ca casserait le booking).
// - policy whitelist 'optional'/'mandatory'.
// - percentage entier 1-100.
router.put('/payment-config', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { enabled, policy, percentage } = req.body || {};

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled doit etre boolean' });
    }
    if (policy && !['optional', 'mandatory'].includes(policy)) {
      return res.status(400).json({ error: 'policy invalide (optional|mandatory)' });
    }
    const pct = parseInt(percentage, 10);
    if (percentage !== undefined && (!Number.isInteger(pct) || pct < 1 || pct > 100)) {
      return res.status(400).json({ error: 'percentage doit etre entier 1-100' });
    }

    // Si on active, verifier que Connect est charges_enabled (sinon les
    // PaymentIntents echoueraient cote Stripe).
    if (enabled) {
      const { rows: chk } = await pool.query(
        'SELECT stripe_charges_enabled FROM users WHERE id=$1', [userId]
      );
      if (!chk[0]?.stripe_charges_enabled) {
        return res.status(400).json({
          error: 'Connectez et finalisez votre compte Stripe avant d\'activer les paiements en ligne.',
        });
      }
    }

    await pool.query(
      `UPDATE users SET
         online_payments_enabled    = $2,
         booking_payment_policy     = COALESCE($3, booking_payment_policy),
         booking_payment_percentage = COALESCE($4, booking_payment_percentage)
       WHERE id=$1`,
      [userId, enabled, policy || null, percentage !== undefined ? pct : null]
    );

    const { rows } = await pool.query(
      `SELECT online_payments_enabled, booking_payment_policy, booking_payment_percentage
       FROM users WHERE id=$1`, [userId]
    );
    const u = rows[0];
    res.json({
      ok: true,
      enabled:    !!u.online_payments_enabled,
      policy:     u.booking_payment_policy,
      percentage: parseInt(u.booking_payment_percentage, 10),
    });
  } catch (e) {
    console.error('[CONNECT PAYMENT-CONFIG PUT ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors de la mise a jour' });
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
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('[CONNECT WEBHOOK] signature manquante');
    return res.status(400).json({ error: 'webhook signature required' });
  }
  // Multi-mode : on accepte 5 secrets possibles dans cet ordre, on teste
  // chacun jusqu'a en trouver un qui valide. Couvre les 2 webhooks Stripe
  // Connect necessaires : un sur 'Votre compte' (account.updated), un sur
  // 'Comptes connectes' (payment_intent.*, charge.refunded), x2 (Test+Live).
  const secrets = [
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET_LIVE,
    process.env.STRIPE_CONNECT_CONNECTED_WEBHOOK_SECRET_TEST,
    process.env.STRIPE_CONNECT_CONNECTED_WEBHOOK_SECRET_LIVE,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,  // legacy single-secret
  ].filter(Boolean);
  if (!secrets.length) {
    console.error('[CONNECT WEBHOOK] aucun STRIPE_CONNECT_WEBHOOK_SECRET_* configuré');
    return res.status(500).json({ error: 'webhook not configured' });
  }
  let event = null, lastErr = null;
  const stripe = getStripe();
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
      break;
    } catch (e) { lastErr = e; }
  }
  if (!event) {
    console.error('[CONNECT WEBHOOK] signature invalide:', lastErr?.message);
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

    // Phase 5/5 : events sur comptes connectes (booking payment flow).
    // ⚠ Ces events arrivent avec event.account = id du compte connecte.
    // L'objet pi.metadata contient les infos du booking pour reconcilier.
    else if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      // Si un RDV est deja lie (cree par /book apres confirmPayment cote
      // front), on s'assure juste que payment_status='paid'. Sinon (rare,
      // ex: confirmation server-side sans /book), on log mais ne cree pas
      // le RDV — le flow normal passe par /book.
      const upd = await pool.query(
        `UPDATE appointments
            SET payment_status = 'paid',
                paid           = TRUE,
                paid_at        = COALESCE(paid_at, NOW()),
                paid_amount_cents = COALESCE(paid_amount_cents, $2)
          WHERE stripe_payment_intent_id = $1
          RETURNING id, user_id`,
        [pi.id, pi.amount_received || pi.amount]
      );
      if (upd.rowCount > 0) {
        console.log('[CONNECT WEBHOOK] payment_intent.succeeded:',
          pi.id, '→ appt', upd.rows[0].id);
      } else {
        console.log('[CONNECT WEBHOOK] payment_intent.succeeded sans RDV (ok si confirme cote front):', pi.id);
      }
    }

    else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      // On marque le RDV (s'il existe) comme failed. Le client peut alors
      // retenter via le frontend. Si pas de RDV cree (echec avant /book),
      // pas d'action — le client retentera ou abandonnera.
      await pool.query(
        `UPDATE appointments
            SET payment_status = 'failed'
          WHERE stripe_payment_intent_id = $1
            AND payment_status NOT IN ('paid','refunded')`,
        [pi.id]
      );
      console.log('[CONNECT WEBHOOK] payment_intent.payment_failed:', pi.id,
        pi.last_payment_error?.message || '');
    }

    else if (event.type === 'charge.refunded') {
      const ch = event.data.object;
      // On retrouve le RDV via le PaymentIntent du charge (payment_intent
      // est sur charge object). Marque payment_status='refunded'.
      const piId = ch.payment_intent;
      if (piId) {
        const upd = await pool.query(
          `UPDATE appointments
              SET payment_status = 'refunded'
            WHERE stripe_payment_intent_id = $1
              AND payment_status <> 'refunded'
            RETURNING id`,
          [piId]
        );
        console.log('[CONNECT WEBHOOK] charge.refunded:', piId,
          upd.rowCount > 0 ? '→ appt ' + upd.rows[0].id : 'sans RDV');
      }
    }
  } catch (e) {
    console.error('[CONNECT WEBHOOK ERR]', event.type, e.message);
  }
});

module.exports = router;
