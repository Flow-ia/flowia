import { useState, useEffect } from 'react';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { api } from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';
import { I } from '../../utils/icons';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import { Button, Label } from '../../components/primitives';
import { getBookingUrl } from '../../utils/publicUrl';

// Telephone valide = parse libphonenumber-js + isValid(). Le backend refait
// la verification (defense in depth), mais on bloque ici pour eviter
// l'aller-retour et donner un retour immediat au commercant.
function isValidPhone(raw, country = 'DZ') {
  try {
    const p = parsePhoneNumberFromString(String(raw || '').trim(), country);
    return !!p && p.isValid();
  } catch { return false; }
}

// Carte "Informations du commerce" (nom, telephone, adresse, code postal, ville, Google Business).
//
// Cas slug : si le commercant change businessName / city / postalCode, le
// backend recalcule automatiquement le slug nom-ville-CP, archive l'ancien
// en alias (booking_slug_aliases) et retourne { slugChange: { oldSlug, newSlug } }.
// On previent ici l'utilisateur via une modale de confirmation AVANT save,
// puis on affiche un encart de succes avec le nouveau lien apres save.
export default function MerchantInfoCard({ theme, showToast }) {
  const t = theme;
  const { user, updateUser } = useAuth();

  const [open,     setOpen]     = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [profLoad, setProfLoad] = useState(false);
  const [profErr,  setProfErr]  = useState('');
  const [profOk,   setProfOk]   = useState('');
  const [slugInfo, setSlugInfo] = useState(null); // { oldSlug, newSlug }
  const [confirm,  setConfirm]  = useState(false); // boolean : modale ouverte ou non

  // Helper : extrait les champs metier d'un user vers la forme du formulaire.
  // Centralise pour eviter toute divergence entre les endroits qui font la
  // bascule user -> form (init, useEffect, startEditing).
  const userToForm = (u) => ({
    businessName:      u?.businessName      || '',
    address:           u?.address           || '',
    city:              u?.city              || '',
    postalCode:        u?.postalCode        || '',
    phone:             u?.phone             || '',
    googleBusinessUrl: u?.googleBusinessUrl || '',
  });

  const [form, setForm] = useState(() => userToForm(user));

  // Resync passive : a chaque changement de user (hors editing), on
  // remet form a jour. Ne couvre PAS le cas ou user etait incomplet au
  // mount puis devient complet APRES un clic "Modifier" — d'ou la resync
  // forcee dans startEditing() ci-dessous.
  useEffect(() => {
    if (!editing) setForm(userToForm(user));
  }, [user, editing]);

  // Resync au moment d'entrer en edition. Defense contre user partiellement
  // charge dans le contexte Auth au moment du clic — force le form a
  // adopter immediatement toutes les valeurs courantes de user (les
  // donnees BDD sont deja garanties presentes via le boot api.me()
  // declenche par AuthProvider derriere un Splash gate).
  const startEditing = () => {
    setForm(userToForm(user));
    setEditing(true);
    setProfErr('');
    setProfOk('');
  };

  // Detecte si le save va declencher un recalcul du slug (nom/ville/CP).
  const slugWillChange = () => {
    const businessChanged = form.businessName.trim() !== (user?.businessName || '');
    const cityChanged     = form.city.trim()         !== (user?.city || '');
    const postalChanged   = form.postalCode.trim()   !== (user?.postalCode || '');
    return businessChanged || cityChanged || postalChanged;
  };

  // Click "Enregistrer" : si nom/ville/CP changent et que le compte a deja
  // une adresse complete (donc un slug nom-ville-CP), on demande d'abord
  // confirmation a l'utilisateur. Sinon (premiere saisie d'adresse), on
  // sauvegarde directement.
  const onSaveClick = () => {
    if (!form.businessName.trim()) { setProfErr('Le nom du commerce est requis.'); return; }
    // Le telephone est obligatoire post-inscription : on l'autorise a etre
    // modifie, jamais supprime. L'adresse suit la meme regle.
    if (!form.phone.trim()) {
      setProfErr('Le numero de telephone est obligatoire. Vous pouvez le modifier mais pas le supprimer.');
      return;
    }
    if (!isValidPhone(form.phone, user?.country || 'DZ')) {
      setProfErr('Numero de telephone invalide.');
      return;
    }
    if (!form.address.trim()) {
      setProfErr('L\'adresse du commerce est obligatoire. Vous pouvez la modifier mais pas la supprimer.');
      return;
    }
    if (slugWillChange() && user?.city && user?.postalCode) {
      setConfirm(true);
    } else {
      doSave();
    }
  };

  const doSave = async () => {
    setProfLoad(true); setProfErr(''); setProfOk(''); setSlugInfo(null);
    try {
      const r = await api.updateProfile({
        businessName:      form.businessName.trim(),
        phone:             form.phone.trim(),
        address:           form.address.trim(),
        city:              form.city.trim()              || undefined,
        postalCode:        form.postalCode.trim()        || undefined,
        googleBusinessUrl: form.googleBusinessUrl.trim() || undefined,
      });
      updateUser({
        businessName:      form.businessName.trim(),
        phone:             form.phone.trim(),
        address:           form.address.trim(),
        city:              form.city.trim(),
        postalCode:        form.postalCode.trim(),
        googleBusinessUrl: form.googleBusinessUrl.trim(),
      });
      setEditing(false);
      setConfirm(false);
      if (r?.slugChange?.newSlug) {
        setSlugInfo(r.slugChange);
        showToast('Informations et lien de reservation mis a jour');
      } else {
        setProfOk('Informations mises a jour');
        setTimeout(() => setProfOk(''), 3500);
        showToast('Informations mises a jour');
      }
    } catch (e) { setProfErr(e.message || 'Erreur lors de la sauvegarde'); }
    finally { setProfLoad(false); }
  };

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  return (
    <div style={{ borderRadius:12, overflow:'hidden',
                  background:t.card, border:`0.5px solid ${t.border}` }}>
      <button type="button" onClick={() => setOpen(o => !o)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                       padding:'12px 14px', border:'none', cursor:'pointer', textAlign:'left',
                       background:t.cardAlt, fontFamily:'inherit' }}>
        <div style={{ width:32, height:32, borderRadius:8, flexShrink:0,
                      background:'#f0fdf4', color:'#065f46',
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
          <I.User style={{ width:15, height:15 }}/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>Informations du commerce</p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {user?.businessName || 'Nom du commerce'}
            {user?.phone ? ` · ${user.phone}` : ''}
            {user?.city  ? ` · ${user.city}`  : ''}
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
        <div style={{ borderTop:`0.5px solid ${t.separator}` }}>
          {!editing && (
            <div style={{ padding:'10px 14px 4px', display:'flex', justifyContent:'flex-end' }}>
              <Button variant="secondary" size="small" type="button"
                      onClick={startEditing}>
                <I.Edit style={{ width:12, height:12, marginRight:5 }}/>
                Modifier
              </Button>
            </div>
          )}

          {editing ? (
            <div style={{ padding:18, display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <Label>Nom du commerce *</Label>
                <input value={form.businessName}
                       onChange={e => setForm(f => ({ ...f, businessName:e.target.value }))}
                       placeholder="Nom de votre salon" style={inp}/>
              </div>
              <div>
                <Label>Telephone *</Label>
                <input type="tel" value={form.phone} required
                       onChange={e => setForm(f => ({ ...f, phone:e.target.value }))}
                       placeholder="05 50 12 34 56" style={inp}/>
                <p style={{ fontSize:11, color:t.dim, margin:'4px 0 0' }}>
                  Modifiable, mais ne peut pas etre supprime apres inscription.
                </p>
              </div>
              <div>
                <Label>Adresse * (tapez pour rechercher)</Label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={(v) => setForm(f => ({ ...f, address: v }))}
                  onSelect={({ address, city, postalCode }) =>
                    setForm(f => ({
                      ...f,
                      address:    address    || f.address,
                      city:       city       || f.city,
                      postalCode: postalCode || f.postalCode,
                    }))
                  }
                  placeholder="12 rue Didouche Mourad, Alger"
                  theme={theme}
                  inputStyle={inp}
                />
                <p style={{ fontSize:11, color:t.dim, margin:'4px 0 0' }}>
                  Selectionnez une suggestion pour remplir automatiquement code postal et ville.
                </p>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:10 }}>
                <div>
                  <Label>Code postal</Label>
                  <input value={form.postalCode}
                         onChange={e => setForm(f => ({ ...f, postalCode:e.target.value }))}
                         placeholder="16000" style={inp}/>
                </div>
                <div>
                  <Label>Ville</Label>
                  <input value={form.city}
                         onChange={e => setForm(f => ({ ...f, city:e.target.value }))}
                         placeholder="Alger" style={inp}/>
                </div>
              </div>
              <div>
                <Label>Lien Google Business (avis)</Label>
                <input type="url" value={form.googleBusinessUrl}
                       onChange={e => setForm(f => ({ ...f, googleBusinessUrl:e.target.value }))}
                       placeholder="https://g.page/votre-salon" style={inp}/>
                <p style={{ fontSize:11, color:t.dim, margin:'4px 0 0' }}>
                  Affiche sur votre page de reservation pour rediriger vers vos avis Google.
                </p>
              </div>
              {profErr && (
                <p style={{ fontSize:12, color:'#991b1b', margin:0 }}>{profErr}</p>
              )}
              <div style={{ display:'flex', gap:10, marginTop:4 }}>
                <Button variant="secondary" type="button"
                        onClick={() => { setEditing(false); setProfErr(''); }}
                        style={{ flex:1 }}>
                  Annuler
                </Button>
                <Button variant="primary" type="button"
                        onClick={onSaveClick} disabled={profLoad}
                        style={{ flex:2 }}>
                  {profLoad ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {profOk && (
                <div style={{ margin:'8px 18px 0', padding:'10px 14px', borderRadius:8,
                              background:'#f0fdf4',
                              color:'#065f46', fontSize:13, fontWeight:500 }}>
                  {profOk}
                </div>
              )}
              {slugInfo && (
                <div style={{ margin:'8px 18px 0', padding:'12px 14px', borderRadius:8,
                              background:t.cardAlt, border:`0.5px solid ${t.border}` }}>
                  <p style={{ margin:'0 0 6px', fontSize:12, fontWeight:500, color:t.text }}>
                    Lien de reservation mis a jour
                  </p>
                  <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted }}>
                    Ancien lien : <span style={{ textDecoration:'line-through' }}>{getBookingUrl(slugInfo.oldSlug)}</span>
                  </p>
                  <p style={{ margin:'0 0 6px', fontSize:11, color:t.text, wordBreak:'break-all' }}>
                    Nouveau lien : <strong style={{ fontWeight:500 }}>{getBookingUrl(slugInfo.newSlug)}</strong>
                  </p>
                  <p style={{ margin:0, fontSize:11, color:t.muted, lineHeight:1.5 }}>
                    Vos QR codes deja imprimes et liens partages avec l&apos;ancienne adresse continuent de fonctionner : ils redirigent automatiquement vers le nouveau lien.
                  </p>
                </div>
              )}
              {[
                ['Nom du commerce', user?.businessName || '-'],
                ['Telephone',       user?.phone        || '-'],
                ['Adresse',         user?.address      || '-'],
                ['Code postal',     user?.postalCode   || '-'],
                ['Ville',           user?.city         || '-'],
                ['Google Business', user?.googleBusinessUrl || '-'],
              ].map(([lbl, val]) => (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between',
                                        alignItems:'center', padding:'11px 18px',
                                        borderTop:`0.5px solid ${t.separator}` }}>
                  <span style={{ fontSize:12, color:t.muted }}>{lbl}</span>
                  <span style={{ fontSize:13, fontWeight:500, color:t.text,
                                 maxWidth:200, overflow:'hidden', textOverflow:'ellipsis',
                                 whiteSpace:'nowrap', textAlign:'right' }}>{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {confirm && (
        <div role="dialog" aria-modal="true"
             onClick={() => !profLoad && setConfirm(false)}
             style={{ position:'fixed', inset:0, zIndex:1000,
                      background:'rgba(0,0,0,0.45)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      padding:16 }}>
          <div onClick={(e) => e.stopPropagation()}
               style={{ width:'100%', maxWidth:440, background:t.card,
                        borderRadius:12, border:`0.5px solid ${t.border}`,
                        padding:'18px 20px',
                        display:'flex', flexDirection:'column', gap:12 }}>
            <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
              Modification du lien de reservation
            </p>
            <p style={{ margin:0, fontSize:12, color:t.muted, lineHeight:1.55 }}>
              Vous etes sur le point de modifier le nom du salon, la ville ou
              le code postal. Cela mettra a jour automatiquement votre lien
              de reservation publique.
            </p>
            <p style={{ margin:0, fontSize:12, color:t.muted, lineHeight:1.55 }}>
              Vos QR codes deja imprimes et liens partages avec l&apos;ancienne adresse
              continuent de fonctionner : ils seront automatiquement rediriges
              vers le nouveau lien.
            </p>
            <p style={{ margin:0, fontSize:11, color:t.dim }}>
              Le nouveau lien sera affiche apres la sauvegarde.
            </p>
            <div style={{ display:'flex', gap:10, marginTop:4 }}>
              <Button variant="secondary" type="button"
                      onClick={() => setConfirm(false)}
                      style={{ flex:1 }} disabled={profLoad}>
                Annuler
              </Button>
              <Button variant="primary" type="button"
                      onClick={doSave} disabled={profLoad}
                      style={{ flex:2 }}>
                {profLoad ? 'Enregistrement...' : 'Confirmer et enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
