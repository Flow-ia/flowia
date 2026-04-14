// components/EmployeePinModal.jsx
//
// Modal de saisie du PIN employé avant une action sensible.
// S'utilise comme une "gate" : on lui passe l'employé et une callback onSuccess.
//
// Usage :
//   <EmployeePinModal
//     open={showPinModal}
//     employee={selectedEmployee}          // { id, name, avatar_color }
//     actionLabel="Encaisser le paiement"  // texte descriptif de l'action
//     onSuccess={() => proceedWithAction()}
//     onCancel={() => setShowPinModal(false)}
//   />

import { useState, useEffect, useCallback } from 'react';
import { useEmployeePin } from '../hooks/useEmployeePin';
import { useTheme } from '../hooks/useTheme';

// ── Mini clavier numérique ─────────────────────────────────────────────────────
function PinKeypad({ onPress, theme }) {
  const isDark = theme.mode === 'dark';
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
      {keys.map((k, i) => (
        k === '' ? <div key={i} /> : (
          <button
            key={k + i}
            onClick={() => onPress(k)}
            className="h-[58px] rounded-2xl text-xl font-medium select-none transition-all active:scale-90"
            style={{
              background: k === '⌫'
                ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)')
                : (isDark ? 'rgba(255,255,255,0.07)' : '#ffffff'),
              border: `1px solid ${theme.border}`,
              color: k === '⌫' ? theme.muted : theme.text,
              boxShadow: isDark ? 'none' : '0 2px 6px rgba(0,0,0,0.06)',
            }}
          >
            {k}
          </button>
        )
      ))}
    </div>
  );
}

// ── Points PIN ────────────────────────────────────────────────────────────────
function PinDots({ count, shake, theme }) {
  const isDark = theme.mode === 'dark';
  return (
    <div className={`flex justify-center gap-4 my-5 ${shake ? 'animate-shake' : ''}`}>
      {[0,1,2,3].map(i => (
        <div
          key={i}
          className="transition-all duration-200"
          style={{
            width: 13, height: 13, borderRadius: '50%',
            background: i < count
              ? 'linear-gradient(135deg, #111827, #374151)'
              : 'transparent',
            border: i < count
              ? 'none'
              : `2px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`,
            transform: i < count ? 'scale(1.2)' : 'scale(1)',
            boxShadow: i < count ? '0 0 8px rgba(17,24,39,0.6)' : 'none',
          }}
        />
      ))}
    </div>
  );
}

// ── Modal principal ───────────────────────────────────────────────────────────
export function EmployeePinModal({ open, employee, actionLabel, onSuccess, onCancel }) {
  const { verifyPin } = useEmployeePin();
  const { theme } = useTheme();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const isDark = theme.mode === 'dark';

  // Reset à chaque ouverture
  useEffect(() => {
    if (open) {
      setPin('');
      setErr('');
      setShake(false);
      setBusy(false);
      setAttempts(0);
    }
  }, [open]);

  const press = useCallback(async (k) => {
    if (busy) return;

    if (k === '⌫') {
      setPin(p => p.slice(0, -1));
      setErr('');
      return;
    }
    if (pin.length >= 4) return;

    const next = pin + k;
    setPin(next);
    setErr('');

    if (next.length === 4) {
      setBusy(true);
      await new Promise(r => setTimeout(r, 80));

      const result = await verifyPin(employee.id, next);

      if (result.success) {
        setAttempts(0);
        onSuccess?.();
      } else {
        const na = attempts + 1;
        setAttempts(na);
        setShake(true);
        const remaining = 3 - na;
        if (remaining <= 0) {
          setErr('Trop de tentatives. Action annulee.');
          setTimeout(() => { onCancel?.(); }, 1500);
        } else {
          setErr(`Code incorrect (${na}/3)`);
          setTimeout(() => {
            setPin('');
            setShake(false);
            setBusy(false);
          }, 700);
        }
      }
    }
  }, [busy, pin, attempts, employee, verifyPin, onSuccess, onCancel]);

  if (!open || !employee) return null;

  const initials = employee.name?.charAt(0).toUpperCase() || '?';

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl pb-8 pt-6 px-5 relative"
        style={{
          background: theme.card,
          border: `1px solid ${theme.border}`,
          boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
        }}
      >
        {/* Drag indicator (mobile) */}
        <div className="w-10 h-1 rounded-full mx-auto mb-5 sm:hidden"
          style={{ background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }} />

        {/* Bouton fermer */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: theme.muted }}
        >
          ✕
        </button>

        {/* Avatar employé */}
        <div className="flex flex-col items-center mb-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mb-3"
            style={{
              backgroundColor: employee.avatar_color || '#111827',
              boxShadow: `0 8px 24px ${employee.avatar_color || '#111827'}55`,
            }}
          >
            {initials}
          </div>
          <p className="font-bold text-base" style={{ color: theme.text }}>{employee.name}</p>
          {actionLabel && (
            <p className="text-xs mt-1 px-3 py-1 rounded-full" style={{
              background: isDark ? 'rgba(17,24,39,0.12)' : 'rgba(17,24,39,0.08)',
              color: '#111827',
              border: '1px solid rgba(17,24,39,0.2)',
            }}>
              {actionLabel}
            </p>
          )}
        </div>

        <p className="text-center text-sm mb-1" style={{ color: theme.muted }}>
          Code PIN requis pour valider
        </p>

        <PinDots count={pin.length} shake={shake} theme={theme} />

        <p
          className="text-xs font-medium text-center mb-4 h-4"
          style={{ color: err ? '#f87171' : 'transparent' }}
        >
          {err || '·'}
        </p>

        <PinKeypad onPress={press} theme={theme} />

        <button
          onClick={onCancel}
          className="w-full mt-5 py-3 rounded-2xl text-sm font-medium transition-all"
          style={{
            background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
            color: theme.muted,
            border: `1px solid ${theme.border}`,
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Hook utilitaire : withEmployeePin ─────────────────────────────────────────
// Wrapper pour déclencher le modal avant une action.
// Retourne { requestPin, PinModalNode }
//
// Usage dans un composant :
//   const { requestPin, PinModalNode } = useEmployeePinGate();
//   ...
//   await requestPin(employee, 'Encaisser le paiement', async () => {
//     // action à exécuter après validation PIN
//   });
//   ...
//   return <>{PinModalNode}{/* reste du composant */}</>

export function useEmployeePinGate() {
  const { requiresPin, isSessionValid } = useEmployeePin();
  const [modal, setModal] = useState(null); // null | { employee, actionLabel, resolve }

  const requestPin = useCallback(async (employee, actionLabel, action) => {
    if (!employee?.id) {
      await action();
      return;
    }

    // L'employé a-t-il un PIN actif ?
    const needs = await requiresPin(employee.id);
    if (!needs) {
      await action();
      return;
    }

    // La session est-elle déjà valide ?
    const valid = await isSessionValid(employee.id);
    if (valid) {
      await action();
      return;
    }

    // Afficher le modal et attendre la réponse
    await new Promise((resolve) => {
      setModal({ employee, actionLabel, resolve, action });
    });
  }, [requiresPin, isSessionValid]);

  const handleSuccess = useCallback(async () => {
    const current = modal;
    setModal(null);
    if (current?.action) await current.action();
    current?.resolve?.();
  }, [modal]);

  const handleCancel = useCallback(() => {
    const current = modal;
    setModal(null);
    current?.resolve?.();
  }, [modal]);

  const PinModalNode = modal ? (
    <EmployeePinModal
      open={true}
      employee={modal.employee}
      actionLabel={modal.actionLabel}
      onSuccess={handleSuccess}
      onCancel={handleCancel}
    />
  ) : null;

  return { requestPin, PinModalNode };
}
