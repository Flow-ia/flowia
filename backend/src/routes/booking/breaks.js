// src/routes/booking/breaks.js — Pauses commerçant (globales)
const { pool } = require('../../db');

module.exports = function attachBreaksRoutes(router) {
  // ══════════════════════════════════════════════════════════════════════════════
  // PAUSES COMMERÇANT
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/booking/breaks — retourne toutes les pauses
  router.get('/breaks', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM business_breaks WHERE user_id=$1 ORDER BY day_of_week, break_start',
        [req.user.userId]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // POST /api/booking/breaks — remplace toutes les pauses (tableau complet)
  router.post('/breaks', async (req, res) => {
    try {
      const { breaks } = req.body; // [{ day_of_week, break_start, break_end }]
      if (!Array.isArray(breaks)) return res.status(400).json({ error: 'Format invalide.' });

      await pool.query('DELETE FROM business_breaks WHERE user_id=$1', [req.user.userId]);

      for (const b of breaks) {
        if (b.break_start >= b.break_end) continue; // ignorer les pauses invalides
        await pool.query(
          `INSERT INTO business_breaks (user_id, day_of_week, break_start, break_end)
           VALUES ($1,$2,$3,$4)`,
          [req.user.userId, b.day_of_week, b.break_start, b.break_end]
        );
      }
      const { rows } = await pool.query(
        'SELECT * FROM business_breaks WHERE user_id=$1 ORDER BY day_of_week, break_start',
        [req.user.userId]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
