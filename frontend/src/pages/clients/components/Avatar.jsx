// src/pages/clients/components/Avatar.jsx
import { avatarColor, initials } from '../helpers';

export default function Avatar({ cl, size = 46, radius = 15, fontSize = 18 }) {
  const c = avatarColor(cl);
  return (
    <div style={{ width:size, height:size, borderRadius:radius, flexShrink:0, background:`linear-gradient(135deg,${c},${c}bb)`, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:900, fontSize }}>
      {initials(cl)}
    </div>
  );
}
