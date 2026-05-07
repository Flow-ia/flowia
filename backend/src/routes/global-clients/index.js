// src/routes/global-clients/index.js — Compte client global (multi-commerces)
// Décomposition du fichier historique backend/src/routes/global-clients.js
// (1273 lignes) en sous-modules par domaine logique.
//
// Ordre d'enregistrement (préserve l'ordre des routes originales) :
//   1. auth               → register, login, activate, forgot/reset-password
//   2. profile            → GET/PATCH/PUT /me, POST /change-password (LEGACY)
//   3. referral           → /me/referral-code/:slug, /me/referral-history/:slug,
//                           /pub/:slug/referral-program (route publique, sans auth)
//   4. appointments       → GET /appointments
//   5. visits             → /me/visits, /me/visits/:id
//   6. change-credentials → /me/change-email[+/confirm], /me/change-password[+/confirm]
//   7. loyalty            → GET /loyalty
//   8. account            → DELETE /me (RGPD), GET /me/export (portabilité)
//
// Chaque route applique son middleware spécifique (globalClientAuth vs
// clientOrGlobalClientAuth vs aucun) — pas de router.use(...) global.
const express = require('express');
const router  = express.Router();
const { globalClientAuth } = require('./helpers');

// ─ Auth compte global (register/login/activate/forgot/reset)
require('./auth')(router);
// ─ Profil (GET/PATCH/PUT /me + POST /change-password LEGACY)
require('./profile')(router);
// ─ Parrainage (code, historique, config publique)
require('./referral')(router);
// ─ RDV multi-commerces
require('./appointments')(router);
// ─ Passages "sur place" (transactions sans RDV)
require('./visits')(router);
// ─ Changement email/mdp avec OTP
require('./change-credentials')(router);
// ─ Fidélité multi-commerces
require('./loyalty')(router);
// ─ Cartes sauvegardees globales FlowIA (Stripe Connect Shared Customer)
require('./payment-methods')(router);
// ─ RGPD (suppression + export)
require('./account')(router);

module.exports = router;
// Backcompat : certains consommateurs externes pourraient encore importer
// globalClientAuth via require('./global-clients').globalClientAuth.
module.exports.globalClientAuth = globalClientAuth;
