// utils/emailQueue.js — Queue d'envoi d'emails basée sur pg-boss (commit 30).
//
// Pourquoi : à l'échelle (2000+ commerçants actifs, 100k+ emails/jour),
// l'envoi synchrone à Brevo dans le request path bloque les requêtes web
// et fait grimper les latences. pg-boss permet de découpler : le code
// applicatif pousse un job, le worker traite en arrière-plan avec retry,
// backoff, et concurrence contrôlée pour ne pas saturer Brevo.
//
// 100 % gratuit : utilise la base PostgreSQL existante (Supabase) — pas
// de Redis, pas de service supplémentaire à payer/monitorer. pg-boss
// crée son propre schéma `pgboss.*` au premier démarrage (idempotent).
//
// Multi-instance Render : pg-boss utilise `FOR UPDATE SKIP LOCKED` côté
// SQL pour garantir qu'un job n'est traité qu'une fois quel que soit le
// nombre d'instances qui font tourner le worker. Compatible avec le
// cluster mode Node + plusieurs containers Render.
//
// Graceful fallback : si pg-boss n'arrive pas à démarrer (DATABASE_URL
// manquante, schema lock, etc.) ou si EMAIL_QUEUE_ENABLED=false,
// `enqueueEmail()` retombe sur l'envoi synchrone via `sendEmail()` —
// aucun email n'est perdu. Pendant la phase de migration progressive,
// les flux d'email existants peuvent rester sur sendEmail() direct ; le
// nouveau code peut adopter enqueueEmail() au choix.

let PgBoss;
try {
  PgBoss = require('pg-boss');
} catch (e) {
  // Module absent (fresh clone sans npm install) → on ne crash pas, juste
  // un warning. enqueueEmail() basculera systématiquement en sync.
  console.warn('[emailQueue] pg-boss non installé — fallback sync uniquement');
}

// Lazy require de ./email pour éviter le cycle :
// email.js require ./emailQueue (pour appeler enqueueEmail dans les
// fonctions non-critiques), et emailQueue avait besoin de sendEmail.
// Avec un getter lazy, l'import est résolu au 1er appel — email.js est
// alors complètement chargé.
let _emailMod = null;
function getEmailMod() {
  if (!_emailMod) _emailMod = require('./email');
  return _emailMod;
}

const QUEUE_NAME = 'emails';
let boss     = null;
let started  = false;
let starting = null; // promesse en cours pour éviter double-init en parallèle

function isEnabled() {
  if (!PgBoss) return false;
  if (process.env.EMAIL_QUEUE_ENABLED === 'false') return false;
  if (!process.env.DATABASE_URL) return false;
  return true;
}

// Démarre pg-boss (init schéma + connexion). Idempotent : appels concurrents
// renvoient la même promesse. Retourne le boss ou null si désactivé/échec.
async function startEmailQueue() {
  if (!isEnabled()) {
    if (PgBoss) {
      console.warn('[emailQueue] désactivé (EMAIL_QUEUE_ENABLED=false ou DATABASE_URL absent)');
    }
    return null;
  }
  if (started) return boss;
  if (starting) return starting;

  starting = (async () => {
    try {
      boss = new PgBoss({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        // Limite la concurrence DB de pg-boss : 2 connexions max (poll +
        // notify). Sur Supabase Free (60 connexions), ça laisse de la
        // marge à la pool applicative principale.
        max: 2,
        retryLimit:    3,
        retryDelay:    60,    // secondes entre retries
        retryBackoff:  true,  // doublement progressif (60s, 120s, 240s)
        expireInHours: 24,    // un job non traité après 24h est marqué expiré
      });
      boss.on('error', err => console.error('[emailQueue] boss runtime error:', err.message));
      await boss.start();
      // pg-boss v9 : pas de createQueue obligatoire, send/work crée la
      // queue à la volée. (v10+ a changé l'API, on reste sur v9 stable CJS.)
      started = true;
      console.log('[emailQueue] started OK (queue=' + QUEUE_NAME + ')');
      return boss;
    } catch (e) {
      console.error('[emailQueue] échec démarrage:', e.message);
      boss = null;
      started = false;
      return null;
    } finally {
      starting = null;
    }
  })();
  return starting;
}

// Pousse un job d'email dans la queue. Si la queue n'est pas démarrée,
// fallback synchrone immédiat (compatibilité avec les sendEmail existants).
async function enqueueEmail(payload, options = {}) {
  if (!boss || !started) {
    // Fallback sync : envoi immédiat. Conserve la même signature de retour
    // que sendEmail (généralement le response Brevo ou throw).
    return getEmailMod().sendEmail(payload);
  }
  try {
    const jobId = await boss.send(QUEUE_NAME, payload, {
      retryLimit:   options.retryLimit   ?? 3,
      retryDelay:   options.retryDelay   ?? 60,
      retryBackoff: options.retryBackoff ?? true,
      expireInHours: options.expireInHours ?? 24,
      // singletonKey permet la déduplication si fourni (idempotence)
      ...(options.singletonKey ? { singletonKey: String(options.singletonKey) } : {}),
    });
    return { ok: true, queued: true, jobId };
  } catch (e) {
    console.error('[emailQueue] enqueue échec, fallback sync:', e.message);
    return getEmailMod().sendEmail(payload);
  }
}

// Démarre le worker qui consomme la queue. À appeler après startEmailQueue.
// teamSize=5 : jusqu'à 5 jobs concurrent par instance Render. teamConcurrency
// peut être ajusté si Brevo retourne du 429. pg-boss gère lui-même la
// concurrence inter-instances via FOR UPDATE SKIP LOCKED côté SQL.
async function startEmailWorker(opts = {}) {
  if (!boss || !started) return null;
  const teamSize        = opts.teamSize        ?? 5;
  const teamConcurrency = opts.teamConcurrency ?? 1;
  // pg-boss v10+ : work() reçoit un batch de jobs (toujours un tableau).
  const sendEmail = getEmailMod().sendEmail;
  await boss.work(QUEUE_NAME, { teamSize, teamConcurrency }, async (jobs) => {
    const list = Array.isArray(jobs) ? jobs : [jobs];
    for (const job of list) {
      try {
        await sendEmail(job.data || {});
      } catch (e) {
        // Rethrow → pg-boss programme le retry selon retryLimit/Delay
        console.error('[emailQueue] envoi failed job=' + job.id + ' :', e.message);
        throw e;
      }
    }
  });
  console.log('[emailQueue] worker actif (teamSize=' + teamSize + ')');
  return true;
}

// Arrêt propre du boss (à appeler sur SIGTERM si besoin). Drain timeout 5s.
async function shutdownEmailQueue() {
  if (!boss) return;
  try { await boss.stop({ graceful: true, timeout: 5000 }); }
  catch (e) { console.error('[emailQueue] erreur shutdown:', e.message); }
  boss = null;
  started = false;
}

// Diagnostic : retourne l'état pour /api/health ou un endpoint admin.
function getQueueStatus() {
  return {
    enabled: isEnabled(),
    started,
    queueName: QUEUE_NAME,
  };
}

module.exports = {
  startEmailQueue,
  startEmailWorker,
  enqueueEmail,
  shutdownEmailQueue,
  getQueueStatus,
};
