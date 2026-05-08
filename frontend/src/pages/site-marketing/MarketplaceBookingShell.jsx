// MarketplaceBookingShell.jsx — wrapper appliqué autour des routes
// /marketplace/book/:slug/* uniquement (cf. index.jsx).
//
// Distinction importante avec /book/:slug/* (sans préfixe marketplace) :
//   - /book/<slug>            → page de réservation nue, façon "site propre
//                                du commerçant". Aucun header marketplace.
//   - /marketplace/book/<slug> → enveloppé par CE composant : header
//                                marketplace dédié (logo FlowIA + Portail pro
//                                + Mon compte client) + breadcrumb retour +
//                                page booking + Footer.
//
// Le commerçant peut donc partager 2 liens distincts selon ce qu'il veut
// véhiculer. La marketplace publique linke par défaut vers /marketplace/book/...
//
// Header dédié (pas le Header marketing complet avec mega-menu nav) — on
// veut une UI épurée pendant la réservation : juste le logo + 2 CTAs à droite.
//
// FDS-2026 : LightThemeProvider pour forcer le light mode (cohérent avec le
// reste du site marketing, indépendamment du toggle dark de l'app commerçant).
import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LightThemeProvider } from '../../hooks/useTheme';
import { S } from './components/shadcn';
import Footer from './components/Footer';
import { globalClientApi } from '../../utils/api';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

// Header marketplace dédié — logo gauche, "Portail pro" + "Mon compte
// client" / profil connecté à droite. Sticky comme le Header marketing.
function MarketplaceHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [client, setClient]     = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Charge l'état de connexion depuis localStorage (ff_client_info posé par
  // AuthPanel après login global). Re-check sur chaque navigation pour
  // refléter login/logout sans reload.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ff_client_info');
      setClient(raw ? JSON.parse(raw) : null);
    } catch { setClient(null); }
  }, [location.pathname]);

  // Lit le slug depuis l'URL pour construire les liens auth qui restent
  // sous /marketplace/book/<slug>/login (le client garde sa page après auth).
  const m = location.pathname.match(/^\/marketplace\/book\/([^/]+)/);
  const slug = m && m[1];
  const loginHref = slug ? `/marketplace/book/${slug}/login` : '/marketplace';

  const onLogout = async () => {
    try { await globalClientApi.logout(); } catch {}
    try {
      localStorage.removeItem('ff_client_token');
      localStorage.removeItem('ff_gc_token');
      localStorage.removeItem('ff_client_info');
    } catch {}
    setClient(null);
    setMenuOpen(false);
    // Reste sur la page courante — l'état déconnecté apparaît immédiatement.
  };

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: scrolled ? 'rgba(255,255,255,0.85)' : S.bg,
      borderBottom: `1px solid ${scrolled ? S.border : 'transparent'}`,
      backdropFilter: scrolled ? 'saturate(160%) blur(10px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'saturate(160%) blur(10px)' : 'none',
      transition: 'background 0.2s ease, border-color 0.2s ease',
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        {/* Logo → marketplace home */}
        <Link to="/marketplace" style={{
          display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
          flexShrink: 0,
        }}>
          <img src="/images/logo-app.svg" alt="FlowIA" style={{ width: 28, height: 28 }} />
          <span style={{ fontSize: 18, fontWeight: 500, color: S.fg, letterSpacing: '-0.02em' }}>FlowIA</span>
        </Link>

        {/* CTAs droite */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <a href={COMMERCANT_URL} style={{
            fontSize: 13, fontWeight: 500, color: S.fg,
            textDecoration: 'none', padding: '8px 14px', borderRadius: S.r,
            border: `1px solid ${S.border}`, background: S.bg,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            transition: 'background 0.15s ease',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = S.bgHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = S.bg; }}>
            Portail pro
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>

          {!client ? (
            <Link to={loginHref} style={{
              fontSize: 13, fontWeight: 500, color: S.fgInv,
              textDecoration: 'none', padding: '8px 14px', borderRadius: S.r,
              background: S.fg, border: `1px solid ${S.fg}`,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              transition: 'opacity 0.15s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = 0.9; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = 1; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Mon compte client
            </Link>
          ) : (
            // Profil connecté : bouton avec initiale + menu déroulant
            // (Mes RDV / Mon profil / Déconnexion).
            <div style={{ position: 'relative' }}>
              <button type="button" onClick={() => setMenuOpen(o => !o)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px 6px 6px', borderRadius: 99,
                  background: S.bg, border: `1px solid ${S.border}`,
                  cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 13, fontWeight: 500, color: S.fg,
                }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 99,
                  background: S.fg, color: S.fgInv,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 500,
                }}>
                  {(client.first_name?.[0] || client.email?.[0] || '?').toUpperCase()}
                </span>
                <span style={{ maxWidth: 140,
                               overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {client.first_name || client.email}
                </span>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{
                  transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s ease', opacity: 0.6,
                }}>
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {menuOpen && (
                <>
                  {/* Backdrop pour fermer au clic externe */}
                  <div onClick={() => setMenuOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}/>
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                    minWidth: 200, background: S.bg, borderRadius: 10,
                    border: `1px solid ${S.border}`, boxShadow: S.shadowLg,
                    padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
                    zIndex: 50,
                  }}>
                    {slug && (
                      <>
                        <Link to={`/marketplace/book/${slug}/client/rdv`}
                          onClick={() => setMenuOpen(false)}
                          style={menuItemStyle()}>
                          Mes rendez-vous
                        </Link>
                        <Link to={`/marketplace/book/${slug}/client/profil`}
                          onClick={() => setMenuOpen(false)}
                          style={menuItemStyle()}>
                          Mon profil
                        </Link>
                        <div style={{ height: 1, background: S.border, margin: '4px 0' }}/>
                      </>
                    )}
                    <button type="button" onClick={onLogout}
                      style={{ ...menuItemStyle(), color: '#991b1b',
                               background: 'transparent', border: 'none',
                               textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                      Déconnexion
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function menuItemStyle() {
  return {
    display: 'block', padding: '8px 12px', borderRadius: 6,
    fontSize: 13, fontWeight: 500, color: S.fg,
    textDecoration: 'none', fontFamily: 'inherit',
    transition: 'background 0.12s ease',
  };
}

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
        <MarketplaceHeader />

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
