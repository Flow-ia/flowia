// utils/marketingUrl.js — Helpers cross-domain pour le site marketing
//
// Architecture :
//   - flowiapro.com / www.flowiapro.com → site marketing (Landing, Tarifs, ...)
//   - commercant.flowiapro.com / localhost / *.vercel.app → app commercant
//
// Le Header et le Footer du site marketing sont reutilises sur le portail
// commercant pour la coherence visuelle. Mais leurs liens (Tarifs, Contact,
// A propos, ...) doivent rediriger vers flowiapro.com et non rester sur
// commercant.flowiapro.com. Ces helpers font le pont :
//   - <MarketingLink to="/tarifs"> → <Link> sur marketing, <a href> ailleurs
//   - navigateToMarketing(nav, '/x') → navigate() sur marketing, window.location ailleurs

import { Link } from 'react-router-dom';

export const MARKETING_HOST = 'https://flowiapro.com';

// Salon DZ (branche de test) — override du mode site.
// Les previews Vercel servent normalement l'app commercant ; pour tester le
// site public (porte homme/femme + marketplace) sur une preview, on passe
// ?site=public dans l'URL (persiste en sessionStorage pour la navigation
// interne). ?site=app revient au comportement normal. Retourne true/false si
// un override est actif, null sinon.
export function publicSiteOverride() {
  if (typeof window === 'undefined') return null;
  try {
    const p = new URLSearchParams(window.location.search).get('site');
    if (p === 'public') { sessionStorage.setItem('sdz_site', 'public'); return true; }
    if (p === 'app')    { sessionStorage.setItem('sdz_site', 'app');    return false; }
    const s = sessionStorage.getItem('sdz_site');
    if (s === 'public') return true;
    if (s === 'app')    return false;
  } catch {}
  return null;
}

export function isOnMarketingHost() {
  if (typeof window === 'undefined') return true;
  const ov = publicSiteOverride();
  if (ov !== null) return ov;
  const h = window.location.hostname.toLowerCase();
  return h === 'flowiapro.com' || h === 'www.flowiapro.com';
}

// Navigation programmatique : utilise react-router en interne sur le marketing,
// fait une redirection full-page vers flowiapro.com ailleurs.
export function navigateToMarketing(navigate, path) {
  if (isOnMarketingHost()) {
    navigate(path);
  } else if (typeof window !== 'undefined') {
    window.location.href = MARKETING_HOST + path;
  }
}

// Composant lien polymorphe :
//  - Sur marketing host → <Link to={to}> (router interne, pas de reload)
//  - Ailleurs            → <a href="https://flowiapro.com{to}"> (cross-domain)
// Accepte tous les props supplementaires (style, onMouseEnter, etc.).
export function MarketingLink({ to, children, ...rest }) {
  if (isOnMarketingHost()) {
    return <Link to={to} {...rest}>{children}</Link>;
  }
  return <a href={MARKETING_HOST + to} {...rest}>{children}</a>;
}
