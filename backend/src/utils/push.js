// src/utils/push.js — Web Push VAPID + notifications in-app
'use strict';
const webpush = require('web-push');
const { pool } = require('../db');

// #17 : validation au boot — log clair si clés manquantes (au lieu de
// crash différé au premier envoi). Ne crash pas l'app : les autres features
// peuvent tourner sans push.
const VAPID_EMAIL   = process.env.VAPID_EMAIL || process.env.VAPID_SUBJECT || 'mailto:admin@flowfinances.app';
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const PUSH_ENABLED  = !!(VAPID_PUBLIC && VAPID_PRIVATE);
if (!PUSH_ENABLED) {
  console.warn('[PUSH] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY absentes — push désactivé');
} else {
  try {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (e) {
    console.error('[PUSH] Clés VAPID invalides:', e.message);
  }
}
// #22 : TTL par défaut 1h pour les notifs temps-réel (new appt, reminders).
// Au-delà, inutile de livrer une notif périmée si le device était offline.
const PUSH_TTL_SECONDS = 60 * 60;

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
  if (!PUSH_ENABLED) return [];
  const { rows } = await pool.query(
    'SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id=$1',
    [userId]
  );
  const results = await Promise.allSettled(
    rows.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify(payload),
        { TTL: PUSH_TTL_SECONDS, urgency: 'high' }
      ).catch(async err => {
        // 410 Gone / 404 Not Found / 403 Forbidden = abonnement invalide/
        // revoqué. On supprime (scope user pour défense en profondeur,
        // l'endpoint vient déjà de WHERE user_id).
        if ([410, 404, 403].includes(err.statusCode)) {
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
// #3 RGPD : le payload PUSH minimise les données visibles sur l'écran de
// verrouillage (téléphone posé sur le comptoir = exposition publique).
// Nom du client et nom du service ne sont PAS dans le title/body visibles —
// uniquement l'heure. Les détails complets sont passés dans data (consultés
// par l'app une fois ouverte, donc authentifié).
// Le contenu IN-APP garde les détails (affichage protégé par login).
async function notifyNewAppointment(userId, appt) {
  const timeStr = String(appt.start_time || '').substring(0, 5);
  // Titre in-app (complet, affiché dans l'app loggée)
  const appTitle = `📅 Nouveau RDV — ${appt.client_name || 'Client'}`;
  const appBody  = `${appt.service_name || 'RDV'} le ${appt.date} à ${timeStr}`;
  // Titre push (minifié pour lock-screen, pas d'info perso)
  const pushTitle = '📅 Nouveau rendez-vous';
  const pushBody  = timeStr ? `Créneau ${timeStr} — ouvrez l'agenda pour les détails` : 'Ouvrez l\'agenda pour les détails';

  // 1. In-app (détails complets)
  await createAppNotification(userId, { type: 'new_appointment', title: appTitle, body: appBody, data: { appointment_id: appt.id } });

  // 2. Push (minifié)
  try {
    await sendPushToUser(userId, {
      type: 'new_appointment',
      title: pushTitle,
      body:  pushBody,
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
  const timeStr = String(appt.start_time || '').substring(0, 5);
  const appTitle = `⏰ Rappel RDV ${label}`;
  const appBody  = `${appt.client_name || 'Client'} — ${appt.service_name || 'RDV'} à ${timeStr}`;
  const pushTitle = `⏰ Rendez-vous ${label}`;
  const pushBody  = timeStr ? `Créneau ${timeStr} — détails dans l'agenda` : "Détails dans l'agenda";

  await createAppNotification(userId, { type: 'appointment_reminder', title: appTitle, body: appBody, data: { appointment_id: appt.id } });

  try {
    await sendPushToUser(userId, {
      type: 'appointment_reminder',
      title: pushTitle,
      body:  pushBody,
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
