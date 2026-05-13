// Caisse > Encaisser > Step 3 · Paiement.
// Simple OU multi-paiements (validation somme = total à l'euro près).
// Code promo/parrainage check live (promoApi.check). Crédit client
// disponible affiché si email saisi. Cartes réductions anniversaire/
// parrainage via referralsApi.getClientRewards (pendingRefs + rewards).
// Respect §15 INVENTAIRE : couleurs pastel moyens paiement + Multi.
import { useEffect, useRef, useState } from 'react';
import { promoApi, referralsApi, creditsApi, clientsApi } from '../../../utils/api';
import { Icon } from '../../../components/Icon';
import { Confirm } from '../../../components/UI';

// Commit B — méthodes valides en breakdown (whitelist alignée backend
// BREAKDOWN_METHODS). card_online JAMAIS proposé : réservé aux paiements
// Stripe en ligne via /book. 'check' et 'multi' interdits aussi.
const PM_CFG = {
  cash:      { label: 'Espèces',     text: '#065f46', bg: '#f0fdf4', icon: 'wallet'     },
  transfer:  { label: 'Virement',    text: '#0e7490', bg: '#ecfeff', icon: 'send'       },
  card:      { label: 'CB physique', text: '#4338ca', bg: '#eef2ff', icon: 'creditCard' },
  gift_card: { label: 'Bon cadeau',  text: '#9a3412', bg: '#fff7ed', icon: 'gift'       },
  other:     { label: 'Autre',       text: '#92400e', bg: '#fffbeb', icon: 'more'       },
};

// Mode simple : on garde la palette historique (cash/card/transfer/other).
// gift_card n'apparaît qu'en mode multi (utilisation partielle d'un bon).
const PM_CFG_SIMPLE = {
  cash:     PM_CFG.cash,
  card:     PM_CFG.card,
  transfer: PM_CFG.transfer,
  other:    PM_CFG.other,
};

// Ordre d'ajout pour le bouton "+ Ajouter une méthode" : on prend la
// première méthode encore non utilisée dans l'ordre card → cash →
// transfer → gift_card → other. card et cash sont déjà pré-remplis donc
// l'ajout pioche d'abord transfer.
const ADD_PRIORITY = ['card', 'cash', 'transfer', 'gift_card', 'other'];
const MAX_BREAKDOWN_LINES = 4;

function fmt(n) { return Number(n || 0).toFixed(2); }

export default function Step3Paiement({
  theme: t, cart,
  payMethod, setPayMethod,
  splitMode, setSplitMode,
  breakdownLines, setBreakdownLines,
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
  // Confirm modal lorsque l'employé bascule ON→OFF avec des montants saisis.
  const [confirmDropBreakdown, setConfirmDropBreakdown] = useState(false);
  // Note interne masquée par défaut, affichée à la demande. Si une note
  // existe déjà (retour depuis Step4 par exemple), on l'expose d'office.
  const [showNote, setShowNote] = useState(() => !!clientNote);
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

  // Multi-paiements : somme = finalTotal à 0.01 € près. En mode multi on
  // exige >= 2 lignes avec amount > 0 (sinon = paiement simple, l'employé
  // doit décocher le toggle).
  const breakdownActive = splitMode
    ? breakdownLines
        .map(l => ({ method: l.method, amount: parseFloat(String(l.amount).replace(',', '.')) || 0 }))
        .filter(p => p.amount > 0)
    : [];
  const paymentsEntries = splitMode
    ? breakdownActive
    : [{ method: payMethod, amount: finalTotal }];
  const paymentsSum  = paymentsEntries.reduce((s, p) => s + p.amount, 0);
  const paymentsDiff = finalTotal - paymentsSum;
  const sumMatches   = Math.abs(paymentsDiff) < 0.01;
  const paymentsOk   = !splitMode
    ? true
    : (sumMatches && breakdownActive.length >= 2);

  // Helpers gestion des lignes de breakdown.
  const updateLineMethod = (idx, newMethod) => {
    setBreakdownLines(prev => prev.map((l, i) => i === idx ? { ...l, method: newMethod } : l));
  };
  const updateLineAmount = (idx, raw) => {
    // Accepte virgule FR. On stocke la chaîne brute pour permettre la saisie
    // intermédiaire ("12,") ; le parse en nombre se fait à l'affichage et
    // à la soumission.
    const cleaned = String(raw).replace(/[^0-9.,]/g, '');
    setBreakdownLines(prev => prev.map((l, i) => i === idx ? { ...l, amount: cleaned } : l));
  };
  const removeLine = (idx) => {
    if (idx < 2) return; // les 2 premières lignes ne sont pas supprimables
    setBreakdownLines(prev => prev.filter((_, i) => i !== idx));
  };
  const addLine = () => {
    setBreakdownLines(prev => {
      if (prev.length >= MAX_BREAKDOWN_LINES) return prev;
      const used = new Set(prev.map(l => l.method));
      const next = ADD_PRIORITY.find(m => !used.has(m)) || 'other';
      return [...prev, { method: next, amount: '' }];
    });
  };
  // Toggle Simple/Multi : si on revient en simple alors qu'au moins une
  // ligne a un montant, on demande confirmation avant d'écraser.
  const requestSimpleMode = () => {
    const hasAmount = breakdownLines.some(l => (parseFloat(String(l.amount).replace(',', '.')) || 0) > 0);
    if (hasAmount) { setConfirmDropBreakdown(true); return; }
    setSplitMode(false);
  };
  const dropBreakdownAndGoSimple = () => {
    setBreakdownLines([
      { method: 'card', amount: '' },
      { method: 'cash', amount: '' },
    ]);
    setSplitMode(false);
  };

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

        {/* Réductions disponibles — affichées sous « Code promo manuel » dès
            qu'un client est identifié (par email). Cards cliquables, sélection
            unique (non-cumul). Click = applique le code promo lié ; 2e click
            désélectionne. Les parrainages pending sont en informatif
            (validation back auto à l'encaissement) ; le crédit est dans la
            card client au-dessus. La réduction sélectionnée est désactivée
            instantanément à la validation : POST /transactions marque
            client_rewards 'used' (atomique via client_reward_id) et le
            frontend confirme avec referralsApi.useReward (idempotent). */}
        {clientKnown && (
          <div style={card}>
            <p style={title}>{"Réductions disponibles pour ce client"}</p>
            {clientRewards.filter(r => r.status === 'available').length === 0
              && pendingRefs.length === 0 ? (
              <p style={{ margin:0, fontSize:11, color: t.muted, fontStyle:'italic' }}>
                {"Aucune réduction valide pour ce client."}
              </p>
            ) : (
              <p style={{ margin:0, fontSize:11, color: t.muted, fontStyle:'italic' }}>
                {"Cliquez pour appliquer. Une seule réduction par encaissement."}
              </p>
            )}
            {clientRewards.filter(r => r.status === 'available').map(r => {
              // Source : 'birthday' (anniv), 'loyalty' (fidélité, code FIDEL-XXXXX),
              // 'referral_parrain' (parrain qui a parrainé un nouveau client),
              // 'referral_filleul' (filleul ayant utilisé un code de parrainage),
              // autre type éventuel (push manuel commerçant).
              const rt = r.reward_type || 'loyalty';
              const isBday   = rt === 'birthday';
              const isRef    = rt === 'referral_parrain' || rt === 'referral_filleul';
              const palette = isBday
                ? { bg:'#fff7ed', text:'#9a3412', bar:'#f97316' }
                : isRef
                  ? { bg:'#eeedfe', text:'#3c3489', bar:'#8b5cf6' }
                  : { bg:'#eef2ff', text:'#4338ca', bar:'#4338ca' }; // loyalty / défaut
              const sourceLabel = isBday   ? 'Anniversaire'
                                : isRef    ? 'Parrainage'
                                : rt === 'loyalty' ? 'Fidélité'
                                : 'Promotion';
              // Valeur de la réduction : pourcentage ou montant fixe.
              const valNum = parseFloat(r.value);
              const valLabel = Number.isFinite(valNum) && valNum > 0
                ? (r.type === 'percent' || r.type === 'percentage'
                    ? `−${valNum}%`
                    : `−${fmt(valNum)} €`)
                : '';
              // Date d'expiration (utile pour informer l'employé).
              const exp = r.expires_at ? new Date(r.expires_at) : null;
              const expLabel = exp && !isNaN(exp.getTime())
                ? exp.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })
                : null;
              // Clé unique : id (client_rewards) ou promo_id (orphelin via UNION).
              const key = r.id || ('p:' + r.promo_id);
              // applyReward consulte r.id (selectedRewardId) — on injecte
              // l'identifiant utilisable pour la désactivation backend.
              const sel = r.id || null;
              const isSelected = !!sel && selectedRewardId === sel;
              return (
                <button key={key} type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedRewardId(null);
                            setPromoCode(''); setPromoData(null); setPromoErr('');
                          } else applyReward({ ...r, id: sel });
                        }}
                        style={{ padding:10, borderRadius:8,
                                 background: palette.bg,
                                 borderLeft: '2px solid ' + palette.bar,
                                 border: isSelected
                                   ? `0.5px solid ${palette.text}`
                                   : `0.5px solid ${palette.bg}`,
                                 borderLeftWidth: 2, borderLeftColor: palette.bar,
                                 borderLeftStyle: 'solid',
                                 display:'flex', justifyContent:'space-between',
                                 alignItems:'center', gap:8,
                                 cursor:'pointer', fontFamily:'inherit',
                                 textAlign:'left', width:'100%',
                                 boxShadow: isSelected ? `0 0 0 2px ${palette.bar}33` : 'none',
                                 transition: 'box-shadow 0.15s ease' }}>
                  <span style={{ display:'flex', gap:8, alignItems:'center', minWidth:0, flex:1 }}>
                    <Icon name="gift" size={14} color={palette.text}/>
                    <span style={{ minWidth:0, display:'flex', flexDirection:'column', gap:2 }}>
                      <span style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                        <span style={{ fontSize:10, fontWeight:500,
                                       padding:'1px 6px', borderRadius:99,
                                       background:'rgba(255,255,255,0.6)',
                                       color: palette.text,
                                       textTransform:'uppercase',
                                       letterSpacing:'0.04em' }}>
                          {sourceLabel}
                        </span>
                        {valLabel && (
                          <span style={{ fontSize:12, fontWeight:500, color: palette.text,
                                         fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                            {valLabel}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize:11, color: palette.text, opacity:0.85,
                                     fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                                     overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {r.code || 'Code automatique'}
                      </span>
                      {expLabel && (
                        <span style={{ fontSize:10, color:t.muted }}>
                          {"Expire le " + expLabel}
                        </span>
                      )}
                    </span>
                  </span>
                  <span style={{ fontSize:11, fontWeight:500, color: palette.text, flexShrink:0 }}>
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
      </div>

      {/* ── Colonne droite : Mode de paiement ── */}
      <div style={card}>
        <p style={title}>{"Mode de paiement"}</p>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          <button onClick={requestSimpleMode}
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
            {"Paiement en plusieurs méthodes"}
          </button>
        </div>

        {!splitMode ? (
          <div style={{ display:'grid',
                        gridTemplateColumns:'repeat(2, 1fr)',
                        gap: 8 }}>
            {Object.entries(PM_CFG_SIMPLE).map(([id, cfg]) => {
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
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {/* Bandeau total à atteindre — visible en haut du breakdown. */}
            <div style={{ padding:'10px 12px', borderRadius:8,
                          background: t.cardAlt,
                          border: `0.5px solid ${t.border}`,
                          display:'flex', justifyContent:'space-between',
                          alignItems:'center' }}>
              <span style={{ fontSize:12, color: t.muted, fontWeight:500 }}>
                {"Total à encaisser"}
              </span>
              <span style={{ fontSize:16, fontWeight:500, color: t.text,
                             fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {fmt(finalTotal) + " €"}
              </span>
            </div>

            {breakdownLines.map((line, idx) => {
              const cfg = PM_CFG[line.method] || PM_CFG.other;
              const usedElsewhere = new Set(
                breakdownLines.filter((_, i) => i !== idx).map(l => l.method)
              );
              const removable = idx >= 2;
              return (
                <div key={idx}
                     style={{ padding:10, borderRadius:8,
                              background: cfg.bg, borderLeft: '2px solid ' + cfg.text,
                              display:'flex', alignItems:'center', gap:8,
                              transition: 'background 0.15s ease' }}
                     onMouseEnter={e => { e.currentTarget.style.background = '#F8F9FA'; }}
                     onMouseLeave={e => { e.currentTarget.style.background = cfg.bg; }}>
                  <Icon name={cfg.icon} size={16} color={cfg.text}/>
                  <select value={line.method}
                          onChange={e => updateLineMethod(idx, e.target.value)}
                          style={{ flex:1, minHeight:40, padding:'8px 10px',
                                   borderRadius:8,
                                   border:`0.5px solid ${t.borderInput}`,
                                   background: t.inputBg, color: cfg.text,
                                   fontFamily: 'inherit', fontSize:13, fontWeight:500,
                                   outline:'none', cursor:'pointer',
                                   boxSizing:'border-box' }}>
                    {Object.entries(PM_CFG).map(([id, c]) => (
                      <option key={id} value={id}
                              disabled={id !== line.method && usedElsewhere.has(id)}>
                        {c.label + (id !== line.method && usedElsewhere.has(id) ? "  (déjà utilisé)" : "")}
                      </option>
                    ))}
                  </select>
                  <input type="text" inputMode="decimal"
                         value={line.amount}
                         onChange={e => updateLineAmount(idx, e.target.value)}
                         placeholder="0,00"
                         style={{ width:96, minHeight:40, padding:'8px 10px',
                                  borderRadius:8,
                                  border:`0.5px solid ${t.borderInput}`,
                                  background:t.inputBg, color: cfg.text,
                                  fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                                  fontSize:14, fontWeight:500,
                                  textAlign:'right', outline:'none', boxSizing:'border-box' }}/>
                  <span style={{ fontSize:13, fontWeight:500, color: cfg.text }}>{"€"}</span>
                  {removable ? (
                    <button onClick={() => removeLine(idx)}
                            aria-label="Supprimer cette méthode"
                            style={{ width:32, height:32, borderRadius:6,
                                     border:'none', background:'transparent',
                                     cursor:'pointer', color: cfg.text,
                                     display:'inline-flex', alignItems:'center',
                                     justifyContent:'center', fontFamily:'inherit',
                                     flexShrink:0 }}>
                      <Icon name="x" size={14} color={cfg.text}/>
                    </button>
                  ) : (
                    // Spacer pour aligner les lignes non supprimables.
                    <span style={{ width:32, flexShrink:0 }}/>
                  )}
                </div>
              );
            })}

            {breakdownLines.length < MAX_BREAKDOWN_LINES && (
              <button onClick={addLine}
                      style={{ minHeight:38, padding:'8px 12px', borderRadius:8,
                               border: `0.5px dashed ${t.border}`,
                               background: 'transparent', color: t.muted,
                               cursor:'pointer', fontFamily:'inherit',
                               fontSize:12, fontWeight:500,
                               display:'inline-flex', alignItems:'center',
                               justifyContent:'center', gap:6 }}>
                <Icon name="plus" size={13} color={t.muted}/>
                {"Ajouter une méthode"}
              </button>
            )}
          </div>
        )}

        {/* Récap remise / écart — masqué si rien à afficher (pas de remise
            et pas de mode multi). Le « Total panier » a été retiré car
            redondant avec le bandeau « Total à encaisser » en bas. */}
        {(discount > 0 || splitMode) && (
          <div style={{ marginTop:4, padding:12, borderRadius:8, background: t.cardAlt,
                        display:'flex', flexDirection:'column', gap:4, fontSize:12 }}>
            {discount > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', color:'#9a3412' }}>
                <span>{"Remise"}</span>
                <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{"−" + fmt(discount)} €</span>
              </div>
            )}
            {splitMode && (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', color: t.muted }}>
                  <span>{"Somme actuelle"}</span>
                  <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{fmt(paymentsSum)} €</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between',
                              color: sumMatches ? '#1D9E75' : '#F59E0B' }}>
                  <strong style={{ fontWeight:500 }}>{"Restant à répartir"}</strong>
                  <strong style={{ fontWeight:500, fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {fmt(Math.abs(paymentsDiff))} €
                  </strong>
                </div>
                {splitMode && sumMatches && breakdownActive.length < 2 && (
                  <p style={{ margin:'2px 0 0', fontSize:11, color:'#F59E0B', fontWeight:500 }}>
                    {"Au moins 2 méthodes avec un montant > 0 sont requises."}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Note interne — masquée par défaut, l'employé la révèle via le
            bouton « Ajouter une note ». Évite un champ visuel en plus quand
            il n'y a rien à écrire (cas majoritaire). */}
        {showNote ? (
          <textarea placeholder="Note interne (optionnel)"
                    value={clientNote}
                    onChange={e => setClientNote(e.target.value)}
                    rows={2}
                    autoFocus
                    style={{ ...inp, minHeight: 56, padding: 12, resize:'vertical' }}/>
        ) : (
          <button onClick={() => setShowNote(true)}
                  style={{ alignSelf:'flex-start', minHeight:32,
                           padding:'6px 10px', borderRadius:8,
                           border:'none', background:'transparent',
                           color: t.muted, cursor:'pointer',
                           fontFamily:'inherit', fontSize:12, fontWeight:500,
                           display:'inline-flex', alignItems:'center', gap:6 }}>
            <Icon name="plus" size={12} color={t.muted}/>
            {"Ajouter une note interne"}
          </button>
        )}

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
      <Confirm open={confirmDropBreakdown}
               theme={t}
               onClose={() => setConfirmDropBreakdown(false)}
               onConfirm={dropBreakdownAndGoSimple}
               title="Abandonner les méthodes saisies ?"
               message="Vous avez déjà saisi des montants dans le multi-paiement. Repasser en mode simple les effacera."
               danger/>
    </div>
  );
}
