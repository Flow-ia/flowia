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
//
// Commit 26b — `marketingFooterHtml` regroupe le footer complet (mention
// + lien 1-clic). Utilisé partout pour garantir conformité RGPD/LCEN. Si
// le lien 1-clic n'est pas générable (token manquant ou env URL absentes),
// log d'avertissement explicite côté serveur — l'email reste envoyé avec
// le mailto STOP en fallback (mieux que rien, mais à corriger en config).

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
// Note : on suffixe `?source=sms_link` pour traçabilité dans le log audit.
function appendUnsubscribeSms(msg, token) {
  const url = unsubscribeUrl(token);
  if (!url) {
    if (token) console.warn('[UNSUB SMS] URL non générable — vérifier BACKEND_PUBLIC_URL/FRONTEND_PUBLIC_URL');
    return msg;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${msg}\nStop: ${url}${sep}source=sms_link`;
}

// Email : bloc HTML discret en bas. Inline styles pour que les clients mail
// le rendent correctement (Gmail, Outlook, iOS Mail — CSS externe bannie).
// Conserve le bloc legacy pour rétrocompat des appels directs.
function unsubscribeEmailHtml(token) {
  const url = unsubscribeUrl(token);
  if (!url) return '';
  return `<p style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;line-height:1.5;">
    Vous recevez cet email car vous êtes client de notre établissement.<br/>
    <a href="${url}" style="color:#999;text-decoration:underline;">Se désabonner des offres commerciales</a>
  </p>`;
}

// Commit 26b — footer marketing UNIQUE et RGPD-conforme à utiliser dans
// tous les templates email marketing. Garantit qu'il y a toujours un
// mécanisme de désinscription visible (1-clic prioritaire, mailto fallback).
function marketingFooterHtml({ token, businessName, businessEmail, context = 'unknown' }) {
  const url = unsubscribeUrl(token);
  const mailto = businessEmail || process.env.SENDER_EMAIL || null;
  const bn = businessName || 'notre établissement';

  if (url) {
    return `<p style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;line-height:1.5;">
      Vous recevez cet email en tant que client de ${bn}.<br/>
      <a href="${url}" style="color:#999;text-decoration:underline;">Se désabonner des offres commerciales</a>
    </p>`;
  }

  // Aucun lien 1-clic disponible — c'est anormal, log pour debug ops.
  console.warn(`[MARKETING FOOTER ${context}] Lien 1-clic indisponible (token=${token ? 'présent' : 'MANQUANT'}, BACKEND_PUBLIC_URL/FRONTEND_PUBLIC_URL manquante ?). Fallback mailto STOP utilisé.`);

  if (mailto) {
    return `<p style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;line-height:1.5;">
      Vous recevez cet email en tant que client de ${bn}.<br/>
      Pour vous désabonner, envoyez "STOP" à <a href="mailto:${mailto}?subject=STOP" style="color:#999;text-decoration:underline;">${mailto}</a>
    </p>`;
  }

  // Dernier recours — message générique, pas de mécanisme exploitable.
  return `<p style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;line-height:1.5;">
    Vous recevez cet email en tant que client de ${bn}.<br/>
    Contactez votre établissement pour vous désabonner.
  </p>`;
}

// Version texte plain pour les versions text/plain des emails.
function marketingFooterText({ token, businessEmail }) {
  const url = unsubscribeUrl(token);
  if (url) return `Pour vous désabonner : ${url}`;
  const mailto = businessEmail || process.env.SENDER_EMAIL || null;
  if (mailto) return `Pour vous désabonner, envoyez "STOP" à ${mailto}`;
  return `Pour vous désabonner, contactez votre établissement.`;
}

// Header List-Unsubscribe (RFC 2369 + RFC 8058 1-clic).
function unsubscribeHeaders({ token, businessEmail, refId }) {
  const url = unsubscribeUrl(token);
  const mailto = businessEmail || process.env.SENDER_EMAIL || null;
  const parts = [];
  if (url) parts.push(`<${url}>`);
  if (mailto) parts.push(`<mailto:${mailto}?subject=STOP>`);
  const headers = {};
  if (parts.length) {
    headers['List-Unsubscribe'] = parts.join(', ');
    if (url) headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  if (refId) headers['X-Entity-Ref-ID'] = String(refId);
  return headers;
}

module.exports = {
  unsubscribeUrl,
  backendUnsubscribeUrl,
  appendUnsubscribeSms,
  unsubscribeEmailHtml,
  marketingFooterHtml,
  marketingFooterText,
  unsubscribeHeaders,
};
