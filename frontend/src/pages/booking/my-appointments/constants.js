// src/pages/booking/my-appointments/constants.js
// Constantes partagées pour l'écran "Mes RDV" / onglets client.

export const VISITS_PAGE_SIZE = 10;

// URL par onglet — permet à chaque client de rafraîchir la page sur son
// sous-onglet actif (RDV, passages sur place, profil, parrainage).
export const TAB_URL = {
  appts:   (slug) => `/book/${slug}/client/rdv`,
  visits:  (slug) => `/book/${slug}/client/passages`,
  profile: (slug) => `/book/${slug}/client/profil`,
  parrain: (slug) => `/book/${slug}/client/rdv`, // parrainage partage l'URL RDV
  cards:   (slug) => `/book/${slug}/client/cartes`,
};

export const DELETE_PHRASE = 'supprimer';
