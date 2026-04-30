// src/routes/public-booking/announcement.js
// Endpoint public : retourne l'annonce active du commercant (ou null).
// Active = is_enabled && now in [starts_at, ends_at] && current_time in
// [daily_start_time, daily_end_time] (les bornes optionnelles sont ignorees
// si NULL).
'use strict';

const { pool } = require('../../db');

module.exports = function attachAnnouncementRoutes(router) {
  // GET /api/pub/:slug/announcement
  router.get('/:slug/announcement', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ma.message, ma.color, ma.starts_at, ma.ends_at,
                ma.daily_start_time, ma.daily_end_time
           FROM merchant_announcement ma
           JOIN booking_settings bs ON bs.user_id = ma.user_id
          WHERE bs.slug = $1
            AND ma.is_enabled = TRUE
            AND ma.message IS NOT NULL AND ma.message <> ''
            AND (ma.starts_at IS NULL OR ma.starts_at <= NOW())
            AND (ma.ends_at   IS NULL OR ma.ends_at   >= NOW())
            AND (ma.daily_start_time IS NULL
                 OR LOCALTIME(0) >= ma.daily_start_time)
            AND (ma.daily_end_time   IS NULL
                 OR LOCALTIME(0) <= ma.daily_end_time)
          LIMIT 1`,
        [req.params.slug]
      );
      // null si pas active maintenant -> le frontend n'affiche rien
      res.json(rows[0] || null);
    } catch (e) {
      console.error('[GET /pub/:slug/announcement]', e.message);
      // On renvoie null silencieusement plutot qu'une erreur : pas critique
      // pour l'experience client (le bandeau est juste de la communication).
      res.json(null);
    }
  });
};
