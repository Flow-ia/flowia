// src/pages/booking/shared.jsx
// Constantes, helpers et petits composants partagés du site de réservation.
// Tokens alignés sur l'aesthétique shadcn (palette zinc, ombres soft, focus ring).
import { mediaApi } from '../../utils/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
export const withV = (url, v) => v ? `${url}?v=${v}` : url;
export const serviceImgUrl  = (id, v) => withV(`${API_BASE}/media/service/${id}/image`, v);
export const employeeImgUrl = (id, v) => withV(`${API_BASE}/media/employee/${id}/image`, v);
export const mediaUrl = (u) => mediaApi.absoluteUrl(u);

export const MONTHS_FR = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Decembre'];
export const DAYS_MINI = ['L','M','M','J','V','S','D'];

// ── Theme light / dark — palette zinc shadcn ─────────────────────────────────
export const LIGHT_THEME = {
  mode:        'light',
  bg:          '#fafafa',  // zinc-50 (page bg, cards stand out)
  card:        '#ffffff',
  cardAlt:     '#f4f4f5',  // zinc-100
  elevated:    '#ffffff',
  text:        '#09090b',  // zinc-950
  textSub:     '#3f3f46',  // zinc-700
  muted:       '#52525b',  // zinc-600
  dim:         '#71717a',  // zinc-500
  border:      '#e4e4e7',  // zinc-200
  borderStrong:'#d4d4d8',  // zinc-300
  borderInput: '#e4e4e7',
  inputBorder: '#e4e4e7',  // alias (compat code legacy)
  borderHv:    '#d4d4d8',
  separator:   '#f4f4f5',
  inputBg:     '#ffffff',
  bgHover:     '#f4f4f5',
  accent:      '#18181b',  // zinc-900
  accentBtn:   '#18181b',
  accentText:  '#fafafa',
  navBg:       'rgba(255,255,255,0.85)',
  navBorder:   '#e4e4e7',
  sidebarBg:   '#ffffff',
  ring:        '#18181b',
  shadowSm:    '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  shadowMd:    '0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
  shadowLg:    '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.06)',
  shadowModal: '0 20px 25px -5px rgb(0 0 0 / 0.10), 0 8px 10px -6px rgb(0 0 0 / 0.08)',
  // Accents (statuts, badges, pills — utilisés avec parcimonie)
  ax: {
    violet:  '#7c3aed', violetBg:  '#f5f3ff',
    blue:    '#2563eb', blueBg:    '#eff6ff',
    emerald: '#059669', emeraldBg: '#ecfdf5',
    amber:   '#d97706', amberBg:   '#fffbeb',
    rose:    '#e11d48', roseBg:    '#fff1f2',
    cyan:    '#0891b2', cyanBg:    '#ecfeff',
  },
};

export const DARK_THEME = {
  mode:        'dark',
  bg:          '#09090b',  // zinc-950
  card:        '#18181b',  // zinc-900
  cardAlt:     '#27272a',  // zinc-800
  elevated:    '#27272a',
  text:        '#fafafa',  // zinc-50
  textSub:     '#d4d4d8',  // zinc-300
  muted:       '#a1a1aa',  // zinc-400
  dim:         '#71717a',  // zinc-500
  border:      '#27272a',  // zinc-800
  borderStrong:'#3f3f46',  // zinc-700
  borderInput: '#27272a',
  inputBorder: '#27272a',  // alias (compat code legacy)
  borderHv:    '#3f3f46',
  separator:   '#18181b',
  inputBg:     '#18181b',
  bgHover:     '#27272a',
  accent:      '#fafafa',
  accentBtn:   '#fafafa',
  accentText:  '#09090b',
  navBg:       'rgba(9,9,11,0.85)',
  navBorder:   '#27272a',
  sidebarBg:   '#18181b',
  ring:        '#fafafa',
  shadowSm:    '0 1px 2px 0 rgb(0 0 0 / 0.4)',
  shadowMd:    '0 4px 6px -1px rgb(0 0 0 / 0.5)',
  shadowLg:    '0 10px 15px -3px rgb(0 0 0 / 0.6)',
  shadowModal: '0 24px 60px rgb(0 0 0 / 0.7), 0 8px 10px -6px rgb(0 0 0 / 0.5)',
  ax: {
    violet:  '#a78bfa', violetBg:  'rgba(167,139,250,0.12)',
    blue:    '#60a5fa', blueBg:    'rgba(96,165,250,0.12)',
    emerald: '#34d399', emeraldBg: 'rgba(52,211,153,0.12)',
    amber:   '#fbbf24', amberBg:   'rgba(251,191,36,0.12)',
    rose:    '#fb7185', roseBg:    'rgba(251,113,133,0.12)',
    cyan:    '#22d3ee', cyanBg:    'rgba(34,211,238,0.12)',
  },
};

// Spinner neutre, utilise les tokens du theme
export function Spinner({ th, size = 32 }) {
  const border = th?.border || '#e4e4e7';
  const top    = th?.text   || '#09090b';
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid ${border}`,
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
        background: th.bg,
        border: `1px solid ${th.border}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
        color: th.text,
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = th.bgHover; e.currentTarget.style.borderColor = th.borderHv; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = th.bg; e.currentTarget.style.borderColor = th.border; }}
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
        transition: 'color 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = th.text; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = th.muted; }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
      {label}
    </button>
  );
}

// ── Helpers btn shadcn (light/dark via theme) ────────────────────────────────
export function primaryBtn(th, full = false) {
  return {
    fontSize: 14, fontWeight: 500,
    color: th.accentText, background: th.accent,
    border: `1px solid ${th.accent}`,
    padding: '10px 18px', borderRadius: 8, height: 40,
    boxSizing: 'border-box', lineHeight: 1.4,
    cursor: 'pointer', display: 'inline-block',
    fontFamily: 'inherit', textDecoration: 'none',
    width: full ? '100%' : undefined, textAlign: 'center',
    transition: 'opacity 0.15s ease',
  };
}

export function ghostBtn(th, full = false) {
  return {
    fontSize: 14, fontWeight: 500,
    color: th.text, background: th.bg,
    border: `1px solid ${th.border}`,
    padding: '10px 18px', borderRadius: 8, height: 40,
    boxSizing: 'border-box', lineHeight: 1.4,
    cursor: 'pointer', display: 'inline-block',
    fontFamily: 'inherit', textDecoration: 'none',
    width: full ? '100%' : undefined, textAlign: 'center',
    transition: 'background 0.15s ease, border-color 0.15s ease',
  };
}

export const primaryHover = {
  onMouseEnter: (e) => { e.currentTarget.style.opacity = '0.9'; },
  onMouseLeave: (e) => { e.currentTarget.style.opacity = '1'; },
};

export function ghostHover(th) {
  return {
    onMouseEnter: (e) => {
      e.currentTarget.style.background = th.bgHover;
      e.currentTarget.style.borderColor = th.borderHv;
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.background = th.bg;
      e.currentTarget.style.borderColor = th.border;
    },
  };
}

// Style input avec focus ring shadcn
export function inputStyle(th, focused = false) {
  return {
    width: '100%', padding: '10px 14px',
    borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
    background: th.inputBg, color: th.text,
    border: `1px solid ${focused ? th.ring : th.borderInput}`,
    boxShadow: focused ? `0 0 0 3px ${th.ring}1a` : 'none',
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    height: 40,
  };
}
