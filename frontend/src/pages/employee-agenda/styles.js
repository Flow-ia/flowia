// src/pages/employee-agenda/styles.js
export const glassCard = (isDark) => ({
  background: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
  border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
  borderRadius: 16,
  boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.04)',
});

export const pillBtn = (active, isDark) => ({
  padding: '6px 14px',
  borderRadius: 99,
  fontSize: 12,
  fontWeight: 700,
  border: `1px solid ${active ? 'transparent' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')}`,
  background: active ? 'linear-gradient(135deg,#111827,#8b5cf6)' : 'transparent',
  color: active ? '#fff' : (isDark ? 'rgba(255,255,255,0.5)' : '#6b7280'),
  cursor: 'pointer',
  transition: 'all .15s',
  whiteSpace: 'nowrap',
});

export const chip = (isDark, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600,
  background: color+'18', color,
});
