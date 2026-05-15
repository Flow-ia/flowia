// src/components/PinGate.jsx
import { useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useTheme } from '../hooks/useTheme';
import { ThemeToggle } from './ThemeToggle';
import { api } from '../utils/api';
import { CodeInput } from './UI';

// ── Composants UI ─────────────────────────────────────────────────────────────

function PinDots({ count, shake, theme }) {
  return (
    <div
      className={shake ? 'shake' : ''}
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 18,
        margin: '28px 0',
      }}
    >
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: i < count ? theme.text : 'transparent',
            border: i < count ? 'none' : `0.5px solid ${theme.borderStrong}`,
            transition: 'background 0.15s, transform 0.15s',
            transform: i < count ? 'scale(1.1)' : 'scale(1)',
          }}
        />
      ))}
    </div>
  );
}

function PinKeypad({ onPress, theme }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 10,
      padding: '0 16px',
      maxWidth: 300,
      margin: '0 auto',
    }}>
      {keys.map((k, i) => k === '' ? <div key={i} /> : (
        <button
          key={k + i}
          type="button"
          onClick={() => onPress(k)}
          style={{
            height: 60,
            borderRadius: 12,
            fontSize: 22,
            fontWeight: 500,
            userSelect: 'none',
            transition: 'transform 0.1s',
            background: k === '⌫' ? 'transparent' : theme.card,
            border: `0.5px solid ${theme.border}`,
            color: k === '⌫' ? theme.muted : theme.text,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

function ThemedScreen({ children, theme }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 80,
      padding: '0 24px',
      position: 'relative',
      background: theme.bg,
    }}>
      <div style={{ position: 'absolute', top: 24, right: 20 }}>
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}

// ── Flux "code PIN oublié" ────────────────────────────────────────────────────

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
    } catch (e) { setErr(e.message || 'Erreur, verifiez votre email'); }
    finally { setLoading(false); }
  };

  const verifyCode = async () => {
    if (code.length !== 6) return;
    setLoading(true); setErr('');
    try {
      await api.pinForgotVerify({ email: email.trim(), code });
      setStep('newpin');
    } catch (e) { setErr(e.message || 'Code invalide'); setCode(''); }
    finally { setLoading(false); }
  };

  const pressNewPin = (k) => {
    if (k === '⌫') { setPin1(p => p.slice(0, -1)); return; }
    if (pin1.length >= 4) return;
    const next = pin1 + k; setPin1(next);
    if (next.length === 4) setTimeout(() => setStep('confirm'), 200);
  };

  const pressConfirm = async (k) => {
    if (k === '⌫') { setPin2(p => p.slice(0, -1)); return; }
    if (pin2.length >= 4) return;
    const next = pin2 + k; setPin2(next);
    if (next.length === 4) {
      if (next === pin1) {
        await changePin(pin1);
        onSuccess?.();
      } else {
        setShake(true); setErr('Les codes ne correspondent pas');
        setTimeout(() => { setPin1(''); setPin2(''); setStep('newpin'); setShake(false); setErr(''); }, 800);
      }
    }
  };

  const backBtn = (onClick) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        marginBottom: 24,
        color: theme.muted,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        fontFamily: 'inherit',
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      Retour
    </button>
  );

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 14,
    background: theme.inputBg,
    color: theme.text,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const primaryBtnStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: 8,
    fontWeight: 500,
    fontSize: 14,
    background: theme.text,
    color: theme.bg,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  if (step === 'email') return (
    <ThemedScreen theme={theme}>
      <div style={{ width: '100%', maxWidth: 320 }}>
        {backBtn(onBack)}
        <h2 style={{ fontSize: 22, fontWeight: 500, textAlign: 'center', color: theme.text, margin: '0 0 6px' }}>
          Code oublie ?
        </h2>
        <p style={{ textAlign: 'center', fontSize: 13, color: theme.muted, margin: '0 0 24px', lineHeight: 1.5 }}>
          Entrez votre email pour recevoir un code de reinitialisation
        </p>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendCode()}
          placeholder="votre@email.com"
          style={{
            ...inputStyle,
            border: `0.5px solid ${err ? 'rgba(239,68,68,0.5)' : theme.borderInput}`,
            marginBottom: 12,
          }}
        />
        {err && (
          <p style={{ fontSize: 11, color: '#991b1b', textAlign: 'center', marginBottom: 12, fontWeight: 500 }}>
            {err}
          </p>
        )}
        <button
          type="button"
          onClick={sendCode}
          disabled={!email.trim() || loading}
          style={{ ...primaryBtnStyle, opacity: !email.trim() || loading ? 0.4 : 1 }}
        >
          {loading ? 'Envoi...' : 'Envoyer le code'}
        </button>
      </div>
    </ThemedScreen>
  );

  if (step === 'otp') return (
    <ThemedScreen theme={theme}>
      <div style={{ width: '100%', maxWidth: 320 }}>
        {backBtn(() => { setStep('email'); setCode(''); })}
        <h2 style={{ fontSize: 22, fontWeight: 500, textAlign: 'center', color: theme.text, margin: '0 0 6px' }}>
          Verification
        </h2>
        <p style={{ textAlign: 'center', fontSize: 13, color: theme.muted, margin: '0 0 24px', lineHeight: 1.5 }}>
          Code envoye a <span style={{ fontWeight: 500, color: theme.text }}>{masked}</span>
        </p>
        <CodeInput value={code} onChange={setCode} theme={theme} />
        {err && (
          <p style={{ fontSize: 11, color: '#991b1b', textAlign: 'center', marginTop: 12, fontWeight: 500 }}>
            {err}
          </p>
        )}
        <button
          type="button"
          onClick={verifyCode}
          disabled={code.length !== 6 || loading}
          style={{ ...primaryBtnStyle, opacity: code.length !== 6 || loading ? 0.4 : 1, marginTop: 20 }}
        >
          {loading ? 'Verification...' : 'Confirmer'}
        </button>
        <button
          type="button"
          onClick={sendCode}
          style={{
            width: '100%',
            marginTop: 12,
            fontSize: 12,
            textAlign: 'center',
            color: theme.muted,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'inherit',
          }}
        >
          Renvoyer le code
        </button>
      </div>
    </ThemedScreen>
  );

  if (step === 'newpin') return (
    <ThemedScreen theme={theme}>
      <div style={{ width: '100%', maxWidth: 320, textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: theme.text, margin: '0 0 6px' }}>
          Nouveau code PIN
        </h2>
        <p style={{ fontSize: 13, color: theme.muted, margin: 0 }}>Choisissez 4 chiffres</p>
        <PinDots count={pin1.length} shake={false} theme={theme} />
        <PinKeypad onPress={pressNewPin} theme={theme} />
      </div>
    </ThemedScreen>
  );

  return (
    <ThemedScreen theme={theme}>
      <div style={{ width: '100%', maxWidth: 320, textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: theme.text, margin: '0 0 6px' }}>
          Confirmer le code
        </h2>
        <p style={{ fontSize: 13, color: theme.muted, margin: 0 }}>Entrez a nouveau votre code</p>
        <PinDots count={pin2.length} shake={shake} theme={theme} />
        {err && (
          <p style={{ fontSize: 12, color: '#991b1b', fontWeight: 500, marginBottom: 8 }}>{err}</p>
        )}
        <PinKeypad onPress={pressConfirm} theme={theme} />
        <button
          type="button"
          onClick={() => { setPin1(''); setPin2(''); setStep('newpin'); }}
          style={{
            marginTop: 24,
            fontSize: 12,
            color: theme.muted,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'inherit',
          }}
        >
          Recommencer
        </button>
      </div>
    </ThemedScreen>
  );
}

// ── PinEntry — Ecran de saisie PIN ────────────────────────────────────────────

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
    <ForgotPinFlow
      theme={theme}
      onBack={() => setForgot(false)}
      onSuccess={() => {
        setForgot(false);
        setErr('Nouveau PIN cree ! Saisissez-le.');
        setPin(''); setAttempts(0); setLocked(false);
      }}
    />
  );

  if (locked) return (
    <ThemedScreen theme={theme}>
      <div style={{ width: '100%', maxWidth: 320, textAlign: 'center' }}>
        <div style={{
          padding: '14px 16px',
          borderRadius: 8,
          background: '#fef2f2',
          borderLeft: '2px solid #ef4444',
          marginBottom: 20,
          textAlign: 'left',
        }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#991b1b' }}>
            Acces bloque
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#991b1b', lineHeight: 1.5 }}>
            Trop de tentatives echouees. L{"'"}administrateur a ete notifie.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setForgot(true)}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 8,
            fontWeight: 500,
            fontSize: 14,
            background: theme.text,
            color: theme.bg,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Reinitialiser le PIN
        </button>
      </div>
    </ThemedScreen>
  );

  const press = async (k) => {
    if (busy) return;
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setErr(''); return; }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next); setErr('');

    if (next.length === 4) {
      setBusy(true);
      await new Promise(r => setTimeout(r, 80));

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
      <div style={{ width: '100%', maxWidth: 320, textAlign: 'center', padding: '0 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: theme.text, margin: '0 0 4px' }}>
          Espace admin
        </h1>
        <p style={{ fontSize: 13, color: theme.muted, margin: 0 }}>Code PIN requis</p>
        <PinDots count={pin.length} shake={shake} theme={theme} />
        <p style={{
          fontSize: 12,
          fontWeight: 500,
          marginBottom: 20,
          height: 14,
          color: err ? '#991b1b' : 'transparent',
        }}>{err || '·'}</p>
        <PinKeypad onPress={press} theme={theme} />
        <button
          type="button"
          onClick={() => setForgot(true)}
          style={{
            marginTop: 32,
            fontSize: 13,
            color: theme.muted,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'inherit',
          }}
        >
          Code oublie ?
        </button>
      </div>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </ThemedScreen>
  );
}

// ── PinSetup — Creation du PIN ────────────────────────────────────────────────

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
    if (k === '⌫') { setCur(p => p.slice(0, -1)); setErr(''); return; }
    if (cur.length >= 4) return;
    const next = cur + k; setCur(next); setErr('');
    if (next.length === 4) {
      if (step === 'enter') { setTimeout(() => setStep('confirm'), 200); }
      else {
        if (next === pin1) {
          await onDone(pin1);
        } else {
          setShake(true); setErr('Les codes ne correspondent pas');
          setTimeout(() => { setPin2(''); setPin1(''); setStep('enter'); setShake(false); setErr(''); }, 1000);
        }
      }
    }
  };

  const labels = {
    enter:   { h: title,              s: 'Choisissez 4 chiffres' },
    confirm: { h: 'Confirmer le code', s: 'Entrez votre code a nouveau' },
  };
  const { h, s } = labels[step];

  return (
    <ThemedScreen theme={theme}>
      <div style={{ width: '100%', maxWidth: 320, textAlign: 'center', padding: '0 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: theme.text, margin: '0 0 4px' }}>{h}</h1>
        <p style={{ fontSize: 13, color: theme.muted, margin: '0 0 16px' }}>{s}</p>

        {/* Barre de progression 2 etapes */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6 }}>
          <div style={{ width: 32, height: 2, borderRadius: 99, background: theme.text }} />
          <div style={{ width: 32, height: 2, borderRadius: 99, background: step === 'confirm' ? theme.text : theme.border }} />
        </div>

        <PinDots count={cur.length} shake={shake} theme={theme} />
        <p style={{
          fontSize: 12,
          fontWeight: 500,
          marginBottom: 20,
          height: 14,
          color: err ? '#991b1b' : 'transparent',
        }}>{err || '·'}</p>
        <PinKeypad onPress={press} theme={theme} />
        {/* Zone "Recommencer" : conteneur de hauteur fixe pour eviter que
            le keypad/dots ne se decale entre l'etape 'enter' et 'confirm'.
            En etape 'enter', le bouton existe mais est invisible (visibility
            hidden) → meme hauteur, layout stable, le commercant retrouve
            ses repere visuels quand il saisit son code une 2e fois. */}
        <div style={{ height: 32, marginTop: 32, display: 'flex',
                      justifyContent: 'center', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => { setStep('enter'); setPin1(''); setPin2(''); setErr(''); }}
            disabled={step !== 'confirm'}
            style={{
              fontSize: 13,
              color: theme.muted,
              background: 'none',
              border: 'none',
              cursor: step === 'confirm' ? 'pointer' : 'default',
              textDecoration: 'underline',
              fontFamily: 'inherit',
              visibility: step === 'confirm' ? 'visible' : 'hidden',
              padding: 0,
            }}
          >
            Recommencer
          </button>
        </div>
      </div>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </ThemedScreen>
  );
}
