import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import { getMerchant, updateMerchant, freezeMerchant, unfreezeMerchant } from '../lib/admin.js';
import AppShell from '../components/AppShell.jsx';

export default function MerchantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [me, setMe]               = useState(null);
  const [merchant, setMerchant]   = useState(null);
  const [editing, setEditing]     = useState(false);
  const [edit, setEdit]           = useState({});
  const [freezeOpen, setFreeze]   = useState(false);
  const [freezeReason, setReason] = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  useEffect(() => { getMe().then(setMe).catch(() => navigate('/login', { replace: true })); }, [navigate]);

  async function load() {
    setError('');
    try {
      const m = await getMerchant(id);
      setMerchant(m);
    } catch (err) {
      if (err.status === 404) {
        setError('Commercant introuvable.');
        setMerchant(null);
      } else {
        setError(err && err.message ? err.message : 'Erreur de chargement.');
      }
    }
  }
  useEffect(() => { load(); }, [id]);

  function startEdit() {
    setEdit({
      business_name: merchant.business_name || '',
      email:         merchant.email || '',
      phone:         merchant.phone || '',
      city:          merchant.city || '',
      address:       merchant.address || '',
    });
    setEditing(true);
    setError(''); setSuccess('');
  }

  async function saveEdit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      await updateMerchant(id, edit);
      setSuccess('Modifications enregistrees.');
      setEditing(false);
      await load();
    } catch (err) {
      setError(err && err.message ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  }

  async function doFreeze(e) {
    e.preventDefault();
    if (!freezeReason.trim()) { setError('Motif requis.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      await freezeMerchant(id, freezeReason.trim());
      setSuccess('Compte gele.');
      setFreeze(false); setReason('');
      await load();
    } catch (err) {
      setError(err && err.message ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  }

  async function doUnfreeze() {
    if (!confirm('Confirmer le degel de ce commercant ?')) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await unfreezeMerchant(id);
      setSuccess('Compte degele.');
      await load();
    } catch (err) {
      setError(err && err.message ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  }

  if (!merchant) {
    return (
      <AppShell me={me} footer="FlowIA Admin — Commercants">
        <Link to="/merchants" className="btn-ghost">{"← Retour"}</Link>
        {error
          ? <div className="login-error" style={{ marginTop: 16 }}>{error}</div>
          : <div className="splash">{"Chargement..."}</div>}
      </AppShell>
    );
  }

  const stats = merchant.stats || {};

  return (
    <AppShell me={me} footer="FlowIA Admin — Commercants">
      <Link to="/merchants" className="btn-ghost">{"← Retour"}</Link>

      <div className="page-head" style={{ marginTop: 16 }}>
        <div>
          <h1 className="dash-title">{merchant.business_name}</h1>
          <p className="page-sub">{merchant.email} {merchant.slug ? `— /${merchant.slug}` : ''}</p>
        </div>
        {merchant.is_frozen
          ? <span className="badge badge-frozen">{"Gele"}</span>
          : <span className="badge badge-on">{"Actif"}</span>}
      </div>

      {error   && <div className="login-error">{error}</div>}
      {success && <div className="login-success">{success}</div>}

      {merchant.is_frozen && (
        <section className="card card-warning">
          <div className="card-head">
            <h2 className="card-title">{"Compte gele"}</h2>
            <button className="btn-ghost" onClick={doUnfreeze} disabled={busy}>{"Degeler"}</button>
          </div>
          <p className="card-sub">
            <strong>{"Motif :"}</strong> {merchant.frozen_reason || '—'}<br/>
            <strong>{"Depuis :"}</strong> {merchant.frozen_at ? new Date(merchant.frozen_at).toLocaleString('fr-FR') : '—'}<br/>
            {merchant.frozen_by && <><strong>{"Par :"}</strong> {merchant.frozen_by.name} ({merchant.frozen_by.email})</>}
          </p>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">{"Informations"}</h2>
          {!editing && <button className="btn-ghost" onClick={startEdit}>{"Modifier"}</button>}
        </div>

        {!editing && (
          <ul className="dash-list">
            <li><span className="k">{"Nom commerce"}</span><span className="v">{merchant.business_name || '—'}</span></li>
            <li><span className="k">Email</span><span className="v mono">{merchant.email}</span></li>
            <li><span className="k">{"Telephone"}</span><span className="v mono">{merchant.phone || '—'}</span></li>
            <li><span className="k">{"Adresse"}</span><span className="v">{merchant.address || '—'}</span></li>
            <li><span className="k">{"Ville"}</span><span className="v">{merchant.city || '—'} {merchant.postal_code ? `(${merchant.postal_code})` : ''}</span></li>
            <li><span className="k">{"Pays"}</span><span className="v">{merchant.country || '—'}</span></li>
            <li><span className="k">{"Slug booking"}</span><span className="v mono">{merchant.slug || '—'}</span></li>
            <li><span className="k">{"Onboarding"}</span><span className="v">{merchant.onboarding_completed ? 'Termine' : 'En cours'}</span></li>
            <li><span className="k">{"Cree le"}</span><span className="v mono">{merchant.created_at ? new Date(merchant.created_at).toLocaleString('fr-FR') : '—'}</span></li>
          </ul>
        )}

        {editing && (
          <form onSubmit={saveEdit} className="form-stack">
            <label className="field"><span>{"Nom commerce"}</span>
              <input value={edit.business_name} onChange={(e) => setEdit({ ...edit, business_name: e.target.value })} />
            </label>
            <label className="field"><span>Email</span>
              <input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </label>
            <label className="field"><span>{"Telephone"}</span>
              <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </label>
            <label className="field"><span>{"Adresse"}</span>
              <input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </label>
            <label className="field"><span>{"Ville"}</span>
              <input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn-primary" disabled={busy} style={{ flex: 1 }}>{busy ? '...' : 'Enregistrer'}</button>
              <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>{"Annuler"}</button>
            </div>
          </form>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">{"Statistiques"}</h2>
        <ul className="dash-list">
          <li><span className="k">{"RDV total"}</span><span className="v">{stats.appointments_total ?? '—'}</span></li>
          <li><span className="k">{"RDV termines"}</span><span className="v">{stats.appointments_done ?? '—'}</span></li>
          <li><span className="k">{"RDV annules"}</span><span className="v">{stats.appointments_cancelled ?? '—'}</span></li>
          <li><span className="k">{"Clients"}</span><span className="v">{stats.clients_count ?? '—'}</span></li>
          <li><span className="k">{"Employes actifs"}</span><span className="v">{stats.employees_active ?? '—'}</span></li>
          <li><span className="k">{"Transactions"}</span><span className="v">{stats.transactions_count ?? '—'}</span></li>
          <li><span className="k">{"CA total"}</span><span className="v">{stats.revenue_total ? `${Number(stats.revenue_total).toFixed(2)} €` : '—'}</span></li>
          <li><span className="k">{"Dernier RDV"}</span><span className="v mono">{stats.last_appointment_at ? new Date(stats.last_appointment_at).toLocaleString('fr-FR') : '—'}</span></li>
        </ul>
      </section>

      {!merchant.is_frozen && (
        <section className="card card-danger">
          <div className="card-head">
            <h2 className="card-title">{"Zone sensible"}</h2>
          </div>
          <p className="card-sub">
            {"Geler un commercant le deconnecte (login bloque) et rend sa page de booking publique inaccessible. Les RDV existants sont conserves. Action reversible."}
          </p>
          {!freezeOpen
            ? <button className="btn-danger" onClick={() => { setFreeze(true); setError(''); }}>{"Geler ce compte"}</button>
            : (
              <form onSubmit={doFreeze} className="form-stack">
                <label className="field"><span>{"Motif (visible dans l'audit log)"}</span>
                  <input value={freezeReason} onChange={(e) => setReason(e.target.value)} required autoFocus
                    placeholder={"Ex: impaye, abus, demande client"}
                  />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn-danger" disabled={busy} style={{ flex: 1 }}>{busy ? '...' : 'Confirmer le gel'}</button>
                  <button type="button" className="btn-ghost" onClick={() => { setFreeze(false); setReason(''); }}>{"Annuler"}</button>
                </div>
              </form>
            )
          }
        </section>
      )}
    </AppShell>
  );
}
