// src/App.jsx — Racine routing + layout + EncaisserSheet. Refonte visuelle 2026.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useAdmin } from './hooks/useAdmin';
import { useTheme } from './hooks/useTheme';
import { useNotifications, playSound } from './hooks/useNotifications';
import { PinSetup } from './components/PinGate';
import AuthFlow, { MerchantOnboarding } from './components/AuthFlow';
import Dashboard from './pages/Dashboard';
import Historique from './pages/Historique';
import HistoriqueAdmin from './pages/historique';
import Transactions from './pages/Transactions';
// Settings.jsx supprime — l'app est entierement migree vers /reglages.
// Les anciennes URLs /settings* sont redirigees ci-dessous via SettingsRedirect.
import Subscription from './pages/Subscription';
import Reglages from './pages/reglages';
import Marketing from './pages/marketing';
import Statistiques from './pages/statistiques';
import Caisse from './pages/caisse';
import { api, loyaltyApi, promoApi, notifApi, referralsApi } from './utils/api';
import EmployeeAgenda from './pages/EmployeeAgenda';
import ClientsPage from './pages/ClientsPage';
import { I, ICON_MAP } from './utils/icons';
import { todayStr, nowStr } from './utils/dates';
import { useEmployeePinGate } from './components/EmployeePinModal';
import { Button } from './components/primitives';
import { Toast, useToast, Confirm } from './components/UI';
import { Icon } from './components/Icon';
import { TabletModeProvider, useTabletMode } from './contexts/TabletModeProvider';
import { useAdminMode } from './contexts/AdminModeContext';
import WhoEncashesModal from './components/WhoEncashesModal';
import AdminPinModal from './components/AdminPinModal';
import { registerAdminPinHandler, resolveAdminPinPrompt } from './utils/adminPinPrompt';

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
function EncaisserSheet({ open, onClose, employees, categories, onAdd, theme: t, soundCfg: sc = {}, defaultEmpId = '' }) {
  const [cart, setCart]       = useState([]);
  const [step, setStep]       = useState('products');
  const [empId, setEmpId]     = useState(defaultEmpId || '');
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
  // Debounce + seq ID pour annuler les reponses perimees quand l'utilisateur
  // tape vite. Sans ca, une frappe rapide envoyait une requete par caractere
  // (surcharge backend) et les reponses pouvaient arriver dans le desordre.
  const clientSearchSeqRef = useRef(0);
  useEffect(() => {
    const v = clientSearch;
    // Si le champ contient l'affichage d'un client deja selectionne, on ignore.
    if (v === (clientName + (clientEmail ? ' - ' + clientEmail : '')) && clientName) {
      setClientSuggests([]);
      return;
    }
    const trimmed = v.trim();
    // Min 2 caracteres avant requete (sinon ramene quasi toute la base).
    if (trimmed.length < 2) {
      setClientSuggests([]);
      setClientSearchBusy(false);
      return;
    }
    const seq = ++clientSearchSeqRef.current;
    setClientSearchBusy(true);
    const tm = setTimeout(async () => {
      try {
        const r = await loyaltyApi.searchClients(trimmed);
        if (seq !== clientSearchSeqRef.current) return; // perime
        setClientSuggests(r || []);
      } catch {
        if (seq === clientSearchSeqRef.current) setClientSuggests([]);
      } finally {
        if (seq === clientSearchSeqRef.current) setClientSearchBusy(false);
      }
    }, 350);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSearch]);
  const [busy, setBusy]           = useState(false);
  const [editPrice, setEditPrice] = useState(null);
  const [openCat,   setOpenCat]   = useState(null);
  const [pendingRefs,    setPendingRefs]    = useState([]);
  const [clientRewards,  setClientRewards]  = useState([]);
  const [selectedRewardId, setSelectedRewardId] = useState(null);
  const [refValidating,    setRefValidating]    = useState(null);
  const [toast, showToast] = useToast();
  const [confirmCancelRef, setConfirmCancelRef] = useState(null);
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
    } else if (defaultEmpId) {
      // Refonte FDS-2026 commit 11 : pré-sélection employé venant de
      // WhoEncashesModal (mode tablette). Appliqué à l'ouverture uniquement.
      setEmpId(defaultEmpId);
    }
  }, [open, defaultEmpId]);

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
    } catch (e) { showToast(e.message || 'Erreur validation parrainage', 'error'); }
    finally { setRefValidating(null); }
  };

  const cancelReferral = (useId) => setConfirmCancelRef(useId);
  const performCancelReferral = async () => {
    const useId = confirmCancelRef;
    if (!useId) return;
    setRefValidating(useId);
    try {
      await referralsApi.cancelUse(useId);
      await refreshClientContext(clientEmail);
    } catch (e) { showToast(e.message || 'Erreur refus parrainage', 'error'); }
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
    } catch { setBusy(false); }
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
      <Toast msg={toast?.msg} type={toast?.type}/>
      <Confirm
        open={!!confirmCancelRef}
        onClose={() => setConfirmCancelRef(null)}
        onConfirm={performCancelReferral}
        title="Refuser ce parrainage ?"
        message="Le parrain ne sera pas récompensé. La réduction déjà appliquée au RDV reste acquise au filleul."
        danger
        theme={t}/>
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
                       onChange={e => {
                         const v = e.target.value;
                         setClientSearch(v);
                         // Si l'utilisateur efface ou modifie le champ apres avoir selectionne,
                         // on de-selectionne le client courant. La recherche/debounce est
                         // gere par le useEffect dedie sur clientSearch.
                         if (v !== (clientName + (clientEmail ? ' - ' + clientEmail : ''))) {
                           setClientEmail(''); setClientName('');
                         }
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

// ── DesktopSidebar (refonte FDS-2026 commit 15 : bascule simple) ───────────
// Mode normal (isAdminMode=false, défaut) : 3 items Agenda · Caisse · Clients
// + bouton « Convertir en mode admin » qui demande le PIN admin via
// PinAccessModal puis enableAdminMode().
// Mode admin (isAdminMode=true) : sections complètes (PRINCIPAL ·
// CROISSANCE · PARAMÉTRAGE) + badge « Admin » + bouton « Quitter le mode
// admin » (disable direct, sans PIN).
//
// L'état isAdminMode est purement UX (localStorage). pinAdminMiddleware côté
// back reste la barrière de sécurité réelle (les actions sensibles exigent
// toujours le PIN, indépendamment du flag).
//
// Le système commit 11 (user_settings.tablet_mode_enabled, timer 15 min,
// adminBypass) est court-circuité ici : la sidebar n'utilise QUE isAdminMode.
function DesktopSidebar({ user, theme: t, toggle, isLight, onLogout, onRequestAdmin, onQuitAdmin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdminMode } = useAdminMode();

  // Refonte 2026-05-06 : `match[]` débarrassé des préfixes /settings/* legacy.
  // SettingsRedirect (route /settings/*) continue de rediriger les anciens
  // bookmarks, mais aucun item de menu ne pointe plus vers /settings/* — un seul
  // domaine = un seul highlight, pas de double-actif.
  const NAV_SECTIONS = !isAdminMode ? [
    {
      label: 'Quotidien',
      items: [
        { id:'agenda',    label:'Agenda',  icon:'calendar', to:'/agenda',  match:['/agenda'] },
        { id:'caisse',    label:'Caisse',  icon:'cash',     to:'/caisse',  match:['/caisse','/transactions'] },
        { id:'clients',   label:'Clients', icon:'users',    to:'/clients', match:['/clients'] },
      ],
    },
  ] : [
    {
      label: 'Quotidien',
      items: [
        { id:'dashboard', label:'Dashboard',    icon:'home',     to:'/dashboard',   match:['/dashboard'] },
        { id:'agenda',    label:'Agenda',       icon:'calendar', to:'/agenda',      match:['/agenda'] },
        { id:'caisse',    label:'Caisse',       icon:'cash',     to:'/caisse',      match:['/caisse','/transactions'] },
        { id:'clients',   label:'Clients',      icon:'users',    to:'/clients',     match:['/clients'] },
      ],
    },
    {
      label: 'Pilotage',
      items: [
        // Historique admin dédié — page distincte de /caisse/historique (lecture
        // seule jour courant pour les employés). Visible uniquement en admin.
        { id:'historique',label:'Historique',   icon:'history',   to:'/historique',  match:['/historique'] },
        { id:'stats',     label:'Statistiques', icon:'chart',     to:'/statistiques', match:['/statistiques'] },
        { id:'marketing', label:'Marketing',    icon:'megaphone', to:'/marketing',   match:['/marketing'] },
      ],
    },
    {
      label: 'Configuration',
      items: [
        { id:'reglages',   label:'Réglages',   icon:'settings', to:'/reglages',    match:['/reglages'] },
        { id:'abonnement', label:'Abonnement', icon:'wallet',   to:'/abonnement',  match:['/abonnement'] },
      ],
    },
  ];

  // Match actif : exact /pathname === route.to OU pathname commence par l'un
  // des préfixes de `match`. L'ordre des items évite le conflit /reglages vs
  // /settings/marketing (les plus spécifiques sont évalués d'abord via le
  // ranking par longueur de préfixe).
  const activeId = (() => {
    const p = location.pathname;
    let best = { id: null, len: 0 };
    for (const sec of NAV_SECTIONS) {
      for (const it of sec.items) {
        for (const pref of it.match) {
          if (p === pref || p.startsWith(pref + '/') || p === pref + '/') {
            if (pref.length > best.len) best = { id: it.id, len: pref.length };
          }
        }
      }
    }
    return best.id;
  })();

  const sectionLabelStyle = {
    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
    color: t.muted, margin: '14px 10px 4px', fontWeight: 500,
  };

  const NavRow = ({ it }) => {
    const active = activeId === it.id;
    return (
      <button onClick={() => navigate(it.to)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                       padding:'9px 12px', borderRadius:8, border:'none',
                       background: active ? t.card : 'transparent',
                       color: active ? t.text : t.muted,
                       cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                       transition:'background 0.15s ease, color 0.15s ease',
                       borderLeft: active ? "2px solid " + t.text : '2px solid transparent' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = t.cardAlt; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
        <Icon name={it.icon} size={15} color={active ? t.text : t.muted}/>
        <span style={{ fontSize:13, fontWeight: active ? 500 : 400, whiteSpace:'nowrap' }}>
          {it.label}
        </span>
      </button>
    );
  };

  return (
    <div style={{ width:220, minHeight:'100vh', display:'flex', flexDirection:'column',
                  padding:'16px 10px',
                  position:'sticky', top:0, height:'100vh', flexShrink:0,
                  background:t.canvas,
                  borderRight:`0.5px solid ${t.border}` }}>

      {/* Header : logo + nom salon + cloche notifications. Badge orange
          « Admin » uniquement en mode admin pour signaler à l'utilisateur
          l'élévation des droits. */}
      <div style={{ display:'flex', alignItems:'center', gap:10,
                    padding:'4px 6px 14px',
                    borderBottom:`0.5px solid ${t.separator}`,
                    marginBottom:4 }}>
        <img src="/images/logo-app.png" alt="FlowIA"
             style={{ width:34, height:34, borderRadius:8, flexShrink:0, objectFit:'contain' }}/>
        <div style={{ minWidth:0, flex:1 }}>
          <p style={{ fontWeight:500, fontSize:13, color:t.text, margin:0, lineHeight:1.2,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {user?.businessName || 'FlowIA'}
          </p>
          {isAdminMode ? (
            <span style={{ display:'inline-block', marginTop:3,
                           padding:'2px 8px', borderRadius:99,
                           background:'#fff7ed', color:'#9a3412',
                           border:'0.5px solid #fed7aa',
                           fontSize:10, fontWeight:500,
                           textTransform:'uppercase', letterSpacing:'0.04em' }}>
              {"Admin"}
            </span>
          ) : (
            <p style={{ fontSize:11, color:t.muted, margin:0 }}>{"Navigation"}</p>
          )}
        </div>
        {/* Cloche notifications globale : visible sur toutes les pages
            desktop (employes inclus). Badge rouge = nb non lues, clic = drawer
            qui s'ouvre vers la droite (sidebar collee a gauche de l'ecran). */}
        <NotificationCenter theme={t} drawerSide="left" />
      </div>

      {NAV_SECTIONS.map((sec, i) => (
        <div key={i}>
          <div style={sectionLabelStyle}>{sec.label}</div>
          {sec.items.map(it => <NavRow key={it.id} it={it}/>)}
        </div>
      ))}

      <div style={{ flex:1 }}/>

      <div style={{ paddingTop:10, borderTop:`0.5px solid ${t.separator}`, display:'flex', flexDirection:'column', gap:2 }}>
        {/* Bouton de bascule mode admin : pleine largeur, bien visible.
            « Convertir » en mode normal = ouvre PinAccessModal admin.
            « Quitter » en mode admin = bascule directe sans PIN. */}
        {!isAdminMode ? (
          <button onClick={() => onRequestAdmin && onRequestAdmin()}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                           padding:'10px 12px', borderRadius:8, marginBottom:6,
                           border:`0.5px solid ${t.border}`,
                           background: t.cardAlt, color: t.text,
                           cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                           transition:'background 0.15s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = t.card; }}
                  onMouseLeave={e => { e.currentTarget.style.background = t.cardAlt; }}>
            <Icon name="lock" size={14} color={t.text}/>
            <span style={{ fontSize:12, fontWeight:500, whiteSpace:'nowrap' }}>
              {"Convertir en mode admin"}
            </span>
          </button>
        ) : (
          <button onClick={() => onQuitAdmin && onQuitAdmin()}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                           padding:'10px 12px', borderRadius:8, marginBottom:6,
                           border:'0.5px solid #fed7aa',
                           background:'#fff7ed', color:'#9a3412',
                           cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                           transition:'background 0.15s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ffedd5'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff7ed'; }}>
            <Icon name="logout" size={14} color="#9a3412"/>
            <span style={{ fontSize:12, fontWeight:500, whiteSpace:'nowrap' }}>
              {"Quitter le mode admin"}
            </span>
          </button>
        )}

        <button onClick={toggle}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                         padding:'9px 12px', borderRadius:8, border:'none',
                         background:'transparent', color:t.muted,
                         cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                         transition:'background 0.15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background = t.cardAlt; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
          <Icon name={isLight ? 'moon' : 'sun'} size={15} color={t.muted}/>
          <span style={{ fontSize:13, fontWeight:400, whiteSpace:'nowrap' }}>
            {isLight ? 'Mode sombre' : 'Mode clair'}
          </span>
        </button>
        <button onClick={onLogout}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                         padding:'9px 12px', borderRadius:8, border:'none',
                         background:'transparent', color:'#991b1b',
                         cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                         transition:'background 0.15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
          <Icon name="logout" size={15} color="#991b1b"/>
          <span style={{ fontSize:13, fontWeight:400, whiteSpace:'nowrap' }}>{"Déconnexion"}</span>
        </button>
      </div>
    </div>
  );
}

// ── BottomNav mobile (refonte FDS-2026 commit 15) ──────────────────────────
// Mode normal (3+1 items) : Agenda · Caisse · Clients · Plus
// Mode admin (4+1 items)  : Dashboard · Agenda · Caisse · Clients · Plus
// Menu « Plus » :
//   - normal : Convertir en admin · Mode sombre · Déconnexion
//   - admin  : Historique · Marketing · Statistiques · Réglages · Quitter mode admin · Mode sombre · Déconnexion
function BottomNav({ theme: t, toggle, isLight, onLogout, onRequestAdmin, onQuitAdmin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdminMode } = useAdminMode();
  const [plusOpen, setPlusOpen] = useState(false);

  const ITEMS = isAdminMode ? [
    { id:'home',    label:'Home',    icon:'home',     to:'/dashboard', match:['/dashboard'] },
    { id:'agenda',  label:'Agenda',  icon:'calendar', to:'/agenda',    match:['/agenda'] },
    { id:'caisse',  label:'Caisse',  icon:'cash',     to:'/caisse',    match:['/caisse','/transactions'] },
    { id:'clients', label:'Clients', icon:'users',    to:'/clients',   match:['/clients'] },
  ] : [
    { id:'agenda',  label:'Agenda',  icon:'calendar', to:'/agenda',    match:['/agenda'] },
    { id:'caisse',  label:'Caisse',  icon:'cash',     to:'/caisse',    match:['/caisse','/transactions'] },
    { id:'clients', label:'Clients', icon:'users',    to:'/clients',   match:['/clients'] },
  ];

  const activeId = (() => {
    const p = location.pathname;
    let best = { id:null, len:0 };
    for (const it of ITEMS) {
      for (const pref of it.match) {
        if (p === pref || p.startsWith(pref + '/')) {
          if (pref.length > best.len) best = { id: it.id, len: pref.length };
        }
      }
    }
    return best.id;
  })();

  const navItemStyle = (active) => ({
    flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
    gap:3, padding:'6px 2px', border:'none', background:'transparent', cursor:'pointer',
    color: active ? t.text : t.muted, fontFamily:'inherit',
  });

  return (
    <>
      <nav style={{ position:'fixed', left:0, right:0, bottom:0, zIndex:30,
                    display:'flex', alignItems:'stretch',
                    background: t.canvas,
                    borderTop: `0.5px solid ${t.border}`,
                    paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
        {ITEMS.map(it => {
          const active = activeId === it.id;
          return (
            <button key={it.id} onClick={() => navigate(it.to)} style={navItemStyle(active)}>
              <Icon name={it.icon} size={18} color={active ? t.text : t.muted}/>
              <span style={{ fontSize:10, fontWeight: active ? 500 : 400 }}>{it.label}</span>
            </button>
          );
        })}
        <button onClick={() => setPlusOpen(true)} style={navItemStyle(false)}>
          <Icon name="more" size={18} color={t.muted}/>
          <span style={{ fontSize:10, fontWeight:400 }}>Plus</span>
        </button>
      </nav>

      {plusOpen && (
        <div onClick={() => setPlusOpen(false)}
             style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(0,0,0,0.45)',
                      backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-end' }}>
          <div onClick={e => e.stopPropagation()}
               style={{ width:'100%', background:t.canvas,
                        borderTopLeftRadius:16, borderTopRightRadius:16,
                        borderTop:`0.5px solid ${t.border}`,
                        padding:'12px 14px 20px',
                        paddingBottom:'calc(20px + env(safe-area-inset-bottom, 0))',
                        display:'flex', flexDirection:'column', gap:2 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                          padding:'2px 6px 10px' }}>
              <span style={{ fontSize:12, fontWeight:500, color:t.muted,
                             textTransform:'uppercase', letterSpacing:'0.05em' }}>Plus</span>
              <button onClick={() => setPlusOpen(false)}
                      style={{ border:'none', background:'transparent', cursor:'pointer',
                               padding:6, color:t.muted, fontFamily:'inherit' }}>
                <Icon name="x" size={16} color={t.muted}/>
              </button>
            </div>
            {isAdminMode && [
              { label:'Historique',   icon:'history',   to:'/historique'   },
              { label:'Marketing',    icon:'megaphone', to:'/marketing'    },
              { label:'Statistiques', icon:'chart',     to:'/statistiques' },
              { label:'Réglages',     icon:'settings',  to:'/reglages'     },
            ].map(it => (
              <button key={it.to}
                      onClick={() => { setPlusOpen(false); navigate(it.to); }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
                               padding:'12px', borderRadius:10, border:'none',
                               background:'transparent', color:t.text,
                               cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
                <Icon name={it.icon} size={16} color={t.muted}/>
                <span style={{ flex:1, fontSize:13, fontWeight:500 }}>{it.label}</span>
                <Icon name="chevronRight" size={14} color={t.muted}/>
              </button>
            ))}
            {isAdminMode && (
              <div style={{ height:'0.5px', background:t.separator, margin:'6px 6px' }}/>
            )}
            {/* Bascule mode admin (cohérent avec sidebar desktop). */}
            {!isAdminMode ? (
              <button onClick={() => { setPlusOpen(false); onRequestAdmin && onRequestAdmin(); }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
                               padding:'12px', borderRadius:10,
                               border:`0.5px solid ${t.border}`,
                               background:t.cardAlt, color:t.text,
                               cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                               marginBottom:6 }}>
                <Icon name="lock" size={16} color={t.text}/>
                <span style={{ flex:1, fontSize:13, fontWeight:500 }}>
                  {"Convertir en mode admin"}
                </span>
              </button>
            ) : (
              <button onClick={() => { setPlusOpen(false); onQuitAdmin && onQuitAdmin(); }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
                               padding:'12px', borderRadius:10,
                               border:'0.5px solid #fed7aa',
                               background:'#fff7ed', color:'#9a3412',
                               cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                               marginBottom:6 }}>
                <Icon name="logout" size={16} color="#9a3412"/>
                <span style={{ flex:1, fontSize:13, fontWeight:500 }}>
                  {"Quitter le mode admin"}
                </span>
              </button>
            )}
            <div style={{ height:'0.5px', background:t.separator, margin:'6px 6px' }}/>
            <button onClick={() => { toggle(); }}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
                             padding:'12px', borderRadius:10, border:'none',
                             background:'transparent', color:t.text,
                             cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
              <Icon name={isLight ? 'moon' : 'sun'} size={16} color={t.muted}/>
              <span style={{ flex:1, fontSize:13, fontWeight:500 }}>
                {isLight ? 'Mode sombre' : 'Mode clair'}
              </span>
            </button>
            <button onClick={() => { setPlusOpen(false); onLogout(); }}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:12,
                             padding:'12px', borderRadius:10, border:'none',
                             background:'transparent', color:'#991b1b',
                             cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
              <Icon name="logout" size={16} color="#991b1b"/>
              <span style={{ flex:1, fontSize:13, fontWeight:500 }}>{"Déconnexion"}</span>
            </button>
          </div>
        </div>
      )}
    </>
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
        {/* Cloche notifications globale : visible sur toutes les pages mobiles
            (employes inclus). Badge rouge = nb non lues, clic = drawer. */}
        <NotificationCenter theme={t} />
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
// FDS-2026 : icônes Lucide (I.*), pastels + borderLeft 2px par type, employé
// concerné + date + heure affichés en grand pour lecture rapide. Types
// différenciés visuellement (Nouveau RDV = info indigo, Rappel = warning
// ambre, Caisse = success vert).
const NOTIF_TYPE_CFG = {
  new_appointment:      { Icon: I.Calendar, label: 'Nouveau RDV', bg: '#eef2ff', accent: '#6366f1', text: '#4338ca' },
  appointment_reminder: { Icon: I.Clock,    label: 'Rappel RDV',  bg: '#fffbeb', accent: '#f59e0b', text: '#92400e' },
  caisse:               { Icon: I.Wallet,   label: 'Caisse',      bg: '#f0fdf4', accent: '#10b981', text: '#065f46' },
};

// Retire un emoji de tête éventuel (lignes DB historiques, avant FDS-2026).
const stripLeadingEmoji = (s = '') =>
  String(s).replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*(?:—\s*)?/u, '').trim();

// Format date relative humaine pour le RDV (Aujourd'hui / Demain / Lun 22 avr).
const fmtApptDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0)  return "Aujourd'hui";
  if (diff === 1)  return 'Demain';
  if (diff === -1) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
};

const fmtRelative = (iso) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000)    return "A l'instant";
  if (diff < 3600000)  return `Il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

function NotifCard({ n, t, cfg, onOpen, onDelete, compact = false }) {
  const d       = n.data || {};
  const empName = d.employee_name || null;
  const dateStr = fmtApptDate(d.appt_date);
  const timeStr = d.start_time || '';
  const hasRich = !!(empName || dateStr || timeStr);
  const Icon    = cfg.Icon;
  const pad     = compact ? '12px 14px' : '14px 16px';
  const iconSz  = compact ? 36 : 40;
  const nameSz  = compact ? 15 : 16;
  const timeSz  = compact ? 18 : 20;
  const dateSz  = compact ? 13 : 14;

  return (
    <div
      onClick={() => onOpen(n)}
      style={{
        margin: compact ? '8px 12px' : '10px 14px',
        padding: pad,
        borderRadius: 8,
        background: n.is_read ? t.cardAlt : cfg.bg,
        border: `0.5px solid ${t.border}`,
        borderLeft: `2px solid ${cfg.accent}`,
        cursor: 'pointer',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        transition: 'background 0.1s',
      }}
    >
      <div style={{
        width: iconSz, height: iconSz, borderRadius: 8,
        background: n.is_read ? t.card : '#ffffff',
        border: `0.5px solid ${t.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon style={{ width: 18, height: 18, color: cfg.accent }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 500, letterSpacing: 0.4,
            padding: '2px 7px', borderRadius: 99,
            background: n.is_read ? t.card : '#ffffff',
            border: `0.5px solid ${cfg.accent}33`,
            color: cfg.text,
            textTransform: 'uppercase',
          }}>{cfg.label}</span>
          {!n.is_read && (
            <span style={{ width: 6, height: 6, borderRadius: '50%',
                           background: cfg.accent, flexShrink: 0 }} />
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: t.dim, flexShrink: 0 }}>
            {fmtRelative(n.created_at)}
          </span>
        </div>

        {hasRich ? (
          <>
            <p style={{ margin: 0, fontSize: nameSz, fontWeight: 500, color: t.text, lineHeight: 1.2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {empName || '— employé non renseigné —'}
            </p>
            {(d.client_name || d.service_name) && (
              <p style={{ margin: '3px 0 0', fontSize: 12, color: t.textSub, lineHeight: 1.35,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.client_name || ''}{d.client_name && d.service_name ? ' · ' : ''}{d.service_name || ''}
              </p>
            )}
            {(dateStr || timeStr) && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
                {dateStr && (
                  <span style={{ fontSize: dateSz, fontWeight: 500, color: t.text }}>{dateStr}</span>
                )}
                {timeStr && (
                  <span style={{ fontSize: timeSz, fontWeight: 500, color: cfg.text,
                                 fontFamily: 'monospace', letterSpacing: 0.5 }}>
                    {timeStr}
                  </span>
                )}
                {n.type === 'appointment_reminder' && d.minutes_before != null && (
                  <span style={{ fontSize: 11, color: cfg.text, padding: '2px 7px', borderRadius: 99,
                                 background: cfg.bg, border: `0.5px solid ${cfg.accent}55` }}>
                    dans {d.minutes_before < 60
                      ? `${d.minutes_before} min`
                      : d.minutes_before < 1440
                        ? `${d.minutes_before / 60}h`
                        : `${Math.round(d.minutes_before / 1440)} j`}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontWeight: 500, fontSize: 14, color: t.text, lineHeight: 1.3 }}>
              {stripLeadingEmoji(n.title)}
            </p>
            {n.body && (
              <p style={{ margin: '3px 0 0', fontSize: 12, color: t.textSub, lineHeight: 1.4 }}>
                {stripLeadingEmoji(n.body)}
              </p>
            )}
          </>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
        aria-label="Supprimer la notification"
        style={{
          width: 26, height: 26, borderRadius: 8,
          background: 'transparent',
          border: `0.5px solid ${t.border}`,
          cursor: 'pointer', color: t.muted,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontFamily: 'inherit',
        }}>
        <I.Trash style={{ width: 13, height: 13 }} />
      </button>
    </div>
  );
}

function NotificationCenter({ theme: t, drawerSide = 'right' }) {
  const [open, setOpen] = useState(false);
  const [drawerPos, setDrawerPos] = useState({ top: 0, left: 0 });
  const [toast, showToast] = useToast();
  const bellWrapRef     = useRef(null);
  const drawerContentRef = useRef(null);
  const navigate  = useNavigate();
  const {
    notifications, unreadCount,
    pushSupported, pushEnabled,
    enablePush, disablePush,
    markRead, markAllRead, deleteNotif,
    reload,
  } = useNotifications({ enabled: true });

  // Le bouton clignote tant qu'il y a des non-lues ET que le drawer est ferme.
  // Ouvrir le drawer = "j'ai vu" -> markAllRead -> unreadCount=0 -> stop pulse.
  const blinking = unreadCount > 0 && !open;

  // Position fixed calculee depuis la cloche : evite tout pb de stacking
  // context (sidebar sticky / overflow content) qui faisait que le drawer
  // semblait passer derriere d'autres elements.
  const computeDrawerPos = () => {
    if (!bellWrapRef.current) return;
    const rect = bellWrapRef.current.getBoundingClientRect();
    const W = 380;
    const top = rect.bottom + 8;
    let left = drawerSide === 'left' ? rect.left : rect.right - W;
    // Clamp dans la viewport (evite overflow horizontal a droite ou gauche).
    left = Math.max(8, Math.min(left, window.innerWidth - W - 8));
    setDrawerPos({ top, left });
  };

  const handleToggle = () => {
    setOpen(prev => {
      const next = !prev;
      if (next) {
        computeDrawerPos();
        reload();
        // markAllRead a l'ouverture : badge se reinitialise et clignotement
        // s'arrete. Conforme au feedback user : "apres avoir vu la pop up".
        if (unreadCount > 0) markAllRead().catch(() => {});
      }
      return next;
    });
  };

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

  // Suppression de toutes les notifs : Promise.all sur deleteNotif (le hook
  // gere le state local + l'API individuellement). Rapide et coherent.
  const clearAll = async () => {
    if (!notifications.length) return;
    const ids = notifications.map(n => n.id);
    await Promise.all(ids.map(id => deleteNotif(id))).catch(() => {});
  };

  // Click outside : ferme le drawer si on clique hors de la cloche ET hors
  // du contenu du drawer. Necessaire car le drawer est rendu en position
  // fixed (donc hors du wrapper de la cloche).
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (bellWrapRef.current?.contains(e.target)) return;
      if (drawerContentRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Repositionne sur resize quand le drawer est ouvert (evite que la
  // popup reste a la mauvaise place si l'utilisateur redimensionne).
  useEffect(() => {
    if (!open) return;
    const onResize = () => computeDrawerPos();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, drawerSide]);

  return (
    <>
      <Toast msg={toast?.msg} type={toast?.type}/>
      <style>{`
        @keyframes ffNotifPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
          50%      { box-shadow: 0 0 0 7px rgba(239, 68, 68, 0); }
        }
        @keyframes ffBadgePulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.18); }
        }
      `}</style>
      <div ref={bellWrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button onClick={handleToggle}
                style={{ position: 'relative', width: 34, height: 34, borderRadius: 8,
                         background: open ? t.cardAlt : 'transparent',
                         border: `0.5px solid ${blinking ? '#fca5a5' : t.border}`,
                         cursor: 'pointer',
                         display: 'flex', alignItems: 'center', justifyContent: 'center',
                         transition: 'background 0.15s ease, border-color 0.2s ease',
                         fontFamily: 'inherit',
                         animation: blinking ? 'ffNotifPulse 1.6s ease-in-out infinite' : 'none' }}>
          <I.Bell style={{ width: 15, height: 15,
                           color: open ? t.text : (blinking ? '#991b1b' : t.muted) }} />
          {/* Indicateur d'état push (haut-gauche) — aide visuelle pour les
              employés : vert = notifs actives, rouge barré = silencieux.
              Affiché uniquement si push supporté pour ne pas semer la
              confusion sur des navigateurs incapables (vieux iOS Safari). */}
          {pushSupported && (
            <span title={pushEnabled ? 'Notifications actives' : 'Notifications silencieuses'}
                  aria-label={pushEnabled ? 'Notifications actives' : 'Notifications silencieuses'}
                  style={{ position: 'absolute', top: -3, left: -3,
                           width: 12, height: 12, borderRadius: 99,
                           background: pushEnabled ? '#10b981' : '#ef4444',
                           border: `1.5px solid ${t.bg || '#fff'}`,
                           display: 'flex', alignItems: 'center', justifyContent: 'center',
                           pointerEvents: 'none' }}>
              {pushEnabled ? (
                /* Petite onde sonore — son actif */
                <svg width="6" height="6" viewBox="0 0 24 24" fill="none"
                     stroke="white" strokeWidth="3.5" strokeLinecap="round">
                  <path d="M12 6v12"/>
                  <path d="M7 9v6"/>
                  <path d="M17 9v6"/>
                </svg>
              ) : (
                /* Trait barré — muet */
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none"
                     stroke="white" strokeWidth="3.5" strokeLinecap="round">
                  <path d="M5 5l14 14"/>
                </svg>
              )}
            </span>
          )}
          {unreadCount > 0 && (
            <span style={{ position: 'absolute', top: -4, right: -4,
                           minWidth: 14, height: 14, borderRadius: 99,
                           background: '#991b1b', color: 'white',
                           fontSize: 9, fontWeight: 500,
                           display: 'flex', alignItems: 'center', justifyContent: 'center',
                           padding: '0 3px',
                           animation: blinking ? 'ffBadgePulse 1.6s ease-in-out infinite' : 'none' }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {open && createPortal(
        <div ref={drawerContentRef}
             style={{ position: 'fixed',
                      top: drawerPos.top, left: drawerPos.left,
                      width: 380, maxWidth: 'calc(100vw - 16px)',
                      maxHeight: 'calc(100vh - 80px)',
                      display: 'flex', flexDirection: 'column',
                      background: t.elevated, borderRadius: 12,
                      border: `0.5px solid ${t.border}`,
                      boxShadow: t.shadowModal, zIndex: 9999, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `0.5px solid ${t.separator}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 8, flexShrink: 0 }}>
            <span style={{ fontWeight: 500, fontSize: 14, color: t.text }}>
              Notifications
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
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
                            showToast(msg, 'error');
                          }
                        }}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 8,
                                 border: `0.5px solid ${t.border}`,
                                 background: pushEnabled ? '#f0fdf4' : 'transparent',
                                 color: pushEnabled ? '#065f46' : t.muted,
                                 fontWeight: 500, cursor: 'pointer',
                                 fontFamily: 'inherit' }}>
                  {pushEnabled ? 'Push ON' : 'Push OFF'}
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAll}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 8,
                                 border: '0.5px solid rgba(239,68,68,0.25)',
                                 background: 'rgba(239,68,68,0.08)',
                                 color: '#991b1b',
                                 fontWeight: 500, cursor: 'pointer',
                                 fontFamily: 'inherit' }}>
                  Effacer tout
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 8px' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: t.muted, margin: 0 }}>Aucune notification</p>
              </div>
            ) : notifications.map((n) => {
              const cfg = NOTIF_TYPE_CFG[n.type] || {
                Icon: I.Bell, label: 'Info', bg: t.cardAlt, accent: t.muted, text: t.textSub,
              };
              return (
                <NotifCard key={n.id} n={n} t={t} cfg={cfg}
                           onOpen={openNotification} onDelete={deleteNotif}
                           compact />
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── RequireAdminMode (commit 15) ────────────────────────────────────────────
// Wrapper pour les routes accessibles uniquement en mode admin (sidebar
// complète). En mode normal, redirige vers /agenda. Sécurité UX seulement —
// pinAdminMiddleware côté back reste la barrière effective sur les actions.
function RequireAdminMode({ children }) {
  const { isAdminMode } = useAdminMode();
  if (!isAdminMode) return <Navigate to="/agenda" replace/>;
  return children;
}

// ── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading, logout, login }                                = useAuth();
  const { unlocked, hasPin, checking, changePin, lock, checkSession }   = useAdmin();
  const { theme, toggle, isLight }                                      = useTheme();
  // Refonte FDS-2026 commit 11 : état du mode tablette partagée (provider global).
  // Conservé pour rétro-compat ; le commit 15 court-circuite ce flag (sidebar
  // utilise UNIQUEMENT useAdminMode désormais).
  const tabletCtx = useTabletMode();
  // Refonte FDS-2026 commit 15 : bascule UX simple Convertir/Quitter mode admin.
  const { isAdminMode, enableAdminMode, disableAdminMode } = useAdminMode();
  const navigate = useNavigate();
  const location = useLocation();

  // Refonte FDS-2026 commit 16 : api.js déclenche requestAdminPin() quand une
  // route admin retourne 403 (ff_pin_token expiré). On enregistre un handler
  // qui ouvre la modale PIN admin en mode « refresh » (pas de bascule), résout
  // la promise pendante au succès pour que la requête soit retryée.
  useEffect(() => {
    const unregister = registerAdminPinHandler(() => {
      setPinPromptMode('refresh');
      setTabletAdminPinOpen(true);
    });
    return unregister;
  }, []);

  // Quitter le mode admin = bascule directe (pas de PIN). Si l'utilisateur
  // était sur une route protégée admin (/dashboard, /historique, /marketing,
  // /statistiques, /reglages, /settings), on redirige vers /agenda. Le wrapper
  // RequireAdminMode le ferait aussi automatiquement à la prochaine render mais
  // le navigate explicite évite un flicker visuel sur la page protégée.
  const handleQuitAdminMode = useCallback(() => {
    disableAdminMode();
    const adminPaths = ['/dashboard', '/historique', '/marketing',
                        '/statistiques', '/reglages'];
    const p = location.pathname;
    if (adminPaths.some(ap => p === ap || p.startsWith(ap + '/'))) {
      navigate('/agenda');
    }
  }, [disableAdminMode, location.pathname, navigate]);

  // Flow tablette : WhoEncashesModal intercalée avant EncaisserSheet, empId
  // pré-sélectionné ensuite. Modale PIN admin pour la bascule temporaire.
  const [whoEncashesOpen, setWhoEncashesOpen]       = useState(false);
  const [quickEntryEmpId, setQuickEntryEmpId]       = useState('');
  const [tabletAdminPinOpen, setTabletAdminPinOpen] = useState(false);
  // Refonte FDS-2026 commit 16 : ouverture programmatique de la modale PIN
  // admin (depuis api.js sur 403 ACTION_ADMIN_ONLY). Distingue le « retry après
  // expiration » (mode admin reste actif) du « bascule mode admin » initial.
  const [pinPromptMode, setPinPromptMode] = useState('toggle'); // 'toggle' | 'refresh'

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
    // Backend envoie new_appointment_public / _employee / _admin (push.js
    // commit 25). On match toutes ces variantes, sinon le son n'est jamais
    // joué pour les RDV créés depuis la page de réservation publique.
    const newAppts = (appNotifs || []).filter(n =>
      typeof n.type === 'string' && n.type.startsWith('new_appointment') && !n.is_read
    );
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

  // Refonte FDS-2026 commit 11 : point d'entrée unique pour "Encaisser".
  // Commit 15 : court-circuite l'intercalage WhoEncashesModal (le système
  // tablette commit 11 n'est plus piloté par tablet_mode_enabled, la sidebar
  // utilise UNIQUEMENT useAdminMode). EncaisserSheet gère lui-même la sélection
  // d'employé via Step2Employe.
  const openEncaisser = () => {
    setQuickEntryEmpId('');
    setQuickEntryOpen(true);
  };
  const [adminStep, setAdminStep] = useState('entry');
  const [transactions, setTxs]    = useState([]);
  const [employees, setEmps]      = useState([]);
  const [categories, setCats]     = useState([]);
  const [dataLoading, setDl]      = useState(false);

  // Recharge les transactions sans toucher aux autres states (catégories /
  // employés), utilisé par l'event `ff-tx-refresh` quand un encaissement est
  // créé ailleurs qu'à travers `addTx` (ex : remboursement crédit depuis la
  // page Clients — la tx apparaît en DB mais le state React local du
  // Dashboard l'ignorait jusqu'au prochain reload manuel de l'app).
  const reloadTxs = useCallback(async () => {
    if (!user) return;
    try {
      const _from = new Date(); _from.setMonth(_from.getMonth() - 3);
      const _fromStr = _from.toISOString().split('T')[0];
      const txs = await api.getTransactions({ from: _fromStr });
      setTxs(txs);
    } catch { /* silencieux — reload opportuniste */ }
  }, [user]);

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
      .catch(() => { /* erreur chargement initial — l'UI retombe sur data vide */ })
      .finally(() => setDl(false));
  }, [user]);

  // Bus global : tout code qui crée/modifie une transaction via une API qui
  // ne passe pas par `addTx`/`updTx` (credits.repay, checkout, etc.) peut
  // faire `window.dispatchEvent(new Event('ff-tx-refresh'))` pour forcer le
  // rafraîchissement de l'historique/stats sans reload de la page.
  useEffect(() => {
    if (!user) return;
    const onRefresh = () => reloadTxs();
    window.addEventListener('ff-tx-refresh', onRefresh);
    return () => window.removeEventListener('ff-tx-refresh', onRefresh);
  }, [user, reloadTxs]);

  useEffect(() => {
    if (checking) return;
    // Le PIN onboarding/setup s'affiche sur /reglages. /settings reste matche
    // pour retrocompat le temps que les anciens liens redirigent.
    if (page !== 'reglages' && page !== 'settings') return;
    if (hasPin === false) { setAdminStep('onboarding'); }
    else if (hasPin === true && !unlocked) { setAdminStep(s => s === 'setup' ? s : 'entry'); }
    else if (hasPin === true && unlocked)  { setAdminStep('open'); }
  }, [hasPin, unlocked, checking, page]);

  useEffect(() => {
    if (!checking && hasPin === false && user) {
      // Refonte FDS-2026 : redirection vers /reglages (la page Settings
      // monolithique a ete supprimee). PinOnboarding s'affiche dans
      // reglagesContent() quand adminStep='onboarding'.
      navigate('/reglages', { replace: true });
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
    // Refonte FDS-2026 : la sidebar utilise id='reglages' pour le tab
    // Reglages. On bascule l'adminStep en consequence pour afficher
    // PinOnboarding/PinSetup quand applicable. 'settings' reste matche
    // pour retrocompat des callers qui passent encore l'ancien id.
    if (id === 'reglages' || id === 'settings') {
      if (hasPin === false) setAdminStep('onboarding');
      else if (!unlocked) setAdminStep('entry');
      else setAdminStep('open');
    } else {
      if ((page === 'reglages' || page === 'settings') && unlocked) lock();
    }
    navigate('/' + id);
  }, [hasPin, unlocked, page, lock, navigate]);

  const handleLock = useCallback(() => {
    lock();
    setAdminStep('entry');
    navigate('/reglages');
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

  // Refonte FDS-2026 commit 16 : plus de gate PIN au montage des pages admin.
  // La saisie du PIN admin se fait UNIQUEMENT via la sidebar (bouton « Convertir
  // en mode admin »). Une fois en mode admin, toutes les pages /reglages,
  // /marketing, /statistiques s'ouvrent directement. RequireAdminMode (cf. plus
  // bas) garde l'accès en mode normal en redirigeant vers /agenda.
  // Les actions sensibles utilisent toujours adminRequest qui injecte
  // x-pin-session ; sur 403 le retry réouvre la modale PIN automatiquement
  // (cf. utils/adminPinPrompt.js + api.js).
  // L'onboarding/setup reste rendu via reglagesContent() si le compte n'a pas
  // encore de PIN du tout.

  const reglagesContent = () => {
    if (adminStep === 'onboarding') return <PinOnboarding theme={theme} onSetupNow={() => setAdminStep('setup')}/>;
    if (adminStep === 'setup')      return <PinSetup title="Creer votre code PIN Admin" onDone={async pin => { await changePin(pin); setAdminStep('open'); }}/>;
    return <Reglages transactions={transactions} employees={employees} categories={categories}
      onAddCat={addCat} onUpdCat={updCat} onDelCat={delCat} onReorderCat={reorderCat}
      onAddEmp={addEmp} onUpdEmp={updEmp} onDelEmp={delEmp} onPatchEmp={patchEmp}
      onUpdTx={updTx} onDelTx={delTx} onLock={handleLock}/>;
  };

  const marketingContent = () => {
    if (adminStep === 'onboarding') return <PinOnboarding theme={theme} onSetupNow={() => setAdminStep('setup')}/>;
    if (adminStep === 'setup')      return <PinSetup title="Creer votre code PIN Admin" onDone={async pin => { await changePin(pin); setAdminStep('open'); }}/>;
    return <Marketing/>;
  };

  const statistiquesContent = () => {
    if (adminStep === 'onboarding') return <PinOnboarding theme={theme} onSetupNow={() => setAdminStep('setup')}/>;
    if (adminStep === 'setup')      return <PinSetup title="Creer votre code PIN Admin" onDone={async pin => { await changePin(pin); setAdminStep('open'); }}/>;
    return <Statistiques employees={employees} categories={categories} transactions={transactions}/>;
  };

  // Refonte FDS-2026 commit 7 : Page Caisse. PAS de gate PIN à l'entrée
  // (encaisser = workflow quotidien employé). Gate PIN front conservé au
  // niveau de l'onglet Historique via PinAccessModal. Les actions sensibles
  // (edit/delete transaction, grant crédit) sont gated côté back par
  // pinAdminMiddleware et employeePinOptional (can_grant/can_repay/can_encash).
  // onEncaisser ouvre la même EncaisserSheet que le FAB Dashboard : flow 4
  // étapes intact, idempotency_key UUID, multi-items, multi-paiements,
  // signed_by_employee_id et audit trail transaction_audit_log préservés.
  const caisseContent = () => (
    <Caisse
      transactions={transactions}
      employees={employees}
      categories={categories}
      onAdd={addTx}
      onUpdTx={updTx}
      onDelTx={delTx}
      onEncaisser={openEncaisser}
    />
  );

  const shell = (content) => {
    return (
    <div style={{ fontFamily:"'Inter',-apple-system,sans-serif",
                  background:theme.bg, minHeight:'100vh' }}>
      {/* Refonte FDS-2026 commit 15 : le bandeau orange « Mode admin
          temporaire » du commit 11 est court-circuité — la nouvelle bascule
          (sidebar) ne pose pas de timer auto. Le badge « Admin » dans la
          sidebar suffit comme indicateur visuel. mmSs/tabletCtx restent
          pour rétro-compatibilité si besoin futur. */}

      {/* Mobile */}
      <div className="lg:hidden" style={{ minHeight:'100vh' }}>
        <TopBar onHome={() => { handleTab('dashboard'); navigate('/dashboard'); }}
                onLogout={handleLogout} theme={theme} toggle={toggle} isLight={isLight}/>
        <div style={{ paddingBottom: 64 }}>{content}</div>
        <BottomNav theme={theme} toggle={toggle} isLight={isLight} onLogout={handleLogout}
                   onRequestAdmin={() => setTabletAdminPinOpen(true)}
                   onQuitAdmin={handleQuitAdminMode}/>
      </div>
      {/* Desktop */}
      <div className="hidden lg:flex" style={{ minHeight:'100vh' }}>
        <DesktopSidebar user={user} theme={theme} toggle={toggle} isLight={isLight}
                        onLogout={handleLogout}
                        onRequestAdmin={() => setTabletAdminPinOpen(true)}
                        onQuitAdmin={handleQuitAdminMode}/>
        <div className="flex-1 min-w-0 overflow-y-auto" style={{ maxHeight:'100vh' }}>
          {content}
        </div>
      </div>

      <EncaisserSheet open={quickEntryOpen} onClose={() => setQuickEntryOpen(false)}
                      employees={employees} categories={categories} onAdd={addTx}
                      theme={theme} soundCfg={soundCfg}
                      defaultEmpId={quickEntryEmpId}/>

      {/* Mode tablette : "Qui encaisse ?" avant d'ouvrir EncaisserSheet. */}
      <WhoEncashesModal
        open={whoEncashesOpen}
        employees={employees}
        onClose={() => setWhoEncashesOpen(false)}
        onSelect={(empId) => {
          setWhoEncashesOpen(false);
          setQuickEntryEmpId(empId);
          setQuickEntryOpen(true);
        }}
      />

      {/* Refonte FDS-2026 commit 16 : modale PIN admin cohérente avec la
          modale PIN employé (PinAccessModal Dashboard). Deux modes :
          - 'toggle'  : bouton sidebar « Convertir en mode admin » → succès =
            enableAdminMode() (qui persiste la bascule + ff_pin_token est déjà
            stocké par useAdmin.verifyPin via /auth/pin/verify).
          - 'refresh' : api.js a intercepté un 403 ACTION_ADMIN_ONLY (ff_pin_token
            expiré). Succès = juste résoudre la promise pendante pour que la
            requête en attente puisse retry. PAS de bascule mode admin → mode
            normal (l'utilisateur reste admin, son token a juste été rafraîchi). */}
      <AdminPinModal
        open={tabletAdminPinOpen}
        theme={theme}
        title={pinPromptMode === 'refresh'
          ? "Session admin à rafraîchir"
          : "Convertir en mode admin"}
        subtitle={pinPromptMode === 'refresh'
          ? "Saisissez à nouveau votre PIN admin pour continuer"
          : "Saisissez votre PIN admin · accès à toutes les pages"}
        onSuccess={() => {
          if (pinPromptMode === 'refresh') {
            resolveAdminPinPrompt(true);
          } else {
            enableAdminMode();
          }
          setTabletAdminPinOpen(false);
          setPinPromptMode('toggle');
        }}
        onClose={() => {
          if (pinPromptMode === 'refresh') resolveAdminPinPrompt(false);
          setTabletAdminPinOpen(false);
          setPinPromptMode('toggle');
        }}
      />
    </div>
    );
  };

  return shell(
    <Routes>
      {/* Refonte FDS-2026 commit 15 : routes protégées par RequireAdminMode.
          En mode normal, /dashboard, /historique, /marketing, /statistiques,
          /reglages, /settings redirigent vers /agenda. /agenda, /caisse, /clients
          restent accessibles sans bascule. */}
      <Route path="/dashboard"    element={<RequireAdminMode><Dashboard transactions={transactions} employees={employees} categories={categories} onAdd={openEncaisser} onNavigate={handleTab} unreadNotifCount={appUnreadCount}/></RequireAdminMode>}/>
      {/* Refonte FDS-2026 commit 7h : /historique = page admin dédiée
          (consultation/édition/suppression toutes dates, gate PIN au mount,
          actions edit/delete gated PIN admin via adminRequest côté back).
          /caisse/historique reste lecture seule, jour courant, gate PIN
          employé. /transactions redirige vers /historique pour les anciens
          liens. */}
      <Route path="/historique"   element={<RequireAdminMode><HistoriqueAdmin transactions={transactions} employees={employees} categories={categories} onUpdTx={updTx} onDelTx={delTx}/></RequireAdminMode>}/>
      <Route path="/transactions" element={<Navigate to="/historique" replace/>}/>
      <Route path="/clients"      element={<ClientsPage/>}/>
      <Route path="/agenda"                   element={<EmployeeAgenda employees={employees} onTxCreated={tx => setTxs(p => [tx, ...p])}/>}/>
      <Route path="/agenda/views"             element={<EmployeeAgenda employees={employees} onTxCreated={tx => setTxs(p => [tx, ...p])}/>}/>
      <Route path="/agenda/views/:employeeId" element={<EmployeeAgenda employees={employees} onTxCreated={tx => setTxs(p => [tx, ...p])}/>}/>
      {/* Refonte FDS-2026 : /settings supprime, redirection 1:1 vers les
          pages dediees (preserve les anciens bookmarks). SettingsRedirect
          mappe chaque ancienne URL vers sa destination canonique. */}
      <Route path="/settings/*"   element={<SettingsRedirect/>}/>
      <Route path="/settings"     element={<SettingsRedirect/>}/>
      {/* Refonte FDS-2026 commit 7 : Caisse éclatée en /caisse/* (Encaisser
          / Historique / Crédit). EncaisserSheet reste monté globalement via
          `shell()` pour que l'onglet Encaisser puisse l'ouvrir. */}
      <Route path="/caisse/*"     element={caisseContent()}/>
      <Route path="/caisse"       element={caisseContent()}/>
      {/* Refonte FDS-2026 commit 5 : Marketing éclaté en /marketing/*. */}
      <Route path="/marketing/*"  element={<RequireAdminMode>{marketingContent()}</RequireAdminMode>}/>
      <Route path="/marketing"    element={<RequireAdminMode>{marketingContent()}</RequireAdminMode>}/>
      {/* Refonte FDS-2026 commit 6 : Statistiques éclatées en /statistiques/*. */}
      <Route path="/statistiques/*" element={<RequireAdminMode>{statistiquesContent()}</RequireAdminMode>}/>
      <Route path="/statistiques"   element={<RequireAdminMode>{statistiquesContent()}</RequireAdminMode>}/>
      {/* Refonte FDS-2026 commit 4 : la page Réglages éclatée est maintenant
          la destination canonique. /settings reste accessible avec bannière. */}
      <Route path="/reglages/*"   element={<RequireAdminMode>{reglagesContent()}</RequireAdminMode>}/>
      <Route path="/reglages"     element={<RequireAdminMode>{reglagesContent()}</RequireAdminMode>}/>
      {/* Abonnement plateforme FlowIA — choix plan + Stripe Customer Portal. */}
      <Route path="/abonnement"   element={<RequireAdminMode><Subscription/></RequireAdminMode>}/>
      {/* Racine : en mode admin → /dashboard, sinon /agenda. Catch-all idem.
          Exception : si l'utilisateur arrive d'un CTA marketing avec
          ?plan=...&period=... encodé dans /register, AuthFlow a déposé un
          flag sessionStorage 'ff_subscribe_intent'. On redirige alors vers
          /abonnement?autostart=1 pour déclencher le Checkout Stripe direct. */}
      <Route path="/"             element={<Navigate to={getPostAuthTarget(isAdminMode)} replace/>}/>
      <Route path="*"             element={<Navigate to={getPostAuthTarget(isAdminMode)} replace/>}/>
    </Routes>
  );
}

// Refonte FDS-2026 : redirige les anciennes URLs /settings/* vers leur
// destination canonique dans la nouvelle architecture (Reglages, Marketing,
// Statistiques, Caisse). Preserve les bookmarks utilisateurs.
function SettingsRedirect() {
  const location = useLocation();
  const tail = location.pathname.replace(/^\/settings\/?/, '');
  const segs = tail.split('/').filter(Boolean);
  const seg0 = segs[0] || '';
  const seg1 = segs[1] || '';

  // Mapping segment → URL canonique. Les sous-segments (ex: /settings/categories/booking)
  // sont preserves quand la nouvelle URL en a besoin.
  let target = '/reglages';
  switch (seg0) {
    case '':
    case 'stats':
    case 'ventes':
      target = '/dashboard'; break;
    case 'historique':
      target = '/historique'; break;
    case 'agenda':
      // /settings/agenda[/config] → /agenda (config gere par sub-segment)
      target = '/agenda'; break;
    case 'equipe':
    case 'absences':
    case 'commissions':
    case 'horaires':
      target = '/reglages/equipe' + (seg0 !== 'equipe' ? '/' + seg0 : ''); break;
    case 'categories':
      // /settings/categories/[booking|caisse|config] → /reglages/caisse-config
      // ou /reglages/reservations/prestations selon le sous-segment.
      if (seg1 === 'booking') target = '/reglages/reservations/prestations';
      else target = '/reglages/caisse-config';
      break;
    case 'profil':
      target = '/reglages/mon-commerce'; break;
    case 'marketing':
      target = '/marketing' + (seg1 ? '/' + seg1 : ''); break;
    case 'clients':
      target = '/clients'; break;
    case 'export':
    case 'previsions':
    case 'heures':
      target = '/statistiques'; break;
    case 'notifications':
      target = '/reglages/communication'; break;
    case 'compte':
      target = '/reglages/mon-commerce'; break;
    default:
      target = '/reglages';
  }
  return <Navigate to={target + (location.search || '')} replace />;
}

// Détermine la cible post-login. Lit (et CONSOMME) ff_subscribe_intent du
// sessionStorage si présent. Appelée uniquement quand le catch-all ou la
// racine sont matchés (donc juste après login depuis /register par ex.).
function getPostAuthTarget(isAdminMode) {
  try {
    const intent = sessionStorage.getItem('ff_subscribe_intent');
    if (intent) {
      const { plan, period } = JSON.parse(intent);
      sessionStorage.removeItem('ff_subscribe_intent');
      if (['essentiel', 'equipe'].includes(plan)
          && ['monthly', 'yearly'].includes(period)) {
        return `/abonnement?plan=${plan}&period=${period}&autostart=1`;
      }
    }
  } catch {}
  return isAdminMode ? '/dashboard' : '/agenda';
}
