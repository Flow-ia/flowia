const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET all — parents triés par sort_order, enfants groupés sous leur parent puis triés par sort_order
router.get('/', async (req, res) => {
  try {
    const _ck = `cats:${req.user.userId}`;
    const _ch = global.memCache?.get(_ck);
    if (_ch) return res.json(_ch);

    const { rows } = await pool.query(
      `SELECT c.*,
         COALESCE(p.sort_order, c.sort_order) AS parent_sort_order,
         CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END AS is_child
       FROM categories c
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE c.user_id = $1
       ORDER BY
         COALESCE(p.sort_order, c.sort_order) ASC,
         COALESCE(p.created_at, c.created_at) ASC,
         is_child ASC,
         c.sort_order ASC,
         c.created_at ASC`,
      [req.user.userId]
    );
    // Retourner uniquement les colonnes de la table categories (sans les colonnes de jointure)
    const _cd = rows.map(r => ({ id:r.id,user_id:r.user_id,name:r.name,type:r.type,icon:r.icon,color:r.color,parent_id:r.parent_id,price:r.price,is_free_price:r.is_free_price,sort_order:r.sort_order,created_at:r.created_at }));
    global.memCache?.set(_ck, _cd, 10 * 60 * 1000);
    res.json(_cd);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, type, icon, color, parent_id, price, is_free_price } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Nom et type requis.' });
    const { rows } = await pool.query(
      'INSERT INTO categories (user_id, name, type, icon, color, parent_id, price, is_free_price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [req.user.userId, name, type, icon || 'Tag', color || '#3b82f6', parent_id || null,
       is_free_price ? null : (price != null ? parseFloat(price) : null),
       !!is_free_price]
    );
    global.memCache?.del('cats:' + req.user.userId);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, type, icon, color, parent_id, price, is_free_price } = req.body;
    const { rows } = await pool.query(
      `UPDATE categories SET name=$1, type=$2, icon=$3, color=$4, parent_id=$5, price=$6, is_free_price=$7
       WHERE id=$8 AND user_id=$9 RETURNING *`,
      [name, type, icon, color, parent_id || null,
       is_free_price ? null : (price != null ? parseFloat(price) : null),
       !!is_free_price, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Catégorie introuvable.' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE categories SET parent_id=NULL WHERE parent_id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]
    );
    await pool.query('DELETE FROM categories WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// PATCH /reorder — mise à jour sort_order en batch
router.patch('/reorder', async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order[] requis.' });
    for (const { id, sort_order } of order) {
      await pool.query(
        'UPDATE categories SET sort_order=$1 WHERE id=$2 AND user_id=$3',
        [sort_order, id, req.user.userId]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;