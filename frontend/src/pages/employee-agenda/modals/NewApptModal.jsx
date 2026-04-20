// src/pages/employee-agenda/modals/NewApptModal.jsx
import { useState } from 'react';
import { Modal } from '../../../components/UI';
import { svLocal, toMin, fromMin } from '../helpers';
import { glassCard } from '../styles';
import Spin from '../components/Spin';

export default function NewApptModal({ empId, services, onSave, onClose, theme: t }) {
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
    } catch(e){ alert(e.message || 'Une erreur est survenue.'); } finally { setSaving(false); }
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
