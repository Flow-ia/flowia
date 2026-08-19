import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams, Navigate, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import BookingPage from './pages/BookingPage';
import { pubApi } from './utils/api';
import BookingPolitique from './pages/BookingPolitique';
import OAuthCallback from './pages/OAuthCallback';
import GoogleConfirm from './pages/booking-page/auth/GoogleConfirm';
import Unsubscribe from './pages/unsubscribe/Unsubscribe';
import MarketingLayout from './pages/site-marketing/MarketingLayout';
import MarketplaceBookingShell from './pages/site-marketing/MarketplaceBookingShell';
import Landing       from './pages/site-marketing/Landing';
import Features      from './pages/site-marketing/Features';
import Pricing       from './pages/site-marketing/Pricing';
import Industries    from './pages/site-marketing/Industries';
import About         from './pages/site-marketing/About';
import Contact       from './pages/site-marketing/Contact';
import ClientPortal  from './pages/site-marketing/ClientPortal';
import GenderGate    from './pages/site-marketing/GenderGate';
import LegalNotice   from './pages/site-marketing/LegalNotice';
import Privacy       from './pages/site-marketing/Privacy';
import Terms         from './pages/site-marketing/Terms';
import { publicSiteOverride } from './utils/marketingUrl';
import { AuthProvider } from './hooks/useAuth';
import { AdminProvider } from './hooks/useAdmin';
import { ThemeProvider } from './hooks/useTheme';
import { TabletModeProvider } from './contexts/TabletModeProvider';
import { AdminModeProvider } from './contexts/AdminModeContext';
import { IdleLockProvider } from './hooks/useIdleLock';
import LockScreen from './components/LockScreen';
import InstallPrompt from './pwa/InstallPrompt';
import UpdateBanner from './pwa/UpdateBanner';
import OfflineBanner from './pwa/OfflineBanner';
import MaintenanceOverlay from './components/MaintenanceOverlay';
import { ErrorBoundary } from './components/ErrorBoundary';
import RefreshFab from './pwa/RefreshFab';
import { registerSW } from './pwa/registerSW';
import './index.css';

// ── Détection du domaine au montage ──────────────────────────────────────────
//
// Architecture cible :
//   - flowiapro.com / www.flowiapro.com    → site marketing + pages /book/*
//   - commercant.flowiapro.com             → app commerçant (admin SaaS)
//   - localhost / *.vercel.app             → app commerçant (dev/preview)
//   - VITE_BOOKING_DOMAIN custom legacy    → redirect direct vers /book/<slug>
//
// VITE_BOOKING_DOMAIN reste en place pour rétro-compatibilité avec les
// custom domains historiques type haircoifflille.fr.
const BOOKING_DOMAIN  = (import.meta.env.VITE_BOOKING_DOMAIN || '').toLowerCase();
const BOOKING_SLUG    = import.meta.env.VITE_BOOKING_SLUG || '';

function hostname() {
  return (typeof window !== 'undefined' ? window.location.hostname : '').toLowerCase();
}

function isLegacyBookingHost() {
  if (!BOOKING_DOMAIN) return false;
  const h = hostname();
  return h === BOOKING_DOMAIN || h === `www.${BOOKING_DOMAIN}`;
}

function isMarketingHost() {
  // Pendant le prerender (build), il n'y a pas de vrai hostname : le plugin
  // injecte window.__PRERENDER_INJECTED.isPrerender pour forcer le rendu du
  // site marketing (sinon on prerendrait le shell de l'app commercant).
  if (typeof window !== 'undefined' &&
      window.__PRERENDER_INJECTED &&
      window.__PRERENDER_INJECTED.isPrerender) {
    return true;
  }
  // Salon DZ (branche de test) : ?site=public force le site public (porte
  // homme/femme + marketplace) sur une preview Vercel ; ?site=app revient a
  // l'app commercant. Persiste en sessionStorage (cf. utils/marketingUrl).
  const ov = publicSiteOverride();
  if (ov !== null) return ov;
  const h = hostname();
  return h === 'flowiapro.com' || h === 'www.flowiapro.com';
}

// Wrappers — useParams() doit être dans le contexte <Route>
//
// Resolution slug : si le visiteur arrive avec un slug archive (ancien
// nom du salon, ancienne adresse, edition manuelle), on l'aiguille vers
// le slug actuel via /api/pub/resolve. Cas typique : QR code physique
// imprime avec l'ancien slug, lien partage par SMS marketing avant un
// changement d'adresse, bookmark navigateur. La redirection se fait via
// navigate(replace=true) pour ne pas polluer l'historique.
//
// On utilise sessionStorage pour eviter de re-resoudre le meme slug a
// chaque navigation interne (auth, étapes, etc.) au sein de la session.
function BookingPageWrapper() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [resolved, setResolved] = useState(() => {
    try {
      const cached = sessionStorage.getItem('ff_slug_resolved_' + slug);
      return cached ? slug : null; // resolu en cache => slug actuel
    } catch { return null; }
  });

  useEffect(() => {
    if (resolved) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await pubApi.resolveSlug(slug);
        if (cancelled) return;
        if (r.redirected && r.slug && r.slug !== slug) {
          // Reconstruit l'URL avec le nouveau slug en preservant le path
          // (gère /book/:slug ET /marketplace/book/:slug) et la query string.
          const escapedSlug = slug.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
          const newPath = location.pathname.replace(
            new RegExp('(^|/)book/' + escapedSlug),
            '$1book/' + r.slug
          );
          navigate(newPath + location.search + location.hash, { replace: true });
          return;
        }
        try { sessionStorage.setItem('ff_slug_resolved_' + r.slug, '1'); } catch {}
        setResolved(r.slug || slug);
      } catch {
        // Si resolve echoue (404 ou serveur), on tente quand meme de
        // monter BookingPage avec le slug d'origine — son propre
        // chargement affichera le message d'erreur approprie.
        setResolved(slug);
      }
    })();
    return () => { cancelled = true; };
  }, [slug, resolved, navigate, location.pathname, location.search, location.hash]);

  if (!resolved) return null; // bref : l'app a deja un fond, BookingPage gere son spinner
  return <BookingPage slug={resolved} />;
}

function BookingPolitiqueWrapper() {
  const { slug } = useParams();
  return <BookingPolitique slug={slug} />;
}

// Landing QR — /j/:slug redirige vers le flow quick (prénom + tel uniquement).
// URL courte pour QR plus dense et plus fiable au scan.
function QuickJoinRedirect() {
  const { slug } = useParams();
  const location = useLocation();
  const sep = location.search ? '&' : '?';
  return <Navigate to={`/book/${slug}/auth${location.search}${sep}quick=1`} replace />;
}

// Plus de BookingHostGate basé sur le host : la décision se fait désormais
// par URL. /book/:slug/* → page de réservation nue (site propre du
// commerçant) ; /marketplace/book/:slug/* → enveloppée par
// MarketplaceBookingShell (header marketplace + footer + breadcrumb).
//
// Cela donne au commerçant deux liens distincts qu'il peut partager :
//   - https://flowiapro.com/book/<slug>           (sans header marketplace)
//   - https://flowiapro.com/marketplace/book/<slug>  (avec header marketplace)
//
// La marketplace publique linke par défaut vers /marketplace/book/<slug>
// pour préserver le contexte de navigation (cf. MerchantSearchCard).

// Liste des paths marketing : utilisee pour rediriger vers flowiapro.com
// les hits directs sur commercant.flowiapro.com/tarifs (etc.). En usage
// normal, le Header/Footer produisent deja des URLs absolues via
// utils/marketingUrl.MarketingLink, donc on n'arrive ici que par typage
// d'URL direct ou via un vieux lien externe.
const MARKETING_PATHS = [
  '/pro',
  '/fonctionnalites',
  '/tarifs',
  '/pour-qui',
  '/a-propos',
  '/contact',
  '/marketplace',
  '/portail-client',
  '/mentions-legales',
  '/confidentialite',
  '/cgu',
];

function pathIsMarketing(pathname) {
  return MARKETING_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

// Catch-all : décide entre marketing site, redirect legacy ou app commerçant
// selon le hostname courant. /book/* sont toujours accessibles avant ce switch.
function RootSwitch() {
  const location = useLocation();

  // Custom domain commerçant historique (haircoifflille.fr, etc.) →
  // redirige tout sur /book/<slug>.
  if (isLegacyBookingHost() && BOOKING_SLUG) {
    const target = `/book/${BOOKING_SLUG}${location.search || ''}`;
    return <Navigate to={target} replace />;
  }

  // Site marketing (flowiapro.com / www.flowiapro.com)
  if (isMarketingHost()) {
    return (
      <Routes>
        {/* Salon DZ : l'entree du site public est la porte homme/femme,
            rendue HORS MarketingLayout (plein ecran, sans header/footer).
            Le site vitrine pro (ancienne Landing) vit desormais sur /pro. */}
        <Route path="/" element={<GenderGate />} />
        <Route element={<MarketingLayout />}>
          <Route path="/pro"               element={<Landing />} />
          <Route path="/fonctionnalites"   element={<Features />} />
          <Route path="/tarifs"            element={<Pricing />} />
          <Route path="/pour-qui"          element={<Industries />} />
          <Route path="/a-propos"          element={<About />} />
          <Route path="/contact"           element={<Contact />} />
          <Route path="/marketplace"       element={<ClientPortal />} />
          {/* Alias historique : /portail-client a ete remplace par /marketplace
              pour aligner avec le path API /api/pub/marketplace. Redirect 301
              cote frontend pour ne pas casser les anciens liens partages. */}
          <Route path="/portail-client"    element={<Navigate to="/marketplace" replace />} />
          <Route path="/mentions-legales"  element={<LegalNotice />} />
          <Route path="/confidentialite"   element={<Privacy />} />
          <Route path="/cgu"               element={<Terms />} />
          <Route path="*"                  element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );
  }

  // App commerçant (commercant.flowiapro.com / localhost / preview Vercel)
  // Si l'URL est un path marketing tape directement (vieux bookmark,
  // partage externe), on redirige cross-domain vers flowiapro.com pour
  // que le contenu soit servi par le bon host. Le Header/Footer eux-memes
  // produisent deja des URLs absolues — on n'arrive ici qu'en cas de
  // typage manuel ou referer externe.
  if (pathIsMarketing(location.pathname) && typeof window !== 'undefined') {
    window.location.replace(
      'https://flowiapro.com' + location.pathname + location.search + location.hash
    );
    return null;
  }

  return (
    <IdleLockProvider>
      <App />
      <LockScreen />
      <InstallPrompt />
      <UpdateBanner />
      <OfflineBanner />
      <RefreshFab />
    </IdleLockProvider>
  );
}

// PWA — enregistre le SW uniquement côté commerçant. Les pages publiques de
// réservation (flowiapro.com, custom domains commerçants) ne sont pas
// installables — pas de SW pour ne pas polluer le cache des visiteurs.
if (!isLegacyBookingHost() && !isMarketingHost()) {
  registerSW();
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <HelmetProvider>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AdminProvider>
            <TabletModeProvider>
            <AdminModeProvider>
            {/* Overlay maintenance plein ecran. Ecoute l'event 'ff-maintenance-on'
                dispatch par utils/api.js sur un 503 + header X-Maintenance:1.
                Rendu au plus haut niveau pour couvrir merchant + booking publique. */}
            <MaintenanceOverlay />
            <ErrorBoundary>
            <Routes>
              {/* ── Callback OAuth (popup retour Google → ferme + broadcast) ── */}
              <Route path="/__oauth" element={<OAuthCallback />} />
              {/* ── Routes PUBLIQUES booking nu (site propre commerçant) ──
                  Pas de wrapping marketplace, peu importe le host. */}
              <Route path="/j/:slug"                                                                                       element={<QuickJoinRedirect />} />
              <Route path="/book/:slug/politique"                                                                          element={<BookingPolitiqueWrapper />} />
              <Route path="/book/:slug/conditions"                                                                         element={<BookingPolitiqueWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe/:employeeId/date/:dateStr/creneau/:slot/confirmation"    element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe/:employeeId/date/:dateStr/creneau/:slot/infos"           element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe/:employeeId/date/:dateStr/creneau"                       element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe/:employeeId/date"                                        element={<BookingPageWrapper />} />
              <Route path="/book/:slug/employe/:employeeId"                                                                element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe"                                                         element={<BookingPageWrapper />} />
              <Route path="/book/:slug/auth/google-confirm"                                                                element={<GoogleConfirm />} />
              <Route path="/book/:slug/auth"                                                                               element={<BookingPageWrapper />} />
              <Route path="/book/:slug/login"                                                                              element={<BookingPageWrapper />} />
              <Route path="/book/:slug/register"                                                                           element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/profil"                                                                      element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/rdv"                                                                         element={<BookingPageWrapper />} />
              {/* Sous-onglets RDV avec persistance URL (avenir/passes/annules) :
                  permet au client de refresh / partager / mettre en favori
                  son onglet actif. MyAppointments lit le segment au mount
                  et set le rdvTab en consequence + replaceState au switch. */}
              <Route path="/book/:slug/client/rdv/:rdvTab"                                                                 element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/passages"                                                                    element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/passages/:visitId"                                                           element={<BookingPageWrapper />} />
              <Route path="/book/:slug/parrain"                                                                            element={<BookingPageWrapper />} />
              <Route path="/book/:slug"                                                                                    element={<BookingPageWrapper />} />

              {/* ── Routes booking SOUS la marketplace ──
                  /marketplace/book/:slug/* → wrappées par MarketplaceBookingShell
                  qui ajoute le Header marketplace (logo + Portail pro + Mon
                  compte client) et le Footer. Le composant booking interne
                  reste identique mais navigate avec ce préfixe (helpers.js
                  getBookingBase). */}
              <Route element={<MarketplaceBookingShell />}>
                <Route path="/marketplace/book/:slug/politique"                                                                          element={<BookingPolitiqueWrapper />} />
                <Route path="/marketplace/book/:slug/conditions"                                                                         element={<BookingPolitiqueWrapper />} />
                <Route path="/marketplace/book/:slug/service/:serviceId/employe/:employeeId/date/:dateStr/creneau/:slot/confirmation"    element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/service/:serviceId/employe/:employeeId/date/:dateStr/creneau/:slot/infos"           element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/service/:serviceId/employe/:employeeId/date/:dateStr/creneau"                       element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/service/:serviceId/employe/:employeeId/date"                                        element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/employe/:employeeId"                                                                element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/service/:serviceId/employe"                                                         element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/auth/google-confirm"                                                                element={<GoogleConfirm />} />
                <Route path="/marketplace/book/:slug/auth"                                                                               element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/login"                                                                              element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/register"                                                                           element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/client/profil"                                                                      element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/client/rdv"                                                                         element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/client/rdv/:rdvTab"                                                                 element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/client/passages"                                                                    element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/client/passages/:visitId"                                                           element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug/parrain"                                                                            element={<BookingPageWrapper />} />
                <Route path="/marketplace/book/:slug"                                                                                    element={<BookingPageWrapper />} />
              </Route>

              {/* Commit 26 — désinscription marketing publique (RGPD), accessible sans auth */}
              <Route path="/unsubscribe"                                                                                 element={<Unsubscribe />} />
              {/* ── Catch-all : marketing, redirect legacy ou app commerçant selon hostname ── */}
              <Route path="/*" element={<RootSwitch />} />
            </Routes>
            </ErrorBoundary>
            </AdminModeProvider>
            </TabletModeProvider>
          </AdminProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);
