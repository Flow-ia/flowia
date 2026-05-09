// utils/paymentV3.js — Helpers partages pour le modele paiement v3
// (4 sources / 6 statuts). Utilise par /api/historique, /api/stats/*,
// /api/payouts pour deriver les valeurs v3 a la volee si une transaction
// n'a pas encore ete classifiee par le retro-fill (typique pour les
// nouvelles rows inserees par les routes legacy entre 2 boots backend).

// Fragment SQL : derive payment_status v3 depuis le legacy source / appointment_id
// quand transactions.payment_status IS NULL. A inclure dans les SELECT.
//
// Mapping :
//   source='rdv_online'  -> STRIPE_100      (acompte detecte separement via metadata)
//   source='rdv_refund'  -> REFUNDED
//   source IN (rdv,manual) AND appointment_id IS NOT NULL -> CASH_PAID
//   appointment_id IS NULL AND type='revenue' -> CASH_PAID (walk-in)
const EFFECTIVE_PAYMENT_STATUS_SQL = `
  COALESCE(
    t.payment_status,
    CASE
      WHEN t.source = 'rdv_online'                               THEN 'STRIPE_100'
      WHEN t.source = 'rdv_refund'                               THEN 'REFUNDED'
      WHEN t.source IN ('rdv','manual') AND t.appointment_id IS NOT NULL THEN 'CASH_PAID'
      WHEN t.appointment_id IS NULL AND t.type = 'revenue'       THEN 'CASH_PAID'
      ELSE NULL
    END
  )
`;

// Fragment SQL : derive payment_source v3 depuis le legacy source / appointment_id
const EFFECTIVE_PAYMENT_SOURCE_SQL = `
  COALESCE(
    t.payment_source,
    CASE
      WHEN t.source IN ('rdv_online','rdv_refund')               THEN 'online_booking'
      WHEN t.source IN ('rdv','manual') AND t.appointment_id IS NOT NULL THEN 'cash_register_rdv'
      WHEN t.appointment_id IS NULL AND t.type = 'revenue'       THEN 'walkin'
      ELSE NULL
    END
  )
`;

// Fragment SQL : montant brut en cents. Prefere gross_amount_cents (rempli par
// le retro-fill ou les nouveaux webhooks v3), fallback ROUND(amount * 100)
// pour les rows non encore migrees ou inserees par les routes legacy.
const EFFECTIVE_GROSS_CENTS_SQL = `
  COALESCE(t.gross_amount_cents, ROUND(t.amount * 100)::INTEGER)
`;
const EFFECTIVE_NET_CENTS_SQL = `
  COALESCE(
    t.net_amount_cents,
    ROUND(t.amount * 100)::INTEGER - COALESCE(t.stripe_fee_cents, 0) - COALESCE(t.platform_fee_cents, 0)
  )
`;

// Resout une periode en {from, to} (DATE strings YYYY-MM-DD).
// Accepte period IN ('today','week','month','custom') + date_from/date_to.
// Defaut : month (30 derniers jours).
function resolvePeriodRange(period, dateFrom, dateTo) {
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const isValidDate = s => typeof s === 'string' && DATE_RE.test(s);

  if (period === 'custom' && isValidDate(dateFrom) && isValidDate(dateTo)) {
    return { from: dateFrom, to: dateTo };
  }
  const now = new Date();
  const today = now.toISOString().substring(0, 10);
  if (period === 'today') return { from: today, to: today };
  if (period === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: from.toISOString().substring(0, 10), to: today };
  }
  // month / default
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().substring(0, 10), to: today };
}

// Retourne {prevFrom, prevTo} de la periode equivalente immediatement
// precedente (pour calcul vs_previous_period_pct).
function previousPeriodRange(from, to) {
  const fromD = new Date(from);
  const toD   = new Date(to);
  const days  = Math.max(1, Math.round((toD - fromD) / 86400000) + 1);
  const prevTo   = new Date(fromD); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return {
    prevFrom: prevFrom.toISOString().substring(0, 10),
    prevTo:   prevTo.toISOString().substring(0, 10),
  };
}

// Cache wrapper sur global.memCache : 5 min TTL par defaut, scope par
// (userId, key suffix). Invalidation via versioning : bumper la version d'un
// user rend toutes ses clefs cachees inaccessibles (les anciennes expirent
// naturellement au TTL). Plus robuste que del par enumeration des clefs
// (memCache n'expose pas .keys() pour scanner par prefixe).
//
// Cluster-safety : chaque worker a sa propre Map userCacheVersion. Quand un
// webhook arrive, il est route vers UN worker qui bump sa version locale.
// Les autres workers servent des donnees stale jusqu'au TTL (max 5 min).
// Acceptable pour des stats. Pour un strict cluster-wide invalidation il
// faudrait Redis pub/sub (out of scope).
const STATS_CACHE_TTL_MS = 5 * 60 * 1000;
const STATS_CACHE_PREFIX = 'statsv3:';
const userCacheVersion = new Map(); // userId -> int

function getUserCacheVersion(userId) {
  return userCacheVersion.get(userId) || 0;
}

function statsCacheGet(userId, suffix) {
  if (!global.memCache) return null;
  const v = getUserCacheVersion(userId);
  return global.memCache.get(`${STATS_CACHE_PREFIX}${userId}:v${v}:${suffix}`);
}
function statsCacheSet(userId, suffix, data, ttlMs = STATS_CACHE_TTL_MS) {
  if (!global.memCache) return;
  const v = getUserCacheVersion(userId);
  global.memCache.set(`${STATS_CACHE_PREFIX}${userId}:v${v}:${suffix}`, data, ttlMs);
}
function invalidateUserStatsCache(userId) {
  if (!userId) return;
  userCacheVersion.set(userId, getUserCacheVersion(userId) + 1);
}

module.exports = {
  EFFECTIVE_PAYMENT_STATUS_SQL,
  EFFECTIVE_PAYMENT_SOURCE_SQL,
  EFFECTIVE_GROSS_CENTS_SQL,
  EFFECTIVE_NET_CENTS_SQL,
  resolvePeriodRange,
  previousPeriodRange,
  statsCacheGet,
  statsCacheSet,
  invalidateUserStatsCache,
  STATS_CACHE_TTL_MS,
};
