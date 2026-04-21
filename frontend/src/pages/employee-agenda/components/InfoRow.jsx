// src/pages/employee-agenda/components/InfoRow.jsx
export default function InfoRow({ icon, label, value, t, border }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '14px 16px',
      borderTop: border ? `0.5px solid ${t.border}` : 'none',
    }}>
      {icon && (
        <span style={{
          fontSize: 15,
          width: 22,
          textAlign: 'center',
          flexShrink: 0,
          opacity: 0.7,
        }}>{icon}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: t.muted }}>
          {label}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 500, color: t.text, wordBreak: 'break-word' }}>
          {value || '-'}
        </p>
      </div>
    </div>
  );
}
