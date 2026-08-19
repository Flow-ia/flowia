// MerchantPromoCodesSection.jsx — section super-admin de la fiche
// commerçant. Liste tous les codes promo générés pour ce commerçant,
// filtre par catégorie / statut / recherche, et permet d'activer,
// désactiver ou supprimer (par code ou par catégorie complète).
//
// Catégories : loyalty (FIDEL-) | birthday (BDAY-) | referral (parrainage) |
// sms_campaign (campagne SMS) | manual (promo manuelle saisie commerçant).
// La catégorie est calculée par le backend (CASE SQL) et présente sur
// chaque ligne dans `category`.

import { useEffect, useMemo, useState } from 'react';
import {
  listMerchantPromoCodes,
  activateMerchantPromoCode,
  deactivateMerchantPromoCode,
  deleteMerchantPromoCode,
  deleteMerchantPromoCodesByCategory,
} from '../lib/admin.js';

const CATEGORY_LABELS = {
  all:          'Toutes catégories',
  loyalty:      'Fidélité',
  birthday:     'Anniversaire',
  referral:     'Parrainage',
  sms_campaign: 'Campagne SMS',
  manual:       'Promotion manuelle',
};

// Catégories supprimables en batch (toutes sauf 'all').
const BATCH_CATEGORIES = ['loyalty', 'birthday', 'referral', 'sms_campaign', 'manual'];

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtValue(row) {
  const v = parseFloat(row.value);
  if (!Number.isFinite(v)) return '—';
  return row.type === 'percent' ? `${v}%` : `${Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DA`;
}

export default function MerchantPromoCodesSection({ merchantId }) {
  const [category, setCategory] = useState('all');
  const [status,   setStatus]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [page,     setPage]     = useState(0);

  const [data,    setData]    = useState({ rows: [], total: 0, counts_by_category: {} });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [busyId,  setBusyId]  = useState(null);
  const [batchCat, setBatchCat] = useState(null); // catégorie à supprimer en batch (modale confirmation)

  const PAGE_SIZE = 20;

  async function load() {
    setLoading(true); setError('');
    try {
      const r = await listMerchantPromoCodes(merchantId, {
        category, status, search,
        limit:  PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setData(r || { rows: [], total: 0, counts_by_category: {} });
    } catch (e) {
      setError(e?.message || 'Erreur de chargement.');
      setData({ rows: [], total: 0, counts_by_category: {} });
    } finally { setLoading(false); }
  }

  // Reset page sur changement de filtres ; debounce search 300 ms.
  useEffect(() => { setPage(0); }, [category, status]);
  useEffect(() => {
    const tm = setTimeout(() => { setPage(0); load(); }, search ? 300 : 0);
    return () => clearTimeout(tm);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [category, status, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));

  async function doActivate(row) {
    setBusyId(row.id); setError(''); setSuccess('');
    try {
      await activateMerchantPromoCode(merchantId, row.id);
      setSuccess(`Code ${row.code} réactivé.`);
      await load();
    } catch (e) { setError(e?.message || 'Erreur.'); }
    finally { setBusyId(null); }
  }

  async function doDeactivate(row) {
    setBusyId(row.id); setError(''); setSuccess('');
    try {
      await deactivateMerchantPromoCode(merchantId, row.id);
      setSuccess(`Code ${row.code} désactivé.`);
      await load();
    } catch (e) { setError(e?.message || 'Erreur.'); }
    finally { setBusyId(null); }
  }

  async function doDelete(row) {
    if (!window.confirm(`Supprimer définitivement le code "${row.code}" ?\n\nCette action est irréversible. Si le code a déjà été utilisé en caisse, la suppression peut échouer (logs comptables).`)) return;
    setBusyId(row.id); setError(''); setSuccess('');
    try {
      await deleteMerchantPromoCode(merchantId, row.id);
      setSuccess(`Code ${row.code} supprimé.`);
      await load();
    } catch (e) {
      setError(e?.message || 'Suppression impossible.');
    } finally { setBusyId(null); }
  }

  async function doBatchDelete() {
    if (!batchCat) return;
    setBusyId('batch'); setError(''); setSuccess('');
    try {
      const r = await deleteMerchantPromoCodesByCategory(merchantId, batchCat);
      const lbl = CATEGORY_LABELS[batchCat] || batchCat;
      setSuccess(`${lbl} : ${r.deleted_count} code(s) supprimé(s)${r.failed_count ? `, ${r.failed_count} échec(s)` : ''}.`);
      setBatchCat(null);
      await load();
    } catch (e) {
      setError(e?.message || 'Erreur batch.');
    } finally { setBusyId(null); }
  }

  const counts = data.counts_by_category || {};
  const totalAll = useMemo(
    () => Object.values(counts).reduce((s, n) => s + (n || 0), 0),
    [counts]
  );

  return (
    <section className="card">
      <div className="card-head" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
        <div>
          <h2 className="card-title">{"Codes promo de ce commerçant"}</h2>
          <p className="card-sub" style={{ marginTop: 4 }}>
            {"Tous les codes générés pour ce commerçant, par catégorie. Les codes sont strictement isolés par commerçant (un code émis ici n'est pas validable chez un autre commerçant)."}
          </p>
        </div>
      </div>

      {/* Compteurs par catégorie */}
      <ul className="dash-list" style={{ marginTop: 0 }}>
        <li><span className="k">{"Total codes"}</span><span className="v">{totalAll}</span></li>
        {BATCH_CATEGORIES.map(c => (
          <li key={c}>
            <span className="k">{CATEGORY_LABELS[c]}</span>
            <span className="v" style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span className="mono">{counts[c] || 0}</span>
              <button
                className="btn-ghost"
                onClick={() => { setCategory(c); setPage(0); }}
                disabled={loading}
              >{"Filtrer"}</button>
              <button
                className="btn-danger"
                onClick={() => { setBatchCat(c); setError(''); setSuccess(''); }}
                disabled={loading || (counts[c] || 0) === 0}
                title={(counts[c] || 0) === 0 ? 'Aucun code dans cette catégorie' : 'Supprimer toute la catégorie'}
              >{"Tout supprimer"}</button>
            </span>
          </li>
        ))}
      </ul>

      {/* Filtres + recherche */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', marginTop:14 }}>
        <label className="field" style={{ flex:'1 1 200px', minWidth:180 }}>
          <span>{"Catégorie"}</span>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}{k !== 'all' && counts[k] != null ? ` (${counts[k]})` : ''}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex:'1 1 140px', minWidth:120 }}>
          <span>{"Statut"}</span>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">{"Tous"}</option>
            <option value="active">{"Actif"}</option>
            <option value="inactive">{"Inactif"}</option>
          </select>
        </label>
        <label className="field" style={{ flex:'2 1 240px', minWidth:200 }}>
          <span>{"Rechercher (code ou email client)"}</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ex: FIDEL-9LE83M ou client@…"
          />
        </label>
      </div>

      {error   && <div className="alert alert-error"   style={{ marginTop: 10 }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginTop: 10 }}>{success}</div>}

      {/* Liste des codes */}
      <div style={{ marginTop: 14, overflowX: 'auto' }}>
        <table className="adm-table" style={{ width:'100%', borderCollapse:'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign:'left', borderBottom:'0.5px solid rgba(0,0,0,0.1)' }}>
              <th style={{ padding:'8px 6px' }}>{"Code"}</th>
              <th style={{ padding:'8px 6px' }}>{"Catégorie"}</th>
              <th style={{ padding:'8px 6px' }}>{"Valeur"}</th>
              <th style={{ padding:'8px 6px' }}>{"Client lié"}</th>
              <th style={{ padding:'8px 6px' }}>{"Validité"}</th>
              <th style={{ padding:'8px 6px' }}>{"Utilisations"}</th>
              <th style={{ padding:'8px 6px' }}>{"Statut"}</th>
              <th style={{ padding:'8px 6px', textAlign:'right' }}>{"Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ padding: 12 }}>{"Chargement..."}</td></tr>
            )}
            {!loading && data.rows.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 12, opacity: 0.7 }}>
                {search || category !== 'all' || status !== 'all'
                  ? "Aucun code ne correspond aux filtres."
                  : "Aucun code généré pour ce commerçant."}
              </td></tr>
            )}
            {!loading && data.rows.map(row => (
              <tr key={row.id} style={{ borderBottom:'0.5px solid rgba(0,0,0,0.06)' }}>
                <td style={{ padding:'8px 6px' }} className="mono">{row.code}</td>
                <td style={{ padding:'8px 6px' }}>{CATEGORY_LABELS[row.category] || row.category}</td>
                <td style={{ padding:'8px 6px' }} className="mono">{fmtValue(row)}</td>
                <td style={{ padding:'8px 6px' }}>{row.owner_client_email || '—'}</td>
                <td style={{ padding:'8px 6px' }} className="mono">
                  {fmtDate(row.valid_from)}{' → '}{fmtDate(row.valid_until)}
                </td>
                <td style={{ padding:'8px 6px' }} className="mono">
                  {row.uses_count ?? 0}{row.max_uses != null ? `/${row.max_uses}` : ''}
                </td>
                <td style={{ padding:'8px 6px' }}>
                  <span className={row.is_active ? 'badge badge-on' : 'badge badge-frozen'}>
                    {row.is_active ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td style={{ padding:'8px 6px', textAlign:'right' }}>
                  <span style={{ display:'inline-flex', gap:6, justifyContent:'flex-end' }}>
                    {row.is_active ? (
                      <button className="btn-ghost"
                              disabled={busyId === row.id}
                              onClick={() => doDeactivate(row)}>
                        {busyId === row.id ? '...' : 'Désactiver'}
                      </button>
                    ) : (
                      <button className="btn-ghost"
                              disabled={busyId === row.id}
                              onClick={() => doActivate(row)}>
                        {busyId === row.id ? '...' : 'Réactiver'}
                      </button>
                    )}
                    <button className="btn-danger"
                            disabled={busyId === row.id}
                            onClick={() => doDelete(row)}>
                      {busyId === row.id ? '...' : 'Supprimer'}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data.total > PAGE_SIZE && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10, gap:10 }}>
          <button className="btn-ghost"
                  disabled={page <= 0 || loading}
                  onClick={() => setPage(p => Math.max(0, p - 1))}>
            {"← Précédent"}
          </button>
          <span style={{ fontSize:12, opacity:0.7 }}>
            {`Page ${page + 1} / ${totalPages} — ${data.total} code(s)`}
          </span>
          <button className="btn-ghost"
                  disabled={page + 1 >= totalPages || loading}
                  onClick={() => setPage(p => p + 1)}>
            {"Suivant →"}
          </button>
        </div>
      )}

      {/* Modale confirmation batch delete */}
      {batchCat && (
        <div className="form-stack" style={{ marginTop: 16, padding: 12,
                                              background: 'rgba(239,68,68,0.06)',
                                              border: '0.5px solid rgba(239,68,68,0.4)',
                                              borderRadius: 8 }}>
          <p className="card-sub" style={{ margin: 0 }}>
            <strong>{"Supprimer DÉFINITIVEMENT tous les codes "}</strong>
            <strong>{`« ${CATEGORY_LABELS[batchCat]} »`}</strong>
            {` (${counts[batchCat] || 0} code(s)) pour ce commerçant ?`}
            <br />
            {"Action irréversible. Les codes déjà utilisés en caisse peuvent être conservés (FK comptables) — la réponse listera les échecs."}
          </p>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-danger" disabled={busyId === 'batch'}
                    onClick={doBatchDelete} style={{ flex: 1 }}>
              {busyId === 'batch' ? '...' : `Supprimer ${counts[batchCat] || 0} code(s)`}
            </button>
            <button className="btn-ghost" onClick={() => setBatchCat(null)}>{"Annuler"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
