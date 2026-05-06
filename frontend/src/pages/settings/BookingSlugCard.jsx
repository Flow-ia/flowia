// Carte "Lien de reservation" — visible dans Reglages > Mon commerce > Informations.
//
// Le slug est au format `nom-ville-CP`. Cette carte permet d'editer
// uniquement la partie "nom" (la ville et le CP suivent l'adresse du
// commerce, qui s'edite dans MerchantInfoCard juste au-dessus).
//
// Securite : si admin a verrouille le slug (slug_locked=TRUE), l'edition
// est desactivee et un message explicatif s'affiche.
import { useEffect, useState } from 'react';
import { bookingApi } from '../../utils/api';
import { I } from '../../utils/icons';
import { Button, Label } from '../../components/primitives';
import { getBookingUrl } from '../../utils/publicUrl';

export default function BookingSlugCard({ theme, showToast }) {
  const t = theme;
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState(false);
  const [info,    setInfo]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [name,    setName]    = useState('');
  const [check,   setCheck]   = useState(null); // { available, message?, candidate }
  const [checking,setChecking]= useState(false);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  // Charge l'etat actuel : slug, partie nom, partie ville-CP, slug_locked.
  const load = async () => {
    setLoading(true);
    try {
      const r = await bookingApi.getSlugInfo();
      setInfo(r);
      setName(r?.namePart || '');
    } catch { /* silent — le backend peut renvoyer 404 si pas de booking_settings */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Debounce check disponibilite quand l'utilisateur tape.
  useEffect(() => {
    if (!editing) return;
    const trimmed = name.trim().toLowerCase();
    if (!trimmed || trimmed === info?.namePart) { setCheck(null); return; }
    setChecking(true);
    const id = setTimeout(async () => {
      try {
        const r = await bookingApi.checkSlugName(trimmed);
        setCheck(r);
      } catch { setCheck({ available: false, message: 'Verification impossible.' }); }
      finally { setChecking(false); }
    }, 400);
    return () => clearTimeout(id);
  }, [name, editing, info?.namePart]);

  const onSave = async () => {
    const v = name.trim().toLowerCase();
    if (!v) { setErr('Saisissez un nom.'); return; }
    if (v === info?.namePart) { setEditing(false); return; }
    if (check && !check.available) { setErr(check.message); return; }
    setSaving(true); setErr('');
    try {
      const r = await bookingApi.updateSlugName(v);
      showToast && showToast('Lien de reservation mis a jour');
      setEditing(false);
      // Recharge depuis backend pour reprendre la partie ville-CP officielle.
      await load();
      // Met a jour l'affichage local en reponse immediate.
      if (r?.slug) setInfo(prev => prev ? { ...prev, slug: r.slug, namePart: v } : prev);
    } catch (e) {
      setErr(e.message || 'Erreur lors de la sauvegarde.');
    } finally { setSaving(false); }
  };

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color 0.15s ease',
  };

  if (loading) return null; // Carte silencieuse tant que pas charge.
  if (!info) return null;   // Pas de booking_settings (ne devrait pas arriver post-onboarding).

  const fullPreview = name.trim() && info.locationPart
    ? `${name.trim().toLowerCase()}-${info.locationPart}`
    : (name.trim().toLowerCase() || info.slug);

  return (
    <div style={{ borderRadius:12, overflow:'hidden',
                  background:t.card, border:`0.5px solid ${t.border}` }}>
      <button type="button" onClick={() => setOpen(o => !o)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                       padding:'12px 14px', border:'none', cursor:'pointer', textAlign:'left',
                       background:t.cardAlt, fontFamily:'inherit' }}>
        <div style={{ width:32, height:32, borderRadius:8, flexShrink:0,
                      background:'#eff6ff', color:'#1e40af',
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round"
               style={{ width:15, height:15 }}>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>
            Lien de reservation publique
          </p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {getBookingUrl(info.slug)}
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
        <div style={{ borderTop:`0.5px solid ${t.separator}`, padding:18,
                      display:'flex', flexDirection:'column', gap:12 }}>
          {info.slugLocked && (
            <div style={{ padding:'10px 12px', borderRadius:8, background:t.cardAlt,
                          border:`0.5px solid ${t.border}`,
                          fontSize:12, color:t.muted, lineHeight:1.55 }}>
              Votre lien a ete verrouille par notre equipe et ne peut pas etre modifie.
              Pour toute demande, merci de contacter le support.
            </div>
          )}

          {!info.slugLocked && !editing && (
            <>
              <div style={{ fontSize:12, color:t.muted, lineHeight:1.55 }}>
                Votre lien suit le format <strong>nom-ville-codepostal</strong>.
                Vous pouvez modifier la partie nom ; la ville et le code postal
                suivent l&apos;adresse du commerce.
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
                <code style={{ padding:'6px 10px', borderRadius:6,
                               background:t.cardAlt, fontSize:12, color:t.text,
                               wordBreak:'break-all' }}>
                  {info.namePart || ''}
                  {info.locationPart && <span style={{ color:t.dim }}>-{info.locationPart}</span>}
                </code>
                <Button variant="secondary" size="small" type="button"
                        onClick={() => { setEditing(true); setErr(''); setCheck(null); }}>
                  <I.Edit style={{ width:12, height:12, marginRight:5 }}/>
                  Modifier le nom
                </Button>
              </div>
            </>
          )}

          {!info.slugLocked && editing && (
            <>
              <div>
                <Label>Nom dans votre lien</Label>
                <input value={name}
                       onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                       placeholder="haircoiff"
                       maxLength={30}
                       style={inp}/>
                <p style={{ fontSize:11, color:t.dim, margin:'4px 0 0' }}>
                  3 a 30 caracteres : lettres minuscules, chiffres, tirets.
                </p>
              </div>

              <div style={{ padding:'10px 12px', borderRadius:8,
                            background:t.cardAlt, border:`0.5px solid ${t.border}` }}>
                <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted }}>Apercu du lien</p>
                <p style={{ margin:0, fontSize:12, color:t.text, wordBreak:'break-all' }}>
                  {getBookingUrl(fullPreview)}
                </p>
              </div>

              {checking && (
                <p style={{ margin:0, fontSize:11, color:t.muted }}>Verification...</p>
              )}
              {!checking && check && (
                <p style={{ margin:0, fontSize:12,
                            color: check.available ? '#065f46' : '#991b1b' }}>
                  {check.available ? 'Disponible' : (check.message || 'Indisponible')}
                </p>
              )}
              {err && (
                <p style={{ margin:0, fontSize:12, color:'#991b1b' }}>{err}</p>
              )}

              <div style={{ display:'flex', gap:10 }}>
                <Button variant="secondary" type="button"
                        onClick={() => { setEditing(false); setName(info.namePart || ''); setErr(''); setCheck(null); }}
                        style={{ flex:1 }} disabled={saving}>
                  Annuler
                </Button>
                <Button variant="primary" type="button"
                        onClick={onSave}
                        disabled={saving || checking || (check && !check.available) || !name.trim() || name.trim() === info.namePart}
                        style={{ flex:2 }}>
                  {saving ? 'Enregistrement...' : 'Enregistrer le lien'}
                </Button>
              </div>

              <p style={{ margin:'4px 0 0', fontSize:11, color:t.muted, lineHeight:1.55 }}>
                Vos QR codes deja imprimes et liens partages avec l&apos;ancien lien
                continuent de fonctionner : ils redirigent automatiquement vers
                le nouveau lien.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
