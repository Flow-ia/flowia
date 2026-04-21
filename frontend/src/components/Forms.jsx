import { useState, useEffect, useMemo, useRef } from 'react';
import { I, ICON_MAP, ICON_NAMES, PAL } from '../utils/icons';
import { todayStr, nowStr } from '../utils/dates';
import { Modal } from './UI';
import { useTheme } from '../hooks/useTheme';
import { mediaApi } from '../utils/api';
import { Input, Label, SegmentedControl, Button } from './primitives';

// ─── Style partage pour selects et inputs inline custom ──────────────────────
function inputStyle(t, extra = {}) {
  return {
    display: 'block',
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    backgroundColor: t.inputBg,
    border: `0.5px solid ${t.borderInput}`,
    color: t.text,
    colorScheme: t.mode,
    boxSizing: 'border-box',
    ...extra,
  };
}

// Wrappers minces pour que les formulaires restent lisibles.
function FormLabel({ children }) {
  return <Label style={{ marginBottom: 6 }}>{children}</Label>;
}

function FormInput({ style, ...props }) {
  return <Input style={style} {...props} />;
}

function FormSelect({ children, value, onChange, style, ...props }) {
  const { theme: t } = useTheme();
  return (
    <div style={{ position: 'relative' }}>
      <select value={value} onChange={onChange} {...props}
              style={{ ...inputStyle(t, { cursor:'pointer', appearance:'none', WebkitAppearance:'none', paddingRight:34 }), ...style }}>
        {children}
      </select>
      <I.ChevD style={{ width:16, height:16, position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:t.muted }}/>
    </div>
  );
}

function CancelBtn({ onClick }) {
  return (
    <Button variant="secondary" type="button" onClick={onClick} style={{ flex:1 }}>
      Annuler
    </Button>
  );
}

// ─── CategoryForm — categorie ou produit/service ─────────────────────────────
export function CategoryForm({ open, onClose, onSubmit, init, allCategories = [], defaultMode = 'product' }) {
  const { theme } = useTheme();
  const t = theme;

  const initMode = init ? (init.parent_id !== null && init.parent_id !== undefined ? 'product' : 'category') : defaultMode;
  const [mode, setMode] = useState(initMode);

  const blankCat  = { name:'', type:'revenue', icon:'Tag',      color:PAL[0], parent_id:null, price:'' };
  const blankProd = { name:'', type:'revenue', icon:'Scissors', color:PAL[1], parent_id:'',   price:'' };
  const [f, setF]   = useState(blankCat);
  const [ld, setLd] = useState(false);

  useEffect(() => {
    if (!open) return;
    const m = init ? (init.parent_id != null ? 'product' : 'category') : defaultMode;
    setMode(m);
    if (init) {
      const priceVal = init.is_free_price ? 'FREE' : (init.price != null ? String(init.price) : '');
      setF({ name:init.name||'', type:init.type||'revenue', icon:init.icon||'Tag',
             color:init.color||PAL[0], parent_id:init.parent_id||'', price: priceVal });
    } else {
      setF(m === 'category' ? blankCat : blankProd);
    }
  }, [open, init?.id]);

  useEffect(() => {
    if (!init) setF(mode === 'category' ? blankCat : blankProd);
  }, [mode]);

  const parentCategories = allCategories.filter(c =>
    c.type === f.type && !c.parent_id && c.id !== init?.id
  );

  const Icon = ICON_MAP[f.icon] || I.Tag;

  const sub = async e => {
    e.preventDefault();
    setLd(true);
    const priceVal = f.price === 'FREE' ? null : (f.price !== '' ? parseFloat(f.price) : null);
    const payload = {
      ...f,
      parent_id: mode === 'category' ? null : (f.parent_id || null),
      price: priceVal,
      is_free_price: f.price === 'FREE',
    };
    await onSubmit(payload);
    setLd(false);
    onClose();
  };

  const optBg    = t.mode === 'dark' ? '#1e1e30' : '#f8f8ff';
  const optColor = t.mode === 'dark' ? 'rgba(255,255,255,0.9)' : '#0c0c10';

  return (
    <Modal open={open} onClose={onClose} theme={theme}
           title={init ? 'Modifier' : (mode === 'category' ? 'Nouvelle categorie' : 'Nouveau produit / service')}>
      <form onSubmit={sub} style={{ display:'flex', flexDirection:'column', gap:18 }}>

        {/* Selecteur de mode (creation seulement) */}
        {!init && (
          <SegmentedControl fullWidth
                            value={mode} onChange={setMode}
                            options={[
                              { value:'category', label:'Categorie' },
                              { value:'product',  label:'Produit / Service' },
                            ]}/>
        )}

        {/* Description contextuelle — encart pastel sobre */}
        <div style={{ padding:'10px 14px', borderRadius:8,
                      background: mode === 'category' ? '#ecfeff' : '#eef2ff' }}>
          <p style={{ fontSize:12, fontWeight:500, lineHeight:1.5,
                      color: mode === 'category' ? '#0e7490' : '#4338ca', margin:0 }}>
            {mode === 'category'
              ? "Une categorie est un groupe. Ex : Boissons, Soins, Accessoires, Hommes, Femmes..."
              : "Un produit/service est une prestation ou un article. Il peut etre rattache a une categorie ou rester seul."}
          </p>
        </div>

        {/* Apercu icone (sans ombre coloree) */}
        <div style={{ textAlign:'center' }}>
          <div style={{ width:56, height:56, borderRadius:12, background:f.color,
                        display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
            <Icon style={{ width:26, height:26, color:'white' }}/>
          </div>
        </div>

        {/* Type Revenu / Depense */}
        <SegmentedControl fullWidth
                          value={f.type}
                          onChange={v => setF({ ...f, type:v, parent_id:'' })}
                          options={[
                            { value:'revenue', label:'↑ Revenu' },
                            { value:'expense', label:'↓ Depense' },
                          ]}/>

        {/* Nom */}
        <div>
          <FormLabel>{mode === 'category' ? 'Nom de la categorie *' : 'Nom du produit / service *'}</FormLabel>
          <FormInput value={f.name} onChange={e => setF({ ...f, name:e.target.value })} required
                     placeholder={mode === 'category' ? 'Ex : Boissons, Soins, Femmes, Hommes...' : 'Ex : Coupe, Espresso, Massage, T-shirt...'}/>
        </div>

        {/* Prix (produit/service seulement) */}
        {mode === 'product' && (
          <div>
            <FormLabel>Prix du service / produit</FormLabel>
            <SegmentedControl fullWidth
                              value={f.price === 'FREE' ? 'free' : 'fixed'}
                              onChange={v => setF({ ...f, price: v === 'free' ? 'FREE' : '' })}
                              options={[
                                { value:'fixed', label:'Prix fixe' },
                                { value:'free',  label:'Montant libre' },
                              ]}
                              style={{ marginBottom:10 }}/>
            {f.price === 'FREE' ? (
              <div style={{ padding:'10px 14px', borderRadius:8, background:'#fffbeb' }}>
                <p style={{ fontSize:12, fontWeight:500, color:'#92400e', margin:0 }}>
                  {"Montant libre — le caissier saisira le montant manuellement lors de chaque vente."}
                </p>
              </div>
            ) : (
              <>
                <div style={{ display:'flex', alignItems:'center',
                              background:t.inputBg,
                              border:`0.5px solid ${t.borderInput}`,
                              borderRadius:8, padding:'0 12px' }}>
                  <input type="number" step="0.01" min="0"
                         value={f.price === 'FREE' ? '' : f.price}
                         onChange={e => setF({ ...f, price:e.target.value })}
                         placeholder="Ex : 25.00"
                         style={{ flex:1, border:'none', padding:'10px 0', background:'transparent',
                                  outline:'none', color:t.text, fontSize:14, fontFamily:'inherit', minWidth:0 }}/>
                  <span style={{ fontSize:13, color:t.muted, marginLeft:8, userSelect:'none' }}>€</span>
                </div>
                {f.price && f.price !== 'FREE' && parseFloat(f.price) > 0 && (
                  <div style={{ marginTop:8, padding:'6px 12px', borderRadius:8, background:'#f0fdf4' }}>
                    <p style={{ fontSize:12, fontWeight:500, color:'#065f46', margin:0 }}>
                      {`Prix defini : ${parseFloat(f.price).toFixed(2)} € — appliquera automatiquement en caisse.`}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Rattachement (produit seulement) */}
        {mode === 'product' && (
          <div>
            <FormLabel>Categorie parente (optionnel)</FormLabel>
            <FormSelect value={f.parent_id} onChange={e => setF({ ...f, parent_id:e.target.value })}>
              <option value="" style={{ background:optBg, color:optColor }}>— Aucune categorie —</option>
              {parentCategories.map(c => (
                <option key={c.id} value={c.id} style={{ background:optBg, color:optColor }}>{c.name}</option>
              ))}
            </FormSelect>
            {!parentCategories.length && (
              <p style={{ fontSize:11, color:t.muted, marginTop:6 }}>
                {"Creez d'abord une categorie pour pouvoir rattacher ce produit."}
              </p>
            )}
            {f.parent_id && (
              <div style={{ marginTop:8, padding:'7px 12px', borderRadius:8, background:t.cardAlt }}>
                <p style={{ fontSize:12, fontWeight:500, color:t.text, margin:0 }}>
                  Rattache a « {parentCategories.find(c => c.id === f.parent_id)?.name} »
                </p>
              </div>
            )}
          </div>
        )}

        {/* Icone */}
        <div>
          <FormLabel>Icone</FormLabel>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8 }}>
            {ICON_NAMES.map(n => {
              const Ic = ICON_MAP[n];
              const active = f.icon === n;
              return (
                <button key={n} type="button" onClick={() => setF({ ...f, icon:n })}
                        style={{ padding:8, borderRadius:8, cursor:'pointer', fontFamily:'inherit',
                                 background: active ? t.cardAlt : 'transparent',
                                 border: `0.5px solid ${active ? t.borderStrong : t.border}` }}>
                  <Ic style={{ width:20, height:20, color: active ? t.text : t.muted, display:'block', margin:'auto' }}/>
                </button>
              );
            })}
          </div>
        </div>

        {/* Couleur */}
        <div>
          <FormLabel>Couleur</FormLabel>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {PAL.map(c => (
              <button key={c} type="button" onClick={() => setF({ ...f, color:c })}
                      style={{ width:34, height:34, borderRadius:8, cursor:'pointer',
                               backgroundColor:c,
                               border: f.color === c ? `0.5px solid ${t.text}` : `0.5px solid ${t.border}`,
                               transform: f.color === c ? 'scale(1.08)' : 'scale(1)',
                               transition:'transform 0.15s ease' }}/>
            ))}
          </div>
        </div>

        <div style={{ display:'flex', gap:12, paddingTop:4 }}>
          <CancelBtn onClick={onClose}/>
          <Button type="submit" variant="primary" disabled={ld} style={{ flex:1 }}>
            {ld ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── EmployeeForm ────────────────────────────────────────────────────────────
export function EmployeeForm({ open, onClose, onSubmit, init }) {
  const { theme } = useTheme();
  const t = theme;
  const COLORS = ['#111827','#374151','#10b981','#f87171','#f59e0b','#f97316','#ec4899','#8b5cf6'];
  const blank = { name:'', role:'', phone:'', email:'', avatar_color:COLORS[0] };
  const [f, setF]   = useState(blank);
  const [ld, setLd] = useState(false);

  const [imgFile,    setImgFile]    = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgDel,     setImgDel]     = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setF(init ? { name:init.name||'', role:init.role||'', phone:init.phone||'',
                    email:init.email||'', avatar_color:init.avatar_color||COLORS[0] } : blank);
      setImgFile(null); setImgPreview(null); setImgDel(false);
    }
  }, [open, init?.id]);

  const initHasImage = !!init?.has_image;
  const showCurrent  = initHasImage && !imgDel && !imgPreview;
  const showPreview  = !!imgPreview;
  const currentUrl   = init?.id ? mediaApi.employeeUrl(init.id) + `?v=${init._imgV || init.image_version || 1}` : null;

  const onPickFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.type?.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return;
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
    setImgDel(false);
  };

  const onRemoveImage = () => {
    if (imgPreview) URL.revokeObjectURL(imgPreview);
    setImgFile(null); setImgPreview(null);
    if (initHasImage) setImgDel(true);
  };

  const sub = async e => {
    e.preventDefault(); setLd(true);
    let _imageAction = null;
    if (imgFile) _imageAction = 'upload';
    else if (imgDel && initHasImage) _imageAction = 'delete';
    await onSubmit({ ...f, _imageAction, _imageFile: imgFile });
    setLd(false); onClose();
  };

  return (
    <Modal open={open} onClose={onClose} theme={theme}
           title={init ? "Modifier l'employe" : 'Nouvel employe'}>
      <form onSubmit={sub} style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {/* Preview : photo si dispo, sinon avatar couleur */}
        <div style={{ textAlign:'center', marginBottom:4 }}>
          {(showCurrent || showPreview) ? (
            <img src={showPreview ? imgPreview : currentUrl} alt=""
                 style={{ width:88, height:88, borderRadius:12, objectFit:'cover',
                          border:`0.5px solid ${t.border}`, display:'inline-block' }}/>
          ) : (
            <div style={{ width:88, height:88, borderRadius:12,
                          backgroundColor:f.avatar_color,
                          display:'inline-flex', alignItems:'center', justifyContent:'center',
                          color:'white', fontSize:34, fontWeight:500 }}>
              {f.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
        </div>

        {/* Image : upload / remplacer / supprimer */}
        <div>
          <FormLabel>{"Photo de l'employe"}</FormLabel>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickFile} style={{ display:'none' }}/>
          {(showCurrent || showPreview) ? (
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" size="small" type="button"
                      onClick={() => fileInputRef.current?.click()} style={{ flex:1 }}>
                Remplacer
              </Button>
              <Button variant="danger" size="small" type="button"
                      onClick={onRemoveImage} style={{ flex:1 }}>
                Supprimer
              </Button>
            </div>
          ) : (
            <button type="button" onClick={() => fileInputRef.current?.click()}
                    style={{ width:'100%', padding:'14px 10px', borderRadius:8,
                             border:`0.5px solid ${t.borderStrong}`, cursor:'pointer',
                             background:t.cardAlt,
                             display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                             color:t.muted, fontSize:13, fontWeight:500, fontFamily:'inherit' }}>
              Ajouter une photo
            </button>
          )}
        </div>

        {[
          { k:'name',  l:'Nom *',         ph:'Prenom Nom',                        req:true },
          { k:'role',  l:'Poste',         ph:'Ex : Manager, Vendeur, Technicien'           },
          { k:'phone', l:'Telephone',     ph:'06 00 00 00 00'                               },
          { k:'email', l:'Email (rappels)',ph:'employe@email.com',                type:'email' },
        ].map(({ k, l, ph, req, type }) => (
          <div key={k}>
            <FormLabel>{l}</FormLabel>
            <FormInput type={type || 'text'} value={f[k]}
                       onChange={e => setF({ ...f, [k]:e.target.value })}
                       required={!!req} placeholder={ph}/>
          </div>
        ))}

        <div>
          <FormLabel>Couleur avatar (fallback si pas de photo)</FormLabel>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setF({ ...f, avatar_color:c })}
                      style={{ width:34, height:34, borderRadius:8, cursor:'pointer',
                               backgroundColor:c,
                               border: f.avatar_color === c ? `0.5px solid ${t.text}` : `0.5px solid ${t.border}`,
                               transform: f.avatar_color === c ? 'scale(1.08)' : 'scale(1)',
                               transition:'transform 0.15s ease' }}/>
            ))}
          </div>
        </div>

        <div style={{ display:'flex', gap:12, paddingTop:4 }}>
          <CancelBtn onClick={onClose}/>
          <Button type="submit" variant="primary" disabled={ld} style={{ flex:1 }}>
            {ld ? '...' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── TransactionForm ─────────────────────────────────────────────────────────
export function TransactionForm({ open, onClose, onSubmit, employees, categories, init }) {
  const { theme } = useTheme();
  const t = theme;

  const blank = {
    type:'revenue', amount:'', description:'',
    category_id:'', employee_id:'', payment_method:'cash',
    date:todayStr(), time:nowStr(),
    client_email:'', client_name:'',
    items: [],
    split: false,
    payments: [],
  };
  const [f, setF]   = useState(blank);
  const [ld, setLd] = useState(false);

  useEffect(() => {
    if (open) setF(init ? {
      type: init.type || 'revenue',
      amount: String(init.amount || ''),
      description: init.description || '',
      category_id: init.category_id || '',
      employee_id: init.employee_id || '',
      payment_method: init.payment_method || 'cash',
      date: init.date ? init.date.substring(0,10) : todayStr(),
      time: init.time || nowStr(),
      client_email: init.client_email || '',
      client_name:  init.client_name  || '',
      items: Array.isArray(init.items) ? init.items.map(it => ({
        service_name: it.service_name || '',
        qty: parseInt(it.qty) || 1,
        unit_price: parseFloat(it.unit_price) || 0,
        service_id: it.service_id || null,
      })) : [],
      split: init.payment_method === 'multi' || (Array.isArray(init.payments) && init.payments.length > 1),
      payments: Array.isArray(init.payments) && init.payments.length > 0
        ? init.payments.map(p => ({ method: p.method, amount: String(p.amount || '') }))
        : [],
    } : blank);
  }, [open, init?.id]);

  const typeCats   = categories.filter(c => c.type === f.type);
  const parentCats = typeCats.filter(c => !c.parent_id);
  const hasHierarchy = parentCats.length > 0 && typeCats.some(c => c.parent_id);

  const catGroups = useMemo(() => {
    if (!hasHierarchy) return [{ parent:null, items:typeCats }];
    const groups = parentCats.map(p => ({
      parent:p,
      items: typeCats.filter(c => c.parent_id === p.id),
    })).filter(g => g.items.length > 0);
    const standalone = typeCats.filter(c => !c.parent_id && !typeCats.some(ch => ch.parent_id === c.id));
    if (standalone.length > 0) groups.push({ parent:null, items:standalone });
    return groups;
  }, [categories, f.type]);

  const itemsTotal = useMemo(() =>
    f.items.reduce((s, it) => s + (parseInt(it.qty) || 0) * (parseFloat(it.unit_price) || 0), 0),
  [f.items]);

  const paymentsSum = useMemo(() =>
    f.payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0),
  [f.payments]);

  const effectiveAmount = f.items.length > 0 ? itemsTotal : (parseFloat(f.amount) || 0);
  const splitValid = !f.split || Math.abs(paymentsSum - effectiveAmount) < 0.01;

  const sub = async e => {
    e.preventDefault();
    if (effectiveAmount <= 0) return;
    if (f.split && !splitValid) return;
    setLd(true);
    const payload = {
      type: f.type,
      amount: effectiveAmount,
      description: f.description,
      category_id: f.category_id || null,
      employee_id: f.employee_id || null,
      payment_method: f.split ? 'multi' : f.payment_method,
      date: f.date,
      time: f.time,
      datetime_iso: new Date(f.date + 'T' + f.time).toISOString(),
      client_email: f.client_email.trim() || null,
      client_name:  f.client_name.trim()  || null,
      items: f.items
        .filter(it => it.service_name && it.service_name.trim())
        .map(it => ({
          service_name: it.service_name.trim(),
          qty: parseInt(it.qty) || 1,
          unit_price: parseFloat(it.unit_price) || 0,
          service_id: it.service_id || null,
        })),
      payments: f.split
        ? f.payments
            .filter(p => p.method && parseFloat(p.amount) > 0)
            .map(p => ({ method: p.method, amount: parseFloat(p.amount) }))
        : [],
    };
    await onSubmit(payload);
    setLd(false); onClose();
  };

  // Moyens de paiement — pastels sobres (bg + accent meme famille)
  const PAY = [
    { v:'cash',     l:'Especes',  color:'#065f46', bg:'#f0fdf4', Ic:I.Wallet     },
    { v:'card',     l:'Carte',    color:'#4338ca', bg:'#eef2ff', Ic:I.CreditCard },
    { v:'transfer', l:'Virement', color:'#0e7490', bg:'#ecfeff', Ic:I.Bank       },
    { v:'other',    l:'Autre',    color:'#92400e', bg:'#fffbeb', Ic:I.MoreH      },
  ];

  const addItem = () => setF(prev => ({ ...prev, items: [...prev.items, { service_name:'', qty:1, unit_price:0, service_id:null }] }));
  const updItem = (i, patch) => setF(prev => ({ ...prev, items: prev.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  const rmItem  = (i) => setF(prev => ({ ...prev, items: prev.items.filter((_, idx) => idx !== i) }));

  const toggleSplit = () => setF(prev => {
    if (prev.split) return { ...prev, split:false, payments:[] };
    return { ...prev, split:true,
             payments: [{ method: prev.payment_method || 'cash', amount: String(effectiveAmount || '') }] };
  });
  const addPay = () => setF(prev => ({ ...prev, payments: [...prev.payments, { method:'cash', amount:'' }] }));
  const updPay = (i, patch) => setF(prev => ({ ...prev, payments: prev.payments.map((p, idx) => idx === i ? { ...p, ...patch } : p) }));
  const rmPay  = (i) => setF(prev => ({ ...prev, payments: prev.payments.filter((_, idx) => idx !== i) }));

  const optBg    = t.mode === 'dark' ? '#1e1e30' : '#f8f8ff';
  const optColor = t.mode === 'dark' ? 'rgba(255,255,255,0.9)' : '#0c0c10';

  return (
    <Modal open={open} onClose={onClose} theme={theme}
           title={init ? 'Modifier la transaction' : 'Nouvelle transaction'}>
      <form onSubmit={sub} style={{ display:'flex', flexDirection:'column', gap:18 }}>

        <SegmentedControl fullWidth
                          value={f.type}
                          onChange={v => setF({ ...f, type:v, category_id:'' })}
                          options={[
                            { value:'revenue', label:'↑ Revenu' },
                            { value:'expense', label:'↓ Depense' },
                          ]}/>

        <div>
          <FormLabel>
            Montant (€) *{' '}
            {f.items.length > 0 && (
              <span style={{ color:t.dim, fontWeight:400 }}>— calcule depuis les articles</span>
            )}
          </FormLabel>
          <FormInput type="number" step="0.01" min="0.01"
                     value={f.items.length > 0 ? itemsTotal.toFixed(2) : f.amount}
                     onChange={e => setF({ ...f, amount:e.target.value })}
                     required={f.items.length === 0}
                     readOnly={f.items.length > 0}
                     placeholder="0.00"
                     style={{ fontSize:22, fontWeight:500,
                              fontFamily:'var(--mono,"DM Mono",monospace)',
                              textAlign:'center',
                              opacity: f.items.length > 0 ? 0.75 : 1 }}/>
        </div>

        {/* Articles / Prestations */}
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <Label style={{ marginBottom:0 }}>Articles / Prestations</Label>
            <Button variant="secondary" size="small" type="button" onClick={addItem}>
              + Ajouter
            </Button>
          </div>
          {f.items.length === 0 ? (
            <p style={{ fontSize:11, color:t.dim, margin:0 }}>
              Aucun article — montant saisi manuellement.
            </p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {f.items.map((it, i) => {
                const lineTotal = (parseInt(it.qty) || 0) * (parseFloat(it.unit_price) || 0);
                return (
                  <div key={i} style={{ padding:10, borderRadius:8,
                                         background:t.cardAlt,
                                         border:`0.5px solid ${t.border}` }}>
                    <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:6 }}>
                      <input value={it.service_name}
                             onChange={e => updItem(i, { service_name:e.target.value })}
                             placeholder="Nom (ex : Coupe)"
                             style={inputStyle(t, { padding:'8px 10px', fontSize:13, flex:1, width:'auto' })}/>
                      <button type="button" onClick={() => rmItem(i)}
                              style={{ width:30, height:30, borderRadius:6, border:'none',
                                       background:'rgba(239,68,68,0.1)', color:'#991b1b', cursor:'pointer',
                                       display:'flex', alignItems:'center', justifyContent:'center',
                                       flexShrink:0, fontFamily:'inherit' }}>
                        <I.Trash style={{ width:12, height:12 }}/>
                      </button>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'80px 1fr auto', gap:6, alignItems:'center' }}>
                      <input type="number" min="1" step="1" value={it.qty}
                             onChange={e => updItem(i, { qty: e.target.value === '' ? '' : parseInt(e.target.value) || 1 })}
                             placeholder="Qte"
                             style={inputStyle(t, { padding:'8px 10px', fontSize:13, textAlign:'center' })}/>
                      <input type="number" min="0" step="0.01" value={it.unit_price}
                             onChange={e => updItem(i, { unit_price: e.target.value === '' ? '' : e.target.value })}
                             placeholder="Prix unit. (€)"
                             style={inputStyle(t, { padding:'8px 10px', fontSize:13 })}/>
                      <span style={{ fontSize:12, fontWeight:500, color:t.text, fontFamily:'monospace',
                                     minWidth:60, textAlign:'right' }}>
                        {lineTotal.toFixed(2)} €
                      </span>
                    </div>
                  </div>
                );
              })}
              <div style={{ display:'flex', justifyContent:'space-between',
                            padding:'8px 12px', borderRadius:8, background:t.cardAlt }}>
                <span style={{ fontSize:12, color:t.muted }}>Total articles</span>
                <span style={{ fontSize:14, fontWeight:500, color:t.text, fontFamily:'monospace' }}>
                  {itemsTotal.toFixed(2)} €
                </span>
              </div>
            </div>
          )}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <FormLabel>Date</FormLabel>
            <FormInput type="date" value={f.date} onChange={e => setF({ ...f, date:e.target.value })}/>
          </div>
          <div>
            <FormLabel>Heure</FormLabel>
            <FormInput type="time" value={f.time} onChange={e => setF({ ...f, time:e.target.value })}/>
          </div>
        </div>

        {/* Categorie / Prestation groupee */}
        {typeCats.length > 0 && (
          <div>
            <FormLabel>Produit / Service</FormLabel>
            {hasHierarchy ? (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {catGroups.map((grp, gi) => {
                  const ParentIc = grp.parent ? (ICON_MAP[grp.parent.icon] || null) : null;
                  return (
                    <div key={gi}>
                      {grp.parent && (
                        <p style={{ fontSize:11, fontWeight:500,
                                    color: grp.parent.color || t.text,
                                    marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                          {ParentIc && <ParentIc style={{ width:12, height:12 }}/>}
                          {grp.parent.name}
                        </p>
                      )}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                        {grp.items.map(c => {
                          const active = f.category_id === c.id;
                          const CIc = ICON_MAP[c.icon];
                          return (
                            <button key={c.id} type="button"
                                    onClick={() => setF({ ...f, category_id:c.id })}
                                    style={{ padding:'10px 12px', borderRadius:8,
                                             border:`0.5px solid ${active ? t.borderStrong : t.border}`,
                                             background: active ? t.cardAlt : t.card,
                                             color: t.text, fontWeight:500, fontSize:13,
                                             cursor:'pointer', display:'flex', alignItems:'center', gap:8,
                                             textAlign:'left', fontFamily:'inherit' }}>
                              {CIc && <CIc style={{ width:14, height:14, flexShrink:0,
                                                    color: c.color || t.muted }}/>}
                              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {c.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <FormSelect value={f.category_id} onChange={e => setF({ ...f, category_id:e.target.value })}>
                <option value="" style={{ background:optBg, color:optColor }}>— Selectionner —</option>
                {typeCats.map(c => (
                  <option key={c.id} value={c.id} style={{ background:optBg, color:optColor }}>{c.name}</option>
                ))}
              </FormSelect>
            )}
          </div>
        )}

        {/* Employe */}
        {employees.length > 0 && (
          <div>
            <FormLabel>Employe</FormLabel>
            <FormSelect value={f.employee_id} onChange={e => setF({ ...f, employee_id:e.target.value })}>
              <option value="" style={{ background:optBg, color:optColor }}>— Selectionner —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id} style={{ background:optBg, color:optColor }}>{e.name}</option>
              ))}
            </FormSelect>
          </div>
        )}

        {/* Paiement */}
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <Label style={{ marginBottom:0 }}>Mode de paiement</Label>
            <Button variant={f.split ? 'primary' : 'secondary'} size="small" type="button" onClick={toggleSplit}>
              {f.split ? '✓ Divise' : 'Diviser'}
            </Button>
          </div>

          {!f.split ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {PAY.map(({ v, l, color, bg, Ic }) => {
                const active = f.payment_method === v;
                return (
                  <button key={v} type="button" onClick={() => setF({ ...f, payment_method:v })}
                          style={{ padding:'11px 10px', borderRadius:8, fontSize:13, fontWeight:500,
                                   cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                                   gap:8, fontFamily:'inherit',
                                   border:`0.5px solid ${active ? t.borderStrong : t.border}`,
                                   background: active ? bg : t.card,
                                   color: active ? color : t.muted }}>
                    <Ic style={{ width:14, height:14, flexShrink:0 }}/>{l}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {f.payments.map((p, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 120px auto', gap:6, alignItems:'center' }}>
                  <select value={p.method} onChange={e => updPay(i, { method:e.target.value })}
                          style={inputStyle(t, { padding:'10px 12px', fontSize:13, cursor:'pointer' })}>
                    {PAY.map(({ v, l }) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" value={p.amount}
                         onChange={e => updPay(i, { amount:e.target.value })}
                         placeholder="Montant"
                         style={inputStyle(t, { padding:'10px 12px', fontSize:13 })}/>
                  <button type="button" onClick={() => rmPay(i)}
                          style={{ width:30, height:30, borderRadius:6, border:'none',
                                   background:'rgba(239,68,68,0.1)', color:'#991b1b', cursor:'pointer',
                                   display:'flex', alignItems:'center', justifyContent:'center',
                                   fontFamily:'inherit' }}>
                    <I.Trash style={{ width:12, height:12 }}/>
                  </button>
                </div>
              ))}
              <button type="button" onClick={addPay}
                      style={{ padding:'8px', borderRadius:8, border:`0.5px solid ${t.border}`,
                               background:'transparent', color:t.muted, fontSize:12, fontWeight:500,
                               cursor:'pointer', fontFamily:'inherit' }}>
                + Ajouter un mode
              </button>
              <div style={{ display:'flex', justifyContent:'space-between',
                            padding:'6px 12px', borderRadius:8,
                            background: splitValid ? '#f0fdf4' : '#fef2f2' }}>
                <span style={{ fontSize:11, color: splitValid ? '#065f46' : '#991b1b' }}>
                  Somme repartition / total
                </span>
                <span style={{ fontSize:12, fontWeight:500, fontFamily:'monospace',
                               color: splitValid ? '#065f46' : '#991b1b' }}>
                  {paymentsSum.toFixed(2)} € / {effectiveAmount.toFixed(2)} €
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Client associe */}
        <div>
          <FormLabel>Client (optionnel)</FormLabel>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <FormInput type="email" value={f.client_email}
                       onChange={e => setF({ ...f, client_email:e.target.value })}
                       placeholder="email@client.com"/>
            <FormInput value={f.client_name}
                       onChange={e => setF({ ...f, client_name:e.target.value })}
                       placeholder="Nom du client"/>
          </div>
        </div>

        {/* Note */}
        <div>
          <FormLabel>Note (optionnel)</FormLabel>
          <FormInput value={f.description}
                     onChange={e => setF({ ...f, description:e.target.value })}
                     placeholder="Remarque…"/>
        </div>

        <div style={{ display:'flex', gap:12, paddingTop:4 }}>
          <CancelBtn onClick={onClose}/>
          <Button type="submit" variant="primary"
                  disabled={ld || (f.split && !splitValid) || effectiveAmount <= 0}
                  style={{ flex:1 }}>
            {ld ? 'Enregistrement...'
               : (f.split && !splitValid) ? 'Repartition incomplete'
               : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
