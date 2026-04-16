// routes/payments.js — Paiements recharge SMS via SumUp (securise)
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

const SMS_COST   = parseFloat(process.env.SMS_COST_UNIT)     || 0.045;
const SMS_MARGIN = parseFloat(process.env.SMS_MARGIN_PERCENT) || 30;
const SMS_PRICE  = parseFloat((SMS_COST * (1 + SMS_MARGIN / 100)).toFixed(4));

// ── POST /api/payments/sms/checkout ─────────────────────────────────────────
// Cree un checkout SumUp. NE CREDITE PAS le solde — attend confirmation.
router.post('/sms/checkout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const amount = parseFloat(req.body.amount);

    if (!amount || amount < 5) {
      return res.status(400).json({ error: 'Montant minimum : 5EUR' });
    }

    const SUMUP_KEY    = process.env.SUMUP_SECRET_KEY;
    const BACKEND_URL  = process.env.BACKEND_URL || 'https://flowia-backend.onrender.com';
    const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://haircoifflille.fr').split(',')[0].trim();

    // Etape 1 : recuperer le merchant_code
    const meRes = await fetch('https://api.sumup.com/v0.1/me', {
      headers: { 'Authorization': `Bearer ${SUMUP_KEY}` }
    });
    const meData = await meRes.json();
    const merchantCode = meData.merchant_profile?.merchant_code;

    if (!merchantCode) {
      console.error('[SUMUP /me] reponse:', JSON.stringify(meData));
      return res.status(500).json({ error: 'Compte SumUp non configure.' });
    }

    const ref = `sms_${userId}_${Date.now()}`;
    const smsCost   = parseFloat(process.env.SMS_COST_UNIT)      || 0.045;
    const smsMargin = parseFloat(process.env.SMS_MARGIN_PERCENT)  || 30;
    const smsPrice  = parseFloat((smsCost * (1 + smsMargin / 100)).toFixed(4));
    const estimatedSms = Math.floor(amount / smsPrice);

    // Etape 2 : creer le checkout SumUp.
    // SumUp ne fournit PAS de page hebergee (pay.sumup.com renvoie 404).
    // Le paiement se fait via le widget embarque SumUp Card (SDK JS).
    // On renvoie donc uniquement le checkout_id au frontend, qui mounte le widget.
    const checkoutBody = {
      checkout_reference: ref,
      amount: parseFloat(amount.toFixed(2)),
      currency: 'EUR',
      merchant_code: merchantCode,
      description: 'Recharge SMS FlowIA',
      // URL de retour apres 3DS (le widget embarque revient ici si redirection 3DS necessaire)
      redirect_url: `${FRONTEND_URL}/settings/marketing?recharge=pending&ref=${ref}`
    };

    console.log('[SUMUP] Creation checkout:', JSON.stringify(checkoutBody));

    const response = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUMUP_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(checkoutBody)
    });

    const checkout = await response.json();
    console.log('[SUMUP] Reponse complete:', JSON.stringify(checkout));

    if (!checkout.id) {
      return res.status(500).json({
        error: 'SumUp error: ' + (checkout.message || JSON.stringify(checkout))
      });
    }

    // Etape 3 : enregistrer EN ATTENTE — NE PAS CREDITER ICI
    await pool.query(`
      INSERT INTO sms_transactions
        (user_id, type, amount, sms_count, description, sumup_checkout_id, status)
      VALUES ($1, 'credit', $2, $3, $4, $5, 'pending')
    `, [userId, amount, estimatedSms, `Recharge ${amount}EUR`, checkout.id]);

    res.json({
      checkout_id: checkout.id,
      checkout_ref: ref,
      estimated_sms: estimatedSms
    });

  } catch(e) {
    console.error('[SUMUP CHECKOUT ERROR]', e.message);
    res.status(500).json({ error: 'Erreur: ' + e.message });
  }
});

// ── POST /api/payments/sms/webhook ──────────────────────────────────────────
// SumUp envoie un POST quand le statut change. On VERIFIE toujours via l'API.
router.post('/sms/webhook', async (req, res) => {
  // Repondre immediatement 200 (SumUp exige)
  res.sendStatus(200);

  try {
    const { event_type, id: checkoutId } = req.body;
    console.log('[SUMUP WEBHOOK]', event_type, checkoutId);

    if (event_type !== 'CHECKOUT_STATUS_CHANGED' || !checkoutId) return;

    const SUMUP_KEY = process.env.SUMUP_SECRET_KEY;

    // TOUJOURS verifier avec l'API SumUp (ne pas faire confiance au webhook seul)
    const sumupRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkoutId}`, {
      headers: { 'Authorization': `Bearer ${SUMUP_KEY}` }
    });
    const checkout = await sumupRes.json();

    if (checkout.status !== 'PAID') {
      console.log('[SUMUP WEBHOOK] Statut non PAID:', checkout.status);
      return;
    }

    // Trouver la transaction pending
    const { rows: txRows } = await pool.query(
      "SELECT * FROM sms_transactions WHERE sumup_checkout_id=$1 AND status='pending'",
      [checkoutId]
    );

    if (!txRows.length) {
      console.log('[SUMUP WEBHOOK] Transaction introuvable ou deja traitee:', checkoutId);
      return;
    }

    const tx = txRows[0];

    // Crediter le solde
    await pool.query(
      'UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2',
      [tx.amount, tx.user_id]
    );

    await pool.query(
      "UPDATE sms_transactions SET status='completed' WHERE id=$1",
      [tx.id]
    );

    console.log('[SUMUP WEBHOOK] Solde credite:', tx.amount, 'EUR pour user:', tx.user_id);

  } catch(e) {
    console.error('[SUMUP WEBHOOK ERROR]', e.message);
  }
});

// ── GET /api/payments/sms/verify/:checkoutId ────────────────────────────────
// Verification manuelle au retour du commercant. VERIFIE avec SumUp avant credit.
router.get('/sms/verify/:checkoutId', authMiddleware, async (req, res) => {
  try {
    const { checkoutId } = req.params;
    const userId = req.user.userId;
    const SUMUP_KEY = process.env.SUMUP_SECRET_KEY;

    // Etape 1 : verifier avec SumUp (TOUJOURS)
    const sumupRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkoutId}`, {
      headers: { 'Authorization': `Bearer ${SUMUP_KEY}` }
    });
    const checkout = await sumupRes.json();

    const txStatuses = (checkout.transactions || []).map(t => t.status);
    console.log('[SUMUP VERIFY]', checkoutId, '| Status:', checkout.status, '| Transactions:', txStatuses);

    // Etape 2 : en sandbox le statut principal peut rester PENDING
    // meme si une transaction SUCCESSFUL existe dans le tableau.
    const hasPaidTransaction = (checkout.transactions || []).some(t => t.status === 'SUCCESSFUL');
    const isPaid = checkout.status === 'PAID' || hasPaidTransaction;

    if (!isPaid) {
      return res.json({
        credited: false,
        status: checkout.status || 'unknown',
        transactions: txStatuses,
        message: 'Paiement non confirme par SumUp'
      });
    }

    // Etape 3 : verifier que ce checkout appartient bien a cet utilisateur
    const { rows: txRows } = await pool.query(
      `SELECT * FROM sms_transactions
       WHERE sumup_checkout_id=$1 AND user_id=$2`,
      [checkoutId, userId]
    );

    if (!txRows.length) {
      return res.status(404).json({ error: 'Transaction introuvable.' });
    }

    const tx = txRows[0];

    // Etape 4 : verifier pas deja credite (protection doublon)
    if (tx.status === 'completed') {
      const { rows: [userBal] } = await pool.query(
        'SELECT sms_balance FROM users WHERE id=$1', [userId]
      );
      return res.json({
        credited: false,
        already_credited: true,
        status: 'PAID',
        new_balance: parseFloat(userBal.sms_balance).toFixed(2)
      });
    }

    // Etape 5 : crediter le solde MAINTENANT (paiement confirme)
    await pool.query(
      'UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2',
      [tx.amount, userId]
    );

    // Etape 6 : marquer la transaction comme completee
    await pool.query(
      "UPDATE sms_transactions SET status='completed' WHERE id=$1",
      [tx.id]
    );

    // Retourner le nouveau solde
    const { rows: [user] } = await pool.query(
      'SELECT sms_balance FROM users WHERE id=$1', [userId]
    );

    console.log('[SUMUP VERIFY] Credite:', tx.amount, 'EUR → user:', userId);

    res.json({
      credited: true,
      amount: tx.amount,
      sms_count: tx.sms_count,
      new_balance: parseFloat(user.sms_balance).toFixed(2),
      new_sms_estimated: Math.floor(parseFloat(user.sms_balance) / SMS_PRICE),
      status: 'PAID'
    });

  } catch(e) {
    console.error('[SUMUP VERIFY ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/payments/sms/balance ───────────────────────────────────────────
router.get('/sms/balance', authMiddleware, async (req, res) => {
  try {
    const cacheKey = `sms_balance_${req.user.userId}`;
    const cached = global.memCache?.get(cacheKey);
    if (cached) return res.json(cached);

    const { rows } = await pool.query(`SELECT sms_balance FROM users WHERE id=$1`, [req.user.userId]);
    const balance = parseFloat(rows[0]?.sms_balance || 0);
    const result = {
      balance,
      estimated_sms: Math.floor(balance / SMS_PRICE),
      price_per_sms: SMS_PRICE,
    };
    global.memCache?.set(cacheKey, result, 30000);
    res.json(result);
  } catch (err) {
    console.error('[BALANCE sms]', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/payments/sms/transactions ──────────────────────────────────────
// Ne retourne PAS les transactions pending (pas encore confirmees)
router.get('/sms/transactions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM sms_transactions
      WHERE user_id=$1
      AND status != 'pending'
      ORDER BY created_at DESC
      LIMIT 10
    `, [req.user.userId]);
    res.json(rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/payments/sms/transaction-by-ref/:ref ───────────────────────────
// Chercher une transaction par sa reference (checkout_reference)
router.get('/sms/transaction-by-ref/:ref', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM sms_transactions
       WHERE description LIKE $1 AND user_id=$2
       ORDER BY created_at DESC LIMIT 1`,
      [`%${req.params.ref}%`, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
    res.json(rows[0]);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
