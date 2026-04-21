import { useState, useEffect, useCallback } from 'react';
import { I } from '../../../../utils/icons';
import { Confirm } from '../../../../components/UI';
import { promoApi } from '../../../../utils/api';
import PromoForm from './PromoForm';
import SendPromoEmailModal from './SendPromoEmailModal';
import { Button } from '../../../../components/primitives';

export default function TabPromo({ theme, showToast }) {
  const t = theme;
  const [promos, setPromos]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [edit, setEdit]         = useState(null);
  const [delId, setDelId]       = useState(null);
  const [statsData, setStatsData] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const [statsLoad, setStatsLoad] = useState(false);
  const [sendModal, setSendModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPromos(await promoApi.list()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadStats = async () => {
    setStatsLoad(true);
    try { setStatsData(await promoApi.getStats()); setShowStats(true); }
    catch (e) { console.error(e); }
    finally { setStatsLoad(false); }
  };

  const handleSave = async (d) => {
    if (edit) {
      const u = await promoApi.update(edit.id, { ...d, is_active: edit.is_active });
      setPromos(p => p.map(x => x.id === edit.id ? u : x));
      setEdit(null); showToast('Code modifie');
      return u;
    }
    const created = await promoApi.create(d);
    setPromos(p => [created, ...p]);
    return created;
  };

  const toggleActive = async (promo) => {
    const u = await promoApi.update(promo.id, { ...promo, is_active: !promo.is_active });
    setPromos(p => p.map(x => x.id === promo.id ? u : x));
  };

  const fmt = v => {
    const d = new Date(v + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <Button variant="secondary" size="small" type="button"
                onClick={loadStats} disabled={statsLoad}>
          {statsLoad ? '...' : 'Tracabilite'}
        </Button>
        <Button variant="primary" size="small" type="button"
                onClick={() => { setEdit(null); setModal(true); }}>
          + Nouveau code
        </Button>
      </div>

      {showStats && (
        <div style={{ background:'#fffbeb', borderRadius:12, padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p style={{ fontSize:13, fontWeight:500, color:'#92400e', margin:0 }}>
              Tracabilite des codes promo
            </p>
            <button onClick={() => setShowStats(false)}
                    style={{ background:'none', border:'none', cursor:'pointer',
                             color:'#92400e', fontSize:16, fontFamily:'inherit' }}>×</button>
          </div>
          {(() => {
            const totalUtilise = statsData.reduce((s, p) => s + parseFloat(p.total_discount_used || 0), 0);
            const totalCA = statsData.reduce((s, p) => s + parseFloat(p.total_revenue_generated || 0), 0);
            return (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
                {[
                  { l:'CA genere',         v:`${Number(totalCA).toFixed(2)} €`,      c:'#065f46', bg:'#f0fdf4' },
                  { l:'Remises utilisees', v:`${Number(totalUtilise).toFixed(2)} €`, c:'#991b1b', bg:'#fef2f2' },
                  { l:'Codes actifs',      v: statsData.filter(p => p.is_active).length, c:t.text, bg:t.cardAlt },
                ].map(({ l, v, c, bg }) => (
                  <div key={l} style={{ borderRadius:8, padding:'10px 8px', textAlign:'center', background:bg }}>
                    <p style={{ fontSize:10, color:c, opacity:0.75, margin:0 }}>{l}</p>
                    <p style={{ fontSize:14, fontWeight:500, color:c, margin:'4px 0 0' }}>{v}</p>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {statsData.map(p => (
              <div key={p.id}
                   style={{ background:t.card, borderRadius:8, padding:'12px 14px',
                            border:`0.5px solid ${t.border}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <span style={{ fontWeight:500, fontSize:14, color:t.text, fontFamily:'var(--mono)' }}>
                      {p.code}
                    </span>
                    <span style={{ marginLeft:8, fontSize:11, padding:'2px 8px', borderRadius:99,
                                   fontWeight:500,
                                   background: p.is_active ? '#f0fdf4' : '#fef2f2',
                                   color: p.is_active ? '#065f46' : '#991b1b' }}>
                      {p.is_active ? 'Actif' : 'Expire'}
                    </span>
                    {p.is_loyalty_reward && (
                      <span style={{ marginLeft:4, fontSize:11, padding:'2px 8px', borderRadius:99,
                                     fontWeight:500, background:'#fffbeb', color:'#92400e' }}>
                        Fidelite
                      </span>
                    )}
                  </div>
                  <span style={{ fontWeight:500, fontSize:13, color:t.muted }}>
                    {p.type === 'percent' ? `${p.value}%` : `${Number(p.value).toFixed(2)} €`}
                  </span>
                </div>
                <div style={{ display:'flex', gap:16, marginTop:8, fontSize:11 }}>
                  <span style={{ color:'#991b1b' }}>
                    Utilise : <strong style={{ fontWeight:500 }}>{Number(p.total_discount_used || 0).toFixed(2)} €</strong>
                  </span>
                  <span style={{ color:'#065f46' }}>
                    CA : <strong style={{ fontWeight:500 }}>{Number(p.total_revenue_generated || 0).toFixed(2)} €</strong>
                  </span>
                  <span style={{ color:t.muted }}>
                    {p.usage_count || 0} fois{p.max_uses ? ` / ${p.max_uses}` : ''}
                  </span>
                </div>
                {p.owner_client_email && (
                  <p style={{ fontSize:10, color:t.dim, margin:'4px 0 0' }}>
                    Proprietaire : {p.owner_client_email}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding:'48px 0', textAlign:'center' }}>
          <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24"
               style={{ color:t.muted, display:'inline-block' }}>
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
            <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      ) : promos.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px',
                      background:t.card, borderRadius:12, border:`0.5px solid ${t.border}` }}>
          <I.Percent style={{ width:36, height:36, margin:'0 auto 12px', color:t.dim, display:'block' }}/>
          <p style={{ color:t.muted, fontSize:14, margin:0 }}>Aucun code promo</p>
        </div>
      ) : (
        <div style={{ background:t.card, borderRadius:12,
                      border:`0.5px solid ${t.border}`, overflow:'hidden' }}>
          {promos.map((p, i) => (
            <div key={p.id}
                 style={{ padding:'14px 16px',
                          borderBottom: i < promos.length - 1 ? `0.5px solid ${t.separator}` : 'none',
                          opacity: p.is_active ? 1 : 0.55 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                    <span style={{ fontFamily:'monospace', fontWeight:500, fontSize:15,
                                   color:t.text, letterSpacing:'0.08em' }}>
                      {p.code}
                    </span>
                    <span style={{ padding:'3px 8px', borderRadius:99, fontSize:11, fontWeight:500,
                                   background: p.type === 'percent' ? t.cardAlt : '#f0fdf4',
                                   color: p.type === 'percent' ? t.text : '#065f46' }}>
                      {p.type === 'percent' ? `-${p.value}%` : `-${Number(p.value).toFixed(2)} €`}
                    </span>
                    {!p.is_active && (
                      <span style={{ padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:500,
                                     background:'#fef2f2', color:'#991b1b' }}>
                        Inactif
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                    {p.uses_count} utilisation(s){p.max_uses ? ` / ${p.max_uses} max` : ' · illimite'}
                    {p.valid_until ? ` · exp. ${fmt(p.valid_until)}` : ''}
                  </p>
                </div>
                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                  <button onClick={() => setSendModal(p)}
                          title="Envoyer par email aux clients"
                          style={{ width:28, height:28, borderRadius:6, border:'none', cursor:'pointer',
                                   background:t.cardAlt,
                                   display:'flex', alignItems:'center', justifyContent:'center',
                                   fontFamily:'inherit' }}>
                    <I.Mail style={{ width:11, height:11, color:t.muted }}/>
                  </button>
                  {!p.is_loyalty_reward && (
                    <button onClick={() => toggleActive(p)}
                            style={{ width:28, height:28, borderRadius:6, border:'none', cursor:'pointer',
                                     background: p.is_active ? '#f0fdf4' : '#fef2f2',
                                     color: p.is_active ? '#065f46' : '#991b1b',
                                     display:'flex', alignItems:'center', justifyContent:'center',
                                     fontSize:12, fontFamily:'inherit' }}>
                      {p.is_active ? '✓' : '○'}
                    </button>
                  )}
                  {!p.is_loyalty_reward && (
                    <button onClick={() => { setEdit(p); setModal(true); }}
                            style={{ width:28, height:28, borderRadius:6, border:'none', cursor:'pointer',
                                     background:t.cardAlt,
                                     display:'flex', alignItems:'center', justifyContent:'center',
                                     fontFamily:'inherit' }}>
                      <I.Edit style={{ width:11, height:11, color:t.muted }}/>
                    </button>
                  )}
                  {!p.is_loyalty_reward && (
                    <button onClick={() => setDelId(p.id)}
                            style={{ width:28, height:28, borderRadius:6, border:'none', cursor:'pointer',
                                     background:'rgba(239,68,68,0.1)',
                                     display:'flex', alignItems:'center', justifyContent:'center',
                                     fontFamily:'inherit' }}>
                      <I.Trash style={{ width:11, height:11, color:'#991b1b' }}/>
                    </button>
                  )}
                  {p.is_loyalty_reward && (
                    <span style={{ fontSize:10, padding:'3px 9px', borderRadius:99,
                                   background:'#fffbeb', color:'#92400e', fontWeight:500,
                                   display:'flex', alignItems:'center' }}>
                      Fidelite
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PromoForm open={modal} onClose={() => { setModal(false); setEdit(null); }}
                 init={edit} onSave={handleSave} theme={theme}/>

      {sendModal && (
        <SendPromoEmailModal promo={sendModal} theme={theme}
                             onClose={() => setSendModal(null)} showToast={showToast}/>
      )}
      <Confirm open={!!delId} onClose={() => setDelId(null)}
               title="Supprimer ce code promo ?"
               message="Cette action est irreversible."
               theme={theme}
               onConfirm={async () => {
                 await promoApi.remove(delId);
                 setPromos(p => p.filter(x => x.id !== delId));
                 setDelId(null);
                 showToast('Code supprime');
               }}/>
    </div>
  );
}
