// auth.js — API d'authentification admin (login, logout, getMe, bootstrap).
// Le token vit en mémoire (tokenStore). Le refresh est géré transparente par
// api.js (intercepteur 401/404 + cookie httpOnly).

import { apiJson, apiFetch, refreshAccessToken } from './api.js';
import { getToken, setToken, clearToken } from './tokenStore.js';

export async function login(email, password) {
  const data = await apiJson('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data && data.accessToken) setToken(data.accessToken);
  return data && data.admin ? data.admin : null;
}

export async function logout() {
  try {
    await apiFetch('/api/admin/auth/logout', { method: 'POST' });
  } catch { /* best-effort : on clear côté front quoi qu'il arrive */ }
  clearToken();
}

export async function getMe() {
  return await apiJson('/api/admin/auth/me');
}

// Au boot : tenter un refresh silencieux pour rétablir la session après un
// rechargement navigateur (le cookie httpOnly est présent, le token mémoire
// est vide). Renvoie true si l'utilisateur est ré-authentifié.
export async function bootstrapAuth() {
  return await refreshAccessToken();
}

export function isAuthenticated() {
  return !!getToken();
}
