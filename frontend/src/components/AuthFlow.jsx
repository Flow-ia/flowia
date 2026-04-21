import { useState, useEffect, useRef } from 'react';
import { I } from '../utils/icons';
import { Toast, useToast, CodeInput } from './UI';
import { ThemeToggle } from './ThemeToggle';
import { api } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Button, Label } from './primitives';

// ─── Indicatifs telephoniques (drapeau = data metier identifiant pays) ──────
const COUNTRY_CODES = [
  { code:'FR', flag:'\u{1F1EB}\u{1F1F7}', dial:'+33',  digits:9,  pattern:/^[1-9]\d{8}$/ },
  { code:'BE', flag:'\u{1F1E7}\u{1F1EA}', dial:'+32',  digits:9,  pattern:/^[1-9]\d{7,8}$/ },
  { code:'CH', flag:'\u{1F1E8}\u{1F1ED}', dial:'+41',  digits:9,  pattern:/^[1-9]\d{8}$/ },
  { code:'LU', flag:'\u{1F1F1}\u{1F1FA}', dial:'+352', digits:9,  pattern:/^\d{6,9}$/ },
  { code:'MA', flag:'\u{1F1F2}\u{1F1E6}', dial:'+212', digits:9,  pattern:/^[5-7]\d{8}$/ },
  { code:'DZ', flag:'\u{1F1E9}\u{1F1FF}', dial:'+213', digits:9,  pattern:/^[5-7]\d{8}$/ },
  { code:'TN', flag:'\u{1F1F9}\u{1F1F3}', dial:'+216', digits:8,  pattern:/^[2-9]\d{7}$/ },
  { code:'SN', flag:'\u{1F1F8}\u{1F1F3}', dial:'+221', digits:9,  pattern:/^[3-8]\d{8}$/ },
  { code:'CI', flag:'\u{1F1E8}\u{1F1EE}', dial:'+225', digits:10, pattern:/^\d{10}$/ },
  { code:'CM', flag:'\u{1F1E8}\u{1F1F2}', dial:'+237', digits:9,  pattern:/^[2-9]\d{8}$/ },
  { code:'GB', flag:'\u{1F1EC}\u{1F1E7}', dial:'+44',  digits:10, pattern:/^[7-9]\d{9}$/ },
  { code:'DE', flag:'\u{1F1E9}\u{1F1EA}', dial:'+49',  digits:10, pattern:/^\d{10,11}$/ },
  { code:'ES', flag:'\u{1F1EA}\u{1F1F8}', dial:'+34',  digits:9,  pattern:/^[6-9]\d{8}$/ },
  { code:'IT', flag:'\u{1F1EE}\u{1F1F9}', dial:'+39',  digits:10, pattern:/^[3]\d{9}$/ },
  { code:'PT', flag:'\u{1F1F5}\u{1F1F9}', dial:'+351', digits:9,  pattern:/^[2-9]\d{8}$/ },
  { code:'NL', flag:'\u{1F1F3}\u{1F1F1}', dial:'+31',  digits:9,  pattern:/^[1-9]\d{8}$/ },
  { code:'US', flag:'\u{1F1FA}\u{1F1F8}', dial:'+1',   digits:10, pattern:/^[2-9]\d{9}$/ },
  { code:'CA', flag:'\u{1F1E8}\u{1F1E6}', dial:'+1',   digits:10, pattern:/^[2-9]\d{9}$/ },
];

function validatePhone(localNumber, countryCode) {
  const cc = COUNTRY_CODES.find(c => c.code === countryCode);
  if (!cc || !localNumber) return { valid: true, msg: '' };
  const digits = localNumber.replace(/\s/g, '');
  if (digits.length !== cc.digits) return { valid: false, msg: `${cc.digits} chiffres requis (ex: ${cc.dial} 6 XX XX XX XX)` };
  if (!cc.pattern.test(digits)) return { valid: false, msg: 'Format invalide' };
  return { valid: true, msg: '' };
}

// ─── Style partage pour inputs auth ──────────────────────────────────────────
function fieldStyle(t, extra = {}) {
  return {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    background: t.inputBg,
    border: `0.5px solid ${t.borderInput}`,
    color: t.text,
    boxSizing: 'border-box',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    ...extra,
  };
}

function fieldFocus(t) {
  return {
    onFocus: (e) => {
      e.currentTarget.style.borderColor = t.borderStrong;
      e.currentTarget.style.boxShadow = `0 0 0 3px ${t.border}`;
    },
    onBlur: (e) => {
      e.currentTarget.style.borderColor = t.borderInput;
      e.currentTarget.style.boxShadow = 'none';
    },
  };
}

// ─── PhoneField : drapeau + indicatif + input telephone ─────────────────────
function PhoneField({ country, phone, onChange, label = 'Telephone', required: isReq }) {
  const { theme: t } = useTheme();
  const cc  = COUNTRY_CODES.find(c => c.code === country) || COUNTRY_CODES[0];
  const val = validatePhone(phone, country);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div>
      <Label>{label}{isReq ? ' *' : ''}</Label>
      <div style={{ display:'flex', gap:6 }}>
        <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
          <button type="button" onClick={() => setOpen(!open)}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'10px 10px',
                           border:`0.5px solid ${t.borderInput}`, borderRadius:8,
                           background:t.inputBg, cursor:'pointer',
                           fontSize:13, fontWeight:500, color:t.text,
                           minWidth:0, whiteSpace:'nowrap', fontFamily:'inherit' }}>
            <span style={{ fontSize:16, lineHeight:1 }}>{cc.flag}</span>
            <span>{cc.dial}</span>
            <span style={{ fontSize:9, color:t.muted, marginLeft:-2 }}>&#x25BC;</span>
          </button>
          {open && (
            <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:999,
                          background:t.elevated,
                          border:`0.5px solid ${t.border}`, borderRadius:8,
                          boxShadow:t.shadowLg, maxHeight:240, overflowY:'auto', width:200 }}>
              {COUNTRY_CODES.map(c => {
                const active = c.code === country;
                return (
                  <button key={c.code} type="button"
                          onClick={() => { onChange({ country: c.code, phone: '' }); setOpen(false); }}
                          style={{ width:'100%', display:'flex', alignItems:'center', gap:8,
                                   padding:'9px 12px', border:'none',
                                   background: active ? t.cardAlt : 'transparent',
                                   cursor:'pointer', fontSize:13, color:t.text,
                                   textAlign:'left', fontFamily:'inherit' }}
                          onMouseEnter={e => { e.currentTarget.style.background = t.cardAlt; }}
                          onMouseLeave={e => { e.currentTarget.style.background = active ? t.cardAlt : 'transparent'; }}>
                    <span style={{ fontSize:15 }}>{c.flag}</span>
                    <span style={{ fontWeight:500 }}>{c.dial}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <input type="tel" value={phone}
               onChange={e => onChange({ phone: e.target.value.replace(/[^\d\s]/g, '') })}
               placeholder={`Ex: 6 30 04 67 18 (${cc.digits} chiffres)`}
               style={fieldStyle(t, {
                 flex:1, width:'auto',
                 borderColor: phone && !val.valid ? '#991b1b' : t.borderInput,
               })}
               {...fieldFocus(t)}/>
      </div>
      {phone && !val.valid && (
        <p style={{ color:'#991b1b', fontSize:11, margin:'4px 0 0' }}>{val.msg}</p>
      )}
      {phone && val.valid && phone.length > 0 && (
        <p style={{ color:'#065f46', fontSize:11, margin:'4px 0 0' }}>{cc.dial} {phone}</p>
      )}
    </div>
  );
}

// ─── AddressField : autocomplete api-adresse.data.gouv.fr ────────────────────
const addressCache = new Map();
function AddressField({ address, onChange, label = 'Adresse du commerce' }) {
  const { theme: t } = useTheme();
  const [suggestions, setSuggestions] = useState([]);
  const [addrBusy,    setAddrBusy]    = useState(false);
  const [addrFocus,   setAddrFocus]   = useState(false);
  const timerRef = useRef(null);

  const search = (val) => {
    onChange({ address: val, lat: null, lng: null, city: '', postalCode: '' });
    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.trim().length < 4) { setSuggestions([]); return; }
    timerRef.current = setTimeout(async () => {
      const key = val.trim().toLowerCase();
      if (addressCache.has(key)) { setSuggestions(addressCache.get(key)); return; }
      setAddrBusy(true);
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 3000);
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(val)}&limit=5`, {
          headers: { 'User-Agent': 'FlowIA/1.0' },
          signal: ctrl.signal,
        });
        clearTimeout(timeout);
        const data = await r.json();
        const features = data.features || [];
        addressCache.set(key, features);
        setSuggestions(features);
      } catch { setSuggestions([]); }
      finally { setAddrBusy(false); }
    }, 600);
  };

  return (
    <div style={{ position:'relative' }}>
      <Label>{label} *</Label>
      <div style={{ position:'relative' }}>
        <input type="text" value={address}
               onChange={e => search(e.target.value)}
               onFocus={() => setAddrFocus(true)}
               onBlur={() => setTimeout(() => setAddrFocus(false), 200)}
               placeholder="Numero, rue, ville..."
               autoComplete="off"
               style={fieldStyle(t, { paddingRight: addrBusy ? 36 : 12 })}/>
        {addrBusy && (
          <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                         color:t.muted, display:'flex', alignItems:'center' }}>
            <I.Search style={{ width:14, height:14 }}/>
          </span>
        )}
      </div>
      {addrFocus && suggestions.length > 0 && (
        <div style={{ position:'absolute', zIndex:999, width:'100%', marginTop:4,
                      background:t.elevated,
                      border:`0.5px solid ${t.border}`, borderRadius:8,
                      boxShadow:t.shadowLg, maxHeight:220, overflowY:'auto' }}>
          {suggestions.map((s, i) => {
            const p = s.properties;
            return (
              <button key={i} type="button"
                      onClick={() => {
                        onChange({
                          address: p.label,
                          lat: s.geometry?.coordinates?.[1] || null,
                          lng: s.geometry?.coordinates?.[0] || null,
                          city: p.city || '',
                          postalCode: p.postcode || '',
                        });
                        setSuggestions([]);
                      }}
                      style={{ width:'100%', textAlign:'left', padding:'10px 14px',
                               border:'none',
                               borderBottom: i < suggestions.length - 1 ? `0.5px solid ${t.separator}` : 'none',
                               background:'transparent', cursor:'pointer',
                               fontSize:12, color:t.text, lineHeight:1.4,
                               fontFamily:'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.background = t.cardAlt; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ fontWeight:500 }}>{p.name}</span>
                <span style={{ color:t.muted, marginLeft:6 }}>{p.postcode} {p.city}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Bouton Google (logo brand conserve) ─────────────────────────────────────
function GoogleButton({ onClick, label = 'Continuer avec Google' }) {
  const { theme: t } = useTheme();
  return (
    <button type="button" onClick={onClick}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center',
                     gap:10, padding:'10px 16px', borderRadius:8,
                     border:`0.5px solid ${t.borderStrong}`,
                     background:'transparent', cursor:'pointer',
                     fontSize:13, fontWeight:500, color:t.text,
                     fontFamily:'inherit',
                     transition:'background 0.15s ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = t.cardAlt; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      {label}
    </button>
  );
}

// ─── Separateur "ou" ─────────────────────────────────────────────────────────
function Divider() {
  const { theme: t } = useTheme();
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, margin:'16px 0' }}>
      <div style={{ flex:1, height:'0.5px', background:t.border }}/>
      <span style={{ fontSize:12, color:t.muted }}>ou</span>
      <div style={{ flex:1, height:'0.5px', background:t.border }}/>
    </div>
  );
}

// ─── Hook Google OAuth popup ─────────────────────────────────────────────────
function useGoogleMerchantAuth(onSuccess) {
  useEffect(() => {
    const expectedOrigin = window.location.origin;
    const handler = (e) => {
      if (e.origin !== expectedOrigin) return;
      if (e.data?.type === 'MERCHANT_GOOGLE_AUTH_SUCCESS') {
        onSuccess(e.data.token, e.data.user);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSuccess]);

  const openGoogle = () => {
    const url = api.merchantGoogleAuthUrl();
    const w = 500, h = 600;
    const left = (screen.width - w) / 2;
    const top = (screen.height - h) / 2;
    window.open(url, 'google-auth', `width=${w},height=${h},top=${top},left=${left}`);
  };

  return openGoogle;
}

// ─── Petit bouton de retour avec chevron ─────────────────────────────────────
function BackButton({ onClick, children = 'Retour' }) {
  const { theme: t } = useTheme();
  return (
    <button type="button" onClick={onClick}
            style={{ display:'flex', alignItems:'center', gap:4,
                     fontSize:13, color:t.muted,
                     background:'none', border:'none', cursor:'pointer',
                     padding:0, marginBottom:20,
                     fontFamily:'inherit' }}
            onMouseEnter={e => { e.currentTarget.style.color = t.text; }}
            onMouseLeave={e => { e.currentTarget.style.color = t.muted; }}>
      <I.ChevD style={{ width:15, height:15, transform:'rotate(90deg)' }}/>
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  AuthFlow principal
// ═══════════════════════════════════════════════════════════════════════════
export default function AuthFlow() {
  const { theme: t } = useTheme();
  const [screen, setScreen] = useState('login');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingCode, setPendingCode] = useState('');
  const [toast, show] = useToast();
  const { login } = useAuth();

  const go = (sc, email) => { if (email) setPendingEmail(email); setScreen(sc); };

  const openGoogle = useGoogleMerchantAuth((token, user) => {
    login(token, user);
  });

  return (
    <div style={{ minHeight:'100dvh', background:t.bg,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  padding:16, position:'relative' }}>
      <div style={{ position:'absolute', top:48, right:20 }}><ThemeToggle/></div>
      <Toast msg={toast?.msg} type={toast?.type}/>
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <img src="/images/logo-app.png" alt="FlowIA"
               style={{ width:56, height:56, borderRadius:12, display:'block',
                        margin:'0 auto 12px', objectFit:'contain' }}/>
          <h1 style={{ fontSize:26, fontWeight:500, color:t.text, margin:0 }}>FlowIA</h1>
          <p style={{ fontSize:13, color:t.muted, margin:'4px 0 0' }}>
            Gerez votre commerce facilement
          </p>
        </div>

        {screen === 'login'    && <LoginScreen   show={show} onLogin={login}
                                                goReg={() => go('register')}
                                                goForgot={() => go('forgot')}
                                                openGoogle={openGoogle}/>}
        {screen === 'register' && <RegisterScreen show={show}
                                                  onBack={() => go('login')}
                                                  onSent={(em) => go('vreg', em)}
                                                  openGoogle={openGoogle}/>}
        {screen === 'vreg' && (
          <VerifyScreen
            title="Verifiez votre email"
            sub={`Code envoye a ${pendingEmail}`}
            onVerify={async (code) => {
              try {
                const r = await api.confirmRegister({ email: pendingEmail, code });
                login(r.token, r.user);
              } catch (e) { show(e.message, 'err'); }
            }}
            onBack={() => go('register')}
            onResend={async () => {
              try { await api.resendCode({ email: pendingEmail }); show('Code renvoye !'); }
              catch (e) { show(e.message, 'err'); }
            }}/>
        )}
        {screen === 'forgot'  && <ForgotScreen show={show}
                                               onBack={() => go('login')}
                                               onSent={(em) => go('vreset', em)}/>}
        {screen === 'vreset' && (
          <VerifyScreen
            title="Code de recuperation"
            sub={`Code envoye a ${pendingEmail}`}
            onVerify={async (code) => {
              try {
                await api.forgotVerify({ email: pendingEmail, code });
                setPendingCode(code);
                go('newpw');
              } catch (e) { show(e.message, 'err'); }
            }}
            onBack={() => go('forgot')}
            onResend={async () => {
              try { await api.forgot({ email: pendingEmail }); show('Code renvoye !'); }
              catch (e) { show(e.message, 'err'); }
            }}/>
        )}
        {screen === 'newpw' && (
          <NewPwScreen show={show} email={pendingEmail} verifyCode={pendingCode}
                       onDone={() => { show('Mot de passe modifie !'); go('login'); }}/>
        )}
      </div>
    </div>
  );
}

// ─── Carte d'ecran (wrapper commun) ──────────────────────────────────────────
function AuthCard({ children, maxHeight }) {
  const { theme: t } = useTheme();
  return (
    <div style={{ background:t.card, borderRadius:16, padding:28,
                  border:`0.5px solid ${t.border}`,
                  boxShadow:t.shadowLg,
                  maxHeight, overflowY: maxHeight ? 'auto' : undefined }}>
      {children}
    </div>
  );
}

// ─── Ecran de connexion ─────────────────────────────────────────────────────
function LoginScreen({ show, onLogin, goReg, goForgot, openGoogle }) {
  const { theme: t } = useTheme();
  const [f, setF]   = useState({ email:'', pw:'' });
  const [vis, setVis] = useState(false);
  const [ld, setLd]   = useState(false);

  const sub = async e => {
    e.preventDefault(); setLd(true);
    try {
      const r = await api.login({ email: f.email, password: f.pw });
      onLogin(r.token, r.user);
    } catch (err) { show(err.message, 'err'); }
    finally { setLd(false); }
  };

  return (
    <AuthCard>
      <h2 style={{ fontSize:18, fontWeight:500, color:t.text, margin:'0 0 20px' }}>
        Connexion
      </h2>

      <GoogleButton onClick={openGoogle} label="Se connecter avec Google"/>
      <Divider/>

      <form onSubmit={sub} style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div>
          <Label>Email</Label>
          <div style={{ position:'relative' }}>
            <input type="email" required value={f.email}
                   onChange={e => setF({ ...f, email:e.target.value })}
                   placeholder="votre@email.com"
                   style={fieldStyle(t, { paddingRight:36 })}
                   {...fieldFocus(t)}/>
            <I.Mail style={{ width:15, height:15, color:t.muted,
                             position:'absolute', right:12, top:'50%',
                             transform:'translateY(-50%)' }}/>
          </div>
        </div>

        <div>
          <Label>Mot de passe</Label>
          <div style={{ position:'relative' }}>
            <input type={vis ? 'text' : 'password'} required value={f.pw}
                   onChange={e => setF({ ...f, pw:e.target.value })}
                   placeholder="........"
                   style={fieldStyle(t, { paddingRight:36 })}
                   {...fieldFocus(t)}/>
            <button type="button" onClick={() => setVis(!vis)}
                    style={{ position:'absolute', right:10, top:'50%',
                             transform:'translateY(-50%)',
                             background:'none', border:'none', cursor:'pointer',
                             padding:4, fontFamily:'inherit' }}>
              {vis ? <I.EyeOff style={{ width:15, height:15, color:t.muted }}/>
                   : <I.Eye    style={{ width:15, height:15, color:t.muted }}/>}
            </button>
          </div>
        </div>

        <button type="button" onClick={goForgot}
                style={{ alignSelf:'flex-start', fontSize:12, color:t.muted,
                         background:'none', border:'none', cursor:'pointer',
                         padding:0, textDecoration:'underline',
                         fontFamily:'inherit' }}>
          Mot de passe oublie ?
        </button>

        <Button type="submit" variant="primary" disabled={ld} fullWidth>
          {ld ? 'Connexion...' : 'Se connecter'}
        </Button>
      </form>

      <p style={{ textAlign:'center', fontSize:13, color:t.muted, margin:'18px 0 0' }}>
        Pas encore de compte ?{' '}
        <button onClick={goReg}
                style={{ color:t.text, background:'none', border:'none', cursor:'pointer',
                         padding:0, textDecoration:'underline', fontFamily:'inherit',
                         fontSize:13, fontWeight:500 }}>
          {"S'inscrire"}
        </button>
      </p>
    </AuthCard>
  );
}

// ─── Ecran d'inscription ────────────────────────────────────────────────────
function RegisterScreen({ show, onBack, onSent, openGoogle }) {
  const { theme: t } = useTheme();
  const [f, setF] = useState({
    biz:'', email:'', pw:'', cpw:'',
    phone:'', country:'FR',
    address:'', city:'', postalCode:'',
    lat:null, lng:null,
  });
  const [vis, setVis]       = useState(false);
  const [ld,  setLd]        = useState(false);
  const [consent, setConsent]     = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);

  const sub = async e => {
    e.preventDefault();
    if (f.pw !== f.cpw) return show('Les mots de passe ne correspondent pas.', 'err');
    if (f.pw.length < 6) return show('Mot de passe trop court (6 min).', 'err');
    if (f.phone) {
      const v = validatePhone(f.phone, f.country);
      if (!v.valid) return show(v.msg, 'err');
    }
    const cc = COUNTRY_CODES.find(c => c.code === f.country);
    const fullPhone = f.phone ? `${cc.dial} ${f.phone}` : '';
    setLd(true);
    try {
      await api.register({
        email: f.email, password: f.pw, businessName: f.biz,
        phone: fullPhone || undefined,
        address: f.address || undefined,
        city: f.city || undefined,
        postalCode: f.postalCode || undefined,
        country: f.country, lat: f.lat, lng: f.lng,
      });
      onSent(f.email);
    } catch (err) { show(err.message, 'err'); }
    finally { setLd(false); }
  };

  const section = (title, children) => (
    <div style={{ padding:'14px 16px', borderRadius:12,
                  background:t.cardAlt,
                  border:`0.5px solid ${t.border}` }}>
      <p style={{ fontSize:12, fontWeight:500, color:t.muted, margin:'0 0 12px' }}>
        {title}
      </p>
      {children}
    </div>
  );

  return (
    <AuthCard maxHeight="90vh">
      <BackButton onClick={onBack}/>
      <h2 style={{ fontSize:18, fontWeight:500, color:t.text, margin:'0 0 4px' }}>
        Creer un compte
      </h2>
      <p style={{ fontSize:12, color:t.muted, margin:'0 0 16px' }}>
        Ces informations seront visibles par vos clients
      </p>

      <GoogleButton onClick={openGoogle} label={"S'inscrire avec Google"}/>
      <Divider/>

      <form onSubmit={sub} style={{ display:'flex', flexDirection:'column', gap:14 }}>

        {section('Votre commerce', (
          <>
            <div style={{ position:'relative', marginBottom:12 }}>
              <Label>Nom du commerce *</Label>
              <input type="text" required value={f.biz}
                     onChange={e => setF({ ...f, biz:e.target.value })}
                     placeholder="Mon Salon, Barbershop..."
                     style={fieldStyle(t, { paddingRight: f.biz.trim() ? 56 : 36 })}
                     {...fieldFocus(t)}/>
              <I.Store style={{ width:15, height:15, color:t.muted,
                                position:'absolute', right:12, top:38 }}/>
              {f.biz.trim() && (
                <span style={{ position:'absolute', right:32, top:36,
                               color:'#065f46', fontSize:14 }}>&#10003;</span>
              )}
            </div>
            <AddressField address={f.address}
                          onChange={upd => setF(prev => ({ ...prev, ...upd }))}/>
            {f.address && f.city && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr', gap:10, marginTop:12 }}>
                <div>
                  <Label>Code postal</Label>
                  <input type="text" value={f.postalCode}
                         onChange={e => setF({ ...f, postalCode: e.target.value.replace(/[^\d]/g, '').slice(0,5) })}
                         placeholder="75001" maxLength={5}
                         style={fieldStyle(t)} {...fieldFocus(t)}/>
                </div>
                <div>
                  <Label>Ville</Label>
                  <input type="text" value={f.city}
                         onChange={e => setF({ ...f, city:e.target.value })}
                         placeholder="Paris"
                         style={fieldStyle(t)} {...fieldFocus(t)}/>
                </div>
              </div>
            )}
          </>
        ))}

        {section('Votre identite', (
          <>
            <div style={{ position:'relative', marginBottom:12 }}>
              <Label>Email *</Label>
              <input type="email" required value={f.email}
                     onChange={e => setF({ ...f, email:e.target.value })}
                     placeholder="votre@email.com"
                     style={fieldStyle(t, { paddingRight: /\S+@\S+\.\S+/.test(f.email) ? 56 : 36 })}
                     {...fieldFocus(t)}/>
              <I.Mail style={{ width:15, height:15, color:t.muted,
                               position:'absolute', right:12, top:38 }}/>
              {f.email && /\S+@\S+\.\S+/.test(f.email) && (
                <span style={{ position:'absolute', right:32, top:36,
                               color:'#065f46', fontSize:14 }}>&#10003;</span>
              )}
            </div>
            <PhoneField country={f.country} phone={f.phone}
                        onChange={upd => setF(prev => ({ ...prev, ...upd }))}
                        label="Telephone du commerce"/>
          </>
        ))}

        {section('Securite', (
          <>
            <div style={{ position:'relative', marginBottom:12 }}>
              <Label>Mot de passe *</Label>
              <input type={vis ? 'text' : 'password'} required value={f.pw}
                     onChange={e => setF({ ...f, pw:e.target.value })}
                     placeholder="Min. 6 caracteres"
                     style={fieldStyle(t, { paddingRight: f.pw.length >= 6 ? 56 : 36 })}
                     {...fieldFocus(t)}/>
              <button type="button" onClick={() => setVis(!vis)}
                      style={{ position:'absolute', right:10, top:34,
                               background:'none', border:'none', cursor:'pointer',
                               padding:4, fontFamily:'inherit' }}>
                {vis ? <I.EyeOff style={{ width:15, height:15, color:t.muted }}/>
                     : <I.Eye    style={{ width:15, height:15, color:t.muted }}/>}
              </button>
              {f.pw.length >= 6 && (
                <span style={{ position:'absolute', right:32, top:36,
                               color:'#065f46', fontSize:14 }}>&#10003;</span>
              )}
            </div>
            <div>
              <Label>Confirmer le mot de passe *</Label>
              <input type="password" required value={f.cpw}
                     onChange={e => setF({ ...f, cpw:e.target.value })}
                     placeholder="Repetez le mot de passe"
                     style={fieldStyle(t, {
                       borderColor: f.cpw && f.cpw !== f.pw ? '#991b1b' : t.borderInput,
                     })}
                     {...fieldFocus(t)}/>
              {f.cpw && f.cpw === f.pw && (
                <p style={{ color:'#065f46', fontSize:11, margin:'4px 0 0' }}>
                  Mots de passe identiques
                </p>
              )}
              {f.cpw && f.cpw !== f.pw && (
                <p style={{ color:'#991b1b', fontSize:11, margin:'4px 0 0' }}>
                  Les mots de passe ne correspondent pas
                </p>
              )}
            </div>
          </>
        ))}

        {/* Consentement CGU */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:10,
                      padding:'10px 12px', borderRadius:8,
                      background:'#eef2ff' }}>
          <input type="checkbox" id="merchant-consent" checked={consent}
                 onChange={e => setConsent(e.target.checked)}
                 style={{ marginTop:2, flexShrink:0, accentColor:'#4338ca',
                          cursor:'pointer', width:15, height:15 }}/>
          <label htmlFor="merchant-consent"
                 style={{ fontSize:12, color:'#4338ca', lineHeight:1.5, cursor:'pointer' }}>
            {"J'accepte les "}
            <button type="button" onClick={() => setShowPolicy(true)}
                    style={{ color:'#4338ca', background:'none', border:'none',
                             textDecoration:'underline', cursor:'pointer',
                             fontSize:12, padding:0, fontFamily:'inherit',
                             fontWeight:500 }}>
              {"conditions d'utilisation et la politique de confidentialite"}
            </button>
            . Mes donnees sont traitees conformement au RGPD.
          </label>
        </div>

        <Button type="submit" variant="primary" disabled={ld || !consent} fullWidth>
          {ld ? 'Creation en cours...' : 'Creer mon compte'}
        </Button>
      </form>

      {/* Modal politique de confidentialite */}
      {showPolicy && (
        <div style={{ position:'fixed', inset:0, zIndex:1000,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      padding:16, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
             onClick={() => setShowPolicy(false)}>
          <div onClick={e => e.stopPropagation()}
               style={{ background:t.elevated, borderRadius:16, padding:24,
                        maxWidth:440, width:'100%', maxHeight:'80vh', overflowY:'auto',
                        border:`0.5px solid ${t.border}`,
                        boxShadow:t.shadowModal }}>
            <p style={{ margin:'0 0 16px', fontWeight:500, fontSize:16, color:t.text }}>
              Conditions & Confidentialite
            </p>
            {[
              ['Donnees collectees', 'Nom du commerce, email, telephone, adresse. Utilises pour gerer votre compte et vos reservations.'],
              ['Utilisation',        'Vos donnees permettent de gerer votre activite (reservations, caisse, statistiques). Elles ne sont jamais vendues a des tiers.'],
              ['Conservation',       'Conservees le temps de votre abonnement. Supprimables a tout moment depuis votre compte.'],
              ['Vos droits RGPD',    'Acces, rectification, suppression disponibles depuis Parametres > Compte. Delai de reponse : 30 jours max.'],
              ['Securite',           'Mots de passe hashes bcrypt. Communications TLS. Acces securise par JWT.'],
              ['Contact',            'Pour toute question : utilisez le formulaire de contact ou supprimez votre compte depuis les parametres.'],
            ].map(([ttl, desc]) => (
              <div key={ttl} style={{ marginBottom:12 }}>
                <p style={{ margin:'0 0 3px', fontWeight:500, fontSize:13, color:t.text }}>{ttl}</p>
                <p style={{ margin:0, fontSize:12, color:t.muted, lineHeight:1.5 }}>{desc}</p>
              </div>
            ))}
            <Button type="button" variant="primary" fullWidth
                    onClick={() => setShowPolicy(false)}
                    style={{ marginTop:8 }}>
              Fermer
            </Button>
          </div>
        </div>
      )}
    </AuthCard>
  );
}

// ─── Ecran verification code (email ou reset) ────────────────────────────────
function VerifyScreen({ title, sub, onVerify, onBack, onResend }) {
  const { theme: t } = useTheme();
  const [code, setCode] = useState('');
  const [ld,   setLd]   = useState(false);

  const submit = async e => {
    e.preventDefault(); if (code.length !== 6) return;
    setLd(true);
    try { await onVerify(code); } catch { }
    finally { setLd(false); }
  };

  return (
    <AuthCard>
      <BackButton onClick={onBack}/>
      <div style={{ textAlign:'center', marginBottom:24 }}>
        <div style={{ width:52, height:52, borderRadius:12,
                      background:'#eef2ff',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      margin:'0 auto 12px' }}>
          <I.Mail style={{ width:24, height:24, color:'#4338ca' }}/>
        </div>
        <h2 style={{ fontSize:18, fontWeight:500, color:t.text, margin:0 }}>{title}</h2>
        <p style={{ fontSize:13, color:t.muted, margin:'4px 0 0' }}>{sub}</p>
      </div>
      <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:20 }}>
        <CodeInput value={code} onChange={setCode} theme={t}/>
        <Button type="submit" variant="primary" fullWidth
                disabled={code.length !== 6 || ld}>
          {ld ? 'Verification...' : 'Verifier le code'}
        </Button>
      </form>
      <button type="button" onClick={onResend}
              style={{ width:'100%', textAlign:'center', fontSize:13,
                       color:t.muted, background:'none', border:'none', cursor:'pointer',
                       marginTop:14, padding:0, textDecoration:'underline',
                       fontFamily:'inherit' }}>
        Renvoyer le code
      </button>
    </AuthCard>
  );
}

// ─── Ecran mot de passe oublie ──────────────────────────────────────────────
function ForgotScreen({ show, onBack, onSent }) {
  const { theme: t } = useTheme();
  const [email, setEmail] = useState('');
  const [ld, setLd]       = useState(false);

  const sub = async e => {
    e.preventDefault(); setLd(true);
    try { await api.forgot({ email }); onSent(email); }
    catch (err) { show(err.message, 'err'); }
    finally { setLd(false); }
  };

  return (
    <AuthCard>
      <BackButton onClick={onBack}/>
      <div style={{ textAlign:'center', marginBottom:24 }}>
        <div style={{ width:52, height:52, borderRadius:12,
                      background:'#fffbeb',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      margin:'0 auto 12px' }}>
          <I.Key style={{ width:24, height:24, color:'#92400e' }}/>
        </div>
        <h2 style={{ fontSize:18, fontWeight:500, color:t.text, margin:0 }}>
          Mot de passe oublie
        </h2>
        <p style={{ fontSize:13, color:t.muted, margin:'4px 0 0' }}>
          Entrez votre email pour recevoir un code
        </p>
      </div>
      <form onSubmit={sub} style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div>
          <Label>Email</Label>
          <input type="email" required value={email}
                 onChange={e => setEmail(e.target.value)}
                 placeholder="votre@email.com"
                 style={fieldStyle(t)} {...fieldFocus(t)}/>
        </div>
        <Button type="submit" variant="primary" disabled={ld} fullWidth>
          {ld ? 'Envoi...' : 'Envoyer le code'}
        </Button>
      </form>
    </AuthCard>
  );
}

// ─── Ecran nouveau mot de passe ─────────────────────────────────────────────
function NewPwScreen({ show, email, verifyCode, onDone }) {
  const { theme: t } = useTheme();
  const [f, setF]   = useState({ pw:'', cpw:'' });
  const [vis, setVis] = useState(false);
  const [ld,  setLd]  = useState(false);

  const sub = async e => {
    e.preventDefault();
    if (f.pw !== f.cpw) return show('Les mots de passe ne correspondent pas.', 'err');
    if (f.pw.length < 6) return show('Mot de passe trop court.', 'err');
    setLd(true);
    try { await api.forgotReset({ email, code: verifyCode, newPassword: f.pw }); onDone(); }
    catch (err) { show(err.message, 'err'); }
    finally { setLd(false); }
  };

  return (
    <AuthCard>
      <h2 style={{ fontSize:18, fontWeight:500, color:t.text, margin:'0 0 20px' }}>
        Nouveau mot de passe
      </h2>
      <form onSubmit={sub} style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div>
          <Label>Nouveau mot de passe</Label>
          <div style={{ position:'relative' }}>
            <input type={vis ? 'text' : 'password'} required value={f.pw}
                   onChange={e => setF({ ...f, pw:e.target.value })}
                   placeholder="Min. 6 caracteres"
                   style={fieldStyle(t, { paddingRight:36 })}
                   {...fieldFocus(t)}/>
            <button type="button" onClick={() => setVis(!vis)}
                    style={{ position:'absolute', right:10, top:'50%',
                             transform:'translateY(-50%)',
                             background:'none', border:'none', cursor:'pointer',
                             padding:4, fontFamily:'inherit' }}>
              {vis ? <I.EyeOff style={{ width:15, height:15, color:t.muted }}/>
                   : <I.Eye    style={{ width:15, height:15, color:t.muted }}/>}
            </button>
          </div>
        </div>
        <div>
          <Label>Confirmer</Label>
          <input type="password" required value={f.cpw}
                 onChange={e => setF({ ...f, cpw:e.target.value })}
                 placeholder="Repetez le mot de passe"
                 style={fieldStyle(t)} {...fieldFocus(t)}/>
        </div>
        <Button type="submit" variant="primary" disabled={ld} fullWidth>
          {ld ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </form>
    </AuthCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MerchantOnboarding — formulaire obligatoire post-inscription Google
// ═══════════════════════════════════════════════════════════════════════════
export function MerchantOnboarding({ user, onComplete }) {
  const { theme: t } = useTheme();
  const [f, setF] = useState({
    firstName: user?.firstName || '',
    lastName:  user?.lastName  || '',
    businessName: user?.businessName || '',
    phone:'', country:'FR',
    address:'', city:'', postalCode:'',
    lat:null, lng:null,
  });
  const [ld,  setLd]  = useState(false);
  const [err, setErr] = useState('');
  const [toast, show] = useToast();

  const canSubmit = f.firstName.trim() && f.lastName.trim() && f.businessName.trim()
                 && f.phone.trim() && f.address.trim() && f.city.trim() && f.postalCode.trim();

  const phoneVal = validatePhone(f.phone, f.country);

  const sub = async (e) => {
    e.preventDefault();
    if (!canSubmit) return setErr('Tous les champs sont obligatoires.');
    if (f.phone && !phoneVal.valid) return setErr(phoneVal.msg);

    const cc = COUNTRY_CODES.find(c => c.code === f.country);
    const fullPhone = `${cc.dial} ${f.phone}`;
    setLd(true); setErr('');
    try {
      const r = await api.completeOnboarding({
        firstName: f.firstName, lastName: f.lastName, businessName: f.businessName,
        phone: fullPhone, address: f.address, city: f.city, postalCode: f.postalCode,
        country: f.country, lat: f.lat, lng: f.lng,
      });
      onComplete(r.token, r.user);
    } catch (e) { setErr(e.message || 'Une erreur est survenue.'); }
    finally { setLd(false); }
  };

  return (
    <div style={{ minHeight:'100dvh', background:t.bg,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  padding:16 }}>
      <Toast msg={toast?.msg} type={toast?.type}/>
      <div style={{ width:'100%', maxWidth:460 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <img src="/images/logo-app.png" alt="FlowIA"
               style={{ width:52, height:52, borderRadius:12, display:'block',
                        margin:'0 auto 10px', objectFit:'contain' }}/>
          <h1 style={{ fontSize:22, fontWeight:500, color:t.text, margin:0 }}>
            Finalisez votre inscription
          </h1>
          <p style={{ fontSize:13, color:t.muted, margin:'4px 0 0' }}>
            Ces informations sont necessaires pour votre activite
          </p>
        </div>

        <div style={{ background:t.card, borderRadius:16, padding:28,
                      border:`0.5px solid ${t.border}`,
                      boxShadow:t.shadowLg,
                      maxHeight:'80vh', overflowY:'auto' }}>

          {/* Info email Google (pastel success) */}
          {user?.email && (
            <div style={{ display:'flex', alignItems:'center', gap:10,
                          padding:'10px 14px', borderRadius:8,
                          background:'#f0fdf4',
                          marginBottom:16 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="#065f46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div>
                <p style={{ fontSize:12, fontWeight:500, color:'#065f46', margin:0 }}>
                  Connecte avec Google
                </p>
                <p style={{ fontSize:11, color:'#065f46', opacity:0.75, margin:0 }}>
                  {user.email}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={sub} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <Label>Prenom *</Label>
                <input type="text" value={f.firstName}
                       onChange={e => setF({ ...f, firstName:e.target.value })}
                       placeholder="Jean"
                       style={fieldStyle(t)} {...fieldFocus(t)}/>
              </div>
              <div>
                <Label>Nom *</Label>
                <input type="text" value={f.lastName}
                       onChange={e => setF({ ...f, lastName:e.target.value })}
                       placeholder="Dupont"
                       style={fieldStyle(t)} {...fieldFocus(t)}/>
              </div>
            </div>

            <div>
              <Label>Nom du commerce *</Label>
              <input type="text" value={f.businessName}
                     onChange={e => setF({ ...f, businessName:e.target.value })}
                     placeholder="Mon Salon, Barbershop..."
                     style={fieldStyle(t)} {...fieldFocus(t)}/>
            </div>

            <PhoneField country={f.country} phone={f.phone}
                        onChange={upd => setF(prev => ({ ...prev, ...upd }))}
                        label="Telephone" required/>

            <AddressField address={f.address}
                          onChange={upd => setF(prev => ({ ...prev, ...upd }))}
                          label="Adresse complete"/>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr', gap:10 }}>
              <div>
                <Label>Code postal *</Label>
                <input type="text" value={f.postalCode}
                       onChange={e => setF({ ...f, postalCode: e.target.value.replace(/[^\d]/g, '').slice(0,5) })}
                       placeholder="75001" maxLength={5}
                       style={fieldStyle(t)} {...fieldFocus(t)}/>
              </div>
              <div>
                <Label>Ville *</Label>
                <input type="text" value={f.city}
                       onChange={e => setF({ ...f, city:e.target.value })}
                       placeholder="Paris"
                       style={fieldStyle(t)} {...fieldFocus(t)}/>
              </div>
            </div>

            {err && (
              <p style={{ color:'#991b1b', fontSize:12, fontWeight:500, margin:'4px 0' }}>
                {err}
              </p>
            )}

            <Button type="submit" variant="primary" disabled={ld || !canSubmit} fullWidth>
              {ld ? 'Enregistrement...' : 'Valider et acceder a FlowIA'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
