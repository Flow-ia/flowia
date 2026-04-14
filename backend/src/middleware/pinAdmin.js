// src/middleware/pinAdmin.js
// Vérifie que la requête contient un pinSessionToken valide (admin déverrouillé)
const jwt = require('jsonwebtoken');

function pinAdminMiddleware(req, res, next) {
  const pinToken = req.headers['x-pin-session'];
  if (!pinToken) {
    return res.status(403).json({
      error: 'ACTION_ADMIN_ONLY',
      message: "Cette action nécessite l'authentification administrateur (PIN).",
    });
  }
  try {
    const payload = jwt.verify(pinToken, process.env.JWT_SECRET);
    // Vérifier que le pinSessionToken appartient bien au même userId que le JWT principal
    if (payload.scope !== 'pin_session') {
      return res.status(403).json({ error: 'ACTION_ADMIN_ONLY', message: 'Token PIN invalide.' });
    }
    if (payload.userId !== req.user.userId) {
      return res.status(403).json({ error: 'ACTION_ADMIN_ONLY', message: 'Token PIN : utilisateur incorrect.' });
    }
    req.pinAdmin = true;
    next();
  } catch {
    return res.status(403).json({
      error: 'ACTION_ADMIN_ONLY',
      message: 'Session admin expirée. Veuillez re-saisir votre PIN.',
    });
  }
}

module.exports = { pinAdminMiddleware };
