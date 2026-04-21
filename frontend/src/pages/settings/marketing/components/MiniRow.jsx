export default function MiniRow({ label, value, theme, accent }) {
  const t = theme;
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0' }}>
      <span style={{ fontSize:13, color:t.muted }}>{label}</span>
      <span style={{ fontSize:14, fontWeight:500, color: accent || t.text }}>{value}</span>
    </div>
  );
}
