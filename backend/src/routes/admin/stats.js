// routes/admin/stats.js — Statistiques globales pour le dashboard admin (#5).
// 5 requêtes parallèles, agrégats sur fenêtres temporelles (today, this_week,
// this_month, total). Aucune mutation.

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');

const router = express.Router();
router.use(adminAuth);

router.get('/', async (req, res) => {
  try {
    const [merchants, clients, appointments, revenue, top] = await Promise.all([
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
    ]);

    return res.json({
      merchants:    merchants.rows[0],
      clients:      clients.rows[0],
      appointments: appointments.rows[0],
      revenue:      revenue.rows[0],
      top_merchants: top.rows,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[admin/stats]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
