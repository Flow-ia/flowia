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

function backendBase() {
  return (process.env.BACKEND_PUBLIC_URL || process.env.API_URL || '')
    .split(',')[0]?.replace(/\/$/, '') || '';
}

// URL backend 1-clic (utilisée par le header List-Unsubscribe RFC 8058).
// Effet immédiat — destinée à Gmail/Apple Mail bouton intégré.
function backendUnsubscribeUrl(token) {
  const base = backendBase();
  if (!base || !token) return null;
  return `${base}/api/pub/unsubscribe/${token}`;
}

// URL backend 2 étapes (utilisée par le footer cliquable des emails).
// Page HTML autonome avec form de confirmation — fonctionne en prod sans
// dépendance à la frontend React. Si la frontend est en prod, l'admin peut
// définir UNSUBSCRIBE_FRONTEND_PAGE_URL côté backend ; la route fera alors
// un redirect 302 vers la page React FDS-2026.
function backendUnsubscribePageUrl(token) {
  const base = backendBase();
  if (!base || !token) return null;
  return `${base}/api/pub/unsubscribe-page/${token}`;
}

// URL retournée pour le footer email cliquable.
// Commit 28 — pointe TOUJOURS vers le backend (page 2 étapes autonome). La
// frontend React `/unsubscribe?token=...` reste accessible aux utilisateurs
// qui y arrivent directement, mais on n'envoie plus son URL dans les emails
// tant que la prod main ne l'a pas (sinon → page de login).
function unsubscribeUrl(token) {
  if (!token) return null;
  return backendUnsubscribePageUrl(token) || backendUnsubscribeUrl(token);
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
// Commit 27 — pointe TOUJOURS vers le backend (GET /api/pub/unsubscribe/:token)
// pour préserver le 1-clic Gmail/Apple Mail RFC 8058. La page React
// /unsubscribe?token=... fait 2 étapes (preview + confirm) ce qui n'est PAS
// compatible avec un POST 1-clic d'un mail client. On dissocie donc :
//   - footer email cliquable (visible client) → page React 2 étapes (UX)
//   - header List-Unsubscribe (Gmail bouton) → backend 1-clic (délivrabilité)
function unsubscribeHeaders({ token, businessEmail, refId }) {
  const url = backendUnsubscribeUrl(token);
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
  backendUnsubscribePageUrl,
  appendUnsubscribeSms,
  unsubscribeEmailHtml,
  marketingFooterHtml,
  marketingFooterText,
  unsubscribeHeaders,
};
