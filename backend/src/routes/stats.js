const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

// AUDIT stats #1 : validation input (évite 500 PG + fuite err.message).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validDate = s => typeof s === 'string' && DATE_RE.test(s);
const validUuid = s => typeof s === 'string' && UUID_RE.test(s);

// AUDIT stats #11 : "today" dans la TZ du commerçant (serveur Render en UTC
// sinon à 23h Paris on voyait le lendemain).
async function merchantToday(userId) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(NOW() AT TIME ZONE COALESCE(bs.timezone, 'Europe/Paris'), 'YYYY-MM-DD') AS today
     FROM users u LEFT JOIN booking_settings bs ON bs.user_id = u.id
     WHERE u.id = $1`, [userId]);
  return rows[0]?.today || new Date().toISOString().split('T')[0];
}

// ── GET /api/stats/products?from=&to=&employee_id= ────────────────────────────
// Statistiques par produit/service (depuis transaction_items) + par catégorie
router.get('/products', async (req, res) => {
  try {
    const { from, to, employee_id } = req.query;
    const userId = req.user.userId;

    if (from && !validDate(from)) return res.status(400).json({ error: 'from invalide.' });
    if (to   && !validDate(to))   return res.status(400).json({ error: 'to invalide.' });
    if (employee_id && employee_id !== 'all' && !validUuid(employee_id))
      return res.status(400).json({ error: 'employee_id invalide.' });

    const _k = `stats:products:${userId}:${from||''}:${to||''}:${employee_id||''}`;
    const _h = global.memCache?.get(_k);
    if (_h) return res.json(_h);

    // Construire les filtres de date et employé sur la transaction
    // Soft-delete : exclure les transactions archivées des stats produits/jour
    // (sinon un encaissement supprimé continuerait à gonfler le CA cumulé).
    const conditions = ['t.user_id = $1', "t.type = 'revenue'", 't.deleted_at IS NULL'];
    const params     = [userId];

    if (from) { params.push(from); conditions.push(`t.date >= $${params.length}`); }
    if (to)   { params.push(to);   conditions.push(`t.date <= $${params.length}`); }
    if (employee_id && employee_id !== 'all') {
      params.push(employee_id);
      conditions.push(`t.employee_id = $${params.length}`);
    }
    const where = conditions.join(' AND ');

    // ── 1. Stats par service/produit (depuis transaction_items) ───────────────
    const { rows: productRows } = await pool.query(`
      SELECT
        ti.service_name,
        ti.service_id,
        SUM(ti.qty)                         AS qty_sold,
        SUM(ti.qty * ti.unit_price)         AS revenue,
        AVG(ti.unit_price)                  AS avg_price,
        COUNT(DISTINCT ti.transaction_id)   AS tx_count
      FROM transaction_items ti
      JOIN transactions t ON t.id = ti.transaction_id
      WHERE ${where}
      GROUP BY ti.service_name, ti.service_id
      ORDER BY SUM(ti.qty * ti.unit_price) DESC
    `, params);

    // ── 2. Stats par catégorie (depuis transactions.category_id) ─────────────
    const { rows: catRows } = await pool.query(`
      SELECT
        t.category_id,
        c.name   AS category_name,
        c.color  AS category_color,
        c.icon   AS category_icon,
        SUM(t.qty_total)                    AS qty_sold,
        SUM(t.amount)                       AS revenue,
        COUNT(t.id)                         AS tx_count
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE ${where}
      GROUP BY t.category_id, c.name, c.color, c.icon
      ORDER BY SUM(t.amount) DESC
    `, params);

    // ── 3. Totaux globaux ─────────────────────────────────────────────────────
    const { rows: totals } = await pool.query(`
      SELECT
        SUM(t.qty_total)   AS total_qty,
        SUM(t.amount)      AS total_revenue,
        COUNT(t.id)        AS total_tx
      FROM transactions t
      WHERE ${where}
    `, params);

    // ── 4. Top employee breakdown par produit ─────────────────────────────────
    const { rows: empProductRows } = await pool.query(`
      SELECT
        ti.service_name,
        t.employee_id,
        e.name AS employee_name,
        e.avatar_color,
        SUM(ti.qty)                 AS qty_sold,
        SUM(ti.qty * ti.unit_price) AS revenue
      FROM transaction_items ti
      JOIN transactions t ON t.id = ti.transaction_id
      LEFT JOIN employees e ON e.id = t.employee_id
      WHERE ${where}
      GROUP BY ti.service_name, t.employee_id, e.name, e.avatar_color
      ORDER BY ti.service_name, SUM(ti.qty * ti.unit_price) DESC
    `, params);

    const _r = { products: productRows, categories: catRows,
      totals: totals[0] || { total_qty: 0, total_revenue: 0, total_tx: 0 },
      emp_products: empProductRows };
    global.memCache?.set(_k, _r, 2 * 60 * 1000);
    res.json(_r);
  } catch(e) {
    console.error('[STATS PRODUCTS]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});



// ── GET /api/stats/forecast?months=3 ── Prévisions de CA ────────────────────
router.get('/forecast', async (req, res) => {
  try {
    const months = Math.min(6, parseInt(req.query.months)||3);
    const _fk = `stats:forecast:${req.user.userId}:${months}`;
    const _fh = global.memCache?.get(_fk);
    if (_fh) return res.json(_fh);
    // Récupérer les 12 derniers mois de CA — TZ merchant pour la borne.
    const { rows: rawRows } = await pool.query(
      `SELECT
         TO_CHAR(date,'YYYY-MM') as month,
         SUM(amount) as revenue,
         COUNT(*) as tx_count
       FROM transactions
       WHERE user_id=$1 AND type='revenue'
         AND deleted_at IS NULL
         AND date >= (NOW() AT TIME ZONE (
           SELECT COALESCE(timezone,'Europe/Paris') FROM booking_settings WHERE user_id=$1
         ))::date - INTERVAL '12 months'
       GROUP BY TO_CHAR(date,'YYYY-MM')
       ORDER BY month ASC`,
      [req.user.userId]
    );

    if (rawRows.length < 2) return res.json({ historical: rawRows, forecasts: [] });

    // AUDIT stats #17 : combler les mois manquants avec 0 (sinon régression
    // linéaire faussée — les "trous" décalent l'index temporel).
    const byMonth = Object.fromEntries(rawRows.map(r => [r.month, r]));
    const [fy, fm] = rawRows[0].month.split('-').map(Number);
    const [ey, em] = rawRows[rawRows.length-1].month.split('-').map(Number);
    const rows = [];
    let cy = fy, cm = fm;
    while (cy < ey || (cy === ey && cm <= em)) {
      const key = `${cy}-${String(cm).padStart(2,'0')}`;
      rows.push(byMonth[key] || { month: key, revenue: 0, tx_count: 0 });
      cm++; if (cm > 12) { cm = 1; cy++; }
    }

    // Calcul moyenne mobile pondérée (mois récents = poids plus fort)
    const revenues = rows.map(r => parseFloat(r.revenue)||0);
    const n = revenues.length;
    const weights = revenues.map((_,i) => i+1); // poids croissants
    const totalW = weights.reduce((s,w)=>s+w, 0);
    const avgWeighted = revenues.reduce((s,v,i)=>s+v*weights[i], 0) / totalW;

    // Tendance (régression linéaire simple)
    const xMean = (n-1)/2;
    const yMean = revenues.reduce((s,v)=>s+v,0)/n;
    const slope = revenues.reduce((s,v,i)=>s+(i-xMean)*(v-yMean),0) /
                  revenues.reduce((s,_,i)=>s+(i-xMean)**2,0);

    const forecasts = [];
    const lastMonth = rows[rows.length-1]?.month || new Date().toISOString().substring(0,7);
    const [ly, lm] = lastMonth.split('-').map(Number);
    for (let i=1; i<=months; i++) {
      const d = new Date(ly, lm-1+i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const projected = Math.max(0, avgWeighted + slope * i);
      forecasts.push({
        month,
        projected: Math.round(projected * 100) / 100,
        projected_low:  Math.round(Math.max(0, projected * 0.85) * 100) / 100,
        projected_high: Math.round(projected * 1.15 * 100) / 100,
      });
    }

    const _fr = { historical: rows, forecasts, avg_monthly: Math.round(avgWeighted*100)/100, slope: Math.round(slope*100)/100 };
    global.memCache?.set(_fk, _fr, 5 * 60 * 1000);
    res.json(_fr);
  } catch(e) {
    console.error('[STATS FORECAST]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/stats/heatmap ── Heures de pointe ────────────────────────────────
router.get('/heatmap', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (from && !validDate(from)) return res.status(400).json({ error: 'from invalide.' });
    if (to   && !validDate(to))   return res.status(400).json({ error: 'to invalide.' });

    const _hk = `stats:heatmap:${req.user.userId}:${from||''}:${to||''}`;
    const _hh = global.memCache?.get(_hk);
    if (_hh) return res.json(_hh);
    const fromD = from || new Date(new Date().setMonth(new Date().getMonth()-3)).toISOString().split('T')[0];
    const toD   = to   || new Date().toISOString().split('T')[0];

    const { rows } = await pool.query(
      `SELECT
         EXTRACT(DOW FROM date)::int as day_of_week,
         EXTRACT(HOUR FROM COALESCE(time, '12:00:00'))::int as hour_of_day,
         COUNT(*) as count,
         SUM(amount) as revenue
       FROM transactions
       WHERE user_id=$1 AND type='revenue'
         AND deleted_at IS NULL
         AND date BETWEEN $2 AND $3
         AND time IS NOT NULL
       GROUP BY day_of_week, hour_of_day
       ORDER BY day_of_week, hour_of_day`,
      [req.user.userId, fromD, toD]
    );

    // Construire la grille 7x24
    const grid = {};
    let maxCount = 0;
    for (const r of rows) {
      const key = `${r.day_of_week}_${r.hour_of_day}`;
      grid[key] = { count: parseInt(r.count), revenue: parseFloat(r.revenue)||0 };
      if (parseInt(r.count) > maxCount) maxCount = parseInt(r.count);
    }

    const _hr = { grid, maxCount, from: fromD, to: toD };
    global.memCache?.set(_hk, _hr, 10 * 60 * 1000);
    res.json(_hr);
  } catch(e) {
    console.error('[STATS HEATMAP]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});


// ── GET /api/stats/today — Stats du jour (employés + admin) ──────────────────
// Données légères : CA du jour, nb transactions, top catégorie
router.get('/today', async (req, res) => {
  try {
    const userId = req.user.userId;
    // AUDIT stats #11 : TZ merchant — sinon à 23h Paris on bascule au lendemain
    // UTC et le dashboard affiche "0 € aujourd'hui" alors qu'on vend encore.
    const today  = await merchantToday(userId);
    const _k     = `stats:today:${userId}:${today}`;
    const _h     = global.memCache?.get(_k);
    if (_h) return res.json(_h);

    // CA + nb transactions du jour
    const { rows: summary } = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type='revenue' THEN amount ELSE 0 END), 0) AS ca_today,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expenses_today,
        COUNT(CASE WHEN type='revenue' THEN 1 END)                        AS tx_count,
        COUNT(CASE WHEN type='revenue' AND employee_id IS NOT NULL THEN 1 END) AS with_employee
      FROM transactions
      WHERE user_id=$1 AND date=$2 AND deleted_at IS NULL
    `, [userId, today]);

    // Top employé du jour
    const { rows: topEmp } = await pool.query(`
      SELECT e.name, e.avatar_color,
             SUM(t.amount) AS ca,
             COUNT(t.id)   AS nb
      FROM transactions t
      JOIN employees e ON e.id = t.employee_id
      WHERE t.user_id=$1 AND t.date=$2 AND t.type='revenue'
        AND t.deleted_at IS NULL
      GROUP BY e.id, e.name, e.avatar_color
      ORDER BY SUM(t.amount) DESC
      LIMIT 1
    `, [userId, today]);

    // RDV du jour
    const { rows: appts } = await pool.query(`
      SELECT COUNT(*) AS total,
             COUNT(CASE WHEN status='confirmed' THEN 1 END) AS confirmed,
             COUNT(CASE WHEN status='cancelled' THEN 1 END) AS cancelled
      FROM appointments
      WHERE user_id=$1 AND date=$2
    `, [userId, today]);

    const result = {
      date:     today,
      ca_today: parseFloat(summary[0].ca_today),
      expenses_today: parseFloat(summary[0].expenses_today),
      tx_count: parseInt(summary[0].tx_count),
      top_employee: topEmp[0] || null,
      appointments: {
        total:     parseInt(appts[0].total),
        confirmed: parseInt(appts[0].confirmed),
        cancelled: parseInt(appts[0].cancelled),
      },
    };

    global.memCache?.set(_k, result, 60 * 1000); // cache 1 min
    res.json(result);
  } catch(e) {
    console.error('[STATS TODAY]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/stats/by-payment-method?period=today|week|month ─────────────────
// Refonte FDS-2026 commit 6 : ventilation du CA par moyen de paiement pour
// la page Statistiques. Les 6 méthodes renvoyées correspondent aux cards
// pastel : cash / card / card_online / transfer / other / multi.
// 'card_online' = paiement Stripe Connect (acompte ou intégral cote client),
// distinct de 'card' (CB au comptoir) — ajout STATUS.md §4 + commit 8906158.
// Le payment_method `check` (historique, whitelisté en back) est agrégé dans
// `other` pour rester aligné sur l'UI. Cache 2 min.
router.get('/by-payment-method', async (req, res) => {
  try {
    const userId = req.user.userId;
    const period = String(req.query.period || 'today');
    if (!['today', 'week', 'month'].includes(period))
      return res.status(400).json({ error: 'period invalide (today|week|month).' });

    const today = await merchantToday(userId);
    let from = today;
    if (period === 'week')  {
      const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 6);
      from = d.toISOString().slice(0, 10);
    } else if (period === 'month') {
      const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 29);
      from = d.toISOString().slice(0, 10);
    }
    const to = today;

    const _k = `stats:bypm:${userId}:${period}:${from}:${to}`;
    const _h = global.memCache?.get(_k);
    if (_h) return res.json(_h);

    // Commit C — on distingue désormais les rows multi traçables (chaque
    // sous-paiement porte sa vraie méthode 'cash'/'transfer'/etc. et a
    // payment_group_id IS NOT NULL) des 4 rows legacy 'multi' restantes
    // (payment_method='multi' AND payment_group_id IS NULL). Ces dernières
    // sont agrégées sous la clé `multi_legacy` en attendant le commit D.
    // Ajout également de `gift_card` qui apparaît naturellement comme
    // payment_method d'une sous-row de breakdown.
    const { rows } = await pool.query(
      `SELECT payment_method,
              CASE WHEN payment_method = 'multi' AND payment_group_id IS NULL
                   THEN TRUE ELSE FALSE END             AS is_legacy_multi,
              COALESCE(SUM(amount), 0)::numeric         AS amount,
              COUNT(*)                                  AS count
         FROM transactions
        WHERE user_id=$1 AND type='revenue'
          AND deleted_at IS NULL
          AND date BETWEEN $2 AND $3
        GROUP BY payment_method,
                 (payment_method = 'multi' AND payment_group_id IS NULL)`,
      [userId, from, to]
    );

    const EMPTY = { amount: 0, count: 0 };
    const by_method = {
      cash:         { ...EMPTY },
      card:         { ...EMPTY },
      card_online:  { ...EMPTY },
      transfer:     { ...EMPTY },
      gift_card:    { ...EMPTY },
      other:        { ...EMPTY },
      multi_legacy: { ...EMPTY },
      // Compat front actuel : on garde 'multi' comme alias de 'multi_legacy'
      // tant que d'autres consommateurs lisent encore by_method.multi.
      multi:        { ...EMPTY },
    };
    let total = 0;
    for (const r of rows) {
      const amt = parseFloat(r.amount) || 0;
      const cnt = parseInt(r.count, 10) || 0;
      total += amt;
      // `check` (whitelisté historique) agrégé dans `other` pour matcher l'UI.
      let key;
      if (r.is_legacy_multi) {
        key = 'multi_legacy';
      } else if (r.payment_method === 'check') {
        key = 'other';
      } else if (r.payment_method === 'multi') {
        // Cas théorique : payment_method='multi' avec payment_group_id NOT NULL.
        // Le commit A n'en crée pas (chaque sous-row porte sa vraie méthode),
        // mais filet de sécurité : on agrège dans `other`.
        key = 'other';
      } else {
        key = r.payment_method;
      }
      if (by_method[key]) {
        by_method[key].amount += amt;
        by_method[key].count  += cnt;
      } else {
        by_method.other.amount += amt;
        by_method.other.count  += cnt;
      }
    }
    // Alias rétro-compat : multi reflète multi_legacy.
    by_method.multi.amount = by_method.multi_legacy.amount;
    by_method.multi.count  = by_method.multi_legacy.count;
    // Arrondir 2 décimales à la sortie (flottants JS).
    for (const k of Object.keys(by_method)) {
      by_method[k].amount = Math.round(by_method[k].amount * 100) / 100;
    }
    total = Math.round(total * 100) / 100;

    // Commit C — nouveau format `by_payment_method` consommé par les KPI
    // cards de la page Performance (label + icon + total_cents + count).
    // `icon` = nom de l'icône Tabler/Lucide à charger côté frontend (PAS
    // un emoji : conformité FDS-2026 « pas d'emoji UI »).
    const PM_META = {
      cash:         { label: 'Espèces',         icon: 'cash'       },
      transfer:     { label: 'Virement',        icon: 'send'       },
      card:         { label: 'CB physique',     icon: 'creditCard' },
      gift_card:    { label: 'Bon cadeau',      icon: 'gift'       },
      card_online:  { label: 'Stripe en ligne', icon: 'globe'      },
      other:        { label: 'Autre',           icon: 'more'       },
      multi_legacy: { label: 'Multi (legacy)',  icon: 'more'       },
    };
    const by_payment_method = {};
    for (const k of Object.keys(PM_META)) {
      const e = by_method[k] || EMPTY;
      by_payment_method[k] = {
        label:       PM_META[k].label,
        icon:        PM_META[k].icon,
        total_cents: Math.round((e.amount || 0) * 100),
        count:       e.count || 0,
      };
    }

    const result = {
      period, from, to,
      by_method,
      by_payment_method,
      total_by_period_cents: Math.round(total * 100),
      total,
    };
    global.memCache?.set(_k, result, 2 * 60 * 1000); // cache 2 min
    res.json(result);
  } catch (e) {
    console.error('[STATS BY-PM]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// REFONTE V3 — Commit 2 — endpoints alimentant la refonte /statistiques
// (4 onglets : Performance, RDV, Paiements en ligne, Reversements).
//
// Helpers v3 : derivation payment_status / payment_source v3 depuis legacy
// source / appointment_id (back-compat avec routes legacy qui n'alimentent
// pas encore les nouvelles colonnes). Voir utils/paymentV3.js.
// ────────────────────────────────────────────────────────────────────────────

const {
  EFFECTIVE_PAYMENT_STATUS_SQL,
  EFFECTIVE_PAYMENT_SOURCE_SQL,
  EFFECTIVE_GROSS_CENTS_SQL,
  EFFECTIVE_NET_CENTS_SQL,
  resolvePeriodRange,
  previousPeriodRange,
  statsCacheGet,
  statsCacheSet,
} = require('../utils/paymentV3');

// Reponse vide standardisee pour les onglets stats quand period=custom est
// fourni sans les 2 dates (tolerance UI : on ne casse pas avec un 400 le
// temps que l'utilisateur remplisse le date picker).
const EMPTY_PERFORMANCE = {
  en_ligne:   { gross_cents: 0, stripe_fee_cents: 0, platform_fee_cents: 0, net_cents: 0, count: 0, especes_cents: 0, carte_cents: 0 },
  caisse_rdv: { gross_cents: 0, stripe_fee_cents: 0, platform_fee_cents: 0, net_cents: 0, count: 0, especes_cents: 0, carte_cents: 0 },
  walkin:     { gross_cents: 0, stripe_fee_cents: 0, platform_fee_cents: 0, net_cents: 0, count: 0, especes_cents: 0, carte_cents: 0 },
  total:      { gross_cents: 0, total_fees_cents: 0, net_cents: 0, count: 0, vs_previous_period_pct: null },
  evolution_30j: [],
  period: null,
};
const EMPTY_RDV = {
  by_source: {
    online_booking: { count: 0, ca_cents: 0, by_payment_status: { stripe_100: 0, stripe_acompte: 0, not_paid: 0 } },
    phone_internal: { count: 0, ca_cents: 0, by_employee: {} },
  },
  by_status: {
    stripe_100:        { count: 0, total_cents: 0 },
    stripe_acompte:    { count: 0, total_cents: 0, remaining_cents: 0 },
    not_paid:          { count: 0, total_cents: 0 },
    cash_paid:         { count: 0, total_cents: 0 },
    refunded:          { count: 0, total_cents: 0 },
    no_show_retained:  { count: 0, total_cents: 0 },
  },
  by_employee: [],
  insight: { deposit_honor_rate_pct: null, no_deposit_honor_rate_pct: null, message_fr: "Pas de données sur cette période." },
  period: null,
};
const EMPTY_ONLINE = {
  summary: { gross_cents: 0, count: 0, stripe_fee_cents: 0, platform_fee_cents: 0, net_cents: 0, vs_previous_pct: null },
  by_status: {
    payouts_received: { count: 0, amount_cents: 0 },
    pending_payout:   { count: 0, amount_cents: 0 },
    refunded:         { count: 0, amount_cents: 0 },
    no_show_retained: { count: 0, amount_cents: 0 },
  },
  policy: { mode: 'manual', deposit_pct: null, cancellation_window_hours: null, payout_delay_days: null, commission_rate: 0 },
  business_impact: { no_show_reduction_pct: null, additional_revenue_cents: null },
  evolution_30j: [],
  period: null,
};

// ── GET /api/stats/performance ─────────────────────────────────────────────
// KPI brut/net par source pour l'onglet Performance.
router.get('/performance', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { period = 'month', date_from, date_to } = req.query;
    const range = resolvePeriodRange(period, date_from, date_to);
    if (range === null) return res.json(EMPTY_PERFORMANCE);

    const cacheKey = `performance:${period}:${range.from}:${range.to}`;
    const cached = statsCacheGet(userId, cacheKey);
    if (cached) return res.json(cached);

    const params = [userId, range.from, range.to];

    // Agreges par source v3 sur la periode courante
    const { rows: cur } = await pool.query(`
      SELECT
        ${EFFECTIVE_PAYMENT_SOURCE_SQL} AS src,
        COUNT(*)::int                                                   AS count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}), 0)::bigint          AS gross_cents,
        COALESCE(SUM(t.stripe_fee_cents), 0)::bigint                    AS stripe_fee_cents,
        COALESCE(SUM(t.platform_fee_cents), 0)::bigint                  AS platform_fee_cents,
        COALESCE(SUM(${EFFECTIVE_NET_CENTS_SQL}), 0)::bigint            AS net_cents,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (WHERE t.payment_method = 'cash'), 0)::bigint AS especes_cents,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (WHERE t.payment_method = 'card_local'), 0)::bigint AS carte_cents
      FROM transactions t
      WHERE t.user_id = $1
        AND t.type = 'revenue'
        AND t.deleted_at IS NULL
        AND t.date >= $2 AND t.date <= $3
      GROUP BY ${EFFECTIVE_PAYMENT_SOURCE_SQL}
    `, params);

    const empty = { gross_cents: 0, stripe_fee_cents: 0, platform_fee_cents: 0, net_cents: 0, count: 0, especes_cents: 0, carte_cents: 0 };
    const bySource = { online_booking: { ...empty }, cash_register_rdv: { ...empty }, walkin: { ...empty } };
    let totalGross = 0, totalFees = 0, totalNet = 0, totalCount = 0;
    for (const r of cur) {
      const src = r.src;
      const row = {
        gross_cents:        parseInt(r.gross_cents || 0, 10),
        stripe_fee_cents:   parseInt(r.stripe_fee_cents || 0, 10),
        platform_fee_cents: parseInt(r.platform_fee_cents || 0, 10),
        net_cents:          parseInt(r.net_cents || 0, 10),
        count:              r.count || 0,
        especes_cents:      parseInt(r.especes_cents || 0, 10),
        carte_cents:        parseInt(r.carte_cents || 0, 10),
      };
      if (bySource[src]) bySource[src] = row;
      totalGross += row.gross_cents;
      totalFees  += row.stripe_fee_cents + row.platform_fee_cents;
      totalNet   += row.net_cents;
      totalCount += row.count;
    }

    // vs previous period
    const { prevFrom, prevTo } = previousPeriodRange(range.from, range.to);
    const { rows: prevR } = await pool.query(`
      SELECT COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}), 0)::bigint AS gross_cents
      FROM transactions t
      WHERE t.user_id = $1
        AND t.type = 'revenue'
        AND t.deleted_at IS NULL
        AND t.date >= $2 AND t.date <= $3
    `, [userId, prevFrom, prevTo]);
    const prevGross = parseInt(prevR[0]?.gross_cents || 0, 10);
    const vsPrevPct = prevGross > 0
      ? Math.round(((totalGross - prevGross) / prevGross) * 1000) / 10
      : null;

    // Evolution 30 derniers jours (un point par jour)
    const { rows: evo } = await pool.query(`
      SELECT
        TO_CHAR(d.day, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'online_booking'), 0)::bigint    AS en_ligne_cents,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'cash_register_rdv'), 0)::bigint AS caisse_rdv_cents,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (WHERE ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'walkin'), 0)::bigint            AS walkin_cents
      FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS d(day)
      LEFT JOIN transactions t
        ON t.date = d.day::date
       AND t.user_id = $1
       AND t.type   = 'revenue'
       AND t.deleted_at IS NULL
      GROUP BY d.day
      ORDER BY d.day ASC
    `, [userId]);

    const payload = {
      en_ligne:   bySource.online_booking,
      caisse_rdv: bySource.cash_register_rdv,
      walkin:     bySource.walkin,
      total: {
        gross_cents:           totalGross,
        total_fees_cents:      totalFees,
        net_cents:             totalNet,
        count:                 totalCount,
        vs_previous_period_pct: vsPrevPct,
      },
      evolution_30j: evo.map(r => ({
        date: r.date,
        en_ligne_cents:    parseInt(r.en_ligne_cents || 0, 10),
        caisse_rdv_cents:  parseInt(r.caisse_rdv_cents || 0, 10),
        walkin_cents:      parseInt(r.walkin_cents || 0, 10),
      })),
      period: { from: range.from, to: range.to },
    };
    statsCacheSet(userId, cacheKey, payload);
    res.json(payload);
  } catch (e) {
    console.error('[STATS V3 PERFORMANCE]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/stats/rdv ─────────────────────────────────────────────────────
// Stats sur les RDV (pas walk-in). Source = appointments + transactions liees.
router.get('/rdv', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { period = 'month', date_from, date_to } = req.query;
    const range = resolvePeriodRange(period, date_from, date_to);
    if (range === null) return res.json(EMPTY_RDV);

    const cacheKey = `rdv:${period}:${range.from}:${range.to}`;
    const cached = statsCacheGet(userId, cacheKey);
    if (cached) return res.json(cached);

    // Resolution appointment_source v3 depuis legacy appointments.source.
    const APPT_SOURCE_SQL = `
      COALESCE(
        a.appointment_source,
        CASE
          WHEN a.stripe_payment_intent_id IS NOT NULL THEN 'online_booking'
          WHEN a.source IN ('public','online') THEN 'online_booking'
          ELSE 'phone_internal'
        END
      )
    `;
    const APPT_TOTAL_CENTS_SQL = `COALESCE(a.total_price_cents, ROUND(a.total_amount * 100)::INTEGER, 0)`;

    // by_source : count + ca par appointment_source v3
    const { rows: bySrcRows } = await pool.query(`
      SELECT
        ${APPT_SOURCE_SQL} AS appt_source,
        COUNT(*)::int      AS count,
        COALESCE(SUM(${APPT_TOTAL_CENTS_SQL}), 0)::bigint AS ca_cents
      FROM appointments a
      WHERE a.user_id = $1
        AND a.date >= $2 AND a.date <= $3
      GROUP BY ${APPT_SOURCE_SQL}
    `, [userId, range.from, range.to]);

    const bySource = {
      online_booking: { count: 0, ca_cents: 0, by_payment_status: { stripe_100: 0, stripe_acompte: 0, not_paid: 0 } },
      phone_internal: { count: 0, ca_cents: 0, by_employee: {} },
    };
    for (const r of bySrcRows) {
      if (bySource[r.appt_source]) {
        bySource[r.appt_source].count    = r.count || 0;
        bySource[r.appt_source].ca_cents = parseInt(r.ca_cents || 0, 10);
      }
    }

    // by_payment_status sur appointments online_booking : count of
    // STRIPE_100, STRIPE_ACOMPTE (depuis transactions liees), not_paid
    // (= aucune tx).
    const { rows: onlineStatusRows } = await pool.query(`
      WITH appt_online AS (
        SELECT a.id, a.user_id
          FROM appointments a
         WHERE a.user_id = $1
           AND a.date >= $2 AND a.date <= $3
           AND ${APPT_SOURCE_SQL} = 'online_booking'
      )
      SELECT
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM transactions t
           WHERE t.appointment_id = ao.id
             AND t.deleted_at IS NULL
             AND ${EFFECTIVE_PAYMENT_STATUS_SQL} = 'STRIPE_100'
        ))::int AS stripe_100,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM transactions t
           WHERE t.appointment_id = ao.id
             AND t.deleted_at IS NULL
             AND ${EFFECTIVE_PAYMENT_STATUS_SQL} = 'STRIPE_ACOMPTE'
        ))::int AS stripe_acompte,
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM transactions t
           WHERE t.appointment_id = ao.id
             AND t.deleted_at IS NULL
             AND ${EFFECTIVE_PAYMENT_STATUS_SQL} IN ('STRIPE_100','STRIPE_ACOMPTE','CASH_PAID')
        ))::int AS not_paid
      FROM appt_online ao
    `, [userId, range.from, range.to]);
    if (onlineStatusRows[0]) {
      bySource.online_booking.by_payment_status = {
        stripe_100:     onlineStatusRows[0].stripe_100 || 0,
        stripe_acompte: onlineStatusRows[0].stripe_acompte || 0,
        not_paid:       onlineStatusRows[0].not_paid || 0,
      };
    }

    // by_status : count + total per payment_status (sur transactions liees a un RDV)
    const { rows: byStatusRows } = await pool.query(`
      SELECT
        ${EFFECTIVE_PAYMENT_STATUS_SQL} AS pst,
        COUNT(*)::int AS count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}), 0)::bigint AS total_cents
      FROM transactions t
      JOIN appointments a ON a.id = t.appointment_id
      WHERE t.user_id = $1
        AND t.deleted_at IS NULL
        AND a.date >= $2 AND a.date <= $3
        AND t.appointment_id IS NOT NULL
      GROUP BY ${EFFECTIVE_PAYMENT_STATUS_SQL}
    `, [userId, range.from, range.to]);
    const byStatusEmpty = { count: 0, total_cents: 0 };
    const byStatus = {
      stripe_100:        { ...byStatusEmpty },
      stripe_acompte:    { ...byStatusEmpty, remaining_cents: 0 },
      not_paid:          { count: bySource.online_booking.by_payment_status.not_paid, total_cents: 0 },
      cash_paid:         { ...byStatusEmpty },
      refunded:          { ...byStatusEmpty },
      no_show_retained:  { ...byStatusEmpty },
    };
    const KEY_MAP = {
      STRIPE_100:       'stripe_100',
      STRIPE_ACOMPTE:   'stripe_acompte',
      NOT_PAID:         'not_paid',
      CASH_PAID:        'cash_paid',
      REFUNDED:         'refunded',
      NO_SHOW_RETAINED: 'no_show_retained',
    };
    for (const r of byStatusRows) {
      const k = KEY_MAP[r.pst];
      if (k) {
        byStatus[k].count        = r.count || 0;
        byStatus[k].total_cents  = parseInt(r.total_cents || 0, 10);
      }
    }
    // remaining_cents pour acomptes : somme(total_price - acompte) sur appointments
    // qui ont une transaction STRIPE_ACOMPTE.
    const { rows: remR } = await pool.query(`
      SELECT COALESCE(SUM(
        ${APPT_TOTAL_CENTS_SQL}
        - COALESCE((
            SELECT SUM(${EFFECTIVE_GROSS_CENTS_SQL})
              FROM transactions t
             WHERE t.appointment_id = a.id
               AND t.deleted_at IS NULL
               AND ${EFFECTIVE_PAYMENT_STATUS_SQL} = 'STRIPE_ACOMPTE'
          ), 0)
      ), 0)::bigint AS remaining_cents
      FROM appointments a
      WHERE a.user_id = $1
        AND a.date >= $2 AND a.date <= $3
        AND EXISTS (
          SELECT 1 FROM transactions t
           WHERE t.appointment_id = a.id
             AND t.deleted_at IS NULL
             AND ${EFFECTIVE_PAYMENT_STATUS_SQL} = 'STRIPE_ACOMPTE'
        )
    `, [userId, range.from, range.to]);
    byStatus.stripe_acompte.remaining_cents = parseInt(remR[0]?.remaining_cents || 0, 10);

    // by_employee
    const { rows: empR } = await pool.query(`
      SELECT
        a.employee_id,
        e.name,
        COUNT(*)::int AS rdv_count,
        COALESCE(SUM(${APPT_TOTAL_CENTS_SQL}), 0)::bigint AS ca_cents,
        COUNT(*) FILTER (WHERE ${APPT_SOURCE_SQL} = 'online_booking')::int AS en_ligne_count,
        COUNT(*) FILTER (WHERE ${APPT_SOURCE_SQL} = 'phone_internal')::int AS caisse_count
      FROM appointments a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.user_id = $1
        AND a.date >= $2 AND a.date <= $3
      GROUP BY a.employee_id, e.name
      ORDER BY ca_cents DESC NULLS LAST
    `, [userId, range.from, range.to]);

    // Insight : taux d'honneur acompte vs sans acompte sur la periode.
    // honored = appointment status='honored' OU paid=TRUE OU date < today.
    const { rows: insR } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE has_deposit AND honored)::int  AS dep_honored,
        COUNT(*) FILTER (WHERE has_deposit)::int              AS dep_total,
        COUNT(*) FILTER (WHERE NOT has_deposit AND honored)::int AS no_dep_honored,
        COUNT(*) FILTER (WHERE NOT has_deposit)::int          AS no_dep_total
      FROM (
        SELECT
          a.id,
          (a.status = 'honored' OR a.paid = TRUE OR (a.date < CURRENT_DATE AND a.status NOT IN ('cancelled','no_show'))) AS honored,
          EXISTS (
            SELECT 1 FROM transactions t
             WHERE t.appointment_id = a.id
               AND t.deleted_at IS NULL
               AND ${EFFECTIVE_PAYMENT_STATUS_SQL} IN ('STRIPE_100','STRIPE_ACOMPTE')
          ) AS has_deposit
        FROM appointments a
        WHERE a.user_id = $1
          AND a.date >= $2 AND a.date <= $3
      ) sub
    `, [userId, range.from, range.to]);
    const ins = insR[0] || {};
    const depRate    = ins.dep_total > 0    ? Math.round((ins.dep_honored    / ins.dep_total)    * 1000) / 10 : null;
    const noDepRate  = ins.no_dep_total > 0 ? Math.round((ins.no_dep_honored / ins.no_dep_total) * 1000) / 10 : null;
    let messageFr;
    if (depRate != null && noDepRate != null) {
      const delta = Math.round((depRate - noDepRate) * 10) / 10;
      messageFr = delta > 0
        ? `Les RDV avec acompte sont honores ${delta} points plus souvent (${depRate}% vs ${noDepRate}%).`
        : `Pas d'effet acompte significatif sur cette periode (${depRate}% vs ${noDepRate}%).`;
    } else {
      messageFr = `Pas assez de donnees pour mesurer l'effet acompte sur cette periode.`;
    }

    const payload = {
      by_source: bySource,
      by_status: byStatus,
      by_employee: empR.map(r => ({
        employee_id:    r.employee_id,
        name:           r.name || 'Sans employé',
        rdv_count:      r.rdv_count || 0,
        ca_cents:       parseInt(r.ca_cents || 0, 10),
        en_ligne_count: r.en_ligne_count || 0,
        caisse_count:   r.caisse_count || 0,
      })),
      insight: {
        deposit_honor_rate_pct:    depRate,
        no_deposit_honor_rate_pct: noDepRate,
        message_fr: messageFr,
      },
      period: { from: range.from, to: range.to },
    };
    statsCacheSet(userId, cacheKey, payload);
    res.json(payload);
  } catch (e) {
    console.error('[STATS V3 RDV]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/stats/online-payments ─────────────────────────────────────────
// Onglet Paiements en ligne.
router.get('/online-payments', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { period = 'month', date_from, date_to } = req.query;
    const range = resolvePeriodRange(period, date_from, date_to);
    if (range === null) return res.json(EMPTY_ONLINE);

    const cacheKey = `online-payments:${period}:${range.from}:${range.to}`;
    const cached = statsCacheGet(userId, cacheKey);
    if (cached) return res.json(cached);

    // Summary periode courante (online_booking uniquement, exclut REFUNDED
    // pour le brut "encaissé" — REFUNDED est compte separement).
    const { rows: sumR } = await pool.query(`
      SELECT
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}), 0)::bigint AS gross_cents,
        COUNT(*)::int AS count,
        COALESCE(SUM(t.stripe_fee_cents), 0)::bigint    AS stripe_fee_cents,
        COALESCE(SUM(t.platform_fee_cents), 0)::bigint  AS platform_fee_cents,
        COALESCE(SUM(${EFFECTIVE_NET_CENTS_SQL}), 0)::bigint AS net_cents
      FROM transactions t
      WHERE t.user_id = $1
        AND t.type = 'revenue'
        AND t.deleted_at IS NULL
        AND t.date >= $2 AND t.date <= $3
        AND ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'online_booking'
        AND ${EFFECTIVE_PAYMENT_STATUS_SQL} IN ('STRIPE_100','STRIPE_ACOMPTE')
    `, [userId, range.from, range.to]);
    const s = sumR[0] || {};

    const { prevFrom, prevTo } = previousPeriodRange(range.from, range.to);
    const { rows: prevR } = await pool.query(`
      SELECT COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}), 0)::bigint AS gross_cents
      FROM transactions t
      WHERE t.user_id = $1
        AND t.type = 'revenue'
        AND t.deleted_at IS NULL
        AND t.date >= $2 AND t.date <= $3
        AND ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'online_booking'
    `, [userId, prevFrom, prevTo]);
    const prevGross = parseInt(prevR[0]?.gross_cents || 0, 10);
    const curGross  = parseInt(s.gross_cents || 0, 10);
    const vsPrevPct = prevGross > 0
      ? Math.round(((curGross - prevGross) / prevGross) * 1000) / 10
      : null;

    // by_status pour les paiements en ligne sur la periode.
    // 2026-05-12 : payouts_received est decouple de transactions.payout_received_at
    // (qui depend du webhook payout.paid, peut etre NULL si webhook KO) et lit
    // directement la table `payouts` -- meme source que la page Reversement.
    // Garantit que Stats == Reversement, pas de contradiction UI possible.
    // Les autres KPI (pending/refunded/no_show) restent sur transactions car
    // ils dependent du payment_status v3, pas du payout Stripe.
    const { rows: stR } = await pool.query(`
      WITH paid_payouts AS (
        SELECT
          COUNT(*)::int                          AS count,
          COALESCE(SUM(amount_cents), 0)::bigint AS cents
        FROM payouts
        WHERE user_id = $1
          AND status = 'paid'
          AND COALESCE(completed_at, requested_at)::date BETWEEN $2 AND $3
      )
      SELECT
        (SELECT count FROM paid_payouts) AS payouts_received_count,
        (SELECT cents FROM paid_payouts) AS payouts_received_cents,
        COUNT(*) FILTER (WHERE t.payout_received_at IS NULL AND ${EFFECTIVE_PAYMENT_STATUS_SQL} IN ('STRIPE_100','STRIPE_ACOMPTE'))::int AS pending_payout_count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (WHERE t.payout_received_at IS NULL AND ${EFFECTIVE_PAYMENT_STATUS_SQL} IN ('STRIPE_100','STRIPE_ACOMPTE')), 0)::bigint AS pending_payout_cents,
        COUNT(*) FILTER (WHERE ${EFFECTIVE_PAYMENT_STATUS_SQL} = 'REFUNDED')::int                       AS refunded_count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (WHERE ${EFFECTIVE_PAYMENT_STATUS_SQL} = 'REFUNDED'), 0)::bigint AS refunded_cents,
        COUNT(*) FILTER (WHERE ${EFFECTIVE_PAYMENT_STATUS_SQL} = 'NO_SHOW_RETAINED')::int               AS no_show_retained_count,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}) FILTER (WHERE ${EFFECTIVE_PAYMENT_STATUS_SQL} = 'NO_SHOW_RETAINED'), 0)::bigint AS no_show_retained_cents
      FROM transactions t
      WHERE t.user_id = $1
        AND t.type = 'revenue'
        AND t.deleted_at IS NULL
        AND t.date >= $2 AND t.date <= $3
        AND ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'online_booking'
    `, [userId, range.from, range.to]);
    const st = stR[0] || {};

    // Policy : depuis booking_settings + users.payout_hold_days.
    // online_deposit_pct n'existe pas en BDD pour l'instant -> retourne null.
    let pol = {};
    try {
      const { rows: polR } = await pool.query(`
        SELECT
          u.payout_hold_days,
          u.commission_rate,
          bs.cancellation_policy_hours
        FROM users u
        LEFT JOIN booking_settings bs ON bs.user_id = u.id
        WHERE u.id = $1
      `, [userId]);
      pol = polR[0] || {};
    } catch (polErr) {
      console.warn('[STATS V3 ONLINE-PAYMENTS] policy query fail (non bloquant):', polErr.message);
    }

    // Business impact : taux de no-show vs RDV avec acompte. Estimation simple :
    // (no-show count baseline 8% Hair Coiff) - (no-show actuel) * gross moyen.
    // Sans baseline historique fiable, on retourne null pour ne pas mentir.
    const businessImpact = {
      no_show_reduction_pct: null,
      additional_revenue_cents: null,
    };

    // Evolution 30j sur paiements online uniquement.
    const { rows: evo } = await pool.query(`
      SELECT
        TO_CHAR(d.day, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(${EFFECTIVE_GROSS_CENTS_SQL}), 0)::bigint AS amount_cents,
        COUNT(t.id) FILTER (WHERE t.id IS NOT NULL)::int      AS count
      FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS d(day)
      LEFT JOIN transactions t
        ON t.date = d.day::date
       AND t.user_id = $1
       AND t.type   = 'revenue'
       AND t.deleted_at IS NULL
       AND ${EFFECTIVE_PAYMENT_SOURCE_SQL} = 'online_booking'
       AND ${EFFECTIVE_PAYMENT_STATUS_SQL} IN ('STRIPE_100','STRIPE_ACOMPTE')
      GROUP BY d.day
      ORDER BY d.day ASC
    `, [userId]);

    const legacyPayload = {
      summary: {
        gross_cents:        curGross,
        count:              s.count || 0,
        stripe_fee_cents:   parseInt(s.stripe_fee_cents || 0, 10),
        platform_fee_cents: parseInt(s.platform_fee_cents || 0, 10),
        net_cents:          parseInt(s.net_cents || 0, 10),
        vs_previous_pct:    vsPrevPct,
      },
      by_status: {
        payouts_received: { count: st.payouts_received_count || 0, amount_cents: parseInt(st.payouts_received_cents || 0, 10) },
        pending_payout:   { count: st.pending_payout_count   || 0, amount_cents: parseInt(st.pending_payout_cents   || 0, 10) },
        refunded:         { count: st.refunded_count         || 0, amount_cents: parseInt(st.refunded_cents         || 0, 10) },
        no_show_retained: { count: st.no_show_retained_count || 0, amount_cents: parseInt(st.no_show_retained_cents || 0, 10) },
      },
      policy: {
        mode:                       'manual',
        deposit_pct:                null,
        cancellation_window_hours:  pol.cancellation_policy_hours != null ? parseInt(pol.cancellation_policy_hours, 10) : null,
        payout_delay_days:          pol.payout_hold_days != null ? parseInt(pol.payout_hold_days, 10) : null,
        commission_rate:            pol.commission_rate != null ? parseFloat(pol.commission_rate) : 0,
      },
      business_impact: businessImpact,
      evolution_30j: evo.map(r => ({
        date: r.date,
        amount_cents: parseInt(r.amount_cents || 0, 10),
        count: r.count || 0,
      })),
      period: { from: range.from, to: range.to },
    };

    // ── PHASE 4.6 LEDGER DUAL-READ ──────────────────────────────────────
    // Compare summary financiers + by_status.refunded. Le reste (by_status
    // payouts_received/pending_payout/no_show_retained, policy, evolution,
    // vs_previous_pct) reste legacy car le ledger ne couvre pas ces fields
    // (no-show retained = appointments.cancelled_by, payouts_received =
    // transactions.payout_received_at, evolution_30j = serie temporelle).
    const { dualRead, isDebugVisible } = require('../utils/dualRead');
    const { getOnlineSummaryByDateFromLedger } = require('../utils/ledgerReader');
    const debugVisible = await isDebugVisible(req, userId);
    const legacyFn = async () => legacyPayload;
    const ledgerFn = async (legacy) => {
      const led = await getOnlineSummaryByDateFromLedger(pool, userId, range.from, range.to);
      return {
        ...legacy,
        summary: {
          ...legacy.summary,
          gross_cents:        led.gross_cents,
          count:              led.count,
          stripe_fee_cents:   led.stripe_fee_cents,
          platform_fee_cents: led.platform_fee_cents,
          net_cents:          led.net_cents,
        },
        by_status: {
          ...legacy.by_status,
          refunded: { count: led.refunded_count, amount_cents: led.refunded_cents },
        },
      };
    };
    const payload = await dualRead({
      userId,
      label:    'stats-online-payments',
      flagName: 'ledger_read_performance',  // reutilise le meme flag que /performance-stats
      legacyFn,
      ledgerFn,
      tolerance: 0,
      fields:   ['summary.gross_cents', 'summary.count',
                 'summary.stripe_fee_cents', 'summary.platform_fee_cents',
                 'summary.net_cents',
                 'by_status.refunded.amount_cents', 'by_status.refunded.count'],
      debugVisible,
    });
    statsCacheSet(userId, cacheKey, payload);
    res.json(payload);
  } catch (e) {
    console.error('[STATS V3 ONLINE-PAYMENTS]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;