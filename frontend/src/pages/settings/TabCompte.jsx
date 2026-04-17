import { useState, useEffect } from 'react';
import { I } from '../../utils/icons';
import { api } from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';

export default function TabCompte({ showToast, theme, onLock }) {
  const isDark = theme.mode === 'dark';
  const { user, updateUser, logout } = useAuth();

  const [editing,  setEditing]  = useState(false);
  const [profLoad, setProfLoad] = useState(false);
  const [profErr,  setProfErr]  = useState('');
  const [profOk,   setProfOk]   = useState('');
  const [delAccConfirm, setDelAccConfirm] = useState('');
  const [delAccLoad,    setDelAccLoad]    = useState(false);
  const [delAccErr,     setDelAccErr]     = useState('');
  const [showDelAcc,    setShowDelAcc]    = useState(false);
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

  const deleteAccount = async () => {
    if (delAccConfirm !== 'SUPPRIMER') { setDelAccErr('Tapez SUPPRIMER pour confirmer.'); return; }
    setDelAccLoad(true); setDelAccErr('');
    try {
      await api.deleteMerchantAccount();
      logout();
    } catch(e) { setDelAccErr(e.message || 'Erreur lors de la suppression.'); }
    finally { setDelAccLoad(false); }
  };

  const saveProfile = async () => {
    if (!form.businessName.trim()) { setProfErr('Le nom du commerce est requis.'); return; }
    setProfLoad(true); setProfErr(''); setProfOk('');
    try {
      const r = await api.updateProfile({
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

  const [pwdForm, setPwdForm] = useState({ old:'', new1:'', new2:'' });
  const [pwdErr,  setPwdErr]  = useState('');
  const [pwdOk,   setPwdOk]   = useState(false);
  const [pwdLoad, setPwdLoad] = useState(false);

  const changePassword = async () => {
    if (!pwdForm.old || !pwdForm.new1) { setPwdErr('Tous les champs sont requis.'); return; }
    if (pwdForm.new1 !== pwdForm.new2) { setPwdErr('Les mots de passe ne correspondent pas.'); return; }
    if (pwdForm.new1.length < 6) { setPwdErr('Minimum 6 caracteres.'); return; }
    setPwdLoad(true); setPwdErr('');
    try {
      await api.changePassword({ oldPassword: pwdForm.old, newPassword: pwdForm.new1 });
      setPwdOk(true); setPwdForm({ old:'', new1:'', new2:'' });
      showToast('Mot de passe mis a jour ✓');
    } catch(e) { setPwdErr(e.message || 'Erreur'); }
    finally { setPwdLoad(false); }
  };

  const [emailStep, setEmailStep] = useState('idle');
  const [newEmail,  setNewEmail]  = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailErr,  setEmailErr]  = useState('');
  const [emailLoad, setEmailLoad] = useState(false);

  const requestEmailChange = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) { setEmailErr('Email invalide.'); return; }
    setEmailLoad(true); setEmailErr('');
    try {
      await api.changeEmail({ newEmail: newEmail.trim() });
      setEmailStep('sent');
    } catch(e) { setEmailErr(e.message || 'Erreur'); }
    finally { setEmailLoad(false); }
  };

  const confirmEmailChange = async () => {
    if (!emailCode.trim()) { setEmailErr('Code requis.'); return; }
    setEmailLoad(true); setEmailErr('');
    try {
      await api.confirmChangeEmail({ code: emailCode.trim() });
      updateUser({ email: newEmail });
      setEmailStep('idle'); setNewEmail(''); setEmailCode('');
      showToast('Email mis a jour ✓');
    } catch(e) { setEmailErr(e.message || 'Code invalide'); }
    finally { setEmailLoad(false); }
  };

  const cardS = {
    borderRadius:16, background:theme.card,
    border:`1px solid ${theme.border}`, overflow:'hidden', marginBottom:12,
  };
  const sectionHead = {
    padding:'13px 18px', borderBottom:`1px solid ${theme.border}`,
    display:'flex', alignItems:'center', justifyContent:'space-between',
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
    <div>

      <div style={cardS}>
        <div style={sectionHead}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:42, height:42, borderRadius:12, flexShrink:0,
              background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontWeight:900, fontSize:17, color:theme.text }}>
              {(user?.businessName||'B').charAt(0).toUpperCase()}
            </div>
            <div>
              <p style={{ fontWeight:800, fontSize:14, color:theme.text, margin:'0 0 1px' }}>
                {user?.businessName}
              </p>
              <p style={{ fontSize:12, color:theme.muted, margin:0 }}>{user?.email}</p>
            </div>
          </div>
          {!editing && (
            <button onClick={()=>setEditing(true)}
              style={{ padding:'7px 14px', borderRadius:9, cursor:'pointer',
                background:'transparent', border:`1px solid ${theme.border}`,
                color:theme.muted, fontWeight:700, fontSize:12,
                display:'flex', alignItems:'center', gap:5 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{width:12,height:12}}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Modifier
            </button>
          )}
        </div>

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
              <p style={label}>Adresse (numéro + rue)</p>
              <input value={form.address}
                onChange={e=>setForm(f=>({...f,address:e.target.value}))}
                placeholder="12 rue de la Paix" style={inp}/>
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
                  background:'#1a73e8',
                  color:'white', fontWeight:800, fontSize:13,
                  border:'none', opacity:profLoad?0.7:1 }}>
                {profLoad ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {profOk && (
              <div style={{ margin:'12px 18px 0', padding:'10px 14px', borderRadius:9,
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
            ].map(([lbl, val], i) => (
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

      <div style={cardS}>
        <div style={{...sectionHead, justifyContent:'flex-start', gap:8 }}>
          <span style={{ fontSize:15 }}>🔑</span>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>Mot de passe</p>
        </div>
        <div style={{ padding:18, display:'flex', flexDirection:'column', gap:10 }}>
          {pwdOk && <p style={{ fontSize:12, color:'#4ade80', fontWeight:700 }}>✓ Mot de passe mis à jour</p>}
          {pwdErr && <p style={{ fontSize:12, color:'#f87171', fontWeight:700 }}>{pwdErr}</p>}
          {[
            ['Mot de passe actuel', 'old', 'password'],
            ['Nouveau mot de passe', 'new1', 'password'],
            ['Confirmer le nouveau', 'new2', 'password'],
          ].map(([lbl, key, type]) => (
            <div key={key}>
              <p style={label}>{lbl}</p>
              <input type={type} value={pwdForm[key]}
                onChange={e=>setPwdForm(p=>({...p,[key]:e.target.value}))}
                style={inp} placeholder="••••••••"/>
            </div>
          ))}
          <button onClick={changePassword} disabled={pwdLoad}
            style={{ padding:'11px 0', borderRadius:10, border:'none', cursor:'pointer',
              background:'#1a73e8', color:'white',
              fontWeight:800, fontSize:13, opacity:pwdLoad?0.7:1, marginTop:4 }}>
            {pwdLoad ? 'Mise a jour...' : 'Changer le mot de passe'}
          </button>
        </div>
      </div>

      <div style={cardS}>
        <div style={{...sectionHead, justifyContent:'flex-start', gap:8 }}>
          <span style={{ fontSize:15 }}>📧</span>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>Adresse email</p>
        </div>
        <div style={{ padding:18, display:'flex', flexDirection:'column', gap:10 }}>
          <p style={{ fontSize:12, color:theme.muted, margin:0 }}>
            Actuel : <strong style={{ color:theme.text }}>{user?.email}</strong>
          </p>
          {emailErr && <p style={{ fontSize:12, color:'#f87171', fontWeight:700 }}>{emailErr}</p>}
          {emailStep === 'idle' && (
            <>
              <div>
                <p style={label}>Nouvel email</p>
                <input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)}
                  style={inp} placeholder="nouveau@email.com"/>
              </div>
              <button onClick={requestEmailChange} disabled={emailLoad}
                style={{ padding:'11px 0', borderRadius:10, border:`1px solid ${theme.border}`,
                  cursor:'pointer', background:'transparent', color:theme.text,
                  fontWeight:700, fontSize:13 }}>
                {emailLoad ? 'Envoi...' : 'Recevoir le code de confirmation'}
              </button>
            </>
          )}
          {emailStep === 'sent' && (
            <>
              <p style={{ fontSize:12, color:'#4ade80', fontWeight:700 }}>
                ✓ Code envoyé à {newEmail}
              </p>
              <div>
                <p style={label}>Code de confirmation</p>
                <input value={emailCode} onChange={e=>setEmailCode(e.target.value)}
                  style={inp} placeholder="000000"/>
              </div>
              <button onClick={confirmEmailChange} disabled={emailLoad}
                style={{ padding:'11px 0', borderRadius:10, border:'none', cursor:'pointer',
                  background:'#16a34a', color:'white', fontWeight:800, fontSize:13 }}>
                {emailLoad ? 'Verification...' : 'Confirmer'}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ background: isDark?'rgba(255,255,255,0.03)':'#f8fafc',
        borderRadius:16, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}`,
          display:'flex', alignItems:'center', gap:8 }}>
          <I.Lock style={{ width:14, height:14, color:theme.muted }} />
          <p style={{ margin:0, fontWeight:800, fontSize:13, color:theme.text }}>Mes données & RGPD</p>
        </div>
        <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
          {[
            ['✅ Consentement', "Enregistré à l'inscription avec horodatage et IP"],
            ['📦 Portabilité', 'Vos clients peuvent exporter leurs données depuis leur profil'],
            ['🗑 Effacement', 'Suppression en cascade disponible depuis le profil client'],
            ['🔐 Sécurité', 'Mots de passe hashés bcrypt, communications TLS'],
          ].map(([t,d]) => (
            <div key={t} style={{ display:'flex', gap:8 }}>
              <p style={{ margin:0, fontSize:12, fontWeight:700, color:theme.text, minWidth:120 }}>{t}</p>
              <p style={{ margin:0, fontSize:12, color:theme.muted, flex:1 }}>{d}</p>
            </div>
          ))}
          <a href="https://www.cnil.fr/fr/rgpd-de-quoi-parle-t-on" target="_blank" rel="noopener noreferrer"
            style={{ fontSize:11, color:'#6366f1', textDecoration:'underline', marginTop:4 }}>
            📖 Guide CNIL — RGPD pour les TPE/PME
          </a>
        </div>
      </div>

      {!showDelAcc ? (
        <button onClick={() => setShowDelAcc(true)}
          style={{ width:'100%', padding:'12px', borderRadius:14,
            border:'1px solid rgba(239,68,68,0.2)',
            background:'rgba(239,68,68,0.04)', color:'#ef4444',
            fontWeight:700, fontSize:13, cursor:'pointer' }}>
          🗑 Supprimer mon compte
        </button>
      ) : (
        <div style={{ background:'rgba(239,68,68,0.04)', borderRadius:16, padding:20,
          border:'1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ margin:'0 0 6px', fontWeight:800, fontSize:14, color:'#ef4444' }}>
            ⚠️ Suppression définitive du compte
          </p>
          <p style={{ margin:'0 0 14px', fontSize:12, color:isDark?'#9ca3af':'#6b7280', lineHeight:1.5 }}>
            Toutes vos données seront supprimées. Les transactions sont conservées de façon anonyme pour la comptabilité. Cette action est irréversible.
          </p>
          <input
            placeholder="Tapez SUPPRIMER pour confirmer"
            value={delAccConfirm}
            onChange={e=>{ setDelAccConfirm(e.target.value.toUpperCase()); setDelAccErr(''); }}
            style={{ width:'100%', padding:'11px 14px', borderRadius:10, outline:'none',
              background:isDark?'rgba(255,255,255,0.05)':'white',
              border:'1px solid rgba(239,68,68,0.3)',
              color:isDark?'#f5f5f5':'#111827', fontSize:13,
              marginBottom:10, boxSizing:'border-box' }}
          />
          {delAccErr && <p style={{ color:'#ef4444', fontSize:12, margin:'0 0 10px', fontWeight:600 }}>{delAccErr}</p>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { setShowDelAcc(false); setDelAccConfirm(''); setDelAccErr(''); }}
              style={{ flex:1, padding:'11px', borderRadius:10, border:`1px solid ${theme.border}`,
                background:'transparent', color:theme.muted, fontWeight:700, fontSize:13, cursor:'pointer' }}>
              Annuler
            </button>
            <button onClick={deleteAccount}
              disabled={delAccLoad || delAccConfirm !== 'SUPPRIMER'}
              style={{ flex:2, padding:'11px', borderRadius:10, border:'none',
                background: delAccConfirm === 'SUPPRIMER' ? '#ef4444' : 'rgba(239,68,68,0.3)',
                color:'white', fontWeight:800, fontSize:13, cursor:'pointer',
                opacity: delAccLoad ? 0.7 : 1 }}>
              {delAccLoad ? 'Suppression...' : '🗑 Supprimer définitivement'}
            </button>
          </div>
        </div>
      )}

      <button onClick={() => { logout(); if(onLock) onLock(); }}
        style={{ width:'100%', padding:'14px', borderRadius:14,
          border:'1px solid rgba(248,113,113,0.25)',
          background:'rgba(248,113,113,0.07)', color:'#f87171',
          fontWeight:800, fontSize:14, cursor:'pointer' }}>
        Se déconnecter
      </button>
    </div>
  );
}
