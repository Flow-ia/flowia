# FlowIA — STATUS (2026-04-18)

Dernier commit : voir `git log -1`

---

## 🆕 Session 2026-04-18 (partie 12) : Anniversaires clients + programme de parrainage

### Scope (onboarding.md)
1. Date d'anniversaire optionnelle côté client + offre anniversaire configurable.
2. Parrainage : chaque client dispose d'un code unique par commerçant ; un
   filleul qui réserve via `?ref=CODE` déclenche l'émission de promos parrain+filleul.
3. Tout est **par commerçant** (user_id scoped).

### Backend — Schéma (`backend/src/db/index.js`)
- `ALTER TABLE global_clients  ADD birth_date DATE`
- `ALTER TABLE client_accounts ADD birth_date DATE`
- Nouvelles tables (user_id scoped) :
  - `birthday_campaigns` (1 ligne/commerçant : is_enabled, discount_type, discount_value, validity_days, message)
  - `referral_programs` (is_enabled, parrain_type/value, filleul_type/value)
  - `referral_codes` (UNIQUE user_id+code, UNIQUE user_id+owner_client_email, uses_count)
  - `referral_uses` (trace : code → filleul_email + promo_ids + appointment_id)

### Backend — Routes
- **NEW** `backend/src/routes/birthday.js` : GET/PUT `/api/birthday-campaign`
- **NEW** `backend/src/routes/referrals.js` : GET/PUT `/api/referrals/program`, GET `/api/referrals/codes`
  + export `genReferralCode()` (`REF-XXXXXX`)
- `global-clients.js` :
  - POST `/register` accepte `birth_date` (YYYY-MM-DD, optionnel)
  - GET `/me` renvoie désormais `birth_date`
  - **NEW** PATCH `/me` (birth_date, phone, first_name, last_name)
  - **NEW** GET `/me/referral-code/:slug` : retourne (ou crée) le code du client au commerçant
- `public-booking.js` :
  - **NEW** GET `/:slug/referral/:code` : validation publique d'un code
  - POST `/:slug/book` : si `referral_code` présent et programme actif →
    crée 2 `promo_codes` (PARRAIN-XXX + FILLEUL-XXX, 60j, 1 usage, target `specific`)
    + log dans `referral_uses` + incrémente `uses_count` (non bloquant)
- `index.js` : route les 2 nouveaux routers.

### Frontend
- `utils/api.js` : `birthdayApi` (get/update) + `referralsApi` (getProgram/update/listCodes)
- `pages/settings/TabMarketing.jsx` :
  - 2 nouveaux sous-onglets **🎂 Anniv.** + **🤝 Parrain.**
  - `TabBirthday` : toggle actif/inactif, type %/€, valeur, validité, message
  - `TabReferral` : toggle, récompenses parrain + filleul séparées, liste des
    parrains actifs (email + code + compteur filleuls)
- `pages/BookingPage.jsx` :
  - Formulaire inscription client : champ 🎂 **Date de naissance** (optionnel)
  - Capture `?ref=CODE` → persisté dans localStorage `ff_booking_ref_<slug>`,
    envoyé sur POST `/book` puis nettoyé après usage

### Cohérence / indépendance
- Toutes les tables scoped par `user_id` → chaque commerçant totalement indépendant
- Codes promo générés utilisent l'infrastructure `promo_codes` existante (stats,
  historique, target_clients=specific) → pas de régression
- Champ `birth_date` nullable partout → aucun impact sur inscriptions existantes
- Parrainage = non bloquant : une erreur n'empêche pas la création du RDV

### Build
- `cd frontend && npx vite build` → OK (21.21s, 80 modules)
- Syntax check backend : OK (5 fichiers)

### Restant (itération suivante)
- Cron quotidien pour émettre automatiquement les promos anniversaire + email/SMS
- Interface côté compte client pour copier son lien de parrainage personnel
- Auto-appliquer le code promo filleul dès la création du RDV (réduction visible)

---

## 🆕 Session 2026-04-18 (partie 11) : Édition complète des transactions /settings/historique

### Objectif (onboarding.md)
Permettre la modification complète d'une transaction depuis Settings → Historique :
items (nom/qté/prix unit.), répartition paiement mixte, client associé.
Affichage détaillé par ligne + cohérence stats/commissions/audit.

### Backend — `backend/src/routes/transactions.js`
- `getSnapshot()` enrichi : inclut désormais `items[]` + `payments[]` (pour l'audit)
- **PUT /:id** réécrit (admin PIN) :
  - Accepte `items[], payments[], client_email, client_name, client_note` en plus
  - Transaction SQL (BEGIN/COMMIT) : UPDATE tx + DELETE/re-INSERT items + payments
  - `qty_total` recalculé depuis items ; `payment_method='multi'` si split >1
  - Invalide cache `txs:${userId}`
  - Audit trail : snapshot_before / snapshot_after contiennent items+payments (diff complet)
  - Réponse enrichie avec `items[]` + `payments[]` (comme GET)
- DELETE /:id : ajoute invalidation cache `txs:${userId}` (manquante auparavant)

### Frontend
- `frontend/src/components/Forms.jsx` (TransactionForm) :
  - Nouveaux champs : `items[], payments[], split, client_email, client_name`
  - Éditeur items : add/remove/qté/prix unit. → total items affiché live
  - Montant auto-calculé depuis items (read-only si items présents) sinon saisie libre
  - Toggle « Diviser » : liste de paiements par mode + validation live
    (bouton désactivé et libellé « Répartition incomplète » tant que somme ≠ total)
  - Champs client (email + nom)
  - Payload envoie items/payments/client_email/client_name au backend
- `frontend/src/pages/settings/TabHistorique.jsx` :
  - Chaque ligne tx affiche un encart détails avec :
    - Items : `2 × Coupe @ 15€  = 30€`
    - Mini-chips paiements split (Espèces 20€ / Carte 10€)
  - Chip client (email) dans la barre de meta
- `frontend/src/pages/settings/shared.jsx` : `PAY_INFO.multi` (chip violet « Mixte »)

### Cohérence système
- Stats (`stats.js`) : lit `transaction_items` → automatiquement à jour
- Commissions (`commissions.js`) : lit `qty_total` → recalculé côté PUT
- Notifications / recaps : idem (lisent qty_total)
- Cache `txs:` invalidé sur PUT + DELETE
- Audit : chaque modification logge snapshot_before et snapshot_after avec items+payments

### Build
- `cd frontend && npx vite build` → OK (23.04s, 80 modules)
- `node --check backend/src/routes/transactions.js` → OK

---

## 🆕 Session 2026-04-18 (partie 10) : Fix CORS — sous-domaine commercant.* bloqué + vérif PIN

### Bug CORS
Console frontend `commercant.haircoifflille.fr` :
```
Access to fetch at 'https://flowia-backend.onrender.com/api/transactions'
from origin 'https://commercant.haircoifflille.fr'
has been blocked by CORS policy
```
Appels bloqués : `/api/transactions`, `/api/booking/appointments`, `/api/auth/pin/verify`,
`/api/notifications/inapp`. Le backend exige que l'origine figure dans `FRONTEND_URL`
(whitelist), et `commercant.haircoifflille.fr` n'y était pas → preflight KO.

### Fix — `backend/src/index.js`
- CORS : pour chaque domaine de base dans `FRONTEND_URL`, on accepte aussi
  automatiquement `www.*` et `commercant.*` (via `new URL()` + `hostname`).
- Plus besoin de mettre à jour l'env var à chaque nouveau sous-domaine applicatif.

### Vérification PIN (demande utilisateur) — OK, pas de bug
Les PIN admin et employés sont bien **indépendants par commerçant** :

- **Admin PIN** (`user_pins`) : clé primaire `user_id`, requête de vérification
  `SELECT pin_hash FROM user_pins WHERE user_id=$1` (routes/auth.js:302). Le token
  de session PIN est signé avec `userId` + `scope:pin_session` (middleware pinAdmin
  vérifie que `payload.userId === req.user.userId`).
- **Employé PIN** (`employee_pins`) : clé `employee_id` + FK `user_id`.
  Vérification : `WHERE ep.employee_id=$1 AND e.user_id=$2` (routes/employee-pins.js:130).
  Le token est signé avec `{ employeeId, userId, scope:'employee_pin_session' }`.

Donc aucune fuite possible entre commerçants. Les erreurs observées étaient dues au
blocage CORS (le `/pin/verify` ne recevait jamais de réponse).

---

## 🆕 Session 2026-04-18 (partie 9) : Fix inscription — infos commerçant persistées dans user context

### Bug
Après inscription (register/confirm) ou login, la carte "Informations du commerce"
(Settings → Config) affichait `-` pour téléphone, adresse, code postal, ville, Google Business
tant que la page n'était pas rechargée. `GET /auth/me` renvoyait bien les données, mais
`/register/confirm` et `/login` retournaient un `user` partiel `{ id, email, businessName }` →
`useAuth.login(token, userData)` alimentait le contexte avec ces seuls 3 champs.

### Fix — `backend/src/routes/auth.js`
- `POST /auth/register/confirm` : retourne désormais `{ phone, address, country, city,
  postalCode, googleBusinessUrl:null }` en plus de l'existant
- `POST /auth/login` : retourne le user complet (`phone, address, country, city, postalCode,
  googleBusinessUrl, firstName, lastName, avatarUrl, onboardingCompleted, hasGoogle`)
- Contrat aligné avec `GET /auth/me`

### Impact
- Après inscription, la section "Informations du commerce" est pré-remplie avec les
  infos saisies dans le formulaire d'inscription (nom, téléphone, adresse, CP, ville)
- Même comportement après login classique (plus besoin de reload)

---

## 🆕 Session 2026-04-18 (partie 8) : Onboarding — landing booking revu (horaires + réordonnancement)

### Spec (onboarding.md)
- Catégories fermées par défaut (seul le nom visible, ouverture au clic)
- Horaires d'ouverture affichés, 7 jours ordonnés à partir du jour actuel
- Sous horaires : adresse puis téléphone
- Puis « Nos prestations » (catégories fermées)
- Photos de couverture déplacées **en bas de la section avis**
- Inspiration : haircoifflille.setmore.com

### Backend — `backend/src/routes/public-booking.js`
- `GET /api/pub/:slug` : ajoute `hours` (objet keyé 0=dimanche…6=samedi)
  `{ is_open, open_time: "HH:MM", close_time: "HH:MM" }` lu depuis `business_hours`

### Frontend — `frontend/src/pages/BookingPage.jsx`
- **AccordionGroup** (l. 3723) : `useState(false)` → catégories fermées par défaut
- **Landing réordonné** (étape 1) :
  - Suppression : galerie cover au-dessus de Prestations + section "Images" (album)
  - **Nouveau** : section `#section-horaires` — 7 lignes, jour courant en tête avec badge "(aujourd'hui)", fond `cardAlt` ; affiche `Fermé` sinon `HH:MM – HH:MM`
  - Adresse remontée juste après Horaires (carte Maps + card adresse + téléphone)
  - Prestations (catégories fermées)
  - Équipe
  - Avis Google
  - **Nouveau** : section `#section-photos` (album) placée en bas, juste après Avis
- **Navigation desktop** (top nav + ancres) mise à jour : Horaires / Adresse / Prestations / Équipe / Commentaires / Photos ; mapping `#images/#photos/#album` → `section-photos`, ajout `#horaires`

### Build
- `cd frontend && npx vite build` → OK (12.51s, 80 modules)

---

## 🆕 Session 2026-04-18 (partie 7) : Routing par domaine — booking vs commerçant

### Objectif
- `haircoifflille.fr` (+ `www.`) → affiche directement la page de réservation (slug `lille`)
- `commercant.haircoifflille.fr` → app commerçant (admin)
- Domaine superadmin : reporté.

### Fichier modifié — `frontend/src/index.jsx`
- Imports : ajout `Navigate`, `useLocation`
- 3 constantes lues depuis `import.meta.env` :
  - `VITE_BOOKING_DOMAIN` (ex : `haircoifflille.fr`)
  - `VITE_COMMERCANT_DOMAIN` (ex : `commercant.haircoifflille.fr`)
  - `VITE_BOOKING_SLUG` (ex : `lille`)
- Helper `isBookingHost()` : match `BOOKING_DOMAIN` ou `www.BOOKING_DOMAIN`
- Nouveau composant `RootSwitch` rendu par la route `/*` :
  - si booking host + slug défini → `<Navigate to={'/book/<slug>'+search} replace />`
  - sinon → `<App />` (commerçant, comportement actuel)
- Les routes `/book/:slug/*` existantes restent intactes (rétro-compat).
- Pas de changement `vercel.json` (le rewrite SPA `/(.*)` couvre déjà les deux domaines).

### Build
- `cd frontend && npx vite build` → OK (17.15s, 80 modules)

### Actions manuelles à faire (ordre)
1. **Vercel → Settings → Domains** : ajouter `commercant.haircoifflille.fr`
2. **Registrar DNS** : CNAME `commercant` → `cname.vercel-dns.com`
3. **Vercel → Environment Variables** (Production) :
   ```
   VITE_BOOKING_SLUG=lille
   VITE_BOOKING_DOMAIN=haircoifflille.fr
   VITE_COMMERCANT_DOMAIN=commercant.haircoifflille.fr
   ```
   Redeploy nécessaire (Vite injecte les variables au build).
4. Attendre propagation DNS (jusqu'à 24h).
5. Tester `haircoifflille.fr` → doit rediriger vers `/book/lille`.
6. Tester `commercant.haircoifflille.fr` → dashboard commerçant.

### Restant
- Domaine superadmin (non implémenté cette session, prévu plus tard).

---

## 🆕 Session 2026-04-18 (partie 6) : Paiements mixtes — traçabilité correcte (plus de "Autres")

### Bug corrigé
Un encaissement divisé (ex : 20€ cash + 25€ carte + 5€ virement) était regroupé
dans les stats sous `multi` / `Autre`, rendant impossible la lecture par moyen.

### Backend — `backend/src/routes/export.js`
- CSV + PDF : colonne `mode_paiement` affiche désormais un libellé détaillé pour
  les tx multi (ex : `Espèces 20.00€ + Carte bancaire 25.00€ + Virement 5.00€`)
  construit via `LEFT JOIN LATERAL` sur `transaction_payments`
- `CA par moyen de paiement` (CSV + PDF) : CTE `pm_split` qui fait `UNION ALL`
  entre :
  - `transaction_payments` pour les tx `payment_method='multi'`
  - `transactions` elles-mêmes sinon
  → chaque moyen reçoit sa part réelle, aucun regroupement "Mixte" / "Autre"

### Frontend
- `frontend/src/pages/Dashboard.jsx` (StatsModal) : `byPM` éclate désormais les
  tx multi via `tx.payments[]` (helper `addPm`). Chaque moyen compte son propre
  montant + tx count.
- `frontend/src/pages/settings/TabStats.jsx` (EmpModal) : détail par employé par
  moyen utilise `amtFor(tx)` qui lit `tx.payments[].amount` pour les tx multi
  au lieu de filtrer par `payment_method===k` (qui ignorait les multi).

### Impact
- Stats du jour (Dashboard) : breakdown par moyen exact
- Performance employé (Settings → Stats → clic employé) : répartition correcte
- Exports CSV/PDF : ligne tx lisible + agrégat par moyen fidèle

---

## 🆕 Session 2026-04-18 (partie 5) : Caisse — quantités correctes + paiement mixte

### Problème résolu
Encaisser 2 coupes à 15€ affichait « 1 coupe à 30€ » au lieu de « 2 × 15€ ».
Impossible de répartir un paiement sur plusieurs modes (ex : 20€ cash + 10€ carte).

### Backend
- `backend/src/db/index.js` : nouvelle table `transaction_payments`
  (transaction_id, method, amount) + index. Migration idempotente.
- `backend/migrate.js` : création explicite `transaction_items` + `transaction_payments` + index dédiés
- `backend/src/routes/transactions.js` :
  - POST accepte `items: [{service_name, qty, unit_price, service_id}]` → insère dans
    `transaction_items` + calcule `qty_total` (somme des qty)
  - POST accepte `payments: [{method, amount}]` → si >1, `payment_method='multi'` +
    insertion dans `transaction_payments`
  - GET / renvoie désormais `items[]` et `payments[]` (json_agg)
  - Invalidation cache `txs:${userId}` sur création

### Frontend
- `frontend/src/App.jsx` (EncaisserSheet) :
  - **1 seule transaction** par encaissement (fini 1 tx/article) avec `items[]`
  - Nouveau toggle **« Diviser »** dans l'étape paiement → saisie des montants par mode
  - Validation live : bouton « Répartition incomplète » si la somme ≠ total
  - Payload enrichi avec `items` + `payments`
- `frontend/src/pages/Transactions.jsx` :
  - Nouveau chip `Mixte` (couleur `#7c3aed`) + filtre paiement `multi`
  - Filtre `cash/card/...` matche aussi les tx multi qui contiennent cette méthode
  - Détails items affichés sous le libellé (`2 × Coupe @ 15€ = 30€`)
  - Breakdown multi-paiement sous forme de mini-chips (ex : `💵 20€  💳 10€`)

### Impact (auto via transaction_items + qty_total)
- Stats : `stats.js` lit déjà `transaction_items` → produits/qty corrects
- Commissions : `commissions.js` utilise `qty_total` → corrigé
- Notifications / recaps : `notifications.js` utilise `qty_total` → corrigé

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
