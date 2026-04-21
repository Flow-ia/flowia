// components/UI.jsx — Composants partages (Modal, Toast, Confirm, CodeInput, …)
// Refonte visuelle 2026 : applique les 10 principes (onboarding-1), conserve
// toutes les signatures exportees pour preserver la compatibilite avec les
// ~20 fichiers qui consomment ce module.
import { useState, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';

// Fallback theme si le prop `theme` n'est pas passe (certains anciens callers).
function useThemeFallback(themeProp) {
  const ctx = useTheme();
  return themeProp || ctx?.theme;
}

// ── Spinner (rotation via stroke SVG, pas de border) ─────────────────────────
export function Spinner({ size = 20, color = '#111827' }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24"
         style={{ color, display: 'block' }}>
      <circle cx="12" cy="12" r="10" fill="none"
              stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
      <path d="M12 2 a10 10 0 0 1 10 10" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

// ── Badge (pilule pastel) ────────────────────────────────────────────────────
export function Badge({ label, color = '#111827', bg, className = '', dot }) {
  return (
    <span className={className}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                   padding: '3px 10px', borderRadius: 99,
                   fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                   color, backgroundColor: bg || `${color}12` }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%',
                             background: color, display: 'inline-block', flexShrink: 0 }}/>}
      {label}
    </span>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────
export function Avatar({ name, color, size = 36 }) {
  const initial = name?.charAt(0)?.toUpperCase() || '?';
  return (
    <div style={{ width: size, height: size,
                  borderRadius: Math.max(6, Math.round(size * 0.28)),
                  backgroundColor: color || '#111827',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 500,
                  fontSize: Math.round(size * 0.42), flexShrink: 0 }}>
      {initial}
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────
export function Toast({ msg, type = 'ok' }) {
  if (!msg) return null;
  const cfg = {
    ok:    { bg: '#f0fdf4', text: '#065f46', icon: '✓' },
    error: { bg: '#fef2f2', text: '#991b1b', icon: '✕' },
    info:  { bg: '#eef2ff', text: '#4338ca', icon: 'ℹ' },
  };
  const c = cfg[type] || cfg.ok;
  return (
    <div className="anim-slideUp"
         style={{ position: 'fixed', top: 16, left: '50%', zIndex: 9999,
                  transform: 'translateX(-50%)',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px', borderRadius: 8,
                  fontSize: 14, fontWeight: 500, fontFamily: 'inherit',
                  background: c.bg, color: c.text,
                  whiteSpace: 'nowrap' }}>
      <span aria-hidden>{c.icon}</span>
      {msg}
    </div>
  );
}

export function useToast() {
  const [t, setT] = useState(null);
  const show = (msg, type = 'ok') => {
    setT({ msg, type });
    setTimeout(() => setT(null), 3000);
  };
  return [t, show];
}

// ── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, theme, maxW = 480 }) {
  const t = useThemeFallback(theme);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 16 }}>
      <div onClick={onClose}
           style={{ position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}/>
      <div className="animate-scaleIn"
           style={{ position: 'relative', width: '100%', maxWidth: maxW, maxHeight: '92vh',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    borderRadius: 16,
                    background: t?.elevated || '#ffffff',
                    border: `0.5px solid ${t?.border || 'rgba(0,0,0,0.08)'}`,
                    boxShadow: t?.shadowModal || '0 20px 60px rgba(0,0,0,0.14)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 18px', flexShrink: 0,
                      borderBottom: `0.5px solid ${t?.separator || 'rgba(0,0,0,0.06)'}` }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: t?.text || '#111827', margin: 0 }}>
            {title}
          </h2>
          <button onClick={onClose}
                  style={{ width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
                           background: t?.cardAlt || 'rgba(0,0,0,0.04)',
                           color: t?.muted || '#6B7280',
                           display: 'flex', alignItems: 'center', justifyContent: 'center',
                           fontSize: 15, fontFamily: 'inherit' }}>
            ×
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Confirm ──────────────────────────────────────────────────────────────────
export function Confirm({ open, onClose, onConfirm, title, message, danger = true, theme }) {
  const t = useThemeFallback(theme);
  if (!open) return null;

  // Danger = filled dark red (non-sature, lisible). Primary = t.text plein.
  const confirmBg    = danger ? '#991b1b' : (t?.text || '#111827');
  const confirmColor = danger ? '#ffffff' : (t?.bg   || '#ffffff');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 16 }}>
      <div onClick={onClose}
           style={{ position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}/>
      <div className="anim-scaleIn"
           style={{ position: 'relative', width: '100%', maxWidth: 400,
                    overflow: 'hidden', borderRadius: 16,
                    background: t?.elevated || '#ffffff',
                    border: `0.5px solid ${t?.border || 'rgba(0,0,0,0.08)'}`,
                    boxShadow: t?.shadowModal || '0 20px 60px rgba(0,0,0,0.14)' }}>
        <div style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 500,
                       color: t?.text || '#111827', margin: '0 0 8px' }}>
            {title}
          </h3>
          {message && (
            <p style={{ fontSize: 13, color: t?.muted || '#6B7280', margin: 0, lineHeight: 1.5 }}>
              {message}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '0 24px 24px' }}>
          <button onClick={onClose}
                  style={{ flex: 1, padding: '10px', borderRadius: 8,
                           fontSize: 14, fontWeight: 500, cursor: 'pointer',
                           background: 'transparent', color: t?.text || '#111827',
                           border: `0.5px solid ${t?.borderStrong || 'rgba(0,0,0,0.14)'}`,
                           fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button onClick={() => { onConfirm(); onClose(); }}
                  style={{ flex: 1, padding: '10px', borderRadius: 8,
                           fontSize: 14, fontWeight: 500, cursor: 'pointer',
                           background: confirmBg, color: confirmColor,
                           border: 'none', fontFamily: 'inherit' }}>
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────
export function Input({ label, error, theme, className = '', ...props }) {
  const t = useThemeFallback(theme);
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 12, color: t?.muted || '#6B7280' }}>
          {label}
        </label>
      )}
      <input {...props}
             style={{ width: '100%', padding: '10px 12px', borderRadius: 8,
                      fontSize: 14, fontFamily: 'inherit', outline: 'none',
                      background: t?.inputBg || '#f9f9fb',
                      border: `0.5px solid ${error ? '#991b1b' : (t?.borderInput || 'rgba(0,0,0,0.12)')}`,
                      color: t?.text || '#111827',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.15s ease, box-shadow 0.15s ease' }}/>
      {error && (
        <p style={{ fontSize: 11, color: '#991b1b', margin: 0 }}>{error}</p>
      )}
    </div>
  );
}

// ── Btn (legacy) — mappe les 6 variants sur des styles sobres ───────────────
// API preservee : variant, size, loading, disabled, className, style.
export function Btn({ children, variant = 'primary', size = 'md',
                      loading, disabled, className = '', style = {}, ...props }) {
  const { theme: t } = useTheme();

  const sizes = {
    sm: { padding: '7px 14px',  fontSize: 13 },
    md: { padding: '10px 18px', fontSize: 14 },
    lg: { padding: '13px 22px', fontSize: 15 },
  };
  const dims = sizes[size] || sizes.md;

  // Variants desaturees — plus de gradients ni d'ombres colorees.
  const variants = {
    primary:   { background: t.text,       color: t.bg,     border: 'none' },
    secondary: { background: 'transparent', color: t.text,  border: `0.5px solid ${t.borderStrong}` },
    danger:    { background: '#991b1b',    color: '#ffffff', border: 'none' },
    success:   { background: '#065f46',    color: '#ffffff', border: 'none' },
    warning:   { background: '#92400e',    color: '#ffffff', border: 'none' },
    ghost:     { background: 'transparent', color: t.muted,  border: 'none' },
  };
  const v = variants[variant] || variants.primary;

  return (
    <button {...props} disabled={disabled || loading}
            className={className}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                     gap: 8, fontWeight: 500, borderRadius: 8,
                     fontFamily: 'inherit',
                     ...dims, ...v,
                     opacity: (disabled || loading) ? 0.5 : 1,
                     cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
                     transition: 'opacity 0.15s ease',
                     ...style }}>
      {loading ? <Spinner size={14} color={v.color}/> : children}
    </button>
  );
}

// ── Section card ─────────────────────────────────────────────────────────────
export function Card({ children, className = '', theme, style = {}, hover, ...props }) {
  const t = useThemeFallback(theme);
  return (
    <div className={`${hover ? 'card-hover' : ''} ${className}`}
         style={{ background: t?.card || '#ffffff',
                  border: `0.5px solid ${t?.border || 'rgba(0,0,0,0.08)'}`,
                  borderRadius: 12,
                  cursor: hover ? 'pointer' : undefined,
                  transition: 'background 0.15s ease',
                  ...style }} {...props}>
      {children}
    </div>
  );
}

// ── CodeInput ────────────────────────────────────────────────────────────────
export function CodeInput({ length = 6, value = '', onChange, theme, error }) {
  const t = useThemeFallback(theme);
  const cells = Array.from({ length });

  const handleChange = (i, e) => {
    const char = e.target.value.replace(/\D/g, '').slice(-1);
    const arr = value.split('');
    arr[i] = char;
    const next = arr.join('').slice(0, length);
    onChange(next);
    if (char && i < length - 1) {
      document.getElementById(`code-input-${i + 1}`)?.focus();
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      document.getElementById(`code-input-${i - 1}`)?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted) { onChange(pasted); e.preventDefault(); }
  };

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {cells.map((_, i) => {
        const filled = !!value[i];
        const borderColor = error
          ? '#991b1b'
          : (filled ? (t?.text || '#111827') : (t?.borderStrong || 'rgba(0,0,0,0.14)'));
        return (
          <input
            key={i}
            id={`code-input-${i}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={value[i] || ''}
            onChange={e => handleChange(i, e)}
            onKeyDown={e => handleKeyDown(i, e)}
            onPaste={handlePaste}
            autoFocus={i === 0}
            style={{
              width: 48, height: 56,
              textAlign: 'center',
              fontSize: 22, fontWeight: 500,
              borderRadius: 12,
              border: `0.5px solid ${borderColor}`,
              background: t?.inputBg || '#f9f9fb',
              color: t?.text || '#111827',
              outline: 'none',
              transition: 'border-color 0.15s ease',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
            }}
          />
        );
      })}
    </div>
  );
}

// ── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions, theme }) {
  const t = useThemeFallback(theme);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  gap: 16, padding: '20px 16px 16px' }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: t?.text || '#111827', margin: 0 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 13, color: t?.muted || '#6B7280', margin: '2px 0 0' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
