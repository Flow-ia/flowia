import { useState, useEffect, useCallback, useRef } from 'react';
import { I, ICON_MAP } from '../../../../utils/icons';
import { Confirm } from '../../../../components/UI';
import { bookingApi, mediaApi } from '../../../../utils/api';
import { fmt } from '../../shared';
import { formatDuration, reorderArray } from '../helpers';
import CatFormModal from '../modals/CatFormModal';
import SvcFormModal from '../modals/SvcFormModal';

// Catalogue booking — categories + services (drag&drop, image, prix libre, visibilite)
export default function BookingServices({ theme, showToast }) {
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
    const reordered = reorderArray(cats, from, to);
    saveOrderCats(reordered);
    showToast('Ordre mis a jour ✓');
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
                  const durLabel = formatDuration(svc.duration_minutes);
                  return (
                    <div key={svc.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',
                      borderTop:`1px solid ${theme.border}` }}>
                      <div style={{ width:3,height:22,borderRadius:99,flexShrink:0,
                        background:svc.color||cat.color||'#111827',opacity:0.6 }}/>
                      {svc.has_image ? (
                        <div style={{ width:40,height:40,borderRadius:9,flexShrink:0,overflow:'hidden',
                          background:isDark?'rgba(255,255,255,0.06)':'#f1f5f9', border:`1px solid ${theme.border}` }}>
                          <img src={mediaApi.serviceUrl(svc.id) + `?v=${svc._imgV || svc.image_version || 1}`}
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
            const durLabel = formatDuration(svc.duration_minutes);
            return (
              <div key={svc.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',
                borderTop:idx>0?`1px solid ${theme.border}`:'none' }}>
                {svc.has_image ? (
                  <div style={{ width:40,height:40,borderRadius:9,flexShrink:0,overflow:'hidden',
                    background:isDark?'rgba(255,255,255,0.06)':'#f1f5f9', border:`1px solid ${theme.border}` }}>
                    <img src={mediaApi.serviceUrl(svc.id) + `?v=${svc._imgV || svc.image_version || 1}`}
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
        onSubmit={handleSaveCat} init={catForm.init} theme={theme} />
      <SvcFormModal open={svcForm.open} onClose={() => setSvcForm({ open:false,init:null,parentId:null })}
        onSubmit={handleSaveSvc} init={svcForm.init} parentId={svcForm.parentId} cats={cats} theme={theme} />
      <Confirm open={!!delCatId} onClose={() => setDelCatId(null)} onConfirm={handleDelCat}
        title="Supprimer cette catégorie ?"
        desc="Les services de cette catégorie seront conservés (sans catégorie)." theme={theme} />
      <Confirm open={!!delSvcId} onClose={() => setDelSvcId(null)} onConfirm={handleDelSvc}
        title="Supprimer ce service ?"
        desc="Les rendez-vous existants ne seront pas affectés." theme={theme} />
    </div>
  );
}
