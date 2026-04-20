// src/routes/booking/employee-slots.js — Plages horaires multiples par employé
const { pool } = require('../../db');

module.exports = function attachEmployeeSlotsRoutes(router) {
  // ══════════════════════════════════════════════════════════════════════════════
  // PLAGES HORAIRES MULTIPLES PAR EMPLOYÉ
  // ══════════════════════════════════════════════════════════════════════════════

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

  // POST /api/booking/employee-slots — remplace toutes les plages d'un employé
  router.post('/employee-slots', async (req, res) => {
    try {
      const { employee_id, slots } = req.body;
      if (!employee_id || !Array.isArray(slots))
        return res.status(400).json({ error: 'employee_id et slots[] requis.' });

      // Vérifier ownership
      const { rows: emp } = await pool.query(
        'SELECT id FROM employees WHERE id=$1 AND user_id=$2',
        [employee_id, req.user.userId]
      );
      if (!emp.length) return res.status(403).json({ error: 'Employé introuvable.' });

      await pool.query(
        'DELETE FROM employee_time_slots WHERE employee_id=$1 AND user_id=$2',
        [employee_id, req.user.userId]
      );

      for (const s of slots) {
        if (s.slot_start >= s.slot_end) continue;
        await pool.query(
          `INSERT INTO employee_time_slots (employee_id, user_id, day_of_week, slot_start, slot_end)
           VALUES ($1,$2,$3,$4,$5)`,
          [employee_id, req.user.userId, s.day_of_week, s.slot_start, s.slot_end]
        );
      }

      const { rows } = await pool.query(
        'SELECT * FROM employee_time_slots WHERE employee_id=$1 AND user_id=$2 ORDER BY day_of_week, slot_start',
        [employee_id, req.user.userId]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
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
