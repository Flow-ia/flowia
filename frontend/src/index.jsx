import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams, Navigate, useLocation } from 'react-router-dom';
import App from './App';
import BookingPage from './pages/BookingPage';
import BookingPolitique from './pages/BookingPolitique';
import { AuthProvider } from './hooks/useAuth';
import { AdminProvider } from './hooks/useAdmin';
import { ThemeProvider } from './hooks/useTheme';
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
function RootSwitch() {
  const location = useLocation();
  if (isBookingHost() && BOOKING_SLUG) {
    const target = `/book/${BOOKING_SLUG}${location.search || ''}`;
    return <Navigate to={target} replace />;
  }
  return <App />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AdminProvider>
            <Routes>
              {/* ── Routes PUBLIQUES booking ── */}
              <Route path="/j/:slug"                                                                       element={<QuickJoinRedirect />} />
              <Route path="/book/:slug/politique"                                                          element={<BookingPolitiqueWrapper />} />
              {/* Toutes les sous-routes du flow de réservation → même composant BookingPage */}
              {/* Le composant gère lui-même la lecture et l'ecriture de l'URL via useNavigate  */}
              <Route path="/book/:slug/service/:serviceId/employe/:employeeId/date/:dateStr/creneau/:slot/confirmation" element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe/:employeeId/date/:dateStr/creneau/:slot/infos"        element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe/:employeeId/date/:dateStr/creneau"                    element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe/:employeeId/date"                                     element={<BookingPageWrapper />} />
              <Route path="/book/:slug/employe/:employeeId"                                                          element={<BookingPageWrapper />} />
              <Route path="/book/:slug/service/:serviceId/employe"                                                      element={<BookingPageWrapper />} />
              <Route path="/book/:slug/auth"                                                                                    element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/profil"                                                                        element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/rdv"                                                                           element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/passages"                                                                      element={<BookingPageWrapper />} />
              <Route path="/book/:slug/client/passages/:visitId"                                                             element={<BookingPageWrapper />} />
              <Route path="/book/:slug/parrain"                                                                              element={<BookingPageWrapper />} />
              <Route path="/book/:slug"                                                                                  element={<BookingPageWrapper />} />
              {/* ── Racine : BookingPage sur domaine public, app commerçant ailleurs ── */}
              <Route path="/*" element={<RootSwitch />} />
            </Routes>
          </AdminProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
