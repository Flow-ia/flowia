// src/pages/booking-page/steps/Step4Slot.jsx
// Étape 4 : créneau — grille des horaires disponibles pour la date choisie.
// Regroupement par période (Matin/Midi/Après-midi/Soir) pour aérer la vue
// quand un salon a beaucoup de créneaux ouverts.

import { Spinner } from '../../booking/shared';

const PERIODS = [
  { id: 'morning',   label: 'Matin',         range: [0, 12] },
  { id: 'midday',    label: 'Midi',          range: [12, 14] },
  { id: 'afternoon', label: 'Après-midi',    range: [14, 18] },
  { id: 'evening',   label: 'Soir',          range: [18, 24] },
];

function bucketSlots(slots) {
  const buckets = { morning: [], midday: [], afternoon: [], evening: [] };
  for (const s of slots) {
    const h = parseInt(String(s).split(':')[0], 10);
    if (h < 12)      buckets.morning.push(s);
    else if (h < 14) buckets.midday.push(s);
    else if (h < 18) buckets.afternoon.push(s);
    else             buckets.evening.push(s);
  }
  return buckets;
}

export function Step4Slot({
  th, selSvc, selDate, selSlot, setSelSlot,
  visibleSlots, slotsLoading, goToStep,
}) {
  const buckets = bucketSlots(visibleSlots);
  const visiblePeriods = PERIODS.filter(p => buckets[p.id].length > 0);

  return (
    <div>
      <h2 style={{fontSize:22,fontWeight:500,color:th.text,margin:'0 0 6px',letterSpacing:'-0.02em'}}>
        Choisir un créneau
      </h2>
      <p style={{fontSize:13,color:th.muted,margin:'0 0 24px'}}>
        {selDate?.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})} · {selSvc?.duration_minutes} min
      </p>

      {slotsLoading ? (
        <div style={{padding:'48px 0',textAlign:'center'}}><Spinner th={th} /></div>
      ) : visibleSlots.length === 0 ? (
        <div style={{
          textAlign:'center', padding:'48px 24px',
          border:`1px dashed ${th.border}`, borderRadius:14,
          background: th.cardAlt,
        }}>
          <div style={{
            width:48, height:48, borderRadius:24, margin:'0 auto 14px',
            background: th.bg, border:`1px solid ${th.border}`,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={th.muted} strokeWidth="2"
              style={{width:22,height:22}}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <p style={{fontSize:14,color:th.text,margin:'0 0 4px',fontWeight:500}}>
            Aucun créneau disponible
          </p>
          <p style={{fontSize:13,color:th.muted,margin:'0 0 16px'}}>
            Choisissez une autre date pour voir les disponibilités.
          </p>
          <button onClick={()=>goToStep(3)}
            style={{
              display:'inline-flex', alignItems:'center', gap:6,
              fontSize:13, fontWeight:500, color:th.text,
              background:th.bg, border:`1px solid ${th.border}`,
              padding:'9px 16px', borderRadius:8, cursor:'pointer',
              fontFamily:'inherit',
              transition:'background 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e)=>{ e.currentTarget.style.background = th.bgHover; e.currentTarget.style.borderColor = th.borderHv; }}
            onMouseLeave={(e)=>{ e.currentTarget.style.background = th.bg; e.currentTarget.style.borderColor = th.border; }}>
            <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
              <path d="M7.5 3L4.5 6L7.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Changer de date
          </button>
        </div>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:24}}>
          {visiblePeriods.map(period => (
            <div key={period.id}>
              <div style={{
                display:'flex', alignItems:'center', gap:8,
                marginBottom:10,
              }}>
                <span style={{
                  fontSize:11, fontWeight:500, color:th.muted,
                  textTransform:'uppercase', letterSpacing:1,
                }}>
                  {period.label}
                </span>
                <span style={{
                  fontSize:11, color:th.muted,
                  padding:'2px 8px', borderRadius:99,
                  background: th.cardAlt, border:`1px solid ${th.border}`,
                  fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}>
                  {buckets[period.id].length}
                </span>
              </div>
              <div className="bk-slots" style={{
                display:'grid',
                gridTemplateColumns:'repeat(4,1fr)',
                gap:8,
              }}>
                {buckets[period.id].map(s => {
                  const sel = selSlot === s;
                  return (
                    <button key={s}
                      onClick={()=>{setSelSlot(s);goToStep(5,null,null,null,s);}}
                      style={{
                        padding:'14px 6px', borderRadius:10,
                        fontSize:15, fontWeight:500,
                        fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                        letterSpacing:'-0.01em',
                        border: sel ? `1px solid ${th.accent}` : `1px solid ${th.border}`,
                        background: sel ? th.accent : th.bg,
                        color:    sel ? th.accentText : th.text,
                        boxShadow: sel ? `0 0 0 3px ${th.accent}1a` : 'none',
                        cursor:'pointer', minHeight:44,
                        transition:'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                      }}
                      onMouseEnter={(e)=>{
                        if (sel) return;
                        e.currentTarget.style.background = th.bgHover;
                        e.currentTarget.style.borderColor = th.borderHv;
                      }}
                      onMouseLeave={(e)=>{
                        if (sel) return;
                        e.currentTarget.style.background = th.bg;
                        e.currentTarget.style.borderColor = th.border;
                      }}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
