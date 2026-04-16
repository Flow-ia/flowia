# FlowIA — Fix emails campagne marketing
# Lis ce fichier et exécute TOUT dans l'ordre.
# Ne jamais s'arrêter pour demander confirmation.
# À la FIN : git add -A && git commit -m "fix: emails campagne marketing + brevo integration" && git push

---

## Règles de travail
- Lire TOUT le code existant avant de modifier
- Modifications chirurgicales uniquement
- Ne jamais demander confirmation
- Commentaires en français

---

# DIAGNOSTIC — Lire ces fichiers d'abord

Avant tout, lire ces fichiers et identifier les problèmes :
1. backend/src/routes/campaigns.js — chercher sendMarketingEmail
2. backend/src/utils/messenger.js — chercher sendEmail
3. backend/src/index.js — chercher sendBrevoEmail ou sendEmail
4. backend/src/routes/auth.js — chercher comment les emails sont envoyés actuellement

---

# FIX 1 — Créer/corriger backend/src/utils/emailSender.js

Créer ce fichier s'il n'existe pas, ou le corriger s'il existe :

```javascript
// backend/src/utils/emailSender.js
// Utilitaire centralisé pour tous les envois email via Brevo

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL  = process.env.SENDER_EMAIL  || 'noreply@haircoifflille.fr';
const SENDER_NAME   = process.env.SENDER_NAME   || 'FlowIA';

// Compteur global emails journalier (protection quota Brevo gratuit)
let emailsToday = 0;
let emailsTodayDate = new Date().toDateString();

function resetCounterIfNewDay() {
  const today = new Date().toDateString();
  if (today !== emailsTodayDate) {
    emailsToday = 0;
    emailsTodayDate = today;
  }
}

// Fonction principale d'envoi email
async function sendEmail({ to, toName, subject, htmlContent, type = 'transactional' }) {
  resetCounterIfNewDay();

  const EMAIL_DAILY_LIMIT = 300;
  const EMAIL_MARKETING_MAX = 220; // reserve 80 pour transactionnel

  // Bloquer marketing si quota atteint
  if (type === 'marketing' && emailsToday >= EMAIL_MARKETING_MAX) {
    throw new Error(`Quota email marketing atteint (${emailsToday}/${EMAIL_MARKETING_MAX}). Reessayez demain.`);
  }

  if (!BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY manquante dans les variables environnement');
  }

  const body = {
    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
    to: [{ email: to, name: toName || to }],
    subject: subject,
    htmlContent: htmlContent
  };

  console.log(`[EMAIL] Envoi ${type} → ${to} | Sujet: ${subject}`);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[EMAIL ERROR]', JSON.stringify(data));
    throw new Error(data.message || 'Erreur envoi email Brevo');
  }

  emailsToday++;
  console.log(`[EMAIL] ✅ Envoye → ${to} | Total aujourd'hui: ${emailsToday}`);
  return data;
}

// Email marketing campagne code promo
async function sendMarketingEmail(clientEmail, clientName, message, promoCode) {
  const subject = promoCode 
    ? `Offre exclusive : -${promoCode} vous attend !`
    : 'Une offre exclusive pour vous';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 24px; }
        .body { padding: 32px; }
        .message { font-size: 16px; color: #333; line-height: 1.6; white-space: pre-wrap; }
        .footer { padding: 20px 32px; background: #f8fafc; text-align: center; font-size: 12px; color: #999; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Offre exclusive pour vous !</h1>
        </div>
        <div class="body">
          <p style="font-size:16px;color:#333;">Bonjour ${clientName || 'cher client'},</p>
          <div class="message">${message}</div>
        </div>
        <div class="footer">
          <p>Vous recevez cet email car vous êtes client de notre établissement.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: clientEmail,
    toName: clientName,
    subject,
    htmlContent,
    type: 'marketing'
  });
}

// Obtenir le quota restant
function getEmailQuota() {
  resetCounterIfNewDay();
  return {
    sent_today: emailsToday,
    available_today: Math.max(0, 220 - emailsToday),
    daily_max: 220
  };
}

module.exports = { sendEmail, sendMarketingEmail, getEmailQuota };
```

---

# FIX 2 — Corriger campaigns.js pour utiliser sendMarketingEmail

## Lire d'abord backend/src/routes/campaigns.js

Puis vérifier :

### 1. Import en haut du fichier
S'assurer que cet import existe :
```javascript
const { sendMarketingEmail, getEmailQuota } = require('../utils/emailSender');
```

### 2. Dans la route POST /api/campaigns/send
Trouver la partie qui envoie les emails et la corriger :

```javascript
// Envoi email pour chaque client (batch de 20 avec 2s pause)
const emailBatches = chunk(emailClients.slice(0, quota.available_today), 20);
let sentEmailCount = 0;
let failedEmailCount = 0;

for (const batch of emailBatches) {
  await Promise.allSettled(batch.map(async (client) => {
    try {
      const msg = (message_email || message_sms || '')
        .replace(/\{prénom\}/g, client.first_name || '')
        .replace(/\{prenom\}/g, client.first_name || '')
        .replace(/\{nom\}/g, client.last_name || '');

      await sendMarketingEmail(
        client.email,
        `${client.first_name || ''} ${client.last_name || ''}`.trim(),
        msg,
        promoCode
      );
      sentEmailCount++;

      // Logger l'envoi
      await pool.query(`
        INSERT INTO message_log
          (user_id, campaign_id, email, channel, cost, status)
        VALUES ($1, $2, $3, 'email', 0, 'sent')
      `, [userId, campaignId, client.email]);

    } catch(e) {
      console.error('[CAMPAIGN EMAIL ERROR]', client.email, e.message);
      failedEmailCount++;
    }
  }));

  // Incrementer le compteur DB
  await pool.query(`
    UPDATE users SET
      email_sent_today  = email_sent_today  + $1,
      email_sent_month  = email_sent_month  + $1
    WHERE id = $2
  `, [batch.length, userId]);

  await sleep(2000); // 2s entre batches
}

console.log(`[CAMPAIGN] Emails: ${sentEmailCount} envoyés, ${failedEmailCount} echecs`);
```

### 3. Dans la route GET /api/campaigns/preview
Corriger le calcul quota email :
```javascript
const { available_today, daily_max } = getEmailQuota();
// Utiliser cette valeur pour le calcul
```

---

# FIX 3 — Vérifier que BREVO_API_KEY est bien utilisée

## Dans backend/src/routes/auth.js ou partout où des emails sont envoyés

Chercher TOUTES les fonctions d'envoi email existantes.
S'assurer qu'elles utilisent toutes process.env.BREVO_API_KEY.

Si une fonction utilise une autre clé ou une autre méthode,
la remplacer par un import de sendEmail depuis emailSender.js.

---

# FIX 4 — Ajouter logs détaillés dans campaigns.js

Au début de la route POST /api/campaigns/send, ajouter :
```javascript
console.log('[CAMPAIGN SEND] Start:', {
  userId,
  channel,
  target_type,
  emailClients: emailClients?.length,
  smsClients: smsClients?.length,
  message_email: message_email?.substring(0, 50)
});
```

Et après chaque étape importante, loguer le résultat.
Cela permettra de voir dans les logs Render exactement où ça bloque.

---

# FIX 5 — Corriger la popup code promo dans Settings.jsx

## Problème possible dans le frontend

Lire le composant CampaignSection dans Settings.jsx.
Vérifier que le bouton "Créer + Envoyer" appelle bien api.sendCampaign().

S'assurer que le body envoyé contient :
```javascript
{
  promo_code_id: promoCode.id,
  channel: channel,          // 'email', 'sms', ou 'both'
  target_type: targetType,   // 'top50', 'top100', etc.
  custom_count: customCount,
  message_sms: messageSms,
  message_email: messageSms, // utiliser le même message si pas de message_email séparé
  promo_code: promoCode.code // pour le template email
}
```

Vérifier aussi que le channel 'email' est bien envoyé et pas undefined.
Ajouter un console.log avant l'appel API pour vérifier :
```javascript
console.log('[CAMPAIGN] Envoi:', { channel, targetType, message_email: messageSms?.substring(0,50) });
```

---

# Variables Render à vérifier ABSOLUMENT

```
BREVO_API_KEY=xkeysib-xxxxx  (récupérer depuis app.brevo.com → Settings → API Keys)
SENDER_EMAIL=noreply@haircoifflille.fr  (domaine vérifié Brevo)
SENDER_NAME=FlowIA
```

Si BREVO_API_KEY est absente ou incorrecte → AUCUN email ne sera envoyé.

---

# Ordre d'exécution

1. Lire auth.js pour comprendre comment les emails fonctionnent actuellement
2. Créer/corriger emailSender.js (FIX 1)
3. Corriger campaigns.js imports + envoi email (FIX 2)
4. Vérifier BREVO_API_KEY dans tous les fichiers (FIX 3)
5. Ajouter logs (FIX 4)
6. Corriger popup frontend si nécessaire (FIX 5)
7. Vérifier build : cd frontend && npx vite build
8. Si OK : git add -A && git commit -m "fix: emails campagne marketing + brevo integration" && git push
9. Si KO : corriger erreurs puis recommencer étape 8

# Test après déploiement

1. Créer un code promo dans Settings → Marketing → Promotions
2. Choisir canal Email, Top 50 clients
3. Cliquer Calculer → vérifier les logs Render pour [CAMPAIGN SEND]
4. Cliquer Créer + Envoyer
5. Vérifier dans les logs Render :
   [CAMPAIGN SEND] Start: { channel: 'email', ... }
   [EMAIL] Envoi marketing → client@email.com
   [EMAIL] ✅ Envoye → client@email.com
6. Vérifier sur app.brevo.com → Transactionnel → Log des emails