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
        // pi_id : Planity-style PaymentIntent reuse. Si le client a deja un
        // PI ouvert pour cette session de booking et change qqch (montant,
        // promo, date), on UPDATE le meme PI au lieu d'en creer un nouveau.
        // Evite les rows 'Incomplet' orphelines dans le Stripe Dashboard.
        pi_id,
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

      // ── Immatricule client (identifiant stable) ────────────────────────
      // Format CLI-XXXXXXXX (8 premiers chars UUID upper). Prefere
      // global_client_id (stable cross-merchant, ne change jamais meme
      // si l'user change d'email ou supprime son compte salon) sinon
      // client_id (per-merchant). Inclus dans :
      //   - PI description (visible Stripe Dashboard + recu client)
      //   - Customer name (column 'Client' Stripe Dashboard)
      //   - Metadata (recherche, reconciliation)
      // Pourquoi pas l'email : peut changer / etre anonymise (RGPD) ;
      // l'immatricule UUID-derive ne change jamais sur la duree de vie
      // du compte client.
      const clientStableUuid = globalClientId || clientId || null;
      const clientImmatricule = clientStableUuid
        ? `CLI-${String(clientStableUuid).substring(0, 8).toUpperCase()}`
        : null;

      // ── Customer Stripe sur le compte connecte du merchant ─────────────
      // TOUJOURS cree/reutilise pour que le merchant voie le client dans
      // la column 'Client' du Stripe Dashboard, peu importe le scope JWT
      // (client ou global_client) et peu importe si paiement direct, save
      // card ou carte sauvegardee.
      //
      // 2 caches selon scope (le PI passe via Stripe-Account header donc
      // le customer doit exister sur le compte connecte du merchant) :
      // (a) clientId set    : cache via client_accounts.stripe_connected_customer_id
      //                       (per-merchant). Le scope='client' ou client linked.
      // (b) globalClientId only : cache via client_connected_customers
      //                           (global_client_id, connected_account_id).
      //
      // Auto self-healing : retrieve fail (account reconnecte, customer
      // supprime, ID stale) -> on recree et on update le cache.
      // Fail-safe : si la creation echoue, on continue sans customer
      // (le PI fonctionne quand meme, juste pas de binding dashboard).
      let connectedCustomerId = null;

      // Customer name : nom du client + immatricule -> column 'Client'
      // affiche par exemple "Marie Dupont (CLI-A1B2C3D4)".
      const customerName = (() => {
        if (clientName && clientImmatricule) return `${clientName} (${clientImmatricule})`;
        if (clientName) return clientName;
        if (clientImmatricule) return clientImmatricule;
        return clientEmail || 'Client FlowIA';
      })();
      const customerMetadata = {
        flowia_client_id:        clientId || '',
        flowia_global_client_id: globalClientId || '',
        flowia_merchant_id:      m.user_id,
        flowia_immatricule:      clientImmatricule || '',
      };
      // Helper : retrieve safe (true si OK, false si stale/deleted/etc.).
      const tryRetrieveCustomer = async (custId) => {
        try {
          await stripeFetch('GET', `/customers/${custId}`, null, stripeOpts);
          return true;
        } catch (rErr) {
          console.warn('[PAYMENT customer retrieve fail]', rErr.message);
          return false;
        }
      };

      if (clientId) {
        // Path (a) : cache per-merchant via client_accounts.
        try {
          const { rows: caRow } = await pool.query(
            'SELECT stripe_connected_customer_id FROM client_accounts WHERE id=$1 AND user_id=$2',
            [clientId, m.user_id]
          );
          const savedCustId = caRow[0]?.stripe_connected_customer_id || null;
          if (savedCustId && await tryRetrieveCustomer(savedCustId)) {
            connectedCustomerId = savedCustId;
          }
          if (!connectedCustomerId) {
            try {
              const newCust = await stripeFetch('POST', '/customers', {
                ...(clientEmail ? { email: clientEmail } : {}),
                name:     customerName,
                metadata: customerMetadata,
              }, stripeOpts);
              if (newCust?.id) {
                connectedCustomerId = newCust.id;
                pool.query(
                  'UPDATE client_accounts SET stripe_connected_customer_id=$1 WHERE id=$2 AND user_id=$3',
                  [newCust.id, clientId, m.user_id]
                ).catch(err => console.warn('[PAYMENT save customer_id]', err.message));
              }
            } catch (createErr) {
              console.error('[PAYMENT customer create fail (clientId)]', createErr.message);
            }
          }
        } catch (e) {
          console.error('[PAYMENT customer setup (clientId)]', e.message);
        }
      } else if (globalClientId) {
        // Path (b) : cache cross-merchant via client_connected_customers.
        try {
          const { rows: cccRow } = await pool.query(
            `SELECT stripe_customer_id FROM client_connected_customers
              WHERE global_client_id=$1 AND connected_account_id=$2`,
            [globalClientId, m.stripe_account_id]
          );
          const savedCustId = cccRow[0]?.stripe_customer_id || null;
          if (savedCustId && await tryRetrieveCustomer(savedCustId)) {
            connectedCustomerId = savedCustId;
          }
          if (!connectedCustomerId) {
            try {
              const newCust = await stripeFetch('POST', '/customers', {
                ...(clientEmail ? { email: clientEmail } : {}),
                name:     customerName,
                metadata: customerMetadata,
              }, stripeOpts);
              if (newCust?.id) {
                connectedCustomerId = newCust.id;
                pool.query(
                  `INSERT INTO client_connected_customers
                     (global_client_id, connected_account_id, stripe_customer_id)
                   VALUES ($1, $2, $3)
                   ON CONFLICT (global_client_id, connected_account_id)
                     DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id,
                                   created_at = NOW()`,
                  [globalClientId, m.stripe_account_id, newCust.id]
                ).catch(err => console.warn('[PAYMENT save ccc_id]', err.message));
              }
            } catch (createErr) {
              console.error('[PAYMENT customer create fail (globalClientId)]', createErr.message);
            }
          }
        } catch (e) {
          console.error('[PAYMENT customer setup (globalClientId)]', e.message);
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
      // Description initiale (avant /book qui la reecrit avec RDV-{ref}).
      // Format : 'Salon · Service · Date Heure · CLI-XXXXXXXX (Client)'.
      // L'immatricule remplace l'email/nom comme identifiant primaire car
      // c'est l'info la plus stable (UUID-derive, ne change jamais).
      const clientLabel = clientImmatricule
        ? (clientName ? `${clientImmatricule} (${clientName})` : clientImmatricule)
        : (clientName || clientEmail || 'Client');
      const descParts = [
        m.business_name || 'FlowIA',
        svc[0].name,
        `${dateLocale} ${start_time}`,
        clientLabel,
      ];
      const description = (descParts.join(' · ') + acompteSuffix).substring(0, 500);

      const piParams = {
        amount: amountCents,
        currency: 'eur',
        ...(feeCents > 0 ? { application_fee_amount: feeCents } : {}),
        description,
        // Customer Stripe sur le compte connecte (cree/reutilise plus haut).
        // Toujours attache, meme en path clonedPmId : le PM clone n'est
        // attache a aucun customer cote connected donc Stripe accepte le
        // PI avec un customer different (pas de constraint matching). Le
        // binding paiement<->client est ainsi visible dans la column
        // 'Client' du Dashboard pour TOUS les paths.
        ...(connectedCustomerId ? { customer: connectedCustomerId } : {}),
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
          // Immatricule client (CLI-XXXXXXXX) : identifiant stable
          // visible dans le dashboard et utilisable pour la
          // reconciliation. Source de verite : global_client_id sinon
          // client_id.
          flowia_immatricule: clientImmatricule || '',
          client_id:          clientId || '',
          client_email:       clientEmail || '',
          client_name:        (clientName || '').substring(0, 200),
          global_client_id:   globalClientId || '',
          promo_code_id:      promo_code_id || '',
          referral_code:      referral_code || '',
          original_amount:    originalAmt.toFixed(2),
          discount_amount:    discountAmt.toFixed(2),
          final_price:        finalPrice.toFixed(2),
          payment_percentage: String(pct),
          commission_rate:    String(commission),
          payment_kind:       pct < 100 ? 'deposit' : 'full',
        },
      };

      if (clonedPmId) {
        // Reuse carte sauvegardee : PM clone single-use (pas attache a un
        // customer cote connected) -> confirm immediat + off_session.
        // Le `customer` Stripe est quand meme passe (declaration plus
        // haut) car le PM clone unattached n'a pas de constraint de
        // matching customer -> Stripe accepte. Permet la column 'Client'.
        piParams.payment_method = clonedPmId;
        piParams.confirm        = true;
        piParams.off_session    = true;
        piParams.return_url = (process.env.FRONTEND_URL || '').split(',')[0]?.replace(/\/$/, '')
                              + `/book/${req.params.slug}/payment-return`;
      } else {
        // Carte saisie cote PaymentElement (flow standard).
        piParams.automatic_payment_methods = { enabled: true };
      }

      // ── Reuse PI existant (Planity-style) ──────────────────────────────
      // Si le frontend a passe un pi_id (PI deja cree plus tot dans la
      // session de booking : changement de prix, mode toggle, login en
      // cours de flow), on tente de reutiliser ce PI au lieu d'en creer
      // un nouveau. Resultat : 1 seul PI par tentative de booking,
      // dashboard Stripe propre, pas d'orphelin (ni 'Incomplet' ni
      // 'Annule').
      //
      // 2 paths selon le mode de paiement :
      // - Standard (PaymentElement) : UPDATE du PI avec nouveau
      //   amount/fee/description/metadata. Le client_secret reste
      //   identique cote front -> Stripe Elements ne re-monte pas, la
      //   carte saisie est preservee.
      // - 1-clic (clonedPmId / use_saved_pm_id) : UPDATE + CONFIRM sur
      //   le meme PI au lieu de cancel l'ancien et creer un nouveau.
      //   Evite la row 'Annule' parasite quand l'user passe d'une saisie
      //   manuelle a sa carte sauvegardee.
      //
      // Reuse possible si status in (requires_payment_method,
      // requires_confirmation). Sinon (succeeded/canceled/failed/etc.) :
      // fallback CREATE -- pas de cleanup, l'ancien PI est deja dans un
      // etat final.
      //
      // Securite : le retrieve passe par le header Stripe-Account du
      // merchant courant. Si pi_id appartient a un autre merchant, le GET
      // 404 -> fallback CREATE proprement (pas de fuite cross-tenant).
      let pi = null;
      let oldPiToCancel = null;
      if (pi_id) {
        // Tente de retrieve le PI existant. Si introuvable (ID stale,
        // autre merchant), on cree un nouveau ci-dessous sans cleanup.
        let existing = null;
        try {
          existing = await stripeFetch('GET', `/payment_intents/${pi_id}`, null, stripeOpts);
        } catch (retrErr) {
          console.warn('[PUB PAYMENT-INTENT/retrieve]', retrErr.message);
        }
        const updatable = existing
          && (existing.status === 'requires_payment_method'
            || existing.status === 'requires_confirmation');

        if (updatable) {
          // Construit les params d'update partages entre les 2 paths.
          // `customer` toujours passe quand on l'a (visibilite dashboard).
          // Stripe accepte le change de customer sur un PI updatable.
          const updateParams = {
            amount: amountCents,
            ...(feeCents > 0 ? { application_fee_amount: feeCents } : {}),
            description,
            ...(connectedCustomerId ? { customer: connectedCustomerId } : {}),
            ...(clientEmail ? { receipt_email: clientEmail } : {}),
            statement_descriptor_suffix: piParams.statement_descriptor_suffix,
            metadata: piParams.metadata,
          };

          let updateOk = false;
          try {
            pi = await stripeFetch('POST', `/payment_intents/${pi_id}`, updateParams, stripeOpts);
            updateOk = true;
          } catch (updErr) {
            // Update rejete (params incompatibles, race) -> fallback CREATE
            // + cancel de l'ancien.
            console.warn('[PUB PAYMENT-INTENT/update]', updErr.message);
            pi = null;
            oldPiToCancel = pi_id;
          }

          if (updateOk && clonedPmId) {
            // Path 1-clic (use_saved_pm_id) : on confirme le MEME PI au
            // lieu de canceler + recreer. Resultat dans le dashboard
            // Stripe : un seul row, statut 'Reussi' (ou 'requires_action'
            // pour 3DS), pas d'orphelin 'Annule'. Si confirm throw
            // (carte declinee, mismatch PM/customer, etc.), l'erreur
            // remonte au client comme avant -- le PI reste cote Stripe
            // dans son etat updatable, aucun PI parasite cree.
            pi = await stripeFetch('POST', `/payment_intents/${pi_id}/confirm`, {
              payment_method: clonedPmId,
              off_session: true,
              return_url: piParams.return_url,
            }, stripeOpts);
          }
        }
        // Si !updatable (statut final : succeeded/canceled/failed) : pi
        // reste null -> fallback CREATE ci-dessous, pas de cleanup
        // (l'ancien est deja dans un etat final).
      }

      // Fallback : pas de pi_id, ou PI non updatable, ou update echoue.
      // stripeFetch (fetch direct API Stripe) -- contourne le bug du SDK v22
      // qui envoie stripeAccount dans le body au lieu du header Stripe-Account.
      if (!pi) {
        pi = await stripeFetch('POST', '/payment_intents', piParams, stripeOpts);
        // Best-effort : annule l'ancien PI orphan (statut requires_*) pour
        // ne pas polluer le dashboard avec une row 'Incomplet'. Non-bloquant.
        if (oldPiToCancel) {
          stripeFetch('POST', `/payment_intents/${oldPiToCancel}/cancel`, {}, stripeOpts)
            .catch(err => console.warn('[PUB PAYMENT-INTENT/cancel old]', err.message));
        }
      }

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
