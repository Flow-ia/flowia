// src/middleware/employeePinOptional.js
// Lit le header x-employee-pin si présent, vérifie le JWT (scope
// 'employee_pin_session'), charge les flags can_* de l'employé et injecte
// req.employee. TOLÉRANT : absence de header → passe silencieusement (la
// route en merchant-only passe comme avant). C'est la route elle-même qui
// décide ensuite d'exiger req.employee et/ou d'enforcer les can_*.
//
// Utilisation : monter APRÈS authMiddleware (req.user.userId doit exister)
// et AVANT la logique de route.
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

async function employeePinOptional(req, res, next) {
  const pinHdr = req.headers['x-employee-pin'];
  if (!pinHdr) return next();
  try {
    const payload = jwt.verify(pinHdr, process.env.JWT_SECRET);
    if (payload.scope !== 'employee_pin_session') return next();
    if (!req.user || payload.userId !== req.user.userId) {
      // Token d'un autre merchant → ignorer plutôt que 403 (header parasite)
      return next();
    }
    const { rows } = await pool.query(
      `SELECT id, name, is_active, can_cancel, can_modify, can_encash,
              can_use_promo, can_grant_credit, can_repay_credit
         FROM employees WHERE id=$1 AND user_id=$2`,
      [payload.employeeId, req.user.userId]
    );
    if (!rows.length || !rows[0].is_active) return next();
    req.employee = rows[0];
    next();
  } catch {
    // Token expiré ou signature invalide → ignorer (route en mode merchant)
    next();
  }
}

module.exports = { employeePinOptional };
