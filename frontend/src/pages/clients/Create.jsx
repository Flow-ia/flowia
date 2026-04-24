// Clients > Create — alias de structure (brief commit 8).
// L'implémentation vit dans `views/CreateView.jsx` depuis le départ pour
// garder l'orchestrateur `index.jsx` en contrôle du state. Ce re-export
// satisfait la structure demandée sans dédoubler le composant.
export { default } from './views/CreateView';
