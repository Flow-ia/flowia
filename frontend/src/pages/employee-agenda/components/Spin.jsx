// src/pages/employee-agenda/components/Spin.jsx
export default function Spin({ size=20 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', border:`2px solid rgba(17,24,39,0.2)`, borderTopColor:'#111827', animation:'spin .7s linear infinite', flexShrink:0 }} />
  );
}
