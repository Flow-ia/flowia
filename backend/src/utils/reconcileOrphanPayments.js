// utils/reconcileOrphanPayments.js — cron horaire de reconciliation des
// paiements orphelins (client debite via Stripe, RDV jamais cree).
//
// Source des rows : webhook payment_intent.succeeded (stripe-connect.js)
// quand aucun appointment ne porte le PI ET metadata.source='flowia_booking'.
//
// Logique par row pending (apres delai de grace GRACE_MINUTES) :
//   1. Un appointment porte desormais ce PI ?  -> status='resolved'
//      (le /book a fini par aboutir : retry client, webhook arrive avant
//      le sync path, etc.). Cas le plus frequent.
//   2. Sinon, re-verifier le PI cote Stripe (source de verite) :
//      - charge deja rembourse (refund manuel dashboard, SLOT_TAKEN race)
//        -> status='refunded' (rien a faire, on trace le refund existant)
//      - status PI non 'succeeded' -> status='resolved' (aucun argent pris)
//      - sinon REFUND integral avec idempotencyKey stable -> le client
//        recupere son argent. Email best-effort pour le prevenir.
//   3. Echec Stripe -> retry_count++ ; apres MAX_RETRIES -> status='failed'
//      + INSERT failed_refunds (visible admin, retry manuel).
//
// Le delai de grace evite de rembourser un client encore en train de
// finaliser (le /book verifie en face PAYMENT_REFUNDED via latest_charge,
// donc meme une course cron/book ne peut pas donner un RDV paye gratuit).
//
// Idempotence : refunds.create avec idempotencyKey par PI ; UPDATE finaux
// par id ; UNIQUE(payment_intent_id) sur la table. Operations financieres
// jamais fail-safe : tout echec est persiste et re-essaye.

const GRACE_MINUTES = 45;
const MAX_RETRIES   = 5;
const BATCH_SIZE    = 25;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY non configuree');
  return require('stripe')(key);
}

async function reconcileOrphanPayments(pool) {
  const { rows: due } = await pool.query(`
    SELECT id, payment_intent_id, stripe_account_id, user_id, amount_cents,
           client_email, retry_count
      FROM orphan_online_payments
     WHERE status = 'pending'
       AND created_at <= NOW() - ($1 || ' minutes')::interval
       AND retry_count < $2
     ORDER BY created_at ASC
     LIMIT $3
  `, [String(GRACE_MINUTES), MAX_RETRIES, BATCH_SIZE]);

  if (!due.length) {
    return { processed: 0, resolved: 0, refunded: 0, failed: 0 };
  }
  console.log(`[CRON orphans] ${due.length} paiement(s) orphelin(s) a reconcilier`);

  let stripe;
  try { stripe = getStripe(); } catch (e) {
    console.error('[CRON orphans] no Stripe key', e.message);
    return { processed: 0, resolved: 0, refunded: 0, failed: 0, error: 'no_stripe' };
  }

  let resolved = 0, refunded = 0, failed = 0;
  for (const row of due) {
    try {
      // 1. Le RDV existe finalement ? -> resolved, aucun argent a bouger.
      const { rows: appt } = await pool.query(
        `SELECT id FROM appointments WHERE stripe_payment_intent_id = $1 LIMIT 1`,
        [row.payment_intent_id]
      );
      if (appt.length) {
        await pool.query(`
          UPDATE orphan_online_payments
             SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status = 'pending'
        `, [row.id]);
        resolved++;
        console.log(`[CRON orphans] resolved pi=${row.payment_intent_id} appt=${appt[0].id}`);
        continue;
      }

      // 2. Verite Stripe : PI + charge (refund deja fait ailleurs ?).
      const pi = await stripe.paymentIntents.retrieve(
        row.payment_intent_id,
        { expand: ['latest_charge'] },
        { stripeAccount: row.stripe_account_id }
      );
      const ch = (pi.latest_charge && typeof pi.latest_charge === 'object')
        ? pi.latest_charge : null;

      if (ch && (ch.refunded || (Number(ch.amount_refunded) || 0) > 0)) {
        await pool.query(`
          UPDATE orphan_online_payments
             SET status = 'refunded',
                 stripe_refund_id = COALESCE(stripe_refund_id, $2),
                 resolved_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status = 'pending'
        `, [row.id, ch.refunds?.data?.[0]?.id || null]);
        refunded++;
        console.log(`[CRON orphans] deja rembourse ailleurs pi=${row.payment_intent_id}`);
        continue;
      }
      if (pi.status !== 'succeeded') {
        // Aucun argent encaisse (canceled / requires_*) : rien a rembourser.
        await pool.query(`
          UPDATE orphan_online_payments
             SET status = 'resolved', resolved_at = NOW(), updated_at = NOW(),
                 stripe_error_message = $2
           WHERE id = $1 AND status = 'pending'
        `, [row.id, 'pi_status=' + pi.status + ' (aucun debit)']);
        resolved++;
        continue;
      }

      // 3. Refund integral du client. idempotencyKey stable par PI :
      //    un retry reseau ou un double tick ne cree jamais 2 refunds.
      //    refund_application_fee=true : contrairement aux refunds
      //    d'annulation (politique : FlowIA garde sa commission), ici la
      //    reservation n'a JAMAIS existe — la commission est rendue au
      //    balance du commercant pour ne pas le laisser en negatif sur un
      //    paiement fantome dont il n'a jamais eu connaissance.
      const refund = await stripe.refunds.create(
        {
          payment_intent: row.payment_intent_id,
          reason: 'requested_by_customer',
          ...(pi.application_fee_amount > 0 ? { refund_application_fee: true } : {}),
          metadata: {
            source: 'flowia_orphan_reconciliation',
            orphan_row_id: row.id,
          },
        },
        { stripeAccount: row.stripe_account_id, idempotencyKey: `orphan_refund_${row.payment_intent_id}` }
      );
      await pool.query(`
        UPDATE orphan_online_payments
           SET status = 'refunded', stripe_refund_id = $2,
               stripe_error_message = NULL,
               resolved_at = NOW(), updated_at = NOW()
         WHERE id = $1
      `, [row.id, refund.id]);
      refunded++;
      console.log(`[CRON orphans] REFUND pi=${row.payment_intent_id} refund=${refund.id} amount=${row.amount_cents}c`);

      // Email best-effort au client : il a ete debite sans RDV, on le
      // previent du remboursement (delai bancaire 5-10 j). Non bloquant.
      if (row.client_email) {
        try {
          const { sendMarketingEmailRaw } = require('./emailSender');
          const amountEur = ((row.amount_cents || 0) / 100).toFixed(2).replace('.', ',');
          await sendMarketingEmailRaw({
            to:          row.client_email,
            toName:      '',
            subject:     'Votre paiement a ete rembourse — reservation non aboutie',
            type:        'transactional',
            htmlContent: `<p>Bonjour,</p>
                          <p>Votre paiement de <b>${amountEur} EUR</b> pour une reservation en ligne n'a pas pu etre finalise (la reservation n'a pas ete enregistree).</p>
                          <p>Nous venons de le <b>rembourser integralement</b>. Le montant reapparaitra sur votre compte sous 5 a 10 jours ouvres selon votre banque.</p>
                          <p>Vous pouvez refaire votre reservation a tout moment.</p>
                          <p>L'equipe FlowIA</p>`,
          });
        } catch (mailErr) {
          console.error('[CRON orphans] email client fail:', mailErr.message);
        }
      }
    } catch (e) {
      const msg = e.message || String(e);
      failed++;
      const newRetry = (row.retry_count || 0) + 1;
      const newStatus = newRetry >= MAX_RETRIES ? 'failed' : 'pending';
      await pool.query(`
        UPDATE orphan_online_payments
           SET retry_count = $2, stripe_error_message = $3,
               status = $4, updated_at = NOW()
         WHERE id = $1
      `, [row.id, newRetry, msg, newStatus]).catch(updErr =>
        console.error('[CRON orphans] update retry fail', updErr.message));
      console.error(`[CRON orphans] FAIL pi=${row.payment_intent_id} retry=${newRetry}/${MAX_RETRIES} status=${newStatus} msg=${msg}`);

      // Apres echec definitif : trace failed_refunds pour intervention
      // admin (meme circuit que les refunds d'annulation KO).
      if (newStatus === 'failed' && row.user_id) {
        try {
          await pool.query(`
            INSERT INTO failed_refunds
              (user_id, stripe_account_id, payment_intent_id, amount_cents,
               slug, reason, stripe_error_message)
            VALUES ($1, $2, $3, $4, NULL, 'orphan_payment', $5)
            ON CONFLICT (payment_intent_id) WHERE resolved_at IS NULL DO UPDATE
              SET retry_count = failed_refunds.retry_count + 1,
                  stripe_error_message = EXCLUDED.stripe_error_message,
                  updated_at = NOW()
          `, [row.user_id, row.stripe_account_id, row.payment_intent_id,
              row.amount_cents, msg]);
        } catch (insErr) {
          console.error('[CRON orphans] failed_refunds insert', insErr.message);
        }
      }
    }
  }
  console.log(`[CRON orphans] done : ${resolved} resolved, ${refunded} refunded, ${failed} fail`);
  return { processed: due.length, resolved, refunded, failed };
}

module.exports = { reconcileOrphanPayments };
