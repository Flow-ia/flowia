// src/pages/employee-agenda/components/MonthView.jsx — Vue mois style Google Calendar
import { DAYS_FR } from '../constants';
import { fmtTime, svLocal } from '../helpers';

export default function MonthView({
  monthDate, apptsByDay, employees, isDark, t, onSelectDay, onOpenAppt,
}) {
  const today = new Date();
  const year  = monthDate.getFullYear();
  const month = monthDate.getMonth();

  // Premier jour du mois, et début de la grille (lundi précédent)
  const first = new Date(year, month, 1);
  // getDay(): 0=Dim, 1=Lun... on veut que Lun=0
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - offset);

  // 6 semaines = 42 cellules
  const cells = Array.from({length:42}, (_,i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  // Header jours (Lun → Dim)
  const hdrDays = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      {/* Header jours semaine */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}`, flexShrink:0 }}>
        {hdrDays.map(h => (
          <div key={h} style={{ padding:'8px 0', textAlign:'center', fontSize:10, fontWeight:800, letterSpacing:'.5px', color:isDark?'#768390':'#6b7280' }}>
            {h.toUpperCase()}
          </div>
        ))}
      </div>

      {/* Grille 6x7 */}
      <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gridTemplateRows:'repeat(6, 1fr)', minHeight:0 }}>
        {cells.map((d, i) => {
          const key = svLocal(d);
          const dayAppts = apptsByDay[key] || [];
          const isCurrent = d.getMonth() === month;
          const isTod = d.toDateString() === today.toDateString();
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;

          const MAX_VISIBLE = 3;
          const visible = dayAppts.slice(0, MAX_VISIBLE);
          const extra   = dayAppts.length - MAX_VISIBLE;

          return (
            <button key={i} onClick={()=>onSelectDay(d)} style={{
              border:'none', borderRight:`1px solid ${isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'}`, borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'}`,
              background: isCurrent
                ? (isWeekend ? (isDark?'rgba(255,255,255,0.015)':'rgba(0,0,0,0.015)') : 'transparent')
                : (isDark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.02)'),
              padding:'4px 5px', display:'flex', flexDirection:'column', alignItems:'stretch',
              cursor:'pointer', textAlign:'left', overflow:'hidden', minHeight:0,
            }}>
              {/* Numéro jour */}
              <div style={{ display:'flex', justifyContent:'flex-start', marginBottom:2 }}>
                <div style={{
                  minWidth:22, height:22, padding:'0 6px', borderRadius:'50%',
                  display:'inline-flex', alignItems:'center', justifyContent:'center',
                  background: isTod ? '#1a73e8' : 'transparent',
                  color: isTod ? '#fff' : (isCurrent ? (isDark?'#e6edf3':'#111827') : (isDark?'#555':'#cbd5e1')),
                  fontSize:12, fontWeight:isTod?800:600,
                }}>{d.getDate()}</div>
              </div>

              {/* RDV list */}
              <div style={{ display:'flex', flexDirection:'column', gap:2, overflow:'hidden', flex:1, minHeight:0 }}>
                {visible.map(appt => {
                  const emp = employees.find(e => e.id === appt.employee_id);
                  const accent = emp?.avatar_color || '#1a73e8';
                  return (
                    <div
                      key={appt.id}
                      onClick={(e)=>{ e.stopPropagation(); onOpenAppt(appt); }}
                      style={{
                        display:'flex', alignItems:'center', gap:4,
                        padding:'2px 5px', borderRadius:4,
                        background: isDark ? accent+'26' : accent+'15',
                        cursor:'pointer', overflow:'hidden', flexShrink:0,
                      }}
                    >
                      <div style={{ width:4, height:4, borderRadius:'50%', background:accent, flexShrink:0 }} />
                      <span style={{ fontSize:10, fontWeight:700, color:accent, flexShrink:0 }}>{fmtTime(appt.start_time)}</span>
                      <span style={{ fontSize:10, fontWeight:500, color:isDark?'#e6edf3':'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{appt.client_name}</span>
                    </div>
                  );
                })}
                {extra > 0 && (
                  <div style={{ fontSize:10, fontWeight:600, color:isDark?'#768390':'#6b7280', paddingLeft:5 }}>
                    +{extra} autre{extra>1?'s':''}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
