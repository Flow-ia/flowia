// loyalty-utils.js — logique métier fidélité partagée
const { pool }             = require('../db');
const { sendLoyaltyReward } = require('./email');

/**
 * Incrémente les tampons d'un client et déclenche la récompense si atteinte.
 * Retourne null si le programme est inactif, sinon { reward_triggered, ... }
 */
/**
 * source: 'physical' (caisse/prestation) | 'online' (réservation web)
 */
async function incrementStamps(userId, clientEmail, clientName, stampsToAdd = 1, source = 'physical', amountSpent = 0) {
  const { rows: prog } = await pool.query(
    'SELECT * FROM loyalty_programs WHERE user_id=$1 AND enabled=TRUE',
    [userId]
  );
  if (!prog.length) return null;
  const program = prog[0];

  // Vérifier le déclencheur selon la source
  const trigger = program.count_trigger || 'both';
  if (trigger === 'physical' && source === 'online') return { reward_triggered: false, skipped: true };
  if (trigger === 'online'   && source === 'physical') return { reward_triggered: false, skipped: true };

  // Mode points : calculer les points gagnés selon le montant dépensé
  const mode = program.loyalty_mode || 'stamps';
  const pointsPerEuro = parseFloat(program.points_per_euro) || 1;
  const pointsEarned = mode === 'points'
    ? Math.floor(parseFloat(amountSpent || 0) * pointsPerEuro)
    : 0;

  const { rows } = await pool.query(
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
    await pool.query(
      `INSERT INTO promo_codes
        (user_id, code, type, value, max_uses, valid_from, valid_until,
         is_loyalty_reward, owner_client_email, client_loyalty_id, min_purchase)
       VALUES ($1,$2,$3,$4,1,CURRENT_DATE,CURRENT_DATE + ($7 || ' days')::INTERVAL,
               TRUE,$5,$6,$8)
       ON CONFLICT (user_id, code) DO NOTHING`,
      [userId, rewardCode,
       program.reward_type || 'percent', program.reward_value || 10,
       clientEmail, cl.id, validityDays, minPurch]
    );

    // Réinitialiser selon le mode
    if (mode === 'points') {
      await pool.query(
        `UPDATE client_loyalty
           SET points = points - $1, rewards_earned = rewards_earned + 1
         WHERE user_id=$2 AND client_email=$3`,
        [threshold, userId, clientEmail]
      );
    } else {
      await pool.query(
        `UPDATE client_loyalty
           SET stamps = stamps - $1, rewards_earned = rewards_earned + 1
         WHERE user_id=$2 AND client_email=$3`,
        [threshold, userId, clientEmail]
      );
    }

    const { rows: biz } = await pool.query(
      'SELECT business_name FROM users WHERE id=$1', [userId]);

    try {
      await sendLoyaltyReward({
        to:             clientEmail,
        clientName:     clientName || 'Cher client',
        businessName:   biz[0]?.business_name || 'Votre salon',
        rewardCode,
        rewardType:     program.reward_type  || 'percent',
        rewardValue:    program.reward_value || 10,
        rewardLabel:    program.reward_label || 'Recompense fidelite',
        stampsRequired: program.stamps_required,
      });
    } catch(mailErr) { console.error('[LOYALTY MAIL ERR]', mailErr.message); }

    return { reward_triggered: true, reward_code: rewardCode, stamps_required: program.stamps_required };
  }

  return { reward_triggered: false, stamps_required: program.stamps_required, stamps_now: cl.stamps };
}

module.exports = { incrementStamps };
