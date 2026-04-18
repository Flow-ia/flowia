import { useState, useEffect, useCallback, useRef } from 'react';
import { mediaApi } from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';

const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo

export default function TabImages({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const { user } = useAuth();
  const [meta,    setMeta]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);

  const logoInputRef    = useRef(null);
  const profileInputRef = useRef(null);

  const userId = user?.userId;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const m = await mediaApi.getMeta(userId);
      setMeta(m);
    } catch { setMeta(null); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const validate = (file) => {
    if (!file) return null;
    if (!file.type?.startsWith('image/')) { showToast('Fichier non valide — image requise', 'error'); return null; }
    if (file.size > MAX_SIZE)             { showToast('Image trop lourde — 5 Mo max', 'error');      return null; }
    return file;
  };

  const uploadLogo = async (e) => {
    const file = validate(e.target.files?.[0]); if (!file) return;
    setBusy(true);
    try { await mediaApi.uploadLogo(file); await load(); showToast('Logo mis a jour ✓'); }
    catch (err) { showToast(err.message || 'Erreur upload', 'error'); }
    finally { setBusy(false); e.target.value = ''; }
  };

  const uploadProfile = async (e) => {
    const file = validate(e.target.files?.[0]); if (!file) return;
    setBusy(true);
    try { await mediaApi.uploadProfile(file); await load(); showToast('Photo de profil mise a jour ✓'); }
    catch (err) { showToast(err.message || 'Erreur upload', 'error'); }
    finally { setBusy(false); e.target.value = ''; }
  };

  const uploadCover = async (e) => {
    const file = validate(e.target.files?.[0]); if (!file) return;
    setBusy(true);
    try { await mediaApi.uploadCover(file); await load(); showToast('Photo ajoutee ✓'); }
    catch (err) { showToast(err.message || 'Erreur upload', 'error'); }
    finally { setBusy(false); e.target.value = ''; }
  };

  const deleteMedia = async (id) => {
    if (!id) return;
    setBusy(true);
    try { await mediaApi.deleteMedia(id); await load(); showToast('Image supprimee'); }
    catch { showToast('Erreur suppression', 'error'); }
    finally { setBusy(false); }
  };

  const renderSingle = (title, hint, url, mediaId, onPick, inputRef) => (
    <div style={{ borderRadius:16, overflow:'hidden', background:theme.card, border:`1px solid ${theme.border}` }}>
      <div style={{ padding:'14px 16px', borderBottom:`1px solid ${theme.border}` }}>
        <p style={{ fontSize:13, fontWeight:800, color:theme.text, margin:'0 0 2px' }}>{title}</p>
        {hint && <p style={{ fontSize:11, color:theme.muted, margin:0 }}>{hint}</p>}
      </div>
      <div style={{ padding:16 }}>
        <input ref={inputRef} type="file" accept="image/*" onChange={onPick} style={{ display:'none' }} />
        {url ? (
          <div style={{ position:'relative', borderRadius:12, overflow:'hidden', border:`1px solid ${theme.border}`, background:isDark?'rgba(255,255,255,0.04)':'#f8fafc' }}>
            <img src={url} alt="" style={{ width:'100%', height:160, objectFit:'cover', display:'block' }}/>
            <div style={{ display:'flex', gap:6, padding:8, borderTop:`1px solid ${theme.border}`, background:isDark?'rgba(0,0,0,0.2)':'white' }}>
              <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
                style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'none', cursor:'pointer',
                  background:'#1a73e8', color:'white', fontWeight:700, fontSize:12, opacity:busy?0.6:1 }}>
                Remplacer
              </button>
              <button type="button" onClick={() => deleteMedia(mediaId)} disabled={busy || !mediaId}
                style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'none', cursor:'pointer',
                  background:'rgba(239,68,68,0.12)', color:'#ef4444', fontWeight:700, fontSize:12, opacity:(busy||!mediaId)?0.5:1 }}>
                Supprimer
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            style={{ width:'100%', padding:'22px 14px', borderRadius:12, border:`2px dashed ${theme.border}`,
              background: isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)', cursor:'pointer',
              display:'flex', flexDirection:'column', alignItems:'center', gap:6, opacity:busy?0.6:1 }}>
            <span style={{ fontSize:22 }}>📷</span>
            <span style={{ fontSize:12, fontWeight:700, color:theme.muted }}>Ajouter une photo</span>
            <span style={{ fontSize:10, color:theme.dim }}>JPG / PNG — 5 Mo max</span>
          </button>
        )}
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:48 }}>
      <div style={{ width:32, height:32, borderRadius:99, border:'2px solid rgba(17,24,39,0.2)', borderTopColor:'#111827', animation:'spin 0.8s linear infinite' }}/>
    </div>
  );

  const coverCount = (meta?.cover_urls || []).length;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ borderRadius:16, padding:'12px 16px', background:isDark?'rgba(17,24,39,0.08)':'rgba(17,24,39,0.05)', border:'1px solid rgba(17,24,39,0.18)' }}>
        <p style={{ fontSize:12, fontWeight:800, color:theme.text, margin:'0 0 4px' }}>🖼️ Images du commerce</p>
        <p style={{ fontSize:12, color:theme.muted, margin:0, lineHeight:1.6 }}>
          Logo, photo de profil et jusqu'à 4 photos du salon — visibles sur votre site de réservation.
        </p>
      </div>

      {renderSingle('Logo',             'Format carré recommandé, fond transparent (PNG)', meta?.logo_url,    meta?.logo_id,    uploadLogo,    logoInputRef)}
      {renderSingle('Photo de profil',  'Format 400×400 px — JPG ou PNG',                   meta?.profile_url, meta?.profile_id, uploadProfile, profileInputRef)}

      <div style={{ borderRadius:16, overflow:'hidden', background:theme.card, border:`1px solid ${theme.border}` }}>
        <div style={{ padding:'14px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <p style={{ fontSize:13, fontWeight:800, color:theme.text, margin:0 }}>Photos du salon</p>
            <p style={{ fontSize:11, color:theme.muted, margin:'2px 0 0' }}>{coverCount}/4 photos</p>
          </div>
          {coverCount < 4 && (
            <label style={{ padding:'6px 14px', borderRadius:10, background:'linear-gradient(135deg,#374151,#0891b2)',
              color:'white', fontWeight:700, fontSize:12, cursor:'pointer', userSelect:'none', opacity:busy?0.6:1 }}>
              {busy ? '...' : '+ Ajouter'}
              <input type="file" accept="image/*" onChange={uploadCover} style={{ display:'none' }}/>
            </label>
          )}
        </div>
        <div style={{ padding:16 }}>
          {coverCount === 0 ? (
            <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              padding:'32px 0', borderRadius:14, cursor:'pointer',
              background:isDark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)',
              border:`2px dashed ${theme.border}` }}>
              <span style={{ fontSize:32, marginBottom:8 }}>🖼️</span>
              <p style={{ fontSize:13, fontWeight:700, color:theme.muted, margin:'0 0 2px' }}>Aucune photo</p>
              <p style={{ fontSize:11, color:theme.dim, margin:0 }}>Cliquez pour ajouter jusqu'à 4 photos</p>
              <input type="file" accept="image/*" onChange={uploadCover} style={{ display:'none' }}/>
            </label>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {meta.cover_urls.map((cover) => (
                <div key={cover.id} style={{ position:'relative', borderRadius:14, overflow:'hidden',
                  aspectRatio:'4/3', background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)' }}>
                  <img src={cover.url} alt="Galerie"
                    style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  <button onClick={() => deleteMedia(cover.id)} disabled={busy}
                    style={{ position:'absolute', top:6, right:6, width:26, height:26, borderRadius:99,
                      background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)',
                      border:'1px solid rgba(255,255,255,0.2)', color:'white', fontSize:13,
                      display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', lineHeight:1 }}>✕</button>
                </div>
              ))}
              {coverCount < 4 && (
                <label style={{ borderRadius:14, cursor:'pointer', aspectRatio:'4/3',
                  background:isDark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)',
                  border:`2px dashed ${theme.border}`,
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
                  <span style={{ fontSize:24 }}>+</span>
                  <span style={{ fontSize:11, fontWeight:600, color:theme.muted }}>Ajouter</span>
                  <input type="file" accept="image/*" onChange={uploadCover} style={{ display:'none' }}/>
                </label>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
