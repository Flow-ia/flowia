import { useState, useRef } from 'react';
import { I, ICON_MAP } from '../../../../utils/icons';
import { Confirm } from '../../../../components/UI';
import { CategoryForm } from '../../../../components/Forms';
import { api } from '../../../../utils/api';
import { Card, fmt } from '../../shared';
import { reorderArray } from '../helpers';
import { Button } from '../../../../components/primitives';

// Categories caisse (revenue/expense) — gestion + drag&drop
export default function CaisseCategories({ categories, transactions, onAdd, onUpd, onDel, onReorder, showToast, theme }) {
  const t = theme;
  const [formOpen,   setFormOpen]   = useState(false);
  const [formInit,   setFormInit]   = useState(null);
  const [formMode,   setFormMode]   = useState('product');
  const [formParent, setFormParent] = useState(null);
  const [delId,      setDelId]      = useState(null);

  // Accordion : fermé par défaut (user onboarding feedback). L'utilisateur
  // clique sur une catégorie pour la déplier.
  const [openCats, setOpenCats] = useState(() => new Set());

  const toggleCat = (id) => setOpenCats(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const [dragOver,  setDragOver]  = useState(null);
  const dragId     = useRef(null);
  const [dragIdVis, setDragIdVis] = useState(null);

  const openCreate = (mode, parentId = null) => {
    setFormInit(null); setFormMode(mode); setFormParent(parentId); setFormOpen(true);
  };
  const openEdit = (cat) => {
    setFormInit(cat);
    setFormMode(cat.parent_id ? 'product' : 'category');
    setFormParent(null); setFormOpen(true);
  };

  const handleSubmit = async (data) => {
    const payload = formParent && !data.parent_id ? { ...data, parent_id: formParent } : data;
    formInit ? await onUpd(formInit.id, payload) : await onAdd(payload);
    showToast(formInit ? 'Modifie' : 'Ajoute');
  };

  const saveOrder = async (reordered) => {
    if (onReorder) onReorder(reordered.map((it, i) => ({ ...it, sort_order: i })));
    try {
      await api.reorderCategories(reordered.map((it, i) => ({ id: it.id, sort_order: i })));
    } catch { showToast('Erreur sauvegarde ordre', 'error'); }
  };

  const onDragStartCat = (e, id) => { dragId.current = id; setDragIdVis(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOverCat  = (e, id) => { e.preventDefault(); setDragOver(id); };
  const onDropCat = (e, targetId, typeCats) => {
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
    showToast('Ordre mis a jour');
  };

  const onDragStartProd = (e, id) => { dragId.current = id; setDragIdVis(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDropProd = (e, targetId, products) => {
    e.preventDefault();
    const srcId = dragId.current;
    if (!srcId || srcId === targetId) { dragId.current = null; setDragIdVis(null); setDragOver(null); return; }
    const from = products.findIndex(p => p.id === srcId);
    const to   = products.findIndex(p => p.id === targetId);
    dragId.current = null; setDragIdVis(null); setDragOver(null);
    if (from < 0 || to < 0) return;
    const reordered = reorderArray(products, from, to);
    saveOrder(reordered);
    showToast('Ordre mis a jour');
  };

  const renderType = (type) => {
    const typeCats  = categories.filter(c => c.type === type);
    const catGroups = typeCats.filter(c => !c.parent_id);
    const products  = typeCats.filter(c => !!c.parent_id);
    if (typeCats.length === 0) return null;

    const typeColor = type === 'revenue' ? '#065f46' : '#991b1b';

    return (
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <p style={{ fontSize:11, fontWeight:500, color:typeColor, margin:'0 0 0 4px' }}>
          {type === 'revenue' ? '↑ Revenus' : '↓ Depenses'}
        </p>

        {catGroups.map(cat => {
          const CatIcon     = ICON_MAP[cat.icon] || I.Tag;
          const catProducts = products.filter(p => p.parent_id === cat.id);
          const catTot      = transactions
            .filter(tx => tx.category_id === cat.id || catProducts.some(p => p.id === tx.category_id))
            .reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
          const catCnt      = transactions
            .filter(tx => tx.category_id === cat.id || catProducts.some(p => p.id === tx.category_id)).length;
          const isOpen      = openCats.has(cat.id);
          const isDragOver  = dragOver === cat.id && dragIdVis !== cat.id;
          const isDragging  = dragIdVis === cat.id;

          return (
            <div key={cat.id} draggable
                 onDragStart={e => onDragStartCat(e, cat.id)}
                 onDragOver={e => onDragOverCat(e, cat.id)}
                 onDrop={e => onDropCat(e, cat.id, typeCats)}
                 onDragLeave={() => setDragOver(null)}
                 style={{ borderRadius:12, overflow:'hidden',
                          border: isDragOver ? `0.5px solid ${t.text}` : `0.5px solid ${t.border}`,
                          background:t.card,
                          opacity: isDragging ? 0.45 : 1,
                          transition:'opacity 0.15s, border 0.15s' }}>

              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
                            background:t.cardAlt, cursor:'pointer', userSelect:'none' }}
                   onClick={() => toggleCat(cat.id)}>

                <div style={{ display:'flex', flexDirection:'column', gap:2, flexShrink:0,
                              cursor:'grab', opacity:0.3, padding:'3px 2px' }}
                     onClick={e => e.stopPropagation()}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width:14, height:2, borderRadius:1, background:t.muted }}/>
                  ))}
                </div>

                <div style={{ width:36, height:36, borderRadius:8, flexShrink:0,
                              background: cat.color || t.text,
                              display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <CatIcon style={{ width:16, height:16, color:'white' }}/>
                </div>

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <p style={{ fontWeight:500, fontSize:13, color:t.text, margin:0,
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {cat.name}
                    </p>
                    <span style={{ fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:99,
                                   flexShrink:0, background:t.cardAlt, color:t.muted }}>
                      Categorie
                    </span>
                  </div>
                  <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                    {catProducts.length} produit{catProducts.length !== 1 ? 's' : ''} · {catCnt} tx · {fmt(catTot)} DA
                  </p>
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}
                     onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(cat)}
                          style={{ width:28, height:28, borderRadius:8, border:'none', cursor:'pointer',
                                   background:t.cardAlt,
                                   display:'flex', alignItems:'center', justifyContent:'center',
                                   fontFamily:'inherit' }}>
                    <I.Edit style={{ width:12, height:12, color:t.muted }}/>
                  </button>
                  <button onClick={() => setDelId(cat.id)}
                          style={{ width:28, height:28, borderRadius:8, border:'none', cursor:'pointer',
                                   background:'rgba(239,68,68,0.1)',
                                   display:'flex', alignItems:'center', justifyContent:'center',
                                   fontFamily:'inherit' }}>
                    <I.Trash style={{ width:12, height:12, color:'#991b1b' }}/>
                  </button>
                </div>

                <svg viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round"
                     style={{ width:14, height:14, flexShrink:0,
                              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition:'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              {isOpen && (
                <div>
                  {catProducts.length === 0 && (
                    <div style={{ padding:'14px 16px', textAlign:'center' }}>
                      <p style={{ fontSize:12, color:t.dim, margin:0 }}>Aucun produit dans cette categorie</p>
                    </div>
                  )}

                  {catProducts.map((prod) => {
                    const ProdIcon = ICON_MAP[prod.icon] || I.Tag;
                    const prodTot  = transactions.filter(tx => tx.category_id === prod.id)
                                                 .reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
                    const prodCnt  = transactions.filter(tx => tx.category_id === prod.id).length;
                    const isProdOver = dragOver === prod.id && dragIdVis !== prod.id;

                    return (
                      <div key={prod.id} draggable
                           onDragStart={e => { e.stopPropagation(); onDragStartProd(e, prod.id); }}
                           onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(prod.id); }}
                           onDrop={e => { e.stopPropagation(); onDropProd(e, prod.id, catProducts); }}
                           onDragLeave={() => setDragOver(null)}
                           style={{ display:'flex', alignItems:'center', gap:10,
                                    padding:'10px 14px 10px 18px',
                                    borderTop:`0.5px solid ${t.separator}`,
                                    opacity: dragIdVis === prod.id ? 0.45 : 1,
                                    borderLeft: isProdOver ? `2px solid ${t.text}` : '2px solid transparent',
                                    cursor:'grab', transition:'opacity 0.12s, border-left 0.1s',
                                    background: isProdOver ? t.cardAlt : 'transparent' }}>

                        <div style={{ display:'flex', flexDirection:'column', gap:2, flexShrink:0,
                                      cursor:'grab', opacity:0.25 }}>
                          {[0, 1].map(i => (
                            <div key={i} style={{ width:10, height:2, borderRadius:1, background:t.muted }}/>
                          ))}
                        </div>

                        <div style={{ width:3, height:22, borderRadius:99, flexShrink:0,
                                      background: prod.color || cat.color || t.text, opacity:0.55 }}/>

                        <div style={{ width:30, height:30, borderRadius:8, flexShrink:0,
                                      background: prod.color || t.text,
                                      display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <ProdIcon style={{ width:13, height:13, color:'white' }}/>
                        </div>

                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontWeight:500, fontSize:13, color:t.text, margin:0,
                                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {prod.name}
                          </p>
                          <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                            {prod.price != null ? `${fmt(prod.price)} DA` : 'Prix libre'} · {prodCnt} tx
                          </p>
                        </div>

                        <span style={{ fontSize:12, fontWeight:500, color:t.muted,
                                       fontFamily:'monospace', flexShrink:0, marginRight:6 }}>
                          {fmt(prodTot)} DA
                        </span>

                        <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                          <button onClick={() => openEdit(prod)}
                                  style={{ width:26, height:26, borderRadius:6, border:'none', cursor:'pointer',
                                           background:t.cardAlt,
                                           display:'flex', alignItems:'center', justifyContent:'center',
                                           fontFamily:'inherit' }}>
                            <I.Edit style={{ width:11, height:11, color:t.muted }}/>
                          </button>
                          <button onClick={() => setDelId(prod.id)}
                                  style={{ width:26, height:26, borderRadius:6, border:'none', cursor:'pointer',
                                           background:'rgba(239,68,68,0.1)',
                                           display:'flex', alignItems:'center', justifyContent:'center',
                                           fontFamily:'inherit' }}>
                            <I.Trash style={{ width:11, height:11, color:'#991b1b' }}/>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <button onClick={() => openCreate('product', cat.id)}
                          style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                                   padding:'10px 14px', border:'none', cursor:'pointer',
                                   borderTop:`0.5px solid ${t.separator}`,
                                   background:'transparent', color:t.muted,
                                   fontSize:12, fontWeight:500,
                                   transition:'background 0.1s', fontFamily:'inherit' }}
                          onMouseEnter={e => { e.currentTarget.style.background = t.cardAlt; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <I.Plus style={{ width:12, height:12 }}/>
                    {`Ajouter un produit dans « ${cat.name} »`}
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
            <div style={{ borderRadius:12, overflow:'hidden',
                          border:`0.5px solid ${t.border}`, background:t.cardAlt }}>
              <div style={{ padding:'10px 14px',
                            borderBottom:`0.5px solid ${t.separator}` }}>
                <p style={{ fontSize:11, fontWeight:500, color:t.muted, margin:0 }}>Sans categorie</p>
              </div>
              {orphans.map((prod, i) => {
                const ProdIcon = ICON_MAP[prod.icon] || I.Tag;
                const prodTot  = transactions.filter(tx => tx.category_id === prod.id)
                                             .reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
                return (
                  <div key={prod.id}
                       style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                                borderTop: i > 0 ? `0.5px solid ${t.separator}` : 'none' }}>
                    <div style={{ width:30, height:30, borderRadius:8, flexShrink:0,
                                  background: prod.color || t.text,
                                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <ProdIcon style={{ width:13, height:13, color:'white' }}/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:500, fontSize:13, color:t.text, margin:0,
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {prod.name}
                      </p>
                      <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                        {transactions.filter(tx => tx.category_id === prod.id).length} tx · {fmt(prodTot)} DA
                      </p>
                    </div>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={() => openEdit(prod)}
                              style={{ width:26, height:26, borderRadius:6, border:'none', cursor:'pointer',
                                       background:t.cardAlt,
                                       display:'flex', alignItems:'center', justifyContent:'center',
                                       fontFamily:'inherit' }}>
                        <I.Edit style={{ width:11, height:11, color:t.muted }}/>
                      </button>
                      <button onClick={() => setDelId(prod.id)}
                              style={{ width:26, height:26, borderRadius:6, border:'none', cursor:'pointer',
                                       background:'rgba(239,68,68,0.1)',
                                       display:'flex', alignItems:'center', justifyContent:'center',
                                       fontFamily:'inherit' }}>
                        <I.Trash style={{ width:11, height:11, color:'#991b1b' }}/>
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
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ borderRadius:12, padding:'12px 16px', background:'#eef2ff' }}>
        <p style={{ fontSize:12, fontWeight:500, color:'#4338ca', margin:'0 0 4px' }}>
          Organisation caisse
        </p>
        <p style={{ fontSize:12, color:'#4338ca', opacity:0.85, margin:0, lineHeight:1.6 }}>
          {"Cliquez sur une catégorie pour l'ouvrir / fermer."}
          {' '}Glissez la poignee pour reorganiser l'ordre d'affichage en caisse.
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <Button variant="secondary" type="button" onClick={() => openCreate('category')}>
          <I.Plus style={{ width:14, height:14, marginRight:6 }}/>
          Categorie
        </Button>
        <Button variant="primary" type="button" onClick={() => openCreate('product')}>
          <I.Plus style={{ width:14, height:14, marginRight:6 }}/>
          Produit / Service
        </Button>
      </div>

      {categories.length === 0 && (
        <Card theme={theme}>
          <div style={{ padding:'64px 0', textAlign:'center' }}>
            <I.Tag style={{ width:40, height:40, margin:'0 auto 12px', color:t.dim, display:'block' }}/>
            <p style={{ fontWeight:500, color:t.muted, margin:0 }}>Aucun element</p>
            <p style={{ fontSize:13, color:t.dim, margin:'4px 0 0' }}>Commencez par creer une categorie</p>
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
        defaultParent={formParent}/>
      <Confirm open={!!delId} onClose={() => setDelId(null)}
               onConfirm={() => { onDel(delId); setDelId(null); showToast('Supprime'); }}
               title="Supprimer cet element ?"
               message="Les transactions associees seront conservees."
               theme={theme}/>
    </div>
  );
}
