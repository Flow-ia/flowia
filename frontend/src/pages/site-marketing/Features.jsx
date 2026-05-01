import { useTheme } from '../../hooks/useTheme';
import { I } from '../../utils/icons';
import { PageHero, Container, PrimaryBtn, SecondaryBtn } from './components/Shared';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

export default function Features() {
  const { theme: t } = useTheme();

  const sections = [
    {
      label: 'Agenda',
      title: 'Un agenda pensé pour les salons',
      desc: "Vue jour, semaine, mois et liste. Gestion multi-employés avec colonnes dédiées, déplacement par drag & drop, gestion des absences, des pauses et des plages personnalisées.",
      bullets: [
        'Vue agenda multi-colonnes par employé',
        'Déplacement de RDV en glisser-déposer',
        'Gestion des absences, congés et pauses',
        'Synchronisation deux sens avec Google Calendar',
        'Pose de RDV manuelle en 10 secondes',
      ],
      Ic: I.Calendar, color: '#6366f1', bg: '#eef2ff',
    },
    {
      label: 'Réservation en ligne',
      title: 'Une page de réservation que vos clients adorent',
      desc: "Page publique soignée, mobile-first, à votre image. Choix prestation, employé, créneau en moins de 30 secondes. Connexion Google, confirmation et rappels automatiques.",
      bullets: [
        'Page publique personnalisée (logo, couleurs, photos)',
        'Connexion Google ou compte simple',
        'QR code pour vitrine et réseaux sociaux',
        'Acompte ou paiement total optionnel',
        'Politique d\'annulation paramétrable',
      ],
      Ic: I.Sparkles, color: '#8b5cf6', bg: '#eeedfe',
    },
    {
      label: 'Caisse',
      title: 'Encaissez avec une caisse simple et complète',
      desc: "Catégories de prestations et produits, paiements multiples, avoirs, crédits clients, remboursements RGPD-conformes. Tout est tracé pour votre comptabilité.",
      bullets: [
        'Espèces, carte, virement, multi-paiements',
        'Avoirs et crédits clients',
        'Suivi des dettes et créances',
        'Export CSV/PDF mensuel automatique',
        'Verrouillage par PIN admin',
      ],
      Ic: I.Wallet, color: '#10b981', bg: '#ecfdf5',
    },
    {
      label: 'Fidélité & parrainage',
      title: 'Faites revenir vos clients sans y penser',
      desc: "Programme de points 100 % paramétrable, parrainage avec récompenses des deux côtés, campagne anniversaire automatique avec étalement intelligent sur le mois.",
      bullets: [
        'Cumul de points configurable par prestation',
        'Récompenses en € ou en %',
        'Programme de parrainage avec caps anti-fraude',
        'Campagne anniversaire automatique',
        'Statistiques par client',
      ],
      Ic: I.Heart, color: '#ef4444', bg: '#fef2f2',
    },
    {
      label: 'Marketing & SMS',
      title: 'Communiquez avec vos clients en quelques clics',
      desc: "Campagnes SMS et emails segmentées, rappels automatiques, IA qui rédige vos messages, opt-in RGPD géré, désinscription en 1 clic conforme.",
      bullets: [
        'Rappels SMS 24h avant le RDV',
        'Campagnes ciblées par segments',
        'Marketing IA : suggestions de messages',
        "Opt-in/désinscription conforme RGPD",
        'Quotas et budget contrôlés',
      ],
      Ic: I.Send, color: '#f59e0b', bg: '#fffbeb',
    },
    {
      label: 'Équipe',
      title: 'Gérez votre équipe sans friction',
      desc: "Mode tablette partagée avec PIN par employé — pas de session individuelle à gérer. Permissions par rôle, agendas dédiés, statistiques par employé.",
      bullets: [
        'Tablette partagée + PIN employé',
        'Permissions granulaires par rôle',
        'Agenda dédié par employé',
        'Statistiques individuelles',
        "Mode 'incognito' pour le commerçant",
      ],
      Ic: I.Users, color: '#06b6d4', bg: '#ecfeff',
    },
    {
      label: 'Sécurité & RGPD',
      title: 'Vos données sont en sécurité, et celles de vos clients aussi',
      desc: "Hébergement européen, chiffrement bout en bout, conformité RGPD complète : opt-in marketing, suppression de compte, anonymisation, export JSON.",
      bullets: [
        'Hébergement européen, conforme RGPD',
        'Connexions chiffrées et sessions sécurisées',
        'PIN admin pour les actions sensibles',
        'Suppression et export complets de vos données',
        'Historique des modifications',
      ],
      Ic: I.Lock, color: '#374151', bg: '#f3f4f6',
    },
  ];

  return (
    <>
      <PageHero
        label="Fonctionnalités"
        title="Tout ce qu'il faut pour faire tourner votre salon"
        subtitle="FlowIA réunit en une seule application l'agenda, la caisse, la fidélité, le marketing et bien plus."
      />

      {sections.map((s, i) => (
        <section key={s.title} style={{
          padding: '64px 24px',
          background: i % 2 === 0 ? t.canvas : t.cardAlt,
          borderTop: `0.5px solid ${t.border}`,
        }}>
          <div style={{
            maxWidth: 1100, margin: '0 auto',
            display: 'grid', gap: 48,
            gridTemplateColumns: i % 2 === 0
              ? 'repeat(auto-fit, minmax(320px, 1fr))'
              : 'repeat(auto-fit, minmax(320px, 1fr))',
            alignItems: 'center',
          }}>
            <div style={{ order: i % 2 === 0 ? 0 : 1 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                fontSize: 12, fontWeight: 500,
                padding: '6px 12px', borderRadius: 99,
                background: s.bg, color: s.color,
                border: `0.5px solid ${s.color}33`,
                marginBottom: 18,
              }}>
                <s.Ic style={{ width: 13, height: 13 }} />
                {s.label}
              </div>
              <h2 style={{
                fontSize: 'clamp(24px, 3.5vw, 34px)', fontWeight: 500,
                color: t.text, lineHeight: 1.2, letterSpacing: -0.5,
                margin: 0, marginBottom: 14,
              }}>{s.title}</h2>
              <p style={{ fontSize: 16, color: t.textSub, lineHeight: 1.6, margin: 0, marginBottom: 22 }}>
                {s.desc}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {s.bullets.map(b => (
                  <li key={b} style={{ display: 'flex', gap: 10, fontSize: 14, color: t.textSub }}>
                    <I.Check style={{ width: 16, height: 16, color: '#10b981', flexShrink: 0, marginTop: 2 }} />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{
              padding: 28, borderRadius: 16,
              background: i % 2 === 0 ? t.cardAlt : t.canvas,
              border: `0.5px solid ${t.border}`,
              minHeight: 280,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 88, height: 88, borderRadius: 22,
                background: s.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0.9,
              }}>
                <s.Ic style={{ width: 40, height: 40, color: s.color }} />
              </div>
            </div>
          </div>
        </section>
      ))}

      <Container>
        <div style={{
          textAlign: 'center', maxWidth: 600, margin: '0 auto',
        }}>
          <h2 style={{
            fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 500,
            color: t.text, letterSpacing: -0.5, lineHeight: 1.2,
            margin: 0, marginBottom: 14,
          }}>
            {"Prêt à découvrir FlowIA ?"}
          </h2>
          <p style={{ fontSize: 16, color: t.textSub, margin: 0, marginBottom: 24, lineHeight: 1.6 }}>
            {"14 jours d'essai gratuit. Sans carte bancaire. Sans engagement."}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <PrimaryBtn href={COMMERCANT_URL + '/register'}>Essayer gratuitement</PrimaryBtn>
            <SecondaryBtn to="/tarifs">Voir les tarifs</SecondaryBtn>
          </div>
        </div>
      </Container>
    </>
  );
}
