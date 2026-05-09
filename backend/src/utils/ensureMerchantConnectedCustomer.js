// utils/ensureMerchantConnectedCustomer.js — Cree ou reutilise un Customer
// Stripe sur le compte connecte (Stripe-Account header) du merchant pour
// un client logged. Garantit que la column 'Client' du Stripe Dashboard
// est remplie a chaque PaymentIntent (visibilite + recherche merchant).
//
// 2 strategies de cache selon le scope JWT :
//   (a) clientId set        : cache via client_accounts.stripe_connected_customer_id
//                             (per-merchant). Scope='client' ou client_account
//                             linked au global_client.
//   (b) globalClientId only : cache via client_connected_customers
//                             (global_client_id, connected_account_id).
//                             Scope='global_client' sans client_account local.
//
// Self-healing : si l'ID en cache pointe vers un customer inaccessible
// (account reconnecte, customer supprime), retrieve fail -> on recree
// transparent et on update le cache.
//
// Fail-safe : si la creation Stripe echoue, on retourne null (le PI
// fonctionne quand meme, juste pas de binding dashboard). Erreurs
// loggees via console.error/warn pour diagnostic.

const { stripeFetch } = require('../routes/global-clients/stripe-helpers');

// Retrieve safe : true si le customer existe et est accessible, false
// sinon (stale ID, customer.deleted, account reconnecte, etc.).
async function _tryRetrieveCustomer(stripeAccountId, customerId) {
  try {
    await stripeFetch('GET', `/customers/${customerId}`, null, { stripeAccount: stripeAccountId });
    return true;
  } catch (rErr) {
    console.warn('[ensureCustomer retrieve fail]', rErr.message);
    return false;
  }
}

// Cree un Customer Stripe sur le compte connecte. Retourne { id } ou null.
async function _createCustomer(stripeAccountId, { clientEmail, customerName, customerMetadata }) {
  try {
    const newCust = await stripeFetch('POST', '/customers', {
      ...(clientEmail ? { email: clientEmail } : {}),
      name:     customerName,
      metadata: customerMetadata,
    }, { stripeAccount: stripeAccountId });
    return newCust?.id ? newCust : null;
  } catch (createErr) {
    console.error('[ensureCustomer create fail]', createErr.message);
    return null;
  }
}

/**
 * Recupere ou cree un Customer Stripe sur le compte connecte du merchant.
 *
 * @param {object} pool - pg Pool
 * @param {object} opts
 * @param {string} opts.merchantUserId   - FlowIA merchant user_id
 * @param {string} opts.stripeAccountId  - Compte connecte du merchant (acct_*)
 * @param {string} [opts.clientId]       - client_accounts.id (per-merchant)
 * @param {string} [opts.globalClientId] - global_clients.id (cross-merchant)
 * @param {string} [opts.clientEmail]
 * @param {string} opts.customerName     - Nom affiche column 'Client' Stripe
 * @param {object} opts.customerMetadata - Metadata Stripe Customer
 * @returns {Promise<string|null>} customer_id ou null si non logged / fail
 */
async function ensureMerchantConnectedCustomer(pool, {
  merchantUserId,
  stripeAccountId,
  clientId,
  globalClientId,
  clientEmail,
  customerName,
  customerMetadata,
}) {
  if (!merchantUserId || !stripeAccountId) return null;

  // Path (a) : clientId present -> cache per-merchant via client_accounts.
  if (clientId) {
    try {
      const { rows } = await pool.query(
        'SELECT stripe_connected_customer_id FROM client_accounts WHERE id=$1 AND user_id=$2',
        [clientId, merchantUserId]
      );
      const cached = rows[0]?.stripe_connected_customer_id || null;
      if (cached && await _tryRetrieveCustomer(stripeAccountId, cached)) {
        return cached;
      }
      // Pas de cache valide -> create + persist (fire-and-forget UPDATE).
      const created = await _createCustomer(stripeAccountId, { clientEmail, customerName, customerMetadata });
      if (!created) return null;
      pool.query(
        'UPDATE client_accounts SET stripe_connected_customer_id=$1 WHERE id=$2 AND user_id=$3',
        [created.id, clientId, merchantUserId]
      ).catch(err => console.warn('[ensureCustomer save client_accounts]', err.message));
      return created.id;
    } catch (e) {
      console.error('[ensureCustomer setup (clientId)]', e.message);
      return null;
    }
  }

  // Path (b) : globalClientId only -> cache cross-merchant via
  // client_connected_customers (composite key global_client_id +
  // connected_account_id : 1 customer par couple client-merchant).
  if (globalClientId) {
    try {
      const { rows } = await pool.query(
        `SELECT stripe_customer_id FROM client_connected_customers
          WHERE global_client_id=$1 AND connected_account_id=$2`,
        [globalClientId, stripeAccountId]
      );
      const cached = rows[0]?.stripe_customer_id || null;
      if (cached && await _tryRetrieveCustomer(stripeAccountId, cached)) {
        return cached;
      }
      const created = await _createCustomer(stripeAccountId, { clientEmail, customerName, customerMetadata });
      if (!created) return null;
      pool.query(
        `INSERT INTO client_connected_customers
           (global_client_id, connected_account_id, stripe_customer_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (global_client_id, connected_account_id)
           DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id,
                         created_at = NOW()`,
        [globalClientId, stripeAccountId, created.id]
      ).catch(err => console.warn('[ensureCustomer save ccc]', err.message));
      return created.id;
    } catch (e) {
      console.error('[ensureCustomer setup (globalClientId)]', e.message);
      return null;
    }
  }

  // Pas de client logged identifiable -> pas de customer attache.
  return null;
}

module.exports = { ensureMerchantConnectedCustomer };
