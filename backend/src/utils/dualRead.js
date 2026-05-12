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

// ── METRIQUES IN-MEMORY ──────────────────────────────────────────────────
// Compteurs reset au boot (= par deploy Render). Exposes via admin endpoint
// GET /api/admin/ledger-metrics. Egalement loggues en stdout JSON structure
// (prefix [LEDGER_METRIC]) pour Render Logs grep-friendly.
const metrics = {
  started_at: new Date().toISOString(),
  // Map key = `${label}|${userId}` -> count
  drift:       new Map(),
  fallback:    new Map(),
  ledger_error: new Map(),
  legacy_error: new Map(),
  // Compteurs globaux par label
  by_label:    new Map(),  // key=label -> { calls, drift, fallback, errors }
};

function bumpCounter(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}
function bumpLabel(label, field) {
  const cur = metrics.by_label.get(label) || { calls: 0, drift: 0, fallback: 0, ledger_errors: 0, legacy_errors: 0 };
  cur[field] = (cur[field] || 0) + 1;
  metrics.by_label.set(label, cur);
}

function logMetric(type, payload) {
  // Format JSON structure une ligne pour grep facile.
  // Exemple : [LEDGER_METRIC] {"type":"drift","label":"...","user_id":"...","ts":"..."}
  try {
    console.log('[LEDGER_METRIC] ' + JSON.stringify({
      type, ts: new Date().toISOString(), ...payload,
    }));
  } catch {
    // si JSON.stringify fail (rare), tomber sur un log brut
    console.log('[LEDGER_METRIC] type=' + type + ' label=' + (payload?.label || '-'));
  }
}

function getMetricsSnapshot() {
  const mapToObj = (m) => {
    const out = {};
    for (const [k, v] of m.entries()) out[k] = v;
    return out;
  };
  return {
    started_at: metrics.started_at,
    snapshot_at: new Date().toISOString(),
    by_label:     mapToObj(metrics.by_label),
    drift_top:    topN(metrics.drift, 20),
    fallback_top: topN(metrics.fallback, 20),
    ledger_errors_top: topN(metrics.ledger_error, 20),
    legacy_errors_top: topN(metrics.legacy_error, 20),
    totals: {
      drift:        sumMap(metrics.drift),
      fallback:     sumMap(metrics.fallback),
      ledger_error: sumMap(metrics.ledger_error),
      legacy_error: sumMap(metrics.legacy_error),
    },
  };
}
function topN(map, n) {
  const arr = Array.from(map.entries())
    .map(([key, count]) => {
      const [label, user_id] = key.split('|');
      return { label, user_id, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
  return arr;
}
function sumMap(m) {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}
function resetMetrics() {
  metrics.started_at = new Date().toISOString();
  metrics.drift.clear();
  metrics.fallback.clear();
  metrics.ledger_error.clear();
  metrics.legacy_error.clear();
  metrics.by_label.clear();
}

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
// fields supporte les paths dotted (ex: 'summary.pending_cents') pour comparer
// des champs imbriques.
function getPath(obj, path) {
  if (obj == null) return undefined;
  if (!path.includes('.')) return obj[path];
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function diffNumericFields(legacy, ledger, tolerance, fieldsToCompare) {
  if (!legacy || !ledger) return { detected: false, fields: [] };
  const drifts = [];
  const keys = fieldsToCompare || Object.keys(legacy);
  for (const k of keys) {
    const a = getPath(legacy, k);
    const b = getPath(ledger, k);
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

  bumpLabel(label, 'calls');
  const counterKey = `${label}|${userId}`;

  // Toujours lire le legacy en premier (= source de verite courante).
  let legacy = null;
  let legacyError = null;
  try {
    legacy = await legacyFn();
  } catch (e) {
    legacyError = e.message || String(e);
    bumpCounter(metrics.legacy_error, counterKey);
    bumpLabel(label, 'legacy_errors');
    logMetric('legacy_error', { label, user_id: userId, error: legacyError });
  }

  // Lire le ledger UNIQUEMENT si on en a besoin (flag activé ou compare-mode).
  let ledger = null;
  let ledgerError = null;
  if (useLedger || wantsCompare) {
    try {
      ledger = await ledgerFn();
    } catch (e) {
      ledgerError = e.message || String(e);
      bumpCounter(metrics.ledger_error, counterKey);
      bumpLabel(label, 'ledger_errors');
      logMetric('ledger_error', { label, user_id: userId, error: ledgerError });
    }
  }

  // Comparaison drift (uniquement si les 2 sont dispo).
  const drift = diffNumericFields(legacy, ledger, tolerance, fields);
  if (drift.detected) {
    bumpCounter(metrics.drift, counterKey);
    bumpLabel(label, 'drift');
    logMetric('drift', {
      label, user_id: userId,
      fields: drift.fields.map(f => ({ name: f.name, legacy: f.legacy, ledger: f.ledger, delta: f.delta })),
    });
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
      bumpCounter(metrics.fallback, counterKey);
      bumpLabel(label, 'fallback');
      logMetric('fallback', {
        label, user_id: userId,
        reason: ledgerError || 'ledger_returned_null',
      });
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
  getMetricsSnapshot,
  resetMetrics,
};
