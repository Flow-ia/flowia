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

// LEGACY (kept for compat): retourne aussi une instance scoped, mais on
// n'utilise plus ce pattern dans les flow critiques. La syntaxe per-call
// `(params, { stripeAccount })` est preferree car plus explicite et fiable
// avec stripe-node v22.
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
// pour ce global_client. Approche robuste :
//   1. Lookup DB (table client_connected_customers, source de verite)
//   2. Verify cote Stripe (retrieve avec stripeAccount per-call)
//   3. Si invalide/disparu -> cleanup DB + recree
//   4. Verify post-create explicite (eviter de retourner un customer qui
//      n'est pas immediatement accessible -- defense contre consistance
//      eventuelle Stripe ou mauvais routage du SDK).
async function ensureConnectedCustomer(globalClientId, connectedAccountId, hint = {}) {
  if (!connectedAccountId) throw new Error('connectedAccountId requis');
  const stripe = getStripe();
  const opts = { stripeAccount: connectedAccountId };

  // 1. Lookup DB
  const { rows: existing } = await pool.query(
    `SELECT stripe_customer_id FROM client_connected_customers
      WHERE global_client_id=$1 AND connected_account_id=$2`,
    [globalClientId, connectedAccountId]
  );
  if (existing.length) {
    let stillValid = false;
    try {
      const cust = await stripe.customers.retrieve(existing[0].stripe_customer_id, opts);
      stillValid = !!(cust && !cust.deleted);
    } catch (e) {
      if (!/No such customer/i.test(e.message || '')) throw e;
      stillValid = false;
    }
    if (stillValid) return existing[0].stripe_customer_id;
    await pool.query(
      `DELETE FROM client_connected_customers
        WHERE global_client_id=$1 AND connected_account_id=$2`,
      [globalClientId, connectedAccountId]
    );
  }

  // 2. Creer cote Stripe sur connected (syntaxe per-call options).
  const customer = await stripe.customers.create({
    email:    hint.email || undefined,
    name:     hint.name  || undefined,
    metadata: {
      global_client_id: globalClientId,
      source:           'flowia_connected_clone',
    },
  }, opts);

  // 3. Verify post-create defense -- si le SDK ne pose pas le header
  // Stripe-Account correctement, customers.retrieve va echouer ici
  // immediatement avec un message clair (au lieu d'attendre le clone).
  try {
    const verify = await stripe.customers.retrieve(customer.id, opts);
    if (!verify || verify.deleted) {
      throw new Error(`Customer ${customer.id} cree mais inaccessible immediatement`);
    }
  } catch (e) {
    console.error('[ensureConnectedCustomer/verify] FAILED',
      'cust=' + customer.id, 'acct=' + connectedAccountId, e.message);
    throw new Error(`Customer ${customer.id} non disponible sur compte ${connectedAccountId}: ${e.message}`);
  }

  // 4. INSERT DB. Race-safe via ON CONFLICT.
  const ins = await pool.query(
    `INSERT INTO client_connected_customers
       (global_client_id, connected_account_id, stripe_customer_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (global_client_id, connected_account_id) DO NOTHING
     RETURNING stripe_customer_id`,
    [globalClientId, connectedAccountId, customer.id]
  );
  if (ins.length) return customer.id;
  const { rows: relu } = await pool.query(
    `SELECT stripe_customer_id FROM client_connected_customers
      WHERE global_client_id=$1 AND connected_account_id=$2`,
    [globalClientId, connectedAccountId]
  );
  return relu[0]?.stripe_customer_id || customer.id;
}

// Clone un PaymentMethod du customer plateforme vers le connected account.
// Stripe exige `customer` car le PM source est attache a un customer
// plateforme : "The payment method you provided is attached to a customer
// so for security purposes you must provide the customer in the request."
// Donc on passe un customer connected cible (cree via ensureConnectedCustomer).
// Syntaxe per-call options pour fiabilite avec stripe-node v22.
async function clonePaymentMethodToConnected({
  platformPmId, connectedAccountId, connectedCustomerId,
}) {
  if (!connectedAccountId)  throw new Error('connectedAccountId requis');
  if (!connectedCustomerId) throw new Error('connectedCustomerId requis');
  if (!platformPmId)        throw new Error('platformPmId requis');
  const stripe = getStripe();
  const cloned = await stripe.paymentMethods.create({
    customer:       connectedCustomerId,
    payment_method: platformPmId,
  }, { stripeAccount: connectedAccountId });
  return cloned.id;
}

module.exports = {
  getStripe,
  getStripeForAccount,
  ensurePlatformCustomer,
  ensureConnectedCustomer,
  clonePaymentMethodToConnected,
};
