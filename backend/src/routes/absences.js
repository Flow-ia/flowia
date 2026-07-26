// routes/absences.js — Absences / congés employés
const express  = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router   = express.Router();
router.use(authMiddleware);

const VALID_TYPES = ['conges','maladie','formation','autre','accident_travail','maternite','paternite','sans_solde'];
// Format ISO date strict (YYYY-MM-DD) — avant, "2026-13-40" remontait
// jusqu'à PG avec un message d'erreur cryptique (et fuite via e.message).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Absence partielle : fenêtre horaire optionnelle (les DEUX heures ou aucune).
// NULL/NULL = journée entière. La fenêtre s'applique à chaque jour de la
// période start_date→end_date (ex : "de 10:00 à 14:00 du 3 au 7 août").
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
function validateTimeWindow(start_time, end_time) {
  const has = v => v !== undefined && v !== null && v !== '';
  if (!has(start_time) && !has(end_time)) return { ok: true, start: null, end: null };
  if (!has(start_time) || !has(end_time))
    return { ok: false, error: "Heure de début ET de fin requises pour une absence partielle (ou aucune pour la journée entière)." };
  const s = String(start_time).substring(0, 5);
  const e = String(end_time).substring(0, 5);
  if (!TIME_RE.test(s) || !TIME_RE.test(e))
    return { ok: false, error: 'Format horaire invalide (HH:MM).' };
  if (s >= e)
    return { ok: false, error: "L'heure de début doit précéder l'heure de fin." };
  return { ok: true, start: s, end: e };
}

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
  } catch(e) { console.error('[ABS GET]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/absences/stats — statistiques sur une période ────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { from, to, employee_id } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from et to requis.' });
    if (!isValidDate(from) || !isValidDate(to))
      return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD).' });

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
  } catch(e) { console.error('[ABS STATS]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── POST /api/absences — créer une absence ────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { employee_id, start_date, end_date, type, label, reason, start_time, end_time } = req.body;

    // Validation obligatoire
    if (!employee_id) return res.status(400).json({ error: 'Employé obligatoire.' });
    if (!start_date)  return res.status(400).json({ error: 'Date de début obligatoire.' });
    if (!end_date)    return res.status(400).json({ error: 'Date de fin obligatoire.' });
    if (!isValidDate(start_date) || !isValidDate(end_date))
      return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD).' });
    if (new Date(end_date) < new Date(start_date))
      return res.status(400).json({ error: 'La date de fin doit être égale ou postérieure à la date de début.' });
    if (!VALID_TYPES.includes(type))
      return res.status(400).json({ error: `Type invalide. Types valides: ${VALID_TYPES.join(', ')}` });
    const win = validateTimeWindow(start_time, end_time);
    if (!win.ok) return res.status(400).json({ error: win.error });

    // Vérifier ownership employé
    const { rows: empCheck } = await pool.query(
      'SELECT id FROM employees WHERE id=$1 AND user_id=$2', [employee_id, req.user.userId]);
    if (!empCheck.length) return res.status(403).json({ error: 'Employé introuvable.' });

    const { rows } = await pool.query(
      `INSERT INTO employee_absences (employee_id, user_id, start_date, end_date, type, label, reason, start_time, end_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [employee_id, req.user.userId, start_date, end_date, type, label||null, reason||null, win.start, win.end]
    );
    res.status(201).json({ ...rows[0], days: countDays(start_date, end_date) });
  } catch(e) { console.error('[ABS POST]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── PUT /api/absences/:id — modifier une absence ──────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { start_date, end_date, type, label, reason, start_time, end_time } = req.body;

    if (!start_date) return res.status(400).json({ error: 'Date de début obligatoire.' });
    if (!end_date)   return res.status(400).json({ error: 'Date de fin obligatoire.' });
    if (!isValidDate(start_date) || !isValidDate(end_date))
      return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD).' });
    if (new Date(end_date) < new Date(start_date))
      return res.status(400).json({ error: 'La date de fin doit être égale ou postérieure à la date de début.' });
    if (type && !VALID_TYPES.includes(type))
      return res.status(400).json({ error: 'Type invalide.' });
    const win = validateTimeWindow(start_time, end_time);
    if (!win.ok) return res.status(400).json({ error: win.error });

    // COALESCE($3, type) : si le client ne renvoie pas `type`, on conserve
    // la valeur existante. Avant, `type||'conges'` écrasait silencieusement
    // un arrêt maladie en congés si l'UI ne renvoyait pas le champ.
    // start_time/end_time : écrasés à chaque PUT (NULL = journée entière),
    // comme label/reason — le formulaire renvoie toujours l'état complet.
    const { rows } = await pool.query(
      `UPDATE employee_absences
          SET start_date  = $1,
              end_date    = $2,
              type        = COALESCE($3, type),
              label       = $4,
              reason      = $5,
              start_time  = $6,
              end_time    = $7,
              updated_at  = NOW(),
              cancelled_at = NULL,
              cancelled_reason = NULL
        WHERE id = $8 AND user_id = $9
        RETURNING *`,
      [start_date, end_date, type || null, label||null, reason||null, win.start, win.end, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Absence introuvable.' });
    res.json({ ...rows[0], days: countDays(rows[0].start_date, rows[0].end_date) });
  } catch(e) { console.error('[ABS PUT]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
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
  } catch(e) { console.error('[ABS CANCEL]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── DELETE /api/absences/:id — suppression définitive ────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM employee_absences WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]);
    if (!rowCount) return res.status(404).json({ error: 'Absence introuvable.' });
    res.json({ ok: true });
  } catch(e) { console.error('[ABS DEL]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;
