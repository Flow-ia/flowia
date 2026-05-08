// utils/releasePayouts.js — cron quotidien de liberation des payouts
// commerçants. Selectionne les rows appointment_payouts dues (release_at
// <= NOW(), status='pending') et declenche stripe.payouts.create sur le
// compte Connect du commerçant.
//
// Lance via index.js startCron() avec scheduleLocked (worker 1, lock
// applicatif Postgres pour eviter les ticks paralleles inter-instances).
// Frequence : 1x/jour suffit (les payouts ne sont pas urgents au minute
// pres). Premier tick au boot puis toutes les 24h.
//
// Mode degrade : si un payout Stripe echoue (compte deconnecte, fonds
// insuffisants, holds Stripe), on incremente retry_count et on reessaye
// au prochain tick. Apres 5 echecs, status='failed' et l'admin doit
// intervenir (UI a venir + alerte email/slack).

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY non configuree');
  return require('stripe')(key);
}

const MAX_RETRIES = 5;
const BATCH_SIZE  = 50; // pour ne pas saturer Stripe en cas de gros backlog

async function releasePayouts(pool) {
  // Selectionne les payouts dus, en batch limite, le plus ancien d'abord.
  // Filtre status='pending' AND release_at <= NOW() AND retry_count < MAX.
  const { rows: due } = await pool.query(`
    SELECT id, user_id, stripe_account_id, payment_intent_id, amount_cents,
           retry_count, appointment_id
      FROM appointment_payouts
     WHERE status = 'pending'
       AND release_at <= NOW()
       AND retry_count < $1
     ORDER BY release_at ASC
     LIMIT $2
  `, [MAX_RETRIES, BATCH_SIZE]);

  if (!due.length) {
    console.log('[releasePayouts] no payouts due');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  console.log(`[releasePayouts] processing ${due.length} due payouts`);
  let stripe;
  try { stripe = getStripe(); } catch (e) {
    console.error('[releasePayouts] no Stripe key', e.message);
    return { processed: 0, succeeded: 0, failed: 0, error: 'no_stripe' };
  }

  let succeeded = 0, failed = 0;
  for (const row of due) {
    try {
      // stripe.payouts.create avec stripeAccount header -> agit pour le
      // commerçant. amount = amount_cents (le montant net qui est sur le
      // balance Connect — application_fee deja preleve cote plateforme).
      const payout = await stripe.payouts.create(
        {
          amount: row.amount_cents,
          currency: 'eur',
          metadata: {
            appointment_id: row.appointment_id,
            payout_row_id: row.id,
            source: 'flowia_escrow_release',
          },
          // statement_descriptor pour reconnaissance sur le releve bancaire
          // du commerçant (4-22 chars, lettres/espace).
          statement_descriptor: 'FlowIA RDV',
        },
        { stripeAccount: row.stripe_account_id }
      );

      await pool.query(`
        UPDATE appointment_payouts
           SET status = 'released',
               released_at = NOW(),
               stripe_payout_id = $2,
               updated_at = NOW()
         WHERE id = $1
      `, [row.id, payout.id]);
      succeeded++;
      console.log(`[releasePayouts] released ${row.id} -> Stripe payout ${payout.id} (${row.amount_cents}c)`);
    } catch (e) {
      const msg = e.message || String(e);
      failed++;
      const newRetry = (row.retry_count || 0) + 1;
      const newStatus = newRetry >= MAX_RETRIES ? 'failed' : 'pending';
      await pool.query(`
        UPDATE appointment_payouts
           SET retry_count = $2,
               stripe_error_message = $3,
               status = $4,
               updated_at = NOW()
         WHERE id = $1
      `, [row.id, newRetry, msg, newStatus]);
      console.error(`[releasePayouts] FAIL ${row.id} retry=${newRetry}/${MAX_RETRIES}`, msg);
    }
  }
  console.log(`[releasePayouts] done : ${succeeded} ok, ${failed} fail`);
  return { processed: due.length, succeeded, failed };
}

module.exports = { releasePayouts };
