// Service Worker — FlowFinances
// Gère les push notifications Web Push en arrière-plan

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// ── Réception d'une push notification ────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: 'FlowFinances', body: event.data.text() }; }

  const { type = '', title = 'FlowFinances', body = '', icon = '/icon-192.png', data = {} } = payload;

  const options = {
    body,
    icon,
    badge: '/badge-72.png',
    vibrate: type === 'new_appointment' ? [200, 100, 200] : [100, 50, 100],
    tag: type + (data.appointment_id ? '-' + data.appointment_id : ''),
    renotify: true,
    data: { ...data, type },
    actions: type === 'new_appointment' ? [
      { action: 'view', title: '👀 Voir l\'agenda' },
      { action: 'dismiss', title: '✕ Ignorer' },
    ] : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Validation d'URL : n'accepte QUE les chemins relatifs internes (/xxx) ──
// Protection contre un payload poisoned qui forcerait une redirection vers
// javascript:, http://evil.com, //evil.com, ou un SSO callback malicieux.
// Un path doit commencer par '/' et ne pas être un protocol (// ou :).
function safeInternalPath(raw, fallback = '/agenda') {
  if (typeof raw !== 'string' || !raw.length) return fallback;
  if (raw[0] !== '/') return fallback;                // pas relatif
  if (raw.startsWith('//')) return fallback;          // protocol-relative
  if (/[\x00-\x1f]/.test(raw)) return fallback;       // control chars
  if (raw.includes('\\')) return fallback;            // backslash tricks
  return raw;
}

// ── Clic sur une notification ─────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const urlToOpen = safeInternalPath(event.notification.data?.url, '/agenda');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Réutiliser un onglet déjà ouvert si possible.
      // startsWith(origin + '/') évite qu'un site tiers contenant l'origin
      // dans son URL matche par erreur.
      const existing = clientList.find(c => c.url.startsWith(self.location.origin + '/') || c.url === self.location.origin);
      if (existing) { existing.focus(); existing.postMessage({ type: 'navigate', url: urlToOpen }); return; }
      // openWindow avec un path relatif → scope du SW garanti
      return self.clients.openWindow(urlToOpen);
    })
  );
});
