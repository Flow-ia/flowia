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
// SÉCURITÉ #1 : rejette la tentative de réassignation d'un endpoint déjà
// possédé par un autre user. Si un attaquant POST un endpoint connu d'un
// tiers, on ne vole pas la sub — on renvoie 409. Seul le propriétaire
// légitime peut renouveler ses keys pour son endpoint.
// #6 : plafond à 10 subscriptions par user (desktop + mobile + tablet x
// navigateurs suffit largement). Au-delà, on purge les plus anciennes.
async function savePushSubscription(userId, subscription, userAgent = '') {
  const { endpoint, keys: { p256dh, auth } } = subscription;
  // Vérif ownership : endpoint déjà pris par un autre user ?
  const { rows: existing } = await pool.query(
    'SELECT user_id FROM push_subscriptions WHERE endpoint=$1',
    [endpoint]
  );
  if (existing.length && existing[0].user_id !== userId) {
    const err = new Error('Endpoint déjà enregistré pour un autre compte.');
    err.code = 'ENDPOINT_OWNED';
    throw err;
  }
  // Upsert limité au couple (user_id, endpoint) — ne peut pas voler une autre sub
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent, last_used)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (endpoint) DO UPDATE SET p256dh=$3, auth_key=$4, user_agent=$5, last_used=NOW()
       WHERE push_subscriptions.user_id = $1`,
    [userId, endpoint, p256dh, auth, userAgent]
  );
  // Plafond 10 subs/user : purge les plus anciens au-delà
  await pool.query(
    `DELETE FROM push_subscriptions
      WHERE user_id=$1 AND id NOT IN (
        SELECT id FROM push_subscriptions WHERE user_id=$1
        ORDER BY last_used DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 10
      )`,
    [userId]
  ).catch(() => {});
}

// ── Supprimer un abonnement push ─────────────────────────────────────────────
// SÉCURITÉ #2 : si userId fourni, filtre par ownership. Le cleanup interne
// (410 Gone, 404) peut appeler sans userId car on sait que l'endpoint est
// invalide globalement.
async function deletePushSubscription(endpoint, userId = null) {
  if (userId) {
    await pool.query(
      'DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2',
      [endpoint, userId]
    );
  } else {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [endpoint]);
  }
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
        // 410 Gone / 404 = abonnement expiré, on supprime (scope user pour
        // la défense en profondeur, l'endpoint vient déjà de WHERE user_id).
        if (err.statusCode === 410 || err.statusCode === 404) {
          await deletePushSubscription(sub.endpoint, userId);
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
