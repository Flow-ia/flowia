// src/pages/employee-agenda/constants.js
export const DAYS_FR   = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
export const DAYS_FULL = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
export const MONTHS_FR = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Decembre'];
export const MONTHS_SH = ['Janv','Fevr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Dec'];

export const STATUS_CFG = {
  confirmed: { label:'Confirme',   color:'#22c55e', bg:'rgba(34,197,94,0.1)',   dot:'#22c55e' },
  pending:   { label:'En attente', color:'#f59e0b', bg:'rgba(245,158,11,0.1)',  dot:'#f59e0b' },
  cancelled: { label:'Annule',     color:'#ef4444', bg:'rgba(239,68,68,0.08)',  dot:'#ef4444' },
  completed: { label:'Termine',    color:'#111827', bg:'rgba(17,24,39,0.08)', dot:'#111827' },
  no_show:   { label:'Absent',     color:'#f97316', bg:'rgba(249,115,22,0.08)', dot:'#f97316' },
};

export const STATUS_GRID = {
  confirmed: { bg:'rgba(34,197,94,0.08)',   bd:'rgba(34,197,94,0.2)',   tx:'#16a34a' },
  pending:   { bg:'rgba(245,158,11,0.08)',  bd:'rgba(245,158,11,0.2)',  tx:'#d97706' },
  cancelled: { bg:'rgba(239,68,68,0.06)',   bd:'rgba(239,68,68,0.15)',  tx:'#dc2626' },
  completed: { bg:'rgba(17,24,39,0.08)',  bd:'rgba(17,24,39,0.2)',  tx:'#4f46e5' },
  no_show:   { bg:'rgba(249,115,22,0.08)',  bd:'rgba(249,115,22,0.2)',  tx:'#ea580c' },
};

export const PAY_OPTIONS = [
  { id:'cash',     label:'Especes',  icon:'💵' },
  { id:'card',     label:'Carte',    icon:'💳' },
  { id:'transfer', label:'Virement', icon:'🏦' },
  { id:'other',    label:'Autre',    icon:'🔄' },
];
