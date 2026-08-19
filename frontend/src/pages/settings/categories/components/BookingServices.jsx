import { useState, useEffect, useCallback, useRef } from 'react';
import { I, ICON_MAP } from '../../../../utils/icons';
import { Confirm } from '../../../../components/UI';
import { bookingApi, mediaApi } from '../../../../utils/api';
import { fmt } from '../../shared';
import { formatDuration, reorderArray } from '../helpers';
import CatFormModal from '../modals/CatFormModal';
import SvcFormModal from '../modals/SvcFormModal';
import { Button } from '../../../../components/primitives';

// Catalogue booking — categories + services (drag&drop, image, prix libre, visibilite)
export default function BookingServices({ theme, showToast }) {
  const t = theme;
  const [cats,     setCats]     = useState([]);
  const [services, setServices] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const [catForm,  setCatForm]  = useState({ open:false, init:null });
  const [svcForm,  setSvcForm]  = useState({ open:false, init:null, parentId:null });
  const [delCatId, setDelCatId] = useState(null);
  const [delSvcId, setDelSvcId] = useState(null);
  // Accordion : fermé par défaut (user onboarding feedback). L'utilisateur
  // clique sur une catégorie pour la déplier.
  const [openCats, setOpenCats] = useState(() => new Set());
  const dragId      = useRef(null);
  const [dragIdVis, setDragIdVis] = useState(null);
  const [dragOver,  setDragOver]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        bookingApi.getServiceCategories(),
        bookingApi.getServices(),
      ]);
      setCats(c);
      setServices(s);
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
        showToast('Categorie modifiee');
      } else {
        const created = await bookingApi.createServiceCategory(data);
        setCats(prev => [...prev, created]);
        setOpenCats(prev => new Set([...prev, created.id]));
        showToast('Categorie creee');
      }
    } catch { showToast('Erreur', 'error'); }
    setCatForm({ open:false, init:null });
  };

  const handleDelCat = async () => {
    try {
      await bookingApi.deleteServiceCategory(delCatId);
      setCats(prev => prev.filter(c => c.id !== delCatId));
      setServices(prev => prev.map(s => s.booking_category_id === delCatId ? { ...s, booking_category_id: null } : s));
      showToast('Categorie supprimee');
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
        setServices(prev => prev.map(s => s.id === saved.id ? { ...s, has_image:true, _imgV:Date.now() } : s));
      } else if (_imageAction === 'delete' && saved?.id) {
        await mediaApi.deleteServiceImage(saved.id);
        setServices(prev => prev.map(s => s.id === saved.id ? { ...s, has_image:false } : s));
      }
      showToast(svcForm.init ? 'Service modifie' : 'Service cree');
    } catch (e) { showToast(e?.message || 'Erreur', 'error'); }
    setSvcForm({ open:false, init:null, parentId:null });
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
  const onDropCat = (e, targetId) => {
    e.preventDefault();
    const srcId = dragId.current;
    dragId.current = null; setDragIdVis(null); setDragOver(null);
    if (!srcId || srcId === targetId) return;
    const from = cats.findIndex(c => c.id === srcId);
    const to   = cats.findIndex(c => c.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = reorderArray(cats, from, to);
    saveOrderCats(reordered);
    showToast('Ordre mis a jour');
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:48 }}>
      <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24"
           style={{ color:t.text }}>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
        <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  );

  const orphanSvcs = services.filter(s => !s.booking_category_id || !cats.find(c => c.id === s.booking_category_id));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ borderRadius:12, padding:'12px 16px', background:'#ecfeff' }}>
        <p style={{ fontSize:12, fontWeight:500, color:'#0e7490', margin:'0 0 4px' }}>
          Catalogue de reservation
        </p>
        <p style={{ fontSize:12, color:'#0e7490', opacity:0.85, margin:0, lineHeight:1.6 }}>
          Organisez vos categories et services affiches sur le site de reservation.
          {' '}Glissez la poignee pour un ordre independant de la caisse.
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <Button variant="secondary" type="button" onClick={() => setCatForm({ open:true, init:null })}>
          <I.Plus style={{ width:14, height:14, marginRight:6 }}/>
          Categorie
        </Button>
        <Button variant="primary" type="button" onClick={() => setSvcForm({ open:true, init:null, parentId:null })}>
          <I.Plus style={{ width:14, height:14, marginRight:6 }}/>
          Service
        </Button>
      </div>

      {cats.length === 0 && services.length === 0 && (
        <div style={{ borderRadius:12, padding:'48px 24px', textAlign:'center',
                      background:t.card, border:`0.5px solid ${t.border}` }}>
          <I.Scissors style={{ width:40, height:40, color:t.dim, margin:'0 auto 12px', display:'block' }}/>
          <p style={{ fontWeight:500, color:t.muted, margin:'0 0 4px' }}>Aucun service</p>
          <p style={{ fontSize:13, color:t.dim, margin:0 }}>Commencez par creer une categorie ou un service</p>
        </div>
      )}

      {cats.map(cat => {
        const CatIcon    = ICON_MAP[cat.icon] || I.Scissors;
        const catSvcs    = services.filter(s => s.booking_category_id === cat.id);
        const isOpen     = openCats.has(cat.id);
        const isDragOver = dragOver === cat.id && dragIdVis !== cat.id;
        const isDragging = dragIdVis === cat.id;

        return (
          <div key={cat.id} draggable
               onDragStart={e => onDragStartCat(e, cat.id)}
               onDragOver={e => onDragOverCat(e, cat.id)}
               onDrop={e => onDropCat(e, cat.id)}
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
                <CatIcon style={{ width:17, height:17, color:'white' }}/>
              </div>

              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:500, fontSize:14, color:t.text, margin:0,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {cat.name}
                </p>
                <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                  {catSvcs.length} service{catSvcs.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div style={{ display:'flex', gap:5, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => setSvcForm({ open:true, init:null, parentId:cat.id })}
                        title="Ajouter un service"
                        style={{ width:28, height:28, borderRadius:8, border:'none', cursor:'pointer',
                                 background:'#ecfeff', color:'#0e7490',
                                 display:'flex', alignItems:'center', justifyContent:'center',
                                 fontFamily:'inherit' }}>
                  <I.Plus style={{ width:13, height:13 }}/>
                </button>
                <button onClick={() => setCatForm({ open:true, init:cat })}
                        style={{ width:28, height:28, borderRadius:8, border:'none', cursor:'pointer',
                                 background:t.cardAlt,
                                 display:'flex', alignItems:'center', justifyContent:'center',
                                 fontFamily:'inherit' }}>
                  <I.Edit style={{ width:12, height:12, color:t.muted }}/>
                </button>
                <button onClick={() => setDelCatId(cat.id)}
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
                {catSvcs.length === 0 ? (
                  <div style={{ padding:'14px 20px', textAlign:'center' }}>
                    <p style={{ fontSize:12, color:t.dim, margin:0 }}>
                      Aucun service — cliquez sur + pour en ajouter
                    </p>
                  </div>
                ) : catSvcs.map((svc) => {
                  const durLabel = formatDuration(svc.duration_minutes);
                  return (
                    <div key={svc.id}
                         style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                                  borderTop:`0.5px solid ${t.separator}` }}>
                      <div style={{ width:3, height:22, borderRadius:99, flexShrink:0,
                                    background: svc.color || cat.color || t.text, opacity:0.6 }}/>
                      {svc.has_image ? (
                        <div style={{ width:40, height:40, borderRadius:8, flexShrink:0, overflow:'hidden',
                                      background:t.cardAlt,
                                      border:`0.5px solid ${t.border}` }}>
                          <img src={mediaApi.serviceUrl(svc.id) + `?v=${svc._imgV || svc.image_version || 1}`}
                               alt=""
                               style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                               onError={e => { e.currentTarget.style.display = 'none'; }}/>
                        </div>
                      ) : (
                        <div style={{ width:30, height:30, borderRadius:8, flexShrink:0,
                                      background: svc.color || cat.color || t.text,
                                      display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <I.Scissors style={{ width:13, height:13, color:'white' }}/>
                        </div>
                      )}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <p style={{ fontWeight:500, fontSize:13, color:t.text, margin:0,
                                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {svc.name}
                          </p>
                          {svc.is_active === false && (
                            <span style={{ fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:99,
                                           background:'#fef2f2', color:'#991b1b', flexShrink:0 }}>
                              Masque
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                          {durLabel}
                          {svc.price != null && !svc.is_free_price
                            ? ` · ${fmt(svc.price)} DA`
                            : svc.is_free_price ? ' · Prix libre' : ''}
                        </p>
                      </div>
                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                        <button onClick={() => setSvcForm({ open:true, init:svc, parentId:cat.id })}
                                style={{ width:26, height:26, borderRadius:6, border:'none', cursor:'pointer',
                                         background:t.cardAlt,
                                         display:'flex', alignItems:'center', justifyContent:'center',
                                         fontFamily:'inherit' }}>
                          <I.Edit style={{ width:11, height:11, color:t.muted }}/>
                        </button>
                        <button onClick={() => setDelSvcId(svc.id)}
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
                <button onClick={() => setSvcForm({ open:true, init:null, parentId:cat.id })}
                        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                                 padding:'10px 14px', border:'none', cursor:'pointer',
                                 borderTop:`0.5px solid ${t.separator}`,
                                 background:'transparent', color:t.muted, fontSize:12, fontWeight:500,
                                 fontFamily:'inherit' }}
                        onMouseEnter={e => { e.currentTarget.style.background = t.cardAlt; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <I.Plus style={{ width:12, height:12 }}/> {`Ajouter dans « ${cat.name} »`}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {orphanSvcs.length > 0 && (
        <div style={{ borderRadius:12, overflow:'hidden',
                      border:`0.5px solid ${t.border}`, background:t.cardAlt }}>
          <div style={{ padding:'10px 14px',
                        borderBottom:`0.5px solid ${t.separator}` }}>
            <p style={{ fontSize:11, fontWeight:500, color:t.muted, margin:0 }}>Sans categorie</p>
          </div>
          {orphanSvcs.map((svc, idx) => {
            const durLabel = formatDuration(svc.duration_minutes);
            return (
              <div key={svc.id}
                   style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                            borderTop: idx > 0 ? `0.5px solid ${t.separator}` : 'none' }}>
                {svc.has_image ? (
                  <div style={{ width:40, height:40, borderRadius:8, flexShrink:0, overflow:'hidden',
                                background:t.cardAlt, border:`0.5px solid ${t.border}` }}>
                    <img src={mediaApi.serviceUrl(svc.id) + `?v=${svc._imgV || svc.image_version || 1}`}
                         alt=""
                         style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                         onError={e => { e.currentTarget.style.display = 'none'; }}/>
                  </div>
                ) : (
                  <div style={{ width:30, height:30, borderRadius:8, flexShrink:0,
                                background: svc.color || t.text,
                                display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <I.Scissors style={{ width:13, height:13, color:'white' }}/>
                  </div>
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:500, fontSize:13, color:t.text, margin:0,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {svc.name}
                  </p>
                  <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                    {durLabel}
                    {svc.price != null && !svc.is_free_price
                      ? ` · ${fmt(svc.price)} DA`
                      : svc.is_free_price ? ' · Prix libre' : ''}
                  </p>
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  <button onClick={() => setSvcForm({ open:true, init:svc, parentId:null })}
                          style={{ width:26, height:26, borderRadius:6, border:'none', cursor:'pointer',
                                   background:t.cardAlt,
                                   display:'flex', alignItems:'center', justifyContent:'center',
                                   fontFamily:'inherit' }}>
                    <I.Edit style={{ width:11, height:11, color:t.muted }}/>
                  </button>
                  <button onClick={() => setDelSvcId(svc.id)}
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
      )}

      <CatFormModal open={catForm.open} onClose={() => setCatForm({ open:false, init:null })}
                    onSubmit={handleSaveCat} init={catForm.init} theme={theme}/>
      <SvcFormModal open={svcForm.open} onClose={() => setSvcForm({ open:false, init:null, parentId:null })}
                    onSubmit={handleSaveSvc} init={svcForm.init} parentId={svcForm.parentId}
                    cats={cats} theme={theme}/>
      <Confirm open={!!delCatId} onClose={() => setDelCatId(null)} onConfirm={handleDelCat}
               title="Supprimer cette categorie ?"
               message="Les services de cette categorie seront conserves (sans categorie)."
               theme={theme}/>
      <Confirm open={!!delSvcId} onClose={() => setDelSvcId(null)} onConfirm={handleDelSvc}
               title="Supprimer ce service ?"
               message="Les rendez-vous existants ne seront pas affectes."
               theme={theme}/>
    </div>
  );
}
