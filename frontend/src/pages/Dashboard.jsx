// src/pages/Dashboard.jsx — Layout maquette, responsive, logout, stats PIN-protégées
import { useState, useEffect } from 'react';
import { todayStr } from '../utils/dates';
import { useTheme } from '../hooks/useTheme';
import { useEmployeePin } from '../hooks/useEmployeePin';
import { bookingApi, notifApi } from '../utils/api';

const nd   = d => { if (!d) return ''; const s = typeof d === 'string' ? d : new Date(d).toISOString(); return s.substring(0, 10); };
const fmtN = n => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt  = n => Number(n || 0).toFixed(2);

const PM_CFG = {
  cash:     { label: 'Especes',  color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  card:     { label: 'Carte',    color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
  transfer: { label: 'Virement', color: '#374151', bg: 'rgba(6,182,212,0.1)'  },
  other:    { label: 'Autre',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
};

function Modal({ open, onClose, title, children, theme }) {
  if (!open) return null;
  const isDark = theme.mode === 'dark';
  return (
    <div style={{ position:'fixed',inset:0,zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position:'absolute',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(6px)' }} onClick={onClose}/>
      <div style={{ position:'relative',width:'100%',maxWidth:520,maxHeight:'92vh',display:'flex',flexDirection:'column',
        borderRadius:24,
        background:isDark?'#161622':'#ffffff',
        border:`1px solid ${isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.07)'}`,
        boxShadow:'0 24px 64px rgba(0,0,0,0.35)' }}>
        <div style={{ display:'flex',justifyContent:'center',padding:'12px 0 4px' }}>
          <div style={{ width:40,height:4,borderRadius:99,background:isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.12)' }}/>
        </div>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'4px 20px 14px',borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.07)'}` }}>
          <p style={{ fontWeight:800,fontSize:16,color:isDark?'#f1f5f9':'#1e293b',margin:0 }}>{title}</p>
          <button onClick={onClose} style={{ width:30,height:30,borderRadius:8,border:'none',cursor:'pointer',
            background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)',
            color:isDark?'#9ca3af':'#6b7280',fontSize:16,
            display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ overflowY:'auto',flex:1 }}>{children}</div>
      </div>
    </div>
  );
}

// ── PinKeypad — identique au composant EmployeePinModal ─────────────────────
function PinKeypad({ onPress, theme }) {
  const isDark = theme.mode === 'dark';
  const keys   = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, maxWidth:260, margin:'0 auto' }}>
      {keys.map((k, i) => k === '' ? <div key={i}/> : (
        <button key={k+i} onClick={() => onPress(k)}
          style={{ height:58, borderRadius:16, fontSize:20, fontWeight:500, cursor:'pointer',
            userSelect:'none', border:`1px solid ${theme.border}`,
            background: k==='⌫'
              ? (isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)')
              : (isDark?'rgba(255,255,255,0.07)':'#ffffff'),
            color: k==='⌫' ? theme.muted : theme.text,
            boxShadow: isDark?'none':'0 2px 6px rgba(0,0,0,0.06)',
            transition:'transform 0.08s' }}
          onMouseDown={e => e.currentTarget.style.transform='scale(0.92)'}
          onMouseUp={e   => e.currentTarget.style.transform='scale(1)'}
          onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}>
          {k}
        </button>
      ))}
    </div>
  );
}

// ── PinDots — identique au composant EmployeePinModal ────────────────────────
function PinDots({ count, shake, theme }) {
  const isDark = theme.mode === 'dark';
  return (
    <div style={{ display:'flex', justifyContent:'center', gap:16, margin:'20px 0',
      animation: shake ? 'shake 0.4s ease' : 'none' }}>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
      {[0,1,2,3].map(i => (
        <div key={i} style={{ transition:'all 0.2s',
          width:13, height:13, borderRadius:'50%',
          background: i < count ? (isDark?'#e6edf3':'#111827') : 'transparent',
          border: i < count ? 'none' : `2px solid ${isDark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.15)'}`,
          transform: i < count ? 'scale(1.2)' : 'scale(1)',
          boxShadow: i < count ? '0 0 8px rgba(17,24,39,0.6)' : 'none' }}/>
      ))}
    </div>
  );
}

// ── StatsAccessModal — sélection employé puis clavier PIN identique à l'encaissement ─
function StatsAccessModal({ open, onClose, onSuccess, employees, theme }) {
  const isDark = theme.mode === 'dark';
  const { requiresPin, isSessionValid, verifyPin } = useEmployeePin();

  const [step, setStep]         = useState('select');
  const [selEmp, setSelEmp]     = useState(null);
  const [pin, setPin]           = useState('');
  const [err, setErr]           = useState('');
  const [shake, setShake]       = useState(false);
  const [busy, setBusy]         = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (open) { setStep('select'); setSelEmp(null); setPin(''); setErr(''); setShake(false); setBusy(false); setAttempts(0); }
  }, [open]);

  const activeEmps = employees.filter(e => e.is_active !== false);

  const handleSelectEmp = async (emp) => {
    setChecking(true);
    try {
      const needs = await requiresPin(emp.id);
      if (!needs) { onSuccess(); onClose(); return; }
      const sessionOk = await isSessionValid(emp.id);
      if (sessionOk) { onSuccess(); onClose(); return; }
      setSelEmp(emp); setPin(''); setErr(''); setAttempts(0); setStep('pin');
    } catch { onSuccess(); onClose(); }
    finally { setChecking(false); }
  };

  // Même logique exacte que EmployeePinModal.press()
  const press = async (k) => {
    if (busy) return;
    if (k === '⌫') { setPin(p => p.slice(0,-1)); setErr(''); return; }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next); setErr('');
    if (next.length === 4) {
      setBusy(true);
      await new Promise(r => setTimeout(r, 80));
      const result = await verifyPin(selEmp.id, next);
      if (result.success) {
        setAttempts(0); onSuccess(); onClose();
      } else {
        const na = attempts + 1; setAttempts(na); setShake(true);
        const remaining = 3 - na;
        if (remaining <= 0) {
          setErr('Trop de tentatives. Acces refuse.');
          setTimeout(() => onClose(), 1500);
        } else {
          setErr(`Code incorrect (${na}/3)`);
          setTimeout(() => { setPin(''); setShake(false); setBusy(false); }, 700);
        }
      }
    }
  };

  if (!open) return null;

  return (
    <div style={{ position:'fixed',inset:0,zIndex:400,
      display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',
      background:'rgba(0,0,0,0.55)',backdropFilter:'blur(4px)' }}
      onClick={e => e.target===e.currentTarget && onClose()}>

      <div style={{ position:'relative',width:'100%',maxWidth:420,maxHeight:'92vh',overflowY:'auto',
        borderRadius:24,
        paddingBottom:32,paddingTop:24,paddingLeft:20,paddingRight:20,
        background:theme.card,
        border:`1px solid ${theme.border}`,
        boxShadow:'0 24px 64px rgba(0,0,0,0.35)' }}>

        {/* Handle */}
        <div style={{ width:40,height:4,borderRadius:99,margin:'0 auto 20px',
          background:isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.1)' }}/>

        {/* Fermer */}
        <button onClick={onClose}
          style={{ position:'absolute',top:16,right:16,width:32,height:32,borderRadius:'50%',
            display:'flex',alignItems:'center',justifyContent:'center',border:'none',cursor:'pointer',
            background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)',
            color:theme.muted,fontSize:16 }}>✕</button>

        {/* ─ ÉTAPE 1 : Sélection employé ─ */}
        {step === 'select' && (
          <>
            <p style={{ fontWeight:800,fontSize:16,color:theme.text,margin:'0 0 4px',textAlign:'center' }}>🔐 Stats du jour</p>
            <p style={{ fontSize:13,color:theme.muted,margin:'0 0 20px',textAlign:'center' }}>Sélectionnez votre profil</p>
            {checking ? (
              <div style={{ textAlign:'center',padding:'20px 0',color:theme.muted,fontSize:13 }}>Vérification…</div>
            ) : activeEmps.length === 0 ? (
              <div style={{ textAlign:'center',padding:'24px 0' }}>
                <p style={{ fontSize:13,color:theme.muted,marginBottom:14 }}>Aucun employé actif</p>
                <button onClick={()=>{onSuccess();onClose();}}
                  style={{ padding:'11px 28px',borderRadius:12,border:'none',cursor:'pointer',
                    background:'#1a73e8', color:'white', fontWeight:700,fontSize:14 }}>
                  Accéder directement
                </button>
              </div>
            ) : (
              <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                {activeEmps.map(emp => (
                  <button key={emp.id} onClick={() => handleSelectEmp(emp)}
                    style={{ display:'flex',alignItems:'center',gap:14,
                      padding:'13px 16px',borderRadius:16,textAlign:'left',cursor:'pointer',
                      border:`1px solid ${theme.border}`,background:theme.inputBg,transition:'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background=isDark?'rgba(17,24,39,0.12)':'rgba(17,24,39,0.07)'; e.currentTarget.style.borderColor=isDark?'rgba(17,24,39,0.35)':'rgba(17,24,39,0.3)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background=theme.inputBg; e.currentTarget.style.borderColor=theme.border; }}>
                    <div style={{ width:44,height:44,borderRadius:14,flexShrink:0,
                      background:emp.avatar_color||'#111827',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      color:'white',fontWeight:800,fontSize:18,
                      boxShadow:`0 4px 12px ${emp.avatar_color||'#111827'}44` }}>
                      {(emp.name||'?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <p style={{ fontWeight:700,fontSize:14,color:theme.text,margin:0 }}>{emp.name}</p>
                      {emp.role && <p style={{ fontSize:12,color:theme.muted,margin:0 }}>{emp.role}</p>}
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke={theme.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:15,height:15,flexShrink:0}}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─ ÉTAPE 2 : Clavier PIN (identique EmployeePinModal) ─ */}
        {step === 'pin' && selEmp && (
          <>
            {/* Retour */}
            <button onClick={() => { setStep('select'); setPin(''); setErr(''); }}
              style={{ position:'absolute',top:16,left:16,width:32,height:32,borderRadius:'50%',
                display:'flex',alignItems:'center',justifyContent:'center',border:'none',cursor:'pointer',
                background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)',
                color:theme.muted,fontSize:14 }}>←</button>

            {/* Avatar + nom */}
            <div style={{ display:'flex',flexDirection:'column',alignItems:'center',marginBottom:6 }}>
              <div style={{ width:56,height:56,borderRadius:18,marginBottom:10,
                background:selEmp.avatar_color||'#111827',
                display:'flex',alignItems:'center',justifyContent:'center',
                color:'white',fontWeight:900,fontSize:22,
                boxShadow:`0 8px 24px ${selEmp.avatar_color||'#111827'}55` }}>
                {(selEmp.name||'?').charAt(0).toUpperCase()}
              </div>
              <p style={{ fontWeight:800,fontSize:15,color:theme.text,margin:0 }}>{selEmp.name}</p>
              <p style={{ fontSize:12,marginTop:5,padding:'3px 12px',borderRadius:99,
                background:isDark?'rgba(17,24,39,0.12)':'rgba(17,24,39,0.08)',
                color:isDark?'#e6edf3':'#111827',border:`1px solid ${isDark?'rgba(255,255,255,0.15)':'rgba(17,24,39,0.2)'}` }}>
                Voir les stats du jour
              </p>
            </div>

            <p style={{ textAlign:'center',fontSize:13,color:theme.muted,margin:'4px 0 0' }}>
              Code PIN requis pour valider
            </p>

            <PinDots count={pin.length} shake={shake} theme={theme}/>

            <p style={{ fontSize:12,fontWeight:500,textAlign:'center',marginBottom:16,height:16,
              color:err?'#f87171':'transparent' }}>
              {err||'·'}
            </p>

            <PinKeypad onPress={press} theme={theme}/>

            <button onClick={onClose}
              style={{ width:'100%',marginTop:20,padding:'12px',borderRadius:16,
                fontSize:13,fontWeight:500,cursor:'pointer',
                background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)',
                color:theme.muted,border:`1px solid ${theme.border}` }}>
              Annuler
            </button>
          </>
        )}
      </div>
    </div>
  );
}


function NotifModal({ open, onClose, theme }) {
  const isDark = theme.mode === 'dark';
  const [notifs, setNotifs]   = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    notifApi.getInApp({ limit:50 }).then(d => setNotifs(d.notifications||[])).catch(()=>{}).finally(()=>setLoading(false));
  }, [open]);

  const markRead = async id => { await notifApi.markRead({ id }).catch(()=>{}); setNotifs(p=>p.map(n=>n.id===id?{...n,is_read:true}:n)); };
  const del      = async id => { await notifApi.deleteInApp(id).catch(()=>{}); setNotifs(p=>p.filter(n=>n.id!==id)); };
  const clearAll = async ()  => { await Promise.all(notifs.map(n=>notifApi.deleteInApp(n.id))).catch(()=>{}); setNotifs([]); };

  const ICON = { new_appointment:'📅', appointment_reminder:'⏰', caisse:'🧾' };
  const fmtTime = iso => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000)    return 'À l\'instant';
    if (diff < 3600000)  return `Il y a ${Math.floor(diff/60000)} min`;
    if (diff < 86400000) return `Il y a ${Math.floor(diff/3600000)}h`;
    return new Date(iso).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
  };
  const unread = notifs.filter(n => !n.is_read).length;
  const sep = `1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}`;

  return (
    <Modal open={open} onClose={onClose} theme={theme} title={`Notifications${unread>0?` · ${unread} non lues`:''}`}>
      {notifs.length > 0 && (
        <div style={{ padding:'10px 16px 6px',borderBottom:sep,display:'flex',alignItems:'center',justifyContent:'flex-end' }}>
          <button onClick={clearAll} style={{ fontSize:12,fontWeight:700,color:'#ef4444',
            background:'rgba(239,68,68,0.08)',border:'none',cursor:'pointer',padding:'4px 10px',borderRadius:8 }}>
            🗑 Effacer tout
          </button>
        </div>
      )}
      {loading ? (
        <div style={{ padding:40,textAlign:'center',color:isDark?'#6b7280':'#9ca3af',fontSize:13 }}>Chargement…</div>
      ) : notifs.length === 0 ? (
        <div style={{ padding:'48px 20px',textAlign:'center' }}>
          <p style={{ fontSize:32,marginBottom:10 }}>🔔</p>
          <p style={{ fontSize:14,fontWeight:600,color:isDark?'#6b7280':'#9ca3af' }}>Aucune notification</p>
        </div>
      ) : notifs.map((n,i) => (
        <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
          style={{ display:'flex',alignItems:'flex-start',gap:10,padding:'13px 16px',
            borderBottom:i<notifs.length-1?sep:'none',
            background:n.is_read?'transparent':(isDark?'rgba(17,24,39,0.04)':'rgba(17,24,39,0.025)'),
            cursor:n.is_read?'default':'pointer' }}>
          <div style={{ width:36,height:36,borderRadius:10,flexShrink:0,fontSize:17,
            display:'flex',alignItems:'center',justifyContent:'center',
            background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.04)' }}>
            {ICON[n.type]||'📌'}
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:2 }}>
              {!n.is_read&&<span style={{ width:6,height:6,borderRadius:'50%',background:isDark?'#e6edf3':'#111827',flexShrink:0 }}/>}
              <p style={{ fontWeight:n.is_read?600:800,fontSize:13,color:isDark?'#f1f5f9':'#1e293b',
                margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{n.title}</p>
            </div>
            {n.body&&<p style={{ fontSize:11,color:isDark?'#64748b':'#94a3b8',margin:'0 0 3px',lineHeight:1.4 }}>{n.body}</p>}
            <p style={{ fontSize:10,color:isDark?'#4b5563':'#cbd5e1',margin:0 }}>{fmtTime(n.created_at)}</p>
          </div>
          <button onClick={e=>{e.stopPropagation();del(n.id);}}
            style={{ width:24,height:24,borderRadius:6,border:'none',cursor:'pointer',flexShrink:0,
              background:'rgba(239,68,68,0.1)',color:'#ef4444',fontSize:13,
              display:'flex',alignItems:'center',justifyContent:'center' }}>×</button>
        </div>
      ))}
    </Modal>
  );
}

function StatsModal({ open, onClose, theme, transactions, employees, categories }) {
  const isDark = theme.mode === 'dark';
  const today  = todayStr();
  const sep    = `1px solid ${isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.07)'}`;

  const todayRevs  = transactions.filter(t => nd(t.date)===today && t.type==='revenue');
  const todayExps  = transactions.filter(t => nd(t.date)===today && t.type==='expense');
  const todayAll   = transactions.filter(t => nd(t.date)===today);
  const dayRev     = todayRevs.reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
  const dayExp     = todayExps.reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
  const prestCount = todayRevs.reduce((s,t)=>s+(parseInt(t.qty_total)||1),0);

  const byEmp = employees.map(emp => {
    const r = todayRevs.filter(t=>t.employee_id===emp.id);
    return {...emp,count:r.length,ca:r.reduce((s,t)=>s+(parseFloat(t.amount)||0),0)};
  }).filter(e=>e.count>0);

  const byPM = {};
  todayRevs.forEach(t => {
    const pm = t.payment_method||'other';
    if(!byPM[pm]) byPM[pm]={count:0,total:0};
    byPM[pm].count++; byPM[pm].total+=parseFloat(t.amount)||0;
  });

  // ── Par service / produit : agrégation depuis tx.items[] (chaque service séparé) ──
  // Chaque qty compte comme une vente réelle. Fallback sur category_name si pas d'items.
  const byCat = {};
  todayRevs.forEach(t => {
    const items = Array.isArray(t.items) ? t.items : [];
    if (items.length > 0) {
      items.forEach(it => {
        const key  = it.service_name || 'Sans nom';
        const qty  = parseInt(it.qty) || 1;
        const unit = parseFloat(it.unit_price) || 0;
        if (!byCat[key]) byCat[key] = { count:0, total:0, unit };
        byCat[key].count += qty;
        byCat[key].total += unit * qty;
        byCat[key].unit   = unit;
      });
    } else {
      // Legacy : transactions sans items → on retombe sur la catégorie
      const cat = categories.find(c=>c.id===t.category_id);
      const key = cat?.name || t.description || 'Sans categorie';
      const qty = parseInt(t.qty_total) || 1;
      const amt = parseFloat(t.amount) || 0;
      if (!byCat[key]) byCat[key] = { count:0, total:0, unit: qty>0 ? amt/qty : amt };
      byCat[key].count += qty;
      byCat[key].total += amt;
    }
  });

  const section = (title, children) => (
    <div style={{ marginBottom:20 }}>
      <p style={{ fontSize:10,fontWeight:800,color:isDark?'#4b5563':'#94a3b8',
        textTransform:'uppercase',letterSpacing:'0.08em',margin:'0 0 10px',padding:'0 16px' }}>{title}</p>
      {children}
    </div>
  );

  const row = (label, value, color=null, sub=null, key=null) => (
    <div key={key||label} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:sep }}>
      <div>
        <p style={{ fontWeight:600,fontSize:13,color:isDark?'#f1f5f9':'#1e293b',margin:0 }}>{label}</p>
        {sub&&<p style={{ fontSize:11,color:isDark?'#64748b':'#94a3b8',margin:0 }}>{sub}</p>}
      </div>
      <span style={{ fontWeight:800,fontSize:14,color:color||(isDark?'#e6edf3':'#111827'),fontFamily:'monospace' }}>{value}</span>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} theme={theme} title="Stats du jour">
      <div style={{ padding:'12px 0 24px' }}>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:'0 16px',marginBottom:20 }}>
          {[
            {label:'CA total',     value:`${fmtN(dayRev)} €`,color:isDark?'#e6edf3':'#111827'},
            {label:'Prestations',  value:prestCount,          color:'#374151'},
            {label:'Depenses',     value:`${fmtN(dayExp)} €`,color:'#ef4444'},
            {label:'Transactions', value:todayAll.length,     color:'#f59e0b'},
          ].map(k=>(
            <div key={k.label} style={{ padding:'12px 14px',borderRadius:14,
              background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.03)',
              border:`1px solid ${isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.07)'}` }}>
              <p style={{ fontSize:10,fontWeight:700,color:isDark?'#4b5563':'#94a3b8',
                textTransform:'uppercase',letterSpacing:'0.06em',margin:'0 0 5px' }}>{k.label}</p>
              <p style={{ fontSize:20,fontWeight:900,color:k.color,fontFamily:'monospace',margin:0 }}>{k.value}</p>
            </div>
          ))}
        </div>
        {Object.keys(byPM).length > 0 && (
          <div style={{ marginBottom:16 }}>
            <p style={{ fontSize:10,fontWeight:800,color:isDark?'#4b5563':'#94a3b8',
              textTransform:'uppercase',letterSpacing:'0.08em',margin:'0 0 8px',padding:'0 16px' }}>
              Par moyen de paiement
            </p>
            <div style={{ display:'grid',
              gridTemplateColumns:`repeat(${Math.min(Object.keys(byPM).length,4)},1fr)`,
              gap:8,padding:'0 16px' }}>
              {Object.entries(byPM).map(([pm,v]) => {
                const cfg = PM_CFG[pm] || PM_CFG.other;
                return (
                  <div key={pm} style={{ padding:'10px 8px',borderRadius:14,textAlign:'center',
                    background:isDark?`${cfg.color}18`:`${cfg.color}10`,
                    border:`1px solid ${cfg.color}33` }}>
                    <p style={{ fontSize:9,fontWeight:800,color:cfg.color,
                      textTransform:'uppercase',letterSpacing:'0.06em',margin:'0 0 4px',
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                      {cfg.label}
                    </p>
                    <p style={{ fontSize:15,fontWeight:900,color:cfg.color,
                      fontFamily:'monospace',margin:'0 0 2px',lineHeight:1.1 }}>
                      {fmtN(v.total)} €
                    </p>
                    <p style={{ fontSize:10,color:isDark?'#6b7280':'#9ca3af',margin:0 }}>
                      {v.count} tx
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {byEmp.length>0 && section('Par employe', byEmp.map(emp=>(
          <div key={emp.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderBottom:sep }}>
            <div style={{ width:32,height:32,borderRadius:9,flexShrink:0,
              background:emp.avatar_color||'#111827',
              display:'flex',alignItems:'center',justifyContent:'center',
              color:'white',fontWeight:800,fontSize:13 }}>
              {(emp.name||'?').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontWeight:700,fontSize:13,color:isDark?'#f1f5f9':'#1e293b',margin:0 }}>{emp.name}</p>
              <p style={{ fontSize:11,color:isDark?'#64748b':'#94a3b8',margin:0 }}>{emp.count} prestation{emp.count>1?'s':''}</p>
            </div>
            <span style={{ fontWeight:800,fontSize:14,color:isDark?'#e6edf3':'#111827',fontFamily:'monospace' }}>{fmtN(emp.ca)} €</span>
          </div>
        )))}
        
        {Object.keys(byCat).length>0 && section('Par service / produit',
          Object.entries(byCat).sort(([,a],[,b])=>b.total-a.total).map(([name,v])=>
            row(name,`${v.count}×`,'#10b981',`${fmtN(v.unit||0)} €${v.count>1?` · ${fmtN(v.total)} € total`:''}`,name)
          )
        )}
        {todayAll.length===0&&(
          <div style={{ padding:'32px 16px',textAlign:'center' }}>
            <p style={{ fontSize:28,marginBottom:8 }}>📊</p>
            <p style={{ fontSize:13,color:isDark?'#6b7280':'#9ca3af',fontWeight:600 }}>Aucune transaction aujourd'hui</p>
          </div>
        )}
      </div>
    </Modal>
  );
}


// ── Tuiles ────────────────────────────────────────────────────────────────────
const baseTile = extra => ({
  display:'flex',flexDirection:'column',alignItems:'flex-start',
  padding:18,borderRadius:20,cursor:'pointer',border:'none',textAlign:'left',
  width:'100%',transition:'transform 0.15s,box-shadow 0.15s',...extra,
});

function TileAgenda({ theme, onClick, upcomingCount }) {
  const isDark=theme.mode==='dark'; const [hov,setHov]=useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={baseTile({ position:'relative',
        background:isDark?'linear-gradient(135deg,rgba(17,24,39,0.2),rgba(17,24,39,0.08))':'linear-gradient(135deg,#eef2ff,#f0f4ff)',
        border:`1px solid ${isDark?'rgba(17,24,39,0.3)':'rgba(17,24,39,0.2)'}`,
        boxShadow:hov?'0 10px 36px rgba(17,24,39,0.22)':'0 4px 20px rgba(17,24,39,0.08)',
        transform:hov?'translateY(-3px)':'none' })}>
      {upcomingCount>0&&(
        <div style={{ position:'absolute',top:-10,left:14,
          background:isDark?'#e6edf3':'#111827',color:isDark?'#111827':'white',
          fontWeight:900,fontSize:10,borderRadius:99,padding:'3px 9px',
          boxShadow:'0 3px 12px rgba(17,24,39,0.4)',
          border:'2px solid '+(isDark?'#0d1117':'#fff'),whiteSpace:'nowrap' }}>
          {upcomingCount} RDV
        </div>
      )}
      <div style={{ width:40,height:40,borderRadius:12,background:'rgba(17,24,39,0.15)',
        display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:19,height:19}}>
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </div>
      <p style={{ fontWeight:800,fontSize:15,color:isDark?'#c7d2fe':'#4338ca',margin:'0 0 3px' }}>Agenda</p>
      <p style={{ fontSize:11,color:isDark?'rgba(199,210,254,0.65)':'rgba(79,70,229,0.65)',fontWeight:500,margin:0 }}>
        {upcomingCount>0?`${upcomingCount} RDV auj.`:'Voir les RDV'}
      </p>
    </button>
  );
}

function TileNotifications({ theme, unreadCount, onClick }) {
  const isDark=theme.mode==='dark'; const [hov,setHov]=useState(false); const hasNew=unreadCount>0;
  return (
    <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={baseTile({ position:'relative',
        background:isDark?(hasNew?'linear-gradient(135deg,rgba(239,68,68,0.18),rgba(239,68,68,0.07))':'rgba(255,255,255,0.04)'):(hasNew?'linear-gradient(135deg,#fef2f2,#fff7f7)':'#fafafa'),
        border:`1px solid ${isDark?(hasNew?'rgba(239,68,68,0.3)':'rgba(255,255,255,0.08)'):(hasNew?'rgba(239,68,68,0.2)':'rgba(0,0,0,0.07)')}`,
        boxShadow:hov?(hasNew?'0 10px 32px rgba(239,68,68,0.18)':'0 4px 16px rgba(0,0,0,0.06)'):'none',
        transform:hov?'translateY(-3px)':'none' })}>
      {hasNew&&(
        <div style={{ position:'absolute',top:-10,right:14,
          background:'linear-gradient(135deg,#ef4444,#f87171)',color:'white',
          fontWeight:900,fontSize:10,borderRadius:99,padding:'3px 8px',
          boxShadow:'0 3px 10px rgba(239,68,68,0.4)',
          border:'2px solid '+(isDark?'#0d1117':'#fff') }}>
          +{unreadCount>99?'99+':unreadCount}
        </div>
      )}
      <div style={{ width:40,height:40,borderRadius:12,
        background:hasNew?'rgba(239,68,68,0.12)':(isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.05)'),
        display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={hasNew?'#ef4444':(isDark?'#9ca3af':'#6b7280')} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:19,height:19}}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      </div>
      <p style={{ fontWeight:800,fontSize:15,color:hasNew?(isDark?'#fca5a5':'#dc2626'):(isDark?'#e5e7eb':'#374151'),margin:'0 0 3px' }}>Notifs</p>
      <p style={{ fontSize:11,fontWeight:500,margin:0,
        color:hasNew?(isDark?'rgba(252,165,165,0.65)':'rgba(220,38,38,0.65)'):(isDark?'#6b7280':'#9ca3af') }}>
        {hasNew?`${unreadCount} nouvelle${unreadCount>1?'s':''}`:'Tout est a jour'}
      </p>
    </button>
  );
}

function TileEncaisser({ theme, onClick }) {
  const [hov,setHov]=useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:16,
        padding:'20px 24px',borderRadius:20,cursor:'pointer',border:'none',width:'100%',
        background:'linear-gradient(135deg,#f59e0b,#f97316)',
        boxShadow:hov?'0 14px 48px rgba(245,158,11,0.5)':'0 8px 32px rgba(245,158,11,0.32)',
        transform:hov?'translateY(-3px)':'none',transition:'transform 0.15s,box-shadow 0.15s' }}>
      <div style={{ width:48,height:48,borderRadius:15,background:'rgba(255,255,255,0.22)',
        display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:24,height:24}}>
          <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </div>
      <div style={{ textAlign:'center' }}>
        <p style={{ fontWeight:900,fontSize:20,color:'white',margin:'0 0 2px',letterSpacing:'-0.02em' }}>Encaisser</p>
        <p style={{ fontSize:12,color:'rgba(255,255,255,0.82)',fontWeight:500,margin:0 }}>Saisie rapide · paiement immédiat</p>
      </div>
    </button>
  );
}

function TileClients({ theme, onClick }) {
  const isDark=theme.mode==='dark'; const [hov,setHov]=useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={baseTile({
        background:isDark?'linear-gradient(135deg,rgba(16,185,129,0.17),rgba(16,185,129,0.07))':'linear-gradient(135deg,#ecfdf5,#f0fdf8)',
        border:`1px solid ${isDark?'rgba(16,185,129,0.28)':'rgba(16,185,129,0.2)'}`,
        boxShadow:hov?'0 10px 32px rgba(16,185,129,0.18)':'0 4px 16px rgba(16,185,129,0.07)',
        transform:hov?'translateY(-3px)':'none' })}>
      <div style={{ width:40,height:40,borderRadius:12,background:'rgba(16,185,129,0.15)',
        display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:19,height:19}}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
      <p style={{ fontWeight:800,fontSize:15,color:isDark?'#6ee7b7':'#047857',margin:'0 0 3px' }}>Clients</p>
      <p style={{ fontSize:11,color:isDark?'rgba(110,231,183,0.65)':'rgba(4,120,87,0.65)',fontWeight:500,margin:0 }}>Gérer la clientèle</p>
    </button>
  );
}

function TileStats({ theme, onClick }) {
  const isDark=theme.mode==='dark'; const [hov,setHov]=useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={baseTile({
        background:isDark?'linear-gradient(135deg,rgba(6,182,212,0.17),rgba(6,182,212,0.07))':'linear-gradient(135deg,#ecfeff,#f0fdff)',
        border:`1px solid ${isDark?'rgba(6,182,212,0.28)':'rgba(6,182,212,0.2)'}`,
        boxShadow:hov?'0 10px 32px rgba(6,182,212,0.18)':'0 4px 16px rgba(6,182,212,0.07)',
        transform:hov?'translateY(-3px)':'none' })}>
      <div style={{ width:40,height:40,borderRadius:12,background:'rgba(6,182,212,0.15)',
        display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:19,height:19}}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      </div>
      <p style={{ fontWeight:800,fontSize:15,color:isDark?'#67e8f9':'#0e7490',margin:'0 0 3px' }}>Stats du jour</p>
      <p style={{ fontSize:11,color:isDark?'rgba(103,232,249,0.65)':'rgba(14,116,144,0.65)',fontWeight:500,margin:0 }}>🔐 Accès PIN</p>
    </button>
  );
}

function TileAdmin({ theme, onClick }) {
  const isDark=theme.mode==='dark'; const [hov,setHov]=useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:12,
        padding:'15px 20px',borderRadius:20,cursor:'pointer',width:'100%',
        background:isDark?'rgba(255,255,255,0.05)':'#ffffff',
        border:`1px solid ${isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.08)'}`,
        boxShadow:hov?'0 6px 24px rgba(0,0,0,0.12)':'0 2px 10px rgba(0,0,0,0.05)',
        transform:hov?'translateY(-2px)':'none',transition:'transform 0.15s,box-shadow 0.15s' }}>
      <svg viewBox="0 0 24 24" fill="none" stroke={isDark?'#9ca3af':'#6b7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}>
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
      <span style={{ fontWeight:800,fontSize:15,color:isDark?'#d1d5db':'#374151',letterSpacing:'0.04em' }}>ADMIN</span>
      <svg viewBox="0 0 24 24" fill="none" stroke={isDark?'#6b7280':'#9ca3af'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13}}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  );
}

// ── Dashboard principal ───────────────────────────────────────────────────────
export default function Dashboard({ transactions, employees, categories, onAdd, onNavigate, unreadNotifCount=0 }) {
  const { theme } = useTheme();
  const isDark    = theme.mode === 'dark';

  const [todayAppts,      setTodayAppts]      = useState([]);
  const [showNotifs,      setShowNotifs]      = useState(false);
  const [showStats,       setShowStats]       = useState(false);
  const [showStatsAccess, setShowStatsAccess] = useState(false);

  const today = todayStr();
  const now   = new Date();

  useEffect(() => {
    bookingApi.getAppointments({ from:today, to:today })
      .then(d => setTodayAppts(Array.isArray(d)?d:[]))
      .catch(()=>{});
  }, [today]);

  const nowMin   = now.getHours()*60+now.getMinutes();
  const upcoming = todayAppts.filter(a => {
    if(a.status!=='confirmed') return false;
    const [h,m] = String(a.start_time||'').substring(0,5).split(':').map(Number);
    return h*60+m > nowMin;
  });

  const dateStr = now.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  const openStats = () => {
    if (employees.filter(e=>e.is_active!==false).length===0) { setShowStats(true); return; }
    setShowStatsAccess(true);
  };

  return (
    <div style={{ minHeight:'100vh', background:isDark?'#0d1117':'#f1f3f8' }}>

      {/* Header */}
      <div style={{ padding:'24px 24px 16px',
        background:isDark?'linear-gradient(180deg,rgba(17,24,39,0.1) 0%,transparent 100%)':'linear-gradient(180deg,rgba(17,24,39,0.04) 0%,transparent 100%)' }}>
        <p style={{ fontSize:11,fontWeight:600,color:isDark?'#4b5563':'#94a3b8',
          textTransform:'capitalize',margin:'0 0 3px' }}>{dateStr}</p>
        <h1 style={{ fontSize:22,fontWeight:900,color:isDark?'#f1f5f9':'#1e293b',
          letterSpacing:'-0.02em',margin:0 }}>Tableau de bord</h1>
      </div>

      {/* Grille tuiles */}
      <div style={{ padding:'0 16px 32px', maxWidth:900, margin:'0 auto' }}>

        {/* Ligne 1 */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <TileAgenda theme={theme} upcomingCount={upcoming.length} onClick={()=>onNavigate?.('agenda')}/>
          <TileNotifications theme={theme} unreadCount={unreadNotifCount} onClick={()=>setShowNotifs(true)}/>
        </div>

        {/* Ligne 2 — Encaisser */}
        <div style={{ marginBottom:12 }}>
          <TileEncaisser theme={theme} onClick={onAdd}/>
        </div>

        {/* Ligne 3 */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <TileClients theme={theme} onClick={()=>onNavigate?.('clients')}/>
          <TileStats   theme={theme} onClick={openStats}/>
        </div>

        {/* Ligne 4 — Admin */}
        <div>
          <TileAdmin theme={theme} onClick={()=>onNavigate?.('settings')}/>
        </div>
      </div>

      <NotifModal open={showNotifs} onClose={()=>setShowNotifs(false)} theme={theme}/>
      <StatsAccessModal open={showStatsAccess} onClose={()=>setShowStatsAccess(false)} onSuccess={()=>setShowStats(true)} employees={employees} theme={theme}/>
      <StatsModal open={showStats} onClose={()=>setShowStats(false)} theme={theme} transactions={transactions} employees={employees} categories={categories}/>
    </div>
  );
}