// src/pages/employee-agenda/components/MonthView.jsx
import { fmtTime, svLocal } from '../helpers';

export default function MonthView({
  monthDate, apptsByDay, employees, isDark, t, onSelectDay, onOpenAppt,
}) {
  const today = new Date();
  const year  = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - offset);

  const cells = Array.from({length:42}, (_,i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const hdrDays = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      {/* Header jours semaine */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        borderBottom: `0.5px solid ${t.border}`,
        flexShrink: 0,
      }}>
        {hdrDays.map(h => (
          <div key={h} style={{
            padding: '8px 0',
            textAlign: 'center',
            fontSize: 11,
            fontWeight: 500,
            color: t.muted,
          }}>
            {h}
          </div>
        ))}
      </div>

      {/* Grille 6x7 */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gridTemplateRows: 'repeat(6, 1fr)',
        minHeight: 0,
      }}>
        {cells.map((d, i) => {
          const key = svLocal(d);
          const dayAppts = apptsByDay[key] || [];
          const isCurrent = d.getMonth() === month;
          const isTod = d.toDateString() === today.toDateString();

          const MAX_VISIBLE = 3;
          const visible = dayAppts.slice(0, MAX_VISIBLE);
          const extra   = dayAppts.length - MAX_VISIBLE;

          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDay(d)}
              style={{
                border: 'none',
                borderRight: `0.5px solid ${t.separator}`,
                borderBottom: `0.5px solid ${t.separator}`,
                background: isCurrent ? 'transparent' : t.cardAlt,
                padding: '4px 6px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                cursor: 'pointer',
                textAlign: 'left',
                overflow: 'hidden',
                minHeight: 0,
                fontFamily: 'inherit',
              }}
            >
              {/* Numero jour */}
              <div style={{ display:'flex', justifyContent:'flex-start', marginBottom:2 }}>
                <div style={{
                  minWidth: 22,
                  height: 22,
                  padding: '0 6px',
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isTod ? t.text : 'transparent',
                  color: isTod
                    ? t.bg
                    : (isCurrent ? t.text : t.dim),
                  fontSize: 12,
                  fontWeight: 500,
                }}>
                  {d.getDate()}
                </div>
              </div>

              {/* RDV list */}
              <div style={{ display:'flex', flexDirection:'column', gap:2, overflow:'hidden', flex:1, minHeight:0 }}>
                {visible.map(appt => {
                  const emp = employees.find(e => e.id === appt.employee_id);
                  const accent = emp?.avatar_color || t.text;
                  return (
                    <div
                      key={appt.id}
                      onClick={(e) => { e.stopPropagation(); onOpenAppt(appt); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 6px',
                        borderRadius: 6,
                        background: t.cardAlt,
                        borderLeft: `2px solid ${accent}`,
                        cursor: 'pointer',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      <span style={{
                        fontSize: 10,
                        fontWeight: 500,
                        color: t.text,
                        flexShrink: 0,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}>{fmtTime(appt.start_time)}</span>
                      <span style={{
                        fontSize: 10,
                        color: t.muted,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>{appt.client_name}</span>
                    </div>
                  );
                })}
                {extra > 0 && (
                  <div style={{ fontSize:10, fontWeight:500, color:t.muted, paddingLeft:6 }}>
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
