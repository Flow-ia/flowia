// src/routes/global-clients/loyalty.js — GET /loyalty (points multi-commerces)
const { pool } = require('../../db');
const { globalClientAuth } = require('./helpers');

module.exports = function attachLoyaltyRoutes(router) {
  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/global-clients/loyalty — tous les points fidélité multi-commerces
  // ─────────────────────────────────────────────────────────────────────────────
  router.get('/loyalty', globalClientAuth, async (req, res) => {
    try {
      const { rows: gc } = await pool.query('SELECT email FROM global_clients WHERE id=$1', [req.globalClient.globalClientId]);
      if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });

      // business_name vit sur users (pas booking_settings) → JOIN users.
      const { rows } = await pool.query(
        `SELECT
           cl.stamps, cl.points, cl.total_stamps_ever, cl.total_points_ever,
           cl.rewards_earned, cl.last_visit,
           lp.stamps_required, lp.loyalty_mode, lp.points_per_euro,
           lp.reward_label, lp.reward_type, lp.reward_value,
           u.business_name, bs.slug
         FROM client_loyalty cl
         LEFT JOIN loyalty_programs lp ON lp.user_id=cl.user_id
         LEFT JOIN booking_settings bs ON bs.user_id=cl.user_id
         LEFT JOIN users u              ON u.id       =cl.user_id
         WHERE LOWER(cl.client_email)=LOWER($1) AND lp.enabled=TRUE
         ORDER BY cl.last_visit DESC NULLS LAST`,
        [gc[0].email]
      );
      res.json(rows);
    } catch(e) { console.error('[gc]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
