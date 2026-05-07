// routes/public-booking/payment.js — Phase 5/5 : creation PaymentIntent
// pour le paiement client lors d'une reservation en ligne.
//
// Flow Direct Charge avec application_fee :
// - Le PaymentIntent est cree SUR le compte Stripe du marchand (Stripe-Account
//   header) → l'argent va direct au merchant.
// - application_fee_amount = amount × commission_rate / 100 → FlowIA preleve
//   automatiquement sa commission (atterrit sur le compte plateforme).
// - Le client paie via Stripe Elements cote frontend (clientSecret).
// - Le book.js confirme le RDV apres verification PI.status='succeeded'.

const jwt = require('jsonwebtoken');
const { pool } = require('../../db');
const { resolveReferralForFilleul } = require('../referrals');
const { extractClientToken } = require('../../utils/clientCookies');
const {
  getStripeForAccount,
  clonePaymentMethodToConnected,
} = require('../global-clients/stripe-helpers');

module.exports = function attachPaymentRoutes(router) {
  // ── POST /api/pub/:slug/booking/payment-intent ───────────────────────────
  // Cree un PaymentIntent pour la reservation en cours. Re-valide tout
  // cote serveur (prix, promo, parrainage) — ne fait JAMAIS confiance au
  // montant envoye par le client.
  router.post('/:slug/booking/payment-intent', async (req, res) => {
    try {
      const { rows: biz } = await pool.query(
        `SELECT u.id AS user_id, u.business_name, u.stripe_account_id,
                u.stripe_charges_enabled, u.online_payments_enabled,
                u.booking_payment_policy, u.booking_payment_percentage,
                u.commission_rate
         FROM booking_settings bs
         JOIN users u ON u.id = bs.user_id
         WHERE bs.slug=$1 AND bs.is_enabled=TRUE`,
        [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const m = biz[0];

      if (!m.online_payments_enabled || !m.stripe_charges_enabled || !m.stripe_account_id) {
        return res.status(400).json({ error: 'Paiement en ligne non disponible chez ce commerce.' });
      }

      const {
        service_id, date, start_time, promo_code_id, referral_code,
        use_saved_pm_id,
      } = req.body || {};
      if (!service_id || !date || !start_time) {
        return res.status(400).json({ error: 'Donnees manquantes (service_id, date, start_time).' });
      }

      // Service + prix de reference (autoritative cote serveur)
      const { rows: svc } = await pool.query(
        `SELECT id, name, price, duration_minutes, is_active
         FROM booking_services WHERE id=$1 AND user_id=$2`,
        [service_id, m.user_id]
      );
      if (!svc.length) return res.status(404).json({ error: 'Service introuvable.' });
      if (svc[0].is_active === false) {
        return res.status(400).json({ error: 'Ce service n\'est plus disponible.' });
      }
      const originalAmt = parseFloat(svc[0].price || 0);
      if (!(originalAmt > 0)) {
        return res.status(400).json({ error: 'Service gratuit : pas de paiement requis.' });
      }

      // Identite client (cookie HttpOnly ou Authorization Bearer).
      // Accepte 2 scopes : 'client' (login chez un commercant) ou 'global_client'
      // (login FlowIA global). Pour la sauvegarde de carte on a besoin du
      // globalClientId -- present dans les 2 scopes si compte FlowIA lie.
      let clientId = null;
      let clientEmail = null;
      let globalClientId = null;
      let clientName = null;
      const tok = extractClientToken(req);
      if (tok) {
        try {
          const dec = jwt.verify(tok, process.env.JWT_SECRET);
          if (dec.scope === 'client' && dec.merchantId === m.user_id) {
            clientId = dec.clientId || null;
            globalClientId = dec.globalClientId || null;
            const { rows: cli } = await pool.query(
              'SELECT email, first_name, last_name FROM client_accounts WHERE id=$1 AND user_id=$2',
              [clientId, m.user_id]
            );
            clientEmail = cli[0]?.email || null;
            clientName  = [cli[0]?.first_name, cli[0]?.last_name].filter(Boolean).join(' ') || null;
          } else if (dec.scope === 'global_client' && dec.globalClientId) {
            globalClientId = dec.globalClientId;
            const { rows: gc } = await pool.query(
              'SELECT email, first_name, last_name FROM global_clients WHERE id=$1',
              [globalClientId]
            );
            clientEmail = gc[0]?.email || null;
            clientName  = [gc[0]?.first_name, gc[0]?.last_name].filter(Boolean).join(' ') || null;
          }
        } catch {}
      }

      // Re-validation promo / parrainage (logique miroir book.js, securite)
      let discountAmt = 0;
      if (promo_code_id) {
        const { rows: promoRows } = await pool.query(
          `SELECT id, type, value, max_uses, uses_count, is_active,
                  valid_from, valid_until, min_purchase, target_clients,
                  is_loyalty_reward, owner_client_email
           FROM promo_codes WHERE id=$1 AND user_id=$2`,
          [promo_code_id, m.user_id]
        );
        if (!promoRows.length) {
          return res.status(400).json({ error: 'Code promo introuvable.' });
        }
        const p = promoRows[0];
        const today = new Date();
        if (!p.is_active
          || (p.max_uses !== null && p.uses_count >= p.max_uses)
          || (p.valid_from && new Date(p.valid_from) > today)
          || (p.valid_until && new Date(p.valid_until) < today)) {
          return res.status(400).json({ error: 'Code promo invalide ou expire.' });
        }
        const minP = parseFloat(p.min_purchase || 0);
        if (minP > 0 && originalAmt < minP) {
          return res.status(400).json({ error: `Minimum ${minP.toFixed(2)} requis.` });
        }
        const isOwned = (p.target_clients === 'specific' || p.is_loyalty_reward)
                      && !!p.owner_client_email;
        if (isOwned) {
          if (!clientEmail) {
            return res.status(400).json({ error: 'Code nominatif : connectez-vous pour l\'utiliser.' });
          }
          if (p.owner_client_email.toLowerCase() !== clientEmail.toLowerCase()) {
            return res.status(400).json({ error: 'Ce code ne vous appartient pas.' });
          }
        }
        discountAmt = p.type === 'percent'
          ? Math.min(originalAmt, originalAmt * parseFloat(p.value) / 100)
          : Math.min(originalAmt, parseFloat(p.value));
        discountAmt = Math.round(discountAmt * 100) / 100;
      } else if (referral_code && clientEmail) {
        try {
          const r = await resolveReferralForFilleul(
            m.user_id, referral_code, clientEmail, originalAmt
          );
          if (r.ok) discountAmt = r.discount;
        } catch {}
      }
      const finalPrice = Math.max(0, originalAmt - discountAmt);

      // Acompte = finalPrice × percentage / 100 (en cents)
      const pct = parseInt(m.booking_payment_percentage, 10) || 100;
      const amountCents = Math.round(finalPrice * (pct / 100) * 100);
      // Garde-fou Stripe : montant minimum 50 cents EUR (0.50 €).
      // Sinon Stripe rejette le PaymentIntent.
      if (amountCents < 50) {
        return res.status(400).json({
          error: 'Montant trop faible pour un paiement en ligne (< 0,50 €).',
        });
      }

      // Commission FlowIA → application_fee_amount (en cents).
      // Si commission_rate=0 → pas de fee, le merchant garde 100% (- frais Stripe).
      const commission = parseFloat(m.commission_rate || 0);
      const feeCents = commission > 0
        ? Math.round(amountCents * (commission / 100))
        : 0;

      // Stripe instance scoped sur le compte connecte du salon (Direct Charge).
      const stripe = getStripeForAccount(m.stripe_account_id);

      // ── Reuse carte sauvegardee globale FlowIA ──────────────────────────
      // Approche SIMPLIFIEE (robustesse) : on ne cree PAS de customer sur le
      // connected account. On clone juste le PaymentMethod plateforme vers le
      // connected (sans le rattacher a un customer), puis le PI utilise ce
      // PM directement avec confirm=true + off_session=true. Stripe accepte
      // ce pattern (PM clone single-use, cleanup auto ~24h).
      // Avantage : elimine la consistance eventuelle des customers Stripe
      // sur un connected qui vient d'etre cree, et la complexite de cache
      // DB du customer (table client_connected_customers reste pour usage
      // futur eventuel mais n'est plus utilisee par ce flow).
      let clonedPmId = null;

      if (use_saved_pm_id) {
        if (!globalClientId) {
          return res.status(401).json({ error: 'Connexion requise pour utiliser une carte sauvegardee.' });
        }
        const { rows: pmRows } = await pool.query(
          `SELECT stripe_platform_pm_id, stripe_platform_customer_id
             FROM client_payment_methods
            WHERE id=$1 AND global_client_id=$2`,
          [use_saved_pm_id, globalClientId]
        );
        if (!pmRows.length) {
          return res.status(404).json({ error: 'Carte introuvable.' });
        }
        const useSavedRow = pmRows[0];
        try {
          clonedPmId = await clonePaymentMethodToConnected({
            platformPmId:       useSavedRow.stripe_platform_pm_id,
            connectedAccountId: m.stripe_account_id,
          });
        } catch (e) {
          console.error('[PUB PAYMENT-INTENT/clone]',
            e.type || 'GenericError', e.code || '', e.message);
          throw new Error(`Erreur clonage carte: ${e.message}`);
        }
      }

      const piParams = {
        amount: amountCents,
        currency: 'eur',
        ...(feeCents > 0 ? { application_fee_amount: feeCents } : {}),
        description: `${m.business_name || 'FlowIA'} — ${svc[0].name}`,
        metadata: {
          source:        'flowia_booking',
          user_id:       m.user_id,
          slug:          req.params.slug,
          service_id,
          date,
          start_time,
          client_id:        clientId || '',
          client_email:     clientEmail || '',
          global_client_id: globalClientId || '',
          promo_code_id:    promo_code_id || '',
          referral_code:    referral_code || '',
          original_amount: originalAmt.toFixed(2),
          discount_amount: discountAmt.toFixed(2),
          final_price:     finalPrice.toFixed(2),
          payment_percentage: String(pct),
          commission_rate:    String(commission),
        },
      };

      if (clonedPmId) {
        // Reuse carte sauvegardee : confirmation immediate avec le PM clone.
        // PAS de customer cote connected (clone single-use, cleanup auto Stripe).
        // off_session=true pour SCA EU. handleNextAction cote front si 3DS.
        piParams.payment_method = clonedPmId;
        piParams.confirm        = true;
        piParams.off_session    = true;
        piParams.return_url = (process.env.FRONTEND_URL || '').split(',')[0]?.replace(/\/$/, '')
                              + `/book/${req.params.slug}/payment-return`;
      } else {
        // Carte saisie cote PaymentElement (flow standard).
        piParams.automatic_payment_methods = { enabled: true };
      }

      // L'instance stripe est deja scoped sur le connected account du salon.
      const pi = await stripe.paymentIntents.create(piParams);

      // Mise a jour last_used_at sur la carte reutilisee (best-effort).
      if (use_saved_pm_id) {
        pool.query(
          `UPDATE client_payment_methods SET last_used_at=NOW()
            WHERE id=$1 AND global_client_id=$2`,
          [use_saved_pm_id, globalClientId]
        ).catch(() => {});
      }

      res.json({
        client_secret:   pi.client_secret,
        payment_intent_id: pi.id,
        connected_account_id: m.stripe_account_id,
        amount_cents:    amountCents,
        fee_cents:       feeCents,
        currency:        'eur',
        // Le frontend utilise ces infos pour afficher le recap
        original_amount: originalAmt,
        discount_amount: discountAmt,
        final_price:     finalPrice,
        payment_percentage: pct,
        policy:          m.booking_payment_policy || 'optional',
        // Si carte sauvegardee utilisee + paiement deja confirme cote serveur,
        // le frontend peut sauter l'etape PaymentElement et appeler /book direct.
        used_saved_card:  !!clonedPmId,
        pi_status:        pi.status,
      });
    } catch (e) {
      // Log detaille cote backend pour faciliter le diagnostic. Le client
      // reçoit aussi le stripe_code/error_type pour aider au support.
      console.error('[PUB PAYMENT-INTENT ERR]',
        e.type || 'GenericError',
        e.code || '',
        e.message);
      const msg = e.type && e.type.startsWith('Stripe')
        ? (e.message || 'Erreur Stripe')
        : (e.message || 'Erreur lors de la creation du paiement.');
      res.status(500).json({
        error:        msg,
        error_type:   e.type    || 'GenericError',
        stripe_code:  e.code    || null,
        decline_code: e.decline_code || null,
        param:        e.param   || null,
      });
    }
  });
};
