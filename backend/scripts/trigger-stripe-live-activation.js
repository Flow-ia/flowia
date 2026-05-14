// One-shot : declenche l'activation Stripe Connect en LIVE en creant un
// premier compte connecte via l'API. Stripe debloque la creation des
// comptes connectes apres le premier appel accountLinks.create reussi.
//
// Usage :
//   STRIPE_SECRET_KEY=sk_live_... node scripts/trigger-stripe-live-activation.js
//
// A executer UNE SEULE FOIS. Le compte test cree peut etre supprime
// manuellement dans le dashboard Stripe apres activation.

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('STRIPE_SECRET_KEY manquante dans l\'environnement');
  process.exit(1);
}
const stripe = require('stripe')(key);

const FRONT = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')[0].replace(/\/$/, '');

(async () => {
  try {
    console.log('[STRIPE LIVE ACTIVATION] Mode :', key.startsWith('sk_live_') ? 'LIVE' : 'TEST');

    const account = await stripe.accounts.create({
      controller: {
        stripe_dashboard:       { type: 'full' },
        fees:                   { payer: 'account' },
        losses:                 { payments: 'stripe' },
        requirement_collection: 'stripe',
      },
      country: 'FR',
      email:   'test-activation@flowia.fr',
      settings: {
        payouts: {
          schedule: { interval: 'manual' },
        },
      },
      metadata: { purpose: 'live-activation-trigger' },
    });
    console.log('[STRIPE LIVE ACTIVATION] Compte cree :', account.id);

    const link = await stripe.accountLinks.create({
      account:     account.id,
      refresh_url: `${FRONT}/reglages/paiements?stripe_connect=refresh`,
      return_url:  `${FRONT}/reglages/paiements?stripe_connect=return`,
      type:        'account_onboarding',
    });

    console.log('[STRIPE LIVE ACTIVATION] AccountLink URL :');
    console.log(link.url);
    console.log('Ce compte test peut être supprimé manuellement dans le dashboard Stripe après activation');
  } catch (e) {
    console.error('[STRIPE LIVE ACTIVATION ERR]', e.message);
    if (e.raw) console.error(e.raw);
    process.exit(1);
  }
})();
