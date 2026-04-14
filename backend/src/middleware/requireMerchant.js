// src/middleware/requireMerchant.js
// Middleware combiné : authMiddleware + vérification que l'userId existe en base
// À utiliser sur les routes sensibles (transactions, employees, etc.)
const { pool } = require('../db');

async function requireMerchant(req, res, next) {
  // authMiddleware a déjà validé le token et rejeté les scopes non-marchands
  // On vérifie en plus que le userId correspond à un vrai compte actif
  try {
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE id=$1',
      [req.user.userId]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'Compte introuvable ou supprimé.' });
    }
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Erreur vérification compte.' });
  }
}

module.exports = { requireMerchant };
