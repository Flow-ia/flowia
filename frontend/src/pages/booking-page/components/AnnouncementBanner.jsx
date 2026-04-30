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
  // Vitesse defilement adaptative : ~60 chars/s. Min 12s pour pas trop vite,
  // max 60s pour pas trop lent.
  const duration = Math.min(60, Math.max(12, announcement.message.length / 6));

  return (
    <div role="status" aria-live="polite" style={{
      width: '100%',
      background: cfg.bg,
      color: cfg.text,
      border: `0.5px solid ${cfg.border}`,
      borderRadius: 12,
      marginBottom: 16,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {isLong ? (
        <>
          <style>{`
            @keyframes ffAnnouncementMarquee {
              0%   { transform: translateX(100%); }
              100% { transform: translateX(-100%); }
            }
          `}</style>
          <div style={{
            whiteSpace: 'nowrap',
            display: 'inline-block',
            paddingLeft: '100%',
            animation: `ffAnnouncementMarquee ${duration}s linear infinite`,
            fontSize: 13, fontWeight: 500,
            padding: '10px 0',
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
