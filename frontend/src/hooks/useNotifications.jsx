// src/hooks/useNotifications.jsx
// Gère : sons (Web Audio API), Web Push, notifications in-app, polling RDV
import { useState, useEffect, useCallback, useRef } from 'react';
import { notifApi } from '../utils/api';

// ── AudioContext singleton + résumé automatique ─────────────────────────────
let _audioCtx = null;

function getAudioCtx() {
  try {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Résumer si suspendu (politique navigateur)
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(() => {});
    }
    return _audioCtx;
  } catch { return null; }
}

// Résumer le contexte audio dès la première interaction utilisateur
if (typeof window !== 'undefined') {
  const resumeOnInteraction = () => {
    if (_audioCtx && _audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(() => {});
    }
    // Pré-créer le contexte à la première interaction
    if (!_audioCtx) {
      try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {}
    }
  };
  ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(ev =>
    document.addEventListener(ev, resumeOnInteraction, { once: false, passive: true })
  );
}

// ── Synthèse sonore ────────────────────────────────────────────────────────────
export function playSound(type, repeat = 1) {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const SOUNDS = {
    caisse: [
      { freq: 880,  wave: 'sine',     start: 0,    dur: 0.10, gain: 0.85 },
      { freq: 1100, wave: 'sine',     start: 0.07, dur: 0.14, gain: 0.75 },
      { freq: 1320, wave: 'sine',     start: 0.15, dur: 0.22, gain: 0.95 },
    ],
    new_appointment: [
      { freq: 523,  wave: 'triangle', start: 0,    dur: 0.18, gain: 0.75 },
      { freq: 659,  wave: 'triangle', start: 0.14, dur: 0.18, gain: 0.75 },
      { freq: 784,  wave: 'triangle', start: 0.28, dur: 0.30, gain: 0.85 },
      { freq: 1047, wave: 'triangle', start: 0.42, dur: 0.35, gain: 0.95 },
    ],
    reminder: [
      { freq: 880,  wave: 'square',   start: 0,    dur: 0.12, gain: 0.70 },
      { freq: 880,  wave: 'square',   start: 0.22, dur: 0.12, gain: 0.70 },
      { freq: 1100, wave: 'square',   start: 0.44, dur: 0.18, gain: 0.90 },
    ],
  };

  const notes    = SOUNDS[type] || SOUNDS.caisse;
  const lastNote = notes[notes.length - 1];
  const singleDur = lastNote.start + lastNote.dur + 0.08;
  const gap       = 0.40;

  const play = () => {
    const now = ctx.currentTime;
    for (let r = 0; r < Math.max(1, repeat); r++) {
      const off = r * (singleDur + gap);
      notes.forEach(({ freq, wave, start, dur, gain }) => {
        try {
          const osc  = ctx.createOscillator();
          const gn   = ctx.createGain();
          const comp = ctx.createDynamicsCompressor(); // évite la saturation
          osc.type = wave;
          osc.frequency.setValueAtTime(freq, now + off + start);
          gn.gain.setValueAtTime(0, now + off + start);
          gn.gain.linearRampToValueAtTime(gain, now + off + start + 0.005);
          gn.gain.exponentialRampToValueAtTime(0.001, now + off + start + dur);
          osc.connect(gn);
          gn.connect(comp);
          comp.connect(ctx.destination);
          osc.start(now + off + start);
          osc.stop(now + off + start + dur + 0.01);
        } catch {}
      });
    }
  };

  if (ctx.state === 'suspended') {
    ctx.resume().then(play).catch(() => {});
  } else {
    play();
  }
}

// ── Enregistrement du Service Worker + Web Push ───────────────────────────────
// #29 : retourne un objet structuré { ok, reason } au lieu de null silencieux,
// pour que l'UI puisse afficher un message clair : 'Permission refusée' vs
// 'Navigateur non supporté' vs 'Erreur technique'.
async function registerPush(publicKey) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return { ok: false, reason: 'denied' };
    if (permission !== 'granted') return { ok: false, reason: 'dismissed' };
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    return { ok: true, subscription: sub };
  } catch (e) {
    console.warn('[Push]', e.message);
    return { ok: false, reason: 'error', message: e.message };
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// ── Hook principal ────────────────────────────────────────────────────────────
export function useNotifications({ enabled = true, soundSettings = {} } = {}) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled,   setPushEnabled]   = useState(false);
  const prevCountRef = useRef(0);
  const pollRef      = useRef(null);

  const loadNotifications = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await notifApi.getInApp();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {}
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    loadNotifications();
    // J25 : polling 30s, mais pause quand l'onglet est caché (économie batterie
    // mobile). Re-fetch immédiat au retour au foreground pour rattraper les
    // notifs reçues pendant l'absence.
    const startPoll = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(loadNotifications, 30000);
    };
    const stopPoll = () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        loadNotifications();
        startPoll();
      } else {
        stopPoll();
      }
    };
    if (document.visibilityState === 'visible') startPoll();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stopPoll();
    };
  }, [loadNotifications]);

  useEffect(() => {
    setPushSupported('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
  }, []);

  const enablePush = useCallback(async () => {
    try {
      const keyData = await notifApi.getVapidKey();
      if (!keyData?.publicKey) return { ok: false, reason: 'vapid_missing' };
      const r = await registerPush(keyData.publicKey);
      if (!r.ok) return r;
      await notifApi.subscribePush(r.subscription.toJSON());
      setPushEnabled(true);
      return { ok: true };
    } catch (e) {
      console.warn('[enablePush]', e);
      return { ok: false, reason: 'error', message: e?.message };
    }
  }, []);

  const disablePush = useCallback(async () => {
    try {
      if (!('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.getRegistration('/');
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // J16 : ordre inversé + sub.unsubscribe dans try/catch pour garantir
        // la suppression serveur même si le navigateur rejette l'unsubscribe
        // local (cas rare). Un sub fantôme côté navigateur crée aujourd'hui
        // une re-sub silencieuse au prochain enablePush via l'UPSERT.
        try { await sub.unsubscribe(); } catch (uErr) {
          console.warn('[disablePush] sub.unsubscribe local a échoué', uErr?.message);
        }
        await notifApi.unsubscribePush({ endpoint: sub.endpoint }).catch(() => {});
      }
      setPushEnabled(false);
    } catch {}
  }, []);

  const markRead = useCallback(async (id) => {
    // J15 : ne décrémente le badge QUE si la notif n'était pas déjà lue.
    // Double-clic ou re-click sur une notif déjà lue n'impacte plus le count.
    let wasUnread = false;
    setNotifications(prev => prev.map(n => {
      if (n.id === id) {
        if (!n.is_read) wasUnread = true;
        return { ...n, is_read: true };
      }
      return n;
    }));
    if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
    try { await notifApi.markRead({ id }); } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    await notifApi.markRead({ all: true });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  const deleteNotif = useCallback(async (id) => {
    await notifApi.deleteInApp(id);
    setNotifications(prev => {
      const n = prev.find(x => x.id === id);
      if (n && !n.is_read) setUnreadCount(c => Math.max(0, c - 1));
      return prev.filter(x => x.id !== id);
    });
  }, []);

  const triggerSound = useCallback((type) => {
    if (soundSettings[type] === false) return;
    playSound(type, soundSettings.repeat || 2);
  }, [soundSettings]);

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type !== 'navigate') return;
      // SÉCURITÉ : validation stricte — uniquement chemins relatifs internes.
      // Refuse javascript:, data:, //evil, http://, URL avec \ ou control chars.
      const raw = e.data.url;
      if (typeof raw !== 'string' || !raw.length) return;
      if (raw[0] !== '/' || raw.startsWith('//')) return;
      if (/[\x00-\x1f]/.test(raw) || raw.includes('\\')) return;
      window.location.href = raw;
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  return {
    notifications, unreadCount, pushSupported, pushEnabled,
    enablePush, disablePush, markRead, markAllRead, deleteNotif,
    triggerSound, reload: loadNotifications,
  };
}
