// src/pages/booking/shared.jsx
// Constantes, helpers et petits composants partagés du site de réservation.
import { mediaApi } from '../../utils/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
export const withV = (url, v) => v ? `${url}?v=${v}` : url;
export const serviceImgUrl  = (id, v) => withV(`${API_BASE}/media/service/${id}/image`, v);
export const employeeImgUrl = (id, v) => withV(`${API_BASE}/media/employee/${id}/image`, v);
export const mediaUrl = (u) => mediaApi.absoluteUrl(u);

export const MONTHS_FR = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Decembre'];
export const DAYS_MINI = ['L','M','M','J','V','S','D'];

// ── Thème light/dark ──────────────────────────────────────────────────────────
export const LIGHT_THEME = {
  mode:        'light',
  bg:          '#f7f7f7',
  card:        '#ffffff',
  cardAlt:     '#fafafa',
  text:        '#1a1a1a',
  muted:       '#6b7280',
  dim:         '#9ca3af',
  border:      '#e5e7eb',
  inputBg:     '#ffffff',
  inputBorder: '#d1d5db',
  accent:      '#1a1a1a',
  accentBtn:   '#1a1a1a',
  accentText:  '#ffffff',
  navBg:       '#ffffff',
  navBorder:   '#e5e7eb',
  sidebarBg:   '#ffffff',
};
export const DARK_THEME = {
  mode:        'dark',
  bg:          '#0f0f0f',
  card:        '#1a1a1a',
  cardAlt:     '#111111',
  text:        '#f5f5f5',
  muted:       '#9ca3af',
  dim:         '#6b7280',
  border:      '#2a2a2a',
  inputBg:     '#1f1f1f',
  inputBorder: '#333333',
  accent:      '#f5f5f5',
  accentBtn:   '#ffffff',
  accentText:  '#000000',
  navBg:       '#1a1a1a',
  navBorder:   '#2a2a2a',
  sidebarBg:   '#1a1a1a',
};

export function Spinner({ color = '#7c6af7' }) {
  return <div className="w-8 h-8 rounded-full border-2 animate-spin mx-auto"
    style={{ borderColor:`${color}30`, borderTopColor:color }} />;
}

export function ThemeToggle({ th, onToggle }) {
  return (
    <button onClick={onToggle}
      className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all"
      style={{ background: th.card, border:`1px solid ${th.border}` }}>
      {th.mode === 'dark'
        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" style={{color:th.text}}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" style={{color:th.text}}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      }
    </button>
  );
}

export function BackBtn({ onClick, label, th }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm mb-4" style={{color:th.muted}}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="15 18 9 12 15 6"/></svg>
      {label}
    </button>
  );
}
