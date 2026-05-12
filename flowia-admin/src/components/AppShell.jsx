import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../lib/auth.js';
import { getTheme, toggleTheme } from '../lib/theme.js';

export default function AppShell({ me, children, footer }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [theme, setTheme] = useState(getTheme());

  // Refermer les drawers a chaque changement de route
  useEffect(() => {
    setNavOpen(false);
    setActionsOpen(false);
  }, [location.pathname]);

  // ESC ferme le drawer actions
  useEffect(() => {
    if (!actionsOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setActionsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actionsOpen]);

  async function onLogout() {
    setActionsOpen(false);
    try { await logout(); } catch { /* noop */ }
    navigate('/login', { replace: true });
  }

  function isActive(path) {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  }

  function onToggleTheme() {
    setTheme(toggleTheme());
  }

  return (
    <div className="dash-wrap">
      <header className="dash-header">
        <div className="dash-brand">{"FlowIA Admin"}</div>

        <nav className={"dash-nav " + (navOpen ? 'open' : '')}>
          <Link to="/dashboard"  className={"nav-link " + (isActive('/dashboard')  ? 'nav-link-active' : '')}>{"Dashboard"}</Link>
          <Link to="/merchants"  className={"nav-link " + (isActive('/merchants')  ? 'nav-link-active' : '')}>{"Commercants"}</Link>
          <Link to="/clients"    className={"nav-link " + (isActive('/clients')    ? 'nav-link-active' : '')}>{"Clients"}</Link>
          <Link to="/search"     className={"nav-link " + (isActive('/search')     ? 'nav-link-active' : '')}>{"Recherche"}</Link>
          <Link to="/audit"      className={"nav-link " + (isActive('/audit')      ? 'nav-link-active' : '')}>{"Audit"}</Link>
          <Link to="/legacy-multi" className={"nav-link " + (isActive('/legacy-multi') ? 'nav-link-active' : '')}>{"Multi legacy"}</Link>
          <Link to="/settings"   className={"nav-link " + (isActive('/settings')   ? 'nav-link-active' : '')}>{"Reglages"}</Link>
        </nav>

        <div className="dash-meta">
          <button
            className="user-menu-toggle"
            onClick={() => setActionsOpen((o) => !o)}
            aria-label={actionsOpen ? 'Fermer le menu' : 'Ouvrir le menu utilisateur'}
            aria-expanded={actionsOpen}
            aria-controls="action-drawer"
            title={me?.name || 'Menu'}
          >
            <UserIcon />
            {me?.name && <span className="user-menu-name">{me.name}</span>}
          </button>
          <button
            className="nav-toggle"
            onClick={() => setNavOpen((o) => !o)}
            aria-label={navOpen ? 'Fermer la navigation' : 'Ouvrir la navigation'}
            aria-expanded={navOpen}
          >
            {navOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </header>

      {/* Drawer lateral actions utilisateur (theme + logout) */}
      <div
        className={"action-drawer-overlay " + (actionsOpen ? 'open' : '')}
        onClick={() => setActionsOpen(false)}
        aria-hidden={!actionsOpen}
      />
      <aside
        id="action-drawer"
        className={"action-drawer " + (actionsOpen ? 'open' : '')}
        role="dialog"
        aria-modal="true"
        aria-label="Menu utilisateur"
      >
        <div className="action-drawer-head">
          <div className="action-drawer-title">{me?.name || 'Compte'}</div>
          {me?.email && <div className="action-drawer-subtitle">{me.email}</div>}
          <button
            className="action-drawer-close"
            onClick={() => setActionsOpen(false)}
            aria-label="Fermer le menu"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="action-drawer-list">
          <button className="action-drawer-item" onClick={onToggleTheme}>
            <span className="action-drawer-item-icon">
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </span>
            <span className="action-drawer-item-label">
              {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            </span>
          </button>

          <div className="action-drawer-sep" role="separator" />

          <button className="action-drawer-item action-drawer-item-danger" onClick={onLogout}>
            <span className="action-drawer-item-icon"><LogoutIcon /></span>
            <span className="action-drawer-item-label">{"Deconnexion"}</span>
          </button>
        </div>
      </aside>

      <main className="dash-main">{children}</main>

      <footer className="dash-footer">{footer || 'FlowIA Admin'}</footer>
    </div>
  );
}

// ── Icones SVG inline (evite ajout dependance, FDS-2026 sans emoji) ─────────

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M3 12h18M3 18h18"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}
