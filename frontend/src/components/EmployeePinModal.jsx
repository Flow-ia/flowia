// components/EmployeePinModal.jsx
//
// Modal de saisie du PIN employe avant une action sensible.

import { useState, useEffect, useCallback } from 'react';
import { useEmployeePin } from '../hooks/useEmployeePin';
import { useTheme } from '../hooks/useTheme';

// ── Mini clavier numerique ─────────────────────────────────────────────────────
function PinKeypad({ onPress, theme }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 8,
      maxWidth: 260,
      margin: '0 auto',
    }}>
      {keys.map((k, i) => k === '' ? <div key={i} /> : (
        <button
          key={k + i}
          type="button"
          onClick={() => onPress(k)}
          style={{
            height: 52,
            borderRadius: 10,
            fontSize: 20,
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

// ── Points PIN ────────────────────────────────────────────────────────────────
function PinDots({ count, shake, theme }) {
  return (
    <div
      className={shake ? 'shake' : ''}
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 14,
        margin: '16px 0',
      }}
    >
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: i < count ? theme.text : 'transparent',
            border: i < count ? 'none' : `0.5px solid ${theme.borderStrong}`,
            transition: 'all 0.15s',
            transform: i < count ? 'scale(1.1)' : 'scale(1)',
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .shake { animation: shake 0.4s ease-in-out; }
        @media (min-width: 640px) {
          .emp-pin-modal {
            align-items: center !important;
          }
          .emp-pin-panel {
            border-radius: 16px !important;
          }
          .emp-pin-drag {
            display: none !important;
          }
        }
      `}</style>
      <div
        className="emp-pin-panel"
        style={{
          width: '100%',
          maxWidth: 380,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: 28,
          paddingTop: 18,
          paddingLeft: 20,
          paddingRight: 20,
          position: 'relative',
          background: theme.elevated || theme.card,
          border: `0.5px solid ${theme.border}`,
          boxShadow: theme.shadowModal || '0 -8px 32px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="emp-pin-drag"
          style={{
            width: 36,
            height: 3,
            borderRadius: 99,
            margin: '0 auto 16px',
            background: theme.border,
          }}
        />

        <button
          type="button"
          onClick={onCancel}
          aria-label="Fermer"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: `0.5px solid ${theme.border}`,
            color: theme.muted,
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >✕</button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 8 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 20,
              fontWeight: 500,
              marginBottom: 10,
              background: employee.avatar_color || theme.text,
            }}
          >
            {initials}
          </div>
          <p style={{ fontWeight: 500, fontSize: 15, color: theme.text, margin: 0 }}>
            {employee.name}
          </p>
          {actionLabel && (
            <p style={{
              fontSize: 11,
              fontWeight: 500,
              margin: '6px 0 0',
              padding: '3px 10px',
              borderRadius: 8,
              background: theme.cardAlt,
              color: theme.textSub || theme.text,
            }}>
              {actionLabel}
            </p>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: theme.muted, margin: '6px 0 0' }}>
          Code PIN requis pour valider
        </p>

        <PinDots count={pin.length} shake={shake} theme={theme} />

        <p style={{
          fontSize: 11,
          fontWeight: 500,
          textAlign: 'center',
          marginBottom: 14,
          height: 14,
          color: err ? '#991b1b' : 'transparent',
        }}>
          {err || '·'}
        </p>

        <PinKeypad onPress={press} theme={theme} />

        <button
          type="button"
          onClick={onCancel}
          style={{
            width: '100%',
            marginTop: 16,
            padding: '10px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            background: 'transparent',
            color: theme.muted,
            border: `0.5px solid ${theme.border}`,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Hook utilitaire : withEmployeePin ─────────────────────────────────────────
export function useEmployeePinGate() {
  const { requiresPin, clearToken } = useEmployeePin();
  const [modal, setModal] = useState(null);

  const requestPin = useCallback(async (employee, actionLabel, action) => {
    if (!employee?.id) {
      await action();
      return;
    }

    const needs = await requiresPin(employee.id);
    if (!needs) {
      await action();
      return;
    }

    clearToken(employee.id);

    await new Promise((resolve) => {
      setModal({ employee, actionLabel, resolve, action });
    });
  }, [requiresPin, clearToken]);

  const handleSuccess = useCallback(async () => {
    const current = modal;
    setModal(null);
    if (current?.action) {
      try { await current.action(); }
      finally {
        if (current.employee?.id) clearToken(current.employee.id);
      }
    }
    current?.resolve?.();
  }, [modal, clearToken]);

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
