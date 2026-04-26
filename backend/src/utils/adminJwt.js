// adminJwt.js — Sign/verify JWT admin avec secrets totalement séparés des
// JWT merchant. Trois types de tokens distincts par claim `step` :
//   - 'final'   : access token plein droit (req.admin set, routes protégées)
//   - 'pre-2fa' : challenge intermédiaire après email/password OK, autorise
//                 uniquement /auth/login/2fa
//   - 'refresh' : refresh token long-lived, signé avec un secret distinct
//
// Le claim `step` est une défense en profondeur : même si quelqu'un parvient à
// utiliser un pre-2fa token comme bearer, le middleware adminAuth le rejette.

const jwt = require('jsonwebtoken');

const ACCESS_SECRET  = process.env.ADMIN_JWT_SECRET;
const REFRESH_SECRET = process.env.ADMIN_JWT_REFRESH_SECRET;
const ACCESS_TTL    = '15m';
const REFRESH_TTL   = '7d';
const TWOFA_TTL     = '5m';
const ISSUER        = 'flowia-admin';

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  console.warn('[adminJwt] ADMIN_JWT_SECRET / ADMIN_JWT_REFRESH_SECRET non configurés — le panel admin retournera 404 sur toutes les routes protégées tant que les variables ne sont pas définies.');
}

function signAccess(payload) {
  return jwt.sign({ ...payload, step: 'final' }, ACCESS_SECRET, {
    expiresIn: ACCESS_TTL, issuer: ISSUER,
  });
}
function signTwoFactorChallenge(payload) {
  return jwt.sign({ ...payload, step: 'pre-2fa' }, ACCESS_SECRET, {
    expiresIn: TWOFA_TTL, issuer: ISSUER,
  });
}
function signRefresh(payload) {
  return jwt.sign({ ...payload, step: 'refresh' }, REFRESH_SECRET, {
    expiresIn: REFRESH_TTL, issuer: ISSUER,
  });
}

function verifyAccess(token) {
  const p = jwt.verify(token, ACCESS_SECRET, { issuer: ISSUER });
  if (p.step !== 'final') {
    const err = new Error('wrong_step');
    err.code = 'WRONG_STEP';
    throw err;
  }
  return p;
}
function verifyTwoFactorChallenge(token) {
  const p = jwt.verify(token, ACCESS_SECRET, { issuer: ISSUER });
  if (p.step !== 'pre-2fa') {
    const err = new Error('wrong_step');
    err.code = 'WRONG_STEP';
    throw err;
  }
  return p;
}
function verifyRefresh(token) {
  const p = jwt.verify(token, REFRESH_SECRET, { issuer: ISSUER });
  if (p.step !== 'refresh') {
    const err = new Error('wrong_step');
    err.code = 'WRONG_STEP';
    throw err;
  }
  return p;
}

module.exports = {
  signAccess,
  signTwoFactorChallenge,
  signRefresh,
  verifyAccess,
  verifyTwoFactorChallenge,
  verifyRefresh,
};
