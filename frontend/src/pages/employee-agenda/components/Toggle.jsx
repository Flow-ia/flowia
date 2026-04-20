// src/pages/employee-agenda/components/Toggle.jsx
export default function Toggle({ on, onChange }) {
  return (
    <button onClick={onChange} style={{ width:44, height:24, borderRadius:99, position:'relative', background:on?'#111827':'rgba(120,120,140,0.2)', border:'none', cursor:'pointer', transition:'background .2s', flexShrink:0 }}>
      <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left:on?23:3, transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }} />
    </button>
  );
}
