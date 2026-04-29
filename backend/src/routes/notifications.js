// routes/notifications.js  ─  Récap journalier + Rappels RDV (multi-délais) + Rappels employés
const express  = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { sendDailyRecap, sendRdvReminder, sendEmployeeReminder } = require('../utils/email');
const { notifyAppointmentReminder } = require('../utils/push');
const router   = express.Router();
router.use(authMiddleware);

// Délais prédéfinis disponibles (en minutes)
const CLIENT_DELAYS  = [10, 20, 30, 60, 1440, 4320]; // 10min 20min 30min 1h 1j 3j
const EMPLOYEE_DELAYS = [15, 30, 60, 180];             // 15min 30min 1h 3h

// ── GET /api/notifications/settings ─────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM notification_settings WHERE user_id=$1`, [req.user.userId]);
    const s = rows[0] || {};
    // PG renvoie TIME en HH:MM:SS — on tronque pour <input type="time">
    // et pour la cohérence du round-trip GET/PUT.
    const recapTime = s.daily_recap_time ? String(s.daily_recap_time).substring(0, 5) : '20:00';
    res.json({
      daily_recap_enabled:       s.daily_recap_enabled    ?? false,
      daily_recap_time:          recapTime,
      daily_recap_email:         s.daily_recap_email      || null,
      reminder_enabled:          s.reminder_enabled       ?? false,
      reminder_delays:           s.reminder_delays        || '1440',
      employee_reminder_enabled: s.employee_reminder_enabled ?? false,
      employee_reminder_delays:  s.employee_reminder_delays  || '60',
      reminder_hours_before:     s.reminder_hours_before  || 24,
      // Sons
      sound_caisse:    s.sound_caisse    ?? true,
      sound_new_appt:  s.sound_new_appt  ?? true,
      sound_reminder:  s.sound_reminder  ?? true,
      sound_repeat:    s.sound_repeat    ?? 2,
      sound_rdv_before: s.sound_rdv_before ?? 15,
    });
  } catch(e) { console.error('[NOTIF]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── PUT /api/notifications/settings ─────────────────────────────────────────
router.put('/settings', async (req, res) => {
  try {
    const {
      daily_recap_enabled, daily_recap_time, daily_recap_email,
      reminder_enabled, reminder_delays,
      employee_reminder_enabled, employee_reminder_delays,
      sound_caisse, sound_new_appt, sound_reminder, sound_repeat, sound_rdv_before,
    } = req.body;

    // Audit AA : validations strictes (aligné V/X).
    // Format HH:MM (00-23:00-59) pour daily_recap_time.
    // PG renvoie les colonnes TIME en HH:MM:SS — on tronque à HH:MM pour
    // accepter le round-trip GET → save sans modification utilisateur.
    let recapTime = daily_recap_time ? String(daily_recap_time).substring(0, 5) : null;
    if (recapTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(recapTime))
      return res.status(400).json({ error: 'Heure invalide (HH:MM).' });
    // Email propre si fourni.
    if (daily_recap_email) {
      const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
      if (!EMAIL_RE.test(String(daily_recap_email).trim()) || String(daily_recap_email).length > 254)
        return res.status(400).json({ error: 'Email invalide.' });
    }
    // Sanity caps sons — avant parseInt(99999999) passait.
    const soundRepeat = Math.min(10, Math.max(0, parseInt(sound_repeat) || 2));
    const soundBefore = Math.min(1440, Math.max(0, parseInt(sound_rdv_before) || 15));

    // Filtre strict des délais : whitelist numérique et bornes 1-10080 min (7j).
    const sanitizeDelays = (raw, def) => {
      const arr = Array.isArray(raw) ? raw : String(raw || def).split(',');
      const clean = arr.map(d => parseInt(d, 10))
        .filter(d => Number.isFinite(d) && d > 0 && d <= 10080);
      return (clean.length ? clean : [parseInt(def, 10)]).join(',');
    };
    const delaysStr    = sanitizeDelays(reminder_delays,          '1440');
    const empDelaysStr = sanitizeDelays(employee_reminder_delays,   '60');

    const { rows } = await pool.query(
      `INSERT INTO notification_settings
        (user_id, daily_recap_enabled, daily_recap_time, daily_recap_email,
         reminder_enabled, reminder_delays,
         employee_reminder_enabled, employee_reminder_delays,
         sound_caisse, sound_new_appt, sound_reminder, sound_repeat, sound_rdv_before,
         updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         daily_recap_enabled=$2, daily_recap_time=$3, daily_recap_email=$4,
         reminder_enabled=$5, reminder_delays=$6,
         employee_reminder_enabled=$7, employee_reminder_delays=$8,
         sound_caisse=$9, sound_new_appt=$10, sound_reminder=$11,
         sound_repeat=$12, sound_rdv_before=$13, updated_at=NOW()
       RETURNING *`,
      [req.user.userId,
       daily_recap_enabled ?? false,
       recapTime || '20:00',
       daily_recap_email || null,
       reminder_enabled ?? false,
       delaysStr,
       employee_reminder_enabled ?? false,
       empDelaysStr,
       sound_caisse ?? true,
       sound_new_appt ?? true,
       sound_reminder ?? true,
       soundRepeat,
       soundBefore]
    );
    res.json(rows[0]);
  } catch(e) { console.error('[NOTIF]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── POST /api/notifications/test-recap ──────────────────────────────────────
router.post('/test-recap', async (req, res) => {
  try {
    const { rows: users } = await pool.query(
      `SELECT u.email, u.business_name, ns.daily_recap_email
       FROM users u LEFT JOIN notification_settings ns ON ns.user_id=u.id
       WHERE u.id=$1`, [req.user.userId]);
    if (!users.length) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const today = new Date().toISOString().split('T')[0];
    await triggerDailyRecapForUser(req.user.userId, users[0], today);
    res.json({ ok: true });
  } catch(e) { console.error('[NOTIF]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── Fonction : récap pour 1 user ─────────────────────────────────────────────
async function triggerDailyRecapForUser(userId, user, dateStr) {
  const { rows: txs } = await pool.query(
    `SELECT t.*, e.name as employee_name
     FROM transactions t LEFT JOIN employees e ON e.id=t.employee_id
     WHERE t.user_id=$1 AND t.date=$2 AND t.type='revenue'`,
    [userId, dateStr]
  );
  const ca      = txs.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
  const nbPrest = txs.reduce((s,t) => s+(parseInt(t.qty_total)||1), 0);
  const empCount = {};
  txs.forEach(t => { if (t.employee_name) empCount[t.employee_name] = (empCount[t.employee_name]||0)+(parseInt(t.qty_total)||1); });
  const topEmp = Object.entries(empCount).sort((a,b)=>b[1]-a[1])[0];
  const { rows: rdvs } = await pool.query(
    `SELECT COUNT(*) as cnt FROM appointments WHERE user_id=$1 AND date=$2 AND status IN ('confirmed','completed')`,
    [userId, dateStr]
  );
  const nbRdv = parseInt(rdvs[0]?.cnt || 0);
  const to    = user.daily_recap_email || user.email;
  await sendDailyRecap({ to, businessName: user.business_name, date: dateStr, ca, nbPrest, nbRdv,
    topEmployee: topEmp ? { name: topEmp[0], count: topEmp[1] } : null, transactions: txs.slice(0, 10) });
  await pool.query(
    `INSERT INTO notification_log (user_id, type, meta) VALUES ($1,'daily_recap',$2)`,
    [userId, JSON.stringify({ date: dateStr, ca, nbPrest })]
  );
}

// ── Cron : récaps journaliers ────────────────────────────────────────────────
async function runDailyRecaps() {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.business_name, ns.daily_recap_email, ns.daily_recap_time
       FROM notification_settings ns JOIN users u ON u.id=ns.user_id
       WHERE ns.daily_recap_enabled=TRUE`
    );
    const today   = new Date().toISOString().split('T')[0];
    const nowHHMM = new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Europe/Paris' });
    for (const user of rows) {
      const t = (user.daily_recap_time || '20:00').substring(0,5);
      if (t === nowHHMM) {
        const { rows: logs } = await pool.query(
          `SELECT id FROM notification_log WHERE user_id=$1 AND type='daily_recap' AND sent_at::date=CURRENT_DATE`, [user.id]);
        if (!logs.length) await triggerDailyRecapForUser(user.id, user, today);
      }
    }
    // #21 : purge app_notifications > 90 jours. Garde un historique consultable
    // sans faire grossir la table indéfiniment. S'exécute une fois par cron
    // (toutes les minutes mais cheap sur une table vide / peu vieille).
    // Bonus : purge notification_log > 60 jours pour même raison.
    await pool.query(
      `DELETE FROM app_notifications WHERE created_at < NOW() - INTERVAL '90 days'`
    ).catch(() => {});
    await pool.query(
      `DELETE FROM notification_log WHERE sent_at < NOW() - INTERVAL '60 days'`
    ).catch(() => {});
  } catch(e) { console.error('[CRON RECAP]', e.message); }
}

// ── Clé unique pour un rappel : évite les doublons ──────────────────────────
function reminderKey(apptId, delayMin) {
  return `rdv_reminder_${apptId}_${delayMin}m`;
}

// ── Cron : rappels RDV clients (multi-délais) ────────────────────────────────
async function runRdvReminders() {
  try {
    const { rows: configs } = await pool.query(
      `SELECT u.id as user_id, u.business_name,
              ns.reminder_delays
       FROM notification_settings ns JOIN users u ON u.id=ns.user_id
       WHERE ns.reminder_enabled=TRUE`
    );

    for (const cfg of configs) {
      // Parser les délais (minutes)
      const delays = String(cfg.reminder_delays || '1440')
        .split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d > 0);

      for (const delayMin of delays) {
        // Trouver les RDV confirmés dont le début est exactement dans ~delayMin minutes
        // Fenêtre : [delayMin-1, delayMin+1] minutes pour tolérer le cron à 60s.
        // #10 : dedup via meta (delay_min + appointment_id) au lieu du filtre
        // type littéral qui ne matchait jamais (type réel contient un uuid).
        const { rows: appts } = await pool.query(
          `SELECT a.*, bs.name as service_name, e.name as employee_name
           FROM appointments a
           LEFT JOIN booking_services bs ON bs.id=a.service_id
           LEFT JOIN employees e ON e.id=a.employee_id
           WHERE a.user_id=$1 AND a.status='confirmed'
             AND a.client_email IS NOT NULL
             AND (a.date::text || ' ' || a.start_time::text)::timestamptz
                 BETWEEN NOW() + ($2 || ' minutes')::interval - interval '1 minute'
                 AND     NOW() + ($2 || ' minutes')::interval + interval '1 minute'
             AND NOT EXISTS (
               SELECT 1 FROM notification_log nl
               WHERE nl.user_id=$1
                 AND nl.meta->>'appointment_id'=a.id::text
                 AND (nl.meta->>'delay_min')::int = $2
             )`,
          [cfg.user_id, delayMin]
        );

        for (const appt of appts) {
          const logType = reminderKey(appt.id, delayMin);
          // Double-check que ce rappel précis n'a pas été envoyé
          const { rows: already } = await pool.query(
            `SELECT id FROM notification_log WHERE user_id=$1 AND type=$2`, [cfg.user_id, logType]);
          if (already.length) continue;

          let hoursBeforeLabel;
          if (delayMin < 60)        hoursBeforeLabel = `${delayMin} min`;
          else if (delayMin < 1440) hoursBeforeLabel = `${delayMin/60}h`;
          else                       hoursBeforeLabel = `${Math.round(delayMin/1440)} jour(s)`;

          await sendRdvReminder({
            to: appt.client_email,
            clientName: appt.client_name,
            businessName: cfg.business_name,
            serviceName: appt.service_name || 'Votre rendez-vous',
            date: typeof appt.date === 'string' ? appt.date : appt.date.toISOString().split('T')[0],
            startTime: appt.start_time,
            hoursBeforeLabel,
          });
          // #12 : push + in-app au commerçant (abonnement, badge, sound).
          // Non-bloquant — l'email est déjà envoyé, on n'empêche pas le log
          // si le push échoue (ex: pas d'abonnement actif).
          notifyAppointmentReminder(cfg.user_id, appt, delayMin).catch(e =>
            console.warn('[RDV REMINDER push]', e.message)
          );
          await pool.query(
            `INSERT INTO notification_log (user_id, type, meta) VALUES ($1,$2,$3)`,
            [cfg.user_id, logType, JSON.stringify({ appointment_id: appt.id, delay_min: delayMin })]
          );
          console.log(`[RDV REMINDER] ${hoursBeforeLabel} avant → ${appt.client_email}`);
        }
      }
    }
  } catch(e) { console.error('[CRON RDV REMINDER]', e.message); }
}

// ── Cron : rappels employés ───────────────────────────────────────────────────
async function runEmployeeReminders() {
  try {
    const { rows: configs } = await pool.query(
      `SELECT u.id as user_id, u.business_name,
              ns.employee_reminder_delays
       FROM notification_settings ns JOIN users u ON u.id=ns.user_id
       WHERE ns.employee_reminder_enabled=TRUE`
    );

    for (const cfg of configs) {
      const delays = String(cfg.employee_reminder_delays || '60')
        .split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d > 0);

      for (const delayMin of delays) {
        // #11 : NOT EXISTS inline pour éviter N round-trips dans la boucle.
        // Dedup via meta (delay_min + appointment_id + type-prefix).
        const { rows: appts } = await pool.query(
          `SELECT a.*, bs.name as service_name, e.name as employee_name, e.email as employee_email
           FROM appointments a
           LEFT JOIN booking_services bs ON bs.id=a.service_id
           LEFT JOIN employees e ON e.id=a.employee_id
           WHERE a.user_id=$1 AND a.status='confirmed'
             AND e.email IS NOT NULL AND e.email != ''
             AND (a.date::text || ' ' || a.start_time::text)::timestamptz
                 BETWEEN NOW() + ($2 || ' minutes')::interval - interval '1 minute'
                 AND     NOW() + ($2 || ' minutes')::interval + interval '1 minute'
             AND NOT EXISTS (
               SELECT 1 FROM notification_log nl
               WHERE nl.user_id=$1
                 AND nl.type LIKE 'emp_reminder_%'
                 AND nl.meta->>'appointment_id'=a.id::text
                 AND (nl.meta->>'delay_min')::int = $2
             )`,
          [cfg.user_id, delayMin]
        );

        for (const appt of appts) {
          const logType = `emp_reminder_${appt.id}_${delayMin}m`;
          // Filet de sécurité (race du cron) — peu coûteux
          const { rows: already } = await pool.query(
            `SELECT id FROM notification_log WHERE user_id=$1 AND type=$2`, [cfg.user_id, logType]);
          if (already.length) continue;

          await sendEmployeeReminder({
            to:           appt.employee_email,
            employeeName: appt.employee_name,
            clientName:   appt.client_name,
            businessName: cfg.business_name,
            serviceName:  appt.service_name || 'Prestation',
            date:         typeof appt.date === 'string' ? appt.date : appt.date.toISOString().split('T')[0],
            startTime:    appt.start_time,
            minutesBefore: delayMin,
          });
          await pool.query(
            `INSERT INTO notification_log (user_id, type, meta) VALUES ($1,$2,$3)`,
            [cfg.user_id, logType, JSON.stringify({ appointment_id: appt.id, delay_min: delayMin })]
          );
          console.log(`[EMP REMINDER] ${delayMin}min avant → ${appt.employee_email}`);
        }
      }
    }
  } catch(e) { console.error('[CRON EMP REMINDER]', e.message); }
}

module.exports = { router, runDailyRecaps, runRdvReminders, runEmployeeReminders };

// ════════════════════════════════════════════════════════════════════════════
// WEB PUSH & NOTIFICATIONS IN-APP
// ════════════════════════════════════════════════════════════════════════════
const { savePushSubscription, deletePushSubscription, createAppNotification } = require('../utils/push');

// ── GET /api/notifications/vapid-public-key ──────────────────────────────────
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// ── POST /api/notifications/push-subscribe ───────────────────────────────────
router.post('/push-subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Abonnement invalide.' });
    await savePushSubscription(req.user.userId, subscription, req.headers['user-agent'] || '');
    res.json({ ok: true });
  } catch(e) {
    if (e.code === 'ENDPOINT_OWNED') {
      return res.status(409).json({ error: 'Cet endpoint est déjà enregistré pour un autre compte.', code: 'ENDPOINT_OWNED' });
    }
    console.error('[PUSH SUB]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── DELETE /api/notifications/push-subscribe ─────────────────────────────────
// #2 : filtre ownership — un user ne peut supprimer QUE ses propres subs.
router.delete('/push-subscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) await deletePushSubscription(endpoint, req.user.userId);
    res.json({ ok: true });
  } catch(e) { console.error('[NOTIF]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/notifications/inapp ─────────────────────────────────────────────
// Retourne les notifications in-app récentes (non lues en premier).
// #14 : unread_count calculé par SELECT COUNT dédié (pas limité par la
// pagination) — avant le count était plafonné à 50 si l'user avait 200
// notifs non-lues.
router.get('/inapp', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const [{ rows }, { rows: c }] = await Promise.all([
      pool.query(
        `SELECT * FROM app_notifications
         WHERE user_id=$1
         ORDER BY is_read ASC, created_at DESC
         LIMIT $2`,
        [req.user.userId, limit]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n FROM app_notifications
         WHERE user_id=$1 AND is_read=FALSE`,
        [req.user.userId]
      ),
    ]);
    res.json({ notifications: rows, unread_count: c[0]?.n || 0 });
  } catch(e) { console.error('[NOTIF]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── PATCH /api/notifications/inapp/read ──────────────────────────────────────
// Marquer une ou toutes les notifs comme lues
router.patch('/inapp/read', async (req, res) => {
  try {
    const { id, all } = req.body;
    if (all) {
      await pool.query('UPDATE app_notifications SET is_read=TRUE WHERE user_id=$1', [req.user.userId]);
    } else if (id) {
      await pool.query('UPDATE app_notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2', [id, req.user.userId]);
    }
    res.json({ ok: true });
  } catch(e) { console.error('[NOTIF]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── DELETE /api/notifications/inapp/:id ──────────────────────────────────────
router.delete('/inapp/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM app_notifications WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch(e) { console.error('[NOTIF]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});
