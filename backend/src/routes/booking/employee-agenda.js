// src/routes/booking/employee-agenda.js — Agenda employé (RDV assignés, création manuelle)
const { pool } = require('../../db');
const { sendAppointmentConfirmation, sendAppointmentCancellation } = require('../../utils/email');
const { cancelReferralUseByAppt } = require('../referrals');

module.exports = function attachEmployeeAgendaRoutes(router) {
  // ══════════════════════════════════════════════════════════════════════════════
  // AGENDA EMPLOYÉ — RDV de l'employé + création manuelle
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /booking/employee-agenda?employee_id=&from=&to=
  router.get('/employee-agenda', async (req, res) => {
    try {
      const { employee_id, from, to } = req.query;
      if (!employee_id) return res.status(400).json({ error: 'employee_id requis.' });
      const { rows: empR } = await pool.query(
        'SELECT id,name,can_cancel,can_modify,avatar_color FROM employees WHERE id=$1 AND user_id=$2 AND is_active=TRUE',
        [employee_id, req.user.userId]
      );
      if (!empR.length) return res.status(403).json({ error: 'Employé introuvable.' });
      let q = `SELECT a.id, TO_CHAR(a.date,'YYYY-MM-DD') as date,
        TO_CHAR(a.start_time,'HH24:MI') as start_time, TO_CHAR(a.end_time,'HH24:MI') as end_time,
        a.client_name, a.client_email, a.client_phone, a.status, a.notes, a.cancel_reason,
        a.duration_minutes, a.total_duration, a.total_amount, a.service_id, a.employee_id, a.paid, a.paid_method,
        a.promo_code_id, a.promo_code, a.discount_amount, a.original_amount,
        a.source, a.created_by_employee_id,
        a.stripe_payment_intent_id, a.payment_status, a.paid_amount_cents, a.paid_at,
        bs.name as service_name, bs.color as service_color, bs.price as service_price,
        ru.id as referral_use_id, ru.status as referral_status,
        rc.code as referral_code, rc.owner_client_email as referral_parrain_email,
        pca.first_name as referral_parrain_first_name,
        pca.last_name  as referral_parrain_last_name
        FROM appointments a
        LEFT JOIN booking_services bs ON bs.id=a.service_id
        LEFT JOIN referral_uses ru ON ru.appointment_id = a.id
        LEFT JOIN referral_codes rc ON rc.id = ru.referral_code_id
        LEFT JOIN client_accounts pca
          ON pca.user_id = a.user_id
         AND LOWER(pca.email) = LOWER(rc.owner_client_email)
        WHERE a.user_id=$1 AND a.employee_id=$2`;
      const p = [req.user.userId, employee_id];
      if (from) { p.push(from); q += ` AND a.date>=$${p.length}`; }
      if (to)   { p.push(to);   q += ` AND a.date<=$${p.length}`; }
      q += ' ORDER BY a.date, a.start_time';
      const { rows } = await pool.query(q, p);
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
      const appts = rows.map(r => ({ ...r, items: itemsMap[r.id] || [] }));
      res.json({ appointments: appts, employee: empR[0] });
    } catch(e){ console.error('[CHECKOUT ERROR]', e.message); res.status(500).json({ error: e.message || 'Erreur serveur.' }); }
  });

  // POST /booking/employee-agenda/appointments — créer RDV manuellement
  router.post('/employee-agenda/appointments', async (req, res) => {
    try {
      // items = [{service_id, service_name, qty, unit_price, duration_minutes}, ...]
      const { employee_id, client_name, client_email, client_phone, date, start_time, notes,
              items: cartItems, total_amount: totalAmt, total_duration: totalDur, custom_duration } = req.body;
      if (!employee_id || !client_name || !date || !start_time)
        return res.status(400).json({ error: 'employee_id, client_name, date, start_time requis.' });
      const { rows: empR } = await pool.query(
        'SELECT id FROM employees WHERE id=$1 AND user_id=$2 AND is_active=TRUE', [employee_id, req.user.userId]
      );
      if (!empR.length) return res.status(403).json({ error: 'Employé introuvable.' });

      // Vérifier que l'employé n'est pas absent ce jour-là — AUDIT #11 filtre cancelled_at
      const { rows: absR } = await pool.query(
        `SELECT id FROM employee_absences
          WHERE employee_id=$1 AND cancelled_at IS NULL
            AND $2::date BETWEEN start_date AND end_date`,
        [employee_id, date]
      );
      if (absR.length) return res.status(409).json({ error: "L'employé est absent ce jour-là." });

      // Vérifier disponibilité ponctuelle
      const { rows: availR } = await pool.query(
        'SELECT is_available FROM employee_availability WHERE employee_id=$1 AND date=$2',
        [employee_id, date]
      );
      if (availR.length && !availR[0].is_available)
        return res.status(409).json({ error: "L'employé n'est pas disponible ce jour-là." });

      // Calcul durée + fin (en avance pour vérifier les conflits)
      const duration = custom_duration || totalDur || 30;
      const [hh, mm] = start_time.split(':').map(Number);
      const endMinCalc = hh*60 + mm + duration;
      const end_time_calc = `${String(Math.floor(endMinCalc/60)).padStart(2,'0')}:${String(endMinCalc%60).padStart(2,'0')}`;

      // Vérification conflit : l'employé a-t-il déjà un RDV qui chevauche ce créneau ?
      const { rows: conflicts } = await pool.query(
        `SELECT id, TO_CHAR(start_time,'HH24:MI') as st, TO_CHAR(end_time,'HH24:MI') as et
         FROM appointments
         WHERE employee_id=$1 AND date=$2 AND status NOT IN ('cancelled')
           AND start_time < $3::time AND end_time > $4::time`,
        [employee_id, date, end_time_calc, start_time]
      );
      if (conflicts.length > 0) {
        return res.status(409).json({
          error: `L'employé a déjà un RDV de ${conflicts[0].st} à ${conflicts[0].et} sur ce créneau.`
        });
      }

      const totalAmount = parseFloat(totalAmt) || 0;
      const end_time = end_time_calc;

      // Service principal (premier item ou null)
      const firstItem = (cartItems && cartItems.length > 0) ? cartItems[0] : null;
      const mainServiceId = firstItem?.service_id || null;

      // Commit 25 — traçabilité. Si req.employee défini (header x-employee-pin
      // valide via employeePinOptional), source='employee' et created_by =
      // req.employee.id. Sinon (cas rare : merchant qui appelle cette route
      // direct), source='admin' pour rester cohérent.
      const trackedSource = req.employee ? 'employee' : 'admin';
      const trackedBy     = req.employee ? req.employee.id : null;
      const { rows } = await pool.query(
        `INSERT INTO appointments
           (user_id,service_id,employee_id,client_name,client_email,client_phone,date,start_time,end_time,duration_minutes,total_duration,total_amount,notes,status,source,created_by_employee_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'confirmed',$14,$15)
         RETURNING id,TO_CHAR(date,'YYYY-MM-DD') as date,
           TO_CHAR(start_time,'HH24:MI') as start_time,TO_CHAR(end_time,'HH24:MI') as end_time,
           client_name,client_email,client_phone,status,notes,duration_minutes,total_duration,total_amount,service_id,employee_id,created_at,source,created_by_employee_id`,
        [req.user.userId, mainServiceId, employee_id, client_name, client_email||null, client_phone||null,
         date, start_time, end_time, duration, duration, totalAmount, notes||null, trackedSource, trackedBy]
      );
      const appt = rows[0];

      // Insérer les items si présents
      if (cartItems && cartItems.length > 0) {
        for (const it of cartItems) {
          await pool.query(
            `INSERT INTO appointment_items (appointment_id, service_id, service_name, qty, unit_price, duration_minutes)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [appt.id, it.service_id||null, it.service_name, it.qty||1, parseFloat(it.unit_price)||0, it.duration_minutes||0]
          );
        }
        appt.items = cartItems;
      } else {
        appt.items = [];
      }

      // Lier le RDV au client_accounts → le client verra ce RDV dans "Mes RDV"
      try {
        const uid = req.user.userId;
        const emailLow = (client_email||'').toLowerCase().trim();
        const nameParts = (client_name||'').trim().split(/\s+/);
        const firstName = nameParts[0]||'Client';
        const lastName  = nameParts.slice(1).join(' ')||'';
        let localClient = null;

        if (emailLow) {
          const r = await pool.query(
            'SELECT id FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2',
            [uid, emailLow]
          );
          localClient = r.rows[0] || null;
        }
        if (!localClient && client_phone) {
          const r = await pool.query(
            'SELECT id FROM client_accounts WHERE user_id=$1 AND phone=$2',
            [uid, client_phone]
          );
          localClient = r.rows[0] || null;
        }
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
        if (localClient) {
          await pool.query('UPDATE appointments SET client_id=$1 WHERE id=$2', [localClient.id, appt.id]);
          appt.client_id = localClient.id;
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
      } catch(linkErr) { console.warn('[link client emp]', linkErr.message); }

      // Commit 25 — notification commerçant si RDV créé par un employé
      // tablette (in-app + push, PAS d'email pour éviter le spam si beaucoup
      // de walk-ins). Le commerçant voit dans la cloche que l'employé
      // {created_by_employee_name} a créé un RDV.
      if (req.employee) {
        try {
          const empNameLookup = req.employee.name;
          const { notifyNewAppointment } = require('../../utils/push');
          notifyNewAppointment(
            req.user.userId,
            {
              ...appt,
              service_name: cartItems && cartItems[0]?.service_name || null,
              created_by_employee_name: empNameLookup,
            },
            { source: 'employee', withEmail: false }
          ).catch(err => console.warn('[notify new appt employee]', err.message));
        } catch (e) { console.warn('[notify new appt employee]', e.message); }
      }

      // Email confirmation si email fourni
      if (client_email) {
        try {
          const [eR, uR, bR] = await Promise.all([
            pool.query('SELECT name FROM employees WHERE id=$1', [employee_id]),
            pool.query('SELECT business_name FROM users WHERE id=$1', [req.user.userId]),
            pool.query('SELECT slug FROM booking_settings WHERE user_id=$1', [req.user.userId]),
          ]);
          const { bookingPageUrl } = require('../../utils/publicUrl');
          const bookingUrl = bR.rows[0]?.slug ? bookingPageUrl(bR.rows[0].slug) : '';
          const serviceSummary = cartItems && cartItems.length > 0
            ? cartItems.map(it => it.qty > 1 ? `${it.service_name} ×${it.qty}` : it.service_name).join(', ')
            : 'Service';
          setImmediate(() => sendAppointmentConfirmation({ to: client_email, clientName: client_name, businessName: uR.rows[0]?.business_name || '', serviceName: serviceSummary, employeeName: eR.rows[0]?.name || null, date, startTime: start_time, endTime: end_time, durationMinutes: duration, price: totalAmount > 0 ? totalAmount : null, notes: notes||null, appointmentId: appt.id, bookingUrl, items: cartItems && cartItems.length > 0 ? cartItems.map(it => ({ service_name: it.service_name, qty: it.qty||1, unit_price: parseFloat(it.unit_price)||0, duration_minutes: it.duration_minutes||0, })) : null, }).catch(e => console.error('[EMAIL]', e.message)));
        } catch(me){ console.error('[MAIL CONF EMP]', me.message); }
      }
      res.status(201).json(appt);

      // Google Calendar sync (non-bloquant)
      try {
        const [empR, usrR, bsR] = await Promise.all([
          pool.query('SELECT name FROM employees WHERE id=$1', [employee_id]),
          pool.query('SELECT business_name FROM users WHERE id=$1', [req.user.userId]),
          pool.query("SELECT COALESCE(timezone, 'Europe/Paris') as tz FROM booking_settings WHERE user_id=$1", [req.user.userId]),
        ]);
        const svcSum = cartItems && cartItems.length > 0
          ? cartItems.map(it => it.qty > 1 ? `${it.service_name} ×${it.qty}` : it.service_name).join(', ')
          : 'Service';
        const { pushAppointment } = require('../../utils/googleCalendar');
        pushAppointment(req.user.userId, { ...appt, status: 'confirmed' }, {
          businessName: usrR.rows[0]?.business_name,
          serviceName:  svcSum,
          employeeName: empR.rows[0]?.name || null,
          timezone:     bsR.rows[0]?.tz || 'Europe/Paris',
        }).catch(err => console.warn('[gcal push emp-agenda]', err.message));
      } catch (gcErr) { console.warn('[gcal lookup emp-agenda]', gcErr.message); }
    } catch(e){ console.error('[CHECKOUT ERROR]', e.message); res.status(500).json({ error: e.message || 'Erreur serveur.' }); }
  });

  // PUT /booking/employee-agenda/appointments/:id — annuler/modifier selon permissions
  router.put('/employee-agenda/appointments/:id', async (req, res) => {
    try {
      const { employee_id, action, cancel_reason, notes, status } = req.body;
      if (!employee_id) return res.status(400).json({ error: 'employee_id requis.' });
      const { rows: empR } = await pool.query(
        'SELECT id,can_cancel,can_modify FROM employees WHERE id=$1 AND user_id=$2 AND is_active=TRUE',
        [employee_id, req.user.userId]
      );
      if (!empR.length) return res.status(403).json({ error: 'Employé introuvable.' });
      const emp = empR[0];
      const { rows: apptR } = await pool.query(
        'SELECT * FROM appointments WHERE id=$1 AND user_id=$2 AND employee_id=$3',
        [req.params.id, req.user.userId, employee_id]
      );
      if (!apptR.length) return res.status(404).json({ error: 'RDV introuvable ou non assigné à cet employé.' });
      const appt = apptR[0];

      if (action === 'cancel') {
        if (!emp.can_cancel) return res.status(403).json({ error: "Vous n'avez pas le droit d'annuler les RDV." });
        const { rows } = await pool.query(
          `UPDATE appointments SET status='cancelled',cancel_reason=$1,updated_at=NOW() WHERE id=$2
           RETURNING id,TO_CHAR(date,'YYYY-MM-DD') as date,TO_CHAR(start_time,'HH24:MI') as start_time,
             TO_CHAR(end_time,'HH24:MI') as end_time,client_name,client_email,status,cancel_reason,service_id`,
          [cancel_reason||"Annulé par l'employé", req.params.id]
        );
        const upd = rows[0];
        // Cascade parrainage : referral_use pending → cancelled
        cancelReferralUseByAppt(req.user.userId, req.params.id);
        if (appt.client_email) {
          try {
            const [sR, uR] = await Promise.all([
              pool.query('SELECT name FROM booking_services WHERE id=$1', [upd.service_id]),
              pool.query('SELECT business_name FROM users WHERE id=$1', [req.user.userId]),
            ]);
            setImmediate(() => sendAppointmentCancellation({ to: appt.client_email, clientName: appt.client_name, businessName: uR.rows[0]?.business_name || '', serviceName: sR.rows[0]?.name || 'Service', date: upd.date, startTime: upd.start_time, reason: cancel_reason||null, appointmentId: req.params.id, }).catch(e => console.error('[EMAIL]', e.message)));
          } catch(me){ console.error('[MAIL ANNUL EMP]', me.message); }
        }
        // Google Calendar : delete event si lié (non-bloquant)
        if (appt.google_event_id) {
          const { deleteAppointmentEvent } = require('../../utils/googleCalendar');
          deleteAppointmentEvent(req.user.userId, {
            id: req.params.id,
            google_event_id: appt.google_event_id,
            google_calendar_id: appt.google_calendar_id,
          }).catch(err => console.warn('[gcal delete emp-cancel]', err.message));
        }
        return res.json(upd);
      }
      if (action === 'modify') {
        if (!emp.can_modify) return res.status(403).json({ error: "Vous n'avez pas le droit de modifier les RDV." });
        const { rows } = await pool.query(
          `UPDATE appointments SET notes=$1,status=$2,updated_at=NOW() WHERE id=$3
           RETURNING id,status,notes,TO_CHAR(date,'YYYY-MM-DD') as date,
             TO_CHAR(start_time,'HH24:MI') as start_time,TO_CHAR(end_time,'HH24:MI') as end_time`,
          [notes ?? appt.notes, status||appt.status, req.params.id]
        );
        return res.json(rows[0]);
      }
      res.status(400).json({ error: 'action invalide (cancel ou modify).' });
    } catch(e){ console.error('[CHECKOUT ERROR]', e.message); res.status(500).json({ error: e.message || 'Erreur serveur.' }); }
  });
};
