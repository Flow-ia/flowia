const express = require('express');
const router  = express.Router();

// ─ Routes RGPD (hors /:slug)
require('./marketing')(router);

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

module.exports = router;
