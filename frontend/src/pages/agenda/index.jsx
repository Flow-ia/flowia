import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { bookingApi } from '../../utils/api';
import { useTheme } from '../../hooks/useTheme';
import { Toast, useToast } from '../../components/UI';
import { DAYS_FR, MONTHS_FR } from './constants';
import { toMin, fromMin, svLocal, fmtDateL } from './helpers';
import ApptModal from './modals/ApptModal';
import AddApptModal from './modals/AddApptModal';
import ServiceModal from './modals/ServiceModal';
import DisplaySettingsPanel from './components/DisplaySettingsPanel';
import GridView from './components/GridView';
import ApptListCard from './components/ApptListCard';
import ConfigTab from './tabs/ConfigTab';

export default function Agenda({ employees=[], categories=[], theme: themeProp, onTxCreated }) {
  const { theme }  = useTheme();
  const t          = themeProp || theme;
  const isDark     = t.mode === 'dark';
  const [toast, showToast] = useToast();
  const location   = useLocation();
  const navigate   = useNavigate();

  // Quand Agenda est rendu sous /settings/agenda/*, le 3e segment pilote l'onglet
  const isInSettings = location.pathname.startsWith('/settings/agenda');
  const agendaSegment = isInSettings
    ? location.pathname.replace(/^\/settings\/agenda\/?/, '').split('/')[0] || ''
    : '';
  const AGENDA_TAB_MAP = { '': 'calendar', 'config': 'config' };
  const AGENDA_URL_MAP = { calendar: '/settings/agenda', config: '/settings/agenda/config' };

  /* ── State global ── */
  const [_mainTab, _setMainTab]         = useState('calendar');
  const mainTab    = isInSettings ? (AGENDA_TAB_MAP[agendaSegment] ?? 'calendar') : _mainTab;
  const setMainTab = isInSettings
    ? (id) => navigate(AGENDA_URL_MAP[id] || '/settings/agenda', { replace: false })
    : _setMainTab;
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [allAppts, setAllAppts]         = useState([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [services, setServices]         = useState([]);
  const [svcDragOver, setSvcDragOver]   = useState(null);
  const svcDragId = useRef(null); // useRef pour éviter stale closure dans onDrop
  const [settings, setSettings]         = useState(null);
  const [businessHours, setBusinessHours] = useState([]);
  const [bizBreaks, setBizBreaks]         = useState([]);
  const [closedDays, setClosedDays]     = useState([]);
  const [loading, setLoading]           = useState(true);

  /* ── Période : 'day' | 'week' | 'month' | 'custom' ── */
  const [periodMode, setPeriodMode]     = useState('week');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [customFrom, setCustomFrom]     = useState('');
  const [customTo, setCustomTo]         = useState('');

  /* ── State modaux ── */
  const [editAppt, setEditAppt]         = useState(null);
  const [addApptOpen, setAddApptOpen]   = useState(false);
  const [svcModal, setSvcModal]         = useState(false);
  const [editSvc, setEditSvc]           = useState(null);

  /* ── Filtres ── */
  const [filterEmp, setFilterEmp]       = useState('');
  const [searchQ, setSearchQ]           = useState('');

  /* ── Config affichage ── */
  const [displayCfg, setDisplayCfg]     = useState({ viewMode:'grid', startHour:'08:00', endHour:'20:00', hourH:64 });
  const updateDisplay = (k,v) => setDisplayCfg(p=>({...p,[k]:v}));

  const refreshRef = useRef(null);

  /* Horaires → mettre à jour startHour/endHour auto selon le commerce */
  const syncDisplayFromHours = useCallback((hrs) => {
    const openDays = hrs.filter(h=>h.is_open!==false);
    if (!openDays.length) return;
    const minOpen  = Math.min(...openDays.map(h=>toMin(h.open_time||'08:00')));
    const maxClose = Math.max(...openDays.map(h=>toMin(h.close_time||'20:00')));
    setDisplayCfg(p=>({
      ...p,
      startHour: fromMin(Math.max(0, minOpen-60)),
      endHour:   fromMin(Math.min(24*60, maxClose+30)%(24*60)||maxClose+30),
    }));
  }, []);

  /* Chargement initial */
  useEffect(() => {
    Promise.all([bookingApi.getSettings(), bookingApi.getServices(), bookingApi.getHours(), bookingApi.getBreaks()])
      .then(([s,sv,h,b]) => {
        setSettings(s.settings);
        setServices(sv);
        const hrs = h.length ? h : Array.from({length:7},(_,i)=>({day_of_week:i,open_time:'09:00',close_time:'18:00',is_open:i>=1&&i<=5}));
        setBusinessHours(hrs);
        setBizBreaks(Array.isArray(b)?b:[]);
        setClosedDays(hrs.filter(x=>!x.is_open).map(x=>x.day_of_week));
        syncDisplayFromHours(hrs);
      })
      .finally(()=>setLoading(false));
  }, []);

  /* ── Calcul de la plage de dates selon la période ── */
  const today = useMemo(()=>new Date(),[]);

  const { periodFrom, periodTo, weekDays, periodLabel } = useMemo(()=>{
    const base = new Date(today);

    if (periodMode==='day') {
      const d = new Date(base);
      d.setDate(d.getDate()+periodOffset);
      const s = svLocal(d);
      return { periodFrom:s, periodTo:s, weekDays:[d], periodLabel:d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) };
    }

    if (periodMode==='week') {
      const start = new Date(base);
      start.setDate(base.getDate()-((base.getDay()+6)%7)+periodOffset*7);
      const days = Array.from({length:7},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d; });
      const mo = days[0].getMonth(); const yr = days[0].getFullYear();
      const sameMo = days[6].getMonth()===mo;
      const lbl = sameMo
        ? `${days[0].getDate()} - ${days[6].getDate()} ${MONTHS_FR[mo]} ${yr}`
        : `${days[0].getDate()} ${MONTHS_FR[mo]} - ${days[6].getDate()} ${MONTHS_FR[days[6].getMonth()]} ${yr}`;
      return { periodFrom:svLocal(days[0]), periodTo:svLocal(days[6]), weekDays:days, periodLabel:lbl };
    }

    if (periodMode==='month') {
      const yr  = base.getFullYear();
      const mo  = ((base.getMonth()+periodOffset)%12+12)%12;
      const yrAdj = yr + Math.floor((base.getMonth()+periodOffset)/12);
      const first = new Date(yrAdj,mo,1);
      const last  = new Date(yrAdj,mo+1,0);
      const days = Array.from({length:last.getDate()},(_,i)=>new Date(yrAdj,mo,i+1));
      return { periodFrom:svLocal(first), periodTo:svLocal(last), weekDays:days, periodLabel:`${MONTHS_FR[mo]} ${yrAdj}` };
    }

    // custom
    if (customFrom&&customTo) {
      const f = new Date(customFrom); const to2 = new Date(customTo);
      const days = [];
      for (let d=new Date(f); d<=to2; d.setDate(d.getDate()+1)) days.push(new Date(d));
      return { periodFrom:customFrom, periodTo:customTo, weekDays:days, periodLabel:`${customFrom} → ${customTo}` };
    }
    return { periodFrom:svLocal(base), periodTo:svLocal(base), weekDays:[base], periodLabel:'Personnalise' };
  },[today,periodMode,periodOffset,customFrom,customTo]);

  /* Semaine affichée dans le mini-calendrier (toujours 7 jours) */
  const calWeekDays = useMemo(()=>{
    if (periodMode==='week') return weekDays;
    // Pour day/month/custom : afficher la semaine de la date sélectionnée
    const start = new Date(selectedDate);
    start.setDate(start.getDate()-((start.getDay()+6)%7));
    return Array.from({length:7},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d; });
  },[periodMode,weekDays,selectedDate]);

  /* Chargement RDV */
  const loadAppts = useCallback(async()=>{
    if (!periodFrom||!periodTo) return;
    setLoadingAppts(true);
    try {
      const data = await bookingApi.getAppointments({from:periodFrom,to:periodTo});
      setAllAppts(Array.isArray(data)?data:[]);
    } catch {} finally { setLoadingAppts(false); }
  },[periodFrom,periodTo]);

  useEffect(()=>{
    loadAppts();
    clearInterval(refreshRef.current);
    refreshRef.current = setInterval(loadAppts,30000);
    return ()=>clearInterval(refreshRef.current);
  },[loadAppts]);

  /* RDV filtrés pour le jour sélectionné */
  const selStr   = svLocal(selectedDate);
  const dayAppts = useMemo(()=>allAppts.filter(a=>{
    const d = typeof a.date==='string' ? a.date.substring(0,10) : '';
    if (d!==selStr) return false;
    if (filterEmp && a.employee_id!==filterEmp) return false;
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      return (a.client_name||'').toLowerCase().includes(q)
          || (a.client_phone||'').toLowerCase().includes(q)
          || (a.client_email||'').toLowerCase().includes(q)
          || (a.id||'').substring(0,8).toLowerCase().includes(q);
    }
    return true;
  }).sort((a,b)=>a.start_time.localeCompare(b.start_time)),[allAppts,selStr,filterEmp,searchQ]);

  /* RDV de toute la période filtrés (pour vue liste période) */
  const periodAppts = useMemo(()=>allAppts.filter(a=>{
    if (filterEmp && a.employee_id!==filterEmp) return false;
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      return (a.client_name||'').toLowerCase().includes(q)
          || (a.client_phone||'').toLowerCase().includes(q)
          || (a.client_email||'').toLowerCase().includes(q)
          || (a.id||'').substring(0,8).toLowerCase().includes(q);
    }
    return true;
  }).sort((a,b)=>a.date===b.date?a.start_time.localeCompare(b.start_time):a.date.localeCompare(b.date)),[allAppts,filterEmp,searchQ]);

  /* Compteur RDV par jour */
  const dayCounts = useMemo(()=>{
    const m={};
    (periodMode==='week'?weekDays:calWeekDays).forEach(d=>{ const s=svLocal(d); const l=allAppts.filter(a=>a.date?.substring(0,10)===s); m[s]={total:l.length,paid:l.filter(a=>a.paid).length}; });
    return m;
  },[periodMode,weekDays,calWeekDays,allAppts]);

  /* callbacks mise à jour */
  const onApptUpdated = useCallback(upd=>{ setAllAppts(p=>p.map(a=>a.id===upd.id?{...a,...upd}:a)); showToast('RDV mis a jour ✓'); },[]);
  const onApptDeleted = useCallback(id =>{ setAllAppts(p=>p.filter(a=>a.id!==id)); showToast('RDV supprime'); },[]);

  // La sous-page "Config" a été déplacée dans /settings/categories/booking
  const MAIN_TABS = [
    {id:'calendar',label:'Agenda',  icon:'📅'},
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor:'rgba(17,24,39,0.2)', borderTopColor:'#111827' }} />
    </div>
  );

  return (
    <div className="space-y-0 flex flex-col lg:min-h-screen" style={{ minHeight:'calc(100vh - 80px)', background:t.bg, paddingBottom:0 }}>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* Tabs navigation — masquée tant qu'il n'y a qu'un seul onglet */}
      {MAIN_TABS.length > 1 && (
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="flex gap-1 p-1 rounded-2xl" style={{ background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)' }}>
            {MAIN_TABS.map(tb=>(
              <button key={tb.id} onClick={()=>setMainTab(tb.id)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
                style={{ background:mainTab===tb.id?'#111827':'transparent', color:mainTab===tb.id?'white':t.muted }}>
                <span className="hidden sm:inline">{tb.icon} </span>{tb.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ CALENDRIER ══ */}
      {mainTab === 'calendar' && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="px-4 pb-2 flex-shrink-0 space-y-2">

            {/* ── SÉLECTEUR DE PÉRIODE ── */}
            <div className="rounded-2xl overflow-hidden" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>

              {/* Ligne 1 : modes période */}
              <div className="flex gap-0 border-b" style={{ borderColor:t.border }}>
                {[{id:'day',label:'Jour'},{id:'week',label:'Semaine'},{id:'month',label:'Mois'},{id:'custom',label:'Perso'}].map((m,i,arr)=>(
                  <button key={m.id} onClick={()=>{ setPeriodMode(m.id); setPeriodOffset(0); }}
                    className="flex-1 py-2 text-xs font-bold transition-all"
                    style={{
                      background: periodMode===m.id ? '#111827' : 'transparent',
                      color: periodMode===m.id ? 'white' : t.muted,
                      borderRight: i<arr.length-1 ? `1px solid ${t.border}` : 'none',
                    }}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Ligne 2 : navigation ◀ label ▶ + Aujourd'hui */}
              {periodMode !== 'custom' && (
                <div className="flex items-center justify-between px-3 py-2">
                  <button onClick={()=>setPeriodOffset(o=>o-1)}
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4" style={{ color:t.muted }}><polyline points="15 18 9 12 15 6"/></svg>
                  </button>

                  <div className="flex-1 flex items-center justify-center gap-2">
                    <span className="text-sm font-black text-center" style={{ color:t.text }}>{periodLabel}</span>
                    {loadingAppts&&<span className="w-3 h-3 rounded-full border border-t-transparent animate-spin inline-block" style={{ borderColor:'rgba(17,24,39,0.3)', borderTopColor:'#111827' }} />}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={()=>{ setPeriodOffset(0); setSelectedDate(new Date()); }}
                      className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl"
                      style={{ background:'rgba(17,24,39,0.1)', color:'#111827' }}>
                      Auj.
                    </button>
                    <button onClick={()=>setPeriodOffset(o=>o+1)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4" style={{ color:t.muted }}><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Plage personnalisée */}
              {periodMode === 'custom' && (
                <div className="flex items-center gap-2 px-3 py-2">
                  <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}
                    className="flex-1 px-2 py-2 rounded-xl text-xs focus:outline-none"
                    style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
                  <span className="text-xs font-bold" style={{ color:t.muted }}>→</span>
                  <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}
                    className="flex-1 px-2 py-2 rounded-xl text-xs focus:outline-none"
                    style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
                  {loadingAppts&&<span className="w-3 h-3 rounded-full border border-t-transparent animate-spin flex-shrink-0" style={{ borderColor:'rgba(17,24,39,0.3)', borderTopColor:'#111827' }} />}
                </div>
              )}

              {/* Mini-calendrier semaine (sauf mode mois) */}
              {periodMode !== 'month' && (
                <div className="px-3 pb-2">
                  <div className="grid grid-cols-7 gap-0.5">
                    {calWeekDays.map((d,i)=>{
                      const ds  = svLocal(d);
                      const info = dayCounts[ds]||{total:0,paid:0};
                      const isT   = d.toDateString()===today.toDateString();
                      const isSel = d.toDateString()===selectedDate.toDateString();
                      const isClosed = closedDays.includes(d.getDay());
                      return (
                        <button key={i} onClick={()=>setSelectedDate(new Date(d))}
                          className="flex flex-col items-center py-1.5 rounded-xl transition-all active:scale-95"
                          style={{
                            background: isSel ? '#111827'
                              : isClosed ? (isDark?'rgba(248,113,113,0.1)':'rgba(239,68,68,0.07)')
                              : isT      ? (isDark?'rgba(17,24,39,0.2)':'rgba(17,24,39,0.1)')
                              : 'transparent',
                            border: isClosed&&!isSel ? '1px solid rgba(239,68,68,0.15)' : '1px solid transparent',
                          }}>
                          <span className="text-[9px] font-bold" style={{ color:isSel?'rgba(255,255,255,0.75)':isClosed?'#ef4444':t.muted }}>{DAYS_FR[d.getDay()]}</span>
                          <span className="text-sm font-black" style={{ color:isSel?'white':isClosed?'#ef4444':isT?'#111827':t.text }}>{d.getDate()}</span>
                          {info.total>0 ? (
                            <div className="flex items-center gap-0.5 mt-0.5">
                              <span className="text-[8px] font-black px-1 rounded-full" style={{ background:isSel?'rgba(255,255,255,0.25)':'rgba(17,24,39,0.15)', color:isSel?'white':'#111827' }}>{info.total}</span>
                              {info.paid>0&&<span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background:'#4ade80' }} />}
                            </div>
                          ) : <div style={{ height:13 }} />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 mt-1 px-1">
                    <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-violet-500" /><span className="text-[9px]" style={{ color:t.muted }}>RDV</span></div>
                    <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ background:'#4ade80' }} /><span className="text-[9px]" style={{ color:t.muted }}>Encaissé</span></div>
                    <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-[9px]" style={{ color:t.muted }}>Fermé</span></div>
                  </div>
                </div>
              )}

              {/* Vue mois : grille jours */}
              {periodMode === 'month' && (
                <div className="px-3 pb-2">
                  {/* Entêtes jours */}
                  <div className="grid grid-cols-7 mb-1">
                    {DAYS_FR.map((d,i)=>(
                      <div key={i} className="text-center text-[9px] font-black py-1" style={{ color:t.muted }}>{d}</div>
                    ))}
                  </div>
                  {/* Grille du mois — en commençant au bon jour */}
                  {(() => {
                    const firstDay = weekDays[0]; // 1er du mois
                    const offset = (firstDay.getDay()+6)%7; // lundi=0
                    const cells = [];
                    for(let i=0;i<offset;i++) cells.push(null);
                    weekDays.forEach(d=>cells.push(d));
                    while(cells.length%7!==0) cells.push(null);
                    return (
                      <div className="grid grid-cols-7 gap-0.5">
                        {cells.map((d,i)=>{
                          if(!d) return <div key={i} />;
                          const ds   = svLocal(d);
                          const info = dayCounts[ds]||{total:0,paid:0};
                          const isT   = d.toDateString()===today.toDateString();
                          const isSel = d.toDateString()===selectedDate.toDateString();
                          const isClosed = closedDays.includes(d.getDay());
                          return (
                            <button key={i} onClick={()=>setSelectedDate(new Date(d))}
                              className="flex flex-col items-center py-1 rounded-lg transition-all"
                              style={{
                                background: isSel?'#111827':isClosed?(isDark?'rgba(248,113,113,0.08)':'rgba(239,68,68,0.05)'):isT?(isDark?'rgba(17,24,39,0.2)':'rgba(17,24,39,0.08)'):'transparent',
                                border: isClosed&&!isSel?'1px solid rgba(239,68,68,0.12)':'1px solid transparent',
                              }}>
                              <span className="text-[11px] font-black" style={{ color:isSel?'white':isClosed?'#ef4444':isT?'#111827':t.text }}>{d.getDate()}</span>
                              {info.total>0&&<span className="text-[8px] font-black px-1 rounded-full" style={{ background:isSel?'rgba(255,255,255,0.25)':'rgba(17,24,39,0.12)', color:isSel?'white':'#111827' }}>{info.total}</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* ── BARRE ACTIONS : + RDV | filtres | recherche | affichage ── */}
            <div className="flex items-center gap-2">
              {/* Bouton + RDV — gros, bien visible */}
              <button onClick={()=>setAddApptOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black text-white flex-shrink-0 shadow-lg"
                style={{ background:'#111827', boxShadow:'0 4px 14px rgba(17,24,39,0.4)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                RDV
              </button>

              {/* Filtre employé */}
              {employees.length>0&&(
                <div className="flex gap-1 overflow-x-auto flex-1 min-w-0 no-scrollbar">
                  <button onClick={()=>setFilterEmp('')}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
                    style={{ background:!filterEmp?'rgba(17,24,39,0.2)':(isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)'), color:!filterEmp?'#a5a0ff':t.muted, border:`1px solid ${!filterEmp?'rgba(17,24,39,0.35)':t.border}` }}>
                    Tous
                  </button>
                  {employees.filter(e=>e.is_active!==false).map(emp=>(
                    <button key={emp.id} onClick={()=>setFilterEmp(filterEmp===emp.id?'':emp.id)}
                      className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
                      style={{ background:filterEmp===emp.id?'rgba(17,24,39,0.15)':(isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)'), color:filterEmp===emp.id?'#a5a0ff':t.muted, border:`1px solid ${filterEmp===emp.id?'rgba(17,24,39,0.35)':t.border}` }}>
                      <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white font-black flex-shrink-0" style={{ fontSize:7, backgroundColor:emp.avatar_color||'#111827' }}>{emp.name.charAt(0)}</div>
                      {emp.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}

              <DisplaySettingsPanel displayCfg={displayCfg} onChange={updateDisplay} theme={t} />
            </div>

            {/* Recherche */}
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:t.dim }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Nom, téléphone, email, n° réservation…"
                className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background:t.inputBg, border:`1px solid ${searchQ?'rgba(17,24,39,0.4)':t.inputBorder}`, color:t.text }} />
              {searchQ&&<button onClick={()=>setSearchQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color:t.muted }}>✕</button>}
            </div>

            {/* Bannière jour fermé (seulement hors mode période) */}
            {periodMode!=='month'&&periodMode!=='custom'&&closedDays.includes(selectedDate.getDay())&&(
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.18)' }}>
                <span>🔴</span><p className="text-sm font-semibold" style={{ color:'#ef4444' }}>Commerce fermé ce jour</p>
              </div>
            )}

            {/* Résumé période */}
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm" style={{ color:t.text }}>
                {periodMode==='day'||periodMode==='week'
                  ? <>{selectedDate.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}<span className="ml-2 font-normal text-xs" style={{ color:t.muted }}>{dayAppts.length} RDV</span></>
                  : <>{periodLabel}<span className="ml-2 font-normal text-xs" style={{ color:t.muted }}>{periodAppts.length} RDV</span></>
                }
              </p>
              <button onClick={loadAppts} className="w-8 h-8 rounded-xl flex items-center justify-center text-sm" style={{ background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)', color:t.muted }}>↻</button>
            </div>
          </div>

          {/* ── CONTENU selon mode ── */}

          {/* Mode jour/semaine → grille horaire ou liste du jour sélectionné */}
          {(periodMode==='day'||periodMode==='week') && (
            displayCfg.viewMode === 'grid' ? (
              <div className="flex-1 overflow-auto min-h-0" style={{ borderTop:`1px solid ${t.border}` }}>
                <GridView
                  appts={dayAppts}
                  employees={filterEmp ? employees.filter(e=>e.id===filterEmp) : employees}
                  dateStr={selStr}
                  displayCfg={displayCfg}
                  onApptClick={setEditAppt}
                  theme={t}
                />
              </div>
            ) : (
              <div className="flex-1 overflow-auto px-4 pb-24 space-y-3 pt-1">
                {dayAppts.length===0 ? (
                  <div className="rounded-2xl py-14 text-center" style={{ border:`1px dashed ${t.border}` }}>
                    <p className="text-2xl mb-2">📅</p>
                    <p className="text-sm font-semibold" style={{ color:t.muted }}>{searchQ?'Aucun resultat':'Aucun rendez-vous ce jour'}</p>
                    {!searchQ&&<button onClick={()=>setAddApptOpen(true)} className="mt-3 text-xs font-bold px-4 py-2 rounded-xl" style={{ background:'rgba(17,24,39,0.12)',color:'#a5a0ff' }}>+ Créer un RDV</button>}
                  </div>
                ) : dayAppts.map(a=>(<ApptListCard key={a.id} a={a} onOpen={setEditAppt} isDark={isDark} t={t} />))}
              </div>
            )
          )}

          {/* Mode mois / custom → liste groupée par jour */}
          {(periodMode==='month'||periodMode==='custom') && (
            <div className="flex-1 overflow-auto px-4 pb-24 pt-1 space-y-4">
              {periodAppts.length===0 ? (
                <div className="rounded-2xl py-14 text-center" style={{ border:`1px dashed ${t.border}` }}>
                  <p className="text-2xl mb-2">📅</p>
                  <p className="text-sm font-semibold" style={{ color:t.muted }}>Aucun rendez-vous sur cette période</p>
                  <button onClick={()=>setAddApptOpen(true)} className="mt-3 text-xs font-bold px-4 py-2 rounded-xl" style={{ background:'rgba(17,24,39,0.12)',color:'#a5a0ff' }}>+ Créer un RDV</button>
                </div>
              ) : (() => {
                // grouper par date
                const groups = {};
                periodAppts.forEach(a=>{ const d=a.date?.substring(0,10)||''; if(!groups[d])groups[d]=[]; groups[d].push(a); });
                return Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([date,appts])=>(
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-px flex-1" style={{ background:t.border }} />
                      <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ background:isDark?'rgba(17,24,39,0.15)':'rgba(17,24,39,0.08)', color:'#a5a0ff' }}>
                        {fmtDateL(date)}
                      </span>
                      <div className="h-px flex-1" style={{ background:t.border }} />
                    </div>
                    <div className="space-y-2">
                      {appts.map(a=>(<ApptListCard key={a.id} a={a} onOpen={setEditAppt} isDark={isDark} t={t} />))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* ══ CONFIG ══ */}
      {mainTab === 'config' && (
        <div className="px-4 overflow-auto">
          <ConfigTab
            settings={settings}
            hours={businessHours}
            onSaved={(s,h)=>{ setSettings(s); setBusinessHours(h); setClosedDays(h.filter(x=>!x.is_open).map(x=>x.day_of_week)); syncDisplayFromHours(h); }}
            showToast={showToast}
            theme={t}
          />
        </div>
      )}

      {/* ── Modaux ── */}
      {editAppt && (
        <ApptModal
          appt={editAppt}
          employees={employees}
          employee={null} // null = admin (tous droits)
          onUpdated={onApptUpdated}
          onDeleted={onApptDeleted}
          onTxCreated={tx=>{ if(onTxCreated) onTxCreated(tx); showToast('💰 Encaisse !'); }}
          onClose={()=>setEditAppt(null)}
          theme={t}
        />
      )}

      {addApptOpen && (
        <AddApptModal
          employees={employees}
          services={services}
          selectedDate={selectedDate}
          onSave={async form=>{
            await bookingApi.createEmpAppt(form);
            await loadAppts();
            showToast('RDV crée ✓');
          }}
          onClose={()=>setAddApptOpen(false)}
          theme={t}
        />
      )}

      {svcModal && (
        <ServiceModal
          svc={editSvc}
          categories={categories}
          onSave={async form=>{
            if (editSvc) {
              const upd = await bookingApi.updateService(editSvc.id, form);
              setServices(p=>p.map(s=>s.id===editSvc.id?upd:s));
              showToast('Service mis a jour');
            } else {
              const created = await bookingApi.createService(form);
              setServices(p=>[...p, created]);
              showToast('Service crée');
            }
          }}
          onClose={()=>{ setSvcModal(false); setEditSvc(null); }}
          theme={t}
        />
      )}
    </div>
  );
}
