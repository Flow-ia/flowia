import { useTheme } from '../../hooks/useTheme';

const VARIANT = {
  default: { padding: 20, borderRadius: 12 },
  compact: { padding: 14, borderRadius: 8 },
  large:   { padding: 28, borderRadius: 16 },
};

export function Card({
  children,
  variant = 'default',
  style: styleOverride = {},
  ...rest
}) {
  const { theme: t } = useTheme();

  if (variant === 'flat') {
    return (
      <div
        style={{
          background: t.cardAlt,
          border: 'none',
          borderRadius: 12,
          padding: 20,
          boxSizing: 'border-box',
          ...styleOverride,
        }}
        {...rest}
      >
        {children}
      </div>
    );
  }

  const dims = VARIANT[variant] || VARIANT.default;
  return (
    <div
      style={{
        background: t.card,
        border: `0.5px solid ${t.border}`,
        boxSizing: 'border-box',
        ...dims,
        ...styleOverride,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export default Card;
