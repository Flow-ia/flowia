// routes/campaigns.js — Campagnes SMS + Email Marketing
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { requireFeature } = require('../middleware/requireFeature');
const { requirePlan } = require('../middleware/subscription');
const { sendSMS, sleep, chunk, SMS_COST, SMS_PRICE } = require('../utils/messenger');
const { sendMarketingEmail } = require('../utils/emailSender');
const { appendUnsubscribeSms } = require('../utils/unsubscribe');
// Commit 30 — quota emails marketing unifié, source unique de vérité.
const {
  checkUserEmailQuota,
  incrUserEmailCount,
  EMAIL_DAILY_LIMIT_USER,
  EMAIL_MONTHLY_LIMIT_USER,
} = require('../utils/email');
const router = express.Router();

// Toutes les routes nécessitent une authentification commerçant
router.use(authMiddleware);
router.use(requireFeature('campaigns'));

// ── Constantes (alias pour rétrocompat code existant) ────────────────────────
const EMAIL_DAILY_LIMIT   = EMAIL_DAILY_LIMIT_USER;
const EMAIL_MONTHLY_LIMIT = EMAIL_MONTHLY_LIMIT_USER;
const EMAIL_MARKETING_MAX = EMAIL_DAILY_LIMIT_USER;

// ── Helpers ─────────────────────────────────────────────────────────────────

// ── Scoring RFM (Recency · Frequency · Monetary) ─────────────────────────────
// Chaque client reçoit un score combiné basé sur :
//   • Fréquence   : total_visits (passages cumulés)   → poids 3
//   • Monétaire   : total_spent (CA total généré)      → poids 0.5
//   • RDV payés   : appointments.status='completed'    → poids 2
//   • Récence     : jours depuis dernière visite       → bonus 0-30 (récent = mieux)
// Les poids sont choisis pour qu'un client fidèle récent score haut, et qu'un
// client dormant chute même s'il a dépensé. LATERAL JOIN = 1 requête unique.
async function getTopClients(userId, limit, needPhone, needEmail) {
  let conds = [`ca.user_id = $1`];
  // Audit Z (RGPD) : filtrage opt-in marketing explicite.
  conds.push(`ca.marketing_opt_in = TRUE`);
  if (needPhone) conds.push(`ca.phone IS NOT NULL AND ca.phone != ''`);
  if (needEmail) conds.push(`ca.email IS NOT NULL AND ca.email != '' AND ca.email LIKE '%@%'`);

  const { rows } = await pool.query(`
    SELECT
      ca.id, ca.email, ca.phone, ca.first_name, ca.last_name,
      ca.unsubscribe_token,
      COALESCE(ca.total_visits, 0)      AS visits,
      COALESCE(ca.total_spent, 0)::float AS spent,
      COALESCE(stats.paid_appts, 0)     AS paid_appts,
      stats.last_visit,
      (
        COALESCE(ca.total_visits, 0) * 3.0
        + COALESCE(ca.total_spent, 0)::float * 0.5
        + COALESCE(stats.paid_appts, 0) * 2.0
        + GREATEST(0, 30 - LEAST(365, COALESCE(
            EXTRACT(DAY FROM (NOW() - stats.last_visit))::int,
            365
          )) / 12.0)
      ) AS score
    FROM client_accounts ca
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE a.status = 'completed') AS paid_appts,
        MAX(a.date)                                     AS last_visit
      FROM appointments a
      WHERE a.user_id = ca.user_id AND LOWER(a.client_email) = LOWER(ca.email)
    ) stats ON TRUE
    WHERE ${conds.join(' AND ')}
    ORDER BY score DESC, ca.total_spent DESC NULLS LAST
    LIMIT $2
  `, [userId, limit]);
  return rows;
}

// Commit 30 — délégué au helper unifié `utils/email.js → checkUserEmailQuota`.
// Préservé comme alias pour les call-sites existants. Source unique de vérité :
// `users.email_sent_today` + `email_sent_month` (BDD, cluster-safe).
const checkEmailQuota = checkUserEmailQuota;

// ── Segmentation 5 classes (champion/fidele/prometteur/risque/perdu) ─────────
// Anti-spam: exclut par défaut les clients ayant reçu un SMS dans les 7 derniers jours
async function getClientSegments(userId, excludeRecentSms = true) {
  const { rows } = await pool.query(`
    WITH avg_spent AS (
      SELECT COALESCE(AVG(total_spent), 0) AS avg_val
      FROM client_accounts WHERE user_id = $1
    )
    SELECT
      ca.id, ca.first_name, ca.last_name, ca.phone, ca.email,
      ca.unsubscribe_token,
      COALESCE(ca.total_visits, 0)::int    AS visits,
      COALESCE(ca.total_spent, 0)::float   AS spent,
      stats.last_visit,
      CASE
        WHEN stats.last_visit IS NULL OR stats.last_visit < (CURRENT_DATE - INTERVAL '90 days') THEN 'perdu'
        WHEN stats.last_visit < (CURRENT_DATE - INTERVAL '30 days') THEN 'risque'
        WHEN COALESCE(ca.total_visits,0) >= 5
             AND COALESCE(ca.total_spent,0) > (SELECT avg_val*2 FROM avg_spent) THEN 'champion'
        WHEN COALESCE(ca.total_visits,0) >= 3 THEN 'fidele'
        ELSE 'prometteur'
      END AS segment
    FROM client_accounts ca
    LEFT JOIN LATERAL (
      SELECT MAX(a.date) AS last_visit
      FROM appointments a
      WHERE a.user_id = ca.user_id
        AND LOWER(COALESCE(a.client_email,'')) = LOWER(COALESCE(ca.email,''))
    ) stats ON TRUE
    WHERE ca.user_id = $1
      AND ca.phone IS NOT NULL AND ca.phone != ''
      AND ca.marketing_opt_in = TRUE
      ${excludeRecentSms ? `AND NOT EXISTS (
        SELECT 1 FROM message_log ml
        WHERE ml.user_id = ca.user_id AND ml.phone = ca.phone
          AND ml.channel = 'sms' AND ml.sent_at > NOW() - INTERVAL '7 days'
      )` : ''}
    ORDER BY COALESCE(ca.total_spent,0) DESC, COALESCE(ca.total_visits,0) DESC
  `, [userId]);

  const bySegment = { champion: [], fidele: [], prometteur: [], risque: [], perdu: [] };
  rows.forEach(c => { if (bySegment[c.segment]) bySegment[c.segment].push(c); });
  return bySegment;
}

// ── Récupération des segments AVEC habitudes prédictives en une seule requête ─
// Retourne pour chaque client:
//   pref_dow   : jour de la semaine préféré (MODE des RDV passés, 0=dim..6=sam)
//   pref_slot  : 1=matin (9-12h), 2=après-midi (12-17h), 3=soir (17-20h)
//   visit_count: total RDV passés (pour juger si pref fiable)
//   last_visit : pour le calcul du score d'inactivité
async function getClientSegmentsWithHabits(userId) {
  const { rows } = await pool.query(`
    WITH avg_spent AS (
      SELECT COALESCE(AVG(total_spent), 0) AS avg_val
      FROM client_accounts WHERE user_id = $1
    ),
    habits AS (
      SELECT
        ca.id AS client_id,
        MODE() WITHIN GROUP (ORDER BY EXTRACT(DOW FROM a.date))::int AS pref_dow,
        MODE() WITHIN GROUP (ORDER BY
          CASE
            WHEN EXTRACT(HOUR FROM a.start_time) < 12 THEN 1
            WHEN EXTRACT(HOUR FROM a.start_time) < 17 THEN 2
            ELSE 3
          END
        )::int AS pref_slot,
        COUNT(*) AS visit_count,
        MAX(a.date) AS last_visit
      FROM client_accounts ca
      LEFT JOIN appointments a ON a.user_id = ca.user_id
        AND LOWER(COALESCE(a.client_email,'')) = LOWER(COALESCE(ca.email,''))
        AND a.status IN ('completed','confirmed')
      WHERE ca.user_id = $1
      GROUP BY ca.id
    )
    SELECT
      ca.id, ca.first_name, ca.last_name, ca.phone, ca.email,
      ca.unsubscribe_token,
      COALESCE(ca.total_visits, 0)::int    AS visits,
      COALESCE(ca.total_spent, 0)::float   AS spent,
      h.pref_dow, h.pref_slot, h.visit_count, h.last_visit,
      CASE
        WHEN h.last_visit IS NULL OR h.last_visit < (CURRENT_DATE - INTERVAL '90 days') THEN 'perdu'
        WHEN h.last_visit < (CURRENT_DATE - INTERVAL '30 days') THEN 'risque'
        WHEN COALESCE(ca.total_visits,0) >= 5
             AND COALESCE(ca.total_spent,0) > (SELECT avg_val*2 FROM avg_spent) THEN 'champion'
        WHEN COALESCE(ca.total_visits,0) >= 3 THEN 'fidele'
        ELSE 'prometteur'
      END AS segment
    FROM client_accounts ca
    LEFT JOIN habits h ON h.client_id = ca.id
    WHERE ca.user_id = $1
      AND ca.phone IS NOT NULL AND ca.phone != ''
      AND ca.marketing_opt_in = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM message_log ml
        WHERE ml.user_id = ca.user_id AND ml.phone = ca.phone
          AND ml.channel = 'sms' AND ml.sent_at > NOW() - INTERVAL '7 days'
      )
    ORDER BY COALESCE(ca.total_spent,0) DESC, COALESCE(ca.total_visits,0) DESC
  `, [userId]);

  const bySegment = { champion: [], fidele: [], prometteur: [], risque: [], perdu: [] };
  rows.forEach(c => { if (bySegment[c.segment]) bySegment[c.segment].push(c); });
  return bySegment;
}

// ── Pourcentages adaptatifs (multiples de 5 entre 5-35) ──────────────────────
// Base: risque=15, perdu=25, fidele=10
// Bonus: +5 par 30j d'inactivité supplémentaires au-delà du seuil du segment
// Historique: si campagnes IA précédentes avec conversion >10%, on s'inspire
async function computeAdaptivePercentages(userId) {
  const base = { risque: 15, perdu: 25, fidele: 10 };
  const roundTo5 = (n) => Math.max(5, Math.min(35, Math.round(n / 5) * 5));

  // 1. Ajustement selon l'ancienneté moyenne d'inactivité (depuis appointments)
  const { rows: ages } = await pool.query(`
    SELECT
      CASE
        WHEN stats.last_visit IS NULL OR stats.last_visit < (CURRENT_DATE - INTERVAL '90 days') THEN 'perdu'
        WHEN stats.last_visit < (CURRENT_DATE - INTERVAL '30 days') THEN 'risque'
        ELSE 'fidele'
      END AS segment,
      AVG(EXTRACT(DAY FROM NOW() - COALESCE(stats.last_visit, NOW() - INTERVAL '365 days')))::float AS avg_age
    FROM client_accounts ca
    LEFT JOIN LATERAL (
      SELECT MAX(a.date) AS last_visit
      FROM appointments a
      WHERE a.user_id = ca.user_id
        AND LOWER(COALESCE(a.client_email,'')) = LOWER(COALESCE(ca.email,''))
    ) stats ON TRUE
    WHERE ca.user_id = $1 AND ca.phone IS NOT NULL AND ca.phone != ''
    GROUP BY 1
  `, [userId]).catch(() => ({ rows: [] }));

  const adjusted = { ...base };
  for (const r of ages) {
    if (r.segment === 'perdu' && r.avg_age > 180) adjusted.perdu = Math.min(35, base.perdu + 5);
    if (r.segment === 'risque' && r.avg_age > 60) adjusted.risque = Math.min(25, base.risque + 5);
  }

  // 2. Historique: meilleur taux de conversion par segment (si campagnes passées)
  try {
    const { rows: hist } = await pool.query(`
      SELECT segment, discount_percent,
             COUNT(*) AS total,
             COUNT(used_at) AS used,
             (COUNT(used_at)::float / NULLIF(COUNT(*), 0)) AS conv_rate
      FROM ai_campaign_codes acc
      JOIN ai_campaigns ac ON ac.id = acc.ai_campaign_id
      WHERE ac.user_id = $1 AND acc.sent_at IS NOT NULL
      GROUP BY segment, discount_percent
      HAVING COUNT(*) >= 5 AND (COUNT(used_at)::float / NULLIF(COUNT(*), 0)) > 0.10
      ORDER BY segment, conv_rate DESC
    `, [userId]);
    const bestBySegment = {};
    for (const r of hist) {
      if (!bestBySegment[r.segment]) bestBySegment[r.segment] = parseInt(r.discount_percent);
    }
    for (const seg of ['risque','perdu','fidele']) {
      if (bestBySegment[seg]) adjusted[seg] = bestBySegment[seg];
    }
  } catch {}

  return {
    risque: roundTo5(adjusted.risque),
    perdu:  roundTo5(adjusted.perdu),
    fidele: roundTo5(adjusted.fidele),
  };
}

// ── Helpers TZ Europe/Paris (aligné utils/paymentV3.js) ─────────────────────
// Les SMS marketing sont planifiés en heure locale Paris (11h matin, 14h30
// après-midi, 18h soir). Avant ce commit, computeScheduledAt utilisait
// new Date() + setHours()/getDay() qui dépendent du TZ du process Node ;
// sur Render free tier en UTC, un slot "14h30 Paris" partait à 14h30 UTC =
// 16h30 Paris en été. Toute la stack (booking_settings, paymentV3, stats)
// raisonne en Europe/Paris : on s'aligne.
const PARIS_TZ = 'Europe/Paris';

function parisYmd(date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: PARIS_TZ });
}

function shiftYmd(ymd, deltaDays) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toLocaleDateString('sv-SE', { timeZone: PARIS_TZ });
}

function dowOfYmd(ymd) {
  // 0=dim..6=sam, calculé sur la date Paris. Midi UTC + offset Paris (±1-2h)
  // reste sur le même jour calendaire — robuste aux DST.
  return new Date(ymd + 'T12:00:00Z').getUTCDay();
}

function getParisOffsetMinutes(date) {
  // Offset Paris en minutes pour la date donnée : +60 en hiver, +120 en été.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS_TZ,
    timeZoneName: 'shortOffset',
  });
  const v = dtf.formatToParts(date).find(p => p.type === 'timeZoneName')?.value || 'GMT+1';
  const m = /GMT([+-]?\d+)/.exec(v);
  return m ? parseInt(m[1]) * 60 : 60;
}

function makeParisDate(ymd, hour, minute) {
  // Construit un Date dont la projection Paris est exactement ymd hour:minute:00.
  const naiveUtcMs = Date.UTC(
    parseInt(ymd.slice(0, 4)),
    parseInt(ymd.slice(5, 7)) - 1,
    parseInt(ymd.slice(8, 10)),
    hour, minute, 0
  );
  const offsetMin = getParisOffsetMinutes(new Date(naiveUtcMs));
  return new Date(naiveUtcMs - offsetMin * 60 * 1000);
}

// ── Scheduling prédictif: calcule scheduled_at pour un client (TZ Paris) ────
// Se base sur pref_dow et pref_slot extraits de ses RDV passés.
// Règles: jamais dimanche (dow=0), créneaux 11h/14h30/18h Paris.
// Fallback: pas assez de données → mardi ou jeudi à 11h Paris.
function computeScheduledAt(client, phaseStartDay, phaseEndDay, nowRef) {
  const todayPar = parisYmd(nowRef ? new Date(nowRef) : new Date());
  const hasData = (parseInt(client.visit_count) || 0) >= 2;
  let prefDow = hasData && client.pref_dow != null ? parseInt(client.pref_dow) : null;
  if (prefDow === 0) prefDow = null;

  const slot = hasData && client.pref_slot != null ? parseInt(client.pref_slot) : 2;
  const hour = slot === 1 ? 11 : slot === 3 ? 18 : 14;
  const minute = slot === 2 ? 30 : 0;

  const fallbackDows = [2, 4]; // mardi, jeudi
  const dowsToTry = prefDow != null ? [prefDow, ...fallbackDows] : fallbackDows;

  for (let d = phaseStartDay; d <= phaseEndDay; d++) {
    const ymd = shiftYmd(todayPar, d);
    const dow = dowOfYmd(ymd);
    if (dow === 0) continue;
    if (dowsToTry.includes(dow)) {
      return makeParisDate(ymd, hour, minute);
    }
  }
  // Fallback : premier jour non-dimanche de la phase, 11h Paris.
  for (let d = phaseStartDay; d <= phaseEndDay; d++) {
    const ymd = shiftYmd(todayPar, d);
    if (dowOfYmd(ymd) !== 0) {
      return makeParisDate(ymd, 11, 0);
    }
  }
  return makeParisDate(shiftYmd(todayPar, phaseStartDay), 11, 0);
}

// ── Code personnel unique: PRENOM + 4 chars random ──────────────────────────
function generatePersonalCode(firstName, discount) {
  const prefix = (firstName || 'CLI').replace(/[^A-Za-z]/g, '').slice(0,3).toUpperCase().padEnd(3, 'X');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[OIL01]/g, 'X');
  return `${prefix}${discount}${rand}`;
}

// ── Plan de campagne IA — prédictif + adaptatif + codes personnels ──────────
// Tout calculé en une passe, aucune écriture DB.
async function generateCampaignPlan(userId, budget, durationDays, customDiscounts = null) {
  const maxSmsByBudget = Math.floor(budget / SMS_PRICE);

  // Panier moyen réel
  const { rows: avgR } = await pool.query(
    `SELECT AVG(amount)::float AS avg_price
     FROM transactions WHERE user_id=$1 AND type='revenue' AND amount > 0 AND deleted_at IS NULL`,
    [userId]
  );
  const avgPrice = Math.round(parseFloat(avgR[0]?.avg_price) || 29);

  // Solde
  const { rows: balR } = await pool.query(
    `SELECT sms_balance FROM users WHERE id=$1`, [userId]
  );
  const balance = parseFloat(balR[0]?.sms_balance || 0);

  // Coordonnées merchant pour personnalisation SMS
  const { rows: mRows } = await pool.query(
    `SELECT u.business_name, u.address, u.phone, bs.slug
     FROM users u LEFT JOIN booking_settings bs ON bs.user_id = u.id
     WHERE u.id=$1`, [userId]
  );
  const merchant = mRows[0] || {};

  // Segments avec habitudes prédictives
  const segments = await getClientSegmentsWithHabits(userId);

  // Pourcentages adaptatifs (ou custom si fournis par le merchant)
  const adaptive = await computeAdaptivePercentages(userId);
  const DISCOUNTS = {
    risque: customDiscounts?.risque ?? adaptive.risque,
    perdu:  customDiscounts?.perdu  ?? adaptive.perdu,
    fidele: customDiscounts?.fidele ?? adaptive.fidele,
  };

  const ALLOC = { risque: 0.40, perdu: 0.35, fidele: 0.25 };
  const META = {
    risque: { label: "Clients à risque", emoji: '⚠️' },
    perdu:  { label: 'Clients perdus',    emoji: '😴' },
    fidele: { label: 'Clients fidèles',   emoji: '⭐' },
  };

  // 3 phases sur la durée
  const d = Math.max(3, Math.min(30, parseInt(durationDays) || 15));
  const third = Math.max(1, Math.round(d / 3));
  const PHASE_WINDOWS = {
    risque: { start_day: 1,             end_day: third },
    perdu:  { start_day: third + 1,     end_day: third * 2 },
    fidele: { start_day: third * 2 + 1, end_day: d },
  };

  // ── Fusion des 5 segments RFM vers les 3 phases actionnables ────────────
  // Petite base : on veut que TOUS les clients soient ciblés. Les champions
  // et les prometteurs (nouveaux) sont absorbés par la phase fidèle.
  // Si un client n'a jamais pris RDV il tombe dans 'perdu' (à réactiver).
  const pools = {
    risque: [...segments.risque],
    perdu:  [...segments.perdu],
    fidele: [...segments.fidele, ...segments.champion, ...segments.prometteur],
  };
  const totalAvailable = pools.risque.length + pools.perdu.length + pools.fidele.length;

  const order = ['risque', 'perdu', 'fidele'];
  const nowRef = new Date();

  // ── Allocation en 2 passes : proportionnelle puis redistribution ────────
  const allocations = { risque: 0, perdu: 0, fidele: 0 };
  let remainingBudget = Math.min(maxSmsByBudget, totalAvailable);

  // Pass 1 : allocation proportionnelle cappée par disponibilité
  for (const segId of order) {
    const wanted = Math.floor(maxSmsByBudget * ALLOC[segId]);
    const take   = Math.min(wanted, pools[segId].length);
    allocations[segId] = take;
    remainingBudget -= take;
  }

  // Pass 2 : redistribuer le surplus (round-robin) aux segments qui peuvent absorber
  let guard = totalAvailable + 10;
  while (remainingBudget > 0 && guard-- > 0) {
    let placed = 0;
    for (const segId of order) {
      if (remainingBudget <= 0) break;
      if (allocations[segId] < pools[segId].length) {
        allocations[segId]++;
        remainingBudget--;
        placed++;
      }
    }
    if (placed === 0) break;
  }

  let totalSms = 0;
  const phases = [];
  for (const segId of order) {
    const allocation     = allocations[segId];
    const clientsInPhase = pools[segId].slice(0, allocation);
    totalSms += allocation;

    const win          = PHASE_WINDOWS[segId];
    const discount     = DISCOUNTS[segId];
    const validityDays = d + 7;

    const clients = clientsInPhase.map(c => {
      const scheduledAt = computeScheduledAt(c, win.start_day, win.end_day, nowRef);
      const personalCode = generatePersonalCode(c.first_name, discount);
      return {
        id: c.id,
        first_name: c.first_name,
        last_name:  c.last_name,
        phone:      c.phone,
        pref_dow:   c.pref_dow,
        pref_slot:  c.pref_slot,
        visit_count: c.visit_count || 0,
        scheduled_at: scheduledAt.toISOString(),
        personal_code: personalCode,
      };
    });

    phases.push({
      segment: segId,
      label: META[segId].label,
      emoji: META[segId].emoji,
      start_day: win.start_day,
      end_day:   win.end_day,
      sms_count: allocation,
      discount,
      validity_days: validityDays,
      clients,
    });
  }

  const estimatedCost = parseFloat((totalSms * SMS_PRICE).toFixed(2));

  // Estimation retour pondérée par discount (plus la remise est élevée, plus le retour grimpe)
  const weightedRate = (discount) => 0.08 + Math.min(0.12, (discount - 10) * 0.006);
  let estClientsMin = 0, estClientsMax = 0, estRevMin = 0, estRevMax = 0;
  for (const p of phases) {
    const r = weightedRate(p.discount);
    const minR = Math.max(0.05, r - 0.04);
    const maxR = Math.min(0.35, r + 0.08);
    const minC = Math.round(p.sms_count * minR);
    const maxC = Math.round(p.sms_count * maxR);
    estClientsMin += minC;
    estClientsMax += maxC;
    // CA ajusté pour la remise: avgPrice * (1 - discount/100)
    const netPrice = avgPrice * (1 - p.discount / 100);
    estRevMin += Math.round(minC * netPrice);
    estRevMax += Math.round(maxC * netPrice);
  }

  const segmentTotals = {
    champion:   segments.champion.length,
    fidele:     segments.fidele.length,
    prometteur: segments.prometteur.length,
    risque:     segments.risque.length,
    perdu:      segments.perdu.length,
  };

  return {
    budget,
    duration_days: d,
    max_sms_by_budget: maxSmsByBudget,
    total_sms: totalSms,
    estimated_cost: estimatedCost,
    sms_remaining: maxSmsByBudget - totalSms,
    phases,
    discounts: DISCOUNTS,
    adaptive_discounts: adaptive,
    estimated_clients_min: estClientsMin,
    estimated_clients_max: estClientsMax,
    estimated_revenue_min: estRevMin,
    estimated_revenue_max: estRevMax,
    avg_price: avgPrice,
    balance,
    balance_sufficient: balance >= estimatedCost,
    segment_totals: segmentTotals,
    merchant: {
      business_name: merchant.business_name || null,
      address:       merchant.address || null,
      phone:         merchant.phone || null,
      slug:          merchant.slug || null,
      site_url:      merchant.slug
        ? require('../utils/publicUrl').bookingPageUrl(merchant.slug)
        : null,
    },
  };
}

// ── Construction du SMS personnalisé (≤160 car) ─────────────────────────────
function buildPersonalizedSms({ firstName, discount, validityDays, personalCode, merchant }) {
  const name = (firstName || 'Bonjour').trim();
  const discountStr = `-${discount}%`;
  const bn   = merchant?.business_name || '';
  const tel  = merchant?.phone || '';
  const site = merchant?.site_url || '';
  const addr = merchant?.address || '';

  // Construction progressive: priorité code + réduction + téléphone + lien site
  const parts = [];
  parts.push(`${name}, ${discountStr} avec le code ${personalCode}`);
  parts.push(`Valable ${validityDays}j sur place & en ligne`);
  if (bn)   parts.push(bn);
  if (tel)  parts.push(`Tel: ${tel}`);
  if (addr) parts.push(addr);
  if (site) parts.push(site);

  let msg = parts.join('. ');
  // Si trop long, on tronque l'adresse en priorité
  if (msg.length > 160 && addr) {
    const partsNoAddr = parts.filter(p => p !== addr);
    msg = partsNoAddr.join('. ');
  }
  if (msg.length > 160 && bn) {
    const partsShort = [
      `${name}, ${discountStr} code ${personalCode}`,
      `Valable ${validityDays}j`,
      tel ? `Tel: ${tel}` : '',
      site,
    ].filter(Boolean);
    msg = partsShort.join('. ');
  }
  if (msg.length > 160) msg = msg.slice(0, 157) + '...';
  return msg;
}

function getTargetCount(targetType, customCount) {
  if (targetType === 'top50') return 50;
  if (targetType === 'top100') return 100;
  if (targetType === 'top200') return 200;
  if (targetType === 'all') return 99999;
  if (targetType === 'custom') return parseInt(customCount) || 50;
  return 50;
}

// ── GET /api/campaigns/preview ──────────────────────────────────────────────
router.get('/preview', async (req, res) => {
  try {
    const { target_type, custom_count, channel } = req.query;
    const limit = getTargetCount(target_type, custom_count);
    const userId = req.user.userId;

    const needPhone = channel === 'sms' || channel === 'both';
    const needEmail = channel === 'email' || channel === 'both';

    const smsClients = needPhone ? await getTopClients(userId, limit, true, false) : [];
    const emailClients = needEmail ? await getTopClients(userId, limit, false, true) : [];

    const smsCost = smsClients.length * SMS_PRICE;
    const quota = await checkEmailQuota(userId);

    // Solde SMS
    const { rows: balRows } = await pool.query(`SELECT sms_balance FROM users WHERE id=$1`, [userId]);
    const smsBalance = parseFloat(balRows[0]?.sms_balance || 0);

    // Plan étalé si trop d'emails pour aujourd'hui
    let emailPlan = null;
    if (emailClients.length > quota.available_today) {
      const todayBatch = quota.available_today;
      const remaining = emailClients.length - todayBatch;
      const daysNeeded = Math.ceil(remaining / EMAIL_MARKETING_MAX);
      emailPlan = { today: todayBatch, remaining, days_needed: daysNeeded };
    }

    res.json({
      sms: { count: smsClients.length, cost: smsCost, balance: smsBalance, sufficient: smsBalance >= smsCost },
      email: { count: emailClients.length, quota, plan: emailPlan },
      price_per_sms: SMS_PRICE,
    });
  } catch (err) {
    console.error('[CAMPAIGNS preview]', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/campaigns/send ────────────────────────────────────────────────
const VALID_CHANNELS     = ['sms', 'email', 'both'];
const VALID_TARGET_TYPES = ['top50', 'top100', 'top200', 'all', 'custom'];
const MAX_SMS_LEN        = 480;  // 3 SMS concaténés max — au-delà c'est du spam
const MAX_EMAIL_LEN      = 10000;
// Phase 1b — gating : envoi de campagne (SMS ou Email marketing)
// reserve aux plans Essentiel et Equipe. GET /preview, /history, /quota
// restent accessibles aux Decouverte (lecture seule).
router.post('/send', requirePlan('essentiel', 'equipe'), async (req, res) => {
  try {
    const { promo_code_id, target_type, custom_count, channel, message_sms, message_email, promo_code } = req.body;
    const userId = req.user.userId;

    // Validation input stricte (avant : channel/target_type/messages
    // non validés -> campagne créée avec channel='xyz' sans envoi, ou
    // message_sms vide/5000 chars consommant SMS sans valeur utile).
    if (!VALID_CHANNELS.includes(channel))
      return res.status(400).json({ error: 'Channel invalide (sms|email|both).' });
    if (!VALID_TARGET_TYPES.includes(target_type))
      return res.status(400).json({ error: 'Target invalide.' });
    const needSMS = channel === 'sms' || channel === 'both';
    const needEmail = channel === 'email' || channel === 'both';
    if (needSMS && (!message_sms || !String(message_sms).trim() || String(message_sms).length > MAX_SMS_LEN))
      return res.status(400).json({ error: `Message SMS requis (1-${MAX_SMS_LEN} caractères).` });
    if (needEmail && message_email && String(message_email).length > MAX_EMAIL_LEN)
      return res.status(400).json({ error: `Email trop long (max ${MAX_EMAIL_LEN}).` });

    const limit = getTargetCount(target_type, custom_count);

    // Récupérer les clients cibles
    const smsClients = needSMS ? await getTopClients(userId, limit, true, false) : [];
    const emailClients = needEmail ? await getTopClients(userId, limit, false, true) : [];

    console.log('[CAMPAIGN SEND] Start', {
      userId, channel, target_type,
      emailClients: emailClients?.length,
      smsClients: smsClients?.length,
      message_email: message_email?.substring(0, 50),
      promo_code,
      brevoKey: process.env.BREVO_API_KEY ? 'OK' : 'MANQUANTE',
      senderEmail: process.env.SENDER_EMAIL || process.env.BREVO_FROM || 'non défini'
    });

    if (needSMS && !smsClients.length) return res.status(400).json({ error: 'Aucun client avec numero de telephone valide.' });
    if (needEmail && !emailClients.length) return res.status(400).json({ error: 'Aucun client avec email valide.' });

    // Commit 26b — récupérer business_name/email pour footer marketing + List-Unsubscribe.
    const { rows: bizRows } = await pool.query(
      `SELECT business_name, email FROM users WHERE id=$1`, [userId]
    );
    const bizName  = bizRows[0]?.business_name || null;
    const bizEmail = bizRows[0]?.email || null;

    // Vérifier solde SMS
    if (needSMS) {
      const totalCost = smsClients.length * SMS_PRICE;
      const { rows } = await pool.query(`SELECT sms_balance FROM users WHERE id=$1`, [userId]);
      const balance = parseFloat(rows[0]?.sms_balance || 0);
      if (balance < totalCost) {
        return res.status(400).json({
          error: `Solde SMS insuffisant. Vous avez ${balance.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DA, cette campagne coute ${totalCost.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DA.`
        });
      }
    }

    // Vérifier quota email
    let quota = null;
    if (needEmail) {
      quota = await checkEmailQuota(userId);
      if (quota.available_month < emailClients.length) {
        const resetDate = new Date(quota.month_reset);
        resetDate.setMonth(resetDate.getMonth() + 1);
        return res.status(400).json({
          error: `Quota email mensuel depasse. Reset le ${resetDate.toLocaleDateString('fr-FR')}.`
        });
      }
    }

    // Créer la campagne
    const { rows: campRows } = await pool.query(
      `INSERT INTO campaigns (user_id, promo_code_id, channel, target_type, target_count, status)
       VALUES ($1,$2,$3,$4,$5,'sending') RETURNING id`,
      [userId, promo_code_id || null, channel, target_type, smsClients.length + emailClients.length]
    );
    const campaignId = campRows[0].id;

    let sentSms = 0, sentEmail = 0, failedCount = 0, totalSmsCost = 0;

    // Envoyer SMS par batch de 10 avec 1s de pause
    if (needSMS && message_sms) {
      const batches = chunk(smsClients, 10);
      for (const batch of batches) {
        for (const client of batch) {
          // Audit Z : injection lien unsubscribe (RGPD). Si pas de token
          // (clients legacy pas encore backfillés), on envoie sans.
          const finalMsg = appendUnsubscribeSms(message_sms, client.unsubscribe_token);
          const result = await sendSMS(client.phone, finalMsg);
          // R8 : log cost = SMS_PRICE (ce que paie le commerçant) et non
          // SMS_COST (coût brut Brevo). Cohérent avec marketing.js + débit.
          await pool.query(
            `INSERT INTO message_log (user_id, campaign_id, phone, channel, cost, status)
             VALUES ($1,$2,$3,'sms',$4,$5)`,
            [userId, campaignId, client.phone, result.success ? SMS_PRICE : 0, result.success ? 'sent' : 'failed']
          );
          if (result.success) { sentSms++; totalSmsCost += SMS_PRICE; }
          else failedCount++;
        }
        await sleep(1000);
      }
      // R1 : débit ATOMIQUE avec garde anti-overdraft. Si 2 campagnes
      // parallèles tentent de débiter simultanément, seule celle qui a
      // le solde suffisant passe. L'autre : solde inchangé, on log le
      // problème (cas extrêmement rare car preview vérifie déjà le solde).
      const debited = await pool.query(
        `UPDATE users SET sms_balance = sms_balance - $1
          WHERE id=$2 AND sms_balance >= $1
          RETURNING sms_balance`,
        [totalSmsCost, userId]
      );
      if (!debited.rows.length && totalSmsCost > 0) {
        console.error('[CAMPAIGN debit] Solde insuffisant au moment du debit — race protection active', { userId, totalSmsCost });
      }
      // Enregistrer la transaction de débit
      await pool.query(
        `INSERT INTO sms_transactions (user_id, type, amount, sms_count, description, status)
         VALUES ($1,'debit',$2,$3,$4,'completed')`,
        [userId, totalSmsCost, sentSms, `Campagne SMS - ${sentSms} envoyés`]
      );
    }

    // Envoyer emails via sendMarketingEmail (Brevo)
    // Commit 30 — quota per-user BDD (cluster-safe), pas la var mémoire
    // historique de getEmailQuota() qui était par worker et incorrecte.
    if (needEmail && (message_email || message_sms)) {
      const emailQuota = await checkUserEmailQuota(userId);
      const emailsToSendNow = Math.min(
        emailClients.length,
        emailQuota.available_today,
        emailQuota.available_month
      );
      const emailsToQueue = emailClients.slice(emailsToSendNow);
      const emailsNow = emailClients.slice(0, emailsToSendNow);

      console.log(`[CAMPAIGN] Emails: ${emailsNow.length} maintenant, ${emailsToQueue.length} en file d'attente`);

      // Envoi immediat par batch de 20 avec 2s de pause
      const emailBatches = chunk(emailsNow, 20);
      for (const batch of emailBatches) {
        await Promise.allSettled(batch.map(async (client) => {
          try {
            const msg = (message_email || message_sms || '')
              .replace(/\{prénom\}/g, client.first_name || '')
              .replace(/\{prenom\}/g, client.first_name || '')
              .replace(/\{nom\}/g, client.last_name || '');

            await sendMarketingEmail(
              client.email,
              `${client.first_name || ''} ${client.last_name || ''}`.trim(),
              msg,
              promo_code || null,
              client.unsubscribe_token,
              bizEmail,
              bizName
            );
            sentEmail++;

            await pool.query(
              `INSERT INTO message_log (user_id, campaign_id, email, channel, cost, status)
               VALUES ($1,$2,$3,'email',0,'sent')`,
              [userId, campaignId, client.email]
            );
          } catch (e) {
            console.error('[CAMPAIGN EMAIL ERROR]', client.email, e.message);
            failedCount++;
            await pool.query(
              `INSERT INTO message_log (user_id, campaign_id, email, channel, status)
               VALUES ($1,$2,$3,'email','failed')`,
              [userId, campaignId, client.email]
            );
          }
        }));

        // Incrementer compteur DB
        await pool.query(
          `UPDATE users SET email_sent_today = email_sent_today + $1, email_sent_month = email_sent_month + $1 WHERE id=$2`,
          [batch.length, userId]
        );

        await sleep(2000);
      }

      // Mettre en file d'attente les emails restants
      for (const client of emailsToQueue) {
        await pool.query(
          `INSERT INTO campaign_queue (user_id, campaign_id, client_id, client_email, client_name, message, status)
           VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
          [userId, campaignId, client.id, client.email, `${client.first_name} ${client.last_name}`, message_email || message_sms]
        );
      }

      console.log(`[CAMPAIGN] Emails: ${sentEmail} envoyes, ${failedCount} echecs`);
    }

    // Finaliser la campagne
    await pool.query(
      `UPDATE campaigns SET sent_sms=$2, sent_email=$3, failed_count=$4, sms_cost=$5, status='completed', completed_at=NOW() WHERE id=$1`,
      [campaignId, sentSms, sentEmail, failedCount, totalSmsCost]
    );

    res.json({
      ok: true,
      campaign_id: campaignId,
      sent_sms: sentSms,
      sent_email: sentEmail,
      queued_email: needEmail ? Math.max(0, emailClients.length - (quota?.available_today || 0)) : 0,
      failed: failedCount,
      sms_cost: totalSmsCost,
    });
  } catch (err) {
    console.error('[CAMPAIGNS send]', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/campaigns/quota ────────────────────────────────────────────────
router.get('/quota', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(`SELECT sms_balance FROM users WHERE id=$1`, [userId]);
    const balance = parseFloat(rows[0]?.sms_balance || 0);
    const quota = await checkEmailQuota(userId);
    res.json({
      sms: { balance, estimated_sms: Math.floor(balance / SMS_PRICE), price_per_sms: SMS_PRICE },
      email: quota,
    });
  } catch (err) {
    console.error('[CAMPAIGNS quota]', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/campaigns/history ──────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, pc.code AS promo_code
      FROM campaigns c
      LEFT JOIN promo_codes pc ON pc.id = c.promo_code_id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
      LIMIT 20
    `, [req.user.userId]);
    res.json(rows);
  } catch (err) {
    console.error('[CAMPAIGNS history]', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/campaigns/auto-plan ────────────────────────────────────────────
router.get('/auto-plan', async (req, res) => {
  try {
    const userId = req.user.userId;
    const budget = parseFloat(req.query.budget);
    const duration = parseInt(req.query.duration_days);

    const { rows: balR } = await pool.query('SELECT sms_balance FROM users WHERE id=$1', [userId]);
    const balance = parseFloat(balR[0]?.sms_balance || 0);

    if (!budget || budget < 1)
      return res.status(400).json({ error: 'Budget doit être supérieur à 1 DA.' });
    if (budget > balance)
      return res.status(400).json({ error: `Budget (${budget} DA) supérieur au solde disponible (${balance.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DA).`, code: 'INSUFFICIENT_BALANCE' });
    if (!duration || duration < 3 || duration > 30)
      return res.status(400).json({ error: 'La durée doit être entre 3 et 30 jours.' });

    const plan = await generateCampaignPlan(userId, budget, duration);
    res.json(plan);
  } catch(e) {
    console.error('[AUTO PLAN]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/campaigns/auto-send ───────────────────────────────────────────
// Crée ai_campaigns + N promo_codes + N ai_campaign_codes + N campaign_queue
// avec scheduled_at précis (heure calculée par client).
// R9 : verrou applicatif anti-double-clic. Deux requêtes quasi-simultanées
// pour le même commerçant (double-clic, retry, scripts) tenteraient de
// générer 2 plans en parallèle → double débit + double envoi. On utilise
// pg_try_advisory_xact_lock scope transaction : le 2e appel échoue vite.
router.post('/auto-send', requirePlan('essentiel', 'equipe'), async (req, res) => {
  const dbClient = await pool.connect();
  let lockAcquired = false;
  try {
    const userId = req.user.userId;
    const { budget, duration_days, discounts } = req.body;

    // Validation input alignée avec /auto-plan (avant : /auto-send ne
    // validait RIEN en entrée, on déléguait à generateCampaignPlan qui
    // cappait durationDays mais pas le budget -> budget=-1000 acceptait,
    // budget=999999 acceptait jusqu'au check balance_sufficient).
    const b = Number(budget);
    const d = parseInt(duration_days);
    if (!Number.isFinite(b) || b < 1 || b > 10000)
      return res.status(400).json({ error: 'Budget invalide (1-10000 DA).' });
    if (!Number.isFinite(d) || d < 3 || d > 30)
      return res.status(400).json({ error: 'Durée invalide (3-30 jours).' });
    if (discounts && typeof discounts === 'object') {
      for (const k of ['risque', 'perdu', 'fidele']) {
        if (discounts[k] != null) {
          const v = Number(discounts[k]);
          if (!Number.isFinite(v) || v < 5 || v > 50) {
            return res.status(400).json({ error: `Remise ${k} invalide (5-50%).` });
          }
        }
      }
    }

    await dbClient.query('BEGIN');
    // Hash deterministe du userId → bigint pour l'advisory lock. 'ai_campaign'
    // prefix évite collision avec un autre domaine utilisant des advisory
    // locks. Se libère automatiquement à COMMIT/ROLLBACK de cette tx.
    const { rows: lockR } = await dbClient.query(
      `SELECT pg_try_advisory_xact_lock(hashtextextended('ai_campaign:' || $1, 42)) AS locked`,
      [userId]
    );
    lockAcquired = !!lockR[0]?.locked;
    if (!lockAcquired) {
      await dbClient.query('ROLLBACK');
      return res.status(409).json({
        error: 'Une campagne IA est déjà en cours de création. Merci de patienter quelques secondes.',
        code: 'CAMPAIGN_IN_PROGRESS',
      });
    }

    const plan = await generateCampaignPlan(userId, budget, duration_days, discounts);
    if (!plan.balance_sufficient) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Solde insuffisant.', code: 'INSUFFICIENT_BALANCE' });
    }
    if (plan.total_sms === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Aucun client ciblable pour le moment (exclusion anti-spam 7 jours).' });
    }
    // (transaction déjà ouverte au-dessus pour acquérir l'advisory lock)

    // 1. Créer l'ai_campaign (header)
    const { rows: aiCamp } = await dbClient.query(
      `INSERT INTO ai_campaigns (user_id, budget, duration_days, status, phases, estimates, total_sms, total_cost)
       VALUES ($1, $2, $3, 'scheduled', $4::jsonb, $5::jsonb, $6, $7)
       RETURNING id`,
      [userId, plan.budget, plan.duration_days,
       JSON.stringify({ phases: plan.phases.map(p => ({
         segment: p.segment, discount: p.discount, sms_count: p.sms_count,
         start_day: p.start_day, end_day: p.end_day, validity_days: p.validity_days,
       })) }),
       JSON.stringify({
         clients_min: plan.estimated_clients_min, clients_max: plan.estimated_clients_max,
         revenue_min: plan.estimated_revenue_min, revenue_max: plan.estimated_revenue_max,
         avg_price: plan.avg_price,
       }),
       plan.total_sms, plan.estimated_cost]
    );
    const aiCampaignId = aiCamp[0].id;

    // 2. Campagne historique (pour intégration avec le reste du système)
    const { rows: camp } = await dbClient.query(
      `INSERT INTO campaigns (user_id, channel, target_type, target_count, status)
       VALUES ($1, 'sms', 'ia_auto', $2, 'scheduled') RETURNING id`,
      [userId, plan.total_sms]
    );
    const campaignId = camp[0].id;

    // 3. Pour chaque client: promo_code + ai_campaign_code + campaign_queue
    for (const phase of plan.phases) {
      if (!phase.clients.length) continue;
      const validityDays = phase.validity_days;

      for (const client of phase.clients) {
        // Assurer unicité du code personnel (suffix random réessai si collision)
        let personalCode = client.personal_code;
        for (let tries = 0; tries < 5; tries++) {
          const chk = await dbClient.query(
            'SELECT 1 FROM promo_codes WHERE user_id=$1 AND code=$2 LIMIT 1',
            [userId, personalCode]
          );
          if (!chk.rowCount) break;
          personalCode = generatePersonalCode(client.first_name, phase.discount);
        }

        // 3a. Créer le promo_code (max_uses=1, validité = phase + buffer)
        const { rows: promoRow } = await dbClient.query(
          `INSERT INTO promo_codes
             (user_id, code, type, value, is_active, valid_from, valid_until,
              max_uses, target_clients)
           VALUES ($1, $2, 'percent', $3, TRUE, CURRENT_DATE,
                   CURRENT_DATE + ($4 || ' days')::interval, 1, 'all')
           RETURNING id`,
          [userId, personalCode, phase.discount, validityDays]
        );
        const promoCodeId = promoRow[0].id;

        // 3b. Créer l'ai_campaign_code
        const { rows: aiCode } = await dbClient.query(
          `INSERT INTO ai_campaign_codes
             (ai_campaign_id, client_id, promo_code_id, personal_code,
              segment, discount_percent, scheduled_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
           RETURNING id`,
          [aiCampaignId, client.id, promoCodeId, personalCode,
           phase.segment, phase.discount, client.scheduled_at]
        );
        const aiCodeId = aiCode[0].id;

        // 3c. Construire le SMS personnalisé
        const smsMsg = buildPersonalizedSms({
          firstName: client.first_name,
          discount: phase.discount,
          validityDays,
          personalCode,
          merchant: plan.merchant,
        });

        // 3d. Enqueue dans campaign_queue avec scheduled_at précis
        await dbClient.query(
          `INSERT INTO campaign_queue
             (user_id, campaign_id, client_id, client_phone, client_name,
              message, channel, scheduled_date, scheduled_at, ai_code_id)
           VALUES ($1,$2,$3,$4,$5,$6,'sms',$7::date,$7::timestamptz,$8)`,
          [userId, campaignId, client.id, client.phone,
           [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Client',
           smsMsg, client.scheduled_at, aiCodeId]
        );
      }
    }

    // 4. Débit ATOMIQUE avec garde anti-overdraft (R1). Si le solde a baissé
    // depuis la preview (autre campagne, cron anniv, reminders RDV), on
    // annule la transaction plutôt que de passer en négatif.
    const dbt = await dbClient.query(
      `UPDATE users SET sms_balance = sms_balance - $1
        WHERE id=$2 AND sms_balance >= $1
        RETURNING sms_balance`,
      [plan.estimated_cost, userId]
    );
    if (!dbt.rows.length) {
      await dbClient.query('ROLLBACK');
      return res.status(409).json({
        error: 'Solde insuffisant au moment du débit — une autre opération a entre-temps consommé le solde. Rechargez pour réessayer.',
        code: 'INSUFFICIENT_BALANCE',
      });
    }
    await dbClient.query(
      `INSERT INTO sms_transactions (user_id, type, amount, sms_count, description, status)
       VALUES ($1,'debit',$2,$3,$4,'completed')`,
      [userId, plan.estimated_cost, plan.total_sms, `Campagne IA — ${duration_days}j`]
    );

    await dbClient.query('COMMIT');
    console.log(`[AI SEND] user=${userId} ai_campaign=${aiCampaignId} sms=${plan.total_sms} cost=${plan.estimated_cost}€`);

    res.json({
      ok: true,
      ai_campaign_id: aiCampaignId,
      campaign_id: campaignId,
      total_sms: plan.total_sms,
      estimated_cost: plan.estimated_cost,
      duration_days: plan.duration_days,
      new_balance: plan.balance - plan.estimated_cost,
    });
  } catch(e) {
    await dbClient.query('ROLLBACK').catch(() => {});
    console.error('[AI SEND]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  } finally { dbClient.release(); }
});

// ── POST /api/campaigns/auto-recalculate ────────────────────────────────────
// Recalcule uniquement les estimations ROI selon les nouveaux % (pas de DB).
router.post('/auto-recalculate', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { budget, duration_days, discounts } = req.body;
    const plan = await generateCampaignPlan(userId, budget, duration_days, discounts);
    res.json({
      total_sms: plan.total_sms,
      estimated_cost: plan.estimated_cost,
      estimated_clients_min: plan.estimated_clients_min,
      estimated_clients_max: plan.estimated_clients_max,
      estimated_revenue_min: plan.estimated_revenue_min,
      estimated_revenue_max: plan.estimated_revenue_max,
      balance: plan.balance,
      balance_sufficient: plan.balance_sufficient,
      phases: plan.phases.map(p => ({
        segment: p.segment, discount: p.discount, sms_count: p.sms_count,
      })),
    });
  } catch(e) {
    console.error('[AI RECALC]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/campaigns/ai-history ───────────────────────────────────────────
// Campagnes IA passées avec taux de conversion réel et CA généré.
router.get('/ai-history', async (req, res) => {
  try {
    const userId = req.user.userId;
    // real_revenue : tire le CA des appointments (online_booking) OU des
    // transactions (caisse). Avant ce commit, on ne joinait que sur
    // appointments → le CA généré en caisse (majorité walk-in barbershop)
    // était toujours à 0. COALESCE prend la première source disponible.
    const { rows } = await pool.query(`
      SELECT
        ac.id, ac.budget, ac.duration_days, ac.status, ac.total_sms, ac.total_cost,
        ac.created_at, ac.completed_at, ac.phases, ac.estimates,
        COUNT(acc.id)::int AS codes_total,
        COUNT(acc.sent_at)::int AS codes_sent,
        COUNT(acc.used_at)::int AS codes_used,
        COALESCE(SUM(
          CASE WHEN acc.used_at IS NOT NULL
          THEN COALESCE(appt.total_amount, txn.amount, 0)
          ELSE 0 END
        ), 0)::float AS real_revenue
      FROM ai_campaigns ac
      LEFT JOIN ai_campaign_codes acc ON acc.ai_campaign_id = ac.id
      LEFT JOIN appointments appt ON appt.id = acc.used_appointment_id
      LEFT JOIN transactions txn ON txn.id = acc.used_transaction_id
      WHERE ac.user_id = $1
      GROUP BY ac.id
      ORDER BY ac.created_at DESC
      LIMIT 20
    `, [userId]);

    res.json(rows.map(r => ({
      id: r.id,
      budget: parseFloat(r.budget),
      duration_days: r.duration_days,
      status: r.status,
      total_sms: r.total_sms,
      total_cost: parseFloat(r.total_cost),
      created_at: r.created_at,
      completed_at: r.completed_at,
      phases: r.phases,
      estimates: r.estimates,
      codes_total: r.codes_total,
      codes_sent: r.codes_sent,
      codes_used: r.codes_used,
      conversion_rate: r.codes_sent > 0
        ? parseFloat((r.codes_used / r.codes_sent).toFixed(4))
        : 0,
      real_revenue: parseFloat(r.real_revenue.toFixed(2)),
      roi: r.total_cost > 0
        ? parseFloat((r.real_revenue / parseFloat(r.total_cost)).toFixed(2))
        : 0,
    })));
  } catch(e) {
    console.error('[AI HISTORY]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
