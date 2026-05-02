import { useEffect, useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { I } from '../../utils/icons';
import { PageHero, Container, PrimaryBtn, SecondaryBtn } from './components/Shared';
import { FEATURE_GROUPS } from './components/Header';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

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
    img: IMG('photo-1677442136019-21780ecad995'),
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
    img: IMG('photo-1551288049-bebda4e38f71'),
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
    img: IMG('photo-1559028012-481c04fa702d'),
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
    img: IMG('photo-1567593810070-7a3d471af022'),
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
    img: IMG('photo-1607082348824-0a96f2a4b9da'),
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
    img: IMG('photo-1556761175-5973dc0f32e7'),
  },
  sms: {
    label: 'Marketing',
    title: 'Marketing SMS — 95 % de taux d\'ouverture',
    desc: "Le canal le plus efficace pour faire revenir vos clients. Campagnes ciblées par segments, rappels automatiques 24h avant, opt-in RGPD géré.",
    bullets: [
      "Campagnes SMS ciblées par segments",
      "Rappels automatiques 24h avant le RDV",
      "Désinscription en 1 clic conforme RGPD",
      "Coût réel sans marge (à partir de 0,045 €/SMS)",
      "Quotas et budget contrôlés",
    ],
    cta: "Lancer mes campagnes SMS",
    img: IMG('photo-1521295121783-8a321d551ad2'),
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
    img: IMG('photo-1596526131083-e8c633c948d2'),
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
    img: IMG('photo-1556745753-b2904692b3cd'),
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
    img: IMG('photo-1559526324-4b87b5e36e44'),
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
    img: IMG('photo-1530103862676-de8c9debad1d'),
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
    img: IMG('photo-1501139083538-0139583c060f'),
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
    img: IMG('photo-1556740758-90de374c12ad'),
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
    img: IMG('photo-1551836022-deb4988cc6c0'),
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
    img: IMG('photo-1554224155-6726b3ff858f'),
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
    img: IMG('photo-1454165804606-c3d57bc86b40'),
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
    img: IMG('photo-1543286386-713bdd548da4'),
  },
};

export default function Features() {
  const { theme: t } = useTheme();
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
      <PageHero
        label="Fonctionnalités"
        title="Tout ce qu'il faut pour faire tourner votre salon"
        subtitle="FlowIA réunit en une seule application l'agenda, la caisse, le marketing IA, la fidélité et bien plus encore."
      />

      {/* Nav rapide sticky par groupe (4 pills) */}
      <CategoryNav t={t} activeGroup={activeGroup} />

      {FEATURE_GROUPS.map((group, gi) => (
        <section key={group.slug}
          id={`group-${group.slug}`}
          style={{
            padding: '48px 24px 16px',
            scrollMarginTop: 110,
            borderTop: gi === 0 ? `0.5px solid ${t.border}` : 'none',
          }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: group.color + '15',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <group.Ic style={{ width: 14, height: 14, color: group.color }} />
              </div>
              <p style={{
                fontSize: 11, fontWeight: 500, color: t.muted,
                textTransform: 'uppercase', letterSpacing: 0.7,
                margin: 0,
              }}>
                {group.label}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {group.items.map((it, idx) => {
                const d = DETAILS[it.id];
                return d ? (
                  <FeatureCard key={it.id} t={t} item={it} detail={d} flipped={idx % 2 === 1} />
                ) : null;
              })}
            </div>
          </div>
        </section>
      ))}

      <section style={{ padding: '48px 24px 56px', borderTop: `0.5px solid ${t.border}`, marginTop: 24, background: t.cardAlt }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{
            fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 500,
            color: t.text, letterSpacing: -0.4, lineHeight: 1.2,
            margin: 0, marginBottom: 12,
          }}>
            Prêt à tout réunir dans une seule application ?
          </h2>
          <p style={{ fontSize: 15, color: t.textSub, margin: 0, marginBottom: 20, lineHeight: 1.55 }}>
            {"14 jours d'essai gratuit. Sans carte bancaire."}
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
function CategoryNav({ t, activeGroup }) {
  return (
    <div style={{
      position: 'sticky', top: 64, zIndex: 30,
      background: t.navBg,
      borderBottom: `0.5px solid ${t.border}`,
      backdropFilter: 'saturate(140%) blur(8px)',
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '10px 24px',
        display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap',
      }}>
        {FEATURE_GROUPS.map(g => {
          const active = activeGroup === g.slug;
          return (
            <a key={g.slug} href={`#group-${g.slug}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 500,
              color: active ? t.text : t.muted,
              padding: '7px 14px', borderRadius: 99,
              background: active ? t.cardAlt : 'transparent',
              border: `0.5px solid ${active ? t.borderStrong : t.border}`,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
            }}>
              <g.Ic style={{ width: 13, height: 13, color: active ? g.color : t.muted }} />
              {g.short}
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function FeatureCard({ t, item, detail, flipped }) {
  return (
    <div id={item.id} style={{
      scrollMarginTop: 120,
      borderRadius: 16,
      background: t.canvas,
      border: `0.5px solid ${t.border}`,
      overflow: 'hidden',
      display: 'grid', gap: 0,
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      alignItems: 'stretch',
    }}>
      <div style={{ order: flipped ? 1 : 0, padding: 28, display: 'flex', flexDirection: 'column' }}>
        <FeatureLabel t={t} color={item.color} Ic={item.Ic} text={detail.label} />
        <h3 style={{
          fontSize: 'clamp(20px, 2.6vw, 26px)', fontWeight: 500,
          color: t.text, lineHeight: 1.25, letterSpacing: -0.3,
          margin: 0, marginBottom: 10,
        }}>
          {detail.title}
        </h3>
        <p style={{ fontSize: 15, color: t.textSub, lineHeight: 1.6, margin: 0, marginBottom: 16 }}>
          {detail.desc}
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {detail.bullets.map(b => (
            <li key={b} style={{ display: 'flex', gap: 8, fontSize: 14, color: t.textSub }}>
              <I.Check style={{ width: 14, height: 14, color: '#10b981', flexShrink: 0, marginTop: 3 }} />
              {b}
            </li>
          ))}
        </ul>
        {detail.cta && (
          <div style={{ marginTop: 'auto' }}>
            <a href={COMMERCANT_URL + '/register'} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 14, fontWeight: 500,
              color: item.color,
              textDecoration: 'none',
              padding: '10px 16px', borderRadius: 10,
              background: 'transparent',
              border: `0.5px solid ${item.color}55`,
              transition: 'background 0.15s ease',
              fontFamily: 'inherit',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = item.color + '0f'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              {detail.cta} <I.ChevR style={{ width: 14, height: 14 }} />
            </a>
          </div>
        )}
      </div>
      <FeatureVisual t={t} color={item.color} Ic={item.Ic} img={detail.img} alt={detail.title} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Pill 'eyebrow' au-dessus du titre — outline, uppercase, FDS-2026.
function FeatureLabel({ t, color, Ic, text }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      width: 'fit-content',
      fontSize: 10, fontWeight: 500,
      padding: '3px 9px', borderRadius: 99,
      background: 'transparent',
      color, letterSpacing: 0.7,
      border: `0.5px solid ${color}55`,
      textTransform: 'uppercase',
      marginBottom: 14,
    }}>
      {Ic && <Ic style={{ width: 11, height: 11 }} />}
      {text}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Image illustrative avec fallback gradient + icone si erreur de chargement.
function FeatureVisual({ t, color, Ic, img, alt }) {
  const [errored, setErrored] = useState(false);
  if (!img || errored) {
    return (
      <div style={{
        background: `linear-gradient(135deg, ${color}22, ${color}55)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 240,
      }}>
        <div style={{
          width: 88, height: 88, borderRadius: 22,
          background: '#ffffff', boxShadow: t.shadowSm,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Ic style={{ width: 36, height: 36, color }} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: 240, overflow: 'hidden' }}>
      <img src={img} alt={alt} loading="lazy" onError={() => setErrored(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  );
}
