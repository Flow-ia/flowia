// Subscription.jsx — Page /abonnement : choix du plan + gestion de l'abonnement
//
// 3 plans : Découverte (gratuit) / Essentiel (24€mois|240€an) / Équipe (49€mois|490€an).
// - Si pas d'abo actif : 3 cartes, bouton "S'abonner" sur Essentiel/Équipe.
// - Si abo actif : badge "Plan actuel", bouton "Gérer mon abonnement" → Stripe Portal.
// - 14 jours d'essai gratuit sur Essentiel uniquement.
// - "2 mois offerts" en annuel (= 16,67% de réduction).
import { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements, CardNumberElement, CardExpiryElement, CardCvcElement,
  useStripe, useElements,
} from '@stripe/react-stripe-js';
import { useTheme } from '../hooks/useTheme';
import { Toast, useToast, Modal } from '../components/UI';
import { PageHeader } from './reglages/shared';
import { api } from '../utils/api';

// Singleton Stripe pour ne pas recharger la lib à chaque mount.
const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
let stripePromise = null;
function getStripeSingleton() {
  if (!stripePromise && STRIPE_PK) stripePromise = loadStripe(STRIPE_PK);
  return stripePromise;
}

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

// Données structurées pour le rendu "subscribed user view" : prix numériques
// + rank pour up/downgrade + listes de gains/pertes par transition.
const PLAN_DEFS = {
  decouverte: {
    id: 'decouverte', name: 'Découverte',
    monthly: 0, yearly: 0, annual: 0, rank: 0,
  },
  essentiel: {
    id: 'essentiel', name: 'Essentiel',
    monthly: 24, yearly: 20, annual: 240, rank: 1,
  },
  equipe: {
    id: 'equipe', name: 'Équipe',
    monthly: 49, yearly: 40.83, annual: 490, rank: 2,
  },
};

// Listes de fonctionnalités gagnées par upgrade. Pour les pertes (downgrade),
// on inverse les clés (essentiel→decouverte = lossesForDowngrade(essentiel)).
const UPGRADE_GAINS = {
  'decouverte→essentiel': [
    'RDV illimités',
    "Jusqu'à 5 employés (au lieu de 1)",
    'SMS rappels et marketing',
    'Programme fidélité',
    'Programme parrainage',
    'IA marketing',
    'Caisse complète',
    'Support prioritaire',
  ],
  'essentiel→equipe': [
    'Employés illimités (au lieu de 5)',
    'Multi-sites',
    'Cadeau anniversaire automatique',
    'IA avancée (vs standard)',
    'API et exports avancés',
    'Statistiques par employé et par site',
    'Support dédié + SLA 99,9 %',
  ],
  'decouverte→equipe': [
    'RDV illimités',
    'Employés illimités',
    'Multi-sites',
    'SMS rappels et marketing',
    'Programme fidélité',
    'Programme parrainage',
    'Cadeau anniversaire',
    'IA avancée',
    'Caisse complète',
    'API et exports avancés',
    'Statistiques par employé/site',
    'Support dédié + SLA 99,9 %',
  ],
};

function gainsForUpgrade(fromId, toId) {
  return UPGRADE_GAINS[`${fromId}→${toId}`] || [];
}
function lossesForDowngrade(fromId, toId) {
  // Symétrique : ce qu'on perd en X→Y = ce qu'on gagne en Y→X.
  return UPGRADE_GAINS[`${toId}→${fromId}`] || [];
}
function nextPlanId(currentId) {
  if (currentId === 'essentiel') return 'equipe';
  return null; // equipe = pas d'upgrade dispo
}
function prevPaidPlanId(currentId) {
  if (currentId === 'equipe') return 'essentiel';
  return null; // essentiel = pas de plan payant inférieur
}
function formatPrice(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

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

        {/* Toggle mensuel / annuel — uniquement pour free users (pour
            comparer les plans). Les subscribed ont leur propre period card. */}
        {!loading && !sub?.is_active && (
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
        )}

        {/* ─── VUE FREE USER ─── Grille des 3 plans complets pour comparer. */}
        {!loading && !sub?.is_active && (
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
        )}

        {/* Note tarifs hors taxes (free users seulement). */}
        {!loading && !sub?.is_active && (
          <p style={{ fontSize: 11, color: t.muted, textAlign: 'center', marginTop: 4 }}>
            {"Tarifs hors taxes. Paiement sécurisé par Stripe. Annulation à tout moment."}
          </p>
        )}

        {/* ─── VUE SUBSCRIBED USER ─── Carte unique compacte avec actions
            principales. Les détails (changer plan, cartes, factures) ouvrent
            des modaux pour minimiser le scroll. */}
        {!loading && sub?.is_active && (
          <CompactSubscriptionCard
            sub={sub} t={t} busyAction={busyAction}
            busyPortal={busyPortal}
            showToast={showToast}
            onChangePeriod={(newPeriod) => handleChangePlan(sub.plan, newPeriod)}
            onChangePlan={handleChangePlan}
            onCancel={handleCancel}
            onReactivate={handleReactivate}
            onPortal={handlePortal}
          />
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

// ── Section Moyens de paiement ──────────────────────────────────────────────
// Liste les cartes du customer + actions (ajouter, définir par défaut, supprimer).
// Prop `embedded` : true = pas de card englobante (utilisé dans un Modal).
function PaymentMethodsSection({ theme: t, showToast, embedded = false }) {
  const [pms, setPms]         = useState({ methods: [], default: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(null); // pmId en cours d'action
  const [addOpen, setAddOpen] = useState(false);

  const reload = async () => {
    try {
      const data = await api.listSubscriptionPaymentMethods();
      setPms(data || { methods: [], default: null });
    } catch (e) {
      console.error('[PaymentMethods] list', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const handleSetDefault = async (id) => {
    setBusy(id);
    try {
      await api.setSubscriptionDefaultPaymentMethod(id);
      showToast('Carte par défaut mise à jour.', 'ok');
      await reload();
    } catch (e) {
      showToast(e?.data?.error || 'Erreur', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette carte ?')) return;
    setBusy(id);
    try {
      await api.deleteSubscriptionPaymentMethod(id);
      showToast('Carte supprimée.', 'ok');
      await reload();
    } catch (e) {
      showToast(e?.data?.error || 'Erreur lors de la suppression.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const Wrapper    = embedded ? 'div' : 'section';
  const wrapperStyle = embedded
    ? { display: 'flex', flexDirection: 'column' }
    : {
        padding: 22, borderRadius: 12,
        background: t.card, border: `1px solid ${t.border}`,
        boxShadow: t.shadowSm,
      };

  return (
    <Wrapper style={wrapperStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          {!embedded && (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 500, color: t.text, margin: 0 }}>Moyens de paiement</h2>
              <p style={{ fontSize: 12, color: t.muted, margin: '4px 0 0' }}>
                {"Cartes utilisées pour vos prélèvements automatiques."}
              </p>
            </>
          )}
          {embedded && (
            <p style={{ fontSize: 12, color: t.muted, margin: 0 }}>
              {"Cartes utilisées pour vos prélèvements automatiques."}
            </p>
          )}
        </div>
        <button onClick={() => setAddOpen(true)}
                style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 500,
                  background: 'transparent', color: t.text,
                  border: `1px solid ${t.border}`, borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
          + Ajouter une carte
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: t.muted, margin: 0 }}>Chargement…</p>
      ) : pms.methods.length === 0 ? (
        <p style={{ fontSize: 13, color: t.muted, margin: 0, lineHeight: 1.5 }}>
          {"Aucune carte enregistrée. Ajoutez-en une pour activer les prélèvements automatiques."}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0,
                     display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pms.methods.map(pm => (
            <li key={pm.id} style={{
              padding: '12px 14px', borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: pm.isDefault ? t.cardAlt : t.canvas,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 36, height: 24, borderRadius: 4,
                  background: t.cardAlt, color: t.text,
                  fontSize: 9, fontWeight: 600, letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}>{pm.brand || 'Card'}</span>
                <div>
                  <p style={{ margin: 0, fontSize: 13, color: t.text, fontFamily: 'monospace' }}>
                    •••• •••• •••• {pm.last4}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: t.muted }}>
                    {"Expire "}{String(pm.exp_month).padStart(2, '0')}{"/"}{String(pm.exp_year).slice(-2)}
                  </p>
                </div>
                {pm.isDefault && (
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 99,
                    background: '#ecfdf5', color: '#10b981', fontWeight: 500,
                  }}>Par défaut</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!pm.isDefault && (
                  <button onClick={() => handleSetDefault(pm.id)} disabled={busy === pm.id}
                          style={pmActionBtn(t, busy === pm.id)}>
                    {busy === pm.id ? '…' : 'Définir par défaut'}
                  </button>
                )}
                <button onClick={() => handleDelete(pm.id)} disabled={busy === pm.id}
                        style={pmActionBtnDanger(t, busy === pm.id)}>
                  {busy === pm.id ? '…' : 'Supprimer'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddPaymentMethodModal open={addOpen} theme={t}
                              onClose={() => setAddOpen(false)}
                              onSuccess={async () => {
                                setAddOpen(false);
                                showToast('Carte ajoutée.', 'ok');
                                await reload();
                              }}
                              showToast={showToast}/>
    </Wrapper>
  );
}

function pmActionBtn(t, busy) {
  return {
    padding: '6px 11px', fontSize: 11, fontWeight: 500,
    background: 'transparent', color: t.textSub,
    border: `1px solid ${t.border}`, borderRadius: 7,
    cursor: busy ? 'wait' : 'pointer',
    fontFamily: 'inherit',
  };
}
function pmActionBtnDanger(t, busy) {
  return {
    padding: '6px 11px', fontSize: 11, fontWeight: 500,
    background: 'transparent', color: '#991b1b',
    border: '1px solid #fecaca', borderRadius: 7,
    cursor: busy ? 'wait' : 'pointer',
    fontFamily: 'inherit',
  };
}

// ── Modal ajout carte avec Stripe Elements ──────────────────────────────────
function AddPaymentMethodModal({ open, onClose, onSuccess, theme: t, showToast }) {
  const stripe = getStripeSingleton();
  const elementsOptions = useMemo(() => ({
    appearance: {
      theme: t.mode === 'dark' ? 'night' : 'stripe',
      variables: {
        colorPrimary:  t.text || '#111827',
        colorBackground: t.canvas || '#ffffff',
        colorText:     t.text || '#111827',
        borderRadius:  '8px',
        fontSizeBase:  '14px',
      },
    },
  }), [t.mode, t.text, t.canvas]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Ajouter une carte" theme={t} maxW={420}>
      {!stripe ? (
        <p style={{ fontSize: 13, color: t.muted, margin: 0 }}>
          {"Configuration Stripe manquante (VITE_STRIPE_PUBLISHABLE_KEY). Contactez le support."}
        </p>
      ) : (
        <Elements stripe={stripe} options={elementsOptions}>
          <AddCardForm onSuccess={onSuccess} onCancel={onClose} theme={t} showToast={showToast}/>
        </Elements>
      )}
    </Modal>
  );
}

function AddCardForm({ onSuccess, onCancel, theme: t, showToast }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 1) Récupère un SetupIntent (côté backend, sur le customer du marchand).
      const { client_secret } = await api.createSubscriptionPmSetupIntent();
      if (!client_secret) throw new Error('SetupIntent indisponible');
      // 2) Confirme le Setup avec la carte saisie. Stripe attache la PM au
      //    customer côté Stripe automatiquement (c'est natif au SetupIntent).
      const { error: stripeErr } = await stripe.confirmCardSetup(client_secret, {
        payment_method: { card: elements.getElement(CardNumberElement) },
      });
      if (stripeErr) throw stripeErr;
      onSuccess?.();
    } catch (err) {
      const msg = err?.message || err?.data?.error || 'Erreur ajout carte.';
      setError(msg);
      showToast?.(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const elementOptions = {
    style: {
      base: {
        fontSize:       '14px',
        color:          t.text,
        fontFamily:     'inherit',
        '::placeholder': { color: t.muted },
      },
      invalid: { color: '#991b1b' },
    },
  };
  const wrapStyle = {
    padding: '11px 12px',
    border:  `1px solid ${t.borderInput}`,
    borderRadius: 8,
    background: t.inputBg,
  };

  return (
    <form onSubmit={handleSubmit}>
      <label style={{ display: 'block', fontSize: 12, color: t.muted,
                      marginBottom: 4, fontWeight: 500 }}>
        Numéro de carte
      </label>
      <div style={{ ...wrapStyle, marginBottom: 10 }}>
        <CardNumberElement options={elementOptions}/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: t.muted,
                          marginBottom: 4, fontWeight: 500 }}>Expiration</label>
          <div style={wrapStyle}><CardExpiryElement options={elementOptions}/></div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: t.muted,
                          marginBottom: 4, fontWeight: 500 }}>CVC</label>
          <div style={wrapStyle}><CardCvcElement options={elementOptions}/></div>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: '#991b1b', margin: '0 0 12px' }}>{error}</p>
      )}

      <p style={{ fontSize: 11, color: t.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
        {"Votre carte est tokenisée par Stripe. FlowIA n'a jamais accès au numéro complet."}
      </p>

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={onCancel} disabled={busy}
                style={{ flex: 1, padding: 10, borderRadius: 8,
                         fontSize: 14, fontWeight: 500, cursor: busy ? 'wait' : 'pointer',
                         background: 'transparent', color: t.text,
                         border: `1px solid ${t.border}`, fontFamily: 'inherit' }}>
          Annuler
        </button>
        <button type="submit" disabled={busy || !stripe}
                style={{ flex: 1, padding: 10, borderRadius: 8,
                         fontSize: 14, fontWeight: 500, cursor: busy ? 'wait' : 'pointer',
                         background: t.text, color: t.canvas,
                         border: 'none', fontFamily: 'inherit',
                         opacity: (busy || !stripe) ? 0.7 : 1 }}>
          {busy ? 'Ajout en cours…' : 'Ajouter la carte'}
        </button>
      </div>
    </form>
  );
}

// ─── Carte unique compacte pour utilisateur abonné ─────────────────────────
// Une SEULE card avec toutes les infos + actions principales en boutons.
// Les sous-vues (changer de plan, cartes, factures) ouvrent des modaux pour
// éviter le scroll long de la page.
function CompactSubscriptionCard({ sub, t, busyAction, busyPortal, showToast,
                                   onChangePeriod, onChangePlan, onCancel,
                                   onReactivate, onPortal }) {
  const [modal, setModal] = useState(null); // 'plan' | 'cards' | 'invoices'
  const planDef       = PLAN_DEFS[sub.plan];
  if (!planDef) return null;

  const isYearly      = sub.period === 'yearly';
  const isCanceling   = !!sub.cancel_at_period_end;
  const annualSavings = (planDef.monthly * 12) - planDef.annual;
  const upgradeId     = nextPlanId(sub.plan);
  const downgradeId   = prevPaidPlanId(sub.plan);
  const periodEndStr  = sub.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric'
      })
    : null;

  const canChangeOfPlan = !isCanceling && (upgradeId || downgradeId);

  return (
    <>
      <section style={{
        padding: 22, borderRadius: 12,
        background: t.card, border: `1px solid ${t.border}`,
        boxShadow: t.shadowMd,
      }}>
        {/* En-tête : nom plan + badges */}
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', flexWrap: 'wrap', gap: 8,
                      marginBottom: 4 }}>
          <div>
            <p style={{ fontSize: 11, color: t.muted, margin: 0, marginBottom: 4,
                        textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
              Mon abonnement
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 500, color: t.text, margin: 0,
                         letterSpacing: '-0.01em' }}>
              {planDef.name}
              <span style={{ fontSize: 14, color: t.muted, fontWeight: 400, marginLeft: 8 }}>
                {isYearly ? 'Annuel' : 'Mensuel'}
              </span>
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sub.status === 'trialing' && (
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99,
                             background: '#ecfdf5', color: '#10b981', fontWeight: 500 }}>
                Essai gratuit
              </span>
            )}
            {isCanceling && (
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99,
                             background: '#fef2f2', color: '#991b1b', fontWeight: 500 }}>
                Annulation programmée
              </span>
            )}
            {sub.is_past_due && (
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99,
                             background: '#fffbeb', color: '#92400e', fontWeight: 500 }}>
                Paiement en échec
              </span>
            )}
          </div>
        </div>

        {/* Prix + dates */}
        <p style={{ fontSize: 14, color: t.text, margin: '8px 0 4px' }}>
          <strong style={{ fontWeight: 500 }}>
            {isYearly ? `${planDef.annual} €/an` : `${planDef.monthly} €/mois`}
          </strong>
          {isYearly && (
            <span style={{ fontSize: 13, color: t.muted, marginLeft: 8 }}>
              {`(soit ${formatPrice(planDef.yearly)} €/mois)`}
            </span>
          )}
        </p>
        {periodEndStr && (
          <p style={{ fontSize: 12, color: t.muted, margin: '0 0 18px' }}>
            {isCanceling
              ? `Accès maintenu jusqu'au ${periodEndStr}, puis bascule sur Découverte.`
              : `Prochain renouvellement le ${periodEndStr}.`}
          </p>
        )}

        {/* Actions principales en grille responsive */}
        <div style={{
          display: 'grid', gap: 8,
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          marginTop: 10,
        }}>
          {/* Action principale : reactiver si annulation, sinon upgrade/period */}
          {isCanceling ? (
            <button onClick={onReactivate} disabled={busyAction === 'reactivate'}
                    style={btnPrimary(t, busyAction === 'reactivate')}>
              {busyAction === 'reactivate' ? 'Réactivation…' : 'Réactiver mon abonnement'}
            </button>
          ) : (
            <>
              {upgradeId && (
                <button onClick={() => setModal('plan')}
                        style={btnPrimary(t, false)}>
                  {`Passer à ${PLAN_DEFS[upgradeId].name}`}
                </button>
              )}
              {!isYearly && annualSavings > 0 && (
                <button onClick={() => onChangePeriod('yearly')}
                        disabled={busyAction === 'change'}
                        style={btnGhost(t, busyAction === 'change')}>
                  {busyAction === 'change' ? '…' : `Annuel · économisez ${annualSavings} €`}
                </button>
              )}
              {isYearly && (
                <button onClick={() => onChangePeriod('monthly')}
                        disabled={busyAction === 'change'}
                        style={btnGhost(t, busyAction === 'change')}>
                  {busyAction === 'change' ? '…' : 'Repasser en mensuel'}
                </button>
              )}
              {/* Si plan haut (Équipe), afficher Changer de plan pour aller voir downgrade */}
              {!upgradeId && downgradeId && (
                <button onClick={() => setModal('plan')} style={btnGhost(t, false)}>
                  Changer de plan
                </button>
              )}
            </>
          )}
          <button onClick={() => setModal('cards')} style={btnGhost(t, false)}>
            Mes cartes bancaires
          </button>
          <button onClick={() => setModal('invoices')} style={btnGhost(t, false)}>
            Mes factures
          </button>
        </div>

        {/* Actions secondaires en bas, plus discrètes */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap',
                      paddingTop: 14, borderTop: `1px solid ${t.separator}` }}>
          {!isCanceling && (
            <button onClick={onCancel} disabled={busyAction === 'cancel'}
                    style={{ background: 'none', border: 'none', padding: 0,
                             color: '#991b1b', textDecoration: 'underline',
                             cursor: busyAction === 'cancel' ? 'wait' : 'pointer',
                             fontFamily: 'inherit', fontSize: 12 }}>
              {busyAction === 'cancel' ? 'Annulation…' : 'Annuler mon abonnement'}
            </button>
          )}
          <button onClick={onPortal} disabled={busyPortal}
                  style={{ background: 'none', border: 'none', padding: 0,
                           color: t.muted, textDecoration: 'underline',
                           cursor: busyPortal ? 'wait' : 'pointer',
                           fontFamily: 'inherit', fontSize: 12,
                           marginLeft: 'auto' }}>
            {busyPortal ? 'Ouverture…' : "Adresse de facturation →"}
          </button>
        </div>
      </section>

      {/* ── Modal Changer de plan ──────────────────────────────────────── */}
      <Modal open={modal === 'plan'} onClose={() => setModal(null)}
             title="Changer de plan" theme={t} maxW={520}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {upgradeId && (
            <UpgradeCard fromId={sub.plan} toId={upgradeId} period={sub.period}
                          t={t} busyAction={busyAction}
                          onConfirm={() => { setModal(null); onChangePlan(upgradeId, sub.period); }}/>
          )}
          {downgradeId && (
            <DowngradeCard fromId={sub.plan} toId={downgradeId} period={sub.period}
                            t={t} busyAction={busyAction}
                            onConfirm={() => { setModal(null); onChangePlan(downgradeId, sub.period); }}/>
          )}
        </div>
      </Modal>

      {/* ── Modal Mes cartes ───────────────────────────────────────────── */}
      <Modal open={modal === 'cards'} onClose={() => setModal(null)}
             title="Mes cartes bancaires" theme={t} maxW={520}>
        <PaymentMethodsSection theme={t} showToast={showToast} embedded/>
      </Modal>

      {/* ── Modal Mes factures ─────────────────────────────────────────── */}
      <Modal open={modal === 'invoices'} onClose={() => setModal(null)}
             title="Mes factures" theme={t} maxW={620}>
        <InvoicesSection theme={t} embedded/>
      </Modal>
    </>
  );
}

// Conservé pour compat legacy (free user view inchangée).
function SubscribedPlanView({ sub, t, busyAction, onChangePeriod, onChangePlan, onCancel, onReactivate }) {
  const planDef    = PLAN_DEFS[sub.plan];
  if (!planDef) return null;

  const isYearly       = sub.period === 'yearly';
  const otherPeriod    = isYearly ? 'monthly' : 'yearly';
  const annualSavings  = (planDef.monthly * 12) - planDef.annual; // ex: 288-240=48
  const upgradeId      = nextPlanId(sub.plan);
  const downgradeId    = prevPaidPlanId(sub.plan);
  const isCanceling    = !!sub.cancel_at_period_end;
  const periodEndStr   = sub.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric'
      })
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Plan actuel ────────────────────────────────────────────────── */}
      <section style={{
        padding: 22, borderRadius: 12,
        background: t.card, border: `1px solid ${t.border}`,
        boxShadow: t.shadowMd,
      }}>
        <p style={{ fontSize: 11, color: t.muted, margin: 0, marginBottom: 4,
                    textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
          Plan actuel
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 22, fontWeight: 500, color: t.text, margin: 0,
                       letterSpacing: '-0.01em' }}>
            {planDef.name}
          </h2>
          <span style={{ fontSize: 13, color: t.muted }}>
            · {isYearly ? 'Annuel' : 'Mensuel'}
          </span>
          {sub.status === 'trialing' && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99,
                           background: '#ecfdf5', color: '#10b981', fontWeight: 500 }}>
              Essai gratuit
            </span>
          )}
        </div>
        <p style={{ fontSize: 14, color: t.text, margin: 0, marginBottom: 4 }}>
          <strong style={{ fontWeight: 500 }}>
            {isYearly ? `${planDef.annual} €/an` : `${planDef.monthly} €/mois`}
          </strong>
          {isYearly && (
            <span style={{ fontSize: 13, color: t.muted, marginLeft: 8 }}>
              {`(soit ${formatPrice(planDef.yearly)} €/mois)`}
            </span>
          )}
        </p>
        {periodEndStr && (
          <p style={{ fontSize: 12, color: t.muted, margin: '4px 0 0' }}>
            {isCanceling
              ? `Accès maintenu jusqu'au ${periodEndStr}, puis bascule sur Découverte (gratuit).`
              : `Prochain renouvellement le ${periodEndStr}.`}
          </p>
        )}

        {/* Actions inline sur le plan actuel */}
        {!isCanceling && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {!isYearly && annualSavings > 0 && (
              <button onClick={() => onChangePeriod('yearly')}
                      disabled={busyAction === 'change'}
                      style={btnPrimary(t, busyAction === 'change')}>
                {busyAction === 'change'
                  ? 'Changement…'
                  : `Passer en annuel · économisez ${annualSavings} €`}
              </button>
            )}
            {isYearly && (
              <button onClick={() => onChangePeriod('monthly')}
                      disabled={busyAction === 'change'}
                      style={btnGhost(t, busyAction === 'change')}>
                {busyAction === 'change' ? 'Changement…' : 'Repasser en mensuel'}
              </button>
            )}
          </div>
        )}
        {isCanceling && (
          <button onClick={onReactivate} disabled={busyAction === 'reactivate'}
                  style={{ ...btnPrimary(t, busyAction === 'reactivate'), marginTop: 16, width: 'auto' }}>
            {busyAction === 'reactivate' ? 'Réactivation…' : 'Réactiver mon abonnement'}
          </button>
        )}
      </section>

      {/* ── Carte Upgrade (essentiel → équipe) ─────────────────────────── */}
      {upgradeId && !isCanceling && (
        <UpgradeCard fromId={sub.plan} toId={upgradeId} period={sub.period}
                     t={t} busyAction={busyAction}
                     onConfirm={() => onChangePlan(upgradeId, sub.period)}/>
      )}

      {/* ── Carte Downgrade plan payant (équipe → essentiel) ──────────── */}
      {downgradeId && !isCanceling && (
        <DowngradeCard fromId={sub.plan} toId={downgradeId} period={sub.period}
                       t={t} busyAction={busyAction}
                       onConfirm={() => onChangePlan(downgradeId, sub.period)}/>
      )}

      {/* ── Carte Annulation totale vers gratuit ───────────────────────── */}
      {!isCanceling && (
        <CancelToFreeCard fromId={sub.plan} t={t} busyAction={busyAction} onCancel={onCancel}/>
      )}
    </div>
  );
}

function UpgradeCard({ fromId, toId, period, t, busyAction, onConfirm }) {
  const fromDef = PLAN_DEFS[fromId];
  const toDef   = PLAN_DEFS[toId];
  const fromPrice = period === 'yearly' ? fromDef.yearly : fromDef.monthly;
  const toPrice   = period === 'yearly' ? toDef.yearly   : toDef.monthly;
  const diff      = Math.round((toPrice - fromPrice) * 100) / 100;
  const gains     = gainsForUpgrade(fromId, toId);
  const busy      = busyAction === 'change';

  return (
    <section style={{
      padding: 22, borderRadius: 12,
      background: t.card, border: `1px solid ${t.text}`,
      boxShadow: t.shadowMd, position: 'relative',
    }}>
      <span style={{
        position: 'absolute', top: -10, left: 20,
        fontSize: 10, fontWeight: 500, padding: '3px 9px', borderRadius: 99,
        background: t.text, color: t.canvas, letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}>Upgrade recommandé</span>
      <h3 style={{ fontSize: 17, fontWeight: 500, color: t.text, margin: '4px 0 4px',
                   letterSpacing: '-0.01em' }}>
        {`Passer à ${toDef.name}`}
      </h3>
      <p style={{ fontSize: 13, color: t.muted, margin: '0 0 14px' }}>
        {`+${formatPrice(diff)} €/mois · soit ${formatPrice(toPrice)} €/mois`}
        {period === 'yearly' && ` (${toDef.annual} €/an)`}
      </p>
      <p style={{ fontSize: 13, color: t.text, margin: '0 0 8px', fontWeight: 500 }}>
        Vous gagnerez :
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px',
                   display: 'flex', flexDirection: 'column', gap: 7 }}>
        {gains.map(f => (
          <li key={f} style={{ fontSize: 13, color: t.textSub,
                               paddingLeft: 22, position: 'relative', lineHeight: 1.5 }}>
            <span style={{ position: 'absolute', left: 0, top: 2,
                           width: 14, height: 14, borderRadius: 7,
                           background: '#ecfdf5', color: '#10b981',
                           display: 'inline-flex', alignItems: 'center',
                           justifyContent: 'center', fontSize: 10, fontWeight: 600 }}>
              {"+"}
            </span>
            {f}
          </li>
        ))}
      </ul>
      <button onClick={onConfirm} disabled={busy} style={btnPrimary(t, busy)}>
        {busy ? 'Changement…' : `Passer à ${toDef.name}`}
      </button>
      <p style={{ fontSize: 11, color: t.muted, margin: '10px 0 0', textAlign: 'center' }}>
        {"Différence facturée immédiatement au prorata. Effet immédiat."}
      </p>
    </section>
  );
}

function DowngradeCard({ fromId, toId, period, t, busyAction, onConfirm }) {
  const fromDef = PLAN_DEFS[fromId];
  const toDef   = PLAN_DEFS[toId];
  const fromPrice = period === 'yearly' ? fromDef.yearly : fromDef.monthly;
  const toPrice   = period === 'yearly' ? toDef.yearly   : toDef.monthly;
  const savings   = Math.round((fromPrice - toPrice) * 100) / 100;
  const losses    = lossesForDowngrade(fromId, toId);
  const busy      = busyAction === 'change';

  return (
    <section style={{
      padding: 22, borderRadius: 12,
      background: t.card, border: `1px solid ${t.border}`,
      boxShadow: t.shadowSm,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 500, color: t.text, margin: '0 0 4px' }}>
        {`Repasser à ${toDef.name}`}
      </h3>
      <p style={{ fontSize: 12, color: t.muted, margin: '0 0 14px' }}>
        {`Économisez ${formatPrice(savings)} €/mois — ${formatPrice(toPrice)} €/mois`}
      </p>
      <div style={{
        padding: '10px 12px', borderRadius: 8,
        background: '#fffbeb', border: '1px solid #fde68a',
        marginBottom: 14,
      }}>
        <p style={{ fontSize: 12, color: '#92400e', fontWeight: 500, margin: '0 0 6px' }}>
          {"Vous perdrez :"}
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0,
                     display: 'flex', flexDirection: 'column', gap: 4 }}>
          {losses.map(f => (
            <li key={f} style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>
              {"− "}{f}
            </li>
          ))}
        </ul>
      </div>
      <button onClick={onConfirm} disabled={busy} style={btnGhost(t, busy)}>
        {busy ? 'Changement…' : `Repasser à ${toDef.name}`}
      </button>
      <p style={{ fontSize: 11, color: t.muted, margin: '10px 0 0', textAlign: 'center' }}>
        {"Crédit appliqué sur votre prochaine facture. Effet immédiat."}
      </p>
    </section>
  );
}

function CancelToFreeCard({ fromId, t, busyAction, onCancel }) {
  const losses = lossesForDowngrade(fromId, 'decouverte');
  const busy   = busyAction === 'cancel';

  return (
    <section style={{
      padding: 22, borderRadius: 12,
      background: t.card, border: `1px solid ${t.border}`,
      boxShadow: t.shadowSm,
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 500, color: t.muted, margin: '0 0 4px' }}>
        {"Annuler mon abonnement"}
      </h3>
      <p style={{ fontSize: 12, color: t.muted, margin: '0 0 12px', lineHeight: 1.5 }}>
        {"Vous repasserez sur le plan Découverte (gratuit, fonctionnalités limitées) à la fin de la période en cours. Aucun remboursement n'est dû — vous gardez l'accès payant jusqu'à cette date."}
      </p>
      <details style={{ marginBottom: 12 }}>
        <summary style={{ fontSize: 12, color: t.textSub, cursor: 'pointer', userSelect: 'none' }}>
          {"Voir tout ce que je vais perdre"}
        </summary>
        <ul style={{ listStyle: 'none', padding: '8px 0 0', margin: 0,
                     display: 'flex', flexDirection: 'column', gap: 4 }}>
          {losses.map(f => (
            <li key={f} style={{ fontSize: 12, color: t.textSub, lineHeight: 1.5 }}>
              {"− "}{f}
            </li>
          ))}
        </ul>
      </details>
      <button onClick={onCancel} disabled={busy}
              style={{ padding: '8px 14px', fontSize: 12, fontWeight: 500,
                       background: 'transparent', color: '#991b1b',
                       border: '1px solid #fecaca', borderRadius: 8,
                       cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
        {busy ? 'Annulation…' : "Annuler mon abonnement"}
      </button>
    </section>
  );
}

// ─── Section Factures inline ────────────────────────────────────────────────
// Liste les 12 dernières factures du customer Stripe.
// Prop `embedded` : true = pas de card englobante (utilisé dans un Modal).
function InvoicesSection({ theme: t, embedded = false }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.listSubscriptionInvoices()
      .then(data => { if (!cancelled) setInvoices(data?.invoices || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const Wrapper      = embedded ? 'div' : 'section';
  const wrapperStyle = embedded
    ? { display: 'flex', flexDirection: 'column' }
    : {
        padding: 22, borderRadius: 12,
        background: t.card, border: `1px solid ${t.border}`,
        boxShadow: t.shadowSm,
      };

  return (
    <Wrapper style={wrapperStyle}>
      {!embedded && (
        <h2 style={{ fontSize: 15, fontWeight: 500, color: t.text, margin: '0 0 4px' }}>
          Historique des factures
        </h2>
      )}
      <p style={{ fontSize: 12, color: t.muted, margin: '0 0 14px' }}>
        {"Téléchargez vos factures officielles pour votre comptabilité."}
      </p>

      {loading ? (
        <p style={{ fontSize: 13, color: t.muted, margin: 0 }}>Chargement…</p>
      ) : invoices.length === 0 ? (
        <p style={{ fontSize: 13, color: t.muted, margin: 0, lineHeight: 1.5 }}>
          {"Aucune facture pour le moment. La première sera émise au prochain renouvellement."}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0,
                     display: 'flex', flexDirection: 'column', gap: 6 }}>
          {invoices.map(inv => (
            <li key={inv.id} style={{
              padding: '10px 12px', borderRadius: 8,
              border: `1px solid ${t.border}`,
              background: t.canvas,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: t.muted, fontFamily: 'monospace',
                               minWidth: 80 }}>
                  {inv.number || inv.id.slice(-8)}
                </span>
                <span style={{ fontSize: 13, color: t.text }}>
                  {inv.created
                    ? new Date(inv.created).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })
                    : '—'}
                </span>
                <span style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>
                  {invoiceAmount(inv)}
                </span>
                <span style={invoiceStatusStyle(inv.status)}>
                  {invoiceStatusLabel(inv.status)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {inv.pdf && (
                  <a href={inv.pdf} target="_blank" rel="noopener noreferrer"
                     style={{ fontSize: 12, color: t.text, textDecoration: 'none',
                              padding: '5px 10px', borderRadius: 6,
                              border: `1px solid ${t.border}`, fontFamily: 'inherit' }}>
                    PDF
                  </a>
                )}
                {inv.hosted_url && (
                  <a href={inv.hosted_url} target="_blank" rel="noopener noreferrer"
                     style={{ fontSize: 12, color: t.muted, textDecoration: 'none',
                              padding: '5px 10px', borderRadius: 6,
                              border: `1px solid ${t.border}`, fontFamily: 'inherit' }}>
                    Voir
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Wrapper>
  );
}

function invoiceAmount(inv) {
  if (typeof inv.amount !== 'number') return '—';
  const cur = (inv.currency || 'eur').toUpperCase();
  if (cur === 'EUR') return `${formatPrice(inv.amount)} €`;
  return `${formatPrice(inv.amount)} ${cur}`;
}
function invoiceStatusLabel(s) {
  if (s === 'paid')           return 'Payée';
  if (s === 'open')           return 'En attente';
  if (s === 'void')           return 'Annulée';
  if (s === 'draft')          return 'Brouillon';
  if (s === 'uncollectible')  return 'Irrecouvrable';
  return s || '—';
}
function invoiceStatusStyle(s) {
  const base = { fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500 };
  if (s === 'paid')          return { ...base, background: '#ecfdf5', color: '#10b981' };
  if (s === 'open')          return { ...base, background: '#fffbeb', color: '#92400e' };
  if (s === 'uncollectible' || s === 'void')
                              return { ...base, background: '#fef2f2', color: '#991b1b' };
  return { ...base, background: 'rgba(0,0,0,0.06)', color: '#6B7280' };
}
