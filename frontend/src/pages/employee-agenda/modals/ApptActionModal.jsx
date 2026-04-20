// src/pages/employee-agenda/modals/ApptActionModal.jsx
import { useState } from 'react';
import { bookingApi, referralsApi } from '../../../utils/api';
import { Modal } from '../../../components/UI';
import { useEmployeePinGate } from '../../../components/EmployeePinModal';
import { STATUS_CFG, PAY_OPTIONS } from '../constants';
import { fmtTime, fmtDateFull, toMin, fromMin } from '../helpers';
import { glassCard } from '../styles';
import Spin from '../components/Spin';
import Toggle from '../components/Toggle';
import InfoRow from '../components/InfoRow';

export default function ApptActionModal({ appt: initAppt, employee, services, onUpdated, onClose, onTxCreated, theme: t }) {
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
    } catch(e) { alert(e.message || 'Une erreur est survenue.'); } finally { setSaving(false); }
  };

  const doCancel = async () => {
    if (!window.confirm('Annuler ce rendez-vous ?')) return;
    setSaving(true);
    try {
      const upd = await bookingApi.updateAppt(appt.id, { status:'cancelled', cancel_reason:cancelReason||null, notify_client:cancelNotify&&!!appt.client_email });
      const merged = {...appt,...upd, status:'cancelled', cancel_reason:cancelReason};
      setAppt(merged); onUpdated(merged); setTab('detail');
    } catch(e) { alert(e.message || 'Une erreur est survenue.'); } finally { setSaving(false); }
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
          // AUDIT perms C : injecte x-employee-pin via actingEmployeeId
          const res = await bookingApi.checkoutAppt(appt.id, payload, employee?.id);
          const refPatch = res?.referral_validated ? { referral_status: 'validated' } : {};
          const merged = {...appt, status:'completed', paid:true, paid_method:payMethod, ...refPatch};
          setAppt(merged); onUpdated(merged);
          if (res.transaction) onTxCreated(res.transaction);
          setTab('detail');
        } catch(e) { alert(e.message || 'Une erreur est survenue.'); } finally { setSaving(false); }
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
                      <span style={{ fontSize:14 }}>{appt.referral_use_id?'🤝':'🎉'}</span>
                      <div>
                        <p style={{ margin:0, fontSize:11, fontWeight:700, color: appt.referral_use_id?'#7c3aed':'#10b981' }}>{appt.referral_use_id?'Réduction parrainage':'Code promo'}</p>
                        {appt.referral_use_id
                          ? <p style={{ margin:0, fontSize:10, color:t.muted, fontFamily:'monospace' }}>{appt.referral_code}</p>
                          : (appt.promo_code && <p style={{ margin:0, fontSize:10, color:t.muted, fontFamily:'monospace' }}>{appt.promo_code}</p>)}
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

          {/* Parrainage : traçabilité parrain + statut */}
          {appt.referral_use_id&&(()=>{
            const parrainName = [appt.referral_parrain_first_name, appt.referral_parrain_last_name].filter(Boolean).join(' ') || appt.referral_parrain_email || 'Parrain';
            const rst = appt.referral_status || 'pending';
            const stLabel = rst==='validated' ? 'Validé' : rst==='cancelled' ? 'Refusé' : 'À valider en caisse';
            const stColor = rst==='validated' ? '#10b981' : rst==='cancelled' ? '#ef4444' : '#f59e0b';
            const refuseParrainage = async () => {
              if (!window.confirm('Refuser ce parrainage ? Le parrain ne sera pas récompensé.')) return;
              try {
                await referralsApi.cancelUse(appt.referral_use_id);
                const next = { ...appt, referral_status: 'cancelled' };
                setAppt(next); onUpdated(next);
              } catch(e) { alert(e.message || 'Erreur'); }
            };
            return (
              <div style={{ padding:'12px 16px', borderRadius:12, background:'rgba(139,92,246,0.06)', border:'1px solid rgba(139,92,246,0.25)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:16 }}>🤝</span>
                  <p style={{ margin:0, fontSize:10, fontWeight:800, textTransform:'uppercase', color:'#7c3aed' }}>Parrainage</p>
                  <span style={{ marginLeft:'auto', fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:99, background:stColor, color:'#fff' }}>{stLabel}</span>
                </div>
                <p style={{ margin:0, fontSize:13, fontWeight:600, color:t.text }}>Parrainé par {parrainName}</p>
                <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>Code <span style={{ fontFamily:'monospace', color:'#7c3aed' }}>{appt.referral_code}</span></p>
                {rst === 'pending' && (
                  <button onClick={refuseParrainage}
                    style={{ marginTop:8, padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:700,
                      background:'rgba(239,68,68,0.08)', color:'#ef4444',
                      border:'1px solid rgba(239,68,68,0.25)', cursor:'pointer' }}>
                    Refuser le parrainage
                  </button>
                )}
              </div>
            );
          })()}

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
