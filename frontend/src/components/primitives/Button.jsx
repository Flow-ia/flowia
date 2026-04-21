import { useTheme } from '../../hooks/useTheme';

const SIZE = {
  small:   { padding: '7px 14px',  fontSize: 13 },
  default: { padding: '10px 18px', fontSize: 14 },
  large:   { padding: '13px 22px', fontSize: 15 },
};

export function Button({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'default',
  fullWidth = false,
  type = 'button',
  style: styleOverride = {},
  ...rest
}) {
  const { theme: t } = useTheme();
  const dims = SIZE[size] || SIZE.default;

  const base = {
    borderRadius: 8,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : undefined,
    ...dims,
  };

  if (variant === 'primary') {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        style={{
          ...base,
          background: t.text,
          color: t.bg,
          border: 'none',
          transition: 'transform 0.1s ease, opacity 0.15s ease',
          ...styleOverride,
        }}
        onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.98)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        {...rest}
      >
        {children}
      </button>
    );
  }

  if (variant === 'danger') {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        style={{
          ...base,
          background: 'transparent',
          color: '#991b1b',
          border: '0.5px solid rgba(239,68,68,0.3)',
          transition: 'background 0.15s ease',
          ...styleOverride,
        }}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'rgba(239,68,68,0.05)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        {...rest}
      >
        {children}
      </button>
    );
  }

  if (variant === 'ghost') {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        style={{
          ...base,
          background: 'transparent',
          color: t.muted,
          border: 'none',
          transition: 'color 0.15s ease',
          ...styleOverride,
        }}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.color = t.text; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = t.muted; }}
        {...rest}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...base,
        background: 'transparent',
        color: t.text,
        border: `0.5px solid ${t.borderStrong}`,
        transition: 'background 0.15s ease',
        ...styleOverride,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = t.cardAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      {...rest}
    >
      {children}
    </button>
  );
}

export default Button;
