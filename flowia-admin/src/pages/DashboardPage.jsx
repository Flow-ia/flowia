import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import { getGlobalStats } from '../lib/admin.js';
import AppShell from '../components/AppShell.jsx';

function fmt(n)      { return Number(n || 0).toLocaleString('fr-FR'); }
function fmtMoney(n) { return Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }

export default function DashboardPage() {
  const navigate = useNavigate();
  const [me, setMe]       = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meData, statsData] = await Promise.all([getMe(), getGlobalStats()]);
        if (cancelled) return;
        setMe(meData);
        setStats(statsData);
      } catch (err) {
        if (cancelled) return;
        if (err && err.status && (err.status === 401 || err.status === 404)) {
          navigate('/login', { replace: true });
        } else {
          setError(err && err.message ? err.message : 'Erreur de chargement.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <AppShell me={me} footer="FlowIA Admin">
      <h1 className="dash-title">{"Bienvenue " + (me?.name || '') + "."}</h1>
      <p className="dash-text">{"Vue d'ensemble FlowIA — donnees temps reel."}</p>

      {error && <div className="login-error">{error}</div>}

      {!stats ? (
        <div className="splash">{"Chargement des stats..."}</div>
      ) : (
        <>
          <div className="stat-grid">
            <Link to="/merchants?status=all" className="stat-card">
              <div className="stat-label">{"Commercants"}</div>
              <div className="stat-value">{fmt(stats.merchants.total)}</div>
              <div className="stat-meta">
                {fmt(stats.merchants.active)} {"actifs"}
                {stats.merchants.frozen > 0 && <> · <span style={{ color: 'var(--error)' }}>{fmt(stats.merchants.frozen)} {"geles"}</span></>}
              </div>
            </Link>

            <Link to="/clients?status=all" className="stat-card">
              <div className="stat-label">{"Clients globaux"}</div>
              <div className="stat-value">{fmt(stats.clients.total)}</div>
              <div className="stat-meta">
                {fmt(stats.clients.active)} {"actifs"}
                {stats.clients.blocked > 0 && <> · <span style={{ color: 'var(--error)' }}>{fmt(stats.clients.blocked)} {"bloques"}</span></>}
              </div>
            </Link>

            <div className="stat-card">
              <div className="stat-label">{"RDV total"}</div>
              <div className="stat-value">{fmt(stats.appointments.total)}</div>
              <div className="stat-meta">
                {fmt(stats.appointments.today)} {"aujourd'hui"} · {fmt(stats.appointments.this_week)} {"7j"}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">{"CA total"}</div>
              <div className="stat-value">{fmtMoney(stats.revenue.total)}</div>
              <div className="stat-meta">
                {fmtMoney(stats.revenue.today)} {"auj."} · {fmtMoney(stats.revenue.this_month)} {"30j"}
              </div>
            </div>
          </div>

          <section className="card" style={{ marginTop: 24 }}>
            <h2 className="card-title">{"Top 10 commercants — 30 derniers jours"}</h2>
            {stats.top_merchants.length === 0 ? (
              <p className="card-sub">{"Aucune transaction sur la periode."}</p>
            ) : (
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{"Commerce"}</th>
                      <th>{"Statut"}</th>
                      <th>{"Transactions"}</th>
                      <th>{"CA 30j"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_merchants.map((m, i) => (
                      <tr key={m.id} className="row-link" onClick={() => navigate(`/merchants/${m.id}`)}>
                        <td className="mono">{i + 1}</td>
                        <td>
                          <div className="cell-primary">{m.business_name || '—'}</div>
                          <div className="cell-secondary mono">{m.email}</div>
                        </td>
                        <td>
                          {m.is_frozen
                            ? <span className="badge badge-frozen">{"Gele"}</span>
                            : <span className="badge badge-on">{"Actif"}</span>}
                        </td>
                        <td>{fmt(m.transactions_count)}</td>
                        <td className="mono">{fmtMoney(m.revenue_month)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="dash-footer-meta">
            {"Genere le " + new Date(stats.generated_at).toLocaleString('fr-FR')}
          </p>
        </>
      )}
    </AppShell>
  );
}
