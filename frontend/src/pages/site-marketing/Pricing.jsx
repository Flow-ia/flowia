import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { I } from '../../utils/icons';
import { PageHero, Container } from './components/Shared';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

export default function Pricing() {
  const { theme: t } = useTheme();
  const [yearly, setYearly] = useState(false);

  const plans = [
    {
      name: 'Découverte', monthly: 0, yearly: 0,
      desc: "Pour démarrer et tester FlowIA sans risque.",
      features: [
        "Jusqu'à 50 RDV/mois",
        '1 employé',
        'Page de réservation publique',
        'Caisse de base',
        'Export CSV',
        'Support email',
      ],
      cta: 'Commencer gratuitement', highlight: false,
    },
    {
      name: 'Pro', monthly: 29, yearly: 24,
      desc: "La formule complète pour faire grandir votre salon.",
      features: [
        'RDV illimités',
        "Jusqu'à 5 employés",
        'SMS rappels et marketing',
        'Fidélité et parrainage',
        'Marketing IA',
        'Caisse complète',
        'Export PDF avancé',
        'Support prioritaire 7j/7',
      ],
      cta: "Démarrer l'essai 14 jours", highlight: true,
    },
    {
      name: 'Équipe', monthly: 49, yearly: 39,
      desc: "Pour les salons multi-employés et multi-sites.",
      features: [
        'Tout du plan Pro',
        'Employés illimités',
        'Multi-sites',
        'API et exports avancés',
        'Statistiques par employé/site',
        'Account manager dédié',
        'SLA 99,9 %',
      ],
      cta: 'Nous contacter', highlight: false,
    },
  ];

  const compare = [
    { feature: 'Rendez-vous mensuels',          decouverte: '50',  pro: 'Illimités',  equipe: 'Illimités' },
    { feature: 'Employés',                      decouverte: '1',   pro: '5',          equipe: 'Illimités' },
    { feature: 'Page de réservation publique',  decouverte: true,  pro: true,         equipe: true },
    { feature: 'Caisse complète',               decouverte: false, pro: true,         equipe: true },
    { feature: 'SMS rappels',                   decouverte: false, pro: true,         equipe: true },
    { feature: 'Marketing IA',                  decouverte: false, pro: true,         equipe: true },
    { feature: 'Fidélité et parrainage',        decouverte: false, pro: true,         equipe: true },
    { feature: 'Multi-sites',                   decouverte: false, pro: false,        equipe: true },
    { feature: 'API & webhooks',                decouverte: false, pro: false,        equipe: true },
    { feature: 'Account manager',               decouverte: false, pro: false,        equipe: true },
    { feature: 'Support',                       decouverte: 'Email', pro: 'Prioritaire 7j/7', equipe: 'Dédié SLA' },
  ];

  return (
    <>
      <PageHero
        label="Tarifs"
        title="Une tarification simple, sans surprise"
        subtitle="Sans engagement. Annulez à tout moment. 14 jours d'essai gratuit sur le plan Pro."
      />

      <Container paddingY={56}>
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 0,
          marginBottom: 40, alignItems: 'center',
        }}>
          <div style={{
            display: 'inline-flex', padding: 4, borderRadius: 99,
            background: t.cardAlt, border: `0.5px solid ${t.border}`,
          }}>
            <button onClick={() => setYearly(false)} style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 500,
              borderRadius: 99, border: 'none', cursor: 'pointer',
              background: !yearly ? t.canvas : 'transparent',
              color: !yearly ? t.text : t.muted,
              boxShadow: !yearly ? t.shadowSm : 'none',
              fontFamily: 'inherit',
            }}>Mensuel</button>
            <button onClick={() => setYearly(true)} style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 500,
              borderRadius: 99, border: 'none', cursor: 'pointer',
              background: yearly ? t.canvas : 'transparent',
              color: yearly ? t.text : t.muted,
              boxShadow: yearly ? t.shadowSm : 'none',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Annuel
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 99,
                background: '#ecfdf5', color: '#065f46', fontWeight: 500,
                border: '0.5px solid #a7f3d0',
              }}>-15 %</span>
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid', gap: 18,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          maxWidth: 980, margin: '0 auto',
        }}>
          {plans.map(p => {
            const price = yearly ? p.yearly : p.monthly;
            return (
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
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 40, fontWeight: 500, color: t.text, letterSpacing: -1 }}>{price} €</span>
                  <span style={{ fontSize: 14, color: t.muted }}>/mois</span>
                </div>
                <p style={{ fontSize: 12, color: t.muted, margin: 0, marginBottom: 22 }}>
                  {yearly ? "Facturé annuellement" : "Facturé mensuellement"}
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ display: 'flex', gap: 10, fontSize: 13, color: t.textSub }}>
                      <I.Check style={{ width: 14, height: 14, color: '#10b981', flexShrink: 0, marginTop: 3 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href={p.name === 'Équipe' ? '/contact' : COMMERCANT_URL + '/register'} style={{
                  display: 'block', textAlign: 'center', width: '100%', boxSizing: 'border-box',
                  fontSize: 15, fontWeight: 500,
                  color: p.highlight ? t.bg : t.text,
                  background: p.highlight ? t.text : 'transparent',
                  border: p.highlight ? 'none' : `0.5px solid ${t.borderStrong}`,
                  padding: '13px 22px', borderRadius: 10,
                  textDecoration: 'none', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}>
                  {p.cta}
                </a>
              </div>
            );
          })}
        </div>
      </Container>

      <section style={{ padding: '0 24px 56px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 22, fontWeight: 500, color: t.text,
            margin: 0, marginBottom: 24, letterSpacing: -0.3, textAlign: 'center',
          }}>
            Comparatif détaillé
          </h2>
          <div style={{
            background: t.canvas, borderRadius: 12,
            border: `0.5px solid ${t.border}`,
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse', fontSize: 14,
              minWidth: 540,
            }}>
              <thead>
                <tr style={{ background: t.cardAlt }}>
                  <th style={th(t)}>Fonctionnalité</th>
                  <th style={th(t)}>Découverte</th>
                  <th style={{ ...th(t), color: t.text, fontWeight: 500 }}>Pro</th>
                  <th style={th(t)}>Équipe</th>
                </tr>
              </thead>
              <tbody>
                {compare.map(row => (
                  <tr key={row.feature} style={{ borderTop: `0.5px solid ${t.border}` }}>
                    <td style={td(t, true)}>{row.feature}</td>
                    {['decouverte', 'pro', 'equipe'].map(k => (
                      <td key={k} style={td(t)}>
                        {typeof row[k] === 'boolean'
                          ? (row[k]
                              ? <I.Check style={{ width: 16, height: 16, color: '#10b981' }} />
                              : <span style={{ color: t.dim }}>—</span>)
                          : <span style={{ color: t.textSub }}>{row[k]}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 13, color: t.muted, textAlign: 'center', marginTop: 18 }}>
            {"Tarifs hors taxes. Les SMS sont facturés au coût réel sans marge (à partir de 0,045 € l'unité)."}
          </p>
        </div>
      </section>
    </>
  );
}

function th(t) {
  return {
    padding: '14px 18px', textAlign: 'left',
    fontSize: 12, fontWeight: 500, color: t.muted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  };
}
function td(t, first) {
  return {
    padding: '14px 18px', textAlign: 'left',
    fontSize: 14, color: first ? t.text : t.textSub,
    fontWeight: first ? 500 : 400,
  };
}
