// routes/campaigns.js — Campagnes SMS + Email Marketing
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { sendSMS, sleep, chunk, SMS_COST, SMS_PRICE } = require('../utils/messenger');
const { sendMarketingEmail, getEmailQuota } = require('../utils/emailSender');
const router = express.Router();

// Toutes les routes nécessitent une authentification commerçant
router.use(authMiddleware);

// ── Constantes ──────────────────────────────────────────────────────────────
const EMAIL_DAILY_LIMIT   = 300;
const EMAIL_MONTHLY_LIMIT = 9000;
// Plus de EMAIL_RESERVE fixe — le compteur inclut tous les emails
const EMAIL_MARKETING_MAX = EMAIL_DAILY_LIMIT; // 300/jour total

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
  if (needPhone) conds.push(`ca.phone IS NOT NULL AND ca.phone != ''`);
  if (needEmail) conds.push(`ca.email IS NOT NULL AND ca.email != '' AND ca.email LIKE '%@%'`);

  const { rows } = await pool.query(`
    SELECT
      ca.id, ca.email, ca.phone, ca.first_name, ca.last_name,
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

async function checkEmailQuota(userId) {
  const { rows } = await pool.query(
    `SELECT email_sent_today, email_sent_month, email_day_reset, email_month_reset FROM users WHERE id=$1`,
    [userId]
  );
  if (!rows.length) return null;
  const u = rows[0];
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  let sentToday = u.email_sent_today || 0;
  let sentMonth = u.email_sent_month || 0;

  // Reset journalier
  if (!u.email_day_reset || u.email_day_reset.toISOString().slice(0, 10) < today) {
    await pool.query(`UPDATE users SET email_sent_today=0, email_day_reset=$2 WHERE id=$1`, [userId, today]);
    sentToday = 0;
  }
  // Reset mensuel
  if (!u.email_month_reset || u.email_month_reset.toISOString().slice(0, 10) < monthStart) {
    await pool.query(`UPDATE users SET email_sent_month=0, email_month_reset=$2 WHERE id=$1`, [userId, monthStart]);
    sentMonth = 0;
  }

  return {
    available_today: Math.max(0, EMAIL_MARKETING_MAX - sentToday),
    available_month: Math.max(0, EMAIL_MONTHLY_LIMIT - sentMonth),
    sent_today: sentToday,
    sent_month: sentMonth,
    daily_limit: EMAIL_MARKETING_MAX,
    monthly_limit: EMAIL_MONTHLY_LIMIT,
    day_reset: u.email_day_reset,
    month_reset: u.email_month_reset,
  };
}

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

// ── Plan de campagne automatique par budget/durée ────────────────────────────
// Ciblage: 40% risque, 35% perdu, 25% fidele (les 3 segments qui ont besoin de relance)
// 3 phases selon la durée: 1/3 risque, 1/3 perdu, 1/3 fidele
async function generateCampaignPlan(userId, budget, durationDays) {
  const maxSmsByBudget = Math.floor(budget / SMS_PRICE);

  const { rows: avgR } = await pool.query(
    `SELECT AVG(amount)::float AS avg_price
     FROM transactions WHERE user_id=$1 AND type='revenue' AND amount > 0`,
    [userId]
  );
  const avgPrice = Math.round(parseFloat(avgR[0]?.avg_price) || 29);

  const { rows: balR } = await pool.query(
    `SELECT sms_balance FROM users WHERE id=$1`, [userId]
  );
  const balance = parseFloat(balR[0]?.sms_balance || 0);

  const segments = await getClientSegments(userId, true);

  const ALLOC = { risque: 0.40, perdu: 0.35, fidele: 0.25 };
  const DISCOUNTS = { risque: 15, perdu: 25, fidele: 10 };
  const TEMPLATES = {
    risque: '[prenom], ca fait un moment ! -[reduction]% sur ta prochaine coupe. Valable [duree] jours.',
    perdu:  '[prenom], tu nous manques ! -[reduction]% exceptionnel sur ta prochaine coupe.',
    fidele: '[prenom], merci pour ta fidelite ! -[reduction]% pour toi ce mois-ci.',
  };
  const META = {
    risque: { label: "Clients à risque", emoji: '⚠️' },
    perdu:  { label: 'Clients perdus',    emoji: '😴' },
    fidele: { label: 'Clients fidèles',   emoji: '⭐' },
  };

  // Répartition temporelle en 3 phases de ~ même durée
  const d = Math.max(3, Math.min(30, parseInt(durationDays) || 15));
  const third = Math.max(1, Math.round(d / 3));
  const PHASE_WINDOWS = {
    risque: { start_day: 1,            end_day: third },
    perdu:  { start_day: third + 1,    end_day: third * 2 },
    fidele: { start_day: third * 2 + 1,end_day: d },
  };

  const order = ['risque', 'perdu', 'fidele'];
  const phases = [];
  let totalSms = 0;

  for (const segId of order) {
    const wantedFromBudget = Math.floor(maxSmsByBudget * ALLOC[segId]);
    const available = segments[segId].length;
    const allocation = Math.min(wantedFromBudget, available);
    const clientsInPhase = segments[segId].slice(0, allocation);
    totalSms += allocation;

    const win = PHASE_WINDOWS[segId];
    const tmpl = TEMPLATES[segId]
      .replace('[reduction]', DISCOUNTS[segId])
      .replace('[duree]', '30');

    phases.push({
      segment: segId,
      label: META[segId].label,
      emoji: META[segId].emoji,
      start_day: win.start_day,
      end_day:   win.end_day,
      sms_count: allocation,
      discount:  DISCOUNTS[segId],
      template:  tmpl,
      clients:   clientsInPhase.map(c => ({
        id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone,
      })),
    });
  }

  const estimatedCost = parseFloat((totalSms * SMS_PRICE).toFixed(2));
  const smsRemaining  = maxSmsByBudget - totalSms;

  const estClientsMin = Math.round(totalSms * 0.08);
  const estClientsMax = Math.round(totalSms * 0.20);
  const estRevMin     = Math.round(estClientsMin * avgPrice);
  const estRevMax     = Math.round(estClientsMax * avgPrice);

  // Totaux segments globaux (affichage UI)
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
    sms_remaining: smsRemaining,
    phases,
    estimated_clients_min: estClientsMin,
    estimated_clients_max: estClientsMax,
    estimated_revenue_min: estRevMin,
    estimated_revenue_max: estRevMax,
    avg_price: avgPrice,
    balance,
    balance_sufficient: balance >= estimatedCost,
    segment_totals: segmentTotals,
  };
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
router.post('/send', async (req, res) => {
  try {
    const { promo_code_id, target_type, custom_count, channel, message_sms, message_email, promo_code } = req.body;
    const userId = req.user.userId;
    const limit = getTargetCount(target_type, custom_count);

    const needSMS = channel === 'sms' || channel === 'both';
    const needEmail = channel === 'email' || channel === 'both';

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

    // Vérifier solde SMS
    if (needSMS) {
      const totalCost = smsClients.length * SMS_PRICE;
      const { rows } = await pool.query(`SELECT sms_balance FROM users WHERE id=$1`, [userId]);
      const balance = parseFloat(rows[0]?.sms_balance || 0);
      if (balance < totalCost) {
        return res.status(400).json({
          error: `Solde SMS insuffisant. Vous avez ${balance.toFixed(2)}€, cette campagne coute ${totalCost.toFixed(2)}€.`
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
          const result = await sendSMS(client.phone, message_sms);
          await pool.query(
            `INSERT INTO message_log (user_id, campaign_id, phone, channel, cost, status)
             VALUES ($1,$2,$3,'sms',$4,$5)`,
            [userId, campaignId, client.phone, result.success ? SMS_COST : 0, result.success ? 'sent' : 'failed']
          );
          if (result.success) { sentSms++; totalSmsCost += SMS_PRICE; }
          else failedCount++;
        }
        await sleep(1000);
      }
      // Déduire le solde SMS
      await pool.query(`UPDATE users SET sms_balance = sms_balance - $2 WHERE id=$1`, [userId, totalSmsCost]);
      // Enregistrer la transaction de débit
      await pool.query(
        `INSERT INTO sms_transactions (user_id, type, amount, sms_count, description, status)
         VALUES ($1,'debit',$2,$3,$4,'completed')`,
        [userId, totalSmsCost, sentSms, `Campagne SMS - ${sentSms} envoyés`]
      );
    }

    // Envoyer emails via sendMarketingEmail (Brevo)
    if (needEmail && (message_email || message_sms)) {
      const emailQuota = getEmailQuota();
      const emailsToSendNow = Math.min(emailClients.length, emailQuota.available_today);
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
              promo_code || null
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
      return res.status(400).json({ error: 'Budget doit être supérieur à 1 €.' });
    if (budget > balance)
      return res.status(400).json({ error: `Budget (${budget}€) supérieur au solde disponible (${balance.toFixed(2)}€).`, code: 'INSUFFICIENT_BALANCE' });
    if (!duration || duration < 3 || duration > 30)
      return res.status(400).json({ error: 'La durée doit être entre 3 et 30 jours.' });

    const plan = await generateCampaignPlan(userId, budget, duration);
    res.json(plan);
  } catch(e) {
    console.error('[AUTO PLAN]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/campaigns/auto-send ───────────────────────────────────────────
// Planifie les envois via campaign_queue (traités par cron SMS) et débite le solde
router.post('/auto-send', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { budget, duration_days } = req.body;

    const plan = await generateCampaignPlan(userId, budget, duration_days);
    if (!plan.balance_sufficient)
      return res.status(400).json({ error: 'Solde insuffisant.', code: 'INSUFFICIENT_BALANCE' });
    if (plan.total_sms === 0)
      return res.status(400).json({ error: 'Aucun client ciblable pour le moment (exclusion anti-spam 7 jours).' });

    // Créer la campagne
    const { rows: camp } = await pool.query(
      `INSERT INTO campaigns (user_id, channel, target_type, target_count, status)
       VALUES ($1, 'sms', 'ia_auto', $2, 'scheduled') RETURNING id`,
      [userId, plan.total_sms]
    );
    const campaignId = camp[0].id;

    // Planifier chaque client selon sa phase
    const today = new Date();
    for (const phase of plan.phases) {
      if (!phase.clients.length) continue;
      for (const client of phase.clients) {
        const firstName = (client.first_name || 'Cher client').trim();
        const msg = phase.template
          .replace(/\[prenom\]/gi, firstName)
          .replace(/\{prenom\}/gi, firstName);
        const smsMsg = msg.length > 160 ? msg.slice(0, 157) + '...' : msg;

        // scheduled_date = aujourd'hui + (start_day - 1), décalage aléatoire jusqu'à end_day
        const spread = Math.max(0, phase.end_day - phase.start_day);
        const offset = (phase.start_day - 1) + Math.floor(Math.random() * (spread + 1));
        const sd = new Date(today);
        sd.setDate(sd.getDate() + offset);

        await pool.query(
          `INSERT INTO campaign_queue (user_id, campaign_id, client_id, client_phone, client_name, message, channel, scheduled_date)
           VALUES ($1,$2,$3,$4,$5,$6,'sms',$7)`,
          [userId, campaignId, client.id, client.phone,
           [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Client',
           smsMsg, sd.toISOString().slice(0,10)]
        );
      }
    }

    // Débit immédiat du solde (le coût estimé correspond aux envois planifiés)
    await pool.query(
      `UPDATE users SET sms_balance = sms_balance - $1 WHERE id=$2`,
      [plan.estimated_cost, userId]
    );
    await pool.query(
      `INSERT INTO sms_transactions (user_id, type, amount, sms_count, description, status)
       VALUES ($1,'debit',$2,$3,$4,'completed')`,
      [userId, plan.estimated_cost, plan.total_sms, `Campagne IA auto — ${duration_days}j`]
    );

    console.log(`[AUTO SEND] user=${userId} sms=${plan.total_sms} cost=${plan.estimated_cost}€ duration=${duration_days}j`);
    res.json({
      ok: true,
      campaign_id: campaignId,
      total_sms: plan.total_sms,
      estimated_cost: plan.estimated_cost,
      duration_days: plan.duration_days,
      new_balance: plan.balance - plan.estimated_cost,
    });
  } catch(e) {
    console.error('[AUTO SEND]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
