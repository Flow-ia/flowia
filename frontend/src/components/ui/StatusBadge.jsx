import { useTheme } from '../../hooks/useTheme';
import { getStatusPalette } from './palette';

export function StatusBadge({
  status = 'neutral',
  label,
  variant = 'dot',
  style: styleOverride = {},
}) {
  const { theme: t } = useTheme();
  const palette = getStatusPalette(t);
  const colors = palette[status] || palette.neutral;

  if (variant === 'pastel') {
    return (
      <span
        style={{
          display: 'inline-block',
          background: colors.bg,
          color: colors.text,
          fontSize: 11,
          padding: '3px 8px',
          borderRadius: 8,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          ...styleOverride,
        }}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        ...styleOverride,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: colors.accent,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12, color: t.muted }}>
        {label}
      </span>
    </span>
  );
}

export default StatusBadge;
