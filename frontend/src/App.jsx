// src/App.jsx — Racine routing + layout + EncaisserSheet. Refonte visuelle 2026.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useAdmin } from './hooks/useAdmin';
import { useTheme } from './hooks/useTheme';
import { useNotifications, playSound } from './hooks/useNotifications';
import { PinEntry, PinSetup } from './components/PinGate';
import AuthFlow, { MerchantOnboarding } from './components/AuthFlow';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import { api, loyaltyApi, promoApi, notifApi, referralsApi } from './utils/api';
import EmployeeAgenda from './pages/EmployeeAgenda';
import ClientsPage from './pages/ClientsPage';
import Agenda from './pages/Agenda';
import { I, ICON_MAP } from './utils/icons';
import { todayStr, nowStr } from './utils/dates';
import { useEmployeePinGate } from './components/EmployeePinModal';
import { Button } from './components/primitives';

// Palette paiements — pastels sobres (unifie avec Dashboard/Forms/Transactions)
const PM_CFG = {
  cash:     { label:'Especes',  color:'#065f46', bg:'#f0fdf4', Ic:I.Wallet     },
  card:     { label:'Carte',    color:'#4338ca', bg:'#eef2ff', Ic:I.CreditCard },
  transfer: { label:'Virement', color:'#0e7490', bg:'#ecfeff', Ic:I.Bank       },
  other:    { label:'Autre',    color:'#92400e', bg:'#fffbeb', Ic:I.MoreH      },
};
const fmtN = n => Number(n || 0).toFixed(2);

// ── FreePriceModal ──────────────────────────────────────────────────────────
function FreePriceModal({ catName, isCustom, theme: t, onCancel, onConfirm }) {
  const [amount, setAmount] = useState('');
  const [name,   setName]   = useState(catName || '');
  const [err,    setErr]    = useState('');
  const inputRef = React.useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

  const confirm = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { setErr('Entrez un montant valide.'); return; }
    onConfirm(isCustom ? (name.trim() || 'Autre') : catName, val);
  };

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:14, fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex',
                  alignItems:'center', justifyContent:'center', padding:20,
                  background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
         onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ width:'100%', maxWidth:360, borderRadius:16, padding:24,
                    background:t.elevated,
                    border:`0.5px solid ${t.border}`,
                    boxShadow:t.shadowModal }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
          <div style={{ width:36, height:36, borderRadius:8,
                        background:'#fffbeb',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        flexShrink:0 }}>
            <I.Edit style={{ width:16, height:16, color:'#92400e' }}/>
          </div>
          <div>
            <p style={{ fontWeight:500, fontSize:15, color:t.text, margin:0 }}>
              {isCustom ? 'Montant libre' : catName}
            </p>
            <p style={{ fontSize:11, color:t.muted, margin:0 }}>
              {isCustom ? 'Saisie libre - aucun produit associe' : 'Produit a prix libre'}
            </p>
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {isCustom && (
            <div>
              <p style={{ fontSize:12, color:t.muted, marginBottom:6 }}>Libelle *</p>
              <input value={name}
                     onChange={e => { setName(e.target.value); setErr(''); }}
                     placeholder="Ex : Produit hors liste, Pourboire…"
                     style={inp}/>
            </div>
          )}

          <div>
            <p style={{ fontSize:12, color:t.muted, marginBottom:6 }}>Montant *</p>
            <div style={{ position:'relative' }}>
              <input ref={inputRef} type="number" step="0.01" min="0.01"
                     value={amount}
                     onChange={e => { setAmount(e.target.value); setErr(''); }}
                     onKeyDown={e => e.key === 'Enter' && confirm()}
                     placeholder="0.00"
                     style={{ ...inp, paddingRight:32, fontSize:20, fontWeight:500,
                              fontFamily:'monospace', textAlign:'right', color:'#92400e' }}/>
              <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                             fontSize:14, color:'#92400e', pointerEvents:'none' }}>€</span>
            </div>
          </div>

          {err && <p style={{ fontSize:12, color:'#991b1b', margin:0 }}>{err}</p>}

          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <Button variant="secondary" type="button" onClick={onCancel} style={{ flex:1 }}>
              Annuler
            </Button>
            <Button variant="primary" type="button" onClick={confirm} style={{ flex:2 }}>
              Ajouter au panier
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EncaisserSheet ──────────────────────────────────────────────────────────
function EncaisserSheet({ open, onClose, employees, categories, onAdd, theme: t, soundCfg: sc = {} }) {
  const [cart, setCart]       = useState([]);
  const [step, setStep]       = useState('products');
  const [empId, setEmpId]     = useState('');
  const [payMethod, setPay]   = useState('cash');
  const [splitMode, setSplitMode] = useState(false);
  const [splitAmts, setSplitAmts] = useState({ cash:'', card:'', transfer:'', other:'' });
  const [date, setDate]       = useState(todayStr());
  const [time, setTime]       = useState(nowStr());
  const [dtOpen, setDtOpen]   = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoData, setPromoData] = useState(null);
  const [promoErr,  setPromoErr]  = useState('');
  const [promoLoad, setPromoLoad] = useState(false);
  const [clientNote,  setClientNote]  = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientName,  setClientName]  = useState('');
  const [clientSearch,   setClientSearch]   = useState('');
  const [clientSuggests, setClientSuggests] = useState([]);
  const [clientSearchBusy, setClientSearchBusy] = useState(false);
  const [busy, setBusy]           = useState(false);
  const [editPrice, setEditPrice] = useState(null);
  const [openCat,   setOpenCat]   = useState(null);
  const [pendingRefs,    setPendingRefs]    = useState([]);
  const [clientRewards,  setClientRewards]  = useState([]);
  const [selectedRewardId, setSelectedRewardId] = useState(null);
  const [refValidating,    setRefValidating]    = useState(null);
  const { requestPin, PinModalNode } = useEmployeePinGate();

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setCart([]); setStep('products'); setEmpId(''); setPay('cash');
        setSplitMode(false); setSplitAmts({ cash:'', card:'', transfer:'', other:'' });
        setPromoCode(''); setPromoData(null); setPromoErr('');
        setClientNote(''); setClientEmail(''); setClientName('');
        setClientSearch(''); setClientSuggests([]);
        setDate(todayStr()); setTime(nowStr());
        setDtOpen(false); setEditPrice(null); setOpenCat(null);
        setPendingRefs([]); setClientRewards([]); setSelectedRewardId(null); setRefValidating(null);
      }, 300);
    }
  }, [open]);

  const refreshClientContext = async (email) => {
    const low = (email || '').trim().toLowerCase();
    if (!low) { setPendingRefs([]); setClientRewards([]); return; }
    try {
      const r = await referralsApi.getClientRewards(low);
      setPendingRefs(r.pending || []);
      setClientRewards(r.rewards || []);
    } catch (e) {
      setPendingRefs([]); setClientRewards([]);
    }
  };
  useEffect(() => {
    if (!open) return;
    if (clientEmail) refreshClientContext(clientEmail);
    else { setPendingRefs([]); setClientRewards([]); setSelectedRewardId(null); }
  }, [clientEmail, open]);

  const applyReward = (reward) => {
    setSelectedRewardId(reward.id);
    setPromoCode(reward.code || '');
    setTimeout(() => { checkPromoWith(reward.code); }, 0);
  };

  const checkPromoWith = async (code) => {
    if (!code) return;
    setPromoLoad(true); setPromoErr('');
    try {
      const res = await promoApi.check({ code, amount: total, client_email: clientEmail.trim() || undefined });
      if (res.valid) { setPromoData(res); setPromoErr(''); }
      else { setPromoData(null); setPromoErr(res.error || 'Code invalide'); setSelectedRewardId(null); }
    } catch (e) { setPromoErr(e.message || 'Impossible de verifier le code'); setSelectedRewardId(null); }
    finally { setPromoLoad(false); }
  };

  const validateReferral = async (useId) => {
    setRefValidating(useId);
    try {
      await referralsApi.validateUse(useId);
      await refreshClientContext(clientEmail);
    } catch (e) { alert(e.message || 'Erreur validation parrainage'); }
    finally { setRefValidating(null); }
  };

  const cancelReferral = async (useId) => {
    if (!window.confirm('Refuser ce parrainage ? Le parrain ne sera pas recompense. La reduction deja appliquee au RDV reste acquise au filleul.')) return;
    setRefValidating(useId);
    try {
      await referralsApi.cancelUse(useId);
      await refreshClientContext(clientEmail);
    } catch (e) { alert(e.message || 'Erreur refus parrainage'); }
    finally { setRefValidating(null); }
  };

  const revCats   = categories.filter(c => c.type === 'revenue');
  const catGroups = revCats.filter(c => !c.parent_id);
  const products  = revCats.filter(c => c.parent_id);
  const hasHierarchy = catGroups.length > 0 && products.length > 0;

  const groups = useMemo(() => {
    if (!hasHierarchy) return [{ parent: null, items: revCats }];
    const g = catGroups.map(cat => ({
      parent: cat,
      items: products.filter(p => p.parent_id === cat.id),
    }));
    const solo = revCats.filter(c => !c.parent_id && !products.find(p => p.parent_id === c.id));
    if (solo.length > 0) g.push({ parent: null, items: solo });
    return g.filter(grp => grp.items.length > 0 || grp.parent);
  }, [categories]);

  const total      = cart.reduce((s, it) => s + it.price * it.qty, 0);
  const discount   = promoData?.discount || 0;
  const finalTotal = Math.max(0, total - discount);

  const checkPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoad(true); setPromoErr('');
    try {
      const codeUp = promoCode.trim().toUpperCase();
      const res = await promoApi.check({ code: codeUp, amount: total, client_email: clientEmail.trim() || undefined });
      if (res.valid) { setPromoData({ ...res, source:'promo' }); setPromoErr(''); return; }
      if (!clientEmail.trim()) {
        setPromoData(null);
        setPromoErr("Pour un code parrainage, renseignez d'abord l'email du client.");
        return;
      }
      try {
        const ref = await referralsApi.checkCode({
          code: codeUp, filleul_email: clientEmail.trim(), amount: total,
        });
        if (ref?.valid) {
          setPromoData({
            source:   'referral',
            discount: ref.discount,
            promo:    { type: ref.discount_type, value: ref.discount_value },
          });
          setPromoErr('');
          return;
        }
        if (ref?.reason && ref.reason !== 'code_not_found') {
          setPromoData(null);
          setPromoErr(ref.reason === 'program_disabled'
            ? 'Programme parrainage desactive.'
            : 'Ce client ne peut pas beneficier de ce parrainage (conditions non remplies).');
          return;
        }
      } catch { /* silencieux */ }
      setPromoData(null); setPromoErr(res.error || 'Code invalide');
    } catch (e) { setPromoErr(e.message || 'Impossible de verifier le code'); }
    finally { setPromoLoad(false); }
  };

  const [freePriceModal, setFreePriceModal] = useState(null);

  const addToCart = (cat) => {
    if (cat.is_free_price) { setFreePriceModal({ cat }); return; }
    const price = parseFloat(cat.price) || 0;
    setCart(prev => {
      const idx = prev.findIndex(i => i.category_id === cat.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 }; return next; }
      return [...prev, { category_id:cat.id, name:cat.name, price, qty:1, icon:cat.icon, color:cat.color, is_free_price:true }];
    });
  };
  const removeFromCart = idx => setCart(prev => prev.filter((_, i) => i !== idx));
  const changeQty = (idx, delta) => setCart(prev => {
    const next = [...prev]; const nq = next[idx].qty + delta;
    if (nq <= 0) return prev.filter((_, i) => i !== idx);
    next[idx] = { ...next[idx], qty:nq }; return next;
  });
  const setPriceForItem = (idx, val) => setCart(prev => {
    const next = [...prev]; next[idx] = { ...next[idx], price: parseFloat(val) || 0 }; return next;
  });

  const buildPayments = () => {
    if (!splitMode) return [{ method: payMethod, amount: finalTotal }];
    const entries = Object.entries(splitAmts)
      .map(([method, raw]) => ({ method, amount: parseFloat(raw) || 0 }))
      .filter(p => p.amount > 0);
    return entries;
  };
  const paymentsPreview = buildPayments();
  const paymentsSum     = paymentsPreview.reduce((s, p) => s + p.amount, 0);
  const paymentsValid   = !splitMode || Math.abs(paymentsSum - finalTotal) < 0.01;

  const doConfirm = async () => {
    if (cart.length === 0 || busy) return;
    if (!paymentsValid) return;
    setBusy(true);
    const idemKey = (crypto?.randomUUID?.() || (Date.now() + '-' + Math.random().toString(36).slice(2)));
    try {
      const desc = cart.length === 1
        ? cart[0].name
        : cart.map(i => i.name).join(', ');
      const items = cart.map(i => ({
        service_name: i.name,
        qty: i.qty,
        unit_price: parseFloat((i.price).toFixed(2)),
      }));
      const payments = paymentsPreview;
      const primaryMethod = payments.length === 1 ? payments[0].method : payMethod;
      await onAdd({
        type:'revenue', amount:finalTotal,
        category_id: cart.length === 1 ? cart[0].category_id : null,
        employee_id: empId || null,
        payment_method: primaryMethod,
        payments, items,
        description: desc,
        date, time,
        datetime_iso: new Date(`${date}T${time}`).toISOString(),
        promo_code_id:   promoData?.source === 'referral' ? null : (promoData?.promo?.id || null),
        referral_code:   promoData?.source === 'referral' ? promoCode.trim().toUpperCase() : undefined,
        discount_amount: discount || 0,
        original_amount: total,
        client_note:  clientNote.trim()  || null,
        client_email: clientEmail.trim() || null,
        client_name:  clientName.trim()  || null,
        idempotency_key: idemKey,
      });
      if (selectedRewardId) {
        try { await referralsApi.useReward(selectedRewardId); } catch {/* non-bloquant */}
      }
      setStep('ok');
      if (sc.caisse !== false) playSound('caisse', sc.repeat || 2);
      setTimeout(() => { onClose(); setBusy(false); }, 2000);
    } catch (err) { console.error(err); setBusy(false); }
  };

  const confirm = async () => {
    if (cart.length === 0 || busy) return;
    const emp = employees?.find(e => e.id === empId) || null;
    await requestPin(emp, 'Encaisser le paiement', doConfirm);
  };

  if (!open) return null;

  const inpStyle = {
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, borderRadius:8, padding:'10px 12px', width:'100%',
    fontSize:14, fontFamily:'inherit', outline:'none',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
    boxSizing:'border-box',
  };

  // Accent cart (info indigo)
  const CART_BG     = '#eef2ff';
  const CART_COLOR  = '#4338ca';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200,
                  display:'flex', alignItems:'flex-end', justifyContent:'center' }}
         className="sm:items-center sm:p-4">
      <div onClick={onClose}
           style={{ position:'absolute', inset:0,
                    background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}/>
      <div className="anim-scaleIn"
           style={{ position:'relative', width:'100%', maxWidth:520, maxHeight:'95vh',
                    display:'flex', flexDirection:'column',
                    borderRadius:'16px 16px 0 0',
                    background:t.elevated,
                    border:`0.5px solid ${t.border}`,
                    boxShadow:t.shadowModal }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'14px 18px', flexShrink:0,
                      borderBottom:`0.5px solid ${t.separator}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:34, height:34, borderRadius:8,
                          background:'#fffbeb',
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
              <I.Zap style={{ width:16, height:16, color:'#92400e' }}/>
            </div>
            <div>
              <p style={{ fontWeight:500, fontSize:15, color:t.text, margin:0 }}>Encaisser</p>
              <p style={{ fontSize:12, color:t.muted, margin:0 }}>Saisie rapide</p>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={() => setDtOpen(v => !v)}
                    style={{ display:'flex', alignItems:'center', gap:6,
                             padding:'6px 10px', borderRadius:8,
                             background:t.cardAlt,
                             color:t.muted, fontSize:12, fontWeight:500,
                             border:`0.5px solid ${t.border}`,
                             cursor:'pointer', fontFamily:'inherit' }}>
              <I.Clock style={{ width:10, height:10 }}/>
              {date === todayStr() ? 'Auj.' : date} {time}
            </button>
            <button onClick={onClose}
                    style={{ width:28, height:28, borderRadius:8,
                             background:t.cardAlt, color:t.muted,
                             border:'none', cursor:'pointer', fontSize:15,
                             display:'flex', alignItems:'center', justifyContent:'center',
                             fontFamily:'inherit' }}>
              ×
            </button>
          </div>
        </div>

        {/* Date/heure (collapsible) */}
        {dtOpen && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12,
                        padding:'12px 18px', flexShrink:0,
                        borderBottom:`0.5px solid ${t.separator}`,
                        background:t.cardAlt }}>
            {[['Date','date',date,setDate], ['Heure','time',time,setTime]].map(([lbl, tp, v, set]) => (
              <div key={tp}>
                <p style={{ fontSize:12, color:t.muted, marginBottom:6 }}>{lbl}</p>
                <input type={tp} value={v} onChange={e => set(e.target.value)} style={inpStyle}/>
              </div>
            ))}
          </div>
        )}

        {/* Corps */}
        <div style={{ overflowY:'auto', flex:1, padding:18 }}>

          {/* Succes */}
          {step === 'ok' && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
                          gap:16, padding:'32px 0' }}>
              <div style={{ width:64, height:64, borderRadius:'50%',
                            background:'#f0fdf4',
                            display:'flex', alignItems:'center', justifyContent:'center' }}>
                <I.Check style={{ width:28, height:28, color:'#065f46' }}/>
              </div>
              <div style={{ textAlign:'center' }}>
                <p style={{ fontSize:26, fontWeight:500, color:t.text,
                            fontFamily:'monospace', margin:0 }}>
                  {fmtN(finalTotal)} €
                </p>
                {promoData && (
                  <p style={{ fontSize:13, color:'#065f46', margin:'4px 0 0' }}>
                    dont remise -{fmtN(discount)} €
                  </p>
                )}
                <p style={{ fontSize:13, color:t.muted, margin:'4px 0 0' }}>
                  Encaissement enregistre
                </p>
              </div>
            </div>
          )}

          {/* Produits */}
          {step === 'products' && (<>
            {cart.length > 0 && (
              <div style={{ marginBottom:16, borderRadius:8, overflow:'hidden',
                            background:CART_BG }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                              padding:'10px 14px',
                              borderBottom:`0.5px solid rgba(67,56,202,0.2)` }}>
                  <span style={{ fontSize:12, fontWeight:500, color:CART_COLOR }}>
                    Panier · {cart.length} article{cart.length > 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize:15, fontWeight:500, color:t.text,
                                 fontFamily:'monospace' }}>
                    {fmtN(total)} €
                  </span>
                </div>
                {cart.map((item, idx) => {
                  const CIc = ICON_MAP[item.icon];
                  const isEditing = editPrice?.idx === idx;
                  return (
                    <div key={idx} style={{ display:'flex', alignItems:'center', gap:12,
                                            padding:'10px 14px',
                                            borderBottom: idx < cart.length - 1
                                              ? `0.5px solid rgba(67,56,202,0.15)`
                                              : 'none' }}>
                      <div style={{ width:30, height:30, borderRadius:6, flexShrink:0,
                                    background:'rgba(255,255,255,0.6)',
                                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {CIc ? <CIc style={{ width:13, height:13, color: item.color || CART_COLOR }}/>
                             : <I.Zap style={{ width:13, height:13, color:'#92400e' }}/>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:13, fontWeight:500, color:t.text,
                                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                                    margin:0 }}>
                          {item.name}
                        </p>
                        {isEditing ? (
                          <input autoFocus type="number" step="0.01" min="0" value={editPrice.val}
                                 onChange={e => setEditPrice(x => ({ ...x, val:e.target.value }))}
                                 onBlur={() => { setPriceForItem(idx, editPrice.val); setEditPrice(null); }}
                                 onKeyDown={e => {
                                   if (e.key === 'Enter' || e.key === 'Escape') {
                                     setPriceForItem(idx, editPrice.val); setEditPrice(null);
                                   }
                                 }}
                                 style={{ width:64, padding:'2px 6px', borderRadius:6,
                                          border:`0.5px solid ${CART_COLOR}`,
                                          background:'#fff', color:CART_COLOR,
                                          fontSize:12, fontWeight:500, outline:'none',
                                          fontFamily:'monospace' }}/>
                        ) : (
                          <button onClick={() => setEditPrice({ idx, val:String(item.price) })}
                                  style={{ fontSize:12, fontWeight:500, color:CART_COLOR,
                                           background:'none', border:'none', cursor:'pointer',
                                           padding:0, fontFamily:'inherit' }}>
                            {fmtN(item.price)} €
                          </button>
                        )}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                        <button onClick={() => changeQty(idx, -1)}
                                style={{ width:24, height:24, borderRadius:6, border:'none', cursor:'pointer',
                                         background:'rgba(255,255,255,0.7)', color:t.text,
                                         fontSize:12, fontWeight:500,
                                         display:'flex', alignItems:'center', justifyContent:'center',
                                         fontFamily:'inherit' }}>−</button>
                        <span style={{ fontSize:13, fontWeight:500, color:t.text,
                                       fontFamily:'monospace', width:16, textAlign:'center' }}>
                          {item.qty}
                        </span>
                        <button onClick={() => changeQty(idx, +1)}
                                style={{ width:24, height:24, borderRadius:6, border:'none', cursor:'pointer',
                                         background:CART_COLOR, color:'#fff',
                                         fontSize:12, fontWeight:500,
                                         display:'flex', alignItems:'center', justifyContent:'center',
                                         fontFamily:'inherit' }}>+</button>
                        <button onClick={() => removeFromCart(idx)}
                                style={{ width:24, height:24, borderRadius:6, border:'none', cursor:'pointer',
                                         background:'rgba(239,68,68,0.12)', marginLeft:4,
                                         display:'flex', alignItems:'center', justifyContent:'center',
                                         fontFamily:'inherit' }}>
                          <I.Trash style={{ width:11, height:11, color:'#991b1b' }}/>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p style={{ fontSize:12, color:t.muted, margin:'0 0 10px' }}>
              {cart.length === 0 ? 'Selectionner des services / produits' : "Ajouter d'autres articles"}
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:18 }}>
              {groups.map((grp, gi) => {
                const hasParent = !!grp.parent;
                const catId    = grp.parent?.id || `solo-${gi}`;
                const isOpen   = openCat === catId || !hasParent;
                const ParIc    = hasParent && ICON_MAP[grp.parent.icon];
                const accent   = grp.parent?.color || CART_COLOR;
                const qtyGrp   = grp.items.reduce((s, it) => s + (cart.find(c => c.category_id === it.id)?.qty || 0), 0);

                return (
                  <div key={gi} style={{ borderRadius:8, overflow:'hidden',
                                         background:t.card,
                                         border:`0.5px solid ${t.border}` }}>
                    {hasParent && (
                      <button onClick={() => setOpenCat(isOpen ? null : catId)}
                              style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
                                       padding:'12px 14px',
                                       background:'transparent', border:'none', cursor:'pointer',
                                       textAlign:'left', fontFamily:'inherit' }}>
                        <div style={{ width:34, height:34, borderRadius:8, flexShrink:0,
                                      background:`${accent}15`,
                                      display:'flex', alignItems:'center', justifyContent:'center' }}>
                          {ParIc ? <ParIc style={{ width:16, height:16, color:accent }}/>
                                 : <I.Tag style={{ width:16, height:16, color:accent }}/>}
                        </div>
                        <div style={{ flex:1, textAlign:'left' }}>
                          <p style={{ fontSize:15, fontWeight:500, color:accent, margin:0 }}>
                            {grp.parent.name}
                          </p>
                          <p style={{ fontSize:12, color:t.muted, margin:0 }}>
                            {grp.items.length} service{grp.items.length > 1 ? 's' : ''}
                          </p>
                        </div>
                        {qtyGrp > 0 && (
                          <span style={{ width:20, height:20, borderRadius:'50%',
                                         background:accent, color:'white',
                                         display:'flex', alignItems:'center', justifyContent:'center',
                                         fontSize:11, fontWeight:500 }}>
                            {qtyGrp}
                          </span>
                        )}
                        <I.ChevD style={{ width:13, height:13, color:t.muted,
                                          transform: isOpen ? 'rotate(180deg)' : 'none',
                                          transition:'transform 0.2s', flexShrink:0 }}/>
                      </button>
                    )}
                    {isOpen && grp.items.length > 0 && (
                      <div style={{ display:'flex', flexDirection:'column', gap:4,
                                    padding: hasParent ? '0 8px 8px' : '0' }}>
                        {grp.items.map(cat => {
                          const CIc    = ICON_MAP[cat.icon];
                          const inCart = cart.find(i => i.category_id === cat.id);
                          const price  = parseFloat(cat.price) || 0;
                          return (
                            <button key={cat.id} onClick={() => addToCart(cat)}
                                    style={{ display:'flex', alignItems:'center', gap:12,
                                             padding:'12px 14px', borderRadius:8, textAlign:'left',
                                             cursor:'pointer', fontFamily:'inherit',
                                             border:`0.5px solid ${inCart ? CART_COLOR : t.border}`,
                                             background: inCart ? CART_BG : t.cardAlt }}>
                              {CIc && (
                                <div style={{ width:36, height:36, borderRadius:8, flexShrink:0,
                                              background: inCart ? `${CART_COLOR}18` : `${cat.color || '#6b7280'}15`,
                                              display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  <CIc style={{ width:18, height:18,
                                                color: inCart ? CART_COLOR : (cat.color || t.muted) }}/>
                                </div>
                              )}
                              <div style={{ flex:1, minWidth:0 }}>
                                <p style={{ fontSize:15, fontWeight:500,
                                            color: inCart ? CART_COLOR : t.text,
                                            margin:'0 0 2px',
                                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  {cat.name}
                                </p>
                                {cat.is_free_price
                                  ? <span style={{ fontSize:12, fontWeight:500, color:'#92400e' }}>Prix libre</span>
                                  : price > 0 && <span style={{ fontSize:13, fontWeight:500, color:'#065f46',
                                                                fontFamily:'monospace' }}>{fmtN(price)} €</span>
                                }
                              </div>
                              {inCart && (
                                <span style={{ width:22, height:22, borderRadius:99, flexShrink:0,
                                               background:CART_COLOR, color:'white',
                                               display:'flex', alignItems:'center', justifyContent:'center',
                                               fontSize:12, fontWeight:500 }}>
                                  {inCart.qty}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={() => setFreePriceModal({ custom: true })}
                    style={{ width:'100%', padding:'10px', borderRadius:8, marginBottom:12,
                             display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                             background:'#fffbeb', color:'#92400e',
                             border:`0.5px solid rgba(245,158,11,0.4)`,
                             fontSize:13, fontWeight:500, cursor:'pointer',
                             fontFamily:'inherit' }}>
              <I.Edit style={{ width:13, height:13 }}/>
              Autre / Montant libre
            </button>

            <Button variant="primary" disabled={cart.length === 0} fullWidth
                    onClick={() => setStep('employee')}>
              Continuer · {cart.length > 0 ? `${fmtN(promoData ? finalTotal : total)} €` : 'Selectionner des articles'}
            </Button>

            {freePriceModal && (() => {
              const isCustom = !!freePriceModal.custom;
              const cat = freePriceModal.cat || null;
              const _name = isCustom ? '' : (cat?.name || '');
              return (
                <FreePriceModal
                  key={isCustom ? 'custom' : cat?.id}
                  catName={_name} isCustom={isCustom} theme={t}
                  onCancel={() => setFreePriceModal(null)}
                  onConfirm={(name, price) => {
                    setCart(prev => [...prev, {
                      category_id: cat?.id || null,
                      name: name || cat?.name || 'Autre',
                      price: parseFloat(price) || 0,
                      qty: 1,
                      icon: cat?.icon || 'Zap',
                      color: cat?.color || '#92400e',
                      is_free_price: true,
                    }]);
                    setFreePriceModal(null);
                  }}/>
              );
            })()}
          </>)}

          {/* Employe */}
          {step === 'employee' && (<>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                          padding:'10px 14px', borderRadius:8, marginBottom:18,
                          background:CART_BG }}>
              <span style={{ fontSize:13, fontWeight:500, color:CART_COLOR }}>
                {cart.length} article{cart.length > 1 ? 's' : ''}
              </span>
              <span style={{ fontSize:16, fontWeight:500, color:CART_COLOR, fontFamily:'monospace' }}>
                {fmtN(promoData ? finalTotal : total)} €
              </span>
            </div>
            <p style={{ fontSize:12, color:t.muted, textAlign:'center', margin:'0 0 14px' }}>
              Quel employe ?
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
              {employees.map(emp => {
                const active = empId === emp.id;
                return (
                  <button key={emp.id} onClick={() => { setEmpId(emp.id); setStep('payment'); }}
                          style={{ display:'flex', alignItems:'center', gap:14,
                                   padding:'12px 14px', borderRadius:8, cursor:'pointer',
                                   fontFamily:'inherit', textAlign:'left',
                                   border:`0.5px solid ${active ? CART_COLOR : t.border}`,
                                   background: active ? CART_BG : t.cardAlt }}>
                    <div style={{ width:36, height:36, borderRadius:8, flexShrink:0,
                                  background: emp.avatar_color || CART_COLOR,
                                  display:'flex', alignItems:'center', justifyContent:'center',
                                  color:'white', fontWeight:500, fontSize:14 }}>
                      {emp.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:13, fontWeight:500,
                                  color: active ? CART_COLOR : t.text, margin:0 }}>
                        {emp.name}
                      </p>
                      {emp.role && <p style={{ fontSize:12, color:t.muted, margin:0 }}>{emp.role}</p>}
                    </div>
                    {active && <I.Check style={{ width:16, height:16, color:CART_COLOR }}/>}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setStep('products')}
                    style={{ width:'100%', padding:8, fontSize:13, color:t.muted,
                             background:'none', border:'none', cursor:'pointer',
                             fontFamily:'inherit' }}>
              ← Retour
            </button>
          </>)}

          {/* Paiement */}
          {step === 'payment' && (<>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                          padding:'10px 14px', borderRadius:8, marginBottom:18,
                          background:'#f0fdf4' }}>
              <div>
                <span style={{ fontSize:12, fontWeight:500, color:'#065f46' }}>
                  {cart.length} article{cart.length > 1 ? 's' : ''}
                </span>
                {employees.find(e => e.id === empId) && (
                  <span style={{ fontSize:12, marginLeft:8, color:t.muted }}>
                    · {employees.find(e => e.id === empId).name}
                  </span>
                )}
              </div>
              <div style={{ textAlign:'right' }}>
                {promoData && (
                  <span style={{ fontSize:11, textDecoration:'line-through', display:'block',
                                 color:t.muted }}>{fmtN(total)} €</span>
                )}
                <span style={{ fontSize:17, fontWeight:500, fontFamily:'monospace',
                               color: promoData ? '#065f46' : t.text }}>
                  {fmtN(promoData ? finalTotal : total)} €
                </span>
                {promoData && (
                  <span style={{ fontSize:11, display:'block', color:'#065f46' }}>
                    −{fmtN(discount)} €
                  </span>
                )}
              </div>
            </div>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <p style={{ fontSize:12, color:t.muted, margin:0 }}>
                {splitMode ? 'Paiement mixte (repartir)' : 'Mode de paiement'}
              </p>
              <button onClick={() => setSplitMode(v => !v)}
                      style={{ fontSize:12, fontWeight:500,
                               padding:'4px 10px', borderRadius:8,
                               background: splitMode ? CART_BG : t.cardAlt,
                               color: splitMode ? CART_COLOR : t.muted,
                               border:`0.5px solid ${splitMode ? CART_COLOR : t.border}`,
                               cursor:'pointer', fontFamily:'inherit' }}>
                {splitMode ? '✓ Simple' : 'Diviser'}
              </button>
            </div>

            {!splitMode && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
                {Object.entries(PM_CFG).map(([v, { label, color, bg, Ic }]) => {
                  const active = payMethod === v;
                  return (
                    <button key={v} onClick={() => setPay(v)}
                            style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                                     padding:'12px', borderRadius:8, cursor:'pointer',
                                     fontFamily:'inherit',
                                     border:`0.5px solid ${active ? color : t.border}`,
                                     background: active ? bg : t.cardAlt }}>
                      <div style={{ width:32, height:32, borderRadius:8,
                                    background: active ? `${color}22` : t.cardAlt,
                                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Ic style={{ width:15, height:15, color }}/>
                      </div>
                      <span style={{ fontSize:12, fontWeight:500,
                                     color: active ? color : t.textSub }}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {splitMode && (
              <div style={{ marginBottom:14, borderRadius:8, overflow:'hidden',
                            background:t.cardAlt,
                            border:`0.5px solid ${t.border}` }}>
                {Object.entries(PM_CFG).map(([v, { label, color, Ic }], i, arr) => {
                  const val = splitAmts[v];
                  const setVal = s => setSplitAmts(prev => ({ ...prev, [v]: s }));
                  const num = parseFloat(val) || 0;
                  return (
                    <div key={v} style={{ display:'flex', alignItems:'center', gap:12,
                                          padding:'10px 14px',
                                          borderBottom: i < arr.length - 1
                                            ? `0.5px solid ${t.separator}` : 'none' }}>
                      <div style={{ width:30, height:30, borderRadius:8, flexShrink:0,
                                    background:`${color}18`,
                                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Ic style={{ width:14, height:14, color }}/>
                      </div>
                      <span style={{ flex:1, fontSize:13, fontWeight:500, color:t.text }}>
                        {label}
                      </span>
                      <div style={{ position:'relative' }}>
                        <input type="number" step="0.01" min="0" placeholder="0.00"
                               value={val}
                               onChange={e => setVal(e.target.value)}
                               style={{ width:90, padding:'6px 22px 6px 10px', borderRadius:8,
                                        border:`0.5px solid ${num > 0 ? color : t.borderInput}`,
                                        background:t.inputBg,
                                        color: num > 0 ? color : t.text,
                                        fontSize:13, fontWeight:500, fontFamily:'monospace',
                                        textAlign:'right', outline:'none' }}/>
                        <span style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                                       fontSize:11, color:t.muted, pointerEvents:'none' }}>€</span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ padding:'10px 14px',
                              display:'flex', alignItems:'center', justifyContent:'space-between',
                              borderTop:`0.5px solid ${t.separator}`,
                              background: paymentsValid ? '#f0fdf4' : '#fef2f2' }}>
                  <span style={{ fontSize:12, fontWeight:500,
                                 color: paymentsValid ? '#065f46' : '#991b1b' }}>
                    {paymentsValid ? 'Repartition OK' : `Il manque ${fmtN(finalTotal - paymentsSum)} €`}
                  </span>
                  <span style={{ fontSize:13, fontWeight:500, fontFamily:'monospace',
                                 color: paymentsValid ? '#065f46' : '#991b1b' }}>
                    {fmtN(paymentsSum)} / {fmtN(finalTotal)} €
                  </span>
                </div>
              </div>
            )}

            {/* Parrainage en attente */}
            {pendingRefs.length > 0 && (
              <div style={{ marginBottom:14, padding:12, borderRadius:8,
                            background:'#eeedfe' }}>
                {pendingRefs.map(p => {
                  const parrainName = [p.parrain_first_name, p.parrain_last_name].filter(Boolean).join(' ')
                                   || p.parrain_email;
                  return (
                    <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <I.Heart style={{ width:14, height:14, color:'#3c3489', flexShrink:0 }}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:12, fontWeight:500, color:'#3c3489', margin:0 }}>
                          Filleul de {parrainName}
                        </p>
                        <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                          Valider pour recompenser le parrain ({p.referral_code})
                        </p>
                      </div>
                      <button onClick={() => validateReferral(p.id)} disabled={refValidating === p.id}
                              style={{ padding:'5px 12px', borderRadius:8,
                                       background:'#3c3489', color:'#fff', border:'none',
                                       fontSize:12, fontWeight:500, cursor:'pointer', flexShrink:0,
                                       opacity: refValidating === p.id ? 0.6 : 1,
                                       fontFamily:'inherit' }}>
                        {refValidating === p.id ? '...' : 'Valider'}
                      </button>
                      <button onClick={() => cancelReferral(p.id)} disabled={refValidating === p.id}
                              style={{ padding:'5px 12px', borderRadius:8,
                                       background:'transparent', color:'#991b1b',
                                       border:`0.5px solid rgba(239,68,68,0.3)`,
                                       fontSize:12, fontWeight:500, cursor:'pointer', flexShrink:0,
                                       opacity: refValidating === p.id ? 0.6 : 1,
                                       fontFamily:'inherit' }}>
                        Refuser
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Reductions disponibles */}
            {clientRewards.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <p style={{ fontSize:12, color:t.muted, margin:'0 0 8px' }}>
                  Reductions disponibles ({clientRewards.length})
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {clientRewards.map((r) => {
                    const expStr = r.expires_at ? new Date(r.expires_at).toLocaleDateString('fr-FR') : null;
                    const valStr = r.type === 'percent' ? `-${r.value}%` : `-${fmtN(r.value)} €`;
                    const selected = selectedRewardId === r.id;
                    const isBday   = r.reward_type === 'birthday';
                    const accent   = isBday ? '#9a3412' : '#3c3489';
                    const bg       = isBday ? '#fff7ed' : '#eeedfe';
                    return (
                      <button key={r.id} onClick={() => applyReward(r)}
                              style={{ display:'flex', alignItems:'center', gap:10,
                                       padding:'10px 12px', borderRadius:8,
                                       border:`0.5px solid ${selected ? accent : t.border}`,
                                       background: selected ? bg : t.cardAlt,
                                       cursor:'pointer', textAlign:'left', width:'100%',
                                       fontFamily:'inherit' }}>
                        <span style={{ fontSize:16 }}>{isBday ? '🎂' : '🤝'}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:12, fontWeight:500, color:t.text, margin:0 }}>
                            {valStr}{' '}
                            <span style={{ color:accent, fontFamily:'monospace', fontSize:11 }}>· {r.code}</span>
                          </p>
                          <p style={{ fontSize:10, color:t.muted, margin:0 }}>
                            {isBday ? 'Anniversaire' : 'Parrainage'}{expStr ? ` · expire le ${expStr}` : ''}
                          </p>
                        </div>
                        {selected && <span style={{ fontSize:12, fontWeight:500, color:accent }}>appliquee</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Code promo */}
            {(empId === '' || employees.find(e => e.id === empId)?.can_use_promo !== false) && (
              <div style={{ marginBottom:14 }}>
                <p style={{ fontSize:11, fontStyle:'italic', color:t.muted, margin:'0 0 6px' }}>
                  Une seule reduction par encaissement (non cumulable avec anniversaire, parrainage ou autre code).
                </p>
                <div style={{ display:'flex', gap:8 }}>
                  <input placeholder="Code promo ou parrainage (optionnel)"
                         value={promoCode}
                         onChange={e => {
                           setPromoCode(e.target.value.toUpperCase());
                           setPromoData(null); setPromoErr(''); setSelectedRewardId(null);
                         }}
                         onKeyDown={e => e.key === 'Enter' && checkPromo()}
                         style={{ ...inpStyle, flex:1,
                                  borderColor: promoData ? '#065f46' : promoErr ? '#991b1b' : t.borderInput }}/>
                  <Button variant="secondary" size="small" type="button"
                          onClick={checkPromo} disabled={promoLoad || !promoCode.trim()}>
                    {promoLoad ? '...' : '✓'}
                  </Button>
                </div>
                {promoData && (
                  <p style={{ fontSize:12, fontWeight:500, margin:'6px 0 0',
                              color: promoData.source === 'referral' ? '#3c3489' : '#065f46' }}>
                    {promoData.source === 'referral' ? 'Parrainage' : 'Remise'} de{' '}
                    {promoData.promo?.type === 'percent'
                      ? `${promoData.promo.value}%`
                      : `${fmtN(promoData.discount)} €`}
                  </p>
                )}
                {promoErr && (
                  <p style={{ fontSize:12, color:'#991b1b', margin:'6px 0 0' }}>{promoErr}</p>
                )}
              </div>
            )}

            {/* Client */}
            <div style={{ marginBottom:14 }}>
              <div style={{ position:'relative', marginBottom:8 }}>
                <input placeholder="Client — nom, email, telephone…"
                       value={clientSearch}
                       onChange={async e => {
                         const v = e.target.value; setClientSearch(v);
                         if (v !== (clientName + (clientEmail ? ' - ' + clientEmail : ''))) {
                           setClientEmail(''); setClientName('');
                         }
                         if (v.trim().length < 2) { setClientSuggests([]); return; }
                         setClientSearchBusy(true);
                         try { const r = await loyaltyApi.searchClients(v); setClientSuggests(r || []); }
                         catch { setClientSuggests([]); }
                         finally { setClientSearchBusy(false); }
                       }}
                       style={inpStyle}/>
                {clientSuggests.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:10,
                                borderRadius:8, overflow:'hidden', marginTop:4,
                                background:t.elevated,
                                border:`0.5px solid ${t.border}`,
                                boxShadow:t.shadowLg, maxHeight:180, overflowY:'auto' }}>
                    {clientSuggests.map((cl, i) => (
                      <button key={i}
                              onClick={() => {
                                setClientEmail(cl.email || '');
                                setClientName(cl.name || '');
                                setClientSearch((cl.name || '') + (cl.email ? ' - ' + cl.email : ''));
                                setClientSuggests([]);
                              }}
                              style={{ width:'100%', padding:'10px 14px',
                                       background:'none', border:'none', textAlign:'left', cursor:'pointer',
                                       borderBottom: i < clientSuggests.length - 1 ? `0.5px solid ${t.separator}` : 'none',
                                       fontFamily:'inherit' }}>
                        <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>{cl.name}</p>
                        <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                          {cl.email}{cl.phone ? ' · ' + cl.phone : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(clientEmail || clientName) && (
                <div style={{ display:'flex', alignItems:'center', gap:8,
                              padding:'8px 12px', borderRadius:8, marginBottom:8,
                              background:'#f0fdf4' }}>
                  <I.Check style={{ width:12, height:12, color:'#065f46', flexShrink:0 }}/>
                  <span style={{ fontSize:12, color:t.text }}>{clientName}</span>
                  {clientEmail && <span style={{ fontSize:11, color:t.muted }}>({clientEmail})</span>}
                  <button onClick={() => { setClientEmail(''); setClientName(''); setClientSearch(''); }}
                          style={{ marginLeft:'auto',
                                   background:'none', border:'none', cursor:'pointer',
                                   color:t.muted, fontSize:14, fontFamily:'inherit' }}>×</button>
                </div>
              )}
              <textarea placeholder="Note interne (equipe uniquement)"
                        value={clientNote}
                        onChange={e => setClientNote(e.target.value)} rows={2}
                        style={{ ...inpStyle, resize:'vertical', lineHeight:1.5 }}/>
            </div>

            <Button variant="primary" fullWidth disabled={busy || !paymentsValid}
                    onClick={confirm} style={{ marginBottom:8 }}>
              {busy ? 'Enregistrement...'
                   : !paymentsValid ? 'Repartition incomplete'
                   : `Valider · ${fmtN(finalTotal)} €`}
            </Button>
            <button onClick={() => setStep('employee')}
                    style={{ width:'100%', padding:8, fontSize:13, color:t.muted,
                             background:'none', border:'none', cursor:'pointer',
                             fontFamily:'inherit' }}>
              ← Retour
            </button>
          </>)}
        </div>
      </div>
      {PinModalNode}
    </div>
  );
}

// ── DesktopSidebar ──────────────────────────────────────────────────────────
function DesktopSidebar({ onHome, onLogout, theme: t, toggle, isLight }) {
  const NavBtn = ({ onClick, label, icon, danger }) => (
    <button onClick={onClick}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
                     padding:'10px 14px', borderRadius:8,
                     border:`0.5px solid ${t.border}`,
                     background: t.cardAlt,
                     cursor:'pointer', transition:'background 0.15s ease, transform 0.15s ease',
                     fontFamily:'inherit' }}
            onMouseEnter={e => {
              e.currentTarget.style.background = danger
                ? 'rgba(239,68,68,0.08)'
                : t.card;
              e.currentTarget.style.transform = 'translateX(2px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = t.cardAlt;
              e.currentTarget.style.transform = 'none';
            }}>
      <div style={{ width:30, height:30, borderRadius:8, flexShrink:0,
                    background: danger ? 'rgba(239,68,68,0.12)' : t.cardAlt,
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
        {icon}
      </div>
      <span style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap',
                     color: danger ? '#991b1b' : t.text }}>
        {label}
      </span>
    </button>
  );

  return (
    <div style={{ width:200, minHeight:'100vh', display:'flex', flexDirection:'column',
                  padding:'20px 12px', gap:8,
                  position:'sticky', top:0, height:'100vh', flexShrink:0,
                  background:t.canvas,
                  borderRight:`0.5px solid ${t.border}` }}>

      {/* Logo */}
      <div style={{ display:'flex', alignItems:'center', gap:10,
                    padding:'4px 4px 16px',
                    borderBottom:`0.5px solid ${t.separator}`,
                    marginBottom:8 }}>
        <img src="/images/logo-app.png" alt="FlowIA"
             style={{ width:34, height:34, borderRadius:8, flexShrink:0, objectFit:'contain' }}/>
        <div>
          <p style={{ fontWeight:500, fontSize:13, color:t.text, margin:0, lineHeight:1.2 }}>FlowIA</p>
          <p style={{ fontSize:11, color:t.muted, margin:0 }}>Gestion pro</p>
        </div>
      </div>

      <NavBtn onClick={onHome} label="Accueil" icon={
        <svg viewBox="0 0 24 24" fill="none" stroke={t.text} strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" style={{ width:15, height:15 }}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      }/>

      {/* Toggle theme */}
      <button onClick={toggle}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
                       padding:'10px 14px', borderRadius:8,
                       border:`0.5px solid ${t.border}`,
                       background:t.cardAlt,
                       cursor:'pointer', transition:'background 0.15s ease',
                       fontFamily:'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.background = t.card; }}
              onMouseLeave={e => { e.currentTarget.style.background = t.cardAlt; }}>
        <div style={{ width:30, height:30, borderRadius:8, flexShrink:0,
                      background:t.cardAlt,
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
          {isLight
            ? <svg viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14 }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14 }}>
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>}
        </div>
        <span style={{ fontSize:13, fontWeight:500, color:t.text, whiteSpace:'nowrap' }}>
          {isLight ? 'Mode sombre' : 'Mode clair'}
        </span>
      </button>

      <div style={{ flex:1 }}/>

      <div style={{ height:'0.5px', background:t.separator, margin:'4px 0' }}/>

      <NavBtn onClick={onLogout} label="Deconnexion" danger icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="#991b1b" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" style={{ width:15, height:15 }}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      }/>
    </div>
  );
}

// ── TopBar ──────────────────────────────────────────────────────────────────
function TopBar({ onHome, onLogout, theme: t, toggle, isLight }) {
  return (
    <div style={{ position:'sticky', top:0, zIndex:40,
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'10px 14px',
                  background:t.stickyBg,
                  backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)',
                  borderBottom:`0.5px solid ${t.separator}` }}>
      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
        <img src="/images/logo-app.png" alt="FlowIA"
             style={{ width:28, height:28, borderRadius:8, flexShrink:0, objectFit:'contain' }}/>
        <span style={{ fontWeight:500, fontSize:14, color:t.text }}>FlowIA</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <button onClick={toggle}
                style={{ display:'flex', alignItems:'center', gap:5,
                         padding:'6px 10px', borderRadius:8,
                         border:`0.5px solid ${t.border}`,
                         background:t.cardAlt, cursor:'pointer', fontFamily:'inherit' }}>
          {isLight
            ? <svg viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12 }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12 }}>
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>}
          <span style={{ fontSize:11, fontWeight:500, color:t.text }}>
            {isLight ? 'Sombre' : 'Clair'}
          </span>
        </button>
        <button onClick={onHome}
                style={{ display:'flex', alignItems:'center', gap:5,
                         padding:'6px 10px', borderRadius:8,
                         border:`0.5px solid ${t.borderStrong}`,
                         background:t.cardAlt, cursor:'pointer', fontFamily:'inherit' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={t.text} strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12 }}>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span style={{ fontSize:11, fontWeight:500, color:t.text }}>Accueil</span>
        </button>
        <button onClick={onLogout}
                style={{ display:'flex', alignItems:'center', gap:5,
                         padding:'6px 10px', borderRadius:8,
                         border:`0.5px solid rgba(239,68,68,0.25)`,
                         background:'rgba(239,68,68,0.08)', cursor:'pointer',
                         fontFamily:'inherit' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#991b1b" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12 }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span style={{ fontSize:11, fontWeight:500, color:'#991b1b' }}>Deconnexion</span>
        </button>
      </div>
    </div>
  );
}

// ── Splash ──────────────────────────────────────────────────────────────────
function Splash({ text = 'Chargement...', theme }) {
  const t = theme;
  return (
    <div style={{ minHeight:'100vh', background:t?.bg || '#f8f9fc',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  gap:20 }}>
      <div style={{ width:52, height:52, borderRadius:12,
                    background:t?.card || '#ffffff',
                    border:`0.5px solid ${t?.border || 'rgba(0,0,0,0.08)'}`,
                    boxShadow:t?.shadowMd,
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={t?.text || '#111827'} strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round" style={{ width:26, height:26 }}>
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      </div>
      <div style={{ textAlign:'center' }}>
        <p style={{ fontSize:17, fontWeight:500, color:t?.text || '#111827', margin:0 }}>FlowIA</p>
        <p style={{ fontSize:13, color:t?.muted || '#6B7280', margin:'4px 0 0' }}>{text}</p>
      </div>
      <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24"
           style={{ color:t?.text || '#111827' }}>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
        <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ── PinOnboarding ───────────────────────────────────────────────────────────
function PinOnboarding({ onSetupNow, theme: t }) {
  const features = [
    { Ic: I.Lock,    title: 'Securise',   desc: 'Donnees protegees par votre PIN' },
    { Ic: I.Zap,     title: 'Instantane', desc: '4 chiffres pour acceder' },
    { Ic: I.Refresh, title: 'Flexible',   desc: 'Modifiable dans les reglages' },
  ];
  return (
    <div style={{ minHeight:'100vh', background:t.bg,
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  padding:'0 24px 128px' }}>
      <div style={{ width:'100%', maxWidth:320, textAlign:'center' }}>
        <div style={{ width:56, height:56, borderRadius:12,
                      background:'#fffbeb',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      margin:'0 auto 20px' }}>
          <I.Lock style={{ width:26, height:26, color:'#92400e' }}/>
        </div>
        <h1 style={{ fontSize:22, fontWeight:500, color:t.text, margin:'0 0 8px' }}>Bienvenue !</h1>
        <p style={{ fontSize:13, color:t.muted, margin:'0 0 24px', lineHeight:1.5 }}>
          Creez un code PIN a 4 chiffres pour proteger votre espace administrateur.
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
          {features.map(({ Ic, title, desc }) => (
            <div key={title} style={{ display:'flex', alignItems:'center', gap:12,
                                      padding:'12px 14px', borderRadius:8, textAlign:'left',
                                      background:t.card,
                                      border:`0.5px solid ${t.border}` }}>
              <div style={{ width:30, height:30, borderRadius:8, flexShrink:0,
                            background:t.cardAlt,
                            display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Ic style={{ width:14, height:14, color:t.muted }}/>
              </div>
              <div>
                <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>{title}</p>
                <p style={{ fontSize:12, color:t.muted, margin:0 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <Button variant="primary" fullWidth onClick={onSetupNow}>
          Creer mon code PIN →
        </Button>
        <p style={{ fontSize:12, color:t.dim, margin:'12px 0 0' }}>
          {"Obligatoire pour l'espace Admin"}
        </p>
      </div>
    </div>
  );
}

// ── NotificationCenter ──────────────────────────────────────────────────────
function NotificationCenter({ theme: t }) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);
  const navigate  = useNavigate();
  const {
    notifications, unreadCount,
    pushSupported, pushEnabled,
    enablePush, disablePush,
    markRead, markAllRead, deleteNotif,
    reload,
  } = useNotifications({ enabled: true });

  // Clic sur une notif : marque lue + deep-link vers le RDV concerné
  // (ou /agenda générique si pas d'url). Valide le path pour ne router
  // que sur des chemins relatifs internes (même règle que le SW).
  const openNotification = (n) => {
    if (!n.is_read) markRead(n.id);
    const raw = n?.data?.url;
    let target = null;
    if (typeof raw === 'string' && raw.length && raw[0] === '/' && !raw.startsWith('//')
        && !/[\x00-\x1f]/.test(raw) && !raw.includes('\\')) {
      target = raw;
    } else if (n?.data?.appointment_id) {
      target = '/agenda';
    }
    if (target) {
      setOpen(false);
      navigate(target);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (drawerRef.current && !drawerRef.current.contains(e.target)) setOpen(false); };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Icones data metier (identifient le type de notification)
  const TYPE_CFG = {
    new_appointment:      { icon: '📅', color: '#4338ca', label: 'Nouveau RDV' },
    appointment_reminder: { icon: '⏰', color: '#92400e', label: 'Rappel RDV' },
    caisse:               { icon: '🧾', color: '#065f46', label: 'Caisse' },
  };

  const fmtTime = (iso) => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000)    return "A l'instant";
    if (diff < 3600000)  return `Il y a ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
  };

  return (
    <div style={{ position:'relative' }} ref={drawerRef}>
      <button onClick={() => { setOpen(p => !p); if (!open) reload(); }}
              style={{ position:'relative', width:34, height:34, borderRadius:8,
                       background: open ? t.cardAlt : 'transparent',
                       border:`0.5px solid ${t.border}`,
                       cursor:'pointer',
                       display:'flex', alignItems:'center', justifyContent:'center',
                       transition:'background 0.15s ease', fontFamily:'inherit' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round"
             style={{ width:15, height:15, color: open ? t.text : t.muted }}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{ position:'absolute', top:-4, right:-4,
                         minWidth:14, height:14, borderRadius:99,
                         background:'#991b1b', color:'white',
                         fontSize:9, fontWeight:500,
                         display:'flex', alignItems:'center', justifyContent:'center',
                         padding:'0 3px' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position:'absolute', top:42, right:0,
                      width:340, maxWidth:'calc(100vw - 32px)',
                      background:t.elevated, borderRadius:12,
                      border:`0.5px solid ${t.border}`,
                      boxShadow:t.shadowModal, zIndex:1000, overflow:'hidden' }}>
          <div style={{ padding:'14px 16px', borderBottom:`0.5px solid ${t.separator}`,
                        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontWeight:500, fontSize:14, color:t.text }}>
              Notifications
              {unreadCount > 0 && (
                <span style={{ marginLeft:6, padding:'2px 7px', borderRadius:99,
                               background:'#fef2f2', color:'#991b1b', fontSize:11, fontWeight:500 }}>
                  {unreadCount} non lues
                </span>
              )}
            </span>
            <div style={{ display:'flex', gap:6 }}>
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                        style={{ fontSize:11, color:t.muted,
                                 background:'none', border:'none', cursor:'pointer',
                                 fontFamily:'inherit' }}>
                  Tout lire
                </button>
              )}
              {pushSupported && (
                <button onClick={async () => {
                          if (pushEnabled) return disablePush();
                          const r = await enablePush();
                          if (r && r.ok === false) {
                            const msg = r.reason === 'denied'
                              ? 'Vous avez refuse les notifications. Autorisez-les dans les parametres de votre navigateur pour recevoir les alertes.'
                              : r.reason === 'unsupported'
                              ? 'Votre navigateur ne supporte pas les notifications push.'
                              : r.reason === 'dismissed'
                              ? 'Demande de notification fermee. Cliquez a nouveau pour reessayer.'
                              : r.reason === 'vapid_missing'
                              ? 'Service de notifications indisponible (contactez le support).'
                              : `Erreur : ${r.message || 'inconnue'}`;
                            alert(msg);
                          }
                        }}
                        style={{ fontSize:11, padding:'3px 8px', borderRadius:8,
                                 border:`0.5px solid ${t.border}`,
                                 background: pushEnabled ? '#f0fdf4' : 'transparent',
                                 color: pushEnabled ? '#065f46' : t.muted,
                                 fontWeight:500, cursor:'pointer',
                                 fontFamily:'inherit' }}>
                  {pushEnabled ? 'Push ON' : 'Push OFF'}
                </button>
              )}
            </div>
          </div>

          <div style={{ maxHeight:420, overflowY:'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding:'32px 16px', textAlign:'center' }}>
                <p style={{ fontSize:13, color:t.muted, margin:0 }}>Aucune notification</p>
              </div>
            ) : notifications.map((n) => {
              const cfg = TYPE_CFG[n.type] || { icon:'📌', color:t.muted, label:n.type };
              return (
                <div key={n.id}
                     style={{ padding:'12px 16px', borderBottom:`0.5px solid ${t.separator}`,
                              display:'flex', gap:10, alignItems:'flex-start',
                              background: n.is_read ? 'transparent' : t.cardAlt,
                              cursor:'pointer', transition:'background 0.1s' }}
                     onClick={() => openNotification(n)}>
                  <div style={{ width:32, height:32, borderRadius:8,
                                background:`${cfg.color}18`,
                                display:'flex', alignItems:'center', justifyContent:'center',
                                fontSize:15, flexShrink:0 }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                      {!n.is_read && <span style={{ width:6, height:6, borderRadius:'50%',
                                                    background:t.text, flexShrink:0 }}/>}
                      <p style={{ margin:0, fontWeight:500, fontSize:13, color:t.text,
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {n.title}
                      </p>
                    </div>
                    {n.body && <p style={{ margin:0, fontSize:11, color:t.muted, lineHeight:1.4 }}>{n.body}</p>}
                    <p style={{ margin:'4px 0 0', fontSize:10, color:t.dim }}>{fmtTime(n.created_at)}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteNotif(n.id); }}
                          style={{ width:22, height:22, borderRadius:6,
                                   background:'rgba(239,68,68,0.1)', border:'none', cursor:'pointer',
                                   color:'#991b1b', fontSize:12,
                                   display:'flex', alignItems:'center', justifyContent:'center',
                                   flexShrink:0, fontFamily:'inherit' }}>×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading, logout, login }                                = useAuth();
  const { unlocked, hasPin, checking, changePin, lock, checkSession }   = useAdmin();
  const { theme, toggle, isLight }                                      = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [soundCfg, setSoundCfg] = useState({
    caisse: true, new_appointment: true, reminder: true, repeat: 2, rdvBefore: 15
  });
  useEffect(() => {
    if (!user) return;
    notifApi.getSettings().then(s => {
      setSoundCfg({
        caisse:          s.sound_caisse     ?? true,
        new_appointment: s.sound_new_appt   ?? true,
        reminder:        s.sound_reminder   ?? true,
        repeat:          s.sound_repeat     ?? 2,
        rdvBefore:       s.sound_rdv_before ?? 15,
      });
    }).catch(() => {});
  }, [user]);

  const { unreadCount: appUnreadCount, notifications: appNotifs } = useNotifications({ enabled: !!user });

  const prevSoundCountRef = useRef(0);
  useEffect(() => {
    const newAppts = (appNotifs || []).filter(n => n.type === 'new_appointment' && !n.is_read);
    if (newAppts.length > prevSoundCountRef.current && soundCfg.new_appointment) {
      playSound('new_appointment', soundCfg.repeat || 2);
    }
    prevSoundCountRef.current = newAppts.length;
  }, [appNotifs, soundCfg]);

  const shownReminderIds = useRef(new Set());
  useEffect(() => {
    if (!soundCfg.reminder || !user) return;
    const checkRdv = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const { bookingApi: bApi } = await import('./utils/api');
        const data  = await bApi.getAppointments({ from: today, to: today });
        const appts = Array.isArray(data) ? data : [];
        const now   = new Date();
        const minutesBefore = soundCfg.rdvBefore || 15;
        appts.forEach(a => {
          if (a.status === 'cancelled' || a.status === 'completed') return;
          if (shownReminderIds.current.has(a.id)) return;
          const dateStr = typeof a.date === 'string' ? a.date.substring(0, 10) : new Date(a.date).toISOString().substring(0, 10);
          const timeStr = String(a.start_time).substring(0, 5);
          const apptTime = new Date(`${dateStr}T${timeStr}:00`);
          const diffMin  = (apptTime - now) / 60000;
          if (diffMin > 0 && diffMin <= minutesBefore) {
            shownReminderIds.current.add(a.id);
            playSound('reminder', soundCfg.repeat || 2);
          }
        });
      } catch {}
    };
    const iv = setInterval(checkRdv, 60000);
    checkRdv();
    return () => clearInterval(iv);
  }, [soundCfg.reminder, soundCfg.rdvBefore, soundCfg.repeat, user]);

  const page = location.pathname.replace(/^\//, '').split('/')[0] || 'dashboard';

  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [adminStep, setAdminStep] = useState('entry');
  const [transactions, setTxs]    = useState([]);
  const [employees, setEmps]      = useState([]);
  const [categories, setCats]     = useState([]);
  const [dataLoading, setDl]      = useState(false);

  useEffect(() => {
    if (!user) return;
    checkSession();
    setDl(true);
    const _from = new Date(); _from.setMonth(_from.getMonth() - 3);
    const _fromStr = _from.toISOString().split('T')[0];
    Promise.all([
      api.getCategories(),
      api.getEmployees(),
      api.getTransactions({ from: _fromStr }),
    ]).then(([cats, emps, txs]) => { setCats(cats); setEmps(emps); setTxs(txs); })
      .catch(console.error)
      .finally(() => setDl(false));
  }, [user]);

  useEffect(() => {
    if (checking) return;
    if (page !== 'settings') return;
    if (hasPin === false) { setAdminStep('onboarding'); }
    else if (hasPin === true && !unlocked) { setAdminStep(s => s === 'setup' ? s : 'entry'); }
    else if (hasPin === true && unlocked)  { setAdminStep('open'); }
  }, [hasPin, unlocked, checking, page]);

  useEffect(() => {
    if (!checking && hasPin === false && user) {
      navigate('/settings', { replace: true });
      setAdminStep('onboarding');
    }
  }, [hasPin, checking, user]);

  const addTx = useCallback(async (d, actingEmployeeId) => {
    const t = await api.createTransaction(d, actingEmployeeId || d?.employee_id || null);
    setTxs(p => [t, ...p]);
    return t;
  }, []);
  const updTx  = useCallback(async (id, d) => { const t = await api.updateTransaction(id, d); setTxs(p => p.map(x => x.id === id ? t : x)); }, []);
  const delTx  = useCallback(async id => { await api.deleteTransaction(id); setTxs(p => p.filter(x => x.id !== id)); }, []);
  const addCat = useCallback(async d => { const c = await api.createCategory(d); setCats(p => [...p, c]); }, []);
  const updCat = useCallback(async (id, d) => { const c = await api.updateCategory(id, d); setCats(p => p.map(x => x.id === id ? c : x)); }, []);
  const delCat = useCallback(async id => { await api.deleteCategory(id); setCats(p => p.filter(x => x.id !== id)); }, []);
  const reorderCat = useCallback((reordered) => {
    setCats(prev => {
      const ids = new Set(reordered.map(r => r.id));
      const others = prev.filter(c => !ids.has(c.id));
      return [...reordered.map(r => ({ ...prev.find(c => c.id === r.id) || r, sort_order: r.sort_order })), ...others];
    });
  }, []);
  const addEmp   = useCallback(async d => { const e = await api.createEmployee(d); setEmps(p => [...p, e]); return e; }, []);
  const updEmp   = useCallback(async (id, d) => { const e = await api.updateEmployee(id, d); setEmps(p => p.map(x => x.id === id ? { ...e, has_image:x.has_image } : x)); return e; }, []);
  const delEmp   = useCallback(async id => { await api.deleteEmployee(id); setEmps(p => p.filter(x => x.id !== id)); }, []);
  const patchEmp = useCallback((id, changes) => setEmps(p => p.map(x => x.id === id ? { ...x, ...changes } : x)), []);

  const handleTab = useCallback((id) => {
    if (id === 'settings') {
      if (hasPin === false) setAdminStep('onboarding');
      else if (!unlocked) setAdminStep('entry');
      else setAdminStep('open');
    } else {
      if (page === 'settings' && unlocked) lock();
    }
    navigate('/' + id);
  }, [hasPin, unlocked, page, lock, navigate]);

  const handleLock = useCallback(() => {
    lock();
    setAdminStep('entry');
    navigate('/settings');
  }, [lock, navigate]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

  if (loading || checking) return <Splash theme={theme}/>;

  // Routes explicites pour login/register/forgot-password → rafraîchir la
  // page reste sur l'écran en cours au lieu de retomber sur login.
  if (!user) return (
    <Routes>
      <Route path="/login"           element={<AuthFlow initialScreen="login"/>}/>
      <Route path="/register"        element={<AuthFlow initialScreen="register"/>}/>
      <Route path="/forgot-password" element={<AuthFlow initialScreen="forgot"/>}/>
      <Route path="*"                element={<Navigate to="/login" replace/>}/>
    </Routes>
  );

  if (user.onboardingCompleted === false) {
    return <MerchantOnboarding user={user} onComplete={(token, userData) => { login(token, userData); }}/>;
  }

  if (dataLoading) return <Splash text="Chargement..." theme={theme}/>;

  const settingsContent = () => {
    if (adminStep === 'onboarding') return <PinOnboarding theme={theme} onSetupNow={() => setAdminStep('setup')}/>;
    if (adminStep === 'setup')      return <PinSetup title="Creer votre code PIN Admin" onDone={async pin => { await changePin(pin); setAdminStep('entry'); }}/>;
    if (adminStep === 'entry')      return <PinEntry onSuccess={() => setAdminStep('open')}/>;
    return <Settings transactions={transactions} employees={employees} categories={categories}
      onAddCat={addCat} onUpdCat={updCat} onDelCat={delCat} onReorderCat={reorderCat}
      onAddEmp={addEmp} onUpdEmp={updEmp} onDelEmp={delEmp} onPatchEmp={patchEmp}
      onUpdTx={updTx} onDelTx={delTx} onLock={handleLock}/>;
  };

  const shell = (content) => (
    <div style={{ fontFamily:"'Inter',-apple-system,sans-serif",
                  background:theme.bg, minHeight:'100vh' }}>
      {/* Mobile */}
      <div className="lg:hidden" style={{ minHeight:'100vh' }}>
        <TopBar onHome={() => { handleTab('dashboard'); navigate('/dashboard'); }}
                onLogout={handleLogout} theme={theme} toggle={toggle} isLight={isLight}/>
        {content}
      </div>
      {/* Desktop */}
      <div className="hidden lg:flex" style={{ minHeight:'100vh' }}>
        <DesktopSidebar onHome={() => { handleTab('dashboard'); navigate('/dashboard'); }}
                        onLogout={handleLogout} theme={theme} toggle={toggle} isLight={isLight}/>
        <div className="flex-1 min-w-0 overflow-y-auto" style={{ maxHeight:'100vh' }}>
          {content}
        </div>
      </div>
      <EncaisserSheet open={quickEntryOpen} onClose={() => setQuickEntryOpen(false)}
                      employees={employees} categories={categories} onAdd={addTx}
                      theme={theme} soundCfg={soundCfg}/>
    </div>
  );

  return shell(
    <Routes>
      <Route path="/dashboard"    element={<Dashboard transactions={transactions} employees={employees} categories={categories} onAdd={() => setQuickEntryOpen(true)} onNavigate={handleTab} unreadNotifCount={appUnreadCount}/>}/>
      <Route path="/transactions" element={<Transactions transactions={transactions} employees={employees} categories={categories} onAdd={addTx} onUpdate={updTx} onDelete={delTx} isAdmin={unlocked}/>}/>
      <Route path="/clients"      element={<ClientsPage/>}/>
      <Route path="/agenda"       element={<EmployeeAgenda employees={employees} onTxCreated={tx => setTxs(p => [tx, ...p])}/>}/>
      <Route path="/settings/*"   element={settingsContent()}/>
      <Route path="/settings"     element={settingsContent()}/>
      <Route path="/"             element={<Navigate to="/dashboard" replace/>}/>
      <Route path="*"             element={<Navigate to="/dashboard" replace/>}/>
    </Routes>
  );
}
