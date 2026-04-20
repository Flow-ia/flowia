import { useState, useRef } from 'react';
import { mediaApi } from '../../../../utils/api';
import { MODAL_COLORS } from '../constants';

// Modal Service booking — creer/editer un service (nom, duree, prix, image, categorie, visibilite)
export default function SvcFormModal({ open, onClose, onSubmit, init, parentId, cats: catList, theme }) {
  const isDark = theme.mode === 'dark';
  const [name,      setName]     = useState(init?.name || '');
  const [desc,      setDesc]     = useState(init?.description || '');
  const [duration,  setDuration] = useState(init?.duration_minutes || 30);
  const [price,     setPrice]    = useState(init?.price != null ? String(init.price) : '');
  const [freePrice, setFreePrice]= useState(init?.is_free_price || false);
  const [color,     setColor]    = useState(init?.color || '#111827');
  const [catId,     setCatId]    = useState(init?.booking_category_id || parentId || '');
  const [visible,   setVisible]  = useState(init ? (init.is_active !== false) : true);
  const [err,       setErr]      = useState('');
  // Image : preview locale + action differee (upload/delete au submit)
  const [imgFile,   setImgFile]  = useState(null);
  const [imgPreview,setImgPreview]=useState(null);
  const [imgDel,    setImgDel]   = useState(false);
  const fileInputRef = useRef(null);
  const initHasImage = !!init?.has_image;
  const showCurrent  = initHasImage && !imgDel && !imgPreview;
  const showPreview  = !!imgPreview;
  const showNone     = !showCurrent && !showPreview;
  const currentUrl   = init?.id ? mediaApi.serviceUrl(init.id) + `?v=${init._imgV || init.image_version || 1}` : null;

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
              {MODAL_COLORS.map(c => (
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
}
