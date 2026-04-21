// src/pages/employee-agenda/components/MultiColumnAgenda.jsx — UI Google Calendar (Jour / Semaine / Mois)
import { useState, useEffect, useCallback, useMemo } from 'react';
import { bookingApi } from '../../../utils/api';
import { playSound } from '../../../hooks/useNotifications';
import { Toast, useToast } from '../../../components/UI';
import { DAYS_FR, MONTHS_SH, MONTHS_FR, STATUS_GRID } from '../constants';
import { fmtTime, svLocal } from '../helpers';
import { glassCard, chip } from '../styles';
import Spin from './Spin';
import WeekView from './WeekView';
import MonthView from './MonthView';
import ApptActionModal from '../modals/ApptActionModal';
import QuickAddApptModal from '../modals/QuickAddApptModal';

export default function MultiColumnAgenda({ employees, services, onTxCreated, onSelectEmployee, theme: t }) {
  const isDark = t.mode === 'dark';
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode]         = useState('day'); // 'day' | 'week' | 'month'
  const [allAppts, setAllAppts]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [editAppt, setEditAppt]         = useState(null);
  const [activeEmployee, setActiveEmployee] = useState(null);
  const [addOpen, setAddOpen]           = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [toast, showToast]              = useToast();
  const [gridStartMin, setGridStartMin] = useState(8*60);
  const [gridEndMin,   setGridEndMin]   = useState(20*60);

  const today = new Date();

  // ─── Range à charger selon la vue ───
  const { fromDate, toDate } = useMemo(() => {
    const d = new Date(selectedDate);
    if (viewMode === 'day') {
      return { fromDate: new Date(d), toDate: new Date(d) };
    }
    if (viewMode === 'week') {
      // Lundi → Dimanche
      const monday = new Date(d);
      const offset = (d.getDay() + 6) % 7;
      monday.setDate(d.getDate() - offset);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      return { fromDate: monday, toDate: sunday };
    }
    // month : grille 42 cellules (début lundi avant le 1er, fin dimanche après)
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first); gridStart.setDate(1 - offset);
    const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate() + 41);
    return { fromDate: gridStart, toDate: gridEnd };
  }, [selectedDate, viewMode]);

  const fromStr = svLocal(fromDate);
  const toStr   = svLocal(toDate);

  // Charger horaires commerce
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

  // Index RDV par jour pour vues semaine/mois
  const apptsByDay = useMemo(() => {
    const map = {};
    allAppts.forEach(a => {
      const key = a.date || a.appointment_date;
      if (!key) return;
      const k = String(key).slice(0,10);
      if (!map[k]) map[k] = [];
      map[k].push(a);
    });
    // Trier chaque jour par heure
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

  // ─── Navigation prev/next selon la vue ───
  const navigatePrev = () => setSelectedDate(prev => {
    const n = new Date(prev);
    if (viewMode === 'day')   n.setDate(n.getDate() - 1);
    if (viewMode === 'week')  n.setDate(n.getDate() - 7);
    if (viewMode === 'month') n.setMonth(n.getMonth() - 1);
    return n;
  });
  const navigateNext = () => setSelectedDate(prev => {
    const n = new Date(prev);
    if (viewMode === 'day')   n.setDate(n.getDate() + 1);
    if (viewMode === 'week')  n.setDate(n.getDate() + 7);
    if (viewMode === 'month') n.setMonth(n.getMonth() + 1);
    return n;
  });
  const goToday = () => setSelectedDate(new Date());

  // ─── Titre central selon la vue ───
  const headerTitle = useMemo(() => {
    const d = selectedDate;
    if (viewMode === 'day') {
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

  // Jours de la semaine (vue week)
  const weekDaysFull = useMemo(() => {
    const monday = new Date(selectedDate);
    const offset = (selectedDate.getDay() + 6) % 7;
    monday.setDate(selectedDate.getDate() - offset);
    return Array.from({length:7}, (_,i) => {
      const x = new Date(monday); x.setDate(monday.getDate() + i); return x;
    });
  }, [selectedDate]);

  // Mini-bar semaine (toujours affiché quand vue==day pour cohérence, optionnel)
  const miniWeekBase = (() => {
    const base = new Date(selectedDate);
    const offset = (base.getDay() + 6) % 7;
    base.setDate(base.getDate() - offset);
    return base;
  })();
  const miniWeek = Array.from({length:7},(_,i)=>{ const d=new Date(miniWeekBase); d.setDate(miniWeekBase.getDate()+i); return d; });

  // ─── Styles toggle Jour/Semaine/Mois ───
  const toggleBtn = (active) => ({
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    border: 'none',
    background: active ? (isDark?'#1a73e8':'#1a73e8') : 'transparent',
    color: active ? '#fff' : (isDark?'#adbac7':'#374151'),
    cursor: 'pointer',
    transition: 'all .12s',
    height: 32,
  });

  // stats rapides (jour courant si vue day)
  const dayKey = svLocal(selectedDate);
  const dayAppts = viewMode === 'day' ? allAppts : (apptsByDay[dayKey] || []);
  const confirmed = dayAppts.filter(a=>a.status==='confirmed').length;
  const encaissed = dayAppts.filter(a=>a.paid).length;

  const isToday = selectedDate.toDateString()===today.toDateString();

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:isDark?'#0d1117':'#f6f8fa', overflow:'hidden' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* ── HEADER Google-Calendar-like ── */}
      <div style={{ padding:'10px 14px 8px', background:isDark?'#0d1117':'#fff', flexShrink:0, borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.08)'}` }}>
        {/* Ligne 1 : Today + Nav + Titre + Toggle + RDV */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:viewMode==='day'?10:0, flexWrap:'wrap' }}>
          {/* Bouton Aujourd'hui */}
          <button onClick={goToday} style={{
            height:32, padding:'0 12px', borderRadius:8,
            border:`1px solid ${isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.15)'}`,
            background:'transparent', cursor:'pointer',
            fontSize:12, fontWeight:700, color:isDark?'#e6edf3':'#374151',
            flexShrink:0,
          }}>Aujourd'hui</button>

          {/* Prev / Next */}
          <div style={{ display:'flex', gap:2, flexShrink:0 }}>
            <button onClick={navigatePrev} style={{ width:32, height:32, borderRadius:8, border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }} title="Précédent">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:16,height:16,color:isDark?'#adbac7':'#374151'}}><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button onClick={navigateNext} style={{ width:32, height:32, borderRadius:8, border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }} title="Suivant">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:16,height:16,color:isDark?'#adbac7':'#374151'}}><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          {/* Titre central */}
          <div style={{ flex:1, minWidth:120, fontSize:16, fontWeight:700, color:isDark?'#e6edf3':'#111827', letterSpacing:'-.3px', textTransform:'capitalize' }}>
            {headerTitle}
          </div>

          {loading && <Spin size={14} />}

          {/* Toggle Jour / Semaine / Mois */}
          <div style={{
            display:'flex',
            borderRadius:8, overflow:'hidden',
            border:`1px solid ${isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.15)'}`,
            flexShrink:0,
          }}>
            <button onClick={()=>setViewMode('day')}   style={toggleBtn(viewMode==='day')}>Jour</button>
            <button onClick={()=>setViewMode('week')}  style={{ ...toggleBtn(viewMode==='week'),  borderLeft:`1px solid ${isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.15)'}`, borderRight:`1px solid ${isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.15)'}` }}>Semaine</button>
            <button onClick={()=>setViewMode('month')} style={toggleBtn(viewMode==='month')}>Mois</button>
          </div>

          {/* Bouton RDV */}
          <button onClick={()=>setQuickAddOpen(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'0 14px', height:32, borderRadius:8, background:'#1a73e8', border:'none', cursor:'pointer', boxShadow:'0 2px 6px rgba(26,115,232,0.25)', flexShrink:0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{width:12,height:12}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span style={{ fontSize:12, fontWeight:800, color:'white' }}>RDV</span>
          </button>
        </div>

        {/* Mini-semaine : seulement vue Jour */}
        {viewMode === 'day' && (
          <div style={{ display:'flex', gap:2, marginTop:8 }}>
            {miniWeek.map((d,i)=>{
              const isSel = d.toDateString()===selectedDate.toDateString();
              const isTod = d.toDateString()===today.toDateString();
              return (
                <button key={i} onClick={()=>setSelectedDate(new Date(d))} style={{
                  flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'6px 0', borderRadius:10, border:'none', cursor:'pointer', transition:'all .15s',
                  background: isSel?'#1a73e8':'transparent',
                }}>
                  <span style={{fontSize:9,fontWeight:700,color:isSel?'rgba(255,255,255,.8)':isTod?'#1a73e8':(isDark?'#768390':'#9ca3af')}}>{DAYS_FR[d.getDay()]}</span>
                  <span style={{fontSize:14,fontWeight:800,marginTop:1,color:isSel?'#fff':isTod?'#1a73e8':(isDark?'#e6edf3':'#111')}}>{d.getDate()}</span>
                  {isTod&&!isSel && <div style={{width:4,height:4,borderRadius:'50%',background:'#1a73e8',marginTop:1}} />}
                </button>
              );
            })}
          </div>
        )}

        {/* Stats (vue Jour uniquement) */}
        {viewMode === 'day' && dayAppts.length>0 && (
          <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:8, paddingTop:8, borderTop:`1px solid ${isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'}` }}>
            <span style={{fontSize:12,fontWeight:700,color:t.text}}>{dayAppts.length} RDV</span>
            <span style={{fontSize:12,fontWeight:600,color:'#22c55e'}}>✓ {confirmed} confirmés</span>
            {encaissed>0&&<span style={{fontSize:12,fontWeight:600,color:'#10b981'}}>💰 {encaissed} encaissés</span>}
          </div>
        )}
      </div>

      {/* ── CONTENU : Jour / Semaine / Mois ── */}
      <div style={{ flex:1, overflow:'auto', minHeight:0 }}>
        {viewMode === 'day' && (
          activeEmps.length===0 ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
              <div style={{ textAlign:'center' }}>
                <p style={{ fontSize:32, marginBottom:12 }}>👥</p>
                <p style={{ margin:0, fontSize:14, color:t.muted }}>Aucun employé actif</p>
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', minWidth:activeEmps.length*150+52 }}>
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

              {/* Colonnes employés */}
              {activeEmps.map(emp => {
                const empAppts = dayAppts.filter(a=>a.employee_id===emp.id);
                return (
                  <div key={emp.id} style={{ flex:1, minWidth:140, borderLeft:`1px solid ${isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'}`, display:'flex', flexDirection:'column' }}>
                    <button onClick={()=>onSelectEmployee(emp)} style={{
                      height:56, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'4px 6px', position:'sticky', top:0, zIndex:9, background:isDark?'#0d1117':'#f6f8fa', borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}`, border:'none', cursor:'pointer', transition:'background .15s', flexShrink:0,
                    }}
                    onMouseEnter={e=>e.currentTarget.style.background=isDark?'rgba(17,24,39,0.1)':'rgba(17,24,39,0.06)'}
                    onMouseLeave={e=>e.currentTarget.style.background=isDark?'#0d1117':'#f6f8fa'}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:emp.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:12, fontWeight:800 }}>{emp.name.charAt(0)}</div>
                      <span style={{ fontSize:11, fontWeight:700, marginTop:2, color:isDark?'#adbac7':'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'90%', display:'block' }}>{emp.name.split(' ')[0]}</span>
                      <div style={{ display:'flex', gap:2, marginTop:1 }}>
                        {emp.can_cancel && <div style={{width:4,height:4,borderRadius:'50%',background:'#ef4444'}} />}
                        {emp.can_modify && <div style={{width:4,height:4,borderRadius:'50%',background:'#8b5cf6'}} />}
                        {emp.can_encash && <div style={{width:4,height:4,borderRadius:'50%',background:'#22c55e'}} />}
                      </div>
                    </button>

                    <div style={{ position:'relative', height:HOURS.length*HOUR_H, flex:1 }}>
                      {HOURS.map((_,i)=>(
                        <div key={i} style={{ position:'absolute', left:0, right:0, top:i*HOUR_H, height:HOUR_H, borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.03)'}` }} />
                      ))}
                      {isToday && (() => {
                        const n = new Date();
                        let nowMin = n.getHours()*60 + n.getMinutes();
                        if (nowMin < gridOriginMin) nowMin += 24*60;
                        const relMin = nowMin - gridOriginMin;
                        if (relMin < 0 || relMin > HOURS.length*60) return null;
                        return <div style={{position:'absolute',left:0,right:0,top:(relMin/60)*HOUR_H,height:1.5,background:'rgba(239,68,68,0.6)',zIndex:5}} />;
                      })()}

                      {empAppts.map(appt=>{
                        const {top,height} = getApptStyle(appt);
                        const sc = STATUS_GRID[appt.status]||STATUS_GRID.confirmed;
                        return (
                          <button key={appt.id} onClick={()=>openApptModal(appt)} style={{
                            position:'absolute', left:3, right:3, top, height:Math.max(height,36), borderRadius:12, overflow:'hidden', textAlign:'left', cursor:'pointer', zIndex:2, border:'none',
                            background: isDark ? (emp.avatar_color||'#1a73e8')+'22' : sc.bg,
                            outline: `1.5px solid ${isDark?(emp.avatar_color||'#1a73e8')+'50':sc.bd}`,
                            transition:'transform .12s, box-shadow .12s',
                            boxShadow: isDark?'none':'0 1px 4px rgba(0,0,0,0.06)',
                          }}
                          onMouseEnter={e=>{ e.currentTarget.style.transform='scale(1.01)'; e.currentTarget.style.boxShadow='0 6px 16px rgba(0,0,0,0.14)'; }}
                          onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow=isDark?'none':'0 1px 4px rgba(0,0,0,0.06)'; }}>
                            <div style={{ position:'absolute', left:0, top:0, bottom:0, width:4, background:emp.avatar_color||'#1a73e8', borderRadius:'99px 0 0 99px' }} />
                            <div style={{ paddingLeft:10, paddingRight:6, paddingTop:6 }}>
                              <p style={{ margin:0, fontSize:14, fontWeight:800, color:isDark?(emp.avatar_color||'#e6edf3'):sc.tx, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{appt.client_name}</p>
                              {height>40 && <p style={{ margin:'2px 0 0', fontSize:12, fontWeight:600, color:isDark?'rgba(255,255,255,0.65)':sc.tx, opacity:.9, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fmtTime(appt.start_time)} · {appt.service_name||'RDV'}</p>}
                              {height>65 && <p style={{ margin:'1px 0 0', fontSize:11, color:isDark?'rgba(255,255,255,0.45)':sc.tx, opacity:.7, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fmtTime(appt.end_time)} · {appt.total_duration||appt.duration_minutes}min</p>}
                              {height>80 && appt.paid && <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3 }}><div style={{ width:7, height:7, borderRadius:'50%', background:'#22c55e' }} /><span style={{ fontSize:10, color:'#22c55e', fontWeight:700 }}>Encaissé</span></div>}
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
      </div>

      {/* ── MODAUX ── */}
      {editAppt && (
        <ApptActionModal appt={editAppt} employee={activeEmployee} services={services} theme={t}
          onClose={()=>{ setEditAppt(null); setActiveEmployee(null); }}
          onUpdated={upd=>{ setAllAppts(p=>p.map(a=>a.id===upd.id?{...a,...upd}:a)); setEditAppt(prev=>({...prev,...upd})); showToast('RDV mis a jour ✓'); }}
          onTxCreated={tx=>{ onTxCreated(tx); playSound('caisse', 2); showToast('💰 Encaissé !'); }} />
      )}

      {quickAddOpen && (
        <QuickAddApptModal
          employees={employees}
          services={services}
          theme={t}
          onClose={()=>setQuickAddOpen(false)}
          onSave={async form => {
            const appt = await bookingApi.createEmpAppt(form);
            await loadAppts();
            showToast('RDV créé ✓');
            return appt;
          }}
        />
      )}

      {addOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={()=>setAddOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(6px)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:360, borderRadius:20, overflow:'hidden', background:isDark?'#1c2128':'#fff', border:`1px solid ${isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.07)'}`, boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}` }}>
              <p style={{ margin:0, fontSize:16, fontWeight:800, color:t.text, letterSpacing:'-.3px' }}>Nouveau rendez-vous</p>
              <p style={{ margin:'4px 0 0', fontSize:12, color:t.muted }}>Selectionnez l'employé</p>
            </div>
            <div style={{ padding:12, display:'flex', flexDirection:'column', gap:6 }}>
              {activeEmps.map(emp=>(
                <button key={emp.id} onClick={()=>{ setAddOpen(false); onSelectEmployee(emp); }} style={{
                  display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:14, ...glassCard(isDark), border:'none', cursor:'pointer', textAlign:'left', transition:'background .12s',
                }}
                onMouseEnter={e=>e.currentTarget.style.background=isDark?'rgba(17,24,39,0.1)':'rgba(17,24,39,0.04)'}
                onMouseLeave={e=>e.currentTarget.style.background=isDark?'rgba(255,255,255,0.04)':'#fff'}>
                  <div style={{ width:40, height:40, borderRadius:12, background:emp.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:16, fontWeight:800, flexShrink:0 }}>{emp.name.charAt(0)}</div>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:0, fontSize:13, fontWeight:700, color:t.text }}>{emp.name}</p>
                    <div style={{ display:'flex', gap:4, marginTop:4 }}>
                      {emp.can_cancel && <span style={chip(isDark,'#ef4444')}>✕ Annul.</span>}
                      {emp.can_modify && <span style={chip(isDark,'#8b5cf6')}>✎ Modif.</span>}
                      {emp.can_encash && <span style={chip(isDark,'#22c55e')}>$ Encaiss.</span>}
                    </div>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14,color:t.muted,flexShrink:0}}><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
