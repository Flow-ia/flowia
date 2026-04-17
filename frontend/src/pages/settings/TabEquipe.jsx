import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { I } from '../../utils/icons';
import { api, bookingApi, absencesApi, commissionsApi } from '../../utils/api';
import { EmployeeForm } from '../../components/Forms';
import { Card, fmt, PAY_KEYS, PAY_INFO } from './shared';

function Toggle({ on, onChange, colorOn='linear-gradient(90deg,#111827,#374151)' }) {
  return (
    <button onClick={onChange}
      className="w-12 h-6 rounded-full relative flex-shrink-0 transition-all"
      style={{ background: on ? colorOn : 'rgba(120,120,120,0.2)' }}>
      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
        style={{ left: on ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

const toMinClient = (t) => { const s = String(t||'0:0').substring(0,5); const [h,m]=s.split(':').map(Number); return h*60+m; };

function isSlotInBizRanges(slotStart, slotEnd, bizHours, bizBreaks, dayOfWeek) {
  const bh = bizHours.find(h=>(h.day_of_week??0)===dayOfWeek);
  if (!bh || bh.is_open===false) return false;
  const bizOpen  = toMinClient(bh.open_time||'09:00');
  const bizClose = toMinClient(bh.close_time||'18:00');
  const sMin = toMinClient(slotStart);
  const eMin = toMinClient(slotEnd);
  if (sMin < bizOpen || eMin > bizClose || sMin >= eMin) return false;
  const dayBreaks = (bizBreaks||[]).filter(b=>(b.day_of_week??0)===dayOfWeek);
  for (const brk of dayBreaks) {
    const bs = toMinClient(brk.break_start);
    const be = toMinClient(brk.break_end);
    if (sMin < be && eMin > bs) return false;
  }
  return true;
}

export default function TabEquipe({ employees, transactions, onAdd, onUpd, onDel, showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const navigate = useNavigate();
  const location = useLocation();

  const segment = location.pathname.replace(/^\/settings\/?/, '').split('/')[0] || '';
  const sub = segment === 'absences'    ? 'absences'
            : segment === 'commissions' ? 'commissions'
            : segment === 'horaires'    ? 'horaires'
            : 'team';

  const setSub = (id) => {
    const target = id === 'absences'    ? '/settings/absences'
                 : id === 'commissions' ? '/settings/commissions'
                 : id === 'horaires'    ? '/settings/horaires'
                 : '/settings/equipe';
    navigate(target, { replace: false });
  };

  const SUB_TABS = [
    { id: 'team',        label: "Équipe",               icon: I.Users },
    { id: 'horaires',    label: 'Horaires',              icon: I.Clock },
    { id: 'absences',    label: 'Absences',              icon: I.Calendar },
    { id: 'commissions', label: 'Commissions',           icon: I.Award },
  ];

  return (
    <div className="space-y-4">
      <div style={{ display:'flex', gap:6, background:theme.inputBg, borderRadius:16, padding:4, border:`1px solid ${theme.border}` }}>
        {SUB_TABS.map(({ id, label, icon: Ic }) => {
          const active = sub === id;
          return (
            <button key={id} onClick={() => setSub(id)}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                padding:'9px 8px', borderRadius:12, border:'none', cursor:'pointer', transition:'all .15s',
                background: active ? (isDark ? 'rgba(17,24,39,0.25)' : '#fff') : 'transparent',
                color: active ? (isDark?'#e6edf3':'#111827') : theme.muted,
                fontWeight: active ? 800 : 600, fontSize:13,
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
              <Ic style={{ width:15, height:15 }} />
              {label}
            </button>
          );
        })}
      </div>

      {sub === 'team'        && <TabEmployees employees={employees} transactions={transactions} onAdd={onAdd} onUpd={onUpd} onDel={onDel} showToast={showToast} theme={theme} />}
      {sub === 'horaires'    && <TabHorairesEmployes employees={employees} theme={theme} showToast={showToast} />}
      {sub === 'absences'    && <TabAbsences employees={employees} theme={theme} />}
      {sub === 'commissions' && <TabCommissions employees={employees} theme={theme} />}
    </div>
  );
}

function TeamTab({ employees, businessHours, bizBreaks, showToast, theme: t }) {
  const isDark = t.mode === 'dark';
  const [selId, setSelId]         = useState(null);
  const [empSlots, setEmpSlots]   = useState({});
  const [useCustom, setUseCustom] = useState({});
  const [loading, setLoading]     = useState({});
  const [saving, setSaving]       = useState(false);

  const buildDefaultSlots = useCallback((empId) => {
    const slots = [];
    businessHours.forEach(bh => {
      if (bh.is_open!==false) {
        slots.push({
          day_of_week: bh.day_of_week??0,
          slot_start:  String(bh.open_time||'09:00').substring(0,5),
          slot_end:    String(bh.close_time||'18:00').substring(0,5),
        });
      }
    });
    return slots;
  }, [businessHours]);

  const loadEmp = async (empId) => {
    if (empSlots[empId] !== undefined) return;
    setLoading(p=>({...p,[empId]:true}));
    try {
      const slots = await bookingApi.getEmpSlots(empId);
      if (slots && slots.length > 0) {
        setEmpSlots(p=>({...p,[empId]: slots.map(s=>({
          day_of_week: s.day_of_week,
          slot_start:  String(s.slot_start).substring(0,5),
          slot_end:    String(s.slot_end).substring(0,5),
        }))}));
        setUseCustom(p=>({...p,[empId]:true}));
      } else {
        const rows = await bookingApi.getEmpHours(empId);
        const hasCustom = rows.length>0 && rows.some(r=>!r.use_business_hours);
        if (hasCustom) {
          const converted = rows
            .filter(r=>r.is_open!==false)
            .map(r=>({ day_of_week:r.day_of_week, slot_start:String(r.open_time).substring(0,5), slot_end:String(r.close_time).substring(0,5) }));
          setEmpSlots(p=>({...p,[empId]:converted}));
          setUseCustom(p=>({...p,[empId]:true}));
        } else {
          setEmpSlots(p=>({...p,[empId]:[]}));
          setUseCustom(p=>({...p,[empId]:false}));
        }
      }
    } catch {
      setEmpSlots(p=>({...p,[empId]:[]}));
      setUseCustom(p=>({...p,[empId]:false}));
    } finally { setLoading(p=>({...p,[empId]:false})); }
  };

  const getSlots = id => empSlots[id] || [];

  const addSlot = (empId, dayOfWeek) => {
    const bh = businessHours.find(h=>(h.day_of_week??0)===dayOfWeek);
    const defStart = bh ? String(bh.open_time||'09:00').substring(0,5) : '09:00';
    const defEnd   = bh ? String(bh.close_time||'18:00').substring(0,5) : '18:00';
    setEmpSlots(p=>({...p,[empId]:[...getSlots(empId), { day_of_week:dayOfWeek, slot_start:defStart, slot_end:defEnd }]}));
  };

  const removeSlot = (empId, idx) =>
    setEmpSlots(p=>({...p,[empId]:getSlots(empId).filter((_,i)=>i!==idx)}));

  const updateSlot = (empId, idx, key, val) =>
    setEmpSlots(p=>({...p,[empId]:getSlots(empId).map((s,i)=>i===idx?{...s,[key]:val}:s)}));

  const save = async (empId) => {
    setSaving(true);
    try {
      if (useCustom[empId]) {
        const slots = getSlots(empId);
        const invalid = slots.filter(s => !isSlotInBizRanges(s.slot_start, s.slot_end, businessHours, bizBreaks, s.day_of_week));
        if (invalid.length) {
          showToast('Certaines plages sont hors des horaires du commerce ou chevauchent une pause.','err');
          setSaving(false); return;
        }
        await bookingApi.saveEmpSlots({ employee_id:empId, slots });
        await bookingApi.saveEmpHours({ employee_id:empId, hours: Array.from({length:7},(_,i)=>({
          day_of_week:i, open_time:'09:00', close_time:'18:00', is_open:true, use_business_hours:true
        }))});
      } else {
        await bookingApi.deleteEmpSlots(empId);
        await bookingApi.saveEmpHours({ employee_id:empId, hours: Array.from({length:7},(_,i)=>({
          day_of_week:i, open_time:'09:00', close_time:'18:00', is_open:true, use_business_hours:true
        }))});
      }
      showToast('Horaires sauvegardes !');
      setEmpSlots(p=>({...p,[empId]:undefined}));
      await loadEmp(empId);
    } catch(e){ showToast(e.message||'Erreur','err'); }
    finally { setSaving(false); }
  };

  const DAYS_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

  return (
    <div className="space-y-3 pb-8">
      <div className="rounded-2xl p-3 flex gap-2" style={{ background:'rgba(17,24,39,0.08)', border:'1px solid rgba(17,24,39,0.2)' }}>
        <span>ℹ️</span>
        <p className="text-xs" style={{ color:t.muted }}>
          Par défaut chaque employé suit les horaires du commerce (pauses comprises).
          Activez <strong style={{ color:t.text }}>Horaires personnalisés</strong> pour définir
          des plages spécifiques — elles doivent rester dans les horaires d'ouverture.
        </p>
      </div>
      {employees.length===0 ? (
        <div className="rounded-2xl py-12 text-center" style={{ border:`1px dashed ${t.border}` }}>
          <p className="text-sm" style={{ color:t.muted }}>Aucun employé — ajoutez-en depuis les Réglages</p>
        </div>
      ) : employees.map(emp => {
        const open = selId===emp.id;
        const slots = getSlots(emp.id);
        const hasCustom = !!useCustom[emp.id];
        return (
          <div key={emp.id} className="rounded-2xl overflow-hidden" style={{ border:`1px solid ${open?'rgba(17,24,39,0.4)':t.border}` }}>
            <button onClick={()=>{ if(open){setSelId(null)}else{setSelId(emp.id);loadEmp(emp.id);} }}
              className="w-full p-4 flex items-center gap-3 text-left"
              style={{ background:open?(isDark?'rgba(17,24,39,0.12)':'rgba(17,24,39,0.06)'):(isDark?'rgba(255,255,255,0.03)':'white') }}>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-lg flex-shrink-0"
                style={{ backgroundColor:emp.avatar_color||'#111827' }}>{emp.name.charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm" style={{ color:t.text }}>{emp.name}</p>
                <p className="text-xs mt-0.5" style={{ color:t.muted }}>
                  {emp.role&&<>{emp.role} · </>}
                  {hasCustom ? `🕐 ${slots.length} plage${slots.length>1?'s':''} personnalisee${slots.length>1?'s':''}` : '📋 Suit le commerce'}
                </p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"
                style={{ color:t.muted, transform:open?'rotate(90deg)':'none', transition:'transform .2s' }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            {open && (
              <div className="p-4 space-y-4" style={{ borderTop:`1px solid ${t.border}` }}>
                {loading[emp.id] ? (
                  <div className="flex justify-center py-6">
                    <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor:isDark?'rgba(255,255,255,0.15)':'rgba(17,24,39,0.2)', borderTopColor:isDark?'#e6edf3':'#111827' }} />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between p-3 rounded-xl"
                      style={{ background:hasCustom?'rgba(17,24,39,0.08)':t.inputBg }}>
                      <div>
                        <p className="text-sm font-bold" style={{ color:t.text }}>Horaires personnalisés</p>
                        <p className="text-xs" style={{ color:t.muted }}>
                          {hasCustom ? 'Prioritaires sur le commerce' : 'Suit les horaires du commerce'}
                        </p>
                      </div>
                      <Toggle on={hasCustom} onChange={()=>{
                        const n = !hasCustom;
                        setUseCustom(p=>({...p,[emp.id]:n}));
                        if (n && !empSlots[emp.id]) loadEmp(emp.id);
                        if (n && empSlots[emp.id]?.length===0) setEmpSlots(p=>({...p,[emp.id]:buildDefaultSlots(emp.id)}));
                      }} />
                    </div>

                    {hasCustom && (
                      <div className="space-y-3">
                        {DAYS_SHORT.map((dayLabel, dayIdx) => {
                          const bh = businessHours.find(h=>(h.day_of_week??0)===dayIdx);
                          const bizOpen  = bh && bh.is_open!==false;
                          const daySlots = slots.map((s,i)=>({...s,_idx:i})).filter(s=>s.day_of_week===dayIdx);

                          return (
                            <div key={dayIdx} className="rounded-xl overflow-hidden"
                              style={{ border:`1px solid ${bizOpen ? t.border : 'rgba(239,68,68,0.15)'}`,
                                       background: bizOpen ? (isDark?'rgba(255,255,255,0.02)':'rgba(17,24,39,0.02)') : (isDark?'rgba(239,68,68,0.04)':'rgba(239,68,68,0.02)') }}>
                              <div className="flex items-center justify-between px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black w-8" style={{ color: bizOpen ? t.text : '#ef4444' }}>
                                    {dayLabel}
                                  </span>
                                  {!bizOpen && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                                      style={{ background:'rgba(239,68,68,0.1)', color:'#ef4444' }}>Commerce fermé</span>
                                  )}
                                  {bizOpen && bh && (
                                    <span className="text-[10px]" style={{ color:t.dim }}>
                                      {String(bh.open_time||'09:00').substring(0,5)}-{String(bh.close_time||'18:00').substring(0,5)}
                                    </span>
                                  )}
                                </div>
                                {bizOpen && (
                                  <button onClick={()=>addSlot(emp.id, dayIdx)}
                                    style={{ fontSize:11, color:isDark?'#e6edf3':'#111827', background:isDark?'rgba(255,255,255,0.1)':'rgba(17,24,39,0.1)',
                                             border:'none', borderRadius:8, padding:'3px 8px', cursor:'pointer', fontWeight:700 }}>
                                    + Plage
                                  </button>
                                )}
                              </div>

                              {bizOpen && (
                                <div className="px-3 pb-3 space-y-2">
                                  {daySlots.length === 0 ? (
                                    <p className="text-xs italic py-1" style={{ color:t.dim }}>
                                      Absent ce jour — cliquez "+ Plage" pour ajouter
                                    </p>
                                  ) : daySlots.map(s => {
                                    const valid = isSlotInBizRanges(s.slot_start, s.slot_end, businessHours, bizBreaks, dayIdx);
                                    return (
                                      <div key={s._idx} className="flex items-center gap-2 p-2 rounded-xl"
                                        style={{ background: valid
                                          ? (isDark?'rgba(74,222,128,0.06)':'rgba(74,222,128,0.05)')
                                          : (isDark?'rgba(239,68,68,0.08)':'rgba(239,68,68,0.06)'),
                                          border:`1px solid ${valid ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.3)'}` }}>
                                        <span style={{ fontSize:12, flexShrink:0 }}>{valid ? '✅' : '⚠️'}</span>
                                        <input type="time" value={s.slot_start}
                                          onChange={e=>updateSlot(emp.id,s._idx,'slot_start',e.target.value)}
                                          className="flex-1 px-2 py-1.5 rounded-lg text-xs focus:outline-none"
                                          style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
                                        <span className="text-xs" style={{ color:t.muted }}>→</span>
                                        <input type="time" value={s.slot_end}
                                          onChange={e=>updateSlot(emp.id,s._idx,'slot_end',e.target.value)}
                                          className="flex-1 px-2 py-1.5 rounded-lg text-xs focus:outline-none"
                                          style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
                                        <button onClick={()=>removeSlot(emp.id,s._idx)}
                                          style={{ width:26, height:26, borderRadius:8, background:'rgba(239,68,68,0.1)',
                                                   border:'none', cursor:'pointer', color:'#ef4444', fontSize:14,
                                                   display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
                                      </div>
                                    );
                                  })}
                                  {(bizBreaks||[]).filter(b=>b.day_of_week===dayIdx).map((brk,bi)=>(
                                    <div key={bi} className="flex items-center gap-2 px-2 py-1 rounded-lg"
                                      style={{ background:'rgba(251,146,60,0.06)', border:'1px solid rgba(251,146,60,0.15)' }}>
                                      <span style={{ fontSize:11 }}>☕</span>
                                      <span className="text-[11px] font-semibold" style={{ color:'#f97316' }}>
                                        Pause commerce : {String(brk.break_start).substring(0,5)} – {String(brk.break_end).substring(0,5)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <p className="text-[11px] px-1" style={{ color:t.dim }}>
                          ✅ = plage valide · ⚠️ = hors horaires commerce ou chevauchement pause
                        </p>
                      </div>
                    )}

                    <button onClick={()=>save(emp.id)} disabled={saving}
                      className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40"
                      style={{ background: isDark?'#e6edf3':'#111827', color: isDark?'#111827':'white' }}>
                      {saving ? 'Enregistrement...' : `Sauvegarder - ${emp.name}`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TabHorairesEmployes({ employees, theme, showToast }) {
  const [businessHours, setBusinessHours] = useState([]);
  const [bizBreaks,     setBizBreaks]     = useState([]);
  const [loaded,        setLoaded]        = useState(false);

  useEffect(() => {
    Promise.all([
      bookingApi.getHours().catch(()=>[]),
      bookingApi.getBreaks().catch(()=>[]),
    ]).then(([hrs, brks]) => {
      setBusinessHours(Array.isArray(hrs)?hrs:[]);
      setBizBreaks(Array.isArray(brks)?brks:[]);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return (
    <div style={{ padding:48, textAlign:'center' }}>
      <div style={{ width:28,height:28,borderRadius:99,border:'2px solid rgba(17,24,39,0.2)',
        borderTopColor:'#1a73e8',animation:'spin .8s linear infinite',margin:'0 auto' }}/>
    </div>
  );

  return (
    <TeamTab
      employees={employees.filter(e=>e.is_active!==false)}
      businessHours={businessHours}
      bizBreaks={bizBreaks}
      showToast={showToast}
      theme={theme}
    />
  );
}

function EmployeePinManager({ emp, onClose, showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const [pinStatus, setPinStatus] = useState(null);
  const [step, setStep] = useState('status');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [newPin, setNewPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getEmployeePinStatus(emp.id);
        if (!cancelled) setPinStatus(s);
      } catch { if (!cancelled) setPinStatus({ has_pin: false, is_active: false }); }
    })();
    return () => { cancelled = true; };
  }, [emp.id]);

  const pressPin = (k, cur, setCur, onFull) => {
    if (k === '⌫') { setCur(p => p.slice(0,-1)); setErr(''); return; }
    if (cur.length >= 4) return;
    const next = cur + k; setCur(next); setErr('');
    if (next.length === 4) setTimeout(() => onFull(next), 200);
  };

  const handleSetPin = async () => {
    setLoading(true); setErr('');
    try {
      await api.setEmployeePin(emp.id, { pin: newPin });
      setPinStatus({ has_pin: true, is_active: true });
      showToast('Code PIN crée !');
      setStep('status'); setPin1(''); setPin2(''); setNewPin('');
    } catch (e) { setErr(e.message || 'Erreur serveur'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await api.deleteEmployeePin(emp.id);
      setPinStatus({ has_pin: false, is_active: false });
      showToast('Code PIN supprime');
      setStep('status');
    } catch (e) { showToast('Erreur : ' + e.message); }
    finally { setLoading(false); }
  };

  const handleToggle = async () => {
    if (!pinStatus?.has_pin) return;
    setLoading(true);
    try {
      const res = await api.toggleEmployeePin(emp.id, { is_active: !pinStatus.is_active });
      setPinStatus(s => ({ ...s, is_active: res.is_active }));
      showToast(res.is_active ? 'PIN active' : 'PIN désactive');
    } catch (e) { showToast('Erreur : ' + e.message); }
    finally { setLoading(false); }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  const PinKeypad = ({ cur, setCur, onFull }) => (
    <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto mt-4">
      {keys.map((k, i) => (
        k === '' ? <div key={i}/> : (
          <button key={k+i} onClick={() => pressPin(k, cur, setCur, onFull)}
            className="h-[52px] rounded-xl text-lg font-medium select-none active:scale-90 transition-all"
            style={{
              background: k==='⌫' ? (isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)') : (isDark?'rgba(255,255,255,0.07)':'#fff'),
              border: `1px solid ${theme.border}`, color: k==='⌫'?theme.muted:theme.text,
              boxShadow: isDark?'none':'0 1px 4px rgba(0,0,0,0.06)',
            }}>{k}</button>
        )
      ))}
    </div>
  );

  const PinDots = ({ count }) => (
    <div className={`flex justify-center gap-4 my-4 ${shake ? 'animate-bounce' : ''}`}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{
          width:12, height:12, borderRadius:'50%',
          background: i<count ? (isDark?'#e6edf3':'#111827') : 'transparent',
          border: i<count ? 'none' : `2px solid ${isDark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.15)'}`,
          transform: i<count?'scale(1.2)':'scale(1)',
          transition: 'all 0.15s',
          boxShadow: i<count?'0 0 8px rgba(17,24,39,0.5)':'none',
        }}/>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl pb-8 pt-5 px-5 relative"
        style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow:'0 -8px 40px rgba(0,0,0,0.25)' }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4 sm:hidden" style={{ background: isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.1)' }}/>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-sm"
          style={{ background: isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)', color: theme.muted }}>✕</button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
            style={{ backgroundColor: emp.avatar_color||'#111827', boxShadow:`0 4px 14px ${emp.avatar_color||'#111827'}44` }}>
            {emp.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color:theme.text }}>{emp.name}</p>
            <p className="text-xs" style={{ color:theme.muted }}>Code PIN de sécurité</p>
          </div>
        </div>

        {step === 'status' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
              style={{ background: isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)', border:`1px solid ${theme.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: pinStatus?.has_pin ? (pinStatus?.is_active ? 'rgba(74,222,128,0.12)' : 'rgba(251,191,36,0.12)') : 'rgba(148,163,184,0.12)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={pinStatus?.has_pin ? (pinStatus?.is_active ? '#4ade80' : '#fbbf24') : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color:theme.text }}>
                    {pinStatus === null ? 'Chargement...' : pinStatus.has_pin ? 'Code PIN configure' : 'Aucun code PIN'}
                  </p>
                  <p className="text-xs" style={{ color: pinStatus?.has_pin ? (pinStatus?.is_active ? '#4ade80' : '#fbbf24') : theme.muted }}>
                    {pinStatus === null ? '' : pinStatus.has_pin ? (pinStatus.is_active ? '● Actif - requis pour chaque transaction' : '● Désactive') : 'Transactions sans validation'}
                  </p>
                </div>
              </div>
              {pinStatus?.has_pin && (
                <button onClick={handleToggle} disabled={loading}
                  className="w-11 h-6 rounded-full relative flex-shrink-0"
                  style={{ background: pinStatus.is_active ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: pinStatus.is_active ? '24px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }}/>
                </button>
              )}
            </div>

            <button onClick={() => { setStep('set_pin'); setPin1(''); setPin2(''); setNewPin(''); setErr(''); }}
              className="w-full py-3.5 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2"
              style={{ background: isDark?'#e6edf3':'#111827', color:isDark?'#111827':'white', boxShadow:'0 6px 20px rgba(17,24,39,0.3)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              {pinStatus?.has_pin ? 'Modifier le code PIN' : 'Creer un code PIN'}
            </button>

            {pinStatus?.has_pin && (
              <button onClick={() => setStep('confirm_delete')}
                className="w-full py-3 rounded-2xl text-sm font-medium"
                style={{ background:'rgba(248,113,113,0.08)', color:'#f87171', border:'1px solid rgba(248,113,113,0.2)' }}>
                Supprimer le code PIN
              </button>
            )}
          </div>
        )}

        {step === 'set_pin' && (
          <div className="text-center">
            <p className="font-bold text-base mb-1" style={{ color:theme.text }}>Nouveau code PIN</p>
            <p className="text-xs mb-2" style={{ color:theme.muted }}>Choisissez 4 chiffres pour {emp.name}</p>
            <PinDots count={pin1.length}/>
            {err && <p className="text-xs text-red-400 font-medium mb-1">{err}</p>}
            <PinKeypad cur={pin1} setCur={setPin1} onFull={(v) => { setNewPin(v); setStep('confirm_pin'); setPin2(''); }}/>
            <button onClick={() => { setStep('status'); setPin1(''); setErr(''); }} className="mt-4 text-xs underline" style={{ color:theme.muted }}>Annuler</button>
          </div>
        )}

        {step === 'confirm_pin' && (
          <div className="text-center">
            <p className="font-bold text-base mb-1" style={{ color:theme.text }}>Confirmer le code</p>
            <p className="text-xs mb-2" style={{ color:theme.muted }}>Entrez à nouveau le code PIN</p>
            <PinDots count={pin2.length}/>
            {err && <p className="text-xs text-red-400 font-medium mb-1">{err}</p>}
            <PinKeypad cur={pin2} setCur={setPin2} onFull={async (v) => {
              if (v === newPin) {
                await handleSetPin();
              } else {
                setShake(true);
                setErr('Les codes ne correspondent pas');
                setTimeout(() => { setPin2(''); setStep('confirm_pin'); setShake(false); setErr(''); }, 800);
              }
            }}/>
            <button onClick={() => { setStep('set_pin'); setPin1(''); setPin2(''); setErr(''); }} className="mt-4 text-xs underline" style={{ color:theme.muted }}>Recommencer</button>
          </div>
        )}

        {step === 'confirm_delete' && (
          <div className="text-center py-2">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.2)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <p className="font-bold text-base mb-2" style={{ color:theme.text }}>Supprimer le PIN ?</p>
            <p className="text-sm mb-5" style={{ color:theme.muted }}>{emp.name} pourra effectuer des transactions sans validation.</p>
            <div className="flex gap-2">
              <button onClick={() => setStep('status')} className="flex-1 py-3 rounded-2xl text-sm font-medium"
                style={{ background: isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)', color:theme.muted, border:`1px solid ${theme.border}` }}>
                Annuler
              </button>
              <button onClick={handleDelete} disabled={loading} className="flex-1 py-3 rounded-2xl text-sm font-bold text-white"
                style={{ background:'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                {loading ? '...' : 'Supprimer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabEmployees({ employees, transactions, onAdd, onUpd, onDel, showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const [form, setForm] = useState({ open: false, init: null });
  const [delId, setDelId] = useState(null);
  const [pinModal, setPinModal] = useState(null);
  const [smartDelModal, setSmartDelModal] = useState(null);
  const [futureAppts, setFutureAppts]     = useState([]);
  const [smartDelLoading, setSmartDelLoading] = useState(false);
  const [smartDelResult, setSmartDelResult]   = useState(null);

  const openSmartDelete = async (emp) => {
    setSmartDelModal(emp);
    setSmartDelResult(null);
    setSmartDelLoading(true);
    try {
      const appts = await api.getEmployeeFutureAppts(emp.id);
      setFutureAppts(appts);
    } catch { setFutureAppts([]); }
    finally { setSmartDelLoading(false); }
  };

  const doSmartDelete = async () => {
    if (!smartDelModal) return;
    setSmartDelLoading(true);
    try {
      const result = await api.smartDeleteEmployee(smartDelModal.id);
      setSmartDelResult(result);
      onDel(smartDelModal.id);
      showToast('Employé supprime avec succes');
    } catch (e) {
      showToast('Erreur : ' + (e.message || 'impossible de supprimer'), 'error');
    } finally {
      setSmartDelLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button onClick={() => setForm({ open: true, init: null })}
        className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        style={{ background: isDark?'#e6edf3':'#111827', color: isDark?'#111827':'white' }}>
        <I.Plus className="w-5 h-5" /> Ajouter un employé
      </button>

      {employees.length === 0 ? (
        <Card theme={theme}><div className="py-16 text-center"><I.Users className="w-12 h-12 mx-auto mb-3" style={{ color: theme.dim }} /><p className="text-sm" style={{ color: theme.muted }}>Aucun employé</p></div></Card>
      ) : employees.map(emp => {
        const er = transactions.filter(t => t.employee_id === emp.id && t.type === 'revenue');
        const tot = er.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
        const byPay = {};
        PAY_KEYS.forEach(k => { byPay[k] = er.filter(t => t.payment_method === k).reduce((s,t) => s+(parseFloat(t.amount)||0), 0); });
        return (
          <Card key={emp.id} theme={theme}>
            <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                style={{ backgroundColor: emp.avatar_color || '#111827' }}>
                {emp.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold" style={{ color: theme.text }}>{emp.name}</p>
                {emp.role && <p className="text-xs" style={{ color: theme.muted }}>{emp.role}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setPinModal(emp)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: isDark ? 'rgba(17,24,39,0.12)' : 'rgba(17,24,39,0.08)' }} title="Gérer le code PIN">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </button>
                <button onClick={() => setForm({ open: true, init: emp })} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)' }}>
                  <I.Edit className="w-4 h-4" style={{ color: theme.muted }} />
                </button>
                <button onClick={() => openSmartDelete(emp)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(248,113,113,0.1)' }} title="Supprimer l'employé">
                  <I.Trash className="w-4 h-4" style={{ color: '#f87171' }} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-6" style={{ borderTop: `1px solid ${theme.border}` }}>
              <div className="px-2 py-3 text-center" style={{ borderRight: `1px solid ${theme.border}` }}>
                <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#4ade80' }}>CA</p>
                <p className="text-sm font-bold" style={{ color: '#4ade80' }}>{fmt(tot)} €</p>
              </div>
              <div className="px-2 py-3 text-center" style={{ borderRight: `1px solid ${theme.border}` }}>
                <p className="text-[10px] mb-0.5" style={{ color: '#a5a0ff' }}>📅</p>
                {(() => { const rv = er.filter(t=>t.source==='rdv').reduce((s,t)=>s+(parseFloat(t.amount)||0),0); return rv > 0 ? <p className="text-sm font-bold" style={{ color: '#a5a0ff' }}>{fmt(rv)} €</p> : <p className="text-sm" style={{ color: theme.dim }}>—</p>; })()}
              </div>
              {PAY_KEYS.map(k => {
                const p = PAY_INFO[k]; const PmIc = p.Ic;
                return (
                  <div key={k} className="px-2 py-3 text-center" style={{ borderRight: k !== 'other' ? `1px solid ${theme.border}` : 'none' }}>
                    <div className="flex items-center justify-center mb-1"><PmIc className="w-3 h-3" style={{ color: p.color }} /></div>
                    <p className="text-sm font-bold" style={{ color: p.color }}>{fmt(byPay[k])} €</p>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 divide-x" style={{ borderTop: `1px solid ${theme.border}`, borderColor: theme.border }}>
              <div className="px-3 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold" style={{ color: theme.text }}>Site réservation</p>
                  <p className="text-[10px]" style={{ color: emp.show_on_booking!==false ? '#4ade80' : '#f87171' }}>{emp.show_on_booking!==false ? '✓ Visible' : '✗ Masque'}</p>
                </div>
                <button onClick={async () => { const upd = await onUpd(emp.id, { ...emp, show_on_booking: emp.show_on_booking===false }); if (upd) showToast('Visibilite mise a jour'); }}
                  className="w-10 h-5 rounded-full relative flex-shrink-0"
                  style={{ background: emp.show_on_booking!==false ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: emp.show_on_booking!==false ? '22px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="px-3 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold" style={{ color: theme.text }}>Caisse</p>
                  <p className="text-[10px]" style={{ color: emp.show_in_caisse!==false ? '#4ade80' : '#f87171' }}>{emp.show_in_caisse!==false ? '✓ Visible' : '✗ Masque'}</p>
                </div>
                <button onClick={async () => { const upd = await onUpd(emp.id, { ...emp, show_in_caisse: emp.show_in_caisse===false }); if (upd) showToast('Visibilite mise a jour'); }}
                  className="w-10 h-5 rounded-full relative flex-shrink-0"
                  style={{ background: emp.show_in_caisse!==false ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: emp.show_in_caisse!==false ? '22px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
            </div>
            <div className="px-4 py-3 space-y-2" style={{ borderTop: `1px solid ${theme.border}` }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.muted }}>Permissions Agenda</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut annuler ses RDV</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Annulation + email client automatique</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_cancel: !emp.can_cancel });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_cancel ? 'linear-gradient(90deg,#111827,#374151)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_cancel ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut modifier ses RDV</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Changer date, heure, coordonnées</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_modify: !emp.can_modify });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_modify ? 'linear-gradient(90deg,#111827,#374151)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_modify ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut encaisser les RDV</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Valider paiement → ajout auto en caisse</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_encash: !emp.can_encash });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_encash ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_encash ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="flex items-center justify-between py-2" style={{ borderTop:`1px solid ${theme.border}`, marginTop:6, paddingTop:10 }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut utiliser les codes promo</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Saisir un code promo ou fidélité à la caisse</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_use_promo: !(emp.can_use_promo !== false) });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: (emp.can_use_promo !== false) ? 'linear-gradient(90deg,#111827,#8b5cf6)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: (emp.can_use_promo !== false) ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
            </div>
            <div className="px-4 py-3 space-y-2" style={{ borderTop: `1px solid ${theme.border}` }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.muted }}>Permissions Crédit</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut accorder un crédit</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Créer une dette client dans le module crédit</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_grant_credit: !emp.can_grant_credit });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_grant_credit ? 'linear-gradient(90deg,#f59e0b,#f97316)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_grant_credit ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut encaisser un remboursement crédit</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Recevoir un paiement et solder le crédit d'un client</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_repay_credit: !emp.can_repay_credit });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_repay_credit ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_repay_credit ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              </div>
          </Card>
        );
      })}

      <EmployeeForm open={form.open} onClose={() => setForm({ open: false, init: null })}
        onSubmit={async d => { form.init ? await onUpd(form.init.id, d) : await onAdd(d); showToast(form.init ? 'Modifie !' : 'Ajoute !'); }}
        init={form.init} />
      {smartDelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-lg rounded-3xl overflow-hidden animate-scaleIn"
            style={{ background: theme.card, border: `1px solid ${theme.border}`, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>

            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
              style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: smartDelModal.avatar_color || '#111827' }}>
                  {smartDelModal.name?.charAt(0)}
                </div>
                <div>
                  <p className="font-bold" style={{ color: theme.text }}>Supprimer {smartDelModal.name}</p>
                  <p className="text-xs" style={{ color: '#f87171' }}>Action irréversible</p>
                </div>
              </div>
              {!smartDelResult && (
                <button onClick={() => { setSmartDelModal(null); setFutureAppts([]); }}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
                  style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', color: theme.muted }}>✕</button>
              )}
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4">
              {smartDelLoading && !smartDelResult && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-8 h-8 rounded-full border-2 animate-spin"
                    style={{ borderColor:isDark?'rgba(255,255,255,0.15)':'rgba(17,24,39,0.2)', borderTopColor:isDark?'#e6edf3':'#111827' }} />
                  <p className="text-sm" style={{ color: theme.muted }}>Analyse des rendez-vous…</p>
                </div>
              )}

              {smartDelResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-2xl"
                    style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
                    <span className="text-2xl">✅</span>
                    <div>
                      <p className="font-bold text-sm" style={{ color: '#4ade80' }}>Employé supprimé avec succès</p>
                      <p className="text-xs mt-0.5" style={{ color: theme.muted }}>
                        {smartDelResult.reassigned?.length || 0} RDV réaffecté(s) · {smartDelResult.cancelled?.length || 0} RDV annulé(s)
                      </p>
                    </div>
                  </div>
                  {smartDelResult.reassigned?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase mb-2" style={{ color: '#4ade80' }}>✓ RDV réaffectés automatiquement</p>
                      {smartDelResult.reassigned.map((a, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl mb-1"
                          style={{ background: isDark ? 'rgba(74,222,128,0.06)' : 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.15)' }}>
                          <div>
                            <p className="text-sm font-medium" style={{ color: theme.text }}>{a.client_name}</p>
                            <p className="text-xs" style={{ color: theme.muted }}>{String(a.date).substring(0,10)} à {String(a.start_time).substring(0,5)}</p>
                          </div>
                          <span className="text-xs font-bold px-2 py-1 rounded-lg"
                            style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>→ {a.new_employee}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {smartDelResult.cancelled?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase mb-2" style={{ color: '#f87171' }}>✗ RDV annulés (client notifié)</p>
                      {smartDelResult.cancelled.map((a, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl mb-1"
                          style={{ background: isDark ? 'rgba(248,113,113,0.06)' : 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)' }}>
                          <div>
                            <p className="text-sm font-medium" style={{ color: theme.text }}>{a.client_name}</p>
                            <p className="text-xs" style={{ color: theme.muted }}>{String(a.date).substring(0,10)} à {String(a.start_time).substring(0,5)}</p>
                          </div>
                          {a.client_email && <span className="text-xs" style={{ color: theme.dim }}>📧 notifié</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => { setSmartDelModal(null); setFutureAppts([]); setSmartDelResult(null); }}
                    className="w-full py-3 rounded-2xl font-bold text-white"
                    style={{ background: isDark?'#e6edf3':'#111827', color: isDark?'#111827':'white' }}>
                    Fermer
                  </button>
                </div>
              )}

              {!smartDelLoading && !smartDelResult && (
                <div className="space-y-4">
                  {futureAppts.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-3xl mb-2">✅</p>
                      <p className="font-semibold text-sm" style={{ color: theme.text }}>Aucun rendez-vous futur</p>
                      <p className="text-xs mt-1" style={{ color: theme.muted }}>Cet employé peut être supprimé immédiatement.</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold mb-3" style={{ color: theme.text }}>
                        {futureAppts.length} rendez-vous futur{futureAppts.length > 1 ? 's' : ''} seront traités :
                      </p>
                      <div className="space-y-2 mb-4">
                        {futureAppts.map((a, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl"
                            style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa', border: `1px solid ${theme.border}` }}>
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                              style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>📅</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>{a.client_name}</p>
                              <p className="text-xs" style={{ color: theme.muted }}>
                                {String(a.date).substring(0,10)} · {String(a.start_time).substring(0,5)} · {a.service_name || 'Prestation'}
                              </p>
                            </div>
                            {a.client_email && <span style={{ fontSize:10, color: theme.dim }}>📧</span>}
                          </div>
                        ))}
                      </div>
                      <div className="p-3 rounded-xl text-sm"
                        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#d97706' }}>
                        ⚡ Les RDV seront réaffectés automatiquement si possible, sinon annulés avec notification client.
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => { setSmartDelModal(null); setFutureAppts([]); }}
                      className="flex-1 py-3 rounded-2xl font-bold text-sm"
                      style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6', color: theme.muted }}>
                      Annuler
                    </button>
                    <button onClick={doSmartDelete} disabled={smartDelLoading}
                      className="flex-1 py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                      {smartDelLoading ? 'Traitement...' : '🗑 Confirmer la suppression'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {pinModal && (
        <EmployeePinManager
          emp={pinModal}
          onClose={() => setPinModal(null)}
          showToast={showToast}
          theme={theme}
        />
      )}
    </div>
  );
}

function TabAbsences({ employees, theme }) {
  const isDark = theme.mode === 'dark';
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm] = useState({
    employee_id: '', type: 'conges', start_date: '', end_date: '', reason: '',
  });
  const today = new Date().toLocaleDateString('sv-SE');

  const TYPES = {
    conges:'Conges', maladie:'Maladie', formation:'Formation',
    autre:'Autre', maternite:'Maternite', paternite:'Paternite',
    sans_solde:'Sans solde', accident_travail:'Accident travail',
  };

  const load = () => {
    setLoading(true);
    absencesApi.list({})
      .then(rows => setAbsences(Array.isArray(rows) ? rows : []))
      .catch(e => setError(e.message || 'Erreur chargement'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submit = async () => {
    if (!form.employee_id || !form.start_date || !form.end_date) {
      setError('Employé, date debut et date fin requis.'); return;
    }
    setSaving(true); setError('');
    try {
      await absencesApi.create(form);
      setShowForm(false);
      setForm({ employee_id:'', type:'conges', start_date:'', end_date:'', reason:'' });
      load();
    } catch(e) { setError(e.message || 'Erreur'); }
    finally { setSaving(false); }
  };

  const cancel = async (id) => {
    if (!window.confirm('Annuler cette absence ?')) return;
    try { await absencesApi.cancel(id); load(); }
    catch(e) { setError(e.message || 'Erreur'); }
  };

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, outline:'none',
    background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.04)',
    border:`1px solid ${theme.border}`, color:theme.text,
    fontSize:13, fontFamily:'inherit', boxSizing:'border-box' };

  const fmtDate = d => { if(!d) return '-'; const s=String(d).substring(0,10); return new Date(s+'T12:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}); };
  const nbJours = (s,e) => { if(!s||!e) return 0; return Math.max(1,Math.round((new Date(e+'T12:00')-new Date(s+'T12:00'))/(86400000))+1); };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {error && <p style={{ fontSize:12, color:'#f87171', fontWeight:600 }}>{error}</p>}

      <button onClick={()=>setShowForm(p=>!p)}
        style={{ alignSelf:'flex-end', padding:'9px 16px', borderRadius:10, border:'none',
          background:'#1a73e8', color:'white', fontWeight:700, fontSize:13, cursor:'pointer' }}>
        {showForm ? 'Annuler' : '+ Declarer une absence'}
      </button>

      {showForm && (
        <div style={{ background:theme.card, border:`1px solid ${theme.border}`,
          borderRadius:16, padding:18, display:'flex', flexDirection:'column', gap:10 }}>
          <p style={{ fontWeight:800, fontSize:14, color:theme.text, margin:0 }}>Nouvelle absence</p>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Employé *</p>
            <select value={form.employee_id} onChange={e=>setForm(f=>({...f,employee_id:e.target.value}))} style={{...inp,cursor:'pointer'}}>
              <option value="">Choisir…</option>
              {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Type</p>
            <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={{...inp,cursor:'pointer'}}>
              {Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Du *</p>
              <input type="date" value={form.start_date} min={today}
                onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} style={inp}/>
            </div>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Au *</p>
              <input type="date" value={form.end_date} min={form.start_date||today}
                onChange={e=>setForm(f=>({...f,end_date:e.target.value}))} style={inp}/>
            </div>
          </div>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Motif (optionnel)</p>
            <input value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}
              placeholder="Motif de l'absence" style={inp}/>
          </div>
          <button onClick={submit} disabled={saving}
            style={{ padding:'12px', borderRadius:11, border:'none', cursor:'pointer',
              background:'#1a73e8', color:'white', fontWeight:800, fontSize:13, opacity:saving?0.7:1 }}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding:40, textAlign:'center' }}>
          <div style={{ width:28,height:28,borderRadius:99,border:`2px solid ${isDark?'rgba(255,255,255,0.1)':'rgba(17,24,39,0.2)'}`,borderTopColor:isDark?'#e6edf3':'#111827',animation:'spin .8s linear infinite',margin:'0 auto' }}/>
        </div>
      ) : absences.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:theme.muted, fontSize:14 }}>
          Aucune absence déclarée
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {absences.map(a => {
            const emp = employees.find(e=>e.id===a.employee_id);
            return (
              <div key={a.id} style={{ background:theme.card, border:`1px solid ${theme.border}`,
                borderRadius:14, padding:'14px 16px',
                display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
                  background:`${emp?.avatar_color||'#111827'}18`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontWeight:800, fontSize:15, color:emp?.avatar_color||(isDark?'#e6edf3':'#111827') }}>
                  {emp?.name?.charAt(0)||'?'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:700, color:theme.text, margin:'0 0 2px' }}>
                    {emp?.name||'Employe'} — {TYPES[a.type]||a.type}
                  </p>
                  <p style={{ fontSize:12, color:theme.muted, margin:0 }}>
                    {fmtDate(a.start_date)} → {fmtDate(a.end_date)} · {nbJours(String(a.start_date).substring(0,10), String(a.end_date).substring(0,10))} jour(s)
                  </p>
                  {a.reason && <p style={{ fontSize:11, color:theme.dim, margin:'2px 0 0' }}>{a.reason}</p>}
                </div>
                {!a.cancelled_at && (
                  <button onClick={()=>cancel(a.id)}
                    style={{ padding:'6px 12px', borderRadius:9, border:'none', cursor:'pointer',
                      background:'rgba(248,113,113,0.1)', color:'#f87171',
                      fontWeight:700, fontSize:12 }}>
                    Annuler
                  </button>
                )}
                {a.cancelled_at && (
                  <span style={{ fontSize:11, color:'#f87171', fontWeight:700 }}>Annulé</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabCommissions({ employees, theme }) {
  const isDark = theme.mode === 'dark';
  const [data,    setData]    = useState(null);
  const [rates,   setRates]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState({});
  const [error,   setError]   = useState('');
  const today = new Date().toLocaleDateString('sv-SE');
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('sv-SE');
  const [from, setFrom] = useState(firstOfMonth);
  const [to,   setTo]   = useState(today);

  const load = () => {
    setLoading(true);
    Promise.all([
      commissionsApi.get({ from, to }),
      commissionsApi.getSettings(),
    ]).then(([d, r]) => {
      setData(d);
      setRates(Array.isArray(r) ? r : []);
    }).catch(e => setError(e.message || 'Erreur'))
    .finally(() => setLoading(false));
  };
  useEffect(load, [from, to]);

  const saveRate = async (empId, pct) => {
    setSaving(p=>({...p,[empId]:true}));
    try { await commissionsApi.saveRate(empId, { commission_pct: Number(pct) }); }
    catch(e) { setError(e.message || 'Erreur'); }
    finally { setSaving(p=>({...p,[empId]:false})); }
  };

  const fmtN = v => Number(v||0).toFixed(2);
  const inp = { padding:'9px 10px', borderRadius:9, outline:'none', border:`1px solid ${theme.border}`,
    background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.04)',
    color:theme.text, fontSize:13, fontFamily:'inherit' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {error && <p style={{ fontSize:12, color:'#f87171', fontWeight:600 }}>{error}</p>}

      <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:16, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}` }}>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>⚙️ Taux de commission</p>
        </div>
        <div>
          {rates.map(e => (
            <div key={e.id} style={{ display:'flex', alignItems:'center', gap:12,
              padding:'12px 16px', borderBottom:`1px solid ${theme.border}` }}>
              <div style={{ width:36, height:36, borderRadius:99, flexShrink:0,
                background:`${e.avatar_color||'#111827'}18`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:800, fontSize:14, color:e.avatar_color||'#111827' }}>
                {e.name.charAt(0)}
              </div>
              <p style={{ flex:1, fontSize:14, fontWeight:600, color:theme.text, margin:0 }}>{e.name}</p>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <input type="number" min={0} max={100} step={0.5}
                  defaultValue={e.commission_pct||0}
                  onBlur={ev=>saveRate(e.id, ev.target.value)}
                  style={{...inp, width:64, textAlign:'center'}}/>
                <span style={{ fontSize:13, color:theme.muted }}>%</span>
                {saving[e.id] && <div style={{ width:14,height:14,borderRadius:99,border:`2px solid ${isDark?'rgba(255,255,255,0.15)':'rgba(17,24,39,0.2)'}`,borderTopColor:isDark?'#e6edf3':'#111827',animation:'spin .7s linear infinite' }}/>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div>
          <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Du</p>
          <input type="date" value={from} onChange={e=>{setFrom(e.target.value);}} style={{...inp,width:'100%',boxSizing:'border-box'}}/>
        </div>
        <div>
          <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Au</p>
          <input type="date" value={to} onChange={e=>{setTo(e.target.value);}} style={{...inp,width:'100%',boxSizing:'border-box'}}/>
        </div>
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:'center' }}>
          <div style={{ width:28,height:28,borderRadius:99,border:`2px solid ${isDark?'rgba(255,255,255,0.1)':'rgba(17,24,39,0.2)'}`,borderTopColor:isDark?'#e6edf3':'#111827',animation:'spin .8s linear infinite',margin:'0 auto' }}/>
        </div>
      ) : data?.employees?.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:theme.muted, fontSize:14 }}>
          Aucune commission sur cette période
        </div>
      ) : (
        <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:16, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}` }}>
            <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>💰 Commissions à verser — {from} → {to}</p>
          </div>
          {(data?.employees||[]).map((e,i)=>(
            <div key={e.employee_id||i} style={{ display:'flex', alignItems:'center', gap:12,
              padding:'14px 16px',
              borderBottom:`1px solid ${theme.border}` }}>
              <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
                background:`${e.avatar_color||'#111827'}18`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:800, fontSize:15, color:e.avatar_color||'#111827' }}>
                {(e.employee_name||'?').charAt(0)}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14, fontWeight:700, color:theme.text, margin:'0 0 2px' }}>
                  {e.employee_name}
                </p>
                <p style={{ fontSize:12, color:theme.muted, margin:0 }}>
                  CA : {fmtN(e.total_revenue)} € · Taux : {e.commission_pct||0} %
                </p>
              </div>
              <p style={{ fontSize:16, fontWeight:900, color:isDark?'#e6edf3':'#111827', margin:0, fontFamily:'monospace' }}>
                {fmtN(e.commission_due)} €
              </p>
            </div>
          ))}
          {data?.employees?.length > 0 && (
            <div style={{ padding:'12px 16px', display:'flex', justifyContent:'flex-end' }}>
              <p style={{ fontSize:14, fontWeight:800, color:theme.text, margin:0 }}>
                Total : {fmtN((data.employees||[]).reduce((s,e)=>s+Number(e.commission_due||0),0))} €
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
