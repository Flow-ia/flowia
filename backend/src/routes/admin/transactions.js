// routes/admin/transactions.js — Endpoints super-admin pour les transactions.
// Commit D : migration manuelle des paiements 'multi' legacy (créés avant le
// commit A, payment_group_id NULL) vers le nouveau modèle multi-rows traçable.
//
// Politique : DELETE l'ancienne row + INSERT N rows neuves dans une même
// transaction SQL (BEGIN/COMMIT/ROLLBACK). Le created_at original est
// préservé pour la compta. Audit trail systématique dans admin_audit_log.

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');
const { logAuditAction } = require('../../services/adminAudit');
const { invalidateUserStatsCache } = require('../../utils/paymentV3');

const router = express.Router();
router.use(adminAuth);

// Whitelist alignée commit A (BREAKDOWN_METHODS) — ne pas y ajouter
// 'card_online' (réservé Stripe en ligne) ni 'check' / 'multi'.
const BREAKDOWN_METHODS = new Set(['cash', 'card', 'gift_card', 'transfer', 'other']);

// ── GET /api/admin/transactions/legacy-multi ─────────────────────────────────
// Liste toutes les transactions legacy (payment_method='multi' AND
// payment_group_id IS NULL) avec leurs metadonnées (commerçant, RDV, client)
// pour permettre au super-admin de saisir le breakdown manquant.
router.get('/legacy-multi', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.amount,
        t.created_at,
        t.appointment_id,
        t.user_id,
        t.description,
        t.source,
        t.payment_method,
        t.date,
        t.time,
        u.business_name AS merchant_name,
        a.client_name,
        a.date          AS appointment_date
      FROM transactions t
      LEFT JOIN users        u ON u.id = t.user_id
      LEFT JOIN appointments a ON a.id = t.appointment_id
      WHERE t.payment_method = 'multi'
        AND t.payment_group_id IS NULL
      ORDER BY t.created_at DESC
    `);
    const transactions = rows.map(r => ({
      ...r,
      amount: parseFloat(r.amount) || 0,
      amount_cents: Math.round((parseFloat(r.amount) || 0) * 100),
    }));
    res.json({ transactions, count: transactions.length });
  } catch (e) {
    console.error('[admin tx legacy-multi GET]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/admin/transactions/:id/migrate-breakdown ───────────────────────
// Convertit une transaction multi legacy en N rows traçables. La row legacy
// est SUPPRIMÉE (DELETE) puis remplacée par les N rows du breakdown. Toutes
// les rows partagent le même payment_group_id UUID v4. Le created_at original
// est conservé tel quel (clé pour la compta + cohérence stats historiques).
router.post('/:id/migrate-breakdown', async (req, res) => {
  const txId = String(req.params.id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(txId)) {
    return res.status(400).json({ error: 'id invalide.', code: 'INVALID_ID' });
  }
  const { payment_breakdown } = req.body || {};

  // ── 1. Validation du breakdown (alignée backend commit A) ─────────────────
  if (!Array.isArray(payment_breakdown) || payment_breakdown.length === 0) {
    return res.status(400).json({
      error: 'payment_breakdown manquant ou vide.',
      code: 'BREAKDOWN_MISSING',
    });
  }
  if (payment_breakdown.length < 2) {
    return res.status(400).json({
      error: 'Le multi-paiement doit contenir au moins 2 méthodes.',
      code: 'BREAKDOWN_SINGLE_ITEM',
    });
  }
  if (payment_breakdown.length > 4) {
    return res.status(400).json({
      error: 'Le multi-paiement ne peut excéder 4 méthodes.',
      code: 'BREAKDOWN_TOO_MANY_METHODS',
    });
  }
  const seenMethods = new Set();
  let sumCents = 0;
  for (let i = 0; i < payment_breakdown.length; i++) {
    const it = payment_breakdown[i];
    if (!it || typeof it !== 'object') {
      return res.status(400).json({
        error: `Élément ${i + 1} du breakdown invalide.`,
        code: 'BREAKDOWN_INVALID_ITEM',
      });
    }
    if (it.method === 'card_online') {
      return res.status(400).json({
        error: 'Le mode card_online est réservé aux paiements Stripe en ligne.',
        code: 'BREAKDOWN_CARD_ONLINE_NOT_SUPPORTED',
      });
    }
    if (typeof it.method !== 'string' || !BREAKDOWN_METHODS.has(it.method)) {
      return res.status(400).json({
        error: `Mode de paiement invalide : ${it.method}.`,
        code: 'BREAKDOWN_INVALID_METHOD',
      });
    }
    if (!Number.isInteger(it.amount_cents) || it.amount_cents <= 0) {
      return res.status(400).json({
        error: `Montant invalide pour ${it.method} (entier > 0 attendu).`,
        code: 'BREAKDOWN_INVALID_AMOUNT',
      });
    }
    if (seenMethods.has(it.method)) {
      return res.status(400).json({
        error: `Mode de paiement en doublon : ${it.method}.`,
        code: 'BREAKDOWN_DUPLICATE_METHODS',
      });
    }
    seenMethods.add(it.method);
    sumCents += it.amount_cents;
  }

  // ── 2. Vérif qualification legacy + lock row + migration atomique ─────────
  const dbClient = await pool.connect();
  let original = null;
  let groupId = null;
  try {
    await dbClient.query('BEGIN');

    // SELECT FOR UPDATE pour empêcher 2 super-admins de migrer en parallèle.
    const orig = await dbClient.query(
      `SELECT id, user_id, type, amount, description, category_id, employee_id,
              payment_method, date, time, datetime_iso, appointment_id, source,
              promo_code_id, discount_amount, original_amount, client_email,
              client_note, qty_total, global_client_id, idempotency_key,
              signed_by_employee_id, payment_source, payment_status,
              payment_type, paid_at, payment_group_id, created_at
         FROM transactions
        WHERE id = $1::uuid
        FOR UPDATE`,
      [txId]
    );
    if (!orig.rows.length) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction introuvable.', code: 'NOT_FOUND' });
    }
    original = orig.rows[0];
    if (original.payment_method !== 'multi' || original.payment_group_id !== null) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cette transaction n\'est pas une transaction multi legacy.',
        code: 'NOT_LEGACY_MULTI',
      });
    }
    const originalCents = Math.round(parseFloat(original.amount) * 100);
    if (sumCents !== originalCents) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({
        error: `La somme du breakdown (${(sumCents / 100).toFixed(2)} €) ne correspond pas au total (${(originalCents / 100).toFixed(2)} €).`,
        code: 'BREAKDOWN_SUM_MISMATCH',
      });
    }

    // ── 3. DELETE legacy + INSERT N rows ────────────────────────────────────
    groupId = crypto.randomUUID();
    await dbClient.query('DELETE FROM transactions WHERE id = $1::uuid', [txId]);

    const insertedIds = [];
    const methodsLog = [];
    for (let i = 0; i < payment_breakdown.length; i++) {
      const item = payment_breakdown[i];
      const itemAmt = item.amount_cents / 100;
      // idempotency_key dédié migration : préserve l'unicité même si la
      // row originale en avait une (qu'on aurait pu suffixer mais le
      // nouveau format est plus parlant pour l'audit BDD).
      const itemIdemKey = `migration:${groupId}:${i + 1}`;
      const r = await dbClient.query(
        `INSERT INTO transactions
          (user_id, type, amount, description, category_id, employee_id,
           payment_method, date, time, datetime_iso, appointment_id, source, locked,
           promo_code_id, discount_amount, original_amount, client_email, client_note,
           qty_total, global_client_id, idempotency_key, signed_by_employee_id,
           payment_source, payment_status, payment_type,
           gross_amount_cents, stripe_fee_cents, platform_fee_cents, net_amount_cents,
           paid_at, payment_group_id, created_at)
         VALUES ($1::uuid, $2::text, $3::numeric, $4::text, $5::uuid, $6::uuid,
                 $7::text, $8::date, $9::time, $10::text, $11::uuid, $12::text, TRUE,
                 $13::uuid, $14::numeric, $15::numeric, $16::text, $17::text,
                 $18::integer, $19::uuid, $20::text, $21::uuid,
                 $22::text, $23::text, $24::text,
                 $25::integer, $26::integer, $27::integer, $28::integer,
                 $29::timestamptz, $30::uuid, $31::timestamptz)
         RETURNING id`,
        [original.user_id, original.type, itemAmt,
         original.description, original.category_id, original.employee_id,
         item.method, original.date, original.time,
         original.datetime_iso, original.appointment_id, original.source,
         original.promo_code_id, original.discount_amount, original.original_amount,
         original.client_email, original.client_note, original.qty_total,
         original.global_client_id, itemIdemKey, original.signed_by_employee_id,
         original.payment_source, original.payment_status, original.payment_type,
         item.amount_cents, 0, 0, item.amount_cents,
         original.paid_at, groupId, original.created_at]
      );
      insertedIds.push(r.rows[0].id);
      methodsLog.push(`${item.method}:${item.amount_cents}c`);
    }

    await dbClient.query('COMMIT');

    // ── 4. Cache + audit + log structuré (post-COMMIT) ──────────────────────
    try { invalidateUserStatsCache(original.user_id); } catch {}
    try {
      await logAuditAction({
        adminId:    req.admin?.id || null,
        adminEmail: req.admin?.email || null,
        action:     'legacy_multi_migrated',
        targetType: 'transaction',
        targetId:   txId,
        payloadBefore: {
          id:             txId,
          amount:         parseFloat(original.amount) || 0,
          payment_method: 'multi',
          appointment_id: original.appointment_id,
          user_id:        original.user_id,
          created_at:     original.created_at,
        },
        payloadAfter: {
          payment_group_id:    groupId,
          payment_breakdown:   payment_breakdown,
          new_transaction_ids: insertedIds,
          original_amount:     parseFloat(original.amount) || 0,
        },
        req,
      });
    } catch {}
    console.log(`[ADMIN MIGRATE LEGACY MULTI] tx=${txId} group=${groupId}`
      + ` count=${insertedIds.length} merchant=${original.user_id}`
      + ` total=${sumCents}c methods=[${methodsLog.join(',')}]`);

    return res.status(200).json({
      success: true,
      payment_group_id:     groupId,
      migrated_rows:        insertedIds.length,
      original_id_deleted:  txId,
      new_transaction_ids:  insertedIds,
    });
  } catch (err) {
    try { await dbClient.query('ROLLBACK'); } catch {}
    console.error('[ADMIN MIGRATE LEGACY MULTI] rollback', { txId, group: groupId, err: err.message });
    // Audit trail aussi en cas d'échec (traçabilité tentative).
    try {
      await logAuditAction({
        adminId:    req.admin?.id || null,
        adminEmail: req.admin?.email || null,
        action:     'legacy_multi_migrated',
        targetType: 'transaction',
        targetId:   txId,
        payloadAfter: { attempted_breakdown: payment_breakdown, group_id_attempted: groupId },
        status:     'failure',
        errorMessage: err.message,
        req,
      });
    } catch {}
    return res.status(500).json({
      error: 'Erreur lors de la migration.',
      code:  'MIGRATION_FAILED',
    });
  } finally {
    try { dbClient.release(); } catch {}
  }
});

module.exports = router;
