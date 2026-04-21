// src/pages/employee-agenda/components/Spin.jsx
import { useTheme } from '../../../hooks/useTheme';

export default function Spin({ size=20 }) {
  const { theme: t } = useTheme();
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      border: `0.5px solid ${t.border}`,
      borderTopColor: t.text,
      animation: 'spin .7s linear infinite',
      flexShrink: 0,
    }} />
  );
}
