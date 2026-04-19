// src/pages/booking/Account.jsx
// Composants compte client : AuthPanel (login/register au commerce) +
// GlobalAccountView (espace client multi-commerces).
import { useState, useEffect, useRef } from 'react';
import { pubApi, globalClientApi } from '../../utils/api';

// ── Panneau Auth client ───────────────────────────────────────────────────────
export function AuthPanel({ slug, th, onAuth, onClose, requireAccount, initialEmail = '', initialMode = 'login', referralCode = '' }) {
  const [mode, setMode]         = useState(initialMode);
  const [email, setEmail]       = useState(initialEmail);
  const [pwd, setPwd]           = useState('');
  const [newPwd, setNewPwd]     = useState('');
  const [code, setCode]         = useState('');
  const [first, setFirst]       = useState('');
  const [last, setLast]         = useState('');
  const [phone, setPhone]       = useState('');
  const [err, setErr]           = useState('');
  const [ok, setOk]             = useState('');
  const [loading, setLoading]   = useState(false);
  const [consent, setConsent]   = useState(false);
  const [showRgpdModal, setShowRgpdModal] = useState(false);

  // Détection intelligente du type de compte à la saisie email
  const [emailType, setEmailType]   = useState(null);   // null | 'free' | 'local' | 'global' | 'both'
  const [emailChecking, setEmailChecking] = useState(false);
  const emailTimer = useRef(null);

  const inp  = "w-full px-4 py-3.5 rounded-2xl text-sm focus:outline-none";
  const inpSt = { background:th.inputBg, border:`1px solid ${th.inputBorder}`, color:th.text };

  // Vérifier l'email dès la saisie (debounce 500ms)
  const handleEmailChange = (val) => {
    setEmail(val);
    setEmailType(null);
    setErr('');
    clearTimeout(emailTimer.current);
    if (!val.includes('@') || !val.includes('.')) return;
    setEmailChecking(true);
    emailTimer.current = setTimeout(async () => {
      try {
        const res = await pubApi.checkEmail(slug, val.trim());
        setEmailType(res.exists ? res.type : 'free');
        // Auto-switch vers login si compte détecté
        if (res.exists && mode === 'register') {
          setMode('login');
          setErr('Un compte existe avec cet email. Connectez-vous.');
        }
      } catch { setEmailType(null); }
      finally { setEmailChecking(false); }
    }, 500);
  };

  // Init : si email pré-rempli depuis bannière, vérifier directement
  useEffect(() => {
    if (initialEmail) handleEmailChange(initialEmail);
  }, []);

  // Connexion via Google — ouvre une popup
  const loginWithGoogle = () => {
    const url = pubApi.googleAuthUrl(slug);
    const popup = window.open(url, 'google_auth',
      'width=500,height=600,scrollbars=yes,resizable=yes,top=100,left=' +
      Math.round((window.screen.width - 500) / 2)
    );
    const cleanup = () => window.removeEventListener('message', handler);
    const handler = (e) => {
      if (e.data?.type !== 'GOOGLE_AUTH_SUCCESS') return;
      cleanup();
      try { popup && popup.close(); } catch {}
      const { token, client } = e.data;
      if (!token || !client) return;
      localStorage.setItem('ff_client_token', token);
      localStorage.setItem('ff_client_info', JSON.stringify(client));
      onAuth(client);
    };
    window.addEventListener('message', handler);
    // Cleanup de secours après 5min — on ne polle plus popup.closed
    // (bloqué par Cross-Origin-Opener-Policy de la page Google).
    setTimeout(cleanup, 5 * 60 * 1000);
  };

  const submit = async () => {
    setLoading(true); setErr(''); setOk('');
    try {
      let r;
      if (mode === 'login') {
        r = await pubApi.login(slug, { email: email.trim(), password: pwd });
      } else {
        if (!first.trim() || !last.trim()) { setErr('Prenom et nom requis.'); setLoading(false); return; }
        if (pwd.length < 6) { setErr('Mot de passe minimum 6 caracteres.'); setLoading(false); return; }
        r = await pubApi.register(slug, { email: email.trim(), password: pwd, first_name: first.trim(), last_name: last.trim(), phone: phone.trim(), referral_code: referralCode || undefined });
      }
      localStorage.setItem('ff_client_token', r.token);
      localStorage.setItem('ff_client_info', JSON.stringify(r.client));
      // Signale au parent si c'est une inscription (pour popup post-register
      // qui demande mois/année de naissance + téléphone optionnels).
      onAuth(r.client, { justRegistered: mode === 'register' });
    } catch(e) {
      // Si l'erreur indique qu'un compte existe → basculer en login
      if (e.message?.includes('existe') || e.message?.includes('USE_LOGIN') || e.message?.includes('deja')) {
        setMode('login');
        setErr('Un compte existe dejà avec cet email. Connectez-vous a la place.');
      } else {
        setErr(e.message);
      }
    }
    finally { setLoading(false); }
  };

  const sendResetCode = async () => {
    if (!email.trim()) { setErr('Entrez votre email.'); return; }
    setLoading(true); setErr(''); setOk('');
    try {
      await globalClientApi.forgotPassword({ email: email.trim() });
      setOk('Un code de réinitialisation a été envoye a votre email.');
      setMode('forgot_code');
    } catch(e) { setErr(e.message || 'Erreur envoi email'); }
    finally { setLoading(false); }
  };

  const confirmReset = async () => {
    if (!code.trim() || !newPwd) { setErr('Code et nouveau mot de passe requis.'); return; }
    if (newPwd.length < 6) { setErr('Le mot de passe doit faire au moins 6 caracteres.'); return; }
    setLoading(true); setErr(''); setOk('');
    try {
      await globalClientApi.resetPassword({ email: email.trim(), code: code.trim(), new_password: newPwd });
      setOk('Mot de passe mis a jour !');
      setMode('login'); setCode(''); setNewPwd('');
    } catch(e) { setErr(e.message || 'Code invalide ou expire'); }
    finally { setLoading(false); }
  };

  // Badge informatif selon type de compte détecté
  const EmailBadge = () => {
    if (emailChecking) return (
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:10, background:'rgba(99,102,241,0.06)', border:`1px solid rgba(99,102,241,0.15)`, marginTop:4 }}>
        <div style={{ width:12, height:12, borderRadius:'50%', border:'2px solid rgba(99,102,241,0.2)', borderTopColor:'#6366f1', animation:'spin .7s linear infinite', flexShrink:0 }} />
        <span style={{ fontSize:12, color:'#6366f1' }}>Vérification…</span>
      </div>
    );
    if (!emailType || emailType === 'free') return null;
    if (emailType === 'global' || emailType === 'both') return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.2)', marginTop:4 }}>
        <span style={{ fontSize:14 }}>✅</span>
        <div>
          <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#10b981' }}>Compte plateforme reconnu</p>
          <p style={{ margin:0, fontSize:11, color:'rgba(16,185,129,0.8)' }}>Connectez-vous avec votre mot de passe habituel</p>
        </div>
      </div>
    );
    if (emailType === 'local') return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)', marginTop:4 }}>
        <span style={{ fontSize:14 }}>💡</span>
        <div>
          <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#d97706' }}>Compte existant</p>
          <p style={{ margin:0, fontSize:11, color:'rgba(217,119,6,0.8)' }}>Connectez-vous avec votre mot de passe</p>
        </div>
      </div>
    );
    return null;
  };

  // Styles inline cohérents avec le design noir/blanc
  const S = {
    card:   { background:th.card, border:`1px solid ${th.border}`, borderRadius:16, overflow:'hidden' },
    inp:    { width:'100%', padding:'11px 14px', borderRadius:10, outline:'none',
              background:th.inputBg, border:`1px solid ${th.inputBorder}`,
              color:th.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box' },
    btnPrimary: { width:'100%', padding:'13px', borderRadius:11, border:'none',
                  background:th.accent, color:th.accentText, fontWeight:800,
                  fontSize:14, cursor:'pointer', letterSpacing:'-0.01em' },
    btnSecondary: { width:'100%', padding:'13px', borderRadius:11,
                    background:'transparent', border:`1px solid ${th.border}`,
                    color:th.text, fontWeight:700, fontSize:14, cursor:'pointer' },
    label:  { display:'block', fontSize:11, fontWeight:700, color:th.muted,
              marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em' },
  };

  return (
    <div style={S.card}>
      <div style={{ padding:20 }}>

        {/* Badge compte requis */}
        {requireAccount && mode !== 'forgot' && mode !== 'forgot_code' && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
            borderRadius:10, background:'rgba(245,158,11,0.08)',
            border:'1px solid rgba(245,158,11,0.2)', marginBottom:16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"
              style={{width:15,height:15,flexShrink:0}}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#d97706' }}>
              Un compte est requis pour réserver
            </p>
          </div>
        )}

        {/* ── TABS LOGIN / REGISTER ── */}
        {mode !== 'forgot' && mode !== 'forgot_code' && (
          <div style={{ display:'flex', gap:4, padding:4, background:th.inputBg,
            borderRadius:12, marginBottom:18 }}>
            {[['login','Se connecter'],['register','Creer un compte']].map(([m,l]) => (
              <button key={m} onClick={()=>{setMode(m);setErr('');setOk('');}}
                style={{ flex:1, padding:'9px 0', borderRadius:9, fontSize:13, fontWeight:700,
                  background: mode===m ? th.accent : 'transparent',
                  color: mode===m ? th.accentText : th.muted,
                  border:'none', cursor:'pointer', transition:'all .15s' }}>
                {l}
              </button>
            ))}
          </div>
        )}

        {/* ── MOT DE PASSE OUBLIÉ — saisie email ── */}
        {mode === 'forgot' && (
          <div>
            <button onClick={()=>{setMode('login');setErr('');setOk('');}}
              style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600,
                color:th.muted, background:'none', border:'none', cursor:'pointer', marginBottom:16 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{width:14,height:14}}><polyline points="15 18 9 12 15 6"/></svg>
              Retour
            </button>
            <p style={{ fontSize:15, fontWeight:800, color:th.text, margin:'0 0 6px' }}>
              Mot de passe oublié
            </p>
            <p style={{ fontSize:12, color:th.muted, margin:'0 0 14px', lineHeight:1.5 }}>
              Entrez votre email pour recevoir un code de réinitialisation.
            </p>
            <div style={{ marginBottom:12 }}>
              <label style={S.label}>Email</label>
              <input type="email" placeholder="votre@email.com" value={email}
                onChange={e=>setEmail(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&sendResetCode()}
                style={S.inp}/>
            </div>
            {err && <p style={{fontSize:12,color:'#ef4444',margin:'0 0 10px',fontWeight:600}}>{err}</p>}
            {ok  && <p style={{fontSize:12,color:'#16a34a',margin:'0 0 10px',fontWeight:600}}>{ok}</p>}
            <button onClick={sendResetCode} disabled={loading||!email.trim()}
              style={{...S.btnPrimary, opacity:loading||!email.trim()?0.5:1}}>
              {loading ? '...' : 'Envoyer le code'}
            </button>
          </div>
        )}

        {/* ── RESET CODE ── */}
        {mode === 'forgot_code' && (
          <div>
            <button onClick={()=>{setMode('forgot');setErr('');setOk('');}}
              style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600,
                color:th.muted, background:'none', border:'none', cursor:'pointer', marginBottom:16 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{width:14,height:14}}><polyline points="15 18 9 12 15 6"/></svg>
              Retour
            </button>
            <p style={{ fontSize:15, fontWeight:800, color:th.text, margin:'0 0 4px' }}>
              Code reçu par email
            </p>
            {ok && <p style={{fontSize:12,color:'#16a34a',margin:'4px 0 12px',fontWeight:600}}>{ok}</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
              <div>
                <label style={S.label}>Code à 6 chiffres</label>
                <input placeholder="000000" value={code}
                  onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                  maxLength={6}
                  style={{...S.inp, textAlign:'center', fontSize:22, fontWeight:900,
                    letterSpacing:'0.3em', fontFamily:'monospace'}}/>
              </div>
              <div>
                <label style={S.label}>Nouveau mot de passe</label>
                <input type="password" placeholder="Minimum 6 caractères" value={newPwd}
                  onChange={e=>setNewPwd(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&confirmReset()}
                  style={S.inp}/>
              </div>
            </div>
            {err && <p style={{fontSize:12,color:'#ef4444',margin:'0 0 10px',fontWeight:600}}>{err}</p>}
            <button onClick={confirmReset}
              disabled={loading||code.length<6||newPwd.length<6}
              style={{...S.btnPrimary, opacity:loading||code.length<6||newPwd.length<6?0.5:1}}>
              {loading ? '...' : 'Changer le mot de passe'}
            </button>
          </div>
        )}

        {/* ── LOGIN / REGISTER ── */}
        {(mode === 'login' || mode === 'register') && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

            {/* Email avec détection intelligente */}
            <div>
              <label style={S.label}>Email *</label>
              <div style={{ position:'relative' }}>
                <input type="email" placeholder="votre@email.com" value={email}
                  onChange={e=>handleEmailChange(e.target.value)}
                  style={{...S.inp, paddingRight:emailChecking?36:14}}/>
                {emailChecking && (
                  <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                    width:13, height:13, borderRadius:'50%',
                    border:'2px solid rgba(0,0,0,0.1)', borderTopColor:th.accent,
                    animation:'spin .7s linear infinite' }}/>
                )}
              </div>
              <EmailBadge />
            </div>

            {/* Champs register */}
            {mode === 'register' && (
              <>
                <div className="bk-grid2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={S.label}>Prénom *</label>
                    <input placeholder="Prénom" value={first}
                      onChange={e=>setFirst(e.target.value)} style={S.inp}/>
                  </div>
                  <div>
                    <label style={S.label}>Nom *</label>
                    <input placeholder="Nom" value={last}
                      onChange={e=>setLast(e.target.value)} style={S.inp}/>
                  </div>
                </div>
                <div>
                  <label style={S.label}>Téléphone</label>
                  <input placeholder="06 00 00 00 00" value={phone}
                    onChange={e=>setPhone(e.target.value)} style={S.inp}/>
                </div>
              </>
            )}

            {/* Mot de passe */}
            <div>
              <label style={S.label}>Mot de passe *</label>
              <input type="password" placeholder="••••••••" value={pwd}
                onChange={e=>setPwd(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&submit()}
                style={S.inp}/>
            </div>

            {/* Erreur */}
            {err && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px',
                borderRadius:9, background:'rgba(239,68,68,0.06)',
                border:'1px solid rgba(239,68,68,0.2)' }}>
                <span style={{fontSize:13,flexShrink:0}}>⚠️</span>
                <p style={{margin:0,fontSize:12,color:'#dc2626',fontWeight:600}}>{err}</p>
              </div>
            )}
            {ok && <p style={{fontSize:12,color:'#16a34a',fontWeight:600}}>{ok}</p>}

            {/* Consentement RGPD — uniquement à l'inscription */}
            {mode === 'register' && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px',
                borderRadius:9, background:'rgba(99,102,241,0.04)',
                border:'1px solid rgba(99,102,241,0.15)' }}>
                <input type="checkbox" id="consent-rgpd" checked={consent}
                  onChange={e=>setConsent(e.target.checked)}
                  style={{ marginTop:2, flexShrink:0, accentColor:'#6366f1', cursor:'pointer' }} />
                <label htmlFor="consent-rgpd" style={{ fontSize:11, color:th.muted, lineHeight:1.5, cursor:'pointer' }}>
                  J'accepte que mes données personnelles (nom, email, téléphone) soient utilisées
                  pour gérer mes réservations, conformément au{' '}
                  <a href="#rgpd-policy" onClick={e=>{e.preventDefault();setShowRgpdModal(true);}}
                    style={{ color:'#6366f1', textDecoration:'underline' }}>
                    règlement RGPD
                  </a>. Vous pouvez supprimer votre compte à tout moment.
                </label>
              </div>
            )}

            {/* Bouton principal */}
            <button onClick={submit}
              disabled={loading||!email.trim()||!pwd||(mode==='register'&&(!first.trim()||!last.trim()||!consent))}
              style={{...S.btnPrimary,
                opacity:loading||!email.trim()||!pwd||(mode==='register'&&(!first.trim()||!last.trim()||!consent))?0.5:1,
                marginTop:4}}>
              {loading ? '...' : mode==='login' ? '→ Se connecter' : '→ Creer mon compte'}
            </button>

            {/* Séparateur + bouton Google — toujours visible */}
            <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
              <div style={{flex:1,height:1,background:th.border}}/>
              <span style={{fontSize:11,color:th.dim,whiteSpace:'nowrap',padding:'0 6px'}}>ou</span>
              <div style={{flex:1,height:1,background:th.border}}/>
            </div>
            <button onClick={loginWithGoogle}
              style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                padding:'11px',borderRadius:10,background:th.card,
                border:`1px solid ${th.border}`,cursor:'pointer',
                fontWeight:700,fontSize:13,color:th.text}}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuer avec Google
            </button>

            {/* Mot de passe oublié */}
            {mode === 'login' && (
              <button onClick={()=>{setMode('forgot');setErr('');setOk('');}}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:12,
                  color:th.muted, textAlign:'center', padding:'2px 0' }}>
                Mot de passe oublié ?
              </button>
            )}

            {/* Modal RGPD depuis inscription */}
            {showRgpdModal && (
              <div style={{ position:'fixed', inset:0, zIndex:2000,
                display:'flex', alignItems:'center', justifyContent:'center',
                padding:16, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }}
                onClick={()=>setShowRgpdModal(false)}>
                <div style={{ background:th.card||'#fff', borderRadius:20, padding:24,
                  maxWidth:420, width:'100%', maxHeight:'75vh', overflowY:'auto' }}
                  onClick={e=>e.stopPropagation()}>
                  <p style={{ margin:'0 0 12px', fontWeight:800, fontSize:15, color:'#111' }}>🔒 Politique de confidentialité</p>
                  {[
                    ['Données collectées','Prénom, nom, email, téléphone — utilisés pour gérer vos réservations.'],
                    ['Finalité','Gestion des rendez-vous, confirmations, rappels, fidélité.'],
                    ['Conservation','Données supprimées sur demande. Historiques conservés anonymement.'],
                    ['Vos droits','Accès, rectification, effacement, portabilité depuis votre profil.'],
                    ['Sécurité','Mots de passe chiffrés (bcrypt). Communications SSL/TLS.'],
                  ].map(([t,d])=>(
                    <div key={t} style={{ marginBottom:10 }}>
                      <p style={{ margin:'0 0 2px', fontWeight:700, fontSize:12, color:'#374151' }}>{t}</p>
                      <p style={{ margin:0, fontSize:11, color:'#6b7280', lineHeight:1.5 }}>{d}</p>
                    </div>
                  ))}
                  <button onClick={()=>setShowRgpdModal(false)}
                    style={{ width:'100%', padding:'11px', borderRadius:10, marginTop:8,
                      background:'#6366f1', color:'white', border:'none', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                    Fermer
                  </button>
                </div>
              </div>
            )}

            {/* Continuer sans compte */}
            {!requireAccount && onClose && (
              <button onClick={onClose}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:12,
                  color:th.dim, textAlign:'center', padding:'2px 0' }}>
                Continuer sans compte →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ── Popup post-inscription : mois/année de naissance + téléphone ──────────────
// Affiché une seule fois après la 1re inscription. Permet au client de compléter
// son profil (birth_date pour le programme anniversaire + phone). Tout est
// optionnel : le client peut fermer pour ignorer. S'il ne saisit pas de date
// de naissance, il sera automatiquement exclu du programme anniversaire
// (cron filtre birth_date IS NOT NULL).
export function PostRegisterPopup({ slug, th, client, onClose, onSaved }) {
  const thisYear = new Date().getFullYear();
  const [month, setMonth] = useState('');      // '01' → '12'
  const [year,  setYear]  = useState('');      // ex '1990'
  const [phone, setPhone] = useState(client?.phone || '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const MONTHS = [
    ['01','Janvier'],['02','Février'],['03','Mars'],['04','Avril'],
    ['05','Mai'],['06','Juin'],['07','Juillet'],['08','Août'],
    ['09','Septembre'],['10','Octobre'],['11','Novembre'],['12','Décembre'],
  ];

  const save = async () => {
    // Validation : si l'un des 2 champs anniversaire est rempli, l'autre est requis
    if ((month && !year) || (!month && year)) {
      setErr('Merci de saisir le mois ET l\'année.');
      return;
    }
    if (year) {
      const y = parseInt(year, 10);
      if (!/^\d{4}$/.test(year) || y < 1900 || y > thisYear) {
        setErr('Année invalide.');
        return;
      }
    }
    setLoading(true); setErr('');
    try {
      const body = {
        first_name: client.first_name,
        last_name:  client.last_name || '',
        email:      client.email,
        phone:      phone.trim() || undefined,
      };
      if (month && year) body.birth_date = `${year}-${month}`; // backend convertit en YYYY-MM-01
      await pubApi.updateClientProfile(slug, body);
      onSaved && onSaved({ ...client, phone: phone.trim() || client.phone });
      onClose();
    } catch (e) {
      setErr(e.message || 'Erreur lors de la sauvegarde.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: th.card, borderRadius: 16, padding: 24,
        maxWidth: 420, width: '100%', border: `1px solid ${th.border}`,
      }}>
        <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>🎂</div>
        <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: 17, color: th.text, textAlign: 'center' }}>
          Un cadeau pour votre anniversaire ?
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: th.muted, lineHeight: 1.5, textAlign: 'center' }}>
          Indiquez votre mois et année de naissance pour recevoir une offre
          spéciale chaque année. Ces champs sont <b>facultatifs</b>.
        </p>

        {/* Mois + année */}
        <div className="bk-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: th.muted,
              marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Mois
            </label>
            <select value={month} onChange={e => { setMonth(e.target.value); setErr(''); }}
              style={{ width: '100%', padding: '11px 12px', borderRadius: 10,
                background: th.inputBg, border: `1px solid ${th.inputBorder}`,
                color: th.text, fontSize: 13, outline: 'none' }}>
              <option value="">—</option>
              {MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: th.muted,
              marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Année
            </label>
            <input type="text" inputMode="numeric" placeholder="1990"
              value={year} maxLength={4}
              onChange={e => { setYear(e.target.value.replace(/\D/g, '').slice(0, 4)); setErr(''); }}
              style={{ width: '100%', padding: '11px 12px', borderRadius: 10,
                background: th.inputBg, border: `1px solid ${th.inputBorder}`,
                color: th.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}/>
          </div>
        </div>

        {/* Téléphone */}
        {!client?.phone && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: th.muted,
              marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Téléphone (optionnel)
            </label>
            <input type="tel" placeholder="06 00 00 00 00" value={phone}
              onChange={e => setPhone(e.target.value)}
              style={{ width: '100%', padding: '11px 12px', borderRadius: 10,
                background: th.inputBg, border: `1px solid ${th.inputBorder}`,
                color: th.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}/>
          </div>
        )}

        {err && <p style={{ margin: '6px 0 10px', fontSize: 12, color: '#ef4444', fontWeight: 600 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: 12, borderRadius: 10, background: 'transparent',
              border: `1px solid ${th.border}`, color: th.text,
              fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Plus tard
          </button>
          <button onClick={save} disabled={loading}
            style={{ flex: 1, padding: 12, borderRadius: 10, background: th.accent,
              border: 'none', color: th.accentText,
              fontWeight: 700, fontSize: 13, cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.6 : 1 }}>
            {loading ? '…' : 'Enregistrer'}
          </button>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 11, color: th.dim, textAlign: 'center', lineHeight: 1.4 }}>
          Sans date de naissance, vous ne participerez pas au programme anniversaire.
        </p>
      </div>
    </div>
  );
}


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

  const deleteAccount = async () => {
    if (delConfirm !== 'SUPPRIMER') { setDelErr('Saisissez SUPPRIMER pour confirmer.'); return; }
    setDelLoad(true); setDelErr('');
    try {
      await globalClientApi.deleteAccount(gcToken);
      onLogout();
    } catch(e) { setDelErr(e.message || 'Erreur lors de la suppression'); setDelLoad(false); }
  }

  // Export RGPD — télécharge les données personnelles en JSON
  const exportMyData = async () => {
    setExportLoad(true);
    try {
      const token = gcToken || localStorage.getItem('ff_gc_token');
      const BASE = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${BASE}/global-clients/me/export`, {
        headers: { Authorization: `Bearer ${token}` },
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
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    setLoading(true); setErr('');
    try {
      const r = await globalClientApi.register({ email, password: pwd, first_name: first, last_name: last, phone, birth_date: birthDate || null });
      onLogin(r.token, r.client);
      setMode('dashboard');
      setTimeout(loadData, 100);
    } catch(e) { setErr(e.message); }
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

  const inp = { width:'100%', padding:'12px 16px', borderRadius:14, border:`1px solid ${th.inputBorder}`, background:th.inputBg, color:th.text, fontSize:14, outline:'none', boxSizing:'border-box' };
  const fmtD = s => { if (!s) return '-'; const str = String(s).substring(0,10); return new Date(str + 'T12:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }); };
  const statusC = { pending:'#f59e0b', confirmed:'#10b981', cancelled:'#ef4444', completed:'#6366f1', no_show:'#94a3b8' };
  const statusL = { pending:'En attente', confirmed:'Confirme', cancelled:'Annule', completed:'Termine', no_show:'Absent' };

  return (
    <div className="min-h-screen" style={{ background:th.bg }}>
      <div className="max-w-sm sm:max-w-md md:max-w-lg mx-auto px-4 pt-6 sm:pt-10 pb-12">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm mb-6" style={{ color:th.muted, background:'none', border:'none', cursor:'pointer' }}>
          ← Retour
        </button>

        {/* Header */}
        <div style={{ marginBottom:24 }}>
          <h1 style={{ fontSize:22, fontWeight:900, color:th.text, margin:'0 0 4px' }}>Mon espace client</h1>
          <p style={{ fontSize:13, color:th.muted, margin:0 }}>Gérez vos rendez-vous et fidélité chez tous vos commerçants</p>
        </div>

        {/* MOT DE PASSE OUBLIÉ — saisie email */}
        {mode === 'forgot_gc' && (
          <div style={{ background:th.card, borderRadius:24, padding:24, border:`1px solid ${th.border}` }}>
            <button onClick={()=>{ setMode('login'); setGcForgotErr(''); setGcForgotOk(''); }}
              style={{ background:'none', border:'none', color:th.muted, fontSize:13, cursor:'pointer', marginBottom:16 }}>← Retour</button>
            <p style={{ margin:'0 0 6px', fontWeight:800, fontSize:16, color:th.text }}>Mot de passe oublié</p>
            <p style={{ margin:'0 0 16px', fontSize:13, color:th.muted }}>Entrez votre email pour recevoir un code de réinitialisation.</p>
            <div style={{ marginBottom:12 }}>
              <input type="email" placeholder="Votre email" value={gcForgotEmail} onChange={e=>setGcForgotEmail(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&sendGcResetCode()} style={inp} />
            </div>
            {gcForgotErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 12px', fontWeight:600 }}>{gcForgotErr}</p>}
            {gcForgotOk  && <p style={{ color:'#10b981', fontSize:13, margin:'0 0 12px', fontWeight:600 }}>{gcForgotOk}</p>}
            <button onClick={sendGcResetCode} disabled={gcForgotLoad || !gcForgotEmail.trim()}
              style={{ width:'100%', padding:'15px', borderRadius:16, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white', border:'none', fontWeight:800, fontSize:15, cursor:'pointer', opacity:(gcForgotLoad||!gcForgotEmail.trim())?0.6:1 }}>
              {gcForgotLoad ? '...' : 'Envoyer le code'}
            </button>
          </div>
        )}

        {/* MOT DE PASSE OUBLIÉ — saisie code + nouveau mdp */}
        {mode === 'forgot_gc_code' && (
          <div style={{ background:th.card, borderRadius:24, padding:24, border:`1px solid ${th.border}` }}>
            <button onClick={()=>{ setMode('forgot_gc'); setGcForgotErr(''); }}
              style={{ background:'none', border:'none', color:th.muted, fontSize:13, cursor:'pointer', marginBottom:16 }}>← Retour</button>
            <p style={{ margin:'0 0 6px', fontWeight:800, fontSize:16, color:th.text }}>Code de réinitialisation</p>
            <p style={{ margin:'0 0 16px', fontSize:13, color:th.muted }}>Vérifiez votre boîte mail et entrez le code à 6 chiffres.</p>
            {gcForgotOk && <p style={{ color:'#10b981', fontSize:13, margin:'0 0 12px', fontWeight:600 }}>{gcForgotOk}</p>}
            <div style={{ marginBottom:10 }}>
              <input placeholder="Code à 6 chiffres" value={gcResetCode} onChange={e=>setGcResetCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                maxLength={6} style={{ ...inp, textAlign:'center', fontSize:22, fontWeight:900, letterSpacing:'0.3em', fontFamily:'monospace' }} />
            </div>
            <div style={{ marginBottom:16 }}>
              <input type="password" placeholder="Nouveau mot de passe (min. 6 car.)" value={gcNewPwd} onChange={e=>setGcNewPwd(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&confirmGcReset()} style={inp} />
            </div>
            {gcForgotErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 12px', fontWeight:600 }}>{gcForgotErr}</p>}
            <button onClick={confirmGcReset} disabled={gcForgotLoad || gcResetCode.length < 6 || gcNewPwd.length < 6}
              style={{ width:'100%', padding:'15px', borderRadius:16, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white', border:'none', fontWeight:800, fontSize:15, cursor:'pointer', opacity:(gcForgotLoad||gcResetCode.length<6||gcNewPwd.length<6)?0.6:1 }}>
              {gcForgotLoad ? '...' : 'Changer le mot de passe'}
            </button>
          </div>
        )}

        {/* LOGIN / REGISTER */}
        {!gcUser && mode !== 'forgot_gc' && mode !== 'forgot_gc_code' && (
          <div style={{ background:th.card, borderRadius:24, padding:24, border:`1px solid ${th.border}` }}>
            <div style={{ display:'flex', gap:0, marginBottom:20, background:th.inputBg, borderRadius:12, padding:4 }}>
              {['login','register'].map(m => (
                <button key={m} onClick={()=>setMode(m)} style={{ flex:1, padding:'9px', borderRadius:10, border:'none', fontWeight:700, fontSize:13, cursor:'pointer', background:mode===m?'#6366f1':'transparent', color:mode===m?'white':th.muted }}>
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
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:th.muted,
                  marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>
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
            {err && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 12px', fontWeight:600 }}>{err}</p>}
            <button onClick={mode==='login'?handleLogin:handleRegister} disabled={loading}
              style={{ width:'100%', padding:'15px', borderRadius:16, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white', border:'none', fontWeight:800, fontSize:15, cursor:'pointer', opacity:loading?0.7:1 }}>
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
          <div style={{ background:th.card, borderRadius:20, padding:20, border:`1px solid ${th.border}`, marginBottom:16, display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:52, height:52, borderRadius:16, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:900, fontSize:20 }}>
              {(gcUser.first_name||'?').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ margin:'0 0 2px', fontWeight:800, fontSize:16, color:th.text }}>{gcUser.first_name} {gcUser.last_name}</p>
              <p style={{ margin:0, fontSize:12, color:th.muted }}>{gcUser.email}</p>
            </div>
            <button onClick={onLogout} style={{ padding:'6px 12px', borderRadius:10, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', color:'#ef4444', fontWeight:700, fontSize:12, cursor:'pointer' }}>
              Déco.
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:6, marginBottom:16, overflowX:'auto' }}>
            {[['appts','📅 RDV'],['loyalty','🎫 Fidélite'],['profile','👤 Profil']].map(([t,lbl]) => (
              <button key={t} onClick={()=>setTab(t)} style={{ flexShrink:0, padding:'9px 14px', borderRadius:14, border:'none', fontWeight:700, fontSize:12, cursor:'pointer', background:tab===t?'#6366f1':'rgba(99,102,241,0.08)', color:tab===t?'white':'#6366f1' }}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Rendez-vous */}
          {tab==='appts' && (<>
            {apts.length===0 && <p style={{ textAlign:'center', color:th.muted, padding:32 }}>Aucun rendez-vous enregistré.</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {apts.map((a,i) => (
                <div key={i} style={{ background:th.card, borderRadius:16, padding:16, border:`1px solid ${th.border}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div>
                      <p style={{ margin:'0 0 2px', fontWeight:800, fontSize:14, color:th.text }}>{a.service_name||'Rendez-vous'}</p>
                      <p style={{ margin:0, fontSize:12, color:th.muted }}>{a.business_name}</p>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:statusC[a.status]||'#94a3b8', background:`${statusC[a.status]||'#94a3b8'}18`, padding:'3px 10px', borderRadius:99 }}>
                      {statusL[a.status]||a.status}
                    </span>
                  </div>
                  <p style={{ margin:0, fontSize:12, color:th.muted }}>
                    {fmtD(a.date)} · {(a.start_time||'').slice(0,5)}
                    {a.employee_name ? ` · ${a.employee_name}` : ''}
                  </p>
                  {a.total_amount && <p style={{ margin:'4px 0 0', fontSize:13, fontWeight:700, color:'#10b981' }}>{Number(a.total_amount).toFixed(2)} €</p>}
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
                  <div key={i} style={{ background:th.card, borderRadius:16, padding:16, border:`1px solid ${th.border}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <div>
                        <p style={{ margin:'0 0 2px', fontWeight:800, fontSize:14, color:th.text }}>{l.business_name}</p>
                        <p style={{ margin:0, fontSize:11, color:th.muted }}>{l.reward_label}</p>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <span style={{ fontSize:20, fontWeight:900, color:'#f59e0b', fontFamily:'monospace' }}>{current}</span>
                        <span style={{ fontSize:12, color:th.muted }}>/{required} {mode==='points'?'pts':'🎫'}</span>
                      </div>
                    </div>
                    <div style={{ height:6, background:'rgba(245,158,11,0.15)', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#f59e0b,#f97316)', borderRadius:99, transition:'width 0.5s' }} />
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
                  borderRadius:16, border:`1px solid ${th.border}` }}>
                  <img src={gcUser.avatar_url} alt="avatar"
                    style={{ width:48, height:48, borderRadius:99, objectFit:'cover',
                      border:`2px solid ${th.border}` }} />
                  <div>
                    <p style={{ margin:'0 0 2px', fontWeight:700, fontSize:14, color:th.text }}>
                      {gcUser.first_name} {gcUser.last_name}
                    </p>
                    <p style={{ margin:0, fontSize:11, color:th.muted }}>
                      🔗 Connecté via Google
                    </p>
                  </div>
                </div>
              )}

              {/* Édition du profil */}
              <div style={{ background:th.card, borderRadius:20, padding:20, border:`1px solid ${th.border}` }}>
                <p style={{ margin:'0 0 14px', fontWeight:800, fontSize:15, color:th.text }}>Mes informations</p>
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
                {profErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 10px', fontWeight:600 }}>{profErr}</p>}
                {profOk  && <p style={{ color:'#10b981', fontSize:13, margin:'0 0 10px', fontWeight:600 }}>{profOk}</p>}
                <button onClick={saveProfile} disabled={profLoad}
                  style={{ width:'100%', padding:'13px', borderRadius:14, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white', border:'none', fontWeight:800, fontSize:14, cursor:'pointer', opacity:profLoad?0.7:1 }}>
                  {profLoad ? '...' : 'Enregistrer les modifications'}
                </button>
              </div>

              {/* Changer le mot de passe */}
              <div style={{ background:th.card, borderRadius:20, padding:20, border:`1px solid ${th.border}` }}>
                <p style={{ margin:'0 0 14px', fontWeight:800, fontSize:15, color:th.text }}>Changer le mot de passe</p>
                <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
                  <input type="password" placeholder="Mot de passe actuel" value={curPwd} onChange={e=>setCurPwd(e.target.value)} style={inp} />
                  <input type="password" placeholder="Nouveau mot de passe (min. 6 car.)" value={newPwd2} onChange={e=>setNewPwd2(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&savePassword()} style={inp} />
                </div>
                {pwdErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 10px', fontWeight:600 }}>{pwdErr}</p>}
                {pwdOk  && <p style={{ color:'#10b981', fontSize:13, margin:'0 0 10px', fontWeight:600 }}>{pwdOk}</p>}
                <button onClick={savePassword} disabled={pwdLoad || !curPwd || !newPwd2}
                  style={{ width:'100%', padding:'13px', borderRadius:14, background:'rgba(99,102,241,0.1)', color:'#6366f1', border:'1px solid rgba(99,102,241,0.25)', fontWeight:800, fontSize:14, cursor:'pointer', opacity:(pwdLoad||!curPwd||!newPwd2)?0.5:1 }}>
                  {pwdLoad ? '...' : 'Modifier le mot de passe'}
                </button>
              </div>

              {/* Export données RGPD */}
              <div style={{ background:th.card, borderRadius:20, padding:20, border:`1px solid ${th.border}` }}>
                <p style={{ margin:'0 0 4px', fontWeight:800, fontSize:15, color:th.text }}>📦 Mes données personnelles</p>
                <p style={{ margin:'0 0 14px', fontSize:12, color:th.muted, lineHeight:1.5 }}>
                  Conformément au RGPD (Art. 20), vous pouvez télécharger l'ensemble de vos données personnelles
                  stockées sur FlowIA : compte, rendez-vous, fidélité.
                </p>
                <button onClick={exportMyData} disabled={exportLoad}
                  style={{ width:'100%', padding:'12px', borderRadius:12,
                    background:'rgba(99,102,241,0.08)', color:'#6366f1',
                    border:'1px solid rgba(99,102,241,0.2)',
                    fontWeight:700, fontSize:13, cursor:'pointer',
                    opacity:exportLoad?0.6:1, marginBottom:10 }}>
                  {exportLoad ? '⏳ Préparation...' : '⬇️ Télécharger mes données (JSON)'}
                </button>
                <button onClick={()=>setShowRgpd(true)}
                  style={{ width:'100%', padding:'10px', borderRadius:12,
                    background:'transparent', color:th.muted,
                    border:`1px solid ${th.border}`,
                    fontWeight:600, fontSize:12, cursor:'pointer' }}>
                  📋 Politique de confidentialité
                </button>
              </div>

              {/* Suppression de compte */}
              <div style={{ background:'rgba(239,68,68,0.04)', borderRadius:20, padding:20, border:'1px solid rgba(239,68,68,0.15)' }}>
                <p style={{ margin:'0 0 6px', fontWeight:800, fontSize:15, color:'#ef4444' }}>🗑 Supprimer mon compte</p>
                <p style={{ margin:'0 0 14px', fontSize:12, color:th.muted, lineHeight:1.5 }}>
                  Vos données personnelles (nom, email, téléphone) seront <strong>définitivement effacées</strong>.
                  Les historiques de transactions sont conservés de façon anonyme pour la comptabilité des commerçants.
                </p>
                <input placeholder="Tapez SUPPRIMER pour confirmer" value={delConfirm}
                  onChange={e=>{ setDelConfirm(e.target.value.toUpperCase()); setDelErr(''); }}
                  style={{ width:'100%', padding:'12px 14px', borderRadius:10, outline:'none',
                    background:th.inputBg, border:'1px solid rgba(239,68,68,0.3)',
                    color:th.text, fontSize:13, marginBottom:10, boxSizing:'border-box' }} />
                {delErr && <p style={{ color:'#ef4444', fontSize:13, margin:'0 0 10px', fontWeight:600 }}>{delErr}</p>}
                <button onClick={deleteAccount} disabled={delLoad || delConfirm !== 'SUPPRIMER'}
                  style={{ width:'100%', padding:'13px', borderRadius:14,
                    background:'rgba(239,68,68,0.12)', color:'#ef4444',
                    border:'1px solid rgba(239,68,68,0.25)',
                    fontWeight:800, fontSize:14, cursor:'pointer',
                    opacity:(delLoad||delConfirm!=='SUPPRIMER')?0.5:1 }}>
                  {delLoad ? '...' : '🗑 Supprimer définitivement mon compte'}
                </button>
              </div>

              {/* Modal Politique de confidentialité RGPD */}
              {showRgpd && (
                <div style={{ position:'fixed', inset:0, zIndex:1000,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  padding:16, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
                  onClick={()=>setShowRgpd(false)}>
                  <div style={{ background:th.card, borderRadius:24, padding:28,
                    maxWidth:480, width:'100%', maxHeight:'80vh', overflowY:'auto',
                    border:`1px solid ${th.border}` }}
                    onClick={e=>e.stopPropagation()}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                      <p style={{ margin:0, fontWeight:800, fontSize:16, color:th.text }}>🔒 Politique de confidentialité</p>
                      <button onClick={()=>setShowRgpd(false)}
                        style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:th.muted }}>×</button>
                    </div>
                    {[
                      ['📋 Données collectées', 'Lors de votre inscription et de vos réservations, nous collectons : prénom, nom, email, téléphone. Ces données sont nécessaires pour gérer vos rendez-vous.'],
                      ['🎯 Finalité', "Vos données sont utilisées exclusivement pour : la gestion de vos réservations, l'envoi de confirmations et rappels, le programme de fidélité."],
                      ['⏱ Durée de conservation', 'Vos données personnelles sont conservées le temps de votre inscription. Les historiques de transactions sont conservés de façon anonyme à des fins comptables.'],
                      ['✅ Vos droits (Art. 15-22 RGPD)', "Vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition. Exercez-les depuis votre profil ou en contactant le commerçant."],
                      ['🔐 Sécurité', "Vos mots de passe sont chiffrés (bcrypt). Les communications sont sécurisées par SSL/TLS. Aucune donnée n'est vendue à des tiers."],
                      ['📧 Contact', "Pour toute question relative à vos données personnelles, contactez directement le commerçant ou écrivez à l'adresse indiquée sur le site de réservation."],
                    ].map(([title, text]) => (
                      <div key={title} style={{ marginBottom:14 }}>
                        <p style={{ margin:'0 0 4px', fontWeight:700, fontSize:13, color:th.text }}>{title}</p>
                        <p style={{ margin:0, fontSize:12, color:th.muted, lineHeight:1.6 }}>{text}</p>
                      </div>
                    ))}
                    <button onClick={()=>setShowRgpd(false)}
                      style={{ width:'100%', padding:'12px', borderRadius:12, marginTop:8,
                        background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white',
                        border:'none', fontWeight:700, fontSize:13, cursor:'pointer' }}>
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
