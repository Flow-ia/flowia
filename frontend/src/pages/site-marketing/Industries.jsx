import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { I } from '../../utils/icons';
import { PageHero, PrimaryBtn, SecondaryBtn } from './components/Shared';

const COMMERCANT_URL = 'https://commercant.flowiapro.com';

// Photos Unsplash (CC0) — illustrent les métiers. Le composant CardImage gère
// le fallback gradient si l'image échoue à charger (cas réseau ou URL morte).
const ITEMS = [
  {
    id: 'coiffeur',
    title: 'Coiffeur',
    tagline: 'Salons de coiffure femme, homme, mixte',
    desc: "Gérez prestations multiples (couleur, mèches, brushing), durées variables, double employé sur un même client. La fidélité fait revenir vos clientes mois après mois.",
    img: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600&q=80&auto=format&fit=crop',
    Ic: I.Scissors, color: '#6366f1',
    stats: [
      { v: '+18 %',  l: 'de rebookings' },
      { v: '70 %',   l: 'de no-shows en moins' },
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
    Ic: I.Scissors, color: '#f59e0b',
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
    Ic: I.Sparkles, color: '#ef4444',
    stats: [
      { v: '90 %',     l: 'des RDV en ligne' },
      { v: 'Acompte',  l: 'optionnel' },
      { v: 'Photos',   l: 'portfolio' },
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
    Ic: I.Heart, color: '#8b5cf6',
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
    Ic: I.Star, color: '#06b6d4',
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
  const { theme: t } = useTheme();
  return (
    <>
      <PageHero
        label="Pour qui"
        title="FlowIA s'adapte à votre métier"
        subtitle="Coiffeurs, barbiers, manucures, esthéticien·ne·s, spas… plus de 500 salons utilisent FlowIA chaque jour."
      />

      <section style={{ padding: '40px 24px 64px' }}>
        <div style={{
          maxWidth: 880, margin: '0 auto',
          display: 'flex', flexDirection: 'column', gap: 24,
        }}>
          {ITEMS.map((it, i) => (
            <IndustryCard key={it.id} t={t} item={it} index={i} />
          ))}
        </div>
      </section>

      <section style={{
        padding: '40px 24px 56px',
        borderTop: `0.5px solid ${t.border}`,
        background: t.cardAlt,
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{
            fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 500,
            color: t.text, letterSpacing: -0.4, lineHeight: 1.2,
            margin: 0, marginBottom: 12,
          }}>
            Votre métier n'est pas dans la liste ?
          </h2>
          <p style={{ fontSize: 15, color: t.textSub, margin: 0, marginBottom: 20, lineHeight: 1.55 }}>
            FlowIA est utilisé par toutes sortes de prestataires sur RDV. Tatoueurs, ostéopathes, photographes, coachs… contactez-nous pour qu'on étudie votre cas.
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

// ────────────────────────────────────────────────────────────────────────────
function IndustryCard({ t, item, index }) {
  const [hover, setHover] = useState(false);
  return (
    <div id={item.id}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        scrollMarginTop: 100,
        background: t.canvas,
        borderRadius: 16,
        border: `0.5px solid ${t.border}`,
        overflow: 'hidden',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        transform: hover ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hover ? t.shadowLg : t.shadowSm,
      }}>
      <CardImage src={item.img} alt={item.title} fallbackColor={item.color} Ic={item.Ic} />

      <div style={{ padding: 28 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 500,
            padding: '4px 10px', borderRadius: 99,
            background: item.color + '15', color: item.color,
            border: `0.5px solid ${item.color}33`,
            letterSpacing: 0.3, textTransform: 'uppercase',
          }}>
            {String(index + 1).padStart(2, '0')} · {item.tagline}
          </span>
        </div>
        <h2 style={{
          fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 500,
          color: t.text, letterSpacing: -0.4, lineHeight: 1.2,
          margin: 0, marginBottom: 12,
        }}>
          {item.title}
        </h2>
        <p style={{ fontSize: 15, color: t.textSub, lineHeight: 1.6, margin: 0, marginBottom: 18 }}>
          {item.desc}
        </p>

        <div style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          marginBottom: 20,
        }}>
          {item.stats.map(s => (
            <div key={s.l} style={{
              padding: '10px 14px', borderRadius: 10,
              background: t.cardAlt, border: `0.5px solid ${t.border}`,
            }}>
              <p style={{ fontSize: 18, fontWeight: 500, color: item.color, margin: 0, fontFamily: 'monospace' }}>
                {s.v}
              </p>
              <p style={{ fontSize: 11, color: t.muted, margin: 0, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {s.l}
              </p>
            </div>
          ))}
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {item.bullets.map(b => (
            <li key={b} style={{ display: 'flex', gap: 8, fontSize: 14, color: t.textSub }}>
              <I.Check style={{ width: 14, height: 14, color: '#10b981', flexShrink: 0, marginTop: 3 }} />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Image avec fallback gradient si chargement échoue.
function CardImage({ src, alt, fallbackColor, Ic }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div style={{
        width: '100%', aspectRatio: '21 / 9',
        background: `linear-gradient(135deg, ${fallbackColor}22, ${fallbackColor}55)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Ic style={{ width: 64, height: 64, color: fallbackColor, opacity: 0.6 }} />
      </div>
    );
  }
  return (
    <div style={{ width: '100%', aspectRatio: '21 / 9', overflow: 'hidden' }}>
      <img src={src} alt={alt} loading="lazy" onError={() => setErrored(true)}
        style={{
          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
        }} />
    </div>
  );
}
