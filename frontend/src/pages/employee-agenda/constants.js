// src/pages/employee-agenda/constants.js
export const DAYS_FR   = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
export const DAYS_FULL = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
export const MONTHS_FR = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Decembre'];
export const MONTHS_SH = ['Janv','Fevr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Dec'];

// Palette pastel unifiee (alignee sur pages/agenda/constants + STATUS_PALETTE)
//   bg     → fond encart / badge
//   color  → couleur texte
//   accent → puce, barre, dot (couleur saturee)
export const STATUS_CFG = {
  confirmed: { label:'Confirme',   bg:'#eef2ff', color:'#4338ca', accent:'#6366f1' },
  pending:   { label:'En attente', bg:'#fffbeb', color:'#92400e', accent:'#f59e0b' },
  cancelled: { label:'Annule',     bg:'#fef2f2', color:'#991b1b', accent:'#ef4444' },
  completed: { label:'Termine',    bg:'#f0fdf4', color:'#065f46', accent:'#10b981' },
  no_show:   { label:'Absent',     bg:'#fff7ed', color:'#9a3412', accent:'#fb923c' },
};

// bd = accent sature utilise pour la barre verticale 2px sur les RDV
export const STATUS_GRID = {
  confirmed: { bg:'#eef2ff', bd:'#6366f1', tx:'#4338ca' },
  pending:   { bg:'#fffbeb', bd:'#f59e0b', tx:'#92400e' },
  cancelled: { bg:'#fef2f2', bd:'#ef4444', tx:'#991b1b' },
  completed: { bg:'#f0fdf4', bd:'#10b981', tx:'#065f46' },
  no_show:   { bg:'#fff7ed', bd:'#fb923c', tx:'#9a3412' },
};

export const PAY_OPTIONS = [
  { id:'cash',     label:'Especes',  icon:'💵' },
  { id:'card',     label:'Carte',    icon:'💳' },
  { id:'transfer', label:'Virement', icon:'🏦' },
  { id:'other',    label:'Autre',    icon:'🔄' },
];
