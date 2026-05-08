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
  // CORS merchant — INCHANGÉ pour tous les paths sauf /api/admin/*.
  // Le namespace admin a sa propre whitelist (admin.haircoifflille.fr +
  // localhost:5174) appliquée par le router admin lui-même. Bypasser le CORS
  // merchant ici évite que la regex Vercel preview merchant n'autorise par
  // accident un sous-domaine sur l'admin, et inversement.
  const merchantCors = cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      if (previewRegex.test(origin)) return callback(null, true);
      callback(new Error('CORS not allowed: ' + origin));
    },
    credentials: true,
  });
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/admin')) return next();
    return merchantCors(req, res, next);
  });

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
    res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=(), usb=(), autoplay=()');
    next();
  });
  // Webhook Stripe doit recevoir le raw body AVANT express.json()
  app.use('/api/payments/sms/webhook', express.raw({ type: 'application/json' }));
  app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));
  app.use('/api/stripe-connect/webhook', express.raw({ type: 'application/json' }));

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
  // AUDIT Phase 5 : rate limiter dedie sur creation PaymentIntent (Stripe Connect).
  // Cap strict anti-spam : un client legitime n'a besoin que de 1-3 PI par
  // session de booking. 10/15min/IP suffit pour retries normaux + bloque un
  // bot qui spammerait pour creer des PI orphelins.
  app.use('/api/pub/:slug/booking/payment-intent', paymentsIntentLimiter);
  // Formulaire de contact public (site marketing) — cap strict anti-spam.
  // 5 demandes / 15 min / IP : largement suffisant pour un humain, bloque
  // un bot qui spam.
  const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 5,
    message: { error: 'Trop de demandes envoyees. Reessayez dans quelques minutes.' },
    standardHeaders: true, legacyHeaders: false,
  });
  app.use('/api/pub/contact', contactLimiter);
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

  // Abonnement plateforme FlowIA (Stripe Billing) — checkout/portail/me.
  // Webhook /api/subscriptions/webhook ajouté en commit 3 (raw body).
  app.use('/api/subscriptions/checkout', paymentsIntentLimiter);
  app.use('/api/subscriptions/portal',   paymentsIntentLimiter);
  app.use('/api/subscriptions', apiLimiter, require('./routes/subscriptions'));

  // Stripe Connect (onboarding marchand pour encaisser les RDV). Direct
  // charges via Controller API + commission FlowIA via application_fee_amount.
  app.use('/api/stripe-connect/onboard',        paymentsIntentLimiter);
  app.use('/api/stripe-connect/dashboard-link', paymentsIntentLimiter);
  app.use('/api/stripe-connect',  apiLimiter, require('./routes/stripe-connect'));

  // Sync Google Calendar (sortant FlowIA → Google Agenda du merchant).
  app.use('/api/calendar-sync',  apiLimiter, require('./routes/calendar-sync'));

  const { router: notifRouter, runDailyRecaps, runRdvReminders, runEmployeeReminders } =
    require('./routes/notifications');
  app.use('/api/notifications',  notifLimiter, notifRouter);

  // Refonte FDS-2026 commit 2 : préférences compte (mode tablette, etc.).
  app.use('/api/user-settings',  apiLimiter,  require('./routes/user-settings'));

  // ── Admin panel (commit #1b admin) ───────────────────────────────────────
  // Namespace totalement isolé : CORS dédié dans le router, JWT secrets
  // séparés (ADMIN_JWT_SECRET / ADMIN_JWT_REFRESH_SECRET), audit log obligatoire.
  app.use('/api/admin', require('./routes/admin'));

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
      // Pre-purge : marquer 'expired' tous les jobs qui referencent un
      // promo_code dont la valid_until est depassee. Evite d'envoyer un
      // code mort au client (frustration + image marque). On detecte le
      // code via une regex sur le message (les emails de campagne IA
      // injectent le code en clair, ex 'SOLDES-XXXX'). Plus robuste :
      // si campaign_id reference un promo_code via lien explicite.
      // Best-effort : on ne droppe que les codes dont la presence est
      // certaine via match exact dans le message.
      await dbPool.query(`
        UPDATE campaign_queue q
           SET status='expired', error='Code promo deja expire au moment de l envoi'
         WHERE q.status='pending'
           AND q.channel='email'
           AND EXISTS (
             SELECT 1 FROM promo_codes pc
              WHERE pc.user_id = q.user_id
                AND pc.valid_until < CURRENT_DATE
                AND q.message LIKE '%' || pc.code || '%'
           )
      `).catch(e => console.warn('[CRON queue pre-purge expired]', e.message));

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
    // Lock applicatif distribué Postgres (pg_try_advisory_lock) : remplace
    // la garde historique `cluster.worker.id === 1`. Garantit qu'un seul
    // tick s'exécute à un instant T, **même en multi-instance Render**
    // (plusieurs containers + plusieurs workers cluster par container).
    // Le lock est session-scoped : si l'instance crashe, la session PG
    // meurt et le lock se libère automatiquement (pas de risque de
    // blocage permanent).
    const { withLock } = require('./utils/distributedLock');

    // Helper local : exécute fn() à chaque tick si et seulement si le lock
    // peut être acquis. Sinon log informatif et skip (autre instance fait
    // le travail). Toute erreur de fn() est loggée puis le lock est libéré
    // (try/finally interne à withLock).
    const scheduleLocked = (intervalMs, lockKey, label, fn) => {
      setInterval(async () => {
        try {
          await withLock(lockKey, fn);
        } catch (e) {
          console.error(`[CRON ${label}]`, e.message);
        }
      }, intervalMs);
    };

    // Décaler chaque tâche pour ne pas tout lancer en même temps.
    scheduleLocked(60 * 1000,           'cron:reminders:rdv',          'rdv',       runRdvReminders);
    scheduleLocked(60 * 1000,           'cron:reminders:employee',     'emp',       runEmployeeReminders);
    scheduleLocked(5 * 60 * 1000,       'cron:recaps:daily',           'recap',     runDailyRecaps);
    // File d'attente campagnes email — toutes les heures
    scheduleLocked(60 * 60 * 1000,      'worker:campaign:queue',       'queue',     processCampaignQueue);
    // File d'attente SMS — toutes les 30 min (campagnes IA planifiées par phase)
    scheduleLocked(30 * 60 * 1000,      'worker:sms:queue',            'sms',       processSmsQueue);
    // Rappels email RDV — toutes les heures
    scheduleLocked(60 * 60 * 1000,      'cron:reminders:appointment',  'reminders', processAppointmentReminders);
    // Nettoyer les transactions pending depuis plus de 2h (paiement abandonné)
    scheduleLocked(2 * 60 * 60 * 1000,  'cron:cleanup:sms_pending',    'cleanup',   async () => {
      await dbPool.query(`
        UPDATE sms_transactions
        SET status = 'expired'
        WHERE status = 'pending'
        AND created_at < NOW() - INTERVAL '2 hours'
      `);
    });
    // Anniversaires clients — commit 24b. Tente l'envoi toutes les heures,
    // mais le handler ne déclenche que le 1er du mois entre 09:00 et 10:00
    // (guards horaires internes). Anti-doublon annuel via SELECT préalable
    // sur client_rewards + filtre last_birthday_reward_at rolling 330j.
    scheduleLocked(60 * 60 * 1000,      'cron:birthday:monthly',       'birthday',  runBirthdayPromos);

    // ESCROW : libere les payouts dus (release_at <= NOW(), status=pending)
    // -> stripe.payouts.create vers l'IBAN du commerçant. 1x/jour suffit
    // (la latence d'un payout n'est pas critique au minute pres). Premier
    // tick quasi-immediat puis toutes les 24h.
    {
      const { releasePayouts: releasePayoutsCron } = require('./utils/releasePayouts');
      scheduleLocked(24 * 60 * 60 * 1000, 'cron:escrow:release_payouts', 'payouts',
                     () => releasePayoutsCron(dbPool));
    }

    // NO-SHOW AUTOMATIQUE : marque cancelled_by='system' sur les RDV passes
    // depuis +24h non encaisses. Acompte conserve (pas de refund). Le cron
    // releasePayouts libere ensuite les fonds vers le commercant a J+3.
    // Frequence horaire : la fenetre de grace est large (24h) donc 1x/h
    // suffit largement et evite tout risque de course avec une action
    // commercant tardive.
    {
      const { runAutoNoShow } = require('./utils/autoNoShow');
      scheduleLocked(60 * 60 * 1000, 'cron:no_show:auto', 'no-show',
                     () => runAutoNoShow(dbPool));
    }

    // Purge automatique des creances orphelines (RGPD Art. 17.3.e)
    // dont la duree de retention legale est depassee. Quotidien suffit
    // (on ne purge pas a la seconde pres apres 2 ans).
    scheduleLocked(24 * 60 * 60 * 1000, 'cron:debt:purge',             'debt-purge', async () => {
      const { purgeExpiredDebtRecords } = require('./utils/debtRecord');
      const n = await purgeExpiredDebtRecords(dbPool);
      if (n > 0) console.log(`[CRON debt-purge] ${n} créances expirées purgées`);
    });

    // RGPD soft-delete : purge definitive des comptes commercants apres 30
    // jours de grace. Les donnees Google ont deja ete supprimees au moment
    // de la demande (DELETE /api/auth/account), il ne reste que les donnees
    // metier (employees, services, RDV anonymises etc.) qu'on cascade ici.
    scheduleLocked(24 * 60 * 60 * 1000, 'cron:account:hard-delete',    'acc-purge', async () => {
      // Selectionne les comptes en grace > 30 jours (SAFETY : > car le
      // soft-delete a deja anonymise l'identite Google immediatement).
      const { rows: pending } = await dbPool.query(
        `SELECT id FROM users
          WHERE deletion_requested_at IS NOT NULL
            AND deletion_requested_at < NOW() - INTERVAL '30 days'`
      );
      if (pending.length === 0) return;

      // Memes tables que l'ancien DELETE /account immediat. La FK
      // ON DELETE CASCADE de users couvre une grande partie, mais on
      // explicite pour les tables sans FK directe (et pour ne pas
      // dependre du schema en evolution).
      const cascadeTables = [
        'push_subscriptions', 'notification_settings', 'notification_log',
        'app_notifications', 'employee_pins', 'user_pins',
        'verification_codes', 'booking_settings', 'booking_slug_aliases',
        'business_hours', 'business_breaks',
        'booking_services', 'booking_service_categories',
        'employee_time_slots', 'employee_hours', 'employee_availability',
        'employee_absences', 'service_commissions', 'employee_commissions',
        'promo_codes', 'loyalty_programs',
        'client_accounts', 'client_notes', 'client_credits',
        'credit_transactions', 'media',
        'categories', 'employees',
        'merchant_calendar_integrations',
      ];
      let purged = 0;
      for (const u of pending) {
        try {
          for (const table of cascadeTables) {
            await dbPool.query(`DELETE FROM ${table} WHERE user_id=$1`, [u.id])
              .catch(() => {});
          }
          await dbPool.query('DELETE FROM users WHERE id=$1', [u.id]);
          purged += 1;
          console.log(`[CRON acc-purge] commerçant ${u.id} purgé définitivement (post-30j)`);
        } catch (e) {
          console.error(`[CRON acc-purge] erreur user ${u.id}:`, e.message);
        }
      }
      if (purged > 0) console.log(`[CRON acc-purge] ${purged} compte(s) purgé(s)`);
    });

    console.log('⏰ Cron démarré (worker', process.pid, ') — protégé par pg_advisory_lock');
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
      // Refonte etalement : on tourne CHAQUE jour du mois a 9h (pas juste le
      // 1er). Cela permet d'etaler les envois sur plusieurs jours quand le
      // commercant a > 190 anniversaires dans le mois (quota EMAIL_DAILY_LIMIT_USER).
      // Auparavant : tout etait envoye le 1er a 9h, ceux dépassant le quota
      // étaient perdus jusqu'à l'année suivante.
      if (now.getHours() !== 9) return { ok: true, sent: 0, skipped: 'not_9am' };
    }
    // Helper local : valid_until d'un code anniversaire = MAX(fin du mois courant,
    // aujourd'hui + 14j). Garantit que tout code envoye en fin de mois reste
    // valable au moins 2 semaines pour le client.
    const computeBirthdayValidUntil = (today) => {
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const plus14 = new Date(today); plus14.setDate(plus14.getDate() + 14);
      const max = endOfMonth > plus14 ? endOfMonth : plus14;
      // YYYY-MM-DD pour colonne DATE
      return max.toISOString().slice(0, 10);
    };
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

      const { sendBirthdayPromo, checkUserEmailQuota } = require('./utils/email');
      let totalSent = 0;

      const y = now.getFullYear();
      const monthNum = now.getMonth() + 1; // 1..12
      const monthNames = [
        'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
      ];
      const monthName = monthNames[monthNum - 1];

      for (const camp of campaigns) {
        // ── Etalement : combien envoyer aujourd'hui pour CE commercant ? ──
        // Cible = ceil(restants ce mois / jours restants jusqu'à fin du mois).
        // Borne haute = quota disponible aujourd'hui (190 - deja envoyes).
        // Exemple : 400 anniversaires en mai, on est le 1er :
        //   restants=400, jours=31 -> cible=13/jour, quota 190 OK
        // Exemple : 400 anniversaires en mai, on est le 25 :
        //   restants=300 (s'il en reste), jours=7 -> cible=43/jour, quota 190 OK
        // Si le commercant envoie aussi des campagnes manuelles, son quota du
        // jour est plus bas -> on s'adapte automatiquement.
        const todayDate    = now.getDate();
        const lastDayMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysRemaining = Math.max(1, lastDayMonth - todayDate + 1);

        const { rows: cnt } = await dbPool.query(
          `SELECT COUNT(DISTINCT ca.id)::int AS n
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
        const remaining = cnt[0].n;
        if (remaining === 0) continue;

        const userQuota = await checkUserEmailQuota(camp.user_id);
        const targetToday = Math.min(
          Math.ceil(remaining / daysRemaining),
          userQuota.available_today,
        );
        if (targetToday <= 0) {
          console.log(`[CRON birthday] ${camp.business_name} : quota epuise (${userQuota.sent_today}/${userQuota.daily_limit}), retry demain`);
          continue;
        }

        // Clients de ce commerçant nés ce mois-ci, tries pour avoir une
        // distribution stable (created_at ASC = anciens clients d'abord).
        // Anti-fraude 330j porte UNIQUEMENT par client_accounts (scope user_id).
        const { rows: clients } = await dbPool.query(
          `SELECT DISTINCT ca.id, ca.email, ca.first_name, ca.last_name, ca.unsubscribe_token
             FROM client_accounts ca
            WHERE ca.user_id = $1
              AND ca.birth_date IS NOT NULL
              AND ca.marketing_opt_in = TRUE
              AND EXTRACT(MONTH FROM ca.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
              AND ca.email IS NOT NULL AND ca.email <> ''
              AND (ca.last_birthday_reward_at IS NULL
                   OR ca.last_birthday_reward_at < NOW() - INTERVAL '330 days')
            ORDER BY ca.created_at ASC
            LIMIT $2`,
          [camp.user_id, targetToday]
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

            // Garde-fou cluster : on conserve un cap global 300/jour pour
            // proteger l'IP Brevo (rate-limiting plateforme). Si atteint,
            // on stop tout (pas juste ce commercant) jusqu'au lendemain.
            const sentToday = await getGlobalEmailCount();
            if (sentToday >= 300) { console.log('[CRON birthday] cap global cluster atteint'); return; }

            // Re-check quota commercant a chaque iteration (peut avoir change
            // entre temps si campagne manuelle envoyee en parallele).
            const liveQuota = await checkUserEmailQuota(camp.user_id);
            if (liveQuota.available_today <= 0) {
              console.log(`[CRON birthday] ${camp.business_name} : quota epuise live, stop`);
              break;
            }

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
                  // valid_until = MAX(fin du mois, today + 14j). Garantit qu'un
                  // code envoye le 28 du mois reste valable au moins 14j (ex :
                  // envoi 28/05 -> expire 11/06). Avant : tous les codes
                  // expiraient le dernier jour du mois courant, ceux envoyes
                  // tard etaient quasi morts.
                  const validUntilStr = computeBirthdayValidUntil(now);
                  const { rows } = await txClient.query(
                    `INSERT INTO promo_codes
                       (user_id, code, type, value, max_uses, valid_from, valid_until,
                        is_active, target_clients, owner_client_email)
                     VALUES ($1,$2,$3,$4,1,CURRENT_DATE, $6::DATE,
                             TRUE,'specific',$5)
                     RETURNING id, valid_until`,
                    [camp.user_id, code, camp.discount_type, camp.discount_value, emailLow, validUntilStr]
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
              // expires_at = valid_until + 1 jour (timestamp = minuit le
              // lendemain de la derniere date valide). Aligne avec le
              // valid_until adapte (MAX(fin_mois, today+14j)).
              await txClient.query(
                `INSERT INTO client_rewards
                   (user_id, client_email, reward_type, status, promo_code_id, expires_at)
                 VALUES ($1,$2,'birthday','available',$3, ($4::DATE + INTERVAL '1 day')::timestamptz)`,
                [camp.user_id, emailLow, promoRow.id, promoRow.valid_until]
              );
              // NB : on NE marque PAS last_birthday_reward_at dans ce COMMIT.
              // Sera mis a jour APRES sendBirthdayPromo confirme. Si l'envoi
              // echoue, le client reste eligible au retry demain (sinon il
              // serait perdu pour 330j).
              await txClient.query('COMMIT');
            } catch (txErr) {
              try { await txClient.query('ROLLBACK'); } catch(_) {}
              throw txErr;
            } finally {
              txClient.release();
            }
            const promo = [promoRow];

            const clientName = [c.first_name, c.last_name].filter(Boolean).join(' ');
            try {
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
              // Envoi reussi : marquer last_birthday_reward_at + incr quotas.
              // Avant : tout etait fait dans le COMMIT precedent, donc un
              // echec d'envoi marquait le client comme "deja recu" et le
              // perdait pour 330j (bug). Maintenant : retry demain possible.
              await dbPool.query(
                `UPDATE client_accounts SET last_birthday_reward_at = NOW()
                  WHERE user_id=$1 AND LOWER(email)=$2`,
                [camp.user_id, emailLow]
              );
              await incrGlobalEmailCount();
              await incrUserEmailCount(camp.user_id);
              totalSent++;
              await cronSleep(300);
            } catch (sendErr) {
              // Echec envoi : cleanup promo_code + client_rewards pour que le
              // retry demain regenere proprement (sinon anti-doublon annuel
              // bloquerait le retry car client_rewards existe).
              console.error('[CRON birthday SEND FAIL]', emailLow, sendErr.message);
              await dbPool.query(`DELETE FROM client_rewards WHERE promo_code_id=$1`, [promoRow.id]).catch(() => {});
              await dbPool.query(`DELETE FROM promo_codes WHERE id=$1`, [promoRow.id]).catch(() => {});
            }
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
        // « isLocalLeader » remplace l'ancienne garde `cluster.worker.id === 1`
        // qui servait de protection contre la double exécution des crons.
        // Cette garantie est désormais portée par pg_advisory_lock (cf.
        // utils/distributedLock.js) — efficace même en multi-instance Render.
        // On garde cette condition uniquement comme **optimisation locale**
        // pour ne pas multiplier les setInterval/log diagnostic au sein
        // d'un même container avec cluster Node (1 worker leader par
        // instance suffit ; les autres workers n'ouvrent que les requêtes
        // HTTP). En mono-process (NODE_ENV != production), la condition
        // est trivialement vraie.
        const isLocalLeader = !cluster.worker || cluster.worker.id === 1;
        console.log(`✅ Worker ${process.pid} → http://localhost:${PORT}`);
        // Commit 28b — log diagnostic des URLs unsubscribe émises dans les
        // emails marketing. Si l'URL pointe vers un backend qui ne contient
        // pas la route `/api/pub/unsubscribe-page` (ex. backend prod sur
        // branche main pendant la refonte), les liens cliquables renverront
        // 404 « Cannot GET ». Ce log permet de détecter la config en 1 coup.
        if (isLocalLeader) {
          try {
            const { unsubscribeUrl, backendUnsubscribeUrl } = require('./utils/unsubscribe');
            const stub = '00000000-0000-0000-0000-000000000000';
            const footerUrl = unsubscribeUrl(stub);
            const headerUrl = backendUnsubscribeUrl(stub);
            console.log(`[UNSUB CFG] footer email → ${footerUrl || '(non générable, BACKEND_PUBLIC_URL manquante)'}`);
            console.log(`[UNSUB CFG] List-Unsubscribe header → ${headerUrl || '(non générable)'}`);
            if (process.env.UNSUBSCRIBE_FRONTEND_PAGE_URL) {
              console.log(`[UNSUB CFG] redirect 302 actif vers → ${process.env.UNSUBSCRIBE_FRONTEND_PAGE_URL}`);
            }
          } catch (e) { console.warn('[UNSUB CFG] Log diagnostic indisponible:', e.message); }
          startCron();

          // ── Email queue (commit 30) ─────────────────────────────────────
          // Démarre pg-boss + worker uniquement sur le worker leader local
          // (isLocalLeader) pour économiser les connexions DB. pg-boss gère
          // lui-même la concurrence inter-instances Render via FOR UPDATE
          // SKIP LOCKED → safe en multi-instance. Si le démarrage échoue
          // (DATABASE_URL absente, schéma bloqué…), enqueueEmail() bascule
          // automatiquement en envoi synchrone — aucun email perdu.
          (async () => {
            try {
              const { startEmailQueue, startEmailWorker } = require('./utils/emailQueue');
              const b = await startEmailQueue();
              if (b) await startEmailWorker();
            } catch (e) {
              console.error('[emailQueue] init globale échouée:', e.message);
            }
          })();
        }
      });
    })
    .catch(err => {
      console.error('❌ DB init failed:', err);
      process.exit(1);
    });
}