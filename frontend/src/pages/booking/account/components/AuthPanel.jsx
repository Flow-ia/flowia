// src/pages/booking/account/components/AuthPanel.jsx
// Panneau Auth client (login / register / quick register / forgot / reset).
// Extrait inchangé depuis booking/Account.jsx.
import { useState, useEffect, useRef, useCallback } from 'react';
import { pubApi, globalClientApi } from '../../../../utils/api';
import { GoogleOAuthOverlay } from '../../../../components/AuthFlow';
import { ConsentCheckboxes } from '../../../../components/ConsentCheckboxes';
import { PhoneInput, isValidPhoneNumber } from '../../../../components/PhoneInput';

// ── Panneau Auth client ───────────────────────────────────────────────────────
export function AuthPanel({ slug, th, onAuth, onClose, requireAccount, initialEmail = '', initialMode = 'login', referralCode = '', quickMode = false, onModeChange }) {
  // setMode wrappé pour notifier le parent des transitions login<->register
  // (permet à BookingPage de mettre l'URL à jour : /login <-> /register).
  const [modeState, setModeState] = useState(quickMode ? 'quick' : initialMode);
  const mode = modeState;
  const setMode = (m) => {
    setModeState(m);
    if (onModeChange) onModeChange(m);
  };
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
  // RGPD commit 17 : Case 1 (consent CGU+confidentialité+fidélité) cochée
  // par défaut, Case 2 (marketing opt-in) jamais cochée par défaut (CNIL).
  // Tous deux pilotés par le composant ConsentCheckboxes mounted plus bas.
  const [consent, setConsent]   = useState(true);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const handleConsents = useCallback((c) => {
    setConsent(!!c.contractAccepted);
    setMarketingOptIn(!!c.marketingAccepted);
  }, []);

  // Détection intelligente du type de compte à la saisie email
  const [emailType, setEmailType]   = useState(null);   // null | 'free' | 'local' | 'global' | 'both'
  const [emailChecking, setEmailChecking] = useState(false);
  const emailTimer = useRef(null);

  const inp  = "w-full px-4 py-3.5 rounded-2xl text-sm focus:outline-none";
  const inpSt = { background:th.inputBg, border: `0.5px solid ${th.inputBorder}`, color:th.text };

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

  // États OAuth Google : idle/loading/success/error/cancelled/timeout.
  // Affichés via GoogleOAuthOverlay pour guider l'utilisateur sans
  // qu'il se retrouve bloqué sans feedback quand la popup se ferme.
  const [gStatus, setGStatus] = useState('idle');
  const [gError, setGError] = useState('');
  const gPopupRef = useRef(null);
  const gTimerRef = useRef(null);
  const gPollRef  = useRef(null);

  const cleanupGoogle = () => {
    if (gTimerRef.current) { clearTimeout(gTimerRef.current); gTimerRef.current = null; }
    if (gPollRef.current)  { clearInterval(gPollRef.current);  gPollRef.current = null; }
  };

  const loginWithGoogle = () => {
    // RGPD commit 19 : pour le flow Google, le consentement CGU + marketing
    // est demandé sur la page de confirmation /google-confirm APRÈS retour
    // OAuth (uniquement si nouveau client). Le bouton est donc actif quel que
    // soit l'état des cases. marketingOptIn (state) est ignoré côté back pour
    // la création (commit 19) ; on le passe par compat tokens en cache.
    cleanupGoogle();
    setGError(''); setGStatus('loading');
    const url = pubApi.googleAuthUrl(slug, referralCode || undefined, marketingOptIn);
    gPopupRef.current = window.open(url, 'google_auth',
      'width=500,height=600,scrollbars=yes,resizable=yes,top=100,left=' +
      Math.round((window.screen.width - 500) / 2)
    );
    if (!gPopupRef.current) {
      setGError('Popup bloquée. Autorisez les popups pour ce site.');
      setGStatus('error');
      return;
    }
    // Pas de polling popup.closed (COOP Google spam la console).
    gTimerRef.current = setTimeout(() => {
      setGStatus(s => s === 'loading' ? 'timeout' : s);
      cleanupGoogle();
      try { gPopupRef.current && gPopupRef.current.close(); } catch {}
    }, 2 * 60 * 1000);
  };

  // Écoute BroadcastChannel + storage event pour capter le retour OAuth
  // de la popup. Persiste le token + infos côté opener au cas où la popup
  // aurait atterri sur une origine différente (localStorage isolé).
  useEffect(() => {
    const applyClientLogin = (token, client) => {
      if (!client) return;
      if (token) localStorage.setItem('ff_client_token', token);
      localStorage.setItem('ff_client_info', JSON.stringify(client));
      cleanupGoogle();
      setGStatus('success');
      onAuth(client);
    };

    // RGPD commit 19 : si la popup OAuth signale un nouveau client (pas encore
    // en BDD), on navigue vers la page de confirmation où l'utilisateur cochera
    // explicitement CGU + marketing avant la création du compte.
    const handlePreRegister = (preToken, slugFromOauth) => {
      cleanupGoogle();
      setGStatus('idle'); setGError('');
      const targetSlug = slugFromOauth || slug;
      window.location.assign(`/book/${targetSlug}/auth/google-confirm?pre_token=${encodeURIComponent(preToken || '')}`);
    };

    let bc = null;
    try {
      bc = new BroadcastChannel('flowia-oauth');
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'client_login') applyClientLogin(ev.data.token, ev.data.client);
        else if (ev.data?.type === 'oauth_pre_register') handlePreRegister(ev.data.pre_token, ev.data.slug);
        else if (ev.data?.type === 'oauth_error') {
          cleanupGoogle();
          setGError(ev.data.error || 'Erreur Google');
          setGStatus('error');
        }
      };
    } catch { /* non supporté */ }

    const onStorage = (e) => {
      if (e.key === 'ff_oauth_client' && e.newValue) {
        let payload = null;
        try { payload = JSON.parse(e.newValue); } catch {}
        if (payload) applyClientLogin(payload.token, payload.client);
        try { localStorage.removeItem('ff_oauth_client'); } catch {}
      }
      if (e.key === 'ff_oauth_pre_register' && e.newValue) {
        let payload = null;
        try { payload = JSON.parse(e.newValue); } catch {}
        if (payload) handlePreRegister(payload.pre_token, payload.slug);
        try { localStorage.removeItem('ff_oauth_pre_register'); } catch {}
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      try { bc && bc.close(); } catch {}
      window.removeEventListener('storage', onStorage);
      cleanupGoogle();
    };
  }, [onAuth]);

  const submit = async () => {
    setLoading(true); setErr(''); setOk('');
    try {
      let r;
      if (mode === 'login') {
        r = await pubApi.login(slug, { email: email.trim(), password: pwd });
      } else {
        if (!first.trim() || !last.trim()) { setErr('Prenom et nom requis.'); setLoading(false); return; }
        if (pwd.length < 6) { setErr('Mot de passe minimum 6 caracteres.'); setLoading(false); return; }
        r = await pubApi.register(slug, { email: email.trim(), password: pwd, first_name: first.trim(), last_name: last.trim(), phone: phone.trim(), referral_code: referralCode || undefined, marketing_opt_in: marketingOptIn });
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
        setErr(e.message || 'Échec de la connexion. Réessayez.');
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

  // Quick register : prénom + téléphone → fiche créée instantanément.
  // Backend idempotent sur (user_id, phone normalisé) : re-scan = même compte.
  const quickSubmit = async () => {
    if (!first.trim())           { setErr('Prénom requis.'); return; }
    if (!isValidPhoneNumber(phone||'')) { setErr('Numéro invalide pour le pays sélectionné.'); return; }
    setLoading(true); setErr(''); setOk('');
    try {
      const r = await pubApi.quickRegister(slug, {
        first_name: first.trim(),
        last_name:  last.trim(),
        phone:      phone.trim(),
        marketing_opt_in: marketingOptIn,
      });
      localStorage.setItem('ff_client_token', r.token);
      localStorage.setItem('ff_client_info', JSON.stringify(r.client));
      onAuth(r.client, { justRegistered: true, quick: true });
    } catch(e) {
      // Message générique : backend audit K→Q renvoie du texte propre,
      // mais on se prémunit contre toute fuite (stack/SQL inattendu).
      setErr('Impossible de créer votre fiche. Réessayez.');
      if (e?.message) console.warn('[quick-register]', e.message);
    }
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
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:10, background:'rgba(99,102,241,0.06)', border: `0.5px solid rgba(99,102,241,0.15)`, marginTop:4 }}>
        <div style={{ width:12, height:12, borderRadius:'50%', border:'2px solid rgba(99,102,241,0.2)', borderTopColor:'#6366f1', animation:'spin .7s linear infinite', flexShrink:0 }} />
        <span style={{ fontSize:12, color:'#6366f1' }}>Vérification…</span>
      </div>
    );
    if (!emailType || emailType === 'free') return null;
    if (emailType === 'global' || emailType === 'both') return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, background:'rgba(16,185,129,0.07)', border: '0.5px solid rgba(16,185,129,0.2)', marginTop:4 }}>
        <span style={{ width:6, height:6, borderRadius:99, background:'#10b981', flexShrink:0 }}/>
        <div>
          <p style={{ margin:0, fontSize:12, fontWeight: 500, color:'#10b981' }}>Compte plateforme reconnu</p>
          <p style={{ margin:0, fontSize:11, color:'rgba(16,185,129,0.8)' }}>Connectez-vous avec votre mot de passe habituel</p>
        </div>
      </div>
    );
    if (emailType === 'local') return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, background:'rgba(245,158,11,0.07)', border: '0.5px solid rgba(245,158,11,0.2)', marginTop:4 }}>
        <span style={{ fontSize:14 }}>💡</span>
        <div>
          <p style={{ margin:0, fontSize:12, fontWeight: 500, color:'#d97706' }}>Compte existant</p>
          <p style={{ margin:0, fontSize:11, color:'rgba(217,119,6,0.8)' }}>Connectez-vous avec votre mot de passe</p>
        </div>
      </div>
    );
    return null;
  };

  // Styles inline cohérents avec le design noir/blanc
  const S = {
    card:   { background:th.card, border: `0.5px solid ${th.border}`, borderRadius:16, overflow:'hidden' },
    inp:    { width:'100%', padding:'11px 14px', borderRadius:10, outline:'none',
              background:th.inputBg, border: `0.5px solid ${th.inputBorder}`,
              color:th.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box' },
    btnPrimary: { width:'100%', padding:'13px', borderRadius:11, border:'none',
                  background:th.accent, color:th.accentText, fontWeight: 500,
                  fontSize:14, cursor:'pointer', letterSpacing:'-0.01em' },
    btnSecondary: { width:'100%', padding:'13px', borderRadius:11,
                    background:'transparent', border: `0.5px solid ${th.border}`,
                    color:th.text, fontWeight: 500, fontSize:14, cursor:'pointer' },
    label:  { display:'block', fontSize:11, fontWeight: 500, color:th.muted,
              marginBottom:5 },
  };

  return (
    <div style={S.card}>
      <GoogleOAuthOverlay
        status={gStatus}
        errorMsg={gError}
        onRetry={() => { setGStatus('idle'); setGError(''); loginWithGoogle(); }}
        onClose={() => { setGStatus('idle'); setGError(''); }}
      />
      <div style={{ padding:20 }}>

        {/* Badge compte requis */}
        {requireAccount && mode !== 'forgot' && mode !== 'forgot_code' && mode !== 'quick' && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
            borderRadius:10, background:'rgba(245,158,11,0.08)',
            border: '0.5px solid rgba(245,158,11,0.2)', marginBottom:16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"
              style={{width:15,height:15,flexShrink:0}}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <p style={{ margin:0, fontSize:12, fontWeight: 500, color:'#d97706' }}>
              Un compte est requis pour réserver
            </p>
          </div>
        )}

        {/* ── QUICK REGISTER (QR) ── */}
        {mode === 'quick' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <p style={{ margin:'0 0 4px', fontSize:17, fontWeight: 500, color:th.text, letterSpacing:'-0.01em' }}>
                Bienvenue 👋
              </p>
              <p style={{ margin:0, fontSize:13, color:th.muted, lineHeight:1.5 }}>
                Votre fiche est créée en 10 secondes. Pas d'email ni de mot de passe à retenir.
              </p>
            </div>
            <div className="bk-grid2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={S.label}>Prénom *</label>
                <input placeholder="Prénom" value={first} maxLength={60}
                  onChange={e=>setFirst(e.target.value)} style={S.inp} autoFocus />
              </div>
              <div>
                <label style={S.label}>Nom</label>
                <input placeholder="(optionnel)" value={last} maxLength={60}
                  onChange={e=>setLast(e.target.value)} style={S.inp}/>
              </div>
            </div>
            <PhoneInput value={phone} onChange={setPhone}
              label="Téléphone *" required
              theme={{ text: th.text, muted: th.muted, dim: th.dim,
                border: th.border, inputBg: th.inputBg, inputBorder: th.inputBorder }}/>
            {/* RGPD commit 17 : 2 cases (CGU obligatoire + marketing optionnel),
                version compacte adaptée au flow rapide QR. */}
            <ConsentCheckboxes slug={slug} th={th} onChange={handleConsents} compact/>
            {err && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px',
                borderRadius:9, background:'rgba(239,68,68,0.06)',
                border: '0.5px solid rgba(239,68,68,0.2)' }}>
                <span style={{fontSize:13,flexShrink:0}}>⚠️</span>
                <p style={{margin:0,fontSize:12,color:'#dc2626',fontWeight: 500}}>{err}</p>
              </div>
            )}
            <button onClick={quickSubmit}
              disabled={loading||!first.trim()||!isValidPhoneNumber(phone||'')||!consent}
              style={{...S.btnPrimary,
                opacity:loading||!first.trim()||!isValidPhoneNumber(phone||'')||!consent?0.5:1}}>
              {loading ? '...' : '→ Créer ma fiche'}
            </button>
            <button onClick={()=>{ setMode('login'); setErr(''); }}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:12,
                color:th.muted, textAlign:'center', padding:'2px 0' }}>
              Déjà un compte ? Se connecter
            </button>
          </div>
        )}

        {/* ── TABS LOGIN / REGISTER ── */}
        {mode !== 'quick' && mode !== 'forgot' && mode !== 'forgot_code' && (
          <div style={{ display:'flex', gap:4, padding:4, background:th.inputBg,
            borderRadius:12, marginBottom:18 }}>
            {[['login','Se connecter'],['register','Creer un compte']].map(([m,l]) => (
              <button key={m} onClick={()=>{setMode(m);setErr('');setOk('');}}
                style={{ flex:1, padding:'9px 0', borderRadius:9, fontSize:13, fontWeight: 500,
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
              style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight: 500,
                color:th.muted, background:'none', border:'none', cursor:'pointer', marginBottom:16 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{width:14,height:14}}><polyline points="15 18 9 12 15 6"/></svg>
              Retour
            </button>
            <p style={{ fontSize:15, fontWeight: 500, color:th.text, margin:'0 0 6px' }}>
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
            {err && <p style={{fontSize:12,color:'#ef4444',margin:'0 0 10px',fontWeight: 500}}>{err}</p>}
            {ok  && <p style={{fontSize:12,color:'#16a34a',margin:'0 0 10px',fontWeight: 500}}>{ok}</p>}
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
              style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight: 500,
                color:th.muted, background:'none', border:'none', cursor:'pointer', marginBottom:16 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{width:14,height:14}}><polyline points="15 18 9 12 15 6"/></svg>
              Retour
            </button>
            <p style={{ fontSize:15, fontWeight: 500, color:th.text, margin:'0 0 4px' }}>
              Code reçu par email
            </p>
            {ok && <p style={{fontSize:12,color:'#16a34a',margin:'4px 0 12px',fontWeight: 500}}>{ok}</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
              <div>
                <label style={S.label}>Code à 6 chiffres</label>
                <input placeholder="000000" value={code}
                  onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                  maxLength={6}
                  style={{...S.inp, textAlign:'center', fontSize:22, fontWeight: 500,
                    letterSpacing:'0.3em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'}}/>
              </div>
              <div>
                <label style={S.label}>Nouveau mot de passe</label>
                <input type="password" placeholder="Minimum 6 caractères" value={newPwd}
                  onChange={e=>setNewPwd(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&confirmReset()}
                  style={S.inp}/>
              </div>
            </div>
            {err && <p style={{fontSize:12,color:'#ef4444',margin:'0 0 10px',fontWeight: 500}}>{err}</p>}
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
                <PhoneInput value={phone} onChange={setPhone}
                  label="Téléphone *" required
                  theme={{ text: th.text, muted: th.muted, dim: th.dim,
                    border: th.border, inputBg: th.inputBg, inputBorder: th.inputBorder }}/>
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
                border: '0.5px solid rgba(239,68,68,0.2)' }}>
                <span style={{fontSize:13,flexShrink:0}}>⚠️</span>
                <p style={{margin:0,fontSize:12,color:'#dc2626',fontWeight: 500}}>{err}</p>
              </div>
            )}
            {ok && <p style={{fontSize:12,color:'#16a34a',fontWeight: 500}}>{ok}</p>}

            {/* RGPD commit 17 : 2 cases (CGU obligatoire + marketing optionnel) */}
            {mode === 'register' && (
              <ConsentCheckboxes slug={slug} th={th} onChange={handleConsents}/>
            )}

            {/* Bouton principal — RGPD commit 20 : phone valide obligatoire en register */}
            <button onClick={submit}
              disabled={loading||!email.trim()||!pwd||(mode==='register'&&(!first.trim()||!last.trim()||!consent||!isValidPhoneNumber(phone||'')))}
              style={{...S.btnPrimary,
                opacity:loading||!email.trim()||!pwd||(mode==='register'&&(!first.trim()||!last.trim()||!consent||!isValidPhoneNumber(phone||'')))?0.5:1,
                marginTop:4}}>
              {loading ? '...' : mode==='login' ? '→ Se connecter' : '→ Creer mon compte'}
            </button>

            {/* Séparateur + bouton Google — toujours visible */}
            <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
              <div style={{flex:1,height:1,background:th.border}}/>
              <span style={{fontSize:11,color:th.dim,whiteSpace:'nowrap',padding:'0 6px'}}>ou</span>
              <div style={{flex:1,height:1,background:th.border}}/>
            </div>
            {/* RGPD commit 19 : bouton Google toujours actif. Pour un NOUVEAU
                client, le consentement CGU + marketing est demandé sur la page
                /google-confirm après retour OAuth. Pour un client déjà inscrit,
                login direct comme avant (consentement déjà signé). */}
            <button onClick={loginWithGoogle}
              style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                padding:'11px',borderRadius:10,background:th.card,
                border: `0.5px solid ${th.border}`,cursor:'pointer',
                fontWeight: 500,fontSize:13,color:th.text}}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuer avec Google
            </button>
            {mode === 'register' && (
              <p style={{ margin:'-2px 0 0', fontSize:11, color:th.muted, lineHeight:1.5,
                textAlign:'center' }}>
                {"Vous accepterez les conditions et choisirez vos préférences à l'étape suivante."}
              </p>
            )}

            {/* Mot de passe oublié */}
            {mode === 'login' && (
              <button onClick={()=>{setMode('forgot');setErr('');setOk('');}}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:12,
                  color:th.muted, textAlign:'center', padding:'2px 0' }}>
                Mot de passe oublié ?
              </button>
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
