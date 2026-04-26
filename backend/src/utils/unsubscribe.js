// utils/unsubscribe.js — Audit Z (RGPD) — injection du lien de désabonnement.
// Utilisé par tous les chemins d'envoi marketing SMS + email.
// Le token vient des colonnes `unsubscribe_token` (UUID) des tables
// `client_accounts` et `global_clients`.
//
// Commit 26 — l'URL pointe vers la page React /unsubscribe?token=... si
// FRONTEND_PUBLIC_URL est définie (design FDS-2026 cohérent), sinon fallback
// vers l'endpoint backend `/api/pub/unsubscribe/:token` (HTML inline auto-
// suffisant). La page React appelle elle-même l'endpoint backend pour
// effectuer le UPDATE + log audit. Rétrocompat assurée pour anciens emails.

function backendUnsubscribeUrl(token) {
  const base = (process.env.BACKEND_PUBLIC_URL || process.env.API_URL || '')
    .split(',')[0]?.replace(/\/$/, '') || '';
  if (!base || !token) return null;
  return `${base}/api/pub/unsubscribe/${token}`;
}

// URL préférée pour les nouveaux envois : page frontend FDS-2026.
// Fallback automatique sur le backend si FRONTEND_PUBLIC_URL non configurée.
function unsubscribeUrl(token) {
  if (!token) return null;
  const front = (process.env.FRONTEND_PUBLIC_URL || '')
    .split(',')[0]?.replace(/\/$/, '') || '';
  if (front) return `${front}/unsubscribe?token=${token}`;
  return backendUnsubscribeUrl(token);
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

module.exports = { unsubscribeUrl, backendUnsubscribeUrl, appendUnsubscribeSms, unsubscribeEmailHtml };
