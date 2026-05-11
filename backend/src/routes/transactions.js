const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { pinAdminMiddleware } = require('../middleware/pinAdmin');
const { incrementStamps } = require('../utils/loyalty-utils');
const { upsertLocalClient } = require('./clients');
const { resolveReferralForFilleul, validateReferralUse } = require('./referrals');
const { employeePinOptional } = require('../middleware/employeePinOptional');
const { canCreateCashTransaction } = require('../services/transactionValidator');
const { invalidateUserStatsCache } = require('../utils/paymentV3');
const router = express.Router();

router.use(authMiddleware);
// AUDIT perms commit C : si un header x-employee-pin est présent, on
// charge req.employee (flags can_*). Routes sensibles (POST) utilisent
// req.employee.id comme employee_id (anti-spoofing du body).
router.use(employeePinOptional);

// Audit V : whitelists strictes. Avant, `type='foobar'` ou
// `payment_method='bitcoin'` passaient silencieusement → stats/recaps
// cassés (agrégats en GROUP BY invalides). Aligné avec audits K/P.
const VALID_TX_TYPES   = new Set(['revenue', 'expense', 'refund', 'adjustment']);
const VALID_TX_METHODS = new Set(['cash', 'card', 'transfer', 'check', 'multi', 'other']);
// Commit A — multi-paiement traçable. Whitelist distincte de VALID_TX_METHODS :
// 'check' et 'multi' interdits dans un breakdown (un breakdown EST le multi),
// 'gift_card' autorisé (carte cadeau partielle), 'card_online' explicitement
// rejeté avec un code dédié (réservé aux paiements Stripe en ligne).
const BREAKDOWN_METHODS = new Set(['cash', 'card', 'gift_card', 'transfer', 'other']);
const MAX_AMOUNT       = 999999.99;          // NUMERIC(10,2) safe + realistic
const MAX_DESC_LEN     = 500;                // anti-DB-bloat
const MAX_NOTE_LEN     = 2000;               // idem sur client_note
const DATE_RE          = /^\d{4}-\d{2}-\d{2}$/;
function isRealDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// AUDIT stats #2 : invalide les caches stats du merchant après toute écriture
// de transaction (sinon /stats/today, /products, /forecast, /heatmap restent
// figés jusqu'à 10 min → "j'ai vendu mais le dashboard ne bouge pas").
function invalidateStatsCache(userId) {
  if (!global.memCache) return;
  ['stats:products', 'stats:today', 'stats:forecast', 'stats:heatmap']
    .forEach(prefix => global.memCache.del(`${prefix}:${userId}`));
}

// ── Helper : snapshot complet d'une transaction (incl. items + payments) ────
async function getSnapshot(id) {
  const { rows } = await pool.query('SELECT * FROM transactions WHERE id=$1', [id]);
  if (!rows.length) return null;
  const tx = rows[0];
  const { rows: items } = await pool.query(
    `SELECT service_id, service_name, qty, unit_price
       FROM transaction_items WHERE transaction_id=$1 ORDER BY created_at`, [id]
  );
  const { rows: payments } = await pool.query(
    `SELECT method, amount FROM transaction_payments
       WHERE transaction_id=$1 ORDER BY created_at`, [id]
  );
  tx.items    = items;
  tx.payments = payments;
  return tx;
}

// ── Helper : enregistrer dans l'audit log ────────────────────────────────────
async function audit(userId, txId, action, before, after, reason) {
  await pool.query(
    `INSERT INTO transaction_audit_log
      (transaction_id, user_id, action, changed_by_type, snapshot_before, snapshot_after, reason)
     VALUES ($1,$2,$3,'admin',$4,$5,$6)`,
    [txId, userId, action,
     before ? JSON.stringify(before) : null,
     after  ? JSON.stringify(after)  : null,
     reason || null]
  );
}

// ── GET / — supporte ?from=&to=&limit=&offset= ───────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { from, to, limit = 500, offset = 0 } = req.query;
    const userId = req.user.userId;

    // Cache uniquement si pas de filtre (chargement initial)
    const noFilter = !from && !to && parseInt(offset) === 0;
    const _tk = `txs:${userId}`;
    if (noFilter) {
      const _th = global.memCache?.get(_tk);
      if (_th) return res.json(_th);
    }

    const params  = [userId];
    // Soft-delete : exclure systématiquement les rows archivées de la liste
    // commerçant (audit FEC : la row existe en BDD mais devient invisible).
    const filters = ['t.user_id=$1', 't.deleted_at IS NULL'];

    if (from) { params.push(from); filters.push(`t.date >= $${params.length}`); }
    if (to)   { params.push(to);   filters.push(`t.date <= $${params.length}`); }

    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const { rows } = await pool.query(
      `SELECT t.id, t.user_id, t.type, t.amount, t.description,
        t.category_id, t.employee_id, t.payment_method, t.qty_total,
        t.locked, t.discount_amount, t.original_amount, t.promo_code_id,
        t.payment_group_id,
        TO_CHAR(t.date, 'YYYY-MM-DD') as date,
        TO_CHAR(t.time, 'HH24:MI') as time,
        t.datetime_iso, t.appointment_id, t.source, t.created_at,
        c.name as category_name, c.icon as category_icon, c.color as category_color,
        e.name as employee_name, e.avatar_color as employee_avatar_color,
        ru.id as referral_use_id, ru.status as referral_status,
        rc.code as referral_code, rc.owner_client_email as referral_parrain_email,
        pca.first_name as referral_parrain_first_name,
        pca.last_name  as referral_parrain_last_name,
        COALESCE((
          SELECT json_agg(json_build_object(
            'service_id', ti.service_id,
            'service_name', ti.service_name,
            'qty', ti.qty,
            'unit_price', ti.unit_price
          ) ORDER BY ti.created_at)
          FROM transaction_items ti WHERE ti.transaction_id = t.id
        ), '[]'::json) AS items,
        COALESCE((
          SELECT json_agg(json_build_object(
            'method', tp.method,
            'amount', tp.amount
          ) ORDER BY tp.created_at)
          FROM transaction_payments tp WHERE tp.transaction_id = t.id
        ), '[]'::json) AS payments
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN employees e  ON t.employee_id = e.id
       LEFT JOIN referral_uses ru
              ON (ru.transaction_id = t.id OR ru.appointment_id = t.appointment_id)
             AND ru.user_id = t.user_id
       LEFT JOIN referral_codes rc ON rc.id = ru.referral_code_id
       LEFT JOIN client_accounts pca
              ON pca.user_id = t.user_id
             AND LOWER(pca.email) = LOWER(rc.owner_client_email)
       WHERE ${filters.join(' AND ')}
       ORDER BY t.date DESC, t.time DESC NULLS LAST, t.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    if (noFilter) global.memCache?.set(_tk, rows, 30 * 1000);
    res.json(rows);
  } catch(e) { console.error('[TX GET]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── POST / — créer une transaction (toujours locked=true) ────────────────────
router.post('/', async (req, res) => {
  try {
    const { type, amount, description, category_id, employee_id, payment_method,
            date, time, datetime_iso, appointment_id, source,
            client_email, client_name,
            promo_code_id, discount_amount, original_amount,
            client_note, items, payments, referral_code,
            client_reward_id,
            payment_breakdown,
            idempotency_key } = req.body;
    if (!type || amount == null || !date)
      return res.status(400).json({ error: 'Champs obligatoires manquants.' });
    // Audit V : validations strictes inputs (aligné K/P/O).
    if (!VALID_TX_TYPES.has(String(type)))
      return res.status(400).json({ error: 'Type de transaction invalide.' });
    if (payment_method && !VALID_TX_METHODS.has(String(payment_method)))
      return res.status(400).json({ error: 'Mode de paiement invalide.' });
    if (!isRealDate(String(date)))
      return res.status(400).json({ error: 'Date invalide (attendu YYYY-MM-DD).' });
    if (typeof description === 'string' && description.length > MAX_DESC_LEN)
      return res.status(400).json({ error: 'Description trop longue.' });
    if (typeof client_note === 'string' && client_note.length > MAX_NOTE_LEN)
      return res.status(400).json({ error: 'Note client trop longue.' });

    // AUDIT perms : enforcement can_encash.
    // 1. Si req.employee présent (header x-employee-pin valide) → source
    //    de vérité. On OVERRIDE body.employee_id pour empêcher le spoofing
    //    (un employé avec le PIN de Jean ne peut pas l'attribuer à Marie).
    //    Vérif stricte can_encash.
    // 2. Sinon si body.employee_id fourni → check permission (commit A
    //    enforcement minimal : un JWT merchant seul suffit, mais au moins
    //    on valide que l'employé désigné a can_encash).
    // 3. Sinon (no header, no body) → présumé action merchant (JWT).
    let effectiveEmployeeId = employee_id || null;
    if (req.employee) {
      if (type === 'revenue' && !req.employee.can_encash) {
        return res.status(403).json({
          error: "Vous n'avez pas la permission d'encaisser.",
          code: 'NO_ENCASH_PERMISSION',
        });
      }
      // Override : source de vérité = token PIN
      effectiveEmployeeId = req.employee.id;
    } else if (employee_id && type === 'revenue') {
      const { rows: empR } = await pool.query(
        'SELECT can_encash FROM employees WHERE id=$1 AND user_id=$2',
        [employee_id, req.user.userId]
      );
      if (!empR.length || !empR[0].can_encash) {
        return res.status(403).json({
          error: "Cet employé n'a pas la permission d'encaisser.",
          code: 'NO_ENCASH_PERMISSION',
        });
      }
    }

    // AUDIT perms : can_use_promo — front only avant ce commit. Si req.employee
    // présent et promo utilisée, verify flag côté back aussi.
    if (req.employee && promo_code_id && !req.employee.can_use_promo) {
      return res.status(403).json({
        error: "Vous n'avez pas la permission d'appliquer des promotions.",
        code: 'NO_PROMO_PERMISSION',
      });
    }

    // R1 : idempotency key — si le client a envoyé le même UUID (double-clic,
    // retry réseau, React StrictMode), on renvoie la transaction déjà créée
    // au lieu d'en créer une nouvelle.
    const idemKey = String(idempotency_key || '').trim().slice(0, 64) || null;
    // Normalisation client_email : LOWER + TRIM partout pour éviter la
    // fragmentation fidélité entre 'JOHN@X.COM' et 'john@x.com'. Les lectures
    // utilisent déjà LOWER() côté agenda/loyalty, on aligne les writes.
    const clientEmailNorm = (typeof client_email === 'string' && client_email.trim())
      ? client_email.trim().toLowerCase()
      : null;
    if (idemKey) {
      const { rows: ex } = await pool.query(
        `SELECT id, type, amount, description, category_id, employee_id,
                payment_method, qty_total, locked, client_email,
                TO_CHAR(date,'YYYY-MM-DD') as date, TO_CHAR(time,'HH24:MI') as time,
                datetime_iso, appointment_id, source, created_at
           FROM transactions
          WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1`,
        [req.user.userId, idemKey]
      );
      if (ex.length) {
        return res.status(200).json({ ...ex[0], idempotent_replay: true });
      }
    }

    // R2 : validation montant + sum split payments.
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      return res.status(400).json({ error: 'Montant invalide (doit être ≥ 0).' });
    }
    // Audit V : cap NUMERIC(10,2) safe + borne métier réaliste.
    if (amt > MAX_AMOUNT) {
      return res.status(400).json({ error: `Montant trop élevé (max ${MAX_AMOUNT} €).` });
    }
    const payListRaw = Array.isArray(payments)
      ? payments.filter(p => p && p.method && parseFloat(p.amount) > 0)
      : [];
    if (payListRaw.length > 1) {
      const sumPay = payListRaw.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      if (Math.abs(sumPay - amt) > 0.01) {
        return res.status(400).json({
          error: `Somme des paiements (${sumPay.toFixed(2)} €) ≠ total (${amt.toFixed(2)} €).`,
          code: 'SPLIT_MISMATCH',
        });
      }
    }

    // ── Parrainage (encaissement caisse d'un filleul) ───────────────────────
    // Si referral_code fourni, on le valide côté serveur AVANT insert pour
    // empêcher la création d'une transaction trompeuse (fraude prix).
    // Priorité au code promo classique si les deux sont fournis (non-cumul).
    let referralCtx = null;
    const incomingRef = String(referral_code || '').trim().toUpperCase();
    if (!promo_code_id && incomingRef && client_email && type === 'revenue') {
      try {
        const baseAmt = parseFloat(original_amount || amount) || 0;
        const resolved = await resolveReferralForFilleul(
          req.user.userId, incomingRef, client_email, baseAmt
        );
        if (!resolved.ok) {
          // Message pédagogique unifié côté client (meilleure UX). Cas
          // spécifiques gardés séparés quand l'info est utile au cashier :
          //  - code_not_found : probablement une faute de frappe
          //  - program_disabled : côté commerçant, pas le filleul
          const msg = resolved.reason === 'code_not_found'
            ? 'Code parrainage inconnu — vérifiez la saisie.'
            : resolved.reason === 'program_disabled'
            ? 'Programme parrainage désactivé.'
            : 'Ce client ne peut pas bénéficier de ce programme de parrainage car il ne répond pas aux conditions définies par le commerçant.';
          return res.status(400).json({ error: msg, reason: resolved.reason });
        }
        referralCtx = resolved;
      } catch (e) {
        console.warn('[TX referral pre-check]', e.message);
      }
    }

    // ── Items normalisés → qty_total ──────────────────────────────────────────
    const itemList = Array.isArray(items) ? items.filter(it => it && it.service_name) : [];
    const qtyTotal = itemList.length
      ? itemList.reduce((s, it) => s + (parseInt(it.qty) || 1), 0)
      : 1;
    // Validation : items.length capé + somme(qty × unit_price) cohérente avec
    // amount. Tolérance 0.01€ pour les arrondis. Sinon ITEMS_AMOUNT_MISMATCH.
    if (itemList.length > 20) {
      return res.status(400).json({
        error: 'Trop de prestations sur une seule transaction (max 20).',
        code: 'ITEMS_TOO_MANY',
      });
    }
    if (itemList.length > 0) {
      const itemsSum = itemList.reduce(
        (s, it) => s + ((parseFloat(it.unit_price) || 0) * (parseInt(it.qty) || 1)),
        0
      );
      if (Math.abs(itemsSum - amt) > 0.01) {
        return res.status(400).json({
          error: `La somme des prestations (${itemsSum.toFixed(2)} €) ne correspond pas au montant total (${amt.toFixed(2)} €).`,
          code: 'ITEMS_AMOUNT_MISMATCH',
        });
      }
    }

    // ── Paiements normalisés → méthode stockée + breakdown ────────────────────
    // Réutilise payListRaw déjà filtré + validé (sum check en R2 plus haut).
    const payList = payListRaw;
    const pmStored = payList.length > 1
      ? 'multi'
      : (payList[0]?.method || payment_method || 'cash');

    // Résoudre global_client_id depuis l'email (cross-commerçant → passage sur place
    // visible sur le compte client connecté).
    let globalClientId = null;
    if (clientEmailNorm) {
      try {
        const { rows: gc } = await pool.query(
          'SELECT id FROM global_clients WHERE LOWER(email)=$1 LIMIT 1',
          [clientEmailNorm]
        );
        if (gc.length) globalClientId = gc[0].id;
      } catch (e) { console.warn('[TX global_client lookup]', e.message); }
    }

    // signedByEmployeeId : déclaré ICI (avant la branche CAS B qui s'en sert
    // dans les INSERT multi-rows) — sinon TDZ "Cannot access 'signedByEmployeeId'
    // before initialization" lors d'un POST avec payment_breakdown.
    // Définition : employé identifié par son PIN (x-employee-pin valide →
    // req.employee.id), distinct de employee_id (celui assigné au RDV / à
    // la ligne). Permet de retrouver QUI a encaissé physiquement en mode
    // tablette. Null si merchant PIN admin ou création direct merchant.
    const signedByEmployeeId = req.employee ? req.employee.id : null;

    // ── CAS B — Multi-paiement traçable (Commit A) ──────────────────────────
    // Si payment_breakdown présent → crée N rows en TRANSACTION SQL, liées
    // par un payment_group_id partagé. Chaque row porte sa propre méthode +
    // montant. Permet l'audit FEC/RGPD et des stats EN CAISSE cohérentes.
    // Rétro-compat : absent ou [] → flow single-row classique ci-dessous.
    if (Array.isArray(payment_breakdown) && payment_breakdown.length > 0) {
      // Validation longueur
      if (payment_breakdown.length < 2) {
        return res.status(400).json({
          error: 'Le multi-paiement doit contenir au moins 2 méthodes (sinon utiliser le flow simple).',
          code: 'BREAKDOWN_SINGLE_ITEM',
        });
      }
      if (payment_breakdown.length > 4) {
        return res.status(400).json({
          error: 'Le multi-paiement ne peut excéder 4 méthodes.',
          code: 'BREAKDOWN_TOO_MANY_METHODS',
        });
      }
      // Validation par item + somme + doublons
      const seenMethods = new Set();
      let sumCents = 0;
      for (let i = 0; i < payment_breakdown.length; i++) {
        const it = payment_breakdown[i];
        if (!it || typeof it !== 'object') {
          return res.status(400).json({
            error: `Élément ${i + 1} du multi-paiement invalide.`,
            code: 'BREAKDOWN_INVALID_ITEM',
          });
        }
        if (it.method === 'card_online') {
          return res.status(400).json({
            error: 'Le mode card_online est réservé aux paiements Stripe en ligne et ne peut pas être combiné en multi-paiement.',
            code: 'BREAKDOWN_CARD_ONLINE_NOT_SUPPORTED',
          });
        }
        if (typeof it.method !== 'string' || !BREAKDOWN_METHODS.has(it.method)) {
          return res.status(400).json({
            error: `Mode de paiement invalide dans le multi-paiement : ${it.method}.`,
            code: 'BREAKDOWN_INVALID_METHOD',
          });
        }
        if (!Number.isInteger(it.amount_cents) || it.amount_cents <= 0) {
          return res.status(400).json({
            error: `Montant invalide pour ${it.method} (entier > 0 attendu en centimes).`,
            code: 'BREAKDOWN_INVALID_AMOUNT',
          });
        }
        if (seenMethods.has(it.method)) {
          return res.status(400).json({
            error: `Mode de paiement en doublon dans le multi-paiement : ${it.method}.`,
            code: 'BREAKDOWN_DUPLICATE_METHODS',
          });
        }
        seenMethods.add(it.method);
        sumCents += it.amount_cents;
      }
      const totalCents = Math.round(amt * 100);
      if (sumCents !== totalCents) {
        return res.status(400).json({
          error: `La somme du multi-paiement (${(sumCents / 100).toFixed(2)} €) ne correspond pas au total (${amt.toFixed(2)} €).`,
          code: 'BREAKDOWN_SUM_MISMATCH',
        });
      }

      // Idempotency replay : si on retrouve `<idemKey>-1` en BDD, on renvoie
      // le groupe existant sans rejouer les INSERT (double-clic, retry réseau).
      if (idemKey) {
        const { rows: existingFirst } = await pool.query(
          `SELECT payment_group_id FROM transactions
            WHERE user_id=$1::uuid AND idempotency_key=$2::text LIMIT 1`,
          [req.user.userId, `${idemKey}-1`]
        );
        if (existingFirst.length && existingFirst[0].payment_group_id) {
          const grpId = existingFirst[0].payment_group_id;
          const { rows: grpRows } = await pool.query(
            `SELECT id, payment_method AS method, amount
               FROM transactions
              WHERE user_id=$1::uuid AND payment_group_id=$2::uuid
              ORDER BY created_at`,
            [req.user.userId, grpId]
          );
          const tot = grpRows.reduce((s, r) => s + parseFloat(r.amount), 0);
          return res.status(200).json({
            success: true,
            idempotent_replay: true,
            payment_group_id: grpId,
            transactions: grpRows.map(r => ({
              id: r.id, method: r.method, amount: parseFloat(r.amount),
            })),
            total_amount: tot,
            count: grpRows.length,
          });
        }
      }

      // Anti-double-encaissement : check une seule fois en passant la SOMME
      // comme amount validé. Détermine aussi payment_source / payment_type.
      let multiPaymentSource;
      let multiPaymentType = 'full';
      if (!appointment_id) {
        multiPaymentSource = 'walkin';
      } else {
        const validation = await canCreateCashTransaction(appointment_id);
        if (!validation.allow) {
          return res.status(409).json({
            error: 'Ce RDV est déjà encaissé intégralement.',
            code: 'ALREADY_PAID',
            existing_status: validation.existing_status,
          });
        }
        multiPaymentSource = 'cash_register_rdv';
        multiPaymentType = validation.type === 'remaining' ? 'remaining' : 'full';
      }
      const multiPaymentStatus = type === 'revenue' ? 'CASH_PAID' : null;
      const groupId = require('crypto').randomUUID();
      const paidAt = multiPaymentStatus === 'CASH_PAID' ? new Date() : null;

      // Transaction SQL atomique (BEGIN/COMMIT/ROLLBACK).
      const dbClient = await pool.connect();
      const insertedRows = [];
      const methodsLog = [];
      try {
        await dbClient.query('BEGIN');
        for (let i = 0; i < payment_breakdown.length; i++) {
          const item = payment_breakdown[i];
          const itemAmt = item.amount_cents / 100;
          const itemIdemKey = idemKey ? `${idemKey}-${i + 1}` : null;
          const r = await dbClient.query(
            `INSERT INTO transactions
              (user_id, type, amount, description, category_id, employee_id,
               payment_method, date, time, datetime_iso, appointment_id, source, locked,
               promo_code_id, discount_amount, original_amount, client_email, client_note,
               qty_total, global_client_id, idempotency_key, signed_by_employee_id,
               payment_source, payment_status, payment_type,
               gross_amount_cents, stripe_fee_cents, platform_fee_cents, net_amount_cents,
               paid_at, payment_group_id)
             VALUES ($1::uuid, $2::text, $3::numeric, $4::text, $5::uuid, $6::uuid,
                     $7::text, $8::date, $9::time, $10::text, $11::uuid, $12::text, TRUE,
                     $13::uuid, $14::numeric, $15::numeric, $16::text, $17::text,
                     $18::integer, $19::uuid, $20::text, $21::uuid,
                     $22::text, $23::text, $24::text,
                     $25::integer, $26::integer, $27::integer, $28::integer,
                     $29::timestamptz, $30::uuid)
             RETURNING id`,
            [req.user.userId, type, itemAmt, description || null, category_id || null,
             effectiveEmployeeId, item.method, date, time || null,
             datetime_iso || null, appointment_id || null, source || 'manual',
             promo_code_id || null, discount_amount || 0, original_amount || null,
             clientEmailNorm, client_note || null, qtyTotal, globalClientId,
             itemIdemKey, signedByEmployeeId,
             multiPaymentSource, multiPaymentStatus, multiPaymentType,
             item.amount_cents, 0, 0, item.amount_cents,
             paidAt, groupId]
          );
          insertedRows.push({ id: r.rows[0].id, method: item.method, amount: itemAmt });
          methodsLog.push(`${item.method}:${item.amount_cents}c`);
        }
        // ── Items granulaires : stockés UNIQUEMENT sur la 1re row du groupe
        // (la rep_row). Une vente = 1 set d'items même si encaissée en N
        // sous-paiements. Cohérent avec booking/checkout.js + le GET
        // /historique qui LEFT JOIN sur la rep_row.
        if (itemList.length && insertedRows.length) {
          const repId = insertedRows[0].id;
          for (const it of itemList) {
            await dbClient.query(
              `INSERT INTO transaction_items (transaction_id, service_id, service_name, qty, unit_price)
               VALUES ($1::uuid, $2::uuid, $3::text, $4::integer, $5::numeric)`,
              [repId, it.service_id || null, it.service_name,
               parseInt(it.qty) || 1, parseFloat(it.unit_price) || 0]
            );
          }
        }
        await dbClient.query('COMMIT');
      } catch (err) {
        try { await dbClient.query('ROLLBACK'); } catch {}
        console.error(`[TX POST MULTI] rollback group=${groupId} reason=${err.message}`);
        // Race idempotency : si le -1 vient d'être inséré par un autre process
        // entre notre check et notre INSERT, on relit et on renvoie le groupe.
        if (idemKey && /idempotency_key/.test(err.message || '')) {
          try {
            const { rows: ex } = await pool.query(
              `SELECT payment_group_id FROM transactions
                WHERE user_id=$1::uuid AND idempotency_key=$2::text LIMIT 1`,
              [req.user.userId, `${idemKey}-1`]
            );
            if (ex.length && ex[0].payment_group_id) {
              const { rows: grp } = await pool.query(
                `SELECT id, payment_method AS method, amount
                   FROM transactions
                  WHERE user_id=$1::uuid AND payment_group_id=$2::uuid
                  ORDER BY created_at`,
                [req.user.userId, ex[0].payment_group_id]
              );
              const tot = grp.reduce((s, r) => s + parseFloat(r.amount), 0);
              return res.status(200).json({
                success: true,
                idempotent_replay: true,
                payment_group_id: ex[0].payment_group_id,
                transactions: grp.map(r => ({ id: r.id, method: r.method, amount: parseFloat(r.amount) })),
                total_amount: tot,
                count: grp.length,
              });
            }
          } catch {}
        }
        return res.status(500).json({
          error: 'Erreur lors de la création du multi-paiement.',
          code: 'MULTI_INSERT_FAILED',
        });
      } finally {
        try { dbClient.release(); } catch {}
      }

      // Cache + log structuré (audit trail).
      try { invalidateUserStatsCache(req.user.userId); } catch {}
      global.memCache?.del(`txs:${req.user.userId}`);
      invalidateStatsCache(req.user.userId);
      console.log(`[TX POST MULTI] inserted group=${groupId} count=${insertedRows.length}`
        + ` user=${req.user.userId} total=${sumCents}c methods=[${methodsLog.join(',')}]`);

      // Audit log : 1 entrée par row (traçabilité FEC).
      for (const r of insertedRows) {
        try {
          await audit(req.user.userId, r.id, 'create', null,
            { ...r, payment_group_id: groupId, total_amount: amt }, 'multi_payment');
        } catch (e) { console.warn('[TX POST MULTI audit]', e.message); }
      }

      // Fidélité : 1 seul incrément avec le total (le breakdown = 1 vente).
      if (type === 'revenue') {
        try {
          let cEmail = clientEmailNorm;
          let cName = client_name || null;
          if (!cEmail && appointment_id) {
            const { rows: appt } = await pool.query(
              'SELECT client_email, client_name FROM appointments WHERE id=$1 AND user_id=$2',
              [appointment_id, req.user.userId]
            );
            if (appt.length) {
              cEmail = (appt[0].client_email || '').toLowerCase().trim() || null;
              cName = appt[0].client_name;
            }
          }
          if (cEmail) {
            await incrementStamps(req.user.userId, cEmail, cName, 1, 'physical', amt || 0);
            try {
              const parts = (cName || '').split(' ');
              await upsertLocalClient(req.user.userId, {
                email: cEmail,
                first_name: parts[0] || '',
                last_name: parts.slice(1).join(' ') || '',
              });
            } catch (e2) { console.warn('[AUTO-CLIENT MULTI]', e2.message); }
          }
        } catch (loyErr) { console.error('[FIDELITE MULTI ERR]', loyErr.message); }
      }

      return res.status(201).json({
        success: true,
        payment_group_id: groupId,
        transactions: insertedRows,
        total_amount: amt,
        count: insertedRows.length,
      });
    }

    // INSERT avec ON CONFLICT sur (user_id, idempotency_key) — si le client
    // a envoyé la même clé en race (double-clic), la 2e tentative ne crée pas
    // de doublon. RETURNING vide → on SELECT l'existant et retourne.
    // (signedByEmployeeId est déclaré plus haut, avant la branche CAS B.)

    // ── Refonte v3 : derive payment_source / payment_status / *_cents ─────
    // Double ecriture des nouveaux champs en parallele du legacy (source,
    // amount). Sans ca, /historique et /statistiques v3 voient ces rows
    // comme NULL et les excluent ou les comptent dans "unclassified".
    //
    // Mapping :
    //   type='expense'                                 -> tous v3 NULL (hors modele)
    //   type='revenue', appointment_id IS NULL         -> walkin / CASH_PAID / 'full'
    //   type='revenue', appointment_id IS NOT NULL     -> cash_register_rdv / CASH_PAID
    //                                                     'remaining' si STRIPE_ACOMPTE existe,
    //                                                     'full' sinon. Bloque si STRIPE_100/CASH_PAID
    //                                                     deja present (anti-double-encaissement).
    //   type='refund'/'adjustment'                     -> v3 NULL (hors modele)
    let v3PaymentSource = null;
    let v3PaymentStatus = null;
    let v3PaymentType   = null;
    let v3GrossCents    = null;
    let v3NetCents      = null;
    if (type === 'revenue') {
      const grossCents = Math.round(parseFloat(amt) * 100);
      if (!appointment_id) {
        v3PaymentSource = 'walkin';
        v3PaymentStatus = 'CASH_PAID';
        v3PaymentType   = 'full';
        v3GrossCents    = grossCents;
        v3NetCents      = grossCents;
      } else {
        const validation = await canCreateCashTransaction(appointment_id);
        if (!validation.allow) {
          return res.status(409).json({
            error: 'Ce RDV est deja encaisse integralement.',
            code: 'ALREADY_PAID',
            existing_status: validation.existing_status,
          });
        }
        v3PaymentSource = 'cash_register_rdv';
        v3PaymentStatus = 'CASH_PAID';
        v3PaymentType   = validation.type === 'remaining' ? 'remaining' : 'full';
        v3GrossCents    = grossCents;
        v3NetCents      = grossCents;
      }
    }

    // paid_at calcule en JS (au lieu d'un CASE WHEN $23 = 'CASH_PAID' dans
    // le SQL qui utilisait $23 deux fois -> PG echouait avec "inconsistent
    // types deduced for parameter $23" quand v3PaymentStatus etait null
    // pour les rows type='expense'). 1 seul slot par param, casts explicites
    // sur les params nullables pour que PG infere le bon type meme sur null.
    const v3PaidAt = v3PaymentStatus === 'CASH_PAID' ? new Date() : null;

    const insertResult = await pool.query(
      `INSERT INTO transactions
        (user_id, type, amount, description, category_id, employee_id,
         payment_method, date, time, datetime_iso, appointment_id, source, locked,
         promo_code_id, discount_amount, original_amount, client_email, client_note,
         qty_total, global_client_id, idempotency_key, signed_by_employee_id,
         payment_source, payment_status, payment_type,
         gross_amount_cents, net_amount_cents, paid_at)
       VALUES ($1::uuid, $2::text, $3::numeric, $4::text, $5::uuid, $6::uuid,
               $7::text, $8::date, $9::time, $10::text, $11::uuid, $12::text, TRUE,
               $13::uuid, $14::numeric, $15::numeric, $16::text, $17::text,
               $18::integer, $19::uuid, $20::text, $21::uuid,
               $22::text, $23::text, $24::text,
               $25::integer, $26::integer, $27::timestamptz)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING
       RETURNING id, user_id, type, amount, description, category_id, employee_id,
         payment_method, locked, client_email, client_note, qty_total,
         TO_CHAR(date, 'YYYY-MM-DD') as date,
         TO_CHAR(time, 'HH24:MI') as time,
         datetime_iso, appointment_id, source, signed_by_employee_id, created_at`,
      [req.user.userId, type, amt, description || null, category_id || null,
       effectiveEmployeeId, pmStored, date, time || null,
       datetime_iso || null, appointment_id || null, source || 'manual',
       promo_code_id || null, discount_amount || 0, original_amount || null,
       clientEmailNorm, client_note || null, qtyTotal, globalClientId,
       idemKey, signedByEmployeeId,
       v3PaymentSource, v3PaymentStatus, v3PaymentType,
       v3GrossCents, v3NetCents, v3PaidAt]
    );
    // Invalide le cache stats v3 du user (la nouvelle tx doit apparaitre
    // immediatement dans /historique et /statistiques).
    if (insertResult.rows.length && type === 'revenue') {
      try { invalidateUserStatsCache(req.user.userId); } catch {}
      console.log('[TX POST] inserted tx=' + insertResult.rows[0].id
        + ' user=' + req.user.userId
        + ' payment_source=' + (v3PaymentSource || '-')
        + ' payment_status=' + (v3PaymentStatus || '-')
        + ' gross_cents=' + (v3GrossCents || 0));
    }
    if (!insertResult.rows.length && idemKey) {
      // Race idempotency : un autre process a gagné. Retourner sa transaction.
      const { rows: existing } = await pool.query(
        `SELECT id, type, amount, description, category_id, employee_id,
                payment_method, qty_total, locked, client_email,
                TO_CHAR(date,'YYYY-MM-DD') as date, TO_CHAR(time,'HH24:MI') as time,
                datetime_iso, appointment_id, source, created_at
           FROM transactions WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1`,
        [req.user.userId, idemKey]
      );
      return res.status(200).json({ ...(existing[0] || {}), idempotent_replay: true });
    }
    const tx = insertResult.rows[0];

    // ── Insérer transaction_items ─────────────────────────────────────────────
    if (itemList.length) {
      for (const it of itemList) {
        await pool.query(
          `INSERT INTO transaction_items (transaction_id, service_id, service_name, qty, unit_price)
           VALUES ($1,$2,$3,$4,$5)`,
          [tx.id, it.service_id || null, it.service_name,
           parseInt(it.qty) || 1, parseFloat(it.unit_price) || 0]
        );
      }
      tx.items = itemList.map(it => ({
        service_id: it.service_id || null,
        service_name: it.service_name,
        qty: parseInt(it.qty) || 1,
        unit_price: parseFloat(it.unit_price) || 0,
      }));
    }

    // ── Insérer transaction_payments (si split) ───────────────────────────────
    if (payList.length > 1) {
      for (const p of payList) {
        await pool.query(
          `INSERT INTO transaction_payments (transaction_id, method, amount)
           VALUES ($1,$2,$3)`,
          [tx.id, p.method, parseFloat(p.amount) || 0]
        );
      }
      tx.payments = payList.map(p => ({
        method: p.method, amount: parseFloat(p.amount) || 0,
      }));
    }

    // Invalider le cache liste + stats
    global.memCache?.del(`txs:${req.user.userId}`);
    invalidateStatsCache(req.user.userId);

    // Sauvegarder la note client dans client_notes si fournie
    if (client_note && client_note.trim() && (clientEmailNorm || client_name)) {
      await pool.query(
        `INSERT INTO client_notes
           (user_id, client_email, client_name, note_text, appointment_id,
            created_by_employee_id, created_by_name)
         VALUES ($1,$2,$3,$4,NULL,$5,$6)`,
        [req.user.userId, clientEmailNorm, client_name || null,
         client_note.trim(), employee_id || null, null]
      ).catch(e => console.error('[CLIENT NOTE ERR]', e.message));
    }

    // Incrémenter uses_count du code promo si utilisé.
    // Audit caisse : UPDATE atomique avec WHERE max_uses — si le code a
    // atteint sa limite entre la vérif initiale et cet INSERT (race 2 caisses
    // simultanées), le UPDATE ne touchera pas la ligne (is_active bascule
    // automatiquement à FALSE via CASE). Le RETURNING sert à tracer les cas
    // où l'increment a été rejeté (utile pour diagnostic).
    if (promo_code_id) {
      await pool.query(
        `UPDATE promo_codes
           SET uses_count = uses_count + 1,
               is_active  = CASE
                 WHEN max_uses IS NOT NULL AND (uses_count + 1) >= max_uses THEN FALSE
                 ELSE is_active
               END
         WHERE id=$1 AND user_id=$2
           AND is_active = TRUE
           AND (max_uses IS NULL OR uses_count < max_uses)
         RETURNING id`,
        [promo_code_id, req.user.userId]
      ).then(r => {
        if (!r.rows.length) console.warn('[PROMO COUNT race] max_uses atteint concurrent', { promo_code_id });
      }).catch(e => console.error('[PROMO COUNT ERR]', e.message));

      // Log traçabilité usage avec montant transaction
      const logEmail = clientEmailNorm;
      const logName  = client_name  || null;
      await pool.query(
        `INSERT INTO promo_usage_logs
           (user_id,promo_code_id,code_snapshot,client_email,client_name,
            transaction_id,discount_applied,transaction_amount)
         VALUES ($1,$2,(SELECT code FROM promo_codes WHERE id=$2),$3,$4,$5,$6,$7)`,
        [req.user.userId, promo_code_id, logEmail, logName, tx.id,
         discount_amount||0, original_amount||amount||0]
      ).catch(e => console.error('[PROMO LOG ERR]', e.message));

      // Non-cumulabilité : marquer la client_rewards liée au promo comme
      // 'used' (filet de sécurité au cas où le front n'appelle pas
      // POST /referrals/rewards/:id/use). Une seule réduction consommée.
      await pool.query(
        `UPDATE client_rewards
            SET status='used', used_at=NOW()
          WHERE user_id=$1 AND promo_code_id=$2 AND status='available'`,
        [req.user.userId, promo_code_id]
      ).catch(() => {});
    }

    // Désactivation immédiate de la reward sélectionnée à la caisse —
    // anti-fraude / anti-double-utilisation. UPDATE atomique : si la ligne
    // est déjà 'used' (race avec un autre encaissement), aucun row ne
    // matche → silencieux. Le filtrage user_id préserve le multi-tenant.
    // Ce mécanisme est complémentaire de l'UPDATE par promo_code_id
    // au-dessus : il couvre les rewards sans promo_code_id (rewards directes
    // type "service offert") et garantit la désactivation de la ligne
    // exacte choisie par l'employé.
    if (client_reward_id) {
      await pool.query(
        `UPDATE client_rewards
            SET status='used', used_at=NOW()
          WHERE id=$1 AND user_id=$2 AND status='available'`,
        [client_reward_id, req.user.userId]
      ).catch(e => console.error('[REWARD USE INLINE ERR]', e.message));
    }

    // ── Parrainage : créer referral_uses + auto-valider (caisse = payé immédiat)
    if (referralCtx?.ok) {
      try {
        const { rows: ru } = await pool.query(
          `INSERT INTO referral_uses
             (user_id, referral_code_id, filleul_email, transaction_id, status)
           VALUES ($1,$2,$3,$4,'pending') RETURNING id`,
          [req.user.userId, referralCtx.refCodeId, referralCtx.filleulEmail, tx.id]
        );
        try {
          const vres = await validateReferralUse(ru[0].id, req.user.userId);
          tx.referral_validated = !!vres?.ok;
          tx.referral_code      = incomingRef;
          tx.referral_parrain_email = referralCtx.parrainEmail;
        } catch (vErr) {
          console.warn('[TX referral auto-validate]', vErr.message);
          tx.referral_validated = false;
          tx.referral_code      = incomingRef;
        }
      } catch (rErr) {
        console.warn('[TX referral insert]', rErr.message);
      }
    }

    // Audit : création
    await audit(req.user.userId, tx.id, 'create', null, tx, null);

    // ── Incrément automatique fidélité ─────────────────────────────────────
    if (tx.type === 'revenue') {
      try {
        let clientEmail = clientEmailNorm;
        let clientName  = req.body.client_name  || null;
        if (!clientEmail && req.body.appointment_id) {
          // Audit V : scope user_id — sans ce filtre, un merchant peut POST
          // avec un appointment_id d'un autre merchant et lire son
          // client_email/name (data leak cross-tenant via fidélité).
          const { rows: appt } = await pool.query(
            'SELECT client_email, client_name FROM appointments WHERE id=$1 AND user_id=$2',
            [req.body.appointment_id, req.user.userId]
          );
          if (appt.length) {
            clientEmail = (appt[0].client_email || '').toLowerCase().trim() || null;
            clientName = appt[0].client_name;
          }
        }
        if (clientEmail) {
          // Les transactions manuelles (caisse) = source 'physical'
          await incrementStamps(req.user.userId, clientEmail, clientName, 1, 'physical', amt || 0);
          // Auto-créer/mettre à jour la fiche client locale
          try {
            const parts = (clientName || '').split(' ');
            await upsertLocalClient(req.user.userId, {
              email: clientEmail,
              first_name: parts[0] || '',
              last_name: parts.slice(1).join(' ') || '',
            });
          } catch(e2) { console.warn('[AUTO-CLIENT]', e2.message); }
        }
      } catch(loyErr) {
        console.error('[FIDELITE ERR]', loyErr.message);
      }
    }

    res.status(201).json(tx);
  } catch(e) { console.error('[TX POST]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── PUT /:id — modifier (admin PIN requis + audit) ────────────────────────────
//   Mise à jour complète : champs de base + items[] + payments[] + infos client.
//   Les items et payments sont remplacés intégralement (delete + re-insert) pour
//   garantir la cohérence avec stats / commissions / recaps (qui lisent
//   transaction_items et transaction_payments).
router.put('/:id', pinAdminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const {
      type, amount, description, category_id, employee_id,
      payment_method, date, time, datetime_iso, reason,
      client_email, /* client_name unused */ client_note,
      items, payments, payment_breakdown,
    } = body;

    // Accepter le nouveau nom `payment_breakdown` (avec amount_cents) en
    // priorité, puis fallback sur l'ancien `payments` (avec amount en euros)
    // pour rétro-compat. Normaliser en interne vers `payList` = [{method, amount}]
    // (amount en euros) — le reste du handler n'a pas besoin de changer.
    const hasBreakdownField = has('payment_breakdown');
    const hasPaymentsField  = has('payments');
    const rawBreakdownInput = hasBreakdownField
      ? (Array.isArray(payment_breakdown) ? payment_breakdown : null)
      : (hasPaymentsField && Array.isArray(payments) ? payments : null);
    const hasBreakdownPayload = rawBreakdownInput !== null;
    // payments_norm = liste normalisée {method, amount(€)} pour le reste du code.
    const payments_norm = hasBreakdownPayload
      ? rawBreakdownInput
          .map(p => {
            if (!p || typeof p.method !== 'string') return null;
            // amount_cents prioritaire si présent ; sinon amount (euros).
            let amt;
            const ac = parseFloat(p.amount_cents);
            if (Number.isFinite(ac)) {
              amt = ac / 100;
            } else {
              amt = parseFloat(p.amount);
            }
            if (!Number.isFinite(amt) || amt <= 0) return null;
            return { method: p.method, amount: amt };
          })
          .filter(Boolean)
      : null;

    // Audit V : validations strictes UNIQUEMENT sur les champs envoyés.
    // PATCH semantics — un champ absent du body n'est pas validé ni écrit
    // (avant : `type=undefined` était lié en NULL et violait NOT NULL).
    if (has('type') && !VALID_TX_TYPES.has(String(type))) {
      client.release();
      return res.status(400).json({ error: 'Type de transaction invalide.' });
    }
    if (has('payment_method') && payment_method != null
        && !VALID_TX_METHODS.has(String(payment_method))) {
      client.release();
      return res.status(400).json({ error: 'Mode de paiement invalide.' });
    }
    if (has('date') && date && !isRealDate(String(date))) {
      client.release();
      return res.status(400).json({ error: 'Date invalide (attendu YYYY-MM-DD).' });
    }
    if (has('amount') && amount != null) {
      const amtPut = parseFloat(amount);
      if (!Number.isFinite(amtPut) || amtPut < 0 || amtPut > MAX_AMOUNT) {
        client.release();
        return res.status(400).json({ error: 'Montant invalide.' });
      }
    }
    if (has('description') && typeof description === 'string'
        && description.length > MAX_DESC_LEN) {
      client.release();
      return res.status(400).json({ error: 'Description trop longue.' });
    }
    if (has('client_note') && typeof client_note === 'string'
        && client_note.length > MAX_NOTE_LEN) {
      client.release();
      return res.status(400).json({ error: 'Note client trop longue.' });
    }

    const before = await getSnapshot(req.params.id);
    if (!before || before.user_id !== req.user.userId) {
      client.release();
      return res.status(404).json({ error: 'Transaction introuvable.' });
    }
    if (before.deleted_at) {
      // Une row soft-deletée n'est plus éditable — cohérent avec la liste
      // /historique qui ne l'affiche plus, et anti-fraude (impossible de
      // ressusciter une ligne sans audit).
      client.release();
      return res.status(404).json({
        error: 'Transaction introuvable ou déjà supprimée.',
        code:  'NOT_FOUND',
      });
    }
    // Verrouillage anti-fraude PATCH (cohérent avec DELETE). Les paiements
    // Stripe / remboursements / online_booking ne peuvent pas être modifiés
    // par le commerçant — pour rembourser un client, passer par "Annuler
    // le RDV" qui déclenche un Stripe Refund propre.
    {
      const { isTransactionLocked: _isLocked, lockReason: _lockReason } = require('../utils/transactionLock');
      if (_isLocked(before)) {
        client.release();
        return res.status(403).json({
          error: _lockReason(before) || 'Transaction verrouillée.',
          code:  'TX_LOCKED',
        });
      }
    }

    // ── CAS C (suite) — amount modifié seul sur multi existant : reject ──────
    if (has('amount') && !hasBreakdownPayload && before.payment_group_id) {
      client.release();
      return res.status(400).json({
        error: "Pour modifier le total d'un paiement multiple, veuillez aussi renseigner la nouvelle répartition entre les méthodes.",
        code:  'BREAKDOWN_REQUIRED',
      });
    }

    // ── Items normalisés (lus uniquement si items[] fourni) ───────────────────
    const hasItemsPayload = Array.isArray(items);
    const itemList = hasItemsPayload
      ? items.filter(it => it && it.service_name)
      : [];
    if (hasItemsPayload && itemList.length > 20) {
      client.release();
      return res.status(400).json({
        error: 'Trop de prestations sur une seule transaction (max 20).',
        code: 'ITEMS_TOO_MANY',
      });
    }
    // Cohérence somme(items) vs amount cible — utilise body.amount si présent,
    // sinon le montant existant (before.amount) puisque l'édition ne change
    // que les items. Tolérance 0.01€. Pour un multi avec breakdown, l'amount
    // effectif est la somme du breakdown (cohérent avec le reste du handler).
    if (hasItemsPayload && itemList.length > 0) {
      let amountTarget;
      if (hasBreakdownPayload && payments_norm && payments_norm.length > 0) {
        amountTarget = payments_norm.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      } else if (has('amount') && amount != null) {
        amountTarget = parseFloat(amount);
      } else {
        amountTarget = parseFloat(before.amount);
        // Multi pré-existant : before.amount n'est que la rep_row, pas le total.
        if (before.payment_group_id) {
          const { rows: grp } = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total
               FROM transactions
              WHERE user_id=$1::uuid AND payment_group_id=$2::uuid
                AND deleted_at IS NULL`,
            [req.user.userId, before.payment_group_id]
          );
          amountTarget = parseFloat(grp[0]?.total || amountTarget);
        }
      }
      const itemsSum = itemList.reduce(
        (s, it) => s + ((parseFloat(it.unit_price) || 0) * (parseInt(it.qty) || 1)),
        0
      );
      if (Math.abs(itemsSum - amountTarget) > 0.01) {
        client.release();
        return res.status(400).json({
          error: `La somme des prestations (${itemsSum.toFixed(2)} €) ne correspond pas au montant total (${amountTarget.toFixed(2)} €).`,
          code: 'ITEMS_AMOUNT_MISMATCH',
        });
      }
    }

    // ── Paiements normalisés ──────────────────────────────────────────────────
    // payList sert à 2 choses :
    //   1. ré-écrire la table legacy transaction_payments (single row + N children)
    //   2. ré-écrire un groupe multi-payment payment_group_id (N rows transactions)
    // Whitelist BREAKDOWN_METHODS pour interdire 'card_online' / 'multi' / 'check'.
    // Alimenté par body.payment_breakdown (avec amount_cents) en priorité,
    // sinon body.payments (legacy, amount en euros). Voir bloc plus haut.
    const hasPayPayload = hasBreakdownPayload;
    const payList = hasBreakdownPayload ? payments_norm : [];

    // ── CAS C — `amount` modifié seul sur un paiement multi sans breakdown ────
    // Pour un multi déjà existant (before.payment_group_id IS NOT NULL), changer
    // le total sans dire COMMENT le répartir laisse les rows soeurs incohérentes.
    // Rejet explicite avec un code dédié pour que le frontend re-demande la
    // répartition à l'utilisateur. Ne s'applique qu'aux paiements multi pré-existants
    // (un single peut continuer à modifier son amount tout seul).
    // NOTE : le SELECT `before` est fait plus bas — on diffère cette vérif après.
    if (hasPayPayload && payList.length >= 2) {
      // Validation breakdown alignée admin/transactions.js (commit A backend)
      const seen = new Set();
      let sumCents = 0;
      for (const p of payList) {
        if (p.method === 'card_online') {
          client.release();
          return res.status(400).json({
            error: 'card_online interdit en paiement multiple.',
            code: 'BREAKDOWN_CARD_ONLINE_NOT_SUPPORTED',
          });
        }
        if (!BREAKDOWN_METHODS.has(p.method)) {
          client.release();
          return res.status(400).json({
            error: `Méthode invalide en breakdown : ${p.method}.`,
            code: 'BREAKDOWN_INVALID_METHOD',
          });
        }
        if (seen.has(p.method)) {
          client.release();
          return res.status(400).json({
            error: `Méthode en doublon : ${p.method}.`,
            code: 'BREAKDOWN_DUPLICATE_METHODS',
          });
        }
        seen.add(p.method);
        sumCents += Math.round((parseFloat(p.amount) || 0) * 100);
      }
      if (payList.length > 4) {
        client.release();
        return res.status(400).json({
          error: 'Maximum 4 méthodes.',
          code: 'BREAKDOWN_TOO_MANY_METHODS',
        });
      }
      // Si amount est aussi fourni, vérifier que la somme correspond.
      if (has('amount') && amount != null) {
        const totalCents = Math.round(parseFloat(amount) * 100);
        if (sumCents !== totalCents) {
          client.release();
          return res.status(400).json({
            error: `La somme des paiements (${(sumCents/100).toFixed(2)} €) doit égaler le total (${(totalCents/100).toFixed(2)} €).`,
            code: 'BREAKDOWN_SUM_MISMATCH',
          });
        }
      }
    }

    // qty_total dérivé d'items[] uniquement si présent. Sinon conservé.
    const qtyTotal = hasItemsPayload
      ? (itemList.length
          ? itemList.reduce((s, it) => s + (parseInt(it.qty) || 1), 0)
          : 1)
      : null;

    await client.query('BEGIN');

    // ── Construction dynamique du SET (PATCH semantics) ───────────────────────
    // Un champ n'est inclus que s'il est PRESENT dans req.body, ce qui évite
    // d'écraser à NULL des colonnes NOT NULL (type, payment_method…) quand le
    // frontend envoie un diff partiel. Map<col, val> garantit qu'une colonne
    // n'apparaît qu'une fois dans le SET (priorité : dernier pushSet gagne).
    const setMap = new Map();
    const pushSet = (col, val) => { setMap.set(col, val); };

    if (has('type'))         pushSet('type', type);
    if (has('amount')) {
      pushSet('amount', amount);
      // Maintenir gross_amount_cents / net_amount_cents en cohérence avec
      // amount pour les rows non-Stripe (sinon le COALESCE dans
      // EFFECTIVE_GROSS_CENTS_SQL prend l'ancienne valeur cents).
      const amtCents = Math.round(parseFloat(amount) * 100);
      pushSet('gross_amount_cents', amtCents);
      pushSet('net_amount_cents',   amtCents);
    }
    if (has('description'))  pushSet('description', description || null);
    if (has('category_id'))  pushSet('category_id', category_id || null);
    if (has('employee_id'))  pushSet('employee_id', employee_id || null);
    if (has('date'))         pushSet('date', date);
    if (has('time'))         pushSet('time', time || null);
    if (has('datetime_iso')) pushSet('datetime_iso', datetime_iso || null);
    if (has('client_email')) {
      const norm = (typeof client_email === 'string' && client_email.trim())
        ? client_email.trim().toLowerCase()
        : null;
      pushSet('client_email', norm);
    }
    if (has('client_note'))  pushSet('client_note', client_note);
    if (hasItemsPayload)     pushSet('qty_total', qtyTotal);

    // payment_method : sur la rep_row, en cas de multi on grave la méthode du
    // 1er sous-paiement (chaque row du groupe porte sa propre méthode).
    if (hasPayPayload && payList.length >= 2) {
      pushSet('payment_method', payList[0].method);
      // Le montant de la rep_row = montant du 1er sous-paiement.
      const repAmt = parseFloat(payList[0].amount) || 0;
      const repCents = Math.round(repAmt * 100);
      pushSet('amount', repAmt);
      pushSet('gross_amount_cents', repCents);
      pushSet('net_amount_cents',   repCents);
      // En cas de transition single → multi, assigner un payment_group_id.
      if (!before.payment_group_id) {
        pushSet('payment_group_id', require('crypto').randomUUID());
      }
    } else if (hasPayPayload && payList.length === 1) {
      // Single row : on bascule éventuellement la méthode + montant via payments[0].
      const sAmt = parseFloat(payList[0].amount) || 0;
      const sCents = Math.round(sAmt * 100);
      pushSet('payment_method', payList[0].method);
      pushSet('amount', sAmt);
      pushSet('gross_amount_cents', sCents);
      pushSet('net_amount_cents',   sCents);
      // Si on quittait un multi pour repasser en single : effacer le group_id.
      if (before.payment_group_id) {
        pushSet('payment_group_id', null);
      }
    } else if (has('payment_method')) {
      pushSet('payment_method', payment_method);
    }

    let updatedRepRow = null;
    if (setMap.size > 0) {
      // Materialiser la Map en SQL : `col=$N, ...` + params parallèles.
      const sets   = [];
      const params = [];
      for (const [col, val] of setMap.entries()) {
        params.push(val);
        sets.push(`${col}=$${params.length}`);
      }
      params.push(req.params.id);
      params.push(req.user.userId);
      const idIdx  = params.length - 1;
      const uidIdx = params.length;
      const { rows } = await client.query(
        `UPDATE transactions SET ${sets.join(', ')}
         WHERE id=$${idIdx} AND user_id=$${uidIdx}
         RETURNING id, user_id, type, amount, description, category_id, employee_id,
           payment_method, locked, client_email, client_note, qty_total,
           payment_group_id,
           TO_CHAR(date, 'YYYY-MM-DD') as date,
           TO_CHAR(time, 'HH24:MI') as time,
           datetime_iso, appointment_id, source, created_at`,
        params
      );
      if (!rows.length) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: 'Transaction introuvable.' });
      }
      updatedRepRow = rows[0];
    } else {
      // Aucun champ scalaire à patcher (cas extrême) — on prend la row courante.
      const { rows } = await client.query(
        `SELECT id, user_id, type, amount, description, category_id, employee_id,
                payment_method, locked, client_email, client_note, qty_total,
                payment_group_id,
                TO_CHAR(date, 'YYYY-MM-DD') as date,
                TO_CHAR(time, 'HH24:MI') as time,
                datetime_iso, appointment_id, source, created_at
           FROM transactions WHERE id=$1 AND user_id=$2`,
        [req.params.id, req.user.userId]
      );
      if (!rows.length) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: 'Transaction introuvable.' });
      }
      updatedRepRow = rows[0];
    }

    // ── Broadcast meta aux autres rows du groupe (si multi) ───────────────────
    // Les colonnes "métier identiques sur tout le groupe" (description, date,
    // employé, etc.) doivent rester cohérentes entre toutes les rows liées par
    // payment_group_id. On REJOUE les SET pertinents sur les sister rows.
    const groupId = updatedRepRow.payment_group_id || before.payment_group_id;
    if (groupId) {
      const groupMap = new Map();
      const pushGroup = (col, val) => { groupMap.set(col, val); };
      if (has('type'))         pushGroup('type', type);
      if (has('description'))  pushGroup('description', description || null);
      if (has('category_id'))  pushGroup('category_id', category_id || null);
      if (has('employee_id'))  pushGroup('employee_id', employee_id || null);
      if (has('date'))         pushGroup('date', date);
      if (has('time'))         pushGroup('time', time || null);
      if (has('datetime_iso')) pushGroup('datetime_iso', datetime_iso || null);
      if (has('client_email')) {
        const norm = (typeof client_email === 'string' && client_email.trim())
          ? client_email.trim().toLowerCase()
          : null;
        pushGroup('client_email', norm);
      }
      if (has('client_note'))  pushGroup('client_note', client_note);
      if (hasItemsPayload)     pushGroup('qty_total', qtyTotal);
      if (groupMap.size > 0) {
        const groupSets   = [];
        const groupParams = [];
        for (const [col, val] of groupMap.entries()) {
          groupParams.push(val);
          groupSets.push(`${col}=$${groupParams.length}`);
        }
        groupParams.push(req.user.userId);
        groupParams.push(groupId);
        groupParams.push(req.params.id);
        await client.query(
          `UPDATE transactions SET ${groupSets.join(', ')}
            WHERE user_id=$${groupParams.length - 2}::uuid
              AND payment_group_id=$${groupParams.length - 1}::uuid
              AND id != $${groupParams.length}::uuid`,
          groupParams
        );
      }
    }

    // ── Rééquilibrage multi-payment group : UPDATE in-place ───────────────────
    // FIX 2026-05-11 : avant on faisait DELETE + INSERT sur les rows soeurs, ce
    // qui modifiait created_at et cassait la traçabilité. Désormais on UPDATE
    // chaque row existante par index (ordonnée par created_at) avec sa nouvelle
    // (méthode, montant). N'INSERT que si le nouveau breakdown contient plus
    // d'entrées que de rows existantes. Soft-delete (deleted_at) les rows en
    // surplus si le breakdown rétrécit. La rep_row[0] est déjà patchée plus
    // haut via setMap — on traite ici les sister rows uniquement.
    let mutatedSisters = 0;
    if (hasPayPayload && payList.length >= 2) {
      const finalGroupId = updatedRepRow.payment_group_id || before.payment_group_id;

      // 1. Récupérer les rows soeurs ACTIVES du groupe (hors rep_row), ordonnées
      //    par created_at puis id (même tri que la CTE historique).
      const { rows: sisterRows } = await client.query(
        `SELECT id FROM transactions
           WHERE user_id=$1::uuid AND payment_group_id=$2::uuid
             AND id != $3::uuid AND deleted_at IS NULL
           ORDER BY created_at ASC, id ASC
           FOR UPDATE`,
        [req.user.userId, finalGroupId, req.params.id]
      );
      const sisterCount   = sisterRows.length;
      const neededSisters = payList.length - 1; // payList[0] = rep_row

      // 2. UPDATE in-place les sister rows existantes pour les indices communs.
      for (let i = 0; i < Math.min(sisterCount, neededSisters); i++) {
        const p = payList[i + 1];
        const pAmt = parseFloat(p.amount) || 0;
        const pCents = Math.round(pAmt * 100);
        const { rowCount } = await client.query(
          `UPDATE transactions
              SET amount             = $1::numeric,
                  payment_method     = $2::text,
                  gross_amount_cents = $3::integer,
                  net_amount_cents   = $3::integer
            WHERE id      = $4::uuid
              AND user_id = $5::uuid
              AND deleted_at IS NULL`,
          [pAmt, p.method, pCents, sisterRows[i].id, req.user.userId]
        );
        mutatedSisters += rowCount;
      }

      // 3. Si le nouveau breakdown contient plus d'entrées : INSERT les manquantes.
      for (let i = sisterCount; i < neededSisters; i++) {
        const p = payList[i + 1];
        const pAmt = parseFloat(p.amount) || 0;
        const pCents = Math.round(pAmt * 100);
        const newIdemKey = `edit:${finalGroupId}:${i + 2}:${Date.now()}`;
        await client.query(
          `INSERT INTO transactions
             (user_id, type, amount, description, category_id, employee_id,
              payment_method, date, time, datetime_iso, appointment_id, source,
              locked, payment_source, payment_status, payment_type,
              gross_amount_cents, stripe_fee_cents, platform_fee_cents, net_amount_cents,
              paid_at, payment_group_id, qty_total, idempotency_key,
              client_email, client_note, original_amount, discount_amount,
              signed_by_employee_id, global_client_id)
           SELECT user_id, type, $1::numeric, description, category_id, employee_id,
                  $2::text, date, time, datetime_iso, appointment_id, source,
                  locked, payment_source, payment_status, payment_type,
                  $3::integer, 0, 0, $3::integer,
                  paid_at, $4::uuid, qty_total, $5::text,
                  client_email, client_note, original_amount, discount_amount,
                  signed_by_employee_id, global_client_id
             FROM transactions WHERE id=$6::uuid`,
          [pAmt, p.method, pCents, finalGroupId, newIdemKey, req.params.id]
        );
        mutatedSisters += 1;
      }

      // 4. Si le nouveau breakdown contient moins d'entrées : soft-delete les
      //    rows en surplus (FEC : on garde la trace en BDD avec deleted_at).
      for (let i = neededSisters; i < sisterCount; i++) {
        const { rowCount } = await client.query(
          `UPDATE transactions
              SET deleted_at = NOW()
            WHERE id      = $1::uuid
              AND user_id = $2::uuid
              AND deleted_at IS NULL`,
          [sisterRows[i].id, req.user.userId]
        );
        mutatedSisters += rowCount;
      }
    } else if (hasPayPayload && payList.length === 1 && before.payment_group_id) {
      // Multi → Single : soft-delete les sister rows du groupe (au lieu de DELETE).
      const { rowCount } = await client.query(
        `UPDATE transactions
            SET deleted_at = NOW()
          WHERE user_id=$1::uuid AND payment_group_id=$2::uuid AND id != $3::uuid
            AND deleted_at IS NULL`,
        [req.user.userId, before.payment_group_id, req.params.id]
      );
      mutatedSisters += rowCount;
    }

    // ── Remplacer items (si fournis) ──────────────────────────────────────────
    if (hasItemsPayload) {
      await client.query('DELETE FROM transaction_items WHERE transaction_id=$1', [req.params.id]);
      for (const it of itemList) {
        await client.query(
          `INSERT INTO transaction_items (transaction_id, service_id, service_name, qty, unit_price)
           VALUES ($1,$2,$3,$4,$5)`,
          [req.params.id, it.service_id || null, it.service_name,
           parseInt(it.qty) || 1, parseFloat(it.unit_price) || 0]
        );
      }
    }

    // ── Legacy transaction_payments table (single row + N children) ───────────
    // Conservée pour compat avec l'historique caisse legacy. Pour les rows
    // payment_group_id-aware, transaction_payments reste vide (le breakdown
    // est porté par les multi-rows transactions, pas par cette table enfant).
    if (hasPayPayload) {
      await client.query('DELETE FROM transaction_payments WHERE transaction_id=$1', [req.params.id]);
      if (payList.length > 1 && !before.payment_group_id && !updatedRepRow.payment_group_id) {
        // Pure legacy fallback : pas de group_id, on tombe sur l'ancien modèle.
        for (const p of payList) {
          await client.query(
            `INSERT INTO transaction_payments (transaction_id, method, amount)
             VALUES ($1,$2,$3)`,
            [req.params.id, p.method, parseFloat(p.amount) || 0]
          );
        }
      }
    }

    await client.query('COMMIT');

    // Récupérer la rep_row finale (avec items + payments enrichis).
    const rows = [updatedRepRow];

    // Invalider le cache liste + stats
    global.memCache?.del(`txs:${req.user.userId}`);
    invalidateStatsCache(req.user.userId);

    // R4 : resync fidélité si le montant ou qty_total a changé.
    // - mode points : delta = (new_amount - old_amount) * points_per_euro
    // - mode stamps : delta = (new_qty_total - old_qty_total)
    // Si client_email a changé : on NE transfère PAS automatiquement les
    // stamps (logique métier ambiguë : doivent-ils retourner au vieux
    // client ? aller au nouveau ?). On log un warning pour l'admin.
    let loyaltyResync = null;
    let emailChangedWarn = false;
    try {
      const oldEmail = (before.client_email || '').toLowerCase().trim();
      const newEmail = (rows[0]?.client_email || '').toLowerCase().trim();
      if (oldEmail && newEmail && oldEmail !== newEmail) {
        emailChangedWarn = true;
      }
      // Delta uniquement si même client_email (pas de transfert auto entre clients)
      if (before.type === 'revenue' && oldEmail && oldEmail === newEmail) {
        const { rows: prog } = await pool.query(
          'SELECT loyalty_mode, points_per_euro FROM loyalty_programs WHERE user_id=$1 AND enabled=TRUE',
          [req.user.userId]
        );
        if (prog.length) {
          const mode          = prog[0].loyalty_mode || 'stamps';
          const pointsPerEuro = parseFloat(prog[0].points_per_euro) || 1;
          const oldAmount     = parseFloat(before.amount || 0);
          const newAmount     = parseFloat(rows[0]?.amount || 0);
          const oldQty        = parseInt(before.qty_total) || 1;
          const newQty        = parseInt(rows[0]?.qty_total) || 1;
          const deltaPoints   = mode === 'points' ? Math.floor((newAmount - oldAmount) * pointsPerEuro) : 0;
          const deltaStamps   = mode === 'stamps' ? (newQty - oldQty) : 0;
          if (deltaPoints !== 0 || deltaStamps !== 0) {
            await pool.query(
              `UPDATE client_loyalty SET
                 stamps             = GREATEST(0, stamps + $3),
                 total_stamps_ever  = GREATEST(0, total_stamps_ever + GREATEST(0, $3)),
                 points             = GREATEST(0, points + $4),
                 total_points_ever  = GREATEST(0, total_points_ever + GREATEST(0, $4))
               WHERE user_id=$1 AND LOWER(client_email)=$2`,
              [req.user.userId, oldEmail, deltaStamps, deltaPoints]
            );
            loyaltyResync = { mode, deltaStamps, deltaPoints };
          }
        }
      }
    } catch (lErr) { console.warn('[TX PUT loyalty resync]', lErr.message); }

    const after = await getSnapshot(req.params.id);
    await audit(req.user.userId, req.params.id, 'update', before, after, reason || null);

    // ── Recompte des mutations réelles + payload payment_group enrichi ─────────
    // Détection "200 menteur" : si setMap était vide ET aucune écriture sur le
    // breakdown ET pas d'items, l'appel n'a touché à rien. On signale via le
    // code NO_CHANGE_DETECTED pour que le frontend puisse afficher un warning.
    // Note : setMap.size > 0 ne garantit pas un vrai changement si le client
    // a renvoyé la même valeur — mais c'est un cas bénin, la BDD reste cohérente.
    const repMutated = setMap.size > 0 ? 1 : 0;
    const rowsAffected = repMutated + mutatedSisters + (hasItemsPayload ? 1 : 0);
    if (rowsAffected === 0) {
      // Le frontend devrait normalement filtrer ce cas (diff payload vide), mais
      // garde de sécurité côté backend pour ne JAMAIS renvoyer un 200 menteur.
      console.log(`[TX PUT] tx=${req.params.id} NO_CHANGE_DETECTED user=${req.user.userId}`);
      return res.status(400).json({
        error: "Aucun changement détecté.",
        code:  'NO_CHANGE_DETECTED',
      });
    }

    // payment_group : si la tx est multi, re-SELECT le groupe complet pour
    // que le frontend puisse mettre à jour sa liste sans re-fetch global.
    const finalGroupId = updatedRepRow.payment_group_id || before.payment_group_id;
    let paymentGroup = null;
    if (finalGroupId) {
      const { rows: groupRows } = await pool.query(
        `SELECT id, amount, payment_method, gross_amount_cents, net_amount_cents,
                time, employee_id, description, date,
                TO_CHAR(date, 'YYYY-MM-DD') as date_str,
                TO_CHAR(time, 'HH24:MI') as time_str,
                created_at, deleted_at
           FROM transactions
          WHERE user_id=$1::uuid AND payment_group_id=$2::uuid
            AND deleted_at IS NULL
          ORDER BY created_at ASC, id ASC`,
        [req.user.userId, finalGroupId]
      );
      paymentGroup = groupRows;
    }

    console.log(`[TX PUT] tx=${req.params.id} group=${finalGroupId || 'null'}`
      + ` user=${req.user.userId} rows_affected=${rowsAffected}`
      + ` rep=${repMutated} sisters=${mutatedSisters}`
      + ` items=${hasItemsPayload ? 1 : 0}`);

    // Enrichir la réponse avec items + payments comme sur le GET, plus la
    // shape étendue (success/rows_affected/payment_group). On garde les champs
    // de la transaction au top-level pour rétro-compat avec les anciens
    // consumers qui lisaient `res.id`/`res.amount`.
    const out = rows[0];
    out.items    = after?.items    || [];
    out.payments = after?.payments || [];
    out.success       = true;
    out.rows_affected = rowsAffected;
    out.payment_group = paymentGroup;
    if (loyaltyResync) out.loyalty_resync = loyaltyResync;
    if (emailChangedWarn) {
      out.email_changed_warning = "Email client modifié : les tampons fidélité restent sur l'ancien email. Transfert manuel nécessaire si besoin.";
    }
    res.json(out);
  } catch(e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[TX PUT]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ── DELETE /:id — soft-delete avec audit FEC + cascade RDV/fidélité/promo ────
// Marque la transaction comme supprimée (deleted_at = NOW()) au lieu de
// DELETE FROM SQL :
//   - conformité comptable FEC (registre obligatoire 6 ans, aucune ligne
//     ne doit DISPARAÎTRE de la BDD, juste être masquée)
//   - RGPD (anonymisation NULL plutôt que destruction)
//   - audit forensique (impossible de prouver un paiement effacé si la row
//     n'existe plus)
//
// Multi-payment : si payment_group_id IS NOT NULL, soft-delete ATOMIQUE de
// toutes les rows sœurs du groupe (sinon orphelins comme l'incident
// payment_group_id='23ae740f-6472-4357-894e-b14cb2d42d3f').
//
// Verrouillage : isTransactionLocked() rejette les rows Stripe / remboursement
// / online_booking (anti-fraude — utiliser "Annuler le RDV" pour un refund).
const { isTransactionLocked, lockReason } = require('../utils/transactionLock');

router.delete('/:id', pinAdminMiddleware, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    // Étape A — SELECT cible (filtre deleted_at IS NULL pour idempotence).
    const { rows: targetRows } = await dbClient.query(
      `SELECT id, amount, payment_method, payment_source, payment_status,
              payment_type, payment_group_id, appointment_id, user_id,
              stripe_payment_intent_id, client_email, type, qty_total,
              promo_code_id, locked, deleted_at
         FROM transactions
        WHERE id = $1::uuid
          AND user_id = $2::uuid
          AND deleted_at IS NULL
        LIMIT 1`,
      [req.params.id, req.user.userId]
    );
    if (!targetRows.length) {
      dbClient.release();
      return res.status(404).json({
        error: 'Transaction introuvable ou déjà supprimée.',
        code: 'NOT_FOUND',
      });
    }
    const before = targetRows[0];

    // Étape B — Verrouillage anti-fraude.
    if (isTransactionLocked(before)) {
      dbClient.release();
      return res.status(403).json({
        error: lockReason(before) || 'Transaction verrouillée.',
        code:  'TX_LOCKED',
      });
    }

    // Avant le soft-delete : récupérer les referral_uses liés (audit + cascade).
    const { rows: refs } = await dbClient.query(
      `SELECT id, status, parrain_promo_id FROM referral_uses
        WHERE transaction_id=$1::uuid AND user_id=$2::uuid`,
      [req.params.id, req.user.userId]
    );

    await dbClient.query('BEGIN');

    // ── Étape C/D — Soft-delete (single row OU groupe entier) ─────────────────
    let deletedCount = 0;
    let appointmentId = before.appointment_id;
    let groupRowsForLockRecheck = [];

    if (before.payment_group_id) {
      // MULTI : re-vérifier que toutes les rows actives du groupe sont éditables.
      // Une seule sister row verrouillée (ex: un Stripe collé par erreur) bloque
      // tout le groupe. SELECT FOR UPDATE pour empêcher une race avec un autre
      // PIN admin qui éditerait en parallèle.
      const { rows: groupRows } = await dbClient.query(
        `SELECT id, payment_status, payment_method, payment_source, payment_type,
                stripe_payment_intent_id, appointment_id
           FROM transactions
          WHERE payment_group_id = $1::uuid
            AND user_id = $2::uuid
            AND deleted_at IS NULL
          FOR UPDATE`,
        [before.payment_group_id, req.user.userId]
      );
      groupRowsForLockRecheck = groupRows;
      for (const r of groupRows) {
        if (isTransactionLocked(r)) {
          await dbClient.query('ROLLBACK');
          dbClient.release();
          return res.status(403).json({
            error: 'Une ligne du paiement multiple est verrouillée. ' + (lockReason(r) || ''),
            code: 'TX_LOCKED',
          });
        }
      }

      const { rows: updRows } = await dbClient.query(
        `UPDATE transactions
            SET deleted_at = NOW()
          WHERE payment_group_id = $1::uuid
            AND user_id = $2::uuid
            AND deleted_at IS NULL
          RETURNING id, appointment_id`,
        [before.payment_group_id, req.user.userId]
      );
      deletedCount = updRows.length;
      // appointment_id : tous les rows d'un groupe partagent normalement le
      // même RDV. On prend le premier non-null.
      const firstAppt = updRows.find(r => r.appointment_id)?.appointment_id;
      if (firstAppt) appointmentId = firstAppt;
    } else {
      // SINGLE row.
      const { rowCount } = await dbClient.query(
        `UPDATE transactions
            SET deleted_at = NOW()
          WHERE id = $1::uuid
            AND user_id = $2::uuid
            AND deleted_at IS NULL`,
        [req.params.id, req.user.userId]
      );
      deletedCount = rowCount;
      if (deletedCount === 0) {
        // Race : un autre client a déjà soft-deleté entre notre SELECT et UPDATE.
        await dbClient.query('ROLLBACK');
        dbClient.release();
        return res.status(404).json({
          error: 'Transaction introuvable ou déjà supprimée.',
          code: 'NOT_FOUND',
        });
      }
    }

    // ── Étape E — Reset appointment.paid si plus aucune tx active sur le RDV ──
    let appointmentUnlocked = false;
    if (appointmentId) {
      const { rows: residuals } = await dbClient.query(
        `SELECT id FROM transactions
          WHERE appointment_id = $1::uuid
            AND deleted_at IS NULL
          LIMIT 1`,
        [appointmentId]
      );
      if (residuals.length === 0) {
        await dbClient.query(
          `UPDATE appointments
              SET paid = FALSE, paid_method = NULL, transaction_id = NULL,
                  status = 'confirmed', updated_at = NOW()
            WHERE id = $1::uuid AND user_id = $2::uuid`,
          [appointmentId, req.user.userId]
        );
        appointmentUnlocked = true;
      }
    }

    await dbClient.query('COMMIT');

    // ── Étape F — Rollbacks side-effects (best-effort hors transaction) ───────
    // Promo : décrémenter uses_count, restaurer client_rewards 'used'→'available'
    if (before.promo_code_id) {
      try {
        await pool.query(
          `UPDATE promo_codes
              SET uses_count = GREATEST(0, uses_count - 1),
                  is_active  = TRUE
            WHERE id=$1 AND user_id=$2`,
          [before.promo_code_id, req.user.userId]
        );
        await pool.query(
          `UPDATE client_rewards SET status='available', used_at=NULL
            WHERE user_id=$1 AND promo_code_id=$2 AND status='used'`,
          [req.user.userId, before.promo_code_id]
        );
        await pool.query(
          `DELETE FROM promo_usage_logs WHERE transaction_id=$1`,
          [req.params.id]
        );
      } catch (pErr) { console.warn('[TX DELETE promo rollback]', pErr.message); }
    }

    // Fidélité : décrémenter stamps / points (clamp ≥ 0).
    if (before.client_email && before.type === 'revenue') {
      try {
        const { rows: prog } = await pool.query(
          'SELECT loyalty_mode, points_per_euro FROM loyalty_programs WHERE user_id=$1 AND enabled=TRUE',
          [req.user.userId]
        );
        const mode = prog[0]?.loyalty_mode || 'stamps';
        const pointsPerEuro = parseFloat(prog[0]?.points_per_euro) || 1;
        const qty = parseInt(before.qty_total) || 1;
        const pointsLost = mode === 'points'
          ? Math.floor(parseFloat(before.amount || 0) * pointsPerEuro)
          : 0;
        await pool.query(
          `UPDATE client_loyalty
              SET stamps             = GREATEST(0, stamps - $3),
                  total_stamps_ever  = GREATEST(0, total_stamps_ever - $3),
                  points             = GREATEST(0, points - $4),
                  total_points_ever  = GREATEST(0, total_points_ever - $4)
            WHERE user_id=$1 AND LOWER(client_email)=LOWER($2)`,
          [req.user.userId, before.client_email, qty, pointsLost]
        );
      } catch (lErr) { console.warn('[TX DELETE loyalty rollback]', lErr.message); }
    }

    // Cascade referral_uses : annuler les parrainages en cours liés.
    for (const ref of refs) {
      try {
        await pool.query(
          `UPDATE referral_uses SET status='cancelled' WHERE id=$1`,
          [ref.id]
        );
        if (ref.parrain_promo_id) {
          await pool.query(
            `UPDATE promo_codes SET is_active=FALSE
              WHERE id=$1 AND user_id=$2`,
            [ref.parrain_promo_id, req.user.userId]
          );
          await pool.query(
            `UPDATE client_rewards SET status='cancelled'
              WHERE promo_code_id=$1 AND status='available'`,
            [ref.parrain_promo_id]
          );
        }
      } catch (cErr) {
        console.warn('[TX DELETE referral cascade]', cErr.message);
      }
    }

    global.memCache?.del(`txs:${req.user.userId}`);
    invalidateStatsCache(req.user.userId);

    await audit(req.user.userId, req.params.id, 'delete', before, null,
      req.body?.reason || 'Soft-delete admin');

    console.log(`[TX DELETE] tx=${req.params.id} group=${before.payment_group_id || 'null'}`
      + ` user=${req.user.userId} count=${deletedCount}`
      + ` appointment_unlocked=${appointmentUnlocked}`);

    res.json({
      success: true,
      deleted_count:        deletedCount,
      appointment_unlocked: appointmentUnlocked,
      deleted_at:           new Date().toISOString(),
      referrals_revoked:    refs.length,
      promo_rollback:       !!before.promo_code_id,
      group_size:           groupRowsForLockRecheck.length || 1,
    });
  } catch (e) {
    try { await dbClient.query('ROLLBACK'); } catch {}
    console.error('[TX DELETE]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  } finally {
    try { dbClient.release(); } catch {}
  }
});

// ── GET /audit/:id — historique d'une transaction (admin) ────────────────────
router.get('/audit/:id', pinAdminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT al.*, u.email as admin_email
       FROM transaction_audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.transaction_id=$1 AND al.user_id=$2
       ORDER BY al.created_at ASC`,
      [req.params.id, req.user.userId]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;