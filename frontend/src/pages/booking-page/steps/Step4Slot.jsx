// src/pages/booking-page/steps/Step4Slot.jsx
// Étape 4 : créneau — grille des horaires disponibles pour la date choisie.

import { Spinner } from '../../booking/shared';

export function Step4Slot({
  th, selSvc, selDate, selSlot, setSelSlot,
  visibleSlots, slotsLoading, goToStep,
}) {
  return (
    <div>
      <h2 style={{fontSize:20,fontWeight:800,color:th.text,margin:'0 0 6px',letterSpacing:'-0.02em'}}>
        Choisir un créneau
      </h2>
      <p style={{fontSize:13,color:th.muted,margin:'0 0 20px'}}>
        {selDate?.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})} · {selSvc?.duration_minutes} min
      </p>
      {slotsLoading ? <div style={{padding:'40px 0',textAlign:'center'}}><Spinner color={th.accent}/></div>
      : visibleSlots.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 20px',border:`1px dashed ${th.border}`,borderRadius:12}}>
          <p style={{fontSize:14,color:th.muted,marginBottom:12}}>Aucun créneau disponible</p>
          <button onClick={()=>goToStep(3)}
            style={{fontSize:13,fontWeight:700,color:'#2563eb',background:'none',border:'none',cursor:'pointer'}}>
            ← Changer de date
          </button>
        </div>
      ) : (
        <div className="bk-slots" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
          {visibleSlots.map(s=>(
            <button key={s} onClick={()=>{setSelSlot(s);goToStep(5,null,null,null,s);}}
              style={{ padding:'18px 8px', borderRadius:16, fontSize:16, fontWeight:800,
                minHeight:48,
                border:selSlot===s?`2px solid ${th.accent}`:`1px solid ${th.border}`,
                background:selSlot===s?th.accent:th.card,
                color:selSlot===s?th.accentText:th.text, cursor:'pointer' }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
