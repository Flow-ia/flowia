// src/routes/global-clients/appointments.js — GET /appointments (multi-commerces)
const { pool } = require('../../db');
const { clientOrGlobalClientAuth } = require('./helpers');

module.exports = function attachAppointmentsRoutes(router) {
  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/global-clients/appointments — tous les RDV multi-commerces.
  // Accepte les 2 scopes : 'global_client' (ff_gc_token, jamais utilisé côté
  // front actuellement) ET 'client' avec globalClientId (ff_client_token issu
  // du login classique ou de Google OAuth). Sans cette tolérance, le front
  // recevait 401 et fallbackait sur l'endpoint scopé commerçant → perte du
  // cross-merchant + perte de business_name.
  // ─────────────────────────────────────────────────────────────────────────────
  router.get('/appointments', clientOrGlobalClientAuth, async (req, res) => {
    try {
      const gcId = req.globalClient.globalClientId;
      const { rows: gc } = await pool.query('SELECT email FROM global_clients WHERE id=$1', [gcId]);
      if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });
      const email = gc[0].email;

      // Champs alignés sur /pub/:slug/client/appointments pour que le
      // frontend puisse réutiliser exactement la même carte + action
      // "Annuler" (qui a besoin du slug). `slug` + `business_name` +
      // u.business_name (table users) ajoutés pour afficher le commerçant
      // sur chaque ligne. Statut : TOUS (upcoming / completed / cancelled
      // / no_show) — filtrage côté UI via getDisplayStatus.
      const { rows } = await pool.query(
        `SELECT a.id, a.status, a.notes, a.paid, a.paid_method,
                a.client_name, a.client_email, a.client_phone, a.cancel_reason,
                -- Tracabilite annulation : qui a annule (merchant/client) + quand.
                -- Utilise par /client/rdv pour afficher 'Annule par le salon' vs
                -- 'Annule par vous' avec le bon contexte refund.
                a.cancelled_by, a.cancelled_at,
                a.discount_amount, a.service_id, a.employee_id, a.client_id,
                TO_CHAR(a.date,       'YYYY-MM-DD') AS date,
                TO_CHAR(a.start_time, 'HH24:MI')    AS start_time,
                TO_CHAR(a.end_time,   'HH24:MI')    AS end_time,
                a.duration_minutes, a.created_at, a.updated_at,
                a.total_amount, a.total_duration,
                -- Statut paiement Stripe Connect : utilise par le frontend
                -- pour la modale d'annulation (preview refund integral / acompte
                -- conserve / pas de paiement) et la pill 'Paye' sur les cartes.
                a.payment_status, a.paid_amount_cents, a.paid_at,
                a.stripe_payment_intent_id,
                bs.name  AS service_name,
                bs.color AS service_color,
                bs.price AS service_price,
                e.name   AS employee_name,
                biz.slug AS slug,
                -- Politique d'annulation du commercant : exposee au client pour
                -- preview refund avant confirmation (CancelApptModal).
                COALESCE(biz.cancellation_policy_hours, 2) AS policy_hours,
                COALESCE(biz.timezone, 'Europe/Paris')     AS merchant_tz,
                u.business_name AS business_name
         FROM appointments a
         LEFT JOIN booking_services bs ON bs.id = a.service_id
         LEFT JOIN employees e         ON e.id  = a.employee_id
         LEFT JOIN booking_settings biz ON biz.user_id = a.user_id
         LEFT JOIN users u             ON u.id  = a.user_id
         WHERE LOWER(a.client_email)=LOWER($1)
         ORDER BY a.date DESC, a.start_time DESC
         LIMIT 200`,
        [email]
      );
      res.json(rows);
    } catch(e) { console.error('[gc]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
