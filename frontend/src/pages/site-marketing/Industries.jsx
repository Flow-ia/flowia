import { useTheme } from '../../hooks/useTheme';
import { I } from '../../utils/icons';
import { PageHero, Container, PrimaryBtn, SecondaryBtn } from './components/Shared';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

export default function Industries() {
  const { theme: t } = useTheme();

  const items = [
    {
      id: 'coiffeur', Ic: I.Scissors, color: '#6366f1', bg: '#eef2ff',
      title: 'Coiffeur', tagline: 'Salons de coiffure femme, homme, mixte',
      desc: "Gérez prestations multiples (couleur, mèches, brushing), durées variables, double employé sur un même client. La fidélité fait revenir vos clientes mois après mois.",
      stats: [
        { v: '+18 %', l: 'de rebookings' },
        { v: '70 %',  l: 'de no-shows en moins' },
        { v: '40 min', l: 'gagnées par jour' },
      ],
    },
    {
      id: 'barbier', Ic: I.Scissors, color: '#f59e0b', bg: '#fffbeb',
      title: 'Barbier', tagline: 'Barbershops modernes',
      desc: "Files d'attente, pose rapide en mode caisse, programme de fidélité dédié. La page de réservation publique respire le style barbershop.",
      stats: [
        { v: '24/7', l: 'de réservations' },
        { v: '+30 %', l: 'de nouveaux clients' },
        { v: '< 30 s', l: 'pour réserver' },
      ],
    },
    {
      id: 'manucure', Ic: I.Sparkles, color: '#ef4444', bg: '#fef2f2',
      title: 'Manucure & Onglerie', tagline: 'Studios nail art et prothésistes ongulaires',
      desc: "Gérez prestations longues (poses, dépose, nail art), photos de portfolio sur la page publique, paiement d'acompte pour sécuriser les réservations.",
      stats: [
        { v: '90 %',  l: 'des RDV en ligne' },
        { v: 'Acompte', l: 'optionnel' },
        { v: 'Photos', l: 'portfolio' },
      ],
    },
    {
      id: 'esthetique', Ic: I.Heart, color: '#8b5cf6', bg: '#eeedfe',
      title: 'Esthétique', tagline: 'Instituts de beauté, soins, épilation',
      desc: "Carnet de soins par cliente, suivi des contre-indications, rappel des soins récurrents. Vendez vos produits cosmétiques en caisse en plus des prestations.",
      stats: [
        { v: 'Cartes', l: 'de soins' },
        { v: 'Cabines', l: 'multiples' },
        { v: 'Produits', l: 'à la vente' },
      ],
    },
    {
      id: 'spa', Ic: I.Star, color: '#06b6d4', bg: '#ecfeff',
      title: 'Spa & Bien-être', tagline: 'Spas, massages, hammam, sauna',
      desc: "Réservation de cabines, durée flexible, plusieurs praticien·ne·s en parallèle, gestion des forfaits (10 séances) et bons cadeaux.",
      stats: [
        { v: 'Forfaits', l: 'multi-séances' },
        { v: 'Cadeaux', l: 'numériques' },
        { v: 'Cabines', l: 'parallèles' },
      ],
    },
  ];

  return (
    <>
      <PageHero
        label="Pour qui"
        title="FlowIA s'adapte à votre métier"
        subtitle="Coiffeurs, barbiers, manucures, esthéticien·ne·s, spas… plus de 500 salons utilisent FlowIA chaque jour."
      />

      <Container paddingY={56}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {items.map((it, i) => (
            <div id={it.id} key={it.id} style={{
              padding: 32, borderRadius: 16,
              background: i % 2 === 0 ? t.cardAlt : t.canvas,
              border: `0.5px solid ${t.border}`,
              display: 'grid', gap: 32,
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              alignItems: 'center',
            }}>
              <div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  fontSize: 12, fontWeight: 500,
                  padding: '6px 12px', borderRadius: 99,
                  background: it.bg, color: it.color,
                  border: `0.5px solid ${it.color}33`,
                  marginBottom: 18,
                }}>
                  <it.Ic style={{ width: 13, height: 13 }} />
                  {it.tagline}
                </div>
                <h2 style={{
                  fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 500,
                  color: t.text, lineHeight: 1.2, letterSpacing: -0.4,
                  margin: 0, marginBottom: 12,
                }}>{it.title}</h2>
                <p style={{ fontSize: 16, color: t.textSub, lineHeight: 1.6, margin: 0, marginBottom: 22 }}>
                  {it.desc}
                </p>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {it.stats.map(s => (
                    <div key={s.l} style={{
                      padding: '12px 16px', borderRadius: 10,
                      background: t.canvas, border: `0.5px solid ${t.border}`,
                      minWidth: 100,
                    }}>
                      <p style={{ fontSize: 18, fontWeight: 500, color: it.color, margin: 0, fontFamily: 'monospace' }}>
                        {s.v}
                      </p>
                      <p style={{ fontSize: 11, color: t.muted, margin: 0, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        {s.l}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{
                padding: 28, borderRadius: 16,
                background: i % 2 === 0 ? t.canvas : t.cardAlt,
                border: `0.5px solid ${t.border}`,
                minHeight: 220,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 88, height: 88, borderRadius: 22,
                  background: it.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <it.Ic style={{ width: 40, height: 40, color: it.color }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Container>

      <section style={{
        padding: '64px 24px 96px',
        borderTop: `0.5px solid ${t.border}`,
        background: t.cardAlt,
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{
            fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 500,
            color: t.text, letterSpacing: -0.5, lineHeight: 1.2,
            margin: 0, marginBottom: 14,
          }}>
            Votre métier n'est pas dans la liste ?
          </h2>
          <p style={{ fontSize: 16, color: t.textSub, margin: 0, marginBottom: 24, lineHeight: 1.6 }}>
            FlowIA est utilisé par toutes sortes de prestataires sur RDV. Tatoueurs, ostéopathes, photographes, coachs… contactez-nous pour qu'on étudie votre cas.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <PrimaryBtn href={COMMERCANT_URL + '/register'}>Essayer gratuitement</PrimaryBtn>
            <SecondaryBtn to="/contact">Parler à un conseiller</SecondaryBtn>
          </div>
        </div>
      </section>
    </>
  );
}
