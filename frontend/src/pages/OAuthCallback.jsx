// src/pages/OAuthCallback.jsx
// Page de retour OAuth servie sur le domaine frontend (contourne le fait
// que Google impose COOP:same-origin → window.opener devient null dans la
// popup et postMessage ne peut plus signaler l'opener).
//
// Flow :
// 1. Backend termine l'échange de code Google puis redirige la popup vers
//    /__oauth#type=merchant&token=...&user=... (ou type=client&...&client=...).
// 2. Cette page lit le fragment (pas exposé aux logs serveur), écrit le
//    token + profil en localStorage, puis diffuse un événement via
//    BroadcastChannel pour réveiller l'onglet parent.
// 3. Ferme la popup. Si close() échoue (popup ouverte dans un onglet),
//    redirige vers l'accueil — l'app reprend avec l'utilisateur connecté.
import { useEffect } from 'react';
import { getBookingResume } from './booking-page/helpers';

export default function OAuthCallback() {
  useEffect(() => {
    // Hash plutôt que query pour garder token hors des logs serveur / referer.
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const type     = params.get('type');
    const token    = params.get('token');
    const preToken = params.get('pre_token');
    const err      = params.get('error');

    // Helper : broadcast + fallback via `storage` event (localStorage setItem
    // déclenche un `storage` event dans les autres onglets/fenêtres de la
    // même origine). Double canal = robustesse si BroadcastChannel manque.
    // Note : on ne close() PAS le channel tout de suite — fermer avant que
    // l'event loop n'ait dispatché le message peut le faire silencieusement
    // dropper. window.close() nettoiera tout de toute façon.
    let bc = null;
    try { bc = new BroadcastChannel('flowia-oauth'); } catch {}

    // RGPD commit 19 : nouveau type=oauth_pending — pas de login (pas de token
    // final), juste un pre_token JWT à transmettre à l'opener qui navigue vers
    // la page de confirmation google-confirm pour cocher CGU + marketing.
    if (type === 'oauth_pending') {
      const slug = params.get('slug') || '';
      try { localStorage.setItem('ff_oauth_pre_register', JSON.stringify({ pre_token: preToken, slug })); } catch {}
      try { bc && bc.postMessage({ type: 'oauth_pre_register', pre_token: preToken, slug }); } catch {}
      setTimeout(() => {
        try { bc && bc.close(); } catch {}
        try { window.close(); } catch {}
        if (!window.closed) {
          // Fallback : popup non-fermable (onglet) → on navigue ici aussi.
          window.location.replace(slug
            ? `/book/${slug}/auth/google-confirm?pre_token=${encodeURIComponent(preToken || '')}`
            : '/');
        }
      }, 400);
      return;
    }

    // Maintenance kill-switch : le backend Google callback redirige avec
    // error=MAINTENANCE quand l'user n'est pas dans la whitelist bypass.
    // On pose un marker localStorage que MaintenanceOverlay lit au mount
    // (de l'opener) pour afficher l'overlay sans dependre d'un BroadcastChannel
    // qui pourrait avoir un timing serre.
    if (err === 'MAINTENANCE') {
      const scope   = params.get('maintenance_scope')   || 'merchant_portal';
      const message = params.get('maintenance_message') || '';
      try {
        localStorage.setItem('ff_pending_maintenance', JSON.stringify({ scope, message, at: Date.now() }));
      } catch {}
      // Notifie aussi l'opener immediat si BroadcastChannel disponible.
      try { bc && bc.postMessage({ type: 'maintenance', scope, message }); } catch {}
      // Dispatch dans la popup elle-meme aussi (au cas ou elle ne ferme pas).
      try {
        window.dispatchEvent(new CustomEvent('ff-maintenance-on', { detail: { scope, message } }));
      } catch {}
      setTimeout(() => {
        try { bc && bc.close(); } catch {}
        try { window.close(); } catch {}
        if (!window.closed) window.location.replace('/');
      }, 400);
      return;
    }

    if (err || !token) {
      try { bc && bc.postMessage({ type: 'oauth_error', error: err || 'missing_token' }); } catch {}
      setTimeout(() => {
        try { window.close(); } catch {}
        if (!window.closed) window.location.replace('/?auth_error=' + encodeURIComponent(err || 'oauth_failed'));
      }, 400);
      return;
    }

    if (type === 'merchant') {
      const userRaw = params.get('user');
      let user = null;
      try { if (userRaw) user = JSON.parse(userRaw); } catch { /* noop */ }
      localStorage.removeItem('ff_pin_token');
      localStorage.setItem('ff_token', token);
      // Marqueur éphémère pour déclencher le `storage` event dans l'opener
      // (même origine). Payload = { token, user } pour que l'opener puisse
      // persister le token même si la popup était sur une autre origine.
      try { localStorage.setItem('ff_oauth_merchant', JSON.stringify({ token, user })); } catch {}
      try { bc && bc.postMessage({ type: 'merchant_login', token, user }); } catch {}
    } else if (type === 'client') {
      const clientRaw = params.get('client');
      let client = null;
      try { if (clientRaw) client = JSON.parse(clientRaw); } catch { /* noop */ }
      if (client) localStorage.setItem('ff_client_info', JSON.stringify(client));
      // Migration cookies HttpOnly : le backend a posé ff_client_token en
      // cookie côté navigateur lors du redirect. Plus besoin de stocker
      // le JWT en localStorage. Le marqueur ff_oauth_client garde le token
      // en mémoire transitoire 500 ms pour les listeners de l'opener qui
      // attendent le payload — sera supprimé après stabilisation.
      try { localStorage.setItem('ff_oauth_client', JSON.stringify({ token, client })); } catch {}
      try { bc && bc.postMessage({ type: 'client_login', token, client }); } catch {}
    }

    // 500 ms laisse largement le temps à BroadcastChannel + storage event
    // d'être dispatchés à l'opener avant de fermer la popup.
    setTimeout(() => {
      try { bc && bc.close(); } catch {}
      try { window.close(); } catch {}
      if (!window.closed) {
        if (type === 'client') {
          const slug = params.get('slug') || '';
          // Sur mobile/tablette, window.close() échoue souvent (l'onglet OAuth
          // n'a pas été ouvert comme popup script-closable). Au lieu de
          // retomber sur /book/:slug racine (étape 1, sélection perdue), on
          // restaure l'URL de la réservation en cours stashée par AuthPanel
          // avant le départ Google. Robuste à toutes les plateformes.
          const resume = slug ? getBookingResume(slug) : null;
          window.location.replace(resume || (slug ? `/book/${slug}` : '/'));
        } else {
          window.location.replace('/');
        }
      }
    }, 500);
  }, []);

  return (
    <div style={{
      fontFamily: "'Inter',-apple-system,sans-serif",
      minHeight: '100dvh', background: '#0f172a', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
        <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Connexion réussie</p>
        <p style={{ fontSize: 12, opacity: 0.6, margin: '4px 0 0' }}>Fermeture…</p>
      </div>
    </div>
  );
}
