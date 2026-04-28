// utils/distributedLock.js — Lock applicatif distribué basé sur
// pg_try_advisory_lock (natif Postgres). Garantit qu'un job, cron ou worker
// ne s'exécute qu'une seule fois à un instant T, **même en multi-instance
// Render** (auto-scale, redéploiement zero-downtime). Remplace les gardes
// historiques `cluster.worker.id === 1` qui tombaient dès qu'on dépassait
// 1 process/box.
//
// Pourquoi pg_advisory_lock plutôt qu'un service Redis dédié :
//   - 100 % gratuit : utilise la base Postgres existante
//   - Aucun service supplémentaire à payer / monitorer / déployer
//   - Lock auto-libéré si la session Postgres meurt (instance qui crashe,
//     OOM, deploy)  → impossible de bloquer définitivement la prod
//   - Instantané (mémoire serveur), pas d'I/O réseau supplémentaire après
//     l'acquisition de la connexion
//
// Sémantique :
//   - tryAcquireLock(lockKey) → retourne true si obtenu, false sinon. Ne
//     bloque pas (try_advisory_lock, pas advisory_lock).
//   - releaseLock(lockKey) → libère le lock.
//   - withLock(lockKey, fn) → helper try/finally qui acquiert, exécute,
//     libère systématiquement (recommandé pour les crons).
//
// Détail technique : pg_advisory_lock est lié à la **session Postgres**.
// Pour acquire+release sur le même verrou, il faut donc utiliser la **même
// connexion**. On garde la PoolClient dans une Map<lockKey, client> entre
// l'acquisition et la libération. Si l'instance crashe avant le release,
// la session se ferme côté serveur PG et le lock se libère automatiquement.

const crypto = require('crypto');
const { pool } = require('../db');

// Map<lockKey, PoolClient> — connexions maintenues entre tryAcquireLock et
// releaseLock. Indispensable car pg_advisory_lock est session-scoped.
const heldLocks = new Map();

// Conversion string → bigint signed (range int8 Postgres). Hash SHA-256
// déterministe : la même clé donne toujours le même bigint, partout, dans
// toutes les instances. Hash + cast signed pour rester dans la range que
// pg_try_advisory_lock(bigint) accepte (-2^63..2^63-1).
function lockKeyToBigint(lockKey) {
  const buf = crypto.createHash('sha256').update(String(lockKey)).digest();
  const u   = buf.readBigUInt64BE(0);          // 0..2^64-1
  const SIGNED_MAX = 1n << 63n;
  return u >= SIGNED_MAX ? u - (1n << 64n) : u; // → -2^63..2^63-1
}

/**
 * Tente d'acquérir le verrou. Non bloquant.
 * @param {string} lockKey — identifiant du lock (ex: "cron:birthday:monthly")
 * @returns {Promise<boolean>} true si obtenu, false sinon (autre instance le tient).
 */
async function tryAcquireLock(lockKey) {
  if (heldLocks.has(lockKey)) {
    console.log(`[lock] ${lockKey} déjà détenu localement, skip`);
    return false;
  }
  let client;
  try {
    client = await pool.connect();
  } catch (e) {
    console.error(`[lock] ${lockKey} impossible d'obtenir une connexion :`, e.message);
    return false;
  }
  try {
    const big = lockKeyToBigint(lockKey).toString();
    const { rows } = await client.query(
      'SELECT pg_try_advisory_lock($1::bigint) AS got',
      [big]
    );
    if (rows[0]?.got === true) {
      heldLocks.set(lockKey, client);
      console.log(`[lock] ${lockKey} acquis`);
      return true;
    }
    client.release();
    console.log(`[lock] ${lockKey} skip (détenu par une autre instance)`);
    return false;
  } catch (e) {
    try { client.release(); } catch { /* noop */ }
    console.error(`[lock] ${lockKey} erreur acquisition :`, e.message);
    return false;
  }
}

/**
 * Libère le verrou. Idempotent : un release sur une clé non détenue logue
 * un warning mais ne lève pas.
 * @param {string} lockKey
 */
async function releaseLock(lockKey) {
  const client = heldLocks.get(lockKey);
  if (!client) {
    console.warn(`[lock] ${lockKey} release sans lock acquis (ignoré)`);
    return;
  }
  try {
    const big = lockKeyToBigint(lockKey).toString();
    await client.query('SELECT pg_advisory_unlock($1::bigint)', [big]);
    console.log(`[lock] ${lockKey} libéré`);
  } catch (e) {
    console.error(`[lock] ${lockKey} erreur release :`, e.message);
  } finally {
    heldLocks.delete(lockKey);
    try { client.release(); } catch { /* noop */ }
  }
}

/**
 * Helper : acquiert le lock, exécute fn, libère le lock systématiquement
 * (try/finally). Pattern recommandé pour les crons.
 * @param {string} lockKey
 * @param {() => Promise<any>} fn
 * @returns {Promise<{skipped: boolean, result?: any}>}
 *   - {skipped: true} si le lock n'a pas été obtenu (autre instance occupée)
 *   - {skipped: false, result} sinon
 */
async function withLock(lockKey, fn) {
  const got = await tryAcquireLock(lockKey);
  if (!got) return { skipped: true };
  try {
    const result = await fn();
    return { skipped: false, result };
  } finally {
    await releaseLock(lockKey);
  }
}

module.exports = { tryAcquireLock, releaseLock, withLock, lockKeyToBigint };
