// hooks/useIdleLock.jsx — Mode veille auto (commit 31).
//
// Lit `user_settings` (lock_screen_enabled, lock_screen_idle_minutes) et
// verrouille l'application après inactivité (mousemove / keydown / click /
// touchstart / scroll). Le composant `<LockScreen>` consomme l'état exposé
// par ce hook pour afficher l'overlay de déverrouillage.
//
// Persistance : flag `ff_app_locked` en sessionStorage → si l'utilisateur
// recharge la page après verrouillage, l'app reste verrouillée jusqu'à
// déverrouillage explicite (PIN employé/admin) ou déconnexion.
//
// Reload settings : écoute `ff-user-settings-updated` (dispatché par la
// page Sécurité après save) → applique la nouvelle durée immédiatement.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { userSettingsApi } from '../utils/api';

const IdleLockContext = createContext(null);
const LOCK_KEY = 'ff_app_locked';
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];

function readLockState() {
  try { return sessionStorage.getItem(LOCK_KEY) === '1'; }
  catch { return false; }
}
function writeLockState(locked) {
  try {
    if (locked) sessionStorage.setItem(LOCK_KEY, '1');
    else sessionStorage.removeItem(LOCK_KEY);
  } catch {}
}

export function IdleLockProvider({ children }) {
  const [locked, setLocked] = useState(() => readLockState());
  const [config, setConfig] = useState({ enabled: false, idleMinutes: 15 });
  const lastActivityRef = useRef(Date.now());
  const timerRef = useRef(null);

  // Charge la config depuis user_settings (best-effort : si user pas connecté
  // ou erreur réseau, on reste sur le default désactivé).
  const loadConfig = useCallback(async () => {
    try {
      const s = await userSettingsApi.get();
      setConfig({
        enabled: !!s.lock_screen_enabled,
        idleMinutes: Number(s.lock_screen_idle_minutes) || 0,
      });
    } catch {
      setConfig({ enabled: false, idleMinutes: 0 });
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Ré-applique la config quand la page Sécurité enregistre.
  useEffect(() => {
    const handler = () => loadConfig();
    window.addEventListener('ff-user-settings-updated', handler);
    return () => window.removeEventListener('ff-user-settings-updated', handler);
  }, [loadConfig]);

  // Timer d'inactivité — recalcule à chaque tick. Ne fait rien si désactivé
  // ou déjà verrouillé. Tick à 30s = précision suffisante pour minimum 10min.
  useEffect(() => {
    if (!config.enabled || config.idleMinutes <= 0 || locked) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    const idleMs = config.idleMinutes * 60 * 1000;
    timerRef.current = setInterval(() => {
      const inactiveFor = Date.now() - lastActivityRef.current;
      if (inactiveFor >= idleMs) {
        setLocked(true);
        writeLockState(true);
      }
    }, 30_000);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [config.enabled, config.idleMinutes, locked]);

  // Reset du timer à chaque activité user. Bypass si déjà verrouillé (sinon
  // taper le PIN reset le compteur — pas dramatique mais inutile).
  useEffect(() => {
    if (!config.enabled || locked) return;
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, onActivity));
    };
  }, [config.enabled, locked]);

  const unlock = useCallback(() => {
    setLocked(false);
    writeLockState(false);
    lastActivityRef.current = Date.now();
  }, []);

  const lockNow = useCallback(() => {
    setLocked(true);
    writeLockState(true);
  }, []);

  return (
    <IdleLockContext.Provider value={{ locked, unlock, lockNow, config }}>
      {children}
    </IdleLockContext.Provider>
  );
}

export function useIdleLock() {
  const ctx = useContext(IdleLockContext);
  if (!ctx) {
    return { locked: false, unlock: () => {}, lockNow: () => {}, config: { enabled: false, idleMinutes: 0 } };
  }
  return ctx;
}
