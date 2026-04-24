import { useState, useCallback } from 'react';
import { bookingApi } from '../../../../utils/api';
import Toggle from './Toggle';
import { isSlotInBizRanges } from '../helpers';
import { Button } from '../../../../components/primitives';

export default function TeamTab({ employees, businessHours, bizBreaks, showToast, theme: t }) {
  const [selId, setSelId]         = useState(null);
  const [empSlots, setEmpSlots]   = useState({});
  const [useCustom, setUseCustom] = useState({});
  const [loading, setLoading]     = useState({});
  const [saving, setSaving]       = useState(false);

  const buildDefaultSlots = useCallback((empId) => {
    const slots = [];
    businessHours.forEach(bh => {
      if (bh.is_open !== false) {
        slots.push({
          day_of_week: bh.day_of_week ?? 0,
          slot_start:  String(bh.open_time  || '09:00').substring(0, 5),
          slot_end:    String(bh.close_time || '18:00').substring(0, 5),
        });
      }
    });
    return slots;
  }, [businessHours]);

  // force=true → ignore le cache (utilisé après save pour rafraîchir).
  // Sans force, le 1er load d'un accordéon utilise le cache pour ne pas
  // refaire d'appels réseau à chaque ouverture/fermeture.
  const loadEmp = async (empId, force = false) => {
    if (!force && empSlots[empId] !== undefined) return;
    setLoading(p => ({ ...p, [empId]: true }));
    try {
      const slots = await bookingApi.getEmpSlots(empId);
      if (slots && slots.length > 0) {
        setEmpSlots(p => ({ ...p, [empId]: slots.map(s => ({
          day_of_week: s.day_of_week,
          slot_start:  String(s.slot_start).substring(0, 5),
          slot_end:    String(s.slot_end).substring(0, 5),
        })) }));
        setUseCustom(p => ({ ...p, [empId]: true }));
      } else {
        const rows = await bookingApi.getEmpHours(empId);
        const hasCustom = rows.length > 0 && rows.some(r => !r.use_business_hours);
        if (hasCustom) {
          const converted = rows
            .filter(r => r.is_open !== false)
            .map(r => ({ day_of_week: r.day_of_week,
                         slot_start: String(r.open_time).substring(0, 5),
                         slot_end:   String(r.close_time).substring(0, 5) }));
          setEmpSlots(p => ({ ...p, [empId]: converted }));
          setUseCustom(p => ({ ...p, [empId]: true }));
        } else {
          setEmpSlots(p => ({ ...p, [empId]: [] }));
          setUseCustom(p => ({ ...p, [empId]: false }));
        }
      }
    } catch {
      setEmpSlots(p => ({ ...p, [empId]: [] }));
      setUseCustom(p => ({ ...p, [empId]: false }));
    } finally { setLoading(p => ({ ...p, [empId]: false })); }
  };

  const getSlots = id => empSlots[id] || [];

  const addSlot = (empId, dayOfWeek) => {
    const bh = businessHours.find(h => (h.day_of_week ?? 0) === dayOfWeek);
    const defStart = bh ? String(bh.open_time  || '09:00').substring(0, 5) : '09:00';
    const defEnd   = bh ? String(bh.close_time || '18:00').substring(0, 5) : '18:00';
    setEmpSlots(p => ({ ...p, [empId]: [...getSlots(empId), { day_of_week: dayOfWeek, slot_start: defStart, slot_end: defEnd }] }));
  };

  const removeSlot = (empId, idx) =>
    setEmpSlots(p => ({ ...p, [empId]: getSlots(empId).filter((_, i) => i !== idx) }));

  const updateSlot = (empId, idx, key, val) =>
    setEmpSlots(p => ({ ...p, [empId]: getSlots(empId).map((s, i) => i === idx ? { ...s, [key]: val } : s) }));

  const save = async (empId) => {
    setSaving(true);
    try {
      if (useCustom[empId]) {
        const slots = getSlots(empId);
        const invalid = slots.filter(s => !isSlotInBizRanges(s.slot_start, s.slot_end, businessHours, bizBreaks, s.day_of_week));
        if (invalid.length) {
          showToast('Certaines plages sont hors des horaires du commerce ou chevauchent une pause.', 'err');
          setSaving(false); return;
        }
        await bookingApi.saveEmpSlots({ employee_id: empId, slots });
        await bookingApi.saveEmpHours({ employee_id: empId, hours: Array.from({ length: 7 }, (_, i) => ({
          day_of_week: i, open_time: '09:00', close_time: '18:00', is_open: true, use_business_hours: true,
        })) });
      } else {
        await bookingApi.deleteEmpSlots(empId);
        await bookingApi.saveEmpHours({ employee_id: empId, hours: Array.from({ length: 7 }, (_, i) => ({
          day_of_week: i, open_time: '09:00', close_time: '18:00', is_open: true, use_business_hours: true,
        })) });
      }
      showToast('Horaires sauvegardes');
      // Reload depuis le backend en bypassant le cache → les plages
      // mises à jour s'affichent immédiatement (avant : cache rendait
      // obligatoire un F5 pour voir le résultat).
      await loadEmp(empId, true);
    } catch (e) { showToast(e.message || 'Erreur', 'err'); }
    finally { setSaving(false); }
  };

  const DAYS_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, paddingBottom:32 }}>
      <div style={{ borderRadius:12, padding:12, display:'flex', gap:10,
                    background:'#eef2ff' }}>
        <p style={{ fontSize:12, color:'#4338ca', margin:0, lineHeight:1.6 }}>
          Par defaut chaque employe suit les horaires du commerce (pauses comprises).
          {' '}Activez <strong style={{ fontWeight:500 }}>Horaires personnalises</strong> pour definir
          des plages specifiques — elles doivent rester dans les horaires d'ouverture.
        </p>
      </div>
      {employees.length === 0 ? (
        <div style={{ borderRadius:12, padding:'48px 0', textAlign:'center',
                      border:`0.5px solid ${t.borderStrong}` }}>
          <p style={{ fontSize:13, color:t.muted, margin:0 }}>
            Aucun employe — ajoutez-en depuis les Reglages
          </p>
        </div>
      ) : employees.map(emp => {
        const open = selId === emp.id;
        const slots = getSlots(emp.id);
        const hasCustom = !!useCustom[emp.id];
        return (
          <div key={emp.id}
               style={{ borderRadius:12, overflow:'hidden',
                        border: `0.5px solid ${open ? t.borderStrong : t.border}` }}>
            <button onClick={() => { if (open) { setSelId(null); } else { setSelId(emp.id); loadEmp(emp.id); } }}
                    style={{ width:'100%', padding:14, display:'flex', alignItems:'center', gap:12,
                             textAlign:'left', border:'none', cursor:'pointer',
                             background: open ? t.cardAlt : t.card,
                             fontFamily:'inherit' }}>
              <div style={{ width:40, height:40, borderRadius:8, flexShrink:0,
                            backgroundColor: emp.avatar_color || t.text,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color:'white', fontWeight:500, fontSize:16 }}>
                {emp.name.charAt(0)}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>{emp.name}</p>
                <p style={{ fontSize:12, color:t.muted, margin:'2px 0 0' }}>
                  {emp.role && <>{emp.role} · </>}
                  {hasCustom
                    ? `${slots.length} plage${slots.length > 1 ? 's' : ''} personnalisee${slots.length > 1 ? 's' : ''}`
                    : 'Suit le commerce'}
                </p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round"
                   style={{ width:14, height:14, color:t.muted,
                            transform: open ? 'rotate(90deg)' : 'none',
                            transition:'transform 0.2s' }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            {open && (
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:14,
                            borderTop:`0.5px solid ${t.separator}` }}>
                {loading[emp.id] ? (
                  <div style={{ display:'flex', justifyContent:'center', padding:'24px 0' }}>
                    <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" style={{ color:t.text }}>
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
                      <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                ) : (
                  <>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                  padding:12, borderRadius:8,
                                  background: hasCustom ? '#eef2ff' : t.cardAlt }}>
                      <div>
                        <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>Horaires personnalises</p>
                        <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                          {hasCustom ? 'Prioritaires sur le commerce' : 'Suit les horaires du commerce'}
                        </p>
                      </div>
                      <Toggle on={hasCustom}
                              colorOn={t.text}
                              onChange={() => {
                                const n = !hasCustom;
                                setUseCustom(p => ({ ...p, [emp.id]: n }));
                                if (n && !empSlots[emp.id]) loadEmp(emp.id);
                                if (n && empSlots[emp.id]?.length === 0) {
                                  setEmpSlots(p => ({ ...p, [emp.id]: buildDefaultSlots(emp.id) }));
                                }
                              }}/>
                    </div>

                    {hasCustom && (
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {DAYS_SHORT.map((dayLabel, dayIdx) => {
                          const bh = businessHours.find(h => (h.day_of_week ?? 0) === dayIdx);
                          const bizOpen  = bh && bh.is_open !== false;
                          const daySlots = slots.map((s, i) => ({ ...s, _idx:i })).filter(s => s.day_of_week === dayIdx);

                          return (
                            <div key={dayIdx}
                                 style={{ borderRadius:8, overflow:'hidden',
                                          border: `0.5px solid ${bizOpen ? t.border : 'rgba(239,68,68,0.2)'}`,
                                          background: bizOpen ? t.cardAlt : '#fef2f2' }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                            padding:'8px 12px' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                  <span style={{ fontSize:13, fontWeight:500, width:34,
                                                 color: bizOpen ? t.text : '#991b1b' }}>
                                    {dayLabel}
                                  </span>
                                  {!bizOpen && (
                                    <span style={{ fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:99,
                                                   background:'#fef2f2', color:'#991b1b' }}>
                                      Commerce ferme
                                    </span>
                                  )}
                                  {bizOpen && bh && (
                                    <span style={{ fontSize:11, color:t.dim }}>
                                      {String(bh.open_time  || '09:00').substring(0, 5)}-
                                      {String(bh.close_time || '18:00').substring(0, 5)}
                                    </span>
                                  )}
                                </div>
                                {bizOpen && (
                                  <button onClick={() => addSlot(emp.id, dayIdx)}
                                          style={{ fontSize:11, color:t.text, background:t.card,
                                                   border:`0.5px solid ${t.border}`, borderRadius:6,
                                                   padding:'3px 10px', cursor:'pointer', fontWeight:500,
                                                   fontFamily:'inherit' }}>
                                    + Plage
                                  </button>
                                )}
                              </div>

                              {bizOpen && (
                                <div style={{ padding:'0 12px 12px', display:'flex', flexDirection:'column', gap:8 }}>
                                  {daySlots.length === 0 ? (
                                    <p style={{ fontSize:11, fontStyle:'italic', color:t.dim, padding:'4px 0', margin:0 }}>
                                      Absent ce jour — cliquez "+ Plage" pour ajouter
                                    </p>
                                  ) : daySlots.map(s => {
                                    const valid = isSlotInBizRanges(s.slot_start, s.slot_end, businessHours, bizBreaks, dayIdx);
                                    return (
                                      <div key={s._idx}
                                           style={{ display:'flex', alignItems:'center', gap:8, padding:8, borderRadius:8,
                                                    background: valid ? '#f0fdf4' : '#fef2f2',
                                                    border:`0.5px solid ${valid ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                                        <span style={{ fontSize:12, flexShrink:0, color: valid ? '#065f46' : '#991b1b' }}>
                                          {valid ? '✓' : '!'}
                                        </span>
                                        <input type="time" value={s.slot_start}
                                               onChange={e => updateSlot(emp.id, s._idx, 'slot_start', e.target.value)}
                                               style={{ flex:1, padding:'6px 10px', borderRadius:6,
                                                        background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
                                                        color:t.text, fontSize:12, outline:'none',
                                                        fontFamily:'inherit' }}/>
                                        <span style={{ fontSize:11, color:t.muted }}>→</span>
                                        <input type="time" value={s.slot_end}
                                               onChange={e => updateSlot(emp.id, s._idx, 'slot_end', e.target.value)}
                                               style={{ flex:1, padding:'6px 10px', borderRadius:6,
                                                        background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
                                                        color:t.text, fontSize:12, outline:'none',
                                                        fontFamily:'inherit' }}/>
                                        <button onClick={() => removeSlot(emp.id, s._idx)}
                                                style={{ width:24, height:24, borderRadius:6,
                                                         background:'rgba(239,68,68,0.1)',
                                                         border:'none', cursor:'pointer', color:'#991b1b',
                                                         display:'flex', alignItems:'center', justifyContent:'center',
                                                         flexShrink:0, fontFamily:'inherit' }}>×</button>
                                      </div>
                                    );
                                  })}
                                  {(bizBreaks || []).filter(b => b.day_of_week === dayIdx).map((brk, bi) => (
                                    <div key={bi}
                                         style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 8px',
                                                  borderRadius:6, background:'#fff7ed' }}>
                                      <span style={{ fontSize:11, fontWeight:500, color:'#9a3412' }}>
                                        Pause commerce : {String(brk.break_start).substring(0, 5)} – {String(brk.break_end).substring(0, 5)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <p style={{ fontSize:11, color:t.dim, padding:'0 4px', margin:0 }}>
                          ✓ = plage valide · ! = hors horaires commerce ou chevauchement pause
                        </p>
                      </div>
                    )}

                    <Button variant="primary" fullWidth type="button"
                            onClick={() => save(emp.id)} disabled={saving}>
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
