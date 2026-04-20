// src/pages/employee-agenda/components/MultiColumnAgenda.jsx
import { useState, useEffect, useCallback } from 'react';
import { bookingApi } from '../../../utils/api';
import { playSound } from '../../../hooks/useNotifications';
import { Toast, useToast } from '../../../components/UI';
import { DAYS_FR, MONTHS_SH, STATUS_GRID } from '../constants';
import { fmtTime, svLocal } from '../helpers';
import { glassCard, chip } from '../styles';
import Spin from './Spin';
import ApptActionModal from '../modals/ApptActionModal';
import QuickAddApptModal from '../modals/QuickAddApptModal';

export default function MultiColumnAgenda({ employees, services, onTxCreated, onSelectEmployee, theme: t }) {
  const isDark = t.mode === 'dark';
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [allAppts, setAllAppts]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [editAppt, setEditAppt]         = useState(null);
  const [activeEmployee, setActiveEmployee] = useState(null);
  const [addOpen, setAddOpen]           = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [toast, showToast]              = useToast();
  // Horaires du commerce chargés depuis l'API
  const [gridStartMin, setGridStartMin] = useState(8*60);  // 08:00 par défaut
  const [gridEndMin,   setGridEndMin]   = useState(20*60); // 20:00 par défaut

  const dateStr = svLocal(selectedDate);

  // Charger les horaires du commerce au montage
  useEffect(() => {
    bookingApi.getHours().then(hrs => {
      if (!hrs || !hrs.length) return;
      const open = hrs.filter(h => h.is_open !== false);
      if (!open.length) return;
      // Convertir "HH:MM:SS" ou "HH:MM" en minutes
      const parseT = t => {
        const parts = String(t||'0').split(':').map(Number);
        return (parts[0]||0)*60 + (parts[1]||0);
      };
      const allOpen  = open.map(h => parseT(h.open_time));
      let minOpen  = Math.min(...allOpen);
      let maxClose;
      // Gérer minuit : si close_time < open_time (ex: 10h→02h), ajouter 24h
      const adjustedClose = open.map(h => {
        const o = parseT(h.open_time); const c = parseT(h.close_time);
        return c < o ? c + 24*60 : c;
      });
      maxClose = Math.max(...adjustedClose);
      // Ajouter 30min de marge de chaque côté, sans dépasser 0h-47h59
      setGridStartMin(Math.max(0, minOpen - 30));
      setGridEndMin(maxClose + 30);
    }).catch(() => {});
  }, []);

  const loadAppts = useCallback(async() => {
    setLoading(true);
    try { const data = await bookingApi.getAppointments({from:dateStr,to:dateStr}); setAllAppts(Array.isArray(data)?data:[]); }
    catch {} finally { setLoading(false); }
  }, [dateStr]);

  useEffect(()=>{ loadAppts(); }, [loadAppts]);

  const today    = new Date();
  const weekStart = new Date(today); weekStart.setDate(today.getDate()-today.getDay()+1);
  const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(weekStart); d.setDate(weekStart.getDate()+i); return d; });
  const activeEmps = employees.filter(e=>e.is_active!==false && e.show_in_caisse!==false);

  const HOUR_H = 120;

  // Générer la liste des heures à afficher (en minutes depuis minuit, peut dépasser 1440 pour passage minuit)
  const HOURS = (() => {
    const list = [];
    // On arrondit au début de l'heure
    const start = Math.floor(gridStartMin / 60) * 60;
    const end   = Math.ceil(gridEndMin / 60) * 60;
    for (let m = start; m < end; m += 60) list.push(m);
    return list; // ex: [600, 660, 720, ..., 1380, 1440] pour 10h→01h (lendemain)
  })();

  const gridOriginMin = HOURS[0] || 0;   // heure de départ de la grille en minutes

  const getApptStyle = appt => {
    const parseT = s => { const p = String(s||'0:0').split(':').map(Number); return p[0]*60+(p[1]||0); };
    let startM = parseT(appt.start_time);
    let endM   = parseT(appt.end_time || appt.start_time);
    // Si passage minuit : si endM < startM, ajouter 24h à endM
    if (endM < startM) endM += 24 * 60;
    // Si l'heure est avant l'origine de la grille (cas nocturne : ex: RDV à 01h affiché après minuit)
    // On vérifie si startM + 24h est dans la plage
    let relStart = startM - gridOriginMin;
    if (relStart < 0) relStart += 24 * 60; // RDV "lendemain matin" dans plage nocturne
    const top    = (relStart / 60) * HOUR_H;
    const height = ((endM - startM) / 60) * HOUR_H;
    return { top: Math.max(0, top), height: Math.max(22, height) };
  };

  const openApptModal = appt => {
    const emp = employees.find(e=>e.id===appt.employee_id)||null;
    setActiveEmployee(emp); setEditAppt(appt);
  };

  const navigateDay = d => setSelectedDate(prev=>{ const n=new Date(prev); n.setDate(n.getDate()+d); return n; });
  const isToday = selectedDate.toDateString()===today.toDateString();
  const fmtDay  = d => `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_SH[d.getMonth()]}`;

  // stats rapides
  const confirmed = allAppts.filter(a=>a.status==='confirmed').length;
  const encaissed = allAppts.filter(a=>a.paid).length;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:isDark?'#0d1117':'#f6f8fa', overflow:'hidden' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* ── HEADER ── */}
      <div style={{ padding:'12px 16px 8px', background:isDark?'#0d1117':'#f6f8fa', flexShrink:0, borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}` }}>
        {/* Navigation date */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          {/* Bouton semaine précédente */}
          <button onClick={()=>{ const d=new Date(selectedDate); d.setDate(d.getDate()-7); setSelectedDate(d); }}
            style={{ width:36, height:36, borderRadius:9, ...glassCard(isDark), border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, gap:0 }}
            title="Semaine précédente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:12,height:12,color:t.muted}}><polyline points="15 18 9 12 15 6"/></svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:12,height:12,color:t.muted,marginLeft:-4}}><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button onClick={()=>navigateDay(-1)} style={{ width:32, height:32, borderRadius:9, ...glassCard(isDark), border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:13,height:13,color:t.muted}}><polyline points="15 18 9 12 15 6"/></svg>
          </button>

          <button onClick={()=>setSelectedDate(new Date())} style={{ flex:1, textAlign:'center', background:'none', border:'none', cursor:'pointer', fontSize:14, fontWeight:700, color:isToday?'#1a73e8':t.text, letterSpacing:'-.3px' }}>
            {isToday ? "Aujourd'hui" : fmtDay(selectedDate)}
          </button>

          <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
            {loading && <Spin size={14} />}
            <button onClick={()=>navigateDay(1)} style={{ width:32, height:32, borderRadius:9, ...glassCard(isDark), border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:13,height:13,color:t.muted}}><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            {/* Bouton semaine suivante */}
            <button onClick={()=>{ const d=new Date(selectedDate); d.setDate(d.getDate()+7); setSelectedDate(d); }}
              style={{ width:36, height:36, borderRadius:9, ...glassCard(isDark), border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:0 }}
              title="Semaine suivante">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:12,height:12,color:t.muted}}><polyline points="9 18 15 12 9 6"/></svg>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:12,height:12,color:t.muted,marginLeft:-4}}><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button onClick={()=>setQuickAddOpen(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'0 14px', height:36, borderRadius:9, background:'#1a73e8', border:'none', cursor:'pointer', boxShadow:'0 4px 12px rgba(26,115,232,0.3)', flexShrink:0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{width:12,height:12}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span style={{ fontSize:12, fontWeight:800, color:'white' }}>RDV</span>
            </button>
          </div>
        </div>

        {/* Mini semaine */}
        <div style={{ display:'flex', gap:2 }}>
          {weekDays.map((d,i)=>{
            const isSel = d.toDateString()===selectedDate.toDateString();
            const isTod = d.toDateString()===today.toDateString();
            return (
              <button key={i} onClick={()=>setSelectedDate(new Date(d))} style={{
                flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'6px 0', borderRadius:10, border:'none', cursor:'pointer', transition:'all .15s',
                background: isSel?'#111827':'transparent',
              }}>
                <span style={{fontSize:9,fontWeight:700,color:isSel?'rgba(255,255,255,.7)':isTod?'#111827':(isDark?'#768390':'#9ca3af')}}>{DAYS_FR[d.getDay()]}</span>
                <span style={{fontSize:14,fontWeight:800,marginTop:1,color:isSel?'#fff':isTod?'#111827':(isDark?'#e6edf3':'#111')}}>{d.getDate()}</span>
                {isTod&&!isSel && <div style={{width:4,height:4,borderRadius:'50%',background:'#111827',marginTop:1}} />}
              </button>
            );
          })}
        </div>

        {/* Stats ligne */}
        {allAppts.length>0 && (
          <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:8, paddingTop:8, borderTop:`1px solid ${isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'}` }}>
            <span style={{fontSize:12,fontWeight:700,color:t.text}}>{allAppts.length} RDV</span>
            <span style={{fontSize:12,fontWeight:600,color:'#22c55e'}}>✓ {confirmed} confirmés</span>
            {encaissed>0&&<span style={{fontSize:12,fontWeight:600,color:'#10b981'}}>💰 {encaissed} encaissés</span>}
          </div>
        )}
      </div>

      {/* ── GRILLE HORAIRE ── */}
      <div style={{ flex:1, overflow:'auto', minHeight:0 }}>
        {activeEmps.length===0 ? (
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
                const hNum = Math.floor(hMin / 60) % 24; // heure réelle 0-23
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
              const empAppts = allAppts.filter(a=>a.employee_id===emp.id);
              return (
                <div key={emp.id} style={{ flex:1, minWidth:140, borderLeft:`1px solid ${isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'}`, display:'flex', flexDirection:'column' }}>

                  {/* Header employé — cliquable */}
                  <button onClick={()=>onSelectEmployee(emp)} style={{
                    height:56, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'4px 6px', position:'sticky', top:0, zIndex:9, background:isDark?'#0d1117':'#f6f8fa', borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}`, border:'none', cursor:'pointer', transition:'background .15s', flexShrink:0,
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background=isDark?'rgba(17,24,39,0.1)':'rgba(17,24,39,0.06)'}
                  onMouseLeave={e=>e.currentTarget.style.background=isDark?'#0d1117':'#f6f8fa'}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:emp.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:12, fontWeight:800 }}>{emp.name.charAt(0)}</div>
                    <span style={{ fontSize:11, fontWeight:700, marginTop:2, color:isDark?'#adbac7':'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'90%', display:'block' }}>{emp.name.split(' ')[0]}</span>
                    {/* Dots droits */}
                    <div style={{ display:'flex', gap:2, marginTop:1 }}>
                      {emp.can_cancel && <div style={{width:4,height:4,borderRadius:'50%',background:'#ef4444'}} />}
                      {emp.can_modify && <div style={{width:4,height:4,borderRadius:'50%',background:'#8b5cf6'}} />}
                      {emp.can_encash && <div style={{width:4,height:4,borderRadius:'50%',background:'#22c55e'}} />}
                    </div>
                  </button>

                  {/* Zone horaires */}
                  <div style={{ position:'relative', height:HOURS.length*HOUR_H, flex:1 }}>
                    {HOURS.map((_,i)=>(
                      <div key={i} style={{ position:'absolute', left:0, right:0, top:i*HOUR_H, height:HOUR_H, borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.03)'}` }} />
                    ))}
                    {/* Ligne "maintenant" */}
                    {isToday && (() => {
                      const n = new Date();
                      let nowMin = n.getHours()*60 + n.getMinutes();
                      // Si nowMin < gridOriginMin, tenter +24h (plage nocturne passant minuit)
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
                          {/* Barre gauche */}
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
        )}
      </div>

      {/* ── MODAUX ── */}
      {editAppt && (
        <ApptActionModal appt={editAppt} employee={activeEmployee} services={services} theme={t}
          onClose={()=>{ setEditAppt(null); setActiveEmployee(null); }}
          onUpdated={upd=>{ setAllAppts(p=>p.map(a=>a.id===upd.id?{...a,...upd}:a)); setEditAppt(prev=>({...prev,...upd})); showToast('RDV mis a jour ✓'); }}
          onTxCreated={tx=>{ onTxCreated(tx); playSound('caisse', 2); showToast('💰 Encaissé !'); }} />
      )}

      {/* Modal ajout — choix employé */}
      {/* QuickAddApptModal — création RDV complète */}
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
