// ─ GOOD GOOD git

require('dotenv').config();
const cluster = require('cluster');
const os      = require('os');

// ── Cluster mode : 1 worker par CPU ──────────────────────────────────────────
const NUM_WORKERS = parseInt(process.env.WEB_CONCURRENCY) || os.cpus().length;

if (cluster.isPrimary && process.env.NODE_ENV === 'production') {
  console.log(`🚀 FlowIA Primary ${process.pid} — spawning ${NUM_WORKERS} workers`);
  for (let i = 0; i < NUM_WORKERS; i++) cluster.fork();
  cluster.on('exit', (worker, code) => {
    console.warn(`Worker ${worker.process.pid} mort (code ${code}) — relance`);
    cluster.fork();
  });
} else {
  startServer();
}

function startServer() {
  const express    = require('express');
  const cors       = require('cors');
  const path       = require('path');
  const rateLimit  = require('express-rate-limit');
  const compression = require('compression');
  const { initDB } = require('./db');

  const app = express();

  // ── Trust proxy (Render, Vercel, Nginx) ──────────────────────────────────
  app.set('trust proxy', 1);

  // ── Compression gzip/brotli — réduit la bande passante de 60-80% ──────────
  app.use(compression({
    level: 6,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  }));

  // ── Headers de sécurité ──────────────────────────────────────────────────
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options',  'nosniff');
    res.setHeader('X-Frame-Options',         'DENY');
    res.setHeader('X-XSS-Protection',        '1; mode=block');
    res.setHeader('Referrer-Policy',         'strict-origin-when-cross-origin');
    next();
  });

  // ── Cache in-memory léger (sans Redis) ───────────────────────────────────
  // Map { key → { data, expiresAt } }
  const memCache = new Map();
  const CACHE_MAX = 500; // entrées max

  function cacheGet(key) {
    const entry = memCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { memCache.delete(key); return null; }
    return entry.data;
  }
  function cacheSet(key, data, ttlMs) {
    if (memCache.size >= CACHE_MAX) {
      // Supprimer les 10% les plus anciens
      const keys = [...memCache.keys()].slice(0, Math.floor(CACHE_MAX * 0.1));
      keys.forEach(k => memCache.delete(k));
    }
    memCache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }
  function cacheDel(pattern) {
    for (const key of memCache.keys()) {
      if (key.includes(pattern)) memCache.delete(key);
    }
  }
  // Exposer globalement pour les routes
  global.memCache = { get: cacheGet, set: cacheSet, del: cacheDel };

  // ── CORS ─────────────────────────────────────────────────────────────────
  // Accepte plusieurs origines — FRONTEND_URL peut être une liste séparée par virgule
  // Pour chaque domaine de base (ex: haircoifflille.fr), on accepte aussi
  // automatiquement les sous-domaines `www.*` et `commercant.*`
  const rawOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',').map(o => o.trim()).filter(Boolean);
  const allowedOrigins = new Set();
  for (const o of rawOrigins) {
    allowedOrigins.add(o);
    try {
      const u = new URL(o);
      const host = u.hostname;
      // Si c'est un domaine principal (pas déjà un sous-domaine www/commercant),
      // ajouter automatiquement les variantes www. et commercant.
      if (!host.startsWith('www.') && !host.startsWith('commercant.')) {
        allowedOrigins.add(`${u.protocol}//www.${host}`);
        allowedOrigins.add(`${u.protocol}//commercant.${host}`);
      }
    } catch { /* origine non-URL (ex: localhost:3000) — ignorer */ }
  }
  // Commit 28 — autoriser les preview Vercel du projet (URLs uniques par
  // commit/branche, ne peuvent pas être whitelistées exactement).
  // Le pattern est strict : doit commencer par `flowia` ou `flowia-git-` et
  // finir par `.vercel.app`. Optionnellement étendable via VERCEL_PREVIEW_REGEX.
  const previewRegex = (() => {
    const env = (process.env.VERCEL_PREVIEW_REGEX || '').trim();
    if (env) {
      try { return new RegExp(env); } catch { /* pattern invalide → fallback */ }
    }
    return /^https:\/\/flowia(-[a-z0-9-]+)?\.vercel\.app$/i;
  })();
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      if (previewRegex.test(origin)) return callback(null, true);
      callback(new Error('CORS not allowed: ' + origin));
    },
    credentials: true,
  }));

  // Audit Y : security headers. Le backend sert du JSON uniquement (pas de
  // HTML), CSP détaillée dans `frontend/vercel.json`. Ici on applique les
  // headers transverses utiles même sur API :
  // - nosniff : empêche le navigateur de "deviner" le type de contenu
  // - X-Frame-Options: DENY → anti-clickjacking pour les éventuelles pages
  //   d'erreur HTML (rare mais défensif)
  // - HSTS : force HTTPS sur les sous-domaines (1 an)
  // - Referrer-Policy : ne leak pas l'URL complète aux services tiers
  // - Permissions-Policy : coupe les API sensibles par défaut
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), usb=(), autoplay=()');
    next();
  });
  // Webhook Stripe doit recevoir le raw body AVANT express.json()
  app.use('/api/payments/sms/webhook', express.raw({ type: 'application/json' }));

  app.use(express.json({ limit: '2mb' }));

  // ── Rate limiting ────────────────────────────────────────────────────────
  // Auth général (forgot, pin, etc.)
  const authLimiter = rateLimit({
    windowMs: 2 * 60 * 1000, max: 20,
    message: { error: 'Trop de tentatives, réessayez dans 2 minutes.' },
    standardHeaders: true, legacyHeaders: false,
  });
  // Register : 5 inscriptions max par IP par 10 minutes (anti-spam)
  const registerLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, max: 5,
    message: { error: 'Trop de tentatives d\'inscription, réessayez dans 10 minutes.' },
    standardHeaders: true, legacyHeaders: false,
  });
  // Login : 10 tentatives par IP par 5 minutes (anti-brute force)
  const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, max: 10,
    message: { error: 'Trop de tentatives de connexion, réessayez dans 5 minutes.' },
    standardHeaders: true, legacyHeaders: false,
  });
  // Notifications : moins fréquent
  const notifLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, max: 60,
    message: { error: 'Trop de requêtes.' },
    standardHeaders: true, legacyHeaders: false,
  });
  // Stats : cache fort, limite basse
  const statsLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, max: 60,
    message: { error: 'Trop de requêtes stats.' },
    standardHeaders: true, legacyHeaders: false,
  });
  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, max: 300,
    message: { error: 'Trop de requêtes, ralentissez.' },
    standardHeaders: true, legacyHeaders: false,
  });
  const pubLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, max: 600,
    message: { error: 'Trop de requêtes.' },
    standardHeaders: true, legacyHeaders: false,
  });
  // Audit R (session 29) : quick-register via QR est public et crée une
  // fiche à chaque hit (idempotent sur phone, mais un bot peut varier le
  // numéro). Cap IP strict. 30 / 15 min couvre un salon bondé (5 clients/h)
  // tout en bloquant un bot type 10 req/s (=> 600/15min -> 20× le cap).
  const quickRegisterLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 30,
    message: { error: 'Trop d\'inscriptions depuis cette connexion. Réessayez dans 15 minutes.' },
    standardHeaders: true, legacyHeaders: false,
  });
  // J8 : limite dédiée sur les endpoints de création de paiement Stripe
  // (évite qu'un attaquant spamme /sms/intent pour créer 300 PaymentIntents/
  // min et épuiser l'API Stripe ou polluer le dashboard).
  // 15 intents/checkouts par 15 min par IP → largement suffisant pour un
  // commerçant normal, très restrictif pour un bot.
  const paymentsIntentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 15,
    message: { error: 'Trop de tentatives de recharge. Réessayez dans quelques minutes.' },
    standardHeaders: true, legacyHeaders: false,
  });
  // RGPD commit 19 : finalisation OAuth Google différée. Le pre_token JWT
  // expire à 10 min, donc 10 tentatives / 5 min suffit largement à un usage
  // normal et bloque un attaquant qui aurait volé un pre_token (timing court
  // + cap strict évite le brute-force des champs body).
  const oauthFinalizeLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, max: 10,
    message: { error: 'Trop de tentatives de finalisation. Réessayez dans quelques minutes.' },
    standardHeaders: true, legacyHeaders: false,
  });
  // AUDIT perms commit B : anti-brute-force sur /employee-pins/:id/verify.
  // PIN 4 chiffres = 10000 combinaisons. 5 tentatives / 5 min / IP + lockout
  // DB-level par employeeId (30 min apres 5 echecs). Empeche le crack local
  // ET distribue (lockout partage entre IPs).
  const employeePinVerifyLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, max: 5,
    message: { error: 'Trop de tentatives de PIN. Patientez 5 minutes.' },
    standardHeaders: true, legacyHeaders: false,
  });
  // Commit 24c : force-run du cron anniversaire (POST /api/birthday-campaign/
  // test-run). Endpoint protégé par PIN admin mais déclenche un envoi en
  // masse d'emails (gated par anti-doublon annuel et quota Brevo 300/j).
  // Cap strict 1/h/IP : suffit pour smoke-test légitime, bloque accident +
  // PIN admin compromis.
  const birthdayTestRunLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 1,
    message: { error: 'Test cron anniversaire déjà déclenché. Réessayez dans 1 heure.' },
    standardHeaders: true, legacyHeaders: false,
  });

  // ── Routes ───────────────────────────────────────────────────────────────
  // Routes auth avec limiters spécifiques par endpoint
  const authRouter = require('./routes/auth');
  app.use('/api/auth/register', registerLimiter);
  app.use('/api/auth/login',    loginLimiter);
  app.use('/api/auth',          authLimiter, authRouter);
  // Cap dédié AVANT le pubLimiter général (express évalue dans l'ordre).
  // Matche sur le path — /pub/:slug/client/quick-register en POST.
  app.use('/api/pub/:slug/client/quick-register', quickRegisterLimiter);
  // RGPD commit 19 : finalisation OAuth Google (création différée).
  app.use('/api/pub/:slug/oauth-google/finalize', oauthFinalizeLimiter);
  app.use('/api/pub',            pubLimiter,  require('./routes/public-booking'));
  app.use('/api/categories',     apiLimiter,  require('./routes/categories'));
  app.use('/api/employees',      apiLimiter,  require('./routes/employees'));
  app.use('/api/transactions',   apiLimiter,  require('./routes/transactions'));
  app.use('/api/booking/service-categories', apiLimiter, require('./routes/booking-service-categories'));
  app.use('/api/media',          apiLimiter,  require('./routes/media'));
  app.use('/api/booking',        apiLimiter,  require('./routes/booking'));
  app.use('/api/stats',          statsLimiter, require('./routes/stats'));
  app.use('/api/absences',       apiLimiter,  require('./routes/absences'));
  app.use('/api/commissions',    apiLimiter,  require('./routes/commissions'));
  app.use('/api/loyalty',        apiLimiter,  require('./routes/loyalty').router);
  app.use('/api/promo',          apiLimiter,  require('./routes/promo'));
  app.use('/api/client-notes',   apiLimiter,  require('./routes/client-notes'));
  app.use('/api/clients',        apiLimiter,  require('./routes/clients'));
  // Audit U : rate limiters dédiés sur les endpoints sensibles global-clients.
  // L'apiLimiter général (300/min) permettait 300 tentatives OTP/min — trop
  // laxe pour un OTP 6-digits (10^6). Avec 3/10min, bruteforce = 3000 ans.
  app.use('/api/global-clients/register',        registerLimiter);
  app.use('/api/global-clients/login',           loginLimiter);
  app.use('/api/global-clients/forgot-password', registerLimiter);
  app.use('/api/global-clients/reset-password',  registerLimiter);
  app.use('/api/global-clients/me/change-email', registerLimiter);
  app.use('/api/global-clients/me/change-password', registerLimiter);
  app.use('/api/global-clients', apiLimiter,  require('./routes/global-clients'));
  app.use('/api/export',         apiLimiter,  require('./routes/export'));
  app.use('/api/credits',        apiLimiter,  require('./routes/credits'));
  app.use('/api/employee-pins',  apiLimiter,  require('./routes/employee-pins'));
  app.use('/api/campaigns',     apiLimiter,  require('./routes/campaigns'));
  app.use('/api/marketing',     apiLimiter,  require('./routes/marketing'));
  // Commit 24c : limiter dédié AVANT apiLimiter sur /test-run uniquement
  // (1 appel / heure / IP). Express évalue les middlewares dans l'ordre.
  app.use('/api/birthday-campaign/test-run', birthdayTestRunLimiter);
  app.use('/api/birthday-campaign', apiLimiter, require('./routes/birthday'));
  app.use('/api/referrals',     apiLimiter,  require('./routes/referrals'));
  // Limite spécifique sur les endpoints de création d'intent/checkout AVANT
  // le apiLimiter général (express évalue dans l'ordre). Les autres routes
  // /api/payments/* gardent le apiLimiter standard.
  app.use('/api/payments/sms/intent',   paymentsIntentLimiter);
  app.use('/api/payments/sms/checkout', paymentsIntentLimiter);
  // AUDIT perms : rate limit specifique brute-force PIN employe. Monte
  // AVANT employee-pins apiLimiter pour intercepter. Route pattern matche
  // /employee-pins/<uuid>/verify (methode POST verifiee dans le handler).
  app.use(/^\/api\/employee-pins\/[^/]+\/verify$/, employeePinVerifyLimiter);
  app.use('/api/payments',      apiLimiter,  require('./routes/payments'));

  const { router: notifRouter, runDailyRecaps, runRdvReminders, runEmployeeReminders } =
    require('./routes/notifications');
  app.use('/api/notifications',  notifLimiter, notifRouter);

  // Refonte FDS-2026 commit 2 : préférences compte (mode tablette, etc.).
  app.use('/api/user-settings',  apiLimiter,  require('./routes/user-settings'));

  // ── Health ───────────────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, pid: process.pid, uptime: process.uptime(), time: new Date() });
  });

  // ── Route de test email — À SUPPRIMER APRÈS TEST ─────────────────────────
  app.get('/api/test-email', async (req, res) => {
    try {
      const { sendEmail } = require('./utils/email');
      await sendEmail({
        to: 'gacinoufel@gmail.com',
        subject: 'Test email FlowIA',
        html: '<p>Test email depuis FlowIA backend</p>'
      });
      res.json({ ok: true, message: 'Email envoyé' });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Métriques cache + stats détaillées ─────────────────────────────────
  app.get('/api/health/cache', (req, res) => {
    const now = Date.now();
    let expired = 0, active = 0;
    for (const [, v] of memCache) {
      if (now > v.expiresAt) expired++; else active++;
    }
    res.json({ total: memCache.size, active, expired, max: CACHE_MAX,
      fill_pct: Math.round(memCache.size / CACHE_MAX * 100) });
  });

  // ── Purge manuelle du cache (admin seulement) ─────────────────────────────
  app.delete('/api/health/cache', (req, res) => {
    const before = memCache.size;
    memCache.clear();
    res.json({ ok: true, cleared: before });
  });

  // ── SPA fallback ─────────────────────────────────────────────────────────
  const distPath = path.resolve(__dirname, '../../frontend/dist');
  const indexHtml = path.join(distPath, 'index.html');
  app.use(express.static(distPath, {
    index: false,
    maxAge: '1d',           // cache navigateur pour assets statiques
    etag: true,
    lastModified: true,
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(indexHtml, { root: '/' }, err => { if (err) next(); });
  });

  // ── Error handler JSON pour /api ─────────────────────────────────────────
  // Sans ce middleware, une erreur passée à next(err) (ex: multer qui
  // rejette un type MIME ou une taille, body-parser qui refuse un JSON
  // malformé) tombait dans le handler par défaut d'Express → réponse HTML
  // "<!DOCTYPE…". Côté frontend, `await res.json()` plantait sur
  // "Unexpected token '<'". On renvoie maintenant toujours un JSON sur
  // /api pour que le client puisse parser proprement le message.
  app.use((err, req, res, next) => {
    if (!req.path.startsWith('/api/')) return next(err);
    const status = err.status || err.statusCode
      || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
    console.error('[API-ERR]', req.method, req.path, status, err.code || '', err.message);
    if (res.headersSent) return;
    res.status(status).json({ error: err.message || 'Erreur serveur.' });
  });

  // ── Protection Brevo gratuit — compteur global emails ────────────────────
  // J3 : remplacé par un compteur DB-backed (table email_global_daily) pour
  // être cluster-safe. Les helpers getGlobalEmailCount / incrGlobalEmailCount
  // / incrUserEmailCount gèrent l'upsert atomique + reset implicite (nouvelle
  // ligne par date = reset automatique à minuit sans setInterval).

  // ── Cron — uniquement sur le worker 1 pour éviter les doublons ───────────
  const { sendEmail, getGlobalEmailCount, incrGlobalEmailCount, incrUserEmailCount } = require('./utils/email');
  const { pool: dbPool } = require('./db');
  const { sleep: cronSleep } = require('./utils/messenger');

  // Traitement file d'attente campagnes email (toutes les heures, 8h-20h)
  // Commit 26b — JOIN client_accounts + users pour récupérer unsubscribe_token,
  // business_name, business_email afin d'injecter le footer marketing 1-clic
  // RGPD-conforme dans chaque envoi différé. Sans ce footer, les emails de
  // queue partent sans mécanisme de désinscription = non conforme.
  const { marketingFooterHtml, unsubscribeHeaders } = require('./utils/unsubscribe');
  async function processCampaignQueue() {
    const hour = new Date().getHours();
    if (hour < 8 || hour > 20) return;
    try {
      const { rows } = await dbPool.query(`
        SELECT q.*,
               ca.unsubscribe_token AS ca_unsubscribe_token,
               u.business_name      AS biz_name,
               u.email              AS biz_email
          FROM campaign_queue q
          LEFT JOIN client_accounts ca
                 ON ca.user_id = q.user_id
                AND LOWER(ca.email) = LOWER(q.client_email)
          LEFT JOIN users u ON u.id = q.user_id
        WHERE q.status='pending' AND q.scheduled_date <= CURRENT_DATE
          AND q.channel = 'email'
        ORDER BY q.created_at ASC
        LIMIT 30
        FOR UPDATE SKIP LOCKED
      `);
      if (!rows.length) return;
      for (const item of rows) {
        try {
          const already = await getGlobalEmailCount();
          if (already >= 300) {
            console.log('[CRON queue] Limite email marketing atteinte, arret');
            break;
          }
          const footer = marketingFooterHtml({
            token: item.ca_unsubscribe_token,
            businessName: item.biz_name,
            businessEmail: item.biz_email,
            context: 'campaignQueue',
          });
          const headers = unsubscribeHeaders({
            token: item.ca_unsubscribe_token,
            businessEmail: item.biz_email,
            refId: item.campaign_id || item.id,
          });
          // Inject footer juste avant </body> si présent, sinon append.
          const html = /<\/body>/i.test(item.message)
            ? item.message.replace(/<\/body>/i, `${footer}</body>`)
            : `${item.message}${footer}`;
          await sendEmail({
            to: item.client_email,
            subject: 'Offre speciale de votre commerce',
            html,
            headers,
          });
          await dbPool.query(`UPDATE campaign_queue SET status='sent', sent_at=NOW() WHERE id=$1`, [item.id]);
          await incrUserEmailCount(item.user_id);
          await incrGlobalEmailCount();
          if (already + 1 > 250) console.warn('[EMAIL] Warning: > 250 emails aujourd\'hui !');
          await cronSleep(500);
        } catch (e) {
          await dbPool.query(`UPDATE campaign_queue SET status='failed', error=$2 WHERE id=$1`, [item.id, e.message]);
        }
      }
      console.log(`[CRON queue] ${rows.length} emails traites`);
    } catch (e) {
      console.error('[CRON queue]', e.message);
    }
  }

  // ── Traitement file d'attente SMS (toutes les 30 min, 9h-20h) ──────────────
  // Les envois IA sont planifiés avec scheduled_at précis (date + heure).
  // On envoie uniquement les SMS dont l'heure planifiée est passée.
  const { sendSMS, SMS_PRICE } = require('./utils/messenger');
  // R6 : refund du solde sur SMS en échec. Le débit a été fait upfront en
  // bloc (auto-send estimated_cost), donc chaque échec doit re-créditer
  // SMS_PRICE sinon le commerçant paie pour du vide. Log la transaction
  // de refund pour traçabilité.
  async function refundFailedSms(userId, campaignId, phone, reason) {
    try {
      await dbPool.query(
        `UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2`,
        [SMS_PRICE, userId]
      );
      await dbPool.query(
        `INSERT INTO sms_transactions (user_id, type, amount, sms_count, description, status)
         VALUES ($1,'refund',$2,1,$3,'completed')`,
        [userId, SMS_PRICE, `Refund SMS échoué ${phone || ''} (${reason || 'sans raison'})`.slice(0, 250)]
      );
    } catch (e) {
      console.error('[CRON sms refund]', e.message);
    }
  }
  // Commit 26b — `appendUnsubscribeSms` ajoute "Stop: <url>" au message SMS
  // marketing différé. Lookup unsubscribe_token via client_accounts pour ne
  // pas dépendre d'une éventuelle dénormalisation absente dans la queue.
  const { appendUnsubscribeSms } = require('./utils/unsubscribe');
  async function processSmsQueue() {
    const hour = new Date().getHours();
    if (hour < 9 || hour > 20) return;
    try {
      // scheduled_at (timestamp précis) si défini, sinon fallback scheduled_date
      const { rows } = await dbPool.query(`
        SELECT q.*,
               ca.unsubscribe_token AS ca_unsubscribe_token
          FROM campaign_queue q
          LEFT JOIN client_accounts ca
                 ON ca.user_id = q.user_id
                AND ca.phone = q.client_phone
        WHERE q.status='pending'
          AND q.channel = 'sms'
          AND q.client_phone IS NOT NULL AND q.client_phone != ''
          AND (
            (q.scheduled_at IS NOT NULL AND q.scheduled_at <= NOW()) OR
            (q.scheduled_at IS NULL AND q.scheduled_date <= CURRENT_DATE)
          )
        ORDER BY COALESCE(q.scheduled_at, q.scheduled_date::timestamptz) ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      `);
      if (!rows.length) return;
      let sent = 0, failed = 0, refunded = 0;
      for (const item of rows) {
        try {
          const finalMsg = appendUnsubscribeSms(item.message, item.ca_unsubscribe_token);
          const r = await sendSMS(item.client_phone, finalMsg);
          if (r.success) {
            sent++;
            await dbPool.query(`UPDATE campaign_queue SET status='sent', sent_at=NOW() WHERE id=$1`, [item.id]);
            await dbPool.query(
              `INSERT INTO message_log (user_id, campaign_id, phone, channel, cost, status)
               VALUES ($1,$2,$3,'sms',$4,'sent')`,
              [item.user_id, item.campaign_id, item.client_phone, SMS_PRICE]
            );
            // Traçabilité IA — marque le code comme sent
            if (item.ai_code_id) {
              await dbPool.query(
                `UPDATE ai_campaign_codes SET sent_at=NOW(), status='sent' WHERE id=$1`,
                [item.ai_code_id]
              ).catch(() => {});
            }
          } else {
            failed++;
            await dbPool.query(`UPDATE campaign_queue SET status='failed', error=$2 WHERE id=$1`,
              [item.id, r.reason || 'Echec envoi']);
            if (item.ai_code_id) {
              await dbPool.query(
                `UPDATE ai_campaign_codes SET status='failed' WHERE id=$1`,
                [item.ai_code_id]
              ).catch(() => {});
            }
            // R6 : refund — le SMS n'a pas été envoyé, on re-crédite.
            await refundFailedSms(item.user_id, item.campaign_id, item.client_phone, r.reason);
            refunded++;
          }
          await cronSleep(200);
        } catch (e) {
          failed++;
          await dbPool.query(`UPDATE campaign_queue SET status='failed', error=$2 WHERE id=$1`, [item.id, e.message]);
          await refundFailedSms(item.user_id, item.campaign_id, item.client_phone, e.message);
          refunded++;
        }
      }
      console.log(`[CRON sms] ${sent} envoyés, ${failed} échecs (${refunded} remboursés) sur ${rows.length}`);
    } catch (e) {
      console.error('[CRON sms]', e.message);
    }
  }

  // Rappels email automatiques avant RDV (toutes les heures, 7h-20h)
  async function processAppointmentReminders() {
    const hour = new Date().getHours();
    if (hour < 7 || hour > 20) return;
    try {
      // Rappel 24h avant
      const { rows: reminders24 } = await dbPool.query(`
        SELECT a.id, a.user_id, a.client_name, a.client_email, a.date, a.start_time, a.duration_minutes,
          bs.name AS service_name, e.name AS employee_name,
          u.business_name, u.address AS business_address
        FROM appointments a
        LEFT JOIN booking_services bs ON bs.id = a.service_id
        LEFT JOIN employees e ON e.id = a.employee_id
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.status IN ('confirmed','pending')
          AND a.reminder_24h_sent = FALSE
          AND a.client_email IS NOT NULL AND a.client_email != ''
          AND a.date = CURRENT_DATE + INTERVAL '1 day'
          AND ABS(EXTRACT(EPOCH FROM (a.start_time::time - LOCALTIME)) - 86400) < 1800
      `);
      for (const r of reminders24) {
        try {
          const dateStr = new Date(r.date).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
          const timeStr = r.start_time?.toString().slice(0,5) || '';
          await sendEmail({
            to: r.client_email,
            subject: `Rappel RDV - ${r.service_name || 'Votre prestation'} demain a ${timeStr}`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:40px 20px;">
<div style="max-width:460px;margin:0 auto;background:white;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
<div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:36px;text-align:center;">
<div style="font-size:40px;margin-bottom:10px;">📅</div>
<h1 style="color:white;margin:0;font-size:22px;font-weight:800;">Rappel de rendez-vous</h1>
</div>
<div style="padding:32px 36px;">
<p style="color:#0f172a;font-size:16px;font-weight:700;">Bonjour ${r.client_name},</p>
<p style="color:#64748b;font-size:14px;">Nous vous rappelons votre rendez-vous demain :</p>
<div style="background:#f1f5f9;border-radius:16px;padding:20px;margin:20px 0;">
<p style="margin:6px 0;font-size:14px;"><strong>Service :</strong> ${r.service_name || 'N/A'}</p>
<p style="margin:6px 0;font-size:14px;"><strong>Date :</strong> ${dateStr}</p>
<p style="margin:6px 0;font-size:14px;"><strong>Heure :</strong> ${timeStr}</p>
${r.employee_name ? `<p style="margin:6px 0;font-size:14px;"><strong>Avec :</strong> ${r.employee_name}</p>` : ''}
${r.business_address ? `<p style="margin:6px 0;font-size:14px;"><strong>Adresse :</strong> ${r.business_address}</p>` : ''}
</div>
<p style="color:#64748b;font-size:13px;">A bientot chez <strong>${r.business_name || 'votre commerce'}</strong> !</p>
</div>
<div style="background:#f8fafc;padding:18px;text-align:center;border-top:1px solid #e2e8f0;">
<p style="color:#cbd5e1;font-size:11px;margin:0;">© ${new Date().getFullYear()} FlowIA</p>
</div></div></body></html>`,
          });
          await dbPool.query(`UPDATE appointments SET reminder_24h_sent=TRUE WHERE id=$1`, [r.id]);
          await incrGlobalEmailCount();
          await incrUserEmailCount(r.user_id);
        } catch (e) { console.error('[REMINDER 24h]', e.message); }
      }

      // Rappel 2h avant
      const { rows: reminders2 } = await dbPool.query(`
        SELECT a.id, a.user_id, a.client_name, a.client_email, a.date, a.start_time,
          bs.name AS service_name, e.name AS employee_name,
          u.business_name, u.address AS business_address
        FROM appointments a
        LEFT JOIN booking_services bs ON bs.id = a.service_id
        LEFT JOIN employees e ON e.id = a.employee_id
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.status IN ('confirmed','pending')
          AND a.reminder_2h_sent = FALSE
          AND a.client_email IS NOT NULL AND a.client_email != ''
          AND a.date = CURRENT_DATE
          AND a.start_time BETWEEN (LOCALTIME + INTERVAL '1 hour 45 minutes') AND (LOCALTIME + INTERVAL '2 hours 15 minutes')
      `);
      for (const r of reminders2) {
        try {
          const timeStr = r.start_time?.toString().slice(0,5) || '';
          await sendEmail({
            to: r.client_email,
            subject: `Votre RDV est dans 2h - ${r.service_name || 'Votre prestation'} a ${timeStr}`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:40px 20px;">
<div style="max-width:460px;margin:0 auto;background:white;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
<div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:36px;text-align:center;">
<div style="font-size:40px;margin-bottom:10px;">⏰</div>
<h1 style="color:white;margin:0;font-size:22px;font-weight:800;">Votre RDV approche !</h1>
</div>
<div style="padding:32px 36px;">
<p style="color:#0f172a;font-size:16px;font-weight:700;">Bonjour ${r.client_name},</p>
<p style="color:#64748b;font-size:14px;">Votre rendez-vous est dans <strong>2 heures</strong> :</p>
<div style="background:#f1f5f9;border-radius:16px;padding:20px;margin:20px 0;">
<p style="margin:6px 0;font-size:14px;"><strong>Service :</strong> ${r.service_name || 'N/A'}</p>
<p style="margin:6px 0;font-size:14px;"><strong>Heure :</strong> ${timeStr}</p>
${r.employee_name ? `<p style="margin:6px 0;font-size:14px;"><strong>Avec :</strong> ${r.employee_name}</p>` : ''}
${r.business_address ? `<p style="margin:6px 0;font-size:14px;"><strong>Adresse :</strong> ${r.business_address}</p>` : ''}
</div>
<p style="color:#64748b;font-size:13px;">A tout de suite !</p>
</div>
<div style="background:#f8fafc;padding:18px;text-align:center;border-top:1px solid #e2e8f0;">
<p style="color:#cbd5e1;font-size:11px;margin:0;">© ${new Date().getFullYear()} FlowIA</p>
</div></div></body></html>`,
          });
          await dbPool.query(`UPDATE appointments SET reminder_2h_sent=TRUE WHERE id=$1`, [r.id]);
          await incrGlobalEmailCount();
          await incrUserEmailCount(r.user_id);
        } catch (e) { console.error('[REMINDER 2h]', e.message); }
      }

      if (reminders24.length || reminders2.length) {
        console.log(`[CRON reminders] 24h: ${reminders24.length}, 2h: ${reminders2.length}`);
      }
    } catch (e) {
      console.error('[CRON reminders]', e.message);
    }
  }

  function startCron() {
    // Décaler chaque tâche pour ne pas tout lancer en même temps
    setInterval(async () => {
      try { await runRdvReminders();      } catch (e) { console.error('[CRON rdv]', e.message); }
    }, 60 * 1000);

    setInterval(async () => {
      try { await runEmployeeReminders(); } catch (e) { console.error('[CRON emp]', e.message); }
    }, 60 * 1000);

    setInterval(async () => {
      try { await runDailyRecaps();       } catch (e) { console.error('[CRON recap]', e.message); }
    }, 5 * 60 * 1000); // moins fréquent, toutes les 5 min

    // File d'attente campagnes email — toutes les heures
    setInterval(async () => {
      try { await processCampaignQueue(); } catch (e) { console.error('[CRON queue]', e.message); }
    }, 60 * 60 * 1000);

    // File d'attente SMS — toutes les 30 min (campagnes IA planifiées par phase)
    setInterval(async () => {
      try { await processSmsQueue(); } catch (e) { console.error('[CRON sms]', e.message); }
    }, 30 * 60 * 1000);

    // Rappels email RDV — toutes les heures
    setInterval(async () => {
      try { await processAppointmentReminders(); } catch (e) { console.error('[CRON reminders]', e.message); }
    }, 60 * 60 * 1000);

    // Nettoyer les transactions pending depuis plus de 2h (paiement abandonne)
    setInterval(async () => {
      try {
        await dbPool.query(`
          UPDATE sms_transactions
          SET status = 'expired'
          WHERE status = 'pending'
          AND created_at < NOW() - INTERVAL '2 hours'
        `);
      } catch(e) {
        console.error('[CRON CLEANUP]', e.message);
      }
    }, 2 * 60 * 60 * 1000);

    // Anniversaires clients — commit 24b. Tente l'envoi toutes les heures,
    // mais le handler ne déclenche que le 1er du mois entre 09:00 et 10:00
    // (guards horaires internes). Anti-doublon annuel via SELECT préalable
    // sur client_rewards + filtre last_birthday_reward_at rolling 330j.
    setInterval(async () => {
      try { await runBirthdayPromos(); } catch (e) { console.error('[CRON birthday]', e.message); }
    }, 60 * 60 * 1000);

    console.log('⏰ Cron démarré (worker', process.pid, ')');
  }

  // ── Cron anniversaire : génère promos + envoie emails ─────────────────────
  // Commit 24b — refonte UX : on n'envoie plus le jour exact d'anniversaire
  // mais le 1er du mois de naissance, et le code est valable tout le mois
  // calendaire (du 1er au dernier jour du mois). UX plus respectueuse RGPD
  // (mois+année suffisent à l'inscription) + fenêtre d'utilisation plus large
  // pour le client.
  //
  // Filtre principal :
  //   - birthday_campaigns.is_enabled = TRUE     (gate commerçant)
  //   - ca.marketing_opt_in = TRUE               (RGPD commit 17)
  //   - EXTRACT(MONTH FROM birth_date) = MONTH(now) AND DAY(now) = 1
  //   - rolling 330j via ca.last_birthday_reward_at (anti-fraude)
  //
  // Cron exécuté toutes les heures, mais l'envoi n'est déclenché qu'à 09:xx
  // (guard horaire interne) — ce qui restreint naturellement à un seul créneau
  // d'envoi par jour, idempotent via le filtre last_birthday_reward_at.
  // options.force        : ignore les guards horaires (test admin)
  // options.userIdFilter : limite l'envoi à un seul commerçant (test admin)
  async function runBirthdayPromos(options = {}) {
    const { force = false, userIdFilter = null } = options;
    const now = new Date();
    if (!force) {
      if (now.getHours() !== 9) return { ok: true, sent: 0, skipped: 'not_9am' };
      if (now.getDate() !== 1) return { ok: true, sent: 0, skipped: 'not_first_of_month' };
    }
    try {
      const params = [];
      let where = 'bc.is_enabled = TRUE';
      if (userIdFilter) { params.push(userIdFilter); where += ` AND bc.user_id = $${params.length}`; }
      const { rows: campaigns } = await dbPool.query(
        `SELECT bc.user_id, bc.discount_type, bc.discount_value,
                bc.message, u.business_name, u.email AS biz_email, u.phone AS biz_phone,
                u.address AS biz_address
           FROM birthday_campaigns bc
           JOIN users u ON u.id = bc.user_id
          WHERE ${where}`,
        params
      );
      if (!campaigns.length) return { ok: true, sent: 0, skipped: 'no_campaign_enabled' };

      const { sendBirthdayPromo } = require('./utils/email');
      let totalSent = 0;

      const y = now.getFullYear();
      const monthNum = now.getMonth() + 1; // 1..12
      const monthNames = [
        'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
      ];
      const monthName = monthNames[monthNum - 1];

      for (const camp of campaigns) {
        // Clients de ce commerçant nés ce mois-ci. On filtre uniquement sur
        // EXTRACT(MONTH FROM birth_date) — le jour de naissance n'est plus
        // utilisé (le picker ne collecte que mois+année, jour forcé à 01).
        // Anti-fraude 330j porté UNIQUEMENT par client_accounts (scope user_id
        // → par commerçant), pour ne pas bloquer un client multi-commerces.
        const { rows: clients } = await dbPool.query(
          `SELECT DISTINCT ca.id, ca.email, ca.first_name, ca.last_name, ca.unsubscribe_token
             FROM client_accounts ca
            WHERE ca.user_id = $1
              AND ca.birth_date IS NOT NULL
              AND ca.marketing_opt_in = TRUE
              AND EXTRACT(MONTH FROM ca.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
              AND ca.email IS NOT NULL AND ca.email <> ''
              AND (ca.last_birthday_reward_at IS NULL
                   OR ca.last_birthday_reward_at < NOW() - INTERVAL '330 days')`,
          [camp.user_id]
        );
        if (!clients.length) continue;

        for (const c of clients) {
          const emailLow = c.email.toLowerCase();
          try {
            // Anti-doublon annuel : si un reward anniversaire a déjà été créé
            // cette année pour ce client chez ce commerçant → skip.
            const { rows: already } = await dbPool.query(
              `SELECT 1 FROM client_rewards
                WHERE user_id=$1 AND LOWER(client_email)=$2
                  AND reward_type='birthday'
                  AND EXTRACT(YEAR FROM created_at) = $3
                LIMIT 1`,
              [camp.user_id, emailLow, y]
            );
            if (already.length) continue;
            const sentToday = await getGlobalEmailCount();
            if (sentToday >= 300) { console.log('[CRON birthday] limite email atteinte'); return; }

            // Format code : BDAY-{client_id_short}-{year}.
            // Brief 24b : "BDAY-A1B2-2026". client_id_short = 4 premiers chars
            // du UUID client (déterministe, lisible). Sur collision UNIQUE
            // (user_id, code) → retry avec 6 chars puis 6 chars + 2 random.
            const idHex = String(c.id || '').replace(/-/g, '');
            const txClient = await dbPool.connect();
            let promoRow = null;
            let code = null;
            try {
              await txClient.query('BEGIN');
              let inserted = false;
              for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
                let shortId;
                if (attempt === 0)      shortId = idHex.slice(0, 4).toUpperCase();
                else if (attempt === 1) shortId = idHex.slice(0, 6).toUpperCase();
                else                    shortId = idHex.slice(0, 6).toUpperCase()
                                                  + Math.random().toString(36).slice(2, 4).toUpperCase();
                code = `BDAY-${shortId || 'C'}-${y}`;
                try {
                  // valid_until = dernier jour du mois courant (ex 30/04/2026
                  // si on est le 01/04/2026). DATE_TRUNC + 1 mois - 1 jour.
                  const { rows } = await txClient.query(
                    `INSERT INTO promo_codes
                       (user_id, code, type, value, max_uses, valid_from, valid_until,
                        is_active, target_clients, owner_client_email)
                     VALUES ($1,$2,$3,$4,1,CURRENT_DATE,
                             (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE,
                             TRUE,'specific',$5)
                     RETURNING id, valid_until`,
                    [camp.user_id, code, camp.discount_type, camp.discount_value, emailLow]
                  );
                  promoRow = rows[0];
                  inserted = true;
                } catch (dupErr) {
                  if (dupErr.code !== '23505') throw dupErr; // autre erreur → abort
                  // collision code — savepoint SQL invalidé, on recommence la tx
                  await txClient.query('ROLLBACK');
                  await txClient.query('BEGIN');
                }
              }
              if (!inserted) throw new Error(`code collision 3x for ${emailLow}`);
              // expires_at = 1er du mois suivant à 00:00 UTC = moment exact où
              // la promo bascule "valide" → "expirée" côté backend via
              // `valid_until >= CURRENT_DATE`.
              await txClient.query(
                `INSERT INTO client_rewards
                   (user_id, client_email, reward_type, status, promo_code_id, expires_at)
                 VALUES ($1,$2,'birthday','available',$3,
                         (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::timestamptz)`,
                [camp.user_id, emailLow, promoRow.id]
              );
              await txClient.query(
                `UPDATE client_accounts SET last_birthday_reward_at = NOW()
                  WHERE user_id=$1 AND LOWER(email)=$2`,
                [camp.user_id, emailLow]
              );
              await txClient.query('COMMIT');
            } catch (txErr) {
              try { await txClient.query('ROLLBACK'); } catch(_) {}
              throw txErr;
            } finally {
              txClient.release();
            }
            const promo = [promoRow];

            const clientName = [c.first_name, c.last_name].filter(Boolean).join(' ');
            await sendBirthdayPromo({
              to: c.email,
              clientName,
              businessName: camp.business_name || 'Votre commerçant',
              code,
              type: camp.discount_type,
              value: camp.discount_value,
              validUntil: promo[0].valid_until,
              monthName,
              monthNum,
              customMessage: camp.message,
              businessEmail: camp.biz_email,
              businessPhone: camp.biz_phone,
              businessAddress: camp.biz_address,
              unsubscribeToken: c.unsubscribe_token,
            });
            await incrGlobalEmailCount();
            await incrUserEmailCount(camp.user_id);
            totalSent++;
            await cronSleep(300);
          } catch (e) {
            console.error('[CRON birthday client]', emailLow, e.message);
          }
        }
      }
      if (totalSent) console.log(`[CRON birthday] ${totalSent} anniversaires traités (mois ${monthName} ${y})`);
      return { ok: true, sent: totalSent, monthName, year: y };
    } catch (e) { console.error('[CRON birthday]', e.message); return { ok: false, error: e.message }; }
  }
  // Expose pour endpoint admin de test (POST /api/birthday-campaign/test-run).
  app.locals.runBirthdayPromos = runBirthdayPromos;

  const PORT = process.env.PORT || 5000;
  initDB()
    .then(() => {
      app.listen(PORT, () => {
        const isWorker1 = !cluster.worker || cluster.worker.id === 1;
        console.log(`✅ Worker ${process.pid} → http://localhost:${PORT}`);
        if (isWorker1) startCron();
      });
    })
    .catch(err => {
      console.error('❌ DB init failed:', err);
      process.exit(1);
    });
}