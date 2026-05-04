// MerchantSubscriptionSection.jsx — gestion de l'abonnement d'un marchand
// par le superadmin : voir l'etat (Stripe + grant), octroyer un plan
// gratuit, le revoquer.
import { useEffect, useState } from 'react';
import {
  getMerchantSubscription, grantMerchantSubscription,
  revokeMerchantSubscriptionGrant,
} from '../lib/admin.js';

export default function MerchantSubscriptionSection({ merchantId, merchant }) {
  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(true);
  const [err, setErr]       = useState(null);
  const [busy, setBusy]     = useState(false);
  const [showForm, setForm] = useState(false);

  // Form fields
  const [plan, setPlan]                   = useState('essentiel');
  const [period, setPeriod]               = useState('monthly');
  const [expires, setExpires]             = useState(''); // 'YYYY-MM-DD' ou '' = pas d'expiration
  const [reason, setReason]               = useState('');
  const [cancelStripe, setCancelStripe]   = useState(true);

  const load = async () => {
    try {
      setErr(null);
      const d = await getMerchantSubscription(merchantId);
      setData(d);
    } catch (e) { setErr(e.message); }
    finally     { setLoad(false); }
  };

  useEffect(() => { load(); }, [merchantId]);

  const handleGrant = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setErr('Motif requis (min. 3 caractères).');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await grantMerchantSubscription(merchantId, {
        plan, period,
        expires_at:    expires ? new Date(expires + 'T23:59:59Z').toISOString() : null,
        reason:        reason.trim(),
        cancel_stripe: cancelStripe,
      });
      setForm(false);
      setReason('');
      setExpires('');
      await load();
    } catch (e) { setErr(e.message); }
    finally     { setBusy(false); }
  };

  const handleRevoke = async () => {
    const businessName = merchant?.business_name || 'ce marchand';
    if (!window.confirm(`Révoquer l'octroi gratuit pour « ${businessName} » ? Le marchand devra souscrire normalement via Stripe pour conserver l'accès premium.`)) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await revokeMerchantSubscriptionGrant(merchantId);
      await load();
    } catch (e) { setErr(e.message); }
    finally     { setBusy(false); }
  };

  if (loading) return (
    <section className="card">
      <div className="card-head"><h2 className="card-title">Abonnement</h2></div>
      <div className="card-body"><p style={{ color: '#888' }}>Chargement…</p></div>
    </section>
  );

  const grant = data?.admin_grant;
  const grantActive = grant && (!grant.expires_at || new Date(grant.expires_at) > new Date());
  const stripe = data?.stripe || {};

  return (
    <section className="card">
      <div className="card-head"><h2 className="card-title">Abonnement</h2></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {err && <p style={errStyle}>{err}</p>}

        {/* État effectif */}
        <div style={infoBlock}>
          <p style={lbl}>Plan effectif</p>
          <p style={val}>
            <strong>{labelPlan(data?.effective?.plan)}</strong>
            <span style={{ color: '#888', marginLeft: 8, fontSize: 13 }}>
              · source : {sourceLabel(data?.effective?.source)}
            </span>
          </p>
        </div>

        {/* État Stripe */}
        <div style={infoBlock}>
          <p style={lbl}>Stripe (compte payeur)</p>
          {stripe.subscription_id ? (
            <>
              <p style={val}>
                {labelPlan(stripe.plan)} · {stripe.period === 'yearly' ? 'Annuel' : 'Mensuel'}
                <span style={statusBadge(stripe.status)}>{stripe.status || '—'}</span>
              </p>
              {stripe.current_period_end && (
                <p style={smallMute}>
                  {stripe.cancel_at_period_end
                    ? `Annulation programmée le ${formatDate(stripe.current_period_end)}.`
                    : `Prochain prélèvement le ${formatDate(stripe.current_period_end)}.`}
                </p>
              )}
              <p style={{ ...smallMute, fontFamily: 'monospace' }}>{stripe.subscription_id}</p>
            </>
          ) : (
            <p style={smallMute}>Aucun abonnement Stripe actif.</p>
          )}
        </div>

        {/* Octroi superadmin */}
        <div style={{
          ...infoBlock,
          background: grantActive ? '#ecfdf5' : '#f9f9fb',
          borderColor: grantActive ? '#a7f3d0' : '#e5e7eb',
        }}>
          <p style={lbl}>Octroi superadmin (plan gratuit)</p>
          {grantActive ? (
            <>
              <p style={val}>
                <strong style={{ color: '#10b981' }}>
                  {labelPlan(grant.plan)} · {grant.period === 'yearly' ? 'Annuel' : 'Mensuel'} (gratuit)
                </strong>
              </p>
              <p style={smallMute}>
                Octroyé le {formatDate(grant.granted_at)} par {grant.granted_by_email || '—'}
              </p>
              <p style={smallMute}>
                {grant.expires_at
                  ? `Expire le ${formatDate(grant.expires_at)}.`
                  : 'Sans date d\'expiration (gratuit à vie jusqu\'à révocation).'}
              </p>
              {grant.reason && (
                <p style={smallMute}><em>« {grant.reason} »</em></p>
              )}
              <button onClick={handleRevoke} disabled={busy}
                      style={{ ...btnDanger, marginTop: 10 }}>
                {busy ? '…' : 'Révoquer l\'octroi (réactiver paiement Stripe)'}
              </button>
            </>
          ) : (
            <>
              <p style={smallMute}>Aucun octroi en cours.</p>
              {!showForm && (
                <button onClick={() => setForm(true)} style={{ ...btnPrimary, marginTop: 8 }}>
                  Offrir un plan gratuit
                </button>
              )}
              {showForm && (
                <form onSubmit={handleGrant} style={{ marginTop: 12 }}>
                  <div style={formGrid}>
                    <label style={lblForm}>
                      Plan
                      <select value={plan} onChange={e => setPlan(e.target.value)} style={input}>
                        <option value="essentiel">Essentiel</option>
                        <option value="equipe">Équipe</option>
                      </select>
                    </label>
                    <label style={lblForm}>
                      Période
                      <select value={period} onChange={e => setPeriod(e.target.value)} style={input}>
                        <option value="monthly">Mensuel</option>
                        <option value="yearly">Annuel</option>
                      </select>
                    </label>
                    <label style={lblForm}>
                      Date d'expiration <span style={{ color: '#888', fontWeight: 400 }}>(vide = à vie)</span>
                      <input type="date" value={expires} onChange={e => setExpires(e.target.value)} style={input}/>
                    </label>
                  </div>
                  <label style={{ ...lblForm, display: 'block', marginTop: 10 }}>
                    Motif (visible dans l'audit log)
                    <textarea value={reason} onChange={e => setReason(e.target.value)}
                              rows={2} maxLength={500} style={input}
                              placeholder="Ex: Partenariat Q3 2026, beta-testeur, gestion litige…"/>
                  </label>
                  <label style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 13, color: '#444' }}>
                    <input type="checkbox" checked={cancelStripe}
                           onChange={e => setCancelStripe(e.target.checked)}/>
                    Annuler immédiatement la sub Stripe active (recommandé pour éviter le double-billing)
                  </label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button type="button" onClick={() => setForm(false)} disabled={busy}
                            style={btnGhost}>Annuler</button>
                    <button type="submit" disabled={busy} style={btnPrimary}>
                      {busy ? 'Octroi en cours…' : 'Confirmer l\'octroi gratuit'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>

      </div>
    </section>
  );
}

function labelPlan(id) {
  if (id === 'essentiel') return 'Essentiel';
  if (id === 'equipe')    return 'Équipe';
  return 'Découverte';
}
function sourceLabel(s) {
  if (s === 'admin_grant') return 'octroi superadmin (gratuit)';
  if (s === 'stripe')      return 'abonnement Stripe payant';
  return 'plan Découverte (gratuit limité)';
}
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return '—'; }
}
function statusBadge(s) {
  const colors = {
    active:    { bg: '#ecfdf5', fg: '#10b981' },
    trialing:  { bg: '#eff6ff', fg: '#1e40af' },
    past_due:  { bg: '#fffbeb', fg: '#92400e' },
    canceled:  { bg: '#fef2f2', fg: '#991b1b' },
  };
  const c = colors[s] || { bg: '#eee', fg: '#666' };
  return {
    marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 99,
    background: c.bg, color: c.fg, fontWeight: 500,
  };
}

const infoBlock = {
  padding: '12px 14px', borderRadius: 8,
  background: '#f9f9fb', border: '1px solid #e5e7eb',
};
const lbl = {
  margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: 0.5,
};
const val = { margin: '0 0 4px', fontSize: 14, color: '#111827' };
const smallMute = { margin: '2px 0 0', fontSize: 12, color: '#6b7280' };
const errStyle = {
  margin: 0, padding: '10px 12px', borderRadius: 8,
  background: '#fef2f2', border: '1px solid #fecaca',
  color: '#991b1b', fontSize: 13,
};
const formGrid = {
  display: 'grid', gap: 10,
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
};
const lblForm = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 12, fontWeight: 500, color: '#374151',
};
const input = {
  padding: '8px 10px', fontSize: 13, borderRadius: 6,
  border: '1px solid #d1d5db', background: '#fff', color: '#111827',
  fontFamily: 'inherit',
};
const btnPrimary = {
  padding: '8px 14px', fontSize: 13, fontWeight: 500,
  background: '#111827', color: '#fff',
  border: 'none', borderRadius: 7, cursor: 'pointer',
  fontFamily: 'inherit',
};
const btnGhost = {
  padding: '8px 14px', fontSize: 13, fontWeight: 500,
  background: 'transparent', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer',
  fontFamily: 'inherit',
};
const btnDanger = {
  padding: '8px 14px', fontSize: 13, fontWeight: 500,
  background: 'transparent', color: '#991b1b',
  border: '1px solid #fecaca', borderRadius: 7, cursor: 'pointer',
  fontFamily: 'inherit',
};
