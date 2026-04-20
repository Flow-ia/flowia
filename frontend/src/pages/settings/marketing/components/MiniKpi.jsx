export default function MiniKpi({ theme, label, value, accent }) {
  return (
    <div style={{ padding:'6px 8px', borderRadius:8, background:'rgba(0,0,0,0.03)', textAlign:'center' }}>
      <p style={{ margin:0, fontSize:9, fontWeight:700, color:theme.muted, textTransform:'uppercase' }}>{label}</p>
      <p style={{ margin:'2px 0 0', fontSize:13, fontWeight:900, color: accent || theme.text }}>{value}</p>
    </div>
  );
}
