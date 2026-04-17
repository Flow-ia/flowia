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
          // Vendor React (chargé en premier)
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router-dom')) {
            return 'vendor-react';
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
      compress: { drop_console: false, drop_debugger: true },
    },
  },

  // ── Optimisation des dépendances ─────────────────────────────────────────
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
});
