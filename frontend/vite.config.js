import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
    historyApiFallback: true,
  },

  build: {
    outDir: 'dist',
    // ── Code splitting : réduit le bundle initial de ~3.4MB → ~200KB ──────
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor React (chargé en premier).
          // Slash trailing OBLIGATOIRE — sinon "node_modules/react" matche
          // accidentellement react-phone-number-input et toute autre lib
          // commençant par "react-" (cf. fix commit 20a : la lib finissait
          // dans vendor-react alors que ses sous-deps libphonenumber-js /
          // country-flag-icons restaient ailleurs → circular chunk + crash
          // "Cannot read properties of undefined (reading 'createContext')").
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/scheduler/')) {
            return 'vendor-react';
          }
          // Vendor téléphone — react-phone-number-input + ses sous-deps
          // (libphonenumber-js, country-flag-icons, classnames) regroupés
          // dans un même chunk, chargé à la demande quand un écran utilise
          // <PhoneInput/>. Évite la circularité avec vendor-react.
          if (id.includes('node_modules/react-phone-number-input') ||
              id.includes('node_modules/libphonenumber-js') ||
              id.includes('node_modules/country-flag-icons') ||
              id.includes('node_modules/classnames')) {
            return 'vendor-phone';
          }
          // Pages lourdes — chargées à la demande
          if (id.includes('pages/BookingPage'))    return 'page-booking';
          if (id.includes('pages/Settings'))       return 'page-settings';
          if (id.includes('pages/EmployeeAgenda')) return 'page-agenda';
        },
      },
    },
    // ── Optimisations build ───────────────────────────────────────────────
    chunkSizeWarningLimit: 700,
    sourcemap: false,          // désactiver en prod (réduit taille 40%)
    minify: 'terser',          // meilleure compression que esbuild
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true },
    },
  },

  // ── Optimisation des dépendances ─────────────────────────────────────────
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
});
