import { useMemo } from 'react';
import { STATUS_GRID } from '../constants';
import { toMin, fmtTime } from '../helpers';

export default function GridView({ appts, employees, dateStr, displayCfg, onApptClick, theme: t }) {
  const isDark  = t.mode === 'dark';
  const { hourH } = displayCfg;

  /* Plage d'heures a afficher — gere le passage de minuit */
  const hours = useMemo(() => {
    const startM = toMin(displayCfg.startHour||'08:00');
    const rawEnd = toMin(displayCfg.endHour||'20:00');
    const endM   = rawEnd <= startM ? rawEnd + 24*60 : rawEnd;
    const list = [];
    for (let m = startM; m < endM; m += 60) list.push(m % (24*60));
    return list;
  }, [displayCfg.startHour, displayCfg.endHour]);

  const totalH = hours.length * hourH;

  const startMinDisplay = toMin(displayCfg.startHour||'08:00');
  const rawEndM         = toMin(displayCfg.endHour||'20:00');
  const endMinDisplay   = rawEndM <= startMinDisplay ? rawEndM + 24*60 : rawEndM;
  const rangeM          = endMinDisplay - startMinDisplay;

  const getApptStyle = (appt) => {
    let startM = toMin(appt.start_time);
    let endM   = toMin(appt.end_time||appt.start_time);
    if (endM < startM) endM += 24*60;
    let relStart = startM - startMinDisplay;
    if (relStart < 0) relStart += 24*60;
    const top    = (relStart / rangeM) * totalH;
    const height = Math.max(((endM - startM) / rangeM) * totalH, 18);
    return { top: Math.max(0,top), height };
  };

  const activeEmps = employees.filter(e=>e.is_active!==false && e.show_in_caisse!==false);

  const headerBg   = t.cardAlt;
  const headerBd   = t.border;
  const gridLineBd = t.separator;

  return (
    <div style={{ display:'flex', overflow:'auto', flex:1, minHeight:0 }}>
      <div style={{ display:'flex', minWidth: activeEmps.length>0 ? activeEmps.length*110+44 : 'auto' }}>

        {/* Axe heures */}
        <div style={{
          flexShrink: 0,
          position: 'sticky',
          left: 0,
          zIndex: 10,
          width: 44,
          background: headerBg,
        }}>
          <div style={{ height:36, borderBottom:`0.5px solid ${headerBd}` }} />
          {hours.map((hm,i)=>(
            <div key={i} style={{
              display:'flex',
              alignItems:'flex-start',
              justifyContent:'flex-end',
              paddingRight:8,
              height:hourH,
              borderBottom:`0.5px solid ${gridLineBd}`,
            }}>
              <span style={{ fontSize:10, fontWeight:500, marginTop:-8, color:t.dim }}>
                {String(Math.floor(hm/60)).padStart(2,'0')}h
              </span>
            </div>
          ))}
        </div>

        {/* Colonnes employes */}
        {activeEmps.length === 0 ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'80px 0' }}>
            <p style={{ fontSize:13, color:t.muted, margin:0 }}>Aucun employe actif</p>
          </div>
        ) : activeEmps.map(emp => {
          const empAppts = appts.filter(a => a.employee_id === emp.id);
          return (
            <div key={emp.id} style={{
              flex:1,
              display:'flex',
              flexDirection:'column',
              minWidth:90,
              borderLeft:`0.5px solid ${headerBd}`,
            }}>

              {/* Header employe */}
              <div style={{
                display:'flex',
                flexDirection:'column',
                alignItems:'center',
                justifyContent:'center',
                padding:'6px 0',
                position:'sticky',
                top:0,
                zIndex:10,
                height:36,
                background:headerBg,
                borderBottom:`0.5px solid ${headerBd}`,
              }}>
                <div style={{
                  width:20,
                  height:20,
                  borderRadius:'50%',
                  display:'flex',
                  alignItems:'center',
                  justifyContent:'center',
                  color:'#fff',
                  fontWeight:500,
                  fontSize:9,
                  background:emp.avatar_color||t.text,
                }}>{emp.name.charAt(0)}</div>
                <span style={{
                  fontSize:9,
                  fontWeight:500,
                  marginTop:2,
                  color:t.muted,
                  textAlign:'center',
                  padding:'0 4px',
                  width:'100%',
                  overflow:'hidden',
                  textOverflow:'ellipsis',
                  whiteSpace:'nowrap',
                }}>{emp.name.split(' ')[0]}</span>
              </div>

              {/* Zone temps */}
              <div style={{ position:'relative', flex:1, height:totalH }}>
                {hours.map((_,i)=>(
                  <div key={i} style={{
                    position:'absolute',
                    left:0,
                    right:0,
                    top:i*hourH,
                    height:hourH,
                    borderBottom:`0.5px solid ${gridLineBd}`,
                  }} />
                ))}
                {empAppts.map(appt=>{
                  const { top, height } = getApptStyle(appt);
                  const sc = STATUS_GRID[appt.status]||STATUS_GRID.confirmed;
                  // Barre verticale 2px + fond pastel (onboarding-1 principe 5)
                  const accent = isDark ? (emp.avatar_color||sc.bd) : sc.bd;
                  const bg     = isDark ? `${emp.avatar_color||t.text}22` : sc.bg;
                  const tx     = isDark ? (emp.avatar_color||t.text) : sc.tx;
                  return (
                    <button
                      key={appt.id}
                      type="button"
                      onClick={()=>onApptClick(appt)}
                      style={{
                        position:'absolute',
                        left:2,
                        right:2,
                        top,
                        height:Math.max(height,18),
                        background:bg,
                        border:'none',
                        borderRadius:8,
                        overflow:'hidden',
                        textAlign:'left',
                        cursor:'pointer',
                        zIndex:2,
                        padding:0,
                        fontFamily:'inherit',
                      }}
                    >
                      <div style={{
                        position:'absolute',
                        left:0,
                        top:0,
                        bottom:0,
                        width:2,
                        background:accent,
                      }} />
                      <div style={{ padding:'3px 4px 3px 7px' }}>
                        <p style={{
                          fontSize:10,
                          fontWeight:500,
                          lineHeight:1.2,
                          overflow:'hidden',
                          textOverflow:'ellipsis',
                          whiteSpace:'nowrap',
                          color:tx,
                          margin:0,
                        }}>
                          {appt.client_name}
                        </p>
                        {height>28 && (
                          <p style={{
                            fontSize:9,
                            lineHeight:1.2,
                            overflow:'hidden',
                            textOverflow:'ellipsis',
                            whiteSpace:'nowrap',
                            color:tx,
                            opacity:0.7,
                            margin:'1px 0 0',
                          }}>
                            {fmtTime(appt.start_time)} · {appt.service_name||'RDV'}
                          </p>
                        )}
                        {height>46 && appt.paid && (
                          <div style={{
                            width:6,
                            height:6,
                            borderRadius:'50%',
                            marginTop:3,
                            background:'#10b981',
                          }} />
                        )}
                      </div>
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
