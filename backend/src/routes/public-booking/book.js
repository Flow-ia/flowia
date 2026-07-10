const jwt = require('jsonwebtoken');
const { pool } = require('../../db');
const { notifyNewAppointment } = require('../../utils/push');
const { sendAppointmentConfirmation } = require('../../utils/email');
const { resolveReferralForFilleul } = require('../referrals');
const { associateGlobalClient } = require('../clients');
const { validatePhone } = require('../../utils/phone');
const { toMin, toStr, getSlots, getEmployeeRanges } = require('./helpers');
const { extractClientToken } = require('../../utils/clientCookies');
const { checkQuota } = require('../../middleware/requireQuota');

module.exports = function attachBookRoute(router) {
  // ── POST /api/pub/:slug/book ────────────────────────────────────────────
  router.post('/:slug/book', async (req, res) => {
    try {
      const { rows: biz } = await pool.query(
        `SELECT bs.user_id, bs.min_notice_hours, bs.advance_booking_days,
                COALESCE(bs.timezone, 'Europe/Paris') AS timezone,
                u.business_name,
                u.online_payments_enabled, u.stripe_charges_enabled,
                u.stripe_account_id, u.booking_payment_policy
         FROM booking_settings bs
         JOIN users u ON u.id = bs.user_id
         WHERE bs.slug=$1 AND bs.is_enabled=TRUE`,
        [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const { user_id: userId, min_notice_hours, advance_booking_days,
              timezone: bizTz, business_name } = biz[0];
      // Phase 5/5 : config paiement (utilisee plus bas pour valider PI obligatoire)
      const paymentEnabled = !!(biz[0].online_payments_enabled
        && biz[0].stripe_charges_enabled && biz[0].stripe_account_id);
      const paymentPolicy = biz[0].booking_payment_policy || 'optional';
      const stripeAccountId = biz[0].stripe_account_id;

      const { service_id, employee_id, date, start_time, notes, client_token,
              payment_intent_id } = req.body;
      if (!service_id || !date || !start_time)
        return res.status(400).json({ error: 'Données manquantes.' });

      // ── Phase 5/5 : Politique paiement obligatoire ───────────────────────
      // Si le merchant a active mandatory et n'a PAS recu de payment_intent_id,
      // on refuse le booking. Sinon (optional ou pas active), on continue.
      if (paymentEnabled && paymentPolicy === 'mandatory' && !payment_intent_id) {
        return res.status(400).json({
          error: 'Paiement requis pour reserver.',
          code:  'PAYMENT_REQUIRED',
        });
      }

      // ── Commit 22 : compte client OBLIGATOIRE pour toute réservation ─────
      // Le toggle admin "require_account" est ignoré : comportement non-configurable.
      // La route exige un JWT scope='client' valide pour ce commerce.
      // Les champs nom/email/téléphone du body sont ignorés ; on lit la fiche
      // depuis client_accounts (source de vérité du compte connecté).
      let clientId = null;
      let tokenGlobalClientId = null;
      // Migration cookies HttpOnly : le token n'est plus envoyé via le body
      // par le frontend migré ; on lit en priorité le cookie ff_client_token
      // (ou le header Authorization Bearer en rétro-compat).
      const tokRaw = client_token || extractClientToken(req);
      if (tokRaw) {
        try {
          const dec = jwt.verify(tokRaw, process.env.JWT_SECRET);
          if (dec.scope === 'client' && dec.merchantId === userId) {
            clientId = dec.clientId || null;
            tokenGlobalClientId = dec.globalClientId || null;
          }
        } catch {}
      }
      if (!clientId) {
        return res.status(401).json({
          error: 'Veuillez créer un compte ou vous connecter pour réserver.',
          code: 'BOOKING_REQUIRES_ACCOUNT',
          requireAccount: true,
        });
      }

      // Admin commit 9 — restriction de reservation cross-merchant. Le client
      // peut continuer a se connecter et consulter son historique, mais ne
      // peut plus creer de nouveau RDV sur AUCUN salon FlowIA.
      if (tokenGlobalClientId) {
        const { rows: gcCheck } = await pool.query(
          'SELECT cannot_book FROM global_clients WHERE id = $1 LIMIT 1',
          [tokenGlobalClientId]
        );
        if (gcCheck.length && gcCheck[0].cannot_book) {
          return res.status(403).json({
            error: "La reservation n'est pas autorisee pour votre compte. Merci de contacter notre equipe pour plus de details.",
            code: 'CANNOT_BOOK',
          });
        }
      }

      // ── Récupérer la fiche client autoritative (nom/email/téléphone) ─────
      // Le merchant a pu supprimer la fiche locale (bouton "Supprimer client"),
      // auquel cas on tente de la recréer depuis global_clients via le token,
      // pour ne pas déconnecter un client encore valide.
      let clientRow = null;
      const fetchLocal = async () => {
        const { rows } = await pool.query(
          `SELECT id, email, first_name, last_name, phone, phone_e164,
                  COALESCE(marketing_opt_in, FALSE) AS marketing_opt_in
             FROM client_accounts WHERE id=$1 AND user_id=$2`,
          [clientId, userId]
        );
        return rows[0] || null;
      };
      clientRow = await fetchLocal();
      if (!clientRow && tokenGlobalClientId) {
        // Tenter de recréer la fiche locale depuis le compte global
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
            if (created.length) {
              clientId = created[0].id;
              clientRow = await fetchLocal();
            }
          }
        } catch (e) {
          console.error('[BOOKING] échec re-création locale:', e.message);
        }
      }
      if (!clientRow) {
        return res.status(401).json({
          error: 'Veuillez vous reconnecter à votre compte.',
          code: 'BOOKING_REQUIRES_ACCOUNT',
          requireAccount: true,
        });
      }
      const client_name  = `${clientRow.first_name || ''} ${clientRow.last_name || ''}`.trim() || clientRow.first_name || 'Client';
      const client_email = clientRow.email || null;

      // RGPD commit 20 : téléphone obligatoire + validé E.164.
      const phoneCheck = validatePhone(clientRow.phone_e164 || clientRow.phone, { required: true });
      if (!phoneCheck.valid) {
        return res.status(400).json({
          error: 'Téléphone requis sur votre profil. Merci de le compléter avant de réserver.',
          code:  'PROFILE_PHONE_REQUIRED',
        });
      }
      const clientPhoneRaw  = phoneCheck.raw;
      const clientPhoneE164 = phoneCheck.e164;
      // L'opt-in marketing vient du compte (plus de body, le client est connecté).
      const marketingOptInBody = clientRow.marketing_opt_in === true;

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

      // ── Quota mensuel RDV (plan Decouverte = 50/mois) ───────────────────
      // Cf. requireQuota.js. Cote frontend, GET /api/pub/:slug retourne deja
      // un flag `booking_blocked` qui declenche une popup bloquante a
      // l'ouverture de la page — l'utilisateur ne devrait jamais arriver
      // jusqu'ici. Ce check reste en failsafe (bypass UI / race window).
      const quotaCheck = await checkQuota(userId, 'appointment');
      if (!quotaCheck.ok) {
        if (quotaCheck.payload?.code === 'QUOTA_EXCEEDED') {
          return res.status(403).json({
            error: 'Le nombre de rendez-vous autorise est limite. Merci de prendre contact avec le commercant directement pour lever cette limite.',
            code: 'BOOKING_QUOTA_EXCEEDED',
          });
        }
        return res.status(quotaCheck.status).json(quotaCheck.payload);
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
        // Codes nominatifs : owner_client_email + target_clients='specific'.
        // Couvre fidélité, anniversaire (BDAY-*) et parrainage. Avant 24c le
        // check ne portait que sur is_loyalty_reward, laissant les codes BDAY
        // utilisables par n'importe quel client. Faille corrigée 24c.
        const isOwned = (promo.target_clients === 'specific' || promo.is_loyalty_reward)
                      && !!promo.owner_client_email;
        if (isOwned) {
          if (!client_email) {
            return res.status(400).json({ error: 'Ce code est nominatif. Identifiez-vous pour l\'utiliser.' });
          }
          if (promo.owner_client_email.toLowerCase() !== String(client_email).toLowerCase()) {
            return res.status(400).json({ error: 'Ce code est nominatif et ne peut pas être utilisé par un autre client.' });
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

      // ── Phase 5/5 : Verification PaymentIntent si fourni ────────────────
      // Si le client a paye en ligne (Stripe Elements cote front), on verifie
      // le PI cote Stripe AVANT de creer le RDV. Si KO → 400.
      let paidAmountCents = null;
      // intended_appointment_id : UUID pre-genere par payment.js, present
      // dans les metadata du PI. Utilise pour synchroniser appointments.id
      // avec la description Stripe figée 'RDV-{REF8} · ...' (description
      // jamais modifiee post-creation, conformement au requis user).
      // Fallback : si absent (PI cree avant le deploy de cette feature),
      // gen_random_uuid() cote DB comme avant.
      let intendedAppointmentId = null;
      if (payment_intent_id) {
        if (!paymentEnabled || !stripeAccountId) {
          return res.status(400).json({ error: 'Paiement non disponible chez ce commerce.' });
        }
        try {
          const { stripeFetch } = require('../global-clients/stripe-helpers');
          // expand latest_charge : un PI rembourse GARDE status='succeeded'
          // cote Stripe. Sans inspection du charge, un PI auto-refund
          // (SLOT_TAKEN race, reconciliation orphan) pouvait etre rejoue
          // pour creer un RDV 'paid' alors que l'argent a ete rendu au
          // client -> perte seche pour le commercant.
          const pi = await stripeFetch(
            'GET',
            `/payment_intents/${payment_intent_id}?expand[]=latest_charge`,
            null,
            { stripeAccount: stripeAccountId }
          );
          if (pi.status !== 'succeeded') {
            return res.status(400).json({
              error: 'Le paiement n\'est pas confirme.',
              code:  'PAYMENT_NOT_SUCCEEDED',
              pi_status: pi.status,
            });
          }
          const latestCharge = (pi.latest_charge && typeof pi.latest_charge === 'object')
            ? pi.latest_charge : null;
          if (latestCharge
              && (latestCharge.refunded || (Number(latestCharge.amount_refunded) || 0) > 0)) {
            return res.status(400).json({
              error: 'Ce paiement a deja ete rembourse. Merci de refaire un paiement pour reserver.',
              code:  'PAYMENT_REFUNDED',
            });
          }
          // Verifie que le PI a ete cree pour CETTE reservation (anti-rejeu
          // d'un PI valide d'un autre booking). On valide :
          // - user_id/service_id/date/start_time : protege contre rejeu cross-RDV
          // - slug : protege contre rejeu cross-merchant (defense en profondeur,
          //   meme si le retrieve avec stripeAccount empecherait deja le replay)
          const md = pi.metadata || {};
          if (md.user_id !== userId
              || md.service_id !== String(service_id)
              || md.date !== date
              || md.start_time !== start_time
              || (md.slug && md.slug !== req.params.slug)) {
            // Le PI (deja paye : status='succeeded' verifie plus haut) ne
            // correspond pas au creneau demande. Deux cas a distinguer :
            //   (a) PI orphelin, jamais consomme par un RDV -> le client a paye
            //       sans obtenir de reservation (ex : metadata figee sur un
            //       ancien creneau). On rembourse automatiquement, comme pour
            //       SLOT_TAKEN, afin de ne jamais le laisser debite.
            //   (b) Rejeu d'un PI DEJA utilise pour un autre RDV -> surtout PAS
            //       de refund : on annulerait le paiement d'un RDV legitime.
            // Discriminant : existence d'un appointment portant ce PI. La
            // colonne stripe_payment_intent_id est UNIQUE (globale), donc pas
            // de filtre user_id ici -> on detecte toute consommation, meme
            // cross-merchant, avant d'oser rembourser.
            const { rows: consumed } = await pool.query(
              `SELECT 1 FROM appointments WHERE stripe_payment_intent_id=$1 LIMIT 1`,
              [payment_intent_id]
            );
            let refunded = false;
            if (!consumed.length && stripeAccountId) {
              try {
                const { stripeFetch } = require('../global-clients/stripe-helpers');
                await stripeFetch('POST', '/refunds', {
                  payment_intent: payment_intent_id,
                  reason: 'requested_by_customer',
                  metadata: { reason: 'payment_mismatch', user_id: userId, slug: req.params.slug },
                }, { stripeAccount: stripeAccountId });
                refunded = true;
              } catch (refErr) {
                console.error('[BOOK PAYMENT_MISMATCH auto-refund ERR]', refErr.message);
                // AUDIT : persiste l'echec pour retry admin + notification client.
                try {
                  await pool.query(
                    `INSERT INTO failed_refunds
                       (user_id, stripe_account_id, payment_intent_id, amount_cents,
                        slug, reason, stripe_error_message)
                     VALUES ($1,$2,$3,$4,$5,'payment_mismatch',$6)
                     ON CONFLICT (payment_intent_id) WHERE resolved_at IS NULL DO NOTHING`,
                    [userId, stripeAccountId, payment_intent_id,
                     (pi.amount_received || pi.amount || null), req.params.slug, refErr.message]
                  );
                } catch (logErr) {
                  console.error('[BOOK PAYMENT_MISMATCH failed_refunds log ERR]', logErr.message);
                }
              }
            }
            return res.status(400).json({
              error: refunded
                ? 'Le paiement ne correspondait pas a cette reservation ; il a ete rembourse automatiquement. Merci de refaire votre reservation.'
                : 'Le paiement ne correspond pas a cette reservation.',
              code:     'PAYMENT_MISMATCH',
              refunded,
            });
          }
          // Verifie aussi que le PI a un marker source FlowIA (defense
          // contre un attaquant qui creerait un PI hors-flow et essaierait
          // de l'injecter, meme si stripeAccount filtering rendrait cela
          // tres difficile).
          if (md.source !== 'flowia_booking') {
            return res.status(400).json({
              error: 'Paiement non reconnu.',
              code:  'PAYMENT_INVALID_SOURCE',
            });
          }
          paidAmountCents = pi.amount_received || pi.amount;
          // Lit l'UUID pre-genere par payment.js. Format UUID v4 valide
          // attendu (regex defensive contre injection si Stripe renvoyait
          // une chaine arbitraire). Si absent ou invalide -> fallback DB.
          const candidate = String(md.intended_appointment_id || '').trim();
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) {
            intendedAppointmentId = candidate;
          }
        } catch (e) {
          console.error('[BOOK PI VERIFY ERR]', e.message);
          return res.status(400).json({
            error: 'Impossible de verifier le paiement. Merci de reessayer.',
            code:  'PAYMENT_VERIFY_FAILED',
          });
        }
      }

      // AUDIT booking #1 #2 : INSERT conditionnel anti-race-double-booking.
      // WHERE NOT EXISTS (overlap avec RDV actif) → si race entre 2 POST
      // simultanés sur le même créneau, un seul gagne (INSERT atomique PG),
      // l'autre reçoit 0 rows → 409 explicite.
      const paidStatus = payment_intent_id ? 'paid' : 'none';
      // Phase 5/5 — paid (boolean) = TRUE seulement si paiement INTEGRAL
      // (acompte → paid=FALSE, le merchant doit encaisser le reste en boutique).
      // Comparaison cents pour eviter erreurs d'arrondi flottant.
      const finalPriceCents = Math.round(finalPrice * 100);
      const isFullyPaid = !!(payment_intent_id && paidAmountCents
        && paidAmountCents >= finalPriceCents);
      // Phase 5/5 : retry idempotent. Si le client a deja reussi a creer
      // un RDV avec ce meme payment_intent_id (UNIQUE index), on retourne
      // l'existant au lieu de 23505 (cas : double-clic apres confirmation).
      let rows;
      try {
        // id : si intendedAppointmentId fourni (UUID pre-genere par
        // payment.js et present dans la PI metadata), on l'utilise pour
        // que appointments.id == REF8 visible dans description Stripe.
        // Sinon (PI legacy ou pas de paiement), DEFAULT gen_random_uuid().
        const ins = await pool.query(
        `INSERT INTO appointments
           (id, user_id, service_id, employee_id, client_id, client_name, client_email,
            client_phone, date, start_time, end_time, duration_minutes, notes, status,
            total_amount, original_amount, promo_code_id, promo_code, discount_amount,
            source, created_by_employee_id,
            stripe_payment_intent_id, payment_status, paid_amount_cents, paid_at, paid)
         SELECT COALESCE($22::uuid, gen_random_uuid()),
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'confirmed',$13,$14,$15,$16,$17,'public',NULL,
                $18,$19::varchar,$20,
                CASE WHEN $19::varchar='paid' THEN NOW() ELSE NULL END,
                $21
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
           duration_minutes, status, notes, created_at, source,
           total_amount, original_amount, promo_code_id, promo_code, discount_amount,
           stripe_payment_intent_id, payment_status, paid_amount_cents, paid_at`,
        [userId, service_id, finalEmpId, clientId, client_name, client_email||null,
         clientPhoneE164, date, start_time, end_time, duration, notes||null,
         finalPrice, originalAmt, promoCodeId, promoCodeStr, discountAmt,
         payment_intent_id || null, paidStatus, paidAmountCents, isFullyPaid,
         intendedAppointmentId]
        );
        rows = ins.rows;
      } catch (e) {
        if (e.code === '23505' && payment_intent_id
            && /stripe_payment_intent_id/i.test(e.detail || e.message || '')) {
          // PI deja utilise pour un autre RDV → recuperer ce RDV et le
          // retourner. Idempotent pour les retries client.
          const { rows: existing } = await pool.query(
            `SELECT id, user_id, service_id, employee_id, client_id,
               client_name, client_email, client_phone,
               TO_CHAR(date, 'YYYY-MM-DD') as date,
               TO_CHAR(start_time, 'HH24:MI') as start_time,
               TO_CHAR(end_time,   'HH24:MI') as end_time,
               duration_minutes, status, notes, created_at, source,
               total_amount, original_amount, promo_code_id, promo_code, discount_amount,
               stripe_payment_intent_id, payment_status, paid_amount_cents, paid_at
             FROM appointments
             WHERE stripe_payment_intent_id=$1 AND user_id=$2`,
            [payment_intent_id, userId]
          );
          if (existing.length) {
            return res.status(200).json({ ...existing[0], _idempotent_retry: true });
          }
        }
        throw e;
      }
      if (!rows.length) {
        // Race perdue OU retry idempotent : on regarde d'abord si CE meme PI
        // a deja servi a creer un RDV pour ce user (cas double-clic post-paiement).
        // Si oui → retourner ce RDV (idempotent), surtout PAS de refund.
        if (payment_intent_id) {
          const { rows: own } = await pool.query(
            `SELECT id, user_id, service_id, employee_id, client_id,
               client_name, client_email, client_phone,
               TO_CHAR(date, 'YYYY-MM-DD') as date,
               TO_CHAR(start_time, 'HH24:MI') as start_time,
               TO_CHAR(end_time,   'HH24:MI') as end_time,
               duration_minutes, status, notes, created_at, source,
               total_amount, original_amount, promo_code_id, promo_code, discount_amount,
               stripe_payment_intent_id, payment_status, paid_amount_cents, paid_at
             FROM appointments
             WHERE stripe_payment_intent_id=$1 AND user_id=$2
             LIMIT 1`,
            [payment_intent_id, userId]
          );
          if (own.length) {
            return res.status(200).json({ ...own[0], _idempotent_retry: true });
          }
        }

        // Vraie race : un AUTRE client a pris ce creneau. Si le client a paye,
        // auto-refund pour eviter qu'il paie sans avoir de RDV. Le webhook
        // charge.refunded mettra payment_status='refunded' (no-op DB ici).
        let refunded = false;
        let refundFailedReason = null;
        if (payment_intent_id && stripeAccountId) {
          try {
            const { stripeFetch } = require('../global-clients/stripe-helpers');
            await stripeFetch(
              'POST',
              '/refunds',
              {
                payment_intent: payment_intent_id,
                reason: 'requested_by_customer',
                metadata: { reason: 'slot_taken_race', user_id: userId, slug: req.params.slug },
              },
              { stripeAccount: stripeAccountId }
            );
            refunded = true;
          } catch (refErr) {
            console.error('[BOOK SLOT_TAKEN auto-refund ERR]', refErr.message);
            refundFailedReason = refErr.message;
            // AUDIT : persiste l'echec pour qu'un admin puisse retry + notifier
            // le client. Sans cette table, les fonds restent bloques sans trace.
            try {
              await pool.query(
                `INSERT INTO failed_refunds
                   (user_id, stripe_account_id, payment_intent_id, amount_cents,
                    slug, reason, stripe_error_message)
                 VALUES ($1,$2,$3,$4,$5,'slot_taken_race',$6)
                 ON CONFLICT (payment_intent_id) WHERE resolved_at IS NULL DO NOTHING`,
                [userId, stripeAccountId, payment_intent_id,
                 paidAmountCents || null, req.params.slug, refErr.message]
              );
            } catch (logErr) {
              console.error('[BOOK SLOT_TAKEN failed_refunds log ERR]', logErr.message);
            }
          }
        }
        return res.status(409).json({
          error: refunded
            ? "Ce créneau vient d'être réservé par un autre client. Votre paiement a été remboursé automatiquement."
            : (payment_intent_id
              ? "Ce créneau vient d'être réservé. Votre paiement sera remboursé par le commerçant — il a été notifié."
              : "Ce créneau vient d'être réservé par un autre client. Merci de choisir un autre horaire."),
          code: 'SLOT_TAKEN',
          payment_intent_id: payment_intent_id || null,
          refunded,
        });
      }
      const appt = rows[0];

      // ─── TRACABILITE CAISSE — paiement en ligne ───────────────────────
      // INSERT immediat de la transaction quand le RDV est paye en ligne.
      // Pourquoi sync ici (en plus du webhook payment_intent.succeeded) :
      // race condition possible — le webhook peut arriver AVANT que /book
      // soit termine. Si le webhook fire avant que l'appt soit cree, son
      // UPDATE WHERE stripe_payment_intent_id=$1 retourne 0 rows et le
      // fallback INSERT cote webhook ne s'execute pas (condition
      // upd.rowCount > 0). Resultat : aucune transaction creee.
      // -> On insere ici en sync. Le webhook reste comme backup, idempotent
      //    via UNIQUE index partiel idx_transactions_rdv_online_appt.
      // qty_total=1 (1 prestation comptee), source='rdv_online' pour
      // distinguer du 'rdv' (encaissement manuel au comptoir).
      if (payment_intent_id && paidAmountCents && paidAmountCents > 0) {
        try {
          const isFully = !!isFullyPaid;
          const cn = appt.client_name || 'client';
          const desc = isFully
            ? `Paiement en ligne RDV — ${cn}`
            : `Acompte en ligne RDV — ${cn}`;
          const now = new Date();
          // Refonte v3 : on alimente aussi payment_source / payment_status /
          // payment_type / *_cents / stripe_payment_intent_id / paid_at en
          // parallele du legacy. Cohérent avec le webhook qui fait pareil
          // (et idempotent via ON CONFLICT). stripe_fee_cents reste 0 ici
          // (pas de balance_transaction recuperee dans ce chemin sync ;
          // le webhook les remplit s'il arrive apres).
          const v3Status = isFully ? 'STRIPE_100' : 'STRIPE_ACOMPTE';
          const v3Type   = isFully ? 'full' : 'deposit';
          await pool.query(
            `INSERT INTO transactions
               (user_id, type, amount, description, employee_id, payment_method,
                date, time, datetime_iso, appointment_id, source, locked, qty_total,
                payment_source, payment_status, payment_type,
                gross_amount_cents, net_amount_cents,
                stripe_payment_intent_id, paid_at)
             VALUES ($1,'revenue',$2,$3,$4,'card_online',$5,$6,$7,$8,'rdv_online',TRUE,1,
                     'online_booking',$9,$10,
                     $11,$11,
                     $12, NOW())
             ON CONFLICT (appointment_id) WHERE source = 'rdv_online' DO NOTHING`,
            [userId, paidAmountCents / 100, desc, appt.employee_id || null,
             now.toISOString().substring(0, 10),
             now.toTimeString().substring(0, 8),
             now.toISOString(), appt.id,
             v3Status, v3Type, paidAmountCents, payment_intent_id]
          );
          // Invalide le cache stats v3 du user
          try {
            const { invalidateUserStatsCache } = require('../../utils/paymentV3');
            invalidateUserStatsCache(userId);
          } catch {}
        } catch (txErr) {
          // Erreur d'insertion ne doit PAS bloquer la reservation
          // (paiement Stripe deja confirme cote client). On log et on
          // continue. L'admin peut reconcilier via le webhook (si arrive
          // apres) ou manuellement.
          console.error('[BOOK tx insert online]', txErr.message);
        }

        // ─── ESCROW + LEDGER (sync, fix race condition webhook) ──────────
        // Le webhook payment_intent.succeeded est cense creer
        // appointment_payouts + financial_ledger entries, mais il peut
        // arriver AVANT cette fonction book.js (race condition reelle
        // observee 2026-05-12). Quand ca arrive, son UPDATE WHERE
        // stripe_payment_intent_id=$1 retourne 0 rows -> bloc escrow+ledger
        // du webhook saute -> appointment_payouts et financial_ledger vides
        // alors que transaction OK.
        // On cree donc tout en sync ici. ON CONFLICT DO NOTHING +
        // UNIQUE indexes partiels garantissent l'idempotence si le webhook
        // arrive apres (cas normal sans race).
        try {
          const { scheduleAppointmentPayout } = require('../../utils/scheduleAppointmentPayout');
          const { recordLedgerEntry } = require('../../utils/ledger');
          const { fetchStripeFeeForPI } = require('../../utils/stripeFeeForPI');

          // Recupere application_fee + stripe_fee depuis Stripe pour calculer
          // le NET REEL sur le balance Connect (= ce que le payout pourra
          // virer). Bug 2026-05-12 : sans soustraire stripe_fee, le payout
          // demande plus que dispo -> balance_insufficient -> failed apres 5
          // retries. Le helper fetchStripeFeeForPI retrieve la charge +
          // balance_transaction. Best-effort en sync (pas de retry), si fail
          // -> fallback amount=brut-app_fee et le webhook ensureFeesUpdated
          // + UPDATE escrow amount_cents rectifie.
          let appFee = 0;
          let stripeFee = 0;
          let feeSource = null;
          try {
            const Stripe = require('stripe');
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
            const pi = await stripe.paymentIntents.retrieve(
              payment_intent_id, undefined, { stripeAccount: stripeAccountId }
            );
            appFee = pi.application_fee_amount || 0;
            // best-effort sans retry (latence /book) ; webhook rattrapera.
            const feeRes = await fetchStripeFeeForPI(stripe, pi, stripeAccountId);
            if (feeRes.source === 'bt') {
              stripeFee = feeRes.stripeFee;
              feeSource = 'sync_bt';
            } else {
              feeSource = 'sync_fallback';
              console.warn('[BOOK escrow] stripe_fee unavailable (' + feeRes.error
                + ') latency=' + feeRes.latencyMs + 'ms — webhook rectifiera');
            }
          } catch (piErr) {
            console.error('[BOOK escrow PI retrieve]', piErr.message);
            feeSource = 'sync_error';
          }

          // Escrow appointment_payouts. amount = net REEL sur balance Connect.
          // Si stripeFee=0 (fallback), on insere quand meme avec amount =
          // brut - app_fee (peut etre trop eleve de 1-3% selon le moyen
          // paiement). UPDATE escrow plus tard dans le webhook si rectif.
          const netCents = paidAmountCents - appFee - stripeFee;
          if (netCents > 0) {
            await scheduleAppointmentPayout(pool, {
              appointmentId: appt.id,
              paymentIntentId: payment_intent_id,
              amountCents: netCents,
            });
          }

          // Ledger entries : payment + commission + (stripe_fee si dispo).
          // Si stripeFee=0 fallback, l'entry stripe_fee sera inseree plus
          // tard par le webhook (idempotent via UNIQUE INDEX).
          const rateSnapshot = paidAmountCents > 0
            ? Math.round((appFee / paidAmountCents) * 10000) / 100 : null;
          const paymentRes = await recordLedgerEntry(pool, {
            userId, appointmentId: appt.id, entryType: 'payment',
            amountCents: paidAmountCents, status: 'pending',
            stripePaymentIntentId: payment_intent_id,
            commissionRateSnapshot: rateSnapshot,
            metadata: { source: 'book_sync', is_fully_paid: !!isFullyPaid,
                        fee_source: feeSource },
          });
          if (appFee > 0) {
            await recordLedgerEntry(pool, {
              userId, appointmentId: appt.id, entryType: 'commission',
              amountCents: -appFee, status: 'pending',
              stripePaymentIntentId: payment_intent_id,
              commissionRateSnapshot: rateSnapshot,
              relatedLedgerId: paymentRes.id,
              metadata: { source: 'book_sync' },
            });
          }
          if (stripeFee > 0) {
            await recordLedgerEntry(pool, {
              userId, appointmentId: appt.id, entryType: 'stripe_fee',
              amountCents: -stripeFee, status: 'pending',
              stripePaymentIntentId: payment_intent_id,
              relatedLedgerId: paymentRes.id,
              metadata: { source: 'book_sync' },
            });
          }
        } catch (escrowErr) {
          // Best-effort : si echec, le webhook fera le job s'il arrive
          // apres (idempotent via ON CONFLICT). On log mais on ne bloque pas
          // la reservation (paiement Stripe deja confirme).
          console.error('[BOOK escrow+ledger create]', escrowErr.message);
        }
      }

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
          // M3r — garde atomique anti-sur-utilisation. Sans
          // `AND (max_uses IS NULL OR uses_count < max_uses)`, 2 reservations
          // concurrentes avec un code max_uses=1 (parrainage/fidelite/anniv)
          // l'incrementaient toutes deux -> code use 2x. Le UPDATE
          // conditionnel borne uses_count a max_uses ; RETURNING + warn
          // tracent la course perdue (meme pattern que transactions.js).
          const { rows: pcU } = await pool.query(
            `UPDATE promo_codes
               SET uses_count = uses_count + 1,
                   is_active  = CASE
                     WHEN max_uses IS NOT NULL AND (uses_count + 1) >= max_uses THEN FALSE
                     ELSE is_active
                   END
             WHERE id=$1
               AND (max_uses IS NULL OR uses_count < max_uses)
             RETURNING id`,
            [promoCodeId]
          );
          if (!pcU.length) {
            console.warn('[PROMO COUNT race BOOK] max_uses atteint concurrent', { promoCodeId });
          }
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
        const { bookingPageUrl } = require('../../utils/publicUrl');
        const bookingUrl = bookingPageUrl(req.params.slug);
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
          // Phase 5/5 : montant encaisse en ligne (Stripe Connect)
          paidAmountCents: paidAmountCents || null,
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
          if (!localClient && clientPhoneE164) {
            // Lookup priorité phone_e164 (E.164 normalisé). Fallback sur phone
            // (raw) pour matcher les fiches anciennes pas encore migrées.
            const r = await pool.query(
              `SELECT * FROM client_accounts
                WHERE user_id=$1 AND (phone_e164=$2 OR phone=$3)
                LIMIT 1`,
              [userId, clientPhoneE164, clientPhoneRaw]
            );
            localClient = r.rows[0] || null;
          }

          if (!localClient) {
            // 2. Créer la fiche locale (premier RDV de ce client chez ce commerçant).
            // RGPD commit 17 : marketing_opt_in transmis par le front en mode
            // résa sans compte ; ON CONFLICT ne touche pas l'opt-in existant.
            // Commit 20 : phone_e164 stocké en parallèle du phone (raw).
            const { rows: created } = await pool.query(
              `INSERT INTO client_accounts
                 (user_id, email, first_name, last_name, phone, phone_e164,
                  marketing_opt_in, marketing_opt_in_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,
                       CASE WHEN $7 THEN NOW() ELSE NULL END)
               ON CONFLICT (user_id, email) DO UPDATE SET
                 first_name = COALESCE(NULLIF(EXCLUDED.first_name,''), client_accounts.first_name),
                 phone      = COALESCE(NULLIF(EXCLUDED.phone,''),      client_accounts.phone),
                 phone_e164 = COALESCE(NULLIF(EXCLUDED.phone_e164,''), client_accounts.phone_e164)
               RETURNING *`,
              [userId, emailLow, firstName, lastName, clientPhoneRaw, clientPhoneE164, marketingOptInBody]
            );
            localClient = created[0] || null;
          }

          // 3. Si fiche locale sans compte global → tenter liaison (étapes 3+4)
          if (localClient && !localClient.global_client_id) {
            await associateGlobalClient(localClient.id, emailLow, clientPhoneE164);
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

      // Tracabilite Stripe : la description du PI est figee a sa creation
      // (payment.js l'ecrit deja au format final 'RDV-{REF8} · CLI-{IMMAT} ·
      // DD/MM/YYYY HH:MM' grace a intended_appointment_id genere a l'avance).
      // Plus de update post-creation -> conforme au requis user "la description
      // ne doit jamais changer une fois la transaction creee".
      // On enrichit uniquement la metadata avec le lien retrograde
      // appointment_id (utile pour reconciliation cote admin) -- la metadata
      // n'est pas visible cote client (recu Stripe), pas un probleme.
      if (payment_intent_id && stripeAccountId) {
        const { stripeFetch } = require('../global-clients/stripe-helpers');
        stripeFetch('POST', `/payment_intents/${payment_intent_id}`, {
          metadata: {
            appointment_id: appt.id,
            // Stripe merge la metadata : intended_appointment_id,
            // appointment_ref, flowia_immatricule, client_*, etc. posees a
            // la creation sont conserves.
          },
        }, { stripeAccount: stripeAccountId })
          .catch(err => console.warn('[BOOK PI metadata link]', err.message));
      }

      // Notification in-app + push + email transactionnel au commerçant
      // (commit 25 : email ajouté). Non-bloquant.
      notifyNewAppointment(
        userId,
        { ...appt, service_name: svcName },
        { source: 'public', withEmail: true }
      ).catch(err => console.warn('[notify new appt]', err.message));

      // Google Calendar sync (non-bloquant) : si le merchant a connecte son
      // agenda, on push l'event. Si la sync echoue, le RDV existe quand
      // meme dans FlowIA — pas de regression sur le booking.
      let empNameForCal = null;
      if (finalEmpId) {
        try {
          const { rows: emp } = await pool.query('SELECT name FROM employees WHERE id=$1', [finalEmpId]);
          empNameForCal = emp[0]?.name || null;
        } catch {}
      }
      const { pushAppointment } = require('../../utils/googleCalendar');
      pushAppointment(userId, { ...appt, status: 'confirmed' }, {
        businessName: business_name,
        serviceName:  svcName,
        employeeName: empNameForCal,
        timezone:     bizTz,
      }).catch(err => console.warn('[gcal push]', err.message));
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
