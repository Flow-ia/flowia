import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import { getClient, blockClient, unblockClient, anonymizeClient, restrictClientBooking, allowClientBooking } from '../lib/admin.js';
import AppShell from '../components/AppShell.jsx';

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [me, setMe]               = useState(null);
  const [client, setClient]       = useState(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reason, setReason]       = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [restrictOpen, setRestrictOpen] = useState(false);
  const [restrictReason, setRestrictReason] = useState('');

  useEffect(() => { getMe().then(setMe).catch(() => navigate('/login', { replace: true })); }, [navigate]);

  async function load() {
    setError('');
    try {
      const c = await getClient(id);
      setClient(c);
    } catch (err) {
      if (err.status === 404) { setError('Client introuvable.'); setClient(null); }
      else setError(err && err.message ? err.message : 'Erreur.');
    }
  }
  useEffect(() => { load(); }, [id]);

  async function doBlock(e) {
    e.preventDefault();
    if (!reason.trim()) { setError('Motif requis.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      await blockClient(id, reason.trim());
      setSuccess('Client bloque.');
      setBlockOpen(false); setReason('');
      await load();
    } catch (err) { setError(err && err.message ? err.message : 'Erreur.'); }
    finally { setBusy(false); }
  }

  async function doUnblock() {
    if (!confirm('Confirmer le deblocage de ce client ?')) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await unblockClient(id);
      setSuccess('Client debloque.');
      await load();
    } catch (err) { setError(err && err.message ? err.message : 'Erreur.'); }
    finally { setBusy(false); }
  }

  async function doRestrictBooking(e) {
    e.preventDefault();
    if (!restrictReason.trim()) { setError('Motif requis.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      await restrictClientBooking(id, restrictReason.trim());
      setSuccess('Reservation restreinte.');
      setRestrictOpen(false); setRestrictReason('');
      await load();
    } catch (err) { setError(err && err.message ? err.message : 'Erreur.'); }
    finally { setBusy(false); }
  }

  async function doAllowBooking() {
    if (!confirm('Lever la restriction de reservation pour ce client ?')) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await allowClientBooking(id);
      setSuccess('Restriction levee.');
      await load();
    } catch (err) { setError(err && err.message ? err.message : 'Erreur.'); }
    finally { setBusy(false); }
  }

  async function doAnonymize() {
    if (!confirm('ANONYMISER ce client ? Cette action est IRREVERSIBLE. Toutes ses donnees personnelles (nom, email, telephone) seront effacees. Les RDV et historiques sont conserves (anonymises).')) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await anonymizeClient(id);
      setSuccess('Client anonymise.');
      await load();
    } catch (err) { setError(err && err.message ? err.message : 'Erreur.'); }
    finally { setBusy(false); }
  }

  if (!client) {
    return (
      <AppShell me={me} footer="Salon DZ Admin — Clients">
        <Link to="/clients" className="btn-ghost">{"← Retour"}</Link>
        {error
          ? <div className="login-error" style={{ marginTop: 16 }}>{error}</div>
          : <div className="splash">{"Chargement..."}</div>}
      </AppShell>
    );
  }

  const fullName = [client.first_name, client.last_name].filter(Boolean).join(' ') || '—';
  const merchants = client.merchants || [];

  return (
    <AppShell me={me} footer="Salon DZ Admin — Clients">
      <Link to="/clients" className="btn-ghost">{"← Retour"}</Link>

      <div className="page-head" style={{ marginTop: 16 }}>
        <div>
          <h1 className="dash-title">{fullName}</h1>
          <p className="page-sub">{client.email || '—'}{client.phone ? ` — ${client.phone}` : ''}</p>
        </div>
        {client.is_blocked
          ? <span className="badge badge-frozen">{"Bloque"}</span>
          : <span className="badge badge-on">{"Actif"}</span>}
      </div>

      {error   && <div className="login-error">{error}</div>}
      {success && <div className="login-success">{success}</div>}

      {client.is_blocked && (
        <section className="card card-warning">
          <div className="card-head">
            <h2 className="card-title">{"Client bloque"}</h2>
            <button className="btn-ghost" onClick={doUnblock} disabled={busy}>{"Debloquer"}</button>
          </div>
          <p className="card-sub">
            <strong>{"Motif :"}</strong> {client.blocked_reason || '—'}<br/>
            <strong>{"Depuis :"}</strong> {client.blocked_at ? new Date(client.blocked_at).toLocaleString('fr-FR') : '—'}<br/>
            {client.blocked_by && <><strong>{"Par :"}</strong> {client.blocked_by.name} ({client.blocked_by.email})</>}
          </p>
        </section>
      )}

      <section className="card">
        <h2 className="card-title">{"Identite"}</h2>
        <ul className="dash-list">
          <li><span className="k">{"Prenom"}</span><span className="v">{client.first_name || '—'}</span></li>
          <li><span className="k">{"Nom"}</span><span className="v">{client.last_name || '—'}</span></li>
          <li><span className="k">Email</span><span className="v mono">{client.email || '—'}</span></li>
          <li><span className="k">{"Telephone"}</span><span className="v mono">{client.phone || '—'}</span></li>
          <li><span className="k">{"Verifie"}</span><span className="v">{client.is_verified ? 'Oui' : 'Non'}</span></li>
          <li><span className="k">{"Cree le"}</span><span className="v mono">{client.created_at ? new Date(client.created_at).toLocaleString('fr-FR') : '—'}</span></li>
        </ul>
      </section>

      <section className="card">
        <h2 className="card-title">{"Salons relies (" + merchants.length + ")"}</h2>
        {merchants.length === 0 ? (
          <p className="card-sub">{"Ce client global n'est lie a aucun salon (jamais reserve via le portail public client)."}</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{"Salon"}</th>
                  <th>{"Statut salon"}</th>
                  <th>{"Bloque local"}</th>
                  <th>{"RDV"}</th>
                  <th>{"Dernier RDV"}</th>
                  <th>{"Lie depuis"}</th>
                </tr>
              </thead>
              <tbody>
                {merchants.map(m => (
                  <tr key={m.client_account_id} onClick={() => navigate(`/merchants/${m.merchant_id}`)} className="row-link">
                    <td>
                      <div className="cell-primary">{m.business_name || '—'}</div>
                      <div className="cell-secondary mono">{m.merchant_email || ''}</div>
                    </td>
                    <td>
                      {m.merchant_frozen
                        ? <span className="badge badge-frozen">{"Gele"}</span>
                        : <span className="badge badge-on">{"Actif"}</span>}
                    </td>
                    <td>{m.merchant_blocked ? 'Oui' : '—'}</td>
                    <td>{m.appointments_count}</td>
                    <td className="mono">{m.last_appointment_date ? new Date(m.last_appointment_date).toLocaleDateString('fr-FR') : '—'}</td>
                    <td className="mono">{m.linked_at ? new Date(m.linked_at).toLocaleDateString('fr-FR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">{"Restriction de reservation"}</h2>
          {client.cannot_book && !restrictOpen && (
            <button className="btn-ghost" onClick={doAllowBooking} disabled={busy}>{"Lever la restriction"}</button>
          )}
        </div>
        <p className="card-sub" style={{ marginTop: 0 }}>
          {"Different du blocage total : le client peut toujours se connecter, voir son historique et exporter ses donnees, mais ne peut plus reserver de nouveaux RDV sur AUCUN salon Salon DZ."}
        </p>

        {client.cannot_book ? (
          <ul className="dash-list">
            <li><span className="k">{"Statut"}</span><span className="v"><span className="badge badge-frozen">{"Reservation bloquee"}</span></span></li>
            <li><span className="k">{"Motif"}</span><span className="v">{client.cannot_book_reason || '—'}</span></li>
            <li><span className="k">{"Depuis"}</span><span className="v mono">{client.cannot_book_at ? new Date(client.cannot_book_at).toLocaleString('fr-FR') : '—'}</span></li>
          </ul>
        ) : (
          <>
            <ul className="dash-list">
              <li><span className="k">{"Statut"}</span><span className="v"><span className="badge badge-on">{"Reservation autorisee"}</span></span></li>
            </ul>
            {!restrictOpen
              ? <button className="btn-ghost" onClick={() => { setRestrictOpen(true); setRestrictReason(''); setError(''); setSuccess(''); }} style={{ marginTop: 8 }}>{"Bloquer la reservation"}</button>
              : (
                <form onSubmit={doRestrictBooking} className="form-stack" style={{ marginTop: 12 }}>
                  <label className="field"><span>{"Motif (audit log)"}</span>
                    <input
                      value={restrictReason}
                      onChange={(e) => setRestrictReason(e.target.value)}
                      placeholder={"Ex: no-shows repetes, abus de RDV non honores"}
                      required autoFocus
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" className="btn-danger" disabled={busy} style={{ flex: 1 }}>{busy ? '...' : 'Confirmer le blocage'}</button>
                    <button type="button" className="btn-ghost" onClick={() => { setRestrictOpen(false); setRestrictReason(''); }}>{"Annuler"}</button>
                  </div>
                </form>
              )
            }
          </>
        )}
      </section>

      {!client.is_blocked && (
        <section className="card card-danger">
          <div className="card-head">
            <h2 className="card-title">{"Zone sensible"}</h2>
          </div>
          <p className="card-sub">
            {"Bloquer ce client refuse sa connexion sur tous les salons Salon DZ. Les RDV existants sont conserves. Action reversible."}
          </p>
          {!blockOpen
            ? <button className="btn-danger" onClick={() => { setBlockOpen(true); setError(''); }}>{"Bloquer ce client"}</button>
            : (
              <form onSubmit={doBlock} className="form-stack">
                <label className="field"><span>{"Motif (visible dans l'audit log)"}</span>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus
                    placeholder={"Ex: comportement abusif, signalements multiples, fraude"} />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn-danger" disabled={busy} style={{ flex: 1 }}>{busy ? '...' : 'Confirmer le blocage'}</button>
                  <button type="button" className="btn-ghost" onClick={() => { setBlockOpen(false); setReason(''); }}>{"Annuler"}</button>
                </div>
              </form>
            )
          }
        </section>
      )}

      <section className="card card-danger">
        <div className="card-head">
          <h2 className="card-title">{"Anonymisation (loi 18-07)"}</h2>
        </div>
        <p className="card-sub">
          {"Efface DEFINITIVEMENT les donnees personnelles (nom, email, telephone, mot de passe) tout en preservant les RDV et historiques (anonymises). Action IRREVERSIBLE. A utiliser uniquement sur demande explicite du client (droit a l'oubli, loi 18-07)."}
        </p>
        <button className="btn-danger" onClick={doAnonymize} disabled={busy}>
          {"Anonymiser definitivement"}
        </button>
      </section>
    </AppShell>
  );
}
