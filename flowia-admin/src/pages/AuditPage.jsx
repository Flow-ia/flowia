import { Fragment, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import { listAudit, listAuditActions } from '../lib/admin.js';
import AppShell from '../components/AppShell.jsx';

const PAGE_SIZE = 100;

function formatRelative(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)    return 'a l\'instant';
  if (min < 60)   return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)     return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 30)  return `il y a ${days} j`;
  return d.toLocaleDateString('fr-FR');
}

export default function AuditPage() {
  const navigate = useNavigate();
  const [me, setMe]                 = useState(null);
  const [data, setData]             = useState({ rows: [], total: 0 });
  const [actions, setActions]       = useState([]);
  const [filterAction, setAction]   = useState('');
  const [filterStatus, setStatus]   = useState('');
  const [search, setSearch]         = useState('');
  const [offset, setOffset]         = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(null);

  useEffect(() => { getMe().then(setMe).catch(() => navigate('/login', { replace: true })); }, [navigate]);
  useEffect(() => { listAuditActions().then(d => setActions(d.actions || [])).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await listAudit({
        action: filterAction, status: filterStatus, search,
        limit: PAGE_SIZE, offset,
      });
      setData(d);
    } catch (err) {
      setError(err && err.message ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterStatus, search, offset]);

  useEffect(() => { load(); }, [load]);

  function onSearchSubmit(e) { e.preventDefault(); setOffset(0); load(); }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <AppShell me={me} footer="FlowIA Admin — Audit log">
      <div className="page-head">
        <h1 className="dash-title">{"Audit log"}</h1>
        <span className="page-count">{data.total} {"entrees"}</span>
      </div>

      <p className="page-sub" style={{ marginBottom: 16 }}>
        {"Trace immuable de toutes les actions admin. Aucune entree ne peut etre modifiee ou supprimee. Les details payload (avant/apres) sont visibles en cliquant sur une ligne."}
      </p>

      <form className="filters" onSubmit={onSearchSubmit}>
        <input type="text" placeholder={"Recherche (email admin, IP, message d'erreur)"} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={filterAction} onChange={(e) => { setAction(e.target.value); setOffset(0); }}>
          <option value="">{"Toutes actions"}</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
          <option value="">{"Tous statuts"}</option>
          <option value="success">{"Succes"}</option>
          <option value="failure">{"Echec"}</option>
        </select>
        <button type="submit" className="btn-ghost">{"Filtrer"}</button>
      </form>

      {error && <div className="login-error">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{"Date"}</th>
              <th>{"Admin"}</th>
              <th>{"Action"}</th>
              <th>{"Cible"}</th>
              <th>{"Statut"}</th>
              <th>{"Details"}</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="td-loading">{"Chargement..."}</td></tr>}
            {!loading && data.rows.length === 0 && <tr><td colSpan={7} className="td-loading">{"Aucune entree."}</td></tr>}
            {!loading && data.rows.map(r => (
              <Fragment key={r.id}>
                <tr onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="row-link">
                  <td className="mono" title={r.created_at}>{formatRelative(r.created_at)}</td>
                  <td className="mono">{r.admin_email || '—'}</td>
                  <td className="mono">{r.action}</td>
                  <td>
                    {r.target_type && <span className="cell-secondary">{r.target_type}</span>}
                    {r.target_id   && <div className="mono" style={{ fontSize: 10 }}>{r.target_id.slice(0, 8)}…</div>}
                  </td>
                  <td>
                    {r.status === 'failure'
                      ? <span className="badge badge-frozen">{"Echec"}</span>
                      : <span className="badge badge-on">{"OK"}</span>}
                  </td>
                  <td className="cell-secondary">{r.error_message || '—'}</td>
                  <td className="mono">{r.ip_address || '—'}</td>
                </tr>
                {expanded === r.id && (
                  <tr>
                    <td colSpan={7} style={{ background: 'var(--bg)', padding: '16px 24px' }}>
                      <div className="audit-details">
                        <div><strong>{"Date complete"} :</strong> <span className="mono">{new Date(r.created_at).toLocaleString('fr-FR')}</span></div>
                        <div><strong>{"User-Agent"} :</strong> <span className="mono">{r.user_agent || '—'}</span></div>
                        {r.payload_before && (
                          <div><strong>{"Payload avant"} :</strong>
                            <pre className="audit-pre">{JSON.stringify(r.payload_before, null, 2)}</pre>
                          </div>
                        )}
                        {r.payload_after && (
                          <div><strong>{"Payload apres"} :</strong>
                            <pre className="audit-pre">{JSON.stringify(r.payload_after, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pager">
          <button className="btn-ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>{"Precedent"}</button>
          <span className="page-info">{currentPage} / {totalPages}</span>
          <button className="btn-ghost" disabled={offset + PAGE_SIZE >= data.total} onClick={() => setOffset(offset + PAGE_SIZE)}>{"Suivant"}</button>
        </div>
      )}
    </AppShell>
  );
}
