// routes/payments.js — Paiements recharge SMS via SumUp
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

const SMS_COST   = parseFloat(process.env.SMS_COST_UNIT)     || 0.045;
const SMS_MARGIN = parseFloat(process.env.SMS_MARGIN_PERCENT) || 30;
const SMS_PRICE  = parseFloat((SMS_COST * (1 + SMS_MARGIN / 100)).toFixed(4));
const BACKEND_URL  = process.env.BACKEND_URL || 'https://flowia-backend.onrender.com';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();

// ── POST /api/payments/sms/checkout ─────────────────────────────────────────
router.post('/sms/checkout', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount < 5) return res.status(400).json({ error: 'Montant minimum 5€.' });

    const userId = req.user.userId;
    const reference = `sms_${userId}_${Date.now()}`;

    const checkoutRes = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUMUP_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        checkout_reference: reference,
        amount: numAmount,
        currency: 'EUR',
        description: `Recharge SMS FlowIA - ${numAmount}€`,
        return_url: `${BACKEND_URL}/api/payments/sms/webhook`,
        redirect_url: `${FRONTEND_URL}/settings/sms?recharge=success&checkout_id=CHECKOUT_ID`,
      }),
      signal: AbortSignal.timeout(5000),
    });

    const checkout = await checkoutRes.json();
    if (!checkoutRes.ok) {
      console.error('[SUMUP checkout]', checkout);
      return res.status(500).json({ error: 'Erreur creation checkout SumUp.' });
    }

    // Enregistrer la transaction en attente
    await pool.query(
      `INSERT INTO sms_transactions (user_id, type, amount, description, sumup_checkout_id, status)
       VALUES ($1,'credit',$2,$3,$4,'pending')`,
      [userId, numAmount, `Recharge SMS - ${numAmount}€`, checkout.id]
    );

    // Mettre à jour l'URL de redirection avec le vrai checkout_id
    const redirectUrl = `${FRONTEND_URL}/settings/sms?recharge=success&checkout_id=${checkout.id}`;

    res.json({ checkout_url: checkout.checkout_url || redirectUrl, checkout_id: checkout.id });
  } catch (err) {
    console.error('[PAYMENTS checkout]', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/payments/sms/webhook ──────────────────────────────────────────
// SumUp envoie un POST quand le statut du checkout change
router.post('/sms/webhook', async (req, res) => {
  try {
    const { event_type, id } = req.body;

    // Toujours retourner 200 pour éviter les retries SumUp
    res.status(200).json({});

    if (!id) return;

    // Vérifier le statut en appelant l'API SumUp
    const checkRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${id}`, {
      headers: { 'Authorization': `Bearer ${process.env.SUMUP_SECRET_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    const checkout = await checkRes.json();

    if (checkout.status !== 'PAID') return;

    // Extraire user_id depuis checkout_reference (format: sms_USERID_TIMESTAMP)
    const parts = checkout.checkout_reference?.split('_');
    if (!parts || parts.length < 3 || parts[0] !== 'sms') return;
    const userId = parts[1];

    // Vérifier pas de doublon
    const { rows: existing } = await pool.query(
      `SELECT id FROM sms_transactions WHERE sumup_checkout_id=$1 AND status='completed'`,
      [id]
    );
    if (existing.length) return;

    const amount = parseFloat(checkout.amount);

    // Créditer le solde SMS
    await pool.query(`UPDATE users SET sms_balance = sms_balance + $2 WHERE id=$1`, [userId, amount]);
    await pool.query(
      `UPDATE sms_transactions SET status='completed' WHERE sumup_checkout_id=$1`,
      [id]
    );

    console.log(`[WEBHOOK] SMS recharge ${amount}€ creditee pour user ${userId}`);
  } catch (err) {
    console.error('[WEBHOOK sms]', err.message);
  }
});

// ── GET /api/payments/sms/verify/:checkout_id ───────────────────────────────
// Vérification manuelle (fallback si webhook échoue)
router.get('/sms/verify/:checkout_id', authMiddleware, async (req, res) => {
  try {
    const { checkout_id } = req.params;

    // Vérifier le statut via l'API SumUp
    const checkRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkout_id}`, {
      headers: { 'Authorization': `Bearer ${process.env.SUMUP_SECRET_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    const checkout = await checkRes.json();

    if (checkout.status !== 'PAID') {
      return res.json({ credited: false, status: checkout.status });
    }

    // Vérifier pas déjà crédité
    const { rows: existing } = await pool.query(
      `SELECT id FROM sms_transactions WHERE sumup_checkout_id=$1 AND status='completed'`,
      [checkout_id]
    );
    if (existing.length) {
      const { rows: balRows } = await pool.query(`SELECT sms_balance FROM users WHERE id=$1`, [req.user.userId]);
      return res.json({ credited: false, already_credited: true, new_balance: parseFloat(balRows[0]?.sms_balance || 0) });
    }

    const amount = parseFloat(checkout.amount);

    // Créditer
    await pool.query(`UPDATE users SET sms_balance = sms_balance + $2 WHERE id=$1`, [req.user.userId, amount]);
    await pool.query(`UPDATE sms_transactions SET status='completed' WHERE sumup_checkout_id=$1`, [checkout_id]);

    const { rows: balRows } = await pool.query(`SELECT sms_balance FROM users WHERE id=$1`, [req.user.userId]);

    res.json({ credited: true, new_balance: parseFloat(balRows[0]?.sms_balance || 0), amount });
  } catch (err) {
    console.error('[VERIFY sms]', err.message);
    res.status(500).json({ error: 'Erreur verification.' });
  }
});

// ── GET /api/payments/sms/balance ───────────────────────────────────────────
router.get('/sms/balance', authMiddleware, async (req, res) => {
  try {
    // Cache 30s
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
router.get('/sms/transactions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM sms_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[SMS transactions]', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
