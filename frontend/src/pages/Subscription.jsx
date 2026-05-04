// Subscription.jsx — Page /abonnement : choix du plan + gestion de l'abonnement
//
// 3 plans : Découverte (gratuit) / Essentiel (24€mois|240€an) / Équipe (49€mois|490€an).
// - Free user : 3 cartes plein format pour comparer + bouton 'S'abonner'.
// - Subscribed user : 4 sections flat empilees (Plan / Cartes / Coordonnees /
//   Factures) — TOUT inline, AUCUNE redirection vers le portail Stripe.
// - 14 jours d'essai gratuit sur Essentiel uniquement (sans CB requise).
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
        showToast(e?.message || 'Erreur lors de la création de la session.', 'error');
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
      const msg = e?.message || 'Erreur lors de la création de la session.';
      showToast(msg, 'error');
      setBusyPlan(null);
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

  const handleCancel = async () => {
    // Defensive : si current_period_end manque (backfill backend pas encore
    // arrive ou rate condition), on tente un refresh frais avant d'ouvrir
    // la modale. Le backend /me fait un backfill auto depuis Stripe live.
    let liveSub = sub;
    if (!liveSub?.current_period_end && liveSub?.has_subscription) {
      try {
        liveSub = await api.getSubscription();
        setSub(liveSub);
      } catch {}
    }
    const periodEndDate = liveSub?.current_period_end ? new Date(liveSub.current_period_end) : null;
    const periodEndLong = periodEndDate
      ? periodEndDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const daysLeft = periodEndDate
      ? Math.max(0, Math.ceil((periodEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

    setConfirmCfg({
      title: "Annuler l'abonnement",
      message: (
        <>
          <div style={{ padding: '12px 14px', borderRadius: 10,
                        background: t.cardAlt, border: `1px solid ${t.border}`,
                        marginBottom: 12 }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, color: t.muted,
                        textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
              Date d'annulation effective
            </p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: t.text }}>
              {periodEndLong || '—'}
            </p>
            {daysLeft !== null && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: t.muted }}>
                {`Soit dans ${daysLeft} ${daysLeft > 1 ? 'jours' : 'jour'}.`}
              </p>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: t.text, lineHeight: 1.55 }}>
            {"Vous gardez l'accès complet à toutes les fonctionnalités payantes jusqu'à cette date. Aucun nouveau prélèvement ne sera effectué après. Votre compte basculera ensuite automatiquement sur le plan Découverte (gratuit)."}
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: t.muted, lineHeight: 1.55 }}>
            {"Aucun remboursement n'est dû pour la période en cours. Vous pouvez réactiver à tout moment avant l'annulation effective."}
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
          showToast(periodEndLong
            ? `Annulation programmée pour le ${periodEndLong}.`
            : 'Abonnement annulé.', 'ok');
          await refreshSub();
        } catch (e) {
          showToast(e?.message || "Erreur lors de l'annulation.", 'error');
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
      const nextBilling = sub?.current_period_end
        ? new Date(sub.current_period_end).toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', year: 'numeric'
          })
        : null;
      showToast(nextBilling
        ? `Abonnement réactivé. Prochain prélèvement le ${nextBilling}.`
        : 'Abonnement réactivé.', 'ok');
      await refreshSub();
    } catch (e) {
      showToast(e?.message || 'Erreur lors de la réactivation.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleChangePlan = async (newPlan, newPeriod) => {
    const isUpgrade = (sub?.plan === 'essentiel' && newPlan === 'equipe')
                   || (sub?.period === 'monthly' && newPeriod === 'yearly');

    // Defensive : refresh frais si pas de date locale (backfill backend kicks in).
    if (!sub?.current_period_end && sub?.has_subscription) {
      try {
        const liveSub = await api.getSubscription();
        setSub(liveSub);
      } catch {}
    }

    // Fetch preview Stripe pour afficher des chiffres concrets dans la modale.
    let preview = null;
    try {
      preview = await api.previewSubscriptionChange({ plan: newPlan, period: newPeriod });
    } catch (e) {
      console.warn('[Subscription] previewSubscriptionChange', e?.message);
    }

    const fmt = (n) => {
      const v = Math.abs(n).toFixed(2).replace('.', ',');
      return `${v} €`;
    };
    const formatLongDate = (iso) => {
      try {
        return new Date(iso).toLocaleDateString('fr-FR', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
      } catch { return null; }
    };

    setConfirmCfg({
      title: `Passer à ${planLabel(newPlan)} ${newPeriod === 'yearly' ? 'annuel' : 'mensuel'}`,
      message: (
        <>
          {/* Bloc résumé : effet + chiffres concrets si preview dispo */}
          <div style={{ padding: '12px 14px', borderRadius: 10,
                        background: t.cardAlt, border: `1px solid ${t.border}`,
                        marginBottom: 12 }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, color: t.muted,
                        textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
              Date d'effet
            </p>
            <p style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 500, color: t.text }}>
              Aujourd'hui — accès immédiat aux nouvelles fonctionnalités
            </p>

            {preview?.available ? (
              <>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: t.muted,
                            textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
                  {preview.proration_immediate >= 0 ? 'Débit immédiat' : 'Crédit immédiat'}
                </p>
                <p style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 500,
                            color: preview.proration_immediate >= 0 ? t.text : '#10b981' }}>
                  {preview.proration_immediate >= 0
                    ? `${fmt(preview.proration_immediate)} (différence proratisée)`
                    : `${fmt(preview.proration_immediate)} appliqué sur votre prochaine facture`}
                </p>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: t.muted,
                            textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
                  Prochain prélèvement récurrent
                </p>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: t.text }}>
                  {fmt(preview.next_recurring)}
                  {preview.next_invoice_date && (
                    <span style={{ fontSize: 13, color: t.muted, fontWeight: 400 }}>
                      {` · le ${formatLongDate(preview.next_invoice_date)}`}
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: t.muted, lineHeight: 1.5 }}>
                {isUpgrade
                  ? "La différence proratisée sera facturée immédiatement. Le détail apparaîtra dans votre historique de factures."
                  : "Un crédit proratisé sera appliqué sur votre prochaine facture."}
              </p>
            )}
          </div>

          <p style={{ margin: 0, fontSize: 12, color: t.muted, lineHeight: 1.55 }}>
            {"Vous pouvez changer de plan à nouveau à tout moment depuis cette page."}
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
          showToast(e?.message || 'Erreur changement de plan.', 'error');
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

        {/* Squelette de chargement (avant le 1er /me). Disparait des que les
            donnees sont la, le contenu reel prend le relais. */}
        {loading && <PageSkeleton t={t}/>}

        {/* Bandeau past_due */}
        {!loading && sub?.is_past_due && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: '#fffbeb', border: '1px solid #fde68a',
            color: '#92400e', fontSize: 13,
          }}>
            {"Votre dernier paiement a échoué. Mettez à jour votre carte ci-dessous pour conserver l'accès."}
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
              {". Ajoutez une carte ci-dessous pour continuer sans interruption."}
            </span>
            <button onClick={() => {
                      document.getElementById('payment-methods-section')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    style={{ ...btnPrimary(t, false), width: 'auto', padding: '8px 14px' }}>
              Ajouter une carte ↓
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
            showToast={showToast}
            onChangePeriod={(newPeriod) => handleChangePlan(sub.plan, newPeriod)}
            onChangePlan={handleChangePlan}
            onCancel={handleCancel}
            onReactivate={handleReactivate}
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

// ─── Skeleton placeholder pour chargement initial ──────────────────────────
// Statique (pas d'animation CSS pour eviter d'injecter du @keyframes global).
// Les chargements sont generalement courts (<1s), un placeholder gris suffit.
function Skeleton({ width = '100%', height = 16, t, style = {} }) {
  return (
    <div style={{
      width, height, borderRadius: 4,
      background: t.cardAlt,
      ...style,
    }}/>
  );
}

// Squelette de la page complete (avant le 1er fetch /me).
function PageSkeleton({ t }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Plan actuel */}
      <section style={{
        padding: 22, borderRadius: 12,
        background: t.card, border: `1px solid ${t.border}`,
        boxShadow: t.shadowSm,
      }}>
        <Skeleton width={120} height={12} t={t} style={{ marginBottom: 10 }}/>
        <Skeleton width={180} height={22} t={t} style={{ marginBottom: 10 }}/>
        <Skeleton width={140} height={14} t={t} style={{ marginBottom: 16 }}/>
        <Skeleton width="100%" height={64} t={t} style={{ borderRadius: 8 }}/>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Skeleton width={140} height={36} t={t} style={{ borderRadius: 8 }}/>
          <Skeleton width={120} height={36} t={t} style={{ borderRadius: 8 }}/>
        </div>
      </section>
      {/* 3 sections collapsibles */}
      {[1, 2, 3].map(i => (
        <section key={i} style={{
          padding: '14px 18px', borderRadius: 12,
          background: t.card, border: `1px solid ${t.border}`,
          boxShadow: t.shadowSm,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Skeleton width={180} height={14} t={t}/>
          <Skeleton width={14} height={14} t={t}/>
        </section>
      ))}
    </div>
  );
}

// Section accordion repliable (utilise <details> natif HTML pour
// l'accessibilite + zero JS de toggle). Peut etre ouvert par defaut.
function CollapsibleSection({ title, t, defaultOpen = false, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{
      borderRadius: 12,
      background: t.card, border: `1px solid ${t.border}`,
      boxShadow: t.shadowSm, overflow: 'hidden',
    }}>
      <button onClick={() => setOpen(!open)}
              style={{
                width: '100%', background: 'transparent', border: 'none',
                padding: '14px 18px', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12,
              }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: t.text }}>{title}</span>
          {badge}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             style={{ transition: 'transform 0.2s', flexShrink: 0,
                      transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          <path d="M9 18l6-6-6-6" stroke={t.muted} strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${t.separator}`,
                      paddingTop: 16 }}>
          {children}
        </div>
      )}
    </section>
  );
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
      showToast(e?.message || 'Erreur', 'error');
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
      showToast(e?.message || 'Erreur lors de la suppression.', 'error');
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

// ─── Vue subscribed user façon Stripe Dashboard / Claude.ai ─────────────────
// 4 sections flat empilées (Plan + Modes de paiement + Coordonnées de
// facturation + Historique de facturation). Tout inline, aucune redirection
// vers un portail externe. Une seule modale pour comparer plans (gains/pertes).
function CompactSubscriptionCard({ sub, t, busyAction, showToast,
                                   onChangePeriod, onChangePlan, onCancel,
                                   onReactivate }) {
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const planDef       = PLAN_DEFS[sub.plan];
  if (!planDef) return null;

  const isAdminGranted = !!sub.is_admin_granted;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Section 1 : Plan actuel ──────────────────────────────────── */}
      <FlatSection title="Plan actuel" t={t}
                   right={
                     !isAdminGranted && !isCanceling && (upgradeId || downgradeId) ? (
                       <button onClick={() => setPlanModalOpen(true)}
                               style={linkBtn(t)}>
                         Changer de plan
                       </button>
                     ) : null
                   }>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8,
                      flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 500, color: t.text }}>
            {planDef.name}
          </span>
          <span style={{ fontSize: 13, color: t.muted }}>
            · {isYearly ? 'Annuel' : 'Mensuel'}
          </span>
          {isAdminGranted && (
            <span style={badgeStyle('blue')}>Plan offert</span>
          )}
          {!isAdminGranted && sub.status === 'trialing' && (
            <span style={badgeStyle('green')}>Essai gratuit</span>
          )}
          {!isAdminGranted && isCanceling && (
            <span style={badgeStyle('red')}>Annulation programmée</span>
          )}
          {!isAdminGranted && sub.is_past_due && (
            <span style={badgeStyle('orange')}>Paiement en échec</span>
          )}
        </div>
        <p style={{ fontSize: 13, color: t.text, margin: '0 0 2px' }}>
          {isAdminGranted
            ? <span style={{ color: '#10b981', fontWeight: 500 }}>Gratuit · offert par FlowIA</span>
            : (isYearly ? `${planDef.annual} €/an` : `${planDef.monthly} €/mois`)}
          {!isAdminGranted && isYearly && (
            <span style={{ color: t.muted, marginLeft: 6 }}>
              {`(soit ${formatPrice(planDef.yearly)} €/mois)`}
            </span>
          )}
        </p>

        {/* Bloc infos contextuel : adapte le message a la situation
            (essai, prochaine facturation, annulation programmee, paiement
            en echec, plan offert) avec dates explicites. */}
        <StatusInfoBox sub={sub} planDef={planDef} t={t}/>

        {/* Actions — masquees pour les utilisateurs en plan offert
            (ils ne paient pas, ne peuvent pas annuler eux-memes ; tout passe
            par le superadmin via /admin). */}
        {!isAdminGranted && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {isCanceling ? (
            <button onClick={onReactivate} disabled={busyAction === 'reactivate'}
                    style={{ ...btnPrimary(t, busyAction === 'reactivate'), width: 'auto', padding: '8px 14px' }}>
              {busyAction === 'reactivate' ? 'Réactivation…' : 'Réactiver le plan'}
            </button>
          ) : (
            <>
              {!isYearly && annualSavings > 0 && (
                <button onClick={() => onChangePeriod('yearly')}
                        disabled={busyAction === 'change'}
                        style={{ ...btnGhost(t, busyAction === 'change'), width: 'auto', padding: '8px 14px' }}>
                  {busyAction === 'change' ? '…' : `Passer en annuel · −${annualSavings} €`}
                </button>
              )}
              {isYearly && (
                <button onClick={() => onChangePeriod('monthly')}
                        disabled={busyAction === 'change'}
                        style={{ ...btnGhost(t, busyAction === 'change'), width: 'auto', padding: '8px 14px' }}>
                  {busyAction === 'change' ? '…' : 'Repasser en mensuel'}
                </button>
              )}
              <button onClick={onCancel} disabled={busyAction === 'cancel'}
                      style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500,
                               background: 'transparent', color: '#991b1b',
                               border: '1px solid #fecaca', borderRadius: 8,
                               cursor: busyAction === 'cancel' ? 'wait' : 'pointer',
                               fontFamily: 'inherit' }}>
                {busyAction === 'cancel' ? 'Annulation…' : 'Annuler le plan'}
              </button>
            </>
          )}
        </div>
        )}
      </FlatSection>

      {/* ── Section 2 : Modes de paiement (collapsible) ──────────────── */}
      <div id="payment-methods-section">
        <CollapsibleSection title="Modes de paiement" t={t} defaultOpen={false}>
          <PaymentMethodsSection theme={t} showToast={showToast} embedded/>
        </CollapsibleSection>
      </div>

      {/* ── Section 3 : Coordonnées de facturation (collapsible) ──────── */}
      <CollapsibleSection title="Coordonnées de facturation" t={t} defaultOpen={false}>
        <BillingDetailsSection theme={t} showToast={showToast} embedded/>
      </CollapsibleSection>

      {/* ── Section 4 : Historique de facturation (collapsible) ──────── */}
      <CollapsibleSection title="Historique de facturation" t={t} defaultOpen={false}>
        <InvoicesSection theme={t} embedded/>
      </CollapsibleSection>

      {/* ── Modal Changer de plan ──────────────────────────────────────── */}
      <Modal open={planModalOpen} onClose={() => setPlanModalOpen(false)}
             title="Changer de plan" theme={t} maxW={520}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {upgradeId && (
            <UpgradeCard fromId={sub.plan} toId={upgradeId} period={sub.period}
                          t={t} busyAction={busyAction}
                          onConfirm={() => { setPlanModalOpen(false); onChangePlan(upgradeId, sub.period); }}/>
          )}
          {downgradeId && (
            <DowngradeCard fromId={sub.plan} toId={downgradeId} period={sub.period}
                            t={t} busyAction={busyAction}
                            onConfirm={() => { setPlanModalOpen(false); onChangePlan(downgradeId, sub.period); }}/>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ─── Bloc d'infos contextuel sur l'état de l'abonnement ────────────────────
// Affiche un message structure adapte a la situation courante avec dates
// explicites + nombre de jours restants. Couvre tous les cas :
// - Essai gratuit en cours -> J-X jusqu'a la 1ere facturation
// - Essai en cours + annulation programmee -> aucune facturation
// - Actif normal -> prochain prelevement avec montant et date
// - Actif + annulation programmee -> date de bascule sur Decouverte
// - Paiement en echec (past_due) -> instructions pour eviter l'interruption
function StatusInfoBox({ sub, planDef, t }) {
  const isAdminGranted = !!sub.is_admin_granted;
  const isCanceling   = !!sub.cancel_at_period_end;
  const isTrial       = sub.status === 'trialing';
  const isPastDue     = !!sub.is_past_due;
  const isYearly      = sub.period === 'yearly';
  const recurringPrice = isYearly ? planDef.annual : planDef.monthly;
  const periodLabel   = isYearly ? 'an' : 'mois';

  const parseDate = (iso) => { try { return iso ? new Date(iso) : null; } catch { return null; } };
  const periodEndDate = parseDate(sub.current_period_end);
  const trialEndDate  = parseDate(sub.trial_ends_at);

  const formatLong = (d) => d ? d.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }) : '—';
  const daysUntil = (d) => d
    ? Math.max(0, Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const daysSuffix = (n) => n == null ? '' : ` (dans ${n} ${n > 1 ? 'jours' : 'jour'})`;

  // ── Détermine titre + lignes selon le contexte ─────────────────────────
  let color, title, lines;
  if (isAdminGranted) {
    color = 'blue';
    title = 'Plan offert par FlowIA';
    const grant = sub.admin_grant || {};
    const expiresLine = grant.expires_at
      ? `Valable jusqu'au ${formatLong(parseDate(grant.expires_at))}.`
      : 'Sans date d\'expiration — accès offert tant que l\'équipe FlowIA le souhaite.';
    lines = [
      `Le plan ${planDef.name} ${isYearly ? 'annuel' : 'mensuel'} est actif gracieusement.`,
      'Aucun prélèvement — vous bénéficiez de toutes les fonctionnalités sans payer.',
      expiresLine,
      grant.reason ? `Motif : ${grant.reason}` : null,
      'Pour toute question, contactez le support FlowIA.',
    ].filter(Boolean);
  } else if (isPastDue) {
    color = 'orange';
    title = 'Paiement en échec';
    lines = [
      "Votre dernier prélèvement n'a pas pu être effectué.",
      'Stripe va réessayer automatiquement dans les prochains jours.',
      'Mettez à jour votre carte dans la section "Modes de paiement" ci-dessous pour éviter une interruption d\'accès.',
    ];
  } else if (isTrial && isCanceling) {
    const endDate = trialEndDate || periodEndDate;
    color = 'orange';
    title = "Annulation programmée pendant l'essai";
    lines = [
      `Votre plan sera annulé le ${formatLong(endDate)}${daysSuffix(daysUntil(endDate))}.`,
      'Aucune facturation ne sera effectuée — vous ne payerez rien.',
      'Vous pouvez réactiver à tout moment avant cette date.',
    ];
  } else if (isTrial) {
    const endDate = trialEndDate || periodEndDate;
    color = 'green';
    title = "Période d'essai en cours";
    lines = [
      `Essai gratuit jusqu'au ${formatLong(endDate)}${daysSuffix(daysUntil(endDate))}.`,
      `Première facturation à cette date : ${recurringPrice} €.`,
      "Aucun prélèvement aujourd'hui — annulez à tout moment sans frais.",
    ];
  } else if (isCanceling) {
    color = 'red';
    title = 'Annulation programmée';
    lines = [
      `Votre plan ${planDef.name} sera annulé le ${formatLong(periodEndDate)}${daysSuffix(daysUntil(periodEndDate))}.`,
      "Vous gardez l'accès complet à toutes les fonctionnalités payantes jusqu'à cette date.",
      'Aucun nouveau prélèvement ne sera effectué après.',
      'Bascule automatique sur le plan Découverte (gratuit, fonctionnalités limitées).',
    ];
  } else {
    // Actif normal
    color = 'gray';
    title = 'Prochaine facturation';
    lines = [
      `${recurringPrice} € prélevés le ${formatLong(periodEndDate)}${daysSuffix(daysUntil(periodEndDate))}.`,
      `Renouvellement automatique tous les ${isYearly ? 'ans' : 'mois'}. Annulable à tout moment.`,
    ];
  }

  // ── Palette couleurs selon état (sans emoji, conforme FDS-2026) ────────
  const palettes = {
    green:  { bg: '#ecfdf5',     border: '#a7f3d0', stripe: '#10b981', title: '#065f46', text: '#047857' },
    orange: { bg: '#fffbeb',     border: '#fde68a', stripe: '#f59e0b', title: '#92400e', text: '#78350f' },
    red:    { bg: '#fef2f2',     border: '#fecaca', stripe: '#dc2626', title: '#991b1b', text: '#7f1d1d' },
    blue:   { bg: '#eff6ff',     border: '#bfdbfe', stripe: '#1e40af', title: '#1e3a8a', text: '#1e40af' },
    gray:   { bg: t.cardAlt,     border: t.border,  stripe: t.fg2 || t.text, title: t.text, text: t.textSub },
  };
  const c = palettes[color] || palettes.gray;

  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 10,
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderLeft: `3px solid ${c.stripe}`,
      marginTop: 12,
    }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500,
                  color: c.title, letterSpacing: 0.2,
                  textTransform: 'uppercase' }}>
        {title}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0,
                   display: 'flex', flexDirection: 'column', gap: 4 }}>
        {lines.map((line, i) => (
          <li key={i} style={{ fontSize: 13, color: c.text, lineHeight: 1.55 }}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Wrapper section "flat" homogène pour la vue subscribed ────────────────
function FlatSection({ title, right, t, children }) {
  return (
    <section style={{
      padding: '18px 20px', borderRadius: 12,
      background: t.card, border: `1px solid ${t.border}`,
      boxShadow: t.shadowSm,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', marginBottom: 12, gap: 12,
                    paddingBottom: 12, borderBottom: `1px solid ${t.separator}` }}>
        <h3 style={{ fontSize: 14, fontWeight: 500, color: t.text, margin: 0,
                     letterSpacing: '-0.01em' }}>
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function badgeStyle(color) {
  const palette = {
    green:  { bg: '#ecfdf5', fg: '#10b981' },
    red:    { bg: '#fef2f2', fg: '#991b1b' },
    orange: { bg: '#fffbeb', fg: '#92400e' },
    gray:   { bg: 'rgba(0,0,0,0.06)', fg: '#6B7280' },
  };
  const p = palette[color] || palette.gray;
  return {
    fontSize: 11, padding: '2px 8px', borderRadius: 99,
    background: p.bg, color: p.fg, fontWeight: 500,
  };
}

function linkBtn(t) {
  return {
    background: 'none', border: 'none', padding: 0, color: t.text,
    fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
    textDecoration: 'underline',
  };
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

// ─── Section Coordonnées de facturation (édition inline) ───────────────────
// Lit/écrit Stripe customer (name, email, phone, address). Aucune redirection
// vers le portail Stripe pour cette gestion.
function BillingDetailsSection({ theme: t, showToast, embedded = false }) {
  const [billing, setBilling]         = useState(null);
  const [fromProfile, setFromProfile] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [editing, setEditing]         = useState(false);
  const [busy, setBusy]               = useState(false);

  // Form fields locaux (entrent en sync avec billing quand on entre en édition).
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [phone,   setPhone]   = useState('');
  const [line1,   setLine1]   = useState('');
  const [line2,   setLine2]   = useState('');
  const [city,    setCity]    = useState('');
  const [postal,  setPostal]  = useState('');
  const [country, setCountry] = useState('FR');

  const load = async () => {
    try {
      const data = await api.getSubscriptionBillingInfo();
      setBilling(data?.billing || null);
      setFromProfile(!!data?.from_profile);
    } catch (e) { console.error('[Billing] load', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const startEdit = () => {
    const b = billing || {};
    const a = b.address || {};
    setName(b.name || '');
    setEmail(b.email || '');
    setPhone(b.phone || '');
    setLine1(a.line1 || '');
    setLine2(a.line2 || '');
    setCity(a.city || '');
    setPostal(a.postal_code || '');
    setCountry(a.country || 'FR');
    setEditing(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateSubscriptionBillingInfo({
        name, email, phone,
        address: { line1, line2, city, postal_code: postal, country },
      });
      showToast('Coordonnées mises à jour.', 'ok');
      setEditing(false);
      await load();
    } catch (err) {
      showToast(err?.data?.error || 'Erreur lors de la mise à jour.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '9px 11px', fontSize: 13,
    border: `1px solid ${t.borderInput}`, borderRadius: 8,
    background: t.inputBg, color: t.text,
    fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelStyle = {
    display: 'block', fontSize: 12, color: t.muted,
    marginBottom: 4, fontWeight: 500,
  };

  // Bouton Modifier en haut a droite si embedded (sans wrapper FlatSection).
  const editButton = (!editing && !loading && billing) ? (
    <button onClick={startEdit} style={linkBtn(t)}>Modifier</button>
  ) : null;

  const innerContent = (
    <>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width="60%" height={14} t={t}/>
          <Skeleton width="80%" height={14} t={t}/>
          <Skeleton width="50%" height={14} t={t}/>
        </div>
      ) : !billing ? (
        <p style={{ fontSize: 13, color: t.muted, margin: 0 }}>
          {"Aucune information de facturation. Souscrivez d'abord à un plan."}
        </p>
      ) : !editing ? (
        <div>
          {fromProfile && (
            <p style={{ fontSize: 11, color: t.muted, margin: '0 0 8px',
                        padding: '6px 10px', borderRadius: 6,
                        background: t.cardAlt, border: `1px solid ${t.border}` }}>
              {"Pré-rempli depuis votre profil commerçant. Cliquez sur Modifier pour utiliser une adresse de facturation différente."}
            </p>
          )}
          <div style={{ fontSize: 13, color: t.text, lineHeight: 1.6 }}>
            {billing.name && <div>{billing.name}</div>}
            {billing.email && <div style={{ color: t.muted }}>{billing.email}</div>}
            {billing.phone && <div style={{ color: t.muted }}>{billing.phone}</div>}
            {billing.address?.line1 && <div>{billing.address.line1}</div>}
            {billing.address?.line2 && <div>{billing.address.line2}</div>}
            {(billing.address?.postal_code || billing.address?.city) && (
              <div>
                {[billing.address.postal_code, billing.address.city]
                  .filter(Boolean).join(' ')}
                {billing.address.country && `, ${billing.address.country}`}
              </div>
            )}
            {!billing.name && !billing.email && !billing.address?.line1 && (
              <p style={{ fontSize: 13, color: t.muted, margin: 0 }}>
                {"Aucune coordonnée renseignée. Cliquez sur Modifier pour les compléter."}
              </p>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gap: 10,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <label style={labelStyle}>Nom / Raison sociale</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                     maxLength={200} style={inputStyle}/>
            </div>
            <div>
              <label style={labelStyle}>Email de facturation</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                     style={inputStyle}/>
            </div>
            <div>
              <label style={labelStyle}>Téléphone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                     style={inputStyle}/>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={labelStyle}>Adresse</label>
            <input type="text" value={line1} onChange={e => setLine1(e.target.value)}
                   placeholder="Numéro et rue" style={{ ...inputStyle, marginBottom: 6 }}/>
            <input type="text" value={line2} onChange={e => setLine2(e.target.value)}
                   placeholder="Complément (bât., étage, etc.)" style={inputStyle}/>
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 10,
                        gridTemplateColumns: '1fr 2fr 1fr' }}>
            <div>
              <label style={labelStyle}>Code postal</label>
              <input type="text" value={postal} onChange={e => setPostal(e.target.value)}
                     style={inputStyle}/>
            </div>
            <div>
              <label style={labelStyle}>Ville</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)}
                     style={inputStyle}/>
            </div>
            <div>
              <label style={labelStyle}>Pays</label>
              <input type="text" value={country} onChange={e => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                     placeholder="FR" maxLength={2} style={inputStyle}/>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button type="button" onClick={() => setEditing(false)} disabled={busy}
                    style={{ padding: '9px 16px', fontSize: 13, fontWeight: 500,
                             background: 'transparent', color: t.text,
                             border: `1px solid ${t.border}`, borderRadius: 8,
                             cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              Annuler
            </button>
            <button type="submit" disabled={busy}
                    style={{ padding: '9px 16px', fontSize: 13, fontWeight: 500,
                             background: t.text, color: t.canvas,
                             border: 'none', borderRadius: 8,
                             cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                             opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}
    </>
  );

  if (embedded) {
    return (
      <div>
        {editButton && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            {editButton}
          </div>
        )}
        {innerContent}
      </div>
    );
  }

  return (
    <FlatSection title="Coordonnées de facturation" t={t} right={editButton}>
      {innerContent}
    </FlatSection>
  );
}

// ─── Section Factures inline ────────────────────────────────────────────────
// Liste les 12 dernières factures du customer Stripe.
// Prop `embedded` : true = pas de card englobante (utilisé dans un Modal).
function InvoicesSection({ theme: t, embedded = false }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [hasMore, setHasMore]   = useState(false);
  const [lastId, setLastId]     = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.listSubscriptionInvoices()
      .then(data => {
        if (cancelled) return;
        setInvoices(data?.invoices || []);
        setHasMore(!!data?.has_more);
        setLastId(data?.last_id || null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const loadMore = async () => {
    if (!lastId || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api.listSubscriptionInvoices(lastId);
      setInvoices(prev => [...prev, ...(data?.invoices || [])]);
      setHasMore(!!data?.has_more);
      setLastId(data?.last_id || null);
    } catch (e) {
      console.error('[Invoices] loadMore', e);
    } finally {
      setLoadingMore(false);
    }
  };

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[1, 2, 3].map(i => (
            <Skeleton key={i} height={42} t={t}/>
          ))}
        </div>
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
      {hasMore && !loading && (
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
          <button onClick={loadMore} disabled={loadingMore}
                  style={{ padding: '8px 16px', fontSize: 12, fontWeight: 500,
                           background: 'transparent', color: t.text,
                           border: `1px solid ${t.border}`, borderRadius: 8,
                           cursor: loadingMore ? 'wait' : 'pointer',
                           fontFamily: 'inherit' }}>
            {loadingMore ? 'Chargement…' : 'Voir les 5 suivantes'}
          </button>
        </div>
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
