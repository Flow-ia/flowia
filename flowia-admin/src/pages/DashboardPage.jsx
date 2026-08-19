import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import { getGlobalStats, getMerchantsBySubscriptionFilter } from '../lib/admin.js';
import AppShell from '../components/AppShell.jsx';

function fmt(n)      { return Number(n || 0).toLocaleString('fr-FR'); }
function fmtMoney(n) { return Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' DA'; }
function fmtMoney0(n){ return Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' DA'; }

export default function DashboardPage() {
  const navigate = useNavigate();
  const [me, setMe]       = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  // Modale de drill-down (clic sur une card abonnement -> liste de marchands).
  const [drillModal, setDrillModal] = useState(null); // { filter, title } | null

  const openDrill = (filter, title) => setDrillModal({ filter, title });

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
    <AppShell me={me} footer="Salon DZ Admin">
      <h1 className="dash-title">{"Bienvenue " + (me?.name || '') + "."}</h1>
      <p className="dash-text">{"Vue d'ensemble Salon DZ — donnees temps reel."}</p>

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
            <ClickableStatCard label="Actifs payants"
                               value={fmt(stats.subscriptions?.active_paying)}
                               meta={stats.subscriptions?.canceling > 0
                                 ? `${fmt(stats.subscriptions.canceling)} en annulation programmée`
                                 : 'aucune annulation en attente'}
                               onClick={() => openDrill('active_paying', 'Abonnés payants actifs')}/>
            <div className="stat-card">
              <div className="stat-label">{"MRR (récurrent mensuel)"}</div>
              <div className="stat-value">{fmtMoney(stats.subscriptions?.mrr)}</div>
              <div className="stat-meta">{fmtMoney0(stats.subscriptions?.arr)} {"de ARR"}</div>
            </div>
            <ClickableStatCard label="Essais gratuits en cours"
                               value={fmt(stats.subscriptions?.trialing)}
                               meta="Essai 1 mois · sans CB"
                               onClick={() => openDrill('trialing', 'Essais gratuits en cours')}/>
            <ClickableStatCard label="Plans offerts (admin)"
                               value={fmt(stats.subscriptions?.admin_granted)}
                               meta="Gratuits superadmin"
                               onClick={() => openDrill('admin_granted', 'Plans offerts par superadmin')}/>
          </div>

          {/* Breakdown par plan + statuts */}
          <section className="card" style={{ marginTop: 16 }}>
            <h3 className="card-title" style={{ fontSize: 14 }}>{"Répartition des abonnements"}</h3>
            <div style={planBreakdownGrid}>
              <BreakdownRow label="Essentiel · mensuel"
                            count={stats.subscriptions?.essentiel_monthly}
                            mrr={(stats.subscriptions?.essentiel_monthly || 0) * 2400}
                            onClick={() => openDrill('essentiel_monthly', 'Essentiel mensuel')}/>
              <BreakdownRow label="Essentiel · annuel"
                            count={stats.subscriptions?.essentiel_yearly}
                            mrr={(stats.subscriptions?.essentiel_yearly || 0) * 2000}
                            onClick={() => openDrill('essentiel_yearly', 'Essentiel annuel')}/>
              <BreakdownRow label="Équipe · mensuel"
                            count={stats.subscriptions?.equipe_monthly}
                            mrr={(stats.subscriptions?.equipe_monthly || 0) * 4900}
                            onClick={() => openDrill('equipe_monthly', 'Équipe mensuel')}/>
              <BreakdownRow label="Équipe · annuel"
                            count={stats.subscriptions?.equipe_yearly}
                            mrr={Math.round((stats.subscriptions?.equipe_yearly || 0) * 4083)}
                            onClick={() => openDrill('equipe_yearly', 'Équipe annuel')}/>
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb',
                          display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#6b7280' }}>
              <button onClick={() => openDrill('canceled', 'Abonnements annulés définitifs')}
                      style={inlineLink}>
                <strong style={{ color: '#991b1b' }}>{fmt(stats.subscriptions?.canceled_total)}</strong>
                {" annulés définitifs"}
              </button>
              <button onClick={() => openDrill('past_due', 'Paiements en échec')}
                      style={inlineLink}>
                <strong style={{ color: '#92400e' }}>{fmt(stats.subscriptions?.past_due)}</strong>
                {" en échec de paiement"}
              </button>
              <button onClick={() => openDrill('canceling', 'Annulations programmées')}
                      style={inlineLink}>
                <strong style={{ color: '#dc2626' }}>{fmt(stats.subscriptions?.canceling)}</strong>
                {" en annulation programmée"}
              </button>
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
                {"Marge Salon DZ"}
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

      {/* Modale drill-down : liste des marchands sur le filtre clique. */}
      {drillModal && (
        <SubscriptionDrillModal
          filter={drillModal.filter}
          title={drillModal.title}
          onClose={() => setDrillModal(null)}
          onMerchantClick={(id) => {
            setDrillModal(null);
            navigate(`/merchants/${id}`);
          }}
        />
      )}
    </AppShell>
  );
}

// Card cliquable qui ouvre une modale de drill-down. Style identique a
// stat-card mais avec hover state et cursor pointer.
function ClickableStatCard({ label, value, meta, onClick }) {
  return (
    <button onClick={onClick} className="stat-card stat-card-clickable"
            style={{ textAlign: 'left', cursor: 'pointer',
                     border: '1px solid var(--border)',
                     background: 'var(--surface)',
                     fontFamily: 'inherit', width: '100%', padding: 16 }}>
      <div className="stat-label" style={{ display: 'flex', alignItems: 'center',
                                           justifyContent: 'space-between', gap: 6 }}>
        <span>{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
             style={{ flexShrink: 0, opacity: 0.5 }}>
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-meta">{meta}</div>
    </button>
  );
}

function BreakdownRow({ label, count, mrr, onClick }) {
  const isClickable = typeof onClick === 'function' && (count || 0) > 0;
  const Component = isClickable ? 'button' : 'div';
  return (
    <Component
      onClick={isClickable ? onClick : undefined}
      style={{
        ...breakdownRow,
        cursor: isClickable ? 'pointer' : 'default',
        textAlign: 'left', fontFamily: 'inherit',
        opacity: count > 0 ? 1 : 0.5,
      }}>
      <span style={{ fontSize: 13, color: 'var(--fg)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>
        {fmt(count)} {"abo"}
        <span style={{ color: 'var(--fg-muted)', fontWeight: 400, marginLeft: 8 }}>
          {fmtMoney0(mrr)}{"/mois"}
        </span>
        {isClickable && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
               style={{ marginLeft: 8, opacity: 0.5, verticalAlign: 'middle' }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
    </Component>
  );
}

// ─── Modale drill-down : liste des marchands sur un filtre ───────────────
function SubscriptionDrillModal({ filter, title, onClose, onMerchantClick }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    getMerchantsBySubscriptionFilter(filter)
      .then(d => { if (!cancelled) setRows(d?.rows || []); })
      .catch(e => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter]);

  // Click hors modale ou ESC : ferme.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalContent} onClick={e => e.stopPropagation()}>
        <div style={modalHeader}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>
              {title}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fg-muted)' }}>
              {loading ? 'Chargement…' : `${rows.length} commerçant${rows.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} style={closeBtn} aria-label="Fermer">×</button>
        </div>

        <div style={modalBody}>
          {err && <p style={{ color: 'var(--error)', fontSize: 13 }}>{err}</p>}
          {loading ? (
            <p style={{ color: 'var(--fg-muted)', fontSize: 13 }}>Chargement de la liste…</p>
          ) : rows.length === 0 ? (
            <p style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
              {"Aucun commerçant ne correspond à ce filtre."}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0,
                         display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.map(m => (
                <li key={m.id}>
                  <button onClick={() => onMerchantClick(m.id)}
                          style={merchantRowBtn}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)',
                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap' }}>
                        {m.business_name || '—'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--fg-muted)',
                                    fontFamily: 'monospace',
                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap' }}>
                        {m.email}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 500 }}>
                        {planLabel(m.subscription_plan, m.subscription_admin_grant)}
                      </span>
                      {(m.subscription_period || m.subscription_admin_grant?.period) && (
                        <span style={{ fontSize: 11, color: 'var(--fg-muted)',
                                       marginLeft: 6 }}>
                          {(m.subscription_period || m.subscription_admin_grant?.period) === 'yearly'
                            ? 'annuel' : 'mensuel'}
                        </span>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
                        {nextDateLabel(m)}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function planLabel(plan, grant) {
  const p = grant?.plan || plan;
  if (p === 'essentiel') return 'Essentiel';
  if (p === 'equipe')    return 'Équipe';
  return '—';
}
function nextDateLabel(m) {
  if (m.subscription_admin_grant) {
    const exp = m.subscription_admin_grant.expires_at;
    return exp
      ? `Bascule le ${new Date(exp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
      : 'Sans expiration';
  }
  if (m.subscription_current_period_end) {
    const action = m.subscription_cancel_at_period_end ? 'Annulation' : 'Renouvellement';
    return `${action} ${new Date(m.subscription_current_period_end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
  }
  return '—';
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
  padding: '10px 12px', borderRadius: 6,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
};
const inlineLink = {
  background: 'transparent', border: 'none', padding: 0,
  fontFamily: 'inherit', fontSize: 13, color: 'var(--fg-muted)',
  cursor: 'pointer', textAlign: 'left',
};
const modalOverlay = {
  position: 'fixed', inset: 0, zIndex: 60,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
};
const modalContent = {
  width: '100%', maxWidth: 600, maxHeight: '85vh',
  display: 'flex', flexDirection: 'column',
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 12, overflow: 'hidden',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};
const modalHeader = {
  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
  padding: '16px 20px', borderBottom: '1px solid var(--border)', gap: 12,
};
const modalBody = {
  flex: 1, overflowY: 'auto', padding: '14px 20px 20px',
};
const closeBtn = {
  width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'var(--surface-2)', color: 'var(--fg-muted)',
  fontSize: 18, lineHeight: 1, fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const merchantRowBtn = {
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12, padding: '12px 14px', borderRadius: 8,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  transition: 'border-color 0.15s, background 0.15s',
};
