import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../lib/auth.js';
import { getTheme, toggleTheme } from '../lib/theme.js';

export default function AppShell({ me, children, footer }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState(getTheme());

  // Refermer le drawer mobile a chaque changement de route
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  async function onLogout() {
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
          <Link to="/audit"      className={"nav-link " + (isActive('/audit')      ? 'nav-link-active' : '')}>{"Audit"}</Link>
          <Link to="/settings"   className={"nav-link " + (isActive('/settings')   ? 'nav-link-active' : '')}>{"Reglages"}</Link>
        </nav>

        <div className="dash-meta">
          {me && <span className="dash-user">{me.name}</span>}
          <button
            className="theme-toggle"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="btn-ghost" onClick={onLogout}>{"Deconnexion"}</button>
          <button
            className="nav-toggle"
            onClick={() => setNavOpen((o) => !o)}
            aria-label={navOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={navOpen}
          >
            {navOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </header>

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
