import { useState, useEffect, useCallback, useRef } from 'react';
import { mediaApi } from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';
import { I } from '../../utils/icons';

const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo
const withVersion = (url, v) => v ? `${url}?v=${v}` : url;

export default function TabImages({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const { user } = useAuth();
  const [meta,    setMeta]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [open,    setOpen]    = useState(false); // accordéon fermé par défaut

  const logoInputRef    = useRef(null);
  const profileInputRef = useRef(null);
  const coverInputRef   = useRef(null);

  const userId = user?.userId;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try { setMeta(await mediaApi.getMeta(userId)); }
    catch { setMeta(null); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const validate = (file) => {
    if (!file) return null;
    if (!file.type?.startsWith('image/')) { showToast('Fichier non valide — image requise', 'error'); return null; }
    if (file.size > MAX_SIZE)             { showToast('Image trop lourde — 5 Mo max', 'error');      return null; }
    return file;
  };

  const upload = async (fn, successMsg) => async (e) => {
    const file = validate(e.target.files?.[0]); if (!file) { e.target.value = ''; return; }
    setBusy(true);
    try { await fn(file); await load(); showToast(successMsg); }
    catch (err) { showToast(err.message || 'Erreur upload', 'error'); }
    finally { setBusy(false); e.target.value = ''; }
  };

  const uploadLogo    = upload(mediaApi.uploadLogo,    'Logo mis a jour ✓');
  const uploadProfile = upload(mediaApi.uploadProfile, 'Photo de profil mise a jour ✓');
  const uploadCover   = upload(mediaApi.uploadCover,   'Photo ajoutee ✓');

  const deleteMedia = async (id) => {
    if (!id) return;
    setBusy(true);
    try { await mediaApi.deleteMedia(id); await load(); showToast('Image supprimee'); }
    catch { showToast('Erreur suppression', 'error'); }
    finally { setBusy(false); }
  };

  const iconBtn = (onClick, Icon, color, bg, disabled) => (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ width:32, height:32, borderRadius:9, border:'none',
        display:'flex', alignItems:'center', justifyContent:'center',
        background: bg, cursor: disabled?'default':'pointer', opacity: disabled?0.4:1, flexShrink:0 }}>
      <Icon style={{ width:13, height:13, color }} />
    </button>
  );

  // Ligne compacte : thumbnail carré + label + icônes (edit/trash)
  const SingleRow = ({ title, hint, url, mediaId, onPick, inputRef }) => (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
      borderRadius:12, background: isDark?'rgba(255,255,255,0.03)':'#fafafa',
      border:`1px solid ${theme.border}`, flexWrap:'wrap' }}>
      <input ref={inputRef} type="file" accept="image/*" onChange={onPick} style={{ display:'none' }} />

      {/* Thumbnail carré compact */}
      <div style={{ width:56, height:56, borderRadius:10, flexShrink:0, overflow:'hidden',
        background: url ? 'transparent' : (isDark?'rgba(255,255,255,0.06)':'#e5e7eb'),
        border: url ? `1px solid ${theme.border}` : `2px dashed ${theme.border}`,
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        {url ? (
          <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        ) : (
          <I.Camera style={{ width:18, height:18, color:theme.dim }} />
        )}
      </div>

      {/* Libellé */}
      <div style={{ flex:1, minWidth:120 }}>
        <p style={{ margin:0, fontSize:13, fontWeight:800, color:theme.text }}>{title}</p>
        {hint && <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>{hint}</p>}
      </div>

      {/* Icônes */}
      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
        {iconBtn(() => inputRef.current?.click(), I.Edit, '#1a73e8',
          isDark?'rgba(26,115,232,0.18)':'rgba(26,115,232,0.12)', busy)}
        {iconBtn(() => deleteMedia(mediaId), I.Trash, '#ef4444',
          'rgba(239,68,68,0.12)', busy || !mediaId)}
      </div>
    </div>
  );

  const coverList  = meta?.cover_list || [];
  const coverCount = coverList.length;
  const logoUrl    = meta?.logo_id    ? withVersion(mediaApi.logoUrl(userId),    meta.logo_version)    : null;
  const profileUrl = meta?.profile_id ? withVersion(mediaApi.profileUrl(userId), meta.profile_version) : null;

  return (
    <div style={{ borderRadius:16, overflow:'hidden', background:theme.card, border:`1px solid ${theme.border}` }}>
      {/* Header accordéon — cliquable */}
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
          padding:'12px 14px', border:'none', cursor:'pointer', textAlign:'left',
          background: isDark?'rgba(255,255,255,0.025)':'rgba(0,0,0,0.018)' }}>
        <div style={{ width:32, height:32, borderRadius:10, flexShrink:0,
          background:'rgba(55,65,81,0.12)', color:'#374151',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <I.Camera style={{ width:15, height:15 }} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:13, fontWeight:800, color:theme.text }}>Images du commerce</p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>
            Logo · profil · {coverCount}/4 photos
          </p>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke={theme.muted} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ width:14, height:14, flexShrink:0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform .2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Contenu déplié */}
      {open && (
        <div style={{ padding:12, display:'flex', flexDirection:'column', gap:10,
          borderTop:`1px solid ${theme.border}` }}>
          {loading ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
              <div style={{ width:24, height:24, borderRadius:99,
                border:'2px solid rgba(17,24,39,0.2)', borderTopColor:'#111827',
                animation:'spin 0.8s linear infinite' }}/>
            </div>
          ) : (
            <>
              <SingleRow title="Logo" hint="Petit carré PNG (fond transparent)"
                url={logoUrl} mediaId={meta?.logo_id}
                onPick={uploadLogo} inputRef={logoInputRef} />
              <SingleRow title="Photo de profil" hint="Carré 400×400 — JPG ou PNG"
                url={profileUrl} mediaId={meta?.profile_id}
                onPick={uploadProfile} inputRef={profileInputRef} />

              {/* Photos du salon — grille compacte */}
              <div style={{ padding:'10px 12px', borderRadius:12,
                background: isDark?'rgba(255,255,255,0.03)':'#fafafa',
                border:`1px solid ${theme.border}` }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div>
                    <p style={{ margin:0, fontSize:13, fontWeight:800, color:theme.text }}>Photos du salon</p>
                    <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>{coverCount}/4 photos</p>
                  </div>
                  {coverCount < 4 && iconBtn(
                    () => coverInputRef.current?.click(), I.Edit, '#1a73e8',
                    isDark?'rgba(26,115,232,0.18)':'rgba(26,115,232,0.12)', busy)}
                  <input ref={coverInputRef} type="file" accept="image/*" onChange={uploadCover} style={{ display:'none' }}/>
                </div>

                {coverCount === 0 ? (
                  <button type="button" onClick={() => coverInputRef.current?.click()} disabled={busy}
                    style={{ width:'100%', padding:'14px 10px', borderRadius:10,
                      border:`2px dashed ${theme.border}`, cursor:'pointer',
                      background: isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    <I.Camera style={{ width:16, height:16, color:theme.muted }} />
                    <span style={{ fontSize:12, fontWeight:700, color:theme.muted }}>Ajouter une photo</span>
                  </button>
                ) : (
                  <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fill, minmax(90px, 1fr))', gap:8 }}>
                    {coverList.map((cover) => (
                      <div key={cover.id} style={{ position:'relative', borderRadius:10, overflow:'hidden',
                        aspectRatio:'1/1', background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)',
                        border:`1px solid ${theme.border}` }}>
                        <img src={withVersion(mediaApi.coverUrl(userId, cover.id), cover.version)} alt="Galerie"
                          style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                        <button onClick={() => deleteMedia(cover.id)} disabled={busy}
                          style={{ position:'absolute', top:4, right:4, width:22, height:22, borderRadius:99,
                            background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)',
                            border:'1px solid rgba(255,255,255,0.2)',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            cursor:busy?'default':'pointer' }}>
                          <I.Trash style={{ width:10, height:10, color:'white' }} />
                        </button>
                      </div>
                    ))}
                    {coverCount < 4 && (
                      <button type="button" onClick={() => coverInputRef.current?.click()} disabled={busy}
                        style={{ borderRadius:10, cursor:'pointer', aspectRatio:'1/1',
                          background:isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)',
                          border:`2px dashed ${theme.border}`,
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <I.Camera style={{ width:18, height:18, color:theme.muted }} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
