import { useState, useEffect, useMemo, useRef } from 'react';
import { I, ICON_MAP, ICON_NAMES, PAL } from '../utils/icons';
import { todayStr, nowStr } from '../utils/dates';
import { Modal } from './UI';
import { useTheme, BRAND } from '../hooks/useTheme';
import { mediaApi } from '../utils/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function inp(theme, extra={}) {
  const isDark = theme.mode==='dark';
  return { display:'block', width:'100%', padding:'13px 16px', borderRadius:14, fontSize:14, fontFamily:'inherit', outline:'none', transition:'border-color .15s, box-shadow .15s', backgroundColor: isDark?'rgba(255,255,255,0.09)':'#ebebf5', border:`1.5px solid ${isDark?'rgba(255,255,255,0.18)':'rgba(0,0,0,0.15)'}`, color: isDark?'rgba(255,255,255,0.95)':'#0c0c10', colorScheme: isDark?'dark':'light', ...extra };
}

function FormLabel({ children, theme }) {
  return <label style={{ display:'block', marginBottom:6, fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:theme.muted }}>{children}</label>;
}

function FormInput({ theme, style:extra, ...props }) {
  const isDark = theme.mode==='dark';
  return (
    <input {...props} style={inp(theme, extra)}
      onFocus={e => { e.target.style.borderColor='#111827'; e.target.style.boxShadow='0 0 0 3px rgba(17,24,39,0.18)'; e.target.style.backgroundColor=isDark?'rgba(255,255,255,0.13)':'#e0e0f0'; }}
      onBlur={e  => { e.target.style.borderColor=isDark?'rgba(255,255,255,0.18)':'rgba(0,0,0,0.15)'; e.target.style.boxShadow='none'; e.target.style.backgroundColor=isDark?'rgba(255,255,255,0.09)':'#ebebf5'; }}
    />
  );
}

function FormSelect({ theme, children, ...props }) {
  return (
    <div style={{ position:'relative' }}>
      <select {...props} style={inp(theme, { cursor:'pointer', appearance:'none', WebkitAppearance:'none', paddingRight:36 })}>{children}</select>
      <I.ChevD style={{ width:16, height:16, position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:theme.muted }} />
    </div>
  );
}

function CancelBtn({ onClick, theme }) {
  const isDark = theme.mode==='dark';
  return (
    <button type="button" onClick={onClick}
      style={{ flex:1, padding:'14px', borderRadius:20, fontSize:14, fontWeight:700, cursor:'pointer', background: isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)', color: isDark?'rgba(255,255,255,0.6)':'#374151', border:`1px solid ${theme.border}` }}>
      Annuler
    </button>
  );
}

function TypeToggle({ value, onChange, options, theme }) {
  return (
    <div style={{ display:'flex', gap:8, padding:4, borderRadius:20, background: theme.mode==='dark'?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
      {options.map(([v,l,grad]) => (
        <button key={v} type="button" onClick={()=>onChange(v)}
          style={{ flex:1, padding:'11px', borderRadius:16, fontSize:14, fontWeight:700, cursor:'pointer', border:'none', background: value===v?grad:'transparent', color: value===v?'white':theme.muted }}>
          {l}
        </button>
      ))}
    </div>
  );
}

// ─── CategoryForm — deux modes : catégorie ou produit/service ────────────────
// mode='category' => crée une catégorie (groupe)
// mode='product'  => crée un produit/service (peut être rattaché à une catégorie)
export function CategoryForm({ open, onClose, onSubmit, init, allCategories=[], defaultMode='product' }) {
  const { theme } = useTheme();
  const isDark = theme.mode==='dark';

  // Détecter le mode selon init
  const initMode = init ? (init.parent_id !== null && init.parent_id !== undefined ? 'product' : 'category') : defaultMode;
  const [mode, setMode] = useState(initMode);

  const blankCat = { name:'', type:'revenue', icon:'Tag', color:PAL[0], parent_id:null, price:'' };
  const blankProd = { name:'', type:'revenue', icon:'Scissors', color:PAL[1], parent_id:'', price:'' };
  const [f, setF] = useState(blankCat);
  const [ld, setLd] = useState(false);

  useEffect(() => {
    if (!open) return;
    const m = init ? (init.parent_id != null ? 'product' : 'category') : defaultMode;
    setMode(m);
    if (init) {
      // Si is_free_price=true, on représente le price par le sentinel 'FREE'
      const priceVal = init.is_free_price ? 'FREE' : (init.price != null ? String(init.price) : '');
      setF({ name:init.name||'', type:init.type||'revenue', icon:init.icon||'Tag', color:init.color||PAL[0], parent_id:init.parent_id||'', price: priceVal });
    } else {
      setF(m === 'category' ? blankCat : blankProd);
    }
  }, [open, init?.id]);

  useEffect(() => {
    if (!init) setF(mode === 'category' ? blankCat : blankProd);
  }, [mode]);

  // Catégories parentes disponibles pour rattacher un produit
  const parentCategories = allCategories.filter(c =>
    c.type === f.type &&
    !c.parent_id &&
    c.id !== init?.id
  );

  const Icon = ICON_MAP[f.icon] || I.Tag;
  const sub = async e => {
    e.preventDefault();
    setLd(true);
    // price: 'FREE' = montant libre (null en base), sinon valeur numérique ou null
    const priceVal = f.price === 'FREE' ? null : (f.price !== '' ? parseFloat(f.price) : null);
    const payload = { ...f, parent_id: mode === 'category' ? null : (f.parent_id || null), price: priceVal, is_free_price: f.price === 'FREE' };
    await onSubmit(payload);
    setLd(false);
    onClose();
  };

  const optBg = isDark?'#1e1e30':'#f8f8ff';
  const optColor = isDark?'rgba(255,255,255,0.9)':'#0c0c10';

  return (
    <Modal open={open} onClose={onClose} title={init ? 'Modifier' : (mode === 'category' ? 'Nouvelle categorie' : 'Nouveau produit / service')} theme={theme}>
      <form onSubmit={sub} style={{ display:'flex', flexDirection:'column', gap:18 }}>

        {/* Sélecteur mode (seulement si on crée, pas si on édite) */}
        {!init && (
          <div style={{ display:'flex', gap:0, padding:3, borderRadius:16, background: isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
            {[['category','📁 Categorie'],['product','🛍️ Produit / Service']].map(([v,l]) => (
              <button key={v} type="button" onClick={() => setMode(v)}
                style={{ flex:1, padding:'10px 8px', borderRadius:12, fontSize:13, fontWeight:700, cursor:'pointer', border:'none', background: mode===v?(isDark?'#20202e':'#ffffff'):'transparent', color: mode===v?theme.text:theme.muted, boxShadow: mode===v&&!isDark?'0 1px 4px rgba(0,0,0,0.12)':'none', transition:'all .15s' }}>
                {l}
              </button>
            ))}
          </div>
        )}

        {/* Description contextuelle */}
        <div style={{ padding:'10px 14px', borderRadius:12, background: mode==='category'?'rgba(6,182,212,0.07)':'rgba(17,24,39,0.07)', border:`1px solid ${mode==='category'?'rgba(6,182,212,0.2)':'rgba(17,24,39,0.2)'}` }}>
          <p style={{ fontSize:11, color: mode==='category'?'#374151':'#111827', fontWeight:700, lineHeight:1.5 }}>
            {mode === 'category'
              ? '📁 Une categorie est un groupe. Ex : Boissons, Soins, Accessoires, Hommes, Femmes...'
              : '🛍️ Un produit/service est une prestation ou article. Il peut être rattaché a une categorie ou rester seul.'}
          </p>
        </div>

        {/* Aperçu icône */}
        <div style={{ textAlign:'center' }}>
          <div style={{ width:56, height:56, borderRadius:18, background:f.color, display:'inline-flex', alignItems:'center', justifyContent:'center', boxShadow:`0 8px 20px ${f.color}55` }}>
            <Icon style={{ width:28, height:28, color:'white' }} />
          </div>
        </div>

        {/* Type Revenu / Dépense */}
        <TypeToggle value={f.type} onChange={v=>setF({...f,type:v,parent_id:''})} theme={theme} options={[
          ['revenue','↑ Revenu', 'linear-gradient(135deg,#4ade80,#22c55e)'],
          ['expense','↓ Depense','linear-gradient(135deg,#f87171,#ef4444)'],
        ]} />

        {/* Nom */}
        <div>
          <FormLabel theme={theme}>{mode === 'category' ? 'Nom de la categorie *' : 'Nom du produit / service *'}</FormLabel>
          <FormInput theme={theme} value={f.name} onChange={e=>setF({...f,name:e.target.value})} required
            placeholder={mode === 'category' ? 'Ex : Boissons, Soins, Femmes, Hommes...' : 'Ex : Coupe, Espresso, Massage, T-shirt...'} />
        </div>

        {/* Prix (seulement pour produit/service) */}
        {mode === 'product' && (
          <div>
            <FormLabel theme={theme}>Prix du service / produit</FormLabel>
            {/* Toggle : Prix fixe / Montant libre */}
            <div style={{ display:'flex', gap:0, padding:3, borderRadius:12, background: isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)', marginBottom:10 }}>
              {[['fixed','💰 Prix fixe'],['free','✏️ Montant libre']].map(([v,l]) => (
                <button key={v} type="button"
                  onClick={() => setF({...f, price: v === 'free' ? 'FREE' : ''})}
                  style={{ flex:1, padding:'8px 6px', borderRadius:9, fontSize:12, fontWeight:700, cursor:'pointer', border:'none',
                    background: (v === 'free' ? f.price === 'FREE' : f.price !== 'FREE') ? (isDark?'#20202e':'#ffffff') : 'transparent',
                    color: (v === 'free' ? f.price === 'FREE' : f.price !== 'FREE') ? theme.text : theme.muted,
                    boxShadow: (v === 'free' ? f.price === 'FREE' : f.price !== 'FREE') && !isDark ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                    transition:'all .15s' }}>
                  {l}
                </button>
              ))}
            </div>
            {f.price === 'FREE' ? (
              <div style={{ padding:'10px 14px', borderRadius:12, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)' }}>
                <p style={{ fontSize:11, fontWeight:700, color:'#f59e0b', margin:0 }}>✏️ Montant libre — le caissier saisira le montant manuellement lors de chaque vente</p>
              </div>
            ) : (
              <>
                <div style={{ position:'relative' }}>
                  <FormInput theme={theme}
                    type="number" step="0.01" min="0"
                    value={f.price === 'FREE' ? '' : f.price}
                    onChange={e => setF({...f, price: e.target.value})}
                    placeholder="Ex : 25.00 — laisser vide = montant libre"
                    style={{ paddingRight: 36 }}
                  />
                  <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:15, fontWeight:700, color:theme.muted, pointerEvents:'none' }}>€</span>
                </div>
                {f.price && f.price !== 'FREE' && parseFloat(f.price) > 0 && (
                  <div style={{ marginTop:7, padding:'6px 12px', borderRadius:10, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.2)' }}>
                    <p style={{ fontSize:11, fontWeight:700, color:'#10b981' }}>✓ Prix defini : {parseFloat(f.price).toFixed(2)} € - il s'appliquera automatiquement en caisse</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Rattachement à une catégorie (seulement pour produit) */}
        {mode === 'product' && (
          <div>
            <FormLabel theme={theme}>Catégorie parente (optionnel)</FormLabel>
            <FormSelect theme={theme} value={f.parent_id} onChange={e=>setF({...f,parent_id:e.target.value})}>
              <option value="" style={{ background:optBg, color:optColor }}>— Aucune catégorie —</option>
              {parentCategories.map(c => (
                <option key={c.id} value={c.id} style={{ background:optBg, color:optColor }}>{c.name}</option>
              ))}
            </FormSelect>
            {!parentCategories.length && (
              <p style={{ fontSize:11, color:theme.muted, marginTop:6 }}>Créez d'abord une catégorie pour pouvoir rattacher ce produit.</p>
            )}
            {f.parent_id && (
              <div style={{ marginTop:8, padding:'7px 12px', borderRadius:10, background:'rgba(17,24,39,0.1)', border:'1px solid rgba(17,24,39,0.2)' }}>
                <p style={{ fontSize:11, fontWeight:700, color:'#111827' }}>
                  ✓ Rattaché à "{parentCategories.find(c=>c.id===f.parent_id)?.name}"
                </p>
              </div>
            )}
          </div>
        )}

        {/* Icône */}
        <div>
          <FormLabel theme={theme}>Icône</FormLabel>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8 }}>
            {ICON_NAMES.map(n => {
              const Ic = ICON_MAP[n]; const active = f.icon===n;
              return (
                <button key={n} type="button" onClick={()=>setF({...f,icon:n})}
                  style={{ padding:8, borderRadius:12, cursor:'pointer', background: active?'rgba(17,24,39,0.2)':'rgba(0,0,0,0.04)', border: active?'1.5px solid #111827':`1.5px solid ${theme.border}` }}>
                  <Ic style={{ width:20, height:20, color: active?'#818cf8':theme.muted, display:'block', margin:'auto' }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Couleur */}
        <div>
          <FormLabel theme={theme}>Couleur</FormLabel>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {PAL.map(c => (
              <button key={c} type="button" onClick={()=>setF({...f,color:c})}
                style={{ width:36, height:36, borderRadius:12, cursor:'pointer', backgroundColor:c, border:'none', boxShadow: f.color===c?`0 0 0 2px ${theme.card}, 0 0 0 4px ${c}`:'none', transform: f.color===c?'scale(1.15)':'scale(1)', transition:'transform .15s, box-shadow .15s' }} />
            ))}
          </div>
        </div>

        <div style={{ display:'flex', gap:12, paddingTop:4 }}>
          <CancelBtn onClick={onClose} theme={theme} />
          <button type="submit" disabled={ld}
            style={{ flex:1, padding:'14px', borderRadius:20, fontSize:14, fontWeight:800, color:'white', cursor:'pointer', border:'none', background: '#111827', opacity:ld?0.3:1 }}>
            {ld ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
// ─── EmployeeForm ─────────────────────────────────────────────────────────────
export function EmployeeForm({ open, onClose, onSubmit, init }) {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const COLORS = ['#111827','#374151','#10b981','#f87171','#f59e0b','#f97316','#ec4899','#8b5cf6'];
  const blank = { name:'', role:'', phone:'', email:'', avatar_color:COLORS[0] };
  const [f, setF]   = useState(blank);
  const [ld, setLd] = useState(false);
  // Image : preview locale + action différée (upload/delete au submit)
  const [imgFile,    setImgFile]    = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgDel,     setImgDel]     = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setF(init ? { name:init.name||'', role:init.role||'', phone:init.phone||'', email:init.email||'', avatar_color:init.avatar_color||COLORS[0] } : blank);
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
    <Modal open={open} onClose={onClose} title={init?"Modifier l'employe":'Nouvel employé'} theme={theme}>
      <form onSubmit={sub} style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {/* Preview : photo si dispo, sinon avatar couleur */}
        <div style={{ textAlign:'center', marginBottom:4 }}>
          {(showCurrent || showPreview) ? (
            <div style={{ position:'relative', display:'inline-block' }}>
              <img src={showPreview ? imgPreview : currentUrl}
                alt="" style={{ width:88, height:88, borderRadius:24, objectFit:'cover',
                  border:`2px solid ${theme.border}`, display:'block' }} />
            </div>
          ) : (
            <div style={{ width:88, height:88, borderRadius:24, backgroundColor:f.avatar_color, display:'inline-flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:36, fontWeight:900 }}>
              {f.name?.charAt(0)?.toUpperCase()||'?'}
            </div>
          )}
        </div>

        {/* Image : upload / remplacer / supprimer (pattern services) */}
        <div>
          <FormLabel theme={theme}>Photo de l'employé</FormLabel>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickFile} style={{ display:'none' }} />
          {(showCurrent || showPreview) ? (
            <div style={{ display:'flex', gap:6 }}>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                style={{ flex:1, padding:'9px 10px', borderRadius:10, border:'none', cursor:'pointer',
                  background:'#1a73e8', color:'white', fontWeight:700, fontSize:12 }}>
                Remplacer
              </button>
              <button type="button" onClick={onRemoveImage}
                style={{ flex:1, padding:'9px 10px', borderRadius:10, border:'none', cursor:'pointer',
                  background:'rgba(239,68,68,0.12)', color:'#ef4444', fontWeight:700, fontSize:12 }}>
                Supprimer
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileInputRef.current?.click()}
              style={{ width:'100%', padding:'14px 10px', borderRadius:10,
                border:`2px dashed ${theme.border}`, cursor:'pointer',
                background: isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                color:theme.muted, fontSize:12, fontWeight:700 }}>
              📷 Ajouter une photo
            </button>
          )}
        </div>

        {[{k:'name',l:'Nom *',ph:'Prenom Nom',req:true},{k:'role',l:'Poste',ph:'Ex: Manager, Vendeur, Technicien'},{k:'phone',l:'Télephone',ph:'06 00 00 00 00'},{k:'email',l:'Email (rappels)',ph:'employe@email.com',type:'email'}].map(({k,l,ph,req,type})=>(
          <div key={k}>
            <FormLabel theme={theme}>{l}</FormLabel>
            <FormInput theme={theme} type={type||'text'} value={f[k]} onChange={e=>setF({...f,[k]:e.target.value})} required={!!req} placeholder={ph} />
          </div>
        ))}
        <div>
          <FormLabel theme={theme}>Couleur avatar (fallback si pas de photo)</FormLabel>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {COLORS.map(c => (
              <button key={c} type="button" onClick={()=>setF({...f,avatar_color:c})}
                style={{ width:36, height:36, borderRadius:12, cursor:'pointer', backgroundColor:c, border:'none', boxShadow: f.avatar_color===c?`0 0 0 2px ${theme.card}, 0 0 0 4px ${c}`:'none', transform: f.avatar_color===c?'scale(1.15)':'scale(1)', transition:'transform .15s, box-shadow .15s' }} />
            ))}
          </div>
        </div>
        <div style={{ display:'flex', gap:12, paddingTop:4 }}>
          <CancelBtn onClick={onClose} theme={theme} />
          <button type="submit" disabled={ld} style={{ flex:1, padding:'14px', borderRadius:20, fontSize:14, fontWeight:800, color:'white', cursor:'pointer', border:'none', background: '#111827', opacity:ld?0.3:1 }}>
            {ld?'...':'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── TransactionForm avec sélection catégorie→prestation ─────────────────────
export function TransactionForm({ open, onClose, onSubmit, employees, categories, init }) {
  const { theme } = useTheme();
  const isDark = theme.mode==='dark';

  const blank = {
    type:'revenue', amount:'', description:'',
    category_id:'', employee_id:'', payment_method:'cash',
    date:todayStr(), time:nowStr(),
    client_email:'', client_name:'',
    items: [],       // [{service_name, qty, unit_price, service_id?}]
    split: false,    // paiement divisé ?
    payments: [],    // [{method, amount}]
  };
  const [f, setF] = useState(blank);
  const [ld, setLd] = useState(false);

  useEffect(() => {
    if (open) setF(init ? {
      type:init.type||'revenue',
      amount:String(init.amount||''),
      description:init.description||'',
      category_id:init.category_id||'',
      employee_id:init.employee_id||'',
      payment_method:init.payment_method||'cash',
      date:init.date?init.date.substring(0,10):todayStr(),
      time:init.time||nowStr(),
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
        ? init.payments.map(p => ({ method: p.method, amount: String(p.amount||'') }))
        : [],
    } : blank);
  }, [open, init?.id]);

  // Système catégorie → prestation
  const typeCats = categories.filter(c => c.type === f.type);
  const parentCats = typeCats.filter(c => !c.parent_id);
  const hasHierarchy = parentCats.length > 0 && typeCats.some(c => c.parent_id);

  // Groupes pour l'affichage
  const catGroups = useMemo(() => {
    if (!hasHierarchy) return [{ parent:null, items:typeCats }];
    const groups = parentCats.map(p => ({
      parent: p,
      items: typeCats.filter(c => c.parent_id===p.id),
    })).filter(g => g.items.length > 0);
    const standalone = typeCats.filter(c => !c.parent_id && !typeCats.some(ch=>ch.parent_id===c.id));
    if (standalone.length > 0) groups.push({ parent:null, items:standalone });
    return groups;
  }, [categories, f.type]);

  // Total calculé à partir des items (si présents)
  const itemsTotal = useMemo(() =>
    f.items.reduce((s, it) => s + (parseInt(it.qty)||0) * (parseFloat(it.unit_price)||0), 0),
  [f.items]);

  // Somme des paiements (split)
  const paymentsSum = useMemo(() =>
    f.payments.reduce((s, p) => s + (parseFloat(p.amount)||0), 0),
  [f.payments]);

  // Montant effectif (si items présents → total items, sinon saisi manuellement)
  const effectiveAmount = f.items.length > 0
    ? itemsTotal
    : (parseFloat(f.amount) || 0);

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
      datetime_iso: new Date(f.date+'T'+f.time).toISOString(),
      client_email: f.client_email.trim() || null,
      client_name:  f.client_name.trim()  || null,
      // Toujours envoyer items[] et payments[] — tableau vide = remplacement par vide
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

  const PAY = [
    { v:'cash',     l:'Especes',  color:'#10b981', Ic:I.Wallet },
    { v:'card',     l:'Carte',    color:'#111827', Ic:I.CreditCard },
    { v:'transfer', l:'Virement', color:'#374151', Ic:I.Bank },
    { v:'other',    l:'Autre',    color:'#f59e0b', Ic:I.MoreH },
  ];

  // Helpers items + payments
  const addItem = () => setF(prev => ({ ...prev,
    items: [...prev.items, { service_name:'', qty:1, unit_price:0, service_id:null }] }));
  const updItem = (i, patch) => setF(prev => ({ ...prev,
    items: prev.items.map((it, idx) => idx===i ? { ...it, ...patch } : it) }));
  const rmItem = (i) => setF(prev => ({ ...prev,
    items: prev.items.filter((_, idx) => idx!==i) }));

  const toggleSplit = () => setF(prev => {
    if (prev.split) return { ...prev, split:false, payments: [] };
    // Initialiser la 1re ligne avec le total + méthode courante
    return { ...prev, split:true,
      payments: [{ method: prev.payment_method || 'cash', amount: String(effectiveAmount || '') }] };
  });
  const addPay = () => setF(prev => ({ ...prev,
    payments: [...prev.payments, { method:'cash', amount:'' }] }));
  const updPay = (i, patch) => setF(prev => ({ ...prev,
    payments: prev.payments.map((p, idx) => idx===i ? { ...p, ...patch } : p) }));
  const rmPay = (i) => setF(prev => ({ ...prev,
    payments: prev.payments.filter((_, idx) => idx!==i) }));
  const optBg=isDark?'#1e1e30':'#f8f8ff';
  const optColor=isDark?'rgba(255,255,255,0.9)':'#0c0c10';

  return (
    <Modal open={open} onClose={onClose} title={init?'Modifier la transaction':'Nouvelle transaction'} theme={theme}>
      <form onSubmit={sub} style={{ display:'flex', flexDirection:'column', gap:18 }}>

        <TypeToggle value={f.type} onChange={v=>setF({...f,type:v,category_id:''})} theme={theme} options={[
          ['revenue','↑ Revenu','#111827'],
          ['expense','↓ Depense','linear-gradient(135deg,#f87171,#ef4444)'],
        ]} />

        <div>
          <FormLabel theme={theme}>
            Montant (€) * {f.items.length > 0 && <span style={{ color:theme.dim, fontWeight:600, textTransform:'none', letterSpacing:0 }}>— calculé depuis les articles</span>}
          </FormLabel>
          <FormInput theme={theme} type="number" step="0.01" min="0.01"
            value={f.items.length > 0 ? itemsTotal.toFixed(2) : f.amount}
            onChange={e=>setF({...f,amount:e.target.value})}
            required={f.items.length === 0}
            readOnly={f.items.length > 0}
            placeholder="0.00"
            style={{ fontSize:24, fontWeight:900, fontFamily:'var(--mono,"DM Mono",monospace)', textAlign:'center',
              opacity: f.items.length > 0 ? 0.75 : 1 }} />
        </div>

        {/* ── Articles / Prestations (items) ────────────────────────────── */}
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <FormLabel theme={theme}>Articles / Prestations</FormLabel>
            <button type="button" onClick={addItem}
              style={{ padding:'4px 10px', borderRadius:10, border:`1px solid ${theme.border}`,
                background:'transparent', color:theme.text, fontSize:11, fontWeight:700, cursor:'pointer' }}>
              + Ajouter
            </button>
          </div>
          {f.items.length === 0 ? (
            <p style={{ fontSize:11, color:theme.dim, margin:0 }}>
              Aucun article — montant saisi manuellement.
            </p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {f.items.map((it, i) => {
                const lineTotal = (parseInt(it.qty)||0) * (parseFloat(it.unit_price)||0);
                return (
                  <div key={i} style={{ padding:10, borderRadius:12,
                    background: isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)',
                    border:`1px solid ${theme.border}` }}>
                    <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:6 }}>
                      <input value={it.service_name}
                        onChange={e=>updItem(i,{service_name:e.target.value})}
                        placeholder="Nom (ex: Coupe)"
                        style={{ ...inp(theme, { padding:'8px 10px', fontSize:13 }), flex:1 }}/>
                      <button type="button" onClick={()=>rmItem(i)}
                        style={{ width:30, height:30, borderRadius:8, border:'none',
                          background:'rgba(248,113,113,0.12)', color:'#f87171', cursor:'pointer',
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <I.Trash style={{ width:12, height:12 }}/>
                      </button>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'80px 1fr auto', gap:6, alignItems:'center' }}>
                      <input type="number" min="1" step="1" value={it.qty}
                        onChange={e=>updItem(i,{qty: e.target.value === '' ? '' : parseInt(e.target.value) || 1})}
                        placeholder="Qté"
                        style={inp(theme, { padding:'8px 10px', fontSize:13, textAlign:'center' })}/>
                      <input type="number" min="0" step="0.01" value={it.unit_price}
                        onChange={e=>updItem(i,{unit_price: e.target.value === '' ? '' : e.target.value})}
                        placeholder="Prix unit. (€)"
                        style={inp(theme, { padding:'8px 10px', fontSize:13 })}/>
                      <span style={{ fontSize:12, fontWeight:800, color:theme.text, fontFamily:'monospace',
                        minWidth:60, textAlign:'right' }}>
                        {lineTotal.toFixed(2)} €
                      </span>
                    </div>
                  </div>
                );
              })}
              <div style={{ display:'flex', justifyContent:'space-between',
                padding:'8px 10px', borderRadius:10,
                background: isDark?'rgba(17,24,39,0.25)':'rgba(17,24,39,0.05)' }}>
                <span style={{ fontSize:12, fontWeight:700, color:theme.muted }}>Total articles</span>
                <span style={{ fontSize:14, fontWeight:900, color:theme.text, fontFamily:'monospace' }}>
                  {itemsTotal.toFixed(2)} €
                </span>
              </div>
            </div>
          )}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><FormLabel theme={theme}>Date</FormLabel><FormInput theme={theme} type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})} /></div>
          <div><FormLabel theme={theme}>Heure</FormLabel><FormInput theme={theme} type="time" value={f.time} onChange={e=>setF({...f,time:e.target.value})} /></div>
        </div>

        {/* Catégorie / Prestation groupée */}
        {typeCats.length > 0 && (
          <div>
            <FormLabel theme={theme}>Produit / Service</FormLabel>
            {hasHierarchy ? (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {catGroups.map((grp, gi) => {
                  const ParentIc = grp.parent ? (ICON_MAP[grp.parent.icon]||null) : null;
                  return (
                    <div key={gi}>
                      {grp.parent && (
                        <p style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:grp.parent.color||'#111827', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
                          {ParentIc && <ParentIc style={{ width:11, height:11 }} />}
                          {grp.parent.name}
                        </p>
                      )}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                        {grp.items.map(c => {
                          const active = f.category_id===c.id;
                          const CIc = ICON_MAP[c.icon];
                          return (
                            <button key={c.id} type="button" onClick={()=>setF({...f,category_id:c.id})}
                              style={{ padding:'12px 10px', borderRadius:16, border:`1.5px solid ${active?'#111827':theme.border}`, background: active?'rgba(17,24,39,0.18)':theme.inputBg, color: active?'#818cf8':theme.text, fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:7, textAlign:'left' }}>
                              {CIc && <CIc style={{ width:14, height:14, flexShrink:0, color: active?'#818cf8':(c.color||theme.muted) }} />}
                              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <FormSelect theme={theme} value={f.category_id} onChange={e=>setF({...f,category_id:e.target.value})}>
                <option value="" style={{ background:optBg, color:optColor }}>— Sélectionner —</option>
                {typeCats.map(c=><option key={c.id} value={c.id} style={{ background:optBg, color:optColor }}>{c.name}</option>)}
              </FormSelect>
            )}
          </div>
        )}

        {/* Employé */}
        {employees.length > 0 && (
          <div>
            <FormLabel theme={theme}>Employé</FormLabel>
            <FormSelect theme={theme} value={f.employee_id} onChange={e=>setF({...f,employee_id:e.target.value})}>
              <option value="" style={{ background:optBg, color:optColor }}>— Sélectionner —</option>
              {employees.map(e=><option key={e.id} value={e.id} style={{ background:optBg, color:optColor }}>{e.name}</option>)}
            </FormSelect>
          </div>
        )}

        {/* Paiement */}
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <FormLabel theme={theme}>Mode de paiement</FormLabel>
            <button type="button" onClick={toggleSplit}
              style={{ padding:'4px 10px', borderRadius:10, border:`1px solid ${theme.border}`,
                background: f.split ? '#111827' : 'transparent',
                color: f.split ? 'white' : theme.text,
                fontSize:11, fontWeight:700, cursor:'pointer' }}>
              {f.split ? '✓ Divisé' : 'Diviser'}
            </button>
          </div>

          {!f.split ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {PAY.map(({v,l,color,Ic}) => {
                const active = f.payment_method===v;
                return (
                  <button key={v} type="button" onClick={()=>setF({...f,payment_method:v})}
                    style={{ padding:'13px 8px', borderRadius:16, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7, border:`1.5px solid ${active?color+'90':theme.border}`, background: active?color+'22':(isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)'), color: active?color:theme.muted }}>
                    <Ic style={{ width:14, height:14, flexShrink:0 }} />{l}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {f.payments.map((p, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 120px auto', gap:6, alignItems:'center' }}>
                  <select value={p.method} onChange={e=>updPay(i,{method:e.target.value})}
                    style={inp(theme, { padding:'10px 12px', fontSize:13, cursor:'pointer' })}>
                    {PAY.map(({v,l}) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" value={p.amount}
                    onChange={e=>updPay(i,{amount:e.target.value})}
                    placeholder="Montant"
                    style={inp(theme, { padding:'10px 12px', fontSize:13 })}/>
                  <button type="button" onClick={()=>rmPay(i)}
                    style={{ width:30, height:30, borderRadius:8, border:'none',
                      background:'rgba(248,113,113,0.12)', color:'#f87171', cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <I.Trash style={{ width:12, height:12 }}/>
                  </button>
                </div>
              ))}
              <button type="button" onClick={addPay}
                style={{ padding:'8px', borderRadius:10, border:`1px dashed ${theme.border}`,
                  background:'transparent', color:theme.muted, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                + Ajouter un mode
              </button>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px',
                borderRadius:8, background: splitValid ? 'rgba(16,185,129,0.1)' : 'rgba(248,113,113,0.1)' }}>
                <span style={{ fontSize:11, fontWeight:700, color:theme.muted }}>
                  Somme réparation / total
                </span>
                <span style={{ fontSize:12, fontWeight:800, fontFamily:'monospace',
                  color: splitValid ? '#10b981' : '#f87171' }}>
                  {paymentsSum.toFixed(2)} € / {effectiveAmount.toFixed(2)} €
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Client associé */}
        <div>
          <FormLabel theme={theme}>Client (optionnel)</FormLabel>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <FormInput theme={theme} type="email" value={f.client_email}
              onChange={e=>setF({...f,client_email:e.target.value})}
              placeholder="email@client.com" />
            <FormInput theme={theme} value={f.client_name}
              onChange={e=>setF({...f,client_name:e.target.value})}
              placeholder="Nom du client" />
          </div>
        </div>

        {/* Note */}
        <div>
          <FormLabel theme={theme}>Note (optionnel)</FormLabel>
          <FormInput theme={theme} value={f.description} onChange={e=>setF({...f,description:e.target.value})} placeholder="Remarque…" />
        </div>

        <div style={{ display:'flex', gap:12, paddingTop:4 }}>
          <CancelBtn onClick={onClose} theme={theme} />
          <button type="submit" disabled={ld || (f.split && !splitValid) || effectiveAmount <= 0}
            style={{ flex:1, padding:'14px', borderRadius:20, fontSize:14, fontWeight:800, color:'white', cursor:'pointer', border:'none', background: '#111827', opacity: (ld || (f.split && !splitValid) || effectiveAmount <= 0) ? 0.4 : 1 }}>
            {ld ? 'Enregistrement...'
              : (f.split && !splitValid) ? 'Répartition incomplète'
              : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
