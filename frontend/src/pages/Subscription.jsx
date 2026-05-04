// Subscription.jsx — Page /abonnement : choix du plan + gestion de l'abonnement
//
// 3 plans : Découverte (gratuit) / Essentiel (24€mois|240€an) / Équipe (49€mois|490€an).
// - Si pas d'abo actif : 3 cartes, bouton "S'abonner" sur Essentiel/Équipe.
// - Si abo actif : badge "Plan actuel", bouton "Gérer mon abonnement" → Stripe Portal.
// - 14 jours d'essai gratuit sur Essentiel uniquement.
// - "2 mois offerts" en annuel (= 16,67% de réduction).
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { Toast, useToast } from '../components/UI';
import { PageHeader } from './reglages/shared';
import { api } from '../utils/api';

const PLANS = [
  {
    id: 'decouverte',
    name: 'Découverte',
    monthly: '0', yearly: '0', annual: '0',
    desc: 'Pour démarrer et tester FlowIA sans risque.',
    features: [
      "Jusqu'à 50 RDV/mois", '1 employé', 'Page de réservation publique',
      'Caisse de base', 'Export CSV', 'Support email',
    ],
    canSubscribe: false,
  },
  {
    id: 'essentiel',
    name: 'Essentiel',
    monthly: '24', yearly: '20', annual: '240',
    desc: 'Tous les outils marketing pour fidéliser vos clients.',
    features: [
      'RDV illimités', "Jusqu'à 5 employés", 'SMS rappels et marketing',
      'Programme fidélité', 'Programme parrainage', 'IA marketing',
      'Caisse complète', 'Support prioritaire',
    ],
    canSubscribe: true,
    highlight: true,
    trial: '14 jours d\'essai · sans carte bancaire',
  },
  {
    id: 'equipe',
    name: 'Équipe',
    monthly: '49', yearly: '40,83', annual: '490',
    desc: 'Multi-sites, IA avancée et support dédié pour les salons exigeants.',
    features: [
      'Tout du plan Essentiel', 'Employés illimités', 'Multi-sites',
      'Cadeau anniversaire', 'IA avancée', 'API et exports avancés',
      'Statistiques par employé/site', 'Support dédié + SLA 99,9 %',
    ],
    canSubscribe: true,
  },
];

export default function Subscription() {
  const { theme: t } = useTheme();
  const [toast, showToast] = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [yearly, setYearly]       = useState(false);
  const [sub, setSub]             = useState(null);
  const [loading, setLoading]     = useState(true);
  const [busyPlan, setBusyPlan]   = useState(null);
  const [busyPortal, setBusyPortal] = useState(false);

  // Lecture du status de retour Stripe Checkout (?status=success|cancel).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    if (status === 'success') {
      showToast('Abonnement confirmé. Mise à jour en cours…', 'ok');
      navigate('/abonnement', { replace: true });
    } else if (status === 'cancel') {
      showToast('Souscription annulée.', 'info');
      navigate('/abonnement', { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-déclenchement du Checkout si arrivée via ?autostart=1&plan=...&period=...
  // (suite à un CTA marketing → register → /abonnement). Une seule fois par mount.
  // Appel direct à l'API (sans handleSubscribe) pour passer la période lue de
  // l'URL et éviter une closure sur le state yearly initial.
  useEffect(() => {
    const params    = new URLSearchParams(location.search);
    const autostart = params.get('autostart');
    const plan      = params.get('plan');
    const period    = params.get('period');
    if (autostart !== '1' || !plan || !period
        || !['essentiel', 'equipe'].includes(plan)
        || !['monthly', 'yearly'].includes(period)) return;

    setYearly(period === 'yearly');
    setBusyPlan(plan);
    // Délai court : laisse l'UI s'afficher avant la redirection Stripe.
    // Nettoie l'URL pour éviter qu'un retour arrière relance le checkout.
    const timer = setTimeout(async () => {
      navigate('/abonnement', { replace: true });
      try {
        const { url } = await api.createSubscriptionCheckout({ plan, period });
        if (url) window.location.href = url;
      } catch (e) {
        showToast(e?.data?.error || 'Erreur lors de la création de la session.', 'error');
        setBusyPlan(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Charge l'état d'abonnement courant (avec retry doux pendant ~15s post-checkout
  // pour laisser le webhook arriver depuis Stripe).
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(location.search);
    const justPaid = params.get('status') === 'success';
    let attempts = 0;
    const maxAttempts = justPaid ? 8 : 1;

    const load = async () => {
      try {
        const data = await api.getSubscription();
        if (cancelled) return;
        setSub(data);
        if (justPaid && !data.is_active && attempts < maxAttempts) {
          attempts += 1;
          setTimeout(load, 2000);
        } else {
          setLoading(false);
        }
      } catch (e) {
        if (cancelled) return;
        console.error('[Subscription] getSubscription', e);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubscribe = async (planId) => {
    setBusyPlan(planId);
    try {
      const period = yearly ? 'yearly' : 'monthly';
      const { url } = await api.createSubscriptionCheckout({ plan: planId, period });
      if (url) window.location.href = url;
    } catch (e) {
      const msg = e?.data?.error || 'Erreur lors de la création de la session.';
      showToast(msg, 'error');
      setBusyPlan(null);
    }
  };

  const handlePortal = async () => {
    setBusyPortal(true);
    try {
      const { url } = await api.createSubscriptionPortal();
      if (url) window.location.href = url;
    } catch (e) {
      const msg = e?.data?.error || 'Erreur ouverture portail.';
      showToast(msg, 'error');
      setBusyPortal(false);
    }
  };

  const currentPlan = sub?.is_active ? sub.plan : 'decouverte';
  const currentPeriod = sub?.period;

  return (
    <div style={{ minHeight: '100vh', background: t.bg, paddingBottom: 48 }}>
      <Toast msg={toast?.msg} type={toast?.type}/>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '18px 16px',
                    display: 'flex', flexDirection: 'column', gap: 18 }}>

        <PageHeader
          backTo="/reglages"
          crumb="Réglages"
          title="Abonnement"
          subtitle="Choisissez le plan qui correspond à votre activité."
        />

        {/* Bandeau état actuel */}
        {!loading && sub?.is_active && (
          <div style={{
            padding: '14px 18px', borderRadius: 10,
            background: t.card, border: `1px solid ${t.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: t.muted, marginBottom: 2 }}>Plan actuel</p>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 500, color: t.text }}>
                {planLabel(sub.plan)}
                {sub.period && <span style={{ color: t.muted, fontWeight: 400 }}> · {sub.period === 'yearly' ? 'annuel' : 'mensuel'}</span>}
                {sub.status === 'trialing' && (
                  <span style={{
                    marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 99,
                    background: '#ecfdf5', color: '#10b981', fontWeight: 500,
                  }}>Essai gratuit</span>
                )}
              </p>
              {sub.current_period_end && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: t.muted }}>
                  Prochaine échéance : {new Date(sub.current_period_end).toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>
            <button onClick={handlePortal} disabled={busyPortal}
                    style={btnPrimary(t, busyPortal)}>
              {busyPortal ? 'Ouverture…' : 'Gérer mon abonnement'}
            </button>
          </div>
        )}

        {/* Bandeau past_due */}
        {!loading && sub?.is_past_due && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: '#fffbeb', border: '1px solid #fde68a',
            color: '#92400e', fontSize: 13,
          }}>
            {"Votre dernier paiement a échoué. Mettez à jour votre carte depuis le portail pour conserver l'accès."}
          </div>
        )}

        {/* Bandeau trial bientôt fini (J-3) */}
        {!loading && sub?.status === 'trialing' && sub?.trial_ends_at &&
         daysUntil(sub.trial_ends_at) <= 3 && daysUntil(sub.trial_ends_at) >= 0 && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: '#eff6ff', border: '1px solid #bfdbfe',
            color: '#1e40af', fontSize: 13,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 12, flexWrap: 'wrap',
          }}>
            <span>
              {"Votre essai gratuit se termine dans "}{daysUntil(sub.trial_ends_at)}
              {daysUntil(sub.trial_ends_at) > 1 ? ' jours' : ' jour'}
              {". Ajoutez une carte bancaire pour continuer sans interruption."}
            </span>
            <button onClick={handlePortal} disabled={busyPortal}
                    style={{ ...btnPrimary(t, busyPortal), width: 'auto', padding: '8px 14px' }}>
              {busyPortal ? 'Ouverture…' : 'Ajouter une carte'}
            </button>
          </div>
        )}

        {/* Toggle mensuel / annuel */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <div style={{
            display: 'inline-flex', padding: 4, borderRadius: 99,
            background: t.cardAlt, border: `1px solid ${t.border}`,
          }}>
            <button onClick={() => setYearly(false)} style={toggleBtn(t, !yearly)}>Mensuel</button>
            <button onClick={() => setYearly(true)}  style={toggleBtn(t, yearly)}>
              Annuel
              <span style={{
                marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 99,
                background: '#ecfdf5', color: '#10b981', fontWeight: 500,
              }}>2 mois offerts</span>
            </button>
          </div>
        </div>

        {/* Cartes plans */}
        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}>
          {PLANS.map(p => {
            const price = yearly ? p.yearly : p.monthly;
            const isCurrent = currentPlan === p.id && (
              p.id === 'decouverte' ||
              (currentPeriod === (yearly ? 'yearly' : 'monthly'))
            );
            const isCurrentAny = currentPlan === p.id;
            return (
              <div key={p.id} style={{
                padding: 22, borderRadius: 12,
                background: t.card,
                border: p.highlight ? `1px solid ${t.text}` : `1px solid ${t.border}`,
                boxShadow: p.highlight ? t.shadowMd : t.shadowSm,
                position: 'relative',
                display: 'flex', flexDirection: 'column',
              }}>
                {p.highlight && (
                  <span style={{
                    position: 'absolute', top: -10, left: 20,
                    fontSize: 10, fontWeight: 500, padding: '3px 9px', borderRadius: 99,
                    background: t.text, color: t.canvas, letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}>Populaire</span>
                )}
                {isCurrentAny && sub?.is_active && (
                  <span style={{
                    position: 'absolute', top: -10, right: 20,
                    fontSize: 10, fontWeight: 500, padding: '3px 9px', borderRadius: 99,
                    background: '#ecfdf5', color: '#10b981', letterSpacing: 0.3,
                  }}>Plan actuel</span>
                )}
                <p style={{ fontSize: 14, fontWeight: 500, color: t.text, margin: 0, marginBottom: 4 }}>{p.name}</p>
                <p style={{ fontSize: 12, color: t.muted, margin: 0, marginBottom: 14, lineHeight: 1.4 }}>{p.desc}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 32, fontWeight: 500, color: t.text, letterSpacing: '-0.02em' }}>{price + ' €'}</span>
                  <span style={{ fontSize: 12, color: t.muted }}>/mois</span>
                </div>
                <p style={{ fontSize: 11, color: t.muted, margin: 0, marginBottom: 18 }}>
                  {yearly
                    ? (p.annual === '0' ? 'Gratuit' : `Facturé ${p.annual} €/an`)
                    : (p.monthly === '0' ? 'Gratuit' : 'Facturé mensuellement')}
                </p>
                {p.trial && !isCurrentAny && (
                  <p style={{
                    fontSize: 11, color: '#10b981', margin: 0, marginBottom: 12,
                    fontWeight: 500,
                  }}>
                    {p.trial}
                  </p>
                )}
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px',
                             display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ fontSize: 12, color: t.textSub,
                                         paddingLeft: 18, position: 'relative', lineHeight: 1.5 }}>
                      <span style={{ position: 'absolute', left: 0, top: 6,
                                     width: 4, height: 4, borderRadius: 4,
                                     background: '#10b981' }}/>
                      {f}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 'auto' }}>
                  {!p.canSubscribe ? (
                    <button disabled style={btnGhost(t, true)}>
                      {isCurrent ? 'Plan actuel' : 'Plan gratuit'}
                    </button>
                  ) : isCurrent ? (
                    <button disabled style={btnGhost(t, true)}>Plan actuel</button>
                  ) : sub?.is_active ? (
                    <button onClick={handlePortal} disabled={busyPortal}
                            style={p.highlight ? btnPrimary(t, busyPortal) : btnGhost(t, busyPortal)}>
                      {busyPortal ? 'Ouverture…' : 'Changer pour ce plan'}
                    </button>
                  ) : (
                    <button onClick={() => handleSubscribe(p.id)} disabled={busyPlan === p.id}
                            style={p.highlight ? btnPrimary(t, busyPlan === p.id) : btnGhost(t, busyPlan === p.id)}>
                      {busyPlan === p.id ? 'Redirection…' : 'S\'abonner'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 11, color: t.muted, textAlign: 'center', marginTop: 4 }}>
          {"Tarifs hors taxes. Paiement sécurisé par Stripe. Annulation à tout moment."}
        </p>
      </div>
    </div>
  );
}

function planLabel(id) {
  if (id === 'essentiel') return 'Essentiel';
  if (id === 'equipe')    return 'Équipe';
  return 'Découverte';
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const target = new Date(isoDate).getTime();
  const now    = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function btnPrimary(t, busy) {
  return {
    display: 'block', width: '100%', padding: '10px 14px',
    fontSize: 13, fontWeight: 500,
    background: t.text, color: t.canvas,
    border: 'none', borderRadius: 8,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.7 : 1,
    fontFamily: 'inherit',
  };
}
function btnGhost(t, busy) {
  return {
    display: 'block', width: '100%', padding: '10px 14px',
    fontSize: 13, fontWeight: 500,
    background: 'transparent', color: t.text,
    border: `1px solid ${t.border}`, borderRadius: 8,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.7 : 1,
    fontFamily: 'inherit',
  };
}
function toggleBtn(t, active) {
  return {
    padding: '7px 16px', fontSize: 12, fontWeight: 500,
    borderRadius: 99, border: 'none', cursor: 'pointer',
    background: active ? t.canvas : 'transparent',
    color: active ? t.text : t.muted,
    boxShadow: active ? t.shadowSm : 'none',
    fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center',
  };
}
