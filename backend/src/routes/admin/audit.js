// routes/admin/audit.js — Lecture de admin_audit_log (commit #6 admin).
// Read-only. Aucune route d'écriture / update / delete : la table est
// volontairement immuable côté API.

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');

const router = express.Router();
router.use(adminAuth);

// ── GET / — liste paginée avec filtres ───────────────────────────────────────
router.get('/', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
  const offset = Math.max(parseInt(req.query.offset) || 0,    0);

  const action     = String(req.query.action     || '').trim();
  const adminId    = String(req.query.adminId    || '').trim();
  const targetType = String(req.query.targetType || '').trim();
  const status     = String(req.query.status     || '').trim();
  const search     = String(req.query.search     || '').trim();
  const since      = String(req.query.since      || '').trim();
  const until      = String(req.query.until      || '').trim();

  const where = [];
  const params = [];

  if (action)     { params.push(`%${action.toLowerCase()}%`); where.push(`LOWER(action) LIKE $${params.length}`); }
  if (adminId)    { params.push(adminId);                     where.push(`admin_id = $${params.length}`); }
  if (targetType) { params.push(targetType);                  where.push(`target_type = $${params.length}`); }
  if (status === 'success' || status === 'failure') {
    params.push(status); where.push(`status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(LOWER(COALESCE(admin_email,'')) LIKE $${params.length}
              OR LOWER(COALESCE(error_message,'')) LIKE $${params.length}
              OR LOWER(COALESCE(ip_address,'')) LIKE $${params.length})`);
  }
  if (since) { params.push(since); where.push(`created_at >= $${params.length}`); }
  if (until) { params.push(until); where.push(`created_at <= $${params.length}`); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const { rows: total } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM admin_audit_log ${whereSql}`,
      params
    );

    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT id, admin_id, admin_email, action, target_type, target_id,
              status, error_message, ip_address, user_agent,
              payload_before, payload_after, created_at
         FROM admin_audit_log
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ total: total[0].n, limit, offset, rows });
  } catch (e) {
    console.error('[admin/audit list]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /actions — distinct actions disponibles (pour filtre frontend) ───────
router.get('/actions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT action FROM admin_audit_log ORDER BY action`
    );
    return res.json({ actions: rows.map(r => r.action) });
  } catch (e) {
    console.error('[admin/audit actions]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
