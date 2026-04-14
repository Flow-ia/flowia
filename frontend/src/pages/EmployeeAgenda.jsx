// src/pages/EmployeeAgenda.jsx — Redesign Stripe/Linear — toutes fonctionnalités préservées
import { useState, useEffect, useCallback, useRef } from 'react';
import { bookingApi, clientNotesApi, clientsApi } from '../utils/api';
import { playSound } from '../hooks/useNotifications';
import { useTheme } from '../hooks/useTheme';
import { Modal, Toast, useToast } from '../components/UI';
import { useEmployeePinGate } from '../components/EmployeePinModal';

/* ─── Constantes ──────────────────────────────────────────────────────────── */
const DAYS_FR    = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const DAYS_FULL  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const MONTHS_FR  = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Decembre'];
const MONTHS_SH  = ['Janv','Fevr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Dec'];

const STATUS_CFG = {
  confirmed: { label:'Confirme',   color:'#22c55e', bg:'rgba(34,197,94,0.1)',   dot:'#22c55e' },
  pending:   { label:'En attente', color:'#f59e0b', bg:'rgba(245,158,11,0.1)',  dot:'#f59e0b' },
  cancelled: { label:'Annule',     color:'#ef4444', bg:'rgba(239,68,68,0.08)',  dot:'#ef4444' },
  completed: { label:'Termine',    color:'#111827', bg:'rgba(17,24,39,0.08)', dot:'#111827' },
  no_show:   { label:'Absent',     color:'#f97316', bg:'rgba(249,115,22,0.08)', dot:'#f97316' },
};
const STATUS_GRID = {
  confirmed: { bg:'rgba(34,197,94,0.08)',   bd:'rgba(34,197,94,0.2)',   tx:'#16a34a' },
  pending:   { bg:'rgba(245,158,11,0.08)',  bd:'rgba(245,158,11,0.2)',  tx:'#d97706' },
  cancelled: { bg:'rgba(239,68,68,0.06)',   bd:'rgba(239,68,68,0.15)',  tx:'#dc2626' },
  completed: { bg:'rgba(17,24,39,0.08)',  bd:'rgba(17,24,39,0.2)',  tx:'#4f46e5' },
  no_show:   { bg:'rgba(249,115,22,0.08)',  bd:'rgba(249,115,22,0.2)',  tx:'#ea580c' },
};
const PAY_OPTIONS = [
  { id:'cash',     label:'Especes',  icon:'💵' },
  { id:'card',     label:'Carte',    icon:'💳' },
  { id:'transfer', label:'Virement', icon:'🏦' },
  { id:'other',    label:'Autre',    icon:'🔄' },
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const fmtTime    = t => t ? String(t).substring(0,5) : '';
const fmtDateFull = d => {
  if (!d) return '';
  const [y,m,day] = d.split('-').map(Number);
  return `${DAYS_FULL[new Date(y,m-1,day).getDay()]} ${day} ${MONTHS_FR[m-1]} ${y}`;
};
const svLocal = d => d.toLocaleDateString('sv-SE');
const toMin   = t => { const [h,m] = String(t||'0:0').split(':').map(Number); return h*60+m; };
const fromMin = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

/* ─── Styles partagés ─────────────────────────────────────────────────────── */
const glassCard = (isDark) => ({
  background: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
  border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
  borderRadius: 16,
  boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.04)',
});
const pillBtn = (active, isDark) => ({
  padding: '6px 14px',
  borderRadius: 99,
  fontSize: 12,
  fontWeight: 700,
  border: `1px solid ${active ? 'transparent' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')}`,
  background: active ? 'linear-gradient(135deg,#111827,#8b5cf6)' : 'transparent',
  color: active ? '#fff' : (isDark ? 'rgba(255,255,255,0.5)' : '#6b7280'),
  cursor: 'pointer',
  transition: 'all .15s',
  whiteSpace: 'nowrap',
});
const chip = (isDark, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600,
  background: color+'18', color,
});

/* ─── Spinner ─────────────────────────────────────────────────────────────── */
function Spin({ size=20 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', border:`2px solid rgba(17,24,39,0.2)`, borderTopColor:'#111827', animation:'spin .7s linear infinite', flexShrink:0 }} />
  );
}

/* ─── Toggle ──────────────────────────────────────────────────────────────── */
function Toggle({ on, onChange }) {
  return (
    <button onClick={onChange} style={{ width:44, height:24, borderRadius:99, position:'relative', background:on?'#111827':'rgba(120,120,140,0.2)', border:'none', cursor:'pointer', transition:'background .2s', flexShrink:0 }}>
      <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left:on?23:3, transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }} />
    </button>
  );
}

/* ─── InfoRow ─────────────────────────────────────────────────────────────── */
function InfoRow({ icon, label, value, t, border }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 20px', borderTop: border ? `1px solid ${t.border}` : 'none' }}>
      <span style={{ fontSize:18, width:26, textAlign:'center', flexShrink:0, opacity:.7 }}>{icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ margin:0, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:t.muted }}>{label}</p>
        <p style={{ margin:'2px 0 0', fontSize:15, fontWeight:600, color:t.text, wordBreak:'break-word' }}>{value||'-'}</p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   EMPLOYEE PICKER — Écran d'accueil
   ════════════════════════════════════════════════════════════════════════════ */
function EmployeePicker({ employees, onSelect, theme: t }) {
  const isDark = t.mode === 'dark';
  const active = employees.filter(e => e.is_active !== false);

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px 20px 96px', background:t.bg }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>

      {/* Hero */}
      <div style={{ textAlign:'center', marginBottom:36 }}>
        <div style={{ width:72, height:72, borderRadius:24, background:'#1a73e8', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', boxShadow:'0 16px 48px rgba(17,24,39,0.3)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:32,height:32}}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <h1 style={{ margin:0, fontSize:26, fontWeight:800, color:t.text, letterSpacing:'-.5px' }}>Mon Agenda</h1>
        <p style={{ margin:'6px 0 0', fontSize:14, color:t.muted }}>Choisissez votre profil</p>
      </div>

      {active.length === 0 ? (
        <div style={{ ...glassCard(isDark), padding:'40px 24px', textAlign:'center', width:'100%', maxWidth:360 }}>
          <p style={{ margin:0, fontSize:14, color:t.muted }}>Aucun employé actif</p>
        </div>
      ) : (
        <div style={{ width:'100%', maxWidth:380, display:'flex', flexDirection:'column', gap:10 }}>
          {active.map((emp, i) => (
            <button key={emp.id} onClick={() => onSelect(emp)}
              style={{ ...glassCard(isDark), width:'100%', padding:'16px 18px', display:'flex', alignItems:'center', gap:14, textAlign:'left', cursor:'pointer', animation:`fadeUp .25s ease ${i*.06}s both`, transition:'transform .15s, box-shadow .15s' }}
              onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow=isDark?'none':'0 1px 4px rgba(0,0,0,0.04)'; }}>

              {/* Avatar */}
              <div style={{ width:48, height:48, borderRadius:14, background:emp.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:20, fontWeight:800, flexShrink:0 }}>
                {emp.name.charAt(0)}
              </div>

              {/* Info */}
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:15, fontWeight:700, color:t.text }}>{emp.name}</p>
                {emp.role && <p style={{ margin:'2px 0 6px', fontSize:12, color:t.muted }}>{emp.role}</p>}
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {emp.can_cancel && <span style={chip(isDark,'#ef4444')}>✕ Annulation</span>}
                  {emp.can_modify && <span style={chip(isDark,'#8b5cf6')}>✎ Modification</span>}
                  {emp.can_encash && <span style={chip(isDark,'#22c55e')}>$ Encaissement</span>}
                  {!emp.can_cancel && !emp.can_modify && !emp.can_encash && (
                    <span style={chip(isDark, isDark?'#64748b':'#94a3b8')}>👁 Consultation</span>
                  )}
                </div>
              </div>

              {/* Chevron */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:16, height:16, color:t.muted, flexShrink:0 }}><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   APPT ACTION MODAL — Détails + actions selon droits
   ════════════════════════════════════════════════════════════════════════════ */
function ApptActionModal({ appt: initAppt, employee, services, onUpdated, onClose, onTxCreated, theme: t }) {
  const isDark = t.mode === 'dark';
  const [appt, setAppt]     = useState(initAppt);
  const [tab, setTab]       = useState('detail');
  const [saving, setSaving] = useState(false);
  const { requestPin, PinModalNode } = useEmployeePinGate();

  const [editForm, setEditForm] = useState({
    date: appt.date||'', start_time: fmtTime(appt.start_time),
    client_name: appt.client_name||'', client_email: appt.client_email||'',
    client_phone: appt.client_phone||'', notes: appt.notes||'',
  });
  const setE = (k,v) => setEditForm(p=>({...p,[k]:v}));

  const [cancelReason,  setCancelReason]  = useState('');
  const [cancelNotify,  setCancelNotify]  = useState(true);
  const [payMethod,     setPayMethod]     = useState('card');

  const st       = STATUS_CFG[appt.status]||STATUS_CFG.confirmed;
  const canAct   = appt.status !== 'cancelled' && appt.status !== 'completed';
  const canModify = !employee || employee.can_modify;
  const canCancel = !employee || employee.can_cancel;
  const canEncash = !employee || employee.can_encash;
  const basePrice = parseFloat(appt.total_amount)||parseFloat(appt.service_price)||0;
  const [checkAmt, setCheckAmt] = useState(basePrice>0 ? basePrice.toFixed(2) : '');
  const finalAmt  = parseFloat(checkAmt)||0;

  const TABS = [
    { id:'detail',   label:'Details', icon:'📋' },
    canModify && canAct ? { id:'edit',     label:'Modifier',  icon:'✏️' } : null,
    canCancel && canAct ? { id:'cancel',   label:'Annuler',   icon:'✕' }  : null,
    canEncash && !appt.paid && canAct ? { id:'checkout', label:'Encaisser', icon:'💰' } : null,
  ].filter(Boolean);

  const IS = { background:isDark?'rgba(255,255,255,0.05)':'#f4f4f6', border:`1px solid ${isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.08)'}`, color:t.text };

  const doEdit = async () => {
    setSaving(true);
    try {
      const dur = appt.total_duration||appt.duration_minutes||30;
      const end = fromMin(toMin(editForm.start_time)+dur);
      const upd = await bookingApi.updateAppt(appt.id, { date:editForm.date, start_time:editForm.start_time, end_time:end, client_name:editForm.client_name, client_email:editForm.client_email||null, client_phone:editForm.client_phone||null, notes:editForm.notes||null });
      const merged = {...appt,...upd}; setAppt(merged); onUpdated(merged); setTab('detail');
    } catch(e) { alert(e.message); } finally { setSaving(false); }
  };

  const doCancel = async () => {
    setSaving(true);
    try {
      const upd = await bookingApi.updateAppt(appt.id, { status:'cancelled', cancel_reason:cancelReason||null, notify_client:cancelNotify&&!!appt.client_email });
      const merged = {...appt,...upd, status:'cancelled', cancel_reason:cancelReason};
      setAppt(merged); onUpdated(merged); setTab('detail');
    } catch(e) { alert(e.message); } finally { setSaving(false); }
  };

  const doCheckout = async () => {
    await requestPin(
      employee || null,
      'Encaisser le rendez-vous',
      async () => {
        setSaving(true);
        try {
          const payload = { payment_method:payMethod, amount:finalAmt };
          if (employee) payload.employee_id = employee.id;
          const res = await bookingApi.checkoutAppt(appt.id, payload);
          const merged = {...appt, status:'completed', paid:true, paid_method:payMethod};
          setAppt(merged); onUpdated(merged);
          if (res.transaction) onTxCreated(res.transaction);
          setTab('detail');
        } catch(e) { alert(e.message); } finally { setSaving(false); }
      }
    );
  };

  return (
    <>
    <Modal open={true} onClose={onClose} title="" theme={t} maxW={520}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header compact */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:st.dot, flexShrink:0 }} />
          <span style={{ fontSize:20, fontWeight:900, color:t.text }}>{appt.client_name}</span>
          <span style={{ fontSize:13, fontWeight:700, padding:'4px 10px', borderRadius:99, background:st.bg, color:st.color }}>{st.label}</span>
        </div>
        <span style={{ fontSize:11, fontFamily:'monospace', color:t.muted }}>#{(appt.id||'').substring(0,8).toUpperCase()}</span>
      </div>

      {/* Tab bar */}
      {TABS.length > 1 && (
        <div style={{ display:'flex', gap:4, marginBottom:20, background:isDark?'rgba(255,255,255,0.05)':'#f0f0f2', padding:4, borderRadius:12 }}>
          {TABS.map(tb => (
            <button key={tb.id} onClick={()=>setTab(tb.id)} style={{
              flex:1, padding:'10px 4px', borderRadius:9, border:'none', cursor:'pointer', fontSize:13, fontWeight:700, transition:'all .15s',
              background: tab===tb.id ? (tb.id==='cancel' ? '#fef2f2' : tb.id==='checkout' ? '#f0fdf4' : (isDark?'rgba(17,24,39,0.3)':'#fff')) : 'transparent',
              color: tab===tb.id ? (tb.id==='cancel'?'#dc2626' : tb.id==='checkout'?'#16a34a' : '#111827') : (isDark?'rgba(255,255,255,0.4)':'#9ca3af'),
              boxShadow: tab===tb.id && !['cancel','checkout'].includes(tb.id) ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
              {tb.icon} {tb.label}
            </button>
          ))}
        </div>
      )}

      {/* ── DETAIL ── */}
      {tab==='detail' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Horaire card */}
          <div style={{ ...glassCard(isDark), overflow:'hidden' }}>
            <InfoRow icon="📅" label="Date"  value={fmtDateFull(appt.date)} t={t} />
            <InfoRow icon="🕐" label="Heure" value={`${fmtTime(appt.start_time)} - ${fmtTime(appt.end_time)}`} t={t} border />

            {appt.items && appt.items.length > 0 ? (
              <>
                <div style={{ padding:'8px 16px 4px', borderTop:`1px solid ${t.border}`, background:isDark?'rgba(17,24,39,0.06)':'rgba(17,24,39,0.03)' }}>
                  <p style={{ margin:0, fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.06em', color:'#111827' }}>Services</p>
                </div>
                {appt.items.map((it,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderTop:`1px solid ${t.border}` }}>
                    <div>
                      <p style={{ margin:0, fontSize:15, fontWeight:700, color:t.text }}>{it.service_name}{(it.qty||1)>1 && <span style={{ marginLeft:6, fontSize:11, fontWeight:700, padding:'1px 6px', borderRadius:99, background:'rgba(17,24,39,0.12)', color:'#111827' }}>×{it.qty}</span>}</p>
                      <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>{it.duration_minutes}min{(it.qty||1)>1?` · ${it.duration_minutes*(it.qty||1)}min total`:''}</p>
                    </div>
                    {(it.unit_price||0)>0 && <span style={{ fontSize:13, fontWeight:700, color:'#10b981' }}>{(parseFloat(it.unit_price)*(it.qty||1)).toFixed(2)} €</span>}
                  </div>
                ))}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderTop:`1px solid ${t.border}`, background:isDark?'rgba(16,185,129,0.05)':'rgba(16,185,129,0.03)' }}>
                  <p style={{ margin:0, fontSize:11, fontWeight:800, textTransform:'uppercase', color:'#10b981' }}>Total</p>
                  <p style={{ margin:0, fontSize:15, fontWeight:800, color:'#10b981', fontFamily:'monospace' }}>
                    {parseFloat(appt.total_amount||0)>0 ? parseFloat(appt.total_amount).toFixed(2) : appt.items.reduce((s,it)=>s+parseFloat(it.unit_price||0)*(it.qty||1),0).toFixed(2)} €
                  </p>
                </div>
                {appt.discount_amount>0 && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderTop:`1px solid rgba(16,185,129,0.12)`, background:'rgba(16,185,129,0.04)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:14 }}>🎉</span>
                      <div>
                        <p style={{ margin:0, fontSize:11, fontWeight:700, color:'#10b981' }}>Code promo</p>
                        {appt.promo_code && <p style={{ margin:0, fontSize:10, color:t.muted, fontFamily:'monospace' }}>{appt.promo_code}</p>}
                      </div>
                    </div>
                    <span style={{ fontSize:12, fontWeight:800, color:'#ef4444', background:'rgba(239,68,68,0.08)', padding:'3px 10px', borderRadius:99 }}>-{parseFloat(appt.discount_amount).toFixed(2)} €</span>
                  </div>
                )}
              </>
            ) : (
              <InfoRow icon="✂️" label="Service" value={`${appt.service_name||'-'} · ${appt.total_duration||appt.duration_minutes}min${basePrice>0?' · '+basePrice.toFixed(2)+' €':''}`} t={t} border />
            )}
          </div>

          {/* Client card */}
          <div style={{ ...glassCard(isDark), overflow:'hidden' }}>
            <InfoRow icon="👤" label="Client"    value={appt.client_name} t={t} />
            {appt.client_phone && <InfoRow icon="📞" label="Téléphone" value={appt.client_phone} t={t} border />}
            {appt.client_email && <InfoRow icon="✉️" label="Email"     value={appt.client_email} t={t} border />}
          </div>

          {appt.notes && (
            <div style={{ padding:'12px 16px', borderRadius:12, background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.15)' }}>
              <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#f59e0b' }}>Notes</p>
              <p style={{ margin:0, fontSize:13, color:t.text, lineHeight:1.5 }}>{appt.notes}</p>
            </div>
          )}
          {appt.cancel_reason && (
            <div style={{ padding:'12px 16px', borderRadius:12, background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.12)' }}>
              <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#ef4444' }}>Motif d'annulation</p>
              <p style={{ margin:0, fontSize:13, color:t.text }}>{appt.cancel_reason}</p>
            </div>
          )}
          {appt.paid && (
            <div style={{ padding:'12px 16px', borderRadius:12, display:'flex', alignItems:'center', gap:12, background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.15)' }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(34,197,94,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>✅</div>
              <div>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#16a34a' }}>Encaissé</p>
                <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>{PAY_OPTIONS.find(p=>p.id===appt.paid_method)?.label||appt.paid_method} · Source : RDV</p>
              </div>
            </div>
          )}
          {TABS.length===1 && employee && (
            <div style={{ padding:'10px 14px', borderRadius:10, display:'flex', alignItems:'center', gap:8, background:isDark?'rgba(255,255,255,0.03)':'#f9f9fb', border:`1px solid ${t.border}` }}>
              <span style={{ fontSize:14 }}>🔒</span>
              <p style={{ margin:0, fontSize:12, color:t.muted }}>Mode consultation — aucune action autorisée pour votre profil</p>
            </div>
          )}
        </div>
      )}

      {/* ── MODIFIER ── */}
      {tab==='edit' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:6 }}>Date *</label>
              <input type="date" value={editForm.date} onChange={e=>setE('date',e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:6 }}>Heure *</label>
              <input type="time" value={editForm.start_time} onChange={e=>setE('start_time',e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
            </div>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:6 }}>Nom client</label>
            <input value={editForm.client_name} onChange={e=>setE('client_name',e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:6 }}>Téléphone</label>
              <input value={editForm.client_phone} onChange={e=>setE('client_phone',e.target.value)} placeholder="06…" className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:6 }}>Email</label>
              <input type="email" value={editForm.client_email} onChange={e=>setE('client_email',e.target.value)} placeholder="email@…" className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
            </div>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:6 }}>Notes</label>
            <textarea value={editForm.notes} onChange={e=>setE('notes',e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none resize-none" style={IS} />
          </div>
          <button disabled={saving||!editForm.client_name.trim()} onClick={doEdit}
            className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-40"
            style={{ background:'#1a73e8' }}>
            {saving ? <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><Spin size={16}/>Enregistrement...</span> : '✅ Enregistrer'}
          </button>
        </div>
      )}

      {/* ── ANNULER ── */}
      {tab==='cancel' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ padding:'14px 16px', borderRadius:12, background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.12)' }}>
            <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#dc2626' }}>Annuler ce rendez-vous ?</p>
            <p style={{ margin:'4px 0 0', fontSize:12, color:t.muted }}>{appt.client_name} · {fmtDateFull(appt.date)} à {fmtTime(appt.start_time)}</p>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:t.muted, marginBottom:6 }}>Motif (facultatif)</label>
            <textarea value={cancelReason} onChange={e=>setCancelReason(e.target.value)} rows={3} placeholder="Raison de l'annulation…" className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none resize-none" style={IS} />
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderRadius:12, background:isDark?'rgba(255,255,255,0.03)':'#f9f9fb', border:`1px solid ${t.border}` }}>
            <div>
              <p style={{ margin:0, fontSize:13, fontWeight:600, color:t.text }}>Notifier le client</p>
              <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>{appt.client_email?`→ ${appt.client_email}`:'Aucun email renseigne'}</p>
            </div>
            <Toggle on={cancelNotify&&!!appt.client_email} onChange={()=>setCancelNotify(p=>!p)} />
          </div>
          {cancelNotify && appt.client_email && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:10, background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.15)' }}>
              <span style={{fontSize:14}}>📧</span>
              <p style={{ margin:0, fontSize:12, color:'#d97706' }}>Email d'annulation envoyé à {appt.client_email}</p>
            </div>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>setTab('detail')} style={{ flex:1, padding:'12px', borderRadius:12, background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6', border:`1px solid ${t.border}`, color:t.muted, fontWeight:700, fontSize:13, cursor:'pointer' }}>Retour</button>
            <button onClick={doCancel} disabled={saving} style={{ flex:1, padding:'12px', borderRadius:12, background:'linear-gradient(135deg,#ef4444,#dc2626)', color:'#fff', fontWeight:700, fontSize:13, border:'none', cursor:'pointer', opacity:saving?.5:1 }}>
              {saving ? 'Annulation...' : 'Confirmer'}
            </button>
          </div>
        </div>
      )}

      {/* ── ENCAISSER ── */}
      {tab==='checkout' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Récap */}
          <div style={{ ...glassCard(isDark), overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:isDark?'rgba(255,255,255,0.03)':'#fafafa', borderBottom:`1px solid ${t.border}` }}>
              <span style={{ fontSize:11, fontWeight:700, color:t.muted, textTransform:'uppercase' }}>Client</span>
              <span style={{ fontSize:20, fontWeight:900, color:t.text }}>{appt.client_name}</span>
            </div>
            {appt.items && appt.items.length > 0 ? (
              <>
                {appt.items.map((it,i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderTop:`1px solid ${t.border}` }}>
                    <div>
                      <p style={{ margin:0, fontSize:15, fontWeight:700, color:t.text }}>{it.service_name}{(it.qty||1)>1&&<span style={{marginLeft:4,fontSize:11}}>×{it.qty}</span>}</p>
                      <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>{(it.duration_minutes||0)*(it.qty||1)}min</p>
                    </div>
                    {(it.unit_price||0)>0&&<span style={{fontSize:13,fontWeight:700,color:'#10b981'}}>{(parseFloat(it.unit_price)*(it.qty||1)).toFixed(2)} €</span>}
                  </div>
                ))}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderTop:`1px solid ${t.border}`, background:isDark?'rgba(16,185,129,0.04)':'rgba(16,185,129,0.02)' }}>
                  <span style={{fontSize:11,fontWeight:700,color:'#10b981',textTransform:'uppercase'}}>Total</span>
                  <span style={{fontSize:14,fontWeight:800,color:'#10b981',fontFamily:'monospace'}}>{basePrice.toFixed(2)} €</span>
                </div>
              </>
            ) : (
              <div style={{padding:'10px 16px',borderTop:`1px solid ${t.border}`}}>
                <p style={{margin:0,fontSize:13,color:t.text}}>{appt.service_name||'-'}</p>
              </div>
            )}
          </div>

          {/* Montant */}
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <p style={{margin:0,fontSize:11,fontWeight:700,color:t.muted,textTransform:'uppercase'}}>Montant à encaisser</p>
              {basePrice>0 && checkAmt!==basePrice.toFixed(2) && (
                <button onClick={()=>setCheckAmt(basePrice.toFixed(2))} style={{fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:99,background:'rgba(17,24,39,0.1)',color:'#111827',border:'none',cursor:'pointer'}}>
                  ↺ Reset {basePrice.toFixed(2)} €
                </button>
              )}
            </div>
            <div style={{position:'relative'}}>
              <input type="number" step="0.01" min="0" value={checkAmt} onChange={e=>setCheckAmt(e.target.value)} placeholder="0.00"
                style={{ width:'100%', padding:'20px 48px 20px 20px', fontSize:40, fontWeight:800, fontFamily:'monospace', textAlign:'center', background:isDark?'rgba(34,197,94,0.06)':'rgba(34,197,94,0.04)', border:'1.5px solid rgba(34,197,94,0.25)', borderRadius:16, color:'#16a34a', outline:'none', boxSizing:'border-box' }} />
              <span style={{position:'absolute',right:18,top:'50%',transform:'translateY(-50%)',fontSize:22,fontWeight:800,color:'rgba(34,197,94,0.4)',pointerEvents:'none'}}>€</span>
            </div>
            {checkAmt!==''&&basePrice>0&&parseFloat(checkAmt)!==basePrice&&(
              <p style={{margin:'6px 0 0',fontSize:11,textAlign:'center',color:'#f59e0b',fontWeight:600}}>⚡ Montant modifié — base : {basePrice.toFixed(2)} €</p>
            )}
          </div>

          {/* Mode paiement */}
          <div>
            <p style={{margin:'0 0 8px',fontSize:11,fontWeight:700,color:t.muted,textTransform:'uppercase'}}>Mode de paiement</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {PAY_OPTIONS.map(p=>(
                <button key={p.id} onClick={()=>setPayMethod(p.id)} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:12, fontWeight:700, fontSize:13, cursor:'pointer', transition:'all .15s',
                  background: payMethod===p.id ? 'rgba(34,197,94,0.08)' : (isDark?'rgba(255,255,255,0.03)':'#fafafa'),
                  border: `1.5px solid ${payMethod===p.id?'rgba(34,197,94,0.3)':t.border}`,
                  color: payMethod===p.id ? '#16a34a' : t.muted,
                }}>
                  <span style={{fontSize:18}}>{p.icon}</span>{p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{padding:'10px 14px',borderRadius:10,background:isDark?'rgba(255,255,255,0.03)':'#f9f9fb',border:`1px solid ${t.border}`}}>
            <p style={{margin:0,fontSize:12,color:t.muted}}>✅ La transaction sera ajoutée dans la <strong style={{color:t.text}}>Caisse</strong> avec la source <strong style={{color:t.text}}>RDV</strong>.</p>
          </div>

          <button onClick={doCheckout} disabled={saving||finalAmt<0}
            style={{ padding:'16px', borderRadius:14, background:'linear-gradient(135deg,#22c55e,#16a34a)', color:'#fff', fontSize:16, fontWeight:800, border:'none', cursor:'pointer', boxShadow:'0 8px 24px rgba(34,197,94,0.25)', opacity:saving||finalAmt<0?.5:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {saving ? <><Spin size={18}/>Encaissement…</> : `💰 Encaisser${finalAmt>0?' - '+finalAmt.toFixed(2)+' €':''}`}
          </button>
        </div>
      )}
    </Modal>
    {PinModalNode}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   APPT CARD — Carte RDV dans la liste
   ════════════════════════════════════════════════════════════════════════════ */
function ApptCard({ appt, onClick, theme: t }) {
  const isDark = t.mode === 'dark';
  const st = STATUS_CFG[appt.status]||STATUS_CFG.confirmed;
  const [hov, setHov] = useState(false);

  return (
    <button onClick={() => onClick(appt)} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ width:'100%', textAlign:'left', ...glassCard(isDark), padding:'18px 20px', display:'flex', alignItems:'flex-start', gap:14, cursor:'pointer', transform:hov?'translateY(-1px)':'none', transition:'transform .15s, box-shadow .15s', boxShadow:hov?'0 6px 20px rgba(0,0,0,0.08)':(isDark?'none':'0 1px 4px rgba(0,0,0,0.04)'), border:'none' }}>

      {/* Barre couleur */}
      <div style={{ width:3, alignSelf:'stretch', borderRadius:99, background:appt.service_color||appt.employee_color||'#111827', minHeight:40, flexShrink:0 }} />

      {/* Contenu */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:4 }}>
          <span style={{ fontSize:16, fontWeight:800, color:t.text, letterSpacing:'-.3px' }}>{fmtTime(appt.start_time)} — {fmtTime(appt.end_time)}</span>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            {appt.paid && <span style={chip(isDark,'#22c55e')}>✓ Payé</span>}
            <span style={{ ...chip(isDark, st.color), padding:'3px 8px' }}>{st.label}</span>
          </div>
        </div>
        <p style={{ margin:0, fontSize:15, fontWeight:700, color:t.text }}>{appt.client_name}</p>

        {appt.items && appt.items.length > 1 ? (
          <div style={{ marginTop:4 }}>
            {appt.items.map((it,i) => (
              <p key={i} style={{ margin:'1px 0', fontSize:11, color:t.muted }}>
                {it.service_name}{it.qty>1?` ×${it.qty}`:''} · {it.duration_minutes*(it.qty||1)}min{it.unit_price>0?` · ${(it.unit_price*(it.qty||1)).toFixed(2)} €`:''}
              </p>
            ))}
            <p style={{ margin:'3px 0 0', fontSize:11, fontWeight:700, color:'#10b981' }}>
              Total : {appt.total_duration||appt.duration_minutes}min{appt.total_amount>0?` · ${parseFloat(appt.total_amount).toFixed(2)} €`:''}
            </p>
          </div>
        ) : (
          <p style={{ margin:'3px 0 0', fontSize:13, color:t.muted }}>
            {appt.items?.length===1?appt.items[0].service_name:(appt.service_name||'Service')} · {appt.total_duration||appt.duration_minutes}min
            {appt.total_amount>0?` · ${parseFloat(appt.total_amount).toFixed(2)} €`:(appt.service_price?` · ${parseFloat(appt.service_price).toFixed(2)} €`:'')}
          </p>
        )}

        {appt.client_phone && <p style={{ margin:'4px 0 0', fontSize:13, color:t.muted }}>{appt.client_phone}</p>}
        {appt.employee_name && (
          <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:4 }}>
            <div style={{ width:12, height:12, borderRadius:'50%', background:appt.employee_color||'#111827', flexShrink:0 }} />
            <p style={{ margin:0, fontSize:10, color:t.dim }}>{appt.employee_name}</p>
          </div>
        )}
        <p style={{ margin:'4px 0 0', fontSize:10, fontFamily:'monospace', color:t.dim }}>#{(appt.id||'').substring(0,8).toUpperCase()}</p>
      </div>

      {/* Chevron */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14,color:t.muted,flexShrink:0,marginTop:4}}><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   NEW APPT MODAL — Multi-services / cart
   ════════════════════════════════════════════════════════════════════════════ */
function NewApptModal({ empId, services, onSave, onClose, theme: t }) {
  const isDark = t.mode === 'dark';
  const IS     = { background:isDark?'rgba(255,255,255,0.05)':'#f4f4f6', border:`1px solid ${isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.08)'}`, color:t.text };

  const [client, setClient] = useState({ name:'', email:'', phone:'', date:svLocal(new Date()), start_time:'09:00', notes:'' });
  const setC  = (k,v) => setClient(p=>({...p,[k]:v}));
  const [cart, setCart]               = useState([]);
  const [customDuration, setCustomDuration] = useState('');
  const [saving, setSaving]           = useState(false);

  const actSvcs    = (services||[]).filter(s=>s.is_active!==false);
  const autoTotal    = cart.reduce((s,it)=>s+it.unit_price*it.qty,0);
  const autoDuration = cart.reduce((s,it)=>s+it.duration_minutes*it.qty,0);
  const totalDuration = customDuration!=='' ? parseInt(customDuration)||0 : autoDuration;
  const endTime = client.start_time && totalDuration>0 ? fromMin(toMin(client.start_time)+totalDuration) : '';

  const addSvc = svc => setCart(p=>{ const i=p.findIndex(x=>x.service_id===svc.id); if(i>=0){const n=[...p];n[i]={...n[i],qty:n[i].qty+1};return n;} return [...p,{service_id:svc.id,service_name:svc.name,qty:1,unit_price:parseFloat(svc.price)||0,duration_minutes:svc.duration_minutes||0,color:svc.color||'#111827'}]; });
  const changeQty = (i,d) => setCart(p=>{ const n=[...p]; const q=(n[i].qty||1)+d; if(q<=0)return p.filter((_,j)=>j!==i); n[i]={...n[i],qty:q}; return n; });
  const setPrice  = (i,v) => setCart(p=>{ const n=[...p]; n[i]={...n[i],unit_price:parseFloat(v)||0}; return n; });

  const handleSave = async () => {
    if (!client.name.trim()||!client.date||!client.start_time) return;
    setSaving(true);
    try {
      await onSave({ employee_id:empId, client_name:client.name, client_email:client.email||null, client_phone:client.phone||null, date:client.date, start_time:client.start_time, notes:client.notes||null, items:cart, total_amount:autoTotal, total_duration:totalDuration, custom_duration:customDuration!==''?parseInt(customDuration)||0:null });
      onClose();
    } catch(e){ alert(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal open={true} onClose={onClose} title="Nouveau rendez-vous" theme={t}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{display:'flex',flexDirection:'column',gap:16}}>

        {/* Client */}
        <div style={{...glassCard(isDark),overflow:'hidden'}}>
          <div style={{padding:'8px 16px',background:isDark?'rgba(17,24,39,0.08)':'rgba(17,24,39,0.04)',borderBottom:`1px solid ${t.border}`}}>
            <p style={{margin:0,fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:'#111827'}}>👤 Client</p>
          </div>
          <div style={{padding:12,display:'flex',flexDirection:'column',gap:8}}>
            <input value={client.name} onChange={e=>setC('name',e.target.value)} placeholder="Prénom Nom *" className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <input value={client.phone} onChange={e=>setC('phone',e.target.value)} placeholder="📞 Téléphone" className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
              <input type="email" value={client.email} onChange={e=>setC('email',e.target.value)} placeholder="✉️ Email" className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
            </div>
            {client.email && (
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:10,background:'rgba(34,197,94,0.06)',border:'1px solid rgba(34,197,94,0.12)'}}>
                <span style={{fontSize:12}}>📧</span><p style={{margin:0,fontSize:12,color:'#16a34a'}}>Confirmation envoyée automatiquement</p>
              </div>
            )}
          </div>
        </div>

        {/* Services */}
        <div style={{...glassCard(isDark),overflow:'hidden'}}>
          <div style={{padding:'8px 16px',background:isDark?'rgba(17,24,39,0.08)':'rgba(17,24,39,0.04)',borderBottom:`1px solid ${t.border}`}}>
            <p style={{margin:0,fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:'#111827'}}>✂️ Services / Produits</p>
          </div>
          {actSvcs.length>0 ? (
            <div style={{padding:12}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {actSvcs.map(svc=>{
                  const inCart = cart.find(it=>it.service_id===svc.id);
                  return (
                    <button key={svc.id} onClick={()=>addSvc(svc)} style={{
                      borderRadius:12, padding:12, textAlign:'left', cursor:'pointer', transition:'all .15s',
                      background:inCart?'rgba(17,24,39,0.1)':(isDark?'rgba(255,255,255,0.03)':'#fafafa'),
                      border:`1.5px solid ${inCart?'rgba(17,24,39,0.35)':t.border}`,
                    }}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                        <div style={{width:24,height:24,borderRadius:8,background:svc.color||'#111827',flexShrink:0}} />
                        <p style={{margin:0,fontSize:12,fontWeight:700,color:t.text,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{svc.name}</p>
                        {inCart && <span style={{fontSize:10,fontWeight:800,padding:'1px 6px',borderRadius:99,background:'rgba(17,24,39,0.15)',color:'#111827',flexShrink:0}}>×{inCart.qty}</span>}
                      </div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <span style={{fontSize:10,color:t.muted}}>{svc.duration_minutes}min</span>
                        {parseFloat(svc.price)>0&&<span style={{fontSize:10,fontWeight:700,color:'#10b981'}}>{parseFloat(svc.price).toFixed(2)} €</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{padding:'16px',textAlign:'center'}}><p style={{margin:0,fontSize:13,color:t.muted}}>Aucun service actif configuré.</p></div>
          )}

          {cart.length>0 && (
            <div style={{padding:'0 12px 12px',display:'flex',flexDirection:'column',gap:8}}>
              <div style={{height:1,background:t.border,margin:'4px 0'}} />
              {cart.map((it,idx)=>(
                <div key={idx} style={{...glassCard(isDark),padding:12}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:3,height:32,borderRadius:99,background:it.color||'#111827',flexShrink:0}} />
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{margin:0,fontSize:12,fontWeight:700,color:t.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{it.service_name}</p>
                      <p style={{margin:'1px 0 0',fontSize:10,color:t.muted}}>{it.duration_minutes}min/unité</p>
                    </div>
                    {/* Prix édit */}
                    <div style={{position:'relative',width:80}}>
                      <input type="number" step="0.01" min="0" value={it.unit_price} onChange={e=>setPrice(idx,e.target.value)} style={{width:'100%',padding:'6px 20px 6px 8px',borderRadius:8,textAlign:'right',fontSize:13,fontWeight:700,color:'#10b981',background:isDark?'rgba(255,255,255,0.05)':'#f0fdf4',border:'1px solid rgba(16,185,129,0.2)',outline:'none',boxSizing:'border-box'}} />
                      <span style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',fontSize:10,color:t.muted,pointerEvents:'none'}}>€</span>
                    </div>
                    {/* Qty */}
                    <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                      <button onClick={()=>changeQty(idx,-1)} style={{width:26,height:26,borderRadius:8,background:'rgba(239,68,68,0.1)',color:'#ef4444',border:'none',cursor:'pointer',fontWeight:800,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                      <span style={{width:20,textAlign:'center',fontSize:13,fontWeight:700,color:t.text}}>{it.qty}</span>
                      <button onClick={()=>changeQty(idx,1)}  style={{width:26,height:26,borderRadius:8,background:'rgba(17,24,39,0.1)',color:'#111827',border:'none',cursor:'pointer',fontWeight:800,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                    </div>
                    <button onClick={()=>setCart(p=>p.filter((_,i)=>i!==idx))} style={{width:26,height:26,borderRadius:8,background:'rgba(239,68,68,0.08)',border:'none',cursor:'pointer',color:'#ef4444',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>🗑</button>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:8,paddingTop:8,borderTop:`1px solid ${t.border}`}}>
                    <span style={{fontSize:11,color:t.muted}}>{it.duration_minutes*it.qty}min total</span>
                    <span style={{fontSize:12,fontWeight:700,color:'#10b981'}}>{(it.unit_price*it.qty).toFixed(2)} €</span>
                  </div>
                </div>
              ))}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderRadius:12,background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.15)'}}>
                <p style={{margin:0,fontSize:11,fontWeight:800,textTransform:'uppercase',color:'#10b981'}}>TOTAL</p>
                <p style={{margin:0,fontSize:18,fontWeight:800,color:'#10b981',fontFamily:'monospace'}}>{autoTotal.toFixed(2)} €</p>
              </div>
            </div>
          )}
        </div>

        {/* Horaire */}
        <div style={{...glassCard(isDark),overflow:'hidden'}}>
          <div style={{padding:'8px 16px',background:isDark?'rgba(245,158,11,0.08)':'rgba(245,158,11,0.04)',borderBottom:`1px solid ${t.border}`}}>
            <p style={{margin:0,fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:'#f59e0b'}}>🕐 Horaire</p>
          </div>
          <div style={{padding:12,display:'flex',flexDirection:'column',gap:10}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:t.muted,marginBottom:5}}>Date *</label>
                <input type="date" value={client.date} onChange={e=>setC('date',e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
              </div>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:t.muted,marginBottom:5}}>Début *</label>
                <input type="time" value={client.start_time} onChange={e=>setC('start_time',e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={IS} />
              </div>
            </div>
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5}}>
                <label style={{fontSize:11,fontWeight:700,color:t.muted}}>
                  Durée{autoDuration>0&&customDuration===''&&<span style={{fontWeight:400,color:'#10b981',marginLeft:6}}>(auto : {autoDuration}min)</span>}
                </label>
                {customDuration!=='' && (
                  <button onClick={()=>setCustomDuration('')} style={{fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:99,background:'rgba(17,24,39,0.1)',color:'#111827',border:'none',cursor:'pointer'}}>↺ Auto ({autoDuration}min)</button>
                )}
              </div>
              <div style={{position:'relative'}}>
                <input type="number" min="1" step="5" value={customDuration!==''?customDuration:(autoDuration>0?String(autoDuration):'')} onChange={e=>setCustomDuration(e.target.value)} placeholder={autoDuration>0?String(autoDuration):'30'} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={{...IS,paddingRight:42}} />
                <span style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',fontSize:12,fontWeight:700,color:t.muted,pointerEvents:'none'}}>min</span>
              </div>
            </div>
            {endTime && (
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:10,background:'rgba(17,24,39,0.06)',border:'1px solid rgba(17,24,39,0.12)'}}>
                <span style={{fontSize:13}}>🏁</span>
                <p style={{margin:0,fontSize:12,fontWeight:600,color:'#111827'}}>Fin prévue à <strong>{endTime}</strong> ({totalDuration}min)</p>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label style={{display:'block',fontSize:11,fontWeight:700,color:t.muted,marginBottom:6}}>Notes</label>
          <textarea value={client.notes} onChange={e=>setC('notes',e.target.value)} rows={2} placeholder="Informations…" className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none resize-none" style={IS} />
        </div>

        <button disabled={!client.name.trim()||!client.date||!client.start_time||saving} onClick={handleSave}
          style={{ padding:'16px', borderRadius:14, background:'#1a73e8', color:'#fff', fontSize:15, fontWeight:800, border:'none', cursor:'pointer', opacity:(!client.name.trim()||saving)?.45:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 16px rgba(17,24,39,0.3)' }}>
          {saving ? <><Spin size={18}/>Enregistrement…</> : `✅ Creer${autoTotal>0?' - '+autoTotal.toFixed(2)+' €':''}`}
        </button>
        {cart.length===0 && <p style={{margin:'-8px 0 0',fontSize:11,textAlign:'center',color:t.muted}}>Aucun service sélectionné (facultatif)</p>}
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   EMP AGENDA MAIN — Vue individuelle (semaine + liste + clients)
   ════════════════════════════════════════════════════════════════════════════ */
function EmpAgendaMain({ employee, services, allEmployees, onBack, onTxCreated, theme: t }) {
  const isDark = t.mode === 'dark';
  const [toast, showToast]             = useToast();
  const [weekOffset, setWeekOffset]    = useState(0);
  const [selectedDate, setSelectedDate]= useState(new Date());
  const [allAppts, setAllAppts]        = useState([]);
  const [loading, setLoading]          = useState(false);
  const [detailAppt, setDetailAppt]    = useState(null);
  const [newApptOpen, setNewApptOpen]  = useState(false);
  const [searchQ, setSearchQ]          = useState('');
  const [filterEmpId, setFilterEmpId]  = useState(employee.id);
  const [mainTab, setMainTab]          = useState('agenda');
  const refreshRef = useRef(null);

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate()-((today.getDay()+6)%7)+weekOffset*7);
  const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(startOfWeek); d.setDate(startOfWeek.getDate()+i); return d; });
  const weekFrom = svLocal(weekDays[0]);
  const weekTo   = svLocal(weekDays[6]);

  const loadAppts = useCallback(async() => {
    setLoading(true);
    try {
      if (filterEmpId && filterEmpId!=='all') {
        const data = await bookingApi.getEmployeeAgenda(filterEmpId, {from:weekFrom,to:weekTo});
        setAllAppts(Array.isArray(data?.appointments)?data.appointments:[]);
      } else {
        const data = await bookingApi.getAppointments({from:weekFrom,to:weekTo});
        setAllAppts(Array.isArray(data)?data:[]);
      }
    } catch {} finally { setLoading(false); }
  }, [weekFrom, weekTo, filterEmpId]);

  useEffect(()=>{ loadAppts(); clearInterval(refreshRef.current); refreshRef.current=setInterval(loadAppts,30000); return()=>clearInterval(refreshRef.current); }, [loadAppts]);

  const selStr   = svLocal(selectedDate);
  const dayAppts = allAppts.filter(a=>{
    const d = typeof a.date==='string'?a.date.substring(0,10):'';
    if (d!==selStr) return false;
    if (searchQ.trim()) { const q=searchQ.trim().toLowerCase(); return (a.client_name||'').toLowerCase().includes(q)||(a.client_phone||'').toLowerCase().includes(q)||(a.client_email||'').toLowerCase().includes(q)||(a.id||'').substring(0,8).toLowerCase().includes(q); }
    return true;
  }).sort((a,b)=>a.start_time.localeCompare(b.start_time));

  const dayCounts = {};
  weekDays.forEach(d=>{
    const ds=svLocal(d); const ap=allAppts.filter(a=>a.date?.substring(0,10)===ds);
    dayCounts[ds]={total:ap.length,paid:ap.filter(a=>a.paid).length};
  });

  const todayStats = dayCounts[selStr]||{total:0,paid:0};

  return (
    <div style={{ background:t.bg, minHeight:'100vh', paddingBottom:96 }} className='lg:pb-8'>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* ── HEADER ── */}
      <div style={{ padding:'16px 16px 0', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={onBack} style={{ width:36, height:36, borderRadius:10, ...glassCard(isDark), border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14,color:t.muted}}><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <div style={{ width:40, height:40, borderRadius:12, background:employee.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:18, fontWeight:800, flexShrink:0 }}>{employee.name.charAt(0)}</div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <p style={{ margin:0, fontSize:16, fontWeight:800, color:t.text, letterSpacing:'-.3px' }}>{employee.name}</p>
            {loading && <Spin size={14} />}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
            {employee.can_cancel && <span style={chip(isDark,'#ef4444')}>✕</span>}
            {employee.can_modify && <span style={chip(isDark,'#8b5cf6')}>✎</span>}
            {employee.can_encash && <span style={chip(isDark,'#22c55e')}>$</span>}
            {!employee.can_cancel&&!employee.can_modify&&!employee.can_encash && <span style={chip(isDark,isDark?'#64748b':'#94a3b8')}>👁</span>}
          </div>
        </div>

        <button onClick={()=>setNewApptOpen(true)}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10, background:'#1a73e8', color:'#fff', fontSize:12, fontWeight:700, border:'none', cursor:'pointer', flexShrink:0, boxShadow:'0 4px 12px rgba(17,24,39,0.3)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{width:12,height:12}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          RDV
        </button>
      </div>

      {/* ── TABS ── */}
      <div style={{ padding:'12px 16px 0' }}>
        <div style={{ display:'flex', gap:2, background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)', borderRadius:12, padding:3 }}>
          {[{id:'agenda',label:'Mon agenda',icon:'📅'},{id:'clients',label:'Clients & Notes',icon:'👥'}].map(tb=>(
            <button key={tb.id} onClick={()=>setMainTab(tb.id)} style={{
              flex:1, padding:'9px 8px', borderRadius:10, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, transition:'all .15s',
              background:mainTab===tb.id?(isDark?'rgba(17,24,39,0.25)':'#fff'):'transparent',
              color:mainTab===tb.id?'#111827':(isDark?'rgba(255,255,255,0.4)':'#9ca3af'),
              boxShadow:mainTab===tb.id?'0 1px 4px rgba(0,0,0,0.08)':'none',
            }}>
              {tb.icon} {tb.label}
            </button>
          ))}
        </div>
      </div>

      {mainTab === 'agenda' && (
        <>
          {/* ── CALENDRIER SEMAINE ── */}
          <div style={{ padding:'12px 16px 0' }}>
            <div style={{ ...glassCard(isDark), padding:14 }}>
              {/* Nav mois */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <button onClick={()=>setWeekOffset(w=>w-1)} style={{ width:32, height:32, borderRadius:9, background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:13,height:13,color:t.muted}}><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div style={{ textAlign:'center' }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:700, color:t.text }}>{MONTHS_FR[weekDays[0].getMonth()]} {weekDays[0].getFullYear()}</p>
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <button onClick={()=>{ setSelectedDate(new Date()); setWeekOffset(0); }} style={{ padding:'4px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(17,24,39,0.1)', color:'#111827', border:'none', cursor:'pointer' }}>Auj.</button>
                  <button onClick={()=>setWeekOffset(w=>w+1)} style={{ width:32, height:32, borderRadius:9, background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:13,height:13,color:t.muted}}><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              </div>

              {/* Jours */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
                {weekDays.map((d,i)=>{
                  const ds   = svLocal(d);
                  const info = dayCounts[ds]||{total:0,paid:0};
                  const isT  = d.toDateString()===today.toDateString();
                  const isSel= d.toDateString()===selectedDate.toDateString();
                  return (
                    <button key={i} onClick={()=>setSelectedDate(new Date(d))} style={{
                      display:'flex', flexDirection:'column', alignItems:'center', padding:'8px 0', borderRadius:12, cursor:'pointer', border:'none', transition:'all .15s',
                      background: isSel?'linear-gradient(135deg,#111827,#8b5cf6)': isT?(isDark?'rgba(17,24,39,0.15)':'rgba(17,24,39,0.08)'):'transparent',
                    }}>
                      <span style={{ fontSize:9, fontWeight:700, color:isSel?'rgba(255,255,255,0.7)':(isT?'#111827':t.muted) }}>{DAYS_FR[d.getDay()]}</span>
                      <span style={{ fontSize:16, fontWeight:800, marginTop:2, color:isSel?'#fff':(isT?'#111827':t.text) }}>{d.getDate()}</span>
                      {info.total>0 ? (
                        <div style={{ display:'flex', alignItems:'center', gap:2, marginTop:2 }}>
                          <span style={{ fontSize:9, fontWeight:800, padding:'1px 5px', borderRadius:99, background:isSel?'rgba(255,255,255,0.2)':'rgba(17,24,39,0.12)', color:isSel?'#fff':'#111827' }}>{info.total}</span>
                          {info.paid>0 && <span style={{ width:5, height:5, borderRadius:'50%', background:'#22c55e', flexShrink:0 }} />}
                        </div>
                      ) : <div style={{height:14}} />}
                    </button>
                  );
                })}
              </div>

              {/* Légende */}
              <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:8, paddingTop:8, borderTop:`1px solid ${t.border}` }}>
                <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:7,height:7,borderRadius:'50%',background:'#111827'}}/><span style={{fontSize:10,color:t.muted}}>RDV</span></div>
                <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:7,height:7,borderRadius:'50%',background:'#22c55e'}}/><span style={{fontSize:10,color:t.muted}}>Encaissé</span></div>
              </div>
            </div>
          </div>

          {/* ── STATS RAPIDES ── */}
          {todayStats.total > 0 && (
            <div style={{ padding:'10px 16px 0' }}>
              <div style={{ display:'flex', gap:8 }}>
                <div style={{ flex:1, ...glassCard(isDark), padding:'10px 14px' }}>
                  <p style={{ margin:0, fontSize:10, fontWeight:700, color:t.muted, textTransform:'uppercase' }}>RDV du jour</p>
                  <p style={{ margin:'4px 0 0', fontSize:22, fontWeight:800, color:t.text, letterSpacing:'-.5px' }}>{todayStats.total}</p>
                </div>
                <div style={{ flex:1, ...glassCard(isDark), padding:'10px 14px' }}>
                  <p style={{ margin:0, fontSize:10, fontWeight:700, color:t.muted, textTransform:'uppercase' }}>Encaissés</p>
                  <p style={{ margin:'4px 0 0', fontSize:22, fontWeight:800, color:'#16a34a', letterSpacing:'-.5px' }}>{todayStats.paid}</p>
                </div>
                <div style={{ flex:1, ...glassCard(isDark), padding:'10px 14px' }}>
                  <p style={{ margin:0, fontSize:10, fontWeight:700, color:t.muted, textTransform:'uppercase' }}>Restants</p>
                  <p style={{ margin:'4px 0 0', fontSize:22, fontWeight:800, color:'#f59e0b', letterSpacing:'-.5px' }}>{todayStats.total-todayStats.paid}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── FILTRES + RECHERCHE ── */}
          <div style={{ padding:'10px 16px 0', display:'flex', flexDirection:'column', gap:8 }}>
            {allEmployees.length > 1 && (
              <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
                <button onClick={()=>setFilterEmpId(employee.id)} style={pillBtn(filterEmpId===employee.id,isDark)}>Mes RDV</button>
                {allEmployees.filter(e=>e.is_active!==false).map(emp=>(
                  <button key={emp.id} onClick={()=>setFilterEmpId(emp.id===filterEmpId&&emp.id!==employee.id?employee.id:emp.id)}
                    style={{ ...pillBtn(filterEmpId===emp.id,isDark), display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:16, height:16, borderRadius:'50%', background:emp.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:8, fontWeight:800 }}>{emp.name.charAt(0)}</div>
                    {emp.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
            <div style={{ position:'relative' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:14, height:14, position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:t.dim, pointerEvents:'none' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Nom, téléphone, email, n° réservation…"
                style={{ width:'100%', padding:'10px 36px', borderRadius:10, background:isDark?'rgba(255,255,255,0.05)':'#f4f4f6', border:`1px solid ${searchQ?'rgba(17,24,39,0.3)':t.border}`, color:t.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              {searchQ && <button onClick={()=>setSearchQ('')} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:t.muted, cursor:'pointer', fontSize:14 }}>✕</button>}
            </div>
          </div>

          {/* ── LISTE DU JOUR ── */}
          <div style={{ padding:'12px 16px 0' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <div>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color:t.text }}>
                  {selectedDate.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}
                </p>
                <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>{dayAppts.length} rendez-vous</p>
              </div>
              <button onClick={loadAppts} style={{ width:32, height:32, borderRadius:9, background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:t.muted }}>↻</button>
            </div>

            {dayAppts.length===0 ? (
              <div style={{ padding:'40px 20px', textAlign:'center', ...glassCard(isDark) }}>
                <div style={{ fontSize:32, marginBottom:12 }}>📅</div>
                <p style={{ margin:0, fontSize:14, fontWeight:600, color:t.muted }}>{searchQ?'Aucun resultat':'Aucun rendez-vous ce jour'}</p>
                {!searchQ && <button onClick={()=>setNewApptOpen(true)} style={{ marginTop:12, padding:'8px 16px', borderRadius:99, background:'rgba(17,24,39,0.1)', color:'#111827', border:'none', cursor:'pointer', fontSize:12, fontWeight:700 }}>+ Créer un RDV</button>}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {dayAppts.map((a,i) => <div key={a.id} style={{ animation:`fadeUp .2s ease ${i*.05}s both` }}><ApptCard appt={a} theme={t} onClick={setDetailAppt} /></div>)}
              </div>
            )}
          </div>
        </>
      )}

      {mainTab === 'clients' && <ClientsTab employee={employee} theme={t} />}

      {detailAppt && (
        <ApptActionModal appt={detailAppt} employee={employee} services={services} theme={t}
          onClose={()=>setDetailAppt(null)}
          onUpdated={upd=>{ setAllAppts(p=>p.map(a=>a.id===upd.id?{...a,...upd}:a)); setDetailAppt(prev=>({...prev,...upd})); showToast('RDV mis a jour ✓'); }}
          onTxCreated={tx=>{ onTxCreated(tx); showToast('💰 Encaissé ! Ajoute a la caisse.'); }} />
      )}

      {newApptOpen && (
        <NewApptModal empId={employee.id} services={services} theme={t} onClose={()=>setNewApptOpen(false)}
          onSave={async form=>{ await bookingApi.createEmpAppt(form); await loadAppts(); showToast('RDV crée ✓'); }} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MULTI-COLUMN AGENDA — Vue Google Calendar style
   ════════════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════════
   QUICK ADD APPT MODAL — Création RDV complète depuis la vue multi-colonnes
   Recherche/création client, sélection employé + services, calcul auto
   ════════════════════════════════════════════════════════════════════════════ */
function QuickAddApptModal({ employees, services, onSave, onClose, theme: t }) {
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


function MultiColumnAgenda({ employees, services, onTxCreated, onSelectEmployee, theme: t }) {
  const isDark = t.mode === 'dark';
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [allAppts, setAllAppts]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [editAppt, setEditAppt]         = useState(null);
  const [activeEmployee, setActiveEmployee] = useState(null);
  const [addOpen, setAddOpen]           = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [toast, showToast]              = useToast();
  // Horaires du commerce chargés depuis l'API
  const [gridStartMin, setGridStartMin] = useState(8*60);  // 08:00 par défaut
  const [gridEndMin,   setGridEndMin]   = useState(20*60); // 20:00 par défaut

  const dateStr = svLocal(selectedDate);

  // Charger les horaires du commerce au montage
  useEffect(() => {
    bookingApi.getHours().then(hrs => {
      if (!hrs || !hrs.length) return;
      const open = hrs.filter(h => h.is_open !== false);
      if (!open.length) return;
      // Convertir "HH:MM:SS" ou "HH:MM" en minutes
      const parseT = t => {
        const parts = String(t||'0').split(':').map(Number);
        return (parts[0]||0)*60 + (parts[1]||0);
      };
      const allOpen  = open.map(h => parseT(h.open_time));
      const allClose = open.map(h => parseT(h.close_time));
      let minOpen  = Math.min(...allOpen);
      let maxClose = Math.max(...allClose);
      // Gérer minuit : si close_time < open_time (ex: 10h→02h), ajouter 24h
      const adjustedClose = open.map(h => {
        const o = parseT(h.open_time); const c = parseT(h.close_time);
        return c < o ? c + 24*60 : c;
      });
      maxClose = Math.max(...adjustedClose);
      // Ajouter 30min de marge de chaque côté, sans dépasser 0h-47h59
      setGridStartMin(Math.max(0, minOpen - 30));
      setGridEndMin(maxClose + 30);
    }).catch(() => {});
  }, []);

  const loadAppts = useCallback(async() => {
    setLoading(true);
    try { const data = await bookingApi.getAppointments({from:dateStr,to:dateStr}); setAllAppts(Array.isArray(data)?data:[]); }
    catch {} finally { setLoading(false); }
  }, [dateStr]);

  useEffect(()=>{ loadAppts(); }, [loadAppts]);

  const today    = new Date();
  const weekStart = new Date(today); weekStart.setDate(today.getDate()-today.getDay()+1);
  const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(weekStart); d.setDate(weekStart.getDate()+i); return d; });
  const activeEmps = employees.filter(e=>e.is_active!==false && e.show_in_caisse!==false);

  const HOUR_H = 120;

  // Générer la liste des heures à afficher (en minutes depuis minuit, peut dépasser 1440 pour passage minuit)
  const HOURS = (() => {
    const list = [];
    // On arrondit au début de l'heure
    const start = Math.floor(gridStartMin / 60) * 60;
    const end   = Math.ceil(gridEndMin / 60) * 60;
    for (let m = start; m < end; m += 60) list.push(m);
    return list; // ex: [600, 660, 720, ..., 1380, 1440] pour 10h→01h (lendemain)
  })();

  const totalGridMin = HOURS.length * 60; // durée totale affichée en minutes
  const gridOriginMin = HOURS[0] || 0;   // heure de départ de la grille en minutes

  const getApptStyle = appt => {
    const parseT = s => { const p = String(s||'0:0').split(':').map(Number); return p[0]*60+(p[1]||0); };
    let startM = parseT(appt.start_time);
    let endM   = parseT(appt.end_time || appt.start_time);
    // Si passage minuit : si endM < startM, ajouter 24h à endM
    if (endM < startM) endM += 24 * 60;
    // Si l'heure est avant l'origine de la grille (cas nocturne : ex: RDV à 01h affiché après minuit)
    // On vérifie si startM + 24h est dans la plage
    let relStart = startM - gridOriginMin;
    if (relStart < 0) relStart += 24 * 60; // RDV "lendemain matin" dans plage nocturne
    const top    = (relStart / 60) * HOUR_H;
    const height = ((endM - startM) / 60) * HOUR_H;
    return { top: Math.max(0, top), height: Math.max(22, height) };
  };

  const openApptModal = appt => {
    const emp = employees.find(e=>e.id===appt.employee_id)||null;
    setActiveEmployee(emp); setEditAppt(appt);
  };

  const navigateDay = d => setSelectedDate(prev=>{ const n=new Date(prev); n.setDate(n.getDate()+d); return n; });
  const isToday = selectedDate.toDateString()===today.toDateString();
  const fmtDay  = d => `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_SH[d.getMonth()]}`;

  // stats rapides
  const confirmed = allAppts.filter(a=>a.status==='confirmed').length;
  const encaissed = allAppts.filter(a=>a.paid).length;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:isDark?'#0d1117':'#f6f8fa', overflow:'hidden' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* ── HEADER ── */}
      <div style={{ padding:'12px 16px 8px', background:isDark?'#0d1117':'#f6f8fa', flexShrink:0, borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}` }}>
        {/* Navigation date */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          {/* Bouton semaine précédente */}
          <button onClick={()=>{ const d=new Date(selectedDate); d.setDate(d.getDate()-7); setSelectedDate(d); }}
            style={{ width:36, height:36, borderRadius:9, ...glassCard(isDark), border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, gap:0 }}
            title="Semaine précédente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:12,height:12,color:t.muted}}><polyline points="15 18 9 12 15 6"/></svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:12,height:12,color:t.muted,marginLeft:-4}}><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button onClick={()=>navigateDay(-1)} style={{ width:32, height:32, borderRadius:9, ...glassCard(isDark), border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:13,height:13,color:t.muted}}><polyline points="15 18 9 12 15 6"/></svg>
          </button>

          <button onClick={()=>setSelectedDate(new Date())} style={{ flex:1, textAlign:'center', background:'none', border:'none', cursor:'pointer', fontSize:14, fontWeight:700, color:isToday?'#1a73e8':t.text, letterSpacing:'-.3px' }}>
            {isToday ? "Aujourd'hui" : fmtDay(selectedDate)}
          </button>

          <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
            {loading && <Spin size={14} />}
            <button onClick={()=>navigateDay(1)} style={{ width:32, height:32, borderRadius:9, ...glassCard(isDark), border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:13,height:13,color:t.muted}}><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            {/* Bouton semaine suivante */}
            <button onClick={()=>{ const d=new Date(selectedDate); d.setDate(d.getDate()+7); setSelectedDate(d); }}
              style={{ width:36, height:36, borderRadius:9, ...glassCard(isDark), border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:0 }}
              title="Semaine suivante">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:12,height:12,color:t.muted}}><polyline points="9 18 15 12 9 6"/></svg>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:12,height:12,color:t.muted,marginLeft:-4}}><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button onClick={()=>setQuickAddOpen(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'0 14px', height:36, borderRadius:9, background:'#1a73e8', border:'none', cursor:'pointer', boxShadow:'0 4px 12px rgba(26,115,232,0.3)', flexShrink:0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{width:12,height:12}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span style={{ fontSize:12, fontWeight:800, color:'white' }}>RDV</span>
            </button>
          </div>
        </div>

        {/* Mini semaine */}
        <div style={{ display:'flex', gap:2 }}>
          {weekDays.map((d,i)=>{
            const isSel = d.toDateString()===selectedDate.toDateString();
            const isTod = d.toDateString()===today.toDateString();
            return (
              <button key={i} onClick={()=>setSelectedDate(new Date(d))} style={{
                flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'6px 0', borderRadius:10, border:'none', cursor:'pointer', transition:'all .15s',
                background: isSel?'#111827':'transparent',
              }}>
                <span style={{fontSize:9,fontWeight:700,color:isSel?'rgba(255,255,255,.7)':isTod?'#111827':(isDark?'#768390':'#9ca3af')}}>{DAYS_FR[d.getDay()]}</span>
                <span style={{fontSize:14,fontWeight:800,marginTop:1,color:isSel?'#fff':isTod?'#111827':(isDark?'#e6edf3':'#111')}}>{d.getDate()}</span>
                {isTod&&!isSel && <div style={{width:4,height:4,borderRadius:'50%',background:'#111827',marginTop:1}} />}
              </button>
            );
          })}
        </div>

        {/* Stats ligne */}
        {allAppts.length>0 && (
          <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:8, paddingTop:8, borderTop:`1px solid ${isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'}` }}>
            <span style={{fontSize:12,fontWeight:700,color:t.text}}>{allAppts.length} RDV</span>
            <span style={{fontSize:12,fontWeight:600,color:'#22c55e'}}>✓ {confirmed} confirmés</span>
            {encaissed>0&&<span style={{fontSize:12,fontWeight:600,color:'#10b981'}}>💰 {encaissed} encaissés</span>}
          </div>
        )}
      </div>

      {/* ── GRILLE HORAIRE ── */}
      <div style={{ flex:1, overflow:'auto', minHeight:0 }}>
        {activeEmps.length===0 ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
            <div style={{ textAlign:'center' }}>
              <p style={{ fontSize:32, marginBottom:12 }}>👥</p>
              <p style={{ margin:0, fontSize:14, color:t.muted }}>Aucun employé actif</p>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', minWidth:activeEmps.length*150+52 }}>

            {/* Axe heures */}
            <div style={{ width:52, flexShrink:0, position:'sticky', left:0, zIndex:10, background:isDark?'#0d1117':'#f6f8fa' }}>
              <div style={{ height:56, borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}` }} />
              {HOURS.map((hMin,i) => {
                const hNum = Math.floor(hMin / 60) % 24; // heure réelle 0-23
                const label = hNum === 0 ? 'Minuit' : `${hNum}h`;
                return (
                  <div key={i} style={{ height:HOUR_H, borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)'}`, display:'flex', alignItems:'flex-start', justifyContent:'flex-end', paddingRight:8 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:isDark?'#768390':'#9ca3af', marginTop:-7 }}>{label}</span>
                  </div>
                );
              })}
            </div>

            {/* Colonnes employés */}
            {activeEmps.map(emp => {
              const empAppts = allAppts.filter(a=>a.employee_id===emp.id);
              return (
                <div key={emp.id} style={{ flex:1, minWidth:140, borderLeft:`1px solid ${isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'}`, display:'flex', flexDirection:'column' }}>

                  {/* Header employé — cliquable */}
                  <button onClick={()=>onSelectEmployee(emp)} style={{
                    height:56, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'4px 6px', position:'sticky', top:0, zIndex:9, background:isDark?'#0d1117':'#f6f8fa', borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}`, border:'none', cursor:'pointer', transition:'background .15s', flexShrink:0,
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background=isDark?'rgba(17,24,39,0.1)':'rgba(17,24,39,0.06)'}
                  onMouseLeave={e=>e.currentTarget.style.background=isDark?'#0d1117':'#f6f8fa'}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:emp.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:12, fontWeight:800 }}>{emp.name.charAt(0)}</div>
                    <span style={{ fontSize:11, fontWeight:700, marginTop:2, color:isDark?'#adbac7':'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'90%', display:'block' }}>{emp.name.split(' ')[0]}</span>
                    {/* Dots droits */}
                    <div style={{ display:'flex', gap:2, marginTop:1 }}>
                      {emp.can_cancel && <div style={{width:4,height:4,borderRadius:'50%',background:'#ef4444'}} />}
                      {emp.can_modify && <div style={{width:4,height:4,borderRadius:'50%',background:'#8b5cf6'}} />}
                      {emp.can_encash && <div style={{width:4,height:4,borderRadius:'50%',background:'#22c55e'}} />}
                    </div>
                  </button>

                  {/* Zone horaires */}
                  <div style={{ position:'relative', height:HOURS.length*HOUR_H, flex:1 }}>
                    {HOURS.map((_,i)=>(
                      <div key={i} style={{ position:'absolute', left:0, right:0, top:i*HOUR_H, height:HOUR_H, borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.03)'}` }} />
                    ))}
                    {/* Ligne "maintenant" */}
                    {isToday && (() => {
                      const n = new Date();
                      let nowMin = n.getHours()*60 + n.getMinutes();
                      // Si nowMin < gridOriginMin, tenter +24h (plage nocturne passant minuit)
                      if (nowMin < gridOriginMin) nowMin += 24*60;
                      const relMin = nowMin - gridOriginMin;
                      if (relMin < 0 || relMin > HOURS.length*60) return null;
                      return <div style={{position:'absolute',left:0,right:0,top:(relMin/60)*HOUR_H,height:1.5,background:'rgba(239,68,68,0.6)',zIndex:5}} />;
                    })()}

                    {empAppts.map(appt=>{
                      const {top,height} = getApptStyle(appt);
                      const sc = STATUS_GRID[appt.status]||STATUS_GRID.confirmed;
                      const hasAct = emp.can_cancel||emp.can_modify||emp.can_encash;
                      return (
                        <button key={appt.id} onClick={()=>openApptModal(appt)} style={{
                          position:'absolute', left:3, right:3, top, height:Math.max(height,36), borderRadius:12, overflow:'hidden', textAlign:'left', cursor:'pointer', zIndex:2, border:'none',
                          background: isDark ? (emp.avatar_color||'#1a73e8')+'22' : sc.bg,
                          outline: `1.5px solid ${isDark?(emp.avatar_color||'#1a73e8')+'50':sc.bd}`,
                          transition:'transform .12s, box-shadow .12s',
                          boxShadow: isDark?'none':'0 1px 4px rgba(0,0,0,0.06)',
                        }}
                        onMouseEnter={e=>{ e.currentTarget.style.transform='scale(1.01)'; e.currentTarget.style.boxShadow='0 6px 16px rgba(0,0,0,0.14)'; }}
                        onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow=isDark?'none':'0 1px 4px rgba(0,0,0,0.06)'; }}>
                          {/* Barre gauche */}
                          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:4, background:emp.avatar_color||'#1a73e8', borderRadius:'99px 0 0 99px' }} />
                          <div style={{ paddingLeft:10, paddingRight:6, paddingTop:6 }}>
                            <p style={{ margin:0, fontSize:14, fontWeight:800, color:isDark?(emp.avatar_color||'#e6edf3'):sc.tx, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{appt.client_name}</p>
                            {height>40 && <p style={{ margin:'2px 0 0', fontSize:12, fontWeight:600, color:isDark?'rgba(255,255,255,0.65)':sc.tx, opacity:.9, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fmtTime(appt.start_time)} · {appt.service_name||'RDV'}</p>}
                            {height>65 && <p style={{ margin:'1px 0 0', fontSize:11, color:isDark?'rgba(255,255,255,0.45)':sc.tx, opacity:.7, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fmtTime(appt.end_time)} · {appt.total_duration||appt.duration_minutes}min</p>}
                            {height>80 && appt.paid && <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3 }}><div style={{ width:7, height:7, borderRadius:'50%', background:'#22c55e' }} /><span style={{ fontSize:10, color:'#22c55e', fontWeight:700 }}>Encaissé</span></div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAUX ── */}
      {editAppt && (
        <ApptActionModal appt={editAppt} employee={activeEmployee} services={services} theme={t}
          onClose={()=>{ setEditAppt(null); setActiveEmployee(null); }}
          onUpdated={upd=>{ setAllAppts(p=>p.map(a=>a.id===upd.id?{...a,...upd}:a)); setEditAppt(prev=>({...prev,...upd})); showToast('RDV mis a jour ✓'); }}
          onTxCreated={tx=>{ onTxCreated(tx); playSound('caisse', 2); showToast('💰 Encaissé !'); }} />
      )}

      {/* Modal ajout — choix employé */}
      {/* QuickAddApptModal — création RDV complète */}
      {quickAddOpen && (
        <QuickAddApptModal
          employees={employees}
          services={services}
          theme={t}
          onClose={()=>setQuickAddOpen(false)}
          onSave={async form => {
            const appt = await bookingApi.createEmpAppt(form);
            await loadAppts();
            showToast('RDV créé ✓');
            return appt;
          }}
        />
      )}

      {addOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={()=>setAddOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(6px)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:360, borderRadius:20, overflow:'hidden', background:isDark?'#1c2128':'#fff', border:`1px solid ${isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.07)'}`, boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}` }}>
              <p style={{ margin:0, fontSize:16, fontWeight:800, color:t.text, letterSpacing:'-.3px' }}>Nouveau rendez-vous</p>
              <p style={{ margin:'4px 0 0', fontSize:12, color:t.muted }}>Selectionnez l'employé</p>
            </div>
            <div style={{ padding:12, display:'flex', flexDirection:'column', gap:6 }}>
              {activeEmps.map(emp=>(
                <button key={emp.id} onClick={()=>{ setAddOpen(false); onSelectEmployee(emp); }} style={{
                  display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:14, ...glassCard(isDark), border:'none', cursor:'pointer', textAlign:'left', transition:'background .12s',
                }}
                onMouseEnter={e=>e.currentTarget.style.background=isDark?'rgba(17,24,39,0.1)':'rgba(17,24,39,0.04)'}
                onMouseLeave={e=>e.currentTarget.style.background=isDark?'rgba(255,255,255,0.04)':'#fff'}>
                  <div style={{ width:40, height:40, borderRadius:12, background:emp.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:16, fontWeight:800, flexShrink:0 }}>{emp.name.charAt(0)}</div>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:0, fontSize:13, fontWeight:700, color:t.text }}>{emp.name}</p>
                    <div style={{ display:'flex', gap:4, marginTop:4 }}>
                      {emp.can_cancel && <span style={chip(isDark,'#ef4444')}>✕ Annul.</span>}
                      {emp.can_modify && <span style={chip(isDark,'#8b5cf6')}>✎ Modif.</span>}
                      {emp.can_encash && <span style={chip(isDark,'#22c55e')}>$ Encaiss.</span>}
                    </div>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14,color:t.muted,flexShrink:0}}><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   CLIENTS TAB — Clients & Notes
   ════════════════════════════════════════════════════════════════════════════ */
function ClientsTab({ employee, theme: t }) {
  const isDark = t.mode === 'dark';
  const { requestPin, PinModalNode: NotePinModal } = useEmployeePinGate();
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [client,      setClient]      = useState(null);
  const [history,     setHistory]     = useState([]);
  const [notes,       setNotes]       = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [newNote,     setNewNote]     = useState('');
  const [savingNote,  setSavingNote]  = useState(false);
  const [editNote,    setEditNote]    = useState(null);
  const [delNoteId,   setDelNoteId]   = useState(null);
  const [expandedAppt,setExpandedAppt]= useState(null);

  useEffect(()=>{
    if (!query||query.trim().length<2){setResults([]);return;}
    setSearching(true);
    const t=setTimeout(async()=>{ try{const r=await clientNotesApi.search(query);setResults(r);}catch{setResults([]);}finally{setSearching(false);} },350);
    return()=>clearTimeout(t);
  },[query]);

  const selectClient = async cl=>{
    setClient(cl);setResults([]);setQuery(cl.name+(cl.email?' - '+cl.email:''));setLoadingData(true);
    try{const[hist,nts]=await Promise.all([clientNotesApi.getHistory(cl.email,employee?.id),clientNotesApi.getNotes(cl.email)]);setHistory(hist);setNotes(nts);}
    catch(e){console.error(e);}finally{setLoadingData(false);}
  };

  const addNote = async()=>{
    if(!newNote.trim()||!client)return;
    await requestPin(
      employee || null,
      'Ajouter une note client',
      async () => {
        setSavingNote(true);
        try{const created=await clientNotesApi.addNote({client_email:client.email,client_name:client.name,note_text:newNote.trim(),employee_id:employee.id,employee_name:employee.name});setNotes(p=>[created,...p]);setNewNote('');}
        catch(e){alert('Erreur : '+e.message);}finally{setSavingNote(false);}
      }
    );
  };
  const saveEditNote = async()=>{
    if(!editNote?.text?.trim())return;
    try{const upd=await clientNotesApi.updateNote(editNote.id,{note_text:editNote.text});setNotes(p=>p.map(n=>n.id===editNote.id?upd:n));setEditNote(null);}
    catch(e){alert('Erreur : '+e.message);}
  };
  const deleteNote = async id=>{
    try{await clientNotesApi.deleteNote(id);setNotes(p=>p.filter(n=>n.id!==id));}
    catch(e){alert('Erreur : '+e.message);}
    setDelNoteId(null);
  };
  const fmtD=d=>{if(!d)return'';return new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});};
  const fmtMoney=v=>Number(v||0).toFixed(2);
  const IS={width:'100%',padding:'11px 14px',borderRadius:12,border:`1px solid ${t.border}`,background:isDark?'rgba(255,255,255,0.05)':'#f4f4f6',color:t.text,fontSize:13,outline:'none',boxSizing:'border-box'};

  return (
    <>
    <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:12, paddingBottom:40 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Recherche */}
      <div style={{position:'relative'}}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14,position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:t.dim,pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input placeholder="Rechercher un client (nom, email, téléphone)..." value={query} onChange={e=>{setQuery(e.target.value);setClient(null);setHistory([]);setNotes([]);}} style={{...IS,paddingLeft:36,paddingRight:36}} />
        {searching&&<span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:12}}><Spin size={14}/></span>}
      </div>

      {!client && results.length>0 && (
        <div style={{...glassCard(isDark),overflow:'hidden'}}>
          {results.map((r,i)=>(
            <div key={r.email} onClick={()=>selectClient(r)} style={{padding:'12px 16px',cursor:'pointer',borderTop:i>0?`1px solid ${t.border}`:'none',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'background .12s'}}
            onMouseEnter={e=>e.currentTarget.style.background=isDark?'rgba(255,255,255,0.04)':'#f9f9fb'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div>
                <p style={{margin:0,fontWeight:700,fontSize:14,color:t.text}}>{r.name||r.email}</p>
                <p style={{margin:'2px 0 0',fontSize:12,color:t.muted}}>{r.email}{r.phone?' · '+r.phone:''}</p>
              </div>
              <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
                <span style={{fontSize:12,fontWeight:700,color:'#f59e0b'}}>{r.appt_count||0} presta.</span>
                {r.total_stamps_ever>0&&<p style={{margin:'2px 0 0',fontSize:11,color:t.muted}}>🎫 {r.total_stamps_ever}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {client && (
        <>
          {/* Fiche client */}
          <div style={{...glassCard(isDark),padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{flex:1,minWidth:0}}>
              <p style={{margin:0,fontWeight:800,fontSize:16,color:t.text,letterSpacing:'-.3px'}}>{client.name}</p>
              <p style={{margin:'3px 0 0',fontSize:12,color:t.muted}}>{client.email}{client.phone?' · '+client.phone:''}</p>
              {client.last_visit&&<p style={{margin:'4px 0 0',fontSize:11,fontWeight:600,color:'#10b981'}}>✓ Dernière visite : {fmtD(client.last_visit)}</p>}
            </div>
            <button onClick={()=>{setClient(null);setQuery('');setHistory([]);setNotes([]);}} style={{background:'none',border:'none',cursor:'pointer',color:t.muted,fontSize:18,lineHeight:1,padding:4,flexShrink:0}}>✕</button>
          </div>

          {loadingData ? (
            <div style={{display:'flex',justifyContent:'center',padding:32}}><Spin size={24}/></div>
          ) : (
            <>
              {/* Historique */}
              <div style={{...glassCard(isDark),overflow:'hidden'}}>
                <div style={{padding:'10px 16px',borderBottom:`1px solid ${t.border}`,background:isDark?'rgba(255,255,255,0.02)':'#fafafa'}}>
                  <p style={{margin:0,fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:t.muted}}>📋 Historique des prestations ({history.length})</p>
                </div>
                {history.length===0?(
                  <p style={{margin:0,padding:'20px 16px',textAlign:'center',fontSize:13,color:t.muted}}>Aucune prestation terminée</p>
                ):history.map((appt,i)=>(
                  <div key={appt.id} style={{borderTop:i>0?`1px solid ${t.border}`:'none'}}>
                    <div onClick={()=>setExpandedAppt(expandedAppt===appt.id?null:appt.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer'}}>
                      <div style={{width:34,height:34,borderRadius:10,background:appt.avatar_color||'#111827',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:14,flexShrink:0}}>{(appt.employee_name||'?').charAt(0).toUpperCase()}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{margin:0,fontWeight:700,fontSize:13,color:t.text}}>{fmtD(appt.date)}{appt.start_time?' · '+String(appt.start_time).substring(0,5):''}</p>
                        <p style={{margin:'2px 0 0',fontSize:12,color:t.muted}}>{appt.employee_name||'Employe inconnu'}{appt.total_amount?' · '+fmtMoney(appt.total_amount)+' €':''}</p>
                      </div>
                      <span style={{fontSize:12,color:t.dim,flexShrink:0}}>{expandedAppt===appt.id?'▲':'▼'}</span>
                    </div>
                    {expandedAppt===appt.id&&(
                      <div style={{padding:'0 16px 12px 62px'}}>
                        {appt.services&&appt.services.filter(s=>s.service_name).map((s,j)=>(
                          <p key={j} style={{margin:'3px 0',fontSize:12,color:t.text}}>• {s.service_name}{s.qty>1?' ×'+s.qty:''}{s.unit_price?' - '+fmtMoney(s.unit_price)+' €':''}</p>
                        ))}
                        {appt.appt_notes&&(
                          <div style={{marginTop:8,padding:'8px 12px',background:isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)',borderRadius:10,borderLeft:'3px solid #f59e0b'}}>
                            <p style={{margin:0,fontSize:12,color:t.text,fontStyle:'italic'}}>"{appt.appt_notes}"</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Notes internes */}
              <div style={{...glassCard(isDark),overflow:'hidden'}}>
                <div style={{padding:'10px 16px',borderBottom:`1px solid ${t.border}`,background:isDark?'rgba(255,255,255,0.02)':'#fafafa'}}>
                  <p style={{margin:0,fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:t.muted}}>📝 Notes internes ({notes.length})</p>
                </div>
                <div style={{padding:12,borderBottom:`1px solid ${t.border}`}}>
                  <textarea placeholder="Ex : Coloration blonde. Cheveux fragiles…" value={newNote} onChange={e=>setNewNote(e.target.value)} rows={3} style={{...IS,resize:'vertical',lineHeight:1.5,fontFamily:'inherit',marginBottom:8}} />
                  <button onClick={addNote} disabled={!newNote.trim()||savingNote} style={{width:'100%',padding:'10px',borderRadius:10,background:'#1a73e8',color:'#fff',fontWeight:700,fontSize:13,border:'none',cursor:'pointer',opacity:!newNote.trim()?.4:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                    {savingNote?<><Spin size={14}/>Enregistrement…</>:'💾 Ajouter cette note'}
                  </button>
                </div>
                {notes.length===0?(
                  <p style={{margin:0,padding:'20px 16px',textAlign:'center',fontSize:13,color:t.muted}}>Aucune note.</p>
                ):notes.map((note,i)=>(
                  <div key={note.id} style={{padding:'12px 16px',borderTop:i>0?`1px solid ${t.border}`:'none'}}>
                    {editNote?.id===note.id?(
                      <div style={{display:'flex',flexDirection:'column',gap:8}}>
                        <textarea value={editNote.text} onChange={e=>setEditNote({...editNote,text:e.target.value})} rows={3} style={{...IS,resize:'vertical',fontFamily:'inherit',lineHeight:1.5}} />
                        <div style={{display:'flex',gap:8}}>
                          <button onClick={()=>setEditNote(null)} style={{flex:1,padding:9,borderRadius:10,background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6',border:`1px solid ${t.border}`,color:t.muted,fontWeight:700,fontSize:12,cursor:'pointer'}}>Annuler</button>
                          <button onClick={saveEditNote} style={{flex:2,padding:9,borderRadius:10,background:'linear-gradient(135deg,#10b981,#059669)',color:'#fff',fontWeight:700,fontSize:12,border:'none',cursor:'pointer'}}>Enregistrer</button>
                        </div>
                      </div>
                    ):(
                      <>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                          <p style={{margin:0,fontSize:13,color:t.text,lineHeight:1.6,flex:1}}>{note.note_text}</p>
                          <div style={{display:'flex',gap:4,flexShrink:0}}>
                            <button onClick={()=>setEditNote({id:note.id,text:note.note_text})} style={{width:28,height:28,borderRadius:8,background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12}}>✏️</button>
                            <button onClick={()=>setDelNoteId(note.id)} style={{width:28,height:28,borderRadius:8,background:'rgba(239,68,68,0.08)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12}}>🗑</button>
                          </div>
                        </div>
                        <p style={{margin:'5px 0 0',fontSize:11,color:t.dim}}>Par {note.created_by_name||'Équipe'} · {new Date(note.created_at).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}{note.updated_at!==note.created_at?' (modifie)':''}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {delNoteId && (
            <div style={{position:'fixed',inset:0,zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
              <div onClick={()=>setDelNoteId(null)} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)'}} />
              <div style={{position:'relative',background:isDark?'#161620':'#fff',borderRadius:20,padding:24,width:'100%',maxWidth:320,border:`1px solid ${t.border}`,boxShadow:'0 24px 48px rgba(0,0,0,0.2)'}}>
                <p style={{fontWeight:800,fontSize:16,color:t.text,margin:'0 0 6px',letterSpacing:'-.3px'}}>Supprimer cette note ?</p>
                <p style={{fontSize:13,color:t.muted,margin:'0 0 20px'}}>Cette action est irréversible.</p>
                <div style={{display:'flex',gap:10}}>
                  <button onClick={()=>setDelNoteId(null)} style={{flex:1,padding:12,borderRadius:12,background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6',border:`1px solid ${t.border}`,color:t.muted,fontWeight:700,cursor:'pointer'}}>Annuler</button>
                  <button onClick={()=>deleteNote(delNoteId)} style={{flex:2,padding:12,borderRadius:12,background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'#fff',fontWeight:800,border:'none',cursor:'pointer'}}>Supprimer</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    {NotePinModal}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   EXPORT PRINCIPAL
   ════════════════════════════════════════════════════════════════════════════ */
export default function EmployeeAgenda({ employees=[], onTxCreated }) {
  const { theme }                     = useTheme();
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [services, setServices]       = useState([]);
  const [view, setView]               = useState('multi');

  useEffect(()=>{ bookingApi.getServices().then(setServices).catch(()=>{}); }, []);

  if (view==='single' && selectedEmp) {
    return (
      <EmpAgendaMain
        employee={selectedEmp}
        services={services}
        allEmployees={employees}
        onBack={()=>{ setSelectedEmp(null); setView('multi'); }}
        onTxCreated={onTxCreated||(()=>{})}
        theme={theme}
      />
    );
  }

  return (
    <MultiColumnAgenda
      employees={employees}
      services={services}
      onTxCreated={onTxCreated||(()=>{})}
      onSelectEmployee={emp=>{ setSelectedEmp(emp); setView('single'); }}
      theme={theme}
    />
  );
}