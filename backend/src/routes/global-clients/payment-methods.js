// src/routes/global-clients/payment-methods.js
// Gestion des cartes sauvegardees globales FlowIA pour le compte client.
//   GET    /me/payment-methods               -> liste
//   DELETE /me/payment-methods/:id           -> suppression (detach + cascade DB)
//   POST   /me/payment-methods/:id/default   -> definir par defaut
//
// Toutes les routes acceptent scope='client' ou scope='global_client'
// (clientOrGlobalClientAuth) -- via login chez un commercant ou via login
// FlowIA global. Le client doit AVOIR un global_client_id pour utiliser
// ces fonctionnalites (sinon 401 "Token invalide", front cache l'option).
// La source de verite est le customer plateforme Stripe FlowIA -- les cartes
// y sont attachees, et clonees vers les connected accounts a la volee lors
// d'un paiement.

const { pool } = require('../../db');
const { clientOrGlobalClientAuth } = require('./helpers');
const { getStripe, ensurePlatformCustomer } = require('./stripe-helpers');

module.exports = function attachPaymentMethods(router) {
  // ── POST /me/setup-intent ─────────────────────────────────────────────
  // Cree un SetupIntent sur la plateforme FlowIA pour sauvegarder une
  // nouvelle carte sur le customer global du client. Ce flow est independant
  // du paiement -- une fois la carte sauvegardee (webhook setup_intent.
  // succeeded), elle peut etre clonee vers n'importe quel salon connecte
  // pour payer.
  router.post('/me/setup-intent', clientOrGlobalClientAuth, async (req, res) => {
    try {
      const customerId = await ensurePlatformCustomer(req.globalClient.globalClientId);
      const stripe = getStripe();
      const si = await stripe.setupIntents.create({
        customer:           customerId,
        payment_method_types: ['card'],
        usage:              'off_session',
        metadata: {
          flowia_purpose:   'save_card',
          global_client_id: req.globalClient.globalClientId,
        },
      });
      res.json({
        client_secret:    si.client_secret,
        setup_intent_id:  si.id,
        customer_id:      customerId,
      });
    } catch (e) {
      console.error('[CPM SETUP-INTENT]', e.message);
      res.status(500).json({ error: 'Erreur creation SetupIntent.' });
    }
  });

  // ── POST /me/payment-methods/save ─────────────────────────────────────
  // Insere immediatement en DB une carte qui vient d'etre confirmee via
  // SetupIntent cote front. Sert de fallback si le webhook setup_intent.
  // succeeded est latent. Re-verifie le PM sur Stripe pour eviter un client
  // malicieux qui declarerait un pm_id qui ne lui appartient pas.
  router.post('/me/payment-methods/save', clientOrGlobalClientAuth, async (req, res) => {
    try {
      const { payment_method_id } = req.body || {};
      if (!payment_method_id) return res.status(400).json({ error: 'payment_method_id requis.' });

      const platformCustomerId = await ensurePlatformCustomer(req.globalClient.globalClientId);
      const stripe = getStripe();
      const pm = await stripe.paymentMethods.retrieve(payment_method_id);
      // Securite : le PM doit etre attache au customer plateforme du client
      // qui appelle cette route, sinon refus.
      if (pm.customer !== platformCustomerId) {
        return res.status(403).json({ error: 'Cette carte ne vous appartient pas.' });
      }
      const card = pm.card || {};
      const { rows: existing } = await pool.query(
        `SELECT 1 FROM client_payment_methods WHERE global_client_id=$1 LIMIT 1`,
        [req.globalClient.globalClientId]
      );
      const isFirst = existing.length === 0;
      // Idempotent : ON CONFLICT (global_client_id, stripe_platform_pm_id)
      const { rows: ins } = await pool.query(
        `INSERT INTO client_payment_methods
           (global_client_id, stripe_platform_pm_id, stripe_platform_customer_id,
            brand, last4, exp_month, exp_year, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (global_client_id, stripe_platform_pm_id)
           DO UPDATE SET brand=EXCLUDED.brand, last4=EXCLUDED.last4,
                         exp_month=EXCLUDED.exp_month, exp_year=EXCLUDED.exp_year
         RETURNING id, stripe_platform_pm_id, brand, last4, exp_month, exp_year, is_default`,
        [
          req.globalClient.globalClientId, pm.id, platformCustomerId,
          card.brand || null, card.last4 || null,
          card.exp_month || null, card.exp_year || null,
          isFirst,
        ]
      );
      res.json({ method: ins[0] });
    } catch (e) {
      console.error('[CPM SAVE]', e.message);
      res.status(500).json({ error: 'Erreur sauvegarde carte.' });
    }
  });

  // ── GET /me/payment-methods ───────────────────────────────────────────
  router.get('/me/payment-methods', clientOrGlobalClientAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, stripe_platform_pm_id, brand, last4, exp_month, exp_year,
                is_default, last_used_at, created_at
           FROM client_payment_methods
          WHERE global_client_id=$1
          ORDER BY is_default DESC, created_at DESC`,
        [req.globalClient.globalClientId]
      );
      res.json({ methods: rows });
    } catch (e) {
      console.error('[CPM LIST]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });

  // ── DELETE /me/payment-methods/:id ────────────────────────────────────
  router.delete('/me/payment-methods/:id', clientOrGlobalClientAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT stripe_platform_pm_id, is_default
           FROM client_payment_methods
          WHERE id=$1 AND global_client_id=$2`,
        [req.params.id, req.globalClient.globalClientId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Carte introuvable.' });

      // Detach Stripe (best-effort -- si Stripe a deja detache pour une raison
      // quelconque, l'erreur est ignoree). On supprime quand meme la ligne DB.
      try {
        const stripe = getStripe();
        await stripe.paymentMethods.detach(rows[0].stripe_platform_pm_id);
      } catch (e) {
        // PaymentMethod deja detache ou inexistant cote Stripe : on poursuit.
        if (!/No such payment_method|already been detached/i.test(e.message || '')) {
          console.warn('[CPM DETACH]', e.message);
        }
      }

      await pool.query(
        `DELETE FROM client_payment_methods
          WHERE id=$1 AND global_client_id=$2`,
        [req.params.id, req.globalClient.globalClientId]
      );

      // Si la carte supprimee etait la carte par defaut, on promeut la plus
      // recente restante en defaut (UX : il y a toujours une carte par defaut
      // si le client en a au moins une).
      if (rows[0].is_default) {
        await pool.query(
          `UPDATE client_payment_methods
              SET is_default=TRUE
            WHERE id = (
              SELECT id FROM client_payment_methods
               WHERE global_client_id=$1
               ORDER BY created_at DESC
               LIMIT 1
            )`,
          [req.globalClient.globalClientId]
        );
      }

      res.json({ ok: true });
    } catch (e) {
      console.error('[CPM DELETE]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });

  // ── POST /me/payment-methods/:id/default ──────────────────────────────
  router.post('/me/payment-methods/:id/default', clientOrGlobalClientAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: target } = await client.query(
        `SELECT id FROM client_payment_methods
          WHERE id=$1 AND global_client_id=$2`,
        [req.params.id, req.globalClient.globalClientId]
      );
      if (!target.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Carte introuvable.' });
      }
      // Reset default puis set la cible. Index unique partiel garantit
      // qu'on n'a jamais 2 lignes default pour le meme client.
      await client.query(
        `UPDATE client_payment_methods SET is_default=FALSE
          WHERE global_client_id=$1 AND is_default=TRUE`,
        [req.globalClient.globalClientId]
      );
      await client.query(
        `UPDATE client_payment_methods SET is_default=TRUE
          WHERE id=$1 AND global_client_id=$2`,
        [req.params.id, req.globalClient.globalClientId]
      );
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[CPM DEFAULT]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    } finally {
      client.release();
    }
  });
};
