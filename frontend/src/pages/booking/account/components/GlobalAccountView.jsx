// src/pages/booking/account/components/GlobalAccountView.jsx
// Espace client global (multi-commerces) : login / register / dashboard
// (RDV + fidélité + profil + mot de passe + export RGPD + suppression).
// Extrait inchangé depuis booking/Account.jsx.
import { useState, useEffect } from 'react';
import { globalClientApi } from '../../../../utils/api';
import { STATUS_COLORS, STATUS_LABELS, fmtD } from '../helpers';

// ── Composant : Espace client global (multi-commerces) ────────────────────────
export function GlobalAccountView({ th, gcToken, gcUser, onLogin, onLogout, onBack }) {
  const [mode,    setMode]    = useState(gcUser ? 'dashboard' : 'login'); // login|register|dashboard|forgot_gc|forgot_gc_code
  const [email,   setEmail]   = useState('');
  const [pwd,     setPwd]     = useState('');
  const [first,   setFirst]   = useState('');
  const [last,    setLast]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [birthDate, setBirthDate] = useState(''); // YYYY-MM-DD, optionnel
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);
  const [apts,    setApts]    = useState([]);
  const [loyalty, setLoyalty] = useState([]);
  const [tab,     setTab]     = useState('appts');
  // Profil
  const [editFirst,  setEditFirst]  = useState('');
  const [editLast,   setEditLast]   = useState('');
  const [editPhone,  setEditPhone]  = useState('');
  const [editEmail,  setEditEmail]  = useState('');
  const [profOk,     setProfOk]     = useState('');
  const [profErr,    setProfErr]    = useState('');
  const [profLoad,   setProfLoad]   = useState(false);
  // Changement de mot de passe depuis profil
  const [curPwd,     setCurPwd]     = useState('');
  const [newPwd2,    setNewPwd2]    = useState('');
  const [pwdOk,      setPwdOk]      = useState('');
  const [pwdErr,     setPwdErr]     = useState('');
  const [pwdLoad,    setPwdLoad]    = useState(false);
  // Suppression de compte + RGPD
  const [delConfirm, setDelConfirm] = useState('');
  const [delLoad,    setDelLoad]    = useState(false);
  const [showRgpd,   setShowRgpd]   = useState(false);
  const [exportLoad, setExportLoad] = useState(false);
  const [delErr,     setDelErr]     = useState('');
  // Avertissement credits/dettes avant suppression (RGPD Art. 17.3.e).
  // Charge a l'ouverture du dashboard, affiche dans la zone Suppression.
  const [creditsSummary, setCreditsSummary] = useState({ credits: [], debts: [] });
  const [showDeleteWarn, setShowDeleteWarn] = useState(false);
  // Forgot password dans GlobalAccountView
  const [gcForgotEmail, setGcForgotEmail] = useState('');
  const [gcResetCode,   setGcResetCode]   = useState('');
  const [gcNewPwd,      setGcNewPwd]      = useState('');
  const [gcForgotErr,   setGcForgotErr]   = useState('');
  const [gcForgotOk,    setGcForgotOk]    = useState('');
  const [gcForgotLoad,  setGcForgotLoad]  = useState(false);

  const loadData = async () => {
    if (!gcToken) return;
    try {
      const [a, l] = await Promise.all([
        globalClientApi.appointments(gcToken),
        globalClientApi.loyalty(gcToken),
      ]);
      setApts(a||[]); setLoyalty(l||[]);
    } catch {}
  };

  useState(() => { if (gcUser) loadData(); }, [gcToken]);

  // Pré-remplir les champs profil quand on ouvre l'onglet
  const { useEffect: ue } = { useEffect: (fn, deps) => { try { fn(); } catch {} } };
  // Pré-remplir avec les infos actuelles
  const initProfileEdit = () => {
    setEditFirst(gcUser?.first_name || '');
    setEditLast(gcUser?.last_name   || '');
    setEditPhone(gcUser?.phone      || '');
    setEditEmail(gcUser?.email      || '');
    setProfOk(''); setProfErr('');
  };

  const saveProfile = async () => {
    setProfLoad(true); setProfOk(''); setProfErr('');
    try {
      const updated = await globalClientApi.updateMe(gcToken, {
        first_name: editFirst.trim(),
        last_name:  editLast.trim(),
        phone:      editPhone.trim(),
        email:      editEmail.trim() !== gcUser?.email ? editEmail.trim() : undefined,
      });
      // Mettre à jour le user local
      const newUser = { ...gcUser, ...updated };
      onLogin(gcToken, newUser);
      localStorage.setItem('ff_gc_user', JSON.stringify(newUser));
      setProfOk('Profil mis a jour !');
    } catch(e) { setProfErr(e.message || 'Erreur lors de la mise a jour'); }
    finally { setProfLoad(false); }
  };

  const savePassword = async () => {
    if (!curPwd || !newPwd2) { setPwdErr('Tous les champs sont requis.'); return; }
    if (newPwd2.length < 6) { setPwdErr('Le nouveau mot de passe doit faire au moins 6 caracteres.'); return; }
    setPwdLoad(true); setPwdOk(''); setPwdErr('');
    try {
      await globalClientApi.changePwd(gcToken, { current_password: curPwd, new_password: newPwd2 });
      setPwdOk('Mot de passe modifie !');
      setCurPwd(''); setNewPwd2('');
    } catch(e) { setPwdErr(e.message || 'Mot de passe actuel incorrect'); }
    finally { setPwdLoad(false); }
  };

  // Charge le resume credits/dettes au mount du dashboard. Le commercant
  // utilise ces infos pour afficher un avertissement clair avant la
  // suppression definitive du compte (RGPD Art. 17.3.e — coordonnees
  // conservees 2 ans pour le recouvrement si dette).
  useEffect(() => {
    if (mode !== 'dashboard') return;
    let cancelled = false;
    globalClientApi.creditsSummary(gcToken)
      .then(r => { if (!cancelled) setCreditsSummary(r || { credits: [], debts: [] }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mode, gcToken]);

  const requestDeleteAccount = () => {
    if (delConfirm !== 'SUPPRIMER') { setDelErr('Saisissez SUPPRIMER pour confirmer.'); return; }
    setDelErr('');
    // Si credits ou dettes en cours -> modal d'avertissement explicite
    // avant suppression effective. Sinon, suppression directe.
    const hasCredits = creditsSummary.credits?.length > 0;
    const hasDebts   = creditsSummary.debts?.length > 0;
    if (hasCredits || hasDebts) { setShowDeleteWarn(true); return; }
    confirmDeleteAccount();
  };

  const confirmDeleteAccount = async () => {
    setDelLoad(true); setDelErr('');
    try {
      await globalClientApi.deleteAccount(gcToken);
      onLogout();
    } catch(e) { setDelErr(e.message || 'Erreur lors de la suppression'); setDelLoad(false); setShowDeleteWarn(false); }
  };

  // Export RGPD — télécharge les données personnelles en JSON
  const exportMyData = async () => {
    setExportLoad(true);
    try {
      const BASE = import.meta.env.VITE_API_URL || '/api';
      // Cookie HttpOnly ff_gc_token / ff_client_token envoyé via credentials.
      // Header Authorization conservé en rétro-compat ancien stockage.
      const legacy = gcToken || localStorage.getItem('ff_gc_token') || localStorage.getItem('ff_client_token');
      const res = await fetch(`${BASE}/global-clients/me/export`, {
        credentials: 'include',
        headers: legacy ? { Authorization: `Bearer ${legacy}` } : {},
      });
      if (!res.ok) throw new Error('Erreur export');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'mes-donnees-flowia.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch(e) {
      alert(e.message || 'Erreur lors de l\'export');
    } finally { setExportLoad(false); }
  };;

  const handleLogin = async () => {
    setLoading(true); setErr('');
    try {
      const r = await globalClientApi.login({ email, password: pwd });
      onLogin(r.token, r.client);
      setMode('dashboard');
      setTimeout(loadData, 100);
    } catch(e) { setErr(e.message || 'Échec de la connexion.'); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    setLoading(true); setErr('');
    try {
      const r = await globalClientApi.register({ email, password: pwd, first_name: first, last_name: last, phone, birth_date: birthDate || null });
      onLogin(r.token, r.client);
      setMode('dashboard');
      setTimeout(loadData, 100);
    } catch(e) { setErr(e.message || 'Inscription impossible. Réessayez.'); }
    finally { setLoading(false); }
  };

  const sendGcResetCode = async () => {
    if (!gcForgotEmail.trim()) { setGcForgotErr('Entrez votre email.'); return; }
    setGcForgotLoad(true); setGcForgotErr(''); setGcForgotOk('');
    try {
      await globalClientApi.forgotPassword({ email: gcForgotEmail.trim() });
      setGcForgotOk('Un code a été envoye a votre email.');
      setMode('forgot_gc_code');
    } catch(e) { setGcForgotErr(e.message || 'Erreur'); }
    finally { setGcForgotLoad(false); }
  };

  const confirmGcReset = async () => {
    if (!gcResetCode.trim() || !gcNewPwd) { setGcForgotErr('Code et mot de passe requis.'); return; }
    if (gcNewPwd.length < 6) { setGcForgotErr('Mot de passe trop court (min. 6 car.).'); return; }
    setGcForgotLoad(true); setGcForgotErr(''); setGcForgotOk('');
    try {
      await globalClientApi.resetPassword({ email: gcForgotEmail.trim(), code: gcResetCode.trim(), new_password: gcNewPwd });
      setGcForgotOk('Mot de passe mis a jour ! Connectez-vous.');
      setMode('login'); setGcResetCode(''); setGcNewPwd('');
    } catch(e) { setGcForgotErr(e.message || 'Code invalide ou expire'); }
    finally { setGcForgotLoad(false); }
  };

  const inp = { width:'100%', padding:'12px 16px', borderRadius:14, border: `1px solid ${th.inputBorder}`, background:th.inputBg, color:th.text, fontSize:14, outline:'none', boxSizing:'border-box' };
  const statusC = STATUS_COLORS;
  const statusL = STATUS_LABELS;

  return (
    <div className="min-h-screen" style={{ background:th.bg }}>
      <div className="max-w-sm sm:max-w-md md:max-w-lg mx-auto px-4 pt-6 sm:pt-10 pb-12">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm mb-6" style={{ color:th.muted, background:'none', border:'none', cursor:'pointer' }}>
          ← Retour
        </button>

        {/* Header */}
        <div style={{ marginBottom:24 }}>
          <h1 style={{ fontSize:22, fontWeight: 500, color:th.text, margin:'0 0 4px' }}>Mon espace client</h1>
          <p style={{ fontSize:13, color:th.muted, margin:0 }}>Gérez vos rendez-vous et fidélité chez tous vos commerçants</p>
        </div>

        {/* MOT DE PASSE OUBLIÉ — saisie email */}
        {mode === 'forgot_gc' && (
          <div style={{ background:th.card, borderRadius:24, padding:24, border: `1px solid ${th.border}` }}>
            <button onClick={()=>{ setMode('login'); setGcForgotErr(''); setGcForgotOk(''); }}
              style={{ background:'none', border:'none', color:th.muted, fontSize:13, cursor:'pointer', marginBottom:16 }}>← Retour</button>
            <p style={{ margin:'0 0 6px', fontWeight: 500, fontSize:16, color:th.text }}>Mot de passe oublié</p>
            <p style={{ margin:'0 0 16px', fontSize:13, color:th.muted }}>Entrez votre email pour recevoir un code de réinitialisation.</p>
            <div style={{ marginBottom:12 }}>
              <input type="email" placeholder="Votre email" value={gcForgotEmail} onChange={e=>setGcForgotEmail(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&sendGcResetCode()} style={inp} />
            </div>
            {gcForgotErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 12px', fontWeight: 500 }}>{gcForgotErr}</p>}
            {gcForgotOk  && <p style={{ color:'#10b981', fontSize:13, margin:'0 0 12px', fontWeight: 500 }}>{gcForgotOk}</p>}
            <button onClick={sendGcResetCode} disabled={gcForgotLoad || !gcForgotEmail.trim()}
              style={{ width:'100%', padding:'15px', borderRadius:16, background: th.accent, color:'white', border:'none', fontWeight: 500, fontSize:15, cursor:'pointer', opacity:(gcForgotLoad||!gcForgotEmail.trim())?0.6:1 }}>
              {gcForgotLoad ? '...' : 'Envoyer le code'}
            </button>
          </div>
        )}

        {/* MOT DE PASSE OUBLIÉ — saisie code + nouveau mdp */}
        {mode === 'forgot_gc_code' && (
          <div style={{ background:th.card, borderRadius:24, padding:24, border: `1px solid ${th.border}` }}>
            <button onClick={()=>{ setMode('forgot_gc'); setGcForgotErr(''); }}
              style={{ background:'none', border:'none', color:th.muted, fontSize:13, cursor:'pointer', marginBottom:16 }}>← Retour</button>
            <p style={{ margin:'0 0 6px', fontWeight: 500, fontSize:16, color:th.text }}>Code de réinitialisation</p>
            <p style={{ margin:'0 0 16px', fontSize:13, color:th.muted }}>Vérifiez votre boîte mail et entrez le code à 6 chiffres.</p>
            {gcForgotOk && <p style={{ color:'#10b981', fontSize:13, margin:'0 0 12px', fontWeight: 500 }}>{gcForgotOk}</p>}
            <div style={{ marginBottom:10 }}>
              <input placeholder="Code à 6 chiffres" value={gcResetCode} onChange={e=>setGcResetCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                maxLength={6} style={{ ...inp, textAlign:'center', fontSize:22, fontWeight: 500, letterSpacing:'0.3em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
            </div>
            <div style={{ marginBottom:16 }}>
              <input type="password" placeholder="Nouveau mot de passe (min. 6 car.)" value={gcNewPwd} onChange={e=>setGcNewPwd(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&confirmGcReset()} style={inp} />
            </div>
            {gcForgotErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 12px', fontWeight: 500 }}>{gcForgotErr}</p>}
            <button onClick={confirmGcReset} disabled={gcForgotLoad || gcResetCode.length < 6 || gcNewPwd.length < 6}
              style={{ width:'100%', padding:'15px', borderRadius:16, background: th.accent, color:'white', border:'none', fontWeight: 500, fontSize:15, cursor:'pointer', opacity:(gcForgotLoad||gcResetCode.length<6||gcNewPwd.length<6)?0.6:1 }}>
              {gcForgotLoad ? '...' : 'Changer le mot de passe'}
            </button>
          </div>
        )}

        {/* LOGIN / REGISTER */}
        {!gcUser && mode !== 'forgot_gc' && mode !== 'forgot_gc_code' && (
          <div style={{ background:th.card, borderRadius:24, padding:24, border: `1px solid ${th.border}` }}>
            <div style={{ display:'flex', gap:0, marginBottom:20, background:th.inputBg, borderRadius:12, padding:4 }}>
              {['login','register'].map(m => (
                <button key={m} onClick={()=>setMode(m)} style={{ flex:1, padding:'9px', borderRadius:10, border:'none', fontWeight: 500, fontSize:13, cursor:'pointer', background:mode===m?'#6366f1':'transparent', color:mode===m?'white':th.muted }}>
                  {m==='login' ? 'Connexion' : 'Creer un compte'}
                </button>
              ))}
            </div>

            {mode==='register' && (
              <div className="bk-grid2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <input placeholder="Prénom *" value={first} onChange={e=>setFirst(e.target.value)} style={inp} />
                <input placeholder="Nom" value={last} onChange={e=>setLast(e.target.value)} style={inp} />
              </div>
            )}
            <div style={{ marginBottom:10 }}>
              <input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inp} />
            </div>
            {mode==='register' && (
              <div style={{ marginBottom:10 }}>
                <input placeholder="Téléphone (optionnel)" value={phone} onChange={e=>setPhone(e.target.value)} style={inp} />
              </div>
            )}
            {mode==='register' && (
              <div style={{ marginBottom:10 }}>
                <label style={{ display:'block', fontSize:11, fontWeight: 500, color:th.muted,
                  marginBottom:4 }}>
                  🎂 Date de naissance (optionnel)
                </label>
                <input type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)}
                  max={new Date().toISOString().slice(0,10)} style={inp} />
                <p style={{ fontSize:11, color:th.dim, margin:'4px 0 0' }}>
                  Recevez une offre spéciale le jour de votre anniversaire.
                </p>
              </div>
            )}
            <div style={{ marginBottom:16 }}>
              <input placeholder="Mot de passe" type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&(mode==='login'?handleLogin():handleRegister())} style={inp} />
            </div>
            {err && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 12px', fontWeight: 500 }}>{err}</p>}
            <button onClick={mode==='login'?handleLogin:handleRegister} disabled={loading}
              style={{ width:'100%', padding:'15px', borderRadius:16, background: th.accent, color:'white', border:'none', fontWeight: 500, fontSize:15, cursor:'pointer', opacity:loading?0.7:1 }}>
              {loading ? '...' : (mode==='login' ? 'Se connecter' : 'Creer mon compte')}
            </button>
            {mode==='login' && (
              <p style={{ textAlign:'center', margin:'12px 0 0' }}>
                <button onClick={()=>setMode('forgot_gc')}
                  style={{ background:'none', border:'none', color:th.muted, fontSize:12, cursor:'pointer', textDecoration:'underline' }}>
                  Mot de passe oublié ?
                </button>
              </p>
            )}
            <p style={{ textAlign:'center', fontSize:12, color:th.muted, margin:'10px 0 0' }}>
              Un seul compte pour tous vos commerçants FlowIA
            </p>
          </div>
        )}

        {/* DASHBOARD */}
        {gcUser && (<>
          {/* Profil */}
          <div style={{ background:th.card, borderRadius:20, padding:20, border: `1px solid ${th.border}`, marginBottom:16, display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:52, height:52, borderRadius:16, background: th.accent, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight: 500, fontSize:20 }}>
              {(gcUser.first_name||'?').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ margin:'0 0 2px', fontWeight: 500, fontSize:16, color:th.text }}>{gcUser.first_name} {gcUser.last_name}</p>
              <p style={{ margin:0, fontSize:12, color:th.muted }}>{gcUser.email}</p>
            </div>
            <button onClick={onLogout} style={{ padding:'6px 12px', borderRadius:10, background:'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color:'#ef4444', fontWeight: 500, fontSize:12, cursor:'pointer' }}>
              Déco.
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:6, marginBottom:16, overflowX:'auto' }}>
            {[['appts','📅 RDV'],['loyalty','🎫 Fidélite'],['profile','👤 Profil']].map(([t,lbl]) => (
              <button key={t} onClick={()=>setTab(t)} style={{ flexShrink:0, padding:'9px 14px', borderRadius:14, border:'none', fontWeight: 500, fontSize:12, cursor:'pointer', background:tab===t?'#6366f1':'rgba(99,102,241,0.08)', color:tab===t?'white':'#6366f1' }}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Rendez-vous */}
          {tab==='appts' && (<>
            {apts.length===0 && <p style={{ textAlign:'center', color:th.muted, padding:32 }}>Aucun rendez-vous enregistré.</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {apts.map((a,i) => (
                <div key={i} style={{ background:th.card, borderRadius:16, padding:16, border: `1px solid ${th.border}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div>
                      <p style={{ margin:'0 0 2px', fontWeight: 500, fontSize:14, color:th.text }}>{a.service_name||'Rendez-vous'}</p>
                      <p style={{ margin:0, fontSize:12, color:th.muted }}>{a.business_name}</p>
                    </div>
                    <span style={{ fontSize:11, fontWeight: 500, color:statusC[a.status]||'#94a3b8', background:`${statusC[a.status]||'#94a3b8'}18`, padding:'3px 10px', borderRadius:99 }}>
                      {statusL[a.status]||a.status}
                    </span>
                  </div>
                  <p style={{ margin:0, fontSize:12, color:th.muted }}>
                    {fmtD(a.date)} · {(a.start_time||'').slice(0,5)}
                    {a.employee_name ? ` · ${a.employee_name}` : ''}
                  </p>
                  {a.total_amount && <p style={{ margin:'4px 0 0', fontSize:13, fontWeight: 500, color:'#10b981' }}>{Number(a.total_amount).toFixed(2)} €</p>}
                </div>
              ))}
            </div>
          </>)}

          {/* Fidélité multi-commerces */}
          {tab==='loyalty' && (<>
            {loyalty.length===0 && <p style={{ textAlign:'center', color:th.muted, padding:32 }}>Aucun programme fidélité actif.</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {loyalty.map((l,i) => {
                const mode = l.loyalty_mode === 'points' ? 'points' : 'stamps';
                const current = mode==='points' ? Math.floor(l.points||0) : (l.stamps||0);
                const required = l.stamps_required || 10;
                const pct = Math.min(100, Math.round((current/required)*100));
                return (
                  <div key={i} style={{ background:th.card, borderRadius:16, padding:16, border: `1px solid ${th.border}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <div>
                        <p style={{ margin:'0 0 2px', fontWeight: 500, fontSize:14, color:th.text }}>{l.business_name}</p>
                        <p style={{ margin:0, fontSize:11, color:th.muted }}>{l.reward_label}</p>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <span style={{ fontSize:20, fontWeight: 500, color:'#f59e0b', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{current}</span>
                        <span style={{ fontSize:12, color:th.muted }}>/{required} {mode==='points'?'pts':'🎫'}</span>
                      </div>
                    </div>
                    <div style={{ height:6, background:'rgba(245,158,11,0.15)', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background: '#f59e0b', borderRadius:99, transition:'width 0.5s' }} />
                    </div>
                    {l.last_visit && <p style={{ margin:'8px 0 0', fontSize:11, color:th.muted }}>Dernière visite : {fmtD(l.last_visit)}</p>}
                  </div>
                );
              })}
            </div>
          </>)}

          {/* ─── ONGLET PROFIL ─── */}
          {tab==='profile' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

              {/* Avatar Google si disponible */}
              {gcUser?.avatar_url && (
                <div style={{ display:'flex', alignItems:'center', gap:12,
                  padding:'14px 16px', background:th.card,
                  borderRadius:16, border: `1px solid ${th.border}` }}>
                  <img src={gcUser.avatar_url} alt="avatar"
                    style={{ width:48, height:48, borderRadius:99, objectFit:'cover',
                      border:`2px solid ${th.border}` }} />
                  <div>
                    <p style={{ margin:'0 0 2px', fontWeight: 500, fontSize:14, color:th.text }}>
                      {gcUser.first_name} {gcUser.last_name}
                    </p>
                    <p style={{ margin:0, fontSize:11, color:th.muted }}>
                      🔗 Connecté via Google
                    </p>
                  </div>
                </div>
              )}

              {/* Édition du profil */}
              <div style={{ background:th.card, borderRadius:20, padding:20, border: `1px solid ${th.border}` }}>
                <p style={{ margin:'0 0 14px', fontWeight: 500, fontSize:15, color:th.text }}>Mes informations</p>
                <div className="bk-grid2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  <input placeholder="Prénom" value={editFirst||gcUser?.first_name||''}
                    onFocus={e=>{ if(!editFirst&&!editLast) initProfileEdit(); }}
                    onChange={e=>setEditFirst(e.target.value)} style={inp} />
                  <input placeholder="Nom" value={editLast||gcUser?.last_name||''}
                    onFocus={e=>{ if(!editFirst&&!editLast) initProfileEdit(); }}
                    onChange={e=>setEditLast(e.target.value)} style={inp} />
                </div>
                <div style={{ marginBottom:10 }}>
                  <input type="email" placeholder="Email" value={editEmail||gcUser?.email||''}
                    onFocus={e=>{ if(!editEmail) initProfileEdit(); }}
                    onChange={e=>setEditEmail(e.target.value)} style={inp} />
                </div>
                <div style={{ marginBottom:14 }}>
                  <input placeholder="Téléphone" value={editPhone||gcUser?.phone||''}
                    onFocus={e=>{ if(!editPhone) initProfileEdit(); }}
                    onChange={e=>setEditPhone(e.target.value)} style={inp} />
                </div>
                {profErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 10px', fontWeight: 500 }}>{profErr}</p>}
                {profOk  && <p style={{ color:'#10b981', fontSize:13, margin:'0 0 10px', fontWeight: 500 }}>{profOk}</p>}
                <button onClick={saveProfile} disabled={profLoad}
                  style={{ width:'100%', padding:'13px', borderRadius:14, background: th.accent, color:'white', border:'none', fontWeight: 500, fontSize:14, cursor:'pointer', opacity:profLoad?0.7:1 }}>
                  {profLoad ? '...' : 'Enregistrer les modifications'}
                </button>
              </div>

              {/* Changer le mot de passe */}
              <div style={{ background:th.card, borderRadius:20, padding:20, border: `1px solid ${th.border}` }}>
                <p style={{ margin:'0 0 14px', fontWeight: 500, fontSize:15, color:th.text }}>Changer le mot de passe</p>
                <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
                  <input type="password" placeholder="Mot de passe actuel" value={curPwd} onChange={e=>setCurPwd(e.target.value)} style={inp} />
                  <input type="password" placeholder="Nouveau mot de passe (min. 6 car.)" value={newPwd2} onChange={e=>setNewPwd2(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&savePassword()} style={inp} />
                </div>
                {pwdErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 10px', fontWeight: 500 }}>{pwdErr}</p>}
                {pwdOk  && <p style={{ color:'#10b981', fontSize:13, margin:'0 0 10px', fontWeight: 500 }}>{pwdOk}</p>}
                <button onClick={savePassword} disabled={pwdLoad || !curPwd || !newPwd2}
                  style={{ width:'100%', padding:'13px', borderRadius:14, background:'rgba(99,102,241,0.1)', color:'#6366f1', border: '1px solid rgba(99,102,241,0.25)', fontWeight: 500, fontSize:14, cursor:'pointer', opacity:(pwdLoad||!curPwd||!newPwd2)?0.5:1 }}>
                  {pwdLoad ? '...' : 'Modifier le mot de passe'}
                </button>
              </div>

              {/* Export données RGPD */}
              <div style={{ background:th.card, borderRadius:20, padding:20, border: `1px solid ${th.border}` }}>
                <p style={{ margin:'0 0 4px', fontWeight: 500, fontSize:15, color:th.text }}>📦 Mes données personnelles</p>
                <p style={{ margin:'0 0 14px', fontSize:12, color:th.muted, lineHeight:1.5 }}>
                  Conformément au RGPD (Art. 20), vous pouvez télécharger l'ensemble de vos données personnelles
                  stockées sur FlowIA : compte, rendez-vous, fidélité.
                </p>
                <button onClick={exportMyData} disabled={exportLoad}
                  style={{ width:'100%', padding:'12px', borderRadius:12,
                    background:'rgba(99,102,241,0.08)', color:'#6366f1',
                    border: '1px solid rgba(99,102,241,0.2)',
                    fontWeight: 500, fontSize:13, cursor:'pointer',
                    opacity:exportLoad?0.6:1, marginBottom:10 }}>
                  {exportLoad ? '⏳ Préparation...' : '⬇️ Télécharger mes données (JSON)'}
                </button>
                <button onClick={()=>setShowRgpd(true)}
                  style={{ width:'100%', padding:'10px', borderRadius:12,
                    background:'transparent', color:th.muted,
                    border: `1px solid ${th.border}`,
                    fontWeight: 500, fontSize:12, cursor:'pointer' }}>
                  📋 Politique de confidentialité
                </button>
              </div>

              {/* Suppression de compte */}
              <div style={{ background:'rgba(239,68,68,0.04)', borderRadius:20, padding:20, border: '1px solid rgba(239,68,68,0.15)' }}>
                <p style={{ margin:'0 0 6px', fontWeight: 500, fontSize:15, color:'#ef4444' }}>🗑 Supprimer mon compte</p>
                <p style={{ margin:'0 0 14px', fontSize:12, color:th.muted, lineHeight:1.5 }}>
                  Vos données personnelles (nom, email, téléphone) seront <strong>définitivement effacées</strong>.
                  Les historiques de transactions sont conservés de façon anonyme pour la comptabilité des commerçants.
                </p>
                <input placeholder="Tapez SUPPRIMER pour confirmer" value={delConfirm}
                  onChange={e=>{ setDelConfirm(e.target.value.toUpperCase()); setDelErr(''); }}
                  style={{ width:'100%', padding:'12px 14px', borderRadius:10, outline:'none',
                    background:th.inputBg, border: '1px solid rgba(239,68,68,0.3)',
                    color:th.text, fontSize:13, marginBottom:10, boxSizing:'border-box' }} />
                {delErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 10px', fontWeight: 500 }}>{delErr}</p>}
                <button onClick={requestDeleteAccount} disabled={delLoad || delConfirm !== 'SUPPRIMER'}
                  style={{ width:'100%', padding:'13px', borderRadius:14,
                    background:'rgba(239,68,68,0.12)', color:'#ef4444',
                    border: '1px solid rgba(239,68,68,0.25)',
                    fontWeight: 500, fontSize:14, cursor:'pointer',
                    opacity:(delLoad||delConfirm!=='SUPPRIMER')?0.5:1 }}>
                  {delLoad ? '...' : '🗑 Supprimer définitivement mon compte'}
                </button>
              </div>

              {/* Modal d'avertissement RGPD : credits perdus + dettes archivees */}
              {showDeleteWarn && (
                <div style={{ position:'fixed', inset:0, zIndex:1100,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              padding:16, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)' }}
                     onClick={(e) => { if (e.target === e.currentTarget && !delLoad) setShowDeleteWarn(false); }}>
                  <div style={{ background:th.card, borderRadius:20, padding:24,
                                maxWidth:520, width:'100%', maxHeight:'85vh', overflowY:'auto',
                                border:`1px solid ${th.border}`, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
                    <p style={{ margin:'0 0 12px', fontWeight:500, fontSize:17, color:'#ef4444' }}>
                      Avant de supprimer votre compte
                    </p>

                    {creditsSummary.credits?.length > 0 && (
                      <div style={{ marginBottom:16, padding:'12px 14px', borderRadius:12,
                                    background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)' }}>
                        <p style={{ margin:'0 0 8px', fontWeight:500, fontSize:13, color:'#92400e' }}>
                          Crédits que vous allez abandonner :
                        </p>
                        {creditsSummary.credits.map((c, i) => (
                          <div key={i} style={{ display:'flex', justifyContent:'space-between',
                                                fontSize:12, color:'#7c2d12', padding:'4px 0' }}>
                            <span>{c.merchant_name}</span>
                            <span style={{ fontWeight:500 }}>{c.amount.toFixed(2)} €</span>
                          </div>
                        ))}
                        <p style={{ margin:'8px 0 0', fontSize:11, color:'#92400e', lineHeight:1.5 }}>
                          Ces crédits seront perdus. Si vous souhaitez les récupérer, contactez le commerçant
                          concerné avant de supprimer votre compte.
                        </p>
                      </div>
                    )}

                    {creditsSummary.debts?.length > 0 && (
                      <div style={{ marginBottom:16, padding:'12px 14px', borderRadius:12,
                                    background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)' }}>
                        <p style={{ margin:'0 0 8px', fontWeight:500, fontSize:13, color:'#991b1b' }}>
                          Dettes en cours auprès de :
                        </p>
                        {creditsSummary.debts.map((d, i) => (
                          <div key={i} style={{ display:'flex', justifyContent:'space-between',
                                                fontSize:12, color:'#991b1b', padding:'4px 0' }}>
                            <span>{d.merchant_name}</span>
                            <span style={{ fontWeight:500 }}>−{d.amount.toFixed(2)} €</span>
                          </div>
                        ))}
                        <p style={{ margin:'8px 0 0', fontSize:11, color:'#991b1b', lineHeight:1.6 }}>
                          La suppression de votre compte <strong>ne vous libère pas de ces dettes</strong>.
                          Vos coordonnées (nom, email, téléphone) seront <strong>conservées 2 ans</strong>
                          par le(s) commerçant(s) concerné(s) pour permettre le recouvrement, conformément
                          à l'<strong>Article 17.3.e du RGPD</strong>. Au-delà, elles seront automatiquement effacées.
                        </p>
                      </div>
                    )}

                    {delErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 10px', fontWeight:500 }}>{delErr}</p>}

                    <div style={{ display:'flex', gap:8, marginTop:12 }}>
                      <button onClick={() => { if (!delLoad) setShowDeleteWarn(false); }}
                              disabled={delLoad}
                              style={{ flex:1, padding:'12px', borderRadius:12,
                                       background:'transparent', color:th.text,
                                       border:`1px solid ${th.border}`,
                                       fontWeight:500, fontSize:13, cursor:delLoad?'wait':'pointer' }}>
                        Annuler
                      </button>
                      <button onClick={confirmDeleteAccount} disabled={delLoad}
                              style={{ flex:2, padding:'12px', borderRadius:12,
                                       background:'#ef4444', color:'#fff',
                                       border:'none', fontWeight:500, fontSize:13,
                                       cursor:delLoad?'wait':'pointer', opacity:delLoad?0.7:1 }}>
                        {delLoad ? 'Suppression...' : 'Supprimer quand même'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Politique de confidentialité RGPD */}
              {showRgpd && (
                <div style={{ position:'fixed', inset:0, zIndex:1000,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  padding:16, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
                  onClick={()=>setShowRgpd(false)}>
                  <div style={{ background:th.card, borderRadius:24, padding:28,
                    maxWidth:480, width:'100%', maxHeight:'80vh', overflowY:'auto',
                    border: `1px solid ${th.border}` }}
                    onClick={e=>e.stopPropagation()}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                      <p style={{ margin:0, fontWeight: 500, fontSize:16, color:th.text }}>🔒 Politique de confidentialité</p>
                      <button onClick={()=>setShowRgpd(false)}
                        style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:th.muted }}>×</button>
                    </div>
                    {[
                      ['Données collectées', 'Lors de votre inscription et de vos réservations, nous collectons : prénom, nom, email, téléphone. Ces données sont nécessaires pour gérer vos rendez-vous.'],
                      ['Finalité', "Vos données sont utilisées exclusivement pour : la gestion de vos réservations, l'envoi de confirmations et rappels, le programme de fidélité."],
                      ['Durée de conservation', 'Vos données personnelles sont conservées le temps de votre inscription. Les historiques de transactions sont conservés de façon anonyme à des fins comptables.'],
                      ['Vos droits (Art. 15-22 RGPD)', "Vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition. Exercez-les depuis votre profil ou en contactant le commerçant."],
                      ['Sécurité', "Vos mots de passe sont chiffrés (bcrypt). Les communications sont sécurisées par SSL/TLS. Aucune donnée n'est vendue à des tiers."],
                      ['Contact', "Pour toute question relative à vos données personnelles, contactez directement le commerçant ou écrivez à l'adresse indiquée sur le site de réservation."],
                    ].map(([title, text]) => (
                      <div key={title} style={{ marginBottom:14 }}>
                        <p style={{ margin:'0 0 4px', fontWeight: 500, fontSize:13, color:th.text }}>{title}</p>
                        <p style={{ margin:0, fontSize:12, color:th.muted, lineHeight:1.6 }}>{text}</p>
                      </div>
                    ))}
                    <button onClick={()=>setShowRgpd(false)}
                      style={{ width:'100%', padding:'12px', borderRadius:12, marginTop:8,
                        background: th.accent, color:'white',
                        border:'none', fontWeight: 500, fontSize:13, cursor:'pointer' }}>
                      Fermer
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </>)}
      </div>
    </div>
  );
}
