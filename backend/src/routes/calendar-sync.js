// routes/calendar-sync.js — OAuth + gestion sync Google Calendar (merchant).
//
// Endpoints :
//   GET  /api/calendar-sync/status   → etat connexion (connected, email, last_sync_at)
//   GET  /api/calendar-sync/connect  → genere l'URL OAuth Google + state JWT
//   GET  /api/calendar-sync/callback → echange le code contre tokens, persist
//   POST /api/calendar-sync/disconnect → revoque le token + delete row
//   POST /api/calendar-sync/toggle   → active/desactive sync sans deconnecter

const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { encrypt } = require('../utils/tokenCrypto');

const router = express.Router();

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO  = 'https://www.googleapis.com/oauth2/v2/userinfo';
// Scope minimal : creation/modification d'events. PAS de readonly sur le
// calendar entier (moins intrusif, RGPD-friendly).
const SCOPE = 'https://www.googleapis.com/auth/calendar.events openid email';

function getCreds() {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants');
  }
  return { clientId, clientSecret };
}

function getRedirectUri() {
  // BACKEND_PUBLIC_URL doit pointer vers le backend Render (PAS le frontend).
  // L'URL doit etre EXACTEMENT enregistree dans Google Cloud Console.
  const base = process.env.BACKEND_PUBLIC_URL
    || `${process.env.FRONTEND_URL || 'http://localhost:5000'}`;
  return `${base.replace(/\/$/, '')}/api/calendar-sync/callback`;
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')[0].replace(/\/$/, '');
}

// ── GET /status ──────────────────────────────────────────────────────────
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, google_account_email, calendar_id, sync_enabled,
              last_sync_at, last_sync_error, created_at
         FROM merchant_calendar_integrations
        WHERE user_id=$1 AND provider='google'
        LIMIT 1`,
      [req.user.userId]
    );
    if (!rows.length) {
      return res.json({ connected: false });
    }
    const r = rows[0];
    res.json({
      connected: true,
      email: r.google_account_email,
      calendar_id: r.calendar_id,
      sync_enabled: r.sync_enabled,
      last_sync_at: r.last_sync_at,
      last_sync_error: r.last_sync_error,
      connected_at: r.created_at,
    });
  } catch (e) {
    console.error('[CALSYNC STATUS]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── GET /connect → URL OAuth ─────────────────────────────────────────────
router.get('/connect', authMiddleware, async (req, res) => {
  try {
    const { clientId } = getCreds();
    // State signe JWT 10min : binde la session merchant a l'OAuth callback.
    // Empeche un attaquant de connecter SON Google a un compte FlowIA via
    // un lien forge (CSRF OAuth) — sans state signe, le callback ne saurait
    // pas a quel merchant attribuer le token.
    const state = jwt.sign(
      { uid: req.user.userId, t: 'gcal_connect' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getRedirectUri(),
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',     // pour obtenir refresh_token
      prompt: 'consent',          // force le re-prompt → garantit refresh_token
      include_granted_scopes: 'true',
      state,
    });
    res.json({ url: `${GOOGLE_AUTH_URL}?${params}` });
  } catch (e) {
    console.error('[CALSYNC CONNECT]', e.message);
    res.status(500).json({ error: 'Erreur configuration Google' });
  }
});

// ── GET /callback → echange code, save tokens ────────────────────────────
// Pas de authMiddleware ici : Google redirige sans Authorization header.
// L'authentification vient du `state` JWT signe par /connect.
router.get('/callback', async (req, res) => {
  const front = getFrontendUrl();
  try {
    const { code, state, error } = req.query;
    if (error || !code) {
      return res.redirect(`${front}/reglages?gcal=error&reason=${encodeURIComponent(error || 'no_code')}`);
    }
    let payload;
    try { payload = jwt.verify(state, process.env.JWT_SECRET); }
    catch { return res.redirect(`${front}/reglages?gcal=error&reason=invalid_state`); }
    if (payload.t !== 'gcal_connect' || !payload.uid) {
      return res.redirect(`${front}/reglages?gcal=error&reason=bad_state`);
    }
    const userId = payload.uid;

    const { clientId, clientSecret } = getCreds();
    // Echange code → tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: getRedirectUri(), grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error('[CALSYNC CALLBACK] echange code echoue', tokens);
      return res.redirect(`${front}/reglages?gcal=error&reason=token_exchange`);
    }

    // Recupere l'email Google (pour affichage UI "Connecte avec X@gmail.com")
    let email = null;
    try {
      const profRes = await fetch(GOOGLE_USERINFO, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const prof = await profRes.json();
      email = prof.email || null;
    } catch {}

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
    // refresh_token n'est fourni qu'au premier consent OU avec prompt=consent.
    // On force prompt=consent dans /connect, donc on devrait l'avoir. Si pas,
    // on garde ce qu'on a (peut etre encore valide si reconnect rapide).
    const refreshEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

    await pool.query(
      `INSERT INTO merchant_calendar_integrations
         (user_id, provider, google_account_email, access_token_enc,
          refresh_token_enc, token_expires_at, calendar_id, sync_enabled)
       VALUES ($1, 'google', $2, $3, $4, $5, 'primary', TRUE)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         google_account_email = EXCLUDED.google_account_email,
         access_token_enc     = EXCLUDED.access_token_enc,
         refresh_token_enc    = COALESCE(EXCLUDED.refresh_token_enc, merchant_calendar_integrations.refresh_token_enc),
         token_expires_at     = EXCLUDED.token_expires_at,
         sync_enabled         = TRUE,
         last_sync_error      = NULL,
         updated_at           = NOW()`,
      [userId, email, encrypt(tokens.access_token), refreshEnc, expiresAt]
    );

    res.redirect(`${front}/reglages?gcal=connected`);
  } catch (e) {
    console.error('[CALSYNC CALLBACK ERR]', e.message);
    res.redirect(`${front}/reglages?gcal=error&reason=server`);
  }
});

// ── POST /disconnect ─────────────────────────────────────────────────────
router.post('/disconnect', authMiddleware, async (req, res) => {
  try {
    // Best-effort : revoke cote Google (libere l'autorisation cote utilisateur).
    // Si ca echoue (token deja revoque, network), on supprime quand meme cote DB.
    const { rows } = await pool.query(
      `SELECT access_token_enc FROM merchant_calendar_integrations
        WHERE user_id=$1 AND provider='google' LIMIT 1`,
      [req.user.userId]
    );
    if (rows.length) {
      try {
        const { decrypt } = require('../utils/tokenCrypto');
        const at = decrypt(rows[0].access_token_enc);
        await fetch(GOOGLE_REVOKE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: at }),
        });
      } catch (revErr) {
        console.warn('[CALSYNC revoke]', revErr.message);
      }
    }
    await pool.query(
      `DELETE FROM merchant_calendar_integrations
        WHERE user_id=$1 AND provider='google'`,
      [req.user.userId]
    );
    // On garde google_event_id sur les RDV existants (peut servir si le
    // merchant reconnecte le meme compte). Si reconnect avec un autre
    // compte, les events orphelins seront dans l'ancien calendrier mais
    // ne provoqueront pas d'erreur cote app (les hooks update/delete
    // verifient l'integration active avant d'agir).
    res.json({ ok: true });
  } catch (e) {
    console.error('[CALSYNC DISCONNECT]', e.message);
    res.status(500).json({ error: 'Erreur déconnexion' });
  }
});

// ── POST /toggle ─────────────────────────────────────────────────────────
// Active/desactive la sync sans supprimer la connexion (le merchant peut
// vouloir mettre en pause temporairement sans avoir a re-OAuth).
router.post('/toggle', authMiddleware, async (req, res) => {
  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) requis' });
    }
    const { rowCount } = await pool.query(
      `UPDATE merchant_calendar_integrations
          SET sync_enabled=$2, updated_at=NOW(),
              last_sync_error = CASE WHEN $2=TRUE THEN NULL ELSE last_sync_error END
        WHERE user_id=$1 AND provider='google'`,
      [req.user.userId, enabled]
    );
    if (!rowCount) return res.status(404).json({ error: 'Aucune integration trouvee' });
    res.json({ ok: true, sync_enabled: enabled });
  } catch (e) {
    console.error('[CALSYNC TOGGLE]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
