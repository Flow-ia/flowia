// routes/stripe-connect.js — Onboarding Stripe Connect pour les commercants.
//
// Pattern : Direct charges via Controller API (Stripe API 2024+, remplace
// l'ancien OAuth Standard). Le commercant a son propre compte Stripe avec
// dashboard.stripe.com complet, recoit l'argent direct sur son compte, paie
// les frais Stripe (controller.fees.payer='account'), Stripe absorbe les
// pertes (controller.losses.payments='stripe'). FlowIA prend une commission
// configurable via application_fee_amount sur chaque PaymentIntent.
//
// Voir memory/project_stripe_connect_config.md pour la decision validee.

const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante sur Render');
  return require('stripe')(key);
}

// Race-safe : appele depuis le webhook payment_intent.succeeded pour
// garantir que stripe_fee_cents est rempli sur la row 'rdv_online' du PI,
// MEME si le webhook arrive avant que le sync path (book.js) ait insere
// la row. Retry une fois apres 2s. Idempotent : ne touche que si
// stripe_fee_cents IS NULL OR = 0.
//
// Pourquoi separe du flow principal du webhook : le block existant
// `if (upd.rowCount > 0) { ... }` skip tout si l'appointment n'existe pas
// encore. Ce helper s'execute apres, sans condition, pour rattraper la
// race entre webhook async et sync path.
async function ensureFeesUpdated(pool, pi, eventAccount) {
  const findTx = async () => {
    const { rows } = await pool.query(
      `SELECT id, user_id, stripe_fee_cents, platform_fee_cents, gross_amount_cents
         FROM transactions
        WHERE stripe_payment_intent_id = $1
          AND source = 'rdv_online'
        LIMIT 1`,
      [pi.id]
    );
    return rows[0] || null;
  };

  // Backoff progressif : le sync path (book.js) prend 6-8s en prod a inserer
  // la row apres POST /payment_intents/confirm. Un retry court rate la
  // fenetre. On retente a 0s, +1s, +3s, +6s, +10s cumules (= jusqu'a 10s
  // d'attente totale). Premiere fois qu'on trouve la row, on sort.
  const delays = [0, 1000, 2000, 3000, 4000];
  let tx = null;
  let totalWaited = 0;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) {
      await new Promise(r => setTimeout(r, delays[i]));
      totalWaited += delays[i];
    }
    tx = await findTx();
    if (tx) {
      console.log('[STRIPE FEES UPDATE] tx found after ' + totalWaited + 'ms for pi=' + pi.id);
      break;
    }
  }
  if (!tx) {
    console.log('[STRIPE FEES UPDATE] tx still not found after ' + totalWaited + 'ms for pi=' + pi.id + ', skipping');
    return;
  }

  // Idempotence : si les 2 fees sont deja non-zero, on a deja le calcul
  // complet. On skip pour eviter un round-trip Stripe inutile.
  if ((tx.stripe_fee_cents != null && tx.stripe_fee_cents > 0)
      && (tx.platform_fee_cents != null && tx.platform_fee_cents > 0)) {
    return;
  }

  // Recupere stripe_fee depuis balance_transaction.fee (vraie valeur Stripe).
  let stripeFee = 0;
  try {
    const stripe = getStripe();
    const chargeId = pi.latest_charge || pi.charges?.data?.[0]?.id;
    if (chargeId) {
      const ch = await stripe.charges.retrieve(
        chargeId,
        undefined,
        { stripeAccount: eventAccount }
      );
      if (ch?.balance_transaction) {
        const btId = typeof ch.balance_transaction === 'string'
          ? ch.balance_transaction
          : ch.balance_transaction.id;
        const bt = await stripe.balanceTransactions.retrieve(
          btId,
          undefined,
          { stripeAccount: eventAccount }
        );
        stripeFee = bt?.fee || 0;
      }
    }
  } catch (e) {
    console.warn('[STRIPE FEES UPDATE] balance_transaction fetch fail:', e.message);
  }

  // Recupere platform_fee directement depuis pi.application_fee_amount
  // (pas besoin du charge pour ca, c'est sur le PaymentIntent lui-meme).
  const platformFee = pi.application_fee_amount || 0;
  const grossCents  = parseInt(tx.gross_amount_cents || 0, 10);
  const netCents    = grossCents - stripeFee - platformFee;

  // Si les deux fees sont 0 ET on n'a rien recupere, skip (rien a faire).
  if (stripeFee <= 0 && platformFee <= 0) {
    console.log('[STRIPE FEES UPDATE] no fees to apply for pi=' + pi.id + ' (stripe=0, platform=0), skipping');
    return;
  }

  // UPDATE idempotent : WHERE garantit qu'un 2e webhook ne reecrase pas
  // une valeur deja correcte. On UPDATE si AU MOINS une des 2 colonnes
  // fees est encore vide (cas typique : sync path a tout mis a 0).
  await pool.query(
    `UPDATE transactions
        SET stripe_fee_cents   = $1,
            platform_fee_cents = $2,
            net_amount_cents   = $3
      WHERE stripe_payment_intent_id = $4
        AND source = 'rdv_online'
        AND (
          stripe_fee_cents IS NULL OR stripe_fee_cents = 0
          OR platform_fee_cents IS NULL OR platform_fee_cents = 0
        )`,
    [stripeFee, platformFee, netCents, pi.id]
  );
  console.log('[STRIPE FEES UPDATE] source=webhook pi=' + pi.id
    + ' tx=' + tx.id
    + ' gross=' + grossCents
    + ' stripe_fee=' + stripeFee
    + ' platform_fee=' + platformFee
    + ' net=' + netCents);

  try {
    const { invalidateUserStatsCache } = require('../utils/paymentV3');
    invalidateUserStatsCache(tx.user_id);
  } catch {}
}
function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')[0].replace(/\/$/, '');
}

// ── POST /api/stripe-connect/onboard ─────────────────────────────────────────
// Cree (ou recree) un compte Stripe Connect pour le marchand connecte et
// retourne l'URL d'onboarding Stripe-hosted. Le marchand est redirige sur
// Stripe pour saisir ses infos legales/bancaires, puis revient sur l'app.
router.post('/onboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const stripe = getStripe();

    const { rows } = await pool.query(
      `SELECT email, business_name, country, stripe_account_id
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });
    const u = rows[0];

    // 1) Creer le compte si inexistant. Sinon reutiliser pour relancer
    //    un onboarding (cas user qui n'a pas finalise).
    let accountId = u.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        controller: {
          stripe_dashboard:       { type: 'full' },
          fees:                   { payer: 'account' },
          losses:                 { payments: 'stripe' },
          requirement_collection: 'stripe',
        },
        country: (u.country || 'FR').toUpperCase().slice(0, 2),
        email:   u.email,
        business_profile: {
          name: u.business_name || undefined,
        },
        // ESCROW : payout schedule MANUAL pour que les fonds restent sur
        // le balance Connect jusqu'a la liberation par le cron releasePayouts
        // (release_at = appointment_date + payout_hold_days). Sans ca, Stripe
        // payout auto envoie l'argent vers l'IBAN avant que la prestation ait
        // lieu -> impossible de gerer les refunds proprement.
        settings: {
          payouts: {
            schedule: { interval: 'manual' },
          },
        },
        metadata: { user_id: userId },
      });
      accountId = account.id;
      await pool.query(
        `UPDATE users SET stripe_account_id=$1,
                          stripe_account_email=$2
         WHERE id=$3`,
        [accountId, u.email, userId]
      );
    }

    // 2) Generer un AccountLink pour la session d'onboarding hostee.
    const front = getFrontendUrl();
    const link = await stripe.accountLinks.create({
      account:     accountId,
      refresh_url: `${front}/reglages/paiements?stripe_connect=refresh`,
      return_url:  `${front}/reglages/paiements?stripe_connect=return`,
      type:        'account_onboarding',
    });

    res.json({ url: link.url, account_id: accountId });
  } catch (e) {
    console.error('[CONNECT ONBOARD ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors de la création du compte Stripe' });
  }
});

// ── GET /api/stripe-connect/account ─────────────────────────────────────────
// Retourne l'etat du compte Connect du marchand (depuis DB, avec backfill
// silencieux si on a pas encore reçu le webhook account.updated).
router.get('/account', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      `SELECT stripe_account_id, stripe_account_email,
              stripe_charges_enabled, stripe_payouts_enabled,
              stripe_account_connected_at, online_payments_enabled,
              commission_rate
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });
    const u = rows[0];

    if (!u.stripe_account_id) {
      return res.json({
        connected:           false,
        account_id:          null,
        charges_enabled:     false,
        payouts_enabled:     false,
        details_submitted:   false,
        online_payments_enabled: !!u.online_payments_enabled,
        commission_rate:     parseFloat(u.commission_rate) || 0,
      });
    }

    // Best-effort refresh depuis Stripe live pour avoir charges_enabled
    // a jour meme si le webhook n'est pas encore arrive.
    let charges_enabled = !!u.stripe_charges_enabled;
    let payouts_enabled = !!u.stripe_payouts_enabled;
    let details_submitted = false;
    let requirements_due = [];
    try {
      const stripe = getStripe();
      const acc = await stripe.accounts.retrieve(u.stripe_account_id);
      charges_enabled   = !!acc.charges_enabled;
      payouts_enabled   = !!acc.payouts_enabled;
      details_submitted = !!acc.details_submitted;
      requirements_due  = acc.requirements?.currently_due || [];
      // Persist le state si ca a change (eventual consistency).
      if (charges_enabled !== u.stripe_charges_enabled
        || payouts_enabled !== u.stripe_payouts_enabled) {
        await pool.query(
          `UPDATE users SET stripe_charges_enabled=$1, stripe_payouts_enabled=$2,
                            stripe_account_connected_at = COALESCE(stripe_account_connected_at, $3)
           WHERE id=$4`,
          [charges_enabled, payouts_enabled, charges_enabled ? new Date() : null, userId]
        );
      }
    } catch (e) {
      console.warn('[CONNECT ACCOUNT] retrieve fail (non bloquant):', e.message);
    }

    res.json({
      connected:           true,
      account_id:          u.stripe_account_id,
      account_email:       u.stripe_account_email,
      charges_enabled,
      payouts_enabled,
      details_submitted,
      requirements_due,
      connected_at:        u.stripe_account_connected_at,
      online_payments_enabled: !!u.online_payments_enabled,
      commission_rate:     parseFloat(u.commission_rate) || 0,
    });
  } catch (e) {
    console.error('[CONNECT ACCOUNT ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors de la récupération du compte' });
  }
});

// ── POST /api/stripe-connect/dashboard-link ────────────────────────────────
// Genere un login link Stripe pour acceder au dashboard Stripe du compte
// connecte (consultation/configuration depuis FlowIA sans repartir de zero).
router.post('/dashboard-link', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      'SELECT stripe_account_id FROM users WHERE id=$1', [userId]
    );
    if (!rows.length || !rows[0].stripe_account_id) {
      return res.status(400).json({ error: 'Aucun compte Stripe connecté' });
    }
    const stripe = getStripe();
    const link = await stripe.accounts.createLoginLink(rows[0].stripe_account_id);
    res.json({ url: link.url });
  } catch (e) {
    console.error('[CONNECT DASHBOARD LINK ERR]', e.message);
    res.status(500).json({ error: 'Erreur ouverture dashboard Stripe' });
  }
});

// ── GET /api/stripe-connect/balance ────────────────────────────────────────
// Solde live cote Stripe (compte connecte du merchant). Source de verite
// pour le solde en attente affiche dans /reglages/paiements -- l'API Stripe
// reflete IMMEDIATEMENT les refunds (le pending diminue) contrairement a
// la table appointment_payouts qui depend du cron releasePayouts.
//
// Returns:
//   - available_cents : solde disponible (peut etre payout maintenant)
//   - pending_cents   : solde en attente de settlement Stripe (encaisse
//                       mais pas encore disponible -- typiquement 2-7j)
//   - currency
// Best-effort : si Stripe API fail (compte deconnecte, rate-limit), on
// fallback sur 0 cents pour ne pas casser le dashboard.
router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // ── LEGACY : Stripe Balance API (source live, settlement-aware) ─────
    const legacyFn = async () => {
      const { rows } = await pool.query(
        'SELECT stripe_account_id FROM users WHERE id=$1', [userId]
      );
      if (!rows.length || !rows[0].stripe_account_id) {
        return { available_cents: 0, pending_cents: 0, currency: 'eur', connected: false };
      }
      try {
        const stripe = getStripe();
        const balance = await stripe.balance.retrieve(
          {},
          { stripeAccount: rows[0].stripe_account_id }
        );
        const sumCurrency = (arr, cur) => (arr || [])
          .filter(b => (b.currency || '').toLowerCase() === cur)
          .reduce((s, b) => s + (b.amount || 0), 0);
        const currency = 'eur';
        return {
          available_cents: sumCurrency(balance.available, currency),
          pending_cents:   sumCurrency(balance.pending,   currency),
          currency,
          connected: true,
        };
      } catch (apiErr) {
        console.warn('[CONNECT GET balance] Stripe API fail', apiErr.message);
        return { available_cents: 0, pending_cents: 0, currency: 'eur', connected: true, error: apiErr.message };
      }
    };

    // ── LEDGER : estimation depuis financial_ledger ─────────────────────
    // ATTENTION : Stripe Balance et ledger ne sont PAS comparables au cent
    // (settlement timing Stripe ~5-7j). fields=[] -> aucun drift loggue ici.
    const { getBalanceFromLedger } = require('../utils/ledgerReader');
    const ledgerFn = () => getBalanceFromLedger(pool, userId);

    const { dualRead, isDebugVisible } = require('../utils/dualRead');
    const debugVisible = await isDebugVisible(req, userId);
    const result = await dualRead({
      userId,
      label:        'balance',
      flagName:     'ledger_read_balance',
      legacyFn,
      ledgerFn,
      tolerance:    0,
      fields:       [],   // pas de drift attendu sur cette route (sources differentes)
      debugVisible,
    });
    res.json(result);
  } catch (e) {
    console.error('[CONNECT GET balance ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/stripe-connect/payouts ─────────────────────────────────────────
// Liste des payouts (escrow appointment_payouts) du merchant connecte.
// Filtre optionnel ?status=pending|released|cancelled|failed. Default :
// renvoie pending + released sur les 90 derniers jours pour le dashboard.
router.get('/payouts', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const status = req.query.status || null;
    if (status) {
      const valid = ['pending', 'released', 'cancelled', 'failed'];
      if (!valid.includes(status)) {
        return res.status(400).json({ error: 'status invalide' });
      }
    }

    // ── LEGACY : lit appointment_payouts ────────────────────────────────
    const legacyFn = async () => {
      const params = [userId];
      let whereStatus = '';
      if (status) {
        params.push(status);
        whereStatus = ` AND ap.status = $2`;
      }
      const { rows } = await pool.query(`
        SELECT ap.id, ap.appointment_id, ap.amount_cents, ap.release_at,
               ap.released_at, ap.status, ap.cancelled_reason, ap.created_at,
               ap.stripe_payout_id,
               a.client_name, a.date AS appt_date, a.start_time AS appt_time,
               COALESCE(s.name, '') AS service_name
          FROM appointment_payouts ap
          LEFT JOIN appointments a ON a.id = ap.appointment_id
          LEFT JOIN booking_services s ON s.id = a.service_id
         WHERE ap.user_id = $1${whereStatus}
         ORDER BY
           CASE ap.status
             WHEN 'pending'   THEN 1
             WHEN 'failed'    THEN 2
             WHEN 'released'  THEN 3
             WHEN 'cancelled' THEN 4
           END,
           ap.release_at ASC
         LIMIT 200
      `, params);
      const { rows: aggR } = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN status='pending' THEN amount_cents ELSE 0 END), 0)::bigint AS pending_cents,
          COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
          COUNT(*) FILTER (WHERE status='released')::int AS released_count
        FROM appointment_payouts
        WHERE user_id = $1
      `, [userId]);
      return {
        payouts: rows,
        summary: {
          pending_cents:  parseInt(aggR[0]?.pending_cents || 0, 10),
          pending_count:  aggR[0]?.pending_count || 0,
          released_count: aggR[0]?.released_count || 0,
        },
      };
    };

    // ── LEDGER : meme shape depuis financial_ledger ─────────────────────
    const { getPayoutsFromLedger } = require('../utils/ledgerReader');
    const ledgerFn = () => getPayoutsFromLedger(pool, userId, status);

    const { dualRead, isDebugVisible } = require('../utils/dualRead');
    const debugVisible = await isDebugVisible(req, userId);
    const result = await dualRead({
      userId,
      label:        'payouts',
      flagName:     'ledger_read_payouts',
      legacyFn,
      ledgerFn,
      tolerance:    0,
      // On compare uniquement le summary (les rows individuelles ont des
      // shapes derives differents : details affichage non comparables au cent).
      fields:       ['summary.pending_cents', 'summary.pending_count', 'summary.released_count'],
      debugVisible,
    });
    res.json(result);
  } catch (e) {
    console.error('[CONNECT GET payouts ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/stripe-connect/performance-stats ─────────────────────────────
// Agrege les KPI paiements en ligne du merchant sur une periode glissante
// (7 / 30 / 90 jours). Sert a la section "Performances" dans /reglages/paiements.
//
// Sources de verite :
//   - transactions (source='rdv_online') : revenus paiements en ligne (positifs)
//   - transactions (source='rdv_refund') : remboursements (amount POSITIF
//     depuis la refonte v3 ; le sens 'refund' est porte par payment_status
//     ='REFUNDED'. On utilise ABS pour rester compatible avec d'eventuelles
//     rows legacy negatives anterieures au CHECK constraint amount>=0).
//   - appointments.cancelled_by + cancelled_at : tracabilite annulations
//
// Filtre temporel : par tx.date pour revenue/refund (vue cash-flow) ; par
// cancelled_at pour annulations (date effective de l'action).
router.get('/performance-stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const allowed = [7, 30, 90];
    const period = allowed.includes(parseInt(req.query.period, 10))
      ? parseInt(req.query.period, 10)
      : 30;

    // ── LEGACY : KPI financiers depuis transactions ─────────────────────
    const legacyFn = async () => {
      const { rows: txR } = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN source='rdv_online' THEN amount ELSE 0 END), 0)::numeric AS gross_revenue,
          COALESCE(SUM(CASE WHEN source='rdv_refund' THEN ABS(amount) ELSE 0 END), 0)::numeric AS refund_amount,
          COUNT(*) FILTER (WHERE source='rdv_online') AS online_paid_count,
          COUNT(*) FILTER (WHERE source='rdv_refund') AS refund_count
          FROM transactions
         WHERE user_id = $1
           AND deleted_at IS NULL
           AND date >= (CURRENT_DATE - ($2 || ' days')::interval)
      `, [userId, String(period)]);
      const gross  = parseFloat(txR[0]?.gross_revenue || 0);
      const refund = parseFloat(txR[0]?.refund_amount || 0);
      return {
        period_days:         period,
        online_paid_count:   parseInt(txR[0]?.online_paid_count || 0, 10),
        gross_revenue_cents: Math.round(gross * 100),
        refund_count:        parseInt(txR[0]?.refund_count || 0, 10),
        refund_amount_cents: Math.round(refund * 100),
        net_revenue_cents:   Math.round((gross - refund) * 100),
      };
    };

    // ── LEDGER : meme shape depuis financial_ledger ─────────────────────
    const { getPerformanceStatsFromLedger } = require('../utils/ledgerReader');
    const ledgerFn = () => getPerformanceStatsFromLedger(pool, userId, period);

    const { dualRead, isDebugVisible } = require('../utils/dualRead');
    const debugVisible = await isDebugVisible(req, userId);
    const financial = await dualRead({
      userId,
      label:      'performance-stats',
      flagName:   'ledger_read_performance',
      legacyFn,
      ledgerFn,
      tolerance:  0,
      fields:     ['gross_revenue_cents','refund_amount_cents','net_revenue_cents',
                   'online_paid_count','refund_count'],
      debugVisible,
    });

    // ── KPI annulations : appointments-based (ledger ne couvre pas) ─────
    const { rows: cxR } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE cancelled_by='system')   ::int AS no_show_auto,
        COUNT(*) FILTER (WHERE cancelled_by='client')   ::int AS cancelled_client,
        COUNT(*) FILTER (WHERE cancelled_by='merchant') ::int AS cancelled_merchant
        FROM appointments
       WHERE user_id = $1
         AND cancelled_at IS NOT NULL
         AND cancelled_at >= NOW() - ($2 || ' days')::interval
    `, [userId, String(period)]);

    res.json({
      ...financial,
      no_show_auto_count:       cxR[0]?.no_show_auto       || 0,
      cancelled_client_count:   cxR[0]?.cancelled_client   || 0,
      cancelled_merchant_count: cxR[0]?.cancelled_merchant || 0,
    });
  } catch (e) {
    console.error('[CONNECT GET performance-stats ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/stripe-connect/payment-config ─────────────────────────────────
// Retourne la config paiement RDV du marchand : active/inactif, politique
// (optionnel/obligatoire), pourcentage d'acompte.
router.get('/payment-config', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      `SELECT online_payments_enabled, booking_payment_policy,
              booking_payment_percentage, stripe_charges_enabled
       FROM users WHERE id=$1`, [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User introuvable' });
    const u = rows[0];
    res.json({
      enabled:    !!u.online_payments_enabled,
      policy:     u.booking_payment_policy || 'optional',
      percentage: parseInt(u.booking_payment_percentage, 10) || 100,
      // Indique si le marchand peut activer (Connect doit etre charges_enabled).
      can_enable: !!u.stripe_charges_enabled,
    });
  } catch (e) {
    console.error('[CONNECT PAYMENT-CONFIG GET ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── PUT /api/stripe-connect/payment-config ─────────────────────────────────
// Met a jour la config. Validation stricte :
// - enabled requiert stripe_charges_enabled=TRUE (sinon le client ne pourrait
//   pas payer, ca casserait le booking).
// - policy whitelist 'optional'/'mandatory'.
// - percentage entier 1-100.
router.put('/payment-config', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { enabled, policy, percentage } = req.body || {};

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled doit etre boolean' });
    }
    if (policy && !['optional', 'mandatory'].includes(policy)) {
      return res.status(400).json({ error: 'policy invalide (optional|mandatory)' });
    }
    const pct = parseInt(percentage, 10);
    if (percentage !== undefined && (!Number.isInteger(pct) || pct < 1 || pct > 100)) {
      return res.status(400).json({ error: 'percentage doit etre entier 1-100' });
    }

    // Si on active, verifier que Connect est charges_enabled (sinon les
    // PaymentIntents echoueraient cote Stripe).
    if (enabled) {
      const { rows: chk } = await pool.query(
        'SELECT stripe_charges_enabled FROM users WHERE id=$1', [userId]
      );
      if (!chk[0]?.stripe_charges_enabled) {
        return res.status(400).json({
          error: 'Connectez et finalisez votre compte Stripe avant d\'activer les paiements en ligne.',
        });
      }
    }

    await pool.query(
      `UPDATE users SET
         online_payments_enabled    = $2,
         booking_payment_policy     = COALESCE($3, booking_payment_policy),
         booking_payment_percentage = COALESCE($4, booking_payment_percentage)
       WHERE id=$1`,
      [userId, enabled, policy || null, percentage !== undefined ? pct : null]
    );

    const { rows } = await pool.query(
      `SELECT online_payments_enabled, booking_payment_policy, booking_payment_percentage
       FROM users WHERE id=$1`, [userId]
    );
    const u = rows[0];
    res.json({
      ok: true,
      enabled:    !!u.online_payments_enabled,
      policy:     u.booking_payment_policy,
      percentage: parseInt(u.booking_payment_percentage, 10),
    });
  } catch (e) {
    console.error('[CONNECT PAYMENT-CONFIG PUT ERR]', e.message);
    res.status(500).json({ error: 'Erreur lors de la mise a jour' });
  }
});

// ── POST /api/stripe-connect/disconnect ────────────────────────────────────
// Deconnecte le compte Connect du marchand. AUDIT Phase 5 :
// - Refuse si des RDV futurs ont un PaymentIntent paye (sinon impossible de
//   refund par la suite). Le marchand doit annuler ces RDV d'abord.
// - Archive l'ancien stripe_account_id dans stripe_account_id_archived pour
//   permettre des refunds historiques (RDV passes payes en ligne).
router.post('/disconnect', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Bloque la deconnexion si des RDV futurs sont payes en ligne (le client
    // a deja paye, le merchant doit honorer ou annuler+refund cote Stripe).
    const { rows: pending } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM appointments
        WHERE user_id=$1
          AND payment_status='paid'
          AND status NOT IN ('cancelled','completed','no_show')
          AND date >= (NOW() AT TIME ZONE 'Europe/Paris')::date`,
      [userId]
    );
    if (pending[0]?.n > 0) {
      return res.status(409).json({
        error: `Vous avez ${pending[0].n} rendez-vous futur(s) payé(s) en ligne. Honorez-les ou annulez-les (avec remboursement) avant de déconnecter Stripe.`,
        code: 'PAID_APPOINTMENTS_PENDING',
        pending_count: pending[0].n,
      });
    }

    // Archive l'ancien account_id avant de NULL-ifier — permet refund retro.
    // Note : appointment_payouts.stripe_account_id reste settle au moment de
    // l'INSERT (snapshot) — on ne le NULL-ifie pas, ce qui permet au cron
    // releasePayouts de payouter les fonds restants meme apres deconnexion
    // (le compte Stripe Connect existe toujours cote Stripe, on a juste
    // coupe le lien UI cote FlowIA). C'est volontaire : les clients ayant
    // deja paye doivent recevoir leur prestation ou leur refund.
    await pool.query(
      `UPDATE users SET stripe_account_id_archived     = COALESCE(stripe_account_id, stripe_account_id_archived),
                        stripe_account_disconnected_at = NOW(),
                        stripe_account_id              = NULL,
                        stripe_account_email           = NULL,
                        stripe_charges_enabled         = FALSE,
                        stripe_payouts_enabled         = FALSE,
                        stripe_account_connected_at    = NULL,
                        online_payments_enabled        = FALSE
       WHERE id=$1`, [userId]
    );
    console.log('[CONNECT DISCONNECT] user=' + userId + ' disconnected, kept appointment_payouts.stripe_account_id snapshot for retro refunds/releases');
    res.json({ ok: true });
  } catch (e) {
    console.error('[CONNECT DISCONNECT ERR]', e.message);
    res.status(500).json({ error: 'Erreur déconnexion' });
  }
});

// ── POST /api/stripe-connect/webhook ───────────────────────────────────────
// Webhook DEDIE aux events Connect (account.updated principalement, +
// payment_intent.succeeded / charge.refunded sur comptes connectes pour
// les paiements de RDV plus tard). Verifie la signature avec
// STRIPE_CONNECT_WEBHOOK_SECRET (different du webhook plateforme).
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('[CONNECT WEBHOOK] signature manquante');
    return res.status(400).json({ error: 'webhook signature required' });
  }
  // Multi-mode : on accepte 5 secrets possibles dans cet ordre, on teste
  // chacun jusqu'a en trouver un qui valide. Couvre les 2 webhooks Stripe
  // Connect necessaires : un sur 'Votre compte' (account.updated), un sur
  // 'Comptes connectes' (payment_intent.*, charge.refunded), x2 (Test+Live).
  const secrets = [
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET_LIVE,
    process.env.STRIPE_CONNECT_CONNECTED_WEBHOOK_SECRET_TEST,
    process.env.STRIPE_CONNECT_CONNECTED_WEBHOOK_SECRET_LIVE,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,  // legacy single-secret
  ].filter(Boolean);
  if (!secrets.length) {
    console.error('[CONNECT WEBHOOK] aucun STRIPE_CONNECT_WEBHOOK_SECRET_* configuré');
    return res.status(500).json({ error: 'webhook not configured' });
  }
  let event = null, lastErr = null;
  const stripe = getStripe();
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
      break;
    } catch (e) { lastErr = e; }
  }
  if (!event) {
    console.error('[CONNECT WEBHOOK] signature invalide:', lastErr?.message);
    return res.status(400).json({ error: 'invalid signature' });
  }

  // Anti-replay : SELECT-then-process-then-INSERT au lieu de INSERT-early.
  // Avant ce fix, l'INSERT processed_stripe_events arrivait avant le
  // processing et res.json(200) etait envoye immediatement -> si le
  // processing throw, l'event etait marque "processe" et Stripe ne
  // retentait jamais, perte permanente. Maintenant : on check, on processe,
  // et on marque seulement si succes. Si echec -> 500 -> Stripe retentera
  // (jusqu'a 3 jours, exponentiel). Le processing reste idempotent via
  // ON CONFLICT / WHERE clauses partout dans le code en aval, donc un
  // double-process partiel ne corrompt rien.
  let alreadyProcessed = false;
  try {
    const { rows: prevR } = await pool.query(
      'SELECT 1 FROM processed_stripe_events WHERE event_id = $1 LIMIT 1',
      [event.id]
    );
    alreadyProcessed = prevR.length > 0;
  } catch (e) {
    console.error('[CONNECT WEBHOOK] anti-replay SELECT err (continue without dedup):', e.message);
  }
  if (alreadyProcessed) {
    console.log('[CONNECT WEBHOOK] event already processed (skip):', event.id, event.type);
    return res.json({ received: true, already_processed: true });
  }

  // Track les erreurs critiques pour decider du status code en fin de
  // processing. Les inner try/catch existants logguent deja en console.error
  // — on les preserve pour ne pas casser le flow inter-side-effects. Mais
  // si l'outer try catche (= erreur non-recuperable hors des inner catches),
  // on repond 500 pour declencher un retry Stripe.
  let outerError = null;

  try {
    if (event.type === 'account.updated') {
      const acc = event.data.object;
      await pool.query(
        `UPDATE users SET stripe_charges_enabled=$1,
                          stripe_payouts_enabled=$2,
                          stripe_account_connected_at = COALESCE(stripe_account_connected_at,
                            CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END)
         WHERE stripe_account_id=$3`,
        [!!acc.charges_enabled, !!acc.payouts_enabled, acc.id]
      );
      console.log('[CONNECT WEBHOOK] account.updated:', acc.id,
        acc.charges_enabled ? 'charges_OK' : 'charges_pending');
    }

    // AUDIT Phase 5 : pour les events payment_intent.* / charge.refunded sur
    // comptes connectes, on UPDATE appointments via stripe_payment_intent_id
    // (pas via stripe_account_id), donc l'archive du merchant n'est pas
    // necessaire ici — le PI suffit a retrouver le RDV.

    // Phase 5/5 : events sur comptes connectes (booking payment flow).
    // ⚠ Ces events arrivent avec event.account = id du compte connecte.
    // L'objet pi.metadata contient les infos du booking pour reconcilier.
    else if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      // Si un RDV est deja lie (cree par /book apres confirmPayment cote
      // front), on confirme payment_status='paid'. paid (boolean) = TRUE
      // seulement si paiement integral (acompte → paid reste FALSE pour que
      // le merchant puisse encaisser le reste en boutique).
      const amt = pi.amount_received || pi.amount;
      const upd = await pool.query(
        `UPDATE appointments
            SET payment_status = 'paid',
                paid           = (paid OR (ROUND(total_amount * 100) <= $2)),
                paid_at        = COALESCE(paid_at, NOW()),
                paid_amount_cents = COALESCE(paid_amount_cents, $2)
          WHERE stripe_payment_intent_id = $1
          RETURNING id, user_id, paid`,
        [pi.id, amt]
      );
      if (upd.rowCount > 0) {
        console.log('[CONNECT WEBHOOK] payment_intent.succeeded:',
          pi.id, '→ appt', upd.rows[0].id, upd.rows[0].paid ? '(integral)' : '(acompte)');
        // ESCROW : programme un payout futur vers l'IBAN du commerçant
        // (release_at = appointment_date + payout_hold_days). Le montant
        // net sur le balance Connect = amount - application_fee_amount,
        // donc on calcule depuis pi (amount_received - application_fee).
        try {
          const { scheduleAppointmentPayout } = require('../utils/scheduleAppointmentPayout');
          // application_fee_amount peut etre absent si commission=0.
          const appFee = pi.application_fee_amount || 0;
          const netCents = amt - appFee;
          if (netCents > 0) {
            await scheduleAppointmentPayout(pool, {
              appointmentId: upd.rows[0].id,
              paymentIntentId: pi.id,
              amountCents: netCents,
            });
            console.log('[CONNECT WEBHOOK] payout scheduled for appt', upd.rows[0].id, 'net', netCents);
          }
        } catch (escrowErr) {
          console.error('[CONNECT WEBHOOK] schedule payout fail', escrowErr.message);
        }

        // CAISSE / TRACABILITE : INSERT transaction revenue pour la
        // tracabilite cote commercant. Sans cette ligne, le paiement online
        // n'apparaissait nulle part dans la caisse / historique / stats.
        // Description distinct selon paiement integral ou acompte. payment_method
        // 'card_online' pour distinguer du card classique au comptoir. source
        // 'rdv_online' pour discriminer rdv (encaissement manuel) vs rdv_online
        // (paiement Stripe direct cote client). qty_total=1 (1 prestation
        // payee = 1 prestation comptee dans les KPIs).
        // Idempotence : l'anti-replay processed_stripe_events deja en place
        // (vu plus haut) garantit que le webhook ne sera pas traite 2x. En
        // defense supplementaire, ON CONFLICT DO NOTHING sur stripe_pi_id
        // si cette colonne unique etait ajoutee plus tard. Pour l'instant
        // on s'appuie sur l'anti-replay au niveau webhook.
        try {
          const { rows: apptInfo } = await pool.query(
            `SELECT a.client_name, a.employee_id, a.paid, a.user_id,
                    bs.timezone
               FROM appointments a
               LEFT JOIN booking_settings bs ON bs.user_id = a.user_id
              WHERE a.id = $1`, [upd.rows[0].id]
          );
          if (apptInfo.length) {
            const cn = apptInfo[0].client_name || 'client';
            const empId = apptInfo[0].employee_id || null;
            const isFullyPaid = !!upd.rows[0].paid;
            const desc = isFullyPaid
              ? `Paiement en ligne RDV — ${cn}`
              : `Acompte en ligne RDV — ${cn}`;
            const now = new Date();
            // ON CONFLICT DO NOTHING : si book.js a deja insere la
            // transaction (chemin sync, race-safe), on no-op ici. UNIQUE
            // index partiel idx_transactions_rdv_online_appt sur
            // (appointment_id) WHERE source='rdv_online' garantit qu'il
            // n'y a qu'1 row 'rdv_online' par RDV.
            // Refonte v3 : on alimente aussi les nouvelles colonnes
            // (payment_status, payment_source, *_cents, paid_at, payment_type,
            // stripe_payment_intent_id) en plus des legacy. Permet a /historique
            // et /stats/* de classifier la transaction sans attendre le retro-fill.
            // payment_type='deposit' si acompte (paiement partiel : amt < total),
            // 'full' sinon. payment_status='STRIPE_ACOMPTE' pour acompte sinon
            // 'STRIPE_100'. application_fee_amount = commission FlowIA.
            const isFullyPaid_v3 = !!upd.rows[0].paid;
            const platformFeeCents_v3 = pi.application_fee_amount || 0;
            // stripe_fee_cents : retrieve balance_transaction si possible.
            // Best-effort, defaut 0 si erreur.
            let stripeFeeCents_v3 = 0;
            try {
              const chargeId = pi.latest_charge;
              if (chargeId) {
                const stripeApi = getStripe();
                // 3-arg form (id, params, options) : le 2-arg avec
                // stripeAccount est rejete par le SDK Node 22.x.
                const ch = await stripeApi.charges.retrieve(chargeId, undefined, { stripeAccount: event.account });
                if (ch?.balance_transaction) {
                  const bt = await stripeApi.balanceTransactions.retrieve(
                    ch.balance_transaction,
                    undefined,
                    { stripeAccount: event.account }
                  );
                  stripeFeeCents_v3 = bt?.fee || 0;
                }
              }
            } catch (feeErr) {
              console.warn('[CONNECT WEBHOOK] balance_transaction fee fetch fail:', feeErr.message);
            }
            const grossCents_v3 = amt;
            const netCents_v3   = grossCents_v3 - stripeFeeCents_v3 - platformFeeCents_v3;
            const v3Status = isFullyPaid_v3 ? 'STRIPE_100' : 'STRIPE_ACOMPTE';
            const v3Type   = isFullyPaid_v3 ? 'full' : 'deposit';

            // ON CONFLICT DO UPDATE pour les fees : le sync path (book.js)
            // a peut-etre deja insere la row avec stripe_fee_cents=0 (avant
            // que le balance_transaction Stripe ne soit disponible). Le
            // webhook arrive plus tard avec les vraies valeurs depuis
            // balance_transaction.fee -> on ECRASE uniquement les colonnes
            // de frais (stripe/platform/net cents).
            //
            // WHERE de l'UPDATE : idempotence -> ne touche que si fees=0
            // (= row pas encore enrichie). Si une autre source a deja rempli
            // les fees, on ne reecrase pas.
            //
            // On ne touche PAS payment_status / payment_type / source / etc.
            // (le sync path les a setes sur la base du paiement initial,
            // potentiellement encore plus a jour si le client a confirme).
            await pool.query(
              `INSERT INTO transactions
                 (user_id, type, amount, description, employee_id, payment_method,
                  date, time, datetime_iso, appointment_id, source, locked, qty_total,
                  payment_source, payment_status, payment_type,
                  gross_amount_cents, stripe_fee_cents, platform_fee_cents, net_amount_cents,
                  stripe_payment_intent_id, paid_at)
               VALUES ($1,'revenue',$2,$3,$4,'card_online',$5,$6,$7,$8,'rdv_online',TRUE,1,
                       'online_booking',$9,$10,
                       $11,$12,$13,$14,
                       $15, NOW())
               ON CONFLICT (appointment_id) WHERE source = 'rdv_online'
               DO UPDATE SET
                 stripe_fee_cents   = EXCLUDED.stripe_fee_cents,
                 platform_fee_cents = EXCLUDED.platform_fee_cents,
                 net_amount_cents   = EXCLUDED.net_amount_cents
               WHERE transactions.stripe_fee_cents = 0
                  OR transactions.stripe_fee_cents IS NULL`,
              [apptInfo[0].user_id, amt / 100, desc, empId,
               now.toISOString().substring(0, 10),
               now.toTimeString().substring(0, 8),
               now.toISOString(), upd.rows[0].id,
               v3Status, v3Type,
               grossCents_v3, stripeFeeCents_v3, platformFeeCents_v3, netCents_v3,
               pi.id]
            );
            console.log('[STRIPE FEES UPDATE] source=webhook appt=' + upd.rows[0].id
              + ' pi=' + pi.id
              + ' gross=' + grossCents_v3
              + ' stripe_fee=' + stripeFeeCents_v3
              + ' platform_fee=' + platformFeeCents_v3
              + ' net=' + netCents_v3
              + ' status=' + v3Status);

            // PHASE 2 LEDGER : dual-write 3 entries (payment + commission +
            // stripe_fee). Idempotent via UNIQUE INDEX uq_ledger_pi_entry sur
            // (PI, entry_type). Si replay webhook, ON CONFLICT DO NOTHING.
            // stripe_fee = 0 -> on n'INSERT pas la ligne (fee inconnu encore,
            // sera retro-fille par un script phase 3). commission_rate_snapshot
            // calcule depuis pi.application_fee_amount / gross pour figer le
            // pourcentage au moment du paiement (immune aux changes futurs
            // de users.commission_rate).
            try {
              const { recordLedgerEntry } = require('../utils/ledger');
              const rateSnapshot = grossCents_v3 > 0
                ? Math.round((platformFeeCents_v3 / grossCents_v3) * 10000) / 100
                : null;
              const paymentRes = await recordLedgerEntry(pool, {
                userId: apptInfo[0].user_id,
                appointmentId: upd.rows[0].id,
                entryType: 'payment',
                amountCents: grossCents_v3,
                status: 'pending',
                stripePaymentIntentId: pi.id,
                stripeChargeId: pi.latest_charge || null,
                commissionRateSnapshot: rateSnapshot,
                metadata: { source: 'webhook_pi_succeeded', is_fully_paid: isFullyPaid_v3 },
              });
              if (platformFeeCents_v3 > 0) {
                await recordLedgerEntry(pool, {
                  userId: apptInfo[0].user_id,
                  appointmentId: upd.rows[0].id,
                  entryType: 'commission',
                  amountCents: -platformFeeCents_v3,
                  status: 'pending',
                  stripePaymentIntentId: pi.id,
                  stripeChargeId: pi.latest_charge || null,
                  commissionRateSnapshot: rateSnapshot,
                  relatedLedgerId: paymentRes.id,
                  metadata: { source: 'webhook_pi_succeeded' },
                });
              }
              if (stripeFeeCents_v3 > 0) {
                await recordLedgerEntry(pool, {
                  userId: apptInfo[0].user_id,
                  appointmentId: upd.rows[0].id,
                  entryType: 'stripe_fee',
                  amountCents: -stripeFeeCents_v3,
                  status: 'pending',
                  stripePaymentIntentId: pi.id,
                  stripeChargeId: pi.latest_charge || null,
                  relatedLedgerId: paymentRes.id,
                  metadata: { source: 'webhook_pi_succeeded' },
                });
              }
            } catch (ledgerErr) {
              console.error('[CONNECT WEBHOOK] ledger PI succeeded fail',
                ledgerErr.message || ledgerErr);
            }

            // Invalide le cache stats v3 pour ce user (5min TTL devient
            // immediat -> les routes /api/historique et /api/stats/* re-query).
            try {
              const { invalidateUserStatsCache } = require('../utils/paymentV3');
              invalidateUserStatsCache(apptInfo[0].user_id);
            } catch (cacheErr) {
              // Cache invalidation est best-effort : pas critique si fail
            }
          }
        } catch (txErr) {
          console.error('[CONNECT WEBHOOK] tx insert fail', txErr.message);
        }
      } else {
        console.log('[CONNECT WEBHOOK] payment_intent.succeeded sans RDV (ok si confirme cote front):', pi.id);
      }

      // Race-safe fees update : tourne TOUJOURS, meme si le block ci-dessus
      // a ete skip (cas webhook arrive avant que le sync path book.js ait
      // insere la transaction). Le helper retry apres 2s + idempotent.
      try {
        await ensureFeesUpdated(pool, pi, event.account);
      } catch (feeErr) {
        console.error('[CONNECT WEBHOOK] ensureFeesUpdated fail:', feeErr.message);
      }
    }

    else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      // On marque le RDV (s'il existe) comme failed. Le client peut alors
      // retenter via le frontend. Si pas de RDV cree (echec avant /book),
      // pas d'action — le client retentera ou abandonnera.
      await pool.query(
        `UPDATE appointments
            SET payment_status = 'failed'
          WHERE stripe_payment_intent_id = $1
            AND payment_status NOT IN ('paid','refunded')`,
        [pi.id]
      );
      console.log('[CONNECT WEBHOOK] payment_intent.payment_failed:', pi.id,
        pi.last_payment_error?.message || '');
    }

    else if (event.type === 'charge.refunded') {
      const ch = event.data.object;
      // On retrouve le RDV via le PaymentIntent du charge (payment_intent
      // est sur charge object). Marque payment_status='refunded'.
      //
      // 3 chemins de refund possibles :
      // (a) Client annule dans les delais via /cancel  -> refundAppointment.js
      //     (synchrone) qui INSERT transaction + cancel payout + ce webhook
      //     en backup async (no-op grace a ON CONFLICT et payment_status check).
      // (b) Merchant annule via PUT appointments               -> refundAppointment.js idem.
      // (c) Merchant lance refund directement depuis Stripe Dashboard
      //     (manuel, hors flow FlowIA) -> SEUL ce webhook tourne.
      //
      // Donc ce webhook DOIT mirror tout ce que refundAppointment fait
      // (sauf l'appel API Stripe refund -- deja fait par definition) :
      // 1. UPDATE appointments.payment_status = 'refunded'
      // 2. cancelAppointmentPayout (escrow) -- evite payout vers merchant
      //    apres remboursement client
      // 3. INSERT transactions row 'rdv_refund' (negative) -- visible
      //    /historique, /statistiques, /reglages/paiements performance
      // ON CONFLICT DO NOTHING via index unique idx_transactions_rdv_refund_appt
      // pour eviter le doublon si refundAppointment a deja insere.
      const piId = ch.payment_intent;
      if (piId) {
        const upd = await pool.query(
          `UPDATE appointments
              SET payment_status = 'refunded',
                  updated_at     = NOW()
            WHERE stripe_payment_intent_id = $1
              AND payment_status <> 'refunded'
            RETURNING id, user_id, client_name, employee_id, paid_amount_cents`,
          [piId]
        );
        console.log('[CONNECT WEBHOOK] charge.refunded:', piId,
          upd.rowCount > 0 ? '→ appt ' + upd.rows[0].id : 'sans RDV');

        if (upd.rowCount > 0) {
          const row = upd.rows[0];
          // Cancel le payout en escrow pour eviter le double-debit (client
          // rembourse + merchant paye). Best-effort, log si echec.
          try {
            const { cancelAppointmentPayout } = require('../utils/scheduleAppointmentPayout');
            await cancelAppointmentPayout(pool, row.id, 'webhook_charge_refunded');
          } catch (cancelErr) {
            console.error('[CONNECT WEBHOOK] cancelAppointmentPayout', cancelErr.message);
          }

          // INSERT transaction 'rdv_refund' via le helper partage avec
          // refundAppointment.js (sync path). Lit charge.amount_refunded
          // pour gerer les refunds partiels ; fallback paid_amount_cents
          // de la row appointments si l'event Stripe ne le porte pas.
          const { recordRefundTransaction } = require('../utils/recordRefundTransaction');
          const refundedCents = Number(ch.amount_refunded || row.paid_amount_cents || 0);
          const refundIdFromCharge = ch.refunds?.data?.[0]?.id || null;
          const txRes = await recordRefundTransaction(pool, {
            appointmentId: row.id,
            refundedCents,
            stripeRefundId: refundIdFromCharge,
          });
          if (txRes.inserted) {
            console.log('[CONNECT WEBHOOK] refund tx inserted for appt', row.id, '-', (refundedCents / 100), '€');
          } else if (!txRes.ok) {
            console.error('[CONNECT WEBHOOK] refund tx insert fail', txRes.error);
          }

          // PHASE 2 LEDGER : INSERT refund + mark payment/commission/stripe_fee
          // de ce PI en status='refunded'. Idempotent : si refundAppointment
          // a deja ecrit le ledger (chemin sync), UNIQUE INDEX
          // uq_ledger_refund_entry empeche le doublon ; markRefunded
          // saute les rows deja en 'refunded'.
          try {
            const { recordLedgerEntry, markLedgerEntriesRefunded, findPaymentEntryByPi } = require('../utils/ledger');
            const paymentLedgerId = await findPaymentEntryByPi(pool, piId);
            await recordLedgerEntry(pool, {
              userId: row.user_id,
              appointmentId: row.id,
              entryType: 'refund',
              amountCents: -Math.abs(refundedCents),
              status: 'refunded',
              stripePaymentIntentId: piId,
              stripeChargeId: ch.id || null,
              stripeRefundId: refundIdFromCharge,
              relatedLedgerId: paymentLedgerId,
              metadata: { source: 'webhook_charge_refunded' },
            });
            await markLedgerEntriesRefunded(pool, { stripePaymentIntentId: piId });
          } catch (ledgerErr) {
            console.error('[CONNECT WEBHOOK] ledger refund fail',
              ledgerErr.message || ledgerErr);
          }

          // Refonte v3 : marquer la transaction d'origine 'rdv_online' comme
          // REFUNDED + invalider le cache stats v3.
          await pool.query(
            `UPDATE transactions
                SET payment_status = 'REFUNDED',
                    stripe_refund_id = COALESCE(stripe_refund_id, $2),
                    refunded_at = COALESCE(refunded_at, NOW())
              WHERE appointment_id = $1
                AND source = 'rdv_online'`,
            [row.id, ch.refunds?.data?.[0]?.id || null]
          );
          try {
            const { invalidateUserStatsCache } = require('../utils/paymentV3');
            invalidateUserStatsCache(row.user_id);
          } catch {}
        }
      }
    }

    // ── Refonte v3 : payout.paid / payout.failed ───────────────────────────
    // Stripe envoie ces events pour les transferts bancaires reels (vers
    // l'IBAN du commercant via le compte Connect). On synchronise la table
    // `payouts` et on lie les transactions au stripe_payout_id pour que
    // /historique affiche "Payout reçu" sur les lignes concernees.
    else if (event.type === 'payout.paid' || event.type === 'payout.failed') {
      const po = event.data.object;
      const accountId = event.account;
      // Resoudre user_id via stripe_account_id
      let userId = null;
      if (accountId) {
        const { rows: ur } = await pool.query(
          'SELECT id FROM users WHERE stripe_account_id = $1 LIMIT 1',
          [accountId]
        );
        userId = ur[0]?.id || null;
      }
      if (!userId) {
        console.warn('[CONNECT WEBHOOK] payout sans user_id resolu (account:', accountId, ')');
      } else {
        const isPaid = event.type === 'payout.paid';
        const status = isPaid ? 'paid' : 'failed';
        // UPSERT dans payouts (id stripe_payout_id UNIQUE)
        await pool.query(
          `INSERT INTO payouts
             (user_id, stripe_payout_id, amount_cents, currency, status,
              triggered_by, requested_at, arrival_date, completed_at, failed_at, failure_reason)
           VALUES ($1, $2, $3, $4, $5,
                   COALESCE($6,'stripe'),
                   to_timestamp($7), to_timestamp($8)::date,
                   $9, $10, $11)
           ON CONFLICT (stripe_payout_id) DO UPDATE SET
             status         = EXCLUDED.status,
             arrival_date   = COALESCE(payouts.arrival_date, EXCLUDED.arrival_date),
             completed_at   = COALESCE(EXCLUDED.completed_at, payouts.completed_at),
             failed_at      = COALESCE(EXCLUDED.failed_at, payouts.failed_at),
             failure_reason = COALESCE(EXCLUDED.failure_reason, payouts.failure_reason)`,
          [
            userId,
            po.id,
            po.amount || 0,
            (po.currency || 'eur').toLowerCase(),
            status,
            'stripe',
            po.created || Math.floor(Date.now() / 1000),
            po.arrival_date || (po.created || Math.floor(Date.now() / 1000)),
            isPaid ? new Date() : null,
            !isPaid ? new Date() : null,
            !isPaid ? (po.failure_message || po.failure_code || 'unknown') : null,
          ]
        );

        if (isPaid) {
          // 2 origines possibles pour ce payout :
          // (a) Escrow release par cron releasePayouts : metadata.source =
          //     'flowia_escrow_release' + metadata.appointment_id -> on lie
          //     PRECISEMENT la (les) transaction(s) de cet appointment, pas
          //     les autres (sinon attribution erronee a un mauvais payout).
          // (b) Payout manuel par le merchant via /api/stripe/payout/create
          //     (vide tout le balance) : pas de metadata.appointment_id
          //     -> heuristique cutoff = toutes tx 'rdv_online'/'rdv_refund'
          //     non encore liees, anterieures a po.created. Correct pour
          //     un payout full-balance.
          const isEscrowRelease = po.metadata?.source === 'flowia_escrow_release';
          const apptIdFromMeta  = po.metadata?.appointment_id || null;

          if (isEscrowRelease && apptIdFromMeta) {
            const upd = await pool.query(
              `UPDATE transactions
                  SET payout_received_at = NOW(),
                      stripe_payout_id   = $2
                WHERE user_id = $1
                  AND appointment_id = $3
                  AND payout_received_at IS NULL
                  AND source IN ('rdv_online','rdv_refund')
                RETURNING id`,
              [userId, po.id, apptIdFromMeta]
            );
            console.log('[CONNECT WEBHOOK] payout.paid escrow: stripe_payout=' + po.id
              + ' appt=' + apptIdFromMeta + ' user=' + userId
              + ' tx_lies=' + upd.rowCount + ' amount=' + ((po.amount || 0) / 100) + '€');
          } else {
            // Payout manuel : heuristique cutoff sur created_at.
            const cutoff = new Date((po.created || Math.floor(Date.now() / 1000)) * 1000);
            const upd = await pool.query(
              `UPDATE transactions
                  SET payout_received_at = NOW(),
                      stripe_payout_id   = $2
                WHERE user_id = $1
                  AND payout_received_at IS NULL
                  AND created_at <= $3
                  AND source IN ('rdv_online','rdv_refund')
                RETURNING id`,
              [userId, po.id, cutoff]
            );
            console.log('[CONNECT WEBHOOK] payout.paid manuel: stripe_payout=' + po.id
              + ' user=' + userId + ' tx_lies=' + upd.rowCount
              + ' amount=' + ((po.amount || 0) / 100) + '€');
          }

          // PHASE 2 LEDGER : INSERT payout_paid (informationnel) +
          // UPDATE status='paid' sur entries lifecycle. 2 branches en
          // miroir des UPDATE transactions ci-dessus.
          try {
            const { recordLedgerEntry, updateLedgerStatusForPayout } = require('../utils/ledger');
            await recordLedgerEntry(pool, {
              userId,
              appointmentId: apptIdFromMeta,
              entryType: 'payout_paid',
              amountCents: po.amount || 0,
              status: 'paid',
              stripePayoutId: po.id,
              metadata: {
                source: isEscrowRelease ? 'webhook_escrow_release' : 'webhook_manual_payout',
                arrival_date: po.arrival_date || null,
              },
            });
            if (isEscrowRelease && apptIdFromMeta) {
              await updateLedgerStatusForPayout(pool, {
                appointmentId: apptIdFromMeta,
                stripePayoutId: po.id,
                newStatus: 'paid',
              });
            } else {
              // Payout manuel : on update les entries de ce user avant cutoff,
              // pas encore liees a un payout, en status 'paid' + stamp payout_id.
              // Restrictif : seules payment/commission/stripe_fee non encore liees.
              const cutoffTs = new Date((po.created || Math.floor(Date.now() / 1000)) * 1000);
              await pool.query(`
                UPDATE financial_ledger
                   SET status = 'paid',
                       stripe_payout_id = COALESCE(stripe_payout_id, $2)
                 WHERE user_id = $1
                   AND occurred_at <= $3
                   AND stripe_payout_id IS NULL
                   AND entry_type IN ('payment','commission','stripe_fee')
                   AND status IN ('pending','available','locked')
              `, [userId, po.id, cutoffTs]);
            }
          } catch (ledgerErr) {
            console.error('[CONNECT WEBHOOK] ledger payout.paid fail',
              ledgerErr.message || ledgerErr);
          }
        } else {
          const failureMsg = po.failure_message || po.failure_code || 'unknown';
          console.log('[CONNECT WEBHOOK] payout.failed: stripe_payout=' + po.id
            + ' user=' + userId + ' reason=' + failureMsg);

          // Sync appointment_payouts : revenir a status='failed' pour
          // alerter l'admin (sinon la row reste en 'released' alors que le
          // virement Stripe a echoue -> divergence DB/realite).
          // 2 chemins : (a) escrow release identifie par metadata, sinon
          // (b) match large par stripe_payout_id (defensif).
          try {
            const apptIdMeta = po.metadata?.appointment_id || null;
            if (apptIdMeta) {
              const updAp = await pool.query(
                `UPDATE appointment_payouts
                    SET status = 'failed',
                        stripe_error_message = $3,
                        updated_at = NOW()
                  WHERE appointment_id = $1
                    AND stripe_payout_id = $2
                  RETURNING id`,
                [apptIdMeta, po.id, failureMsg]
              );
              console.log('[CONNECT WEBHOOK] payout.failed -> appointment_payouts.status=failed appt='
                + apptIdMeta + ' rows=' + updAp.rowCount);
            } else {
              // Fallback : match par stripe_payout_id seul (cas payout
              // manuel ou metadata corrompue).
              const updAp = await pool.query(
                `UPDATE appointment_payouts
                    SET status = 'failed',
                        stripe_error_message = $2,
                        updated_at = NOW()
                  WHERE stripe_payout_id = $1
                  RETURNING id, appointment_id`,
                [po.id, failureMsg]
              );
              if (updAp.rowCount > 0) {
                console.log('[CONNECT WEBHOOK] payout.failed -> appointment_payouts.status=failed (fallback) rows='
                  + updAp.rowCount);
              }
            }
          } catch (syncErr) {
            console.error('[CONNECT WEBHOOK] payout.failed sync appointment_payouts fail:',
              syncErr.message);
          }

          // PHASE 2 LEDGER : UPDATE status='failed' sur entries lifecycle
          // de l'appointment (si metadata) ou via stripe_payout_id fallback.
          // Pas d'INSERT payout_paid (logique : payout n'a PAS abouti).
          try {
            const { updateLedgerStatusForPayout } = require('../utils/ledger');
            const apptIdMeta = po.metadata?.appointment_id || null;
            await updateLedgerStatusForPayout(pool, {
              appointmentId: apptIdMeta,
              stripePayoutId: po.id,
              newStatus: 'failed',
              failureMessage: failureMsg,
            });
          } catch (ledgerErr) {
            console.error('[CONNECT WEBHOOK] ledger payout.failed fail',
              ledgerErr.message || ledgerErr);
          }

          // Email d'alerte au commercant. Best-effort sync (emailSender deja
          // resilient ; pas de reject pour ne pas casser le webhook).
          try {
            const { sendMarketingEmailRaw } = require('../utils/emailSender');
            const { rows: ur2 } = await pool.query(
              'SELECT email, business_name FROM users WHERE id = $1',
              [userId]
            );
            if (ur2[0]?.email) {
              const reason = po.failure_message || po.failure_code || 'raison inconnue';
              const amountEur = ((po.amount || 0) / 100).toFixed(2).replace('.', ',');
              await sendMarketingEmailRaw({
                to:          ur2[0].email,
                toName:      ur2[0].business_name || '',
                subject:     `[FlowIA] Echec virement Stripe — ${amountEur} EUR`,
                type:        'transactional',
                htmlContent: `<p>Bonjour ${ur2[0].business_name || ''},</p>
                              <p>Le virement Stripe de <b>${amountEur} EUR</b> vers votre compte bancaire a echoue.</p>
                              <p><b>Raison :</b> ${reason}</p>
                              <p>Connectez-vous a votre dashboard Stripe pour verifier vos coordonnees bancaires et relancer le virement manuellement.</p>
                              <p>L'equipe FlowIA</p>`,
              });
            }
          } catch (mailErr) {
            console.error('[CONNECT WEBHOOK] payout.failed email fail:', mailErr.message);
          }
        }

        try {
          const { invalidateUserStatsCache } = require('../utils/paymentV3');
          invalidateUserStatsCache(userId);
        } catch {}
      }
    }
  } catch (e) {
    outerError = e;
    console.error('[CONNECT WEBHOOK ERR]', event.type, 'event=' + event.id,
      'message=' + e.message, 'stack=' + (e.stack ? e.stack.split('\n')[1] : ''));
  }

  // Si processing OK : marquer event comme traite (idempotent ON CONFLICT)
  // puis 200. Si non : 500 -> Stripe retentera (idempotent operations
  // garantissent que le re-run ne corrompt rien).
  if (!outerError) {
    try {
      await pool.query(
        `INSERT INTO processed_stripe_events (event_id, event_type, source)
         VALUES ($1, $2, 'connect')
         ON CONFLICT (event_id) DO NOTHING`,
        [event.id, event.type]
      );
    } catch (markErr) {
      // Si le mark fail (deja insere par un retry parallele, ou DB transiente),
      // on log mais on repond quand meme 200 — re-process serait idempotent.
      console.warn('[CONNECT WEBHOOK] mark processed fail (non-blocking):',
        event.id, markErr.message);
    }
    return res.json({ received: true });
  }

  // Erreur critique : on n'insert PAS dans processed_stripe_events pour
  // permettre a Stripe de retenter (Stripe retry exponentiel jusqu'a 3j).
  return res.status(500).json({
    error: 'webhook processing failed',
    event_id: event.id,
    event_type: event.type,
    message: outerError.message,
  });
});

module.exports = router;
