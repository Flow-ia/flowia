// auth.js — API d'authentification admin (login, logout, getMe, bootstrap, 2FA).
// Le token vit en mémoire (tokenStore). Le refresh est géré transparente par
// api.js (intercepteur 401/404 + cookie httpOnly).

import { apiJson, apiFetch, refreshAccessToken } from './api.js';
import { getToken, setToken, clearToken } from './tokenStore.js';

// Login étape 1 — email + password.
// Si l'admin a la 2FA activée, retourne { requires2fa: true, twoFactorToken }.
// Sinon retourne { admin } et stocke le token.
export async function login(email, password) {
  const data = await apiJson('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data && data.requires2fa) {
    return { requires2fa: true, twoFactorToken: data.twoFactorToken };
  }
  if (data && data.accessToken) setToken(data.accessToken);
  return { admin: data && data.admin ? data.admin : null };
}

// Login étape 2 — code TOTP.
export async function login2fa(twoFactorToken, code) {
  const data = await apiJson('/api/admin/auth/login/2fa', {
    method: 'POST',
    body: JSON.stringify({ twoFactorToken, code }),
  });
  if (data && data.accessToken) setToken(data.accessToken);
  return data && data.admin ? data.admin : null;
}

export async function logout() {
  try {
    await apiFetch('/api/admin/auth/logout', { method: 'POST' });
  } catch { /* best-effort */ }
  clearToken();
}

export async function getMe() {
  return await apiJson('/api/admin/auth/me');
}

export async function bootstrapAuth() {
  return await refreshAccessToken();
}

export function isAuthenticated() {
  return !!getToken();
}

// ── 2FA ────────────────────────────────────────────────────────────────────
export async function setup2fa() {
  return await apiJson('/api/admin/auth/2fa/setup');
}
export async function enable2fa(secret, code) {
  return await apiJson('/api/admin/auth/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({ secret, code }),
  });
}
export async function disable2fa(password, code) {
  return await apiJson('/api/admin/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ password, code }),
  });
}
