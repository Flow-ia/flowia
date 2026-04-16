# FlowIA — Onboarding Claude Code
# Lis ce fichier et exécute TOUT ce qui est décrit.
# Après chaque fichier modifié : git add + git commit + git push automatiquement.
# Ne jamais s'arrêter pour demander confirmation.

---

## Règles de travail
- Toujours lire le code existant avant de modifier
- Modifications chirurgicales uniquement
- Ne jamais demander confirmation
- Langue du code et commentaires : français
- À la FIN de toutes les modifications :
  git add -A
  git commit -m "feat: SMS campaigns + email quota + Google merchant OAuth + onboarding"
  git push

---

# FEATURE 1 — Google OAuth Commerçant (inscription/connexion)

## Contexte
- Le Google OAuth client (réservation) est déjà implémenté et fonctionne
- Il faut faire la même chose côté commerçant dans AuthFlow.jsx
- Client ID Google : 376153951158-jm80phb46sl1fisbgeq587v83ho7ft5e.apps.googleusercontent.com
- Callback commerçant : https://flowia-backend.onrender.com/api/auth/google/merchant/callback
- Cette route existe déjà dans backend/src/routes/auth.js

## Ce qu'il faut faire

### 1. AuthFlow.jsx — Ajouter bouton Google dans RegisterScreen ET LoginScreen
- Bouton "Continuer avec Google" avec logo SVG Google officiel
- Design moderne, cohérent avec le thème existant
- Au clic : ouvrir popup OAuth Google vers /api/auth/google/merchant
- Recevoir le token via postMessage (type: MERCHANT_GOOGLE_AUTH_SUCCESS)
- Si succès : appeler onLogin(token, user)

### 2. Onboarding obligatoire après première connexion Google
Après connexion Google commerçant :
- Si le commerçant n'a pas encore rempli ses infos (adresse, téléphone, etc.)
- Afficher un formulaire obligatoire AVANT d'accéder à l'app
- Champs obligatoires :
  * Nom du commerce
  * Prénom + Nom du gérant
  * Numéro de téléphone (avec indicatif pays)
  * Adresse complète (avec autocomplétion)
  * Code postal
  * Ville
  * Email (pré-rempli depuis Google, non modifiable)
- Bouton "Annuler" disponible MAIS :
  * Si le commerçant annule et revient plus tard
  * L'onboarding doit être redemandé à chaque connexion
  * Jusqu'à ce qu'il le complète
- Stocker dans DB : users.onboarding_completed BOOLEAN DEFAULT FALSE

### 3. Base de données — migration dans db/index.js
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
```

### 4. Backend — route POST /api/auth/onboarding dans auth.js
- Auth JWT requis
- Body : { businessName, firstName, lastName, phone, address, city, postalCode }
- Valider tous les champs
- Mettre à jour users SET onboarding_completed=TRUE
- Retourner user mis à jour

### 5. API /api/auth/me — retourner onboarding_completed
- Ajouter onboarding_completed dans la réponse de /api/auth/me

### 6. App.jsx ou AuthFlow.jsx — Vérification au démarrage
- Au login (Google ou email), vérifier user.onboarding_completed
- Si false → afficher le formulaire d'onboarding
- Si true → accès normal à l'app

---

# FEATURE 2 — Redesign formulaire inscription commerçant

## Problèmes actuels à corriger
1. Indicatif pays trop large (affiche le nom complet du pays)
2. API adresse fait des appels à chaque frappe (trop de requêtes)
3. Emoji 📍 dans les suggestions d'adresse (à supprimer)
4. Design pas assez moderne

## Corrections

### 1. Indicatif pays — AuthFlow.jsx RegisterScreen
- Remplacer l'affichage "🇫🇷 +33 France" par "🇫🇷 +33" uniquement
- Rendre le select moins large (max 90px)
- Garder la même logique de validation

### 2. API Adresse — Debounce + Cache
- Minimum 4 caractères avant de chercher
- Debounce : attendre 600ms après la dernière frappe
- Cache les résultats en mémoire (Map) pour éviter les doublons
- Utiliser l'API Nominatim existante MAIS avec ces optimisations :
  * Ajouter header User-Agent: FlowIA/1.0
  * Limiter à 5 résultats
  * Timeout de 3 secondes
  * Si erreur réseau : ne pas bloquer le formulaire

### 3. Supprimer les emojis dans suggestions
- Remplacer "📍 {adresse}" par "{adresse}" simplement
- Style propre avec une icône SVG discrète si besoin

### 4. Redesign du formulaire RegisterScreen
- Layout en 2 colonnes pour prénom/nom
- Layout en 2 colonnes pour code postal/ville
- Sections visuelles séparées :
  * "Votre identité" (prénom, nom, email, téléphone)
  * "Votre commerce" (nom commerce, adresse, ville, CP)
  * "Sécurité" (mot de passe, confirmation)
- Labels clairs au-dessus de chaque champ
- Indicateurs de validation en temps réel (vert/rouge)
- Design épuré, moderne, professionnel

---

# FEATURE 3 — Téléphone obligatoire côté clients (page réservation)

## Dans BookingPage.jsx
- Dans le formulaire "continuer sans compte" (étape 5)
- Le champ téléphone existe déjà mais n'est pas obligatoire
- Le rendre obligatoire :
  * Marqué d'un astérisque *
  * Validation format français
  * Bouton Continuer disabled si vide
- Dans le backend public-booking.js route /book :
  * Vérifier client_phone non vide
  * Retourner erreur 400 si manquant

---

# FEATURE 4 — Campagnes SMS + Email Marketing

## Contexte
- Brevo SMS : coût variable (actuellement 0.045€/SMS)
- Marge commerçant : 30% max sur le coût réel
- Prix calculé dynamiquement : SMS_COST_UNIT × (1 + SMS_MARGIN_PERCENT/100)
- Exemple : 0.045 × 1.30 = 0.0585€/SMS facturé au commerçant
- Brevo gratuit emails : 300/jour, 9000/mois
- Paiement recharge SMS : SumUp API (déjà configuré)
- Variables Render : BREVO_API_KEY (déjà configuré), SMS_COST_UNIT=0.045, SMS_MARGIN_PERCENT=30
- Variables Vercel : VITE_SMS_COST_UNIT=0.045, VITE_SMS_MARGIN_PERCENT=30
- Si Brevo change son prix → mettre à jour SMS_COST_UNIT sur Render uniquement, le prix affiché se recalcule automatiquement

## 4.1 Base de données — migrations dans db/index.js

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_balance DECIMAL(10,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_sent_today INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_sent_month INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_day_reset DATE DEFAULT CURRENT_DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_month_reset DATE DEFAULT DATE_TRUNC('month',CURRENT_DATE);

CREATE TABLE IF NOT EXISTS campaign_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID,
  client_id UUID,
  client_email VARCHAR(255),
  client_phone VARCHAR(50),
  client_name VARCHAR(255),
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  scheduled_date DATE DEFAULT CURRENT_DATE,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_queue_pending ON campaign_queue(status, scheduled_date);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  promo_code_id UUID REFERENCES promo_codes(id),
  channel VARCHAR(10) NOT NULL,
  target_type VARCHAR(20) NOT NULL,
  target_count INT DEFAULT 0,
  sent_sms INT DEFAULT 0,
  sent_email INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  sms_cost DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sms_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  sms_count INT DEFAULT 0,
  description TEXT,
  sumup_checkout_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_tx_user ON sms_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  campaign_id UUID,
  phone VARCHAR(50),
  email VARCHAR(255),
  channel VARCHAR(20),
  cost DECIMAL(10,4) DEFAULT 0,
  status VARCHAR(20),
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 4.2 Nouveau fichier backend/src/utils/messenger.js

```javascript
const SMS_COST   = parseFloat(process.env.SMS_COST_UNIT)     || 0.045;
const SMS_MARGIN = parseFloat(process.env.SMS_MARGIN_PERCENT) || 30;
const SMS_PRICE  = parseFloat((SMS_COST * (1 + SMS_MARGIN / 100)).toFixed(4));

function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('33') && digits.length === 11) return '+' + digits;
  if (digits.startsWith('0') && digits.length === 10) return '+33' + digits.slice(1);
  if (digits.length === 9) return '+33' + digits;
  return null;
}

async function sendSMS(phone, message) {
  const formatted = formatPhone(phone);
  if (!formatted) return { success: false, reason: 'Numero invalide' };
  try {
    const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: 'FlowIA',
        recipient: formatted,
        content: message
      })
    });
    const data = await res.json();
    if (data.error) return { success: false, reason: data.error };
    if (data.invalid_numbers?.length > 0) return { success: false, reason: 'Numero non valide' };
    return { success: true, cost: SMS_COST };
  } catch(e) {
    return { success: false, reason: e.message };
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
function chunk(arr, size) {
  return Array.from({ length: Math.ceil(arr.length / size) },
    (_, i) => arr.slice(i * size, i * size + size));
}

module.exports = { sendSMS, formatPhone, sleep, chunk };
```

## 4.3 Nouveau fichier backend/src/routes/campaigns.js

Constantes :
```javascript
const SMS_COST    = parseFloat(process.env.SMS_COST_UNIT)     || 0.045;
const SMS_MARGIN  = parseFloat(process.env.SMS_MARGIN_PERCENT) || 30;
const SMS_PRICE   = parseFloat((SMS_COST * (1 + SMS_MARGIN / 100)).toFixed(4));
// Exemple : 0.045 × 1.30 = 0.0585€/SMS facturé au commerçant
// Si Brevo change ses prix : modifier SMS_COST_UNIT sur Render uniquement
const EMAIL_DAILY_LIMIT   = 300;
const EMAIL_MONTHLY_LIMIT = 9000;
const EMAIL_RESERVE       = 80;
const EMAIL_MARKETING_MAX = EMAIL_DAILY_LIMIT - EMAIL_RESERVE; // 220/jour
```

### Fonction getTopClients(userId, limit, needPhone, needEmail)
Sélectionner les meilleurs clients triés par :
1. Nombre de visites confirmées (DESC)
2. Montant total dépensé (DESC)
3. Date dernière visite (DESC NULLS LAST)
Filtrer sur phone non null si needPhone=true
Filtrer sur email non null si needEmail=true

### Fonction checkEmailQuota(userId)
- Reset email_sent_today si email_day_reset < aujourd'hui
- Reset email_sent_month si email_month_reset < début du mois
- Retourner available_today, available_month, reset dates

### Routes à créer :

GET /api/campaigns/preview
- Query: target_type (top50|top100|top200|all|custom), custom_count, channel (sms|email|both)
- Retourner : count clients SMS, count clients email, coût SMS, quota email, plan envoi étalé

POST /api/campaigns/send
- Body: promo_code_id, target_type, custom_count, channel, message_sms, message_email
- Vérifier solde SMS si besoin
- Vérifier quota email
- Envoyer SMS par batch de 10 avec 1s de pause
- Envoyer emails par batch de 20 avec 2s de pause
- Mettre en file d'attente les emails restants
- Déduire sms_balance
- Retourner stats

GET /api/campaigns/quota
- Retourner solde SMS + quota email du commerçant

GET /api/campaigns/history
- Retourner 20 dernières campagnes avec code promo

### Erreurs claires à retourner :
- "Solde SMS insuffisant. Vous avez X.XX€, cette campagne coute X.XX€."
- "Quota email mensuel depasse. Reset le JJ/MM/AAAA."
- "Aucun client avec numero de telephone valide."
- "Aucun client avec email valide."

## 4.4 Nouveau fichier backend/src/routes/payments.js

### POST /api/payments/sms/checkout
- Créer checkout SumUp
- Montant minimum 5€
- Reference format : sms_USERID_TIMESTAMP
- return_url (webhook SumUp) : BACKEND_URL/api/payments/sms/webhook
- Redirect URL après paiement : FRONTEND_URL/settings/sms?recharge=success&checkout_id=XXX
- Enregistrer dans sms_transactions avec status='pending' et sumup_checkout_id
- Retourner { checkout_url, checkout_id }

### POST /api/payments/sms/webhook
SumUp envoie : { event_type: "CHECKOUT_STATUS_CHANGED", id: "checkout_id" }
Logique OBLIGATOIRE selon la doc SumUp :
1. Recevoir le POST avec { event_type, id }
2. TOUJOURS vérifier en rappelant l'API SumUp :
   GET https://api.sumup.com/v0.1/checkouts/{id}
   Headers: { Authorization: Bearer SUMUP_SECRET_KEY }
3. Si checkout.status === 'PAID' :
   - Récupérer user_id depuis checkout.checkout_reference (format: sms_USERID_TIMESTAMP)
   - Vérifier pas de doublon (sms_transactions WHERE sumup_checkout_id=id AND status='completed')
   - Créditer sms_balance du commerçant
   - Mettre à jour sms_transactions status='completed'
4. Retourner 200 OK vide (obligatoire sinon SumUp retry)

### GET /api/payments/sms/verify/:checkout_id
Route de vérification manuelle (fallback si webhook échoue) :
- Appelée quand le commerçant revient sur /settings/sms?recharge=success&checkout_id=XXX
- Appeler GET https://api.sumup.com/v0.1/checkouts/{checkout_id}
- Si PAID et pas encore crédité → créditer le solde
- Retourner { credited: true/false, new_balance, amount }

### GET /api/payments/sms/balance
- Retourner balance, estimated_sms, price_per_sms
- price_per_sms calculé dynamiquement : SMS_COST_UNIT × (1 + SMS_MARGIN_PERCENT/100)
- estimated_sms = Math.floor(balance / price_per_sms)

### GET /api/payments/sms/transactions
- Retourner 20 dernières transactions

## 4.5 Ajouter dans index.js
```javascript
app.use('/api/campaigns', apiLimiter, require('./routes/campaigns'));
app.use('/api/payments',  apiLimiter, require('./routes/payments'));
```

## 4.6 Cron job dans index.js
- Toutes les heures
- Seulement entre 8h et 20h (heures de travail)
- Traiter 30 emails max par execution depuis campaign_queue
- FOR UPDATE SKIP LOCKED pour éviter les doublons
- Sleep 500ms entre chaque email
- Logger les succès et erreurs

## 4.7 Frontend — Settings.jsx

### Nouvel onglet "SMS" juste après "Marketing"
- Ajouter dans TABS : { id: 'sms', label: 'SMS', icon: I.Send }
- Ajouter dans URL_TO_TAB : 'sms': 'sms'
- Ajouter dans TAB_TO_URL : 'sms': '/settings/sms'
- Ajouter rendu : {tab === 'sms' && <TabSMS showToast={show} theme={theme} />}

### Composant TabSMS
Section 1 — Solde SMS :
- Solde actuel affiché en grand (ex: 12.40€)
- Estimation SMS restants (ex: ≈ 190 SMS disponibles)
- Prix unitaire calculé dynamiquement : SMS_COST × (1 + SMS_MARGIN/100)
- Affiché au commerçant en temps réel depuis /api/payments/sms/balance
- Si Brevo change ses prix → admin met à jour SMS_COST_UNIT sur Render → prix se recalcule
- Input montant libre (minimum 5€)
- Calcul temps réel : SMS estimés, frais SumUp 1.69%, total
- Bouton "Payer avec SumUp" → appel checkout → redirect

Section 2 — Quota Email :
- Barre de progression aujourd'hui : X/220 emails marketing
- Barre de progression ce mois : X/9000 emails
- Reset dates affichées
- Info : "Les emails de confirmation RDV ne comptent pas dans ce quota"

Section 3 — Historique campagnes :
- Tableau : Date | Code promo | Canal | Envoyés | Coût | Statut

Section 4 — Transactions SMS :
- Liste : Date | Description | Montant (+credit/-debit)

### Modifier popup création code promo (composant existant dans Settings.jsx)
Après les champs du code promo, ajouter section "Envoyer aux clients" :

Canal d'envoi (4 boutons) :
- Ne pas envoyer
- Email uniquement (gratuit)
- SMS uniquement (payant)
- Email + SMS

Si canal != "ne pas envoyer" :
- Sélection ciblage : top50 / top100 / top200 / tous / personnalisé
- Si personnalisé : input nombre
- Si SMS : textarea message (160 car max avec compteur)
- Bouton "Calculer" → appel /api/campaigns/preview

Résultats affichés :
- Email : nombre clients, quota disponible, plan étalé si nécessaire
- SMS : nombre clients, coût, solde, suffisant ou non
- Si solde insuffisant : bouton "Recharger" → /settings/sms

Boutons finaux :
- "Créer sans envoyer"
- "Créer + Envoyer la campagne"

### Messages d'erreur affichés clairement dans l'UI :
- Solde SMS insuffisant → montant manquant + lien recharge
- Quota email dépassé → date de reset
- Aucun client avec téléphone → message explicatif
- Quota mensuel dépassé → date de reset

## 4.8 Ajouter dans api.js
```javascript
// Campagnes
getCampaignPreview:  (p) => request(`/campaigns/preview?${new URLSearchParams(p)}`),
sendCampaign:       (b) => request('/campaigns/send',   { method:'POST', body:JSON.stringify(b) }),
getCampaignQuota:   ()  => request('/campaigns/quota'),
getCampaignHistory: ()  => request('/campaigns/history'),

// Paiements SMS
getSMSBalance:      ()  => request('/payments/sms/balance'),
createSMSCheckout:  (amount) => request('/payments/sms/checkout',
                    { method:'POST', body:JSON.stringify({ amount }) }),
getSMSTransactions: ()  => request('/payments/sms/transactions'),
verifySMSCheckout:  (id) => request(`/payments/sms/verify/${id}`),
```

---

# FEATURE 5 — Rappels email automatiques avant RDV

## Dans index.js — Cron job rappels

Toutes les heures, entre 7h et 20h :
1. Chercher les RDV confirmés dans exactement 24h (±30min)
   → Envoyer email rappel "Rappel : votre RDV demain"
2. Chercher les RDV confirmés dans exactement 2h (±15min)
   → Envoyer email rappel "Votre RDV est dans 2h"

Migration nécessaire :
```sql
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_2h_sent BOOLEAN DEFAULT FALSE;
```

Template email rappel :
- Objet : "Rappel RDV - [Service] demain à [Heure]"
- Corps : Prénom client, service, employé, date, heure, adresse commerce
- Bouton "Annuler mon RDV" avec lien

Ne pas envoyer si :
- RDV déjà annulé
- reminder_Xh_sent = true (éviter les doublons)
- Client sans email

---

# FEATURE 6 — Optimisations performance

## Protection Brevo gratuit
Compteur global emails en mémoire (global.emailsToday) :
- Reset chaque jour à minuit
- Bloquer les emails marketing si > 220/jour
- Les emails transactionnels (RDV, inscription, reset) passent toujours
- Logger un warning si > 250 emails/jour

## Protection Supabase
- Cache memCache sur les requêtes fréquentes (solde SMS : 30s, quota email : 5min)
- Index déjà ajoutés sur campaign_queue et sms_transactions
- Requêtes avec LIMIT sur les historiques (20 max)
- FOR UPDATE SKIP LOCKED sur le cron queue

## Protection Render
- Batch size 10 SMS avec 1s de pause
- Batch size 20 emails avec 2s de pause
- Cron jobs seulement entre 8h-20h
- 30 items max par execution cron
- Timeout 5s sur tous les appels API externes

---

# Variables d'environnement à ajouter

## Sur Render (backend)
```
# BREVO_API_KEY est deja configure sur Render — ne pas toucher
SMS_COST_UNIT=0.045
SMS_MARGIN_PERCENT=30
SUMUP_SECRET_KEY=sup_sk_a8HamuZ3HIZSVLrPiG2h7fpuMxpKjfOuG
# Pas de SUMUP_WEBHOOK_SECRET — SumUp utilise return_url + vérification API
# Prix SMS facturé = SMS_COST_UNIT x (1 + SMS_MARGIN_PERCENT/100) = 0.0585€/SMS
# Pour changer le prix : modifier SMS_COST_UNIT ou SMS_MARGIN_PERCENT uniquement
```

## Sur Vercel (frontend)
```
VITE_SMS_COST_UNIT=0.045
VITE_SMS_MARGIN_PERCENT=30
VITE_SUMUP_PUBLIC_KEY=sup_pk_e1U8AGLWm7Y9nMHNjXpd3J7TekdexHghj
# Prix SMS affiché = VITE_SMS_COST_UNIT x (1 + VITE_SMS_MARGIN_PERCENT/100)
```

## SumUp Webhooks — Fonctionnement
SumUp n'a pas de Webhook Secret ni de dashboard webhooks.
Le webhook est déclaré via le paramètre return_url lors de la création du checkout.
SumUp envoie automatiquement un POST sur cette URL quand le statut change.
Ton backend DOIT toujours vérifier le statut via l'API SumUp avant de créditer.

URL webhook déclarée dans le code (return_url) :
https://flowia-backend.onrender.com/api/payments/sms/webhook

Double sécurité : si le webhook échoue, la route /verify/:checkout_id
est appelée au retour du commerçant sur la page SMS.

---

# Ordre d'exécution recommandé

1. Migrations DB (db/index.js)
2. messenger.js (utilitaire SMS)
3. campaigns.js (routes campagnes)
4. payments.js (routes paiements)
5. Modifier index.js (cron jobs + nouvelles routes)
6. Modifier auth.js (onboarding route)
7. Modifier AuthFlow.jsx (Google + redesign + onboarding)
8. Modifier Settings.jsx (onglet SMS + composant TabSMS + popup promo)
9. Modifier BookingPage.jsx (téléphone obligatoire)
10. Modifier api.js (nouvelles fonctions)
11. Verifier que tout compile : cd frontend && npx vite build
12. Si build OK : git add -A && git commit -m "feat: SMS campaigns + email quota + Google merchant OAuth + onboarding" && git push
13. Si build KO : corriger les erreurs puis recommencer etape 12