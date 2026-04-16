// backend/src/utils/emailSender.js
// Utilitaire centralise pour tous les envois email marketing via Brevo

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL  = process.env.SENDER_EMAIL  || process.env.BREVO_FROM || 'noreply@haircoifflille.fr';
const SENDER_NAME   = process.env.SENDER_NAME   || 'FlowIA';

// Compteur global emails journalier (protection quota Brevo gratuit)
let emailsToday = 0;
let emailsTodayDate = new Date().toDateString();

function resetCounterIfNewDay() {
  const today = new Date().toDateString();
  if (today !== emailsTodayDate) {
    emailsToday = 0;
    emailsTodayDate = today;
  }
}

// Fonction principale d'envoi email
async function sendMarketingEmailRaw({ to, toName, subject, htmlContent, type = 'transactional' }) {
  resetCounterIfNewDay();

  const EMAIL_MARKETING_MAX = 220; // reserve 80 pour transactionnel

  // Bloquer marketing si quota atteint
  if (type === 'marketing' && emailsToday >= EMAIL_MARKETING_MAX) {
    throw new Error(`Quota email marketing atteint (${emailsToday}/${EMAIL_MARKETING_MAX}). Reessayez demain.`);
  }

  if (!BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY manquante dans les variables environnement');
  }

  const body = {
    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
    to: [{ email: to, name: toName || to }],
    subject: subject,
    htmlContent: htmlContent
  };

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

  emailsToday++;
  console.log(`[EMAIL] Envoye → ${to} | Total aujourd'hui: ${emailsToday}`);
  return data;
}

// Email marketing campagne code promo
async function sendMarketingEmail(clientEmail, clientName, message, promoCode) {
  const subject = promoCode
    ? `Offre exclusive : ${promoCode} vous attend !`
    : 'Une offre exclusive pour vous';

  const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center; }
  .header h1 { color: white; margin: 0; font-size: 24px; }
  .body { padding: 32px; }
  .message { font-size: 16px; color: #333; line-height: 1.6; white-space: pre-wrap; }
  .footer { padding: 20px 32px; background: #f8fafc; text-align: center; font-size: 12px; color: #999; }
</style>
</head><body>
<div class="container">
  <div class="header"><h1>Offre exclusive pour vous !</h1></div>
  <div class="body">
    <p style="font-size:16px;color:#333;">Bonjour ${clientName || 'cher client'},</p>
    <div class="message">${message}</div>
  </div>
  <div class="footer">
    <p>Vous recevez cet email car vous etes client de notre etablissement.</p>
  </div>
</div>
</body></html>`;

  return sendMarketingEmailRaw({
    to: clientEmail,
    toName: clientName,
    subject,
    htmlContent,
    type: 'marketing'
  });
}

// Obtenir le quota restant
function getEmailQuota() {
  resetCounterIfNewDay();
  return {
    sent_today: emailsToday,
    available_today: Math.max(0, 220 - emailsToday),
    daily_max: 220
  };
}

module.exports = { sendMarketingEmail, sendMarketingEmailRaw, getEmailQuota };
