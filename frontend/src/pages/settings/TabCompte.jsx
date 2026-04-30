import { useState } from 'react';
import { I } from '../../utils/icons';
import { api } from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';
import { Button, Label } from '../../components/primitives';

const maskEmail = (e) => {
  if (!e) return '';
  const [a, b] = e.split('@');
  if (!b) return e;
  const head = a.slice(0, Math.min(2, a.length));
  return `${head}${'•'.repeat(Math.max(1, a.length - 2))}@${b}`;
};

export default function TabCompte({ showToast, theme, onLock }) {
  const t = theme;
  const { user, updateUser, logout } = useAuth();

  const [editing, setEditing] = useState(null); // 'email' | 'password' | null

  const cardS = {
    borderRadius:12, background:t.card,
    border:`0.5px solid ${t.border}`, overflow:'hidden', marginBottom:12,
  };
  const sectionHead = {
    padding:'13px 18px', borderBottom:`0.5px solid ${t.separator}`,
    display:'flex', alignItems:'center', justifyContent:'space-between',
  };
  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  const EditBtn = ({ onClick }) => (
    <button onClick={onClick} title="Modifier"
            style={{ width:30, height:30, borderRadius:8, border:'none', cursor:'pointer',
                     background:t.cardAlt,
                     display:'flex', alignItems:'center', justifyContent:'center',
                     fontFamily:'inherit' }}>
      <I.Edit style={{ width:13, height:13, color:t.muted }}/>
    </button>
  );

  return (
    <div>
      {/* Identite non modifiable (le bandeau d'info redirigeant vers
          Categories est supprime : le commercant n'a pas besoin d'etre
          rappele a chaque visite ou se trouvent ses infos). */}
      <div style={cardS}>
        <div style={sectionHead}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:40, height:40, borderRadius:8, flexShrink:0,
                          background:t.cardAlt,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontWeight:500, fontSize:16, color:t.text }}>
              {(user?.businessName || 'B').charAt(0).toUpperCase()}
            </div>
            <div>
              <p style={{ fontWeight:500, fontSize:14, color:t.text, margin:'0 0 1px' }}>
                {user?.businessName}
              </p>
              <p style={{ fontSize:12, color:t.muted, margin:0 }}>{user?.email}</p>
            </div>
          </div>
        </div>
      </div>

      <EmailCard
        user={user} updateUser={updateUser}
        editing={editing === 'email'} onEdit={() => setEditing('email')} onClose={() => setEditing(null)}
        theme={theme} cardS={cardS} sectionHead={sectionHead}
        inp={inp} EditBtn={EditBtn} showToast={showToast} maskEmail={maskEmail}/>

      <PasswordCard
        editing={editing === 'password'} onEdit={() => setEditing('password')} onClose={() => setEditing(null)}
        theme={theme} cardS={cardS} sectionHead={sectionHead}
        inp={inp} EditBtn={EditBtn} showToast={showToast} userEmail={user?.email}/>

      {/* RGPD — lien statique vers la ressource externe (CNIL).
          Le detail des dispositifs (consentement, portabilite, effacement,
          securite) est documente sur le site public et dans la page Politique
          de confidentialite, pas besoin de le repeter ici. */}
      <a href="https://www.cnil.fr/fr/rgpd-de-quoi-parle-t-on"
         target="_blank" rel="noopener noreferrer"
         style={{
           display: 'flex', alignItems: 'center', gap: 12,
           padding: '14px 16px', borderRadius: 12,
           background: t.cardAlt,
           border: `0.5px solid ${t.border}`,
           textDecoration: 'none',
           marginBottom: 12,
           transition: 'background 0.15s ease',
         }}>
        <I.Lock style={{ width:15, height:15, color:t.muted, flexShrink:0 }}/>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontWeight:500, fontSize:13, color:t.text }}>
            {"Donnees & RGPD"}
          </p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted, lineHeight:1.4 }}>
            {"Guide CNIL — RGPD pour les TPE/PME"}
          </p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke={t.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             style={{ flexShrink: 0 }}>
          <path d="M7 17L17 7"/>
          <polyline points="7 7 17 7 17 17"/>
        </svg>
      </a>

      <DangerZone theme={theme} logout={logout}/>

      <button onClick={() => { logout(); if (onLock) onLock(); }}
              style={{ width:'100%', padding:'12px', borderRadius:8,
                       border:`0.5px solid rgba(239,68,68,0.3)`,
                       background:'rgba(239,68,68,0.08)', color:'#991b1b',
                       fontWeight:500, fontSize:14, cursor:'pointer',
                       marginTop:10, fontFamily:'inherit' }}>
        Se deconnecter
      </button>
    </div>
  );
}

// ─── Carte Email ────────────────────────────────────────────────────────────
function EmailCard({ user, updateUser, editing, onEdit, onClose, theme,
                    cardS, sectionHead, inp, EditBtn, showToast, maskEmail }) {
  const t = theme;
  const [step,     setStep]     = useState('form');
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
    } catch (e) { setErr(e.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const confirm = async () => {
    setErr('');
    if (!code.trim()) { setErr('Code requis.'); return; }
    setLoading(true);
    try {
      await api.confirmChangeEmail({ code: code.trim() });
      updateUser({ email: newEmail });
      showToast('Email mis a jour');
      close();
    } catch (e) { setErr(e.message || 'Code invalide'); }
    finally { setLoading(false); }
  };

  return (
    <div style={cardS}>
      <div style={sectionHead}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
          <I.Mail style={{ width:15, height:15, color:t.muted, flexShrink:0 }}/>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:12, color:t.muted }}>Adresse email</p>
            <p style={{ margin:'2px 0 0', fontSize:13, fontWeight:500, color:t.text,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user?.email}
            </p>
          </div>
        </div>
        {!editing && <EditBtn onClick={onEdit}/>}
      </div>

      {editing && (
        <div style={{ padding:18, display:'flex', flexDirection:'column', gap:10 }}>
          {err && <p style={{ fontSize:12, color:'#991b1b', margin:0 }}>{err}</p>}

          {step === 'form' && (
            <>
              <div style={{ padding:'10px 12px', borderRadius:8,
                            background:'#fffbeb',
                            fontSize:12, color:'#92400e',
                            display:'flex', gap:8, alignItems:'flex-start', lineHeight:1.5 }}>
                <I.Lock style={{ width:14, height:14, color:'#92400e', flexShrink:0, marginTop:1 }}/>
                <span>
                  Un code de securite sera envoye a <strong style={{ fontWeight:500 }}>{maskEmail(user?.email)}</strong>
                  {' '}pour autoriser la modification.
                </span>
              </div>
              <div>
                <Label>Nouvel email</Label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                       style={inp} placeholder="nouveau@email.com" autoFocus/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button variant="secondary" type="button" onClick={close} style={{ flex:1 }}>
                  Annuler
                </Button>
                <Button variant="primary" type="button" onClick={request} disabled={loading} style={{ flex:2 }}>
                  {loading ? 'Envoi...' : 'Envoyer le code'}
                </Button>
              </div>
            </>
          )}

          {step === 'sent' && (
            <>
              <p style={{ fontSize:12, color:'#065f46', fontWeight:500, margin:0 }}>
                Code envoye a {maskEmail(sentTo)}
              </p>
              <div>
                <Label>Code de confirmation</Label>
                <input value={code} onChange={e => setCode(e.target.value)}
                       style={inp} placeholder="000000" inputMode="numeric" autoFocus/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button variant="secondary" type="button" onClick={() => setStep('form')} style={{ flex:1 }}>
                  Retour
                </Button>
                <Button variant="primary" type="button" onClick={confirm} disabled={loading} style={{ flex:2 }}>
                  {loading ? 'Verification...' : `Confirmer ${newEmail}`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Carte Mot de passe ─────────────────────────────────────────────────────
function PasswordCard({ editing, onEdit, onClose, theme,
                        cardS, sectionHead, inp, EditBtn, showToast, userEmail }) {
  const t = theme;
  const [f, setF]             = useState({ old:'', n1:'', n2:'' });
  const [err, setErr]         = useState('');
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot]   = useState(null);
  const [fEmail, setFEmail]   = useState(userEmail || '');
  const [fCode,  setFCode]    = useState('');
  const [fPwd,   setFPwd]     = useState('');
  const [fPwd2,  setFPwd2]    = useState('');
  const [fTok,   setFTok]     = useState(null);

  const close = () => {
    setF({ old:'', n1:'', n2:'' }); setErr(''); setForgot(null);
    setFEmail(userEmail || ''); setFCode(''); setFPwd(''); setFPwd2(''); setFTok(null);
    onClose();
  };

  const save = async () => {
    setErr('');
    if (!f.old || !f.n1) { setErr('Tous les champs sont requis.'); return; }
    if (f.n1 !== f.n2)   { setErr('Les mots de passe ne correspondent pas.'); return; }
    if (f.n1.length < 6) { setErr('Minimum 6 caracteres.'); return; }
    setLoading(true);
    try {
      await api.changePassword({ oldPassword: f.old, newPassword: f.n1 });
      showToast('Mot de passe mis a jour');
      close();
    } catch (e) { setErr(e.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const sendForgot = async () => {
    setErr('');
    if (!fEmail.trim()) { setErr('Email requis.'); return; }
    setLoading(true);
    try {
      await api.forgot({ email: fEmail.trim() });
      setForgot('code');
    } catch (e) { setErr(e.message || 'Erreur'); }
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
    } catch (e) { setErr(e.message || 'Code invalide'); }
    finally { setLoading(false); }
  };
  const resetForgot = async () => {
    setErr('');
    if (!fPwd || fPwd.length < 6) { setErr('Minimum 6 caracteres.'); return; }
    if (fPwd !== fPwd2) { setErr('Les mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    try {
      await api.forgotReset({ email: fEmail.trim(), code: fCode.trim(), newPassword: fPwd, resetToken: fTok });
      showToast('Mot de passe reinitialise');
      close();
    } catch (e) { setErr(e.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  return (
    <div style={cardS}>
      <div style={sectionHead}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flex:1 }}>
          <I.Key style={{ width:15, height:15, color:t.muted, flexShrink:0 }}/>
          <div style={{ flex:1 }}>
            <p style={{ margin:0, fontSize:12, color:t.muted }}>Mot de passe</p>
            <p style={{ margin:'2px 0 0', fontSize:15, fontWeight:500, color:t.text,
                        letterSpacing:'0.15em' }}>••••••••</p>
          </div>
        </div>
        {!editing && <EditBtn onClick={onEdit}/>}
      </div>

      {editing && (
        <div style={{ padding:18, display:'flex', flexDirection:'column', gap:10 }}>
          {err && <p style={{ fontSize:12, color:'#991b1b', margin:0 }}>{err}</p>}

          {!forgot && (
            <>
              {[
                ['Mot de passe actuel', 'old'],
                ['Nouveau mot de passe', 'n1'],
                ['Confirmer le nouveau', 'n2'],
              ].map(([lbl, key]) => (
                <div key={key}>
                  <Label>{lbl}</Label>
                  <input type="password" value={f[key]}
                         onChange={e => setF(p => ({ ...p, [key]:e.target.value }))}
                         style={inp} placeholder="••••••••"/>
                </div>
              ))}
              <button onClick={() => { setErr(''); setForgot('request'); }}
                      style={{ background:'none', border:'none', color:'#4338ca',
                               fontSize:12, fontWeight:500, cursor:'pointer',
                               textAlign:'left', padding:0,
                               textDecoration:'underline', marginTop:2,
                               fontFamily:'inherit' }}>
                Mot de passe oublie ?
              </button>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <Button variant="secondary" type="button" onClick={close} style={{ flex:1 }}>
                  Annuler
                </Button>
                <Button variant="primary" type="button" onClick={save} disabled={loading} style={{ flex:2 }}>
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </>
          )}

          {forgot === 'request' && (
            <>
              <p style={{ fontSize:12, color:t.muted, margin:0, lineHeight:1.5 }}>
                Nous allons envoyer un code de securite a votre adresse email.
              </p>
              <div>
                <Label>Email du compte</Label>
                <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)}
                       style={inp} placeholder="email@exemple.com"/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button variant="secondary" type="button"
                        onClick={() => { setForgot(null); setErr(''); }} style={{ flex:1 }}>
                  Retour
                </Button>
                <Button variant="primary" type="button"
                        onClick={sendForgot} disabled={loading} style={{ flex:2 }}>
                  {loading ? 'Envoi...' : 'Envoyer le code'}
                </Button>
              </div>
            </>
          )}

          {forgot === 'code' && (
            <>
              <p style={{ fontSize:12, color:'#065f46', fontWeight:500, margin:0 }}>
                Code envoye a {fEmail}
              </p>
              <div>
                <Label>Code de confirmation</Label>
                <input value={fCode} onChange={e => setFCode(e.target.value)}
                       style={inp} placeholder="000000" inputMode="numeric"/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button variant="secondary" type="button"
                        onClick={() => { setForgot('request'); setErr(''); }} style={{ flex:1 }}>
                  Retour
                </Button>
                <Button variant="primary" type="button"
                        onClick={verifyForgot} disabled={loading} style={{ flex:2 }}>
                  {loading ? 'Verification...' : 'Valider'}
                </Button>
              </div>
            </>
          )}

          {forgot === 'new' && (
            <>
              <p style={{ fontSize:12, color:t.muted, margin:0 }}>
                Definissez votre nouveau mot de passe.
              </p>
              <div>
                <Label>Nouveau mot de passe</Label>
                <input type="password" value={fPwd} onChange={e => setFPwd(e.target.value)}
                       style={inp} placeholder="••••••••"/>
              </div>
              <div>
                <Label>Confirmer</Label>
                <input type="password" value={fPwd2} onChange={e => setFPwd2(e.target.value)}
                       style={inp} placeholder="••••••••"/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button variant="secondary" type="button" onClick={close} style={{ flex:1 }}>
                  Annuler
                </Button>
                <Button variant="primary" type="button"
                        onClick={resetForgot} disabled={loading} style={{ flex:2 }}>
                  {loading ? 'Enregistrement...' : 'Reinitialiser'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Zone danger : suppression compte ───────────────────────────────────────
function DangerZone({ theme, logout }) {
  const t = theme;
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
    } catch (e) { setErr(e.message || 'Erreur lors de la suppression.'); }
    finally { setLoad(false); }
  };

  if (!show) return (
    <button onClick={() => setShow(true)}
            style={{ width:'100%', padding:'12px', borderRadius:8,
                     border:`0.5px solid rgba(239,68,68,0.3)`,
                     background:'rgba(239,68,68,0.05)', color:'#991b1b',
                     fontWeight:500, fontSize:13, cursor:'pointer',
                     fontFamily:'inherit' }}>
      Supprimer mon compte
    </button>
  );

  return (
    <div style={{ background:'#fef2f2', borderRadius:12, padding:20,
                  border:`0.5px solid rgba(239,68,68,0.3)` }}>
      <p style={{ margin:'0 0 6px', fontWeight:500, fontSize:14, color:'#991b1b' }}>
        Suppression definitive du compte
      </p>
      <p style={{ margin:'0 0 14px', fontSize:12, color:'#991b1b', opacity:0.8, lineHeight:1.5 }}>
        Toutes vos donnees seront supprimees. Les transactions sont conservees de facon anonyme pour la comptabilite. Cette action est irreversible.
      </p>
      <input placeholder="Tapez SUPPRIMER pour confirmer"
             value={confirm}
             onChange={e => { setConfirm(e.target.value.toUpperCase()); setErr(''); }}
             style={{ width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
                      background:t.inputBg,
                      border:`0.5px solid rgba(239,68,68,0.3)`,
                      color:t.text, fontSize:13, fontFamily:'inherit',
                      marginBottom:10, boxSizing:'border-box' }}/>
      {err && <p style={{ color:'#991b1b', fontSize:12, margin:'0 0 10px' }}>{err}</p>}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={() => { setShow(false); setConfirm(''); setErr(''); }}
                style={{ flex:1, padding:'10px', borderRadius:8,
                         border:`0.5px solid ${t.borderStrong}`,
                         background:'transparent', color:t.text,
                         fontWeight:500, fontSize:13, cursor:'pointer',
                         fontFamily:'inherit' }}>
          Annuler
        </button>
        <button onClick={del} disabled={load || confirm !== 'SUPPRIMER'}
                style={{ flex:2, padding:'10px', borderRadius:8, border:'none',
                         background: confirm === 'SUPPRIMER' ? '#991b1b' : 'rgba(239,68,68,0.3)',
                         color:'white', fontWeight:500, fontSize:13, cursor:'pointer',
                         opacity: load ? 0.7 : 1, fontFamily:'inherit' }}>
          {load ? 'Suppression...' : 'Supprimer definitivement'}
        </button>
      </div>
    </div>
  );
}
