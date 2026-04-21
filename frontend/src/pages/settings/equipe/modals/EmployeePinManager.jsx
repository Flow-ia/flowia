import { useState, useEffect } from 'react';
import { api } from '../../../../utils/api';
import { I } from '../../../../utils/icons';
import { Button } from '../../../../components/primitives';

export default function EmployeePinManager({ emp, onClose, showToast, theme }) {
  const t = theme;
  const [pinStatus, setPinStatus] = useState(null);
  const [step, setStep]     = useState('status');
  const [pin1, setPin1]     = useState('');
  const [pin2, setPin2]     = useState('');
  const [newPin, setNewPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState('');
  const [shake, setShake]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getEmployeePinStatus(emp.id);
        if (!cancelled) setPinStatus(s);
      } catch {
        if (!cancelled) setPinStatus({ has_pin:false, is_active:false });
      }
    })();
    return () => { cancelled = true; };
  }, [emp.id]);

  const pressPin = (k, cur, setCur, onFull) => {
    if (k === '⌫') { setCur(p => p.slice(0, -1)); setErr(''); return; }
    if (cur.length >= 4) return;
    const next = cur + k; setCur(next); setErr('');
    if (next.length === 4) setTimeout(() => onFull(next), 200);
  };

  const handleSetPin = async () => {
    setLoading(true); setErr('');
    try {
      await api.setEmployeePin(emp.id, { pin: newPin });
      setPinStatus({ has_pin:true, is_active:true });
      showToast('Code PIN cree');
      setStep('status'); setPin1(''); setPin2(''); setNewPin('');
    } catch (e) { setErr(e.message || 'Erreur serveur'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await api.deleteEmployeePin(emp.id);
      setPinStatus({ has_pin:false, is_active:false });
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
      showToast(res.is_active ? 'PIN active' : 'PIN desactive');
    } catch (e) { showToast('Erreur : ' + e.message); }
    finally { setLoading(false); }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  const PinKeypad = ({ cur, setCur, onFull }) => (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8,
                  maxWidth:240, margin:'16px auto 0' }}>
      {keys.map((k, i) => (
        k === '' ? <div key={i}/> : (
          <button key={k + i} onClick={() => pressPin(k, cur, setCur, onFull)}
                  style={{ height:50, borderRadius:12, fontSize:18, fontWeight:500,
                           userSelect:'none', cursor:'pointer',
                           border:`0.5px solid ${t.border}`,
                           background: k === '⌫' ? t.cardAlt : t.card,
                           color: k === '⌫' ? t.muted : t.text,
                           boxShadow:t.shadowSm,
                           transition:'transform 0.1s ease',
                           fontFamily:'inherit' }}
                  onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.94)'; }}
                  onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
            {k}
          </button>
        )
      ))}
    </div>
  );

  const PinDots = ({ count }) => (
    <div style={{ display:'flex', justifyContent:'center', gap:14, margin:'16px 0',
                  animation: shake ? 'shake 0.4s ease' : 'none' }}>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          width:12, height:12, borderRadius:'50%',
          background: i < count ? t.text : t.separator,
          transition:'all 0.2s',
          transform: i < count ? 'scale(1.15)' : 'scale(1)',
        }}/>
      ))}
    </div>
  );

  // Toggle sobre (PIN actif)
  const StatusToggle = ({ on, onChange }) => (
    <button onClick={onChange}
            style={{ width:40, height:22, borderRadius:99,
                     position:'relative', flexShrink:0,
                     border:'none', cursor:'pointer',
                     background: on ? '#065f46' : t.cardAlt,
                     transition:'background 0.2s',
                     fontFamily:'inherit' }}>
      <div style={{ width:18, height:18, borderRadius:'50%',
                    background:'white',
                    position:'absolute', top:2,
                    left: on ? 20 : 2,
                    transition:'left 0.15s',
                    boxShadow:'0 1px 2px rgba(0,0,0,0.15)' }}/>
    </button>
  );

  return (
    <div style={{ position:'fixed', inset:0, zIndex:50,
                  display:'flex', alignItems:'flex-end', justifyContent:'center',
                  background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}
         className="sm:items-center">
      <div style={{ width:'100%', maxWidth:400, padding:'20px 20px 28px',
                    borderRadius:'16px 16px 0 0', position:'relative',
                    background:t.elevated,
                    border:`0.5px solid ${t.border}`,
                    boxShadow:t.shadowModal }}
           className="sm:rounded-2xl">
        <button onClick={onClose}
                style={{ position:'absolute', top:14, right:14,
                         width:28, height:28, borderRadius:'50%',
                         display:'flex', alignItems:'center', justifyContent:'center',
                         background:t.cardAlt, color:t.muted, fontSize:14,
                         border:'none', cursor:'pointer', fontFamily:'inherit' }}>×</button>

        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
          <div style={{ width:42, height:42, borderRadius:8, flexShrink:0,
                        backgroundColor: emp.avatar_color || t.text,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        color:'white', fontWeight:500, fontSize:17 }}>
            {emp.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p style={{ fontSize:14, fontWeight:500, color:t.text, margin:0 }}>{emp.name}</p>
            <p style={{ fontSize:12, color:t.muted, margin:0 }}>Code PIN de securite</p>
          </div>
        </div>

        {step === 'status' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                          padding:'12px 14px', borderRadius:12,
                          background:t.cardAlt,
                          border:`0.5px solid ${t.border}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:34, height:34, borderRadius:8,
                              background: pinStatus?.has_pin
                                ? (pinStatus?.is_active ? '#f0fdf4' : '#fffbeb')
                                : t.cardAlt,
                              display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <I.Lock style={{ width:14, height:14,
                                   color: pinStatus?.has_pin
                                     ? (pinStatus?.is_active ? '#065f46' : '#92400e')
                                     : t.muted }}/>
                </div>
                <div>
                  <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>
                    {pinStatus === null ? 'Chargement...'
                      : pinStatus.has_pin ? 'Code PIN configure' : 'Aucun code PIN'}
                  </p>
                  <p style={{ fontSize:11, margin:0,
                              color: pinStatus?.has_pin
                                ? (pinStatus?.is_active ? '#065f46' : '#92400e')
                                : t.muted }}>
                    {pinStatus === null ? ''
                      : pinStatus.has_pin
                        ? (pinStatus.is_active
                            ? 'Actif — requis pour chaque transaction'
                            : 'Desactive')
                        : 'Transactions sans validation'}
                  </p>
                </div>
              </div>
              {pinStatus?.has_pin && (
                <StatusToggle on={pinStatus.is_active} onChange={handleToggle}/>
              )}
            </div>

            <Button variant="primary" fullWidth type="button"
                    onClick={() => { setStep('set_pin'); setPin1(''); setPin2(''); setNewPin(''); setErr(''); }}>
              <I.Key style={{ width:14, height:14, marginRight:6 }}/>
              {pinStatus?.has_pin ? 'Modifier le code PIN' : 'Creer un code PIN'}
            </Button>

            {pinStatus?.has_pin && (
              <Button variant="danger" fullWidth type="button" onClick={() => setStep('confirm_delete')}>
                Supprimer le code PIN
              </Button>
            )}
          </div>
        )}

        {step === 'set_pin' && (
          <div style={{ textAlign:'center' }}>
            <p style={{ fontSize:15, fontWeight:500, color:t.text, margin:'0 0 4px' }}>Nouveau code PIN</p>
            <p style={{ fontSize:12, color:t.muted, margin:'0 0 8px' }}>Choisissez 4 chiffres pour {emp.name}</p>
            <PinDots count={pin1.length}/>
            {err && <p style={{ fontSize:12, color:'#991b1b', fontWeight:500, margin:'0 0 4px' }}>{err}</p>}
            <PinKeypad cur={pin1} setCur={setPin1}
                       onFull={(v) => { setNewPin(v); setStep('confirm_pin'); setPin2(''); }}/>
            <button onClick={() => { setStep('status'); setPin1(''); setErr(''); }}
                    style={{ marginTop:16, fontSize:12, color:t.muted,
                             background:'none', border:'none', cursor:'pointer',
                             textDecoration:'underline', fontFamily:'inherit' }}>
              Annuler
            </button>
          </div>
        )}

        {step === 'confirm_pin' && (
          <div style={{ textAlign:'center' }}>
            <p style={{ fontSize:15, fontWeight:500, color:t.text, margin:'0 0 4px' }}>Confirmer le code</p>
            <p style={{ fontSize:12, color:t.muted, margin:'0 0 8px' }}>Entrez a nouveau le code PIN</p>
            <PinDots count={pin2.length}/>
            {err && <p style={{ fontSize:12, color:'#991b1b', fontWeight:500, margin:'0 0 4px' }}>{err}</p>}
            <PinKeypad cur={pin2} setCur={setPin2}
                       onFull={async (v) => {
                         if (v === newPin) {
                           await handleSetPin();
                         } else {
                           setShake(true);
                           setErr('Les codes ne correspondent pas');
                           setTimeout(() => { setPin2(''); setStep('confirm_pin'); setShake(false); setErr(''); }, 800);
                         }
                       }}/>
            <button onClick={() => { setStep('set_pin'); setPin1(''); setPin2(''); setErr(''); }}
                    style={{ marginTop:16, fontSize:12, color:t.muted,
                             background:'none', border:'none', cursor:'pointer',
                             textDecoration:'underline', fontFamily:'inherit' }}>
              Recommencer
            </button>
          </div>
        )}

        {step === 'confirm_delete' && (
          <div style={{ textAlign:'center', padding:'8px 0' }}>
            <div style={{ width:52, height:52, borderRadius:12,
                          background:'#fef2f2',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          margin:'0 auto 16px' }}>
              <I.Trash style={{ width:24, height:24, color:'#991b1b' }}/>
            </div>
            <p style={{ fontSize:15, fontWeight:500, color:t.text, margin:'0 0 8px' }}>Supprimer le PIN ?</p>
            <p style={{ fontSize:13, color:t.muted, margin:'0 0 20px' }}>
              {emp.name} pourra effectuer des transactions sans validation.
            </p>
            <div style={{ display:'flex', gap:8 }}>
              <Button variant="secondary" type="button" onClick={() => setStep('status')} style={{ flex:1 }}>
                Annuler
              </Button>
              <button onClick={handleDelete} disabled={loading}
                      style={{ flex:1, padding:'10px', borderRadius:8, border:'none', cursor:'pointer',
                               background:'#991b1b', color:'white',
                               fontWeight:500, fontSize:13, opacity: loading ? 0.7 : 1,
                               fontFamily:'inherit' }}>
                {loading ? '...' : 'Supprimer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
