const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const _ek = 'emps:' + req.user.userId;
    const _eh = global.memCache?.get(_ek);
    if (_eh) return res.json(_eh);

    const { rows } = await pool.query(
      `SELECT e.*,
              mi.id   IS NOT NULL                  AS has_image,
              EXTRACT(EPOCH FROM mi.created_at)::bigint AS image_version
       FROM employees e
       LEFT JOIN LATERAL (
         SELECT id, created_at FROM media
          WHERE ref_id=e.id AND type='employee'
          ORDER BY created_at DESC LIMIT 1
       ) mi ON TRUE
       WHERE e.user_id=$1 ORDER BY e.created_at ASC`,
      [req.user.userId]
    );
    res.json(rows);
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, role, phone, avatar_color, is_active, can_cancel, can_modify, can_encash, show_on_booking, show_in_caisse, can_use_promo, can_grant_credit, can_repay_credit } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis.' });
    const { rows } = await pool.query(
      'INSERT INTO employees (user_id, name, role, phone, avatar_color, is_active, can_cancel, can_modify, can_encash, show_on_booking, show_in_caisse, can_use_promo, can_grant_credit, can_repay_credit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
      [req.user.userId, name, role || null, phone || null, avatar_color || '#3b82f6', is_active !== false, !!can_cancel, !!can_modify, !!can_encash, show_on_booking !== false, show_in_caisse !== false, can_use_promo !== false, !!can_grant_credit, !!can_repay_credit]
    );
    res.status(201).json(rows[0]);
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, role, phone, email, avatar_color, is_active, can_cancel, can_modify, can_encash, show_on_booking, show_in_caisse, can_use_promo, can_grant_credit, can_repay_credit } = req.body;
    const { rows } = await pool.query(
      `UPDATE employees SET name=$1, role=$2, phone=$3, email=$4, avatar_color=$5, is_active=$6, can_cancel=$7, can_modify=$8, can_encash=$9, show_on_booking=$10, show_in_caisse=$11, can_use_promo=$12, can_grant_credit=$13, can_repay_credit=$14
       WHERE id=$15 AND user_id=$16 RETURNING *`,
      [name, role || null, phone || null, email || null, avatar_color, is_active !== false, !!can_cancel, !!can_modify, !!can_encash, show_on_booking !== false, show_in_caisse !== false, can_use_promo !== false, !!can_grant_credit, !!can_repay_credit, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employé introuvable.' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM employees WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;

// ── Route : récupérer les futurs RDV d'un employé ────────────────────────────
router.get('/:id/future-appointments', async (req, res) => {
  try {
    const today = new Date().toISOString().substring(0, 10);
    const { rows } = await pool.query(
      `SELECT a.id, a.client_name, a.client_email, a.client_phone,
              a.date, a.start_time, a.end_time, a.duration_minutes,
              a.total_duration, a.total_amount, a.status, a.notes,
              s.name as service_name
       FROM appointments a
       LEFT JOIN booking_services s ON s.id = a.service_id
       WHERE a.employee_id=$1 AND a.user_id=$2
         AND a.date >= $3
         AND a.status NOT IN ('cancelled','completed')
       ORDER BY a.date ASC, a.start_time ASC`,
      [req.params.id, req.user.userId, today]
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── Route : suppression intelligente d'un employé ────────────────────────────
// 1. Tente de réaffecter chaque RDV futur à un employé disponible
// 2. Si impossible → annule et envoie email client
// 3. Supprime l'employé
router.post('/:id/smart-delete', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId   = req.user.userId;
    const empId    = req.params.id;
    const today    = new Date().toISOString().substring(0, 10);

    // 1. Récupérer les futurs RDV
    const { rows: futureAppts } = await client.query(
      `SELECT a.id, a.client_name, a.client_email, a.client_phone,
              a.date, a.start_time, a.end_time, a.duration_minutes,
              a.total_duration, a.total_amount, a.status, a.notes,
              s.name as service_name
       FROM appointments a
       LEFT JOIN booking_services s ON s.id = a.service_id
       WHERE a.employee_id=$1 AND a.user_id=$2
         AND a.date >= $3
         AND a.status NOT IN ('cancelled','completed')
       ORDER BY a.date ASC, a.start_time ASC`,
      [empId, userId, today]
    );

    // 2. Récupérer les autres employés actifs
    const { rows: otherEmps } = await client.query(
      `SELECT * FROM employees
       WHERE user_id=$1 AND id!=$2 AND is_active=true`,
      [userId, empId]
    );

    const reassigned = [];
    const cancelled  = [];

    for (const appt of futureAppts) {
      let assignedTo = null;

      // Tenter de trouver un employé disponible
      for (const emp of otherEmps) {
        // Vérifier absence
        const { rows: absRows } = await client.query(
          `SELECT 1 FROM employee_absences
           WHERE employee_id=$1 AND $2 BETWEEN start_date AND end_date`,
          [emp.id, appt.date]
        );
        if (absRows.length > 0) continue;

        // Vérifier conflit horaire avec un autre RDV
        const { rows: conflictRows } = await client.query(
          `SELECT 1 FROM appointments
           WHERE employee_id=$1 AND date=$2
             AND status NOT IN ('cancelled')
             AND (
               (start_time <= $3 AND end_time > $3) OR
               (start_time < $4 AND end_time >= $4) OR
               (start_time >= $3 AND end_time <= $4)
             )`,
          [emp.id, appt.date, appt.start_time, appt.end_time]
        );
        if (conflictRows.length > 0) continue;

        assignedTo = emp;
        break;
      }

      if (assignedTo) {
        // Réaffecter
        await client.query(
          `UPDATE appointments SET employee_id=$1, updated_at=NOW()
           WHERE id=$2 AND user_id=$3`,
          [assignedTo.id, appt.id, userId]
        );
        reassigned.push({ ...appt, new_employee: assignedTo.name });
      } else {
        // Annuler et notifier
        await client.query(
          `UPDATE appointments SET status='cancelled',
            cancel_reason='L''employé assigné n''est plus disponible.',
            updated_at=NOW()
           WHERE id=$1 AND user_id=$2`,
          [appt.id, userId]
        );
        // Cascade parrainage : referral_use pending → cancelled
        await client.query(
          `UPDATE referral_uses SET status='cancelled'
            WHERE user_id=$1 AND appointment_id=$2 AND status='pending'`,
          [userId, appt.id]
        ).catch(() => {});
        // Tentative d'envoi email si client a un email
        if (appt.client_email) {
          try {
            const { sendAppointmentCancellation } = require('../utils/email');
            await sendAppointmentCancellation({
              to:           appt.client_email,
              clientName:   appt.client_name,
              date:         appt.date,
              time:         appt.start_time,
              serviceName:  appt.service_name || 'Prestation',
              reason:       "Votre rendez-vous a été annulé car l'employé assigné n'est plus disponible. Veuillez nous recontacter pour reprogrammer.",
            });
          } catch (emailErr) {
            console.error('Email annulation échoué:', emailErr.message);
          }
        }
        cancelled.push(appt);
      }
    }

    // 3. Supprimer l'employé
    await client.query(
      'DELETE FROM employees WHERE id=$1 AND user_id=$2',
      [empId, userId]
    );

    await client.query('COMMIT');
    res.json({ ok: true, reassigned, cancelled });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur : ' + e.message });
  } finally {
    client.release();
  }
});
