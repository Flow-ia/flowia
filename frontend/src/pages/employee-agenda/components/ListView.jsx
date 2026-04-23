// src/pages/employee-agenda/components/ListView.jsx
// Vue Liste (colonne par employé) — alternative à la grille heures de la
// vue Jour. Affiche les RDV du jour sélectionné en liste verticale sous
// chaque employé. Responsive : CSS Grid auto-fit + minmax assure que
// - sur desktop : autant de colonnes que d'employés actifs
// - sur mobile  : les colonnes s'empilent (une seule tient par ligne)
// Pas de media query nécessaire grâce à `repeat(auto-fit, minmax(240px, 1fr))`.
import { STATUS_CFG } from '../constants';
import { fmtTime } from '../helpers';

export default function ListView({ employees, dayAppts, isToday, t, onOpenAppt }) {
  const activeEmps = employees.filter(e => e.is_active !== false && e.show_in_caisse !== false);

  if (activeEmps.length === 0) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
        <p style={{ margin:0, fontSize:13, color:t.muted }}>Aucun employe actif</p>
      </div>
    );
  }

  return (
    <div style={{ padding:12 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 12,
      }}>
        {activeEmps.map(emp => {
          const empAppts = dayAppts
            .filter(a => a.employee_id === emp.id)
            .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));

          return (
            <div key={emp.id} style={{
              borderRadius: 12,
              border: `0.5px solid ${t.border}`,
              background: t.card,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
            }}>
              {/* En-tête colonne employé */}
              <div style={{
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: t.cardAlt,
                borderBottom: `0.5px solid ${t.border}`,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: emp.avatar_color || t.text,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 13, fontWeight: 500, flexShrink: 0,
                }}>
                  {emp.name.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 500, color: t.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {emp.name}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: t.muted }}>
                    {empAppts.length} RDV{empAppts.length > 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Liste des RDV */}
              {empAppts.length === 0 ? (
                <div style={{ padding: '24px 12px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 12, color: t.dim }}>Aucun RDV</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {empAppts.map((appt, idx) => {
                    const st = STATUS_CFG[appt.status] || STATUS_CFG.confirmed;
                    return (
                      <button
                        key={appt.id}
                        type="button"
                        onClick={() => onOpenAppt(appt)}
                        style={{
                          display: 'flex',
                          alignItems: 'stretch',
                          gap: 10,
                          padding: '10px 12px',
                          borderTop: idx > 0 ? `0.5px solid ${t.separator}` : 'none',
                          borderLeft: `2px solid ${st.accent}`,
                          background: 'transparent',
                          border: 'none',
                          borderLeftWidth: 2,
                          borderLeftStyle: 'solid',
                          borderLeftColor: st.accent,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          transition: 'background .15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = t.cardAlt; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{
                          minWidth: 48,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          justifyContent: 'center',
                        }}>
                          <span style={{
                            fontSize: 13, fontWeight: 500, color: t.text,
                            fontFamily: 'monospace',
                          }}>
                            {fmtTime(appt.start_time)}
                          </span>
                          {appt.end_time && (
                            <span style={{ fontSize: 10, color: t.dim, fontFamily: 'monospace' }}>
                              {fmtTime(appt.end_time)}
                            </span>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            margin: 0, fontSize: 13, fontWeight: 500, color: t.text,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {appt.client_name || 'Client'}
                          </p>
                          <p style={{
                            margin: '2px 0 0', fontSize: 11, color: t.muted,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {appt.service_name || 'RDV'}
                            {appt.total_duration || appt.duration_minutes
                              ? ` · ${appt.total_duration || appt.duration_minutes} min`
                              : ''}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 10, fontWeight: 500,
                              padding: '2px 8px', borderRadius: 99,
                              background: st.bg, color: st.color,
                            }}>
                              {st.label}
                            </span>
                            {appt.paid && (
                              <span style={{
                                fontSize: 10, fontWeight: 500,
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                padding: '2px 8px', borderRadius: 99,
                                background: '#f0fdf4', color: '#065f46',
                              }}>
                                <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#10b981' }} />
                                Encaisse
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
