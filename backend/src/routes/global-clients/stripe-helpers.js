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

// LEGACY -- conserve pour compat mais NON utilise dans les flow critiques.
function getStripeForAccount(connectedAccountId) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  if (!connectedAccountId) throw new Error('connectedAccountId requis');
  return require('stripe')(key, { stripeAccount: connectedAccountId });
}

// ─────────────────────────────────────────────────────────────────────────
// stripeFetch -- appel fetch direct a l'API Stripe pour les operations
// Connect (Direct Charges sur connected accounts). Le SDK stripe-node v22
// presentait un bug ou des comportements incoherents avec stripeAccount
// (parfois envoyait stripeAccount dans le body au lieu du header
// Stripe-Account, parfois ne posait pas le header du tout). Cette fonction
// contourne le SDK et garantit que Stripe-Account est correctement pose.
// 100% controle, pas de dependance SDK pour la partie Connect critique.
// ─────────────────────────────────────────────────────────────────────────
function flattenForStripe(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenForStripe(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object') {
          Object.assign(result, flattenForStripe(item, `${key}[${i}]`));
        } else {
          result[`${key}[${i}]`] = String(item);
        }
      });
    } else {
      result[key] = String(v);
    }
  }
  return result;
}

async function stripeFetch(method, path, body, opts = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  const url = `https://api.stripe.com/v1${path}`;
  const headers = {
    'Authorization': `Bearer ${key}`,
  };
  if (opts.stripeAccount) headers['Stripe-Account'] = opts.stripeAccount;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let fetchOpts = { method, headers };
  if (body && method !== 'GET') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const flat = flattenForStripe(body);
    fetchOpts.body = new URLSearchParams(flat).toString();
  }

  const res = await fetch(url, fetchOpts);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || `Stripe API ${res.status}`);
    err.code         = data.error?.code         || null;
    err.type         = data.error?.type         || 'StripeAPIError';
    err.param        = data.error?.param        || null;
    err.decline_code = data.error?.decline_code || null;
    err.statusCode   = res.status;
    throw err;
  }
  return data;
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
  const opts = { stripeAccount: connectedAccountId };

  // 1. Lookup DB (cache rapide).
  const { rows: existing } = await pool.query(
    `SELECT stripe_customer_id FROM client_connected_customers
      WHERE global_client_id=$1 AND connected_account_id=$2`,
    [globalClientId, connectedAccountId]
  );
  if (existing.length) {
    let stillValid = false;
    try {
      const cust = await stripeFetch('GET', `/customers/${existing[0].stripe_customer_id}`, null, opts);
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

  // 2. Creer sur le connected via fetch direct (Stripe-Account header garanti).
  const customer = await stripeFetch('POST', '/customers', {
    email:    hint.email || undefined,
    name:     hint.name  || undefined,
    metadata: {
      global_client_id: globalClientId,
      source:           'flowia_connected_clone',
    },
  }, opts);

  // 3. INSERT DB. Race-safe via ON CONFLICT.
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
  const cloned = await stripeFetch('POST', '/payment_methods', {
    customer:       connectedCustomerId,
    payment_method: platformPmId,
  }, { stripeAccount: connectedAccountId });
  return cloned.id;
}

module.exports = {
  getStripe,
  getStripeForAccount,
  stripeFetch,
  ensurePlatformCustomer,
  ensureConnectedCustomer,
  clonePaymentMethodToConnected,
};
