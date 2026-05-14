import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { I } from '../../../utils/icons';
import { S } from './shadcn';
import { MarketingLink, navigateToMarketing } from '../../../utils/marketingUrl';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

// Liste centrale — réutilisée dans Features.jsx (chaque entry a un anchor #id
// qui doit exister dans Features.jsx pour que la nav scrolle au bon endroit).
// Chaque groupe a un `slug` pour la nav rapide groupée (4 pills au lieu de 17).
export const FEATURE_GROUPS = [
  {
    slug: 'ia', label: 'Intelligence artificielle', short: 'IA',
    Ic: I.Sparkles, color: S.ax.violet,
    items: [
      { id: 'ia',         Ic: I.Sparkles, color: S.ax.violet, title: 'Marketing IA',  desc: "Campagnes générées et ciblées automatiquement." },
      { id: 'previsions', Ic: I.TrendUp,  color: S.ax.cyan,   title: 'Prévisions IA', desc: "Anticipez votre activité et vos creux." },
    ],
  },
  {
    slug: 'reservation', label: 'Réservation & site', short: 'Réservation',
    Ic: I.Calendar, color: S.ax.blue,
    items: [
      { id: 'reservation', Ic: I.Calendar, color: S.ax.blue,    title: 'Site de réservation',    desc: "Page publique 100 % personnalisable." },
      { id: 'annonce',     Ic: I.Bell,     color: S.ax.amber,   title: 'Annonce gratuite',       desc: "Bandeau d'info en haut de votre site." },
      { id: 'tarifs',      Ic: I.Tag,      color: S.ax.emerald, title: 'Tarifs & catégories',    desc: "Personnalisez vos prestations et prix." },
      { id: 'employes',    Ic: I.Users,    color: S.ax.cyan,    title: 'Employés & permissions', desc: "Gérez votre équipe et leurs droits." },
    ],
  },
  {
    slug: 'marketing', label: 'Marketing & relation client', short: 'Marketing',
    Ic: I.Send, color: S.ax.amber,
    items: [
      { id: 'sms',          Ic: I.Send,  color: S.ax.amber,   title: 'Marketing SMS',        desc: "Campagnes SMS ciblées et rappels auto." },
      { id: 'email',        Ic: I.Mail,  color: S.ax.indigo,  title: 'Marketing email',      desc: "Campagnes email transactionnelles." },
      { id: 'fidelite',     Ic: I.Heart, color: S.ax.rose,    title: 'Fidélité',             desc: "Programme de points et récompenses." },
      { id: 'parrainage',   Ic: I.Gift,  color: S.ax.emerald, title: 'Parrainage',           desc: "Récompensez parrains et filleuls." },
      { id: 'anniversaire', Ic: I.Star,  color: S.ax.amber,   title: 'Anniversaires',        desc: "Campagnes anniversaire automatiques." },
      { id: 'rappels',      Ic: I.Clock, color: S.ax.cyan,    title: 'Rappels automatiques', desc: "SMS de rappel 24h avant le RDV." },
    ],
  },
  {
    slug: 'caisse', label: 'Caisse & gestion', short: 'Caisse',
    Ic: I.Wallet, color: S.ax.emerald,
    items: [
      { id: 'caisse',       Ic: I.Wallet,     color: S.ax.emerald, title: 'Caisse intégrée',    desc: "Encaissez en quelques secondes." },
      { id: 'clients',      Ic: I.User,       color: S.ax.indigo,  title: 'Fichier clients',    desc: "Historique, fiches, segmentation." },
      { id: 'credits',      Ic: I.CreditCard, color: S.ax.amber,   title: 'Crédits & avoirs',   desc: "Suivi des dettes et avoirs clients." },
      { id: 'exports',      Ic: I.FileText,   color: S.ax.indigo,  title: 'Exports comptables', desc: "Export CSV/PDF mensuel automatique." },
      { id: 'statistiques', Ic: I.BarCh,      color: S.ax.cyan,    title: 'Statistiques',       desc: "Tableau de bord et reporting détaillé." },
    ],
  },
];

export default function Header() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled]     = useState(false);
  const [isMobile, setIsMobile]     = useState(typeof window !== 'undefined' && window.innerWidth < 980);
  const [megaOpen, setMegaOpen]     = useState(false);
  const closeTimer = useRef(null);

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

  useEffect(() => { setMobileOpen(false); setMegaOpen(false); }, [loc.pathname]);

  const navLinks = [
    { to: '/fonctionnalites', label: 'Fonctionnalités', mega: true },
    { to: '/tarifs',          label: 'Tarifs' },
    { to: '/pour-qui',        label: 'Pour qui' },
    { to: '/a-propos',        label: 'À propos' },
    { to: '/contact',         label: 'Contact' },
  ];

  const linkStyle = (active) => ({
    fontSize: 14, fontWeight: 500, color: active ? S.fg : S.fgMuted,
    textDecoration: 'none', padding: '8px 12px', borderRadius: S.r,
    transition: 'color 0.15s ease, background 0.15s ease',
    cursor: 'pointer', whiteSpace: 'nowrap',
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: 'transparent', border: 'none', fontFamily: 'inherit',
  });

  const openMega = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setMegaOpen(true);
  };
  const scheduleCloseMega = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMegaOpen(false), 120);
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
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
      }}>
        <MarketingLink to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/images/logo-app.svg" alt="FlowIA" style={{ width: 28, height: 28 }} />
          <span style={{ fontSize: 18, fontWeight: 500, color: S.fg, letterSpacing: '-0.02em' }}>FlowIA</span>
        </MarketingLink>

        {!isMobile && (
          <nav style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center', position: 'relative' }}>
            {navLinks.map(l => l.mega ? (
              <div key={l.to}
                onMouseEnter={openMega}
                onMouseLeave={scheduleCloseMega}
                style={{ position: 'relative' }}>
                <MarketingLink to={l.to} style={linkStyle(loc.pathname === l.to || megaOpen)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = S.bgHover; e.currentTarget.style.color = S.fg; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = (loc.pathname === l.to || megaOpen) ? S.fg : S.fgMuted; }}>
                  {l.label}
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{
                    transform: megaOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s ease', opacity: 0.6,
                  }}>
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </MarketingLink>
              </div>
            ) : (
              <MarketingLink key={l.to} to={l.to} style={linkStyle(loc.pathname === l.to)}
                onMouseEnter={(e) => { e.currentTarget.style.background = S.bgHover; e.currentTarget.style.color = S.fg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = loc.pathname === l.to ? S.fg : S.fgMuted; }}>
                {l.label}
              </MarketingLink>
            ))}
          </nav>
        )}

        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MarketingLink to="/marketplace" style={{
              fontSize: 14, fontWeight: 500, color: S.fg,
              textDecoration: 'none', padding: '9px 16px', borderRadius: S.r,
              border: `1px solid ${S.border}`, background: S.bg,
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = S.bgHover; e.currentTarget.style.borderColor = S.borderHv; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = S.bg; e.currentTarget.style.borderColor = S.border; }}>
              Trouver un salon
            </MarketingLink>
            <a href={COMMERCANT_URL} style={{
              fontSize: 14, fontWeight: 500, color: S.fgInv,
              textDecoration: 'none', padding: '9px 16px', borderRadius: S.r,
              background: S.fg, border: `1px solid ${S.fg}`,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              transition: 'opacity 0.15s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = 0.9; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = 1; }}>
              Portail pro
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
        )}

        {isMobile && (
          <button onClick={() => setMobileOpen(o => !o)} aria-label="Menu"
            style={{
              width: 40, height: 40, borderRadius: S.r,
              background: S.bg, border: `1px solid ${S.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: S.fg,
            }}>
            {mobileOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6"  x2="6" y2="18"/>
                <line x1="6"  y1="6"  x2="18" y2="18"/>
              </svg>
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

      {/* Mega-menu desktop */}
      {!isMobile && megaOpen && (
        <div onMouseEnter={openMega} onMouseLeave={scheduleCloseMega}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: S.bg,
            borderTop: `1px solid ${S.border}`,
            borderBottom: `1px solid ${S.border}`,
            boxShadow: S.shadowLg,
            zIndex: 49,
          }}>
          <div style={{
            maxWidth: 1200, margin: '0 auto', padding: '32px 24px',
            display: 'grid', gap: 32,
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          }}>
            {FEATURE_GROUPS.map(group => (
              <div key={group.label}>
                <p style={{
                  fontSize: 11, fontWeight: 500, color: S.fgSubtle,
                  textTransform: 'uppercase', letterSpacing: 1,
                  margin: 0, marginBottom: 14,
                }}>
                  {group.label}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {group.items.map(it => (
                    <button key={it.id}
                      onClick={() => { setMegaOpen(false); navigateToMarketing(navigate, `/fonctionnalites#${it.id}`); }}
                      style={{
                        display: 'flex', gap: 12, padding: '8px 10px',
                        borderRadius: S.r, border: 'none', background: 'transparent',
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                        transition: 'background 0.12s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = S.bgHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: S.rSm,
                        background: it.color + '14',
                        border: `1px solid ${it.color}22`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, marginTop: 2,
                      }}>
                        <it.Ic style={{ width: 14, height: 14, color: it.color }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 500, color: S.fg, margin: 0, lineHeight: 1.3 }}>
                          {it.title}
                        </p>
                        <p style={{ fontSize: 12, color: S.fgSubtle, margin: '2px 0 0', lineHeight: 1.4 }}>
                          {it.desc}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{
            background: S.bgMuted,
            padding: '16px 24px',
            borderTop: `1px solid ${S.border}`,
          }}>
            <div style={{
              maxWidth: 1200, margin: '0 auto',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 16, flexWrap: 'wrap',
            }}>
              <p style={{ fontSize: 13, color: S.fgMuted, margin: 0 }}>
                {"Découvrez toutes les fonctionnalités de FlowIA en détail."}
              </p>
              <MarketingLink to="/fonctionnalites" onClick={() => setMegaOpen(false)} style={{
                fontSize: 13, fontWeight: 500, color: S.fg,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                textDecoration: 'none',
              }}>
                Voir toutes les fonctionnalités
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </MarketingLink>
            </div>
          </div>
        </div>
      )}

      {/* Mobile menu */}
      {isMobile && mobileOpen && (
        <div style={{
          borderTop: `1px solid ${S.border}`,
          background: S.bg,
          padding: '14px 16px 20px',
          display: 'flex', flexDirection: 'column', gap: 4,
          maxHeight: 'calc(100vh - 70px)', overflowY: 'auto',
        }}>
          {navLinks.map(l => (
            <MarketingLink key={l.to} to={l.to} style={{
              fontSize: 15, fontWeight: 500,
              color: loc.pathname === l.to ? S.fg : S.fg2,
              textDecoration: 'none', padding: '12px 12px', borderRadius: S.r,
              background: loc.pathname === l.to ? S.bgHover : 'transparent',
            }}>
              {l.label}
            </MarketingLink>
          ))}
          <div style={{ height: 1, background: S.border, margin: '8px 0' }} />
          <MarketingLink to="/marketplace" style={{
            fontSize: 15, fontWeight: 500, color: S.fg,
            textDecoration: 'none', padding: '12px 14px', borderRadius: S.r,
            border: `1px solid ${S.border}`, textAlign: 'center', background: S.bg,
          }}>
            Portail client
          </MarketingLink>
          <a href={COMMERCANT_URL} style={{
            fontSize: 15, fontWeight: 500, color: S.fgInv,
            textDecoration: 'none', padding: '12px 14px', borderRadius: S.r,
            background: S.fg, textAlign: 'center', marginTop: 4,
            border: `1px solid ${S.fg}`,
          }}>
            Portail pro
          </a>
        </div>
      )}
    </header>
  );
}
