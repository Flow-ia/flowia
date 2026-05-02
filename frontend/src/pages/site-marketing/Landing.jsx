import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../hooks/useTheme';
import { I } from '../../utils/icons';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

export default function Landing() {
  const { theme: t } = useTheme();
  return (
    <>
      <Hero t={t} />
      <Features t={t} />
      <AIShowcase t={t} />
      <ThreeSteps t={t} />
      <Testimonials t={t} />
      <Integrations t={t} />
      <Payments t={t} />
      <QrSection t={t} />
      <Support t={t} />
      <PricingTeaser t={t} />
      <Faq t={t} />
      <FinalCTA t={t} />
    </>
  );
}

function Section({ children, bg, t, paddingY = 56 }) {
  return (
    <section style={{
      background: bg || 'transparent',
      padding: `${paddingY}px 24px`,
      borderTop: bg && bg !== 'transparent' ? `0.5px solid ${t.border}` : 'none',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>{children}</div>
    </section>
  );
}

function SectionLabel({ children, t }) {
  return (
    <p style={{
      fontSize: 12, fontWeight: 500, color: t.muted,
      textTransform: 'uppercase', letterSpacing: 0.8,
      margin: 0, marginBottom: 12,
    }}>{children}</p>
  );
}

function H2({ children, t, align = 'left', maxWidth }) {
  return (
    <h2 style={{
      fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 500,
      color: t.text, lineHeight: 1.15, letterSpacing: -0.5,
      margin: 0, marginBottom: 14, textAlign: align,
      maxWidth, marginLeft: align === 'center' ? 'auto' : undefined,
      marginRight: align === 'center' ? 'auto' : undefined,
    }}>{children}</h2>
  );
}

function Lede({ children, t, align = 'left', maxWidth = 640 }) {
  return (
    <p style={{
      fontSize: 16, color: t.textSub, lineHeight: 1.5,
      margin: 0, marginBottom: 18, textAlign: align,
      maxWidth,
      marginLeft: align === 'center' ? 'auto' : undefined,
      marginRight: align === 'center' ? 'auto' : undefined,
    }}>{children}</p>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function Hero({ t }) {
  return (
    <section style={{
      padding: '56px 24px 40px',
      background: t.canvas,
      borderBottom: `0.5px solid ${t.border}`,
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 500,
          padding: '6px 12px', borderRadius: 99,
          background: 'linear-gradient(90deg, #eeedfe, #eef2ff)',
          border: `0.5px solid #c4b5fd`,
          color: '#5b21b6', letterSpacing: 0.3, marginBottom: 18,
        }}>
          <I.Sparkles style={{ width: 13, height: 13 }} />
          {"Propulsé par l'IA · 100 % français"}
        </span>

        <h1 style={{
          fontSize: 'clamp(34px, 5.5vw, 56px)', fontWeight: 500,
          color: t.text, lineHeight: 1.05, letterSpacing: -1.2,
          margin: 0, marginBottom: 14,
          maxWidth: 880, marginLeft: 'auto', marginRight: 'auto',
        }}>
          {"Le logiciel qui simplifie la gestion de votre salon"}
        </h1>
        <p style={{
          fontSize: 18, color: t.textSub, lineHeight: 1.5,
          maxWidth: 680, margin: '0 auto 24px',
        }}>
          {"Réservations en ligne 24/7, caisse, fidélité, marketing IA et bien plus. Tout votre salon dans une seule application."}
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={COMMERCANT_URL + '/register'} style={primaryBtn(t)}>
            {"Essayer gratuitement"}
          </a>
          <Link to="/fonctionnalites" style={secondaryBtn(t)}>
            {"Voir les fonctionnalités"}
          </Link>
        </div>

        <div style={{
          marginTop: 18,
          display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center',
          flexWrap: 'wrap', fontSize: 13, color: t.muted,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <I.Check style={{ width: 14, height: 14, color: '#10b981' }} /> Sans carte bancaire
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <I.Check style={{ width: 14, height: 14, color: '#10b981' }} /> Installation immédiate
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <I.Check style={{ width: 14, height: 14, color: '#10b981' }} /> Support 7j/7
          </span>
        </div>

        <div style={{
          marginTop: 36,
          borderRadius: 16,
          border: `0.5px solid ${t.border}`,
          background: t.cardAlt,
          boxShadow: t.shadowLg,
          padding: 24,
          maxWidth: 980, marginLeft: 'auto', marginRight: 'auto',
        }}>
          <MockDashboard t={t} />
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function Features({ t }) {
  const items = [
    {
      Ic: I.Sparkles, color: '#8b5cf6', bg: '#eeedfe',
      title: 'Marketing IA',
      desc: "L'intelligence artificielle de FlowIA propose le bon message au bon client au bon moment. Plus besoin de réfléchir à qui contacter ni quand.",
      badge: 'IA',
    },
    {
      Ic: I.Calendar, color: '#6366f1', bg: '#eef2ff',
      title: 'Réservation en ligne 24/7',
      desc: "Vos clients réservent quand ils veulent, depuis votre site, Google ou un QR code. Plus de coups de fil pour caler un créneau.",
    },
    {
      Ic: I.Bell, color: '#f59e0b', bg: '#fffbeb',
      title: 'Rappels automatiques SMS',
      desc: "Réduisez les no-shows de 70 %. Les SMS de rappel partent seuls 24h avant, et vos clients peuvent confirmer en un clic.",
    },
    {
      Ic: I.Wallet, color: '#10b981', bg: '#ecfdf5',
      title: 'Caisse intégrée',
      desc: "Encaissez en quelques secondes. Espèces, carte, virement, multi-paiements : tout est tracé et exportable pour votre comptable.",
    },
    {
      Ic: I.Heart, color: '#ef4444', bg: '#fef2f2',
      title: 'Fidélité & parrainage',
      desc: "Cumul de points automatique, récompenses paramétrables, programmes anniversaire et parrainage prêts à l'emploi.",
    },
    {
      Ic: I.Users, color: '#06b6d4', bg: '#ecfeff',
      title: 'Gestion équipe & PIN',
      desc: "Plusieurs employés, agendas dédiés, droits par rôle. Mode tablette partagée avec PIN — pas de session par employé à gérer.",
    },
  ];

  return (
    <Section t={t}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <SectionLabel t={t}>Tout-en-un</SectionLabel>
        <H2 t={t} align="center">Toutes les fonctionnalités dont votre salon a besoin</H2>
        <Lede t={t} align="center">
          {"Agenda, caisse, fidélité, marketing IA — tout dans une seule interface."}
        </Lede>
      </div>
      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}>
        {items.map(it => (
          <div key={it.title} style={{
            padding: 22, borderRadius: 12,
            background: t.canvas,
            border: `0.5px solid ${t.border}`,
            position: 'relative',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = t.shadowMd; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
            {it.badge && (
              <span style={{
                position: 'absolute', top: 14, right: 14,
                fontSize: 10, fontWeight: 500,
                padding: '3px 8px', borderRadius: 99,
                background: 'linear-gradient(90deg, #8b5cf6, #6366f1)',
                color: '#fff', letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}>
                {it.badge}
              </span>
            )}
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: it.bg, marginBottom: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <it.Ic style={{ width: 18, height: 18, color: it.color }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 500, color: t.text, margin: 0, marginBottom: 6 }}>
              {it.title}
            </h3>
            <p style={{ fontSize: 14, color: t.textSub, lineHeight: 1.55, margin: 0 }}>
              {it.desc}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function AIShowcase({ t }) {
  return (
    <section style={{
      padding: '64px 24px',
      background: 'linear-gradient(135deg, #faf5ff 0%, #eef2ff 100%)',
      borderTop: `0.5px solid ${t.border}`,
      borderBottom: `0.5px solid ${t.border}`,
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          display: 'grid', gap: 40,
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          alignItems: 'center',
        }}>
          <div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 500,
              padding: '4px 10px', borderRadius: 99,
              background: '#ffffff', border: `0.5px solid #c4b5fd`,
              color: '#5b21b6', letterSpacing: 0.4, marginBottom: 14,
              textTransform: 'uppercase',
            }}>
              <I.Sparkles style={{ width: 12, height: 12 }} />
              Intelligence artificielle
            </span>
            <h2 style={{
              fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 500,
              color: '#1e1b4b', lineHeight: 1.15, letterSpacing: -0.6,
              margin: 0, marginBottom: 14,
            }}>
              {"L'IA qui fait grandir votre salon"}
            </h2>
            <p style={{ fontSize: 16, color: '#3730a3', lineHeight: 1.55, margin: 0, marginBottom: 18 }}>
              {"FlowIA analyse votre activité et propose les bonnes actions. Campagnes SMS générées automatiquement, prévisions de chiffre d'affaires, détection des clients dormants."}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
              {[
                'Suggestions de campagnes basées sur vos données',
                "Génération automatique du texte (SMS et email)",
                "Détection des clients en risque de fuite",
                "Prévisions de CA sur 4 semaines",
              ].map(b => (
                <li key={b} style={{ display: 'flex', gap: 8, fontSize: 14, color: '#3730a3' }}>
                  <I.Check style={{ width: 14, height: 14, color: '#8b5cf6', flexShrink: 0, marginTop: 3 }} />
                  {b}
                </li>
              ))}
            </ul>
            <Link to="/fonctionnalites#ia" style={{
              fontSize: 14, fontWeight: 500, color: '#fff',
              background: 'linear-gradient(90deg, #8b5cf6, #6366f1)',
              padding: '11px 18px', borderRadius: 10,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              Découvrir l'IA <I.ChevR style={{ width: 13, height: 13 }} />
            </Link>
          </div>
          <div style={{
            background: '#fff', borderRadius: 16,
            border: `0.5px solid ${t.border}`,
            boxShadow: t.shadowLg,
            padding: 22,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <I.Sparkles style={{ width: 16, height: 16, color: '#fff' }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#1e1b4b', margin: 0 }}>FlowIA Assistant</p>
                <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Suggestion · il y a 2 min</p>
              </div>
            </div>
            <div style={{
              padding: 14, borderRadius: 10,
              background: '#faf5ff', border: '0.5px solid #c4b5fd',
              marginBottom: 12,
            }}>
              <p style={{ fontSize: 13, color: '#1e1b4b', margin: 0, lineHeight: 1.55 }}>
                {"23 clientes n'ont pas pris RDV depuis 3 mois. Une campagne SMS \"On vous a vues, mais ça fait longtemps\" pourrait en faire revenir 6 à 8 cette semaine."}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{
                flex: 1, padding: '9px 12px', borderRadius: 8,
                background: 'linear-gradient(90deg, #8b5cf6, #6366f1)', color: '#fff',
                border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
                Lancer la campagne
              </button>
              <button style={{
                padding: '9px 12px', borderRadius: 8,
                background: '#fff', color: '#374151',
                border: '0.5px solid #e5e7eb', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
                Voir détails
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function ThreeSteps({ t }) {
  const steps = [
    { n: '01', title: 'Créez votre page de réservation', desc: "Renseignez vos prestations, vos horaires et vos employés. Tout est paramétrable en moins de 10 minutes." },
    { n: '02', title: 'Personnalisez votre image',       desc: "Logo, couleurs, photos, conditions, politique d'annulation — votre salon, votre identité." },
    { n: '03', title: 'Partagez et gérez',                desc: "Site web, Google, Instagram, QR code en vitrine : vos clients réservent en 30 secondes, vous gérez tout depuis FlowIA." },
  ];
  return (
    <Section t={t} bg={t.cardAlt}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <SectionLabel t={t}>Démarrage simple</SectionLabel>
        <H2 t={t} align="center">3 étapes pour digitaliser votre salon</H2>
        <Lede t={t} align="center">
          {"Pas de formation requise. La plupart de nos commerçants sont opérationnels le jour même."}
        </Lede>
      </div>
      <div style={{
        display: 'grid', gap: 18,
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      }}>
        {steps.map(s => (
          <div key={s.n} style={{
            padding: 28, borderRadius: 12,
            background: t.canvas,
            border: `0.5px solid ${t.border}`,
          }}>
            <p style={{
              fontSize: 12, fontWeight: 500, color: t.muted,
              fontFamily: 'monospace', letterSpacing: 0.6,
              margin: 0, marginBottom: 14,
            }}>{s.n}</p>
            <h3 style={{ fontSize: 18, fontWeight: 500, color: t.text, margin: 0, marginBottom: 8, lineHeight: 1.3 }}>
              {s.title}
            </h3>
            <p style={{ fontSize: 14, color: t.textSub, lineHeight: 1.6, margin: 0 }}>
              {s.desc}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function Testimonials({ t }) {
  const items = [
    {
      name: 'Sofiane Belkacem', role: 'Hair Coiff Lille — Barbier',
      quote: "Avant FlowIA, je passais 1h par jour au téléphone à caler des RDV. Maintenant c'est 0. Je me concentre sur mes clients en chaise.",
      stars: 5,
    },
    {
      name: 'Camille Roussel', role: 'Studio Camille — Coiffeuse',
      quote: "Les rappels SMS ont fait disparaître les no-shows. J'ai gagné 800 €/mois rien qu'avec ça. Je ne reviendrai jamais en arrière.",
      stars: 5,
    },
    {
      name: 'Élodie Marchand', role: 'Beauty Box — Esthéticienne',
      quote: "Le programme de fidélité tourne tout seul, mes clientes adorent. Et le support répond en moins de 5 minutes quand j'ai un doute.",
      stars: 5,
    },
  ];
  return (
    <Section t={t}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <SectionLabel t={t}>Ils nous font confiance</SectionLabel>
        <H2 t={t} align="center">Plus de 500 salons utilisent FlowIA chaque jour</H2>
      </div>
      <div style={{
        display: 'grid', gap: 18,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}>
        {items.map(it => (
          <div key={it.name} style={{
            padding: 24, borderRadius: 12,
            background: t.canvas,
            border: `0.5px solid ${t.border}`,
          }}>
            <div style={{ display: 'flex', gap: 2, marginBottom: 14 }}>
              {Array.from({ length: it.stars }).map((_, i) => (
                <I.Star key={i} style={{ width: 14, height: 14, color: '#f59e0b', fill: '#f59e0b' }} />
              ))}
            </div>
            <p style={{ fontSize: 15, color: t.text, lineHeight: 1.6, margin: 0, marginBottom: 18 }}>
              {"« " + it.quote + " »"}
            </p>
            <div style={{ borderTop: `0.5px solid ${t.border}`, paddingTop: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: t.text, margin: 0 }}>{it.name}</p>
              <p style={{ fontSize: 12, color: t.muted, margin: '2px 0 0' }}>{it.role}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function Integrations({ t }) {
  const items = [
    {
      name: 'Stripe',
      title: 'Encaissez en ligne',
      desc: "Acceptez les paiements de vos clients à la réservation et reversez-vous les fonds automatiquement. Sécurisé, fiable, sans frais cachés côté FlowIA.",
    },
    {
      name: 'Google Calendar',
      title: 'Synchronisez votre agenda',
      desc: "Vos rendez-vous FlowIA apparaissent dans votre Google Agenda, et inversement. Une seule vue pour votre vie pro et perso.",
    },
  ];
  return (
    <Section t={t} bg={t.cardAlt}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <SectionLabel t={t}>Connectez vos outils</SectionLabel>
        <H2 t={t} align="center">{"S'intègre à votre écosystème"}</H2>
        <Lede t={t} align="center">
          {"FlowIA se connecte aux services que vous utilisez déjà pour ne rien chambouler dans votre quotidien."}
        </Lede>
      </div>
      <div style={{
        display: 'grid', gap: 18,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        maxWidth: 760, margin: '0 auto',
      }}>
        {items.map(it => (
          <div key={it.name} style={{
            padding: 28, borderRadius: 14,
            background: t.canvas,
            border: `0.5px solid ${t.border}`,
          }}>
            <p style={{
              fontSize: 11, fontWeight: 500, color: t.muted,
              textTransform: 'uppercase', letterSpacing: 0.6,
              margin: 0, marginBottom: 10,
            }}>
              {it.name}
            </p>
            <h3 style={{ fontSize: 17, fontWeight: 500, color: t.text, margin: 0, marginBottom: 10 }}>
              {it.title}
            </h3>
            <p style={{ fontSize: 14, color: t.textSub, lineHeight: 1.6, margin: 0 }}>
              {it.desc}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function Payments({ t }) {
  return (
    <Section t={t}>
      <div style={{
        display: 'grid', gap: 48,
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        alignItems: 'center',
      }}>
        <div>
          <SectionLabel t={t}>Encaissements</SectionLabel>
          <H2 t={t}>Encaissez en ligne ou en boutique</H2>
          <Lede t={t} maxWidth={520}>
            {"Vos clients règlent à la réservation ou en caisse. Les fonds arrivent directement sur votre compte bancaire — FlowIA ne prélève rien sur vos encaissements."}
          </Lede>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Carte bancaire en ligne (acomptes ou montant total)',
              'Multi-paiements en caisse (espèces, carte, virement)',
              'Avoirs, crédits clients et remboursements RGPD',
              'Export comptable mensuel automatique'].map(li => (
              <li key={li} style={{ display: 'flex', gap: 10, fontSize: 14, color: t.textSub }}>
                <I.Check style={{ width: 16, height: 16, color: '#10b981', flexShrink: 0, marginTop: 2 }} />
                {li}
              </li>
            ))}
          </ul>
        </div>
        <div style={{
          padding: 28, borderRadius: 16,
          background: t.cardAlt,
          border: `0.5px solid ${t.border}`,
        }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: t.muted, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0, marginBottom: 16 }}>
            Encaissement caisse
          </p>
          <div style={{
            background: t.canvas, borderRadius: 12,
            border: `0.5px solid ${t.border}`,
            padding: 18, marginBottom: 14,
          }}>
            <p style={{ fontSize: 13, color: t.muted, margin: 0 }}>Coupe + barbe</p>
            <p style={{ fontSize: 32, fontWeight: 500, color: t.text, margin: '4px 0 0', fontFamily: 'monospace' }}>
              42,00 €
            </p>
          </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {[
              { label: 'Espèces', color: '#10b981', bg: '#ecfdf5' },
              { label: 'Carte',   color: '#6366f1', bg: '#eef2ff' },
              { label: 'Virement',color: '#06b6d4', bg: '#ecfeff' },
              { label: 'Multi',   color: '#f59e0b', bg: '#fffbeb' },
            ].map(p => (
              <div key={p.label} style={{
                padding: '10px 14px', borderRadius: 10,
                background: p.bg, color: p.color,
                border: `0.5px solid ${p.color}33`,
                fontSize: 13, fontWeight: 500, textAlign: 'center',
              }}>{p.label}</div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function QrSection({ t }) {
  return (
    <Section t={t} bg={t.cardAlt}>
      <div style={{
        display: 'grid', gap: 48,
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        alignItems: 'center',
      }}>
        <div>
          <SectionLabel t={t}>QR Code</SectionLabel>
          <H2 t={t}>Donnez à vos clients le pouvoir de réserver à tout moment</H2>
          <Lede t={t} maxWidth={520}>
            {"Affichez un QR code en vitrine, sur vos cartes de visite, sur Instagram. Vos clients scannent, réservent, vous remplissez votre agenda même quand vous êtes fermé."}
          </Lede>
          <a href={COMMERCANT_URL + '/register'} style={primaryBtn(t)}>
            {"Commencer gratuitement"}
          </a>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 32, borderRadius: 16,
          background: t.canvas,
          border: `0.5px solid ${t.border}`,
        }}>
          <FakeQR t={t} />
        </div>
      </div>
    </Section>
  );
}

function FakeQR({ t }) {
  const cells = Array.from({ length: 21 * 21 }).map((_, i) => {
    const x = i % 21, y = Math.floor(i / 21);
    const isCorner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    const cornerEdge =
      (x === 0 || x === 6 || y === 0 || y === 6) && (x < 7 && y < 7) ||
      (x === 14 || x === 20 || y === 0 || y === 6) && (x > 13 && y < 7) ||
      (x === 0 || x === 6 || y === 14 || y === 20) && (x < 7 && y > 13);
    const cornerInner =
      (x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
      (x >= 16 && x <= 18 && y >= 2 && y <= 4) ||
      (x >= 2 && x <= 4 && y >= 16 && y <= 18);
    const random = ((x * 7 + y * 13 + x * y) % 5) === 0;
    const filled = isCorner ? (cornerEdge || cornerInner) : random;
    return filled;
  });
  return (
    <div style={{
      display: 'grid', gap: 0, padding: 14, background: '#fff', borderRadius: 12,
      gridTemplateColumns: 'repeat(21, 8px)', gridTemplateRows: 'repeat(21, 8px)',
      border: `0.5px solid ${t.border}`,
    }}>
      {cells.map((on, i) => (
        <div key={i} style={{ width: 8, height: 8, background: on ? t.text : '#fff' }} />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function Support({ t }) {
  return (
    <Section t={t}>
      <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
        <SectionLabel t={t}>Support inclus</SectionLabel>
        <H2 t={t} align="center">{"Une équipe à vos côtés, 7 jours sur 7"}</H2>
        <Lede t={t} align="center">
          {"Tous nos clients bénéficient d'un support humain par chat, email et téléphone. Temps de réponse moyen : 4 minutes."}
        </Lede>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginTop: 32 }}>
          {[
            { Ic: I.Mail,  label: 'Email',      sub: 'contact@flowiapro.com' },
            { Ic: I.Phone, label: 'Téléphone',  sub: 'Lun-Dim · 8h-22h' },
            { Ic: I.Send,  label: 'Chat live',  sub: 'Réponse en < 5 min' },
          ].map(c => (
            <div key={c.label} style={{
              padding: '14px 20px', borderRadius: 12,
              background: t.cardAlt, border: `0.5px solid ${t.border}`,
              display: 'flex', alignItems: 'center', gap: 12, minWidth: 200,
            }}>
              <c.Ic style={{ width: 18, height: 18, color: t.text }} />
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: t.text, margin: 0 }}>{c.label}</p>
                <p style={{ fontSize: 12, color: t.muted, margin: 0 }}>{c.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function PricingTeaser({ t }) {
  const plans = [
    {
      name: 'Découverte', price: '0', period: '/mois',
      desc: "Pour démarrer et tester FlowIA sur votre salon.",
      features: ["Jusqu'à 50 RDV/mois", '1 employé', 'Page de réservation', 'Caisse de base', 'Support email'],
      cta: 'Commencer', highlight: false,
    },
    {
      name: 'Pro', price: '29', period: '/mois',
      desc: "La formule complète pour faire grandir votre salon.",
      features: ['RDV illimités', "Jusqu'à 5 employés", 'SMS rappels & marketing', 'Fidélité & parrainage', 'Marketing IA', 'Support prioritaire 7j/7'],
      cta: 'Essayer 14 jours', highlight: true,
    },
    {
      name: 'Équipe', price: '59', period: '/mois',
      desc: "Pour les salons multi-employés et multi-sites.",
      features: ['Tout du plan Pro', 'Employés illimités', 'Multi-sites', 'API & exports avancés', 'Account manager dédié'],
      cta: 'Nous contacter', highlight: false,
    },
  ];
  return (
    <Section t={t} bg={t.cardAlt}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <SectionLabel t={t}>Tarifs</SectionLabel>
        <H2 t={t} align="center">{"Une tarification simple, sans surprise"}</H2>
        <Lede t={t} align="center">
          {"Sans engagement. Annulez à tout moment. 14 jours d'essai gratuit sur le plan Pro."}
        </Lede>
      </div>
      <div style={{
        display: 'grid', gap: 18,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        maxWidth: 980, margin: '0 auto',
      }}>
        {plans.map(p => (
          <div key={p.name} style={{
            padding: 28, borderRadius: 14,
            background: t.canvas,
            border: p.highlight ? `1px solid ${t.text}` : `0.5px solid ${t.border}`,
            position: 'relative',
            boxShadow: p.highlight ? t.shadowMd : 'none',
          }}>
            {p.highlight && (
              <span style={{
                position: 'absolute', top: -10, left: 24,
                fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 99,
                background: t.text, color: t.bg, letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}>
                Populaire
              </span>
            )}
            <p style={{ fontSize: 14, fontWeight: 500, color: t.text, margin: 0, marginBottom: 6 }}>{p.name}</p>
            <p style={{ fontSize: 13, color: t.muted, lineHeight: 1.5, margin: 0, marginBottom: 18 }}>{p.desc}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 22 }}>
              <span style={{ fontSize: 40, fontWeight: 500, color: t.text, letterSpacing: -1 }}>{p.price} €</span>
              <span style={{ fontSize: 14, color: t.muted }}>{p.period}</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {p.features.map(f => (
                <li key={f} style={{ display: 'flex', gap: 10, fontSize: 13, color: t.textSub }}>
                  <I.Check style={{ width: 14, height: 14, color: '#10b981', flexShrink: 0, marginTop: 3 }} />
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/tarifs" style={{
              ...(p.highlight ? primaryBtn(t) : secondaryBtn(t)),
              display: 'block', textAlign: 'center', width: '100%', boxSizing: 'border-box',
            }}>
              {p.cta}
            </Link>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function Faq({ t }) {
  const items = [
    {
      q: "Qu'est-ce qu'une page de réservation FlowIA ?",
      a: "C'est votre vitrine en ligne dédiée à la prise de rendez-vous. Vos clients voient vos prestations, vos employés, vos disponibilités, et réservent en 30 secondes. Vous la partagez par lien, QR code ou directement depuis votre site web.",
    },
    {
      q: "Puis-je essayer FlowIA gratuitement ?",
      a: "Oui. Le plan Découverte est gratuit à vie pour les petits salons. Le plan Pro est offert 14 jours sans carte bancaire — vous testez en conditions réelles, et vous décidez ensuite.",
    },
    {
      q: "Mes données et celles de mes clients sont-elles en sécurité ?",
      a: "Vos données sont hébergées en Europe, chiffrées en transit et au repos, et conformes RGPD. Vous gardez la propriété complète, vous pouvez exporter ou supprimer à tout moment.",
    },
    {
      q: "Comment se passe la migration depuis mon ancien outil ?",
      a: "Notre équipe vous accompagne gratuitement pour importer vos clients, vos prestations et vos rendez-vous existants. Comptez 24 à 48h selon la taille de votre base.",
    },
    {
      q: "Y a-t-il un engagement ou des frais cachés ?",
      a: "Aucun. Pas d'engagement, pas de frais de mise en place. Vous payez au mois, vous arrêtez quand vous voulez. Les SMS sont facturés au coût réel sans marge.",
    },
    {
      q: "FlowIA fonctionne-t-il sur mobile et tablette ?",
      a: "Oui, FlowIA est une application web responsive — elle fonctionne parfaitement sur ordinateur, tablette et téléphone. Le mode tablette partagée avec PIN est idéal pour les salons avec plusieurs employés.",
    },
  ];
  const [open, setOpen] = useState(0);
  return (
    <Section t={t}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <SectionLabel t={t}>FAQ</SectionLabel>
        <H2 t={t} align="center">Questions fréquentes</H2>
      </div>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {items.map((it, i) => (
          <div key={it.q} style={{
            borderBottom: `0.5px solid ${t.border}`,
          }}>
            <button onClick={() => setOpen(open === i ? -1 : i)} style={{
              width: '100%', padding: '20px 4px', background: 'transparent',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 16, textAlign: 'left',
            }}>
              <span style={{ fontSize: 16, fontWeight: 500, color: t.text }}>{it.q}</span>
              <I.ChevR style={{
                width: 16, height: 16, color: t.muted,
                transform: open === i ? 'rotate(90deg)' : 'rotate(0)',
                transition: 'transform 0.2s ease', flexShrink: 0,
              }} />
            </button>
            {open === i && (
              <div style={{ padding: '0 4px 20px', fontSize: 15, color: t.textSub, lineHeight: 1.65 }}>
                {it.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function FinalCTA({ t }) {
  return (
    <Section t={t} bg={t.cardAlt}>
      <div style={{
        textAlign: 'center', maxWidth: 720, margin: '0 auto',
        padding: '32px 24px',
      }}>
        <H2 t={t} align="center">{"Donnez à votre salon les outils qu'il mérite"}</H2>
        <Lede t={t} align="center">
          {"Rejoignez les centaines de salons qui ont choisi FlowIA. 14 jours d'essai, sans carte, sans engagement."}
        </Lede>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <a href={COMMERCANT_URL + '/register'} style={primaryBtn(t)}>
            {"Commencer gratuitement"}
          </a>
          <Link to="/contact" style={secondaryBtn(t)}>
            {"Parler à un conseiller"}
          </Link>
        </div>
      </div>
    </Section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function primaryBtn(t) {
  return {
    fontSize: 15, fontWeight: 500, color: t.bg,
    background: t.text, border: 'none',
    padding: '13px 22px', borderRadius: 10,
    textDecoration: 'none', cursor: 'pointer',
    display: 'inline-block', fontFamily: 'inherit',
  };
}

function secondaryBtn(t) {
  return {
    fontSize: 15, fontWeight: 500, color: t.text,
    background: 'transparent', border: `0.5px solid ${t.borderStrong}`,
    padding: '13px 22px', borderRadius: 10,
    textDecoration: 'none', cursor: 'pointer',
    display: 'inline-block', fontFamily: 'inherit',
  };
}
