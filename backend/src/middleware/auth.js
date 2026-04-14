// src/middleware/auth.js
const jwt = require('jsonwebtoken');

// Scopes réservés aux comptes non-commerçants
// Ces tokens ne doivent JAMAIS pouvoir accéder aux routes marchands (/api/transactions, etc.)
const NON_MERCHANT_SCOPES = new Set([
  'client',                  // client réservant chez un commerçant (scope public-booking)
  'global_client',           // compte client multi-commerces
  'pin_session',             // session PIN admin temporaire
  'pin_change_authorized',   // token de changement de PIN
  'employee_pin_session',    // session PIN employé
]);

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token manquant.' });

  try {
    const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);

    // Rejeter explicitement les tokens non-commerçants
    if (NON_MERCHANT_SCOPES.has(payload.scope)) {
      return res.status(403).json({
        error: 'Accès refusé : ce token n\'est pas autorisé pour les ressources marchands.',
      });
    }

    // Un token commerçant valide doit avoir un userId
    if (!payload.userId) {
      return res.status(401).json({ error: 'Token invalide : identifiant manquant.' });
    }

    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

module.exports = { authMiddleware };
