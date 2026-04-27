// routes/admin/merchants.js — Gestion des commerçants par l'admin (commit #3).
// Tous les endpoints requièrent adminAuth (déjà appliqué par le router parent).

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');
const { logAuditAction } = require('../../services/adminAudit');
const { FEATURES } = require('../../middleware/requireFeature');

const router = express.Router();
router.use(adminAuth);

// ── GET / — liste paginée + filtres ──────────────────────────────────────────
router.get('/', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || 'all').toLowerCase(); // all|active|frozen

  const where = [];
  const params = [];
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(LOWER(u.business_name) LIKE $${params.length}
              OR LOWER(u.email) LIKE $${params.length}
              OR LOWER(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) LIKE $${params.length})`);
  }
  if (status === 'frozen') where.push('u.is_frozen = TRUE');
  else if (status === 'active') where.push('u.is_frozen = FALSE OR u.is_frozen IS NULL');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const { rows: total } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM users u ${whereSql}`,
      params
    );

    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.business_name, u.phone, u.city,
              u.is_frozen, u.frozen_at, u.frozen_reason,
              u.created_at,
              (SELECT COUNT(*)::int FROM appointments a WHERE a.user_id = u.id) AS appointments_count,
              (SELECT COUNT(*)::int FROM client_accounts c WHERE c.user_id = u.id) AS clients_count,
              (SELECT MAX(created_at) FROM appointments a WHERE a.user_id = u.id) AS last_appointment_at
         FROM users u
         ${whereSql}
         ORDER BY u.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ total: total[0].n, limit, offset, rows });
  } catch (e) {
    console.error('[admin/merchants list]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /:id — détail commerçant + stats agrégées ────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.business_name, u.phone, u.address, u.city, u.country, u.postal_code,
              u.first_name, u.last_name, u.avatar_url,
              u.is_frozen, u.frozen_at, u.frozen_reason, u.frozen_by_admin_id,
              u.sms_balance, u.feature_flags,
              u.created_at, u.onboarding_completed,
              (SELECT slug FROM booking_settings WHERE user_id = u.id LIMIT 1) AS slug
         FROM users u
        WHERE u.id = $1
        LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const user = rows[0];

    const { rows: stats } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM appointments WHERE user_id = $1) AS appointments_total,
         (SELECT COUNT(*)::int FROM appointments WHERE user_id = $1 AND status = 'completed') AS appointments_done,
         (SELECT COUNT(*)::int FROM appointments WHERE user_id = $1 AND status = 'cancelled') AS appointments_cancelled,
         (SELECT COUNT(*)::int FROM client_accounts WHERE user_id = $1) AS clients_count,
         (SELECT COUNT(*)::int FROM employees WHERE user_id = $1 AND is_active = TRUE) AS employees_active,
         (SELECT COUNT(*)::int FROM transactions WHERE user_id = $1) AS transactions_count,
         (SELECT COALESCE(SUM(amount), 0)::numeric(14,2) FROM transactions WHERE user_id = $1) AS revenue_total,
         (SELECT MAX(created_at) FROM appointments WHERE user_id = $1) AS last_appointment_at`,
      [user.id]
    );

    const { rows: frozenBy } = user.frozen_by_admin_id
      ? await pool.query(`SELECT email, name FROM admin_users WHERE id = $1`, [user.frozen_by_admin_id])
      : { rows: [] };

    return res.json({
      ...user,
      stats: stats[0],
      frozen_by: frozenBy[0] || null,
    });
  } catch (e) {
    console.error('[admin/merchants get]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── PATCH /:id — édition basique (business_name, email, phone) ───────────────
router.patch('/:id', async (req, res) => {
  const allowed = ['business_name', 'email', 'phone', 'city', 'address', 'country', 'postal_code'];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, k)) {
      params.push(req.body[k]);
      sets.push(`${k} = $${params.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Aucun champ à modifier.' });

  try {
    const { rows: before } = await pool.query(
      `SELECT id, email, business_name, phone, city, address, country, postal_code FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });

    params.push(req.params.id);
    const { rows: after } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, email, business_name, phone, city, address, country, postal_code`,
      params
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'merchant.update', targetType: 'merchant', targetId: req.params.id,
      payloadBefore: before[0], payloadAfter: after[0],
      req,
    });

    return res.json(after[0]);
  } catch (e) {
    console.error('[admin/merchants patch]', e.message);
    if (e.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé.' });
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /:id/freeze ─────────────────────────────────────────────────────────
router.post('/:id/freeze', async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Motif requis.' });

  try {
    const { rows: before } = await pool.query(
      `SELECT id, email, business_name, is_frozen, frozen_reason FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });
    if (before[0].is_frozen) return res.status(409).json({ error: 'Compte déjà gelé.' });

    await pool.query(
      `UPDATE users
          SET is_frozen = TRUE,
              frozen_reason = $2,
              frozen_at = NOW(),
              frozen_by_admin_id = $3
        WHERE id = $1`,
      [req.params.id, reason.slice(0, 1000), req.admin.id]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'merchant.freeze', targetType: 'merchant', targetId: req.params.id,
      payloadBefore: { is_frozen: false },
      payloadAfter:  { is_frozen: true, reason },
      req,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/merchants freeze]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /:id/unfreeze ───────────────────────────────────────────────────────
router.post('/:id/unfreeze', async (req, res) => {
  try {
    const { rows: before } = await pool.query(
      `SELECT id, is_frozen, frozen_reason FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });
    if (!before[0].is_frozen) return res.status(409).json({ error: 'Compte non gelé.' });

    await pool.query(
      `UPDATE users
          SET is_frozen = FALSE,
              frozen_reason = NULL,
              frozen_at = NULL,
              frozen_by_admin_id = NULL
        WHERE id = $1`,
      [req.params.id]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'merchant.unfreeze', targetType: 'merchant', targetId: req.params.id,
      payloadBefore: { is_frozen: true, reason: before[0].frozen_reason },
      payloadAfter:  { is_frozen: false },
      req,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/merchants unfreeze]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /:id/sms-balance/adjust — ajout ou retrait manuel solde SMS ─────────
// Usage admin : compensation, geste commercial, correction bug Stripe.
// Body : { delta: number, reason: string }
//   delta > 0 → ajout
//   delta < 0 → retrait
// Garde-fous :
// - delta != 0
// - |delta| ≤ 1000 (cap par operation, plusieurs operations consecutives
//   restent possibles si justifie)
// - reason obligatoire (audit)
// - solde resultant >= 0 garanti par la contrainte DB users_sms_balance_nonneg
//   et verifie en amont pour retourner un 409 explicite plutot qu'un 500.
const SMS_BALANCE_DELTA_MAX = 1000;

router.post('/:id/sms-balance/adjust', async (req, res) => {
  const deltaRaw = req.body?.delta;
  const delta = typeof deltaRaw === 'number' ? deltaRaw : Number(deltaRaw);
  const reason = String(req.body?.reason || '').trim();

  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ error: 'Montant invalide.' });
  }
  if (Math.abs(delta) > SMS_BALANCE_DELTA_MAX) {
    return res.status(400).json({ error: `Cap par operation : ${SMS_BALANCE_DELTA_MAX} euros.` });
  }
  if (!reason) return res.status(400).json({ error: 'Motif requis.' });

  // Arrondi 2 decimales pour eviter les artefacts flottants en base.
  const deltaRounded = Math.round(delta * 100) / 100;

  try {
    const { rows: before } = await pool.query(
      `SELECT id, email, business_name, sms_balance FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });

    const currentBalance = Number(before[0].sms_balance) || 0;
    const newBalance = Math.round((currentBalance + deltaRounded) * 100) / 100;
    if (newBalance < 0) {
      return res.status(409).json({
        error: `Solde insuffisant : ${currentBalance.toFixed(2)} euros disponibles.`,
      });
    }

    // UPDATE atomique avec re-lecture du solde pour eviter une race condition
    // entre le SELECT et le UPDATE (ex : Stripe webhook concurrent).
    const { rows: updated } = await pool.query(
      `UPDATE users
          SET sms_balance = sms_balance + $2
        WHERE id = $1
          AND sms_balance + $2 >= 0
        RETURNING sms_balance`,
      [req.params.id, deltaRounded]
    );
    if (!updated.length) {
      return res.status(409).json({ error: 'Solde insuffisant (race).' });
    }

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: deltaRounded > 0 ? 'merchant.sms_balance.add' : 'merchant.sms_balance.subtract',
      targetType: 'merchant', targetId: req.params.id,
      payloadBefore: { sms_balance: currentBalance },
      payloadAfter:  { sms_balance: Number(updated[0].sms_balance), delta: deltaRounded, reason },
      req,
    });

    return res.json({
      ok: true,
      sms_balance: Number(updated[0].sms_balance),
      delta: deltaRounded,
    });
  } catch (e) {
    console.error('[admin/merchants sms_balance adjust]', e.message);
    // Contrainte DB users_sms_balance_nonneg
    if (e.code === '23514') {
      return res.status(409).json({ error: 'Solde insuffisant.' });
    }
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /:id/features — etat des feature flags ──────────────────────────────
// Renvoie un objet exhaustif { feature: true|false } pour chaque feature
// blocable (FEATURES). Default true si la cle est absente du JSONB.
router.get('/:id/features', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT feature_flags FROM users WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const stored = rows[0].feature_flags || {};
    const out = {};
    for (const f of FEATURES) {
      out[f] = stored[f] !== false; // absent OU true => active
    }
    return res.json({ features: out });
  } catch (e) {
    console.error('[admin/merchants features get]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── PATCH /:id/features — toggle une feature ─────────────────────────────────
// Body { feature: 'loyalty', enabled: false, reason: 'motif' }
router.patch('/:id/features', async (req, res) => {
  const feature = String(req.body?.feature || '').trim();
  const enabled = req.body?.enabled === true;
  const reason  = String(req.body?.reason || '').trim();

  if (!FEATURES.includes(feature)) {
    return res.status(400).json({ error: 'Feature inconnue.' });
  }
  if (!reason) return res.status(400).json({ error: 'Motif requis.' });

  try {
    const { rows: before } = await pool.query(
      `SELECT id, feature_flags FROM users WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });
    const oldFlags = before[0].feature_flags || {};
    const newFlags = { ...oldFlags, [feature]: enabled };

    await pool.query(
      `UPDATE users SET feature_flags = $2 WHERE id = $1`,
      [req.params.id, newFlags]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: enabled ? 'merchant.feature.enable' : 'merchant.feature.disable',
      targetType: 'merchant', targetId: req.params.id,
      payloadBefore: { [feature]: oldFlags[feature] !== false },
      payloadAfter:  { [feature]: enabled, reason },
      req,
    });

    return res.json({ ok: true, features: newFlags });
  } catch (e) {
    console.error('[admin/merchants features patch]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
