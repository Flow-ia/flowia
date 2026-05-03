// src/pages/booking-page/steps/Step4Slot.jsx
// Étape 4 : créneau — grille des horaires disponibles pour la date choisie.

import { Spinner } from '../../booking/shared';

export function Step4Slot({
  th, selSvc, selDate, selSlot, setSelSlot,
  visibleSlots, slotsLoading, goToStep,
}) {
  return (
    <div>
      <h2 style={{fontSize:22,fontWeight: 500,color:th.text,margin:'0 0 6px',
        letterSpacing:'-0.025em', lineHeight:1.2}}>
        Choisir un créneau
      </h2>
      <p style={{fontSize:13,color:th.muted,margin:'0 0 24px'}}>
        {selDate?.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})} · {selSvc?.duration_minutes} min
      </p>
      {slotsLoading ? <div style={{padding:'48px 0',textAlign:'center'}}><Spinner th={th} /></div>
      : visibleSlots.length === 0 ? (
        <div style={{textAlign:'center',padding:'48px 24px',
          border:`1px dashed ${th.border}`,borderRadius:14,
          background: th.cardAlt}}>
          <p style={{fontSize:14,color:th.text,marginBottom:6,fontWeight:500}}>Aucun créneau disponible</p>
          <p style={{fontSize:13,color:th.muted,marginBottom:18}}>Choisissez une autre date.</p>
          <button onClick={()=>goToStep(3)}
            style={{fontSize:13,fontWeight: 500,color:th.text,
              background:th.bg,border:`1px solid ${th.border}`,
              padding:'9px 16px',borderRadius:8,cursor:'pointer',
              fontFamily:'inherit',
              transition:'background 0.15s ease, border-color 0.15s ease'}}
            onMouseEnter={e=>{ e.currentTarget.style.background = th.bgHover; e.currentTarget.style.borderColor = th.borderHv; }}
            onMouseLeave={e=>{ e.currentTarget.style.background = th.bg; e.currentTarget.style.borderColor = th.border; }}>
            ← Changer de date
          </button>
        </div>
      ) : (
        <div className="bk-slots" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
          {visibleSlots.map(s => {
            const sel = selSlot === s;
            return (
              <button key={s} onClick={()=>{setSelSlot(s);goToStep(5,null,null,null,s);}}
                style={{ padding:'16px 8px', borderRadius:12, fontSize:15, fontWeight: 500,
                  fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                  letterSpacing:'-0.01em',
                  minHeight:48,
                  border: sel ? `1px solid ${th.accent}` : `1px solid ${th.border}`,
                  background: sel ? th.accent : th.card,
                  color: sel ? th.accentText : th.text,
                  boxShadow: sel ? `0 0 0 3px ${th.accent}1a` : th.shadowSm,
                  cursor:'pointer',
                  transition:'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease' }}
                onMouseEnter={e=>{ if(!sel){ e.currentTarget.style.background = th.bgHover; e.currentTarget.style.borderColor = th.borderHv; } }}
                onMouseLeave={e=>{ if(!sel){ e.currentTarget.style.background = th.card; e.currentTarget.style.borderColor = th.border; } }}>
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
