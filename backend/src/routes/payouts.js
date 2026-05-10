// routes/payouts.js — GET /api/payouts (Refonte v3, Commit 2)
//
// Liste les reversements Stripe Connect du commercant depuis la nouvelle
// table `payouts` (1 row par stripe_payout_id, alimentee par les webhooks
// payout.{paid,failed}). Distincte de la legacy /api/stripe-connect/payouts
// qui lit appointment_payouts (escrow par RDV, Phase 5).
//
// Utilise par l'onglet Reversements de /statistiques (Commit 4) et par le
// dashboard pour afficher l'historique des virements vers l'IBAN merchant.

const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { resolvePeriodRange } = require('../utils/paymentV3');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { period = 'month', date_from, date_to, status, page, per_page } = req.query;
    const range = resolvePeriodRange(period, date_from, date_to);
    // Tolerance custom sans dates : retourne empty au lieu de 400
    if (range === null) {
      return res.json({
        payouts: [],
        stats: { count: 0, total_period_cents: 0, avg_amount_cents: 0, min_cents: 0, max_cents: 0 },
        pagination: { page: 1, per_page: 50 },
        period: null,
      });
    }

    const VALID_STATUSES = new Set(['pending', 'in_transit', 'paid', 'failed', 'canceled']);
    if (status && !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'status invalide' });
    }

    const pageN    = Math.max(1, parseInt(page, 10) || 1);
    const perPageN = Math.min(50, Math.max(1, parseInt(per_page, 10) || 50));
    const offset   = (pageN - 1) * perPageN;

    const conds  = [`p.user_id = $1`];
    const params = [userId];

    params.push(range.from); conds.push(`p.requested_at >= $${params.length}::date`);
    params.push(range.to);   conds.push(`p.requested_at < ($${params.length}::date + INTERVAL '1 day')`);

    if (status) {
      params.push(status);
      conds.push(`p.status = $${params.length}`);
    }
    const where = conds.join(' AND ');

    const listParams = params.slice();
    listParams.push(perPageN);
    listParams.push(offset);
    const { rows: payouts } = await pool.query(`
      SELECT
        p.id,
        p.stripe_payout_id,
        p.amount_cents,
        p.currency,
        p.status,
        p.bank_account_last4,
        p.bank_name,
        p.triggered_by,
        e.name AS triggered_by_employee_name,
        p.requested_at,
        p.arrival_date,
        p.completed_at,
        p.failed_at,
        p.failure_reason
      FROM payouts p
      LEFT JOIN employees e ON e.id = p.triggered_by_employee_id
      WHERE ${where}
      ORDER BY p.requested_at DESC NULLS LAST
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
    `, listParams);

    // Stats sur la periode (sans filtre status pour donner une vue globale)
    const statsParams = [userId, range.from, range.to];
    const { rows: statsRows } = await pool.query(`
      SELECT
        COUNT(*)::int                               AS count,
        COALESCE(SUM(amount_cents), 0)::bigint      AS total_period_cents,
        COALESCE(AVG(amount_cents), 0)::bigint      AS avg_amount_cents,
        COALESCE(MIN(amount_cents), 0)::bigint      AS min_cents,
        COALESCE(MAX(amount_cents), 0)::bigint      AS max_cents
      FROM payouts
      WHERE user_id = $1
        AND requested_at >= $2::date
        AND requested_at < ($3::date + INTERVAL '1 day')
    `, statsParams);
    const s = statsRows[0] || {};

    res.json({
      payouts,
      stats: {
        count:               s.count || 0,
        total_period_cents:  parseInt(s.total_period_cents || 0, 10),
        avg_amount_cents:    parseInt(s.avg_amount_cents || 0, 10),
        min_cents:           parseInt(s.min_cents || 0, 10),
        max_cents:           parseInt(s.max_cents || 0, 10),
      },
      pagination: { page: pageN, per_page: perPageN },
      period: { from: range.from, to: range.to },
    });
  } catch (e) {
    console.error('[GET /api/payouts]', e.message);
    res.status(500).json({ error: 'Erreur serveur payouts' });
  }
});

module.exports = router;
