import { useState } from 'react';
import { PageHero, PrimaryBtn, SecondaryBtn } from './components/Shared';
import { S, CheckPill } from './components/shadcn';
import { COMMERCANT_URL } from '../../utils/siteConfig';
import Seo from './components/Seo';

const ITEMS = [
  {
    id: 'coiffeur',
    title: 'Coiffeur',
    tagline: 'Salons de coiffure femme, homme, mixte',
    desc: "Gérez prestations multiples (couleur, mèches, brushing), durées variables, double employé sur un même client. La fidélité fait revenir vos clientes mois après mois.",
    img: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600&q=80&auto=format&fit=crop',
    accent: S.ax.blue,
    stats: [
      { v: '+18 %',  l: 'de rebookings' },
      { v: '−70 %',  l: 'de no-shows' },
      { v: '40 min', l: 'gagnées par jour' },
    ],
    bullets: [
      'Gestion fine des prestations longues (couleur, mèches)',
      'Plusieurs employés sur un même créneau',
      'Fidélité automatique et programmes anniversaire',
      'Site de réservation à votre image',
    ],
  },
  {
    id: 'barbier',
    title: 'Barbier',
    tagline: 'Barbershops modernes',
    desc: "Files d'attente, pose rapide en mode caisse, programme de fidélité dédié. La page de réservation publique respire le style barbershop.",
    img: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1600&q=80&auto=format&fit=crop',
    accent: S.ax.amber,
    stats: [
      { v: '24/7',   l: 'de réservations' },
      { v: '+30 %',  l: 'de nouveaux clients' },
      { v: '< 30 s', l: 'pour réserver' },
    ],
    bullets: [
      'Caisse rapide pour le walk-in',
      'Réservations 24/7 via QR en vitrine',
      'Programme de fidélité dédié',
      'Mode tablette partagée avec PIN employé',
    ],
  },
  {
    id: 'manucure',
    title: 'Manucure & Onglerie',
    tagline: 'Studios nail art et prothésistes ongulaires',
    desc: "Gérez prestations longues (poses, dépose, nail art), photos de portfolio sur la page publique, paiement d'acompte pour sécuriser les réservations.",
    img: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1600&q=80&auto=format&fit=crop',
    accent: S.ax.rose,
    stats: [
      { v: '90 %',    l: 'des RDV en ligne' },
      { v: 'Acompte', l: 'optionnel' },
      { v: 'Photos',  l: 'portfolio' },
    ],
    bullets: [
      'Acompte en ligne pour sécuriser les RDV',
      'Photos portfolio de chaque prestation',
      'Gestion des prestations longues (3h+)',
      'Notes privées par cliente',
    ],
  },
  {
    id: 'esthetique',
    title: 'Esthétique',
    tagline: 'Instituts de beauté, soins, épilation',
    desc: "Carnet de soins par cliente, suivi des contre-indications, rappel des soins récurrents. Vendez vos produits cosmétiques en caisse en plus des prestations.",
    img: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1600&q=80&auto=format&fit=crop',
    accent: S.ax.violet,
    stats: [
      { v: 'Cartes',   l: 'de soins' },
      { v: 'Cabines',  l: 'multiples' },
      { v: 'Produits', l: 'à la vente' },
    ],
    bullets: [
      'Carnet de soins et contre-indications',
      'Vente de produits en caisse',
      'Cabines multiples gérées en parallèle',
      'Rappels de soins récurrents',
    ],
  },
  {
    id: 'spa',
    title: 'Spa & Bien-être',
    tagline: 'Spas, massages, hammam, sauna',
    desc: "Réservation de cabines, durée flexible, plusieurs praticien·ne·s en parallèle, gestion des forfaits (10 séances) et bons cadeaux.",
    img: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1600&q=80&auto=format&fit=crop',
    accent: S.ax.cyan,
    stats: [
      { v: 'Forfaits', l: 'multi-séances' },
      { v: 'Cadeaux',  l: 'numériques' },
      { v: 'Cabines',  l: 'parallèles' },
    ],
    bullets: [
      'Forfaits multi-séances avec décompte automatique',
      'Bons cadeaux numériques',
      'Plusieurs cabines en parallèle',
      'Réservation de prestations longues (90 min+)',
    ],
  },
];

export default function Industries() {
  return (
    <>
      <Seo
        path="/pour-qui"
        title="Salon DZ pour coiffeurs, barbiers, esthétique & spa"
        description="Coiffeurs, barbershops, manucure, esthétique, spa : Salon DZ s'adapte à votre métier. Plus de 500 salons l'utilisent au quotidien."
      />
      <PageHero
        label="Pour qui"
        title="Salon DZ s'adapte à votre métier"
        subtitle="Coiffeurs, barbiers, manucures, esthéticien·ne·s, spas… plus de 500 salons utilisent Salon DZ chaque jour."
      />

      <section style={{ padding: '56px 24px 80px' }}>
        <div style={{
          maxWidth: 920, margin: '0 auto',
          display: 'flex', flexDirection: 'column', gap: 24,
        }}>
          {ITEMS.map((it, i) => (
            <IndustryCard key={it.id} item={it} index={i} />
          ))}
        </div>
      </section>

      <section style={{
        padding: '64px 24px 80px',
        borderTop: `1px solid ${S.border}`,
        background: S.bgMuted,
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{
            fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 500,
            color: S.fg, letterSpacing: '-0.025em', lineHeight: 1.2,
            margin: 0, marginBottom: 12,
          }}>
            Votre métier n'est pas dans la liste ?
          </h2>
          <p style={{ fontSize: 15, color: S.fgMuted, margin: 0, marginBottom: 24, lineHeight: 1.6 }}>
            Salon DZ est utilisé par toutes sortes de prestataires sur RDV. Tatoueurs, ostéopathes, photographes, coachs… contactez-nous pour qu'on étudie votre cas.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <PrimaryBtn href={COMMERCANT_URL + '/register'}>Essayer gratuitement</PrimaryBtn>
            <SecondaryBtn to="/contact">Parler à un conseiller</SecondaryBtn>
          </div>
        </div>
      </section>
    </>
  );
}

function IndustryCard({ item, index }) {
  const [hover, setHover] = useState(false);
  return (
    <div id={item.id}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        scrollMarginTop: 100,
        background: S.bg,
        borderRadius: S.rXl,
        border: `1px solid ${hover ? S.borderHv : S.border}`,
        overflow: 'hidden',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        boxShadow: hover ? S.shadowMd : S.shadowSm,
      }}>
      <CardImage src={item.img} alt={item.title} fallbackColor={item.accent} />

      <div style={{ padding: 28 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 500,
            padding: '3px 9px', borderRadius: 99,
            background: 'transparent', color: item.accent,
            border: `1px solid ${item.accent}33`,
            letterSpacing: 1, textTransform: 'uppercase',
          }}>
            {String(index + 1).padStart(2, '0') + ' · ' + item.tagline}
          </span>
        </div>
        <h2 style={{
          fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 500,
          color: S.fg, letterSpacing: '-0.025em', lineHeight: 1.2,
          margin: 0, marginBottom: 12,
        }}>
          {item.title}
        </h2>
        <p style={{ fontSize: 15, color: S.fgMuted, lineHeight: 1.65, margin: 0, marginBottom: 22 }}>
          {item.desc}
        </p>

        <div style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          marginBottom: 22,
        }}>
          {item.stats.map(s => (
            <div key={s.l} style={{
              padding: '12px 14px', borderRadius: S.r,
              background: S.bgMuted, border: `1px solid ${S.border}`,
            }}>
              <p style={{
                fontSize: 18, fontWeight: 500, color: S.fg, margin: 0,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                letterSpacing: '-0.01em',
              }}>
                {s.v}
              </p>
              <p style={{ fontSize: 11, color: S.fgSubtle, margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {s.l}
              </p>
            </div>
          ))}
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {item.bullets.map(b => (
            <li key={b} style={{ display: 'flex', gap: 10, fontSize: 14, color: S.fg2, alignItems: 'flex-start', lineHeight: 1.55 }}>
              <span style={{ marginTop: 3 }}><CheckPill /></span>
              {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CardImage({ src, alt, fallbackColor }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div style={{
        width: '100%', aspectRatio: '21 / 9',
        background: S.bgMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: `1px solid ${S.border}`,
      }}>
        <span style={{ width: 56, height: 56, borderRadius: 12, background: fallbackColor + '22', border: `1px solid ${fallbackColor}33` }} />
      </div>
    );
  }
  return (
    <div style={{ width: '100%', aspectRatio: '21 / 9', overflow: 'hidden', borderBottom: `1px solid ${S.border}` }}>
      <img src={src} alt={alt} loading="lazy" onError={() => setErrored(true)}
        style={{
          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
        }} />
    </div>
  );
}
