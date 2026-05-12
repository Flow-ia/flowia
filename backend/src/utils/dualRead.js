// utils/dualRead.js — phase 4 du refactor ledger.
//
// Wrapper generique pour endpoints UI qui passent progressivement de la
// lecture legacy (transactions / appointment_payouts / Stripe Balance API)
// a la lecture ledger (financial_ledger source de verite).
//
// Pour CHAQUE endpoint hooke en dual-read :
//   1. Lit toujours le legacy (= source courante = source de verite UI)
//   2. Lit aussi le ledger SI feature flag opt-in OU si compare-mode actif
//   3. Compare champ par champ les valeurs numeriques
//   4. Log warning si drift > tolerance
//   5. Choisit la source de reponse :
//        - flag OPT-IN + ledger OK => retourne ledger
//        - sinon, ou si ledger error => retourne legacy (FALLBACK auto)
//   6. Injecte _ledger_debug dans la response (admin-only via ?debug=1)
//
// Feature flags utilises (sur users.feature_flags JSONB) :
//   ledger_read_performance     — bascule /performance-stats sur ledger
//   ledger_read_payouts         — bascule /payouts
//   ledger_read_balance         — bascule /balance
//   ledger_read_historique      — bascule /historique
//   ledger_read_transactions    — bascule /transactions
//   ledger_dual_compare         — active la comparaison automatique meme
//                                 si le flag de bascule est off. Default
//                                 = true (toujours comparer pendant la
//                                 periode de validation phase 4).
//
// Semantique : key absente ou false = legacy. key === true = ledger.
// Inverse du systeme requireFeature.js existant (ou absent = autorise).
// Volontaire : on veut un opt-in explicite pour le ledger.

const { pool } = require('../db');

const LEDGER_FLAGS = [
  'ledger_read_performance',
  'ledger_read_payouts',
  'ledger_read_balance',
  'ledger_read_historique',
  'ledger_read_transactions',
];

const flagsCache = new Map(); // userId -> { flags, expiresAt }
const FLAGS_TTL_MS = 30_000;

async function getLedgerFlags(userId) {
  const cached = flagsCache.get(userId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.flags;
  try {
    const { rows } = await pool.query(
      'SELECT feature_flags FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    const flags = rows[0]?.feature_flags || {};
    flagsCache.set(userId, { flags, expiresAt: now + FLAGS_TTL_MS });
    return flags;
  } catch (e) {
    console.error('[dualRead.getLedgerFlags]', e.message);
    return cached?.flags ?? {};
  }
}

function invalidateLedgerFlags(userId) {
  flagsCache.delete(userId);
}

// Compare 2 objets par champ. Retourne {detected:bool, fields:[{name, legacy, ledger, delta}]}.
// tolerance applique uniquement aux champs numeriques. Les champs non-numeriques
// (strings, arrays) ne sont pas compares ici (le shape doit matcher).
function diffNumericFields(legacy, ledger, tolerance, fieldsToCompare) {
  if (!legacy || !ledger) return { detected: false, fields: [] };
  const drifts = [];
  const keys = fieldsToCompare || Object.keys(legacy);
  for (const k of keys) {
    const a = legacy[k];
    const b = ledger[k];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    const delta = a - b;
    if (Math.abs(delta) > tolerance) {
      drifts.push({ name: k, legacy: a, ledger: b, delta });
    }
  }
  return { detected: drifts.length > 0, fields: drifts };
}

/**
 * @param {object} opts
 *   - userId       UUID requis
 *   - label        string (pour les logs)
 *   - flagName     'ledger_read_xxx' (cle dans feature_flags)
 *   - legacyFn     async () => result legacy (jamais skippe)
 *   - ledgerFn     async () => result ledger (skippe si flag off + compare off)
 *   - tolerance    nombre de cents toleres dans la comparaison (default 0)
 *   - fields       liste de champs numeriques a comparer (default = toutes
 *                  les keys de legacy)
 *   - debugVisible bool : si true, inclure _ledger_debug dans la response.
 *                  Cote endpoint, derive de query.debug==='1' ET flag
 *                  ledger_debug_visible === true (admin-only de fait).
 *
 * @returns {Promise<object>} le resultat (shape = legacy ou ledger selon
 *                            la source choisie) + eventuellement
 *                            { _ledger_debug: { source, drift, ... } }
 */
async function dualRead({
  userId, label, flagName,
  legacyFn, ledgerFn,
  tolerance = 0, fields = null,
  debugVisible = false,
}) {
  const flags = await getLedgerFlags(userId);
  const useLedger    = flags[flagName] === true;
  const wantsCompare = flags.ledger_dual_compare !== false; // default true

  // Toujours lire le legacy en premier (= source de verite courante).
  let legacy = null;
  let legacyError = null;
  try {
    legacy = await legacyFn();
  } catch (e) {
    legacyError = e.message || String(e);
    console.error('[dualRead] legacy fail label=' + label + ' user=' + userId, legacyError);
  }

  // Lire le ledger UNIQUEMENT si on en a besoin (flag activé ou compare-mode).
  let ledger = null;
  let ledgerError = null;
  if (useLedger || wantsCompare) {
    try {
      ledger = await ledgerFn();
    } catch (e) {
      ledgerError = e.message || String(e);
      console.error('[dualRead] ledger fail label=' + label + ' user=' + userId, ledgerError);
    }
  }

  // Comparaison drift (uniquement si les 2 sont dispo).
  const drift = diffNumericFields(legacy, ledger, tolerance, fields);
  if (drift.detected) {
    console.warn('[DUAL-READ DRIFT] label=' + label + ' user=' + userId
      + ' fields=' + drift.fields.map(d => d.name + '(L=' + d.legacy + ',l=' + d.ledger + ',d=' + d.delta + ')').join(','));
  }

  // Choix de la source de reponse :
  //   - flag opt-in ET ledger OK -> retourne ledger
  //   - sinon (flag off, ledger error, ou ledger null) -> fallback legacy
  let source, result;
  if (useLedger && ledger && !ledgerError) {
    source = 'ledger';
    result = ledger;
  } else {
    source = 'legacy';
    result = legacy;
    if (useLedger && (ledgerError || !ledger)) {
      console.warn('[dualRead] FALLBACK TO LEGACY label=' + label + ' user=' + userId
        + ' reason=' + (ledgerError || 'ledger_returned_null'));
    }
  }

  // Si legacy a aussi fail, on rethrow pour que l'endpoint retourne 500.
  if (!result && legacyError) {
    const err = new Error(legacyError);
    err.code = 'DUAL_READ_LEGACY_FAIL';
    throw err;
  }

  // Injecte _ledger_debug si demande (admin-only). On retourne TOUJOURS
  // un objet propre meme si result est null (cas tres rare).
  const out = result && typeof result === 'object' && !Array.isArray(result)
    ? { ...result } : { data: result };

  if (debugVisible) {
    out._ledger_debug = {
      source,
      flag_name: flagName,
      flag_enabled: useLedger,
      compare_enabled: wantsCompare,
      drift_detected: drift.detected,
      drift_fields: drift.fields,
      legacy_value: legacy,
      ledger_value: ledger,
      legacy_error: legacyError,
      ledger_error: ledgerError,
      checked_at: new Date().toISOString(),
    };
  }

  return out;
}

/**
 * Helper utilitaire pour les endpoints : extrait le flag debug-visible.
 * Conditions admin-only : query ?debug=1 ET feature_flags.ledger_debug_visible
 * === true. Le frontend admin peut activer le flag par user pour exposer
 * le badge sur les pages financieres.
 */
async function isDebugVisible(req, userId) {
  if (!req?.query || req.query.debug !== '1') return false;
  const flags = await getLedgerFlags(userId);
  return flags.ledger_debug_visible === true;
}

module.exports = {
  dualRead,
  getLedgerFlags,
  invalidateLedgerFlags,
  isDebugVisible,
  LEDGER_FLAGS,
};
