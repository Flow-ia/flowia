import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../lib/auth.js';
import { getTheme, toggleTheme } from '../lib/theme.js';

export default function AppShell({ me, children, footer }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(getTheme());
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  // Refermer les menus a chaque changement de route
  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  // ESC + click-outside pour fermer le dropdown
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKey(e) { if (e.key === 'Escape') setMenuOpen(false); }
    function onPointer(e) {
      if (!menuRef.current || !triggerRef.current) return;
      if (menuRef.current.contains(e.target)) return;
      if (triggerRef.current.contains(e.target)) return;
      setMenuOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('touchstart', onPointer, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('touchstart', onPointer);
    };
  }, [menuOpen]);

  async function onLogout() {
    setMenuOpen(false);
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

  const initials = (me?.name || me?.email || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(s => s[0]).join('').toUpperCase() || '?';

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
          <Link to="/maintenance" className={"nav-link " + (isActive('/maintenance') ? 'nav-link-active' : '')}>{"Maintenance"}</Link>
          <Link to="/settings"   className={"nav-link " + (isActive('/settings')   ? 'nav-link-active' : '')}>{"Reglages"}</Link>
        </nav>

        <div className="dash-meta">
          <div className="user-menu-wrap">
            <button
              ref={triggerRef}
              type="button"
              className={"user-menu-trigger " + (menuOpen ? 'open' : '')}
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls="user-menu"
              title={me?.name || me?.email || 'Compte'}
            >
              <span className="user-menu-avatar" aria-hidden="true">{initials}</span>
              <span className="user-menu-label">{me?.name || me?.email || 'Compte'}</span>
              <span className="user-menu-caret" aria-hidden="true"><CaretIcon /></span>
            </button>

            <div
              ref={menuRef}
              id="user-menu"
              role="menu"
              className={"user-menu-popover " + (menuOpen ? 'open' : '')}
              aria-hidden={!menuOpen}
            >
              <div className="user-menu-head">
                <div className="user-menu-head-name">{me?.name || 'Compte'}</div>
                {me?.email && <div className="user-menu-head-email">{me.email}</div>}
              </div>
              <div className="user-menu-list">
                <button role="menuitem" type="button" className="user-menu-item" onClick={onToggleTheme}>
                  <span className="user-menu-item-icon">
                    {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                  </span>
                  <span className="user-menu-item-label">
                    {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
                  </span>
                  <span className="user-menu-item-meta">{theme === 'dark' ? 'Sombre' : 'Clair'}</span>
                </button>
              </div>
              <div className="user-menu-sep" role="separator" />
              <div className="user-menu-list">
                <button role="menuitem" type="button" className="user-menu-item user-menu-item-danger" onClick={onLogout}>
                  <span className="user-menu-item-icon"><LogoutIcon /></span>
                  <span className="user-menu-item-label">{"Deconnexion"}</span>
                </button>
              </div>
            </div>
          </div>

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

function CaretIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
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
