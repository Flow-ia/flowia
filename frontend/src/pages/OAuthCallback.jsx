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

export default function OAuthCallback() {
  useEffect(() => {
    // Hash plutôt que query pour garder token hors des logs serveur / referer.
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const type   = params.get('type');
    const token  = params.get('token');
    const err    = params.get('error');

    // Helper : broadcast + fallback via `storage` event (localStorage setItem
    // déclenche un `storage` event dans les autres onglets/fenêtres de la
    // même origine). Double canal = robustesse si BroadcastChannel manque.
    // Note : on ne close() PAS le channel tout de suite — fermer avant que
    // l'event loop n'ait dispatché le message peut le faire silencieusement
    // dropper. window.close() nettoiera tout de toute façon.
    let bc = null;
    try { bc = new BroadcastChannel('flowia-oauth'); } catch {}

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
      localStorage.setItem('ff_client_token', token);
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
          window.location.replace(slug ? `/book/${slug}` : '/');
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
