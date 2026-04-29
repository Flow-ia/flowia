// src/pwa/UpdateBanner.jsx
// Bandeau "Mise à jour disponible" affiché dès qu'un nouveau Service Worker
// est en attente. Un clic active le SW + recharge la page — l'utilisateur
// ne perd pas une saisie en cours par un reload silencieux.
import React, { useEffect, useState } from 'react';
import { onSWUpdate, activateWaitingSW } from './registerSW';

export default function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [applying, setApplying]   = useState(false);

  useEffect(() => {
    return onSWUpdate(() => setAvailable(true));
  }, []);

  if (!available) return null;

  const apply = async () => {
    if (applying) return;
    setApplying(true);
    // skipWaiting du SW en attente → controllerchange déclenche reload auto
    // dans registerSW.js. Si ça traîne (>3s), on force un reload.
    await activateWaitingSW();
    setTimeout(() => { window.location.reload(); }, 3000);
  };

  return (
    <div style={{
      position: 'fixed',
      left: 12, right: 12,
      top: 'max(12px, env(safe-area-inset-top, 0px))',
      zIndex: 9100,
      background: '#111318',
      color: '#fff',
      borderRadius: 12,
      padding: '10px 14px',
      boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
      border: '0.5px solid rgba(255,255,255,0.08)',
      maxWidth: 460,
      margin: '0 auto',
      fontFamily: 'inherit',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      animation: 'fadeIn 0.25s ease',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>
          Nouvelle version disponible
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2, lineHeight: 1.3 }}>
          Touchez pour recharger l'application.
        </div>
      </div>
      <button
        onClick={apply}
        disabled={applying}
        style={{
          background: '#6366f1', color: '#fff', border: 0,
          borderRadius: 8, padding: '8px 14px', fontWeight: 500,
          fontSize: 12, cursor: applying ? 'wait' : 'pointer',
          whiteSpace: 'nowrap', fontFamily: 'inherit',
          opacity: applying ? 0.7 : 1,
        }}
      >{applying ? 'Mise à jour…' : 'Recharger'}</button>
    </div>
  );
}
