export default function StepIndicator({ step, theme }) {
  const t = theme;
  return (
    <div style={{ display:'flex', gap:6, padding:'0 4px 4px' }}>
      {[1, 2, 3].map(n => (
        <div key={n} style={{
          flex:1, height:4, borderRadius:2,
          background: n <= step ? '#4338ca' : t.border,
          opacity: n <= step ? 1 : 0.5,
          transition:'background 0.3s',
        }}/>
      ))}
    </div>
  );
}
