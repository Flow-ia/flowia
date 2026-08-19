import { PageHero, Container, PrimaryBtn, SecondaryBtn } from './components/Shared';
import { S } from './components/shadcn';
import { COMMERCANT_URL } from '../../utils/siteConfig';
import Seo from './components/Seo';

export default function About() {
  const values = [
    {
      title: 'Au service des salons',
      desc: "Salon DZ est conçu en collaboration directe avec des coiffeurs, barbiers et esthéticiennes. Chaque fonctionnalité résout un vrai problème de terrain.",
    },
    {
      title: 'Données respectées',
      desc: "Hébergement cloud sécurisé, conforme à la loi 18-07. Vos données restent les vôtres — vous pouvez les exporter ou les supprimer à tout moment.",
    },
    {
      title: 'Simplicité avant tout',
      desc: "Pas besoin d'être un geek pour utiliser Salon DZ. Si une fonctionnalité demande plus de 2 clics à comprendre, on la retravaille.",
    },
    {
      title: 'Support humain',
      desc: "Pas de chatbot, pas de tickets qui se perdent. Notre équipe répond en moins de 5 minutes, par chat, email ou téléphone.",
    },
  ];

  return (
    <>
      <Seo
        path="/a-propos"
        title="À propos de Salon DZ — Le logiciel des salons et barbershops"
        description="L'histoire de Salon DZ : un logiciel pensé par des passionnés de la beauté et du bien-être, pour faciliter le quotidien des salons et barbershops."
      />
      <PageHero
        label="À propos"
        title="L'histoire derrière Salon DZ"
        subtitle="Un logiciel pensé par des passionnés de la beauté et du bien-être, pour des passionnés."
      />

      <Container maxWidth={720} paddingY={64}>
        <div style={{
          fontSize: 17, color: S.fg2, lineHeight: 1.75,
        }}>
          <p style={{ margin: 0, marginBottom: 20 }}>
            {"Salon DZ est née d'un constat simple : la plupart des logiciels de gestion pour salons sont soit trop complexes, soit trop limités, soit trop chers. Les commerçants passent plus de temps à se battre avec leurs outils qu'à s'occuper de leurs clients."}
          </p>
          <p style={{ margin: 0, marginBottom: 20 }}>
            {"Nous avons donc construit Salon DZ en partant des besoins réels du terrain : une page de réservation simple, un agenda clair, une caisse complète, un programme de fidélité qui marche tout seul, et un marketing qui ne demande pas de compétence technique."}
          </p>
          <p style={{ margin: 0, marginBottom: 0 }}>
            {"Aujourd'hui, plus de 500 salons en Algérie utilisent Salon DZ chaque jour. Si vous avez une idée, une remarque ou une critique, écrivez-nous — on lit tout."}
          </p>
        </div>
      </Container>

      <section style={{
        padding: '80px 24px',
        background: S.bgMuted,
        borderTop: `1px solid ${S.border}`,
        borderBottom: `1px solid ${S.border}`,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{
              fontSize: 12, fontWeight: 500, color: S.fgSubtle,
              textTransform: 'uppercase', letterSpacing: 1,
              margin: 0, marginBottom: 12,
            }}>Nos valeurs</p>
            <h2 style={{
              fontSize: 'clamp(26px, 3.5vw, 34px)', fontWeight: 500,
              color: S.fg, letterSpacing: '-0.025em', lineHeight: 1.2,
              margin: 0,
            }}>Ce qui nous tient à cœur</h2>
          </div>
          <div style={{
            display: 'grid', gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          }}>
            {values.map((v, i) => (
              <div key={v.title} style={{
                padding: 24, borderRadius: S.rLg,
                background: S.bg,
                border: `1px solid ${S.border}`,
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: S.rSm,
                  background: S.bgHover, color: S.fg,
                  fontSize: 12, fontWeight: 500,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  marginBottom: 14,
                }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 style={{ fontSize: 16, fontWeight: 500, color: S.fg, margin: 0, marginBottom: 6, letterSpacing: '-0.01em' }}>
                  {v.title}
                </h3>
                <p style={{ fontSize: 14, color: S.fgMuted, lineHeight: 1.6, margin: 0 }}>
                  {v.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Container maxWidth={760} paddingY={80}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{
            fontSize: 'clamp(26px, 3.5vw, 34px)', fontWeight: 500,
            color: S.fg, letterSpacing: '-0.025em', lineHeight: 1.2,
            margin: 0, marginBottom: 14,
          }}>
            Rejoignez la communauté Salon DZ
          </h2>
          <p style={{ fontSize: 16, color: S.fgMuted, margin: 0, marginBottom: 28, lineHeight: 1.6 }}>
            {"500+ salons. 50 000+ rendez-vous gérés chaque mois. Et ce n'est qu'un début."}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <PrimaryBtn href={COMMERCANT_URL + '/register'}>Essayer gratuitement</PrimaryBtn>
            <SecondaryBtn to="/contact">Nous contacter</SecondaryBtn>
          </div>
        </div>
      </Container>
    </>
  );
}
