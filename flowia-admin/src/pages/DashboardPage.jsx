import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import AppShell from '../components/AppShell.jsx';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);

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

  return (
    <AppShell me={me} footer="FlowIA Admin">
      {me ? (
        <>
          <h1 className="dash-title">{"Bienvenue " + me.name + "."}</h1>
          <p className="dash-text">
            {"Le panel admin couvre la gestion des commercants, le blocage de clients globaux, les statistiques et l'audit."}
          </p>

          <div className="card-grid">
            <Link to="/merchants" className="card card-link">
              <div className="card-link-title">{"Commercants"}</div>
              <div className="card-link-sub">{"Lister, geler, modifier"}</div>
            </Link>
            <Link to="/clients" className="card card-link">
              <div className="card-link-title">{"Clients"}</div>
              <div className="card-link-sub">{"Bloquer, supprimer cross-merchant"}</div>
            </Link>
            <Link to="/audit" className="card card-link">
              <div className="card-link-title">{"Audit log"}</div>
              <div className="card-link-sub">{"Historique des actions admin"}</div>
            </Link>
            <Link to="/settings" className="card card-link">
              <div className="card-link-title">{"Reglages compte"}</div>
              <div className="card-link-sub">{"2FA, mot de passe"}</div>
            </Link>
          </div>
        </>
      ) : (
        <div className="splash">{"Chargement..."}</div>
      )}
    </AppShell>
  );
}
