const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { pinAdminMiddleware } = require('../middleware/pinAdmin');
const { incrementStamps } = require('../utils/loyalty-utils');
const { upsertLocalClient } = require('./clients');
const { resolveReferralForFilleul, validateReferralUse } = require('./referrals');
const router = express.Router();

router.use(authMiddleware);

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
        t.locked,
        TO_CHAR(t.date, 'YYYY-MM-DD') as date,
        TO_CHAR(t.time, 'HH24:MI') as time,
        t.datetime_iso, t.appointment_id, t.source, t.created_at,
        c.name as category_name, c.icon as category_icon, c.color as category_color,
        e.name as employee_name, e.avatar_color as employee_avatar_color,
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
       LEFT JOIN employees e ON t.employee_id = e.id
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
            client_note, items, payments, referral_code } = req.body;
    if (!type || amount == null || !date)
      return res.status(400).json({ error: 'Champs obligatoires manquants.' });

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
          // Raisons claires pour le frontend (quota dépassé, filleul non
          // nouveau, self-referral…). 400 bloque la transaction.
          const msg = {
            program_disabled: "Programme parrainage désactivé.",
            code_not_found:   'Code parrainage invalide.',
            self_referral:    'Le parrain ne peut pas être son propre filleul.',
            filleul_not_new:  'Ce client a déjà été servi — le parrainage ne peut plus s\'appliquer.',
            already_parraine:'Ce client a déjà bénéficié d\'un parrainage.',
            quota_exceeded:   'Limite de parrainages atteinte pour ce parrain.',
          }[resolved.reason] || 'Parrainage non applicable.';
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
    const payList = Array.isArray(payments)
      ? payments.filter(p => p && p.method && parseFloat(p.amount) > 0)
      : [];
    const pmStored = payList.length > 1
      ? 'multi'
      : (payList[0]?.method || payment_method || 'cash');

    // Résoudre global_client_id depuis l'email (cross-commerçant → passage sur place
    // visible sur le compte client connecté).
    let globalClientId = null;
    if (client_email) {
      try {
        const { rows: gc } = await pool.query(
          'SELECT id FROM global_clients WHERE LOWER(email)=LOWER($1) LIMIT 1',
          [client_email]
        );
        if (gc.length) globalClientId = gc[0].id;
      } catch (e) { console.warn('[TX global_client lookup]', e.message); }
    }

    const { rows } = await pool.query(
      `INSERT INTO transactions
        (user_id, type, amount, description, category_id, employee_id,
         payment_method, date, time, datetime_iso, appointment_id, source, locked,
         promo_code_id, discount_amount, original_amount, client_email, client_note,
         qty_total, global_client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id, user_id, type, amount, description, category_id, employee_id,
         payment_method, locked, client_email, client_note, qty_total,
         TO_CHAR(date, 'YYYY-MM-DD') as date,
         TO_CHAR(time, 'HH24:MI') as time,
         datetime_iso, appointment_id, source, created_at`,
      [req.user.userId, type, amount, description || null, category_id || null,
       employee_id || null, pmStored, date, time || null,
       datetime_iso || null, appointment_id || null, source || 'manual',
       promo_code_id || null, discount_amount || 0, original_amount || null,
       client_email || null, client_note || null, qtyTotal, globalClientId]
    );
    const tx = rows[0];

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
    if (client_note && client_note.trim() && (client_email || client_name)) {
      await pool.query(
        `INSERT INTO client_notes
           (user_id, client_email, client_name, note_text, appointment_id,
            created_by_employee_id, created_by_name)
         VALUES ($1,$2,$3,$4,NULL,$5,$6)`,
        [req.user.userId, client_email || null, client_name || null,
         client_note.trim(), employee_id || null, null]
      ).catch(e => console.error('[CLIENT NOTE ERR]', e.message));
    }

    // Incrémenter uses_count du code promo si utilisé
    if (promo_code_id) {
      // Incrémenter uses_count ET désactiver si max_uses atteint
      await pool.query(
        `UPDATE promo_codes
           SET uses_count = uses_count + 1,
               is_active  = CASE
                 WHEN max_uses IS NOT NULL AND (uses_count + 1) >= max_uses THEN FALSE
                 ELSE is_active
               END
         WHERE id=$1 AND user_id=$2`,
        [promo_code_id, req.user.userId]
      ).catch(e => console.error('[PROMO COUNT ERR]', e.message));

      // Log traçabilité usage avec montant transaction
      const logEmail = client_email || null;
      const logName  = client_name  || null;
      await pool.query(
        `INSERT INTO promo_usage_logs
           (user_id,promo_code_id,code_snapshot,client_email,client_name,
            transaction_id,discount_applied,transaction_amount)
         VALUES ($1,$2,(SELECT code FROM promo_codes WHERE id=$2),$3,$4,$5,$6,$7)`,
        [req.user.userId, promo_code_id, logEmail, logName, tx.id,
         discount_amount||0, original_amount||amount||0]
      ).catch(e => console.error('[PROMO LOG ERR]', e.message));
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
        let clientEmail = req.body.client_email || null;
        let clientName  = req.body.client_name  || null;
        if (!clientEmail && req.body.appointment_id) {
          const { rows: appt } = await pool.query(
            'SELECT client_email, client_name FROM appointments WHERE id=$1',
            [req.body.appointment_id]
          );
          if (appt.length) { clientEmail = appt[0].client_email; clientName = appt[0].client_name; }
        }
        if (clientEmail) {
          // Les transactions manuelles (caisse) = source 'physical'
          await incrementStamps(req.user.userId, clientEmail, clientName, 1, 'physical', amount || 0);
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
       client_email || null,
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

    const after = await getSnapshot(req.params.id);
    await audit(req.user.userId, req.params.id, 'update', before, after, reason || null);

    // Enrichir la réponse avec items + payments comme sur le GET
    const out = rows[0];
    out.items    = after?.items    || [];
    out.payments = after?.payments || [];
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
router.delete('/:id', pinAdminMiddleware, async (req, res) => {
  try {
    const before = await getSnapshot(req.params.id);
    if (!before || before.user_id !== req.user.userId)
      return res.status(404).json({ error: 'Transaction introuvable.' });

    await pool.query('DELETE FROM transactions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]);

    global.memCache?.del(`txs:${req.user.userId}`);

    await audit(req.user.userId, req.params.id, 'delete', before, null,
      req.body?.reason || 'Suppression admin');

    res.json({ ok: true });
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