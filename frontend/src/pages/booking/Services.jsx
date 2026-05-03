// src/pages/booking/Services.jsx
// Composants prestations : groupe accordéon, miniature image, carte service.
import { useState } from 'react';
import { serviceImgUrl } from './shared';

// Groupe accordéon style Setmore : titre cliquable + liste de services
export function AccordionGroup({ label, svcs, th, isLast, onSelect }) {
  const [open, setOpen] = useState(false); // fermé par défaut

  return (
    <div style={{ borderBottom: isLast ? 'none' : `1px solid ${th.border}` }}>
      {/* En-tête accordéon */}
      {label && (
        <button onClick={() => setOpen(p => !p)}
          style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'16px 22px', background:'none', border:'none', cursor:'pointer',
            textAlign:'left', fontFamily:'inherit',
            transition:'background 0.15s ease' }}
          onMouseEnter={e=>e.currentTarget.style.background = th.cardAlt}
          onMouseLeave={e=>e.currentTarget.style.background = 'none'}>
          <span style={{ fontSize:14, fontWeight: 500, color:th.text, letterSpacing:'-0.01em' }}>{label}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ width:16, height:16, color:th.muted,
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition:'transform .25s ease' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      )}

      {/* Services */}
      {(open || !label) && (
        <div>
          {svcs.map((s, i) => {
            const dMin = s.duration_minutes;
            const durLabel = dMin >= 60
              ? `${Math.floor(dMin/60)}h${dMin%60>0?String(dMin%60).padStart(2,'0'):''}`
              : `${dMin} min`;
            const isLast2 = i === svcs.length - 1;

            return (
              <button key={s.id} onClick={() => onSelect(s)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:16,
                  padding:'18px 22px', background:'none', border:'none', cursor:'pointer',
                  borderTop: (i > 0 || label) ? `1px solid ${th.border}` : 'none',
                  textAlign:'left', fontFamily:'inherit',
                  transition:'background 0.15s ease' }}
                onMouseEnter={e => e.currentTarget.style.background = th.cardAlt}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>

                {/* Image service si disponible */}
                <ServiceThumb serviceId={s.id} color={s.color} th={th} hasImage={s.has_image !== false} version={s.image_version} />

                {/* Infos */}
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:15, fontWeight: 500, color:th.text, margin:'0 0 4px',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    letterSpacing:'-0.01em' }}>
                    {s.name}
                  </p>
                  <p style={{ fontSize:13, color:th.muted, margin:0,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {durLabel}
                    {s.price != null && !s.is_free_price ? ` · ${Number(s.price).toFixed(2)} €` : ''}
                  </p>
                  {s.description && (
                    <p style={{ fontSize:12, color:th.dim, margin:'4px 0 0',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      lineHeight:1.4 }}>
                      {s.description}
                    </p>
                  )}
                </div>

                {/* Chevron */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                  style={{width:18,height:18,color:th.dim,flexShrink:0}}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Miniature image du service (se charge silencieusement)
export function ServiceThumb({ serviceId, color, th, hasImage = true, version }) {
  const [ok, setOk] = useState(false);
  const accent = color || (th?.ax?.blue || '#6366f1');
  const showImg = hasImage !== false;
  return (
    <div style={{ width:52, height:52, borderRadius:10, flexShrink:0, overflow:'hidden',
      background: ok ? 'transparent' : `${accent}14`,
      border: ok ? `1px solid ${th?.border || '#e4e4e7'}` : `1px solid ${accent}22`,
      display:'flex', alignItems:'center', justifyContent:'center' }}>
      {!ok && (
        <svg viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22,opacity:0.7}}>
          <path d="M6 3h12M6 8h12M6 13l3.5 5L12 13l2.5 5L18 13"/>
        </svg>
      )}
      {showImg && (
        <img
          src={serviceImgUrl(serviceId, version)}
          alt=""
          style={{ width:'100%', height:'100%', objectFit:'cover', display: ok ? 'block' : 'none' }}
          onLoad={() => setOk(true)}
          onError={() => setOk(false)}
        />
      )}
    </div>
  );
}

export function ServiceCard({ s, th, onClick, catColor }) {
  const accentColor = s.color || catColor || (th?.ax?.violet || '#7c6af7');
  const dMin = s.duration_minutes;
  const durLabel = dMin >= 60
    ? `${Math.floor(dMin/60)}h${dMin%60 > 0 ? String(dMin%60).padStart(2,'0') : ''}`
    : `${dMin} min`;
  const svcImgUrl = serviceImgUrl(s.id, s.image_version);
  const [hasImg, setHasImg] = useState(s.has_image !== false);

  return (
    <button onClick={onClick}
      style={{ width:'100%', borderRadius:14, padding:0, textAlign:'left',
        background:th.card, border: `1px solid ${th.border}`,
        cursor:'pointer', overflow:'hidden', fontFamily:'inherit',
        boxShadow: th.shadowSm,
        transition:'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease' }}
      onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow = th.shadowMd; e.currentTarget.style.borderColor = th.borderHv; }}
      onMouseLeave={e=>{ e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow = th.shadowSm; e.currentTarget.style.borderColor = th.border; }}>
      {/* Image du service si disponible */}
      {hasImg && (
        <div style={{ width:'100%', height:120, overflow:'hidden', background:`${accentColor}14` }}>
          <img src={svcImgUrl} alt={s.name}
            style={{ width:'100%', height:'100%', objectFit:'cover' }}
            onError={() => setHasImg(false)}/>
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px' }}>
        {/* Pastille couleur */}
        {!hasImg && (
          <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
            background:`${accentColor}14`, border:`1px solid ${accentColor}22`,
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}>
              <path d="M6 3h12M6 8h12M6 13l3.5 5L12 13l2.5 5L18 13"/>
            </svg>
          </div>
        )}
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight: 500, fontSize:15, color:th.text, margin:'0 0 3px',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            letterSpacing:'-0.01em' }}>{s.name}</p>
          <p style={{ fontSize:13, color:th.muted, margin:0,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {durLabel}{s.price != null ? ` · ${Number(s.price).toFixed(2)} €` : ''}
          </p>
          {s.description && <p style={{ fontSize:12, color:th.dim, margin:'4px 0 0',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            lineHeight:1.4 }}>{s.description}</p>}
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
          style={{width:18,height:18,flexShrink:0,color:th.dim}}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
      {/* Barre accent bas */}
      <div style={{ height:2, background: accentColor, opacity: 0.9 }}/>
    </button>
  );
}
