export default function InfoRow({ icon, label, value, t, border }) {
  const topBorder = border ? { borderTop: `0.5px solid ${t.separator || t.border}` } : {};
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        ...topBorder,
      }}
    >
      {icon && (
        <span
          style={{
            fontSize: 14,
            width: 22,
            textAlign: 'center',
            flexShrink: 0,
            color: t.muted,
          }}
        >
          {icon}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, color: t.muted, margin: 0 }}>{label}</p>
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            margin: '2px 0 0',
            color: t.text,
            wordBreak: 'break-word',
          }}
        >
          {value || '-'}
        </p>
      </div>
    </div>
  );
}
