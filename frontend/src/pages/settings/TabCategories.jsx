import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { I, ICON_MAP } from '../../utils/icons';
import { Confirm } from '../../components/UI';
import { CategoryForm } from '../../components/Forms';
import { api, bookingApi, mediaApi } from '../../utils/api';
import { Card, fmt } from './shared';
import TabImages from './TabImages';
import TabBookingConfig from './TabBookingConfig';
import MerchantInfoCard from './MerchantInfoCard';

export default function TabCategories({ categories, transactions, onAdd, onUpd, onDel, onReorder, showToast, theme, subSegment }) {
  const isDark = theme.mode === 'dark';
  const navigate = useNavigate();
  // URL-driven : /settings/categories/{caisse|booking|config}
  const section = (subSegment === 'booking' || subSegment === 'config') ? subSegment : 'caisse';
  const setSection = (id) => navigate(`/settings/categories/${id}`, { replace: false });

  const SUB_TABS = [
    { id: 'caisse',  label: 'Caisse',              icon: I.Tag },
    { id: 'booking', label: 'Site de reservation', icon: I.Scissors },
    { id: 'config',  label: 'Config commerce',     icon: I.Settings },
  ];

  return (
    <div className="space-y-4">
      <div style={{ display:'flex', gap:6, background:theme.inputBg, borderRadius:16, padding:4,
        border:`1px solid ${theme.border}`, overflowX:'auto' }}>
        {SUB_TABS.map(({ id, label, icon: Ic }) => {
          const active = section === id;
          return (
            <button key={id} onClick={() => setSection(id)}
              style={{ flex:1, minWidth:'fit-content',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                padding:'9px 8px', borderRadius:12, border:'none', cursor:'pointer', transition:'all .15s',
                background: active ? (isDark ? 'rgba(17,24,39,0.25)' : '#fff') : 'transparent',
                color: active ? (isDark?'#e6edf3':'#111827') : theme.muted,
                fontWeight: active ? 800 : 600, fontSize:13,
                whiteSpace:'nowrap',
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
              <Ic style={{ width:15, height:15 }} />
              {label}
            </button>
          );
        })}
      </div>

      {section === 'caisse'  && (
        <CaisseCategories
          categories={categories}
          transactions={transactions}
          onAdd={onAdd}
          onUpd={onUpd}
          onDel={onDel}
          onReorder={onReorder}
          showToast={showToast}
          theme={theme}
        />
      )}
      {section === 'booking' && (
        <BookingServices theme={theme} showToast={showToast} />
      )}
      {section === 'config' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <MerchantInfoCard theme={theme} showToast={showToast} />
          <TabBookingConfig theme={theme} showToast={showToast} />
          <TabImages theme={theme} showToast={showToast} />
        </div>
      )}
    </div>
  );
}

function CaisseCategories({ categories, transactions, onAdd, onUpd, onDel, onReorder, showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const [formOpen,   setFormOpen]   = useState(false);
  const [formInit,   setFormInit]   = useState(null);
  const [formMode,   setFormMode]   = useState('product');
  const [formParent, setFormParent] = useState(null);
  const [delId,      setDelId]      = useState(null);

  const [openCats,   setOpenCats]   = useState(new Set());
  const didInitOpen = useState(false);
  useEffect(() => {
    if (!didInitOpen[0] && categories.length > 0) {
      didInitOpen[1](true);
      setOpenCats(new Set(categories.filter(c => !c.parent_id).map(c => c.id)));
    }
  }, [categories]);

  const toggleCat = (id) => setOpenCats(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const [dragOver,  setDragOver]  = useState(null);
  const dragId     = useRef(null);
  const [dragIdVis, setDragIdVis] = useState(null);

  const openCreate = (mode, parentId = null) => { setFormInit(null); setFormMode(mode); setFormParent(parentId); setFormOpen(true); };
  const openEdit   = (cat) => { setFormInit(cat); setFormMode(cat.parent_id ? 'product' : 'category'); setFormParent(null); setFormOpen(true); };

  const handleSubmit = async (data) => {
    const payload = formParent && !data.parent_id ? { ...data, parent_id: formParent } : data;
    formInit ? await onUpd(formInit.id, payload) : await onAdd(payload);
    showToast(formInit ? 'Modifie !' : 'Ajoute !');
  };

  const saveOrder = async (reordered) => {
    if (onReorder) onReorder(reordered.map((it, i) => ({ ...it, sort_order: i })));
    try {
      await api.reorderCategories(reordered.map((it, i) => ({ id: it.id, sort_order: i })));
    } catch { showToast('Erreur sauvegarde ordre', 'error'); }
  };

  const onDragStartCat = (e, id) => { dragId.current = id; setDragIdVis(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOverCat  = (e, id) => { e.preventDefault(); setDragOver(id); };
  const onDropCat      = (e, targetId, typeCats) => {
    e.preventDefault();
    const srcId = dragId.current;
    if (!srcId || srcId === targetId) { dragId.current = null; setDragIdVis(null); setDragOver(null); return; }
    const cats = typeCats.filter(c => !c.parent_id);
    const from = cats.findIndex(c => c.id === srcId);
    const to   = cats.findIndex(c => c.id === targetId);
    dragId.current = null; setDragIdVis(null); setDragOver(null);
    if (from < 0 || to < 0) return;
    const reordered = [...cats];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    saveOrder(reordered);
    showToast('Ordre mis a jour ✓');
  };

  const onDragStartProd = (e, id) => { dragId.current = id; setDragIdVis(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDropProd      = (e, targetId, products) => {
    e.preventDefault();
    const srcId = dragId.current;
    if (!srcId || srcId === targetId) { dragId.current = null; setDragIdVis(null); setDragOver(null); return; }
    const from = products.findIndex(p => p.id === srcId);
    const to   = products.findIndex(p => p.id === targetId);
    dragId.current = null; setDragIdVis(null); setDragOver(null);
    if (from < 0 || to < 0) return;
    const reordered = [...products];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    saveOrder(reordered);
    showToast('Ordre mis a jour ✓');
  };

  const renderType = (type) => {
    const typeCats  = categories.filter(c => c.type === type);
    const catGroups = typeCats.filter(c => !c.parent_id);
    const products  = typeCats.filter(c => !!c.parent_id);
    if (typeCats.length === 0) return null;

    return (
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest px-1"
          style={{ color: type==='revenue'?'#10b981':'#ef4444' }}>
          {type === 'revenue' ? '↑ Revenus' : '↓ Depenses'}
        </p>

        {catGroups.map(cat => {
          const CatIcon     = ICON_MAP[cat.icon] || I.Tag;
          const catProducts = products.filter(p => p.parent_id === cat.id);
          const catTot      = transactions
            .filter(t => t.category_id === cat.id || catProducts.some(p => p.id === t.category_id))
            .reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
          const catCnt      = transactions
            .filter(t => t.category_id === cat.id || catProducts.some(p => p.id === t.category_id)).length;
          const isOpen      = openCats.has(cat.id);
          const isDragOver  = dragOver === cat.id && dragIdVis !== cat.id;
          const isDragging  = dragIdVis === cat.id;

          return (
            <div key={cat.id}
              draggable
              onDragStart={e => onDragStartCat(e, cat.id)}
              onDragOver={e => onDragOverCat(e, cat.id)}
              onDrop={e => onDropCat(e, cat.id, typeCats)}
              onDragLeave={() => setDragOver(null)}
              style={{ borderRadius:16, overflow:'hidden',
                border: isDragOver ? '2px dashed #111827' : `1px solid ${theme.border}`,
                background: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
                opacity: isDragging ? 0.45 : 1,
                transition:'opacity 0.15s,border 0.15s',
                boxShadow: isDark ? 'none' : '0 1px 6px rgba(0,0,0,0.06)' }}>

              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
                background: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.018)',
                cursor:'pointer', userSelect:'none' }}
                onClick={() => toggleCat(cat.id)}>

                <div style={{ display:'flex',flexDirection:'column',gap:2.5,flexShrink:0,
                  cursor:'grab',opacity:0.28,padding:'3px 2px' }}
                  onClick={e => e.stopPropagation()}>
                  {[0,1,2].map(i=><div key={i} style={{width:14,height:2,borderRadius:1,background:theme.muted}}/>)}
                </div>

                <div style={{ width:36,height:36,borderRadius:11,flexShrink:0,
                  background:cat.color||'#111827',
                  display:'flex',alignItems:'center',justifyContent:'center' }}>
                  <CatIcon style={{ width:17,height:17,color:'white' }}/>
                </div>

                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                    <p style={{ fontWeight:800,fontSize:13,color:theme.text,margin:0,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{cat.name}</p>
                    <span style={{ fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:99,flexShrink:0,
                      background:'rgba(6,182,212,0.12)',color:'#374151',border:'1px solid rgba(6,182,212,0.2)' }}>
                      CATÉGORIE
                    </span>
                  </div>
                  <p style={{ fontSize:11,color:theme.muted,margin:0 }}>
                    {catProducts.length} produit{catProducts.length!==1?'s':''} · {catCnt} tx · {fmt(catTot)} €
                  </p>
                </div>

                <div style={{ display:'flex',alignItems:'center',gap:4,flexShrink:0 }}
                  onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(cat)}
                    style={{ width:30,height:30,borderRadius:8,border:'none',cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
                    <I.Edit style={{ width:12,height:12,color:theme.muted }}/>
                  </button>
                  <button onClick={() => setDelId(cat.id)}
                    style={{ width:30,height:30,borderRadius:8,border:'none',cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      background:'rgba(239,68,68,0.1)' }}>
                    <I.Trash style={{ width:12,height:12,color:'#ef4444' }}/>
                  </button>
                </div>

                <svg viewBox="0 0 24 24" fill="none" stroke={theme.muted} strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ width:14,height:14,flexShrink:0,
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition:'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              {isOpen && (
                <div>
                  {catProducts.length === 0 && (
                    <div style={{ padding:'14px 16px',textAlign:'center' }}>
                      <p style={{ fontSize:12,color:theme.dim,margin:0 }}>Aucun produit dans cette catégorie</p>
                    </div>
                  )}

                  {catProducts.map((prod) => {
                    const ProdIcon  = ICON_MAP[prod.icon] || I.Tag;
                    const prodTot   = transactions.filter(t=>t.category_id===prod.id).reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
                    const prodCnt   = transactions.filter(t=>t.category_id===prod.id).length;
                    const isProdOver= dragOver === prod.id && dragIdVis !== prod.id;

                    return (
                      <div key={prod.id}
                        draggable
                        onDragStart={e => { e.stopPropagation(); onDragStartProd(e, prod.id); }}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(prod.id); }}
                        onDrop={e => { e.stopPropagation(); onDropProd(e, prod.id, catProducts); }}
                        onDragLeave={() => setDragOver(null)}
                        style={{ display:'flex',alignItems:'center',gap:10,
                          padding:'10px 14px 10px 18px',
                          borderTop:`1px solid ${theme.border}`,
                          opacity: dragIdVis===prod.id ? 0.45 : 1,
                          borderLeft: isProdOver ? '3px solid #111827' : '3px solid transparent',
                          cursor:'grab', transition:'opacity 0.12s,border-left 0.1s',
                          background: isProdOver ? (isDark?'rgba(17,24,39,0.05)':'rgba(17,24,39,0.03)') : 'transparent' }}>

                        <div style={{ display:'flex',flexDirection:'column',gap:2,flexShrink:0,cursor:'grab',opacity:0.25 }}>
                          {[0,1].map(i=><div key={i} style={{width:10,height:2,borderRadius:1,background:theme.muted}}/>)}
                        </div>

                        <div style={{ width:3,height:22,borderRadius:99,flexShrink:0,
                          background:prod.color||cat.color||'#111827',opacity:0.55 }}/>

                        <div style={{ width:32,height:32,borderRadius:9,flexShrink:0,
                          background:prod.color||'#111827',
                          display:'flex',alignItems:'center',justifyContent:'center' }}>
                          <ProdIcon style={{ width:14,height:14,color:'white' }}/>
                        </div>

                        <div style={{ flex:1,minWidth:0 }}>
                          <p style={{ fontWeight:600,fontSize:13,color:theme.text,margin:0,
                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{prod.name}</p>
                          <p style={{ fontSize:11,color:theme.muted,margin:0 }}>
                            {prod.price != null ? `${fmt(prod.price)} €` : 'Prix libre'} · {prodCnt} tx
                          </p>
                        </div>

                        <span style={{ fontSize:12,fontWeight:700,color:theme.muted,
                          fontFamily:'monospace',flexShrink:0,marginRight:6 }}>
                          {fmt(prodTot)} €
                        </span>

                        <div style={{ display:'flex',gap:4,flexShrink:0 }}>
                          <button onClick={() => openEdit(prod)}
                            style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                              display:'flex',alignItems:'center',justifyContent:'center',
                              background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
                            <I.Edit style={{ width:11,height:11,color:theme.muted }}/>
                          </button>
                          <button onClick={() => setDelId(prod.id)}
                            style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                              display:'flex',alignItems:'center',justifyContent:'center',
                              background:'rgba(239,68,68,0.1)' }}>
                            <I.Trash style={{ width:11,height:11,color:'#ef4444' }}/>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <button onClick={() => openCreate('product', cat.id)}
                    style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,
                      padding:'10px 14px',border:'none',cursor:'pointer',
                      borderTop:`1px dashed ${isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'}`,
                      background:'transparent',color:theme.muted,fontSize:12,fontWeight:600,
                      transition:'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background=isDark?'rgba(17,24,39,0.06)':'rgba(17,24,39,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <I.Plus style={{ width:12,height:12 }}/>
                    Ajouter un produit dans « {cat.name} »
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {(() => {
          const orphans = typeCats.filter(c => c.parent_id && !categories.find(g => g.id === c.parent_id));
          if (orphans.length === 0) return null;
          return (
            <div style={{ borderRadius:16,overflow:'hidden',
              border:`1px solid ${theme.border}`,
              background:isDark?'rgba(255,255,255,0.02)':'#fafafa' }}>
              <div style={{ padding:'10px 14px',
                background:isDark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)',
                borderBottom:`1px solid ${theme.border}` }}>
                <p style={{ fontSize:11,fontWeight:700,color:theme.muted,margin:0 }}>Sans catégorie</p>
              </div>
              {orphans.map((prod, i) => {
                const ProdIcon = ICON_MAP[prod.icon] || I.Tag;
                const prodTot  = transactions.filter(t=>t.category_id===prod.id).reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
                return (
                  <div key={prod.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',
                    borderTop: i>0?`1px solid ${theme.border}`:'none' }}>
                    <div style={{ width:32,height:32,borderRadius:9,flexShrink:0,
                      background:prod.color||'#111827',
                      display:'flex',alignItems:'center',justifyContent:'center' }}>
                      <ProdIcon style={{ width:14,height:14,color:'white' }}/>
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <p style={{ fontWeight:600,fontSize:13,color:theme.text,margin:0,
                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{prod.name}</p>
                      <p style={{ fontSize:11,color:theme.muted,margin:0 }}>
                        {transactions.filter(t=>t.category_id===prod.id).length} tx · {fmt(prodTot)} €
                      </p>
                    </div>
                    <div style={{ display:'flex',gap:4 }}>
                      <button onClick={() => openEdit(prod)}
                        style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
                        <I.Edit style={{ width:11,height:11,color:theme.muted }}/>
                      </button>
                      <button onClick={() => setDelId(prod.id)}
                        style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          background:'rgba(239,68,68,0.1)' }}>
                        <I.Trash style={{ width:11,height:11,color:'#ef4444' }}/>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div style={{ borderRadius:16,padding:'12px 16px',
        background:isDark?'rgba(17,24,39,0.08)':'rgba(17,24,39,0.05)',
        border:'1px solid rgba(17,24,39,0.18)' }}>
        <p style={{ fontSize:12,fontWeight:800,color:'#111827',margin:'0 0 4px' }}>💡 Organisation caisse</p>
        <p style={{ fontSize:12,color:theme.muted,margin:0,lineHeight:1.6 }}>
          Cliquez sur une <strong style={{ color:theme.text }}>catégorie</strong> pour l'ouvrir / fermer.
          Glissez <strong style={{ color:theme.text }}>⠿</strong> pour réorganiser l'ordre d'affichage en caisse.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => openCreate('category')}
          className="py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
          style={{ background:'linear-gradient(135deg,#374151,#0891b2)', color:'white', boxShadow:'0 4px 16px rgba(6,182,212,0.3)' }}>
          <I.Plus className="w-4 h-4"/> Catégorie
        </button>
        <button onClick={() => openCreate('product')}
          className="py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
          style={{ background:'#1a73e8', color:'white', boxShadow:'0 4px 16px rgba(17,24,39,0.3)' }}>
          <I.Plus className="w-4 h-4"/> Produit / Service
        </button>
      </div>

      {categories.length === 0 && (
        <Card theme={theme}>
          <div className="py-16 text-center">
            <I.Tag className="w-12 h-12 mx-auto mb-3" style={{ color:theme.dim }}/>
            <p className="font-bold" style={{ color:theme.muted }}>Aucun élément</p>
            <p className="text-sm mt-1" style={{ color:theme.dim }}>Commencez par créer une catégorie</p>
          </div>
        </Card>
      )}

      {renderType('revenue')}
      {renderType('expense')}

      <CategoryForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setFormInit(null); setFormParent(null); }}
        onSubmit={handleSubmit}
        init={formInit}
        allCategories={categories}
        defaultMode={formMode}
      />
      <Confirm open={!!delId} onClose={() => setDelId(null)}
        onConfirm={() => { onDel(delId); setDelId(null); showToast('Supprime'); }}
        title="Supprimer cet élément ?" desc="Les transactions associées seront conservées." theme={theme} />
    </div>
  );
}

function BookingServices({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const [cats,     setCats]    = useState([]);
  const [services, setServices]= useState([]);
  const [loading,  setLoading] = useState(true);

  const [catForm,  setCatForm] = useState({ open: false, init: null });
  const [svcForm,  setSvcForm] = useState({ open: false, init: null, parentId: null });
  const [delCatId, setDelCatId]= useState(null);
  const [delSvcId, setDelSvcId]= useState(null);
  const [openCats, setOpenCats]= useState(new Set());
  const didInitOpen= useRef(false);
  const dragId     = useRef(null);
  const [dragIdVis,setDragIdVis]=useState(null);
  const [dragOver, setDragOver]= useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        bookingApi.getServiceCategories(),
        bookingApi.getServices(),
      ]);
      setCats(c);
      setServices(s);
      if (!didInitOpen.current && c.length > 0) {
        didInitOpen.current = true;
        setOpenCats(new Set(c.map(x => x.id)));
      }
    } catch { showToast('Erreur de chargement', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleCat = (id) => setOpenCats(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSaveCat = async (data) => {
    try {
      if (catForm.init) {
        const updated = await bookingApi.updateServiceCategory(catForm.init.id, data);
        setCats(prev => prev.map(c => c.id === updated.id ? updated : c));
        showToast('Catégorie modifiee ✓');
      } else {
        const created = await bookingApi.createServiceCategory(data);
        setCats(prev => [...prev, created]);
        setOpenCats(prev => new Set([...prev, created.id]));
        showToast('Catégorie créee ✓');
      }
    } catch { showToast('Erreur', 'error'); }
    setCatForm({ open: false, init: null });
  };

  const handleDelCat = async () => {
    try {
      await bookingApi.deleteServiceCategory(delCatId);
      setCats(prev => prev.filter(c => c.id !== delCatId));
      setServices(prev => prev.map(s => s.booking_category_id === delCatId ? { ...s, booking_category_id: null } : s));
      showToast('Catégorie supprimee');
    } catch { showToast('Erreur', 'error'); }
    setDelCatId(null);
  };

  const handleSaveSvc = async (data) => {
    const { _imageAction, _imageFile, ...rest } = data;
    const payload = svcForm.parentId && !rest.booking_category_id
      ? { ...rest, booking_category_id: svcForm.parentId } : rest;
    try {
      let saved;
      if (svcForm.init) {
        saved = await bookingApi.updateService(svcForm.init.id, payload);
        setServices(prev => prev.map(s => s.id === saved.id ? { ...saved, has_image: s.has_image } : s));
      } else {
        saved = await bookingApi.createService(payload);
        setServices(prev => [...prev, { ...saved, has_image: false }]);
      }
      if (_imageAction === 'upload' && _imageFile && saved?.id) {
        await mediaApi.uploadServiceImage(saved.id, _imageFile);
        setServices(prev => prev.map(s => s.id === saved.id ? { ...s, has_image: true, _imgV: Date.now() } : s));
      } else if (_imageAction === 'delete' && saved?.id) {
        await mediaApi.deleteServiceImage(saved.id);
        setServices(prev => prev.map(s => s.id === saved.id ? { ...s, has_image: false } : s));
      }
      showToast(svcForm.init ? 'Service modifie ✓' : 'Service crée ✓');
    } catch { showToast('Erreur', 'error'); }
    setSvcForm({ open: false, init: null, parentId: null });
  };

  const handleDelSvc = async () => {
    try {
      await bookingApi.deleteService(delSvcId);
      setServices(prev => prev.filter(s => s.id !== delSvcId));
      showToast('Service supprime');
    } catch { showToast('Erreur', 'error'); }
    setDelSvcId(null);
  };

  const saveOrderCats = async (reordered) => {
    setCats(reordered);
    try {
      await bookingApi.reorderServiceCategories(reordered.map((c, i) => ({ id: c.id, sort_order: i })));
    } catch { showToast('Erreur sauvegarde ordre', 'error'); }
  };

  const onDragStartCat = (e, id) => { dragId.current = id; setDragIdVis(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOverCat  = (e, id) => { e.preventDefault(); setDragOver(id); };
  const onDropCat      = (e, targetId) => {
    e.preventDefault();
    const srcId = dragId.current;
    dragId.current = null; setDragIdVis(null); setDragOver(null);
    if (!srcId || srcId === targetId) return;
    const from = cats.findIndex(c => c.id === srcId);
    const to   = cats.findIndex(c => c.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...cats];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    saveOrderCats(reordered);
    showToast('Ordre mis a jour ✓');
  };

  const SvcFormModal = ({ open, onClose, onSubmit, init, parentId, cats: catList }) => {
    const COLORS = ['#111827','#374151','#4ade80','#f87171','#fbbf24','#f97316','#ec4899','#374151','#8b5cf6','#10b981'];
    const [name,      setName]     = useState(init?.name || '');
    const [desc,      setDesc]     = useState(init?.description || '');
    const [duration,  setDuration] = useState(init?.duration_minutes || 30);
    const [price,     setPrice]    = useState(init?.price != null ? String(init.price) : '');
    const [freePrice, setFreePrice]= useState(init?.is_free_price || false);
    const [color,     setColor]    = useState(init?.color || '#111827');
    const [catId,     setCatId]    = useState(init?.booking_category_id || parentId || '');
    const [visible,   setVisible]  = useState(init ? (init.is_active !== false) : true);
    const [err,       setErr]      = useState('');
    // Image : preview locale + action diff&eacute;r&eacute;e (upload/delete au submit)
    const [imgFile,   setImgFile]  = useState(null);
    const [imgPreview,setImgPreview]=useState(null);
    const [imgDel,    setImgDel]   = useState(false);
    const fileInputRef = useRef(null);
    const initHasImage = !!init?.has_image;
    const showCurrent  = initHasImage && !imgDel && !imgPreview;
    const showPreview  = !!imgPreview;
    const showNone     = !showCurrent && !showPreview;
    const currentUrl   = init?.id ? mediaApi.serviceUrl(init.id) + (init._imgV ? `?v=${init._imgV}` : '') : null;

    const onPickFile = (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      if (!f.type.startsWith('image/')) { setErr('Fichier non valide — image requise.'); return; }
      if (f.size > 5 * 1024 * 1024)     { setErr('Image trop lourde — 5 Mo max.'); return; }
      setErr('');
      setImgFile(f);
      setImgPreview(URL.createObjectURL(f));
      setImgDel(false);
    };
    const onRemoveImage = () => {
      if (imgPreview) URL.revokeObjectURL(imgPreview);
      setImgFile(null); setImgPreview(null);
      if (initHasImage) setImgDel(true);
    };

    if (!open) return null;

    const inp = { width:'100%', padding:'10px 12px', borderRadius:10, outline:'none',
      background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.05)',
      border:`1.5px solid ${isDark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.12)'}`,
      color:theme.text, fontSize:14, fontFamily:'inherit', boxSizing:'border-box' };

    const submit = () => {
      if (!name.trim()) { setErr('Le nom est requis.'); return; }
      let _imageAction = null;
      if (imgFile) _imageAction = 'upload';
      else if (imgDel && initHasImage) _imageAction = 'delete';
      onSubmit({ name:name.trim(), description:desc.trim()||null, duration_minutes:parseInt(duration)||30,
        price:freePrice?null:(price!==''?parseFloat(price):null), is_free_price:freePrice,
        color, booking_category_id:catId||null, is_active:visible,
        _imageAction, _imageFile: imgFile });
    };

    return (
      <div style={{ position:'fixed',inset:0,zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:16,
        background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)' }}
        onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
        <div style={{ width:'100%',maxWidth:400,borderRadius:20,overflow:'hidden',
          background:theme.card,border:`1px solid ${theme.border}`,maxHeight:'90vh',display:'flex',flexDirection:'column' }}>
          <div style={{ padding:'16px 20px',borderBottom:`1px solid ${theme.border}`,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
            <p style={{ fontWeight:800,fontSize:15,color:theme.text,margin:0 }}>{init?'Modifier le service':'Nouveau service'}</p>
            <button onClick={onClose} style={{ width:30,height:30,borderRadius:8,border:'none',cursor:'pointer',
              background:isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.07)',color:theme.muted,fontSize:16 }}>✕</button>
          </div>
          <div style={{ overflowY:'auto',flex:1,padding:20,display:'flex',flexDirection:'column',gap:14 }}>
            {err && <p style={{ color:'#f87171',fontSize:12,margin:0 }}>{err}</p>}

            {/* Image principale du service */}
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:6 }}>Image du service</p>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickFile} style={{ display:'none' }} />
              {showNone && (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  style={{ width:'100%', padding:'22px 14px', borderRadius:12, border:`2px dashed ${theme.border}`,
                    background: isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)', cursor:'pointer',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:22 }}>📷</span>
                  <span style={{ fontSize:12, fontWeight:700, color:theme.muted }}>Ajouter une photo</span>
                  <span style={{ fontSize:10, color:theme.dim }}>JPG / PNG — 5 Mo max</span>
                </button>
              )}
              {(showCurrent || showPreview) && (
                <div style={{ position:'relative', borderRadius:12, overflow:'hidden', border:`1px solid ${theme.border}`, background:isDark?'rgba(255,255,255,0.04)':'#f8fafc' }}>
                  <img src={showPreview ? imgPreview : currentUrl} alt=""
                    style={{ width:'100%', height:160, objectFit:'cover', display:'block' }} />
                  <div style={{ display:'flex', gap:6, padding:8, borderTop:`1px solid ${theme.border}`, background: isDark?'rgba(0,0,0,0.2)':'white' }}>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'none', cursor:'pointer',
                        background:'#1a73e8', color:'white', fontWeight:700, fontSize:12 }}>
                      Remplacer
                    </button>
                    <button type="button" onClick={onRemoveImage}
                      style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'none', cursor:'pointer',
                        background:'rgba(239,68,68,0.12)', color:'#ef4444', fontWeight:700, fontSize:12 }}>
                      Supprimer
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Nom *</p>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex : Coupe femme" style={inp} />
            </div>
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Description</p>
              <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2}
                placeholder="Visible par le client…" style={{ ...inp,resize:'none',lineHeight:1.5 }} />
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
              <div>
                <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Durée (min)</p>
                <input type="number" value={duration} onChange={e=>setDuration(e.target.value)} min={5} step={5} style={inp} />
              </div>
              <div>
                <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Prix (€)</p>
                {freePrice
                  ? <div style={{ ...inp,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.5 }}>Prix libre</div>
                  : <input type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00" step="0.01" style={inp} />
                }
              </div>
            </div>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
              <div>
                <p style={{ fontSize:13,fontWeight:600,color:theme.text,margin:0 }}>Prix libre</p>
                <p style={{ fontSize:11,color:theme.muted,margin:0 }}>Défini à la caisse</p>
              </div>
              <button onClick={() => setFreePrice(p=>!p)}
                style={{ width:40,height:22,borderRadius:99,border:'none',cursor:'pointer',position:'relative',flexShrink:0,
                  background:freePrice?'linear-gradient(90deg,#fbbf24,#f97316)':'rgba(0,0,0,0.1)' }}>
                <div style={{ width:18,height:18,borderRadius:99,background:'white',position:'absolute',top:2,
                  left:freePrice?20:2,transition:'left .15s',boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
              </button>
            </div>
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Catégorie</p>
              <select value={catId} onChange={e=>setCatId(e.target.value)} style={{ ...inp,cursor:'pointer' }}>
                <option value="">— Sans catégorie —</option>
                {catList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:8 }}>Couleur</p>
              <div style={{ display:'flex',gap:7,flexWrap:'wrap' }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    style={{ width:28,height:28,borderRadius:8,border:`2px solid ${color===c?'white':'transparent'}`,
                      background:c,cursor:'pointer',boxShadow:color===c?`0 0 0 2px ${c}`:'none' }}/>
                ))}
              </div>
            </div>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
              <div>
                <p style={{ fontSize:13,fontWeight:600,color:theme.text,margin:0 }}>Visible sur le site</p>
                <p style={{ fontSize:11,color:theme.muted,margin:0 }}>Clients peuvent réserver</p>
              </div>
              <button onClick={() => setVisible(p=>!p)}
                style={{ width:40,height:22,borderRadius:99,border:'none',cursor:'pointer',position:'relative',flexShrink:0,
                  background:visible?'linear-gradient(90deg,#4ade80,#22c55e)':'rgba(0,0,0,0.1)' }}>
                <div style={{ width:18,height:18,borderRadius:99,background:'white',position:'absolute',top:2,
                  left:visible?20:2,transition:'left .15s',boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
              </button>
            </div>
          </div>
          <div style={{ padding:'14px 20px',borderTop:`1px solid ${theme.border}`,display:'flex',gap:10 }}>
            <button onClick={onClose}
              style={{ flex:1,padding:'11px 0',borderRadius:12,border:`1px solid ${theme.border}`,
                background:'transparent',color:theme.muted,fontWeight:700,fontSize:13,cursor:'pointer' }}>
              Annuler
            </button>
            <button onClick={submit}
              style={{ flex:2,padding:'11px 0',borderRadius:12,border:'none',cursor:'pointer',
                background:'#1a73e8', color:'white', fontWeight:800,fontSize:13 }}>
              {init?'Enregistrer':'Creer le service'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const CatFormModal = ({ open, onClose, onSubmit, init }) => {
    const COLORS = ['#111827','#374151','#4ade80','#f87171','#fbbf24','#f97316','#ec4899','#374151','#8b5cf6','#10b981'];
    const ICONS_LIST = ['Tag','Scissors','Spa','Star','Heart','Bolt','Gem','Crown','Brush','Smile'];
    const [name,  setName]  = useState(init?.name  || '');
    const [color, setColor] = useState(init?.color || '#111827');
    const [icon,  setIcon]  = useState(init?.icon  || 'Scissors');
    const [err,   setErr]   = useState('');
    if (!open) return null;

    const inp = { width:'100%',padding:'10px 12px',borderRadius:10,outline:'none',
      background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.05)',
      border:`1.5px solid ${isDark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.12)'}`,
      color:theme.text,fontSize:14,fontFamily:'inherit',boxSizing:'border-box' };

    const submit = () => {
      if (!name.trim()) { setErr('Le nom est requis.'); return; }
      onSubmit({ name:name.trim(), color, icon });
    };

    return (
      <div style={{ position:'fixed',inset:0,zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:16,
        background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)' }}
        onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
        <div style={{ width:'100%',maxWidth:360,borderRadius:20,overflow:'hidden',
          background:theme.card,border:`1px solid ${theme.border}` }}>
          <div style={{ padding:'16px 20px',borderBottom:`1px solid ${theme.border}`,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
            <p style={{ fontWeight:800,fontSize:15,color:theme.text,margin:0 }}>{init?'Modifier la categorie':'Nouvelle categorie'}</p>
            <button onClick={onClose} style={{ width:30,height:30,borderRadius:8,border:'none',cursor:'pointer',
              background:isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.07)',color:theme.muted,fontSize:16 }}>✕</button>
          </div>
          <div style={{ padding:20,display:'flex',flexDirection:'column',gap:14 }}>
            {err && <p style={{ color:'#f87171',fontSize:12,margin:0 }}>{err}</p>}
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Nom *</p>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex : Colorations, Soins…" style={inp} />
            </div>
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:8 }}>Icône</p>
              <div style={{ display:'flex',gap:7,flexWrap:'wrap' }}>
                {ICONS_LIST.map(ic => {
                  const Ic = ICON_MAP[ic] || I.Tag;
                  const active = icon === ic;
                  return (
                    <button key={ic} onClick={() => setIcon(ic)}
                      style={{ width:36,height:36,borderRadius:10,border:`2px solid ${active?color:'transparent'}`,cursor:'pointer',
                        background:active?color:(isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'),
                        display:'flex',alignItems:'center',justifyContent:'center' }}>
                      <Ic style={{ width:16,height:16,color:active?'white':theme.muted }}/>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:8 }}>Couleur</p>
              <div style={{ display:'flex',gap:7,flexWrap:'wrap' }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    style={{ width:28,height:28,borderRadius:8,border:`2px solid ${color===c?'white':'transparent'}`,
                      background:c,cursor:'pointer',boxShadow:color===c?`0 0 0 2px ${c}`:'none' }}/>
                ))}
              </div>
            </div>
          </div>
          <div style={{ padding:'14px 20px',borderTop:`1px solid ${theme.border}`,display:'flex',gap:10 }}>
            <button onClick={onClose}
              style={{ flex:1,padding:'11px 0',borderRadius:12,border:`1px solid ${theme.border}`,
                background:'transparent',color:theme.muted,fontWeight:700,fontSize:13,cursor:'pointer' }}>
              Annuler
            </button>
            <button onClick={submit}
              style={{ flex:2,padding:'11px 0',borderRadius:12,border:'none',cursor:'pointer',
                background:`linear-gradient(135deg,${color},${color}bb)`,color:'white',fontWeight:800,fontSize:13 }}>
              {init?'Enregistrer':'Créer la categorie'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',padding:48 }}>
      <div style={{ width:32,height:32,borderRadius:99,border:'2px solid rgba(17,24,39,0.2)',
        borderTopColor:'#111827',animation:'spin 0.8s linear infinite' }}/>
    </div>
  );

  const orphanSvcs = services.filter(s => !s.booking_category_id || !cats.find(c => c.id === s.booking_category_id));

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
      <div style={{ borderRadius:16,padding:'12px 16px',
        background:isDark?'rgba(55,65,81,0.07)':'rgba(55,65,81,0.06)',
        border:'1px solid rgba(55,65,81,0.2)' }}>
        <p style={{ fontSize:12,fontWeight:800,color:'#374151',margin:'0 0 4px' }}>🌐 Catalogue de réservation</p>
        <p style={{ fontSize:12,color:theme.muted,margin:0,lineHeight:1.6 }}>
          Organisez vos <strong style={{ color:theme.text }}>catégories</strong> et <strong style={{ color:theme.text }}>services</strong> affichés sur le site de réservation.
          Glissez <strong style={{ color:theme.text }}>⠿</strong> pour un ordre indépendant de la caisse.
        </p>
      </div>

      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
        <button onClick={() => setCatForm({ open:true, init:null })}
          style={{ padding:'12px 0',borderRadius:16,border:'none',cursor:'pointer',fontWeight:800,fontSize:13,color:'white',
            background:'linear-gradient(135deg,#374151,#0891b2)',boxShadow:'0 4px 16px rgba(6,182,212,0.3)',
            display:'flex',alignItems:'center',justifyContent:'center',gap:7 }}>
          <I.Plus style={{ width:15,height:15 }}/> Catégorie
        </button>
        <button onClick={() => setSvcForm({ open:true, init:null, parentId:null })}
          style={{ padding:'12px 0',borderRadius:16,border:'none',cursor:'pointer',fontWeight:800,fontSize:13,color:'white',
            background:'#1a73e8',boxShadow:'0 4px 16px rgba(17,24,39,0.3)',
            display:'flex',alignItems:'center',justifyContent:'center',gap:7 }}>
          <I.Plus style={{ width:15,height:15 }}/> Service
        </button>
      </div>

      {cats.length === 0 && services.length === 0 && (
        <div style={{ borderRadius:20,padding:'48px 24px',textAlign:'center',
          background:theme.card,border:`1px solid ${theme.border}` }}>
          <I.Scissors style={{ width:44,height:44,color:theme.dim,margin:'0 auto 12px' }}/>
          <p style={{ fontWeight:700,color:theme.muted,margin:'0 0 4px' }}>Aucun service</p>
          <p style={{ fontSize:13,color:theme.dim,margin:0 }}>Commencez par créer une catégorie ou un service</p>
        </div>
      )}

      {cats.map(cat => {
        const CatIcon    = ICON_MAP[cat.icon] || I.Scissors;
        const catSvcs    = services.filter(s => s.booking_category_id === cat.id);
        const isOpen     = openCats.has(cat.id);
        const isDragOver = dragOver === cat.id && dragIdVis !== cat.id;
        const isDragging = dragIdVis === cat.id;

        return (
          <div key={cat.id}
            draggable
            onDragStart={e => onDragStartCat(e, cat.id)}
            onDragOver={e  => onDragOverCat(e, cat.id)}
            onDrop={e      => onDropCat(e, cat.id)}
            onDragLeave={() => setDragOver(null)}
            style={{ borderRadius:16,overflow:'hidden',
              border: isDragOver ? '2px dashed #374151' : `1px solid ${theme.border}`,
              background:isDark?'rgba(255,255,255,0.03)':'#ffffff',
              opacity:isDragging?0.45:1,
              transition:'opacity 0.15s,border 0.15s',
              boxShadow:isDark?'none':'0 1px 6px rgba(0,0,0,0.06)' }}>

            <div style={{ display:'flex',alignItems:'center',gap:10,padding:'12px 14px',
              background:isDark?'rgba(255,255,255,0.025)':'rgba(0,0,0,0.018)',
              cursor:'pointer',userSelect:'none' }}
              onClick={() => toggleCat(cat.id)}>

              <div style={{ display:'flex',flexDirection:'column',gap:2.5,flexShrink:0,
                cursor:'grab',opacity:0.28,padding:'3px 2px' }}
                onClick={e => e.stopPropagation()}>
                {[0,1,2].map(i => <div key={i} style={{ width:14,height:2,borderRadius:1,background:theme.muted }}/>)}
              </div>

              <div style={{ width:36,height:36,borderRadius:11,flexShrink:0,
                background:cat.color||'#111827',
                display:'flex',alignItems:'center',justifyContent:'center' }}>
                <CatIcon style={{ width:18,height:18,color:'white' }}/>
              </div>

              <div style={{ flex:1,minWidth:0 }}>
                <p style={{ fontWeight:800,fontSize:14,color:theme.text,margin:0,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{cat.name}</p>
                <p style={{ fontSize:11,color:theme.muted,margin:0 }}>
                  {catSvcs.length} service{catSvcs.length!==1?'s':''}
                </p>
              </div>

              <div style={{ display:'flex',gap:5,flexShrink:0 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => setSvcForm({ open:true, init:null, parentId:cat.id })}
                  style={{ width:28,height:28,borderRadius:8,border:'none',cursor:'pointer',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    background:'rgba(55,65,81,0.12)',color:'#374151',fontSize:16,fontWeight:900 }}
                  title="Ajouter un service">+</button>
                <button onClick={() => setCatForm({ open:true, init:cat })}
                  style={{ width:28,height:28,borderRadius:8,border:'none',cursor:'pointer',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    background:isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)' }}>
                  <I.Edit style={{ width:12,height:12,color:theme.muted }}/>
                </button>
                <button onClick={() => setDelCatId(cat.id)}
                  style={{ width:28,height:28,borderRadius:8,border:'none',cursor:'pointer',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    background:'rgba(239,68,68,0.1)' }}>
                  <I.Trash style={{ width:12,height:12,color:'#ef4444' }}/>
                </button>
              </div>

              <div style={{ width:20,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',
                transition:'transform 0.2s',transform:isOpen?'rotate(180deg)':'rotate(0deg)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={theme.muted} strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" style={{ width:14,height:14 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </div>

            {isOpen && (
              <div>
                {catSvcs.length === 0 ? (
                  <div style={{ padding:'14px 20px',textAlign:'center' }}>
                    <p style={{ fontSize:12,color:theme.dim,margin:0 }}>Aucun service — cliquez sur + pour en ajouter</p>
                  </div>
                ) : catSvcs.map((svc) => {
                  const dMin = svc.duration_minutes;
                  const durLabel = dMin >= 60
                    ? `${Math.floor(dMin/60)}h${dMin%60>0?String(dMin%60).padStart(2,'0'):''}`
                    : `${dMin} min`;
                  return (
                    <div key={svc.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',
                      borderTop:`1px solid ${theme.border}` }}>
                      <div style={{ width:3,height:22,borderRadius:99,flexShrink:0,
                        background:svc.color||cat.color||'#111827',opacity:0.6 }}/>
                      {svc.has_image ? (
                        <div style={{ width:40,height:40,borderRadius:9,flexShrink:0,overflow:'hidden',
                          background:isDark?'rgba(255,255,255,0.06)':'#f1f5f9', border:`1px solid ${theme.border}` }}>
                          <img src={mediaApi.serviceUrl(svc.id) + (svc._imgV ? `?v=${svc._imgV}` : '')}
                            alt="" style={{ width:'100%',height:'100%',objectFit:'cover',display:'block' }}
                            onError={e => { e.currentTarget.style.display='none'; }} />
                        </div>
                      ) : (
                        <div style={{ width:32,height:32,borderRadius:9,flexShrink:0,
                          background:svc.color||cat.color||'#111827',
                          display:'flex',alignItems:'center',justifyContent:'center' }}>
                          <I.Scissors style={{ width:13,height:13,color:'white' }}/>
                        </div>
                      )}
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ display:'flex',alignItems:'center',gap:5 }}>
                          <p style={{ fontWeight:600,fontSize:13,color:theme.text,margin:0,
                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{svc.name}</p>
                          {svc.is_active === false && (
                            <span style={{ fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:99,
                              background:'rgba(248,113,113,0.12)',color:'#f87171',flexShrink:0 }}>Masqué</span>
                          )}
                        </div>
                        <p style={{ fontSize:11,color:theme.muted,margin:0 }}>
                          ⏱ {durLabel}{svc.price!=null&&!svc.is_free_price?` · ${fmt(svc.price)} €`:svc.is_free_price?' · Prix libre':''}
                        </p>
                      </div>
                      <div style={{ display:'flex',gap:4,flexShrink:0 }}>
                        <button onClick={() => setSvcForm({ open:true,init:svc,parentId:cat.id })}
                          style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                            display:'flex',alignItems:'center',justifyContent:'center',
                            background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
                          <I.Edit style={{ width:11,height:11,color:theme.muted }}/>
                        </button>
                        <button onClick={() => setDelSvcId(svc.id)}
                          style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                            display:'flex',alignItems:'center',justifyContent:'center',
                            background:'rgba(239,68,68,0.1)' }}>
                          <I.Trash style={{ width:11,height:11,color:'#ef4444' }}/>
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => setSvcForm({ open:true,init:null,parentId:cat.id })}
                  style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,
                    padding:'10px 14px',border:'none',cursor:'pointer',
                    borderTop:`1px dashed ${isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.08)'}`,
                    background:'transparent',color:theme.muted,fontSize:12,fontWeight:600 }}
                  onMouseEnter={e=>e.currentTarget.style.background=isDark?'rgba(55,65,81,0.05)':'rgba(55,65,81,0.04)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <I.Plus style={{ width:12,height:12 }}/> Ajouter dans « {cat.name} »
                </button>
              </div>
            )}
          </div>
        );
      })}

      {orphanSvcs.length > 0 && (
        <div style={{ borderRadius:16,overflow:'hidden',
          border:`1px solid ${theme.border}`,
          background:isDark?'rgba(255,255,255,0.02)':'#fafafa' }}>
          <div style={{ padding:'10px 14px',borderBottom:`1px solid ${theme.border}`,
            background:isDark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)' }}>
            <p style={{ fontSize:11,fontWeight:700,color:theme.muted,margin:0 }}>Sans catégorie</p>
          </div>
          {orphanSvcs.map((svc, idx) => {
            const dMin = svc.duration_minutes;
            const durLabel = dMin>=60?`${Math.floor(dMin/60)}h${dMin%60>0?String(dMin%60).padStart(2,'0'):''}` :`${dMin} min`;
            return (
              <div key={svc.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',
                borderTop:idx>0?`1px solid ${theme.border}`:'none' }}>
                {svc.has_image ? (
                  <div style={{ width:40,height:40,borderRadius:9,flexShrink:0,overflow:'hidden',
                    background:isDark?'rgba(255,255,255,0.06)':'#f1f5f9', border:`1px solid ${theme.border}` }}>
                    <img src={mediaApi.serviceUrl(svc.id) + (svc._imgV ? `?v=${svc._imgV}` : '')}
                      alt="" style={{ width:'100%',height:'100%',objectFit:'cover',display:'block' }}
                      onError={e => { e.currentTarget.style.display='none'; }} />
                  </div>
                ) : (
                  <div style={{ width:32,height:32,borderRadius:9,flexShrink:0,
                    background:svc.color||'#111827',
                    display:'flex',alignItems:'center',justifyContent:'center' }}>
                    <I.Scissors style={{ width:13,height:13,color:'white' }}/>
                  </div>
                )}
                <div style={{ flex:1,minWidth:0 }}>
                  <p style={{ fontWeight:600,fontSize:13,color:theme.text,margin:0,
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{svc.name}</p>
                  <p style={{ fontSize:11,color:theme.muted,margin:0 }}>
                    ⏱ {durLabel}{svc.price!=null&&!svc.is_free_price?` · ${fmt(svc.price)} €`:svc.is_free_price?' · Prix libre':''}
                  </p>
                </div>
                <div style={{ display:'flex',gap:4 }}>
                  <button onClick={() => setSvcForm({ open:true,init:svc,parentId:null })}
                    style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
                    <I.Edit style={{ width:11,height:11,color:theme.muted }}/>
                  </button>
                  <button onClick={() => setDelSvcId(svc.id)}
                    style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      background:'rgba(239,68,68,0.1)' }}>
                    <I.Trash style={{ width:11,height:11,color:'#ef4444' }}/>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CatFormModal open={catForm.open} onClose={() => setCatForm({ open:false,init:null })}
        onSubmit={handleSaveCat} init={catForm.init} />
      <SvcFormModal open={svcForm.open} onClose={() => setSvcForm({ open:false,init:null,parentId:null })}
        onSubmit={handleSaveSvc} init={svcForm.init} parentId={svcForm.parentId} cats={cats} />
      <Confirm open={!!delCatId} onClose={() => setDelCatId(null)} onConfirm={handleDelCat}
        title="Supprimer cette catégorie ?"
        desc="Les services de cette catégorie seront conservés (sans catégorie)." theme={theme} />
      <Confirm open={!!delSvcId} onClose={() => setDelSvcId(null)} onConfirm={handleDelSvc}
        title="Supprimer ce service ?"
        desc="Les rendez-vous existants ne seront pas affectés." theme={theme} />
    </div>
  );
}
