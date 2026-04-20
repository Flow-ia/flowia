// src/pages/clients/tabs/InfoTab.jsx
import { fmtDate } from '../helpers';

// ─── Onglet Infos ─────────────────────────────────────────────────────────────
export default function InfoTab({ fiche, theme, card }) {
  return (
    <div style={{ ...card, padding:'4px 16px', marginBottom:12 }}>
      {[
        ['📧','Email',fiche.email],
        ['📞','Télephone',fiche.phone],
        ['📅','Premier contact',fmtDate(fiche.created_at)],
        ['🕐','Derniere visite',fmtDate(fiche.last_visit)],
        ['📝','Notes internes',fiche.notes],
      ].filter(([,,v])=>v).map(([ic,l2,val]) => (
        <div key={l2} style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'12px 0', borderBottom:`1px solid ${theme.border}` }}>
          <span style={{ fontSize:16, flexShrink:0, lineHeight:1.6 }}>{ic}</span>
          <div style={{ minWidth:0 }}>
            <p style={{ margin:0, fontSize:11, color:theme.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>{l2}</p>
            <p style={{ margin:'2px 0 0', fontSize:14, color:theme.text, fontWeight:600, wordBreak:'break-word', lineHeight:1.5 }}>{val}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
