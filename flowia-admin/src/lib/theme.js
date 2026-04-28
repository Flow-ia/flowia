// theme.js — Persistance du theme dark|light dans localStorage et application
// d'un attribut data-theme sur <html> pour que les variables CSS bascule
// automatiquement (cf global.css).

const KEY = 'flowia_admin_theme';

export function getTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' ? 'light' : 'dark';
  } catch { return 'dark'; }
}

export function setTheme(t) {
  const next = t === 'light' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch {}
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', next);
  }
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

// Applique le theme stocke des le boot pour eviter le flash dark->light.
export function applyInitialTheme() {
  setTheme(getTheme());
}
