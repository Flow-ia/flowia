// src/pwa/registerSW.js
// Enregistrement du Service Worker au démarrage côté commerçant.
// Indispensable pour : 1) PWA installable (Chrome exige un SW au scope /),
// 2) Push notifications déjà-prêtes (subscribe ne re-déclenche plus de register),
// 3) Cache offline minimal de l'app shell.
//
// On NE l'enregistre PAS sur le domaine public booking : la page de réservation
// publique n'a pas besoin d'être PWA (séjours courts, pas d'install).

const SW_URL = '/sw.js';

let updateListeners = [];
export function onSWUpdate(cb) {
  updateListeners.push(cb);
  return () => { updateListeners = updateListeners.filter(f => f !== cb); };
}

export function registerSW() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // Pas de SW en dev sur un port différent de 3000 — évite les conflits HMR.
  // En prod (Vercel) on a toujours HTTPS et navigateur OK.
  if (location.hostname === 'localhost' && location.port && location.port !== '3000') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL, { scope: '/' })
      .then(reg => {
        // Si un SW est déjà en attente au boot (cas typique : l'utilisateur
        // a fermé/rouvert la PWA après un déploiement), on notifie tout de
        // suite pour afficher le bandeau "Mise à jour disponible".
        if (reg.waiting && navigator.serviceWorker.controller) {
          updateListeners.forEach(cb => { try { cb(reg); } catch {} });
        }

        // Détection d'une nouvelle version disponible.
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              updateListeners.forEach(cb => { try { cb(reg); } catch {} });
            }
          });
        });

        // Check d'update : (1) au retour au premier plan, (2) toutes les
        // 30 min en arrière-plan tant que l'app reste ouverte. Couvre les
        // commerçants qui laissent la PWA tourner toute la journée sans la
        // fermer (cas typique : tablette caisse).
        const checkForUpdate = () => { reg.update().catch(() => {}); };
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
        setInterval(checkForUpdate, 30 * 60 * 1000);
      })
      .catch(e => console.warn('[SW] register échec:', e?.message));

    // Reload au changement de controller (après skipWaiting()) — évite la
    // double-activation : on ne reload qu'une fois.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

// Force l'activation d'une nouvelle version du SW en attente.
export async function activateWaitingSW() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}
