// src/pages/booking-page/helpers.js
// Fonctions pures — formatage / validation téléphone, routing URL.

import { PHONE_COUNTRIES } from './constants';

// Formater le numéro final : +<dial><numéro sans zéro initial>
export const formatPhone = (country, local) => {
  const digits = local.replace(/\D/g, '');
  if (!digits) return '';
  const stripped = digits.startsWith('0') ? digits.slice(1) : digits;
  return `${country.dial}${stripped}`;
};

// Valider le numéro local
export const validatePhone = (country, local) => {
  const digits = local.replace(/\D/g, '');
  if (!digits) return 'Numéro requis';
  const stripped = digits.startsWith('0') ? digits.slice(1) : digits;
  if (!country.len.includes(stripped.length)) {
    return `Numéro invalide pour ${country.label} (${country.len.join(' ou ')} chiffres attendus)`;
  }
  return '';
};

// Parser un numéro international existant → { country, local }
export const parsePhone = (phone) => {
  if (!phone) return { country: PHONE_COUNTRIES[0], local: '' };
  const match = PHONE_COUNTRIES.find(c => phone.startsWith(c.dial));
  if (match) {
    const rest = phone.slice(match.dial.length);
    return { country: match, local: rest };
  }
  return { country: PHONE_COUNTRIES[0], local: phone };
};

// Détecte si l'utilisateur arrive via la marketplace
// (URL `/marketplace/book/:slug/...`) et retourne le préfixe correspondant
// pour préserver le contexte marketplace dans toutes les navigations
// internes du flow (sinon les liens cassent et on perd le shell marketplace).
//   /marketplace/book/lille  → /marketplace/book/lille
//   /book/lille (any host)   → /book/lille
export const getBookingBase = (slug, pathname) => {
  const p = String(pathname || '');
  if (p.startsWith('/marketplace/book/')) return `/marketplace/book/${slug}`;
  return `/book/${slug}`;
};

// Construire l'URL pour chaque étape du flow réservation à partir d'un
// base path déjà calculé (issu de getBookingBase). Avant : ce helper
// hardcodait `/book/${slug}` ; on prend désormais base directement pour
// supporter le préfixe `/marketplace/book/...`.
export const stepToPath = (base, s, svcId, empId, dateStr, slot) => {
  if (s === 1) return base;
  if (s === 2 && svcId) return `${base}/service/${svcId}/employe`;
  if (s === 3 && svcId && empId) return `${base}/service/${svcId}/employe/${empId}/date`;
  if (s === 4 && svcId && empId && dateStr) return `${base}/service/${svcId}/employe/${empId}/date/${dateStr}/creneau`;
  if (s === 5 && svcId && empId && dateStr && slot) return `${base}/service/${svcId}/employe/${empId}/date/${dateStr}/creneau/${slot}/infos`;
  if (s === 6 && svcId && empId && dateStr && slot) return `${base}/service/${svcId}/employe/${empId}/date/${dateStr}/creneau/${slot}/confirmation`;
  return base;
};

// Stash de la sélection de réservation en cours pendant le round-trip OAuth
// Google (popup desktop OU nouvel onglet mobile/tablette). Le code OAuth backend
// est intouchable (CLAUDE.md règle 5) ; on véhicule le retour côté frontend
// via localStorage (partagé cross-tabs same-origin).
//
// Cycle de vie :
//   - setBookingResume(slug, path) → appelé juste avant `loginWithGoogle`,
//     capture `pathname + search` du booking en cours (étape 6 typiquement).
//   - getBookingResume(slug) → lu par GoogleConfirm après finalize, par
//     OAuthCallback dans le fallback type=client (mobile new-tab non fermable),
//     et par index.jsx en filet de sécurité.
//   - clearBookingResume(slug) → après restauration ou annulation.
//
// TTL 10 min : aligné sur la durée de vie du pre_token OAuth.
const RESUME_KEY = (slug) => `ff_booking_resume_${slug}`;
const RESUME_TTL_MS = 10 * 60 * 1000;

export const setBookingResume = (slug, path) => {
  try {
    if (!slug || !path) return;
    // Refuse les paths d'auth/confirm — on ne stocke que des URLs réservation.
    if (/\/auth\/google-confirm/.test(path)) return;
    if (/\/(login|register|auth)(\?|$)/.test(path)) return;
    localStorage.setItem(RESUME_KEY(slug), JSON.stringify({ path, ts: Date.now() }));
  } catch {}
};

export const getBookingResume = (slug) => {
  try {
    const raw = localStorage.getItem(RESUME_KEY(slug));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.path || typeof obj.path !== 'string') return null;
    // Stash périmé → nettoyer + ignorer.
    if (!obj.ts || (Date.now() - obj.ts) > RESUME_TTL_MS) {
      localStorage.removeItem(RESUME_KEY(slug));
      return null;
    }
    // Garde-fou anti open-redirect : path doit pointer dans /book/<slug>/...
    // ou /marketplace/book/<slug>/... uniquement.
    if (!/^\/(marketplace\/)?book\/[^/?#]+/.test(obj.path)) return null;
    return obj.path;
  } catch { return null; }
};

export const clearBookingResume = (slug) => {
  try { localStorage.removeItem(RESUME_KEY(slug)); } catch {}
};

// Grouper services par catégorie booking (booking_category_name prioritaire,
// fallback category_name). Retourne { svcGroups, svcNoCat }.
export const groupServicesByCategory = (services) => {
  const svcGroups = [];
  const svcNoCat  = [];
  const _catMap   = new Map();
  services.forEach(s => {
    const label = s.booking_category_name || s.category_name || null;
    const color = s.booking_category_color || null;
    const icon  = s.booking_category_icon  || null;
    if (!label) { svcNoCat.push(s); return; }
    if (!_catMap.has(label)) {
      _catMap.set(label, svcGroups.length);
      svcGroups.push({ label, color, icon, svcs: [] });
    }
    svcGroups[_catMap.get(label)].svcs.push(s);
  });
  return { svcGroups, svcNoCat };
};
