import os from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import prerender from '@prerenderer/rollup-plugin';

// ── Prerendering SEO ─────────────────────────────────────────────────────────
// Genere un HTML statique par page marketing pour que Google/Bing et les
// apercus de liens (WhatsApp/Insta) voient le contenu reel (et les meta
// <Seo>) sans executer le JS. Actif uniquement au `vite build` ; on peut le
// desactiver avec PRERENDER=false (utile si Chromium indisponible en CI).
const MARKETING_ROUTES = [
  '/', '/fonctionnalites', '/tarifs', '/pour-qui', '/a-propos',
  '/contact', '/marketplace', '/mentions-legales', '/confidentialite', '/cgu',
];
const PRERENDER_ENABLED = process.env.PRERENDER !== 'false';

// Options de lancement de Chromium pour le prerender.
//  - Linux (Vercel = Amazon Linux) : le Chromium bundle par puppeteer manque
//    des libs systeme (libnss3.so) → build casse. @sparticuz/chromium fournit
//    un binaire autonome concu pour les environnements serverless Linux.
//  - Windows/macOS (dev local) : le Chromium bundle par puppeteer fonctionne.
async function puppeteerLaunchOptions() {
  if (os.platform() === 'linux') {
    const { default: chromium } = await import('@sparticuz/chromium');
    return {
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    };
  }
  return {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
}

export default defineConfig(async ({ command }) => ({
  plugins: [
    react(),
    ...(command === 'build' && PRERENDER_ENABLED
      ? [prerender({
          routes: MARKETING_ROUTES,
          renderer: '@prerenderer/renderer-puppeteer',
          rendererOptions: {
            maxConcurrentRoutes: 1,
            // L'app monte React + react-helmet-async applique les meta au
            // <head> apres le mount : on laisse le temps avant la capture.
            renderAfterTime: 7000,
            launchOptions: await puppeteerLaunchOptions(),
            // Lu par isMarketingHost() (index.jsx) pour forcer le rendu du
            // site marketing pendant le build (pas de vrai hostname ici).
            inject: { isPrerender: true },
          },
        })]
      : []),
  ],

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
}));
