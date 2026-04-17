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

async function getTopClients(userId, limit, needPhone, needEmail) {
  let where = `WHERE ca.user_id = $1`;
  if (needPhone) where += ` AND ca.phone IS NOT NULL AND ca.phone != ''`;
  if (needEmail) where += ` AND ca.email IS NOT NULL AND ca.email != '' AND ca.email LIKE '%@%'`;

  const { rows } = await pool.query(`
    SELECT ca.id, ca.email, ca.phone, ca.first_name, ca.last_name,
      COALESCE(ca.total_visits, 0) AS visits,
      COALESCE(ca.total_spent, 0) AS spent
    FROM client_accounts ca
    ${where}
    ORDER BY COALESCE(ca.total_visits,0) DESC, COALESCE(ca.total_spent,0) DESC
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

module.exports = router;
