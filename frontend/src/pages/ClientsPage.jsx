// src/pages/ClientsPage.jsx
// Re-export vers le dossier décomposé clients/.
// Chemin explicite `./clients/index.jsx` pour contourner la casse Windows
// (FS case-insensitive vs résolution Vite case-sensitive).
export { default } from './clients/index.jsx';
