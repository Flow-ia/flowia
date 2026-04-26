// backend/src/utils/emailSender.js
// Utilitaire centralise pour tous les envois email marketing via Brevo
//
// Commit 30 — la limite Brevo per-merchant est désormais gérée par le helper
// unifié `utils/email.js → checkUserEmailQuota` (BDD `users.email_sent_today/
// _month`, cluster-safe). Cette fonction ne porte plus de compteur mémoire
// (qui était par-worker, pas cluster-safe, et perdu à chaque reboot Render).
// Les call-sites (campaigns, promo) checkent et tronquent leur batch en amont.

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL  = process.env.SENDER_EMAIL  || process.env.BREVO_FROM || 'contact@haircoifflille.fr';
const SENDER_NAME   = process.env.SENDER_NAME   || 'FlowIA';

// Fonction principale d'envoi email
async function sendMarketingEmailRaw({ to, toName, subject, htmlContent, type = 'transactional', headers }) {
  if (!BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY manquante dans les variables environnement');
  }

  const body = {
    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
    to: [{ email: to, name: toName || to }],
    subject: subject,
    htmlContent: htmlContent
  };
  if (headers && Object.keys(headers).length) body.headers = headers;

  console.log(`[EMAIL] Envoi ${type} → ${to} | Sujet: ${subject}`);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[EMAIL ERROR]', JSON.stringify(data));
    throw new Error(data.message || 'Erreur envoi email Brevo');
  }

  console.log(`[EMAIL] Envoye → ${to}`);
  return data;
}

// Email marketing campagne code promo
// Audit Z : accepte un `unsubscribeToken` pour injecter le lien de
// désabonnement 1-clic dans le footer (RGPD).
// Commit 26b — utilise `marketingFooterHtml` unifié + `unsubscribeHeaders`.
async function sendMarketingEmail(clientEmail, clientName, message, promoCode, unsubscribeToken = null, businessEmail = null, businessName = null) {
  const subject = promoCode
    ? `Offre exclusive : ${promoCode} vous attend !`
    : 'Une offre exclusive pour vous';

  const { marketingFooterHtml, unsubscribeHeaders } = require('./unsubscribe');
  const unsubFooter = marketingFooterHtml({
    token: unsubscribeToken, businessName, businessEmail, context: 'sendMarketingEmail',
  });
  const headers = unsubscribeHeaders({
    token: unsubscribeToken, businessEmail, refId: promoCode || null,
  });

  const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center; }
  .header h1 { color: white; margin: 0; font-size: 24px; }
  .body { padding: 32px; }
  .message { font-size: 16px; color: #333; line-height: 1.6; white-space: pre-wrap; }
</style>
</head><body>
<div class="container">
  <div class="header"><h1>Offre exclusive pour vous !</h1></div>
  <div class="body">
    <p style="font-size:16px;color:#333;">Bonjour ${clientName || 'cher client'},</p>
    <div class="message">${message}</div>
    ${unsubFooter}
  </div>
</div>
</body></html>`;

  return sendMarketingEmailRaw({
    to: clientEmail,
    toName: clientName,
    subject,
    htmlContent,
    type: 'marketing',
    headers,
  });
}

// Commit 30 — alias rétrocompat. Les nouveaux appels doivent passer par
// `utils/email.js → checkUserEmailQuota(userId)` (BDD per-user). Cette
// fonction sans userId retourne un quota générique pour code legacy.
const { checkUserEmailQuota, EMAIL_DAILY_LIMIT_USER } = require('./email');
function getEmailQuota(userId) {
  if (userId) return checkUserEmailQuota(userId);
  return {
    sent_today: 0,
    available_today: EMAIL_DAILY_LIMIT_USER,
    daily_max: EMAIL_DAILY_LIMIT_USER,
  };
}

module.exports = { sendMarketingEmail, sendMarketingEmailRaw, getEmailQuota };
