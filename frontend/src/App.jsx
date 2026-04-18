// src/App.jsx — Architecture propre, design Stripe/Linear
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useAdmin } from './hooks/useAdmin';
import { useTheme, BRAND } from './hooks/useTheme';
import { useNotifications, playSound } from './hooks/useNotifications';
import { PinEntry, PinSetup } from './components/PinGate';
import AuthFlow, { MerchantOnboarding } from './components/AuthFlow';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import { api, loyaltyApi, promoApi, notifApi } from './utils/api';
import EmployeeAgenda from './pages/EmployeeAgenda';
import ClientsPage from './pages/ClientsPage';
import Agenda from './pages/Agenda';
import { I, ICON_MAP } from './utils/icons';
import { todayStr, nowStr } from './utils/dates';
import { useEmployeePinGate } from './components/EmployeePinModal';

const PM_CFG = {
  cash:     { label:'Especes',  color:'#10b981', bg:'#ecfdf5', Ic: I.Wallet },
  card:     { label:'Carte',    color:'#111827', bg:'#eef2ff', Ic: I.CreditCard },
  transfer: { label:'Virement', color:'#374151', bg:'#ecfeff', Ic: I.Bank },
  other:    { label:'Autre',    color:'#f59e0b', bg:'#fffbeb', Ic: I.MoreH },
};
const fmtN = n => Number(n||0).toFixed(2);

// ── FreePriceModal — saisie montant libre ─────────────────────────────────────
function FreePriceModal({ catName, isCustom, isDark, theme, onCancel, onConfirm }) {
  const [amount, setAmount] = useState('');
  const [name,   setName]   = useState(catName || '');
  const [err,    setErr]    = useState('');
  const inputRef = React.useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

  const confirm = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { setErr('Entrez un montant valide.'); return; }
    // Libellé facultatif — "Autre" par défaut si vide
    onConfirm(isCustom ? (name.trim() || 'Autre') : catName, val);
  };

  const inp = {
    width:'100%', padding:'12px 14px', borderRadius:12, outline:'none',
    background: isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.05)',
    border:`1.5px solid ${isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.15)'}`,
    color: isDark?'#e6edf3':'#111827', fontSize:14, fontFamily:'inherit', boxSizing:'border-box',
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20,
      background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)' }}
      onClick={e => { if(e.target===e.currentTarget) onCancel(); }}>
      <div style={{ width:'100%', maxWidth:360, borderRadius:20, padding:24,
        background: isDark?'#1c1c28':'#ffffff',
        border:`1px solid ${isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'}`,
        boxShadow:'0 24px 64px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
          <div style={{ width:38, height:38, borderRadius:12, background:'rgba(245,158,11,0.12)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>✏️</div>
          <div>
            <p style={{ fontWeight:800, fontSize:15, color: isDark?'#e6edf3':'#111827', margin:0 }}>
              {isCustom ? 'Montant libre' : catName}
            </p>
            <p style={{ fontSize:11, color: isDark?'#768390':'#9ca3af', margin:0 }}>
              {isCustom ? 'Saisie libre - aucun produit associe' : 'Produit a prix libre'}
            </p>
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {/* Libellé (uniquement pour "Autre / custom") */}
          {isCustom && (
            <div>
              <p style={{ fontSize:11, fontWeight:700, color: isDark?'#768390':'#6b7280', marginBottom:5 }}>Libellé *</p>
              <input
                value={name}
                onChange={e => { setName(e.target.value); setErr(''); }}
                placeholder="Ex : Produit hors liste, Pourboire…"
                style={inp}
              />
            </div>
          )}

          {/* Montant */}
          <div>
            <p style={{ fontSize:11, fontWeight:700, color: isDark?'#768390':'#6b7280', marginBottom:5 }}>Montant *</p>
            <div style={{ position:'relative' }}>
              <input
                ref={inputRef}
                type="number" step="0.01" min="0.01"
                value={amount}
                onChange={e => { setAmount(e.target.value); setErr(''); }}
                onKeyDown={e => e.key === 'Enter' && confirm()}
                placeholder="0.00"
                style={{ ...inp, paddingRight:36, fontSize:22, fontWeight:800, fontFamily:'monospace',
                  textAlign:'right', color:'#f59e0b' }}
              />
              <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)',
                fontSize:16, fontWeight:700, color:'#f59e0b', pointerEvents:'none' }}>€</span>
            </div>
          </div>

          {err && <p style={{ fontSize:12, color:'#ef4444', fontWeight:600 }}>{err}</p>}

          {/* Actions */}
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button onClick={onCancel}
              style={{ flex:1, padding:'12px', borderRadius:12, border:`1px solid ${isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.12)'}`,
                background:'transparent', color: isDark?'#768390':'#6b7280', fontWeight:700, fontSize:13, cursor:'pointer' }}>
              Annuler
            </button>
            <button onClick={confirm}
              style={{ flex:2, padding:'12px', borderRadius:12, border:'none',
                background:'linear-gradient(135deg,#f59e0b,#f97316)',
                color:'white', fontWeight:800, fontSize:13, cursor:'pointer',
                boxShadow:'0 4px 14px rgba(245,158,11,0.35)' }}>
              ➕ Ajouter au panier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EncaisserSheet ────────────────────────────────────────────────────────────
function EncaisserSheet({ open, onClose, employees, categories, onAdd, theme, soundCfg: sc = {} }) {
  const isDark = theme.mode === 'dark';
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
  const [promoErr, setPromoErr]   = useState('');
  const [promoLoad, setPromoLoad] = useState(false);
  const [clientNote, setClientNote]   = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientName, setClientName]   = useState('');
  const [clientSearch, setClientSearch]       = useState('');
  const [clientSuggests, setClientSuggests]   = useState([]);
  const [clientSearchBusy, setClientSearchBusy] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [editPrice, setEditPrice] = useState(null);
  const [openCat, setOpenCat]   = useState(null);
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
      }, 300);
    }
  }, [open]);

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
      const res = await promoApi.check({ code: promoCode.trim(), amount: total, client_email: clientEmail.trim() || undefined });
      if (res.valid) { setPromoData(res); setPromoErr(''); }
      else { setPromoData(null); setPromoErr(res.error || 'Code invalide'); }
    } catch(e) { setPromoErr(e.message || 'Impossible de verifier le code'); }
    finally { setPromoLoad(false); }
  };

  const [freePriceModal, setFreePriceModal] = useState(null); // null | { cat } | { custom: true }

  const addToCart = (cat) => {
    // Produit à montant libre → ouvrir le modal de saisie
    if (cat.is_free_price) { setFreePriceModal({ cat }); return; }
    const price = parseFloat(cat.price) || 0;
    setCart(prev => {
      const idx = prev.findIndex(i => i.category_id === cat.id);
      if (idx >= 0) { const next=[...prev]; next[idx]={...next[idx],qty:next[idx].qty+1}; return next; }
      return [...prev, { category_id:cat.id, name:cat.name, price, qty:1, icon:cat.icon, color:cat.color, is_free_price:true }];
    });
  };
  const removeFromCart = idx => setCart(prev => prev.filter((_,i) => i!==idx));
  const changeQty = (idx, delta) => setCart(prev => {
    const next=[...prev]; const nq=next[idx].qty+delta;
    if (nq<=0) return prev.filter((_,i) => i!==idx);
    next[idx]={...next[idx],qty:nq}; return next;
  });
  const setPriceForItem = (idx, val) => setCart(prev => {
    const next=[...prev]; next[idx]={...next[idx],price:parseFloat(val)||0}; return next;
  });

  // Construire payments[] à partir du mode split ou du mode simple
  const buildPayments = () => {
    if (!splitMode) return [{ method: payMethod, amount: finalTotal }];
    const entries = Object.entries(splitAmts)
      .map(([method, raw]) => ({ method, amount: parseFloat(raw) || 0 }))
      .filter(p => p.amount > 0);
    return entries;
  };
  const paymentsPreview = buildPayments();
  const paymentsSum     = paymentsPreview.reduce((s,p)=>s+p.amount, 0);
  const paymentsValid   = !splitMode || Math.abs(paymentsSum - finalTotal) < 0.01;

  const doConfirm = async () => {
    if (cart.length===0 || busy) return;
    if (!paymentsValid) return;
    setBusy(true);
    try {
      const desc = cart.length===1 ? (cart[0].qty>1?`${cart[0].name} ×${cart[0].qty}`:cart[0].name)
        : cart.map(i=>i.qty>1?`${i.name} ×${i.qty}`:i.name).join(', ');
      const items = cart.map(i => ({
        service_name: i.name,
        qty: i.qty,
        unit_price: parseFloat((i.price).toFixed(2)),
      }));
      const payments = paymentsPreview;
      const primaryMethod = payments.length === 1 ? payments[0].method : payMethod;
      await onAdd({
        type:'revenue', amount:finalTotal,
        category_id: cart.length===1 ? cart[0].category_id : null,
        employee_id: empId || null,
        payment_method: primaryMethod,
        payments,
        items,
        description: desc,
        date, time,
        datetime_iso: new Date(`${date}T${time}`).toISOString(),
        promo_code_id: promoData?.promo?.id || null,
        discount_amount: discount || 0,
        original_amount: total,
        client_note: clientNote.trim() || null,
        client_email: clientEmail.trim() || null,
        client_name: clientName.trim() || null,
      });
      setStep('ok');
      if (sc.caisse !== false) playSound('caisse', sc.repeat || 2);
      setTimeout(() => { onClose(); setBusy(false); }, 2000);
    } catch(err) { console.error(err); setBusy(false); }
  };

  const confirm = async () => {
    if (cart.length === 0 || busy) return;
    const emp = employees?.find(e => e.id === empId) || null;
    await requestPin(
      emp,
      'Encaisser le paiement',
      doConfirm
    );
  };

  if (!open) return null;

  const bg    = isDark ? '#1c2128' : '#ffffff';
  const sepBd = isDark ? 'rgba(205,217,229,0.08)' : 'rgba(0,0,0,0.06)';
  const inpStyle = {
    background: isDark ? 'rgba(255,255,255,0.05)' : '#f9f9fb',
    border: `1px solid ${isDark ? 'rgba(205,217,229,0.12)' : 'rgba(0,0,0,0.12)'}`,
    color: isDark ? '#e6edf3' : '#111827',
    borderRadius: 12, padding:'10px 14px', width:'100%', fontSize:14, fontFamily:'inherit', outline:'none',
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4">
      <div onClick={onClose} className="absolute inset-0"
        style={{ background:'rgba(0,0,0,0.5)', backdropFilter:'blur(8px)' }} />
      <div className="anim-scaleIn relative w-full flex flex-col"
        style={{ maxWidth:520, maxHeight:'95vh', borderRadius:'20px 20px 0 0', background:bg,
          border:`1px solid ${isDark ? 'rgba(205,217,229,0.1)' : 'rgba(0,0,0,0.08)'}`,
          boxShadow: isDark ? '0 32px 80px rgba(0,0,0,0.7)' : '0 20px 60px rgba(0,0,0,0.14)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom:`1px solid ${sepBd}` }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background:isDark?'rgba(245,158,11,0.1)':'#fffbeb', border:`1px solid ${isDark?'rgba(245,158,11,0.3)':'#fde68a'}` }}>
              <I.Zap style={{ width:16, height:16, color:'#f59e0b' }} />
            </div>
            <div>
              <p className="font-semibold text-base" style={{ color: isDark ? '#e6edf3' : '#111827' }}>Encaisser</p>
              <p className="text-xs" style={{ color: isDark ? '#768390' : '#9CA3AF' }}>Saisie rapide</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setDtOpen(v=>!v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6',
                color: isDark ? '#adbac7' : '#6B7280',
                border:`1px solid ${isDark?'rgba(205,217,229,0.1)':'rgba(0,0,0,0.08)'}` }}>
              <I.Clock style={{ width:10, height:10 }} />
              {date===todayStr()?'Auj.':date} {time}
            </button>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
              style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6',
                color: isDark ? '#768390' : '#6B7280' }}>✕</button>
          </div>
        </div>

        {/* Date/heure */}
        {dtOpen && (
          <div className="grid grid-cols-2 gap-3 px-5 py-3 flex-shrink-0"
            style={{ borderBottom:`1px solid ${sepBd}`,
              background: isDark ? 'rgba(255,255,255,0.02)' : '#fafafa' }}>
            {[['Date','date',date,setDate],['Heure','time',time,setTime]].map(([lbl,t,v,set]) => (
              <div key={t}>
                <p className="text-xs font-medium mb-1.5" style={{ color: isDark ? '#adbac7' : '#6B7280' }}>{lbl}</p>
                <input type={t} value={v} onChange={e=>set(e.target.value)} style={inpStyle} />
              </div>
            ))}
          </div>
        )}

        {/* Corps */}
        <div className="overflow-y-auto flex-1 p-5">

          {/* ── Succès ── */}
          {step==='ok' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background:'#ecfdf5', border:'2px solid #a7f3d0' }}>
                <I.Check style={{ width:28, height:28, color:'#10b981' }} />
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold mono" style={{ color: isDark ? '#e6edf3' : '#111827' }}>{fmtN(finalTotal)} €</p>
                {promoData && <p className="text-sm mt-1" style={{ color:'#10b981' }}>dont remise -{fmtN(discount)} €</p>}
                <p className="text-sm mt-1" style={{ color: isDark ? '#768390' : '#6B7280' }}>Encaissement enregistré</p>
              </div>
            </div>
          )}

          {/* ── Produits ── */}
          {step==='products' && (<>
            {/* Panier */}
            {cart.length > 0 && (
              <div className="mb-4 rounded-xl overflow-hidden"
                style={{ border:`1px solid ${isDark?'rgba(17,24,39,0.2)':BRAND.primaryBd}`,
                  background: isDark?'rgba(17,24,39,0.06)':BRAND.primaryBg }}>
                <div className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom:`1px solid ${isDark?'rgba(17,24,39,0.15)':'rgba(17,24,39,0.15)'}` }}>
                  <span className="text-xs font-semibold" style={{ color: BRAND.primary }}>Panier · {cart.length} article{cart.length>1?'s':''}</span>
                  <span className="text-base font-bold mono" style={{ color: isDark?'#e6edf3':'#111827' }}>{fmtN(total)} €</span>
                </div>
                {cart.map((item, idx) => {
                  const CIc = ICON_MAP[item.icon];
                  const isEditing = editPrice?.idx===idx;
                  return (
                    <div key={idx} className="flex items-center gap-3 px-4 py-2.5"
                      style={{ borderBottom: idx<cart.length-1?`1px solid rgba(17,24,39,0.08)`:'none' }}>
                      <div className="flex items-center justify-center rounded-lg flex-shrink-0"
                        style={{ width:30,height:30, background: isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.05)' }}>
                        {CIc ? <CIc style={{ width:13,height:13,color:item.color||BRAND.primary }} /> : <I.Zap style={{ width:13,height:13,color:'#f59e0b' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: isDark?'#e6edf3':'#111827' }}>{item.name}</p>
                        {isEditing ? (
                          <input autoFocus type="number" step="0.01" min="0" value={editPrice.val}
                            onChange={e=>setEditPrice(x=>({...x,val:e.target.value}))}
                            onBlur={()=>{setPriceForItem(idx,editPrice.val);setEditPrice(null);}}
                            onKeyDown={e=>{if(e.key==='Enter'||e.key==='Escape'){setPriceForItem(idx,editPrice.val);setEditPrice(null);}}}
                            style={{ width:64,padding:'2px 6px',borderRadius:6,border:`1px solid ${BRAND.primary}`,
                              background:BRAND.primaryBg,color:BRAND.primary,fontSize:12,fontWeight:600,outline:'none',fontFamily:'monospace' }} />
                        ) : (
                          <button onClick={()=>setEditPrice({idx,val:String(item.price)})}
                            className="text-xs font-medium"
                            style={{ color: BRAND.primary, background:'none', border:'none', cursor:'pointer', padding:0 }}>
                            {fmtN(item.price)} €
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={()=>changeQty(idx,-1)}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
                          style={{ background: isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.07)', color: isDark?'#e6edf3':'#374151' }}>−</button>
                        <span className="text-sm font-semibold mono w-4 text-center" style={{ color: isDark?'#e6edf3':'#111827' }}>{item.qty}</span>
                        <button onClick={()=>changeQty(idx,+1)}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
                          style={{ background:BRAND.primaryBg, color:BRAND.primary }}>+</button>
                        <button onClick={()=>removeFromCart(idx)}
                          className="w-6 h-6 rounded-md flex items-center justify-center ml-1"
                          style={{ background:isDark?'rgba(239,68,68,0.1)':'#fef2f2' }}>
                          <I.Trash style={{ width:11,height:11,color:'#ef4444' }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Catalogue */}
            <p className="text-xs font-medium mb-3" style={{ color: isDark?'#768390':'#9CA3AF' }}>
              {cart.length===0 ? 'Selectionner des services / produits' : "Ajouter d'autres articles"}
            </p>
            <div className="flex flex-col gap-2 mb-5">
              {groups.map((grp, gi) => {
                const hasParent = !!grp.parent;
                const catId     = grp.parent?.id || `solo-${gi}`;
                const isOpen    = openCat===catId || !hasParent;
                const ParIc     = hasParent && ICON_MAP[grp.parent.icon];
                const accent    = grp.parent?.color || BRAND.primary;
                const qtyGrp   = grp.items.reduce((s,it)=>s+(cart.find(c=>c.category_id===it.id)?.qty||0),0);

                return (
                  <div key={gi} className="rounded-xl overflow-hidden"
                    style={{ border:`1px solid ${hasParent?`${accent}25`:isDark?'rgba(205,217,229,0.08)':'rgba(0,0,0,0.07)'}`,
                      background: isDark?'rgba(255,255,255,0.02)':'#fafafa' }}>
                    {hasParent && (
                      <button onClick={()=>setOpenCat(isOpen?null:catId)}
                        className="w-full flex items-center gap-3 px-5 py-4"
                        style={{ background:'transparent',border:'none',cursor:'pointer',textAlign:'left' }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background:`${accent}15` }}>
                          {ParIc ? <ParIc style={{ width:17,height:17,color:accent }} /> : <I.Tag style={{ width:17,height:17,color:accent }} />}
                        </div>
                        <div className="flex-1 text-left">
                          <p style={{ fontSize:20, fontWeight:800, color: accent, margin:0 }}>{grp.parent.name}</p>
                          <p style={{ fontSize:13, color: isDark?'#768390':'#9CA3AF', margin:0 }}>{grp.items.length} service{grp.items.length>1?'s':''}</p>
                        </div>
                        {qtyGrp>0 && (
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                            style={{ background:accent }}>{qtyGrp}</span>
                        )}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"
                          style={{ width:13,height:13,color:isDark?'#768390':'#9CA3AF',
                            transform:isOpen?'rotate(180deg)':'none',transition:'transform 0.2s',flexShrink:0 }}>
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                    )}
                    {isOpen && grp.items.length>0 && (
                      <div style={{ display:'flex', flexDirection:'column', gap:4, padding:hasParent?'0 8px 8px':'0' }}>
                        {grp.items.map(cat => {
                          const CIc    = ICON_MAP[cat.icon];
                          const inCart = cart.find(i=>i.category_id===cat.id);
                          const price  = parseFloat(cat.price)||0;
                          return (
                            <button key={cat.id} onClick={()=>addToCart(cat)}
                              style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px',
                                borderRadius:14, textAlign:'left', cursor:'pointer',
                                border:`1px solid ${inCart?BRAND.primary:isDark?'rgba(205,217,229,0.08)':'rgba(0,0,0,0.07)'}`,
                                background: inCart?BRAND.primaryBg:(isDark?'rgba(255,255,255,0.03)':'#ffffff') }}>
                              {CIc && (
                                <div style={{ width:40, height:40, borderRadius:11, flexShrink:0,
                                  background:inCart?`${BRAND.primary}18`:`${cat.color||'#6b7280'}15`,
                                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  <CIc style={{ width:18,height:18,color:inCart?BRAND.primary:(cat.color||isDark?'#768390':'#9CA3AF') }} />
                                </div>
                              )}
                              <div style={{ flex:1, minWidth:0 }}>
                                <p style={{ fontSize:18, fontWeight:700, color:inCart?BRAND.primary:(isDark?'#e6edf3':'#111827'),
                                  margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  {cat.name}
                                </p>
                                {cat.is_free_price
                                  ? <span style={{ fontSize:12, fontWeight:700, color:'#f59e0b' }}>Prix libre</span>
                                  : price>0 && <span style={{ fontSize:13, fontWeight:700, color:'#22c55e', fontFamily:'monospace' }}>{fmtN(price)} €</span>
                                }
                              </div>
                              {inCart && (
                                <span style={{ width:22, height:22, borderRadius:99, flexShrink:0,
                                  background:BRAND.primary, color:'white',
                                  display:'flex', alignItems:'center', justifyContent:'center',
                                  fontSize:12, fontWeight:800 }}>
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

            {/* Bouton Autre / Montant libre */}
            <button onClick={() => setFreePriceModal({ custom: true })}
              className="w-full py-2.5 rounded-xl text-sm font-semibold mb-3 flex items-center justify-center gap-2"
              style={{ background: isDark?'rgba(245,158,11,0.10)':'rgba(245,158,11,0.08)', border:`1px dashed rgba(245,158,11,0.45)`, color:'#f59e0b', cursor:'pointer' }}>
              <span style={{ fontSize:15 }}>✏️</span> Autre / Montant libre
            </button>

            <button disabled={cart.length===0} onClick={()=>setStep('employee')}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: cart.length===0?'#e5e7eb':'#1a73e8',
                color: cart.length===0?(isDark?'#545d68':'#9CA3AF'):'white',
                cursor: cart.length===0?'not-allowed':'pointer' }}>
              Continuer · {cart.length>0?`${fmtN(promoData?finalTotal:total)} €`:'Selectionner des articles'}
            </button>

            {/* Modal montant libre */}
            {freePriceModal && (() => {
              const isCustom = !!freePriceModal.custom;
              const cat = freePriceModal.cat || null;
              let _val = '';
              let _name = isCustom ? '' : (cat?.name || '');
              // Utilise un mini-composant inline via un state local simulé via un key trick
              return (
                <FreePriceModal
                  key={isCustom ? 'custom' : cat?.id}
                  catName={_name}
                  isCustom={isCustom}
                  isDark={isDark}
                  theme={theme}
                  onCancel={() => setFreePriceModal(null)}
                  onConfirm={(name, price) => {
                    setCart(prev => [...prev, {
                      category_id: cat?.id || null,
                      name: name || cat?.name || 'Autre',
                      price: parseFloat(price) || 0,
                      qty: 1,
                      icon: cat?.icon || 'Zap',
                      color: cat?.color || '#f59e0b',
                      is_free_price: true,
                    }]);
                    setFreePriceModal(null);
                  }}
                />
              );
            })()}
          </>)}

          {/* ── Employé ── */}
          {step==='employee' && (<>
            <div className="flex items-center justify-between px-4 py-3 rounded-xl mb-5"
              style={{ background: isDark?'rgba(17,24,39,0.08)':BRAND.primaryBg,
                border:`1px solid ${isDark?'rgba(17,24,39,0.2)':BRAND.primaryBd}` }}>
              <span className="text-sm font-medium" style={{ color:BRAND.primary }}>{cart.length} article{cart.length>1?'s':''}</span>
              <span className="text-lg font-bold mono" style={{ color:BRAND.primary }}>{fmtN(promoData?finalTotal:total)} €</span>
            </div>
            <p className="text-xs font-medium text-center mb-4" style={{ color: isDark?'#768390':'#9CA3AF' }}>Quel employé ?</p>
            <div className="flex flex-col gap-2 mb-4">
              {employees.map(emp => {
                const active = empId===emp.id;
                return (
                  <button key={emp.id} onClick={()=>{ setEmpId(emp.id); setStep('payment'); }}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl transition-colors"
                    style={{ border:`1px solid ${active?BRAND.primary:isDark?'rgba(205,217,229,0.1)':'rgba(0,0,0,0.08)'}`,
                      background: active?BRAND.primaryBg:(isDark?'rgba(255,255,255,0.03)':'#fafafa'),
                      cursor:'pointer' }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0"
                      style={{ background: emp.avatar_color||BRAND.primary }}>
                      {emp.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold" style={{ color: active?BRAND.primary:(isDark?'#e6edf3':'#111827') }}>{emp.name}</p>
                      {emp.role && <p className="text-xs" style={{ color: isDark?'#768390':'#9CA3AF' }}>{emp.role}</p>}
                    </div>
                    {active && <I.Check style={{ width:16,height:16,color:BRAND.primary }} />}
                  </button>
                );
              })}
              {/* Employé obligatoire — option "sans employé" supprimée */}
            </div>
            <button onClick={()=>setStep('products')} className="w-full py-2 text-sm" style={{ background:'none',border:'none',color:isDark?'#768390':'#9CA3AF',cursor:'pointer' }}>← Retour</button>
          </>)}

          {/* ── Paiement ── */}
          {step==='payment' && (<>
            <div className="flex items-center justify-between px-4 py-3 rounded-xl mb-5"
              style={{ background:isDark?'rgba(16,185,129,0.08)':'#ecfdf5', border:'1px solid #a7f3d0' }}>
              <div>
                <span className="text-xs font-medium" style={{ color:'#10b981' }}>{cart.length} article{cart.length>1?'s':''}</span>
                {employees.find(e=>e.id===empId) && (
                  <span className="text-xs ml-2" style={{ color:isDark?'#768390':'#9CA3AF' }}>· {employees.find(e=>e.id===empId).name}</span>
                )}
              </div>
              <div className="text-right">
                {promoData && <span className="text-xs line-through block" style={{ color:isDark?'#768390':'#9CA3AF' }}>{fmtN(total)} €</span>}
                <span className="text-xl font-bold mono" style={{ color: promoData?'#10b981':(isDark?'#e6edf3':'#111827') }}>{fmtN(promoData?finalTotal:total)} €</span>
                {promoData && <span className="text-xs block" style={{ color:'#10b981' }}>−{fmtN(discount)} €</span>}
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium" style={{ color: isDark?'#768390':'#9CA3AF' }}>
                {splitMode ? 'Paiement mixte (répartir)' : 'Mode de paiement'}
              </p>
              <button onClick={()=>setSplitMode(v=>!v)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                style={{ background: splitMode?BRAND.primaryBg:(isDark?'rgba(255,255,255,0.06)':'#f3f4f6'),
                  color: splitMode?BRAND.primary:(isDark?'#adbac7':'#6b7280'),
                  border:`1px solid ${splitMode?BRAND.primaryBd:'transparent'}`,
                  cursor:'pointer' }}>
                {splitMode ? '↩ Simple' : '✂ Diviser'}
              </button>
            </div>

            {!splitMode && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                {Object.entries(PM_CFG).map(([v,{label,color,bg,Ic}]) => {
                  const active = payMethod===v;
                  return (
                    <button key={v} onClick={()=>setPay(v)}
                      className="flex flex-col items-center gap-2 py-3 rounded-xl transition-colors"
                      style={{ border:`1px solid ${active?color:'rgba(0,0,0,0.08)'}`,
                        background: active?bg:(isDark?'rgba(255,255,255,0.03)':'#fafafa'), cursor:'pointer' }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: active?`${color}20`:(isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)') }}>
                        <Ic style={{ width:16,height:16,color }} />
                      </div>
                      <span className="text-xs font-medium" style={{ color: active?color:(isDark?'#adbac7':'#374151') }}>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {splitMode && (
              <div className="mb-4 rounded-xl overflow-hidden"
                style={{ border:`1px solid ${isDark?'rgba(205,217,229,0.1)':'rgba(0,0,0,0.08)'}`,
                  background: isDark?'rgba(255,255,255,0.02)':'#fafafa' }}>
                {Object.entries(PM_CFG).map(([v,{label,color,Ic}], i, arr) => {
                  const val = splitAmts[v];
                  const setVal = s => setSplitAmts(prev => ({ ...prev, [v]: s }));
                  const num = parseFloat(val) || 0;
                  return (
                    <div key={v} className="flex items-center gap-3 px-4 py-2.5"
                      style={{ borderBottom: i<arr.length-1?`1px solid ${isDark?'rgba(205,217,229,0.06)':'rgba(0,0,0,0.05)'}`:'none' }}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background:`${color}18` }}>
                        <Ic style={{ width:14,height:14,color }} />
                      </div>
                      <span className="flex-1 text-sm font-medium" style={{ color: isDark?'#e6edf3':'#111827' }}>{label}</span>
                      <div style={{ position:'relative' }}>
                        <input type="number" step="0.01" min="0" placeholder="0.00"
                          value={val}
                          onChange={e=>setVal(e.target.value)}
                          style={{ width:90, padding:'6px 22px 6px 10px', borderRadius:9,
                            border:`1px solid ${num>0?color:(isDark?'rgba(205,217,229,0.12)':'rgba(0,0,0,0.12)')}`,
                            background: isDark?'rgba(255,255,255,0.05)':'#ffffff',
                            color: num>0?color:(isDark?'#e6edf3':'#111827'),
                            fontSize:13, fontWeight:700, fontFamily:'monospace',
                            textAlign:'right', outline:'none' }} />
                        <span style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                          fontSize:11, color: isDark?'#768390':'#9ca3af', pointerEvents:'none' }}>€</span>
                      </div>
                    </div>
                  );
                })}
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderTop:`1px solid ${isDark?'rgba(205,217,229,0.08)':'rgba(0,0,0,0.06)'}`,
                    background: paymentsValid?(isDark?'rgba(16,185,129,0.08)':'#ecfdf5'):(isDark?'rgba(239,68,68,0.08)':'#fef2f2') }}>
                  <span className="text-xs font-semibold" style={{ color: paymentsValid?'#10b981':'#ef4444' }}>
                    {paymentsValid ? '✓ Répartition OK' : `Il manque ${fmtN(finalTotal - paymentsSum)} €`}
                  </span>
                  <span className="text-sm font-bold mono" style={{ color: paymentsValid?'#10b981':'#ef4444' }}>
                    {fmtN(paymentsSum)} / {fmtN(finalTotal)} €
                  </span>
                </div>
              </div>
            )}

            {/* Code promo */}
            {(empId==='' || employees.find(e=>e.id===empId)?.can_use_promo!==false) && (
              <div className="mb-4">
                <div className="flex gap-2">
                  <input placeholder="Code promo (optionnel)" value={promoCode}
                    onChange={e=>{setPromoCode(e.target.value.toUpperCase());setPromoData(null);setPromoErr('');}}
                    onKeyDown={e=>e.key==='Enter'&&checkPromo()}
                    style={{ ...inpStyle, flex:1, textTransform:'uppercase', letterSpacing:'0.05em',
                      borderColor: promoData?'#10b981':promoErr?'#ef4444':undefined }} />
                  <button onClick={checkPromo} disabled={promoLoad||!promoCode.trim()}
                    className="px-4 rounded-xl text-sm font-medium"
                    style={{ background:BRAND.primaryBg,border:`1px solid ${BRAND.primaryBd}`,color:BRAND.primary,cursor:'pointer',flexShrink:0 }}>
                    {promoLoad?'...':'✓'}
                  </button>
                </div>
                {promoData && <p className="text-xs font-medium mt-2" style={{ color:'#10b981' }}>🎉 Remise de {promoData.promo.type==='percent'?`${promoData.promo.value}%`:`${fmtN(promoData.discount)} €`}</p>}
                {promoErr && <p className="text-xs mt-2" style={{ color:'#ef4444' }}>❌ {promoErr}</p>}
              </div>
            )}

            {/* Client */}
            <div className="mb-4">
              <div style={{ position:'relative', marginBottom:8 }}>
                <input placeholder="🔍 Client — nom, email, téléphone…" value={clientSearch}
                  onChange={async e=>{
                    const v=e.target.value; setClientSearch(v);
                    if(v!==(clientName+(clientEmail?' - '+clientEmail:''))) { setClientEmail(''); setClientName(''); }
                    if(v.trim().length<2){setClientSuggests([]);return;}
                    setClientSearchBusy(true);
                    try { const r=await loyaltyApi.searchClients(v); setClientSuggests(r||[]); }
                    catch{ setClientSuggests([]); } finally{ setClientSearchBusy(false); }
                  }}
                  style={{ ...inpStyle }} />
                {clientSuggests.length>0 && (
                  <div className="absolute top-full left-0 right-0 z-10 rounded-xl overflow-hidden mt-1"
                    style={{ background:isDark?'#1c2128':'#ffffff', border:`1px solid ${isDark?'rgba(205,217,229,0.1)':'rgba(0,0,0,0.08)'}`,
                      boxShadow:'0 8px 24px rgba(0,0,0,0.12)', maxHeight:180, overflowY:'auto' }}>
                    {clientSuggests.map((cl,i)=>(
                      <button key={i} onClick={()=>{ setClientEmail(cl.email||''); setClientName(cl.name||''); setClientSearch((cl.name||'')+(cl.email?' - '+cl.email:'')); setClientSuggests([]); }}
                        style={{ width:'100%',padding:'10px 14px',background:'none',border:'none',textAlign:'left',cursor:'pointer',
                          borderBottom:`1px solid ${isDark?'rgba(205,217,229,0.06)':'rgba(0,0,0,0.05)'}` }}>
                        <p style={{ fontSize:13,fontWeight:600,color:isDark?'#e6edf3':'#111827' }}>{cl.name}</p>
                        <p style={{ fontSize:11,color:isDark?'#768390':'#9CA3AF' }}>{cl.email}{cl.phone?' · '+cl.phone:''}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(clientEmail||clientName) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2"
                  style={{ background:'#ecfdf5',border:'1px solid #a7f3d0' }}>
                  <span style={{ fontSize:11,color:'#10b981',fontWeight:600 }}>✓</span>
                  <span style={{ fontSize:12,color:isDark?'#e6edf3':'#111827' }}>{clientName}</span>
                  {clientEmail && <span style={{ fontSize:11,color:'#6B7280' }}>({clientEmail})</span>}
                  <button onClick={()=>{setClientEmail('');setClientName('');setClientSearch('');}}
                    style={{ marginLeft:'auto',background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',fontSize:14 }}>✕</button>
                </div>
              )}
              <textarea placeholder="📝 Note interne (équipe uniquement)" value={clientNote}
                onChange={e=>setClientNote(e.target.value)} rows={2}
                style={{ ...inpStyle, resize:'vertical', lineHeight:1.5 }} />
            </div>

            <button onClick={confirm} disabled={busy || !paymentsValid}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white mb-2"
              style={{ background: paymentsValid ? 'linear-gradient(135deg,#10b981,#059669)' : '#d1d5db',
                boxShadow: paymentsValid ? '0 4px 14px rgba(16,185,129,0.35)' : 'none',
                opacity: busy ? 0.6 : 1,
                cursor: (busy || !paymentsValid) ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Enregistrement...' : !paymentsValid ? `Répartition incomplète` : `Valider · ${fmtN(finalTotal)} €`}
            </button>
            <button onClick={()=>setStep('employee')}
              className="w-full py-2 text-sm" style={{ background:'none',border:'none',color:isDark?'#768390':'#9CA3AF',cursor:'pointer' }}>← Retour</button>
          </>)}
        </div>
      </div>
      {PinModalNode}
    </div>
  );
}

// ── DesktopSidebar ───────────────────────────────────────────────────────────
function DesktopSidebar({ onHome, onLogout, theme, toggle, isLight }) {
  const isDark = theme.mode === 'dark';
  const NavBtn = ({ onClick, label, icon, color, bg, borderColor, danger }) => (
    <button onClick={onClick}
      style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
        padding:'10px 16px', borderRadius:14, border:`1px solid ${borderColor || (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)')}`,
        background: bg || (isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)'),
        cursor:'pointer', transition:'all 0.15s' }}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger
          ? (isDark?'rgba(239,68,68,0.18)':'rgba(239,68,68,0.12)')
          : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.08)');
        e.currentTarget.style.transform = 'translateX(2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = bg || (isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)');
        e.currentTarget.style.transform = 'none';
      }}>
      <div style={{ width:32, height:32, borderRadius:9, flexShrink:0,
        background: danger?'rgba(239,68,68,0.12)':(isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.08)'),
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        {icon}
      </div>
      <span style={{ fontSize:13, fontWeight:700, color: danger?'#ef4444':(color||(isDark?'#e6edf3':'#111827')), whiteSpace:'nowrap' }}>{label}</span>
    </button>
  );

  return (
    <div style={{ width:200, minHeight:'100vh', display:'flex', flexDirection:'column',
      padding:'20px 12px', gap:8, position:'sticky', top:0, height:'100vh', flexShrink:0,
      background: isDark?'#0d1117':'#ffffff',
      borderRight:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.07)'}`,
      boxShadow: isDark?'none':'2px 0 12px rgba(0,0,0,0.04)' }}>

      {/* Logo */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 4px 16px', borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.07)'}`, marginBottom:8 }}>
        <img
          src="/images/logo-app.png"
          alt="FlowIA"
          style={{ width:36, height:36, borderRadius:11, flexShrink:0, objectFit:'contain' }}
        />
        <div>
          <p style={{ fontWeight:800, fontSize:13, color:isDark?'#e6edf3':'#111827', margin:0, lineHeight:1.2 }}>FlowIA</p>
          <p style={{ fontSize:10, color:isDark?'#6b7280':'#9ca3af', margin:0 }}>Gestion pro</p>
        </div>
      </div>

      {/* Bouton Home */}
      <NavBtn onClick={onHome} label="Accueil" icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      }/>

      {/* Toggle dark/light */}
      <button onClick={toggle}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
          padding:'10px 16px', borderRadius:14,
          border:`1px solid ${isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'}`,
          background: isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)',
          cursor:'pointer', transition:'all 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.background = isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)'; }}>
        <div style={{ width:32, height:32, borderRadius:9, flexShrink:0,
          background: isDark?'rgba(251,191,36,0.12)':'rgba(107,114,128,0.1)',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          {isLight
            ? <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:15,height:15}}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:15,height:15}}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>}
        </div>
        <span style={{ fontSize:13, fontWeight:700, color:isDark?'#fbbf24':'#6b7280', whiteSpace:'nowrap' }}>
          {isLight ? 'Mode sombre' : 'Mode clair'}
        </span>
      </button>

      <div style={{ flex:1 }}/>

      {/* Séparateur */}
      <div style={{ height:1, background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.07)', margin:'4px 0' }}/>

      {/* Bouton Déconnexion */}
      <NavBtn onClick={onLogout} label="Déconnexion" danger icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      } bg={isDark?'rgba(239,68,68,0.08)':'rgba(239,68,68,0.05)'} borderColor={isDark?'rgba(239,68,68,0.2)':'rgba(239,68,68,0.15)'}/>
    </div>
  );
}

// ── TopBar — barre mobile avec labels et bouton déconnexion ──────────────────
function TopBar({ onHome, onLogout, theme, toggle, isLight }) {
  const isDark = theme.mode === 'dark';
  return (
    <div style={{ position:'sticky', top:0, zIndex:40, display:'flex', alignItems:'center',
      justifyContent:'space-between', padding:'10px 14px',
      background: isDark?'rgba(13,15,20,0.96)':'rgba(255,255,255,0.96)',
      backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)',
      borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'}`,
      boxShadow: isDark?'none':'0 1px 8px rgba(0,0,0,0.06)' }}>

      {/* Logo */}
      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
        <img src="/images/logo-app.png" alt="FlowIA" style={{ width:30, height:30, borderRadius:9, flexShrink:0, objectFit:'contain' }} />
        <span style={{ fontWeight:800, fontSize:14, color:isDark?'#e6edf3':'#111827' }}>FlowIA</span>
      </div>

      {/* Boutons droite */}
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>

        {/* Toggle dark/light */}
        <button onClick={toggle}
          style={{ display:'flex', alignItems:'center', gap:5,
            padding:'6px 10px', borderRadius:9,
            border:`1px solid ${isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'}`,
            background: isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.04)',
            cursor:'pointer' }}>
          {isLight
            ? <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13}}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13}}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>}
          <span style={{ fontSize:11, fontWeight:700, color:isDark?'#fbbf24':'#6b7280' }}>
            {isLight ? 'Sombre' : 'Clair'}
          </span>
        </button>

        {/* Bouton Home */}
        <button onClick={onHome}
          style={{ display:'flex', alignItems:'center', gap:5,
            padding:'6px 10px', borderRadius:9,
            border:`1px solid ${isDark?'rgba(17,24,39,0.3)':'rgba(17,24,39,0.2)'}`,
            background: isDark?'rgba(17,24,39,0.12)':'rgba(17,24,39,0.08)',
            cursor:'pointer' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13}}>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span style={{ fontSize:11, fontWeight:700, color:'#111827' }}>Accueil</span>
        </button>

        {/* Bouton Déconnexion */}
        <button onClick={onLogout}
          style={{ display:'flex', alignItems:'center', gap:5,
            padding:'6px 10px', borderRadius:9,
            border:`1px solid ${isDark?'rgba(239,68,68,0.25)':'rgba(239,68,68,0.18)'}`,
            background: isDark?'rgba(239,68,68,0.1)':'rgba(239,68,68,0.07)',
            cursor:'pointer' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13}}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span style={{ fontSize:11, fontWeight:700, color:'#ef4444' }}>Déconnexion</span>
        </button>
      </div>
    </div>
  );
}


// ── Splash ────────────────────────────────────────────────────────────────────
function Splash({ text = 'Chargement...', theme }) {
  const isDark = theme?.mode === 'dark';
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5"
      style={{ background: isDark ? '#111318' : '#f7f7f9' }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: isDark ? '#1c2128' : '#ffffff',
          border: `1px solid ${isDark ? 'rgba(205,217,229,0.1)' : 'rgba(0,0,0,0.08)'}`,
          boxShadow: '0 4px 16px rgba(17,24,39,0.15)' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:28,height:28}}>
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-lg font-bold" style={{ color: isDark ? '#e6edf3' : '#111827' }}>FlowIA</p>
        <p className="text-sm mt-1" style={{ color: isDark ? '#768390' : '#9CA3AF' }}>{text}</p>
      </div>
      <div className="w-5 h-5 rounded-full border-2 border-t-indigo-500 animate-spin"
        style={{ borderColor: 'rgba(17,24,39,0.2)', borderTopColor: '#111827' }} />
    </div>
  );
}

// ── PinOnboarding ─────────────────────────────────────────────────────────────
function PinOnboarding({ onSetupNow, theme }) {
  const isDark = theme.mode === 'dark';
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 pb-32"
      style={{ background: isDark ? '#111318' : '#f7f7f9' }}>
      <div className="w-full max-w-xs text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: isDark ? '#1c2128' : '#fffbeb',
            border: '1px solid #fde68a',
            boxShadow: '0 4px 16px rgba(245,158,11,0.2)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:28,height:28}}>
            <rect x="3" y="11" width="18" height="11" rx="2.5"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: isDark?'#e6edf3':'#111827' }}>Bienvenue !</h1>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: isDark?'#768390':'#6B7280' }}>
          Créez un code PIN à 4 chiffres pour protéger votre espace administrateur.
        </p>
        <div className="flex flex-col gap-2.5 mb-6">
          {[['🔐','Sécurise','Données protégees par votre PIN'],['⚡','Instantane','4 chiffres pour acceder'],['🔄','Flexible','Modifiable dans les reglages']].map(([ico,t,d]) => (
            <div key={t} className="flex items-center gap-3 px-4 py-3 rounded-xl text-left"
              style={{ background: isDark?'rgba(255,255,255,0.03)':'#ffffff',
                border:`1px solid ${isDark?'rgba(205,217,229,0.08)':'rgba(0,0,0,0.07)'}` }}>
              <span className="text-lg">{ico}</span>
              <div>
                <p className="text-sm font-medium" style={{ color: isDark?'#e6edf3':'#111827' }}>{t}</p>
                <p className="text-xs" style={{ color: isDark?'#768390':'#9CA3AF' }}>{d}</p>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onSetupNow}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white"
          style={{ background: '#f59e0b', boxShadow:'0 4px 16px rgba(245,158,11,0.3)', border:'none', cursor:'pointer' }}>
          Créer mon code PIN →
        </button>
        <p className="text-xs mt-3" style={{ color: isDark?'#545d68':'#D1D5DB' }}>Obligatoire pour l'espace Admin</p>
      </div>
    </div>
  );
}

// ── NotificationCenter ────────────────────────────────────────────────────────
function NotificationCenter({ theme }) {
  const isDark = theme.mode === 'dark';
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);
  const {
    notifications, unreadCount,
    pushSupported, pushEnabled,
    enablePush, disablePush,
    markRead, markAllRead, deleteNotif,
    reload,
  } = useNotifications({ enabled: true });

  // soundCfg géré par App() et passé en prop

  // Fermer en cliquant dehors
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (drawerRef.current && !drawerRef.current.contains(e.target)) setOpen(false); };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const TYPE_CFG = {
    new_appointment:      { icon: '📅', color: '#111827', label: 'Nouveau RDV' },
    appointment_reminder: { icon: '⏰', color: '#f59e0b', label: 'Rappel RDV' },
    caisse:               { icon: '🧾', color: '#10b981', label: 'Caisse' },
  };

  const fmtTime = (iso) => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000)   return 'À l\'instant';
    if (diff < 3600000) return `Il y a ${Math.floor(diff/60000)} min`;
    if (diff < 86400000)return `Il y a ${Math.floor(diff/3600000)}h`;
    return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
  };

  return (
    <div style={{ position:'relative' }} ref={drawerRef}>
      {/* Bouton cloche */}
      <button
        onClick={() => { setOpen(p => !p); if (!open) reload(); }}
        style={{ position:'relative', width:36, height:36, borderRadius:10, background:open?(isDark?'rgba(17,24,39,0.2)':'rgba(17,24,39,0.1)'):(isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)'), border:`1px solid ${open?'rgba(17,24,39,0.3)':theme.border}`, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:16, height:16, color: open?'#111827':theme.muted }}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{ position:'absolute', top:-4, right:-4, minWidth:16, height:16, borderRadius:8, background:'#ef4444', color:'white', fontSize:9, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', border:'2px solid '+(isDark?'#0d1117':'#fff') }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Drawer notifications */}
      {open && (
        <div style={{ position:'absolute', top:44, right:0, width:340, maxWidth:'calc(100vw - 32px)', background:isDark?'#161620':'#fff', borderRadius:20, border:`1px solid ${theme.border}`, boxShadow:'0 20px 60px rgba(0,0,0,0.25)', zIndex:1000, overflow:'hidden' }}>
          {/* Header du drawer */}
          <div style={{ padding:'14px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontWeight:800, fontSize:14, color:theme.text }}>Notifications {unreadCount>0 && <span style={{ marginLeft:6, padding:'2px 7px', borderRadius:99, background:'rgba(239,68,68,0.1)', color:'#ef4444', fontSize:11 }}>{unreadCount} non lues</span>}</span>
            <div style={{ display:'flex', gap:6 }}>
              {unreadCount > 0 && (
                <button onClick={markAllRead} style={{ fontSize:11, color:theme.muted, background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Tout lire</button>
              )}
              {pushSupported && (
                <button onClick={pushEnabled ? disablePush : enablePush}
                  style={{ fontSize:11, padding:'3px 8px', borderRadius:8, border:`1px solid ${theme.border}`, background:pushEnabled?'rgba(16,185,129,0.1)':'transparent', color:pushEnabled?'#10b981':theme.muted, fontWeight:700, cursor:'pointer' }}>
                  {pushEnabled ? '🔔 Push ON' : '🔕 Push OFF'}
                </button>
              )}
            </div>
          </div>

          {/* Liste notifications */}
          <div style={{ maxHeight:420, overflowY:'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding:'32px 16px', textAlign:'center' }}>
                <p style={{ fontSize:28, marginBottom:8 }}>🔔</p>
                <p style={{ fontSize:13, color:theme.muted }}>Aucune notification</p>
              </div>
            ) : notifications.map((n) => {
              const cfg = TYPE_CFG[n.type] || { icon:'📌', color:'#64748b', label:n.type };
              return (
                <div key={n.id}
                  style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', gap:10, alignItems:'flex-start', background:n.is_read?'transparent':(isDark?'rgba(17,24,39,0.05)':'rgba(17,24,39,0.03)'), cursor:'pointer', transition:'background .1s' }}
                  onClick={() => !n.is_read && markRead(n.id)}>
                  <div style={{ width:34, height:34, borderRadius:10, background:`${cfg.color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                      {!n.is_read && <span style={{ width:6, height:6, borderRadius:'50%', background:isDark?'#e6edf3':'#111827', flexShrink:0 }} />}
                      <p style={{ margin:0, fontWeight:n.is_read?600:800, fontSize:13, color:theme.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n.title}</p>
                    </div>
                    {n.body && <p style={{ margin:0, fontSize:11, color:theme.muted, lineHeight:1.4 }}>{n.body}</p>}
                    <p style={{ margin:'4px 0 0', fontSize:10, color:theme.dim }}>{fmtTime(n.created_at)}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteNotif(n.id); }}
                    style={{ width:22, height:22, borderRadius:6, background:'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', color:'#ef4444', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading, logout, login }                                = useAuth();
  const { unlocked, hasPin, checking, changePin, lock, checkSession } = useAdmin();
  const { theme, toggle, isLight }                                     = useTheme();
  const navigate   = useNavigate();
  const location   = useLocation();

  // ── Settings son ───────────────────────────────────────────────────────────
  const [soundCfg, setSoundCfg] = useState({
    caisse: true, new_appointment: true, reminder: true, repeat: 2, rdvBefore: 15
  });
  useEffect(() => {
    if (!user) return;
    notifApi.getSettings().then(s => {
      setSoundCfg({
        caisse:          s.sound_caisse    ?? true,
        new_appointment: s.sound_new_appt  ?? true,
        reminder:        s.sound_reminder  ?? true,
        repeat:          s.sound_repeat    ?? 2,
        rdvBefore:       s.sound_rdv_before ?? 15,
      });
    }).catch(() => {});
  }, [user]);

  // Notifications au niveau App pour partager unreadCount avec le Dashboard
  const { unreadCount: appUnreadCount, notifications: appNotifs } = useNotifications({ enabled: !!user });

  // ── Sons : nouveau RDV ───────────────────────────────────────────────────
  const prevSoundCountRef = useRef(0);
  useEffect(() => {
    const newAppts = (appNotifs || []).filter(n => n.type === 'new_appointment' && !n.is_read);
    if (newAppts.length > prevSoundCountRef.current && soundCfg.new_appointment) {
      playSound('new_appointment', soundCfg.repeat || 2);
    }
    prevSoundCountRef.current = newAppts.length;
  }, [appNotifs, soundCfg]);

  // ── Sons : rappel RDV proche ─────────────────────────────────────────────
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
          const dateStr = typeof a.date === 'string' ? a.date.substring(0,10) : new Date(a.date).toISOString().substring(0,10);
          const timeStr = String(a.start_time).substring(0,5);
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

  // Page courante dérivée de l'URL (pas de state)
  const page = location.pathname.replace(/^\//, '').split('/')[0] || 'dashboard';

  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [adminStep, setAdminStep]     = useState('entry');
  const [transactions, setTxs]        = useState([]);
  const [employees, setEmps]          = useState([]);
  const [categories, setCats]         = useState([]);
  const [dataLoading, setDl]          = useState(false);

  useEffect(() => {
    if (!user) return;
    checkSession();
    setDl(true);
    // Charger les transactions des 3 derniers mois seulement (optimisation)
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
    else if (hasPin === true && !unlocked) { setAdminStep(s => s==='setup'?s:'entry'); }
    else if (hasPin === true && unlocked)  { setAdminStep('open'); }
  }, [hasPin, unlocked, checking, page]);

  useEffect(() => {
    if (!checking && hasPin === false && user) { navigate('/settings', { replace: true }); setAdminStep('onboarding'); }
  }, [hasPin, checking, user]);

  const addTx  = useCallback(async d => { const t = await api.createTransaction(d); setTxs(p=>[t,...p]); }, []);
  const updTx  = useCallback(async (id,d) => { const t = await api.updateTransaction(id,d); setTxs(p=>p.map(x=>x.id===id?t:x)); }, []);
  const delTx  = useCallback(async id => { await api.deleteTransaction(id); setTxs(p=>p.filter(x=>x.id!==id)); }, []);
  const addCat      = useCallback(async d => { const c = await api.createCategory(d); setCats(p=>[...p,c]); }, []);
  const updCat      = useCallback(async (id,d) => { const c = await api.updateCategory(id,d); setCats(p=>p.map(x=>x.id===id?c:x)); }, []);
  const delCat      = useCallback(async id => { await api.deleteCategory(id); setCats(p=>p.filter(x=>x.id!==id)); }, []);
  const reorderCat  = useCallback((reordered) => {
    // Mise à jour optimiste immédiate du state App
    setCats(prev => {
      const ids = new Set(reordered.map(r => r.id));
      const others = prev.filter(c => !ids.has(c.id));
      // reconstruire dans le bon ordre : reordered d'abord, puis le reste
      return [...reordered.map(r => ({...prev.find(c=>c.id===r.id)||r, sort_order:r.sort_order})), ...others];
    });
  }, []);
  const addEmp = useCallback(async d => { const e = await api.createEmployee(d); setEmps(p=>[...p,e]); return e; }, []);
  const updEmp = useCallback(async (id,d) => { const e = await api.updateEmployee(id,d); setEmps(p=>p.map(x=>x.id===id?{...e,has_image:x.has_image}:x)); return e; }, []);
  const delEmp = useCallback(async id => { await api.deleteEmployee(id); setEmps(p=>p.filter(x=>x.id!==id)); }, []);
  const patchEmp = useCallback((id, changes) => setEmps(p=>p.map(x=>x.id===id?{...x,...changes}:x)), []);

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

  if (loading || checking) return <Splash theme={theme} />;

  // Authentification requise pour toutes les routes App (sauf /book/:slug gere dans index.jsx)
  if (!user) return <AuthFlow />;

  // Onboarding obligatoire : si le commercant n'a pas complete son profil (inscription Google)
  if (user.onboardingCompleted === false) {
    return <MerchantOnboarding user={user} onComplete={(token, userData) => {
      login(token, userData);
    }} />;
  }

  if (dataLoading) return <Splash text="Chargement..." theme={theme} />;

  const isDark = theme.mode === 'dark';

  // Contenu de la page Settings avec PIN gates
  const settingsContent = () => {
    if (adminStep === 'onboarding') return <PinOnboarding theme={theme} onSetupNow={() => setAdminStep('setup')} />;
    if (adminStep === 'setup')      return <PinSetup title="Creer votre code PIN Admin" onDone={async pin => { await changePin(pin); setAdminStep('entry'); }} />;
    if (adminStep === 'entry')      return <PinEntry onSuccess={() => setAdminStep('open')} />;
    return <Settings transactions={transactions} employees={employees} categories={categories}
      onAddCat={addCat} onUpdCat={updCat} onDelCat={delCat} onReorderCat={reorderCat}
      onAddEmp={addEmp} onUpdEmp={updEmp} onDelEmp={delEmp} onPatchEmp={patchEmp}
      onUpdTx={updTx} onDelTx={delTx} onLock={handleLock} />;
  };

  const shell = (content) => (
    <div style={{ fontFamily:"'Inter',-apple-system,sans-serif", background: isDark?'#111318':'#f8f9fc', minHeight:'100vh' }}>
      {/* Mobile */}
      <div className="lg:hidden" style={{ minHeight:'100vh' }}>
        <TopBar onHome={() => { handleTab('dashboard'); navigate('/dashboard'); }} onLogout={handleLogout} theme={theme} toggle={toggle} isLight={isLight} />
        {content}
      </div>
      {/* Desktop */}
      <div className="hidden lg:flex" style={{ minHeight:'100vh' }}>
        <DesktopSidebar onHome={() => { handleTab('dashboard'); navigate('/dashboard'); }} onLogout={handleLogout} theme={theme} toggle={toggle} isLight={isLight} />
        <div className="flex-1 min-w-0 overflow-y-auto" style={{ maxHeight:'100vh' }}>
          {content}
        </div>
      </div>
      <EncaisserSheet open={quickEntryOpen} onClose={() => setQuickEntryOpen(false)}
        employees={employees} categories={categories} onAdd={addTx} theme={theme} soundCfg={soundCfg} />
    </div>
  );

  return shell(
    <Routes>
      <Route path="/dashboard"    element={<Dashboard transactions={transactions} employees={employees} categories={categories} onAdd={() => setQuickEntryOpen(true)} onNavigate={handleTab} unreadNotifCount={appUnreadCount} />} />
      <Route path="/transactions" element={<Transactions transactions={transactions} employees={employees} categories={categories} onAdd={addTx} onUpdate={updTx} onDelete={delTx} isAdmin={unlocked} />} />
      <Route path="/clients"      element={<ClientsPage />} />
      <Route path="/agenda"       element={<EmployeeAgenda employees={employees} onTxCreated={tx => setTxs(p=>[tx,...p])} />} />
      <Route path="/settings/*"   element={settingsContent()} />
      <Route path="/settings"     element={settingsContent()} />
      {/* Redirect racine et routes inconnues → dashboard */}
      <Route path="/"             element={<Navigate to="/dashboard" replace />} />
      <Route path="*"             element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}