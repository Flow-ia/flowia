// src/pages/clients/constants.js
// ─── Constantes partagees ─────────────────────────────────────────────────────

// Palette pastel unifiee (alignee sur STATUS_PALETTE)
// STATUS_* = couleur accent (puce, barre) ; bg/text via STATUS_CFG
export const STATUS_COLOR = {
  pending:   '#f59e0b',
  confirmed: '#6366f1',
  cancelled: '#ef4444',
  completed: '#10b981',
  no_show:   '#fb923c',
};
export const STATUS_CFG = {
  pending:   { bg: '#fffbeb', text: '#92400e', accent: '#f59e0b' },
  confirmed: { bg: '#eef2ff', text: '#4338ca', accent: '#6366f1' },
  cancelled: { bg: '#fef2f2', text: '#991b1b', accent: '#ef4444' },
  completed: { bg: '#f0fdf4', text: '#065f46', accent: '#10b981' },
  no_show:   { bg: '#fff7ed', text: '#9a3412', accent: '#fb923c' },
};
export const STATUS_LABEL = {
  pending:   'En attente',
  confirmed: 'Confirme',
  cancelled: 'Annule',
  completed: 'Termine',
  no_show:   'Absent',
};

export const SORT_OPTS = [
  { value: 'name',     label: 'A → Z (nom)' },
  { value: 'visits',   label: 'Plus de visites' },
  { value: 'spending', label: 'Plus de depenses' },
  { value: 'recent',   label: 'Recemment ajoutes' },
];

export const PAGE_SIZE = 5;

export const PAYMENT_METHODS = [
  { id:'card',     label:'Carte bancaire', icon:'💳' },
  { id:'cash',     label:'Especes',        icon:'💵' },
  { id:'transfer', label:'Virement',       icon:'🏦' },
  { id:'other',    label:'Autre',          icon:'•••' },
];

export const PLABELS = { cash:'Especes', card:'Carte', transfer:'Virement', other:'Autre' };
