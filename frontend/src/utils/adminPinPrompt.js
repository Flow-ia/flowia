// Refonte FDS-2026 commit 16 — bus mini pour ré-ouvrir la modale PIN admin
// quand le ff_pin_token a expiré pendant que l'utilisateur reste en mode admin
// (typiquement après 2h, plus court que la session admin localStorage qui peut
// durer plusieurs heures).
//
// Usage côté UI (App.jsx) : registerAdminPinHandler((opts) => openModal()).
// Usage côté requête (api.js) : await requestAdminPin() avant de retry une
// route 403 ACTION_ADMIN_ONLY. La promise se résout quand l'utilisateur valide
// son PIN (succès) ou rejette si la modale est fermée sans saisie.
let _handler = null;
let _pending = null;

export function registerAdminPinHandler(fn) {
  _handler = typeof fn === 'function' ? fn : null;
  return () => { if (_handler === fn) _handler = null; };
}

// Retourne une promise. Plusieurs appels concurrents partagent la même promise
// pour qu'on n'ouvre qu'une seule modale même si N requêtes 403 reviennent en
// parallèle. La modale se résout pour TOUTES les requêtes en attente d'un coup.
export function requestAdminPin() {
  if (_pending) return _pending.promise;
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  _pending = { promise, resolve, reject };
  if (_handler) {
    try {
      _handler({
        onSuccess: () => { const p = _pending; _pending = null; p?.resolve({ ok: true }); },
        onCancel:  () => { const p = _pending; _pending = null; p?.reject(new Error('PIN_PROMPT_CANCELLED')); },
      });
    } catch (e) {
      const p = _pending; _pending = null; p?.reject(e);
    }
  } else {
    // Pas de handler enregistré (App pas encore montée) → fallback : on rejette
    // immédiatement. La requête échouera proprement avec son 403 d'origine.
    const p = _pending; _pending = null;
    p?.reject(new Error('PIN_PROMPT_NO_HANDLER'));
  }
  return promise;
}

// Permet à App.jsx de résoudre la promise pendante depuis la modale qui n'a
// pas reçu directement onSuccess/onCancel (par ex. le bouton X de la modale).
export function resolveAdminPinPrompt(success) {
  if (!_pending) return;
  const p = _pending; _pending = null;
  if (success) p.resolve({ ok: true });
  else         p.reject(new Error('PIN_PROMPT_CANCELLED'));
}
