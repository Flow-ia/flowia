// src/pages/employee-agenda/components/Toggle.jsx
import { useTheme } from '../../../hooks/useTheme';

export default function Toggle({ on, onChange }) {
  const { theme: t } = useTheme();
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={!!on}
      style={{
        width: 40,
        height: 22,
        borderRadius: 99,
        position: 'relative',
        background: on ? t.text : t.cardAlt,
        border: `0.5px solid ${on ? t.text : t.borderStrong}`,
        cursor: 'pointer',
        transition: 'background .15s ease, border-color .15s ease',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <div style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: on ? t.bg : t.text,
        position: 'absolute',
        top: 2,
        left: on ? 20 : 2,
        transition: 'left .15s ease, background .15s ease',
      }} />
    </button>
  );
}
