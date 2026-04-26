import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../lib/auth.js';

export default function AppShell({ me, children, footer }) {
  const navigate = useNavigate();
  const location = useLocation();

  async function onLogout() {
    try { await logout(); } catch { /* noop */ }
    navigate('/login', { replace: true });
  }

  function isActive(path) {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  }

  return (
    <div className="dash-wrap">
      <header className="dash-header">
        <div className="dash-brand">FlowIA Admin</div>
        <nav className="dash-nav">
          <Link to="/dashboard"  className={"nav-link " + (isActive('/dashboard')  ? 'nav-link-active' : '')}>{"Dashboard"}</Link>
          <Link to="/merchants"  className={"nav-link " + (isActive('/merchants')  ? 'nav-link-active' : '')}>{"Commercants"}</Link>
          <Link to="/clients"    className={"nav-link " + (isActive('/clients')    ? 'nav-link-active' : '')}>{"Clients"}</Link>
          <Link to="/audit"      className={"nav-link " + (isActive('/audit')      ? 'nav-link-active' : '')}>{"Audit"}</Link>
          <Link to="/settings"   className={"nav-link " + (isActive('/settings')   ? 'nav-link-active' : '')}>{"Reglages"}</Link>
        </nav>
        <div className="dash-meta">
          {me && <span className="dash-user">{me.name}</span>}
          <button className="btn-ghost" onClick={onLogout}>{"Deconnexion"}</button>
        </div>
      </header>

      <main className="dash-main">{children}</main>

      <footer className="dash-footer">{footer || 'FlowIA Admin'}</footer>
    </div>
  );
}
