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

    // Écoute les événements OAuth diffusés par /__oauth. Persiste le
    // token dans notre localStorage même si la popup avait atterri sur
    // un autre sous-domaine (origine différente = localStorage isolé).
    // Sans ça, les requêtes /api/* partaient sans Authorization → 401.
    const applyMerchantLogin = (token, user) => {
      if (token) localStorage.setItem('ff_token', token);
      localStorage.removeItem('ff_pin_token');
      if (user) setUser(user);
      else api.me().then(d => setUser(d.user)).catch(() => {
        // Token invalide côté backend → purger pour éviter de réutiliser.
        localStorage.removeItem('ff_token');
      });
    };

    let bc = null;
    try {
      bc = new BroadcastChannel('flowia-oauth');
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'merchant_login') {
          applyMerchantLogin(ev.data.token, ev.data.user);
        }
      };
    } catch { /* BroadcastChannel non supporté */ }

    // Intercepteur 401 : api.js dispatch 'ff-auth-expired' dès qu'une
    // requête merchant retourne 401. Remet user à null pour que l'app
    // retombe sur /login au lieu d'afficher un dashboard vide aux fetches
    // silencieusement en erreur.
    const onAuthExpired = () => setUser(null);
    window.addEventListener('ff-auth-expired', onAuthExpired);

    // Fallback storage event : fire-and-forget dans la popup → déclenche
    // un `storage` event dans l'opener (same-origin). Le payload contient
    // { token, user } sérialisés pour survivre au cas BroadcastChannel KO.
    const onStorage = (e) => {
      if (e.key === 'ff_oauth_merchant' && e.newValue) {
        let payload = null;
        try { payload = JSON.parse(e.newValue); } catch {}
        if (payload?.token) applyMerchantLogin(payload.token, payload.user);
        try { localStorage.removeItem('ff_oauth_merchant'); } catch {}
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      try { bc && bc.close(); } catch {}
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('ff-auth-expired', onAuthExpired);
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