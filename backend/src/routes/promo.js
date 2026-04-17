// routes/promo.js  ─  Feature 10 : Codes promo / remises
const express  = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router   = express.Router();
router.use(authMiddleware);

// ── GET /api/promo ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM promo_codes WHERE user_id=$1 AND is_loyalty_reward IS NOT TRUE ORDER BY created_at DESC`,
      [req.user.userId]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/promo/check ── valider un code (avant encaissement) ─────────────
router.post('/check', async (req, res) => {
  try {
    const { code, amount, client_email } = req.body;
    if (!code) return res.status(400).json({ error: 'Code requis.' });
    const { rows } = await pool.query(
      `SELECT * FROM promo_codes WHERE user_id=$1 AND UPPER(code)=UPPER($2) AND is_active=TRUE
       AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
       AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
       AND (max_uses IS NULL OR uses_count < max_uses)`,
      [req.user.userId, code.trim()]
    );
    if (!rows.length) {
      // Vérifier si le code existe mais est expiré/épuisé pour un message plus précis
      const { rows: expired } = await pool.query(
        `SELECT is_active, valid_until, uses_count, max_uses FROM promo_codes WHERE user_id=$1 AND UPPER(code)=UPPER($2)`,
        [req.user.userId, code.trim()]
      );
      if (expired.length) {
        const e = expired[0];
        if (!e.is_active) return res.json({ valid: false, error: 'Ce code a été désactivé.' });
        if (e.valid_until && new Date(e.valid_until) < new Date()) return res.json({ valid: false, error: `Ce code a expiré le ${new Date(e.valid_until).toLocaleDateString('fr-FR')}.` });
        if (e.max_uses && e.uses_count >= e.max_uses) return res.json({ valid: false, error: 'Ce code a déjà été utilisé le nombre maximum de fois.' });
      }
      return res.json({ valid: false, error: 'Code invalide ou inconnu.' });
    }
    const promo = rows[0];

    // Vérification target_clients='new' → client ne doit pas avoir de transactions
    if (promo.target_clients === 'new' && client_email) {
      const { rows: prev } = await pool.query(
        `SELECT id FROM transactions
         WHERE user_id=$1 AND source != 'rdv'
           AND description ILIKE $2
         LIMIT 1`,
        [req.user.userId, `%${client_email}%`]
      );
      // Vérifier aussi dans client_loyalty (total_stamps_ever > 0 = déjà venu)
      const { rows: cl } = await pool.query(
        `SELECT total_stamps_ever FROM client_loyalty
         WHERE user_id=$1 AND client_email=$2`,
        [req.user.userId, client_email]
      );
      const alreadyClient = prev.length > 0 || (cl.length > 0 && cl[0].total_stamps_ever > 0);
      if (alreadyClient) {
        return res.json({ valid: false, error: 'Ce code est réservé aux nouveaux clients.' });
      }
    }

    const baseAmt = parseFloat(amount) || 0;

    // ── Code fidélité : vérifier que c'est bien le bon client ──────────────
    if (promo.is_loyalty_reward && promo.owner_client_email) {
      if (client_email && promo.owner_client_email.toLowerCase() !== client_email.toLowerCase()) {
        return res.json({ valid: false, error: `Ce code de fidélité appartient au client ${promo.owner_client_email} et ne peut pas être utilisé par un autre client.` });
      }
    }

    // ── Vérifier montant minimum d'achat ────────────────────────────────────
    const minPurchase = parseFloat(promo.min_purchase) || 0;
    if (minPurchase > 0 && baseAmt < minPurchase) {
      return res.json({ valid: false, error: `Ce code nécessite un minimum d'achat de ${minPurchase.toFixed(2)} €. Montant actuel : ${baseAmt.toFixed(2)} €.` });
    }

    // ── Calcul remise ────────────────────────────────────────────────────────
    const discount = promo.type === 'percent'
      ? Math.min(baseAmt, baseAmt * parseFloat(promo.value) / 100)
      : Math.min(baseAmt, parseFloat(promo.value));
    res.json({ valid: true, promo, discount: Math.round(discount * 100) / 100 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/promo ── créer un code ─────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { code, type, value, max_uses, valid_from, valid_until, target_clients,
            time_allday, time_from, time_until } = req.body;
    if (!code || !type || value == null)
      return res.status(400).json({ error: 'Champs obligatoires manquants.' });
    if (!['percent','fixed'].includes(type))
      return res.status(400).json({ error: 'Type invalide.' });
    const { rows } = await pool.query(
      `INSERT INTO promo_codes
         (user_id, code, type, value, max_uses, valid_from, valid_until, target_clients,
          time_allday, time_from, time_until)
       VALUES ($1, UPPER($2), $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.user.userId, code.trim(), type, value, max_uses||null,
       valid_from||new Date().toISOString().split('T')[0], valid_until||null,
       ['all','new'].includes(target_clients) ? target_clients : 'all',
       time_allday !== false,
       (time_allday !== false) ? null : (time_from||null),
       (time_allday !== false) ? null : (time_until||null)]
    );
    res.status(201).json(rows[0]);
  } catch(e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ce code existe déjà.' });
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/promo/:id ────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    // Vérifier si c'est un code fidélité → non modifiable
    const { rows: chk } = await pool.query(
      'SELECT is_loyalty_reward FROM promo_codes WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]
    );
    if (!chk.length) return res.status(404).json({ error: 'Code introuvable.' });
    if (chk[0].is_loyalty_reward) {
      return res.status(403).json({ error: 'Les codes générés par la fidélité ne peuvent pas être modifiés.' });
    }
    const { code, type, value, max_uses, valid_from, valid_until, is_active, target_clients } = req.body;
    const { rows } = await pool.query(
      `UPDATE promo_codes SET code=UPPER($1), type=$2, value=$3, max_uses=$4,
        valid_from=$5, valid_until=$6, is_active=$7, target_clients=$8
       WHERE id=$9 AND user_id=$10 RETURNING *`,
      [code, type, value, max_uses||null, valid_from||null, valid_until||null,
       is_active??true,
       ['all','new'].includes(target_clients) ? target_clients : 'all',
       req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Code introuvable.' });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/promo/:id ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows: chk } = await pool.query(
      'SELECT is_loyalty_reward FROM promo_codes WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]
    );
    if (chk.length && chk[0].is_loyalty_reward) {
      return res.status(403).json({ error: 'Les codes générés par la fidélité ne peuvent pas être supprimés.' });
    }
    await pool.query('DELETE FROM promo_codes WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/promo/stats ─ traçabilité globale codes promo ──────────────────
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         p.id, p.code, p.type, p.value, p.is_active, p.is_loyalty_reward,
         p.uses_count, p.max_uses, p.valid_until, p.target_clients,
         p.owner_client_email, p.created_at,
         COUNT(ul.id) AS usage_count,
         COALESCE(SUM(ul.discount_applied), 0) AS total_discount_used,
         COALESCE(SUM(ul.transaction_amount), 0) AS total_revenue_generated,
         MAX(ul.used_at) AS last_used_at,
         json_agg(
           CASE WHEN ul.id IS NOT NULL THEN json_build_object(
             'client_email', ul.client_email,
             'client_name', ul.client_name,
             'discount_applied', ul.discount_applied,
             'used_at', ul.used_at
           ) END
           ORDER BY ul.used_at DESC
         ) FILTER (WHERE ul.id IS NOT NULL) AS usages
       FROM promo_codes p
       LEFT JOIN promo_usage_logs ul ON ul.promo_code_id = p.id
       WHERE p.user_id = $1 AND p.is_loyalty_reward IS NOT TRUE
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.user.userId]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── POST /api/promo/:id/send-emails ──────────────────────────────────────────
router.post('/:id/send-emails', async (req, res) => {
  try {
    const { client_ids } = req.body;
    const { rows: promoRows } = await pool.query(
      'SELECT * FROM promo_codes WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]
    );
    if (!promoRows.length) return res.status(404).json({ error: 'Code promo introuvable.' });
    const promo = promoRows[0];
    const { rows: userRows } = await pool.query(
      'SELECT business_name, email FROM users WHERE id=$1', [req.user.userId]
    );
    const businessName = userRows[0]?.business_name || userRows[0]?.email || 'Votre prestataire';

    let clientQuery, clientParams;
    if (client_ids && client_ids.length > 0) {
      clientQuery = `SELECT id, first_name, last_name, email FROM client_accounts
                     WHERE user_id=$1 AND id=ANY($2::uuid[]) AND email IS NOT NULL AND email != ''`;
      clientParams = [req.user.userId, client_ids];
    } else {
      clientQuery = `SELECT id, first_name, last_name, email FROM client_accounts
                     WHERE user_id=$1 AND email IS NOT NULL AND email != ''`;
      clientParams = [req.user.userId];
    }
    const { rows: clients } = await pool.query(clientQuery, clientParams);
    if (!clients.length) return res.json({ sent:0, failed:0, message:'Aucun client avec email.' });

    const { sendPromoEmail } = require('../utils/email');
    console.log('[PROMO SEND] Début envoi emails', {
      promoId: promo.id,
      promoCode: promo.code,
      clientsCount: clients.length,
      brevoKey: process.env.BREVO_API_KEY ? 'OK' : 'MANQUANTE',
      senderEmail: process.env.SENDER_EMAIL || process.env.BREVO_FROM || 'non défini'
    });
    let sent = 0, failed = 0;
    for (const client of clients) {
      const name = [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Client';
      const ok = await sendPromoEmail({ to: client.email, clientName: name, businessName, promo });
      if (ok) sent++; else failed++;
    }
    console.log('[PROMO SEND] Résultat:', { sent, failed, total: clients.length });
    res.json({ sent, failed, total: clients.length,
      message: sent + ' email' + (sent>1?'s':'') + ' envoy' + (sent>1?'és':'é') + ' avec succès.' });
  } catch(e) { console.error('[send-emails]', e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
