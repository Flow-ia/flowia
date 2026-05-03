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

// ─ Gate "merchant gelé par admin" (commit #3 admin) — toute route /:slug est
//   bloquée si le commerçant est gelé. La désinscription marketing reste OK
//   car elle est montée juste au-dessus.
router.use('/:slug', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.is_frozen
         FROM users u
         INNER JOIN booking_settings bs ON bs.user_id = u.id
        WHERE bs.slug = $1
        LIMIT 1`,
      [req.params.slug]
    );
    if (rows.length && rows[0].is_frozen) {
      return res.status(403).json({ error: 'Cet etablissement est temporairement indisponible.' });
    }
  } catch { /* fail open : si la DB plante, ne pas casser le booking public */ }
  return next();
});

// ─ Infos commerce (GET /:slug, /services, /employees, /slots, /closed-days, /month-status, /referral/:code)
require('./merchant-info')(router);

// ─ Réservation (POST /:slug/book)
require('./book')(router);

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
