# FlowIA — Onboarding Claude Code
# Lis ce fichier et exécute TOUT ce qui est décrit.
# Ne jamais s'arrêter pour demander confirmation.
# À la FIN : git add -A && git commit -m "fix: SMS marketing redesign + SumUp checkout + quota email" && git push

---

## Règles de travail
- Toujours lire le code existant avant de modifier
- Modifications chirurgicales uniquement
- Ne jamais demander confirmation
- Langue du code et commentaires : français

---

# FIX 1 — Bug SumUp checkout 500

## Problème
La route POST /api/payments/sms/checkout retourne 500.
Erreur : "Erreur creation checkout SumUp."
Cause probable : merchant_code manquant ou mauvais format body.

## Correction dans backend/src/routes/payments.js

Remplacer la route POST /sms/checkout par ceci :

```javascript
router.post('/sms/checkout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const amount = parseFloat(req.body.amount);

    if (!amount || amount < 5) {
      return res.status(400).json({ error: 'Montant minimum : 5EUR' });
    }

    const SUMUP_KEY    = process.env.SUMUP_SECRET_KEY;
    const BACKEND_URL  = process.env.BACKEND_URL  || 'https://flowia-backend.onrender.com';
    const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://haircoifflille.fr').split(',')[0].trim();
    const ref = `sms_${userId}_${Date.now()}`;

    // Etape 1 : recuperer le merchant_code depuis /me
    const meRes = await fetch('https://api.sumup.com/v0.1/me', {
      headers: { 'Authorization': `Bearer ${SUMUP_KEY}` }
    });
    const meData = await meRes.json();
    const merchantCode = meData.merchant_profile?.merchant_code;

    if (!merchantCode) {
      console.error('[SUMUP] merchant_code introuvable:', JSON.stringify(meData));
      return res.status(500).json({ error: 'Compte SumUp non configure.' });
    }

    // Etape 2 : creer le checkout
    const checkoutBody = {
      checkout_reference: ref,
      amount: parseFloat(amount.toFixed(2)),
      currency: 'EUR',
      merchant_code: merchantCode,
      description: 'Recharge SMS FlowIA',
      return_url: `${BACKEND_URL}/api/payments/sms/webhook`
    };

    console.log('[SUMUP CHECKOUT] body:', JSON.stringify(checkoutBody));

    const response = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUMUP_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(checkoutBody)
    });

    const checkout = await response.json();
    console.log('[SUMUP CHECKOUT] reponse:', JSON.stringify(checkout));

    if (!checkout.id) {
      return res.status(500).json({
        error: 'Erreur SumUp: ' + (checkout.message || JSON.stringify(checkout))
      });
    }

    // Calculer SMS estimes (sans exposer le prix unitaire)
    const smsCost   = parseFloat(process.env.SMS_COST_UNIT)     || 0.045;
    const smsMargin = parseFloat(process.env.SMS_MARGIN_PERCENT) || 30;
    const smsPrice  = parseFloat((smsCost * (1 + smsMargin / 100)).toFixed(4));
    const estimatedSms = Math.floor(amount / smsPrice);

    // Enregistrer la transaction en attente
    await pool.query(`
      INSERT INTO sms_transactions
        (user_id, type, amount, sms_count, description, sumup_checkout_id, status)
      VALUES ($1, 'credit', $2, $3, $4, $5, 'pending')
    `, [userId, amount, estimatedSms, `Recharge ${amount}EUR`, checkout.id]);

    // URL de redirection apres paiement
    const redirectUrl = `${FRONTEND_URL}/settings/marketing?recharge=success&checkout_id=${checkout.id}`;

    res.json({
      checkout_url: checkout.hosted_checkout_url || `https://checkout.sumup.com/${checkout.id}`,
      checkout_id: checkout.id,
      estimated_sms: estimatedSms,
      redirect_url: redirectUrl
    });

  } catch(e) {
    console.error('[SUMUP CHECKOUT ERROR]', e.message, e.stack);
    res.status(500).json({ error: 'Erreur creation checkout: ' + e.message });
  }
});
```

---

# FIX 2 — Deplacer "Solde marketing" dans Marketing

## Dans Settings.jsx

### 1. Supprimer l'onglet SMS de la navigation principale
- Retirer `{ id: 'sms', label: 'SMS', icon: I.Send }` de TABS
- Retirer `'sms': 'sms'` de URL_TO_TAB
- Retirer `'sms': '/settings/sms'` de TAB_TO_URL
- Retirer `{tab === 'sms' && <TabSMS .../>}` du rendu

### 2. Dans TabMarketing — ajouter sous-onglets
Lire le composant TabMarketing existant.
Ajouter un state local : `const [marketingTab, setMarketingTab] = useState('promotions');`

Ajouter 3 boutons en haut (style pill/capsule) :
- "Fidelite" (contenu fidelite existant)
- "Promotions" (contenu promotions existant)  
- "Solde marketing" (nouveau — contenu TabSMS)

Design boutons :
```javascript
// Wrapper des 3 boutons
style={{
  display: 'flex',
  gap: 6,
  marginBottom: 20,
  background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
  borderRadius: 12,
  padding: 4
}}

// Chaque bouton
style={{
  flex: 1,
  padding: '9px 8px',
  borderRadius: 9,
  border: 'none',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
  background: marketingTab === id ? theme.card : 'transparent',
  color: marketingTab === id ? theme.text : theme.muted,
  boxShadow: marketingTab === id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
  transition: 'all 0.15s',
  whiteSpace: 'nowrap'
}}
```

Labels :
- fidelite   : "Fidelite"
- promotions : "% Promotions"
- solde      : "Solde marketing"

### 3. Rendu conditionnel dans TabMarketing
```jsx
{marketingTab === 'fidelite'   && /* contenu fidelite existant */}
{marketingTab === 'promotions' && /* contenu promotions existant */}
{marketingTab === 'solde'      && <TabSMS showToast={showToast} theme={theme} />}
```

### 4. Retour apres paiement SumUp
Dans TabSMS, au montage, verifier les params URL :
```javascript
const params = new URLSearchParams(window.location.search);
const checkoutId = params.get('checkout_id');
if (params.get('recharge') === 'success' && checkoutId) {
  api.verifySMSCheckout(checkoutId)
    .then(r => { if (r.credited) showToast('Recharge effectuee !', 'success'); loadData(); })
    .catch(() => loadData());
  window.history.replaceState({}, '', window.location.pathname);
} else { loadData(); }
```

---

# FIX 3 — Redesign TabSMS simplifie

## Ce qu'il faut SUPPRIMER completement de l'affichage
- Prix unitaire SMS (0.0585EUR, 0.045EUR, etc.)
- Frais SumUp
- Couts internes Brevo
- "Les emails de confirmation RDV ne comptent pas"
- Tout detail technique interne

## Nouveau design TabSMS

### Section 1 — Solde SMS
```
Solde actuel : 12.40 EUR  (gros, centré)
Environ 212 SMS disponibles  (sous le solde, plus petit)

--- Recharger ---
Montant : [ 20 ] EUR  (input, min 5)
Avec 20EUR vous obtenez environ 343 SMS  (calcul temps reel)
[ Recharger ]  (bouton principal, violet/indigo)
```

Calcul SMS cote frontend :
```javascript
const smsCost   = parseFloat(import.meta.env.VITE_SMS_COST_UNIT)     || 0.045;
const smsMargin = parseFloat(import.meta.env.VITE_SMS_MARGIN_PERCENT) || 30;
const smsPrice  = smsCost * (1 + smsMargin / 100);
const estimatedSms = amount ? Math.floor(parseFloat(amount) / smsPrice) : 0;
```

Le bouton s'appelle "Recharger" (pas "Payer avec SumUp")

### Section 2 — Emails marketing
```
Emails marketing disponibles
Aujourd'hui  [barre] 87 / 220   (vert si < 70%, orange si 70-90%, rouge si > 90%)
Ce mois      [barre] 1240 / 9000
Reset le 01/05/2026
```

Pas de mention des emails transactionnels.
Juste : quota disponible pour les campagnes marketing.

### Section 3 — Historique (compact)
Tableau 10 dernières campagnes :
Date | Canal | Envoyes | Cout | Statut

### Section 4 — Transactions (compact)
10 dernieres transactions :
Date | Montant | Description

### Design general
- Cards separees avec borderRadius 16
- Fond theme.card, bordure theme.border
- Responsive mobile first
- isDark respecte partout

---

# FIX 4 — Quota email sans reserve artificielle

## Dans backend/src/routes/campaigns.js

Remplacer la constante EMAIL_RESERVE par :
```javascript
const EMAIL_DAILY_LIMIT   = 300;
const EMAIL_MONTHLY_LIMIT = 9000;
// Plus de EMAIL_RESERVE fixe
// available_today = max(0, EMAIL_DAILY_LIMIT - email_sent_today)
// Le compteur email_sent_today inclut deja tous les emails (transactionnels + marketing)
// Donc pas besoin de reserver artificiellement
const EMAIL_MARKETING_MAX = EMAIL_DAILY_LIMIT; // 300/jour total
```

Dans checkEmailQuota :
```javascript
const availableToday = Math.max(0, EMAIL_DAILY_LIMIT - u.email_sent_today);
const availableMonth = Math.max(0, EMAIL_MONTHLY_LIMIT - u.email_sent_month);
```

---

# FIX 5 — Popup code promo — affichage simplifie

## Dans le composant CampaignSection de Settings.jsx

Simplifier l'apercu apres "Calculer" :
```
Si email selectionne :
  "47 clients recevront un email"
  Si envoi immediat : "Envoi possible aujourd'hui"
  Si etale : "Envoi sur 2 jours automatiquement"

Si SMS selectionne :
  "38 clients recevront un SMS"
  "Cout : 2.22EUR"
  Solde suffisant : "Solde OK (12.40EUR)" en vert
  Solde insuffisant : "Il vous manque 1.50EUR" en rouge
                      + bouton [Recharger mon solde]
```

Pas de mention Brevo, pas de prix unitaire, pas de details internes.

---

# Ordre d'execution

1. Corriger payments.js (FIX 1)
2. Modifier Settings.jsx — sous-onglets Marketing (FIX 2)
3. Redesigner TabSMS (FIX 3)
4. Corriger campaigns.js quota (FIX 4)
5. Simplifier popup promo (FIX 5)
6. Verifier build : cd frontend && npx vite build
7. Si OK : git add -A && git commit -m "fix: SMS marketing redesign + SumUp checkout + quota email" && git push
8. Si KO : corriger les erreurs puis recommencer etape 7