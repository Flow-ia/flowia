// src/pages/clients/components/SortDropdown.jsx
import { useState, useEffect, useRef } from 'react';
import { SORT_OPTS } from '../constants';

// ─── Dropdown de filtre ───────────────────────────────────────────────────────
export default function SortDropdown({ value, onChange, theme, isDark }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const label = SORT_OPTS.find(o => o.value === value)?.label || 'Trier';

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 13px', borderRadius:12, border:`1px solid ${open ? '#111827' : theme.border}`, background: open ? 'rgba(17,24,39,0.1)' : theme.card, color: open ? '#111827' : theme.muted, fontWeight:700, fontSize:13, cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width:13, height:13 }}>
          <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="18" x2="12" y2="18"/>
        </svg>
        {label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width:11, height:11, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform .2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, minWidth:190, background:isDark?'#1c1c28':'#fff', border:`1px solid ${theme.border}`, borderRadius:14, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', zIndex:50, overflow:'hidden' }}>
          {SORT_OPTS.map(opt => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{ width:'100%', padding:'11px 16px', border:'none', background: value === opt.value ? 'rgba(17,24,39,0.1)' : 'transparent', color: value === opt.value ? '#111827' : theme.text, fontWeight: value === opt.value ? 800 : 600, fontSize:13, cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:8 }}>
              {value === opt.value && <span style={{ fontSize:10 }}>●</span>}
              {value !== opt.value && <span style={{ fontSize:10, opacity:0 }}>●</span>}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
