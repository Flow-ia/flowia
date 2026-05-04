// routes/admin/stats.js — Statistiques globales pour le dashboard admin (#5).
// 5 requêtes parallèles, agrégats sur fenêtres temporelles (today, this_week,
// this_month, total). Aucune mutation.

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');

const router = express.Router();
router.use(adminAuth);

// Prix mensuels equivalents pour calculer le MRR (Monthly Recurring Revenue).
// Yearly: prix/12 — meme si le marchand paie en une fois, on amorti sur 12 mois.
const PLAN_MRR = {
  essentiel_monthly: 24,
  essentiel_yearly:  240 / 12,   // 20.00 EUR/mois equivalent
  equipe_monthly:    49,
  equipe_yearly:     490 / 12,   // 40.833... EUR/mois equivalent
};

// SMS : prix unitaire vendu (avec marge) et marge FlowIA en % du gross.
// Doit rester aligne avec backend/src/routes/payments.js (SMS_COST/MARGIN).
const SMS_COST       = parseFloat(process.env.SMS_COST_UNIT)     || 0.045;
const SMS_MARGIN_PCT = parseFloat(process.env.SMS_MARGIN_PERCENT) || 30;
const SMS_PRICE      = parseFloat((SMS_COST * (1 + SMS_MARGIN_PCT / 100)).toFixed(4));
// Ratio marge / prix de vente. Ex: 30% sur cost = 0.0135 / 0.0585 ≈ 23.08% du gross.
const SMS_MARGIN_RATIO = (SMS_PRICE - SMS_COST) / SMS_PRICE;

router.get('/', async (req, res) => {
  try {
    const [merchants, clients, appointments, revenue, top, subscriptions, smsTx, smsBalance] =
      await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int                                                                  AS total,
          COUNT(*) FILTER (WHERE is_frozen IS NOT TRUE)::int                             AS active,
          COUNT(*) FILTER (WHERE is_frozen = TRUE)::int                                  AS frozen,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int           AS new_this_week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int          AS new_this_month
        FROM users
      `),
      pool.query(`
        SELECT
          COUNT(*)::int                                                                  AS total,
          COUNT(*) FILTER (WHERE is_blocked IS NOT TRUE)::int                            AS active,
          COUNT(*) FILTER (WHERE is_blocked = TRUE)::int                                 AS blocked,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int          AS new_this_month
        FROM global_clients
      `),
      pool.query(`
        SELECT
          COUNT(*)::int                                                                  AS total,
          COUNT(*) FILTER (WHERE date = CURRENT_DATE)::int                               AS today,
          COUNT(*) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '7 days')::int          AS this_week,
          COUNT(*) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '30 days')::int         AS this_month,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int                              AS cancelled_total
        FROM appointments
      `),
      pool.query(`
        SELECT
          COALESCE(SUM(amount), 0)::numeric(14,2)                                              AS total,
          COALESCE(SUM(amount) FILTER (WHERE created_at >= CURRENT_DATE), 0)::numeric(14,2)    AS today,
          COALESCE(SUM(amount) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),  0)::numeric(14,2) AS this_week,
          COALESCE(SUM(amount) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'), 0)::numeric(14,2) AS this_month
        FROM transactions
      `),
      pool.query(`
        SELECT u.id, u.business_name, u.email, u.is_frozen,
               COUNT(t.id)::int                                                          AS transactions_count,
               COALESCE(SUM(t.amount), 0)::numeric(14,2)                                 AS revenue_month
          FROM users u
          LEFT JOIN transactions t
                 ON t.user_id = u.id
                AND t.created_at >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY u.id, u.business_name, u.email, u.is_frozen
         ORDER BY revenue_month DESC
         LIMIT 10
      `),
      // ── Stats abonnements plateforme (subscription_*) ──────────────────
      pool.query(`
        SELECT
          -- Actifs payants (Stripe paying, pas de grant superadmin)
          COUNT(*) FILTER (
            WHERE subscription_status IN ('active','trialing')
              AND subscription_admin_grant IS NULL
          )::int AS active_paying,
          -- En essai gratuit (sans CB ou avec CB)
          COUNT(*) FILTER (
            WHERE subscription_status = 'trialing'
              AND subscription_admin_grant IS NULL
          )::int AS trialing,
          -- Annulation programmee (paiera jusqu'a fin de periode)
          COUNT(*) FILTER (
            WHERE subscription_status IN ('active','trialing')
              AND subscription_admin_grant IS NULL
              AND subscription_cancel_at_period_end = TRUE
          )::int AS canceling,
          -- Echec de paiement en cours
          COUNT(*) FILTER (WHERE subscription_status = 'past_due')::int AS past_due,
          -- Annules definitifs (sub.deleted recue)
          COUNT(*) FILTER (WHERE subscription_status = 'canceled')::int AS canceled_total,
          -- Plans offerts par superadmin (gratuits, pas dans le CA)
          COUNT(*) FILTER (WHERE subscription_admin_grant IS NOT NULL)::int AS admin_granted,
          -- Breakdown par plan (actifs payants uniquement)
          COUNT(*) FILTER (
            WHERE subscription_plan='essentiel' AND subscription_period='monthly'
              AND subscription_status IN ('active','trialing')
              AND subscription_admin_grant IS NULL
          )::int AS essentiel_monthly,
          COUNT(*) FILTER (
            WHERE subscription_plan='essentiel' AND subscription_period='yearly'
              AND subscription_status IN ('active','trialing')
              AND subscription_admin_grant IS NULL
          )::int AS essentiel_yearly,
          COUNT(*) FILTER (
            WHERE subscription_plan='equipe' AND subscription_period='monthly'
              AND subscription_status IN ('active','trialing')
              AND subscription_admin_grant IS NULL
          )::int AS equipe_monthly,
          COUNT(*) FILTER (
            WHERE subscription_plan='equipe' AND subscription_period='yearly'
              AND subscription_status IN ('active','trialing')
              AND subscription_admin_grant IS NULL
          )::int AS equipe_yearly,
          -- Acquisitions sur 30j (nouveaux trialing OU active recent)
          COUNT(*) FILTER (
            WHERE subscription_status IN ('active','trialing')
              AND subscription_admin_grant IS NULL
              AND stripe_subscription_id IS NOT NULL
              AND COALESCE(subscription_trial_ends_at, subscription_current_period_end)
                  >= CURRENT_DATE - INTERVAL '60 days'
          )::int AS acquired_60d
        FROM users
      `),
      // ── Stats SMS (recharges Stripe + consommation Brevo) ─────────────
      pool.query(`
        SELECT
          COALESCE(SUM(amount) FILTER (
            WHERE type='credit' AND status='completed'
          ), 0)::numeric(14,2) AS gross_total,
          COALESCE(SUM(amount) FILTER (
            WHERE type='credit' AND status='completed'
              AND created_at >= CURRENT_DATE - INTERVAL '30 days'
          ), 0)::numeric(14,2) AS gross_30d,
          COALESCE(SUM(amount) FILTER (WHERE type='debit'), 0)::numeric(14,2) AS consumed_total,
          COALESCE(SUM(amount) FILTER (
            WHERE type='debit' AND created_at >= CURRENT_DATE - INTERVAL '30 days'
          ), 0)::numeric(14,2) AS consumed_30d,
          COALESCE(SUM(sms_count) FILTER (
            WHERE type='credit' AND status='completed'
          ), 0)::int AS sms_purchased,
          COALESCE(SUM(sms_count) FILTER (WHERE type='debit'), 0)::int AS sms_consumed
        FROM sms_transactions
      `),
      pool.query(`
        SELECT COALESCE(SUM(sms_balance), 0)::numeric(14,2) AS total_unused
        FROM users
      `),
    ]);

    // ── MRR / ARR : amortissement annual sur 12 mois ─────────────────────
    const sub = subscriptions.rows[0];
    const mrrCents =
        sub.essentiel_monthly * PLAN_MRR.essentiel_monthly * 100
      + sub.essentiel_yearly  * PLAN_MRR.essentiel_yearly  * 100
      + sub.equipe_monthly    * PLAN_MRR.equipe_monthly    * 100
      + sub.equipe_yearly     * PLAN_MRR.equipe_yearly     * 100;
    const mrr = Math.round(mrrCents) / 100;
    const arr = Math.round(mrr * 12 * 100) / 100;

    // ── Marge SMS : ratio (marge / prix vente) appliqué au CA gross ─────
    const sms = smsTx.rows[0];
    const grossTotal      = Number(sms.gross_total)     || 0;
    const grossTotal30d   = Number(sms.gross_30d)        || 0;
    const consumedTotal   = Number(sms.consumed_total)   || 0;
    const totalUnused     = Number(smsBalance.rows[0].total_unused) || 0;
    const marginTotal     = Math.round(grossTotal    * SMS_MARGIN_RATIO * 100) / 100;
    const marginTotal30d  = Math.round(grossTotal30d * SMS_MARGIN_RATIO * 100) / 100;

    return res.json({
      merchants:    merchants.rows[0],
      clients:      clients.rows[0],
      appointments: appointments.rows[0],
      revenue:      revenue.rows[0],
      top_merchants: top.rows,
      subscriptions: {
        ...sub,
        mrr,                                    // Monthly Recurring Revenue (€/mois)
        arr,                                    // Annual Recurring Revenue (€/an)
        // Total actifs (payants + trial + offerts) — vue d'ensemble parc
        total_active: sub.active_paying + sub.admin_granted,
      },
      sms: {
        gross_total:        grossTotal,
        gross_30d:          grossTotal30d,
        margin_total:       marginTotal,         // CA net FlowIA sur SMS
        margin_30d:         marginTotal30d,
        margin_ratio_pct:   Math.round(SMS_MARGIN_RATIO * 10000) / 100, // ex: 23.08%
        consumed_total:     consumedTotal,       // SMS deja envoyés
        unused_total:       totalUnused,         // Solde restant chez les merchants
        sms_purchased:      sms.sms_purchased,
        sms_consumed:       sms.sms_consumed,
        sms_unused:         sms.sms_purchased - sms.sms_consumed,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[admin/stats]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
