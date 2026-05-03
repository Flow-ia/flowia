// src/pages/booking/SideCard.jsx
// Carte latérale sticky (logo + statut + horaires + adresse + contact) +
// MobileHoursBlock (version mobile compacte du même bloc horaires).
import { useState } from 'react';
import { mediaUrl } from './shared';

export function MobileHoursBlock({ th, hours }) {
  const parseHM = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  const now = new Date();
  const curDow = now.getDay();
  const curHM  = now.getHours() * 60 + now.getMinutes();
  const DAY_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const today = hours[curDow];
  const openM  = today && today.is_open ? parseHM(today.open_time)  : null;
  const closeM = today && today.is_open ? parseHM(today.close_time) : null;
  let status;
  if (today?.is_open && openM != null && closeM != null && curHM >= openM && curHM < closeM) {
    status = { label:'Ouvert', detail:`Ferme à ${today.close_time}`, color:'#10b981' };
  } else if (today?.is_open && openM != null && curHM < openM) {
    status = { label:'Fermé', detail:`Ouvre à ${today.open_time}`, color:'#ef4444' };
  } else {
    let next = null;
    for (let i = 1; i <= 7; i++) {
      const dow = (curDow + i) % 7;
      const h = hours[dow];
      if (h?.is_open && h.open_time) { next = { dow, time:h.open_time, inDays:i }; break; }
    }
    status = next
      ? { label:'Fermé', detail:`Ouvre ${next.time} ${next.inDays === 1 ? 'demain' : DAY_SHORT[next.dow]}`, color:'#ef4444' }
      : { label:'Fermé', detail:null, color:'#ef4444' };
  }

  const WEEK_ORDER = [1,2,3,4,5,6,0];
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop:10, border: `0.5px solid ${th.border}`, borderRadius:10,
      background:th.cardAlt, overflow:'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:6,
          padding:'9px 12px', background:'none', border:'none', cursor:'pointer',
          textAlign:'left' }}>
        <span style={{ width:8, height:8, borderRadius:99, background:status.color, flexShrink:0 }} />
        <span style={{ fontSize:12, fontWeight: 500, color:status.color }}>{status.label}</span>
        {status.detail && (
          <span style={{ fontSize:12, color:th.muted }}>· {status.detail}</span>
        )}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ width:13, height:13, color:th.muted, marginLeft:'auto',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition:'transform .2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ borderTop: `0.5px solid ${th.border}`, background:th.card }}>
          {WEEK_ORDER.map((dow) => {
            const h = hours[dow];
            const isToday = dow === curDow;
            return (
              <div key={dow} style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between', padding:'7px 12px' }}>
                <span style={{ fontSize:12, fontWeight: isToday ? 800 : 500,
                  color: isToday ? th.text : th.muted }}>
                  {DAY_SHORT[dow]}
                </span>
                <span style={{ fontSize:12, fontWeight: isToday ? 700 : 400,
                  color: isToday ? th.text : (h?.is_open ? th.text : th.muted),
                  fontVariantNumeric:'tabular-nums' }}>
                  {h?.is_open && h.open_time && h.close_time
                    ? `${h.open_time} – ${h.close_time}`
                    : 'Fermé'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SideCard({ th, slug, business, onReserve }) {
  const [contactOpen, setContactOpen] = useState(false);

  // Statut ouvert/fermé calculé dynamiquement depuis business.hours
  const hours = business?.hours || {};
  const parseHM = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  const now = new Date();
  const curDow = now.getDay();                          // 0=Dim … 6=Sam
  const curHM  = now.getHours() * 60 + now.getMinutes();
  const DAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const today = hours[curDow];
  const openM  = today && today.is_open ? parseHM(today.open_time)  : null;
  const closeM = today && today.is_open ? parseHM(today.close_time) : null;
  let status;
  if (today?.is_open && openM != null && closeM != null && curHM >= openM && curHM < closeM) {
    status = { label: 'Ouvert', detail: `Ferme à ${today.close_time}`, color: '#10b981' };
  } else if (today?.is_open && openM != null && curHM < openM) {
    status = { label: 'Fermé', detail: `Ouvre à ${today.open_time}`, color: '#ef4444' };
  } else {
    let next = null;
    for (let i = 1; i <= 7; i++) {
      const dow = (curDow + i) % 7;
      const h = hours[dow];
      if (h?.is_open && h.open_time) { next = { dow, time: h.open_time, inDays: i }; break; }
    }
    if (next) {
      const whenLbl = next.inDays === 1 ? 'demain' : DAY_SHORT[next.dow];
      status = { label: 'Fermé', detail: `Ouvre ${next.time} ${whenLbl}`, color: '#ef4444' };
    } else {
      status = { label: 'Fermé', detail: null, color: '#ef4444' };
    }
  }

  // 7 jours dans l'ordre Lun → Dim
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const DAY_FULL = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  const addressStr = [business?.address, [business?.postal_code, business?.city].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const mapsUrl = addressStr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressStr)}` : null;

  return (
    <div className="bk-do bk-sb"
      style={{ width:290, flexShrink:0, paddingTop:16,
        position:'sticky', top:80, alignSelf:'flex-start' }}>
      <div style={{ background:th.sidebarBg, border: `0.5px solid ${th.border}`,
        borderRadius:16, overflow:'hidden' }}>

        {/* Logo + nom + lien avis Google */}
        <div style={{ padding:'24px 20px 18px', textAlign:'center',
          borderBottom: `0.5px solid ${th.border}` }}>
          <div className="bk-side-logo" style={{ width:80, height:80, borderRadius:99, margin:'0 auto 12px',
            overflow:'hidden', background:th.cardAlt,
            display:'flex', alignItems:'center', justifyContent:'center',
            border: `0.5px solid ${th.border}` }}>
            {business?.profile_url ? (
              <img src={mediaUrl(business.profile_url)} alt={business.business_name}
                style={{ width:'100%', height:'100%', objectFit:'cover' }}
                onError={e=>{ e.target.style.display='none'; }}/>
            ) : null}
            <span style={{ fontSize:28, fontWeight: 500, color:'#374151',
              display: business?.profile_url ? 'none' : 'block' }}>
              {(business?.business_name||'B').charAt(0).toUpperCase()}
            </span>
          </div>
          <h2 style={{ fontSize:18, fontWeight: 500, color:th.text,
            margin:'0 0 6px', letterSpacing:'-0.02em' }}>
            {business?.business_name}
          </h2>
          {business?.google_business_url && (
            <a href={business.google_business_url} target="_blank" rel="noopener noreferrer"
              style={{ display:'inline-flex', alignItems:'center', gap:6,
                fontSize:12, fontWeight: 500, color:'#2563eb',
                textDecoration:'none' }}>
              <svg viewBox="0 0 24 24" width="13" height="13" style={{flexShrink:0}}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Voir les avis
            </a>
          )}
        </div>

        {/* Bouton Réserver */}
        <div style={{ padding:'16px 20px', borderBottom: `0.5px solid ${th.border}` }}>
          <button onClick={onReserve}
            style={{ width:'100%', padding:'13px', borderRadius:99,
              background:th.accent, border:'none', fontWeight: 500, fontSize:15,
              color:th.accentText, cursor:'pointer',
              boxShadow: 'none' }}>
            Réserver
          </button>
        </div>

        {/* Statut ouvert/fermé + Tableau horaires */}
        {Object.keys(hours).length > 0 && (
          <div style={{ borderBottom: `0.5px solid ${th.border}` }}>
            <div style={{ padding:'12px 18px', display:'flex', alignItems:'center', gap:6,
              background:th.cardAlt, borderBottom: `0.5px solid ${th.border}` }}>
              <span style={{ width:8, height:8, borderRadius:99, background:status.color, flexShrink:0 }} />
              <span style={{ fontSize:13, fontWeight: 500, color:status.color }}>{status.label}</span>
              {status.detail && (
                <span style={{ fontSize:12, color:th.muted }}>· {status.detail}</span>
              )}
            </div>
            <div>
              {WEEK_ORDER.map((dow) => {
                const h = hours[dow];
                const isToday = dow === curDow;
                return (
                  <div key={dow} className="bk-hours-row" style={{ display:'flex', alignItems:'center',
                    justifyContent:'space-between', padding:'8px 18px' }}>
                    <span style={{ fontSize:13, fontWeight: isToday ? 800 : 500,
                      color: isToday ? th.text : th.muted }}>
                      {DAY_FULL[dow]}
                    </span>
                    <span style={{ fontSize:13, fontWeight: isToday ? 700 : 400,
                      color: isToday ? th.text : (h?.is_open ? th.text : th.muted),
                      fontVariantNumeric:'tabular-nums' }}>
                      {h?.is_open && h.open_time && h.close_time
                        ? `${h.open_time} – ${h.close_time}`
                        : 'Fermé'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Adresse + lien Maps */}
        {(business?.address || business?.city || business?.postal_code) && (
          <div style={{ padding:'14px 18px', borderBottom: `0.5px solid ${th.border}` }}>
            {business?.address && (
              <p style={{ fontSize:13, color:th.text, margin:'0 0 2px', lineHeight:1.5 }}>
                {business.address}
              </p>
            )}
            {(business?.postal_code || business?.city) && (
              <p style={{ fontSize:13, color:th.muted, margin:'0 0 10px', lineHeight:1.5 }}>
                {[business.postal_code, business.city].filter(Boolean).join(' ')}
              </p>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                style={{ display:'inline-flex', alignItems:'center', gap:6,
                  fontSize:13, fontWeight: 500, color:'#2563eb', textDecoration:'none' }}>
                Ouvrir dans Maps
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{width:13,height:13}}>
                  <path d="M7 17L17 7M17 7H8M17 7V16"/>
                </svg>
              </a>
            )}
          </div>
        )}

        {/* Accordéon "Nous contacter" — tél + email */}
        {(business?.phone || business?.email) && (
          <div>
            <button onClick={() => setContactOpen(o => !o)}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'12px 18px', background:'none', border:'none', cursor:'pointer',
                fontSize:13, fontWeight: 500, color:th.text, textAlign:'left' }}>
              Nous contacter
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ width:14, height:14, color:th.muted,
                  transform: contactOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition:'transform .2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {contactOpen && (
              <div style={{ borderTop: `0.5px solid ${th.border}` }}>
                {business?.phone && (
                  <a href={`tel:${business.phone}`}
                    style={{ display:'flex', alignItems:'center', gap:10,
                      padding:'10px 18px', textDecoration:'none',
                      borderBottom: business?.email ? `1px solid ${th.border}` : 'none' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{width:15,height:15,color:th.muted,flexShrink:0}}>
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    <span style={{ fontSize:13, color:th.text }}>{business.phone}</span>
                  </a>
                )}
                {business?.email && (
                  <a href={`mailto:${business.email}`}
                    style={{ display:'flex', alignItems:'center', gap:10,
                      padding:'10px 18px', textDecoration:'none' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{width:15,height:15,color:th.muted,flexShrink:0}}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    <span style={{ fontSize:13, color:th.text, overflow:'hidden',
                      textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{business.email}</span>
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
