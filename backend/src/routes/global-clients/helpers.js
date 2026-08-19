// src/routes/global-clients/helpers.js — helpers partagés entre sous-modules
// Constantes (EMAIL_RE) + middlewares auth (globalClientAuth, clientOrGlobalClientAuth)
// + gestion OTP (saveCode/getCode/deleteCode) sur la table verification_codes.
const jwt      = require('jsonwebtoken');
const { pool } = require('../../db');
const { extractClientToken } = require('../../utils/clientCookies');

// Regex email commune aux routes register/reset/invite. Rejette `a@@b`, espaces,
// caractères exotiques, emails >254 chars (RFC 5321 SMTP cap).
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
function isValidEmail(e) {
  return typeof e === 'string' && e.length <= 254 && EMAIL_RE.test(e.trim());
}
// Vérifie qu'une chaîne YYYY-MM-DD est bien une date réelle (ex: 2024-02-31 refusé)
function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware : authentification compte client global
// ─────────────────────────────────────────────────────────────────────────────

// Cache mémoire des global_clients bloqués/actifs. Même rationale que le
// merchant authMiddleware : enforcement quasi-temps-réel après un blocage admin
// (cross-merchant) sans taper la DB à chaque appel API authentifié.
const BLOCKED_CACHE_TTL_MS = 30_000;
const blockedCache = new Map(); // globalClientId → { isBlocked, expiresAt }

async function isGlobalClientBlocked(globalClientId) {
  if (!globalClientId) return false;
  const cached = blockedCache.get(globalClientId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.isBlocked;
  try {
    const { rows } = await pool.query(
      'SELECT is_blocked FROM global_clients WHERE id = $1 LIMIT 1',
      [globalClientId]
    );
    const isBlocked = !!(rows[0]?.is_blocked);
    blockedCache.set(globalClientId, { isBlocked, expiresAt: now + BLOCKED_CACHE_TTL_MS });
    return isBlocked;
  } catch (e) {
    console.error('[helpers.isGlobalClientBlocked]', e.message);
    return cached?.isBlocked ?? false;
  }
}

function blockedResponse(res) {
  return res.status(403).json({
    error: 'Votre compte est bloqué. Merci de contacter notre équipe administrateurs Salon DZ pour plus de détails.',
    code: 'ACCOUNT_BLOCKED',
  });
}

async function globalClientAuth(req, res, next) {
  // Migration cookies HttpOnly : token lu depuis ff_gc_token / ff_client_token
  // (priorité) puis fallback Authorization: Bearer pour les anciens clients
  // dont le frontend stocke encore le token en localStorage.
  const tok = extractClientToken(req);
  if (!tok) return res.status(401).json({ error: 'Non authentifié.' });
  let dec;
  try { dec = jwt.verify(tok, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Session expirée.' }); }
  if (dec.scope !== 'global_client') return res.status(401).json({ error: 'Token invalide.' });
  if (await isGlobalClientBlocked(dec.globalClientId)) return blockedResponse(res);
  req.globalClient = dec;
  next();
}

// Auth unifié : accepte scope='global_client' OU scope='client' lié à un
// global_client (globalClientId présent). Les endpoints parrainage utilisent
// ce middleware car le client s'authentifie via ff_client_token (login
// commerçant) — ff_gc_token n'est jamais écrit côté front.
async function clientOrGlobalClientAuth(req, res, next) {
  const tok = extractClientToken(req);
  if (!tok) return res.status(401).json({ error: 'Non authentifié.' });
  let dec;
  try { dec = jwt.verify(tok, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Session expirée.' }); }
  if (dec.scope === 'global_client' && dec.globalClientId) {
    if (await isGlobalClientBlocked(dec.globalClientId)) return blockedResponse(res);
    req.globalClient = dec;
    return next();
  }
  if (dec.scope === 'client' && dec.globalClientId) {
    if (await isGlobalClientBlocked(dec.globalClientId)) return blockedResponse(res);
    req.globalClient = { globalClientId: dec.globalClientId, email: dec.email };
    return next();
  }
  return res.status(401).json({ error: 'Token invalide.' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers : stockage temporaire des codes OTP (même système que auth.js)
// Utilise la table verification_codes — fiable, déjà en place, pas de migration
// ─────────────────────────────────────────────────────────────────────────────
async function saveCode(key, code, data, minutes = 15) {
  const expires = new Date(Date.now() + minutes * 60 * 1000);
  await pool.query(
    `INSERT INTO verification_codes (key, code, data, expires_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (key) DO UPDATE SET code=$2, data=$3, expires_at=$4`,
    [key, code, data, expires]
  );
}
async function getCode(key) {
  const { rows } = await pool.query('SELECT * FROM verification_codes WHERE key=$1', [key]);
  if (!rows.length) return null;
  if (new Date(rows[0].expires_at) < new Date()) {
    await pool.query('DELETE FROM verification_codes WHERE key=$1', [key]);
    return null;
  }
  return { code: rows[0].code, data: rows[0].data || {} };
}
async function deleteCode(key) {
  await pool.query('DELETE FROM verification_codes WHERE key=$1', [key]);
}

module.exports = {
  EMAIL_RE,
  isValidEmail,
  isRealDate,
  globalClientAuth,
  clientOrGlobalClientAuth,
  isGlobalClientBlocked,
  saveCode,
  getCode,
  deleteCode,
};
