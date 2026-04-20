// routes/global-clients.js — shim backcompat.
// Le code historique (1273 lignes) a été décomposé dans routes/global-clients/
// (helpers, auth, profile, change-credentials, referral, appointments, visits,
// loyalty, account). Cet alias évite de casser les imports externes.
module.exports = require('./global-clients/index');
