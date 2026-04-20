export const DAYS_FR    = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
export const DAYS_FULL  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
export const MONTHS_FR  = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Decembre'];
export const MONTHS_SH  = ['Janv','Fevr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Dec'];

export const STATUS_CFG = {
  confirmed: { label:'Confirme',   color:'#4ade80', bg:'rgba(74,222,128,0.12)'  },
  pending:   { label:'En attente', color:'#fbbf24', bg:'rgba(251,191,36,0.12)'  },
  cancelled: { label:'Annule',     color:'#f87171', bg:'rgba(248,113,113,0.12)' },
  completed: { label:'Termine',    color:'#94a3b8', bg:'rgba(148,163,184,0.12)' },
  no_show:   { label:'Absent',     color:'#fb923c', bg:'rgba(251,146,60,0.12)'  },
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
