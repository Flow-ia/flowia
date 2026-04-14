// src/hooks/useAdmin.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

const AdminContext = createContext(null);
const PIN_TOKEN_KEY  = 'ff_pin_token';
const USER_TOKEN_KEY = 'ff_token';

export function AdminProvider({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [hasPin,   setHasPin]   = useState(null);  // null=inconnu, true/false après check
  const [checking, setChecking] = useState(true);

  // ── Vérifier l'état PIN + session ─────────────────────────────────────────
  const checkSession = useCallback(async () => {
    setChecking(true);
    try {
      // Pas de token utilisateur → non connecté, on ne fait rien
      const userToken = localStorage.getItem(USER_TOKEN_KEY);
      if (!userToken) {
        setHasPin(null);
        setUnlocked(false);
        return;
      }

      // Ce compte a-t-il un PIN en base ?
      const status = await api.pinStatus();
      if (!status.hasPin) {
        setHasPin(false);
        setUnlocked(false);
        return;
      }
      setHasPin(true);

      // La session PIN est-elle encore valide ?
      const pinToken = localStorage.getItem(PIN_TOKEN_KEY);
      if (!pinToken) {
        setUnlocked(false);
        return;
      }
      const res = await api.pinCheckSession({ pinSessionToken: pinToken });
      setUnlocked(res.valid === true);
    } catch {
      // Erreur réseau → on reste verrouillé par sécurité
      setUnlocked(false);
    } finally {
      setChecking(false);
    }
  }, []);

  // Lancer checkSession au montage
  useEffect(() => { checkSession(); }, [checkSession]);

  // Écouter les changements de localStorage (connexion depuis un autre onglet)
  useEffect(() => {
    const handler = (e) => { if (e.key === USER_TOKEN_KEY) checkSession(); };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [checkSession]);

  // ── Vérifier le PIN saisi ─────────────────────────────────────────────────
  const verifyPin = useCallback(async (pin) => {
    try {
      const res = await api.pinVerify({ pin });
      if (res.valid && res.pinSessionToken) {
        localStorage.setItem(PIN_TOKEN_KEY, res.pinSessionToken);
        setUnlocked(true);
        return true;
      }
      return false;
    } catch { return false; }
  }, []);

  // ── Créer / changer le PIN ────────────────────────────────────────────────
  const changePin = useCallback(async (pin) => {
    await api.pinSet({ pin });
    setHasPin(true);
    // Invalider la session → l'utilisateur doit saisir son nouveau PIN
    localStorage.removeItem(PIN_TOKEN_KEY);
    setUnlocked(false);
  }, []);

  // ── Supprimer le PIN ──────────────────────────────────────────────────────
  const removePin = useCallback(async () => {
    await api.pinDelete();
    setHasPin(false);
    localStorage.removeItem(PIN_TOKEN_KEY);
    setUnlocked(false);
  }, []);

  // ── Verrouiller la session admin ──────────────────────────────────────────
  const lock = useCallback(() => {
    localStorage.removeItem(PIN_TOKEN_KEY);
    setUnlocked(false);
    // Ne pas toucher hasPin → il reste true
  }, []);

  // ── Nettoyage au logout ───────────────────────────────────────────────────
  const clearOnLogout = useCallback(() => {
    localStorage.removeItem(PIN_TOKEN_KEY);
    setUnlocked(false);
    setHasPin(null);
    setChecking(false);
  }, []);

  return (
    <AdminContext.Provider value={{
      unlocked, hasPin, checking,
      verifyPin, changePin, removePin,
      lock, clearOnLogout, checkSession,
    }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminContext);
}
