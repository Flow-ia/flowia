// routes/commissions.js  ─  Feature 6 : Commissions employés
const express  = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { requireFeature } = require('../middleware/requireFeature');
const { pinAdminMiddleware } = require('../middleware/pinAdmin');
const router   = express.Router();
router.use(authMiddleware);
router.use(requireFeature('commissions'));

// ── GET /api/commissions?from=&to= ───────────────────────────────────────────
// Calcule les commissions dues par employé sur la période
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromD = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const toD   = to   || new Date().toISOString().split('T')[0];

    // Revenus par employé avec taux de commission
    const { rows } = await pool.query(
      `SELECT
         e.id as employee_id, e.name as employee_name, e.avatar_color,
         e.commission_pct as default_pct,
         COALESCE(SUM(t.amount), 0) as total_revenue,
         COUNT(t.id) as tx_count,
         COALESCE(SUM(t.qty_total), 0) as total_qty,
         COALESCE(SUM(t.amount * COALESCE(e.commission_pct,0) / 100), 0) as commission_due
       FROM employees e
       LEFT JOIN transactions t ON t.employee_id=e.id
         AND t.user_id=$1 AND t.type='revenue'
         AND t.deleted_at IS NULL
         AND t.date BETWEEN $2 AND $3
         -- Exclut les remboursements : la row 'rdv_refund' (type='revenue',
         -- montant POSITIF par design) ET la vente d'origine passee
         -- REFUNDED. Sinon l'employe touchait une commission sur des
         -- prestations remboursees (sur-paiement). payment_status NULL
         -- (caisse) reste compte (IS DISTINCT FROM).
         AND t.source IS DISTINCT FROM 'rdv_refund'
         AND t.payment_status IS DISTINCT FROM 'REFUNDED'
       WHERE e.user_id=$1 AND e.is_active=TRUE
       GROUP BY e.id, e.name, e.avatar_color, e.commission_pct
       ORDER BY commission_due DESC`,
      [req.user.userId, fromD, toD]
    );
    res.json({ from: fromD, to: toD, employees: rows });
  } catch(e) { console.error('[COMM GET]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/commissions/settings ── taux de commission par employé ──────────
router.get('/settings', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, avatar_color, commission_pct FROM employees WHERE user_id=$1 AND is_active=TRUE ORDER BY name`,
      [req.user.userId]
    );
    res.json(rows);
  } catch(e) { console.error('[COMM SETTINGS GET]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── PUT /api/commissions/settings/:employeeId ────────────────────────────────
// AUDIT RH #1 : pinAdmin requis. Avant, un utilisateur avec juste le JWT
// merchant (device partagé, XSS) pouvait pousser commission_pct=100 sur
// n'importe quel employé → vol financier direct.
// + validation typeof number (avant : "50"/null/objets acceptés silencieusement).
router.put('/settings/:employeeId', pinAdminMiddleware, async (req, res) => {
  try {
    const { commission_pct } = req.body;
    const pct = Number(commission_pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100)
      return res.status(400).json({ error: 'Taux invalide (0-100).' });
    const { rows } = await pool.query(
      `UPDATE employees SET commission_pct=$1 WHERE id=$2 AND user_id=$3 RETURNING id, name, commission_pct`,
      [pct, req.params.employeeId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employé introuvable.' });
    res.json(rows[0]);
  } catch(e) { console.error('[COMM PUT]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;
