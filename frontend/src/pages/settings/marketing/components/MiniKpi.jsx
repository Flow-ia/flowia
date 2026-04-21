export default function MiniKpi({ theme, label, value, accent }) {
  const t = theme;
  return (
    <div style={{ padding:'6px 8px', borderRadius:8,
                  background:t.cardAlt, textAlign:'center' }}>
      <p style={{ margin:0, fontSize:10, color:t.muted }}>{label}</p>
      <p style={{ margin:'2px 0 0', fontSize:13, fontWeight:500, color: accent || t.text }}>{value}</p>
    </div>
  );
}
