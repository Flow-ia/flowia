import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { getMe } from '../lib/auth.js';
import { getMerchant, updateMerchant, freezeMerchant, unfreezeMerchant, adjustMerchantSmsBalance, getMerchantFeatures, setMerchantFeature, forceMerchantSlug } from '../lib/admin.js';
import AppShell from '../components/AppShell.jsx';

// Liste des features blocables avec libelle FR. Doit rester aligne avec la
// constante FEATURES de backend/src/middleware/requireFeature.js.
const FEATURE_LABELS = [
  ['promo',        'Codes promo'],
  ['loyalty',      'Programme fidelite'],
  ['birthday',     'Campagne anniversaire'],
  ['referrals',    'Parrainage'],
  ['campaigns',    'Campagnes SMS / Email'],
  ['marketing_ai', 'Marketing IA'],
  ['export',       'Exports comptables'],
  ['credits',      'Credits clients'],
  ['commissions',  'Commissions employes'],
];

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
  // Ajustement solde SMS — direction add/sub, montant absolu, motif
  const [smsOpen, setSmsOpen]       = useState(false);
  const [smsDir, setSmsDir]         = useState('add'); // 'add' | 'sub'
  const [smsAmount, setSmsAmount]   = useState('');
  const [smsReason, setSmsReason]   = useState('');
  // Feature flags merchant
  const [features, setFeatures]     = useState(null); // { feature: true|false }
  const [pendingFeat, setPendingFeat] = useState(null); // { feature, nextEnabled }
  const [featReason, setFeatReason] = useState('');
  // Forcage URL slug
  const [slugOpen, setSlugOpen]     = useState(false);
  const [slugInput, setSlugInput]   = useState('');
  const [slugLockInput, setSlugLockInput] = useState(true);

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

  // Charge les feature flags en parallele du detail merchant.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getMerchantFeatures(id).then((r) => { if (!cancelled) setFeatures(r.features); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  async function confirmFeatureToggle(e) {
    e.preventDefault();
    if (!pendingFeat) return;
    if (!featReason.trim()) { setError('Motif requis.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      const r = await setMerchantFeature(id, {
        feature: pendingFeat.feature,
        enabled: pendingFeat.nextEnabled,
        reason: featReason.trim(),
      });
      setFeatures(r.features ? Object.fromEntries(FEATURE_LABELS.map(([k]) => [k, r.features[k] !== false])) : features);
      // Plus simple : recharger via getMerchantFeatures
      const fresh = await getMerchantFeatures(id);
      setFeatures(fresh.features);
      setSuccess(`${pendingFeat.nextEnabled ? 'Feature activee' : 'Feature desactivee'} : ${pendingFeat.feature}.`);
      setPendingFeat(null); setFeatReason('');
    } catch (err) {
      setError(err && err.message ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  }

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

  async function doForceSlug(e) {
    e.preventDefault();
    const slug = slugInput.trim().toLowerCase();
    if (!slug || slug.length < 3) { setError('Slug invalide (3 caracteres min).'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      const r = await forceMerchantSlug(id, { slug, lock: slugLockInput });
      setSuccess(`Slug ${slugLockInput ? 'verrouille' : 'modifie'} : /${r.slug}.`);
      setSlugOpen(false); setSlugInput(''); setSlugLockInput(true);
      await load();
    } catch (err) {
      setError(err && err.message ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  }

  async function doUnlockSlug() {
    if (!confirm('Lever le verrou du slug ? Le commercant pourra a nouveau le modifier.')) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      // Reutilise force avec lock=false pour debrouiller, en gardant le slug actuel.
      const r = await forceMerchantSlug(id, { slug: merchant.slug, lock: false });
      setSuccess(`Slug deverrouille : /${r.slug}.`);
      await load();
    } catch (err) {
      setError(err && err.message ? err.message : 'Erreur.');
    } finally {
      setBusy(false);
    }
  }

  async function doAdjustSms(e) {
    e.preventDefault();
    const amt = Number(String(smsAmount).replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) { setError('Montant invalide.'); return; }
    if (amt > 1000) { setError('Cap par operation : 1000 euros.'); return; }
    if (!smsReason.trim()) { setError('Motif requis.'); return; }
    const delta = smsDir === 'sub' ? -amt : amt;
    setBusy(true); setError(''); setSuccess('');
    try {
      const r = await adjustMerchantSmsBalance(id, { delta, reason: smsReason.trim() });
      setSuccess(`Solde ajuste : ${r.sms_balance.toFixed(2)} euros (${delta > 0 ? '+' : ''}${delta.toFixed(2)}).`);
      setSmsOpen(false); setSmsAmount(''); setSmsReason(''); setSmsDir('add');
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
        <div className="card-head">
          <h2 className="card-title">{"URL de reservation"}</h2>
          {merchant.slug_locked && !slugOpen && (
            <button className="btn-ghost" onClick={doUnlockSlug} disabled={busy}>{"Deverrouiller"}</button>
          )}
        </div>
        <ul className="dash-list">
          <li>
            <span className="k">{"Slug actuel"}</span>
            <span className="v mono">{merchant.slug ? `/${merchant.slug}` : '—'}</span>
          </li>
          <li>
            <span className="k">{"Statut"}</span>
            <span className="v">
              {merchant.slug_locked
                ? <span className="badge badge-frozen">{"Verrouille (impose admin)"}</span>
                : <span className="badge badge-on">{"Modifiable par le merchant"}</span>}
            </span>
          </li>
          {merchant.slug_locked && merchant.slug_locked_at && (
            <li><span className="k">{"Verrouille le"}</span><span className="v mono">{new Date(merchant.slug_locked_at).toLocaleString('fr-FR')}</span></li>
          )}
        </ul>

        {!slugOpen
          ? <button className="btn-ghost" onClick={() => { setSlugOpen(true); setSlugInput(merchant.slug || ''); setError(''); setSuccess(''); }} style={{ marginTop: 8 }}>
              {merchant.slug_locked ? 'Modifier le slug verrouille' : 'Imposer un slug'}
            </button>
          : (
            <form onSubmit={doForceSlug} className="form-stack" style={{ marginTop: 12 }}>
              <p className="card-sub" style={{ margin: 0 }}>
                {"Le slug est l'URL publique du site de reservation : flowia.fr/book/<slug>. Caracteres autorises : a-z, 0-9, tirets. Unicite verifiee."}
              </p>
              <label className="field"><span>{"Nouveau slug"}</span>
                <input
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                  placeholder="hair-coiff-lille"
                  pattern="[a-z0-9-]+"
                  minLength={3} maxLength={60}
                  required autoFocus
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={slugLockInput}
                  onChange={(e) => setSlugLockInput(e.target.checked)}
                />
                {"Verrouiller (le merchant ne pourra plus modifier le slug)"}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn-primary" disabled={busy} style={{ flex: 1 }}>{busy ? '...' : 'Appliquer'}</button>
                <button type="button" className="btn-ghost" onClick={() => { setSlugOpen(false); setSlugInput(''); }}>{"Annuler"}</button>
              </div>
            </form>
          )
        }
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">{"Solde SMS"}</h2>
          {!smsOpen && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => { setSmsOpen(true); setSmsDir('add'); setError(''); setSuccess(''); }}>{"Ajouter"}</button>
              <button className="btn-ghost" onClick={() => { setSmsOpen(true); setSmsDir('sub'); setError(''); setSuccess(''); }}>{"Retirer"}</button>
            </div>
          )}
        </div>
        <ul className="dash-list">
          <li>
            <span className="k">{"Solde actuel"}</span>
            <span className="v mono">{merchant.sms_balance != null ? `${Number(merchant.sms_balance).toFixed(2)} €` : '—'}</span>
          </li>
        </ul>

        {smsOpen && (
          <form onSubmit={doAdjustSms} className="form-stack" style={{ marginTop: 12 }}>
            <p className="card-sub" style={{ margin: 0 }}>
              {smsDir === 'add' ? "Ajout de credit (geste commercial, compensation, etc.)." : "Retrait de credit (correction d'erreur, ajustement)."}
              {" Cap par operation : 1000 €. Audit log obligatoire."}
            </p>
            <label className="field"><span>{"Montant en euros (positif)"}</span>
              <input
                type="number" min="0.01" max="1000" step="0.01"
                value={smsAmount}
                onChange={(e) => setSmsAmount(e.target.value)}
                placeholder="Ex: 25.00"
                required autoFocus
              />
            </label>
            <label className="field"><span>{"Motif (visible dans l'audit log)"}</span>
              <input
                value={smsReason}
                onChange={(e) => setSmsReason(e.target.value)}
                placeholder={smsDir === 'add' ? "Ex: compensation bug Stripe" : "Ex: correction double recharge"}
                required
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className={smsDir === 'sub' ? 'btn-danger' : 'btn-primary'} disabled={busy} style={{ flex: 1 }}>
                {busy ? '...' : (smsDir === 'add' ? 'Confirmer ajout' : 'Confirmer retrait')}
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setSmsOpen(false); setSmsAmount(''); setSmsReason(''); }}>{"Annuler"}</button>
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

      <section className="card">
        <h2 className="card-title">{"Permissions / Features"}</h2>
        <p className="card-sub" style={{ marginTop: 0 }}>
          {"Activer ou desactiver une fonctionnalite. Une feature desactivee renvoie 403 cote API et le merchant voit un message dans son interface. Toute modification est tracee dans l'audit log avec motif obligatoire."}
        </p>
        {!features
          ? <div className="splash" style={{ padding: 12 }}>{"Chargement..."}</div>
          : (
            <ul className="dash-list">
              {FEATURE_LABELS.map(([key, label]) => {
                const enabled = features[key] !== false;
                return (
                  <li key={key}>
                    <span className="k">{label}</span>
                    <span className="v" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className={enabled ? 'badge badge-on' : 'badge badge-frozen'}>
                        {enabled ? 'Active' : 'Bloquee'}
                      </span>
                      <button
                        className="btn-ghost"
                        onClick={() => { setPendingFeat({ feature: key, nextEnabled: !enabled }); setFeatReason(''); setError(''); setSuccess(''); }}
                        disabled={busy}
                      >
                        {enabled ? 'Bloquer' : 'Activer'}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

        {pendingFeat && (
          <form onSubmit={confirmFeatureToggle} className="form-stack" style={{ marginTop: 14 }}>
            <p className="card-sub" style={{ margin: 0 }}>
              {pendingFeat.nextEnabled
                ? `Confirmer l'activation de '${pendingFeat.feature}' pour ce merchant.`
                : `Confirmer le blocage de '${pendingFeat.feature}' pour ce merchant.`}
            </p>
            <label className="field"><span>{"Motif (audit log)"}</span>
              <input
                value={featReason}
                onChange={(e) => setFeatReason(e.target.value)}
                placeholder={pendingFeat.nextEnabled ? "Ex: reactivation apres regularisation" : "Ex: usage abusif, plan inferieur"}
                required autoFocus
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className={pendingFeat.nextEnabled ? 'btn-primary' : 'btn-danger'} disabled={busy} style={{ flex: 1 }}>
                {busy ? '...' : 'Confirmer'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setPendingFeat(null); setFeatReason(''); }}>{"Annuler"}</button>
            </div>
          </form>
        )}
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
