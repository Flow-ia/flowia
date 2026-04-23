// src/pages/employee-agenda/components/MultiColumnAgenda.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { bookingApi } from '../../../utils/api';
import { playSound } from '../../../hooks/useNotifications';
import { Toast, useToast } from '../../../components/UI';
import { Button, SegmentedControl } from '../../../components/primitives';
import { I } from '../../../utils/icons';
import { DAYS_FR, MONTHS_SH, MONTHS_FR, STATUS_GRID } from '../constants';
import { fmtTime, svLocal } from '../helpers';
import Spin from './Spin';
import WeekView from './WeekView';
import MonthView from './MonthView';
import ListView from './ListView';
import ApptActionModal from '../modals/ApptActionModal';
import QuickAddApptModal from '../modals/QuickAddApptModal';

// Persistance du mode de vue entre sessions (demande user onboarding) —
// la préférence est conservée après refresh ou navigation, jusqu'à ce que
// l'utilisateur change de vue explicitement.
const VIEW_MODE_KEY  = 'ff_agenda_view_mode';
const VALID_VIEWS    = ['day', 'week', 'month', 'list'];
const readSavedView  = () => {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return VALID_VIEWS.includes(saved) ? saved : 'day';
  } catch { return 'day'; }
};

export default function MultiColumnAgenda({ employees, services, onTxCreated, onSelectEmployee, theme: t }) {
  const isDark = t.mode === 'dark';
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode]         = useState(readSavedView);

  // Sauvegarde à chaque changement de vue. Note : on garde quand même
  // la possibilité d'override temporaire via ?date=... (deep-link notif
  // bascule en vue Jour sans persister — cf. useEffect deep-link plus bas).
  useEffect(() => {
    try { localStorage.setItem(VIEW_MODE_KEY, viewMode); } catch {}
  }, [viewMode]);

  const [allAppts, setAllAppts]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [editAppt, setEditAppt]         = useState(null);
  const [activeEmployee, setActiveEmployee] = useState(null);
  const [addOpen, setAddOpen]           = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [toast, showToast]              = useToast();
  const [gridStartMin, setGridStartMin] = useState(8*60);
  const [gridEndMin,   setGridEndMin]   = useState(20*60);
  const pendingApptRef = useRef(null);

  const today = new Date();

  const { fromDate, toDate } = useMemo(() => {
    const d = new Date(selectedDate);
    // List partage le scope d'un jour (même rangée d'API que day).
    if (viewMode === 'day' || viewMode === 'list') {
      return { fromDate: new Date(d), toDate: new Date(d) };
    }
    if (viewMode === 'week') {
      const monday = new Date(d);
      const offset = (d.getDay() + 6) % 7;
      monday.setDate(d.getDate() - offset);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      return { fromDate: monday, toDate: sunday };
    }
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first); gridStart.setDate(1 - offset);
    const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate() + 41);
    return { fromDate: gridStart, toDate: gridEnd };
  }, [selectedDate, viewMode]);

  const fromStr = svLocal(fromDate);
  const toStr   = svLocal(toDate);

  useEffect(() => {
    bookingApi.getHours().then(hrs => {
      if (!hrs || !hrs.length) return;
      const open = hrs.filter(h => h.is_open !== false);
      if (!open.length) return;
      const parseT = t => {
        const parts = String(t||'0').split(':').map(Number);
        return (parts[0]||0)*60 + (parts[1]||0);
      };
      const allOpen = open.map(h => parseT(h.open_time));
      const minOpen = Math.min(...allOpen);
      const adjustedClose = open.map(h => {
        const o = parseT(h.open_time); const c = parseT(h.close_time);
        return c < o ? c + 24*60 : c;
      });
      const maxClose = Math.max(...adjustedClose);
      setGridStartMin(Math.max(0, minOpen - 30));
      setGridEndMin(maxClose + 30);
    }).catch(() => {});
  }, []);

  const loadAppts = useCallback(async() => {
    setLoading(true);
    try { const data = await bookingApi.getAppointments({from:fromStr,to:toStr}); setAllAppts(Array.isArray(data)?data:[]); }
    catch {} finally { setLoading(false); }
  }, [fromStr, toStr]);

  useEffect(()=>{ loadAppts(); }, [loadAppts]);

  // Deep-link notif : /agenda?date=YYYY-MM-DD&appt=<id> → on bascule en vue
  // Jour au bon jour, on garde l'id pour ouvrir le modal dès chargement des
  // RDV. Params strippés après usage pour éviter la ré-ouverture au remount.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const dateParam = params.get('date');
    const apptParam = params.get('appt');
    if (!apptParam && !dateParam) return;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const d = new Date(dateParam + 'T00:00:00');
      if (!isNaN(d.getTime())) { setSelectedDate(d); setViewMode('day'); }
    }
    if (apptParam) pendingApptRef.current = apptParam;
    navigate(location.pathname, { replace: true });
  }, [location.search]); // eslint-disable-line

  useEffect(() => {
    if (!pendingApptRef.current || !allAppts.length) return;
    const found = allAppts.find(a => String(a.id) === String(pendingApptRef.current));
    if (found) {
      setEditAppt(found);
      const emp = employees.find(e => e.id === found.employee_id);
      if (emp) setActiveEmployee(emp);
      pendingApptRef.current = null;
    }
  }, [allAppts, employees]);

  const apptsByDay = useMemo(() => {
    const map = {};
    allAppts.forEach(a => {
      const key = a.date || a.appointment_date;
      if (!key) return;
      const k = String(key).slice(0,10);
      if (!map[k]) map[k] = [];
      map[k].push(a);
    });
    Object.values(map).forEach(arr => arr.sort((a,b) => String(a.start_time||'').localeCompare(String(b.start_time||''))));
    return map;
  }, [allAppts]);

  const activeEmps = employees.filter(e=>e.is_active!==false && e.show_in_caisse!==false);
  const HOUR_H = 120;

  const HOURS = (() => {
    const list = [];
    const start = Math.floor(gridStartMin / 60) * 60;
    const end   = Math.ceil(gridEndMin / 60) * 60;
    for (let m = start; m < end; m += 60) list.push(m);
    return list;
  })();
  const gridOriginMin = HOURS[0] || 0;

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

  const openApptModal = appt => {
    const emp = employees.find(e=>e.id===appt.employee_id)||null;
    setActiveEmployee(emp); setEditAppt(appt);
  };

  const navigatePrev = () => setSelectedDate(prev => {
    const n = new Date(prev);
    if (viewMode === 'day' || viewMode === 'list') n.setDate(n.getDate() - 1);
    if (viewMode === 'week')                       n.setDate(n.getDate() - 7);
    if (viewMode === 'month')                      n.setMonth(n.getMonth() - 1);
    return n;
  });
  const navigateNext = () => setSelectedDate(prev => {
    const n = new Date(prev);
    if (viewMode === 'day' || viewMode === 'list') n.setDate(n.getDate() + 1);
    if (viewMode === 'week')                       n.setDate(n.getDate() + 7);
    if (viewMode === 'month')                      n.setMonth(n.getMonth() + 1);
    return n;
  });
  const goToday = () => setSelectedDate(new Date());

  const headerTitle = useMemo(() => {
    const d = selectedDate;
    if (viewMode === 'day' || viewMode === 'list') {
      if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
      return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_SH[d.getMonth()]} ${d.getFullYear()}`;
    }
    if (viewMode === 'week') {
      const monday = new Date(d);
      const offset = (d.getDay() + 6) % 7;
      monday.setDate(d.getDate() - offset);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      if (monday.getMonth() === sunday.getMonth()) {
        return `${monday.getDate()} – ${sunday.getDate()} ${MONTHS_SH[monday.getMonth()]} ${monday.getFullYear()}`;
      }
      return `${monday.getDate()} ${MONTHS_SH[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS_SH[sunday.getMonth()]} ${sunday.getFullYear()}`;
    }
    return `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
  }, [selectedDate, viewMode]);

  const weekDaysFull = useMemo(() => {
    const monday = new Date(selectedDate);
    const offset = (selectedDate.getDay() + 6) % 7;
    monday.setDate(selectedDate.getDate() - offset);
    return Array.from({length:7}, (_,i) => {
      const x = new Date(monday); x.setDate(monday.getDate() + i); return x;
    });
  }, [selectedDate]);

  const miniWeekBase = (() => {
    const base = new Date(selectedDate);
    const offset = (base.getDay() + 6) % 7;
    base.setDate(base.getDate() - offset);
    return base;
  })();
  const miniWeek = Array.from({length:7},(_,i)=>{ const d=new Date(miniWeekBase); d.setDate(miniWeekBase.getDate()+i); return d; });

  const dayKey = svLocal(selectedDate);
  const dayAppts = (viewMode === 'day' || viewMode === 'list')
    ? allAppts
    : (apptsByDay[dayKey] || []);
  const confirmed = dayAppts.filter(a=>a.status==='confirmed').length;
  const encaissed = dayAppts.filter(a=>a.paid).length;

  const isToday = selectedDate.toDateString()===today.toDateString();

  const iconBtnStyle = {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: `0.5px solid ${t.border}`,
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: t.muted,
    fontFamily: 'inherit',
    padding: 0,
  };

  return (
    <div style={{
      display:'flex',
      flexDirection:'column',
      height:'100vh',
      background: t.bg,
      overflow:'hidden',
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* ── HEADER ── */}
      <div style={{
        padding: '10px 14px 8px',
        background: t.card,
        flexShrink: 0,
        borderBottom: `0.5px solid ${t.border}`,
      }}>
        {/* Ligne 1 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: (viewMode === 'day' || viewMode === 'list') ? 10 : 0,
          flexWrap: 'wrap',
        }}>
          {/* Aujourd'hui */}
          <button
            type="button"
            onClick={goToday}
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 8,
              border: `0.5px solid ${t.borderStrong}`,
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              color: t.text,
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            Aujourd{"'"}hui
          </button>

          {/* Prev / Next */}
          <div style={{ display:'flex', gap:4, flexShrink:0 }}>
            <button type="button" onClick={navigatePrev} style={iconBtnStyle} aria-label="Precedent">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button type="button" onClick={navigateNext} style={iconBtnStyle} aria-label="Suivant">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          {/* Titre */}
          <div style={{
            flex: 1,
            minWidth: 120,
            fontSize: 15,
            fontWeight: 500,
            color: t.text,
            textTransform: 'capitalize',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {headerTitle}
          </div>

          {loading && <Spin size={14} />}

          {/* Toggle vue — sauvegardé en localStorage (ff_agenda_view_mode) */}
          <SegmentedControl
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'day',   label: 'Jour' },
              { value: 'week',  label: 'Semaine' },
              { value: 'month', label: 'Mois' },
              { value: 'list',  label: 'Liste' },
            ]}
          />

          {/* Nouveau RDV */}
          <Button
            size="small"
            onClick={() => setQuickAddOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          >
            <I.Plus width={12} height={12} />
            RDV
          </Button>
        </div>

        {/* Mini-semaine : vue Jour + Liste (même scope d'1 jour) */}
        {(viewMode === 'day' || viewMode === 'list') && (
          <div style={{ display:'flex', gap:2, marginTop:8 }}>
            {miniWeek.map((d, i) => {
              const isSel = d.toDateString() === selectedDate.toDateString();
              const isTod = d.toDateString() === today.toDateString();
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedDate(new Date(d))}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderRadius: 8,
                    border: `0.5px solid ${
                      isSel ? 'transparent' : (isTod ? t.border : 'transparent')
                    }`,
                    background: isSel ? t.text : (isTod ? t.cardAlt : 'transparent'),
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: isSel ? 'rgba(255,255,255,.75)' : t.muted,
                  }}>{DAYS_FR[d.getDay()]}</span>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 500,
                    marginTop: 1,
                    color: isSel ? t.bg : t.text,
                  }}>{d.getDate()}</span>
                  {isTod && !isSel && (
                    <div style={{ width:4, height:4, borderRadius:'50%', background:t.text, marginTop:1 }} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Stats (vue Jour + Liste) */}
        {(viewMode === 'day' || viewMode === 'list') && dayAppts.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginTop: 8,
            paddingTop: 8,
            borderTop: `0.5px solid ${t.separator}`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: t.text }}>{dayAppts.length} RDV</span>
            <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, color:t.muted }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:'#6366f1' }} />
              {confirmed} confirmes
            </span>
            {encaissed > 0 && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, color:t.muted }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:'#10b981' }} />
                {encaissed} encaisses
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── CONTENU ── */}
      <div style={{ flex:1, overflow:'auto', minHeight:0 }}>
        {viewMode === 'day' && (
          activeEmps.length === 0 ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
              <p style={{ margin:0, fontSize:13, color:t.muted }}>Aucun employe actif</p>
            </div>
          ) : (
            <div style={{ display:'flex', minWidth: activeEmps.length * 150 + 52 }}>
              {/* Axe heures */}
              <div style={{
                width: 52,
                flexShrink: 0,
                position: 'sticky',
                left: 0,
                zIndex: 10,
                background: t.cardAlt,
              }}>
                <div style={{ height: 56, borderBottom: `0.5px solid ${t.border}` }} />
                {HOURS.map((hMin, i) => {
                  const hNum = Math.floor(hMin / 60) % 24;
                  const label = hNum === 0 ? 'Minuit' : `${hNum}h`;
                  return (
                    <div key={i} style={{
                      height: HOUR_H,
                      borderBottom: `0.5px solid ${t.separator}`,
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-end',
                      paddingRight: 8,
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: t.dim, marginTop: -7 }}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Colonnes employes */}
              {activeEmps.map(emp => {
                const empAppts = dayAppts.filter(a => a.employee_id === emp.id);
                return (
                  <div key={emp.id} style={{
                    flex: 1,
                    minWidth: 140,
                    borderLeft: `0.5px solid ${t.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                  }}>
                    <button
                      type="button"
                      onClick={() => onSelectEmployee(emp)}
                      style={{
                        height: 56,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px 6px',
                        position: 'sticky',
                        top: 0,
                        zIndex: 9,
                        background: t.cardAlt,
                        borderBottom: `0.5px solid ${t.border}`,
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background .15s',
                        flexShrink: 0,
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = t.cardAlt}
                    >
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: emp.avatar_color || t.text,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 500,
                      }}>{emp.name.charAt(0)}</div>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 500,
                        marginTop: 2,
                        color: t.muted,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '90%',
                        display: 'block',
                      }}>{emp.name.split(' ')[0]}</span>
                      <div style={{ display: 'flex', gap: 3, marginTop: 1 }}>
                        {emp.can_cancel && <div style={{ width:4, height:4, borderRadius:'50%', background:'#ef4444' }} />}
                        {emp.can_modify && <div style={{ width:4, height:4, borderRadius:'50%', background:'#8b5cf6' }} />}
                        {emp.can_encash && <div style={{ width:4, height:4, borderRadius:'50%', background:'#10b981' }} />}
                      </div>
                    </button>

                    <div style={{ position: 'relative', height: HOURS.length * HOUR_H, flex: 1 }}>
                      {HOURS.map((_, i) => (
                        <div key={i} style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: i * HOUR_H,
                          height: HOUR_H,
                          borderBottom: `0.5px solid ${t.separator}`,
                        }} />
                      ))}
                      {isToday && (() => {
                        const n = new Date();
                        let nowMin = n.getHours() * 60 + n.getMinutes();
                        if (nowMin < gridOriginMin) nowMin += 24 * 60;
                        const relMin = nowMin - gridOriginMin;
                        if (relMin < 0 || relMin > HOURS.length * 60) return null;
                        return (
                          <div style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: (relMin / 60) * HOUR_H,
                            height: 1,
                            background: '#ef4444',
                            zIndex: 5,
                          }} />
                        );
                      })()}

                      {empAppts.map(appt => {
                        const { top, height } = getApptStyle(appt);
                        const sc = STATUS_GRID[appt.status] || STATUS_GRID.confirmed;
                        const accent = isDark ? (emp.avatar_color || sc.bd) : sc.bd;
                        const bg     = isDark ? `${emp.avatar_color || t.text}22` : sc.bg;
                        const tx     = isDark ? (emp.avatar_color || t.text) : sc.tx;
                        const items  = Array.isArray(appt.items) ? appt.items.filter(i => i?.service_name) : [];
                        const primarySvc = items[0]?.service_name || appt.service_name || 'RDV';
                        const totalMin   = appt.total_duration || appt.duration_minutes;
                        return (
                          <button
                            key={appt.id}
                            type="button"
                            onClick={() => openApptModal(appt)}
                            style={{
                              position: 'absolute',
                              left: 3,
                              right: 3,
                              top,
                              height: Math.max(height, 36),
                              borderRadius: 8,
                              overflow: 'hidden',
                              textAlign: 'left',
                              cursor: 'pointer',
                              zIndex: 2,
                              border: 'none',
                              background: bg,
                              padding: 0,
                              fontFamily: 'inherit',
                            }}
                          >
                            <div style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: 3,
                              background: accent,
                            }} />
                            {/* Heure + prestations agrandies pour lecture
                                directe sans ouvrir le modal (feedback user). */}
                            <div style={{ paddingLeft: 11, paddingRight: 6, paddingTop: 5, paddingBottom: 4 }}>
                              <p style={{
                                margin: 0,
                                fontSize: 15,
                                fontWeight: 500,
                                color: tx,
                                fontFamily: 'monospace',
                                lineHeight: 1.1,
                              }}>{fmtTime(appt.start_time)}</p>
                              <p style={{
                                margin: '3px 0 0',
                                fontSize: 14,
                                fontWeight: 500,
                                color: tx,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                lineHeight: 1.2,
                              }}>{primarySvc}</p>
                              {height > 64 && items.length > 1 && items.slice(1, 4).map((it, i) => (
                                <p key={i} style={{
                                  margin: '1px 0 0',
                                  fontSize: 12,
                                  fontWeight: 500,
                                  color: tx,
                                  opacity: 0.85,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.2,
                                }}>• {it.service_name}{it.qty > 1 ? ` ×${it.qty}` : ''}</p>
                              ))}
                              {height > 58 && (
                                <p style={{
                                  margin: '3px 0 0',
                                  fontSize: 11,
                                  fontWeight: 500,
                                  color: tx,
                                  opacity: 0.7,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>{appt.client_name}{totalMin ? ` · ${totalMin} min` : ''}</p>
                              )}
                              {height > 80 && appt.paid && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />
                                  <span style={{ fontSize: 10, color: tx, fontWeight: 500 }}>Encaisse</span>
                                </div>
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
          )
        )}

        {viewMode === 'week' && (
          <WeekView
            weekStart={weekDaysFull[0]}
            days={weekDaysFull}
            apptsByDay={apptsByDay}
            employees={employees}
            isDark={isDark}
            t={t}
            gridStartMin={gridStartMin}
            gridEndMin={gridEndMin}
            HOUR_H={HOUR_H}
            onSelectDay={d => { setSelectedDate(new Date(d)); setViewMode('day'); }}
            onOpenAppt={openApptModal}
          />
        )}

        {viewMode === 'month' && (
          <MonthView
            monthDate={selectedDate}
            apptsByDay={apptsByDay}
            employees={employees}
            isDark={isDark}
            t={t}
            onSelectDay={d => { setSelectedDate(new Date(d)); setViewMode('day'); }}
            onOpenAppt={openApptModal}
          />
        )}

        {viewMode === 'list' && (
          <ListView
            employees={employees}
            dayAppts={dayAppts}
            isToday={isToday}
            t={t}
            onOpenAppt={openApptModal}
          />
        )}
      </div>

      {/* ── MODAUX ── */}
      {editAppt && (
        <ApptActionModal
          appt={editAppt}
          employee={activeEmployee}
          services={services}
          theme={t}
          onClose={() => { setEditAppt(null); setActiveEmployee(null); }}
          onUpdated={upd => {
            setAllAppts(p => p.map(a => a.id === upd.id ? { ...a, ...upd } : a));
            setEditAppt(prev => ({ ...prev, ...upd }));
            showToast('RDV mis a jour ✓');
          }}
          onTxCreated={tx => { onTxCreated(tx); playSound('caisse', 2); showToast('Encaisse !'); }}
        />
      )}

      {quickAddOpen && (
        <QuickAddApptModal
          employees={employees}
          services={services}
          theme={t}
          onClose={() => setQuickAddOpen(false)}
          onSave={async form => {
            const appt = await bookingApi.createEmpAppt(form);
            await loadAppts();
            showToast('RDV cree ✓');
            return appt;
          }}
        />
      )}

      {addOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}>
          <div
            onClick={() => setAddOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(4px)',
            }}
          />
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: 360,
            borderRadius: 16,
            overflow: 'hidden',
            background: t.elevated,
            border: `0.5px solid ${t.border}`,
            boxShadow: t.shadowModal,
          }}>
            <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${t.border}` }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: t.text }}>Nouveau rendez-vous</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: t.muted }}>Selectionnez l{"'"}employe</p>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeEmps.map(emp => {
                const perms = [
                  emp.can_cancel && { label: 'Annul.', dot: '#ef4444' },
                  emp.can_modify && { label: 'Modif.', dot: '#8b5cf6' },
                  emp.can_encash && { label: 'Encaiss.', dot: '#10b981' },
                ].filter(Boolean);
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => { setAddOpen(false); onSelectEmployee(emp); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: t.card,
                      border: `0.5px solid ${t.border}`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = t.cardAlt}
                    onMouseLeave={e => e.currentTarget.style.background = t.card}
                  >
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      background: emp.avatar_color || t.text,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 500,
                      flexShrink: 0,
                    }}>{emp.name.charAt(0)}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.text }}>{emp.name}</p>
                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        {perms.map((p, j) => (
                          <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: t.muted }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.dot }} />
                            {p.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span style={{ color: t.muted, flexShrink: 0, display: 'inline-flex' }}>
                      <I.ChevR width={14} height={14} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
