# FlowIA — STATUS (2026-04-18)

Dernier commit : **`78b3c75`** — `fix: Marketing IA fonctionne avec peu de clients (3+)`

---

## 🟢 Features livrées et testées

### Stripe embarqué (solde SMS)
- `SMSRechargeModal.jsx` — Elements wrap stable (useMemo options), CardNumber/Expiry/Cvc Elements inline
- Wizard 3 étapes visible : Chargement → Traitement → Finalisation → Recharge approuvée
- Cartes enregistrées (liste, défaut, supprimer) + 1-clic off-session
- Nouvelle carte avec option `save_card` (setup_future_usage on-session uniquement)
- Backend distinct 3 modes (`new_card`, carte enregistrée, PaymentElement)
- Route `/api/payments/sms/intent` + `/verify-intent` + `/payment-methods`
- Webhook `payment_intent.succeeded` gère les crédits
- **Config requise Vercel** : `VITE_STRIPE_PUBLISHABLE_KEY=pk_...` (sinon modal affiche "Stripe non configuré")

### Marketing IA — campagne prédictive par budget
- Sous-onglet 4e "✨ Marketing IA" dans Settings → Marketing
- Wizard 3 étapes : Budget/durée sliders → Plan éditable → Confirmation
- Segmentation RFM 5 classes fusionnée vers 3 phases actionnables
  (champion + prometteur absorbés dans `fidele`)
- Allocation 2 passes avec redistribution du surplus (fonctionne dès 1 client)
- **Scheduling prédictif** par client : `MODE` jour-de-semaine + slot horaire issus des RDV passés, fallback mardi/jeudi 11h
- **% adaptatifs** 5-35 pas de 5, inspirés de l'historique de conversion
- **Codes personnels** : `PRENOM + DISCOUNT + 4_random` (ex `GAB15R4KX`)
- SMS ≤160 car avec prénom, code, remise, validité, business_name, tél, adresse, site
- Tables nouvelles : `ai_campaigns` (header) + `ai_campaign_codes` (scheduling + tracking)
- Traçabilité conversion automatique via `public-booking.js` (UPDATE `used_at` + `used_appointment_id`)
- Historique IA sous le wizard avec vrai ROI (xN)
- Routes `/campaigns/auto-plan`, `/auto-send`, `/auto-recalculate`, `/ai-history`
- Cron SMS `processSmsQueue` toutes les 30 min (9h-20h), lit `scheduled_at TIMESTAMPTZ`

### Parcours client public
- **Annulation RDV** : politique configurable 0/1h/2h/6h/24h/48h via `booking_settings.cancellation_policy_hours`
- Pop-up moderne quand délai dépassé avec coordonnées commerçant cliquables
- Fix FK violation `appointments.client_id` : recréation fiche locale via `global_client_id` si supprimée
- **Suppression RGPD** (`DELETE /global-clients/me` + `DELETE /pub/:slug/client/account`) : annule RDV futurs, anonymise passés (`Client anonyme`, `client_id=NULL`), supprime toutes fiches locales, transactions intactes

### Emails
- **Deliverability Gmail Primary** : sujet personnalisé non-promo, texte brut, Header `List-Unsubscribe`, Reply-To business, design sobre
- Template SMS multi-ligne prérempli avec business_name/tél/adresse
- Modale moderne post-envoi (check vert, cartes email/SMS)
- Sender unifié `contact@haircoifflille.fr` (utilise `SENDER_EMAIL` env)

### URL routing
- `/settings/marketing/{fidelite|promotions|solde|ia}` — refresh-safe

### CRON bug
- Fix `CRON reminders operator does not exist: time without time zone - time with time zone`
  → utilisation de `LOCALTIME` au lieu de `CURRENT_TIME`

---

## 🔧 Architecture clé (rappels)

- **Tables créées** : `ai_campaigns`, `ai_campaign_codes` + migrations
  `users.stripe_customer_id`, `users.default_payment_method`,
  `campaign_queue.channel`, `campaign_queue.scheduled_at`, `campaign_queue.ai_code_id`,
  `booking_settings.cancellation_policy_hours`
- **`campaign_queue`** gère email ET SMS (discriminé par `channel`)
- **Deux cron** :
  - `processCampaignQueue` (email) toutes les heures
  - `processSmsQueue` (SMS) toutes les 30 min
- **Stripe Customer** auto-créé via `ensureStripeCustomer(userId)` pour réutiliser les cartes
- **Anti-spam SMS** : 7 jours via `message_log` dans `getClientSegmentsWithHabits`

---

## ⚠️ À vérifier en conditions réelles

1. **Vercel** : `VITE_STRIPE_PUBLISHABLE_KEY` définie ?
2. **Render** : `STRIPE_WEBHOOK_SECRET` configurée + webhook pointé vers `/api/payments/sms/webhook` ?
3. **Brevo** : expéditeur `contact@haircoifflille.fr` validé DKIM/SPF ?
4. Tester un cycle complet Marketing IA : Générer → modifier % → lancer → vérifier envoi SMS à l'heure planifiée → utiliser code → vérifier `used_at` dans `ai_campaign_codes`
5. Tester annulation avec policy 2h / 24h depuis un compte client

---

## 🎯 Pour la prochaine session

Mettre à jour STATUS.md après chaque feature, garder CLAUDE.md à jour.
Lire STATUS.md + MEMORY.md + CLAUDE.md en premier pour démarrer vite.
