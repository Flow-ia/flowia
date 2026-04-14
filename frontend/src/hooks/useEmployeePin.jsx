// hooks/useEmployeePin.jsx
//
// Stratégie :
//   - Le PIN est stocké hashé en base (employee_pins), jamais en clair côté client
//   - Après vérification OK → backend retourne un "employeePinToken" (JWT 2h)
//   - Frontend stocke ces tokens dans sessionStorage :
//       clé : `ff_emp_pin_<employeeId>`
//       valeur : token JWT
//   - SessionStorage → vidé automatiquement à la fermeture de l'onglet
//   - Chaque action sensible vérifie si l'employé a un PIN actif, puis demande ce token

import { useCallback } from 'react';
import { api } from '../utils/api';

const TOKEN_PREFIX = 'ff_emp_pin_';

function getTokenKey(employeeId) {
  return `${TOKEN_PREFIX}${employeeId}`;
}

export function useEmployeePin() {

  // ── Récupère le token de session pour un employé (ou null) ────────────────
  const getStoredToken = useCallback((employeeId) => {
    return sessionStorage.getItem(getTokenKey(employeeId));
  }, []);

  // ── Stocke le token après vérification réussie ────────────────────────────
  const storeToken = useCallback((employeeId, token) => {
    sessionStorage.setItem(getTokenKey(employeeId), token);
  }, []);

  // ── Supprime le token (logout employé ou expiration) ──────────────────────
  const clearToken = useCallback((employeeId) => {
    sessionStorage.removeItem(getTokenKey(employeeId));
  }, []);

  // ── Vérifie si la session PIN est encore valide côté backend ──────────────
  const checkSession = useCallback(async (employeeId) => {
    const token = getStoredToken(employeeId);
    if (!token) return false;
    try {
      const res = await api.checkEmployeePinSession(employeeId, { employeePinToken: token });
      if (!res.valid) clearToken(employeeId);
      return res.valid === true;
    } catch {
      clearToken(employeeId);
      return false;
    }
  }, [getStoredToken, clearToken]);

  // ── Vérifie si l'employe a besoin d'un PIN (a un PIN actif) ──────────────
  const requiresPin = useCallback(async (employeeId) => {
    try {
      const status = await api.getEmployeePinStatus(employeeId);
      return status.has_pin && status.is_active;
    } catch {
      return false;
    }
  }, []);

  // ── Soumet le PIN saisi → backend compare → retourne token si ok ─────────
  const verifyPin = useCallback(async (employeeId, pin) => {
    try {
      const res = await api.verifyEmployeePin(employeeId, { pin });
      if (res.valid) {
        // ⚠️ Token NON stocké volontairement : le PIN doit être resaisi à chaque action
        return { success: true };
      }
      return { success: false, error: 'Code PIN incorrect.' };
    } catch (err) {
      return { success: false, error: err.message || 'Erreur serveur.' };
    }
  }, []);

  // ── Vérifie la session stockée ; si invalide, demande re-vérification ─────
  // Retourne true si la session est valide, false sinon (→ afficher le modal)
  // PIN requis à chaque action → session toujours invalide
  const isSessionValid = useCallback(async (_employeeId) => {
    return false;
  }, []);

  return {
    requiresPin,
    isSessionValid,
    verifyPin,
    clearToken,
    getStoredToken,
  };
}
