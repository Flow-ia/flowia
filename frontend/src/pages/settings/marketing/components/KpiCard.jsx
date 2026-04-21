export default function KpiCard({ theme, icon, label, value, accent }) {
  const t = theme;
  return (
    <div style={{ padding:'12px 10px', borderRadius:12,
                  background:t.card, border:`0.5px solid ${t.border}`,
                  textAlign:'center' }}>
      <div style={{ fontSize:18, marginBottom:4 }}>{icon}</div>
      <p style={{ margin:0, fontSize:11, color:t.muted }}>{label}</p>
      <p style={{ margin:'4px 0 0', fontSize:16, fontWeight:500, color: accent || t.text }}>{value}</p>
    </div>
  );
}
