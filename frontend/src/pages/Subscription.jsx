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
import { Toast, useToast, Modal } from '../components/UI';
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
  const [yearly, setYearly]         = useState(false);
  const [sub, setSub]               = useState(null);
  const [loading, setLoading]       = useState(true);
  const [busyPlan, setBusyPlan]     = useState(null);
  const [busyPortal, setBusyPortal] = useState(false);
  const [busyAction, setBusyAction] = useState(null); // 'cancel' | 'reactivate' | 'change'
  const [confirmCfg, setConfirmCfg] = useState(null);  // { title, message, danger, onConfirm }

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

  // Recharge l'état d'abonnement depuis le serveur (après une action).
  // Utile car le webhook Stripe peut prendre 1-2s à arriver — on fait un
  // poll court pour voir le nouveau status sans laisser l'UI sur l'ancien.
  const refreshSub = async (attempts = 5) => {
    for (let i = 0; i < attempts; i++) {
      try {
        const data = await api.getSubscription();
        setSub(data);
        if (i > 0) return; // on avait deja la donnee fraiche
      } catch {}
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1500));
    }
  };

  const handleCancel = () => {
    const periodEnd = sub?.current_period_end
      ? new Date(sub.current_period_end).toLocaleDateString('fr-FR') : '';
    setConfirmCfg({
      title: "Annuler l'abonnement",
      message: (
        <>
          <p style={{ margin: 0, fontSize: 14, color: t.text, lineHeight: 1.5 }}>
            {"Vous gardez l'accès complet jusqu'au "}
            <strong>{periodEnd}</strong>
            {", puis votre compte basculera sur le plan Découverte (gratuit, fonctionnalités limitées)."}
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: t.muted, lineHeight: 1.5 }}>
            {"Aucun remboursement n'est dû pour la période en cours. Vous pourrez réactiver votre abonnement à tout moment avant cette date."}
          </p>
        </>
      ),
      danger: true,
      confirmLabel: "Confirmer l'annulation",
      onConfirm: async () => {
        setBusyAction('cancel');
        setConfirmCfg(null);
        try {
          await api.cancelSubscription();
          showToast('Abonnement annulé. Accès maintenu jusqu\'à la fin de période.', 'ok');
          await refreshSub();
        } catch (e) {
          showToast(e?.data?.error || "Erreur lors de l'annulation.", 'error');
        } finally {
          setBusyAction(null);
        }
      },
    });
  };

  const handleReactivate = async () => {
    setBusyAction('reactivate');
    try {
      await api.reactivateSubscription();
      showToast('Abonnement réactivé.', 'ok');
      await refreshSub();
    } catch (e) {
      showToast(e?.data?.error || 'Erreur lors de la réactivation.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleChangePlan = (newPlan, newPeriod) => {
    const isUpgrade = (sub?.plan === 'essentiel' && newPlan === 'equipe')
                   || (sub?.period === 'monthly' && newPeriod === 'yearly');
    setConfirmCfg({
      title: `Passer à ${planLabel(newPlan)} ${newPeriod === 'yearly' ? 'annuel' : 'mensuel'}`,
      message: (
        <>
          <p style={{ margin: 0, fontSize: 14, color: t.text, lineHeight: 1.5 }}>
            {isUpgrade
              ? "Le changement prend effet immédiatement. La différence proratisée pour la période en cours sera facturée tout de suite."
              : "Le changement prend effet immédiatement. Un crédit proratisé sera appliqué automatiquement sur votre prochaine facture."}
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: t.muted, lineHeight: 1.5 }}>
            {"Le détail du calcul apparaîtra dans votre prochaine facture Stripe (consultable depuis le portail de gestion)."}
          </p>
        </>
      ),
      danger: false,
      confirmLabel: 'Confirmer le changement',
      onConfirm: async () => {
        setBusyAction('change');
        setConfirmCfg(null);
        try {
          await api.changeSubscriptionPlan({ plan: newPlan, period: newPeriod });
          showToast('Plan mis à jour.', 'ok');
          await refreshSub();
        } catch (e) {
          showToast(e?.data?.error || 'Erreur changement de plan.', 'error');
        } finally {
          setBusyAction(null);
        }
      },
    });
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

        {/* Bandeau annulation programmée */}
        {!loading && sub?.is_active && sub?.cancel_at_period_end && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: '#fef2f2', border: '1px solid #fecaca',
            color: '#991b1b', fontSize: 13,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 12, flexWrap: 'wrap',
          }}>
            <span>
              {"Annulation programmée. Vous gardez l'accès jusqu'au "}
              <strong>{sub.current_period_end
                ? new Date(sub.current_period_end).toLocaleDateString('fr-FR')
                : '—'}</strong>
              {", puis votre compte basculera sur le plan Découverte."}
            </span>
            <button onClick={handleReactivate} disabled={busyAction === 'reactivate'}
                    style={{ ...btnPrimary(t, busyAction === 'reactivate'), width: 'auto', padding: '8px 14px' }}>
              {busyAction === 'reactivate' ? 'Réactivation…' : 'Réactiver'}
            </button>
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
                  {renderPlanButton({
                    plan: p, sub, yearly, t,
                    busyPlan, busyAction,
                    onSubscribe:    () => handleSubscribe(p.id),
                    onChangePlan:   (newPeriod) => handleChangePlan(p.id, newPeriod),
                    onCancel:       handleCancel,
                    onReactivate:   handleReactivate,
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 11, color: t.muted, textAlign: 'center', marginTop: 4 }}>
          {"Tarifs hors taxes. Paiement sécurisé par Stripe. Annulation à tout moment."}
        </p>

        {/* Lien discret vers le Customer Portal Stripe (factures, infos
            de facturation, gestion des moyens de paiement avancés). */}
        {!loading && sub?.has_subscription && (
          <p style={{ fontSize: 12, color: t.muted, textAlign: 'center', marginTop: 12 }}>
            <button onClick={handlePortal} disabled={busyPortal}
                    style={{ background: 'none', border: 'none', padding: 0,
                             color: t.muted, textDecoration: 'underline',
                             cursor: busyPortal ? 'wait' : 'pointer',
                             fontFamily: 'inherit', fontSize: 12 }}>
              {busyPortal ? 'Ouverture…' : 'Voir mes factures et plus de réglages dans le portail Stripe →'}
            </button>
          </p>
        )}
      </div>

      {/* Modal de confirmation pour cancel / change-plan */}
      <Modal open={!!confirmCfg}
             onClose={() => setConfirmCfg(null)}
             title={confirmCfg?.title || ''}
             theme={t}
             maxW={460}>
        <div style={{ marginBottom: 18 }}>
          {confirmCfg?.message}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setConfirmCfg(null)}
                  style={{ flex: 1, padding: '10px', borderRadius: 8,
                           fontSize: 14, fontWeight: 500, cursor: 'pointer',
                           background: 'transparent', color: t.text,
                           border: `1px solid ${t.border}`, fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button onClick={() => confirmCfg?.onConfirm?.()}
                  style={{ flex: 1, padding: '10px', borderRadius: 8,
                           fontSize: 14, fontWeight: 500, cursor: 'pointer',
                           background: confirmCfg?.danger ? '#991b1b' : t.text,
                           color: confirmCfg?.danger ? '#ffffff' : t.canvas,
                           border: 'none', fontFamily: 'inherit' }}>
            {confirmCfg?.confirmLabel || 'Confirmer'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// Détermine le bouton à afficher sur chaque carte plan selon le contexte
// (pas d'abo, abo actif sur ce plan/ailleurs, annulation programmée, etc.).
function renderPlanButton({ plan, sub, yearly, t, busyPlan, busyAction,
                            onSubscribe, onChangePlan, onCancel, onReactivate }) {
  const period         = yearly ? 'yearly' : 'monthly';
  const isActive       = !!sub?.is_active;
  const canceling      = isActive && sub?.cancel_at_period_end;
  const currentPlan    = isActive ? sub.plan : 'decouverte';
  const currentPeriod  = sub?.period;
  const isThisPlan     = currentPlan === plan.id;
  const isThisExact    = isThisPlan && (plan.id === 'decouverte' || currentPeriod === period);
  const busyChange     = busyAction === 'change';

  // Pas d'abonnement actif : bouton "S'abonner" sur les plans payants.
  if (!isActive) {
    if (!plan.canSubscribe) {
      return <button disabled style={btnGhost(t, true)}>
        {isThisExact ? 'Plan actuel' : 'Plan gratuit'}
      </button>;
    }
    return (
      <button onClick={onSubscribe} disabled={busyPlan === plan.id}
              style={plan.highlight ? btnPrimary(t, busyPlan === plan.id) : btnGhost(t, busyPlan === plan.id)}>
        {busyPlan === plan.id ? 'Redirection…' : "S'abonner"}
      </button>
    );
  }

  // Abonnement actif : carte du plan courant à la période courante.
  if (isThisExact) {
    if (canceling) {
      return (
        <button onClick={onReactivate} disabled={busyAction === 'reactivate'}
                style={btnPrimary(t, busyAction === 'reactivate')}>
          {busyAction === 'reactivate' ? 'Réactivation…' : 'Réactiver mon abonnement'}
        </button>
      );
    }
    return <button disabled style={btnGhost(t, true)}>Plan actuel</button>;
  }

  // Carte du plan courant mais autre période : changer la période.
  if (isThisPlan) {
    return (
      <button onClick={() => onChangePlan(period)} disabled={busyChange || canceling}
              style={btnGhost(t, busyChange)}>
        {busyChange ? 'Changement…'
                    : `Passer en ${period === 'yearly' ? 'annuel' : 'mensuel'}`}
      </button>
    );
  }

  // Carte plan Découverte (gratuit) alors qu'on a un abo payant : annuler.
  if (plan.id === 'decouverte') {
    if (canceling) {
      return <button disabled style={btnGhost(t, true)}>Annulation programmée</button>;
    }
    return (
      <button onClick={onCancel} disabled={busyAction === 'cancel'}
              style={btnGhost(t, busyAction === 'cancel')}>
        {busyAction === 'cancel' ? 'Annulation…' : 'Annuler mon abonnement'}
      </button>
    );
  }

  // Autre plan payant : changer pour ce plan.
  return (
    <button onClick={() => onChangePlan(period)} disabled={busyChange || canceling}
            style={plan.highlight ? btnPrimary(t, busyChange) : btnGhost(t, busyChange)}>
      {busyChange ? 'Changement…' : `Changer pour ${plan.name}`}
    </button>
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
