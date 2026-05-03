// src/pages/booking-page/steps/Step3Date.jsx
// Étape 3 : calendrier — choix de la date parmi un mois navigable.
// Design shadcn moderne : cellules aérées, today highlight discret, hover doux.

import { MONTHS_FR, DAYS_MINI } from '../../booking/shared';

export function Step3Date({
  th, selEmp, selDate, calMonth, setCalMonth, setSelDate,
  today, maxDate, calDays, monthStatus, closedDays, goToStep,
}) {
  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:500, color:th.text,
        margin:'0 0 6px', letterSpacing:'-0.02em' }}>Choisir une date</h2>
      <p style={{ fontSize:13, color:th.muted, margin:'0 0 24px' }}>
        avec <strong style={{color:th.text, fontWeight:500}}>
          {selEmp?._anyEmployee ? 'Premier disponible' : selEmp?.name}
        </strong>
      </p>

      <div style={{
        background:th.card, border:`1px solid ${th.border}`,
        borderRadius:14, padding:'20px 16px',
        boxShadow: th.shadowSm,
      }}>
        {/* Header mois — prev / label / next */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          marginBottom:18,
        }}>
          <button onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}
            aria-label="Mois précédent"
            style={{
              width:36, height:36, borderRadius:8,
              border:`1px solid ${th.border}`, background:th.bg,
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
              transition:'background 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e)=>{ e.currentTarget.style.background = th.bgHover; e.currentTarget.style.borderColor = th.borderHv; }}
            onMouseLeave={(e)=>{ e.currentTarget.style.background = th.bg; e.currentTarget.style.borderColor = th.border; }}>
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12,color:th.text}}>
              <polyline points="7.5 3 4.5 6 7.5 9"/>
            </svg>
          </button>
          <p style={{
            fontSize:15, fontWeight:500, color:th.text,
            letterSpacing:'-0.01em', margin:0,
            textTransform:'capitalize',
          }}>
            {MONTHS_FR[calMonth.getMonth()].toLowerCase()} {calMonth.getFullYear()}
          </p>
          <button onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}
            aria-label="Mois suivant"
            style={{
              width:36, height:36, borderRadius:8,
              border:`1px solid ${th.border}`, background:th.bg,
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
              transition:'background 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e)=>{ e.currentTarget.style.background = th.bgHover; e.currentTarget.style.borderColor = th.borderHv; }}
            onMouseLeave={(e)=>{ e.currentTarget.style.background = th.bg; e.currentTarget.style.borderColor = th.border; }}>
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12,color:th.text}}>
              <polyline points="4.5 3 7.5 6 4.5 9"/>
            </svg>
          </button>
        </div>

        {/* Days header (Lun, Mar, ...) */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:6}}>
          {DAYS_MINI.map((d,i)=>(
            <div key={i} style={{
              textAlign:'center', fontSize:11, fontWeight:500, color:th.muted,
              padding:'8px 0', letterSpacing:0.4,
              textTransform:'uppercase',
            }}>{d}</div>
          ))}
        </div>

        {/* Cells */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4}}>
          {calDays.map((d, i) => {
            if (!d) return <div key={i} />;
            const isPast    = d < today;
            const isFuture  = d > maxDate;
            const dateKey   = d.toLocaleDateString('sv-SE');
            const ds        = monthStatus[dateKey];
            const isClosed  = ds === 'closed' || (ds === undefined && closedDays.includes(d.getDay()));
            const isFull    = ds === 'full';
            const isSel     = selDate && d.toDateString() === selDate.toDateString();
            const isToday2  = d.toDateString() === today.toDateString();
            const disabled  = isPast || isFuture || isClosed || isFull;
            return (
              <button key={i}
                onClick={() => { if (!disabled) { setSelDate(d); goToStep(4, null, null, d); } }}
                disabled={disabled}
                style={{
                  height:44, borderRadius:8,
                  fontSize:14, fontWeight: isSel || isToday2 ? 500 : 400,
                  fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                  border: isSel
                    ? `1px solid ${th.accent}`
                    : isToday2
                      ? `1px solid ${th.borderHv}`
                      : '1px solid transparent',
                  background: isSel
                    ? th.accent
                    : 'transparent',
                  color: isSel
                    ? th.accentText
                    : (disabled ? th.dim : th.text),
                  boxShadow: isSel ? `0 0 0 3px ${th.accent}1a` : 'none',
                  opacity: disabled && !isClosed && !isFull ? 0.35 : 1,
                  cursor: disabled ? 'default' : 'pointer',
                  position: 'relative',
                  transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                  fontFamily_: 'inherit',
                }}
                onMouseEnter={(e) => {
                  if (disabled || isSel) return;
                  e.currentTarget.style.background = th.bgHover;
                }}
                onMouseLeave={(e) => {
                  if (disabled || isSel) return;
                  e.currentTarget.style.background = 'transparent';
                }}>
                {d.getDate()}
                {isClosed && !isPast && (
                  <span style={{
                    position:'absolute', bottom:5, left:'50%', transform:'translateX(-50%)',
                    width:4, height:4, borderRadius:99, background:th.ax.rose, display:'block',
                  }}/>
                )}
                {isFull && !isPast && (
                  <span style={{
                    position:'absolute', bottom:5, left:'50%', transform:'translateX(-50%)',
                    width:4, height:4, borderRadius:99, background:th.ax.amber, display:'block',
                  }}/>
                )}
              </button>
            );
          })}
        </div>

        {/* Légende */}
        <div style={{
          display:'flex', gap:18, marginTop:18, paddingTop:14,
          borderTop:`1px solid ${th.border}`, justifyContent:'center',
        }}>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:th.muted}}>
            <div style={{width:6,height:6,borderRadius:99,background:th.ax.rose}}/>Fermé
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:th.muted}}>
            <div style={{width:6,height:6,borderRadius:99,background:th.ax.amber}}/>Complet
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:th.muted}}>
            <div style={{width:8,height:8,borderRadius:4,border:`1px solid ${th.borderHv}`,background:'transparent'}}/>{"Aujourd'hui"}
          </div>
        </div>
      </div>
    </div>
  );
}
