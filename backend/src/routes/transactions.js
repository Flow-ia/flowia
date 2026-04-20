const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { pinAdminMiddleware } = require('../middleware/pinAdmin');
const { incrementStamps } = require('../utils/loyalty-utils');
const { upsertLocalClient } = require('./clients');
const { resolveReferralForFilleul, validateReferralUse } = require('./referrals');
const { employeePinOptional } = require('../middleware/employeePinOptional');
const router = express.Router();

router.use(authMiddleware);
// AUDIT perms commit C : si un header x-employee-pin est présent, on
// charge req.employee (flags can_*). Routes sensibles (POST) utilisent
// req.employee.id comme employee_id (anti-spoofing du body).
router.use(employeePinOptional);

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
    const filters = ['t.user_id=$1'];

    if (from) { params.push(from); filters.push(`t.date >= $${params.length}`); }
    if (to)   { params.push(to);   filters.push(`t.date <= $${params.length}`); }

    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const { rows } = await pool.query(
      `SELECT t.id, t.user_id, t.type, t.amount, t.description,
        t.category_id, t.employee_id, t.payment_method, t.qty_total,
        t.locked, t.discount_amount, t.original_amount, t.promo_code_id,
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
  } catch(e) { console.error('[TX GET]', e.message); res.status(500).json({ error: e.message }); }
});

// ── POST / — créer une transaction (toujours locked=true) ────────────────────
router.post('/', async (req, res) => {
  try {
    const { type, amount, description, category_id, employee_id, payment_method,
            date, time, datetime_iso, appointment_id, source,
            client_email, client_name,
            promo_code_id, discount_amount, original_amount,
            client_note, items, payments, referral_code,
            idempotency_key } = req.body;
    if (!type || amount == null || !date)
      return res.status(400).json({ error: 'Champs obligatoires manquants.' });

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

    // INSERT avec ON CONFLICT sur (user_id, idempotency_key) — si le client
    // a envoyé la même clé en race (double-clic), la 2e tentative ne crée pas
    // de doublon. RETURNING vide → on SELECT l'existant et retourne.
    const insertResult = await pool.query(
      `INSERT INTO transactions
        (user_id, type, amount, description, category_id, employee_id,
         payment_method, date, time, datetime_iso, appointment_id, source, locked,
         promo_code_id, discount_amount, original_amount, client_email, client_note,
         qty_total, global_client_id, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING
       RETURNING id, user_id, type, amount, description, category_id, employee_id,
         payment_method, locked, client_email, client_note, qty_total,
         TO_CHAR(date, 'YYYY-MM-DD') as date,
         TO_CHAR(time, 'HH24:MI') as time,
         datetime_iso, appointment_id, source, created_at`,
      [req.user.userId, type, amt, description || null, category_id || null,
       effectiveEmployeeId, pmStored, date, time || null,
       datetime_iso || null, appointment_id || null, source || 'manual',
       promo_code_id || null, discount_amount || 0, original_amount || null,
       clientEmailNorm, client_note || null, qtyTotal, globalClientId,
       idemKey]
    );
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

    // Invalider le cache liste
    global.memCache?.del(`txs:${req.user.userId}`);

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
          const { rows: appt } = await pool.query(
            'SELECT client_email, client_name FROM appointments WHERE id=$1',
            [req.body.appointment_id]
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
  } catch(e) { console.error('[TX POST]', e.message); res.status(500).json({ error: e.message }); }
});

// ── PUT /:id — modifier (admin PIN requis + audit) ────────────────────────────
//   Mise à jour complète : champs de base + items[] + payments[] + infos client.
//   Les items et payments sont remplacés intégralement (delete + re-insert) pour
//   garantir la cohérence avec stats / commissions / recaps (qui lisent
//   transaction_items et transaction_payments).
router.put('/:id', pinAdminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { type, amount, description, category_id, employee_id,
            payment_method, date, time, datetime_iso, reason,
            client_email, client_name, client_note,
            items, payments } = req.body;

    const before = await getSnapshot(req.params.id);
    if (!before || before.user_id !== req.user.userId) {
      client.release();
      return res.status(404).json({ error: 'Transaction introuvable.' });
    }

    // Items normalisés → qty_total (fallback 1 si aucun item fourni)
    const hasItemsPayload = Array.isArray(items);
    const itemList = hasItemsPayload
      ? items.filter(it => it && it.service_name)
      : [];
    const qtyTotal = hasItemsPayload
      ? (itemList.length
          ? itemList.reduce((s, it) => s + (parseInt(it.qty) || 1), 0)
          : 1)
      : (before.qty_total || 1);

    // Paiements normalisés → pmStored + breakdown
    const hasPayPayload = Array.isArray(payments);
    const payList = hasPayPayload
      ? payments.filter(p => p && p.method && parseFloat(p.amount) > 0)
      : [];
    const pmStored = hasPayPayload
      ? (payList.length > 1 ? 'multi' : (payList[0]?.method || payment_method || 'cash'))
      : (payment_method || before.payment_method || 'cash');

    await client.query('BEGIN');

    // Normalisation client_email (LOWER+TRIM) cohérente avec POST
    const clientEmailNormPut = (typeof client_email === 'string' && client_email.trim())
      ? client_email.trim().toLowerCase()
      : null;

    const { rows } = await client.query(
      `UPDATE transactions SET
        type=$1, amount=$2, description=$3, category_id=$4, employee_id=$5,
        payment_method=$6, date=$7, time=$8, datetime_iso=$9,
        client_email=$10, client_note=$11, qty_total=$12
       WHERE id=$13 AND user_id=$14
       RETURNING id, user_id, type, amount, description, category_id, employee_id,
         payment_method, locked, client_email, client_note, qty_total,
         TO_CHAR(date, 'YYYY-MM-DD') as date,
         TO_CHAR(time, 'HH24:MI') as time,
         datetime_iso, appointment_id, source, created_at`,
      [type, amount, description || null, category_id || null, employee_id || null,
       pmStored, date, time || null, datetime_iso || null,
       clientEmailNormPut,
       client_note != null ? client_note : before.client_note,
       qtyTotal,
       req.params.id, req.user.userId]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Transaction introuvable.' });
    }

    // Remplacer items (si fournis)
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

    // Remplacer payments (si fournis) — toujours vider la table puis ré-insérer si split
    if (hasPayPayload) {
      await client.query('DELETE FROM transaction_payments WHERE transaction_id=$1', [req.params.id]);
      if (payList.length > 1) {
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

    // Invalider le cache liste
    global.memCache?.del(`txs:${req.user.userId}`);

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

    // Enrichir la réponse avec items + payments comme sur le GET
    const out = rows[0];
    out.items    = after?.items    || [];
    out.payments = after?.payments || [];
    if (loyaltyResync) out.loyalty_resync = loyaltyResync;
    if (emailChangedWarn) {
      out.email_changed_warning = "Email client modifié : les tampons fidélité restent sur l'ancien email. Transfert manuel nécessaire si besoin.";
    }
    res.json(out);
  } catch(e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[TX PUT]', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── DELETE /:id — supprimer (admin PIN requis + audit) ────────────────────────
// Rollback complet : promo uses_count, client_loyalty stamps/points, RDV
// paid + transaction_id, promo_usage_logs, client_rewards used→available,
// referral_uses cascade (existant).
router.delete('/:id', pinAdminMiddleware, async (req, res) => {
  try {
    const before = await getSnapshot(req.params.id);
    if (!before || before.user_id !== req.user.userId)
      return res.status(404).json({ error: 'Transaction introuvable.' });

    // Récupérer les referral_uses liés AVANT le DELETE (FK SET NULL perdrait la trace)
    const { rows: refs } = await pool.query(
      `SELECT id, status, parrain_promo_id FROM referral_uses
        WHERE transaction_id=$1 AND user_id=$2`,
      [req.params.id, req.user.userId]
    );

    await pool.query('DELETE FROM transactions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]);

    // R3a : rollback uses_count + restaurer client_rewards (birthday / fidélité
    // / parrain) si la promo était liée à une reward consommée par cette tx.
    if (before.promo_code_id) {
      try {
        await pool.query(
          `UPDATE promo_codes
             SET uses_count = GREATEST(0, uses_count - 1),
                 is_active  = TRUE
           WHERE id=$1 AND user_id=$2`,
          [before.promo_code_id, req.user.userId]
        );
        // Client_rewards : la promo consommée peut être 'used' — restaurer
        // à 'available' pour que le client puisse ré-utiliser (puisque la
        // transaction qui l'a consommée n'existe plus).
        await pool.query(
          `UPDATE client_rewards SET status='available', used_at=NULL
            WHERE user_id=$1 AND promo_code_id=$2 AND status='used'`,
          [req.user.userId, before.promo_code_id]
        );
        // Promo_usage_logs : supprimer la ligne pour cette transaction
        await pool.query(
          `DELETE FROM promo_usage_logs WHERE transaction_id=$1`,
          [req.params.id]
        );
      } catch (pErr) { console.warn('[TX DELETE promo rollback]', pErr.message); }
    }

    // R3b : décrémenter stamps / points fidélité (best effort, clamp ≥ 0).
    // On cherche le programme actif pour savoir s'il est en mode points ou stamps.
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

    // R3c : si transaction liée à un RDV, le RDV redevient non-encaissé
    // (sinon il reste paid=TRUE avec transaction_id vers une ligne supprimée).
    if (before.appointment_id) {
      try {
        await pool.query(
          `UPDATE appointments
              SET paid=FALSE, paid_method=NULL, transaction_id=NULL,
                  status='confirmed', updated_at=NOW()
            WHERE id=$1 AND user_id=$2`,
          [before.appointment_id, req.user.userId]
        );
      } catch (aErr) { console.warn('[TX DELETE appt unpay]', aErr.message); }
    }

    // Cascade referral_uses (déjà en place)
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

    await audit(req.user.userId, req.params.id, 'delete', before, null,
      req.body?.reason || 'Suppression admin');

    res.json({
      ok: true,
      referrals_revoked: refs.length,
      appointment_unpaid: !!before.appointment_id,
      promo_rollback: !!before.promo_code_id,
    });
  } catch(e) { console.error('[TX DELETE]', e.message); res.status(500).json({ error: e.message }); }
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;