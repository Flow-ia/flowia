// routes/admin/auth.js — Endpoints login / refresh / logout / me + 2FA TOTP.
// Sécurité : rate-limit dédié, lock après 5 échecs (30 min), refresh token en
// cookie httpOnly, audit log à chaque action, alerte email à chaque login
// réussi, claim `step` JWT pour empêcher l'utilisation d'un challenge pre-2fa
// comme access token.

const express   = require('express');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const { pool } = require('../../db');
const {
  signAccess,
  signTwoFactorChallenge,
  signRefresh,
  verifyAccess,
  verifyTwoFactorChallenge,
  verifyRefresh,
} = require('../../utils/adminJwt');
const { adminAuth } = require('../../middleware/adminAuth');
const { logAuditAction } = require('../../services/adminAudit');
const { generateSecret, buildQrDataUrl, verifyToken } = require('../../services/adminTotp');
const { sendLoginAlertEmail } = require('../../services/adminLoginAlert');

const router = express.Router();

const REFRESH_COOKIE      = 'flowia_admin_refresh';
const REFRESH_COOKIE_PATH = '/api/admin/auth';
const REFRESH_TTL_MS      = 7 * 24 * 60 * 60 * 1000;
const LOCK_THRESHOLD      = 5;
const IS_PROD             = process.env.NODE_ENV === 'production';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5,
  message: { error: 'Identifiants invalides.' },
  standardHeaders: true, legacyHeaders: false,
});
// Le second facteur est cap à 5 tentatives / 5 min — TOTP a 1 000 000 codes,
// 5 tentatives par fenêtre = bruteforce statistique impossible (le challenge
// expire en 5 min de toute façon).
const twoFactorLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, max: 5,
  message: { error: 'Trop de tentatives. Recommencez la connexion.' },
  standardHeaders: true, legacyHeaders: false,
});

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

async function issueSession(res, admin, req) {
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

  // Email d'alerte fire-and-forget (n'awaite pas pour ne pas ralentir la
  // réponse, et toute erreur est silencieuse côté service).
  sendLoginAlertEmail({
    adminEmail: admin.email,
    adminName: admin.name,
    ip,
    userAgent: req.headers['user-agent'],
    when: new Date(),
  }).catch(() => {});

  return {
    accessToken,
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  };
}

// ── POST /login ──────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const generic = () => res.status(401).json({ error: 'Identifiants invalides.' });

  if (!email || !password) return generic();

  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, role, password_hash, is_active,
              failed_login_attempts, locked_until,
              totp_enabled, totp_secret
         FROM admin_users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1`,
      [String(email).trim()]
    );
    const admin = rows[0];

    if (!admin) {
      await logAuditAction({ adminEmail: email, action: 'auth.login.failure', status: 'failure', errorMessage: 'unknown_email', req });
      return generic();
    }
    if (!admin.is_active) {
      await logAuditAction({ adminId: admin.id, adminEmail: admin.email, action: 'auth.login.failure', status: 'failure', errorMessage: 'account_disabled', req });
      return generic();
    }
    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      await logAuditAction({ adminId: admin.id, adminEmail: admin.email, action: 'auth.login.failure', status: 'failure', errorMessage: 'account_locked', req });
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
              SET failed_login_attempts = $2, updated_at = NOW()
            WHERE id = $1`,
          [admin.id, newAttempts]
        );
      }
      await logAuditAction({ adminId: admin.id, adminEmail: admin.email, action: 'auth.login.failure', status: 'failure', errorMessage: 'wrong_password', req });
      return generic();
    }

    // Mot de passe OK. Si 2FA activé → challenge intermédiaire.
    if (admin.totp_enabled && admin.totp_secret) {
      const twoFactorToken = signTwoFactorChallenge({ adminId: admin.id });
      await logAuditAction({ adminId: admin.id, adminEmail: admin.email, action: 'auth.login.password.success', req });
      return res.json({ requires2fa: true, twoFactorToken });
    }

    const session = await issueSession(res, admin, req);
    await logAuditAction({ adminId: admin.id, adminEmail: admin.email, action: 'auth.login.success', req });
    return res.json(session);
  } catch (e) {
    console.error('[admin/auth/login]', e.message);
    return generic();
  }
});

// ── POST /login/2fa ──────────────────────────────────────────────────────────
router.post('/login/2fa', twoFactorLimiter, async (req, res) => {
  const { twoFactorToken, code } = req.body || {};
  const generic = () => res.status(401).json({ error: 'Code invalide.' });

  if (!twoFactorToken || !code) return generic();

  let payload;
  try { payload = verifyTwoFactorChallenge(twoFactorToken); }
  catch {
    await logAuditAction({ action: 'auth.login.2fa.failure', status: 'failure', errorMessage: 'invalid_or_expired_challenge', req });
    return generic();
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, role, totp_secret, totp_enabled, is_active
         FROM admin_users WHERE id = $1 LIMIT 1`,
      [payload.adminId]
    );
    const admin = rows[0];
    if (!admin || !admin.is_active || !admin.totp_enabled || !admin.totp_secret) {
      await logAuditAction({ adminId: payload.adminId, action: 'auth.login.2fa.failure', status: 'failure', errorMessage: 'admin_not_eligible', req });
      return generic();
    }

    const ok = verifyToken({ token: code, secret: admin.totp_secret });
    if (!ok) {
      await logAuditAction({ adminId: admin.id, adminEmail: admin.email, action: 'auth.login.2fa.failure', status: 'failure', errorMessage: 'wrong_code', req });
      return generic();
    }

    const session = await issueSession(res, admin, req);
    await logAuditAction({ adminId: admin.id, adminEmail: admin.email, action: 'auth.login.success', req });
    return res.json(session);
  } catch (e) {
    console.error('[admin/auth/login/2fa]', e.message);
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
    await logAuditAction({ action: 'auth.refresh.failure', status: 'failure', errorMessage: 'invalid_token', req });
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
      await logAuditAction({ adminId: payload.adminId, action: 'auth.refresh.failure', status: 'failure', errorMessage: 'admin_inactive_or_missing', req });
      return fail();
    }
    const admin = rows[0];
    const accessToken = signAccess({ adminId: admin.id, email: admin.email, role: admin.role });

    await logAuditAction({ adminId: admin.id, adminEmail: admin.email, action: 'auth.refresh.success', req });
    return res.json({ accessToken });
  } catch (e) {
    console.error('[admin/auth/refresh]', e.message);
    return fail();
  }
});

// ── POST /logout ─────────────────────────────────────────────────────────────
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
      `SELECT id, email, name, role, last_login_at, totp_enabled
         FROM admin_users WHERE id = $1 LIMIT 1`,
      [req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(rows[0]);
  } catch (e) {
    console.error('[admin/auth/me]', e.message);
    return res.status(404).json({ error: 'Not found' });
  }
});

// ── GET /2fa/setup ───────────────────────────────────────────────────────────
// Génère un secret + QR code mais ne persiste rien : l'admin doit confirmer
// avec un code valide via /2fa/enable pour que ce soit activé.
router.get('/2fa/setup', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT totp_enabled, email FROM admin_users WHERE id = $1 LIMIT 1`,
      [req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].totp_enabled) {
      return res.status(409).json({ error: 'La 2FA est déjà activée. Désactivez-la d\'abord pour en regénérer une.' });
    }
    const secret = generateSecret();
    const qrDataUrl = await buildQrDataUrl({ email: rows[0].email, secret });
    await logAuditAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'auth.2fa.setup', req });
    return res.json({ secret, qrDataUrl });
  } catch (e) {
    console.error('[admin/auth/2fa/setup]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /2fa/enable ─────────────────────────────────────────────────────────
router.post('/2fa/enable', adminAuth, async (req, res) => {
  const { secret, code } = req.body || {};
  if (!secret || !code) return res.status(400).json({ error: 'secret + code requis.' });

  try {
    const { rows } = await pool.query(
      `SELECT totp_enabled FROM admin_users WHERE id = $1 LIMIT 1`,
      [req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].totp_enabled) {
      return res.status(409).json({ error: 'La 2FA est déjà activée.' });
    }

    if (!verifyToken({ token: code, secret })) {
      await logAuditAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'auth.2fa.enable.failure', status: 'failure', errorMessage: 'wrong_code', req });
      return res.status(400).json({ error: 'Code invalide. Vérifiez l\'heure de votre appareil.' });
    }

    await pool.query(
      `UPDATE admin_users
          SET totp_secret = $2, totp_enabled = TRUE, updated_at = NOW()
        WHERE id = $1`,
      [req.admin.id, secret]
    );
    await logAuditAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'auth.2fa.enable.success', req });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/auth/2fa/enable]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /2fa/disable ────────────────────────────────────────────────────────
// Re-auth obligatoire (mot de passe + code TOTP) pour désactiver — empêche un
// admin compromis de se faire désactiver le 2FA via session volée.
router.post('/2fa/disable', adminAuth, async (req, res) => {
  const { password, code } = req.body || {};
  if (!password || !code) return res.status(400).json({ error: 'Mot de passe + code requis.' });

  try {
    const { rows } = await pool.query(
      `SELECT password_hash, totp_secret, totp_enabled
         FROM admin_users WHERE id = $1 LIMIT 1`,
      [req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const admin = rows[0];

    if (!admin.totp_enabled || !admin.totp_secret) {
      return res.status(409).json({ error: 'La 2FA n\'est pas activée.' });
    }
    const okPwd = await bcrypt.compare(password, admin.password_hash);
    if (!okPwd) {
      await logAuditAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'auth.2fa.disable.failure', status: 'failure', errorMessage: 'wrong_password', req });
      return res.status(400).json({ error: 'Mot de passe ou code invalide.' });
    }
    if (!verifyToken({ token: code, secret: admin.totp_secret })) {
      await logAuditAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'auth.2fa.disable.failure', status: 'failure', errorMessage: 'wrong_code', req });
      return res.status(400).json({ error: 'Mot de passe ou code invalide.' });
    }

    await pool.query(
      `UPDATE admin_users
          SET totp_secret = NULL, totp_enabled = FALSE, updated_at = NOW()
        WHERE id = $1`,
      [req.admin.id]
    );
    await logAuditAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'auth.2fa.disable.success', req });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/auth/2fa/disable]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
