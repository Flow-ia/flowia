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
  // RGPD commit 17 : opt-in marketing du client encaissé.
  // null = inconnu (pas d'email saisi), false = client connu sans opt-in,
  // true = client connu et opté.
  const [clientMarketingOptIn, setClientMarketingOptIn] = useState(null);
  const [clientKnown, setClientKnown] = useState(false);

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
    const display = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
                 || c.name || c.client_name || '';
    setClientName(display);
    setClientEmail(c.email || '');
    setClientSearch(display || c.email || c.phone || '');
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
      setClientMarketingOptIn(null); setClientKnown(false);
      return;
    }
    let cancelled = false;
    referralsApi.getClientRewards(low)
      .then(r => {
        if (cancelled) return;
        setPendingRefs(r.pending || []); setClientRewards(r.rewards || []);
        setClientMarketingOptIn(r.client_marketing_opt_in === true);
        setClientKnown(r.client_known === true);
      })
      .catch(() => {
        setPendingRefs([]); setClientRewards([]);
        setClientMarketingOptIn(null); setClientKnown(false);
      });
    creditsApi.list({ search: low })
      .then(resp => {
        if (cancelled) return;
        // GET /credits renvoie { rows, total, ... } ; back-compat array.
        const list = Array.isArray(resp?.rows) ? resp.rows
                   : (Array.isArray(resp) ? resp : []);
        const match = list.find(c =>
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
  const title = { margin: 0, fontSize: 14, fontWeight: 500, color: t.text };
  // Inputs tablette : padding 11×14, font 14, min-height 44.
  const inp = {
    width: '100%', minHeight: 44, padding: '11px 14px', borderRadius: 10,
    background: t.inputBg, border: `0.5px solid ${t.borderInput}`,
    color: t.text, fontSize: 14, fontFamily: 'inherit',
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
                   placeholder="Nom, téléphone, email…"
                   style={{ ...inp, minHeight: 48, paddingRight: 40 }}/>
            {(clientSearch || clientName || clientEmail) && (
              <button onClick={clearClient}
                      style={{ position:'absolute', right: 8, top: '50%',
                               transform: 'translateY(-50%)',
                               width: 32, height: 32, borderRadius: 99,
                               border: 'none', background: 'transparent',
                               cursor: 'pointer', color: t.muted,
                               display: 'inline-flex', alignItems: 'center',
                               justifyContent: 'center', fontFamily:'inherit' }}
                      aria-label="Effacer">
                <Icon name="x" size={14} color={t.muted}/>
              </button>
            )}
            {suggestsOpen && clientSuggests.length > 0 && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0,
                            zIndex: 10, background: t.card,
                            border: `0.5px solid ${t.border}`, borderRadius: 10,
                            boxShadow: t.shadowSm || '0 4px 16px rgba(0,0,0,0.08)',
                            overflow: 'hidden' }}>
                {clientSuggests.map(c => {
                  // Fallback : back retourne first_name + last_name (commit
                  // 24d) + name concaténé. Anciens consommateurs : on garde
                  // c.name comme dernier secours avant '—'.
                  const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
                                || c.name || c.client_name || '';
                  const display = fullName || '(Sans nom)';
                  return (
                    <button key={c.id}
                            onMouseDown={() => pickClient(c)}
                            style={{ width:'100%', textAlign:'left',
                                     padding:'10px 12px', border:'none',
                                     background: 'transparent', color: t.text,
                                     cursor:'pointer', fontFamily:'inherit',
                                     borderBottom: `0.5px solid ${t.separator}`,
                                     display:'flex', flexDirection:'column', gap:3 }}
                            onMouseEnter={e => { e.currentTarget.style.background = t.cardAlt; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: t.text,
                                     overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {display}
                      </span>
                      <span style={{ fontSize: 11, color: t.muted, display:'flex',
                                     gap: 10, flexWrap:'wrap', alignItems:'center' }}>
                        {c.email && (
                          <span style={{ overflow:'hidden', textOverflow:'ellipsis',
                                         whiteSpace:'nowrap', maxWidth:'60%' }}>
                            {c.email}
                          </span>
                        )}
                        {c.phone && (
                          <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                            {c.phone}
                          </span>
                        )}
                        {!c.email && !c.phone && (
                          <span style={{ fontStyle:'italic' }}>{"Aucun contact enregistré"}</span>
                        )}
                      </span>
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
            <div style={{ padding:11, borderRadius:10,
                          background:'#f0fdf4',
                          borderLeft:'3px solid #10b981',
                          display:'flex', gap:10, alignItems:'center',
                          color:'#065f46' }}>
              <Icon name="wallet" size={16} color="#065f46"/>
              <div style={{ flex:1 }}>
                <p style={{ margin:0, fontSize:13, fontWeight:500 }}>
                  {"Crédit disponible"}
                </p>
                <p style={{ margin:'2px 0 0', fontSize:15, fontWeight:500,
                            fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {fmt(clientCredit.balance) + " €"}
                </p>
                <p style={{ margin:'3px 0 0', fontSize:11, color:'#065f46', opacity:0.75 }}>
                  {"À utiliser via une ligne « Autre » en mode Multi-paiements."}
                </p>
              </div>
            </div>
          )}

          {/* RGPD commit 17 : bandeau ambre si client connu sans opt-in marketing.
              Le tampon fidélité reste cumulé en caisse pour tous les clients ;
              seuls anniversaire et parrainage nécessitent l'opt-in. */}
          {clientKnown && clientMarketingOptIn === false && (
            <div style={{ padding:'8px 11px', borderRadius:9,
                          background:'#fffbeb',
                          borderLeft:'3px solid #f59e0b',
                          fontSize:11, color:'#92400e', lineHeight:1.5 }}>
              {"Programme fidélité actif (boutique uniquement). Anniversaire et parrainage non disponibles : le client n'a pas activé les notifications marketing."}
            </div>
          )}
        </div>

        {/* Réductions disponibles — commit 24c. Cards cliquables, sélection
            unique (no cumul). Click sur card = applique le code promo lié.
            Un 2e click sur la même card désélectionne. Les parrainages
            pending sont affichés en informatif (validation back automatique
            à l'encaissement) et le crédit dans la card client au-dessus. */}
        {(clientRewards.filter(r => r.status === 'available').length > 0 || pendingRefs.length > 0) && (
          <div style={card}>
            <p style={title}>{"Réductions disponibles"}</p>
            <p style={{ margin:0, fontSize:11, color: t.muted, fontStyle:'italic' }}>
              {"Cliquez pour appliquer. Une seule réduction par encaissement."}
            </p>
            {clientRewards.filter(r => r.status === 'available').map(r => {
              const isBday = r.reward_type === 'birthday';
              const accentBg   = isBday ? '#fff7ed' : '#eef2ff';
              const accentText = isBday ? '#9a3412' : '#4338ca';
              const accentBar  = isBday ? '#f97316' : '#4338ca';
              const isSelected = selectedRewardId === r.id;
              return (
                <button key={r.id} type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedRewardId(null);
                            setPromoCode(''); setPromoData(null); setPromoErr('');
                          } else applyReward(r);
                        }}
                        style={{ padding:10, borderRadius:8,
                                 background: accentBg,
                                 borderLeft: '2px solid ' + accentBar,
                                 border: isSelected
                                   ? `0.5px solid ${accentText}`
                                   : `0.5px solid ${accentBg}`,
                                 borderLeftWidth: 2, borderLeftColor: accentBar,
                                 borderLeftStyle: 'solid',
                                 display:'flex', justifyContent:'space-between',
                                 alignItems:'center', gap:8,
                                 cursor:'pointer', fontFamily:'inherit',
                                 textAlign:'left', width:'100%',
                                 boxShadow: isSelected ? `0 0 0 2px ${accentBar}33` : 'none',
                                 transition: 'box-shadow 0.15s ease' }}>
                  <span style={{ display:'flex', gap:8, alignItems:'center', minWidth:0 }}>
                    <Icon name="gift" size={14} color={accentText}/>
                    <span style={{ minWidth:0, display:'flex', flexDirection:'column' }}>
                      <span style={{ fontSize:12, fontWeight:500, color: accentText }}>
                        {isBday ? 'Offre anniversaire' : 'Récompense fidélité'}
                      </span>
                      <span style={{ fontSize:11, color:t.muted,
                                     overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {r.code || 'Code automatique'}
                      </span>
                    </span>
                  </span>
                  <span style={{ fontSize:11, fontWeight:500, color: accentText, flexShrink:0 }}>
                    {isSelected ? 'Appliqué' : 'Appliquer'}
                  </span>
                </button>
              );
            })}
            {pendingRefs.map(ref => {
              const needsOptIn = ref.parrain_opt_in === false || ref.filleul_opt_in === false;
              return (
                <div key={ref.id}
                     style={{ padding:10, borderRadius:8,
                              background:'#eeedfe', borderLeft:'2px solid #8b5cf6',
                              display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
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
                    <p style={{ margin:0, fontSize:11, color: needsOptIn ? '#92400e' : t.muted,
                                flexShrink:0, opacity: needsOptIn ? 0.7 : 1 }}>
                      {needsOptIn ? 'Non validable' : 'À valider à la caisse'}
                    </p>
                  </div>
                  {needsOptIn && (
                    <div style={{ padding:'6px 9px', borderRadius:7,
                                  background:'#fffbeb',
                                  borderLeft:'2px solid #f59e0b',
                                  fontSize:10, color:'#92400e', lineHeight:1.5 }}>
                      {"Parrainage non validable : marketing_opt_in manquant pour "}
                      {ref.parrain_opt_in === false && ref.filleul_opt_in === false ? 'le parrain et le filleul.'
                        : ref.parrain_opt_in === false ? 'le parrain.' : 'le filleul.'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={card}>
          <p style={title}>{"Code promo manuel"}</p>
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
        </div>
      </div>

      {/* ── Colonne droite : Mode de paiement ── */}
      <div style={card}>
        <p style={title}>{"Mode de paiement"}</p>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          <button onClick={() => setSplitMode(false)}
                  style={{ minHeight:42, padding:'10px 14px', borderRadius:8,
                           border:`0.5px solid ${!splitMode ? t.text : t.border}`,
                           background: !splitMode ? t.cardAlt : t.card,
                           color: t.text, cursor:'pointer', fontFamily:'inherit',
                           fontSize:13, fontWeight:500 }}>
            {"Simple"}
          </button>
          <button onClick={() => setSplitMode(true)}
                  style={{ minHeight:42, padding:'10px 14px', borderRadius:8,
                           border:`0.5px solid ${splitMode ? t.text : t.border}`,
                           background: splitMode ? t.cardAlt : t.card,
                           color: t.text, cursor:'pointer', fontFamily:'inherit',
                           fontSize:13, fontWeight:500 }}>
            {"Multi-paiements"}
          </button>
        </div>

        {!splitMode ? (
          <div style={{ display:'grid',
                        gridTemplateColumns:'repeat(2, 1fr)',
                        gap: 8 }}>
            {Object.entries(PM_CFG).map(([id, cfg]) => {
              const active = payMethod === id;
              return (
                <button key={id} onClick={() => setPayMethod(id)}
                        style={{ position:'relative',
                                 minHeight:74, padding:'12px 10px', borderRadius:10,
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
                                 alignItems:'center', justifyContent:'center', gap:6,
                                 transition: 'opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease' }}>
                  {active && (
                    <span style={{ position:'absolute', top:6, right:6,
                                   display:'inline-flex' }}>
                      <Icon name="checkCircle" size={16} color={cfg.text} strokeWidth={2}/>
                    </span>
                  )}
                  <Icon name={cfg.icon} size={22}
                        color={active ? cfg.text : '#9ca3af'}/>
                  <span style={{ fontSize:13, fontWeight:500,
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
                            alignItems:'center', gap:10 }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:8,
                               fontSize:13, fontWeight:500, color: cfg.text }}>
                  <Icon name={cfg.icon} size={16} color={cfg.text}/>
                  {cfg.label}
                </span>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input type="number" step="0.01" min="0"
                         value={splitAmts[id] || ''}
                         onChange={e => setSplitAmts({ ...splitAmts, [id]: e.target.value })}
                         placeholder="0"
                         style={{ width:96, minHeight:40, padding:'8px 10px',
                                  borderRadius:8,
                                  border:`0.5px solid ${t.borderInput}`,
                                  background:t.inputBg, color: cfg.text,
                                  fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                                  fontSize:14, fontWeight:500,
                                  textAlign:'right', outline:'none', boxSizing:'border-box' }}/>
                  <span style={{ fontSize:13, fontWeight:500, color: cfg.text }}>{"€"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Récap total / remise / écart. */}
        <div style={{ marginTop:4, padding:12, borderRadius:8, background: t.cardAlt,
                      display:'flex', flexDirection:'column', gap:4, fontSize:12 }}>
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
                  style={{ ...inp, minHeight: 56, padding: 12, resize:'vertical' }}/>

        {/* Bandeau « Total à encaisser » sticky en bas — visible d'un coup d'œil
            même quand le formulaire est long. */}
        <div style={{ marginTop:4, padding:'12px 18px', borderRadius:10,
                      background:'#111827', color:'#fff',
                      display:'flex', justifyContent:'space-between',
                      alignItems:'center', gap:10,
                      position:'sticky', bottom:0, zIndex:5 }}>
          <span style={{ fontSize:13, fontWeight:500, color:'rgba(255,255,255,0.8)' }}>
            {"Total à encaisser"}
          </span>
          <span style={{ fontSize:22, fontWeight:500,
                         fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {fmt(finalTotal) + " €"}
          </span>
        </div>

        <div style={{ display:'flex', gap:8, alignItems:'stretch' }}>
          <button onClick={onBack}
                  style={{ minHeight:46, padding:'11px 16px', borderRadius:8,
                           border:`0.5px solid ${t.border}`,
                           background:t.cardAlt, color:t.text,
                           cursor:'pointer', fontFamily:'inherit',
                           fontSize:13, fontWeight:500,
                           display:'inline-flex', alignItems:'center', gap:6,
                           flexShrink:0 }}>
            <Icon name="chevronLeft" size={14} color={t.text}/>
            {"Retour"}
          </button>
          <button onClick={onContinue} disabled={!paymentsOk}
                  style={{ flex:1, minHeight:50, padding:'14px 20px',
                           borderRadius:8, border:'none',
                           background: paymentsOk ? '#10b981' : t.cardAlt,
                           color: paymentsOk ? '#fff' : t.muted,
                           cursor: paymentsOk ? 'pointer' : 'not-allowed',
                           fontFamily:'inherit', fontSize:15, fontWeight:500,
                           display:'inline-flex', alignItems:'center',
                           justifyContent:'center', gap:6 }}>
            {"Continuer"}
            <Icon name="chevronRight" size={15} color={paymentsOk ? '#fff' : t.muted}/>
          </button>
        </div>
      </div>
    </div>
  );
}
