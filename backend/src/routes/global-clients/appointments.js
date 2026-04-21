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

      // Champs alignés sur /pub/:slug/client/appointments pour que le
      // frontend puisse réutiliser exactement la même carte + action
      // "Annuler" (qui a besoin du slug). `slug` + `business_name` +
      // u.business_name (table users) ajoutés pour afficher le commerçant
      // sur chaque ligne. Statut : TOUS (upcoming / completed / cancelled
      // / no_show) — filtrage côté UI via getDisplayStatus.
      const { rows } = await pool.query(
        `SELECT a.id, a.status, a.notes, a.paid, a.paid_method,
                a.client_name, a.client_email, a.client_phone, a.cancel_reason,
                a.discount_amount, a.service_id, a.employee_id, a.client_id,
                TO_CHAR(a.date,       'YYYY-MM-DD') AS date,
                TO_CHAR(a.start_time, 'HH24:MI')    AS start_time,
                TO_CHAR(a.end_time,   'HH24:MI')    AS end_time,
                a.duration_minutes, a.created_at, a.updated_at,
                a.total_amount, a.total_duration,
                bs.name  AS service_name,
                bs.color AS service_color,
                bs.price AS service_price,
                e.name   AS employee_name,
                biz.slug AS slug,
                u.business_name AS business_name
         FROM appointments a
         LEFT JOIN booking_services bs ON bs.id = a.service_id
         LEFT JOIN employees e         ON e.id  = a.employee_id
         LEFT JOIN booking_settings biz ON biz.user_id = a.user_id
         LEFT JOIN users u             ON u.id  = a.user_id
         WHERE LOWER(a.client_email)=LOWER($1)
         ORDER BY a.date DESC, a.start_time DESC
         LIMIT 200`,
        [email]
      );
      res.json(rows);
    } catch(e) { console.error('[gc]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
