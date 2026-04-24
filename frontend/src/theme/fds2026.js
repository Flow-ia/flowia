// Tokens FDS-2026 — refonte commit 14.
// Source unique des constantes visuelles pour les écrans commerçants.
// Importer via `import { FDS } from '../../theme/fds2026';` et composer
// au besoin : `style={{ border: FDS.border, borderRadius: FDS.radius.xl }}`.
//
// Les palettes claire/sombre dynamiques restent gérées par useTheme().
// FDS sert de référence statique pour les couleurs pastel non-themables
// (moyens de paiement §15 INVENTAIRE) et les tokens FW/radius/border.
export const FDS = {
  colors: {
    bg:     '#fafafa',
    card:   '#fff',
    border: '#e5e7eb',
    text:   '#111827',
    muted:  '#6b7280',
    // Moyens de paiement pastel (§15 INVENTAIRE, §BRIEF commit 6).
    cashText:     '#065f46', cashBg:     '#f0fdf4',
    cardText:     '#4338ca', cardBg:     '#eef2ff',
    transferText: '#0e7490', transferBg: '#ecfeff',
    otherText:    '#92400e', otherBg:    '#fffbeb',
    multiText:    '#3c3489', multiBg:    '#eeedfe',
  },
  radius: {
    sm: 6,  // chip / pill
    md: 8,  // bouton
    lg: 10, // card secondaire
    xl: 12, // card principale / reglages card
  },
  border:      '0.5px solid #e5e7eb',
  borderLeft2: (accent) => '2px solid ' + accent, // accent coloré card principale
  fw: {
    normal: 400,
    medium: 500, // fw max FDS-2026 (pas de 600/700/800)
  },
};

export default FDS;
