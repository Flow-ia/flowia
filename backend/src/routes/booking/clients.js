// src/routes/booking/clients.js — Liste clients du commerçant
const { pool } = require('../../db');

module.exports = function attachClientsRoutes(router) {
  // ══════════════════════════════════════════════════════════
  // CLIENTS
  // ══════════════════════════════════════════════════════════

  router.get('/clients', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ca.*, COUNT(a.id) as appointment_count
         FROM client_accounts ca
         LEFT JOIN appointments a ON a.client_id = ca.id
         WHERE ca.user_id=$1 GROUP BY ca.id ORDER BY ca.created_at DESC`,
        [req.user.userId]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
