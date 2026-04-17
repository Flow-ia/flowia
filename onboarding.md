# FlowIA — Fix prioritaires post-découpage Settings
# Exécute dans l'ordre exact. Ne jamais demander confirmation.
# Lire chaque fichier existant avant de modifier.
# À la FIN : git add -A && git commit -m "fix: Stripe + emails campagne" && git push

---

## Contexte important
- Settings.jsx a été découpé en 13 fichiers dans frontend/src/pages/settings/
- TabMarketing.jsx contient : TabMarketing, TabLoyalty, PromoForm, TabPromo, TabSMS
- TabSMS contient le code de recharge SMS (SumUp actuellement)
- Les fichiers backend sont dans backend/src/routes/ et backend/src/utils/

---

# PRIORITÉ 1 — Stripe pour recharge SMS

## Pourquoi
SumUp retourne FAILED sur tous les paiements en ligne.
Le compte SumUp n'a pas le scope "payments" activé.
Stripe fonctionne immédiatement sans vérification manuelle.

## 1a — Installer Stripe backend
```bash
cd backend && npm install stripe
```

## 1b — Réécrire backend/src/routes/payments.js

Remplacer TOUT le contenu par :

```javascript
// routes/payments.js — Recharge SMS via Stripe
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

const SMS_COST   = parseFloat(process.env.SMS_COST_UNIT)      || 0.045;
const SMS_MARGIN = parseFloat(process.env.SMS_MARGIN_PERCENT)  || 30;
const SMS_PRICE  = parseFloat((SMS_COST * (1 + SMS_MARGIN / 100)).toFixed(4));

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante sur Render');
  return require('stripe')(key);
}

// POST /api/payments/sms/checkout
router.post('/sms/checkout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const amount = parseFloat(req.body.amount);
    if (!amount || amount < 5) {
      return res.status(400).json({ error: 'Montant minimum : 5EUR' });
    }
    const stripe = getStripe();
    const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://haircoifflille.fr')
      .match(/https?:\/\/[^\s,]+/)?.[0]?.replace(/\/$/, '') || 'https://haircoifflille.fr';
    const estimatedSms = Math.floor(amount / SMS_PRICE);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Recharge SMS FlowIA',
            description: `environ ${estimatedSms} SMS`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      metadata: {
        user_id: userId,
        amount: amount.toString(),
        sms_count: estimatedSms.toString(),
      },
      success_url: `${FRONTEND_URL}/settings/marketing?recharge=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${FRONTEND_URL}/settings/marketing?recharge=cancelled`,
    });

    // Enregistrer EN ATTENTE — ne pas créditer ici
    await pool.query(`
      INSERT INTO sms_transactions
        (user_id, type, amount, sms_count, description, sumup_checkout_id, status)
      VALUES ($1,'credit',$2,$3,$4,$5,'pending')
    `, [userId, amount, estimatedSms, `Recharge ${amount}EUR`, session.id]);

    console.log('[STRIPE] Session créée:', session.id, '| Montant:', amount, '| User:', userId);
    res.json({ checkout_url: session.url, session_id: session.id, estimated_sms: estimatedSms });

  } catch(e) {
    console.error('[STRIPE CHECKOUT ERROR]', e.message);
    res.status(500).json({ error: 'Erreur paiement: ' + e.message });
  }
});

// POST /api/payments/sms/webhook — Stripe envoie l'événement ici
router.post('/sms/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    res.json({ received: true }); // répondre immédiatement

    try {
      let event;
      const sig = req.headers['stripe-signature'];
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      const stripe = getStripe();

      if (secret && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig, secret);
      } else {
        event = JSON.parse(req.body.toString());
        console.warn('[STRIPE WEBHOOK] Pas de secret — signature non vérifiée');
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.payment_status !== 'paid') return;

        const userId   = session.metadata?.user_id;
        const amount   = parseFloat(session.metadata?.amount || 0);
        const smsCount = parseInt(session.metadata?.sms_count || 0);

        // Protection doublon
        const { rows: existing } = await pool.query(
          "SELECT id FROM sms_transactions WHERE sumup_checkout_id=$1 AND status='completed'",
          [session.id]
        );
        if (existing.length > 0) return;

        await pool.query(
          'UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2',
          [amount, userId]
        );
        await pool.query(
          "UPDATE sms_transactions SET status='completed' WHERE sumup_checkout_id=$1",
          [session.id]
        );
        console.log('[STRIPE WEBHOOK] Crédité:', amount, 'EUR ->', userId, '|', smsCount, 'SMS');
      }
    } catch(e) {
      console.error('[STRIPE WEBHOOK ERROR]', e.message);
    }
  }
);

// GET /api/payments/sms/verify/:sessionId
router.get('/sms/verify/:sessionId', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log('[STRIPE VERIFY]', sessionId, '| Status:', session.payment_status);

    if (session.payment_status !== 'paid') {
      return res.json({
        credited: false,
        status: session.payment_status,
        message: 'Paiement non confirmé'
      });
    }

    if (session.metadata?.user_id !== userId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { rows: txRows } = await pool.query(
      'SELECT * FROM sms_transactions WHERE sumup_checkout_id=$1 AND user_id=$2',
      [sessionId, userId]
    );
    if (!txRows.length) return res.status(404).json({ error: 'Transaction introuvable' });

    const tx = txRows[0];
    if (tx.status === 'completed') {
      const { rows: [u] } = await pool.query('SELECT sms_balance FROM users WHERE id=$1', [userId]);
      return res.json({
        credited: false, already_credited: true,
        new_balance: parseFloat(u.sms_balance).toFixed(2)
      });
    }

    // Créditer
    await pool.query('UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2', [tx.amount, userId]);
    await pool.query("UPDATE sms_transactions SET status='completed' WHERE id=$1", [tx.id]);

    const { rows: [u] } = await pool.query('SELECT sms_balance FROM users WHERE id=$1', [userId]);
    console.log('[STRIPE VERIFY] Crédité:', tx.amount, 'EUR ->', userId);

    res.json({
      credited: true,
      amount: tx.amount,
      sms_count: tx.sms_count,
      new_balance: parseFloat(u.sms_balance).toFixed(2),
      new_sms_estimated: Math.floor(parseFloat(u.sms_balance) / SMS_PRICE),
    });
  } catch(e) {
    console.error('[STRIPE VERIFY ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/payments/sms/balance
router.get('/sms/balance', authMiddleware, async (req, res) => {
  try {
    const { rows: [u] } = await pool.query(
      'SELECT sms_balance FROM users WHERE id=$1', [req.user.userId]
    );
    const balance = parseFloat(u?.sms_balance || 0);
    res.json({
      balance: balance.toFixed(2),
      estimated_sms: Math.floor(balance / SMS_PRICE),
      price_per_sms: SMS_PRICE,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/payments/sms/transactions
router.get('/sms/transactions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM sms_transactions
      WHERE user_id=$1 AND status NOT IN ('pending','expired')
      ORDER BY created_at DESC LIMIT 10
    `, [req.user.userId]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
```

## 1c — Modifier backend/src/index.js

Trouver où express.json() est déclaré.
Ajouter AVANT toutes les routes (important pour le webhook Stripe) :

```javascript
// Webhook Stripe doit recevoir le raw body AVANT express.json()
app.use('/api/payments/sms/webhook', express.raw({ type: 'application/json' }));
```

Vérifier que la route payments est montée :
```javascript
app.use('/api/payments', require('./routes/payments'));
```

## 1d — Modifier frontend/src/pages/settings/TabMarketing.jsx

Lire TabMarketing.jsx et trouver le composant TabSMS.
Trouver la fonction handleRecharge et tout le code SumUp.

### Supprimer complètement :
- Fonction loadSumupSdk()
- Composant SumupCheckoutModal
- Tout appel à window.SumUpCard
- État checkoutData, paying lié à SumUp

### Remplacer handleRecharge par :
```javascript
const handleRecharge = async () => {
  const amt = parseFloat(amount);
  if (!amt || amt < 5) {
    showToast('Montant minimum : 5EUR', 'error');
    return;
  }
  setPaying(true);
  try {
    const { checkout_url } = await paymentsApi.createSMSCheckout(amt);
    if (!checkout_url) throw new Error('URL de paiement non reçue');
    window.location.href = checkout_url; // redirection vers Stripe
  } catch(e) {
    showToast(e.message || 'Erreur création paiement', 'error');
    setPaying(false);
  }
};
```

### Remplacer le bouton par :
```jsx
<button
  onClick={handleRecharge}
  disabled={paying || !amount || parseFloat(amount) < 5}
  style={{
    width: '100%', padding: 14, borderRadius: 12, border: 'none',
    background: (!amount || parseFloat(amount) < 5 || paying)
      ? theme.border
      : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    color: (!amount || parseFloat(amount) < 5 || paying) ? theme.muted : 'white',
    fontWeight: 800, fontSize: 14, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
  }}>
  {paying ? 'Redirection...' : `Payer ${amount ? parseFloat(amount).toFixed(2) + 'EUR' : ''} avec Stripe`}
</button>
```

### Ajouter dans useEffect au montage (retour Stripe) :
```javascript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const recharge  = params.get('recharge');

  if (recharge && sessionId) {
    window.history.replaceState({}, '', window.location.pathname);
    if (recharge === 'success') {
      paymentsApi.verifySMSCheckout(sessionId)
        .then(r => {
          if (r.credited) showToast(`+${r.sms_count} SMS crédités !`, 'success');
          else if (r.already_credited) showToast('Recharge déjà effectuée', 'info');
          loadData();
        })
        .catch(() => loadData());
    } else if (recharge === 'cancelled') {
      showToast('Paiement annulé', 'info');
      loadData();
    }
  } else {
    loadData();
  }
}, []);
```

## 1e — Supprimer script SumUp de frontend/index.html
Supprimer cette ligne si elle existe :
```html
<script src="https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js" defer></script>
```

## 1f — Mettre à jour frontend/src/utils/api.js
Trouver paymentsApi et vérifier que verifySMSCheckout utilise session_id :
```javascript
verifySMSCheckout: (sessionId) => request(`/payments/sms/verify/${sessionId}`),
createSMSCheckout: (amount) => request('/payments/sms/checkout',
  { method: 'POST', body: JSON.stringify({ amount }) }),
```

---

# PRIORITÉ 2 — Fix emails campagne

## Problème identifié
Dans backend/src/utils/email.js ligne 13 :
  email: process.env.BREVO_FROM || 'noreply@flowia.fr'

'noreply@flowia.fr' n'est PAS vérifié sur Brevo.
Seul 'contact@haircoifflille.fr' est vérifié.

## 2a — Corriger backend/src/utils/email.js

Trouver cette ligne (environ ligne 13) :
```javascript
sender: { name: 'FlowIA', email: process.env.BREVO_FROM || 'noreply@flowia.fr' },
```

Remplacer par :
```javascript
sender: {
  name: process.env.SENDER_NAME || 'Hair Coiff Lille',
  email: process.env.SENDER_EMAIL || process.env.BREVO_FROM || 'contact@haircoifflille.fr'
},
```

C'est la SEULE modification dans email.js.

## 2b — Corriger backend/src/utils/emailSender.js

Trouver :
```javascript
const SENDER_EMAIL = process.env.SENDER_EMAIL || process.env.BREVO_FROM || 'noreply@haircoifflille.fr';
```

Remplacer par :
```javascript
const SENDER_EMAIL = process.env.SENDER_EMAIL || process.env.BREVO_FROM || 'contact@haircoifflille.fr';
```

C'est la SEULE modification dans emailSender.js.

---

# Variables Render à ajouter/vérifier

```
STRIPE_SECRET_KEY=sk_test_nouvelle_cle_regeneree
STRIPE_WEBHOOK_SECRET=whsec_depuis_stripe_dashboard (optionnel pour l'instant)
SENDER_EMAIL=contact@haircoifflille.fr
SENDER_NAME=Hair Coiff Lille
BREVO_API_KEY=xkeysib-...hLmc5O (clé complète depuis Brevo)
```

# Variables Render à supprimer
```
SUMUP_WEBHOOK_SECRET → supprimer (n'existe pas chez SumUp)
```

# Variables Vercel à ajouter
```
VITE_STRIPE_PUBLIC_KEY=pk_test_nouvelle_cle_regeneree
```

---

# Webhook Stripe (après déploiement)
Dashboard Stripe → Developers → Webhooks → Add endpoint :
URL : https://flowia-backend.onrender.com/api/payments/sms/webhook
Event à écouter : checkout.session.completed
Copier Webhook Secret → ajouter STRIPE_WEBHOOK_SECRET sur Render

---

# Cartes de test Stripe
```
Succès  : 4242 4242 4242 4242 | 12/2028 | 123
Refusé  : 4000 0000 0000 0002 | 12/2028 | 123
```

---

# Ordre d'exécution

1. cd backend && npm install stripe
2. Réécrire payments.js (étape 1b)
3. Modifier index.js raw body webhook (étape 1c)
4. Modifier TabMarketing.jsx supprimer SumUp + Stripe (étape 1d)
5. Supprimer script SumUp index.html (étape 1e)
6. Vérifier api.js (étape 1f)
7. Corriger email.js (étape 2a) — 1 ligne
8. Corriger emailSender.js (étape 2b) — 1 ligne
9. cd frontend && npx vite build
10. Si OK : git add -A && git commit -m "fix: Stripe recharge SMS + email sender contact@haircoifflille.fr" && git push
11. Si KO : corriger erreurs puis recommencer étape 10