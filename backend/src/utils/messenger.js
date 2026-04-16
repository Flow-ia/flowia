// utils/messenger.js — Utilitaire SMS via Brevo
const SMS_COST   = parseFloat(process.env.SMS_COST_UNIT)     || 0.045;
const SMS_MARGIN = parseFloat(process.env.SMS_MARGIN_PERCENT) || 30;
const SMS_PRICE  = parseFloat((SMS_COST * (1 + SMS_MARGIN / 100)).toFixed(4));

function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('33') && digits.length === 11) return '+' + digits;
  if (digits.startsWith('0') && digits.length === 10) return '+33' + digits.slice(1);
  if (digits.length === 9) return '+33' + digits;
  return null;
}

async function sendSMS(phone, message) {
  const formatted = formatPhone(phone);
  if (!formatted) return { success: false, reason: 'Numero invalide' };
  try {
    const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: 'FlowIA',
        recipient: formatted,
        content: message
      }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data.error) return { success: false, reason: data.error };
    if (data.invalid_numbers?.length > 0) return { success: false, reason: 'Numero non valide' };
    return { success: true, cost: SMS_COST };
  } catch(e) {
    return { success: false, reason: e.message };
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
function chunk(arr, size) {
  return Array.from({ length: Math.ceil(arr.length / size) },
    (_, i) => arr.slice(i * size, i * size + size));
}

module.exports = { sendSMS, formatPhone, sleep, chunk, SMS_COST, SMS_MARGIN, SMS_PRICE };
