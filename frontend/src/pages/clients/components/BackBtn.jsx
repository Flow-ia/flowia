// src/pages/clients/components/BackBtn.jsx

export default function BackBtn({ onClick, theme, isDark }) {
  return (
    <button onClick={onClick} style={{ width:36, height:36, borderRadius:12, border:'none', cursor:'pointer', background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width:16, height:16, color:theme.muted }}><polyline points="15 18 9 12 15 6"/></svg>
    </button>
  );
}
