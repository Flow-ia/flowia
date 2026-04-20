const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// ── GET /api/birthday-campaign — config du commerçant (1 ligne) ─────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT user_id, is_enabled, discount_type, discount_value, validity_days, message, updated_at
         FROM birthday_campaigns WHERE user_id=$1`,
      [req.user.userId]
    );
    if (!rows.length) {
      return res.json({
        is_enabled: false, discount_type: 'percent', discount_value: 20,
        validity_days: 30, message: null,
      });
    }
    res.json(rows[0]);
  } catch (e) { console.error('[BIRTHDAY GET]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── PUT /api/birthday-campaign — upsert config ──────────────────────────────
router.put('/', async (req, res) => {
  try {
    const { is_enabled, discount_type, discount_value, validity_days, message } = req.body;
    if (discount_type && !['percent','fixed'].includes(discount_type))
      return res.status(400).json({ error: 'discount_type invalide.' });
    const v = parseFloat(discount_value);
    if (isNaN(v) || v < 0) return res.status(400).json({ error: 'discount_value invalide.' });
    // Cap percent ≤ 100 (avant: 150% "remise" acceptée → bug applicatif ailleurs).
    // Cap fixed ≤ 10000€ (sanity: anniversaire à 10k€ = config erronée).
    if (discount_type === 'percent' && v > 100)
      return res.status(400).json({ error: 'Pour une remise en %, le max est 100.' });
    if (discount_type === 'fixed' && v > 10000)
      return res.status(400).json({ error: 'Montant trop élevé (max 10000€).' });
    // Validity : entier > 0 (min 1 jour, max 365). Evite promo mort-nee avec
    // value=0 ou negative + UX coherente (>1 an n'a pas de sens pour un anniv).
    const validRaw = parseInt(validity_days);
    if (validity_days != null && (isNaN(validRaw) || validRaw < 1 || validRaw > 365))
      return res.status(400).json({ error: 'validity_days doit etre entre 1 et 365.' });
    const validFinal = (!isNaN(validRaw) && validRaw > 0) ? validRaw : 30;

    const { rows } = await pool.query(
      `INSERT INTO birthday_campaigns (user_id, is_enabled, discount_type, discount_value, validity_days, message, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         is_enabled     = EXCLUDED.is_enabled,
         discount_type  = EXCLUDED.discount_type,
         discount_value = EXCLUDED.discount_value,
         validity_days  = EXCLUDED.validity_days,
         message        = EXCLUDED.message,
         updated_at     = NOW()
       RETURNING *`,
      [req.user.userId, !!is_enabled, discount_type || 'percent', v,
       validFinal, message || null]
    );
    res.json(rows[0]);
  } catch (e) { console.error('[BIRTHDAY PUT]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;
