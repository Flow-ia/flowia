import { useState } from 'react';
import { Modal } from '../../../components/UI';
import { svLocal, toMin, fromMin } from '../helpers';

export default function AddApptModal({ employees, services, selectedDate, onSave, onClose, theme: t }) {
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
    } catch(e){ alert(e.message || 'Une erreur est survenue.'); } finally { setSaving(false); }
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
