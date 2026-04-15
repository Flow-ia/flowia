// src/middleware/employee.js
// Middleware pour les routes accessibles aux employés authentifiés
const jwt = require('jsonwebtoken');

const EMPLOYEE_SCOPES = new Set(['employee_pin_session']);

function employeeMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token manquant.' });

  try {
    const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);

    // Accepter token commerçant (userId sans scope) OU token employé PIN
    const isEmployee = EMPLOYEE_SCOPES.has(payload.scope) && payload.employeeId;
    const isMerchant = !payload.scope && payload.userId;

    if (!isEmployee && !isMerchant) {
      return res.status(403).json({ error: 'Accès refusé.' });
    }

    req.user     = payload;
    req.isEmployee = isEmployee;
    req.isMerchant = isMerchant;
    // Pour les employés, userId vient du token employé
    if (isEmployee) req.user.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

module.exports = { employeeMiddleware };