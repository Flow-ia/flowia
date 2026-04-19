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
            padding:'14px 20px', background:'none', border:'none', cursor:'pointer',
            textAlign:'left' }}>
          <span style={{ fontSize:13, fontWeight:700, color:th.text, textTransform:'uppercase',
            letterSpacing:'0.05em' }}>{label}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ width:16, height:16, color:th.muted,
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition:'transform .2s' }}>
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
                  padding:'16px 20px', background:'none', border:'none', cursor:'pointer',
                  borderTop: (i > 0 || label) ? `1px solid ${th.border}` : 'none',
                  textAlign:'left', transition:'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = th.cardAlt}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>

                {/* Image service si disponible */}
                <ServiceThumb serviceId={s.id} color={s.color} th={th} hasImage={s.has_image !== false} version={s.image_version} />

                {/* Infos */}
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:600, color:th.text, margin:'0 0 3px',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {s.name}
                  </p>
                  <p style={{ fontSize:12, color:th.muted, margin:0 }}>
                    {durLabel}
                    {s.price != null && !s.is_free_price ? ` · ${Number(s.price).toFixed(2)} €` : ''}
                  </p>
                  {s.description && (
                    <p style={{ fontSize:11, color:th.dim, margin:'3px 0 0',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {s.description}
                    </p>
                  )}
                </div>

                {/* Chevron */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{width:16,height:16,color:th.dim,flexShrink:0}}>
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
  const accent = color || '#6366f1';
  const showImg = hasImage !== false;
  return (
    <div style={{ width:48, height:48, borderRadius:10, flexShrink:0, overflow:'hidden',
      background: ok ? 'transparent' : `${accent}15`,
      display:'flex', alignItems:'center', justifyContent:'center' }}>
      {!ok && (
        <svg viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20,opacity:0.5}}>
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
  const accentColor = s.color || catColor || '#7c6af7';
  const dMin = s.duration_minutes;
  const durLabel = dMin >= 60
    ? `${Math.floor(dMin/60)}h${dMin%60 > 0 ? String(dMin%60).padStart(2,'0') : ''}`
    : `${dMin} min`;
  const svcImgUrl = serviceImgUrl(s.id, s.image_version);
  const [hasImg, setHasImg] = useState(s.has_image !== false);

  return (
    <button onClick={onClick}
      style={{ width:'100%', borderRadius:18, padding:0, textAlign:'left',
        background:th.card, border:`1px solid ${th.border}`,
        cursor:'pointer', overflow:'hidden',
        boxShadow: th.mode==='light' ? '0 2px 10px rgba(0,0,0,0.06)' : 'none',
        transition:'transform .1s,box-shadow .1s' }}
      onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow=th.mode==='light'?'0 4px 18px rgba(0,0,0,0.1)':'0 0 0 1px rgba(124,106,247,0.3)'; }}
      onMouseLeave={e=>{ e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=th.mode==='light'?'0 2px 10px rgba(0,0,0,0.06)':'none'; }}>
      {/* Image du service si disponible */}
      {hasImg && (
        <div style={{ width:'100%', height:110, overflow:'hidden', background:`${accentColor}18` }}>
          <img src={svcImgUrl} alt={s.name}
            style={{ width:'100%', height:'100%', objectFit:'cover' }}
            onError={() => setHasImg(false)}/>
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px' }}>
        {/* Pastille couleur */}
        {!hasImg && (
          <div style={{ width:36, height:36, borderRadius:11, flexShrink:0,
            background:`${accentColor}18`, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
              <path d="M6 3h12M6 8h12M6 13l3.5 5L12 13l2.5 5L18 13"/>
            </svg>
          </div>
        )}
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, fontSize:14, color:th.text, margin:'0 0 2px',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</p>
          <p style={{ fontSize:12, color:th.muted, margin:0 }}>
            ⏱ {durLabel}{s.price != null ? ` · ${Number(s.price).toFixed(2)} €` : ''}
          </p>
          {s.description && <p style={{ fontSize:11, color:th.dim, margin:'3px 0 0',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.description}</p>}
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{width:16,height:16,flexShrink:0,color:th.dim}}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
      {/* Barre accent bas */}
      <div style={{ height:3, background:`linear-gradient(90deg,${accentColor},${accentColor}44)` }}/>
    </button>
  );
}
