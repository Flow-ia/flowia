// loyalty-utils.js — logique métier fidélité partagée
const { pool }             = require('../db');
const { sendLoyaltyReward } = require('./email');

/**
 * Incrémente les tampons d'un client et déclenche la récompense si atteinte.
 * Retourne null si le programme est inactif, sinon { reward_triggered, ... }
 *
 * C-Fidélité — Anti-race : l'INSERT ... ON CONFLICT DO UPDATE incrémente
 * atomiquement, MAIS la lecture du seuil + création du promo FIDEL- + reset
 * ne l'étaient pas avec lui. Deux encaissements concurrents du même client
 * (caisse + RDV en ligne, double-clic) lisaient tous deux stamps >= seuil
 * et généraient CHACUN une récompense + décrémentaient 2× (double cadeau =
 * perte financière). On enveloppe désormais tout dans une transaction avec
 * un advisory lock scopé (user_id, client_email) : les appels concurrents
 * pour le même client sont sérialisés (le 2e voit le compteur déjà reset).
 * Le lock se libère automatiquement au COMMIT/ROLLBACK.
 *
 * source: 'physical' (caisse/prestation) | 'online' (réservation web)
 */
async function incrementStamps(userId, clientEmail, clientName, stampsToAdd = 1, source = 'physical', amountSpent = 0) {
  const client = await pool.connect();
  let result = null;
  let rewardEmailPayload = null;
  try {
    await client.query('BEGIN');
    // Sérialisation par (user_id, email) — hashtext -> int, advisory lock
    // transactionnel (auto-libéré au COMMIT/ROLLBACK). LOWER pour verrouiller
    // indépendamment de la casse.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1::text || ':' || LOWER($2::text)))`,
      [userId, clientEmail]
    );

    const { rows: prog } = await client.query(
      'SELECT * FROM loyalty_programs WHERE user_id=$1 AND enabled=TRUE',
      [userId]
    );
    if (!prog.length) { await client.query('ROLLBACK'); return null; }
    const program = prog[0];

    // Vérifier le déclencheur selon la source
    const trigger = program.count_trigger || 'both';
    if (trigger === 'physical' && source === 'online') {
      await client.query('ROLLBACK');
      return { reward_triggered: false, skipped: true };
    }
    if (trigger === 'online' && source === 'physical') {
      await client.query('ROLLBACK');
      return { reward_triggered: false, skipped: true };
    }

    // Mode points : calculer les points gagnés selon le montant dépensé
    const mode = program.loyalty_mode || 'stamps';
    const pointsPerEuro = parseFloat(program.points_per_euro) || 1;
    const pointsEarned = mode === 'points'
      ? Math.floor(parseFloat(amountSpent || 0) * pointsPerEuro)
      : 0;

    const { rows } = await client.query(
      `INSERT INTO client_loyalty
        (user_id, client_email, client_name, stamps, total_stamps_ever, points, total_points_ever, last_visit)
       VALUES ($1,$2,$3,$4,$4,$5,$5,CURRENT_DATE)
       ON CONFLICT (user_id, client_email) DO UPDATE SET
         stamps            = client_loyalty.stamps + $4,
         total_stamps_ever = client_loyalty.total_stamps_ever + $4,
         points            = client_loyalty.points + $5,
         total_points_ever = client_loyalty.total_points_ever + $5,
         client_name       = COALESCE($3, client_loyalty.client_name),
         last_visit        = CURRENT_DATE,
         updated_at        = NOW()
       RETURNING *`,
      [userId, clientEmail, clientName || null, stampsToAdd, pointsEarned]
    );
    const cl = rows[0];

    // Seuil de récompense selon le mode
    const threshold = mode === 'points'
      ? parseFloat(program.stamps_required) // stamps_required = seuil points en mode points
      : parseInt(program.stamps_required);
    const currentValue = mode === 'points' ? parseFloat(cl.points) : parseInt(cl.stamps);
    const validityDays = parseInt(program.validity_days) || 90;

    if (currentValue >= threshold) {
      const rewardCode = 'FIDEL-' + Math.random().toString(36).substring(2, 8).toUpperCase();

      const minPurch = parseFloat(program.min_purchase) || 0;
      const { rows: pcRows } = await client.query(
        `INSERT INTO promo_codes
          (user_id, code, type, value, max_uses, valid_from, valid_until,
           is_loyalty_reward, owner_client_email, client_loyalty_id, min_purchase)
         VALUES ($1,$2,$3,$4,1,CURRENT_DATE,CURRENT_DATE + ($7 || ' days')::INTERVAL,
                 TRUE,$5,$6,$8)
         ON CONFLICT (user_id, code) DO NOTHING
         RETURNING id`,
        [userId, rewardCode,
         program.reward_type || 'percent', program.reward_value || 10,
         clientEmail, cl.id, validityDays, minPurch]
      );
      const promoCodeId = pcRows[0]?.id;

      // Visibilité caisse (commit caisse-rewards) : on lie aussi le promo
      // fidélité dans client_rewards pour que l'employé le voie dans le bloc
      // « Réductions disponibles pour ce client » de l'étape Paiement.
      // Dans la transaction (atomique avec le promo) : si ce lien échoue, la
      // récompense entière rollback — pas de promo orphelin ni de double.
      if (promoCodeId) {
        await client.query(
          `INSERT INTO client_rewards
             (user_id, client_email, reward_type, status, promo_code_id, expires_at)
           VALUES ($1, LOWER($2), 'loyalty', 'available', $3,
                   CURRENT_DATE + ($4 || ' days')::INTERVAL)`,
          [userId, clientEmail, promoCodeId, validityDays]
        );
      }

      // Réinitialiser selon le mode
      if (mode === 'points') {
        await client.query(
          `UPDATE client_loyalty
             SET points = points - $1, rewards_earned = rewards_earned + 1
           WHERE user_id=$2 AND client_email=$3`,
          [threshold, userId, clientEmail]
        );
      } else {
        await client.query(
          `UPDATE client_loyalty
             SET stamps = stamps - $1, rewards_earned = rewards_earned + 1
           WHERE user_id=$2 AND client_email=$3`,
          [threshold, userId, clientEmail]
        );
      }

      const { rows: biz } = await client.query(
        'SELECT business_name FROM users WHERE id=$1', [userId]);

      // Email préparé ici mais envoyé APRÈS le COMMIT : side-effect non
      // financier (notification), ne doit pas tenir la transaction ouverte
      // ni la faire échouer si Brevo est down.
      rewardEmailPayload = {
        to:             clientEmail,
        clientName:     clientName || 'Cher client',
        businessName:   biz[0]?.business_name || 'Votre salon',
        rewardCode,
        rewardType:     program.reward_type  || 'percent',
        rewardValue:    program.reward_value || 10,
        rewardLabel:    program.reward_label || 'Recompense fidelite',
        stampsRequired: program.stamps_required,
      };

      result = { reward_triggered: true, reward_code: rewardCode, stamps_required: program.stamps_required };
    } else {
      result = { reward_triggered: false, stamps_required: program.stamps_required, stamps_now: cl.stamps };
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  if (rewardEmailPayload) {
    try {
      await sendLoyaltyReward(rewardEmailPayload);
    } catch (mailErr) { console.error('[LOYALTY MAIL ERR]', mailErr.message); }
  }

  return result;
}

module.exports = { incrementStamps };
