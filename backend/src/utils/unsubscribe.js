// utils/unsubscribe.js — Audit Z (RGPD) — injection du lien de désabonnement.
// Utilisé par tous les chemins d'envoi marketing SMS + email.
// Le token vient des colonnes `unsubscribe_token` (UUID) des tables
// `client_accounts` et `global_clients`. Le lien pointe vers l'endpoint
// public `/api/pub/unsubscribe/:token` (backend) qui renvoie une page HTML
// de confirmation et flip `marketing_opt_in=FALSE`.

// URL backend directe — évite un hop frontend et assure que le unsubscribe
// marche même en cas de panne Vercel. BACKEND_PUBLIC_URL est défini sur
// Render, fallback : on reconstruit via VITE_API_URL côté front ou le host
// qui sert l'app.
function unsubscribeUrl(token) {
  const base = (process.env.BACKEND_PUBLIC_URL || process.env.API_URL || '')
    .split(',')[0]?.replace(/\/$/, '') || '';
  if (!base || !token) return null;
  return `${base}/api/pub/unsubscribe/${token}`;
}

// SMS : footer court en 1 ligne. ~50 chars — coût d'1 segment SMS
// supplémentaire possible si le message principal dépasse 110 chars.
// Format compact "Stop: <url>" (reconnu par filtres spam et par l'UX user).
function appendUnsubscribeSms(msg, token) {
  const url = unsubscribeUrl(token);
  if (!url) return msg;
  return `${msg}\nStop: ${url}`;
}

// Email : bloc HTML discret en bas. Inline styles pour que les clients mail
// le rendent correctement (Gmail, Outlook, iOS Mail — CSS externe bannie).
function unsubscribeEmailHtml(token) {
  const url = unsubscribeUrl(token);
  if (!url) return '';
  return `<p style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;line-height:1.5;">
    Vous recevez cet email car vous êtes client de notre établissement.<br/>
    <a href="${url}" style="color:#999;text-decoration:underline;">Se désabonner des offres commerciales</a>
  </p>`;
}

module.exports = { unsubscribeUrl, appendUnsubscribeSms, unsubscribeEmailHtml };
