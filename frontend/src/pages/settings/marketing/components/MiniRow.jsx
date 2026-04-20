export default function MiniRow({ label, value, theme, accent }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0' }}>
      <span style={{ fontSize:13, color:theme.muted }}>{label}</span>
      <span style={{ fontSize:14, fontWeight:800, color: accent || theme.text }}>{value}</span>
    </div>
  );
}
