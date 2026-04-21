import { useState, useCallback } from 'react';
import { bookingApi } from '../../../utils/api';
import { isSlotInBizRanges } from '../helpers';
import { Button } from '../../../components/primitives';
import { I } from '../../../utils/icons';
import Toggle from '../components/Toggle';

export default function TeamTab({ employees, businessHours, bizBreaks, showToast, theme: t }) {
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

  // ── Styles partages ────────────────────────────────────────────────────
  const inputStyle = {
    padding: '6px 10px',
    borderRadius: 8,
    fontSize: 12,
    background: t.inputBg,
    border: `0.5px solid ${t.borderInput}`,
    color: t.text,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const spinnerStyle = {
    width: 24,
    height: 24,
    borderRadius: '50%',
    border: `0.5px solid ${t.border}`,
    borderTopColor: t.text,
    animation: 'spin-team 0.8s linear infinite',
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, paddingBottom:32 }}>
      <style>{`@keyframes spin-team { to { transform: rotate(360deg); } }`}</style>

      {/* ── Note d'intro ── */}
      <div style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: '#eef2ff',
        borderLeft: '2px solid #6366f1',
      }}>
        <p style={{ fontSize:11, color:'#4338ca', margin:0, lineHeight:1.5 }}>
          Par defaut chaque employe suit les horaires du commerce (pauses comprises).
          Activez <span style={{ fontWeight:500 }}>Horaires personnalises</span> pour definir
          des plages specifiques — elles doivent rester dans les horaires d{"'"}ouverture.
        </p>
      </div>

      {employees.length===0 ? (
        <div style={{
          borderRadius: 12,
          padding: '48px 16px',
          textAlign: 'center',
          border: `0.5px dashed ${t.border}`,
        }}>
          <p style={{ fontSize:13, color:t.muted, margin:0 }}>
            Aucun employe — ajoutez-en depuis les Reglages
          </p>
        </div>
      ) : employees.map(emp => {
        const open = selId===emp.id;
        const slots = getSlots(emp.id);
        const hasCustom = !!useCustom[emp.id];
        return (
          <div key={emp.id} style={{
            borderRadius: 12,
            overflow: 'hidden',
            background: t.card,
            border: `0.5px solid ${open ? t.borderStrong : t.border}`,
            transition: 'border-color .15s',
          }}>
            {/* ── En-tete employe ── */}
            <button
              type="button"
              onClick={()=>{ if(open){setSelId(null)}else{setSelId(emp.id);loadEmp(emp.id);} }}
              style={{
                width:'100%',
                padding:16,
                display:'flex',
                alignItems:'center',
                gap:12,
                textAlign:'left',
                background:'transparent',
                border:'none',
                cursor:'pointer',
                fontFamily:'inherit',
              }}
            >
              <div style={{
                width:40,
                height:40,
                borderRadius:12,
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                color:'#fff',
                fontWeight:500,
                fontSize:15,
                flexShrink:0,
                background:emp.avatar_color||t.text,
              }}>{emp.name.charAt(0)}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>{emp.name}</p>
                <p style={{ fontSize:11, color:t.muted, margin:'2px 0 0' }}>
                  {emp.role && <>{emp.role} · </>}
                  {hasCustom
                    ? `${slots.length} plage${slots.length>1?'s':''} personnalisee${slots.length>1?'s':''}`
                    : 'Suit le commerce'}
                </p>
              </div>
              <span style={{
                color: t.muted,
                transform: open ? 'rotate(90deg)' : 'none',
                transition: 'transform .2s',
                display: 'inline-flex',
              }}>
                <I.ChevR width={14} height={14} />
              </span>
            </button>

            {/* ── Panneau d'edition ── */}
            {open && (
              <div style={{
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                borderTop: `0.5px solid ${t.border}`,
              }}>
                {loading[emp.id] ? (
                  <div style={{ display:'flex', justifyContent:'center', padding:'24px 0' }}>
                    <div style={spinnerStyle} />
                  </div>
                ) : (
                  <>
                    {/* Toggle horaires perso */}
                    <div style={{
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'space-between',
                      padding:12,
                      borderRadius:8,
                      background: t.cardAlt,
                      border: `0.5px solid ${t.border}`,
                    }}>
                      <div>
                        <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>
                          Horaires personnalises
                        </p>
                        <p style={{ fontSize:11, color:t.muted, margin:'2px 0 0' }}>
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
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {DAYS_SHORT.map((dayLabel, dayIdx) => {
                          const bh = businessHours.find(h=>(h.day_of_week??0)===dayIdx);
                          const bizOpen  = bh && bh.is_open!==false;
                          const daySlots = slots.map((s,i)=>({...s,_idx:i})).filter(s=>s.day_of_week===dayIdx);

                          return (
                            <div key={dayIdx} style={{
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: `0.5px solid ${bizOpen ? t.border : 'rgba(239,68,68,0.2)'}`,
                              background: bizOpen ? t.cardAlt : 'rgba(239,68,68,0.04)',
                            }}>
                              {/* En-tete du jour */}
                              <div style={{
                                display:'flex',
                                alignItems:'center',
                                justifyContent:'space-between',
                                gap:8,
                                padding:'8px 12px',
                              }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                                  <span style={{
                                    fontSize: 13,
                                    fontWeight: 500,
                                    width: 32,
                                    color: bizOpen ? t.text : '#991b1b',
                                  }}>{dayLabel}</span>
                                  {!bizOpen && (
                                    <span style={{
                                      fontSize: 10,
                                      fontWeight: 500,
                                      padding: '2px 8px',
                                      borderRadius: 99,
                                      background: '#fef2f2',
                                      color: '#991b1b',
                                      whiteSpace: 'nowrap',
                                    }}>Commerce ferme</span>
                                  )}
                                  {bizOpen && bh && (
                                    <span style={{ fontSize:11, color:t.dim }}>
                                      {String(bh.open_time||'09:00').substring(0,5)}–{String(bh.close_time||'18:00').substring(0,5)}
                                    </span>
                                  )}
                                </div>
                                {bizOpen && (
                                  <button
                                    type="button"
                                    onClick={()=>addSlot(emp.id, dayIdx)}
                                    style={{
                                      fontSize:11,
                                      fontWeight:500,
                                      color:t.text,
                                      background:'transparent',
                                      border:`0.5px solid ${t.borderStrong}`,
                                      borderRadius:8,
                                      padding:'4px 10px',
                                      cursor:'pointer',
                                      fontFamily:'inherit',
                                    }}
                                  >
                                    + Plage
                                  </button>
                                )}
                              </div>

                              {/* Plages du jour */}
                              {bizOpen && (
                                <div style={{ padding:'0 12px 12px', display:'flex', flexDirection:'column', gap:6 }}>
                                  {daySlots.length === 0 ? (
                                    <p style={{ fontSize:11, fontStyle:'italic', color:t.dim, margin:'4px 0' }}>
                                      Absent ce jour — cliquez &quot;+ Plage&quot; pour ajouter
                                    </p>
                                  ) : daySlots.map(s => {
                                    const valid = isSlotInBizRanges(s.slot_start, s.slot_end, businessHours, bizBreaks, dayIdx);
                                    const slotBg = valid ? '#f0fdf4' : '#fef2f2';
                                    const slotBd = valid ? '#10b981' : '#ef4444';
                                    return (
                                      <div key={s._idx} style={{
                                        display:'flex',
                                        alignItems:'center',
                                        gap:8,
                                        padding:8,
                                        borderRadius:8,
                                        background: slotBg,
                                        borderLeft: `2px solid ${slotBd}`,
                                      }}>
                                        <input
                                          type="time"
                                          value={s.slot_start}
                                          onChange={e=>updateSlot(emp.id,s._idx,'slot_start',e.target.value)}
                                          style={{ ...inputStyle, flex:1 }}
                                        />
                                        <span style={{ fontSize:12, color:t.muted }}>→</span>
                                        <input
                                          type="time"
                                          value={s.slot_end}
                                          onChange={e=>updateSlot(emp.id,s._idx,'slot_end',e.target.value)}
                                          style={{ ...inputStyle, flex:1 }}
                                        />
                                        <button
                                          type="button"
                                          onClick={()=>removeSlot(emp.id,s._idx)}
                                          aria-label="Supprimer"
                                          style={{
                                            width:26,
                                            height:26,
                                            borderRadius:8,
                                            background:'transparent',
                                            border:'0.5px solid rgba(239,68,68,0.3)',
                                            cursor:'pointer',
                                            color:'#991b1b',
                                            display:'flex',
                                            alignItems:'center',
                                            justifyContent:'center',
                                            flexShrink:0,
                                            fontFamily:'inherit',
                                          }}
                                        >
                                          <I.X width={12} height={12} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                  {/* Pauses commerce du jour */}
                                  {(bizBreaks||[]).filter(b=>b.day_of_week===dayIdx).map((brk,bi)=>(
                                    <div key={bi} style={{
                                      display:'flex',
                                      alignItems:'center',
                                      gap:8,
                                      padding:'4px 8px',
                                      borderRadius:8,
                                      background:'#fff7ed',
                                      borderLeft:'2px solid #fb923c',
                                    }}>
                                      <span style={{ fontSize:11, fontWeight:500, color:'#9a3412' }}>
                                        Pause commerce : {String(brk.break_start).substring(0,5)} – {String(brk.break_end).substring(0,5)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div style={{ display:'flex', alignItems:'center', gap:16, paddingLeft:4 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ width:5, height:5, borderRadius:'50%', background:'#10b981' }} />
                            <span style={{ fontSize:11, color:t.muted }}>Plage valide</span>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ width:5, height:5, borderRadius:'50%', background:'#ef4444' }} />
                            <span style={{ fontSize:11, color:t.muted }}>Hors horaires ou chevauchement</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <Button fullWidth onClick={()=>save(emp.id)} disabled={saving}>
                      {saving ? 'Enregistrement...' : `Sauvegarder — ${emp.name}`}
                    </Button>
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
