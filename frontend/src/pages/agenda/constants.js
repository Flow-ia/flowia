export const DAYS_FR    = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
export const DAYS_FULL  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
export const MONTHS_FR  = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Decembre'];
export const MONTHS_SH  = ['Janv','Fevr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Dec'];

// Palette pastel (aligned on STATUS_GRID / STATUS_PALETTE) — utilisée par
// ApptModal, ApptListCard. Chaque entrée expose :
//   bg     → fond encart / badge
//   color  → texte (utilisé comme couleur principale)
//   accent → couleur de puce/barre (plus saturée)
export const STATUS_CFG = {
  confirmed: { label:'Confirme',   bg:'#eef2ff', color:'#4338ca', accent:'#6366f1' },
  pending:   { label:'En attente', bg:'#fffbeb', color:'#92400e', accent:'#f59e0b' },
  cancelled: { label:'Annule',     bg:'#fef2f2', color:'#991b1b', accent:'#ef4444' },
  completed: { label:'Termine',    bg:'#f0fdf4', color:'#065f46', accent:'#10b981' },
  no_show:   { label:'Absent',     bg:'#fff7ed', color:'#9a3412', accent:'#fb923c' },
};

export const STATUS_GRID = {
  confirmed: { bg:'#eef2ff', bd:'#c7d2fe', tx:'#4338ca' },
  pending:   { bg:'#fffbeb', bd:'#fde68a', tx:'#92400e' },
  cancelled: { bg:'#fef2f2', bd:'#fecaca', tx:'#991b1b' },
  completed: { bg:'#f0fdf4', bd:'#a7f3d0', tx:'#065f46' },
  no_show:   { bg:'#fff7ed', bd:'#fed7aa', tx:'#9a3412' },
};

export const PAY_OPTS = [
  { id:'cash',     label:'Especes',  icon:'💵' },
  { id:'card',     label:'Carte',    icon:'💳' },
  { id:'transfer', label:'Virement', icon:'🏦' },
  { id:'other',    label:'Autre',    icon:'🔄' },
];

export const COLORS = ['#111827','#374151','#4ade80','#f59e0b','#f87171','#ec4899','#374151','#a78bfa','#34d399'];
