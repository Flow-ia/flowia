// routes/historique.js — GET /api/historique (Refonte v3, Commit 2)
//
// Liste enrichie des transactions du commercant avec filtres et totaux par
// source. Sert de source de verite pour la page /historique du frontend
// (Commit 3) et l'export CSV/PDF (Commit suivant : export.csv / export.pdf).
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
//
// L'export (CSV/PDF) reutilise STRICTEMENT le meme builder de filtres et la
// meme requete groupee que la liste : ce que le commercant voit a l'ecran =
// ce qu'il exporte (source unique, zero drift possible).

const express = require('express');
const PDFDocument = require('pdfkit');
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
// Plafond de lignes (groupes) pour l'export : borne dure anti-DoS sur la
// generation PDFKit / la taille du CSV. Au-dela, on tronque et on signale.
const MAX_EXPORT_GROUPS = 10000;

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

// Whitelist stricte des valeurs `sort` pour éviter toute injection SQL.
// Le frontend pioche une de ces clés ; le backend mappe vers une expression
// ORDER BY pré-validée (jamais d'interpolation directe du query param).
const SORT_MAP = {
  created_at_desc: 'g.group_created_at DESC NULLS LAST, g.rep_id DESC',
  created_at_asc:  'g.group_created_at ASC NULLS LAST, g.rep_id ASC',
  amount_desc:     'g.group_gross_cents DESC, g.group_created_at DESC NULLS LAST',
  amount_asc:      'g.group_gross_cents ASC, g.group_created_at DESC NULLS LAST',
  employee:        'e.name ASC NULLS LAST, g.group_created_at DESC NULLS LAST',
};
const DEFAULT_SORT = 'created_at_desc';

// ── Builder de filtres partage (liste + export) ──────────────────────────────
// Retourne :
//   { empty: true }                      -> period=custom sans les 2 dates
//   { error, status }                    -> validation KO
//   { range, params, where, orderBy,     -> OK
//     sortKey, pageN, perPageN, offset, period }
// `params` commence toujours par [userId] ($1).
function parseHistoriqueFilters(userId, query) {
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
    sort,
  } = query;

  const sortKey = (sort && SORT_MAP[sort]) ? sort : DEFAULT_SORT;
  const orderBy = SORT_MAP[sortKey];

  const range = resolvePeriodRange(period, date_from, date_to);
  // period='custom' sans les 2 dates -> signal "empty" (le caller decide :
  // 200 vide pour la liste, 400 pour l'export).
  if (range === null) return { empty: true };

  if (type && !TYPE_TO_FILTER[type]) return { error: 'type invalide', status: 400 };
  if (mode && !VALID_MODES.has(mode)) return { error: 'mode invalide', status: 400 };
  if (source && !VALID_SOURCES.has(source)) return { error: 'source invalide', status: 400 };
  if (employee_id && employee_id !== 'all' && !UUID_RE.test(employee_id)) {
    return { error: 'employee_id invalide', status: 400 };
  }

  const pageN    = Math.max(1, parseInt(page, 10) || 1);
  const perPageN = Math.min(PER_PAGE_MAX, Math.max(1, parseInt(per_page, 10) || PER_PAGE_MAX));
  const offset   = (pageN - 1) * perPageN;

  // Soft-delete : `deleted_at IS NULL` exclut les rows archivées du listing
  // commerçant. La row reste en BDD pour audit FEC mais devient invisible.
  const conds  = [`t.user_id = $1`, `t.type = 'revenue'`, `t.deleted_at IS NULL`];
  const params = [userId];

  params.push(range.from); conds.push(`t.date >= $${params.length}`);
  params.push(range.to);   conds.push(`t.date <= $${params.length}`);

  if (mode) {
    // mode='multi' englobe les rows legacy (payment_method='multi') ET les
    // nouvelles rows multi traçables (payment_group_id IS NOT NULL).
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

  return {
    range,
    params,
    where: conds.join(' AND '),
    orderBy,
    sortKey,
    pageN,
    perPageN,
    offset,
    period,
  };
}

// Requete groupee partagee (liste + export). Le caller ajoute lui-meme la
// clause `LIMIT $x [OFFSET $y]` apres avoir pushe les valeurs dans params.
function groupedListSql(where, orderBy) {
  return `
    WITH groups AS (
      SELECT
        COALESCE(t.payment_group_id, t.id)                AS group_key,
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
      t.employee_id,
      t.stripe_payment_intent_id,
      t.client_email,
      a.client_name,
      e.name AS employee_name,
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
      CASE WHEN g.has_group_id THEN g.breakdown_raw ELSE NULL END AS breakdown_payments,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id',           ti.id,
          'service_id',   ti.service_id,
          'service_name', ti.service_name,
          'qty',          ti.qty,
          'unit_price',   ti.unit_price
        ) ORDER BY ti.created_at)
        FROM transaction_items ti WHERE ti.transaction_id = t.id
      ), '[]'::json) AS items
    FROM groups g
    JOIN transactions t   ON t.id = g.rep_id
    LEFT JOIN appointments a ON a.id = t.appointment_id
    LEFT JOIN employees    e ON e.id = t.employee_id
    ORDER BY ${orderBy}`;
}

router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const parsed = parseHistoriqueFilters(userId, req.query);
    // period='custom' sans les 2 dates -> tolerance : empty result en 200
    // (le date picker rend la requete prematuree tant que les 2 dates ne
    // sont pas choisies ; on ne casse pas l'UI).
    if (parsed.empty) return res.json({ ...EMPTY_HISTORIQUE_RESPONSE });
    if (parsed.error) return res.status(parsed.status).json({ error: parsed.error });

    const { range, params, where, orderBy, sortKey, pageN, perPageN, offset, period } = parsed;

    // ── Cache key (5 min TTL) ───────────────────────────────────────────────
    const cacheKey = `historique:${period}:${range.from}:${range.to}:${req.query.type||''}:${req.query.mode||''}:${req.query.source||''}:${req.query.employee_id||''}:${pageN}:${perPageN}:${sortKey}`;
    const cached = statsCacheGet(userId, cacheKey);
    if (cached) return res.json(cached);

    // ── Liste des transactions paginee ──────────────────────────────────────
    const listParams = params.slice();
    listParams.push(perPageN);
    listParams.push(offset);
    const { rows: transactions } = await pool.query(
      `${groupedListSql(where, orderBy)}
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    // ── Totaux agreges (sur le meme filtre, sans pagination) ────────────────
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
    const legacyPayload = {
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

    // ── PHASE 4.4 LEDGER DUAL-READ ──────────────────────────────────────
    const { dualRead, isDebugVisible } = require('../utils/dualRead');
    const { getOnlineTotalsFromLedger } = require('../utils/ledgerReader');
    const debugVisible = await isDebugVisible(req, userId);
    const legacyFn = async () => legacyPayload;
    const ledgerFn = async (legacy) => {
      const ledger = await getOnlineTotalsFromLedger(pool, userId, range.from, range.to);
      return {
        ...legacy,
        totals: {
          ...legacy.totals,
          en_ligne_cents: ledger.en_ligne_cents,
          en_ligne_count: ledger.en_ligne_count,
          refunded_cents: ledger.refunded_cents,
          refunded_count: ledger.refunded_count,
        },
      };
    };
    const payload = await dualRead({
      userId,
      label:    'historique',
      flagName: 'ledger_read_historique',
      legacyFn,
      ledgerFn,
      tolerance: 0,
      fields:   ['totals.en_ligne_cents', 'totals.en_ligne_count',
                 'totals.refunded_cents', 'totals.refunded_count'],
      debugVisible,
    });

    statsCacheSet(userId, cacheKey, payload);
    res.json(payload);
  } catch (e) {
    console.error('[GET /api/historique]',
      'msg=' + (e.message || ''),
      'code=' + (e.code || ''),
      'detail=' + (e.detail || ''),
      'hint=' + (e.hint || ''),
      'position=' + (e.position || ''),
      'where=' + (e.where || '').slice(0, 200));
    res.status(500).json({
      error: 'Erreur serveur historique',
      pg_code: e.code || null,
    });
  }
});

// ── Helpers d'export (labels FR alignes sur l'UI TransactionRow.jsx) ─────────

const STATUS_LABELS = {
  STRIPE_100:     'Paye en ligne',
  STRIPE_ACOMPTE: 'Acompte en ligne',
  CASH_PAID:      'Encaisse caisse',
  REFUNDED:       'Rembourse',
};
const SOURCE_LABELS = {
  online_booking:    'RDV en ligne',
  cash_register_rdv: 'Caisse RDV',
  phone_internal:    'RDV telephone',
  walkin:            'Walk-in',
};
const METHOD_LABELS = {
  cash:        'Especes',
  transfer:    'Virement',
  card:        'CB',
  card_local:  'CB',
  card_online: 'Stripe',
  multi:       'Mixte',
  gift_card:   'Bon cadeau',
  other:       'Autre',
};

function isRefundRow(row) {
  return row.payment_status === 'REFUNDED' || row.payment_type === 'refund';
}

// Methode affichee (aligne sur TransactionRow.singleMethod + breakdown multi).
function methodLabel(row) {
  const bd = Array.isArray(row.breakdown_payments) ? row.breakdown_payments : null;
  if (bd && bd.length >= 2) {
    const parts = bd.map((p) => {
      const lbl = METHOD_LABELS[p.method] || METHOD_LABELS.other;
      const amt = (Math.abs(Number(p.amount_cents || 0)) / 100).toFixed(2).replace('.', ',');
      return `${lbl} ${amt}`;
    });
    return `Mixte (${parts.join(' + ')})`;
  }
  let m;
  if (row.payment_status === 'STRIPE_100' || row.payment_status === 'STRIPE_ACOMPTE') m = 'card_online';
  else if (row.payment_method) m = row.payment_method;
  else if (row.payment_status === 'CASH_PAID') m = 'cash';
  else m = 'other';
  return METHOD_LABELS[m] || METHOD_LABELS.other;
}

function statusLabel(row) {
  return STATUS_LABELS[row.payment_status] || 'A classer';
}
function sourceLabel(row) {
  if (isRefundRow(row)) return 'Rembourse';
  return SOURCE_LABELS[row.payment_source] || 'Autre';
}

// Montant brut signe (negatif pour les remboursements, comme l'UI).
function signedGrossCents(row) {
  const g = Math.abs(Number(row.gross_amount_cents || 0));
  return isRefundRow(row) ? -g : g;
}
function netCentsOf(row) {
  const gross = Math.abs(Number(row.gross_amount_cents || 0));
  const netRaw = Number(row.net_amount_cents || 0);
  const fees = Number(row.stripe_fee_cents || 0) + Number(row.platform_fee_cents || 0);
  const net = netRaw > 0 ? netRaw : Math.max(0, gross - fees);
  return isRefundRow(row) ? -net : net;
}
function eur2(cents) {
  return (Number(cents || 0) / 100).toFixed(2).replace('.', ',');
}
function rowDateStr(row) {
  if (row.date) {
    const d = new Date(row.date);
    if (!isNaN(d)) return d.toLocaleDateString('fr-FR');
    return String(row.date).slice(0, 10);
  }
  if (row.created_at) return new Date(row.created_at).toLocaleDateString('fr-FR');
  return '';
}
function rowTimeStr(row) {
  if (row.time) return String(row.time).slice(0, 5);
  if (row.created_at) {
    return new Date(row.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return '';
}

// AUDIT export : escCsv robuste (separateurs multiples, injection formule
// Excel = + - @, double escape). Ne jamais repasser une valeur deja escapee.
function escCsv(v, sep = ';') {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  const needsQuote = s.includes(sep) || s.includes(',') || s.includes('"')
                  || s.includes('\n') || s.includes('\r');
  return needsQuote ? `"${s.replace(/"/g, '""')}"` : s;
}

// Recupere les lignes filtrees pour l'export (meme requete groupee que la
// liste, sans pagination, bornee a MAX_EXPORT_GROUPS + 1 pour detecter la
// troncature).
async function fetchExportRows(userId, query) {
  const parsed = parseHistoriqueFilters(userId, query);
  if (parsed.empty) {
    return { error: 'Choisissez 2 dates (periode personnalisee) avant d exporter.', status: 400 };
  }
  if (parsed.error) return { error: parsed.error, status: parsed.status };

  const { range, params, where, orderBy } = parsed;
  const exportParams = params.slice();
  exportParams.push(MAX_EXPORT_GROUPS + 1);
  const { rows } = await pool.query(
    `${groupedListSql(where, orderBy)} LIMIT $${exportParams.length}`,
    exportParams
  );
  const truncated = rows.length > MAX_EXPORT_GROUPS;
  return { rows: truncated ? rows.slice(0, MAX_EXPORT_GROUPS) : rows, truncated, range };
}

function exportSummary(rows) {
  let grossCents = 0, netCents = 0, refundCents = 0, refundCount = 0;
  for (const r of rows) {
    grossCents += signedGrossCents(r);
    netCents   += netCentsOf(r);
    if (isRefundRow(r)) { refundCents += Math.abs(Number(r.gross_amount_cents || 0)); refundCount += 1; }
  }
  return { grossCents, netCents, refundCents, refundCount, count: rows.length };
}

// ── GET /api/historique/export.csv ───────────────────────────────────────────
router.get('/export.csv', async (req, res) => {
  try {
    const userId = req.user.userId;
    const out = await fetchExportRows(userId, req.query);
    if (out.error) return res.status(out.status).json({ error: out.error });
    const { rows, truncated, range } = out;

    const sep = ';';
    const BOM = '\uFEFF'; // UTF-8 BOM pour Excel
    const header = ['Date', 'Heure', 'Statut', 'Source', 'Mode de paiement',
                    'Employe', 'Client', 'Description', 'Montant brut', 'Montant net'];
    let csv = BOM + header.join(sep) + '\r\n';

    for (const r of rows) {
      csv += [
        rowDateStr(r),
        rowTimeStr(r),
        statusLabel(r),
        sourceLabel(r),
        methodLabel(r),
        r.employee_name || '-',
        (isRefundRow(r) || r.payment_source === 'walkin') ? '' : (r.client_name || ''),
        r.description || '',
        eur2(signedGrossCents(r)),
        eur2(netCentsOf(r)),
      ].map((v) => escCsv(v, sep)).join(sep) + '\r\n';
    }

    const s = exportSummary(rows);
    csv += '\r\n';
    csv += `${sep}${sep}${sep}${sep}${sep}${sep}${sep}TOTAL BRUT${sep}${eur2(s.grossCents)}${sep}\r\n`;
    csv += `${sep}${sep}${sep}${sep}${sep}${sep}${sep}TOTAL NET${sep}${sep}${eur2(s.netCents)}\r\n`;
    csv += `${sep}${sep}${sep}${sep}${sep}${sep}${sep}REMBOURSEMENTS${sep}${eur2(-s.refundCents)}${sep}\r\n`;
    if (truncated) {
      csv += `\r\nExport tronque aux ${MAX_EXPORT_GROUPS} premieres lignes. Affinez les filtres pour un export complet.\r\n`;
    }

    const filename = `historique_${range.from}_${range.to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) {
    console.error('[GET /api/historique/export.csv]', e.message, 'code=' + (e.code || ''));
    if (!res.headersSent) res.status(500).json({ error: 'Erreur generation CSV.' });
  }
});

// ── GET /api/historique/export.pdf ───────────────────────────────────────────
router.get('/export.pdf', async (req, res) => {
  try {
    const userId = req.user.userId;
    const out = await fetchExportRows(userId, req.query);
    if (out.error) return res.status(out.status).json({ error: out.error });
    const { rows, truncated, range } = out;

    const { rows: biz } = await pool.query(
      'SELECT business_name, email FROM users WHERE id=$1', [userId]);
    const businessName = biz[0]?.business_name || 'Salon DZ';
    const bizEmail     = biz[0]?.email || '';
    const s            = exportSummary(rows);

    // PDFKit police standard (Helvetica) : on retire les diacritiques pour
    // un rendu 100% fiable, comme l'export comptable existant.
    const pdf = (v) => String(v == null ? '' : v)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u20ac/g, 'EUR');

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 46, bottom: 56, left: 38, right: 38 },
      autoFirstPage: true,
      info: {
        Title: `Historique transactions ${range.from} au ${range.to}`,
        Author: businessName,
        Subject: 'Export historique Salon DZ',
      },
    });
    const filename = `historique_${range.from}_${range.to}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const PURPLE = '#6c63ff';
    const GREEN  = '#10b981';
    const RED    = '#ef4444';
    const GRAY   = '#6b7280';
    const DARK   = '#374151';
    const LIGHT  = '#f9fafb';
    const BORDER = '#e5e7eb';
    const PAGE_W = doc.page.width;
    const PAGE_H = doc.page.height;
    const ML = doc.page.margins.left;
    const MR = doc.page.margins.right;
    const MT = doc.page.margins.top;
    const MB = doc.page.margins.bottom;
    const W  = PAGE_W - ML - MR;
    const FOOTER_RESERVE = 46;

    const drawFooter = () => {
      const fy = PAGE_H - MB - 8;
      doc.save();
      doc.rect(0, fy - 8, PAGE_W, MB + 16).fillColor('#f3f4f6').fill();
      doc.fill(GRAY).font('Helvetica').fontSize(7)
         .text(pdf(`${process.env.APP_NAME || 'Salon DZ'}  ·  ${businessName}  ·  ${bizEmail}  ·  Export du ${new Date().toLocaleDateString('fr-FR')}`),
               ML, fy, { width: W, align: 'center' });
      doc.restore();
    };

    const COL = [
      { key: 'date',   label: 'Date',    w: 56,  align: 'left'  },
      { key: 'time',   label: 'Heure',   w: 36,  align: 'left'  },
      { key: 'status', label: 'Statut',  w: 92,  align: 'left'  },
      { key: 'source', label: 'Source',  w: 80,  align: 'left'  },
      { key: 'mode',   label: 'Mode',    w: 150, align: 'left'  },
      { key: 'emp',    label: 'Employe', w: 88,  align: 'left'  },
      { key: 'client', label: 'Client',  w: 96,  align: 'left'  },
      { key: 'gross',  label: 'Brut',    w: 60,  align: 'right' },
      { key: 'net',    label: 'Net',     w: 60,  align: 'right' },
    ];
    const ROW_H = 17;

    const drawTableHeader = (startY) => {
      doc.rect(ML, startY, W, 20).fillColor('#ede9fe').fill();
      doc.rect(ML, startY, W, 20).strokeColor('#c4b5fd').lineWidth(0.5).stroke();
      let x = ML + 6;
      COL.forEach((c) => {
        doc.fill(PURPLE).font('Helvetica-Bold').fontSize(7.5)
           .text(c.label, x, startY + 6, { width: c.w - 6, align: c.align });
        x += c.w;
      });
      return startY + 20;
    };

    // ── En-tete ───────────────────────────────────────────────────────────
    doc.rect(0, 0, PAGE_W, 96).fillColor(PURPLE).fill();
    doc.fill('white').font('Helvetica-Bold').fontSize(19)
       .text(pdf('Historique des transactions'), ML, 24, { width: W });
    doc.font('Helvetica').fontSize(11).text(pdf(businessName), ML, 50, { width: W });
    doc.fontSize(8.5).fillOpacity(0.85)
       .text(pdf(`Periode : ${range.from}  au  ${range.to}   ·   Genere le ${new Date().toLocaleDateString('fr-FR')}`),
             ML, 68, { width: W });
    doc.fillOpacity(1);

    // ── KPIs ──────────────────────────────────────────────────────────────
    let y = 112;
    const kpiW = (W - 24) / 4;
    [
      { label: 'TRANSACTIONS', value: String(s.count), color: PURPLE, bg: '#f5f3ff', bdr: '#c4b5fd' },
      { label: 'CA BRUT',      value: `${eur2(s.grossCents)} EUR`, color: GREEN, bg: '#f0fdf4', bdr: '#86efac' },
      { label: 'CA NET',       value: `${eur2(s.netCents)} EUR`,   color: GREEN, bg: '#f0fdf4', bdr: '#86efac' },
      { label: 'REMBOURSEMENTS', value: `${eur2(-s.refundCents)} EUR (${s.refundCount})`, color: RED, bg: '#fef2f2', bdr: '#fca5a5' },
    ].forEach((k, i) => {
      const kx = ML + i * (kpiW + 8);
      doc.roundedRect(kx, y, kpiW, 50, 6).fillColor(k.bg).fill();
      doc.roundedRect(kx, y, kpiW, 50, 6).strokeColor(k.bdr).lineWidth(1).stroke();
      doc.fill(GRAY).font('Helvetica').fontSize(7).text(k.label, kx + 9, y + 9, { width: kpiW - 18 });
      doc.fill(k.color).font('Helvetica-Bold').fontSize(12).text(pdf(k.value), kx + 9, y + 24, { width: kpiW - 18 });
    });
    y += 64;

    if (rows.length === 0) {
      doc.fill(GRAY).font('Helvetica').fontSize(10)
         .text(pdf('Aucune transaction sur cette periode / ces filtres.'), ML, y);
      drawFooter();
      doc.end();
      return;
    }

    y = drawTableHeader(y);
    rows.forEach((r, idx) => {
      if (y + ROW_H > PAGE_H - MB - FOOTER_RESERVE) {
        doc.addPage();
        drawFooter();
        y = drawTableHeader(MT);
      }
      if (idx % 2 === 0) doc.rect(ML, y, W, ROW_H).fillColor(LIGHT).fill();
      doc.rect(ML, y, W, ROW_H).strokeColor(BORDER).lineWidth(0.3).stroke();
      const refund = isRefundRow(r);
      const cells = {
        date:   rowDateStr(r),
        time:   rowTimeStr(r),
        status: statusLabel(r),
        source: sourceLabel(r),
        mode:   methodLabel(r),
        emp:    r.employee_name || '-',
        client: (refund || r.payment_source === 'walkin') ? '-' : (r.client_name || '-'),
        gross:  `${eur2(signedGrossCents(r))} EUR`,
        net:    `${eur2(netCentsOf(r))} EUR`,
      };
      let x = ML + 6;
      COL.forEach((c) => {
        let color = DARK;
        if (c.key === 'gross' || c.key === 'net') color = refund ? RED : GREEN;
        doc.fill(color)
           .font(c.key === 'gross' ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(7)
           .text(pdf(cells[c.key]), x, y + 5, { width: c.w - 6, align: c.align, ellipsis: true });
        x += c.w;
      });
      y += ROW_H;
    });

    // ── Totaux ────────────────────────────────────────────────────────────
    if (y + 60 > PAGE_H - MB - FOOTER_RESERVE) { doc.addPage(); drawFooter(); y = MT; }
    y += 14;
    doc.rect(ML, y, W, 24).fillColor('#f5f3ff').fill();
    doc.fill(PURPLE).font('Helvetica-Bold').fontSize(9)
       .text(pdf('RECAPITULATIF'), ML + 10, y + 7);
    y += 30;
    [
      ['CA brut', `${eur2(s.grossCents)} EUR`, GREEN],
      ['CA net', `${eur2(s.netCents)} EUR`, GREEN],
      ['Remboursements', `${eur2(-s.refundCents)} EUR (${s.refundCount})`, RED],
      ['Transactions', String(s.count), DARK],
    ].forEach(([lbl, val, col]) => {
      doc.fill(GRAY).font('Helvetica').fontSize(9).text(pdf(lbl + ' :'), ML + 12, y);
      doc.fill(col).font('Helvetica-Bold').fontSize(9)
         .text(pdf(val), ML + 12, y, { width: W - 24, align: 'right' });
      y += 16;
    });
    if (truncated) {
      y += 6;
      doc.fill(RED).font('Helvetica').fontSize(8)
         .text(pdf(`Export tronque aux ${MAX_EXPORT_GROUPS} premieres lignes. Affinez les filtres pour un export complet.`),
               ML + 12, y, { width: W - 24 });
    }

    drawFooter();
    doc.end();
  } catch (e) {
    console.error('[GET /api/historique/export.pdf]', e.message, 'code=' + (e.code || ''));
    if (!res.headersSent) res.status(500).json({ error: 'Erreur generation PDF.' });
  }
});

module.exports = router;
