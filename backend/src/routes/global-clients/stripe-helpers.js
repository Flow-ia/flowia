// src/routes/global-clients/stripe-helpers.js
// Helpers Stripe Connect pour les cartes sauvegardees globales FlowIA.
//
// Architecture "Shared Customer" :
//   - 1 customer plateforme par global_client (compte Stripe FlowIA principal)
//     -> source de verite pour les PaymentMethods sauvegardes.
//   - Quand un client paie chez un salon (Direct Charge sur compte connecte),
//     on clone le PM plateforme vers le customer du connected account du
//     salon, le temps du paiement. Stripe : "Cloning Customers across accounts".
//
// Securite : on ne stocke JAMAIS le PAN (Stripe Elements gere). On stocke
// seulement les ID Stripe (pm_xxx, cus_xxx) qui sont des tokens publics.

const { pool } = require('../../db');

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  return require('stripe')(key);
}

// Cree une instance Stripe scoped sur un connected account. Plus fiable que
// de passer { stripeAccount } en 2eme argument a chaque call -- elimine les
// edge cases ou Stripe SDK pourrait mal interpreter la signature.
function getStripeForAccount(connectedAccountId) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  if (!connectedAccountId) throw new Error('connectedAccountId requis');
  return require('stripe')(key, { stripeAccount: connectedAccountId });
}

// Garantit qu'un Customer Stripe plateforme existe pour ce global_client.
// Reuse si deja cree. INSERT atomic + check pour eviter duplication.
async function ensurePlatformCustomer(globalClientId) {
  const { rows } = await pool.query(
    `SELECT stripe_platform_customer_id, email, first_name, last_name
       FROM global_clients WHERE id=$1`,
    [globalClientId]
  );
  if (!rows.length) throw new Error('Global client introuvable');
  if (rows[0].stripe_platform_customer_id) return rows[0].stripe_platform_customer_id;

  const stripe = getStripe();
  const fullName = [rows[0].first_name, rows[0].last_name].filter(Boolean).join(' ') || undefined;
  const customer = await stripe.customers.create({
    email:    rows[0].email || undefined,
    name:     fullName,
    metadata: { global_client_id: globalClientId, source: 'flowia_platform' },
  });
  // Race-safe : si un autre process a deja set la colonne entre nos 2 SELECT,
  // notre UPDATE WHERE IS NULL ne fait rien et on retourne le customer existant.
  const { rows: upd } = await pool.query(
    `UPDATE global_clients
        SET stripe_platform_customer_id=$1
      WHERE id=$2 AND stripe_platform_customer_id IS NULL
      RETURNING stripe_platform_customer_id`,
    [customer.id, globalClientId]
  );
  if (upd.length) return customer.id;
  // Race perdue : on a cree un customer orphelin cote Stripe mais on
  // utilise celui qui est en DB. Le notre sera collecte par le menage
  // Stripe (customers sans usage). Pas critique.
  const { rows: again } = await pool.query(
    `SELECT stripe_platform_customer_id FROM global_clients WHERE id=$1`,
    [globalClientId]
  );
  return again[0].stripe_platform_customer_id;
}

// Garantit qu'un Customer Stripe existe sur le connected account du salon
// pour ce global_client. Mapping stocke en DB (client_connected_customers)
// pour eviter customers.search Stripe (cache stale -> 500 "No such customer")
// et eviter de creer 1 customer par paiement.
async function ensureConnectedCustomer(globalClientId, connectedAccountId, hint = {}) {
  // 1. Lookup DB
  const { rows: existing } = await pool.query(
    `SELECT stripe_customer_id FROM client_connected_customers
      WHERE global_client_id=$1 AND connected_account_id=$2`,
    [globalClientId, connectedAccountId]
  );
  if (existing.length) {
    // Verification souple : si le customer a ete supprime cote Stripe (rare),
    // ou pointe vers un customer qui n'existe pas sur ce connected account
    // (mismatch historique avant fix stripeAccount), on en cree un nouveau.
    let stillValid = false;
    try {
      const stripeOnAccount = getStripeForAccount(connectedAccountId);
      const cust = await stripeOnAccount.customers.retrieve(
        existing[0].stripe_customer_id
      );
      stillValid = !!(cust && !cust.deleted);
    } catch (e) {
      if (!/No such customer/i.test(e.message || '')) throw e;
      stillValid = false;
    }
    if (stillValid) return existing[0].stripe_customer_id;
    // Cleanup row stale (customer absent ou supprime cote Stripe).
    await pool.query(
      `DELETE FROM client_connected_customers
        WHERE global_client_id=$1 AND connected_account_id=$2`,
      [globalClientId, connectedAccountId]
    );
  }

  // 2. Creer cote Stripe puis INSERT DB. Race-safe via ON CONFLICT.
  const stripeOnAccount = getStripeForAccount(connectedAccountId);
  const customer = await stripeOnAccount.customers.create({
    email:    hint.email || undefined,
    name:     hint.name  || undefined,
    metadata: {
      global_client_id: globalClientId,
      source:           'flowia_connected_clone',
    },
  });
  const ins = await pool.query(
    `INSERT INTO client_connected_customers
       (global_client_id, connected_account_id, stripe_customer_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (global_client_id, connected_account_id) DO NOTHING
     RETURNING stripe_customer_id`,
    [globalClientId, connectedAccountId, customer.id]
  );
  if (ins.length) return customer.id;
  // Race perdue : un autre process a deja insere -> on relit.
  const { rows: relu } = await pool.query(
    `SELECT stripe_customer_id FROM client_connected_customers
      WHERE global_client_id=$1 AND connected_account_id=$2`,
    [globalClientId, connectedAccountId]
  );
  return relu[0]?.stripe_customer_id || customer.id;
}

// Clone un PaymentMethod du customer plateforme vers le connected account.
// Approche SIMPLIFIEE pour robustesse (regle 10 CLAUDE.md) :
//   - Pas de customer connected (eliminait une classe entiere de "No such
//     customer" liees a la consistance eventuelle Stripe / SDK header).
//   - PM clone sans customer attache : il sera utilise une fois pour ce
//     paiement uniquement, puis Stripe le cleanup auto apres ~24h s'il
//     n'est pas attache. Pas de pollution durable.
// Retourne le pm_id sur le connected account, utilisable dans le PI sans
// customer (confirm + off_session).
async function clonePaymentMethodToConnected({
  platformPmId, connectedAccountId,
}) {
  if (!connectedAccountId) throw new Error('connectedAccountId requis');
  if (!platformPmId)       throw new Error('platformPmId requis');
  const stripeOnAccount = getStripeForAccount(connectedAccountId);
  const cloned = await stripeOnAccount.paymentMethods.create({
    payment_method: platformPmId,
  });
  return cloned.id;
}

module.exports = {
  getStripe,
  getStripeForAccount,
  ensurePlatformCustomer,
  ensureConnectedCustomer,
  clonePaymentMethodToConnected,
};
