# FlowIA — Fix SumUp widget paiement + confirmation
# Lis ce fichier et exécute TOUT dans l'ordre.
# Ne jamais s'arrêter pour demander confirmation.
# À la FIN : git add -A && git commit -m "fix: SumUp widget confirmation + fallback polling" && git push

---

## Règles de travail
- Lire le code existant avant toute modification
- Modifications chirurgicales uniquement
- Ne jamais demander confirmation
- Commentaires en français

---

# CONTEXTE

Le widget SumUp s'affiche et le formulaire carte fonctionne.
Mais après saisie de la carte : "Paiement en attente" sans confirmation.

Causes possibles :
1. onResponse callback ne reçoit pas 'success' → besoin de polling
2. Le checkout n'est pas "processed" → SumUp sandbox nécessite PUT /checkouts/{id}
3. redirect_url ou return_url mal configuré

---

# FIX 1 — Ajouter polling de confirmation dans le frontend

## Dans Settings.jsx — composant TabSMS

Lire le code existant du modal SumUp puis le corriger.

Le problème : après SumUpCard.mount(), le widget affiche le formulaire
mais onResponse peut ne jamais être appelé en sandbox si 3DS est requis.

Solution : après mount du widget, démarrer un polling toutes les 3 secondes
qui vérifie le statut du checkout côté backend.

```javascript
// Dans la fonction qui mount le widget SumUp
const mountSumUpWidget = (checkoutId, estimatedSms, amount) => {
  // Démarrer polling après 5 secondes (laisser le temps à SumUp)
  let pollCount = 0;
  const maxPolls = 20; // 20 × 3s = 60s max
  
  const pollInterval = setInterval(async () => {
    pollCount++;
    if (pollCount > maxPolls) {
      clearInterval(pollInterval);
      setPayLoading(false);
      showToast('Délai dépassé. Vérifiez votre solde dans quelques minutes.', 'info');
      return;
    }
    
    try {
      const result = await api.verifySMSCheckout(checkoutId);
      if (result.credited || result.already_credited) {
        clearInterval(pollInterval);
        setShowPayModal(false);
        setPayLoading(false);
        if (result.credited) {
          showToast(`+${result.sms_count} SMS crédités !`, 'success');
        }
        loadData();
      }
      // Si status = PAID mais pas encore crédité → la vérification a crédité
      if (result.status === 'PAID') {
        clearInterval(pollInterval);
        setShowPayModal(false);
        setPayLoading(false);
        showToast(`Recharge confirmée !`, 'success');
        loadData();
      }
    } catch(e) {
      // Continuer le polling en cas d'erreur réseau
    }
  }, 3000);

  // Mount le widget SumUp
  if (window.SumUpCard) {
    window.SumUpCard.mount({
      checkoutId: checkoutId,
      onResponse: async (type, body) => {
        console.log('[SUMUP WIDGET]', type, body);
        clearInterval(pollInterval);
        
        if (type === 'success') {
          setShowPayModal(false);
          try {
            const result = await api.verifySMSCheckout(checkoutId);
            if (result.credited) {
              showToast(`+${result.sms_count} SMS crédités !`, 'success');
            } else {
              showToast('Paiement reçu, solde mis à jour bientôt.', 'info');
            }
          } catch(e) {
            showToast('Paiement reçu !', 'success');
          }
          setPayLoading(false);
          loadData();
          
        } else if (type === 'error') {
          setPayError(body?.message || 'Paiement refusé');
          setPayLoading(false);
          
        } else if (type === 'sent') {
          // Paiement envoyé, en attente de confirmation 3DS
          // Continuer le polling
          setPayStatus('Vérification en cours...');
        }
      }
    });
  } else {
    clearInterval(pollInterval);
    showToast('Widget SumUp non chargé. Rechargez la page.', 'error');
  }
};
```

---

# FIX 2 — Améliorer la route GET /sms/verify dans payments.js

## Lire backend/src/routes/payments.js

La route doit aussi vérifier dans transactions[] de la réponse SumUp
car en sandbox le statut principal peut rester PENDING
même si une transaction SUCCESSFUL existe dans le tableau.

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
    console.log('[SUMUP VERIFY] Status:', checkout.status, 
                '| Transactions:', checkout.transactions?.length);

    // Verifier si PAID OU si une transaction SUCCESSFUL existe
    const hasPaidTransaction = checkout.transactions?.some(
      t => t.status === 'SUCCESSFUL'
    );
    const isPaid = checkout.status === 'PAID' || hasPaidTransaction;

    if (!isPaid) {
      return res.json({
        credited: false,
        status: checkout.status || 'unknown',
        transactions: checkout.transactions?.map(t => t.status)
      });
    }

    // Chercher la transaction en DB
    const { rows: txRows } = await pool.query(
      `SELECT * FROM sms_transactions 
       WHERE sumup_checkout_id = $1 AND user_id = $2`,
      [checkoutId, userId]
    );

    if (!txRows.length) {
      return res.status(404).json({ error: 'Transaction introuvable.' });
    }

    const tx = txRows[0];

    // Deja credite ?
    if (tx.status === 'completed') {
      const { rows: [user] } = await pool.query(
        'SELECT sms_balance FROM users WHERE id=$1', [userId]
      );
      return res.json({
        credited: false,
        already_credited: true,
        new_balance: parseFloat(user?.sms_balance || 0).toFixed(2)
      });
    }

    // Crediter maintenant
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

    console.log('[SUMUP VERIFY] Credite:', tx.amount, 'EUR → user:', userId);

    res.json({
      credited: true,
      amount: tx.amount,
      sms_count: tx.sms_count,
      new_balance: parseFloat(user.sms_balance).toFixed(2),
      new_sms_estimated: Math.floor(parseFloat(user.sms_balance) / smsPrice),
      status: 'PAID'
    });

  } catch(e) {
    console.error('[SUMUP VERIFY ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});
```

---

# FIX 3 — Vérifier que le script SumUp est chargé dans index.html

## Dans frontend/index.html

Vérifier que cette ligne existe dans le <head> :
```html
<script src="https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js"></script>
```

Si elle n'existe pas, l'ajouter.
Si elle existe déjà, vérifier qu'elle est bien dans <head> avant les autres scripts.

---

# FIX 4 — Ajouter logs détaillés dans le frontend

## Dans Settings.jsx TabSMS

Ajouter des console.log pour débugger :

```javascript
// Avant de monter le widget
console.log('[SUMUP] Montage widget pour checkout:', checkoutId);
console.log('[SUMUP] SumUpCard disponible:', !!window.SumUpCard);

// Dans onResponse
console.log('[SUMUP WIDGET onResponse]', type, JSON.stringify(body));

// Après verifySMSCheckout
console.log('[SUMUP VERIFY résultat]', result);
```

---

# FIX 5 — Bouton "Vérifier mon paiement" dans le modal

Si le commerçant attend et que le paiement est bloqué,
ajouter un bouton manuel dans le modal :

```jsx
{/* Dans le modal SumUp, après le div#sumup-card */}
{payStatus === 'pending' && (
  <button
    onClick={async () => {
      const result = await api.verifySMSCheckout(currentCheckoutId);
      if (result.credited || result.already_credited) {
        setShowPayModal(false);
        showToast('Solde mis à jour !', 'success');
        loadData();
      } else {
        showToast('Paiement pas encore confirmé par SumUp', 'info');
      }
    }}
    style={{
      marginTop: 12, width: '100%', padding: '10px',
      background: 'transparent', border: '1px solid #6366f1',
      color: '#6366f1', borderRadius: 8, cursor: 'pointer',
      fontSize: 13, fontWeight: 600
    }}
  >
    Vérifier mon paiement
  </button>
)}
```

---

# NOTE IMPORTANTE — Clé sandbox SumUp

La clé sandbox sup_sk_t5PrlG4B0BuKXfeL7umWk4k6KYuJLgdBS
doit avoir le scope "payments" activé.

Si le paiement reste toujours en PENDING avec la sandbox :
→ C'est normal avec certains comptes sandbox SumUp
→ Tester directement avec la clé production
→ La clé prod : sup_sk_a8HamuZ3HIZSVLrPiG2h7fpuMxpKjfOuG

Pour passer en prod temporairement sur Render :
SUMUP_SECRET_KEY=sup_sk_a8HamuZ3HIZSVLrPiG2h7fpuMxpKjfOuG

---

# Ordre d'exécution

1. Lire Settings.jsx pour trouver le code SumUp actuel
2. Ajouter polling dans le modal (FIX 1)
3. Corriger /sms/verify pour checker transactions[] (FIX 2)
4. Vérifier script dans index.html (FIX 3)
5. Ajouter logs (FIX 4)
6. Ajouter bouton vérification manuelle (FIX 5)
7. Vérifier build : cd frontend && npx vite build
8. Si OK : git add -A && git commit -m "fix: SumUp polling + verify transactions + logs" && git push
9. Si KO : corriger puis recommencer

# Test après déploiement

1. Ouvrir la console Chrome (F12)
2. Aller sur Settings → Marketing → Solde marketing
3. Entrer 20€ → Recharger
4. Dans la console chercher :
   [SUMUP] Montage widget pour checkout: xxx
   [SUMUP] SumUpCard disponible: true
5. Saisir carte : 4111 1111 1111 1111 | 12/2026 | 123
6. Dans la console chercher :
   [SUMUP WIDGET onResponse] success {...}
   OU le polling qui vérifie toutes les 3s
7. Dans les logs Render chercher :
   [SUMUP VERIFY] Status: PAID
   [SUMUP VERIFY] Credite: 20 EUR