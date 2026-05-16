const express = require('express');
const { pool } = require('../../db');
const router  = express.Router();

// ─ Routes RGPD (hors /:slug) — montées AVANT le gate "frozen" pour rester
//   accessibles même quand le commerce est gelé (CNIL : la désinscription
//   marketing doit toujours fonctionner).
require('./marketing')(router);

// ─ Formulaire de contact public (site marketing flowiapro.com/contact).
//   Doit etre monte AVANT le gate /:slug : 'contact' n'est pas un slug
//   commercant.
require('./contact')(router);

// ─ Marketplace : recherche publique de commercants (page /recherche).
//   Doit etre monte AVANT le gate /:slug : 'marketplace' n'est pas un slug.
require('./marketplace')(router);

// ─ Endpoint dedie : resolution slug -> { slug, redirected, oldSlug }.
//   Utilise par le frontend pour mettre a jour l'URL (history.replaceState)
//   quand un visiteur arrive avec un ancien slug archive.
//   Monte AVANT le gate frozen pour pouvoir resoudre meme un compte gele
//   (le frontend affichera le statut une fois redirige).
router.get('/resolve/:slug', async (req, res) => {
  try {
    const { rows: live } = await pool.query(
      'SELECT slug FROM booking_settings WHERE slug=$1 LIMIT 1',
      [req.params.slug]
    );
    if (live.length) {
      return res.json({ slug: live[0].slug, redirected: false });
    }
    const { rows: alias } = await pool.query(
      `SELECT bs.slug AS new_slug
         FROM booking_slug_aliases a
         JOIN booking_settings bs ON bs.user_id = a.user_id
        WHERE a.old_slug = $1
        LIMIT 1`,
      [req.params.slug]
    );
    if (alias.length) {
      return res.json({
        slug: alias[0].new_slug,
        redirected: true,
        oldSlug: req.params.slug,
      });
    }
    return res.status(404).json({ error: 'Commerce introuvable.' });
  } catch (e) {
    console.error('[PUB RESOLVE]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─ Middleware de resolution d'alias : si /:slug n'existe pas dans
//   booking_settings, on tente une resolution via booking_slug_aliases et
//   on REECRIT req.params.slug -> nouveau slug. Toutes les routes en aval
//   marchent ainsi de maniere transparente, sans avoir a etre modifiees.
//   Necessaire pour ne pas casser :
//     - QR codes imprimes pointant sur l'ancien slug
//     - Liens partages par SMS marketing avant changement
//     - state=oldSlug du callback OAuth Google client
//     - bookmarks navigateur des clients
router.use('/:slug', async (req, res, next) => {
  try {
    const candidate = req.params.slug;
    const { rows } = await pool.query(
      'SELECT 1 FROM booking_settings WHERE slug=$1 LIMIT 1', [candidate]
    );
    if (rows.length) return next();
    const { rows: alias } = await pool.query(
      `SELECT bs.slug AS new_slug
         FROM booking_slug_aliases a
         JOIN booking_settings bs ON bs.user_id = a.user_id
        WHERE a.old_slug = $1
        LIMIT 1`,
      [candidate]
    );
    if (alias.length) {
      // Reecriture transparente du parametre. Les handlers en aval voient
      // directement le nouveau slug, donc lookup direct dans booking_settings.
      req.params.slug = alias[0].new_slug;
      // En-tete informative pour debug client / monitoring.
      res.set('X-Slug-Redirected-From', candidate);
    }
  } catch { /* fail open : laisse le 404 normal s'appliquer en aval */ }
  return next();
});

// ─ Gate "merchant gelé par admin" (commit #3 admin) — toute route /:slug est
//   bloquée si le commerçant est gelé. La désinscription marketing reste OK
//   car elle est montée juste au-dessus.
router.use('/:slug', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.is_frozen, u.deletion_requested_at
         FROM users u
         INNER JOIN booking_settings bs ON bs.user_id = u.id
        WHERE bs.slug = $1
        LIMIT 1`,
      [req.params.slug]
    );
    if (rows.length && (rows[0].is_frozen || rows[0].deletion_requested_at)) {
      return res.status(403).json({ error: 'Cet etablissement est temporairement indisponible.' });
    }
  } catch { /* fail open : si la DB plante, ne pas casser le booking public */ }
  return next();
});

// ─ Infos commerce (GET /:slug, /services, /employees, /slots, /closed-days, /month-status, /referral/:code)
require('./merchant-info')(router);

// ─ Réservation (POST /:slug/book)
require('./book')(router);

// ─ Paiement Stripe Connect (Phase 5/5) — POST /:slug/booking/payment-intent
require('./payment')(router);

// ─ Auth client (check-email, register, quick-register, login, Google OAuth redirect)
require('./client-auth')(router);

// ─ Profil client (appointments, cancel, profile update, delete account)
require('./client-profile')(router);

// ─ Promo (GET /:slug/promo/check, POST /:slug/check-promo)
require('./promo')(router);

// ─ Google Places rating
require('./google-rating')(router);

// ─ Annonce / bandeau commercant
require('./announcement')(router);

module.exports = router;
