// src/middleware/requireFeature.js — Gating granulaire par feature merchant.
//
// Admin commit 9. Un super-admin peut desactiver une feature pour un merchant
// donne via l'admin panel : la valeur passe a `false` dans users.feature_flags
// (JSONB). Les routes API correspondantes retournent alors 403 + code
// FEATURE_BLOCKED, et le frontend merchant affiche le message standard
// "Cette fonctionnalite n'est pas accessible pour votre compte...".
//
// Semantique : flag ABSENT ou TRUE = autorise. flag === false = bloque. Le
// default '{}' garantit la retro-compat — aucun merchant existant n'est
// bloque tant qu'un admin n'a pas explicitement desactive une feature.
//
// Cache TTL 30s identique au pattern is_frozen (auth.js) : enforcement
// quasi-temps-reel apres une modification admin sans charger la DB sur
// chaque appel API.

const { pool } = require('../db');

const FEATURE_FLAGS_TTL_MS = 30_000;
const flagsCache = new Map(); // userId → { flags, expiresAt }

async function getFeatureFlags(userId) {
  const cached = flagsCache.get(userId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.flags;
  try {
    const { rows } = await pool.query(
      'SELECT feature_flags FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    const flags = rows[0]?.feature_flags || {};
    flagsCache.set(userId, { flags, expiresAt: now + FEATURE_FLAGS_TTL_MS });
    return flags;
  } catch (e) {
    console.error('[requireFeature.getFeatureFlags]', e.message);
    return cached?.flags ?? {};
  }
}

// Liste blanche des features blocables. Source de verite cote backend, sert
// aussi a peupler le selecteur cote admin frontend (GET .../features).
const FEATURES = [
  'promo',         // codes promo
  'loyalty',       // programme fidelite
  'birthday',      // campagne anniversaire
  'referrals',     // parrainage
  'campaigns',     // campagnes SMS / email
  'marketing_ai',  // marketing IA
  'export',        // exports comptables CSV/PDF
  'credits',       // credits clients (avoirs)
  'commissions',   // commissions employes
];

function requireFeature(featureName) {
  if (!FEATURES.includes(featureName)) {
    throw new Error(`requireFeature: feature inconnue '${featureName}'`);
  }
  return async function requireFeatureMw(req, res, next) {
    // Le middleware se monte APRES authMiddleware -> req.user.userId existe.
    const userId = req.user?.userId;
    if (!userId) return next();
    const flags = await getFeatureFlags(userId);
    if (flags[featureName] === false) {
      return res.status(403).json({
        error: "Cette fonctionnalite n'est pas accessible pour votre compte. Merci de contacter notre equipe pour plus de details.",
        code: 'FEATURE_BLOCKED',
        feature: featureName,
      });
    }
    next();
  };
}

module.exports = { requireFeature, FEATURES, getFeatureFlags };
