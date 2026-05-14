// routes/platform-status.js — Etat public maintenance.
// Lu par le frontend merchant + booking publique au boot pour savoir s'il
// faut afficher la page maintenance. Volontairement publique (pas d'auth)
// car les pages booking publiques sont elles-memes accessibles sans login.
//
// Ne retourne PAS les bypass_emails / bypass_user_ids (info sensible).

const express = require('express');
const { getMaintenanceState } = require('../utils/platformSettings');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const state = await getMaintenanceState();
    res.json({
      merchant_portal:  {
        enabled: !!state.merchant_portal?.enabled,
        message: state.merchant_portal?.message || '',
      },
      booking_public: {
        enabled: !!state.booking_public?.enabled,
        message: state.booking_public?.message || '',
      },
      merchant_signup: {
        enabled: !!state.merchant_signup?.enabled,
        message: state.merchant_signup?.message || '',
      },
    });
  } catch (e) {
    // Fail-open : si erreur, on dit "tout est ok" plutot que de potentiellement
    // bloquer l'affichage du front. Le middleware downstream a la meme logique
    // pour les vraies routes, donc coherent.
    res.json({
      merchant_portal:  { enabled: false, message: '' },
      booking_public:   { enabled: false, message: '' },
      merchant_signup:  { enabled: false, message: '' },
    });
  }
});

module.exports = router;
