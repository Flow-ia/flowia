// Service Worker — FlowIA (PWA + Web Push)
// Bump SW_VERSION pour forcer un refresh chez tous les clients (push & cache).
const SW_VERSION   = '2026-04-30-pwa-3';
const CACHE_NAME   = 'flowia-shell-' + SW_VERSION;
const OFFLINE_URL  = '/index.html';
// App shell minimal — uniquement statiques sûrs. Vite hash les bundles JS/CSS,
// donc on les laisse au runtime cache (cache-first). Les images PWA sont
// pré-cachées pour l'install prompt et l'offline.
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-384.png',
  '/badge-72.png',
  '/apple-touch-icon.png',
  '/images/logo-app.png',
  '/images/favicon.png',
];

self.addEventListener('install', event => {
  console.log('[SW] install v' + SW_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(e => {
        // Pré-cache best-effort : un 404 sur un asset ne doit pas bloquer
        // l'installation du SW (sinon les push notifs ne s'enregistrent plus).
        console.warn('[SW] precache partiel:', e?.message);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] activate v' + SW_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('flowia-shell-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Stratégie fetch ──────────────────────────────────────────────────────────
// - Navigation (HTML) : network-first → fallback cache offline (index.html).
//   Évite de servir un bundle obsolète après un déploiement Vercel.
// - API (/api/*) : passe au réseau, jamais cache (données live, auth, push sub).
// - Assets immutables Vite (/assets/*) : cache-first (hash dans le nom).
// - Autres GET same-origin : stale-while-revalidate.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API : toujours réseau, pas de cache (auth, push, RGPD)
  if (url.pathname.startsWith('/api/')) return;

  // Navigation HTML
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Assets buildés Vite (hash → cache-first immutable)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // Reste : stale-while-revalidate (icônes, manifest, images publiques)
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// ── Réception d'une push notification ────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: 'FlowIA', body: event.data.text() }; }

  const { type = '', title = 'FlowIA', body = '', icon = '/icon-192.png', data = {} } = payload;

  const options = {
    body,
    icon,
    badge: '/badge-72.png',
    vibrate: type.startsWith('new_appointment') ? [200, 100, 200] : [100, 50, 100],
    tag: type + (data.appointment_id ? '-' + data.appointment_id : ''),
    renotify: true,
    requireInteraction: type.startsWith('new_appointment'),
    data: { ...data, type },
    actions: type.startsWith('new_appointment') ? [
      { action: 'view',    title: "Voir l'agenda" },
      { action: 'dismiss', title: 'Ignorer' },
    ] : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Validation d'URL : n'accepte QUE les chemins relatifs internes (/xxx) ──
// Protection contre un payload poisoned qui forcerait une redirection vers
// javascript:, http://evil.com, //evil.com, ou un SSO callback malicieux.
function safeInternalPath(raw, fallback = '/agenda') {
  if (typeof raw !== 'string' || !raw.length) return fallback;
  if (raw[0] !== '/') return fallback;
  if (raw.startsWith('//')) return fallback;
  if (/[\x00-\x1f]/.test(raw)) return fallback;
  if (raw.includes('\\')) return fallback;
  return raw;
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const urlToOpen = safeInternalPath(event.notification.data?.url, '/agenda');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existing = clientList.find(c =>
        c.url.startsWith(self.location.origin + '/') || c.url === self.location.origin
      );
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'navigate', url: urlToOpen });
        return;
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// ── Message du client (skipWaiting forcé après update) ──────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
