import { useState } from 'react';

export default function FideliteAccordion({ theme, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const isDark = theme.mode === 'dark';
  return (
    <div style={{
      background: theme.card, border: `1px solid ${theme.border}`,
      borderRadius: 14, overflow: 'hidden',
    }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: theme.text }}>{title}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{
            width: 16, height: 16, color: theme.muted,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform .2s',
          }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{
          borderTop: `1px solid ${theme.border}`,
          padding: 16,
          background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}
