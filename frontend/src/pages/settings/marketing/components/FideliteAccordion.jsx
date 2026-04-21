import { useState } from 'react';

export default function FideliteAccordion({ theme, title, children, defaultOpen = false }) {
  const t = theme;
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background:t.card, border:`0.5px solid ${t.border}`,
                  borderRadius:12, overflow:'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                       padding:'14px 18px', background:'none', border:'none', cursor:'pointer',
                       textAlign:'left', fontFamily:'inherit' }}>
        <span style={{ fontSize:14, fontWeight:500, color:t.text }}>{title}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round"
             style={{ width:15, height:15, color:t.muted,
                      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition:'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ borderTop:`0.5px solid ${t.separator}`, padding:16,
                      background:t.cardAlt }}>
          {children}
        </div>
      )}
    </div>
  );
}
