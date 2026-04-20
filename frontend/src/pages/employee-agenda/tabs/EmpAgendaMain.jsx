// src/pages/employee-agenda/tabs/EmpAgendaMain.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { bookingApi } from '../../../utils/api';
import { Toast, useToast } from '../../../components/UI';
import { DAYS_FR, MONTHS_FR } from '../constants';
import { svLocal } from '../helpers';
import { glassCard, pillBtn, chip } from '../styles';
import Spin from '../components/Spin';
import ApptCard from '../components/ApptCard';
import ApptActionModal from '../modals/ApptActionModal';
import NewApptModal from '../modals/NewApptModal';
import ClientsTab from './ClientsTab';

export default function EmpAgendaMain({ employee, services, allEmployees, onBack, onTxCreated, theme: t }) {
  const isDark = t.mode === 'dark';
  const [toast, showToast]             = useToast();
  const [weekOffset, setWeekOffset]    = useState(0);
  const [selectedDate, setSelectedDate]= useState(new Date());
  const [allAppts, setAllAppts]        = useState([]);
  const [loading, setLoading]          = useState(false);
  const [detailAppt, setDetailAppt]    = useState(null);
  const [newApptOpen, setNewApptOpen]  = useState(false);
  const [searchQ, setSearchQ]          = useState('');
  const [filterEmpId, setFilterEmpId]  = useState(employee.id);
  const [mainTab, setMainTab]          = useState('agenda');
  const refreshRef = useRef(null);

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate()-((today.getDay()+6)%7)+weekOffset*7);
  const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(startOfWeek); d.setDate(startOfWeek.getDate()+i); return d; });
  const weekFrom = svLocal(weekDays[0]);
  const weekTo   = svLocal(weekDays[6]);

  const loadAppts = useCallback(async() => {
    setLoading(true);
    try {
      if (filterEmpId && filterEmpId!=='all') {
        const data = await bookingApi.getEmployeeAgenda(filterEmpId, {from:weekFrom,to:weekTo});
        setAllAppts(Array.isArray(data?.appointments)?data.appointments:[]);
      } else {
        const data = await bookingApi.getAppointments({from:weekFrom,to:weekTo});
        setAllAppts(Array.isArray(data)?data:[]);
      }
    } catch {} finally { setLoading(false); }
  }, [weekFrom, weekTo, filterEmpId]);

  useEffect(()=>{ loadAppts(); clearInterval(refreshRef.current); refreshRef.current=setInterval(loadAppts,30000); return()=>clearInterval(refreshRef.current); }, [loadAppts]);

  const selStr   = svLocal(selectedDate);
  const dayAppts = allAppts.filter(a=>{
    const d = typeof a.date==='string'?a.date.substring(0,10):'';
    if (d!==selStr) return false;
    if (searchQ.trim()) { const q=searchQ.trim().toLowerCase(); return (a.client_name||'').toLowerCase().includes(q)||(a.client_phone||'').toLowerCase().includes(q)||(a.client_email||'').toLowerCase().includes(q)||(a.id||'').substring(0,8).toLowerCase().includes(q); }
    return true;
  }).sort((a,b)=>a.start_time.localeCompare(b.start_time));

  const dayCounts = {};
  weekDays.forEach(d=>{
    const ds=svLocal(d); const ap=allAppts.filter(a=>a.date?.substring(0,10)===ds);
    dayCounts[ds]={total:ap.length,paid:ap.filter(a=>a.paid).length};
  });

  const todayStats = dayCounts[selStr]||{total:0,paid:0};

  return (
    <div style={{ background:t.bg, minHeight:'100vh', paddingBottom:96 }} className='lg:pb-8'>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* ── HEADER ── */}
      <div style={{ padding:'16px 16px 0', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={onBack} style={{ width:36, height:36, borderRadius:10, ...glassCard(isDark), border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14,color:t.muted}}><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <div style={{ width:40, height:40, borderRadius:12, background:employee.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:18, fontWeight:800, flexShrink:0 }}>{employee.name.charAt(0)}</div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <p style={{ margin:0, fontSize:16, fontWeight:800, color:t.text, letterSpacing:'-.3px' }}>{employee.name}</p>
            {loading && <Spin size={14} />}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
            {employee.can_cancel && <span style={chip(isDark,'#ef4444')}>✕</span>}
            {employee.can_modify && <span style={chip(isDark,'#8b5cf6')}>✎</span>}
            {employee.can_encash && <span style={chip(isDark,'#22c55e')}>$</span>}
            {!employee.can_cancel&&!employee.can_modify&&!employee.can_encash && <span style={chip(isDark,isDark?'#64748b':'#94a3b8')}>👁</span>}
          </div>
        </div>

        <button onClick={()=>setNewApptOpen(true)}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10, background:'#1a73e8', color:'#fff', fontSize:12, fontWeight:700, border:'none', cursor:'pointer', flexShrink:0, boxShadow:'0 4px 12px rgba(17,24,39,0.3)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{width:12,height:12}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          RDV
        </button>
      </div>

      {/* ── TABS ── */}
      <div style={{ padding:'12px 16px 0' }}>
        <div style={{ display:'flex', gap:2, background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)', borderRadius:12, padding:3 }}>
          {[{id:'agenda',label:'Mon agenda',icon:'📅'},{id:'clients',label:'Clients & Notes',icon:'👥'}].map(tb=>(
            <button key={tb.id} onClick={()=>setMainTab(tb.id)} style={{
              flex:1, padding:'9px 8px', borderRadius:10, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, transition:'all .15s',
              background:mainTab===tb.id?(isDark?'rgba(17,24,39,0.25)':'#fff'):'transparent',
              color:mainTab===tb.id?'#111827':(isDark?'rgba(255,255,255,0.4)':'#9ca3af'),
              boxShadow:mainTab===tb.id?'0 1px 4px rgba(0,0,0,0.08)':'none',
            }}>
              {tb.icon} {tb.label}
            </button>
          ))}
        </div>
      </div>

      {mainTab === 'agenda' && (
        <>
          {/* ── CALENDRIER SEMAINE ── */}
          <div style={{ padding:'12px 16px 0' }}>
            <div style={{ ...glassCard(isDark), padding:14 }}>
              {/* Nav mois */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <button onClick={()=>setWeekOffset(w=>w-1)} style={{ width:32, height:32, borderRadius:9, background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:13,height:13,color:t.muted}}><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div style={{ textAlign:'center' }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:700, color:t.text }}>{MONTHS_FR[weekDays[0].getMonth()]} {weekDays[0].getFullYear()}</p>
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <button onClick={()=>{ setSelectedDate(new Date()); setWeekOffset(0); }} style={{ padding:'4px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(17,24,39,0.1)', color:'#111827', border:'none', cursor:'pointer' }}>Auj.</button>
                  <button onClick={()=>setWeekOffset(w=>w+1)} style={{ width:32, height:32, borderRadius:9, background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:13,height:13,color:t.muted}}><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              </div>

              {/* Jours */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
                {weekDays.map((d,i)=>{
                  const ds   = svLocal(d);
                  const info = dayCounts[ds]||{total:0,paid:0};
                  const isT  = d.toDateString()===today.toDateString();
                  const isSel= d.toDateString()===selectedDate.toDateString();
                  return (
                    <button key={i} onClick={()=>setSelectedDate(new Date(d))} style={{
                      display:'flex', flexDirection:'column', alignItems:'center', padding:'8px 0', borderRadius:12, cursor:'pointer', border:'none', transition:'all .15s',
                      background: isSel?'linear-gradient(135deg,#111827,#8b5cf6)': isT?(isDark?'rgba(17,24,39,0.15)':'rgba(17,24,39,0.08)'):'transparent',
                    }}>
                      <span style={{ fontSize:9, fontWeight:700, color:isSel?'rgba(255,255,255,0.7)':(isT?'#111827':t.muted) }}>{DAYS_FR[d.getDay()]}</span>
                      <span style={{ fontSize:16, fontWeight:800, marginTop:2, color:isSel?'#fff':(isT?'#111827':t.text) }}>{d.getDate()}</span>
                      {info.total>0 ? (
                        <div style={{ display:'flex', alignItems:'center', gap:2, marginTop:2 }}>
                          <span style={{ fontSize:9, fontWeight:800, padding:'1px 5px', borderRadius:99, background:isSel?'rgba(255,255,255,0.2)':'rgba(17,24,39,0.12)', color:isSel?'#fff':'#111827' }}>{info.total}</span>
                          {info.paid>0 && <span style={{ width:5, height:5, borderRadius:'50%', background:'#22c55e', flexShrink:0 }} />}
                        </div>
                      ) : <div style={{height:14}} />}
                    </button>
                  );
                })}
              </div>

              {/* Légende */}
              <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:8, paddingTop:8, borderTop:`1px solid ${t.border}` }}>
                <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:7,height:7,borderRadius:'50%',background:'#111827'}}/><span style={{fontSize:10,color:t.muted}}>RDV</span></div>
                <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:7,height:7,borderRadius:'50%',background:'#22c55e'}}/><span style={{fontSize:10,color:t.muted}}>Encaissé</span></div>
              </div>
            </div>
          </div>

          {/* ── STATS RAPIDES ── */}
          {todayStats.total > 0 && (
            <div style={{ padding:'10px 16px 0' }}>
              <div style={{ display:'flex', gap:8 }}>
                <div style={{ flex:1, ...glassCard(isDark), padding:'10px 14px' }}>
                  <p style={{ margin:0, fontSize:10, fontWeight:700, color:t.muted, textTransform:'uppercase' }}>RDV du jour</p>
                  <p style={{ margin:'4px 0 0', fontSize:22, fontWeight:800, color:t.text, letterSpacing:'-.5px' }}>{todayStats.total}</p>
                </div>
                <div style={{ flex:1, ...glassCard(isDark), padding:'10px 14px' }}>
                  <p style={{ margin:0, fontSize:10, fontWeight:700, color:t.muted, textTransform:'uppercase' }}>Encaissés</p>
                  <p style={{ margin:'4px 0 0', fontSize:22, fontWeight:800, color:'#16a34a', letterSpacing:'-.5px' }}>{todayStats.paid}</p>
                </div>
                <div style={{ flex:1, ...glassCard(isDark), padding:'10px 14px' }}>
                  <p style={{ margin:0, fontSize:10, fontWeight:700, color:t.muted, textTransform:'uppercase' }}>Restants</p>
                  <p style={{ margin:'4px 0 0', fontSize:22, fontWeight:800, color:'#f59e0b', letterSpacing:'-.5px' }}>{todayStats.total-todayStats.paid}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── FILTRES + RECHERCHE ── */}
          <div style={{ padding:'10px 16px 0', display:'flex', flexDirection:'column', gap:8 }}>
            {allEmployees.length > 1 && (
              <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
                <button onClick={()=>setFilterEmpId(employee.id)} style={pillBtn(filterEmpId===employee.id,isDark)}>Mes RDV</button>
                {allEmployees.filter(e=>e.is_active!==false).map(emp=>(
                  <button key={emp.id} onClick={()=>setFilterEmpId(emp.id===filterEmpId&&emp.id!==employee.id?employee.id:emp.id)}
                    style={{ ...pillBtn(filterEmpId===emp.id,isDark), display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:16, height:16, borderRadius:'50%', background:emp.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:8, fontWeight:800 }}>{emp.name.charAt(0)}</div>
                    {emp.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
            <div style={{ position:'relative' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:14, height:14, position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:t.dim, pointerEvents:'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Nom, téléphone, email, n° réservation…"
                style={{ width:'100%', padding:'10px 36px', borderRadius:10, background:isDark?'rgba(255,255,255,0.05)':'#f4f4f6', border:`1px solid ${searchQ?'rgba(17,24,39,0.3)':t.border}`, color:t.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              {searchQ && <button onClick={()=>setSearchQ('')} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:t.muted, cursor:'pointer', fontSize:14 }}>✕</button>}
            </div>
          </div>

          {/* ── LISTE DU JOUR ── */}
          <div style={{ padding:'12px 16px 0' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <div>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color:t.text }}>
                  {selectedDate.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}
                </p>
                <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>{dayAppts.length} rendez-vous</p>
              </div>
              <button onClick={loadAppts} style={{ width:32, height:32, borderRadius:9, background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:t.muted }}>↻</button>
            </div>

            {dayAppts.length===0 ? (
              <div style={{ padding:'40px 20px', textAlign:'center', ...glassCard(isDark) }}>
                <div style={{ fontSize:32, marginBottom:12 }}>📅</div>
                <p style={{ margin:0, fontSize:14, fontWeight:600, color:t.muted }}>{searchQ?'Aucun resultat':'Aucun rendez-vous ce jour'}</p>
                {!searchQ && <button onClick={()=>setNewApptOpen(true)} style={{ marginTop:12, padding:'8px 16px', borderRadius:99, background:'rgba(17,24,39,0.1)', color:'#111827', border:'none', cursor:'pointer', fontSize:12, fontWeight:700 }}>+ Créer un RDV</button>}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {dayAppts.map((a,i) => <div key={a.id} style={{ animation:`fadeUp .2s ease ${i*.05}s both` }}><ApptCard appt={a} theme={t} onClick={setDetailAppt} /></div>)}
              </div>
            )}
          </div>
        </>
      )}

      {mainTab === 'clients' && <ClientsTab employee={employee} theme={t} />}

      {detailAppt && (
        <ApptActionModal appt={detailAppt} employee={employee} services={services} theme={t}
          onClose={()=>setDetailAppt(null)}
          onUpdated={upd=>{ setAllAppts(p=>p.map(a=>a.id===upd.id?{...a,...upd}:a)); setDetailAppt(prev=>({...prev,...upd})); showToast('RDV mis a jour ✓'); }}
          onTxCreated={tx=>{ onTxCreated(tx); showToast('💰 Encaissé ! Ajoute a la caisse.'); }} />
      )}

      {newApptOpen && (
        <NewApptModal empId={employee.id} services={services} theme={t} onClose={()=>setNewApptOpen(false)}
          onSave={async form=>{ await bookingApi.createEmpAppt(form); await loadAppts(); showToast('RDV crée ✓'); }} />
      )}
    </div>
  );
}
