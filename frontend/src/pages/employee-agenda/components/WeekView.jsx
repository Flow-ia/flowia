// src/pages/employee-agenda/components/WeekView.jsx — Vue semaine style Google Calendar
import { DAYS_FR, MONTHS_SH, STATUS_GRID } from '../constants';
import { fmtTime, svLocal } from '../helpers';

export default function WeekView({
  weekStart, days, apptsByDay, employees, isDark, t,
  gridStartMin, gridEndMin, HOUR_H, onSelectDay, onOpenAppt,
}) {
  const HOURS = (() => {
    const list = [];
    const start = Math.floor(gridStartMin / 60) * 60;
    const end   = Math.ceil(gridEndMin / 60) * 60;
    for (let m = start; m < end; m += 60) list.push(m);
    return list;
  })();
  const gridOriginMin = HOURS[0] || 0;
  const today = new Date();

  const getApptStyle = appt => {
    const parseT = s => { const p = String(s||'0:0').split(':').map(Number); return p[0]*60+(p[1]||0); };
    let startM = parseT(appt.start_time);
    let endM   = parseT(appt.end_time || appt.start_time);
    if (endM < startM) endM += 24 * 60;
    let relStart = startM - gridOriginMin;
    if (relStart < 0) relStart += 24 * 60;
    const top    = (relStart / 60) * HOUR_H;
    const height = ((endM - startM) / 60) * HOUR_H;
    return { top: Math.max(0, top), height: Math.max(22, height) };
  };

  return (
    <div style={{ display:'flex', minWidth:7*120+52 }}>
      {/* Axe heures */}
      <div style={{ width:52, flexShrink:0, position:'sticky', left:0, zIndex:10, background:isDark?'#0d1117':'#f6f8fa' }}>
        <div style={{ height:56, borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}` }} />
        {HOURS.map((hMin,i) => {
          const hNum = Math.floor(hMin / 60) % 24;
          const label = hNum === 0 ? 'Minuit' : `${hNum}h`;
          return (
            <div key={i} style={{ height:HOUR_H, borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)'}`, display:'flex', alignItems:'flex-start', justifyContent:'flex-end', paddingRight:8 }}>
              <span style={{ fontSize:12, fontWeight:700, color:isDark?'#768390':'#9ca3af', marginTop:-7 }}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* Colonnes jours */}
      {days.map((d, idx) => {
        const key = svLocal(d);
        const dayAppts = apptsByDay[key] || [];
        const isTod = d.toDateString() === today.toDateString();
        return (
          <div key={idx} style={{ flex:1, minWidth:110, borderLeft:`1px solid ${isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'}`, display:'flex', flexDirection:'column' }}>
            {/* Header jour cliquable */}
            <button onClick={()=>onSelectDay(d)} style={{
              height:56, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'4px 6px',
              position:'sticky', top:0, zIndex:9,
              background:isDark?'#0d1117':'#f6f8fa',
              borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}`,
              border:'none', cursor:'pointer', flexShrink:0,
            }}>
              <span style={{ fontSize:10, fontWeight:700, color:isTod?'#1a73e8':(isDark?'#768390':'#9ca3af'), letterSpacing:'.5px' }}>
                {DAYS_FR[d.getDay()].toUpperCase()}
              </span>
              <div style={{
                marginTop:4, width:30, height:30, borderRadius:'50%',
                display:'flex', alignItems:'center', justifyContent:'center',
                background:isTod?'#1a73e8':'transparent',
                color:isTod?'#fff':(isDark?'#e6edf3':'#111827'),
                fontSize:15, fontWeight:700,
              }}>{d.getDate()}</div>
            </button>

            {/* Zone horaires */}
            <div style={{ position:'relative', height:HOURS.length*HOUR_H, flex:1 }}>
              {HOURS.map((_,i)=>(
                <div key={i} style={{ position:'absolute', left:0, right:0, top:i*HOUR_H, height:HOUR_H, borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.03)'}` }} />
              ))}
              {/* Ligne maintenant */}
              {isTod && (() => {
                const n = new Date();
                let nowMin = n.getHours()*60 + n.getMinutes();
                if (nowMin < gridOriginMin) nowMin += 24*60;
                const relMin = nowMin - gridOriginMin;
                if (relMin < 0 || relMin > HOURS.length*60) return null;
                return <div style={{position:'absolute',left:0,right:0,top:(relMin/60)*HOUR_H,height:1.5,background:'rgba(239,68,68,0.7)',zIndex:5}} />;
              })()}

              {dayAppts.map(appt => {
                const {top,height} = getApptStyle(appt);
                const emp = employees.find(e => e.id === appt.employee_id);
                const sc = STATUS_GRID[appt.status] || STATUS_GRID.confirmed;
                const accent = emp?.avatar_color || '#1a73e8';
                return (
                  <button key={appt.id} onClick={()=>onOpenAppt(appt)} style={{
                    position:'absolute', left:2, right:2, top, height:Math.max(height,30), borderRadius:8, overflow:'hidden', textAlign:'left', cursor:'pointer', zIndex:2, border:'none',
                    background: isDark ? accent+'22' : sc.bg,
                    outline: `1.5px solid ${isDark?accent+'50':sc.bd}`,
                    boxShadow: isDark?'none':'0 1px 3px rgba(0,0,0,0.06)',
                  }}>
                    <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background:accent }} />
                    <div style={{ paddingLeft:7, paddingRight:4, paddingTop:3 }}>
                      <p style={{ margin:0, fontSize:11, fontWeight:800, color:isDark?accent:sc.tx, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fmtTime(appt.start_time)}</p>
                      {height>28 && <p style={{ margin:'1px 0 0', fontSize:11, fontWeight:600, color:isDark?'rgba(255,255,255,0.75)':sc.tx, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{appt.client_name}</p>}
                      {height>50 && <p style={{ margin:'1px 0 0', fontSize:10, color:isDark?'rgba(255,255,255,0.5)':sc.tx, opacity:.75, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{appt.service_name||'RDV'}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
