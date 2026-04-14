// src/pages/Agenda.jsx — Agenda unifié complet
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { bookingApi, clientNotesApi, clientsApi } from '../utils/api';
import { useTheme } from '../hooks/useTheme';
import { Modal, Toast, useToast } from '../components/UI';
import { useEmployeePinGate } from '../components/EmployeePinModal';

/* ─── constantes ─────────────────────────────────────────────────────────── */
const DAYS_FR    = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const DAYS_FULL  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const MONTHS_FR  = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Decembre'];
const MONTHS_SH  = ['Janv','Fevr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Dec'];
const STATUS_CFG = {
  confirmed: { label:'Confirme',   color:'#4ade80', bg:'rgba(74,222,128,0.12)'  },
  pending:   { label:'En attente', color:'#fbbf24', bg:'rgba(251,191,36,0.12)'  },
  cancelled: { label:'Annule',     color:'#f87171', bg:'rgba(248,113,113,0.12)' },
  completed: { label:'Termine',    color:'#94a3b8', bg:'rgba(148,163,184,0.12)' },
  no_show:   { label:'Absent',     color:'#fb923c', bg:'rgba(251,146,60,0.12)'  },
};
const STATUS_GRID = {
  confirmed: { bg:'#eef2ff', bd:'#c7d2fe', tx:'#4338ca' },
  pending:   { bg:'#fffbeb', bd:'#fde68a', tx:'#92400e' },
  cancelled: { bg:'#fef2f2', bd:'#fecaca', tx:'#991b1b' },
  completed: { bg:'#f0fdf4', bd:'#a7f3d0', tx:'#065f46' },
  no_show:   { bg:'#fff7ed', bd:'#fed7aa', tx:'#9a3412' },
};
const PAY_OPTS = [
  { id:'cash',     label:'Especes',  icon:'💵' },
  { id:'card',     label:'Carte',    icon:'💳' },
  { id:'transfer', label:'Virement', icon:'🏦' },
  { id:'other',    label:'Autre',    icon:'🔄' },
];
const COLORS = ['#111827','#374151','#4ade80','#f59e0b','#f87171','#ec4899','#374151','#a78bfa','#34d399'];

/* ─── helpers ────────────────────────────────────────────────────────────── */
const fmtTime  = t  => t ? String(t).substring(0,5) : '';
const fmtDateL = d  => {
  if (!d) return '';
  const [y,m,day] = d.split('-').map(Number);
  return `${DAYS_FULL[new Date(y,m-1,day).getDay()]} ${day} ${MONTHS_FR[m-1]} ${y}`;
};
const toMin = t => { const [h,m] = String(t||'0:0').split(':').map(Number); return h*60+m; };
const fromMin = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const svLocal  = d => d.toLocaleDateString('sv-SE');

/* ─── Petits utilitaires UI ───────────────────────────────────────────────── */
function Toggle({ on, onChange, colorOn='linear-gradient(90deg,#111827,#374151)' }) {
  return (
    <button onClick={onChange}
      className="w-12 h-6 rounded-full relative flex-shrink-0 transition-all"
      style={{ background: on ? colorOn : 'rgba(120,120,120,0.2)' }}>
      <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
        style={{ left: on ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

function InfoRow({ icon, label, value, t, border }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={border?{borderTop:`1px solid ${t.border}`}:{}}>
      <span style={{ fontSize:16, width:22, textAlign:'center', flexShrink:0 }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:t.muted }}>{label}</p>
        <p className="text-sm font-semibold mt-0.5 break-words" style={{ color:t.text }}>{value||'-'}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODAL DÉTAIL / ACTIONS RDV
   ═══════════════════════════════════════════════════════════════════════════ */
function ApptModal({ appt: init, employees, employee, onUpdated, onDeleted, onTxCreated, onClose, theme: t }) {
  const isDark = t.mode === 'dark';
  const [appt, setAppt]   = useState(init);
  const [tab, setTab]     = useState('detail');
  const [saving, setSaving]= useState(false);
  const { requestPin, PinModalNode } = useEmployeePinGate();

  // droits : si employee = null → admin (tous droits)
  const isAdmin = !employee;
  const canMod  = isAdmin || !!employee?.can_modify;
  const canCnl  = isAdmin || !!employee?.can_cancel;
  const canEnc  = isAdmin || !!employee?.can_encash;

  const canAct  = appt.status !== 'cancelled' && appt.status !== 'completed';

  /* formulaire édition */
  const [ef, setEf] = useState({
    date:         appt.date||'',
    start_time:   fmtTime(appt.start_time),
    status:       appt.status,
    employee_id:  appt.employee_id||'',
    client_name:  appt.client_name||'',
    client_email: appt.client_email||'',
    client_phone: appt.client_phone||'',
    notes:        appt.notes||'',
    cancel_reason:'',
  });
  const setE = (k,v) => setEf(p=>({...p,[k]:v}));

  /* encaissement */
  const basePrice = parseFloat(appt.total_amount)||parseFloat(appt.service_price)||0;
  const [checkAmt, setCheckAmt] = useState(basePrice>0?basePrice.toFixed(2):'');
  const [payMethod, setPayMethod]= useState('card');
  const [cnlNotify, setCnlNotify]= useState(true);

  const finalAmt = parseFloat(checkAmt)||0;
  const st = STATUS_CFG[appt.status]||STATUS_CFG.confirmed;

  /* onglets disponibles */
  const TABS = [
    { id:'detail',   label:'Details' },
    canMod && canAct  ? { id:'edit',     label:'✏️ Modifier'  } : null,
    canCnl && canAct  ? { id:'cancel',   label:'🚫 Annuler'   } : null,
    canEnc && !appt.paid && canAct ? { id:'checkout', label:'💰 Encaisser' } : null,
    isAdmin           ? { id:'delete',   label:'🗑 Supprimer' } : null,
  ].filter(Boolean);

  const inp = { background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text };

  /* ── save edit ── */
  const doEdit = async () => {
    setSaving(true);
    try {
      const dur = appt.total_duration||appt.duration_minutes||30;
      const end = fromMin(toMin(ef.start_time)+dur);
      const upd = await bookingApi.updateAppt(appt.id, {
        date:         ef.date,
        start_time:   ef.start_time,
        end_time:     end,
        status:       ef.status,
        employee_id:  ef.employee_id||null,
        client_name:  ef.client_name,
        client_email: ef.client_email||null,
        client_phone: ef.client_phone||null,
        notes:        ef.notes||null,
      });
      const merged = {...appt,...upd};
      setAppt(merged); onUpdated(merged); setTab('detail');
    } catch(e){ alert(e.message); } finally { setSaving(false); }
  };

  /* ── annulation ── */
  const doCancel = async () => {
    setSaving(true);
    try {
      const upd = await bookingApi.updateAppt(appt.id, {
        status: 'cancelled',
        cancel_reason: ef.cancel_reason||null,
        notify_client: cnlNotify && !!appt.client_email,
      });
      const merged = {...appt,...upd, status:'cancelled'};
      setAppt(merged); onUpdated(merged); setTab('detail');
    } catch(e){ alert(e.message); } finally { setSaving(false); }
  };

  /* ── encaissement ── */
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
        } catch(e){ alert(e.message); } finally { setSaving(false); }
      }
    );
  };

  /* ── suppression ── */
  const doDelete = async () => {
    if (!confirm('Supprimer ce rendez-vous ?')) return;
    setSaving(true);
    try {
      await bookingApi.deleteAppt(appt.id);
      onDeleted(appt.id);
      onClose();
    } catch(e){ alert(e.message); } finally { setSaving(false); }
  };

  return (
    <>
    <Modal open={true} onClose={onClose} title="Rendez-vous" theme={t} maxW={520}>

      {/* Tabs */}
      {TABS.length > 1 && (
        <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)' }}>
          {TABS.map(tb => (
            <button key={tb.id} onClick={()=>setTab(tb.id)}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all"
              style={{
                background: tab===tb.id
                  ? tb.id==='cancel'   ? 'rgba(248,113,113,0.18)'
                  : tb.id==='checkout' ? 'rgba(74,222,128,0.18)'
                  : tb.id==='delete'   ? 'rgba(248,113,113,0.18)'
                  : '#111827'
                  : 'transparent',
                color: tab===tb.id
                  ? (tb.id==='cancel'||tb.id==='delete') ? '#f87171'
                  : tb.id==='checkout' ? '#4ade80' : 'white'
                  : t.muted,
              }}>
              {tb.label}
            </button>
          ))}
        </div>
      )}

      {/* ── DÉTAIL ── */}
      {tab === 'detail' && (
        <div className="space-y-3">
          {/* Badge statut */}
          <div className="flex items-center justify-between p-3 rounded-xl"
            style={{ background:isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.02)', border:`1px solid ${t.border}` }}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:t.muted }}>Réservation</p>
              <p className="font-mono font-black text-base" style={{ color:t.text }}>#{(appt.id||'').substring(0,8).toUpperCase()}</p>
            </div>
            <span className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background:st.bg, color:st.color }}>{st.label}</span>
          </div>

          {/* Horaire + services */}
          <div className="rounded-xl overflow-hidden" style={{ border:`1px solid ${t.border}` }}>
            <InfoRow icon="📅" label="Date" value={fmtDateL(appt.date)} t={t} />
            <InfoRow icon="🕐" label="Heure" value={`${fmtTime(appt.start_time)} - ${fmtTime(appt.end_time)}`} t={t} border />
            {appt.employee_name && <InfoRow icon="👤" label="Employé" value={appt.employee_name} t={t} border />}

            {appt.items && appt.items.length > 0 ? (
              <div style={{ borderTop:`1px solid ${t.border}` }}>
                <div className="px-4 py-2" style={{ background:isDark?'rgba(17,24,39,0.06)':'rgba(17,24,39,0.03)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:isDark?'#e6edf3':'#111827' }}>Services</p>
                </div>
                {appt.items.map((it,i)=>(
                  <div key={i} className="flex items-center justify-between px-4 py-2.5" style={{ borderTop:`1px solid ${t.border}` }}>
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color:t.text }}>
                        {it.service_name}
                        {(it.qty||1)>1&&<span className="ml-1.5 text-xs font-black px-1.5 py-0.5 rounded-full" style={{ background:'rgba(17,24,39,0.15)',color:'#818cf8' }}>×{it.qty}</span>}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color:t.muted }}>{it.duration_minutes*(it.qty||1)}min</p>
                    </div>
                    {(it.unit_price||0)>0&&<p className="text-sm font-black ml-3" style={{ color:'#10b981' }}>{(parseFloat(it.unit_price)*(it.qty||1)).toFixed(2)} €</p>}
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderTop:`1px solid ${t.border}`, background:isDark?'rgba(16,185,129,0.06)':'rgba(16,185,129,0.03)' }}>
                  <p className="text-xs font-black uppercase" style={{ color:'#10b981' }}>{appt.discount_amount>0?'Total apres remise':'Total'}</p>
                  <div className="text-right">
                    {appt.discount_amount>0&&<p className="text-xs" style={{ color:'#94a3b8',textDecoration:'line-through',fontFamily:'monospace' }}>{parseFloat(appt.original_amount||0).toFixed(2)} €</p>}
                    <p className="font-black text-base" style={{ color:'#10b981',fontFamily:'monospace' }}>
                      {parseFloat(appt.total_amount||0)>0
                        ? parseFloat(appt.total_amount).toFixed(2)
                        : appt.items.reduce((s,it)=>s+parseFloat(it.unit_price||0)*(it.qty||1),0).toFixed(2)} €
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <InfoRow icon="✂️" label="Service"
                value={`${appt.service_name||'-'}  ${appt.total_duration||appt.duration_minutes||'?'}min${basePrice>0?' · '+basePrice.toFixed(2)+' €':''}`}
                t={t} border />
            )}
          </div>

          {/* Client */}
          <div className="rounded-xl overflow-hidden" style={{ border:`1px solid ${t.border}` }}>
            <InfoRow icon="👤" label="Client" value={appt.client_name} t={t} />
            {appt.client_phone&&<InfoRow icon="📞" label="Téléphone" value={appt.client_phone} t={t} border />}
            {appt.client_email&&<InfoRow icon="✉️" label="Email" value={appt.client_email} t={t} border />}
          </div>

          {appt.notes&&(
            <div className="rounded-xl p-3" style={{ background:'rgba(251,191,36,0.07)', border:'1px solid rgba(251,191,36,0.2)' }}>
              <p className="text-[10px] font-bold uppercase mb-1" style={{ color:'#fbbf24' }}>Notes</p>
              <p className="text-sm" style={{ color:t.text }}>{appt.notes}</p>
            </div>
          )}
          {appt.cancel_reason&&(
            <div className="rounded-xl p-3" style={{ background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.2)' }}>
              <p className="text-[10px] font-bold uppercase mb-1" style={{ color:'#f87171' }}>Motif d'annulation</p>
              <p className="text-sm" style={{ color:t.text }}>{appt.cancel_reason}</p>
            </div>
          )}
          {appt.paid&&(
            <div className="rounded-xl p-3 flex items-center gap-3" style={{ background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.2)' }}>
              <span style={{ fontSize:22 }}>✅</span>
              <div>
                <p className="text-sm font-bold" style={{ color:'#4ade80' }}>Encaissé</p>
                <p className="text-xs" style={{ color:t.muted }}>{PAY_OPTS.find(p=>p.id===appt.paid_method)?.label||appt.paid_method}</p>
              </div>
            </div>
          )}
          {TABS.length===1&&employee&&(
            <div className="rounded-xl p-3 flex items-center gap-2" style={{ background:isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)', border:`1px solid ${t.border}` }}>
              <span>🔒</span>
              <p className="text-xs" style={{ color:t.muted }}>Mode consultation — aucune action autorisée</p>
            </div>
          )}
        </div>
      )}

      {/* ── MODIFIER ── */}
      {tab === 'edit' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Date *</label>
              <input type="date" value={ef.date} onChange={e=>setE('date',e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={inp} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Heure *</label>
              <input type="time" value={ef.start_time} onChange={e=>setE('start_time',e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={inp} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Statut</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(STATUS_CFG).map(([k,v])=>(
                <button key={k} onClick={()=>setE('status',k)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border"
                  style={{ background:ef.status===k?v.bg:'transparent', borderColor:ef.status===k?v.color:t.border, color:ef.status===k?v.color:t.muted }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          {isAdmin && employees.length>0 && (
            <div>
              <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Employé</label>
              <select value={ef.employee_id} onChange={e=>setE('employee_id',e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={inp}>
                <option value="">Sans employé</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Nom client</label>
            <input value={ef.client_name} onChange={e=>setE('client_name',e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Téléphone</label>
              <input value={ef.client_phone} onChange={e=>setE('client_phone',e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={inp} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Email</label>
              <input type="email" value={ef.client_email} onChange={e=>setE('client_email',e.target.value)} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={inp} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Notes</label>
            <textarea value={ef.notes} onChange={e=>setE('notes',e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none resize-none" style={inp} />
          </div>
          <button disabled={saving||!ef.client_name.trim()} onClick={doEdit}
            className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-40"
            style={{ background:'#111827' }}>
            {saving?'Enregistrement...':'✅ Enregistrer'}
          </button>
        </div>
      )}

      {/* ── ANNULER ── */}
      {tab === 'cancel' && (
        <div className="space-y-3">
          <div className="rounded-xl p-3" style={{ background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.2)' }}>
            <p className="text-sm font-bold" style={{ color:'#f87171' }}>Annuler ce rendez-vous ?</p>
            <p className="text-xs mt-0.5" style={{ color:t.muted }}>{appt.client_name} · {fmtDateL(appt.date)} à {fmtTime(appt.start_time)}</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Motif (facultatif)</label>
            <textarea value={ef.cancel_reason} onChange={e=>setE('cancel_reason',e.target.value)} rows={3} placeholder="Raison…" className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none resize-none" style={inp} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ background:isDark?'rgba(255,255,255,0.03)':'#f9f9fb', border:`1px solid ${t.border}` }}>
            <div>
              <p className="text-sm font-semibold" style={{ color:t.text }}>Notifier le client</p>
              <p className="text-xs mt-0.5" style={{ color:t.muted }}>{appt.client_email?`→ ${appt.client_email}`:'Aucun email'}</p>
            </div>
            <Toggle on={cnlNotify&&!!appt.client_email} onChange={()=>setCnlNotify(p=>!p)} />
          </div>
          <div className="flex gap-2">
            <button onClick={()=>setTab('detail')} className="flex-1 py-3 rounded-2xl font-bold text-sm" style={{ background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6', border:`1px solid ${t.border}`, color:t.muted }}>Retour</button>
            <button onClick={doCancel} disabled={saving} className="flex-1 py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-40" style={{ background:'linear-gradient(135deg,#ef4444,#f97316)' }}>{saving?'...':'Confirmer'}</button>
          </div>
        </div>
      )}

      {/* ── ENCAISSER ── */}
      {tab === 'checkout' && (
        <div className="space-y-4">
          <div className="rounded-xl overflow-hidden" style={{ border:`1px solid ${t.border}` }}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ background:isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)', borderBottom:`1px solid ${t.border}` }}>
              <span className="text-xs font-bold uppercase" style={{ color:t.muted }}>Client</span>
              <span className="text-sm font-bold" style={{ color:t.text }}>{appt.client_name}</span>
            </div>
            {appt.items && appt.items.length > 0 ? appt.items.map((it,i)=>(
              <div key={i} className="flex items-center justify-between px-4 py-2.5" style={{ borderTop:`1px solid ${t.border}` }}>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color:t.text }}>{it.service_name}{(it.qty||1)>1&&<span className="ml-1 text-xs">×{it.qty}</span>}</p>
                  <p className="text-xs" style={{ color:t.muted }}>{(it.duration_minutes||0)*(it.qty||1)}min</p>
                </div>
                {(it.unit_price||0)>0&&<span className="text-sm font-black" style={{ color:'#10b981' }}>{(parseFloat(it.unit_price)*(it.qty||1)).toFixed(2)} €</span>}
              </div>
            )) : (
              <div className="px-4 py-2.5" style={{ borderTop:`1px solid ${t.border}` }}>
                <p className="text-sm" style={{ color:t.text }}>{appt.service_name||'-'}</p>
              </div>
            )}
            {basePrice>0&&(
              <div className="flex justify-between px-4 py-2" style={{ borderTop:`1px solid ${t.border}`, background:isDark?'rgba(16,185,129,0.05)':'rgba(16,185,129,0.03)' }}>
                <p className="text-xs font-black uppercase" style={{ color:'#10b981' }}>Total</p>
                <p className="text-sm font-black" style={{ color:'#10b981',fontFamily:'monospace' }}>{basePrice.toFixed(2)} €</p>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase" style={{ color:t.muted }}>Montant à encaisser</p>
              {basePrice>0&&checkAmt!==basePrice.toFixed(2)&&(
                <button onClick={()=>setCheckAmt(basePrice.toFixed(2))} className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ background:'rgba(17,24,39,0.12)',color:'#a5a0ff' }}>
                  ↺ {basePrice.toFixed(2)} €
                </button>
              )}
            </div>
            <div style={{ position:'relative' }}>
              <input type="number" step="0.01" min="0" value={checkAmt} onChange={e=>setCheckAmt(e.target.value)} placeholder="0.00"
                className="w-full px-5 py-5 rounded-2xl font-black focus:outline-none text-center"
                style={{ fontSize:38, background:isDark?'rgba(74,222,128,0.07)':'rgba(74,222,128,0.06)', border:'2px solid rgba(74,222,128,0.35)', color:'#4ade80', fontFamily:'monospace' }} />
              <span style={{ position:'absolute',right:16,top:'50%',transform:'translateY(-50%)',fontSize:20,fontWeight:900,color:'rgba(74,222,128,0.5)',pointerEvents:'none' }}>€</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase mb-2" style={{ color:t.muted }}>Mode de paiement</p>
            <div className="grid grid-cols-2 gap-2">
              {PAY_OPTS.map(p=>(
                <button key={p.id} onClick={()=>setPayMethod(p.id)}
                  className="flex items-center gap-2.5 p-3.5 rounded-xl font-bold text-sm"
                  style={{ background:payMethod===p.id?'rgba(74,222,128,0.12)':(isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'), border:`1px solid ${payMethod===p.id?'rgba(74,222,128,0.4)':t.border}`, color:payMethod===p.id?'#4ade80':t.muted }}>
                  <span style={{ fontSize:18 }}>{p.icon}</span>{p.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={doCheckout} disabled={saving||finalAmt<0} className="w-full py-4 rounded-2xl font-black text-white text-lg disabled:opacity-40" style={{ background:'linear-gradient(135deg,#4ade80,#22c55e)', boxShadow:'0 8px 30px rgba(74,222,128,0.3)' }}>
            {saving?'...':`💰 Encaisser${finalAmt>0?' - '+finalAmt.toFixed(2)+' €':''}`}
          </button>
        </div>
      )}

      {/* ── SUPPRIMER ── */}
      {tab === 'delete' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 text-center" style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)' }}>
            <p className="text-2xl mb-2">🗑</p>
            <p className="text-sm font-bold" style={{ color:'#f87171' }}>Supprimer définitivement ce RDV ?</p>
            <p className="text-xs mt-1" style={{ color:t.muted }}>{appt.client_name} · {fmtDateL(appt.date)} à {fmtTime(appt.start_time)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>setTab('detail')} className="flex-1 py-3 rounded-2xl font-bold text-sm" style={{ background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6', border:`1px solid ${t.border}`, color:t.muted }}>Annuler</button>
            <button onClick={doDelete} disabled={saving} className="flex-1 py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-40" style={{ background:'linear-gradient(135deg,#ef4444,#dc2626)' }}>{saving?'...':'Supprimer'}</button>
          </div>
        </div>
      )}
    </Modal>
    {PinModalNode}
    </>
  );
}

function AddApptModal({ employees, services, selectedDate, onSave, onClose, theme: t }) {
  const isDark   = t.mode === 'dark';
  const IS       = { background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text };
  const CL       = 'w-full px-3 py-3 rounded-xl text-sm focus:outline-none';

  const [client, setClient] = useState({
    name:'', email:'', phone:'',
    date: selectedDate ? svLocal(selectedDate) : svLocal(new Date()),
    start_time:'09:00', notes:'',
    employee_id:'',
  });
  const setC = (k,v) => setClient(p=>({...p,[k]:v}));

  const [cart, setCart]               = useState([]);
  const [customDuration, setCustomDuration] = useState('');
  const [saving, setSaving]           = useState(false);

  const actSvcs = (services||[]).filter(s=>s.is_active!==false);
  const actEmps = (employees||[]).filter(e=>e.is_active!==false);

  const autoTotal    = cart.reduce((s,it)=>s+it.unit_price*it.qty, 0);
  const autoDuration = cart.reduce((s,it)=>s+it.duration_minutes*it.qty, 0);
  const totalDuration = customDuration!=='' ? parseInt(customDuration)||0 : autoDuration;

  const endTime = (() => {
    if (!client.start_time || totalDuration<=0) return '';
    return fromMin(toMin(client.start_time)+totalDuration);
  })();

  const addSvc = (svc) => setCart(prev => {
    const idx = prev.findIndex(it=>it.service_id===svc.id);
    if (idx>=0) { const n=[...prev]; n[idx]={...n[idx],qty:n[idx].qty+1}; return n; }
    return [...prev, { service_id:svc.id, service_name:svc.name, qty:1, unit_price:parseFloat(svc.price)||0, duration_minutes:svc.duration_minutes||0, color:svc.color||'#111827' }];
  });
  const changeQty = (idx,delta) => setCart(prev => {
    const n=[...prev]; const q=(n[idx].qty||1)+delta;
    if (q<=0) return prev.filter((_,i)=>i!==idx);
    n[idx]={...n[idx],qty:q}; return n;
  });
  const setPrice = (idx,val) => setCart(prev=>{ const n=[...prev]; n[idx]={...n[idx],unit_price:parseFloat(val)||0}; return n; });

  const handleSave = async () => {
    if (!client.name.trim()||!client.date||!client.start_time) return;
    setSaving(true);
    try {
      await onSave({
        employee_id:    client.employee_id||null,
        client_name:    client.name,
        client_email:   client.email||null,
        client_phone:   client.phone||null,
        date:           client.date,
        start_time:     client.start_time,
        notes:          client.notes||null,
        items:          cart,
        total_amount:   autoTotal,
        total_duration: totalDuration,
        custom_duration: customDuration!=='' ? parseInt(customDuration)||0 : null,
      });
      onClose();
    } catch(e){ alert(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal open={true} onClose={onClose} title="Nouveau rendez-vous" theme={t}>
      <div className="space-y-4">

        {/* ── Client ── */}
        <div className="rounded-xl overflow-hidden" style={{ border:`1px solid ${t.border}` }}>
          <div className="px-4 py-2" style={{ background:isDark?'rgba(17,24,39,0.08)':'rgba(17,24,39,0.05)', borderBottom:`1px solid ${t.border}` }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:isDark?'#e6edf3':'#111827' }}>👤 Client</p>
          </div>
          <div className="p-3 space-y-2">
            <input value={client.name} onChange={e=>setC('name',e.target.value)} placeholder="Prénom Nom *" className={CL} style={IS} />
            <div className="grid grid-cols-2 gap-2">
              <input value={client.phone} onChange={e=>setC('phone',e.target.value)} placeholder="📞 Téléphone" className={CL} style={IS} />
              <input type="email" value={client.email} onChange={e=>setC('email',e.target.value)} placeholder="✉️ Email" className={CL} style={IS} />
            </div>
            {client.email&&(
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.2)' }}>
                <span style={{ fontSize:12 }}>📧</span>
                <p className="text-xs" style={{ color:'#4ade80' }}>Confirmation envoyée automatiquement</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Employé ── */}
        {actEmps.length>0&&(
          <div className="rounded-xl overflow-hidden" style={{ border:`1px solid ${t.border}` }}>
            <div className="px-4 py-2" style={{ background:isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)', borderBottom:`1px solid ${t.border}` }}>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:t.muted }}>👤 Employé</p>
            </div>
            <div className="p-3">
              <div className="flex flex-wrap gap-2">
                <button onClick={()=>setC('employee_id','')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                  style={{ background:!client.employee_id?'rgba(17,24,39,0.15)':(isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'), border:`1px solid ${!client.employee_id?'rgba(17,24,39,0.4)':t.border}`, color:!client.employee_id?'#a5a0ff':t.muted }}>
                  Aucun
                </button>
                {actEmps.map(emp=>(
                  <button key={emp.id} onClick={()=>setC('employee_id',emp.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                    style={{ background:client.employee_id===emp.id?'rgba(17,24,39,0.15)':(isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'), border:`1px solid ${client.employee_id===emp.id?'rgba(17,24,39,0.4)':t.border}`, color:client.employee_id===emp.id?'#a5a0ff':t.muted }}>
                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-white font-black flex-shrink-0"
                      style={{ fontSize:8, backgroundColor:emp.avatar_color||'#111827' }}>{emp.name.charAt(0)}</div>
                    {emp.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Services / Produits ── */}
        <div className="rounded-xl overflow-hidden" style={{ border:`1px solid ${t.border}` }}>
          <div className="px-4 py-2" style={{ background:isDark?'rgba(17,24,39,0.08)':'rgba(17,24,39,0.05)', borderBottom:`1px solid ${t.border}` }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:isDark?'#e6edf3':'#111827' }}>✂️ Services / Produits</p>
          </div>
          {actSvcs.length>0 ? (
            <div className="p-3">
              <div className="grid grid-cols-2 gap-2">
                {actSvcs.map(svc=>{
                  const inCart = cart.find(it=>it.service_id===svc.id);
                  return (
                    <button key={svc.id} onClick={()=>addSvc(svc)}
                      className="rounded-xl p-3 text-left transition-all active:scale-95"
                      style={{ background:inCart?'rgba(17,24,39,0.12)':(isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'), border:`1px solid ${inCart?'rgba(17,24,39,0.4)':t.border}` }}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-lg flex-shrink-0" style={{ background:svc.color||'#111827' }} />
                        <p className="text-xs font-bold leading-tight truncate flex-1" style={{ color:t.text }}>{svc.name}</p>
                        {inCart&&<span className="ml-auto text-xs font-black px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background:'rgba(17,24,39,0.2)', color:'#818cf8' }}>×{inCart.qty}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px]" style={{ color:t.muted }}>{svc.duration_minutes}min</span>
                        {parseFloat(svc.price)>0&&<span className="text-[10px] font-bold" style={{ color:'#10b981' }}>{parseFloat(svc.price).toFixed(2)} €</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="px-4 py-3"><p className="text-xs" style={{ color:t.muted }}>Aucun service actif configuré.</p></div>
          )}

          {/* Cart */}
          {cart.length>0&&(
            <div className="px-3 pb-3 space-y-2">
              <div className="h-px" style={{ background:t.border }} />
              {cart.map((it,idx)=>(
                <div key={idx} className="rounded-xl p-3" style={{ background:isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)', border:`1px solid ${t.border}` }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ background:it.color||'#111827' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color:t.text }}>{it.service_name}</p>
                      <p className="text-xs" style={{ color:t.muted }}>{it.duration_minutes}min/unité</p>
                    </div>
                    {/* Prix éditable */}
                    <div style={{ position:'relative', width:76 }}>
                      <input type="number" step="0.01" min="0" value={it.unit_price}
                        onChange={e=>setPrice(idx,e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg text-right text-sm font-bold focus:outline-none"
                        style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:'#10b981', paddingRight:18 }} />
                      <span style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', fontSize:11, color:t.muted, pointerEvents:'none' }}>€</span>
                    </div>
                    {/* Qty */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={()=>changeQty(idx,-1)} className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-base"
                        style={{ background:'rgba(248,113,113,0.12)', color:'#f87171' }}>−</button>
                      <span className="w-5 text-center font-black text-sm" style={{ color:t.text }}>{it.qty}</span>
                      <button onClick={()=>changeQty(idx,1)} className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-base"
                        style={{ background:'rgba(17,24,39,0.12)', color:'#818cf8' }}>+</button>
                    </div>
                    <button onClick={()=>setCart(p=>p.filter((_,i)=>i!==idx))} className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
                      style={{ background:'rgba(248,113,113,0.1)', color:'#f87171' }}>🗑</button>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2" style={{ borderTop:`1px solid ${t.border}` }}>
                    <span className="text-xs" style={{ color:t.muted }}>{it.duration_minutes*it.qty}min total</span>
                    <span className="text-sm font-black" style={{ color:'#10b981' }}>{(it.unit_price*it.qty).toFixed(2)} €</span>
                  </div>
                </div>
              ))}
              <div className="rounded-xl p-3 flex items-center justify-between" style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.25)' }}>
                <p className="text-xs font-black uppercase" style={{ color:'#10b981' }}>TOTAL</p>
                <p className="font-black text-xl" style={{ color:'#10b981', fontFamily:'monospace' }}>{autoTotal.toFixed(2)} €</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Horaire ── */}
        <div className="rounded-xl overflow-hidden" style={{ border:`1px solid ${t.border}` }}>
          <div className="px-4 py-2" style={{ background:isDark?'rgba(251,191,36,0.08)':'rgba(251,191,36,0.05)', borderBottom:`1px solid ${t.border}` }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:'#fbbf24' }}>🕐 Horaire</p>
          </div>
          <div className="p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold block mb-1" style={{ color:t.muted }}>Date *</label>
                <input type="date" value={client.date} onChange={e=>setC('date',e.target.value)} className={CL} style={IS} />
              </div>
              <div>
                <label className="text-xs font-bold block mb-1" style={{ color:t.muted }}>Début *</label>
                <input type="time" value={client.start_time} onChange={e=>setC('start_time',e.target.value)} className={CL} style={IS} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold" style={{ color:t.muted }}>
                  Durée{autoDuration>0&&customDuration===''&&<span className="ml-2 font-normal" style={{ color:'#10b981' }}>(auto : {autoDuration}min)</span>}
                </label>
                {customDuration!==''&&(
                  <button onClick={()=>setCustomDuration('')} className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background:'rgba(17,24,39,0.12)', color:'#a5a0ff' }}>
                    ↺ Auto ({autoDuration}min)
                  </button>
                )}
              </div>
              <div style={{ position:'relative' }}>
                <input type="number" min="1" step="5"
                  value={customDuration!==''?customDuration:(autoDuration>0?String(autoDuration):'')}
                  onChange={e=>setCustomDuration(e.target.value)}
                  placeholder={autoDuration>0?String(autoDuration):'30'}
                  className={CL} style={{ ...IS, paddingRight:42 }} />
                <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:12, fontWeight:700, color:t.muted, pointerEvents:'none' }}>min</span>
              </div>
            </div>
            {endTime&&(
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:'rgba(17,24,39,0.08)', border:'1px solid rgba(17,24,39,0.2)' }}>
                <span style={{ fontSize:14 }}>🏁</span>
                <p className="text-xs font-semibold" style={{ color:'#a5a0ff' }}>Fin prévue à <strong>{endTime}</strong> ({totalDuration}min)</p>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-bold block mb-1" style={{ color:t.muted }}>Notes</label>
          <textarea value={client.notes} onChange={e=>setC('notes',e.target.value)} rows={2} placeholder="Informations…"
            className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none resize-none" style={IS} />
        </div>

        <button disabled={!client.name.trim()||!client.date||!client.start_time||saving}
          onClick={handleSave}
          className="w-full py-4 rounded-2xl font-bold text-white disabled:opacity-40 text-base"
          style={{ background:'#111827' }}>
          {saving?'Enregistrement...':`✅ Creer${autoTotal>0?' - '+autoTotal.toFixed(2)+' €':''}`}
        </button>
        {cart.length===0&&(
          <p className="text-xs text-center -mt-2" style={{ color:t.muted }}>Aucun service sélectionné (facultatif)</p>
        )}
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODAL SERVICE
   ═══════════════════════════════════════════════════════════════════════════ */
function ServiceModal({ svc, categories, onSave, onClose, theme: t }) {
  const isDark = t.mode === 'dark';
  const [form, setForm] = useState({
    name:             svc?.name||'',
    description:      svc?.description||'',
    duration_minutes: svc?.duration_minutes||30,
    price:            svc?.price||'',
    color:            svc?.color||'#111827',
    is_active:        svc?.is_active!==false,
    category_id:      svc?.category_id||'',
  });
  const [saving, setSaving] = useState(false);
  const cats = (categories||[]).filter(c=>!c.parent_id);
  const DURATIONS = [15,20,30,45,60,75,90,120];

  return (
    <Modal open={true} onClose={onClose} title={svc?'Modifier le service':'Nouveau service'} theme={t}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Nom *</label>
          <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ex: Coupe homme"
            className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none"
            style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Durée</label>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map(d=>(
              <button key={d} onClick={()=>setForm(f=>({...f,duration_minutes:d}))}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border"
                style={{ background:form.duration_minutes===d?'#111827':'transparent', borderColor:form.duration_minutes===d?'transparent':t.border, color:form.duration_minutes===d?'white':t.muted }}>
                {d}min
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Prix (€)</label>
            <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0.00"
              className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none"
              style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Couleur</label>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {COLORS.map(c=>(
                <button key={c} onClick={()=>setForm(f=>({...f,color:c}))}
                  className="w-7 h-7 rounded-full border-2 transition-transform"
                  style={{ backgroundColor:c, borderColor:form.color===c?'white':'transparent', transform:form.color===c?'scale(1.25)':'scale(1)' }} />
              ))}
            </div>
          </div>
        </div>
        {cats.length>0&&(
          <div>
            <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Catégorie</label>
            <select value={form.category_id} onChange={e=>setForm(f=>({...f,category_id:e.target.value}))}
              className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none"
              style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }}>
              <option value="">Sans catégorie</option>
              {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs font-bold uppercase block mb-1" style={{ color:t.muted }}>Description</label>
          <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2}
            className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none resize-none"
            style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl" style={{ background:t.inputBg }}>
          <span className="text-sm font-semibold" style={{ color:t.text }}>Service actif</span>
          <Toggle on={form.is_active} onChange={()=>setForm(f=>({...f,is_active:!f.is_active}))} colorOn="linear-gradient(90deg,#4ade80,#22c55e)" />
        </div>
        <button disabled={!form.name||saving} onClick={async()=>{ setSaving(true); try { await onSave(form); onClose(); } finally { setSaving(false); } }}
          className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-40"
          style={{ background:'#111827' }}>
          {saving?'Enregistrement...':'Enregistrer'}
        </button>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANNEAU PARAMÈTRES D'AFFICHAGE (heures, vue)
   ═══════════════════════════════════════════════════════════════════════════ */
function DisplaySettingsPanel({ displayCfg, onChange, theme: t }) {
  const isDark = t.mode === 'dark';
  const [open, setOpen] = useState(false);

  if (!open) return (
    <button onClick={()=>setOpen(true)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0"
      style={{ background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)', color:t.muted }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>
      Affichage
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0" onClick={()=>setOpen(false)} style={{ background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)' }} />
      <div className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-5 space-y-4"
        style={{ background:isDark?'#1c2128':'#fff', border:`1px solid ${isDark?'rgba(205,217,229,0.1)':'rgba(0,0,0,0.07)'}` }}>
        <div className="flex items-center justify-between">
          <p className="font-black text-base" style={{ color:t.text }}>⚙️ Paramètres d'affichage</p>
          <button onClick={()=>setOpen(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-sm" style={{ background:isDark?'rgba(255,255,255,0.08)':'#f3f4f6', color:t.muted }}>✕</button>
        </div>
        {/* Mode vue */}
        <div>
          <label className="text-xs font-bold uppercase block mb-2" style={{ color:t.muted }}>Mode d'affichage</label>
          <div className="grid grid-cols-2 gap-2">
            {[{id:'grid',label:'Grille (heures)',icon:'⏱'},{id:'list',label:'Liste (cartes)',icon:'📋'}].map(v=>(
              <button key={v.id} onClick={()=>onChange('viewMode',v.id)}
                className="flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-bold"
                style={{ background:displayCfg.viewMode===v.id?'rgba(17,24,39,0.15)':(isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'), border:`1px solid ${displayCfg.viewMode===v.id?'rgba(17,24,39,0.4)':t.border}`, color:displayCfg.viewMode===v.id?'#a5a0ff':t.muted }}>
                <span>{v.icon}</span>{v.label}
              </button>
            ))}
          </div>
        </div>
        {/* Plage horaire */}
        <div>
          <label className="text-xs font-bold uppercase block mb-2" style={{ color:t.muted }}>Heures affichées</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold mb-1" style={{ color:t.dim }}>Début</p>
              <input type="time" value={displayCfg.startHour} onChange={e=>onChange('startHour',e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
            </div>
            <div>
              <p className="text-[10px] font-bold mb-1" style={{ color:t.dim }}>Fin</p>
              <input type="time" value={displayCfg.endHour} onChange={e=>onChange('endHour',e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
            </div>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color:t.dim }}>Pour les horaires nocturnes (ex: 13h → 02h), entrez 13:00 et 02:00</p>
        </div>
        {/* Hauteur créneau */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold uppercase" style={{ color:t.muted }}>Hauteur par heure</label>
            <span className="text-xs font-bold" style={{ color:isDark?'#e6edf3':'#111827' }}>{displayCfg.hourH}px</span>
          </div>
          <input type="range" min="48" max="120" step="8" value={displayCfg.hourH} onChange={e=>onChange('hourH',parseInt(e.target.value))}
            className="w-full" style={{ accentColor:'#111827' }} />
        </div>
        <button onClick={()=>setOpen(false)} className="w-full py-3 rounded-2xl font-bold text-white" style={{ background:'#111827' }}>
          Appliquer
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   VUE GRILLE HORAIRE multi-colonnes (employés)
   ═══════════════════════════════════════════════════════════════════════════ */
function GridView({ appts, employees, dateStr, displayCfg, onApptClick, theme: t }) {
  const isDark  = t.mode === 'dark';
  const { hourH } = displayCfg;

  /* Calculer la plage d'heures à afficher — gère minuit */
  const hours = useMemo(() => {
    const startM = toMin(displayCfg.startHour||'08:00');
    const rawEnd = toMin(displayCfg.endHour||'20:00');
    // Si endHour < startHour → passage minuit
    const endM   = rawEnd <= startM ? rawEnd + 24*60 : rawEnd;
    const list = [];
    for (let m = startM; m < endM; m += 60) {
      list.push(m % (24*60)); // ramener à 0-1440
    }
    return list; // liste de minutes depuis minuit (ex: [780,840,...,60,120])
  }, [displayCfg.startHour, displayCfg.endHour]);

  const totalH = hours.length * hourH;

  const startMinDisplay = toMin(displayCfg.startHour||'08:00');
  const rawEndM = toMin(displayCfg.endHour||'20:00');
  const endMinDisplay = rawEndM <= startMinDisplay ? rawEndM + 24*60 : rawEndM;
  const rangeM = endMinDisplay - startMinDisplay;

  const getApptStyle = (appt) => {
    let startM = toMin(appt.start_time);
    let endM   = toMin(appt.end_time||appt.start_time);
    // Gérer le cas où l'heure de fin est après minuit (affichage nocturne)
    if (endM < startM) endM += 24*60;

    let relStart = startM - startMinDisplay;
    // Si passage minuit, corriger pour les heures < startMinDisplay
    if (relStart < 0) relStart += 24*60;

    const top    = (relStart / rangeM) * totalH;
    const height = Math.max(((endM - startM) / rangeM) * totalH, 18);
    return { top: Math.max(0,top), height };
  };

  const activeEmps = employees.filter(e=>e.is_active!==false && e.show_in_caisse!==false);

  return (
    <div className="flex overflow-auto flex-1" style={{ minHeight:0 }}>
      <div className="flex" style={{ minWidth: activeEmps.length>0 ? activeEmps.length*110+44 : 'auto' }}>

        {/* Axe heures */}
        <div className="flex-shrink-0 sticky left-0 z-10" style={{ width:44, background:isDark?'#111318':'#f5f5f7' }}>
          <div style={{ height:36, borderBottom:`1px solid ${isDark?'rgba(205,217,229,0.08)':'rgba(0,0,0,0.06)'}` }} />
          {hours.map((hm,i)=>(
            <div key={i} className="flex items-start justify-end pr-2"
              style={{ height:hourH, borderBottom:`1px solid ${isDark?'rgba(205,217,229,0.05)':'rgba(0,0,0,0.05)'}` }}>
              <span className="text-[10px] font-medium -mt-2" style={{ color:isDark?'#545d68':'#bbb' }}>
                {String(Math.floor(hm/60)).padStart(2,'0')}h
              </span>
            </div>
          ))}
        </div>

        {/* Colonnes employés */}
        {activeEmps.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <p className="text-sm" style={{ color:t.muted }}>Aucun employé actif</p>
          </div>
        ) : activeEmps.map(emp => {
          const empAppts = appts.filter(a => a.employee_id === emp.id);
          return (
            <div key={emp.id} className="flex-1 flex flex-col"
              style={{ minWidth:90, borderLeft:`1px solid ${isDark?'rgba(205,217,229,0.07)':'rgba(0,0,0,0.06)'}` }}>

              {/* Header employé */}
              <div className="flex flex-col items-center justify-center py-1.5 sticky top-0 z-10"
                style={{ height:36, background:isDark?'#111318':'#f5f5f7', borderBottom:`1px solid ${isDark?'rgba(205,217,229,0.08)':'rgba(0,0,0,0.06)'}` }}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-[9px]"
                  style={{ background:emp.avatar_color||'#111827' }}>{emp.name.charAt(0)}</div>
                <span className="text-[9px] font-medium mt-0.5 truncate px-1 w-full text-center" style={{ color:isDark?'#adbac7':'#6B7280' }}>
                  {emp.name.split(' ')[0]}
                </span>
              </div>

              {/* Zone temps */}
              <div className="relative flex-1" style={{ height:totalH }}>
                {hours.map((_,i)=>(
                  <div key={i} style={{ position:'absolute', left:0, right:0, top:i*hourH, height:hourH, borderBottom:`1px solid ${isDark?'rgba(205,217,229,0.04)':'rgba(0,0,0,0.04)'}` }} />
                ))}
                {empAppts.map(appt=>{
                  const {top,height} = getApptStyle(appt);
                  const sc = STATUS_GRID[appt.status]||STATUS_GRID.confirmed;
                  return (
                    <button key={appt.id} onClick={()=>onApptClick(appt)}
                      className="absolute left-0.5 right-0.5 rounded-lg overflow-hidden text-left"
                      style={{ top, height:Math.max(height,18), background:isDark?(emp.avatar_color+'22'):sc.bg, border:`1px solid ${isDark?(emp.avatar_color+'55'):sc.bd}`, cursor:'pointer', zIndex:2 }}>
                      <div className="px-1 py-0.5">
                        <p className="text-[9px] font-bold leading-tight truncate" style={{ color:isDark?(emp.avatar_color||'#111827'):sc.tx }}>
                          {appt.client_name}
                        </p>
                        {height>28&&(
                          <p className="text-[8px] leading-tight truncate" style={{ color:isDark?'rgba(255,255,255,0.5)':sc.tx, opacity:0.7 }}>
                            {fmtTime(appt.start_time)} · {appt.service_name||'RDV'}
                          </p>
                        )}
                        {height>46&&appt.paid&&(
                          <div className="w-2 h-2 rounded-full mt-0.5" style={{ background:'#22c55e' }} />
                        )}
                      </div>
                      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background:emp.avatar_color||'#111827' }} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ONGLET ÉQUIPE (horaires personnalisés employés)
   ═══════════════════════════════════════════════════════════════════════════ */

// Utilitaires horaires (côté client)
const toMinClient = (t) => { const s = String(t||'0:0').substring(0,5); const [h,m]=s.split(':').map(Number); return h*60+m; };

// Vérifie si une plage employé est dans les plages ouvertes du commerce (hors pauses)
function isSlotInBizRanges(slotStart, slotEnd, bizHours, bizBreaks, dayOfWeek) {
  const bh = bizHours.find(h=>(h.day_of_week??0)===dayOfWeek);
  if (!bh || bh.is_open===false) return false;
  const bizOpen  = toMinClient(bh.open_time||'09:00');
  const bizClose = toMinClient(bh.close_time||'18:00');
  const sMin = toMinClient(slotStart);
  const eMin = toMinClient(slotEnd);
  if (sMin < bizOpen || eMin > bizClose || sMin >= eMin) return false;
  // Vérifier que la plage ne chevauche pas une pause
  const dayBreaks = (bizBreaks||[]).filter(b=>(b.day_of_week??0)===dayOfWeek);
  for (const brk of dayBreaks) {
    const bs = toMinClient(brk.break_start);
    const be = toMinClient(brk.break_end);
    if (sMin < be && eMin > bs) return false; // chevauchement avec une pause
  }
  return true;
}

function TeamTab({ employees, businessHours, bizBreaks, showToast, theme: t }) {
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
          // Convertir ancien format → nouveau
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

/* ═══════════════════════════════════════════════════════════════════════════
   ONGLET CONFIG BOOKING
   ═══════════════════════════════════════════════════════════════════════════ */
function ConfigTab({ settings: initSettings, hours: initHours, onSaved, showToast, theme: t }) {
  const isDark = t.mode === 'dark';
  const [form, setForm] = useState({
    is_enabled:           initSettings?.is_enabled??false,
    slug:                 initSettings?.slug||'',
    business_description: initSettings?.business_description||'',
    address:              initSettings?.address||'',
    phone:                initSettings?.phone||'',
    advance_booking_days: initSettings?.advance_booking_days??30,
    min_notice_hours:     initSettings?.min_notice_hours??1,
    require_account:      initSettings?.require_account??false,
    google_business_url:  initSettings?.google_business_url||'',
  });
  const [hrs, setHrs] = useState(
    initHours.length ? initHours : Array.from({length:7},(_,i)=>({day_of_week:i,open_time:'09:00',close_time:'18:00',is_open:i>=1&&i<=5}))
  );
  const [breaks, setBreaks]     = useState([]);
  const [breaksLoaded, setBreaksLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    bookingApi.getBreaks().then(b => { setBreaks(Array.isArray(b)?b:[]); setBreaksLoaded(true); }).catch(()=>setBreaksLoaded(true));
  }, []);

  const addBreak = (dayOfWeek) => setBreaks(p => [...p, { day_of_week: dayOfWeek, break_start: '12:00', break_end: '14:00' }]);
  const removeBreak = (idx) => setBreaks(p => p.filter((_,i) => i !== idx));
  const updateBreak = (idx, key, val) => setBreaks(p => p.map((b,i) => i === idx ? {...b, [key]: val} : b));

  // ── Slug : validation et vérification dispo ──────────────────────────────
  const RESERVED = ['admin','api','app','www','mail','ftp','booking','book','login','register','dashboard','settings','static','assets','null','undefined','test','demo','dev'];
  const [slugStatus, setSlugStatus]   = useState('idle'); // 'idle'|'checking'|'ok'|'error'
  const [slugError,  setSlugError]    = useState('');
  const checkTimerRef = useRef(null);

  // Validation locale synchrone (format)
  const validateSlugFormat = (s) => {
    if (!s) return { ok: false, msg: 'L\'adresse de votre page est requise pour activer les reservations.' };
    if (s.length < 3) return { ok: false, msg: 'Minimum 3 caracteres requis.' };
    if (s.length > 50) return { ok: false, msg: 'Maximum 50 caracteres.' };
    if (!/^[a-z0-9]/.test(s)) return { ok: false, msg: 'Doit commencer par une lettre ou un chiffre.' };
    if (!/[a-z0-9]$/.test(s)) return { ok: false, msg: 'Doit se terminer par une lettre ou un chiffre.' };
    if (!/^[a-z0-9-]+$/.test(s)) return { ok: false, msg: 'Uniquement lettres minuscules, chiffres et tirets (-).' };
    if (/--/.test(s)) return { ok: false, msg: 'Pas de tirets consecutifs.' };
    if (RESERVED.includes(s)) return { ok: false, msg: `"${s}" est un nom reserve, choisissez un autre lien.` };
    return { ok: true };
  };

  const handleSlugChange = (raw) => {
    // Nettoyage auto : accents → ascii, espaces → tirets, caractères interdits supprimés
    const cleaned = raw
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .substring(0, 50);
    setForm(f => ({ ...f, slug: cleaned }));

    const fmt = validateSlugFormat(cleaned);
    if (!fmt.ok) {
      setSlugStatus('error');
      setSlugError(fmt.msg);
      clearTimeout(checkTimerRef.current);
      return;
    }

    // Si même slug que l'initial et déjà validé, pas besoin de re-checker
    if (cleaned === initSettings?.slug) {
      setSlugStatus('ok');
      setSlugError('');
      clearTimeout(checkTimerRef.current);
      return;
    }

    setSlugStatus('checking');
    setSlugError('');
    clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(async () => {
      try {
        const res = await bookingApi.checkSlug(cleaned);
        if (res.available) {
          setSlugStatus('ok');
          setSlugError('');
        } else {
          setSlugStatus('error');
          setSlugError(res.message || 'Cette adresse est deja prise.');
        }
      } catch {
        setSlugStatus('error');
        setSlugError('Impossible de vérifier la disponibilite.');
      }
    }, 500);
  };

  // Initialiser le statut du slug existant
  useEffect(() => {
    if (initSettings?.slug) {
      const fmt = validateSlugFormat(initSettings.slug);
      setSlugStatus(fmt.ok ? 'ok' : 'error');
      if (!fmt.ok) setSlugError(fmt.msg);
    }
  }, []);

  const slugOk     = slugStatus === 'ok' && form.slug.length >= 3;
  const canEnable  = slugOk; // ne peut activer les réservations que si le slug est valide
  const bookingUrl = form.slug && slugOk ? `${window.location.origin}/book/${form.slug}` : '';

  // Si l'utilisateur tente d'activer sans slug valide → forcer slug d'abord
  const handleToggleEnabled = () => {
    if (!form.is_enabled && !canEnable) {
      setSlugError('Definissez d\'abord une adresse de page valide avant d\'activer les reservations en ligne.');
      setSlugStatus('error');
      // Scroll vers le slug
      document.getElementById('slug-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setForm(f => ({ ...f, is_enabled: !f.is_enabled }));
  };

  const save = async () => {
    // Vérification finale avant save
    if (form.is_enabled && !canEnable) {
      showToast('Definissez une adresse de page valide avant d\'activer les réservations.', 'err');
      return;
    }
    if (form.slug && slugStatus !== 'ok') {
      showToast('L\'adresse de page n\'est pas valide ou disponible.', 'err');
      return;
    }
    setSaving(true);
    try {
      const s = await bookingApi.saveSettings(form);
      const h = await bookingApi.saveHours({hours:hrs});
      await bookingApi.saveBreaks({ breaks: breaks.map(b=>({ day_of_week:b.day_of_week, break_start:b.break_start, break_end:b.break_end })) });
      onSaved(s.settings, h);
      showToast('Parametres sauvegardes !');
    } catch(e){ showToast(e.message||'Erreur','err'); }
    finally { setSaving(false); }
  };

  const inp = { background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text };

  // Couleur et icône selon statut slug
  const slugStatusUI = {
    idle:     { color: t.muted,     icon: null,  border: t.inputBorder },
    checking: { color: '#f59e0b',   icon: '⏳',  border: 'rgba(245,158,11,0.4)' },
    ok:       { color: '#22c55e',   icon: '✓',   border: 'rgba(34,197,94,0.4)' },
    error:    { color: '#ef4444',   icon: '✕',   border: 'rgba(239,68,68,0.4)' },
  }[slugStatus];

  return (
    <div className="space-y-4 pb-8">

      {/* ── RÉSERVATIONS EN LIGNE : toggle avec gate ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${form.is_enabled ? 'rgba(34,197,94,0.35)' : t.border}`, transition:'border-color .2s' }}>
        <div className="p-4 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: form.is_enabled ? '#22c55e' : (isDark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.15)'), transition:'background .2s' }} />
              <p className="font-bold text-sm" style={{ color:t.text }}>Réservations en ligne</p>
            </div>
            <p className="text-xs mt-1 ml-4" style={{ color:t.muted }}>
              {form.is_enabled
                ? 'Vos clients peuvent reserver en ligne'
                : !canEnable
                ? 'Definissez une adresse de page pour activer'
                : 'Désactivé - vos clients ne peuvent pas reserver'}
            </p>
          </div>
          <Toggle on={form.is_enabled} onChange={handleToggleEnabled} colorOn="linear-gradient(90deg,#22c55e,#16a34a)" />
        </div>

        {/* Alerte si pas de slug valide et tentative d'activation */}
        {!canEnable && !form.is_enabled && (
          <div className="mx-4 mb-4 px-3 py-2.5 rounded-xl flex items-start gap-2" style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)' }}>
            <span className="text-sm flex-shrink-0 mt-0.5">⚠️</span>
            <p className="text-xs" style={{ color:'#d97706' }}>
              Pour activer les réservations, vous devez d'abord definir l'adresse de votre page de réservation ci-dessous.
            </p>
          </div>
        )}

        {/* Badge lien actif */}
        {form.is_enabled && bookingUrl && (
          <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.18)' }}>
            <span className="text-sm">🔗</span>
            <span className="text-xs font-mono flex-1 truncate" style={{ color:'#16a34a' }}>{bookingUrl}</span>
            <button onClick={()=>{navigator.clipboard.writeText(bookingUrl);showToast('Lien copie !');}} className="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0" style={{ background:'rgba(34,197,94,0.15)',color:'#16a34a' }}>Copier</button>
          </div>
        )}
      </div>

      {/* ── ADRESSE DE LA PAGE (SLUG) ── */}
      <div id="slug-section" className="rounded-2xl p-4 space-y-3" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${slugStatus==='error'?'rgba(239,68,68,0.35)':slugStatus==='ok'?'rgba(34,197,94,0.25)':t.border}`, transition:'border-color .2s' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-sm" style={{ color:t.text }}>Adresse de votre page</p>
            <p className="text-xs mt-0.5" style={{ color:t.muted }}>URL que vos clients utiliseront pour réserver</p>
          </div>
          {slugStatus === 'ok' && form.slug && (
            <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background:'rgba(34,197,94,0.1)', color:'#16a34a' }}>✓ Disponible</span>
          )}
        </div>

        {/* Input slug avec préfixe */}
        <div className="flex items-stretch rounded-xl overflow-hidden" style={{ border:`1.5px solid ${slugStatusUI.border}`, transition:'border-color .2s' }}>
          <span className="px-3 flex items-center text-xs font-mono font-semibold flex-shrink-0" style={{ color:t.muted, background:isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)', borderRight:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.08)'}` }}>
            /book/
          </span>
          <input
            value={form.slug}
            onChange={e => handleSlugChange(e.target.value)}
            placeholder="mon-salon"
            className="flex-1 py-3 px-3 text-sm focus:outline-none font-mono"
            style={{ background:t.inputBg, color:t.text }}
          />
          {slugStatusUI.icon && (
            <span className="px-3 flex items-center text-sm font-bold flex-shrink-0" style={{ color:slugStatusUI.color, background:t.inputBg }}>
              {slugStatus === 'checking' ? (
                <span className="inline-block w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor:`${slugStatusUI.color}30`, borderTopColor:slugStatusUI.color }} />
              ) : slugStatusUI.icon}
            </span>
          )}
        </div>

        {/* Message d'état du slug */}
        {slugStatus === 'error' && slugError && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.15)' }}>
            <span className="text-sm flex-shrink-0">🚫</span>
            <p className="text-xs font-semibold" style={{ color:'#ef4444' }}>{slugError}</p>
          </div>
        )}

        {/* Règles de format */}
        {form.slug.length > 0 && slugStatus !== 'ok' && slugStatus !== 'checking' && (
          <div className="space-y-1">
            {[
              { ok: form.slug.length >= 3,           label: 'Minimum 3 caracteres' },
              { ok: /^[a-z0-9-]+$/.test(form.slug),  label: 'Lettres minuscules, chiffres et tirets uniquement' },
              { ok: /^[a-z0-9]/.test(form.slug),     label: 'Commence par une lettre ou un chiffre' },
              { ok: /[a-z0-9]$/.test(form.slug),     label: 'Termine par une lettre ou un chiffre' },
              { ok: !RESERVED.includes(form.slug),   label: 'Nom non réserve' },
            ].map((rule,i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs" style={{ color: rule.ok ? '#22c55e' : '#ef4444' }}>{rule.ok ? '✓' : '✕'}</span>
                <span className="text-xs" style={{ color: rule.ok ? '#16a34a' : t.muted }}>{rule.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Prévisualisation du lien complet */}
        {bookingUrl && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background:'rgba(17,24,39,0.07)', border:'1px solid rgba(17,24,39,0.15)' }}>
            <span className="text-sm">🔗</span>
            <span className="text-xs font-mono flex-1 truncate" style={{ color:'#a5a0ff' }}>{bookingUrl}</span>
            <button
              onClick={()=>{navigator.clipboard.writeText(bookingUrl);showToast('Lien copie !');}}
              className="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0"
              style={{ background:'rgba(17,24,39,0.15)',color:'#a5a0ff' }}>
              Copier
            </button>
          </div>
        )}

        <p className="text-xs" style={{ color:t.dim }}>
          💡 Utilisez un nom court et mémorable (ex : <span className="font-mono">salon-marie</span>, <span className="font-mono">barbershop-leo</span>)
        </p>
      </div>

      {/* ── COMPTE CLIENT OBLIGATOIRE ── */}
      <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>
        <div>
          <p className="font-bold text-sm" style={{ color:t.text }}>Compte client obligatoire</p>
          <p className="text-xs mt-0.5" style={{ color:t.muted }}>Les clients doivent créer un compte pour réserver</p>
        </div>
        <Toggle on={form.require_account} onChange={()=>setForm(f=>({...f,require_account:!f.require_account}))} colorOn="linear-gradient(90deg,#f59e0b,#f97316)" />
      </div>

      {/* ── INFORMATIONS AFFICHÉES ── */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>
        <p className="font-bold text-sm" style={{ color:t.text }}>Informations affichées</p>
        {[['Description','business_description','textarea','Description de votre activite...'],['Adresse','address','text','12 rue de la Paix, Paris'],['Télephone','phone','tel','+33 6 00 00 00 00'],['Lien Google Business (optionnel)','google_business_url','url','https://g.page/votre-salon']].map(([label,key,type,ph])=>(
          <div key={key}>
            <label className="text-xs font-bold mb-1 block" style={{ color:t.muted }}>{label}</label>
            {type==='textarea'
              ?<textarea value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} rows={2} placeholder={ph} className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none resize-none" style={inp} />
              :<input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={inp} />
            }
          </div>
        ))}
      </div>

      {/* ── RÈGLES DE RÉSERVATION ── */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>
        <p className="font-bold text-sm" style={{ color:t.text }}>Règles de réservation</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color:t.muted }}>Réservation à l'avance (jours)</label>
            <input type="number" min="1" max="365" value={form.advance_booking_days} onChange={e=>setForm(f=>({...f,advance_booking_days:parseInt(e.target.value)||30}))} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={inp} />
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color:t.muted }}>Délai minimum (heures)</label>
            <input type="number" min="0" max="72" value={form.min_notice_hours} onChange={e=>setForm(f=>({...f,min_notice_hours:parseInt(e.target.value)||1}))} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={inp} />
          </div>
        </div>
      </div>

      {/* ── HORAIRES D'OUVERTURE ── */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>
        <div>
          <p className="font-bold text-sm" style={{ color:t.text }}>Horaires d'ouverture</p>
          <p className="text-xs mt-0.5" style={{ color:t.muted }}>Les jours fermés s'affichent en rouge dans le calendrier</p>
        </div>
        {hrs.map((h,i)=>(
          <div key={i} className="flex items-center gap-3">
            <Toggle on={h.is_open} onChange={()=>setHrs(p=>p.map((x,j)=>j===i?{...x,is_open:!x.is_open}:x))} colorOn="linear-gradient(90deg,#111827,#374151)" />
            <span className="text-sm font-bold w-10 flex-shrink-0" style={{ color:h.is_open?t.text:'#ef4444' }}>
              {DAYS_FR[h.day_of_week??i]}
            </span>
            {h.is_open ? (
              <div className="flex items-center gap-2 flex-1">
                <input type="time" value={h.open_time||'09:00'} onChange={e=>setHrs(p=>p.map((x,j)=>j===i?{...x,open_time:e.target.value}:x))} className="flex-1 px-2 py-1.5 rounded-xl text-xs focus:outline-none" style={inp} />
                <span className="text-xs" style={{ color:t.muted }}>→</span>
                <input type="time" value={h.close_time||'18:00'} onChange={e=>setHrs(p=>p.map((x,j)=>j===i?{...x,close_time:e.target.value}:x))} className="flex-1 px-2 py-1.5 rounded-xl text-xs focus:outline-none" style={inp} />
              </div>
            ) : (
              <span className="text-xs font-bold" style={{ color:'#ef4444' }}>Fermé</span>
            )}
          </div>
        ))}
        <p className="text-[10px] mt-1" style={{ color:t.dim }}>Pour les horaires nocturnes (ex: 13h → 02h), entrez 13:00 et 02:00</p>
      </div>

      {/* ── PAUSES & COUPURES ── */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-sm" style={{ color:t.text }}>Pauses &amp; coupures</p>
            <p className="text-xs mt-0.5" style={{ color:t.muted }}>Aucune réservation possible pendant ces créneaux</p>
          </div>
        </div>
        {!breaksLoaded ? (
          <div className="flex justify-center py-3"><div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor:'rgba(17,24,39,0.2)', borderTopColor:'#111827' }} /></div>
        ) : (
          <>
            {[0,1,2,3,4,5,6].map(day => {
              const dayBreaks = breaks.map((b,i)=>({...b,_idx:i})).filter(b=>b.day_of_week===day);
              const dayHour = hrs.find(h=>(h.day_of_week??0)===day);
              if (!dayHour?.is_open) return null;
              return (
                <div key={day}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold" style={{ color:t.muted }}>{['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][day]}</span>
                    <button onClick={()=>addBreak(day)} style={{ fontSize:11, color:'#111827', background:'rgba(17,24,39,0.1)', border:'none', borderRadius:8, padding:'3px 8px', cursor:'pointer', fontWeight:700 }}>+ Pause</button>
                  </div>
                  {dayBreaks.length === 0 ? (
                    <p className="text-xs" style={{ color:t.dim, fontStyle:'italic' }}>Aucune pause</p>
                  ) : dayBreaks.map(b => (
                    <div key={b._idx} className="flex items-center gap-2 mb-1.5 p-2 rounded-xl" style={{ background:'rgba(251,146,60,0.07)', border:'1px solid rgba(251,146,60,0.2)' }}>
                      <span className="text-xs" style={{ color:'#f97316' }}>☕</span>
                      <input type="time" value={b.break_start} onChange={e=>updateBreak(b._idx,'break_start',e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs focus:outline-none" style={inp} />
                      <span className="text-xs" style={{ color:t.muted }}>→</span>
                      <input type="time" value={b.break_end} onChange={e=>updateBreak(b._idx,'break_end',e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs focus:outline-none" style={inp} />
                      <button onClick={()=>removeBreak(b._idx)} style={{ width:26, height:26, borderRadius:8, background:'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', color:'#ef4444', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
                    </div>
                  ))}
                </div>
              );
            })}
            {hrs.every(h=>!h.is_open) && (
              <p className="text-xs text-center py-2" style={{ color:t.dim }}>Activez au moins un jour d'ouverture pour définir des pauses.</p>
            )}
          </>
        )}
      </div>

      <button onClick={save} disabled={saving} className="w-full py-4 rounded-2xl font-bold text-white disabled:opacity-40" style={{ background:'#111827' }}>
        {saving?'Sauvegarde...':'Sauvegarder'}
      </button>
    </div>
  );
}

/* ─── Carte RDV réutilisable (liste) ────────────────────────────────────── */
function ApptListCard({ a, onOpen, isDark, t }) {
  const st = STATUS_CFG[a.status]||STATUS_CFG.confirmed;
  return (
    <div className="rounded-2xl p-3.5" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-1 rounded-full self-stretch flex-shrink-0" style={{ background:a.service_color||a.employee_color||'#111827', minHeight:36 }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm" style={{ color:t.text }}>{fmtTime(a.start_time)}–{fmtTime(a.end_time)}</span>
              {a.paid&&<span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background:'rgba(74,222,128,0.15)',color:'#4ade80' }}>✓ Payé</span>}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background:st.bg, color:st.color }}>{st.label}</span>
            </div>
            <p className="font-semibold text-sm mt-0.5" style={{ color:t.text }}>{a.client_name}</p>
            <p className="text-xs mt-0.5" style={{ color:t.muted }}>
              {a.items&&a.items.length>1 ? `${a.items.length} services · ${a.total_duration||a.duration_minutes}min` : `${a.service_name||'RDV'} · ${a.total_duration||a.duration_minutes}min`}
              {parseFloat(a.total_amount||a.service_price||0)>0&&` · ${parseFloat(a.total_amount||a.service_price).toFixed(2)} €`}
            </p>
            {a.employee_name&&(
              <div className="flex items-center gap-1 mt-1">
                <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white font-black flex-shrink-0" style={{ fontSize:7, backgroundColor:a.employee_color||'#111827' }}>{a.employee_name.charAt(0)}</div>
                <span className="text-[10px]" style={{ color:t.muted }}>{a.employee_name}</span>
              </div>
            )}
            {a.client_phone&&<p className="text-xs mt-0.5" style={{ color:t.muted }}>📞 {a.client_phone}</p>}
          </div>
        </div>
        <button onClick={()=>onOpen(a)} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" style={{ color:t.muted }}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */
export default function Agenda({ employees=[], categories=[], theme: themeProp, onTxCreated }) {
  const { theme }  = useTheme();
  const t          = themeProp || theme;
  const isDark     = t.mode === 'dark';
  const [toast, showToast] = useToast();
  const location   = useLocation();
  const navigate   = useNavigate();

  // Quand Agenda est rendu sous /settings/agenda/*, le 3e segment pilote l'onglet
  const isInSettings = location.pathname.startsWith('/settings/agenda');
  const agendaSegment = isInSettings
    ? location.pathname.replace(/^\/settings\/agenda\/?/, '').split('/')[0] || ''
    : '';
  const AGENDA_TAB_MAP = { '': 'calendar', 'config': 'config' };
  const AGENDA_URL_MAP = { calendar: '/settings/agenda', config: '/settings/agenda/config' };

  /* ── State global ── */
  const [_mainTab, _setMainTab]         = useState('calendar');
  const mainTab    = isInSettings ? (AGENDA_TAB_MAP[agendaSegment] ?? 'calendar') : _mainTab;
  const setMainTab = isInSettings
    ? (id) => navigate(AGENDA_URL_MAP[id] || '/settings/agenda', { replace: false })
    : _setMainTab;
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [allAppts, setAllAppts]         = useState([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [services, setServices]         = useState([]);
  const [svcDragOver, setSvcDragOver]   = useState(null);
  const svcDragId = useRef(null); // useRef pour éviter stale closure dans onDrop
  const [settings, setSettings]         = useState(null);
  const [businessHours, setBusinessHours] = useState([]);
  const [bizBreaks, setBizBreaks]         = useState([]);
  const [closedDays, setClosedDays]     = useState([]);
  const [loading, setLoading]           = useState(true);

  /* ── Période : 'day' | 'week' | 'month' | 'custom' ── */
  const [periodMode, setPeriodMode]     = useState('week');
  const [periodOffset, setPeriodOffset] = useState(0); // décalage en unités de periodMode
  const [customFrom, setCustomFrom]     = useState('');
  const [customTo, setCustomTo]         = useState('');

  /* ── State modaux ── */
  const [editAppt, setEditAppt]         = useState(null);
  const [addApptOpen, setAddApptOpen]   = useState(false);
  const [svcModal, setSvcModal]         = useState(false);
  const [editSvc, setEditSvc]           = useState(null);

  /* ── Filtres ── */
  const [filterEmp, setFilterEmp]       = useState('');
  const [searchQ, setSearchQ]           = useState('');

  /* ── Config affichage ── */
  const [displayCfg, setDisplayCfg]     = useState({ viewMode:'grid', startHour:'08:00', endHour:'20:00', hourH:64 });
  const updateDisplay = (k,v) => setDisplayCfg(p=>({...p,[k]:v}));

  const refreshRef = useRef(null);

  /* Horaires → mettre à jour startHour/endHour auto selon le commerce */
  const syncDisplayFromHours = useCallback((hrs) => {
    const openDays = hrs.filter(h=>h.is_open!==false);
    if (!openDays.length) return;
    const minOpen  = Math.min(...openDays.map(h=>toMin(h.open_time||'08:00')));
    const maxClose = Math.max(...openDays.map(h=>toMin(h.close_time||'20:00')));
    setDisplayCfg(p=>({
      ...p,
      startHour: fromMin(Math.max(0, minOpen-60)),
      endHour:   fromMin(Math.min(24*60, maxClose+30)%(24*60)||maxClose+30),
    }));
  }, []);

  /* Chargement initial */
  useEffect(() => {
    Promise.all([bookingApi.getSettings(), bookingApi.getServices(), bookingApi.getHours(), bookingApi.getBreaks()])
      .then(([s,sv,h,b]) => {
        setSettings(s.settings);
        setServices(sv);
        const hrs = h.length ? h : Array.from({length:7},(_,i)=>({day_of_week:i,open_time:'09:00',close_time:'18:00',is_open:i>=1&&i<=5}));
        setBusinessHours(hrs);
        setBizBreaks(Array.isArray(b)?b:[]);
        setClosedDays(hrs.filter(x=>!x.is_open).map(x=>x.day_of_week));
        syncDisplayFromHours(hrs);
      })
      .finally(()=>setLoading(false));
  }, []);

  /* ── Calcul de la plage de dates selon la période ── */
  const today = useMemo(()=>new Date(),[]);

  const { periodFrom, periodTo, weekDays, periodLabel } = useMemo(()=>{
    const base = new Date(today);

    if (periodMode==='day') {
      const d = new Date(base);
      d.setDate(d.getDate()+periodOffset);
      const s = svLocal(d);
      return { periodFrom:s, periodTo:s, weekDays:[d], periodLabel:d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) };
    }

    if (periodMode==='week') {
      const start = new Date(base);
      start.setDate(base.getDate()-((base.getDay()+6)%7)+periodOffset*7);
      const days = Array.from({length:7},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d; });
      const mo = days[0].getMonth(); const yr = days[0].getFullYear();
      const sameMo = days[6].getMonth()===mo;
      const lbl = sameMo
        ? `${days[0].getDate()} - ${days[6].getDate()} ${MONTHS_FR[mo]} ${yr}`
        : `${days[0].getDate()} ${MONTHS_FR[mo]} - ${days[6].getDate()} ${MONTHS_FR[days[6].getMonth()]} ${yr}`;
      return { periodFrom:svLocal(days[0]), periodTo:svLocal(days[6]), weekDays:days, periodLabel:lbl };
    }

    if (periodMode==='month') {
      const yr  = base.getFullYear();
      const mo  = ((base.getMonth()+periodOffset)%12+12)%12;
      const yrAdj = yr + Math.floor((base.getMonth()+periodOffset)/12);
      const first = new Date(yrAdj,mo,1);
      const last  = new Date(yrAdj,mo+1,0);
      // jours du mois pour le calendrier
      const days = Array.from({length:last.getDate()},(_,i)=>new Date(yrAdj,mo,i+1));
      return { periodFrom:svLocal(first), periodTo:svLocal(last), weekDays:days, periodLabel:`${MONTHS_FR[mo]} ${yrAdj}` };
    }

    // custom
    if (customFrom&&customTo) {
      const f = new Date(customFrom); const to2 = new Date(customTo);
      const days = [];
      for (let d=new Date(f); d<=to2; d.setDate(d.getDate()+1)) days.push(new Date(d));
      return { periodFrom:customFrom, periodTo:customTo, weekDays:days, periodLabel:`${customFrom} → ${customTo}` };
    }
    return { periodFrom:svLocal(base), periodTo:svLocal(base), weekDays:[base], periodLabel:'Personnalise' };
  },[today,periodMode,periodOffset,customFrom,customTo]);

  /* Semaine affichée dans le mini-calendrier (toujours 7 jours) */
  const calWeekDays = useMemo(()=>{
    if (periodMode==='week') return weekDays;
    // Pour day/month/custom : afficher la semaine de la date sélectionnée
    const start = new Date(selectedDate);
    start.setDate(start.getDate()-((start.getDay()+6)%7));
    return Array.from({length:7},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d; });
  },[periodMode,weekDays,selectedDate]);

  /* Chargement RDV */
  const loadAppts = useCallback(async()=>{
    if (!periodFrom||!periodTo) return;
    setLoadingAppts(true);
    try {
      const data = await bookingApi.getAppointments({from:periodFrom,to:periodTo});
      setAllAppts(Array.isArray(data)?data:[]);
    } catch {} finally { setLoadingAppts(false); }
  },[periodFrom,periodTo]);

  useEffect(()=>{
    loadAppts();
    clearInterval(refreshRef.current);
    refreshRef.current = setInterval(loadAppts,30000);
    return ()=>clearInterval(refreshRef.current);
  },[loadAppts]);

  /* RDV filtrés pour le jour sélectionné */
  const selStr   = svLocal(selectedDate);
  const dayAppts = useMemo(()=>allAppts.filter(a=>{
    const d = typeof a.date==='string' ? a.date.substring(0,10) : '';
    if (d!==selStr) return false;
    if (filterEmp && a.employee_id!==filterEmp) return false;
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      return (a.client_name||'').toLowerCase().includes(q)
          || (a.client_phone||'').toLowerCase().includes(q)
          || (a.client_email||'').toLowerCase().includes(q)
          || (a.id||'').substring(0,8).toLowerCase().includes(q);
    }
    return true;
  }).sort((a,b)=>a.start_time.localeCompare(b.start_time)),[allAppts,selStr,filterEmp,searchQ]);

  /* RDV de toute la période filtrés (pour vue liste période) */
  const periodAppts = useMemo(()=>allAppts.filter(a=>{
    if (filterEmp && a.employee_id!==filterEmp) return false;
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      return (a.client_name||'').toLowerCase().includes(q)
          || (a.client_phone||'').toLowerCase().includes(q)
          || (a.client_email||'').toLowerCase().includes(q)
          || (a.id||'').substring(0,8).toLowerCase().includes(q);
    }
    return true;
  }).sort((a,b)=>a.date===b.date?a.start_time.localeCompare(b.start_time):a.date.localeCompare(b.date)),[allAppts,filterEmp,searchQ]);

  /* Compteur RDV par jour */
  const dayCounts = useMemo(()=>{
    const m={};
    (periodMode==='week'?weekDays:calWeekDays).forEach(d=>{ const s=svLocal(d); const l=allAppts.filter(a=>a.date?.substring(0,10)===s); m[s]={total:l.length,paid:l.filter(a=>a.paid).length}; });
    return m;
  },[periodMode,weekDays,calWeekDays,allAppts]);

  /* callbacks mise à jour */
  const onApptUpdated = useCallback(upd=>{ setAllAppts(p=>p.map(a=>a.id===upd.id?{...a,...upd}:a)); showToast('RDV mis a jour ✓'); },[]);
  const onApptDeleted = useCallback(id =>{ setAllAppts(p=>p.filter(a=>a.id!==id)); showToast('RDV supprime'); },[]);

  const MAIN_TABS = [
    {id:'calendar',label:'Agenda',  icon:'📅'},
    {id:'config',  label:'Config',  icon:'⚙️'},
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor:'rgba(17,24,39,0.2)', borderTopColor:'#111827' }} />
    </div>
  );

  return (
    <div className="space-y-0 flex flex-col lg:min-h-screen" style={{ minHeight:'calc(100vh - 80px)', background:t.bg, paddingBottom:0 }}>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* ── Tabs navigation ── */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex gap-1 p-1 rounded-2xl" style={{ background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)' }}>
          {MAIN_TABS.map(tb=>(
            <button key={tb.id} onClick={()=>setMainTab(tb.id)}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
              style={{ background:mainTab===tb.id?'#111827':'transparent', color:mainTab===tb.id?'white':t.muted }}>
              <span className="hidden sm:inline">{tb.icon} </span>{tb.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ CALENDRIER ══ */}
      {mainTab === 'calendar' && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="px-4 pb-2 flex-shrink-0 space-y-2">

            {/* ── SÉLECTEUR DE PÉRIODE ── */}
            <div className="rounded-2xl overflow-hidden" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>

              {/* Ligne 1 : modes période */}
              <div className="flex gap-0 border-b" style={{ borderColor:t.border }}>
                {[{id:'day',label:'Jour'},{id:'week',label:'Semaine'},{id:'month',label:'Mois'},{id:'custom',label:'Perso'}].map((m,i,arr)=>(
                  <button key={m.id} onClick={()=>{ setPeriodMode(m.id); setPeriodOffset(0); }}
                    className="flex-1 py-2 text-xs font-bold transition-all"
                    style={{
                      background: periodMode===m.id ? '#111827' : 'transparent',
                      color: periodMode===m.id ? 'white' : t.muted,
                      borderRight: i<arr.length-1 ? `1px solid ${t.border}` : 'none',
                    }}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Ligne 2 : navigation ◀ label ▶ + Aujourd'hui */}
              {periodMode !== 'custom' && (
                <div className="flex items-center justify-between px-3 py-2">
                  <button onClick={()=>setPeriodOffset(o=>o-1)}
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4" style={{ color:t.muted }}><polyline points="15 18 9 12 15 6"/></svg>
                  </button>

                  <div className="flex-1 flex items-center justify-center gap-2">
                    <span className="text-sm font-black text-center" style={{ color:t.text }}>{periodLabel}</span>
                    {loadingAppts&&<span className="w-3 h-3 rounded-full border border-t-transparent animate-spin inline-block" style={{ borderColor:'rgba(17,24,39,0.3)', borderTopColor:'#111827' }} />}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={()=>{ setPeriodOffset(0); setSelectedDate(new Date()); }}
                      className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl"
                      style={{ background:'rgba(17,24,39,0.1)', color:'#111827' }}>
                      Auj.
                    </button>
                    <button onClick={()=>setPeriodOffset(o=>o+1)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4" style={{ color:t.muted }}><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Plage personnalisée */}
              {periodMode === 'custom' && (
                <div className="flex items-center gap-2 px-3 py-2">
                  <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}
                    className="flex-1 px-2 py-2 rounded-xl text-xs focus:outline-none"
                    style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
                  <span className="text-xs font-bold" style={{ color:t.muted }}>→</span>
                  <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}
                    className="flex-1 px-2 py-2 rounded-xl text-xs focus:outline-none"
                    style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
                  {loadingAppts&&<span className="w-3 h-3 rounded-full border border-t-transparent animate-spin flex-shrink-0" style={{ borderColor:'rgba(17,24,39,0.3)', borderTopColor:'#111827' }} />}
                </div>
              )}

              {/* Mini-calendrier semaine (sauf mode mois) */}
              {periodMode !== 'month' && (
                <div className="px-3 pb-2">
                  <div className="grid grid-cols-7 gap-0.5">
                    {calWeekDays.map((d,i)=>{
                      const ds  = svLocal(d);
                      const info = dayCounts[ds]||{total:0,paid:0};
                      const isT   = d.toDateString()===today.toDateString();
                      const isSel = d.toDateString()===selectedDate.toDateString();
                      const isClosed = closedDays.includes(d.getDay());
                      return (
                        <button key={i} onClick={()=>setSelectedDate(new Date(d))}
                          className="flex flex-col items-center py-1.5 rounded-xl transition-all active:scale-95"
                          style={{
                            background: isSel ? '#111827'
                              : isClosed ? (isDark?'rgba(248,113,113,0.1)':'rgba(239,68,68,0.07)')
                              : isT      ? (isDark?'rgba(17,24,39,0.2)':'rgba(17,24,39,0.1)')
                              : 'transparent',
                            border: isClosed&&!isSel ? '1px solid rgba(239,68,68,0.15)' : '1px solid transparent',
                          }}>
                          <span className="text-[9px] font-bold" style={{ color:isSel?'rgba(255,255,255,0.75)':isClosed?'#ef4444':t.muted }}>{DAYS_FR[d.getDay()]}</span>
                          <span className="text-sm font-black" style={{ color:isSel?'white':isClosed?'#ef4444':isT?'#111827':t.text }}>{d.getDate()}</span>
                          {info.total>0 ? (
                            <div className="flex items-center gap-0.5 mt-0.5">
                              <span className="text-[8px] font-black px-1 rounded-full" style={{ background:isSel?'rgba(255,255,255,0.25)':'rgba(17,24,39,0.15)', color:isSel?'white':'#111827' }}>{info.total}</span>
                              {info.paid>0&&<span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background:'#4ade80' }} />}
                            </div>
                          ) : <div style={{ height:13 }} />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 mt-1 px-1">
                    <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-violet-500" /><span className="text-[9px]" style={{ color:t.muted }}>RDV</span></div>
                    <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ background:'#4ade80' }} /><span className="text-[9px]" style={{ color:t.muted }}>Encaissé</span></div>
                    <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-[9px]" style={{ color:t.muted }}>Fermé</span></div>
                  </div>
                </div>
              )}

              {/* Vue mois : grille jours */}
              {periodMode === 'month' && (
                <div className="px-3 pb-2">
                  {/* Entêtes jours */}
                  <div className="grid grid-cols-7 mb-1">
                    {DAYS_FR.map((d,i)=>(
                      <div key={i} className="text-center text-[9px] font-black py-1" style={{ color:t.muted }}>{d}</div>
                    ))}
                  </div>
                  {/* Grille du mois — en commençant au bon jour */}
                  {(() => {
                    const firstDay = weekDays[0]; // 1er du mois
                    const offset = (firstDay.getDay()+6)%7; // lundi=0
                    const cells = [];
                    for(let i=0;i<offset;i++) cells.push(null);
                    weekDays.forEach(d=>cells.push(d));
                    // compléter jusqu'à multiple de 7
                    while(cells.length%7!==0) cells.push(null);
                    return (
                      <div className="grid grid-cols-7 gap-0.5">
                        {cells.map((d,i)=>{
                          if(!d) return <div key={i} />;
                          const ds   = svLocal(d);
                          const info = dayCounts[ds]||{total:0,paid:0};
                          const isT   = d.toDateString()===today.toDateString();
                          const isSel = d.toDateString()===selectedDate.toDateString();
                          const isClosed = closedDays.includes(d.getDay());
                          return (
                            <button key={i} onClick={()=>setSelectedDate(new Date(d))}
                              className="flex flex-col items-center py-1 rounded-lg transition-all"
                              style={{
                                background: isSel?'#111827':isClosed?(isDark?'rgba(248,113,113,0.08)':'rgba(239,68,68,0.05)'):isT?(isDark?'rgba(17,24,39,0.2)':'rgba(17,24,39,0.08)'):'transparent',
                                border: isClosed&&!isSel?'1px solid rgba(239,68,68,0.12)':'1px solid transparent',
                              }}>
                              <span className="text-[11px] font-black" style={{ color:isSel?'white':isClosed?'#ef4444':isT?'#111827':t.text }}>{d.getDate()}</span>
                              {info.total>0&&<span className="text-[8px] font-black px-1 rounded-full" style={{ background:isSel?'rgba(255,255,255,0.25)':'rgba(17,24,39,0.12)', color:isSel?'white':'#111827' }}>{info.total}</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* ── BARRE ACTIONS : + RDV | filtres | recherche | affichage ── */}
            <div className="flex items-center gap-2">
              {/* Bouton + RDV — gros, bien visible */}
              <button onClick={()=>setAddApptOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black text-white flex-shrink-0 shadow-lg"
                style={{ background:'#111827', boxShadow:'0 4px 14px rgba(17,24,39,0.4)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                RDV
              </button>

              {/* Filtre employé */}
              {employees.length>0&&(
                <div className="flex gap-1 overflow-x-auto flex-1 min-w-0 no-scrollbar">
                  <button onClick={()=>setFilterEmp('')}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
                    style={{ background:!filterEmp?'rgba(17,24,39,0.2)':(isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)'), color:!filterEmp?'#a5a0ff':t.muted, border:`1px solid ${!filterEmp?'rgba(17,24,39,0.35)':t.border}` }}>
                    Tous
                  </button>
                  {employees.filter(e=>e.is_active!==false).map(emp=>(
                    <button key={emp.id} onClick={()=>setFilterEmp(filterEmp===emp.id?'':emp.id)}
                      className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
                      style={{ background:filterEmp===emp.id?'rgba(17,24,39,0.15)':(isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)'), color:filterEmp===emp.id?'#a5a0ff':t.muted, border:`1px solid ${filterEmp===emp.id?'rgba(17,24,39,0.35)':t.border}` }}>
                      <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white font-black flex-shrink-0" style={{ fontSize:7, backgroundColor:emp.avatar_color||'#111827' }}>{emp.name.charAt(0)}</div>
                      {emp.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}

              <DisplaySettingsPanel displayCfg={displayCfg} onChange={updateDisplay} theme={t} />
            </div>

            {/* Recherche */}
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:t.dim }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Nom, téléphone, email, n° réservation…"
                className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background:t.inputBg, border:`1px solid ${searchQ?'rgba(17,24,39,0.4)':t.inputBorder}`, color:t.text }} />
              {searchQ&&<button onClick={()=>setSearchQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color:t.muted }}>✕</button>}
            </div>

            {/* Bannière jour fermé (seulement hors mode période) */}
            {periodMode!=='month'&&periodMode!=='custom'&&closedDays.includes(selectedDate.getDay())&&(
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.18)' }}>
                <span>🔴</span><p className="text-sm font-semibold" style={{ color:'#ef4444' }}>Commerce fermé ce jour</p>
              </div>
            )}

            {/* Résumé période */}
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm" style={{ color:t.text }}>
                {periodMode==='day'||periodMode==='week'
                  ? <>{selectedDate.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}<span className="ml-2 font-normal text-xs" style={{ color:t.muted }}>{dayAppts.length} RDV</span></>
                  : <>{periodLabel}<span className="ml-2 font-normal text-xs" style={{ color:t.muted }}>{periodAppts.length} RDV</span></>
                }
              </p>
              <button onClick={loadAppts} className="w-8 h-8 rounded-xl flex items-center justify-center text-sm" style={{ background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)', color:t.muted }}>↻</button>
            </div>
          </div>

          {/* ── CONTENU selon mode ── */}

          {/* Mode jour/semaine → grille horaire ou liste du jour sélectionné */}
          {(periodMode==='day'||periodMode==='week') && (
            displayCfg.viewMode === 'grid' ? (
              <div className="flex-1 overflow-auto min-h-0" style={{ borderTop:`1px solid ${t.border}` }}>
                <GridView
                  appts={dayAppts}
                  employees={filterEmp ? employees.filter(e=>e.id===filterEmp) : employees}
                  dateStr={selStr}
                  displayCfg={displayCfg}
                  onApptClick={setEditAppt}
                  theme={t}
                />
              </div>
            ) : (
              <div className="flex-1 overflow-auto px-4 pb-24 space-y-3 pt-1">
                {dayAppts.length===0 ? (
                  <div className="rounded-2xl py-14 text-center" style={{ border:`1px dashed ${t.border}` }}>
                    <p className="text-2xl mb-2">📅</p>
                    <p className="text-sm font-semibold" style={{ color:t.muted }}>{searchQ?'Aucun resultat':'Aucun rendez-vous ce jour'}</p>
                    {!searchQ&&<button onClick={()=>setAddApptOpen(true)} className="mt-3 text-xs font-bold px-4 py-2 rounded-xl" style={{ background:'rgba(17,24,39,0.12)',color:'#a5a0ff' }}>+ Créer un RDV</button>}
                  </div>
                ) : dayAppts.map(a=>(<ApptListCard key={a.id} a={a} onOpen={setEditAppt} isDark={isDark} t={t} />))}
              </div>
            )
          )}

          {/* Mode mois / custom → liste groupée par jour */}
          {(periodMode==='month'||periodMode==='custom') && (
            <div className="flex-1 overflow-auto px-4 pb-24 pt-1 space-y-4">
              {periodAppts.length===0 ? (
                <div className="rounded-2xl py-14 text-center" style={{ border:`1px dashed ${t.border}` }}>
                  <p className="text-2xl mb-2">📅</p>
                  <p className="text-sm font-semibold" style={{ color:t.muted }}>Aucun rendez-vous sur cette période</p>
                  <button onClick={()=>setAddApptOpen(true)} className="mt-3 text-xs font-bold px-4 py-2 rounded-xl" style={{ background:'rgba(17,24,39,0.12)',color:'#a5a0ff' }}>+ Créer un RDV</button>
                </div>
              ) : (() => {
                // grouper par date
                const groups = {};
                periodAppts.forEach(a=>{ const d=a.date?.substring(0,10)||''; if(!groups[d])groups[d]=[]; groups[d].push(a); });
                return Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([date,appts])=>(
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-px flex-1" style={{ background:t.border }} />
                      <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ background:isDark?'rgba(17,24,39,0.15)':'rgba(17,24,39,0.08)', color:'#a5a0ff' }}>
                        {fmtDateL(date)}
                      </span>
                      <div className="h-px flex-1" style={{ background:t.border }} />
                    </div>
                    <div className="space-y-2">
                      {appts.map(a=>(<ApptListCard key={a.id} a={a} onOpen={setEditAppt} isDark={isDark} t={t} />))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* ══ ÉQUIPE ══ */}
      {/* ══ CONFIG ══ */}
      {mainTab === 'config' && (
        <div className="px-4 overflow-auto">
          <ConfigTab
            settings={settings}
            hours={businessHours}
            onSaved={(s,h)=>{ setSettings(s); setBusinessHours(h); setClosedDays(h.filter(x=>!x.is_open).map(x=>x.day_of_week)); syncDisplayFromHours(h); }}
            showToast={showToast}
            theme={t}
          />
        </div>
      )}

      {/* ── Modaux ── */}
      {editAppt && (
        <ApptModal
          appt={editAppt}
          employees={employees}
          employee={null} // null = admin (tous droits)
          onUpdated={onApptUpdated}
          onDeleted={onApptDeleted}
          onTxCreated={tx=>{ if(onTxCreated) onTxCreated(tx); showToast('💰 Encaisse !'); }}
          onClose={()=>setEditAppt(null)}
          theme={t}
        />
      )}

      {addApptOpen && (
        <AddApptModal
          employees={employees}
          services={services}
          selectedDate={selectedDate}
          onSave={async form=>{
            await bookingApi.createEmpAppt(form);
            await loadAppts();
            showToast('RDV crée ✓');
          }}
          onClose={()=>setAddApptOpen(false)}
          theme={t}
        />
      )}

      {svcModal && (
        <ServiceModal
          svc={editSvc}
          categories={categories}
          onSave={async form=>{
            if (editSvc) {
              const upd = await bookingApi.updateService(editSvc.id, form);
              setServices(p=>p.map(s=>s.id===editSvc.id?upd:s));
              showToast('Service mis a jour');
            } else {
              const created = await bookingApi.createService(form);
              setServices(p=>[...p, created]);
              showToast('Service crée');
            }
          }}
          onClose={()=>{ setSvcModal(false); setEditSvc(null); }}
          theme={t}
        />
      )}
    </div>
  );
}