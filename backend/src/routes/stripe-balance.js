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
        eligible_now_cents:       0,
        eligible_now_count:       0,
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

    // 2) Estimation prochain payout = prochain release_at futur dans
    // appointment_payouts (status='pending'). Le montant est la somme
    // des escrows qui se libereront a cette meme date calendaire.
    //
    // Pourquoi pas l'historique payouts : 2 payouts manuels lances le
    // meme jour donnent un avgGapMs ≈ 0 -> "tous les 0 jours" et date
    // = aujourd'hui (bug observe 2026-05-12). Et l'historique ne
    // predit pas le prochain payout : c'est le cron releasePayouts
    // qui declenche selon release_at, donc on lit la source amont.
    const { rows: nextRows } = await pool.query(`
      SELECT
        release_at::date                       AS next_date,
        COALESCE(SUM(amount_cents), 0)::bigint AS amount_cents,
        COUNT(*)::int                          AS count
      FROM appointment_payouts
      WHERE user_id = $1
        AND status = 'pending'
        AND release_at::date >= CURRENT_DATE
      GROUP BY release_at::date
      ORDER BY release_at::date ASC
      LIMIT 1
    `, [userId]);

    let nextPayoutEstimate = null;
    if (nextRows.length) {
      const r = nextRows[0];
      nextPayoutEstimate = {
        estimated_date:             r.next_date instanceof Date
                                      ? r.next_date.toISOString().substring(0, 10)
                                      : String(r.next_date).substring(0, 10),
        estimated_amount_cents:     parseInt(r.amount_cents || 0, 10),
        count:                      r.count || 0,
        // Champ conserve pour back-compat front mais toujours null : la
        // cadence "tous les N jours" n'a pas de sens quand on lit
        // release_at (le cron tourne tous les jours et release ce qui
        // est du). Le front masque la ligne quand c'est null.
        based_on_avg_interval_days: null,
      };
    } else if (available > 0) {
      // Pas d'escrow futur mais du solde disponible : on propose un
      // payout manuel aujourd'hui pour le solde actuel.
      nextPayoutEstimate = {
        estimated_date:             new Date().toISOString().substring(0, 10),
        estimated_amount_cents:     available,
        count:                      0,
        based_on_avg_interval_days: null,
      };
    }

    // 3) Montant ELIGIBLE au reversement manuel maintenant. C'est cette valeur
    // que le bouton "Reverser maintenant" doit afficher / payer, PAS le solde
    // Stripe brut (qui inclurait des RDV futurs encore annulables -> risque
    // de payer trop tot). Critere strict identique a releasePayouts.
    let eligibleNowCents = 0;
    let eligibleNowCount = 0;
    try {
      const { rows: er } = await pool.query(`
        SELECT COUNT(*)::int                          AS count,
               COALESCE(SUM(amount_cents), 0)::bigint AS total_cents
          FROM appointment_payouts
         WHERE user_id = $1
           AND status = 'pending'
           AND release_at <= NOW()
           AND retry_count < 5
      `, [userId]);
      eligibleNowCount = er[0]?.count || 0;
      eligibleNowCents = parseInt(er[0]?.total_cents || 0, 10);
    } catch (er) {
      console.warn('[GET /api/stripe/balance] eligible_now query fail:', er.message);
    }

    res.json({
      connected:                true,
      available_cents:          available,
      eligible_now_cents:       eligibleNowCents,
      eligible_now_count:       eligibleNowCount,
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
