import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
//  - cta : libellé du lien CTA personnalisé
//  - img : photo illustrant la fonctionnalité (fallback icône si erreur)
//
// Les photos sont toutes des scènes de salon (coiffure, barbier, manucure,
// esthétique) choisies une par une pour coller au contenu de la carte.
const IMG = (id) => `https://images.unsplash.com/${id}?w=760&q=75&auto=format&fit=crop`;

const DETAILS = {
  ia: {
    label: 'IA',
    title: 'Marketing IA — laissez l\'intelligence artificielle travailler pour vous',
    desc: "Salon DZ analyse votre fichier client et propose les bonnes campagnes au bon moment. Plus besoin de réfléchir à qui contacter, ni quand, ni avec quel message.",
    bullets: [
      "Suggestions de campagnes basées sur votre historique de RDV",
      "Génération automatique du texte (SMS et email)",
      "Détection des clients dormants ou en risque de fuite",
      "A/B testing automatique des messages",
      "Pas de configuration : ça marche dès la première semaine",
    ],
    cta: "Découvrir notre IA",
    // Barbier et client : la relation que les campagnes entretiennent.
    img: IMG('photo-1605497788044-5a32c7078486'),
  },
  previsions: {
    label: 'IA',
    title: 'Prévisions et insights — anticipez votre activité',
    desc: "Visualisez votre chiffre d'affaires prévisionnel, vos creux et vos pics. Salon DZ détecte les tendances et vous propose des actions concrètes.",
    bullets: [
      "Prévisions de CA sur 4 semaines",
      "Alertes sur les creux d'agenda",
      "Détection automatique des best-sellers",
      "Recommandations d'actions (campagnes, promotions)",
    ],
    cta: "Voir les prévisions",
    // Fauteuils vides : le creux d'agenda qu'on veut anticiper.
    img: IMG('photo-1585747860715-2ba37e788b70'),
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
    // Intérieur de salon soigné : la vitrine que reflète la page publique.
    img: IMG('photo-1633681926022-84c23e8cb2d6'),
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
    // Devanture de barbershop avec enseigne lumineuse : l'annonce affichée.
    img: IMG('photo-1678356164573-9a534fe43958'),
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
    // Coupe aux ciseaux : la prestation qu'on tarifie.
    img: IMG('photo-1700760934268-8aa0ef52ce0a'),
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
    // Coiffeuse au travail : le membre d'équipe et son agenda.
    img: IMG('photo-1562322140-8baeececf3df'),
  },
  sms: {
    label: 'Marketing',
    title: 'Marketing SMS — 95 % de taux d\'ouverture',
    desc: "Le canal le plus efficace pour faire revenir vos clients. Campagnes ciblées par segments, rappels automatiques 24h avant, opt-in conforme loi 18-07 géré.",
    bullets: [
      "Campagnes SMS ciblées par segments",
      "Rappels automatiques 24h avant le RDV",
      "Désinscription en 1 clic conforme loi 18-07",
      "Tarif transparent à l'usage (à partir de 6 DA/SMS)",
      "Quotas et budget contrôlés",
    ],
    cta: "Lancer mes campagnes SMS",
    // Cliente sur son téléphone dans le salon : le SMS qui arrive.
    img: IMG('photo-1636990490461-b98d2302b9fb'),
  },
  email: {
    label: 'Marketing',
    title: 'Marketing email — restez en contact',
    desc: "Emails transactionnels (confirmation, rappel) et campagnes ciblées. Templates pro, opt-in/désinscription conformes à la loi 18-07, statistiques détaillées.",
    bullets: [
      "Confirmations et rappels automatiques",
      "Campagnes ciblées avec templates pro",
      "Opt-in conforme loi 18-07 à l'inscription",
      "Désinscription 1 clic dans chaque email",
      "Statistiques d'ouverture et de clic",
    ],
    cta: "Envoyer mes emails",
    // Salon vivant, échange à l'accueil : garder le lien entre deux visites.
    img: IMG('photo-1695527081874-b674c46f40fb'),
  },
  fidelite: {
    label: 'Marketing',
    title: 'Fidélité — faites revenir vos clients sans y penser',
    desc: "Programme de points 100 % paramétrable. Cumul automatique à chaque passage, récompenses configurables (DA ou %), caps anti-fraude.",
    bullets: [
      "Cumul de points configurable par prestation",
      "Récompenses en dinars ou en pourcentage",
      "Caps mensuels/annuels personnalisables",
      "Solde et historique visibles côté client",
      "Activation/désactivation par catégorie",
    ],
    cta: "Activer la fidélité",
    // Manucure « love » : l'attachement de la cliente au salon.
    img: IMG('photo-1519014816548-bf5fe059798b'),
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
    // Deux clientes en soin côte à côte : le duo parrain / filleul.
    img: IMG('photo-1647004692483-c5d942fe1137'),
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
      "Offre paramétrable (% ou DA)",
    ],
    cta: "Activer les anniversaires",
    // Nail art coloré et festif : l'offre anniversaire.
    img: IMG('photo-1571290274554-6a2eaa771e5f'),
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
    // Le fauteuil occupé : le RDV honoré grâce au rappel.
    img: IMG('photo-1629397685944-7073f5589754'),
  },
  caisse: {
    label: 'Caisse',
    title: 'Caisse intégrée — encaissez en quelques secondes',
    desc: "Catégories prestations et produits, paiements multiples (espèces, carte, virement), avoirs, crédits clients, remboursements conformes à la loi 18-07.",
    bullets: [
      "Espèces, carte, virement, multi-paiements",
      "Avoirs et crédits clients",
      "Suivi des dettes et créances",
      "Remboursements conformes loi 18-07",
      "Verrouillage par PIN administrateur",
    ],
    cta: "Découvrir la caisse",
    // Paiement par carte au comptoir du salon.
    img: IMG('photo-1746201175390-3e02c20b890b'),
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
      "Export complet des données à la demande",
    ],
    cta: "Voir mon fichier clients",
    // Cliente accueillie au comptoir : la fiche qu'on ouvre à l'arrivée.
    img: IMG('photo-1556740758-90de374c12ad'),
  },
  credits: {
    label: 'Caisse',
    title: 'Crédits, avoirs et créances',
    desc: "Suivez les soldes clients en temps réel : avoirs, dettes, créances. Encaissez ou remboursez en quelques clics. Anti-fuite intégré (conforme loi 18-07).",
    bullets: [
      "Avoirs et crédits clients",
      "Registre des créances avec relances",
      "Encaissement et remboursement en 2 clics",
      "Anti-fuite après suppression de compte",
      "Audit trail des opérations",
    ],
    cta: "Suivre mes crédits",
    // Terminal affichant le montant : le solde qu'on encaisse ou rembourse.
    img: IMG('photo-1750263160670-42be92c0eaf0'),
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
    // Le comptoir d'accueil où se tient la compta du salon.
    img: IMG('photo-1634449862841-8c6e970117e5'),
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
    // Vue d'ensemble du salon : ce que le tableau de bord met en chiffres.
    img: IMG('photo-1706629504952-ab5e50f5c179'),
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
        title="Fonctionnalités — Agenda, caisse, SMS, fidélité & IA | Salon DZ"
        description="Agenda en ligne, caisse, encaissement, marketing IA, fidélité, parrainage et SMS de rappel : toutes les fonctionnalités Salon DZ pour gérer votre salon."
      />
      <PageHero
        label="Fonctionnalités"
        title="Tout ce qu'il faut pour faire tourner votre salon"
        subtitle="Salon DZ réunit en une seule application l'agenda, la caisse, le marketing IA, la fidélité et bien plus encore."
      />

      {/* Nav rapide sticky par groupe (4 pills) */}
      <CategoryNav activeGroup={activeGroup} />

      {FEATURE_GROUPS.map((group, gi) => (
        <section key={group.slug}
          id={`group-${group.slug}`}
          style={{
            padding: '40px 24px 8px',
            scrollMarginTop: 120,
            borderTop: gi === 0 ? `1px solid ${S.border}` : 'none',
          }}>
          <div style={{ maxWidth: 1120, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{
                width: 26, height: 26, borderRadius: S.rSm,
                background: group.color + '14',
                border: `1px solid ${group.color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <group.Ic style={{ width: 13, height: 13, color: group.color }} />
              </span>
              <p style={{
                fontSize: 11, fontWeight: 500, color: S.fgSubtle,
                textTransform: 'uppercase', letterSpacing: 1,
                margin: 0,
              }}>
                {group.label}
              </p>
            </div>
            <div style={{
              display: 'grid', gap: 14,
              gridTemplateColumns: 'repeat(auto-fill, minmax(296px, 1fr))',
              alignItems: 'stretch',
            }}>
              {group.items.map(it => {
                const d = DETAILS[it.id];
                return d ? <FeatureCard key={it.id} item={it} detail={d} /> : null;
              })}
            </div>
          </div>
        </section>
      ))}

      <section style={{ padding: '56px 24px 72px', borderTop: `1px solid ${S.border}`, marginTop: 32, background: S.bgMuted }}>
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
        maxWidth: 1120, margin: '0 auto', padding: '12px 24px',
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
// Carte compacte : visuel 16/9 en tête, contenu dessous. En grille 3 colonnes
// sur desktop — la page tient en ~3 écrans au lieu de 8 avec l'ancien format
// pleine largeur alterné.
function FeatureCard({ item, detail }) {
  const [hover, setHover] = useState(false);
  return (
    <div id={item.id}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        scrollMarginTop: 130,
        borderRadius: S.rLg,
        background: S.bg,
        border: `1px solid ${hover ? S.borderHv : S.border}`,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: hover ? S.shadowMd : S.shadowSm,
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      }}>
      <FeatureVisual color={item.color} Ic={item.Ic} img={detail.img} alt={detail.title} zoom={hover} />
      <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <FeatureLabel color={item.color} Ic={item.Ic} text={detail.label} />
        <h3 style={{
          fontSize: 17, fontWeight: 500,
          color: S.fg, lineHeight: 1.3, letterSpacing: '-0.015em',
          margin: 0, marginBottom: 7,
        }}>
          {detail.title}
        </h3>
        <p style={{ fontSize: 13, color: S.fgMuted, lineHeight: 1.55, margin: 0, marginBottom: 13 }}>
          {detail.desc}
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {detail.bullets.map(b => (
            <li key={b} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: S.fg2, alignItems: 'flex-start', lineHeight: 1.45 }}>
              <span style={{ marginTop: 2 }}><CheckPill /></span>
              {b}
            </li>
          ))}
        </ul>
        {detail.cta && (
          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <Link to="/tarifs" style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12.5, fontWeight: 500,
              color: S.fg, textDecoration: 'none',
            }}>
              {detail.cta}
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{
                transform: hover ? 'translateX(2px)' : 'none',
                transition: 'transform 0.15s ease',
              }}>
                <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Pill 'eyebrow' au-dessus du titre — outline, uppercase.
function FeatureLabel({ color, Ic, text }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      width: 'fit-content',
      fontSize: 9.5, fontWeight: 500,
      padding: '3px 8px', borderRadius: 99,
      background: color + '0d',
      color, letterSpacing: 0.7,
      border: `1px solid ${color}33`,
      textTransform: 'uppercase',
      marginBottom: 11,
    }}>
      {Ic && <Ic style={{ width: 10, height: 10 }} />}
      {text}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Visuel 16/9 avec fallback icône si l'image ne charge pas.
function FeatureVisual({ color, Ic, img, alt, zoom }) {
  const [errored, setErrored] = useState(false);
  if (!img || errored) {
    return (
      <div style={{
        aspectRatio: '16 / 9',
        background: S.bgMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: `1px solid ${S.border}`,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: S.rLg,
          background: S.bg, boxShadow: S.shadowSm,
          border: `1px solid ${S.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Ic style={{ width: 22, height: 22, color }} />
        </div>
      </div>
    );
  }
  return (
    <div style={{
      aspectRatio: '16 / 9', overflow: 'hidden',
      borderBottom: `1px solid ${S.border}`,
      background: S.bgMuted,
    }}>
      <img src={img} alt={alt} loading="lazy" onError={() => setErrored(true)}
        style={{
          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
          transform: zoom ? 'scale(1.03)' : 'none',
          transition: 'transform 0.35s ease',
        }} />
    </div>
  );
}
