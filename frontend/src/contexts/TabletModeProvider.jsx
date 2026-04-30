// TabletModeProvider — refonte FDS-2026 commit 11.
// Orchestre le mode tablette partagée (user_settings.tablet_mode_enabled)
// et la bascule temporaire en mode admin via PIN admin (session raccourcie
// à user_settings.employee_session_timeout_min, défaut 15 min).
//
// Logique conservée intacte :
// - useAdmin.unlocked reste la source de vérité du PIN admin (JWT 2 h back).
// - Le provider ne fait QUE lire unlocked et forcer un `lock()` à expiration
//   du timer front. Le token serveur expire à son rythme en parallèle.
// - useEmployeePin (hook existant, TTL 5 min sessionStorage) reste la source
//   de vérité pour les PIN employés : le provider ne le double pas.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { userSettingsApi } from '../utils/api';
import { useAdmin } from '../hooks/useAdmin';

const TabletContext = createContext(null);

const DEFAULT_SETTINGS = {
  tablet_mode_enabled:          false,
  employee_session_timeout_min: 15,
  lock_on_tab_close:            true,
};

export function TabletModeProvider({ children }) {
  const { unlocked, lock } = useAdmin();

  const [settings, setSettings]                 = useState(DEFAULT_SETTINGS);
  const [adminBypassExpiresAt, setExpiresAt]    = useState(0);
  const [tick, setTick]                         = useState(0);
  const expiresRef = useRef(0);

  // ── Lecture initiale de user_settings (401 tolérant : avant login).
  // Skip carrement l'appel si pas de token commercant : evite le 401
  // visible dans la console (notamment sur le domaine booking public ou
  // aucun token n'existe).
  useEffect(() => {
    let cancelled = false;
    const hasToken = () => {
      try { return !!localStorage.getItem('ff_token'); } catch { return false; }
    };
    const load = () => {
      if (!hasToken()) return; // pas de session merchant -> pas d'appel
      userSettingsApi.get()
        .then(s => {
          if (cancelled) return;
          setSettings({
            tablet_mode_enabled:          !!s.tablet_mode_enabled,
            employee_session_timeout_min: Number(s.employee_session_timeout_min) || 15,
            lock_on_tab_close:            s.lock_on_tab_close !== false,
          });
        })
        .catch(() => { /* pas de session merchant → rester en défaut */ });
    };
    load();
    // Recharger quand un login merchant se fait (token posé dans localStorage).
    const onStorage = (e) => { if (e.key === 'ff_token') load(); };
    window.addEventListener('storage', onStorage);
    return () => { cancelled = true; window.removeEventListener('storage', onStorage); };
  }, []);

  // ── Bascule admin : quand unlocked passe à true ET qu'on est en tablette,
  //    on pose une expiration frontale courte. Sinon on laisse tel quel.
  useEffect(() => {
    if (!settings.tablet_mode_enabled) {
      expiresRef.current = 0;
      setExpiresAt(0);
      return;
    }
    if (unlocked) {
      const at = Date.now() + settings.employee_session_timeout_min * 60 * 1000;
      expiresRef.current = at;
      setExpiresAt(at);
    } else {
      expiresRef.current = 0;
      setExpiresAt(0);
    }
  }, [unlocked, settings.tablet_mode_enabled, settings.employee_session_timeout_min]);

  // ── Countdown 1 s : force re-render, déclenche lock() à expiration.
  useEffect(() => {
    if (!adminBypassExpiresAt) return;
    const iv = setInterval(() => {
      setTick(x => x + 1);
      if (Date.now() >= expiresRef.current && expiresRef.current) {
        expiresRef.current = 0;
        setExpiresAt(0);
        try { lock && lock(); } catch { /* noop */ }
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [adminBypassExpiresAt, lock]);

  // ── lock_on_tab_close : purge tokens sensibles si activé en mode tablette.
  useEffect(() => {
    if (!settings.tablet_mode_enabled || !settings.lock_on_tab_close) return;
    const onBeforeUnload = () => {
      try { lock && lock(); } catch { /* noop */ }
      try {
        // Purge toutes les sessions PIN employé (ff_emp_pin_<id>).
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith('ff_emp_pin_')) keys.push(k);
        }
        keys.forEach(k => sessionStorage.removeItem(k));
      } catch { /* noop */ }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [settings.tablet_mode_enabled, settings.lock_on_tab_close, lock]);

  const remainingSec = adminBypassExpiresAt
    ? Math.max(0, Math.floor((adminBypassExpiresAt - Date.now()) / 1000))
    : 0;

  // `adminBypass` = mode tablette actif ET PIN admin saisi (session front non expirée).
  const adminBypass = !!(settings.tablet_mode_enabled && unlocked && adminBypassExpiresAt && Date.now() < adminBypassExpiresAt);

  const value = {
    isTabletMode: !!settings.tablet_mode_enabled,
    sessionTimeoutMin: settings.employee_session_timeout_min,
    lockOnClose:       settings.lock_on_tab_close,
    adminBypass,
    remainingSec,
    quitAdmin: () => { try { lock && lock(); } catch { /* noop */ } },
    // Expose un setter pour forcer le provider à relire les settings après
    // modification dans Réglages > Équipe > Sécurité (commit 4).
    reloadSettings: () => {
      userSettingsApi.get()
        .then(s => setSettings({
          tablet_mode_enabled:          !!s.tablet_mode_enabled,
          employee_session_timeout_min: Number(s.employee_session_timeout_min) || 15,
          lock_on_tab_close:            s.lock_on_tab_close !== false,
        }))
        .catch(() => {});
    },
    // tick exposé pour que les consumers affichant le countdown re-render.
    _tick: tick,
  };

  return <TabletContext.Provider value={value}>{children}</TabletContext.Provider>;
}

export function useTabletMode() {
  const ctx = useContext(TabletContext);
  // Hors provider : fallback neutre — aucune régression si l'app est montée
  // sans wrap (tests isolés, sous-chemins publics, etc.).
  return ctx || {
    isTabletMode: false,
    sessionTimeoutMin: 15,
    lockOnClose: true,
    adminBypass: false,
    remainingSec: 0,
    quitAdmin: () => {},
    reloadSettings: () => {},
    _tick: 0,
  };
}
