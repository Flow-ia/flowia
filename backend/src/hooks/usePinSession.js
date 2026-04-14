// hooks/usePinSession.js
//
// Stratégie :
// - PIN stocké hashé en BASE (user_pins), jamais dans le navigateur
// - Après vérification OK → backend retourne un "pinSessionToken" (JWT 8h)
// - Frontend stocke UNIQUEMENT ce token dans localStorage ("ff_pin_token")
// - Chaque accès admin → on demande au backend si le token est encore valide
//   ET appartient au compte connecté (check userId)
// - Changement de compte → token invalide automatiquement

import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api'; // ton fichier api.js existant

const PIN_TOKEN_KEY = 'ff_pin_token';

export function usePinSession() {
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [hasPin, setHasPin]           = useState(null); // null = chargement
  const [loading, setLoading]         = useState(true);

  // ── Vérifie au démarrage si la session PIN est valide pour CE compte ──────
  const checkSession = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Le compte a-t-il un PIN en base ?
      const statusRes = await api.get('/auth/pin/status');
      if (!statusRes.hasPin) {
        setHasPin(false);
        setPinUnlocked(false);
        setLoading(false);
        return;
      }
      setHasPin(true);

      // 2. Y a-t-il un token PIN en localStorage ?
      const token = localStorage.getItem(PIN_TOKEN_KEY);
      if (!token) {
        setPinUnlocked(false);
        setLoading(false);
        return;
      }

      // 3. Le token est-il valide ET appartient-il au compte connecté ?
      const checkRes = await api.post('/auth/pin/check-session', { pinSessionToken: token });
      setPinUnlocked(checkRes.valid === true);
    } catch {
      setPinUnlocked(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // ── Vérifier le PIN saisi par l'utilisateur ───────────────────────────────
  const verifyPin = useCallback(async (pin) => {
    try {
      const res = await api.post('/auth/pin/verify', { pin });
      if (res.valid && res.pinSessionToken) {
        // Stocker uniquement le token JWT, jamais le hash
        localStorage.setItem(PIN_TOKEN_KEY, res.pinSessionToken);
        setPinUnlocked(true);
        return { success: true };
      }
      return { success: false, error: 'Code PIN incorrect.' };
    } catch (err) {
      return { success: false, error: err.message || 'Erreur serveur.' };
    }
  }, []);

  // ── Créer ou remplacer le PIN (après OTP confirmé) ────────────────────────
  const setPin = useCallback(async (pin) => {
    try {
      const res = await api.post('/auth/pin/set', { pin });
      if (res.ok) {
        setHasPin(true);
        return { success: true };
      }
      return { success: false, error: res.error };
    } catch (err) {
      return { success: false, error: err.message || 'Erreur serveur.' };
    }
  }, []);

  // ── Déverrouiller manuellement (logout du mode admin) ────────────────────
  const lockPin = useCallback(() => {
    localStorage.removeItem(PIN_TOKEN_KEY);
    setPinUnlocked(false);
  }, []);

  // ── À appeler au logout du compte principal ───────────────────────────────
  // Supprime le token → si on reconnecte avec un autre compte,
  // le token appartient à l'ancien userId → check-session retournera false
  const clearPinOnLogout = useCallback(() => {
    localStorage.removeItem(PIN_TOKEN_KEY);
    setPinUnlocked(false);
    setHasPin(null);
  }, []);

  return {
    pinUnlocked,   // true = admin déverrouillé pour cette session
    hasPin,        // true = ce compte a un PIN en base
    loading,       // true = vérification en cours
    verifyPin,     // fn(pin: string) → { success, error? }
    setPin,        // fn(pin: string) → { success, error? }
    lockPin,       // verrouille la session admin
    clearPinOnLogout, // à appeler sur logout()
    checkSession,  // re-vérifie manuellement
  };
}