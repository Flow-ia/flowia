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
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',').map(o => o.trim());
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('CORS not allowed: ' + origin));
    },
    credentials: true,
  }));
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

  // ── Routes ───────────────────────────────────────────────────────────────
  // Routes auth avec limiters spécifiques par endpoint
  const authRouter = require('./routes/auth');
  app.use('/api/auth/register', registerLimiter);
  app.use('/api/auth/login',    loginLimiter);
  app.use('/api/auth',          authLimiter, authRouter);
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
  app.use('/api/global-clients', apiLimiter,  require('./routes/global-clients'));
  app.use('/api/export',         apiLimiter,  require('./routes/export'));
  app.use('/api/credits',        apiLimiter,  require('./routes/credits'));
  app.use('/api/employee-pins',  apiLimiter,  require('./routes/employee-pins'));

  const { router: notifRouter, runDailyRecaps, runRdvReminders, runEmployeeReminders } =
    require('./routes/notifications');
  app.use('/api/notifications',  notifLimiter, notifRouter);

  // ── Health ───────────────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, pid: process.pid, uptime: process.uptime(), time: new Date() });
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

  // ── Cron — uniquement sur le worker 1 pour éviter les doublons ───────────
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

    console.log('⏰ Cron démarré (worker', process.pid, ')');
  }

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