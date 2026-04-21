// Palette de statuts universelle — utilisee par StatusBadge et les encarts pastel
// La variante "neutral" depend du theme : utiliser getStatusPalette(t) pour la recuperer.

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
