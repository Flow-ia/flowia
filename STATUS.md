# FlowIA — STATUS (2026-04-18)

Dernier commit : **`78b3c75`** — `fix: Marketing IA fonctionne avec peu de clients (3+)`

---

## 🆕 Session 2026-04-18 (partie 4) : Config site intégrée dans booking + fix URLs images

- `backend/src/routes/media.js` : /meta renvoie `logo_version/profile_version/cover_list`
  (pas d'URLs hardcodées `/api/...` — le frontend construit via `mediaApi`)
- `frontend/src/utils/api.js` : `mediaApi.absoluteUrl(url)` normalise `/api/...` → `${BASE}/...`
- `frontend/src/pages/BookingPage.jsx` : `business.profile_url` / `cover_urls[].url`
  passent par `mediaUrl()` (fix affichage en prod)
- `frontend/src/pages/settings/TabImages.jsx` : URLs construites via `withVersion` +
  `mediaApi.logoUrl/profileUrl/coverUrl` → affichage fiable dev + prod
- `frontend/src/pages/Agenda.jsx` : `ConfigTab` exporté, sous-onglet "Config" retiré
  (tab bar masqué tant qu'il n'y a qu'un seul onglet)
- `frontend/src/pages/settings/TabBookingConfig.jsx` (NEW) : wrapper accordéon (fermé par défaut)
  qui charge settings+hours et rend `<ConfigTab>` à la demande
- `frontend/src/pages/settings/TabCategories.jsx` : section `booking` ordonne maintenant
  Config → Images → Services
- `frontend/src/pages/Settings.jsx` :
  - Label tab renommé `Config` → `Agenda`
  - `TAB_TO_URL.agenda` : `/settings/agenda` (plus `/agenda/config`)
  - Redirect legacy `/settings/agenda/config` → `/settings/categories/booking`

## 🆕 Session 2026-04-18 (partie 3) : Images merchant intégrées à "Site de réservation"

- `backend/src/routes/media.js` :
  - Nouveau type `logo` (GET public + POST auth avec cleanup provider)
  - `/meta` retourne `logo_id/url`, `profile_id/url`, `cover_urls[]` avec cache-buster `?v=created_at`
- `frontend/src/utils/api.js` : `mediaApi.logoUrl`, `mediaApi.uploadLogo`
- `frontend/src/pages/settings/TabImages.jsx` : réécrit (pattern services — preview 160px + boutons
  Remplacer/Supprimer, empty-state dashed). 3 sections : Logo, Photo de profil, Photos (4 max).
  Fix du bouton Supprimer profil (utilise `meta.profile_id` désormais exposé par /meta)
- `frontend/src/pages/settings/TabCategories.jsx` : TabImages rendu dans section `booking` (en plus des services)
- `frontend/src/pages/Settings.jsx` :
  - Tab "Images" (profil) retiré du menu
  - Redirect legacy `/settings/profil` → `/settings/categories/booking`

## 🆕 Session 2026-04-18 (partie 2) : Fix affichage images services + cleanup Cloudinary

- `backend/src/routes/media.js` :
  - Helper `deleteFromProvider` (Cloudinary destroy OU fs.unlink)
  - POST service/profile/cover : suppression ancienne image du provider avant nouvelle
  - DELETE /:id et /service/:id/image : cleanup provider
  - Architecture `flowia/commercant_\${userId}/services/\${serviceId}`
- `backend/src/routes/public-booking.js` : `has_image` sur GET /pub/:slug/services
- `frontend/src/pages/BookingPage.jsx` : URLs corrigées via `VITE_API_URL` (bug SPA rewrite Vercel)
- `frontend/src/pages/settings/TabCategories.jsx` : vignettes 40×40 + cache-bust `?v=_imgV`

## 🆕 Session 2026-04-18 : Pagination clients + historique + index BDD

### Frontend
- `frontend/src/pages/Transactions.jsx` : pagination 10/page (client-side sur `filtered`),
  navigation `‹ Préc. | Page X / N | Suiv. ›` avant le FAB.
  Reset auto de la page quand un filtre change (type/paiement/employé/recherche).
  Stats (`totRev`, `totExp`, CA mois) restent calculées sur **tout** le filtre (pas la page courante).
- `frontend/src/pages/ClientsPage.jsx` : pagination 10/page **server-side** (offset=page*10, limit=10),
  chargement automatique au montage (plus besoin de cliquer « Voir tous les clients »),
  compteur `X clients pour "..."` toujours visible, reset page sur changement de recherche/tri.

### Backend
- `backend/src/db/index.js` : 3 nouveaux index pour accélérer la pagination
  - `idx_transactions_user_client_type` sur `transactions(user_id, client_email, type)`
    → booste les subqueries `tx_count` / `total_spent WHERE type='revenue'` dans GET /clients
  - `idx_appointments_user_client` sur `appointments(user_id, client_email)`
    → booste le subquery `apt_count` dans GET /clients
  - `idx_transactions_user_date_time` sur `transactions(user_id, date DESC, time DESC NULLS LAST)`
    → matche exactement l'ORDER BY de GET /transactions

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
