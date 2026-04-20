// routes/credits.js — Système de crédit client
// Architecture :
//   - client_credits    : solde courant (un par client/commerce)
//   - credit_transactions : historique de chaque opération
//   - grant  → accorder un crédit (dette client)
//   - repay  → remboursement → crée une vraie transaction 'revenue' en caisse
//              attribuée à l'employé encaissant, source='credit'

const express  = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router   = express.Router();
router.use(authMiddleware);

// ─── Helper : upsert compte crédit ───────────────────────────────────────────
async function getOrCreateCredit(userId, clientEmail, clientName) {
  const email = clientEmail.toLowerCase().trim();
  const { rows } = await pool.query(
    `INSERT INTO client_credits (user_id, client_email, client_name, balance, total_granted, total_repaid)
     VALUES ($1,$2,$3,0,0,0)
     ON CONFLICT (user_id, client_email) DO UPDATE SET
       client_name = COALESCE(NULLIF(EXCLUDED.client_name,''), client_credits.client_name),
       updated_at  = NOW()
     RETURNING *`,
    [userId, email, clientName || email]
  );
  return rows[0];
}

// ─── Helper : résoudre email/nom depuis client_id ─────────────────────────────
async function resolveClient(userId, clientId, clientEmail) {
  if (clientEmail) return { email: clientEmail.toLowerCase().trim(), name: null };
  if (!clientId) return null;
  const { rows } = await pool.query(
    'SELECT email, first_name, last_name FROM client_accounts WHERE id=$1 AND user_id=$2',
    [clientId, userId]
  );
  if (!rows[0]) return null;
  return { email: rows[0].email, name: `${rows[0].first_name} ${rows[0].last_name}`.trim() };
}

// GET /api/credits — liste
router.get('/', async (req, res) => {
  try {
    const uid = req.user.userId;
    const { search, only_active } = req.query;
    let q = `
      SELECT cc.*, ca.id AS client_id, ca.first_name, ca.last_name, ca.phone, ca.global_client_id,
        COALESCE(ca.first_name||' '||ca.last_name, cc.client_name, cc.client_email) AS full_name
      FROM client_credits cc
      LEFT JOIN client_accounts ca ON ca.user_id=cc.user_id AND LOWER(ca.email)=LOWER(cc.client_email)
      WHERE cc.user_id=$1`;
    const params = [uid];
    if (only_active === 'true') q += ` AND cc.balance > 0`;
    if (search) {
      params.push(`%${search.trim()}%`);
      q += ` AND (cc.client_name ILIKE $${params.length} OR cc.client_email ILIKE $${params.length} OR (ca.first_name||' '||ca.last_name) ILIKE $${params.length} OR ca.phone ILIKE $${params.length})`;
    }
    q += ` ORDER BY cc.balance DESC, cc.updated_at DESC`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e) { console.error('[GET /credits]', e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// GET /api/credits/client/:clientId — crédit + historique
router.get('/client/:clientId', async (req, res) => {
  try {
    const uid = req.user.userId;
    const { rows: ca } = await pool.query(
      'SELECT id, email, first_name, last_name, phone FROM client_accounts WHERE id=$1 AND user_id=$2',
      [req.params.clientId, uid]
    );
    if (!ca[0]) return res.status(404).json({ error: 'Client introuvable.' });
    const { rows: credits } = await pool.query(
      'SELECT * FROM client_credits WHERE user_id=$1 AND LOWER(client_email)=LOWER($2)',
      [uid, ca[0].email]
    );
    let history = [];
    if (credits[0]) {
      const { rows } = await pool.query(
        `SELECT ct.*, e.name AS employee_name, e.avatar_color,
           t.payment_method AS tx_payment_method, t.id AS transaction_id
         FROM credit_transactions ct
         LEFT JOIN employees e ON e.id=ct.employee_id
         LEFT JOIN transactions t ON t.id=ct.transaction_id
         WHERE ct.credit_id=$1
         ORDER BY ct.created_at DESC LIMIT 100`,
        [credits[0].id]
      );
      history = rows;
    }
    res.json({ credit: credits[0]||null, history, client: ca[0] });
  } catch (e) { console.error('[GET /credits/client]', e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/credits/grant — accorder un crédit
router.post('/grant', async (req, res) => {
  const db = await pool.connect();
  try {
    const uid = req.user.userId;
    const { client_id, client_email, client_name, amount, note, employee_id, appointment_id } = req.body;
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Montant invalide.' });
    const client = await resolveClient(uid, client_id, client_email);
    if (!client) return res.status(400).json({ error: 'Client introuvable.' });
    const name = client_name || client.name;

    let empName = null;
    if (employee_id) {
      const { rows: empR } = await db.query(
        'SELECT name, can_grant_credit FROM employees WHERE id=$1 AND user_id=$2 AND is_active=TRUE',
        [employee_id, uid]
      );
      if (!empR.length) return res.status(404).json({ error: 'Employé introuvable.' });
      if (empR[0].can_grant_credit === false)
        return res.status(403).json({ error: "Cet employé n'a pas la permission d'accorder des crédits." });
      empName = empR[0].name;
    }

    const amt = parseFloat(amount);
    await db.query('BEGIN');
    try {
      // getOrCreateCredit n'utilise pas `db` directement — on upsert inline
      // pour rester dans la transaction.
      const email = client.email.toLowerCase().trim();
      const { rows: creditRows } = await db.query(
        `INSERT INTO client_credits (user_id, client_email, client_name, balance, total_granted, total_repaid)
         VALUES ($1,$2,$3,0,0,0)
         ON CONFLICT (user_id, client_email) DO UPDATE SET
           client_name = COALESCE(NULLIF(EXCLUDED.client_name,''), client_credits.client_name),
           updated_at  = NOW()
         RETURNING *`,
        [uid, email, name || email]
      );
      const credit = creditRows[0];
      const { rows: updated } = await db.query(
        'UPDATE client_credits SET balance=balance+$1, total_granted=total_granted+$1, updated_at=NOW() WHERE id=$2 RETURNING *',
        [amt, credit.id]
      );
      const { rows: ct } = await db.query(
        `INSERT INTO credit_transactions (user_id,credit_id,client_email,employee_id,employee_name,type,amount,note,appointment_id)
         VALUES ($1,$2,$3,$4,$5,'grant',$6,$7,$8) RETURNING *`,
        [uid, credit.id, client.email, employee_id||null, empName, amt, note||null, appointment_id||null]
      );
      await db.query('COMMIT');
      res.json({
        ok: true, credit: updated[0], credit_transaction: ct[0],
        message: `Crédit de ${amt.toFixed(2)} € accordé. Solde : ${parseFloat(updated[0].balance).toFixed(2)} €`,
      });
    } catch (txErr) {
      await db.query('ROLLBACK').catch(() => {});
      throw txErr;
    }
  } catch (e) {
    console.error('[POST /credits/grant]', e);
    res.status(500).json({ error: 'Erreur serveur.' });
  } finally {
    db.release();
  }
});

// POST /api/credits/repay — remboursement → transaction en caisse
// Critique : 3 opérations (INSERT tx + UPDATE balance + INSERT credit_tx)
// doivent être atomiques. Avant, un crash entre INSERT tx et UPDATE balance
// laissait une transaction de caisse non-adossée à un débit de crédit
// (client payait et le solde ne baissait pas → double réclamation).
router.post('/repay', async (req, res) => {
  const db = await pool.connect();
  try {
    const uid = req.user.userId;
    const { client_id, client_email, amount, payment_method = 'cash', note, employee_id } = req.body;
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Montant invalide.' });
    const validMethods = ['cash','card','transfer','other'];
    if (!validMethods.includes(payment_method)) return res.status(400).json({ error: 'Moyen de paiement invalide.' });

    const client = await resolveClient(uid, client_id, client_email);
    if (!client) return res.status(400).json({ error: 'Client introuvable.' });

    let empRow = null;
    if (employee_id) {
      const { rows: empR } = await db.query(
        'SELECT id, name, can_encash, can_repay_credit FROM employees WHERE id=$1 AND user_id=$2 AND is_active=TRUE',
        [employee_id, uid]
      );
      if (!empR.length) return res.status(404).json({ error: 'Employé introuvable.' });
      const canRepay = (empR[0].can_repay_credit !== null && empR[0].can_repay_credit !== undefined)
        ? empR[0].can_repay_credit : empR[0].can_encash;
      if (canRepay === false)
        return res.status(403).json({ error: "Cet employé n'a pas la permission d'encaisser les remboursements." });
      empRow = empR[0];
    }

    // Date/heure TZ-aware (merchant) — avant: new Date() UTC sur Render →
    // une transaction faite à 23h30 Paris était datée du lendemain.
    const { rows: tzRows } = await db.query(
      `SELECT COALESCE(bs.timezone,'Europe/Paris') AS tz,
              TO_CHAR(NOW() AT TIME ZONE COALESCE(bs.timezone,'Europe/Paris'), 'YYYY-MM-DD') AS date_str,
              TO_CHAR(NOW() AT TIME ZONE COALESCE(bs.timezone,'Europe/Paris'), 'HH24:MI')    AS time_str
         FROM users u
         LEFT JOIN booking_settings bs ON bs.user_id = u.id
         WHERE u.id = $1`,
      [uid]
    );
    const dateStr = tzRows[0]?.date_str || new Date().toLocaleDateString('sv-SE');
    const timeStr = tzRows[0]?.time_str || new Date().toTimeString().substring(0, 5);
    const nowIso  = new Date().toISOString();

    const PAYMENT_LABELS = { cash:'Espèces', card:'Carte bancaire', transfer:'Virement', other:'Autre' };

    await db.query('BEGIN');
    try {
      // FOR UPDATE pour sérialiser deux remboursements concurrents du même
      // crédit (sinon : lire balance=50, 2 threads soustraient 30 chacun →
      // balance=-10 ou incohérence).
      const { rows: credits } = await db.query(
        'SELECT * FROM client_credits WHERE user_id=$1 AND LOWER(client_email)=LOWER($2) FOR UPDATE',
        [uid, client.email]
      );
      if (!credits[0]) {
        await db.query('ROLLBACK');
        return res.status(404).json({ error: 'Aucun crédit pour ce client.' });
      }
      const credit = credits[0];
      const amt    = parseFloat(amount);
      const balance = parseFloat(credit.balance);
      if (amt > balance) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: `Montant (${amt.toFixed(2)} €) supérieur au solde (${balance.toFixed(2)} €).` });
      }

      const clientDisplay  = credit.client_name || client.email;
      const desc = `Remboursement crédit — ${clientDisplay}${note ? ` · ${note}` : ''} (${PAYMENT_LABELS[payment_method]||payment_method})`;

      const { rows: txR } = await db.query(
        `INSERT INTO transactions
           (user_id, type, amount, description, employee_id, payment_method,
            date, time, datetime_iso, source, client_email)
         VALUES ($1,'revenue',$2,$3,$4,$5,$6,$7,$8,'credit',$9)
         RETURNING id, type,
           TO_CHAR(date,'YYYY-MM-DD') AS date, TO_CHAR(time,'HH24:MI') AS time,
           amount, description, payment_method, employee_id, source, client_email, created_at`,
        [uid, amt, desc, employee_id||null, payment_method, dateStr, timeStr, nowIso, client.email]
      );
      const tx = txR[0];

      const { rows: updated } = await db.query(
        'UPDATE client_credits SET balance=balance-$1, total_repaid=total_repaid+$1, updated_at=NOW() WHERE id=$2 RETURNING *',
        [amt, credit.id]
      );

      const { rows: ct } = await db.query(
        `INSERT INTO credit_transactions
           (user_id,credit_id,client_email,employee_id,employee_name,type,amount,note,transaction_id,payment_method)
         VALUES ($1,$2,$3,$4,$5,'repay',$6,$7,$8,$9) RETURNING *`,
        [uid, credit.id, client.email, employee_id||null, empRow?.name||null, amt, note||null, tx.id, payment_method]
      );

      await db.query('COMMIT');
      res.json({
        ok: true, credit: updated[0], credit_transaction: ct[0], transaction: tx,
        message: parseFloat(updated[0].balance) === 0
          ? `✓ Crédit soldé intégralement (${amt.toFixed(2)} €)`
          : `Paiement de ${amt.toFixed(2)} € enregistré. Reste dû : ${parseFloat(updated[0].balance).toFixed(2)} €`,
      });
    } catch (txErr) {
      await db.query('ROLLBACK').catch(() => {});
      throw txErr;
    }
  } catch (e) {
    console.error('[POST /credits/repay]', e);
    res.status(500).json({ error: 'Erreur serveur.' });
  } finally {
    db.release();
  }
});

// DELETE /api/credits/:id — supprimer (soldé seulement)
router.delete('/:id', async (req, res) => {
  try {
    const uid = req.user.userId;
    const { rows } = await pool.query('SELECT * FROM client_credits WHERE id=$1 AND user_id=$2', [req.params.id, uid]);
    if (!rows[0]) return res.status(404).json({ error: 'Crédit introuvable.' });
    if (parseFloat(rows[0].balance) > 0)
      return res.status(400).json({ error: `Solde restant : ${parseFloat(rows[0].balance).toFixed(2)} €. Soldez d'abord le crédit.` });
    await pool.query('DELETE FROM client_credits WHERE id=$1 AND user_id=$2', [req.params.id, uid]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;
