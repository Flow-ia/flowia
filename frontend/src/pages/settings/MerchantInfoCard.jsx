import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';
import { I } from '../../utils/icons';
import AddressAutocomplete from '../../components/AddressAutocomplete';

// Carte "Informations du commerce" (nom, téléphone, adresse, code postal, ville, Google Business)
// Déplacée depuis TabCompte → centralisée dans Config commerce.
export default function MerchantInfoCard({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const { user, updateUser } = useAuth();

  const [open,     setOpen]     = useState(false); // accordéon fermé par défaut
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
      setProfOk('Informations mises a jour ✓');
      setTimeout(() => setProfOk(''), 3500);
      showToast('Informations mises a jour ✓');
    } catch(e) { setProfErr(e.message || 'Erreur lors de la sauvegarde'); }
    finally { setProfLoad(false); }
  };

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:10, outline:'none',
    background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.04)',
    border:`1px solid ${theme.border}`, color:theme.text, fontSize:13,
    fontFamily:'inherit', boxSizing:'border-box',
  };
  const label = { display:'block', fontSize:11, fontWeight:700, color:theme.muted,
    marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em' };

  return (
    <div style={{ borderRadius:16, overflow:'hidden', background:theme.card,
      border:`1px solid ${theme.border}` }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
          padding:'12px 14px', border:'none', cursor:'pointer', textAlign:'left',
          background: isDark?'rgba(255,255,255,0.025)':'rgba(0,0,0,0.018)' }}>
        <div style={{ width:32, height:32, borderRadius:10, flexShrink:0,
          background:'rgba(34,197,94,0.12)', color:'#16a34a',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <I.User style={{ width:15, height:15 }} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontSize:13, fontWeight:800, color:theme.text }}>Informations du commerce</p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {user?.businessName || 'Nom du commerce'}
            {user?.phone ? ` · ${user.phone}` : ''}
            {user?.city  ? ` · ${user.city}`  : ''}
          </p>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke={theme.muted} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ width:14, height:14, flexShrink:0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform .2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{ borderTop:`1px solid ${theme.border}` }}>
          {!editing && (
            <div style={{ padding:'8px 14px 4px', display:'flex', justifyContent:'flex-end' }}>
              <button onClick={() => setEditing(true)}
                style={{ padding:'7px 14px', borderRadius:9, cursor:'pointer',
                  background:'transparent', border:`1px solid ${theme.border}`,
                  color:theme.muted, fontWeight:700, fontSize:12,
                  display:'flex', alignItems:'center', gap:5 }}>
                <I.Edit style={{ width:12, height:12 }}/>
                Modifier
              </button>
            </div>
          )}

          {editing ? (
            <div style={{ padding:18, display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <p style={label}>Nom du commerce *</p>
                <input value={form.businessName}
                  onChange={e=>setForm(f=>({...f,businessName:e.target.value}))}
                  placeholder="Nom de votre salon" style={inp}/>
              </div>
              <div>
                <p style={label}>Téléphone</p>
                <input type="tel" value={form.phone}
                  onChange={e=>setForm(f=>({...f,phone:e.target.value}))}
                  placeholder="06 00 00 00 00" style={inp}/>
              </div>
              <div>
                <p style={label}>Adresse (tapez pour rechercher)</p>
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
                <p style={{ fontSize:11, color:theme.dim, margin:'4px 0 0' }}>
                  Sélectionnez une suggestion pour remplir automatiquement code postal et ville.
                </p>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:10 }}>
                <div>
                  <p style={label}>Code postal</p>
                  <input value={form.postalCode}
                    onChange={e=>setForm(f=>({...f,postalCode:e.target.value}))}
                    placeholder="75001" style={inp}/>
                </div>
                <div>
                  <p style={label}>Ville</p>
                  <input value={form.city}
                    onChange={e=>setForm(f=>({...f,city:e.target.value}))}
                    placeholder="Paris" style={inp}/>
                </div>
              </div>
              <div>
                <p style={label}>Lien Google Business (avis)</p>
                <input type="url" value={form.googleBusinessUrl}
                  onChange={e=>setForm(f=>({...f,googleBusinessUrl:e.target.value}))}
                  placeholder="https://g.page/votre-salon" style={inp}/>
                <p style={{ fontSize:11, color:theme.dim, margin:'4px 0 0' }}>
                  Affiché sur votre page de réservation pour rediriger vers vos avis Google.
                </p>
              </div>
              {profErr && <p style={{ fontSize:12, color:'#f87171', fontWeight:600, margin:0 }}>{profErr}</p>}
              <div style={{ display:'flex', gap:10, marginTop:4 }}>
                <button onClick={()=>{ setEditing(false); setProfErr(''); }}
                  style={{ flex:1, padding:'11px', borderRadius:10, cursor:'pointer',
                    background:'transparent', border:`1px solid ${theme.border}`,
                    color:theme.muted, fontWeight:700, fontSize:13 }}>
                  Annuler
                </button>
                <button onClick={saveProfile} disabled={profLoad}
                  style={{ flex:2, padding:'11px', borderRadius:10, cursor:'pointer',
                    background:'#1a73e8', color:'white', fontWeight:800, fontSize:13,
                    border:'none', opacity:profLoad?0.7:1 }}>
                  {profLoad ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {profOk && (
                <div style={{ margin:'6px 18px 0', padding:'10px 14px', borderRadius:9,
                  background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)',
                  color:'#16a34a', fontSize:13, fontWeight:700 }}>✓ {profOk}</div>
              )}
              {[
                ['Nom du commerce', user?.businessName || '-'],
                ['Télephone',       user?.phone        || '-'],
                ['Adresse',         user?.address      || '-'],
                ['Code postal',     user?.postalCode   || '-'],
                ['Ville',           user?.city         || '-'],
                ['Google Business', user?.googleBusinessUrl || '-'],
              ].map(([lbl, val]) => (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between',
                  alignItems:'center', padding:'11px 18px',
                  borderTop:`1px solid ${theme.border}` }}>
                  <span style={{ fontSize:12, color:theme.muted, fontWeight:600 }}>{lbl}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:theme.text,
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
