// src/pages/booking-page/steps/Step3Date.jsx
// Étape 3 : calendrier — choix de la date parmi un mois navigable.

import { MONTHS_FR, DAYS_MINI } from '../../booking/shared';

export function Step3Date({
  th, selEmp, selDate, calMonth, setCalMonth, setSelDate,
  today, maxDate, calDays, monthStatus, closedDays, goToStep,
}) {
  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
        margin:'0 0 6px', letterSpacing:'-0.02em' }}>Choisir une date</h2>
      <p style={{ fontSize:13, color:th.muted, margin:'0 0 20px' }}>
        avec <strong style={{color:th.text}}>
          {selEmp?._anyEmployee ? 'Premier disponible' : selEmp?.name}
        </strong>
      </p>
      <div style={{ background:th.card, border:`1px solid ${th.border}`,
        borderRadius:20, padding:'24px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <button onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}
            style={{ width:36,height:36,borderRadius:8,border:`1px solid ${th.border}`,
              background:th.cardAlt,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{width:14,height:14,color:th.muted}}><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <p style={{fontSize:15,fontWeight:700,color:th.text}}>
            {MONTHS_FR[calMonth.getMonth()]} {calMonth.getFullYear()}
          </p>
          <button onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}
            style={{ width:36,height:36,borderRadius:8,border:`1px solid ${th.border}`,
              background:th.cardAlt,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{width:14,height:14,color:th.muted}}><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6,marginBottom:10}}>
          {DAYS_MINI.map((d,i)=>(
            <div key={i} style={{textAlign:'center',fontSize:13,fontWeight:800,color:th.muted,padding:'8px 0'}}>{d}</div>
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
                style={{ height:48, borderRadius:12, fontSize:15, fontWeight:700,
                  border:isSel?`2px solid ${th.accent}`:isToday2?`1px solid ${th.accent}40`:'1px solid transparent',
                  background:isSel?th.accent:'transparent',
                  color:isSel?th.accentText:(isClosed||isFull?th.dim:disabled?th.dim:th.text),
                  opacity:disabled&&!isClosed&&!isFull?0.3:1,
                  cursor:disabled?'default':'pointer', position:'relative' }}>
                {d.getDate()}
                {isClosed&&!isPast&&<span style={{position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',width:3,height:3,borderRadius:99,background:'#ef4444',display:'block'}}/>}
                {isFull&&!isPast&&<span style={{position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',width:3,height:3,borderRadius:99,background:'#f97316',display:'block'}}/>}
              </button>
            );
          })}
        </div>
        <div style={{display:'flex',gap:16,marginTop:12}}>
          <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:th.muted}}>
            <div style={{width:8,height:8,borderRadius:99,background:'#ef4444'}}/>Fermé
          </div>
          <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:th.muted}}>
            <div style={{width:8,height:8,borderRadius:99,background:'#f97316'}}/>Complet
          </div>
        </div>
      </div>
    </div>
  );
}
