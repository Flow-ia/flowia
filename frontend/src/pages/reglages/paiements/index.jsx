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

          {/* Note Phase 4 — config paiements RDV (à venir) */}
          {status === 'connected' && (
            <section style={{
              ...cardStyle(t),
              background: t.cardAlt, borderStyle: 'dashed',
            }}>
              <p style={panelLabel(t)}>{"Bientôt disponible"}</p>
              <p style={{ ...paragraph(t), marginTop: 6 }}>
                {"La configuration fine des paiements (acompte 20 / 50 / 100 %, paiement obligatoire ou optionnel par prestation) sera ajoutée prochainement dans cette section. Pour l'instant, votre compte Stripe est prêt à recevoir des paiements dès qu'on activera cette fonctionnalité."}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
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
