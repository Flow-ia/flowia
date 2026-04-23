// src/utils/publicUrl.js
// Construit une URL publique partageable depuis l'interface commerçant.
// L'admin tourne sur `commercant.<domaine>` (sous-domaine privé) alors que
// la page de réservation est servie depuis le domaine racine `<domaine>/book/slug`.
// Sans normalisation, un copier-coller depuis Settings/Agenda donnerait
// `commercant.haircoifflille.fr/book/xyz` — URL légitime mais qui force le
// client à passer par le dashboard admin (mauvaise UX + risque de confusion).
//
// `VITE_BOOKING_DOMAIN` permet d'outrepasser explicitement (ex : domaine
// 100 % dédié booking). Sinon on repart de `window.location.origin` et on
// retire uniquement le premier label `commercant.` ; tout autre sous-domaine
// (www., app., pro., staging., etc.) est conservé tel quel.

export function publicOrigin() {
  const override = (import.meta.env?.VITE_BOOKING_DOMAIN || '').trim();
  if (override) {
    return /^https?:\/\//.test(override) ? override.replace(/\/$/, '') : `https://${override}`;
  }
  if (typeof window === 'undefined') return '';
  try {
    const u = new URL(window.location.origin);
    if (u.hostname.toLowerCase().startsWith('commercant.')) {
      u.hostname = u.hostname.slice('commercant.'.length);
    }
    return u.origin;
  } catch {
    return window.location.origin;
  }
}

export function bookingUrl(slug) {
  if (!slug) return '';
  return `${publicOrigin()}/book/${slug}`;
}

export function shortJoinUrl(slug) {
  if (!slug) return '';
  return `${publicOrigin()}/j/${slug}`;
}
