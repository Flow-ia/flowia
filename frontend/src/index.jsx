import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams, Navigate, useLocation } from 'react-router-dom';
import * as Sentry from '@sentry/react';
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
import './index.css';

// ── Sentry — observabilité prod (commit 29) ────────────────────────────────
// RGPD strict : replays vidéo désactivés (replaysOnErrorSampleRate=0,
// replaysSessionSampleRate=0). Pas de capture DOM, pas de session replay,
// pas de breadcrumbs réseau (qui peuvent contenir des données client).
// Si VITE_SENTRY_DSN_FRONTEND absent → no-op (l'app démarre normalement).
if (import.meta.env.VITE_SENTRY_DSN_FRONTEND) {
  Sentry.init({
    dsn:                       import.meta.env.VITE_SENTRY_DSN_FRONTEND,
    environment:               import.meta.env.MODE,
    tracesSampleRate:          0.1,
    replaysOnErrorSampleRate:  0,
    replaysSessionSampleRate:  0,
    sendDefaultPii:            false,
    integrations:              [], // pas de browser tracing par défaut, pas de session replay
    beforeSend(event) {
      // Scrub email/téléphone dans les messages (défense en profondeur)
      const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/gi;
      const PHONE_RE = /\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{2,4}\b/g;
      const scrub = (s) => typeof s === 'string'
        ? s.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]')
        : s;
      if (event.message) event.message = scrub(event.message);
      if (event.exception?.values) {
        for (const ex of event.exception.values) if (ex.value) ex.value = scrub(ex.value);
      }
      if (Array.isArray(event.breadcrumbs)) {
        for (const b of event.breadcrumbs) if (b.message) b.message = scrub(b.message);
      }
      // Pas de user info, pas de cookies, pas de body, pas de query string
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.query_string;
      }
      delete event.user;
      delete event.extra;
      return event;
    },
  });
} else if (import.meta.env.MODE === 'production') {
  // En prod, on log un warning visible si DSN manquant — en dev, silence
  // pour éviter le bruit (Sentry est généralement off en local).
  // eslint-disable-next-line no-console
  console.warn('[Sentry] VITE_SENTRY_DSN_FRONTEND non défini — observabilité erreurs désactivée');
}

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
    </IdleLockProvider>
  );
}

// Fallback UI affiché si Sentry.ErrorBoundary attrape une erreur React.
// Volontairement minimaliste, sans dépendances de hooks/contextes (qui
// peuvent être eux-mêmes la cause de l'erreur). Bouton « Recharger » pour
// récupérer rapidement sans perdre l'utilisateur sur une page blanche.
function SentryFallback() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif',
                  maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>{"Une erreur est survenue"}</h1>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 16px' }}>
        {"Notre équipe a été notifiée. Vous pouvez recharger la page pour réessayer."}
      </p>
      <button onClick={() => window.location.reload()}
              style={{ padding: '10px 16px', borderRadius: 8, border: 'none',
                       background: '#111827', color: '#fff', cursor: 'pointer',
                       fontSize: 13, fontWeight: 500 }}>
        {"Recharger la page"}
      </button>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<SentryFallback />}>
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
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
