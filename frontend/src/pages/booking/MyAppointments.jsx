// src/pages/booking/MyAppointments.jsx
// Écran "Mes RDV" + onglets Profil et Parrainage du compte client.
import { useState, useEffect } from 'react';
import { pubApi, globalClientApi } from '../../utils/api';
import { Spinner } from './shared';

export function MyAppointments({ slug, th, onBack, onNewBooking, onLogout, initialTab = 'appts', business = null }) {
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab); // 'appts' | 'profile' | 'parrain'

  // Parrainage : code perso + historique + réductions (uniquement si compte global connecté + programme actif)
  const [refInfo,    setRefInfo]    = useState(null);   // { code, uses_count, program }
  const [refHistory, setRefHistory] = useState([]);     // filleuls
  const [refRewards, setRefRewards] = useState([]);     // toutes les réductions client
  const [refAvail,   setRefAvail]   = useState(false);  // programme dispo → afficher onglet
  const [refCopied,  setRefCopied]  = useState(false);

  // ── Profil client ──
  const [clientInfo, setClientInfo] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ff_client_info') || 'null'); } catch { return null; }
  });
  const [editFirst,  setEditFirst]  = useState('');
  const [editLast,   setEditLast]   = useState('');
  const [editEmail,  setEditEmail]  = useState('');
  const [editPhone,  setEditPhone]  = useState('');
  const [profLoad,   setProfLoad]   = useState(false);
  const [profErr,    setProfErr]    = useState('');
  const [profOk,     setProfOk]     = useState('');
  const [editing,    setEditing]    = useState(false);

  // initialiser les champs d'édition
  const startEdit = () => {
    setEditFirst(clientInfo?.first_name || '');
    setEditLast(clientInfo?.last_name   || '');
    setEditEmail(clientInfo?.email      || '');
    setEditPhone(clientInfo?.phone      || '');
    setEditing(true);
    setProfErr(''); setProfOk('');
  };
  const cancelEdit = () => { setEditing(false); setProfErr(''); setProfOk(''); };

  const saveProfile = async () => {
    if (!editFirst.trim() || !editLast.trim()) { setProfErr('Prenom et nom requis.'); return; }
    if (!editEmail.trim()) { setProfErr('Email requis.'); return; }
    setProfLoad(true); setProfErr(''); setProfOk('');
    try {
      const res = await pubApi.updateClientProfile(slug, {
        first_name: editFirst.trim(),
        last_name:  editLast.trim(),
        email:      editEmail.trim(),
        phone:      editPhone.trim() || undefined,
      });
      const updated = { ...(clientInfo||{}), ...res };
      localStorage.setItem('ff_client_info', JSON.stringify(updated));
      setClientInfo(updated);
      setEditing(false);
      setProfOk('Profil mis a jour ✓');
      setTimeout(() => setProfOk(''), 3000);
    } catch(e) { setProfErr(e.message || 'Erreur'); }
    finally { setProfLoad(false); }
  };

  useEffect(() => {
    pubApi.myAppointments(slug)
      .then(setAppts).catch(() => {}).finally(() => setLoading(false));
  }, [slug]);

  // Tenter de charger le programme parrainage (si compte global connecté et programme actif)
  useEffect(() => {
    const gcToken = localStorage.getItem('ff_gc_token');
    if (!gcToken) return;
    let cancelled = false;
    (async () => {
      try {
        const [code, hist] = await Promise.all([
          globalClientApi.myReferralCode(slug),
          globalClientApi.myReferralHistory(slug),
        ]);
        if (cancelled) return;
        setRefInfo(code);
        setRefHistory(hist.history || []);
        setRefRewards(hist.rewards || []);
        setRefAvail(true);
      } catch {
        if (!cancelled) setRefAvail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const copyReferralLink = async () => {
    if (!refInfo?.code) return;
    const url = `${window.location.origin}/book/${slug}?ref=${refInfo.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 2000);
    } catch {/* ignore */}
  };

  const cancel = (appt) => { setCancelModal(appt); };

  // ── Calcul du statut réel d'un RDV ──────────────────────────────────────────
  // Extraire une string 'YYYY-MM-DD' depuis n'importe quel format de date
  const parseDateStr = (d) => {
    if (!d) return '';
    // Si c'est un objet Date JS — utiliser les méthodes locales pour éviter le décalage UTC
    if (d instanceof Date) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    // Si c'est une string ISO avec timezone (ex: "2025-04-14T00:00:00.000Z")
    // → prendre les 10 premiers chars directement (c'est toujours YYYY-MM-DD)
    return String(d).substring(0, 10);
  };
  // Extraire 'HH:MM' depuis un time string
  const parseTimeStr = (t) => {
    if (!t) return '';
    return String(t).substring(0, 5);
  };

  const getDisplayStatus = (a) => {
    if (a.status === 'cancelled') {
      return { label:'Annule', color:'#f87171', bg:'rgba(248,113,113,0.10)', icon:'✕', canCancel:false, group:'annules' };
    }
    if (a.status === 'no_show') {
      return { label:'Absent', color:'#94a3b8', bg:'rgba(148,163,184,0.10)', icon:'-', canCancel:false, group:'passes' };
    }
    if (a.status === 'completed' || a.paid) {
      return { label: a.paid ? 'Encaisse' : 'Termine', color:'#34d399', bg:'rgba(52,211,153,0.10)', icon:'✓', canCancel:false, group:'passes' };
    }
    // Construire datetime locale — on utilise start_time comme référence
    // Un RDV dont le START est passé = classé 'passe', indépendamment du end_time
    const rawDate  = parseDateStr(a.date);
    const startRaw = parseTimeStr(a.start_time);
    const endRaw   = parseTimeStr(a.end_time);
    // Heure de début pour isPast (si inconnue → 23:59 → très permissif = futur)
    const startTimeStr = startRaw || '23:59';
    const startDateTime = rawDate ? new Date(`${rawDate}T${startTimeStr}:00`) : null;
    const isPast = startDateTime && !isNaN(startDateTime) && startDateTime < new Date();
    if (isPast) {
      return { label:'Passe', color:'#94a3b8', bg:'rgba(148,163,184,0.10)', icon:'↩', canCancel:false, group:'passes' };
    }
    // Règle 2h : annulation possible si RDV dans plus de 2h
    const canCancelByTime = !startDateTime || ((startDateTime - new Date()) / (1000 * 60 * 60)) >= 2;
    if (a.status === 'confirmed') {
      return { label:'Confirme', color:'#4ade80', bg:'rgba(74,222,128,0.10)', icon:'✓', canCancel:canCancelByTime, group:'futurs' };
    }
    return { label:'En attente', color:'#fbbf24', bg:'rgba(251,191,36,0.10)', icon:'...', canCancel:canCancelByTime, group:'futurs' };
  };

  // Formater la date proprement (supporte Date JS, ISO, YYYY-MM-DD)
  const fmtApptDate = (dateRaw) => {
    const dateStr = parseDateStr(dateRaw);
    if (!dateStr || dateStr.length < 10) return '-';
    const d = new Date(`${dateStr}T12:00:00`);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  };

  const inpStyle = {
    width:'100%', padding:'12px 14px', borderRadius:12, outline:'none',
    background:th.inputBg, border:`1.5px solid ${th.inputBorder}`,
    color:th.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box',
  };

  // Grouper les RDV par catégorie
  const apptsFuturs   = appts.filter(a => getDisplayStatus(a).group === 'futurs');
  const apptsPassees  = appts.filter(a => getDisplayStatus(a).group === 'passes');
  const apptsAnnulees = appts.filter(a => getDisplayStatus(a).group === 'annules');

  const [rdvTab, setRdvTab] = useState('futurs');
  const currentAppts = rdvTab === 'futurs' ? apptsFuturs : rdvTab === 'passes' ? apptsPassees : apptsAnnulees;

  // Modals annulation
  const [cancelModal, setCancelModal] = useState(null); // appt à annuler
  const [tooLateModal, setTooLateModal] = useState(null); // appt dont délai dépassé
  const [cancelLoading, setCancelLoading] = useState(false);

  const doCancel = async () => {
    if (!cancelModal) return;
    setCancelLoading(true);
    try {
      await pubApi.cancel(slug, cancelModal.id, { reason: 'Annule par le client' });
      setAppts(p => p.map(a => a.id === cancelModal.id ? {...a, status:'cancelled'} : a));
      setCancelModal(null);
    } catch(e) {
      const payload = e.data || {};
      setCancelModal(null);
      // Backend renvoie code=TOO_LATE avec policy_hours + coordonnées merchant
      if (payload.code === 'TOO_LATE' || (e.message || '').includes('TOO_LATE') || (e.message || '').includes('moins de')) {
        setTooLateModal({
          ...cancelModal,
          _policyHours:     payload.policy_hours || 2,
          _businessName:    payload.business_name    || business?.businessName || business?.business_name || null,
          _businessPhone:   payload.merchant_phone   || business?.phone   || null,
          _businessAddress: payload.merchant_address || business?.address || null,
          _businessPostal:  business?.postal_code || null,
          _businessCity:    business?.city    || null,
        });
      } else {
        alert(e.message || 'Erreur lors de l\'annulation');
      }
    } finally { setCancelLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}} *{box-sizing:border-box}`}</style>

      {/* ── Navbar ── */}
      <nav style={{ position:'sticky', top:0, zIndex:50, background:th.navBg,
        borderBottom:`1px solid ${th.navBorder}`, boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth:720, margin:'0 auto', padding:'0 24px', height:60,
          display:'flex', alignItems:'center', gap:16 }}>
          <button onClick={onBack}
            style={{ width:34, height:34, borderRadius:8, border:`1px solid ${th.border}`,
              background:th.cardAlt, display:'flex', alignItems:'center', justifyContent:'center',
              cursor:'pointer', flexShrink:0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{width:16,height:16,color:th.text}}>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
            <div style={{ width:36, height:36, borderRadius:99, flexShrink:0,
              background:th.accent, display:'flex', alignItems:'center', justifyContent:'center',
              color:th.accentText, fontWeight:800, fontSize:15 }}>
              {(clientInfo?.first_name||'?').charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth:0 }}>
              <p style={{ fontWeight:700, fontSize:14, color:th.text, margin:0,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {clientInfo?.first_name} {clientInfo?.last_name}
              </p>
              <p style={{ fontSize:12, color:th.muted, margin:0 }}>{clientInfo?.email}</p>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Tabs ── */}
      <div style={{ background:th.navBg, borderBottom:`1px solid ${th.border}` }}>
        <div style={{ maxWidth:720, margin:'0 auto', padding:'0 24px',
          display:'flex', gap:0 }}>
          {[
              ['appts',
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>Mes RDV
                </span>
              ],
              ['profile',
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>Mon profil
                </span>
              ],
              ...(refAvail ? [['parrain',
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>Parrainage
                </span>
              ]] : []),
            ].map(([tab, label]) => (
            <button key={tab} onClick={()=>setActiveTab(tab)}
              style={{ padding:'14px 20px', fontSize:13, fontWeight:600, cursor:'pointer',
                background:'none', border:'none',
                color: activeTab===tab ? th.text : th.muted,
                borderBottom: activeTab===tab ? `2px solid ${th.accent}` : '2px solid transparent',
                transition:'all .15s' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenu ── */}
      <div style={{ maxWidth:720, margin:'0 auto', padding:'28px 24px 60px', animation:'fadeIn .2s ease' }}>

        {/* ── ONGLET RDV ── */}
        {activeTab === 'appts' && (
          loading ? <div style={{paddingTop:40}}><Spinner color="#6366f1"/></div>
          : (
            <div>
              {/* Sous-onglets Futurs / Passés / Annulés */}
              <div style={{ display:'flex', gap:6, marginBottom:20,
                background:th.cardAlt, borderRadius:12, padding:4 }}>
                {[
                  { id:'futurs',  label:'À venir',  count: apptsFuturs.length },
                  { id:'passes',  label:'Passes',   count: apptsPassees.length },
                  { id:'annules', label:'Annules',  count: apptsAnnulees.length },
                ].map(t => (
                  <button key={t.id} onClick={() => setRdvTab(t.id)}
                    style={{ flex:1, padding:'9px 6px', borderRadius:9, border:'none', cursor:'pointer',
                      background: rdvTab === t.id ? th.card : 'transparent',
                      boxShadow: rdvTab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                      transition:'all .15s' }}>
                    <span style={{ fontSize:13, fontWeight:700, color: rdvTab===t.id ? th.text : th.muted }}>
                      {t.label}
                    </span>
                    {t.count > 0 && (
                      <span style={{ fontSize:11, fontWeight:700, padding:'1px 6px', borderRadius:99,
                        background: rdvTab===t.id ? th.accent : th.border,
                        color: rdvTab===t.id ? th.accentText : th.muted }}>
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {currentAppts.length === 0 ? (
                <div style={{ textAlign:'center', paddingTop:40 }}>
                  <div style={{ marginBottom:14, display:'flex', justifyContent:'center' }}>
                    {rdvTab === 'futurs' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:48,height:48,color:'#d1d5db'}}>
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                    ) : rdvTab === 'passes' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:48,height:48,color:'#d1d5db'}}>
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:48,height:48,color:'#d1d5db'}}>
                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                      </svg>
                    )}
                  </div>
                  <p style={{ fontWeight:600, color:th.muted, marginBottom: rdvTab === 'futurs' ? 20 : 0 }}>
                    {rdvTab === 'futurs' ? 'Aucun rendez-vous a venir' :
                     rdvTab === 'passes' ? 'Aucun rendez-vous passe' : 'Aucun rendez-vous annule'}
                  </p>
                  {rdvTab === 'futurs' && (
                    <button onClick={onNewBooking}
                      style={{ padding:'13px 28px', borderRadius:12, background:th.accent,
                        color:th.accentText, fontWeight:800, fontSize:14, border:'none', cursor:'pointer',
                        boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
                      Prendre un RDV
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {currentAppts.map(a => {
                    const st = getDisplayStatus(a);
                    return (
                      <div key={a.id} style={{
                        background: th.card, border:`1px solid ${th.border}`,
                        borderRadius:18, padding:16,
                        opacity: st.group !== 'futurs' ? 0.85 : 1,
                      }}>
                        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            {/* Badge statut */}
                            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
                              <span style={{
                                fontSize:11, padding:'3px 10px', borderRadius:99, fontWeight:700,
                                background:st.bg, color:st.color,
                                display:'flex', alignItems:'center', gap:4,
                              }}>
                                <span style={{ fontSize:9 }}>{st.icon}</span>
                                {st.label}
                              </span>
                              <span style={{ fontSize:10, fontWeight:600, color:th.dim, fontFamily:'monospace' }}>
                                #{a.id.substring(0,8).toUpperCase()}
                              </span>
                            </div>
                            <p style={{ fontWeight:800, fontSize:14, color: st.group !== 'futurs' ? th.muted : th.text, marginBottom:3 }}>
                              {a.service_name || 'Service'}
                            </p>
                            <p style={{ fontSize:13, color:th.muted }}>
                              {fmtApptDate(a.date)} à {(a.start_time||'').substring(0,5)}
                            </p>
                            {a.employee_name && (
                              <p style={{ fontSize:12, color:th.dim, marginTop:2 }}>avec {a.employee_name}</p>
                            )}
                            {a.service_price > 0 && (
                              <p style={{ fontSize:12, fontWeight:700, color:'#6366f1', marginTop:4 }}>{a.service_price} €</p>
                            )}
                          </div>
                          <div style={{
                            width:44, height:44, borderRadius:13, flexShrink:0,
                            background: st.canCancel
                              ? (a.service_color ? `${a.service_color}22` : 'rgba(99,102,241,0.1)')
                              : st.bg,
                            display:'flex', alignItems:'center', justifyContent:'center', fontSize:18,
                          }}>
                            {a.status === 'cancelled' ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:18,height:18}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            ) : a.paid || a.status === 'completed' ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:18,height:18}}><polyline points="20 6 9 17 4 12"/></svg>
                            ) : a.status === 'no_show' ? '-' :
                              st.group === 'passes' ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.43"/></svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:18,height:18}}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            )}
                          </div>
                        </div>
                        {st.canCancel && (
                          <button onClick={() => cancel(a)} style={{
                            marginTop:12, width:'100%', padding:'9px', borderRadius:10,
                            fontSize:12, fontWeight:700,
                            background:'rgba(248,113,113,0.08)', color:'#f87171',
                            border:'1px solid rgba(248,113,113,0.2)', cursor:'pointer',
                          }}>Annuler ce RDV</button>
                        )}
                      </div>
                    );
                  })}
                  {rdvTab === 'futurs' && (
                    <button onClick={onNewBooking}
                      style={{ marginTop:6, width:'100%', padding:'14px', borderRadius:12,
                        background:th.accent, color:th.accentText, fontWeight:800, fontSize:14,
                        border:'none', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
                      + Nouveau rendez-vous
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        )}

        {/* ── ONGLET PROFIL — design noir/blanc unifié ── */}
        {activeTab === 'profile' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14, animation:'fadeIn .2s ease' }}>

            {/* Card infos */}
            <div style={{ background:th.card, border:`1px solid ${th.border}`, borderRadius:16, overflow:'hidden' }}>
              <div style={{ padding:'16px 20px', borderBottom:`1px solid ${th.border}`,
                display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <p style={{ fontWeight:800, fontSize:15, color:th.text, margin:0 }}>Mes informations</p>
                {!editing && (
                  <button onClick={startEdit}
                    style={{ padding:'7px 14px', borderRadius:9,
                      background:th.cardAlt, border:`1px solid ${th.border}`,
                      color:th.text, fontWeight:700, fontSize:12, cursor:'pointer',
                      display:'flex', alignItems:'center', gap:6 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{width:13,height:13}}>
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Modifier
                  </button>
                )}
              </div>

              {editing ? (
                /* ── Mode édition ── */
                <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <div>
                      <label style={{ display:'block', fontSize:11, fontWeight:700,
                        color:th.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        Prénom *
                      </label>
                      <input value={editFirst} onChange={e=>setEditFirst(e.target.value)}
                        placeholder="Prénom" style={inpStyle}/>
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:11, fontWeight:700,
                        color:th.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        Nom *
                      </label>
                      <input value={editLast} onChange={e=>setEditLast(e.target.value)}
                        placeholder="Nom" style={inpStyle}/>
                    </div>
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700,
                      color:th.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      Email *
                    </label>
                    <input type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)}
                      placeholder="votre@email.com" style={inpStyle}/>
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700,
                      color:th.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      Téléphone
                    </label>
                    <input type="tel" value={editPhone} onChange={e=>setEditPhone(e.target.value)}
                      placeholder="06 00 00 00 00" style={inpStyle}/>
                  </div>
                  {profErr && (
                    <p style={{ fontSize:12, color:'#ef4444', fontWeight:600, margin:0 }}>{profErr}</p>
                  )}
                  <div style={{ display:'flex', gap:10, marginTop:4 }}>
                    <button onClick={cancelEdit}
                      style={{ flex:1, padding:'12px', borderRadius:10, cursor:'pointer',
                        background:th.cardAlt, border:`1px solid ${th.border}`,
                        color:th.muted, fontWeight:700, fontSize:13 }}>
                      Annuler
                    </button>
                    <button onClick={saveProfile} disabled={profLoad}
                      style={{ flex:2, padding:'12px', borderRadius:10, cursor:'pointer',
                        background:th.accent, border:'none',
                        color:th.accentText, fontWeight:800, fontSize:13,
                        opacity:profLoad?0.7:1 }}>
                      {profLoad ? '...' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Mode affichage ── */
                <div>
                  {profOk && (
                    <div style={{ margin:'12px 20px 0', padding:'10px 14px', borderRadius:9,
                      background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)',
                      color:'#16a34a', fontSize:13, fontWeight:700 }}>
                      ✓ {profOk}
                    </div>
                  )}
                  {[
                    ['Prenom',    clientInfo?.first_name || '-'],
                    ['Nom',       clientInfo?.last_name  || '-'],
                    ['Email',     clientInfo?.email      || '-'],
                    ['Télephone', clientInfo?.phone      || '-'],
                  ].map(([lbl, val], i) => (
                    <div key={lbl} style={{ display:'flex', justifyContent:'space-between',
                      alignItems:'center', padding:'13px 20px',
                      borderTop: i===0 ? `1px solid ${th.border}` : 'none',
                      borderBottom:`1px solid ${th.border}` }}>
                      <span style={{ fontSize:12, color:th.muted, fontWeight:600, textTransform:'uppercase',
                        letterSpacing:'0.04em' }}>{lbl}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:th.text }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Déconnexion */}
            <button onClick={() => {
              if (onLogout) onLogout();
              else {
                localStorage.removeItem('ff_client_token');
                localStorage.removeItem('ff_client_info');
                onBack();
              }
            }} style={{ width:'100%', padding:'13px', borderRadius:12, cursor:'pointer',
              background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.2)',
              color:'#ef4444', fontWeight:700, fontSize:13 }}>
              Se déconnecter
            </button>
          </div>
        )}

        {/* ── ONGLET PARRAINAGE ── */}
        {activeTab === 'parrain' && refAvail && refInfo && (
          <div style={{ display:'flex', flexDirection:'column', gap:14, animation:'fadeIn .2s ease' }}>

            {/* Code perso + partage */}
            <div style={{ background:th.card, border:`1px solid ${th.border}`, borderRadius:16, padding:20 }}>
              <p style={{ fontSize:11, fontWeight:700, color:th.muted, margin:'0 0 8px',
                textTransform:'uppercase', letterSpacing:'0.05em' }}>Mon code de parrainage</p>
              <div style={{ background:th.cardAlt, border:`2px dashed #8b5cf6`, borderRadius:14,
                padding:'18px 16px', textAlign:'center', marginBottom:12 }}>
                <p style={{ fontFamily:'monospace', fontSize:24, fontWeight:900, color:'#6d28d9',
                  letterSpacing:3, margin:0 }}>{refInfo.code}</p>
                <p style={{ fontSize:11, color:th.muted, margin:'6px 0 0' }}>
                  {refInfo.uses_count || 0} filleul{(refInfo.uses_count||0) > 1 ? 's' : ''} enregistré{(refInfo.uses_count||0) > 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={copyReferralLink} style={{ width:'100%', padding:'12px',
                borderRadius:11, cursor:'pointer', border:'none',
                background:refCopied ? '#10b981' : '#8b5cf6',
                color:'white', fontWeight:800, fontSize:13 }}>
                {refCopied ? '✓ Lien copié' : 'Copier mon lien de parrainage'}
              </button>
              {refInfo.program && (
                <p style={{ fontSize:12, color:th.muted, margin:'12px 0 0', lineHeight:1.5, textAlign:'center' }}>
                  Chaque ami qui vient grâce à vous vous fait gagner{' '}
                  <strong style={{ color:th.text }}>
                    {refInfo.program.parrain_type === 'percent'
                      ? `${refInfo.program.parrain_value}%`
                      : `${Number(refInfo.program.parrain_value).toFixed(2)} €`}
                  </strong>{' '}
                  de réduction à valider lors du rendez-vous de votre filleul.
                </p>
              )}
            </div>

            {/* Mes réductions */}
            {refRewards.length > 0 && (
              <div style={{ background:th.card, border:`1px solid ${th.border}`, borderRadius:16, padding:20 }}>
                <p style={{ fontSize:13, fontWeight:800, color:th.text, margin:'0 0 12px' }}>
                  Mes réductions disponibles
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {refRewards.map(r => {
                    const isBday = r.reward_type === 'birthday';
                    const accent = isBday ? '#ec4899' : '#8b5cf6';
                    const valStr = r.type === 'percent' ? `-${r.value}%` : `-${Number(r.value).toFixed(2)} €`;
                    const isUsed = r.status === 'used';
                    const expStr = r.expires_at ? new Date(r.expires_at).toLocaleDateString('fr-FR') : null;
                    return (
                      <div key={r.id} style={{
                        padding:'12px 14px', borderRadius:11,
                        border:`1px solid ${isUsed ? th.border : accent + '40'}`,
                        background:isUsed ? th.cardAlt : accent + '0f',
                        opacity:isUsed ? 0.6 : 1,
                      }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:22 }}>{isBday ? '🎂' : '🤝'}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ margin:0, fontSize:13, fontWeight:800, color:th.text }}>
                              {valStr} <span style={{ fontFamily:'monospace', fontSize:11, color:accent }}>· {r.code}</span>
                            </p>
                            <p style={{ margin:'2px 0 0', fontSize:11, color:th.muted }}>
                              {isBday ? 'Anniversaire' : 'Parrainage'}
                              {isUsed ? ` · utilisée le ${r.used_at ? new Date(r.used_at).toLocaleDateString('fr-FR') : ''}`
                                      : expStr ? ` · expire le ${expStr}` : ''}
                            </p>
                          </div>
                          <span style={{
                            fontSize:10, fontWeight:800,
                            padding:'3px 8px', borderRadius:99,
                            background:isUsed ? '#e5e7eb' : accent + '20',
                            color:isUsed ? '#6b7280' : accent,
                          }}>{isUsed ? 'Utilisée' : 'Disponible'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Historique filleuls */}
            <div style={{ background:th.card, border:`1px solid ${th.border}`, borderRadius:16, padding:20 }}>
              <p style={{ fontSize:13, fontWeight:800, color:th.text, margin:'0 0 12px' }}>
                Mes filleuls
              </p>
              {refHistory.length === 0 ? (
                <p style={{ fontSize:12, color:th.muted, margin:0, textAlign:'center', padding:'12px 0' }}>
                  Aucun filleul pour le moment. Partagez votre code !
                </p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {refHistory.map(h => {
                    const name = [h.filleul_first_name, h.filleul_last_name].filter(Boolean).join(' ') || h.filleul_email;
                    const statusColor = h.status === 'validated' ? '#10b981'
                                      : h.status === 'cancelled' ? '#ef4444' : '#f59e0b';
                    const statusLabel = h.status === 'validated' ? 'Récompensé'
                                      : h.status === 'cancelled' ? 'Annulé' : 'En attente';
                    return (
                      <div key={h.id} style={{ padding:'10px 12px', borderRadius:10,
                        background:th.cardAlt, border:`1px solid ${th.border}` }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:10, background:'#8b5cf620',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:13, fontWeight:900, color:'#6d28d9', flexShrink:0 }}>
                            {(name.charAt(0) || '?').toUpperCase()}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ margin:0, fontSize:13, fontWeight:700, color:th.text,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</p>
                            <p style={{ margin:0, fontSize:11, color:th.muted }}>
                              {new Date(h.created_at).toLocaleDateString('fr-FR')}
                            </p>
                          </div>
                          <span style={{ fontSize:10, fontWeight:800,
                            padding:'3px 9px', borderRadius:99,
                            background:statusColor + '18', color:statusColor,
                            flexShrink:0 }}>{statusLabel}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── Modal confirmation annulation ── */}
      {cancelModal && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex',
          alignItems:'center', justifyContent:'center', padding:16,
          background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)' }}>
          <div style={{ background:th.card, border:`1px solid ${th.border}`,
            borderRadius:20, padding:28, width:'100%', maxWidth:400,
            boxShadow:'0 24px 64px rgba(0,0,0,0.18)' }}>
            <div style={{ width:52, height:52, borderRadius:14, background:'rgba(239,68,68,0.1)',
              display:'flex', alignItems:'center', justifyContent:'center', marginBottom:18 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"
                style={{width:26,height:26}}>
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <p style={{ fontSize:17, fontWeight:800, color:th.text, margin:'0 0 8px' }}>
              Annuler ce rendez-vous ?
            </p>
            <p style={{ fontSize:13, color:th.muted, margin:'0 0 6px', lineHeight:1.5 }}>
              <strong style={{color:th.text}}>{cancelModal.service_name}</strong>
            </p>
            <p style={{ fontSize:13, color:th.muted, margin:'0 0 20px', lineHeight:1.5 }}>
              {fmtApptDate(cancelModal.date)} à {(cancelModal.start_time||'').substring(0,5)}
              {cancelModal.employee_name ? ` · ${cancelModal.employee_name}` : ''}
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setCancelModal(null)} disabled={cancelLoading}
                style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
                  background:th.cardAlt, border:`1px solid ${th.border}`,
                  color:th.muted, fontWeight:700, fontSize:13 }}>
                Garder
              </button>
              <button onClick={doCancel} disabled={cancelLoading}
                style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
                  background:'#ef4444', border:'none',
                  color:'white', fontWeight:800, fontSize:13,
                  opacity:cancelLoading?0.7:1 }}>
                {cancelLoading ? '...' : 'Confirmer l\'annulation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal délai dépassé (RDV dans moins de 2h) ── */}
      {tooLateModal && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex',
          alignItems:'center', justifyContent:'center', padding:16,
          background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)' }}>
          <div style={{ background:th.card, border:`1px solid ${th.border}`,
            borderRadius:20, padding:28, width:'100%', maxWidth:420,
            boxShadow:'0 24px 64px rgba(0,0,0,0.18)' }}>
            <div style={{ width:52, height:52, borderRadius:14, background:'rgba(245,158,11,0.1)',
              display:'flex', alignItems:'center', justifyContent:'center', marginBottom:18 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"
                style={{width:26,height:26}}>
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <p style={{ fontSize:17, fontWeight:800, color:th.text, margin:'0 0 10px' }}>
              Annulation en ligne impossible
            </p>
            <p style={{ fontSize:13, color:th.muted, margin:'0 0 16px', lineHeight:1.6 }}>
              {tooLateModal._policyHours > 0
                ? `Ce rendez-vous commence dans moins de ${tooLateModal._policyHours < 24 ? tooLateModal._policyHours + ' heures' : Math.round(tooLateModal._policyHours/24) + ' jour' + (tooLateModal._policyHours >= 48 ? 's' : '')}. Le délai autorisé par le commerçant est dépassé.`
                : 'Le délai d\'annulation est dépassé.'}
            </p>
            <p style={{ fontSize:13, fontWeight:700, color:th.text, margin:'0 0 12px' }}>
              Pour annuler, merci de prendre contact avec {tooLateModal._businessName || 'le commerçant'} :
            </p>
            <div style={{ background:th.cardAlt, border:`1px solid ${th.border}`,
              borderRadius:12, padding:'14px 16px', marginBottom:20,
              display:'flex', flexDirection:'column', gap:8 }}>
              {tooLateModal._businessPhone && (
                <a href={`tel:${tooLateModal._businessPhone}`}
                  style={{ display:'flex', alignItems:'center', gap:10,
                    fontSize:14, fontWeight:700, color:th.text, textDecoration:'none' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{width:16,height:16,color:th.muted,flexShrink:0}}>
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  {tooLateModal._businessPhone}
                </a>
              )}
              {(tooLateModal._businessAddress || tooLateModal._businessCity) && (
                <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{width:16,height:16,color:th.muted,flexShrink:0,marginTop:1}}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <div>
                    {tooLateModal._businessAddress && (
                      <p style={{ fontSize:13, color:th.muted, margin:0 }}>{tooLateModal._businessAddress}</p>
                    )}
                    {(tooLateModal._businessPostal || tooLateModal._businessCity) && (
                      <p style={{ fontSize:13, color:th.muted, margin:0 }}>
                        {[tooLateModal._businessPostal, tooLateModal._businessCity].filter(Boolean).join(' ')}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {/* Fallback si aucun contact connu */}
              {!tooLateModal._businessPhone && !tooLateModal._businessAddress && !tooLateModal._businessCity && (
                <p style={{ fontSize:13, color:th.muted, margin:0, textAlign:'center' }}>
                  Merci de prendre contact directement avec le commerçant.
                </p>
              )}
            </div>
            <button onClick={()=>setTooLateModal(null)}
              style={{ width:'100%', padding:'13px', borderRadius:11, cursor:'pointer',
                background:th.accent, border:'none',
                color:th.accentText, fontWeight:800, fontSize:14 }}>
              Compris
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
