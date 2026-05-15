// src/utils/api.js
import { requestAdminPin } from './adminPinPrompt';

const BASE = import.meta.env.VITE_API_URL || '/api';

// Garde contre les dispatchs répétés : plusieurs requêtes parallèles qui
// 401 en même temps ne doivent déclencher qu'un seul check.
let __meCheckInFlight = null;
// Fenêtre "grace period" post-login pour laisser le temps au nouveau token
// de se propager partout (useAuth BroadcastChannel, localStorage sync, etc.).
// Sans ce délai, un 401 transitoire juste après un login Google boucle :
// purge token frais → user=null → /login → re-login → rebelote.
let __lastLoginAt = 0;
export function notifyLoginJustHappened() { __lastLoginAt = Date.now(); }

// Décode le payload JWT sans vérifier la signature. Utilisé uniquement pour
// lire le claim `exp` côté client (économie d'un round-trip serveur quand
// un token est localement expiré). La décision d'autorisation reste côté
// backend via jwt.verify — ce check est purement un optimisation UX.
export function isJwtLocallyExpired(token) {
  if (!token || typeof token !== 'string') return true;
  const parts = token.split('.');
  if (parts.length !== 3) return true;
  try {
    // base64url → base64 (replace -_ by +/, pad)
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    if (!payload || typeof payload.exp !== 'number') return false;
    // 10s de marge pour couvrir un éventuel clock skew côté client
    return payload.exp * 1000 < Date.now() - 10_000;
  } catch { return true; }
}

function dispatchAuthExpired() {
  localStorage.removeItem('ff_token');
  localStorage.removeItem('ff_pin_token');
  try { window.dispatchEvent(new Event('ff-auth-expired')); } catch {}
}

// Admin commit 7 — gel/blocage compte. Le backend retourne 403 + code
// 'ACCOUNT_FROZEN' (merchant geled) ou 'ACCOUNT_BLOCKED' (client global
// bloque) sur TOUTE requete authentifiee, y compris pour des sessions deja
// ouvertes au moment du gel ou pour un re-login Google. On purge tous les
// tokens cote front, on memorise le message pour la page Login (qui l'affiche
// au mount), puis on declenche la deconnexion globale.
function handleAccountBlocked(data) {
  const code = data?.code;
  if (code !== 'ACCOUNT_FROZEN' && code !== 'ACCOUNT_BLOCKED') return false;
  const msg = data?.error || 'Votre compte est bloque. Merci de contacter notre equipe administrateurs FlowIA pour plus de details.';
  try { sessionStorage.setItem('ff_account_blocked_msg', msg); } catch {}
  ['ff_token','ff_pin_token','ff_oauth_merchant','ff_gc_token','ff_client_token']
    .forEach(k => { try { localStorage.removeItem(k); } catch {} });
  try { window.dispatchEvent(new CustomEvent('ff-account-blocked', { detail: { message: msg } })); } catch {}
  try { window.dispatchEvent(new Event('ff-auth-expired')); } catch {}
  return true;
}

// Admin commit 9 — feature gating (merchant) ou cannot_book (client). Le
// backend renvoie 403 + code FEATURE_BLOCKED ou CANNOT_BOOK. Pas de purge de
// session : l'utilisateur reste loggue, seule la fonctionnalite ciblee est
// bloquee. On dispatch un event que useAuth consomme pour afficher un overlay
// non-deconnectant avec le message du backend.
function handleFeatureBlocked(data) {
  const code = data?.code;
  if (code !== 'FEATURE_BLOCKED' && code !== 'CANNOT_BOOK' && code !== 'SLUG_LOCKED') return false;
  const msg = data?.error || "Cette fonctionnalite n'est pas accessible pour votre compte. Merci de contacter notre equipe pour plus de details.";
  try {
    window.dispatchEvent(new CustomEvent('ff-feature-blocked', {
      detail: { message: msg, code, feature: data?.feature || null }
    }));
  } catch {}
  return true;
}

// Appelé quand une requête merchant retourne 401. Purge les tokens locaux
// et signale useAuth pour qu'il remette user=null (l'app retombe alors
// sur /login). Sans ça, l'onglet resterait "logged in" en state React
// mais tous les fetch échoueraient silencieusement (bell vide, agenda
// vide, etc.) → comportement observé quand le JWT expire pendant qu'un
// onglet reste ouvert.
//
// Double-check via /auth/me AVANT de purger : un 401 transitoire (backend
// hiccup, latence replication DB, mauvais état intermédiaire) ne doit pas
// déconnecter un utilisateur avec un token encore valide.
function handleMerchant401(res, path) {
  if (res.status !== 401) return;
  // Pas de token local → rien à purger, juste signaler l'état null.
  const token = localStorage.getItem('ff_token');
  if (!token) { dispatchAuthExpired(); return; }
  // Grace period post-login : ignorer 401 pendant 15s après un login. Couvre
  // un cold start Render (peut atteindre 10-15s) + propagation React + tout
  // round-trip lent. Sans ça, un 401 transitoire purge un token frais et
  // déclenche une boucle login.
  if (Date.now() - __lastLoginAt < 15_000) return;
  // /auth/me lui-même 401 → verdict sans ambiguïté : token invalide/expiré.
  if (path === '/auth/me') { dispatchAuthExpired(); return; }
  // Déjà en cours de vérification → les autres 401 parallèles attendent.
  if (__meCheckInFlight) return;
  __meCheckInFlight = (async () => {
    try {
      const check = await fetch(`${BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (check.status === 401) dispatchAuthExpired();
      // Sinon : 401 transitoire, le token est encore valide — ne rien faire.
    } catch { /* réseau KO : on laisse le token intact */ }
    finally { __meCheckInFlight = null; }
  })();
}

function getToken() {
  let t = localStorage.getItem('ff_token');
  if (!t) {
    // Fallback : si la popup OAuth a écrit ff_oauth_merchant mais que l'event
    // listener n'a pas (encore) migré vers ff_token, on lit directement.
    // Évite les 401 fantômes sur le 1er render après OAuth.
    try {
      const raw = localStorage.getItem('ff_oauth_merchant');
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.token) {
          localStorage.setItem('ff_token', p.token);
          t = p.token;
        }
      }
    } catch {}
  }
  if (!t) return null;
  // Check local : si le token JWT est expiré selon son propre claim `exp`,
  // on ne l'envoie PAS (éviterait juste un 401 backend) et on purge. Évite
  // aussi le cas où un vieux token zombie traîne dans localStorage après
  // expiration et génère un 401 parasite au chargement de l'app.
  if (isJwtLocallyExpired(t)) {
    dispatchAuthExpired();
    return null;
  }
  return t;
}
function getPinToken() {
  return localStorage.getItem('ff_pin_token');
}
// Requête avec PIN admin (pour PUT/DELETE transactions, etc.).
//
// Refonte FDS-2026 commit 16 : si le serveur retourne 403 ACTION_ADMIN_ONLY
// (typiquement parce que ff_pin_token a expiré côté serveur), on ouvre la
// modale PIN admin (registerAdminPinHandler côté App.jsx), on attend la
// nouvelle saisie, puis on retry UNE fois la requête avec le nouveau token.
// Pas de bascule en mode normal — l'utilisateur reste « admin », il
// rafraîchit juste son token.
//
// Sliding session : chaque réponse admin contient `x-pin-session-refresh`
// (JWT 8h frais), capturé ici et écrit dans ff_pin_token. Tant que l'admin
// utilise activement l'app, son token est continuellement renouvelé ; la
// modale PIN ne ré-apparaît qu'après 8h d'inactivité totale.
async function adminRequest(path, options = {}) {
  const exec = async () => {
    const token    = getToken();
    const pinToken = getPinToken();
    const headers  = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token)    headers['Authorization'] = `Bearer ${token}`;
    if (pinToken) headers['x-pin-session'] = pinToken;
    const res  = await fetch(`${BASE}${path}`, { ...options, headers });
    handleMerchant401(res, path);
    // Sliding session : si le backend nous renvoie un x-pin-session-refresh,
    // on remplace ff_pin_token avant tout traitement de la réponse. Comme ça
    // les requêtes admin suivantes utilisent le token frais, et la modale PIN
    // ne ré-apparaît qu'après 8h d'inactivité complète (plus à chaque borne 8h
    // depuis la dernière saisie).
    try {
      const refreshed = res.headers.get('x-pin-session-refresh');
      if (refreshed) localStorage.setItem('ff_pin_token', refreshed);
    } catch { /* localStorage indisponible — token actuel garde sa TTL */ }
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) { handleAccountBlocked(data) || handleFeatureBlocked(data); }
    return { res, data };
  };
  let { res, data } = await exec();
  if (res.status === 403 && data?.error === 'ACTION_ADMIN_ONLY') {
    try {
      await requestAdminPin();
      ({ res, data } = await exec());
    } catch { /* modal annulée → on remonte le 403 d'origine */ }
  }
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || 'Erreur serveur'), { code: data.error });
  return data;
}

// Lit le token PIN employé stocké pour un employeeId donné (sessionStorage
// avec TTL 5 min client-side — cf. useEmployeePin). Utilisé pour envoyer
// x-employee-pin sur les routes sensibles.
function getEmployeePinToken(employeeId) {
  if (!employeeId) return null;
  try {
    const raw = sessionStorage.getItem('ff_emp_pin_' + employeeId);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.token || !obj?.ts) return null;
    if (Date.now() - obj.ts > 5 * 60 * 1000) {
      sessionStorage.removeItem('ff_emp_pin_' + employeeId);
      return null;
    }
    return obj.token;
  } catch { return null; }
}

// Emet un event global pour que OfflineBanner puisse afficher un bandeau
// si le reseau ou le serveur sont down. 5xx = serveur down, network error =
// reseau down. Apres un succes, emet 'ff-network-ok' pour clear le bandeau.
function emitNetworkError() {
  try { window.dispatchEvent(new Event('ff-network-error')); } catch {}
}
function emitNetworkOk() {
  try { window.dispatchEvent(new Event('ff-network-ok')); } catch {}
}

// Détection cold-start Render : 502/503/504 du proxy ou TypeError "Failed to
// fetch" (réponse 5xx sans CORS bloquée par le navigateur). Sur free tier,
// Render hiberne après 15 min d'inactivité ; le premier hit prend 5-15s pour
// réveiller le container, et peut renvoyer un 502/503 avant que le backend
// ne réponde. On retry avec backoff pour absorber ces hiccups sans que
// l'utilisateur voie d'erreur.
const RETRY_STATUSES = new Set([502, 503, 504]);
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function emitBackendWaking(attempt, max) {
  try {
    window.dispatchEvent(new CustomEvent('ff-backend-waking',
      { detail: { attempt, max } }));
  } catch {}
}
function emitBackendAwake() {
  try { window.dispatchEvent(new Event('ff-backend-awake')); } catch {}
}

async function request(path, options = {}, _attempt = 0) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Si actingEmployeeId fourni, injecter x-employee-pin header
  // (backend employeePinOptional.js vérifie + charge req.employee).
  if (options.actingEmployeeId) {
    const pinT = getEmployeePinToken(options.actingEmployeeId);
    if (pinT) headers['x-employee-pin'] = pinT;
  }

  const method     = String(options.method || 'GET').toUpperCase();
  const isReadOnly = method === 'GET' || method === 'HEAD';
  // Polling silencieux (notifs) : on ne retry pas pour ne pas spammer la
  // console à chaque réveil Render. Le poll suivant (30s) reprendra tout seul.
  const isQuietPoll = path.startsWith('/notifications/inapp');
  // GETs lourds : jusqu'à 3 retries (5-15s de backoff cumulé couvre un cold
  // start Render typique). Mutations : 1 seul retry uniquement sur erreur
  // RÉSEAU (le backend n'a probablement pas traité la requête) — pas sur 5xx
  // qui pourrait indiquer une mutation partielle.
  const maxRetries = isQuietPoll ? 0 : (isReadOnly ? 3 : 1);

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch (netErr) {
    emitNetworkError();
    if (_attempt < maxRetries) {
      emitBackendWaking(_attempt + 1, maxRetries);
      await delay(1000 * Math.pow(2, _attempt));
      return request(path, options, _attempt + 1);
    }
    throw netErr;
  }
  // 503 maintenance plateforme (super-admin a active le kill-switch). Le
  // backend pose un header X-Maintenance: 1 pour distinguer d'un 503 cold-
  // start qu'on retry. Ici on N'AUTORISE PAS le retry (c'est un etat actif
  // pas transitoire) et on dispatch un event pour que MaintenanceOverlay
  // s'affiche en plein ecran. On purge AUSSI tous les tokens locaux : un
  // user non-whitelisted qui prend un 503 doit etre deconnecte (ses
  // requetes futures echoueraient toutes de toute facon).
  if (res.status === 503 && res.headers.get('X-Maintenance') === '1') {
    let data = {};
    try { data = await res.clone().json(); } catch {}
    const scope = data.scope || res.headers.get('X-Maintenance-Scope') || 'merchant_portal';
    // Force-logout sur scope merchant uniquement (booking publique n'a pas
    // de session a purger pour les visiteurs anonymes).
    if (scope === 'merchant_portal' || scope === 'merchant_signup') {
      ['ff_token','ff_pin_token','ff_oauth_merchant','ff_gc_token','ff_client_token']
        .forEach(k => { try { localStorage.removeItem(k); } catch {} });
      try { window.dispatchEvent(new Event('ff-auth-expired')); } catch {}
    }
    try {
      window.dispatchEvent(new CustomEvent('ff-maintenance-on', {
        detail: { scope, message: data.message || '' }
      }));
    } catch {}
    const err = Object.assign(new Error(data.message || 'Plateforme en maintenance'), {
      code: 'maintenance', status: 503, data,
    });
    throw err;
  }
  // 5xx cold-start : retry uniquement pour GET (mutation pourrait avoir été
  // partiellement traitée côté backend, on évite les double-écritures).
  if (RETRY_STATUSES.has(res.status) && isReadOnly && _attempt < maxRetries) {
    emitNetworkError();
    emitBackendWaking(_attempt + 1, maxRetries);
    await delay(1000 * Math.pow(2, _attempt));
    return request(path, options, _attempt + 1);
  }
  // 5xx = serveur down. On signale aussi pour OfflineBanner (l'appelant
  // continue a recevoir l'erreur, on ne change rien au comportement existant).
  if (res.status >= 500) emitNetworkError();
  else { emitNetworkOk(); if (_attempt > 0) emitBackendAwake(); }
  handleMerchant401(res, path);
  const data = await res.json();
  if (res.status === 403) { handleAccountBlocked(data) || handleFeatureBlocked(data); }
  // 402 Payment Required : feature gated par plan d'abonnement. Le backend
  // (middleware/subscription.js requirePlan) renvoie { error, currentPlan,
  // requiredPlan, upgradeUrl }. On dispatche un event que le frontend ecoute
  // pour afficher une bannière d'upgrade contextuelle au lieu d'un toast brut.
  if (res.status === 402) {
    try {
      window.dispatchEvent(new CustomEvent('ff-plan-upgrade-required', { detail: data }));
    } catch {}
  }
  if (!res.ok) {
    const err = Object.assign(new Error(data.error || 'Erreur serveur'), { code: data.code });
    // Joindre le payload pour les 402 / 429 etc. (rate limit, plan upgrade).
    if (res.status === 402 || res.status === 429) err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // ── Auth — Inscription ──────────────────────────────────────────────────
  register:           (b) => request('/auth/register',            { method: 'POST', body: JSON.stringify(b) }),
  confirmRegister:    (b) => request('/auth/register/confirm',    { method: 'POST', body: JSON.stringify(b) }),
  resendCode:         (b) => request('/auth/resend-code',          { method: 'POST', body: JSON.stringify(b) }),
  deleteMerchantAccount: () => request('/auth/account',            { method: 'DELETE' }),

  // ── Auth — Connexion ────────────────────────────────────────────────────
  login:              (b) => request('/auth/login',               { method: 'POST', body: JSON.stringify(b) }),

  // ── Auth — Mot de passe oublié ──────────────────────────────────────────
  forgot:             (b) => request('/auth/forgot',              { method: 'POST', body: JSON.stringify(b) }),
  forgotVerify:       (b) => request('/auth/forgot/verify',       { method: 'POST', body: JSON.stringify(b) }),
  forgotReset:        (b) => request('/auth/forgot/reset',        { method: 'POST', body: JSON.stringify(b) }),

  // ── Auth — Changement email ─────────────────────────────────────────────
  changeEmail:        (b) => request('/auth/change-email',        { method: 'POST', body: JSON.stringify(b) }),
  confirmChangeEmail: (b) => request('/auth/change-email/confirm',{ method: 'POST', body: JSON.stringify(b) }),

  // ── Auth — Profil ───────────────────────────────────────────────────────
  me:                 ()  => request('/auth/me'),
  changePassword:     (b) => request('/auth/change-password', { method: 'POST', body: JSON.stringify(b) }),
  updateProfile:      (b) => request('/auth/profile',         { method: 'PUT',  body: JSON.stringify(b) }),
  completeOnboarding: (b) => request('/auth/onboarding',      { method: 'POST', body: JSON.stringify(b) }),
  // Wizard FirstRunSetup (post-inscription) : valider / re-declencher
  setupComplete:      ()  => request('/auth/setup-complete',  { method: 'POST' }),
  setupRestart:       ()  => request('/auth/setup-restart',   { method: 'POST' }),
  merchantGoogleAuthUrl: () => {
    const BACKEND = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');
    const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '376153951158-jm80phb46sl1fisbgeq587v83ho7ft5e.apps.googleusercontent.com';
    const redirectUri = `${BACKEND || window.location.origin}/api/auth/google/merchant/callback`;
    // On transmet l'origine de l'opener via `state` pour que le callback
    // route le postMessage vers le bon sous-domaine (validation allowlist
    // FRONTEND_URL côté backend).
    const state = `merchant|${encodeURIComponent(window.location.origin)}`;
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('openid email profile')}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
  },

  // ── PIN Admin — vérification via BDD (jamais en local) ──────────────────
  // Statut : le compte a-t-il un PIN en base ?
  pinStatus:          ()  => request('/auth/pin/status'),

  // Vérifier le PIN saisi → retourne { valid, pinSessionToken } si correct
  pinVerify:          (b) => request('/auth/pin/verify',          { method: 'POST', body: JSON.stringify(b) }),

  // Vérifier si la session PIN stockée en localStorage est encore valide
  // ET appartient au compte connecté (userId vérifié côté backend)
  pinCheckSession:    (b) => request('/auth/pin/check-session',   { method: 'POST', body: JSON.stringify(b) }),

  // Créer / remplacer le PIN en BDD (après OTP email confirmé)
  pinSet:             (b) => request('/auth/pin/set',             { method: 'POST', body: JSON.stringify(b) }),

  // Supprimer le PIN du compte
  pinDelete:          ()  => request('/auth/pin',                 { method: 'DELETE' }),

  // ── PIN — Processus changement (OTP envoyé à l'email du compte) ─────────
  pinChangeRequest:   (b) => request('/auth/pin-change-request',  { method: 'POST', body: JSON.stringify(b) }),
  pinChangeConfirm:   (b) => request('/auth/pin-change-confirm',  { method: 'POST', body: JSON.stringify(b) }),

  // ── PIN — Processus oubli (sans être connecté) ──────────────────────────
  pinForgotRequest:   (b) => request('/auth/pin-forgot-request',  { method: 'POST', body: JSON.stringify(b) }),
  pinForgotVerify:    (b) => request('/auth/pin-forgot-verify',   { method: 'POST', body: JSON.stringify(b) }),

  // ── PIN — Alerte lockout ─────────────────────────────────────────────────
  notifyPinLockout:   ()  => request('/auth/pin-lockout-notify',  { method: 'POST' }),

  // ── Catégories ───────────────────────────────────────────────────────────
  getCategories:      ()       => request('/categories'),
  createCategory:     (b)      => request('/categories',          { method: 'POST',   body: JSON.stringify(b) }),
  updateCategory:     (id, b)  => request(`/categories/${id}`,    { method: 'PUT',    body: JSON.stringify(b) }),
  deleteCategory:     (id)     => request(`/categories/${id}`,    { method: 'DELETE' }),
  reorderCategories:  (order)  => request('/categories/reorder',  { method: 'PATCH',  body: JSON.stringify({ order }) }),

  // ── Employés ─────────────────────────────────────────────────────────────
  getEmployees:       ()       => request('/employees'),
  // AUDIT perms : ces routes exigent maintenant PIN admin (x-pin-session)
  // côté backend — on passe par adminRequest qui joint le header auto.
  createEmployee:     (b)      => adminRequest('/employees',       { method: 'POST',   body: JSON.stringify(b) }),
  updateEmployee:     (id, b)  => adminRequest(`/employees/${id}`, { method: 'PUT',    body: JSON.stringify(b) }),
  deleteEmployee:         (id) => adminRequest(`/employees/${id}`, { method: 'DELETE' }),
  getEmployeeFutureAppts: (id) => request(`/employees/${id}/future-appointments`),
  smartDeleteEmployee:    (id) => request(`/employees/${id}/smart-delete`, { method: 'POST' }),

  // ── Codes PIN employés ────────────────────────────────────────────────────
  getEmployeePins:           ()           => request('/employee-pins'),
  getEmployeePinStatus:      (empId)      => request(`/employee-pins/${empId}/status`),
  // AUDIT perms : set/delete/toggle PIN employé requiert PIN admin
  setEmployeePin:            (empId, b)   => adminRequest(`/employee-pins/${empId}/set`,    { method: 'POST',   body: JSON.stringify(b) }),
  deleteEmployeePin:         (empId)      => adminRequest(`/employee-pins/${empId}`,        { method: 'DELETE' }),
  toggleEmployeePin:         (empId, b)   => adminRequest(`/employee-pins/${empId}/toggle`, { method: 'PATCH',  body: JSON.stringify(b) }),
  verifyEmployeePin:         (empId, b)   => request(`/employee-pins/${empId}/verify`,         { method: 'POST',   body: JSON.stringify(b) }),
  checkEmployeePinSession:   (empId, b)   => request(`/employee-pins/${empId}/check-session`,  { method: 'POST',   body: JSON.stringify(b) }),

  // ── Transactions ──────────────────────────────────────────────────────────
  getTransactions:    (q)      => request('/transactions' + (q ? '?' + new URLSearchParams(q) : '')),
  createTransaction:  (b, actingEmployeeId) => request('/transactions',        { method: 'POST',   body: JSON.stringify(b), actingEmployeeId }),
  updateTransaction:  (id, b)  => adminRequest(`/transactions/${id}`,  { method: 'PUT',    body: JSON.stringify(b) }),
  deleteTransaction:  (id)     => adminRequest(`/transactions/${id}`,  { method: 'DELETE' }),

  // ── Abonnement plateforme FlowIA ─────────────────────────────────────────
  getSubscription:            ()  => request('/subscriptions/me'),
  createSubscriptionCheckout: (b) => request('/subscriptions/checkout',    { method: 'POST', body: JSON.stringify(b) }),
  createSubscriptionPortal:   ()  => request('/subscriptions/portal',      { method: 'POST' }),
  cancelSubscription:         ()  => request('/subscriptions/cancel',      { method: 'POST' }),
  reactivateSubscription:     ()  => request('/subscriptions/reactivate',  { method: 'POST' }),
  changeSubscriptionPlan:     (b) => request('/subscriptions/change-plan', { method: 'POST', body: JSON.stringify(b) }),
  previewSubscriptionChange:  (b) => request('/subscriptions/preview-change', { method: 'POST', body: JSON.stringify(b) }),
  listSubscriptionPaymentMethods:    ()    => request('/subscriptions/payment-methods'),
  createSubscriptionPmSetupIntent:   ()    => request('/subscriptions/payment-methods/setup-intent', { method: 'POST' }),
  setSubscriptionDefaultPaymentMethod: (id) => request('/subscriptions/payment-methods/' + id + '/default', { method: 'POST' }),
  deleteSubscriptionPaymentMethod:   (id)  => request('/subscriptions/payment-methods/' + id, { method: 'DELETE' }),
  listSubscriptionInvoices:          (startingAfter) => request('/subscriptions/invoices'
                                       + (startingAfter ? '?starting_after=' + encodeURIComponent(startingAfter) : '')),
  // ── Stripe Connect (compte marchand pour encaisser les RDV) ──────────────
  // (Voir aussi connectApi exporte plus bas pour ergonomie.)
  getSubscriptionBillingInfo:        ()    => request('/subscriptions/billing-info'),
  updateSubscriptionBillingInfo:     (b)   => request('/subscriptions/billing-info', { method: 'PUT', body: JSON.stringify(b) }),

  // ── Sync Google Calendar (sortant FlowIA → Google) ──────────────────────
  calendarSyncStatus:   ()       => request('/calendar-sync/status'),
  calendarSyncConnect:  ()       => request('/calendar-sync/connect'),
  calendarSyncDisconnect: ()     => request('/calendar-sync/disconnect',  { method: 'POST' }),
  calendarSyncToggle:   (enabled) => request('/calendar-sync/toggle',     { method: 'POST', body: JSON.stringify({ enabled }) }),
};
// ── Réservations (commerçant) ─────────────────────────────────────────────────
// Annonce/bandeau de la page de reservation publique
export const announcementApi = {
  get:  ()  => request('/booking/announcement'),
  save: (b) => request('/booking/announcement', { method: 'PUT', body: JSON.stringify(b) }),
};

export const bookingApi = {

  // Agenda employé
  getEmployeeAgenda:   (empId, q) => request('/booking/employee-agenda?' + new URLSearchParams({ employee_id: empId, ...q })),
  createEmpAppt:       (b)        => request('/booking/employee-agenda/appointments', { method: 'POST', body: JSON.stringify(b) }),
  updateEmpAppt:       (id, b)    => request(`/booking/employee-agenda/appointments/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  getEmpPermissions:   (id)       => request(`/booking/employee-permissions/${id}`),
  saveEmpPermissions:  (id, b)    => request(`/booking/employee-permissions/${id}`, { method: 'PUT', body: JSON.stringify(b) }),

  // Paramètres
  getSettings:    ()    => request('/booking/settings'),
  saveSettings:   (b)   => request('/booking/settings',         { method: 'POST', body: JSON.stringify(b) }),
  checkSlug:      (slug) => request(`/booking/check-slug?slug=${encodeURIComponent(slug)}`),

  // ── Slug nom-ville-CP : edition de la partie nom (FDS-2026) ──────────────
  // GET /api/booking/slug-info       -> { slug, slugLocked, namePart, locationPart, city, postalCode, businessName }
  // POST /api/booking/slug-name/check { namePart } -> { available, message?, candidate }
  // PATCH /api/booking/slug-name     { namePart }   -> { ok, slug, oldSlug, unchanged? }
  getSlugInfo:    ()        => request('/booking/slug-info'),
  checkSlugName:  (namePart) => request('/booking/slug-name/check',
                                        { method: 'POST', body: JSON.stringify({ namePart }) }),
  updateSlugName: (namePart) => request('/booking/slug-name',
                                        { method: 'PATCH', body: JSON.stringify({ namePart }) }),

  // Horaires
  getHours:       ()    => request('/booking/hours'),
  saveHours:      (b)   => request('/booking/hours',            { method: 'POST', body: JSON.stringify(b) }),

  // Services
  getServices:    ()    => request('/booking/services'),
  // Catalogue intelligent pour le drawer édition /historique. Choisit le bon
  // catalogue (caisse vs réservation) selon le contexte de la transaction.
  getServicesForEdit: (context) => request('/services-for-edit?context=' + encodeURIComponent(context || 'walkin')),
  createService:  (b)   => request('/booking/services',         { method: 'POST',   body: JSON.stringify(b) }),
  updateService:  (id,b)=> request(`/booking/services/${id}`,   { method: 'PUT',    body: JSON.stringify(b) }),
  deleteService:  (id)  => request(`/booking/services/${id}`,   { method: 'DELETE' }),

  // RDV
  getAppointments:(q)   => request('/booking/appointments' + (q ? '?'+new URLSearchParams(q) : '')),
  createAppt:     (b)   => request('/booking/appointments',     { method: 'POST', body: JSON.stringify(b) }),
  updateAppt:     (id,b,actingEmployeeId)=> request(`/booking/appointments/${id}`,{ method: 'PUT',  body: JSON.stringify(b), actingEmployeeId }),
  deleteAppt:     (id)  => request(`/booking/appointments/${id}`,{ method: 'DELETE' }),
  checkoutAppt:   (id,b,actingEmployeeId)=> request(`/booking/appointments/${id}/checkout`, { method: 'POST', body: JSON.stringify(b), actingEmployeeId }),

  // Clients
  getClients:     ()    => request('/booking/clients'),

  // Horaires par employé
  getEmpHours:    (empId)   => request(`/booking/employee-hours/${empId}`),
  saveEmpHours:   (b)       => request('/booking/employee-hours',            { method: 'POST', body: JSON.stringify(b) }),
  deleteEmpHours: (empId)   => request(`/booking/employee-hours/${empId}`, { method: 'DELETE' }),
  // Pauses commerçant
  getBreaks:      ()        => request('/booking/breaks'),
  saveBreaks:     (b)       => request('/booking/breaks',                   { method: 'POST', body: JSON.stringify(b) }),
  // Plages horaires multiples employés
  getEmpSlots:    (empId)   => request(`/booking/employee-slots/${empId}`),
  saveEmpSlots:   (b)       => request('/booking/employee-slots',           { method: 'POST', body: JSON.stringify(b) }),
  deleteEmpSlots: (empId)   => request(`/booking/employee-slots/${empId}`, { method: 'DELETE' }),

  // Disponibilités
  getAvailability:(empId, q) => request(`/booking/availability/${empId}` + (q ? '?'+new URLSearchParams(q) : '')),
  setAvailability:(b)   => request('/booking/availability',     { method: 'POST', body: JSON.stringify(b) }),

  // Catégories de services (site de réservation)
  getServiceCategories:    ()       => request('/booking/service-categories'),
  createServiceCategory:   (b)      => request('/booking/service-categories',        { method: 'POST',   body: JSON.stringify(b) }),
  updateServiceCategory:   (id, b)  => request(`/booking/service-categories/${id}`,  { method: 'PUT',    body: JSON.stringify(b) }),
  deleteServiceCategory:   (id)     => request(`/booking/service-categories/${id}`,  { method: 'DELETE' }),
  reorderServiceCategories:(order)  => request('/booking/service-categories/reorder',{ method: 'PATCH',  body: JSON.stringify({ order }) }),
};

// ── Media (images profil, galerie, services) ─────────────────────────────────
export const mediaApi = {
  // URLs publiques (utilisées directement dans <img src=...>)
  profileUrl:  (userId)            => `${BASE}/media/commercant/${userId}/profile`,
  logoUrl:     (userId)            => `${BASE}/media/commercant/${userId}/logo`,
  coverUrl:    (userId, imageId)   => `${BASE}/media/commercant/${userId}/cover/${imageId}`,
  serviceUrl:  (serviceId)         => `${BASE}/media/service/${serviceId}/image`,
  employeeUrl: (employeeId)        => `${BASE}/media/employee/${employeeId}/image`,

  // Normalise une URL media qui peut venir du backend avec /api/... hardcodé
  // (ex: business.profile_url, business.cover_urls) → utilise la bonne base en prod
  absoluteUrl: (url) => {
    if (!url) return null;
    if (/^https?:\/\//.test(url)) return url;
    if (url.startsWith('/api/')) return BASE + url.slice(4);
    return url;
  },

  // Métadonnées
  getMeta:     (userId)            => request(`/media/commercant/${userId}/meta`),

  // Upload (multipart/form-data — pas de JSON)
  // Helper tolérant : si le backend renvoie du HTML (Express default handler,
  // page d'erreur Render sur crash, etc.) on évite "Unexpected token '<'" et
  // on remonte un message lisible basé sur le status HTTP.
  _uploadImage: async (url, file) => {
    const token = localStorage.getItem('ff_token');
    const fd = new FormData(); fd.append('image', file);
    const res = await fetch(url, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    });
    const ct = res.headers.get('content-type') || '';
    let data = {};
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch { /* corps vide */ }
    } else {
      await res.text().catch(() => {}); // drain
    }
    if (res.status === 403) { handleAccountBlocked(data) || handleFeatureBlocked(data); }
    if (!res.ok) {
      const msg = data.error
        || (res.status === 413 ? 'Image trop lourde (max 5 Mo).'
          : res.status === 401 ? 'Session expirée, reconnectez-vous.'
          : res.status === 403 ? 'Accès refusé.'
          : `Erreur upload (${res.status}). Réessayez dans un instant.`);
      throw new Error(msg);
    }
    return data;
  },
  uploadProfile:       (file)                 => mediaApi._uploadImage(`${BASE}/media/commercant/profile`, file),
  uploadLogo:          (file)                 => mediaApi._uploadImage(`${BASE}/media/commercant/logo`,    file),
  uploadCover:         (file)                 => mediaApi._uploadImage(`${BASE}/media/commercant/cover`,   file),
  uploadServiceImage:  (serviceId, file)      => mediaApi._uploadImage(`${BASE}/media/service/${serviceId}/image`,   file),
  uploadEmployeeImage: (employeeId, file)     => mediaApi._uploadImage(`${BASE}/media/employee/${employeeId}/image`, file),
  deleteServiceImage: (serviceId) => request(`/media/service/${serviceId}/image`, { method: 'DELETE' }),
  deleteEmployeeImage: (employeeId) => request(`/media/employee/${employeeId}/image`, { method: 'DELETE' }),
  deleteMedia: (id) => request(`/media/${id}`, { method: 'DELETE' }),
  // Definir une cover comme photo principale (sort_order=0). Affiche en
  // premier dans la marketplace /portail-client + sur la page de reservation.
  setCoverMain: (id) => request(`/media/commercant/cover/${id}/main`, { method: 'PUT' }),
};

// ── Site public de réservation ────────────────────────────────────────────────
const PUB_BASE = import.meta.env.VITE_API_URL || '/api';
async function pubRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  // Migration cookies HttpOnly : credentials:'include' joint le cookie
  // ff_client_token au cross-site (backend Render ↔ frontend Vercel/custom).
  // Le header Authorization est encore envoyé tant qu'un ancien token traîne
  // en localStorage (transition jusqu'à expiry des sessions pré-migration).
  const clientToken = localStorage.getItem('ff_client_token');
  if (clientToken) headers['Authorization'] = `Bearer ${clientToken}`;
  const res = await fetch(`${PUB_BASE}/pub${path}`, { ...options, headers, credentials: 'include' });
  const data = await res.json();
  if (res.status === 403) { handleAccountBlocked(data) || handleFeatureBlocked(data); }
  if (!res.ok) {
    const err = new Error(data.error || 'Erreur serveur');
    err.data = data;       // préserve code, policy_hours, merchant_phone, etc.
    err.status = res.status;
    throw err;
  }
  return data;
}
export const pubApi = {
  // Resolve : si slug archive, renvoie { slug, redirected:true, oldSlug }.
  // Utilise au mount de la booking page pour rediriger transparente quand
  // un visiteur arrive avec un ancien slug (QR code, lien partage SMS).
  resolveSlug:    (slug)    => pubRequest(`/resolve/${slug}`),
  // Marketplace : recherche publique de commercants pour /portail-client.
  //   q       : texte libre (nom + ville)
  //   city    : ville exacte (insensible casse/accents)
  //   lat,lng : coords pour tri par distance (optionnel)
  //   radius  : rayon en km (defaut 30 si geo)
  //   limit, offset : pagination
  searchMarketplace: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) qs.set(k, v);
    });
    return pubRequest(`/marketplace?${qs.toString()}`);
  },
  getBusiness:    (slug)    => pubRequest(`/${slug}`),
  getAnnouncement:(slug)    => pubRequest(`/${slug}/announcement`),
  getServices:    (slug)    => pubRequest(`/${slug}/services`),
  getEmployees:   (slug)    => pubRequest(`/${slug}/employees`),
  getSlots:       (slug, q) => pubRequest(`/${slug}/slots?` + new URLSearchParams(q)),
  book:           (slug, b) => pubRequest(`/${slug}/book`,             { method: 'POST', body: JSON.stringify(b) }),
  register:       (slug, b) => pubRequest(`/${slug}/client/register`,  { method: 'POST', body: JSON.stringify(b) }),
  quickRegister:  (slug, b) => pubRequest(`/${slug}/client/quick-register`, { method: 'POST', body: JSON.stringify(b) }),
  login:          (slug, b) => pubRequest(`/${slug}/client/login`,     { method: 'POST', body: JSON.stringify(b) }),
  // POST logout : purge le cookie HttpOnly côté backend. À appeler en plus
  // du nettoyage localStorage côté frontend.
  logout:         (slug)    => pubRequest(`/${slug}/client/logout`,    { method: 'POST' }),
  myAppointments: (slug)    => pubRequest(`/${slug}/client/appointments`),
  // Commit 24c — réductions disponibles pour le client connecté chez ce
  // commerce. Retourne { discounts: [...], credit }. Utilisé Step6 booking.
  availableDiscounts: (slug, clientId) =>
    pubRequest(`/${slug}/client/${clientId}/available-discounts`),
  cancel:         (slug,id,b)=> pubRequest(`/${slug}/client/appointments/${id}/cancel`, { method: 'PUT', body: JSON.stringify(b) }),
  deleteAccount:  (slug)    => pubRequest(`/${slug}/client/account`, { method: 'DELETE' }),
  getClosedDays:   (slug)    => pubRequest(`/${slug}/closed-days`),
  getMonthStatus:  (slug, q) => pubRequest(`/${slug}/month-status?` + new URLSearchParams(q)),
  checkPromo:     (slug, body) => pubRequest(`/${slug}/check-promo`, { method: 'POST', body: JSON.stringify(body) }),
  checkReferral:  (slug, code, email) => {
    const q = email ? ('?email=' + encodeURIComponent(email)) : '';
    return pubRequest(`/${slug}/referral/${encodeURIComponent(code)}${q}`);
  },
  updateClientProfile: (slug, body) => pubRequest(`/${slug}/client/profile`, { method: 'PUT', body: JSON.stringify(body) }),
  checkEmail:     (slug, email) => pubRequest(`/${slug}/client/check-email?email=${encodeURIComponent(email)}`),
  // RGPD commit 19 : finalisation création OAuth Google différée.
  // Body : { pre_token, contract_accepted, marketing_accepted, phone? }.
  // Réponses : 200 { token, client } | 400 CGU_REQUIRED | 401 invalid | 410 expired.
  oauthGoogleFinalize: (slug, body) =>
    pubRequest(`/${slug}/oauth-google/finalize`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  googleAuthUrl:  (slug, ref, marketingOptIn) => {
    const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');
    // origin = sous-domaine de l'opener, relayé dans `state` par le
    // /client/auth/google pour router correctement le postMessage du
    // callback vers le bon sous-domaine frontend (validation allowlist).
    // RGPD commit 17 : m=1 → opt-in marketing transmis via state OAuth.
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    params.set('origin', window.location.origin);
    if (marketingOptIn === true) params.set('m', '1');
    return `${BASE}/api/pub/${slug}/client/auth/google?${params}`;
  },
  // Note Google Business réelle (Places API) — silent fail si non configuré
  getGoogleRating: (slug) => pubRequest(`/${slug}/google-rating`),
  // Phase 5/5 — Stripe Connect : paiement RDV en ligne.
  // getPaymentConfig : { enabled, policy?, percentage? }. Si enabled=false,
  // le booking page reste 100% normal (pas de paiement).
  getPaymentConfig:    (slug)    => pubRequest(`/${slug}/payment-config`),
  // createPaymentIntent : retourne { client_secret, payment_intent_id,
  // connected_account_id, amount_cents, fee_cents, ... }. Le frontend
  // utilise client_secret avec Stripe Elements pour confirmer le paiement.
  createPaymentIntent: (slug, b) =>
    pubRequest(`/${slug}/booking/payment-intent`, { method: 'POST', body: JSON.stringify(b) }),
};

// ── Notifications (Feature 3 & 7) ────────────────────────────────────────────
export const notifApi = {
  getSettings:    ()  => request('/notifications/settings'),
  saveSettings:   (b) => request('/notifications/settings', { method: 'PUT', body: JSON.stringify(b) }),
  testRecap:      ()  => request('/notifications/test-recap', { method: 'POST' }),
  // Web Push
  getVapidKey:    ()  => request('/notifications/vapid-public-key'),
  subscribePush:  (b) => request('/notifications/push-subscribe', { method: 'POST', body: JSON.stringify({ subscription: b }) }),
  unsubscribePush:(b) => request('/notifications/push-subscribe', { method: 'DELETE', body: JSON.stringify(b) }),
  // In-app
  getInApp:       (q) => request('/notifications/inapp' + (q ? '?' + new URLSearchParams(q) : '')),
  markRead:       (b) => request('/notifications/inapp/read', { method: 'PATCH', body: JSON.stringify(b) }),
  deleteInApp:    (id)=> request(`/notifications/inapp/${id}`, { method: 'DELETE' }),
};

// ── Export comptable (Feature 4) ──────────────────────────────────────────────
// Les routes /export/csv et /export/pdf sont gardées par pinAdminMiddleware
// côté backend (audit export #9) → il faut envoyer x-pin-session en plus du
// JWT principal. Avant : download sans ce header → 403 → "Erreur export"
// visible côté UI sans moyen de diagnostiquer.
export const exportApi = {
  getSummary:  (q)    => request('/export/summary?' + new URLSearchParams(q)),
  getCsvUrl:   (q)    => `${BASE}/export/csv?`  + new URLSearchParams(q),
  getPdfUrl:   (q)    => `${BASE}/export/pdf?`  + new URLSearchParams(q),
  // Refonte FDS-2026 commit 16 : sur 403 (token PIN expiré), on ré-ouvre la
  // modale admin via requestAdminPin() puis on retry UNE fois (cohérent avec
  // adminRequest). Évite « Session admin expirée. Déverrouillez avec votre PIN
  // puis réessayez. » qui forçait l'utilisateur à quitter/réentrer le mode.
  downloadFile: async (url, filename) => {
    const fetchOnce = async () => {
      const token    = localStorage.getItem('ff_token');
      const pinToken = localStorage.getItem('ff_pin_token');
      const headers  = {};
      if (token)    headers['Authorization'] = `Bearer ${token}`;
      if (pinToken) headers['x-pin-session'] = pinToken;
      const r = await fetch(url, { headers });
      // Sliding session : aligné avec adminRequest pour que l'export
      // renouvelle aussi le token PIN.
      try {
        const refreshed = r.headers.get('x-pin-session-refresh');
        if (refreshed) localStorage.setItem('ff_pin_token', refreshed);
      } catch { /* localStorage indisponible */ }
      return r;
    };
    let r = await fetchOnce();
    if (r.status === 403) {
      try { await requestAdminPin(); r = await fetchOnce(); }
      catch { /* modal annulée → on retombe sur le 403 d'origine */ }
    }
    if (!r.ok) {
      // Remonter le vrai message backend pour affichage popup côté UI
      let msg = 'Erreur export';
      try {
        const j = await r.json();
        if (j?.error)   msg = j.error;
        if (j?.message) msg = j.message;
      } catch {}
      if (r.status === 403) msg = "Erreur d'autorisation, reconnectez-vous.";
      throw new Error(msg);
    }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

// ── Absences employés (Feature 5) ────────────────────────────────────────────
export const absencesApi = {
  list:   (q)    => request('/absences?' + new URLSearchParams(q||{})),
  stats:  (q)    => request('/absences/stats?' + new URLSearchParams(q||{})),
  create: (b)    => request('/absences', { method: 'POST', body: JSON.stringify(b) }),
  update: (id,b) => request(`/absences/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  cancel: (id,b) => request(`/absences/${id}/cancel`, { method: 'PATCH', body: JSON.stringify(b||{}) }),
  remove: (id)   => request(`/absences/${id}`, { method: 'DELETE' }),
};

// ── Commissions (Feature 6) ───────────────────────────────────────────────────
export const commissionsApi = {
  get:          (q)       => request('/commissions?' + new URLSearchParams(q||{})),
  getSettings:  ()        => request('/commissions/settings'),
  saveRate:     (empId,b) => request(`/commissions/settings/${empId}`, { method: 'PUT', body: JSON.stringify(b) }),
};

// ── Fidélité (Feature 9) ──────────────────────────────────────────────────────
export const loyaltyApi = {
  getProgram:     ()   => request('/loyalty/program'),
  // Backend exige PIN admin (pinAdminMiddleware) sur PUT /loyalty/program
  // (audit X). adminRequest joint automatiquement x-pin-session.
  saveProgram:    (b)  => adminRequest('/loyalty/program', { method: 'PUT', body: JSON.stringify(b) }),
  getClients:     (q)  => request('/loyalty/clients?' + new URLSearchParams(q||{})),
  addStamp:       (b)  => request('/loyalty/stamp',        { method: 'POST', body: JSON.stringify(b) }),
  addService:     (b)  => request('/loyalty/add-service',  { method: 'POST', body: JSON.stringify(b) }),
  removeClient:   (id) => request(`/loyalty/clients/${id}`, { method: 'DELETE' }),
  promoHistory:   ()   => request('/loyalty/promo-history'),
  searchClients:  (q)  => request('/loyalty/search-clients?q=' + encodeURIComponent(q || '')),
  getStats:       ()   => request('/loyalty/stats'),
};

// ── Codes promo (Feature 10) ──────────────────────────────────────────────────
export const promoApi = {
  list:       ()        => request('/promo'),
  getStats:   ()        => request('/promo/stats'),
  check:      (b)       => request('/promo/check', { method: 'POST', body: JSON.stringify(b) }),
  create:     (b)       => request('/promo', { method: 'POST', body: JSON.stringify(b) }),
  update:     (id,b)    => request(`/promo/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  remove:     (id)      => request(`/promo/${id}`, { method: 'DELETE' }),
  sendEmails: (id, b)   => request(`/promo/${id}/send-emails`, { method: 'POST', body: JSON.stringify(b) }),
};

export const statsApi = {
  getProductStats: (q) => request('/stats/products' + (q && Object.keys(q).length ? '?' + new URLSearchParams(q) : '')),
  getForecast:     (q) => request('/stats/forecast?' + new URLSearchParams(q||{})),
  getHeatmap:      (q) => request('/stats/heatmap?' + new URLSearchParams(q||{})),
  getToday:        ()  => request('/stats/today'),
  // Refonte FDS-2026 commit 6 — ventilation par moyen de paiement.
  getByPaymentMethod: (period) => request('/stats/by-payment-method?period=' + encodeURIComponent(period || 'today')),
  // Refonte v3 (Commit 2 backend) — 4 sources / 6 statuts.
  getPerformance:    (q) => request('/stats/performance' + (q && Object.keys(q).length ? '?' + new URLSearchParams(q) : '')),
  getRdv:            (q) => request('/stats/rdv' + (q && Object.keys(q).length ? '?' + new URLSearchParams(q) : '')),
  getOnlinePayments: (q) => {
    // Param debug=1 propage en permanence pour le badge LedgerDebugBadge
    // (filtre admin cote backend via feature_flags.ledger_debug_visible).
    const usp = new URLSearchParams(q && Object.keys(q).length ? q : {});
    usp.set('debug', '1');
    return request('/stats/online-payments?' + usp.toString());
  },
};

// Refonte v3 (Commit 2 backend) — historique enrichi avec 4 sources / 6 statuts.
export const historiqueApi = {
  list: (q) => {
    // Param debug=1 propage pour le badge LedgerDebugBadge (admin-only via
    // feature_flags.ledger_debug_visible). Phase 4.4 du refactor ledger.
    const usp = new URLSearchParams(q && Object.keys(q).length ? q : {});
    usp.set('debug', '1');
    return request('/historique?' + usp.toString());
  },
};

// Refonte v3 — payouts agreges (table payouts, distincte de appointment_payouts
// escrow). Utilise par l'onglet Reversements (Commit 4).
export const payoutsV3Api = {
  list:   (q) => request('/payouts' + (q && Object.keys(q).length ? '?' + new URLSearchParams(q) : '')),
  // Refonte v3 (Commit 5) — declenche un payout manuel Stripe vers la banque
  // du commercant. Pas de body : le backend lit user_id du JWT et le solde
  // disponible depuis Stripe directement.
  create: ()  => request('/stripe/payout/create', { method: 'POST' }),
};

// Refonte v3 — balance Stripe Connect avec estimation prochain payout.
export const stripeBalanceV3Api = {
  get: () => request('/stripe/balance'),
};

export const clientNotesApi = {
  search:     (q)  => request('/client-notes/search?q=' + encodeURIComponent(q || '')),
  getHistory: (email, empId) => request('/client-notes/history?email=' + encodeURIComponent(email) + (empId ? '&employee_id=' + encodeURIComponent(empId) : '')),
  getNotes:   (email) => request('/client-notes?email=' + encodeURIComponent(email)),
  addNote:    (b)  => request('/client-notes',    { method: 'POST',   body: JSON.stringify(b) }),
  updateNote: (id, b) => request(`/client-notes/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  deleteNote: (id) => request(`/client-notes/${id}`, { method: 'DELETE' }),
};
export const clientsApi = {
  list:    (params={}) => request('/clients?' + new URLSearchParams(params)),
  search:  (q)        => request('/clients/search?q=' + encodeURIComponent(q||'')),
  get:     (id)       => request('/clients/' + id),
  create:  (data)     => request('/clients', { method:'POST', body: JSON.stringify(data) }),
  update:  (id, data) => request('/clients/' + id, { method:'PUT', body: JSON.stringify(data) }),
  remove:  (id)       => request('/clients/' + id, { method:'DELETE' }),
  invite:  (id)       => request('/clients/' + id + '/invite', { method:'POST' }),
  addNote: (id, data) => request('/clients/' + id + '/note', { method:'POST', body: JSON.stringify(data) }),
  block:   (id, blocked) => request('/clients/' + id + '/block', { method:'PATCH', body: JSON.stringify({ blocked }) }),
  // PATCH marketing-opt-in exige PIN admin (audit RGPD commit 17) → adminRequest.
  setMarketingOptIn: (id, marketing_opt_in) =>
    adminRequest('/clients/' + id + '/marketing-opt-in', {
      method:'PATCH', body: JSON.stringify({ marketing_opt_in }),
    }),
  // Creances impayees (RGPD Art. 17.3.e — recouvrement post-suppression)
  listDebts:    (status='open') => request('/clients/debt-records?status=' + encodeURIComponent(status)),
  markDebtPaid: (id, note)      => request('/clients/debt-records/' + id + '/mark-paid', {
                                     method:'POST', body: JSON.stringify({ note: note || null }) }),
  removeDebt:   (id)            => request('/clients/debt-records/' + id, { method:'DELETE' }),
};

// ── Campagnes SMS/Email ───────────────────────────────────────────────────────
export const campaignsApi = {
  getCampaignPreview:  (p) => request(`/campaigns/preview?${new URLSearchParams(p)}`),
  sendCampaign:       (b) => request('/campaigns/send',   { method:'POST', body:JSON.stringify(b) }),
  getCampaignQuota:   ()  => request('/campaigns/quota'),
  getCampaignHistory: ()  => request('/campaigns/history'),
  getAutoPlan:        ({ budget, duration_days }) =>
    request(`/campaigns/auto-plan?${new URLSearchParams({ budget, duration_days })}`),
  sendAutoCampaign:   ({ budget, duration_days, discounts }) =>
    request('/campaigns/auto-send',
      { method:'POST', body: JSON.stringify({ budget, duration_days, discounts }) }),
  recalculateAutoPlan: ({ budget, duration_days, discounts }) =>
    request('/campaigns/auto-recalculate',
      { method:'POST', body: JSON.stringify({ budget, duration_days, discounts }) }),
  getAiHistory:       () => request('/campaigns/ai-history'),
};

// ── Anniversaires clients ────────────────────────────────────────────────────
export const birthdayApi = {
  get:    ()  => request('/birthday-campaign'),
  // PUT /birthday-campaign exige PIN admin (audit AA) → adminRequest.
  update: (b) => adminRequest('/birthday-campaign', { method:'PUT', body: JSON.stringify(b) }),
};

// ── Parrainage clients ───────────────────────────────────────────────────────
export const referralsApi = {
  getProgram:    ()  => request('/referrals/program'),
  // PUT /referrals/program exige PIN admin (audit W) → adminRequest.
  updateProgram: (b) => adminRequest('/referrals/program', { method:'PUT', body: JSON.stringify(b) }),
  // listCodes accepte un objet de params { search, limit, offset } pour
  // la pagination serveur. Sans param : ancien comportement (1ere page).
  listCodes:     (q={}) => request('/referrals/codes?' + new URLSearchParams(
                                     Object.entries(q).filter(([,v]) => v !== undefined && v !== '')
                                   )),
  checkCode:     (b) => request('/referrals/check', { method:'POST', body: JSON.stringify(b) }),
  getStats:      ()  => request('/referrals/stats'),
  // Caisse (commerçant) : récupère pending + rewards pour un client
  getClientRewards: (email) =>
    request('/referrals/rewards?email=' + encodeURIComponent(email)),
  // Employé valide un parrainage en caisse → émet la promo parrain + email
  validateUse:   (id) => request('/referrals/uses/' + id + '/validate',
                          { method:'POST' }),
  // Employé refuse un parrainage (fraude/erreur) → status='cancelled', aucune récompense
  cancelUse:     (id) => request('/referrals/uses/' + id + '/cancel',
                          { method:'POST' }),
  // Caisse : marquer une réduction comme utilisée après encaissement
  useReward:     (id) => request('/referrals/rewards/' + id + '/use',
                          { method:'POST' }),
};

// ── Paiements SMS ────────────────────────────────────────────────────────────
export const paymentsApi = {
  getSMSBalance:      ()  => request('/payments/sms/balance'),
  createSMSCheckout:  (amount) => request('/payments/sms/checkout',
                      { method:'POST', body:JSON.stringify({ amount }) }),
  getSMSTransactions: ()  => request('/payments/sms/transactions'),
  verifySMSCheckout:  (sessionId) => request(`/payments/sms/verify/${sessionId}`),
  // Embedded Stripe Elements
  createIntent:       (body)   => request('/payments/sms/intent',
                       { method:'POST', body: JSON.stringify(body) }),
  verifyIntent:       (intentId) => request('/payments/sms/verify-intent',
                       { method:'POST', body: JSON.stringify({ intent_id: intentId }) }),
  listPaymentMethods: ()       => request('/payments/sms/payment-methods'),
  deletePaymentMethod:(id)     => request('/payments/sms/payment-methods/' + id,
                       { method: 'DELETE' }),
  setDefaultPaymentMethod: (id) => request('/payments/sms/set-default',
                       { method: 'POST', body: JSON.stringify({ payment_method_id: id }) }),
};

// ── Stripe Connect (onboarding marchand pour encaisser les RDV) ────────────
export const connectApi = {
  getAccount:        ()  => request('/stripe-connect/account'),
  onboard:           ()  => request('/stripe-connect/onboard',        { method: 'POST' }),
  dashboardLink:     ()  => request('/stripe-connect/dashboard-link', { method: 'POST' }),
  disconnect:        ()  => request('/stripe-connect/disconnect',     { method: 'POST' }),
  getPaymentConfig:  ()  => request('/stripe-connect/payment-config'),
  // Escrow : liste des payouts (en attente / liberes / annules) du merchant.
  // Param `?debug=1` propage en permanence (filtre admin cote backend).
  getPayouts:        (status) => request(`/stripe-connect/payouts?${status ? `status=${status}&` : ''}debug=1`),
  // Stats KPI paiements en ligne sur periode glissante (7/30/90 jours).
  // Param `?debug=1` propage en permanence : le backend l'expose seulement
  // si le user a feature_flags.ledger_debug_visible === true (admin-only).
  // Sert au badge LedgerDebugBadge qui visualise legacy vs ledger.
  getPerformanceStats: (period = 30) => request(`/stripe-connect/performance-stats?period=${period}&debug=1`),
  // Solde live Stripe (available + pending) -- source de verite a jour
  // immediat (refunds reflechis sans attendre le cron). Complete /payouts
  // qui montre l'escrow FlowIA (release planifies sur appointment_payouts).
  getStripeBalance:    ()       => request('/stripe-connect/balance?debug=1'),
  updatePaymentConfig: (b) => request('/stripe-connect/payment-config', {
    method: 'PUT', body: JSON.stringify(b),
  }),
};

// ── Marketing IA (plan relance barbershop/salon) ─────────────────────────────
export const marketingApi = {
  getPlan:    () => request('/marketing/plan'),
  launchPlan: (body) => request('/marketing/plan/launch',
    { method: 'POST', body: JSON.stringify(body) }),
  getOptInStats: () => request('/marketing/opt-in-stats'),
  sendOptInInvite: () => request('/marketing/opt-in-invite', { method: 'POST' }),
};

export const creditsApi = {
  // GET /credits renvoie maintenant { rows, total, total_balance, active_clients_count }.
  list:       (params={}) => request('/credits?' + new URLSearchParams(params)),
  getClient:  (clientId)  => request('/credits/client/' + clientId),
  // grant : actingEmployeeId injecte le header x-employee-pin (PIN obligatoire backend).
  grant:      (data, actingEmployeeId) => request('/credits/grant',
                  { method:'POST', body: JSON.stringify(data), actingEmployeeId }),
  repay:      (data, actingEmployeeId) => request('/credits/repay',
                  { method:'POST', body: JSON.stringify(data), actingEmployeeId }),
  remove:     (id)        => request('/credits/' + id,  { method:'DELETE' }),
};
async function gcRequest(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  // Migration cookies HttpOnly : credentials:'include' attache les cookies
  // ff_gc_token / ff_client_token (backend lit l'un OU l'autre via
  // clientOrGlobalClientAuth). Header Authorization conservé en rétro-compat
  // tant qu'un token localStorage subsiste (sessions pré-migration).
  const auth = token
    || localStorage.getItem('ff_gc_token')
    || localStorage.getItem('ff_client_token');
  if (auth) headers['Authorization'] = `Bearer ${auth}`;
  const res  = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' });
  const data = await res.json();
  if (res.status === 403) { handleAccountBlocked(data) || handleFeatureBlocked(data); }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erreur reseau'), { code: data.code });
  return data;
}

export const globalClientApi = {
  register:       (data)        => gcRequest('/global-clients/register',        { method:'POST', body: JSON.stringify(data) }),
  login:          (data)        => gcRequest('/global-clients/login',           { method:'POST', body: JSON.stringify(data) }),
  logout:         ()            => gcRequest('/global-clients/logout',          { method:'POST' }),
  activate:       (data)        => gcRequest('/global-clients/activate',        { method:'POST', body: JSON.stringify(data) }),
  me:             (token)       => gcRequest('/global-clients/me',              {}, token),
  updateMe:       (token, data) => gcRequest('/global-clients/me',              { method:'PUT',  body: JSON.stringify(data) }, token),
  deleteAccount:  (token)       => gcRequest('/global-clients/me',              { method:'DELETE' }, token),
  // Resume credits/dettes par commercant — utilise par la modal d'avertissement
  // avant suppression de compte. Renvoie { credits: [...], debts: [...] }.
  creditsSummary: (token)       => gcRequest('/global-clients/me/credits-summary', {}, token),
  appointments:   (token)       => gcRequest('/global-clients/appointments',    {}, token),
  myVisits:       (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') qs.set(k, v);
    });
    const suffix = qs.toString() ? '?' + qs.toString() : '';
    return gcRequest('/global-clients/me/visits' + suffix);
  },
  myVisit:        (id)           => gcRequest('/global-clients/me/visits/' + encodeURIComponent(id)),
  loyalty:        (token)       => gcRequest('/global-clients/loyalty',         {}, token),
  changePwd:      (token, data) => gcRequest('/global-clients/change-password', { method:'POST', body: JSON.stringify(data) }, token),
  // Changement email en 2 étapes (code OTP à l'email actuel)
  changeEmailInit:    (data) => gcRequest('/global-clients/me/change-email',         { method:'POST', body: JSON.stringify(data) }),
  changeEmailConfirm: (data) => gcRequest('/global-clients/me/change-email/confirm', { method:'POST', body: JSON.stringify(data) }),
  // Changement mot de passe en 2 étapes (code OTP à l'email du compte)
  changePwdInit:      (data) => gcRequest('/global-clients/me/change-password',         { method:'POST', body: JSON.stringify(data) }),
  changePwdConfirm:   (data) => gcRequest('/global-clients/me/change-password/confirm', { method:'POST', body: JSON.stringify(data) }),
  forgotPassword: (data)        => gcRequest('/global-clients/forgot-password', { method:'POST', body: JSON.stringify(data) }),
  resetPassword:  (data)        => gcRequest('/global-clients/reset-password',  { method:'POST', body: JSON.stringify(data) }),
  // RGPD
  exportData:     ()            => gcRequest('/global-clients/me/export'),
  // Parrainage (page client)
  myReferralCode:    (slug)     => gcRequest('/global-clients/me/referral-code/'    + encodeURIComponent(slug)),
  myReferralHistory: (slug)     => gcRequest('/global-clients/me/referral-history/' + encodeURIComponent(slug)),
  // Cartes sauvegardees globales FlowIA (Stripe Connect Shared Customer)
  paymentMethods:           ()       => gcRequest('/global-clients/me/payment-methods'),
  createSetupIntent:        ()       => gcRequest('/global-clients/me/setup-intent', { method: 'POST', body: '{}' }),
  savePaymentMethod:        (pmId)   => gcRequest('/global-clients/me/payment-methods/save', { method: 'POST', body: JSON.stringify({ payment_method_id: pmId }) }),
  deletePaymentMethod:      (id)     => gcRequest('/global-clients/me/payment-methods/' + encodeURIComponent(id), { method: 'DELETE' }),
  setDefaultPaymentMethod:  (id)     => gcRequest('/global-clients/me/payment-methods/' + encodeURIComponent(id) + '/default', { method: 'POST', body: '{}' }),
};

// Config publique du programme parrainage (page parrainage avant connexion)
export const publicReferralApi = {
  getProgram: (slug) => fetch(`${BASE}/global-clients/pub/${encodeURIComponent(slug)}/referral-program`)
    .then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      return d;
    }),
};

// Préférences compte commerçant — mode tablette, timeout session employé,
// lock on tab close, seuil SMS bas. PUT exige x-pin-session (adminRequest).
export const userSettingsApi = {
  get:    ()     => request('/user-settings'),
  update: (body) => adminRequest('/user-settings', { method: 'PUT', body: JSON.stringify(body) }),
};