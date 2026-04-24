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
    const conditions = ['t.user_id = $1', "t.type = 'revenue'"];
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
      WHERE user_id=$1 AND date=$2
    `, [userId, today]);

    // Top employé du jour
    const { rows: topEmp } = await pool.query(`
      SELECT e.name, e.avatar_color,
             SUM(t.amount) AS ca,
             COUNT(t.id)   AS nb
      FROM transactions t
      JOIN employees e ON e.id = t.employee_id
      WHERE t.user_id=$1 AND t.date=$2 AND t.type='revenue'
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
// la page Statistiques. Les 5 méthodes renvoyées correspondent aux cards
// pastel définies dans INVENTAIRE §14 : cash / card / transfer / other / multi.
// Le payment_method `check` (historique, whitelisté en back) est agrégé dans
// `other` pour rester aligné sur l'UI (5 cards, pas 6). Cache 2 min.
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

    const { rows } = await pool.query(
      `SELECT payment_method,
              COALESCE(SUM(amount), 0)::numeric AS amount,
              COUNT(*)                          AS count
         FROM transactions
        WHERE user_id=$1 AND type='revenue'
          AND date BETWEEN $2 AND $3
        GROUP BY payment_method`,
      [userId, from, to]
    );

    const EMPTY = { amount: 0, count: 0 };
    const by_method = {
      cash:     { ...EMPTY },
      card:     { ...EMPTY },
      transfer: { ...EMPTY },
      other:    { ...EMPTY },
      multi:    { ...EMPTY },
    };
    let total = 0;
    for (const r of rows) {
      const amt = parseFloat(r.amount) || 0;
      const cnt = parseInt(r.count, 10) || 0;
      total += amt;
      // `check` (whitelisté historique) agrégé dans `other` pour matcher l'UI 5 cards.
      const key = (r.payment_method === 'check') ? 'other' : r.payment_method;
      if (by_method[key]) {
        by_method[key].amount += amt;
        by_method[key].count  += cnt;
      } else {
        by_method.other.amount += amt;
        by_method.other.count  += cnt;
      }
    }
    // Arrondir 2 décimales à la sortie (flottants JS).
    for (const k of Object.keys(by_method)) {
      by_method[k].amount = Math.round(by_method[k].amount * 100) / 100;
    }
    total = Math.round(total * 100) / 100;

    const result = { period, from, to, by_method, total };
    global.memCache?.set(_k, result, 2 * 60 * 1000); // cache 2 min
    res.json(result);
  } catch (e) {
    console.error('[STATS BY-PM]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;