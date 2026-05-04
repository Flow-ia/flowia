import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import { getGlobalStats } from '../lib/admin.js';
import AppShell from '../components/AppShell.jsx';

function fmt(n)      { return Number(n || 0).toLocaleString('fr-FR'); }
function fmtMoney(n) { return Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function fmtMoney0(n){ return Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'; }

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
              <div className="stat-label">{"CA RDV (transactions)"}</div>
              <div className="stat-value">{fmtMoney(stats.revenue.total)}</div>
              <div className="stat-meta">
                {fmtMoney(stats.revenue.today)} {"auj."} · {fmtMoney(stats.revenue.this_month)} {"30j"}
              </div>
            </div>
          </div>

          {/* ── Abonnements plateforme FlowIA ──────────────────────────── */}
          <h2 className="section-title" style={sectionTitle}>{"Abonnements plateforme"}</h2>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">{"Actifs payants"}</div>
              <div className="stat-value">{fmt(stats.subscriptions?.active_paying)}</div>
              <div className="stat-meta">
                {stats.subscriptions?.canceling > 0
                  ? `${fmt(stats.subscriptions.canceling)} en annulation programmée`
                  : 'aucune annulation en attente'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{"MRR (récurrent mensuel)"}</div>
              <div className="stat-value">{fmtMoney(stats.subscriptions?.mrr)}</div>
              <div className="stat-meta">{fmtMoney0(stats.subscriptions?.arr)} {"de ARR"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{"Essais gratuits en cours"}</div>
              <div className="stat-value">{fmt(stats.subscriptions?.trialing)}</div>
              <div className="stat-meta">{"Essai 14 jours · sans CB"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{"Plans offerts (admin)"}</div>
              <div className="stat-value">{fmt(stats.subscriptions?.admin_granted)}</div>
              <div className="stat-meta">{"Gratuits superadmin"}</div>
            </div>
          </div>

          {/* Breakdown par plan + statuts */}
          <section className="card" style={{ marginTop: 16 }}>
            <h3 className="card-title" style={{ fontSize: 14 }}>{"Répartition des abonnements"}</h3>
            <div style={planBreakdownGrid}>
              <BreakdownRow label="Essentiel · mensuel"
                            count={stats.subscriptions?.essentiel_monthly}
                            mrr={(stats.subscriptions?.essentiel_monthly || 0) * 24}/>
              <BreakdownRow label="Essentiel · annuel"
                            count={stats.subscriptions?.essentiel_yearly}
                            mrr={(stats.subscriptions?.essentiel_yearly || 0) * 20}/>
              <BreakdownRow label="Équipe · mensuel"
                            count={stats.subscriptions?.equipe_monthly}
                            mrr={(stats.subscriptions?.equipe_monthly || 0) * 49}/>
              <BreakdownRow label="Équipe · annuel"
                            count={stats.subscriptions?.equipe_yearly}
                            mrr={Math.round((stats.subscriptions?.equipe_yearly || 0) * 40.83)}/>
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb',
                          display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#6b7280' }}>
              <span><strong style={{ color: '#991b1b' }}>{fmt(stats.subscriptions?.canceled_total)}</strong>{" annulés définitifs"}</span>
              <span><strong style={{ color: '#92400e' }}>{fmt(stats.subscriptions?.past_due)}</strong>{" en échec de paiement"}</span>
              <span><strong style={{ color: '#1e40af' }}>{fmt(stats.subscriptions?.acquired_60d)}</strong>{" acquis sur 60j"}</span>
            </div>
          </section>

          {/* ── SMS (recharges + consommation + marge) ─────────────────── */}
          <h2 className="section-title" style={sectionTitle}>{"SMS marchands"}</h2>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">{"CA brut SMS"}</div>
              <div className="stat-value">{fmtMoney(stats.sms?.gross_total)}</div>
              <div className="stat-meta">
                {fmtMoney(stats.sms?.gross_30d)} {"sur 30j"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">
                {"Marge FlowIA"}
                {stats.sms?.margin_ratio_pct != null && (
                  <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>
                    {"(" + stats.sms.margin_ratio_pct + "%)"}
                  </span>
                )}
              </div>
              <div className="stat-value" style={{ color: '#10b981' }}>
                {fmtMoney(stats.sms?.margin_total)}
              </div>
              <div className="stat-meta">
                {fmtMoney(stats.sms?.margin_30d)} {"sur 30j"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{"SMS consommés"}</div>
              <div className="stat-value">{fmtMoney(stats.sms?.consumed_total)}</div>
              <div className="stat-meta">
                {fmt(stats.sms?.sms_consumed)} {"SMS envoyés"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{"Solde restant marchands"}</div>
              <div className="stat-value" style={{ color: '#92400e' }}>
                {fmtMoney(stats.sms?.unused_total)}
              </div>
              <div className="stat-meta">
                {fmt(stats.sms?.sms_unused)} {"SMS encore disponibles"}
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

function BreakdownRow({ label, count, mrr }) {
  return (
    <div style={breakdownRow}>
      <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>
        {fmt(count)} {"abo"}
        <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>
          {fmtMoney0(mrr)}{"/mois"}
        </span>
      </span>
    </div>
  );
}

const sectionTitle = {
  fontSize: 14, fontWeight: 600, color: '#111827',
  margin: '28px 0 12px', textTransform: 'uppercase', letterSpacing: 0.5,
};
const planBreakdownGrid = {
  display: 'grid', gap: 6, marginTop: 8,
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
};
const breakdownRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '8px 12px', borderRadius: 6,
  background: '#f9f9fb', border: '1px solid #e5e7eb',
};
