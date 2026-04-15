import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import App from './App';
import BookingPage from './pages/BookingPage';
import BookingPolitique from './pages/BookingPolitique';
import { AuthProvider } from './hooks/useAuth';
import { AdminProvider } from './hooks/useAdmin';
import { ThemeProvider } from './hooks/useTheme';
import './index.css';

// Wrappers — useParams() doit être dans le contexte <Route>
function BookingPageWrapper() {
  const { slug } = useParams();
  return <BookingPage slug={slug} />;
}

function BookingPolitiqueWrapper() {
  const { slug } = useParams();
  return <BookingPolitique slug={slug} />;
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
              <Route path="/book/:slug"                                                                                  element={<BookingPageWrapper />} />
              {/* ── Routes privées (app commerçant) ── */}
              <Route path="/*" element={<App />} />
            </Routes>
          </AdminProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
