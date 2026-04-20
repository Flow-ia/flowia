// routes/loyalty.js — Feature 9 : Fidélité clients (tampons numériques)
const express  = require('express');
const { pool } = require('../db');
const { authMiddleware }  = require('../middleware/auth');
const { incrementStamps } = require('../utils/loyalty-utils');
const router = express.Router();
router.use(authMiddleware);

// ── GET /api/loyalty/program ──────────────────────────────────────────────────
router.get('/program', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM loyalty_programs WHERE user_id=$1', [req.user.userId]);
    res.json(rows[0] || {
      enabled: false, stamps_required: 10,
      reward_label: 'Prestation offerte',
      reward_type: 'percent', reward_value: 10,
      loyalty_mode: 'stamps', points_per_euro: 1,
      min_purchase: 0, validity_days: 90,
    });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── PUT /api/loyalty/program ──────────────────────────────────────────────────
router.put('/program', async (req, res) => {
  try {
    const { enabled, stamps_required, reward_label, reward_type, reward_value, count_trigger,
            loyalty_mode, points_per_euro, min_purchase, validity_days } = req.body;
    if (reward_type && !['percent','fixed'].includes(reward_type))
      return res.status(400).json({ error: 'Type de récompense invalide.' });

    const { rows } = await pool.query(
      `INSERT INTO loyalty_programs
        (user_id, enabled, stamps_required, reward_label, reward_type, reward_value,
         count_trigger, loyalty_mode, points_per_euro, min_purchase, validity_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (user_id) DO UPDATE SET
         enabled=$2, stamps_required=$3, reward_label=$4,
         reward_type=$5, reward_value=$6, count_trigger=$7,
         loyalty_mode=$8, points_per_euro=$9, min_purchase=$10, validity_days=$11
       RETURNING *`,
      [req.user.userId,
       enabled ?? false,
       Math.max(1, parseInt(stamps_required) || 10),
       reward_label || 'Prestation offerte',
       reward_type  || 'percent',
       parseFloat(reward_value) || 10,
       ['physical','online','both'].includes(count_trigger) ? count_trigger : 'both',
       ['stamps','points'].includes(loyalty_mode) ? loyalty_mode : 'stamps',
       Math.max(0.01, parseFloat(points_per_euro) || 1),
       Math.max(0, parseFloat(min_purchase) || 0),
       Math.max(1, parseInt(validity_days) || 90)]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/loyalty/clients ──────────────────────────────────────────────────
router.get('/clients', async (req, res) => {
  try {
    const { search } = req.query;
    let q    = `SELECT * FROM client_loyalty WHERE user_id=$1`;
    const p  = [req.user.userId];
    if (search) { p.push(`%${search}%`); q += ` AND (client_name ILIKE $2 OR client_email ILIKE $2)`; }
    q += ' ORDER BY stamps DESC, last_visit DESC NULLS LAST';
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});


// ── POST /api/loyalty/stamp ── Ajouter un tampon manuellement ─────────────────
router.post('/stamp', async (req, res) => {
  try {
    const { client_email, client_name, stamps_to_add = 1 } = req.body;
    if (!client_email) return res.status(400).json({ error: 'Email client requis.' });

    const result = await incrementStamps(req.user.userId, client_email, client_name, stamps_to_add);
    if (!result) return res.status(400).json({ error: 'Programme de fidélité désactivé.' });

    // Retourner l'état complet du client
    const { rows } = await pool.query(
      'SELECT * FROM client_loyalty WHERE user_id=$1 AND client_email=$2',
      [req.user.userId, client_email]
    );
    const { rows: prog } = await pool.query(
      'SELECT stamps_required FROM loyalty_programs WHERE user_id=$1', [req.user.userId]);

    res.json({
      ...(rows[0] || {}),
      ...result,
      stamps_required: prog[0]?.stamps_required || 10,
    });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── DELETE /api/loyalty/clients/:id ──────────────────────────────────────────
router.delete('/clients/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM client_loyalty WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});


// ── GET /api/loyalty/promo-history ─ codes fidélité avec traçabilité ──────────
router.get('/promo-history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         p.id, p.code, p.type, p.value, p.is_active,
         p.uses_count, p.max_uses, p.valid_until,
         p.owner_client_email, p.created_at,
         cl.client_name  AS owner_name,
         ul.used_at,
         ul.discount_applied,
         ul.client_email AS used_by_email,
         ul.client_name  AS used_by_name
       FROM promo_codes p
       LEFT JOIN client_loyalty cl
         ON cl.user_id = p.user_id AND cl.client_email = p.owner_client_email
       LEFT JOIN promo_usage_logs ul ON ul.promo_code_id = p.id
       WHERE p.user_id = $1 AND p.is_loyalty_reward = TRUE
       ORDER BY p.created_at DESC
       LIMIT 200`,
      [req.user.userId]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/loyalty/search-clients ─ recherche client (nom/email/téléphone) ──
router.get('/search-clients', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const term = '%' + q.trim() + '%';
    // Chercher dans client_loyalty + client_accounts
    const { rows } = await pool.query(
      `SELECT DISTINCT
         COALESCE(ca.id::text, cl.id::text) AS id,
         COALESCE(ca.first_name||' '||ca.last_name, cl.client_name) AS name,
         COALESCE(ca.email, cl.client_email) AS email,
         COALESCE(ca.phone, '') AS phone,
         cl.stamps, cl.total_stamps_ever, cl.rewards_earned, cl.last_visit,
         'loyalty' AS source
       FROM client_loyalty cl
       LEFT JOIN client_accounts ca
         ON ca.user_id = cl.user_id AND ca.email = cl.client_email
       WHERE cl.user_id = $1
         AND (
           COALESCE(ca.first_name||' '||ca.last_name, cl.client_name) ILIKE $2
           OR cl.client_email ILIKE $2
           OR ca.phone ILIKE $2
         )
       UNION
       SELECT
         ca.id::text, ca.first_name||' '||ca.last_name,
         ca.email, COALESCE(ca.phone,''), 0, 0, 0, NULL, 'account'
       FROM client_accounts ca
       LEFT JOIN client_loyalty cl
         ON cl.user_id = ca.user_id AND cl.client_email = ca.email
       WHERE ca.user_id = $1 AND cl.id IS NULL
         AND (ca.first_name||' '||ca.last_name ILIKE $2 OR ca.email ILIKE $2 OR ca.phone ILIKE $2)
       ORDER BY name
       LIMIT 20`,
      [req.user.userId, term]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── POST /api/loyalty/add-service ─ ajouter prestation manuellement ────────────
router.post('/add-service', async (req, res) => {
  try {
    const { client_email, client_name, stamps_to_add = 1 } = req.body;
    if (!client_email) return res.status(400).json({ error: 'Email requis.' });

    const result = await incrementStamps(
      req.user.userId, client_email, client_name || null,
      parseInt(stamps_to_add) || 1, 'physical'
    );

    if (!result) return res.status(400).json({ error: 'Programme de fidélité désactivé.' });
    if (result.skipped) return res.status(400).json({
      error: 'Le programme est configuré pour les réservations en ligne uniquement.'
    });

    const { rows } = await pool.query(
      'SELECT * FROM client_loyalty WHERE user_id=$1 AND client_email=$2',
      [req.user.userId, client_email]
    );
    const { rows: prog } = await pool.query(
      'SELECT stamps_required FROM loyalty_programs WHERE user_id=$1', [req.user.userId]
    );

    res.json({
      client: rows[0] || {},
      stamps_required: prog[0]?.stamps_required || 10,
      reward_triggered: result.reward_triggered || false,
      reward_code: result.reward_code || null,
    });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/loyalty/stats ─ traçabilité codes fidélité + promo ──────────────
router.get('/stats', async (req, res) => {
  try {
    // Codes fidélité générés
    const { rows: generated } = await pool.query(
      `SELECT
         COUNT(*) AS total_codes,
         COALESCE(SUM(
           CASE WHEN p.type='fixed' THEN p.value
                ELSE (SELECT AVG(t.amount) FROM transactions t WHERE t.user_id=p.user_id) * p.value / 100
           END
         ), 0) AS montant_genere,
         COALESCE(SUM(
           CASE WHEN ul.discount_applied IS NOT NULL THEN ul.discount_applied ELSE 0 END
         ), 0) AS montant_utilise,
         COUNT(CASE WHEN ul.id IS NOT NULL THEN 1 END) AS codes_utilises,
         COUNT(CASE WHEN ul.id IS NULL AND p.is_active=TRUE THEN 1 END) AS codes_restants
       FROM promo_codes p
       LEFT JOIN promo_usage_logs ul ON ul.promo_code_id = p.id
       WHERE p.user_id=$1 AND p.is_loyalty_reward=TRUE`,
      [req.user.userId]
    );
    // CA généré par clients fidélité
    const { rows: caRows } = await pool.query(
      `SELECT
         cl.client_email, cl.client_name,
         cl.stamps, cl.total_stamps_ever, cl.rewards_earned,
         COALESCE(SUM(t.amount), 0) AS ca_total
       FROM client_loyalty cl
       LEFT JOIN transactions t ON t.user_id=cl.user_id AND t.client_email=cl.client_email AND t.type='revenue'
       WHERE cl.user_id=$1
       GROUP BY cl.client_email, cl.client_name, cl.stamps, cl.total_stamps_ever, cl.rewards_earned
       ORDER BY ca_total DESC LIMIT 50`,
      [req.user.userId]
    );
    res.json({ summary: generated[0] || {}, clients: caRows });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = { router };
