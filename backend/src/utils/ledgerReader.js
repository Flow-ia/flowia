// utils/ledgerReader.js — phase 4 du refactor ledger.
//
// Lectures de financial_ledger pour brancher progressivement les endpoints
// UI (dual-read). CHAQUE fonction retourne le MEME shape que l'endpoint
// legacy correspondant, pour permettre une comparaison field-by-field et
// une bascule sans toucher au frontend.
//
// Pattern : appelee par utils/dualRead. Si la fonction throw, le caller
// fallback automatiquement sur le legacy (pas de degradation UI).

/**
 * Stats performance paiements en ligne sur periode glissante (7/30/90j).
 * Shape de retour identique a GET /api/stripe-connect/performance-stats.
 *
 * Note: les compteurs no_show / cancelled_* dependent de `appointments`
 * (pas du ledger) — ils restent calcules cote endpoint via le legacy
 * et sont fusionnes au resultat. Cette fonction ne retourne que les
 * KPI financiers comparables.
 *
 * @returns {Promise<{
 *   period_days, online_paid_count, gross_revenue_cents,
 *   refund_count, refund_amount_cents, net_revenue_cents
 * }>}
 */
async function getPerformanceStatsFromLedger(pool, userId, periodDays) {
  // Le ledger stocke commission/stripe_fee/refund avec amount_cents NEGATIF.
  // gross_revenue = SUM(payment) sur la periode (positif).
  // refund_amount = -SUM(refund) (refund est negatif -> on inverse).
  // net_revenue   = gross + commission + stripe_fee + refund (commission +
  //                 stripe_fee + refund sont negatifs => addition).
  //                 Equivalent legacy : gross - refund (sans soustraire
  //                 commission/stripe_fee qui ne sortent pas du compte
  //                 merchant en direct charges -- ils sont preleves a la
  //                 source par Stripe). Pour matcher le shape legacy, on
  //                 calcule net_revenue = gross - refund (pas commission/fee).
  const { rows } = await pool.query(`
    SELECT
      COALESCE(SUM(amount_cents) FILTER (WHERE entry_type='payment'), 0)::bigint AS gross_cents,
      COALESCE(SUM(amount_cents) FILTER (WHERE entry_type='refund'),  0)::bigint AS refund_signed_cents,
      COUNT(*) FILTER (WHERE entry_type='payment') AS payment_count,
      COUNT(*) FILTER (WHERE entry_type='refund')  AS refund_count
      FROM financial_ledger
     WHERE user_id = $1
       AND occurred_at >= NOW() - ($2 || ' days')::interval
  `, [userId, String(periodDays)]);

  const gross  = Number(rows[0]?.gross_cents || 0);
  // refund stocke en negatif -> ABS pour matcher le legacy qui retourne positif.
  const refundAmount = Math.abs(Number(rows[0]?.refund_signed_cents || 0));

  return {
    period_days:          periodDays,
    online_paid_count:    parseInt(rows[0]?.payment_count || 0, 10),
    gross_revenue_cents:  gross,
    refund_count:         parseInt(rows[0]?.refund_count || 0, 10),
    refund_amount_cents:  refundAmount,
    net_revenue_cents:    gross - refundAmount,
  };
}

/**
 * Liste des payouts (escrow) + summary, shape identique a
 * GET /api/stripe-connect/payouts.
 *
 * Strategie : ledger entries payout_hold contiennent appointment_id, appointment_payout_id,
 * status, stripe_payout_id, recorded_at. On JOIN sur appointments + booking_services
 * pour recuperer les details affichables (client_name, date, service).
 *
 * Mapping status ledger -> status legacy (appointment_payouts) :
 *   - locked (en escrow)        -> 'pending'  (pas encore release)
 *   - locked (avec payout_id)   -> 'released' (payout Stripe cree)
 *   - paid                      -> 'released' (legacy n'a pas 'paid', reste 'released')
 *   - refunded                  -> 'cancelled' (annulation/refund)
 *   - failed                    -> 'failed'
 *
 * @param {object} pool pg Pool
 * @param {string} userId UUID
 * @param {string|null} statusFilter optionnel 'pending'|'released'|'cancelled'|'failed'
 */
async function getPayoutsFromLedger(pool, userId, statusFilter) {
  // Mapping status filter legacy -> conditions ledger.
  const statusMap = {
    pending:   "fl.status = 'locked' AND fl.stripe_payout_id IS NULL",
    released:  "(fl.status = 'locked' AND fl.stripe_payout_id IS NOT NULL) OR fl.status = 'paid'",
    cancelled: "fl.status = 'refunded'",
    failed:    "fl.status = 'failed'",
  };
  const params = [userId];
  let whereStatus = '';
  if (statusFilter && statusMap[statusFilter]) {
    whereStatus = ` AND (${statusMap[statusFilter]})`;
  }
  const { rows } = await pool.query(`
    SELECT
      fl.appointment_payout_id AS id,
      fl.appointment_id,
      fl.amount_cents,
      ap.release_at,
      ap.released_at,
      CASE
        WHEN fl.status = 'locked' AND fl.stripe_payout_id IS NULL THEN 'pending'
        WHEN fl.status = 'locked' AND fl.stripe_payout_id IS NOT NULL THEN 'released'
        WHEN fl.status = 'paid' THEN 'released'
        WHEN fl.status = 'refunded' THEN 'cancelled'
        WHEN fl.status = 'failed' THEN 'failed'
        ELSE fl.status
      END AS status,
      ap.cancelled_reason,
      fl.recorded_at AS created_at,
      fl.stripe_payout_id,
      a.client_name,
      a.date       AS appt_date,
      a.start_time AS appt_time,
      COALESCE(s.name, '') AS service_name
      FROM financial_ledger fl
      LEFT JOIN appointment_payouts ap ON ap.id = fl.appointment_payout_id
      LEFT JOIN appointments a         ON a.id = fl.appointment_id
      LEFT JOIN booking_services s     ON s.id = a.service_id
     WHERE fl.user_id = $1
       AND fl.entry_type = 'payout_hold'
       ${whereStatus}
     ORDER BY
       CASE
         WHEN fl.status = 'locked' AND fl.stripe_payout_id IS NULL THEN 1
         WHEN fl.status = 'failed' THEN 2
         WHEN fl.status = 'locked' AND fl.stripe_payout_id IS NOT NULL THEN 3
         WHEN fl.status = 'paid' THEN 3
         WHEN fl.status = 'refunded' THEN 4
         ELSE 5
       END,
       ap.release_at ASC NULLS LAST,
       fl.recorded_at ASC
     LIMIT 200
  `, params);

  // Summary agrege sur tout l'historique ledger payout_hold.
  const { rows: agg } = await pool.query(`
    SELECT
      COALESCE(SUM(amount_cents) FILTER (
        WHERE entry_type='payout_hold' AND status='locked' AND stripe_payout_id IS NULL
      ), 0)::bigint AS pending_cents,
      COUNT(*) FILTER (
        WHERE entry_type='payout_hold' AND status='locked' AND stripe_payout_id IS NULL
      )::int AS pending_count,
      COUNT(*) FILTER (
        WHERE entry_type='payout_hold' AND (
          (status='locked' AND stripe_payout_id IS NOT NULL) OR status='paid'
        )
      )::int AS released_count
      FROM financial_ledger
     WHERE user_id = $1
  `, [userId]);

  return {
    payouts: rows,
    summary: {
      pending_cents:  parseInt(agg[0]?.pending_cents || 0, 10),
      pending_count:  agg[0]?.pending_count || 0,
      released_count: agg[0]?.released_count || 0,
    },
  };
}

/**
 * Balance estimee depuis le ledger (= net merchant non encore payoute).
 * Shape compatible avec GET /api/stripe-connect/balance :
 *   { available_cents, pending_cents, currency, connected }
 *
 * IMPORTANT : Stripe Balance API reste la source de verite pour la balance
 * LIVE (settlement Stripe-side, refunds reflechis immediats). Le ledger
 * peut DIVERGER pour des raisons legitimes (timing settlement Stripe ~5-7j,
 * fees stripe pas encore connus, etc.). C'est pourquoi le dual-read sur
 * /balance utilise une tolerance enorme et n'emet pas de drift sur cette
 * route — le badge sert uniquement a visualiser les 2 sources cote a cote.
 *
 * Mapping :
 *   - pending_cents = net non encore payoute = SUM(net) WHERE status='pending'
 *     net = payment + commission(-) + stripe_fee(-) + refund(-) (BIGINT signe)
 *   - available_cents = en cours de virement = SUM(net) WHERE status='locked'
 *     (= Stripe payout cree, pas encore confirme par webhook payout.paid)
 */
async function getBalanceFromLedger(pool, userId) {
  const { rows: ur } = await pool.query(
    'SELECT stripe_account_id FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  const connected = !!ur[0]?.stripe_account_id;

  const { rows } = await pool.query(`
    SELECT
      COALESCE(SUM(amount_cents) FILTER (
        WHERE status = 'pending'
          AND entry_type IN ('payment','commission','stripe_fee','refund')
      ), 0)::bigint AS pending_cents,
      COALESCE(SUM(amount_cents) FILTER (
        WHERE status = 'locked'
          AND entry_type IN ('payment','commission','stripe_fee','refund')
      ), 0)::bigint AS locked_cents
      FROM financial_ledger
     WHERE user_id = $1
  `, [userId]);

  return {
    available_cents: parseInt(rows[0]?.locked_cents || 0, 10),
    pending_cents:   parseInt(rows[0]?.pending_cents || 0, 10),
    currency:        'eur',
    connected,
  };
}

/**
 * Totaux paiements en ligne + refunds depuis le ledger, sur fenetre date.
 * Sert au dual-read /historique et /transactions qui retournent un
 * shape complet legacy + des sous-totaux comparables.
 *
 * @returns {Promise<{
 *   en_ligne_cents:  bigint,
 *   en_ligne_count:  int,
 *   refunded_cents:  bigint,
 *   refunded_count:  int
 * }>}
 */
async function getOnlineTotalsFromLedger(pool, userId, dateFrom, dateTo) {
  // dateFrom / dateTo : DATE strings 'YYYY-MM-DD' inclusives.
  const { rows } = await pool.query(`
    SELECT
      COALESCE(SUM(amount_cents) FILTER (WHERE entry_type='payment'),0)::bigint AS en_ligne_cents,
      COUNT(*) FILTER (WHERE entry_type='payment') AS en_ligne_count,
      COALESCE(ABS(SUM(amount_cents) FILTER (WHERE entry_type='refund')),0)::bigint AS refunded_cents,
      COUNT(*) FILTER (WHERE entry_type='refund') AS refunded_count
      FROM financial_ledger
     WHERE user_id = $1
       AND occurred_at::date >= $2::date
       AND occurred_at::date <= $3::date
  `, [userId, dateFrom, dateTo]);
  return {
    en_ligne_cents: parseInt(rows[0]?.en_ligne_cents || 0, 10),
    en_ligne_count: parseInt(rows[0]?.en_ligne_count || 0, 10),
    refunded_cents: parseInt(rows[0]?.refunded_cents || 0, 10),
    refunded_count: parseInt(rows[0]?.refunded_count || 0, 10),
  };
}

/**
 * KPI paiements en ligne globaux pour le dashboard /statistiques.
 * Periode glissante exprimee en jours (e.g. 7, 30, 90, 365).
 * Shape inspire de /stats/online-payments mais minimaliste : ne couvre
 * que les champs comparables financiers. Les KPI annulations / no-show
 * restent calcules cote legacy depuis appointments.
 */
async function getOnlineStatsFromLedger(pool, userId, periodDays) {
  const { rows } = await pool.query(`
    SELECT
      COALESCE(SUM(amount_cents) FILTER (WHERE entry_type='payment'),0)::bigint AS gross_cents,
      COALESCE(SUM(amount_cents) FILTER (WHERE entry_type='commission'),0)::bigint AS commission_signed,
      COALESCE(SUM(amount_cents) FILTER (WHERE entry_type='stripe_fee'),0)::bigint AS stripe_fee_signed,
      COALESCE(SUM(amount_cents) FILTER (WHERE entry_type='refund'),0)::bigint AS refund_signed,
      COUNT(*) FILTER (WHERE entry_type='payment') AS payment_count,
      COUNT(*) FILTER (WHERE entry_type='refund')  AS refund_count
      FROM financial_ledger
     WHERE user_id = $1
       AND occurred_at >= NOW() - ($2 || ' days')::interval
  `, [userId, String(periodDays)]);
  const gross   = parseInt(rows[0]?.gross_cents || 0, 10);
  const commission = Math.abs(parseInt(rows[0]?.commission_signed || 0, 10));
  const stripeFee  = Math.abs(parseInt(rows[0]?.stripe_fee_signed || 0, 10));
  const refund     = Math.abs(parseInt(rows[0]?.refund_signed || 0, 10));
  return {
    period_days:         periodDays,
    gross_revenue_cents: gross,
    commission_cents:    commission,
    stripe_fee_cents:    stripeFee,
    refund_amount_cents: refund,
    net_revenue_cents:   gross - refund,         // net merchant brut (avant fees)
    net_after_fees_cents: gross - refund - commission - stripeFee,
    payment_count:       parseInt(rows[0]?.payment_count || 0, 10),
    refund_count:        parseInt(rows[0]?.refund_count || 0, 10),
  };
}

/**
 * Sous-totaux comparables pour /stats/online-payments sur fenetre date.
 * Le legacy filtre EFFECTIVE_PAYMENT_STATUS IN ('STRIPE_100','STRIPE_ACOMPTE')
 * = exclut REFUNDED du brut. Cote ledger, equivalent = filtrer
 * status NOT IN ('refunded','failed') sur les payment/commission/stripe_fee.
 *
 * @returns {Promise<{
 *   gross_cents:        bigint,
 *   count:              int,
 *   stripe_fee_cents:   bigint,
 *   platform_fee_cents: bigint,
 *   net_cents:          bigint,
 *   refunded_cents:     bigint,
 *   refunded_count:     int
 * }>}
 */
async function getOnlineSummaryByDateFromLedger(pool, userId, dateFrom, dateTo) {
  const { rows } = await pool.query(`
    SELECT
      COALESCE(SUM(amount_cents) FILTER (
        WHERE entry_type='payment' AND status NOT IN ('refunded','failed')
      ),0)::bigint AS gross,
      COUNT(*) FILTER (
        WHERE entry_type='payment' AND status NOT IN ('refunded','failed')
      )::int AS count,
      COALESCE(ABS(SUM(amount_cents) FILTER (
        WHERE entry_type='stripe_fee' AND status NOT IN ('refunded','failed')
      )),0)::bigint AS stripe_fee,
      COALESCE(ABS(SUM(amount_cents) FILTER (
        WHERE entry_type='commission' AND status NOT IN ('refunded','failed')
      )),0)::bigint AS platform_fee,
      COALESCE(ABS(SUM(amount_cents) FILTER (WHERE entry_type='refund')),0)::bigint AS refunded_cents,
      COUNT(*) FILTER (WHERE entry_type='refund')::int AS refunded_count
      FROM financial_ledger
     WHERE user_id = $1
       AND occurred_at::date >= $2::date
       AND occurred_at::date <= $3::date
  `, [userId, dateFrom, dateTo]);
  const r = rows[0] || {};
  const gross    = parseInt(r.gross || 0, 10);
  const stripeFee = parseInt(r.stripe_fee || 0, 10);
  const platformFee = parseInt(r.platform_fee || 0, 10);
  return {
    gross_cents:        gross,
    count:              parseInt(r.count || 0, 10),
    stripe_fee_cents:   stripeFee,
    platform_fee_cents: platformFee,
    net_cents:          gross - stripeFee - platformFee,
    refunded_cents:     parseInt(r.refunded_cents || 0, 10),
    refunded_count:     parseInt(r.refunded_count || 0, 10),
  };
}

module.exports = {
  getPerformanceStatsFromLedger,
  getPayoutsFromLedger,
  getBalanceFromLedger,
  getOnlineTotalsFromLedger,
  getOnlineStatsFromLedger,
  getOnlineSummaryByDateFromLedger,
};
