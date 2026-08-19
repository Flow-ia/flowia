// routes/stripe-payout.js — POST /api/stripe/payout/create
//
// "Reverser maintenant" : declenche le release immediat des escrows
// appointment_payouts ELIGIBLES (status='pending' AND release_at <= NOW())
// du merchant. Reutilise exactement le code du cron releasePayouts (filtre
// userId) pour garantir un seul chemin de paiement.
//
// IMPORTANT : ce bouton ne lit PLUS le solde Stripe brut. Avant le patch,
// il appelait stripe.payouts.create(amount=balance.available) ce qui vidait
// AUSSI les fonds des RDV futurs encore annulables. Si le client annulait
// ensuite, FlowIA devait refunder alors que le merchant avait deja recu
// l'argent -> dette impossible a recuperer. Desormais le bouton ne peut
// reverser QUE les escrows dont le release_at est passe.

const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { invalidateUserStatsCache } = require('../utils/paymentV3');
const { releasePayouts } = require('../utils/releasePayouts');

const router = express.Router();
router.use(authMiddleware);

router.post('/create', async (req, res) => {
  const userId = req.user.userId;
  try {
    // 1. Resoudre stripe_account_id du commercant (verif basique avant tout).
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

    // 2. Verifier qu'aucun payout n'est deja en cours pour ce user
    //    (anti-double-clic, ne bloque pas le cron qui passe par
    //     releasePayouts directement sans table payouts).
    const { rows: pendingRows } = await pool.query(
      `SELECT id, stripe_payout_id FROM payouts
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

    // 3. Pre-check : a-t-on au moins une row escrow ELIGIBLE pour ce user ?
    //    Critere strict identique a releasePayouts (status, release_at,
    //    retry_count) pour eviter tout decalage. On expose au passage le
    //    total eligible et la prochaine date pour le message d'erreur.
    const { rows: eligibleRows } = await pool.query(`
      SELECT COUNT(*)::int                        AS count,
             COALESCE(SUM(amount_cents), 0)::bigint AS total_cents
        FROM appointment_payouts
       WHERE user_id = $1
         AND status = 'pending'
         AND release_at <= NOW()
         AND retry_count < 5
    `, [userId]);
    const eligibleCount = eligibleRows[0]?.count || 0;
    const eligibleCents = parseInt(eligibleRows[0]?.total_cents || 0, 10);

    if (eligibleCount === 0) {
      // Cherche la prochaine date d'eligibilite pour expliciter le message.
      const { rows: nextRows } = await pool.query(`
        SELECT release_at
          FROM appointment_payouts
         WHERE user_id = $1
           AND status = 'pending'
           AND release_at > NOW()
         ORDER BY release_at ASC
         LIMIT 1
      `, [userId]);
      const nextReleaseAt = nextRows[0]?.release_at || null;
      return res.status(400).json({
        error: nextReleaseAt
          ? "Aucun reversement éligible pour le moment. Les fonds des RDV à venir seront disponibles après la date du RDV + 3 jours."
          : "Aucun reversement éligible pour le moment. Vos paiements en ligne seront automatiquement reversés 3 jours après chaque RDV.",
        code: 'NO_ELIGIBLE_PAYOUTS',
        next_release_at: nextReleaseAt,
      });
    }

    // 4. Best-effort : recuperer les coordonnees bancaires pour le toast UI.
    //    Optionnel : aucun impact bloquant. La table payouts est UPSERT
    //    par le webhook payout.paid avec les vraies infos.
    let bankLast4 = null;
    let bankName  = null;
    try {
      const key = process.env.STRIPE_SECRET_KEY;
      if (key) {
        const stripe = require('stripe')(key);
        const ext = await stripe.accounts.listExternalAccounts(accountId, {
          object: 'bank_account',
          limit: 1,
        });
        if (ext.data?.length) {
          bankLast4 = ext.data[0].last4 || null;
          bankName  = ext.data[0].bank_name || null;
        }
      }
    } catch (extErr) {
      console.warn('[PAYOUT CREATE] external_accounts fail (non bloquant):', extErr.message);
    }

    // 5. Delegue le release a releasePayouts(pool, { userId }) : 1 payout
    //    Stripe par escrow eligible (avec idempotencyKey stable). Identique
    //    au cron quotidien, simplement filtre sur ce user. Les rows seront
    //    inserees dans la table `payouts` par le webhook payout.paid (UPSERT,
    //    triggered_by='stripe') -> historique UI cohérent avec le cron.
    let summary;
    try {
      summary = await releasePayouts(pool, { userId });
    } catch (relErr) {
      console.error('[PAYOUT CREATE] releasePayouts threw user=' + userId, relErr.message);
      return res.status(500).json({
        error: 'Erreur serveur lors du reversement.',
        code: 'INTERNAL_ERROR',
      });
    }

    const succeeded = summary?.succeeded || 0;
    const failed    = summary?.failed    || 0;
    const processed = summary?.processed || 0;

    if (succeeded === 0 && failed > 0) {
      // Tous les escrows ont echoue (balance Stripe insuffisante, compte
      // deconnecte, etc.). Le retry_count a deja ete incremente dans
      // releasePayouts pour chaque row.
      console.error('[PAYOUT CREATE] all releases failed user=' + userId
        + ' processed=' + processed + ' failed=' + failed);
      return res.status(502).json({
        error: "Le reversement a échoué côté Stripe (solde insuffisant ou compte inactif). Réessayez plus tard.",
        code: 'STRIPE_RELEASE_FAILED',
        eligible_count: eligibleCount,
        eligible_cents: eligibleCents,
        processed, succeeded, failed,
      });
    }

    if (processed === 0 && succeeded === 0) {
      // Race avec le cron : le pre-check a vu des eligibles mais le tick
      // releasePayouts est passe entre temps et a tout traite. Pas une erreur.
      console.log('[PAYOUT CREATE] race with cron, nothing left user=' + userId);
      return res.status(200).json({
        success: true,
        processed: 0, succeeded: 0, failed: 0,
        eligible_count: 0,
        released_cents: 0,
        message: "Vos reversements éligibles viennent d'être traités par le système. Votre solde sera mis à jour dans quelques secondes.",
      });
    }

    // Invalide le cache stats (le solde / eligible / historique vont bouger)
    try { invalidateUserStatsCache(userId); } catch {}

    console.log('[PAYOUT CREATE] success user=' + userId
      + ' processed=' + processed + ' ok=' + succeeded + ' fail=' + failed
      + ' eligible_cents=' + eligibleCents);

    // Le total reverse correspond aux escrows reellement passes a 'released'.
    // On le recalcule pour la reponse (eligibleCents inclut potentiellement
    // les rows qui ont fail / partial). Lecture directe DB pour fiabilite.
    const { rows: releasedRows } = await pool.query(`
      SELECT COALESCE(SUM(amount_cents), 0)::bigint AS released_cents
        FROM appointment_payouts
       WHERE user_id = $1
         AND status = 'released'
         AND released_at >= NOW() - INTERVAL '5 minutes'
    `, [userId]);
    const releasedCents = parseInt(releasedRows[0]?.released_cents || 0, 10);

    return res.json({
      success: true,
      processed,
      succeeded,
      failed,
      eligible_count:     eligibleCount,
      released_cents:     releasedCents,
      bank_account_last4: bankLast4,
      bank_name:          bankName,
      message: failed > 0
        ? `${succeeded} reversement(s) initié(s) (${(releasedCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DA). ${failed} échec(s), retry automatique.`
        : `${succeeded} reversement(s) initié(s) pour un total de ${(releasedCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DA. Arrivée bancaire sous 1-3 jours ouvrés.`,
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
