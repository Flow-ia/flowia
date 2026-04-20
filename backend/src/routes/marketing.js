// routes/marketing.js — Plan Marketing IA (relance barbershop/salon)
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { sendSMS, SMS_PRICE, chunk, sleep } = require('../utils/messenger');
const { appendUnsubscribeSms } = require('../utils/unsubscribe');
const router = express.Router();
router.use(authMiddleware);

// Taux de retour estimés (pessimiste/optimiste) par segment — réalistes pour salon
const RETURN_RATE_MIN = 0.08; // 8%
const RETURN_RATE_MAX = 0.20; // 20%

// ── GET /api/marketing/plan ─ génère le plan segmenté + estimations ───────────
router.get('/plan', async (req, res) => {
  try {
    const userId = req.user.userId;

    // Panier moyen réel du commerçant
    const { rows: avgRows } = await pool.query(
      `SELECT AVG(amount)::float AS avg_price
       FROM transactions
       WHERE user_id=$1 AND type='revenue' AND amount > 0`,
      [userId]
    );
    const avgPrice = Math.round(parseFloat(avgRows[0]?.avg_price) || 29);

    // Segmentation RFM sur client_accounts avec tél valide
    // - loyal    : dernière visite < 30j ET total_visits >= 2
    // - at_risk  : dernière visite entre 30-90j
    // - lost     : dernière visite > 90j OU aucune
    const { rows: clients } = await pool.query(`
      SELECT
        ca.id, ca.first_name, ca.last_name, ca.phone,
        COALESCE(ca.total_visits, 0) AS visits,
        stats.last_visit,
        CASE
          WHEN stats.last_visit IS NULL OR stats.last_visit < (CURRENT_DATE - INTERVAL '90 days') THEN 'lost'
          WHEN stats.last_visit < (CURRENT_DATE - INTERVAL '30 days') THEN 'at_risk'
          WHEN COALESCE(ca.total_visits, 0) >= 2 THEN 'loyal'
          ELSE 'at_risk'
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
    `, [userId]);

    const byId = { at_risk: [], lost: [], loyal: [] };
    clients.forEach(c => byId[c.segment]?.push(c));

    const totalSms = clients.length;
    const smsCost  = parseFloat((totalSms * SMS_PRICE).toFixed(2));

    const makeSegment = (id, count) => {
      const templates = {
        at_risk: { label: "Clients qui s'éloignent", emoji: '⚠️', days: '1-5',  phase: 1, discount: 15,
          sms: "[prenom], ca fait un moment ! -15% sur votre prochain passage." },
        lost:    { label: "Clients perdus",          emoji: '😴', days: '6-10', phase: 2, discount: 25,
          sms: "[prenom], vous nous manquez ! -25% sur votre prochain rendez-vous." },
        loyal:   { label: "Clients fideles",         emoji: '⭐', days: '11-15',phase: 3, discount: 10,
          sms: "[prenom], merci pour votre fidelite ! -10% pour vous ce mois-ci." },
      };
      return { id, count, ...templates[id] };
    };

    const segments = [
      makeSegment('at_risk', byId.at_risk.length),
      makeSegment('lost',    byId.lost.length),
      makeSegment('loyal',   byId.loyal.length),
    ];

    const expectedMin = Math.round(totalSms * RETURN_RATE_MIN);
    const expectedMax = Math.round(totalSms * RETURN_RATE_MAX);
    const caMin       = Math.round(expectedMin * avgPrice);
    const caMax       = Math.round(expectedMax * avgPrice);

    // Solde SMS disponible pour vérification
    const { rows: balRows } = await pool.query('SELECT sms_balance FROM users WHERE id=$1', [userId]);
    const balance = parseFloat(balRows[0]?.sms_balance || 0);

    res.json({
      avg_price: avgPrice,
      total_clients: totalSms,
      segments,
      estimates: {
        sms_count: totalSms,
        sms_cost: smsCost,
        duration_days: 15,
        expected_clients_min: expectedMin,
        expected_clients_max: expectedMax,
        ca_min: caMin,
        ca_max: caMax,
        return_rate_min: RETURN_RATE_MIN,
        return_rate_max: RETURN_RATE_MAX,
      },
      balance: { amount: balance, sufficient: balance >= smsCost },
    });
  } catch(e) {
    console.error('[MARKETING PLAN ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/marketing/plan/launch ─ exécute le plan ────────────────────────
// Crée 1 promo code par segment + planifie les envois SMS par phase
router.post('/plan/launch', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { messages = {}, discounts = {} } = req.body;

    // Récupérer les clients par segment (anti-spam 7j ajouté pour aligner
    // avec campaigns.js:getClientSegmentsWithHabits — sinon un client
    // pouvait recevoir 2 SMS le même jour via 2 plans lancés consécutifs).
    const { rows: clients } = await pool.query(`
      SELECT
        ca.id, ca.first_name, ca.last_name, ca.phone, ca.unsubscribe_token,
        CASE
          WHEN stats.last_visit IS NULL OR stats.last_visit < (CURRENT_DATE - INTERVAL '90 days') THEN 'lost'
          WHEN stats.last_visit < (CURRENT_DATE - INTERVAL '30 days') THEN 'at_risk'
          WHEN COALESCE(ca.total_visits, 0) >= 2 THEN 'loyal'
          ELSE 'at_risk'
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
        AND NOT EXISTS (
          SELECT 1 FROM message_log ml
          WHERE ml.user_id = ca.user_id AND ml.phone = ca.phone
            AND ml.channel = 'sms' AND ml.sent_at > NOW() - INTERVAL '7 days'
        )
    `, [userId]);

    const totalSms = clients.length;
    const totalCost = totalSms * SMS_PRICE;

    // Vérif solde
    const { rows: balRows } = await pool.query('SELECT sms_balance FROM users WHERE id=$1', [userId]);
    const balance = parseFloat(balRows[0]?.sms_balance || 0);
    if (balance < totalCost) {
      return res.status(400).json({
        error: `Solde SMS insuffisant. Cout: ${totalCost.toFixed(2)}€, solde: ${balance.toFixed(2)}€.`,
      });
    }

    // Créer 1 promo code par segment actif (avec remise choisie)
    const SEG_INFO = {
      at_risk: { label: 'Plan IA - Clients qui s\'eloignent', default_discount: 15 },
      lost:    { label: 'Plan IA - Clients perdus',           default_discount: 25 },
      loyal:   { label: 'Plan IA - Clients fideles',          default_discount: 10 },
    };
    const promoCodesBySegment = {};
    for (const seg of Object.keys(SEG_INFO)) {
      // Validation stricte du pct : avant, `parseInt(discounts[seg]) ||
      // default` laissait passer 10000 -> INSERT promo_codes value=10000.
      // Bypass direct de la validation audit K (promo.js : percent<=100).
      let pct = parseInt(discounts[seg]);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) pct = SEG_INFO[seg].default_discount;
      const code = 'IA' + seg.toUpperCase().slice(0,3) + Math.random().toString(36).slice(2,5).toUpperCase();
      const { rows: p } = await pool.query(
        `INSERT INTO promo_codes (user_id, code, type, value, is_active, valid_from, valid_until, target_clients)
         VALUES ($1, $2, 'percent', $3, TRUE, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'all')
         RETURNING id, code`,
        [userId, code, pct]
      );
      promoCodesBySegment[seg] = p[0];
    }

    // Créer la campagne en DB
    const { rows: campRows } = await pool.query(
      `INSERT INTO campaigns (user_id, channel, target_type, target_count, status)
       VALUES ($1, 'sms', 'ia_plan', $2, 'sending') RETURNING id`,
      [userId, totalSms]
    );
    const campaignId = campRows[0].id;

    // Envoyer les SMS par segment — réponse rapide, envoi en fond
    res.json({
      ok: true,
      campaign_id: campaignId,
      sms_count: totalSms,
      sms_cost: totalCost,
      promo_codes: Object.fromEntries(Object.entries(promoCodesBySegment).map(([k,v]) => [k, v.code])),
      message: `${totalSms} SMS en cours d'envoi`,
    });

    // ── Traitement asynchrone des envois (ne bloque pas la réponse HTTP) ──────
    (async () => {
      let sentTotal = 0, failedTotal = 0;
      const bySegment = { at_risk: [], lost: [], loyal: [] };
      clients.forEach(c => bySegment[c.segment]?.push(c));

      for (const seg of Object.keys(bySegment)) {
        const list = bySegment[seg];
        if (!list.length) continue;
        const template = messages[seg] ||
          (seg === 'at_risk' ? "[prenom], ca fait un moment ! -15% sur votre prochain passage. Code " + promoCodesBySegment[seg].code
          : seg === 'lost'   ? "[prenom], vous nous manquez ! -25% sur votre prochain rdv. Code " + promoCodesBySegment[seg].code
          :                    "[prenom], merci pour votre fidelite ! -10% pour vous. Code " + promoCodesBySegment[seg].code);

        for (const batch of chunk(list, 10)) {
          for (const client of batch) {
            const firstName = (client.first_name || 'Cher client').trim();
            const msg = template
              .replace(/\[prenom\]/gi, firstName)
              .replace(/\{prenom\}/gi, firstName)
              + (template.includes(promoCodesBySegment[seg].code) ? '' : ' Code: ' + promoCodesBySegment[seg].code);
            const smsMsg = msg.length > 160 ? msg.slice(0, 157) + '...' : msg;
            // Audit Z : injection lien unsubscribe (RGPD).
            const finalMsg = appendUnsubscribeSms(smsMsg, client.unsubscribe_token);
            try {
              const result = await sendSMS(client.phone, finalMsg);
              await pool.query(
                `INSERT INTO message_log (user_id, campaign_id, phone, channel, cost, status)
                 VALUES ($1,$2,$3,'sms',$4,$5)`,
                [userId, campaignId, client.phone, result.success ? SMS_PRICE : 0, result.success ? 'sent' : 'failed']
              );
              if (result.success) sentTotal++; else failedTotal++;
            } catch { failedTotal++; }
          }
          await sleep(1000); // respect rate limit Brevo
        }
      }

      const totalDeducted = sentTotal * SMS_PRICE;
      // Garde anti-overdraft (cohérent audit R1 / campaigns.js). Si le solde
      // a été épuisé par un envoi parallèle, on log mais on ne passe pas en
      // négatif. Les SMS sont déjà partis (non réversibles) donc perte
      // marchand acceptée côté produit — priorité : ne jamais passer négatif.
      const dbt = await pool.query(
        `UPDATE users SET sms_balance = sms_balance - $1
          WHERE id=$2 AND sms_balance >= $1
          RETURNING sms_balance`,
        [totalDeducted, userId]
      );
      if (!dbt.rows.length && totalDeducted > 0) {
        console.error('[MARKETING debit] Solde insuffisant au moment du débit — SMS déjà envoyés', { userId, totalDeducted, sentTotal });
      }
      await pool.query(
        `UPDATE campaigns SET sent_sms=$2, failed_count=$3, sms_cost=$4, status='completed', completed_at=NOW() WHERE id=$1`,
        [campaignId, sentTotal, failedTotal, totalDeducted]
      );
      await pool.query(
        `INSERT INTO sms_transactions (user_id, type, amount, sms_count, description, status)
         VALUES ($1,'debit',$2,$3,$4,'completed')`,
        [userId, totalDeducted, sentTotal, `Plan IA - ${sentTotal} SMS envoyes`]
      );
      console.log(`[MARKETING PLAN] user=${userId} sent=${sentTotal} failed=${failedTotal} cost=${totalDeducted.toFixed(2)}€`);
    })().catch(err => console.error('[MARKETING PLAN ASYNC ERR]', err));

  } catch(e) {
    console.error('[MARKETING PLAN LAUNCH ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── Audit Z4 : stats opt-in RGPD ─────────────────────────────────────────────
// Retourne la taille de l'audience marketing avec et sans filtre opt-in.
// Utilisé pour la bannière TabMarketing qui signale au commerçant combien de
// clients il peut VRAIMENT toucher + invite à lancer une campagne d'opt-in.
router.get('/opt-in-stats', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE marketing_opt_in = TRUE)::int AS opted_in,
         COUNT(*) FILTER (WHERE marketing_opt_in = FALSE
                              AND ((email IS NOT NULL AND email <> '' AND email NOT LIKE 'qr-%@qr.flowia.local')
                                   OR (phone IS NOT NULL AND phone <> '')))::int AS invitable
       FROM client_accounts WHERE user_id=$1`,
      [userId]
    );
    const s = rows[0] || { total: 0, opted_in: 0, invitable: 0 };
    res.json({
      total: s.total,
      opted_in: s.opted_in,
      invitable: s.invitable,
      opt_in_rate: s.total ? Math.round((s.opted_in / s.total) * 100) : 0,
    });
  } catch (e) { console.error('[OPT-IN STATS]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── Audit Z4 : envoi campagne d'invitation opt-in (email uniquement) ────────
// Email transactionnel autorisé (CNIL) pour solliciter le consentement
// marketing des clients existants. Envoyé AUX CLIENTS PENDING UNIQUEMENT
// (marketing_opt_in=FALSE, email réel — filtre les emails synthétiques QR).
// Un client invité ne peut pas être ré-invité tant qu'il n'a pas opt-in
// (flag `opt_in_invited_at` anti-spam).
router.post('/opt-in-invite', async (req, res) => {
  try {
    const userId = req.user.userId;
    // Colonne `opt_in_invited_at` créée à la volée si absente (migration inline).
    await pool.query(
      `ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS opt_in_invited_at TIMESTAMPTZ`
    ).catch(() => {});

    // Récupère le business pour le template email
    const { rows: biz } = await pool.query(
      `SELECT business_name, email AS biz_email, address AS biz_address, phone AS biz_phone
       FROM users WHERE id=$1`, [userId]
    );
    const business = biz[0] || {};

    const { rows: targets } = await pool.query(
      `SELECT id, email, first_name, last_name, unsubscribe_token
       FROM client_accounts
       WHERE user_id=$1
         AND marketing_opt_in = FALSE
         AND email IS NOT NULL AND email <> ''
         AND email NOT LIKE 'qr-%@qr.flowia.local'
         AND opt_in_invited_at IS NULL
       LIMIT 500`,
      [userId]
    );

    if (!targets.length) {
      return res.json({ ok: true, sent: 0, message: 'Aucun client à inviter (déjà invités ou opt-in).' });
    }

    const { sendOptInInvite } = require('../utils/email');
    let sent = 0, failed = 0;
    for (const c of targets) {
      try {
        await sendOptInInvite({
          to: c.email,
          clientName: [c.first_name, c.last_name].filter(Boolean).join(' '),
          businessName: business.business_name || 'Votre commerçant',
          optInToken: c.unsubscribe_token,
          businessEmail: business.biz_email,
          businessPhone: business.biz_phone,
        });
        await pool.query(
          `UPDATE client_accounts SET opt_in_invited_at = NOW() WHERE id=$1`, [c.id]
        );
        sent++;
      } catch (e) {
        failed++;
        console.warn('[OPT-IN INVITE mail err]', c.email, e.message);
      }
      await sleep(200); // throttle SMTP
    }
    res.json({ ok: true, sent, failed, total_targets: targets.length });
  } catch (e) { console.error('[OPT-IN INVITE]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;
