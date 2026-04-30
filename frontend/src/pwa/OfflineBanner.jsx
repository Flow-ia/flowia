// src/pwa/OfflineBanner.jsx
// Detecte la perte de connexion (navigator.onLine + listeners online/offline)
// et affiche un bandeau rouge non-bloquant en haut de l'ecran. Bouton
// "Reessayer" qui ping un endpoint leger pour valider le retour de connexion.
//
// Cas d'usage :
//   - Le commercant est en PWA sur tablette : connexion 4G qui flanche
//     pendant un encaissement. Le bandeau apparait, il sait qu'il doit
//     attendre / refresh.
//   - Le serveur Render/Vercel est down : detection cote frontend grace aux
//     erreurs reseau attrapees globalement (event 'ff-network-error').
import React, { useEffect, useState, useCallback } from 'react';

const PING_PATH = '/api/health'; // route legere si elle existe, sinon fallback

export default function OfflineBanner() {
  // Initial state : aligne sur navigator.onLine. Si SSR -> true (assume online).
  const [online, setOnline]   = useState(typeof navigator === 'undefined' || navigator.onLine);
  const [trying, setTrying]   = useState(false);
  const [serverDown, setServerDown] = useState(false); // distincte de navigateur offline

  // Listeners natifs : declenches par l'OS quand la connexion change.
  useEffect(() => {
    const goOnline  = () => { setOnline(true);  setServerDown(false); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Fenetre custom : nos modules API peuvent emettre 'ff-network-error' sur
  // un fetch qui timeout ou renvoie 5xx. Permet de signaler un serveur down
  // meme si navigator.onLine = true.
  useEffect(() => {
    const onErr = () => {
      if (navigator.onLine) setServerDown(true);
    };
    const onOk = () => setServerDown(false);
    window.addEventListener('ff-network-error', onErr);
    window.addEventListener('ff-network-ok',    onOk);
    return () => {
      window.removeEventListener('ff-network-error', onErr);
      window.removeEventListener('ff-network-ok',    onOk);
    };
  }, []);

  const retry = useCallback(async () => {
    setTrying(true);
    try {
      // Test 1 : navigator.onLine (instantane)
      if (!navigator.onLine) {
        setOnline(false);
        return;
      }
      // Test 2 : ping le backend pour confirmer reseau OK serveur OK
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 5000);
      try {
        const r = await fetch(PING_PATH, {
          method: 'HEAD',
          cache:  'no-store',
          signal: ctrl.signal,
        });
        clearTimeout(tm);
        if (r.ok || r.status === 404) {
          // 404 acceptable : la route n'existe pas mais le serveur repond.
          // Ce qui compte = on a une reponse HTTP, donc reseau + serveur OK.
          setOnline(true);
          setServerDown(false);
          window.dispatchEvent(new Event('ff-network-ok'));
        } else {
          setServerDown(true);
        }
      } catch (e) {
        clearTimeout(tm);
        setServerDown(true);
      }
    } finally {
      setTrying(false);
    }
  }, []);

  if (online && !serverDown) return null;

  const isOffline = !online;
  const bg    = isOffline ? '#7f1d1d' : '#92400e';
  const accent = isOffline ? '#fca5a5' : '#fcd34d';
  const title = isOffline ? 'Hors ligne'           : 'Serveur indisponible';
  const desc  = isOffline
    ? "Vérifiez votre connexion internet. Vos modifications ne seront enregistrées qu'au retour."
    : "Le serveur ne répond pas. Réessayez dans un instant.";

  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed',
      left: 12, right: 12,
      top: 'max(12px, env(safe-area-inset-top, 0px))',
      zIndex: 9200,
      background: bg,
      color: '#fff',
      borderRadius: 12,
      padding: '10px 14px',
      boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
      border: `0.5px solid ${accent}`,
      maxWidth: 460,
      margin: '0 auto',
      fontFamily: 'inherit',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      animation: 'fadeIn 0.25s ease',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: accent, flexShrink: 0,
        animation: 'pulse 1.4s ease-in-out infinite',
      }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2, lineHeight: 1.35 }}>{desc}</div>
      </div>
      <button
        onClick={retry}
        disabled={trying}
        style={{
          background: '#fff', color: bg, border: 0,
          borderRadius: 8, padding: '7px 12px', fontWeight: 500,
          fontSize: 12, cursor: trying ? 'wait' : 'pointer',
          whiteSpace: 'nowrap', fontFamily: 'inherit',
          opacity: trying ? 0.7 : 1,
        }}
      >{trying ? 'Test…' : 'Réessayer'}</button>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
