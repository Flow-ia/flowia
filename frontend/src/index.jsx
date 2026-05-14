import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams, Navigate, useLocation, useNavigate, Outlet } from 'react-router-dom';
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
import LegalNotice   from './pages/site-marketing/LegalNotice';
import Privacy       from './pages/site-marketing/Privacy';
import Terms         from './pages/site-marketing/Terms';
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

// Routes marketing partagees entre flowiapro.com (site complet) et
// commercant.flowiapro.com (Header/Footer coherents accessibles depuis
// l'app). Le Header marketing pointe vers /tarifs, /fonctionnalites, etc.
// — ces routes doivent donc resoudre vers MarketingLayout aussi sur le
// portail commercant pour que la navigation reste fonctionnelle.
const MARKETING_ROUTE_ELEMENTS = (
  <>
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
  </>
);

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
        <Route element={<MarketingLayout />}>
          <Route path="/"                  element={<Landing />} />
          {MARKETING_ROUTE_ELEMENTS}
          <Route path="*"                  element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );
  }

  // App commerçant (commercant.flowiapro.com / localhost / preview Vercel)
  // Les routes marketing (/tarifs, /fonctionnalites, etc.) sont aussi
  // exposees ici pour que le Header/Footer marketing affichent une nav
  // fonctionnelle quand un visiteur non-authentifie passe par le portail.
  // Les routes non-marketing tombent dans le catch-all <App /> qui gere
  // l'authentification et l'app commercante elle-meme.
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        {MARKETING_ROUTE_ELEMENTS}
      </Route>
      <Route path="*" element={
        <IdleLockProvider>
          <App />
          <LockScreen />
          <InstallPrompt />
          <UpdateBanner />
          <OfflineBanner />
          <RefreshFab />
        </IdleLockProvider>
      } />
    </Routes>
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
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AdminProvider>
            <TabletModeProvider>
            <AdminModeProvider>
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
            </AdminModeProvider>
            </TabletModeProvider>
          </AdminProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
