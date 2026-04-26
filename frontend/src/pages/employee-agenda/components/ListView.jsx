// src/pages/employee-agenda/components/ListView.jsx
// Vue Liste (colonne par employé) — alternative à la grille heures de la
// vue Jour. Affiche les RDV du jour sélectionné en liste verticale sous
// chaque employé. Responsive : CSS Grid auto-fit + minmax assure que
// - sur desktop : autant de colonnes que d'employés actifs
// - sur mobile  : les colonnes s'empilent (une seule tient par ligne)
// Pas de media query nécessaire grâce à `repeat(auto-fit, minmax(240px, 1fr))`.
//
// Repère temporel "Maintenant" (commit suivant) — quand `isToday=true` :
//   • séparateur rouge "Maintenant HH:MM" inséré dans chaque colonne entre
//     les RDV passés et les RDV à venir
//   • RDV passés grisés (opacité 0.55), RDV en cours mis en évidence
//     (bordure rouge + fond accent), RDV futurs normaux
//   • auto-scroll vers le marqueur au montage + refresh chaque minute
import { useEffect, useRef, useState } from 'react';
import { STATUS_CFG } from '../constants';
import { fmtTime } from '../helpers';

// Convertit "HH:MM[:SS]" en minutes depuis minuit. Tolère null/undefined.
function timeToMin(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

export default function ListView({ employees, dayAppts, isToday, t, onOpenAppt }) {
  const activeEmps = employees.filter(e => e.is_active !== false && e.show_in_caisse !== false);

  // Heure courante — re-render chaque minute pour faire glisser le marqueur.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  // Auto-scroll vers le 1er séparateur "Maintenant" rendu — au montage,
  // pour qu'un employé qui ouvre l'agenda voie directement où il en est.
  const nowMarkerRef = useRef(null);
  useEffect(() => {
    if (!isToday) return;
    const id = setTimeout(() => {
      if (nowMarkerRef.current?.scrollIntoView) {
        nowMarkerRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 80); // laisse le DOM peindre avant de scroller
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday]);

  if (activeEmps.length === 0) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
        <p style={{ margin:0, fontSize:13, color:t.muted }}>Aucun employe actif</p>
      </div>
    );
  }

  const nowMin = isToday ? now.getHours() * 60 + now.getMinutes() : null;
  const nowLabel = isToday
    ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    : '';

  // Statut temporel d'un RDV par rapport à `now`. Si pas isToday → tous "future".
  function apptStatus(appt) {
    if (!isToday) return 'future';
    const start = timeToMin(appt.start_time);
    const end = timeToMin(appt.end_time) ?? (start != null ? start + (appt.duration_minutes || 30) : null);
    if (start == null) return 'future';
    if (end != null && nowMin >= end) return 'past';
    if (nowMin >= start) return 'current';
    return 'future';
  }

  // Rendu compact du marqueur "Maintenant" — ligne rouge + chip.
  const NowMarker = ({ withRef }) => (
    <div
      ref={withRef ? nowMarkerRef : undefined}
      style={{
        position: 'relative',
        margin: '4px 12px',
        height: 1,
        background: '#ef4444',
        opacity: 0.85,
      }}
    >
      <span style={{
        position: 'absolute',
        left: 0,
        top: -8,
        background: '#ef4444',
        color: '#fff',
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: 0.3,
        padding: '2px 6px',
        borderRadius: 4,
        fontFamily: 'monospace',
        lineHeight: 1,
      }}>
        MAINTENANT · {nowLabel}
      </span>
    </div>
  );

  let nowMarkerAttached = false; // n'attache la ref qu'à 1 seul marqueur (1ère colonne)

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
        {isToday && (
          <span style={{
            marginLeft: 10, fontSize: 11, fontWeight: 500,
            color: '#dc2626', fontFamily: 'monospace',
          }}>
            · {nowLabel}
          </span>
        )}
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

          // Index du 1er RDV non-passé → c'est là qu'on insère le marqueur.
          // Si tous passés → marqueur après tous les RDV. Si aucun passé → en haut.
          let firstNonPastIdx = -1;
          if (isToday) {
            firstNonPastIdx = empAppts.findIndex(a => apptStatus(a) !== 'past');
          }
          const showMarkerAtTop    = isToday && empAppts.length > 0 && firstNonPastIdx === 0;
          const showMarkerAtBottom = isToday && empAppts.length > 0 && firstNonPastIdx === -1;
          const showMarkerEmpty    = isToday && empAppts.length === 0;

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
                <div style={{ padding: '12px 0' }}>
                  {showMarkerEmpty && (() => {
                    const attach = !nowMarkerAttached;
                    if (attach) nowMarkerAttached = true;
                    return <NowMarker withRef={attach} />;
                  })()}
                  <p style={{
                    margin: 0, padding: '12px',
                    textAlign: 'center', fontSize: 12, color: t.dim,
                  }}>Aucun RDV</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {showMarkerAtTop && (() => {
                    const attach = !nowMarkerAttached;
                    if (attach) nowMarkerAttached = true;
                    return <NowMarker withRef={attach} />;
                  })()}
                  {empAppts.map((appt, idx) => {
                    const st = STATUS_CFG[appt.status] || STATUS_CFG.confirmed;
                    const items = Array.isArray(appt.items) ? appt.items.filter(i => i?.service_name) : [];
                    const totalMin = appt.total_duration || appt.duration_minutes;
                    const tStatus = apptStatus(appt);
                    const isPast    = tStatus === 'past';
                    const isCurrent = tStatus === 'current';

                    // Insérer le marqueur AVANT ce RDV s'il est le 1er non-passé
                    // (et qu'on ne l'a pas déjà placé en haut).
                    const insertMarkerBefore = isToday && !showMarkerAtTop && idx === firstNonPastIdx && idx > 0;
                    const accentColor = isCurrent ? '#dc2626' : st.accent;

                    return (
                      <div key={appt.id} style={{ display: 'flex', flexDirection: 'column' }}>
                        {insertMarkerBefore && (() => {
                          const attach = !nowMarkerAttached;
                          if (attach) nowMarkerAttached = true;
                          return <NowMarker withRef={attach} />;
                        })()}
                        <button
                          type="button"
                          onClick={() => onOpenAppt(appt)}
                          style={{
                            display: 'flex',
                            alignItems: 'stretch',
                            gap: 12,
                            padding: '12px 12px 14px',
                            borderTop: idx > 0 ? `0.5px solid ${t.separator}` : 'none',
                            borderLeft: `${isCurrent ? 4 : 3}px solid ${accentColor}`,
                            background: isCurrent ? '#fef2f2' : 'transparent',
                            border: 'none',
                            borderLeftWidth: isCurrent ? 4 : 3,
                            borderLeftStyle: 'solid',
                            borderLeftColor: accentColor,
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontFamily: 'inherit',
                            transition: 'background .15s, opacity .15s',
                            opacity: isPast ? 0.55 : 1,
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = isCurrent ? '#fee2e2' : t.cardAlt;
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = isCurrent ? '#fef2f2' : 'transparent';
                          }}
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
                              fontSize: 22, fontWeight: 500,
                              color: isCurrent ? '#dc2626' : t.text,
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
                              {isCurrent && (
                                <span style={{
                                  fontSize: 10, fontWeight: 500,
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '2px 8px', borderRadius: 99,
                                  background: '#fef2f2', color: '#dc2626',
                                  border: '0.5px solid #fecaca',
                                }}>
                                  <span style={{
                                    width: 5, height: 5, borderRadius: '50%',
                                    background: '#dc2626',
                                  }} />
                                  En cours
                                </span>
                              )}
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
                      </div>
                    );
                  })}
                  {showMarkerAtBottom && (() => {
                    const attach = !nowMarkerAttached;
                    if (attach) nowMarkerAttached = true;
                    return <NowMarker withRef={attach} />;
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
