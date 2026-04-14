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