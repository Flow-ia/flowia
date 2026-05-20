import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { I } from '../../utils/icons';
import { PageHero, PrimaryBtn, SecondaryBtn } from './components/Shared';
import { FEATURE_GROUPS } from './components/Header';
import { S, CheckPill } from './components/shadcn';
import { COMMERCANT_URL } from '../../utils/siteConfig';
import Seo from './components/Seo';

// Détail riche pour chaque feature, indexé par id (les ids matchent ceux du
// mega-menu Header pour que /fonctionnalites#<id> scrolle au bon endroit).
//
// Chaque feature a :
//  - label : pill 'eyebrow' au-dessus du titre
//  - title, desc, bullets : contenu
//  - cta : libellé du bouton CTA personnalisé
//  - img : photo Unsplash illustrant la fonctionnalité (fallback gradient si erreur)
const IMG = (id) => `https://images.unsplash.com/${id}?w=1200&q=80&auto=format&fit=crop`;

const DETAILS = {
  ia: {
    label: 'IA',
    title: 'Marketing IA — laissez l\'intelligence artificielle travailler pour vous',
    desc: "FlowIA analyse votre fichier client et propose les bonnes campagnes au bon moment. Plus besoin de réfléchir à qui contacter, ni quand, ni avec quel message.",
    bullets: [
      "Suggestions de campagnes basées sur votre historique de RDV",
      "Génération automatique du texte (SMS et email)",
      "Détection des clients dormants ou en risque de fuite",
      "A/B testing automatique des messages",
      "Pas de configuration : ça marche dès la première semaine",
    ],
    cta: "Découvrir notre IA",
    img: IMG('photo-1487412947147-5cebf100ffc2'),
  },
  previsions: {
    label: 'IA',
    title: 'Prévisions et insights — anticipez votre activité',
    desc: "Visualisez votre chiffre d'affaires prévisionnel, vos creux et vos pics. FlowIA détecte les tendances et vous propose des actions concrètes.",
    bullets: [
      "Prévisions de CA sur 4 semaines",
      "Alertes sur les creux d'agenda",
      "Détection automatique des best-sellers",
      "Recommandations d'actions (campagnes, promotions)",
    ],
    cta: "Voir les prévisions",
    img: IMG('photo-1620331317932-4d7e7f73af32'),
  },
  reservation: {
    label: 'Site',
    title: 'Site de réservation 100 % personnalisable',
    desc: "Votre vitrine en ligne, à votre image. Logo, couleurs, photos de votre salon, vos prestations, vos employés, votre politique d'annulation. Mobile-first, ultra-rapide.",
    bullets: [
      "Logo, couleurs et photos personnalisables",
      "Page d'accueil avec présentation, horaires, adresse, plan",
      "Politique d'annulation paramétrable",
      "Acompte ou paiement total en ligne (optionnel)",
      "Connexion Google ou compte simple en 30 secondes",
    ],
    cta: "Découvrir la personnalisation",
    img: IMG('photo-1492106087820-71f1a00d2b11'),
  },
  annonce: {
    label: 'Site',
    title: 'Annonce gratuite sur votre site',
    desc: "Affichez en haut de votre page de réservation une annonce libre : promotion en cours, fermeture exceptionnelle, nouveauté. Activable en un clic, gratuit pour tous les plans.",
    bullets: [
      "Bandeau d'annonce en haut de la page publique",
      "Texte et lien personnalisables",
      "Activation/désactivation instantanée",
      "Aperçu en direct avant publication",
    ],
    cta: "Activer une annonce",
    img: IMG('photo-1560066984-138dadb4c035'),
  },
  tarifs: {
    label: 'Configuration',
    title: 'Tarifs, catégories et prestations',
    desc: "Organisez vos prestations en catégories (coupe, couleur, soin…), avec prix, durée, photos. Modifiable à tout moment, mise à jour instantanée sur votre site.",
    bullets: [
      "Catégories et sous-catégories illimitées",
      "Prix, durée et photo par prestation",
      "Prestations actives/inactives en un clic",
      "Tarifs spécifiques par employé (optionnel)",
    ],
    cta: "Configurer mes tarifs",
    img: IMG('photo-1571781926291-c477ebfd024b'),
  },
  employes: {
    label: 'Configuration',
    title: 'Employés, droits et permissions',
    desc: "Ajoutez votre équipe, assignez les prestations, définissez les horaires individuels. Gérez les droits par rôle. Mode tablette partagée avec PIN — pas de session par employé.",
    bullets: [
      "Plusieurs employés, agendas dédiés",
      "Permissions granulaires par rôle",
      "Horaires individuels, congés, absences",
      "PIN court par employé pour la tablette partagée",
    ],
    cta: "Gérer mon équipe",
    img: IMG('photo-1522337360788-8b13dee7a37e'),
  },
  sms: {
    label: 'Marketing',
    title: 'Marketing SMS — 95 % de taux d\'ouverture',
    desc: "Le canal le plus efficace pour faire revenir vos clients. Campagnes ciblées par segments, rappels automatiques 24h avant, opt-in RGPD géré.",
    bullets: [
      "Campagnes SMS ciblées par segments",
      "Rappels automatiques 24h avant le RDV",
      "Désinscription en 1 clic conforme RGPD",
      "Tarif transparent à l'usage (à partir de 0,06 €/SMS)",
      "Quotas et budget contrôlés",
    ],
    cta: "Lancer mes campagnes SMS",
    img: IMG('photo-1605497788044-5a32c7078486'),
  },
  email: {
    label: 'Marketing',
    title: 'Marketing email — restez en contact',
    desc: "Emails transactionnels (confirmation, rappel) et campagnes ciblées. Templates pro, opt-in/désinscription RGPD-compliant, statistiques détaillées.",
    bullets: [
      "Confirmations et rappels automatiques",
      "Campagnes ciblées avec templates pro",
      "Opt-in RGPD à l'inscription",
      "Désinscription 1 clic dans chaque email",
      "Statistiques d'ouverture et de clic",
    ],
    cta: "Envoyer mes emails",
    img: IMG('photo-1503951914875-452162b0f3f1'),
  },
  fidelite: {
    label: 'Marketing',
    title: 'Fidélité — faites revenir vos clients sans y penser',
    desc: "Programme de points 100 % paramétrable. Cumul automatique à chaque passage, récompenses configurables (€ ou %), caps anti-fraude.",
    bullets: [
      "Cumul de points configurable par prestation",
      "Récompenses en euros ou en pourcentage",
      "Caps mensuels/annuels personnalisables",
      "Solde et historique visibles côté client",
      "Activation/désactivation par catégorie",
    ],
    cta: "Activer la fidélité",
    img: IMG('photo-1559599101-f09722fb4948'),
  },
  parrainage: {
    label: 'Marketing',
    title: 'Parrainage — vos meilleurs ambassadeurs',
    desc: "Récompensez parrains et filleuls. Caps anti-fraude, validité paramétrable, conditions claires affichées au client connecté.",
    bullets: [
      "Récompense paramétrable parrain et filleul",
      "Caps anti-fraude (mois, 3 mois, an, illimité)",
      "Validité configurable (en jours)",
      "Conditions affichées en clair au client",
      "Suivi des parrainages dans l'admin",
    ],
    cta: "Configurer le parrainage",
    img: IMG('photo-1570172619644-dfd03ed5d881'),
  },
  anniversaire: {
    label: 'Marketing',
    title: 'Campagnes anniversaire — automatiques toute l\'année',
    desc: "Envoi automatique d'un message d'anniversaire avec offre dédiée. Étalement intelligent sur le mois, anti-fraude rolling 330 jours.",
    bullets: [
      "Message d'anniversaire automatique",
      "Étalement automatique sur le mois",
      "Quota par commerçant et retry safe",
      "Anti-fraude rolling 330 jours",
      "Offre paramétrable (% ou €)",
    ],
    cta: "Activer les anniversaires",
    img: IMG('photo-1530653333484-13e7e8eaa3c7'),
  },
  rappels: {
    label: 'Marketing',
    title: 'Rappels automatiques — réduisez vos no-shows',
    desc: "Envoi automatique d'un SMS de rappel 24h avant le RDV. Le client peut confirmer, annuler ou reprogrammer en un clic depuis son téléphone.",
    bullets: [
      "Rappel SMS 24h avant le RDV (paramétrable)",
      "Confirmation/annulation en 1 clic",
      "Réduction des no-shows jusqu'à 70 %",
      "Désactivable par client si demandé",
    ],
    cta: "Activer les rappels",
    img: IMG('photo-1599387737005-7787e8d0a2dd'),
  },
  caisse: {
    label: 'Caisse',
    title: 'Caisse intégrée — encaissez en quelques secondes',
    desc: "Catégories prestations et produits, paiements multiples (espèces, carte, virement), avoirs, crédits clients, remboursements RGPD-conformes.",
    bullets: [
      "Espèces, carte, virement, multi-paiements",
      "Avoirs et crédits clients",
      "Suivi des dettes et créances",
      "Remboursements RGPD-conformes",
      "Verrouillage par PIN administrateur",
    ],
    cta: "Découvrir la caisse",
    img: IMG('photo-1604654894610-df63bc536371'),
  },
  clients: {
    label: 'Gestion',
    title: 'Fichier clients — votre base à portée de main',
    desc: "Fiches clients enrichies, historique complet des passages, segmentation, recherche instantanée, tags personnalisés, notes privées.",
    bullets: [
      "Fiches détaillées (coordonnées, historique, points)",
      "Recherche instantanée",
      "Segments personnalisables",
      "Notes et tags par client",
      "Export RGPD complet à la demande",
    ],
    cta: "Voir mon fichier clients",
    img: IMG('photo-1521590832167-7bcbfaa6381f'),
  },
  credits: {
    label: 'Caisse',
    title: 'Crédits, avoirs et créances',
    desc: "Suivez les soldes clients en temps réel : avoirs, dettes, créances. Encaissez ou remboursez en quelques clics. Anti-fuite intégré (RGPD-conforme).",
    bullets: [
      "Avoirs et crédits clients",
      "Registre des créances avec relances",
      "Encaissement et remboursement en 2 clics",
      "Anti-fuite après suppression de compte",
      "Audit trail des opérations",
    ],
    cta: "Suivre mes crédits",
    img: IMG('photo-1556228720-195a672e8a03'),
  },
  exports: {
    label: 'Comptabilité',
    title: 'Exports comptables — votre comptable vous remerciera',
    desc: "Export CSV et PDF mensuel automatique : ventes, paiements, TVA, écritures comptables. Compatible avec votre logiciel de compta préféré.",
    bullets: [
      "Export CSV (ventes, paiements, employés)",
      "Export PDF mis en page",
      "Génération automatique mensuelle",
      "Compatible la plupart des logiciels comptables",
      "Verrouillé par PIN admin",
    ],
    cta: "Configurer mes exports",
    img: IMG('photo-1544161515-4ab6ce6db874'),
  },
  statistiques: {
    label: 'Pilotage',
    title: 'Statistiques et reporting',
    desc: "Tableau de bord clair, filtres par employé, par période, par catégorie. CA, prestations, taux de remplissage, panier moyen, fidélité.",
    bullets: [
      "Dashboard CA + RDV + clients fidèles",
      "Filtres par employé, période, catégorie",
      "Historique unifié de la journée",
      "Statistiques par moyen de paiement",
      "Verrouillage par PIN admin",
    ],
    cta: "Voir mes statistiques",
    img: IMG('photo-1487412947147-5cebf100ffc2'),
  },
};

export default function Features() {
  const [activeGroup, setActiveGroup] = useState('');

  // Met à jour le groupe actif dans la nav rapide en regardant quelle section
  // de groupe est visible. La nav contient 4 pills (un par groupe) au lieu
  // de 17 (un par feature) — beaucoup plus lisible.
  useEffect(() => {
    const onScroll = () => {
      let current = '';
      for (const g of FEATURE_GROUPS) {
        const el = document.getElementById(`group-${g.slug}`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top < 140) current = g.slug;
      }
      setActiveGroup(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <Seo
        path="/fonctionnalites"
        title="Fonctionnalités — Agenda, caisse, SMS, fidélité & IA | FlowIA"
        description="Agenda en ligne, caisse, encaissement, marketing IA, fidélité, parrainage et SMS de rappel : toutes les fonctionnalités FlowIA pour gérer votre salon."
      />
      <PageHero
        label="Fonctionnalités"
        title="Tout ce qu'il faut pour faire tourner votre salon"
        subtitle="FlowIA réunit en une seule application l'agenda, la caisse, le marketing IA, la fidélité et bien plus encore."
      />

      {/* Nav rapide sticky par groupe (4 pills) */}
      <CategoryNav activeGroup={activeGroup} />

      {FEATURE_GROUPS.map((group, gi) => (
        <section key={group.slug}
          id={`group-${group.slug}`}
          style={{
            padding: '56px 24px 16px',
            scrollMarginTop: 120,
            borderTop: gi === 0 ? `1px solid ${S.border}` : 'none',
          }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <span style={{
                width: 28, height: 28, borderRadius: S.rSm,
                background: group.color + '14',
                border: `1px solid ${group.color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <group.Ic style={{ width: 14, height: 14, color: group.color }} />
              </span>
              <p style={{
                fontSize: 11, fontWeight: 500, color: S.fgSubtle,
                textTransform: 'uppercase', letterSpacing: 1,
                margin: 0,
              }}>
                {group.label}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {group.items.map((it, idx) => {
                const d = DETAILS[it.id];
                return d ? (
                  <FeatureCard key={it.id} item={it} detail={d} flipped={idx % 2 === 1} />
                ) : null;
              })}
            </div>
          </div>
        </section>
      ))}

      <section style={{ padding: '64px 24px 80px', borderTop: `1px solid ${S.border}`, marginTop: 32, background: S.bgMuted }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{
            fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 500,
            color: S.fg, letterSpacing: '-0.025em', lineHeight: 1.2,
            margin: 0, marginBottom: 12,
          }}>
            Prêt à tout réunir dans une seule application ?
          </h2>
          <p style={{ fontSize: 15, color: S.fgMuted, margin: 0, marginBottom: 24, lineHeight: 1.6 }}>
            {"1 mois d'essai gratuit. Sans carte bancaire."}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <PrimaryBtn href={COMMERCANT_URL + '/register'}>Essayer gratuitement</PrimaryBtn>
            <SecondaryBtn to="/tarifs">Voir les tarifs</SecondaryBtn>
          </div>
        </div>
      </section>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Nav rapide groupée — 4 pills (un par groupe FEATURE_GROUPS) au lieu de 17.
// Click sur une pill -> scroll smooth vers la section du groupe.
function CategoryNav({ activeGroup }) {
  return (
    <div style={{
      position: 'sticky', top: 64, zIndex: 30,
      background: 'rgba(255,255,255,0.85)',
      borderBottom: `1px solid ${S.border}`,
      backdropFilter: 'saturate(160%) blur(10px)',
      WebkitBackdropFilter: 'saturate(160%) blur(10px)',
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '12px 24px',
        display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap',
      }}>
        {FEATURE_GROUPS.map(g => {
          const active = activeGroup === g.slug;
          return (
            <a key={g.slug} href={`#group-${g.slug}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 500,
              color: active ? S.fg : S.fgMuted,
              padding: '7px 14px', borderRadius: 99,
              background: active ? S.bg : 'transparent',
              border: `1px solid ${active ? S.borderHv : S.border}`,
              boxShadow: active ? S.shadowSm : 'none',
              textDecoration: 'none',
              transition: 'all 0.15s ease',
            }}>
              <g.Ic style={{ width: 13, height: 13, color: active ? g.color : S.fgSubtle }} />
              {g.short}
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function FeatureCard({ item, detail, flipped }) {
  return (
    <div id={item.id} style={{
      scrollMarginTop: 130,
      borderRadius: S.rXl,
      background: S.bg,
      border: `1px solid ${S.border}`,
      overflow: 'hidden',
      display: 'grid', gap: 0,
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      alignItems: 'stretch',
      boxShadow: S.shadowSm,
    }}>
      <div style={{ order: flipped ? 1 : 0, padding: 32, display: 'flex', flexDirection: 'column' }}>
        <FeatureLabel color={item.color} Ic={item.Ic} text={detail.label} />
        <h3 style={{
          fontSize: 'clamp(20px, 2.6vw, 26px)', fontWeight: 500,
          color: S.fg, lineHeight: 1.25, letterSpacing: '-0.025em',
          margin: 0, marginBottom: 12,
        }}>
          {detail.title}
        </h3>
        <p style={{ fontSize: 15, color: S.fgMuted, lineHeight: 1.65, margin: 0, marginBottom: 18 }}>
          {detail.desc}
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {detail.bullets.map(b => (
            <li key={b} style={{ display: 'flex', gap: 10, fontSize: 14, color: S.fg2, alignItems: 'flex-start', lineHeight: 1.55 }}>
              <span style={{ marginTop: 3 }}><CheckPill /></span>
              {b}
            </li>
          ))}
        </ul>
        {detail.cta && (
          <div style={{ marginTop: 'auto' }}>
            <Link to="/tarifs" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 14, fontWeight: 500,
              color: S.fg,
              textDecoration: 'none',
              padding: '10px 16px', borderRadius: S.r,
              background: S.bg,
              border: `1px solid ${S.border}`,
              transition: 'background 0.15s ease, border-color 0.15s ease',
              fontFamily: 'inherit',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = S.bgHover; e.currentTarget.style.borderColor = S.borderHv; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = S.bg; e.currentTarget.style.borderColor = S.border; }}>
              {detail.cta}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>
        )}
      </div>
      <FeatureVisual color={item.color} Ic={item.Ic} img={detail.img} alt={detail.title} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Pill 'eyebrow' au-dessus du titre — outline, uppercase.
function FeatureLabel({ color, Ic, text }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      width: 'fit-content',
      fontSize: 10, fontWeight: 500,
      padding: '4px 10px', borderRadius: 99,
      background: color + '0d',
      color, letterSpacing: 0.8,
      border: `1px solid ${color}33`,
      textTransform: 'uppercase',
      marginBottom: 14,
    }}>
      {Ic && <Ic style={{ width: 11, height: 11 }} />}
      {text}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Image illustrative avec fallback neutre si erreur de chargement.
function FeatureVisual({ color, Ic, img, alt }) {
  const [errored, setErrored] = useState(false);
  if (!img || errored) {
    return (
      <div style={{
        background: S.bgMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 260,
        borderLeft: `1px solid ${S.border}`,
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: S.rLg,
          background: S.bg, boxShadow: S.shadowSm,
          border: `1px solid ${S.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Ic style={{ width: 32, height: 32, color }} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: 260, overflow: 'hidden', borderLeft: `1px solid ${S.border}` }}>
      <img src={img} alt={alt} loading="lazy" onError={() => setErrored(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  );
}
