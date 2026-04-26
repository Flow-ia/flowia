// components/LockScreen.jsx — Overlay de déverrouillage du mode veille (commit 31).
//
// Affiché quand `useIdleLock().locked === true`. L'utilisateur peut :
//   • choisir un employé (avec PIN actif) → saisir le PIN employé → unlock
//   • cliquer "Accès admin" → saisir le PIN admin → unlock
//   • cliquer "Déconnexion" → clear tokens + redirect /login
//
// Verrouille tout (position fixed plein écran, zIndex max). Aucun clic
// ne traverse vers l'app derrière.

import { useEffect, useState } from 'react';
import { useIdleLock } from '../hooks/useIdleLock';
import { api } from '../utils/api';

const C = {
  overlay: 'rgba(15, 23, 42, 0.96)',
  card: '#fff',
  border: '0.5px solid #e5e7eb',
  text: '#111827',
  muted: '#6b7280',
  errText: '#991b1b',
  errBg: '#fef2f2',
  errBorder: '#fecaca',
};

export default function LockScreen() {
  const { locked, unlock } = useIdleLock();
  const [employees, setEmployees] = useState([]);
  const [step, setStep] = useState('list'); // 'list' | 'pin-employee' | 'pin-admin'
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [now, setNow] = useState(() => new Date());

  // Tic-tac de l'horloge.
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [locked]);

  // Charge la liste des employés actifs au montage. On affiche tous les
  // employés actifs : ceux sans PIN seront simplement bloqués au moment du
  // verifyPin (back retournera invalid). Plus simple que de pré-filtrer.
  useEffect(() => {
    if (!locked) return;
    setStep('list'); setPin(''); setErr(null); setSelected(null);
    api.getEmployees()
      .then(emps => {
        const list = (emps || []).filter(e => e.is_active !== false);
        setEmployees(list);
      })
      .catch(() => setEmployees([]));
  }, [locked]);

  if (!locked) return null;

  function handleSelectEmployee(emp) {
    setSelected(emp);
    setStep('pin-employee');
    setPin('');
    setErr(null);
  }

  function handleAdmin() {
    setSelected(null);
    setStep('pin-admin');
    setPin('');
    setErr(null);
  }

  function handleBack() {
    setStep('list');
    setPin('');
    setErr(null);
    setSelected(null);
  }

  async function submitEmployeePin() {
    if (!selected || pin.length < 4) return;
    setBusy(true); setErr(null);
    try {
      const data = await api.verifyEmployeePin(selected.id, { pin });
      if (!data.valid) {
        setErr(data.error || 'PIN incorrect.');
        setPin('');
        return;
      }
      unlock();
    } catch (e) {
      setErr(e.message || 'Erreur réseau, réessayez.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  async function submitAdminPin() {
    if (pin.length < 4) return;
    setBusy(true); setErr(null);
    try {
      const data = await api.pinVerify({ pin });
      if (!data.valid) {
        setErr('PIN admin incorrect.');
        setPin('');
        return;
      }
      // Stocker la session PIN admin pour rétrocompat (certaines actions
      // sensibles l'attendent).
      try {
        if (data.pinSessionToken) {
          localStorage.setItem('ff_pin_token', data.pinSessionToken);
        }
      } catch {}
      unlock();
    } catch (e) {
      setErr(e.message || 'Erreur réseau, réessayez.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    try {
      localStorage.removeItem('ff_token');
      localStorage.removeItem('ff_pin_token');
      sessionStorage.removeItem('ff_app_locked');
    } catch {}
    window.location.href = '/login';
  }

  function onPinKey(digit) {
    if (busy) return;
    setErr(null);
    if (digit === '⌫') {
      setPin(p => p.slice(0, -1));
    } else if (digit === 'OK') {
      if (step === 'pin-employee') submitEmployeePin();
      else if (step === 'pin-admin') submitAdminPin();
    } else if (pin.length < 6) {
      setPin(p => p + digit);
    }
  }

  // Auto-submit après 4 chiffres pour le PIN employé/admin classique.
  useEffect(() => {
    if (pin.length === 4 && !busy) {
      if (step === 'pin-employee') submitEmployeePin();
      if (step === 'pin-admin') submitAdminPin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: C.overlay,
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      color: '#fff',
    }}>
      {/* Heure en grand au-dessus de la card */}
      <div style={{
        position: 'absolute', top: '8%', left: 0, right: 0,
        textAlign: 'center', pointerEvents: 'none',
      }}>
        <p style={{
          margin: 0, fontSize: 64, fontWeight: 200,
          fontFamily: 'monospace', letterSpacing: -2, color: '#fff',
        }}>
          {hh}:{mm}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize' }}>
          {dateLabel}
        </p>
      </div>

      {/* Card centrale */}
      <div style={{
        width: '100%', maxWidth: 440,
        background: C.card, border: C.border,
        borderRadius: 18, padding: '28px 24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        color: C.text,
      }}>
        {step === 'list' && (
          <>
            <h1 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 500, textAlign: 'center' }}>
              {"Application verrouillée"}
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.5 }}>
              {"Sélectionnez votre profil pour déverrouiller"}
            </p>

            {employees.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 18 }}>
                {employees.map(emp => (
                  <button key={emp.id} type="button" onClick={() => handleSelectEmployee(emp)}
                    style={{
                      padding: '14px 8px',
                      background: '#fafafa',
                      border: '0.5px solid #e5e7eb',
                      borderRadius: 12,
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 8,
                      fontFamily: 'inherit',
                      transition: 'background .15s, border-color .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.borderColor = '#9ca3af'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fafafa'; e.currentTarget.style.borderColor = '#e5e7eb'; }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: emp.avatar_color || '#6366f1',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 16, fontWeight: 500,
                    }}>
                      {emp.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 500, color: C.text, textAlign: 'center',
                      maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {emp.name}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ margin: '12px 0 18px', fontSize: 12, color: C.muted, textAlign: 'center' }}>
                {"Aucun employé avec PIN actif"}
              </p>
            )}

            <button type="button" onClick={handleAdmin}
              style={{
                width: '100%', padding: '12px', borderRadius: 10,
                background: '#111827', color: '#fff', border: 'none',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit', marginBottom: 8,
              }}>
              {"Accès admin"}
            </button>

            <button type="button" onClick={handleLogout}
              style={{
                width: '100%', padding: '10px', borderRadius: 10,
                background: '#fff', color: C.errText,
                border: '0.5px solid #fecaca',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
              {"Déconnexion"}
            </button>
          </>
        )}

        {(step === 'pin-employee' || step === 'pin-admin') && (
          <>
            <button type="button" onClick={handleBack}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: C.muted, padding: 0, marginBottom: 12,
                fontFamily: 'inherit',
              }}>
              {"← Retour"}
            </button>

            {step === 'pin-employee' && selected && (
              <>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: selected.avatar_color || '#6366f1',
                  margin: '0 auto 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 22, fontWeight: 500,
                }}>
                  {selected.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 500, textAlign: 'center' }}>
                  {selected.name}
                </p>
                <p style={{ margin: '0 0 18px', fontSize: 12, color: C.muted, textAlign: 'center' }}>
                  {"Saisissez votre code PIN"}
                </p>
              </>
            )}

            {step === 'pin-admin' && (
              <>
                <p style={{ margin: '8px 0 4px', fontSize: 16, fontWeight: 500, textAlign: 'center' }}>
                  {"Accès admin"}
                </p>
                <p style={{ margin: '0 0 18px', fontSize: 12, color: C.muted, textAlign: 'center' }}>
                  {"Saisissez le PIN administrateur"}
                </p>
              </>
            )}

            {/* Pavé visuel des chiffres saisis */}
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 18,
            }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: pin.length > i ? C.text : '#e5e7eb',
                  transition: 'background .1s',
                }} />
              ))}
            </div>

            {err && (
              <div style={{
                padding: '8px 12px', borderRadius: 8, marginBottom: 14,
                background: C.errBg, color: C.errText,
                border: `0.5px solid ${C.errBorder}`,
                fontSize: 12, textAlign: 'center',
              }}>
                {err}
              </div>
            )}

            {/* Pavé numérique */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
            }}>
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
                d === '' ? <div key={i} /> : (
                  <button key={i} type="button" onClick={() => onPinKey(d)} disabled={busy}
                    style={{
                      padding: '14px',
                      borderRadius: 10,
                      background: '#fff',
                      border: '0.5px solid #e5e7eb',
                      fontSize: 18, fontWeight: 500,
                      color: C.text, cursor: busy ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: busy ? 0.5 : 1,
                    }}
                    onMouseEnter={e => !busy && (e.currentTarget.style.background = '#f3f4f6')}
                    onMouseLeave={e => !busy && (e.currentTarget.style.background = '#fff')}>
                    {d}
                  </button>
                )
              ))}
            </div>

            <button type="button" onClick={handleLogout}
              style={{
                width: '100%', padding: '10px', borderRadius: 10,
                background: 'transparent', color: C.muted,
                border: 'none',
                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit', marginTop: 14,
              }}>
              {"Se déconnecter complètement"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
