// MerchantSubscriptionSection.jsx — gestion de l'abonnement d'un marchand
// par le superadmin : voir l'etat (Stripe + grant), octroyer un plan
// gratuit, le revoquer.
import { useEffect, useState } from 'react';
import {
  getMerchantSubscription, grantMerchantSubscription,
  revokeMerchantSubscriptionGrant, updateMerchantCommission,
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

  // Modal de transition (retirer/modifier l'octroi).
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [tTarget, setTTarget]               = useState('decouverte'); // decouverte|essentiel_monthly|...
  const [tWhen, setTWhen]                   = useState('today');     // today|scheduled
  const [tDate, setTDate]                   = useState('');
  const [tReason, setTReason]               = useState('');

  // Commission FlowIA — editable par superadmin.
  const [commissionEdit, setCommissionEdit] = useState(false);
  const [commissionRate, setCommissionRate] = useState('');
  const [busyCommission, setBusyCommission] = useState(false);

  const handleCommissionSave = async () => {
    const rate = parseFloat(commissionRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 30) {
      setErr('Taux invalide (0 à 30%).');
      return;
    }
    setBusyCommission(true); setErr(null);
    try {
      await updateMerchantCommission(merchantId, rate);
      setCommissionEdit(false);
      await load();
    } catch (e) { setErr(e.message); }
    finally     { setBusyCommission(false); }
  };

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

  // Ouvre le modal de transition au lieu d'un confirm brutal. L'admin choisit
  // sur quel plan basculer le marchand et quand (immediat ou programme).
  const handleRevoke = () => {
    setTTarget('decouverte');
    setTWhen('today');
    setTDate('');
    setTReason('');
    setTransitionOpen(true);
  };

  // Applique la transition selon les choix admin.
  const submitTransition = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (tTarget === 'decouverte') {
        if (tWhen === 'today') {
          // Cas simple : retrait immediat -> DELETE le grant.
          await revokeMerchantSubscriptionGrant(merchantId);
        } else {
          // Programmer le retrait : on garde le grant courant (meme plan/period)
          // mais on met expires_at sur la date choisie. A cette date, le grant
          // expire automatiquement et le marchand bascule sur Decouverte.
          if (!tDate) { setErr("Choisissez une date programmée."); setBusy(false); return; }
          if (!grant?.plan)   { setErr("Aucun octroi à programmer."); setBusy(false); return; }
          await grantMerchantSubscription(merchantId, {
            plan:          grant.plan,
            period:        grant.period || 'monthly',
            expires_at:    new Date(tDate + 'T23:59:59Z').toISOString(),
            reason:        tReason.trim() || `Retrait programmé le ${tDate}`,
            cancel_stripe: false,  // pas besoin, sub Stripe deja annulee/inexistante
          });
        }
      } else {
        // Remplacement par un autre plan offert (Essentiel ou Equipe).
        if (tWhen !== 'today') {
          setErr("La programmation n'est disponible que pour la bascule sur Découverte.");
          setBusy(false); return;
        }
        const [newPlan, newPeriod] = tTarget.split('_');
        await grantMerchantSubscription(merchantId, {
          plan:          newPlan,
          period:        newPeriod,
          expires_at:    null,  // par defaut a vie pour ce remplacement (admin peut ensuite editer)
          reason:        tReason.trim() || `Bascule admin vers ${newPlan} ${newPeriod}`,
          cancel_stripe: false,
        });
      }
      setTransitionOpen(false);
      await load();
    } catch (e) { setErr(e.message); }
    finally     { setBusy(false); }
  };

  if (loading) return (
    <section className="card">
      <div className="card-head"><h2 className="card-title">Abonnement</h2></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={skel(140, 12)}/>
        <div style={skel(220, 18)}/>
        <div style={skel(180, 12)}/>
      </div>
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

  // Status colors via theme vars (dark/light safe).
  const stripeStatusColor =
      stripe.status === 'active'    ? 'var(--success)'
    : stripe.status === 'trialing'  ? 'var(--info)'
    : stripe.status === 'past_due'  ? 'var(--warning)'
    : stripe.status === 'canceled'  ? 'var(--error)'
    : 'var(--fg-muted)';
  const planSourceColor =
      data?.effective?.source === 'admin_grant' ? 'var(--info)'
    : data?.effective?.source === 'stripe'      ? stripeStatusColor
    : 'var(--fg-muted)';

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Abonnement</h2>
        {data?.effective?.plan && (
          <span style={metaText}>
            {sourceLabel(data.effective.source)}
          </span>
        )}
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {err && (
          <div style={alertStyle('error')}>{err}</div>
        )}

        {/* ── PANEL 1 : Plan actif du marchand ─────────────────────────── */}
        <div style={panelStyle}>
          <div style={panelHeader}>
            <span style={dot(planSourceColor)}/>
            <span style={panelLabel}>{"Plan actif"}</span>
          </div>
          {data?.effective?.plan ? (
            <>
              <div style={planTitleRow}>
                <span style={planNameStyle}>{labelPlan(data.effective.plan)}</span>
                {(data.effective.source === 'stripe' && stripe.period) && (
                  <span style={planSubtle}>
                    {stripe.period === 'yearly' ? 'Annuel' : 'Mensuel'}
                  </span>
                )}
                {(data.effective.source === 'admin_grant' && data?.admin_grant?.period) && (
                  <span style={planSubtle}>
                    {data.admin_grant.period === 'yearly' ? 'Annuel' : 'Mensuel'}
                  </span>
                )}
                {data.effective.source === 'stripe' && stripe.status && (
                  <span style={pill(stripeStatusColor)}>{stripe.status}</span>
                )}
                {data.effective.source === 'admin_grant' && (
                  <span style={pill('var(--info)', 'solid')}>
                    {isTrialGrant ? 'essai admin' : 'gratuit admin'}
                  </span>
                )}
              </div>

              <div style={panelDetails}>
                {data.effective.source === 'stripe' && stripe.current_period_end && (
                  <div style={detailRow}>
                    <span style={detailKey}>
                      {stripe.cancel_at_period_end ? "Annulation prévue" : "Prochain prélèvement"}
                    </span>
                    <span style={detailVal}>{formatDate(stripe.current_period_end)}</span>
                  </div>
                )}
                {data.effective.source === 'admin_grant' && (
                  <div style={detailRow}>
                    <span style={detailKey}>
                      {data.admin_grant?.expires_at ? "Bascule sur Découverte" : "Expiration"}
                    </span>
                    <span style={detailVal}>
                      {data.admin_grant?.expires_at
                        ? formatDate(data.admin_grant.expires_at)
                        : "Aucune (gratuit illimité)"}
                    </span>
                  </div>
                )}
                {stripe.subscription_id && (
                  <div style={detailRow}>
                    <span style={detailKey}>{"ID Stripe"}</span>
                    <span style={{ ...detailVal, fontFamily: 'monospace', fontSize: 11 }}>
                      {stripe.subscription_id}
                    </span>
                  </div>
                )}
              </div>

              {/* Alerte double-billing */}
              {data.effective.source === 'admin_grant' && stripe.subscription_id
                && ['active','trialing','past_due'].includes(stripe.status) && (
                <div style={alertStyle('warning')}>
                  {"Sub Stripe encore active en parallèle de l'octroi : risque de double-billing. Annulez la sub Stripe manuellement si nécessaire."}
                </div>
              )}
            </>
          ) : (
            <p style={emptyText}>{"Plan Découverte (gratuit, fonctionnalités limitées)."}</p>
          )}
        </div>

        {/* ── PANEL 2 : Octroi superadmin ──────────────────────────────── */}
        <div style={grantActive ? panelStyleHighlight : panelStyle}>
          <div style={panelHeader}>
            <span style={dot(grantActive ? 'var(--success)' : 'var(--fg-muted)')}/>
            <span style={panelLabel}>
              {grantActive
                ? (isTrialGrant ? "Essai gratuit en cours" : "Plan offert actif")
                : "Octroi superadmin"}
            </span>
            {grantActive && !grant.expires_at && (
              <span style={pill('var(--info)', 'solid')}>À vie</span>
            )}
            {grantActive && isTrialGrant && (
              <span style={pill('var(--info)', 'solid')}>Essai</span>
            )}
          </div>

          {grantActive ? (
            <>
              <div style={planTitleRow}>
                <span style={{ ...planNameStyle, color: 'var(--success)' }}>
                  {labelPlan(grant.plan)}
                </span>
                <span style={planSubtle}>
                  {grant.period === 'yearly' ? 'Annuel' : 'Mensuel'}
                </span>
                <span style={planSubtle}>· gratuit</span>
              </div>

              <div style={panelDetails}>
                <div style={detailRow}>
                  <span style={detailKey}>{"Octroyé le"}</span>
                  <span style={detailVal}>{formatDate(grant.granted_at)}</span>
                </div>
                <div style={detailRow}>
                  <span style={detailKey}>{"Par"}</span>
                  <span style={detailVal}>{grant.granted_by_email || '—'}</span>
                </div>
                <div style={detailRow}>
                  <span style={detailKey}>{"Expiration"}</span>
                  <span style={detailVal}>
                    {grant.expires_at
                      ? formatDate(grant.expires_at)
                      : "Aucune — révocation manuelle"}
                  </span>
                </div>
                {grant.reason && (
                  <div style={detailRow}>
                    <span style={detailKey}>{"Motif"}</span>
                    <span style={{ ...detailVal, fontStyle: 'italic' }}>{grant.reason}</span>
                  </div>
                )}
              </div>

              <button onClick={handleRevoke} disabled={busy}
                      style={{ ...btnDanger, marginTop: 14 }}>
                {busy ? "…"
                      : (isTrialGrant
                          ? "Retirer l'essai (bascule sur Découverte)"
                          : "Révoquer l'octroi (réactiver paiement Stripe)")}
              </button>
            </>
          ) : (
            <>
              <p style={emptyText}>{"Aucun octroi en cours pour ce marchand."}</p>
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
                        <option value="essentiel">Essentiel (2 400 DA/mois)</option>
                        <option value="equipe">Équipe (4 900 DA/mois) — toutes les fonctions</option>
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

      {/* ── PANEL Stripe Connect + Commission FlowIA ────────────────── */}
      <div className="card-body" style={{ marginTop: 14 }}>
        <div style={panelStyle}>
          <div style={panelHeader}>
            <span style={dot(data?.connect?.charges_enabled ? 'var(--success)' : 'var(--fg-muted)')}/>
            <span style={panelLabel}>{"Stripe Connect (paiements RDV)"}</span>
            {data?.connect?.charges_enabled && (
              <span style={pill('var(--success)')}>connecté · charges OK</span>
            )}
            {data?.connect?.account_id && !data?.connect?.charges_enabled && (
              <span style={pill('var(--warning)')}>onboarding incomplet</span>
            )}
            {!data?.connect?.account_id && (
              <span style={pill('var(--fg-muted)')}>non connecté</span>
            )}
          </div>

          <div style={panelDetails}>
            <div style={detailRow}>
              <span style={detailKey}>{"Compte Stripe Connect"}</span>
              <span style={{ ...detailVal, fontFamily: 'monospace', fontSize: 11 }}>
                {data?.connect?.account_id || '—'}
              </span>
            </div>
            <div style={detailRow}>
              <span style={detailKey}>{"Commission Salon DZ"}</span>
              <span style={detailVal}>
                {commissionEdit ? (
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <input type="number" step="0.5" min="0" max="30"
                           value={commissionRate}
                           onChange={e => setCommissionRate(e.target.value)}
                           style={{ ...input, width: 80, padding: '4px 8px',
                                    fontSize: 13 }}
                           autoFocus/>
                    <span style={{ color: 'var(--fg-muted)' }}>%</span>
                    <button onClick={handleCommissionSave} disabled={busyCommission}
                            style={{ ...btnPrimary, padding: '5px 10px', fontSize: 11 }}>
                      {busyCommission ? '…' : 'OK'}
                    </button>
                    <button onClick={() => { setCommissionEdit(false); setErr(null); }}
                            disabled={busyCommission}
                            style={{ ...btnGhost, padding: '5px 10px', fontSize: 11 }}>
                      Annuler
                    </button>
                  </span>
                ) : (
                  <span>
                    <strong>{(parseFloat(data?.connect?.commission_rate) || 0).toFixed(1)} %</strong>
                    <button onClick={() => {
                              setCommissionRate(String(data?.connect?.commission_rate ?? 0));
                              setCommissionEdit(true);
                            }}
                            style={{ ...btnGhost, padding: '4px 10px', marginLeft: 8,
                                     fontSize: 11 }}>
                      Modifier
                    </button>
                  </span>
                )}
              </span>
            </div>
            {commissionEdit && (
              <div style={{ ...detailRow, gridColumn: '1 / -1' }}>
                <span/>
                <span style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                  {"Pourcentage prélevé par Salon DZ sur chaque paiement de RDV (entre 0 et 30 %). Effet immédiat sur les nouveaux paiements."}
                </span>
              </div>
            )}
          </div>

          {!data?.connect?.account_id && (
            <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
              {"Le marchand n'a pas encore connecté son compte Stripe. Tant qu'il n'aura pas finalisé son onboarding (depuis ses Réglages → Paiements), aucun paiement ne pourra être encaissé sur ses RDV."}
            </p>
          )}
        </div>
      </div>

      {/* Modal de transition : retirer/modifier l'octroi en choisissant le
          plan cible et la date d'effet (immediat ou programme). */}
      {transitionOpen && (
        <div onClick={() => !busy && setTransitionOpen(false)}
             style={{ position: 'fixed', inset: 0, zIndex: 60,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 16, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()}
               style={{ width: '100%', maxWidth: 520, maxHeight: '90vh',
                        overflowY: 'auto',
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 12, padding: 24,
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>
              {"Retirer ou modifier l'octroi"}
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--fg-muted)' }}>
              {"Choisissez sur quel plan placer le marchand et quand l'effet prend place."}
            </p>

            {err && <div style={alertStyle('error')}>{err}</div>}

            {/* Plan cible */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ ...lblForm, marginBottom: 8 }}>{"Plan cible après transition"}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { v: 'decouverte',         label: 'Découverte',          sub: 'gratuit, fonctionnalités limitées' },
                  { v: 'essentiel_monthly',  label: 'Essentiel mensuel',   sub: 'offert (2 400 DA/mois) — à vie par défaut' },
                  { v: 'essentiel_yearly',   label: 'Essentiel annuel',    sub: 'offert (24 000 DA/an) — à vie par défaut' },
                  { v: 'equipe_monthly',     label: 'Équipe mensuel',      sub: 'offert (4 900 DA/mois) — toutes fonctions' },
                  { v: 'equipe_yearly',      label: 'Équipe annuel',       sub: 'offert (49 000 DA/an) — toutes fonctions' },
                ].map(opt => (
                  <label key={opt.v} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '10px 12px', borderRadius: 8,
                    border: tTarget === opt.v
                      ? '1px solid color-mix(in srgb, var(--info) 50%, var(--border))'
                      : '1px solid var(--border)',
                    background: tTarget === opt.v
                      ? 'color-mix(in srgb, var(--info) 8%, var(--surface))'
                      : 'var(--surface)',
                    cursor: 'pointer',
                  }}>
                    <input type="radio" name="tTarget" value={opt.v}
                           checked={tTarget === opt.v}
                           onChange={() => setTTarget(opt.v)}/>
                    <span>
                      <strong style={{ fontSize: 13, color: 'var(--fg)' }}>{opt.label}</strong>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
                        {opt.sub}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Date d'effet */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ ...lblForm, marginBottom: 8 }}>{"Date d'effet"}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ ...radioCard(tWhen === 'today') }}>
                  <input type="radio" name="tWhen" value="today"
                         checked={tWhen === 'today'}
                         onChange={() => setTWhen('today')}
                         style={{ marginRight: 8 }}/>
                  <span>
                    <strong>Aujourd'hui</strong>
                    <span style={{ display: 'block', fontSize: 11, color: '#888', marginTop: 2 }}>
                      Effet immédiat
                    </span>
                  </span>
                </label>
                <label style={{
                  ...radioCard(tWhen === 'scheduled'),
                  opacity: tTarget !== 'decouverte' ? 0.5 : 1,
                  cursor: tTarget !== 'decouverte' ? 'not-allowed' : 'pointer',
                }}>
                  <input type="radio" name="tWhen" value="scheduled"
                         checked={tWhen === 'scheduled'}
                         onChange={() => setTWhen('scheduled')}
                         disabled={tTarget !== 'decouverte'}
                         style={{ marginRight: 8 }}/>
                  <span>
                    <strong>Programmer une date</strong>
                    <span style={{ display: 'block', fontSize: 11, color: '#888', marginTop: 2 }}>
                      {tTarget === 'decouverte'
                        ? 'Garder accès jusqu\'à cette date, puis bascule auto'
                        : 'Disponible uniquement vers Découverte'}
                    </span>
                  </span>
                </label>
              </div>
              {tWhen === 'scheduled' && tTarget === 'decouverte' && (
                <input type="date" value={tDate} onChange={e => setTDate(e.target.value)}
                       min={new Date().toISOString().slice(0, 10)}
                       style={{ ...input, marginTop: 8, maxWidth: 200 }}/>
              )}
            </div>

            {/* Motif */}
            <label style={{ ...lblForm, display: 'block', marginBottom: 14 }}>
              {"Motif (optionnel — apparaît dans l'audit log)"}
              <textarea value={tReason} onChange={e => setTReason(e.target.value)}
                        rows={2} maxLength={300} style={input}
                        placeholder="Ex: Période d'essai terminée, démo conclue, paiement attendu…"/>
            </label>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setTransitionOpen(false)} disabled={busy}
                      style={{ ...btnGhost, flex: 1 }}>
                Annuler
              </button>
              <button onClick={submitTransition} disabled={busy}
                      style={{ ...btnPrimary, flex: 1 }}>
                {busy ? 'En cours…' : confirmLabel(tTarget, tWhen)}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Calcule le libelle du bouton de confirmation selon les choix admin.
function confirmLabel(target, when) {
  if (target === 'decouverte') {
    return when === 'today'
      ? 'Retirer maintenant'
      : 'Programmer le retrait';
  }
  const [plan] = target.split('_');
  return `Basculer vers ${plan === 'essentiel' ? 'Essentiel' : 'Équipe'}`;
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
// ─── Helpers UI (theme-aware via CSS vars du panel admin) ─────────────────

const metaText = {
  fontSize: 12, color: 'var(--fg-muted)',
};
const panelStyle = {
  padding: 16, borderRadius: 10,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  display: 'flex', flexDirection: 'column', gap: 12,
};
const panelStyleHighlight = {
  ...panelStyle,
  // Halo subtil vert pour octroi actif (color-mix safe sur navigateurs récents).
  borderColor: 'color-mix(in srgb, var(--success) 35%, var(--border))',
  background: 'color-mix(in srgb, var(--success) 4%, var(--surface-2))',
};
const panelHeader = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
};
const panelLabel = {
  fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)',
  textTransform: 'uppercase', letterSpacing: 0.6,
};
const planTitleRow = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
};
const planNameStyle = {
  fontSize: 18, fontWeight: 600, color: 'var(--fg)',
  letterSpacing: '-0.01em',
};
const planSubtle = {
  fontSize: 13, color: 'var(--fg-muted)',
};
const panelDetails = {
  display: 'grid', gap: 6,
  gridTemplateColumns: 'minmax(140px, max-content) 1fr',
  alignItems: 'baseline',
  marginTop: 4,
};
const detailRow = {
  display: 'contents',
};
const detailKey = {
  fontSize: 12, color: 'var(--fg-muted)',
};
const detailVal = {
  fontSize: 13, color: 'var(--fg)', fontWeight: 500,
};
const emptyText = {
  fontSize: 13, color: 'var(--fg-muted)', margin: 0,
};

// Petit point colore (status indicator).
function dot(color) {
  return {
    width: 8, height: 8, borderRadius: 99,
    background: color, flexShrink: 0,
  };
}

// Pill : variant 'tint' (defaut, fond translucide) ou 'solid' (fond plein, texte clair).
function pill(color, variant = 'tint') {
  if (variant === 'solid') {
    return {
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      background: color, color: '#fff',
      letterSpacing: 0.4, textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    };
  }
  return {
    fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99,
    color, background: `color-mix(in srgb, ${color} 15%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
    whiteSpace: 'nowrap',
  };
}

// Alerte info (warning / error).
function alertStyle(kind) {
  const color = kind === 'error' ? 'var(--error)'
              : kind === 'warning' ? 'var(--warning)'
              : 'var(--info)';
  return {
    padding: '10px 12px', borderRadius: 8,
    background: `color-mix(in srgb, ${color} 10%, transparent)`,
    border:     `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
    color,
    fontSize: 13, lineHeight: 1.5, margin: 0,
  };
}

// Skeleton statique (chargement).
function skel(width, height) {
  return {
    width, height, borderRadius: 6,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
  };
}

// Form helpers.
const formGrid = {
  display: 'grid', gap: 10,
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
};
const lblForm = {
  display: 'flex', flexDirection: 'column', gap: 6,
  fontSize: 12, fontWeight: 500, color: 'var(--fg)',
};
const input = {
  padding: '9px 11px', fontSize: 13, borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  fontFamily: 'inherit', outline: 'none',
};
const btnPrimary = {
  padding: '9px 16px', fontSize: 13, fontWeight: 600,
  background: 'var(--fg)', color: 'var(--bg)',
  border: 'none', borderRadius: 7, cursor: 'pointer',
  fontFamily: 'inherit',
};
const btnGhost = {
  padding: '9px 16px', fontSize: 13, fontWeight: 500,
  background: 'transparent', color: 'var(--fg)',
  border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer',
  fontFamily: 'inherit',
};
const btnDanger = {
  padding: '9px 16px', fontSize: 13, fontWeight: 500,
  background: 'transparent', color: 'var(--error)',
  border: '1px solid color-mix(in srgb, var(--error) 35%, transparent)',
  borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
};
function radioCard(active) {
  return {
    flex: '1 1 220px',
    display: 'flex', alignItems: 'flex-start', gap: 8,
    padding: '12px 14px', borderRadius: 8,
    border: active
      ? '1px solid color-mix(in srgb, var(--info) 50%, var(--border))'
      : '1px solid var(--border)',
    background: active
      ? 'color-mix(in srgb, var(--info) 8%, var(--surface))'
      : 'var(--surface)',
    cursor: 'pointer', fontSize: 13, color: 'var(--fg)',
    transition: 'border-color 0.15s, background 0.15s',
  };
}
function presetBtn(active) {
  return {
    padding: '7px 13px', fontSize: 12, fontWeight: 500,
    background: active ? 'var(--fg)' : 'var(--surface)',
    color:      active ? 'var(--bg)' : 'var(--fg)',
    border:     active ? '1px solid var(--fg)' : '1px solid var(--border)',
    borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'background 0.15s, border-color 0.15s',
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
