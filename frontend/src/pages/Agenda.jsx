// Pont historique vers ConfigTab (utilisé par settings/TabBookingConfig.jsx
// pour afficher la config booking dans Réglages > Réservation > Configuration).
// L'orchestrateur d'origine pages/agenda/index.jsx a été supprimé (refonte) :
// les routes /agenda utilisent EmployeeAgenda, plus Agenda.
export { default as ConfigTab } from './agenda/tabs/ConfigTab.jsx';
