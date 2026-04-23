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
      {/* Titre de la vue — aligné à gauche, en tête */}
      <p style={{
        margin: '0 0 10px',
        fontSize: 13,
        fontWeight: 500,
        color: t.muted,
        textAlign: 'left',
        letterSpacing: '-0.01em',
      }}>
        Agenda mode liste
      </p>
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

              {/* Liste des RDV — heure et prestations en grand pour que
                  l'employé voie directement ce qu'il a sans ouvrir la popup. */}
              {empAppts.length === 0 ? (
                <div style={{ padding: '24px 12px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 12, color: t.dim }}>Aucun RDV</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {empAppts.map((appt, idx) => {
                    const st = STATUS_CFG[appt.status] || STATUS_CFG.confirmed;
                    const items = Array.isArray(appt.items) ? appt.items.filter(i => i?.service_name) : [];
                    const totalMin = appt.total_duration || appt.duration_minutes;
                    return (
                      <button
                        key={appt.id}
                        type="button"
                        onClick={() => onOpenAppt(appt)}
                        style={{
                          display: 'flex',
                          alignItems: 'stretch',
                          gap: 12,
                          padding: '12px 12px 14px',
                          borderTop: idx > 0 ? `0.5px solid ${t.separator}` : 'none',
                          borderLeft: `3px solid ${st.accent}`,
                          background: 'transparent',
                          border: 'none',
                          borderLeftWidth: 3,
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
                        {/* Heure en grand */}
                        <div style={{
                          minWidth: 62,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          justifyContent: 'flex-start',
                          paddingTop: 2,
                        }}>
                          <span style={{
                            fontSize: 22, fontWeight: 500, color: t.text,
                            fontFamily: 'monospace', lineHeight: 1,
                          }}>
                            {fmtTime(appt.start_time)}
                          </span>
                          {appt.end_time && (
                            <span style={{
                              fontSize: 12, color: t.muted, fontFamily: 'monospace',
                              marginTop: 4, lineHeight: 1,
                            }}>
                              → {fmtTime(appt.end_time)}
                            </span>
                          )}
                          {totalMin && (
                            <span style={{
                              fontSize: 10, color: t.dim, marginTop: 3, fontWeight: 500,
                            }}>
                              {totalMin} min
                            </span>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            margin: 0, fontSize: 13, fontWeight: 500, color: t.muted,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {appt.client_name || 'Client'}
                          </p>
                          {/* Prestations en grand : 1 ligne par prestation si
                              multiple, sinon 1 seule ligne avec le nom du service */}
                          {items.length > 1 ? (
                            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {items.map((it, i) => (
                                <p key={i} style={{
                                  margin: 0, fontSize: 15, fontWeight: 500, color: t.text,
                                  lineHeight: 1.3,
                                }}>
                                  • {it.service_name}{it.qty > 1 ? ` ×${it.qty}` : ''}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p style={{
                              margin: '4px 0 0', fontSize: 16, fontWeight: 500, color: t.text,
                              lineHeight: 1.3,
                            }}>
                              {items[0]?.service_name || appt.service_name || 'RDV'}
                            </p>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
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
