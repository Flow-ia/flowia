// src/routes/booking/checkout.js — Encaissement RDV (gros endpoint, ~220 lignes)
// POST /appointments/:id/checkout : claim atomique, création transaction,
// validation referral, incrémentation fidélité, log promo.
//
// Supporte 2 formats d'entrée pour le multi-paiement :
//   - LEGACY `payments: [{method, amount}]` → 1 row tx avec payment_method='multi'
//     + N entrées dans transaction_payments (compat ancien front).
//   - NOUVEAU `payment_breakdown: [{method, amount_cents}]` → N rows tx liées
//     par un payment_group_id UUID partagé (cohérent commit A transactions.js
//     + commit C historique.js + commit C caisse historique). Une seule
//     validation canCreateCashTransaction avant toute INSERT, BEGIN/COMMIT/
//     ROLLBACK pour garantir l'atomicité (RDV redevient unpaid si une INSERT
//     échoue).
const crypto = require('crypto');
const { pool } = require('../../db');
const { incrementStamps } = require('../../utils/loyalty-utils');
const { validateReferralUse } = require('../referrals');
const { canCreateCashTransaction } = require('../../services/transactionValidator');
const { invalidateUserStatsCache } = require('../../utils/paymentV3');

// Whitelist alignée backend transactions.js (BREAKDOWN_METHODS commit A).
// card_online interdit (réservé Stripe Connect en ligne).
const BREAKDOWN_METHODS = new Set(['cash', 'card', 'gift_card', 'transfer', 'other']);

module.exports = function attachCheckoutRoutes(router) {
  // ── Encaissement RDV → crée une transaction + marque le RDV paid ─────────────
  // POST /api/booking/appointments/:id/checkout
  router.post('/appointments/:id/checkout', async (req, res) => {
    try {
      const { employee_id, payment_method, category_id, amount: customAmount,
              payments: payList = [], payment_breakdown = null } = req.body;
      // Validation multi-paiement : array de {method, amount}. Si fourni avec
      // plus d'une entrée, le payment_method final est 'multi' et les détails
      // sont stockés dans transaction_payments (cohérent avec le flow caisse).
      const cleanPayments = Array.isArray(payList)
        ? payList
            .map(p => ({ method: String(p?.method || '').trim(),
                         amount: parseFloat(p?.amount) }))
            .filter(p => p.method && p.amount > 0)
        : [];
      const isMulti = cleanPayments.length > 1;
      const finalPaymentMethod = isMulti
        ? 'multi'
        : (cleanPayments[0]?.method || payment_method || 'cash');

      // AUDIT perms : enforcement strict si req.employee (header PIN valide).
      // 1. Si req.employee : check can_encash, override body.employee_id
      //    (anti-spoof).
      // 2. Sinon si body.employee_id : check permission (commit A minimal).
      // 3. Sinon : présumé action merchant.
      if (req.employee) {
        if (!req.employee.can_encash) {
          return res.status(403).json({
            error: "Vous n'avez pas la permission d'encaisser les RDV.",
            code: 'NO_ENCASH_PERMISSION',
          });
        }
      } else if (employee_id) {
        const { rows: empR } = await pool.query(
          'SELECT can_encash FROM employees WHERE id=$1 AND user_id=$2',
          [employee_id, req.user.userId]
        );
        if (!empR.length || !empR[0].can_encash) {
          return res.status(403).json({ error: "Vous n'avez pas la permission d'encaisser les RDV." });
        }
      }

      // ── CAS B — Multi-paiement traçable (commit A pattern) ──────────────────
      // Si payment_breakdown présent (>= 2 méthodes), on bascule sur le flow
      // multi-rows : N rows transactions avec payment_group_id UUID partagé,
      // toutes encadrées par BEGIN/COMMIT/ROLLBACK. UNE SEULE vérification
      // canCreateCashTransaction avant les INSERT (sinon la 2e détecte la 1re
      // déjà insérée et erreur ALREADY_PAID). UPDATE appointments dans la même
      // transaction SQL → si une INSERT échoue, ROLLBACK + RDV redevient unpaid.
      if (Array.isArray(payment_breakdown) && payment_breakdown.length > 0) {
        const result = await handleMultiBreakdownCheckout(req, res, payment_breakdown);
        return result;
      }

      // R5 : CLAIM ATOMIQUE — UPDATE WHERE paid=FALSE garantit qu'un seul
      // employé peut encaisser en cas de double-clic OU de 2 employés
      // simultanés. Renvoie le RDV avec les champs enrichis (service, etc.)
      // pour continuer le flux sans re-SELECT.
      const { rows: apptR } = await pool.query(
        `WITH claimed AS (
          UPDATE appointments a
             SET paid=TRUE, paid_method=$1, status='completed', updated_at=NOW()
           WHERE a.id=$2 AND a.user_id=$3 AND a.paid=FALSE
          RETURNING a.*
        )
        SELECT c.*, bs.name as service_name, bs.price as service_price,
               e.can_encash, e.name as employee_name
          FROM claimed c
          LEFT JOIN booking_services bs ON bs.id = c.service_id
          LEFT JOIN employees e          ON e.id = c.employee_id`,
        [finalPaymentMethod, req.params.id, req.user.userId]
      );
      if (!apptR.length) {
        // Check pour distinguer 'not found' vs 'already paid'
        const { rows: check } = await pool.query(
          'SELECT id, paid FROM appointments WHERE id=$1 AND user_id=$2',
          [req.params.id, req.user.userId]
        );
        if (!check.length) return res.status(404).json({ error: 'RDV introuvable.' });
        return res.status(400).json({ error: 'Ce RDV est déjà encaissé.', code: 'ALREADY_PAID' });
      }
      const appt = apptR[0];

      // Montant : priorité aux split-payments (somme), puis au custom de l'employé,
      // sinon total_amount (déjà réduit si promo), sinon prix service.
      // Si le RDV avait un promo, total_amount contient déjà le prix réduit.
      // Phase 5/5 : si un acompte a deja ete paye en ligne (paid_amount_cents>0),
      // le defaut est le RESTE a encaisser (total - acompte). Le merchant peut
      // toujours override via customAmount/payments.
      const acompteAmount = appt.stripe_payment_intent_id && appt.paid_amount_cents > 0
        ? Number(appt.paid_amount_cents) / 100
        : 0;
      const baseTotal = parseFloat(appt.total_amount) || parseFloat(appt.service_price) || 0;
      const remainingAfterAcompte = Math.max(0, baseTotal - acompteAmount);
      const paymentsTotal = cleanPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const amount = isMulti
        ? paymentsTotal
        : (cleanPayments[0]?.amount != null
            ? cleanPayments[0].amount
            : (customAmount != null
                ? parseFloat(customAmount)
                : remainingAfterAcompte));
      // Discount : provient du RDV si promo était appliqué lors de la réservation
      const discountFromAppt = parseFloat(appt.discount_amount || 0);
      const now = new Date();
      const dateStr = now.toLocaleDateString('sv-SE');
      const timeStr = now.toTimeString().substring(0,5);

      // Charger les items du RDV pour la description
      const { rows: apptItemsRaw } = await pool.query(
        'SELECT service_id, service_name, qty, unit_price FROM appointment_items WHERE appointment_id=$1 ORDER BY created_at',
        [req.params.id]
      );
      // Cohérence montant ligne-par-ligne : si l'employé a modifié le total
      // pendant l'encaissement (customAmount ou splits), les lignes
      // transaction_items doivent refléter ce nouveau total — sinon
      // l'historique caisse "ligne par ligne" affiche le prix d'origine
      // (ex: 30€ Coupe) alors que la transaction montre 130€ encaissés.
      // Stratégie :
      //   - 1 seul item de qty 1 → on remplace son unit_price par `amount`
      //   - sinon → on ajoute une ligne d'ajustement (Supplément / Remise)
      //     avec le delta pour que la somme des lignes = amount
      const apptItems = apptItemsRaw.map(it => ({ ...it }));
      const itemsSum = apptItems.reduce(
        (s, it) => s + ((parseFloat(it.unit_price) || 0) * (parseInt(it.qty) || 1)),
        0
      );
      const delta = amount - itemsSum;
      if (apptItems.length > 0 && Math.abs(delta) > 0.01) {
        if (apptItems.length === 1 && (parseInt(apptItems[0].qty) || 1) === 1) {
          apptItems[0].unit_price = amount;
        } else {
          apptItems.push({
            service_id: null,
            service_name: delta > 0 ? 'Supplément' : 'Remise',
            qty: 1,
            unit_price: delta,
          });
        }
      }
      let desc;
      if (apptItems.length > 1) {
        const itemList = apptItems.map(it => it.qty > 1 ? `${it.service_name} ×${it.qty}` : it.service_name).join(', ');
        desc = `RDV — ${itemList}${appt.client_name ? ` (${appt.client_name})` : ''}`;
      } else {
        desc = `RDV — ${appt.service_name || 'Service'}${appt.client_name ? ` (${appt.client_name})` : ''}`;
      }

      // Résoudre global_client_id depuis l'email du RDV (traçabilité passages
      // dans le compte client connecté, cross-commerçant).
      let globalClientId = null;
      if (appt.client_email) {
        try {
          const { rows: gc } = await pool.query(
            'SELECT id FROM global_clients WHERE LOWER(email)=LOWER($1) LIMIT 1',
            [appt.client_email]
          );
          if (gc.length) globalClientId = gc[0].id;
        } catch (e) { console.warn('[CHECKOUT global_client lookup]', e.message); }
      }

      // ── Refonte v3 : derive payment_source / payment_status / *_cents ───
      // Encaissement caisse RDV. Anti-double-encaissement via validator :
      // bloque si le RDV est deja STRIPE_100 ou CASH_PAID. Si STRIPE_ACOMPTE
      // existe, on classe en payment_type='remaining'.
      const validation = await canCreateCashTransaction(req.params.id);
      if (!validation.allow) {
        return res.status(409).json({
          error: 'Ce RDV est deja encaisse integralement.',
          code: 'ALREADY_PAID',
          existing_status: validation.existing_status,
        });
      }
      const v3GrossCents  = Math.round(parseFloat(amount) * 100);
      const v3PaymentType = validation.type === 'remaining' ? 'remaining' : 'full';

      // Créer la transaction — inclure les infos promo + champs v3
      const { rows: txR } = await pool.query(
        `INSERT INTO transactions
           (user_id, type, amount, description, employee_id, payment_method,
            date, time, datetime_iso, appointment_id, source,
            promo_code_id, discount_amount, original_amount,
            client_email, global_client_id,
            payment_source, payment_status, payment_type,
            gross_amount_cents, net_amount_cents, paid_at)
         VALUES ($1,'revenue',$2,$3,$4,$5,$6,$7,$8,$9,'rdv',$10,$11,$12,$13,$14,
                 'cash_register_rdv','CASH_PAID',$15,
                 $16,$16, NOW())
         RETURNING id, type, TO_CHAR(date,'YYYY-MM-DD') as date, TO_CHAR(time,'HH24:MI') as time,
           amount, description, payment_method, employee_id, appointment_id, source, created_at,
           promo_code_id, discount_amount, original_amount`,
        [req.user.userId, amount, desc, appt.employee_id || null,
         finalPaymentMethod, dateStr, timeStr,
         now.toISOString(), req.params.id,
         appt.promo_code_id || null,
         discountFromAppt || 0,
         appt.original_amount || null,
         appt.client_email || null, globalClientId,
         v3PaymentType, v3GrossCents]
      );
      const tx = txR[0];
      try { invalidateUserStatsCache(req.user.userId); } catch {}

      // Multi-paiement : insérer les lignes transaction_payments comme dans
      // le flow caisse standard. Source de vérité pour l'historique éclaté
      // (ex: 50€ carte + 30€ espèces).
      if (isMulti) {
        for (const p of cleanPayments) {
          await pool.query(
            `INSERT INTO transaction_payments (transaction_id, method, amount)
             VALUES ($1,$2,$3)`,
            [tx.id, p.method, p.amount]
          );
        }
        tx.payments = cleanPayments;
      }

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

      // R5 : RDV déjà marqué paid + status=completed via CLAIM atomique au
      // début de la route. Ici on ajoute juste transaction_id pour le lien.
      await pool.query(
        `UPDATE appointments SET transaction_id=$1 WHERE id=$2`,
        [tx.id, req.params.id]
      );

      // ── Hook parrainage : valider automatiquement le referral_use lié au RDV
      // si le filleul est encaissé. Émet la promo parrain + reward + email.
      // Non bloquant : une erreur ici n'empêche pas l'encaissement.
      let referralValidated = null;
      try {
        const { rows: ref } = await pool.query(
          `SELECT id FROM referral_uses
            WHERE appointment_id=$1 AND user_id=$2 AND status='pending'
            LIMIT 1`,
          [req.params.id, req.user.userId]
        );
        if (ref.length) {
          referralValidated = await validateReferralUse(ref[0].id, req.user.userId);
        }
      } catch (refErr) {
        console.warn('[CHECKOUT auto-validate referral]', refErr.message);
      }

      //// ── Fidélité : incrémenter (source=physical) ────────────────────────────────
      let loyaltyResult = null;
      if (appt.client_email) {
        try {
          // source : 'online' si RDV réservé en ligne, 'physical' si prestation sur place
          const loyaltySource = (appt.source === 'rdv') ? 'online' : 'physical';
          // Cohérence : on crédite la fidélité sur le montant RÉEL encaissé
          // (`amount`, qui inclut une éventuelle modification de prix par
          // l'employé), pas sur `appt.total_amount` figé à la réservation.
          // Sinon en mode points, le client gagnait des points sur le prix
          // initial alors qu'il a payé une remise commerciale ou un montant
          // ajusté.
          loyaltyResult = await incrementStamps(
            req.user.userId, appt.client_email, appt.client_name || null,
            qtyTotal || 1, loyaltySource,
            amount
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
        referral_validated: referralValidated,
      });
    } catch(e){ console.error('[CHECKOUT ERROR]', e.message); res.status(500).json({ error: e.message || 'Erreur serveur.' }); }
  });
};

// ─── Helper : flow multi-paiement (commit A) ─────────────────────────────────
// Encadrement BEGIN/COMMIT/ROLLBACK sur un client dédié. UNE SEULE vérif
// canCreateCashTransaction (avant toute INSERT). Tous les sous-paiements
// partagent le même payment_group_id UUID. UPDATE appointments inclus dans
// la transaction SQL pour que paid revienne à FALSE en cas de ROLLBACK.
async function handleMultiBreakdownCheckout(req, res, payment_breakdown) {
  const apptId = req.params.id;
  const userId = req.user.userId;

  // ── 1. Validation du breakdown (alignée commit A) ──────────────────────
  if (payment_breakdown.length < 2) {
    return res.status(400).json({
      error: "Le multi-paiement doit contenir au moins 2 méthodes.",
      code: 'BREAKDOWN_SINGLE_ITEM',
    });
  }
  if (payment_breakdown.length > 4) {
    return res.status(400).json({
      error: "Le multi-paiement ne peut excéder 4 méthodes.",
      code: 'BREAKDOWN_TOO_MANY_METHODS',
    });
  }
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
        error: "Le mode card_online est réservé aux paiements Stripe en ligne.",
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
  const totalAmount = sumCents / 100;

  // ── 2. Vérif anti-double-encaissement HORS transaction (lecture seule) ──
  // Si le RDV est déjà STRIPE_100 ou CASH_PAID → bloquer immédiatement
  // sans ouvrir de connection dédiée. Si STRIPE_ACOMPTE → payment_type
  // 'remaining' pour les sous-paiements.
  const validation = await canCreateCashTransaction(apptId);
  if (!validation.allow) {
    return res.status(409).json({
      error: "Ce RDV est déjà encaissé.",
      code: 'ALREADY_PAID',
      existing_status: validation.existing_status,
    });
  }
  const v3PaymentType = validation.type === 'remaining' ? 'remaining' : 'full';

  const dbClient = await pool.connect();
  const groupId = crypto.randomUUID();
  const insertedIds = [];
  const methodsLog = [];
  let appt = null;
  let qtyTotal = 1;
  let apptItems = [];
  let referralValidated = null;
  let loyaltyResult = null;
  let firstTxRow = null;

  try {
    await dbClient.query('BEGIN');

    // ── 3. CLAIM ATOMIQUE dans la transaction (idem flow legacy) ──────────
    const { rows: apptR } = await dbClient.query(
      `WITH claimed AS (
         UPDATE appointments a
            SET paid=TRUE, paid_method='multi', paid_amount_cents=$1::integer,
                status='completed', updated_at=NOW()
          WHERE a.id=$2::uuid AND a.user_id=$3::uuid AND a.paid=FALSE
          RETURNING a.*
       )
       SELECT c.*, bs.name AS service_name, bs.price AS service_price,
              e.name AS employee_name
         FROM claimed c
         LEFT JOIN booking_services bs ON bs.id = c.service_id
         LEFT JOIN employees       e  ON e.id = c.employee_id`,
      [sumCents, apptId, userId]
    );
    if (!apptR.length) {
      await dbClient.query('ROLLBACK');
      const { rows: check } = await pool.query(
        'SELECT id, paid FROM appointments WHERE id=$1 AND user_id=$2',
        [apptId, userId]
      );
      if (!check.length) return res.status(404).json({ error: "RDV introuvable." });
      return res.status(400).json({ error: "Ce RDV a déjà été encaissé.", code: 'ALREADY_PAID' });
    }
    appt = apptR[0];

    // ── 4. Charger les items du RDV pour la description + transaction_items ─
    const { rows: apptItemsRaw } = await dbClient.query(
      `SELECT service_id, service_name, qty, unit_price
         FROM appointment_items
        WHERE appointment_id=$1::uuid
        ORDER BY created_at`,
      [apptId]
    );
    apptItems = apptItemsRaw.map(it => ({ ...it }));
    // Ajustement si le total saisi ne matche pas la somme des items (employé
    // peut avoir surchargé le total côté caisse).
    const itemsSum = apptItems.reduce(
      (s, it) => s + ((parseFloat(it.unit_price) || 0) * (parseInt(it.qty) || 1)),
      0
    );
    const delta = totalAmount - itemsSum;
    if (apptItems.length > 0 && Math.abs(delta) > 0.01) {
      if (apptItems.length === 1 && (parseInt(apptItems[0].qty) || 1) === 1) {
        apptItems[0].unit_price = totalAmount;
      } else {
        apptItems.push({
          service_id: null,
          service_name: delta > 0 ? 'Supplément' : 'Remise',
          qty: 1,
          unit_price: delta,
        });
      }
    }
    qtyTotal = apptItems.length > 0
      ? apptItems.reduce((s, it) => s + (parseInt(it.qty) || 1), 0)
      : 1;
    let desc;
    if (apptItems.length > 1) {
      const itemList = apptItems.map(it => it.qty > 1 ? `${it.service_name} ×${it.qty}` : it.service_name).join(', ');
      desc = `RDV — ${itemList}${appt.client_name ? ` (${appt.client_name})` : ''}`;
    } else {
      desc = `RDV — ${appt.service_name || 'Service'}${appt.client_name ? ` (${appt.client_name})` : ''}`;
    }

    // ── 5. Résoudre global_client_id (lookup non bloquant) ────────────────
    let globalClientId = null;
    if (appt.client_email) {
      try {
        const { rows: gc } = await dbClient.query(
          'SELECT id FROM global_clients WHERE LOWER(email)=LOWER($1::text) LIMIT 1',
          [appt.client_email]
        );
        if (gc.length) globalClientId = gc[0].id;
      } catch {}
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('sv-SE');
    const timeStr = now.toTimeString().substring(0, 5);
    const discountFromAppt = parseFloat(appt.discount_amount || 0);

    // ── 6. INSERT N rows (1 par méthode) avec payment_group_id partagé ────
    for (let i = 0; i < payment_breakdown.length; i++) {
      const item = payment_breakdown[i];
      const itemAmt = item.amount_cents / 100;
      const r = await dbClient.query(
        `INSERT INTO transactions
           (user_id, type, amount, description, employee_id, payment_method,
            date, time, datetime_iso, appointment_id, source,
            promo_code_id, discount_amount, original_amount,
            client_email, global_client_id,
            payment_source, payment_status, payment_type,
            gross_amount_cents, stripe_fee_cents, platform_fee_cents, net_amount_cents,
            paid_at, payment_group_id)
         VALUES ($1::uuid, 'revenue', $2::numeric, $3::text, $4::uuid, $5::text,
                 $6::date, $7::time, $8::text, $9::uuid, 'rdv',
                 $10::uuid, $11::numeric, $12::numeric,
                 $13::text, $14::uuid,
                 'cash_register_rdv', 'CASH_PAID', $15::text,
                 $16::integer, 0, 0, $16::integer,
                 NOW(), $17::uuid)
         RETURNING id`,
        [userId, itemAmt, desc, appt.employee_id || null, item.method,
         dateStr, timeStr, now.toISOString(), apptId,
         appt.promo_code_id || null,
         // Discount + original_amount : portés uniquement par la 1re row
         // pour ne pas être comptés N fois en agrégat.
         i === 0 ? (discountFromAppt || 0) : 0,
         i === 0 ? (appt.original_amount || null) : null,
         appt.client_email || null, globalClientId,
         v3PaymentType,
         item.amount_cents,
         groupId]
      );
      insertedIds.push(r.rows[0].id);
      methodsLog.push(`${item.method}:${item.amount_cents}c`);
    }
    firstTxRow = insertedIds[0];

    // ── 7. INSERT items + qty_total + lien transaction_id sur 1re row ─────
    if (apptItems.length > 0) {
      for (const it of apptItems) {
        await dbClient.query(
          `INSERT INTO transaction_items (transaction_id, service_id, service_name, qty, unit_price)
           VALUES ($1::uuid, $2::uuid, $3::text, $4::integer, $5::numeric)`,
          [firstTxRow, it.service_id || null, it.service_name,
           parseInt(it.qty) || 1, parseFloat(it.unit_price) || 0]
        );
      }
      await dbClient.query(
        `UPDATE transactions SET qty_total=$1::integer WHERE id=$2::uuid`,
        [qtyTotal, firstTxRow]
      );
    }
    await dbClient.query(
      `UPDATE appointments SET transaction_id=$1::uuid WHERE id=$2::uuid`,
      [firstTxRow, apptId]
    );

    await dbClient.query('COMMIT');
  } catch (err) {
    try { await dbClient.query('ROLLBACK'); } catch {}
    console.error(`[CHECKOUT MULTI] rollback appt=${apptId} group=${groupId} reason=${err.message}`);
    return res.status(500).json({
      error: "Erreur lors de l'encaissement multi-paiement.",
      code: 'MULTI_CHECKOUT_FAILED',
    });
  } finally {
    try { dbClient.release(); } catch {}
  }

  // ── 8. Post-COMMIT : cache + side effects best-effort ────────────────────
  try { invalidateUserStatsCache(userId); } catch {}
  console.log(`[CHECKOUT MULTI] inserted appt=${apptId} group=${groupId}`
    + ` count=${insertedIds.length} total=${sumCents}c methods=[${methodsLog.join(',')}]`);

  // Hook parrainage : auto-validate si referral_use existe pour ce RDV.
  try {
    const { rows: ref } = await pool.query(
      `SELECT id FROM referral_uses
        WHERE appointment_id=$1 AND user_id=$2 AND status='pending'
        LIMIT 1`,
      [apptId, userId]
    );
    if (ref.length) {
      referralValidated = await validateReferralUse(ref[0].id, userId);
    }
  } catch (e) { console.warn('[CHECKOUT MULTI auto-validate referral]', e.message); }

  // Fidélité : 1 seul incrément avec le total (le breakdown = 1 vente).
  if (appt && appt.client_email) {
    try {
      const loyaltySource = (appt.source === 'rdv') ? 'online' : 'physical';
      loyaltyResult = await incrementStamps(
        userId, appt.client_email, appt.client_name || null,
        qtyTotal || 1, loyaltySource, totalAmount
      );
    } catch (loyErr) { console.error('[CHECKOUT MULTI LOYALTY]', loyErr.message); }
  }

  // Promo log : aligné flow legacy.
  if (appt && appt.promo_code_id) {
    try {
      const { rows: existingLog } = await pool.query(
        'SELECT id FROM promo_usage_logs WHERE appointment_id=$1 LIMIT 1',
        [apptId]
      );
      const discountFromAppt = parseFloat(appt.discount_amount || 0);
      if (!existingLog.length) {
        await pool.query(
          `INSERT INTO promo_usage_logs
             (user_id, promo_code_id, code_snapshot, client_email, client_name,
              transaction_id, appointment_id, discount_applied, transaction_amount)
           VALUES ($1,$2,(SELECT code FROM promo_codes WHERE id=$2),$3,$4,$5,$6,$7,$8)`,
          [userId, appt.promo_code_id,
           appt.client_email || null, appt.client_name || null,
           firstTxRow, apptId,
           discountFromAppt, totalAmount]
        );
      } else {
        await pool.query(
          'UPDATE promo_usage_logs SET transaction_id=$1, transaction_amount=$2 WHERE appointment_id=$3',
          [firstTxRow, totalAmount, apptId]
        );
      }
    } catch (e) { console.error('[CHECKOUT MULTI PROMO LOG]', e.message); }
  }

  return res.json({
    success: true,
    payment_group_id: groupId,
    transactions: payment_breakdown.map((it, i) => ({
      id: insertedIds[i],
      method: it.method,
      amount: it.amount_cents / 100,
    })),
    appointment_id: apptId,
    appointment_paid: true,
    amount: totalAmount,
    qty_total: qtyTotal,
    loyalty: loyaltyResult,
    referral_validated: referralValidated,
  });
}
