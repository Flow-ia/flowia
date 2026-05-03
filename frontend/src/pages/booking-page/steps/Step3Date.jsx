// src/pages/booking-page/steps/Step3Date.jsx
// Étape 3 : calendrier — choix de la date parmi un mois navigable.

import { MONTHS_FR, DAYS_MINI } from '../../booking/shared';

export function Step3Date({
  th, selEmp, selDate, calMonth, setCalMonth, setSelDate,
  today, maxDate, calDays, monthStatus, closedDays, goToStep,
}) {
  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight: 500, color:th.text,
        margin:'0 0 6px', letterSpacing:'-0.025em', lineHeight:1.2 }}>Choisir une date</h2>
      <p style={{ fontSize:13, color:th.muted, margin:'0 0 24px' }}>
        avec <strong style={{color:th.text, fontWeight:500}}>
          {selEmp?._anyEmployee ? 'Premier disponible' : selEmp?.name}
        </strong>
      </p>
      <div style={{ background:th.card, border: `1px solid ${th.border}`,
        borderRadius:14, padding:'24px 18px', boxShadow: th.shadowSm }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <button onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}
            style={{ width:36,height:36,borderRadius:8,border: `1px solid ${th.border}`,
              background:th.bg,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
              fontFamily:'inherit', transition:'background 0.15s ease, border-color 0.15s ease' }}
            onMouseEnter={e=>{ e.currentTarget.style.background = th.bgHover; e.currentTarget.style.borderColor = th.borderHv; }}
            onMouseLeave={e=>{ e.currentTarget.style.background = th.bg; e.currentTarget.style.borderColor = th.border; }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{width:14,height:14,color:th.muted}}><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <p style={{fontSize:15,fontWeight: 500,color:th.text,letterSpacing:'-0.015em',
            textTransform:'capitalize', margin:0}}>
            {MONTHS_FR[calMonth.getMonth()].toLowerCase()} {calMonth.getFullYear()}
          </p>
          <button onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}
            style={{ width:36,height:36,borderRadius:8,border: `1px solid ${th.border}`,
              background:th.cardAlt,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{width:14,height:14,color:th.muted}}><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6,marginBottom:6}}>
          {DAYS_MINI.map((d,i)=>(
            <div key={i} style={{textAlign:'center',fontSize:11,fontWeight: 500,color:th.muted,
              padding:'8px 0', letterSpacing:0.5, textTransform:'uppercase'}}>{d}</div>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6}}>
          {calDays.map((d,i)=>{
            if(!d) return <div key={i}/>;
            const isPast=d<today, isFuture=d>maxDate;
            const dateKey=d.toLocaleDateString('sv-SE');
            const ds=monthStatus[dateKey];
            const isClosed=ds==='closed'||(ds===undefined&&closedDays.includes(d.getDay()));
            const isFull=ds==='full';
            const isSel=selDate&&d.toDateString()===selDate.toDateString();
            const isToday2=d.toDateString()===today.toDateString();
            const disabled=isPast||isFuture||isClosed||isFull;
            return(
              <button key={i} onClick={()=>{if(!disabled){setSelDate(d);goToStep(4,null,null,d);}}} disabled={disabled}
                style={{ height:44, borderRadius:10, fontSize:14,
                  fontWeight: isSel || isToday2 ? 500 : 400,
                  fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                  border:isSel?`1px solid ${th.accent}`:isToday2?`1px solid ${th.borderHv}`:'1px solid transparent',
                  background:isSel?th.accent:'transparent',
                  color:isSel?th.accentText:(isClosed||isFull?th.dim:disabled?th.dim:th.text),
                  boxShadow: isSel ? `0 0 0 3px ${th.accent}1a` : 'none',
                  opacity:disabled&&!isClosed&&!isFull?0.35:1,
                  cursor:disabled?'default':'pointer', position:'relative',
                  transition:'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease' }}
                onMouseEnter={e=>{ if(!disabled && !isSel) e.currentTarget.style.background = th.bgHover; }}
                onMouseLeave={e=>{ if(!disabled && !isSel) e.currentTarget.style.background = 'transparent'; }}>
                {d.getDate()}
                {isClosed&&!isPast&&<span style={{position:'absolute',bottom:5,left:'50%',transform:'translateX(-50%)',width:4,height:4,borderRadius:99,background:th.ax.rose,display:'block'}}/>}
                {isFull&&!isPast&&<span style={{position:'absolute',bottom:5,left:'50%',transform:'translateX(-50%)',width:4,height:4,borderRadius:99,background:th.ax.amber,display:'block'}}/>}
              </button>
            );
          })}
        </div>
        <div style={{display:'flex',gap:18,marginTop:18,paddingTop:14,
          borderTop:`1px solid ${th.border}`,justifyContent:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:th.muted}}>
            <div style={{width:6,height:6,borderRadius:99,background:th.ax.rose}}/>Fermé
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:th.muted}}>
            <div style={{width:6,height:6,borderRadius:99,background:th.ax.amber}}/>Complet
          </div>
        </div>
      </div>
    </div>
  );
}
