import { useState, useRef } from 'react';
import { mediaApi } from '../../../../utils/api';
import { MODAL_COLORS } from '../constants';
import { I } from '../../../../utils/icons';
import { Button, Label } from '../../../../components/primitives';

// Modal Service booking — creer/editer un service
export default function SvcFormModal({ open, onClose, onSubmit, init, parentId, cats: catList, theme }) {
  const t = theme;
  const [name,      setName]      = useState(init?.name || '');
  const [desc,      setDesc]      = useState(init?.description || '');
  const [duration,  setDuration]  = useState(init?.duration_minutes || 30);
  const [price,     setPrice]     = useState(init?.price != null ? String(init.price) : '');
  const [freePrice, setFreePrice] = useState(init?.is_free_price || false);
  const [color,     setColor]     = useState(init?.color || '#111827');
  const [catId,     setCatId]     = useState(init?.booking_category_id || parentId || '');
  const [visible,   setVisible]   = useState(init ? (init.is_active !== false) : true);
  const [err,       setErr]       = useState('');
  const [imgFile,    setImgFile]    = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgDel,     setImgDel]     = useState(false);
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

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:14, fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  const submit = () => {
    if (!name.trim()) { setErr('Le nom est requis.'); return; }
    let _imageAction = null;
    if (imgFile) _imageAction = 'upload';
    else if (imgDel && initHasImage) _imageAction = 'delete';
    onSubmit({
      name:name.trim(), description:desc.trim() || null, duration_minutes:parseInt(duration) || 30,
      price: freePrice ? null : (price !== '' ? parseFloat(price) : null),
      is_free_price:freePrice, color,
      booking_category_id:catId || null, is_active:visible,
      _imageAction, _imageFile: imgFile,
    });
  };

  // Toggle sober : fond t.text quand on, t.cardAlt quand off
  const Tog = ({ on, onChange }) => (
    <button onClick={onChange}
            style={{ width:40, height:22, borderRadius:99, border:'none', cursor:'pointer',
                     position:'relative', flexShrink:0,
                     background: on ? t.text : t.cardAlt,
                     transition:'background 0.2s', fontFamily:'inherit' }}>
      <div style={{ width:18, height:18, borderRadius:'50%',
                    background: on ? t.bg : 'white',
                    position:'absolute', top:2, left: on ? 20 : 2,
                    transition:'left 0.15s',
                    boxShadow:t.shadowSm }}/>
    </button>
  );

  return (
    <div style={{ position:'fixed', inset:0, zIndex:60,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:16,
                  background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:'100%', maxWidth:400, borderRadius:16, overflow:'hidden',
                    background:t.elevated, border:`0.5px solid ${t.border}`,
                    boxShadow:t.shadowModal,
                    maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'14px 18px', borderBottom:`0.5px solid ${t.separator}`,
                      display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <p style={{ fontWeight:500, fontSize:15, color:t.text, margin:0 }}>
            {init ? 'Modifier le service' : 'Nouveau service'}
          </p>
          <button onClick={onClose}
                  style={{ width:28, height:28, borderRadius:8, border:'none', cursor:'pointer',
                           background:t.cardAlt, color:t.muted, fontSize:15,
                           display:'flex', alignItems:'center', justifyContent:'center',
                           fontFamily:'inherit' }}>
            ×
          </button>
        </div>
        <div style={{ overflowY:'auto', flex:1, padding:20,
                      display:'flex', flexDirection:'column', gap:14 }}>
          {err && <p style={{ color:'#991b1b', fontSize:12, margin:0 }}>{err}</p>}

          {/* Image principale du service */}
          <div>
            <Label>Image du service</Label>
            <input ref={fileInputRef} type="file" accept="image/*"
                   onChange={onPickFile} style={{ display:'none' }}/>
            {showNone && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                      style={{ width:'100%', padding:'22px 14px', borderRadius:8,
                               border:`0.5px solid ${t.borderStrong}`,
                               background:t.cardAlt, cursor:'pointer',
                               display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                               fontFamily:'inherit' }}>
                <I.Camera style={{ width:20, height:20, color:t.muted }}/>
                <span style={{ fontSize:13, fontWeight:500, color:t.muted }}>Ajouter une photo</span>
                <span style={{ fontSize:10, color:t.dim }}>JPG / PNG — 5 Mo max</span>
              </button>
            )}
            {(showCurrent || showPreview) && (
              <div style={{ borderRadius:8, overflow:'hidden',
                            border:`0.5px solid ${t.border}`,
                            background:t.cardAlt }}>
                <img src={showPreview ? imgPreview : currentUrl} alt=""
                     style={{ width:'100%', height:160, objectFit:'cover', display:'block' }}/>
                <div style={{ display:'flex', gap:8, padding:8,
                              borderTop:`0.5px solid ${t.separator}`,
                              background:t.card }}>
                  <Button variant="secondary" size="small" type="button"
                          onClick={() => fileInputRef.current?.click()} style={{ flex:1 }}>
                    Remplacer
                  </Button>
                  <Button variant="danger" size="small" type="button"
                          onClick={onRemoveImage} style={{ flex:1 }}>
                    Supprimer
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label>Nom *</Label>
            <input value={name} onChange={e => setName(e.target.value)}
                   placeholder="Ex : Coupe femme" style={inp}/>
          </div>
          <div>
            <Label>Description</Label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
                      placeholder="Visible par le client…"
                      style={{ ...inp, resize:'none', lineHeight:1.5 }}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <Label>Duree (min)</Label>
              <input type="number" value={duration} onChange={e => setDuration(e.target.value)}
                     min={5} step={5} style={inp}/>
            </div>
            <div>
              <Label>Prix (€)</Label>
              {freePrice
                ? <div style={{ ...inp, display:'flex', alignItems:'center', justifyContent:'center',
                                opacity:0.5 }}>Prix libre</div>
                : <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                         placeholder="0.00" step="0.01" style={inp}/>}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>Prix libre</p>
              <p style={{ fontSize:11, color:t.muted, margin:0 }}>Defini a la caisse</p>
            </div>
            <Tog on={freePrice} onChange={() => setFreePrice(p => !p)}/>
          </div>
          <div>
            <Label>Categorie</Label>
            <select value={catId} onChange={e => setCatId(e.target.value)}
                    style={{ ...inp, cursor:'pointer' }}>
              <option value="">— Sans categorie —</option>
              {catList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Couleur</Label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {MODAL_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                        style={{ width:28, height:28, borderRadius:8, background:c, cursor:'pointer',
                                 border: color === c ? `0.5px solid ${t.text}` : `0.5px solid ${t.border}`,
                                 transform: color === c ? 'scale(1.1)' : 'scale(1)',
                                 transition:'transform 0.15s ease',
                                 fontFamily:'inherit' }}/>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>Visible sur le site</p>
              <p style={{ fontSize:11, color:t.muted, margin:0 }}>Clients peuvent reserver</p>
            </div>
            <Tog on={visible} onChange={() => setVisible(p => !p)}/>
          </div>
        </div>
        <div style={{ padding:'14px 18px', borderTop:`0.5px solid ${t.separator}`,
                      display:'flex', gap:10 }}>
          <Button variant="secondary" type="button" onClick={onClose} style={{ flex:1 }}>
            Annuler
          </Button>
          <Button variant="primary" type="button" onClick={submit} style={{ flex:2 }}>
            {init ? 'Enregistrer' : 'Creer le service'}
          </Button>
        </div>
      </div>
    </div>
  );
}
