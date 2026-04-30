import { useState, useEffect, useCallback, useRef } from 'react';
import { I } from '../../../../utils/icons';
import { loyaltyApi } from '../../../../utils/api';
import { Button, Label, SegmentedControl } from '../../../../components/primitives';

export default function TabLoyalty({ theme }) {
  const t = theme;
  const LOYALTY_PAGE_SIZE = 5;
  const [program, setProgram]   = useState(null);
  const [clients, setClients]   = useState([]);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [editProg, setEditProg] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [stampModal, setStampModal] = useState(null);
  const [stampEmail, setStampEmail] = useState('');
  const [stampName, setStampName]   = useState('');
  const [stamping, setStamping]     = useState(false);
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

  const [loyaltyStats,     setLoyaltyStats]     = useState(null);
  const [showLoyaltyStats, setShowLoyaltyStats] = useState(false);
  const [loyaltyStatsLoad, setLoyaltyStatsLoad] = useState(false);

  // Pagination 100% serveur (limit 5/page) + debounce 350ms + min 2 chars sur
  // search + seqRef anti race-condition. Empeche le frontend de telecharger
  // tous les clients fidelite d'un coup (un commercant avec 1000 clients
  // saturait sinon son navigateur pour n'en afficher que 5).
  const loadSeqRef = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const trimmed = (search || '').trim();
      const sendSearch = trimmed.length >= 2 ? trimmed : '';
      const [p, r] = await Promise.all([
        loyaltyApi.getProgram(),
        loyaltyApi.getClients({
          search: sendSearch,
          limit:  LOYALTY_PAGE_SIZE,
          offset: (page - 1) * LOYALTY_PAGE_SIZE,
        }),
      ]);
      if (seq !== loadSeqRef.current) return;
      setProgram(p);
      // Backwards-compat : ancien backend renvoie un tableau direct
      const rows  = Array.isArray(r) ? r : (r.rows || []);
      const total = Array.isArray(r) ? rows.length : (r.total || 0);
      setClients(rows);
      setClientsTotal(total);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [search, page]);

  const loadLoyaltyStats = async () => {
    setLoyaltyStatsLoad(true);
    try { const s = await loyaltyApi.getStats(); setLoyaltyStats(s); setShowLoyaltyStats(true); }
    catch (e) { console.error(e); }
    finally { setLoyaltyStatsLoad(false); }
  };

  // Debounce sur le terme de recherche (350ms si >=2 chars), sinon load immediat
  useEffect(() => {
    const trimmed = (search || '').trim();
    const needsDebounce = trimmed.length >= 2;
    const tm = setTimeout(() => load(), needsDebounce ? 350 : 0);
    return () => clearTimeout(tm);
  }, [load]);

  const saveProg = async () => {
    setSaving(true);
    try { const p = await loyaltyApi.saveProgram(program); setProgram(p); setEditProg(false); }
    finally { setSaving(false); }
  };

  // Reset page uniquement quand la recherche change (pas quand clients.length
  // change, sinon boucle infinie : load() change clients -> trigger -> load).
  useEffect(() => { setPage(1); }, [search]);

  const loadHistory = async () => {
    setHistLoad(true);
    try { const h = await loyaltyApi.promoHistory(); setPromoHist(h); setShowHist(true); }
    catch (e) { console.error(e); }
    finally { setHistLoad(false); }
  };

  useEffect(() => {
    if (!svcSearch || svcSearch.trim().length < 2) { setSvcResults([]); return; }
    setSvcSearchLoad(true);
    const to = setTimeout(async () => {
      try { const r = await loyaltyApi.searchClients(svcSearch); setSvcResults(r); }
      catch { setSvcResults([]); }
      finally { setSvcSearchLoad(false); }
    }, 350);
    return () => clearTimeout(to);
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
    } catch (e) { setSvcMsg('Erreur : ' + e.message); }
    finally { setSvcBusy(false); }
  };

  const doStamp = async () => {
    if (!stampEmail) return;
    setStamping(true);
    try {
      const res = await loyaltyApi.addStamp({ client_email:stampEmail, client_name:stampName, stamps_to_add:1 });
      if (res.reward_triggered) {
        alert(`${stampName || stampEmail} a atteint ${res.stamps_required} tampons ! Recompense debloquee : ${program.reward_label}`);
      }
      setStampModal(null); setStampEmail(''); setStampName('');
      load();
    } finally { setStamping(false); }
  };

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:14, fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  const Tog = ({ on, onChange, colorOn }) => (
    <button onClick={onChange}
            style={{ width:40, height:22, borderRadius:99, border:'none', cursor:'pointer',
                     position:'relative', flexShrink:0,
                     background: on ? (colorOn || t.text) : t.cardAlt,
                     transition:'background 0.2s', fontFamily:'inherit' }}>
      <div style={{ width:18, height:18, borderRadius:'50%', background:'white',
                    position:'absolute', top:2, left: on ? 20 : 2,
                    transition:'left 0.15s', boxShadow:t.shadowSm }}/>
    </button>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Programme */}
      <div style={{ background:t.card, borderRadius:12,
                    border:`0.5px solid ${t.border}`, overflow:'hidden' }}>
        <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between',
                      borderBottom:`0.5px solid ${t.separator}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:8, background:'#fffbeb',
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
              <I.Gift style={{ width:17, height:17, color:'#92400e' }}/>
            </div>
            <div>
              <p style={{ fontSize:14, fontWeight:500, color:t.text, margin:0 }}>Programme fidelite</p>
              {program && (
                <p style={{ fontSize:12, color:t.muted, margin:0 }}>
                  {program.stamps_required} tampons → {program.reward_label}
                </p>
              )}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {program && (
              <Tog on={!!program.enabled}
                   colorOn="#92400e"
                   onChange={() => {
                     setProgram(p => ({ ...p, enabled: !p.enabled }));
                     loyaltyApi.saveProgram({ ...program, enabled: !program.enabled });
                   }}/>
            )}
            <Button variant="secondary" size="small" type="button"
                    onClick={() => setEditProg(!editProg)}>
              {editProg ? '✓' : 'Edit'}
            </Button>
          </div>
        </div>

        {editProg && program && (
          <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <Label>Mode de fidelite</Label>
              <SegmentedControl fullWidth
                                value={program.loyalty_mode || 'stamps'}
                                onChange={v => setProgram(p => ({ ...p, loyalty_mode:v }))}
                                options={[
                                  { value:'stamps', label:'Passages' },
                                  { value:'points', label:'Points'   },
                                ]}/>
            </div>

            {(program.loyalty_mode || 'stamps') === 'points' && (
              <div>
                <Label>Points gagnes par euro depense</Label>
                <input type="number" min="0.01" step="0.1" value={program.points_per_euro || 1}
                       onChange={e => setProgram(p => ({ ...p, points_per_euro: parseFloat(e.target.value) || 1 }))}
                       style={inp}/>
                <p style={{ fontSize:11, color:t.muted, margin:'4px 0 0' }}>
                  Ex : 1 point = 1 € depense → seuil {program.stamps_required || 100} points
                </p>
              </div>
            )}

            <div>
              <Label>
                {(program.loyalty_mode || 'stamps') === 'points'
                  ? 'Points requis pour la recompense'
                  : 'Passages requis pour la recompense'}
              </Label>
              <input type="number" min="1" max="9999" value={program.stamps_required}
                     onChange={e => setProgram(p => ({ ...p, stamps_required: parseInt(e.target.value) || 10 }))}
                     style={inp}/>
            </div>

            <div>
              <Label>Type de recompense</Label>
              <SegmentedControl fullWidth
                                value={program.reward_type}
                                onChange={v => setProgram(p => ({ ...p, reward_type:v }))}
                                options={[
                                  { value:'percent', label:'% Reduction'   },
                                  { value:'fixed',   label:'€ Montant fixe' },
                                ]}/>
            </div>

            <div>
              <Label>Valeur de la recompense ({program.reward_type === 'percent' ? '%' : '€'})</Label>
              <div style={{ position:'relative' }}>
                <input type="number" min="1" max={program.reward_type === 'percent' ? 100 : 9999} step="0.5"
                       value={program.reward_value || 10}
                       onChange={e => setProgram(p => ({ ...p, reward_value: parseFloat(e.target.value) || 10 }))}
                       style={{ ...inp, paddingRight:34 }}/>
                <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                               fontWeight:500, color:t.muted, fontSize:14 }}>
                  {program.reward_type === 'percent' ? '%' : '€'}
                </span>
              </div>
            </div>

            <div>
              <Label>Libelle de la recompense</Label>
              <input placeholder="ex: Prestation offerte" value={program.reward_label || ''}
                     onChange={e => setProgram(p => ({ ...p, reward_label:e.target.value }))} style={inp}/>
            </div>

            <div>
              <Label>Comptabiliser les passages</Label>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {[
                  { v:'physical', l:'Physique uniquement',   d:'Caisse et prestation ajoutee sur place' },
                  { v:'online',   l:'En ligne uniquement',   d:'Reservations via le site public' },
                  { v:'both',     l:'Les deux (recommande)', d:'Physique + en ligne' },
                ].map(opt => {
                  const active = (program.count_trigger || 'both') === opt.v;
                  return (
                    <button key={opt.v}
                            onClick={() => setProgram(p => ({ ...p, count_trigger:opt.v }))}
                            style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                                     borderRadius:8, cursor:'pointer', textAlign:'left',
                                     border:`0.5px solid ${active ? '#92400e' : t.border}`,
                                     background: active ? '#fffbeb' : t.cardAlt,
                                     fontFamily:'inherit' }}>
                      <div style={{ width:14, height:14, borderRadius:'50%', flexShrink:0,
                                    border:`0.5px solid ${active ? '#92400e' : t.muted}`,
                                    background: active ? '#92400e' : 'transparent' }}/>
                      <div>
                        <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>{opt.l}</p>
                        <p style={{ margin:0, fontSize:11, color:t.muted }}>{opt.d}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <Label>Achat minimum (€)</Label>
                <input type="number" min="0" step="0.5" value={program.min_purchase || 0}
                       onChange={e => setProgram(p => ({ ...p, min_purchase: parseFloat(e.target.value) || 0 }))}
                       style={inp}/>
              </div>
              <div>
                <Label>Validite du code (jours)</Label>
                <input type="number" min="1" max="365" value={program.validity_days || 90}
                       onChange={e => setProgram(p => ({ ...p, validity_days: parseInt(e.target.value) || 90 }))}
                       style={inp}/>
              </div>
            </div>

            <div style={{ background:'#fffbeb', borderRadius:8, padding:'10px 14px' }}>
              <p style={{ fontSize:12, color:'#92400e', margin:0, fontWeight:500 }}>
                {program.stamps_required} {(program.loyalty_mode || 'stamps') === 'points' ? 'points' : 'passages'} → {program.reward_type === 'percent' ? `${program.reward_value || 10}%` : `${Number(program.reward_value || 10).toFixed(2)} €`} · valide {program.validity_days || 90}j{(program.min_purchase || 0) > 0 ? ` · min ${program.min_purchase}€` : ''}
              </p>
            </div>

            <Button variant="primary" fullWidth type="button" onClick={saveProg} disabled={saving}>
              {saving ? '...' : 'Sauvegarder'}
            </Button>
          </div>
        )}
      </div>

      {/* Search + add tampon + tracabilite */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:160, position:'relative' }}>
          <I.Search style={{ width:14, height:14, position:'absolute', left:12, top:'50%',
                             transform:'translateY(-50%)', color:t.muted }}/>
          <input placeholder="Rechercher un client..." value={search}
                 onChange={e => setSearch(e.target.value)}
                 style={{ width:'100%', padding:'10px 10px 10px 36px', borderRadius:8,
                          border:`0.5px solid ${t.borderInput}`,
                          background:t.inputBg, color:t.text,
                          fontSize:13, outline:'none', boxSizing:'border-box',
                          fontFamily:'inherit' }}/>
        </div>
        <Button variant="primary" size="small" type="button"
                onClick={() => setStampModal(true)} disabled={!program?.enabled}>
          + Tampon
        </Button>
        <Button variant="secondary" size="small" type="button"
                onClick={loadLoyaltyStats} disabled={loyaltyStatsLoad}>
          {loyaltyStatsLoad ? '...' : 'Tracabilite'}
        </Button>
      </div>

      {/* Tracabilite */}
      {showLoyaltyStats && loyaltyStats && (
        <div style={{ background:'#fffbeb', borderRadius:12, padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p style={{ fontSize:13, fontWeight:500, color:'#92400e', margin:0 }}>Tracabilite fidelite</p>
            <button onClick={() => setShowLoyaltyStats(false)}
                    style={{ background:'none', border:'none', cursor:'pointer',
                             color:'#92400e', fontSize:16, fontFamily:'inherit' }}>×</button>
          </div>
          {(() => {
            const s = loyaltyStats.summary || {};
            const codesGeneres  = parseInt(s.total_codes || 0);
            const mtUtilise     = parseFloat(s.montant_utilise || 0);
            const codesUtilises = parseInt(s.codes_utilises || 0);
            const codesRestants = parseInt(s.codes_restants || 0);
            return (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:8, marginBottom:14 }}>
                {[
                  { l:'Codes generes',     v: codesGeneres,                 c:'#92400e', bg:'#fffbeb' },
                  { l:'Remises utilisees', v: `${mtUtilise.toFixed(2)} €`,  c:'#991b1b', bg:'#fef2f2' },
                  { l:'Codes utilises',    v: codesUtilises,                c:'#065f46', bg:'#f0fdf4' },
                  { l:'Codes restants',    v: codesRestants,                c:t.text,    bg:t.cardAlt },
                ].map(({ l, v, c, bg }) => (
                  <div key={l} style={{ borderRadius:8, padding:'10px 12px', textAlign:'center', background:bg }}>
                    <p style={{ fontSize:10, color:c, opacity:0.75, margin:0 }}>{l}</p>
                    <p style={{ fontSize:16, fontWeight:500, color:c, margin:'4px 0 0' }}>{v}</p>
                  </div>
                ))}
              </div>
            );
          })()}
          {loyaltyStats.clients && loyaltyStats.clients.length > 0 && (
            <div>
              <p style={{ fontSize:11, color:'#92400e', margin:'0 0 8px' }}>CA par client</p>
              <div style={{ display:'flex', flexDirection:'column', gap:6,
                            maxHeight:220, overflowY:'auto' }}>
                {loyaltyStats.clients.map((cl, i) => (
                  <div key={i}
                       style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                padding:'8px 12px', background:t.card, borderRadius:8,
                                border:`0.5px solid ${t.border}` }}>
                    <div>
                      <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>
                        {cl.client_name || cl.client_email}
                      </p>
                      <p style={{ margin:0, fontSize:11, color:t.muted }}>
                        {cl.total_stamps_ever} passage{cl.total_stamps_ever > 1 ? 's' : ''} · {cl.rewards_earned} recompense{cl.rewards_earned > 1 ? 's' : ''}
                      </p>
                    </div>
                    <span style={{ fontSize:13, fontWeight:500, color:'#065f46',
                                   fontFamily:'monospace' }}>
                      {Number(cl.ca_total).toFixed(2)} €
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Liste clients */}
      {loading ? (
        <div style={{ padding:'48px 0', textAlign:'center' }}>
          <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24"
               style={{ color:t.muted, display:'inline-block' }}>
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
            <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      ) : clients.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px',
                      background:t.card, borderRadius:12, border:`0.5px solid ${t.border}` }}>
          <I.Gift style={{ width:36, height:36, margin:'0 auto 10px', color:t.dim, display:'block' }}/>
          <p style={{ color:t.muted, fontSize:14, margin:0 }}>Aucun client fidelite</p>
        </div>
      ) : (
        <div style={{ background:t.card, borderRadius:12,
                      border:`0.5px solid ${t.border}`, overflow:'hidden' }}>
          {clients.map((cl, i, arr) => {
            const isPoints = (program?.loyalty_mode || 'stamps') === 'points';
            return (
              <div key={cl.id}
                   style={{ padding:'14px 16px',
                            borderBottom: i < arr.length - 1 ? `0.5px solid ${t.separator}` : 'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <div style={{ width:34, height:34, borderRadius:8, background:'#fffbeb',
                                display:'flex', alignItems:'center', justifyContent:'center',
                                fontWeight:500, fontSize:14, color:'#92400e', flexShrink:0 }}>
                    {(cl.client_name || cl.client_email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:500, fontSize:14, color:t.text, margin:0,
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {cl.client_name || '-'}
                    </p>
                    <p style={{ fontSize:11, color:t.muted, margin:0,
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {cl.client_email}
                    </p>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    {isPoints ? (
                      <>
                        <p style={{ fontWeight:500, fontSize:17, color:t.text, margin:0 }}>
                          {Math.floor(cl.points || 0)}
                          <span style={{ fontSize:11, color:t.muted, fontWeight:400 }}>
                            pts/{program?.stamps_required || 100}
                          </span>
                        </p>
                        <p style={{ fontSize:10, color:t.dim, margin:0 }}>
                          {cl.total_points_ever || 0} pts cumules
                        </p>
                      </>
                    ) : (
                      <>
                        <p style={{ fontWeight:500, fontSize:17, color:'#92400e', margin:0 }}>
                          {cl.stamps}
                          <span style={{ fontSize:11, color:t.muted, fontWeight:400 }}>
                            /{program?.stamps_required || 10}
                          </span>
                        </p>
                        <p style={{ fontSize:10, color:t.dim, margin:0 }}>
                          {cl.rewards_earned} recompense{cl.rewards_earned > 1 ? 's' : ''}
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  {Array.from({ length: program?.stamps_required || 10 }).map((_, j) => (
                    <div key={j} style={{ flex:1, height:5, borderRadius:3,
                                          background: j < cl.stamps ? '#92400e' : t.cardAlt }}/>
                  ))}
                </div>
              </div>
            );
          })}
          {clientsTotal > LOYALTY_PAGE_SIZE && (() => {
            const total = clientsTotal;
            const pages = Math.max(1, Math.ceil(total / LOYALTY_PAGE_SIZE));
            const cur   = Math.min(page, pages);
            const from  = (cur - 1) * LOYALTY_PAGE_SIZE + 1;
            const to    = Math.min(cur * LOYALTY_PAGE_SIZE, total);
            return (
              <div style={{ padding:'12px 16px', borderTop:`0.5px solid ${t.separator}`,
                            display:'flex', alignItems:'center', justifyContent:'space-between',
                            gap:10, flexWrap:'wrap' }}>
                <p style={{ fontSize:12, color:t.muted, margin:0 }}>{from}–{to} sur {total}</p>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <Button variant="secondary" size="small" type="button"
                          onClick={() => setPage(p => Math.max(1, p - 1))} disabled={cur <= 1}>
                    ← Prec.
                  </Button>
                  <span style={{ padding:'6px 10px', fontSize:12, fontWeight:500, color:t.muted }}>
                    {cur} / {pages}
                  </span>
                  <Button variant="secondary" size="small" type="button"
                          onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={cur >= pages}>
                    Suiv. →
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Modal tampon */}
      {stampModal && (
        <div style={{ position:'fixed', inset:0, zIndex:200,
                      display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={() => setStampModal(null)}
               style={{ position:'absolute', inset:0,
                        background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}/>
          <div style={{ position:'relative', width:'100%', maxWidth:380, padding:24,
                        background:t.elevated, borderRadius:16,
                        border:`0.5px solid ${t.border}`,
                        boxShadow:t.shadowModal }}>
            <h3 style={{ fontSize:16, fontWeight:500, color:t.text, margin:'0 0 18px' }}>Ajouter un tampon</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <Label>Email client *</Label>
                <input type="email" placeholder="client@email.fr"
                       value={stampEmail} onChange={e => setStampEmail(e.target.value)} style={inp}/>
              </div>
              <div>
                <Label>Nom (optionnel)</Label>
                <input placeholder="Prenom Nom"
                       value={stampName} onChange={e => setStampName(e.target.value)} style={inp}/>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <Button variant="secondary" type="button"
                      onClick={() => setStampModal(null)} style={{ flex:1 }}>
                Annuler
              </Button>
              <Button variant="primary" type="button"
                      onClick={doStamp} disabled={stamping || !stampEmail} style={{ flex:2 }}>
                {stamping ? '...' : 'Valider le tampon'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Ajouter prestation client */}
      <div style={{ background:t.card, borderRadius:12, padding:20,
                    border:`0.5px solid ${t.border}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <I.Plus style={{ width:17, height:17, color:'#065f46' }}/>
            <span style={{ fontSize:14, fontWeight:500, color:t.text }}>
              Ajouter une prestation client
            </span>
          </div>
          <Button variant="secondary" size="small" type="button"
                  onClick={() => { setShowAddSvc(!showAddSvc); setSvcMsg(''); }}>
            {showAddSvc ? 'Fermer' : 'Ouvrir'}
          </Button>
        </div>
        {showAddSvc && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ position:'relative' }}>
              <input placeholder="Rechercher par nom, email, telephone..."
                     value={svcSearch}
                     onChange={e => { setSvcSearch(e.target.value); setSvcClient(null); }}
                     style={inp}/>
              {svcSearchLoad && (
                <span style={{ position:'absolute', right:12, top:'50%',
                               transform:'translateY(-50%)', fontSize:12, color:t.muted }}>
                  ...
                </span>
              )}
            </div>
            {svcResults.length > 0 && !svcClient && (
              <div style={{ background:t.cardAlt, borderRadius:8,
                            border:`0.5px solid ${t.border}`, overflow:'hidden' }}>
                {svcResults.map(r => (
                  <div key={r.id}
                       onClick={() => {
                         setSvcClient(r); setSvcResults([]);
                         setSvcSearch(r.name + (r.email ? ' - ' + r.email : ''));
                       }}
                       style={{ padding:'10px 14px', cursor:'pointer',
                                borderBottom:`0.5px solid ${t.separator}`,
                                display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>{r.name}</p>
                      <p style={{ margin:0, fontSize:11, color:t.muted }}>
                        {r.email}{r.phone ? ' · ' + r.phone : ''}
                      </p>
                    </div>
                    <span style={{ fontSize:11, fontWeight:500, color:'#92400e',
                                   background:'#fffbeb', padding:'2px 8px', borderRadius:99 }}>
                      {r.stamps || 0}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {svcClient && (
              <div style={{ background:'#f0fdf4', borderRadius:8, padding:'12px 14px',
                            display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ margin:0, fontSize:13, fontWeight:500, color:'#065f46' }}>{svcClient.name}</p>
                  <p style={{ margin:0, fontSize:11, color:'#065f46', opacity:0.8 }}>
                    {svcClient.email} · {svcClient.stamps || 0}/{program?.stamps_required || '?'} tampons
                  </p>
                </div>
                <button onClick={() => { setSvcClient(null); setSvcSearch(''); }}
                        style={{ background:'none', border:'none', cursor:'pointer',
                                 color:'#065f46', fontSize:16, fontFamily:'inherit' }}>×</button>
              </div>
            )}
            <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}>
                <Label>Nb de tampons a ajouter</Label>
                <input type="number" min="1" max="20" value={svcQty}
                       onChange={e => setSvcQty(parseInt(e.target.value) || 1)} style={inp}/>
              </div>
              <Button variant="primary" type="button"
                      onClick={doAddService} disabled={!svcClient || svcBusy}>
                {svcBusy ? '...' : '+ Ajouter'}
              </Button>
            </div>
            {svcMsg && (
              <p style={{ margin:0, fontSize:12, fontWeight:500,
                          color: svcMsg.includes('Erreur') ? '#991b1b' : '#065f46',
                          background: svcMsg.includes('Erreur') ? '#fef2f2' : '#f0fdf4',
                          padding:'8px 12px', borderRadius:8 }}>
                {svcMsg}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Historique codes fidelite */}
      <div style={{ background:t.card, borderRadius:12, padding:20,
                    border:`0.5px solid ${t.border}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      marginBottom: showHist ? 14 : 0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <I.FileText style={{ width:17, height:17, color:t.text }}/>
            <span style={{ fontSize:14, fontWeight:500, color:t.text }}>Historique codes fidelite</span>
          </div>
          <Button variant="secondary" size="small" type="button"
                  onClick={() => { if (!showHist) loadHistory(); else setShowHist(false); }}>
            {histLoad ? '...' : showHist ? 'Masquer' : 'Afficher'}
          </Button>
        </div>
        {showHist && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {promoHist.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px 0', color:t.muted }}>
                <p style={{ fontSize:13, fontWeight:500, margin:0 }}>
                  {"Aucun code fidelite genere pour l'instant"}
                </p>
              </div>
            ) : promoHist.map(row => {
              const used = row.uses_count > 0;
              const expired = !row.is_active || (row.valid_until && new Date(row.valid_until) < new Date());
              const statusColor = used ? '#065f46' : expired ? '#991b1b' : '#92400e';
              const statusBg    = used ? '#f0fdf4' : expired ? '#fef2f2' : '#fffbeb';
              const statusLabel = used ? 'Utilise' : expired ? 'Expire' : 'Disponible';
              return (
                <div key={row.id}
                     style={{ background:t.card, border:`0.5px solid ${t.border}`,
                              borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between',
                                alignItems:'flex-start', gap:10, marginBottom:10 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                        <span style={{ fontFamily:'monospace', fontWeight:500, fontSize:14,
                                       color:'#92400e' }}>
                          {row.code}
                        </span>
                        <span style={{ padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:500,
                                       background:statusBg, color:statusColor }}>
                          {statusLabel}
                        </span>
                      </div>
                      <p style={{ margin:0, fontSize:12, color:t.muted }}>
                        Client : <strong style={{ color:t.text, fontWeight:500 }}>
                          {row.owner_name || row.owner_client_email || '-'}
                        </strong>
                      </p>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <p style={{ margin:0, fontWeight:500, fontSize:15, color:t.text }}>
                        {row.type === 'percent' ? `-${row.value}%` : `-${Number(row.value || 0).toFixed(2)} €`}
                      </p>
                      {row.min_purchase > 0 && (
                        <p style={{ margin:'2px 0 0', fontSize:10, color:t.muted }}>
                          Min. {Number(row.min_purchase).toFixed(2)} €
                        </p>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10, fontSize:11 }}>
                    <span style={{ color:t.muted }}>
                      Genere le <strong style={{ fontWeight:500 }}>
                        {row.created_at ? new Date(row.created_at).toLocaleDateString('fr-FR') : '-'}
                      </strong>
                    </span>
                    <span style={{ color: row.valid_until && new Date(row.valid_until) < new Date() ? '#991b1b' : t.muted }}>
                      Expire le <strong style={{ fontWeight:500 }}>
                        {row.valid_until ? new Date(row.valid_until).toLocaleDateString('fr-FR') : '-'}
                      </strong>
                    </span>
                    {used && (
                      <span style={{ color:'#065f46' }}>
                        Utilise le <strong style={{ fontWeight:500 }}>
                          {row.used_at ? new Date(row.used_at).toLocaleDateString('fr-FR') : '-'}
                        </strong>
                      </span>
                    )}
                    {row.discount_applied && (
                      <span style={{ color:'#065f46', fontWeight:500 }}>
                        Remise : <strong style={{ fontWeight:500 }}>
                          -{Number(row.discount_applied).toFixed(2)} €
                        </strong>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
