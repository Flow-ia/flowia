const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { pinAdminMiddleware } = require('../middleware/pinAdmin');
const { incrementStamps } = require('../utils/loyalty-utils');
const { upsertLocalClient } = require('./clients');
const router = express.Router();

router.use(authMiddleware);

// ── Helper : snapshot complet d'une transaction ──────────────────────────────
async function getSnapshot(id) {
  const { rows } = await pool.query('SELECT * FROM transactions WHERE id=$1', [id]);
  return rows[0] || null;
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

// ── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const _tk = 'txs:' + req.user.userId;
    const _th = global.memCache?.get(_tk);
    if (_th) return res.json(_th);

    const { rows } = await pool.query(
      `SELECT t.id, t.user_id, t.type, t.amount, t.description,
        t.category_id, t.employee_id, t.payment_method, t.qty_total,
        t.locked,
        TO_CHAR(t.date, 'YYYY-MM-DD') as date,
        TO_CHAR(t.time, 'HH24:MI') as time,
        t.datetime_iso, t.appointment_id, t.source, t.created_at,
        c.name as category_name, c.icon as category_icon, c.color as category_color,
        e.name as employee_name, e.avatar_color as employee_avatar_color
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN employees e ON t.employee_id = e.id
       WHERE t.user_id=$1
       ORDER BY t.date DESC, t.time DESC NULLS LAST, t.created_at DESC`,
      [req.user.userId]
    );
    global.memCache?.set(_tk, rows, 30 * 1000);
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
            client_note } = req.body;
    if (!type || amount == null || !date)
      return res.status(400).json({ error: 'Champs obligatoires manquants.' });

    const { rows } = await pool.query(
      `INSERT INTO transactions
        (user_id, type, amount, description, category_id, employee_id,
         payment_method, date, time, datetime_iso, appointment_id, source, locked,
         promo_code_id, discount_amount, original_amount, client_email, client_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,$13,$14,$15,$16,$17)
       RETURNING id, user_id, type, amount, description, category_id, employee_id,
         payment_method, locked, client_email, client_note,
         TO_CHAR(date, 'YYYY-MM-DD') as date,
         TO_CHAR(time, 'HH24:MI') as time,
         datetime_iso, appointment_id, source, created_at`,
      [req.user.userId, type, amount, description || null, category_id || null,
       employee_id || null, payment_method || 'cash', date, time || null,
       datetime_iso || null, appointment_id || null, source || 'manual',
       promo_code_id || null, discount_amount || 0, original_amount || null,
       client_email || null, client_note || null]
    );
    const tx = rows[0];

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
router.put('/:id', pinAdminMiddleware, async (req, res) => {
  try {
    const { type, amount, description, category_id, employee_id,
            payment_method, date, time, datetime_iso, reason } = req.body;

    const before = await getSnapshot(req.params.id);
    if (!before || before.user_id !== req.user.userId)
      return res.status(404).json({ error: 'Transaction introuvable.' });

    const { rows } = await pool.query(
      `UPDATE transactions SET
        type=$1, amount=$2, description=$3, category_id=$4, employee_id=$5,
        payment_method=$6, date=$7, time=$8, datetime_iso=$9
       WHERE id=$10 AND user_id=$11
       RETURNING id, user_id, type, amount, description, category_id, employee_id,
         payment_method, locked,
         TO_CHAR(date, 'YYYY-MM-DD') as date,
         TO_CHAR(time, 'HH24:MI') as time,
         datetime_iso, created_at`,
      [type, amount, description || null, category_id || null, employee_id || null,
       payment_method || 'cash', date, time || null, datetime_iso || null,
       req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Transaction introuvable.' });

    await audit(req.user.userId, req.params.id, 'update', before, rows[0], reason || null);

    res.json(rows[0]);
  } catch(e) { console.error('[TX PUT]', e.message); res.status(500).json({ error: e.message }); }
});

// ── DELETE /:id — supprimer (admin PIN requis + audit) ────────────────────────
router.delete('/:id', pinAdminMiddleware, async (req, res) => {
  try {
    const before = await getSnapshot(req.params.id);
    if (!before || before.user_id !== req.user.userId)
      return res.status(404).json({ error: 'Transaction introuvable.' });

    await pool.query('DELETE FROM transactions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]);

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
