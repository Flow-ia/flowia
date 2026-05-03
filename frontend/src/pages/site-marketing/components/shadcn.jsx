// Tokens shadcn portés en inline styles (CLAUDE.md interdit Tailwind).
// Source unique de la palette zinc + ombres + radii pour le site marketing.
// Importer : import { S } from './components/shadcn';

export const S = {
  // Surfaces
  bg:        '#ffffff',
  bgMuted:   '#fafafa',  // zinc-50
  bgHover:   '#f4f4f5',  // zinc-100
  bgInverse: '#09090b',  // zinc-950
  // Foreground
  fg:        '#09090b',  // zinc-950
  fg2:       '#3f3f46',  // zinc-700
  fgMuted:   '#52525b',  // zinc-600
  fgSubtle:  '#71717a',  // zinc-500
  fgInv:     '#fafafa',  // zinc-50
  fgInvMut:  '#a1a1aa',  // zinc-400
  // Borders
  border:    '#e4e4e7',  // zinc-200
  borderHv:  '#d4d4d8',  // zinc-300
  borderInv: 'rgba(255,255,255,0.10)',
  // Ring (focus)
  ring:      '#18181b',  // zinc-900
  // Shadows
  shadowSm:  '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  shadowMd:  '0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
  shadowLg:  '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.06)',
  shadowXl:  '0 20px 25px -5px rgb(0 0 0 / 0.10), 0 8px 10px -6px rgb(0 0 0 / 0.06)',
  // Radii
  rSm: 6, r: 8, rLg: 12, rXl: 16,
  // Accents (utilisés avec parcimonie : pills, statuts, badges)
  ax: {
    violet:  '#7c3aed', violetBg:  '#f5f3ff',
    blue:    '#2563eb', blueBg:    '#eff6ff',
    emerald: '#059669', emeraldBg: '#ecfdf5',
    amber:   '#d97706', amberBg:   '#fffbeb',
    rose:    '#e11d48', roseBg:    '#fff1f2',
    cyan:    '#0891b2', cyanBg:    '#ecfeff',
    indigo:  '#4f46e5', indigoBg:  '#eef2ff',
  },
};

// ── Btn styles partagés ──────────────────────────────────────────────────────
export function primaryBtnStyle() {
  return {
    fontSize: 14, fontWeight: 500, color: S.fgInv,
    background: S.fg, border: `1px solid ${S.fg}`,
    padding: '10px 18px', borderRadius: S.r, height: 40,
    boxSizing: 'border-box', lineHeight: 1.4,
    textDecoration: 'none', cursor: 'pointer',
    display: 'inline-block', fontFamily: 'inherit',
    transition: 'opacity 0.15s ease',
  };
}

export function ghostBtnStyle() {
  return {
    fontSize: 14, fontWeight: 500, color: S.fg,
    background: S.bg, border: `1px solid ${S.border}`,
    padding: '10px 18px', borderRadius: S.r, height: 40,
    boxSizing: 'border-box', lineHeight: 1.4,
    textDecoration: 'none', cursor: 'pointer',
    display: 'inline-block', fontFamily: 'inherit',
    transition: 'background 0.15s ease, border-color 0.15s ease',
  };
}

// ── Hover handlers réutilisables ─────────────────────────────────────────────
export const primaryHover = {
  onMouseEnter: (e) => { e.currentTarget.style.opacity = '0.9'; },
  onMouseLeave: (e) => { e.currentTarget.style.opacity = '1'; },
};

export const ghostHover = {
  onMouseEnter: (e) => {
    e.currentTarget.style.background = S.bgHover;
    e.currentTarget.style.borderColor = S.borderHv;
  },
  onMouseLeave: (e) => {
    e.currentTarget.style.background = S.bg;
    e.currentTarget.style.borderColor = S.border;
  },
};

export const cardHover = {
  onMouseEnter: (e) => {
    e.currentTarget.style.borderColor = S.borderHv;
    e.currentTarget.style.boxShadow = S.shadowMd;
  },
  onMouseLeave: (e) => {
    e.currentTarget.style.borderColor = S.border;
    e.currentTarget.style.boxShadow = 'none';
  },
};

// ── Icônes inline (caret, check) — pas de lib ────────────────────────────────
export function CheckIcon({ color = S.ax.emerald, size = 8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path d="M2.5 6L5 8.5L9.5 3.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckPill({ color = S.ax.emerald, bg = S.ax.emeraldBg }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, borderRadius: 7, background: bg, flexShrink: 0,
    }}>
      <CheckIcon color={color} />
    </span>
  );
}

export function CaretDown({ open = false, color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" style={{
      transform: open ? 'rotate(180deg)' : 'rotate(0)',
      transition: 'transform 0.2s ease', flexShrink: 0,
    }}>
      <path d="M3 4.5L6 7.5L9 4.5" stroke={color || S.fgMuted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
