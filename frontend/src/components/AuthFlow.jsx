import { useState, useEffect, useRef } from 'react';
import { I } from '../utils/icons';
import { Toast, useToast, CodeInput } from './UI';
import { ThemeToggle } from './ThemeToggle';
import { api } from '../utils/api';
import { useAuth } from '../hooks/useAuth';

// ── Table des indicatifs telephoniques par pays ───────────────────────────────
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
  if (!cc.pattern.test(digits)) return { valid: false, msg: `Format invalide` };
  return { valid: true, msg: '' };
}

// ── PhoneField compact : drapeau + indicatif uniquement ───────────────────────
function PhoneField({ country, phone, onChange, label = 'Telephone', required: isReq }) {
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
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}{isReq ? ' *' : ''}</label>
      <div style={{ display:'flex', gap:6 }}>
        <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
          <button type="button" onClick={() => setOpen(!open)}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'10px 10px',
              border:'2px solid #e2e8f0', borderRadius:12, background:'white', cursor:'pointer',
              fontSize:13, fontWeight:600, color:'#334155', minWidth:0, whiteSpace:'nowrap' }}>
            <span style={{ fontSize:16, lineHeight:1 }}>{cc.flag}</span>
            <span>{cc.dial}</span>
            <span style={{ fontSize:9, color:'#94a3b8', marginLeft:-2 }}>&#x25BC;</span>
          </button>
          {open && (
            <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:999,
              background:'white', border:'2px solid #e2e8f0', borderRadius:12,
              boxShadow:'0 8px 24px rgba(0,0,0,0.12)', maxHeight:240, overflowY:'auto', width:200 }}>
              {COUNTRY_CODES.map(c => (
                <button key={c.code} type="button"
                  onClick={() => { onChange({ country: c.code, phone: '' }); setOpen(false); }}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8,
                    padding:'9px 12px', border:'none', background: c.code === country ? '#f1f5f9' : 'none',
                    cursor:'pointer', fontSize:13, color:'#1e293b', textAlign:'left' }}
                  onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = c.code === country ? '#f1f5f9' : 'none'}>
                  <span style={{ fontSize:15 }}>{c.flag}</span>
                  <span style={{ fontWeight:600 }}>{c.dial}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="tel"
          value={phone}
          onChange={e => onChange({ phone: e.target.value.replace(/[^\d\s]/g,'') })}
          placeholder={`Ex: 6 30 04 67 18 (${cc.digits} chiffres)`}
          style={{ flex:1, padding:'10px 14px', border:`2px solid ${phone && !val.valid ? '#ef4444' : '#e2e8f0'}`,
            borderRadius:12, fontSize:13, outline:'none' }}
        />
      </div>
      {phone && !val.valid && <p style={{ color:'#ef4444', fontSize:11, margin:'4px 0 0', fontWeight:600 }}>{val.msg}</p>}
      {phone && val.valid && phone.length > 0 && <p style={{ color:'#10b981', fontSize:11, margin:'4px 0 0' }}>{cc.dial} {phone}</p>}
    </div>
  );
}

// ── AddressField avec api-adresse.data.gouv.fr (sans emoji) ───────────────────
const addressCache = new Map();
function AddressField({ address, onChange, label = 'Adresse du commerce' }) {
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
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label} *</label>
      <div style={{ position:'relative' }}>
        <input
          type="text"
          value={address}
          onChange={e => search(e.target.value)}
          onFocus={() => setAddrFocus(true)}
          onBlur={() => setTimeout(() => setAddrFocus(false), 200)}
          placeholder="Numero, rue, ville..."
          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500"
          autoComplete="off"
        />
        {addrBusy && (
          <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'#94a3b8' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
        )}
      </div>
      {addrFocus && suggestions.length > 0 && (
        <div style={{ position:'absolute', zIndex:999, width:'100%', background:'white', border:'2px solid #e2e8f0',
          borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', top:'calc(100% + 4px)', maxHeight:220, overflowY:'auto' }}>
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
                style={{ width:'100%', textAlign:'left', padding:'10px 14px', border:'none',
                  background:'none', cursor:'pointer', fontSize:12, color:'#1e293b',
                  borderBottom:'1px solid #f1f5f9', lineHeight:1.4 }}
                onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}>
                <span style={{ fontWeight:600 }}>{p.name}</span>
                <span style={{ color:'#64748b', marginLeft:6 }}>{p.postcode} {p.city}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Bouton Google ─────────────────────────────────────────────────────────────
function GoogleButton({ onClick, label = 'Continuer avec Google' }) {
  return (
    <button type="button" onClick={onClick}
      style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
        padding:'12px 16px', borderRadius:12, border:'2px solid #e2e8f0', background:'#fff',
        cursor:'pointer', fontSize:13, fontWeight:600, color:'#334155', transition:'all 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.borderColor='#cbd5e1'; }}
      onMouseLeave={e => { e.currentTarget.style.background='#fff'; e.currentTarget.style.borderColor='#e2e8f0'; }}>
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

// ── Separateur OU ─────────────────────────────────────────────────────────────
function Divider() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, margin:'16px 0' }}>
      <div style={{ flex:1, height:1, background:'#e2e8f0' }} />
      <span style={{ fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>ou</span>
      <div style={{ flex:1, height:1, background:'#e2e8f0' }} />
    </div>
  );
}

// ── Hook Google OAuth popup ───────────────────────────────────────────────────
function useGoogleMerchantAuth(onSuccess) {
  useEffect(() => {
    const handler = (e) => {
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

// ═══════════════════════════════════════════════════════════════════════════════
//  AuthFlow principal
// ═══════════════════════════════════════════════════════════════════════════════
export default function AuthFlow() {
  const [screen, setScreen] = useState('login');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingCode, setPendingCode] = useState('');
  const [t, show] = useToast();
  const { login } = useAuth();

  const go = (sc, email) => { if (email) setPendingEmail(email); setScreen(sc); };

  const openGoogle = useGoogleMerchantAuth((token, user) => {
    login(token, user);
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative" style={{ minHeight: "100dvh" }}>
      <div className="absolute top-12 right-5"><ThemeToggle /></div>
      <Toast msg={t?.msg} type={t?.type} />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/images/logo-app.png" alt="FlowIA" className="w-16 h-16 rounded-2xl mx-auto mb-4 object-contain" />
          <h1 className="text-3xl font-bold text-white">FlowIA</h1>
          <p className="text-slate-400 mt-1 text-sm">Gerez votre commerce facilement</p>
        </div>
        {screen === 'login' && <LoginScreen show={show} onLogin={login} goReg={() => go('register')} goForgot={() => go('forgot')} openGoogle={openGoogle} />}
        {screen === 'register' && <RegisterScreen show={show} onBack={() => go('login')} onSent={(em) => go('vreg', em)} openGoogle={openGoogle} />}
        {screen === 'vreg' && <VerifyScreen
          title="Verifiez votre email" sub={`Code envoye a ${pendingEmail}`}
          onVerify={async (code) => {
            try {
              const r = await api.confirmRegister({ email: pendingEmail, code });
              login(r.token, r.user);
            } catch (e) { show(e.message, 'err'); }
          }}
          onBack={() => go('register')}
          onResend={async () => {
            try { await api.resendCode({ email: pendingEmail }); show('Code renvoye !'); } catch (e) { show(e.message, 'err'); }
          }}
        />}
        {screen === 'forgot' && <ForgotScreen show={show} onBack={() => go('login')} onSent={(em) => go('vreset', em)} />}
        {screen === 'vreset' && <VerifyScreen
          title="Code de recuperation" sub={`Code envoye a ${pendingEmail}`}
          onVerify={async (code) => {
            try {
              await api.forgotVerify({ email: pendingEmail, code });
              setPendingCode(code);
              go('newpw');
            } catch (e) { show(e.message, 'err'); }
          }}
          onBack={() => go('forgot')}
          onResend={async () => {
            try { await api.forgot({ email: pendingEmail }); show('Code renvoye !'); } catch (e) { show(e.message, 'err'); }
          }}
        />}
        {screen === 'newpw' && <NewPwScreen show={show} email={pendingEmail} verifyCode={pendingCode} onDone={() => { show('Mot de passe modifie !'); go('login'); }} />}
      </div>
    </div>
  );
}

// ── Ecran de connexion ────────────────────────────────────────────────────────
function LoginScreen({ show, onLogin, goReg, goForgot, openGoogle }) {
  const [f, setF] = useState({ email: '', pw: '' }); const [vis, setVis] = useState(false); const [ld, setLd] = useState(false);
  const sub = async e => {
    e.preventDefault(); setLd(true);
    try {
      const r = await api.login({ email: f.email, password: f.pw });
      onLogin(r.token, r.user);
    } catch (err) { show(err.message, 'err'); }
    finally { setLd(false); }
  };
  return (
    <div className="bg-white rounded-3xl p-7 shadow-2xl">
      <h2 className="text-xl font-bold mb-6 text-slate-900">Connexion</h2>

      {/* Bouton Google */}
      <GoogleButton onClick={openGoogle} label="Se connecter avec Google" />
      <Divider />

      <form onSubmit={sub} className="space-y-4">
        <div className="relative"><label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
          <input type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="votre@email.com" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500 pr-10" />
          <I.Mail className="w-4 h-4 text-slate-400 absolute right-3 top-[38px]" /></div>
        <div className="relative"><label className="block text-sm font-semibold text-slate-700 mb-1.5">Mot de passe</label>
          <input type={vis ? 'text' : 'password'} required value={f.pw} onChange={e => setF({ ...f, pw: e.target.value })} placeholder="........" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500 pr-10" />
          <button type="button" onClick={() => setVis(!vis)} className="absolute right-3 top-[38px]">{vis ? <I.EyeOff className="w-4 h-4 text-slate-400" /> : <I.Eye className="w-4 h-4 text-slate-400" />}</button></div>
        <button type="button" onClick={goForgot} className="text-sm text-slate-500 underline hover:text-slate-800">Mot de passe oublie ?</button>
        <button type="submit" disabled={ld} className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors">{ld ? 'Connexion...' : 'Se connecter'}</button>
      </form>
      <p className="text-center text-sm text-slate-500 mt-5">Pas encore de compte ? <button onClick={goReg} className="text-slate-900 font-semibold underline">S'inscrire</button></p>
    </div>
  );
}

// ── Ecran d'inscription ───────────────────────────────────────────────────────
function RegisterScreen({ show, onBack, onSent, openGoogle }) {
  const [f, setF]   = useState({ biz:'', email:'', pw:'', cpw:'', phone:'', country:'FR', address:'', city:'', postalCode:'', lat:null, lng:null });
  const [vis, setVis]     = useState(false);
  const [ld,  setLd]      = useState(false);
  const [consent, setConsent] = useState(false);
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
        address: f.address || undefined, city: f.city || undefined,
        postalCode: f.postalCode || undefined,
        country: f.country, lat: f.lat, lng: f.lng,
      });
      onSent(f.email);
    } catch (err) { show(err.message, 'err'); }
    finally { setLd(false); }
  };

  const inp = "w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500";

  return (
    <div className="bg-white rounded-3xl p-7 shadow-2xl" style={{ maxHeight:'90vh', overflowY:'auto' }}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 mb-5 hover:text-slate-800">
        <I.ChevD className="w-4 h-4 rotate-90" />Retour
      </button>
      <h2 className="text-xl font-bold mb-1 text-slate-900">Creer un compte</h2>
      <p className="text-xs text-slate-500 mb-5">Ces informations seront visibles par vos clients</p>

      {/* Bouton Google */}
      <GoogleButton onClick={openGoogle} label="S'inscrire avec Google" />
      <Divider />

      <form onSubmit={sub} className="space-y-4">
        {/* ── Section : Votre commerce ── */}
        <div style={{ padding:'14px 16px', borderRadius:14, background:'#f8fafc', border:'1px solid #e2e8f0' }}>
          <p style={{ fontSize:12, fontWeight:800, color:'#475569', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>Votre commerce</p>
          <div className="relative" style={{ marginBottom:12 }}>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nom du commerce *</label>
            <input type="text" required value={f.biz} onChange={e => setF({...f, biz: e.target.value})}
              placeholder="Mon Salon, Barbershop..." className={inp + " pr-10"} />
            <I.Store className="w-4 h-4 text-slate-400 absolute right-3 top-[38px]" />
            {f.biz.trim() && <span style={{ position:'absolute', right:28, top:38, color:'#10b981', fontSize:14 }}>&#10003;</span>}
          </div>
          <AddressField address={f.address} onChange={upd => setF(prev => ({...prev, ...upd}))} />
          {f.address && f.city && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr', gap:10, marginTop:12 }}>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Code postal</label>
                <input type="text" value={f.postalCode} onChange={e => setF({...f, postalCode: e.target.value.replace(/[^\d]/g,'').slice(0,5)})}
                  placeholder="75001" className={inp} maxLength={5} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Ville</label>
                <input type="text" value={f.city} onChange={e => setF({...f, city: e.target.value})}
                  placeholder="Paris" className={inp} />
              </div>
            </div>
          )}
        </div>

        {/* ── Section : Votre identite ── */}
        <div style={{ padding:'14px 16px', borderRadius:14, background:'#f8fafc', border:'1px solid #e2e8f0' }}>
          <p style={{ fontSize:12, fontWeight:800, color:'#475569', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>Votre identite</p>
          <div className="relative" style={{ marginBottom:12 }}>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email *</label>
            <input type="email" required value={f.email} onChange={e => setF({...f, email: e.target.value})}
              placeholder="votre@email.com" className={inp + " pr-10"} />
            <I.Mail className="w-4 h-4 text-slate-400 absolute right-3 top-[38px]" />
            {f.email && /\S+@\S+\.\S+/.test(f.email) && <span style={{ position:'absolute', right:28, top:38, color:'#10b981', fontSize:14 }}>&#10003;</span>}
          </div>
          <PhoneField country={f.country} phone={f.phone} onChange={upd => setF(prev => ({...prev, ...upd}))} label="Telephone du commerce" />
        </div>

        {/* ── Section : Securite ── */}
        <div style={{ padding:'14px 16px', borderRadius:14, background:'#f8fafc', border:'1px solid #e2e8f0' }}>
          <p style={{ fontSize:12, fontWeight:800, color:'#475569', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>Securite</p>
          <div className="relative" style={{ marginBottom:12 }}>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mot de passe *</label>
            <input type={vis ? 'text' : 'password'} required value={f.pw}
              onChange={e => setF({...f, pw: e.target.value})} placeholder="Min. 6 caracteres"
              className={inp + " pr-10"} />
            <button type="button" onClick={() => setVis(!vis)} className="absolute right-3 top-[38px]">
              {vis ? <I.EyeOff className="w-4 h-4 text-slate-400" /> : <I.Eye className="w-4 h-4 text-slate-400" />}
            </button>
            {f.pw.length >= 6 && <span style={{ position:'absolute', right:28, top:38, color:'#10b981', fontSize:14 }}>&#10003;</span>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirmer le mot de passe *</label>
            <input type="password" required value={f.cpw} onChange={e => setF({...f, cpw: e.target.value})}
              placeholder="Repetez le mot de passe" className={inp}
              style={{ borderColor: f.cpw && f.cpw !== f.pw ? '#ef4444' : undefined }} />
            {f.cpw && f.cpw === f.pw && <span style={{ color:'#10b981', fontSize:11, marginTop:2, display:'block' }}>Mots de passe identiques</span>}
            {f.cpw && f.cpw !== f.pw && <span style={{ color:'#ef4444', fontSize:11, marginTop:2, display:'block' }}>Les mots de passe ne correspondent pas</span>}
          </div>
        </div>
        {/* Consentement CGU + politique confidentialite */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px',
          borderRadius:10, background:'rgba(99,102,241,0.04)',
          border:'1px solid rgba(99,102,241,0.15)' }}>
          <input type="checkbox" id="merchant-consent" checked={consent}
            onChange={e=>setConsent(e.target.checked)}
            style={{ marginTop:2, flexShrink:0, accentColor:'#6366f1', cursor:'pointer', width:15, height:15 }} />
          <label htmlFor="merchant-consent"
            style={{ fontSize:11, color:'#64748b', lineHeight:1.5, cursor:'pointer' }}>
            J'accepte les{' '}
            <button type="button" onClick={()=>setShowPolicy(true)}
              style={{ color:'#6366f1', background:'none', border:'none',
                textDecoration:'underline', cursor:'pointer', fontSize:11, padding:0 }}>
              conditions d'utilisation et la politique de confidentialite
            </button>
            . Mes donnees sont traitees conformement au RGPD.
          </label>
        </div>

        <button type="submit" disabled={ld || !consent}
          className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors">
          {ld ? 'Creation en cours...' : 'Creer mon compte'}
        </button>

        {/* Modal politique de confidentialite */}
        {showPolicy && (
          <div style={{ position:'fixed', inset:0, zIndex:1000,
            display:'flex', alignItems:'center', justifyContent:'center',
            padding:16, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }}
            onClick={()=>setShowPolicy(false)}>
            <div style={{ background:'white', borderRadius:20, padding:24,
              maxWidth:440, width:'100%', maxHeight:'80vh', overflowY:'auto' }}
              onClick={e=>e.stopPropagation()}>
              <p style={{ margin:'0 0 16px', fontWeight:800, fontSize:16, color:'#0f172a' }}>
                Conditions & Confidentialite
              </p>
              {[
                ['Donnees collectees', "Nom du commerce, email, telephone, adresse. Utilises pour gerer votre compte et vos reservations."],
                ['Utilisation', "Vos donnees permettent de gerer votre activite (reservations, caisse, statistiques). Elles ne sont jamais vendues a des tiers."],
                ['Conservation', "Conservees le temps de votre abonnement. Supprimables a tout moment depuis votre compte."],
                ['Vos droits RGPD', "Acces, rectification, suppression disponibles depuis Parametres > Compte. Delai de reponse : 30 jours max."],
                ['Securite', "Mots de passe hashes bcrypt. Communications TLS. Acces securise par JWT."],
                ['Contact', "Pour toute question : utilisez le formulaire de contact ou supprimez votre compte depuis les parametres."],
              ].map(([t,d])=>(
                <div key={t} style={{ marginBottom:12 }}>
                  <p style={{ margin:'0 0 3px', fontWeight:700, fontSize:13, color:'#1e293b' }}>{t}</p>
                  <p style={{ margin:0, fontSize:12, color:'#64748b', lineHeight:1.5 }}>{d}</p>
                </div>
              ))}
              <button onClick={()=>setShowPolicy(false)}
                style={{ width:'100%', padding:'12px', borderRadius:10, marginTop:8,
                  background:'#0f172a', color:'white', border:'none',
                  fontWeight:700, fontSize:13, cursor:'pointer' }}>
                Fermer
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

// ── Ecran verification code ───────────────────────────────────────────────────
function VerifyScreen({ title, sub, onVerify, onBack, onResend }) {
  const [code, setCode] = useState(''); const [ld, setLd] = useState(false);
  const submit = async e => {
    e.preventDefault(); if (code.length !== 6) return;
    setLd(true); try { await onVerify(code); } catch { } finally { setLd(false); }
  };
  return (
    <div className="bg-white rounded-3xl p-7 shadow-2xl">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 mb-5 hover:text-slate-800"><I.ChevD className="w-4 h-4 rotate-90" />Retour</button>
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3"><I.Mail className="w-7 h-7 text-blue-600" /></div>
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">{sub}</p>
      </div>
      <form onSubmit={submit} className="space-y-5">
        <CodeInput value={code} onChange={setCode} />
        <button type="submit" disabled={code.length !== 6 || ld} className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 transition-colors">{ld ? 'Verification...' : 'Verifier le code'}</button>
      </form>
      <button onClick={onResend} className="w-full text-center text-sm text-slate-500 mt-4 underline hover:text-slate-800">Renvoyer le code</button>
    </div>
  );
}

// ── Ecran mot de passe oublie ─────────────────────────────────────────────────
function ForgotScreen({ show, onBack, onSent }) {
  const [email, setEmail] = useState(''); const [ld, setLd] = useState(false);
  const sub = async e => {
    e.preventDefault(); setLd(true);
    try { await api.forgot({ email }); onSent(email); }
    catch (err) { show(err.message, 'err'); }
    finally { setLd(false); }
  };
  return (
    <div className="bg-white rounded-3xl p-7 shadow-2xl">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 mb-5 hover:text-slate-800"><I.ChevD className="w-4 h-4 rotate-90" />Retour</button>
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-3"><I.Key className="w-7 h-7 text-amber-600" /></div>
        <h2 className="text-xl font-bold text-slate-900">Mot de passe oublie</h2>
        <p className="text-sm text-slate-500 mt-1">Entrez votre email pour recevoir un code</p>
      </div>
      <form onSubmit={sub} className="space-y-4">
        <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="votre@email.com" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500" /></div>
        <button type="submit" disabled={ld} className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">{ld ? 'Envoi...' : 'Envoyer le code'}</button>
      </form>
    </div>
  );
}

// ── Ecran nouveau mot de passe ────────────────────────────────────────────────
function NewPwScreen({ show, email, verifyCode, onDone }) {
  const [f, setF] = useState({ pw: '', cpw: '' }); const [vis, setVis] = useState(false); const [ld, setLd] = useState(false);
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
    <div className="bg-white rounded-3xl p-7 shadow-2xl">
      <h2 className="text-xl font-bold mb-6 text-slate-900">Nouveau mot de passe</h2>
      <form onSubmit={sub} className="space-y-4">
        <div className="relative"><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nouveau mot de passe</label>
          <input type={vis ? 'text' : 'password'} required value={f.pw} onChange={e => setF({ ...f, pw: e.target.value })} placeholder="Min. 6 caracteres" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500 pr-10" />
          <button type="button" onClick={() => setVis(!vis)} className="absolute right-3 top-[38px]">{vis ? <I.EyeOff className="w-4 h-4 text-slate-400" /> : <I.Eye className="w-4 h-4 text-slate-400" />}</button></div>
        <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirmer</label>
          <input type="password" required value={f.cpw} onChange={e => setF({ ...f, cpw: e.target.value })} placeholder="Repetez le mot de passe" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500" /></div>
        <button type="submit" disabled={ld} className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800">{ld ? 'Enregistrement...' : 'Enregistrer'}</button>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MerchantOnboarding — Formulaire obligatoire post-inscription Google
// ═══════════════════════════════════════════════════════════════════════════════
export function MerchantOnboarding({ user, onComplete }) {
  const [f, setF] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    businessName: user?.businessName || '',
    phone: '',
    country: 'FR',
    address: '',
    city: '',
    postalCode: '',
    lat: null,
    lng: null,
  });
  const [ld, setLd] = useState(false);
  const [err, setErr] = useState('');
  const [t, show] = useToast();

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
    } catch (e) { setErr(e.message); }
    finally { setLd(false); }
  };

  const inp = "w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4" style={{ minHeight:'100dvh' }}>
      <Toast msg={t?.msg} type={t?.type} />
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src="/images/logo-app.png" alt="FlowIA" className="w-14 h-14 rounded-2xl mx-auto mb-3 object-contain" />
          <h1 className="text-2xl font-bold text-white">Finalisez votre inscription</h1>
          <p className="text-slate-400 mt-1 text-sm">Ces informations sont necessaires pour votre activite</p>
        </div>

        <div className="bg-white rounded-3xl p-7 shadow-2xl" style={{ maxHeight:'80vh', overflowY:'auto' }}>
          {/* Info email Google */}
          {user?.email && (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
              borderRadius:12, background:'#f0fdf4', border:'1px solid #bbf7d0', marginBottom:16 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <div>
                <p style={{ fontSize:12, fontWeight:700, color:'#15803d', margin:0 }}>Connecte avec Google</p>
                <p style={{ fontSize:11, color:'#4ade80', margin:0 }}>{user.email}</p>
              </div>
            </div>
          )}

          <form onSubmit={sub} className="space-y-4">
            {/* Prenom + Nom */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Prenom *</label>
                <input type="text" value={f.firstName} onChange={e => setF({...f, firstName: e.target.value})}
                  placeholder="Jean" className={inp} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nom *</label>
                <input type="text" value={f.lastName} onChange={e => setF({...f, lastName: e.target.value})}
                  placeholder="Dupont" className={inp} />
              </div>
            </div>

            {/* Nom du commerce */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nom du commerce *</label>
              <input type="text" value={f.businessName} onChange={e => setF({...f, businessName: e.target.value})}
                placeholder="Mon Salon, Barbershop..." className={inp} />
            </div>

            {/* Telephone */}
            <PhoneField
              country={f.country} phone={f.phone}
              onChange={upd => setF(prev => ({...prev, ...upd}))}
              label="Telephone" required
            />

            {/* Adresse */}
            <AddressField
              address={f.address}
              onChange={upd => setF(prev => ({...prev, ...upd}))}
              label="Adresse complete"
            />

            {/* Code postal + Ville */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr', gap:10 }}>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Code postal *</label>
                <input type="text" value={f.postalCode}
                  onChange={e => setF({...f, postalCode: e.target.value.replace(/[^\d]/g,'').slice(0,5)})}
                  placeholder="75001" className={inp} maxLength={5} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Ville *</label>
                <input type="text" value={f.city} onChange={e => setF({...f, city: e.target.value})}
                  placeholder="Paris" className={inp} />
              </div>
            </div>

            {err && <p style={{ color:'#ef4444', fontSize:12, fontWeight:600, margin:'4px 0' }}>{err}</p>}

            <button type="submit" disabled={ld || !canSubmit}
              className="w-full py-3.5 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-all"
              style={{ background: canSubmit ? 'linear-gradient(135deg, #0f172a, #1e293b)' : '#cbd5e1',
                boxShadow: canSubmit ? '0 4px 16px rgba(15,23,42,0.35)' : 'none', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
              {ld ? 'Enregistrement...' : 'Valider et acceder a FlowIA'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
