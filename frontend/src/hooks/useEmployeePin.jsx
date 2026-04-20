// hooks/useEmployeePin.jsx
//
// Stratégie (commit C audit perms) :
//   - Le PIN est stocké hashé en base (employee_pins), jamais en clair côté client.
//   - Après vérification OK → backend retourne un "employeePinToken" (JWT 2h).
//   - Frontend stocke le token dans sessionStorage avec timestamp + TTL court
//     côté client (5 min de fenêtre d'action). Au-delà : re-saisie exigée.
//   - api.request() lit ce token via `actingEmployeeId` option → envoie header
//     x-employee-pin aux routes sensibles (/transactions, /booking/...).
//   - Backend (employeePinOptional middleware) valide + charge req.employee.
//   - sessionStorage vidé auto à la fermeture de l'onglet.

import { useCallback } from 'react';
import { api } from '../utils/api';

const TOKEN_PREFIX = 'ff_emp_pin_';
// TTL client : 5 min d'action autorisée après saisie du PIN. Backend = 2h
// mais on restreint côté client pour forcer la re-saisie si le poste est
// laissé ouvert.
const CLIENT_TTL_MS = 5 * 60 * 1000;

function getTokenKey(employeeId) { return `${TOKEN_PREFIX}${employeeId}`; }

export function useEmployeePin() {

  // ── Récupère le token de session pour un employé (ou null) ────────────────
  // Vérifie aussi le TTL client : si > 5 min, on purge et on renvoie null.
  const getStoredToken = useCallback((employeeId) => {
    try {
      const raw = sessionStorage.getItem(getTokenKey(employeeId));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj?.token || !obj?.ts) return null;
      if (Date.now() - obj.ts > CLIENT_TTL_MS) {
        sessionStorage.removeItem(getTokenKey(employeeId));
        return null;
      }
      return obj.token;
    } catch { return null; }
  }, []);

  // ── Stocke le token après vérification réussie ────────────────────────────
  const storeToken = useCallback((employeeId, token) => {
    try {
      sessionStorage.setItem(getTokenKey(employeeId),
        JSON.stringify({ token, ts: Date.now() }));
    } catch {}
  }, []);

  // ── Supprime le token (logout employé ou expiration) ──────────────────────
  const clearToken = useCallback((employeeId) => {
    try { sessionStorage.removeItem(getTokenKey(employeeId)); } catch {}
  }, []);

  // ── Vérifie si la session PIN est encore valide côté backend ──────────────
  const checkSession = useCallback(async (employeeId) => {
    const token = getStoredToken(employeeId);
    if (!token) return false;
    try {
      const res = await api.checkEmployeePinSession(employeeId, { employeePinToken: token });
      if (!res.valid) clearToken(employeeId);
      return res.valid === true;
    } catch { clearToken(employeeId); return false; }
  }, [getStoredToken, clearToken]);

  // ── Vérifie si l'employe a besoin d'un PIN (a un PIN actif) ──────────────
  const requiresPin = useCallback(async (employeeId) => {
    try {
      const status = await api.getEmployeePinStatus(employeeId);
      return status.has_pin && status.is_active;
    } catch { return false; }
  }, []);

  // ── Soumet le PIN saisi → backend compare → stocke le token si ok ────────
  // Le token stocké sera envoyé automatiquement par api.request() aux routes
  // sensibles via l'option actingEmployeeId.
  const verifyPin = useCallback(async (employeeId, pin) => {
    try {
      const res = await api.verifyEmployeePin(employeeId, { pin });
      if (res.valid && res.employeePinToken) {
        storeToken(employeeId, res.employeePinToken);
        return { success: true };
      }
      // Backend renvoie attempts_left si applicable
      const msg = res.code === 'PIN_LOCKED'
        ? 'PIN verrouillé. Réessayez plus tard.'
        : typeof res.attempts_left === 'number'
          ? `Code PIN incorrect. ${res.attempts_left} essai${res.attempts_left > 1 ? 's' : ''} restant${res.attempts_left > 1 ? 's' : ''}.`
          : 'Code PIN incorrect.';
      return { success: false, error: msg };
    } catch (err) {
      return { success: false, error: err.message || 'Erreur serveur.' };
    }
  }, [storeToken]);

  // ── Session valide si token stocké non expiré (5 min client TTL) ──────────
  const isSessionValid = useCallback(async (employeeId) => {
    return !!getStoredToken(employeeId);
  }, [getStoredToken]);

  return {
    requiresPin,
    isSessionValid,
    verifyPin,
    clearToken,
    getStoredToken,
  };
}
