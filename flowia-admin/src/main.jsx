import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { applyInitialTheme } from './lib/theme.js';

// Applique le theme stocke avant le 1er render pour eviter un flash dark<->light.
applyInitialTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
