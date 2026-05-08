// MarketplaceBookingShell.jsx — wrapper appliqué autour des pages /book/:slug/*
// QUAND le visiteur est sur flowiapro.com (venu de la marketplace).
//
// Logique :
//   - flowiapro.com/book/lille    → ENVELOPPÉ : Header marketplace + breadcrumb
//                                   "Retour aux salons" + page booking + Footer
//                                   marketplace. Visuellement, le client comprend
//                                   qu'il est dans l'écosystème FlowIA.
//   - commercant.haircoifflille.fr/book/lille  (custom domain legacy)
//   - commercant.flowiapro.com/book/lille      (rare, mais possible)
//   - localhost / *.vercel.app                  (dev/preview)
//      → PAS DE WRAPPER : page booking nue, façon "site propre du commerçant".
//
// La détection se fait dans `BookingHostGate` (index.jsx) via `isMarketingHost()`.
// Ce composant ne s'occupe que du rendu, en supposant que l'hôte est bien
// flowiapro.com.
//
// FDS-2026 : LightThemeProvider pour forcer le mode clair (cohérent avec le
// reste du site marketing, indépendamment du toggle dark de l'app commerçant).
import { Outlet, Link } from 'react-router-dom';
import { LightThemeProvider } from '../../hooks/useTheme';
import Header from './components/Header';
import Footer from './components/Footer';
import { S } from './components/shadcn';

export default function MarketplaceBookingShell() {
  return (
    <LightThemeProvider>
      <div style={{
        minHeight: '100vh',
        background: S.bg,
        color: S.fg,
        fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        display: 'flex', flexDirection: 'column',
      }}>
        <Header />

        {/* Breadcrumb "Retour aux salons" — accentue le contexte marketplace
            et donne au client un retour explicite vers la liste des salons. */}
        <div style={{
          background: S.bgMuted,
          borderBottom: `1px solid ${S.border}`,
          padding: '10px 24px',
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <Link to="/marketplace" style={{
              fontSize: 13, fontWeight: 500, color: S.fg2,
              textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 0',
              transition: 'color 0.15s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.color = S.fg; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = S.fg2; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
              Retour aux salons
            </Link>
          </div>
        </div>

        <main style={{ flex: 1 }}>
          <Outlet />
        </main>

        <Footer />
      </div>
    </LightThemeProvider>
  );
}
