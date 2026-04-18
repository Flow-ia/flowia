const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// Génère un code unique type "REF-AB12CD"
function genReferralCode() {
  const raw = crypto.randomBytes(4).toString('base64')
    .replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
  return `REF-${raw}`;
}

// ═══ Routes commerçant (authentifiées) ══════════════════════════════════════
const merchantRouter = express.Router();
merchantRouter.use(authMiddleware);

// ── GET /api/referrals/program — config (commerçant) ────────────────────────
merchantRouter.get('/program', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT user_id, is_enabled, parrain_type, parrain_value,
              filleul_type, filleul_value, updated_at
         FROM referral_programs WHERE user_id=$1`,
      [req.user.userId]
    );
    if (!rows.length) {
      return res.json({
        is_enabled: false,
        parrain_type: 'percent', parrain_value: 10,
        filleul_type: 'percent', filleul_value: 10,
      });
    }
    res.json(rows[0]);
  } catch (e) { console.error('[REF PROG GET]', e.message); res.status(500).json({ error: e.message }); }
});

// ── PUT /api/referrals/program — upsert config ──────────────────────────────
merchantRouter.put('/program', async (req, res) => {
  try {
    const { is_enabled, parrain_type, parrain_value, filleul_type, filleul_value } = req.body;
    for (const t of [parrain_type, filleul_type]) {
      if (t && !['percent','fixed'].includes(t))
        return res.status(400).json({ error: 'type invalide.' });
    }
    const pv = parseFloat(parrain_value);
    const fv = parseFloat(filleul_value);
    if (isNaN(pv) || pv < 0 || isNaN(fv) || fv < 0)
      return res.status(400).json({ error: 'valeurs invalides.' });

    const { rows } = await pool.query(
      `INSERT INTO referral_programs
         (user_id, is_enabled, parrain_type, parrain_value, filleul_type, filleul_value, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         is_enabled    = EXCLUDED.is_enabled,
         parrain_type  = EXCLUDED.parrain_type,
         parrain_value = EXCLUDED.parrain_value,
         filleul_type  = EXCLUDED.filleul_type,
         filleul_value = EXCLUDED.filleul_value,
         updated_at    = NOW()
       RETURNING *`,
      [req.user.userId, !!is_enabled,
       parrain_type || 'percent', pv,
       filleul_type || 'percent', fv]
    );
    res.json(rows[0]);
  } catch (e) { console.error('[REF PROG PUT]', e.message); res.status(500).json({ error: e.message }); }
});

// ── GET /api/referrals/codes — liste des codes générés pour ce commerçant ──
merchantRouter.get('/codes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT rc.id, rc.code, rc.owner_client_email, rc.uses_count, rc.created_at
         FROM referral_codes rc
        WHERE rc.user_id=$1
        ORDER BY rc.created_at DESC
        LIMIT 500`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (e) { console.error('[REF CODES GET]', e.message); res.status(500).json({ error: e.message }); }
});

module.exports = merchantRouter;
module.exports.genReferralCode = genReferralCode;
