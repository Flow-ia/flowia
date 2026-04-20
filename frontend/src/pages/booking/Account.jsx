// src/pages/booking/Account.jsx
// Re-export du dossier ./account (refactor — le code a été décomposé).
// Composants compte client : AuthPanel + PostRegisterPopup + GlobalAccountView.
// Chemin explicite vers index.jsx pour éviter que Rollup (Windows case-insensitive)
// confonde './account' avec ce fichier './Account.jsx'.
export { AuthPanel, PostRegisterPopup, GlobalAccountView } from './account/index.jsx';
