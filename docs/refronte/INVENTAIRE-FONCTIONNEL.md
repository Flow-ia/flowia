# INVENTAIRE FONCTIONNEL EXHAUSTIF — FlowIA

> **Document CRITIQUE.** Liste EXHAUSTIVE des 100% des fonctionnalités présentes dans l'application actuelle, extraite directement de la documentation fournie.
>
> **Claude Code doit cocher chaque case au fur et à mesure de la refonte**.
> **Règle absolue : zéro fonctionnalité de cette liste ne peut disparaître dans la refonte.**

---

## 1. AUTHENTIFICATION & COMPTES (5 TYPES DE TOKEN)

### 1.1 Auth commerçant (Merchant JWT)
- [ ] `POST /api/auth/register` — OTP 6 chiffres envoyé par email (15 min)
- [ ] `POST /api/auth/register/confirm` — confirme OTP, crée `users` + catégories par défaut + `booking_settings` avec slug unique
- [ ] `POST /api/auth/resend-code` — renvoi OTP
- [ ] `POST /api/auth/login` — login email/password (`loginLimiter` 10/5min, timing attack constant via DUMMY_BCRYPT)
- [ ] `POST /api/auth/forgot` — OTP reset password (toujours 200 anti-énumération)
- [ ] `POST /api/auth/forgot/verify` + `/forgot/reset`
- [ ] `POST /api/auth/change-email` + `/change-email/confirm` (OTP vers nouvelle adresse)
- [ ] `POST /api/auth/change-password`
- [ ] `GET /api/auth/me` — profil complet
- [ ] `PUT /api/auth/profile` — update businessName, phone, address, city, postalCode, lat, lng, googleBusinessUrl
- [ ] `POST /api/auth/onboarding` — marque `onboarding_completed = TRUE`
- [ ] `DELETE /api/auth/account` — suppression RGPD cascade
- [ ] `GET /api/auth/google/merchant/callback` — OAuth Google commerçant (**NE PAS TOUCHER**)
- [ ] `GET /api/auth/google/callback` — OAuth Google client global
- [ ] JWT scope vide, claims `{userId, email, businessName}`, expire 7 jours
- [ ] `ff_token` stocké en localStorage
- [ ] `isJwtLocallyExpired(token)` skew 10s
- [ ] `notifyLoginJustHappened()` grace 15s post-login (cold start Render)
- [ ] `handleMerchant401()` double-check `/auth/me` avant purge (dédup `__meCheckInFlight`)
- [ ] Event `ff-auth-expired` → retombe sur `/login`

### 1.2 PIN Admin (session 2h)
- [ ] `GET /api/auth/pin/status` — `{has_pin}`
- [ ] `POST /api/auth/pin/verify` — retourne JWT scope `pin_session` (2h)
- [ ] `POST /api/auth/pin/check-session`
- [ ] `POST /api/auth/pin/set`
- [ ] `DELETE /api/auth/pin`
- [ ] `POST /api/auth/pin-change-request` + `/pin-change-confirm` (OTP)
- [ ] `POST /api/auth/pin-forgot-request` + `/pin-forgot-verify` (reset OTP email)
- [ ] PIN 4 chiffres hashé bcrypt stocké dans `user_pins`
- [ ] `pinAdminMiddleware` sur toutes routes critiques (header `x-pin-session`)
- [ ] UI : re-saisie systématique, session 5 min max, purge à sortie `/settings`
- [ ] Event storage pour purge multi-tab

### 1.3 PIN Employé (session 2h + anti-brute-force)
- [ ] Pas de compte email/password, uniquement PIN 4 chiffres
- [ ] Token JWT scope `employee_pin_session`, 2h, header `x-employee-pin`
- [ ] `GET /api/employee-pins/`
- [ ] `GET /api/employee-pins/:employeeId/status`
- [ ] `POST /api/employee-pins/:employeeId/set` (PIN admin)
- [ ] `DELETE /api/employee-pins/:employeeId` (PIN admin)
- [ ] `PATCH /api/employee-pins/:employeeId/toggle` (is_active)
- [ ] `POST /api/employee-pins/:employeeId/verify` (`employeePinVerifyLimiter` 5/5min + lockout DB 30 min après 5 échecs)
- [ ] Table `employee_pins` : failed_attempts, locked_until
- [ ] UI re-saisie à chaque action sensible (sessionStorage `ff_emp_pin_<empId>`, TTL 5 min)

### 1.4 Client interne (scoped user_id)
- [ ] JWT scope `client`, localStorage `ff_client_token` + `ff_client_info`
- [ ] Lié à table `client_accounts` (UNIQUE(user_id, email))
- [ ] Routes publiques `/api/pub/:slug/client/*`
- [ ] `POST /api/pub/:slug/client/register` — consent_at enregistré
- [ ] `POST /api/pub/:slug/client/quick-register` — QR code express (`quickRegisterLimiter` 30/15min)
- [ ] `POST /api/pub/:slug/client/login`
- [ ] `GET /api/pub/:slug/client/check-email`
- [ ] `GET /api/pub/:slug/client/appointments`
- [ ] `PUT /api/pub/:slug/client/appointments/:id/cancel` — respect `cancellation_policy_hours`
- [ ] `PUT /api/pub/:slug/client/profile` — dont `marketing_opt_in`, `birth_date`
- [ ] `DELETE /api/pub/:slug/client/account` — RGPD anonymise

### 1.5 Client global (multi-commerces)
- [ ] JWT scope `global_client`
- [ ] Table `global_clients` (email UNIQUE)
- [ ] Support OAuth Google
- [ ] `POST /api/global-clients/register`, `/login`, `/activate` (invite)
- [ ] `POST /api/global-clients/forgot-password`, `/reset-password`
- [ ] `GET /me`, `PATCH /me`, `POST /me/change-email`+`/confirm`, `/change-password`
- [ ] `GET /appointments`, `/me/visits`, `/me/visits/:id`, `/loyalty`
- [ ] `GET /me/referral-code/:slug`, `/me/referral-history/:slug`
- [ ] `DELETE /me` — soft 30j, `deletion_requested_at`, hard après
- [ ] `GET /me/export` — JSON complet RGPD

---

## 2. RÔLES & PERMISSIONS

### 2.1 Permissions employé (table `employees`)
- [ ] `can_cancel` — annuler un RDV
- [ ] `can_modify` — modifier un RDV
- [ ] `can_encash` — encaisser en caisse
- [ ] `can_use_promo` — appliquer codes promo
- [ ] `can_grant_credit` — accorder crédit client
- [ ] `can_repay_credit` — rembourser/utiliser crédit client
- [ ] `show_on_booking` — visible page publique
- [ ] `show_in_caisse` — visible en caisse
- [ ] `is_active` — employé actif ou non

### 2.2 Commerçant (admin)
- [ ] Toutes les permissions, tout configurer, encaisser, gérer équipe, marketing

---

## 3. SCHÉMA BASE DE DONNÉES (30+ tables)

### 3.1 Domaine Compte/Auth
- [ ] `users` — id, email UNIQUE, password_hash, business_name, phone, address, country, city, postal_code, lat, lng, google_id, stripe_customer_id, google_business_url, first_name, last_name, avatar_url, sms_balance DECIMAL ≥ 0, onboarding_completed, created_at
- [ ] `verification_codes` — OTP 15min (key, code, data JSONB, expires_at)
- [ ] `user_pins` — user_id, pin_hash, updated_at

### 3.2 Domaine Équipe
- [ ] `employees` — id, user_id, name, role, phone, email, avatar_color, is_active, 6 permissions, show_on_booking, show_in_caisse, commission_pct, created_at
- [ ] `employee_pins` — employee_id PK, user_id, pin_hash, is_active, failed_attempts, locked_until
- [ ] `employee_hours` — day_of_week 0-6, open_time, close_time, is_open, use_business_hours
- [ ] `employee_time_slots` — plages multiples (slot_start, slot_end)
- [ ] `employee_availability` — dispos ponctuelles par date
- [ ] `employee_absences` — type (conges|maladie|formation|accident_travail|maternite|paternite|sans_solde|autre), start_date, end_date, label, reason, cancelled_at

### 3.3 Domaine Catalogue
- [ ] `categories` — type `revenue|expense`, icône, couleur, parent_id (hiérarchie), price, is_free_price
- [ ] `booking_service_categories` — catégories page publique
- [ ] `booking_services` — duration_minutes, price, couleur, booking_category_id, is_active, sort_order
- [ ] `commissions` — par employé/service/catégorie

### 3.4 Domaine Business Hours
- [ ] `booking_settings` — slug UNIQUE, is_enabled, advance_booking_days (défaut 30), min_notice_hours (défaut 1), cancellation_policy_hours (défaut 2), require_account, timezone
- [ ] `business_hours` — open_time, close_time, is_open par jour
- [ ] `business_breaks` — break_start, break_end par jour

### 3.5 Domaine Clients
- [ ] `client_accounts` — scoped user_id, UNIQUE(user_id, email), birth_date, marketing_opt_in, marketing_opt_in_at, unsubscribe_token UUID, is_booking_blocked, last_birthday_reward_at (anti-fraude 330j), consent_at, consent_ip, source
- [ ] `global_clients` — email UNIQUE, google_id, birth_date, marketing_opt_in, deletion_requested_at
- [ ] `client_notes` — note_text, created_by_name, client_email/name NULLABLE (RGPD)

### 3.6 Domaine RDV
- [ ] `appointments` — service_id, employee_id, client_id, date, start_time, end_time, duration_minutes, total_amount, status `pending|confirmed|cancelled|completed|no_show`, paid, paid_method, transaction_id, promo_code_id, discount_amount, reminder_24h_sent, reminder_2h_sent
- [ ] `appointment_items` — panier de prestations

### 3.7 Domaine Caisse/Transactions
- [ ] `transactions` — type `income|expense|revenue|refund|adjustment`, payment_method `cash|card|transfer|check|multi|other`, source `manual|rdv|credit|ai_campaign`, locked, idempotency_key UNIQUE(user_id, idempotency_key), promo_code_id, discount_amount
- [ ] `transaction_items` — détail panier multi-items
- [ ] `transaction_payments` — multi-paiement (ex: 50€ espèces + 30€ carte)
- [ ] `transaction_audit_log` — snapshot_before/after JSONB, qui/quand/pourquoi

### 3.8 Domaine Fidélité
- [ ] `loyalty_programs` — enabled, loyalty_mode `stamps|points`, stamps_required, points_per_euro, min_purchase, reward_type `percent|fixed`, reward_value, validity_days, count_trigger `both|physical|online`
- [ ] `client_loyalty` — stamps, total_stamps_ever, points, total_points_ever, rewards_earned, last_visit

### 3.9 Domaine Promotions/Récompenses
- [ ] `promo_codes` — code, type `percent|fixed`, value, max_uses, uses_count, valid_from, valid_until, is_active, target_clients `all|new|specific`, owner_client_email, is_loyalty_reward, min_purchase, time_allday, time_from, time_until
- [ ] `promo_usage_logs` — audit utilisation
- [ ] `client_rewards` — anniversaire/parrainage/fidélité unifiés, status `available|used|expired`, expires_at

### 3.10 Domaine Crédit client
- [ ] `client_credits` — balance, total_granted, total_repaid, UNIQUE(user_id, client_email), email/name NULL possible (RGPD)
- [ ] `credit_transactions` — type `grant|repay`, amount, note, payment_method, transaction_id

### 3.11 Domaine Parrainage
- [ ] `referral_programs` — is_enabled, parrain_type/value, filleul_type/value, limit_count, limit_period `unlimited|lifetime|month|3months|year`
- [ ] `referral_codes` — code unique par parrain (UNIQUE(user_id, owner_client_email))
- [ ] `referral_uses` — filleul_email, parrain_promo_id, filleul_promo_id, appointment_id, transaction_id, status `pending|validated|cancelled`, validated_at

### 3.12 Domaine Anniversaires
- [ ] `birthday_campaigns` — is_enabled, discount_type, discount_value, validity_days, message

### 3.13 Domaine Marketing/SMS
- [ ] `campaigns` — target_type, channel, sent_sms, sent_email, failed_count, sms_cost, status
- [ ] `campaign_queue` — channel `email|sms`, status `pending|sent|failed`, scheduled_at, sent_at, error, ai_code_id
- [ ] `ai_campaigns` — budget, duration_days, status `scheduled|running|completed`, phases JSONB, total_sms, total_cost
- [ ] `ai_campaign_codes` — segment, discount_percent, scheduled_at, sent_at, used_at
- [ ] `sms_transactions` — recharge/refund/débit, `UNIQUE(sumup_checkout_id) WHERE NOT NULL` pour idempotency Stripe
- [ ] `message_log` — log SMS/email envoyés avec coûts
- [ ] `email_global_daily` — compteur global cluster-safe (quota Brevo 300/j)

### 3.14 Domaine Notifications
- [ ] `notification_settings` — daily_recap_enabled/time/email, reminder_enabled/delays (CSV : "1440,120" = 24h+2h), employee_reminder_enabled/delays, sound_caisse/new_appt/reminder, sound_repeat, sound_rdv_before (15 min), push_enabled, inapp_enabled
- [ ] `notification_log` — dédoublonnage type × appointment_id
- [ ] `app_notifications` — centre in-app (is_read)
- [ ] `push_subscriptions` — VAPID (endpoint, p256dh, auth_key)

### 3.15 Domaine Médias
- [ ] `media` — type `profile|cover|service|logo|employee`, ref_id, path, provider `local|cloudinary`

---

## 4. MIDDLEWARES & SÉCURITÉ

### 4.1 Middlewares
- [ ] `authMiddleware` — Authorization Bearer, JWT + exp, reject non-merchant (401/403)
- [ ] `employeePinOptional` — x-employee-pin, tolérant absence, injecte `req.employee` avec flags `can_*`, `req.isEmployee`, `req.isMerchant`
- [ ] `pinAdminMiddleware` — x-pin-session, reject 403 `ACTION_ADMIN_ONLY`, injecte `req.pinAdmin=true`
- [ ] `requireMerchant` — vérifie existence merchant en base

### 4.2 Rate limiters
- [ ] `authLimiter` : 20/2min (routes auth hors login/register)
- [ ] `registerLimiter` : 5/10min
- [ ] `loginLimiter` : 10/5min (anti-brute-force)
- [ ] `notifLimiter` : 60/min
- [ ] `statsLimiter` : 60/min (cache fort)
- [ ] `apiLimiter` : 300/min (API générale)
- [ ] `pubLimiter` : 600/min (réservation publique, trafic élevé)
- [ ] `quickRegisterLimiter` : 30/15min (inscription QR)
- [ ] `paymentsIntentLimiter` : 15/15min (Stripe PaymentIntent)
- [ ] `employeePinVerifyLimiter` : 5/5min + lockout DB 30min après 5 échecs

### 4.3 RGPD
- [ ] `marketing_opt_in` + `marketing_opt_in_at` + `consent_at` + `consent_ip`
- [ ] `unsubscribe_token` UUID pour 1-clic
- [ ] Suppression client global : soft 30j, hard après
- [ ] Anonymisation client_email/client_name à NULL sur `client_credits`, `client_notes`
- [ ] Export données : `GET /me/export` JSON complet

### 4.4 Multi-tenancy
- [ ] Toutes données scoped par `user_id` FK
- [ ] UNIQUE(user_id, email) sur `client_accounts`
- [ ] Routes publiques `/api/pub/:slug/*` résolvent le merchant via slug

### 4.5 Clustering & Cron
- [ ] Mode cluster workers
- [ ] Cron uniquement sur worker 1 (`isWorker1`)
- [ ] Guard temporel par cron (heures d'activité 7-20, 8-20, 9-20)

### 4.6 Idempotency
- [ ] `transactions.idempotency_key` UNIQUE(user_id, idempotency_key) anti double-clic
- [ ] `sms_transactions.sumup_checkout_id` UNIQUE partiel anti double-crédit Stripe
- [ ] `transaction_audit_log` snapshot_before/after JSONB
- [ ] Caches mémoire 5-10 min (stats, transactions) invalidés à chaque écriture

---

## 5. ROUTES API (TOUTES)

### 5.1 Auth commerçant `/api/auth` — TOUTES les routes listées en 1.1

### 5.2 PIN admin `/api/auth/pin/*` — TOUTES les routes listées en 1.2

### 5.3 Réservation commerçant `/api/booking`
- [ ] `GET /check-slug` (pré-auth)
- [ ] `GET /settings`, `PUT /settings` (PIN admin)
- [ ] `GET /services`, `POST/PUT/DELETE /services/:id` (PIN admin)
- [ ] `GET /appointments` (from, to, employee_id, client_id, status)
- [ ] `POST /appointments` — calcule total_amount + total_duration
- [ ] `PUT /appointments/:id` — respect cancellation_policy_hours
- [ ] `PATCH /appointments/:id/cancel` — cancel_reason
- [ ] `DELETE /appointments/:id` (PIN admin) — hard delete
- [ ] `POST /appointments/:id/checkout` — crée transaction, paid=TRUE, fidélité, parrainage
- [ ] `GET /clients` (search, limit, offset)
- [ ] `GET /availability/:employee_id` — calcul complet créneaux libres
- [ ] `POST /availability` — dispo ponctuelle
- [ ] `GET/POST/DELETE /employee-hours[/:id]`
- [ ] `GET/POST/DELETE /employee-slots[/:id]`
- [ ] `GET/POST/DELETE /breaks[/:id]`
- [ ] `GET/PUT /employee-permissions/:id` (PIN admin)
- [ ] `GET /employee-agenda`, `POST/PUT /employee-agenda/appointments[/:id]` — drag & drop

### 5.4 Réservation publique `/api/pub/:slug`
- [ ] `GET /:slug` — infos commerce
- [ ] `GET /:slug/services`, `GET /:slug/employees` (filtre show_on_booking=TRUE)
- [ ] `GET /:slug/slots` — créneaux temps réel
- [ ] `GET /:slug/closed-days`, `GET /:slug/month-status` — données calendrier
- [ ] `POST /:slug/book` — respect require_account
- [ ] `GET /:slug/promo/check`, `POST /:slug/check-promo`
- [ ] `GET /:slug/referral/:code` — infos parrainage
- [ ] `GET /:slug/google-rating` — note Google Business cachée
- [ ] `POST /:slug/client/register` — consent_at
- [ ] `POST /:slug/client/quick-register`
- [ ] `POST /:slug/client/login`, `GET /check-email`
- [ ] `GET /:slug/client/appointments`
- [ ] `PUT /:slug/client/appointments/:id/cancel`
- [ ] `PUT /:slug/client/profile`
- [ ] `DELETE /:slug/client/account` — RGPD anonymise

### 5.5 Transactions/Caisse `/api/transactions`
- [ ] `GET /` (from, to, limit, offset) — cache 10 min
- [ ] `GET /stats` — cache 5 min
- [ ] `GET /today`
- [ ] `POST /` — `employeePinOptional`, validation whitelist stricte, multi-items + multi-paiements + fidélité + audit + cache-invalidation + idempotency
- [ ] `PUT /:id` (PIN admin)
- [ ] `DELETE /:id` (PIN admin) — soft + audit

### 5.6 Employés `/api/employees`
- [ ] `GET /`
- [ ] `POST /`, `PUT /:id`, `DELETE /:id` (PIN admin)
- [ ] `GET /:id/future-appointments`

### 5.7 Employee PINs `/api/employee-pins` — TOUTES les routes listées en 1.3

### 5.8 Catégories
- [ ] `/api/categories` (caisse) — CRUD, `PATCH /reorder`, écritures PIN admin
- [ ] `/api/booking/service-categories` (réservation) — idem

### 5.9 Commissions `/api/commissions`
- [ ] CRUD complet, écritures PIN admin

### 5.10 Fidélité `/api/loyalty`
- [ ] `GET /program`, `PUT /program` (PIN admin)
- [ ] `GET /clients`
- [ ] `POST /stamp` — cap 20/op
- [ ] `DELETE /clients/:id` (PIN admin)
- [ ] `GET /promo-history`
- [ ] `POST /add-service` — ajoute service/prestation au programme
- [ ] `GET /stats`
- [ ] `GET /search-clients`
- [ ] Caps: MAX_STAMPS_REQ=100, MAX_REWARD_PCT=100, MAX_REWARD_FIXED=500€, MAX_POINTS_PER_EU=100, MAX_VALIDITY_DAYS=3650, MAX_MIN_PURCHASE=10000€

### 5.11 Promotions `/api/promo`
- [ ] `GET /`, `GET /stats`
- [ ] `POST /check`
- [ ] `POST /`, `PUT /:id`, `DELETE /:id` (PIN admin)
- [ ] `POST /:id/send-emails` (PIN admin)
- [ ] Règles check : dates, uses, target_clients, min_purchase, plage horaire
- [ ] Codes auto-générés (is_loyalty_reward=TRUE) non modifiables

### 5.12 Crédits client `/api/credits`
- [ ] `GET /` (search, only_active)
- [ ] `GET /client/:clientId`
- [ ] `POST /grant` — upsert balance + insert credit_transactions
- [ ] `POST /repay` — crée transaction revenue source='credit', décrémente balance
- [ ] `DELETE /:id`
- [ ] Event `ff-tx-refresh` côté frontend pour rafraîchir

### 5.13 Parrainage `/api/referrals`
- [ ] `GET /program`, `PUT /program` (PIN admin) — caps percent≤100, fixed≤500€, limit_count≤10000
- [ ] `GET /codes`
- [ ] `GET /rewards?email=` — agrégation anniversaire + parrainage + fidélité
- [ ] `GET /pub/:slug/referral-program` (public)

### 5.14 Global clients `/api/global-clients` — TOUTES les routes listées en 1.5

### 5.15 Notifications `/api/notifications`
- [ ] `GET /settings`, `PUT /settings` (PIN admin)
- [ ] `POST /test-recap` — envoi récap test hors quotas
- [ ] `GET /vapid-public-key` (public)
- [ ] `POST /push-subscribe`, `DELETE /push-subscribe`
- [ ] `GET /inapp`
- [ ] `PATCH /inapp/read` (id, ids[], _all)
- [ ] `DELETE /inapp/:id`

### 5.16 Absences `/api/absences`
- [ ] `GET /` (from, to, employee_id, include_cancelled)
- [ ] `GET /stats`
- [ ] `POST /`, `PUT /:id`
- [ ] `PATCH /:id/cancel` — cancel_reason
- [ ] Types : conges, maladie, formation, autre, accident_travail, maternite, paternite, sans_solde

### 5.17 Anniversaires `/api/birthday-campaign`
- [ ] `GET /program`, `PUT /program` (PIN admin)

### 5.18 Export `/api/export` (PIN admin)
- [ ] `GET /csv` (from, to, format, type `transactions|clients|appointments|all`)
- [ ] `GET /pdf`

### 5.19 Marketing/Campagnes `/api/campaigns`
- [ ] `GET /`, `POST /`
- [ ] `GET /:id/preview`
- [ ] `POST /:id/send` (PIN admin)
- [ ] `GET /auto-plan` — IA suggestion
- [ ] `POST /auto-send` (PIN admin) — IA lance campagne
- [ ] `GET /auto-recalculate`
- [ ] `GET /ai-history`

### 5.20 Paiements/SMS `/api/payments`
- [ ] `GET /sms/balance`
- [ ] `GET /sms/transactions`
- [ ] `POST /sms/intent` (`paymentsIntentLimiter`) — 3 modes : nouvelle carte+save / carte enregistrée off_session / automatic_payment_methods
- [ ] `GET /sms/verify/:sessionId`
- [ ] `POST /sms/verify-intent`
- [ ] `POST /sms/webhook` (Stripe) — `creditSmsOnce` atomique, idempotency UNIQUE
- [ ] `GET /sms/payment-methods`
- [ ] `POST /sms/set-default`
- [ ] `DELETE /sms/payment-methods/:id`
- [ ] Prix SMS = SMS_COST × (1 + SMS_MARGIN/100) ≈ 0,0585€
- [ ] Refund automatique sur échec
- [ ] Débit upfront estimé campagne

### 5.21 Médias `/api/media`
- [ ] Lecture publique : `/commercant/:userId/*`, `/employee/:id/image`, `/service/:id/image`
- [ ] Upload multipart : whitelist jpeg|png|webp|gif, 5Mo max
- [ ] Middleware erreur global renvoie toujours JSON `{error}` pour `/api/*`
- [ ] Provider : Cloudinary si credentials, sinon local (fallback)

### 5.22 Notes client `/api/client-notes`
- [ ] `GET /?client_email=`
- [ ] `POST /`
- [ ] `PUT /:id`
- [ ] `DELETE /:id` (PIN admin)
- [ ] `GET /search`
- [ ] `GET /history?email=&employee_id=`

### 5.23 Clients `/api/clients`
- [ ] `GET /` (params)
- [ ] `GET /search?q=`
- [ ] `GET /:id`
- [ ] `POST /`, `PUT /:id`, `DELETE /:id`
- [ ] `POST /:id/invite` — inviter à créer compte
- [ ] `POST /:id/note` — ajouter note
- [ ] `PATCH /:id/block` — bloquer/débloquer (is_booking_blocked)

### 5.24 Stats `/api/stats` (`statsLimiter`)
- [ ] `GET /today`
- [ ] `GET /forecast` — IA 7 jours
- [ ] `GET /heatmap` — jour × heure
- [ ] `GET /plan`
- [ ] `POST /plan/launch`
- [ ] `GET /products` — stats ventes produits

---

## 6. CRON / TÂCHES PLANIFIÉES (worker 1 uniquement)

- [ ] **Rappels RDV** (chaque minute) — J+1 (24h) et J (2h), flags reminder_24h_sent/reminder_2h_sent, heures 7-20
- [ ] **Rappels shift employés** (chaque minute) — emails avant shift, heures 7-20
- [ ] **Daily recaps** (chaque 5 min) — si daily_recap_enabled et heure courante = daily_recap_time
- [ ] **Queue emails campagnes** (chaque heure) — 30 lignes/pass, throttle 500ms, quota Brevo 300/j
- [ ] **Queue SMS** (chaque 30 min) — 50 lignes/pass, 9-20h, throttle 200ms, **refund auto sur échec**
- [ ] **Rappels RDV (24h+2h)** (chaque heure, 7-20) — doublon du premier
- [ ] **Transaction cleanup** (chaque 2h) — sms_transactions pending > 2h → expired
- [ ] **Birthday promos** (chaque heure, guard 09:00 unique) — crée promo_code + client_reward + email, anti-fraude rolling window 330j, tolère 29/02 (fallback 28/02), retry 3× sur collision code

---

## 7. RÈGLES MÉTIER

### 7.1 Réservation
- [ ] Anticipation max : `advance_booking_days` (défaut 30)
- [ ] Préavis min : `min_notice_hours` (défaut 1)
- [ ] Politique annulation : `cancellation_policy_hours` (défaut 2), refus back + modale TooLateModal front
- [ ] Slug unique par commerce = URL publique
- [ ] Si require_account=TRUE, réservation exige compte client

### 7.2 Disponibilité employé (calcul créneau)
- [ ] business_hours (ouverture commerce par jour)
- [ ] business_breaks (pauses commerce)
- [ ] employee_hours (surcharge par employé, flag use_business_hours)
- [ ] employee_time_slots (plages multiples par jour)
- [ ] employee_availability (dispos ponctuelles)
- [ ] employee_absences (exclusion totale période)
- [ ] RDV existants (exclus)

### 7.3 Caisse/Transactions
- [ ] Validation whitelist type/method/amount≥0
- [ ] Idempotency double-clic
- [ ] Multi-paiement : method='multi' + lignes transaction_payments
- [ ] Multi-items : transaction_items
- [ ] Déclenche fidélité si type='revenue' et loyalty enabled
- [ ] Audit complet
- [ ] Modif/suppr PIN admin obligatoire

### 7.4 Fidélité
- [ ] Modes tampons (entier) ou points (décimal points_per_euro)
- [ ] min_purchase seuil min
- [ ] count_trigger : both / physical (caisse) / online (RDV)
- [ ] Récompense auto dès stamps ≥ stamps_required (promo_code + client_reward available)
- [ ] Valide validity_days après génération
- [ ] Caps listés en 5.10

### 7.5 Parrainage
- [ ] Anti-abus limit_count × limit_period (unlimited|lifetime|month|3months|year)
- [ ] Normalisation email : Gmail alias `+` ignoré, trim, lowercase (anti auto-parrainage via alias)
- [ ] Flow : parrain obtient code REF-XXXX → filleul saisit au 1er RDV (status pending) → carte "Parrainage en attente" en caisse → validation atomique création 2 promo_codes + 2 client_rewards available + status validated

### 7.6 Anniversaires
- [ ] Cron 09:00 — code BDAY-XX1234 + email HTML
- [ ] Clients avec birth_date = aujourd'hui ET marketing_opt_in=TRUE
- [ ] Anti-fraude rolling window 330 jours sur last_birthday_reward_at
- [ ] Limite Brevo 300/j global → stop si atteint

### 7.7 Promotions
- [ ] Types percent / fixed, caps 100% / 10 000€
- [ ] Restrictions : dates, usage, clients all/new/specific, plage horaire, min_purchase
- [ ] Non cumulables (1 code par transaction)
- [ ] Codes auto-générés non modifiables

### 7.8 Crédit client
- [ ] balance > 0 = crédit à consommer
- [ ] Grant = permission can_grant_credit employé
- [ ] Repay = transaction revenue source='credit', décrémente balance
- [ ] Refresh dashboard via event ff-tx-refresh

### 7.9 SMS/Marketing
- [ ] Prix SMS ≈ 0,0585€
- [ ] Recharge Stripe idempotent
- [ ] Débit campagne upfront estimé
- [ ] Refund auto sur échec
- [ ] Quota Brevo 300/j

### 7.10 Notifications
- [ ] Types : new_appointment, reminder, caisse, daily_recap
- [ ] Dédoublonnage via notification_log
- [ ] reminder_delays CSV minutes ("1440,120" = 24h+2h)
- [ ] Sons Web Audio API (oscillators), répétés N fois, sound_rdv_before X min avant
- [ ] Web Push VAPID, Service Worker
- [ ] Deep-link : data.url = /agenda?date=YYYY-MM-DD&appt=<id>, front ouvre vue Jour + modal RDV

### 7.11 RGPD
- [ ] consent_at, consent_ip à l'inscription
- [ ] Toggle marketing_opt_in horodaté
- [ ] Désinscription 1-clic via unsubscribe_token
- [ ] Suppression client global soft 30j
- [ ] Anonymisation email/name → NULL dans client_credits/client_notes
- [ ] Export JSON complet

---

## 8. FRONTEND — ROUTES

### 8.1 Routes commerçant (privées)
- [ ] `/` → redirect `/dashboard`
- [ ] `/dashboard` — tuiles, notif center, quick entry
- [ ] `/historique` — historique + stats jour (gate PIN)
- [ ] `/transactions` — CRUD, filtres
- [ ] `/agenda`, `/agenda/views`, `/agenda/views/:employeeId` — multi/solo
- [ ] `/clients` — CRM
- [ ] `/settings`, `/settings/*` — multi-onglets
- [ ] `/login`, `/register`, `/forgot-password`

### 8.2 Routes client public `/book/:slug/*`
- [ ] `/book/:slug` — Step1Home
- [ ] `/book/:slug/login`, `/register`, `/auth`
- [ ] `/book/:slug/service/:serviceId/employe` — Step2
- [ ] `/book/:slug/employe/:employeeId` — Step2 (chemin inverse)
- [ ] `/book/:slug/service/:serviceId/employe/:employeeId/date` — Step3
- [ ] `.../date/:dateStr/creneau` — Step4
- [ ] `.../creneau/:slot/infos` — Step5
- [ ] `.../infos/confirmation` — Step6
- [ ] `/book/:slug/client/rdv` — Mes RDV (gate auth)
- [ ] `/book/:slug/client/passages` — Mes passages
- [ ] `/book/:slug/client/passages/:visitId` — Détail
- [ ] `/book/:slug/client/profil`
- [ ] `/book/:slug/parrain`
- [ ] `/book/:slug/politique`
- [ ] `/j/:slug` → redirect `/book/:slug/auth?quick=1` (QR)
- [ ] `/oauth/callback`

---

## 9. FRONTEND — PAGES COMMERÇANT

### 9.1 Dashboard
- [ ] TileHistorique → `/historique` gate PIN
- [ ] TileNotifs → NotifModal avec compteur
- [ ] TileAgenda → `/agenda`
- [ ] TileClients → `/clients`
- [ ] TileParametres → `/settings`
- [ ] Stats du jour : CA total + nb prestations
- [ ] Bouton flottant Encaisser → EncaisserSheet (quick entry)
- [ ] PinAccessModal sur tuile sensible
- [ ] NotifModal — cartes pastel par type, deep-link `/agenda?date=&appt=`, marquer tout lu

### 9.2 EncaisserSheet (4 étapes)
- [ ] Étape 1 Produits : catégories hiérarchiques parent repliés, boutons Montant libre
- [ ] Étape 2 Employé : sélection avatar
- [ ] Étape 3 Paiement : simples ou mixte (validation somme=total), code promo/parrainage check live, recherche client + crédit dispo, cartes réductions anniv/parrainage, note interne
- [ ] Étape 4 OK : confirmation finale

### 9.3 Historique
- [ ] Gate PinAccessModal au mount
- [ ] Filtre employé "Tous" ou un
- [ ] KPIs CA total + Prestations
- [ ] Grille 4 colonnes moyens paiement (Espèces, Carte, Virement, Autre), multi éclatés par sous-paiement
- [ ] Liste heure/service(×qty)/employé/moyen/montant
- [ ] Refresh via ff-tx-refresh

### 9.4 Transactions
- [ ] Filtres : recherche, type, moyen, employé, dates
- [ ] Liste groupée par date
- [ ] Badges moyen/employé/source (RDV, parrainage, IA)
- [ ] Actions Ajouter / Éditer PIN / Supprimer PIN + confirm
- [ ] Pagination 10/page
- [ ] Form : date, heure, employé, catégorie, montant, description, items multi-qty

### 9.5 Agenda
- [ ] `index.jsx` lit useParams().employeeId (sans = MultiColumnAgenda, avec = EmpAgendaMain)
- [ ] Header : logo, prev/next, Aujourd'hui
- [ ] SegmentedControl Jour/Semaine/Mois + bouton "Agenda en liste"
- [ ] Persistance localStorage ff_agenda_view_mode (whitelist day|week|month|list)
- [ ] Deep-link ?appt=<id>&date=YYYY-MM-DD → vue Jour + ApptActionModal, puis navigate replace
- [ ] Stats header : N RDV · confirmés · encaissés
- [ ] MultiColumnAgenda (colonnes par employé Jour)
- [ ] WeekView (timeline 7j × heures)
- [ ] MonthView (calendrier mois avec couleurs remplissage)
- [ ] ListView (carte RDV, borderLeft 2px, grid auto-fit minmax 240px)
- [ ] EmployeePicker
- [ ] QuickAddApptModal (employé, service, date, créneau, client avec recherche+création, notes, defaultEmpId)
- [ ] ApptActionModal (Modifier/Annuler/Encaisser/Supprimer admin)

### 9.6 Clients
- [ ] ListView : avatar initiales couleur avatar_color, Nom, Email, Téléphone
- [ ] Recherche debounce 350ms
- [ ] Tri Nom/Email/Téléphone/Création ASC/DESC
- [ ] Pagination 10/page
- [ ] Bouton +Ajouter
- [ ] CreateView : Prénom, Nom, Email, Téléphone, Notes (Prénom OU email obligatoire), gate PIN optionnel
- [ ] FicheView 4 onglets :
  - [ ] **InfoTab** : champs éditables, boutons Éditer/Supprimer/Bloquer/Inviter
  - [ ] **HistoryTab** : RDVs + transactions tri date desc, filtre service
  - [ ] **CreditTab** : solde, historique grant/repay, formulaires Grant (montant+note+employé) et Repay (montant+méthode+note) → crée transaction revenue
  - [ ] **NotesTab** : textarea auto-save + auteur + timestamp
- [ ] Blocage is_booking_blocked → ne peut plus réserver
- [ ] Si client global → email/téléphone readonly
- [ ] Gate PIN sur édition/suppression/blocage

### 9.7 Settings — Onglets

#### 9.7.1 Stats (TabStats)
- [ ] KPIs mois : CA total, nb RDV, taux remplissage, panier moyen
- [ ] Breakdown service/employé/jour
- [ ] Graphiques sparkline/chart

#### 9.7.2 Historique (TabHistorique)
- [ ] Transactions admin toutes dates
- [ ] Filtre avancé date range/employé/type/moyen
- [ ] Édition/suppression PIN
- [ ] Export CSV

#### 9.7.3 Équipe (TabEquipe) — 4 sous-onglets
- [ ] **TabEmployees (Team)** — fiche par employé accordion fermé défaut, toggle chevron
  - [ ] Avatar, Nom, Rôle, Horaires, Statut
  - [ ] Section visibilité site/caisse + permissions agenda + permissions crédit
  - [ ] +Ajouter, Edit, Delete, Gérer PIN
  - [ ] EmployeeForm : Nom, Rôle, Email, Téléphone, Couleur avatar, Photo (jpg/png/webp/gif 5Mo), Statut actif
  - [ ] Round-trip permissions préservées `{...init, ...f}`
  - [ ] Upload photo image/jpeg|png|webp|gif uniquement, erreurs inline
  - [ ] EmployeePinManager : set/change/delete PIN, toggle actif/inactif
- [ ] **TabHorairesEmployes** — grille Lun-Dim × heure, Appliquer à tous / Reset / Save, refetch loadEmp(empId, force=true) après save, gate PIN
- [ ] **TabAbsences** — date range, motif (8 types), label libre, liste passées/futures, bouton Annuler (composant Confirm pastel)
- [ ] **TabCommissions** — par employé, % ou fixe par service, tableau inline

#### 9.7.4 Catégories (TabCategories) — sous-onglets
- [ ] **CaisseCategories** : groupes+produits hiérarchie drag-reorder, repliés défaut, nouvelle cat auto-ouverte, CatFormModal/SvcFormModal (Nom/Icône/Couleur/Prix ou libre), resync useEffect([open, init?.id]), gate PIN
- [ ] **BookingServices** : services publics, Nom/Durée/Prix/Description/Catégorie, upload image 5Mo (err nom / imgErr image séparés)
- [ ] **Config** : MerchantInfoCard + TabBookingConfig + TabImages (logo, photo profil, couverture, infos, config réservation)

#### 9.7.5 Marketing (TabMarketing) — sous-onglets
- [ ] **Fidélité** :
  - [ ] TabBirthday : toggle, type remise, valeur, validity_days, template message
  - [ ] TabReferral : toggle, parrain/filleul type+valeur, limite, validité, phrase dynamique bannière, conditions libres, historique uses
  - [ ] TabLoyalty : mode tampons/points, stamps_required, points_per_euro, min_purchase, reward type+valeur, validity_days, count_trigger
- [ ] **Promotions** : TabPromo + PromoForm + SendPromoEmailModal, table (Code/Type/Valeur/Min/Usages/Exp), form complet avec plage horaire, bouton "Envoyer par email" (sélection clients + template), gate PIN
- [ ] **Solde SMS** : TabSMS, solde, bouton Recharger (Stripe PaymentIntent), historique recharges/refunds/débits, paiements enregistrés (cartes)
- [ ] **IA** : TabMarketingIA + HistoryItem, suggestions IA (segments, messages, meilleurs jours/heures), Appliquer/Ignorer, historique appliqué
- [ ] Composants KpiCard, MiniKpi, MiniRow, FideliteAccordion, SendResultModal, StepIndicator
- [ ] OptInBanner (RGPD)

#### 9.7.6 Autres onglets
- [ ] **TabClients** alias vers `/clients`
- [ ] **TabNotifs** : toggles par type, reminder_delays, sons, volume, répétitions, sound_rdv_before, Web Push
- [ ] **TabExport** : CSV/PDF filtres dates, handler erreur dédié ErrorModal pastel rouge, downloadFile joint x-pin-session auto
- [ ] **TabPrevisions** : forecast IA 7j
- [ ] **TabHeures** : heatmap jour × heure
- [ ] **TabCompte** : profil (email/business/adresse), change email OTP, change password, gestion PIN admin, Supprimer compte RGPD, Verrouiller
- [ ] **QRCard** : QR slug (inscription express /j/:slug), bookingUrl(slug) utilise publicOrigin() (strip commercant. ou VITE_BOOKING_DOMAIN)
- [ ] **MerchantInfoCard** : carte profil, lien actif avec copie presse-papier

---

## 10. FRONTEND — PAGES CLIENT PUBLIC

### 10.1 Orchestrateur booking-page/index.jsx
- [ ] Lit authInitMode depuis path (/login, /register)
- [ ] Callback onModeChange(m) sync URL
- [ ] Gate /client/* : pas de ff_client_token ou JWT expiré → purge + redirect /book/:slug/login
- [ ] Flow 6 étapes + vues satellites

### 10.2 Step1Home
- [ ] Identité : logo, nom, description, adresse Google Maps cliquable, téléphone
- [ ] Horaires compacts
- [ ] Section Prestations (accordions par catégorie ou liste plate, clic → Step2)
- [ ] Section Équipe (grid avatars, clic → Step2 pré-sélection employé)
- [ ] Section Avis Google (note + étoiles + lien)
- [ ] Iframe Maps (CSP autorise frame-src Google www+maps, www.google.com anti-301 mobile)
- [ ] ReferralBanner si parrainage actif → /book/:slug/parrain

### 10.3 Steps 2-6
- [ ] Step2 : choix symétrique (service→employé ou employé→service)
- [ ] Step3 : calendrier interactif, jour coloré selon ouvert/plein/fermé
- [ ] Step4 : liste créneaux HH:MM, heures passées masquées
- [ ] Step5 : form (Prénom/Nom/Email/Téléphone/Notes) + toggle opt-in RGPD + OAuth Google, email obligatoire nouveau
- [ ] Step6 : récap complet, saisie code promo/parrainage check live, remise affichée, Annuler/Confirmer

### 10.4 Vues satellites
- [ ] SuccessView (confirmation + lien calendrier + CTA Google/Apple Cal)
- [ ] MyApptsView (agrège Mes RDV + Profil + Parrainage + Passages)
- [ ] ParrainView (partage code, stats, conditions)
- [ ] BlockedView (client bloqué)

### 10.5 Account/AuthPanel
- [ ] login / register / Google OAuth
- [ ] onModeChange(m) sync URL
- [ ] PostRegisterPopup avec CTA
- [ ] GlobalAccountView (RDV, Parrainage, Profil, Passages)

### 10.6 My-appointments 4 onglets
- [ ] **AppointmentsTab** carte FDS-2026 (borderLeft 2px, radius 12, fw≤500), 1 pill statut pastel, prix, Annuler disparaît si non annulable, ref #ID discrète
- [ ] **VisitsTab** historique passages sur place multi-commerces, VisitDetailCard
- [ ] **ProfileTab** : Prénom/Nom/Email/Téléphone/Birth date/CP/Ville, toggle opt-in
- [ ] ChangeEmailModal (saisie → OTP)
- [ ] ChangePwdModal (current OU forgot)
- [ ] DeleteAccountModal (phrase à saisir)
- [ ] **ReferralTab** mon code, copier, partage SMS/email/réseaux, stats, historique uses

### 10.7 Modales
- [ ] CancelApptModal (raison + confirm)
- [ ] TooLateModal (annulation impossible)

### 10.8 ReferralPage
- [ ] Non-auth : tableau label/valeur (Récompense parrain, filleul, Validité, Limite)
- [ ] Connecté gcConnected : bloc prose dynamique adapté config (percent/euro + limite illimitée/mois/3mois/an + validité)
- [ ] Code perso avec bouton copier

### 10.9 Autres composants
- [ ] NavBar sticky avec theme toggle responsive
- [ ] SideCard (logo, infos, horaires, iframe Maps)
- [ ] Services (liste/accordion)

---

## 11. COMPOSANTS RÉUTILISABLES

### 11.1 Primitives
- [ ] Button (variants primary|secondary|danger, sizes sm|md|lg, fullWidth, disabled)
- [ ] Card (elevation + padding)
- [ ] Input (erreur inline)
- [ ] SegmentedControl (tab-like)
- [ ] StatusBadge (pastille succès/warning/erreur/info)
- [ ] Toggle

### 11.2 UI
- [ ] Toast (ok|error)
- [ ] useToast()
- [ ] Confirm (remplace window.confirm)

### 11.3 Forms
- [ ] TransactionForm
- [ ] EmployeeForm (imgErr inline, préservation permissions round-trip)

### 11.4 Auth
- [ ] AuthFlow (écrans login/register/forgot/vreg/vreset/newpw, initialScreen prop, sync URL useNavigate, notifyLoginJustHappened())
- [ ] MerchantOnboarding (wizard post-signup, pré-rempli si Google OAuth)

### 11.5 PIN
- [ ] PinEntry (clavier 4 digits)
- [ ] PinSetup (double saisie)
- [ ] PinAccessModal (choix employé puis saisie, 3 tentatives)
- [ ] EmployeePinModal (sheet mobile, centered desktop)

### 11.6 Notifications
- [ ] NotificationCenter (cloche dans App.jsx, cartes FDS-2026 pastel, emojis retirés → I.* Lucide, libellé employé 16-18px, date lisible, heure 20-22px monospace, chip type majuscule)
- [ ] NotifCard

---

## 12. HOOKS

- [ ] `useAuth` — user, loading, login(), logout(), updateUser(), écoute storage events multi-tab, 401 expired, OAuth broadcast, grace 15s
- [ ] `useAdmin` — unlocked, hasPin, verifyPin(), changePin(), removePin(), lock(), checkSession(), clearOnLogout(), purge via storage event
- [ ] `useTheme` — theme objet couleurs, mode, toggle(), persistance ff_theme
- [ ] `useNotifications` — notifications[], unreadCount, pushSupported, pushEnabled, loadNotifications(), markRead(), markAllRead(), deleteNotif(), enablePush(), disablePush(), playSound()
- [ ] `useEmployeePin` — gate re-saisie 5 min, requiresPin(empId), isSessionValid(empId), verifyPin(empId, pin), sessionStorage ff_emp_pin_<empId>

---

## 13. UTILS

### 13.1 api.js
- [ ] getToken(), getPinToken(), getEmployeePinToken(empId)
- [ ] request(path, options) — joint Authorization + x-employee-pin auto
- [ ] adminRequest(path, options) — joint aussi x-pin-session
- [ ] handleMerchant401() — purge + dispatch ff-auth-expired, double-check /auth/me, dédup __meCheckInFlight
- [ ] isJwtLocallyExpired(token) — décode exp skew 10s
- [ ] notifyLoginJustHappened() — grace 15s
- [ ] exportApi.downloadFile() — joint x-pin-session, parse JSON erreur (403 → "Session admin expirée")
- [ ] mediaApi._uploadImage() — helper tolérant réponses non-JSON (content-type, fallback 413/401/403)
- [ ] Sous-APIs : bookingApi, pubApi, globalClientApi, loyaltyApi, promoApi, referralsApi, creditsApi, clientsApi, absencesApi, commissionsApi, notifApi, statsApi, clientNotesApi, exportApi, campaignsApi, paymentsApi, mediaApi, authApi

### 13.2 publicUrl.js
- [ ] publicOrigin() — respecte VITE_BOOKING_DOMAIN prioritaire, sinon strippe commercant. du hostname
- [ ] bookingUrl(slug) — publicOrigin() + /book/:slug

---

## 14. RÈGLES UI TRANSVERSALES

- [ ] Persistance localStorage : ff_token, ff_pin_token, ff_theme, ff_client_token, ff_client_info, ff_booking_theme, ff_booking_ref_<slug>, ff_agenda_view_mode
- [ ] PIN employé sessionStorage ff_emp_pin_<empId>, TTL 5 min
- [ ] Photo upload whitelist jpeg|png|webp|gif 5Mo (pas image/* large)
- [ ] Catégories repliées défaut, nouvelle auto-ouverte
- [ ] Deep-links : safeInternalPath rejette javascript:, data:, //evil, caractères contrôle, backslash
- [ ] Débounces recherche 350ms, autocomplete 200ms
- [ ] Paginations 10/page clients/transactions/visits
- [ ] Sons Web Audio API oscillators, types caisse|new_appointment|reminder, volume/répétition configurable
- [ ] Couleurs pastel moyens paiement :
  - [ ] Espèces : text #065f46 bg #f0fdf4
  - [ ] Carte : text #4338ca bg #eef2ff
  - [ ] Virement : text #0e7490 bg #ecfeff
  - [ ] Autre : text #92400e bg #fffbeb
  - [ ] Multi : text #3c3489 bg #eeedfe
- [ ] Thème clair/sombre (useTheme) : {bg, text, muted, card, border, borderInput, inputBg, separator, shadowSm, shadowModal}
- [ ] Event bus : ff-tx-refresh, ff-auth-expired
- [ ] Breakpoints : mobile <640, tablet 640-1024, desktop ≥1024

---

## 15. POINTS SPÉCIAUX CRITIQUES

- [ ] Caps fidélité : MAX_STAMPS_REQ=100, MAX_REWARD_PCT=100, MAX_REWARD_FIXED=500€, MAX_POINTS_PER_EU=100, MAX_VALIDITY_DAYS=3650, MAX_MIN_PURCHASE=10000€
- [ ] Caps parrainage : percent≤100, fixed≤500€, limit_count≤10000
- [ ] Anti-fraude anniversaire : rolling 330j (pas par année calendaire)
- [ ] Limite Brevo 300/j global email_global_daily atomique ON CONFLICT
- [ ] Refund SMS auto sur échec + log
- [ ] Idempotency Stripe UNIQUE(sumup_checkout_id) WHERE NOT NULL
- [ ] Idempotency transactions UNIQUE(user_id, idempotency_key)
- [ ] Audit trail snapshot_before/after JSONB
- [ ] CSP frame-src Stripe/Google OAuth/www.google.com/maps.google.com
- [ ] Middleware erreur global /api/* renvoie JSON {error} (plus de HTML 500)
- [ ] Media provider Cloudinary auto si 3 vars (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET) sinon local, log boot
- [ ] URL publique publicOrigin() strip commercant. ou VITE_BOOKING_DOMAIN
- [ ] PIN employé : UI 5 min max, JWT 2h serveur
- [ ] PIN admin : revalidation 5 min inactivité, purge auto sortie /settings
- [ ] Notifications deep-link data.url + stripping params après ouverture
- [ ] Agenda persistance ff_agenda_view_mode survit F5
- [ ] Parrainage connecté : phrase prose dynamique
- [ ] Boucle login évitée : grace 15s + /auth/me double-check + exp local + __meCheckInFlight
- [ ] FDS-2026 : borderLeft 2px accent, radius 12, fw≤500, SVG inline I.* Lucide, pas d'emoji in-app (sauf push lock-screen OS)

---

## 16. STACK & DÉPLOIEMENT

- [ ] Backend Node.js + Express + PostgreSQL (pg) + JWT + Nodemailer/Brevo SMTP + Cloudinary + Web Push VAPID + PDFKit + Stripe + clustering
- [ ] Frontend React 18 + React Router 6 + Vite + inline styles + code splitting (vendor-react, page-booking, page-settings, page-agenda) + terser drop console.log prod
- [ ] Hébergement Vercel frontend, Render backend, Supabase PostgreSQL
- [ ] CORS multi-origine + sous-domaines (admin commercant.*, public domaine nu)
- [ ] Langue française UI/commentaires/routes

---

## 17. SMOKE TEST FINAL AVANT MERGE MAIN

Pour chaque bloc ci-dessus, Claude Code DOIT valider visuellement que la fonctionnalité existe dans la version refondue.

### Checklist smoke test
- [ ] Login admin email + OAuth Google
- [ ] Login client public + OAuth Google
- [ ] PIN admin verify + session 2h
- [ ] PIN employé verify + anti-brute-force (5 tentatives + lockout)
- [ ] Dashboard KPIs + NotifModal + EncaisserSheet quick entry
- [ ] Historique (gate PIN + filtres + grille 4 paiements)
- [ ] Transactions CRUD + PIN admin sur édit/suppr
- [ ] Agenda 4 vues (Jour/Semaine/Mois/Liste) + deep-link ?appt=&date=
- [ ] Création RDV + encaissement + fidélité + parrainage
- [ ] Annulation RDV respecte cancellation_policy_hours
- [ ] Caisse multi-items + multi-paiements
- [ ] Crédit client grant (can_grant) + repay (can_repay)
- [ ] Clients 4 onglets (Info/History/Credit/Notes) + bloquer + inviter
- [ ] Marketing : Fidélité (tampons + points) / Promos / Solde SMS / IA
- [ ] Recharge SMS Stripe (3 modes)
- [ ] Campagne SMS (débit + refund auto échec)
- [ ] Campagne email (quota Brevo 300/j)
- [ ] Campagne IA auto-plan + auto-send
- [ ] Anniversaires cron 9h (anti-fraude 330j)
- [ ] Parrainage flow complet (pending → validé → 2 promos + 2 rewards)
- [ ] Export CSV + PDF (gate PIN admin)
- [ ] Notifications in-app + sons + Web Push + deep-link
- [ ] Booking public 6 étapes
- [ ] QR express /j/:slug
- [ ] Mes RDV client (annuler)
- [ ] Mes passages
- [ ] Parrainage page connecté/non-connecté
- [ ] Profil client (change email/password/delete)
- [ ] RGPD export + suppression cascade + anonymisation
- [ ] Mode dark partout
- [ ] Multi-tenant (2 users test)

**Si 1 seule case non cochée, le merge sur main est bloqué.**
