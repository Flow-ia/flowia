// routes/admin/refund-misclassified.js — Backfill one-shot.
// Detecte les RDV cancelled qui auraient du etre refundes (annulation dans
// les delais policy_hours) mais sont restes payment_status='paid'. Pour
// chaque RDV, declenche le vrai refund Stripe via refundAppointment.
//
// Cause des mis-classifications : ancien bug logique avant le commit 8 de
// la refonte v3 (calcul TZ-aware). Ce backfill sert a rattraper les RDV
// concernes apres deploy du fix.
//
// Securite : adminAuth + dry_run par defaut. Le caller doit passer
// ?execute=1 pour declencher les vrais refunds Stripe (irreversibles).

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');
const { logAuditAction } = require('../../services/adminAudit');
const { refundAppointment } = require('../../utils/refundAppointment');

const router = express.Router();
router.use(adminAuth);

// Construit la liste des candidats : RDV cancelled, paye en ligne, dans les
// delais d'annulation (cancelled_at avant rdv_datetime - policy_hours), mais
// payment_status='paid' (refund jamais declenche).
//
// Filtres :
//   ?user_id=<merchant_id>  : limiter a un commercant (recommande pour test)
//   ?limit=<n>              : max N candidats (default 50, hard cap 200)
//   ?execute=1              : declenche les vrais refunds Stripe (sans => dry_run)
async function listCandidates(userId, limit) {
  // policy_hours : par merchant via booking_settings, fallback 2.
  // rdv_datetime : (a.date + a.start_time) AT TIME ZONE Europe/Paris (TZ
  // commercante). cancelled_at < rdv_datetime - policy_hours * INTERVAL '1 hour'.
  const params = [];
  let userFilter = '';
  if (userId) {
    params.push(userId);
    userFilter = ` AND a.user_id = $${params.length}`;
  }
  params.push(Math.min(200, parseInt(limit, 10) || 50));
  const limitParam = params.length;

  const { rows } = await pool.query(`
    SELECT
      a.id                              AS appointment_id,
      a.user_id,
      u.business_name,
      a.client_email,
      a.client_name,
      a.date,
      TO_CHAR(a.start_time, 'HH24:MI:SS') AS start_time,
      a.cancelled_at,
      a.cancelled_by,
      a.payment_status,
      a.paid_amount_cents,
      a.stripe_payment_intent_id,
      COALESCE(bs.cancellation_policy_hours, 2)   AS policy_hours,
      COALESCE(bs.timezone, 'Europe/Paris')       AS timezone,
      EXTRACT(EPOCH FROM (
        ((a.date + a.start_time) AT TIME ZONE COALESCE(bs.timezone, 'Europe/Paris'))
        - a.cancelled_at
      )) / 3600 AS hours_before_rdv_at_cancel
    FROM appointments a
    JOIN users u             ON u.id = a.user_id
    LEFT JOIN booking_settings bs ON bs.user_id = a.user_id
    WHERE a.status = 'cancelled'
      AND a.payment_status = 'paid'
      AND a.cancelled_by IN ('client','merchant','salon')
      AND a.cancelled_at IS NOT NULL
      AND a.stripe_payment_intent_id IS NOT NULL
      AND a.paid_amount_cents IS NOT NULL
      AND a.paid_amount_cents > 0
      AND EXTRACT(EPOCH FROM (
        ((a.date + a.start_time) AT TIME ZONE COALESCE(bs.timezone, 'Europe/Paris'))
        - a.cancelled_at
      )) / 3600 >= COALESCE(bs.cancellation_policy_hours, 2)
      ${userFilter}
    ORDER BY a.cancelled_at DESC
    LIMIT $${limitParam}
  `, params);
  return rows;
}

// GET /api/admin/refund-misclassified
// Liste les candidats sans rien faire.
router.get('/', async (req, res) => {
  try {
    const userId = req.query.user_id || null;
    const limit  = req.query.limit   || 50;
    const candidates = await listCandidates(userId, limit);
    res.json({ count: candidates.length, candidates });
  } catch (e) {
    console.error('[admin refund-misclassified GET]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/refund-misclassified/run
// Execute les refunds sur les candidats. Default dry_run sauf si ?execute=1.
router.post('/run', async (req, res) => {
  try {
    const userId  = req.query.user_id || req.body?.user_id || null;
    const limit   = req.query.limit   || req.body?.limit   || 50;
    const execute = req.query.execute === '1' || req.body?.execute === true;

    const candidates = await listCandidates(userId, limit);
    const results = [];

    for (const c of candidates) {
      if (!execute) {
        results.push({
          appointment_id: c.appointment_id,
          user_id:        c.user_id,
          business_name:  c.business_name,
          paid_amount_cents: c.paid_amount_cents,
          hours_before_rdv: parseFloat(c.hours_before_rdv_at_cancel).toFixed(2),
          policy_hours:   c.policy_hours,
          dry_run:        true,
        });
        continue;
      }
      try {
        const r = await refundAppointment(pool, c.appointment_id, 'admin_backfill_misclassified');
        results.push({
          appointment_id: c.appointment_id,
          user_id:        c.user_id,
          paid_amount_cents: c.paid_amount_cents,
          ok:             r.ok,
          refunded:       r.refunded || false,
          refund_id:      r.refund_id || null,
          reason:         r.reason || null,
          error:          r.error || null,
        });
      } catch (refErr) {
        results.push({
          appointment_id: c.appointment_id,
          user_id:        c.user_id,
          ok:             false,
          error:          refErr.message,
        });
      }
    }

    // Audit trail (admin action)
    try {
      await logAuditAction({
        adminId:    req.admin?.id || null,
        adminEmail: req.admin?.email || null,
        action:     execute ? 'refund_misclassified.execute' : 'refund_misclassified.dry_run',
        targetType: 'appointment',
        payloadAfter: {
          user_id_filter:  userId,
          candidate_count: candidates.length,
          executed_count:  execute ? results.filter(r => r.refunded).length : 0,
        },
        req,
      });
    } catch {}

    res.json({
      executed:   execute,
      candidate_count: candidates.length,
      results,
    });
  } catch (e) {
    console.error('[admin refund-misclassified POST]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
