export default function KpiCard({ theme, icon, label, value, accent }) {
  return (
    <div style={{ padding:'12px 10px', borderRadius:12, background:theme.card,
      border:`1px solid ${theme.border}`, textAlign:'center' }}>
      <div style={{ fontSize:18, marginBottom:4 }}>{icon}</div>
      <p style={{ margin:0, fontSize:10, fontWeight:800, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</p>
      <p style={{ margin:'4px 0 0', fontSize:16, fontWeight:900, color: accent || theme.text }}>{value}</p>
    </div>
  );
}
