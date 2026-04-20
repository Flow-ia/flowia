// src/pages/clients/constants.js
// ─── Constantes partagées ─────────────────────────────────────────────────────

export const STATUS_COLOR = { pending:'#f59e0b', confirmed:'#10b981', cancelled:'#ef4444', completed:'#111827', no_show:'#94a3b8' };
export const STATUS_LABEL = { pending:'En attente', confirmed:'Confirme', cancelled:'Annule', completed:'Termine', no_show:'Absent' };

export const SORT_OPTS = [
  { value: 'name',     label: 'A → Z (nom)' },
  { value: 'visits',   label: 'Plus de visites' },
  { value: 'spending', label: 'Plus de depenses' },
  { value: 'recent',   label: 'Récemment ajoutes' },
];

export const PAGE_SIZE = 5;

export const PAYMENT_METHODS = [
  { id:'card',     label:'Carte bancaire', icon:'💳' },
  { id:'cash',     label:'Especes',        icon:'💵' },
  { id:'transfer', label:'Virement',       icon:'🏦' },
  { id:'other',    label:'Autre',          icon:'•••' },
];

export const PLABELS = { cash:'Especes', card:'Carte', transfer:'Virement', other:'Autre' };
