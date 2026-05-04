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
  const [grantType, setGrantType]         = useState('trial'); // 'trial' | 'gift'
  const [plan, setPlan]                   = useState('essentiel');
  const [period, setPeriod]               = useState('monthly');
  const [trialDays, setTrialDays]         = useState(14);     // pour grantType='trial'
  const [duration, setDuration]           = useState('lifetime'); // 'lifetime' | 'limited' (gift)
  const [expires, setExpires]             = useState(''); // YYYY-MM-DD si duration='limited'
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
    // Calcul de expires_at selon le type d'octroi.
    let expiresAtIso = null;
    if (grantType === 'trial') {
      const days = parseInt(trialDays, 10);
      if (!days || days < 1 || days > 365) {
        setErr('Durée d\'essai invalide (1 à 365 jours).');
        return;
      }
      const d = new Date();
      d.setDate(d.getDate() + days);
      d.setUTCHours(23, 59, 59, 999);
      expiresAtIso = d.toISOString();
    } else if (duration === 'limited') {
      if (!expires) {
        setErr('Sélectionnez une date d\'expiration ou choisissez « À vie ».');
        return;
      }
      expiresAtIso = new Date(expires + 'T23:59:59Z').toISOString();
    } // sinon grantType='gift' + duration='lifetime' -> null = à vie

    setBusy(true);
    setErr(null);
    try {
      await grantMerchantSubscription(merchantId, {
        plan, period,
        expires_at:    expiresAtIso,
        reason:        reason.trim(),
        cancel_stripe: cancelStripe,
      });
      setForm(false);
      setReason('');
      setExpires('');
      setDuration('lifetime');
      setTrialDays(14);
      setGrantType('trial');
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
  // Heuristique : un grant avec expires_at <= 90 jours apres granted_at est
  // un essai gratuit. Sinon (lifetime ou date longue) : plan offert.
  const isTrialGrant = grant && grant.expires_at && grant.granted_at &&
    (new Date(grant.expires_at).getTime() - new Date(grant.granted_at).getTime())
      <= 90 * 24 * 3600 * 1000;

  return (
    <section className="card">
      <div className="card-head"><h2 className="card-title">Abonnement</h2></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {err && <p style={errStyle}>{err}</p>}

        {/* État unifié — plan + source + Stripe details fusionnés */}
        <div style={infoBlock}>
          <p style={lbl}>Plan actif du marchand</p>
          {data?.effective?.plan ? (
            <>
              {/* Ligne 1 : plan + periode (si dispo) + statut/source en badge */}
              <p style={val}>
                <strong>{labelPlan(data.effective.plan)}</strong>
                {(data.effective.source === 'stripe' && stripe.period) && (
                  <span style={{ color: '#374151', fontWeight: 400, marginLeft: 6 }}>
                    · {stripe.period === 'yearly' ? 'Annuel' : 'Mensuel'}
                  </span>
                )}
                {(data.effective.source === 'admin_grant' && data?.admin_grant?.period) && (
                  <span style={{ color: '#374151', fontWeight: 400, marginLeft: 6 }}>
                    · {data.admin_grant.period === 'yearly' ? 'Annuel' : 'Mensuel'}
                  </span>
                )}
                {data.effective.source === 'stripe' && stripe.status && (
                  <span style={statusBadge(stripe.status)}>{stripe.status}</span>
                )}
                {data.effective.source === 'admin_grant' && (
                  <span style={{
                    marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 99,
                    background: '#1e3a8a', color: '#fff', fontWeight: 500,
                  }}>
                    {isTrialGrant ? 'essai admin' : 'gratuit admin'}
                  </span>
                )}
              </p>
              {/* Ligne 2 : source en clair */}
              <p style={smallMute}>
                Source : {sourceLabel(data.effective.source)}
              </p>
              {/* Ligne 3 : prochaine echeance ou expiration octroi */}
              {data.effective.source === 'stripe' && stripe.current_period_end && (
                <p style={smallMute}>
                  {stripe.cancel_at_period_end
                    ? `Annulation programmée le ${formatDate(stripe.current_period_end)}.`
                    : `Prochain prélèvement le ${formatDate(stripe.current_period_end)}.`}
                </p>
              )}
              {data.effective.source === 'admin_grant' && (
                <p style={smallMute}>
                  {data.admin_grant?.expires_at
                    ? `Bascule auto sur Découverte le ${formatDate(data.admin_grant.expires_at)}.`
                    : 'Aucune expiration — gratuit illimité jusqu\'à révocation.'}
                </p>
              )}
              {/* Ligne 4 : ID Stripe (debug / support) */}
              {stripe.subscription_id && (
                <p style={{ ...smallMute, fontFamily: 'monospace', fontSize: 11 }}>
                  ID Stripe : {stripe.subscription_id}
                </p>
              )}
              {/* Ligne 5 : si octroi admin actif AVEC sub Stripe en parallele -> alerte double-billing potentiel */}
              {data.effective.source === 'admin_grant' && stripe.subscription_id
                && ['active','trialing','past_due'].includes(stripe.status) && (
                <p style={{
                  marginTop: 8, padding: '6px 10px', borderRadius: 6,
                  background: '#fffbeb', border: '1px solid #fde68a',
                  fontSize: 12, color: '#92400e',
                }}>
                  ⚠ Sub Stripe encore active en parallèle de l'octroi : risque de
                  double-billing. Annulez la sub Stripe manuellement si nécessaire.
                </p>
              )}
            </>
          ) : (
            <p style={smallMute}>Plan Découverte (gratuit, fonctions limitées).</p>
          )}
        </div>

        {/* Octroi superadmin */}
        <div style={{
          ...infoBlock,
          background: grantActive ? '#ecfdf5' : '#f9f9fb',
          borderColor: grantActive ? '#a7f3d0' : '#e5e7eb',
        }}>
          <p style={lbl}>
            {isTrialGrant ? 'Essai gratuit en cours' : 'Octroi superadmin (plan gratuit)'}
          </p>
          {grantActive ? (
            <>
              <p style={val}>
                <strong style={{ color: '#10b981' }}>
                  {labelPlan(grant.plan)} · {grant.period === 'yearly' ? 'Annuel' : 'Mensuel'} (gratuit)
                </strong>
                {!grant.expires_at && (
                  <span style={{
                    marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 99,
                    background: '#1e3a8a', color: '#fff', fontWeight: 600,
                    letterSpacing: 0.4, textTransform: 'uppercase',
                  }}>À vie</span>
                )}
                {isTrialGrant && (
                  <span style={{
                    marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 99,
                    background: '#1e40af', color: '#fff', fontWeight: 600,
                    letterSpacing: 0.4, textTransform: 'uppercase',
                  }}>Essai</span>
                )}
              </p>
              <p style={smallMute}>
                Octroyé le {formatDate(grant.granted_at)} par {grant.granted_by_email || '—'}
              </p>
              <p style={smallMute}>
                {grant.expires_at
                  ? `Expire le ${formatDate(grant.expires_at)} (durée limitée).`
                  : 'Aucune expiration — accès gratuit illimité jusqu\'à révocation manuelle.'}
              </p>
              {grant.reason && (
                <p style={smallMute}><em>« {grant.reason} »</em></p>
              )}
              <button onClick={handleRevoke} disabled={busy}
                      style={{ ...btnDanger, marginTop: 10 }}>
                {busy ? '…'
                      : (isTrialGrant
                          ? 'Retirer l\'essai gratuit (basculer sur Découverte)'
                          : 'Révoquer l\'octroi (réactiver paiement Stripe)')}
              </button>
            </>
          ) : (
            <>
              <p style={smallMute}>Aucun octroi en cours.</p>
              {!showForm && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => { setGrantType('trial'); setForm(true); }}
                          style={btnPrimary}>
                    Donner un essai gratuit
                  </button>
                  <button onClick={() => { setGrantType('gift'); setForm(true); }}
                          style={btnGhost}>
                    Offrir un plan gratuit (long / à vie)
                  </button>
                </div>
              )}
              {showForm && (
                <form onSubmit={handleGrant} style={{ marginTop: 12 }}>
                  {/* Toggle type d'octroi */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <label style={radioCard(grantType === 'trial')}>
                      <input type="radio" name="grantType" value="trial"
                             checked={grantType === 'trial'}
                             onChange={() => setGrantType('trial')}
                             style={{ marginRight: 8 }}/>
                      <span>
                        <strong>Essai gratuit</strong>
                        <span style={{ display: 'block', fontSize: 11, color: '#888', marginTop: 2 }}>
                          Durée courte (jours), bascule auto sur Découverte ensuite
                        </span>
                      </span>
                    </label>
                    <label style={radioCard(grantType === 'gift')}>
                      <input type="radio" name="grantType" value="gift"
                             checked={grantType === 'gift'}
                             onChange={() => setGrantType('gift')}
                             style={{ marginRight: 8 }}/>
                      <span>
                        <strong>Plan offert</strong>
                        <span style={{ display: 'block', fontSize: 11, color: '#888', marginTop: 2 }}>
                          Long terme : à vie ou jusqu'à une date personnalisée
                        </span>
                      </span>
                    </label>
                  </div>

                  <div style={formGrid}>
                    <label style={lblForm}>
                      Plan
                      <select value={plan} onChange={e => setPlan(e.target.value)} style={input}>
                        <option value="essentiel">Essentiel (24 €/mois)</option>
                        <option value="equipe">Équipe (49 €/mois) — toutes les fonctions</option>
                      </select>
                    </label>
                    <label style={lblForm}>
                      Période d'affichage
                      <select value={period} onChange={e => setPeriod(e.target.value)} style={input}>
                        <option value="monthly">Mensuel</option>
                        <option value="yearly">Annuel</option>
                      </select>
                    </label>
                  </div>

                  {/* Durée — diffère selon type d'octroi */}
                  {grantType === 'trial' ? (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ ...lblForm, marginBottom: 6 }}>Durée de l'essai</p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {[7, 14, 30, 60, 90].map(n => (
                          <button key={n} type="button"
                                  onClick={() => setTrialDays(n)}
                                  style={presetBtn(trialDays === n)}>
                            {n} jours
                          </button>
                        ))}
                        <span style={{ fontSize: 12, color: '#888', margin: '0 6px' }}>ou</span>
                        <input type="number" min={1} max={365}
                               value={trialDays}
                               onChange={e => setTrialDays(e.target.value)}
                               style={{ ...input, width: 80, padding: '6px 8px' }}/>
                        <span style={{ fontSize: 12, color: '#444' }}>jours</span>
                      </div>
                      <p style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                        {`Expiration prévue : ${formatDateTrial(trialDays)}.`}
                      </p>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ ...lblForm, marginBottom: 6 }}>Durée de la gratuité</p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <label style={radioCard(duration === 'lifetime')}>
                          <input type="radio" name="duration" value="lifetime"
                                 checked={duration === 'lifetime'}
                                 onChange={() => setDuration('lifetime')}
                                 style={{ marginRight: 8 }}/>
                          <span>
                            <strong>À vie</strong>
                            <span style={{ display: 'block', fontSize: 11, color: '#888', marginTop: 2 }}>
                              Aucune expiration — gratuit illimité jusqu'à révocation manuelle
                            </span>
                          </span>
                        </label>
                        <label style={radioCard(duration === 'limited')}>
                          <input type="radio" name="duration" value="limited"
                                 checked={duration === 'limited'}
                                 onChange={() => setDuration('limited')}
                                 style={{ marginRight: 8 }}/>
                          <span>
                            <strong>Jusqu'à une date</strong>
                            <span style={{ display: 'block', fontSize: 11, color: '#888', marginTop: 2 }}>
                              Bascule auto sur Stripe / Découverte après cette date
                            </span>
                          </span>
                        </label>
                      </div>
                      {duration === 'limited' && (
                        <input type="date" value={expires}
                               onChange={e => setExpires(e.target.value)}
                               style={{ ...input, marginTop: 8, maxWidth: 200 }}
                               min={new Date().toISOString().slice(0, 10)}
                               required/>
                      )}
                    </div>
                  )}

                  <label style={{ ...lblForm, display: 'block', marginTop: 12 }}>
                    Motif (visible dans l'audit log)
                    <textarea value={reason} onChange={e => setReason(e.target.value)}
                              rows={2} maxLength={500} style={input}
                              placeholder={grantType === 'trial'
                                ? 'Ex: Essai prolongé pour démo commerciale, conversion difficile…'
                                : 'Ex: Partenariat Q3 2026, beta-testeur, gestion litige…'}/>
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
                      {busy ? 'Octroi en cours…'
                            : (grantType === 'trial'
                                ? `Donner ${trialDays} jours d'essai`
                                : 'Confirmer l\'octroi gratuit')}
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
function radioCard(active) {
  return {
    flex: '1 1 200px',
    display: 'flex', alignItems: 'flex-start',
    padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${active ? '#1e40af' : '#d1d5db'}`,
    background:  active ? '#eff6ff' : '#fff',
    cursor: 'pointer', fontSize: 13, color: '#111827',
  };
}
function presetBtn(active) {
  return {
    padding: '6px 12px', fontSize: 12, fontWeight: 500,
    background: active ? '#111827' : '#fff',
    color:      active ? '#fff'    : '#374151',
    border:     `1px solid ${active ? '#111827' : '#d1d5db'}`,
    borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
  };
}
function formatDateTrial(days) {
  const n = parseInt(days, 10) || 0;
  if (n < 1) return '—';
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
