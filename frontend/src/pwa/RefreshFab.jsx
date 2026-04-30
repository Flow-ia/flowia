// src/pwa/RefreshFab.jsx
// Bouton flottant "Recharger l'app" visible UNIQUEMENT en mode standalone
// (PWA installee) car en navigateur classique le commercant a deja F5.
//
// Position : bas-gauche pour ne pas chevaucher les FAB d'encaissement
// (souvent en bas-droite). Discret (32px, semi-transparent) au repos,
// devient opaque au survol.
//
// Comportement :
//   - Clic court  : reload simple (window.location.reload())
//   - Long press  : hard reload (clear cache SW + reload). Utile si update PWA
//                   coincee. Visuellement signalee par animation 800ms.
import React, { useEffect, useState, useRef } from 'react';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.navigator.standalone === true) return true;       // iOS
  if (document.referrer.startsWith('android-app://')) return true;
  return false;
}

// Routes publiques ou on ne veut pas de FAB (page de reservation client,
// callback OAuth, desinscription).
function isPublicRoute() {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname || '';
  return p.startsWith('/book/') || p.startsWith('/j/') ||
         p.startsWith('/unsubscribe') || p.startsWith('/__oauth');
}

export default function RefreshFab() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [longPressing, setLongPressing] = useState(false);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    setShow(isStandalone() && !isPublicRoute());
  }, []);

  if (!show) return null;

  const softReload = () => {
    if (busy) return;
    setBusy(true);
    // Petit delai pour que le feedback visuel soit visible
    setTimeout(() => window.location.reload(), 100);
  };

  const hardReload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Unregister tous les SW + vide les caches puis reload
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) { try { await reg.unregister(); } catch {} }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
      }
    } catch (e) {
      console.warn('[RefreshFab] hard reload partiel:', e?.message);
    } finally {
      // Force reload sans cache HTTP
      window.location.reload();
    }
  };

  const onPointerDown = () => {
    longPressTriggeredRef.current = false;
    setLongPressing(true);
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setLongPressing(false);
      hardReload();
    }, 800);
  };
  const onPointerUp = () => {
    setLongPressing(false);
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (!longPressTriggeredRef.current) softReload();
  };
  const onPointerLeave = () => {
    setLongPressing(false);
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  return (
    <button
      type="button"
      title="Toucher : recharger · Maintenir : vider cache + recharger"
      aria-label="Recharger l'application"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      disabled={busy}
      style={{
        position: 'fixed',
        left: 12,
        bottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
        zIndex: 8800,
        width: 36, height: 36,
        borderRadius: '50%',
        background: longPressing ? '#ef4444' : 'rgba(17, 19, 24, 0.55)',
        color: '#fff',
        border: '0.5px solid rgba(255,255,255,0.15)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
        cursor: busy ? 'wait' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background .2s ease, transform .15s ease, opacity .15s ease',
        opacity: busy ? 0.6 : 0.7,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = busy ? '0.6' : '0.7'; }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
           style={{
             transform: busy ? 'rotate(360deg)' : 'rotate(0deg)',
             transition: busy ? 'transform .8s ease' : 'none',
           }}>
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>
        <polyline points="21 3 21 8 16 8"/>
      </svg>
    </button>
  );
}
