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
  // Selectionne les payouts dus. Pas de claim intermediaire (le CHECK
  // constraint status IN ('pending','released','cancelled','failed') ne
  // permet pas d'etat 'processing'). La protection contre les ticks
  // simultanees repose sur 2 couches :
  //   (a) scheduleLocked dans index.js (worker 1, pg_try_advisory_lock)
  //       garantit qu'1 seul cron tourne en meme temps inter-instances.
  //   (b) idempotencyKey sur stripe.payouts.create (ci-dessous) : si un
  //       /release-now admin tape en parallele du cron, Stripe retournera
  //       le meme payout au lieu d'en creer 2. L'UPDATE final est
  //       idempotent (WHERE id = $1).
  // Worst case : 2 appels Stripe API redondants (rate-limit non touche),
  // aucun impact financier.
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
      // idempotencyKey : inclut retry_count ET amount_cents.
      // - retry_count : permet le retry apres echec definitif (admin reset).
      // - amount_cents : permet le retry apres correction du montant. Bug
      //   observe 2026-05-12 : si le sync path inserait amount trop eleve
      //   (manque stripe_fee), un UPDATE rectif laissait l'ancienne clef
      //   verrouillee par Stripe -> StripeIdempotencyError 'same key,
      //   different params'. En l'incluant dans la clef, un changement
      //   d'amount donne une clef differente -> nouvelle tentative propre.
      // Sur retry transient (timeout reseau, meme params) -> Stripe
      // retourne le payout de la 1ere tentative au lieu d'en creer 2.
      const idempotencyKey = `escrow_payout_${row.id}_attempt_${row.retry_count || 0}_amt_${row.amount_cents}`;
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
        { stripeAccount: row.stripe_account_id, idempotencyKey }
      );

      await pool.query(`
        UPDATE appointment_payouts
           SET status = 'released',
               released_at = NOW(),
               stripe_payout_id = $2,
               stripe_error_message = NULL,
               updated_at = NOW()
         WHERE id = $1
      `, [row.id, payout.id]);
      succeeded++;
      console.log(`[releasePayouts] released id=${row.id} appt=${row.appointment_id} stripe_payout=${payout.id} amount=${row.amount_cents}c account=${row.stripe_account_id}`);

      // PHASE 2 LEDGER : INSERT payout_release (informationnel) +
      // UPDATE status='locked' sur les entries payment/commission/stripe_fee
      // de ce RDV (en cours de virement Stripe). UNIQUE INDEX
      // uq_ledger_payout_entry garantit idempotence si appel retry.
      try {
        const { recordLedgerEntry, updateLedgerStatusForPayout } = require('./ledger');
        await recordLedgerEntry(pool, {
          userId: row.user_id,
          appointmentId: row.appointment_id,
          appointmentPayoutId: row.id,
          entryType: 'payout_release',
          amountCents: row.amount_cents,
          status: 'locked',
          stripePaymentIntentId: row.payment_intent_id,
          stripePayoutId: payout.id,
          metadata: { stripe_account_id: row.stripe_account_id, retry: row.retry_count || 0 },
        });
        await updateLedgerStatusForPayout(pool, {
          appointmentId: row.appointment_id,
          stripePayoutId: payout.id,
          newStatus: 'locked',
        });
      } catch (ledgerErr) {
        console.error('[releasePayouts] ledger payout_release fail id=' + row.id,
          ledgerErr.message || ledgerErr);
      }
    } catch (e) {
      const msg = e.message || String(e);
      const code = e.code || e.type || 'unknown';
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
      console.error(`[releasePayouts] FAIL id=${row.id} appt=${row.appointment_id} retry=${newRetry}/${MAX_RETRIES} status=${newStatus} stripe_code=${code} msg=${msg}`);
    }
  }
  console.log(`[releasePayouts] done : ${succeeded} ok, ${failed} fail (claimed ${due.length})`);
  return { processed: due.length, succeeded, failed };
}

module.exports = { releasePayouts };
