// adminJwt.js — Sign/verify JWT admin avec secrets totalement séparés des
// JWT merchant. La sécurité de l'isolation admin/merchant repose sur le fait
// qu'aucun token signé avec JWT_SECRET (merchant) ne peut être validé ici.

const jwt = require('jsonwebtoken');

const ACCESS_SECRET  = process.env.ADMIN_JWT_SECRET;
const REFRESH_SECRET = process.env.ADMIN_JWT_REFRESH_SECRET;
const ACCESS_TTL  = '15m';
const REFRESH_TTL = '7d';

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  console.warn('[adminJwt] ADMIN_JWT_SECRET / ADMIN_JWT_REFRESH_SECRET non configurés — le panel admin retournera 404 sur toutes les routes protégées tant que les variables ne sont pas définies.');
}

function signAccess(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL, issuer: 'flowia-admin' });
}
function signRefresh(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL, issuer: 'flowia-admin' });
}
function verifyAccess(token) {
  return jwt.verify(token, ACCESS_SECRET, { issuer: 'flowia-admin' });
}
function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_SECRET, { issuer: 'flowia-admin' });
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh };
