// src/routes/global-clients/appointments.js — GET /appointments (multi-commerces)
const { pool } = require('../../db');
const { globalClientAuth } = require('./helpers');

module.exports = function attachAppointmentsRoutes(router) {
  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/global-clients/appointments — tous les RDV multi-commerces
  // ─────────────────────────────────────────────────────────────────────────────
  router.get('/appointments', globalClientAuth, async (req, res) => {
    try {
      const gcId = req.globalClient.globalClientId;
      const { rows: gc } = await pool.query('SELECT email FROM global_clients WHERE id=$1', [gcId]);
      if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });
      const email = gc[0].email;

      const { rows } = await pool.query(
        `SELECT
           a.id, a.date, a.start_time, a.end_time, a.status,
           a.notes, a.total_amount, a.total_duration,
           bs.name AS service_name, e.name AS employee_name,
           biz.business_name, biz.slug
         FROM appointments a
         LEFT JOIN booking_services bs ON bs.id=a.service_id
         LEFT JOIN employees e ON e.id=a.employee_id
         LEFT JOIN booking_settings biz ON biz.user_id=a.user_id
         WHERE LOWER(a.client_email)=LOWER($1)
         ORDER BY a.date DESC, a.start_time DESC
         LIMIT 50`,
        [email]
      );
      res.json(rows);
    } catch(e) { console.error('[gc]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
