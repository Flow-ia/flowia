import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getMe, logout } from '../lib/auth.js';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getMe();
        if (!cancelled) setMe(data);
      } catch {
        if (!cancelled) navigate('/login', { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  async function onLogout() {
    try { await logout(); } catch { /* noop */ }
    navigate('/login', { replace: true });
  }

  return (
    <div className="dash-wrap">
      <header className="dash-header">
        <div className="dash-brand">FlowIA Admin</div>
        <div className="dash-meta">
          <Link to="/settings" className="btn-ghost">{"Reglages"}</Link>
          {me && <span className="dash-user">{me.name}</span>}
          <button className="btn-ghost" onClick={onLogout}>{"Deconnexion"}</button>
        </div>
      </header>

      <main className="dash-main">
        {me ? (
          <>
            <h1 className="dash-title">{"Bienvenue " + me.name + "."}</h1>
            <p className="dash-text">
              {"Le panel admin est en cours de construction. Les fonctionnalites de gestion (commercants, clients, audit, dashboard global) arrivent dans les commits suivants."}
            </p>
            <ul className="dash-list">
              <li><span className="k">Email</span><span className="v">{me.email}</span></li>
              <li><span className="k">{"Role"}</span><span className="v">{me.role}</span></li>
              <li><span className="k">{"Derniere connexion"}</span><span className="v">{me.last_login_at ? new Date(me.last_login_at).toLocaleString('fr-FR') : "—"}</span></li>
            </ul>
          </>
        ) : (
          <div className="splash">{error || "Chargement..."}</div>
        )}
      </main>

      <footer className="dash-footer">{"v1.0.0 — Commit #1"}</footer>
    </div>
  );
}
