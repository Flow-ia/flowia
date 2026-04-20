import { useMemo } from 'react';
import { STATUS_GRID } from '../constants';
import { toMin, fmtTime } from '../helpers';

export default function GridView({ appts, employees, dateStr, displayCfg, onApptClick, theme: t }) {
  const isDark  = t.mode === 'dark';
  const { hourH } = displayCfg;

  /* Calculer la plage d'heures à afficher — gère minuit */
  const hours = useMemo(() => {
    const startM = toMin(displayCfg.startHour||'08:00');
    const rawEnd = toMin(displayCfg.endHour||'20:00');
    // Si endHour < startHour → passage minuit
    const endM   = rawEnd <= startM ? rawEnd + 24*60 : rawEnd;
    const list = [];
    for (let m = startM; m < endM; m += 60) {
      list.push(m % (24*60));
    }
    return list;
  }, [displayCfg.startHour, displayCfg.endHour]);

  const totalH = hours.length * hourH;

  const startMinDisplay = toMin(displayCfg.startHour||'08:00');
  const rawEndM = toMin(displayCfg.endHour||'20:00');
  const endMinDisplay = rawEndM <= startMinDisplay ? rawEndM + 24*60 : rawEndM;
  const rangeM = endMinDisplay - startMinDisplay;

  const getApptStyle = (appt) => {
    let startM = toMin(appt.start_time);
    let endM   = toMin(appt.end_time||appt.start_time);
    // Gérer le cas où l'heure de fin est après minuit (affichage nocturne)
    if (endM < startM) endM += 24*60;

    let relStart = startM - startMinDisplay;
    // Si passage minuit, corriger pour les heures < startMinDisplay
    if (relStart < 0) relStart += 24*60;

    const top    = (relStart / rangeM) * totalH;
    const height = Math.max(((endM - startM) / rangeM) * totalH, 18);
    return { top: Math.max(0,top), height };
  };

  const activeEmps = employees.filter(e=>e.is_active!==false && e.show_in_caisse!==false);

  return (
    <div className="flex overflow-auto flex-1" style={{ minHeight:0 }}>
      <div className="flex" style={{ minWidth: activeEmps.length>0 ? activeEmps.length*110+44 : 'auto' }}>

        {/* Axe heures */}
        <div className="flex-shrink-0 sticky left-0 z-10" style={{ width:44, background:isDark?'#111318':'#f5f5f7' }}>
          <div style={{ height:36, borderBottom:`1px solid ${isDark?'rgba(205,217,229,0.08)':'rgba(0,0,0,0.06)'}` }} />
          {hours.map((hm,i)=>(
            <div key={i} className="flex items-start justify-end pr-2"
              style={{ height:hourH, borderBottom:`1px solid ${isDark?'rgba(205,217,229,0.05)':'rgba(0,0,0,0.05)'}` }}>
              <span className="text-[10px] font-medium -mt-2" style={{ color:isDark?'#545d68':'#bbb' }}>
                {String(Math.floor(hm/60)).padStart(2,'0')}h
              </span>
            </div>
          ))}
        </div>

        {/* Colonnes employés */}
        {activeEmps.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <p className="text-sm" style={{ color:t.muted }}>Aucun employé actif</p>
          </div>
        ) : activeEmps.map(emp => {
          const empAppts = appts.filter(a => a.employee_id === emp.id);
          return (
            <div key={emp.id} className="flex-1 flex flex-col"
              style={{ minWidth:90, borderLeft:`1px solid ${isDark?'rgba(205,217,229,0.07)':'rgba(0,0,0,0.06)'}` }}>

              {/* Header employé */}
              <div className="flex flex-col items-center justify-center py-1.5 sticky top-0 z-10"
                style={{ height:36, background:isDark?'#111318':'#f5f5f7', borderBottom:`1px solid ${isDark?'rgba(205,217,229,0.08)':'rgba(0,0,0,0.06)'}` }}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-[9px]"
                  style={{ background:emp.avatar_color||'#111827' }}>{emp.name.charAt(0)}</div>
                <span className="text-[9px] font-medium mt-0.5 truncate px-1 w-full text-center" style={{ color:isDark?'#adbac7':'#6B7280' }}>
                  {emp.name.split(' ')[0]}
                </span>
              </div>

              {/* Zone temps */}
              <div className="relative flex-1" style={{ height:totalH }}>
                {hours.map((_,i)=>(
                  <div key={i} style={{ position:'absolute', left:0, right:0, top:i*hourH, height:hourH, borderBottom:`1px solid ${isDark?'rgba(205,217,229,0.04)':'rgba(0,0,0,0.04)'}` }} />
                ))}
                {empAppts.map(appt=>{
                  const {top,height} = getApptStyle(appt);
                  const sc = STATUS_GRID[appt.status]||STATUS_GRID.confirmed;
                  return (
                    <button key={appt.id} onClick={()=>onApptClick(appt)}
                      className="absolute left-0.5 right-0.5 rounded-lg overflow-hidden text-left"
                      style={{ top, height:Math.max(height,18), background:isDark?(emp.avatar_color+'22'):sc.bg, border:`1px solid ${isDark?(emp.avatar_color+'55'):sc.bd}`, cursor:'pointer', zIndex:2 }}>
                      <div className="px-1 py-0.5">
                        <p className="text-[9px] font-bold leading-tight truncate" style={{ color:isDark?(emp.avatar_color||'#111827'):sc.tx }}>
                          {appt.client_name}
                        </p>
                        {height>28&&(
                          <p className="text-[8px] leading-tight truncate" style={{ color:isDark?'rgba(255,255,255,0.5)':sc.tx, opacity:0.7 }}>
                            {fmtTime(appt.start_time)} · {appt.service_name||'RDV'}
                          </p>
                        )}
                        {height>46&&appt.paid&&(
                          <div className="w-2 h-2 rounded-full mt-0.5" style={{ background:'#22c55e' }} />
                        )}
                      </div>
                      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background:emp.avatar_color||'#111827' }} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
