import { useState, useCallback } from 'react';
import { bookingApi } from '../../../utils/api';
import { isSlotInBizRanges } from '../helpers';
import Toggle from '../components/Toggle';

export default function TeamTab({ employees, businessHours, bizBreaks, showToast, theme: t }) {
  const isDark = t.mode === 'dark';
  const [selId, setSelId]         = useState(null);
  const [empSlots, setEmpSlots]   = useState({}); // { empId: [{ day_of_week, slot_start, slot_end }] }
  const [useCustom, setUseCustom] = useState({});
  const [loading, setLoading]     = useState({});
  const [saving, setSaving]       = useState(false);

  // Construit des plages par défaut depuis les horaires commerce
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
      // Charger nouveau système (plages multiples)
      const slots = await bookingApi.getEmpSlots(empId);
      if (slots && slots.length > 0) {
        setEmpSlots(p=>({...p,[empId]: slots.map(s=>({
          day_of_week: s.day_of_week,
          slot_start:  String(s.slot_start).substring(0,5),
          slot_end:    String(s.slot_end).substring(0,5),
        }))}));
        setUseCustom(p=>({...p,[empId]:true}));
      } else {
        // Fallback : ancien système employee_hours
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
        // Validation : toutes les plages doivent être dans les horaires commerce
        const invalid = slots.filter(s => !isSlotInBizRanges(s.slot_start, s.slot_end, businessHours, bizBreaks, s.day_of_week));
        if (invalid.length) {
          showToast('Certaines plages sont hors des horaires du commerce ou chevauchent une pause.','err');
          setSaving(false); return;
        }
        await bookingApi.saveEmpSlots({ employee_id:empId, slots });
        // Mettre aussi employee_hours en mode "use_business_hours=true" pour compatibilité
        await bookingApi.saveEmpHours({ employee_id:empId, hours: Array.from({length:7},(_,i)=>({
          day_of_week:i, open_time:'09:00', close_time:'18:00', is_open:true, use_business_hours:true
        }))});
      } else {
        // Remet sur horaires commerce : supprimer les plages perso
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
            {/* ── En-tête employé ── */}
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

            {/* ── Panneau d'édition ── */}
            {open && (
              <div className="p-4 space-y-4" style={{ borderTop:`1px solid ${t.border}` }}>
                {loading[emp.id] ? (
                  <div className="flex justify-center py-6">
                    <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor:'rgba(17,24,39,0.2)', borderTopColor:'#111827' }} />
                  </div>
                ) : (
                  <>
                    {/* Toggle horaires perso */}
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

                    {/* Plages par jour */}
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
                              {/* En-tête du jour */}
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
                                    style={{ fontSize:11, color:'#111827', background:'rgba(17,24,39,0.1)',
                                             border:'none', borderRadius:8, padding:'3px 8px', cursor:'pointer', fontWeight:700 }}>
                                    + Plage
                                  </button>
                                )}
                              </div>

                              {/* Plages du jour */}
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
                                  {/* Afficher les pauses du jour pour info */}
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
                      style={{ background:'#111827' }}>
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
