import { useState, useEffect, useRef } from 'react';
import { I, ICON_MAP } from '../../../../utils/icons';
import { Confirm } from '../../../../components/UI';
import { CategoryForm } from '../../../../components/Forms';
import { api } from '../../../../utils/api';
import { Card, fmt } from '../../shared';
import { reorderArray } from '../helpers';

// Categories caisse (revenue/expense) — gestion + drag&drop
export default function CaisseCategories({ categories, transactions, onAdd, onUpd, onDel, onReorder, showToast, theme }) {
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
    const reordered = reorderArray(cats, from, to);
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
    const reordered = reorderArray(products, from, to);
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
