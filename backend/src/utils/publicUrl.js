// publicUrl.js — Construction des URLs publiques utilisees dans les emails
// et notifications. FRONTEND_URL est une liste CSV pour le CORS, on ne peut
// donc PAS l'interpoler telle quelle dans un lien (sinon on obtient
// "https://a.fr,https://b.fr,https://c.fr/book/slug" -> URL cassee).
//
// Source de verite, par ordre de priorite :
// 1. PUBLIC_BOOKING_ORIGIN (env dediee, recommandee : ex `https://haircoifflille.fr`)
// 2. Premiere URL de FRONTEND_URL qui n'est PAS un sous-domaine technique
//    (commercant.*, www.*, admin.*) -> on prefere le domaine racine vu par le client
// 3. Premiere URL brute de FRONTEND_URL (fallback)
// 4. https://haircoifflille.fr (defaut hardcode pour eviter les liens vides)
//
// Aucun trailing slash, pas d'espace, valide URL parsee.

function normalize(u) {
  return String(u || '').trim().replace(/\/+$/, '');
}

function isTechSubdomain(hostname) {
  if (!hostname) return false;
  return hostname.startsWith('commercant.')
      || hostname.startsWith('www.')
      || hostname.startsWith('admin.');
}

function publicBookingOrigin() {
  const dedicated = normalize(process.env.PUBLIC_BOOKING_ORIGIN);
  if (dedicated) return dedicated;

  const list = String(process.env.FRONTEND_URL || '')
    .split(',').map(normalize).filter(Boolean);

  // Prefere une URL qui n'est pas un sous-domaine technique
  for (const u of list) {
    try {
      const url = new URL(u);
      if (!isTechSubdomain(url.hostname)) return u;
    } catch { /* ignore invalide */ }
  }
  // Sinon premiere brute valide
  for (const u of list) {
    try { new URL(u); return u; } catch { /* ignore */ }
  }
  return 'https://haircoifflille.fr';
}

// URL de la page publique de reservation d'un commerce (Step1Home).
function bookingPageUrl(slug) {
  return `${publicBookingOrigin()}/book/${encodeURIComponent(slug)}`;
}

// URL "Mes rendez-vous" cote client.
function clientAppointmentsUrl(slug) {
  return `${publicBookingOrigin()}/book/${encodeURIComponent(slug)}/client/appointments`;
}

// URL d'invitation client (page register avec token + email pre-remplis).
function clientInviteUrl(token, email) {
  const base = publicBookingOrigin();
  const qs = new URLSearchParams();
  if (token) qs.set('invite', token);
  if (email) qs.set('email', email);
  return `${base}/register?${qs.toString()}`;
}

module.exports = {
  publicBookingOrigin,
  bookingPageUrl,
  clientAppointmentsUrl,
  clientInviteUrl,
};
