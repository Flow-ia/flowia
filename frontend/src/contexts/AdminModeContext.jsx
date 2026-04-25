// AdminModeContext — refonte FDS-2026 commit 15.
//
// Mode admin UX-only (front pur). Source de vérité : localStorage clé
// 'ff_admin_mode_active'. Ne dépend PAS de user_settings.tablet_mode_enabled
// (le système commit 11 reste dans le code mais court-circuité côté front,
// cf. App.jsx). Aucune sécurité serveur ne repose sur ce flag : pinAdminMiddleware
// (back) reste exigé pour toutes les actions sensibles (edit/delete tx,
// update settings, etc.) — ce contexte ne gère QUE l'apparence de la sidebar
// et le filtrage des routes accessibles côté UI.
//
// Sémantique :
// - isAdminMode = false (défaut) : sidebar 3 items (Agenda · Caisse · Clients),
//   bouton « Convertir en mode admin » qui demande le PIN admin.
// - isAdminMode = true : sidebar complète + badge « Admin », bouton « Quitter
//   le mode admin » (disable direct, sans PIN).
//
// Pas de timer auto. La bascule reste tant que l'utilisateur ne clique pas
// « Quitter ». Le localStorage est purgé sur disable.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'ff_admin_mode_active';

const AdminModeContext = createContext(null);

function readInitial() {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch { return false; }
}

export function AdminModeProvider({ children }) {
  const [isAdminMode, setIsAdminMode] = useState(readInitial);

  // Synchronisation cross-tab : si l'utilisateur ouvre 2 onglets et bascule
  // dans l'un, l'autre suit (write trigger 'storage' event sur les autres tabs).
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setIsAdminMode(e.newValue === 'true');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const enableAdminMode = useCallback(() => {
    try { window.localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* noop */ }
    setIsAdminMode(true);
  }, []);

  const disableAdminMode = useCallback(() => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    setIsAdminMode(false);
  }, []);

  return (
    <AdminModeContext.Provider value={{ isAdminMode, enableAdminMode, disableAdminMode }}>
      {children}
    </AdminModeContext.Provider>
  );
}

export function useAdminMode() {
  const ctx = useContext(AdminModeContext);
  // Hors provider : fallback neutre — l'app doit fonctionner même si le wrap
  // est manquant (mode normal par défaut, bascule no-op).
  return ctx || {
    isAdminMode: false,
    enableAdminMode: () => {},
    disableAdminMode: () => {},
  };
}
