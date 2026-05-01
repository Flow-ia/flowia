// src/routes/public-booking/announcement.js
// Endpoint public : retourne l'annonce active du commercant (ou null).
// Active = is_enabled && now in [starts_at, ends_at] && current_time in
// [daily_start_time, daily_end_time] (les bornes optionnelles sont ignorees
// si NULL).
//
// Mode diagnostic : ajouter ?debug=1 retourne la ligne brute en base + un
// tableau "filters" indiquant quel critere a exclu la ligne. Aucune donnee
// sensible (l'annonce a vocation a etre publique) -> pas besoin d'auth.
'use strict';

const { pool } = require('../../db');

module.exports = function attachAnnouncementRoutes(router) {
  router.get('/:slug/announcement', async (req, res) => {
    const debug = req.query.debug === '1' || req.query.debug === 'true';
    try {
      // Charge la ligne SANS filtrer (sauf JOIN slug). On evalue les
      // criteres en SQL pour avoir une vue exacte du moteur PG.
      const { rows } = await pool.query(
        `SELECT ma.message, ma.color, ma.starts_at, ma.ends_at,
                ma.daily_start_time, ma.daily_end_time,
                ma.is_enabled,
                COALESCE(bs.timezone, 'Europe/Paris') AS tz,
                bs.is_enabled                          AS booking_enabled,
                NOW()                                  AS now_utc,
                (NOW() AT TIME ZONE COALESCE(bs.timezone, 'Europe/Paris'))::time AS now_local_time,
                -- Flags filtres : TRUE = critere passe, FALSE = exclu la ligne
                (ma.is_enabled = TRUE)                                AS f_is_enabled,
                (ma.message IS NOT NULL AND ma.message <> '')         AS f_has_message,
                (ma.starts_at IS NULL OR ma.starts_at <= NOW())       AS f_starts_at,
                (ma.ends_at   IS NULL OR ma.ends_at   >= NOW())       AS f_ends_at,
                (ma.daily_start_time IS NULL
                  OR (NOW() AT TIME ZONE COALESCE(bs.timezone, 'Europe/Paris'))::time
                     >= ma.daily_start_time)                          AS f_daily_start,
                (ma.daily_end_time IS NULL
                  OR (NOW() AT TIME ZONE COALESCE(bs.timezone, 'Europe/Paris'))::time
                     <= ma.daily_end_time)                            AS f_daily_end
           FROM booking_settings bs
           LEFT JOIN merchant_announcement ma ON ma.user_id = bs.user_id
          WHERE bs.slug = $1
          LIMIT 1`,
        [req.params.slug]
      );

      const row = rows[0];

      // Cas 1 : aucun booking_settings trouve pour ce slug
      if (!row) {
        if (debug) return res.json({ visible: false, reason: 'SLUG_NOT_FOUND', slug: req.params.slug });
        return res.json(null);
      }

      // Cas 2 : booking_settings existe mais aucune ligne merchant_announcement
      // (LEFT JOIN renvoie tout NULL pour les colonnes ma.*)
      if (row.message === null && row.is_enabled === null) {
        if (debug) return res.json({
          visible: false, reason: 'NO_ROW_IN_merchant_announcement',
          tz: row.tz, booking_enabled: row.booking_enabled,
        });
        return res.json(null);
      }

      // Cas 3 : ligne trouvee, on verifie tous les filtres
      const filters = {
        is_enabled:  row.f_is_enabled,
        has_message: row.f_has_message,
        starts_at:   row.f_starts_at,
        ends_at:     row.f_ends_at,
        daily_start: row.f_daily_start,
        daily_end:   row.f_daily_end,
      };
      const failed = Object.entries(filters).filter(([, v]) => v === false).map(([k]) => k);
      const visible = failed.length === 0;

      if (debug) {
        return res.json({
          visible,
          failed_filters: failed,
          filters,
          row: {
            is_enabled:       row.is_enabled,
            message:          row.message,
            message_length:   row.message ? row.message.length : 0,
            color:            row.color,
            starts_at:        row.starts_at,
            ends_at:          row.ends_at,
            daily_start_time: row.daily_start_time,
            daily_end_time:   row.daily_end_time,
            tz:               row.tz,
          },
          server: {
            now_utc:        row.now_utc,
            now_local_time: row.now_local_time,
          },
        });
      }

      if (!visible) return res.json(null);

      // Mode normal : renvoie le payload public attendu par le frontend
      return res.json({
        message:          row.message,
        color:            row.color,
        starts_at:        row.starts_at,
        ends_at:          row.ends_at,
        daily_start_time: row.daily_start_time,
        daily_end_time:   row.daily_end_time,
        is_enabled:       row.is_enabled,
        tz:               row.tz,
      });
    } catch (e) {
      console.error('[GET /pub/:slug/announcement]', {
        slug: req.params.slug,
        code: e.code,
        message: e.message,
      });
      if (debug) return res.json({ visible: false, reason: 'DB_ERROR', code: e.code, message: e.message });
      return res.json(null);
    }
  });
};
