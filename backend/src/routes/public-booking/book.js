const jwt = require('jsonwebtoken');
const { pool } = require('../../db');
const { notifyNewAppointment } = require('../../utils/push');
const { sendAppointmentConfirmation } = require('../../utils/email');
const { resolveReferralForFilleul } = require('../referrals');
const { associateGlobalClient } = require('../clients');
const { toMin, toStr, getSlots, getEmployeeRanges } = require('./helpers');

module.exports = function attachBookRoute(router) {
  // ── POST /api/pub/:slug/book ────────────────────────────────────────────
  router.post('/:slug/book', async (req, res) => {
    try {
      const { rows: biz } = await pool.query(
        `SELECT bs.user_id, bs.min_notice_hours, bs.advance_booking_days,
                bs.require_account, COALESCE(bs.timezone, 'Europe/Paris') AS timezone,
                u.business_name
         FROM booking_settings bs
         JOIN users u ON u.id = bs.user_id
         WHERE bs.slug=$1 AND bs.is_enabled=TRUE`,
        [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const { user_id: userId, min_notice_hours, advance_booking_days,
              require_account, timezone: bizTz, business_name } = biz[0];

      const { service_id, employee_id, date, start_time,
              client_name, client_email, client_phone, notes, client_token } = req.body;
      if (!service_id || !date || !start_time || !client_name || !client_phone)
        return res.status(400).json({ error: 'Données manquantes (nom et téléphone obligatoires).' });

      // Vérif compte obligatoire
      let clientId = null;
      let tokenGlobalClientId = null;
      if (client_token) {
        try {
          const dec = jwt.verify(client_token, process.env.JWT_SECRET);
          if (dec.scope === 'client' && dec.merchantId === userId) {
            clientId = dec.clientId || null;
            tokenGlobalClientId = dec.globalClientId || null;
          }
        } catch {}
      }
      if (require_account && !clientId)
        return res.status(403).json({ error: 'Un compte client est requis.', requireAccount: true });

      // ── Validation FK : le clientId du token pointe-t-il vers un client_accounts existant ?
      // Le merchant peut avoir supprimé la fiche locale (bouton "Supprimer client"),
      // auquel cas le token est obsolète. On recrée la fiche via globalClientId si possible,
      // sinon on passe en booking invité (clientId=null).
      if (clientId) {
        const { rows: chkLocal } = await pool.query(
          'SELECT id FROM client_accounts WHERE id=$1 AND user_id=$2',
          [clientId, userId]
        );
        if (!chkLocal.length) {
          console.warn('[BOOKING] client_token clientId obsolète:', clientId, '— tentative de re-création locale');
          clientId = null;
          // Tenter de recréer la fiche locale à partir du compte global
          if (tokenGlobalClientId) {
            try {
              const { rows: gc } = await pool.query(
                'SELECT id, email, password_hash, first_name, last_name, phone FROM global_clients WHERE id=$1',
                [tokenGlobalClientId]
              );
              if (gc.length) {
                const g = gc[0];
                const { rows: created } = await pool.query(
                  `INSERT INTO client_accounts (user_id, email, password_hash, first_name, last_name, phone, global_client_id, source)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, 'platform')
                   ON CONFLICT (user_id, email) DO UPDATE SET global_client_id = EXCLUDED.global_client_id
                   RETURNING id`,
                  [userId, g.email, g.password_hash, g.first_name, g.last_name, g.phone, g.id]
                );
                if (created.length) clientId = created[0].id;
              }
            } catch (e) {
              console.error('[BOOKING] échec re-création locale:', e.message);
            }
          }
        }
      }

      // ── Vérif blocage client ────────────────────────────────────────────
      // Vérifie si ce client (identifié par email ou clientId) est bloqué chez ce commerçant
      const emailToCheck = (client_email || '').toLowerCase().trim();
      if (clientId || emailToCheck) {
        const blockQ = clientId
          ? await pool.query('SELECT is_booking_blocked FROM client_accounts WHERE id=$1 AND user_id=$2', [clientId, userId])
          : await pool.query('SELECT is_booking_blocked FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2', [userId, emailToCheck]);
        if (blockQ.rows[0]?.is_booking_blocked) {
          return res.status(403).json({
            error: 'Ce commerçant n\'accepte plus de réservation pour vous, merci de prendre contact avec le commerçant directement.',
            blocked: true,
          });
        }
      }

      // AUDIT booking #5 + #6 + #7 : min_notice & advance_days via PG AT TIME ZONE
      // → calculs dans le fuseau du commerçant, DST géré nativement.
      const minNoticeH = Math.max(0, parseInt(min_notice_hours) || 0);
      const maxDays    = Math.max(1, parseInt(advance_booking_days) || 30);
      const { rows: tzCheck } = await pool.query(
        `SELECT
           (($1::date + $2::time) AT TIME ZONE $3) < (NOW() + ($4 || ' hours')::interval) AS too_soon,
           $1::date > ((NOW() AT TIME ZONE $3)::date + ($5 || ' days')::interval)::date AS too_far`,
        [date, start_time, bizTz, minNoticeH, maxDays]
      );
      if (tzCheck[0].too_soon)
        return res.status(400).json({ error: `Réservation impossible moins de ${minNoticeH}h à l'avance.` });
      if (tzCheck[0].too_far) {
        return res.status(400).json({
          error: `Réservation possible jusqu'à ${maxDays} jours à l'avance.`,
          code: 'ADVANCE_LIMIT',
        });
      }

      // Infos service — AUDIT #8 : vérifie is_active (sinon UUID d'un service
      // désactivé restait réservable si connu).
      const { rows: svc } = await pool.query(
        'SELECT duration_minutes, name, price, is_active FROM booking_services WHERE id=$1 AND user_id=$2',
        [service_id, userId]
      );
      if (!svc.length) return res.status(404).json({ error: 'Service introuvable.' });
      if (svc[0].is_active === false) {
        return res.status(400).json({ error: 'Ce service n\'est plus disponible.', code: 'SERVICE_INACTIVE' });
      }
      const { duration_minutes: duration, name: svcName, price } = svc[0];
      // AUDIT #14 : durée plafonnée à 8h (480 min) pour éviter un service
      // mal configuré (ex: 9999 min → end_time franchit minuit et produit un
      // TIME invalide).
      if (!Number.isFinite(duration) || duration < 1 || duration > 480) {
        return res.status(400).json({ error: 'Durée de service invalide.' });
      }

      // Normaliser start_time : on ne garde que "HH:MM" (toStr retourne "HH:MM")
      const normalizedStartTime = String(start_time).trim().substring(0, 5);

      // Vérif créneau encore libre
      const empId = employee_id && !['null','undefined',''].includes(String(employee_id))
        ? employee_id : null;
      // AUDIT #9 : si un empId spécifique est fourni, vérifier qu'il est
      // actif ET visible dans le booking (sinon UUID d'employé caché
      // réservable directement).
      if (empId) {
        const { rows: empCheck } = await pool.query(
          `SELECT is_active, show_on_booking FROM employees
            WHERE id=$1 AND user_id=$2`,
          [empId, userId]
        );
        if (!empCheck.length) return res.status(404).json({ error: 'Employé introuvable.' });
        if (!empCheck[0].is_active || !empCheck[0].show_on_booking) {
          return res.status(400).json({ error: 'Cet employé n\'est pas disponible à la réservation.', code: 'EMPLOYEE_UNAVAILABLE' });
        }
      }
      // Récupérer min_notice_hours pour valider le créneau
      const { rows: bsR } = await pool.query(
        'SELECT min_notice_hours FROM booking_settings WHERE user_id=$1', [userId]
      );
      const minNoticeMinBook = (parseInt(bsR[0]?.min_notice_hours) || 0) * 60;

      const availSlots = await getSlots(userId, empId, date, duration, minNoticeMinBook, bizTz);
      if (!availSlots.includes(normalizedStartTime))
        return res.status(409).json({ error: 'Ce créneau n\'est plus disponible ou trop proche.' });

      // Si "au premier disponible" (empId=null) → choisir le premier employé libre à ce créneau
      let finalEmpId = empId;
      if (!finalEmpId) {
        const { rows: allEmps } = await pool.query(
          'SELECT id FROM employees WHERE user_id=$1 AND is_active=TRUE AND show_on_booking=TRUE', [userId]
        );
        const slotMin = toMin(normalizedStartTime);
        const endSlotMin = slotMin + duration;
        const endSlotStr = toStr(endSlotMin);
        for (const emp of allEmps) {
          // Vérifier que le créneau est dans les plages de l'employé (pauses incluses)
          const empRanges = await getEmployeeRanges(userId, emp.id, date);
          if (!empRanges.length) continue;
          const inRange = empRanges.some(r => slotMin >= r.openMin && endSlotMin <= r.closeMin);
          if (!inRange) continue;
          const { rows: busy } = await pool.query(
            `SELECT id FROM appointments WHERE user_id=$1 AND date=$2 AND employee_id=$3
             AND status NOT IN ('cancelled')
             AND NOT (end_time <= $4::time OR start_time >= $5::time)`,
            [userId, date, emp.id, normalizedStartTime, endSlotStr]
          );
          if (!busy.length) { finalEmpId = emp.id; break; }
        }
        if (!finalEmpId) return res.status(409).json({ error: 'Ce créneau n\'est plus disponible (tous les employés complets).' });
      }

      // Calcul end_time — AUDIT #15 : rejette si le RDV dépasse minuit
      const [h, mn] = normalizedStartTime.split(':').map(Number);
      const endMin  = h * 60 + mn + duration;
      if (endMin >= 24 * 60) {
        return res.status(400).json({
          error: 'Le créneau dépasse minuit — impossible.',
          code: 'SLOT_OVERFLOW',
        });
      }
      const end_time = `${String(Math.floor(endMin / 60)).padStart(2,'0')}:${String(endMin % 60).padStart(2,'0')}`;

      // Promo : revalider entièrement le code côté serveur avant l'INSERT
      const promoCodeId  = req.body.promo_code_id || null;
      const promoCodeStr = req.body.promo_code    || null;
      const originalAmt  = parseFloat(price || 0);
      let discountAmt    = 0;
      let finalPrice     = originalAmt;
      // Contexte parrainage (rempli si réduction filleul appliquée ci-dessous)
      // Permet d'INSERT referral_uses après la création du RDV.
      let referralCtx = null;

      if (promoCodeId) {
        // Revalider le code en base : est-il encore actif, non expiré, non épuisé ?
        const { rows: promoRows } = await pool.query(
          `SELECT id, code, type, value, max_uses, uses_count, is_active,
                  valid_from, valid_until, min_purchase, target_clients,
                  is_loyalty_reward, owner_client_email
           FROM promo_codes
           WHERE id=$1 AND user_id=$2`,
          [promoCodeId, userId]
        );
        if (!promoRows.length) {
          return res.status(400).json({ error: 'Code promo introuvable.' });
        }
        const promo = promoRows[0];
        const today = new Date();

        // Vérifications séquentielles avec messages clairs
        if (!promo.is_active) {
          return res.status(400).json({ error: 'Ce code promo a déjà été utilisé ou a été désactivé.' });
        }
        if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
          return res.status(400).json({ error: 'Ce code a déjà été utilisé le nombre maximum de fois.' });
        }
        if (promo.valid_from && new Date(promo.valid_from) > today) {
          return res.status(400).json({ error: 'Ce code promo n\'est pas encore valide.' });
        }
        if (promo.valid_until && new Date(promo.valid_until) < today) {
          return res.status(400).json({ error: `Ce code promo a expiré le ${new Date(promo.valid_until).toLocaleDateString('fr-FR')}.` });
        }
        const minPurchase = parseFloat(promo.min_purchase || 0);
        if (minPurchase > 0 && originalAmt < minPurchase) {
          return res.status(400).json({ error: `Ce code nécessite un minimum de ${minPurchase.toFixed(2)} €.` });
        }
        // Code fidélité : vérifier que c'est bien le bon client
        if (promo.is_loyalty_reward && promo.owner_client_email && client_email) {
          if (promo.owner_client_email.toLowerCase() !== client_email.toLowerCase()) {
            return res.status(400).json({ error: 'Ce code de fidélité ne vous appartient pas.' });
          }
        }

        // Recalculer la remise côté serveur (ne pas faire confiance au client)
        discountAmt = promo.type === 'percent'
          ? Math.min(originalAmt, originalAmt * parseFloat(promo.value) / 100)
          : Math.min(originalAmt, parseFloat(promo.value));
        discountAmt = Math.round(discountAmt * 100) / 100;
        finalPrice  = Math.max(0, originalAmt - discountAmt);
      }

      // ── Parrainage : appliquer réduction filleul si applicable ──────────
      // Mutualisé avec la caisse (resolveReferralForFilleul) : programme actif +
      // code valide + filleul ≠ parrain + filleul nouveau (ni RDV ni transaction)
      // + quota parrain OK. Non-cumul avec code promo classique (promo gagne).
      const incomingRef = (req.body.referral_code || '').trim();
      let referralSkipReason = null;
      if (!promoCodeId && incomingRef && client_email) {
        try {
          const resolved = await resolveReferralForFilleul(
            userId, incomingRef, client_email, originalAmt
          );
          if (resolved.ok) {
            discountAmt = resolved.discount;
            finalPrice  = Math.max(0, originalAmt - discountAmt);
            referralCtx = {
              refCodeId:    resolved.refCodeId,
              filleulEmail: resolved.filleulEmail,
              parrainEmail: resolved.parrainEmail,
            };
          } else {
            referralSkipReason = resolved.reason; // surface côté front
          }
        } catch (refErr) {
          console.warn('[book referral pre]', refErr.message);
          referralSkipReason = 'server_error';
        }
      } else if (incomingRef && promoCodeId) {
        referralSkipReason = 'promo_used';
      }

      // AUDIT booking #1 #2 : INSERT conditionnel anti-race-double-booking.
      // WHERE NOT EXISTS (overlap avec RDV actif) → si race entre 2 POST
      // simultanés sur le même créneau, un seul gagne (INSERT atomique PG),
      // l'autre reçoit 0 rows → 409 explicite.
      const { rows } = await pool.query(
        `INSERT INTO appointments
           (user_id, service_id, employee_id, client_id, client_name, client_email,
            client_phone, date, start_time, end_time, duration_minutes, notes, status,
            total_amount, original_amount, promo_code_id, promo_code, discount_amount)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'confirmed',$13,$14,$15,$16,$17
          WHERE NOT EXISTS (
            SELECT 1 FROM appointments
             WHERE user_id=$1 AND employee_id=$3 AND date=$8
               AND status NOT IN ('cancelled','no_show')
               AND NOT (end_time <= $9::time OR start_time >= $10::time)
          )
         RETURNING id, user_id, service_id, employee_id, client_id,
           client_name, client_email, client_phone,
           TO_CHAR(date, 'YYYY-MM-DD') as date,
           TO_CHAR(start_time, 'HH24:MI') as start_time,
           TO_CHAR(end_time,   'HH24:MI') as end_time,
           duration_minutes, status, notes, created_at,
           total_amount, original_amount, promo_code_id, promo_code, discount_amount`,
        [userId, service_id, finalEmpId, clientId, client_name, client_email||null,
         client_phone||null, date, start_time, end_time, duration, notes||null,
         finalPrice, originalAmt, promoCodeId, promoCodeStr, discountAmt]
      );
      if (!rows.length) {
        // Race perdue : un autre client a pris ce créneau entre la vérif et l'INSERT
        return res.status(409).json({
          error: "Ce créneau vient d'être réservé par un autre client. Merci de choisir un autre horaire.",
          code: 'SLOT_TAKEN',
        });
      }
      const appt = rows[0];
      // Invalide le cache slots pour ce date (memCache 30s) — sinon un autre
      // client chargeant /slots dans les 30s voit encore le créneau libre.
      try {
        const { rows: bsC } = await pool.query('SELECT slug FROM booking_settings WHERE user_id=$1', [userId]);
        const slugC = bsC[0]?.slug;
        if (slugC) {
          global.memCache?.del(`slots:${slugC}:${date}:${finalEmpId || 'any'}:${service_id}`);
        }
      } catch {}

      // Marquer le code promo comme utilisé (uses_count + is_active si max_uses atteint)
      if (promoCodeId) {
        try {
          await pool.query(
            `UPDATE promo_codes
               SET uses_count = uses_count + 1,
                   is_active  = CASE
                     WHEN max_uses IS NOT NULL AND (uses_count + 1) >= max_uses THEN FALSE
                     ELSE is_active
                   END
             WHERE id=$1`,
            [promoCodeId]
          );
          // Log traçabilité
          await pool.query(
            `INSERT INTO promo_usage_logs
               (user_id, promo_code_id, code_snapshot, client_email, client_name,
                appointment_id, discount_applied, transaction_amount)
             VALUES ($1,$2,(SELECT code FROM promo_codes WHERE id=$2),$3,$4,$5,$6,$7)`,
            [userId, promoCodeId, client_email||null, client_name||null,
             appt.id, discountAmt, finalPrice]
          );
          // Traçabilité IA — marquer le code comme utilisé (conversion)
          await pool.query(
            `UPDATE ai_campaign_codes
               SET used_at = NOW(),
                   used_appointment_id = $1,
                   status = 'used'
             WHERE promo_code_id = $2 AND used_at IS NULL`,
            [appt.id, promoCodeId]
          ).catch(() => {});
          // Non-cumulabilité : si ce promo_code correspond à une client_rewards
          // (anniversaire, parrain_reward, fidélité), la marquer 'used'. Evite
          // qu'un même bénéfice apparaisse encore "disponible" côté caisse ou
          // page parrainage après un booking en ligne.
          await pool.query(
            `UPDATE client_rewards
                SET status='used', used_at=NOW()
              WHERE user_id=$1 AND promo_code_id=$2 AND status='available'`,
            [userId, promoCodeId]
          ).catch(() => {});
        } catch(promoErr) { console.error('[PROMO USE ERR]', promoErr.message); }
      }

      // Email de confirmation
      if (client_email) {
        let empName = null;
        if (finalEmpId) {
          const { rows: emp } = await pool.query('SELECT name FROM employees WHERE id=$1', [finalEmpId]);
          empName = emp[0]?.name || null;
        }
        const bookingUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/book/${req.params.slug}`;
        await sendAppointmentConfirmation({
          to: client_email, clientName: client_name, businessName: business_name,
          serviceName: svcName, employeeName: empName,
          date, startTime: start_time, endTime: end_time,
          durationMinutes: duration,
          price: originalAmt || null,
          finalPrice: promoCodeId ? finalPrice : null,
          discountAmount: promoCodeId ? discountAmt : null,
          promoCode: promoCodeStr,
          notes: notes||null,
          appointmentId: appt.id, bookingUrl,
        });
      }

      // ── ÉTAPE 5 : Upsert fiche locale + liaison compte global ───────────
      // Que le client soit connecté ou guest, on s'assure qu'une fiche locale existe
      // et qu'elle est liée à son compte global si disponible.
      if (client_email || client_phone || client_name) {
        try {
          const nameParts  = (client_name || '').trim().split(/\s+/);
          const firstName  = nameParts[0] || 'Client';
          const lastName   = nameParts.slice(1).join(' ') || '';
          const emailLow   = client_email ? client_email.toLowerCase().trim() : '';

          // 1. Chercher fiche locale existante par email puis téléphone
          let localClient = null;
          if (emailLow) {
            const r = await pool.query(
              'SELECT * FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2',
              [userId, emailLow]
            );
            localClient = r.rows[0] || null;
          }
          if (!localClient && client_phone) {
            const r = await pool.query(
              'SELECT * FROM client_accounts WHERE user_id=$1 AND phone=$2',
              [userId, client_phone]
            );
            localClient = r.rows[0] || null;
          }

          if (!localClient) {
            // 2. Créer la fiche locale (premier RDV de ce client chez ce commerçant)
            const { rows: created } = await pool.query(
              `INSERT INTO client_accounts (user_id, email, first_name, last_name, phone)
               VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (user_id, email) DO UPDATE SET
                 first_name = COALESCE(NULLIF(EXCLUDED.first_name,''), client_accounts.first_name),
                 phone      = COALESCE(NULLIF(EXCLUDED.phone,''), client_accounts.phone)
               RETURNING *`,
              [userId, emailLow, firstName, lastName, client_phone || null]
            );
            localClient = created[0] || null;
          }

          // 3. Si fiche locale sans compte global → tenter liaison (étapes 3+4)
          if (localClient && !localClient.global_client_id) {
            await associateGlobalClient(localClient.id, emailLow, client_phone);
          }

          // 4. Si client connecté (clientId) → mettre à jour l'appointment avec son client_id local
          if (localClient && !appt.client_id) {
            await pool.query(
              'UPDATE appointments SET client_id=$1 WHERE id=$2',
              [localClient.id, appt.id]
            );
          }
        } catch (upsertErr) {
          // Non bloquant : le RDV est créé, on log juste l'erreur
          console.warn('[book upsert client]', upsertErr.message);
        }
      }

      // ── Parrainage : enregistrer le lien filleul → code en attente ──────
      // La réduction filleul a déjà été appliquée au RDV en amont. On INSERT
      // referral_uses en 'pending' pour que la caisse valide le jour du RDV.
      if (referralCtx) {
        try {
          await pool.query(
            `INSERT INTO referral_uses
               (user_id, referral_code_id, filleul_email, appointment_id, status)
             VALUES ($1,$2,$3,$4,'pending')`,
            [userId, referralCtx.refCodeId, referralCtx.filleulEmail, appt.id]
          );
        } catch (refInsertErr) {
          console.warn('[book referral insert]', refInsertErr.message);
        }
      }

      // Enrichir la réponse avec info parrainage (applied / skipped + reason)
      // pour que le front puisse afficher un feedback clair au filleul.
      appt.referral_applied      = !!referralCtx;
      appt.referral_skip_reason  = referralCtx ? null : (referralSkipReason || null);
      res.status(201).json(appt);

      // Notification in-app + push au commerçant (non-bloquant)
      notifyNewAppointment(userId, { ...appt, service_name: svcName }).catch(err =>
        console.warn('[push new appt]', err.message)
      );
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
