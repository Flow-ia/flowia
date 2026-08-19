import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import { listMerchants } from '../lib/admin.js';
import AppShell from '../components/AppShell.jsx';
import MerchantGdprDeleteSection from './MerchantGdprDeleteSection.jsx';

const PAGE_SIZE = 50;

export default function MerchantsListPage() {
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
    setLoading(true);
    setError('');
    try {
      const d = await listMerchants({ search, status, limit: PAGE_SIZE, offset });
      setData(d);
    } catch (err) {
      setError(err && err.message ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [search, status, offset]);

  useEffect(() => { load(); }, [load]);

  function onSearchSubmit(e) {
    e.preventDefault();
    setOffset(0);
    load();
  }

  function removeDeletedMerchant(deletedId, result) {
    if (result?.scheduled) {
      setData(prev => ({
        ...prev,
        rows: prev.rows.map(row => row.id === deletedId
          ? {
              ...row,
              is_frozen: true,
              deletion_requested_at: result.retention?.requested_at || new Date().toISOString(),
            }
          : row),
      }));
      return;
    }
    setData(prev => ({
      ...prev,
      total: Math.max(0, (prev.total || 0) - 1),
      rows: prev.rows.filter(row => row.id !== deletedId),
    }));
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <AppShell me={me} footer="Salon DZ Admin - Commercants">
      <div className="page-head">
        <h1 className="dash-title">{"Commercants"}</h1>
        <span className="page-count">{data.total} {"resultats"}</span>
      </div>

      <form className="filters" onSubmit={onSearchSubmit}>
        <input
          type="text"
          placeholder={"Rechercher (nom, email, prenom)"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
          <option value="all">{"Tous"}</option>
          <option value="active">{"Actifs"}</option>
          <option value="frozen">{"Geles"}</option>
          <option value="deletion">{"Suppression programmee"}</option>
        </select>
        <button type="submit" className="btn-ghost">{"Filtrer"}</button>
      </form>

      {error && <div className="login-error">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{"Commerce"}</th>
              <th>Email</th>
              <th>{"Ville"}</th>
              <th>{"Statut"}</th>
              <th>{"Clients"}</th>
              <th>{"RDV"}</th>
              <th>{"Cree le"}</th>
              <th>{"Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="td-loading">{"Chargement..."}</td></tr>}
            {!loading && data.rows.length === 0 && <tr><td colSpan={8} className="td-loading">{"Aucun resultat."}</td></tr>}
            {!loading && data.rows.map(m => (
              <tr key={m.id} onClick={() => navigate(`/merchants/${m.id}`)} className="row-link">
                <td>
                  <div className="cell-primary">{m.business_name || '-'}</div>
                  {m.phone && <div className="cell-secondary">{m.phone}</div>}
                </td>
                <td className="mono">{m.email}</td>
                <td>{m.city || '-'}</td>
                <td>
                  {m.deletion_requested_at
                    ? <span className="badge badge-frozen">{"Suppression programmee"}</span>
                    : m.is_frozen
                    ? <span className="badge badge-frozen">{"Gele"}</span>
                    : <span className="badge badge-on">{"Actif"}</span>}
                </td>
                <td>{m.clients_count}</td>
                <td>{m.appointments_count}</td>
                <td className="mono">{m.created_at ? new Date(m.created_at).toLocaleDateString('fr-FR') : '-'}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <MerchantGdprDeleteSection
                    merchant={m}
                    mode="button"
                    isSuperAdmin={me?.role === 'super_admin'}
                    onDeleted={removeDeletedMerchant}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pager">
          <button
            className="btn-ghost"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >{"Precedent"}</button>
          <span className="page-info">{currentPage} / {totalPages}</span>
          <button
            className="btn-ghost"
            disabled={offset + PAGE_SIZE >= data.total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >{"Suivant"}</button>
        </div>
      )}
    </AppShell>
  );
}
