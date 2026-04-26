// adminLoginAlert.js — Email d'alerte envoyé à l'admin sur chaque login réussi.
// Volontairement fire-and-forget (try/catch silencieux) : si Brevo plante ou
// quota atteint, le login doit quand même réussir.

const { sendEmail } = require('../utils/email');

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendLoginAlertEmail({ adminEmail, adminName, ip, userAgent, when }) {
  if (!adminEmail) return;
  const dateStr = (when || new Date()).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const safeIp = escapeHtml(ip || 'inconnue');
  const safeUa = escapeHtml((userAgent || 'inconnu').slice(0, 200));
  const safeName = escapeHtml(adminName || 'Admin');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f6f7f9;margin:0;padding:32px 16px;color:#111;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;padding:28px;">
    <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">FlowIA Admin</div>
    <h1 style="font-size:18px;font-weight:500;margin:0 0 16px 0;">Nouvelle connexion détectée</h1>
    <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 20px 0;">
      Bonjour ${safeName},<br/>
      Une connexion vient d'avoir lieu sur votre compte administrateur FlowIA.
    </p>
    <table style="width:100%;font-size:13px;color:#111;border-collapse:collapse;">
      <tr><td style="padding:8px 0;color:#6b7280;width:40%;">Date</td><td style="padding:8px 0;">${escapeHtml(dateStr)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;border-top:1px solid #e5e7eb;">Adresse IP</td><td style="padding:8px 0;border-top:1px solid #e5e7eb;font-family:monospace;">${safeIp}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;border-top:1px solid #e5e7eb;vertical-align:top;">Navigateur</td><td style="padding:8px 0;border-top:1px solid #e5e7eb;font-family:monospace;font-size:11px;word-break:break-all;">${safeUa}</td></tr>
    </table>
    <div style="margin-top:24px;padding:12px;background:#fef3c7;border-left:3px solid #f59e0b;font-size:12px;color:#78350f;">
      Si cette connexion ne vient pas de vous, changez immédiatement votre mot de passe et contactez l'équipe FlowIA.
    </div>
    <div style="margin-top:24px;font-size:11px;color:#9ca3af;text-align:center;">
      Cet email est envoyé automatiquement à chaque connexion administrateur.
    </div>
  </div>
</body></html>`;

  try {
    await sendEmail({
      to: adminEmail,
      subject: 'Connexion FlowIA Admin',
      html,
    });
  } catch (e) {
    console.error('[adminLoginAlert] sendEmail failed:', e.message);
  }
}

module.exports = { sendLoginAlertEmail };
