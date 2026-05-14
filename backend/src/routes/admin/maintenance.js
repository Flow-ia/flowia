// routes/admin/maintenance.js — Toggle plateforme par super-admin.
// Permet d'activer/desactiver la maintenance sur 3 perimetres independants
// (merchant_portal, booking_public, merchant_signup) avec message custom +
// whitelist de bypass (emails et user_ids).
//
// Toutes les modifications sont audit-logged dans admin_audit_log.

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');
const { logAuditAction } = require('../../services/adminAudit');
const {
  getMaintenanceState,
  invalidateMaintenanceCache,
} = require('../../utils/platformSettings');

const router = express.Router();
router.use(adminAuth);

const SCOPES = ['merchant_portal', 'booking_public', 'merchant_signup'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── GET / — etat actuel ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const state = await getMaintenanceState();
    res.json(state);
  } catch (e) {
    res.status(500).json({ error: 'lecture impossible' });
  }
});

// ── PATCH / — update partiel ────────────────────────────────────────────────
// Accepte un payload avec n'importe lequel des champs :
//   { merchant_portal: { enabled?, message? },
//     booking_public:  { enabled?, message? },
//     merchant_signup: { enabled?, message? },
//     bypass_emails:   ["..."],   // remplacement complet de la liste
//     bypass_user_ids: ["..."] }
router.patch('/', async (req, res) => {
  const body = req.body || {};

  // Validation stricte (regle #10 robustesse : validation aux limites).
  const errors = [];
  for (const scope of SCOPES) {
    const s = body[scope];
    if (s === undefined) continue;
    if (typeof s !== 'object' || s === null) {
      errors.push(scope + ' doit etre un objet');
      continue;
    }
    if (s.enabled !== undefined && typeof s.enabled !== 'boolean') {
      errors.push(scope + '.enabled doit etre boolean');
    }
    if (s.message !== undefined) {
      if (typeof s.message !== 'string') errors.push(scope + '.message doit etre string');
      else if (s.message.length > 1000)  errors.push(scope + '.message > 1000 chars');
    }
  }
  if (body.bypass_emails !== undefined) {
    if (!Array.isArray(body.bypass_emails)) {
      errors.push('bypass_emails doit etre un array');
    } else if (body.bypass_emails.length > 50) {
      errors.push('bypass_emails > 50 entrees');
    } else {
      for (const e of body.bypass_emails) {
        if (typeof e !== 'string' || !EMAIL_RE.test(e)) {
          errors.push('bypass_emails contient un email invalide: ' + String(e).slice(0, 50));
          break;
        }
      }
    }
  }
  if (body.bypass_user_ids !== undefined) {
    if (!Array.isArray(body.bypass_user_ids)) {
      errors.push('bypass_user_ids doit etre un array');
    } else if (body.bypass_user_ids.length > 50) {
      errors.push('bypass_user_ids > 50 entrees');
    } else {
      for (const u of body.bypass_user_ids) {
        if (typeof u !== 'string' || !UUID_RE.test(u)) {
          errors.push('bypass_user_ids contient un id non-UUID: ' + String(u).slice(0, 50));
          break;
        }
      }
    }
  }
  if (errors.length) {
    return res.status(400).json({ error: 'validation', details: errors });
  }

  try {
    // Atomicite : lecture + merge + ecriture en transaction.
    await pool.query('BEGIN');
    const { rows } = await pool.query(
      `SELECT value FROM platform_settings WHERE key='maintenance' FOR UPDATE`
    );
    const before = rows[0]?.value || {};

    const next = {
      merchant_portal:  { ...(before.merchant_portal  || { enabled: false, message: '' }) },
      booking_public:   { ...(before.booking_public   || { enabled: false, message: '' }) },
      merchant_signup:  { ...(before.merchant_signup  || { enabled: false, message: '' }) },
      bypass_emails:    Array.isArray(before.bypass_emails)   ? [...before.bypass_emails]   : [],
      bypass_user_ids:  Array.isArray(before.bypass_user_ids) ? [...before.bypass_user_ids] : [],
    };
    for (const scope of SCOPES) {
      const s = body[scope];
      if (!s) continue;
      if (s.enabled !== undefined) next[scope].enabled = s.enabled;
      if (s.message !== undefined) next[scope].message = s.message;
    }
    if (body.bypass_emails !== undefined) {
      next.bypass_emails = body.bypass_emails.map(e => String(e).toLowerCase().trim());
    }
    if (body.bypass_user_ids !== undefined) {
      next.bypass_user_ids = body.bypass_user_ids.map(u => String(u).toLowerCase().trim());
    }

    await pool.query(
      `UPDATE platform_settings
          SET value = $1::jsonb,
              updated_at = NOW(),
              updated_by_admin_id = $2
        WHERE key = 'maintenance'`,
      [JSON.stringify(next), req.admin.id]
    );
    await pool.query('COMMIT');

    invalidateMaintenanceCache();

    await logAuditAction({
      adminId:       req.admin.id,
      adminEmail:    req.admin.email,
      action:        'platform_settings.maintenance.update',
      targetType:    'platform_settings',
      targetId:      null,
      payloadBefore: before,
      payloadAfter:  next,
      req,
    });

    res.json(next);
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('[admin/maintenance PATCH]', e.message);
    await logAuditAction({
      adminId:      req.admin.id,
      adminEmail:   req.admin.email,
      action:       'platform_settings.maintenance.update',
      targetType:   'platform_settings',
      status:       'failure',
      errorMessage: e.message,
      req,
    }).catch(() => {});
    res.status(500).json({ error: 'update impossible' });
  }
});

module.exports = router;
