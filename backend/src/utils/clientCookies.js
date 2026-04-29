// src/utils/clientCookies.js
//
// Cookies HttpOnly pour les sessions clients (booking + global).
//
// - ff_client_token : session client liée à un commerçant (scope='client',
//   issu de POST /pub/:slug/client/login, register, quick-register, OAuth).
// - ff_gc_token     : session compte global cross-salons (scope='global_client',
//   issu de POST /api/global-clients/login, register, activate).
//
// Migration depuis localStorage : le backend set les 2 cookies en plus de
// retourner le token dans le body (rétro-compat). Le middleware accepte les
// 2 canaux (cookie + header Authorization) pendant la fenêtre de transition.
// Une fois le frontend migré et les anciens tokens en localStorage expirés
// (TTL JWT 30 j), on pourra retirer le retour body et le fallback header.

const IS_PROD = process.env.NODE_ENV === 'production';
const TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 jours, identique au JWT

// Path = / pour que le cookie remonte sur /api/* sans contrainte. Le backend
// est sur un domaine distinct du frontend (Render vs Vercel) en prod, d'où
// SameSite=None + Secure obligatoires (sinon le navigateur n'envoie pas le
// cookie sur les requêtes cross-site déclenchées depuis le booking public).
function buildCookie(name, value, { maxAgeSec, clear = false } = {}) {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${IS_PROD ? 'None' : 'Lax'}`,
  ];
  if (IS_PROD) parts.push('Secure');
  if (clear) parts.push('Max-Age=0');
  else if (typeof maxAgeSec === 'number') parts.push(`Max-Age=${maxAgeSec}`);
  return parts.join('; ');
}

function appendCookie(res, cookieStr) {
  const prev = res.getHeader('Set-Cookie');
  if (!prev) return res.setHeader('Set-Cookie', cookieStr);
  if (Array.isArray(prev)) return res.setHeader('Set-Cookie', [...prev, cookieStr]);
  return res.setHeader('Set-Cookie', [prev, cookieStr]);
}

function setClientCookie(res, token) {
  appendCookie(res, buildCookie('ff_client_token', encodeURIComponent(token), { maxAgeSec: TTL_MS / 1000 }));
}

function setGcCookie(res, token) {
  appendCookie(res, buildCookie('ff_gc_token', encodeURIComponent(token), { maxAgeSec: TTL_MS / 1000 }));
}

function clearClientCookie(res) {
  appendCookie(res, buildCookie('ff_client_token', '', { clear: true }));
}

function clearGcCookie(res) {
  appendCookie(res, buildCookie('ff_gc_token', '', { clear: true }));
}

// Lit un cookie sans dépendre de cookie-parser (le backend ne l'utilise pas
// ailleurs — admin/auth.js a son propre parser inline, on garde la même
// approche pour ne pas ajouter de dépendance).
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  if (!raw) return null;
  for (const piece of raw.split(';')) {
    const idx = piece.indexOf('=');
    if (idx === -1) continue;
    const k = piece.slice(0, idx).trim();
    if (k !== name) continue;
    try { return decodeURIComponent(piece.slice(idx + 1).trim()); }
    catch { return null; }
  }
  return null;
}

// Extrait le JWT client depuis le cookie ff_client_token OU le header
// Authorization: Bearer (priorité au cookie pour favoriser le canal sécurisé).
// Renvoie null si aucun des deux n'est présent.
function extractClientToken(req) {
  return readCookie(req, 'ff_client_token')
      || readCookie(req, 'ff_gc_token')
      || (req.headers.authorization?.startsWith('Bearer ')
            ? req.headers.authorization.slice(7)
            : null);
}

module.exports = {
  setClientCookie,
  setGcCookie,
  clearClientCookie,
  clearGcCookie,
  readCookie,
  extractClientToken,
};
