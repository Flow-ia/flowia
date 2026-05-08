// Card resultat de recherche /marketplace.
// Affiche photo (carousel des covers du commercant), nom, ville/CP, distance
// (si geoloc), 5 badges programmes (Parrainage, Fidelite, Code promo, Paiement
// en ligne, RDV immediat). Click sur la carte → navigation vers
// /marketplace/book/<slug>.
//
// Carousel : si plusieurs covers (m.coverUrls.length > 1), boutons fleche
// gauche/droite apparaissent (visibles au hover sur desktop, toujours sur
// mobile). Indicateurs en dots en bas. Les clics sur les fleches font
// preventDefault pour ne pas declencher la navigation Link.
//
// FDS-2026 : pas d'emoji, fw <= 500, bordures 0.5/1px, pas de gradient.
//
// Note URLs media : on utilise mediaApi.absoluteUrl() qui mappe les paths
// /api/... renvoyes par le backend vers VITE_API_URL.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { S } from './shadcn';
import { mediaApi } from '../../../utils/api';
import { labelFor as bizTypeLabel } from '../../../utils/businessTypes';

// Petit composant badge inline (icone + label). Couleurs depuis S.ax.
function Badge({ icon, label, color, bg }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 9px', borderRadius: 999,
      background: bg, color: color,
      fontSize: 11, fontWeight: 500,
      lineHeight: 1, whiteSpace: 'nowrap',
    }}>
      {icon}
      {label}
    </span>
  );
}

// Icones SVG inline (FDS-2026 : pas d'emoji, pas de lib externe).
const Ic = {
  gift: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12"/>
      <rect x="2" y="7" width="20" height="5"/>
      <line x1="12" y1="22" x2="12" y2="7"/>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </svg>
  ),
  heart: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  tag: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  card: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  bolt: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  pin: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  ),
};

export default function MerchantSearchCard({ merchant }) {
  const m = merchant;
  const profile = mediaApi.absoluteUrl(m.profileUrl);

  // Carousel covers — fallback sur coverUrl unique si coverUrls absent
  // (cas legacy ou nouveau client/ancien backend). Liste resolue en URLs
  // absolues une fois (memo) pour eviter de re-mapper a chaque render.
  const covers = useMemo(() => {
    const urls = Array.isArray(m.coverUrls) && m.coverUrls.length > 0
      ? m.coverUrls
      : (m.coverUrl ? [m.coverUrl] : []);
    return urls.map(u => mediaApi.absoluteUrl(u)).filter(Boolean);
  }, [m.coverUrls, m.coverUrl]);

  const [idx, setIdx] = useState(0);
  const safeIdx = covers.length > 0 ? Math.min(idx, covers.length - 1) : 0;
  const cover   = covers[safeIdx];
  const hasMany = covers.length > 1;

  // Handlers carousel : preventDefault stoppe la navigation Link et
  // stopPropagation empeche le bubbling sur le wrapper.
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  const prev = (e) => { stop(e); setIdx(i => (i - 1 + covers.length) % covers.length); };
  const next = (e) => { stop(e); setIdx(i => (i + 1) % covers.length); };
  const goTo = (i) => (e) => { stop(e); setIdx(i); };

  return (
    <Link to={`/marketplace/book/${m.slug}`} style={{
      display: 'flex', flexDirection: 'column',
      borderRadius: 14, overflow: 'hidden',
      background: S.bg, border: `1px solid ${S.border}`,
      textDecoration: 'none', color: S.fg,
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
      cursor: 'pointer',
    }}
    className="mp-card"
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = S.borderHv;
      e.currentTarget.style.boxShadow = S.shadowMd;
      e.currentTarget.style.transform = 'translateY(-2px)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = S.border;
      e.currentTarget.style.boxShadow = 'none';
      e.currentTarget.style.transform = 'translateY(0)';
    }}>
      {/* Style local : fleches du carousel cachees par defaut, visibles
          au hover sur desktop. Sur mobile (touch), toujours visibles. */}
      <style>{`
        .mp-card .mp-arrow{ opacity: 0; transition: opacity 0.15s ease, background 0.15s ease; }
        .mp-card:hover .mp-arrow{ opacity: 1; }
        @media (hover: none) {
          .mp-card .mp-arrow{ opacity: 1; }
        }
      `}</style>
      {/* Cover (carousel) */}
      <div style={{
        height: 160, position: 'relative',
        background: cover ? `center/cover no-repeat url("${cover}")` : S.bgHover,
        borderBottom: `1px solid ${S.border}`,
        transition: 'background-image 0.2s ease',
      }}>
        {!cover && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: S.fgSubtle, fontSize: 13,
          }}>
            {m.businessName?.[0]?.toUpperCase() || ''}
          </div>
        )}

        {/* Bouton precedent */}
        {hasMany && (
          <button type="button" className="mp-arrow"
                  onClick={prev}
                  aria-label="Photo precedente"
                  style={{
                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                    width: 32, height: 32, borderRadius: 999,
                    border: 'none', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.92)', color: S.fg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.92)'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}

        {/* Bouton suivant */}
        {hasMany && (
          <button type="button" className="mp-arrow"
                  onClick={next}
                  aria-label="Photo suivante"
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    width: 32, height: 32, borderRadius: 999,
                    border: 'none', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.92)', color: S.fg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.92)'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        )}

        {/* Indicateurs (dots) — affiches uniquement si plusieurs photos */}
        {hasMany && (
          <div style={{
            position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 4, padding: '3px 6px', borderRadius: 99,
            background: 'rgba(0,0,0,0.35)',
          }}>
            {covers.map((_, i) => (
              <button key={i} type="button"
                      onClick={goTo(i)}
                      aria-label={`Photo ${i + 1}`}
                      style={{
                        width: i === safeIdx ? 16 : 6, height: 6,
                        borderRadius: 99, border: 'none', cursor: 'pointer',
                        padding: 0,
                        background: i === safeIdx ? '#fff' : 'rgba(255,255,255,0.55)',
                        transition: 'width 0.15s ease, background 0.15s ease',
                      }}/>
            ))}
          </div>
        )}

        {/* Profile pastille */}
        {profile && (
          <div style={{
            position: 'absolute', left: 14, bottom: -22,
            width: 44, height: 44, borderRadius: 22,
            background: `center/cover no-repeat url("${profile}")`,
            border: `2px solid ${S.bg}`, boxShadow: S.shadowSm,
            zIndex: 1,
          }}/>
        )}
        {/* Distance */}
        {m.distanceKm != null && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            padding: '4px 9px', borderRadius: 999,
            background: 'rgba(255,255,255,0.92)', color: S.fg,
            fontSize: 11, fontWeight: 500, lineHeight: 1,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          }}>
            {Ic.pin}
            {m.distanceKm < 1
              ? `${Math.round(m.distanceKm * 1000)} m`
              : `${m.distanceKm.toFixed(1)} km`}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{
        padding: profile ? '30px 16px 16px' : '16px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div>
          <h3 style={{
            margin: 0, fontSize: 16, fontWeight: 500,
            color: S.fg, letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {m.businessName}
          </h3>
          {m.businessType && bizTypeLabel(m.businessType) && (
            <p style={{ margin: '2px 0 0', fontSize: 11, color: S.fgSubtle,
                        textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {bizTypeLabel(m.businessType)}
            </p>
          )}
          <p style={{
            margin: '3px 0 0', fontSize: 12, color: S.fgMuted,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {Ic.pin}
            {[m.city, m.postalCode].filter(Boolean).join(' · ')}
          </p>
        </div>

        {m.businessDescription && (
          <p style={{
            margin: 0, fontSize: 12, color: S.fgSubtle, lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {m.businessDescription}
          </p>
        )}

        {/* Badges */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          marginTop: 4,
        }}>
          {m.badges?.referral && (
            <Badge icon={Ic.gift}  label="Parrainage"      color={S.ax.emerald} bg={S.ax.emeraldBg}/>
          )}
          {m.badges?.loyalty && (
            <Badge icon={Ic.heart} label="Fidelite"        color={S.ax.rose}    bg={S.ax.roseBg}/>
          )}
          {m.badges?.promo && (
            <Badge icon={Ic.tag}   label="Code promo"      color={S.ax.amber}   bg={S.ax.amberBg}/>
          )}
          {m.badges?.onlinePayment && (
            <Badge icon={Ic.card}  label="Paiement en ligne" color={S.ax.blue}  bg={S.ax.blueBg}/>
          )}
          {m.badges?.instantBooking && (
            <Badge icon={Ic.bolt}  label="RDV en ligne"    color={S.ax.violet}  bg={S.ax.violetBg}/>
          )}
        </div>
      </div>
    </Link>
  );
}
