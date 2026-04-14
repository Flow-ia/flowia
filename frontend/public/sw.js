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

// ── Clic sur une notification ─────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || '/agenda';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Réutiliser un onglet déjà ouvert si possible
      const existing = clientList.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.postMessage({ type: 'navigate', url: urlToOpen }); return; }
      return self.clients.openWindow(urlToOpen);
    })
  );
});
