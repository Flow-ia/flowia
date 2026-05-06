// src/pwa/InstallPrompt.jsx
// Bandeau discret invitant le commerçant à installer FlowIA en PWA.
// - Capture beforeinstallprompt (Chrome / Edge / Android)
// - Détecte iOS Safari → instructions manuelles "Partager → Sur l'écran d'accueil"
// - Détecte standalone (déjà installé) → ne s'affiche pas
// - Après install réussie : déclenche automatiquement la souscription push
//   (le commerçant s'attend à recevoir les notifs RDV instantanément).
// - Dismiss persistant 14 jours pour ne pas spammer.
import React, { useEffect, useState, useCallback } from 'react';
import { notifApi } from '../utils/api';

const DISMISS_KEY = 'flowia_pwa_install_dismissed_at';
const DISMISS_DAYS = 14;

function isStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.navigator.standalone === true) return true; // iOS
  if (document.referrer.startsWith('android-app://')) return true;
  return false;
}

function isIOS() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return true;
  // iPad iOS 13+ se présente comme MacIntel — détecter via touch
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

function isDismissed() {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const ts = parseInt(v, 10);
    if (!Number.isFinite(ts)) return false;
    return (Date.now() - ts) < DISMISS_DAYS * 24 * 3600 * 1000;
  } catch { return false; }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Active la souscription push après installation. Best-effort : si l'utilisateur
// refuse la permission, on ne bloque pas — il pourra l'activer plus tard depuis
// les réglages.
async function enablePushAfterInstall() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const reg = await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    const keyData = await notifApi.getVapidKey();
    if (!keyData?.publicKey) return;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });
    }
    await notifApi.subscribePush(sub.toJSON());
  } catch {}
}

// Routes publiques (réservation client, désinscription, OAuth callback) où
// le bandeau d'install n'a aucun sens — l'utilisateur n'est pas le commerçant.
function isPublicRoute() {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname || '';
  return p.startsWith('/book/') || p.startsWith('/j/') ||
         p.startsWith('/unsubscribe') || p.startsWith('/__oauth');
}

export default function InstallPrompt() {
  const [deferred, setDeferred]     = useState(null);
  const [visible, setVisible]       = useState(false);
  const [showIOSHelp, setIOSHelp]   = useState(false);
  const [installed, setInstalled]   = useState(isStandalone());

  if (isPublicRoute()) return null;

  // Capture l'event Chrome/Android
  useEffect(() => {
    if (installed || isDismissed()) return;
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, [installed]);

  // iOS : pas d'event natif → on propose l'aide après quelques secondes
  // si Safari et pas déjà standalone.
  useEffect(() => {
    if (installed || isDismissed()) return;
    if (!isIOS()) return;
    // Safari uniquement (Chrome iOS ne peut pas installer)
    const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);
    if (!isSafari) return;
    const t = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(t);
  }, [installed]);

  // Détecte l'install réussie
  useEffect(() => {
    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
      try { localStorage.removeItem(DISMISS_KEY); } catch {}
      // Activer push notifs immédiatement après install
      enablePushAfterInstall();
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  const onInstallClick = useCallback(async () => {
    if (isIOS()) { setIOSHelp(true); return; }
    if (!deferred) return;
    try {
      deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice?.outcome === 'accepted') {
        setVisible(false);
        // appinstalled handler s'occupe de la suite
      } else {
        // Refus utilisateur — silence 14j
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
        setVisible(false);
      }
    } catch {} finally {
      setDeferred(null);
    }
  }, [deferred]);

  const onDismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
    setIOSHelp(false);
  }, []);

  if (installed || !visible) return null;

  // Couleurs neutres (FDS-2026 : pas de gradient agressif)
  const bg = '#111318';
  const text = '#fff';
  const accent = '#6366f1';

  return (
    <div style={{
      position: 'fixed',
      left: 12, right: 12,
      bottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
      zIndex: 9000,
      background: bg,
      color: text,
      borderRadius: 14,
      padding: '12px 14px',
      boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
      border: '0.5px solid rgba(255,255,255,0.08)',
      maxWidth: 460,
      margin: '0 auto',
      fontFamily: 'inherit',
      animation: 'fadeIn 0.25s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src="/icon-192.png" alt="" width="44" height="44"
             style={{ borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.2 }}>
            {showIOSHelp ? 'Installer FlowIA sur iPhone' : 'Installer FlowIA'}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2, lineHeight: 1.3 }}>
            {showIOSHelp
              ? "Touchez Partager puis « Sur l'écran d'accueil »."
              : 'Notifications RDV instantanées et accès direct depuis votre écran.'}
          </div>
        </div>
        {!showIOSHelp && (
          <button
            onClick={onInstallClick}
            style={{
              background: accent, color: '#fff', border: 0,
              borderRadius: 8, padding: '8px 14px', fontWeight: 500,
              fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
          >Installer</button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Fermer"
          style={{
            background: 'transparent', color: text, border: 0,
            opacity: 0.55, cursor: 'pointer', fontSize: 18,
            padding: '4px 6px', lineHeight: 1, fontFamily: 'inherit',
          }}
        >×</button>
      </div>
    </div>
  );
}
