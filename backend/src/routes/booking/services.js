// src/routes/booking/services.js — CRUD services réservables
const { pool } = require('../../db');

module.exports = function attachServicesRoutes(router) {
  // ══════════════════════════════════════════════════════════
  // SERVICES
  // ══════════════════════════════════════════════════════════

  router.get('/services', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT bs.*, c.name as category_name,
                mi.id IS NOT NULL                        AS has_image,
                EXTRACT(EPOCH FROM mi.created_at)::bigint AS image_version
         FROM booking_services bs
         LEFT JOIN categories c ON c.id = bs.category_id
         LEFT JOIN LATERAL (
           SELECT id, created_at FROM media
            WHERE ref_id=bs.id AND type='service'
            ORDER BY created_at DESC LIMIT 1
         ) mi ON TRUE
         WHERE bs.user_id=$1 ORDER BY bs.sort_order, bs.created_at`,
        [req.user.userId]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  router.post('/services', async (req, res) => {
    try {
      const { name, description, duration_minutes, price, color, category_id, booking_category_id, is_active, sort_order } = req.body;
      if (!name || !duration_minutes) return res.status(400).json({ error: 'Nom et durée requis.' });
      const { rows } = await pool.query(
        `INSERT INTO booking_services (user_id, category_id, booking_category_id, name, description, duration_minutes, price, color, is_active, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.user.userId, category_id || null, booking_category_id || null, name, description || null,
         duration_minutes, price || null, color || '#6366f1', is_active !== false, sort_order || 0]
      );
      res.status(201).json(rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  router.put('/services/:id', async (req, res) => {
    try {
      const { name, description, duration_minutes, price, color, category_id, booking_category_id, is_active, sort_order } = req.body;
      const { rows } = await pool.query(
        `UPDATE booking_services SET name=$1, description=$2, duration_minutes=$3, price=$4,
         color=$5, category_id=$6, booking_category_id=$7, is_active=$8, sort_order=$9
         WHERE id=$10 AND user_id=$11 RETURNING *`,
        [name, description || null, duration_minutes, price || null,
         color || '#6366f1', category_id || null, booking_category_id || null,
         is_active !== false, sort_order || 0, req.params.id, req.user.userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Service introuvable.' });
      res.json(rows[0]);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  router.delete('/services/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM booking_services WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
