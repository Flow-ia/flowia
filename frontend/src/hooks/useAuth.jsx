// src/hooks/useAuth.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { api, notifyLoginJustHappened, isJwtLocallyExpired } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ff_token');
    // Check local expiry AVANT api.me() pour éviter un round-trip 401 parasite
    // dans la console quand un vieux token zombie traîne dans localStorage.
    if (token && isJwtLocallyExpired(token)) {
      localStorage.removeItem('ff_token');
      localStorage.removeItem('ff_pin_token');
      setLoading(false);
    } else if (token) {
      api.me()
        .then(data => setUser(data.user))
        .catch(() => {
          // Si handleMerchant401 a déjà purgé (vrai 401), ff_token est absent
          // → on est sur un échec auth confirmé, on nettoie aussi le PIN.
          // Sinon (500, timeout, réseau KO sur cold start Render) on garde
          // le token : la prochaine navigation re-tentera api.me() avec le
          // token toujours valide. Purger ici déconnecterait à tort.
          if (!localStorage.getItem('ff_token')) {
            localStorage.removeItem('ff_pin_token');
          }
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
      // Active la grace period anti-401 pour que l'intercepteur ne purge
      // pas le nouveau token si une requête transitoire 401 juste après.
      notifyLoginJustHappened();
      if (user) setUser(user);
      else api.me().then(d => setUser(d.user)).catch(() => {
        // Ne purge que si handleMerchant401 a confirmé un 401 (token déjà
        // retiré). Sur un échec transitoire (500, timeout cold start), on
        // garde le token frais — sinon boucle login juste après OAuth.
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
    notifyLoginJustHappened();
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