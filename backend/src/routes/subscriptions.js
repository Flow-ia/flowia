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

// Extrait les dates clés d'un objet subscription Stripe (compat tous API
// versions). Stripe API 2024-09+ a déplacé current_period_start/end de
// Subscription vers SubscriptionItem. On lit les deux endroits, fallback
// silencieux.
function extractSubDates(stripeSub) {
  const item = stripeSub?.items?.data?.[0];
  const periodEndUnix = stripeSub?.current_period_end || item?.current_period_end || null;
  const trialEndUnix  = stripeSub?.trial_end || item?.trial_end || null;
  return {
    periodEnd:         periodEndUnix ? new Date(periodEndUnix * 1000) : null,
    trialEnd:          trialEndUnix  ? new Date(trialEndUnix  * 1000) : null,
    cancelAtPeriodEnd: !!stripeSub?.cancel_at_period_end,
  };
}

// ── Anti-fraude / anti-spam sur les changements d'abonnement ───────────────
// 2 garde-fous complementaires :
// - COOLDOWN 60s : empeche le clic rafale (UX + protege webhooks Stripe).
// - CAP QUOTIDIEN 5 : empeche l'exploit cycliste upgrade/downgrade pour
//   abuser des proration ou stresser le systeme.
// La fenetre de 24h glisse a partir de subscription_changes_window_start.
const CHANGE_COOLDOWN_MS  = 60_000;          // 60 secondes
const CHANGE_DAILY_CAP    = 5;               // max 5 actions par 24h
const CHANGE_WINDOW_MS    = 24 * 3600_000;   // fenetre de 24h

// AUDIT : cluster-safe via SELECT ... FOR UPDATE dans une transaction.
// Sans ce verrou, deux workers (cluster Render) peuvent lire les memes
// last_change_at/count, valider la regle, puis double-incrementer → cap
// contournable. FOR UPDATE serialise les lectures concurrentes sur ce user.
// On RESERVE le slot (UPDATE des compteurs immediatement) pour eviter qu'un
// echec d'action Stripe laisse le compteur a jour mais l'action non realisee.
// Si l'action Stripe echoue ensuite, on rollback le compteur via revertChangeReservation.
async function assertChangeRateLimit(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT subscription_last_change_at, subscription_changes_count_24h,
              subscription_changes_window_start
       FROM users WHERE id=$1 FOR UPDATE`, [userId]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      throw new Error('User introuvable');
    }
    const r = rows[0];
    const now = Date.now();

    if (r.subscription_last_change_at) {
      const elapsed = now - new Date(r.subscription_last_change_at).getTime();
      if (elapsed < CHANGE_COOLDOWN_MS) {
        await client.query('ROLLBACK');
        const wait = Math.ceil((CHANGE_COOLDOWN_MS - elapsed) / 1000);
        const err = new Error(`Veuillez patienter ${wait} seconde${wait > 1 ? 's' : ''} avant un nouveau changement.`);
        err.statusCode = 429;
        err.retryAfter = wait;
        throw err;
      }
    }

    let windowStart = r.subscription_changes_window_start
                      ? new Date(r.subscription_changes_window_start).getTime() : 0;
    let count       = r.subscription_changes_count_24h || 0;
    if (!windowStart || (now - windowStart) > CHANGE_WINDOW_MS) {
      windowStart = now;
      count = 0;
    }
    if (count >= CHANGE_DAILY_CAP) {
      await client.query('ROLLBACK');
      const err = new Error(`Limite atteinte : maximum ${CHANGE_DAILY_CAP} changements d'abonnement par 24 heures. Réessayez demain.`);
      err.statusCode = 429;
      throw err;
    }

    // Reserve le slot maintenant (sous le lock FOR UPDATE) pour eviter un
    // contournement entre verif et UPDATE par un autre worker.
    const newWindowStart = new Date(windowStart);
    const newCount = count + 1;
    await client.query(
      `UPDATE users SET
         subscription_last_change_at       = NOW(),
         subscription_changes_window_start = $2,
         subscription_changes_count_24h    = $3
       WHERE id=$1`,
      [userId, newWindowStart, newCount]
    );
    await client.query('COMMIT');
    return { newWindowStart, newCount, _previousCount: count, _previousWindowStart: r.subscription_changes_window_start };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// recordChangeCommit garde la signature pour compat, no-op (la reservation
// a deja eu lieu dans assertChangeRateLimit). On laisse pour ne pas casser
// les call-sites existants.
async function recordChangeCommit(userId, _) { /* reserved in assert */ }

// Si l'action Stripe echoue apres reservation, on annule l'incrementation
// pour ne pas penaliser l'utilisateur (ex: Stripe API down, carte refusee).
async function revertChangeReservation(userId, reservation) {
  if (!reservation || !reservation._previousCount === undefined) return;
  try {
    await pool.query(
      `UPDATE users SET
         subscription_changes_count_24h    = $2,
         subscription_changes_window_start = $3
       WHERE id=$1`,
      [userId, reservation._previousCount, reservation._previousWindowStart]
    );
  } catch (e) {
    console.warn('[SUB revertChangeReservation]', e.message);
  }
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
        subscription_admin_grant          AS admin_grant,
        stripe_subscription_id
      FROM users
      WHERE id=$1
    `, [userId]);

    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });

    const sub = rows[0];

    // ── Octroi superadmin actif : court-circuit Stripe ────────────────────
    // Le marchand a un plan gratuit offert. On expose les infos du grant
    // au frontend qui affichera un bandeau special 'Plan offert par FlowIA'
    // et masquera les actions de paiement/changement de plan.
    if (sub.admin_grant) {
      const grant = sub.admin_grant;
      const stillValid = !grant.expires_at || new Date(grant.expires_at) > new Date();
      if (stillValid && grant.plan) {
        return res.json({
          status:               'active',  // synthetique
          plan:                 grant.plan,
          period:               grant.period || 'monthly',
          current_period_end:   grant.expires_at || null,
          trial_ends_at:        null,
          cancel_at_period_end: false,
          is_active:            true,
          is_past_due:          false,
          is_admin_granted:     true,
          admin_grant: {
            plan:       grant.plan,
            period:     grant.period || 'monthly',
            granted_at: grant.granted_at,
            expires_at: grant.expires_at || null,
            reason:     grant.reason || '',
          },
          has_subscription:     !!sub.stripe_subscription_id,
        });
      }
    }

    // BACKFILL : si stripe_subscription_id existe mais current_period_end
    // est null (cas API Stripe 2024-09+ ou webhook decale), on fetch live
    // depuis Stripe et on persist en DB pour les prochains appels.
    let periodEnd  = sub.current_period_end;
    let trialEnd   = sub.trial_ends_at;
    let cancelEnd  = sub.cancel_at_period_end;
    let liveStatus = sub.status;
    if (sub.stripe_subscription_id && !periodEnd) {
      try {
        const stripe    = getStripe();
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
        const dates     = extractSubDates(stripeSub);
        if (dates.periodEnd) {
          periodEnd  = dates.periodEnd;
          trialEnd   = dates.trialEnd || trialEnd;
          cancelEnd  = dates.cancelAtPeriodEnd;
          liveStatus = stripeSub.status || liveStatus;
          await pool.query(`
            UPDATE users SET
              subscription_current_period_end   = $1,
              subscription_trial_ends_at        = $2,
              subscription_cancel_at_period_end = $3,
              subscription_status               = $4
            WHERE id = $5
          `, [periodEnd, trialEnd, cancelEnd, liveStatus, req.user.userId]);
          console.log('[SUB ME backfill] dates synced from Stripe for user', req.user.userId);
        }
      } catch (e) {
        console.warn('[SUB ME backfill] fail (non bloquant):', e.message);
      }
    }

    res.json({
      status:               liveStatus,
      plan:                 sub.plan,
      period:               sub.period,
      current_period_end:   periodEnd,
      trial_ends_at:        trialEnd,
      cancel_at_period_end: !!cancelEnd,
      is_active:            ['active', 'trialing'].includes(liveStatus),
      is_past_due:          liveStatus === 'past_due',
      is_admin_granted:     false,
      admin_grant:          null,
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
  let userId, rate;
  try {
    userId = req.user.userId;
    // Anti-fraude : cooldown + cap quotidien (cluster-safe via FOR UPDATE).
    try { rate = await assertChangeRateLimit(userId); }
    catch (e) {
      if (e.statusCode === 429) {
        return res.status(429).json({ error: e.message, retry_after_seconds: e.retryAfter });
      }
      throw e;
    }

    const { rows } = await pool.query(
      `SELECT stripe_subscription_id, subscription_status
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) {
      await revertChangeReservation(userId, rate);
      return res.status(404).json({ error: 'User introuvable' });
    }
    const subId  = rows[0].stripe_subscription_id;
    const status = rows[0].subscription_status;
    if (!subId) {
      await revertChangeReservation(userId, rate);
      return res.status(400).json({ error: 'Aucun abonnement actif' });
    }
    // Cancel autorise sur past_due aussi : permet au marchand d'arreter les
    // retry Stripe en cours s'il ne souhaite pas regulariser le paiement.
    if (!['active', 'trialing', 'past_due'].includes(status)) {
      await revertChangeReservation(userId, rate);
      return res.status(400).json({ error: 'Abonnement non actif' });
    }

    const stripe = getStripe();
    const updated = await stripe.subscriptions.update(subId, {
      cancel_at_period_end: true,
    });
    const dates = extractSubDates(updated);

    await pool.query(
      `UPDATE users SET
         subscription_cancel_at_period_end = TRUE,
         subscription_current_period_end   = COALESCE($2, subscription_current_period_end)
       WHERE id = $1`,
      [userId, dates.periodEnd]
    );

    res.json({
      ok: true,
      cancel_at_period_end: true,
      cancels_on: dates.periodEnd ? dates.periodEnd.toISOString() : null,
    });
  } catch (e) {
    console.error('[SUB CANCEL ERR]', e.message);
    // Stripe a echoue ou autre erreur : on rend le slot rate limit consomme.
    if (userId && rate) await revertChangeReservation(userId, rate);
    res.status(500).json({ error: "Erreur lors de l'annulation" });
  }
});

// ── POST /api/subscriptions/reactivate ───────────────────────────────────────
// Annule l'annulation programmée. Possible uniquement si l'abonnement est
// encore en cours (current_period_end pas atteint).
router.post('/reactivate', authMiddleware, async (req, res) => {
  let userId, rate;
  try {
    userId = req.user.userId;
    try { rate = await assertChangeRateLimit(userId); }
    catch (e) {
      if (e.statusCode === 429) {
        return res.status(429).json({ error: e.message, retry_after_seconds: e.retryAfter });
      }
      throw e;
    }

    const { rows } = await pool.query(
      `SELECT stripe_subscription_id, subscription_status,
              subscription_cancel_at_period_end
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) {
      await revertChangeReservation(userId, rate);
      return res.status(404).json({ error: 'User introuvable' });
    }
    const subId = rows[0].stripe_subscription_id;
    if (!subId) {
      await revertChangeReservation(userId, rate);
      return res.status(400).json({ error: 'Aucun abonnement' });
    }
    if (!rows[0].subscription_cancel_at_period_end) {
      await revertChangeReservation(userId, rate);
      return res.status(400).json({ error: 'Abonnement non annulé' });
    }
    // AUDIT : reactivate refuse sur past_due. Si l'utilisateur veut reactiver
    // mais qu'un paiement a echoue, il doit d'abord regulariser via portal
    // Stripe (mettre a jour la CB) — sinon Stripe re-tentera et echouera
    // immediatement, replongeant le compte en past_due/canceled.
    if (!['active', 'trialing'].includes(rows[0].subscription_status)) {
      await revertChangeReservation(userId, rate);
      return res.status(400).json({
        error: rows[0].subscription_status === 'past_due'
          ? 'Mettez a jour votre moyen de paiement avant de reactiver.'
          : 'Abonnement non actif',
        code: rows[0].subscription_status === 'past_due' ? 'PAST_DUE_FIX_PAYMENT_FIRST' : 'NOT_ACTIVE',
      });
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
    if (userId && rate) await revertChangeReservation(userId, rate);
    res.status(500).json({ error: 'Erreur lors de la réactivation' });
  }
});

// ── POST /api/subscriptions/preview-change ──────────────────────────────────
// Preview ce qu'un changement de plan va concrètement coûter (proration
// debit/credit immediat + nouvelle facturation recurrente).
// Permet d'afficher des chiffres precis dans la modale de confirmation.
// Body : { plan: 'essentiel'|'equipe', period: 'monthly'|'yearly' }
router.post('/preview-change', authMiddleware, async (req, res) => {
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
    if (!newPriceId) return res.status(500).json({ error: 'Configuration Stripe incomplète' });

    const { rows } = await pool.query(
      'SELECT stripe_subscription_id FROM users WHERE id=$1', [userId]
    );
    if (!rows.length || !rows[0].stripe_subscription_id) {
      return res.status(400).json({ error: 'Aucun abonnement actif' });
    }

    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(rows[0].stripe_subscription_id);
    const itemId = sub.items?.data?.[0]?.id;
    if (!itemId) return res.status(500).json({ error: 'Item subscription introuvable' });

    let preview;
    try {
      preview = await stripe.invoices.upcoming({
        customer: sub.customer,
        subscription: sub.id,
        subscription_items: [{ id: itemId, price: newPriceId }],
        subscription_proration_behavior: 'create_prorations',
      });
    } catch (e) {
      // Cas premier mois trial sans facture upcoming : on indique que la
      // preview n'est pas calculable. Le frontend retombe sur le message generique.
      console.warn('[SUB PREVIEW] upcoming indisponible:', e.message);
      return res.json({ available: false });
    }

    // Sépare les lignes de proration immédiate (positif=débit, négatif=crédit)
    // de la facturation récurrente standard.
    let prorationCents = 0;
    let recurringCents = 0;
    for (const line of preview.lines?.data || []) {
      if (line.proration) prorationCents += line.amount || 0;
      else                recurringCents += line.amount || 0;
    }

    res.json({
      available: true,
      proration_immediate: prorationCents / 100,   // peut être négatif (crédit)
      next_recurring:      recurringCents / 100,
      total_due_now:       (preview.amount_due  || 0) / 100,
      next_invoice_date:   preview.period_end
        ? new Date(preview.period_end * 1000).toISOString()
        : null,
      currency: preview.currency || 'eur',
    });
  } catch (e) {
    console.error('[SUB PREVIEW ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors du calcul' });
  }
});

// ── POST /api/subscriptions/change-plan ──────────────────────────────────────
// Body : { plan: 'essentiel'|'equipe', period: 'monthly'|'yearly' }
// Change le plan/période avec proration immédiate :
// - Upgrade   → différence facturée maintenant
// - Downgrade → crédit appliqué sur la prochaine facture
// Le webhook customer.subscription.updated met à jour la DB.
router.post('/change-plan', authMiddleware, async (req, res) => {
  let userId, rate;
  try {
    userId = req.user.userId;
    const { plan, period } = req.body || {};

    if (!['essentiel', 'equipe'].includes(plan)) {
      return res.status(400).json({ error: 'Plan invalide' });
    }
    if (!['monthly', 'yearly'].includes(period)) {
      return res.status(400).json({ error: 'Période invalide' });
    }

    try { rate = await assertChangeRateLimit(userId); }
    catch (e) {
      if (e.statusCode === 429) {
        return res.status(429).json({ error: e.message, retry_after_seconds: e.retryAfter });
      }
      throw e;
    }

    const newPriceId = getPriceId(plan, period);
    if (!newPriceId) {
      await revertChangeReservation(userId, rate);
      return res.status(500).json({ error: 'Configuration Stripe incomplète' });
    }

    const { rows } = await pool.query(
      `SELECT stripe_subscription_id, subscription_status,
              subscription_plan, subscription_period
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) {
      await revertChangeReservation(userId, rate);
      return res.status(404).json({ error: 'User introuvable' });
    }
    const sub = rows[0];
    if (!sub.stripe_subscription_id) {
      await revertChangeReservation(userId, rate);
      return res.status(400).json({ error: 'Aucun abonnement actif' });
    }
    if (sub.subscription_plan === plan && sub.subscription_period === period) {
      await revertChangeReservation(userId, rate);
      return res.status(400).json({ error: 'Vous êtes déjà sur ce plan' });
    }
    if (!['active', 'trialing', 'past_due'].includes(sub.subscription_status)) {
      await revertChangeReservation(userId, rate);
      return res.status(400).json({ error: 'Abonnement non actif' });
    }

    const stripe = getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const itemId = stripeSub.items?.data?.[0]?.id;
    if (!itemId) {
      await revertChangeReservation(userId, rate);
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
    if (userId && rate) await revertChangeReservation(userId, rate);
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

  // C3 — Anti-replay : SELECT-then-process-then-INSERT (cf. stripe-connect.js).
  // AVANT : INSERT-early dans processed_stripe_events + res.json(200) AVANT
  // le processing -> si le processing throw, l'event etait deja marque
  // "traite" et Stripe (ayant recu 200) ne retentait JAMAIS : perte
  // definitive d'un event d'abonnement = etat desynchronise (marchand
  // facture mais plan non applique / resiliation non propagee = revenus
  // plateforme). MAINTENANT : check -> process -> mark seulement si succes
  // -> 200 ; sinon 500 -> Stripe retente (jusqu'a 3j, exponentiel). Les
  // UPDATE sont idempotents (par stripe_customer_id / stripe_subscription_id),
  // un re-run ne corrompt rien.
  let alreadyProcessed = false;
  try {
    const { rows: prevR } = await pool.query(
      'SELECT 1 FROM processed_stripe_events WHERE event_id = $1 LIMIT 1',
      [event.id]
    );
    alreadyProcessed = prevR.length > 0;
  } catch (e) {
    console.error('[SUB WEBHOOK] anti-replay SELECT err (continue without dedup):', e.message);
  }
  if (alreadyProcessed) {
    console.log('[SUB WEBHOOK] event already processed (skip):', event.id, event.type);
    return res.json({ received: true, already_processed: true });
  }

  // Processing isole dans une IIFE : les `return;` internes (early-exit par
  // type d'event) sortent du traitement, PAS de la route -> on garde la main
  // sur le status code final (200 si OK, 500 si echec -> retry Stripe).
  let outerError = null;
  try {
    await (async () => {
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
      // extractSubDates compatible Stripe API 2024-09+ (current_period_end
      // sur subscription_item, plus sur subscription).
      const dates        = extractSubDates(sub);
      const periodEnd    = dates.periodEnd;
      const trialEnd     = dates.trialEnd;
      const status       = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;
      const cancelAtEnd  = event.type === 'customer.subscription.deleted'
                            ? false : dates.cancelAtPeriodEnd;

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

    // ── setup_intent.succeeded : carte sauvegardee globale FlowIA ─────────
    // Event filtre par metadata.flowia_purpose='save_card' (sinon ignore --
    // d'autres SetupIntent peuvent exister dans le futur). On insere la
    // carte en DB avec brand/last4/exp pour l'afficher cote client. Index
    // UNIQUE(global_client_id, stripe_platform_pm_id) garantit l'idempotence
    // si Stripe retry l'event.
    if (event.type === 'setup_intent.succeeded') {
      const si = event.data.object;
      if (si.metadata?.flowia_purpose !== 'save_card') return;
      const globalClientId = si.metadata?.global_client_id;
      const platformPmId   = si.payment_method;
      const platformCustId = si.customer;
      if (!globalClientId || !platformPmId || !platformCustId) {
        console.warn('[SUB WEBHOOK] setup_intent.succeeded incomplet:', si.id);
        return;
      }
      const stripe = getStripe();
      let pm = null;
      try {
        pm = await stripe.paymentMethods.retrieve(platformPmId);
      } catch (e) {
        console.error('[SUB WEBHOOK] retrieve PM ko:', platformPmId, e.message);
      }
      const card = pm?.card || {};
      // Si le client n'a pas encore de carte, celle-ci devient default.
      const { rows: existing } = await pool.query(
        `SELECT 1 FROM client_payment_methods WHERE global_client_id=$1 LIMIT 1`,
        [globalClientId]
      );
      const isFirst = existing.length === 0;
      await pool.query(
        `INSERT INTO client_payment_methods
           (global_client_id, stripe_platform_pm_id, stripe_platform_customer_id,
            brand, last4, exp_month, exp_year, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (global_client_id, stripe_platform_pm_id) DO NOTHING`,
        [
          globalClientId, platformPmId, platformCustId,
          card.brand || null, card.last4 || null,
          card.exp_month || null, card.exp_year || null,
          isFirst,
        ]
      );
      console.log('[SUB WEBHOOK] save_card OK:', globalClientId, platformPmId,
        card.brand || '?', card.last4 || '????');
    }
    })();
  } catch (e) {
    outerError = e;
    console.error('[SUB WEBHOOK ERR]', event.type, 'event=' + event.id, e.message);
  }

  // Processing OK : marquer l'event traite (idempotent ON CONFLICT) puis 200.
  // Sinon : 500 -> Stripe retente (operations idempotentes -> re-run sain).
  if (!outerError) {
    try {
      await pool.query(
        `INSERT INTO processed_stripe_events (event_id, event_type, source)
         VALUES ($1, $2, 'subscription')
         ON CONFLICT (event_id) DO NOTHING`,
        [event.id, event.type]
      );
    } catch (markErr) {
      console.warn('[SUB WEBHOOK] mark processed fail (non-blocking):', event.id, markErr.message);
    }
    return res.json({ received: true });
  }
  return res.status(500).json({
    error: 'webhook processing failed',
    event_id: event.id,
    event_type: event.type,
    message: outerError.message,
  });
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
//
// FALLBACK : si Stripe customer n'a pas encore de coordonnées (premier load),
// on remplit avec les infos du profil commerçant (table users) — business_name,
// email, phone, address/city/postal_code. Le commerçant peut ensuite modifier
// pour avoir une adresse de facturation distincte de son adresse principale.
router.get('/billing-info', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      `SELECT stripe_customer_id, business_name, email, phone, address, city,
              postal_code, country
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });
    const u = rows[0];

    // Si pas encore de customer Stripe → fallback profil pur.
    if (!u.stripe_customer_id) {
      return res.json({
        billing: {
          name:    u.business_name || '',
          email:   u.email || '',
          phone:   u.phone || '',
          address: {
            line1: u.address || '', line2: '',
            city:  u.city || '', postal_code: u.postal_code || '',
            state: '', country: u.country || 'FR',
          },
        },
        from_profile: true, // hint UI : valeurs pré-remplies, pas encore enregistrées sur Stripe
      });
    }

    const stripe = getStripe();
    const customer = await stripe.customers.retrieve(u.stripe_customer_id);
    if (customer.deleted) {
      // Customer supprimé chez Stripe → fallback profil aussi.
      return res.json({
        billing: {
          name:    u.business_name || '',
          email:   u.email || '',
          phone:   u.phone || '',
          address: {
            line1: u.address || '', line2: '',
            city:  u.city || '', postal_code: u.postal_code || '',
            state: '', country: u.country || 'FR',
          },
        },
        from_profile: true,
      });
    }

    // Stripe a-t-il une adresse complète ? Si oui on la prend, sinon on
    // fallback champ par champ vers le profil pour que l'UI montre l'utilisateur
    // ce qui sera prélevé par défaut.
    const stripeAddr   = customer.address || {};
    const hasStripeAddr = !!(stripeAddr.line1 || stripeAddr.city || stripeAddr.postal_code);
    const fallbackAddr = {
      line1: u.address || '', line2: '',
      city:  u.city || '', postal_code: u.postal_code || '',
      state: '', country: u.country || 'FR',
    };

    res.json({
      billing: {
        name:    customer.name  || u.business_name || '',
        email:   customer.email || u.email || '',
        phone:   customer.phone || u.phone || '',
        address: hasStripeAddr ? {
          line1:       stripeAddr.line1 || '',
          line2:       stripeAddr.line2 || '',
          city:        stripeAddr.city  || '',
          postal_code: stripeAddr.postal_code || '',
          state:       stripeAddr.state || '',
          country:     stripeAddr.country || 'FR',
        } : fallbackAddr,
      },
      from_profile: !hasStripeAddr && !customer.address,
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
    // Pagination cursor-based (Stripe natif). Limite max 5 par page pour
    // ne pas surcharger ni le frontend ni les appels Stripe API.
    const stripe = getStripe();
    const params = {
      customer: rows[0].stripe_customer_id,
      limit:    Math.min(parseInt(req.query.limit, 10) || 5, 10),
    };
    if (req.query.starting_after) params.starting_after = req.query.starting_after;
    const list = await stripe.invoices.list(params);
    res.json({
      invoices: list.data.map(inv => ({
        id:          inv.id,
        number:      inv.number,
        status:      inv.status,
        amount:      (inv.amount_paid || inv.amount_due || 0) / 100,
        currency:    inv.currency,
        created:     inv.created ? new Date(inv.created * 1000).toISOString() : null,
        pdf:         inv.invoice_pdf,
        hosted_url:  inv.hosted_invoice_url,
        period_start: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
        period_end:   inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
      })),
      has_more: !!list.has_more,
      last_id:  list.data.length ? list.data[list.data.length - 1].id : null,
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
