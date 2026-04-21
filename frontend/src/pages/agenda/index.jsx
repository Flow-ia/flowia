import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { bookingApi } from '../../utils/api';
import { useTheme } from '../../hooks/useTheme';
import { Toast, useToast } from '../../components/UI';
import { Button, SegmentedControl } from '../../components/primitives';
import { I } from '../../utils/icons';
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
  const svcDragId = useRef(null);
  const [settings, setSettings]         = useState(null);
  const [businessHours, setBusinessHours] = useState([]);
  const [bizBreaks, setBizBreaks]         = useState([]);
  const [closedDays, setClosedDays]     = useState([]);
  const [loading, setLoading]           = useState(true);

  /* ── Periode : 'day' | 'week' | 'month' | 'custom' ── */
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

  /* ── Deep-link depuis une notification (push/in-app) ──
     Si l'URL contient ?date=YYYY-MM-DD&appt=<id>, on saute directement
     au bon jour et on ouvre le modal du RDV. Params nettoyés après usage
     pour éviter de re-ouvrir au prochain remount. */
  const pendingApptRef = useRef(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const dateParam = params.get('date');
    const apptParam = params.get('appt');
    if (!dateParam && !apptParam) return;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [y, m, d] = dateParam.split('-').map(Number);
      const target = new Date(y, m - 1, d);
      if (!isNaN(target.getTime())) {
        const base = new Date();
        base.setHours(0, 0, 0, 0);
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.round((target - base) / 86400000);
        setPeriodMode('day');
        setPeriodOffset(diffDays);
        setSelectedDate(new Date(y, m - 1, d));
      }
    }
    if (apptParam) pendingApptRef.current = apptParam;
    // Strip les query params pour ne pas relancer au remount suivant
    navigate(location.pathname, { replace: true });
  // Ré-exécuter quand l'URL change (ex: clic sur une autre notif
  // alors qu'on est déjà sur /agenda — pas de remount du composant).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  /* Une fois les RDV chargés, ouvrir le RDV ciblé par ?appt= */
  useEffect(() => {
    const id = pendingApptRef.current;
    if (!id || !allAppts.length) return;
    const found = allAppts.find(a => String(a.id) === String(id));
    if (found) { setEditAppt(found); pendingApptRef.current = null; }
  }, [allAppts]);

  /* Horaires → mettre a jour startHour/endHour auto selon le commerce */
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

  /* ── Calcul de la plage de dates selon la periode ── */
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

  /* Semaine affichee dans le mini-calendrier (toujours 7 jours) */
  const calWeekDays = useMemo(()=>{
    if (periodMode==='week') return weekDays;
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

  /* RDV filtres pour le jour selectionne */
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

  /* RDV de toute la periode filtres (pour vue liste periode) */
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

  /* callbacks mise a jour */
  const onApptUpdated = useCallback(upd=>{ setAllAppts(p=>p.map(a=>a.id===upd.id?{...a,...upd}:a)); showToast('RDV mis a jour ✓'); },[]);
  const onApptDeleted = useCallback(id =>{ setAllAppts(p=>p.filter(a=>a.id!==id)); showToast('RDV supprime'); },[]);

  const MAIN_TABS = [
    {id:'calendar',label:'Agenda'},
  ];

  /* ── Styles partages ── */
  const iconBtnStyle = {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: 'transparent',
    border: `0.5px solid ${t.border}`,
    color: t.muted,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 0,
  };

  const pillBaseStyle = {
    flexShrink: 0,
    padding: '6px 10px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    border: `0.5px solid ${t.border}`,
    background: 'transparent',
    color: t.muted,
    whiteSpace: 'nowrap',
  };

  const spinnerStyle = {
    width: 12,
    height: 12,
    borderRadius: '50%',
    border: `0.5px solid ${t.border}`,
    borderTopColor: t.text,
    display: 'inline-block',
    animation: 'spin 0.8s linear infinite',
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'80px 0' }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: `0.5px solid ${t.border}`,
        borderTopColor: t.text,
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{
      display:'flex',
      flexDirection:'column',
      minHeight:'calc(100vh - 80px)',
      background:t.bg,
      paddingBottom:0,
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* Tabs navigation — masquee tant qu'il n'y a qu'un seul onglet */}
      {MAIN_TABS.length > 1 && (
        <div style={{ padding:'12px 16px 8px', flexShrink:0 }}>
          <SegmentedControl
            value={mainTab}
            onChange={setMainTab}
            options={MAIN_TABS.map(tb=>({ value:tb.id, label:tb.label }))}
          />
        </div>
      )}

      {/* ══ CALENDRIER ══ */}
      {mainTab === 'calendar' && (
        <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden' }}>
          <div style={{ padding:'0 16px 8px', flexShrink:0, display:'flex', flexDirection:'column', gap:8 }}>

            {/* ── SELECTEUR DE PERIODE ── */}
            <div style={{
              background: t.card,
              border: `0.5px solid ${t.border}`,
              borderRadius: 12,
              overflow: 'hidden',
            }}>

              {/* Ligne 1 : modes periode (SegmentedControl) */}
              <div style={{ padding: 8, borderBottom:`0.5px solid ${t.border}` }}>
                <SegmentedControl
                  fullWidth
                  value={periodMode}
                  onChange={(v)=>{ setPeriodMode(v); setPeriodOffset(0); }}
                  options={[
                    { value:'day',    label:'Jour' },
                    { value:'week',   label:'Semaine' },
                    { value:'month',  label:'Mois' },
                    { value:'custom', label:'Perso' },
                  ]}
                />
              </div>

              {/* Ligne 2 : navigation ◀ label ▶ + Aujourd'hui */}
              {periodMode !== 'custom' && (
                <div style={{
                  display:'flex',
                  alignItems:'center',
                  justifyContent:'space-between',
                  padding:'8px 12px',
                  gap:8,
                }}>
                  <button
                    type="button"
                    onClick={()=>setPeriodOffset(o=>o-1)}
                    style={iconBtnStyle}
                    aria-label="Precedent"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>

                  <div style={{
                    flex:1,
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'center',
                    gap:8,
                    minWidth:0,
                  }}>
                    <span style={{
                      fontSize:13,
                      fontWeight:500,
                      color:t.text,
                      textAlign:'center',
                      overflow:'hidden',
                      textOverflow:'ellipsis',
                      whiteSpace:'nowrap',
                    }}>{periodLabel}</span>
                    {loadingAppts && <span style={spinnerStyle} />}
                  </div>

                  <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <button
                      type="button"
                      onClick={()=>{ setPeriodOffset(0); setSelectedDate(new Date()); }}
                      style={{
                        fontSize:11,
                        fontWeight:500,
                        padding:'6px 10px',
                        borderRadius:8,
                        background:'transparent',
                        color:t.text,
                        border:`0.5px solid ${t.borderStrong}`,
                        cursor:'pointer',
                        fontFamily:'inherit',
                      }}
                    >
                      Auj.
                    </button>
                    <button
                      type="button"
                      onClick={()=>setPeriodOffset(o=>o+1)}
                      style={iconBtnStyle}
                      aria-label="Suivant"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Plage personnalisee */}
              {periodMode === 'custom' && (
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px' }}>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e=>setCustomFrom(e.target.value)}
                    style={{
                      flex:1,
                      padding:'8px 10px',
                      borderRadius:8,
                      fontSize:12,
                      background:t.inputBg,
                      border:`0.5px solid ${t.borderInput}`,
                      color:t.text,
                      outline:'none',
                      fontFamily:'inherit',
                    }}
                  />
                  <span style={{ fontSize:12, color:t.muted }}>→</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={e=>setCustomTo(e.target.value)}
                    style={{
                      flex:1,
                      padding:'8px 10px',
                      borderRadius:8,
                      fontSize:12,
                      background:t.inputBg,
                      border:`0.5px solid ${t.borderInput}`,
                      color:t.text,
                      outline:'none',
                      fontFamily:'inherit',
                    }}
                  />
                  {loadingAppts && <span style={spinnerStyle} />}
                </div>
              )}

              {/* Mini-calendrier semaine (sauf mode mois) */}
              {periodMode !== 'month' && (
                <div style={{ padding:'0 12px 10px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2 }}>
                    {calWeekDays.map((d,i)=>{
                      const ds   = svLocal(d);
                      const info = dayCounts[ds]||{total:0,paid:0};
                      const isT   = d.toDateString()===today.toDateString();
                      const isSel = d.toDateString()===selectedDate.toDateString();
                      const isClosed = closedDays.includes(d.getDay());
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={()=>setSelectedDate(new Date(d))}
                          style={{
                            display:'flex',
                            flexDirection:'column',
                            alignItems:'center',
                            padding:'6px 0',
                            borderRadius:8,
                            cursor:'pointer',
                            fontFamily:'inherit',
                            background: isSel     ? t.text
                                      : isClosed  ? 'rgba(239,68,68,0.08)'
                                      : isT       ? t.cardAlt
                                      : 'transparent',
                            border: `0.5px solid ${
                              isClosed && !isSel ? 'rgba(239,68,68,0.18)'
                              : isT && !isSel    ? t.border
                              : 'transparent'
                            }`,
                          }}
                        >
                          <span style={{
                            fontSize:9,
                            fontWeight:500,
                            color: isSel ? t.bg
                                 : isClosed ? '#991b1b'
                                 : t.muted,
                          }}>
                            {DAYS_FR[d.getDay()]}
                          </span>
                          <span style={{
                            fontSize:13,
                            fontWeight:500,
                            marginTop:1,
                            color: isSel ? t.bg
                                 : isClosed ? '#991b1b'
                                 : t.text,
                          }}>
                            {d.getDate()}
                          </span>
                          {info.total>0 ? (
                            <div style={{ display:'flex', alignItems:'center', gap:2, marginTop:3 }}>
                              <span style={{
                                fontSize:9,
                                fontWeight:500,
                                padding:'1px 5px',
                                borderRadius:99,
                                background: isSel ? 'rgba(255,255,255,0.18)' : t.cardAlt,
                                color: isSel ? t.bg : t.muted,
                              }}>{info.total}</span>
                              {info.paid>0 && (
                                <span style={{ width:5, height:5, borderRadius:'50%', background:'#10b981' }} />
                              )}
                            </div>
                          ) : <div style={{ height:13 }} />}
                        </button>
                      );
                    })}
                  </div>
                  {/* Legende */}
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:6, paddingLeft:4 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:'#6366f1' }} />
                      <span style={{ fontSize:10, color:t.muted }}>RDV</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:'#10b981' }} />
                      <span style={{ fontSize:10, color:t.muted }}>Encaisse</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:'#ef4444' }} />
                      <span style={{ fontSize:10, color:t.muted }}>Ferme</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Vue mois : grille jours */}
              {periodMode === 'month' && (
                <div style={{ padding:'0 12px 10px' }}>
                  {/* Entetes jours */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', marginBottom:4 }}>
                    {DAYS_FR.map((d,i)=>(
                      <div key={i} style={{ textAlign:'center', fontSize:10, fontWeight:500, padding:'4px 0', color:t.muted }}>
                        {d}
                      </div>
                    ))}
                  </div>
                  {/* Grille du mois */}
                  {(() => {
                    const firstDay = weekDays[0];
                    const offset = (firstDay.getDay()+6)%7;
                    const cells = [];
                    for(let i=0;i<offset;i++) cells.push(null);
                    weekDays.forEach(d=>cells.push(d));
                    while(cells.length%7!==0) cells.push(null);
                    return (
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2 }}>
                        {cells.map((d,i)=>{
                          if(!d) return <div key={i} />;
                          const ds   = svLocal(d);
                          const info = dayCounts[ds]||{total:0,paid:0};
                          const isT   = d.toDateString()===today.toDateString();
                          const isSel = d.toDateString()===selectedDate.toDateString();
                          const isClosed = closedDays.includes(d.getDay());
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={()=>setSelectedDate(new Date(d))}
                              style={{
                                display:'flex',
                                flexDirection:'column',
                                alignItems:'center',
                                padding:'4px 0',
                                borderRadius:6,
                                cursor:'pointer',
                                fontFamily:'inherit',
                                background: isSel    ? t.text
                                          : isClosed ? 'rgba(239,68,68,0.06)'
                                          : isT      ? t.cardAlt
                                          : 'transparent',
                                border: `0.5px solid ${
                                  isClosed && !isSel ? 'rgba(239,68,68,0.14)'
                                  : isT && !isSel    ? t.border
                                  : 'transparent'
                                }`,
                              }}
                            >
                              <span style={{
                                fontSize:11,
                                fontWeight:500,
                                color: isSel ? t.bg
                                     : isClosed ? '#991b1b'
                                     : t.text,
                              }}>{d.getDate()}</span>
                              {info.total>0 && (
                                <span style={{
                                  fontSize:9,
                                  fontWeight:500,
                                  padding:'1px 5px',
                                  borderRadius:99,
                                  marginTop:2,
                                  background: isSel ? 'rgba(255,255,255,0.18)' : t.cardAlt,
                                  color: isSel ? t.bg : t.muted,
                                }}>{info.total}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* ── BARRE ACTIONS : + RDV | filtres | affichage ── */}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {/* Bouton + RDV — primary */}
              <Button
                onClick={()=>setAddApptOpen(true)}
                size="small"
                style={{ display:'inline-flex', alignItems:'center', gap:6, flexShrink:0 }}
              >
                <I.Plus width={14} height={14} />
                Nouveau RDV
              </Button>

              {/* Filtre employe */}
              {employees.length>0 && (
                <div
                  style={{
                    display:'flex',
                    gap:4,
                    overflowX:'auto',
                    flex:1,
                    minWidth:0,
                  }}
                  className="no-scrollbar"
                >
                  <button
                    type="button"
                    onClick={()=>setFilterEmp('')}
                    style={{
                      ...pillBaseStyle,
                      background: !filterEmp ? t.cardAlt : 'transparent',
                      color: !filterEmp ? t.text : t.muted,
                      border: `0.5px solid ${!filterEmp ? t.borderStrong : t.border}`,
                    }}
                  >
                    Tous
                  </button>
                  {employees.filter(e=>e.is_active!==false).map(emp=>{
                    const active = filterEmp===emp.id;
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={()=>setFilterEmp(active?'':emp.id)}
                        style={{
                          ...pillBaseStyle,
                          display:'inline-flex',
                          alignItems:'center',
                          gap:6,
                          background: active ? t.cardAlt : 'transparent',
                          color: active ? t.text : t.muted,
                          border: `0.5px solid ${active ? t.borderStrong : t.border}`,
                        }}
                      >
                        <div style={{
                          width:14,
                          height:14,
                          borderRadius:'50%',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'center',
                          color:'#fff',
                          fontWeight:500,
                          fontSize:8,
                          flexShrink:0,
                          background:emp.avatar_color||t.text,
                        }}>{emp.name.charAt(0)}</div>
                        {emp.name.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
              )}

              <DisplaySettingsPanel displayCfg={displayCfg} onChange={updateDisplay} theme={t} />
            </div>

            {/* Recherche */}
            <div style={{ position:'relative' }}>
              <span style={{
                position:'absolute',
                left:10,
                top:'50%',
                transform:'translateY(-50%)',
                pointerEvents:'none',
                color:t.dim,
                display:'flex',
                alignItems:'center',
              }}>
                <I.Search width={14} height={14} />
              </span>
              <input
                value={searchQ}
                onChange={e=>setSearchQ(e.target.value)}
                placeholder="Nom, telephone, email, n° reservation…"
                style={{
                  width:'100%',
                  padding:'9px 32px 9px 34px',
                  borderRadius:8,
                  fontSize:13,
                  background:t.inputBg,
                  border:`0.5px solid ${searchQ ? t.borderStrong : t.borderInput}`,
                  color:t.text,
                  outline:'none',
                  fontFamily:'inherit',
                  boxSizing:'border-box',
                }}
              />
              {searchQ && (
                <button
                  type="button"
                  onClick={()=>setSearchQ('')}
                  style={{
                    position:'absolute',
                    right:8,
                    top:'50%',
                    transform:'translateY(-50%)',
                    fontSize:11,
                    fontWeight:500,
                    color:t.muted,
                    background:'transparent',
                    border:'none',
                    cursor:'pointer',
                    padding:4,
                    fontFamily:'inherit',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Banniere jour ferme (seulement hors mode periode) */}
            {periodMode!=='month' && periodMode!=='custom' && closedDays.includes(selectedDate.getDay()) && (
              <div style={{
                display:'flex',
                alignItems:'center',
                gap:8,
                padding:'8px 12px',
                borderRadius:8,
                background:'#fef2f2',
                borderLeft:'2px solid #ef4444',
              }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#ef4444', flexShrink:0 }} />
                <p style={{ fontSize:13, fontWeight:500, color:'#991b1b', margin:0 }}>Commerce ferme ce jour</p>
              </div>
            )}

            {/* Resume periode */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
              <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {periodMode==='day'||periodMode==='week'
                  ? <>
                      {selectedDate.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}
                      <span style={{ marginLeft:8, fontWeight:400, fontSize:11, color:t.muted }}>
                        {dayAppts.length} RDV
                      </span>
                    </>
                  : <>
                      {periodLabel}
                      <span style={{ marginLeft:8, fontWeight:400, fontSize:11, color:t.muted }}>
                        {periodAppts.length} RDV
                      </span>
                    </>
                }
              </p>
              <button
                type="button"
                onClick={loadAppts}
                style={iconBtnStyle}
                aria-label="Rafraichir"
              >
                <I.Refresh width={14} height={14} />
              </button>
            </div>
          </div>

          {/* ── CONTENU selon mode ── */}

          {/* Mode jour/semaine → grille horaire ou liste du jour selectionne */}
          {(periodMode==='day'||periodMode==='week') && (
            displayCfg.viewMode === 'grid' ? (
              <div style={{ flex:1, overflow:'auto', minHeight:0, borderTop:`0.5px solid ${t.border}` }}>
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
              <div style={{ flex:1, overflow:'auto', padding:'4px 16px 96px', display:'flex', flexDirection:'column', gap:12 }}>
                {dayAppts.length===0 ? (
                  <div style={{
                    borderRadius:12,
                    padding:'56px 16px',
                    textAlign:'center',
                    border:`0.5px dashed ${t.border}`,
                  }}>
                    <p style={{ fontSize:13, fontWeight:500, color:t.muted, margin:0 }}>
                      {searchQ?'Aucun resultat':'Aucun rendez-vous ce jour'}
                    </p>
                    {!searchQ && (
                      <div style={{ display:'flex', justifyContent:'center', marginTop:12 }}>
                        <Button size="small" onClick={()=>setAddApptOpen(true)}>
                          Nouveau RDV
                        </Button>
                      </div>
                    )}
                  </div>
                ) : dayAppts.map(a=>(<ApptListCard key={a.id} a={a} onOpen={setEditAppt} isDark={isDark} t={t} />))}
              </div>
            )
          )}

          {/* Mode mois / custom → liste groupee par jour */}
          {(periodMode==='month'||periodMode==='custom') && (
            <div style={{ flex:1, overflow:'auto', padding:'4px 16px 96px', display:'flex', flexDirection:'column', gap:16 }}>
              {periodAppts.length===0 ? (
                <div style={{
                  borderRadius:12,
                  padding:'56px 16px',
                  textAlign:'center',
                  border:`0.5px dashed ${t.border}`,
                }}>
                  <p style={{ fontSize:13, fontWeight:500, color:t.muted, margin:0 }}>
                    Aucun rendez-vous sur cette periode
                  </p>
                  <div style={{ display:'flex', justifyContent:'center', marginTop:12 }}>
                    <Button size="small" onClick={()=>setAddApptOpen(true)}>
                      Nouveau RDV
                    </Button>
                  </div>
                </div>
              ) : (() => {
                const groups = {};
                periodAppts.forEach(a=>{ const d=a.date?.substring(0,10)||''; if(!groups[d])groups[d]=[]; groups[d].push(a); });
                return Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([date,appts])=>(
                  <div key={date}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <div style={{ height:1, flex:1, background:t.border }} />
                      <span style={{
                        fontSize:11,
                        fontWeight:500,
                        padding:'3px 10px',
                        borderRadius:99,
                        background:t.cardAlt,
                        color:t.muted,
                      }}>
                        {fmtDateL(date)}
                      </span>
                      <div style={{ height:1, flex:1, background:t.border }} />
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
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
        <div style={{ padding:'0 16px', overflow:'auto' }}>
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
          employee={null}
          onUpdated={onApptUpdated}
          onDeleted={onApptDeleted}
          onTxCreated={tx=>{ if(onTxCreated) onTxCreated(tx); showToast('Encaisse !'); }}
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
            showToast('RDV cree ✓');
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
              showToast('Service cree');
            }
          }}
          onClose={()=>{ setSvcModal(false); setEditSvc(null); }}
          theme={t}
        />
      )}
    </div>
  );
}
