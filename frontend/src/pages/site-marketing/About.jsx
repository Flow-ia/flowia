import { useTheme } from '../../hooks/useTheme';
import { I } from '../../utils/icons';
import { PageHero, Container, PrimaryBtn, SecondaryBtn } from './components/Shared';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

export default function About() {
  const { theme: t } = useTheme();

  const values = [
    {
      Ic: I.Heart, color: '#ef4444',
      title: 'Au service des salons',
      desc: "FlowIA est conçu en collaboration directe avec des coiffeurs, barbiers et esthéticiennes. Chaque fonctionnalité résout un vrai problème de terrain.",
    },
    {
      Ic: I.Lock, color: '#374151',
      title: 'Données respectées',
      desc: "Hébergement européen, RGPD-compliant, code auditable. Vos données restent les vôtres — vous pouvez exporter ou supprimer à tout moment.",
    },
    {
      Ic: I.Sparkles, color: '#8b5cf6',
      title: 'Simplicité avant tout',
      desc: "Pas besoin d'être un geek pour utiliser FlowIA. Si une fonctionnalité demande plus de 2 clics à comprendre, on la retravaille.",
    },
    {
      Ic: I.Send, color: '#10b981',
      title: 'Support humain',
      desc: "Pas de chatbot, pas de tickets qui se perdent. Notre équipe répond en moins de 5 minutes, par chat, email ou téléphone.",
    },
  ];

  return (
    <>
      <PageHero
        label="À propos"
        title="L'histoire derrière FlowIA"
        subtitle="Un logiciel pensé par des passionnés de la beauté et du bien-être, pour des passionnés."
      />

      <Container maxWidth={760}>
        <div style={{
          fontSize: 17, color: t.textSub, lineHeight: 1.7,
        }}>
          <p style={{ margin: 0, marginBottom: 18 }}>
            {"FlowIA est née d'un constat simple : la plupart des logiciels de gestion pour salons sont soit trop complexes, soit trop limités, soit trop chers. Les commerçants passent plus de temps à se battre avec leurs outils qu'à s'occuper de leurs clients."}
          </p>
          <p style={{ margin: 0, marginBottom: 18 }}>
            {"Nous avons donc construit FlowIA en partant des besoins réels du terrain : une page de réservation simple, un agenda clair, une caisse complète, un programme de fidélité qui marche tout seul, et un marketing qui ne demande pas de compétence technique."}
          </p>
          <p style={{ margin: 0, marginBottom: 18 }}>
            {"Aujourd'hui, plus de 500 salons en France utilisent FlowIA chaque jour. Et chaque jour, nos équipes améliorent l'application à partir des retours de nos commerçants. Si vous avez une idée, une remarque ou une critique, écrivez-nous — on lit tout."}
          </p>
        </div>
      </Container>

      <section style={{
        padding: '64px 24px',
        background: t.cardAlt,
        borderTop: `0.5px solid ${t.border}`,
        borderBottom: `0.5px solid ${t.border}`,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{
              fontSize: 12, fontWeight: 500, color: t.muted,
              textTransform: 'uppercase', letterSpacing: 0.8,
              margin: 0, marginBottom: 12,
            }}>Nos valeurs</p>
            <h2 style={{
              fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 500,
              color: t.text, letterSpacing: -0.5,
              margin: 0,
            }}>Ce qui nous tient à cœur</h2>
          </div>
          <div style={{
            display: 'grid', gap: 18,
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          }}>
            {values.map(v => (
              <div key={v.title} style={{
                padding: 24, borderRadius: 12,
                background: t.canvas,
                border: `0.5px solid ${t.border}`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: v.color + '15',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14,
                }}>
                  <v.Ic style={{ width: 18, height: 18, color: v.color }} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 500, color: t.text, margin: 0, marginBottom: 8 }}>
                  {v.title}
                </h3>
                <p style={{ fontSize: 14, color: t.textSub, lineHeight: 1.55, margin: 0 }}>
                  {v.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Container maxWidth={760}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{
            fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 500,
            color: t.text, letterSpacing: -0.5, lineHeight: 1.2,
            margin: 0, marginBottom: 14,
          }}>
            Rejoignez la communauté FlowIA
          </h2>
          <p style={{ fontSize: 16, color: t.textSub, margin: 0, marginBottom: 24, lineHeight: 1.6 }}>
            {"500+ salons. 50 000+ rendez-vous gérés chaque mois. Et ce n'est qu'un début."}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <PrimaryBtn href={COMMERCANT_URL + '/register'}>Essayer gratuitement</PrimaryBtn>
            <SecondaryBtn to="/contact">Nous contacter</SecondaryBtn>
          </div>
        </div>
      </Container>
    </>
  );
}
