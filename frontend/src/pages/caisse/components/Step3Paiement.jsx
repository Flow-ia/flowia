// Caisse > Encaisser > Step 3 · Paiement.
// Simple OU multi-paiements (validation somme = total à l'euro près).
// Code promo/parrainage check live (promoApi.check). Crédit client
// disponible affiché si email saisi. Cartes réductions anniversaire/
// parrainage via referralsApi.getClientRewards (pendingRefs + rewards).
// Respect §15 INVENTAIRE : couleurs pastel moyens paiement + Multi.
import { useEffect, useRef, useState } from 'react';
import { promoApi, referralsApi, creditsApi, clientsApi } from '../../../utils/api';
import { Icon } from '../../../components/Icon';

const PM_CFG = {
  cash:     { label: 'Espèces',  text: '#065f46', bg: '#f0fdf4', icon: 'wallet'     },
  card:     { label: 'Carte',    text: '#4338ca', bg: '#eef2ff', icon: 'creditCard' },
  transfer: { label: 'Virement', text: '#0e7490', bg: '#ecfeff', icon: 'send'       },
  other:    { label: 'Autre',    text: '#92400e', bg: '#fffbeb', icon: 'more'       },
};

function fmt(n) { return Number(n || 0).toFixed(2); }

export default function Step3Paiement({
  theme: t, cart,
  payMethod, setPayMethod,
  splitMode, setSplitMode,
  splitAmts, setSplitAmts,
  promoCode, setPromoCode,
  promoData, setPromoData,
  promoErr, setPromoErr,
  clientEmail, setClientEmail,
  clientName, setClientName,
  clientNote, setClientNote,
  selectedRewardId, setSelectedRewardId,
  onBack, onContinue, showToast,
}) {
  const [promoLoad, setPromoLoad] = useState(false);
  const [pendingRefs, setPendingRefs]   = useState([]);
  const [clientRewards, setClientRewards] = useState([]);
  const [clientCredit, setClientCredit] = useState(null);

  // UX commit 7d : recherche client multi-champs (nom/prénom/email/téléphone)
  // via clientsApi.search (GET /api/clients/search?q= — ILIKE back sur les
  // 3 colonnes : (first_name||' '||last_name), email, phone). Debounce 350 ms,
  // minimum 2 caractères, max 5 suggestions en dropdown.
  const [clientSearch,    setClientSearch]    = useState('');
  const [clientSuggests,  setClientSuggests]  = useState([]);
  const [clientSearchBusy, setClientSearchBusy] = useState(false);
  const [suggestsOpen,    setSuggestsOpen]    = useState(false);
  const searchSeqRef = useRef(0);

  const total = cart.reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);
  const discount = parseFloat(promoData?.discount || 0);
  const finalTotal = Math.max(0, total - discount);

  // Debounce 350 ms sur la recherche client multi-champs.
  useEffect(() => {
    const q = clientSearch.trim();
    if (q.length < 2) { setClientSuggests([]); return; }
    const seq = ++searchSeqRef.current;
    setClientSearchBusy(true);
    const tm = setTimeout(() => {
      clientsApi.search(q)
        .then(list => {
          if (seq !== searchSeqRef.current) return; // réponse périmée
          setClientSuggests(Array.isArray(list) ? list.slice(0, 5) : []);
          setSuggestsOpen(true);
        })
        .catch(() => { if (seq === searchSeqRef.current) setClientSuggests([]); })
        .finally(() => { if (seq === searchSeqRef.current) setClientSearchBusy(false); });
    }, 350);
    return () => clearTimeout(tm);
  }, [clientSearch]);

  const pickClient = (c) => {
    const display = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.client_name || '';
    setClientName(display);
    setClientEmail(c.email || '');
    setClientSearch(display || c.email || '');
    setSuggestsOpen(false);
  };

  const clearClient = () => {
    setClientName(''); setClientEmail('');
    setClientSearch(''); setClientSuggests([]);
    setSuggestsOpen(false);
  };

  // Crédit client dispo + rewards (rechargé à chaque changement d'email).
  useEffect(() => {
    const low = (clientEmail || '').trim().toLowerCase();
    if (!low) {
      setPendingRefs([]); setClientRewards([]); setClientCredit(null); setSelectedRewardId(null);
      return;
    }
    let cancelled = false;
    referralsApi.getClientRewards(low)
      .then(r => {
        if (cancelled) return;
        setPendingRefs(r.pending || []); setClientRewards(r.rewards || []);
      })
      .catch(() => { setPendingRefs([]); setClientRewards([]); });
    creditsApi.list({ search: low })
      .then(list => {
        if (cancelled) return;
        const match = (Array.isArray(list) ? list : []).find(c =>
          String(c.client_email || '').toLowerCase() === low);
        setClientCredit(match && parseFloat(match.balance) > 0
          ? { balance: parseFloat(match.balance), id: match.id }
          : null);
      })
      .catch(() => setClientCredit(null));
    return () => { cancelled = true; };
  }, [clientEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkPromo = async (codeOverride) => {
    const code = (codeOverride || promoCode || '').trim();
    if (!code) return;
    setPromoLoad(true); setPromoErr('');
    try {
      const res = await promoApi.check({
        code,
        amount: total,
        client_email: (clientEmail || '').trim() || undefined,
      });
      if (res.valid) { setPromoData(res); setPromoErr(''); }
      else {
        setPromoData(null);
        setPromoErr(res.error || 'Code invalide');
        setSelectedRewardId(null);
      }
    } catch (e) {
      setPromoErr(e.message || 'Impossible de vérifier le code');
      setSelectedRewardId(null);
    } finally { setPromoLoad(false); }
  };

  const applyReward = (reward) => {
    setSelectedRewardId(reward.id);
    setPromoCode(reward.code || '');
    setTimeout(() => checkPromo(reward.code), 0);
  };

  // Multi-paiements : somme = finalTotal à 0.01 € près.
  const paymentsEntries = splitMode
    ? Object.entries(splitAmts)
        .map(([method, raw]) => ({ method, amount: parseFloat(raw) || 0 }))
        .filter(p => p.amount > 0)
    : [{ method: payMethod, amount: finalTotal }];
  const paymentsSum  = paymentsEntries.reduce((s, p) => s + p.amount, 0);
  const paymentsDiff = finalTotal - paymentsSum;
  const paymentsOk   = !splitMode || Math.abs(paymentsDiff) < 0.01;

  const card = {
    padding: 14, borderRadius: 12, background: t.card,
    border: `0.5px solid ${t.border}`,
    display: 'flex', flexDirection: 'column', gap: 10,
  };
  const title = { margin: 0, fontSize: 13, fontWeight: 500, color: t.text };
  const inp = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    background: t.inputBg, border: `0.5px solid ${t.borderInput}`,
    color: t.text, fontSize: 13, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ display:'grid',
                  gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: 14 }}>
      {/* ── Colonne gauche : Client, promo, rewards ── */}
      <div style={{ display:'flex', flexDirection:'column', gap: 14 }}>
        <div style={card}>
          <p style={title}>{"Client (optionnel)"}</p>

          {/* Barre de recherche multi-champs (nom / prénom / email / téléphone). */}
          <div style={{ position:'relative' }}>
            <input value={clientSearch}
                   onChange={e => { setClientSearch(e.target.value); setSuggestsOpen(true); }}
                   onFocus={() => { if (clientSuggests.length > 0) setSuggestsOpen(true); }}
                   onBlur={() => { setTimeout(() => setSuggestsOpen(false), 150); }}
                   placeholder="Rechercher un client (nom, email, téléphone)…"
                   style={inp}/>
            {(clientSearch || clientName || clientEmail) && (
              <button onClick={clearClient}
                      style={{ position:'absolute', right: 8, top: '50%',
                               transform: 'translateY(-50%)',
                               border: 'none', background: 'transparent',
                               cursor: 'pointer', color: t.muted,
                               padding: 4, fontFamily:'inherit' }}
                      aria-label="Effacer">
                <Icon name="x" size={12} color={t.muted}/>
              </button>
            )}
            {suggestsOpen && clientSuggests.length > 0 && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0,
                            zIndex: 10, background: t.card,
                            border: `0.5px solid ${t.border}`, borderRadius: 10,
                            boxShadow: t.shadowSm || '0 4px 16px rgba(0,0,0,0.08)',
                            overflow: 'hidden' }}>
                {clientSuggests.map(c => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.client_name || '—';
                  const sub  = c.email || c.phone || '';
                  return (
                    <button key={c.id}
                            onMouseDown={() => pickClient(c)}
                            style={{ width:'100%', textAlign:'left',
                                     padding:'10px 12px', border:'none',
                                     background: 'transparent', color: t.text,
                                     cursor:'pointer', fontFamily:'inherit',
                                     borderBottom: `0.5px solid ${t.separator}`,
                                     display:'flex', flexDirection:'column', gap:2 }}
                            onMouseEnter={e => { e.currentTarget.style.background = t.cardAlt; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: t.text,
                                     overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {name}
                      </span>
                      {sub && (
                        <span style={{ fontSize: 11, color: t.muted,
                                       overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {sub}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {suggestsOpen && clientSearch.trim().length >= 2 && clientSuggests.length === 0 && !clientSearchBusy && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0,
                            zIndex: 10, background: t.card,
                            border: `0.5px solid ${t.border}`, borderRadius: 10,
                            padding: '10px 12px', fontSize: 12, color: t.muted }}>
                {"Aucun client trouvé. Les champs ci-dessous restent éditables pour créer un nouveau client."}
              </div>
            )}
          </div>

          {/* Champs éditables : pré-remplis par la recherche, libres sinon. */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
            <input placeholder="Prénom Nom" value={clientName}
                   onChange={e => setClientName(e.target.value)} style={inp}/>
            <input type="email" placeholder="email@exemple.fr" value={clientEmail}
                   onChange={e => setClientEmail(e.target.value)} style={inp}/>
          </div>
          {clientCredit && (
            <div style={{ padding:10, borderRadius:8,
                          background:'#f0fdf4',
                          borderLeft:'2px solid #10b981',
                          display:'flex', gap:8, alignItems:'center',
                          fontSize:12, color:'#065f46' }}>
              <Icon name="wallet" size={14} color="#065f46"/>
              <div style={{ flex:1 }}>
                <strong style={{ fontWeight:500 }}>
                  {"Crédit disponible : " + fmt(clientCredit.balance) + " €"}
                </strong>
                <p style={{ margin:'2px 0 0', fontSize:11, color:'#065f46', opacity:0.75 }}>
                  {"L'utiliser se fait en ajoutant une ligne de paiement « Autre » avec le montant du crédit."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div style={card}>
          <p style={title}>{"Code promo / parrainage"}</p>
          <div style={{ display:'flex', gap:6 }}>
            <input value={promoCode}
                   onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoErr(''); }}
                   onKeyDown={e => e.key === 'Enter' && checkPromo()}
                   placeholder="Code…"
                   style={{ ...inp, textTransform:'uppercase' }}/>
            <button onClick={() => checkPromo()} disabled={promoLoad}
                    style={{ padding:'8px 12px', borderRadius:8,
                             border:`0.5px solid ${t.border}`,
                             background:t.cardAlt, color:t.text,
                             cursor:'pointer', fontFamily:'inherit',
                             fontSize:12, fontWeight:500, whiteSpace:'nowrap' }}>
              {promoLoad ? '…' : 'Vérifier'}
            </button>
          </div>
          {promoErr && <p style={{ margin:0, fontSize:11, color:'#991b1b' }}>{promoErr}</p>}
          {promoData && !promoErr && (
            <p style={{ margin:0, fontSize:11, color:'#065f46' }}>
              {"Remise appliquée : −" + fmt(discount) + " €"}
            </p>
          )}

          {/* Rewards anniversaire / fidélité (pastel orange/indigo). */}
          {clientRewards.filter(r => r.status === 'available').map(r => (
            <div key={r.id}
                 style={{ padding:10, borderRadius:8,
                          background: r.reward_type === 'birthday' ? '#fff7ed' : '#eef2ff',
                          borderLeft: '2px solid ' + (r.reward_type === 'birthday' ? '#f97316' : '#4338ca'),
                          display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
              <div style={{ display:'flex', gap:8, alignItems:'center', minWidth:0 }}>
                <Icon name="gift" size={14}
                      color={r.reward_type === 'birthday' ? '#9a3412' : '#4338ca'}/>
                <div style={{ minWidth:0 }}>
                  <p style={{ margin:0, fontSize:12, fontWeight:500,
                              color: r.reward_type === 'birthday' ? '#9a3412' : '#4338ca' }}>
                    {r.reward_type === 'birthday' ? 'Offre anniversaire' : 'Récompense fidélité'}
                  </p>
                  <p style={{ margin:0, fontSize:11, color:t.muted,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {r.code || 'Code automatique'}
                  </p>
                </div>
              </div>
              <button onClick={() => applyReward(r)}
                      style={{ padding:'5px 10px', borderRadius:6, border:'none',
                               background:t.cardAlt, color:t.text, cursor:'pointer',
                               fontFamily:'inherit', fontSize:11, fontWeight:500,
                               flexShrink:0 }}>
                {selectedRewardId === r.id ? 'Appliqué' : 'Appliquer'}
              </button>
            </div>
          ))}

          {/* Parrainages pending (violet). */}
          {pendingRefs.map(ref => (
            <div key={ref.id}
                 style={{ padding:10, borderRadius:8,
                          background:'#eeedfe', borderLeft:'2px solid #8b5cf6',
                          display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
              <div style={{ display:'flex', gap:8, alignItems:'center', minWidth:0 }}>
                <Icon name="users" size={14} color="#3c3489"/>
                <div style={{ minWidth:0 }}>
                  <p style={{ margin:0, fontSize:12, fontWeight:500, color:'#3c3489' }}>
                    {"Parrainage en attente"}
                  </p>
                  <p style={{ margin:0, fontSize:11, color:t.muted,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {ref.parrain_label || ref.code || 'Filleul'}
                  </p>
                </div>
              </div>
              <p style={{ margin:0, fontSize:11, color:t.muted, flexShrink:0 }}>
                {"À valider à la caisse"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Colonne droite : Mode de paiement ── */}
      <div style={card}>
        <p style={title}>{"Mode de paiement"}</p>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          <button onClick={() => setSplitMode(false)}
                  style={{ padding:'9px 10px', borderRadius:8,
                           border:`0.5px solid ${!splitMode ? t.text : t.border}`,
                           background: !splitMode ? t.cardAlt : t.card,
                           color: t.text, cursor:'pointer', fontFamily:'inherit',
                           fontSize:12, fontWeight: !splitMode ? 500 : 400 }}>
            {"Simple"}
          </button>
          <button onClick={() => setSplitMode(true)}
                  style={{ padding:'9px 10px', borderRadius:8,
                           border:`0.5px solid ${splitMode ? t.text : t.border}`,
                           background: splitMode ? t.cardAlt : t.card,
                           color: t.text, cursor:'pointer', fontFamily:'inherit',
                           fontSize:12, fontWeight: splitMode ? 500 : 400 }}>
            {"Multi-paiements"}
          </button>
        </div>

        {!splitMode ? (
          <div style={{ display:'grid',
                        gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))',
                        gap: 8 }}>
            {Object.entries(PM_CFG).map(([id, cfg]) => {
              const active = payMethod === id;
              return (
                <button key={id} onClick={() => setPayMethod(id)}
                        style={{ position:'relative',
                                 padding:'14px 10px', borderRadius:10,
                                 background: active ? cfg.bg : '#fff',
                                 border: active
                                   ? '0.5px solid rgba(0,0,0,0.04)'
                                   : '0.5px solid #e5e7eb',
                                 borderLeft: active
                                   ? '3px solid ' + cfg.text
                                   : '3px solid transparent',
                                 opacity: active ? 1 : 0.7,
                                 color: active ? cfg.text : '#6b7280',
                                 cursor:'pointer', fontFamily:'inherit',
                                 display:'flex', flexDirection:'column',
                                 alignItems:'center', gap:6,
                                 transition: 'opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease' }}>
                  {active && (
                    <span style={{ position:'absolute', top:6, right:6,
                                   display:'inline-flex' }}>
                      <Icon name="checkCircle" size={16} color={cfg.text} strokeWidth={2}/>
                    </span>
                  )}
                  <Icon name={cfg.icon} size={22}
                        color={active ? cfg.text : '#9ca3af'}/>
                  <span style={{ fontSize:14, fontWeight:500,
                                 color: active ? cfg.text : '#6b7280' }}>
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {Object.entries(PM_CFG).map(([id, cfg]) => (
              <div key={id}
                   style={{ padding:10, borderRadius:8,
                            background: cfg.bg, borderLeft: '2px solid ' + cfg.text,
                            display:'flex', justifyContent:'space-between',
                            alignItems:'center', gap:8 }}>
                <span style={{ fontSize:12, fontWeight:500, color: cfg.text }}>{cfg.label}</span>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input type="number" step="0.01" min="0"
                         value={splitAmts[id] || ''}
                         onChange={e => setSplitAmts({ ...splitAmts, [id]: e.target.value })}
                         placeholder="0"
                         style={{ width:80, padding:'4px 8px', borderRadius:6,
                                  border:`0.5px solid ${t.borderInput}`,
                                  background:t.inputBg, color: cfg.text,
                                  fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                                  fontSize:12, textAlign:'right', outline:'none' }}/>
                  <span style={{ fontSize:11, fontWeight:500, color: cfg.text }}>{"€"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Récap total / remise / écart. */}
        <div style={{ marginTop:6, padding:12, borderRadius:8, background: t.cardAlt,
                      display:'flex', flexDirection:'column', gap:4, fontSize:11 }}>
          <div style={{ display:'flex', justifyContent:'space-between', color: t.muted }}>
            <span>{"Total panier"}</span>
            <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{fmt(total)} €</span>
          </div>
          {discount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', color:'#9a3412' }}>
              <span>{"Remise"}</span>
              <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{"−" + fmt(discount)} €</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between',
                        fontSize:13, fontWeight:500, color:t.text,
                        borderTop:`0.5px solid ${t.separator}`, paddingTop:6, marginTop:4 }}>
            <span>{"À encaisser"}</span>
            <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{fmt(finalTotal)} €</span>
          </div>
          {splitMode && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', color: t.muted }}>
                <span>{"Saisi"}</span>
                <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{fmt(paymentsSum)} €</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between',
                            color: paymentsOk ? '#065f46' : '#991b1b' }}>
                <strong style={{ fontWeight:500 }}>{"Écart"}</strong>
                <strong style={{ fontWeight:500, fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {(paymentsDiff >= 0 ? '+' : '') + fmt(paymentsDiff)} €
                </strong>
              </div>
            </>
          )}
        </div>

        <textarea placeholder="Note interne (optionnel)"
                  value={clientNote}
                  onChange={e => setClientNote(e.target.value)}
                  rows={2}
                  style={{ ...inp, resize:'vertical' }}/>

        <div style={{ display:'flex', gap:8, justifyContent:'space-between' }}>
          <button onClick={onBack}
                  style={{ padding:'10px 14px', borderRadius:8,
                           border:`0.5px solid ${t.border}`,
                           background:t.cardAlt, color:t.text,
                           cursor:'pointer', fontFamily:'inherit',
                           fontSize:12, fontWeight:500,
                           display:'inline-flex', alignItems:'center', gap:6 }}>
            <Icon name="chevronLeft" size={13} color={t.text}/>
            {"Retour"}
          </button>
          <button onClick={onContinue} disabled={!paymentsOk}
                  style={{ padding:'10px 16px', borderRadius:8, border:'none',
                           background: paymentsOk ? '#10b981' : t.cardAlt,
                           color: paymentsOk ? '#fff' : t.muted,
                           cursor: paymentsOk ? 'pointer' : 'not-allowed',
                           fontFamily:'inherit', fontSize:13, fontWeight:500,
                           display:'inline-flex', alignItems:'center', gap:6 }}>
            {"Continuer"}
            <Icon name="chevronRight" size={13} color={paymentsOk ? '#fff' : t.muted}/>
          </button>
        </div>
      </div>
    </div>
  );
}
