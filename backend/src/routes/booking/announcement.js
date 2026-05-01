// src/routes/booking/announcement.js
// Bandeau d'annonce affiche en haut de la page de reservation publique du
// commercant. Une seule annonce par commercant (UPSERT par user_id).
//
// Couleurs whitelistees (anti injection CSS) :
//   green / orange / yellow / red / blue / gray / purple
// Le frontend mappe ces ids vers les vraies valeurs CSS (bg, text, border).
'use strict';

const { pool } = require('../../db');

const ALLOWED_COLORS = new Set([
  'green', 'orange', 'yellow', 'red', 'blue', 'gray', 'purple',
]);
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeTime(v) {
  if (v == null || v === '') return null;
  const s = String(v).slice(0, 5); // tronque HH:MM:SS -> HH:MM si besoin
  return HHMM_RE.test(s) ? s : null;
}

// Accepte tout format parseable par Date (ISO 8601, datetime-local sans tz,
// etc.). Renvoie un ISO UTC standard que PG comprend sans ambiguite.
// Si invalide -> null silencieux (le check "fourni mais invalide" remonte
// un 400 explicite plus bas).
function normalizeDateTime(v) {
  if (v == null || v === '') return null;
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

module.exports = function attachAnnouncementRoutes(router) {
  // GET /api/booking/announcement — config commercant
  router.get('/announcement', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT message, color, is_enabled, starts_at, ends_at,
                daily_start_time, daily_end_time
           FROM merchant_announcement WHERE user_id=$1`,
        [req.user.userId]
      );
      const r = rows[0] || {
        message: '', color: 'orange', is_enabled: false,
        starts_at: null, ends_at: null,
        daily_start_time: null, daily_end_time: null,
      };
      // Tronque HH:MM:SS -> HH:MM pour <input type="time">
      if (r.daily_start_time) r.daily_start_time = String(r.daily_start_time).slice(0, 5);
      if (r.daily_end_time)   r.daily_end_time   = String(r.daily_end_time).slice(0, 5);
      res.json(r);
    } catch (e) {
      console.error('[GET /booking/announcement]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });

  // PUT /api/booking/announcement — UPSERT
  router.put('/announcement', async (req, res) => {
    try {
      const {
        message, color, is_enabled,
        starts_at, ends_at, daily_start_time, daily_end_time,
      } = req.body || {};

      const safeColor = ALLOWED_COLORS.has(String(color)) ? String(color) : 'orange';
      const safeMsg   = message == null ? '' : String(message).slice(0, 500);
      const safeStart = normalizeDateTime(starts_at);
      const safeEnd   = normalizeDateTime(ends_at);
      const safeDailyStart = normalizeTime(daily_start_time);
      const safeDailyEnd   = normalizeTime(daily_end_time);

      // Coherence : si BOTH starts_at et ends_at fournis ET egaux ou inverses
      // -> 400 explicite. Strictement > pour permettre l'annulation par
      // saisie identique (egal = pas de plage active = bandeau jamais visible).
      if (safeStart && safeEnd && new Date(safeStart) > new Date(safeEnd)) {
        return res.status(400).json({
          error: "La date de début doit être avant la date de fin.",
          code: 'DATES_REVERSED',
          received: { starts_at, ends_at, parsed_start: safeStart, parsed_end: safeEnd },
        });
      }
      // Idem heures quotidiennes : strict > (egal autorise mais inutile)
      if (safeDailyStart && safeDailyEnd && safeDailyStart > safeDailyEnd) {
        return res.status(400).json({
          error: "L'heure de début doit être avant l'heure de fin.",
          code: 'TIMES_REVERSED',
          received: { daily_start_time, daily_end_time },
        });
      }
      console.log('[PUT /booking/announcement]', {
        user_id: req.user.userId,
        is_enabled, color: safeColor,
        msg_len: safeMsg.length,
        starts_at: safeStart, ends_at: safeEnd,
        daily_start_time: safeDailyStart, daily_end_time: safeDailyEnd,
      });

      await pool.query(
        `INSERT INTO merchant_announcement
           (user_id, message, color, is_enabled, starts_at, ends_at,
            daily_start_time, daily_end_time, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           message=$2, color=$3, is_enabled=$4,
           starts_at=$5, ends_at=$6,
           daily_start_time=$7, daily_end_time=$8,
           updated_at=NOW()`,
        [req.user.userId, safeMsg, safeColor, !!is_enabled,
         safeStart, safeEnd, safeDailyStart, safeDailyEnd]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error('[PUT /booking/announcement]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });
};
