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
  stripeFetch,
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

      const stripeOpts = { stripeAccount: m.stripe_account_id };

      // ── Reuse carte sauvegardee globale FlowIA ──────────────────────────
      // Le PM source est attache au customer PLATEFORME du global_client.
      // Approche simple : on clone le PM plateforme vers le connected account
      // (via header Stripe-Account) en passant le customer PLATEFORME comme
      // proof d'access au PM source. Le PM clone n'est rattache a aucun
      // customer cote connected -- il est single-use pour ce PI uniquement.
      // Stripe accepte un PI off_session sans customer cote connected si le
      // PM est valide. Plus de creation de customer connected = plus de bug
      // 'No such customer' possible.
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
            platformPmId:        useSavedRow.stripe_platform_pm_id,
            platformCustomerId:  useSavedRow.stripe_platform_customer_id,
            connectedAccountId:  m.stripe_account_id,
          });
        } catch (e) {
          console.error('[PUB PAYMENT-INTENT/clone]',
            e.type || 'GenericError', e.code || '', e.message,
            'platformCust=' + useSavedRow.stripe_platform_customer_id,
            'acct=' + m.stripe_account_id);
          throw new Error(`Erreur clonage carte: ${e.message}`);
        }
      }

      // ── Customer Stripe sur le compte connecte du merchant ─────────────
      // Cree ou reutilise un stripe.Customer pour le client. Permet de
      // remplir le champ 'Client' dans le Stripe Dashboard du commercant et
      // de regrouper les paiements par client (recherche, historique). Auto
      // self-healing : si le customer_id stocke est invalide (account
      // disconnect/reconnect, ou customer supprime), on detecte par
      // retrieve fail et on recree.
      let connectedCustomerId = null;
      if (clientId && clientEmail) {
        try {
          // Lit le customer_id eventuellement deja sauvegarde.
          const { rows: caRow } = await pool.query(
            'SELECT stripe_connected_customer_id FROM client_accounts WHERE id=$1 AND user_id=$2',
            [clientId, m.user_id]
          );
          let savedCustId = caRow[0]?.stripe_connected_customer_id || null;

          // Verifie qu'il existe encore cote Stripe (defense contre stale ID).
          if (savedCustId) {
            try {
              await stripeFetch('GET', `/customers/${savedCustId}`, null, stripeOpts);
              connectedCustomerId = savedCustId;
            } catch (rErr) {
              // Customer disparu (account reconnecte, ou customer.deleted).
              // -> on flague pour recreer.
              console.warn('[PAYMENT customer retrieve fail]', rErr.message);
              savedCustId = null;
            }
          }

          // Pas de customer valide -> on en cree un.
          if (!savedCustId) {
            try {
              const newCust = await stripeFetch('POST', '/customers', {
                email: clientEmail,
                name:  clientName || clientEmail,
                metadata: {
                  flowia_client_id:        clientId,
                  flowia_global_client_id: globalClientId || '',
                  flowia_merchant_id:      m.user_id,
                },
              }, stripeOpts);
              if (newCust?.id) {
                connectedCustomerId = newCust.id;
                // Sauvegarde pour reuse aux prochains paiements (silent fail
                // ok : si l'UPDATE echoue, on recreera juste un customer la
                // prochaine fois — pas un drame, juste un doublon Stripe).
                pool.query(
                  'UPDATE client_accounts SET stripe_connected_customer_id=$1 WHERE id=$2 AND user_id=$3',
                  [newCust.id, clientId, m.user_id]
                ).catch(err => console.warn('[PAYMENT save customer_id]', err.message));
              }
            } catch (createErr) {
              console.error('[PAYMENT customer create fail]', createErr.message);
              // Fail-safe : on continue sans customer (PI sera quand meme
              // cree, juste pas attache a un Customer cote Stripe).
            }
          }
        } catch (e) {
          console.error('[PAYMENT customer setup]', e.message);
        }
      }

      // Description visible cote merchant (Stripe Dashboard) ET cote client
      // (recu Stripe envoye automatiquement via receipt_email). Format clair :
      // 'Salon · Prestation · Date Heure · Client'. Tronque a 500 chars
      // (limite Stripe). Ex : 'Hair Coiff Lille · Coupe Homme · 15/06/2026
      // 14:00 · Marie Dupont'.
      const dateLocale = (() => {
        try {
          const [y, mo, d] = String(date).split('-');
          return `${d}/${mo}/${y}`;
        } catch { return String(date); }
      })();
      const acompteSuffix = pct < 100 ? ` (acompte ${pct}%)` : '';
      const descParts = [
        m.business_name || 'FlowIA',
        svc[0].name,
        `${dateLocale} ${start_time}`,
        clientName || clientEmail || 'Client',
      ];
      const description = (descParts.join(' · ') + acompteSuffix).substring(0, 500);

      const piParams = {
        amount: amountCents,
        currency: 'eur',
        ...(feeCents > 0 ? { application_fee_amount: feeCents } : {}),
        description,
        // Customer Stripe sur le compte connecte (cree/reutilise plus haut).
        // Permet le binding paiement <-> client cote Stripe Dashboard du
        // merchant + recherche par client + historique paiements groupé.
        // IMPORTANT : on ne le passe PAS si on reutilise une carte clonee
        // (clonedPmId), car le PM clone est single-use et non attache a un
        // customer cote connected -> conflit avec customer + PM. Le binding
        // se fera alors uniquement via metadata + receipt_email + description.
        ...(connectedCustomerId && !clonedPmId ? { customer: connectedCustomerId } : {}),
        // receipt_email : Stripe envoie automatiquement un email recu au
        // client apres charge reussie (modele Stripe officiel + branding du
        // compte connecte). Couvre les exigences B2C (preuve de paiement,
        // facture light) sans qu'on ait a generer un PDF cote app.
        ...(clientEmail ? { receipt_email: clientEmail } : {}),
        // statement_descriptor_suffix : 22 chars max, ajoute au descripteur
        // de base du compte connecte sur le releve bancaire client. Sans ca
        // le client voit juste 'PAYMENT' sur sa carte. Sanitize : remplace
        // les caracteres interdits par espace, tronque, et evite les chiffres
        // initiaux (Stripe rejette dans certains cas).
        statement_descriptor_suffix: (() => {
          try {
            const raw = (svc[0].name || 'RDV').replace(/[<>"'\\]/g, ' ').trim();
            // Stripe : 5-22 chars, lettres/chiffres/espaces, ne peut etre que des chiffres.
            return raw.substring(0, 22);
          } catch { return 'RDV'; }
        })(),
        metadata: {
          source:        'flowia_booking',
          user_id:       m.user_id,
          slug:          req.params.slug,
          service_id,
          service_name:  (svc[0].name || '').substring(0, 200),
          date,
          start_time,
          client_id:        clientId || '',
          client_email:     clientEmail || '',
          // Nom du client (obligatoire pour identifier les clients sur Stripe
          // Dashboard - le champ 'Customer' reste vide car on n'instancie pas
          // de stripe.Customer pour rester sur le modele Direct Charges
          // simple, mais le metadata client_name + receipt_email donne la
          // meme info au merchant).
          client_name:      (clientName || '').substring(0, 200),
          global_client_id: globalClientId || '',
          promo_code_id:    promo_code_id || '',
          referral_code:    referral_code || '',
          original_amount: originalAmt.toFixed(2),
          discount_amount: discountAmt.toFixed(2),
          final_price:     finalPrice.toFixed(2),
          payment_percentage: String(pct),
          commission_rate:    String(commission),
          payment_kind:    pct < 100 ? 'deposit' : 'full',
        },
      };

      if (clonedPmId) {
        // Reuse carte sauvegardee : PM clone single-use, confirm + off_session.
        // PAS de customer cote connected (Stripe accepte le PI sans customer
        // si le PM est attache, et le PM clone est rattache temporairement).
        piParams.payment_method = clonedPmId;
        piParams.confirm        = true;
        piParams.off_session    = true;
        piParams.return_url = (process.env.FRONTEND_URL || '').split(',')[0]?.replace(/\/$/, '')
                              + `/book/${req.params.slug}/payment-return`;
      } else {
        // Carte saisie cote PaymentElement (flow standard).
        piParams.automatic_payment_methods = { enabled: true };
      }

      // stripeFetch (fetch direct API Stripe) -- contourne le bug du SDK v22
      // qui envoie stripeAccount dans le body au lieu du header Stripe-Account.
      const pi = await stripeFetch('POST', '/payment_intents', piParams, stripeOpts);

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
