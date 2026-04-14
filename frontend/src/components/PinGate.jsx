// src/components/PinGate.jsx
import { useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useTheme } from '../hooks/useTheme';
import { ThemeToggle } from './ThemeToggle';
import { api } from '../utils/api';
import { CodeInput } from './UI';

// ── Composants UI ─────────────────────────────────────────────────────────────

function PinDots({ count, shake, theme }) {
  const isDark = theme.mode === 'dark';
  return (
    <div className={`flex justify-center gap-5 my-8 ${shake ? 'shake' : ''}`}>
      {[0,1,2,3].map(i => (
        <div key={i} className="transition-all duration-200" style={{
          width: 14, height: 14, borderRadius: '50%',
          background: i < count ? 'linear-gradient(135deg, #6c63ff, #3ec6e0)' : 'transparent',
          border: i < count ? 'none' : `2px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`,
          transform: i < count ? 'scale(1.15)' : 'scale(1)',
          boxShadow: i < count ? '0 0 10px rgba(108,99,255,0.6)' : 'none',
        }} />
      ))}
    </div>
  );
}

function PinKeypad({ onPress, theme }) {
  const isDark = theme.mode === 'dark';
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <div className="grid grid-cols-3 gap-3 px-4 max-w-[300px] mx-auto">
      {keys.map((k, i) => (
        k === '' ? <div key={i} /> : (
          <button key={k + i} onClick={() => onPress(k)}
            className="h-[68px] rounded-2xl text-2xl font-medium select-none transition-all active:scale-90"
            style={{
              background: k === '⌫'
                ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)')
                : (isDark ? 'rgba(255,255,255,0.07)' : '#ffffff'),
              border: `1px solid ${theme.border}`,
              color: k === '⌫' ? theme.muted : theme.text,
              boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
            }}>
            {k}
          </button>
        )
      ))}
    </div>
  );
}

function ThemedScreen({ children, theme }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center pb-20 px-6 relative"
      style={{ background: theme.bg }}>
      <div className="absolute top-12 right-5"><ThemeToggle /></div>
      {children}
    </div>
  );
}

// ── Flux "code PIN oublié" ────────────────────────────────────────────────────
// Utilise changePin de useAdmin → sauvegarde en BDD via API

function ForgotPinFlow({ onBack, onSuccess, theme }) {
  const { changePin } = useAdmin();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [shake, setShake] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [masked, setMasked] = useState('');

  const sendCode = async () => {
    if (!email.trim()) { setErr('Entrez votre email'); return; }
    setLoading(true); setErr('');
    try {
      const r = await api.pinForgotRequest({ email: email.trim() });
      setMasked(r.emailMasked || email.trim());
      setStep('otp');
    } catch(e) { setErr(e.message || 'Erreur, verifiez votre email'); }
    finally { setLoading(false); }
  };

  const verifyCode = async () => {
    if (code.length !== 6) return;
    setLoading(true); setErr('');
    try {
      await api.pinForgotVerify({ email: email.trim(), code });
      setStep('newpin');
    } catch(e) { setErr(e.message || 'Code invalide'); setCode(''); }
    finally { setLoading(false); }
  };

  const pressNewPin = (k) => {
    if (k === '⌫') { setPin1(p => p.slice(0,-1)); return; }
    if (pin1.length >= 4) return;
    const next = pin1 + k; setPin1(next);
    if (next.length === 4) setTimeout(() => setStep('confirm'), 200);
  };

  const pressConfirm = async (k) => {
    if (k === '⌫') { setPin2(p => p.slice(0,-1)); return; }
    if (pin2.length >= 4) return;
    const next = pin2 + k; setPin2(next);
    if (next.length === 4) {
      if (next === pin1) {
        // ✅ changePin appelle l'API → sauvegarde en BDD
        await changePin(pin1);
        onSuccess?.();
      } else {
        setShake(true); setErr('Les codes ne correspondent pas');
        setTimeout(() => { setPin1(''); setPin2(''); setStep('newpin'); setShake(false); setErr(''); }, 800);
      }
    }
  };

  const backBtn = (onClick) => (
    <button onClick={onClick} className="flex items-center gap-2 text-sm mb-8 transition-colors" style={{ color: theme.muted }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="15 18 9 12 15 6"/></svg>
      Retour
    </button>
  );

  if (step === 'email') return (
    <ThemedScreen theme={theme}>
      <div className="w-full max-w-xs">
        {backBtn(onBack)}
        <div className="w-16 h-16 rounded-[20px] flex items-center justify-center mx-auto mb-6"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)', boxShadow: '0 16px 40px rgba(245,158,11,0.3)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-center mb-2" style={{ color: theme.text }}>Code oublié ?</h2>
        <p className="text-center text-sm mb-8" style={{ color: theme.muted }}>Entrez votre email pour recevoir un code de réinitialisation</p>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendCode()}
          placeholder="votre@email.com"
          className="w-full px-4 py-4 rounded-2xl text-sm focus:outline-none mb-3"
          style={{ background: theme.inputBg, border: `1px solid ${err ? 'rgba(239,68,68,0.5)' : theme.inputBorder}`, color: theme.text }} />
        {err && <p className="text-red-500 text-xs text-center mb-3 font-medium">{err}</p>}
        <button onClick={sendCode} disabled={!email.trim() || loading}
          className="w-full py-4 rounded-2xl font-semibold text-white disabled:opacity-30"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)', boxShadow: '0 8px 24px rgba(245,158,11,0.3)' }}>
          {loading ? 'Envoi...' : 'Envoyer le code'}
        </button>
      </div>
    </ThemedScreen>
  );

  if (step === 'otp') return (
    <ThemedScreen theme={theme}>
      <div className="w-full max-w-xs">
        {backBtn(() => { setStep('email'); setCode(''); })}
        <div className="w-16 h-16 rounded-[20px] flex items-center justify-center mx-auto mb-6"
          style={{ background: 'linear-gradient(135deg, #6c63ff, #3ec6e0)', boxShadow: '0 16px 40px rgba(108,99,255,0.35)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-center mb-2" style={{ color: theme.text }}>Vérification</h2>
        <p className="text-center text-sm mb-8" style={{ color: theme.muted }}>
          Code envoyé à <strong style={{ color: theme.subtext }}>{masked}</strong>
        </p>
        <CodeInput value={code} onChange={setCode} theme={theme} />
        {err && <p className="text-red-500 text-xs text-center mt-3 font-medium">{err}</p>}
        <button onClick={verifyCode} disabled={code.length !== 6 || loading}
          className="w-full py-4 rounded-2xl font-semibold text-white disabled:opacity-30 mt-6"
          style={{ background: 'linear-gradient(135deg, #6c63ff, #3ec6e0)' }}>
          {loading ? 'Verification...' : 'Confirmer'}
        </button>
        <button onClick={sendCode} className="w-full mt-3 text-xs text-center underline" style={{ color: theme.muted }}>
          Renvoyer le code
        </button>
      </div>
    </ThemedScreen>
  );

  if (step === 'newpin') return (
    <ThemedScreen theme={theme}>
      <div className="w-full max-w-xs text-center">
        <h2 className="text-2xl font-bold mb-2" style={{ color: theme.text }}>Nouveau code PIN</h2>
        <p className="text-sm mb-2" style={{ color: theme.muted }}>Choisissez 4 chiffres</p>
        <PinDots count={pin1.length} shake={false} theme={theme} />
        <PinKeypad onPress={pressNewPin} theme={theme} />
      </div>
    </ThemedScreen>
  );

  return (
    <ThemedScreen theme={theme}>
      <div className="w-full max-w-xs text-center">
        <h2 className="text-2xl font-bold mb-2" style={{ color: theme.text }}>Confirmer le code</h2>
        <p className="text-sm mb-2" style={{ color: theme.muted }}>Entrez à nouveau votre code</p>
        <PinDots count={pin2.length} shake={shake} theme={theme} />
        {err && <p className="text-red-500 text-xs font-medium mb-2">{err}</p>}
        <PinKeypad onPress={pressConfirm} theme={theme} />
        <button onClick={() => { setPin1(''); setPin2(''); setStep('newpin'); }}
          className="mt-6 text-xs underline" style={{ color: theme.muted }}>Recommencer</button>
      </div>
    </ThemedScreen>
  );
}

// ── PinEntry — Écran de saisie PIN ────────────────────────────────────────────
// verifyPin → appelle le backend → compare avec hash BDD → reçoit pinSessionToken
// AUCUNE comparaison locale, AUCUN hash en localStorage

export function PinEntry({ onSuccess }) {
  const { verifyPin } = useAdmin();
  const { theme } = useTheme();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);

  if (forgot) return (
    <ForgotPinFlow theme={theme}
      onBack={() => setForgot(false)}
      onSuccess={() => {
        setForgot(false);
        setErr('Nouveau PIN crée ! Saisissez-le.');
        setPin(''); setAttempts(0); setLocked(false);
      }}
    />
  );

  if (locked) return (
    <ThemedScreen theme={theme}>
      <div className="w-full max-w-xs text-center">
        <div className="w-20 h-20 rounded-[28px] flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: theme.text }}>Accès bloqué</h2>
        <p className="text-sm mb-6" style={{ color: theme.muted }}>Trop de tentatives échouées. L'administrateur a été notifié.</p>
        <button onClick={() => setForgot(true)} className="w-full py-4 rounded-2xl font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #6c63ff, #3ec6e0)' }}>
          Réinitialiser le PIN
        </button>
      </div>
    </ThemedScreen>
  );

  const press = async (k) => {
    if (busy) return;
    if (k === '⌫') { setPin(p => p.slice(0,-1)); setErr(''); return; }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next); setErr('');

    if (next.length === 4) {
      setBusy(true);
      await new Promise(r => setTimeout(r, 80));

      // ✅ Vérification 100% backend — compare avec hash en BDD
      const ok = await verifyPin(next);

      if (ok) {
        setAttempts(0);
        onSuccess?.();
      } else {
        const na = attempts + 1; setAttempts(na);
        setShake(true);
        if (na >= 3) {
          try { await api.notifyPinLockout(); } catch {}
          setLocked(true);
        } else {
          setErr(`Code incorrect (${na}/3)`);
        }
        setTimeout(() => { setPin(''); setShake(false); setBusy(false); }, 700);
      }
    }
  };

  return (
    <ThemedScreen theme={theme}>
      <div className="w-full max-w-xs text-center px-4">
        <div className="w-20 h-20 rounded-[28px] flex items-center justify-center mx-auto mb-6"
          style={{ background: 'linear-gradient(135deg, #6c63ff 0%, #3ec6e0 100%)', boxShadow: '0 20px 60px rgba(108,99,255,0.4)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: theme.text }}>Espace Admin</h1>
        <p className="text-sm mb-2" style={{ color: theme.muted }}>Code PIN requis</p>
        <PinDots count={pin.length} shake={shake} theme={theme} />
        <p className="text-sm font-medium mb-5 h-4" style={{ color: err ? '#f87171' : 'transparent' }}>{err || '·'}</p>
        <PinKeypad onPress={press} theme={theme} />
        <button onClick={() => setForgot(true)} className="mt-8 text-sm underline" style={{ color: theme.muted }}>
          Code oublié ?
        </button>
      </div>
    </ThemedScreen>
  );
}

// ── PinSetup — Création du PIN ────────────────────────────────────────────────
// onDone(pin) → appelé avec le PIN confirmé
// Le parent doit appeler changePin(pin) de useAdmin → sauvegarde en BDD

export function PinSetup({ onDone, title = 'Creer votre code PIN' }) {
  const { theme } = useTheme();
  const [step, setStep] = useState('enter');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);

  const isEnter = step === 'enter';
  const cur = isEnter ? pin1 : pin2;
  const setCur = isEnter ? setPin1 : setPin2;

  const press = async (k) => {
    if (k === '⌫') { setCur(p => p.slice(0,-1)); setErr(''); return; }
    if (cur.length >= 4) return;
    const next = cur + k; setCur(next); setErr('');
    if (next.length === 4) {
      if (step === 'enter') { setTimeout(() => setStep('confirm'), 200); }
      else {
        if (next === pin1) {
          // ✅ onDone reçoit le PIN → le parent appelle changePin → BDD
          await onDone(pin1);
        } else {
          setShake(true); setErr('Les codes ne correspondent pas');
          setTimeout(() => { setPin2(''); setPin1(''); setStep('enter'); setShake(false); setErr(''); }, 1000);
        }
      }
    }
  };

  const labels = {
    enter:   { h: title,             s: 'Choisissez 4 chiffres' },
    confirm: { h: 'Confirmer le code', s: 'Entrez votre code a nouveau' },
  };
  const { h, s } = labels[step];

  return (
    <ThemedScreen theme={theme}>
      <div className="w-full max-w-xs text-center px-4">
        <div className="w-20 h-20 rounded-[28px] flex items-center justify-center mx-auto mb-6"
          style={{ background: 'linear-gradient(135deg, #6c63ff 0%, #3ec6e0 100%)', boxShadow: '0 20px 60px rgba(108,99,255,0.4)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: theme.text }}>{h}</h1>
        <p className="text-sm mt-1 mb-4" style={{ color: theme.muted }}>{s}</p>
        <div className="flex justify-center gap-2 mt-2">
          <div className="w-8 h-1 rounded-full" style={{ background: 'linear-gradient(90deg, #6c63ff, #3ec6e0)' }} />
          <div className="w-8 h-1 rounded-full transition-all" style={{ background: step === 'confirm' ? 'linear-gradient(90deg, #6c63ff, #3ec6e0)' : theme.border }} />
        </div>
        <PinDots count={cur.length} shake={shake} theme={theme} />
        <p className="text-sm font-medium mb-5 h-4" style={{ color: err ? '#f87171' : 'transparent' }}>{err || '·'}</p>
        <PinKeypad onPress={press} theme={theme} />
        {step === 'confirm' && (
          <button onClick={() => { setStep('enter'); setPin1(''); setPin2(''); setErr(''); }}
            className="mt-8 text-sm underline" style={{ color: theme.muted }}>Recommencer</button>
        )}
      </div>
    </ThemedScreen>
  );
}