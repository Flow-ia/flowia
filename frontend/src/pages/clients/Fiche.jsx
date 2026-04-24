// Clients > Fiche — alias de structure (brief commit 8).
// Orchestrateur des 4 onglets (Info, History, Credit, Notes). Le state
// complet (édition, crédit, PIN employé) est lifté dans `index.jsx` pour
// survivre aux changements d'onglets, donc on re-exporte le composant
// existant tel quel.
export { default } from './views/FicheView';
