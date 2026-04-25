// src/utils/publicUrl.js
//
// Construit les URLs publiques (réservation, inscription rapide) partagées
// par le commerçant aux clients.
//
// Architecture multi-tenant :
//   - Admin commerçants  → sous-domaine `commercant.<domaine>`
//                          (ex commercant.haircoifflille.fr)
//   - Pages publiques    → domaine racine `<domaine>/book/{slug}` ou `/j/{slug}`
//                          (ex haircoifflille.fr/book/lille)
//
// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION DE DOMAINE — IMPORTANT
// Pour changer de nom de domaine en prod (ex haircoifflille.fr → flow-ia.fr),
// modifier UNIQUEMENT la variable VITE_PUBLIC_BOOKING_ORIGIN sur Vercel
// (Production + Preview + Development), puis force redeploy.
// AUCUNE MODIFICATION DE CODE N'EST NÉCESSAIRE.
// Procédure complète : docs/refronte/MIGRATION-DOMAINE.md
// ─────────────────────────────────────────────────────────────────────────────
//
// Ordre de résolution :
//   1. VITE_PUBLIC_BOOKING_ORIGIN (canonique, ex "https://haircoifflille.fr")
//   2. VITE_BOOKING_DOMAIN (legacy, ignorée si valeur placeholder cassée)
//   3. Fallback intelligent depuis window.location :
//        - localhost / *.vercel.app / IP → origin tel quel (pas de strip)
//        - hostname à 3+ segments        → strip sous-domaine, garde 2 derniers
//        - hostname à 2 segments         → origin tel quel (déjà sur racine)
//   4. SSR / pas de window → string vide

const PLACEHOLDER_RE = /(factice|nexiste|exemple|example|placeholder)/i;
const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function readEnv(key) {
  try {
    return (import.meta.env?.[key] || '').trim();
  } catch {
    return '';
  }
}

function normalizeOrigin(value) {
  if (!value) return '';
  const v = value.trim().replace(/\/+$/, '');
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function stripToRootDomain(hostname, port, protocol) {
  const segments = hostname.split('.');
  const root = segments.length >= 3 ? segments.slice(-2).join('.') : hostname;
  const portPart = port ? `:${port}` : '';
  return `${protocol}//${root}${portPart}`;
}

export function getPublicOrigin() {
  // 1) Variable d'env canonique — source de vérité en prod
  const canonical = normalizeOrigin(readEnv('VITE_PUBLIC_BOOKING_ORIGIN'));
  if (canonical) return canonical;

  // 2) Legacy VITE_BOOKING_DOMAIN — ignorée si placeholder cassé
  //    (ex "booking-domain-factice-nexiste-pas.com" laissé en Vercel)
  const legacy = readEnv('VITE_BOOKING_DOMAIN');
  if (legacy && !PLACEHOLDER_RE.test(legacy)) {
    const norm = normalizeOrigin(legacy);
    if (norm) return norm;
  }

  // 3) Fallback intelligent depuis window.location
  if (typeof window === 'undefined' || !window.location) return '';
  try {
    const u = new URL(window.location.origin);
    const host = u.hostname.toLowerCase();

    // Localhost / vercel preview / IP → on ne strip pas (URLs valides telles quelles)
    if (host === 'localhost' || host.endsWith('.vercel.app') || IP_RE.test(host)) {
      return u.origin;
    }

    // 3+ segments → strip pour retomber sur le domaine racine public
    if (host.split('.').length >= 3) {
      return stripToRootDomain(host, u.port, u.protocol);
    }

    // 2 segments ou moins → on est déjà sur la racine
    return u.origin;
  } catch {
    return window.location.origin || '';
  }
}

export function buildPublicUrl(path = '') {
  const origin = getPublicOrigin();
  if (!origin) return '';
  if (!path) return origin;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getBookingUrl(slug) {
  if (!slug) return '';
  return buildPublicUrl(`/book/${slug}`);
}

export function getQuickRegisterUrl(slug) {
  if (!slug) return '';
  return buildPublicUrl(`/j/${slug}`);
}

// ── Rétrocompatibilité : noms historiques conservés pour ne pas casser
// les imports existants (QRCard.jsx, ConfigTab.jsx, etc.). À privilégier
// dans les nouveaux fichiers : getPublicOrigin / getBookingUrl / getQuickRegisterUrl.
export const publicOrigin = getPublicOrigin;
export const bookingUrl   = getBookingUrl;
export const shortJoinUrl = getQuickRegisterUrl;
