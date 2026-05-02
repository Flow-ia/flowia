import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../../hooks/useTheme';
import { I } from '../../../utils/icons';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

// Liste centrale — réutilisée dans Features.jsx (chaque entry a un anchor #id
// qui doit exister dans Features.jsx pour que la nav scrolle au bon endroit).
// Chaque groupe a un `slug` pour la nav rapide groupée (4 pills au lieu de 17).
export const FEATURE_GROUPS = [
  {
    slug: 'ia', label: 'Intelligence artificielle', short: 'IA',
    Ic: I.Sparkles, color: '#8b5cf6',
    items: [
      { id: 'ia',                 Ic: I.Sparkles, color: '#8b5cf6', title: 'Marketing IA',           desc: "Campagnes générées et ciblées automatiquement." },
      { id: 'previsions',         Ic: I.TrendUp,  color: '#06b6d4', title: 'Prévisions IA',          desc: "Anticipez votre activité et vos creux." },
    ],
  },
  {
    slug: 'reservation', label: 'Réservation & site', short: 'Réservation',
    Ic: I.Calendar, color: '#6366f1',
    items: [
      { id: 'reservation',        Ic: I.Calendar, color: '#6366f1', title: 'Site de réservation',    desc: "Page publique 100 % personnalisable." },
      { id: 'annonce',            Ic: I.Bell,     color: '#f59e0b', title: 'Annonce gratuite',       desc: "Bandeau d'info en haut de votre site." },
      { id: 'tarifs',             Ic: I.Tag,      color: '#10b981', title: 'Tarifs & catégories',    desc: "Personnalisez vos prestations et prix." },
      { id: 'employes',           Ic: I.Users,    color: '#06b6d4', title: 'Employés & permissions', desc: "Gérez votre équipe et leurs droits." },
    ],
  },
  {
    slug: 'marketing', label: 'Marketing & relation client', short: 'Marketing',
    Ic: I.Send, color: '#f59e0b',
    items: [
      { id: 'sms',                Ic: I.Send,     color: '#f59e0b', title: 'Marketing SMS',          desc: "Campagnes SMS ciblées et rappels auto." },
      { id: 'email',              Ic: I.Mail,     color: '#6366f1', title: 'Marketing email',        desc: "Campagnes email transactionnelles." },
      { id: 'fidelite',           Ic: I.Heart,    color: '#ef4444', title: 'Fidélité',               desc: "Programme de points et récompenses." },
      { id: 'parrainage',         Ic: I.Gift,     color: '#10b981', title: 'Parrainage',             desc: "Récompensez parrains et filleuls." },
      { id: 'anniversaire',       Ic: I.Star,     color: '#f59e0b', title: 'Anniversaires',          desc: "Campagnes anniversaire automatiques." },
      { id: 'rappels',            Ic: I.Clock,    color: '#06b6d4', title: 'Rappels automatiques',   desc: "SMS de rappel 24h avant le RDV." },
    ],
  },
  {
    slug: 'caisse', label: 'Caisse & gestion', short: 'Caisse',
    Ic: I.Wallet, color: '#10b981',
    items: [
      { id: 'caisse',             Ic: I.Wallet,    color: '#10b981', title: 'Caisse intégrée',        desc: "Encaissez en quelques secondes." },
      { id: 'clients',            Ic: I.User,      color: '#6366f1', title: 'Fichier clients',        desc: "Historique, fiches, segmentation." },
      { id: 'credits',            Ic: I.CreditCard, color: '#f59e0b', title: 'Crédits & avoirs',      desc: "Suivi des dettes et avoirs clients." },
      { id: 'exports',            Ic: I.FileText,  color: '#6366f1', title: 'Exports comptables',     desc: "Export CSV/PDF mensuel automatique." },
      { id: 'statistiques',       Ic: I.BarCh,     color: '#06b6d4', title: 'Statistiques',           desc: "Tableau de bord et reporting détaillé." },
    ],
  },
];

export default function Header() {
  const { theme: t } = useTheme();
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
    fontSize: 14, fontWeight: 500, color: active ? t.text : t.muted,
    textDecoration: 'none', padding: '8px 12px', borderRadius: 8,
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
          <nav style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center', position: 'relative' }}>
            {navLinks.map(l => l.mega ? (
              <div key={l.to}
                onMouseEnter={openMega}
                onMouseLeave={scheduleCloseMega}
                style={{ position: 'relative' }}>
                <Link to={l.to} style={linkStyle(loc.pathname === l.to || megaOpen)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = t.cardAlt; e.currentTarget.style.color = t.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = (loc.pathname === l.to || megaOpen) ? t.text : t.muted; }}>
                  {l.label}
                  <I.ChevR style={{
                    width: 12, height: 12, marginLeft: 2,
                    transform: megaOpen ? 'rotate(90deg)' : 'rotate(90deg)',
                    transition: 'transform 0.15s ease',
                    opacity: 0.7,
                  }} />
                </Link>
              </div>
            ) : (
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

      {/* Mega-menu desktop */}
      {!isMobile && megaOpen && (
        <div onMouseEnter={openMega} onMouseLeave={scheduleCloseMega}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: t.canvas,
            borderTop: `0.5px solid ${t.border}`,
            borderBottom: `0.5px solid ${t.border}`,
            boxShadow: t.shadowLg,
            zIndex: 49,
          }}>
          <div style={{
            maxWidth: 1200, margin: '0 auto', padding: '28px 24px',
            display: 'grid', gap: 28,
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          }}>
            {FEATURE_GROUPS.map(group => (
              <div key={group.label}>
                <p style={{
                  fontSize: 11, fontWeight: 500, color: t.muted,
                  textTransform: 'uppercase', letterSpacing: 0.6,
                  margin: 0, marginBottom: 12,
                }}>
                  {group.label}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {group.items.map(it => (
                    <button key={it.id}
                      onClick={() => { setMegaOpen(false); navigate(`/fonctionnalites#${it.id}`); }}
                      style={{
                        display: 'flex', gap: 12, padding: '8px 10px',
                        borderRadius: 8, border: 'none', background: 'transparent',
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                        transition: 'background 0.12s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = t.cardAlt; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: it.color + '15',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, marginTop: 2,
                      }}>
                        <it.Ic style={{ width: 14, height: 14, color: it.color }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 500, color: t.text, margin: 0, lineHeight: 1.3 }}>
                          {it.title}
                        </p>
                        <p style={{ fontSize: 12, color: t.muted, margin: '2px 0 0', lineHeight: 1.4 }}>
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
            background: t.cardAlt,
            padding: '14px 24px',
            borderTop: `0.5px solid ${t.border}`,
          }}>
            <div style={{
              maxWidth: 1200, margin: '0 auto',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 16, flexWrap: 'wrap',
            }}>
              <p style={{ fontSize: 13, color: t.textSub, margin: 0 }}>
                {"Découvrez toutes les fonctionnalités de FlowIA en détail."}
              </p>
              <Link to="/fonctionnalites" onClick={() => setMegaOpen(false)} style={{
                fontSize: 13, fontWeight: 500, color: t.text,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                textDecoration: 'none',
              }}>
                Voir toutes les fonctionnalités <I.ChevR style={{ width: 12, height: 12 }} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Mobile menu */}
      {isMobile && mobileOpen && (
        <div style={{
          borderTop: `0.5px solid ${t.border}`,
          background: t.canvas,
          padding: '12px 16px 18px',
          display: 'flex', flexDirection: 'column', gap: 4,
          maxHeight: 'calc(100vh - 70px)', overflowY: 'auto',
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
