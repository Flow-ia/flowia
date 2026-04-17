import { useState, useEffect, useCallback } from 'react';
import { mediaApi } from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';

export default function TabImages({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const { user } = useAuth();
  const [meta,    setMeta]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const userId = user?.userId;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const m = await mediaApi.getMeta(userId);
      setMeta(m);
    } catch { /* pas d'images → meta null */ }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleUploadProfile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await mediaApi.uploadProfile(file);
      await load();
      showToast('Photo de profil mise a jour ✓');
    } catch (err) { showToast(err.message || 'Erreur upload', 'error'); }
    finally { setUploading(false); }
  };

  const handleUploadCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await mediaApi.uploadCover(file);
      await load();
      showToast('Photo ajoutee ✓');
    } catch (err) { showToast(err.message || 'Erreur upload', 'error'); }
    finally { setUploading(false); }
  };

  const handleDeleteMedia = async (id) => {
    try {
      await mediaApi.deleteMedia(id);
      await load();
      showToast('Photo supprimee');
    } catch { showToast('Erreur suppression', 'error'); }
  };

  const cardStyle = { borderRadius:16, overflow:'hidden', background:theme.card, border:`1px solid ${theme.border}` };
  const sectionHeader = { padding:'14px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:48 }}>
      <div style={{ width:32, height:32, borderRadius:99, border:'2px solid rgba(17,24,39,0.2)', borderTopColor:'#111827', animation:'spin 0.8s linear infinite' }}/>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      <div style={{ borderRadius:16, padding:'12px 16px', background:isDark?'rgba(17,24,39,0.08)':'rgba(17,24,39,0.05)', border:'1px solid rgba(17,24,39,0.18)' }}>
        <p style={{ fontSize:12, fontWeight:800, color:theme.text, margin:'0 0 4px' }}>Profil visible côté réservation</p>
        <p style={{ fontSize:12, color:theme.muted, margin:0, lineHeight:1.6 }}>
          Ces images sont affichées sur votre site de réservation public. 1 logo + jusqu'à 4 photos.
        </p>
      </div>

      <div style={cardStyle}>
        <div style={sectionHeader}>
          <p style={{ fontSize:13, fontWeight:800, color:theme.text, margin:0 }}>Logo / Photo de profil</p>
          <label style={{ padding:'6px 14px', borderRadius:10, background:'#1a73e8', color:'white', fontWeight:700, fontSize:12, cursor:'pointer', userSelect:'none' }}>
            {uploading ? '...' : 'Modifier'}
            <input type="file" accept="image/*" onChange={handleUploadProfile} style={{ display:'none' }}/>
          </label>
        </div>
        <div style={{ padding:16, display:'flex', alignItems:'center', gap:14 }}>
          {meta?.profile_url ? (
            <div style={{ position:'relative', flexShrink:0 }}>
              <img src={`${meta.profile_url}?t=${Date.now()}`} alt="Profil"
                style={{ width:80, height:80, borderRadius:20, objectFit:'cover', border:`2px solid ${theme.border}` }}/>
              <button onClick={() => { const id = meta?.profile_id; if (id) handleDeleteMedia(id); }}
                style={{ position:'absolute', top:-6, right:-6, width:22, height:22, borderRadius:99,
                  background:'#ef4444', border:'2px solid white', color:'white', fontSize:12,
                  display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', lineHeight:1 }}>✕</button>
            </div>
          ) : (
            <label style={{ width:80, height:80, borderRadius:20, flexShrink:0, cursor:'pointer',
              background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)',
              border:`2px dashed ${theme.border}`,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
              <span style={{ fontSize:24 }}>📷</span>
              <span style={{ fontSize:10, fontWeight:600, color:theme.muted }}>Ajouter</span>
              <input type="file" accept="image/*" onChange={handleUploadProfile} style={{ display:'none' }}/>
            </label>
          )}
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:theme.text, margin:'0 0 3px' }}>
              {user?.businessName || 'Votre salon'}
            </p>
            <p style={{ fontSize:11, color:theme.muted, margin:0 }}>Format recommandé : 400×400 px, JPG ou PNG</p>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionHeader}>
          <div>
            <p style={{ fontSize:13, fontWeight:800, color:theme.text, margin:0 }}>Photos du salon</p>
            <p style={{ fontSize:11, color:theme.muted, margin:'2px 0 0' }}>
              {(meta?.cover_urls || []).length}/4 photos
            </p>
          </div>
          {(meta?.cover_urls || []).length < 4 && (
            <label style={{ padding:'6px 14px', borderRadius:10, background:'linear-gradient(135deg,#374151,#0891b2)',
              color:'white', fontWeight:700, fontSize:12, cursor:'pointer', userSelect:'none' }}>
              {uploading ? '...' : '+ Ajouter'}
              <input type="file" accept="image/*" onChange={handleUploadCover} style={{ display:'none' }}/>
            </label>
          )}
        </div>
        <div style={{ padding:16 }}>
          {(meta?.cover_urls || []).length === 0 ? (
            <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              padding:'32px 0', borderRadius:14, cursor:'pointer',
              background:isDark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)',
              border:`2px dashed ${theme.border}` }}>
              <span style={{ fontSize:32, marginBottom:8 }}>🖼️</span>
              <p style={{ fontSize:13, fontWeight:700, color:theme.muted, margin:'0 0 2px' }}>Aucune photo</p>
              <p style={{ fontSize:11, color:theme.dim, margin:0 }}>Cliquez pour ajouter jusqu'à 4 photos</p>
              <input type="file" accept="image/*" onChange={handleUploadCover} style={{ display:'none' }}/>
            </label>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {meta.cover_urls.map((cover) => (
                <div key={cover.id} style={{ position:'relative', borderRadius:14, overflow:'hidden',
                  aspectRatio:'4/3', background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)' }}>
                  <img src={`${cover.url}?t=${Date.now()}`} alt="Galerie"
                    style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  <button onClick={() => handleDeleteMedia(cover.id)}
                    style={{ position:'absolute', top:6, right:6, width:26, height:26, borderRadius:99,
                      background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)',
                      border:'1px solid rgba(255,255,255,0.2)', color:'white', fontSize:13,
                      display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', lineHeight:1 }}>✕</button>
                </div>
              ))}
              {(meta?.cover_urls || []).length < 4 && (
                <label style={{ borderRadius:14, cursor:'pointer', aspectRatio:'4/3',
                  background:isDark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)',
                  border:`2px dashed ${theme.border}`,
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
                  <span style={{ fontSize:24 }}>+</span>
                  <span style={{ fontSize:11, fontWeight:600, color:theme.muted }}>Ajouter</span>
                  <input type="file" accept="image/*" onChange={handleUploadCover} style={{ display:'none' }}/>
                </label>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
