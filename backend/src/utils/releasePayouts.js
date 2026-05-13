// utils/releasePayouts.js — cron horaire de liberation des payouts
// commerçants. Selectionne les rows appointment_payouts dues (release_at
// <= NOW(), status='pending') et declenche stripe.payouts.create sur le
// compte Connect du commerçant.
//
// Lance via index.js startCron() avec scheduleLocked + initialDelayMs=60s
// pour garantir un 1er tick post-boot meme si Render redemarre frequemment
// (free tier hibernation). Frequence 1h : un payout dont release_at vient
// de passer ne doit pas attendre 24h. Lock applicatif Postgres
// (pg_try_advisory_lock) empeche les ticks paralleles inter-instances.
//
// Mode degrade : si un payout Stripe echoue (compte deconnecte, fonds
// insuffisants, holds Stripe), on incremente retry_count et on reessaye
// au prochain tick. Apres 5 echecs, status='failed' et l'admin doit
// intervenir (UI a venir + alerte email/slack).
//
// Stuck detector : a chaque tick, on log un WARN si des rows pending
// trainent > 6h apres leur release_at sans avoir atteint MAX_RETRIES.
// Cela permet de detecter precocement : (a) un cron qui ne tourne plus,
// (b) des balance_insufficient repetes, (c) un compte Stripe deconnecte.

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY non configuree');
  return require('stripe')(key);
}

const MAX_RETRIES = 5;
const BATCH_SIZE  = 50; // pour ne pas saturer Stripe en cas de gros backlog

async function releasePayouts(pool, opts = {}) {
  // opts.userId : si fourni, ne libere que les escrows de ce merchant.
  // Utilise par POST /api/stripe/payout/create ("Reverser maintenant") pour
  // garantir qu'un clic merchant ne libere QUE ses propres escrows eligibles,
  // jamais le solde Stripe brut (qui pourrait contenir des RDV futurs non
  // encore eligibles -> risque de payer le merchant avant la date du RDV,
  // refund client devient une dette merchant impossible a recuperer).
  const userId = opts.userId || null;

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
  const params = [MAX_RETRIES, BATCH_SIZE];
  let userFilter = '';
  if (userId) {
    params.push(userId);
    userFilter = ` AND user_id = $${params.length}`;
  }
  const { rows: due } = await pool.query(`
    SELECT id, user_id, stripe_account_id, payment_intent_id, amount_cents,
           retry_count, appointment_id, release_at
      FROM appointment_payouts
     WHERE status = 'pending'
       AND release_at <= NOW()
       AND retry_count < $1${userFilter}
     ORDER BY release_at ASC
     LIMIT $2
  `, params);

  // Stuck detector : log un WARN pour les rows qui trainent > 6h apres
  // leur release_at. Bornee aux scans complets (sans userId) pour eviter
  // de spammer sur les clics manuels du bouton "Reverser maintenant".
  if (!userId) {
    try {
      const { rows: stuck } = await pool.query(`
        SELECT COUNT(*)::int                AS n,
               MIN(release_at)              AS oldest,
               MAX(retry_count)             AS max_retry
          FROM appointment_payouts
         WHERE status = 'pending'
           AND release_at <= NOW() - INTERVAL '6 hours'
           AND retry_count < $1
      `, [MAX_RETRIES]);
      const s = stuck[0] || {};
      if ((s.n || 0) > 0) {
        console.warn(`[CRON payouts] STUCK: ${s.n} pending payouts > 6h overdue (oldest release_at=${s.oldest?.toISOString?.() || s.oldest}, max_retry=${s.max_retry}). Investiguer : cron tourne ? balance Stripe ? compte deconnecte ?`);
      }
    } catch (e) {
      console.warn('[CRON payouts] stuck detector query fail:', e.message);
    }
  }

  if (!due.length) {
    console.log('[CRON payouts] no payouts due');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  console.log(`[CRON payouts] processing ${due.length} due payouts (userId=${userId || 'ALL'})`);
  let stripe;
  try { stripe = getStripe(); } catch (e) {
    console.error('[CRON payouts] no Stripe key', e.message);
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
      console.log(`[CRON payouts] released id=${row.id} appt=${row.appointment_id} stripe_payout=${payout.id} amount=${row.amount_cents}c account=${row.stripe_account_id}`);

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
        console.error('[CRON payouts] ledger payout_release fail id=' + row.id,
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
      console.error(`[CRON payouts] FAIL id=${row.id} appt=${row.appointment_id} retry=${newRetry}/${MAX_RETRIES} status=${newStatus} stripe_code=${code} msg=${msg}`);
    }
  }
  console.log(`[CRON payouts] done : ${succeeded} ok, ${failed} fail (claimed ${due.length})`);
  return { processed: due.length, succeeded, failed };
}

module.exports = { releasePayouts };
