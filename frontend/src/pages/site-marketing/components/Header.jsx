import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../../../hooks/useTheme';
import { I } from '../../../utils/icons';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

export default function Header() {
  const { theme: t } = useTheme();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 980);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    const onResize = () => setIsMobile(window.innerWidth < 980);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);

  const navLinks = [
    { to: '/fonctionnalites', label: 'Fonctionnalités' },
    { to: '/tarifs',          label: 'Tarifs' },
    { to: '/pour-qui',        label: 'Pour qui' },
    { to: '/a-propos',        label: 'À propos' },
    { to: '/contact',         label: 'Contact' },
  ];

  const linkStyle = (active) => ({
    fontSize: 14, fontWeight: 500, color: active ? t.text : t.muted,
    textDecoration: 'none', padding: '8px 12px', borderRadius: 8,
    transition: 'color 0.15s ease, background 0.15s ease',
    cursor: 'pointer', whiteSpace: 'nowrap',
  });

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: scrolled ? t.navBg : t.canvas,
      borderBottom: `0.5px solid ${scrolled ? t.navBorder : 'transparent'}`,
      backdropFilter: scrolled ? 'saturate(140%) blur(8px)' : 'none',
      transition: 'background 0.2s ease, border-color 0.2s ease',
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/images/logo-app.svg" alt="FlowIA" style={{ width: 28, height: 28 }} />
          <span style={{ fontSize: 18, fontWeight: 500, color: t.text, letterSpacing: -0.2 }}>FlowIA</span>
        </Link>

        {!isMobile && (
          <nav style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center' }}>
            {navLinks.map(l => (
              <Link key={l.to} to={l.to} style={linkStyle(loc.pathname === l.to)}
                onMouseEnter={(e) => { e.currentTarget.style.background = t.cardAlt; e.currentTarget.style.color = t.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = loc.pathname === l.to ? t.text : t.muted; }}>
                {l.label}
              </Link>
            ))}
          </nav>
        )}

        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link to="/portail-client" style={{
              fontSize: 14, fontWeight: 500, color: t.text,
              textDecoration: 'none', padding: '9px 16px', borderRadius: 8,
              border: `0.5px solid ${t.borderStrong}`,
              transition: 'background 0.15s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = t.cardAlt; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              Portail client
            </Link>
            <a href={COMMERCANT_URL} style={{
              fontSize: 14, fontWeight: 500, color: t.bg,
              textDecoration: 'none', padding: '9px 16px', borderRadius: 8,
              background: t.text, border: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              transition: 'opacity 0.15s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = 0.85; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = 1; }}>
              Portail pro <I.ChevR style={{ width: 14, height: 14 }} />
            </a>
          </div>
        )}

        {isMobile && (
          <button onClick={() => setMobileOpen(o => !o)} aria-label="Menu"
            style={{
              width: 38, height: 38, borderRadius: 8,
              background: 'transparent', border: `0.5px solid ${t.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: t.text,
            }}>
            {mobileOpen ? (
              <I.X style={{ width: 18, height: 18 }} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6"  x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            )}
          </button>
        )}
      </div>

      {isMobile && mobileOpen && (
        <div style={{
          borderTop: `0.5px solid ${t.border}`,
          background: t.canvas,
          padding: '12px 16px 18px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {navLinks.map(l => (
            <Link key={l.to} to={l.to} style={{
              fontSize: 15, fontWeight: 500,
              color: loc.pathname === l.to ? t.text : t.textSub,
              textDecoration: 'none', padding: '12px 12px', borderRadius: 8,
              background: loc.pathname === l.to ? t.cardAlt : 'transparent',
            }}>
              {l.label}
            </Link>
          ))}
          <div style={{ height: 1, background: t.border, margin: '8px 0' }} />
          <Link to="/portail-client" style={{
            fontSize: 15, fontWeight: 500, color: t.text,
            textDecoration: 'none', padding: '12px 12px', borderRadius: 8,
            border: `0.5px solid ${t.borderStrong}`, textAlign: 'center',
          }}>
            Portail client
          </Link>
          <a href={COMMERCANT_URL} style={{
            fontSize: 15, fontWeight: 500, color: t.bg,
            textDecoration: 'none', padding: '12px 12px', borderRadius: 8,
            background: t.text, textAlign: 'center', marginTop: 4,
          }}>
            Portail pro
          </a>
        </div>
      )}
    </header>
  );
}
