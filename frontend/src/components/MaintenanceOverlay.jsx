// src/components/MaintenanceOverlay.jsx
// Overlay plein ecran affiche quand le backend renvoie 503 + header
// X-Maintenance:1 (kill-switch super-admin activé). 3 scopes possibles :
//   merchant_portal  -> dashboard commercant bloque
//   booking_public   -> reservation client bloquee
//   merchant_signup  -> inscription bloquee
//
// L'overlay s'affiche au-dessus de tout. Boutons :
//   - "Reessayer" : refetch /api/platform-status, ferme si OFF
//   - "Fermer"    : ferme manuellement (re-apparaitra au prochain 503)
//
// Style FDS-2026 : inline, fw<=500, bordures 0.5px, pas d'emoji, pas de gradient.

import React, { useEffect, useState, useCallback } from 'react';

const SCOPE_LABELS = {
  merchant_portal: 'Plateforme en maintenance',
  booking_public:  'Reservation indisponible',
  merchant_signup: 'Inscriptions suspendues',
};

const DEFAULT_MESSAGE = "Notre plateforme est en cours de maintenance. Merci de reessayer plus tard ou de contacter directement le support.";

export default function MaintenanceOverlay() {
  const [open, setOpen]       = useState(false);
  const [scope, setScope]     = useState('merchant_portal');
  const [message, setMessage] = useState('');
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const onMaint = (e) => {
      const d = e?.detail || {};
      setScope(d.scope || 'merchant_portal');
      setMessage(d.message || DEFAULT_MESSAGE);
      setOpen(true);
    };
    window.addEventListener('ff-maintenance-on', onMaint);
    return () => window.removeEventListener('ff-maintenance-on', onMaint);
  }, []);

  // Check pre-emptif au boot : evite que l'utilisateur charge la page login
  // ou booking publique sans savoir qu'elle est bloquee. Si le toggle qui
  // s'applique au host courant est ON, on affiche l'overlay tout de suite.
  // Le scope est devine d'apres l'URL : /book/* -> booking_public, sinon
  // merchant_portal (le signup est englobe dans merchant_portal cote front).
  useEffect(() => {
    let cancelled = false;
    // Marker pose par OAuthCallback quand Google OAuth retourne err=MAINTENANCE.
    // Lu une seule fois puis supprime, sinon l'overlay reapparaitrait
    // indefiniment apres correction.
    try {
      const raw = localStorage.getItem('ff_pending_maintenance');
      if (raw) {
        const d = JSON.parse(raw);
        if (d && (Date.now() - (d.at || 0) < 5 * 60 * 1000)) {
          setScope(d.scope || 'merchant_portal');
          setMessage(d.message || DEFAULT_MESSAGE);
          setOpen(true);
        }
        localStorage.removeItem('ff_pending_maintenance');
      }
    } catch { /* localStorage inaccessible */ }

    (async () => {
      try {
        const base = import.meta.env.VITE_API_URL || '/api';
        const r = await fetch(base + '/platform-status', { cache: 'no-store' });
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        const path = (typeof window !== 'undefined' ? window.location.pathname : '') || '';
        const isBooking = path.startsWith('/book/') || path.startsWith('/marketplace/');
        const detectedScope = isBooking ? 'booking_public' : 'merchant_portal';
        const section = data[detectedScope];
        if (section?.enabled) {
          setScope(detectedScope);
          setMessage(section.message || DEFAULT_MESSAGE);
          setOpen(true);
        }
      } catch { /* fail-silent : l'overlay arrivera via 503 si besoin */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      const base = import.meta.env.VITE_API_URL || '/api';
      const r = await fetch(base + '/platform-status', { cache: 'no-store' });
      const data = await r.json().catch(() => ({}));
      const stillOn =
        (scope === 'merchant_portal' && data.merchant_portal?.enabled) ||
        (scope === 'booking_public'  && data.booking_public?.enabled)  ||
        (scope === 'merchant_signup' && data.merchant_signup?.enabled);
      if (!stillOn) {
        setOpen(false);
      } else {
        // Mise a jour du message au cas ou l'admin l'a modifie entre temps.
        const sec = data[scope];
        if (sec?.message) setMessage(sec.message);
      }
    } catch { /* fail silencieux : on garde l'overlay ouvert */ }
    setRetrying(false);
  }, [scope]);

  if (!open) return null;

  // ── Styles inline (FDS-2026 : zinc, fw<=500, 0.5px borders) ────────────────
  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    background: 'rgba(255, 255, 255, 0.98)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    overflow: 'auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#18181b',
  };

  const cardStyle = {
    maxWidth: 520,
    width: '100%',
    padding: '40px 32px',
    border: '0.5px solid #e4e4e7',
    borderRadius: 12,
    background: '#fff',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.06)',
    textAlign: 'left',
  };

  const dotStyle = {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: '#f59e0b',
    display: 'inline-block',
    marginRight: 8,
    verticalAlign: 'middle',
  };

  const eyebrowStyle = {
    fontSize: 12,
    fontWeight: 500,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 16,
  };

  const titleStyle = {
    fontSize: 22,
    fontWeight: 500,
    lineHeight: 1.3,
    margin: '0 0 12px',
    color: '#18181b',
  };

  const bodyStyle = {
    fontSize: 15,
    lineHeight: 1.55,
    color: '#52525b',
    margin: '0 0 28px',
    whiteSpace: 'pre-wrap',
  };

  const rowStyle = {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  };

  const btnPrimary = {
    flex: '1 1 160px',
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 500,
    color: '#fff',
    background: '#18181b',
    border: '0.5px solid #18181b',
    borderRadius: 8,
    cursor: retrying ? 'not-allowed' : 'pointer',
    opacity: retrying ? 0.6 : 1,
  };

  const btnSecondary = {
    flex: '1 1 160px',
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 500,
    color: '#18181b',
    background: '#fff',
    border: '0.5px solid #d4d4d8',
    borderRadius: 8,
    cursor: 'pointer',
  };

  const footerStyle = {
    fontSize: 12,
    color: '#a1a1aa',
    marginTop: 24,
    paddingTop: 16,
    borderTop: '0.5px solid #f4f4f5',
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="maint-title">
      <div style={cardStyle}>
        <div style={eyebrowStyle}>
          <span style={dotStyle} />
          {"Maintenance"}
        </div>
        <h1 id="maint-title" style={titleStyle}>
          {SCOPE_LABELS[scope] || SCOPE_LABELS.merchant_portal}
        </h1>
        <p style={bodyStyle}>{message || DEFAULT_MESSAGE}</p>
        <div style={rowStyle}>
          <button
            type="button"
            style={btnPrimary}
            onClick={retry}
            disabled={retrying}
          >
            {retrying ? "Verification..." : "Reessayer"}
          </button>
          <button
            type="button"
            style={btnSecondary}
            onClick={() => setOpen(false)}
          >
            {"Fermer"}
          </button>
        </div>
        <div style={footerStyle}>
          {"FlowIA · Notre support reste disponible si besoin."}
        </div>
      </div>
    </div>
  );
}
