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
// pour ce global_client. Pas stocke en DB cote FlowIA (la source de verite
// est le customer plateforme). On retrouve par metadata.global_client_id.
async function ensureConnectedCustomer(globalClientId, connectedAccountId, hint = {}) {
  const stripe = getStripe();
  // Cherche par metadata via search API (Stripe : metadata['key']:'val').
  // Fallback list+filter si search indisponible (ex. compte test).
  let existing = null;
  try {
    const found = await stripe.customers.search(
      { query: `metadata['global_client_id']:'${globalClientId}'`, limit: 1 },
      { stripeAccount: connectedAccountId }
    );
    existing = found.data?.[0] || null;
  } catch {
    // Search peut etre indispo dans certaines situations -> on retombe sur
    // la creation (Stripe accepte plusieurs customers, on filtre par metadata
    // a l'usage). Acceptable pour un fallback.
  }
  if (existing) return existing.id;
  const customer = await stripe.customers.create(
    {
      email:    hint.email || undefined,
      name:     hint.name  || undefined,
      metadata: {
        global_client_id: globalClientId,
        source:           'flowia_connected_clone',
      },
    },
    { stripeAccount: connectedAccountId }
  );
  return customer.id;
}

// Clone un PaymentMethod du customer plateforme vers le customer du
// connected account du salon. Stripe : POST /v1/payment_methods avec
// payment_method=src + customer=dst, sur le connected account.
// Retourne le pm_id sur le connected account, utilisable dans le PI.
async function clonePaymentMethodToConnected({
  platformPmId, platformCustomerId, connectedAccountId, connectedCustomerId,
}) {
  const stripe = getStripe();
  // Le clone se cree SUR le connected account. Stripe accepte un PM cross-
  // account uniquement avec le couple (payment_method=src, customer=dst).
  const cloned = await stripe.paymentMethods.create(
    {
      customer:       connectedCustomerId,
      payment_method: platformPmId,
    },
    { stripeAccount: connectedAccountId }
  );
  // Note : on ne fait pas attach() apres -- create avec customer le fait deja.
  return cloned.id;
}

module.exports = {
  getStripe,
  ensurePlatformCustomer,
  ensureConnectedCustomer,
  clonePaymentMethodToConnected,
};
