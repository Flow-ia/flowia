// AdminPinModal — refonte FDS-2026 commit 16.
//
// Modale de saisie du PIN admin, look identique au PinAccessModal employé
// (cf. pages/Dashboard.jsx) pour cohérence UI : backdrop blur, modale flottante
// elevée, dots + keypad, bouton X. Remplace la modale custom du commit 15
// (qui rendait <PinEntry/> plein écran à l'intérieur, rendu visuellement cassé).
//
// Logique inchangée : useAdmin().verifyPin(pin) → POST /auth/pin/verify →
// stocke ff_pin_token (JWT 2h, scope='pin_session', userId vérifié back). 3
// tentatives avant lockout, lien « Code oublié » → flux ForgotPinFlow plein
// écran (PinGate.jsx) qui prend le relais.
import { useEffect, useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { api } from '../utils/api';

function PinDots({ count, shake, theme }) {
  return (
    <div className={shake ? 'shake' : ''}
         style={{ display:'flex', justifyContent:'center', gap:18, margin:'24px 0 8px' }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i}
             style={{ width:12, height:12, borderRadius:'50%',
                      background: i < count ? theme.text : 'transparent',
                      border: i < count ? 'none' : `0.5px solid ${theme.borderStrong}`,
                      transition:'background 0.15s, transform 0.15s',
                      transform: i < count ? 'scale(1.1)' : 'scale(1)' }}/>
      ))}
    </div>
  );
}

function PinKeypad({ onPress, theme }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10,
                  padding:'0 16px', maxWidth:300, margin:'0 auto' }}>
      {keys.map((k, i) => k === '' ? <div key={i}/> : (
        <button key={k + i} type="button" onClick={() => onPress(k)}
                style={{ height:56, borderRadius:12, fontSize:20, fontWeight:500,
                         userSelect:'none', transition:'transform 0.1s',
                         background: k === '⌫' ? 'transparent' : theme.card,
                         border: `0.5px solid ${theme.border}`,
                         color: k === '⌫' ? theme.muted : theme.text,
                         cursor:'pointer', fontFamily:'inherit' }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)'; }}
                onMouseUp={e   => { e.currentTarget.style.transform = 'scale(1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
          {k}
        </button>
      ))}
    </div>
  );
}

export default function AdminPinModal({
  open, onClose, onSuccess,
  theme,
  title = 'Espace admin',
  subtitle = 'Saisissez votre PIN admin',
  onForgotPin,
}) {
  const { verifyPin } = useAdmin();
  const t = theme;
  const [pin, setPin]           = useState('');
  const [err, setErr]           = useState('');
  const [shake, setShake]       = useState(false);
  const [busy, setBusy]         = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked]     = useState(false);

  useEffect(() => {
    if (open) {
      setPin(''); setErr(''); setShake(false); setBusy(false);
      setAttempts(0); setLocked(false);
    }
  }, [open]);

  const press = async (k) => {
    if (busy || locked) return;
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
        const na = attempts + 1; setAttempts(na); setShake(true);
        if (na >= 3) {
          try { await api.notifyPinLockout(); } catch {}
          setLocked(true);
          setErr('Trop de tentatives. Accès bloqué.');
        } else {
          setErr(`Code incorrect (${na}/3)`);
        }
        setTimeout(() => { setPin(''); setShake(false); setBusy(false); }, 700);
      }
    }
  };

  if (!open) return null;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1200,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:16,
                  background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)' }}
         onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={{ position:'relative', width:'100%', maxWidth:420, maxHeight:'92vh', overflowY:'auto',
                    borderRadius:12, padding:'24px 20px 28px',
                    background:t.elevated,
                    border:`0.5px solid ${t.border}`,
                    boxShadow:t.shadowModal }}>
        <button onClick={() => onClose?.()}
                style={{ position:'absolute', top:14, right:14, width:28, height:28,
                         borderRadius:'50%', display:'flex', alignItems:'center',
                         justifyContent:'center', border:'none', cursor:'pointer',
                         background:t.cardAlt, color:t.muted, fontSize:14,
                         fontFamily:'inherit' }}>
          ×
        </button>

        <p style={{ fontWeight:500, fontSize:15, color:t.text, margin:'0 0 4px',
                    textAlign:'center' }}>{title}</p>
        <p style={{ fontSize:13, color:t.muted, margin:'0 0 4px', textAlign:'center' }}>
          {subtitle}
        </p>

        <PinDots count={pin.length} shake={shake} theme={t}/>

        <p style={{ fontSize:12, fontWeight:500, textAlign:'center',
                    marginBottom:16, height:14,
                    color: err ? '#991b1b' : 'transparent' }}>
          {err || '·'}
        </p>

        <PinKeypad onPress={press} theme={t}/>

        {!locked && onForgotPin && (
          <button type="button" onClick={() => onForgotPin?.()}
                  style={{ width:'100%', marginTop:18, padding:8,
                           fontSize:12, color:t.muted,
                           background:'transparent', border:'none',
                           cursor:'pointer', textDecoration:'underline',
                           fontFamily:'inherit' }}>
            Code oublié ?
          </button>
        )}

        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
          }
          .shake { animation: shake 0.4s ease-in-out; }
        `}</style>
      </div>
    </div>
  );
}
