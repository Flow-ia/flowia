// src/pages/employee-agenda/modals/QuickAddApptModal.jsx
import { useState, useEffect, useRef } from 'react';
import { bookingApi, clientsApi } from '../../../utils/api';
import { Modal } from '../../../components/UI';
import { svLocal, toMin, fromMin } from '../helpers';

export default function QuickAddApptModal({ employees, services, onSave, onClose, theme: t }) {
  const isDark = t.mode === 'dark';
  const IS = { background:isDark?'rgba(255,255,255,0.05)':'#f4f4f6', border:`1px solid ${isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.08)'}`, color:t.text, fontFamily:'inherit' };

  // ── États déclarés dans le bon ordre ──────────────────────────────────
  const [clientSearch,      setClientSearch]      = useState('');
  const [clientResults,     setClientResults]     = useState([]);
  const [clientSearchBusy,  setClientSearchBusy]  = useState(false);
  const [selectedClient,    setSelectedClient]    = useState(null);
  const [clientMode,        setClientMode]        = useState('search');
  const [newClient,         setNewClient]         = useState({ first_name:'', last_name:'', email:'', phone:'' });
  const [bookingCats,       setBookingCats]       = useState([]);
  const [openCat,           setOpenCat]           = useState(null);
  const [cart,              setCart]              = useState([]);
  const [date,              setDate]              = useState(svLocal(new Date()));
  const [startTime,         setStartTime]         = useState('09:00');
  const [notes,             setNotes]             = useState('');
  const [selEmpId,          setSelEmpId]          = useState('');
  const [saving,            setSaving]            = useState(false);
  const [confirmed,         setConfirmed]         = useState(null);
  const [conflictError,     setConflictError]     = useState('');
  const searchTimer = useRef(null);

  // ── Chargement employé par défaut ──────────────────────────────────────
  const activeEmps = (employees||[]).filter(e => e.is_active !== false);
  useEffect(() => {
    if (activeEmps.length > 0 && !selEmpId) setSelEmpId(activeEmps[0].id);
  }, [employees]); // eslint-disable-line

  // ── Chargement catégories booking ──────────────────────────────────────
  useEffect(() => {
    bookingApi.getServiceCategories().then(setBookingCats).catch(()=>{});
  }, []);

  // ── Services groupés par catégorie booking ─────────────────────────────
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

  // Ouvrir la première catégorie quand les données arrivent
  useEffect(() => {
    if (groupKeys.length > 0 && !openCat) setOpenCat(groupKeys[0]);
  }, [bookingCats.length, actSvcs.length]); // eslint-disable-line

  // ── Calculs automatiques ───────────────────────────────────────────────
  const autoTotal    = cart.reduce((s,it) => s + it.unit_price * it.qty, 0);
  const autoDuration = cart.reduce((s,it) => s + it.duration_minutes * it.qty, 0);
  const endTime      = (startTime && autoDuration > 0) ? fromMin(toMin(startTime) + autoDuration) : '';

  // ── Handlers avec reset conflit + vérification temps réel ───────────────
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
          setConflictError(`L'employé a déjà un RDV de ${cs} à ${ce} sur ce créneau.`);
        } else {
          setConflictError('');
        }
      } catch { /* silencieux */ }
    }, 500);
  };

  const handleDateChange = (v) => { setDate(v);      setConflictError(''); checkAvailability(v, startTime, selEmpId, autoDuration); };
  const handleTimeChange = (v) => { setStartTime(v); setConflictError(''); checkAvailability(date, v, selEmpId, autoDuration); };
  const handleEmpChange  = (v) => { setSelEmpId(v);  setConflictError(''); checkAvailability(date, startTime, v, autoDuration); };

  // ── Recherche client ───────────────────────────────────────────────────
  const handleSearchChange = (v) => {
    setClientSearch(v);
    setSelectedClient(null);
    clearTimeout(searchTimer.current);
    if (!v.trim()) { setClientResults([]); return; }
    setClientSearchBusy(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await clientsApi.search(v.trim());
        setClientResults(Array.isArray(res) ? res : (res.clients || []));
      } catch { setClientResults([]); }
      finally { setClientSearchBusy(false); }
    }, 300);
  };

  const pickClient = (cl) => {
    const name = `${cl.first_name||''} ${cl.last_name||''}`.trim() || cl.email || cl.phone || 'Client';
    setSelectedClient({ name, email: cl.email||'', phone: cl.phone||'' });
    setClientSearch(name);
    setClientResults([]);
  };

  // ── Panier services ────────────────────────────────────────────────────
  const addSvc = (svc) => setCart(p => {
    const i = p.findIndex(x => x.service_id === svc.id);
    if (i >= 0) { const n=[...p]; n[i]={...n[i],qty:n[i].qty+1}; return n; }
    return [...p, { service_id:svc.id, service_name:svc.name, qty:1,
      unit_price:parseFloat(svc.price)||0, duration_minutes:svc.duration_minutes||0, color:svc.color||'#1a73e8' }];
  });
  const changeQty = (idx, d) => setCart(p => {
    const n=[...p]; const q=(n[idx].qty||1)+d;
    if (q<=0) return p.filter((_,j)=>j!==idx);
    n[idx]={...n[idx],qty:q}; return n;
  });

  // ── Validation client ──────────────────────────────────────────────────
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

  const canSave = clientOk && selEmpId && date && startTime && !conflictError;

  // ── Sauvegarde ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!canSave || saving) return;
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
      const msg = e.message || 'Erreur';
      if (msg.includes('déjà un RDV') || msg.includes('conflit') || msg.includes('occupé')
       || msg.includes('absent') || msg.includes('disponible') || msg.includes('chevauch')) {
        setConflictError(msg);
      } else {
        alert(msg);
      }
    } finally { setSaving(false); }
  };

  // ── Popup confirmation ─────────────────────────────────────────────────
  if (confirmed) return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(8px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:380, borderRadius:24,
        background:isDark?'#161620':'#fff', border:`1px solid ${t.border}`, padding:28,
        boxShadow:'0 24px 64px rgba(0,0,0,0.2)', textAlign:'center' }}>
        <div style={{ width:68, height:68, borderRadius:20, background:'rgba(34,197,94,0.1)',
          display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" style={{width:34,height:34}}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <p style={{ fontSize:20, fontWeight:900, color:t.text, margin:'0 0 8px' }}>Rendez-vous créé !</p>
        <p style={{ fontSize:14, color:t.muted, margin:'0 0 20px', lineHeight:1.6 }}>
          <strong style={{color:t.text}}>{confirmed.name}</strong><br/>
          {confirmed.date} à {confirmed.startTime}
          {confirmed.empName && <> · {confirmed.empName}</>}
        </p>
        {confirmed.sentEmail && (
          <div style={{ padding:'10px 14px', borderRadius:11, background:'rgba(26,115,232,0.06)',
            border:'1px solid rgba(26,115,232,0.2)', marginBottom:16 }}>
            <p style={{ fontSize:13, color:'#1a73e8', margin:0, fontWeight:600 }}>
              Email de confirmation envoyé au client
            </p>
          </div>
        )}
        <button onClick={onClose}
          style={{ width:'100%', padding:'13px', borderRadius:12, background:'#1a73e8',
            color:'white', fontWeight:800, fontSize:14, border:'none', cursor:'pointer',
            boxShadow:'0 4px 14px rgba(26,115,232,0.35)' }}>
          Fermer
        </button>
      </div>
    </div>
  );

  // ── Rendu principal ────────────────────────────────────────────────────
  return (
    <Modal open={true} onClose={onClose} title="Nouveau rendez-vous" theme={t} maxW={560}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

        {/* ── CLIENT ── */}
        <div style={{ borderRadius:14, overflow:'hidden', border:`1px solid ${t.border}` }}>
          <div style={{ padding:'10px 16px', background:isDark?'rgba(26,115,232,0.08)':'rgba(26,115,232,0.05)',
            borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2" style={{width:14,height:14}}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <p style={{ margin:0, fontSize:12, fontWeight:800, textTransform:'uppercase', letterSpacing:'.06em', color:'#1a73e8' }}>Client</p>
            <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
              {['search','new'].map(m => (
                <button key={m} onClick={()=>setClientMode(m)}
                  style={{ padding:'3px 10px', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', border:'none',
                    background:clientMode===m?'#1a73e8':'transparent',
                    color:clientMode===m?'white':t.muted }}>
                  {m==='search'?'Rechercher':'Nouveau'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding:14 }}>
            {clientMode === 'search' ? (
              <div>
                <div style={{ position:'relative' }}>
                  <input value={clientSearch} onChange={e=>handleSearchChange(e.target.value)}
                    placeholder="Nom, email, téléphone…"
                    className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none"
                    style={{...IS, paddingRight:clientSearchBusy?36:12}} />
                  {clientSearchBusy && (
                    <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                      width:14, height:14, borderRadius:'50%',
                      border:'2px solid rgba(26,115,232,0.2)', borderTopColor:'#1a73e8',
                      animation:'spin .7s linear infinite' }}/>
                  )}
                </div>
                {clientResults.length > 0 && !selectedClient && (
                  <div style={{ marginTop:6, border:`1px solid ${t.border}`, borderRadius:10, overflow:'hidden', maxHeight:200, overflowY:'auto' }}>
                    {clientResults.slice(0,6).map(cl => (
                      <button key={cl.id} onClick={()=>pickClient(cl)}
                        style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                          padding:'10px 12px', background:'none', border:'none', cursor:'pointer',
                          borderBottom:`1px solid ${t.border}`, textAlign:'left' }}
                        onMouseEnter={e=>e.currentTarget.style.background=isDark?'rgba(255,255,255,0.04)':'#f9f9fb'}
                        onMouseLeave={e=>e.currentTarget.style.background='none'}>
                        <div style={{ width:32, height:32, borderRadius:99, flexShrink:0,
                          background:'#1a73e8', display:'flex', alignItems:'center', justifyContent:'center',
                          color:'white', fontWeight:800, fontSize:13 }}>
                          {(cl.first_name||cl.last_name||cl.email||'?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ margin:0, fontSize:13, fontWeight:700, color:t.text }}>
                            {[cl.first_name, cl.last_name].filter(Boolean).join(' ') || '—'}
                          </p>
                          <p style={{ margin:0, fontSize:11, color:t.muted }}>
                            {[cl.email, cl.phone].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{width:14,height:14,color:t.muted,flexShrink:0}}>
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
                {selectedClient && (
                  <div style={{ marginTop:8, padding:'10px 12px', borderRadius:10,
                    background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.2)',
                    display:'flex', alignItems:'center', gap:10 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"
                      style={{width:16,height:16,flexShrink:0}}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <div style={{ flex:1 }}>
                      <p style={{ margin:0, fontSize:13, fontWeight:700, color:t.text }}>{selectedClient.name}</p>
                      <p style={{ margin:0, fontSize:11, color:t.muted }}>
                        {[selectedClient.email, selectedClient.phone].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <button onClick={()=>{ setSelectedClient(null); setClientSearch(''); setClientResults([]); }}
                      style={{ background:'none', border:'none', cursor:'pointer', color:t.muted, fontSize:16, padding:0 }}>✕</button>
                  </div>
                )}
                {clientSearch && !selectedClient && clientResults.length === 0 && !clientSearchBusy && clientSearch.length >= 2 && (
                  <p style={{ margin:'8px 0 0', fontSize:12, color:t.muted, textAlign:'center' }}>
                    Aucun résultat —{' '}
                    <button onClick={()=>{ setClientMode('new'); setNewClient(p=>({...p,
                      first_name:clientSearch.split(' ')[0]||'',
                      last_name:clientSearch.split(' ').slice(1).join(' ')||'' })); }}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#1a73e8', fontWeight:700, fontSize:12 }}>
                      Créer un nouveau client
                    </button>
                  </p>
                )}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:5 }}>Prénom *</label>
                    <input value={newClient.first_name} onChange={e=>setNewClient(p=>({...p,first_name:e.target.value}))}
                      placeholder="Prénom" className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:5 }}>Nom *</label>
                    <input value={newClient.last_name} onChange={e=>setNewClient(p=>({...p,last_name:e.target.value}))}
                      placeholder="Nom" className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
                  </div>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:5 }}>Email</label>
                  <input type="email" value={newClient.email} onChange={e=>setNewClient(p=>({...p,email:e.target.value}))}
                    placeholder="client@email.com" className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:5 }}>Téléphone</label>
                  <input type="tel" value={newClient.phone} onChange={e=>setNewClient(p=>({...p,phone:e.target.value}))}
                    placeholder="06 00 00 00 00" className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
                </div>
                {newClient.email && (
                  <div style={{ padding:'8px 12px', borderRadius:10, background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.12)' }}>
                    <p style={{ margin:0, fontSize:12, color:'#16a34a', fontWeight:600 }}>Email de confirmation envoyé automatiquement</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── EMPLOYÉ ── */}
        <div style={{ borderRadius:14, overflow:'hidden', border:`1px solid ${t.border}` }}>
          <div style={{ padding:'10px 16px', background:isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)',
            borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2" style={{width:14,height:14}}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <p style={{ margin:0, fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'.06em', color:t.muted }}>Employé *</p>
          </div>
          <div style={{ padding:'10px 12px', display:'flex', flexWrap:'wrap', gap:8 }}>
            {activeEmps.map(emp => (
              <button key={emp.id} onClick={()=>handleEmpChange(emp.id)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, cursor:'pointer',
                  border:`1.5px solid ${selEmpId===emp.id ? (emp.avatar_color||'#1a73e8') : t.border}`,
                  background: selEmpId===emp.id ? `${emp.avatar_color||'#1a73e8'}15` : (isDark?'rgba(255,255,255,0.03)':'#fafafa') }}>
                <div style={{ width:28, height:28, borderRadius:99, background:emp.avatar_color||'#1a73e8',
                  display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:800, fontSize:12, flexShrink:0 }}>
                  {emp.name.charAt(0)}
                </div>
                <span style={{ fontSize:14, fontWeight:700, color:selEmpId===emp.id?(emp.avatar_color||'#1a73e8'):t.text }}>{emp.name}</span>
                {selEmpId===emp.id && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{width:13,height:13,color:emp.avatar_color||'#1a73e8'}}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── DATE & HEURE ── */}
        <div style={{ borderRadius:14, overflow:'hidden', border:`1px solid ${t.border}` }}>
          <div style={{ padding:'10px 16px', background:isDark?'rgba(245,158,11,0.06)':'rgba(245,158,11,0.04)',
            borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" style={{width:14,height:14}}>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <p style={{ margin:0, fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'.06em', color:'#f59e0b' }}>Date & Heure *</p>
          </div>
          <div style={{ padding:'12px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:5 }}>Date *</label>
              <input type="date" value={date} onChange={e=>handleDateChange(e.target.value)}
                className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:5 }}>Heure *</label>
              <input type="time" value={startTime} onChange={e=>handleTimeChange(e.target.value)}
                className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
            </div>
          </div>
          {endTime && (
            <div style={{ margin:'0 14px 12px', padding:'8px 12px', borderRadius:10,
              background:isDark?'rgba(245,158,11,0.08)':'rgba(245,158,11,0.06)',
              border:'1px solid rgba(245,158,11,0.2)', display:'flex', alignItems:'center', gap:8 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" style={{width:13,height:13}}>
                <path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/>
              </svg>
              <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#b45309' }}>
                Fin prévue à <strong>{endTime}</strong> · {autoDuration}min
              </p>
            </div>
          )}
        </div>

        {/* ── PRESTATIONS ── */}
        <div style={{ borderRadius:14, overflow:'hidden', border:`1px solid ${t.border}` }}>
          <div style={{ padding:'10px 16px', background:isDark?'rgba(16,185,129,0.06)':'rgba(16,185,129,0.04)',
            borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" style={{width:14,height:14}}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            <p style={{ margin:0, fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'.06em', color:'#10b981' }}>Prestations</p>
            {cart.length > 0 && (
              <span style={{ marginLeft:'auto', fontSize:11, fontWeight:800, padding:'2px 10px', borderRadius:99,
                background:'rgba(16,185,129,0.12)', color:'#10b981' }}>
                {autoTotal.toFixed(2)} € · {autoDuration}min
              </span>
            )}
          </div>
          {groupKeys.length > 0 ? (
            <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', gap:6 }}>
              {groupKeys.map(catName => {
                const svcs   = groupsObj[catName];
                const isOpen = openCat === catName;
                const qtyInCat = svcs.reduce((s,svc)=>{
                  const it=cart.find(i=>i.service_id===svc.id); return s+(it?it.qty:0);
                }, 0);
                return (
                  <div key={catName} style={{ borderRadius:10, overflow:'hidden', border:`1px solid ${t.border}` }}>
                    <button onClick={()=>setOpenCat(isOpen ? null : catName)}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'11px 14px',
                        background:isOpen ? (isDark?'rgba(16,185,129,0.08)':'rgba(16,185,129,0.05)') : (isDark?'rgba(255,255,255,0.02)':'#fafafa'),
                        border:'none', cursor:'pointer', textAlign:'left' }}>
                      <p style={{ margin:0, fontSize:14, fontWeight:800,
                        color:isOpen?'#10b981':t.text, flex:1 }}>{catName}</p>
                      {qtyInCat > 0 && (
                        <span style={{ fontSize:11, fontWeight:800, padding:'1px 7px', borderRadius:99,
                          background:'rgba(16,185,129,0.15)', color:'#10b981' }}>{qtyInCat}</span>
                      )}
                      <span style={{ fontSize:11, color:t.muted }}>{svcs.length}</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        style={{ width:13, height:13, color:t.muted,
                          transform:isOpen?'rotate(180deg)':'none', transition:'transform .15s', flexShrink:0 }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {isOpen && (
                      <div style={{ padding:'6px 8px', display:'flex', flexDirection:'column', gap:4,
                        borderTop:`1px solid ${t.border}` }}>
                        {svcs.map(svc => {
                          const inCart = cart.find(it => it.service_id === svc.id);
                          const accent = svc.color || '#10b981';
                          return (
                            <button key={svc.id} onClick={()=>addSvc(svc)}
                              style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 12px',
                                borderRadius:9, textAlign:'left', cursor:'pointer',
                                border:`1.5px solid ${inCart ? accent : (isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.07)')}`,
                                background:inCart ? `${accent}10` : (isDark?'rgba(255,255,255,0.02)':'#fff') }}>
                              <div style={{ width:32, height:32, borderRadius:8, flexShrink:0,
                                background:`${accent}20`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <div style={{ width:12, height:12, borderRadius:99, background:accent }}/>
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <p style={{ margin:0, fontSize:14, fontWeight:700,
                                  color:inCart?accent:t.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  {svc.name}
                                </p>
                                <p style={{ margin:0, fontSize:11, color:t.muted }}>
                                  {svc.duration_minutes}min{parseFloat(svc.price)>0 ? ` · ${parseFloat(svc.price).toFixed(2)} €` : ''}
                                </p>
                              </div>
                              {inCart ? (
                                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                                  <button onClick={e=>{e.stopPropagation(); changeQty(cart.indexOf(inCart),-1);}}
                                    style={{ width:24, height:24, borderRadius:6,
                                      background:'rgba(239,68,68,0.12)', color:'#ef4444',
                                      border:'none', cursor:'pointer', fontWeight:800, fontSize:14,
                                      display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
                                  <span style={{ fontSize:13, fontWeight:800, color:accent,
                                    minWidth:18, textAlign:'center' }}>{inCart.qty}</span>
                                  <button onClick={e=>{e.stopPropagation(); addSvc(svc);}}
                                    style={{ width:24, height:24, borderRadius:6,
                                      background:`${accent}15`, color:accent,
                                      border:'none', cursor:'pointer', fontWeight:800, fontSize:14,
                                      display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                                </div>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                  style={{width:14,height:14,color:t.muted,flexShrink:0}}>
                                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                </svg>
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
              <p style={{ margin:0, fontSize:13, color:t.muted }}>Aucune prestation configurée</p>
            </div>
          )}
        </div>

        {/* ── NOTES ── */}
        <div>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:6 }}>Notes (optionnel)</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
            placeholder="Informations particulières…"
            className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none resize-none" style={IS} />
        </div>

        {/* ── ALERTE CONFLIT ── */}
        {conflictError && (
          <div style={{ padding:'12px 16px', borderRadius:12, background:'rgba(239,68,68,0.06)',
            border:'1px solid rgba(239,68,68,0.25)', display:'flex', alignItems:'flex-start', gap:10 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"
              style={{width:18,height:18,flexShrink:0,marginTop:1}}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div style={{ flex:1 }}>
              <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#dc2626' }}>Créneau indisponible</p>
              <p style={{ margin:'3px 0 0', fontSize:12, color:'#b91c1c', lineHeight:1.5 }}>{conflictError}</p>
              <p style={{ margin:'4px 0 0', fontSize:11, color:'#b91c1c', fontWeight:600 }}>
                Merci de choisir une autre heure, une autre date ou un autre employé.
              </p>
            </div>
            <button onClick={()=>setConflictError('')}
              style={{ background:'none', border:'none', cursor:'pointer', color:'#b91c1c', fontSize:16, padding:0, flexShrink:0 }}>✕</button>
          </div>
        )}

        {/* ── BOUTON CRÉER ── */}
        <button disabled={!canSave || saving} onClick={handleSave}
          style={{ padding:'16px', borderRadius:14, border:'none',
            cursor: canSave && !saving ? 'pointer' : 'not-allowed',
            background: canSave ? '#1a73e8' : (isDark?'rgba(255,255,255,0.06)':'#e5e7eb'),
            color: canSave ? 'white' : t.muted,
            fontSize:16, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', gap:10,
            opacity: saving ? 0.6 : 1,
            boxShadow: canSave ? '0 4px 16px rgba(26,115,232,0.3)' : 'none',
            transition:'all .2s' }}>
          {saving ? (
            <><div style={{ width:18, height:18, borderRadius:'50%',
              border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white',
              animation:'spin .7s linear infinite' }}/> Création en cours…</>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:18,height:18}}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Créer le rendez-vous{autoTotal > 0 ? ` · ${autoTotal.toFixed(2)} €` : ''}
            </>
          )}
        </button>

      </div>
    </Modal>
  );
}
