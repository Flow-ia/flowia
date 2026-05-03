// src/pages/booking-page/components/AnnouncementBanner.jsx
// Bandeau d'annonce affiche en haut de la page de reservation publique,
// entre les infos commercant et la section "Nos prestations". Fetch
// /api/pub/:slug/announcement au mount, ne s'affiche que si actif maintenant.
//
// Texte court : statique (centre). Texte long : marquee CSS qui defile
// horizontalement de droite a gauche pour rester lisible sur mobile.
import { useEffect, useState } from 'react';
import { pubApi } from '../../../utils/api';

const COLOR_MAP = {
  green:  { bg: '#f0fdf4', text: '#065f46', border: '#bbf7d0' },
  orange: { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' },
  yellow: { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
  red:    { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' },
  blue:   { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
  purple: { bg: '#faf5ff', text: '#6b21a8', border: '#e9d5ff' },
  gray:   { bg: '#f9fafb', text: '#374151', border: '#e5e7eb' },
};

// Au-dela de ce nombre de caracteres, on passe en marquee defilante pour
// que tout le message reste accessible meme sur petit ecran.
const MARQUEE_THRESHOLD = 80;

// Vitesse de defilement (px/seconde). Le client voit ~60-80 caracteres
// passer par seconde, vitesse confortable pour lire en diagonale sans
// trop attendre. Calcule duration = (container_width + message_width) / speed.
const MARQUEE_SPEED_PX_PER_SEC = 80;

export default function AnnouncementBanner({ slug }) {
  const [announcement, setAnnouncement] = useState(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    pubApi.getAnnouncement(slug)
      .then(r => { if (!cancelled) setAnnouncement(r || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug]);

  if (!announcement?.message) return null;
  const cfg = COLOR_MAP[announcement.color] || COLOR_MAP.orange;
  const isLong = announcement.message.length > MARQUEE_THRESHOLD;
  // Approximation : ~7 px par caractere a fontSize 13. Total a defiler =
  // largeur container (~360 mobile) + largeur du texte. Min 8s pour pas
  // trop vite, max 45s pour ne pas figer un long message.
  const approxTextWidth = announcement.message.length * 7;
  const approxTotalDistance = 360 + approxTextWidth;
  const duration = Math.min(45, Math.max(8, approxTotalDistance / MARQUEE_SPEED_PX_PER_SEC));

  return (
    <div role="status" aria-live="polite" style={{
      width: '100%',
      background: cfg.bg,
      color: cfg.text,
      border: `1px solid ${cfg.border}`,
      borderRadius: 12,
      marginBottom: 16,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {isLong ? (
        <>
          <style>{`
            /* Le texte demarre cale a droite du container (translateX(0) +
               paddingLeft 100% du container) et sort par la gauche
               (translateX(-100%) = largeur de l'element). Avant : on partait
               de translateX(100%) ce qui ajoutait un retard de ~20% de la
               duree avant que le premier caractere devienne visible -> le
               client voyait un bandeau vide pendant plusieurs secondes. */
            @keyframes ffAnnouncementMarquee {
              0%   { transform: translateX(0); }
              100% { transform: translateX(-100%); }
            }
          `}</style>
          <div style={{
            whiteSpace: 'nowrap',
            display: 'inline-block',
            // IMPORTANT : utiliser paddingLeft + paddingTop/Bottom individuels,
            // PAS la shorthand `padding` qui ecraserait paddingLeft (bug
            // precedent : `padding: '10px 0'` annulait le `paddingLeft: '100%'`
            // place au-dessus -> le texte demarrait a la position 0 au lieu
            // du bord droit du container).
            paddingLeft: '100%',
            paddingTop: 10, paddingBottom: 10, paddingRight: 0,
            animation: `ffAnnouncementMarquee ${duration}s linear infinite`,
            fontSize: 13, fontWeight: 500,
          }}>
            {announcement.message}
          </div>
        </>
      ) : (
        <div style={{
          padding: '10px 14px',
          fontSize: 13, fontWeight: 500,
          textAlign: 'center', lineHeight: 1.4,
        }}>
          {announcement.message}
        </div>
      )}
    </div>
  );
}
