import { useTheme } from '../../hooks/useTheme';

export function SegmentedControl({
  value,
  onChange,
  options = [],
  fullWidth = false,
  style: styleOverride = {},
}) {
  const { theme: t } = useTheme();

  return (
    <div
      style={{
        display: fullWidth ? 'flex' : 'inline-flex',
        width: fullWidth ? '100%' : undefined,
        background: t.cardAlt,
        borderRadius: 8,
        padding: 3,
        gap: 0,
        ...styleOverride,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange?.(opt.value)}
            style={{
              background: active ? t.card : 'transparent',
              color: active ? t.text : t.muted,
              border: 'none',
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
              flex: fullWidth ? 1 : undefined,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
