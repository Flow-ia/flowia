import { useState } from 'react';
import { I } from '../../utils/icons';
import { api } from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';

// Mask email: jo***@gmail.com
const maskEmail = (e) => {
  if (!e) return '';
  const [a, b] = e.split('@');
  if (!b) return e;
  const head = a.slice(0, Math.min(2, a.length));
  return `${head}${'•'.repeat(Math.max(1, a.length - 2))}@${b}`;
};

export default function TabCompte({ showToast, theme, onLock }) {
  const isDark = theme.mode === 'dark';
  const { user, updateUser, logout } = useAuth();

  const [editing, setEditing] = useState(null); // 'email' | 'password' | null

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

  // Icône bouton éditer (crayon)
  const EditBtn = ({ onClick }) => (
    <button onClick={onClick}
      style={{ width:32, height:32, borderRadius:9, border:'none', cursor:'pointer',
        background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)',
        display:'flex', alignItems:'center', justifyContent:'center' }}
      title="Modifier">
      <I.Edit style={{ width:14, height:14, color:theme.muted }} />
    </button>
  );

  return (
    <div>
      {/* Identité non modifiable + bandeau info */}
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
        </div>
        <div style={{ padding:'10px 18px', display:'flex', alignItems:'center', gap:8,
          background: isDark?'rgba(99,102,241,0.08)':'rgba(99,102,241,0.06)',
          borderTop:`1px solid ${theme.border}` }}>
          <span style={{ fontSize:14 }}>💡</span>
          <p style={{ margin:0, fontSize:12, color:theme.muted, lineHeight:1.5 }}>
            Les <strong style={{ color:theme.text }}>informations du commerce</strong> (nom, téléphone, adresse, ville, Google Business)
            sont gérées dans <strong style={{ color:theme.text }}>Catégories → Config commerce</strong>.
          </p>
        </div>
      </div>

      {/* Email — lecture + bouton edit */}
      <EmailCard
        user={user} updateUser={updateUser}
        editing={editing === 'email'} onEdit={() => setEditing('email')} onClose={() => setEditing(null)}
        theme={theme} isDark={isDark} cardS={cardS} sectionHead={sectionHead}
        inp={inp} label={label} EditBtn={EditBtn} showToast={showToast} maskEmail={maskEmail}
      />

      {/* Mot de passe — lecture + bouton edit */}
      <PasswordCard
        editing={editing === 'password'} onEdit={() => setEditing('password')} onClose={() => setEditing(null)}
        theme={theme} isDark={isDark} cardS={cardS} sectionHead={sectionHead}
        inp={inp} label={label} EditBtn={EditBtn} showToast={showToast} userEmail={user?.email}
      />

      {/* RGPD — info statique */}
      <div style={{ background: isDark?'rgba(255,255,255,0.03)':'#f8fafc',
        borderRadius:16, border:`1px solid ${theme.border}`, overflow:'hidden', marginBottom:12 }}>
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

      <DangerZone theme={theme} isDark={isDark} logout={logout} showToast={showToast} />

      <button onClick={() => { logout(); if(onLock) onLock(); }}
        style={{ width:'100%', padding:'14px', borderRadius:14,
          border:'1px solid rgba(248,113,113,0.25)',
          background:'rgba(248,113,113,0.07)', color:'#f87171',
          fontWeight:800, fontSize:14, cursor:'pointer', marginTop:10 }}>
        Se déconnecter
      </button>
    </div>
  );
}

// ─── Carte Email : lecture → éditeur inline (code envoyé à l'ancienne adresse) ─
function EmailCard({ user, updateUser, editing, onEdit, onClose, theme, isDark,
  cardS, sectionHead, inp, label, EditBtn, showToast, maskEmail }) {
  const [step,     setStep]     = useState('form');   // 'form' | 'sent'
  const [newEmail, setNewEmail] = useState('');
  const [code,     setCode]     = useState('');
  const [err,      setErr]      = useState('');
  const [loading,  setLoading]  = useState(false);
  const [sentTo,   setSentTo]   = useState('');

  const close = () => {
    setStep('form'); setNewEmail(''); setCode(''); setErr(''); setSentTo('');
    onClose();
  };

  const request = async () => {
    setErr('');
    if (!newEmail.trim() || !newEmail.includes('@')) { setErr('Email invalide.'); return; }
    setLoading(true);
    try {
      const r = await api.changeEmail({ newEmail: newEmail.trim() });
      setSentTo(r?.sentTo || user?.email || '');
      setStep('sent');
    } catch(e) { setErr(e.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const confirm = async () => {
    setErr('');
    if (!code.trim()) { setErr('Code requis.'); return; }
    setLoading(true);
    try {
      await api.confirmChangeEmail({ code: code.trim() });
      updateUser({ email: newEmail });
      showToast('Email mis a jour ✓');
      close();
    } catch(e) { setErr(e.message || 'Code invalide'); }
    finally { setLoading(false); }
  };

  return (
    <div style={cardS}>
      <div style={sectionHead}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
          <span style={{ fontSize:15 }}>📧</span>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:11, fontWeight:700, color:theme.muted,
              textTransform:'uppercase', letterSpacing:'0.05em' }}>Adresse email</p>
            <p style={{ margin:'2px 0 0', fontSize:13, fontWeight:700, color:theme.text,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user?.email}
            </p>
          </div>
        </div>
        {!editing && <EditBtn onClick={onEdit} />}
      </div>

      {editing && (
        <div style={{ padding:18, display:'flex', flexDirection:'column', gap:10 }}>
          {err && <p style={{ fontSize:12, color:'#f87171', fontWeight:700, margin:0 }}>{err}</p>}

          {step === 'form' && (
            <>
              <div style={{ padding:'10px 12px', borderRadius:10,
                background:isDark?'rgba(245,158,11,0.08)':'rgba(245,158,11,0.06)',
                border:'1px solid rgba(245,158,11,0.2)', fontSize:11.5, color:'#d97706',
                display:'flex', gap:8, alignItems:'flex-start', lineHeight:1.5 }}>
                <span>🔐</span>
                <span>Un code de sécurité sera envoyé à <strong>{maskEmail(user?.email)}</strong>
                  pour autoriser la modification.</span>
              </div>
              <div>
                <p style={label}>Nouvel email</p>
                <input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)}
                  style={inp} placeholder="nouveau@email.com" autoFocus/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={close}
                  style={{ flex:1, padding:'11px 0', borderRadius:10, cursor:'pointer',
                    background:'transparent', border:`1px solid ${theme.border}`,
                    color:theme.muted, fontWeight:700, fontSize:13 }}>
                  Annuler
                </button>
                <button onClick={request} disabled={loading}
                  style={{ flex:2, padding:'11px 0', borderRadius:10, border:'none', cursor:'pointer',
                    background:'#1a73e8', color:'white', fontWeight:800, fontSize:13,
                    opacity:loading?0.7:1 }}>
                  {loading ? 'Envoi...' : 'Envoyer le code'}
                </button>
              </div>
            </>
          )}

          {step === 'sent' && (
            <>
              <p style={{ fontSize:12, color:'#4ade80', fontWeight:700, margin:0 }}>
                ✓ Code envoyé à {maskEmail(sentTo)}
              </p>
              <div>
                <p style={label}>Code de confirmation</p>
                <input value={code} onChange={e=>setCode(e.target.value)}
                  style={inp} placeholder="000000" inputMode="numeric" autoFocus/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setStep('form')}
                  style={{ flex:1, padding:'11px 0', borderRadius:10, cursor:'pointer',
                    background:'transparent', border:`1px solid ${theme.border}`,
                    color:theme.muted, fontWeight:700, fontSize:13 }}>
                  Retour
                </button>
                <button onClick={confirm} disabled={loading}
                  style={{ flex:2, padding:'11px 0', borderRadius:10, border:'none', cursor:'pointer',
                    background:'#16a34a', color:'white', fontWeight:800, fontSize:13,
                    opacity:loading?0.7:1 }}>
                  {loading ? 'Vérification...' : `Confirmer ${newEmail}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Carte Mot de passe : lecture → éditeur (ancien + nouveau) ou lien oubli ──
function PasswordCard({ editing, onEdit, onClose, theme, isDark,
  cardS, sectionHead, inp, label, EditBtn, showToast, userEmail }) {
  const [f, setF]      = useState({ old:'', n1:'', n2:'' });
  const [err, setErr]  = useState('');
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot]   = useState(null); // null | 'request' | 'code' | 'new'
  const [fEmail, setFEmail]   = useState(userEmail || '');
  const [fCode,  setFCode]    = useState('');
  const [fPwd,   setFPwd]     = useState('');
  const [fPwd2,  setFPwd2]    = useState('');
  const [fTok,   setFTok]     = useState(null);

  const close = () => {
    setF({ old:'', n1:'', n2:'' }); setErr(''); setForgot(null);
    setFEmail(userEmail||''); setFCode(''); setFPwd(''); setFPwd2(''); setFTok(null);
    onClose();
  };

  const save = async () => {
    setErr('');
    if (!f.old || !f.n1) { setErr('Tous les champs sont requis.'); return; }
    if (f.n1 !== f.n2)  { setErr('Les mots de passe ne correspondent pas.'); return; }
    if (f.n1.length < 6){ setErr('Minimum 6 caractères.'); return; }
    setLoading(true);
    try {
      await api.changePassword({ oldPassword: f.old, newPassword: f.n1 });
      showToast('Mot de passe mis a jour ✓');
      close();
    } catch(e) { setErr(e.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  // ── Récupération mot de passe (oubli) : code email ──
  const sendForgot = async () => {
    setErr('');
    if (!fEmail.trim()) { setErr('Email requis.'); return; }
    setLoading(true);
    try {
      await api.forgot({ email: fEmail.trim() });
      setForgot('code');
    } catch(e) { setErr(e.message || 'Erreur'); }
    finally { setLoading(false); }
  };
  const verifyForgot = async () => {
    setErr('');
    if (!fCode.trim()) { setErr('Code requis.'); return; }
    setLoading(true);
    try {
      const r = await api.forgotVerify({ email: fEmail.trim(), code: fCode.trim() });
      setFTok(r?.resetToken || r?.token || null);
      setForgot('new');
    } catch(e) { setErr(e.message || 'Code invalide'); }
    finally { setLoading(false); }
  };
  const resetForgot = async () => {
    setErr('');
    if (!fPwd || fPwd.length < 6) { setErr('Minimum 6 caractères.'); return; }
    if (fPwd !== fPwd2) { setErr('Les mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    try {
      await api.forgotReset({ email: fEmail.trim(), code: fCode.trim(), newPassword: fPwd, resetToken: fTok });
      showToast('Mot de passe réinitialisé ✓');
      close();
    } catch(e) { setErr(e.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  return (
    <div style={cardS}>
      <div style={sectionHead}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flex:1 }}>
          <span style={{ fontSize:15 }}>🔑</span>
          <div style={{ flex:1 }}>
            <p style={{ margin:0, fontSize:11, fontWeight:700, color:theme.muted,
              textTransform:'uppercase', letterSpacing:'0.05em' }}>Mot de passe</p>
            <p style={{ margin:'2px 0 0', fontSize:15, fontWeight:700, color:theme.text,
              letterSpacing:'0.2em' }}>••••••••</p>
          </div>
        </div>
        {!editing && <EditBtn onClick={onEdit} />}
      </div>

      {editing && (
        <div style={{ padding:18, display:'flex', flexDirection:'column', gap:10 }}>
          {err && <p style={{ fontSize:12, color:'#f87171', fontWeight:700, margin:0 }}>{err}</p>}

          {/* Mode standard : saisie ancien + nouveau */}
          {!forgot && (
            <>
              {[
                ['Mot de passe actuel', 'old'],
                ['Nouveau mot de passe', 'n1'],
                ['Confirmer le nouveau', 'n2'],
              ].map(([lbl, key]) => (
                <div key={key}>
                  <p style={label}>{lbl}</p>
                  <input type="password" value={f[key]}
                    onChange={e=>setF(p=>({...p,[key]:e.target.value}))}
                    style={inp} placeholder="••••••••"/>
                </div>
              ))}
              <button onClick={() => { setErr(''); setForgot('request'); }}
                style={{ background:'none', border:'none', color:'#1a73e8',
                  fontSize:12, fontWeight:600, cursor:'pointer', textAlign:'left', padding:0,
                  textDecoration:'underline', marginTop:2 }}>
                Mot de passe oublié ?
              </button>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={close}
                  style={{ flex:1, padding:'11px 0', borderRadius:10, cursor:'pointer',
                    background:'transparent', border:`1px solid ${theme.border}`,
                    color:theme.muted, fontWeight:700, fontSize:13 }}>
                  Annuler
                </button>
                <button onClick={save} disabled={loading}
                  style={{ flex:2, padding:'11px 0', borderRadius:10, border:'none', cursor:'pointer',
                    background:'#1a73e8', color:'white', fontWeight:800, fontSize:13,
                    opacity:loading?0.7:1 }}>
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </>
          )}

          {/* Mode oubli — demande code */}
          {forgot === 'request' && (
            <>
              <p style={{ fontSize:12, color:theme.muted, margin:0, lineHeight:1.5 }}>
                Nous allons envoyer un code de sécurité à votre adresse email.
              </p>
              <div>
                <p style={label}>Email du compte</p>
                <input type="email" value={fEmail} onChange={e=>setFEmail(e.target.value)}
                  style={inp} placeholder="email@exemple.com"/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => { setForgot(null); setErr(''); }}
                  style={{ flex:1, padding:'11px 0', borderRadius:10, cursor:'pointer',
                    background:'transparent', border:`1px solid ${theme.border}`,
                    color:theme.muted, fontWeight:700, fontSize:13 }}>
                  Retour
                </button>
                <button onClick={sendForgot} disabled={loading}
                  style={{ flex:2, padding:'11px 0', borderRadius:10, border:'none', cursor:'pointer',
                    background:'#1a73e8', color:'white', fontWeight:800, fontSize:13,
                    opacity:loading?0.7:1 }}>
                  {loading ? 'Envoi...' : 'Envoyer le code'}
                </button>
              </div>
            </>
          )}

          {forgot === 'code' && (
            <>
              <p style={{ fontSize:12, color:'#4ade80', fontWeight:700, margin:0 }}>
                ✓ Code envoyé à {fEmail}
              </p>
              <div>
                <p style={label}>Code de confirmation</p>
                <input value={fCode} onChange={e=>setFCode(e.target.value)}
                  style={inp} placeholder="000000" inputMode="numeric"/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => { setForgot('request'); setErr(''); }}
                  style={{ flex:1, padding:'11px 0', borderRadius:10, cursor:'pointer',
                    background:'transparent', border:`1px solid ${theme.border}`,
                    color:theme.muted, fontWeight:700, fontSize:13 }}>
                  Retour
                </button>
                <button onClick={verifyForgot} disabled={loading}
                  style={{ flex:2, padding:'11px 0', borderRadius:10, border:'none', cursor:'pointer',
                    background:'#16a34a', color:'white', fontWeight:800, fontSize:13,
                    opacity:loading?0.7:1 }}>
                  {loading ? 'Vérification...' : 'Valider'}
                </button>
              </div>
            </>
          )}

          {forgot === 'new' && (
            <>
              <p style={{ fontSize:12, color:theme.muted, margin:0 }}>
                Définissez votre nouveau mot de passe.
              </p>
              <div>
                <p style={label}>Nouveau mot de passe</p>
                <input type="password" value={fPwd} onChange={e=>setFPwd(e.target.value)}
                  style={inp} placeholder="••••••••"/>
              </div>
              <div>
                <p style={label}>Confirmer</p>
                <input type="password" value={fPwd2} onChange={e=>setFPwd2(e.target.value)}
                  style={inp} placeholder="••••••••"/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={close}
                  style={{ flex:1, padding:'11px 0', borderRadius:10, cursor:'pointer',
                    background:'transparent', border:`1px solid ${theme.border}`,
                    color:theme.muted, fontWeight:700, fontSize:13 }}>
                  Annuler
                </button>
                <button onClick={resetForgot} disabled={loading}
                  style={{ flex:2, padding:'11px 0', borderRadius:10, border:'none', cursor:'pointer',
                    background:'#16a34a', color:'white', fontWeight:800, fontSize:13,
                    opacity:loading?0.7:1 }}>
                  {loading ? 'Enregistrement...' : 'Réinitialiser'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Zone danger : suppression compte ─────────────────────────────────────────
function DangerZone({ theme, isDark, logout, showToast }) {
  const [show, setShow]       = useState(false);
  const [confirm, setConfirm] = useState('');
  const [load, setLoad]       = useState(false);
  const [err,  setErr]        = useState('');

  const del = async () => {
    if (confirm !== 'SUPPRIMER') { setErr('Tapez SUPPRIMER pour confirmer.'); return; }
    setLoad(true); setErr('');
    try {
      await api.deleteMerchantAccount();
      logout();
    } catch(e) { setErr(e.message || 'Erreur lors de la suppression.'); }
    finally { setLoad(false); }
  };

  if (!show) return (
    <button onClick={() => setShow(true)}
      style={{ width:'100%', padding:'12px', borderRadius:14,
        border:'1px solid rgba(239,68,68,0.2)',
        background:'rgba(239,68,68,0.04)', color:'#ef4444',
        fontWeight:700, fontSize:13, cursor:'pointer' }}>
      🗑 Supprimer mon compte
    </button>
  );
  return (
    <div style={{ background:'rgba(239,68,68,0.04)', borderRadius:16, padding:20,
      border:'1px solid rgba(239,68,68,0.2)' }}>
      <p style={{ margin:'0 0 6px', fontWeight:800, fontSize:14, color:'#ef4444' }}>
        ⚠️ Suppression définitive du compte
      </p>
      <p style={{ margin:'0 0 14px', fontSize:12, color:isDark?'#9ca3af':'#6b7280', lineHeight:1.5 }}>
        Toutes vos données seront supprimées. Les transactions sont conservées de façon anonyme pour la comptabilité. Cette action est irréversible.
      </p>
      <input placeholder="Tapez SUPPRIMER pour confirmer"
        value={confirm}
        onChange={e=>{ setConfirm(e.target.value.toUpperCase()); setErr(''); }}
        style={{ width:'100%', padding:'11px 14px', borderRadius:10, outline:'none',
          background:isDark?'rgba(255,255,255,0.05)':'white',
          border:'1px solid rgba(239,68,68,0.3)',
          color:isDark?'#f5f5f5':'#111827', fontSize:13,
          marginBottom:10, boxSizing:'border-box' }} />
      {err && <p style={{ color:'#ef4444', fontSize:12, margin:'0 0 10px', fontWeight:600 }}>{err}</p>}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={() => { setShow(false); setConfirm(''); setErr(''); }}
          style={{ flex:1, padding:'11px', borderRadius:10, border:`1px solid ${theme.border}`,
            background:'transparent', color:theme.muted, fontWeight:700, fontSize:13, cursor:'pointer' }}>
          Annuler
        </button>
        <button onClick={del} disabled={load || confirm !== 'SUPPRIMER'}
          style={{ flex:2, padding:'11px', borderRadius:10, border:'none',
            background: confirm === 'SUPPRIMER' ? '#ef4444' : 'rgba(239,68,68,0.3)',
            color:'white', fontWeight:800, fontSize:13, cursor:'pointer',
            opacity: load ? 0.7 : 1 }}>
          {load ? 'Suppression...' : '🗑 Supprimer définitivement'}
        </button>
      </div>
    </div>
  );
}
