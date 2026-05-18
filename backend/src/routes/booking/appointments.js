// src/routes/booking/appointments.js — Rendez-vous (vue commerçant)
// GET /appointments, POST /appointments, PUT /appointments/:id, DELETE /appointments/:id
const { pool } = require('../../db');
const { sendAppointmentConfirmation, sendAppointmentCancellation } = require('../../utils/email');
const { requireQuota } = require('../../middleware/requireQuota');

module.exports = function attachAppointmentsRoutes(router) {
  // ══════════════════════════════════════════════════════════
  // RENDEZ-VOUS (vue commerçant)
  // ══════════════════════════════════════════════════════════

  router.get('/appointments', async (req, res) => {
    try {
      const { date, from, to, employee_id, status } = req.query;
      let q = `SELECT a.id, a.user_id, a.service_id, a.employee_id, a.client_id,
        a.client_name, a.client_email, a.client_phone,
        TO_CHAR(a.date, 'YYYY-MM-DD') as date,
        TO_CHAR(a.start_time, 'HH24:MI') as start_time,
        TO_CHAR(a.end_time,   'HH24:MI') as end_time,
        a.duration_minutes, a.total_duration, a.total_amount, a.status, a.notes, a.cancel_reason,
        a.cancelled_by, a.cancelled_at,
        a.paid, a.paid_method, a.transaction_id,
        a.promo_code_id, a.promo_code, a.discount_amount, a.original_amount,
        a.source, a.created_by_employee_id,
        a.stripe_payment_intent_id, a.payment_status, a.paid_amount_cents, a.paid_at,
        a.created_at, a.updated_at,
        bs.name as service_name, bs.color as service_color, bs.price as service_price, bs.duration_minutes as svc_duration,
        e.name as employee_name, e.avatar_color as employee_color, e.can_cancel, e.can_modify, e.can_encash,
        ru.id as referral_use_id, ru.status as referral_status,
        rc.code as referral_code, rc.owner_client_email as referral_parrain_email,
        pca.first_name as referral_parrain_first_name,
        pca.last_name  as referral_parrain_last_name
        FROM appointments a
        LEFT JOIN booking_services bs ON bs.id = a.service_id
        LEFT JOIN employees e ON e.id = a.employee_id
        LEFT JOIN referral_uses ru ON ru.appointment_id = a.id
        LEFT JOIN referral_codes rc ON rc.id = ru.referral_code_id
        LEFT JOIN client_accounts pca
          ON pca.user_id = a.user_id
         AND LOWER(pca.email) = LOWER(rc.owner_client_email)
        WHERE a.user_id=$1`;
      const params = [req.user.userId];
      if (date)        { params.push(date);        q += ` AND a.date=$${params.length}`; }
      if (from)        { params.push(from);        q += ` AND a.date>=$${params.length}`; }
      if (to)          { params.push(to);          q += ` AND a.date<=$${params.length}`; }
      if (employee_id) { params.push(employee_id); q += ` AND a.employee_id=$${params.length}`; }
      if (status)      { params.push(status);      q += ` AND a.status=$${params.length}`; }
      q += ' ORDER BY a.date, a.start_time';
      const { rows } = await pool.query(q, params);
      // Charger les items pour chaque RDV
      const apptIds = rows.map(r => r.id);
      let itemsMap = {};
      if (apptIds.length > 0) {
        const { rows: items } = await pool.query(
          `SELECT * FROM appointment_items WHERE appointment_id = ANY($1::uuid[]) ORDER BY created_at`,
          [apptIds]
        );
        items.forEach(it => {
          if (!itemsMap[it.appointment_id]) itemsMap[it.appointment_id] = [];
          itemsMap[it.appointment_id].push(it);
        });
      }
      res.json(rows.map(r => ({ ...r, items: itemsMap[r.id] || [] })));
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // Quota mensuel : Decouverte=50 RDV/mois. Essentiel/Equipe illimite.
  // Cf. requireQuota.js. Le middleware est attache directement sur la route
  // POST (pas via router.use) pour ne pas affecter GET/PUT/DELETE.
  router.post('/appointments', requireQuota('appointment'), async (req, res) => {
    try {
      const { service_id, employee_id, client_name, client_email, client_phone, date, start_time, notes,
              force } = req.body;
      if (!client_name || !date || !start_time) return res.status(400).json({ error: 'Données manquantes.' });
      // Calcul end_time + validation durée (AUDIT #14)
      let duration = 30;
      if (service_id) {
        const { rows: svc } = await pool.query('SELECT duration_minutes FROM booking_services WHERE id=$1', [service_id]);
        if (svc.length) duration = svc[0].duration_minutes;
      }
      if (!Number.isFinite(duration) || duration < 1 || duration > 480) {
        return res.status(400).json({ error: 'Durée invalide (1-480 min).' });
      }
      const [h, m] = start_time.split(':').map(Number);
      const endMin = h * 60 + m + duration;
      if (endMin >= 24 * 60) {
        return res.status(400).json({ error: 'Le créneau dépasse minuit.', code: 'SLOT_OVERFLOW' });
      }
      const end_time = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;

      // AUDIT #12 : check conflit (RDV overlap) + absence côté merchant.
      // Le merchant peut forcer via { force: true } (cas override volontaire).
      if (!force && employee_id) {
        const { rows: conflict } = await pool.query(
          `SELECT id, start_time, end_time, client_name FROM appointments
            WHERE user_id=$1 AND employee_id=$2 AND date=$3
              AND status NOT IN ('cancelled','no_show')
              AND NOT (end_time <= $4::time OR start_time >= $5::time)
            LIMIT 1`,
          [req.user.userId, employee_id, date, start_time, end_time]
        );
        if (conflict.length) {
          return res.status(409).json({
            error: `Conflit avec un autre RDV (${String(conflict[0].start_time).slice(0,5)}-${String(conflict[0].end_time).slice(0,5)} ${conflict[0].client_name || ''}).`,
            code: 'SLOT_CONFLICT',
            conflict_id: conflict[0].id,
          });
        }
        // AUDIT #11 : absences.cancelled_at filtré (corrigé ici et sur booking.js:712).
        const { rows: abs } = await pool.query(
          `SELECT 1 FROM employee_absences
            WHERE employee_id=$1 AND cancelled_at IS NULL
              AND $2::date BETWEEN start_date AND end_date LIMIT 1`,
          [employee_id, date]
        );
        if (abs.length) {
          return res.status(409).json({ error: 'Employé en absence sur cette date.', code: 'EMPLOYEE_ABSENT' });
        }
      }

      // Commit 25 — source='admin' : créé par le commerçant en mode admin
      // (req.user.userId, JWT scope merchant). created_by_employee_id NULL.
      const { rows } = await pool.query(
        `INSERT INTO appointments (user_id, service_id, employee_id, client_name, client_email, client_phone, date, start_time, end_time, duration_minutes, notes, status, source, created_by_employee_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'confirmed','admin',NULL)
         RETURNING id, user_id, service_id, employee_id,
           client_name, client_email, client_phone,
           TO_CHAR(date, 'YYYY-MM-DD') as date,
           TO_CHAR(start_time, 'HH24:MI') as start_time,
           TO_CHAR(end_time,   'HH24:MI') as end_time,
           duration_minutes, status, notes, cancel_reason, created_at, source`,
        [req.user.userId, service_id || null, employee_id || null,
         client_name, client_email || null, client_phone || null,
         date, start_time, end_time, duration, notes || null]
      );
      const appt = rows[0];

      // Lier le RDV au client_accounts (chercher par email, téléphone ou nom)
      // → le client verra ce RDV dans son espace "Mes RDV"
      try {
        const uid = req.user.userId;
        const emailLow = (client_email||'').toLowerCase().trim();
        const nameParts = (client_name||'').trim().split(/\s+/);
        const firstName = nameParts[0]||'Client';
        const lastName  = nameParts.slice(1).join(' ')||'';
        let localClient = null;

        // Chercher par email d'abord
        if (emailLow) {
          const r = await pool.query(
            'SELECT id FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2',
            [uid, emailLow]
          );
          localClient = r.rows[0] || null;
        }
        // Sinon par téléphone
        if (!localClient && client_phone) {
          const r = await pool.query(
            'SELECT id FROM client_accounts WHERE user_id=$1 AND phone=$2',
            [uid, client_phone]
          );
          localClient = r.rows[0] || null;
        }
        // Créer la fiche si inexistante
        if (!localClient && (emailLow || client_name)) {
          const r = await pool.query(
            `INSERT INTO client_accounts (user_id, email, first_name, last_name, phone)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (user_id, email) DO UPDATE SET
               first_name = COALESCE(NULLIF(EXCLUDED.first_name,''), client_accounts.first_name)
             RETURNING id`,
            [uid, emailLow||`${Date.now()}@interne`, firstName, lastName, client_phone||null]
          );
          localClient = r.rows[0] || null;
        }
        // Lier le RDV à la fiche locale + tenter liaison global
        if (localClient) {
          await pool.query('UPDATE appointments SET client_id=$1 WHERE id=$2', [localClient.id, appt.id]);
          appt.client_id = localClient.id;
          // Tenter liaison global (client a peut-être un compte plateforme)
          if (emailLow) {
            const gc = await pool.query(
              'SELECT id, first_name, last_name, phone FROM global_clients WHERE LOWER(email)=$1 AND is_verified=TRUE',
              [emailLow]
            );
            if (gc.rows[0]) {
              await pool.query(
                `UPDATE client_accounts SET global_client_id=$1, first_name=$2, last_name=COALESCE(NULLIF($3,''),last_name), phone=COALESCE(NULLIF($4,''),phone) WHERE id=$5`,
                [gc.rows[0].id, gc.rows[0].first_name, gc.rows[0].last_name||'', gc.rows[0].phone||'', localClient.id]
              );
            }
          }
        }
      } catch(linkErr) { console.warn('[link client]', linkErr.message); }

      // Email confirmation si email fourni
      if (client_email) {
        try {
          const [sR, eR, uR, bR] = await Promise.all([
            pool.query('SELECT name, price FROM booking_services WHERE id=$1', [service_id]),
            pool.query('SELECT name FROM employees WHERE id=$1', [employee_id]),
            pool.query('SELECT business_name FROM users WHERE id=$1', [req.user.userId]),
            pool.query('SELECT slug FROM booking_settings WHERE user_id=$1', [req.user.userId]),
          ]);
          const { bookingPageUrl } = require('../../utils/publicUrl');
          const bookingUrl = bR.rows[0]?.slug ? bookingPageUrl(bR.rows[0].slug) : '';
          const emailPrice = sR.rows[0]?.price ? parseFloat(sR.rows[0].price) : null;
          setImmediate(() => sendAppointmentConfirmation({ to: client_email, clientName: client_name, businessName: uR.rows[0]?.business_name || '', serviceName: sR.rows[0]?.name || 'Service', employeeName: eR.rows[0]?.name || null, date, startTime: start_time, endTime: end_time, durationMinutes: duration, price: emailPrice, notes: notes||null, appointmentId: appt.id, bookingUrl, }).catch(e => console.error('[EMAIL]', e.message)));
        } catch(me){ console.error('[MAIL CONF]', me.message); }
      }
      res.status(201).json(appt);

      // Google Calendar sync (non-bloquant)
      try {
        const [sR, eR, uR, bsR] = await Promise.all([
          pool.query('SELECT name FROM booking_services WHERE id=$1', [service_id]),
          employee_id ? pool.query('SELECT name FROM employees WHERE id=$1', [employee_id]) : Promise.resolve({ rows: [] }),
          pool.query('SELECT business_name FROM users WHERE id=$1', [req.user.userId]),
          pool.query("SELECT COALESCE(timezone, 'Europe/Paris') as tz FROM booking_settings WHERE user_id=$1", [req.user.userId]),
        ]);
        const { pushAppointment } = require('../../utils/googleCalendar');
        pushAppointment(req.user.userId, { ...appt, status: 'confirmed' }, {
          businessName: uR.rows[0]?.business_name,
          serviceName:  sR.rows[0]?.name,
          employeeName: eR.rows[0]?.name || null,
          timezone:     bsR.rows[0]?.tz || 'Europe/Paris',
        }).catch(err => console.warn('[gcal push merchant]', err.message));
      } catch (gcErr) { console.warn('[gcal lookup]', gcErr.message); }
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  router.put('/appointments/:id', async (req, res) => {
    try {
      const { status, notes, cancel_reason, date, start_time, employee_id, service_id,
              acting_employee_id } = req.body;
      const cur = await pool.query('SELECT * FROM appointments WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
      if (!cur.rows.length) return res.status(404).json({ error: 'RDV introuvable.' });
      const appt = cur.rows[0];
      // AUDIT perms #2 : check can_cancel / can_modify.
      // Source de vérité : req.employee (header x-employee-pin) > body.acting_employee_id.
      const actingEmp = req.employee || (acting_employee_id ? await (async () => {
        const { rows: empR } = await pool.query(
          'SELECT id, can_cancel, can_modify FROM employees WHERE id=$1 AND user_id=$2',
          [acting_employee_id, req.user.userId]
        );
        return empR[0] || null;
      })() : null);
      if (actingEmp) {
        const isCancelling = status === 'cancelled' && appt.status !== 'cancelled';
        const isModifying  = (date !== undefined && date !== appt.date)
                          || (start_time !== undefined && start_time !== appt.start_time)
                          || (service_id !== undefined && service_id !== appt.service_id)
                          || (employee_id !== undefined && employee_id !== appt.employee_id);
        if (isCancelling && !actingEmp.can_cancel) {
          return res.status(403).json({ error: "Cet employé n'a pas la permission d'annuler les RDV.", code: 'NO_CANCEL_PERMISSION' });
        }
        if (isModifying && !actingEmp.can_modify) {
          return res.status(403).json({ error: "Cet employé n'a pas la permission de modifier les RDV.", code: 'NO_MODIFY_PERMISSION' });
        }
      }
      let duration = appt.duration_minutes;
      if (service_id) {
        const { rows: svc } = await pool.query('SELECT duration_minutes FROM booking_services WHERE id=$1', [service_id]);
        if (svc.length) duration = svc[0].duration_minutes;
      }
      if (!Number.isFinite(duration) || duration < 1 || duration > 480) {
        return res.status(400).json({ error: 'Durée invalide (1-480 min).' });
      }
      const st = start_time || appt.start_time;
      const [h, m] = st.split(':').map(Number);
      const endMin = h * 60 + m + duration;
      if (endMin >= 24 * 60) {
        return res.status(400).json({ error: 'Le créneau dépasse minuit.', code: 'SLOT_OVERFLOW' });
      }
      const end_time = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;

      // AUDIT #13 : si reprogrammation (date/time/employee change), vérifier
      // qu'il n'y a pas de conflit. Exclut le RDV lui-même (id<>$1).
      const newDate       = date       !== undefined ? date       : appt.date;
      const newEmployeeId = employee_id !== undefined ? employee_id : appt.employee_id;
      const isReprogramming = (start_time !== undefined && start_time !== appt.start_time)
                           || (date       !== undefined && date       !== appt.date)
                           || (service_id !== undefined && service_id !== appt.service_id)
                           || (employee_id !== undefined && employee_id !== appt.employee_id);
      if (isReprogramming && newEmployeeId && status !== 'cancelled' && !req.body.force) {
        const { rows: conflict } = await pool.query(
          `SELECT id, start_time, end_time, client_name FROM appointments
            WHERE id<>$1 AND user_id=$2 AND employee_id=$3 AND date=$4
              AND status NOT IN ('cancelled','no_show')
              AND NOT (end_time <= $5::time OR start_time >= $6::time)
            LIMIT 1`,
          [req.params.id, req.user.userId, newEmployeeId, newDate, st, end_time]
        );
        if (conflict.length) {
          return res.status(409).json({
            error: `Conflit avec le RDV ${String(conflict[0].start_time).slice(0,5)}-${String(conflict[0].end_time).slice(0,5)} de ${conflict[0].client_name || 'client'}.`,
            code: 'SLOT_CONFLICT',
            conflict_id: conflict[0].id,
          });
        }
        // Check absence (AUDIT #11)
        const { rows: abs } = await pool.query(
          `SELECT 1 FROM employee_absences
            WHERE employee_id=$1 AND cancelled_at IS NULL
              AND $2::date BETWEEN start_date AND end_date LIMIT 1`,
          [newEmployeeId, newDate]
        );
        if (abs.length) {
          return res.status(409).json({ error: 'Employé en absence sur cette date.', code: 'EMPLOYEE_ABSENT' });
        }
      }
      // Si transition vers 'cancelled', on enregistre QUI a annule (ici =
       // commercant, car endpoint authMiddleware merchant) + le timestamp.
      const isCancellingTransitionA = status === 'cancelled' && appt.status !== 'cancelled';
      const newCancelledBy = isCancellingTransitionA ? 'merchant' : appt.cancelled_by;
      const newCancelledAt = isCancellingTransitionA ? new Date() : appt.cancelled_at;
      const { rows } = await pool.query(
        `UPDATE appointments SET status=$1, notes=$2, cancel_reason=$3, date=$4, start_time=$5, end_time=$6,
         employee_id=$7, service_id=$8, duration_minutes=$9,
         cancelled_by=$12, cancelled_at=$13,
         updated_at=NOW()
         WHERE id=$10 AND user_id=$11
         RETURNING id, user_id, service_id, employee_id, client_id,
           client_name, client_email, client_phone,
           TO_CHAR(date, 'YYYY-MM-DD') as date,
           TO_CHAR(start_time, 'HH24:MI') as start_time,
           TO_CHAR(end_time,   'HH24:MI') as end_time,
           duration_minutes, status, notes, cancel_reason,
           cancelled_by, cancelled_at, created_at, updated_at`,
        [status || appt.status, notes ?? appt.notes, cancel_reason || appt.cancel_reason,
         date || appt.date, st, end_time,
         employee_id !== undefined ? employee_id : appt.employee_id,
         service_id !== undefined ? service_id : appt.service_id,
         duration, req.params.id, req.user.userId,
         newCancelledBy, newCancelledAt]
      );
      const updated = rows[0];

      // ── Auto-refund Stripe Connect si annulation par le commercant d'un
      // RDV paye en ligne. Le commercant ne peut PAS bypasser : la plateforme
      // FlowIA appelle Stripe avec sa cle + l'account_id du merchant via
      // header Stripe-Account, le refund part directement sur le compte
      // connecte. C'est conforme au business : le client ne doit pas perdre
      // d'argent quand le salon ferme. Si Stripe echoue, le row est cree
      // dans failed_refunds pour retry admin (audit Phase 5).
      let refundResult = null;
      const isCancellingTransition = status === 'cancelled' && appt.status !== 'cancelled';
      if (isCancellingTransition
          && appt.payment_status === 'paid'
          && appt.stripe_payment_intent_id) {
        try {
          const { refundAppointment } = require('../../utils/refundAppointment');
          refundResult = await refundAppointment(pool, updated.id, 'merchant_cancelled');
        } catch (refundErr) {
          console.error('[refundAppointment ERR]', refundErr.message);
          refundResult = { ok: false, error: refundErr.message };
        }
      }

      // Mail annulation si status passe à 'cancelled' et client a un email
      if (status === 'cancelled' && updated.client_email) {
        try {
          const [svcR, usrR] = await Promise.all([
            pool.query('SELECT name FROM booking_services WHERE id=$1', [updated.service_id]),
            pool.query('SELECT business_name FROM users WHERE id=$1', [req.user.userId])
          ]);
          setImmediate(() => sendAppointmentCancellation({ to: updated.client_email, clientName: updated.client_name, businessName: usrR.rows[0]?.business_name || 'Le commerce', serviceName: svcR.rows[0]?.name || 'Service', date: updated.date, startTime: updated.start_time, reason: cancel_reason || null, appointmentId: updated.id, }).catch(e => console.error('[EMAIL]', e.message)));
        } catch(me){ console.error('[MAIL ANNUL]', me.message); }
      }
      // Renvoie le RDV mis a jour + le resultat refund si applicable.
      // Si refund.refunded=true, le frontend doit afficher payment_status
      // 'refunded' immediatement (le UPDATE en DB est deja fait par refundAppointment).
      res.json({ ...updated, refund: refundResult,
                 payment_status: refundResult?.refunded ? 'refunded' : appt.payment_status });

      // Google Calendar sync (non-bloquant)
      // - status=cancelled → DELETE event Google
      // - autres changements → PATCH event (date/heure/employé/service)
      try {
        const { rows: meta } = await pool.query(
          `SELECT a.google_event_id, a.google_calendar_id,
                  bs.name AS service_name, e.name AS employee_name,
                  u.business_name,
                  COALESCE(bset.timezone, 'Europe/Paris') AS tz
             FROM appointments a
             LEFT JOIN booking_services bs ON bs.id = a.service_id
             LEFT JOIN employees e ON e.id = a.employee_id
             LEFT JOIN users u ON u.id = a.user_id
             LEFT JOIN booking_settings bset ON bset.user_id = a.user_id
            WHERE a.id=$1`,
          [updated.id]
        );
        const m = meta[0] || {};
        const { updateAppointmentEvent, deleteAppointmentEvent } = require('../../utils/googleCalendar');
        const apptForCal = {
          ...updated,
          google_event_id: m.google_event_id,
          google_calendar_id: m.google_calendar_id,
        };
        if (status === 'cancelled') {
          deleteAppointmentEvent(req.user.userId, apptForCal)
            .catch(err => console.warn('[gcal delete]', err.message));
        } else {
          updateAppointmentEvent(req.user.userId, apptForCal, {
            businessName: m.business_name,
            serviceName:  m.service_name,
            employeeName: m.employee_name,
            timezone:     m.tz,
          }).catch(err => console.warn('[gcal update]', err.message));
        }
      } catch (gcErr) { console.warn('[gcal lookup put]', gcErr.message); }
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  router.delete('/appointments/:id', async (req, res) => {
    try {
      // Recupere google_event_id + etat paiement avant DELETE.
      // - google_event_id : pour nettoyer Google Calendar apres (RDV plus en DB)
      // - payment_status / stripe_payment_intent_id : C1 — un RDV paye en ligne
      //   NE DOIT PAS etre supprime. Le DELETE cascade detruit la row escrow
      //   (appointment_payouts ON DELETE CASCADE) et orpheline le ledger
      //   (financial_ledger.appointment_id ON DELETE SET NULL) : le client
      //   ne serait jamais rembourse + trou comptable. Le bon chemin de
      //   remboursement est l'annulation (PUT status='cancelled' ->
      //   refundAppointment), pas la suppression.
      const { rows: gcalMeta } = await pool.query(
        `SELECT google_event_id, google_calendar_id,
                payment_status, stripe_payment_intent_id
           FROM appointments WHERE id=$1 AND user_id=$2`,
        [req.params.id, req.user.userId]
      );
      if (!gcalMeta.length) return res.status(404).json({ error: 'RDV introuvable.' });
      if (gcalMeta[0].stripe_payment_intent_id) {
        const ps = gcalMeta[0].payment_status;
        if (ps === 'paid') {
          return res.status(409).json({
            error: "Ce RDV a ete paye en ligne. Annulez-le (le remboursement client est automatique) au lieu de le supprimer.",
            code: 'PAID_ONLINE_NO_DELETE',
          });
        }
        // refunded / autre statut avec PI : on conserve le RDV pour la
        // tracabilite comptable (lien ledger / transaction / payout).
        return res.status(409).json({
          error: "Ce RDV est lie a un paiement en ligne et est conserve pour la tracabilite comptable. Il ne peut pas etre supprime.",
          code: 'ONLINE_PAYMENT_KEEP',
        });
      }
      // Cascade parrainage : révoquer les referral_uses liés AVANT le DELETE
      // (ON DELETE SET NULL sur appointment_id sinon on perd la trace).
      const { rows: refs } = await pool.query(
        `SELECT id, parrain_promo_id FROM referral_uses
          WHERE appointment_id=$1 AND user_id=$2`,
        [req.params.id, req.user.userId]
      );
      await pool.query('DELETE FROM appointments WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
      // Google Calendar : delete event si lie (non-bloquant)
      if (gcalMeta[0]?.google_event_id) {
        const { deleteAppointmentEvent } = require('../../utils/googleCalendar');
        deleteAppointmentEvent(req.user.userId, {
          id: req.params.id,
          google_event_id: gcalMeta[0].google_event_id,
          google_calendar_id: gcalMeta[0].google_calendar_id,
        }).catch(err => console.warn('[gcal delete on appt-delete]', err.message));
      }
      for (const ref of refs) {
        try {
          await pool.query(
            `UPDATE referral_uses SET status='cancelled' WHERE id=$1`, [ref.id]
          );
          if (ref.parrain_promo_id) {
            await pool.query(
              `UPDATE promo_codes SET is_active=FALSE WHERE id=$1 AND user_id=$2`,
              [ref.parrain_promo_id, req.user.userId]
            );
            await pool.query(
              `UPDATE client_rewards SET status='cancelled'
                WHERE promo_code_id=$1 AND status='available'`,
              [ref.parrain_promo_id]
            );
          }
        } catch (cErr) { console.warn('[APPT DELETE referral cascade]', cErr.message); }
      }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
