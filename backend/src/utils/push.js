// src/utils/push.js — Web Push VAPID + notifications in-app
'use strict';
const webpush = require('web-push');
const { pool } = require('../db');

// Configurer VAPID une seule fois
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@flowfinances.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ── Enregistrer un abonnement push ───────────────────────────────────────────
async function savePushSubscription(userId, subscription, userAgent = '') {
  const { endpoint, keys: { p256dh, auth } } = subscription;
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent, last_used)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (endpoint) DO UPDATE SET user_id=$1, p256dh=$3, auth_key=$4, last_used=NOW()`,
    [userId, endpoint, p256dh, auth, userAgent]
  );
}

// ── Supprimer un abonnement push ─────────────────────────────────────────────
async function deletePushSubscription(endpoint) {
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [endpoint]);
}

// ── Envoyer une push notification à tous les abonnements d'un user ───────────
async function sendPushToUser(userId, payload) {
  const { rows } = await pool.query(
    'SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id=$1',
    [userId]
  );
  const results = await Promise.allSettled(
    rows.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify(payload)
      ).catch(async err => {
        // 410 Gone = abonnement expiré, on le supprime
        if (err.statusCode === 410 || err.statusCode === 404) {
          await deletePushSubscription(sub.endpoint);
        }
        throw err;
      })
    )
  );
  return results;
}

// ── Créer une notification in-app ────────────────────────────────────────────
async function createAppNotification(userId, { type, title, body, data = {} }) {
  const { rows } = await pool.query(
    `INSERT INTO app_notifications (user_id, type, title, body, data)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [userId, type, title, body || null, JSON.stringify(data)]
  );
  return rows[0];
}

// ── Notifier : nouveau RDV ───────────────────────────────────────────────────
async function notifyNewAppointment(userId, appt) {
  const title = `📅 Nouveau RDV — ${appt.client_name}`;
  const body  = `${appt.service_name || 'RDV'} le ${appt.date} à ${String(appt.start_time).substring(0,5)}`;

  // 1. In-app
  await createAppNotification(userId, { type: 'new_appointment', title, body, data: { appointment_id: appt.id } });

  // 2. Push (si abonnements actifs)
  try {
    await sendPushToUser(userId, {
      type: 'new_appointment',
      title,
      body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { appointment_id: appt.id, url: '/agenda' },
      sound: 'new_appointment',
    });
  } catch {} // silencieux si pas d'abonnements
}

// ── Notifier : rappel RDV ────────────────────────────────────────────────────
async function notifyAppointmentReminder(userId, appt, minutesBefore) {
  const label = minutesBefore < 60
    ? `dans ${minutesBefore} min`
    : minutesBefore < 1440 ? `dans ${minutesBefore / 60}h` : `demain`;
  const title = `⏰ Rappel RDV ${label}`;
  const body  = `${appt.client_name} — ${appt.service_name || 'RDV'} à ${String(appt.start_time).substring(0,5)}`;

  await createAppNotification(userId, { type: 'appointment_reminder', title, body, data: { appointment_id: appt.id } });

  try {
    await sendPushToUser(userId, {
      type: 'appointment_reminder',
      title, body,
      icon: '/icon-192.png',
      data: { appointment_id: appt.id, url: '/agenda' },
      sound: 'reminder',
    });
  } catch {}
}

module.exports = {
  savePushSubscription,
  deletePushSubscription,
  sendPushToUser,
  createAppNotification,
  notifyNewAppointment,
  notifyAppointmentReminder,
};
