// routes/admin/auth.js — Endpoints login / refresh / logout / me admin.
// Sécurité : rate-limit dédié, lock après 5 échecs (30 min), refresh token en
// cookie httpOnly, audit log à chaque action (succès et échec).

const express   = require('express');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const { pool } = require('../../db');
const { signAccess, signRefresh, verifyAccess, verifyRefresh } = require('../../utils/adminJwt');
const { adminAuth } = require('../../middleware/adminAuth');
const { logAuditAction } = require('../../services/adminAudit');

const router = express.Router();

const REFRESH_COOKIE      = 'flowia_admin_refresh';
const REFRESH_COOKIE_PATH = '/api/admin/auth';
const REFRESH_TTL_MS      = 7 * 24 * 60 * 60 * 1000;
const LOCK_THRESHOLD      = 5;
const IS_PROD             = process.env.NODE_ENV === 'production';

// Rate-limit dédié /login : 5 tentatives / 15 min / IP. Plus strict que les
// rate-limiters merchant (loginLimiter général = 10/5min). Le compte est en
// plus locké côté DB après 5 échecs (LOCK_THRESHOLD), donc défense en
// profondeur : IP × compte.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Identifiants invalides.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Parsing manuel du Cookie header — évite la dépendance cookie-parser.
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const piece of raw.split(';')) {
    const idx = piece.indexOf('=');
    if (idx === -1) continue;
    const k = piece.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(piece.slice(idx + 1).trim());
  }
  return null;
}

function setRefreshCookie(res, token) {
  const parts = [
    `${REFRESH_COOKIE}=${encodeURIComponent(token)}`,
    `Path=${REFRESH_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(REFRESH_TTL_MS / 1000)}`,
  ];
  if (IS_PROD) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearRefreshCookie(res) {
  const parts = [
    `${REFRESH_COOKIE}=`,
    `Path=${REFRESH_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (IS_PROD) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// ── POST /login ──────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const generic = () => res.status(401).json({ error: 'Identifiants invalides.' });

  if (!email || !password) return generic();

  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, role, password_hash, is_active,
              failed_login_attempts, locked_until
         FROM admin_users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1`,
      [String(email).trim()]
    );
    const admin = rows[0];

    if (!admin) {
      await logAuditAction({
        adminEmail: email, action: 'auth.login.failure',
        status: 'failure', errorMessage: 'unknown_email', req,
      });
      return generic();
    }

    if (!admin.is_active) {
      await logAuditAction({
        adminId: admin.id, adminEmail: admin.email,
        action: 'auth.login.failure', status: 'failure',
        errorMessage: 'account_disabled', req,
      });
      return generic();
    }

    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      await logAuditAction({
        adminId: admin.id, adminEmail: admin.email,
        action: 'auth.login.failure', status: 'failure',
        errorMessage: 'account_locked', req,
      });
      return generic();
    }

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) {
      const newAttempts = (admin.failed_login_attempts || 0) + 1;
      if (newAttempts >= LOCK_THRESHOLD) {
        await pool.query(
          `UPDATE admin_users
              SET failed_login_attempts = 0,
                  locked_until = NOW() + INTERVAL '30 minutes',
                  updated_at = NOW()
            WHERE id = $1`,
          [admin.id]
        );
      } else {
        await pool.query(
          `UPDATE admin_users
              SET failed_login_attempts = $2,
                  updated_at = NOW()
            WHERE id = $1`,
          [admin.id, newAttempts]
        );
      }
      await logAuditAction({
        adminId: admin.id, adminEmail: admin.email,
        action: 'auth.login.failure', status: 'failure',
        errorMessage: 'wrong_password', req,
      });
      return generic();
    }

    const ip = req.ip || null;
    await pool.query(
      `UPDATE admin_users
          SET failed_login_attempts = 0, locked_until = NULL,
              last_login_at = NOW(),
              last_login_ip = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [admin.id, ip ? String(ip).slice(0, 45) : null]
    );

    const accessToken  = signAccess({ adminId: admin.id, email: admin.email, role: admin.role });
    const refreshToken = signRefresh({ adminId: admin.id });
    setRefreshCookie(res, refreshToken);

    await logAuditAction({
      adminId: admin.id, adminEmail: admin.email,
      action: 'auth.login.success', req,
    });

    return res.json({
      accessToken,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    });
  } catch (e) {
    console.error('[admin/auth/login]', e.message);
    return generic();
  }
});

// ── POST /refresh ────────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const token = getCookie(req, REFRESH_COOKIE);
  const fail = () => {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Session expirée.' });
  };

  if (!token) return fail();

  let payload;
  try { payload = verifyRefresh(token); }
  catch {
    await logAuditAction({
      action: 'auth.refresh.failure', status: 'failure',
      errorMessage: 'invalid_token', req,
    });
    return fail();
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, role
         FROM admin_users
        WHERE id = $1 AND is_active = TRUE
        LIMIT 1`,
      [payload.adminId]
    );
    if (!rows.length) {
      await logAuditAction({
        adminId: payload.adminId,
        action: 'auth.refresh.failure', status: 'failure',
        errorMessage: 'admin_inactive_or_missing', req,
      });
      return fail();
    }
    const admin = rows[0];
    const accessToken = signAccess({ adminId: admin.id, email: admin.email, role: admin.role });

    await logAuditAction({
      adminId: admin.id, adminEmail: admin.email,
      action: 'auth.refresh.success', req,
    });

    return res.json({ accessToken });
  } catch (e) {
    console.error('[admin/auth/refresh]', e.message);
    return fail();
  }
});

// ── POST /logout ─────────────────────────────────────────────────────────────
// Best-effort : tolère un access token absent ou expiré (l'utilisateur doit
// pouvoir se déconnecter même si sa session est expirée). Audit toujours logé.
router.post('/logout', async (req, res) => {
  let adminId = null, adminEmail = null;
  const m = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (m) {
    try {
      const p = verifyAccess(m[1]);
      adminId = p.adminId || null;
      adminEmail = p.email || null;
    } catch { /* token invalide ou expiré → log anonyme */ }
  }
  await logAuditAction({ adminId, adminEmail, action: 'auth.logout', req });
  clearRefreshCookie(res);
  return res.json({ ok: true });
});

// ── GET /me ──────────────────────────────────────────────────────────────────
router.get('/me', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, role, last_login_at
         FROM admin_users
        WHERE id = $1
        LIMIT 1`,
      [req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(rows[0]);
  } catch (e) {
    console.error('[admin/auth/me]', e.message);
    return res.status(404).json({ error: 'Not found' });
  }
});

module.exports = router;
