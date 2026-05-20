import { useState } from 'react';
import { PageHero, Container } from './components/Shared';
import { S, primaryBtnStyle, ghostBtnStyle, primaryHover, ghostHover, CheckPill } from './components/shadcn';
import { COMMERCANT_URL } from '../../utils/siteConfig';
import Seo from './components/Seo';

export default function Pricing() {
  const [yearly, setYearly] = useState(false);

  const plans = [
    {
      name: 'Découverte', monthly: '0', yearly: '0', annual: '0',
      desc: "Pour démarrer et tester FlowIA sans risque.",
      features: [
        "Jusqu'à 50 RDV/mois", '1 employé', 'Page de réservation publique',
        'Caisse intégrée', 'Rappels RDV par email', 'Export CSV',
        'Commission 2 % sur paiements en ligne', 'Support email',
      ],
      cta: 'Commencer gratuitement', highlight: false,
    },
    {
      name: 'Essentiel', monthly: '24', yearly: '20', annual: '240',
      desc: "Tous les outils marketing pour fidéliser vos clients.",
      features: [
        'RDV illimités', "Jusqu'à 5 employés",
        '0 % de commission sur les paiements en ligne',
        'Campagnes SMS marketing', 'Programme fidélité',
        'Programme parrainage', 'Marketing IA', 'Support prioritaire',
      ],
      cta: "Démarrer l'essai 1 mois", highlight: true,
    },
    {
      name: 'Équipe', monthly: '49', yearly: '40,83', annual: '490',
      desc: "Pour les salons qui veulent un accompagnement dédié.",
      features: [
        'Tout du plan Essentiel', 'Employés illimités',
        'Cadeau anniversaire automatique',
        'Support dédié + SLA 99,9 %',
      ],
      cta: 'Nous contacter', highlight: false,
    },
  ];

  const compare = [
    { feature: 'Rendez-vous mensuels',         decouverte: '50',    essentiel: 'Illimités',   equipe: 'Illimités' },
    { feature: 'Employés',                     decouverte: '1',     essentiel: '5',           equipe: 'Illimités' },
    { feature: 'Page de réservation publique', decouverte: true,    essentiel: true,          equipe: true },
    { feature: 'Caisse intégrée',              decouverte: true,    essentiel: true,          equipe: true },
    { feature: 'Rappels RDV par email',        decouverte: true,    essentiel: true,          equipe: true },
    { feature: 'Export CSV',                   decouverte: true,    essentiel: true,          equipe: true },
    { feature: 'Commission paiements en ligne',decouverte: '2 %',   essentiel: '0 %',         equipe: '0 %' },
    { feature: 'Campagnes SMS marketing',      decouverte: false,   essentiel: true,          equipe: true },
    { feature: 'Programme fidélité',           decouverte: false,   essentiel: true,          equipe: true },
    { feature: 'Programme parrainage',         decouverte: false,   essentiel: true,          equipe: true },
    { feature: 'Marketing IA',                 decouverte: false,   essentiel: true,          equipe: true },
    { feature: 'Cadeau anniversaire',          decouverte: false,   essentiel: false,         equipe: true },
    { feature: 'Support',                      decouverte: 'Email', essentiel: 'Prioritaire', equipe: 'Dédié SLA' },
  ];

  return (
    <>
      <Seo
        path="/tarifs"
        title="Tarifs FlowIA — Logiciel salon sans commission, essai gratuit"
        description="Tarification simple et sans engagement pour votre salon ou barbershop. 1 mois d'essai gratuit, sans commission sur vos réservations. Annulez à tout moment."
      />
      <PageHero
        label="Tarifs"
        title="Une tarification simple, sans surprise"
        subtitle="Sans engagement. Annulez à tout moment. 1 mois d'essai gratuit sur le plan Essentiel."
      />

      <Container paddingY={56}>
        {/* Toggle Mensuel / Annuel */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 44 }}>
          <div style={{
            display: 'inline-flex', padding: 4, borderRadius: 99,
            background: S.bgMuted, border: `1px solid ${S.border}`,
          }}>
            <button onClick={() => setYearly(false)} style={{
              padding: '7px 18px', fontSize: 13, fontWeight: 500,
              borderRadius: 99, border: 'none', cursor: 'pointer',
              background: !yearly ? S.bg : 'transparent',
              color: !yearly ? S.fg : S.fgMuted,
              boxShadow: !yearly ? S.shadowSm : 'none',
              fontFamily: 'inherit',
            }}>Mensuel</button>
            <button onClick={() => setYearly(true)} style={{
              padding: '7px 18px', fontSize: 13, fontWeight: 500,
              borderRadius: 99, border: 'none', cursor: 'pointer',
              background: yearly ? S.bg : 'transparent',
              color: yearly ? S.fg : S.fgMuted,
              boxShadow: yearly ? S.shadowSm : 'none',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Annuel
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 99,
                background: S.ax.emeraldBg, color: S.ax.emerald, fontWeight: 500,
                border: `1px solid ${S.ax.emerald}33`,
              }}>2 mois offerts</span>
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          maxWidth: 1000, margin: '0 auto',
        }}>
          {plans.map(p => {
            const price = yearly ? p.yearly : p.monthly;
            return (
              <div key={p.name} style={{
                padding: 28, borderRadius: S.rLg,
                background: S.bg,
                border: p.highlight ? `1px solid ${S.fg}` : `1px solid ${S.border}`,
                position: 'relative',
                boxShadow: p.highlight ? S.shadowLg : S.shadowSm,
              }}>
                {p.highlight && (
                  <span style={{
                    position: 'absolute', top: -10, left: 24,
                    fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 99,
                    background: S.fg, color: S.fgInv, letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}>Populaire</span>
                )}
                <p style={{ fontSize: 14, fontWeight: 500, color: S.fg, margin: 0, marginBottom: 4, letterSpacing: '-0.01em' }}>{p.name}</p>
                <p style={{ fontSize: 13, color: S.fgSubtle, lineHeight: 1.5, margin: 0, marginBottom: 18 }}>{p.desc}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 38, fontWeight: 500, color: S.fg, letterSpacing: '-0.03em' }}>{price + ' €'}</span>
                  <span style={{ fontSize: 13, color: S.fgSubtle }}>/mois</span>
                </div>
                <p style={{ fontSize: 12, color: S.fgSubtle, margin: 0, marginBottom: 22 }}>
                  {yearly
                    ? (p.annual === '0' ? 'Gratuit' : `Facturé ${p.annual} €/an — 2 mois offerts`)
                    : (p.monthly === '0' ? 'Gratuit' : 'Facturé mensuellement')}
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ display: 'flex', gap: 10, fontSize: 13, color: S.fg2, alignItems: 'flex-start', lineHeight: 1.5 }}>
                      <span style={{ marginTop: 3 }}><CheckPill /></span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a href={ctaHref(p, yearly)}
                  style={{
                    ...(p.highlight ? primaryBtnStyle() : ghostBtnStyle()),
                    display: 'block', textAlign: 'center', width: '100%', boxSizing: 'border-box',
                  }}
                  {...(p.highlight ? primaryHover : ghostHover)}>
                  {p.cta}
                </a>
              </div>
            );
          })}
        </div>
      </Container>

      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 24, fontWeight: 500, color: S.fg,
            margin: 0, marginBottom: 24, letterSpacing: '-0.02em', textAlign: 'center',
          }}>
            Comparatif détaillé
          </h2>
          <div style={{
            background: S.bg, borderRadius: S.rLg,
            border: `1px solid ${S.border}`,
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse', fontSize: 14,
              minWidth: 540,
            }}>
              <thead>
                <tr style={{ background: S.bgMuted }}>
                  <th style={thStyle()}>Fonctionnalité</th>
                  <th style={thStyle()}>Découverte</th>
                  <th style={{ ...thStyle(), color: S.fg }}>Essentiel</th>
                  <th style={thStyle()}>Équipe</th>
                </tr>
              </thead>
              <tbody>
                {compare.map(row => (
                  <tr key={row.feature} style={{ borderTop: `1px solid ${S.border}` }}>
                    <td style={tdStyle(true)}>{row.feature}</td>
                    {['decouverte', 'essentiel', 'equipe'].map(k => (
                      <td key={k} style={tdStyle()}>
                        {typeof row[k] === 'boolean'
                          ? (row[k]
                              ? <CheckPill />
                              : <span style={{ color: S.fgSubtle }}>—</span>)
                          : <span style={{ color: S.fg2 }}>{row[k]}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 13, color: S.fgSubtle, textAlign: 'center', marginTop: 18, lineHeight: 1.6 }}>
            {"Tarifs hors taxes. Les SMS marketing sont facturés à l'usage (à partir de 0,06 € l'unité), réservés aux plans Essentiel et Équipe. La commission de 2 % sur le plan Découverte ne s'applique qu'aux paiements RDV encaissés via la page de réservation en ligne ; tous les plans payants en sont exonérés."}
          </p>
        </div>
      </section>
    </>
  );
}

// CTA href dynamique :
// - Découverte → /register (compte gratuit, pas d'abo Stripe)
// - Essentiel  → /register?plan=essentiel&period=monthly|yearly
//                AuthFlow capture l'intent en sessionStorage. Après confirmation
//                email, App.jsx redirige vers /abonnement?autostart=1 → Stripe
//                Checkout déclenché auto avec trial 30j sans CB.
// - Équipe     → /contact (devis personnalisé, pas de checkout direct)
function ctaHref(plan, yearly) {
  if (plan.name === 'Équipe') return '/contact';
  if (plan.name === 'Essentiel') {
    const period = yearly ? 'yearly' : 'monthly';
    return `${COMMERCANT_URL}/register?plan=essentiel&period=${period}`;
  }
  return `${COMMERCANT_URL}/register`;
}

function thStyle() {
  return {
    padding: '14px 18px', textAlign: 'left',
    fontSize: 12, fontWeight: 500, color: S.fgSubtle,
    textTransform: 'uppercase', letterSpacing: 1,
  };
}

function tdStyle(first) {
  return {
    padding: '14px 18px', textAlign: 'left',
    fontSize: 14, color: first ? S.fg : S.fg2,
    fontWeight: first ? 500 : 400,
  };
}
