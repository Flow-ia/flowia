// src/pages/booking/shared.jsx
// Constantes, helpers et petits composants partages du site de reservation.
// Tokens alignes sur la direction visuelle 2026 (cf. onboarding-1).
import { mediaApi } from '../../utils/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
export const withV = (url, v) => v ? `${url}?v=${v}` : url;
export const serviceImgUrl  = (id, v) => withV(`${API_BASE}/media/service/${id}/image`, v);
export const employeeImgUrl = (id, v) => withV(`${API_BASE}/media/employee/${id}/image`, v);
export const mediaUrl = (u) => mediaApi.absoluteUrl(u);

export const MONTHS_FR = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Decembre'];
export const DAYS_MINI = ['L','M','M','J','V','S','D'];

// ── Theme light/dark aligne sur useTheme.jsx ──────────────────────────────
export const LIGHT_THEME = {
  mode:        'light',
  bg:          '#f8f9fc',
  card:        '#ffffff',
  cardAlt:     '#f5f5f7',
  elevated:    '#ffffff',
  text:        '#111827',
  textSub:     '#374151',
  muted:       '#6B7280',
  dim:         '#9CA3AF',
  border:      'rgba(0,0,0,0.08)',
  borderStrong:'rgba(0,0,0,0.14)',
  borderInput: 'rgba(0,0,0,0.12)',
  separator:   'rgba(0,0,0,0.06)',
  inputBg:     '#f9f9fb',
  accent:      '#111827',
  accentBtn:   '#111827',
  accentText:  '#ffffff',
  navBg:       'rgba(255,255,255,0.96)',
  navBorder:   'rgba(0,0,0,0.08)',
  sidebarBg:   '#ffffff',
  shadowSm:    '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  shadowModal: '0 20px 60px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08)',
};

export const DARK_THEME = {
  mode:        'dark',
  bg:          '#0f1117',
  card:        '#1c2128',
  cardAlt:     '#22272e',
  elevated:    '#2d333b',
  text:        '#e6edf3',
  textSub:     '#adbac7',
  muted:       '#768390',
  dim:         '#545d68',
  border:      'rgba(205,217,229,0.1)',
  borderStrong:'rgba(205,217,229,0.18)',
  borderInput: 'rgba(205,217,229,0.12)',
  separator:   'rgba(205,217,229,0.07)',
  inputBg:     'rgba(255,255,255,0.05)',
  accent:      '#e6edf3',
  accentBtn:   '#e6edf3',
  accentText:  '#0f1117',
  navBg:       'rgba(17,19,24,0.96)',
  navBorder:   'rgba(205,217,229,0.08)',
  sidebarBg:   '#1c2128',
  shadowSm:    '0 1px 3px rgba(0,0,0,0.4)',
  shadowModal: '0 24px 60px rgba(0,0,0,0.7)',
};

// Spinner neutre, utilise les tokens du theme
export function Spinner({ th, size = 32 }) {
  const border = th?.border || 'rgba(0,0,0,0.08)';
  const top    = th?.text   || '#111827';
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `0.5px solid ${border}`,
        borderTopColor: top,
        animation: 'spin 0.8s linear infinite',
        margin: '0 auto',
      }}
    />
  );
}

export function ThemeToggle({ th, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={th.mode === 'dark' ? 'Passer en clair' : 'Passer en sombre'}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: `0.5px solid ${th.border}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
        color: th.text,
      }}
    >
      {th.mode === 'dark'
        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      }
    </button>
  );
}

export function BackBtn({ onClick, label, th }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        color: th.muted,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        marginBottom: 16,
        fontFamily: 'inherit',
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
      {label}
    </button>
  );
}
