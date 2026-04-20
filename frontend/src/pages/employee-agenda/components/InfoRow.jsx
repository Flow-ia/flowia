// src/pages/employee-agenda/components/InfoRow.jsx
export default function InfoRow({ icon, label, value, t, border }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 20px', borderTop: border ? `1px solid ${t.border}` : 'none' }}>
      <span style={{ fontSize:18, width:26, textAlign:'center', flexShrink:0, opacity:.7 }}>{icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ margin:0, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:t.muted }}>{label}</p>
        <p style={{ margin:'2px 0 0', fontSize:15, fontWeight:600, color:t.text, wordBreak:'break-word' }}>{value||'-'}</p>
      </div>
    </div>
  );
}
