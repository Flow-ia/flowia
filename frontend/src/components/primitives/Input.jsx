import { useTheme } from '../../hooks/useTheme';

export function Label({ children, htmlFor, style: styleOverride = {}, ...rest }) {
  const { theme: t } = useTheme();
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'block',
        fontSize: 12,
        color: t.muted,
        marginBottom: 6,
        ...styleOverride,
      }}
      {...rest}
    >
      {children}
    </label>
  );
}

export function Field({ label, htmlFor, children, style: styleOverride = {} }) {
  return (
    <div style={{ marginBottom: 14, ...styleOverride }}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
    </div>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  style: styleOverride = {},
  ...rest
}) {
  const { theme: t } = useTheme();
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '10px 12px',
        background: t.inputBg,
        border: `0.5px solid ${t.borderInput}`,
        borderRadius: 8,
        fontSize: 14,
        color: t.text,
        outline: 'none',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        opacity: disabled ? 0.5 : 1,
        ...styleOverride,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = t.borderStrong;
        e.currentTarget.style.boxShadow = `0 0 0 3px ${t.border}`;
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = t.borderInput;
        e.currentTarget.style.boxShadow = 'none';
      }}
      {...rest}
    />
  );
}

export function InputWithUnit({
  value,
  onChange,
  unit,
  type = 'number',
  placeholder,
  disabled = false,
  style: styleOverride = {},
  ...rest
}) {
  const { theme: t } = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: t.inputBg,
        border: `0.5px solid ${t.borderInput}`,
        borderRadius: 8,
        padding: '0 12px',
        transition: 'border-color 0.15s ease',
        opacity: disabled ? 0.5 : 1,
        ...styleOverride,
      }}
    >
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          border: 'none',
          padding: '10px 0',
          background: 'transparent',
          outline: 'none',
          color: t.text,
          fontSize: 14,
          fontFamily: 'inherit',
          minWidth: 0,
        }}
        {...rest}
      />
      <span
        style={{
          fontSize: 13,
          color: t.muted,
          marginLeft: 8,
          userSelect: 'none',
        }}
      >
        {unit}
      </span>
    </div>
  );
}

export default Input;
