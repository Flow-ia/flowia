// adminTotp.js — Wrapper otplib RFC 6238 (TOTP 30s, SHA-1, 6 digits) + QR code.
// Volontairement encapsulé pour pouvoir changer de lib ou de paramètres sans
// toucher aux routes.

const { authenticator } = require('otplib');
const QRCode = require('qrcode');

// 30s window, 6 digits, SHA-1 — paramètres compatibles Google Authenticator,
// Authy, 1Password, Microsoft Authenticator. ±1 step de tolérance pour absorber
// le décalage horloge client/serveur (typique : <30s).
authenticator.options = { step: 30, digits: 6, window: 1 };

const ISSUER = process.env.ADMIN_TOTP_ISSUER || 'FlowIA Admin';

function generateSecret() {
  return authenticator.generateSecret();
}

function buildOtpAuthUrl({ email, secret }) {
  return authenticator.keyuri(email, ISSUER, secret);
}

async function buildQrDataUrl({ email, secret }) {
  const url = buildOtpAuthUrl({ email, secret });
  return await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
}

function verifyToken({ token, secret }) {
  if (!token || !secret) return false;
  const clean = String(token).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  try { return authenticator.check(clean, secret); }
  catch { return false; }
}

module.exports = {
  generateSecret,
  buildOtpAuthUrl,
  buildQrDataUrl,
  verifyToken,
  ISSUER,
};
