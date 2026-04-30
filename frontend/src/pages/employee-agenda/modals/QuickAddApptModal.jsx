// src/pages/employee-agenda/modals/QuickAddApptModal.jsx
import { useState, useEffect, useRef } from 'react';
import { bookingApi, clientsApi } from '../../../utils/api';
import { Modal } from '../../../components/UI';
import { Button, Label, SegmentedControl } from '../../../components/primitives';
import { I } from '../../../utils/icons';
import { svLocal, toMin, fromMin } from '../helpers';

export default function QuickAddApptModal({ employees, services, onSave, onClose, theme: t, defaultEmpId = null }) {
  const [clientSearch,      setClientSearch]      = useState('');
  const [clientResults,     setClientResults]     = useState([]);
  const [clientSearchBusy,  setClientSearchBusy]  = useState(false);
  const [selectedClient,    setSelectedClient]    = useState(null);
  const [clientMode,        setClientMode]        = useState('search');
  const [newClient,         setNewClient]         = useState({ first_name:'', last_name:'', email:'', phone:'' });
  const [bookingCats,       setBookingCats]       = useState([]);
  const [openCat,           setOpenCat]           = useState(null);
  const [cart,              setCart]              = useState([]);
  // Défaut intelligent : aujourd'hui + prochain créneau 15 min après l'heure
  // courante (évite l'erreur rouge "heure passée" qui apparaissait à
  // l'ouverture quand on défaut sur 09:00 alors qu'il est déjà 14:30).
  // Si la prochaine fenêtre de 15 min dépasse 23:45, on bascule sur demain
  // 09:00 (cas rare, ouverture tardive du modal).
  const initialDateTime = (() => {
    const now = new Date();
    const totalMin = now.getHours() * 60 + now.getMinutes();
    const nextSlot = Math.ceil((totalMin + 1) / 15) * 15;
    if (nextSlot >= 24 * 60) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { d: svLocal(tomorrow), t: '09:00' };
    }
    const hh = String(Math.floor(nextSlot / 60)).padStart(2, '0');
    const mm = String(nextSlot % 60).padStart(2, '0');
    return { d: svLocal(now), t: `${hh}:${mm}` };
  })();
  const [date,              setDate]              = useState(initialDateTime.d);
  const [startTime,         setStartTime]         = useState(initialDateTime.t);
  const [notes,             setNotes]             = useState('');
  const [selEmpId,          setSelEmpId]          = useState(defaultEmpId || '');
  const [saving,            setSaving]            = useState(false);
  const [confirmed,         setConfirmed]         = useState(null);
  const [conflictError,     setConflictError]     = useState('');
  const searchTimer = useRef(null);

  const activeEmps = (employees||[]).filter(e => e.is_active !== false);
  useEffect(() => {
    // defaultEmpId prioritaire (vient de la page "agenda d'un employé") ;
    // sinon 1er employé actif par défaut.
    if (selEmpId) return;
    if (defaultEmpId && activeEmps.some(e => e.id === defaultEmpId)) {
      setSelEmpId(defaultEmpId);
    } else if (activeEmps.length > 0) {
      setSelEmpId(activeEmps[0].id);
    }
  }, [employees, defaultEmpId]); // eslint-disable-line

  useEffect(() => {
    bookingApi.getServiceCategories().then(setBookingCats).catch(()=>{});
  }, []);

  const actSvcs = (services||[]).filter(s => s.is_active !== false);
  const groupsObj = actSvcs.reduce((acc, svc) => {
    let k;
    if (svc.booking_category_id) {
      const bc = bookingCats.find(cat => cat.id === svc.booking_category_id);
      k = bc ? bc.name : (svc.category_name || 'Autres');
    } else {
      k = svc.category_name || 'Autres';
    }
    if (!acc[k]) acc[k] = [];
    acc[k].push(svc);
    return acc;
  }, {});
  const groupKeys = Object.keys(groupsObj);

  useEffect(() => {
    if (groupKeys.length > 0 && !openCat) setOpenCat(groupKeys[0]);
  }, [bookingCats.length, actSvcs.length]); // eslint-disable-line

  const autoTotal    = cart.reduce((s,it) => s + it.unit_price * it.qty, 0);
  const autoDuration = cart.reduce((s,it) => s + it.duration_minutes * it.qty, 0);
  const endTime      = (startTime && autoDuration > 0) ? fromMin(toMin(startTime) + autoDuration) : '';

  const checkTimer = useRef(null);
  const checkAvailability = (d, st, empId, dur) => {
    if (!d || !st || !empId) return;
    clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(async () => {
      try {
        const appts = await bookingApi.getEmployeeAgenda(empId, { from: d, to: d });
        const data  = Array.isArray(appts) ? appts : (appts.appointments || []);
        const startMin = toMin(st);
        const endMin   = startMin + (dur || 30);
        const conflict = data.find(a => {
          if (a.status === 'cancelled') return false;
          const aStart = toMin(String(a.start_time).substring(0,5));
          const aEnd   = toMin(String(a.end_time).substring(0,5));
          return aStart < endMin && aEnd > startMin;
        });
        if (conflict) {
          const cs = String(conflict.start_time).substring(0,5);
          const ce = String(conflict.end_time).substring(0,5);
          setConflictError(`L'employé a déjà un rendez-vous de ${cs} à ${ce}, ce créneau chevauche.`);
        } else {
          setConflictError('');
        }
      } catch { /* silencieux */ }
    }, 500);
  };

  const handleDateChange = (v) => { setDate(v);      setConflictError(''); checkAvailability(v, startTime, selEmpId, autoDuration); };
  const handleTimeChange = (v) => { setStartTime(v); setConflictError(''); checkAvailability(date, v, selEmpId, autoDuration); };
  const handleEmpChange  = (v) => { setSelEmpId(v);  setConflictError(''); checkAvailability(date, startTime, v, autoDuration); };

  const handleSearchChange = (v) => {
    setClientSearch(v);
    setSelectedClient(null);
    clearTimeout(searchTimer.current);
    const trimmed = v.trim();
    // Min 2 caracteres : evite de balancer une requete des le 1er char (qui
    // ramenerait quasiment toute la base et surchargerait le backend pour rien).
    if (trimmed.length < 2) { setClientResults([]); setClientSearchBusy(false); return; }
    setClientSearchBusy(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await clientsApi.search(trimmed);
        setClientResults(Array.isArray(res) ? res : (res.clients || []));
      } catch { setClientResults([]); }
      finally { setClientSearchBusy(false); }
    }, 350);
  };

  const pickClient = (cl) => {
    const name = `${cl.first_name||''} ${cl.last_name||''}`.trim() || cl.email || cl.phone || 'Client';
    setSelectedClient({ name, email: cl.email||'', phone: cl.phone||'' });
    setClientSearch(name);
    setClientResults([]);
  };

  const addSvc = (svc) => setCart(p => {
    const i = p.findIndex(x => x.service_id === svc.id);
    if (i >= 0) { const n = [...p]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
    return [...p, {
      service_id: svc.id, service_name: svc.name, qty: 1,
      unit_price: parseFloat(svc.price) || 0,
      duration_minutes: svc.duration_minutes || 0,
      color: svc.color || t.text,
    }];
  });
  const changeQty = (idx, d) => setCart(p => {
    const n = [...p]; const q = (n[idx].qty || 1) + d;
    if (q <= 0) return p.filter((_, j) => j !== idx);
    n[idx] = { ...n[idx], qty: q };
    return n;
  });

  const clientOk = selectedClient !== null
    || (clientMode === 'new' && (newClient.first_name.trim() || newClient.last_name.trim()))
    || (clientMode === 'search' && clientSearch.trim().length >= 2);

  const clientName = selectedClient
    ? selectedClient.name
    : clientMode === 'new'
      ? `${newClient.first_name} ${newClient.last_name}`.trim()
      : clientSearch.trim();
  const clientEmail = selectedClient?.email || (clientMode === 'new' ? newClient.email : '');
  const clientPhone = selectedClient?.phone || (clientMode === 'new' ? newClient.phone : '');

  // Bloquer la création d'un RDV dans le passé (date OU heure même jour).
  // Walk-in a posteriori → passer par la caisse (création de transaction
  // sans RDV). Aligné avec ApptActionModal.editIsPast.
  const todayStr = svLocal(new Date());
  const nowHHMM = new Date().toTimeString().slice(0,5);
  const isPastDate = date && date < todayStr;
  const isPastTime = date === todayStr && startTime && startTime < nowHHMM;
  const isPast = isPastDate || isPastTime;
  const canSave = clientOk && selEmpId && date && startTime && !conflictError && !isPast;

  const doSave = async () => {
    setConflictError('');
    setSaving(true);
    try {
      await onSave({
        employee_id:   selEmpId,
        client_name:   clientName || 'Client',
        client_email:  clientEmail || null,
        client_phone:  clientPhone || null,
        date,
        start_time:    startTime,
        notes:         notes || null,
        items:         cart,
        total_amount:  autoTotal,
        total_duration: autoDuration || 30,
      });
      const empName = activeEmps.find(e => e.id === selEmpId)?.name;
      setConfirmed({ name: clientName, date, startTime, empName, sentEmail: !!clientEmail });
    } catch(e) {
      // Toutes les erreurs de save (conflit, absence, slot indispo, réseau)
      // s'affichent maintenant dans la zone d'alerte rouge de la popup, plus
      // jamais en alert() natif. Le pattern matching est fait sur version
      // normalisée (accents retirés) pour couvrir les messages backend
      // accentués comme 'déjà un RDV'.
      const msg = e.message || 'Une erreur est survenue.';
      setConflictError(msg);
      // Scroll la zone d'erreur dans le viewport pour que l'employé la voie
      // immédiatement (le formulaire peut être long sur mobile).
      setTimeout(() => {
        try {
          document.querySelector('[data-quick-add-error]')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch {}
      }, 50);
    } finally { setSaving(false); }
  };

  const handleSave = () => {
    if (!canSave || saving) return;
    doSave();
  };

  // Styles communs
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 14,
    background: t.inputBg,
    border: `0.5px solid ${t.borderInput}`,
    color: t.text,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const sectionCard = {
    borderRadius: 12,
    overflow: 'hidden',
    background: t.card,
    border: `0.5px solid ${t.border}`,
  };

  const sectionHeaderStyle = {
    padding: '10px 16px',
    background: t.cardAlt,
    borderBottom: `0.5px solid ${t.border}`,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  // ── Popup confirmation ─────────────────────────────────────────────────
  if (confirmed) return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 300,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
      }} />
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 380,
        borderRadius: 16,
        background: t.elevated,
        border: `0.5px solid ${t.border}`,
        padding: 24,
        boxShadow: t.shadowModal,
        textAlign: 'center',
      }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 12,
          background: '#f0fdf4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 14px',
          color: '#10b981',
        }}>
          <I.Check width={26} height={26} />
        </div>
        <p style={{ fontSize:17, fontWeight:500, color:t.text, margin:'0 0 8px' }}>
          Rendez-vous cree
        </p>
        <p style={{ fontSize:13, color:t.muted, margin:'0 0 18px', lineHeight:1.6 }}>
          <span style={{ color:t.text, fontWeight:500 }}>{confirmed.name}</span><br/>
          {confirmed.date} a {confirmed.startTime}
          {confirmed.empName && <> · {confirmed.empName}</>}
        </p>
        {confirmed.sentEmail && (
          <div style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: '#eef2ff',
            borderLeft: '2px solid #6366f1',
            marginBottom: 14,
          }}>
            <p style={{ fontSize:12, color:'#4338ca', margin:0 }}>
              Email de confirmation envoye au client
            </p>
          </div>
        )}
        <Button fullWidth onClick={onClose}>Fermer</Button>
      </div>
    </div>
  );

  // ── Rendu principal ────────────────────────────────────────────────────
  return (
    <Modal open={true} onClose={onClose} title="Nouveau rendez-vous" theme={t} maxW={560}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

        {/* ── CLIENT ── */}
        <div style={sectionCard}>
          <div style={sectionHeaderStyle}>
            <p style={{ margin:0, fontSize:12, fontWeight:500, color:t.muted, flex:1 }}>Client</p>
            <SegmentedControl
              value={clientMode}
              onChange={setClientMode}
              options={[
                { value:'search', label:'Rechercher' },
                { value:'new',    label:'Nouveau' },
              ]}
            />
          </div>
          <div style={{ padding:14 }}>
            {clientMode === 'search' ? (
              <div>
                <div style={{ position:'relative' }}>
                  <input
                    value={clientSearch}
                    onChange={e=>handleSearchChange(e.target.value)}
                    placeholder="Nom, email, telephone…"
                    style={{ ...inputStyle, paddingRight: clientSearchBusy ? 36 : 12 }}
                  />
                  {clientSearchBusy && (
                    <div style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      border: `0.5px solid ${t.border}`,
                      borderTopColor: t.text,
                      animation: 'spin .7s linear infinite',
                    }}/>
                  )}
                </div>
                {clientResults.length > 0 && !selectedClient && (
                  <div style={{
                    marginTop: 6,
                    border: `0.5px solid ${t.border}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                    maxHeight: 200,
                    overflowY: 'auto',
                  }}>
                    {clientResults.slice(0,6).map(cl => (
                      <button
                        key={cl.id}
                        type="button"
                        onClick={() => pickClient(cl)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          borderBottom: `0.5px solid ${t.border}`,
                          textAlign: 'left',
                          fontFamily: 'inherit',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = t.cardAlt}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: t.text,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: t.bg,
                          fontWeight: 500,
                          fontSize: 13,
                        }}>
                          {(cl.first_name||cl.last_name||cl.email||'?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>
                            {[cl.first_name, cl.last_name].filter(Boolean).join(' ') || '—'}
                          </p>
                          <p style={{ margin:0, fontSize:11, color:t.muted }}>
                            {[cl.email, cl.phone].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                        <span style={{ color:t.muted, flexShrink:0, display:'inline-flex' }}>
                          <I.ChevR width={14} height={14} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedClient && (
                  <div style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#f0fdf4',
                    borderLeft: '2px solid #10b981',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:13, fontWeight:500, color:'#065f46' }}>{selectedClient.name}</p>
                      <p style={{ margin:0, fontSize:11, color:t.muted }}>
                        {[selectedClient.email, selectedClient.phone].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedClient(null); setClientSearch(''); setClientResults([]); }}
                      aria-label="Retirer"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: t.muted,
                        fontSize: 15,
                        padding: 4,
                        fontFamily: 'inherit',
                      }}
                    >✕</button>
                  </div>
                )}
                {clientSearch && !selectedClient && clientResults.length === 0 && !clientSearchBusy && clientSearch.length >= 2 && (
                  <p style={{ margin:'8px 0 0', fontSize:12, color:t.muted, textAlign:'center' }}>
                    Aucun resultat —{' '}
                    <button
                      type="button"
                      onClick={() => { setClientMode('new'); setNewClient(p => ({
                        ...p,
                        first_name: clientSearch.split(' ')[0] || '',
                        last_name: clientSearch.split(' ').slice(1).join(' ') || '',
                      })); }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: t.text,
                        fontWeight: 500,
                        fontSize: 12,
                        textDecoration: 'underline',
                        fontFamily: 'inherit',
                      }}
                    >Creer un nouveau client</button>
                  </p>
                )}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div>
                    <Label>Prenom *</Label>
                    <input
                      value={newClient.first_name}
                      onChange={e=>setNewClient(p=>({...p,first_name:e.target.value}))}
                      placeholder="Prenom"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <Label>Nom *</Label>
                    <input
                      value={newClient.last_name}
                      onChange={e=>setNewClient(p=>({...p,last_name:e.target.value}))}
                      placeholder="Nom"
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div>
                  <Label>Email</Label>
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={e=>setNewClient(p=>({...p,email:e.target.value}))}
                    placeholder="client@email.com"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <Label>Telephone</Label>
                  <input
                    type="tel"
                    value={newClient.phone}
                    onChange={e=>setNewClient(p=>({...p,phone:e.target.value}))}
                    placeholder="06 00 00 00 00"
                    style={inputStyle}
                  />
                </div>
                {newClient.email && (
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#f0fdf4',
                    borderLeft: '2px solid #10b981',
                  }}>
                    <p style={{ margin:0, fontSize:12, color:'#065f46' }}>
                      Email de confirmation envoye automatiquement
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── EMPLOYE ── */}
        <div style={sectionCard}>
          <div style={sectionHeaderStyle}>
            <p style={{ margin:0, fontSize:12, fontWeight:500, color:t.muted }}>Employe *</p>
          </div>
          <div style={{ padding:'10px 12px', display:'flex', flexWrap:'wrap', gap:8 }}>
            {activeEmps.map(emp => {
              const active = selEmpId === emp.id;
              const accent = emp.avatar_color || t.text;
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => handleEmpChange(emp.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    border: `0.5px solid ${active ? accent : t.border}`,
                    background: active ? `${accent}15` : 'transparent',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 500,
                    fontSize: 12,
                    flexShrink: 0,
                  }}>{emp.name.charAt(0)}</div>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: active ? accent : t.text,
                  }}>{emp.name}</span>
                  {active && (
                    <span style={{ color: accent, display: 'inline-flex' }}>
                      <I.Check width={13} height={13} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── DATE & HEURE ── */}
        <div style={sectionCard}>
          <div style={sectionHeaderStyle}>
            <p style={{ margin:0, fontSize:12, fontWeight:500, color:t.muted }}>Date & heure *</p>
          </div>
          <div style={{ padding:'12px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <Label>Date *</Label>
              <input type="date" min={todayStr} value={date}
                onChange={e=>handleDateChange(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <Label>Heure *</Label>
              <input type="time" value={startTime}
                min={date === todayStr ? nowHHMM : undefined}
                onChange={e=>handleTimeChange(e.target.value)} style={inputStyle} />
            </div>
          </div>
          {isPast && (
            <div style={{ margin:'0 14px 12px', padding:'10px 12px', borderRadius:8,
              background:'rgba(239,68,68,0.08)',
              border:'0.5px solid rgba(239,68,68,0.3)',
              borderLeft:'2px solid #ef4444' }}>
              <p style={{ margin:0, fontSize:12, color:'#991b1b', fontWeight:500 }}>
                {isPastDate ? "Cette date est déjà passée." : "Cette heure est déjà passée."}
              </p>
              <p style={{ margin:'4px 0 0', fontSize:11, color:'#991b1b' }}>
                Les RDV ne peuvent pas être créés dans le passé. Pour enregistrer une prestation déjà rendue, passez par la caisse.
              </p>
            </div>
          )}
          {endTime && (
            <div style={{
              margin: '0 14px 12px',
              padding: '8px 12px',
              borderRadius: 8,
              background: '#fffbeb',
              borderLeft: '2px solid #f59e0b',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <p style={{ margin:0, fontSize:12, fontWeight:500, color:'#92400e' }}>
                Fin prevue a <span style={{ fontWeight:500 }}>{endTime}</span> · {autoDuration}min
              </p>
            </div>
          )}
        </div>

        {/* ── PRESTATIONS ── */}
        <div style={sectionCard}>
          <div style={sectionHeaderStyle}>
            <p style={{ margin:0, fontSize:12, fontWeight:500, color:t.muted, flex:1 }}>Prestations</p>
            {cart.length > 0 && (
              <span style={{
                fontSize: 11,
                fontWeight: 500,
                padding: '2px 10px',
                borderRadius: 8,
                background: '#f0fdf4',
                color: '#065f46',
              }}>
                {autoTotal.toFixed(2)} € · {autoDuration}min
              </span>
            )}
          </div>
          {groupKeys.length > 0 ? (
            <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', gap:6 }}>
              {groupKeys.map(catName => {
                const svcs   = groupsObj[catName];
                const isOpen = openCat === catName;
                const qtyInCat = svcs.reduce((s, svc) => {
                  const it = cart.find(i => i.service_id === svc.id);
                  return s + (it ? it.qty : 0);
                }, 0);
                return (
                  <div key={catName} style={{
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: `0.5px solid ${t.border}`,
                  }}>
                    <button
                      type="button"
                      onClick={() => setOpenCat(isOpen ? null : catName)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '11px 14px',
                        background: isOpen ? t.cardAlt : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                      }}
                    >
                      <p style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 500,
                        color: t.text,
                        flex: 1,
                      }}>{catName}</p>
                      {qtyInCat > 0 && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: '1px 7px',
                          borderRadius: 8,
                          background: '#f0fdf4',
                          color: '#065f46',
                        }}>{qtyInCat}</span>
                      )}
                      <span style={{ fontSize:11, color:t.muted }}>{svcs.length}</span>
                      <span style={{
                        color: t.muted,
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform .15s',
                        flexShrink: 0,
                        display: 'inline-flex',
                      }}>
                        <I.ChevD width={13} height={13} />
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{
                        padding: '6px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        borderTop: `0.5px solid ${t.border}`,
                      }}>
                        {svcs.map(svc => {
                          const inCart = cart.find(it => it.service_id === svc.id);
                          const accent = svc.color || t.text;
                          return (
                            <button
                              key={svc.id}
                              type="button"
                              onClick={() => addSvc(svc)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '10px 12px',
                                borderRadius: 8,
                                textAlign: 'left',
                                cursor: 'pointer',
                                border: `0.5px solid ${inCart ? accent : t.border}`,
                                background: inCart ? `${accent}12` : 'transparent',
                                fontFamily: 'inherit',
                              }}
                            >
                              <div style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                flexShrink: 0,
                                background: `${accent}20`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <div style={{ width:10, height:10, borderRadius:'50%', background:accent }}/>
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <p style={{
                                  margin: 0,
                                  fontSize: 13,
                                  fontWeight: 500,
                                  color: inCart ? accent : t.text,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>{svc.name}</p>
                                <p style={{ margin:0, fontSize:11, color:t.muted }}>
                                  {svc.duration_minutes}min
                                  {parseFloat(svc.price) > 0 ? ` · ${parseFloat(svc.price).toFixed(2)} €` : ''}
                                </p>
                              </div>
                              {inCart ? (
                                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); changeQty(cart.indexOf(inCart), -1); }}
                                    style={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: 6,
                                      background: 'transparent',
                                      color: '#991b1b',
                                      border: '0.5px solid rgba(239,68,68,0.3)',
                                      cursor: 'pointer',
                                      fontWeight: 500,
                                      fontSize: 13,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontFamily: 'inherit',
                                    }}
                                  >−</button>
                                  <span style={{
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: accent,
                                    minWidth: 18,
                                    textAlign: 'center',
                                  }}>{inCart.qty}</span>
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); addSvc(svc); }}
                                    style={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: 6,
                                      background: 'transparent',
                                      color: t.text,
                                      border: `0.5px solid ${t.borderStrong}`,
                                      cursor: 'pointer',
                                      fontWeight: 500,
                                      fontSize: 13,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontFamily: 'inherit',
                                    }}
                                  >+</button>
                                </div>
                              ) : (
                                <span style={{ color:t.muted, flexShrink:0, display:'inline-flex' }}>
                                  <I.Plus width={14} height={14} />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding:'20px', textAlign:'center' }}>
              <p style={{ margin:0, fontSize:13, color:t.muted }}>Aucune prestation configuree</p>
            </div>
          )}
        </div>

        {/* ── NOTES ── */}
        <div>
          <Label>Notes (optionnel)</Label>
          <textarea
            value={notes}
            onChange={e=>setNotes(e.target.value)}
            rows={2}
            placeholder="Informations particulieres…"
            style={{ ...inputStyle, resize:'none' }}
          />
        </div>

        {/* ── ALERTE CONFLIT / ERREUR SAVE ── */}
        {conflictError && (
          <div data-quick-add-error style={{
            padding: '14px 16px',
            borderRadius: 12,
            background: '#fef2f2',
            border: '0.5px solid rgba(239,68,68,0.3)',
            borderLeft: '2px solid #ef4444',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#991b1b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink:0, marginTop:1 }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:13, fontWeight:500, color:'#991b1b' }}>
                Créneau indisponible
              </p>
              <p style={{ margin:'4px 0 0', fontSize:12, color:'#991b1b', lineHeight:1.5 }}>
                {conflictError}
              </p>
              <p style={{ margin:'8px 0 0', fontSize:11, color:'#991b1b', lineHeight:1.5 }}>
                Choisissez une autre heure, une autre date ou un autre employé pour pouvoir créer ce rendez-vous.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConflictError('')}
              aria-label="Fermer"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#991b1b',
                fontSize: 15,
                padding: 0,
                flexShrink: 0,
                fontFamily: 'inherit',
              }}
            >✕</button>
          </div>
        )}

        {/* ── BOUTON CREER ── */}
        <Button
          fullWidth
          size="large"
          disabled={!canSave || saving}
          onClick={handleSave}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}
        >
          {saving ? (
            <>
              <div style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: `0.5px solid rgba(255,255,255,0.3)`,
                borderTopColor: t.bg,
                animation: 'spin .7s linear infinite',
              }}/>
              Creation en cours…
            </>
          ) : (
            <>Creer le rendez-vous{autoTotal > 0 ? ` · ${autoTotal.toFixed(2)} €` : ''}</>
          )}
        </Button>

      </div>
    </Modal>
  );
}
