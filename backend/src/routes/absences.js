// routes/absences.js — Absences / congés employés
const express  = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router   = express.Router();
router.use(authMiddleware);

const VALID_TYPES = ['conges','maladie','formation','autre','accident_travail','maternite','paternite','sans_solde'];

// Calcule le nombre de jours calendaires inclusifs entre deux dates
function countDays(start, end) {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end   + 'T12:00:00');
  return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
}

// ── GET /api/absences — liste avec filtres ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { from, to, employee_id, include_cancelled } = req.query;
    let q = `
      SELECT a.*,
             e.name        AS employee_name,
             e.avatar_color,
             e.role        AS employee_role
      FROM employee_absences a
      JOIN employees e ON e.id = a.employee_id
      WHERE a.user_id = $1`;
    const params = [req.user.userId];

    if (from) { params.push(from); q += ` AND a.end_date >= $${params.length}`; }
    if (to)   { params.push(to);   q += ` AND a.start_date <= $${params.length}`; }
    if (employee_id) { params.push(employee_id); q += ` AND a.employee_id = $${params.length}`; }
    if (!include_cancelled || include_cancelled === 'false') {
      q += ` AND a.cancelled_at IS NULL`;
    }
    q += ' ORDER BY a.start_date DESC, a.created_at DESC';

    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/absences/stats — statistiques sur une période ────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { from, to, employee_id } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from et to requis.' });

    let q = `
      SELECT
        a.employee_id,
        e.name        AS employee_name,
        e.avatar_color,
        a.type,
        COUNT(*)      AS count,
        SUM(
          (LEAST(a.end_date, $3::date) - GREATEST(a.start_date, $2::date))::int + 1
        )             AS total_days
      FROM employee_absences a
      JOIN employees e ON e.id = a.employee_id
      WHERE a.user_id = $1
        AND a.end_date   >= $2::date
        AND a.start_date <= $3::date
        AND a.cancelled_at IS NULL`;
    const params = [req.user.userId, from, to];

    if (employee_id) { params.push(employee_id); q += ` AND a.employee_id = $${params.length}`; }
    q += ` GROUP BY a.employee_id, e.name, e.avatar_color, a.type ORDER BY e.name, a.type`;

    const { rows } = await pool.query(q, params);

    // Regrouper par employé
    const byEmployee = {};
    for (const r of rows) {
      if (!byEmployee[r.employee_id]) {
        byEmployee[r.employee_id] = { employee_id: r.employee_id, employee_name: r.employee_name, avatar_color: r.avatar_color, total_absences: 0, total_days: 0, by_type: {} };
      }
      const cnt  = parseInt(r.count);
      const days = parseInt(r.total_days);
      byEmployee[r.employee_id].total_absences += cnt;
      byEmployee[r.employee_id].total_days     += days;
      byEmployee[r.employee_id].by_type[r.type] = { count: cnt, days };
    }
    res.json({ period: { from, to }, employees: Object.values(byEmployee) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/absences — créer une absence ────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { employee_id, start_date, end_date, type, label, reason } = req.body;

    // Validation obligatoire
    if (!employee_id) return res.status(400).json({ error: 'Employé obligatoire.' });
    if (!start_date)  return res.status(400).json({ error: 'Date de début obligatoire.' });
    if (!end_date)    return res.status(400).json({ error: 'Date de fin obligatoire.' });
    if (new Date(end_date) < new Date(start_date))
      return res.status(400).json({ error: 'La date de fin doit être égale ou postérieure à la date de début.' });
    if (!VALID_TYPES.includes(type))
      return res.status(400).json({ error: `Type invalide. Types valides: ${VALID_TYPES.join(', ')}` });

    // Vérifier ownership employé
    const { rows: empCheck } = await pool.query(
      'SELECT id FROM employees WHERE id=$1 AND user_id=$2', [employee_id, req.user.userId]);
    if (!empCheck.length) return res.status(403).json({ error: 'Employé introuvable.' });

    const { rows } = await pool.query(
      `INSERT INTO employee_absences (employee_id, user_id, start_date, end_date, type, label, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [employee_id, req.user.userId, start_date, end_date, type, label||null, reason||null]
    );
    res.status(201).json({ ...rows[0], days: countDays(start_date, end_date) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/absences/:id — modifier une absence ──────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { start_date, end_date, type, label, reason } = req.body;

    if (!start_date) return res.status(400).json({ error: 'Date de début obligatoire.' });
    if (!end_date)   return res.status(400).json({ error: 'Date de fin obligatoire.' });
    if (new Date(end_date) < new Date(start_date))
      return res.status(400).json({ error: 'La date de fin doit être égale ou postérieure à la date de début.' });
    if (type && !VALID_TYPES.includes(type))
      return res.status(400).json({ error: 'Type invalide.' });

    const { rows } = await pool.query(
      `UPDATE employee_absences
          SET start_date  = $1,
              end_date    = $2,
              type        = $3,
              label       = $4,
              reason      = $5,
              updated_at  = NOW(),
              cancelled_at = NULL,
              cancelled_reason = NULL
        WHERE id = $6 AND user_id = $7
        RETURNING *`,
      [start_date, end_date, type||'conges', label||null, reason||null, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Absence introuvable.' });
    res.json({ ...rows[0], days: countDays(rows[0].start_date, rows[0].end_date) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/absences/:id/cancel — annuler une absence (garde historique) ───
router.patch('/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const { rows } = await pool.query(
      `UPDATE employee_absences
          SET cancelled_at     = NOW(),
              cancelled_reason = $1,
              updated_at       = NOW()
        WHERE id = $2 AND user_id = $3
        RETURNING *`,
      [reason||null, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Absence introuvable.' });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/absences/:id — suppression définitive ────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM employee_absences WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]);
    if (!rowCount) return res.status(404).json({ error: 'Absence introuvable.' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
