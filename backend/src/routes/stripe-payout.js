// routes/stripe-payout.js — POST /api/stripe/payout/create (Refonte v3, Commit 5)
//
// Declenche un payout MANUEL Stripe vers le compte bancaire du commercant.
// Utilise par les boutons "Reverser maintenant" sur Dashboard + Statistiques
// (onglets Performance + Reversements).
//
// Architecture FlowIA = direct charges : Stripe Connect Standard avec PI
// crees sur le compte connecte. Donc stripe.payouts.create() doit passer
// { stripeAccount: user.stripe_account_id } en 2e arg options.
//
// Anti-double-soumission : verifie qu'aucun payout 'pending'/'in_transit'
// n'existe deja pour ce user avant de creer.

const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { invalidateUserStatsCache } = require('../utils/paymentV3');

const router = express.Router();
router.use(authMiddleware);

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  return require('stripe')(key);
}

router.post('/create', async (req, res) => {
  const userId = req.user.userId;
  const employeeId = req.user.employee_id || null;
  try {
    // 1. Resoudre stripe_account_id du commercant
    const { rows: userRows } = await pool.query(
      'SELECT stripe_account_id FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    const accountId = userRows[0]?.stripe_account_id;
    if (!accountId) {
      return res.status(400).json({
        error: 'Compte Stripe non connecté.',
        code: 'NO_STRIPE_ACCOUNT',
      });
    }

    // 2. Verifier qu'aucun payout n'est deja en cours
    const { rows: pendingRows } = await pool.query(
      `SELECT id, stripe_payout_id, requested_at FROM payouts
        WHERE user_id = $1
          AND status IN ('pending', 'in_transit')
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId]
    );
    if (pendingRows.length) {
      return res.status(409).json({
        error: "Un reversement est déjà en cours, attendez son traitement.",
        code: 'ALREADY_IN_PROGRESS',
        existing_payout_id: pendingRows[0].stripe_payout_id,
      });
    }

    // 3. Recuperer la balance Stripe live
    const stripe = getStripe();
    let balance;
    try {
      balance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
    } catch (balErr) {
      console.error('[PAYOUT CREATE] balance retrieve fail user=' + userId, balErr.message);
      return res.status(502).json({
        error: 'Erreur Stripe : impossible de récupérer le solde.',
        code: 'STRIPE_BALANCE_ERROR',
      });
    }

    // Stripe peut retourner plusieurs devises. On prend EUR.
    const eurAvailable = (balance.available || []).find(b => (b.currency || '').toLowerCase() === 'eur');
    const availableCents = eurAvailable?.amount || 0;

    if (availableCents <= 0) {
      console.log('[PAYOUT CREATE] insufficient balance user=' + userId + ' available=' + availableCents);
      return res.status(400).json({
        error: "Aucun solde disponible. Vos paiements seront disponibles dans 3 jours après chaque RDV.",
        code: 'INSUFFICIENT_BALANCE',
        available_cents: availableCents,
      });
    }

    // 4. Recuperer les coordonnees bancaires (best-effort, non bloquant)
    let bankLast4 = null;
    let bankName  = null;
    try {
      const ext = await stripe.accounts.listExternalAccounts(accountId, {
        object: 'bank_account',
        limit: 1,
      });
      if (ext.data?.length) {
        bankLast4 = ext.data[0].last4 || null;
        bankName  = ext.data[0].bank_name || null;
      }
    } catch (extErr) {
      console.warn('[PAYOUT CREATE] external_accounts fail (non bloquant):', extErr.message);
    }

    // 5. Creer le payout Stripe
    const currency = (eurAvailable.currency || 'eur').toLowerCase();
    let payout;
    try {
      payout = await stripe.payouts.create(
        {
          amount: availableCents,
          currency,
          metadata: {
            flowia_user_id: userId,
            triggered_by_employee_id: employeeId || '',
            triggered_at: new Date().toISOString(),
          },
        },
        { stripeAccount: accountId }
      );
    } catch (stripeErr) {
      console.error('[PAYOUT CREATE] stripe.payouts.create fail user=' + userId, stripeErr.type, stripeErr.message);
      const sType = stripeErr.type || stripeErr.code || '';
      if (sType === 'StripeAuthenticationError') {
        return res.status(502).json({ error: 'Erreur Stripe : authentification.', code: 'STRIPE_AUTH_ERROR' });
      }
      if (sType === 'StripeInvalidRequestError') {
        return res.status(400).json({ error: stripeErr.message || 'Requête invalide.', code: 'STRIPE_INVALID_REQUEST' });
      }
      if (sType === 'StripePermissionError') {
        return res.status(403).json({ error: 'Compte Stripe sans permission de payout.', code: 'STRIPE_PERMISSION_ERROR' });
      }
      return res.status(500).json({ error: 'Erreur Stripe inattendue.', code: 'STRIPE_UNKNOWN' });
    }

    // 6. INSERT dans la table payouts (table v3, distincte d'appointment_payouts)
    // arrival_date (Stripe = epoch seconds) -> DATE
    const arrivalDate = payout.arrival_date
      ? new Date(payout.arrival_date * 1000).toISOString().substring(0, 10)
      : null;

    await pool.query(
      `INSERT INTO payouts
         (user_id, stripe_payout_id, amount_cents, currency, status,
          bank_account_last4, bank_name, triggered_by, triggered_by_employee_id,
          requested_at, arrival_date)
       VALUES ($1, $2, $3, $4, $5,
               $6, $7, $8, $9,
               NOW(), $10::date)
       ON CONFLICT (stripe_payout_id) DO NOTHING`,
      [
        userId,
        payout.id,
        payout.amount || availableCents,
        currency,
        payout.status || 'pending',
        bankLast4,
        bankName,
        'manual',
        employeeId,
        arrivalDate,
      ]
    );

    // 7. Invalider le cache stats (le solde doit passer a 0 dans /stats/payouts
    // et la nouvelle row doit apparaitre dans l'historique)
    try { invalidateUserStatsCache(userId); } catch {}

    console.log('[PAYOUT CREATE] success user=' + userId + ' employee=' + employeeId + ' payout=' + payout.id + ' amount=' + payout.amount);

    return res.json({
      success: true,
      payout: {
        id:                  payout.id,
        amount_cents:        payout.amount || availableCents,
        currency,
        status:              payout.status,
        arrival_date:        arrivalDate,
        bank_account_last4:  bankLast4,
        bank_name:           bankName,
      },
      message: `Reversement de ${(availableCents / 100).toFixed(2).replace('.', ',')} € initié.`
             + (arrivalDate ? ` Arrivée prévue le ${arrivalDate}.` : ''),
    });
  } catch (e) {
    console.error('[PAYOUT CREATE] unexpected error user=' + userId, e.message);
    return res.status(500).json({
      error: 'Erreur serveur lors du reversement.',
      code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = router;
