// utils/platformSettings.js — Helper lecture/ecriture platform_settings.
//
// Cache memoire 5s : la maintenance est lue sur CHAQUE requete entrante, on
// ne peut pas se permettre un SELECT a chaque fois. TTL court (5s) permet
// que le toggle admin soit propage en quasi-temps-reel sans cost DB.
//
// Fail-open : si la DB pete, on retourne 'maintenance disabled' pour eviter
// de bloquer toute l'application a cause d'un hiccup DB. Mieux vaut un
// faux negatif court qu'un faux positif qui bloque tout le monde.

const { pool } = require('../db');

const CACHE_TTL_MS = 5000;
let cache = null;
let cacheExpiresAt = 0;

function defaultMaintenance() {
  return {
    merchant_portal:  { enabled: false, message: '' },
    booking_public:   { enabled: false, message: '' },
    merchant_signup:  { enabled: false, message: '' },
    bypass_emails:    [],
    bypass_user_ids:  [],
  };
}

// Lecture avec cache. Toujours resilient : retourne un objet defaut si DB KO.
async function getMaintenanceState() {
  const now = Date.now();
  if (cache && cacheExpiresAt > now) return cache;
  try {
    const { rows } = await pool.query(
      `SELECT value FROM platform_settings WHERE key = 'maintenance' LIMIT 1`
    );
    const v = rows[0]?.value || {};
    cache = {
      merchant_portal:  v.merchant_portal  || { enabled: false, message: '' },
      booking_public:   v.booking_public   || { enabled: false, message: '' },
      merchant_signup:  v.merchant_signup  || { enabled: false, message: '' },
      bypass_emails:    Array.isArray(v.bypass_emails)   ? v.bypass_emails   : [],
      bypass_user_ids:  Array.isArray(v.bypass_user_ids) ? v.bypass_user_ids : [],
    };
    cacheExpiresAt = now + CACHE_TTL_MS;
    return cache;
  } catch (e) {
    console.warn('[platformSettings] read fail, fail-open:', e.message);
    // Pas de cache d'erreur — on retentera au prochain hit.
    return defaultMaintenance();
  }
}

// Force-refresh du cache (apres PATCH admin).
function invalidateMaintenanceCache() {
  cache = null;
  cacheExpiresAt = 0;
}

// Verifie si un user (id ou email) est dans la whitelist bypass.
// Inputs falsy autorises (anonyme = pas de bypass).
function isBypassedUser(state, userId, email) {
  if (userId && Array.isArray(state.bypass_user_ids)
      && state.bypass_user_ids.includes(userId)) return true;
  if (email && Array.isArray(state.bypass_emails)) {
    const e = String(email).toLowerCase().trim();
    if (state.bypass_emails.map(x => String(x).toLowerCase().trim()).includes(e))
      return true;
  }
  return false;
}

module.exports = {
  getMaintenanceState,
  invalidateMaintenanceCache,
  isBypassedUser,
};
