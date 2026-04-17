# FlowIA — Fix TabSMS toFixed + emails campagne promo
# Lire les fichiers existants avant de modifier.
# Ne jamais demander confirmation.
# À la FIN : git add -A && git commit -m "fix: TabSMS toFixed + emails promo campagne" && git push

---

# BUG 1 — toFixed is not a function dans TabSMS

## Cause
Dans frontend/src/pages/settings/TabMarketing.jsx,
le composant TabSMS appelle .toFixed() sur une valeur
qui n'est pas encore un nombre (undefined, string, null).

## Fix dans TabMarketing.jsx

Lire le fichier et trouver TOUTES les occurrences de .toFixed()
dans TabSMS. Les remplacer par une version sécurisée.

Remplacer chaque occurrence du pattern :
```javascript
xxx.toFixed(2)
```
Par :
```javascript
parseFloat(xxx || 0).toFixed(2)
```

Exemples précis à corriger :
```javascript
// Solde affiché
balance?.balance.toFixed(2)
→ parseFloat(balance?.balance || 0).toFixed(2)

// Montant dans transactions
tx.amount.toFixed(2)
→ parseFloat(tx.amount || 0).toFixed(2)

// Coût campagne
h.sms_cost.toFixed(2)
→ parseFloat(h.sms_cost || 0).toFixed(2)

// Montant input
parseFloat(amount).toFixed(2)
→ parseFloat(amount || 0).toFixed(2)
```

Aussi vérifier et corriger :
```javascript
// SMS estimés
Math.floor(balance / SMS_PRICE)
→ Math.floor(parseFloat(balance || 0) / SMS_PRICE)
```

---

# BUG 2 — Emails campagne promo non envoyés

## Diagnostic
Les logs Render montrent [MAIL RDV OK] → Brevo fonctionne.
Donc BREVO_API_KEY est correcte.
Le problème est dans la route d'envoi des emails promo.

## Étape 1 — Lire ces fichiers
1. backend/src/routes/promo.js
2. backend/src/routes/campaigns.js
3. backend/src/utils/email.js
4. backend/src/utils/emailSender.js

## Étape 2 — Vérifier l'expéditeur dans email.js

Trouver la ligne sender dans la fonction sendEmail :
```javascript
sender: { name: 'FlowIA', email: process.env.BREVO_FROM || 'noreply@flowia.fr' }
```

Si elle contient 'noreply@flowia.fr' → remplacer par :
```javascript
sender: {
  name: process.env.SENDER_NAME || 'Hair Coiff Lille',
  email: process.env.SENDER_EMAIL || process.env.BREVO_FROM || 'contact@haircoifflille.fr'
}
```

## Étape 3 — Vérifier l'expéditeur dans emailSender.js

Trouver :
```javascript
const SENDER_EMAIL = process.env.SENDER_EMAIL || process.env.BREVO_FROM || 'noreply@haircoifflille.fr';
```
Remplacer par :
```javascript
const SENDER_EMAIL = process.env.SENDER_EMAIL || process.env.BREVO_FROM || 'contact@haircoifflille.fr';
```

## Étape 4 — Vérifier promo.js route send-emails

Lire backend/src/routes/promo.js.
Trouver la route qui envoie les emails lors de la création
d'un code promo (probablement POST /:id/send ou similaire).

Vérifier que :
1. Elle appelle bien sendPromoEmail ou sendEmail
2. Elle a des logs console.log avant et après l'envoi
3. Le try/catch capture et loge les erreurs

Si la route n'a pas de logs, ajouter :
```javascript
console.log('[PROMO SEND] Début envoi emails', {
  promoId, clientsCount: clients.length,
  brevoKey: process.env.BREVO_API_KEY ? 'OK' : 'MANQUANTE',
  senderEmail: process.env.SENDER_EMAIL || 'non défini'
});
```

Et après chaque envoi :
```javascript
console.log('[PROMO SEND] Résultat:', { sent, failed });
```

## Étape 5 — Vérifier campaigns.js route send

Lire backend/src/routes/campaigns.js.
Trouver la route POST /send qui envoie les emails campagne.

Vérifier que sendMarketingEmail est bien appelée et loguée.
Si pas de logs suffisants, ajouter en début de route :
```javascript
console.log('[CAMPAIGN SEND] Start', {
  channel,
  emailClients: emailClients?.length,
  brevoKey: process.env.BREVO_API_KEY ? 'OK' : 'MANQUANTE',
  senderEmail: process.env.SENDER_EMAIL || 'non défini'
});
```

## Étape 6 — Vérifier que les clients ont bien des emails

Dans getTopClients dans campaigns.js,
vérifier que le filtre email est correct :
```javascript
if (needEmail) where += ` AND ca.email IS NOT NULL 
  AND ca.email != '' AND ca.email LIKE '%@%'`;
```

## Étape 7 — Test direct Brevo depuis le backend

Ajouter une route de test temporaire dans backend/src/index.js :
```javascript
// Route de test email — À SUPPRIMER APRÈS TEST
app.get('/api/test-email', async (req, res) => {
  try {
    const { sendEmail } = require('./utils/email');
    await sendEmail({
      to: 'gacinoufel@gmail.com',
      subject: 'Test email FlowIA',
      html: '<p>Test email depuis FlowIA backend</p>'
    });
    res.json({ ok: true, message: 'Email envoyé' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
```

Cette route permettra de tester directement si Brevo
envoie bien depuis le backend en visitant :
https://flowia-backend.onrender.com/api/test-email

---

# Ordre d'exécution

1. Corriger toFixed dans TabMarketing.jsx (Bug 1)
2. Corriger sender email.js (Bug 2 étape 2)
3. Corriger sender emailSender.js (Bug 2 étape 3)
4. Vérifier et améliorer logs promo.js (Bug 2 étape 4)
5. Vérifier et améliorer logs campaigns.js (Bug 2 étape 5)
6. Ajouter route test email dans index.js (Bug 2 étape 7)
7. cd frontend && npx vite build
8. Si OK : git add -A && git commit -m "fix: TabSMS toFixed + emails promo sender" && git push
9. Si KO : corriger puis recommencer

# Après déploiement — Tests
1. Aller sur Settings → Marketing → Solde marketing
   → Plus d'erreur toFixed ✅

2. Visiter : https://flowia-backend.onrender.com/api/test-email
   → Vérifier réception email sur gacinoufel@gmail.com
   → Vérifier logs Render : [MAIL OK]

3. Créer code promo → Envoyer par email
   → Vérifier logs Render : [PROMO SEND] ou [CAMPAIGN SEND]
   → Vérifier réception email clients