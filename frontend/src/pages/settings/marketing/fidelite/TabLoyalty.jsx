import { useState, useEffect, useCallback } from 'react';
import { I } from '../../../../utils/icons';
import { Confirm } from '../../../../components/UI';
import { loyaltyApi } from '../../../../utils/api';

export default function TabLoyalty({ theme }) {
  const isDark = theme.mode === 'dark';
  const LOYALTY_PAGE_SIZE = 5;
  const [program, setProgram]   = useState(null);
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editProg, setEditProg] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  // Pagination côté client (5/page) — la liste reste petite en mémoire mais
  // on n'affiche qu'un slice pour alléger le DOM et améliorer l'UX.
  const [page, setPage] = useState(1);
  const [stampModal, setStampModal] = useState(null);
  const [stampEmail, setStampEmail] = useState('');
  const [stampName, setStampName]   = useState('');
  const [stamping, setStamping]     = useState(false);
  const [delId, setDelId] = useState(null);

  const [promoHist, setPromoHist] = useState([]);
  const [showHist,  setShowHist]  = useState(false);
  const [histLoad,  setHistLoad]  = useState(false);

  const [showAddSvc,    setShowAddSvc]    = useState(false);
  const [svcSearch,     setSvcSearch]     = useState('');
  const [svcResults,    setSvcResults]    = useState([]);
  const [svcClient,     setSvcClient]     = useState(null);
  const [svcQty,        setSvcQty]        = useState(1);
  const [svcBusy,       setSvcBusy]       = useState(false);
  const [svcMsg,        setSvcMsg]        = useState('');
  const [svcSearchLoad, setSvcSearchLoad] = useState(false);

  const [loyaltyStats, setLoyaltyStats] = useState(null);
  const [showLoyaltyStats, setShowLoyaltyStats] = useState(false);
  const [loyaltyStatsLoad, setLoyaltyStatsLoad] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, cl] = await Promise.all([loyaltyApi.getProgram(), loyaltyApi.getClients({ search })]);
      setProgram(p); setClients(cl);
    } finally { setLoading(false); }
  }, [search]);

  const loadLoyaltyStats = async () => {
    setLoyaltyStatsLoad(true);
    try { const s = await loyaltyApi.getStats(); setLoyaltyStats(s); setShowLoyaltyStats(true); }
    catch(e) { console.error(e); }
    finally { setLoyaltyStatsLoad(false); }
  };

  useEffect(() => { load(); }, [load]);

  const saveProg = async () => {
    setSaving(true);
    try { const p = await loyaltyApi.saveProgram(program); setProgram(p); setEditProg(false); }
    finally { setSaving(false); }
  };

  // Reset à la page 1 quand la recherche change ou quand la liste rétrécit.
  useEffect(() => { setPage(1); }, [search, clients.length]);

  const loadHistory = async () => {
    setHistLoad(true);
    try { const h = await loyaltyApi.promoHistory(); setPromoHist(h); setShowHist(true); }
    catch(e) { console.error(e); }
    finally { setHistLoad(false); }
  };

  useEffect(() => {
    if (!svcSearch || svcSearch.trim().length < 2) { setSvcResults([]); return; }
    setSvcSearchLoad(true);
    const t = setTimeout(async () => {
      try { const r = await loyaltyApi.searchClients(svcSearch); setSvcResults(r); }
      catch { setSvcResults([]); }
      finally { setSvcSearchLoad(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [svcSearch]);

  const doAddService = async () => {
    if (!svcClient) return;
    setSvcBusy(true); setSvcMsg('');
    try {
      const res = await loyaltyApi.addService({
        client_email: svcClient.email,
        client_name:  svcClient.name,
        stamps_to_add: svcQty,
      });
      const msg = res.reward_triggered
        ? `Tampon(s) ajoute(s) ! Recompense declenchee - code : ${res.reward_code}`
        : `${svcQty} tampon(s) ajoute(s). Total : ${res.client?.stamps || 0}/${res.stamps_required}`;
      setSvcMsg(msg);
      setSvcClient(null); setSvcSearch(''); setSvcQty(1); setSvcResults([]);
      load();
    } catch(e) { setSvcMsg('Erreur : ' + e.message); }
    finally { setSvcBusy(false); }
  };

  const doStamp = async () => {
    if (!stampEmail) return;
    setStamping(true);
    try {
      const res = await loyaltyApi.addStamp({ client_email:stampEmail, client_name:stampName, stamps_to_add:1 });
      if (res.reward_triggered) {
        alert(`${stampName||stampEmail} a atteint ${res.stamps_required} tampons ! Recompense debloquee : ${program.reward_label}`);
      }
      setStampModal(null); setStampEmail(''); setStampName('');
      load();
    } finally { setStamping(false); }
  };

  const inp = { width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:14, outline:'none', boxSizing:'border-box' };

  return (
    <div className="space-y-4">
      <div style={{ background:theme.card, borderRadius:20, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
        <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${theme.separator}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:12, background:'rgba(245,158,11,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <I.Gift style={{ width:18, height:18, color:'#f59e0b' }} />
            </div>
            <div>
              <p style={{ fontWeight:800, fontSize:15, color:theme.text, margin:0 }}>Programme fidélité</p>
              {program && <p style={{ fontSize:12, color:theme.muted, margin:0 }}>{program.stamps_required} tampons → {program.reward_label}</p>}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {program && (
              <button onClick={()=>{ setProgram(p=>({...p,enabled:!p.enabled})); loyaltyApi.saveProgram({...program,enabled:!program.enabled}); }}
                style={{ width:40, height:24, borderRadius:12, background: program.enabled?'#f59e0b':theme.inputBg, border:`2px solid ${program.enabled?'#f59e0b':theme.border}`, position:'relative', cursor:'pointer', transition:'all 0.2s' }}>
                <div style={{ width:16, height:16, borderRadius:8, background:'white', position:'absolute', top:2, left: program.enabled?20:2, transition:'left 0.2s' }} />
              </button>
            )}
            <button onClick={()=>setEditProg(!editProg)} style={{ padding:'6px 12px', borderRadius:10, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.2)', color:'#f59e0b', fontWeight:700, fontSize:12, cursor:'pointer' }}>
              {editProg ? '✓' : '⚙️'}
            </button>
          </div>
        </div>
        {editProg && program && (
          <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Mode de fidélité</label>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setProgram(p=>({...p,loyalty_mode:'stamps'}))}
                  style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer',
                    border:`1px solid ${(program.loyalty_mode||'stamps')==='stamps'?'#f59e0b':theme.border}`,
                    background:(program.loyalty_mode||'stamps')==='stamps'?'rgba(245,158,11,0.12)':theme.inputBg,
                    color:(program.loyalty_mode||'stamps')==='stamps'?'#f59e0b':theme.muted }}>
                  🎫 Passages
                </button>
                <button onClick={()=>setProgram(p=>({...p,loyalty_mode:'points'}))}
                  style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer',
                    border:`1px solid ${(program.loyalty_mode||'stamps')==='points'?'#111827':theme.border}`,
                    background:(program.loyalty_mode||'stamps')==='points'?'rgba(17,24,39,0.12)':theme.inputBg,
                    color:(program.loyalty_mode||'stamps')==='points'?'#111827':theme.muted }}>
                  ⭐ Points
                </button>
              </div>
            </div>

            {(program.loyalty_mode||'stamps')==='points' && (
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Points gagnés par euro dépensé</label>
                <input type="number" min="0.01" step="0.1" value={program.points_per_euro||1}
                  onChange={e=>setProgram(p=>({...p,points_per_euro:parseFloat(e.target.value)||1}))} style={inp} />
                <p style={{ fontSize:11, color:theme.muted, marginTop:4 }}>Ex : 1 point = 1 € dépensé → seuil {program.stamps_required||100} points</p>
              </div>
            )}

            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>
                {(program.loyalty_mode||'stamps')==='points' ? 'Points requis pour la recompense' : 'Passages requis pour la recompense'}
              </label>
              <input type="number" min="1" max="9999" value={program.stamps_required}
                onChange={e=>setProgram(p=>({...p,stamps_required:parseInt(e.target.value)||10}))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Type de r&#233;compense</label>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setProgram(p=>({...p,reward_type:'percent'}))}
                  style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer', border:`1px solid ${program.reward_type==='percent'?'#111827':theme.border}`, background:program.reward_type==='percent'?'rgba(17,24,39,0.12)':theme.inputBg, color:program.reward_type==='percent'?'#111827':theme.muted }}>
                  % R&#233;duction
                </button>
                <button onClick={()=>setProgram(p=>({...p,reward_type:'fixed'}))}
                  style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer', border:`1px solid ${program.reward_type==='fixed'?'#10b981':theme.border}`, background:program.reward_type==='fixed'?'rgba(16,185,129,0.12)':theme.inputBg, color:program.reward_type==='fixed'?'#10b981':theme.muted }}>
                  &#8364; Montant fixe
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>
                Valeur de la r&#233;compense ({program.reward_type==='percent'?'%':'&#8364;'})
              </label>
              <div style={{ position:'relative' }}>
                <input type="number" min="1" max={program.reward_type==='percent'?100:9999} step="0.5"
                  value={program.reward_value||10}
                  onChange={e=>setProgram(p=>({...p,reward_value:parseFloat(e.target.value)||10}))}
                  style={{...inp, paddingRight:36}} />
                <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontWeight:800, color:theme.muted, fontSize:15 }}>
                  {program.reward_type==='percent'?'%':'€'}
                </span>
              </div>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Libel&#233; de la r&#233;compense</label>
              <input placeholder="ex: Prestation offerte" value={program.reward_label||''} onChange={e=>setProgram(p=>({...p,reward_label:e.target.value}))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Comptabiliser les passages</label>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {[
                  { v:'physical', l:'Physique uniquement',   d:'Caisse et prestation ajoutee sur place' },
                  { v:'online',   l:'En ligne uniquement',    d:'Reservations via le site public' },
                  { v:'both',     l:'Les deux (recommande)', d:'Physique + en ligne' },
                ].map(opt => (
                  <button key={opt.v} onClick={()=>setProgram(p=>({...p,count_trigger:opt.v}))}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:12, cursor:'pointer', textAlign:'left',
                      border:`1.5px solid ${(program.count_trigger||'both')===opt.v?'#f59e0b':theme.border}`,
                      background:(program.count_trigger||'both')===opt.v?'rgba(245,158,11,0.1)':theme.inputBg }}>
                    <div style={{ width:16, height:16, borderRadius:8, border:`2px solid ${(program.count_trigger||'both')===opt.v?'#f59e0b':theme.muted}`,
                      background:(program.count_trigger||'both')===opt.v?'#f59e0b':'transparent', flexShrink:0 }} />
                    <div>
                      <p style={{ margin:0, fontWeight:700, fontSize:13, color:theme.text }}>{opt.l}</p>
                      <p style={{ margin:0, fontSize:11, color:theme.muted }}>{opt.d}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Achat minimum (€)</label>
                <input type="number" min="0" step="0.5" value={program.min_purchase||0}
                  onChange={e=>setProgram(p=>({...p,min_purchase:parseFloat(e.target.value)||0}))}
                  style={inp} />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Validité du code (jours)</label>
                <input type="number" min="1" max="365" value={program.validity_days||90}
                  onChange={e=>setProgram(p=>({...p,validity_days:parseInt(e.target.value)||90}))}
                  style={inp} />
              </div>
            </div>
            <div style={{ background:'rgba(245,158,11,0.08)', borderRadius:12, padding:'10px 14px' }}>
              <p style={{ fontSize:12, color:'#92400e', margin:0, fontWeight:600 }}>
                {program.stamps_required} {(program.loyalty_mode||'stamps')==='points'?'points':'passages'} → {program.reward_type==='percent'?`${program.reward_value||10}%`:`${Number(program.reward_value||10).toFixed(2)} €`} · valide {program.validity_days||90}j{(program.min_purchase||0)>0?` · min ${program.min_purchase}€`:''}
              </p>
            </div>
            <button onClick={saveProg} disabled={saving} style={{ padding:'11px', borderRadius:12, background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'white', fontWeight:800, border:'none', cursor:'pointer' }}>
              {saving ? '&#9203;...' : '&#128190; Sauvegarder'}
            </button>
          </div>
        )}
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:160, position:'relative' }}>
          <I.Search style={{ width:14, height:14, position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:theme.muted }} />
          <input placeholder="Rechercher un client..." value={search} onChange={e=>setSearch(e.target.value)} style={{ width:'100%', padding:'10px 10px 10px 34px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
        </div>
        <button onClick={()=>setStampModal(true)} disabled={!program?.enabled}
          style={{ padding:'10px 14px', borderRadius:12, background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'white', fontWeight:800, fontSize:13, border:'none', cursor:'pointer', flexShrink:0, opacity:program?.enabled?1:0.4 }}>
          + Tampon
        </button>
        <button onClick={loadLoyaltyStats} disabled={loyaltyStatsLoad}
          style={{ padding:'10px 14px', borderRadius:12, background:theme.cardAlt, border:`1px solid ${theme.border}`, color:theme.text, fontWeight:700, fontSize:12, cursor:'pointer', flexShrink:0 }}>
          {loyaltyStatsLoad ? '⏳' : '📊'} Traçabilité
        </button>
      </div>

      {showLoyaltyStats && loyaltyStats && (
        <div style={{ background:isDark?'rgba(17,24,39,0.06)':'rgba(17,24,39,0.03)', border:'1px solid rgba(17,24,39,0.2)', borderRadius:18, padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p style={{ fontWeight:800, fontSize:14, color:theme.text, margin:0 }}>Traçabilité fidélité</p>
            <button onClick={()=>setShowLoyaltyStats(false)} style={{ background:'none', border:'none', cursor:'pointer', color:theme.muted, fontSize:18 }}>✕</button>
          </div>
          {(() => {
            const s = loyaltyStats.summary || {};
            const codesGeneres  = parseInt(s.total_codes   || 0);
            const mtUtilise     = parseFloat(s.montant_utilise || 0);
            const codesUtilises = parseInt(s.codes_utilises || 0);
            const codesRestants = parseInt(s.codes_restants || 0);
            return (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:16 }}>
                {[
                  { l:'Codes généres',   v: codesGeneres,              c:'#f59e0b' },
                  { l:'Remises utilisees', v: `${mtUtilise.toFixed(2)} €`, c:'#ef4444' },
                  { l:'Codes utilises',  v: codesUtilises,             c:'#10b981' },
                  { l:'Codes restants',  v: codesRestants,             c:'#111827' },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ borderRadius:12, padding:'10px 12px', textAlign:'center', background:isDark?`${c}22`:`${c}11`, border:`1px solid ${c}33` }}>
                    <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', color:c, margin:'0 0 4px' }}>{l}</p>
                    <p style={{ fontSize:16, fontWeight:900, color:c, margin:0 }}>{v}</p>
                  </div>
                ))}
              </div>
            );
          })()}
          {loyaltyStats.clients && loyaltyStats.clients.length > 0 && (
            <div>
              <p style={{ fontSize:12, fontWeight:700, color:theme.muted, margin:'0 0 10px' }}>CA par client</p>
              <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflowY:'auto' }}>
                {loyaltyStats.clients.map((cl,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:theme.card, borderRadius:12, border:`1px solid ${theme.border}` }}>
                    <div>
                      <p style={{ margin:0, fontWeight:700, fontSize:13, color:theme.text }}>{cl.client_name || cl.client_email}</p>
                      <p style={{ margin:0, fontSize:11, color:theme.muted }}>{cl.total_stamps_ever} passage{cl.total_stamps_ever>1?'s':''} · {cl.rewards_earned} recompense{cl.rewards_earned>1?'s':''}</p>
                    </div>
                    <span style={{ fontWeight:900, fontSize:14, color:'#10b981' }}>{Number(cl.ca_total).toFixed(2)} €</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? <div className="py-16 text-center"><I.Loader className="w-6 h-6 mx-auto animate-spin" style={{ color:theme.muted }} /></div>
      : clients.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', background:theme.card, borderRadius:18, border:`1px solid ${theme.border}` }}>
          <I.Gift style={{ width:36, height:36, margin:'0 auto 10px', color:theme.dim }} />
          <p style={{ color:theme.muted, fontSize:14, margin:0 }}>Aucun client fidélité</p>
        </div>
      ) : (
        <div style={{ background:theme.card, borderRadius:18, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
          {clients.slice((page-1)*LOYALTY_PAGE_SIZE, page*LOYALTY_PAGE_SIZE).map((cl,i,arr) => {
            const isPoints = (program?.loyalty_mode||'stamps') === 'points';
            const currentVal = isPoints ? (parseFloat(cl.points)||0) : (parseInt(cl.stamps)||0);
            const pct = program ? Math.min(100, (currentVal / (program.stamps_required||10))*100) : 0;
            return (
              <div key={cl.id} style={{ padding:'14px 16px', borderBottom: i<arr.length-1?`1px solid ${theme.separator}`:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <div style={{ width:36, height:36, borderRadius:12, background:'rgba(245,158,11,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:15, color:'#f59e0b', flexShrink:0 }}>
                    {(cl.client_name||cl.client_email||'?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:14, color:theme.text, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cl.client_name||'-'}</p>
                    <p style={{ fontSize:11, color:theme.muted, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cl.client_email}</p>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    {(program?.loyalty_mode||'stamps')==='points' ? (
                      <>
                        <p style={{ fontWeight:900, fontSize:18, color:theme.text, margin:0 }}>
                          {Math.floor(cl.points||0)}<span style={{ fontSize:11, color:theme.muted, fontWeight:600 }}>pts/{program?.stamps_required||100}</span>
                        </p>
                        <p style={{ fontSize:10, color:theme.dim, margin:0 }}>{cl.total_points_ever||0} pts cumulés</p>
                      </>
                    ) : (
                      <>
                        <p style={{ fontWeight:900, fontSize:18, color:'#f59e0b', margin:0 }}>
                          {cl.stamps}<span style={{ fontSize:11, color:theme.muted, fontWeight:600 }}>/{program?.stamps_required||10}</span>
                        </p>
                        <p style={{ fontSize:10, color:theme.dim, margin:0 }}>{cl.rewards_earned} 🎁 gagnée(s)</p>
                      </>
                    )}
                  </div>
                  <button onClick={()=>setDelId(cl.id)} style={{ width:26, height:26, borderRadius:8, background:'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <I.Trash style={{ width:11, height:11, color:'#ef4444' }} />
                  </button>
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  {Array.from({length:program?.stamps_required||10}).map((_,j) => (
                    <div key={j} style={{ flex:1, height:6, borderRadius:3, background: j < cl.stamps ? '#f59e0b' : isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.08)' }} />
                  ))}
                </div>
              </div>
            );
          })}
          {clients.length > LOYALTY_PAGE_SIZE && (() => {
            const total = clients.length;
            const pages = Math.max(1, Math.ceil(total / LOYALTY_PAGE_SIZE));
            const cur   = Math.min(page, pages);
            const from  = (cur - 1) * LOYALTY_PAGE_SIZE + 1;
            const to    = Math.min(cur * LOYALTY_PAGE_SIZE, total);
            return (
              <div style={{ padding:'12px 16px', borderTop:`1px solid ${theme.separator}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                <p style={{ fontSize:12, color:theme.muted, margin:0 }}>{from}–{to} sur {total}</p>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={cur<=1}
                    style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${theme.border}`, background:isDark?'rgba(255,255,255,0.04)':'#f5f5f4', color:theme.text, fontWeight:700, fontSize:12, cursor:cur<=1?'not-allowed':'pointer', opacity:cur<=1?0.4:1 }}>← Préc.</button>
                  <span style={{ padding:'6px 10px', fontSize:12, fontWeight:700, color:theme.muted }}>{cur} / {pages}</span>
                  <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={cur>=pages}
                    style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${theme.border}`, background:isDark?'rgba(255,255,255,0.04)':'#f5f5f4', color:theme.text, fontWeight:700, fontSize:12, cursor:cur>=pages?'not-allowed':'pointer', opacity:cur>=pages?0.4:1 }}>Suiv. →</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {stampModal && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={()=>setStampModal(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(12px)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:380, background: isDark?'#161620':'#fff', borderRadius:24, border:`1px solid ${theme.border}`, padding:24 }}>
            <h3 style={{ fontWeight:800, fontSize:17, color:theme.text, margin:'0 0 20px' }}>Ajouter un tampon</h3>
            <div className="space-y-3">
              <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Email client *</label><input type="email" placeholder="client@email.fr" value={stampEmail} onChange={e=>setStampEmail(e.target.value)} style={inp} /></div>
              <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Nom (optionnel)</label><input placeholder="Prénom Nom" value={stampName} onChange={e=>setStampName(e.target.value)} style={inp} /></div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={()=>setStampModal(null)} style={{ flex:1, padding:'12px', borderRadius:12, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer' }}>Annuler</button>
              <button onClick={doStamp} disabled={stamping||!stampEmail} style={{ flex:2, padding:'12px', borderRadius:12, background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'white', fontWeight:800, border:'none', cursor:'pointer', opacity:!stampEmail?0.5:1 }}>
                {stamping ? '⏳...' : '🎫 Valider le tampon'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ background:theme.card, borderRadius:20, padding:20, border:`1px solid ${theme.border}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <I.Plus style={{ width:18, height:18, color:'#10b981' }} />
            <span style={{ fontWeight:800, fontSize:15, color:theme.text }}>Ajouter une prestation client</span>
          </div>
          <button onClick={()=>{ setShowAddSvc(!showAddSvc); setSvcMsg(''); }}
            style={{ padding:'6px 14px', borderRadius:10, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', color:'#10b981', fontWeight:700, fontSize:12, cursor:'pointer' }}>
            {showAddSvc ? 'Fermer' : 'Ouvrir'}
          </button>
        </div>
        {showAddSvc && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ position:'relative' }}>
              <input placeholder="Rechercher par nom, email, téléphone..."
                value={svcSearch} onChange={e=>{ setSvcSearch(e.target.value); setSvcClient(null); }}
                style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', boxSizing:'border-box' }}
              />
              {svcSearchLoad && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:12, color:theme.muted }}>⏳</span>}
            </div>
            {svcResults.length > 0 && !svcClient && (
              <div style={{ background:theme.inputBg, border:`1px solid ${theme.border}`, borderRadius:12, overflow:'hidden' }}>
                {svcResults.map(r => (
                  <div key={r.id} onClick={()=>{ setSvcClient(r); setSvcResults([]); setSvcSearch(r.name + (r.email?' - '+r.email:'')); }}
                    style={{ padding:'10px 14px', cursor:'pointer', borderBottom:`1px solid ${theme.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <p style={{ margin:0, fontWeight:700, fontSize:13, color:theme.text }}>{r.name}</p>
                      <p style={{ margin:0, fontSize:11, color:theme.muted }}>{r.email}{r.phone?' · '+r.phone:''}</p>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:'#f59e0b', background:'rgba(245,158,11,0.1)', padding:'2px 8px', borderRadius:6 }}>{r.stamps||0} 🎫</span>
                  </div>
                ))}
              </div>
            )}
            {svcClient && (
              <div style={{ background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ margin:0, fontWeight:700, fontSize:13, color:'#10b981' }}>{svcClient.name}</p>
                  <p style={{ margin:0, fontSize:11, color:theme.muted }}>{svcClient.email} · {svcClient.stamps||0}/{program?.stamps_required||'?'} tampons</p>
                </div>
                <button onClick={()=>{ setSvcClient(null); setSvcSearch(''); }}
                  style={{ background:'none', border:'none', cursor:'pointer', color:theme.muted, fontSize:18 }}>✕</button>
              </div>
            )}
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:4 }}>Nb de tampons à ajouter</label>
                <input type="number" min="1" max="20" value={svcQty} onChange={e=>setSvcQty(parseInt(e.target.value)||1)}
                  style={{ width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <button onClick={doAddService} disabled={!svcClient||svcBusy}
                style={{ padding:'10px 18px', borderRadius:12, background:'linear-gradient(135deg,#10b981,#059669)', color:'white', fontWeight:800, fontSize:13, border:'none', cursor:'pointer', marginTop:20, opacity:!svcClient?0.4:1 }}>
                {svcBusy ? '⏳' : '+ Ajouter'}
              </button>
            </div>
            {svcMsg && (
              <p style={{ margin:0, fontSize:12, fontWeight:700, color: svcMsg.includes('Erreur') ? '#ef4444' : '#10b981', background: svcMsg.includes('Erreur')?'rgba(239,68,68,0.07)':'rgba(16,185,129,0.07)', padding:'8px 12px', borderRadius:10 }}>{svcMsg}</p>
            )}
          </div>
        )}
      </div>

      <div style={{ background:theme.card, borderRadius:20, padding:20, border:`1px solid ${theme.border}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: showHist ? 14 : 0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <I.FileText style={{ width:18, height:18, color:'#111827' }} />
            <span style={{ fontWeight:800, fontSize:15, color:theme.text }}>Historique codes fidélité</span>
          </div>
          <button onClick={()=>{ if (!showHist) loadHistory(); else setShowHist(false); }}
            style={{ padding:'6px 14px', borderRadius:10, background:theme.cardAlt, border:`1px solid ${theme.border}`, color:theme.text, fontWeight:700, fontSize:12, cursor:'pointer' }}>
            {histLoad ? '⏳' : showHist ? 'Masquer' : 'Afficher'}
          </button>
        </div>
        {showHist && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {promoHist.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px 0', color:theme.muted }}>
                <p style={{ fontSize:32, margin:'0 0 8px' }}>🎫</p>
                <p style={{ fontSize:14, fontWeight:600 }}>Aucun code fidélité généré pour l'instant</p>
              </div>
            ) : promoHist.map(row => {
              const used = row.uses_count > 0;
              const expired = !row.is_active || (row.valid_until && new Date(row.valid_until) < new Date());
              const statusColor = used ? '#10b981' : expired ? '#ef4444' : '#f59e0b';
              const statusLabel = used ? 'Utilise' : expired ? 'Expire' : 'Disponible';
              return (
                <div key={row.id} style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:16, padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                        <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:15, color:'#f59e0b', letterSpacing:'0.08em' }}>{row.code}</span>
                        <span style={{ padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:800, background:`${statusColor}18`, color:statusColor }}>{statusLabel}</span>
                      </div>
                      <p style={{ margin:0, fontSize:12, color:theme.muted }}>
                        Client : <strong style={{ color:theme.text }}>{row.owner_name || row.owner_client_email || '-'}</strong>
                      </p>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <p style={{ margin:0, fontWeight:900, fontSize:16, color:theme.text }}>
                        {row.type==='percent' ? `-${row.value}%` : `-${Number(row.value||0).toFixed(2)} €`}
                      </p>
                      {row.min_purchase > 0 && (
                        <p style={{ margin:'2px 0 0', fontSize:10, color:theme.muted }}>Min. {Number(row.min_purchase).toFixed(2)} €</p>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10, fontSize:11 }}>
                    <span style={{ color:theme.muted }}>📅 Généré le <strong>{row.created_at ? new Date(row.created_at).toLocaleDateString('fr-FR') : '-'}</strong></span>
                    <span style={{ color:row.valid_until && new Date(row.valid_until)<new Date() ? '#ef4444' : theme.muted }}>
                      ⏳ Expire le <strong>{row.valid_until ? new Date(row.valid_until).toLocaleDateString('fr-FR') : '-'}</strong>
                    </span>
                    {used && (
                      <span style={{ color:'#10b981' }}>✓ Utilise le <strong>{row.used_at ? new Date(row.used_at).toLocaleDateString('fr-FR') : '-'}</strong></span>
                    )}
                    {row.discount_applied && (
                      <span style={{ color:'#10b981', fontWeight:700 }}>Remise appliquée : <strong>-{Number(row.discount_applied).toFixed(2)} €</strong></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Confirm open={!!delId} onClose={()=>setDelId(null)} title="Supprimer ce client fidélité ?" desc="Ses tampons seront perdus." theme={theme}
        onConfirm={async()=>{ await loyaltyApi.removeClient(delId); setClients(p=>p.filter(c=>c.id!==delId)); setDelId(null); }} />
    </div>
  );
}
