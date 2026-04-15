import { useState } from 'react';
import { I } from '../utils/icons';
import { Toast, useToast, CodeInput } from './UI';
import { ThemeToggle } from './ThemeToggle';
import { api } from '../utils/api';
import { useAuth } from '../hooks/useAuth';

export default function AuthFlow() {
  const [screen, setScreen] = useState('login');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingCode, setPendingCode] = useState('');
  const [t, show] = useToast();
  const { login } = useAuth();

  const go = (sc, email) => { if (email) setPendingEmail(email); setScreen(sc); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative" style={{ minHeight: "100dvh" }}>
      <div className="absolute top-12 right-5"><ThemeToggle /></div>
      <Toast msg={t?.msg} type={t?.type} />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/images/logo-app.png" alt="FlowIA" className="w-16 h-16 rounded-2xl mx-auto mb-4 object-contain" />
          <h1 className="text-3xl font-bold text-white">FlowIA</h1>
          <p className="text-slate-400 mt-1 text-sm">Gérez votre commerce facilement</p>
        </div>
        {screen === 'login' && <LoginScreen show={show} onLogin={login} goReg={() => go('register')} goForgot={() => go('forgot')} />}
        {screen === 'register' && <RegisterScreen show={show} onBack={() => go('login')} onSent={(em) => go('vreg', em)} />}
        {screen === 'vreg' && <VerifyScreen
          title="Vérifiez votre email" sub={`Code envoye a ${pendingEmail}`}
          onVerify={async (code) => {
            try {
              const r = await api.confirmRegister({ email: pendingEmail, code });
              login(r.token, r.user);
            } catch (e) { show(e.message, 'err'); }
          }}
          onBack={() => go('register')}
          onResend={async () => {
            try { await api.resendCode({ email: pendingEmail }); show('Code renvoyé !'); } catch (e) { show(e.message, 'err'); }
          }}
        />}
        {screen === 'forgot' && <ForgotScreen show={show} onBack={() => go('login')} onSent={(em) => go('vreset', em)} />}
        {screen === 'vreset' && <VerifyScreen
          title="Code de récupération" sub={`Code envoye a ${pendingEmail}`}
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

function LoginScreen({ show, onLogin, goReg, goForgot }) {
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
      <form onSubmit={sub} className="space-y-4">
        <div className="relative"><label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
          <input type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="votre@email.com" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500 pr-10" />
          <I.Mail className="w-4 h-4 text-slate-400 absolute right-3 top-[38px]" /></div>
        <div className="relative"><label className="block text-sm font-semibold text-slate-700 mb-1.5">Mot de passe</label>
          <input type={vis ? 'text' : 'password'} required value={f.pw} onChange={e => setF({ ...f, pw: e.target.value })} placeholder="••••••••" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500 pr-10" />
          <button type="button" onClick={() => setVis(!vis)} className="absolute right-3 top-[38px]">{vis ? <I.EyeOff className="w-4 h-4 text-slate-400" /> : <I.Eye className="w-4 h-4 text-slate-400" />}</button></div>
        <button type="button" onClick={goForgot} className="text-sm text-slate-500 underline hover:text-slate-800">Mot de passe oublié ?</button>
        <button type="submit" disabled={ld} className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors">{ld ? 'Connexion...' : 'Se connecter'}</button>
      </form>
      <p className="text-center text-sm text-slate-500 mt-5">Pas encore de compte ? <button onClick={goReg} className="text-slate-900 font-semibold underline">S'inscrire</button></p>
    </div>
  );
}


// ── Table des indicatifs téléphoniques par pays ───────────────────────────────
const COUNTRY_CODES = [
  { code:'FR', name:'France',           dial:'+33',  digits:9,  pattern:/^[1-9]\d{8}$/ },
  { code:'BE', name:'Belgique',         dial:'+32',  digits:9,  pattern:/^[1-9]\d{7,8}$/ },
  { code:'CH', name:'Suisse',           dial:'+41',  digits:9,  pattern:/^[1-9]\d{8}$/ },
  { code:'LU', name:'Luxembourg',       dial:'+352', digits:9,  pattern:/^\d{6,9}$/ },
  { code:'MA', name:'Maroc',            dial:'+212', digits:9,  pattern:/^[5-7]\d{8}$/ },
  { code:'DZ', name:'Algerie',          dial:'+213', digits:9,  pattern:/^[5-7]\d{8}$/ },
  { code:'TN', name:'Tunisie',          dial:'+216', digits:8,  pattern:/^[2-9]\d{7}$/ },
  { code:'SN', name:'Sénegal',          dial:'+221', digits:9,  pattern:/^[3-8]\d{8}$/ },
  { code:'CI', name:"Côte d'Ivoire",    dial:'+225', digits:10, pattern:/^\d{10}$/ },
  { code:'CM', name:'Cameroun',         dial:'+237', digits:9,  pattern:/^[2-9]\d{8}$/ },
  { code:'GB', name:'Royaume-Uni',      dial:'+44',  digits:10, pattern:/^[7-9]\d{9}$/ },
  { code:'DE', name:'Allemagne',        dial:'+49',  digits:10, pattern:/^\d{10,11}$/ },
  { code:'ES', name:'Espagne',          dial:'+34',  digits:9,  pattern:/^[6-9]\d{8}$/ },
  { code:'IT', name:'Italie',           dial:'+39',  digits:10, pattern:/^[3]\d{9}$/ },
  { code:'PT', name:'Portugal',         dial:'+351', digits:9,  pattern:/^[2-9]\d{8}$/ },
  { code:'NL', name:'Pays-Bas',         dial:'+31',  digits:9,  pattern:/^[1-9]\d{8}$/ },
  { code:'US', name:'États-Unis',       dial:'+1',   digits:10, pattern:/^[2-9]\d{9}$/ },
  { code:'CA', name:'Canada',           dial:'+1',   digits:10, pattern:/^[2-9]\d{9}$/ },
];

function validatePhone(localNumber, countryCode) {
  const cc = COUNTRY_CODES.find(c => c.code === countryCode);
  if (!cc || !localNumber) return { valid: true, msg: '' }; // champ optionnel
  const digits = localNumber.replace(/\s/g, '');
  if (digits.length !== cc.digits) return { valid: false, msg: `${cc.digits} chiffres requis pour ${cc.name} (ex: ${cc.dial} 6 XX XX XX XX)` };
  if (!cc.pattern.test(digits)) return { valid: false, msg: `Format invalide pour ${cc.name}` };
  return { valid: true, msg: '' };
}

function PhoneField({ country, phone, onChange, label = 'Télephone' }) {
  const cc  = COUNTRY_CODES.find(c => c.code === country) || COUNTRY_CODES[0];
  const val = validatePhone(phone, country);
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
      <div style={{ display:'flex', gap:8 }}>
        <div style={{ position:'relative', flexShrink:0 }}>
          <select value={country} onChange={e => onChange({ country: e.target.value, phone: '' })}
            style={{ padding:'10px 32px 10px 10px', border:'2px solid #e2e8f0', borderRadius:12, fontSize:13, background:'white', cursor:'pointer', appearance:'none', minWidth:120 }}>
            {COUNTRY_CODES.map(c => (
              <option key={c.code} value={c.code}>{c.dial} {c.name}</option>
            ))}
          </select>
          <span style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', fontSize:10 }}>▼</span>
        </div>
        <input
          type="tel"
          value={phone}
          onChange={e => onChange({ phone: e.target.value.replace(/[^\d\s]/g,'') })}
          placeholder={`Ex: 6 30 04 67 18 (${cc.digits} chiffres)`}
          style={{ flex:1, padding:'10px 14px', border:`2px solid ${phone && !val.valid ? '#ef4444' : '#e2e8f0'}`, borderRadius:12, fontSize:13, outline:'none' }}
        />
      </div>
      {phone && !val.valid && <p style={{ color:'#ef4444', fontSize:11, margin:'4px 0 0', fontWeight:600 }}>{val.msg}</p>}
      {phone && val.valid && phone.length > 0 && <p style={{ color:'#10b981', fontSize:11, margin:'4px 0 0' }}>✓ {cc.dial} {phone}</p>}
    </div>
  );
}

function AddressField({ address, onChange }) {
  const [suggestions, setSuggestions] = useState([]);
  const [addrBusy,    setAddrBusy]    = useState(false);
  const [addrFocus,   setAddrFocus]   = useState(false);
  const timerRef = useState(null);

  const search = async (val) => {
    onChange({ address: val, lat: null, lng: null, city: '' });
    if (val.trim().length < 4) { setSuggestions([]); return; }
    setAddrBusy(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5&addressdetails=1`, {
        headers: { 'Accept-Language': 'fr' }
      });
      const data = await r.json();
      setSuggestions(data);
    } catch { setSuggestions([]); }
    finally { setAddrBusy(false); }
  };

  return (
    <div style={{ position:'relative' }}>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Adresse du commerce</label>
      <div style={{ position:'relative' }}>
        <input
          type="text"
          value={address}
          onChange={e => search(e.target.value)}
          onFocus={() => setAddrFocus(true)}
          onBlur={() => setTimeout(() => setAddrFocus(false), 200)}
          placeholder="Numéro, rue, ville..."
          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500"
          autoComplete="off"
        />
        {addrBusy && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'#94a3b8' }}>🔍</span>}
      </div>
      {addrFocus && suggestions.length > 0 && (
        <div style={{ position:'absolute', zIndex:999, width:'100%', background:'white', border:'2px solid #e2e8f0', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', top:'calc(100% + 4px)', maxHeight:220, overflowY:'auto' }}>
          {suggestions.map((s, i) => (
            <button key={i} type="button"
              onClick={() => {
                const city = s.address?.city || s.address?.town || s.address?.village || '';
                onChange({ address: s.display_name, lat: parseFloat(s.lat), lng: parseFloat(s.lon), city });
                setSuggestions([]);
              }}
              style={{ width:'100%', textAlign:'left', padding:'10px 14px', border:'none', background:'none', cursor:'pointer', fontSize:12, color:'#1e293b', borderBottom:'1px solid #f1f5f9', lineHeight:1.4 }}
              onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
              onMouseLeave={e=>e.currentTarget.style.background='none'}>
              📍 {s.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RegisterScreen({ show, onBack, onSent }) {
  const [f, setF]   = useState({ biz:'', email:'', pw:'', cpw:'', phone:'', country:'FR', address:'', city:'', lat:null, lng:null });
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
      <h2 className="text-xl font-bold mb-1 text-slate-900">Créer un compte</h2>
      <p className="text-xs text-slate-500 mb-5">Ces informations seront visibles par vos clients</p>
      <form onSubmit={sub} className="space-y-4">
        {/* Nom du commerce */}
        <div className="relative">
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nom du commerce *</label>
          <input type="text" required value={f.biz} onChange={e => setF({...f, biz: e.target.value})}
            placeholder="Mon Salon, Barbershop..." className={inp + " pr-10"} />
          <I.Store className="w-4 h-4 text-slate-400 absolute right-3 top-[38px]" />
        </div>
        {/* Email */}
        <div className="relative">
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email *</label>
          <input type="email" required value={f.email} onChange={e => setF({...f, email: e.target.value})}
            placeholder="votre@email.com" className={inp + " pr-10"} />
          <I.Mail className="w-4 h-4 text-slate-400 absolute right-3 top-[38px]" />
        </div>
        {/* Téléphone avec indicatif */}
        <PhoneField
          country={f.country} phone={f.phone}
          onChange={upd => setF(prev => ({...prev, ...upd}))}
          label="Téléphone du commerce"
        />
        {/* Adresse avec autocomplétion */}
        <AddressField
          address={f.address}
          onChange={upd => setF(prev => ({...prev, ...upd}))}
        />
        {/* Mot de passe */}
        <div className="relative">
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mot de passe *</label>
          <input type={vis ? 'text' : 'password'} required value={f.pw}
            onChange={e => setF({...f, pw: e.target.value})} placeholder="Min. 6 caractères"
            className={inp + " pr-10"} />
          <button type="button" onClick={() => setVis(!vis)} className="absolute right-3 top-[38px]">
            {vis ? <I.EyeOff className="w-4 h-4 text-slate-400" /> : <I.Eye className="w-4 h-4 text-slate-400" />}
          </button>
        </div>
        {/* Confirmer mot de passe */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirmer le mot de passe *</label>
          <input type="password" required value={f.cpw} onChange={e => setF({...f, cpw: e.target.value})}
            placeholder="Répétez le mot de passe" className={inp} />
        </div>
        {/* Consentement CGU + politique confidentialité */}
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
              conditions d'utilisation et la politique de confidentialité
            </button>
            . Mes données sont traitées conformément au RGPD.
          </label>
        </div>

        <button type="submit" disabled={ld || !consent}
          className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors">
          {ld ? 'Creation en cours...' : 'Creer mon compte →'}
        </button>

        {/* Modal politique de confidentialité */}
        {showPolicy && (
          <div style={{ position:'fixed', inset:0, zIndex:1000,
            display:'flex', alignItems:'center', justifyContent:'center',
            padding:16, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }}
            onClick={()=>setShowPolicy(false)}>
            <div style={{ background:'white', borderRadius:20, padding:24,
              maxWidth:440, width:'100%', maxHeight:'80vh', overflowY:'auto' }}
              onClick={e=>e.stopPropagation()}>
              <p style={{ margin:'0 0 16px', fontWeight:800, fontSize:16, color:'#0f172a' }}>
                🔒 Conditions & Confidentialité
              </p>
              {[
                ['📋 Données collectées', "Nom du commerce, email, téléphone, adresse. Utilisés pour gérer votre compte et vos réservations."],
                ['🎯 Utilisation', "Vos données permettent de gérer votre activité (réservations, caisse, statistiques). Elles ne sont jamais vendues à des tiers."],
                ['⏱ Conservation', "Conservées le temps de votre abonnement. Supprimables à tout moment depuis votre compte."],
                ['✅ Vos droits RGPD', "Accès, rectification, suppression disponibles depuis Paramètres → Compte. Délai de réponse : 30 jours max."],
                ['🔐 Sécurité', "Mots de passe hashés bcrypt. Communications TLS. Accès sécurisé par JWT."],
                ['📧 Contact', "Pour toute question : utilisez le formulaire de contact ou supprimez votre compte depuis les paramètres."],
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
        <h2 className="text-xl font-bold text-slate-900">Mot de passe oublié</h2>
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
          <input type={vis ? 'text' : 'password'} required value={f.pw} onChange={e => setF({ ...f, pw: e.target.value })} placeholder="Min. 6 caractères" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500 pr-10" />
          <button type="button" onClick={() => setVis(!vis)} className="absolute right-3 top-[38px]">{vis ? <I.EyeOff className="w-4 h-4 text-slate-400" /> : <I.Eye className="w-4 h-4 text-slate-400" />}</button></div>
        <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirmer</label>
          <input type="password" required value={f.cpw} onChange={e => setF({ ...f, cpw: e.target.value })} placeholder="Répétez le mot de passe" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-500" /></div>
        <button type="submit" disabled={ld} className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800">{ld ? 'Enregistrement...' : 'Enregistrer'}</button>
      </form>
    </div>
  );
}