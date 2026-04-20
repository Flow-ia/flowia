import { useState, useEffect, useCallback } from 'react';
import { I } from '../../../../utils/icons';
import { Confirm } from '../../../../components/UI';
import { promoApi } from '../../../../utils/api';
import PromoForm from './PromoForm';
import SendPromoEmailModal from './SendPromoEmailModal';

export default function TabPromo({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [statsData, setStatsData] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const [statsLoad, setStatsLoad] = useState(false);
  const [sendModal, setSendModal] = useState(null);
  const [createdConfirm, setCreatedConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPromos(await promoApi.list()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadStats = async () => {
    setStatsLoad(true);
    try { setStatsData(await promoApi.getStats()); setShowStats(true); }
    catch(e) { console.error(e); }
    finally { setStatsLoad(false); }
  };

  const handleSave = async (d) => {
    if (edit) {
      const u = await promoApi.update(edit.id, {...d, is_active:edit.is_active});
      setPromos(p=>p.map(x=>x.id===edit.id?u:x));
      setEdit(null); showToast('Code modifié ✓');
      return u;
    }
    const created = await promoApi.create(d);
    setPromos(p=>[created,...p]);
    return created;
  };

  const toggleActive = async (promo) => {
    const u = await promoApi.update(promo.id, {...promo, is_active:!promo.is_active});
    setPromos(p=>p.map(x=>x.id===promo.id?u:x));
  };

  const fmt = v => {
    const d = new Date(v+'T12:00:00');
    return d.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
  };

  return (
    <div className="space-y-4">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <button onClick={loadStats} disabled={statsLoad}
          style={{ padding:'10px 14px', borderRadius:12, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)', color:'#f59e0b', fontWeight:700, fontSize:12, cursor:'pointer' }}>
          {statsLoad ? '⏳' : '📊'} Traçabilité
        </button>
        <button onClick={()=>{ setEdit(null); setModal(true); }}
          style={{ padding:'10px 16px', borderRadius:12, background:'#1a73e8', color:'white', fontWeight:800, fontSize:13, border:'none', cursor:'pointer' }}>
          + Nouveau code
        </button>
      </div>

      {showStats && (
        <div style={{ background:isDark?'rgba(245,158,11,0.08)':'rgba(245,158,11,0.04)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:18, padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p style={{ fontWeight:800, fontSize:14, color:'#f59e0b', margin:0 }}>📊 Traçabilité des codes promo</p>
            <button onClick={()=>setShowStats(false)} style={{ background:'none', border:'none', cursor:'pointer', color:theme.muted, fontSize:18 }}>✕</button>
          </div>
          {(() => {
            const totalGenere = statsData.reduce((s,p) => s + parseFloat(p.total_discount_used||0) + parseFloat(p.value||0)*(p.max_uses - (p.uses_count||0) > 0 ? (p.max_uses - (p.uses_count||0)) : 0), 0);
            const totalUtilise = statsData.reduce((s,p) => s + parseFloat(p.total_discount_used||0), 0);
            const totalCA = statsData.reduce((s,p) => s + parseFloat(p.total_revenue_generated||0), 0);
            return (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
                {[
                  { l:'CA génére', v:`${Number(totalCA).toFixed(2)} €`, c:'#10b981' },
                  { l:'Remises utilisees', v:`${Number(totalUtilise).toFixed(2)} €`, c:'#ef4444' },
                  { l:'Codes actifs', v: statsData.filter(p=>p.is_active).length, c:'#111827' },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ borderRadius:12, padding:'10px 8px', textAlign:'center', background:isDark?`${c}22`:`${c}11`, border:`1px solid ${c}33` }}>
                    <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', color:c, margin:'0 0 4px' }}>{l}</p>
                    <p style={{ fontSize:14, fontWeight:900, color:c, margin:0 }}>{v}</p>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {statsData.map(p => (
              <div key={p.id} style={{ background:theme.card, borderRadius:14, padding:'12px 14px', border:`1px solid ${theme.border}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <span style={{ fontWeight:900, fontSize:14, color:theme.text, fontFamily:'var(--mono)' }}>{p.code}</span>
                    <span style={{ marginLeft:8, fontSize:11, padding:'2px 8px', borderRadius:99, background: p.is_active?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.1)', color:p.is_active?'#10b981':'#ef4444', fontWeight:700 }}>{p.is_active?'Actif':'Expire'}</span>
                    {p.is_loyalty_reward && <span style={{ marginLeft:4, fontSize:11, padding:'2px 8px', borderRadius:99, background:'rgba(245,158,11,0.12)', color:'#f59e0b', fontWeight:700 }}>🎫 Fidélité</span>}
                  </div>
                  <span style={{ fontWeight:700, fontSize:13, color:theme.muted }}>{p.type==='percent'?`${p.value}%`:`${Number(p.value).toFixed(2)} €`}</span>
                </div>
                <div style={{ display:'flex', gap:16, marginTop:8, fontSize:12 }}>
                  <span style={{ color:'#ef4444' }}>Utilisé : <strong>{Number(p.total_discount_used||0).toFixed(2)} €</strong></span>
                  <span style={{ color:'#10b981' }}>CA : <strong>{Number(p.total_revenue_generated||0).toFixed(2)} €</strong></span>
                  <span style={{ color:theme.muted }}>{p.usage_count||0} fois{p.max_uses?` / ${p.max_uses}`:''}</span>
                </div>
                {p.owner_client_email && <p style={{ fontSize:11, color:theme.dim, margin:'4px 0 0' }}>Propriétaire : {p.owner_client_email}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <div className="py-16 text-center"><I.Loader className="w-6 h-6 mx-auto animate-spin" style={{ color:theme.muted }} /></div>
      : promos.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', background:theme.card, borderRadius:20, border:`1px solid ${theme.border}` }}>
          <I.Percent style={{ width:40, height:40, margin:'0 auto 12px', color:theme.dim }} />
          <p style={{ color:theme.muted, fontSize:14, margin:0 }}>Aucun code promo</p>
        </div>
      ) : (
        <div style={{ background:theme.card, borderRadius:20, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
          {promos.map((p,i) => (
            <div key={p.id} style={{ padding:'14px 16px', borderBottom: i<promos.length-1?`1px solid ${theme.separator}`:'none', opacity: p.is_active?1:0.5 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:16, color:theme.text, letterSpacing:'0.08em' }}>{p.code}</span>
                    <span style={{ padding:'3px 8px', borderRadius:6, background: p.type==='percent'?'rgba(17,24,39,0.12)':'rgba(16,185,129,0.12)', color: p.type==='percent'?'#111827':'#10b981', fontSize:12, fontWeight:700 }}>
                      {p.type==='percent' ? `-${p.value}%` : `-${Number(p.value).toFixed(2)} €`}
                    </span>
                    {!p.is_active && <span style={{ padding:'2px 6px', borderRadius:5, background:'rgba(239,68,68,0.1)', color:'#ef4444', fontSize:10, fontWeight:700 }}>INACTIF</span>}
                  </div>
                  <p style={{ fontSize:11, color:theme.muted, margin:0 }}>
                    {p.uses_count} utilisation(s){p.max_uses ? ` / ${p.max_uses} max` : ' · illimite'}
                    {p.valid_until ? ` · exp. ${fmt(p.valid_until)}` : ''}
                  </p>
                </div>
                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                  <button onClick={()=>setSendModal(p)}
                    title="Envoyer par email aux clients"
                    style={{ width:28, height:28, borderRadius:8, background:'rgba(6,182,212,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12}}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                  </button>
                  {!p.is_loyalty_reward && (
                    <button onClick={()=>toggleActive(p)} style={{ width:28, height:28, borderRadius:8, background: p.is_active?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:13 }}>{p.is_active?'✓':'○'}</span>
                    </button>
                  )}
                  {!p.is_loyalty_reward && (
                    <button onClick={()=>{ setEdit(p); setModal(true); }} style={{ width:28, height:28, borderRadius:8, background:isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.05)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <I.Edit style={{ width:12, height:12, color:theme.muted }} />
                    </button>
                  )}
                  {!p.is_loyalty_reward && (
                    <button onClick={()=>setDelId(p.id)} style={{ width:28, height:28, borderRadius:8, background:'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <I.Trash style={{ width:12, height:12, color:'#ef4444' }} />
                    </button>
                  )}
                  {p.is_loyalty_reward && (
                    <span style={{ fontSize:10, padding:'3px 9px', borderRadius:99, background:'rgba(245,158,11,0.12)', color:'#f59e0b', fontWeight:700, display:'flex', alignItems:'center' }}>🎫 Fidélité</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PromoForm open={modal} onClose={()=>{ setModal(false); setEdit(null); }} init={edit} onSave={handleSave} theme={theme} />

      {createdConfirm && (
        <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={()=>{ setCreatedConfirm(null); setModal(false); setEdit(null); }}
            style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(8px)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:380, borderRadius:24,
            background:isDark?'#161620':'#fff', border:`1px solid ${theme.border}`, padding:28,
            boxShadow:'0 24px 64px rgba(0,0,0,0.2)', textAlign:'center' }}>
            <div style={{ width:64, height:64, borderRadius:20, background:'rgba(34,197,94,0.1)',
              display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" style={{width:32,height:32}}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p style={{ fontSize:20, fontWeight:900, color:theme.text, margin:'0 0 8px' }}>
              Code créé !
            </p>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'8px 20px',
              borderRadius:12, background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6',
              border:`1px solid ${theme.border}`, marginBottom:16 }}>
              <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:20, letterSpacing:'0.1em', color:theme.text }}>
                {createdConfirm.code}
              </span>
            </div>
            {createdConfirm.sentCount !== null && (
              <div style={{ padding:'12px 16px', borderRadius:12, marginBottom:20,
                background: createdConfirm.emailError
                  ? 'rgba(239,68,68,0.06)' : 'rgba(26,115,232,0.06)',
                border: `1px solid ${createdConfirm.emailError ? 'rgba(239,68,68,0.2)' : 'rgba(26,115,232,0.2)'}` }}>
                {createdConfirm.emailError ? (
                  <p style={{ fontSize:13, color:'#ef4444', margin:0 }}>
                    Erreur envoi email : {createdConfirm.emailError}
                  </p>
                ) : (
                  <p style={{ fontSize:13, color:'#1a73e8', fontWeight:600, margin:0 }}>
                    {createdConfirm.sentCount > 0
                      ? `${createdConfirm.sentCount} email${createdConfirm.sentCount > 1 ? 's' : ''} envoyé${createdConfirm.sentCount > 1 ? 's' : ''} à vos clients`
                      : 'Aucun client avec email enregistré'}
                  </p>
                )}
              </div>
            )}
            <button onClick={()=>{ setCreatedConfirm(null); setModal(false); setEdit(null); }}
              style={{ width:'100%', padding:'13px', borderRadius:12, background:'#1a73e8',
                color:'white', fontWeight:800, fontSize:14, border:'none', cursor:'pointer',
                boxShadow:'0 4px 14px rgba(26,115,232,0.35)' }}>
              Fermer
            </button>
          </div>
        </div>
      )}
      {sendModal && <SendPromoEmailModal promo={sendModal} theme={theme} onClose={()=>setSendModal(null)} showToast={showToast} />}
      <Confirm open={!!delId} onClose={()=>setDelId(null)} title="Supprimer ce code promo ?" desc="Cette action est irréversible." theme={theme}
        onConfirm={async()=>{ await promoApi.remove(delId); setPromos(p=>p.filter(x=>x.id!==delId)); setDelId(null); showToast('Code supprime'); }} />
    </div>
  );
}
