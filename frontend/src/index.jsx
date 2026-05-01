import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams, Navigate, useLocation } from 'react-router-dom';
import App from './App';
import BookingPage from './pages/BookingPage';
import BookingPolitique from './pages/BookingPolitique';
import OAuthCallback from './pages/OAuthCallback';
import GoogleConfirm from './pages/booking-page/auth/GoogleConfirm';
import Unsubscribe from './pages/unsubscribe/Unsubscribe';
import MarketingLayout from './pages/site-marketing/MarketingLayout';
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
function BookingPageWrapper() {
  const { slug } = useParams();
  return <BookingPage slug={slug} />;
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
          <Route path="/fonctionnalites"   element={<Features />} />
          <Route path="/tarifs"            element={<Pricing />} />
          <Route path="/pour-qui"          element={<Industries />} />
          <Route path="/a-propos"          element={<About />} />
          <Route path="/contact"           element={<Contact />} />
          <Route path="/portail-client"    element={<ClientPortal />} />
          <Route path="/mentions-legales"  element={<LegalNotice />} />
          <Route path="/confidentialite"   element={<Privacy />} />
          <Route path="/cgu"               element={<Terms />} />
          <Route path="*"                  element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );
  }

  // App commerçant (commercant.flowiapro.com / localhost / preview Vercel)
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
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AdminProvider>
            <TabletModeProvider>
            <AdminModeProvider>
            <Routes>
              {/* ── Callback OAuth (popup retour Google → ferme + broadcast) ── */}
              <Route path="/__oauth" element={<OAuthCallback />} />
              {/* ── Routes PUBLIQUES booking (toujours accessibles sur tous les hosts) ── */}
              <Route path="/j/:slug"                                                                       element={<QuickJoinRedirect />} />
              <Route path="/book/:slug/politique"                                                          element={<BookingPolitiqueWrapper />} />
              {/* Alias commit 17 (RGPD) — /conditions pointe vers la même page que /politique. */}
              <Route path="/book/:slug/conditions"                                                         element={<BookingPolitiqueWrapper />} />
              {/* Toutes les sous-routes du flow de réservation → même composant BookingPage */}
              {/* Le composant gère lui-même la lecture et l'ecriture de l'URL via useNavigate  */}
              <Route path="/book/:slug/service/:serviceId/employe/:employeeId/date/:dateStr/creneau/:slot/confirmation" element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe/:employeeId/date/:dateStr/creneau/:slot/infos"        element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe/:employeeId/date/:dateStr/creneau"                    element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe/:employeeId/date"                                     element={<BookingPageWrapper />} />
              <Route path="/book/:slug/employe/:employeeId"                                                             element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe"                                                      element={<BookingPageWrapper />} />
              {/* RGPD commit 19 — page de confirmation OAuth Google (création différée) */}
              <Route path="/book/:slug/auth/google-confirm"                                                              element={<GoogleConfirm />} />
              <Route path="/book/:slug/auth"                                                                             element={<BookingPageWrapper />} />
              <Route path="/book/:slug/login"                                                                            element={<BookingPageWrapper />} />
              <Route path="/book/:slug/register"                                                                         element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/profil"                                                                    element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/rdv"                                                                       element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/passages"                                                                  element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/passages/:visitId"                                                         element={<BookingPageWrapper />} />
              <Route path="/book/:slug/parrain"                                                                          element={<BookingPageWrapper />} />
              <Route path="/book/:slug"                                                                                  element={<BookingPageWrapper />} />
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
