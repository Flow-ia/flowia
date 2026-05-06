import { useState, useEffect, useCallback, useRef } from 'react';
import { mediaApi } from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';
import { I } from '../../utils/icons';

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const FORMATS_HINT = 'JPG, PNG, WEBP ou GIF · 5 Mo max';
const withVersion = (url, v) => v ? `${url}?v=${v}` : url;

export default function TabImages({ theme, showToast }) {
  const t = theme;
  const { user } = useAuth();
  const [meta,    setMeta]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [open,    setOpen]    = useState(false);
  // Erreurs inline par emplacement (logo / profile / cover) — affichées
  // directement sous l'élément concerné au lieu d'un toast global.
  const [errors, setErrors]   = useState({ logo: '', profile: '', cover: '' });
  const setError = (k, v) => setErrors(prev => ({ ...prev, [k]: v }));

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
    if (!file) return { ok: false, error: '' };
    if (!ALLOWED_MIME.has(file.type)) return { ok: false, error: `Format non supporte. ${FORMATS_HINT}.` };
    if (file.size > MAX_SIZE)          return { ok: false, error: `Image trop lourde (${(file.size / 1024 / 1024).toFixed(1)} Mo). Max 5 Mo.` };
    return { ok: true, file };
  };

  const upload = (fn, successMsg, errKey) => async (e) => {
    const check = validate(e.target.files?.[0]);
    if (!check.ok) { setError(errKey, check.error); e.target.value = ''; return; }
    setError(errKey, '');
    setBusy(true);
    try { await fn(check.file); await load(); showToast(successMsg); }
    catch (err) { setError(errKey, err.message || 'Erreur upload'); }
    finally { setBusy(false); e.target.value = ''; }
  };

  const uploadLogo    = upload(mediaApi.uploadLogo,    'Logo mis a jour',              'logo');
  const uploadProfile = upload(mediaApi.uploadProfile, 'Photo de profil mise a jour',  'profile');
  const uploadCover   = upload(mediaApi.uploadCover,   'Photo ajoutee',                'cover');

  const deleteMedia = async (id) => {
    if (!id) return;
    setBusy(true);
    try { await mediaApi.deleteMedia(id); await load(); showToast('Image supprimee'); }
    catch { showToast('Erreur suppression', 'error'); }
    finally { setBusy(false); }
  };

  // Definir une cover comme photo principale (sort_order=0). Cette photo
  // sera celle affichee dans la marketplace /portail-client et en grand
  // sur la page de reservation publique.
  const setCoverMain = async (id) => {
    if (!id) return;
    setBusy(true);
    try {
      await mediaApi.setCoverMain(id);
      await load();
      showToast('Photo principale definie');
    } catch (e) {
      showToast(e.message || 'Erreur', 'error');
    } finally { setBusy(false); }
  };

  const iconBtn = (onClick, Icon, color, bg, disabled) => (
    <button type="button" onClick={onClick} disabled={disabled}
            style={{ width:30, height:30, borderRadius:8, border:'none',
                     display:'flex', alignItems:'center', justifyContent:'center',
                     background:bg, cursor: disabled ? 'default' : 'pointer',
                     opacity: disabled ? 0.4 : 1, flexShrink:0,
                     fontFamily:'inherit' }}>
      <Icon style={{ width:13, height:13, color }}/>
    </button>
  );

  const SingleRow = ({ title, hint, url, mediaId, onPick, inputRef, error }) => (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                    borderRadius:8, background:t.cardAlt,
                    border:`0.5px solid ${error ? '#fca5a5' : t.border}`, flexWrap:'wrap' }}>
        <input ref={inputRef} type="file"
               accept="image/jpeg,image/png,image/webp,image/gif"
               onChange={onPick} style={{ display:'none' }}/>
        <div style={{ width:56, height:56, borderRadius:8, flexShrink:0, overflow:'hidden',
                      background: url ? 'transparent' : t.cardAlt,
                      border:`0.5px solid ${t.borderStrong}`,
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
          {url
            ? <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            : <I.Camera style={{ width:18, height:18, color:t.dim }}/>}
        </div>
        <div style={{ flex:1, minWidth:120 }}>
          <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>{title}</p>
          {hint && <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>{hint}</p>}
          <p style={{ margin:'2px 0 0', fontSize:10, color:t.dim }}>{FORMATS_HINT}</p>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          {iconBtn(() => inputRef.current?.click(), I.Edit, '#4338ca', '#eef2ff', busy)}
          {iconBtn(() => deleteMedia(mediaId), I.Trash, '#991b1b',
                   'rgba(239,68,68,0.12)', busy || !mediaId)}
        </div>
      </div>
      {error && (
        <p style={{ margin:'4px 2px 0', fontSize:11, color:'#991b1b', fontWeight:500 }}>{error}</p>
      )}
    </div>
  );

  const coverList  = meta?.cover_list || [];
  const coverCount = coverList.length;
  const logoUrl    = meta?.logo_id    ? withVersion(mediaApi.logoUrl(userId),    meta.logo_version)    : null;
  const profileUrl = meta?.profile_id ? withVersion(mediaApi.profileUrl(userId), meta.profile_version) : null;

  return (
    <div style={{ borderRadius:12, overflow:'hidden',
                  background:t.card, border:`0.5px solid ${t.border}` }}>
      <button type="button" onClick={() => setOpen(o => !o)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                       padding:'12px 14px', border:'none', cursor:'pointer', textAlign:'left',
                       background:t.cardAlt, fontFamily:'inherit' }}>
        <div style={{ width:32, height:32, borderRadius:8, flexShrink:0,
                      background:t.cardAlt, color:t.muted,
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
          <I.Camera style={{ width:15, height:15 }}/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>Images du commerce</p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
            Logo · profil · {coverCount}/4 photos
          </p>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round"
             style={{ width:14, height:14, flexShrink:0,
                      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition:'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{ padding:12, display:'flex', flexDirection:'column', gap:10,
                      borderTop:`0.5px solid ${t.separator}` }}>
          {loading ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
              <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24"
                   style={{ color:t.text }}>
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
                <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
          ) : (
            <>
              <SingleRow title="Logo" hint="Petit carre (fond transparent conseille)"
                         url={logoUrl} mediaId={meta?.logo_id}
                         onPick={uploadLogo} inputRef={logoInputRef}
                         error={errors.logo}/>
              <SingleRow title="Photo de profil" hint="Carre 400x400"
                         url={profileUrl} mediaId={meta?.profile_id}
                         onPick={uploadProfile} inputRef={profileInputRef}
                         error={errors.profile}/>

              <div style={{ padding:'10px 12px', borderRadius:8,
                            background:t.cardAlt,
                            border:`0.5px solid ${errors.cover ? '#fca5a5' : t.border}` }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div>
                    <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>Photos du salon</p>
                    <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>{coverCount}/4 photos</p>
                    <p style={{ margin:'2px 0 0', fontSize:10, color:t.dim }}>{FORMATS_HINT}</p>
                  </div>
                  {coverCount < 4 && iconBtn(
                    () => coverInputRef.current?.click(), I.Edit, '#4338ca', '#eef2ff', busy)}
                  <input ref={coverInputRef} type="file"
                         accept="image/jpeg,image/png,image/webp,image/gif"
                         onChange={uploadCover} style={{ display:'none' }}/>
                </div>

                {coverCount === 0 ? (
                  <button type="button" onClick={() => coverInputRef.current?.click()} disabled={busy}
                          style={{ width:'100%', padding:'14px 10px', borderRadius:8,
                                   border:`0.5px solid ${t.borderStrong}`, cursor:'pointer',
                                   background:t.card,
                                   display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                                   fontFamily:'inherit' }}>
                    <I.Camera style={{ width:16, height:16, color:t.muted }}/>
                    <span style={{ fontSize:13, fontWeight:500, color:t.muted }}>Ajouter une photo</span>
                  </button>
                ) : (
                  <>
                    {coverCount > 1 && (
                      <p style={{ margin:'0 0 8px', fontSize:11, color:t.muted, lineHeight:1.5 }}>
                        Cliquez sur l&apos;etoile d&apos;une photo pour qu&apos;elle apparaisse en
                        premier dans la marketplace et la page de reservation.
                      </p>
                    )}
                    <div style={{ display:'grid',
                                  gridTemplateColumns:'repeat(auto-fill, minmax(90px, 1fr))', gap:8 }}>
                      {coverList.map((cover) => {
                        const isMain = cover.sort_order === 0 || cover.sort_order === '0';
                        return (
                          <div key={cover.id}
                               style={{ position:'relative', borderRadius:8, overflow:'hidden',
                                        aspectRatio:'1/1', background:t.cardAlt,
                                        border:`1px solid ${isMain ? '#f59e0b' : t.border}`,
                                        boxShadow: isMain ? '0 0 0 2px rgba(245,158,11,0.18)' : 'none',
                                        transition: 'border-color 0.15s ease, box-shadow 0.15s ease' }}>
                            <img src={withVersion(mediaApi.coverUrl(userId, cover.id), cover.version)}
                                 alt="Galerie"
                                 style={{ width:'100%', height:'100%', objectFit:'cover' }}/>

                            {/* Badge "Principale" en bas a gauche, visible si main */}
                            {isMain && (
                              <div style={{ position:'absolute', left:4, bottom:4,
                                            padding:'3px 7px', borderRadius:999,
                                            background:'#f59e0b', color:'white',
                                            fontSize:10, fontWeight:500, lineHeight:1,
                                            display:'inline-flex', alignItems:'center', gap:3 }}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
                                </svg>
                                Principale
                              </div>
                            )}

                            {/* Bouton "Definir comme principale" — affiche seulement
                                si coverCount > 1 ET pas deja la principale */}
                            {!isMain && coverCount > 1 && (
                              <button type="button" onClick={() => setCoverMain(cover.id)} disabled={busy}
                                      title="Definir comme photo principale"
                                      style={{ position:'absolute', left:4, top:4,
                                               width:22, height:22, borderRadius:'50%',
                                               background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)',
                                               border:'none',
                                               display:'flex', alignItems:'center', justifyContent:'center',
                                               cursor: busy ? 'default' : 'pointer',
                                               fontFamily:'inherit' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                                     stroke="white" strokeWidth="2" strokeLinejoin="round"
                                     strokeLinecap="round">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                              </button>
                            )}

                            <button onClick={() => deleteMedia(cover.id)} disabled={busy}
                                    style={{ position:'absolute', top:4, right:4,
                                             width:22, height:22, borderRadius:'50%',
                                             background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)',
                                             border:'none',
                                             display:'flex', alignItems:'center', justifyContent:'center',
                                             cursor: busy ? 'default' : 'pointer',
                                             fontFamily:'inherit' }}>
                              <I.Trash style={{ width:10, height:10, color:'white' }}/>
                            </button>
                          </div>
                        );
                      })}
                      {coverCount < 4 && (
                        <button type="button" onClick={() => coverInputRef.current?.click()} disabled={busy}
                                style={{ borderRadius:8, cursor:'pointer', aspectRatio:'1/1',
                                         background:t.card,
                                         border:`0.5px solid ${t.borderStrong}`,
                                         display:'flex', alignItems:'center', justifyContent:'center',
                                         fontFamily:'inherit' }}>
                          <I.Camera style={{ width:18, height:18, color:t.muted }}/>
                        </button>
                      )}
                    </div>
                  </>
                )}
                {errors.cover && (
                  <p style={{ margin:'8px 0 0', fontSize:11, color:'#991b1b', fontWeight:500 }}>{errors.cover}</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
