// src/pages/clients/components/SortDropdown.jsx
import { useState, useEffect, useRef } from 'react';
import { SORT_OPTS } from '../constants';

export default function SortDropdown({ value, onChange, theme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const label = SORT_OPTS.find(o => o.value === value)?.label || 'Trier';

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          borderRadius: 8,
          border: `0.5px solid ${open ? theme.borderStrong : theme.border}`,
          background: open ? theme.cardAlt : 'transparent',
          color: theme.text,
          fontWeight: 500,
          fontSize: 13,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          fontFamily: 'inherit',
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 13, height: 13 }}>
          <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="18" x2="12" y2="18"/>
        </svg>
        {label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 11, height: 11, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          minWidth: 190,
          background: theme.elevated || theme.card,
          border: `0.5px solid ${theme.border}`,
          borderRadius: 12,
          boxShadow: theme.shadowModal || '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 50,
          overflow: 'hidden',
          padding: 4,
        }}>
          {SORT_OPTS.map(opt => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  border: 'none',
                  background: active ? theme.cardAlt : 'transparent',
                  color: active ? theme.text : theme.textSub || theme.text,
                  fontWeight: 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 8,
                  fontFamily: 'inherit',
                }}
              >
                <span style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: active ? theme.text : 'transparent',
                  flexShrink: 0,
                }} />
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
