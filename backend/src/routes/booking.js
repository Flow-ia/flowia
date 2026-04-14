// src/routes/booking.js — Routes commerçant (authentifiées)
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// ══════════════════════════════════════════════════════════
// ROUTE PUBLIQUE — vérification slug (AVANT authMiddleware)
// Utilisée aussi bien par l'admin connecté que sans auth
// ══════════════════════════════════════════════════════════

// GET /api/booking/check-slug?slug=mon-salon
router.get('/check-slug', async (req, res) => {
  try {
    const { slug } = req.query;
    if (!slug) return res.status(400).json({ error: 'Slug manquant.' });

    // Validation format
    if (slug.length < 3)
      return res.json({ available: false, reason: 'too_short', message: 'Minimum 3 caractères requis.' });
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]{3,}$/.test(slug))
      return res.json({ available: false, reason: 'invalid_chars', message: 'Uniquement lettres minuscules, chiffres et tirets. Ne peut pas commencer ou finir par un tiret.' });
    if (/--/.test(slug))
      return res.json({ available: false, reason: 'invalid_chars', message: 'Deux tirets consécutifs non autorisés.' });

    // Mots réservés
    const RESERVED = ['admin','api','app','www','mail','ftp','booking','book','login','register','dashboard','settings','static','assets','null','undefined','test','demo','dev'];
    if (RESERVED.includes(slug))
      return res.json({ available: false, reason: 'reserved', message: `"${slug}" est un nom réservé, veuillez en choisir un autre.` });

    // Récupérer l'userId depuis le token si présent (optionnel — pour exclure le proprio)
    let userId = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        userId = decoded.userId;
      }
    } catch (_) { /* token absent ou invalide → userId reste null */ }

    const query  = userId
      ? 'SELECT user_id FROM booking_settings WHERE slug=$1 AND user_id!=$2'
      : 'SELECT user_id FROM booking_settings WHERE slug=$1';
    const params = userId ? [slug, userId] : [slug];
    const { rows } = await pool.query(query, params);

    if (rows.length)
      return res.json({ available: false, reason: 'taken', message: 'Cette adresse de page est déjà utilisée. Merci de modifier votre lien.' });

    res.json({ available: true, slug });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ══════════════════════════════════════════════════════════
// Toutes les routes suivantes sont protégées par auth JWT
// ══════════════════════════════════════════════════════════
router.use(authMiddleware);

const { sendAppointmentConfirmation, sendAppointmentCancellation, sendLoyaltyReward } = require('../utils/email');
const { incrementStamps } = require('../utils/loyalty-utils');

// ══════════════════════════════════════════════════════════
// PARAMÈTRES RÉSERVATION
// ══════════════════════════════════════════════════════════

// GET /api/booking/settings
router.get('/settings', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM booking_settings WHERE user_id=$1', [req.user.userId]
    );
    if (!rows.length) return res.json({ settings: null });
    res.json({ settings: rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/booking/settings
router.post('/settings', async (req, res) => {
  try {
    const { is_enabled, slug, business_description, address, phone, timezone, advance_booking_days, min_notice_hours, require_account, google_business_url } = req.body;
    // Vérifier unicité du slug
    if (slug) {
      const { rows: existing } = await pool.query(
        'SELECT id FROM booking_settings WHERE slug=$1 AND user_id!=$2', [slug, req.user.userId]
      );
      if (existing.length) return res.status(409).json({ error: 'Ce slug est déjà utilisé.' });
    }
    const { rows } = await pool.query(
      `INSERT INTO booking_settings (user_id, is_enabled, slug, business_description, address, phone, timezone, advance_booking_days, min_notice_hours, require_account, google_business_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (user_id) DO UPDATE SET
         is_enabled=$2, slug=$3, business_description=$4, address=$5, phone=$6,
         timezone=$7, advance_booking_days=$8, min_notice_hours=$9, require_account=$10,
         google_business_url=$11, updated_at=NOW()
       RETURNING *`,
      [req.user.userId, is_enabled ?? false, slug || null, business_description || null,
       address || null, phone || null, timezone || 'Europe/Paris',
       advance_booking_days ?? 30, min_notice_hours ?? 1, require_account ?? false,
       google_business_url || null]
    );
    res.json({ settings: rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ══════════════════════════════════════════════════════════
// HORAIRES D'OUVERTURE
// ══════════════════════════════════════════════════════════

router.get('/hours', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM business_hours WHERE user_id=$1 ORDER BY day_of_week', [req.user.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/hours', async (req, res) => {
  try {
    const { hours } = req.body; // [{ day_of_week, open_time, close_time, is_open }]
    if (!Array.isArray(hours)) return res.status(400).json({ error: 'Format invalide.' });
    for (const h of hours) {
      await pool.query(
        `INSERT INTO business_hours (user_id, day_of_week, open_time, close_time, is_open)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, day_of_week) DO UPDATE SET open_time=$3, close_time=$4, is_open=$5`,
        [req.user.userId, h.day_of_week, h.open_time || '09:00', h.close_time || '18:00', h.is_open !== false]
      );
    }
    const { rows } = await pool.query('SELECT * FROM business_hours WHERE user_id=$1 ORDER BY day_of_week', [req.user.userId]);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ══════════════════════════════════════════════════════════
// SERVICES
// ══════════════════════════════════════════════════════════

router.get('/services', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT bs.*, c.name as category_name FROM booking_services bs
       LEFT JOIN categories c ON c.id = bs.category_id
       WHERE bs.user_id=$1 ORDER BY bs.sort_order, bs.created_at`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/services', async (req, res) => {
  try {
    const { name, description, duration_minutes, price, color, category_id, booking_category_id, is_active, sort_order } = req.body;
    if (!name || !duration_minutes) return res.status(400).json({ error: 'Nom et durée requis.' });
    const { rows } = await pool.query(
      `INSERT INTO booking_services (user_id, category_id, booking_category_id, name, description, duration_minutes, price, color, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.userId, category_id || null, booking_category_id || null, name, description || null,
       duration_minutes, price || null, color || '#6366f1', is_active !== false, sort_order || 0]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.put('/services/:id', async (req, res) => {
  try {
    const { name, description, duration_minutes, price, color, category_id, booking_category_id, is_active, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE booking_services SET name=$1, description=$2, duration_minutes=$3, price=$4,
       color=$5, category_id=$6, booking_category_id=$7, is_active=$8, sort_order=$9
       WHERE id=$10 AND user_id=$11 RETURNING *`,
      [name, description || null, duration_minutes, price || null,
       color || '#6366f1', category_id || null, booking_category_id || null,
       is_active !== false, sort_order || 0, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Service introuvable.' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.delete('/services/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM booking_services WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

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
      a.paid, a.paid_method, a.transaction_id,
      a.promo_code_id, a.promo_code, a.discount_amount, a.original_amount,
      a.created_at, a.updated_at,
      bs.name as service_name, bs.color as service_color, bs.price as service_price, bs.duration_minutes as svc_duration,
      e.name as employee_name, e.avatar_color as employee_color, e.can_cancel, e.can_modify, e.can_encash
      FROM appointments a
      LEFT JOIN booking_services bs ON bs.id = a.service_id
      LEFT JOIN employees e ON e.id = a.employee_id
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

router.post('/appointments', async (req, res) => {
  try {
    const { service_id, employee_id, client_name, client_email, client_phone, date, start_time, notes } = req.body;
    if (!client_name || !date || !start_time) return res.status(400).json({ error: 'Données manquantes.' });
    // Calcul end_time
    let duration = 30;
    if (service_id) {
      const { rows: svc } = await pool.query('SELECT duration_minutes FROM booking_services WHERE id=$1', [service_id]);
      if (svc.length) duration = svc[0].duration_minutes;
    }
    const [h, m] = start_time.split(':').map(Number);
    const endMin = h * 60 + m + duration;
    const end_time = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;
    const { rows } = await pool.query(
      `INSERT INTO appointments (user_id, service_id, employee_id, client_name, client_email, client_phone, date, start_time, end_time, duration_minutes, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'confirmed')
       RETURNING id, user_id, service_id, employee_id,
         client_name, client_email, client_phone,
         TO_CHAR(date, 'YYYY-MM-DD') as date,
         TO_CHAR(start_time, 'HH24:MI') as start_time,
         TO_CHAR(end_time,   'HH24:MI') as end_time,
         duration_minutes, status, notes, cancel_reason, created_at`,
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
        const bookingUrl = bR.rows[0]?.slug ? `${process.env.FRONTEND_URL||'http://localhost:5173'}/book/${bR.rows[0].slug}` : '';
        const emailPrice = sR.rows[0]?.price ? parseFloat(sR.rows[0].price) : null;
        setImmediate(() => sendAppointmentConfirmation({ to: client_email, clientName: client_name, businessName: uR.rows[0]?.business_name || '', serviceName: sR.rows[0]?.name || 'Service', employeeName: eR.rows[0]?.name || null, date, startTime: start_time, endTime: end_time, durationMinutes: duration, price: emailPrice, notes: notes||null, appointmentId: appt.id, bookingUrl, }).catch(e => console.error('[EMAIL]', e.message)));
      } catch(me){ console.error('[MAIL CONF]', me.message); }
    }
    res.status(201).json(appt);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.put('/appointments/:id', async (req, res) => {
  try {
    const { status, notes, cancel_reason, date, start_time, employee_id, service_id } = req.body;
    const cur = await pool.query('SELECT * FROM appointments WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    if (!cur.rows.length) return res.status(404).json({ error: 'RDV introuvable.' });
    const appt = cur.rows[0];
    let duration = appt.duration_minutes;
    if (service_id) {
      const { rows: svc } = await pool.query('SELECT duration_minutes FROM booking_services WHERE id=$1', [service_id]);
      if (svc.length) duration = svc[0].duration_minutes;
    }
    const st = start_time || appt.start_time;
    const [h, m] = st.split(':').map(Number);
    const endMin = h * 60 + m + duration;
    const end_time = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;
    const { rows } = await pool.query(
      `UPDATE appointments SET status=$1, notes=$2, cancel_reason=$3, date=$4, start_time=$5, end_time=$6,
       employee_id=$7, service_id=$8, duration_minutes=$9, updated_at=NOW()
       WHERE id=$10 AND user_id=$11
       RETURNING id, user_id, service_id, employee_id, client_id,
         client_name, client_email, client_phone,
         TO_CHAR(date, 'YYYY-MM-DD') as date,
         TO_CHAR(start_time, 'HH24:MI') as start_time,
         TO_CHAR(end_time,   'HH24:MI') as end_time,
         duration_minutes, status, notes, cancel_reason, created_at, updated_at`,
      [status || appt.status, notes ?? appt.notes, cancel_reason || appt.cancel_reason,
       date || appt.date, st, end_time,
       employee_id !== undefined ? employee_id : appt.employee_id,
       service_id !== undefined ? service_id : appt.service_id,
       duration, req.params.id, req.user.userId]
    );
    const updated = rows[0];
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
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.delete('/appointments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM appointments WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ══════════════════════════════════════════════════════════
// CLIENTS
// ══════════════════════════════════════════════════════════

router.get('/clients', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ca.*, COUNT(a.id) as appointment_count
       FROM client_accounts ca
       LEFT JOIN appointments a ON a.client_id = ca.id
       WHERE ca.user_id=$1 GROUP BY ca.id ORDER BY ca.created_at DESC`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ══════════════════════════════════════════════════════════
// DISPONIBILITÉS EMPLOYÉ
// ══════════════════════════════════════════════════════════

router.get('/availability/:employee_id', async (req, res) => {
  try {
    const { from, to } = req.query;
    const { rows } = await pool.query(
      `SELECT * FROM employee_availability WHERE employee_id=$1 AND user_id=$2
       AND date>=$3 AND date<=$4`,
      [req.params.employee_id, req.user.userId, from || new Date().toISOString().split('T')[0],
       to || new Date(Date.now() + 90*24*3600*1000).toISOString().split('T')[0]]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/availability', async (req, res) => {
  try {
    const { employee_id, date, is_available, note } = req.body;
    await pool.query(
      `INSERT INTO employee_availability (employee_id, user_id, date, is_available, note)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (employee_id, date) DO UPDATE SET is_available=$4, note=$5`,
      [employee_id, req.user.userId, date, is_available !== false, note || null]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;

// ── Horaires par employé ──────────────────────────────────────────────────────

router.get('/employee-hours/:employee_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM employee_hours WHERE employee_id=$1 AND user_id=$2 ORDER BY day_of_week',
      [req.params.employee_id, req.user.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/employee-hours/:employee_id', async (req, res) => {
  try {
    const { hours } = req.body; // [{ day_of_week, open_time, close_time, is_open }]
    if (!Array.isArray(hours)) return res.status(400).json({ error: 'Format invalide.' });
    for (const h of hours) {
      await pool.query(
        `INSERT INTO employee_hours (employee_id, user_id, day_of_week, open_time, close_time, is_open)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (employee_id, day_of_week)
         DO UPDATE SET open_time=$4, close_time=$5, is_open=$6`,
        [req.params.employee_id, req.user.userId,
         h.day_of_week, h.open_time||'09:00', h.close_time||'18:00', h.is_open !== false]
      );
    }
    const { rows } = await pool.query(
      'SELECT * FROM employee_hours WHERE employee_id=$1 AND user_id=$2 ORDER BY day_of_week',
      [req.params.employee_id, req.user.userId]
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// DELETE — remet l'employé sur les horaires du commerce
router.delete('/employee-hours/:employee_id', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM employee_hours WHERE employee_id=$1 AND user_id=$2',
      [req.params.employee_id, req.user.userId]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ══════════════════════════════════════════════════════════
// HORAIRES PAR EMPLOYÉ
// ══════════════════════════════════════════════════════════

// GET /api/booking/employee-hours/:employee_id
router.get('/employee-hours/:employee_id', async (req, res) => {
  try {
    // Migration auto si use_business_hours manque
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='employee_hours' AND column_name='use_business_hours') THEN
          ALTER TABLE employee_hours ADD COLUMN use_business_hours BOOLEAN DEFAULT TRUE;
        END IF;
      END $$
    `);
    const { rows } = await pool.query(
      `SELECT * FROM employee_hours
       WHERE employee_id=$1 AND user_id=$2
       ORDER BY day_of_week`,
      [req.params.employee_id, req.user.userId]
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/booking/employee-hours — sauvegarder horaires d'un employé
router.post('/employee-hours', async (req, res) => {
  try {
    const { employee_id, hours } = req.body;
    if (!employee_id || !Array.isArray(hours) || hours.length === 0)
      return res.status(400).json({ error: 'Données invalides : employee_id et hours[] requis.' });

    // Vérifier que l'employé appartient au commerçant
    const { rows: emp } = await pool.query(
      'SELECT id FROM employees WHERE id=$1 AND user_id=$2',
      [employee_id, req.user.userId]
    );
    if (!emp.length) return res.status(403).json({ error: 'Employé introuvable.' });

    // Vérifier que la colonne use_business_hours existe (migration auto si besoin)
    const { rows: colCheck } = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name='employee_hours' AND column_name='use_business_hours'
    `);
    const hasUBH = colCheck.length > 0;

    if (!hasUBH) {
      // Migration auto : ajouter la colonne manquante
      await pool.query(`ALTER TABLE employee_hours ADD COLUMN IF NOT EXISTS use_business_hours BOOLEAN DEFAULT TRUE`);
    }

    for (const h of hours) {
      const useBH = h.use_business_hours !== false; // true par défaut
      await pool.query(
        `INSERT INTO employee_hours
           (employee_id, user_id, day_of_week, open_time, close_time, is_open, use_business_hours)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (employee_id, day_of_week) DO UPDATE
           SET open_time        = EXCLUDED.open_time,
               close_time       = EXCLUDED.close_time,
               is_open          = EXCLUDED.is_open,
               use_business_hours = EXCLUDED.use_business_hours`,
        [employee_id, req.user.userId, h.day_of_week,
         h.open_time  || '09:00',
         h.close_time || '18:00',
         h.is_open !== false,
         useBH]
      );
    }

    const { rows } = await pool.query(
      'SELECT * FROM employee_hours WHERE employee_id=$1 ORDER BY day_of_week',
      [employee_id]
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

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
      bs.name as service_name, bs.color as service_color, bs.price as service_price
      FROM appointments a
      LEFT JOIN booking_services bs ON bs.id=a.service_id
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

    // Vérifier que l'employé n'est pas absent ce jour-là
    const { rows: absR } = await pool.query(
      `SELECT id FROM employee_absences WHERE employee_id=$1 AND $2::date BETWEEN start_date AND end_date`,
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

    const { rows } = await pool.query(
      `INSERT INTO appointments
         (user_id,service_id,employee_id,client_name,client_email,client_phone,date,start_time,end_time,duration_minutes,total_duration,total_amount,notes,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'confirmed')
       RETURNING id,TO_CHAR(date,'YYYY-MM-DD') as date,
         TO_CHAR(start_time,'HH24:MI') as start_time,TO_CHAR(end_time,'HH24:MI') as end_time,
         client_name,client_email,client_phone,status,notes,duration_minutes,total_duration,total_amount,service_id,employee_id,created_at`,
      [req.user.userId, mainServiceId, employee_id, client_name, client_email||null, client_phone||null,
       date, start_time, end_time, duration, duration, totalAmount, notes||null]
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

    // Email confirmation si email fourni
    if (client_email) {
      try {
        const [eR, uR, bR] = await Promise.all([
          pool.query('SELECT name FROM employees WHERE id=$1', [employee_id]),
          pool.query('SELECT business_name FROM users WHERE id=$1', [req.user.userId]),
          pool.query('SELECT slug FROM booking_settings WHERE user_id=$1', [req.user.userId]),
        ]);
        const bookingUrl = bR.rows[0]?.slug ? `${process.env.FRONTEND_URL||'http://localhost:5173'}/book/${bR.rows[0].slug}` : '';
        const serviceSummary = cartItems && cartItems.length > 0
          ? cartItems.map(it => it.qty > 1 ? `${it.service_name} ×${it.qty}` : it.service_name).join(', ')
          : 'Service';
        setImmediate(() => sendAppointmentConfirmation({ to: client_email, clientName: client_name, businessName: uR.rows[0]?.business_name || '', serviceName: serviceSummary, employeeName: eR.rows[0]?.name || null, date, startTime: start_time, endTime: end_time, durationMinutes: duration, price: totalAmount > 0 ? totalAmount : null, notes: notes||null, appointmentId: appt.id, bookingUrl, items: cartItems && cartItems.length > 0 ? cartItems.map(it => ({ service_name: it.service_name, qty: it.qty||1, unit_price: parseFloat(it.unit_price)||0, duration_minutes: it.duration_minutes||0, })) : null, }).catch(e => console.error('[EMAIL]', e.message)));
      } catch(me){ console.error('[MAIL CONF EMP]', me.message); }
    }
    res.status(201).json(appt);
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
      if (appt.client_email) {
        try {
          const [sR, uR] = await Promise.all([
            pool.query('SELECT name FROM booking_services WHERE id=$1', [upd.service_id]),
            pool.query('SELECT business_name FROM users WHERE id=$1', [req.user.userId]),
          ]);
          setImmediate(() => sendAppointmentCancellation({ to: appt.client_email, clientName: appt.client_name, businessName: uR.rows[0]?.business_name || '', serviceName: sR.rows[0]?.name || 'Service', date: upd.date, startTime: upd.start_time, reason: cancel_reason||null, appointmentId: req.params.id, }).catch(e => console.error('[EMAIL]', e.message)));
        } catch(me){ console.error('[MAIL ANNUL EMP]', me.message); }
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

// ── Permissions employé ───────────────────────────────────────────────────────
// GET  /booking/employee-permissions/:id
router.get('/employee-permissions/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, can_cancel, can_modify, can_encash,
              COALESCE(can_grant_credit, FALSE) AS can_grant_credit,
              COALESCE(can_repay_credit, FALSE) AS can_repay_credit
       FROM employees WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employé introuvable.' });
    res.json(rows[0]);
  } catch(e){ res.status(500).json({ error: 'Erreur serveur.' }); }
});

// PUT /booking/employee-permissions/:id
router.put('/employee-permissions/:id', async (req, res) => {
  try {
    const { can_cancel, can_modify, can_encash, can_grant_credit, can_repay_credit } = req.body;
    const { rows } = await pool.query(
      `UPDATE employees SET
         can_cancel=$1, can_modify=$2, can_encash=$3,
         can_grant_credit=$4, can_repay_credit=$5
       WHERE id=$6 AND user_id=$7
       RETURNING id, name, can_cancel, can_modify, can_encash,
         COALESCE(can_grant_credit, FALSE) AS can_grant_credit,
         COALESCE(can_repay_credit, FALSE) AS can_repay_credit`,
      [!!can_cancel, !!can_modify, !!can_encash, !!can_grant_credit, !!can_repay_credit,
       req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employé introuvable.' });
    res.json(rows[0]);
  } catch(e){ res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── Encaissement RDV → crée une transaction + marque le RDV paid ─────────────
// POST /api/booking/appointments/:id/checkout
router.post('/appointments/:id/checkout', async (req, res) => {
  try {
    const { employee_id, payment_method, category_id, amount: customAmount } = req.body;

    // Vérifier le RDV
    const { rows: apptR } = await pool.query(
      `SELECT a.*, bs.name as service_name, bs.price as service_price,
        e.can_encash, e.name as employee_name
       FROM appointments a
       LEFT JOIN booking_services bs ON bs.id = a.service_id
       LEFT JOIN employees e ON e.id = a.employee_id
       WHERE a.id=$1 AND a.user_id=$2`,
      [req.params.id, req.user.userId]
    );
    if (!apptR.length) return res.status(404).json({ error: 'RDV introuvable.' });
    const appt = apptR[0];
    if (appt.paid) return res.status(400).json({ error: 'Ce RDV est déjà encaissé.' });

    // Vérifier permission si employee_id fourni (l'employé qui encaisse)
    if (employee_id) {
      const { rows: empR } = await pool.query(
        'SELECT can_encash FROM employees WHERE id=$1 AND user_id=$2',
        [employee_id, req.user.userId]
      );
      if (!empR.length || !empR[0].can_encash) {
        return res.status(403).json({ error: "Vous n'avez pas la permission d'encaisser les RDV." });
      }
    }

    // Montant : priorité au custom de l'employé, sinon total_amount (déjà réduit si promo),
    // sinon prix service. Si le RDV avait un promo, total_amount contient déjà le prix réduit.
    const amount = customAmount != null
      ? parseFloat(customAmount)
      : (parseFloat(appt.total_amount) || parseFloat(appt.service_price) || 0);
    // Discount : provient du RDV si promo était appliqué lors de la réservation
    const discountFromAppt = parseFloat(appt.discount_amount || 0);
    const now = new Date();
    const dateStr = now.toLocaleDateString('sv-SE');
    const timeStr = now.toTimeString().substring(0,5);

    // Charger les items du RDV pour la description
    const { rows: apptItems } = await pool.query(
      'SELECT service_name, qty, unit_price FROM appointment_items WHERE appointment_id=$1 ORDER BY created_at',
      [req.params.id]
    );
    let desc;
    if (apptItems.length > 1) {
      const itemList = apptItems.map(it => it.qty > 1 ? `${it.service_name} ×${it.qty}` : it.service_name).join(', ');
      desc = `RDV — ${itemList}${appt.client_name ? ` (${appt.client_name})` : ''}`;
    } else {
      desc = `RDV — ${appt.service_name || 'Service'}${appt.client_name ? ` (${appt.client_name})` : ''}`;
    }

    // Créer la transaction — inclure les infos promo si le RDV en avait une
    const { rows: txR } = await pool.query(
      `INSERT INTO transactions
         (user_id, type, amount, description, employee_id, payment_method,
          date, time, datetime_iso, appointment_id, source,
          promo_code_id, discount_amount, original_amount)
       VALUES ($1,'revenue',$2,$3,$4,$5,$6,$7,$8,$9,'rdv',$10,$11,$12)
       RETURNING id, type, TO_CHAR(date,'YYYY-MM-DD') as date, TO_CHAR(time,'HH24:MI') as time,
         amount, description, payment_method, employee_id, appointment_id, source, created_at,
         promo_code_id, discount_amount, original_amount`,
      [req.user.userId, amount, desc, appt.employee_id || null,
       payment_method || 'cash', dateStr, timeStr,
       now.toISOString(), req.params.id,
       appt.promo_code_id || null,
       discountFromAppt || 0,
       appt.original_amount || null]
    );
    const tx = txR[0];

    // Insérer transaction_items depuis appointment_items + calculer qty_total
    let qtyTotal = 1;
    if (apptItems.length > 0) {
      qtyTotal = apptItems.reduce((s, it) => s + (parseInt(it.qty) || 1), 0);
      for (const it of apptItems) {
        await pool.query(
          `INSERT INTO transaction_items (transaction_id, service_id, service_name, qty, unit_price)
           VALUES ($1,$2,$3,$4,$5)`,
          [tx.id, it.service_id||null, it.service_name, it.qty||1, parseFloat(it.unit_price)||0]
        );
      }
      // Mettre à jour qty_total sur la transaction
      await pool.query(
        `UPDATE transactions SET qty_total=$1 WHERE id=$2`,
        [qtyTotal, tx.id]
      );
      tx.qty_total = qtyTotal;
      tx.items = apptItems;
    }

    // Mettre à jour le RDV : paid + status=completed
    await pool.query(
      `UPDATE appointments SET paid=TRUE, paid_method=$1, transaction_id=$2, status='completed', updated_at=NOW()
       WHERE id=$3`,
      [payment_method || 'cash', tx.id, req.params.id]
    );

    //// ── Fidélité : incrémenter (source=physical) ────────────────────────────────
    let loyaltyResult = null;
    if (appt.client_email) {
      try {
        // source : 'online' si RDV réservé en ligne, 'physical' si prestation sur place
        const loyaltySource = (appt.source === 'rdv') ? 'online' : 'physical';
        loyaltyResult = await incrementStamps(
          req.user.userId, appt.client_email, appt.client_name || null,
          qtyTotal || 1, loyaltySource,
          parseFloat(appt.total_amount) || 0
        );
      } catch(loyErr) { console.error('[LOYALTY ERROR]', loyErr.message); }
    }

    // ── Log usage code promo si le RDV avait un code promo ─────────────────────
    // Note: uses_count a déjà été incrémenté lors de la réservation (public-booking.js)
    // Ici on crée juste un log de traçabilité lié à la transaction d'encaissement
    if (appt.promo_code_id) {
      try {
        // Vérifier si un log existe déjà pour ce RDV (lors de la réservation)
        const { rows: existingLog } = await pool.query(
          'SELECT id FROM promo_usage_logs WHERE appointment_id=$1 LIMIT 1',
          [req.params.id]
        );
        if (!existingLog.length) {
          // Pas encore de log → créer (cas de RDV sans réservation en ligne)
          await pool.query(
            `INSERT INTO promo_usage_logs
               (user_id, promo_code_id, code_snapshot, client_email, client_name,
                transaction_id, appointment_id, discount_applied, transaction_amount)
             VALUES ($1,$2,(SELECT code FROM promo_codes WHERE id=$2),$3,$4,$5,$6,$7,$8)`,
            [req.user.userId, appt.promo_code_id,
             appt.client_email||null, appt.client_name||null,
             tx.id, req.params.id,
             discountFromAppt,
             amount]
          );
        } else {
          // Mettre à jour le log existant avec la transaction_id
          await pool.query(
            'UPDATE promo_usage_logs SET transaction_id=$1, transaction_amount=$2 WHERE appointment_id=$3',
            [tx.id, amount, req.params.id]
          );
        }
      } catch(e) { console.error('[PROMO LOG ERR]', e.message); }
    }

    res.json({
      transaction: tx,
      appointment_id: req.params.id,
      amount,
      qty_total: qtyTotal,
      loyalty: loyaltyResult,
    });
  } catch(e){ console.error('[CHECKOUT ERROR]', e.message); res.status(500).json({ error: e.message || 'Erreur serveur.' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PAUSES COMMERÇANT
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/booking/breaks — retourne toutes les pauses
router.get('/breaks', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM business_breaks WHERE user_id=$1 ORDER BY day_of_week, break_start',
      [req.user.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/booking/breaks — remplace toutes les pauses (tableau complet)
router.post('/breaks', async (req, res) => {
  try {
    const { breaks } = req.body; // [{ day_of_week, break_start, break_end }]
    if (!Array.isArray(breaks)) return res.status(400).json({ error: 'Format invalide.' });

    await pool.query('DELETE FROM business_breaks WHERE user_id=$1', [req.user.userId]);

    for (const b of breaks) {
      if (b.break_start >= b.break_end) continue; // ignorer les pauses invalides
      await pool.query(
        `INSERT INTO business_breaks (user_id, day_of_week, break_start, break_end)
         VALUES ($1,$2,$3,$4)`,
        [req.user.userId, b.day_of_week, b.break_start, b.break_end]
      );
    }
    const { rows } = await pool.query(
      'SELECT * FROM business_breaks WHERE user_id=$1 ORDER BY day_of_week, break_start',
      [req.user.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PLAGES HORAIRES MULTIPLES PAR EMPLOYÉ
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/booking/employee-slots/:employee_id
router.get('/employee-slots/:employee_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM employee_time_slots WHERE employee_id=$1 AND user_id=$2 ORDER BY day_of_week, slot_start',
      [req.params.employee_id, req.user.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/booking/employee-slots — remplace toutes les plages d'un employé
router.post('/employee-slots', async (req, res) => {
  try {
    const { employee_id, slots } = req.body;
    if (!employee_id || !Array.isArray(slots))
      return res.status(400).json({ error: 'employee_id et slots[] requis.' });

    // Vérifier ownership
    const { rows: emp } = await pool.query(
      'SELECT id FROM employees WHERE id=$1 AND user_id=$2',
      [employee_id, req.user.userId]
    );
    if (!emp.length) return res.status(403).json({ error: 'Employé introuvable.' });

    await pool.query(
      'DELETE FROM employee_time_slots WHERE employee_id=$1 AND user_id=$2',
      [employee_id, req.user.userId]
    );

    for (const s of slots) {
      if (s.slot_start >= s.slot_end) continue;
      await pool.query(
        `INSERT INTO employee_time_slots (employee_id, user_id, day_of_week, slot_start, slot_end)
         VALUES ($1,$2,$3,$4,$5)`,
        [employee_id, req.user.userId, s.day_of_week, s.slot_start, s.slot_end]
      );
    }

    const { rows } = await pool.query(
      'SELECT * FROM employee_time_slots WHERE employee_id=$1 AND user_id=$2 ORDER BY day_of_week, slot_start',
      [employee_id, req.user.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// DELETE /api/booking/employee-slots/:employee_id — supprime toutes les plages
router.delete('/employee-slots/:employee_id', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM employee_time_slots WHERE employee_id=$1 AND user_id=$2',
      [req.params.employee_id, req.user.userId]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});