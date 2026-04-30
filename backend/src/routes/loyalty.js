// routes/loyalty.js — Feature 9 : Fidélité clients (tampons numériques)
const express  = require('express');
const { pool } = require('../db');
const { authMiddleware }  = require('../middleware/auth');
const { requireFeature } = require('../middleware/requireFeature');
const { pinAdminMiddleware } = require('../middleware/pinAdmin');
const { incrementStamps } = require('../utils/loyalty-utils');
const router = express.Router();
router.use(authMiddleware);
router.use(requireFeature('loyalty'));

// Audit X : bornes métier fidélité. Évitent qu'une typo admin ou un JWT
// compromis via XSS pousse des valeurs aberrantes (reward=999%, 1€ = 1000
// points, stamps_required=999999 rendant la carte inutile).
const MAX_STAMPS_REQ    = 100;     // 100 tampons = ~1 an pour un client régulier
const MAX_REWARD_PCT    = 100;     // pas plus que 100% du prix
const MAX_REWARD_FIXED  = 500;     // € de remise max
const MAX_POINTS_PER_EU = 100;     // ratio points/euro realistic
const MAX_MIN_PURCHASE  = 10000;   // plafond min_purchase €
const MAX_VALIDITY_DAYS = 3650;    // 10 ans max
const MAX_STAMPS_PER_OP = 20;      // par POST /stamp ou /add-service

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
// Audit X : PIN admin requis (aligné O/W). Modifier les valeurs fidélité
// = impact financier direct — défense-en-profondeur contre XSS qui
// aurait récupéré un JWT marchand.
router.put('/program', pinAdminMiddleware, async (req, res) => {
  try {
    const { enabled, stamps_required, reward_label, reward_type, reward_value, count_trigger,
            loyalty_mode, points_per_euro, min_purchase, validity_days } = req.body;
    if (reward_type && !['percent','fixed'].includes(reward_type))
      return res.status(400).json({ error: 'Type de récompense invalide.' });

    const rewardType = reward_type || 'percent';
    const rv = parseFloat(reward_value);
    if (!Number.isFinite(rv) || rv < 0)
      return res.status(400).json({ error: 'Valeur de récompense invalide.' });
    if (rewardType === 'percent' && rv > MAX_REWARD_PCT)
      return res.status(400).json({ error: `Récompense ≤ ${MAX_REWARD_PCT} %.` });
    if (rewardType === 'fixed' && rv > MAX_REWARD_FIXED)
      return res.status(400).json({ error: `Récompense ≤ ${MAX_REWARD_FIXED} €.` });

    // Label : borne anti-DB-bloat (aligné V)
    if (typeof reward_label === 'string' && reward_label.length > 200)
      return res.status(400).json({ error: 'Libellé récompense trop long.' });

    const stampsReq = Math.min(MAX_STAMPS_REQ, Math.max(1, parseInt(stamps_required) || 10));
    const pPerEu    = Math.min(MAX_POINTS_PER_EU, Math.max(0.01, parseFloat(points_per_euro) || 1));
    const minPurch  = Math.min(MAX_MIN_PURCHASE, Math.max(0, parseFloat(min_purchase) || 0));
    const validity  = Math.min(MAX_VALIDITY_DAYS, Math.max(1, parseInt(validity_days) || 90));

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
       stampsReq,
       reward_label || 'Prestation offerte',
       rewardType,
       rv,
       ['physical','online','both'].includes(count_trigger) ? count_trigger : 'both',
       ['stamps','points'].includes(loyalty_mode) ? loyalty_mode : 'stamps',
       pPerEu,
       minPurch,
       validity]
    );
    res.json(rows[0]);
  } catch(e) { console.error('[LOY PUT]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/loyalty/clients ──────────────────────────────────────────────────
// Pagination serveur (limit 5 par defaut, cap 100). Search etendu sur nom,
// email ET phone via LEFT JOIN client_accounts. Renvoie { rows, total } pour
// que le frontend ne charge jamais plus que la page courante.
//
// Backwards-compat : si aucun param de pagination n'est passe, renvoie un
// tableau direct (ancien format), evite de casser d'autres callers eventuels.
router.get('/clients', async (req, res) => {
  try {
    const search   = String(req.query.search || '').trim();
    const hasPaging = req.query.limit != null || req.query.offset != null;
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 5));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    let baseQ = `
      WITH base AS (
        SELECT cl.*,
               ca.first_name, ca.last_name, ca.phone
          FROM client_loyalty cl
          LEFT JOIN client_accounts ca
                 ON ca.user_id = cl.user_id
                AND LOWER(ca.email) = LOWER(cl.client_email)
         WHERE cl.user_id = $1
      )
      SELECT * FROM base WHERE 1=1
    `;
    const params = [req.user.userId];
    if (search) {
      params.push(`%${search}%`);
      baseQ += ` AND (
        client_name ILIKE $${params.length}
        OR client_email ILIKE $${params.length}
        OR (first_name||' '||last_name) ILIKE $${params.length}
        OR phone ILIKE $${params.length}
      )`;
    }

    if (!hasPaging) {
      // Backwards-compat : ancien comportement (tableau direct, sans cap autre
      // que la limite implicite). On garde la securite : cap a 500.
      const { rows } = await pool.query(
        `${baseQ} ORDER BY stamps DESC, last_visit DESC NULLS LAST LIMIT 500`,
        params
      );
      return res.json(rows);
    }

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM (${baseQ}) AS sub`,
      params
    );
    const total = countRows[0].n;

    params.push(limit, offset);
    const listQ = `${baseQ} ORDER BY stamps DESC, last_visit DESC NULLS LAST
                   LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const { rows } = await pool.query(listQ, params);

    res.json({ rows, total });
  } catch(e) {
    console.error('[GET /loyalty/clients]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});


// ── POST /api/loyalty/stamp ── Ajouter un tampon manuellement ─────────────────
router.post('/stamp', async (req, res) => {
  try {
    const { client_email, client_name, stamps_to_add = 1 } = req.body;
    if (!client_email) return res.status(400).json({ error: 'Email client requis.' });
    // Audit X : normalisation email (aligné transactions V) + cap anti-abus.
    const emailNorm = String(client_email).trim().toLowerCase();
    const toAdd = Math.min(MAX_STAMPS_PER_OP, Math.max(1, parseInt(stamps_to_add) || 1));

    const result = await incrementStamps(req.user.userId, emailNorm, client_name, toAdd);
    if (!result) return res.status(400).json({ error: 'Programme de fidélité désactivé.' });

    // Retourner l'état complet du client
    const { rows } = await pool.query(
      'SELECT * FROM client_loyalty WHERE user_id=$1 AND client_email=$2',
      [req.user.userId, emailNorm]
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
// Audit X : PIN admin (aligné O). Supprimer une ligne loyalty efface
// l'historique de tampons d'un client — potentielle dissimulation d'audit
// interne si un employé frauduleux peut effacer.
router.delete('/clients/:id', pinAdminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM client_loyalty WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch(e) { console.error('[LOY DEL]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
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
    // Audit X : normalisation email + cap anti-abus (idem /stamp).
    const emailNorm = String(client_email).trim().toLowerCase();
    const toAdd = Math.min(MAX_STAMPS_PER_OP, Math.max(1, parseInt(stamps_to_add) || 1));

    const result = await incrementStamps(
      req.user.userId, emailNorm, client_name || null,
      toAdd, 'physical'
    );

    if (!result) return res.status(400).json({ error: 'Programme de fidélité désactivé.' });
    if (result.skipped) return res.status(400).json({
      error: 'Le programme est configuré pour les réservations en ligne uniquement.'
    });

    const { rows } = await pool.query(
      'SELECT * FROM client_loyalty WHERE user_id=$1 AND client_email=$2',
      [req.user.userId, emailNorm]
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
