// routes/stripe-balance.js — GET /api/stripe/balance (Refonte v3, Commit 2)
//
// Solde Stripe Connect du commercant + estimation du prochain payout depuis
// les 5 derniers payouts completes (table payouts v3, pas appointment_payouts).
//
// Distincte de la legacy /api/stripe-connect/balance qui retourne uniquement
// {available_cents, pending_cents, currency} pour le widget /reglages/paiements.
// Cette route v3 enrichit avec : in_transit_cents, total_to_receive_cents,
// bank_account info et next_payout_estimate. Sert au hero card de l'onglet
// Reversements (Commit 4) et au bouton "Reverser maintenant" (Commit 5).

const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  return require('stripe')(key);
}

router.get('/balance', async (req, res) => {
  try {
    const userId = req.user.userId;

    const { rows: userRows } = await pool.query(
      `SELECT stripe_account_id FROM users WHERE id = $1`,
      [userId]
    );
    if (!userRows.length) {
      return res.status(404).json({ error: 'User introuvable' });
    }
    const accountId = userRows[0].stripe_account_id;

    if (!accountId) {
      return res.json({
        connected:                false,
        available_cents:          0,
        in_transit_cents:         0,
        pending_cents:            0,
        total_to_receive_cents:   0,
        bank_account:             null,
        payout_mode:              'manual',
        next_payout_estimate:     null,
      });
    }

    // 1) Balance live Stripe (best-effort, non bloquant si fail)
    let available = 0, inTransit = 0, pending = 0;
    let bankAccount = null;
    try {
      const stripe = getStripe();
      // 2-arg form obligatoire : 1er = params (vide ici), 2e = options
      // (stripeAccount). Le 1-arg form { stripeAccount: ... } n'est plus
      // auto-detecte par les versions recentes du SDK Stripe et envoie
      // 'stripeAccount' comme parametre de requete -> Stripe rejette avec
      // "Received unknown parameter: stripeAccount".
      const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
      const sumEur = arr => (arr || [])
        .filter(b => (b.currency || '').toLowerCase() === 'eur')
        .reduce((s, b) => s + (b.amount || 0), 0);
      available = sumEur(balance.available);
      // balance.in_transit : fonds payouts emis mais pas encore arrives a la
      // banque (entre le moment ou Stripe initie le virement et l'arrivee).
      // Defaut 0 pour les comptes manual payout sans payout en cours.
      inTransit = sumEur(balance.in_transit);
      pending   = sumEur(balance.pending);

      // Best-effort : recupere le 1er external_account (compte bancaire) pour
      // afficher last4 + bank_name dans l'UI.
      try {
        const ext = await stripe.accounts.listExternalAccounts(accountId, {
          object: 'bank_account',
          limit: 1,
        });
        if (ext.data?.length) {
          bankAccount = {
            last4:     ext.data[0].last4 || null,
            bank_name: ext.data[0].bank_name || null,
          };
        }
      } catch (extErr) {
        // Pas critique, l'UI affichera juste "Compte bancaire Stripe"
        console.warn('[GET /api/stripe/balance] external_accounts fail:', extErr.message);
      }
    } catch (apiErr) {
      console.warn('[GET /api/stripe/balance] Stripe balance fail:', apiErr.message);
      // On continue avec available=0 etc. pour ne pas casser le dashboard.
    }

    // 2) Estimation prochain payout depuis les 5 derniers completes
    // (intervalle moyen entre payouts en jours).
    const { rows: lastPayouts } = await pool.query(`
      SELECT requested_at, completed_at, amount_cents
      FROM payouts
      WHERE user_id = $1
        AND status = 'paid'
        AND completed_at IS NOT NULL
      ORDER BY requested_at DESC
      LIMIT 5
    `, [userId]);

    let nextPayoutEstimate = null;
    if (lastPayouts.length >= 2) {
      const dates = lastPayouts.map(p => new Date(p.requested_at).getTime()).sort((a, b) => b - a);
      let totalGapMs = 0;
      for (let i = 0; i < dates.length - 1; i++) totalGapMs += dates[i] - dates[i + 1];
      const avgGapMs   = totalGapMs / (dates.length - 1);
      const avgGapDays = Math.round(avgGapMs / 86400000);
      const lastReq    = new Date(dates[0]);
      const nextEta    = new Date(lastReq.getTime() + avgGapMs);
      const avgAmount  = Math.round(
        lastPayouts.reduce((s, p) => s + parseInt(p.amount_cents || 0, 10), 0) / lastPayouts.length
      );
      nextPayoutEstimate = {
        estimated_date:               nextEta.toISOString().substring(0, 10),
        estimated_amount_cents:       avgAmount,
        based_on_avg_interval_days:   avgGapDays,
      };
    } else if (available > 0) {
      // Pas d'historique : si du available_cents existe, estime pour aujourd'hui
      nextPayoutEstimate = {
        estimated_date:               new Date().toISOString().substring(0, 10),
        estimated_amount_cents:       available,
        based_on_avg_interval_days:   null,
      };
    }

    res.json({
      connected:                true,
      available_cents:          available,
      in_transit_cents:         inTransit,
      pending_cents:            pending,
      total_to_receive_cents:   available + inTransit + pending,
      bank_account:             bankAccount,
      payout_mode:              'manual',
      next_payout_estimate:     nextPayoutEstimate,
    });
  } catch (e) {
    console.error('[GET /api/stripe/balance ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur balance' });
  }
});

module.exports = router;
