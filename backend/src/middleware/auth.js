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

// Cache mémoire des merchants gelés/actifs/en suppression. TTL court (30s) :
// - enforcement reste quasi-temps-réel après un gel admin OU une demande de
//   suppression (l'utilisateur est ejecte de toutes ses sessions au max +30s)
// - on ne tape pas la DB sur chaque requête API authentifiée
// Le cache est cluster-safe par worker (chaque worker a son propre cache).
const STATUS_CACHE_TTL_MS = 30_000;
const statusCache = new Map(); // userId → { isFrozen, deletionRequestedAt, expiresAt }

async function getMerchantStatus(userId) {
  const cached = statusCache.get(userId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached;
  try {
    const { rows } = await pool.query(
      'SELECT is_frozen, deletion_requested_at FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    const r = rows[0] || {};
    const status = {
      isFrozen: !!r.is_frozen,
      deletionRequestedAt: r.deletion_requested_at || null,
      expiresAt: now + STATUS_CACHE_TTL_MS,
    };
    statusCache.set(userId, status);
    return status;
  } catch (e) {
    // DB en panne : ne pas verrouiller les sessions actives. Le check précédent
    // cache reste valide ; un faux négatif court (max 30s) est préférable à un
    // faux positif qui déconnecterait toute la base merchant sur un hiccup DB.
    console.error('[auth.getMerchantStatus]', e.message);
    return cached || { isFrozen: false, deletionRequestedAt: null, expiresAt: now + STATUS_CACHE_TTL_MS };
  }
}

// Conservé pour rétro-compat avec les imports externes (admin/merchants.js etc.)
async function isMerchantFrozen(userId) {
  const s = await getMerchantStatus(userId);
  return s.isFrozen;
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

  // Enforcement gel admin (commit admin 7) ou suppression demandee.
  // Quel que soit le canal de login (formulaire, Google OAuth, session
  // ouverte avant le gel), on bloque.
  const status = await getMerchantStatus(payload.userId);
  if (status.isFrozen) {
    return res.status(403).json({
      error: 'Votre compte est bloqué. Merci de contacter notre équipe administrateurs FlowIA pour plus de détails.',
      code: 'ACCOUNT_FROZEN',
    });
  }
  if (status.deletionRequestedAt) {
    // Compte en grace 30j post-suppression. Aucune session ne doit fonctionner.
    return res.status(403).json({
      error: 'Votre compte est en cours de suppression. Pour annuler dans les 30 jours, contactez contact@flowiapro.com.',
      code: 'ACCOUNT_DELETION_PENDING',
      deletionRequestedAt: status.deletionRequestedAt,
    });
  }

  req.user = payload;
  next();
}

module.exports = { authMiddleware, isMerchantFrozen, getMerchantStatus };
