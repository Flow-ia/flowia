import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import { listClients } from '../lib/admin.js';
import AppShell from '../components/AppShell.jsx';

const PAGE_SIZE = 50;

export default function ClientsListPage() {
  const navigate = useNavigate();
  const [me, setMe]           = useState(null);
  const [data, setData]       = useState({ rows: [], total: 0 });
  const [search, setSearch]   = useState('');
  const [status, setStatus]   = useState('all');
  const [offset, setOffset]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => { getMe().then(setMe).catch(() => navigate('/login', { replace: true })); }, [navigate]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await listClients({ search, status, limit: PAGE_SIZE, offset });
      setData(d);
    } catch (err) {
      setError(err && err.message ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [search, status, offset]);

  useEffect(() => { load(); }, [load]);

  function onSearchSubmit(e) { e.preventDefault(); setOffset(0); load(); }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <AppShell me={me} footer="Salon DZ Admin — Clients">
      <div className="page-head">
        <h1 className="dash-title">{"Clients globaux"}</h1>
        <span className="page-count">{data.total} {"resultats"}</span>
      </div>

      <p className="page-sub" style={{ marginBottom: '16px' }}>
        {"Identites cross-merchant (table global_clients). Un blocage refuse la connexion sur tous les salons Salon DZ."}
      </p>

      <form className="filters" onSubmit={onSearchSubmit}>
        <input type="text" placeholder={"Rechercher (email, nom, telephone)"} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
          <option value="all">{"Tous"}</option>
          <option value="active">{"Actifs"}</option>
          <option value="blocked">{"Bloques"}</option>
        </select>
        <button type="submit" className="btn-ghost">{"Filtrer"}</button>
      </form>

      {error && <div className="login-error">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{"Nom"}</th>
              <th>Email</th>
              <th>{"Telephone"}</th>
              <th>{"Statut"}</th>
              <th>{"Salons"}</th>
              <th>{"RDV"}</th>
              <th>{"Cree le"}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="td-loading">{"Chargement..."}</td></tr>}
            {!loading && data.rows.length === 0 && <tr><td colSpan={7} className="td-loading">{"Aucun resultat."}</td></tr>}
            {!loading && data.rows.map(c => (
              <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="row-link">
                <td>
                  <div className="cell-primary">{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</div>
                </td>
                <td className="mono">{c.email || '—'}</td>
                <td className="mono">{c.phone || '—'}</td>
                <td>
                  {c.is_blocked
                    ? <span className="badge badge-frozen">{"Bloque"}</span>
                    : <span className="badge badge-on">{"Actif"}</span>}
                </td>
                <td>{c.merchants_count}</td>
                <td>{c.appointments_count}</td>
                <td className="mono">{c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '—'}</td>
              </tr>
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
