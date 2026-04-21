import { createContext, useContext, useState } from 'react';

// ── Design System "Planity Light" ─────────────────────────────────────────────
// Inspiré Stripe · Linear · Planity — light par défaut, couleurs plates

export const LIGHT = {
  mode: 'light',
  bg:          '#f8f9fc',
  canvas:      '#ffffff',
  card:        '#ffffff',
  cardAlt:     '#f9f9fb',
  elevated:    '#ffffff',
  overlay:     '#f2f2f5',
  border:       'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.14)',
  borderInput:  'rgba(0,0,0,0.12)',
  text:         '#111827',
  textSub:      '#374151',
  muted:        '#6B7280',
  dim:          '#9CA3AF',
  navBg:        'rgba(255,255,255,0.96)',
  navBorder:    'rgba(0,0,0,0.08)',
  stickyBg:     'rgba(247,247,249,0.97)',
  inputBg:      '#f9f9fb',
  inputBorder:  'rgba(0,0,0,0.12)',
  separator:    'rgba(0,0,0,0.06)',
  shadowSm:     '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  shadowMd:     '0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
  shadowLg:     '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
  shadowModal:  '0 20px 60px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08)',
};

export const DARK = {
  mode: 'dark',
  bg:          '#0f1117',
  canvas:      '#161b22',
  card:        '#1c2128',
  cardAlt:     '#22272e',
  elevated:    '#2d333b',
  overlay:     '#373e47',
  border:       'rgba(205,217,229,0.1)',
  borderStrong: 'rgba(205,217,229,0.18)',
  borderInput:  'rgba(205,217,229,0.12)',
  text:         '#e6edf3',
  textSub:      '#adbac7',
  muted:        '#768390',
  dim:          '#545d68',
  navBg:        'rgba(17,19,24,0.96)',
  navBorder:    'rgba(205,217,229,0.08)',
  stickyBg:     'rgba(17,19,24,0.97)',
  inputBg:      'rgba(255,255,255,0.05)',
  inputBorder:  'rgba(205,217,229,0.12)',
  separator:    'rgba(205,217,229,0.07)',
  shadowSm:     '0 1px 3px rgba(0,0,0,0.4)',
  shadowMd:     '0 4px 12px rgba(0,0,0,0.4)',
  shadowLg:     '0 8px 24px rgba(0,0,0,0.5)',
  shadowModal:  '0 24px 60px rgba(0,0,0,0.7)',
};

export const BRAND = {
  primary:   '#1a73e8',   // Google Blue
  primaryDk: '#1557b0',
  primaryBg: '#e8f0fe',
  primaryBd: '#aecbfa',
  success:   '#10b981',
  successBg: '#ecfdf5',
  successBd: '#a7f3d0',
  danger:    '#ef4444',
  dangerBg:  '#fef2f2',
  dangerBd:  '#fecaca',
  warning:   '#f59e0b',
  warningBg: '#fffbeb',
  warningBd: '#fde68a',
  info:      '#06b6d4',
  infoBg:    '#ecfeff',
  infoBd:    '#a5f3fc',
  cash:     { label:'Especes',  color:'#10b981', bg:'#ecfdf5', bd:'#a7f3d0' },
  card:     { label:'Carte',    color:'#6366f1', bg:'#eef2ff', bd:'#c7d2fe' },
  transfer: { label:'Virement', color:'#06b6d4', bg:'#ecfeff', bd:'#a5f3fc' },
  other:    { label:'Autre',    color:'#f59e0b', bg:'#fffbeb', bd:'#fde68a' },
};

// ── Palette de statuts universelle ────────────────────────────────────────────
// Utilisee par StatusBadge + encarts pastel. La variante "neutral" depend du
// theme : passer par getStatusPalette(t) pour la recuperer dynamiquement.
export const STATUS_PALETTE = {
  success: { bg: '#f0fdf4', accent: '#10b981', text: '#065f46' },
  warning: { bg: '#fffbeb', accent: '#f59e0b', text: '#92400e' },
  info:    { bg: '#eef2ff', accent: '#6366f1', text: '#4338ca' },
  danger:  { bg: '#fef2f2', accent: '#ef4444', text: '#991b1b' },
  no_show: { bg: '#fff7ed', accent: '#fb923c', text: '#9a3412' },
  purple:  { bg: '#eeedfe', accent: '#8b5cf6', text: '#3c3489' },
};

export function getStatusPalette(t) {
  return {
    ...STATUS_PALETTE,
    neutral: { bg: t.cardAlt, accent: t.muted, text: t.textSub },
  };
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(LIGHT);
  const toggle = () => setTheme(t => t.mode === 'light' ? DARK : LIGHT);
  return (
    <ThemeContext.Provider value={{ theme, toggle, isLight: theme.mode === 'light', isDark: theme.mode === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }
