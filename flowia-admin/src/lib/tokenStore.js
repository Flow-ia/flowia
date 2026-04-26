// tokenStore.js — Stockage du access token en mémoire JS uniquement.
// Volontairement PAS dans localStorage/sessionStorage : ces stores sont
// vulnérables à toute injection XSS (un script tiers compromis lit la valeur).
// Conséquence : un refresh navigateur perd le token mémoire, l'app doit alors
// retenter un /refresh (cookie httpOnly présent) au boot.

let accessToken = null;

export function getToken() {
  return accessToken;
}

export function setToken(token) {
  accessToken = token || null;
}

export function clearToken() {
  accessToken = null;
}
