// src/pages/clients/helpers.js
// ─── Utilitaires purs ─────────────────────────────────────────────────────────

export const fmtDate = (s) => {
  if (!s) return '-';
  try { return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(s); }
};

export const initials = (cl) => {
  const n = `${cl.first_name || ''} ${cl.last_name || ''}`.trim() || cl.email || '?';
  return n.charAt(0).toUpperCase();
};

export const avatarColor = (cl) => {
  const PAL = ['#111827','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#f97316','#14b8a6'];
  const s = `${cl.first_name || ''}${cl.email || ''}`;
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return PAL[Math.abs(h) % PAL.length];
};
