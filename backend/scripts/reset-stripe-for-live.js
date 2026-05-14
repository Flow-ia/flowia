// scripts/reset-stripe-for-live.js — nettoie les references Stripe TEST en DB
// avant la bascule vers les cles sk_live_. Tous les acct_/cus_/pi_/pm_ crees
// en TEST sont invalides en LIVE et causent des 404 "No such X" sur tout
// appel API ulterieur.
//
// PORTEE :
//   - users : NULL les colonnes stripe_account_*, stripe_customer_id,
//             stripe_subscription_id, et passe charges_enabled/payouts_enabled
//             a FALSE. Force chaque marchand a refaire son onboarding Connect
//             et son abonnement en LIVE.
//   - appointment_payouts : DELETE des entries 'pending' (sinon le cron
//             releasePayouts tente Stripe.payouts.create sur des acct_ TEST
//             inexistants -> retry_count croissant + bruit logs).
//   - client_payment_methods : DELETE ALL (les pm_ TEST n'existent pas en LIVE).
//   - client_connected_customers : DELETE ALL (cache cus_ TEST sur acct_ TEST).
//
// NE TOUCHE PAS :
//   - appointments, transactions, financial_ledger : historique conservatoire
//     (immuable / FEC), aucun appel Stripe declenche retroactivement.
//
// USAGE :
//   cd backend
//   node scripts/reset-stripe-for-live.js              # dry-run (lecture seule)
//   node scripts/reset-stripe-for-live.js --apply      # execute en transaction
//
// IDEMPOTENT : peut etre relance, ne casse rien si deja propre.

require('dotenv').config();
const { pool } = require('../src/db');

const APPLY = process.argv.includes('--apply');
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const KEY_MODE = STRIPE_KEY.startsWith('sk_live_') ? 'LIVE'
  : STRIPE_KEY.startsWith('sk_test_') ? 'TEST'
  : 'UNKNOWN';

function pad(s, n) { return String(s).padEnd(n); }

(async () => {
  const client = await pool.connect();
  let txStarted = false;
  try {
    console.log('=== reset-stripe-for-live ===');
    console.log('Mode cle Stripe detectee : ' + KEY_MODE);
    console.log('Mode execution           : ' + (APPLY ? 'APPLY (ecrit en DB)' : 'DRY-RUN (lecture seule)'));
    console.log('');

    // ── 1. Compter avant ─────────────────────────────────────────────────
    const counts = {};

    const q1 = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE stripe_account_id        IS NOT NULL)::int AS users_account,
        COUNT(*) FILTER (WHERE stripe_customer_id       IS NOT NULL)::int AS users_customer,
        COUNT(*) FILTER (WHERE stripe_subscription_id   IS NOT NULL)::int AS users_subscription,
        COUNT(*) FILTER (WHERE stripe_charges_enabled   = TRUE)::int      AS users_charges,
        COUNT(*) FILTER (WHERE stripe_payouts_enabled   = TRUE)::int      AS users_payouts,
        COUNT(*) FILTER (WHERE stripe_account_id_archived IS NOT NULL)::int AS users_archived
        FROM users
    `);
    counts.users = q1.rows[0];

    const q2 = await client.query(`SELECT COUNT(*)::int AS n FROM appointment_payouts WHERE status = 'pending'`);
    counts.appointment_payouts_pending = q2.rows[0].n;

    const q3 = await client.query(`SELECT COUNT(*)::int AS n FROM client_payment_methods`);
    counts.client_payment_methods = q3.rows[0].n;

    const q4 = await client.query(`SELECT COUNT(*)::int AS n FROM client_connected_customers`);
    counts.client_connected_customers = q4.rows[0].n;

    console.log('── ETAT ACTUEL (sera modifie) ─────────────────────────────────────');
    console.log(pad('users.stripe_account_id NOT NULL', 45)       + counts.users.users_account);
    console.log(pad('users.stripe_customer_id NOT NULL', 45)      + counts.users.users_customer);
    console.log(pad('users.stripe_subscription_id NOT NULL', 45)  + counts.users.users_subscription);
    console.log(pad('users.stripe_charges_enabled = TRUE', 45)    + counts.users.users_charges);
    console.log(pad('users.stripe_payouts_enabled = TRUE', 45)    + counts.users.users_payouts);
    console.log(pad('users.stripe_account_id_archived NOT NULL', 45) + counts.users.users_archived);
    console.log(pad("appointment_payouts WHERE status='pending'", 45) + counts.appointment_payouts_pending);
    console.log(pad('client_payment_methods (ALL)', 45)           + counts.client_payment_methods);
    console.log(pad('client_connected_customers (ALL)', 45)       + counts.client_connected_customers);
    console.log('');

    if (!APPLY) {
      console.log('DRY-RUN termine. Relancer avec --apply pour executer.');
      console.log('');
      console.log('Commande exacte :');
      console.log('  node scripts/reset-stripe-for-live.js --apply');
      return;
    }

    // ── 2. Apply en transaction ──────────────────────────────────────────
    if (KEY_MODE === 'LIVE') {
      console.log('!!! ATTENTION : cle STRIPE_SECRET_KEY est sk_live_. Ce script');
      console.log('!!! va effacer des references Stripe en DB. Aucune verif Stripe');
      console.log('!!! API n est faite -- on assume que les IDs sont TEST.');
      console.log('');
    }

    await client.query('BEGIN');
    txStarted = true;

    const u = await client.query(`
      UPDATE users SET
        stripe_account_id            = NULL,
        stripe_account_email         = NULL,
        stripe_account_id_archived   = NULL,
        stripe_account_connected_at  = NULL,
        stripe_charges_enabled       = FALSE,
        stripe_payouts_enabled       = FALSE,
        stripe_customer_id           = NULL,
        stripe_subscription_id       = NULL
      WHERE stripe_account_id          IS NOT NULL
         OR stripe_account_email       IS NOT NULL
         OR stripe_account_id_archived IS NOT NULL
         OR stripe_account_connected_at IS NOT NULL
         OR stripe_charges_enabled      = TRUE
         OR stripe_payouts_enabled      = TRUE
         OR stripe_customer_id          IS NOT NULL
         OR stripe_subscription_id      IS NOT NULL
    `);
    console.log('users mis a jour                       : ' + u.rowCount);

    const ap = await client.query(`DELETE FROM appointment_payouts WHERE status = 'pending'`);
    console.log("appointment_payouts 'pending' supprimes : " + ap.rowCount);

    const cpm = await client.query(`DELETE FROM client_payment_methods`);
    console.log('client_payment_methods supprimes       : ' + cpm.rowCount);

    const ccc = await client.query(`DELETE FROM client_connected_customers`);
    console.log('client_connected_customers supprimes   : ' + ccc.rowCount);

    await client.query('COMMIT');
    txStarted = false;

    console.log('');
    console.log('Transaction commit. La DB est prete pour la bascule LIVE.');
    console.log('Prochaines etapes manuelles :');
    console.log('  1. Verifier que STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET sont sk_live_ sur Render');
    console.log('  2. Chaque marchand doit refaire /reglages/paiements -> Connecter Stripe');
    console.log('  3. Chaque marchand doit re-souscrire son abonnement (Essentiel/Equipe)');
  } catch (e) {
    if (txStarted) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    console.error('[reset-stripe-for-live ERR]', e.message);
    if (e.detail) console.error('detail:', e.detail);
    process.exit(1);
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
})();
