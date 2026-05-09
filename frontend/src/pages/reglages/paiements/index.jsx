// Réglages > Paiements en ligne — Stripe Connect onboarding marchand.
// Permet au commerçant de connecter son propre compte Stripe pour recevoir
// l'argent des réservations directement. Pattern Direct Charges via
// Controller API (pas OAuth Standard, voir backend/routes/stripe-connect.js).
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../../hooks/useTheme';
import { Toast, useToast, Confirm } from '../../../components/UI';
import { PageHeader } from '../shared';
import { connectApi, bookingApi } from '../../../utils/api';

export default function Paiements() {
  const { theme: t } = useTheme();
  const [toast, showToast] = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(null); // 'onboard' | 'dashboard' | 'disconnect'
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = async () => {
    try {
      const d = await connectApi.getAccount();
      setData(d);
    } catch (e) {
      showToast(e?.message || 'Erreur de chargement.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Lecture du retour Stripe-hosted onboarding (?stripe_connect=return|refresh).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('stripe_connect');
    if (status === 'return') {
      showToast('Vérification du statut de votre compte Stripe…', 'ok');
      navigate('/reglages/paiements', { replace: true });
      // Refresh des donnees apres le retour de Stripe.
      setTimeout(load, 800);
    } else if (status === 'refresh') {
      showToast('Veuillez relancer l\'onboarding pour le finaliser.', 'info');
      navigate('/reglages/paiements', { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOnboard = async () => {
    setBusy('onboard');
    try {
      const { url } = await connectApi.onboard();
      if (url) window.location.href = url;
      else throw new Error('URL manquante');
    } catch (e) {
      showToast(e?.message || 'Erreur lors de la connexion.', 'error');
      setBusy(null);
    }
  };

  const handleDashboard = async () => {
    setBusy('dashboard');
    try {
      const { url } = await connectApi.dashboardLink();
      if (url) window.open(url, '_blank', 'noopener');
    } catch (e) {
      showToast(e?.message || 'Erreur ouverture dashboard.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = () => setConfirmDisconnect(true);
  const performDisconnect = async () => {
    setBusy('disconnect');
    try {
      await connectApi.disconnect();
      showToast('Compte Stripe déconnecté.', 'ok');
      await load();
    } catch (e) {
      showToast(e?.message || 'Erreur déconnexion.', 'error');
    } finally {
      setBusy(null);
    }
  };

  // ── Determine l'état pour le rendu : pas connecte / onboarding pending / connecte ──
  const status = !data?.connected         ? 'not_connected'
               : !data.charges_enabled    ? 'onboarding_pending'
               :                            'connected';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '18px 16px',
                  display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toast msg={toast?.msg} type={toast?.type}/>
      <Confirm
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={performDisconnect}
        title="Déconnecter votre compte Stripe ?"
        message="Les paiements en ligne sur vos réservations seront immédiatement désactivés. Vous pourrez reconnecter votre compte à tout moment."
        danger
        theme={t}/>
      <PageHeader backTo="/reglages" crumb="Réglages"
                  title="Paiements en ligne"
                  subtitle="Connectez votre compte Stripe pour recevoir l'argent de vos réservations"/>

      {loading ? (
        <SkeletonCard t={t}/>
      ) : (
        <>
          {/* État connect */}
          <section style={cardStyle(t)}>
            <div style={panelHeader}>
              <span style={dot(statusColor(status))}/>
              <span style={panelLabel(t)}>{"État de votre compte Stripe"}</span>
              <span style={pill(statusColor(status), statusBg(status))}>
                {statusLabel(status)}
              </span>
            </div>

            {status === 'not_connected' && (
              <>
                <p style={paragraph(t)}>
                  {"Connectez votre compte Stripe pour permettre à vos clients de payer leurs réservations en ligne. L'argent arrive directement sur votre compte Stripe (pas de transit par FlowIA)."}
                </p>
                <ul style={bulletList(t)}>
                  <li>{"Si vous n'avez pas encore de compte Stripe, vous pourrez le créer pendant l'onboarding."}</li>
                  <li>{"Stripe vous demandera vos infos professionnelles (nom, IBAN, justificatifs légaux)."}</li>
                  <li>{"Une fois connecté, vous pourrez encaisser des paiements en quelques minutes."}</li>
                </ul>
                <button onClick={handleOnboard} disabled={busy === 'onboard'}
                        style={btnPrimary(t, busy === 'onboard')}>
                  {busy === 'onboard' ? 'Redirection…' : 'Connecter mon compte Stripe'}
                </button>
              </>
            )}

            {status === 'onboarding_pending' && (
              <>
                <p style={paragraph(t)}>
                  {"Votre compte Stripe est créé mais l'onboarding n'est pas encore finalisé. Stripe a besoin d'informations supplémentaires avant que vous puissiez encaisser des paiements."}
                </p>
                {Array.isArray(data.requirements_due) && data.requirements_due.length > 0 && (
                  <div style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: '#fffbeb', border: '1px solid #fde68a',
                    margin: '10px 0',
                  }}>
                    <p style={{ fontSize: 11, color: '#92400e', fontWeight: 600,
                                margin: 0, marginBottom: 6,
                                textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {"Informations manquantes"}
                    </p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0,
                                 display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {data.requirements_due.slice(0, 6).map(r => (
                        <li key={r} style={{ fontSize: 12, color: '#78350f' }}>
                          • {prettyRequirement(r)}
                        </li>
                      ))}
                      {data.requirements_due.length > 6 && (
                        <li style={{ fontSize: 12, color: '#78350f' }}>
                          {`… et ${data.requirements_due.length - 6} autres`}
                        </li>
                      )}
                    </ul>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={handleOnboard} disabled={busy === 'onboard'}
                          style={btnPrimary(t, busy === 'onboard')}>
                    {busy === 'onboard' ? 'Redirection…' : 'Finaliser mon onboarding Stripe'}
                  </button>
                  <button onClick={handleDisconnect} disabled={busy === 'disconnect'}
                          style={btnDanger(t, busy === 'disconnect')}>
                    {busy === 'disconnect' ? '…' : 'Annuler la connexion'}
                  </button>
                </div>
              </>
            )}

            {status === 'connected' && (
              <>
                <p style={paragraph(t)}>
                  {"Votre compte Stripe est actif. Les paiements en ligne sur vos réservations sont opérationnels — l'argent arrive directement sur votre compte Stripe."}
                </p>
                <div style={detailsGrid}>
                  <div style={detailRow}>
                    <span style={detailKey(t)}>{"Compte Stripe"}</span>
                    <span style={{ ...detailVal(t), fontFamily: 'monospace', fontSize: 11 }}>
                      {data.account_id}
                    </span>
                  </div>
                  <div style={detailRow}>
                    <span style={detailKey(t)}>{"Email Stripe"}</span>
                    <span style={detailVal(t)}>{data.account_email || '—'}</span>
                  </div>
                  <div style={detailRow}>
                    <span style={detailKey(t)}>{"Encaissement"}</span>
                    <span style={detailVal(t)}>
                      {data.charges_enabled
                        ? <span style={{ color: '#10b981', fontWeight: 500 }}>Actif</span>
                        : <span style={{ color: '#92400e', fontWeight: 500 }}>Pas encore</span>}
                    </span>
                  </div>
                  <div style={detailRow}>
                    <span style={detailKey(t)}>{"Virements bancaires"}</span>
                    <span style={detailVal(t)}>
                      {data.payouts_enabled
                        ? <span style={{ color: '#10b981', fontWeight: 500 }}>Actifs</span>
                        : <span style={{ color: '#92400e', fontWeight: 500 }}>En attente</span>}
                    </span>
                  </div>
                  <div style={detailRow}>
                    <span style={detailKey(t)}>{"Commission FlowIA"}</span>
                    <span style={detailVal(t)}>
                      <strong>{(data.commission_rate || 0).toFixed(1)} %</strong>
                      <span style={{ color: t.muted, fontSize: 11, marginLeft: 6 }}>
                        sur chaque paiement
                      </span>
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap',
                              paddingTop: 14, borderTop: `1px solid ${t.separator}` }}>
                  <button onClick={handleDashboard} disabled={busy === 'dashboard'}
                          style={btnGhost(t, busy === 'dashboard')}>
                    {busy === 'dashboard' ? 'Ouverture…' : 'Ouvrir mon dashboard Stripe ↗'}
                  </button>
                  <button onClick={handleDisconnect} disabled={busy === 'disconnect'}
                          style={{ ...btnDanger(t, busy === 'disconnect'), marginLeft: 'auto' }}>
                    {busy === 'disconnect' ? '…' : 'Déconnecter mon compte Stripe'}
                  </button>
                </div>
              </>
            )}
          </section>

          {/* Configuration des paiements RDV (Phase 4) */}
          {status === 'connected' && (
            <PaymentConfigSection t={t} showToast={showToast}/>
          )}

          {/* Performances paiements en ligne (KPI 7/30/90j) */}
          {status === 'connected' && (
            <PerformancePaymentsSection t={t} showToast={showToast}/>
          )}

          {/* Politique annulation + delai escrow + reversements (visibles
              meme si Stripe pas encore connecte pour que le commercant
              voie ce qui l'attend). */}
          <CancellationPolicySection t={t} showToast={showToast}/>
          {status === 'connected' && (
            <EscrowPayoutsSection t={t} showToast={showToast}/>
          )}
        </>
      )}
    </div>
  );
}

// ─── Politique annulation + remboursement (Planity-like) ────────────────────
// Carte unique qui regroupe la politique d'annulation client. Le delai de
// reversement (escrow) est fixe a 3 jours par FlowIA -- non editable par
// le commercant (comme Planity Pro). Justification : (a) securite financiere
// (eviter qu'un commercant mette 0 jour et se retrouve a decouvert sur un
// refund), (b) simplicite produit, (c) coherence cross-merchants.
function CancellationPolicySection({ t, showToast }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [policyHours, setPolicyHours] = useState(2);
  const [origPolicy, setOrigPolicy] = useState(2);

  const load = async () => {
    setLoading(true);
    try {
      const r = await bookingApi.getSettings();
      const s = r?.settings || {};
      const pol = parseInt(s.cancellation_policy_hours);
      const safePol = Number.isFinite(pol) ? pol : 2;
      setPolicyHours(safePol); setOrigPolicy(safePol);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const dirty = policyHours !== origPolicy;

  const handleSave = async () => {
    setBusy(true);
    try {
      await bookingApi.saveSettings({
        cancellation_policy_hours: policyHours,
      });
      setOrigPolicy(policyHours);
      showToast('Politique enregistrée.', 'ok');
    } catch (e) {
      showToast(e.message || 'Erreur enregistrement.', 'error');
    } finally { setBusy(false); }
  };

  if (loading) return null;

  return (
    <section style={cardStyle(t)}>
      <div style={panelHeader}>
        <span style={dot('#6366f1')}/>
        <span style={panelLabel(t)}>{"Annulation et remboursement"}</span>
      </div>
      <p style={{ ...paragraph(t), marginBottom: 14 }}>
        {"Définissez à quel moment vos clients peuvent annuler en ligne avec remboursement intégral. Au-delà de ce délai, l'acompte est conservé."}
      </p>

      {/* Politique annulation */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ ...panelLabel(t), marginBottom: 8 }}>
          {"Annulation gratuite jusqu'à"}
        </p>
        <select value={policyHours}
                onChange={e => setPolicyHours(parseInt(e.target.value))}
                style={selectStyle(t)}>
          <option value={0}>{"À tout moment (remboursement intégral toujours)"}</option>
          <option value={1}>{"1 h avant le RDV"}</option>
          <option value={2}>{"2 h avant le RDV"}</option>
          <option value={6}>{"6 h avant le RDV"}</option>
          <option value={24}>{"24 h avant le RDV"}</option>
          <option value={48}>{"48 h avant le RDV"}</option>
        </select>
      </div>

      {/* Delai de reversement : NON editable, info-seul (FlowIA decide). */}
      <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10,
                    background: t.cardAlt, border: `1px solid ${t.border}` }}>
        <p style={{ ...panelLabel(t), marginBottom: 4 }}>
          {"Délai de reversement après le RDV"}
        </p>
        <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 500, color: t.text }}>
          {"3 jours après chaque rendez-vous"}
        </p>
        <p style={{ fontSize: 12, color: t.muted, margin: 0, lineHeight: 1.5 }}>
          {"L'argent des paiements en ligne reste sur votre compte Stripe (visible mais non disponible) pendant 3 jours après la prestation. Ce délai garantit qu'aucun refund de dernière minute ne crée de découvert sur votre compte."}
        </p>
      </div>

      {/* Bloc explication 3 scenarios — Planity-style */}
      <div style={{
        background: t.cardAlt, border: `1px solid ${t.border}`,
        borderRadius: 10, padding: '14px 16px', marginBottom: 12,
      }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500, color: t.text }}>
          {"Comment ça marche pour les RDV payés en ligne"}
        </p>
        <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex',
                     flexDirection: 'column', gap: 6,
                     fontSize: 12, color: t.text, lineHeight: 1.55 }}>
          <li>
            <strong style={{ color: '#065f46' }}>{"Client annule dans les délais :"}</strong>{' '}
            remboursement intégral automatique. Notre commission FlowIA
            vous est aussi rendue.
          </li>
          <li>
            <strong style={{ color: '#92400e' }}>{"Client annule hors délais :"}</strong>{' '}
            l'acompte est <strong>conservé</strong> (politique no-show).
            Vous le recevrez après la date du RDV + délai de reversement.
          </li>
          <li>
            <strong style={{ color: '#991b1b' }}>{"Vous annulez vous-même :"}</strong>{' '}
            le client est toujours remboursé à 100 % automatiquement.
          </li>
        </ul>
      </div>

      {dirty && (
        <div style={{ display: 'flex', gap: 8, paddingTop: 14,
                      borderTop: `1px solid ${t.separator}` }}>
          <button onClick={() => { load(); }} disabled={busy} style={btnGhost(t, busy)}>
            {"Annuler les modifications"}
          </button>
          <button onClick={handleSave} disabled={busy}
                  style={{ ...btnPrimary(t, busy), marginLeft: 'auto' }}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </section>
  );
}

// ─── Performances paiements en ligne ────────────────────────────────────────
// 4 KPI synthetiques sur periode glissante (7/30/90 jours) : CA net en ligne,
// RDV payes, remboursements, no-show automatiques. Aide le commercant a
// suivre l'efficacite de son acompte (no-show vs RDV honores).
function PerformancePaymentsSection({ t, showToast }) {
  const [period, setPeriod] = useState(30);
  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(true);

  const load = async (p) => {
    setLoad(true);
    try {
      const r = await connectApi.getPerformanceStats(p);
      setData(r);
    } catch (e) {
      showToast && showToast(e.message || 'Erreur chargement performances.', 'error');
    } finally { setLoad(false); }
  };
  useEffect(() => { load(period); /* eslint-disable-next-line */ }, [period]);

  const fmtEur = (cents) => (Math.round(cents) / 100).toFixed(2).replace('.', ',') + ' €';

  if (loading && !data) {
    return (
      <section style={cardStyle(t)}>
        <div style={{ height: 12, width: 220, background: t.cardAlt,
                      borderRadius: 6, marginBottom: 14 }}/>
        <div style={{ height: 90, width: '100%', background: t.cardAlt,
                      borderRadius: 10 }}/>
      </section>
    );
  }

  const d = data || {};
  const periods = [7, 30, 90];

  return (
    <section style={cardStyle(t)}>
      <div style={{ ...panelHeader, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={dot('#0891b2')}/>
          <span style={panelLabel(t)}>{"Performances paiements en ligne"}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {periods.map(p => (
            <button key={p} type="button"
                    onClick={() => setPeriod(p)}
                    disabled={loading}
                    style={periodBtn(t, period === p)}>
              {p === 7 ? '7 j' : p === 30 ? '30 j' : '90 j'}
            </button>
          ))}
        </div>
      </div>

      <div style={kpiGrid}>
        {/* CA net (revenus - remboursements) */}
        <KpiCard t={t}
                 label="Encaissé en ligne (net)"
                 value={fmtEur(d.net_revenue_cents || 0)}
                 sub={d.gross_revenue_cents
                   ? `${fmtEur(d.gross_revenue_cents)} brut${d.refund_amount_cents ? ` − ${fmtEur(d.refund_amount_cents)} remboursé` : ''}`
                   : 'Aucun encaissement sur la période.'}
                 accent="#0891b2"/>

        {/* RDV payes en ligne */}
        <KpiCard t={t}
                 label="RDV payés en ligne"
                 value={String(d.online_paid_count || 0)}
                 sub={(d.online_paid_count || 0) === 0
                   ? "Aucun paiement en ligne sur la période."
                   : `Acomptes ou paiements intégraux confirmés.`}
                 accent="#0891b2"/>

        {/* Remboursements */}
        <KpiCard t={t}
                 label="Remboursements"
                 value={String(d.refund_count || 0)}
                 sub={(d.refund_count || 0) === 0
                   ? "Aucun remboursement sur la période."
                   : `${fmtEur(d.refund_amount_cents || 0)} remboursés au total.`}
                 accent="#9ca3af"/>

        {/* No-show automatiques */}
        <KpiCard t={t}
                 label="No-show automatiques"
                 value={String(d.no_show_auto_count || 0)}
                 sub={(d.no_show_auto_count || 0) === 0
                   ? "Aucun no-show systématique. Vos clients honorent leurs RDV."
                   : `RDV passés non honorés, marqués automatiquement (acompte conservé).`}
                 accent="#92400e"/>
      </div>

      {/* Detail annulations sous-jacentes (optionnel, ligne discrete) */}
      {((d.cancelled_client_count || 0) + (d.cancelled_merchant_count || 0)) > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12,
                      borderTop: `0.5px solid ${t.separator}`,
                      display: 'flex', gap: 16, flexWrap: 'wrap',
                      fontSize: 12, color: t.muted }}>
          <span>{"Annulations client : "}<strong style={{ color: t.text, fontWeight: 500 }}>{d.cancelled_client_count || 0}</strong></span>
          <span>{"Annulations salon : "}<strong style={{ color: t.text, fontWeight: 500 }}>{d.cancelled_merchant_count || 0}</strong></span>
        </div>
      )}
    </section>
  );
}

function KpiCard({ t, label, value, sub, accent }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10,
      background: t.cardAlt, border: `0.5px solid ${t.border}`,
      borderLeft: `2px solid ${accent}`,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <p style={{ margin: 0, fontSize: 11, color: t.muted, fontWeight: 500,
                  textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 500, color: t.text,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  lineHeight: 1.2 }}>
        {value}
      </p>
      <p style={{ margin: 0, fontSize: 12, color: t.muted, lineHeight: 1.4 }}>
        {sub}
      </p>
    </div>
  );
}

const kpiGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
};

function periodBtn(t, active) {
  return {
    padding: '4px 10px', fontSize: 12, fontWeight: 500,
    background: active ? t.text : 'transparent',
    color:      active ? t.canvas : t.text,
    border: active ? `1px solid ${t.text}` : `0.5px solid ${t.border}`,
    borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'background 0.15s, color 0.15s',
  };
}

// ─── Mes reversements (escrow) ──────────────────────────────────────────────
// Liste les payouts en attente + récents libérés. Le commerçant voit
// exactement quand chaque paiement va arriver sur son IBAN.
function EscrowPayoutsSection({ t, showToast }) {
  const [data, setData]       = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      // Parallel : escrow FlowIA (appointment_payouts) + balance Stripe live.
      // Le solde live reflete IMMEDIATEMENT les refunds (Stripe API), tandis
      // que appointment_payouts depend du cron releasePayouts.
      const [r, b] = await Promise.allSettled([
        connectApi.getPayouts(),
        connectApi.getStripeBalance(),
      ]);
      if (r.status === 'fulfilled') setData(r.value);
      if (b.status === 'fulfilled') setBalance(b.value);
    } catch (e) {
      showToast && showToast(e.message || 'Erreur chargement reversements.', 'error');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const fmtEur = (cents) => (Math.round(cents) / 100).toFixed(2).replace('.', ',') + ' €';
  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return iso; }
  };

  if (loading) {
    return (
      <section style={cardStyle(t)}>
        <div style={{ height: 12, width: 200, background: t.cardAlt,
                      borderRadius: 6, marginBottom: 12 }}/>
        <div style={{ height: 60, width: '100%', background: t.cardAlt,
                      borderRadius: 8 }}/>
      </section>
    );
  }

  const summary = data?.summary || {};
  const payouts = data?.payouts || [];
  const pending = payouts.filter(p => p.status === 'pending').slice(0, 8);
  const released = payouts.filter(p => p.status === 'released').slice(0, 5);

  return (
    <section style={cardStyle(t)}>
      <div style={panelHeader}>
        <span style={dot('#10b981')}/>
        <span style={panelLabel(t)}>{"Mes reversements"}</span>
      </div>

      {/* Solde Stripe live (source de verite) — refunds reflechis instantanement */}
      <div style={{
        padding: '16px 18px', borderRadius: 12,
        background: '#f0fdf4', border: '1px solid #bbf7d0',
        marginBottom: 14,
      }}>
        <p style={{ margin: 0, fontSize: 11, color: '#065f46',
                    textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
          {"Solde Stripe (en direct)"}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 500, color: '#065f46',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {fmtEur(((balance?.available_cents) || 0) + ((balance?.pending_cents) || 0))}
        </p>
        {/* Decomposition disponible / en attente Stripe */}
        <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 11, color: '#065f46', lineHeight: 1.5 }}>
          <span>
            {"Disponible : "}
            <span style={{ fontWeight: 500, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {fmtEur(balance?.available_cents || 0)}
            </span>
          </span>
          <span>
            {"En transit : "}
            <span style={{ fontWeight: 500, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {fmtEur(balance?.pending_cents || 0)}
            </span>
          </span>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#065f46', lineHeight: 1.5, opacity: 0.85 }}>
          {summary.pending_count
            ? `Programmation FlowIA : ${summary.pending_count} reversement${summary.pending_count > 1 ? 's' : ''} planifie${summary.pending_count > 1 ? 's' : ''} pour ${fmtEur(summary.pending_cents || 0)} (versés selon le délai après chaque RDV).`
            : 'Aucun reversement programmé actuellement.'}
        </p>
      </div>

      {/* Prochains reversements */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ ...panelLabel(t), marginBottom: 8 }}>
            {"Prochains reversements"}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 8,
                background: t.cardAlt, border: `1px solid ${t.border}`,
                flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.text }}>
                    {p.client_name || 'Client'} — {p.service_name || 'RDV'}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: t.muted }}>
                    {"RDV le "}{fmtDate(p.appt_date)}{p.appt_time ? ` à ${p.appt_time.slice(0, 5)}` : ''}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.text,
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {fmtEur(p.amount_cents)}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: t.muted }}>
                    {"versé le "}{fmtDate(p.release_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reversements récemment effectués */}
      {released.length > 0 && (
        <div>
          <p style={{ ...panelLabel(t), marginBottom: 8 }}>
            {"Récemment versés"}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {released.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 12px',
                borderBottom: `0.5px solid ${t.separator}`,
                fontSize: 12,
              }}>
                <span style={{ flex: 1, color: t.text }}>
                  {p.client_name || 'Client'}
                </span>
                <span style={{ color: t.muted, fontSize: 11 }}>
                  {fmtDate(p.released_at)}
                </span>
                <span style={{ color: '#065f46', fontWeight: 500,
                               fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {fmtEur(p.amount_cents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && released.length === 0 && (
        <p style={{ fontSize: 13, color: t.muted, textAlign: 'center',
                    padding: '20px 0' }}>
          {"Aucun reversement pour l'instant. Dès qu'un client paiera en ligne un RDV à venir, il apparaîtra ici."}
        </p>
      )}
    </section>
  );
}

function selectStyle(t) {
  return {
    width: '100%', padding: '10px 12px',
    border: `1px solid ${t.borderInput || t.border}`,
    borderRadius: 8, background: t.inputBg || t.canvas,
    color: t.text, fontSize: 14, fontFamily: 'inherit',
    boxSizing: 'border-box', cursor: 'pointer',
  };
}

// ─── Configuration des paiements RDV (Phase 4) ──────────────────────────────
// Affichee uniquement si le compte Connect est connected + charges_enabled.
// Permet d'activer/desactiver, choisir politique (optionnel/obligatoire) et
// pourcentage d'acompte (20/50/100/custom).
function PaymentConfigSection({ t, showToast }) {
  const [cfg, setCfg]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);

  // State edition
  const [enabled, setEnabled]       = useState(false);
  const [policy, setPolicy]         = useState('optional');
  const [percentage, setPercentage] = useState(100);
  const [dirty, setDirty]           = useState(false);

  const load = async () => {
    try {
      const d = await connectApi.getPaymentConfig();
      setCfg(d);
      setEnabled(!!d.enabled);
      setPolicy(d.policy || 'optional');
      setPercentage(d.percentage || 100);
      setDirty(false);
    } catch {} finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const onToggleEnabled = (val) => { setEnabled(val); setDirty(true); };
  const onPolicyChange  = (val) => { setPolicy(val);  setDirty(true); };
  const onPctChange     = (val) => {
    const n = parseInt(val, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 100) setPercentage(n);
    else if (val === '') setPercentage('');
    setDirty(true);
  };

  const handleSave = async () => {
    const pct = parseInt(percentage, 10);
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
      showToast('Le pourcentage doit être un entier entre 1 et 100.', 'error');
      return;
    }
    setBusy(true);
    try {
      await connectApi.updatePaymentConfig({ enabled, policy, percentage: pct });
      showToast('Configuration des paiements mise à jour.', 'ok');
      await load();
    } catch (e) {
      showToast(e?.message || 'Erreur lors de la mise à jour.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section style={cardStyle(t)}>
        <div style={{ height: 12, width: 200, background: t.cardAlt,
                      borderRadius: 6, marginBottom: 12 }}/>
        <div style={{ height: 38, width: '100%', background: t.cardAlt,
                      borderRadius: 8 }}/>
      </section>
    );
  }

  return (
    <section style={cardStyle(t)}>
      <div style={panelHeader}>
        <span style={dot(enabled ? '#10b981' : '#9ca3af')}/>
        <span style={panelLabel(t)}>{"Paiements en ligne sur les réservations"}</span>
        {enabled && (
          <span style={pill('#10b981', '#ecfdf5')}>actif</span>
        )}
      </div>

      {/* Toggle activer/desactiver */}
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 14px', borderRadius: 10,
        background: t.cardAlt, border: `1px solid ${t.border}`,
        cursor: 'pointer', marginBottom: 14,
      }}>
        <input type="checkbox" checked={enabled}
               onChange={e => onToggleEnabled(e.target.checked)}
               style={{ marginTop: 2, width: 16, height: 16 }}/>
        <span>
          <span style={{ fontSize: 14, fontWeight: 500, color: t.text }}>
            {"Demander aux clients de payer en ligne"}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: t.muted, marginTop: 4, lineHeight: 1.5 }}>
            {"Quand actif, vos clients pourront (ou devront, selon votre politique) régler leur réservation directement sur votre page de réservation. L'argent arrive sur votre compte Stripe."}
          </span>
        </span>
      </label>

      {/* Options visibles uniquement si enabled */}
      {enabled && (
        <>
          {/* Politique de paiement */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ ...panelLabel(t), marginBottom: 8 }}>{"Politique de paiement"}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={radioCard(t, policy === 'optional')}>
                <input type="radio" name="policy" value="optional"
                       checked={policy === 'optional'}
                       onChange={() => onPolicyChange('optional')}
                       style={{ marginTop: 2 }}/>
                <span>
                  <strong style={{ color: t.text }}>{"Optionnel"}</strong>
                  <span style={{ display: 'block', fontSize: 12, color: t.muted, marginTop: 2 }}>
                    {"Le client choisit : payer en ligne maintenant ou payer sur place lors du RDV."}
                  </span>
                </span>
              </label>
              <label style={radioCard(t, policy === 'mandatory')}>
                <input type="radio" name="policy" value="mandatory"
                       checked={policy === 'mandatory'}
                       onChange={() => onPolicyChange('mandatory')}
                       style={{ marginTop: 2 }}/>
                <span>
                  <strong style={{ color: t.text }}>{"Obligatoire"}</strong>
                  <span style={{ display: 'block', fontSize: 12, color: t.muted, marginTop: 2 }}>
                    {"Le RDV ne peut être réservé qu'après paiement en ligne. Réduit fortement les no-shows."}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Pourcentage acompte */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ ...panelLabel(t), marginBottom: 8 }}>{"Montant à payer en ligne"}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {[20, 50, 100].map(n => (
                <button key={n} type="button"
                        onClick={() => onPctChange(n)}
                        style={presetBtn(t, percentage === n)}>
                  {n} %
                </button>
              ))}
              <span style={{ fontSize: 12, color: t.muted, margin: '0 6px' }}>ou</span>
              <input type="number" min={1} max={100}
                     value={percentage}
                     onChange={e => onPctChange(e.target.value)}
                     style={pctInput(t)}/>
              <span style={{ fontSize: 13, color: t.text }}>{"% du prix"}</span>
            </div>
            <p style={{ fontSize: 12, color: t.muted, marginTop: 8, lineHeight: 1.5 }}>
              {percentage === 100
                ? "Le client paie 100 % du prix de la prestation au moment de la réservation."
                : percentage === 50
                  ? "Le client paie 50 % en acompte. Les 50 % restants sont à régler sur place lors du RDV."
                  : percentage === 20
                    ? "Le client paie 20 % en acompte (frais de réservation). Le solde se règle sur place."
                    : `Le client paie ${percentage} % en acompte. Le solde se règle sur place lors du RDV.`}
            </p>
          </div>
        </>
      )}

      {/* Action save */}
      {dirty && (
        <div style={{ display: 'flex', gap: 8, paddingTop: 14,
                      borderTop: `1px solid ${t.separator}` }}>
          <button onClick={() => { load(); }} disabled={busy}
                  style={btnGhost(t, busy)}>
            Annuler les modifications
          </button>
          <button onClick={handleSave} disabled={busy}
                  style={{ ...btnPrimary(t, busy), marginLeft: 'auto' }}>
            {busy ? 'Enregistrement…' : 'Enregistrer les changements'}
          </button>
        </div>
      )}
    </section>
  );
}

function radioCard(t, active) {
  return {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '12px 14px', borderRadius: 10,
    border: active ? `1px solid ${t.text}` : `1px solid ${t.border}`,
    background: active ? t.cardAlt : 'transparent',
    cursor: 'pointer', fontSize: 13, color: t.text, lineHeight: 1.4,
    transition: 'border-color 0.15s, background 0.15s',
  };
}
function presetBtn(t, active) {
  return {
    padding: '8px 14px', fontSize: 13, fontWeight: 500,
    background: active ? t.text : 'transparent',
    color:      active ? t.canvas : t.text,
    border: active ? `1px solid ${t.text}` : `1px solid ${t.border}`,
    borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'background 0.15s, color 0.15s',
  };
}
function pctInput(t) {
  return {
    width: 80, padding: '7px 10px', fontSize: 13,
    border: `1px solid ${t.borderInput || t.border}`,
    borderRadius: 7, background: t.inputBg || t.canvas,
    color: t.text, fontFamily: 'inherit',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function statusColor(s) {
  if (s === 'connected') return '#10b981';
  if (s === 'onboarding_pending') return '#f59e0b';
  return '#9ca3af';
}
function statusBg(s) {
  if (s === 'connected') return '#ecfdf5';
  if (s === 'onboarding_pending') return '#fffbeb';
  return 'transparent';
}
function statusLabel(s) {
  if (s === 'connected') return 'Connecté';
  if (s === 'onboarding_pending') return 'À finaliser';
  return 'Non connecté';
}
function prettyRequirement(r) {
  // Traduction friendly des codes Stripe les plus courants.
  const map = {
    'business_profile.url':                          'Site web ou page d\'activité',
    'business_profile.product_description':          'Description de votre activité',
    'business_profile.support_email':                'Email de support clients',
    'business_profile.support_phone':                'Téléphone de support',
    'business_type':                                 'Type d\'entreprise',
    'company.address.line1':                         'Adresse de l\'entreprise',
    'company.name':                                  'Nom de l\'entreprise',
    'company.tax_id':                                'Numéro fiscal',
    'external_account':                              'Compte bancaire (IBAN)',
    'individual.address.line1':                      'Adresse personnelle',
    'individual.dob.day':                            'Date de naissance',
    'individual.email':                              'Email',
    'individual.first_name':                         'Prénom',
    'individual.last_name':                          'Nom',
    'individual.phone':                              'Téléphone',
    'individual.verification.document':              'Pièce d\'identité',
    'tos_acceptance.date':                           'Acceptation des CGU Stripe',
  };
  return map[r] || r.replace(/[._]/g, ' ');
}

// ── Styles ───────────────────────────────────────────────────────────────────
const cardStyle = (t) => ({
  padding: 22, borderRadius: 12,
  background: t.card, border: `0.5px solid ${t.border}`,
  boxShadow: t.shadowSm,
});
const panelHeader = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  marginBottom: 14,
};
const panelLabel = (t) => ({
  fontSize: 11, fontWeight: 600, color: t.muted,
  textTransform: 'uppercase', letterSpacing: 0.5,
  margin: 0,
});
const paragraph = (t) => ({
  fontSize: 14, color: t.text, lineHeight: 1.55, margin: 0,
});
const bulletList = (t) => ({
  listStyle: 'none', padding: 0, margin: '12px 0 18px',
  display: 'flex', flexDirection: 'column', gap: 6,
  fontSize: 13, color: t.textSub, lineHeight: 1.5,
});
const detailsGrid = {
  display: 'grid', gap: 8,
  gridTemplateColumns: 'minmax(160px, max-content) 1fr',
  alignItems: 'baseline', marginTop: 14,
};
const detailRow = { display: 'contents' };
const detailKey = (t) => ({ fontSize: 12, color: t.muted });
const detailVal = (t) => ({ fontSize: 13, color: t.text, fontWeight: 500 });

function dot(color) {
  return { width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0 };
}
function pill(color, bg) {
  return {
    fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99,
    color, background: bg, border: `1px solid ${color}33`, whiteSpace: 'nowrap',
  };
}
function btnPrimary(t, busy) {
  return {
    padding: '10px 18px', fontSize: 14, fontWeight: 500,
    background: t.text, color: t.canvas,
    border: 'none', borderRadius: 8,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.7 : 1, fontFamily: 'inherit',
  };
}
function btnGhost(t, busy) {
  return {
    padding: '10px 18px', fontSize: 14, fontWeight: 500,
    background: 'transparent', color: t.text,
    border: `1px solid ${t.border}`, borderRadius: 8,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.7 : 1, fontFamily: 'inherit',
  };
}
function btnDanger(t, busy) {
  return {
    padding: '10px 18px', fontSize: 14, fontWeight: 500,
    background: 'transparent', color: '#991b1b',
    border: '1px solid #fecaca', borderRadius: 8,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.7 : 1, fontFamily: 'inherit',
  };
}

function SkeletonCard({ t }) {
  const skel = (w, h) => ({
    width: w, height: h, borderRadius: 6,
    background: t.cardAlt, border: `1px solid ${t.border}`,
  });
  return (
    <section style={cardStyle(t)}>
      <div style={{ ...skel(140, 12), marginBottom: 12 }}/>
      <div style={{ ...skel(220, 18), marginBottom: 14 }}/>
      <div style={{ ...skel('80%', 14), marginBottom: 8 }}/>
      <div style={{ ...skel('60%', 14), marginBottom: 18 }}/>
      <div style={skel(220, 38)}/>
    </section>
  );
}
