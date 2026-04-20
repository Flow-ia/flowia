import { useState, useEffect } from 'react';
import { api } from '../../../../utils/api';

export default function EmployeePinManager({ emp, onClose, showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const [pinStatus, setPinStatus] = useState(null);
  const [step, setStep] = useState('status');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [newPin, setNewPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getEmployeePinStatus(emp.id);
        if (!cancelled) setPinStatus(s);
      } catch { if (!cancelled) setPinStatus({ has_pin: false, is_active: false }); }
    })();
    return () => { cancelled = true; };
  }, [emp.id]);

  const pressPin = (k, cur, setCur, onFull) => {
    if (k === '⌫') { setCur(p => p.slice(0,-1)); setErr(''); return; }
    if (cur.length >= 4) return;
    const next = cur + k; setCur(next); setErr('');
    if (next.length === 4) setTimeout(() => onFull(next), 200);
  };

  const handleSetPin = async () => {
    setLoading(true); setErr('');
    try {
      await api.setEmployeePin(emp.id, { pin: newPin });
      setPinStatus({ has_pin: true, is_active: true });
      showToast('Code PIN crée !');
      setStep('status'); setPin1(''); setPin2(''); setNewPin('');
    } catch (e) { setErr(e.message || 'Erreur serveur'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await api.deleteEmployeePin(emp.id);
      setPinStatus({ has_pin: false, is_active: false });
      showToast('Code PIN supprime');
      setStep('status');
    } catch (e) { showToast('Erreur : ' + e.message); }
    finally { setLoading(false); }
  };

  const handleToggle = async () => {
    if (!pinStatus?.has_pin) return;
    setLoading(true);
    try {
      const res = await api.toggleEmployeePin(emp.id, { is_active: !pinStatus.is_active });
      setPinStatus(s => ({ ...s, is_active: res.is_active }));
      showToast(res.is_active ? 'PIN active' : 'PIN désactive');
    } catch (e) { showToast('Erreur : ' + e.message); }
    finally { setLoading(false); }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  const PinKeypad = ({ cur, setCur, onFull }) => (
    <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto mt-4">
      {keys.map((k, i) => (
        k === '' ? <div key={i}/> : (
          <button key={k+i} onClick={() => pressPin(k, cur, setCur, onFull)}
            className="h-[52px] rounded-xl text-lg font-medium select-none active:scale-90 transition-all"
            style={{
              background: k==='⌫' ? (isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)') : (isDark?'rgba(255,255,255,0.07)':'#fff'),
              border: `1px solid ${theme.border}`, color: k==='⌫'?theme.muted:theme.text,
              boxShadow: isDark?'none':'0 1px 4px rgba(0,0,0,0.06)',
            }}>{k}</button>
        )
      ))}
    </div>
  );

  const PinDots = ({ count }) => (
    <div className={`flex justify-center gap-4 my-4 ${shake ? 'animate-bounce' : ''}`}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{
          width:12, height:12, borderRadius:'50%',
          background: i<count ? (isDark?'#e6edf3':'#111827') : 'transparent',
          border: i<count ? 'none' : `2px solid ${isDark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.15)'}`,
          transform: i<count?'scale(1.2)':'scale(1)',
          transition: 'all 0.15s',
          boxShadow: i<count?'0 0 8px rgba(17,24,39,0.5)':'none',
        }}/>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl pb-8 pt-5 px-5 relative"
        style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow:'0 -8px 40px rgba(0,0,0,0.25)' }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4 sm:hidden" style={{ background: isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.1)' }}/>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-sm"
          style={{ background: isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)', color: theme.muted }}>✕</button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
            style={{ backgroundColor: emp.avatar_color||'#111827', boxShadow:`0 4px 14px ${emp.avatar_color||'#111827'}44` }}>
            {emp.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color:theme.text }}>{emp.name}</p>
            <p className="text-xs" style={{ color:theme.muted }}>Code PIN de sécurité</p>
          </div>
        </div>

        {step === 'status' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
              style={{ background: isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)', border:`1px solid ${theme.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: pinStatus?.has_pin ? (pinStatus?.is_active ? 'rgba(74,222,128,0.12)' : 'rgba(251,191,36,0.12)') : 'rgba(148,163,184,0.12)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={pinStatus?.has_pin ? (pinStatus?.is_active ? '#4ade80' : '#fbbf24') : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color:theme.text }}>
                    {pinStatus === null ? 'Chargement...' : pinStatus.has_pin ? 'Code PIN configure' : 'Aucun code PIN'}
                  </p>
                  <p className="text-xs" style={{ color: pinStatus?.has_pin ? (pinStatus?.is_active ? '#4ade80' : '#fbbf24') : theme.muted }}>
                    {pinStatus === null ? '' : pinStatus.has_pin ? (pinStatus.is_active ? '● Actif - requis pour chaque transaction' : '● Désactive') : 'Transactions sans validation'}
                  </p>
                </div>
              </div>
              {pinStatus?.has_pin && (
                <button onClick={handleToggle} disabled={loading}
                  className="w-11 h-6 rounded-full relative flex-shrink-0"
                  style={{ background: pinStatus.is_active ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: pinStatus.is_active ? '24px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }}/>
                </button>
              )}
            </div>

            <button onClick={() => { setStep('set_pin'); setPin1(''); setPin2(''); setNewPin(''); setErr(''); }}
              className="w-full py-3.5 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2"
              style={{ background: isDark?'#e6edf3':'#111827', color:isDark?'#111827':'white', boxShadow:'0 6px 20px rgba(17,24,39,0.3)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              {pinStatus?.has_pin ? 'Modifier le code PIN' : 'Creer un code PIN'}
            </button>

            {pinStatus?.has_pin && (
              <button onClick={() => setStep('confirm_delete')}
                className="w-full py-3 rounded-2xl text-sm font-medium"
                style={{ background:'rgba(248,113,113,0.08)', color:'#f87171', border:'1px solid rgba(248,113,113,0.2)' }}>
                Supprimer le code PIN
              </button>
            )}
          </div>
        )}

        {step === 'set_pin' && (
          <div className="text-center">
            <p className="font-bold text-base mb-1" style={{ color:theme.text }}>Nouveau code PIN</p>
            <p className="text-xs mb-2" style={{ color:theme.muted }}>Choisissez 4 chiffres pour {emp.name}</p>
            <PinDots count={pin1.length}/>
            {err && <p className="text-xs text-red-400 font-medium mb-1">{err}</p>}
            <PinKeypad cur={pin1} setCur={setPin1} onFull={(v) => { setNewPin(v); setStep('confirm_pin'); setPin2(''); }}/>
            <button onClick={() => { setStep('status'); setPin1(''); setErr(''); }} className="mt-4 text-xs underline" style={{ color:theme.muted }}>Annuler</button>
          </div>
        )}

        {step === 'confirm_pin' && (
          <div className="text-center">
            <p className="font-bold text-base mb-1" style={{ color:theme.text }}>Confirmer le code</p>
            <p className="text-xs mb-2" style={{ color:theme.muted }}>Entrez à nouveau le code PIN</p>
            <PinDots count={pin2.length}/>
            {err && <p className="text-xs text-red-400 font-medium mb-1">{err}</p>}
            <PinKeypad cur={pin2} setCur={setPin2} onFull={async (v) => {
              if (v === newPin) {
                await handleSetPin();
              } else {
                setShake(true);
                setErr('Les codes ne correspondent pas');
                setTimeout(() => { setPin2(''); setStep('confirm_pin'); setShake(false); setErr(''); }, 800);
              }
            }}/>
            <button onClick={() => { setStep('set_pin'); setPin1(''); setPin2(''); setErr(''); }} className="mt-4 text-xs underline" style={{ color:theme.muted }}>Recommencer</button>
          </div>
        )}

        {step === 'confirm_delete' && (
          <div className="text-center py-2">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.2)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <p className="font-bold text-base mb-2" style={{ color:theme.text }}>Supprimer le PIN ?</p>
            <p className="text-sm mb-5" style={{ color:theme.muted }}>{emp.name} pourra effectuer des transactions sans validation.</p>
            <div className="flex gap-2">
              <button onClick={() => setStep('status')} className="flex-1 py-3 rounded-2xl text-sm font-medium"
                style={{ background: isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)', color:theme.muted, border:`1px solid ${theme.border}` }}>
                Annuler
              </button>
              <button onClick={handleDelete} disabled={loading} className="flex-1 py-3 rounded-2xl text-sm font-bold text-white"
                style={{ background:'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                {loading ? '...' : 'Supprimer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
