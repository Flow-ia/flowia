// src/pages/BookingPage.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { pubApi, globalClientApi, mediaApi, publicReferralApi } from '../utils/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const withV = (url, v) => v ? `${url}?v=${v}` : url;
const serviceImgUrl  = (id, v) => withV(`${API_BASE}/media/service/${id}/image`, v);
const employeeImgUrl = (id, v) => withV(`${API_BASE}/media/employee/${id}/image`, v);
const mediaUrl = (u) => mediaApi.absoluteUrl(u);

const MONTHS_FR = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Decembre'];
const DAYS_MINI = ['L','M','M','J','V','S','D'];

// ── Thème light/dark ──────────────────────────────────────────────────────────
const LIGHT_THEME = {
  mode:        'light',
  bg:          '#f7f7f7',
  card:        '#ffffff',
  cardAlt:     '#fafafa',
  text:        '#1a1a1a',
  muted:       '#6b7280',
  dim:         '#9ca3af',
  border:      '#e5e7eb',
  inputBg:     '#ffffff',
  inputBorder: '#d1d5db',
  accent:      '#1a1a1a',
  accentBtn:   '#1a1a1a',
  accentText:  '#ffffff',
  navBg:       '#ffffff',
  navBorder:   '#e5e7eb',
  sidebarBg:   '#ffffff',
};
const DARK_THEME = {
  mode:        'dark',
  bg:          '#0f0f0f',
  card:        '#1a1a1a',
  cardAlt:     '#111111',
  text:        '#f5f5f5',
  muted:       '#9ca3af',
  dim:         '#6b7280',
  border:      '#2a2a2a',
  inputBg:     '#1f1f1f',
  inputBorder: '#333333',
  accent:      '#f5f5f5',
  accentBtn:   '#ffffff',
  accentText:  '#000000',
  navBg:       '#1a1a1a',
  navBorder:   '#2a2a2a',
  sidebarBg:   '#1a1a1a',
};


// ── NavBar persistante — affichée sur toutes les vues du site de réservation ──
function NavBar({ th, slug, business, clientUser, refProgram, onToggleTheme, onShowAuth, onMyAppts, onLogout, onNavigateHome, onReferralPage }) {
  const scrollTo = (id) => {
    if (!id) { if (onNavigateHome) onNavigateHome(null); return; }
    if (id === '__parrain__') { if (onReferralPage) onReferralPage(); return; }
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ behavior:'smooth', block:'start' }); return; }
    // Section non visible (autre vue) → retour accueil puis scroll
    if (onNavigateHome) onNavigateHome(id);
  };
  return (
    <nav style={{ position:'sticky', top:0, zIndex:50, background:th.navBg,
      borderBottom:`1px solid ${th.navBorder}`, boxShadow:'0 1px 3px rgba(0,0,0,0.06)',
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px', height:60,
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>

        {/* Logo + nom — cliquable → retour accueil */}
        <button onClick={()=>{ if(onNavigateHome) onNavigateHome(null); }}
          style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0,
            background:'none', border:'none', cursor:'pointer', padding:0 }}>
          <div style={{ width:36, height:36, borderRadius:8, overflow:'hidden', flexShrink:0,
            background:th.cardAlt, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {business?.profile_url
              ? <img src={mediaUrl(business.profile_url)} alt={business.business_name}
                  style={{ width:'100%', height:'100%', objectFit:'cover' }}
                  onError={e=>e.target.style.display='none'}/>
              : <span style={{ fontSize:15, fontWeight:900, color:'#374151' }}>
                  {(business?.business_name||'B').charAt(0).toUpperCase()}
                </span>}
          </div>
          <span style={{ fontSize:15, fontWeight:700, color:th.text, letterSpacing:'-0.01em' }}>
            {business?.business_name}
          </span>
        </button>

        {/* Liens de navigation — desktop */}
        <div style={{ display:'flex', alignItems:'center', gap:2 }}
          className="bk-do">
          {[
            ...(business?.hours && Object.keys(business.hours).length > 0 ? [['section-horaires','Horaires']] : []),
            ['section-adresse','Adresse'],
            ['section-prestations','Nos prestations'],
            ['section-equipe','Équipe'],
            ...(business?.google_business_url ? [['section-avis','Commentaires']] : []),
            ...((business?.cover_urls?.length > 0) ? [['section-photos','Photos']] : []),
            ...(refProgram && refProgram !== 'none' ? [['__parrain__','Parrainer un ami']] : []),
          ].map(([id, label]) => (
            <button key={id}
              onClick={() => scrollTo(id)}
              style={{ padding:'8px 14px', borderRadius:8, fontSize:13, fontWeight:600,
                color:th.muted, background:'none', border:'none', cursor:'pointer' }}
              onMouseEnter={e=>e.currentTarget.style.color=th.text}
              onMouseLeave={e=>e.currentTarget.style.color=th.muted}>
              {label}
            </button>
          ))}
        </div>

        {/* Droite : tel + toggle + auth */}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          {business?.phone && (
            <a href={`tel:${business.phone}`}
              style={{ display:'flex', alignItems:'center', gap:6, fontSize:13,
                fontWeight:600, color:th.text, textDecoration:'none' }}
              className="bk-do">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{width:15,height:15}}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Appelez-nous {business.phone}
            </a>
          )}
          {/* Toggle dark/light */}
          <button onClick={onToggleTheme}
            style={{ width:36, height:36, borderRadius:99, display:'flex',
              alignItems:'center', justifyContent:'center',
              background:th.cardAlt, border:`1px solid ${th.border}`, cursor:'pointer' }}>
            {th.mode === 'dark'
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{width:16,height:16,color:th.text}}>
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{width:16,height:16,color:th.text}}>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
            }
          </button>
          {/* Auth */}
          {clientUser ? (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={onMyAppts}
                style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 12px 6px 8px',
                  borderRadius:20, background:th.cardAlt, border:`1px solid ${th.border}`,
                  cursor:'pointer' }}>
                <div style={{ width:24, height:24, borderRadius:99, background:th.accent,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:th.accentText, fontWeight:800, fontSize:11, flexShrink:0 }}>
                  {(clientUser.first_name||'?').charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize:12, fontWeight:600, color:th.text, maxWidth:80,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {clientUser.first_name}
                </span>
              </button>
              <button onClick={onLogout}
                style={{ padding:'6px 10px', borderRadius:9, fontSize:12, fontWeight:600,
                  color:'#ef4444', background:'rgba(239,68,68,0.06)',
                  border:'1px solid rgba(239,68,68,0.15)', cursor:'pointer' }}>
                Déco.
              </button>
            </div>
          ) : (
            <button onClick={onShowAuth}
              style={{ padding:'8px 16px', borderRadius:9, fontSize:13, fontWeight:700,
                background:th.accent, color:th.accentText, border:'none', cursor:'pointer' }}>
              Connexion
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

function Spinner({ color = '#7c6af7' }) {
  return <div className="w-8 h-8 rounded-full border-2 animate-spin mx-auto"
    style={{ borderColor:`${color}30`, borderTopColor:color }} />;
}

function ThemeToggle({ th, onToggle }) {
  return (
    <button onClick={onToggle}
      className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all"
      style={{ background: th.card, border:`1px solid ${th.border}` }}>
      {th.mode === 'dark'
        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" style={{color:th.text}}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" style={{color:th.text}}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      }
    </button>
  );
}

// ── Écran Mes RDV — design noir/blanc cohérent ───────────────────────────────
function MyAppointments({ slug, th, onBack, onNewBooking, onLogout, initialTab = 'appts', business = null }) {
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

// ── Panneau Auth client ───────────────────────────────────────────────────────
function AuthPanel({ slug, th, onAuth, onClose, requireAccount, initialEmail = '', initialMode = 'login' }) {
  const [mode, setMode]         = useState(initialMode);
  const [email, setEmail]       = useState(initialEmail);
  const [pwd, setPwd]           = useState('');
  const [newPwd, setNewPwd]     = useState('');
  const [code, setCode]         = useState('');
  const [first, setFirst]       = useState('');
  const [last, setLast]         = useState('');
  const [phone, setPhone]       = useState('');
  const [err, setErr]           = useState('');
  const [ok, setOk]             = useState('');
  const [loading, setLoading]   = useState(false);
  const [consent, setConsent]   = useState(false);
  const [showRgpdModal, setShowRgpdModal] = useState(false);

  // Détection intelligente du type de compte à la saisie email
  const [emailType, setEmailType]   = useState(null);   // null | 'free' | 'local' | 'global' | 'both'
  const [emailChecking, setEmailChecking] = useState(false);
  const emailTimer = useRef(null);

  const inp  = "w-full px-4 py-3.5 rounded-2xl text-sm focus:outline-none";
  const inpSt = { background:th.inputBg, border:`1px solid ${th.inputBorder}`, color:th.text };

  // Vérifier l'email dès la saisie (debounce 500ms)
  const handleEmailChange = (val) => {
    setEmail(val);
    setEmailType(null);
    setErr('');
    clearTimeout(emailTimer.current);
    if (!val.includes('@') || !val.includes('.')) return;
    setEmailChecking(true);
    emailTimer.current = setTimeout(async () => {
      try {
        const res = await pubApi.checkEmail(slug, val.trim());
        setEmailType(res.exists ? res.type : 'free');
        // Auto-switch vers login si compte détecté
        if (res.exists && mode === 'register') {
          setMode('login');
          setErr('Un compte existe avec cet email. Connectez-vous.');
        }
      } catch { setEmailType(null); }
      finally { setEmailChecking(false); }
    }, 500);
  };

  // Init : si email pré-rempli depuis bannière, vérifier directement
  useEffect(() => {
    if (initialEmail) handleEmailChange(initialEmail);
  }, []);

  // Connexion via Google — ouvre une popup
  const loginWithGoogle = () => {
    const url = pubApi.googleAuthUrl(slug);
    const popup = window.open(url, 'google_auth',
      'width=500,height=600,scrollbars=yes,resizable=yes,top=100,left=' +
      Math.round((window.screen.width - 500) / 2)
    );
    const handler = (e) => {
      if (e.data?.type !== 'GOOGLE_AUTH_SUCCESS') return;
      window.removeEventListener('message', handler);
      if (popup && !popup.closed) popup.close();
      const { token, client } = e.data;
      if (!token || !client) return;
      localStorage.setItem('ff_client_token', token);
      localStorage.setItem('ff_client_info', JSON.stringify(client));
      onAuth(client);
    };
    window.addEventListener('message', handler);
    // Nettoyage si popup fermée sans auth
    const checkClosed = setInterval(() => {
      if (popup?.closed) { clearInterval(checkClosed); window.removeEventListener('message', handler); }
    }, 500);
  };

  const submit = async () => {
    setLoading(true); setErr(''); setOk('');
    try {
      let r;
      if (mode === 'login') {
        r = await pubApi.login(slug, { email: email.trim(), password: pwd });
      } else {
        if (!first.trim() || !last.trim()) { setErr('Prenom et nom requis.'); setLoading(false); return; }
        if (pwd.length < 6) { setErr('Mot de passe minimum 6 caracteres.'); setLoading(false); return; }
        r = await pubApi.register(slug, { email: email.trim(), password: pwd, first_name: first.trim(), last_name: last.trim(), phone: phone.trim() });
      }
      localStorage.setItem('ff_client_token', r.token);
      localStorage.setItem('ff_client_info', JSON.stringify(r.client));
      onAuth(r.client);
    } catch(e) {
      // Si l'erreur indique qu'un compte existe → basculer en login
      if (e.message?.includes('existe') || e.message?.includes('USE_LOGIN') || e.message?.includes('deja')) {
        setMode('login');
        setErr('Un compte existe dejà avec cet email. Connectez-vous a la place.');
      } else {
        setErr(e.message);
      }
    }
    finally { setLoading(false); }
  };

  const sendResetCode = async () => {
    if (!email.trim()) { setErr('Entrez votre email.'); return; }
    setLoading(true); setErr(''); setOk('');
    try {
      await globalClientApi.forgotPassword({ email: email.trim() });
      setOk('Un code de réinitialisation a été envoye a votre email.');
      setMode('forgot_code');
    } catch(e) { setErr(e.message || 'Erreur envoi email'); }
    finally { setLoading(false); }
  };

  const confirmReset = async () => {
    if (!code.trim() || !newPwd) { setErr('Code et nouveau mot de passe requis.'); return; }
    if (newPwd.length < 6) { setErr('Le mot de passe doit faire au moins 6 caracteres.'); return; }
    setLoading(true); setErr(''); setOk('');
    try {
      await globalClientApi.resetPassword({ email: email.trim(), code: code.trim(), new_password: newPwd });
      setOk('Mot de passe mis a jour !');
      setMode('login'); setCode(''); setNewPwd('');
    } catch(e) { setErr(e.message || 'Code invalide ou expire'); }
    finally { setLoading(false); }
  };

  // Badge informatif selon type de compte détecté
  const EmailBadge = () => {
    if (emailChecking) return (
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:10, background:'rgba(99,102,241,0.06)', border:`1px solid rgba(99,102,241,0.15)`, marginTop:4 }}>
        <div style={{ width:12, height:12, borderRadius:'50%', border:'2px solid rgba(99,102,241,0.2)', borderTopColor:'#6366f1', animation:'spin .7s linear infinite', flexShrink:0 }} />
        <span style={{ fontSize:12, color:'#6366f1' }}>Vérification…</span>
      </div>
    );
    if (!emailType || emailType === 'free') return null;
    if (emailType === 'global' || emailType === 'both') return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.2)', marginTop:4 }}>
        <span style={{ fontSize:14 }}>✅</span>
        <div>
          <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#10b981' }}>Compte plateforme reconnu</p>
          <p style={{ margin:0, fontSize:11, color:'rgba(16,185,129,0.8)' }}>Connectez-vous avec votre mot de passe habituel</p>
        </div>
      </div>
    );
    if (emailType === 'local') return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)', marginTop:4 }}>
        <span style={{ fontSize:14 }}>💡</span>
        <div>
          <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#d97706' }}>Compte existant</p>
          <p style={{ margin:0, fontSize:11, color:'rgba(217,119,6,0.8)' }}>Connectez-vous avec votre mot de passe</p>
        </div>
      </div>
    );
    return null;
  };

  // Styles inline cohérents avec le design noir/blanc
  const S = {
    card:   { background:th.card, border:`1px solid ${th.border}`, borderRadius:16, overflow:'hidden' },
    inp:    { width:'100%', padding:'11px 14px', borderRadius:10, outline:'none',
              background:th.inputBg, border:`1px solid ${th.inputBorder}`,
              color:th.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box' },
    btnPrimary: { width:'100%', padding:'13px', borderRadius:11, border:'none',
                  background:th.accent, color:th.accentText, fontWeight:800,
                  fontSize:14, cursor:'pointer', letterSpacing:'-0.01em' },
    btnSecondary: { width:'100%', padding:'13px', borderRadius:11,
                    background:'transparent', border:`1px solid ${th.border}`,
                    color:th.text, fontWeight:700, fontSize:14, cursor:'pointer' },
    label:  { display:'block', fontSize:11, fontWeight:700, color:th.muted,
              marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em' },
  };

  return (
    <div style={S.card}>
      <div style={{ padding:20 }}>

        {/* Badge compte requis */}
        {requireAccount && mode !== 'forgot' && mode !== 'forgot_code' && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
            borderRadius:10, background:'rgba(245,158,11,0.08)',
            border:'1px solid rgba(245,158,11,0.2)', marginBottom:16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"
              style={{width:15,height:15,flexShrink:0}}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#d97706' }}>
              Un compte est requis pour réserver
            </p>
          </div>
        )}

        {/* ── TABS LOGIN / REGISTER ── */}
        {mode !== 'forgot' && mode !== 'forgot_code' && (
          <div style={{ display:'flex', gap:4, padding:4, background:th.inputBg,
            borderRadius:12, marginBottom:18 }}>
            {[['login','Se connecter'],['register','Creer un compte']].map(([m,l]) => (
              <button key={m} onClick={()=>{setMode(m);setErr('');setOk('');}}
                style={{ flex:1, padding:'9px 0', borderRadius:9, fontSize:13, fontWeight:700,
                  background: mode===m ? th.accent : 'transparent',
                  color: mode===m ? th.accentText : th.muted,
                  border:'none', cursor:'pointer', transition:'all .15s' }}>
                {l}
              </button>
            ))}
          </div>
        )}

        {/* ── MOT DE PASSE OUBLIÉ — saisie email ── */}
        {mode === 'forgot' && (
          <div>
            <button onClick={()=>{setMode('login');setErr('');setOk('');}}
              style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600,
                color:th.muted, background:'none', border:'none', cursor:'pointer', marginBottom:16 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{width:14,height:14}}><polyline points="15 18 9 12 15 6"/></svg>
              Retour
            </button>
            <p style={{ fontSize:15, fontWeight:800, color:th.text, margin:'0 0 6px' }}>
              Mot de passe oublié
            </p>
            <p style={{ fontSize:12, color:th.muted, margin:'0 0 14px', lineHeight:1.5 }}>
              Entrez votre email pour recevoir un code de réinitialisation.
            </p>
            <div style={{ marginBottom:12 }}>
              <label style={S.label}>Email</label>
              <input type="email" placeholder="votre@email.com" value={email}
                onChange={e=>setEmail(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&sendResetCode()}
                style={S.inp}/>
            </div>
            {err && <p style={{fontSize:12,color:'#ef4444',margin:'0 0 10px',fontWeight:600}}>{err}</p>}
            {ok  && <p style={{fontSize:12,color:'#16a34a',margin:'0 0 10px',fontWeight:600}}>{ok}</p>}
            <button onClick={sendResetCode} disabled={loading||!email.trim()}
              style={{...S.btnPrimary, opacity:loading||!email.trim()?0.5:1}}>
              {loading ? '...' : 'Envoyer le code'}
            </button>
          </div>
        )}

        {/* ── RESET CODE ── */}
        {mode === 'forgot_code' && (
          <div>
            <button onClick={()=>{setMode('forgot');setErr('');setOk('');}}
              style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600,
                color:th.muted, background:'none', border:'none', cursor:'pointer', marginBottom:16 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{width:14,height:14}}><polyline points="15 18 9 12 15 6"/></svg>
              Retour
            </button>
            <p style={{ fontSize:15, fontWeight:800, color:th.text, margin:'0 0 4px' }}>
              Code reçu par email
            </p>
            {ok && <p style={{fontSize:12,color:'#16a34a',margin:'4px 0 12px',fontWeight:600}}>{ok}</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
              <div>
                <label style={S.label}>Code à 6 chiffres</label>
                <input placeholder="000000" value={code}
                  onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                  maxLength={6}
                  style={{...S.inp, textAlign:'center', fontSize:22, fontWeight:900,
                    letterSpacing:'0.3em', fontFamily:'monospace'}}/>
              </div>
              <div>
                <label style={S.label}>Nouveau mot de passe</label>
                <input type="password" placeholder="Minimum 6 caractères" value={newPwd}
                  onChange={e=>setNewPwd(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&confirmReset()}
                  style={S.inp}/>
              </div>
            </div>
            {err && <p style={{fontSize:12,color:'#ef4444',margin:'0 0 10px',fontWeight:600}}>{err}</p>}
            <button onClick={confirmReset}
              disabled={loading||code.length<6||newPwd.length<6}
              style={{...S.btnPrimary, opacity:loading||code.length<6||newPwd.length<6?0.5:1}}>
              {loading ? '...' : 'Changer le mot de passe'}
            </button>
          </div>
        )}

        {/* ── LOGIN / REGISTER ── */}
        {(mode === 'login' || mode === 'register') && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

            {/* Email avec détection intelligente */}
            <div>
              <label style={S.label}>Email *</label>
              <div style={{ position:'relative' }}>
                <input type="email" placeholder="votre@email.com" value={email}
                  onChange={e=>handleEmailChange(e.target.value)}
                  style={{...S.inp, paddingRight:emailChecking?36:14}}/>
                {emailChecking && (
                  <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                    width:13, height:13, borderRadius:'50%',
                    border:'2px solid rgba(0,0,0,0.1)', borderTopColor:th.accent,
                    animation:'spin .7s linear infinite' }}/>
                )}
              </div>
              <EmailBadge />
            </div>

            {/* Champs register */}
            {mode === 'register' && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={S.label}>Prénom *</label>
                    <input placeholder="Prénom" value={first}
                      onChange={e=>setFirst(e.target.value)} style={S.inp}/>
                  </div>
                  <div>
                    <label style={S.label}>Nom *</label>
                    <input placeholder="Nom" value={last}
                      onChange={e=>setLast(e.target.value)} style={S.inp}/>
                  </div>
                </div>
                <div>
                  <label style={S.label}>Téléphone</label>
                  <input placeholder="06 00 00 00 00" value={phone}
                    onChange={e=>setPhone(e.target.value)} style={S.inp}/>
                </div>
              </>
            )}

            {/* Mot de passe */}
            <div>
              <label style={S.label}>Mot de passe *</label>
              <input type="password" placeholder="••••••••" value={pwd}
                onChange={e=>setPwd(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&submit()}
                style={S.inp}/>
            </div>

            {/* Erreur */}
            {err && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px',
                borderRadius:9, background:'rgba(239,68,68,0.06)',
                border:'1px solid rgba(239,68,68,0.2)' }}>
                <span style={{fontSize:13,flexShrink:0}}>⚠️</span>
                <p style={{margin:0,fontSize:12,color:'#dc2626',fontWeight:600}}>{err}</p>
              </div>
            )}
            {ok && <p style={{fontSize:12,color:'#16a34a',fontWeight:600}}>{ok}</p>}

            {/* Consentement RGPD — uniquement à l'inscription */}
            {mode === 'register' && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px',
                borderRadius:9, background:'rgba(99,102,241,0.04)',
                border:'1px solid rgba(99,102,241,0.15)' }}>
                <input type="checkbox" id="consent-rgpd" checked={consent}
                  onChange={e=>setConsent(e.target.checked)}
                  style={{ marginTop:2, flexShrink:0, accentColor:'#6366f1', cursor:'pointer' }} />
                <label htmlFor="consent-rgpd" style={{ fontSize:11, color:th.muted, lineHeight:1.5, cursor:'pointer' }}>
                  J'accepte que mes données personnelles (nom, email, téléphone) soient utilisées
                  pour gérer mes réservations, conformément au{' '}
                  <a href="#rgpd-policy" onClick={e=>{e.preventDefault();setShowRgpdModal(true);}}
                    style={{ color:'#6366f1', textDecoration:'underline' }}>
                    règlement RGPD
                  </a>. Vous pouvez supprimer votre compte à tout moment.
                </label>
              </div>
            )}

            {/* Bouton principal */}
            <button onClick={submit}
              disabled={loading||!email.trim()||!pwd||(mode==='register'&&(!first.trim()||!last.trim()||!consent))}
              style={{...S.btnPrimary,
                opacity:loading||!email.trim()||!pwd||(mode==='register'&&(!first.trim()||!last.trim()||!consent))?0.5:1,
                marginTop:4}}>
              {loading ? '...' : mode==='login' ? '→ Se connecter' : '→ Creer mon compte'}
            </button>

            {/* Séparateur + bouton Google — toujours visible */}
            <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
              <div style={{flex:1,height:1,background:th.border}}/>
              <span style={{fontSize:11,color:th.dim,whiteSpace:'nowrap',padding:'0 6px'}}>ou</span>
              <div style={{flex:1,height:1,background:th.border}}/>
            </div>
            <button onClick={loginWithGoogle}
              style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                padding:'11px',borderRadius:10,background:th.card,
                border:`1px solid ${th.border}`,cursor:'pointer',
                fontWeight:700,fontSize:13,color:th.text}}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuer avec Google
            </button>

            {/* Mot de passe oublié */}
            {mode === 'login' && (
              <button onClick={()=>{setMode('forgot');setErr('');setOk('');}}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:12,
                  color:th.muted, textAlign:'center', padding:'2px 0' }}>
                Mot de passe oublié ?
              </button>
            )}

            {/* Modal RGPD depuis inscription */}
            {showRgpdModal && (
              <div style={{ position:'fixed', inset:0, zIndex:2000,
                display:'flex', alignItems:'center', justifyContent:'center',
                padding:16, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }}
                onClick={()=>setShowRgpdModal(false)}>
                <div style={{ background:th.card||'#fff', borderRadius:20, padding:24,
                  maxWidth:420, width:'100%', maxHeight:'75vh', overflowY:'auto' }}
                  onClick={e=>e.stopPropagation()}>
                  <p style={{ margin:'0 0 12px', fontWeight:800, fontSize:15, color:'#111' }}>🔒 Politique de confidentialité</p>
                  {[
                    ['Données collectées','Prénom, nom, email, téléphone — utilisés pour gérer vos réservations.'],
                    ['Finalité','Gestion des rendez-vous, confirmations, rappels, fidélité.'],
                    ['Conservation','Données supprimées sur demande. Historiques conservés anonymement.'],
                    ['Vos droits','Accès, rectification, effacement, portabilité depuis votre profil.'],
                    ['Sécurité','Mots de passe chiffrés (bcrypt). Communications SSL/TLS.'],
                  ].map(([t,d])=>(
                    <div key={t} style={{ marginBottom:10 }}>
                      <p style={{ margin:'0 0 2px', fontWeight:700, fontSize:12, color:'#374151' }}>{t}</p>
                      <p style={{ margin:0, fontSize:11, color:'#6b7280', lineHeight:1.5 }}>{d}</p>
                    </div>
                  ))}
                  <button onClick={()=>setShowRgpdModal(false)}
                    style={{ width:'100%', padding:'11px', borderRadius:10, marginTop:8,
                      background:'#6366f1', color:'white', border:'none', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                    Fermer
                  </button>
                </div>
              </div>
            )}

            {/* Continuer sans compte */}
            {!requireAccount && onClose && (
              <button onClick={onClose}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:12,
                  color:th.dim, textAlign:'center', padding:'2px 0' }}>
                Continuer sans compte →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ── Composant : Espace client global (multi-commerces) ────────────────────────
function GlobalAccountView({ th, gcToken, gcUser, onLogin, onLogout, onBack }) {
  const [mode,    setMode]    = useState(gcUser ? 'dashboard' : 'login'); // login|register|dashboard|forgot_gc|forgot_gc_code
  const [email,   setEmail]   = useState('');
  const [pwd,     setPwd]     = useState('');
  const [first,   setFirst]   = useState('');
  const [last,    setLast]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [birthDate, setBirthDate] = useState(''); // YYYY-MM-DD, optionnel
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);
  const [apts,    setApts]    = useState([]);
  const [loyalty, setLoyalty] = useState([]);
  const [tab,     setTab]     = useState('appts');
  // Profil
  const [editFirst,  setEditFirst]  = useState('');
  const [editLast,   setEditLast]   = useState('');
  const [editPhone,  setEditPhone]  = useState('');
  const [editEmail,  setEditEmail]  = useState('');
  const [profOk,     setProfOk]     = useState('');
  const [profErr,    setProfErr]    = useState('');
  const [profLoad,   setProfLoad]   = useState(false);
  // Changement de mot de passe depuis profil
  const [curPwd,     setCurPwd]     = useState('');
  const [newPwd2,    setNewPwd2]    = useState('');
  const [pwdOk,      setPwdOk]      = useState('');
  const [pwdErr,     setPwdErr]     = useState('');
  const [pwdLoad,    setPwdLoad]    = useState(false);
  // Suppression de compte + RGPD
  const [delConfirm, setDelConfirm] = useState('');
  const [delLoad,    setDelLoad]    = useState(false);
  const [showRgpd,   setShowRgpd]   = useState(false);
  const [exportLoad, setExportLoad] = useState(false);
  const [delErr,     setDelErr]     = useState('');
  // Forgot password dans GlobalAccountView
  const [gcForgotEmail, setGcForgotEmail] = useState('');
  const [gcResetCode,   setGcResetCode]   = useState('');
  const [gcNewPwd,      setGcNewPwd]      = useState('');
  const [gcForgotErr,   setGcForgotErr]   = useState('');
  const [gcForgotOk,    setGcForgotOk]    = useState('');
  const [gcForgotLoad,  setGcForgotLoad]  = useState(false);

  const loadData = async () => {
    if (!gcToken) return;
    try {
      const [a, l] = await Promise.all([
        globalClientApi.appointments(gcToken),
        globalClientApi.loyalty(gcToken),
      ]);
      setApts(a||[]); setLoyalty(l||[]);
    } catch {}
  };

  useState(() => { if (gcUser) loadData(); }, [gcToken]);

  // Pré-remplir les champs profil quand on ouvre l'onglet
  const { useEffect: ue } = { useEffect: (fn, deps) => { try { fn(); } catch {} } };
  // Pré-remplir avec les infos actuelles
  const initProfileEdit = () => {
    setEditFirst(gcUser?.first_name || '');
    setEditLast(gcUser?.last_name   || '');
    setEditPhone(gcUser?.phone      || '');
    setEditEmail(gcUser?.email      || '');
    setProfOk(''); setProfErr('');
  };

  const saveProfile = async () => {
    setProfLoad(true); setProfOk(''); setProfErr('');
    try {
      const updated = await globalClientApi.updateMe(gcToken, {
        first_name: editFirst.trim(),
        last_name:  editLast.trim(),
        phone:      editPhone.trim(),
        email:      editEmail.trim() !== gcUser?.email ? editEmail.trim() : undefined,
      });
      // Mettre à jour le user local
      const newUser = { ...gcUser, ...updated };
      onLogin(gcToken, newUser);
      localStorage.setItem('ff_gc_user', JSON.stringify(newUser));
      setProfOk('Profil mis a jour !');
    } catch(e) { setProfErr(e.message || 'Erreur lors de la mise a jour'); }
    finally { setProfLoad(false); }
  };

  const savePassword = async () => {
    if (!curPwd || !newPwd2) { setPwdErr('Tous les champs sont requis.'); return; }
    if (newPwd2.length < 6) { setPwdErr('Le nouveau mot de passe doit faire au moins 6 caracteres.'); return; }
    setPwdLoad(true); setPwdOk(''); setPwdErr('');
    try {
      await globalClientApi.changePwd(gcToken, { current_password: curPwd, new_password: newPwd2 });
      setPwdOk('Mot de passe modifie !');
      setCurPwd(''); setNewPwd2('');
    } catch(e) { setPwdErr(e.message || 'Mot de passe actuel incorrect'); }
    finally { setPwdLoad(false); }
  };

  const deleteAccount = async () => {
    if (delConfirm !== 'SUPPRIMER') { setDelErr('Saisissez SUPPRIMER pour confirmer.'); return; }
    setDelLoad(true); setDelErr('');
    try {
      await globalClientApi.deleteAccount(gcToken);
      onLogout();
    } catch(e) { setDelErr(e.message || 'Erreur lors de la suppression'); setDelLoad(false); }
  }

  // Export RGPD — télécharge les données personnelles en JSON
  const exportMyData = async () => {
    setExportLoad(true);
    try {
      const token = gcToken || localStorage.getItem('ff_gc_token');
      const BASE = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${BASE}/global-clients/me/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erreur export');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'mes-donnees-flowia.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch(e) {
      alert(e.message || 'Erreur lors de l\'export');
    } finally { setExportLoad(false); }
  };;

  const handleLogin = async () => {
    setLoading(true); setErr('');
    try {
      const r = await globalClientApi.login({ email, password: pwd });
      onLogin(r.token, r.client);
      setMode('dashboard');
      setTimeout(loadData, 100);
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    setLoading(true); setErr('');
    try {
      const r = await globalClientApi.register({ email, password: pwd, first_name: first, last_name: last, phone, birth_date: birthDate || null });
      onLogin(r.token, r.client);
      setMode('dashboard');
      setTimeout(loadData, 100);
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const sendGcResetCode = async () => {
    if (!gcForgotEmail.trim()) { setGcForgotErr('Entrez votre email.'); return; }
    setGcForgotLoad(true); setGcForgotErr(''); setGcForgotOk('');
    try {
      await globalClientApi.forgotPassword({ email: gcForgotEmail.trim() });
      setGcForgotOk('Un code a été envoye a votre email.');
      setMode('forgot_gc_code');
    } catch(e) { setGcForgotErr(e.message || 'Erreur'); }
    finally { setGcForgotLoad(false); }
  };

  const confirmGcReset = async () => {
    if (!gcResetCode.trim() || !gcNewPwd) { setGcForgotErr('Code et mot de passe requis.'); return; }
    if (gcNewPwd.length < 6) { setGcForgotErr('Mot de passe trop court (min. 6 car.).'); return; }
    setGcForgotLoad(true); setGcForgotErr(''); setGcForgotOk('');
    try {
      await globalClientApi.resetPassword({ email: gcForgotEmail.trim(), code: gcResetCode.trim(), new_password: gcNewPwd });
      setGcForgotOk('Mot de passe mis a jour ! Connectez-vous.');
      setMode('login'); setGcResetCode(''); setGcNewPwd('');
    } catch(e) { setGcForgotErr(e.message || 'Code invalide ou expire'); }
    finally { setGcForgotLoad(false); }
  };

  const inp = { width:'100%', padding:'12px 16px', borderRadius:14, border:`1px solid ${th.inputBorder}`, background:th.inputBg, color:th.text, fontSize:14, outline:'none', boxSizing:'border-box' };
  const fmtD = s => { if (!s) return '-'; const str = String(s).substring(0,10); return new Date(str + 'T12:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }); };
  const statusC = { pending:'#f59e0b', confirmed:'#10b981', cancelled:'#ef4444', completed:'#6366f1', no_show:'#94a3b8' };
  const statusL = { pending:'En attente', confirmed:'Confirme', cancelled:'Annule', completed:'Termine', no_show:'Absent' };

  return (
    <div className="min-h-screen" style={{ background:th.bg }}>
      <div className="max-w-sm sm:max-w-md md:max-w-lg mx-auto px-4 pt-6 sm:pt-10 pb-12">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm mb-6" style={{ color:th.muted, background:'none', border:'none', cursor:'pointer' }}>
          ← Retour
        </button>

        {/* Header */}
        <div style={{ marginBottom:24 }}>
          <h1 style={{ fontSize:22, fontWeight:900, color:th.text, margin:'0 0 4px' }}>Mon espace client</h1>
          <p style={{ fontSize:13, color:th.muted, margin:0 }}>Gérez vos rendez-vous et fidélité chez tous vos commerçants</p>
        </div>

        {/* MOT DE PASSE OUBLIÉ — saisie email */}
        {mode === 'forgot_gc' && (
          <div style={{ background:th.card, borderRadius:24, padding:24, border:`1px solid ${th.border}` }}>
            <button onClick={()=>{ setMode('login'); setGcForgotErr(''); setGcForgotOk(''); }}
              style={{ background:'none', border:'none', color:th.muted, fontSize:13, cursor:'pointer', marginBottom:16 }}>← Retour</button>
            <p style={{ margin:'0 0 6px', fontWeight:800, fontSize:16, color:th.text }}>Mot de passe oublié</p>
            <p style={{ margin:'0 0 16px', fontSize:13, color:th.muted }}>Entrez votre email pour recevoir un code de réinitialisation.</p>
            <div style={{ marginBottom:12 }}>
              <input type="email" placeholder="Votre email" value={gcForgotEmail} onChange={e=>setGcForgotEmail(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&sendGcResetCode()} style={inp} />
            </div>
            {gcForgotErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 12px', fontWeight:600 }}>{gcForgotErr}</p>}
            {gcForgotOk  && <p style={{ color:'#10b981', fontSize:13, margin:'0 0 12px', fontWeight:600 }}>{gcForgotOk}</p>}
            <button onClick={sendGcResetCode} disabled={gcForgotLoad || !gcForgotEmail.trim()}
              style={{ width:'100%', padding:'15px', borderRadius:16, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white', border:'none', fontWeight:800, fontSize:15, cursor:'pointer', opacity:(gcForgotLoad||!gcForgotEmail.trim())?0.6:1 }}>
              {gcForgotLoad ? '...' : 'Envoyer le code'}
            </button>
          </div>
        )}

        {/* MOT DE PASSE OUBLIÉ — saisie code + nouveau mdp */}
        {mode === 'forgot_gc_code' && (
          <div style={{ background:th.card, borderRadius:24, padding:24, border:`1px solid ${th.border}` }}>
            <button onClick={()=>{ setMode('forgot_gc'); setGcForgotErr(''); }}
              style={{ background:'none', border:'none', color:th.muted, fontSize:13, cursor:'pointer', marginBottom:16 }}>← Retour</button>
            <p style={{ margin:'0 0 6px', fontWeight:800, fontSize:16, color:th.text }}>Code de réinitialisation</p>
            <p style={{ margin:'0 0 16px', fontSize:13, color:th.muted }}>Vérifiez votre boîte mail et entrez le code à 6 chiffres.</p>
            {gcForgotOk && <p style={{ color:'#10b981', fontSize:13, margin:'0 0 12px', fontWeight:600 }}>{gcForgotOk}</p>}
            <div style={{ marginBottom:10 }}>
              <input placeholder="Code à 6 chiffres" value={gcResetCode} onChange={e=>setGcResetCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                maxLength={6} style={{ ...inp, textAlign:'center', fontSize:22, fontWeight:900, letterSpacing:'0.3em', fontFamily:'monospace' }} />
            </div>
            <div style={{ marginBottom:16 }}>
              <input type="password" placeholder="Nouveau mot de passe (min. 6 car.)" value={gcNewPwd} onChange={e=>setGcNewPwd(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&confirmGcReset()} style={inp} />
            </div>
            {gcForgotErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 12px', fontWeight:600 }}>{gcForgotErr}</p>}
            <button onClick={confirmGcReset} disabled={gcForgotLoad || gcResetCode.length < 6 || gcNewPwd.length < 6}
              style={{ width:'100%', padding:'15px', borderRadius:16, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white', border:'none', fontWeight:800, fontSize:15, cursor:'pointer', opacity:(gcForgotLoad||gcResetCode.length<6||gcNewPwd.length<6)?0.6:1 }}>
              {gcForgotLoad ? '...' : 'Changer le mot de passe'}
            </button>
          </div>
        )}

        {/* LOGIN / REGISTER */}
        {!gcUser && mode !== 'forgot_gc' && mode !== 'forgot_gc_code' && (
          <div style={{ background:th.card, borderRadius:24, padding:24, border:`1px solid ${th.border}` }}>
            <div style={{ display:'flex', gap:0, marginBottom:20, background:th.inputBg, borderRadius:12, padding:4 }}>
              {['login','register'].map(m => (
                <button key={m} onClick={()=>setMode(m)} style={{ flex:1, padding:'9px', borderRadius:10, border:'none', fontWeight:700, fontSize:13, cursor:'pointer', background:mode===m?'#6366f1':'transparent', color:mode===m?'white':th.muted }}>
                  {m==='login' ? 'Connexion' : 'Creer un compte'}
                </button>
              ))}
            </div>

            {mode==='register' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <input placeholder="Prénom *" value={first} onChange={e=>setFirst(e.target.value)} style={inp} />
                <input placeholder="Nom" value={last} onChange={e=>setLast(e.target.value)} style={inp} />
              </div>
            )}
            <div style={{ marginBottom:10 }}>
              <input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inp} />
            </div>
            {mode==='register' && (
              <div style={{ marginBottom:10 }}>
                <input placeholder="Téléphone (optionnel)" value={phone} onChange={e=>setPhone(e.target.value)} style={inp} />
              </div>
            )}
            {mode==='register' && (
              <div style={{ marginBottom:10 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:th.muted,
                  marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  🎂 Date de naissance (optionnel)
                </label>
                <input type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)}
                  max={new Date().toISOString().slice(0,10)} style={inp} />
                <p style={{ fontSize:11, color:th.dim, margin:'4px 0 0' }}>
                  Recevez une offre spéciale le jour de votre anniversaire.
                </p>
              </div>
            )}
            <div style={{ marginBottom:16 }}>
              <input placeholder="Mot de passe" type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&(mode==='login'?handleLogin():handleRegister())} style={inp} />
            </div>
            {err && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 12px', fontWeight:600 }}>{err}</p>}
            <button onClick={mode==='login'?handleLogin:handleRegister} disabled={loading}
              style={{ width:'100%', padding:'15px', borderRadius:16, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white', border:'none', fontWeight:800, fontSize:15, cursor:'pointer', opacity:loading?0.7:1 }}>
              {loading ? '...' : (mode==='login' ? 'Se connecter' : 'Creer mon compte')}
            </button>
            {mode==='login' && (
              <p style={{ textAlign:'center', margin:'12px 0 0' }}>
                <button onClick={()=>setMode('forgot_gc')}
                  style={{ background:'none', border:'none', color:th.muted, fontSize:12, cursor:'pointer', textDecoration:'underline' }}>
                  Mot de passe oublié ?
                </button>
              </p>
            )}
            <p style={{ textAlign:'center', fontSize:12, color:th.muted, margin:'10px 0 0' }}>
              Un seul compte pour tous vos commerçants FlowIA
            </p>
          </div>
        )}

        {/* DASHBOARD */}
        {gcUser && (<>
          {/* Profil */}
          <div style={{ background:th.card, borderRadius:20, padding:20, border:`1px solid ${th.border}`, marginBottom:16, display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:52, height:52, borderRadius:16, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:900, fontSize:20 }}>
              {(gcUser.first_name||'?').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ margin:'0 0 2px', fontWeight:800, fontSize:16, color:th.text }}>{gcUser.first_name} {gcUser.last_name}</p>
              <p style={{ margin:0, fontSize:12, color:th.muted }}>{gcUser.email}</p>
            </div>
            <button onClick={onLogout} style={{ padding:'6px 12px', borderRadius:10, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', color:'#ef4444', fontWeight:700, fontSize:12, cursor:'pointer' }}>
              Déco.
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:6, marginBottom:16, overflowX:'auto' }}>
            {[['appts','📅 RDV'],['loyalty','🎫 Fidélite'],['profile','👤 Profil']].map(([t,lbl]) => (
              <button key={t} onClick={()=>setTab(t)} style={{ flexShrink:0, padding:'9px 14px', borderRadius:14, border:'none', fontWeight:700, fontSize:12, cursor:'pointer', background:tab===t?'#6366f1':'rgba(99,102,241,0.08)', color:tab===t?'white':'#6366f1' }}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Rendez-vous */}
          {tab==='appts' && (<>
            {apts.length===0 && <p style={{ textAlign:'center', color:th.muted, padding:32 }}>Aucun rendez-vous enregistré.</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {apts.map((a,i) => (
                <div key={i} style={{ background:th.card, borderRadius:16, padding:16, border:`1px solid ${th.border}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div>
                      <p style={{ margin:'0 0 2px', fontWeight:800, fontSize:14, color:th.text }}>{a.service_name||'Rendez-vous'}</p>
                      <p style={{ margin:0, fontSize:12, color:th.muted }}>{a.business_name}</p>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:statusC[a.status]||'#94a3b8', background:`${statusC[a.status]||'#94a3b8'}18`, padding:'3px 10px', borderRadius:99 }}>
                      {statusL[a.status]||a.status}
                    </span>
                  </div>
                  <p style={{ margin:0, fontSize:12, color:th.muted }}>
                    {fmtD(a.date)} · {(a.start_time||'').slice(0,5)}
                    {a.employee_name ? ` · ${a.employee_name}` : ''}
                  </p>
                  {a.total_amount && <p style={{ margin:'4px 0 0', fontSize:13, fontWeight:700, color:'#10b981' }}>{Number(a.total_amount).toFixed(2)} €</p>}
                </div>
              ))}
            </div>
          </>)}

          {/* Fidélité multi-commerces */}
          {tab==='loyalty' && (<>
            {loyalty.length===0 && <p style={{ textAlign:'center', color:th.muted, padding:32 }}>Aucun programme fidélité actif.</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {loyalty.map((l,i) => {
                const mode = l.loyalty_mode === 'points' ? 'points' : 'stamps';
                const current = mode==='points' ? Math.floor(l.points||0) : (l.stamps||0);
                const required = l.stamps_required || 10;
                const pct = Math.min(100, Math.round((current/required)*100));
                return (
                  <div key={i} style={{ background:th.card, borderRadius:16, padding:16, border:`1px solid ${th.border}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <div>
                        <p style={{ margin:'0 0 2px', fontWeight:800, fontSize:14, color:th.text }}>{l.business_name}</p>
                        <p style={{ margin:0, fontSize:11, color:th.muted }}>{l.reward_label}</p>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <span style={{ fontSize:20, fontWeight:900, color:'#f59e0b', fontFamily:'monospace' }}>{current}</span>
                        <span style={{ fontSize:12, color:th.muted }}>/{required} {mode==='points'?'pts':'🎫'}</span>
                      </div>
                    </div>
                    <div style={{ height:6, background:'rgba(245,158,11,0.15)', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#f59e0b,#f97316)', borderRadius:99, transition:'width 0.5s' }} />
                    </div>
                    {l.last_visit && <p style={{ margin:'8px 0 0', fontSize:11, color:th.muted }}>Dernière visite : {fmtD(l.last_visit)}</p>}
                  </div>
                );
              })}
            </div>
          </>)}

          {/* ─── ONGLET PROFIL ─── */}
          {tab==='profile' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

              {/* Avatar Google si disponible */}
              {gcUser?.avatar_url && (
                <div style={{ display:'flex', alignItems:'center', gap:12,
                  padding:'14px 16px', background:th.card,
                  borderRadius:16, border:`1px solid ${th.border}` }}>
                  <img src={gcUser.avatar_url} alt="avatar"
                    style={{ width:48, height:48, borderRadius:99, objectFit:'cover',
                      border:`2px solid ${th.border}` }} />
                  <div>
                    <p style={{ margin:'0 0 2px', fontWeight:700, fontSize:14, color:th.text }}>
                      {gcUser.first_name} {gcUser.last_name}
                    </p>
                    <p style={{ margin:0, fontSize:11, color:th.muted }}>
                      🔗 Connecté via Google
                    </p>
                  </div>
                </div>
              )}

              {/* Édition du profil */}
              <div style={{ background:th.card, borderRadius:20, padding:20, border:`1px solid ${th.border}` }}>
                <p style={{ margin:'0 0 14px', fontWeight:800, fontSize:15, color:th.text }}>Mes informations</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  <input placeholder="Prénom" value={editFirst||gcUser?.first_name||''}
                    onFocus={e=>{ if(!editFirst&&!editLast) initProfileEdit(); }}
                    onChange={e=>setEditFirst(e.target.value)} style={inp} />
                  <input placeholder="Nom" value={editLast||gcUser?.last_name||''}
                    onFocus={e=>{ if(!editFirst&&!editLast) initProfileEdit(); }}
                    onChange={e=>setEditLast(e.target.value)} style={inp} />
                </div>
                <div style={{ marginBottom:10 }}>
                  <input type="email" placeholder="Email" value={editEmail||gcUser?.email||''}
                    onFocus={e=>{ if(!editEmail) initProfileEdit(); }}
                    onChange={e=>setEditEmail(e.target.value)} style={inp} />
                </div>
                <div style={{ marginBottom:14 }}>
                  <input placeholder="Téléphone" value={editPhone||gcUser?.phone||''}
                    onFocus={e=>{ if(!editPhone) initProfileEdit(); }}
                    onChange={e=>setEditPhone(e.target.value)} style={inp} />
                </div>
                {profErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 10px', fontWeight:600 }}>{profErr}</p>}
                {profOk  && <p style={{ color:'#10b981', fontSize:13, margin:'0 0 10px', fontWeight:600 }}>{profOk}</p>}
                <button onClick={saveProfile} disabled={profLoad}
                  style={{ width:'100%', padding:'13px', borderRadius:14, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white', border:'none', fontWeight:800, fontSize:14, cursor:'pointer', opacity:profLoad?0.7:1 }}>
                  {profLoad ? '...' : 'Enregistrer les modifications'}
                </button>
              </div>

              {/* Changer le mot de passe */}
              <div style={{ background:th.card, borderRadius:20, padding:20, border:`1px solid ${th.border}` }}>
                <p style={{ margin:'0 0 14px', fontWeight:800, fontSize:15, color:th.text }}>Changer le mot de passe</p>
                <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
                  <input type="password" placeholder="Mot de passe actuel" value={curPwd} onChange={e=>setCurPwd(e.target.value)} style={inp} />
                  <input type="password" placeholder="Nouveau mot de passe (min. 6 car.)" value={newPwd2} onChange={e=>setNewPwd2(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&savePassword()} style={inp} />
                </div>
                {pwdErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 10px', fontWeight:600 }}>{pwdErr}</p>}
                {pwdOk  && <p style={{ color:'#10b981', fontSize:13, margin:'0 0 10px', fontWeight:600 }}>{pwdOk}</p>}
                <button onClick={savePassword} disabled={pwdLoad || !curPwd || !newPwd2}
                  style={{ width:'100%', padding:'13px', borderRadius:14, background:'rgba(99,102,241,0.1)', color:'#6366f1', border:'1px solid rgba(99,102,241,0.25)', fontWeight:800, fontSize:14, cursor:'pointer', opacity:(pwdLoad||!curPwd||!newPwd2)?0.5:1 }}>
                  {pwdLoad ? '...' : 'Modifier le mot de passe'}
                </button>
              </div>

              {/* Export données RGPD */}
              <div style={{ background:th.card, borderRadius:20, padding:20, border:`1px solid ${th.border}` }}>
                <p style={{ margin:'0 0 4px', fontWeight:800, fontSize:15, color:th.text }}>📦 Mes données personnelles</p>
                <p style={{ margin:'0 0 14px', fontSize:12, color:th.muted, lineHeight:1.5 }}>
                  Conformément au RGPD (Art. 20), vous pouvez télécharger l'ensemble de vos données personnelles
                  stockées sur FlowIA : compte, rendez-vous, fidélité.
                </p>
                <button onClick={exportMyData} disabled={exportLoad}
                  style={{ width:'100%', padding:'12px', borderRadius:12,
                    background:'rgba(99,102,241,0.08)', color:'#6366f1',
                    border:'1px solid rgba(99,102,241,0.2)',
                    fontWeight:700, fontSize:13, cursor:'pointer',
                    opacity:exportLoad?0.6:1, marginBottom:10 }}>
                  {exportLoad ? '⏳ Préparation...' : '⬇️ Télécharger mes données (JSON)'}
                </button>
                <button onClick={()=>setShowRgpd(true)}
                  style={{ width:'100%', padding:'10px', borderRadius:12,
                    background:'transparent', color:th.muted,
                    border:`1px solid ${th.border}`,
                    fontWeight:600, fontSize:12, cursor:'pointer' }}>
                  📋 Politique de confidentialité
                </button>
              </div>

              {/* Suppression de compte */}
              <div style={{ background:'rgba(239,68,68,0.04)', borderRadius:20, padding:20, border:'1px solid rgba(239,68,68,0.15)' }}>
                <p style={{ margin:'0 0 6px', fontWeight:800, fontSize:15, color:'#ef4444' }}>🗑 Supprimer mon compte</p>
                <p style={{ margin:'0 0 14px', fontSize:12, color:th.muted, lineHeight:1.5 }}>
                  Vos données personnelles (nom, email, téléphone) seront <strong>définitivement effacées</strong>.
                  Les historiques de transactions sont conservés de façon anonyme pour la comptabilité des commerçants.
                </p>
                <input placeholder="Tapez SUPPRIMER pour confirmer" value={delConfirm}
                  onChange={e=>{ setDelConfirm(e.target.value.toUpperCase()); setDelErr(''); }}
                  style={{ width:'100%', padding:'12px 14px', borderRadius:10, outline:'none',
                    background:th.inputBg, border:'1px solid rgba(239,68,68,0.3)',
                    color:th.text, fontSize:13, marginBottom:10, boxSizing:'border-box' }} />
                {delErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 10px', fontWeight:600 }}>{delErr}</p>}
                <button onClick={deleteAccount} disabled={delLoad || delConfirm !== 'SUPPRIMER'}
                  style={{ width:'100%', padding:'13px', borderRadius:14,
                    background:'rgba(239,68,68,0.12)', color:'#ef4444',
                    border:'1px solid rgba(239,68,68,0.25)',
                    fontWeight:800, fontSize:14, cursor:'pointer',
                    opacity:(delLoad||delConfirm!=='SUPPRIMER')?0.5:1 }}>
                  {delLoad ? '...' : '🗑 Supprimer définitivement mon compte'}
                </button>
              </div>

              {/* Modal Politique de confidentialité RGPD */}
              {showRgpd && (
                <div style={{ position:'fixed', inset:0, zIndex:1000,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  padding:16, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
                  onClick={()=>setShowRgpd(false)}>
                  <div style={{ background:th.card, borderRadius:24, padding:28,
                    maxWidth:480, width:'100%', maxHeight:'80vh', overflowY:'auto',
                    border:`1px solid ${th.border}` }}
                    onClick={e=>e.stopPropagation()}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                      <p style={{ margin:0, fontWeight:800, fontSize:16, color:th.text }}>🔒 Politique de confidentialité</p>
                      <button onClick={()=>setShowRgpd(false)}
                        style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:th.muted }}>×</button>
                    </div>
                    {[
                      ['📋 Données collectées', 'Lors de votre inscription et de vos réservations, nous collectons : prénom, nom, email, téléphone. Ces données sont nécessaires pour gérer vos rendez-vous.'],
                      ['🎯 Finalité', "Vos données sont utilisées exclusivement pour : la gestion de vos réservations, l'envoi de confirmations et rappels, le programme de fidélité."],
                      ['⏱ Durée de conservation', 'Vos données personnelles sont conservées le temps de votre inscription. Les historiques de transactions sont conservés de façon anonyme à des fins comptables.'],
                      ['✅ Vos droits (Art. 15-22 RGPD)', "Vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition. Exercez-les depuis votre profil ou en contactant le commerçant."],
                      ['🔐 Sécurité', "Vos mots de passe sont chiffrés (bcrypt). Les communications sont sécurisées par SSL/TLS. Aucune donnée n'est vendue à des tiers."],
                      ['📧 Contact', "Pour toute question relative à vos données personnelles, contactez directement le commerçant ou écrivez à l'adresse indiquée sur le site de réservation."],
                    ].map(([title, text]) => (
                      <div key={title} style={{ marginBottom:14 }}>
                        <p style={{ margin:'0 0 4px', fontWeight:700, fontSize:13, color:th.text }}>{title}</p>
                        <p style={{ margin:0, fontSize:12, color:th.muted, lineHeight:1.6 }}>{text}</p>
                      </div>
                    ))}
                    <button onClick={()=>setShowRgpd(false)}
                      style={{ width:'100%', padding:'12px', borderRadius:12, marginTop:8,
                        background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white',
                        border:'none', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                      Fermer
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </>)}
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function BookingPage({ slug }) {
  // Thème avec persistance localStorage
  const savedMode = localStorage.getItem('ff_booking_theme') || 'light';
  const [themeMode, setThemeMode] = useState(savedMode);
  const th = themeMode === 'dark' ? DARK_THEME : LIGHT_THEME;
  const toggleTheme = () => {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    localStorage.setItem('ff_booking_theme', next);
  };

  // Synchroniser le fond du body avec le thème
  useEffect(() => {
    document.body.style.background = th.bg;
    document.documentElement.style.background = th.bg;
    return () => {
      document.body.style.background = '';
      document.documentElement.style.background = '';
    };
  }, [th.bg]);

  // ── Routing — synchronisation URL ↔ état réservation ──────────────────
  const navigate  = useNavigate();
  const location  = useLocation();

  // Code de parrainage capturé depuis ?ref=CODE (persistant dans localStorage
  // pour survivre au flow auth qui peut rediriger). Envoyé au POST /book.
  const [referralCode, setReferralCode] = useState(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('ref');
      if (fromUrl) {
        localStorage.setItem('ff_booking_ref_' + slug, fromUrl.toUpperCase());
        return fromUrl.toUpperCase();
      }
      return localStorage.getItem('ff_booking_ref_' + slug) || '';
    } catch { return ''; }
  });

  // Gérer le retour Google OAuth (URL directe sans popup)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcToken  = params.get('gc_token');
    const gcClient = params.get('gc_client');
    const authErr  = params.get('auth_error');

    if (gcToken && gcClient) {
      try {
        const client = JSON.parse(decodeURIComponent(gcClient));
        localStorage.setItem('ff_client_token', gcToken);
        localStorage.setItem('ff_client_info', JSON.stringify(client));
        setClientUser(client);
        // Nettoyer l'URL
        window.history.replaceState({}, '', window.location.pathname);
      } catch(e) { console.error('[GOOGLE CALLBACK]', e); }
    }
    if (authErr) {
      console.warn('[GOOGLE AUTH ERROR]', decodeURIComponent(authErr));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Lire l'URL au montage et restaurer la vue (client/rdv, client/profil)
  // + gérer les ancres hash pour scroll automatique vers les sections
  useEffect(() => {
    const path = location.pathname;
    const hash = location.hash; // ex: #equipe, #adresse, #commentaires, #prestations
    if (path.endsWith('/auth')) {
      setShowAuthPanel(true);
    } else if (path.includes('/client/profil')) {
      setView('myAppts');
      setMyApptsInitTab('profile');
    } else if (path.includes('/client/rdv')) {
      setView('myAppts');
      setMyApptsInitTab('appts');
    } else if (path.endsWith('/parrain')) {
      setView('parrain');
    } else if (hash) {
      // Mapping ancres → IDs de section
      const ANCHOR_MAP = {
        '#equipe':        'section-equipe',
        '#equipes':       'section-equipe',
        '#adresse':       'section-adresse',
        '#adresses':      'section-adresse',
        '#commentaires':  'section-avis',
        '#avis':          'section-avis',
        '#commentaire':   'section-avis',
        '#prestations':   'section-prestations',
        '#prestation':    'section-prestations',
        '#services':      'section-prestations',
        '#images':        'section-photos',
        '#photos':        'section-photos',
        '#album':         'section-photos',
        '#horaires':      'section-horaires',
        '#horaire':       'section-horaires',
        '#hours':         'section-horaires',
      };
      const targetId = ANCHOR_MAP[hash.toLowerCase()] || hash.replace('#','section-');
      // Scroller après chargement de la page
      setTimeout(() => {
        const el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
      }, 600);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Construire l'URL pour chaque étape
  const stepToPath = (s, svcId, empId, dateStr, slot) => {
    const base = `/book/${slug}`;
    if (s === 1) return base;
    if (s === 2 && svcId) return `${base}/service/${svcId}/employe`;
    if (s === 3 && svcId && empId) return `${base}/service/${svcId}/employe/${empId}/date`;
    if (s === 4 && svcId && empId && dateStr) return `${base}/service/${svcId}/employe/${empId}/date/${dateStr}/creneau`;
    if (s === 5 && svcId && empId && dateStr && slot) return `${base}/service/${svcId}/employe/${empId}/date/${dateStr}/creneau/${slot}/infos`;
    if (s === 6 && svcId && empId && dateStr && slot) return `${base}/service/${svcId}/employe/${empId}/date/${dateStr}/creneau/${slot}/confirmation`;
    return base;
  };

  // Wrapper setStep qui met aussi à jour l'URL
  const goToStep = (s, svc, emp, date, slot) => {
    const svcId   = (svc  || selSvc)?.id   || null;
    const empId   = (emp  || selEmp)?._anyEmployee ? 'any' : ((emp || selEmp)?.id || null);
    const dateStr = (date || selDate)?.toLocaleDateString('sv-SE') || null;
    const slotStr = slot || selSlot || null;
    const path    = stepToPath(s, svcId, empId, dateStr, slotStr);
    navigate(path, { replace: s === 1 });
    setStep(s);
  };

  const [business, setBiz]     = useState(null);
  const [googleRating, setGoogleRating] = useState(null); // { rating, total_ratings } ou null
  // Compte client global (plateforme)
  const [gcToken,   setGcToken]   = useState(() => localStorage.getItem('ff_gc_token') || null);
  const [gcUser,    setGcUser]    = useState(() => { try { return JSON.parse(localStorage.getItem('ff_gc_user') || 'null'); } catch { return null; } });
  const [services, setSvcs]    = useState([]);
  const [employees, setEmps]   = useState([]);
  const [closedDays, setClosed]   = useState([]);
  const [monthStatus, setMonthStatus] = useState({}); // { 'YYYY-MM-DD': 'open'|'closed'|'full' }
  const [monthKey,    setMonthKey]    = useState('');  // 'YYYY-MM' courant affiché
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState('');
  const [isBlocked, setIsBlocked] = useState(false); // client bloqué par le commerçant

  // Flux réservation
  const [view, setView]          = useState('booking'); // 'booking' | 'myAppts' | 'success' | 'parrain'

  // Programme de parrainage : null tant que la requête n'est pas résolue,
  // objet { is_enabled, parrain_type, parrain_value, ... } si le commerçant a
  // configuré un programme (même désactivé), 'none' si aucun programme créé.
  const [refProgram, setRefProgram] = useState(null);
  const [refMyCode, setRefMyCode]   = useState(null);
  const [refMyHistory, setRefMyHistory] = useState([]);
  const [refMyRewards, setRefMyRewards] = useState([]);
  const [step, setStep]          = useState(1);
  const [selSvc, setSelSvc]      = useState(null);
  const [selEmp, setSelEmp]      = useState(null);
  const [selDate, setSelDate]    = useState(null);
  const [selSlot, setSelSlot]    = useState(null);
  const [slots, setSlots]        = useState([]);
  const [slotsLoading, setSL]    = useState(false);
  // Créneaux filtrés — masque les heures passées si c'est aujourd'hui
  const visibleSlots = useMemo(() => {
    if (!slots.length) return slots;
    const todayKey = new Date().toLocaleDateString('sv-SE');
    const isToday  = selDate && selDate.toLocaleDateString('sv-SE') === todayKey;
    if (!isToday) return slots;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const toMin  = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    return slots.filter(s => toMin(s) > nowMin);
  }, [slots, selDate]);
  const [calMonth, setCalMonth]  = useState(new Date());
  const [bookedAppt, setBooked]  = useState(null);

  // Infos client
  const [clientName, setCN]  = useState('');
  const [clientEmail, setCE] = useState('');
  const [clientPhone, setCP] = useState('');
  const [notes, setNotes]    = useState('');
  const [booking, setBooking] = useState(false);
  const [bookErr, setBookErr] = useState('');

  // Téléphone avec indicatif pays
  const PHONE_COUNTRIES = [
    { code:'FR', dial:'+33', flag:'🇫🇷', len:[9,10], label:'France' },
    { code:'BE', dial:'+32', flag:'🇧🇪', len:[8,9],  label:'Belgique' },
    { code:'CH', dial:'+41', flag:'🇨🇭', len:[9,10], label:'Suisse' },
    { code:'LU', dial:'+352',flag:'🇱🇺', len:[8,9],  label:'Luxembourg' },
    { code:'CA', dial:'+1',  flag:'🇨🇦', len:[10],   label:'Canada' },
    { code:'MA', dial:'+212',flag:'🇲🇦', len:[9],    label:'Maroc' },
    { code:'TN', dial:'+216',flag:'🇹🇳', len:[8],    label:'Tunisie' },
    { code:'DZ', dial:'+213',flag:'🇩🇿', len:[9],    label:'Algérie' },
    { code:'SN', dial:'+221',flag:'🇸🇳', len:[9],    label:'Sénégal' },
    { code:'CI', dial:'+225',flag:'🇨🇮', len:[10],   label:'Côte d\'Ivoire' },
    { code:'DE', dial:'+49', flag:'🇩🇪', len:[10,11],label:'Allemagne' },
    { code:'ES', dial:'+34', flag:'🇪🇸', len:[9],    label:'Espagne' },
    { code:'IT', dial:'+39', flag:'🇮🇹', len:[9,10], label:'Italie' },
    { code:'PT', dial:'+351',flag:'🇵🇹', len:[9],    label:'Portugal' },
    { code:'GB', dial:'+44', flag:'🇬🇧', len:[10,11],label:'Royaume-Uni' },
    { code:'US', dial:'+1',  flag:'🇺🇸', len:[10],   label:'États-Unis' },
  ];
  const [phoneCC, setPhoneCC]       = useState(PHONE_COUNTRIES[0]); // pays sélectionné
  const [phoneLocal, setPhoneLocal] = useState(''); // numéro local brut
  const [phoneDrop, setPhoneDrop]   = useState(false); // dropdown ouvert
  const [phoneErr, setPhoneErr]     = useState('');

  // Formater le numéro final : +<dial><numéro sans zéro initial>
  const formatPhone = (country, local) => {
    const digits = local.replace(/\D/g, '');
    if (!digits) return '';
    const stripped = digits.startsWith('0') ? digits.slice(1) : digits;
    return `${country.dial}${stripped}`;
  };
  // Valider le numéro local
  const validatePhone = (country, local) => {
    const digits = local.replace(/\D/g, '');
    if (!digits) return 'Numéro requis';
    const stripped = digits.startsWith('0') ? digits.slice(1) : digits;
    if (!country.len.includes(stripped.length)) {
      return `Numéro invalide pour ${country.label} (${country.len.join(' ou ')} chiffres attendus)`;
    }
    return '';
  };
  // Parser un numéro international existant → { country, local }
  const parsePhone = (phone) => {
    if (!phone) return { country: PHONE_COUNTRIES[0], local: '' };
    const match = PHONE_COUNTRIES.find(c => phone.startsWith(c.dial));
    if (match) {
      const rest = phone.slice(match.dial.length);
      return { country: match, local: rest };
    }
    return { country: PHONE_COUNTRIES[0], local: phone };
  };

  // Vérification email en temps réel (étape 5)
  const [emailStatus, setEmailStatus] = useState('idle'); // 'idle'|'checking'|'exists'|'free'|'invalid'
  const emailCheckTimer = useRef(null);

  // Auth client
  const [clientUser, setClientUser]   = useState(null);
  // showAuthPanel = true → AuthPanel flottant (navbar, hors flow)
  const [showAuthPanel, setShowAuthPanel]  = useState(false);
  const [authInitEmail, setAuthInitEmail]  = useState('');
  const [requireAccount, setRequire]  = useState(false);
  const [pendingBook,   setPendingBook]   = useState(false);
  const [myApptsInitTab, setMyApptsInitTab] = useState('appts');
  // Auth inline dans l'étape 5 — remplace le formulaire sans compte quand cliqué
  // 'none' | 'login' | 'register'
  const [inlineAuthMode, setInlineAuthMode] = useState('none');

  // Promo / fidélité
  const [promoCode,    setPromoCode]    = useState('');
  const [promoData,    setPromoData]    = useState(null);
  const [promoErr,     setPromoErr]     = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  const checkPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true); setPromoErr('');
    try {
      const res = await pubApi.checkPromo(slug, {
        code: promoCode.trim(),
        amount: selSvc?.price || 0,
      });
      if (res.valid) { setPromoData(res); setPromoErr(''); }
      else { setPromoData(null); setPromoErr(res.error || 'Code invalide'); }
    } catch { setPromoErr('Erreur reseau'); }
    finally { setPromoLoading(false); }
  };

  // Restore client session
  useEffect(() => {
    const token = localStorage.getItem('ff_client_token');
    const stored = localStorage.getItem('ff_client_info');
    if (token && stored) {
      try {
        const info = JSON.parse(stored);
        setClientUser(info);
        setCN(`${info.first_name} ${info.last_name}`);
        setCE(info.email);
        const ph = info.phone || '';
        setCP(ph);
        if (ph) { const p = parsePhone(ph); setPhoneCC(p.country); setPhoneLocal(p.local); }
      } catch {}
    }
  }, []);

  // ── Relancer la réservation automatiquement après connexion/inscription ──────
  // Quand pendingBook=true ET clientUser vient d'être mis à jour (re-render),
  // on relance handleBook(). À ce moment clientUser est bien à jour dans la closure.
  useEffect(() => {
    if (pendingBook && clientUser) {
      setPendingBook(false);
      // Légère pause pour laisser React finir le rendu
      setTimeout(() => { handleBook(); }, 50);
    }
  }, [clientUser, pendingBook]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load business data
  useEffect(() => {
    Promise.all([
      pubApi.getBusiness(slug),
      pubApi.getServices(slug),
      pubApi.getEmployees(slug),
      pubApi.getClosedDays ? pubApi.getClosedDays(slug) : Promise.resolve({ closedDays: [] }),
    ])
      .then(([biz, svcs, emps, cd]) => {
        setBiz(biz.business);
        setSvcs(svcs);
        setEmps(emps);
        setRequire(biz.business?.require_account ?? false);
        setClosed(cd?.closedDays || []);
        // Récupère la note Google réelle si un lien Google Business est configuré
        if (biz.business?.google_business_url) {
          pubApi.getGoogleRating(slug)
            .then(r => { if (r?.found) setGoogleRating({ rating: r.rating, total: r.total_ratings }); })
            .catch(() => { /* silent — garde fallback visuel */ });
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  // Programme parrainage — silent si inexistant (404). La présence dans la DB
  // (active ou non) conditionne l'affichage du lien de navigation.
  useEffect(() => {
    publicReferralApi.getProgram(slug)
      .then(p => setRefProgram(p))
      .catch(() => setRefProgram('none'));
  }, [slug]);

  // Charger code perso + historique + rewards quand on entre sur la vue parrain
  // (uniquement si le client est connecté en compte global).
  useEffect(() => {
    if (view !== 'parrain') return;
    const gcToken = localStorage.getItem('ff_gc_token');
    if (!gcToken) { setRefMyCode(null); setRefMyHistory([]); setRefMyRewards([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const [c, h] = await Promise.all([
          globalClientApi.myReferralCode(slug).catch(() => null),
          globalClientApi.myReferralHistory(slug).catch(() => ({ history:[], rewards:[] })),
        ]);
        if (cancelled) return;
        setRefMyCode(c);
        setRefMyHistory(h?.history || []);
        setRefMyRewards(h?.rewards || []);
      } catch {/* silent */}
    })();
    return () => { cancelled = true; };
  }, [view, slug, clientUser]);

  // Load slots
  useEffect(() => {
    if (!selDate || !selEmp || !selSvc) return;
    setSL(true);
    const dateStr = selDate.toLocaleDateString('sv-SE');
    // "Au premier disponible" → envoyer sans employee_id pour union de tous les employés
    const empIdToSend = (selEmp.id && selEmp.id !== null && !selEmp._anyEmployee) ? selEmp.id : undefined;
    pubApi.getSlots(slug, { date: dateStr, ...(empIdToSend ? { employee_id: empIdToSend } : {}), service_id: selSvc.id })
      .then(r => {
        if (r.blocked) { setIsBlocked(true); setSlots([]); }
        else setSlots(r.slots || []);
      })
      .catch(() => setSlots([]))
      .finally(() => setSL(false));
  }, [selDate, selEmp, selSvc, slug]);

  // Load month status (open/closed/full par jour)
  useEffect(() => {
    if (!selSvc || !calMonth) return;
    const yr = calMonth.getFullYear();
    const mo = calMonth.getMonth() + 1;
    const empKeyPart = (selEmp && !selEmp._anyEmployee) ? `-${selEmp.id}` : '';
    const key = `${yr}-${mo}${empKeyPart}`;
    if (key === monthKey) return;
    const empIdForMonth = (selEmp && !selEmp._anyEmployee) ? selEmp.id : undefined;
    const monthParams = { year: yr, month: String(mo).padStart(2,'0'), service_id: selSvc.id };
    if (empIdForMonth) monthParams.employee_id = empIdForMonth;
    pubApi.getMonthStatus(slug, monthParams)
      .then(r => { setMonthStatus(r || {}); setMonthKey(key); })
      .catch(() => {});
  }, [selSvc, selEmp, calMonth, slug, monthKey]);

  const handleAuth = (client) => {
    setClientUser(client);
    setCN(`${client.first_name} ${client.last_name}`);
    setCE(client.email);
    const ph = client.phone || '';
    setCP(ph);
    if (ph) { const p = parsePhone(ph); setPhoneCC(p.country); setPhoneLocal(p.local); }
    else { setPhoneLocal(''); }
    setPhoneErr('');
    setShowAuthPanel(false);
    setInlineAuthMode('none');
    // Si connecté à l'étape 5 → avancer à 6 seulement si le téléphone est renseigné
    if (step === 5 && client.phone) {
      setTimeout(() => setStep(6), 50);
    }
  };

  const handleBook = async () => {
    // Si compte requis et pas encore connecté → ouvrir auth + mémoriser qu'on voulait réserver
    const localToken = localStorage.getItem('ff_client_token');
    if (requireAccount && !clientUser && !localToken) { setShowAuthPanel(true); setPendingBook(true); return; }
    // Sans compte requis : permettre la réservation si les champs obligatoires sont remplis
    if (!requireAccount && !clientUser && !localToken && (!clientName.trim() || !clientPhone.trim())) { setBookErr('Nom et téléphone obligatoires.'); return; }
    // Connecté mais téléphone manquant → renvoyer à l'étape 5
    if ((clientUser || localToken) && !clientPhone.trim()) { setBookErr('Téléphone obligatoire. Veuillez compléter votre profil.'); setStep(5); return; }
    setBooking(true); setBookErr('');
    try {
      // ── Re-vérification du code promo au moment de la confirmation ──────────
      // Garantit que le code n'a pas été utilisé/expiré entre la vérification
      // initiale et la confirmation finale (même page gardée ouverte)
      let finalPromoId  = null;
      let finalDiscount = 0;
      let finalPromoCode = null;

      if (promoData && promoCode.trim()) {
        const recheck = await pubApi.checkPromo(slug, {
          code:         promoCode.trim(),
          amount:       selSvc?.price || 0,
          client_email: clientEmail || undefined,
        });
        if (!recheck.valid) {
          // Code devenu invalide → vider l'input, bloquer la réservation
          setPromoData(null);
          setPromoCode('');
          setPromoErr(recheck.error || "Ce code n'est plus valide.");
          setBooking(false);
          return;
        }
        finalPromoId   = recheck.promo_id;
        finalDiscount  = recheck.discount || 0;
        finalPromoCode = promoCode.trim();
      }

      const token = localStorage.getItem('ff_client_token');
      const result = await pubApi.book(slug, {
        service_id:      selSvc.id,
        employee_id:     (selEmp?._anyEmployee ? null : selEmp?.id),
        date:            selDate.toLocaleDateString('sv-SE'),
        start_time:      selSlot,
        client_name:     clientName,
        client_email:    clientEmail,
        client_phone:    clientPhone,
        notes,
        client_token:    token || undefined,
        promo_code_id:   finalPromoId,
        discount_amount: finalDiscount,
        promo_code:      finalPromoCode,
        referral_code:   referralCode || undefined,
      });
      // Code parrainage consommé → on le retire pour éviter une seconde utilisation
      if (referralCode) {
        try { localStorage.removeItem('ff_booking_ref_' + slug); } catch {}
        setReferralCode('');
      }
      setBooked(result);
      setView('success');
    } catch (e) {
      if (requireAccount && e.message?.includes('compte')) { setShowAuthPanel(true); setPendingBook(true); }
      else if (e.message?.includes('n\'accepte plus') || e.message?.includes('bloque')) { setIsBlocked(true); }
      else setBookErr(e.message);
    }
    finally { setBooking(false); }
  };

  const resetBooking = () => {
    setStep(1); setSelSvc(null); setSelEmp(null); setSelDate(null); setSelSlot(null);
    setNotes(''); setBookErr(''); setBooked(null); setView('booking'); setMonthKey('');
    setPromoCode(''); setPromoData(null); setPromoErr('');
    setPendingBook(false);
    setInlineAuthMode('none');
    setPhoneLocal(''); setPhoneErr(''); setPhoneDrop(false);
    navigate(`/book/${slug}`, { replace: true });
  };

  // Calendrier
  const today = new Date(); today.setHours(0,0,0,0);
  const maxDate = new Date(today); maxDate.setDate(today.getDate() + (business?.advance_booking_days || 30));
  const firstOfMonth = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const daysInMonth  = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 0).getDate();
  const startDay = (firstOfMonth.getDay() + 6) % 7;
  const calDays = [...Array(startDay).fill(null), ...Array.from({length:daysInMonth},(_,i) => new Date(calMonth.getFullYear(),calMonth.getMonth(),i+1))];

  // Grouper services par catégorie booking (booking_category_name prioritaire, fallback category_name)
  // Chaque entrée : { label, color, icon, svcs[] }
  const svcGroups = [];
  const svcNoCat  = [];
  const _catMap   = new Map(); // label → index dans svcGroups
  services.forEach(s => {
    const label = s.booking_category_name || s.category_name || null;
    const color = s.booking_category_color || null;
    const icon  = s.booking_category_icon  || null;
    if (!label) { svcNoCat.push(s); return; }
    if (!_catMap.has(label)) {
      _catMap.set(label, svcGroups.length);
      svcGroups.push({ label, color, icon, svcs: [] });
    }
    svcGroups[_catMap.get(label)].svcs.push(s);
  });

  const inp = "w-full px-4 py-3.5 rounded-2xl text-sm focus:outline-none";
  const inpSt = { background:th.inputBg, border:`1px solid ${th.inputBorder}`, color:th.text };

  // ── Vues principales ──────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:th.bg}}>
      <Spinner />
    </div>
  );

  if (error && !business) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{background:th.bg}}>
      <div className="text-center">
        <p className="text-5xl mb-4">😕</p>
        <h1 className="text-xl font-black mb-2" style={{color:th.text}}>Page introuvable</h1>
        <p className="text-sm" style={{color:th.muted}}>Ce lien n&apos;existe pas ou est désactivé.</p>
      </div>
    </div>
  );

  // Vue : Client bloqué
  if (isBlocked) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{background:th.bg}}>
      <div style={{ maxWidth:380, width:'100%', textAlign:'center' }}>
        <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(239,68,68,0.1)', border:'2px solid rgba(239,68,68,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, margin:'0 auto 24px' }}>
          🚫
        </div>
        <h1 style={{ fontSize:20, fontWeight:900, color:th.text, marginBottom:12, letterSpacing:'-.4px' }}>
          Réservation impossible
        </h1>
        <p style={{ fontSize:15, color:th.muted, lineHeight:1.6, marginBottom:28 }}>
          Ce commerçant n'accepte plus de réservation pour vous.<br/>
          Merci de prendre contact avec le commerçant directement.
        </p>
        {business?.phone && (
          <a href={`tel:${business.phone}`}
            style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'12px 24px', borderRadius:14, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontWeight:800, fontSize:14, textDecoration:'none' }}>
            📞 Appeler {business.business_name || 'le commerçant'}
          </a>
        )}
        {!business?.phone && (
          <p style={{ fontSize:13, color:th.muted, fontStyle:'italic' }}>
            Contactez {business?.business_name || 'le commerçant'} pour plus d'informations.
          </p>
        )}
      </div>
    </div>
  );

  // Vue : Mes RDV

  if (view === 'myAppts') return (
    <div style={{ minHeight:'100vh', background:th.bg }}>
      <NavBar th={th} slug={slug} business={business} clientUser={clientUser} refProgram={refProgram}
        onToggleTheme={toggleTheme} onShowAuth={()=>setShowAuthPanel(true)}
        onMyAppts={()=>{navigate(`/book/${slug}/client/rdv`,{replace:false}); setMyApptsInitTab('appts');}}
        onLogout={()=>{ localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); setMyApptsInitTab('appts'); setView('booking'); }}
        onReferralPage={() => { setView('parrain'); navigate(`/book/${slug}/parrain`, {replace:false}); }}
        onNavigateHome={(id)=>{ setView('booking'); goToStep(1); navigate(`/book/${slug}`,{replace:false}); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },200); }} />
      <MyAppointments slug={slug} th={th} initialTab={myApptsInitTab} business={business}
        onBack={() => { setMyApptsInitTab('appts'); setView(bookedAppt ? 'success' : 'booking'); navigate(bookedAppt ? location.pathname : `/book/${slug}`, {replace:true}); }}
        onNewBooking={resetBooking}
        onLogout={() => {
          localStorage.removeItem('ff_client_token');
          localStorage.removeItem('ff_client_info');
          setClientUser(null); setCN(''); setCE(''); setCP('');
          setMyApptsInitTab('appts');
          setView('booking');
        }} />
    </div>
  );

  // Vue : Page parrainage
  if (view === 'parrain') return (
    <div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      <NavBar th={th} slug={slug} business={business} clientUser={clientUser} refProgram={refProgram}
        onToggleTheme={toggleTheme} onShowAuth={()=>{ setShowAuthPanel(true); navigate(`/book/${slug}/auth`, {replace:false}); }}
        onMyAppts={()=>{navigate(`/book/${slug}/client/rdv`,{replace:false}); setView('myAppts'); setMyApptsInitTab('appts');}}
        onLogout={()=>{ localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); setView('booking'); navigate(`/book/${slug}`,{replace:false}); }}
        onReferralPage={() => { /* déjà sur la page */ }}
        onNavigateHome={(id)=>{ setView('booking'); navigate(`/book/${slug}`,{replace:false}); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },200); }} />
      <ReferralPage
        th={th} slug={slug} business={business} refProgram={refProgram}
        gcConnected={!!localStorage.getItem('ff_gc_token')}
        refMyCode={refMyCode}
        refMyHistory={refMyHistory}
        refMyRewards={refMyRewards}
        onLogin={() => { setShowAuthPanel(true); navigate(`/book/${slug}/auth`, {replace:false}); setView('booking'); }}
        onBack={() => { setView('booking'); navigate(`/book/${slug}`, {replace:false}); }}
      />
    </div>
  );

  // Vue : Confirmation
  if (view === 'success' && bookedAppt) return (
    <div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      {/* Navbar persistante */}
      <NavBar th={th} slug={slug} business={business} clientUser={clientUser}
        onToggleTheme={toggleTheme} onShowAuth={()=>setShowAuthPanel(true)}
        onMyAppts={()=>{navigate(`/book/${slug}/client/rdv`,{replace:false}); setView('myAppts'); setMyApptsInitTab('appts');}}
        onLogout={()=>{ localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); }}
        onNavigateHome={(id)=>{ resetBooking(); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },300); }} />

      <div style={{ maxWidth:440, margin:'0 auto', padding:'48px 24px 80px',
        display:'flex', flexDirection:'column', alignItems:'center' }}>

        {/* Icône succès */}
        <div style={{ width:72, height:72, borderRadius:20, background:'#22c55e',
          display:'flex', alignItems:'center', justifyContent:'center', marginBottom:24,
          boxShadow:'0 8px 24px rgba(34,197,94,0.25)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round" style={{width:36,height:36}}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <h1 style={{ fontSize:24, fontWeight:900, color:th.text, margin:'0 0 8px',
          letterSpacing:'-0.03em', textAlign:'center' }}>
          Réservation confirmée !
        </h1>
        <p style={{ fontSize:14, color:th.muted, margin:'0 0 28px', textAlign:'center' }}>
          {clientEmail ? 'Un email de confirmation a été envoye.' : 'Votre RDV est enregistre.'}
        </p>

        {/* Numéro de réservation */}
        <div style={{ width:'100%', background:th.cardAlt, border:`1px solid ${th.border}`,
          borderRadius:14, padding:'16px 20px', textAlign:'center', marginBottom:16 }}>
          <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase',
            letterSpacing:'0.08em', color:th.muted, margin:'0 0 6px' }}>
            Numéro de réservation
          </p>
          <p style={{ fontSize:24, fontWeight:900, color:th.text, fontFamily:'monospace',
            margin:0, letterSpacing:'0.05em' }}>
            #{bookedAppt.id.substring(0,8).toUpperCase()}
          </p>
        </div>

        {/* Récap */}
        <div style={{ width:'100%', background:th.card, border:`1px solid ${th.border}`,
          borderRadius:14, overflow:'hidden', marginBottom:24 }}>
          {[
            ['Service',  selSvc?.name],
            ['Employe',  selEmp?._anyEmployee ? 'Premier disponible' : selEmp?.name],
            ['Date',     selDate?.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})],
            ['Heure',    selSlot],
            ['Duree',    `${selSvc?.duration_minutes} min`],
            selSvc?.price && bookedAppt?.discount_amount > 0
              ? ['Prix', '__PROMO__']
              : (selSvc?.price != null && selSvc?.price !== ''
                ? ['Prix', `${Number(selSvc.price).toFixed(2)} €`]
                : null),
            ['Client',   clientName],
          ].filter(Boolean).map(([label, val], i) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between',
              alignItems:'center', padding:'12px 20px',
              borderTop: i===0 ? 'none' : `1px solid ${th.border}` }}>
              <span style={{ fontSize:13, color:th.muted }}>{label}</span>
              {val === '__PROMO__' ? (
                <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:13, textDecoration:'line-through', color:th.dim }}>
                    {Number(selSvc.price).toFixed(2)} €
                  </span>
                  <span style={{ fontSize:13, fontWeight:800, color:'#16a34a' }}>
                    {(Number(selSvc.price||0) - Number(bookedAppt.discount_amount||0)).toFixed(2)} €
                  </span>
                </span>
              ) : (
                <span style={{ fontSize:13, fontWeight:700, color:th.text }}>{val}</span>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:10 }}>
          {clientUser && (
            <button onClick={() => { navigate(`/book/${slug}/client/rdv`,{replace:false}); setView('myAppts'); setMyApptsInitTab('appts'); }}
              style={{ width:'100%', padding:'15px', borderRadius:12, border:'none',
                background:th.accent, color:th.accentText, fontWeight:800, fontSize:14,
                cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
              Voir mes rendez-vous →
            </button>
          )}
          <button onClick={resetBooking}
            style={{ width:'100%', padding:'14px', borderRadius:12, cursor:'pointer',
              background:th.card, border:`1px solid ${th.border}`,
              color:th.text, fontWeight:600, fontSize:14 }}>
            Prendre un autre RDV
          </button>
        </div>
      </div>
    </div>
  );

  // ── Vue : Réservation — Layout Setmore exact ────────────────────────────────
  // Desktop : navbar + 2 colonnes (contenu | sidebar)
  // Mobile  : stack vertical + bouton Réserver fixe en bas
  // Logo    = /api/media/commercant/:userId/profile  (si userId exposé par getBusiness)
  // Employés = vrais employees chargés depuis pubApi
  // Adresse/tel = business.address / business.phone
  return (
    <div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      <style>{`
        @keyframes spin  { to { transform:rotate(360deg); } }
        @keyframes fadeIn{ from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        *{ box-sizing:border-box }
        @media(min-width:768px){ .bk-mo{ display:none!important } }
        @media(max-width:767px){ .bk-do{ display:none!important } .bk-2c{ flex-direction:column!important } .bk-sb{ order:-1!important } }
        @media(max-width:480px){ .bk-steps{ padding:0 4px!important } }
      `}</style>

      {/* ══ NAVBAR — composant partagé ══ */}
      <NavBar th={th} slug={slug} business={business} clientUser={clientUser} refProgram={refProgram}
        onToggleTheme={toggleTheme} onShowAuth={()=>{ setShowAuthPanel(true); navigate(`/book/${slug}/auth`, {replace:false}); }}
        onMyAppts={()=>setView('myAppts')}
        onLogout={()=>{ localStorage.removeItem('ff_client_token'); localStorage.removeItem('ff_client_info'); setClientUser(null); setCN(''); setCE(''); setCP(''); }}
        onReferralPage={() => { setView('parrain'); navigate(`/book/${slug}/parrain`, {replace:false}); }}
        onNavigateHome={(id)=>{ setView('booking'); goToStep(1); setShowAuthPanel(false); navigate(`/book/${slug}`, {replace:false}); if(id) setTimeout(()=>{ const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },200); }} />

      {/* ══ CORPS 2 COLONNES ══ */}
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 16px 80px',
        display:'flex', gap:32, alignItems:'flex-start' }} className="bk-2c">

        {/* ── COLONNE GAUCHE ── */}
        <div style={{ flex:'1 1 0%', minWidth:0, paddingTop:32, width:'100%' }}>

          {/* Panneau auth */}
          {showAuthPanel && (
            <div style={{ marginBottom:24, animation:'fadeIn .2s ease' }}>
              <AuthPanel slug={slug} th={th} requireAccount={requireAccount}
                initialEmail={authInitEmail}
                onAuth={u => { handleAuth(u); setAuthInitEmail(''); }}
                onClose={requireAccount ? null : ()=>{ setShowAuthPanel(false); setAuthInitEmail(''); navigate(`/book/${slug}`, {replace:true}); }} />
            </div>
          )}

          {/* ══ PAGE D'ACCUEIL (étape 1) ══ */}
          {!showAuthPanel && step === 1 && (
            <div style={{ animation:'fadeIn .2s ease' }}>

              {/* Infos commerçant mobile */}
              <div className="bk-mo" style={{ marginBottom:24, padding:20,
                background:th.card, borderRadius:16, border:`1px solid ${th.border}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <div style={{ width:56, height:56, borderRadius:12, overflow:'hidden', flexShrink:0,
                    background:th.cardAlt, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {business?.profile_url
                      ? <img src={mediaUrl(business.profile_url)} alt={business.business_name}
                          style={{ width:'100%', height:'100%', objectFit:'cover' }}
                          onError={e=>e.target.style.display='none'}/>
                      : <span style={{ fontSize:22, fontWeight:900, color:'#374151' }}>
                          {(business?.business_name||'B').charAt(0).toUpperCase()}
                        </span>}
                  </div>
                  <div>
                    <h1 style={{ fontSize:18, fontWeight:800, color:th.text, margin:'0 0 4px',
                      letterSpacing:'-0.02em' }}>{business?.business_name}</h1>
                  </div>
                </div>
                {business?.address && (
                  <p style={{ fontSize:12, color:th.muted, margin:'0 0 4px',
                    display:'flex', alignItems:'flex-start', gap:5 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{width:13,height:13,flexShrink:0,marginTop:1}}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    {business.address}
                  </p>
                )}
                {business?.phone && (
                  <a href={`tel:${business.phone}`}
                    style={{ fontSize:12, color:th.muted, textDecoration:'none',
                      display:'flex', alignItems:'center', gap:5 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{width:13,height:13,flexShrink:0}}>
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    {business.phone}
                  </a>
                )}
                {refProgram && refProgram !== 'none' && (
                  <button onClick={() => { setView('parrain'); navigate(`/book/${slug}/parrain`, {replace:false}); }}
                    style={{ marginTop:10, padding:'8px 12px', borderRadius:9, cursor:'pointer',
                      background:'#8b5cf615', border:'1px solid #8b5cf640',
                      color:'#6d28d9', fontWeight:700, fontSize:12,
                      display:'flex', alignItems:'center', gap:6, width:'100%', justifyContent:'center' }}>
                    🤝 Parrainer un ami
                  </button>
                )}
              </div>

              {/* ── SECTION PRESTATIONS ── */}
              <section id="section-prestations" style={{ marginBottom:40 }}>
                <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                  margin:'0 0 20px', letterSpacing:'-0.02em' }}>Nos prestations</h2>
                {services.length === 0 ? (
                  <p style={{ color:th.muted, fontSize:14 }}>Aucune prestation disponible.</p>
                ) : (
                  <div style={{ border:`1px solid ${th.border}`, borderRadius:12,
                    overflow:'hidden', background:th.card }}>
                    {[
                      ...svcGroups.map(g => ({ label:g.label, svcs:g.svcs })),
                      ...(svcNoCat.length>0 ? [{ label:null, svcs:svcNoCat }] : []),
                    ].map(({ label, svcs: gs }, gi, arr) => (
                      <AccordionGroup key={label||'__nc__'}
                        label={label} svcs={gs} th={th}
                        isLast={gi===arr.length-1}
                        onSelect={s=>{ setSelSvc(s); setSelEmp(null); setSelDate(null);
                          setSelSlot(null); setMonthKey(''); goToStep(2, s); }}/>
                    ))}
                  </div>
                )}
              </section>

              {/* ── SECTION ÉQUIPE ── */}
              <section id="section-equipe" style={{ marginBottom:40 }}>
                <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                  margin:'0 0 16px', letterSpacing:'-0.02em' }}>Équipe</h2>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
                  {employees.map(e => (
                    <div key={e.id}
                      onClick={() => {
                        // Clic employé → pré-sélectionner l'employe puis aller a l'étape 2
                        // L'étape 2 affiche les prestations filtrées pour cet employé
                        setSelEmp(e);
                        setSelSvc(null); setSelDate(null); setSelSlot(null); setMonthKey('');
                        goToStep(2, null, e);
                      }}
                      style={{ background:th.card, border:`1px solid ${th.border}`,
                        borderRadius:12, padding:'16px 14px',
                        display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
                      onMouseEnter={ev=>ev.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,0.08)'}
                      onMouseLeave={ev=>ev.currentTarget.style.boxShadow='none'}>
                      <div style={{ width:48, height:48, borderRadius:99, flexShrink:0,
                        background: e.has_image ? 'transparent' : th.cardAlt, overflow:'hidden',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        border: e.has_image ? `1px solid ${th.border}` : 'none' }}>
                        {e.has_image ? (
                          <img src={employeeImgUrl(e.id, e.image_version)} alt={e.name}
                            style={{ width:'100%', height:'100%', objectFit:'cover' }}
                            onError={ev => {
                              ev.currentTarget.style.display = 'none';
                              if (ev.currentTarget.nextSibling) ev.currentTarget.nextSibling.style.display = 'block';
                            }} />
                        ) : (
                          <span style={{ fontSize:20, fontWeight:800,
                            color:e.avatar_color||'#374151' }}>
                            {e.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:14, fontWeight:700, color:th.text,
                          margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis',
                          whiteSpace:'nowrap' }}>{e.name}</p>
                        {e.role && <p style={{ fontSize:12, color:th.muted, margin:0 }}>{e.role}</p>}
                      </div>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{width:16,height:16,color:th.dim,flexShrink:0}}>
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── SECTION COMMENTAIRES Google ── */}
              {business?.google_business_url && (
                <section id="section-avis" style={{ marginBottom:40 }}>
                  <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                    margin:'0 0 16px', letterSpacing:'-0.02em' }}>Commentaires</h2>

                  {/* Widget avis Google — style page Google Maps */}
                  <div style={{ background:th.card, border:`1px solid ${th.border}`,
                    borderRadius:14, overflow:'hidden' }}>

                    {/* En-tête : logo Google + titre */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'14px 18px', borderBottom:`1px solid ${th.border}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <svg viewBox="0 0 24 24" width="18" height="18" style={{flexShrink:0}}>
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span style={{ fontSize:13, fontWeight:700, color:th.text }}>
                          Avis Google
                        </span>
                      </div>
                      <a href={business.google_business_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize:12, color:'#2563eb', fontWeight:600, textDecoration:'none',
                          display:'flex', alignItems:'center', gap:4 }}>
                        Voir la fiche
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{width:12,height:12}}>
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </a>
                    </div>

                    {/* Note réelle Google (via Places API) — affichée seulement si dispo */}
                    {googleRating ? (
                      <div style={{ padding:'20px 18px 16px',
                        display:'flex', alignItems:'center', gap:20 }}>
                        <div style={{ textAlign:'center', flexShrink:0 }}>
                          <p style={{ fontSize:40, fontWeight:900, color:th.text,
                            margin:0, lineHeight:1, fontFamily:'monospace' }}>
                            {googleRating.rating.toFixed(1)}
                          </p>
                          <div style={{ display:'flex', gap:1, justifyContent:'center', margin:'4px 0' }}>
                            {[1,2,3,4,5].map(n => {
                              const r = googleRating.rating;
                              const fill = n <= Math.floor(r) ? 1 : (n - 1 < r ? (r - (n-1)) : 0);
                              return (
                                <svg key={n} viewBox="0 0 24 24" style={{ width:14, height:14 }}>
                                  <defs>
                                    <linearGradient id={`gr-${n}`} x1="0" x2="1" y1="0" y2="0">
                                      <stop offset={`${fill * 100}%`} stopColor="#FBBC05"/>
                                      <stop offset={`${fill * 100}%`} stopColor={th.mode==='dark'?'#3f3f46':'#e5e7eb'}/>
                                    </linearGradient>
                                  </defs>
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                                    fill={`url(#gr-${n})`} />
                                </svg>
                              );
                            })}
                          </div>
                          <p style={{ fontSize:11, color:th.muted, margin:0 }}>
                            {googleRating.total > 0
                              ? `${googleRating.total} avis Google`
                              : 'avis Google'}
                          </p>
                        </div>
                        <a href={business.google_business_url} target="_blank" rel="noopener noreferrer"
                          style={{ flex:1, display:'flex', alignItems:'center', gap:10,
                            padding:'14px 16px', borderRadius:12, textDecoration:'none',
                            background:th.cardAlt, border:`1px solid ${th.border}`,
                            color:th.text }}>
                          <span style={{ fontSize:13, fontWeight:700, flex:1 }}>
                            Consulter les avis détaillés sur Google
                          </span>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            style={{width:14,height:14,flexShrink:0}}>
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </a>
                      </div>
                    ) : (
                      <div style={{ padding:'16px 18px',
                        display:'flex', alignItems:'center', gap:10,
                        borderBottom:`1px solid ${th.border}` }}>
                        <svg viewBox="0 0 24 24" fill="#FBBC05" style={{width:16,height:16,flexShrink:0}}>
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                        <p style={{ fontSize:13, color:th.muted, margin:0, lineHeight:1.4 }}>
                          Retrouvez la note et les avis de ce commerce directement sur Google.
                        </p>
                      </div>
                    )}

                    {/* Boutons CTA */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8,
                      padding:'0 18px 18px' }}>
                      <a href={business.google_business_url}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                          padding:'10px', borderRadius:10, textDecoration:'none', fontSize:13,
                          fontWeight:700, color:th.text,
                          background:th.cardAlt, border:`1px solid ${th.border}` }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{width:14,height:14}}>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                        Voir les avis
                      </a>
                      <a href={business.google_business_url}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                          padding:'10px', borderRadius:10, textDecoration:'none', fontSize:13,
                          fontWeight:700, color:th.accentText,
                          background:th.accent, border:'none' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{width:14,height:14}}>
                          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                        </svg>
                        Laisser un avis
                      </a>
                    </div>
                  </div>
                </section>
              )}

              {/* ── SECTION PHOTOS (en bas de la section avis) ── */}
              {business?.cover_urls?.length > 0 && (
                <section id="section-photos" style={{ marginBottom:40 }}>
                  <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                    margin:'0 0 16px', letterSpacing:'-0.02em' }}>Photos</h2>
                  <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:12 }}>
                    {business.cover_urls.map((c, i) => (
                      <div key={c.id||i} style={{ aspectRatio:'4/3',
                        borderRadius:14, overflow:'hidden',
                        background:th.cardAlt, border:`1px solid ${th.border}` }}>
                        <img src={mediaUrl(c.url)} alt={`Photo ${i+1}`}
                          loading="lazy"
                          style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── SECTION HORAIRES (deplacee en bas : prestations + equipe prioritaires) ── */}
              {business?.hours && Object.keys(business.hours).length > 0 && (
                <section id="section-horaires" style={{ marginBottom:32 }}>
                  <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                    margin:'0 0 16px', letterSpacing:'-0.02em' }}>Horaires d'ouverture</h2>
                  <div style={{ background:th.card, border:`1px solid ${th.border}`,
                    borderRadius:12, overflow:'hidden' }}>
                    {(() => {
                      const dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
                      const today = new Date().getDay();
                      const order = Array.from({length:7}, (_,i) => (today + i) % 7);
                      return order.map((dow, i) => {
                        const h = business.hours[dow];
                        const isToday = i === 0;
                        const isLast  = i === 6;
                        return (
                          <div key={dow} style={{ display:'flex', alignItems:'center',
                            justifyContent:'space-between', padding:'12px 18px',
                            borderBottom: isLast ? 'none' : `1px solid ${th.border}`,
                            background: isToday ? th.cardAlt : 'transparent' }}>
                            <span style={{ fontSize:14, fontWeight: isToday ? 700 : 500,
                              color:th.text }}>
                              {dayNames[dow]}{isToday ? " (aujourd'hui)" : ''}
                            </span>
                            <span style={{ fontSize:13,
                              color: h?.is_open ? th.text : th.muted,
                              fontVariantNumeric:'tabular-nums' }}>
                              {h?.is_open && h.open_time && h.close_time
                                ? `${h.open_time} – ${h.close_time}`
                                : 'Fermé'}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </section>
              )}

              {/* ── SECTION ADRESSE (deplacee en bas : prestations + equipe prioritaires) ── */}
              <section id="section-adresse" style={{ marginBottom:40 }}>
                <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                  margin:'0 0 16px', letterSpacing:'-0.02em' }}>Adresse</h2>

                {/* Carte Google Maps embed — si adresse disponible */}
                {(business?.address || business?.city) && (() => {
                  const addrQ = encodeURIComponent(
                    [business.address, business.postal_code, business.city]
                    .filter(Boolean).join(' ')
                  );
                  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${addrQ}`;
                  const embedUrl = `https://maps.google.com/maps?q=${addrQ}&output=embed&hl=fr&z=15`;
                  return (
                    <div style={{ borderRadius:14, overflow:'hidden', marginBottom:16,
                      border:`1px solid ${th.border}` }}>
                      <iframe
                        src={embedUrl}
                        width="100%"
                        height="240"
                        style={{ border:'none', display:'block' }}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        title="Localisation du commerce"
                      />
                      {/* Lien "Ouvrir dans Maps" */}
                      <a href={mapsLink} target="_blank" rel="noopener noreferrer"
                        style={{ display:'flex', alignItems:'center', gap:8,
                          padding:'10px 14px', background:th.card,
                          borderTop:`1px solid ${th.border}`,
                          fontSize:13, fontWeight:600, color:'#2563eb', textDecoration:'none' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{width:13,height:13}}>
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                        {[business.address, business.postal_code, business.city].filter(Boolean).join(' ')}
                      </a>
                    </div>
                  );
                })()}

                {/* Card infos : adresse textuelle + téléphone */}
                <div style={{ background:th.card, border:`1px solid ${th.border}`,
                  borderRadius:12, overflow:'hidden' }}>
                  {(business?.address || business?.city || business?.postal_code) && (
                    <div style={{ display:'flex', alignItems:'flex-start', gap:12,
                      padding:'14px 18px',
                      borderBottom: business?.phone ? `1px solid ${th.border}` : 'none' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{width:16,height:16,flexShrink:0,marginTop:2,color:th.muted}}>
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      <div>
                        {business?.address && (
                          <p style={{ fontSize:14, color:th.text, margin:0, lineHeight:1.6, fontWeight:500 }}>
                            {business.address}
                          </p>
                        )}
                        {(business?.postal_code || business?.city) && (
                          <p style={{ fontSize:14, color:th.text, margin:0, lineHeight:1.6 }}>
                            {[business.postal_code, business.city].filter(Boolean).join(' ')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {business?.phone && (
                    <a href={`tel:${business.phone}`}
                      style={{ display:'flex', alignItems:'center', gap:12,
                        padding:'14px 18px', fontSize:14, color:th.text,
                        textDecoration:'none' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{width:16,height:16,flexShrink:0,color:th.muted}}>
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                      </svg>
                      <span style={{ fontWeight:500 }}>{business.phone}</span>
                    </a>
                  )}
                </div>
              </section>

              {/* ── FOOTER ── */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24,
                paddingTop:24, borderTop:`1px solid ${th.border}` }}>
                <div>
                  <p style={{ fontSize:14, fontWeight:700, color:th.text, margin:'0 0 10px' }}>
                    Nous contacter
                  </p>
                  {business?.phone && (
                    <a href={`tel:${business.phone}`}
                      style={{ display:'flex', alignItems:'center', gap:7, fontSize:13,
                        color:'#2563eb', textDecoration:'none', marginBottom:6 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{width:14,height:14}}>
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                      </svg>
                      {business.phone}
                    </a>
                  )}
                </div>
                <div>
                  <p style={{ fontSize:14, fontWeight:700, color:th.text, margin:'0 0 10px' }}>
                    Bon à savoir
                  </p>
                  <a href={`/book/${slug}/politique`} target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:7, fontSize:13,
                      color:'#2563eb', textDecoration:'none' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{width:14,height:14}}>
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    Politique de réservation
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ══ ÉTAPES 2–6 : Flow réservation ══ */}
          {!showAuthPanel && step >= 2 && (
            <div className="bk-steps" style={{ maxWidth:600, width:'100%', animation:'fadeIn .15s ease' }}>

              {/* Bouton retour */}
              <button
                onClick={()=> step===2?goToStep(1):step===3?goToStep(2):step===4?goToStep(3):step===5?goToStep(4):goToStep(5)}
                style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600,
                  color:th.muted, background:'none', border:'none', cursor:'pointer',
                  padding:'0 0 20px', marginBottom:4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  style={{width:16,height:16}}><polyline points="15 18 9 12 15 6"/></svg>
                {step===2 ? (selEmp&&!selSvc ? selEmp.name : 'Nos prestations')
                  : step===3 ? (selSvc?.name || selEmp?.name)
                  : step===4 ? (selEmp?._anyEmployee ? 'Premier disponible' : selEmp?.name)
                  : step===5 ? selDate?.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})
                  : 'Informations'}
              </button>

              {/* Barre de progression */}
              <div style={{ display:'flex', gap:4, marginBottom:28 }}>
                {[1,2,3,4,5,6].map(i=>(
                  <div key={i} style={{ flex:i===step?2:1, height:3, borderRadius:99,
                    background: i<=step ? th.accent : th.border,
                    opacity: i<=step ? 1 : 0.3, transition:'all .3s' }}/>
                ))}
              </div>

              {/* ── ÉTAPE 2 : Si employé pré-sélectionné → Prestations ; sinon → Employé ── */}
              {step === 2 && (
                <div>
                  {selEmp && !selSvc ? (
                    /* ─── Parcours par EMPLOYÉ : afficher les prestations disponibles ─── */
                    <div>
                      {/* Badge employé pré-sélectionné */}
                      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
                        background:th.card, border:`1px solid ${th.border}`,
                        borderRadius:12, marginBottom:20 }}>
                        <div style={{ width:40, height:40, borderRadius:99, flexShrink:0,
                          background:th.cardAlt, display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:16, fontWeight:800, color:selEmp.avatar_color||'#374151' }}>
                          {selEmp.name.charAt(0)}
                        </div>
                        <div style={{ flex:1 }}>
                          <p style={{ fontSize:13, fontWeight:700, color:th.text, margin:'0 0 1px' }}>
                            {selEmp.name}
                          </p>
                          {selEmp.role && (
                            <p style={{ fontSize:11, color:th.muted, margin:0 }}>{selEmp.role}</p>
                          )}
                        </div>
                        <button onClick={()=>{ setSelEmp(null); }}
                          style={{ fontSize:12, color:th.muted,
                            cursor:'pointer', padding:'4px 8px', borderRadius:7,
                            background:th.cardAlt, border:`1px solid ${th.border}` }}>
                          Changer
                        </button>
                      </div>

                      <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                        margin:'0 0 16px', letterSpacing:'-0.02em' }}>Choisir une prestation</h2>

                      {/* Liste des services style accordéon */}
                      <div style={{ border:`1px solid ${th.border}`, borderRadius:12,
                        overflow:'hidden', background:th.card }}>
                        {[
                          ...svcGroups.map(g => ({ label:g.label, svcs:g.svcs })),
                          ...(svcNoCat.length>0 ? [{ label:null, svcs:svcNoCat }] : []),
                        ].map(({ label, svcs: gs }, gi, arr) => (
                          <AccordionGroup key={label||'__nc__'}
                            label={label} svcs={gs} th={th}
                            isLast={gi===arr.length-1}
                            onSelect={s=>{
                              setSelSvc(s);
                              setSelDate(null); setSelSlot(null); setMonthKey('');
                              goToStep(3, s, selEmp);
                            }}/>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* ─── Parcours par SERVICE : choisir l'employé ─── */
                    <div>
                      <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                        margin:'0 0 6px', letterSpacing:'-0.02em' }}>
                        Choisir un membre de l&apos;équipe
                      </h2>
                      <p style={{ fontSize:13, color:th.muted, margin:'0 0 20px' }}>
                        Pour : <strong style={{color:th.text}}>{selSvc?.name}</strong>
                      </p>
                      <button
                        onClick={()=>{ const emp={id:null,name:'Premier disponible',_anyEmployee:true,avatar_color:'#6366f1'}; setSelEmp(emp); setSelDate(null); setSelSlot(null); setMonthKey(''); goToStep(3, null, emp); }}
                        style={{ width:'100%', display:'flex', alignItems:'center', gap:16, padding:'18px 20px',
                          background:th.card, border:`1px solid ${th.border}`, borderRadius:16,
                          cursor:'pointer', marginBottom:12, textAlign:'left',
                          transition:'box-shadow 0.15s, transform 0.1s' }}
                        onMouseEnter={ev=>{ev.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.1)';ev.currentTarget.style.transform='translateY(-1px)';}}
                        onMouseLeave={ev=>{ev.currentTarget.style.boxShadow='none';ev.currentTarget.style.transform='none';}}>
                        <div style={{ width:56, height:56, borderRadius:99, flexShrink:0,
                          background:th.cardAlt, display:'flex', alignItems:'center',
                          justifyContent:'center', fontSize:24 }}>✨</div>
                        <div style={{flex:1}}>
                          <p style={{fontSize:14,fontWeight:700,color:th.text,margin:'0 0 2px'}}>Peu importe</p>
                          <p style={{fontSize:12,color:th.muted,margin:0}}>Premier membre disponible</p>
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{width:18,height:18,color:th.dim}}><polyline points="9 18 15 12 9 6"/></svg>
                      </button>
                      {employees.map(e=>(
                        <button key={e.id}
                          onClick={()=>{ setSelEmp(e); setSelDate(null); setSelSlot(null); setMonthKey(''); goToStep(3, null, e); }}
                          style={{ width:'100%', display:'flex', alignItems:'center', gap:16, padding:'18px 20px',
                            background:th.card, border:`1px solid ${th.border}`, borderRadius:16,
                            cursor:'pointer', marginBottom:12, textAlign:'left',
                            transition:'box-shadow 0.15s, transform 0.1s' }}
                          onMouseEnter={ev=>{ev.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.1)';ev.currentTarget.style.transform='translateY(-1px)';}}
                          onMouseLeave={ev=>{ev.currentTarget.style.boxShadow='none';ev.currentTarget.style.transform='none';}}>
                          <div style={{ width:56, height:56, borderRadius:99, flexShrink:0, overflow:'hidden',
                            background: e.has_image ? th.cardAlt : (e.avatar_color ? `${e.avatar_color}20` : th.cardAlt),
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:20, fontWeight:800, color:e.avatar_color||'#374151',
                            border:`2px solid ${e.avatar_color||th.border}30` }}>
                            {e.has_image ? (
                              <img src={employeeImgUrl(e.id, e.image_version)} alt={e.name}
                                style={{ width:'100%', height:'100%', objectFit:'cover' }}
                                onError={ev => { ev.currentTarget.style.display = 'none'; }} />
                            ) : (
                              e.name.charAt(0)
                            )}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <p style={{fontSize:14,fontWeight:700,color:th.text,margin:'0 0 2px',
                              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.name}</p>
                            {e.role && <p style={{fontSize:12,color:th.muted,margin:0}}>{e.role}</p>}
                          </div>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            style={{width:18,height:18,color:th.dim}}><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── ÉTAPE 3 : Date ── */}
              {step === 3 && (
                <div>
                  <h2 style={{ fontSize:20, fontWeight:800, color:th.text,
                    margin:'0 0 6px', letterSpacing:'-0.02em' }}>Choisir une date</h2>
                  <p style={{ fontSize:13, color:th.muted, margin:'0 0 20px' }}>
                    avec <strong style={{color:th.text}}>
                      {selEmp?._anyEmployee ? 'Premier disponible' : selEmp?.name}
                    </strong>
                  </p>
                  <div style={{ background:th.card, border:`1px solid ${th.border}`,
                    borderRadius:20, padding:'24px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                      <button onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}
                        style={{ width:36,height:36,borderRadius:8,border:`1px solid ${th.border}`,
                          background:th.cardAlt,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          style={{width:14,height:14,color:th.muted}}><polyline points="15 18 9 12 15 6"/></svg>
                      </button>
                      <p style={{fontSize:15,fontWeight:700,color:th.text}}>
                        {MONTHS_FR[calMonth.getMonth()]} {calMonth.getFullYear()}
                      </p>
                      <button onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}
                        style={{ width:36,height:36,borderRadius:8,border:`1px solid ${th.border}`,
                          background:th.cardAlt,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          style={{width:14,height:14,color:th.muted}}><polyline points="9 18 15 12 9 6"/></svg>
                      </button>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6,marginBottom:10}}>
                      {DAYS_MINI.map((d,i)=>(
                        <div key={i} style={{textAlign:'center',fontSize:13,fontWeight:800,color:th.muted,padding:'8px 0'}}>{d}</div>
                      ))}
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6}}>
                      {calDays.map((d,i)=>{
                        if(!d) return <div key={i}/>;
                        const isPast=d<today, isFuture=d>maxDate;
                        const dateKey=d.toLocaleDateString('sv-SE');
                        const ds=monthStatus[dateKey];
                        const isClosed=ds==='closed'||(ds===undefined&&closedDays.includes(d.getDay()));
                        const isFull=ds==='full';
                        const isSel=selDate&&d.toDateString()===selDate.toDateString();
                        const isToday2=d.toDateString()===today.toDateString();
                        const disabled=isPast||isFuture||isClosed||isFull;
                        return(
                          <button key={i} onClick={()=>{if(!disabled){setSelDate(d);goToStep(4,null,null,d);}}} disabled={disabled}
                            style={{ height:48, borderRadius:12, fontSize:15, fontWeight:700,
                              border:isSel?`2px solid ${th.accent}`:isToday2?`1px solid ${th.accent}40`:'1px solid transparent',
                              background:isSel?th.accent:'transparent',
                              color:isSel?th.accentText:(isClosed||isFull?th.dim:disabled?th.dim:th.text),
                              opacity:disabled&&!isClosed&&!isFull?0.3:1,
                              cursor:disabled?'default':'pointer', position:'relative' }}>
                            {d.getDate()}
                            {isClosed&&!isPast&&<span style={{position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',width:3,height:3,borderRadius:99,background:'#ef4444',display:'block'}}/>}
                            {isFull&&!isPast&&<span style={{position:'absolute',bottom:2,left:'50%',transform:'translateX(-50%)',width:3,height:3,borderRadius:99,background:'#f97316',display:'block'}}/>}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{display:'flex',gap:16,marginTop:12}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:th.muted}}>
                        <div style={{width:8,height:8,borderRadius:99,background:'#ef4444'}}/>Fermé
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:th.muted}}>
                        <div style={{width:8,height:8,borderRadius:99,background:'#f97316'}}/>Complet
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ÉTAPE 4 : Créneau ── */}
              {step === 4 && (
                <div>
                  <h2 style={{fontSize:20,fontWeight:800,color:th.text,margin:'0 0 6px',letterSpacing:'-0.02em'}}>
                    Choisir un créneau
                  </h2>
                  <p style={{fontSize:13,color:th.muted,margin:'0 0 20px'}}>
                    {selDate?.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})} · {selSvc?.duration_minutes} min
                  </p>
                  {slotsLoading ? <div style={{padding:'40px 0',textAlign:'center'}}><Spinner color={th.accent}/></div>
                  : visibleSlots.length === 0 ? (
                    <div style={{textAlign:'center',padding:'40px 20px',border:`1px dashed ${th.border}`,borderRadius:12}}>
                      <p style={{fontSize:14,color:th.muted,marginBottom:12}}>Aucun créneau disponible</p>
                      <button onClick={()=>goToStep(3)}
                        style={{fontSize:13,fontWeight:700,color:'#2563eb',background:'none',border:'none',cursor:'pointer'}}>
                        ← Changer de date
                      </button>
                    </div>
                  ) : (
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                      {visibleSlots.map(s=>(
                        <button key={s} onClick={()=>{setSelSlot(s);goToStep(5,null,null,null,s);}}
                          style={{ padding:'18px 8px', borderRadius:16, fontSize:16, fontWeight:800,
                            border:selSlot===s?`2px solid ${th.accent}`:`1px solid ${th.border}`,
                            background:selSlot===s?th.accent:th.card,
                            color:selSlot===s?th.accentText:th.text, cursor:'pointer' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── ÉTAPE 5 : Infos client (auth-first) ── */}
              {step === 5 && (
                <div>
                  <h2 style={{fontSize:20,fontWeight:800,color:th.text,margin:'0 0 20px',letterSpacing:'-0.02em'}}>
                    Vos informations
                  </h2>
                  {/* Récap */}
                  <div style={{background:th.cardAlt,borderRadius:12,border:`1px solid ${th.border}`,
                    padding:'14px 16px',marginBottom:24}}>
                    <p style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.06em',
                      color:th.dim,margin:'0 0 8px'}}>Récapitulatif</p>
                    {[['Service',selSvc?.name],
                      ['Avec',selEmp?._anyEmployee?'Premier disponible':selEmp?.name],
                      ['Le',selDate?.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})],
                      ['À',selSlot],
                      selSvc?.price&&Number(selSvc.price)>0?['Prix',`${Number(selSvc.price).toFixed(2)} €`]:null
                    ].filter(Boolean).map(([l,v])=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',
                        padding:'5px 0',borderTop:`1px solid ${th.border}`}}>
                        <span style={{fontSize:12,color:th.muted}}>{l}</span>
                        <span style={{fontSize:12,fontWeight:700,color:th.text}}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {clientUser ? (
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:12,
                        background:th.card,border:`1px solid ${th.border}`,
                        borderRadius:12,padding:'14px 16px',marginBottom:16}}>
                        <div style={{width:44,height:44,borderRadius:99,flexShrink:0,
                          background:th.accent,display:'flex',alignItems:'center',
                          justifyContent:'center',color:th.accentText,fontWeight:800,fontSize:17}}>
                          {(clientUser.first_name||'?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{flex:1}}>
                          <p style={{fontWeight:700,fontSize:14,color:th.text,margin:'0 0 2px'}}>
                            {clientUser.first_name} {clientUser.last_name}
                          </p>
                          <p style={{fontSize:12,color:th.muted,margin:0}}>{clientUser.email}</p>
                        </div>
                        <button onClick={()=>{navigate(`/book/${slug}/client/profil`,{replace:false}); setMyApptsInitTab('profile');setView('myAppts');}}
                          style={{padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:600,
                            color:th.text,background:th.cardAlt,border:`1px solid ${th.border}`,cursor:'pointer'}}>
                          Profil
                        </button>
                      </div>
                      {/* Champ téléphone obligatoire si manquant (ex: après Google OAuth) */}
                      {!clientPhone.trim() && (
                        <div style={{background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.25)',
                          borderRadius:10,padding:'12px 14px',marginBottom:14}}>
                          <p style={{fontSize:12,fontWeight:700,color:'#d97706',margin:'0 0 8px'}}>
                            Complétez votre profil pour continuer
                          </p>
                          <label style={{display:'block',fontSize:11,fontWeight:700,
                            color:th.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                            Téléphone *
                          </label>
                          <div style={{display:'flex',gap:6,position:'relative'}}>
                            <div style={{position:'relative'}}>
                              <button type="button" onClick={()=>setPhoneDrop(!phoneDrop)}
                                style={{display:'flex',alignItems:'center',gap:4,padding:'11px 10px',
                                  borderRadius:9,background:th.inputBg,border:`1px solid ${th.inputBorder}`,
                                  color:th.text,fontSize:13,cursor:'pointer',whiteSpace:'nowrap',height:'100%'}}>
                                <span style={{fontSize:16}}>{phoneCC.flag}</span>
                                <span style={{fontSize:12,fontWeight:600}}>{phoneCC.dial}</span>
                                <span style={{fontSize:9,opacity:0.5}}>▼</span>
                              </button>
                              {phoneDrop && (
                                <div style={{position:'absolute',top:'100%',left:0,zIndex:999,marginTop:4,
                                  background:th.card,border:`1px solid ${th.border}`,borderRadius:10,
                                  boxShadow:'0 8px 24px rgba(0,0,0,0.15)',maxHeight:200,overflowY:'auto',minWidth:200}}>
                                  {PHONE_COUNTRIES.map(c=>(
                                    <button key={c.code} type="button" onClick={()=>{setPhoneCC(c);setPhoneDrop(false);setPhoneErr('');}}
                                      style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 12px',
                                        background:phoneCC.code===c.code?'rgba(99,102,241,0.08)':'transparent',
                                        border:'none',cursor:'pointer',color:th.text,fontSize:13,textAlign:'left'}}>
                                      <span style={{fontSize:16}}>{c.flag}</span>
                                      <span style={{fontWeight:600}}>{c.dial}</span>
                                      <span style={{color:th.muted,fontSize:12}}>{c.label}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <input type="tel" placeholder="6 03 04 46 17" value={phoneLocal}
                              onChange={e=>{setPhoneLocal(e.target.value);setPhoneErr('');}}
                              style={{flex:1,padding:'11px 12px',borderRadius:9,outline:'none',
                                background:th.inputBg,border:`1px solid ${phoneErr?'#ef4444':th.inputBorder}`,
                                color:th.text,fontSize:13,boxSizing:'border-box'}}/>
                          </div>
                          {phoneErr && <p style={{fontSize:11,color:'#ef4444',marginTop:4,fontWeight:600}}>{phoneErr}</p>}
                        </div>
                      )}
                      <label style={{display:'block',fontSize:12,fontWeight:600,color:th.muted,marginBottom:6}}>
                        Note (optionnelle)
                      </label>
                      <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}
                        placeholder="Demandes particulières…"
                        style={{width:'100%',padding:'12px 14px',borderRadius:10,outline:'none',
                          background:th.inputBg,border:`1px solid ${th.inputBorder}`,
                          color:th.text,fontSize:13,resize:'none',lineHeight:1.5}}/>
                      <button onClick={async ()=>{
                        // Valider et formater le téléphone si pas encore fait
                        if(!clientPhone.trim()){
                          const err=validatePhone(phoneCC,phoneLocal);
                          if(err){setPhoneErr(err);return;}
                          const formatted=formatPhone(phoneCC,phoneLocal);
                          setCP(formatted);
                          // Sauvegarder dans le profil backend
                          if(clientUser && !clientUser.phone){
                            try{
                              const tk=localStorage.getItem('ff_client_token');
                              if(tk) await pubApi.updateClientProfile(slug,{
                                first_name:clientUser.first_name,last_name:clientUser.last_name,
                                email:clientUser.email,phone:formatted
                              });
                              const updated={...clientUser,phone:formatted};
                              setClientUser(updated);
                              localStorage.setItem('ff_client_info',JSON.stringify(updated));
                            }catch{}
                          }
                        }
                        goToStep(6);
                      }}
                        disabled={!clientPhone.trim()&&!phoneLocal.replace(/\D/g,'')}
                        style={{width:'100%',marginTop:16,padding:'15px',borderRadius:12,
                          background:(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,''))?th.border:th.accent,
                          border:'none',fontWeight:800,fontSize:15,
                          color:(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,''))?th.muted:th.accentText,
                          cursor:(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,''))?'not-allowed':'pointer',
                          opacity:(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,''))?0.5:1}}>
                        {(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,'')) ? 'Téléphone requis' : 'Continuer →'}
                      </button>
                    </div>
                  ) : (
                    <div>
                      {/* ──────────────────────────────────────────────────────────
                          LOGIQUE AUTH :
                          • requireAccount=true → AuthPanel inline obligatoire
                          • requireAccount=false + inlineAuthMode='none' → choix + form sans compte
                          • requireAccount=false + inlineAuthMode='login'/'register' → AuthPanel inline
                          ────────────────────────────────────────────────────────── */}

                      {(requireAccount || inlineAuthMode !== 'none') ? (
                        /* ── AuthPanel INLINE — login ou register directement ── */
                        /* requireAccount=true → TOUJOURS ici, pas de formulaire sans compte */
                        <div>
                          <AuthPanel
                            slug={slug} th={th}
                            requireAccount={requireAccount}
                            initialMode={inlineAuthMode === 'none' ? 'login' : inlineAuthMode}
                            initialEmail={clientEmail||''}
                            onAuth={handleAuth}
                            onClose={requireAccount ? null : ()=>setInlineAuthMode('none')}
                          />
                        </div>
                      ) : (
                        /* ── Formulaire principal : suggestion auth + form sans compte ── */
                        <div>
                          {/* ── Bloc suggestion auth ── */}
                          <div style={{background:th.card,border:`1px solid ${th.border}`,
                            borderRadius:12,padding:16,marginBottom:16}}>
                            <p style={{fontSize:13,fontWeight:700,color:th.text,margin:'0 0 3px'}}>
                              Déjà un compte ? Connectez-vous
                            </p>
                            <p style={{fontSize:11,color:th.muted,margin:'0 0 12px',lineHeight:1.5}}>
                              Vos coordonnées sont renseignées automatiquement.
                            </p>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                              <button onClick={()=>setInlineAuthMode('login')}
                                style={{padding:'11px',borderRadius:10,background:th.accent,
                                  border:'none',fontWeight:700,fontSize:13,color:th.accentText,cursor:'pointer'}}>
                                Se connecter
                              </button>
                              <button onClick={()=>setInlineAuthMode('register')}
                                style={{padding:'11px',borderRadius:10,background:th.card,
                                  border:`1px solid ${th.border}`,fontWeight:700,fontSize:13,
                                  color:th.text,cursor:'pointer'}}>
                                Créer un compte
                              </button>
                            </div>
                            {/* Bouton Google */}
                            <button onClick={()=>{ const url=pubApi.googleAuthUrl(slug); const popup=window.open(url,'google_auth','width=500,height=600,scrollbars=yes,top=100,left='+Math.round((window.screen.width-500)/2)); const h=(e)=>{ if(e.data?.type!=='GOOGLE_AUTH_SUCCESS')return; window.removeEventListener('message',h); if(popup&&!popup.closed)popup.close(); const{token,client}=e.data; if(!token||!client)return; localStorage.setItem('ff_client_token',token); localStorage.setItem('ff_client_info',JSON.stringify(client)); handleAuth(client); }; window.addEventListener('message',h); }}
                              style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                                padding:'11px',borderRadius:10,background:th.card,
                                border:`1px solid ${th.border}`,cursor:'pointer',
                                fontWeight:700,fontSize:13,color:th.text}}>
                              <svg width="16" height="16" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                              </svg>
                              Continuer avec Google
                            </button>
                          </div>

                          {/* Séparateur */}
                          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                            <div style={{flex:1,height:1,background:th.border}}/>
                            <span style={{fontSize:11,color:th.dim,whiteSpace:'nowrap',padding:'0 6px'}}>
                              ou continuer sans compte
                            </span>
                            <div style={{flex:1,height:1,background:th.border}}/>
                          </div>

                          {/* Formulaire sans compte — Prénom, Nom, Email, Téléphone, Note */}
                          <div style={{display:'flex',flexDirection:'column',gap:12}}>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                              <div>
                                <label style={{display:'block',fontSize:11,fontWeight:700,
                                  color:th.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                                  Prénom *
                                </label>
                                <input placeholder="Prénom"
                                  value={clientName.split(' ')[0]||''}
                                  onChange={e=>{const nom=clientName.split(' ').slice(1).join(' ');setCN(e.target.value.trim()+(nom?' '+nom:''));}}
                                  style={{width:'100%',padding:'11px 12px',borderRadius:9,outline:'none',
                                    background:th.inputBg,border:`1px solid ${th.inputBorder}`,
                                    color:th.text,fontSize:13,boxSizing:'border-box'}}/>
                              </div>
                              <div>
                                <label style={{display:'block',fontSize:11,fontWeight:700,
                                  color:th.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                                  Nom *
                                </label>
                                <input placeholder="Nom"
                                  value={clientName.split(' ').slice(1).join(' ')||''}
                                  onChange={e=>{const prenom=clientName.split(' ')[0]||'';setCN(prenom+(e.target.value.trim()?' '+e.target.value.trim():''));}}
                                  style={{width:'100%',padding:'11px 12px',borderRadius:9,outline:'none',
                                    background:th.inputBg,border:`1px solid ${th.inputBorder}`,
                                    color:th.text,fontSize:13,boxSizing:'border-box'}}/>
                              </div>
                            </div>

                            <div>
                              <label style={{display:'block',fontSize:11,fontWeight:700,
                                color:th.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                                Email *
                              </label>
                              <div style={{position:'relative'}}>
                                <input type="email" placeholder="votre@email.com" value={clientEmail}
                                  onChange={e=>{const val=e.target.value;setCE(val);setEmailStatus('idle');
                                    clearTimeout(emailCheckTimer.current);
                                    if(!val.trim()||!val.includes('@')||!val.includes('.'))return;
                                    setEmailStatus('checking');
                                    emailCheckTimer.current=setTimeout(async()=>{
                                      try{const res=await pubApi.checkEmail(slug,val.trim());
                                        setEmailStatus(res.exists?'exists':'free');}
                                      catch{setEmailStatus('idle');}
                                    },500);
                                  }}
                                  style={{width:'100%',padding:'11px 36px 11px 12px',borderRadius:9,outline:'none',
                                    background:th.inputBg,
                                    border:`1px solid ${emailStatus==='exists'?'#ef4444':emailStatus==='free'?'#22c55e':th.inputBorder}`,
                                    color:th.text,fontSize:13}}/>
                                {emailStatus==='checking'&&<div style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',width:13,height:13,borderRadius:'50%',border:'2px solid rgba(0,0,0,0.1)',borderTopColor:th.accent,animation:'spin .7s linear infinite'}}/>}
                                {emailStatus==='free'&&<span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'#22c55e',fontWeight:700}}>✓</span>}
                                {emailStatus==='exists'&&<span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'#ef4444',fontWeight:700}}>✕</span>}
                              </div>
                              {emailStatus==='exists'&&(
                                <div style={{marginTop:6,borderRadius:9,border:'1px solid rgba(239,68,68,0.2)',
                                  background:'rgba(239,68,68,0.04)',overflow:'hidden'}}>
                                  <p style={{fontSize:12,fontWeight:700,color:'#dc2626',padding:'8px 12px 4px',margin:0}}>
                                    Un compte existe — connectez-vous
                                  </p>
                                  <button onClick={()=>{setInlineAuthMode('login');}}
                                    style={{width:'100%',padding:'9px 12px',background:'#ef4444',border:'none',
                                      color:'white',fontWeight:700,fontSize:12,cursor:'pointer'}}>
                                    Se connecter →
                                  </button>
                                </div>
                              )}
                            </div>

                            <div>
                              <label style={{display:'block',fontSize:11,fontWeight:700,
                                color:th.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                                Téléphone *
                              </label>
                              <div style={{display:'flex',gap:6,position:'relative'}}>
                                <div style={{position:'relative'}}>
                                  <button type="button" onClick={()=>setPhoneDrop(!phoneDrop)}
                                    style={{display:'flex',alignItems:'center',gap:4,padding:'11px 10px',
                                      borderRadius:9,background:th.inputBg,border:`1px solid ${th.inputBorder}`,
                                      color:th.text,fontSize:13,cursor:'pointer',whiteSpace:'nowrap',height:'100%'}}>
                                    <span style={{fontSize:16}}>{phoneCC.flag}</span>
                                    <span style={{fontSize:12,fontWeight:600}}>{phoneCC.dial}</span>
                                    <span style={{fontSize:9,opacity:0.5}}>▼</span>
                                  </button>
                                  {phoneDrop && (
                                    <div style={{position:'absolute',top:'100%',left:0,zIndex:999,marginTop:4,
                                      background:th.card,border:`1px solid ${th.border}`,borderRadius:10,
                                      boxShadow:'0 8px 24px rgba(0,0,0,0.15)',maxHeight:200,overflowY:'auto',minWidth:200}}>
                                      {PHONE_COUNTRIES.map(c=>(
                                        <button key={c.code} type="button" onClick={()=>{setPhoneCC(c);setPhoneDrop(false);setPhoneErr('');}}
                                          style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 12px',
                                            background:phoneCC.code===c.code?'rgba(99,102,241,0.08)':'transparent',
                                            border:'none',cursor:'pointer',color:th.text,fontSize:13,textAlign:'left'}}>
                                          <span style={{fontSize:16}}>{c.flag}</span>
                                          <span style={{fontWeight:600}}>{c.dial}</span>
                                          <span style={{color:th.muted,fontSize:12}}>{c.label}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <input type="tel" placeholder="6 03 04 46 17" value={phoneLocal}
                                  onChange={e=>{setPhoneLocal(e.target.value);setPhoneErr('');}}
                                  style={{flex:1,padding:'11px 12px',borderRadius:9,outline:'none',
                                    background:th.inputBg,border:`1px solid ${phoneErr?'#ef4444':th.inputBorder}`,
                                    color:th.text,fontSize:13}}/>
                              </div>
                              {phoneErr && <p style={{fontSize:11,color:'#ef4444',marginTop:4,fontWeight:600}}>{phoneErr}</p>}
                            </div>

                            <div>
                              <label style={{display:'block',fontSize:11,fontWeight:700,
                                color:th.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                                Note <span style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>(optionnelle)</span>
                              </label>
                              <textarea placeholder="Demandes particulières…" value={notes}
                                onChange={e=>setNotes(e.target.value)} rows={2}
                                style={{width:'100%',padding:'11px 12px',borderRadius:9,outline:'none',
                                  background:th.inputBg,border:`1px solid ${th.inputBorder}`,
                                  color:th.text,fontSize:13,resize:'none',lineHeight:1.5}}/>
                            </div>
                          </div>

                          <button
                            onClick={()=>{
                              const err=validatePhone(phoneCC,phoneLocal);
                              if(err){setPhoneErr(err);return;}
                              setCP(formatPhone(phoneCC,phoneLocal));
                              goToStep(6);
                            }}
                            disabled={!clientName.trim()||emailStatus==='exists'||!clientEmail.trim()||!phoneLocal.replace(/\D/g,'')}
                            style={{width:'100%',marginTop:16,padding:'14px',borderRadius:12,
                              background:(!clientName.trim()||emailStatus==='exists'||!clientEmail.trim()||!phoneLocal.replace(/\D/g,''))?th.border:th.accent,
                              border:'none',fontWeight:800,fontSize:14,
                              color:(!clientName.trim()||emailStatus==='exists'||!clientEmail.trim()||!phoneLocal.replace(/\D/g,''))?th.muted:th.accentText,
                              cursor:(!clientName.trim()||emailStatus==='exists'||!clientEmail.trim()||!phoneLocal.replace(/\D/g,''))?'not-allowed':'pointer',
                              opacity:(!clientName.trim()||emailStatus==='exists'||!clientEmail.trim()||!phoneLocal.replace(/\D/g,''))?0.5:1}}>
                            {emailStatus==='exists' ? "Connectez-vous d'abord" : 'Continuer →'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {bookErr && <p style={{fontSize:12,color:'#ef4444',marginTop:10,fontWeight:600}}>{bookErr}</p>}
                </div>
              )}

              {/* ── ÉTAPE 6 : Confirmation ── */}
              {step === 6 && (
                <div>
                  <h2 style={{fontSize:20,fontWeight:800,color:th.text,margin:'0 0 20px',letterSpacing:'-0.02em'}}>
                    Confirmer
                  </h2>
                  <div style={{background:th.card,border:`1px solid ${th.border}`,
                    borderRadius:12,padding:'16px 20px',marginBottom:20}}>
                    {[['Service',selSvc?.name],
                      ['Avec',selEmp?._anyEmployee?'Premier disponible':selEmp?.name],
                      ['Date',selDate?.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})],
                      ['Heure',selSlot],
                      ['Duree',`${selSvc?.duration_minutes} min`],
                      selSvc?.price&&selSvc.price!==''?['Prix',`${Number(selSvc.price).toFixed(2)} €`]:null,
                      ['Client',clientUser?`${clientUser.first_name} ${clientUser.last_name}`:clientName],
                      (clientUser?.email||clientEmail)?['Email',clientUser?.email||clientEmail]:null,
                      clientPhone?['Tel.',clientPhone]:null,
                    ].filter(Boolean).map(([l,v])=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',
                        padding:'8px 0',borderBottom:`1px solid ${th.border}`}}>
                        <span style={{fontSize:13,color:th.muted}}>{l}</span>
                        <span style={{fontSize:13,fontWeight:700,color:th.text}}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {selSvc?.price > 0 && (
                    <div style={{marginBottom:20}}>
                      <label style={{fontSize:12,fontWeight:600,color:th.muted,display:'block',marginBottom:8}}>
                        Code promo (optionnel)
                      </label>
                      <div style={{display:'flex',gap:8}}>
                        <input value={promoCode}
                          onChange={e=>{setPromoCode(e.target.value.toUpperCase());setPromoData(null);setPromoErr('');}}
                          onKeyDown={e=>e.key==='Enter'&&checkPromo()}
                          placeholder="PROMO10 ou FIDEL-ABC"
                          style={{flex:1,padding:'11px 14px',borderRadius:9,outline:'none',
                            background:th.inputBg,border:`1px solid ${promoData?'#22c55e':promoErr?'#ef4444':th.inputBorder}`,
                            color:th.text,fontSize:13,fontFamily:'monospace',
                            letterSpacing:'0.05em',textTransform:'uppercase'}}/>
                        <button onClick={checkPromo} disabled={promoLoading||!promoCode.trim()}
                          style={{padding:'11px 18px',borderRadius:9,border:`1px solid ${th.border}`,
                            background:th.cardAlt,color:th.text,fontSize:13,fontWeight:700,
                            cursor:'pointer',opacity:!promoCode.trim()?0.4:1}}>
                          {promoLoading?'...':'Valider'}
                        </button>
                      </div>
                      {promoData && (
                        <div style={{marginTop:8,display:'flex',justifyContent:'space-between',
                          padding:'10px 14px',borderRadius:9,
                          background:'rgba(34,197,94,0.07)',border:'1px solid rgba(34,197,94,0.2)'}}>
                          <span style={{fontSize:12,fontWeight:700,color:'#16a34a'}}>
                            {promoData.type==='percent'?`-${promoData.value}%`:`-${promoData.discount.toFixed(2)} €`} appliqué !
                          </span>
                          <span style={{fontSize:13,fontWeight:900,color:'#166534',fontFamily:'monospace'}}>
                            {((selSvc?.price||0)-promoData.discount).toFixed(2)} €
                          </span>
                        </div>
                      )}
                      {promoErr && <p style={{fontSize:12,color:'#ef4444',marginTop:6,fontWeight:600}}>{promoErr}</p>}
                    </div>
                  )}

                  {bookErr && <p style={{fontSize:12,color:'#ef4444',marginBottom:12,fontWeight:600}}>{bookErr}</p>}

                  <button onClick={handleBook} disabled={booking}
                    style={{width:'100%',padding:'16px',borderRadius:12,
                      background:th.accent,border:'none',fontWeight:800,fontSize:15,
                      color:th.accentText,cursor:booking?'wait':'pointer',
                      opacity:booking?0.7:1,letterSpacing:'-0.01em',
                      display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
                    {booking ? (
                      <>
                        <div style={{width:18,height:18,borderRadius:99,
                          border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',
                          animation:'spin .7s linear infinite'}}/>
                        Réservation en cours…
                      </>
                    ) : (
                      promoData
                        ? `Reserver - ${((selSvc?.price||0)-promoData.discount).toFixed(2)} €`
                        : selSvc?.price&&Number(selSvc.price)>0
                          ? `Reserver - ${Number(selSvc.price).toFixed(2)} €`
                          : 'Reserver'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── SIDEBAR DROITE (desktop) ── */}
        <SideCard th={th} slug={slug} business={business}
          onReserve={()=>{ if(step>1) goToStep(1);
            else { const el=document.getElementById('section-prestations');
              if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); }}} />
      </div>

      {/* ── Bouton Réserver fixe mobile ── */}
      {step === 1 && (
        <div className="bk-mo" style={{
          position:'fixed', bottom:0, left:0, right:0, zIndex:40,
          padding:'12px 16px', background:th.navBg,
          borderTop:`1px solid ${th.border}`,
          boxShadow:'0 -2px 12px rgba(0,0,0,0.08)',
        }}>
          <button
            onClick={()=>{ const el=document.getElementById('section-prestations');
              if(el) el.scrollIntoView({behavior:'smooth'}); }}
            style={{ width:'100%', padding:'15px', borderRadius:12,
              background:th.accent, border:'none', fontWeight:800, fontSize:15,
              color:th.accentText, cursor:'pointer' }}>
            Réserver
          </button>
        </div>
      )}
    </div>
  );
}


// ── Page Parrainer un ami (3 états) ─────────────────────────────────────────
function ReferralPage({ th, slug, business, refProgram, gcConnected, refMyCode, refMyHistory, refMyRewards, onLogin, onBack }) {
  const [copied, setCopied] = useState(false);
  const hasProgram = refProgram && refProgram !== 'none';
  const isActive   = hasProgram && refProgram.is_enabled === true;

  const valueStr = (type, value) => type === 'percent'
    ? `${value}%` : `${Number(value).toFixed(2)} €`;

  const shareUrl = refMyCode?.code
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/book/${slug}?ref=${refMyCode.code}`
    : null;

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {/* ignore */}
  };

  const share = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Parrainage ${business?.business_name || ''}`,
          text: `Utilise mon code ${refMyCode.code} chez ${business?.business_name || 'ce commerce'} !`,
          url: shareUrl,
        });
      } catch {/* user cancelled */}
    } else {
      copyLink();
    }
  };

  // Réductions déjà gagnées (pour l'état désactivé on affiche uniquement celles-ci)
  const earnedRewards = (refMyRewards || []).filter(r => r.status === 'available' || r.status === 'used');

  return (
    <div style={{ maxWidth:680, margin:'0 auto', padding:'32px 20px 80px', animation:'fadeIn .2s ease' }}>
      <button onClick={onBack}
        style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px',
          background:'none', border:'none', cursor:'pointer',
          fontSize:13, color:th.muted, marginBottom:16 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ width:14, height:14 }}><polyline points="15 18 9 12 15 6"/></svg>
        Retour à l'accueil
      </button>

      <h1 style={{ fontSize:26, fontWeight:900, color:th.text, margin:'0 0 8px',
        letterSpacing:'-0.02em' }}>
        Parrainer un ami
      </h1>
      {business?.business_name && (
        <p style={{ fontSize:14, color:th.muted, margin:'0 0 24px' }}>
          Programme de parrainage de {business.business_name}
        </p>
      )}

      {/* ── État : programme désactivé ─────────────────────────────────── */}
      {hasProgram && !isActive && (
        <div style={{ background:th.card, border:`1px solid ${th.border}`,
          borderRadius:16, padding:24, marginBottom:16 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🔒</div>
          <h2 style={{ fontSize:18, fontWeight:800, color:th.text, margin:'0 0 8px' }}>
            Programme temporairement fermé
          </h2>
          <p style={{ fontSize:14, color:th.muted, margin:0, lineHeight:1.6 }}>
            Le programme de parrainage est temporairement fermé.
            {earnedRewards.length > 0 ? ' Vos réductions déjà gagnées restent utilisables jusqu\'à leur date d\'expiration.' : ''}
          </p>
        </div>
      )}

      {/* ── État : programme actif ─────────────────────────────────────── */}
      {isActive && (
        <>
          {/* Conditions du programme */}
          <div style={{ background:th.card, border:`1px solid ${th.border}`,
            borderRadius:16, padding:24, marginBottom:16 }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🤝</div>
            <h2 style={{ fontSize:18, fontWeight:800, color:th.text, margin:'0 0 10px' }}>
              Comment ça marche ?
            </h2>
            <ol style={{ fontSize:14, color:th.text, margin:0, paddingLeft:20, lineHeight:1.8 }}>
              <li>Partagez votre code personnel à vos amis.</li>
              <li>Ils prennent rendez-vous et saisissent votre code.</li>
              <li>Après leur visite, vous recevez{' '}
                <strong>{valueStr(refProgram.parrain_type, refProgram.parrain_value)} de réduction</strong>{' '}
                par email.
              </li>
            </ol>
          </div>

          {/* Non connecté : bouton Voir mon code */}
          {!gcConnected && (
            <div style={{ background:th.card, border:`1px solid ${th.border}`,
              borderRadius:16, padding:24, marginBottom:16, textAlign:'center' }}>
              <p style={{ fontSize:14, color:th.muted, margin:'0 0 14px' }}>
                Connectez-vous pour obtenir votre code de parrainage personnel.
              </p>
              <button onClick={onLogin}
                style={{ padding:'12px 24px', borderRadius:11, cursor:'pointer',
                  background:th.accent, color:th.accentText, border:'none',
                  fontWeight:800, fontSize:14 }}>
                Voir mon code
              </button>
            </div>
          )}

          {/* Connecté : code + partage */}
          {gcConnected && refMyCode?.code && (
            <div style={{ background:th.card, border:`1px solid ${th.border}`,
              borderRadius:16, padding:24, marginBottom:16 }}>
              <p style={{ fontSize:11, fontWeight:700, color:th.muted,
                textTransform:'uppercase', letterSpacing:'0.05em', margin:'0 0 10px' }}>
                Votre code
              </p>
              <div style={{ background:th.cardAlt, border:'2px dashed #8b5cf6',
                borderRadius:14, padding:'18px 16px', textAlign:'center', marginBottom:14 }}>
                <p style={{ fontFamily:'monospace', fontSize:24, fontWeight:900,
                  color:'#6d28d9', letterSpacing:3, margin:0 }}>{refMyCode.code}</p>
                <p style={{ fontSize:11, color:th.muted, margin:'6px 0 0' }}>
                  {refMyCode.uses_count || 0} filleul{(refMyCode.uses_count||0) > 1 ? 's' : ''}
                </p>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={copyLink}
                  style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
                    background:copied ? '#10b981' : '#8b5cf6', color:'white',
                    border:'none', fontWeight:800, fontSize:13 }}>
                  {copied ? '✓ Copié' : 'Copier'}
                </button>
                <button onClick={share}
                  style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
                    background:th.cardAlt, color:th.text,
                    border:`1px solid ${th.border}`, fontWeight:700, fontSize:13 }}>
                  Partager le lien
                </button>
              </div>
            </div>
          )}

          {/* Historique filleuls (connecté) */}
          {gcConnected && refMyHistory && refMyHistory.length > 0 && (
            <div style={{ background:th.card, border:`1px solid ${th.border}`,
              borderRadius:16, padding:20, marginBottom:16 }}>
              <p style={{ fontSize:13, fontWeight:800, color:th.text, margin:'0 0 12px' }}>
                Mes filleuls
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {refMyHistory.map(h => {
                  const name = [h.filleul_first_name, h.filleul_last_name].filter(Boolean).join(' ') || h.filleul_email;
                  const color = h.status === 'validated' ? '#10b981'
                              : h.status === 'cancelled' ? '#ef4444' : '#f59e0b';
                  const label = h.status === 'validated' ? 'Validé ✅'
                              : h.status === 'cancelled' ? 'Annulé' : 'En attente';
                  return (
                    <div key={h.id} style={{ display:'flex', alignItems:'center', gap:12,
                      padding:'10px 12px', borderRadius:10,
                      background:th.cardAlt, border:`1px solid ${th.border}` }}>
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
                      <span style={{ fontSize:11, fontWeight:800,
                        padding:'3px 10px', borderRadius:99,
                        background:color + '18', color, flexShrink:0 }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Réductions gagnées (affichées dans tous les cas si présentes) */}
      {earnedRewards.length > 0 && (
        <div style={{ background:th.card, border:`1px solid ${th.border}`,
          borderRadius:16, padding:20 }}>
          <p style={{ fontSize:13, fontWeight:800, color:th.text, margin:'0 0 12px' }}>
            Mes réductions
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {earnedRewards.map(r => {
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
                  display:'flex', alignItems:'center', gap:10,
                }}>
                  <span style={{ fontSize:22 }}>{isBday ? '🎂' : '🤝'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontSize:13, fontWeight:800, color:th.text }}>
                      {valStr} <span style={{ fontFamily:'monospace', fontSize:11, color:accent }}>· {r.code}</span>
                    </p>
                    <p style={{ margin:'2px 0 0', fontSize:11, color:th.muted }}>
                      {isBday ? 'Anniversaire' : 'Parrainage'}
                      {isUsed ? ' · utilisée' : expStr ? ` · expire le ${expStr}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Carte latérale sticky : logo + avis + statut + 7 jours + adresse + contact ──
function SideCard({ th, slug, business, onReserve }) {
  const [contactOpen, setContactOpen] = useState(false);

  // Statut ouvert/fermé calculé dynamiquement depuis business.hours
  const hours = business?.hours || {};
  const parseHM = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  const now = new Date();
  const curDow = now.getDay();                          // 0=Dim … 6=Sam
  const curHM  = now.getHours() * 60 + now.getMinutes();
  const DAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const today = hours[curDow];
  const openM  = today && today.is_open ? parseHM(today.open_time)  : null;
  const closeM = today && today.is_open ? parseHM(today.close_time) : null;
  let status;
  if (today?.is_open && openM != null && closeM != null && curHM >= openM && curHM < closeM) {
    status = { label: 'Ouvert', detail: `Ferme à ${today.close_time}`, color: '#10b981' };
  } else if (today?.is_open && openM != null && curHM < openM) {
    status = { label: 'Fermé', detail: `Ouvre à ${today.open_time}`, color: '#ef4444' };
  } else {
    let next = null;
    for (let i = 1; i <= 7; i++) {
      const dow = (curDow + i) % 7;
      const h = hours[dow];
      if (h?.is_open && h.open_time) { next = { dow, time: h.open_time, inDays: i }; break; }
    }
    if (next) {
      const whenLbl = next.inDays === 1 ? 'demain' : DAY_SHORT[next.dow];
      status = { label: 'Fermé', detail: `Ouvre ${next.time} ${whenLbl}`, color: '#ef4444' };
    } else {
      status = { label: 'Fermé', detail: null, color: '#ef4444' };
    }
  }

  // 7 jours dans l'ordre Lun → Dim
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const DAY_FULL = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  const addressStr = [business?.address, [business?.postal_code, business?.city].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const mapsUrl = addressStr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressStr)}` : null;

  return (
    <div className="bk-do bk-sb"
      style={{ width:290, flexShrink:0, paddingTop:32,
        position:'sticky', top:80, alignSelf:'flex-start' }}>
      <div style={{ background:th.sidebarBg, border:`1px solid ${th.border}`,
        borderRadius:16, overflow:'hidden' }}>

        {/* Logo + nom + lien avis Google */}
        <div style={{ padding:'24px 20px 18px', textAlign:'center',
          borderBottom:`1px solid ${th.border}` }}>
          <div style={{ width:80, height:80, borderRadius:99, margin:'0 auto 12px',
            overflow:'hidden', background:th.cardAlt,
            display:'flex', alignItems:'center', justifyContent:'center',
            border:`3px solid ${th.border}` }}>
            {business?.profile_url ? (
              <img src={mediaUrl(business.profile_url)} alt={business.business_name}
                style={{ width:'100%', height:'100%', objectFit:'cover' }}
                onError={e=>{ e.target.style.display='none'; }}/>
            ) : null}
            <span style={{ fontSize:28, fontWeight:900, color:'#374151',
              display: business?.profile_url ? 'none' : 'block' }}>
              {(business?.business_name||'B').charAt(0).toUpperCase()}
            </span>
          </div>
          <h2 style={{ fontSize:18, fontWeight:800, color:th.text,
            margin:'0 0 6px', letterSpacing:'-0.02em',
            textTransform:'uppercase' }}>
            {business?.business_name}
          </h2>
          {business?.google_business_url && (
            <a href={business.google_business_url} target="_blank" rel="noopener noreferrer"
              style={{ display:'inline-flex', alignItems:'center', gap:6,
                fontSize:12, fontWeight:600, color:'#2563eb',
                textDecoration:'none' }}>
              <svg viewBox="0 0 24 24" width="13" height="13" style={{flexShrink:0}}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Voir les avis
            </a>
          )}
        </div>

        {/* Bouton Réserver */}
        <div style={{ padding:'16px 20px', borderBottom:`1px solid ${th.border}` }}>
          <button onClick={onReserve}
            style={{ width:'100%', padding:'13px', borderRadius:10,
              background:th.accent, border:'none', fontWeight:800, fontSize:15,
              color:th.accentText, cursor:'pointer',
              boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
            Réserver
          </button>
        </div>

        {/* Statut ouvert/fermé + Tableau horaires */}
        {Object.keys(hours).length > 0 && (
          <div style={{ borderBottom:`1px solid ${th.border}` }}>
            <div style={{ padding:'12px 18px', display:'flex', alignItems:'center', gap:6,
              background:th.cardAlt, borderBottom:`1px solid ${th.border}` }}>
              <span style={{ width:8, height:8, borderRadius:99, background:status.color, flexShrink:0 }} />
              <span style={{ fontSize:13, fontWeight:700, color:status.color }}>{status.label}</span>
              {status.detail && (
                <span style={{ fontSize:12, color:th.muted }}>· {status.detail}</span>
              )}
            </div>
            <div>
              {WEEK_ORDER.map((dow, i) => {
                const h = hours[dow];
                const isToday = dow === curDow;
                const isLast  = i === WEEK_ORDER.length - 1;
                return (
                  <div key={dow} style={{ display:'flex', alignItems:'center',
                    justifyContent:'space-between', padding:'8px 18px',
                    borderBottom: isLast ? 'none' : `1px solid ${th.border}` }}>
                    <span style={{ fontSize:13, fontWeight: isToday ? 800 : 500,
                      color: isToday ? th.text : th.muted }}>
                      {DAY_FULL[dow]}
                    </span>
                    <span style={{ fontSize:13, fontWeight: isToday ? 700 : 400,
                      color: isToday ? th.text : (h?.is_open ? th.text : th.muted),
                      fontVariantNumeric:'tabular-nums' }}>
                      {h?.is_open && h.open_time && h.close_time
                        ? `${h.open_time} – ${h.close_time}`
                        : 'Fermé'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Adresse + lien Maps */}
        {(business?.address || business?.city || business?.postal_code) && (
          <div style={{ padding:'14px 18px', borderBottom:`1px solid ${th.border}` }}>
            {business?.address && (
              <p style={{ fontSize:13, color:th.text, margin:'0 0 2px', lineHeight:1.5 }}>
                {business.address}
              </p>
            )}
            {(business?.postal_code || business?.city) && (
              <p style={{ fontSize:13, color:th.muted, margin:'0 0 10px', lineHeight:1.5 }}>
                {[business.postal_code, business.city].filter(Boolean).join(' ')}
              </p>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                style={{ display:'inline-flex', alignItems:'center', gap:6,
                  fontSize:13, fontWeight:600, color:'#2563eb', textDecoration:'none' }}>
                Ouvrir dans Maps
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{width:13,height:13}}>
                  <path d="M7 17L17 7M17 7H8M17 7V16"/>
                </svg>
              </a>
            )}
          </div>
        )}

        {/* Accordéon "Nous contacter" — tél + email */}
        {(business?.phone || business?.email) && (
          <div>
            <button onClick={() => setContactOpen(o => !o)}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'12px 18px', background:'none', border:'none', cursor:'pointer',
                fontSize:13, fontWeight:700, color:th.text, textAlign:'left' }}>
              Nous contacter
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ width:14, height:14, color:th.muted,
                  transform: contactOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition:'transform .2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {contactOpen && (
              <div style={{ borderTop:`1px solid ${th.border}` }}>
                {business?.phone && (
                  <a href={`tel:${business.phone}`}
                    style={{ display:'flex', alignItems:'center', gap:10,
                      padding:'10px 18px', textDecoration:'none',
                      borderBottom: business?.email ? `1px solid ${th.border}` : 'none' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{width:15,height:15,color:th.muted,flexShrink:0}}>
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    <span style={{ fontSize:13, color:th.text }}>{business.phone}</span>
                  </a>
                )}
                {business?.email && (
                  <a href={`mailto:${business.email}`}
                    style={{ display:'flex', alignItems:'center', gap:10,
                      padding:'10px 18px', textDecoration:'none' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{width:15,height:15,color:th.muted,flexShrink:0}}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    <span style={{ fontSize:13, color:th.text, overflow:'hidden',
                      textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{business.email}</span>
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Groupe accordéon style Setmore : titre cliquable + liste de services
function AccordionGroup({ label, svcs, th, isLast, onSelect }) {
  const [open, setOpen] = useState(false); // fermé par défaut

  return (
    <div style={{ borderBottom: isLast ? 'none' : `1px solid ${th.border}` }}>
      {/* En-tête accordéon */}
      {label && (
        <button onClick={() => setOpen(p => !p)}
          style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 20px', background:'none', border:'none', cursor:'pointer',
            textAlign:'left' }}>
          <span style={{ fontSize:13, fontWeight:700, color:th.text, textTransform:'uppercase',
            letterSpacing:'0.05em' }}>{label}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ width:16, height:16, color:th.muted,
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition:'transform .2s' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      )}

      {/* Services */}
      {(open || !label) && (
        <div>
          {svcs.map((s, i) => {
            const dMin = s.duration_minutes;
            const durLabel = dMin >= 60
              ? `${Math.floor(dMin/60)}h${dMin%60>0?String(dMin%60).padStart(2,'0'):''}`
              : `${dMin} min`;
            const isLast2 = i === svcs.length - 1;

            return (
              <button key={s.id} onClick={() => onSelect(s)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:16,
                  padding:'16px 20px', background:'none', border:'none', cursor:'pointer',
                  borderTop: (i > 0 || label) ? `1px solid ${th.border}` : 'none',
                  textAlign:'left', transition:'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = th.cardAlt}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>

                {/* Image service si disponible */}
                <ServiceThumb serviceId={s.id} color={s.color} th={th} hasImage={s.has_image !== false} version={s.image_version} />

                {/* Infos */}
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:600, color:th.text, margin:'0 0 3px',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {s.name}
                  </p>
                  <p style={{ fontSize:12, color:th.muted, margin:0 }}>
                    {durLabel}
                    {s.price != null && !s.is_free_price ? ` · ${Number(s.price).toFixed(2)} €` : ''}
                  </p>
                  {s.description && (
                    <p style={{ fontSize:11, color:th.dim, margin:'3px 0 0',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {s.description}
                    </p>
                  )}
                </div>

                {/* Chevron */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{width:16,height:16,color:th.dim,flexShrink:0}}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Miniature image du service (se charge silencieusement)
function ServiceThumb({ serviceId, color, th, hasImage = true, version }) {
  const [ok, setOk] = useState(false);
  const accent = color || '#6366f1';
  const showImg = hasImage !== false;
  return (
    <div style={{ width:48, height:48, borderRadius:10, flexShrink:0, overflow:'hidden',
      background: ok ? 'transparent' : `${accent}15`,
      display:'flex', alignItems:'center', justifyContent:'center' }}>
      {!ok && (
        <svg viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20,opacity:0.5}}>
          <path d="M6 3h12M6 8h12M6 13l3.5 5L12 13l2.5 5L18 13"/>
        </svg>
      )}
      {showImg && (
        <img
          src={serviceImgUrl(serviceId, version)}
          alt=""
          style={{ width:'100%', height:'100%', objectFit:'cover', display: ok ? 'block' : 'none' }}
          onLoad={() => setOk(true)}
          onError={() => setOk(false)}
        />
      )}
    </div>
  );
}


function ServiceCard({ s, th, onClick, catColor }) {
  const accentColor = s.color || catColor || '#7c6af7';
  const dMin = s.duration_minutes;
  const durLabel = dMin >= 60
    ? `${Math.floor(dMin/60)}h${dMin%60 > 0 ? String(dMin%60).padStart(2,'0') : ''}`
    : `${dMin} min`;
  const svcImgUrl = serviceImgUrl(s.id, s.image_version);
  const [hasImg, setHasImg] = useState(s.has_image !== false);

  return (
    <button onClick={onClick}
      style={{ width:'100%', borderRadius:18, padding:0, textAlign:'left',
        background:th.card, border:`1px solid ${th.border}`,
        cursor:'pointer', overflow:'hidden',
        boxShadow: th.mode==='light' ? '0 2px 10px rgba(0,0,0,0.06)' : 'none',
        transition:'transform .1s,box-shadow .1s' }}
      onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow=th.mode==='light'?'0 4px 18px rgba(0,0,0,0.1)':'0 0 0 1px rgba(124,106,247,0.3)'; }}
      onMouseLeave={e=>{ e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=th.mode==='light'?'0 2px 10px rgba(0,0,0,0.06)':'none'; }}>
      {/* Image du service si disponible */}
      {hasImg && (
        <div style={{ width:'100%', height:110, overflow:'hidden', background:`${accentColor}18` }}>
          <img src={svcImgUrl} alt={s.name}
            style={{ width:'100%', height:'100%', objectFit:'cover' }}
            onError={() => setHasImg(false)}/>
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px' }}>
        {/* Pastille couleur */}
        {!hasImg && (
          <div style={{ width:36, height:36, borderRadius:11, flexShrink:0,
            background:`${accentColor}18`, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
              <path d="M6 3h12M6 8h12M6 13l3.5 5L12 13l2.5 5L18 13"/>
            </svg>
          </div>
        )}
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, fontSize:14, color:th.text, margin:'0 0 2px',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</p>
          <p style={{ fontSize:12, color:th.muted, margin:0 }}>
            ⏱ {durLabel}{s.price != null ? ` · ${Number(s.price).toFixed(2)} €` : ''}
          </p>
          {s.description && <p style={{ fontSize:11, color:th.dim, margin:'3px 0 0',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.description}</p>}
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{width:16,height:16,flexShrink:0,color:th.dim}}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
      {/* Barre accent bas */}
      <div style={{ height:3, background:`linear-gradient(90deg,${accentColor},${accentColor}44)` }}/>
    </button>
  );
}

function BackBtn({ onClick, label, th }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm mb-4" style={{color:th.muted}}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="15 18 9 12 15 6"/></svg>
      {label}
    </button>
  );
}