// src/middleware/pinAdmin.js
// Vérifie que la requête contient un pinSessionToken valide (admin déverrouillé).
//
// Sliding session : à chaque action admin réussie, on émet un nouveau JWT 8h
// dans le header `x-pin-session-refresh`. Tant que l'utilisateur reste actif
// en mode admin, son token est continuellement renouvelé — la modale PIN ne
// ré-apparaît qu'après 8h d'inactivité complète. Le frontend lit ce header
// dans utils/api.js#adminRequest et met à jour ff_pin_token.
const jwt = require('jsonwebtoken');

const PIN_SESSION_TTL = '8h';

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
    // Sliding session : émet un nouveau JWT pour étendre la session active.
    // L'ancien token reste valide jusqu'à sa propre expiration (pas de blacklist) ;
    // c'est volontaire (concurrent admin requests gérées sans race).
    try {
      const refreshed = jwt.sign(
        { userId: payload.userId, scope: 'pin_session' },
        process.env.JWT_SECRET,
        { expiresIn: PIN_SESSION_TTL }
      );
      res.setHeader('x-pin-session-refresh', refreshed);
    } catch { /* signature impossible — on continue avec l'ancien token, expire normalement */ }
    next();
  } catch {
    return res.status(403).json({
      error: 'ACTION_ADMIN_ONLY',
      message: 'Session admin expirée. Veuillez re-saisir votre PIN.',
    });
  }
}

module.exports = { pinAdminMiddleware };
