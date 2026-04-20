// src/routes/booking/availability.js — Disponibilités ponctuelles employé
const { pool } = require('../../db');

module.exports = function attachAvailabilityRoutes(router) {
  // ══════════════════════════════════════════════════════════
  // DISPONIBILITÉS EMPLOYÉ
  // ══════════════════════════════════════════════════════════

  router.get('/availability/:employee_id', async (req, res) => {
    try {
      const { from, to } = req.query;
      const { rows } = await pool.query(
        `SELECT * FROM employee_availability WHERE employee_id=$1 AND user_id=$2
         AND date>=$3 AND date<=$4`,
        [req.params.employee_id, req.user.userId, from || new Date().toISOString().split('T')[0],
         to || new Date(Date.now() + 90*24*3600*1000).toISOString().split('T')[0]]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  router.post('/availability', async (req, res) => {
    try {
      const { employee_id, date, is_available, note } = req.body;
      await pool.query(
        `INSERT INTO employee_availability (employee_id, user_id, date, is_available, note)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (employee_id, date) DO UPDATE SET is_available=$4, note=$5`,
        [employee_id, req.user.userId, date, is_available !== false, note || null]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
