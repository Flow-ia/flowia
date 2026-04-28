// scripts/test-distributed-lock.js — Test minimal du lock distribué.
// Simule 2 « instances » qui tentent simultanément d'acquérir le même
// verrou : seule la première doit réussir, la seconde doit recevoir
// `false`. Une fois la première relâchée, la seconde peut alors l'obtenir.
//
// Usage : node backend/src/scripts/test-distributed-lock.js
// Variables : DATABASE_URL (déjà chargée par le module db).
//
// Important : pg_advisory_lock est session-scoped. Pour simuler 2 instances
// distinctes dans un seul script Node, on appelle pool.connect() deux fois
// — chaque PoolClient a sa propre session Postgres → comportement identique
// à 2 process séparés tapant le même Postgres.

require('dotenv').config();
const { tryAcquireLock, releaseLock, withLock, lockKeyToBigint } = require('../utils/distributedLock');
const { pool } = require('../db');

const LOCK_KEY = 'test:distributed-lock:' + Date.now();
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else      { console.log('  ✗ ' + msg); failed++; }
}

async function main() {
  console.log('Test lock distribué — clé =', LOCK_KEY);
  console.log('  bigint dérivé =', lockKeyToBigint(LOCK_KEY).toString());
  console.log();

  // ── Test 1 : tryAcquireLock + releaseLock séquentiel ──────────────────────
  console.log('Test 1 : acquisition séquentielle');
  const got1 = await tryAcquireLock(LOCK_KEY);
  assert(got1 === true, 'tryAcquireLock retourne true (libre)');
  await releaseLock(LOCK_KEY);
  const got2 = await tryAcquireLock(LOCK_KEY);
  assert(got2 === true, 'tryAcquireLock retourne true après release');
  await releaseLock(LOCK_KEY);
  console.log();

  // ── Test 2 : double acquisition locale (même process) ─────────────────────
  // La Map heldLocks empêche un même process de prendre 2× le lock — on
  // protège la sémantique côté code Node aussi.
  console.log('Test 2 : double acquisition dans le même process');
  const a = await tryAcquireLock(LOCK_KEY);
  const b = await tryAcquireLock(LOCK_KEY);
  assert(a === true,  'première acquisition réussit');
  assert(b === false, 'deuxième acquisition échoue (déjà détenu)');
  await releaseLock(LOCK_KEY);
  console.log();

  // ── Test 3 : 2 « instances » concurrentes via 2 PoolClients distincts ────
  // Reproduit fidèlement le comportement multi-instance Render : chaque
  // PoolClient = 1 session Postgres = 1 instance virtuelle.
  console.log('Test 3 : 2 instances concurrentes (2 PoolClients)');
  const big = lockKeyToBigint(LOCK_KEY).toString();
  const clientA = await pool.connect();
  const clientB = await pool.connect();
  try {
    const r1 = await clientA.query('SELECT pg_try_advisory_lock($1::bigint) AS got', [big]);
    const r2 = await clientB.query('SELECT pg_try_advisory_lock($1::bigint) AS got', [big]);
    assert(r1.rows[0].got === true,  'instance A obtient le lock');
    assert(r2.rows[0].got === false, 'instance B se voit refuser le lock (concurrent)');

    // A libère → B doit pouvoir l'obtenir
    await clientA.query('SELECT pg_advisory_unlock($1::bigint)', [big]);
    const r3 = await clientB.query('SELECT pg_try_advisory_lock($1::bigint) AS got', [big]);
    assert(r3.rows[0].got === true, 'instance B obtient le lock après release de A');

    await clientB.query('SELECT pg_advisory_unlock($1::bigint)', [big]);
  } finally {
    clientA.release();
    clientB.release();
  }
  console.log();

  // ── Test 4 : helper withLock (skip si occupé) ──────────────────────────────
  console.log('Test 4 : withLock skip si lock déjà détenu');
  // On bloque le lock manuellement via une 2e session Postgres
  const blocker = await pool.connect();
  try {
    const big4 = lockKeyToBigint(LOCK_KEY).toString();
    await blocker.query('SELECT pg_try_advisory_lock($1::bigint)', [big4]);

    let ran = false;
    const r = await withLock(LOCK_KEY, async () => { ran = true; return 'done'; });
    assert(r.skipped === true, 'withLock retourne {skipped:true} quand le lock est pris ailleurs');
    assert(ran === false,      "le callback n'est PAS exécuté");

    await blocker.query('SELECT pg_advisory_unlock($1::bigint)', [big4]);
  } finally {
    blocker.release();
  }

  // Maintenant le lock est libre → withLock doit exécuter
  let ran2 = false;
  const r4 = await withLock(LOCK_KEY, async () => { ran2 = true; return 42; });
  assert(r4.skipped === false, 'withLock retourne {skipped:false} quand libre');
  assert(r4.result === 42,     'le résultat de fn est bien remonté');
  assert(ran2 === true,        'le callback est exécuté');
  console.log();

  // ── Bilan ──────────────────────────────────────────────────────────────────
  if (failed) {
    console.error('❌ ' + failed + ' assertion(s) échouée(s)');
    process.exit(1);
  } else {
    console.log('✅ Tous les tests passent — lock distribué OK');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('❌ Erreur test :', e.message);
  console.error(e.stack);
  process.exit(2);
});
