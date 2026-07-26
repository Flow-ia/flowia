import { useState, useEffect, useRef, useCallback } from 'react';
import { bookingApi } from '../../../../utils/api';
import Toggle from './Toggle';
import { getBizOpenRangesClient, clampSlotToBiz, toMinClient, minToStr } from '../helpers';
import { Button } from '../../../../components/primitives';

const DAYS_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

const normSlot = (s) => ({
  day_of_week: s.day_of_week,
  slot_start:  String(s.slot_start).substring(0, 5),
  slot_end:    String(s.slot_end).substring(0, 5),
});

export default function TeamTab({ employees, businessHours, bizBreaks, showToast, theme: t }) {
  const [selId, setSelId]         = useState(null);
  const [empSlots, setEmpSlots]   = useState({});
  const [useCustom, setUseCustom] = useState({});
  const [loading, setLoading]     = useState({});
  const [saving, setSaving]       = useState({});   // par employé — sauvegarder A ne bloque pas B
  const [dirty, setDirty]         = useState({});   // éditions non sauvegardées par employé
  const [preloaded, setPreloaded] = useState(false);

  // Miroir ref de `dirty` : les callbacks async (loadEmp) doivent lire l'état
  // À JOUR pour ne jamais écraser une édition en cours (course réseau/clic).
  // editSeqRef : compteur d'éditions par employé — une sauvegarde ne nettoie
  // le flag (et ne remplace les plages par la réponse serveur) que si AUCUNE
  // édition n'est intervenue pendant l'appel réseau.
  const dirtyRef   = useRef({});
  const editSeqRef = useRef({});
  const markDirty = (empId, val = true) => {
    if (val) editSeqRef.current[empId] = (editSeqRef.current[empId] || 0) + 1;
    dirtyRef.current = { ...dirtyRef.current, [empId]: val };
    setDirty(dirtyRef.current);
  };

  // Plages par défaut = plages RÉELLEMENT ouvertes du commerce (pauses déjà
  // soustraites). Avant : une seule plage open→close par jour, qui chevauchait
  // la pause déjeuner → la validation refusait la sauvegarde alors que
  // l'utilisateur n'avait rien modifié.
  const buildDefaultSlots = useCallback(() => {
    const slots = [];
    businessHours.forEach(bh => {
      if (bh.is_open !== false) {
        const day = bh.day_of_week ?? 0;
        getBizOpenRangesClient(businessHours, bizBreaks, day).forEach(r => {
          slots.push({ day_of_week: day, slot_start: minToStr(r.start), slot_end: minToStr(r.end) });
        });
      }
    });
    return slots;
  }, [businessHours, bizBreaks]);

  // Préchargement : 1 requête pour TOUS les employés (nouveau système + legacy).
  // Avant : chaque en-tête affichait "Suit le commerce" tant que son accordéon
  // n'avait pas été ouvert → impossible de VOIR les horaires sauvegardés.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await bookingApi.getAllEmpSlots();
        if (!alive) return;
        const bySlots  = {};
        (d?.slots || []).forEach(s => {
          (bySlots[s.employee_id] = bySlots[s.employee_id] || []).push(normSlot(s));
        });
        const byLegacy = {};
        (d?.legacy || []).forEach(r => {
          if (r.is_open === false) return;
          (byLegacy[r.employee_id] = byLegacy[r.employee_id] || []).push({
            day_of_week: r.day_of_week,
            slot_start:  String(r.open_time).substring(0, 5),
            slot_end:    String(r.close_time).substring(0, 5),
          });
        });
        const slotsMap = {}, customMap = {};
        employees.forEach(e => {
          if (dirtyRef.current[e.id]) return; // ne jamais écraser une édition
          const s = bySlots[e.id] || byLegacy[e.id] || [];
          slotsMap[e.id]  = s;
          customMap[e.id] = s.length > 0;
        });
        setEmpSlots(p => ({ ...p, ...slotsMap }));
        setUseCustom(p => ({ ...p, ...customMap }));
        setPreloaded(true);
      } catch {
        // Backend indisponible ou version sans la route collection : on
        // retombe sur le chargement paresseux par employé (loadEmp).
        if (alive) setPreloaded(true);
      }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees.map(e => e.id).join(',')]);

  // force=true → ignore le cache (utilisé après save pour rafraîchir).
  const loadEmp = async (empId, force = false) => {
    if (!force && empSlots[empId] !== undefined) return;
    setLoading(p => ({ ...p, [empId]: true }));
    try {
      const slots = await bookingApi.getEmpSlots(empId);
      // Une édition a démarré pendant le chargement → on ne touche à rien
      // (sauf force=true, qui suit toujours une sauvegarde réussie).
      if (!force && dirtyRef.current[empId]) return;
      if (slots && slots.length > 0) {
        setEmpSlots(p => ({ ...p, [empId]: slots.map(normSlot) }));
        setUseCustom(p => ({ ...p, [empId]: true }));
      } else {
        const rows = await bookingApi.getEmpHours(empId);
        if (!force && dirtyRef.current[empId]) return;
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
      if (empSlots[empId] === undefined) {
        setEmpSlots(p => ({ ...p, [empId]: [] }));
        setUseCustom(p => ({ ...p, [empId]: false }));
      }
    } finally { setLoading(p => ({ ...p, [empId]: false })); }
  };

  const getSlots = id => empSlots[id] || [];

  const addSlot = (empId, dayOfWeek) => {
    const bh = businessHours.find(h => (h.day_of_week ?? 0) === dayOfWeek);
    const defStart = bh ? String(bh.open_time  || '09:00').substring(0, 5) : '09:00';
    const defEnd   = bh ? String(bh.close_time || '18:00').substring(0, 5) : '18:00';
    markDirty(empId);
    setEmpSlots(p => ({ ...p, [empId]: [...getSlots(empId), { day_of_week: dayOfWeek, slot_start: defStart, slot_end: defEnd }] }));
  };

  const removeSlot = (empId, idx) => {
    markDirty(empId);
    setEmpSlots(p => ({ ...p, [empId]: getSlots(empId).filter((_, i) => i !== idx) }));
  };

  const updateSlot = (empId, idx, key, val) => {
    markDirty(empId);
    setEmpSlots(p => ({ ...p, [empId]: getSlots(empId).map((s, i) => i === idx ? { ...s, [key]: val } : s) }));
  };

  // Prépare les plages à sauvegarder : chaque plage est AJUSTÉE aux plages
  // ouvertes du commerce (découpée autour des pauses, bornée aux horaires
  // d'ouverture) — exactement ce que fait le moteur de réservation. On ne
  // bloque QUE si une plage sur un jour ouvert n'a aucun recouvrement
  // possible (vraie erreur de saisie). Les plages sur un jour où le commerce
  // est fermé sont ignorées (aucun RDV n'y est possible de toute façon).
  const prepareSlots = (empId) => {
    const blockedDays = [];
    const clamped = [];
    for (const s of getSlots(empId)) {
      const day = s.day_of_week;
      const bizRanges = getBizOpenRangesClient(businessHours, bizBreaks, day);
      if (!bizRanges.length) continue; // commerce fermé ce jour
      if (toMinClient(s.slot_start) >= toMinClient(s.slot_end)) {
        blockedDays.push(`${DAYS_SHORT[day] || '?'} (début après fin)`);
        continue;
      }
      const segs = clampSlotToBiz(s.slot_start, s.slot_end, businessHours, bizBreaks, day);
      if (!segs.length) {
        const bounds = `${minToStr(bizRanges[0].start)}-${minToStr(bizRanges[bizRanges.length - 1].end)}`;
        blockedDays.push(`${DAYS_SHORT[day] || '?'} (commerce ouvert ${bounds})`);
        continue;
      }
      segs.forEach(g => clamped.push({ day_of_week: day, slot_start: minToStr(g.start), slot_end: minToStr(g.end) }));
    }
    // Dédoublonnage (deux plages qui se réduisent au même segment) + tri.
    const seen = new Set();
    const unique = clamped.filter(s => {
      const k = `${s.day_of_week}|${s.slot_start}|${s.slot_end}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }).sort((a, b) => a.day_of_week - b.day_of_week || a.slot_start.localeCompare(b.slot_start));
    return { slots: unique, blockedDays };
  };

  const save = async (empId) => {
    if (saving[empId]) return;
    let toSave = null;
    if (useCustom[empId]) {
      if (getSlots(empId).length === 0) {
        showToast('Ajoutez au moins une plage, ou désactivez les horaires personnalisés.', 'error');
        return;
      }
      const { slots, blockedDays } = prepareSlots(empId);
      if (blockedDays.length) {
        showToast(`Plage impossible : ${[...new Set(blockedDays)].join(', ')}.`, 'error');
        return;
      }
      if (slots.length === 0) {
        showToast('Toutes les plages tombent sur des jours de fermeture du commerce.', 'error');
        return;
      }
      toSave = slots;
    }
    setSaving(p => ({ ...p, [empId]: true }));
    const seqAtSave = editSeqRef.current[empId] || 0;
    const untouched = () => (editSeqRef.current[empId] || 0) === seqAtSave;
    try {
      if (useCustom[empId]) {
        const fresh = await bookingApi.saveEmpSlots({ employee_id: empId, slots: toSave });
        // Reset du système legacy pour que seul employee_time_slots fasse foi.
        await bookingApi.saveEmpHours({ employee_id: empId, hours: Array.from({ length: 7 }, (_, i) => ({
          day_of_week: i, open_time: '09:00', close_time: '18:00', is_open: true, use_business_hours: true,
        })) });
        // La réponse du POST EST l'état serveur : affichage immédiat, aucun
        // cache ni F5 nécessaire pour voir le résultat.
        if (Array.isArray(fresh) && untouched()) setEmpSlots(p => ({ ...p, [empId]: fresh.map(normSlot) }));
      } else {
        await bookingApi.deleteEmpSlots(empId);
        await bookingApi.saveEmpHours({ employee_id: empId, hours: Array.from({ length: 7 }, (_, i) => ({
          day_of_week: i, open_time: '09:00', close_time: '18:00', is_open: true, use_business_hours: true,
        })) });
        if (untouched()) setEmpSlots(p => ({ ...p, [empId]: [] }));
      }
      if (untouched()) markDirty(empId, false);
      showToast('Horaires sauvegardés.', 'ok');
    } catch (e) { showToast(e.message || 'Erreur lors de la sauvegarde.', 'error'); }
    finally { setSaving(p => ({ ...p, [empId]: false })); }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, paddingBottom:32 }}>
      <div style={{ borderRadius:12, padding:12, display:'flex', gap:10,
                    background:'#eef2ff' }}>
        <p style={{ fontSize:12, color:'#4338ca', margin:0, lineHeight:1.6 }}>
          Par defaut chaque employe suit les horaires du commerce (pauses comprises).
          {' '}Activez <strong style={{ fontWeight:500 }}>Horaires personnalises</strong> pour definir
          des plages specifiques — elles doivent rester dans les horaires d'ouverture.
          {' '}Un jour laisse sans plage = jour de repos (non reservable en ligne).
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
        const known = preloaded || empSlots[emp.id] !== undefined;
        const isDirty = !!dirty[emp.id];
        const isSaving = !!saving[emp.id];
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
                  {!known
                    ? 'Chargement…'
                    : hasCustom
                      ? `${slots.length} plage${slots.length > 1 ? 's' : ''} personnalisee${slots.length > 1 ? 's' : ''}`
                      : 'Suit le commerce'}
                </p>
              </div>
              {known && hasCustom && !open && (
                <span style={{ fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:99,
                               background:'#eef2ff', color:'#4338ca', flexShrink:0 }}>
                  Personnalise
                </span>
              )}
              {isDirty && (
                <span style={{ fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:99,
                               background:'#fffbeb', color:'#92400e', flexShrink:0 }}>
                  Non enregistre
                </span>
              )}
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
                {loading[emp.id] && empSlots[emp.id] === undefined ? (
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
                                markDirty(emp.id);
                                setUseCustom(p => ({ ...p, [emp.id]: n }));
                                if (n && getSlots(emp.id).length === 0) {
                                  setEmpSlots(p => ({ ...p, [emp.id]: buildDefaultSlots() }));
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
                                    // 3 états : ✓ plage exacte · ≈ sera ajustée aux
                                    // horaires/pauses du commerce · ! aucun créneau possible
                                    const sMin = toMinClient(s.slot_start);
                                    const eMin = toMinClient(s.slot_end);
                                    const segs = clampSlotToBiz(s.slot_start, s.slot_end, businessHours, bizBreaks, dayIdx);
                                    const state = !segs.length ? 'none'
                                      : (segs.length === 1 && segs[0].start === sMin && segs[0].end === eMin) ? 'ok'
                                      : 'adjust';
                                    const ui = state === 'ok'
                                      ? { bg:'#f0fdf4', border:'rgba(16,185,129,0.3)', color:'#065f46', mark:'✓' }
                                      : state === 'adjust'
                                        ? { bg:'#fffbeb', border:'rgba(245,158,11,0.35)', color:'#92400e', mark:'≈' }
                                        : { bg:'#fef2f2', border:'rgba(239,68,68,0.3)',  color:'#991b1b', mark:'!' };
                                    return (
                                      <div key={s._idx}
                                           style={{ display:'flex', alignItems:'center', gap:8, padding:8, borderRadius:8,
                                                    background: ui.bg,
                                                    border:`0.5px solid ${ui.border}` }}>
                                        <span style={{ fontSize:12, flexShrink:0, color: ui.color }}>
                                          {ui.mark}
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
                          ✓ = plage valide · ≈ = sera ajustee automatiquement aux horaires/pauses du commerce
                          {' '}· ! = aucun creneau possible (corrigez la plage)
                        </p>
                      </div>
                    )}

                    {isDirty && (
                      <p style={{ fontSize:11, color:'#92400e', margin:0, padding:'0 4px' }}>
                        Modifications non enregistrees — cliquez sur Sauvegarder pour les appliquer
                        (page de reservation mise a jour automatiquement).
                      </p>
                    )}
                    <Button variant="primary" fullWidth type="button"
                            onClick={() => save(emp.id)} disabled={isSaving}>
                      {isSaving ? 'Enregistrement...' : `Sauvegarder — ${emp.name}`}
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
