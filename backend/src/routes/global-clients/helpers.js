// src/routes/global-clients/helpers.js — helpers partagés entre sous-modules
// Constantes (EMAIL_RE) + middlewares auth (globalClientAuth, clientOrGlobalClientAuth)
// + gestion OTP (saveCode/getCode/deleteCode) sur la table verification_codes.
const jwt      = require('jsonwebtoken');
const { pool } = require('../../db');

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
function globalClientAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    const dec = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    if (dec.scope !== 'global_client') return res.status(401).json({ error: 'Token invalide.' });
    req.globalClient = dec;
    next();
  } catch { res.status(401).json({ error: 'Session expirée.' }); }
}

// Auth unifié : accepte scope='global_client' OU scope='client' lié à un
// global_client (globalClientId présent). Les endpoints parrainage utilisent
// ce middleware car le client s'authentifie via ff_client_token (login
// commerçant) — ff_gc_token n'est jamais écrit côté front.
function clientOrGlobalClientAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    const dec = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    if (dec.scope === 'global_client' && dec.globalClientId) {
      req.globalClient = dec;
      return next();
    }
    if (dec.scope === 'client' && dec.globalClientId) {
      req.globalClient = { globalClientId: dec.globalClientId, email: dec.email };
      return next();
    }
    return res.status(401).json({ error: 'Token invalide.' });
  } catch { res.status(401).json({ error: 'Session expirée.' }); }
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
  saveCode,
  getCode,
  deleteCode,
};
