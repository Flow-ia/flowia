// routes/booking-service-categories.js
// Catégories de services pour le site de réservation /book/
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET all
router.get('/', async (req, res) => {
  try {
    const _bk = 'bsc:' + req.user.userId;
    const _bh = global.memCache?.get(_bk);
    if (_bh) return res.json(_bh);
    const { rows } = await pool.query(
      `SELECT id, user_id, name, icon, color, sort_order, created_at
       FROM booking_service_categories
       WHERE user_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST — créer
router.post('/', async (req, res) => {
  try {
    const { name, icon, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis.' });
    const { rows } = await pool.query(
      `INSERT INTO booking_service_categories (user_id, name, icon, color)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.userId, name.trim(), icon || 'Scissors', color || '#7c6af7']
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// PUT /:id — modifier
router.put('/:id', async (req, res) => {
  try {
    const { name, icon, color } = req.body;
    const { rows } = await pool.query(
      `UPDATE booking_service_categories
       SET name=$1, icon=$2, color=$3
       WHERE id=$4 AND user_id=$5 RETURNING *`,
      [name, icon || 'Scissors', color || '#7c6af7', req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Catégorie introuvable.' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// DELETE /:id — détache les services, supprime la catégorie
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE booking_services SET booking_category_id = NULL WHERE booking_category_id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    await client.query(
      'DELETE FROM booking_service_categories WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erreur serveur.' });
  } finally { client.release(); }
});

// PATCH /reorder
router.patch('/reorder', async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order[] requis.' });
    for (const { id, sort_order } of order) {
      await pool.query(
        'UPDATE booking_service_categories SET sort_order = $1 WHERE id = $2 AND user_id = $3',
        [sort_order, id, req.user.userId]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
