import { useState } from 'react';
import { bookingApi, referralsApi } from '../../../utils/api';
import { Modal } from '../../../components/UI';
import { useEmployeePinGate } from '../../../components/EmployeePinModal';
import { STATUS_CFG, PAY_OPTS } from '../constants';
import { fmtTime, fmtDateL, toMin, fromMin } from '../helpers';
import Toggle from '../components/Toggle';
import InfoRow from '../components/InfoRow';

export default function ApptModal({ appt: init, employees, employee, onUpdated, onDeleted, onTxCreated, onClose, theme: t }) {
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
    } catch(e){ alert(e.message || 'Une erreur est survenue.'); } finally { setSaving(false); }
  };

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
    } catch(e){ alert(e.message || 'Une erreur est survenue.'); } finally { setSaving(false); }
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
          // AUDIT perms C : passe actingEmployeeId pour injecter header
          // x-employee-pin si token stocké — backend override body.employee_id
          // par req.employee.id (anti-spoofing).
          const res = await bookingApi.checkoutAppt(appt.id, payload, employee?.id);
          // Si le back a auto-validé un parrainage lié au RDV, remonter le
          // nouveau statut dans le state local pour que le badge agenda
          // passe de "À valider" à "Validé" immédiatement.
          const refPatch = res?.referral_validated ? { referral_status: 'validated' } : {};
          const merged = {...appt, status:'completed', paid:true, paid_method:payMethod, ...refPatch};
          setAppt(merged); onUpdated(merged);
          if (res.transaction) onTxCreated(res.transaction);
          setTab('detail');
        } catch(e){ alert(e.message || 'Une erreur est survenue.'); } finally { setSaving(false); }
      }
    );
  };

  const doDelete = async () => {
    if (!confirm('Supprimer ce rendez-vous ?')) return;
    setSaving(true);
    try {
      await bookingApi.deleteAppt(appt.id);
      onDeleted(appt.id);
      onClose();
    } catch(e){ alert(e.message || 'Une erreur est survenue.'); } finally { setSaving(false); }
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
                  <p className="text-xs font-black uppercase" style={{ color:'#10b981' }}>{appt.discount_amount>0?(appt.referral_use_id?'Total apres parrainage':'Total apres remise'):'Total'}</p>
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

          {/* Parrainage : traçabilité parrain + statut (pending/validated/cancelled) */}
          {appt.referral_use_id&&(()=>{
            const parrainName = [appt.referral_parrain_first_name, appt.referral_parrain_last_name].filter(Boolean).join(' ') || appt.referral_parrain_email || 'Parrain';
            const st = appt.referral_status || 'pending';
            const stLabel = st==='validated' ? 'Validé' : st==='cancelled' ? 'Refusé' : 'À valider en caisse';
            const stColor = st==='validated' ? '#10b981' : st==='cancelled' ? '#ef4444' : '#f59e0b';
            const discount = parseFloat(appt.discount_amount||0);
            const refuseParrainage = async () => {
              if (!window.confirm('Refuser ce parrainage ? Le parrain ne sera pas récompensé. La réduction déjà appliquée au RDV reste acquise au filleul.')) return;
              try {
                await referralsApi.cancelUse(appt.referral_use_id);
                const next = { ...appt, referral_status: 'cancelled' };
                setAppt(next); onUpdated(next);
              } catch(e) { alert(e.message || 'Erreur'); }
            };
            return (
              <div className="rounded-xl p-3" style={{ background:isDark?'rgba(139,92,246,0.08)':'rgba(139,92,246,0.05)', border:'1px solid rgba(139,92,246,0.25)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ fontSize:18 }}>🤝</span>
                  <p className="text-[10px] font-bold uppercase" style={{ color:'#7c3aed' }}>Parrainage</p>
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background:stColor, color:'#fff' }}>{stLabel}</span>
                </div>
                <p className="text-sm font-semibold" style={{ color:t.text }}>Parrainé par {parrainName}</p>
                <p className="text-xs" style={{ color:t.muted }}>
                  Code <span style={{ fontFamily:'monospace', color:'#7c3aed' }}>{appt.referral_code}</span>
                  {discount>0 && <> · Réduction parrainage <span style={{ fontWeight:700, color:'#10b981' }}>-{discount.toFixed(2)} €</span></>}
                </p>
                {st === 'pending' && (
                  <button onClick={refuseParrainage}
                    className="mt-2 text-[11px] font-bold px-3 py-1.5 rounded-lg"
                    style={{ background:'rgba(239,68,68,0.08)', color:'#ef4444',
                      border:'1px solid rgba(239,68,68,0.25)', cursor:'pointer' }}>
                    Refuser le parrainage
                  </button>
                )}
              </div>
            );
          })()}

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
