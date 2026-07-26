// src/routes/booking/employee-slots.js — Plages horaires multiples par employé
const { pool } = require('../../db');

// Validation d'une plage : jour 0-6, heures HH:MM (ou HH:MM:SS), début < fin.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
function normalizeSlot(s) {
  const day = Number(s?.day_of_week);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  const start = String(s?.slot_start || '').substring(0, 5);
  const end   = String(s?.slot_end   || '').substring(0, 5);
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return null;
  if (start >= end) return null;
  return { day_of_week: day, slot_start: start, slot_end: end };
}

module.exports = function attachEmployeeSlotsRoutes(router) {
  // ══════════════════════════════════════════════════════════════════════════════
  // PLAGES HORAIRES MULTIPLES PAR EMPLOYÉ
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/booking/employee-slots — TOUTES les plages du commerçant + horaires
  // legacy personnalisés (use_business_hours=FALSE). Permet au front d'afficher
  // le statut réel de chaque employé sans N requêtes ni ouverture d'accordéon.
  router.get('/employee-slots', async (req, res) => {
    try {
      const [slotsR, legacyR] = await Promise.all([
        pool.query(
          `SELECT employee_id, day_of_week, slot_start, slot_end
           FROM employee_time_slots WHERE user_id=$1
           ORDER BY employee_id, day_of_week, slot_start`,
          [req.user.userId]
        ),
        pool.query(
          `SELECT employee_id, day_of_week, open_time, close_time, is_open,
                  COALESCE(use_business_hours, TRUE) AS use_business_hours
           FROM employee_hours
           WHERE user_id=$1 AND COALESCE(use_business_hours, TRUE)=FALSE
           ORDER BY employee_id, day_of_week`,
          [req.user.userId]
        ),
      ]);
      res.json({ slots: slotsR.rows, legacy: legacyR.rows });
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // GET /api/booking/employee-slots/:employee_id
  router.get('/employee-slots/:employee_id', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM employee_time_slots WHERE employee_id=$1 AND user_id=$2 ORDER BY day_of_week, slot_start',
        [req.params.employee_id, req.user.userId]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // POST /api/booking/employee-slots — remplace toutes les plages d'un employé.
  // Atomique : DELETE + INSERT dans une transaction. Un échec en cours de route
  // ne doit jamais laisser l'employé sans plages (ROLLBACK). Validation stricte
  // côté serveur : une plage invalide rejette TOUT le lot en 400 (pas de skip
  // silencieux qui ferait "disparaître" une plage sauvegardée côté front).
  router.post('/employee-slots', async (req, res) => {
    const client = await pool.connect();
    try {
      const { employee_id, slots } = req.body;
      if (!employee_id || !Array.isArray(slots))
        return res.status(400).json({ error: 'employee_id et slots[] requis.' });

      const normalized = [];
      for (const s of slots) {
        const n = normalizeSlot(s);
        if (!n) {
          return res.status(400).json({
            error: 'Plage invalide (jour 0-6, format HH:MM, début avant fin requis).',
          });
        }
        normalized.push(n);
      }

      // Vérifier ownership
      const { rows: emp } = await client.query(
        'SELECT id FROM employees WHERE id=$1 AND user_id=$2',
        [employee_id, req.user.userId]
      );
      if (!emp.length) return res.status(403).json({ error: 'Employé introuvable.' });

      await client.query('BEGIN');
      await client.query(
        'DELETE FROM employee_time_slots WHERE employee_id=$1 AND user_id=$2',
        [employee_id, req.user.userId]
      );
      for (const s of normalized) {
        await client.query(
          `INSERT INTO employee_time_slots (employee_id, user_id, day_of_week, slot_start, slot_end)
           VALUES ($1,$2,$3,$4,$5)`,
          [employee_id, req.user.userId, s.day_of_week, s.slot_start, s.slot_end]
        );
      }
      await client.query('COMMIT');

      const { rows } = await pool.query(
        'SELECT * FROM employee_time_slots WHERE employee_id=$1 AND user_id=$2 ORDER BY day_of_week, slot_start',
        [employee_id, req.user.userId]
      );
      res.json(rows);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[EMP-SLOTS POST]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    } finally {
      client.release();
    }
  });

  // DELETE /api/booking/employee-slots/:employee_id — supprime toutes les plages
  router.delete('/employee-slots/:employee_id', async (req, res) => {
    try {
      await pool.query(
        'DELETE FROM employee_time_slots WHERE employee_id=$1 AND user_id=$2',
        [req.params.employee_id, req.user.userId]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
