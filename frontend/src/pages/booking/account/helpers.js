// src/pages/booking/account/helpers.js
// Constantes et utilitaires partagés par AuthPanel / PostRegisterPopup /
// GlobalAccountView. Extraits inchangés depuis Account.jsx d'origine.

// Mois pour le sélecteur de date de naissance (PostRegisterPopup)
export const MONTHS = [
  ['01','Janvier'],['02','Février'],['03','Mars'],['04','Avril'],
  ['05','Mai'],['06','Juin'],['07','Juillet'],['08','Août'],
  ['09','Septembre'],['10','Octobre'],['11','Novembre'],['12','Décembre'],
];

// Couleurs et libellés par statut de rendez-vous (GlobalAccountView)
export const STATUS_COLORS = {
  pending:'#f59e0b', confirmed:'#10b981', cancelled:'#ef4444',
  completed:'#6366f1', no_show:'#94a3b8',
};

export const STATUS_LABELS = {
  pending:'En attente', confirmed:'Confirme', cancelled:'Annule',
  completed:'Termine', no_show:'Absent',
};

// Formatage date courte fr-FR
export const fmtD = s => {
  if (!s) return '-';
  const str = String(s).substring(0,10);
  return new Date(str + 'T12:00:00').toLocaleDateString('fr-FR', {
    day:'2-digit', month:'short', year:'numeric',
  });
};
