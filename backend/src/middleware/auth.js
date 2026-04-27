// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

// Scopes réservés aux comptes non-commerçants
// Ces tokens ne doivent JAMAIS pouvoir accéder aux routes marchands (/api/transactions, etc.)
const NON_MERCHANT_SCOPES = new Set([
  'client',                  // client réservant chez un commerçant (scope public-booking)
  'global_client',           // compte client multi-commerces
  'pin_session',             // session PIN admin temporaire
  'pin_change_authorized',   // token de changement de PIN
  'employee_pin_session',    // session PIN employé
]);

// Cache mémoire des merchants gelés/actifs. TTL court (30s) pour que :
// - l'enforcement reste quasi-temps-réel après un gel admin
// - on ne tape pas la DB sur chaque requête API authentifiée
// Le cache est cluster-safe par worker (1 worker en dev/Render free) ; sur
// multi-worker chaque worker a son propre cache, le décalage max reste 30s.
const FROZEN_CACHE_TTL_MS = 30_000;
const frozenCache = new Map(); // userId → { isFrozen, expiresAt }

async function isMerchantFrozen(userId) {
  const cached = frozenCache.get(userId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.isFrozen;
  try {
    const { rows } = await pool.query(
      'SELECT is_frozen FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    const isFrozen = !!(rows[0]?.is_frozen);
    frozenCache.set(userId, { isFrozen, expiresAt: now + FROZEN_CACHE_TTL_MS });
    return isFrozen;
  } catch (e) {
    // DB en panne : ne pas verrouiller les sessions actives. Le check précédent
    // cache reste valide ; un faux négatif court (max 30s) est préférable à un
    // faux positif qui déconnecterait toute la base merchant sur un hiccup DB.
    console.error('[auth.isMerchantFrozen]', e.message);
    return cached?.isFrozen ?? false;
  }
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token manquant.' });

  let payload;
  try {
    payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }

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

  // Enforcement gel admin (commit admin 7) — quel que soit le canal de login
  // (formulaire, Google OAuth, session déjà ouverte avant le gel), on bloque.
  if (await isMerchantFrozen(payload.userId)) {
    return res.status(403).json({
      error: 'Votre compte est bloqué. Merci de contacter notre équipe administrateurs FlowIA pour plus de détails.',
      code: 'ACCOUNT_FROZEN',
    });
  }

  req.user = payload;
  next();
}

module.exports = { authMiddleware, isMerchantFrozen };
