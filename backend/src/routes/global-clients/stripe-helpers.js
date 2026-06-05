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

  // Log diag (pas de secret) pour faciliter le debug des bugs Connect.
  console.log(`[stripeFetch] ${method} ${path}`,
    'acct=' + (opts.stripeAccount || 'platform'));

  const res = await fetch(url, fetchOpts);
  const data = await res.json();
  if (!res.ok) {
    console.error(`[stripeFetch] ${method} ${path} FAILED`,
      'status=' + res.status,
      'acct=' + (opts.stripeAccount || 'platform'),
      'error=' + (data.error?.message || 'unknown'),
      'code=' + (data.error?.code || ''),
      'type=' + (data.error?.type || ''));
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

// Cree un Customer Stripe sur le connected account du salon pour ce
// global_client. APPROCHE NO-CACHE (robustesse stricte regle 10) :
// on cree un NOUVEAU customer a chaque appel. Pas de lookup DB possible
// (la table contenait des rows stales pointant vers des customers
// inaccessibles -- legacy des bugs SDK Stripe Connect). Stripe accepte
// plusieurs customers identiques (memes metadata) -- pollution accepteee
// pour garantir la fiabilite. La table client_connected_customers reste
// pour traçabilité audit, mais n'est plus source de verite.
async function ensureConnectedCustomer(globalClientId, connectedAccountId, hint = {}) {
  if (!connectedAccountId) throw new Error('connectedAccountId requis');
  const opts = { stripeAccount: connectedAccountId };

  // Creer toujours un nouveau customer sur le connected via fetch direct
  // (header Stripe-Account explicite garanti par stripeFetch).
  const customer = await stripeFetch('POST', '/customers', {
    email:    hint.email || undefined,
    name:     hint.name  || undefined,
    metadata: {
      global_client_id: globalClientId,
      source:           'flowia_connected_clone',
    },
  }, opts);

  // VERIFY POST-CREATE : si le header Stripe-Account n'est pas pose, le
  // customer aura ete cree sur la PLATEFORME et un retrieve avec opts
  // (Stripe-Account header) va echouer avec 'No such customer'. C'est le
  // signal d'un bug fetch/header. On echoue explicitement ici plutot que
  // d'attendre le clone qui plantera plus tard.
  try {
    const verify = await stripeFetch('GET', `/customers/${customer.id}`, null, opts);
    if (!verify || verify.deleted) {
      throw new Error(`Customer ${customer.id} cree mais verify=deleted`);
    }
    if (verify.metadata?.source !== 'flowia_connected_clone') {
      throw new Error(`Customer ${customer.id} verify metadata mismatch (source=${verify.metadata?.source})`);
    }
  } catch (verifyErr) {
    console.error('[ensureConnectedCustomer/verify] FAILED',
      'cust=' + customer.id, 'acct=' + connectedAccountId,
      'err=' + verifyErr.message);
    throw new Error(`Customer ${customer.id} non disponible sur compte ${connectedAccountId}: ${verifyErr.message}`);
  }

  // Best-effort INSERT pour traçabilité.
  pool.query(
    `INSERT INTO client_connected_customers
       (global_client_id, connected_account_id, stripe_customer_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (global_client_id, connected_account_id)
       DO UPDATE SET stripe_customer_id=EXCLUDED.stripe_customer_id,
                     created_at=NOW()`,
    [globalClientId, connectedAccountId, customer.id]
  ).catch(() => { /* trace-only, pas critique */ });

  return customer.id;
}

// Clone un PaymentMethod du customer plateforme vers le connected account.
// Stripe exige `customer` car le PM source est attache a un customer
// plateforme : "The payment method you provided is attached to a customer
// so for security purposes you must provide the customer in the request."
// Donc on passe un customer connected cible (cree via ensureConnectedCustomer).
// Syntaxe per-call options pour fiabilite avec stripe-node v22.
// Clone PM plateforme -> connected via Stripe-Account header. Le param
// `customer` est le customer PLATEFORME source du PM (Stripe l'utilise pour
// authentifier l'access au PM source ; le PM clone ira sur le connected
// account via le header). Le clone resultant n'est attache a aucun customer
// cote connected -- il sera utilise directement dans le PI (single-use).
async function clonePaymentMethodToConnected({
  platformPmId, platformCustomerId, connectedAccountId,
}) {
  if (!connectedAccountId) throw new Error('connectedAccountId requis');
  if (!platformPmId)       throw new Error('platformPmId requis');
  if (!platformCustomerId) throw new Error('platformCustomerId requis');
  const cloned = await stripeFetch('POST', '/payment_methods', {
    customer:       platformCustomerId,
    payment_method: platformPmId,
  }, { stripeAccount: connectedAccountId });
  return cloned.id;
}

// ─────────────────────────────────────────────────────────────────────────
// Payment Method Domains : Google Pay / Apple Pay / Link sur compte connecte
// ─────────────────────────────────────────────────────────────────────────
// En Direct Charge, le PaymentElement est servi sur le compte CONNECTE du
// salon. Stripe n'y affiche Google Pay / Apple Pay / Link que si le domaine
// de la page (flowiapro.com) est enregistre comme "payment method domain"
// SUR CE compte connecte. La plateforme l'a deja (d'ou l'affichage passe en
// mode SetupIntent plateforme), mais pas les comptes connectes -> wallets
// masques. On l'enregistre donc automatiquement, par salon.
//
// Domaine configurable via BOOKING_PUBLIC_DOMAIN (defaut flowiapro.com).
// Nettoye d'un eventuel schema/chemin (https://, /book...).
const BOOKING_PUBLIC_DOMAIN = (process.env.BOOKING_PUBLIC_DOMAIN || 'flowiapro.com')
  .replace(/^https?:\/\//i, '')
  .replace(/\/.*$/, '')
  .trim()
  .toLowerCase();

// Enregistre (idempotent) le domaine sur un compte connecte. Liste d'abord
// pour ne pas dupliquer ; (re)valide si trouve mais desactive. Retourne
// { ok, id, existed }. Leve si l'API Stripe echoue (l'appelant decide quoi
// faire -- en pratique fail-safe : on ne casse jamais le paiement).
async function registerPaymentMethodDomainForAccount(connectedAccountId) {
  if (!connectedAccountId) return { ok: false, reason: 'no_account' };
  if (!BOOKING_PUBLIC_DOMAIN) return { ok: false, reason: 'no_domain' };
  const opts = { stripeAccount: connectedAccountId };
  // 1. Existe deja sur ce compte ?
  const list = await stripeFetch(
    'GET',
    `/payment_method_domains?domain_name=${encodeURIComponent(BOOKING_PUBLIC_DOMAIN)}&limit=1`,
    null, opts
  );
  if (list && Array.isArray(list.data) && list.data.length) {
    const dom = list.data[0];
    // Si cree mais pas encore actif, tenter une (re)validation best-effort.
    if (dom.enabled === false) {
      try { await stripeFetch('POST', `/payment_method_domains/${dom.id}/validate`, {}, opts); }
      catch (e) { console.warn('[pmDomain/validate]', connectedAccountId, e.message); }
    }
    return { ok: true, id: dom.id, existed: true };
  }
  // 2. Creer (Stripe auto-valide ; Google Pay/Link s'activent sans fichier,
  //    Apple Pay necessite en plus le fichier de verif hoste -- non bloquant).
  const created = await stripeFetch(
    'POST', '/payment_method_domains',
    { domain_name: BOOKING_PUBLIC_DOMAIN }, opts
  );
  return { ok: true, id: created.id, existed: false };
}

// Version cachee par salon (users.stripe_pm_domain_registered_at). Skip
// l'appel API si deja pose. Pose le flag apres succes. 100% fail-safe :
// toute erreur est avalee (le paiement carte fonctionne sans wallet). A
// appeler avant de renvoyer le client_secret pour que le PaymentElement
// voie les wallets des le 1er montage.
async function ensurePaymentMethodDomain(userId, connectedAccountId) {
  if (!connectedAccountId) return { ok: false, reason: 'no_account' };
  try {
    if (userId) {
      const { rows } = await pool.query(
        'SELECT stripe_pm_domain_registered_at FROM users WHERE id=$1',
        [userId]
      );
      if (rows[0]?.stripe_pm_domain_registered_at) return { ok: true, cached: true };
    }
  } catch (e) {
    // Colonne absente (migration pas encore passee) ou DB hs -> on tente
    // quand meme l'enregistrement (sans cache).
    console.warn('[pmDomain/cacheRead]', e.message);
  }
  try {
    const r = await registerPaymentMethodDomainForAccount(connectedAccountId);
    if (r.ok && userId) {
      pool.query(
        'UPDATE users SET stripe_pm_domain_registered_at=NOW() WHERE id=$1',
        [userId]
      ).catch(() => { /* flag best-effort */ });
    }
    return r;
  } catch (e) {
    console.warn('[pmDomain/register]', connectedAccountId, e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  getStripe,
  getStripeForAccount,
  stripeFetch,
  ensurePlatformCustomer,
  ensureConnectedCustomer,
  clonePaymentMethodToConnected,
  registerPaymentMethodDomainForAccount,
  ensurePaymentMethodDomain,
};
