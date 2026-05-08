// routes/admin/stripe-payouts.js — Endpoints admin escrow / payouts.
// (1) POST /migrate-manual : pour chaque merchant ayant un compte Stripe
//     Connect, force settings.payouts.schedule.interval='manual'. A executer
//     une fois en prod apres deploiement de l'escrow pour aligner les
//     comptes existants sur le nouveau comportement (sans ca, leurs payouts
//     restent automatiques et l'escrow n'a aucun effet).
// (2) GET /pending : liste des payouts en attente (debug + monitoring admin).
// (3) POST /:id/release : force un release manuel (bypass cron). Utile si
//     un commerçant demande son argent en avance ou si on veut tester.

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');
const { logAuditAction } = require('../../services/adminAudit');
const { releasePayouts } = require('../../utils/releasePayouts');

const router = express.Router();
router.use(adminAuth);

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  return require('stripe')(key);
}

// ── POST /api/admin/stripe-payouts/migrate-manual ────────────────────────
// Loop sur tous les merchants avec un stripe_account_id, met chaque compte
// en payout_schedule.interval='manual'. Idempotent : ne fait rien si deja
// manual. Renvoie un compteur succes/echec/skipped.
router.post('/migrate-manual', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, stripe_account_id, business_name
        FROM users
       WHERE stripe_account_id IS NOT NULL
         AND stripe_account_disconnected_at IS NULL
       ORDER BY created_at ASC
    `);

    const stripe = getStripe();
    let succeeded = 0, failed = 0, skipped = 0;
    const errors = [];

    for (const u of rows) {
      try {
        // Recupere l'etat actuel pour skipper si deja manual.
        const acc = await stripe.accounts.retrieve(u.stripe_account_id);
        const currentInterval = acc?.settings?.payouts?.schedule?.interval;
        if (currentInterval === 'manual') {
          skipped++;
          continue;
        }
        await stripe.accounts.update(u.stripe_account_id, {
          settings: {
            payouts: {
              schedule: { interval: 'manual' },
            },
          },
        });
        succeeded++;
        console.log(`[migrate-manual] OK ${u.business_name} ${u.stripe_account_id} (was ${currentInterval})`);
      } catch (e) {
        failed++;
        errors.push({ user_id: u.id, account_id: u.stripe_account_id, error: e.message });
        console.error(`[migrate-manual] FAIL ${u.stripe_account_id}`, e.message);
      }
    }

    try {
      await logAuditAction({
        action: 'stripe.migrate_manual_payouts',
        targetType: 'platform',
        targetId: null,
        payloadAfter: { succeeded, failed, skipped, total: rows.length },
        req,
      });
    } catch {}

    res.json({ ok: true, total: rows.length, succeeded, failed, skipped, errors });
  } catch (e) {
    console.error('[ADMIN migrate-manual ERR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/stripe-payouts/pending ────────────────────────────────
// Liste les payouts en attente, tri par release_at ASC. Filtres
// optionnels : ?status=pending|released|cancelled|failed (default pending).
router.get('/pending', async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const validStatus = ['pending', 'released', 'cancelled', 'failed'];
    if (!validStatus.includes(status)) {
      return res.status(400).json({ error: 'status invalide' });
    }
    const { rows } = await pool.query(`
      SELECT ap.id, ap.appointment_id, ap.amount_cents, ap.release_at,
             ap.released_at, ap.status, ap.retry_count, ap.stripe_error_message,
             ap.stripe_payout_id, ap.created_at,
             u.business_name, u.email AS merchant_email,
             a.client_name, a.date AS appt_date, a.start_time AS appt_time
        FROM appointment_payouts ap
        JOIN users u ON u.id = ap.user_id
        LEFT JOIN appointments a ON a.id = ap.appointment_id
       WHERE ap.status = $1
       ORDER BY ap.release_at ASC
       LIMIT 500
    `, [status]);
    res.json({ payouts: rows });
  } catch (e) {
    console.error('[ADMIN payouts pending ERR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/admin/stripe-payouts/release-now ───────────────────────────
// Declenche manuellement le cron releasePayouts pour traiter les payouts
// dus immediatement (sans attendre le tick quotidien). Utile pour tester
// ou debloquer manuellement.
router.post('/release-now', async (req, res) => {
  try {
    const result = await releasePayouts(pool);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[ADMIN release-now ERR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
