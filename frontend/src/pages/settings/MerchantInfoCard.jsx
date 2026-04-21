import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';
import { I } from '../../utils/icons';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import { Button, Label } from '../../components/primitives';

// Carte "Informations du commerce" (nom, telephone, adresse, code postal, ville, Google Business)
export default function MerchantInfoCard({ theme, showToast }) {
  const t = theme;
  const { user, updateUser } = useAuth();

  const [open,     setOpen]     = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [profLoad, setProfLoad] = useState(false);
  const [profErr,  setProfErr]  = useState('');
  const [profOk,   setProfOk]   = useState('');
  const [form, setForm] = useState({
    businessName:      user?.businessName      || '',
    address:           user?.address           || '',
    city:              user?.city              || '',
    postalCode:        user?.postalCode        || '',
    phone:             user?.phone             || '',
    googleBusinessUrl: user?.googleBusinessUrl || '',
  });

  useEffect(() => {
    if (!editing) {
      setForm({
        businessName:      user?.businessName      || '',
        address:           user?.address           || '',
        city:              user?.city              || '',
        postalCode:        user?.postalCode        || '',
        phone:             user?.phone             || '',
        googleBusinessUrl: user?.googleBusinessUrl || '',
      });
    }
  }, [user, editing]);

  const saveProfile = async () => {
    if (!form.businessName.trim()) { setProfErr('Le nom du commerce est requis.'); return; }
    setProfLoad(true); setProfErr(''); setProfOk('');
    try {
      await api.updateProfile({
        businessName:      form.businessName.trim(),
        phone:             form.phone.trim()             || undefined,
        address:           form.address.trim()           || undefined,
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
      setProfOk('Informations mises a jour');
      setTimeout(() => setProfOk(''), 3500);
      showToast('Informations mises a jour');
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
                      onClick={() => setEditing(true)}>
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
                <Label>Telephone</Label>
                <input type="tel" value={form.phone}
                       onChange={e => setForm(f => ({ ...f, phone:e.target.value }))}
                       placeholder="06 00 00 00 00" style={inp}/>
              </div>
              <div>
                <Label>Adresse (tapez pour rechercher)</Label>
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
                  placeholder="12 rue de la Paix, Paris"
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
                         placeholder="75001" style={inp}/>
                </div>
                <div>
                  <Label>Ville</Label>
                  <input value={form.city}
                         onChange={e => setForm(f => ({ ...f, city:e.target.value }))}
                         placeholder="Paris" style={inp}/>
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
                        onClick={saveProfile} disabled={profLoad}
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
    </div>
  );
}
