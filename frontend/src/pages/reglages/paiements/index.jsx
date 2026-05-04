// Réglages > Paiements en ligne — Stripe Connect onboarding marchand.
// Permet au commerçant de connecter son propre compte Stripe pour recevoir
// l'argent des réservations directement. Pattern Direct Charges via
// Controller API (pas OAuth Standard, voir backend/routes/stripe-connect.js).
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../../hooks/useTheme';
import { Toast, useToast } from '../../../components/UI';
import { PageHeader } from '../shared';
import { connectApi } from '../../../utils/api';

export default function Paiements() {
  const { theme: t } = useTheme();
  const [toast, showToast] = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(null); // 'onboard' | 'dashboard' | 'disconnect'

  const load = async () => {
    try {
      const d = await connectApi.getAccount();
      setData(d);
    } catch (e) {
      console.error('[Paiements] getAccount', e);
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

  const handleDisconnect = async () => {
    if (!window.confirm('Déconnecter votre compte Stripe ?\n\nLes paiements en ligne sur vos réservations seront immédiatement désactivés. Vous pourrez reconnecter votre compte à tout moment.')) {
      return;
    }
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
        </>
      )}
    </div>
  );
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
    } catch (e) {
      console.error('[PaymentConfig] load', e);
    } finally {
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
