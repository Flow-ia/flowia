# FlowIA — Fix SumUp checkout URL + redirect_url
# Lis ce fichier et exécute TOUT dans l'ordre.
# Ne jamais s'arrêter pour demander confirmation.
# À la FIN : git add -A && git commit -m "fix: SumUp checkout URL et redirect_url" && git push

---

## Règles de travail
- Lire le code existant avant toute modification
- Modifications chirurgicales uniquement
- Ne jamais demander confirmation
- Commentaires en français

---

# CONTEXTE — Ce qui se passe exactement

Les logs Render montrent 2 bugs :

BUG 1 : redirect_url mal construite
  redirect_url actuelle : "FRONTEND_URL = https://haircoifflille.fr/..."
  Le code utilise une string littérale au lieu de la variable

BUG 2 : hosted_checkout_url absent de la réponse SumUp
  SumUp retourne le checkout sans hosted_checkout_url
  Le code de fallback construit une mauvaise URL
  pay.sumup.com/b2c/checkout?checkout-id=ID → 404

La bonne URL SumUp Hosted Checkout est :
  https://pay.sumup.com/b2c/checkout?checkout-id={id}
  AVEC le paramètre "checkout-id" (avec tiret, pas underscore)

---

# FIX 1 — Corriger payments.js

## Lire d'abord backend/src/routes/payments.js

Puis corriger la route POST /sms/checkout en remplaçant
TOUTE la logique de création checkout par ceci :

```javascript
router.post('/sms/checkout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const amount = parseFloat(req.body.amount);

    if (!amount || amount < 5) {
      return res.status(400).json({ error: 'Montant minimum : 5EUR' });
    }

    const SUMUP_KEY    = process.env.SUMUP_SECRET_KEY;
    const BACKEND_URL  = process.env.BACKEND_URL  
      || 'https://flowia-backend.onrender.com';
    const FRONTEND_URL = (process.env.FRONTEND_URL 
      || 'https://haircoifflille.fr').split(',')[0].trim();

    // Etape 1 : recuperer le merchant_code depuis /me
    const meRes = await fetch('https://api.sumup.com/v0.1/me', {
      headers: { 'Authorization': `Bearer ${SUMUP_KEY}` }
    });
    const meData = await meRes.json();
    const merchantCode = meData.merchant_profile?.merchant_code;

    if (!merchantCode) {
      console.error('[SUMUP /me] erreur:', JSON.stringify(meData));
      return res.status(500).json({ error: 'merchant_code introuvable.' });
    }

    const ref = `sms_${userId}_${Date.now()}`;
    const smsCost   = parseFloat(process.env.SMS_COST_UNIT)      || 0.045;
    const smsMargin = parseFloat(process.env.SMS_MARGIN_PERCENT)  || 30;
    const smsPrice  = parseFloat((smsCost * (1 + smsMargin / 100)).toFixed(4));
    const estimatedSms = Math.floor(amount / smsPrice);

    // Etape 2 : creer le checkout
    // redirect_url = ou SumUp redirige apres paiement (page de confirmation)
    const redirectAfterPayment = 
      `${FRONTEND_URL}/settings/marketing?recharge=pending&ref=${ref}`;

    const checkoutBody = {
      checkout_reference: ref,
      amount: parseFloat(amount.toFixed(2)),
      currency: 'EUR',
      merchant_code: merchantCode,
      description: 'Recharge SMS FlowIA',
      redirect_url: redirectAfterPayment
    };

    console.log('[SUMUP] Création checkout:', JSON.stringify(checkoutBody));

    const response = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUMUP_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(checkoutBody)
    });

    const checkout = await response.json();
    console.log('[SUMUP] Réponse complète:', JSON.stringify(checkout));

    if (!checkout.id) {
      return res.status(500).json({
        error: 'SumUp error: ' + (checkout.message || JSON.stringify(checkout))
      });
    }

    // Etape 3 : construire l'URL de paiement
    // SumUp Hosted Checkout URL correcte :
    // https://pay.sumup.com/b2c/checkout?checkout-id={id}
    const checkoutUrl = checkout.hosted_checkout_url 
      || `https://pay.sumup.com/b2c/checkout?checkout-id=${checkout.id}`;

    console.log('[SUMUP] URL paiement:', checkoutUrl);

    // Etape 4 : enregistrer EN ATTENTE - NE PAS CREDITER ICI
    await pool.query(`
      INSERT INTO sms_transactions
        (user_id, type, amount, sms_count, description, 
         sumup_checkout_id, status)
      VALUES ($1, 'credit', $2, $3, $4, $5, 'pending')
    `, [userId, amount, estimatedSms, `Recharge ${amount}EUR`, checkout.id]);

    res.json({
      checkout_url: checkoutUrl,
      checkout_id: checkout.id,
      checkout_ref: ref,
      estimated_sms: estimatedSms
    });

  } catch(e) {
    console.error('[SUMUP ERROR]', e.message, e.stack);
    res.status(500).json({ error: 'Erreur: ' + e.message });
  }
});
```

---

# FIX 2 — Corriger la route GET /sms/verify

## Dans backend/src/routes/payments.js

La route doit chercher par checkout_id OU par checkout_reference.
Remplacer la route GET /sms/verify/:checkoutId :

```javascript
router.get('/sms/verify/:checkoutId', authMiddleware, async (req, res) => {
  try {
    const { checkoutId } = req.params;
    const userId = req.user.userId;
    const SUMUP_KEY = process.env.SUMUP_SECRET_KEY;

    // Verifier le statut reel chez SumUp
    const sumupRes = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${checkoutId}`,
      { headers: { 'Authorization': `Bearer ${SUMUP_KEY}` } }
    );
    const checkout = await sumupRes.json();
    console.log('[SUMUP VERIFY]', checkoutId, '| Status:', checkout.status);

    if (checkout.status !== 'PAID') {
      return res.json({
        credited: false,
        status: checkout.status || 'unknown',
        message: 'Paiement non confirmé par SumUp'
      });
    }

    // Chercher la transaction (par checkout_id OU par ref dans description)
    const { rows: txRows } = await pool.query(
      `SELECT * FROM sms_transactions 
       WHERE sumup_checkout_id = $1 AND user_id = $2`,
      [checkoutId, userId]
    );

    if (!txRows.length) {
      return res.status(404).json({ error: 'Transaction introuvable.' });
    }

    const tx = txRows[0];

    // Verifier pas deja credite
    if (tx.status === 'completed') {
      const { rows: [user] } = await pool.query(
        'SELECT sms_balance FROM users WHERE id=$1', [userId]
      );
      return res.json({
        credited: false,
        already_credited: true,
        new_balance: parseFloat(user.sms_balance).toFixed(2)
      });
    }

    // Crediter le solde UNIQUEMENT si PAID confirme
    await pool.query(
      'UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2',
      [tx.amount, userId]
    );
    await pool.query(
      "UPDATE sms_transactions SET status='completed' WHERE id=$1",
      [tx.id]
    );

    const { rows: [user] } = await pool.query(
      'SELECT sms_balance FROM users WHERE id=$1', [userId]
    );

    const smsCost   = parseFloat(process.env.SMS_COST_UNIT)      || 0.045;
    const smsMargin = parseFloat(process.env.SMS_MARGIN_PERCENT)  || 30;
    const smsPrice  = parseFloat((smsCost * (1 + smsMargin / 100)).toFixed(4));

    console.log('[SUMUP] Credite:', tx.amount, 'EUR → user:', userId);

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

# FIX 3 — Corriger le webhook POST /sms/webhook

```javascript
router.post('/sms/webhook', async (req, res) => {
  // Repondre 200 immediatement (SumUp exige reponse rapide)
  res.sendStatus(200);

  try {
    const { event_type, id: checkoutId } = req.body;
    console.log('[SUMUP WEBHOOK]', event_type, '| checkout:', checkoutId);

    if (event_type !== 'CHECKOUT_STATUS_CHANGED' || !checkoutId) return;

    const SUMUP_KEY = process.env.SUMUP_SECRET_KEY;

    // TOUJOURS verifier avec API SumUp avant de crediter
    const sumupRes = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${checkoutId}`,
      { headers: { 'Authorization': `Bearer ${SUMUP_KEY}` } }
    );
    const checkout = await sumupRes.json();
    console.log('[SUMUP WEBHOOK] Status:', checkout.status);

    if (checkout.status !== 'PAID') return;

    // Chercher transaction pending
    const { rows: txRows } = await pool.query(
      "SELECT * FROM sms_transactions WHERE sumup_checkout_id=$1 AND status='pending'",
      [checkoutId]
    );

    if (!txRows.length) {
      console.log('[SUMUP WEBHOOK] Deja traite ou introuvable:', checkoutId);
      return;
    }

    const tx = txRows[0];

    // Crediter
    await pool.query(
      'UPDATE users SET sms_balance = sms_balance + $1 WHERE id=$2',
      [tx.amount, tx.user_id]
    );
    await pool.query(
      "UPDATE sms_transactions SET status='completed' WHERE id=$1",
      [tx.id]
    );

    console.log('[SUMUP WEBHOOK] OK - Credite:', tx.amount, 'EUR → user:', tx.user_id);

  } catch(e) {
    console.error('[SUMUP WEBHOOK ERROR]', e.message);
  }
});
```

---

# FIX 4 — Corriger le frontend Settings.jsx TabSMS

## Problème
Le bouton Recharger ne redirige pas vers la bonne URL.

## Dans le composant TabSMS de Settings.jsx

### Corriger handleRecharge
```javascript
const handleRecharge = async () => {
  const amt = parseFloat(amount);
  if (!amt || amt < 5) {
    showToast('Montant minimum : 5EUR', 'error');
    return;
  }
  setLoading(true);
  try {
    const result = await api.createSMSCheckout(amt);
    
    console.log('[RECHARGE] Réponse:', result);
    
    if (!result.checkout_url) {
      throw new Error('URL de paiement non reçue de SumUp');
    }
    
    // Rediriger vers la page SumUp Hosted Checkout
    window.location.href = result.checkout_url;
    
  } catch(e) {
    console.error('[RECHARGE ERROR]', e);
    showToast(e.message || 'Erreur création paiement', 'error');
    setLoading(false);
  }
};
```

### Corriger le useEffect — retour après paiement
```javascript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  const recharge = params.get('recharge');

  // Nettoyer l'URL immediatement
  if (recharge || ref) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (recharge === 'pending' && ref) {
    // Chercher le checkout_id par la ref dans nos transactions
    api.getSMSTransactionByRef(ref)
      .then(tx => {
        if (tx && tx.sumup_checkout_id) {
          return api.verifySMSCheckout(tx.sumup_checkout_id);
        }
      })
      .then(result => {
        if (result?.credited) {
          showToast(
            `+${result.sms_count} SMS credites (${result.amount}EUR)`,
            'success'
          );
        } else if (result?.already_credited) {
          showToast('Recharge deja effectuee', 'info');
        }
        loadData();
      })
      .catch(() => loadData());
  } else {
    loadData();
  }
}, []);
```

---

# FIX 5 — Ajouter route GET /sms/transaction-by-ref dans payments.js

```javascript
router.get('/sms/transaction-by-ref/:ref', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM sms_transactions 
       WHERE description LIKE $1 AND user_id=$2
       ORDER BY created_at DESC LIMIT 1`,
      [`%${req.params.ref}%`, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
    res.json(rows[0]);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
```

---

# FIX 6 — Ajouter dans api.js

```javascript
getSMSTransactionByRef: (ref) => request(`/payments/sms/transaction-by-ref/${ref}`),
```

---

# FIX 7 — Transactions pending cachées

## Dans GET /sms/transactions
S'assurer que status != 'pending' :

```javascript
router.get('/sms/transactions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM sms_transactions
      WHERE user_id=$1 AND status != 'pending'
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

# FIX 8 — Nettoyage transactions expirées (cron dans index.js)

```javascript
// Toutes les 2h : expirer les transactions pending > 2h
setInterval(async () => {
  try {
    const { rowCount } = await pool.query(`
      UPDATE sms_transactions
      SET status = 'expired'
      WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '2 hours'
    `);
    if (rowCount > 0) {
      console.log(`[CRON] ${rowCount} transactions expirees`);
    }
  } catch(e) {
    console.error('[CRON CLEANUP]', e.message);
  }
}, 2 * 60 * 60 * 1000);
```

---

# Variables Render à vérifier

```
SUMUP_SECRET_KEY=sup_sk_t5PrlG4B0BuKXfeL7umWk4k6KYuJLgdBS
SMS_COST_UNIT=0.045
SMS_MARGIN_PERCENT=30
BACKEND_URL=https://flowia-backend.onrender.com
FRONTEND_URL=https://haircoifflille.fr,https://www.haircoifflille.fr
```

# Variables Vercel à vérifier

```
VITE_SUMUP_PUBLIC_KEY=sup_pk_FmKqk2NI0rQHctMRnrOTiJxAeRkYNn9iR
VITE_SMS_COST_UNIT=0.045
VITE_SMS_MARGIN_PERCENT=30
```

---

# Ordre d'exécution

1. Corriger payments.js (FIX 1, 2, 3, 5, 7, 8)
2. Corriger Settings.jsx TabSMS (FIX 4)
3. Corriger api.js (FIX 6)
4. Vérifier build : cd frontend && npx vite build
5. Si OK : git add -A && git commit -m "fix: SumUp checkout URL + redirect + securite" && git push
6. Si KO : corriger erreurs puis recommencer étape 5

# Test après déploiement

1. Aller sur Settings → Marketing → Solde marketing
2. Entrer 20EUR et cliquer Recharger
3. Vérifier dans les logs Render :
   [SUMUP] URL paiement: https://pay.sumup.com/b2c/checkout?checkout-id=xxxxx
4. La page SumUp doit s'ouvrir (pas 404)
5. Utiliser carte test : 4111 1111 1111 1111 | 12/2026 | 123
6. Après paiement → retour sur l'app → solde mis à jour