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

module.exports = {
  getPerformanceStatsFromLedger,
};
