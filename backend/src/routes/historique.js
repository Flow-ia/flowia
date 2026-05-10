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
  EMPTY_HISTORIQUE_RESPONSE,
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

// VALID_MODES : strings exactes de transactions.payment_method en BDD.
// 'card_local' et 'stripe' n'existaient pas en BDD prod -> retires.
// Ajout 'card', 'multi', 'other' qui sont les vraies valeurs presentes.
const VALID_MODES = new Set(['card_online', 'cash', 'card', 'multi', 'other', 'transfer']);
// VALID_SOURCES : 3 valeurs simplifiees envoyees par le frontend
// (mappees en interne vers les vraies valeurs payment_source en BDD).
//   online -> payment_source = 'online_booking'
//   manual -> payment_source IN ('phone_internal', 'cash_register_rdv')
//   walkin -> payment_source = 'walkin'
const VALID_SOURCES = new Set(['online', 'manual', 'walkin']);

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
    // period='custom' sans les 2 dates -> tolerance : retourne empty result
    // au lieu d'un 400. Le frontend (date picker) rend la requete prematuree
    // tant que l'utilisateur n'a pas choisi les 2 dates ; on ne casse pas l'UI.
    if (range === null) {
      return res.json({ ...EMPTY_HISTORIQUE_RESPONSE });
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
      // Commit C — mode='multi' englobe à la fois les rows legacy
      // (payment_method='multi') ET les nouvelles rows multi traçables
      // (payment_group_id IS NOT NULL, chaque sous-paiement portant sa
      // propre méthode 'cash'/'transfer'/etc.). Les autres modes restent
      // un filtre strict sur payment_method.
      if (mode === 'multi') {
        conds.push(`(t.payment_method = 'multi' OR t.payment_group_id IS NOT NULL)`);
      } else {
        params.push(mode);
        conds.push(`t.payment_method = $${params.length}`);
      }
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
    // Source filter : mapping des 3 valeurs UI simplifiees vers les vraies
    // valeurs payment_source en BDD. 'manual' regroupe phone_internal +
    // cash_register_rdv (les badges detailles sur chaque row gardent la
    // distinction).
    if (source === 'online') {
      params.push('online_booking');
      conds.push(`${EFFECTIVE_PAYMENT_SOURCE_SQL} = $${params.length}`);
    } else if (source === 'manual') {
      params.push('phone_internal');
      const idxA = params.length;
      params.push('cash_register_rdv');
      const idxB = params.length;
      conds.push(`${EFFECTIVE_PAYMENT_SOURCE_SQL} IN ($${idxA}, $${idxB})`);
    } else if (source === 'walkin') {
      params.push('walkin');
      conds.push(`${EFFECTIVE_PAYMENT_SOURCE_SQL} = $${params.length}`);
    }

    const where = conds.join(' AND ');

    // ── Cache key (5 min TTL) ───────────────────────────────────────────────
    const cacheKey = `historique:${period}:${range.from}:${range.to}:${type||''}:${mode||''}:${source||''}:${employee_id||''}:${pageN}:${perPageN}`;
    const cached = statsCacheGet(userId, cacheKey);
    if (cached) return res.json(cached);

    // ── Liste des transactions paginee ──────────────────────────────────────
    // Commit C — Regroupement multi-paiement traçable. Une CTE `groups`
    // agrège les rows par COALESCE(payment_group_id, id) : chaque groupe
    // = 1 ligne dans la liste (au lieu de N rows pour un multi). On porte
    // group_size, group_gross_cents, group_net_cents, et l'array
    // breakdown_payments JSON pour les multi traçables. Les rows simples
    // ont group_size=1 et breakdown_payments=NULL (compat 100%). Les rows
    // legacy 'multi' (sans payment_group_id) restent group_size=1 mais
    // payment_method='multi' permet au frontend d'afficher le badge
    // « Détail non disponible (legacy) » jusqu'au commit D.
    const listParams = params.slice();
    listParams.push(perPageN);
    listParams.push(offset);
    const { rows: transactions } = await pool.query(`
      WITH groups AS (
        SELECT
          COALESCE(t.payment_group_id, t.id)                AS group_key,
          -- PG n'a pas de MIN(uuid). On prend la 1re row du groupe via
          -- array_agg ordonné (created_at puis id pour stabilité), puis [1].
          -- Équivaut à "la row la plus ancienne du groupe" — celle dont les
          -- méta (description, employé, etc.) seront affichées en historique.
          (array_agg(t.id ORDER BY t.created_at, t.id))[1]  AS rep_id,
          MAX(t.created_at)                                 AS group_created_at,
          COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}), 0)::bigint AS group_gross_cents,
          COALESCE(SUM(${EFFECTIVE_NET_CENTS_SQL}), 0)::bigint   AS group_net_cents,
          COUNT(*)::int                                     AS group_size,
          BOOL_OR(t.payment_group_id IS NOT NULL)           AS has_group_id,
          json_agg(
            json_build_object(
              'method',       t.payment_method,
              'amount_cents', ${EFFECTIVE_GROSS_CENTS_SQL}
            ) ORDER BY t.created_at, t.id
          )                                                 AS breakdown_raw
        FROM transactions t
        LEFT JOIN appointments a ON a.id = t.appointment_id
        WHERE ${where}
        GROUP BY COALESCE(t.payment_group_id, t.id)
      )
      SELECT
        t.id,
        t.appointment_id,
        t.client_email,
        a.client_name,
        e.name AS employee_name,
        -- gross/net : on EXPOSE le total du groupe (pour les multi, la
        -- rep_row seule sous-évalue le montant affiché en historique).
        g.group_gross_cents                               AS gross_amount_cents,
        g.group_net_cents                                 AS net_amount_cents,
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
        t.payout_received_at,
        t.payment_group_id,
        g.group_size,
        -- breakdown_payments : NULL pour les rows simples ET pour les rows
        -- legacy 'multi' (pas de payment_group_id). Le frontend affiche
        -- les sous-lignes uniquement quand cet array est non NULL.
        CASE WHEN g.has_group_id THEN g.breakdown_raw ELSE NULL END AS breakdown_payments
      FROM groups g
      JOIN transactions t   ON t.id = g.rep_id
      LEFT JOIN appointments a ON a.id = t.appointment_id
      LEFT JOIN employees    e ON e.id = t.employee_id
      ORDER BY g.group_created_at DESC NULLS LAST, g.rep_id DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
    `, listParams);

    // ── Totaux agreges (sur le meme filtre, sans pagination) ────────────────
    // Commit C — `total` compte les GROUPES (DISTINCT par
    // COALESCE(payment_group_id, id)) pour aligner pagination.total avec le
    // nombre de lignes affichées (sinon un multi 2-rows compterait double).
    // Les sub-aggregates (en_ligne_count, walkin_count, etc.) restent en
    // COUNT(*) FILTER : ils agrègent par source/status, pas par groupe ;
    // un encaissement multi reste 1 ligne walkin/cash_register_rdv multi-
    // méthodes mais N rows pour les SUM(montants) — la SUM reste correcte.
    const { rows: totalsRows } = await pool.query(`
      SELECT
        COUNT(DISTINCT COALESCE(t.payment_group_id, t.id))::int AS total,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}), 0)::bigint AS ca_total_cents,

        COUNT(DISTINCT COALESCE(t.payment_group_id, t.id))
          FILTER (WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'online_booking'
                    AND ${EFFECTIVE_PAYMENT_STATUS_SQL} IN ('STRIPE_100','STRIPE_ACOMPTE'))::int AS en_ligne_count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (
          WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'online_booking'
            AND ${EFFECTIVE_PAYMENT_STATUS_SQL} IN ('STRIPE_100','STRIPE_ACOMPTE')
        ), 0)::bigint AS en_ligne_cents,

        COUNT(DISTINCT COALESCE(t.payment_group_id, t.id))
          FILTER (WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'cash_register_rdv')::int AS caisse_rdv_count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (
          WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'cash_register_rdv'
        ), 0)::bigint AS caisse_rdv_cents,

        COUNT(DISTINCT COALESCE(t.payment_group_id, t.id))
          FILTER (WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'walkin')::int AS walkin_count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (
          WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'walkin'
        ), 0)::bigint AS walkin_cents,

        COUNT(DISTINCT COALESCE(t.payment_group_id, t.id))
          FILTER (WHERE ${EFFECTIVE_PAYMENT_STATUS_SQL} = 'REFUNDED')::int AS refunded_count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (
          WHERE ${EFFECTIVE_PAYMENT_STATUS_SQL} = 'REFUNDED'
        ), 0)::bigint AS refunded_cents,

        COUNT(DISTINCT COALESCE(t.payment_group_id, t.id))
          FILTER (WHERE ${EFFECTIVE_PAYMENT_STATUS_SQL} IS NULL)::int AS unclassified_count
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
    // Logging détaillé : code PG (ex: 42P01, 22P02), detail, hint, position,
    // table/column. Sans ces champs, impossible d'identifier la cause sur
    // Render logs. e.where contient le contexte exécution.
    console.error('[GET /api/historique]',
      'msg=' + (e.message || ''),
      'code=' + (e.code || ''),
      'detail=' + (e.detail || ''),
      'hint=' + (e.hint || ''),
      'position=' + (e.position || ''),
      'where=' + (e.where || '').slice(0, 200));
    res.status(500).json({
      error: 'Erreur serveur historique',
      // Renvoie le code PG côté client pour diagnostic rapide (sans leak
      // d'info sensible : juste le code SQLSTATE).
      pg_code: e.code || null,
    });
  }
});

module.exports = router;
