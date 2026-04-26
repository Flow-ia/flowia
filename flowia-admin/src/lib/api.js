// api.js — Wrapper fetch admin. Injecte Authorization Bearer si token présent,
// envoie credentials: include pour le cookie de refresh, et tente UN refresh
// silencieux puis un retry sur 401/404 (le middleware admin renvoie 404 sur
// échec d'auth, pas 401, pour ne pas leaker l'existence du namespace).

import { getToken, setToken, clearToken } from './tokenStore.js';

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Évite les retries en cascade : login et refresh ne doivent jamais déclencher
// un refresh automatique — le 401 y est légitime (mauvais creds / cookie KO).
function shouldAutoRefresh(path) {
  if (!path.startsWith('/api/admin')) return false;
  if (path.includes('/auth/login')) return false;
  if (path.includes('/auth/refresh')) return false;
  return true;
}

export async function refreshAccessToken() {
  try {
    const res = await fetch(`${BASE}/api/admin/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      clearToken();
      return false;
    }
    const data = await res.json().catch(() => null);
    if (!data || !data.accessToken) {
      clearToken();
      return false;
    }
    setToken(data.accessToken);
    return true;
  } catch {
    clearToken();
    return false;
  }
}

export async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const tok = getToken();
  if (tok) headers['Authorization'] = `Bearer ${tok}`;

  let res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    credentials: 'include',
  });

  if ((res.status === 401 || res.status === 404) && shouldAutoRefresh(path)) {
    const ok = await refreshAccessToken();
    if (ok) {
      headers['Authorization'] = `Bearer ${getToken()}`;
      res = await fetch(`${BASE}${path}`, {
        ...opts,
        headers,
        credentials: 'include',
      });
    }
  }

  return res;
}

export async function apiJson(path, opts = {}) {
  const res = await apiFetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* pas de body JSON */ }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
