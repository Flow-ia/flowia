# FlowIA — Fix SumUp paiement sécurisé
# Lis ce fichier et exécute TOUT dans l'ordre.
# Ne jamais s'arrêter pour demander confirmation.
# À la FIN : git add -A && git commit -m "fix: SumUp paiement securise + validation webhook" && git push

---

## Règles de travail
- Lire le code existant avant toute modification
- Modifications chirurgicales
- Ne jamais demander confirmation
- Commentaires en français

---

# PROBLÈME PRINCIPAL — Sécurité recharges SMS

## Situation actuelle (DANGEREUX)
Les transactions apparaissent dans la liste AVANT que
SumUp confirme le paiement. Le solde ne doit JAMAIS
être crédité sans confirmation SumUp vérifiée.

## Règle absolue
1. Checkout créé → transaction en DB status='pending'
2. Commerçant paye → SumUp envoie webhook OU retourne sur l'app
3. Backend appelle GET /v0.1/checkouts/{id} pour VÉRIFIER
4. Si et SEULEMENT SI status==='PAID' → créditer le solde
5. Si status !== 'PAID' → ne rien créditer, laisser pending

---

# FIX 1 — Sécuriser la route POST /sms/checkout

## Dans backend/src/routes/payments.js

Lire le fichier existant puis corriger la route POST /sms/checkout :

```javascript
router.post('/sms/checkout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const amount = parseFloat(req.body.amount);

    if (!amount || amount < 5) {
      return res.status(400).json({ error: 'Montant minimum : 5EUR' });
    }

    const SUMUP_KEY    = process.env.SUMUP_SECRET_KEY;
    const BACKEND_URL  = process.env.BACKEND_URL || 'https://flowia-backend.onrender.com';
    const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://haircoifflille.fr').split(',')[0].trim();

    // Etape 1 : recuperer le merchant_code
    const meRes = await fetch('https://api.sumup.com/v0.1/me', {
      headers: { 'Authorization': `Bearer ${SUMUP_KEY}` }
    });
    const meData = await meRes.json();
    const merchantCode = meData.merchant_profile?.merchant_code;

    if (!merchantCode) {
      console.error('[SUMUP /me] reponse:', JSON.stringify(meData));
      return res.status(500).json({ error: 'Compte SumUp non configure.' });
    }

    const ref = `sms_${userId}_${Date.now()}`;
    const smsCost   = parseFloat(process.env.SMS_COST_UNIT)     || 0.045;
    const smsMargin = parseFloat(process.env.SMS_MARGIN_PERCENT) || 30;
    const smsPrice  = parseFloat((smsCost * (1 + smsMargin / 100)).toFixed(4));
    const estimatedSms = Math.floor(amount / smsPrice);

    // Etape 2 : creer le checkout SumUp
    const checkoutBody = {
      checkout_reference: ref,
      amount: parseFloat(amount.toFixed(2)),
      currency: 'EUR',
      merchant_code: merchantCode,
      description: 'Recharge SMS FlowIA',
      redirect_url: `${FRONTEND_URL}/settings/marketing?recharge=pending&checkout_id=CHECKOUT_ID_PLACEHOLDER`
    };

    const response = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUMUP_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(checkoutBody)
    });

    const checkout = await response.json();
    console.log('[SUMUP CHECKOUT]', JSON.stringify(checkout));

    if (!checkout.id) {
      return res.status(500).json({
        error: 'Erreur SumUp: ' + (checkout.message || JSON.stringify(checkout))
      });
    }

    // Corriger le redirect_url avec le vrai checkout_id
    // (SumUp ne supporte pas les variables dans redirect_url)

    // Etape 3 : enregistrer EN ATTENTE dans DB
    // NE PAS CREDITER ICI — attendre confirmation SumUp
    await pool.query(`
      INSERT INTO sms_transactions
        (user_id, type, amount, sms_count, description, sumup_checkout_id, status)
      VALUES ($1, 'credit', $2, $3, $4, $5, 'pending')
    `, [userId, amount, estimatedSms, `Recharge ${amount}EUR`, checkout.id]);

    console.log('[SUMUP] Checkout cree:', checkout.id, '| Statut: pending | Montant:', amount);

    res.json({
      checkout_url: checkout.hosted_checkout_url,
      checkout_id: checkout.id,
      estimated_sms: estimatedSms
    });

  } catch(e) {
    console.error('[SUMUP CHECKOUT ERROR]', e.message);
    res.status(500).json({ error: 'Erreur: ' + e.message });
  }
});
```

---

# FIX 2 — Sécuriser la route GET /sms/verify/:checkout_id

## Dans backend/src/routes/payments.js

Cette route est appelee quand le commerçant revient sur l'app.
Elle VERIFIE le statut SumUp avant de créditer.

```javascript
router.get('/sms/verify/:checkoutId', authMiddleware, async (req, res) => {
  try {
    const { checkoutId } = req.params;
    const userId = req.user.userId;
    const SUMUP_KEY = process.env.SUMUP_SECRET_KEY;

    // Etape 1 : verifier avec SumUp (TOUJOURS)
    const sumupRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkoutId}`, {
      headers: { 'Authorization': `Bearer ${SUMUP_KEY}` }
    });
    const checkout = await sumupRes.json();

    console.log('[SUMUP VERIFY]', checkoutId, '| Status:', checkout.status);

    // Etape 2 : verifier que c'est bien PAID
    if (checkout.status !== 'PAID') {
      return res.json({
        credited: false,
        status: checkout.status || 'unknown',
        message: 'Paiement non confirmé par SumUp'
      });
    }

    // Etape 3 : verifier que ce checkout appartient bien a cet utilisateur
    const { rows: txRows } = await pool.query(
      `SELECT * FROM sms_transactions 
       WHERE sumup_checkout_id=$1 AND user_id=$2`,
      [checkoutId, userId]
    );

    if (!txRows.length) {
      return res.status(403).json({ error: 'Transaction introuvable.' });
    }

    const tx = txRows[0];

    // Etape 4 : verifier pas deja credite (protection doublon)
    if (tx.status === 'completed') {
      return res.json({
        credited: false,
        already_credited: true,
        message: 'Deja creditee',
        new_balance: null
      });
    }

    // Etape 5 : crediter le solde MAINTENANT (paiement confirme)
    await pool.query(
      'UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2',
      [tx.amount, userId]
    );

    // Etape 6 : marquer la transaction comme completee
    await pool.query(
      "UPDATE sms_transactions SET status='completed' WHERE id=$1",
      [tx.id]
    );

    // Retourner le nouveau solde
    const { rows: [user] } = await pool.query(
      'SELECT sms_balance FROM users WHERE id=$1', [userId]
    );

    const smsCost   = parseFloat(process.env.SMS_COST_UNIT)     || 0.045;
    const smsMargin = parseFloat(process.env.SMS_MARGIN_PERCENT) || 30;
    const smsPrice  = parseFloat((smsCost * (1 + smsMargin / 100)).toFixed(4));

    console.log('[SUMUP] Solde credite:', tx.amount, 'EUR pour user:', userId);

    res.json({
      credited: true,
      amount: tx.amount,
      sms_count: tx.sms_count,
      new_balance: parseFloat(user.sms_balance).toFixed(2),
      new_sms_estimated: Math.floor(parseFloat(user.sms_balance) / smsPrice)
    });

  } catch(e) {
    console.error('[SUMUP VERIFY ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});
```

---

# FIX 3 — Sécuriser le webhook POST /sms/webhook

## Dans backend/src/routes/payments.js

```javascript
router.post('/sms/webhook', async (req, res) => {
  // Repondre immediatement 200 (SumUp exige)
  res.sendStatus(200);

  try {
    const { event_type, id: checkoutId } = req.body;
    console.log('[SUMUP WEBHOOK]', event_type, checkoutId);

    if (event_type !== 'CHECKOUT_STATUS_CHANGED' || !checkoutId) return;

    const SUMUP_KEY = process.env.SUMUP_SECRET_KEY;

    // TOUJOURS verifier avec l'API SumUp (ne pas faire confiance au webhook seul)
    const sumupRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkoutId}`, {
      headers: { 'Authorization': `Bearer ${SUMUP_KEY}` }
    });
    const checkout = await sumupRes.json();

    if (checkout.status !== 'PAID') {
      console.log('[SUMUP WEBHOOK] Statut non PAID:', checkout.status);
      return;
    }

    // Trouver la transaction
    const { rows: txRows } = await pool.query(
      "SELECT * FROM sms_transactions WHERE sumup_checkout_id=$1 AND status='pending'",
      [checkoutId]
    );

    if (!txRows.length) {
      console.log('[SUMUP WEBHOOK] Transaction introuvable ou deja traitee:', checkoutId);
      return;
    }

    const tx = txRows[0];

    // Crediter le solde
    await pool.query(
      'UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2',
      [tx.amount, tx.user_id]
    );

    await pool.query(
      "UPDATE sms_transactions SET status='completed' WHERE id=$1",
      [tx.id]
    );

    console.log('[SUMUP WEBHOOK] Solde credite:', tx.amount, 'EUR pour user:', tx.user_id);

  } catch(e) {
    console.error('[SUMUP WEBHOOK ERROR]', e.message);
  }
});
```

---

# FIX 4 — Ne pas afficher les transactions pending dans TabSMS

## Dans backend/src/routes/payments.js route GET /sms/transactions

```javascript
router.get('/sms/transactions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM sms_transactions
      WHERE user_id=$1
      AND status != 'pending'
      ORDER BY created_at DESC
      LIMIT 10
    `, [req.user.userId]);
    res.json(rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
```

---

# FIX 5 — Frontend TabSMS : gestion retour paiement securisee

## Dans Settings.jsx composant TabSMS

### Au montage du composant
```javascript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const checkoutId = params.get('checkout_id');
  const recharge   = params.get('recharge');

  // Nettoyer l'URL immediatement
  if (recharge || checkoutId) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (recharge === 'pending' && checkoutId) {
    // Verifier le paiement cote backend (qui verifie cote SumUp)
    api.verifySMSCheckout(checkoutId)
      .then(result => {
        if (result.credited) {
          showToast(
            `Recharge reussie ! +${result.sms_count} SMS credits (${result.amount}EUR)`,
            'success'
          );
        } else if (result.already_credited) {
          // Deja credite via webhook, juste recharger les donnees
        } else {
          showToast(
            'Paiement non confirme. Contactez le support si vous avez ete debite.',
            'error'
          );
        }
        loadData();
      })
      .catch(() => loadData());
  } else {
    loadData();
  }
}, []);
```

### Bouton Recharger
```javascript
const handleRecharge = async () => {
  const amt = parseFloat(amount);
  if (!amt || amt < 5) {
    showToast('Montant minimum : 5EUR', 'error');
    return;
  }
  setLoading(true);
  try {
    const { checkout_url, checkout_id, estimated_sms } = await api.createSMSCheckout(amt);

    if (!checkout_url) {
      throw new Error('URL de paiement non recue');
    }

    // Rediriger vers SumUp (Hosted Checkout)
    window.location.href = checkout_url;

  } catch(e) {
    showToast(e.message || 'Erreur creation paiement', 'error');
    setLoading(false);
  }
};
```

---

# FIX 6 — Nettoyage des transactions orphelines

## Ajouter dans le cron job de index.js (toutes les 24h)

```javascript
// Nettoyer les transactions pending depuis plus de 2h (paiement abandonne)
setInterval(async () => {
  try {
    await pool.query(`
      UPDATE sms_transactions
      SET status = 'expired'
      WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '2 hours'
    `);
  } catch(e) {
    console.error('[CRON CLEANUP]', e.message);
  }
}, 2 * 60 * 60 * 1000); // toutes les 2h
```

---

# Comment tester en production

## Carte de test SumUp (sandbox)
Pour tester sans vrai paiement :
1. Aller sur me.sumup.com → Sandboxes
2. Creer un compte sandbox
3. Utiliser la cle sandbox SUMUP_SECRET_KEY=SBP_...
4. Carte de test : 4111 1111 1111 1111
   Date : n'importe quelle date future
   CVV  : 123

## Verification dans les logs Render
Apres un test :
- Chercher [SUMUP CHECKOUT] dans les logs
- Chercher [SUMUP VERIFY] ou [SUMUP WEBHOOK]
- Verifier que status=PAID avant creditingr

## Verification en base Supabase
```sql
SELECT user_id, amount, status, sumup_checkout_id, created_at 
FROM sms_transactions 
ORDER BY created_at DESC 
LIMIT 10;
```
- pending = paiement initie, pas encore confirme
- completed = paiement confirme par SumUp, solde credite
- expired = paiement abandonne apres 2h

---

# Ordre d'execution

1. Corriger payments.js (FIX 1, 2, 3, 4)
2. Corriger Settings.jsx TabSMS (FIX 5)
3. Ajouter cron nettoyage dans index.js (FIX 6)
4. Verifier build : cd frontend && npx vite build
5. Si OK : git add -A && git commit -m "fix: SumUp paiement securise validation obligatoire" && git push
6. Si KO : corriger erreurs puis recommencer etape 5