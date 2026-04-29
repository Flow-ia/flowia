import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams, Navigate, useLocation } from 'react-router-dom';
import App from './App';
import BookingPage from './pages/BookingPage';
import BookingPolitique from './pages/BookingPolitique';
import OAuthCallback from './pages/OAuthCallback';
import GoogleConfirm from './pages/booking-page/auth/GoogleConfirm';
import Unsubscribe from './pages/unsubscribe/Unsubscribe';
import { AuthProvider } from './hooks/useAuth';
import { AdminProvider } from './hooks/useAdmin';
import { ThemeProvider } from './hooks/useTheme';
import { TabletModeProvider } from './contexts/TabletModeProvider';
import { AdminModeProvider } from './contexts/AdminModeContext';
import { IdleLockProvider } from './hooks/useIdleLock';
import LockScreen from './components/LockScreen';
import InstallPrompt from './pwa/InstallPrompt';
import { registerSW } from './pwa/registerSW';
import './index.css';

// ── Détection du domaine au montage ──────────────────────────────────────────
// haircoifflille.fr (+ www.) → page réservation publique avec slug par défaut
// commercant.haircoifflille.fr / localhost / autres → app commerçant (admin)
// Les routes /book/:slug/* restent actives sur les deux domaines (rétro-compat).
const BOOKING_DOMAIN    = (import.meta.env.VITE_BOOKING_DOMAIN    || '').toLowerCase();
const COMMERCANT_DOMAIN = (import.meta.env.VITE_COMMERCANT_DOMAIN || '').toLowerCase();
const BOOKING_SLUG      = import.meta.env.VITE_BOOKING_SLUG || '';

function isBookingHost() {
  if (!BOOKING_DOMAIN) return false;
  const h = (typeof window !== 'undefined' ? window.location.hostname : '').toLowerCase();
  return h === BOOKING_DOMAIN || h === `www.${BOOKING_DOMAIN}`;
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

// Racine catch-all : sur booking domain, redirige vers /book/<slug> (garde
// toutes les URLs internes `/book/lille/...` générées par BookingPage stables).
// Sinon, rend l'app commerçant comme avant.
//
// Commit 31 — sur le domaine commerçant, on englobe <App/> dans
// IdleLockProvider et on rend <LockScreen/> par-dessus. Le hook lit la
// config depuis user_settings côté backend → si l'utilisateur n'est pas
// connecté ou a désactivé le mode veille, le LockScreen reste invisible.
function RootSwitch() {
  const location = useLocation();
  if (isBookingHost() && BOOKING_SLUG) {
    const target = `/book/${BOOKING_SLUG}${location.search || ''}`;
    return <Navigate to={target} replace />;
  }
  return (
    <IdleLockProvider>
      <App />
      <LockScreen />
      <InstallPrompt />
    </IdleLockProvider>
  );
}

// PWA — enregistre le SW uniquement côté commerçant. Le booking public
// (haircoifflille.fr) n'a pas besoin d'être installable.
if (!isBookingHost()) {
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
              {/* ── Routes PUBLIQUES booking ── */}
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
              <Route path="/book/:slug/employe/:employeeId"                                                          element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe"                                                      element={<BookingPageWrapper />} />
              {/* RGPD commit 19 — page de confirmation OAuth Google (création différée) */}
              <Route path="/book/:slug/auth/google-confirm"                                                                    element={<GoogleConfirm />} />
              <Route path="/book/:slug/auth"                                                                                    element={<BookingPageWrapper />} />
              <Route path="/book/:slug/login"                                                                                   element={<BookingPageWrapper />} />
              <Route path="/book/:slug/register"                                                                                element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/profil"                                                                        element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/rdv"                                                                           element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/passages"                                                                      element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/passages/:visitId"                                                             element={<BookingPageWrapper />} />
              <Route path="/book/:slug/parrain"                                                                              element={<BookingPageWrapper />} />
              <Route path="/book/:slug"                                                                                  element={<BookingPageWrapper />} />
              {/* Commit 26 — désinscription marketing publique (RGPD), accessible sans auth */}
              <Route path="/unsubscribe"                                                                                  element={<Unsubscribe />} />
              {/* ── Racine : BookingPage sur domaine public, app commerçant ailleurs ── */}
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
