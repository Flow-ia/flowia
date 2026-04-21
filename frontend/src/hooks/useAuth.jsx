// src/hooks/useAuth.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ff_token');
    if (token) {
      api.me()
        .then(data => setUser(data.user))
        .catch(() => {
          localStorage.removeItem('ff_token');
          // Nettoyer aussi la session PIN si le token auth est invalide
          localStorage.removeItem('ff_pin_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    // Écoute les événements OAuth diffusés par /__oauth. Permet de
    // recharger l'utilisateur quand la popup Google termine sans passer
    // par window.opener (détaché par Google COOP:same-origin).
    const applyMerchantLogin = (user) => {
      localStorage.removeItem('ff_pin_token');
      if (user) setUser(user);
      else api.me().then(d => setUser(d.user)).catch(() => {});
    };

    let bc = null;
    try {
      bc = new BroadcastChannel('flowia-oauth');
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'merchant_login') applyMerchantLogin(ev.data.user);
      };
    } catch { /* BroadcastChannel non supporté */ }

    // Fallback storage event : fire-and-forget dans la popup → déclenche
    // un `storage` event dans l'opener (same-origin). Permet de survivre
    // au cas où BroadcastChannel serait filtré (extensions, etc.).
    const onStorage = (e) => {
      if (e.key === 'ff_oauth_user' && e.newValue) {
        let user = null;
        try { user = JSON.parse(e.newValue); } catch {}
        applyMerchantLogin(user);
        // Nettoyer le marqueur éphémère (évite re-trigger au reload).
        try { localStorage.removeItem('ff_oauth_user'); } catch {}
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      try { bc && bc.close(); } catch {}
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function login(token, userData) {
    // Au login d'un nouveau compte, supprimer l'ancienne session PIN
    // (elle appartiendrait à l'ancien userId → invalide de toute façon côté backend,
    //  mais on nettoie côté frontend pour éviter un appel inutile à check-session)
    localStorage.removeItem('ff_pin_token');
    localStorage.setItem('ff_token', token);
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem('ff_token');
    localStorage.removeItem('ff_pin_token'); // ← nettoie la session PIN au logout
    setUser(null);
  }

  function updateUser(updates) {
    setUser(prev => ({ ...prev, ...updates }));
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}