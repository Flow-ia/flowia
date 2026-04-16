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
  app.use('/api/campaigns',     apiLimiter,  require('./routes/campaigns'));
  app.use('/api/payments',      apiLimiter,  require('./routes/payments'));

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

  // ── Protection Brevo gratuit — compteur global emails ────────────────────
  global.emailsToday = 0;
  // Reset chaque jour à minuit
  const resetEmailCounter = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    setTimeout(() => {
      global.emailsToday = 0;
      console.log('[EMAIL] Compteur journalier reset');
      setInterval(() => { global.emailsToday = 0; }, 24 * 60 * 60 * 1000);
    }, midnight - now);
  };
  resetEmailCounter();

  // ── Cron — uniquement sur le worker 1 pour éviter les doublons ───────────
  const { sendEmail } = require('./utils/email');
  const { pool: dbPool } = require('./db');
  const { sleep: cronSleep } = require('./utils/messenger');

  // Traitement file d'attente campagnes email (toutes les heures, 8h-20h)
  async function processCampaignQueue() {
    const hour = new Date().getHours();
    if (hour < 8 || hour > 20) return;
    try {
      const { rows } = await dbPool.query(`
        SELECT * FROM campaign_queue
        WHERE status='pending' AND scheduled_date <= CURRENT_DATE
        ORDER BY created_at ASC
        LIMIT 30
        FOR UPDATE SKIP LOCKED
      `);
      if (!rows.length) return;
      for (const item of rows) {
        try {
          if (global.emailsToday >= 300) {
            console.log('[CRON queue] Limite email marketing atteinte, arret');
            break;
          }
          await sendEmail({ to: item.client_email, subject: 'Offre speciale de votre commerce', html: item.message });
          await dbPool.query(`UPDATE campaign_queue SET status='sent', sent_at=NOW() WHERE id=$1`, [item.id]);
          await dbPool.query(
            `UPDATE users SET email_sent_today = email_sent_today + 1, email_sent_month = email_sent_month + 1 WHERE id=$1`,
            [item.user_id]
          );
          global.emailsToday++;
          if (global.emailsToday > 250) console.warn('[EMAIL] Warning: > 250 emails aujourd\'hui !');
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

  // Rappels email automatiques avant RDV (toutes les heures, 7h-20h)
  async function processAppointmentReminders() {
    const hour = new Date().getHours();
    if (hour < 7 || hour > 20) return;
    try {
      // Rappel 24h avant
      const { rows: reminders24 } = await dbPool.query(`
        SELECT a.id, a.client_name, a.client_email, a.date, a.start_time, a.duration_minutes,
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
          AND ABS(EXTRACT(EPOCH FROM (a.start_time::time - CURRENT_TIME)) - 86400) < 1800
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
          global.emailsToday++;
        } catch (e) { console.error('[REMINDER 24h]', e.message); }
      }

      // Rappel 2h avant
      const { rows: reminders2 } = await dbPool.query(`
        SELECT a.id, a.client_name, a.client_email, a.date, a.start_time,
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
          AND a.start_time BETWEEN (CURRENT_TIME + INTERVAL '1 hour 45 minutes') AND (CURRENT_TIME + INTERVAL '2 hours 15 minutes')
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
          global.emailsToday++;
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