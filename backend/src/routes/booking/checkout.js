// src/routes/booking/checkout.js — Encaissement RDV (gros endpoint, ~220 lignes)
// POST /appointments/:id/checkout : claim atomique, création transaction,
// validation referral, incrémentation fidélité, log promo.
const { pool } = require('../../db');
const { incrementStamps } = require('../../utils/loyalty-utils');
const { validateReferralUse } = require('../referrals');
const { canCreateCashTransaction } = require('../../services/transactionValidator');
const { invalidateUserStatsCache } = require('../../utils/paymentV3');

module.exports = function attachCheckoutRoutes(router) {
  // ── Encaissement RDV → crée une transaction + marque le RDV paid ─────────────
  // POST /api/booking/appointments/:id/checkout
  router.post('/appointments/:id/checkout', async (req, res) => {
    try {
      const { employee_id, payment_method, category_id, amount: customAmount,
              payments: payList = [] } = req.body;
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
