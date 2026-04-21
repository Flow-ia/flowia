// src/pages/employee-agenda/styles.js
// Helpers partages — retravailles pour coller a la direction visuelle 2026
// (bordures 0.5px, aplats, radius 12, fontWeight <= 500, aucune ombre coloree).

export const glassCard = (isDark) => ({
  background: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
  border: `0.5px solid ${isDark ? 'rgba(205,217,229,0.1)' : 'rgba(0,0,0,0.08)'}`,
  borderRadius: 12,
});

export const pillBtn = (active, isDark) => ({
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  border: `0.5px solid ${
    active
      ? (isDark ? 'rgba(205,217,229,0.18)' : 'rgba(0,0,0,0.14)')
      : (isDark ? 'rgba(205,217,229,0.1)'  : 'rgba(0,0,0,0.08)')
  }`,
  background: active ? (isDark ? '#22272e' : '#f9f9fb') : 'transparent',
  color:      active ? (isDark ? '#e6edf3' : '#111827') : (isDark ? '#768390' : '#6B7280'),
  cursor: 'pointer',
  transition: 'all .15s',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
});

// Encart pastel : fond doux + texte de la meme famille (principe 10)
export const chip = (isDark, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 500,
  background: color + '18', color,
});
