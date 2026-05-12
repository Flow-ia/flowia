// routes/admin/failed-refunds.js — AUDIT Phase 5
// Gestion admin des refunds qui ont echoue lors d'auto-refund SLOT_TAKEN.
// Permet a un superadmin de :
// - Lister les refunds en attente de resolution
// - Retry manuellement le refund (Stripe peut s'etre debloque)
// - Marquer comme resolu manuellement (refund fait via Stripe Dashboard)

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');
const { logAuditAction } = require('../../services/adminAudit');

const router = express.Router();
router.use(adminAuth);

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  return require('stripe')(key);
}

// ── GET /api/admin/failed-refunds ────────────────────────────────────────
// Liste les refunds en attente. Filtres : ?resolved=0|1 (default 0),
// ?user_id=<merchant_id> (optionnel).
router.get('/', async (req, res) => {
  try {
    const showResolved = req.query.resolved === '1';
    const userId = req.query.user_id ? String(req.query.user_id) : null;
    const params = [];
    let where = showResolved ? 'WHERE resolved_at IS NOT NULL' : 'WHERE resolved_at IS NULL';
    if (userId) {
      params.push(userId);
      where += ` AND fr.user_id=$${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT fr.id, fr.user_id, fr.stripe_account_id, fr.payment_intent_id,
              fr.amount_cents, fr.slug, fr.reason, fr.stripe_error_message,
              fr.retry_count, fr.resolved_at, fr.resolution_note,
              fr.created_at, fr.updated_at,
              u.business_name, u.email AS merchant_email
         FROM failed_refunds fr
         LEFT JOIN users u ON u.id = fr.user_id
         ${where}
         ORDER BY fr.created_at DESC
         LIMIT 200`,
      params
    );
    res.json({ failed_refunds: rows });
  } catch (e) {
    console.error('[ADMIN failed-refunds GET ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/admin/failed-refunds/:id/retry ─────────────────────────────
// Retry le refund Stripe. Si succes → marque resolved.
router.post('/:id/retry', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM failed_refunds WHERE id=$1 AND resolved_at IS NULL`,
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Refund introuvable ou deja resolu' });
    }
    const fr = rows[0];

    // Tente de retrieve l'archive si le merchant a deconnecte entre temps
    const accountId = fr.stripe_account_id;
    if (!accountId) {
      return res.status(400).json({ error: 'stripe_account_id manquant' });
    }

    let stripeErrorMessage = null;
    let succeeded = false;
    // idempotencyKey : suffixe par retry_count pour permettre le retry apres
    // un echec definitif (ex: le merchant a recredite Stripe). Si le retry
    // courant timeout cote reseau et qu'on reappelle avec la meme key, Stripe
    // retournera le refund de la 1ere tentative -> idempotent.
    const idempotencyKey = `admin_retry_refund_${fr.id}_attempt_${fr.retry_count || 0}`;
    try {
      const stripe = getStripe();
      await stripe.refunds.create(
        {
          payment_intent: fr.payment_intent_id,
          reason: 'requested_by_customer',
          metadata: { admin_retry: 'true', failed_refund_id: fr.id, original_reason: fr.reason },
        },
        { stripeAccount: accountId, idempotencyKey }
      );
      succeeded = true;
    } catch (e) {
      stripeErrorMessage = e.message;
      console.error('[ADMIN failed-refunds retry ERR]', 'fr=' + fr.id, 'pi=' + fr.payment_intent_id, e.message);
    }

    if (succeeded) {
      await pool.query(
        `UPDATE failed_refunds
            SET resolved_at = NOW(),
                resolved_by_admin_id = $2,
                resolution_note = 'auto_retry_success',
                updated_at = NOW()
          WHERE id=$1`,
        [req.params.id, req.admin?.id || null]
      );
      try {
        await logAuditAction({
          action: 'failed_refund.retry_success',
          targetType: 'failed_refund',
          targetId: req.params.id,
          payloadAfter: { payment_intent_id: fr.payment_intent_id, amount_cents: fr.amount_cents },
          req,
        });
      } catch {}
      return res.json({ ok: true, refunded: true });
    } else {
      await pool.query(
        `UPDATE failed_refunds
            SET retry_count = retry_count + 1,
                stripe_error_message = $2,
                updated_at = NOW()
          WHERE id=$1`,
        [req.params.id, stripeErrorMessage]
      );
      return res.status(502).json({
        ok: false, refunded: false,
        stripe_error: stripeErrorMessage,
      });
    }
  } catch (e) {
    console.error('[ADMIN failed-refunds retry ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/admin/failed-refunds/:id/resolve-manual ────────────────────
// Marque comme resolu manuellement (admin a refund via Stripe Dashboard).
// Body : { note: string }
router.post('/:id/resolve-manual', async (req, res) => {
  try {
    const note = String(req.body?.note || 'manual_resolution').slice(0, 500);
    const { rowCount } = await pool.query(
      `UPDATE failed_refunds
          SET resolved_at = NOW(),
              resolved_by_admin_id = $2,
              resolution_note = $3,
              updated_at = NOW()
        WHERE id=$1 AND resolved_at IS NULL`,
      [req.params.id, req.admin?.id || null, note]
    );
    if (!rowCount) {
      return res.status(404).json({ error: 'Refund introuvable ou deja resolu' });
    }
    try {
      await logAuditAction({
        action: 'failed_refund.resolve_manual',
        targetType: 'failed_refund',
        targetId: req.params.id,
        payloadAfter: { note },
        req,
      });
    } catch {}
    res.json({ ok: true });
  } catch (e) {
    console.error('[ADMIN failed-refunds resolve ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
