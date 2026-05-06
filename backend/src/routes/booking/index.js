// src/routes/booking/index.js — Routes commerçant (authentifiées)
// Décomposition du fichier historique backend/src/routes/booking.js (1337 lignes)
// en sous-modules par domaine logique. Ordre d'enregistrement strict :
//   1. Route publique /check-slug (AVANT authMiddleware)
//   2. Middlewares auth (authMiddleware + employeePinOptional)
//   3. Toutes les autres routes (domaines)
const express = require('express');
const { authMiddleware } = require('../../middleware/auth');
const { employeePinOptional } = require('../../middleware/employeePinOptional');

const router = express.Router();

// ══════════════════════════════════════════════════════════
// ROUTE PUBLIQUE — vérification slug (AVANT authMiddleware)
// Utilisée aussi bien par l'admin connecté que sans auth
// ══════════════════════════════════════════════════════════
require('./slug')(router);

// ══════════════════════════════════════════════════════════
// Toutes les routes suivantes sont protégées par auth JWT
// ══════════════════════════════════════════════════════════
router.use(authMiddleware);
// Injecte req.employee si header x-employee-pin présent (flags can_*)
router.use(employeePinOptional);

// ─ Paramètres réservation + horaires d'ouverture
require('./settings')(router);
// ─ Edition de la partie nom du slug (nom-ville-CP) + check disponibilite
require('./slug-name')(router);
// ─ Services CRUD
require('./services')(router);
// ─ Rendez-vous (vue commerçant)
require('./appointments')(router);
// ─ Clients
require('./clients')(router);
// ─ Disponibilités employé (ponctuelles)
require('./availability')(router);
// ─ Horaires par employé
require('./employee-hours')(router);
// ─ Agenda employé (GET + POST + PUT manuels)
require('./employee-agenda')(router);
// ─ Permissions employé
require('./employee-permissions')(router);
// ─ Encaissement RDV (checkout)
require('./checkout')(router);
// ─ Pauses commerçant
require('./breaks')(router);
// ─ Plages horaires multiples par employé
require('./employee-slots')(router);
// ─ Annonce / bandeau page de réservation publique
require('./announcement')(router);

module.exports = router;
