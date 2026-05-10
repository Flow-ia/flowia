// routes/historique.js — GET /api/historique (Refonte v3, Commit 2)
//
// Liste enrichie des transactions du commercant avec filtres et totaux par
// source. Sert de source de verite pour la page /historique du frontend
// (Commit 3) et la modale d'export CSV/PDF.
//
// Filtres supportes (query params) :
//   period        : 'today' | 'week' | 'month' | 'custom'
//   date_from     : YYYY-MM-DD (requis si period=custom)
//   date_to       : YYYY-MM-DD (requis si period=custom)
//   type          : 'stripe_full' | 'stripe_deposit' | 'cash_rdv' | 'walkin' | 'refunded'
//   mode          : 'cash' | 'card_local' | 'transfer' | 'stripe' | 'card_online'
//   source        : 'online_booking' | 'phone_internal' | 'cash_register_rdv' | 'walkin'
//   employee_id   : UUID
//   page          : 1+ (default 1)
//   per_page      : 1..50 (default 50)
//
// Filtre user_id est applique automatiquement depuis le JWT.
//
// Note retro-compat : pour les transactions inserees par les routes legacy
// (book.js, transactions.js) qui n'alimentent pas encore payment_status /
// payment_source / *_cents, les valeurs sont DERIVEES en SQL via COALESCE
// + CASE depuis transactions.source legacy ('rdv_online','rdv','rdv_refund',
// 'manual') et appointment_id IS NULL (= walk-in). Voir utils/paymentV3.js.

const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const {
  EFFECTIVE_PAYMENT_STATUS_SQL,
  EFFECTIVE_PAYMENT_SOURCE_SQL,
  EFFECTIVE_GROSS_CENTS_SQL,
  EFFECTIVE_NET_CENTS_SQL,
  resolvePeriodRange,
  statsCacheGet,
  statsCacheSet,
} = require('../utils/paymentV3');

const router = express.Router();
router.use(authMiddleware);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PER_PAGE_MAX = 50;

const TYPE_TO_FILTER = {
  // type -> { effStatus?, effSource? }
  stripe_full:    { effStatus: 'STRIPE_100' },
  stripe_deposit: { effStatus: 'STRIPE_ACOMPTE' },
  cash_rdv:       { effStatus: 'CASH_PAID', effSource: 'cash_register_rdv' },
  walkin:         { effSource: 'walkin' },
  refunded:       { effStatus: 'REFUNDED' },
};

const VALID_MODES   = new Set(['cash', 'card_local', 'transfer', 'stripe', 'card_online']);
const VALID_SOURCES = new Set(['online_booking', 'phone_internal', 'cash_register_rdv', 'walkin']);

router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      period = 'month',
      date_from,
      date_to,
      type,
      mode,
      source,
      employee_id,
      page,
      per_page,
    } = req.query;

    // ── Validation ──────────────────────────────────────────────────────────
    const range = resolvePeriodRange(period, date_from, date_to);
    if (period === 'custom' && (!date_from || !date_to)) {
      return res.status(400).json({ error: 'date_from et date_to requis quand period=custom' });
    }
    if (type && !TYPE_TO_FILTER[type]) {
      return res.status(400).json({ error: 'type invalide' });
    }
    if (mode && !VALID_MODES.has(mode)) {
      return res.status(400).json({ error: 'mode invalide' });
    }
    if (source && !VALID_SOURCES.has(source)) {
      return res.status(400).json({ error: 'source invalide' });
    }
    if (employee_id && employee_id !== 'all' && !UUID_RE.test(employee_id)) {
      return res.status(400).json({ error: 'employee_id invalide' });
    }
    const pageN     = Math.max(1, parseInt(page, 10) || 1);
    const perPageN  = Math.min(PER_PAGE_MAX, Math.max(1, parseInt(per_page, 10) || PER_PAGE_MAX));
    const offset    = (pageN - 1) * perPageN;

    // ── Construction des filtres SQL ────────────────────────────────────────
    const conds  = [`t.user_id = $1`, `t.type = 'revenue'`];
    const params = [userId];

    params.push(range.from); conds.push(`t.date >= $${params.length}`);
    params.push(range.to);   conds.push(`t.date <= $${params.length}`);

    if (mode) {
      params.push(mode);
      conds.push(`t.payment_method = $${params.length}`);
    }
    if (employee_id && employee_id !== 'all') {
      params.push(employee_id);
      conds.push(`t.employee_id = $${params.length}`);
    }

    // Filtres derives (sur les colonnes effectives via CASE/COALESCE)
    const typeFilter = type ? TYPE_TO_FILTER[type] : null;
    if (typeFilter?.effStatus) {
      params.push(typeFilter.effStatus);
      conds.push(`${EFFECTIVE_PAYMENT_STATUS_SQL} = $${params.length}`);
    }
    if (typeFilter?.effSource) {
      params.push(typeFilter.effSource);
      conds.push(`${EFFECTIVE_PAYMENT_SOURCE_SQL} = $${params.length}`);
    }
    if (source) {
      params.push(source);
      conds.push(`${EFFECTIVE_PAYMENT_SOURCE_SQL} = $${params.length}`);
    }

    const where = conds.join(' AND ');

    // ── Cache key (5 min TTL) ───────────────────────────────────────────────
    const cacheKey = `historique:${period}:${range.from}:${range.to}:${type||''}:${mode||''}:${source||''}:${employee_id||''}:${pageN}:${perPageN}`;
    const cached = statsCacheGet(userId, cacheKey);
    if (cached) return res.json(cached);

    // ── Liste des transactions paginee ──────────────────────────────────────
    const listParams = params.slice();
    listParams.push(perPageN);
    listParams.push(offset);
    const { rows: transactions } = await pool.query(`
      SELECT
        t.id,
        t.appointment_id,
        t.client_email,
        a.client_name,
        e.name AS employee_name,
        ${EFFECTIVE_GROSS_CENTS_SQL}                      AS gross_amount_cents,
        ${EFFECTIVE_NET_CENTS_SQL}                        AS net_amount_cents,
        COALESCE(t.stripe_fee_cents, 0)                   AS stripe_fee_cents,
        COALESCE(t.platform_fee_cents, 0)                 AS platform_fee_cents,
        t.payment_method,
        ${EFFECTIVE_PAYMENT_STATUS_SQL}                   AS payment_status,
        ${EFFECTIVE_PAYMENT_SOURCE_SQL}                   AS payment_source,
        COALESCE(t.payment_type, 'full')                  AS payment_type,
        t.description,
        t.created_at,
        t.date,
        t.time,
        t.stripe_payout_id,
        t.payout_received_at
      FROM transactions t
      LEFT JOIN appointments a ON a.id = t.appointment_id
      LEFT JOIN employees e ON e.id = t.employee_id
      WHERE ${where}
      -- created_at est TIMESTAMPTZ NOT NULL DEFAULT NOW() (toujours present
      -- + indexe via idx_transactions_user_created). Ne PAS faire
      -- COALESCE(t.datetime_iso, t.created_at) : datetime_iso est TEXT
      -- legacy (string ISO inseree par le JS) -> PG refuse le mix
      -- "text and timestamp with time zone" dans un COALESCE.
      ORDER BY t.created_at DESC NULLS LAST, t.id DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
    `, listParams);

    // ── Totaux agreges (sur le meme filtre, sans pagination) ────────────────
    const { rows: totalsRows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}), 0)::bigint AS ca_total_cents,

        COUNT(*) FILTER (WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'online_booking'
                            AND ${EFFECTIVE_PAYMENT_STATUS_SQL} IN ('STRIPE_100','STRIPE_ACOMPTE'))::int AS en_ligne_count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (
          WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'online_booking'
            AND ${EFFECTIVE_PAYMENT_STATUS_SQL} IN ('STRIPE_100','STRIPE_ACOMPTE')
        ), 0)::bigint AS en_ligne_cents,

        COUNT(*) FILTER (WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'cash_register_rdv')::int AS caisse_rdv_count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (
          WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'cash_register_rdv'
        ), 0)::bigint AS caisse_rdv_cents,

        COUNT(*) FILTER (WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'walkin')::int AS walkin_count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (
          WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'walkin'
        ), 0)::bigint AS walkin_cents,

        COUNT(*) FILTER (WHERE ${EFFECTIVE_PAYMENT_STATUS_SQL} = 'REFUNDED')::int AS refunded_count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (
          WHERE ${EFFECTIVE_PAYMENT_STATUS_SQL} = 'REFUNDED'
        ), 0)::bigint AS refunded_cents,

        COUNT(*) FILTER (WHERE ${EFFECTIVE_PAYMENT_STATUS_SQL} IS NULL)::int AS unclassified_count
      FROM transactions t
      LEFT JOIN appointments a ON a.id = t.appointment_id
      WHERE ${where}
    `, params);

    const t = totalsRows[0] || {};
    const payload = {
      transactions,
      totals: {
        ca_total_cents:    parseInt(t.ca_total_cents || 0, 10),
        en_ligne_cents:    parseInt(t.en_ligne_cents || 0, 10),
        en_ligne_count:    t.en_ligne_count || 0,
        caisse_rdv_cents:  parseInt(t.caisse_rdv_cents || 0, 10),
        caisse_rdv_count:  t.caisse_rdv_count || 0,
        walkin_cents:      parseInt(t.walkin_cents || 0, 10),
        walkin_count:      t.walkin_count || 0,
        refunded_cents:    parseInt(t.refunded_cents || 0, 10),
        refunded_count:    t.refunded_count || 0,
        unclassified_count: t.unclassified_count || 0,
      },
      pagination: {
        page: pageN,
        per_page: perPageN,
        total: t.total || 0,
      },
      period: { from: range.from, to: range.to },
    };

    statsCacheSet(userId, cacheKey, payload);
    res.json(payload);
  } catch (e) {
    console.error('[GET /api/historique]', e.message);
    res.status(500).json({ error: 'Erreur serveur historique' });
  }
});

module.exports = router;
