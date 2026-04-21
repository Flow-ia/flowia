// src/pages/clients/components/Avatar.jsx
import { avatarColor, initials } from '../helpers';

export default function Avatar({ cl, size = 40, radius = 12, fontSize = 16 }) {
  const c = avatarColor(cl);
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: radius,
      flexShrink: 0,
      background: c,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontWeight: 500,
      fontSize,
    }}>
      {initials(cl)}
    </div>
  );
}
