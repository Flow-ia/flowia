# FlowIA — Documentation exhaustive de l'application

Ce document liste, de manière exhaustive et en texte, toutes les fonctionnalités, règles métier, paramètres, sous-paramètres, pages, sections, rôles, logiques et domaines de l'application FlowIA.

Chaque partie couvre à la fois le côté **commerçant** (admin / employé) et le côté **client public** (réservation, compte client, parrainage), avec les règles qui les relient.

---

## 1. Vue d'ensemble de l'application

FlowIA est une plateforme SaaS de gestion complète pour salons et prestataires de services (coiffure, barbier, esthétique, etc.). Elle couvre :

- La **prise de rendez-vous en ligne** via un mini-site public par commerçant (`/book/:slug`).
- La **gestion d'agenda** multi-employés (vues Jour, Semaine, Mois, Liste).
- La **caisse / transactions** (revenus, dépenses, multi-paiements, multi-items).
- La **gestion de l'équipe** (employés, horaires, absences, commissions, PINs, permissions granulaires).
- La **relation client (CRM)** : fiche client, notes, crédit, historique.
- Le **marketing** : fidélité (tampons/points), codes promos, parrainage, anniversaires, campagnes SMS / email, marketing IA.
- Les **notifications** in-app, web push, email, son, avec deep-link vers l'agenda.
- Un **compte client global** multi-commerces (plateforme unifiée).
- Des **outils admin** : stats, prévisions, heatmap heures, export CSV/PDF.
- Une **conformité RGPD** : consentement, opt-in marketing, suppression, anonymisation.

### Stack technique
- Backend : Node.js + Express.js, PostgreSQL (via `pg`), JWT, Nodemailer/Brevo SMTP, Cloudinary (média), Web Push (VAPID), PDFKit, Stripe (SMS), clustering.
- Frontend : React 18 + React Router 6, Vite, styles inline. Code splitting : vendor-react, page-booking, page-settings, page-agenda.
- Hébergement : Vercel (frontend), Render (backend), Supabase (PostgreSQL). Minification terser (drop console.log en prod).

### Langue : française (UI, commentaires, libellés routes en français).

---

## 2. Rôles / Acteurs du système

### 2.1. Commerçant (Merchant / Admin)
- Compte principal, propriétaire du commerce.
- Token JWT `ff_token` (localStorage), expiration 7 jours.
- Peut tout faire : configurer, encaisser, gérer équipe, marketing.
- Session PIN admin (`ff_pin_token`, JWT 2 h) requise pour actions financières sensibles.

### 2.2. Employé (sous l'autorité d'un commerçant)
- Pas de compte email/password. Accès par **PIN 4 chiffres** (stocké bcrypt).
- Token JWT `scope='employee_pin_session'`, durée 2 h, header `x-employee-pin`.
- Le commerçant choisit finement ce qu'il peut faire via **permissions booléennes** :
  - `can_cancel` — annuler un RDV.
  - `can_modify` — modifier un RDV.
  - `can_encash` — encaisser en caisse.
  - `can_use_promo` — appliquer des codes promo.
  - `can_grant_credit` — accorder un crédit client.
  - `can_repay_credit` — rembourser / utiliser un crédit client.
  - `show_on_booking` — visible sur la page publique de réservation.
  - `show_in_caisse` — visible en caisse / encaissement.
  - `is_active` — employé actif ou non.
- Anti-brute-force PIN : 5 tentatives / 5 min côté IP + lockout DB 30 min après 5 échecs (`failed_attempts`, `locked_until`).

### 2.3. Client interne (Client d'un commerce)
- Compte propre à un salon (scoped `user_id`).
- Token JWT `scope='client'` (`ff_client_token`).
- Peut s'inscrire via le flow réservation, ou via QR code (inscription express).
- Peut voir ses RDV, son historique, se désinscrire, etc.

### 2.4. Client global (Multi-commerces)
- Un compte unique réutilisable chez plusieurs commerçants de la plateforme.
- Token JWT `scope='global_client'`.
- Support OAuth Google.
- Agrège RDV, passages, fidélité, parrainage multi-commerces.

### 2.5. Système (Cron / Jobs)
- Cluster : cron uniquement sur worker 1 pour éviter doublons.
- Tâches : rappels RDV, rappels shift employés, récap quotidien, campagnes SMS, campagnes email, anniversaires, nettoyage paiements, etc.

---

## 3. Architecture et sécurité transverse

### 3.1. Multi-tenancy
- Toutes les données métier sont scoped par `user_id` (FK vers `users`).
- `UNIQUE(user_id, email)` sur `client_accounts` : chaque commerçant a sa propre base clients.
- Les routes publiques `/api/pub/:slug/*` résolvent le commerçant via `slug` (URL publique unique).

### 3.2. Authentification (5 types de token)
- **Merchant JWT** : scope vide, claims `{userId, email, businessName}`, 7 jours.
- **Client interne JWT** : scope=`client`, lié à `client_accounts`.
- **Client global JWT** : scope=`global_client`, lié à `global_clients`.
- **PIN session admin** : scope=`pin_session`, 2 h, header `x-pin-session`.
- **PIN session employé** : scope=`employee_pin_session`, 2 h, header `x-employee-pin`.

Côté frontend :
- `isJwtLocallyExpired(token)` décode localement `exp` (skew 10 s) pour éviter un aller-retour 401 inutile.
- `notifyLoginJustHappened()` pose une grâce de 15 s post-login ignorant les 401 transitoires (cold start Render).
- `handleMerchant401()` double-check via `/auth/me` avant purge (évite la déconnexion sur un 401 transitoire).
- Dispatch event `ff-auth-expired` → `useAuth` retombe sur `/login`.

### 3.3. PIN admin (Second facteur sur actions sensibles)
- PIN 4 chiffres hashé bcrypt (`user_pins`).
- `POST /api/auth/pin/verify` → retourne un JWT scope `pin_session` (2 h).
- Vérifié par `pinAdminMiddleware` sur toutes les routes critiques (modifications fidélité, promo, commissions, employés, export CSV/PDF, etc.).
- Côté UI : re-saisie systématique (session 5 min max, purge à la sortie de `/settings`).

### 3.4. Rate limiters (Express)
- `authLimiter` : 20 req / 2 min (routes auth hors login/register).
- `registerLimiter` : 5 req / 10 min (inscriptions).
- `loginLimiter` : 10 req / 5 min (anti-brute-force password).
- `notifLimiter` : 60 req / min (notifications).
- `statsLimiter` : 60 req / min (stats : cache fort).
- `apiLimiter` : 300 req / min (API générale).
- `pubLimiter` : 600 req / min (réservation publique, trafic élevé).
- `quickRegisterLimiter` : 30 req / 15 min (inscription QR code).
- `paymentsIntentLimiter` : 15 req / 15 min (création Stripe PaymentIntent).
- `employeePinVerifyLimiter` : 5 req / 5 min (vérif PIN employé) + lockout DB 30 min après 5 échecs.

### 3.5. Conformité RGPD
- `marketing_opt_in` (bool) + `marketing_opt_in_at` (timestamp) + `consent_at`, `consent_ip`.
- `unsubscribe_token` (UUID) pour désinscription 1-clic depuis email.
- Suppression compte client global : `deletion_requested_at`, soft 30 jours, hard delete après.
- Anonymisation `client_email`/`client_name` à NULL sur `client_credits` et `client_notes` (colonnes `DROP NOT NULL`).
- Export données client : `GET /api/global-clients/me/export` retourne un JSON complet.

### 3.6. Clustering & Cron
- Mode cluster (workers). Toutes les cron (intervalles) ne s'exécutent que sur worker 1 (`isWorker1`).
- Guard temporel par cron (heures d'activité 7-20, 8-20, 9-20 selon type).

### 3.7. Idempotency, audit, caches
- `transactions.idempotency_key` + `UNIQUE(user_id, idempotency_key)` contre le double-clic.
- `sms_transactions.sumup_checkout_id` : `UNIQUE` partiel pour bloquer le double-crédit Stripe.
- `transaction_audit_log` : snapshot_before / snapshot_after JSONB (qui, quand, pourquoi).
- Caches mémoire 5-10 min (stats, transactions) invalidés à chaque écriture.

---

## 4. Schéma base de données (domaines et tables)

Toutes les tables métier portent une FK `user_id` (sauf `global_clients`, `verification_codes`, `email_global_daily`).

### 4.1. Domaine Compte / Auth

- **users** : commerçant (id, email UNIQUE, password_hash, business_name, phone, address, country, city, postal_code, lat, lng, google_id, stripe_customer_id, google_business_url, first_name, last_name, avatar_url, sms_balance DECIMAL ≥ 0, onboarding_completed, created_at).
- **verification_codes** : file OTP pour inscription / reset / changement email, valides 15 min (key, code, data JSONB, expires_at).
- **user_pins** : PIN admin du commerçant (user_id, pin_hash, updated_at).

### 4.2. Domaine Équipe

- **employees** : id, user_id, name, role, phone, email, avatar_color, is_active, permissions (can_cancel, can_modify, can_encash, can_use_promo, can_grant_credit, can_repay_credit), show_on_booking, show_in_caisse, commission_pct, created_at.
- **employee_pins** : employee_id PK, user_id, pin_hash, is_active, failed_attempts, locked_until.
- **employee_hours** : horaires par jour (day_of_week 0-6, open_time, close_time, is_open, use_business_hours).
- **employee_time_slots** : plages multiples par jour (slot_start, slot_end).
- **employee_availability** : disponibilité ponctuelle par date.
- **employee_absences** : congés, maladie, formation, accident_travail, maternité, paternité, sans_solde, autre (start_date, end_date, type, label, reason, cancelled_at).

### 4.3. Domaine Catalogue / Services

- **categories** : catégories caisse (type `revenue` | `expense`, icône, couleur, parent_id, price, is_free_price).
- **booking_service_categories** : catégories affichées sur la page publique de réservation.
- **booking_services** : prestations réservables (duration_minutes, price, couleur, booking_category_id, is_active, sort_order).
- **commissions** : commission par employé / service / catégorie (commission_pct).

### 4.4. Domaine Business Hours

- **booking_settings** : config globale réservation (slug UNIQUE, is_enabled, advance_booking_days, min_notice_hours, cancellation_policy_hours, require_account, timezone).
- **business_hours** : ouverture par jour (open_time, close_time, is_open).
- **business_breaks** : pauses par jour (break_start, break_end).

### 4.5. Domaine Clients

- **client_accounts** : clients internes (scoped user_id), birth_date, marketing_opt_in, unsubscribe_token, is_booking_blocked, last_birthday_reward_at (anti-fraude 330 j), consent_at, source.
- **global_clients** : compte multi-commerces (email UNIQUE, google_id, birth_date, marketing_opt_in, deletion_requested_at).
- **client_notes** : notes commerçant sur client (note_text, created_by_name).

### 4.6. Domaine Rendez-vous

- **appointments** : RDV (service_id, employee_id, client_id, date, start_time, end_time, duration_minutes, total_amount, status `pending|confirmed|cancelled|completed|no_show`, paid, paid_method, transaction_id, promo_code_id, discount_amount, reminder_24h_sent, reminder_2h_sent).
- **appointment_items** : panier de prestations d'un RDV.

### 4.7. Domaine Caisse / Transactions

- **transactions** : type `income|expense|revenue|refund|adjustment`, payment_method `cash|card|transfer|check|multi|other`, source `manual|rdv|credit|ai_campaign`, locked (anti-modif), idempotency_key UNIQUE, promo_code_id, discount_amount.
- **transaction_items** : détail panier.
- **transaction_payments** : traces multi-paiement (ex : 50 € espèces + 30 € carte).
- **transaction_audit_log** : audit complet (create/update/delete, snapshot_before/after, reason).

### 4.8. Domaine Fidélité

- **loyalty_programs** : enabled, loyalty_mode `stamps|points`, stamps_required, points_per_euro, min_purchase, reward_type `percent|fixed`, reward_value, validity_days, count_trigger `both|physical|online`.
- **client_loyalty** : état par client (stamps, total_stamps_ever, points, total_points_ever, rewards_earned, last_visit).

### 4.9. Domaine Promotions / Récompenses

- **promo_codes** : code, type `percent|fixed`, value, max_uses, uses_count, valid_from, valid_until, is_active, target_clients `all|new|specific`, owner_client_email, is_loyalty_reward, min_purchase, time_allday, time_from, time_until.
- **promo_usage_logs** : audit utilisation (code_snapshot, client_email, transaction_id, appointment_id, discount_applied).
- **client_rewards** : réductions unifiées (anniversaire, parrainage, fidélité) avec statut `available|used|expired` + expires_at.

### 4.10. Domaine Crédit client

- **client_credits** : solde client (balance, total_granted, total_repaid). UNIQUE(user_id, client_email). `client_email` et `client_name` peuvent être NULL (RGPD anonymisation).
- **credit_transactions** : type `grant|repay`, amount, note, payment_method, lien transaction_id si repay.

### 4.11. Domaine Parrainage

- **referral_programs** : is_enabled, parrain_type/value, filleul_type/value, limit_count, limit_period `unlimited|lifetime|month|3months|year`.
- **referral_codes** : code unique par client parrain (UNIQUE(user_id, owner_client_email)).
- **referral_uses** : filleul_email, parrain_promo_id, filleul_promo_id, appointment_id, transaction_id, status `pending|validated|cancelled`, validated_at.

### 4.12. Domaine Anniversaires

- **birthday_campaigns** : is_enabled, discount_type, discount_value, validity_days, message.

### 4.13. Domaine Marketing / SMS

- **campaigns** : métadonnées campagne (target_type, channel, sent_sms, sent_email, failed_count, sms_cost, status).
- **campaign_queue** : file d'envoi (channel `email|sms`, status `pending|sent|failed`, scheduled_at, sent_at, error, ai_code_id).
- **ai_campaigns** : campagne IA (budget, duration_days, status `scheduled|running|completed`, phases JSONB, total_sms, total_cost).
- **ai_campaign_codes** : code IA personnalisé par client (segment, discount_percent, scheduled_at, sent_at, used_at).
- **sms_transactions** : historique recharge / refund / débit SMS (Stripe). `UNIQUE(sumup_checkout_id) WHERE NOT NULL` pour idempotency.
- **message_log** : log SMS/email envoyés avec coûts.
- **email_global_daily** : compteur global cluster-safe (quota Brevo 300/j).

### 4.14. Domaine Notifications

- **notification_settings** : daily_recap_enabled/time/email, reminder_enabled/delays ("1440" = 24 h, "120" = 2 h), employee_reminder_enabled/delays, sound_caisse/new_appt/reminder, sound_repeat, sound_rdv_before (15 min), push_enabled, inapp_enabled.
- **notification_log** : dédoublonnage (une seule notif par type × appointment_id).
- **app_notifications** : centre de notifs in-app (is_read).
- **push_subscriptions** : abonnements Web Push (endpoint, p256dh, auth_key).

### 4.15. Domaine Médias

- **media** : type `profile|cover|service|logo|employee`, ref_id, path, provider `local|cloudinary`.

---

## 5. Backend — Routes API exhaustives

Préfixe commun : `/api`. Middleware racine selon le groupe. Les routes sensibles (`pinAdminMiddleware`) nécessitent le header `x-pin-session`.

### 5.1. Auth commerçant `/api/auth`

- `POST /register` → OTP 6 chiffres (15 min) envoyé par email. `registerLimiter`. Validation : email RFC5322, password ≥ 6 chars, email unique.
- `POST /register/confirm` → crée `users` + catégories par défaut + `booking_settings` avec slug unique. Retourne JWT 7 j + user.
- `POST /resend-code` → renvoie OTP si session encore valide.
- `POST /login` → `loginLimiter` (10/5 min). Timing attack constant (bcrypt sur DUMMY_BCRYPT si email inconnu).
- `POST /forgot` → envoie OTP si compte existe (réponse toujours 200 pour anti-énumération).
- `POST /forgot/verify` + `POST /forgot/reset` → reset password.
- `POST /change-email` + `/change-email/confirm` → OTP vers nouvelle adresse.
- `POST /change-password` → oldPassword, newPassword.
- `GET /me` → profil commerçant complet.
- `PUT /profile` → update businessName, phone, address, city, postalCode, lat, lng, googleBusinessUrl.
- `POST /onboarding` → marque `onboarding_completed = TRUE`.
- `DELETE /account` → suppression RGPD cascade.
- `GET /google/merchant/callback` → OAuth Google commerçant.
- `GET /google/callback` → OAuth Google client global.

### 5.2. PIN admin `/api/auth/pin/*`

- `GET /pin/status` → `{ has_pin }`.
- `POST /pin/verify` → `{ valid, pin_session_token (JWT 2 h) }`.
- `POST /pin/check-session` → vérifie un token PIN existant.
- `POST /pin/set` → créer/changer PIN.
- `DELETE /pin` → supprimer PIN.
- `POST /pin-change-request` + `/pin-change-confirm` → changement avec OTP.
- `POST /pin-forgot-request` + `/pin-forgot-verify` → PIN oublié, reset par OTP email.

### 5.3. Réservation commerçant `/api/booking`

Middleware : `authMiddleware` + `employeePinOptional`.

- `GET /check-slug` (public pré-auth) → vérifie disponibilité d'un slug.
- `GET /settings`, `PUT /settings` (PIN admin) → config réservation.
- `GET /services`, `POST/PUT/DELETE /services/:id` (PIN admin) → CRUD prestations réservables.
- `GET /appointments` (from, to, employee_id, client_id, status) → liste des RDV.
- `POST /appointments` → création RDV (calcule total_amount + total_duration).
- `PUT /appointments/:id` → modification dans la limite `cancellation_policy_hours`.
- `PATCH /appointments/:id/cancel` → annulation (cancel_reason). Règle métier : annulation possible jusqu'à X heures avant.
- `DELETE /appointments/:id` (PIN admin) → hard delete.
- `POST /appointments/:id/checkout` → encaissement : crée la transaction, met `paid=TRUE`, incrémente fidélité, valide parrainage éventuel.
- `GET /clients` (search, limit, offset) → clients du commerce.
- `GET /availability/:employee_id` → créneaux libres (prend en compte business_hours, employee_hours/slots, pauses, absences, RDV existants).
- `POST /availability` → ajoute une dispo ponctuelle.
- `GET/POST/DELETE /employee-hours[/:id]` → horaires par employé.
- `GET/POST/DELETE /employee-slots[/:id]` → plages horaires multiples par employé.
- `GET/POST/DELETE /breaks[/:id]` → pauses commerce.
- `GET/PUT /employee-permissions/:id` (PIN admin) → permissions granulaires.
- `GET /employee-agenda`, `POST/PUT /employee-agenda/appointments[/:id]` → agenda employé (drag & drop).

### 5.4. Réservation publique `/api/pub/:slug`

Middleware : `pubLimiter` + resolveur de slug. Pas d'auth par défaut, auth client sur les routes `/client/*`.

- `GET /:slug` → infos commerce (services, employés, settings).
- `GET /:slug/services`, `GET /:slug/employees` (filtre `show_on_booking=TRUE`).
- `GET /:slug/slots` (date, duration, service_id, employee_id) → créneaux libres en temps réel.
- `GET /:slug/closed-days`, `GET /:slug/month-status` (year, month) → données calendrier.
- `POST /:slug/book` → crée RDV + client si nouveau. Respecte `require_account`.
- `GET /:slug/promo/check`, `POST /:slug/check-promo` → validation code promo.
- `GET /:slug/referral/:code` → infos programme parrainage.
- `GET /:slug/google-rating` → note Google Business (cachée).
- `POST /:slug/client/register` → inscription client (scope='client'), consent_at enregistré.
- `POST /:slug/client/quick-register` → inscription express (email, first_name, phone). `quickRegisterLimiter` (30/15 min).
- `POST /:slug/client/login`, `GET /:slug/client/check-email`.
- `GET /:slug/client/appointments` → mes RDV.
- `PUT /:slug/client/appointments/:id/cancel` → annulation respectant `cancellation_policy_hours`.
- `PUT /:slug/client/profile` → update profil (dont `marketing_opt_in`, `birth_date`).
- `DELETE /:slug/client/account` → RGPD, anonymise.

### 5.5. Transactions / Caisse `/api/transactions`

- `GET /` (from, to, limit, offset) → liste (cache 10 min).
- `GET /stats` (cache 5 min), `GET /today`.
- `POST /` → création (employeePinOptional : `req.employee` si PIN présent). Validation whitelist stricte (type, method, amount). Multi-items + multi-paiements + fidélité + audit + cache-invalidation. Idempotency via `idempotency_key`.
- `PUT /:id` (PIN admin) → modification.
- `DELETE /:id` (PIN admin) → soft delete + audit.

### 5.6. Employés `/api/employees` & PINs `/api/employee-pins`

- `GET /` → liste.
- `POST /`, `PUT /:id`, `DELETE /:id` (PIN admin).
- `GET /:id/future-appointments` → RDV futurs d'un employé (avant suppression par ex.).
- PINs : `GET /`, `GET /:employeeId/status`, `POST /:employeeId/set` (PIN admin), `DELETE /:employeeId` (PIN admin), `PATCH /:employeeId/toggle` (PIN admin), `POST /:employeeId/verify` (`employeePinVerifyLimiter` + lockout DB 30 min).

### 5.7. Catégories

- `/api/categories` (caisse) : CRUD complet, `PATCH /reorder`. Écritures protégées par PIN admin.
- `/api/booking/service-categories` (réservation) : idem.

### 5.8. Commissions `/api/commissions`
- CRUD par employé / service / catégorie. Écritures PIN admin.

### 5.9. Fidélité `/api/loyalty`
- `GET /program`, `PUT /program` (PIN admin).
- `GET /clients`, `POST /stamp` (ajout tampons, cap 20/op), `DELETE /clients/:id` (PIN admin).
- `GET /promo-history`.
- Caps métier : `MAX_STAMPS_REQ=100`, `MAX_REWARD_PCT=100`, `MAX_REWARD_FIXED=500`, `MAX_POINTS_PER_EU=100`, `MAX_VALIDITY_DAYS=3650`, `MAX_MIN_PURCHASE=10000`.

### 5.10. Promotions `/api/promo`
- `GET /`, `POST /check`, `POST /`, `PUT /:id`, `DELETE /:id`. Écritures PIN admin.
- Règles check : dates, uses, target_clients (`all|new|specific`), min_purchase, plage horaire.
- Codes auto-générés (`is_loyalty_reward=TRUE`) non modifiables.

### 5.11. Crédits client `/api/credits`
- `GET /` (search, only_active), `GET /client/:clientId`.
- `POST /grant` → upsert, update balance, insert `credit_transactions`.
- `POST /repay` → crée transaction revenue (source='credit'), decrémente balance. Événement `ff-tx-refresh` côté frontend pour rafraîchir.

### 5.12. Parrainage `/api/referrals`
- `GET /program`, `PUT /program` (PIN admin) — caps : percent ≤ 100, fixed ≤ 500 €, limit_count ≤ 10 000.
- `GET /codes`, `GET /rewards?email=` (agrégation anniversaire + parrainage + fidélité).
- `GET /pub/:slug/referral-program` (public).

### 5.13. Global clients `/api/global-clients`
- Auth : `register`, `login`, `activate` (invite), `forgot-password`, `reset-password`.
- Profil : `GET /me`, `PATCH /me`, `POST /me/change-email`/`confirm`, `POST /me/change-password`.
- Données : `GET /appointments`, `GET /me/visits`, `GET /me/visits/:id`, `GET /loyalty`.
- Parrainage : `GET /me/referral-code/:slug`, `GET /me/referral-history/:slug`.
- RGPD : `DELETE /me` (soft, `deletion_requested_at`), `GET /me/export` (JSON).

### 5.14. Notifications `/api/notifications`
- `GET /settings`, `PUT /settings` (PIN admin).
- `POST /test-recap` → envoi récap test (hors quotas).
- `GET /vapid-public-key` (public).
- `POST /push-subscribe`, `DELETE /push-subscribe`.
- `GET /inapp`, `PATCH /inapp/read` (id, ids[], _all), `DELETE /inapp/:id`.

### 5.15. Absences `/api/absences`
- `GET /` (from, to, employee_id, include_cancelled), `GET /stats`.
- `POST /`, `PUT /:id`, `PATCH /:id/cancel` (avec `cancel_reason`).
- Types : `conges|maladie|formation|autre|accident_travail|maternite|paternite|sans_solde`.

### 5.16. Anniversaires `/api/birthday-campaign`
- `GET /program`, `PUT /program` (PIN admin).

### 5.17. Export `/api/export` (PIN admin)
- `GET /csv` (from, to, format, type `transactions|clients|appointments|all`).
- `GET /pdf`.

### 5.18. Marketing / Campagnes `/api/campaigns`
- `GET /`, `POST /`, `GET /:id/preview`, `POST /:id/send` (PIN admin).
- `GET /auto-plan`, `POST /auto-send` (PIN admin, IA), `GET /auto-recalculate`, `GET /ai-history`.

### 5.19. Paiements / SMS `/api/payments`
- `GET /sms/balance`, `GET /sms/transactions`.
- `POST /sms/intent` (`paymentsIntentLimiter`) : Stripe PaymentIntent. 3 modes : nouvelle carte + save, carte enregistrée (off_session), automatic_payment_methods.
- `GET /sms/verify/:sessionId`, `POST /sms/verify-intent`.
- `POST /sms/webhook` (Stripe) → `creditSmsOnce` atomique, idempotency UNIQUE.
- `GET /sms/payment-methods`, `POST /sms/set-default`, `DELETE /sms/payment-methods/:id`.

### 5.20. Médias `/api/media`
- Lecture publique (`/commercant/:userId/*`, `/employee/:id/image`, `/service/:id/image`).
- Upload : multipart form-data. Accept whitelist `jpeg|png|webp|gif`. 5 Mo max.
- Middleware d'erreur global renvoie toujours du JSON `{ error }` pour `/api/*` (évite le `<!DOCTYPE>` HTML sur 500).
- Provider résolu : Cloudinary si credentials présents, sinon local (fallback).

### 5.21. Notes client `/api/client-notes`
- `GET /?client_email=`, `POST /`, `PUT /:id`, `DELETE /:id` (PIN admin).

### 5.22. Stats `/api/stats` (`statsLimiter`)
- `GET /today`, `GET /forecast` (IA 7 jours), `GET /heatmap` (jour×heure), `GET /plan`, `POST /plan/launch`.

---

## 6. Middlewares

- **authMiddleware** : lit `Authorization: Bearer`, vérifie JWT + expiration, rejette les scopes non-marchand (401/403).
- **employeePinOptional** : lit `x-employee-pin`, tolérant à l'absence, injecte `req.employee` avec flags `can_*`, `req.isEmployee`, `req.isMerchant`.
- **pinAdminMiddleware** : lit `x-pin-session`, rejette 403 `ACTION_ADMIN_ONLY`, injecte `req.pinAdmin=true`.
- **requireMerchant** : vérifie l'existence du commerçant en base (`users`).

---

## 7. Cron / Tâches planifiées (worker 1 uniquement)

1. **Rappels RDV** (chaque minute) — cible les RDV J+1 (24 h avant) et J (2 h avant) via `reminder_24h_sent`/`reminder_2h_sent`. Heures actives 7-20.
2. **Rappels shift employés** (chaque minute) — emails aux employés avant leur shift. Heures actives 7-20.
3. **Daily recaps** (chaque 5 min) — envoie un récap mail si `daily_recap_enabled` et heure courante = `daily_recap_time`.
4. **Queue emails campagnes** (chaque heure) — 30 lignes/pass, throttle 500 ms. Respecte quota global Brevo 300/j.
5. **Queue SMS** (chaque 30 min) — 50 lignes/pass, 9-20 h, throttle 200 ms. **Refund automatique** (credit `sms_balance`) sur échec.
6. **Rappels RDV (24 h + 2 h)** (chaque heure, 7-20).
7. **Transaction cleanup** (chaque 2 h) — passe `sms_transactions` abandonnés (pending > 2 h) en `expired`.
8. **Birthday promos** (chaque heure, guard 09:00 unique) — crée promo_code + client_reward + envoie email pour chaque anniversaire du jour. Anti-fraude : `last_birthday_reward_at < NOW() - 330 days`. Tolère 29/02 (fallback 28/02 les années non bissextiles). Retry 3× sur collision de code.

---

## 8. Règles métier transversales

### 8.1. Réservation
- **Anticipation** max : `advance_booking_days` (défaut 30).
- **Préavis** min : `min_notice_hours` (défaut 1).
- **Politique d'annulation** : `cancellation_policy_hours` (défaut 2). Au-delà → refus côté back + modale `TooLateModal` côté UI.
- Un slug unique par commerce = URL publique.
- Si `require_account=TRUE` → la réservation exige un compte client.

### 8.2. Disponibilité employé (calcul de créneau)
- `business_hours` (ouverture commerce par jour).
- `business_breaks` (pause commerce).
- `employee_hours` (surcharge par employé, flag `use_business_hours`).
- `employee_time_slots` (plages multiples par jour).
- `employee_availability` (dispos ponctuelles date spécifique).
- `employee_absences` (exclusion total sur la période).
- RDV existants (exclus).

### 8.3. Caisse / Transactions
- Validation whitelist stricte : `type ∈ {income, expense, revenue, refund, adjustment}`, `payment_method ∈ {cash, card, transfer, check, multi, other}`, `amount ≥ 0`.
- Idempotency : double-clic = même UUID.
- Multi-paiement : `transactions.payment_method='multi'` + lignes dans `transaction_payments`.
- Multi-items : lignes dans `transaction_items`.
- Déclenche fidélité si `type='revenue'` et `loyalty_programs.enabled=TRUE`.
- Audit complet `transaction_audit_log`.
- Modification / suppression : PIN admin obligatoire.

### 8.4. Fidélité
- Modes : **tampons** (entier) ou **points** (décimal, `points_per_euro`).
- `min_purchase` : seuil min pour compter.
- `count_trigger` : `both` (tout), `physical` (caisse uniquement), `online` (RDV uniquement).
- Récompense : créée auto dès `stamps ≥ stamps_required` (promo_code + client_reward `available`).
- Valide `validity_days` jours après génération.
- Caps métier : 100 tampons max, 100 % max, 500 € max fixed, 10 000 € min_purchase max, 3650 j validité max.

### 8.5. Parrainage
- Limites anti-abus : `limit_count` × `limit_period` (`unlimited|lifetime|month|3months|year`).
- Normalisation email : Gmail alias `+` ignoré, espaces trim, lowercase (empêche de se parrainer soi-même via alias).
- Flow :
  1. Parrain obtient son code (`REF-XXXX`).
  2. Filleul saisit le code au 1er RDV → `referral_uses.status='pending'`.
  3. En caisse, le commerçant voit la carte "Parrainage en attente" + boutons Valider/Refuser (`GET /referrals/rewards?email=...`).
  4. Sur validation → création atomique de deux `promo_codes` (parrain + filleul) + `client_rewards` `available` + `referral_uses.status='validated'`.

### 8.6. Anniversaires
- Cron 09:00 : envoie un code `BDAY-XX1234` + email HTML aux clients ayant `birth_date` = aujourd'hui et `marketing_opt_in=TRUE`.
- Anti-fraude : rolling window 330 jours sur `last_birthday_reward_at`.
- Limite Brevo 300 emails / jour global → stop si atteint.

### 8.7. Promotions
- Types : `percent` ou `fixed`. Caps : 100 %, 10 000 €.
- Restriction : dates, usage, clients (`all|new|specific`), plage horaire (`time_allday|time_from-time_until`), min_purchase.
- Non cumulables par défaut (1 code par transaction).
- Codes auto-générés (anniversaire, fidélité, parrainage) : non modifiables via l'UI.

### 8.8. Crédit client
- `balance > 0` = crédit à consommer.
- `POST /grant` : créée par employé (permission `can_grant_credit`).
- `POST /repay` : crée une transaction `revenue` source='credit' et diminue la balance.
- Rafraîchissement immédiat du dashboard via event `ff-tx-refresh`.

### 8.9. SMS / Marketing
- Prix SMS = `SMS_COST × (1 + SMS_MARGIN/100)` (~0,0585 €).
- Recharge Stripe : idempotent via `UNIQUE(sumup_checkout_id)`.
- Dépense campagne : débit upfront (estimé), refund automatique sur échec.
- Quota email Brevo 300/jour global (`email_global_daily`).

### 8.10. Notifications
- Types : `new_appointment`, `reminder`, `caisse`, `daily_recap`.
- Dédoublonnage via `notification_log` (un même RDV ne déclenche pas 2 fois la même notif).
- Delays `reminder_delays` : string CSV de minutes (ex : `"1440,120"` = 24 h + 2 h).
- Sons : synthèse Web Audio API (oscillators), répétés N fois, déclenchés X min avant RDV.
- Web Push : VAPID key publique via `GET /vapid-public-key`, abonnement via Service Worker.
- Deep-link : backend injecte `data.url = /agenda?date=YYYY-MM-DD&appt=<id>` ; frontend ouvre la vue Jour + modal RDV directement.

### 8.11. RGPD
- Consent : `consent_at`, `consent_ip` enregistrés à l'inscription.
- Opt-in marketing : toggle bool, horodaté (`marketing_opt_in_at`).
- Désinscription 1 clic via `unsubscribe_token` dans chaque email.
- Suppression client global : soft 30 j (`deletion_requested_at`), hard après.
- Anonymisation : `client_email` et `client_name` passent à NULL dans `client_credits`, `client_notes`, historique transactions.
- Export complet : `GET /me/export` (JSON).

---

## 9. Frontend — Routes globales

### 9.1. Routes commerçant (privées)
- `/` → redirect `/dashboard`.
- `/dashboard` → Dashboard (tuiles, notif center, quick entry).
- `/historique` → Historique + Stats du jour (gate PIN).
- `/transactions` → gestion transactions (CRUD, filtres).
- `/agenda`, `/agenda/views`, `/agenda/views/:employeeId` → agenda multi/solo.
- `/clients` → CRM clients.
- `/settings`, `/settings/*` → paramètres (onglets multiples).
- Routes auth : `/login`, `/register`, `/forgot-password`.

### 9.2. Routes client public (`/book/:slug/*`)
- `/book/:slug` → Step1Home (accueil).
- `/book/:slug/login`, `/book/:slug/register`, `/book/:slug/auth` → auth client.
- `/book/:slug/service/:serviceId/employe` → Step2 (choix employé pour le service).
- `/book/:slug/employe/:employeeId` → Step2 (choix service pour l'employé).
- `/book/:slug/service/:serviceId/employe/:employeeId/date` → Step3.
- `.../date/:dateStr/creneau` → Step4.
- `.../creneau/:slot/infos` → Step5.
- `.../infos/confirmation` → Step6.
- `/book/:slug/client/rdv` → Mes RDV (gate auth).
- `/book/:slug/client/passages` → Mes passages.
- `/book/:slug/client/passages/:visitId` → Détail passage.
- `/book/:slug/client/profil` → Profil client.
- `/book/:slug/parrain` → Parrainage (bannière, phrase dynamique).
- `/book/:slug/politique` → Politique annulation.
- `/j/:slug` → redirect `/book/:slug/auth?quick=1` (QR code inscription express).

### 9.3. Autres
- `/oauth/callback` → OAuth.

---

## 10. Frontend — Pages commerçant

### 10.1. Dashboard (`pages/Dashboard.jsx`)

Titre "Tableau de bord". Contenu :

- **Tuiles KPI** (layout 2×2 + 1) :
  - `TileHistorique` → ouvre `/historique` (gate PIN).
  - `TileNotifs` → ouvre `NotifModal` avec compteur non-lues.
  - `TileAgenda` → `/agenda`.
  - `TileClients` → `/clients`.
  - `TileParamètres` → `/settings`.
- **Stats du jour** : CA total + nb prestations (les cartes Dépenses/Transactions ont été retirées).
- **Bouton flottant Encaisser** (icône Zap) → ouvre `EncaisserSheet` (quick entry).
- **PinAccessModal** : s'affiche sur tuile sensible si PIN admin actif.
- **NotifModal** : liste notifications pastel par type (bleu/ambre/vert), deep-link vers `/agenda?date=&appt=` au clic, bouton Marquer tout lu.

Encaisser Sheet (4 étapes) :
1. Produits : choix de catégories hiérarchiques (parent repliés par défaut), boutons "Montant libre".
2. Employé : sélection avatar.
3. Paiement : moyens simples ou mixte (validation somme = total). Champ code promo/parrainage avec check live. Recherche client + affichage du crédit disponible. Cartes réductions (anniversaire 🎂, parrainage 🤝). Note interne.
4. OK : confirmation finale.

### 10.2. Historique (`pages/Historique.jsx`)

Fusion des anciens modals Stats + Historique :
- **Gate PinAccessModal** au mount si PIN actif et non déverrouillé.
- **Filtre employé** : "Tous" ou un employé.
- **KPIs** : CA total + Prestations.
- **Grille par moyen de paiement** (4 colonnes : Espèces, Carte, Virement, Autre) — les `multi` sont éclatés par sous-paiement pour refléter le CA réel.
- **Liste ligne par ligne** : heure · service (× qty) · employé · moyen de paiement · montant.
- Refresh instantané après action `ff-tx-refresh`.

### 10.3. Transactions (`pages/Transactions.jsx`)

- **Filtres** : recherche texte, type (revenu/dépense), moyen (espèces/carte/virement/autre/mixte), employé, dates.
- **Liste groupée par date** avec séparateurs.
- **Badges** : moyen, employé, source (RDV, parrainage, IA).
- **Actions** : Ajouter, Éditer (PIN admin), Supprimer (PIN admin + confirmation).
- Pagination 10/page.
- **Form transaction** : date, heure, employé, catégorie, montant, description, items multi-quantité.

### 10.4. Agenda (`pages/employee-agenda/`)

- `index.jsx` lit `useParams().employeeId` :
  - Sans ID → `MultiColumnAgenda` (toutes colonnes).
  - Avec ID → `EmpAgendaMain` (colonne unique).
- **Header** : logo, navigation prev/next, bouton "Aujourd'hui".
- **Toggle vue** : Segmented Control Jour / Semaine / Mois + bouton séparé "Agenda en liste" (pill, icône lignes).
- **Persistance** : `localStorage.ff_agenda_view_mode` (whitelist `day|week|month|list`).
- **Deep-link** : `?appt=<id>&date=YYYY-MM-DD` → bascule vue Jour + ouvre `ApptActionModal`, puis `navigate(pathname, {replace:true})`.
- **Stats header** : N RDV · confirmés · encaissés.

#### Composants :
- `MultiColumnAgenda` — colonnes par employé (Jour), grille horaires.
- `WeekView` — timeline 7 jours × heures, cellules colorées par service.
- `MonthView` — calendrier mois avec couleurs selon remplissage.
- `ListView` — carte RDV (heure monospace, client/service/durée, pill statut + pill Encaisse, barre accent 2 px gauche, CSS Grid `auto-fit minmax(240px,1fr)`).
- `EmployeePicker`, `ApptCard`, `InfoRow`, `Spin`, `Toggle`.

#### Modales :
- `QuickAddApptModal` : création RDV (employé, service, date, créneau, client avec recherche et création, notes). Prop `defaultEmpId` pour pré-sélection.
- `ApptActionModal` : détail + actions Modifier / Annuler / Encaisser / Supprimer (admin). Utilisée aussi depuis la solo view.

### 10.5. Clients (`pages/clients/`)

- **Vue liste** (`ListView`) : Avatar (initiales couleur `avatar_color`), Nom, Email, Téléphone. Recherche debounce 350 ms. Tri (Nom/Email/Téléphone/Création, ASC/DESC). Pagination 10/page. Bouton + Ajouter.
- **Vue création** (`CreateView`) : Prénom, Nom, Email, Téléphone, Notes. Prénom OU email obligatoires. Gate PIN facultatif.
- **Vue fiche** (`FicheView`) avec 4 onglets :
  - `InfoTab` : champs éditables, boutons Éditer / Supprimer / Bloquer / Inviter.
  - `HistoryTab` : RDVs + transactions (tri date desc, filtre service).
  - `CreditTab` : solde, historique grant/repay, formulaires Grant (montant + note + employé) et Repay (montant + méthode + note). Repay crée une transaction revenue.
  - `NotesTab` : text area avec auto-save + auteur + timestamp.
- Blocage : flag `is_booking_blocked` → client ne peut plus réserver. Si client avec compte global : email/téléphone verrouillés (readonly).
- Gate PIN sur édition / suppression / blocage.

### 10.6. Settings (`pages/Settings.jsx` + sous-onglets)

Titre "Admin" + badge vert "Accès accordé" (déverrouillage PIN). Onglets :

#### 10.6.1. Stats (`TabStats.jsx`)
- KPIs mois : CA total, nb RDV, taux remplissage, panier moyen.
- Breakdown par service / employé / jour.
- Graphiques (sparkline / chart).

#### 10.6.2. Historique (`TabHistorique.jsx`)
- Transactions admin (toutes dates).
- Filtre avancé : date range, employé, type, moyen.
- Édition / suppression (PIN).
- Export CSV.

#### 10.6.3. Équipe (`TabEquipe.jsx` + `equipe/`)
Sous-onglets :
- **`TabEmployees`** (Team) : fiche par employé (accordion fermé par défaut, toggle chevron).
  - Avatar · Nom · Rôle · Horaires · Statut.
  - Section visibilité site/caisse + permissions agenda + permissions crédit.
  - Boutons : +Ajouter, Edit, Delete, Gérer PIN.
  - `EmployeeForm` : Nom, Rôle, Email, Téléphone, Couleur avatar, Photo (JPG/PNG/WEBP/GIF · 5 Mo max), Statut actif. Round-trip permissions préservées (`{...init, ...f}`).
  - Upload photo : `image/jpeg|png|webp|gif`, erreurs inline, toast neutralisé sur échec Cloudinary.
  - `EmployeePinManager` : set/change/delete PIN 4 chiffres, toggle actif/inactif.
- **`TabHorairesEmployes`** (Horaires) : grille hebdo Lun-Dim × heure. Boutons Appliquer à tous / Reset / Save. Force refetch `loadEmp(empId, force=true)` après save pour bypasser le cache stale. Gate PIN.
- **`TabAbsences`** (Absences) : date range picker, motif (congé, maladie, formation, accident de travail, maternité, paternité, sans solde, autre), label libre. Liste passées/futures avec bouton Annuler (composant `Confirm` pastel, pas de `window.confirm` natif).
- **`TabCommissions`** (Commissions) : par employé, % ou montant fixe par service, tableau éditable inline.

#### 10.6.4. Catégories (`TabCategories.jsx` + `categories/`)
Sous-onglets :
- **`CaisseCategories`** : groupes (parents) + produits (enfants), hiérarchie drag-reorder. Repliés par défaut (une nouvelle catégorie est auto-ouverte). Modals `CatFormModal` / `SvcFormModal` : Nom, Icône, Couleur, Prix (ou libre). Resync via `useEffect([open, init?.id])` pour éviter champs vides sur re-open. Gate PIN.
- **`BookingServices`** : services affichés publiquement. Colonnes Nom, Durée, Prix, Description, Catégorie. Upload image service (5 Mo max, erreurs inline, séparation `err` nom / `imgErr` image).
- **Config** (`MerchantInfoCard` + `TabBookingConfig` + `TabImages`) : logo, photo profil, couverture, infos commerce, config réservation.

#### 10.6.5. Marketing (`TabMarketing.jsx` + `marketing/`)
Sous-onglets :
- **Fidélité** :
  - `TabBirthday` : toggle actif, type remise (% ou €), valeur, `validity_days`, template message.
  - `TabReferral` : toggle, type/valeur parrain, type/valeur filleul, limite (unlimited/mois/3 mois/an/à vie), validité. Phrase dynamique de bannière auto-générée. Conditions libres. Historique des uses.
  - `TabLoyalty` : mode tampons/points, `stamps_required`, `points_per_euro`, `min_purchase`, type et valeur de récompense, `validity_days`, `count_trigger`.
- **Promotions** (`TabPromo` + `PromoForm` + `SendPromoEmailModal`) : table des codes (Code, Type, Valeur, Min, Usages, Exp), formulaire (Code, Type, Valeur, Min, Limit, Dates, Clients cible, Plage horaire). Bouton "Envoyer par email" : sélection clients + template. Gate PIN.
- **Solde SMS** (`TabSMS`) : solde, bouton Recharger (Stripe PaymentIntent), historique recharges / refunds / débits, paiements enregistrés (cartes).
- **IA** (`TabMarketingIA` + `HistoryItem`) : suggestions IA (segments client, messages, meilleurs jours/heures), bouton Appliquer / Ignorer, historique appliqué.
- **Composants** : `KpiCard`, `MiniKpi`, `MiniRow`, `FideliteAccordion`, `SendResultModal`, `StepIndicator`.
- **`OptInBanner`** : bannière RGPD opt-in.

#### 10.6.6. Autres onglets
- **`TabClients`** : alias vers `/clients`.
- **`TabNotifs`** : paramètres notifications (toggles par type, `reminder_delays`, sons, volume, répétitions, `sound_rdv_before`, Web Push).
- **`TabExport`** : export CSV/PDF avec filtres dates. Handler erreur dédié (`ErrorModal` pastel rouge), `downloadFile` joint `x-pin-session` automatiquement.
- **`TabPrevisions`** : forecast IA 7 jours.
- **`TabHeures`** : heatmap jour × heure (remplissage occupation).
- **`TabCompte`** : profil (email, business name, adresse), changement email (OTP), changement mot de passe, gestion PIN admin, bouton Supprimer compte (RGPD), bouton Verrouiller (`/settings`).
- **`QRCard`** : QR code du slug (inscription express `/j/:slug`). `bookingUrl(slug)` utilise `publicOrigin()` (strip `commercant.` du hostname ou `VITE_BOOKING_DOMAIN`).
- **`MerchantInfoCard`** : carte profil, lien actif avec copie presse-papier.

---

## 11. Frontend — Pages client public

### 11.1. Orchestrateur (`pages/booking-page/index.jsx`)

- Lit `authInitMode` depuis le path (`/login` / `/register`).
- Expose callback `onModeChange(m)` au `AuthPanel` pour synchroniser URL.
- Gate `/client/*` : si pas de `ff_client_token` ou JWT expiré → purge + redirect `/book/:slug/login`.
- Gère le flow 6 étapes + vues satellites.

### 11.2. Step1Home (`steps/Step1Home.jsx`)
- Identité : logo, nom, description, adresse cliquable Google Maps, téléphone.
- Horaires compacts (Lun-Sam 9-20, Dimanche fermé).
- **Section Prestations** : accordions par catégorie ou liste plate. Clic → Step2.
- **Section Équipe** : grid avatars. Clic → Step2 avec employé pré-sélectionné.
- **Section Avis Google** : note + étoiles + lien.
- **Iframe Maps** : CSP autorise `frame-src https://www.google.com https://maps.google.com`, switch vers `www.google.com` pour éviter 301 mobile.
- **ReferralBanner** : si programme parrainage actif → lien vers `/book/:slug/parrain`.

### 11.3. Step2 (`Step2ServiceOrEmployee.jsx`)
- Deux chemins symétriques selon ce qui a été cliqué Step1 (service → employé ou employé → service).

### 11.4. Step3 (`Step3Date.jsx`)
- Calendrier interactif, navigation mois, jour coloré selon ouvert/plein/fermé.

### 11.5. Step4 (`Step4Slot.jsx`)
- Liste créneaux disponibles (HH:MM), heures passées masquées si aujourd'hui.

### 11.6. Step5 (`Step5Info.jsx`)
- Formulaire : Prénom, Nom, Email, Téléphone, Notes.
- Toggle opt-in marketing (RGPD).
- Auth Google OAuth en option.
- Validation email obligatoire si nouveau client.

### 11.7. Step6 (`Step6Confirm.jsx`)
- Récapitulatif complet.
- Saisie code promo / parrainage (check live).
- Remise affichée.
- Boutons Annuler / Confirmer.

### 11.8. Vues satellites (`views/`)
- `SuccessView` : confirmation + lien calendrier perso + CTA Google/Apple Cal.
- `MyApptsView` : agrège Mes RDV + Profil + Parrainage + Passages.
- `ParrainView` : partage du code parrainage, stats, conditions.
- `BlockedView` : affichage "Client bloqué" (non réservable).

### 11.9. Mon compte (`pages/booking/`)

#### `account/` (`Account.jsx` + `components/`)
- `AuthPanel` : login / register / Google OAuth. `onModeChange(m)` synchronise l'URL. `PostRegisterPopup` à la fin avec CTA.
- `GlobalAccountView` : vue connectée (RDV, Parrainage, Profil, Passages).

#### `my-appointments/` (4 onglets)
- **`AppointmentsTab`** (Mes RDV) : carte épurée FDS-2026 (`borderLeft 2px`, `borderRadius 12`, fontWeight ≤ 500). Une seule indication de statut (pill 11 px pastel au-dessus du prix). Bouton Annuler disparaît si non annulable. Ref `#ID` discrète en bas.
- **`VisitsTab`** (Passages) : historique passages sur place (multi-commerces si global client). Card `VisitDetailCard` sur détail (services, montants, notes).
- **`ProfileTab`** (Profil) : Prénom, Nom, Email, Téléphone, Birth date, Code postal, Ville. Toggle opt-in marketing. Modals :
  - `ChangeEmailModal` (2 étapes : saisie → OTP).
  - `ChangePwdModal` (current OU forgot).
  - `DeleteAccountModal` (confirmation phrase à saisir).
- **`ReferralTab`** (Parrainage) : mon code, bouton copier, partage SMS / email / réseaux, stats, historique uses (pending/validated/cancelled).

#### Modales
- `CancelApptModal` : raison + confirm.
- `TooLateModal` : si annulation impossible (< cancellation_policy_hours).

### 11.10. `ReferralPage.jsx`
- Page standalone. Deux variantes d'affichage :
  - **Client non-authentifié** : tableau label/valeur ("Récompense parrain", "Récompense filleul", "Validité", "Limite").
  - **Client connecté (`gcConnected`)** : bloc prose (phrase) — ex : "Vous gagnez **10 %** à chaque filleul validé, utilisable en caisse sur prestation. Aucune limite sur le nombre de parrainages. Validité de la récompense : **60 jours après validation**." — s'adapte à la config percent/euro + limite illimitée/mois/3 mois/an.
- Code parrainage perso avec bouton copier.

### 11.11. `NavBar.jsx` / `SideCard.jsx` / `Services.jsx`
- Navigation sticky, thème toggle, responsive.
- `SideCard` : sidebar desktop (logo, infos, horaires, iframe Maps).
- `Services` : composant liste/accordion de services.

---

## 12. Composants réutilisables (`frontend/src/components/`)

### 12.1. Primitives
- **Button** : variants `primary|secondary|danger`, sizes `sm|md|lg`, fullWidth, disabled.
- **Card** : wrapper avec elevation + padding.
- **Input** : erreur inline.
- **SegmentedControl** : radio buttons tab-like.
- **StatusBadge** : pastille succès/warning/erreur/info.
- **Toggle** : interrupteur personnalisé.

### 12.2. UI (`UI.jsx`)
- **Toast** : notification courte `ok|error`.
- **useToast()** : hook déclencheur.
- **Confirm** : modale confirmation simple (remplace `window.confirm`).

### 12.3. Forms (`Forms.jsx`)
- **TransactionForm** : création / édition transaction.
- **EmployeeForm** : création / édition employé, upload photo (`imgErr` inline), préservation permissions au round-trip.

### 12.4. Auth
- **AuthFlow** : écran login / register / forgot / vreg / vreset / newpw. `initialScreen` prop, synchronise l'URL au changement d'écran (`useNavigate`). `notifyLoginJustHappened()` appelé au login.
- **MerchantOnboarding** : wizard post-signup commerçant (pré-rempli si Google OAuth).

### 12.5. PIN
- **PinEntry** : clavier numérique 4 digits.
- **PinSetup** : double saisie avec confirmation.
- **PinAccessModal** : gate avec choix employé puis saisie PIN, 3 tentatives.
- **EmployeePinModal** : modale flottante (sheet mobile, centered desktop), onSuccess/onCancel.

### 12.6. Notifications
- **NotificationCenter** (cloche) dans `App.jsx` : cartes FDS-2026 pastel par type, emojis retirés au profit de `I.*` (Lucide), libellé employé 16-18 px, date lisible, heure 20-22 px monospace, chip type majuscule.
- **NotifCard** : carte individuelle.

---

## 13. Hooks (`frontend/src/hooks/`)

- **useAuth** : `user`, `loading`, `login()`, `logout()`, `updateUser()`. Écoute storage events (multi-tab), 401 expired, OAuth broadcast. Grace period 15 s post-login.
- **useAdmin** : `unlocked`, `hasPin`, `verifyPin()`, `changePin()`, `removePin()`, `lock()`, `checkSession()`, `clearOnLogout()`. Purge via storage event.
- **useTheme** : `theme` (objet couleurs), `mode`, `toggle()`. Persistance `ff_theme`.
- **useNotifications** : `notifications[]`, `unreadCount`, `pushSupported`, `pushEnabled`, `loadNotifications()`, `markRead()`, `markAllRead()`, `deleteNotif()`, `enablePush()`, `disablePush()`, `playSound()`.
- **useEmployeePin** : gate re-saisie 5 min. `requiresPin(empId)`, `isSessionValid(empId)`, `verifyPin(empId, pin)`. Token dans sessionStorage `ff_emp_pin_<empId>`.

---

## 14. Utils (`frontend/src/utils/`)

### 14.1. `api.js` (client REST centralisé)
- `getToken()`, `getPinToken()`, `getEmployeePinToken(empId)`.
- `request(path, options)` : joint `Authorization` + `x-employee-pin` auto.
- `adminRequest(path, options)` : joint aussi `x-pin-session` (utilisé pour `loyaltyApi.saveProgram`, `referralsApi.updateProgram`, `birthdayApi.update`, etc.).
- `handleMerchant401(res)` : purge tokens + dispatch `ff-auth-expired`, double-check via `/auth/me` avant purge, dédup `__meCheckInFlight`.
- `isJwtLocallyExpired(token)` : décode `exp` (skew 10 s).
- `notifyLoginJustHappened()` : grace period 15 s.
- `exportApi.downloadFile()` : joint `x-pin-session`, parse JSON sur erreur (403 → "Session admin expirée").
- `mediaApi._uploadImage()` : helper tolérant aux réponses non-JSON (lit `content-type`, fallback message selon 413/401/403).
- Sous-APIs : `bookingApi`, `pubApi`, `globalClientApi`, `loyaltyApi`, `promoApi`, `referralsApi`, `creditsApi`, `clientsApi`, `absencesApi`, `commissionsApi`, etc.

### 14.2. `publicUrl.js`
- `publicOrigin()` : respecte `VITE_BOOKING_DOMAIN` prioritairement, sinon strippe `commercant.` du hostname.
- `bookingUrl(slug)` : concat `publicOrigin()` + `/book/:slug`.

---

## 15. Règles UI transversales

- **Persistance localStorage** :
  - `ff_token` (merchant), `ff_pin_token` (PIN admin), `ff_theme`.
  - `ff_client_token`, `ff_client_info`, `ff_booking_theme`, `ff_booking_ref_<slug>` (code parrainage, survit à l'auth).
  - `ff_agenda_view_mode` (day/week/month/list).
- **PIN employé** (sessionStorage `ff_emp_pin_<empId>`) : re-saisie systématique avant toute action sensible, TTL 5 min.
- **Photo upload** : whitelist `image/jpeg|png|webp|gif`, 5 Mo max, erreur inline rouge 11 px fontWeight 500 + bordure rouge. Plus de `image/*` large qui laisse passer HEIC/SVG.
- **Catégories** : repliées par défaut au chargement (flag `didInitOpen` retiré), une nouvelle catégorie créée est auto-ouverte.
- **Deep-links notifications** : `safeInternalPath` rejette `javascript:`, `data:`, `//evil`, caractères de contrôle, backslash.
- **Débounces** : recherche clients/transactions 350 ms, autocomplete 200 ms.
- **Paginations** : 10 items/page pour clients, transactions, visits.
- **Sons notifications** : Web Audio API (oscillators), types `caisse|new_appointment|reminder`, volume/répétition configurable (`sound_repeat`).
- **Couleurs pastel moyens paiement** :
  - Espèces : texte `#065f46`, bg `#f0fdf4`.
  - Carte : texte `#4338ca`, bg `#eef2ff`.
  - Virement : texte `#0e7490`, bg `#ecfeff`.
  - Autre : texte `#92400e`, bg `#fffbeb`.
  - Multi : texte `#3c3489`, bg `#eeedfe`.
- **Thème clair / sombre** (useTheme) : objet `{bg, text, muted, card, border, borderInput, inputBg, separator, shadowSm, shadowModal}`.
- **Event bus interne** : `ff-tx-refresh` (recharger les transactions), `ff-auth-expired` (déconnexion forcée).
- **Breakpoints** : mobile <640 px, tablet 640-1024 px, desktop ≥1024 px.

---

## 16. Synthèse fonctionnelle par rôle

### 16.1. Ce que le commerçant peut faire
- Créer son compte + salon (OTP email), ou via Google OAuth.
- Configurer son salon : nom, adresse, logo, photo profil, couverture.
- Définir catégories caisse (hiérarchiques, icônes, couleurs, prix).
- Définir catégories réservation + prestations (durée, prix, description, image).
- Configurer la réservation publique (slug, anticipation, préavis, annulation, require_account, horaires, pauses).
- Créer / éditer / supprimer des employés (nom, rôle, avatar, photo, PIN, permissions granulaires, show_on_booking, show_in_caisse, commission).
- Définir horaires employés (par jour, plages multiples, disponibilités ponctuelles).
- Gérer absences (congés, maladie, formation, etc.) avec annulation.
- Configurer commissions par employé / service / catégorie.
- Visualiser son agenda (Jour, Semaine, Mois, Liste), multi ou solo employé, drag & drop, deep-links notifs.
- Créer / modifier / annuler / encaisser / supprimer RDV.
- Encaisser en caisse (simple ou mixte), multi-items, multi-paiements, code promo, client avec crédit.
- Gérer fiches clients (CRUD, notes, crédit grant/repay, blocage, invitation).
- Configurer programme de fidélité (tampons/points, récompense, validité, trigger).
- Configurer programme de parrainage (valeurs parrain/filleul, limite, période).
- Configurer campagne anniversaires (remise, validité, message).
- Créer / envoyer / éditer codes promo (personnes cibles, plage horaire, montant min).
- Lancer campagnes marketing (email / SMS / IA) avec estimation coût, auto-plan IA.
- Recharger SMS via Stripe (save card, paiement 1-clic, webhook idempotent).
- Exporter données (CSV / PDF) avec PIN admin.
- Voir stats / prévisions / heatmap heures.
- Configurer notifications (toggles, délais, sons, Web Push, in-app, daily recap).
- Changer email / mot de passe, supprimer compte (RGPD cascade).
- Gérer PIN admin (set, change, forgot, delete).

### 16.2. Ce que l'employé peut faire (selon permissions)
- Se connecter via PIN 4 chiffres (2 h de session).
- Voir et modifier les RDV (si `can_modify`).
- Annuler des RDV (si `can_cancel`).
- Encaisser en caisse (si `can_encash`).
- Appliquer des codes promo (si `can_use_promo`).
- Accorder un crédit client (si `can_grant_credit`).
- Rembourser / utiliser un crédit client (si `can_repay_credit`).

### 16.3. Ce que le client peut faire (public, `/book/:slug`)
- Consulter le salon (description, prestations, équipe, avis, horaires, adresse).
- Réserver un RDV en 6 étapes (service → employé → date → créneau → infos → confirmation).
- S'inscrire (compte interne ou global) + OAuth Google, ou inscription express via QR code.
- Appliquer un code promo / parrainage.
- Voir ses RDV à venir / passés.
- Annuler un RDV jusqu'à `cancellation_policy_hours` avant.
- Voir ses passages sur place (si global client multi-commerces).
- Modifier son profil (prénom, nom, email, téléphone, anniversaire, opt-in marketing).
- Changer son email (OTP) et son mot de passe.
- Supprimer son compte (RGPD).
- Exporter ses données.
- Partager son code parrainage (SMS, email, réseaux).
- Voir son statut fidélité multi-commerces.

---

## 17. Points spéciaux à connaître

- **Caps métier fidélité** : `MAX_STAMPS_REQ=100`, `MAX_REWARD_PCT=100`, `MAX_REWARD_FIXED=500`, `MAX_POINTS_PER_EU=100`, `MAX_VALIDITY_DAYS=3650`, `MAX_MIN_PURCHASE=10000`.
- **Caps parrainage** : percent ≤ 100 %, fixed ≤ 500 €, `limit_count ≤ 10 000`.
- **Anti-fraude anniversaire** : rolling window 330 jours (pas par année calendaire) → impossibilité de frauder en modifiant la date de naissance avant 330 j.
- **Limite Brevo** : 300 emails / jour globaux (`email_global_daily` atomique via `ON CONFLICT`).
- **Refund SMS automatique** : en cas d'échec d'envoi SMS, le montant est re-crédité sur `sms_balance` + log.
- **Idempotency Stripe** : `UNIQUE(sumup_checkout_id) WHERE NOT NULL` garantit un seul crédit SMS par PaymentIntent.
- **Idempotency transactions** : `UNIQUE(user_id, idempotency_key)` contre le double-clic en caisse.
- **Audit trail transactions** : `transaction_audit_log` capture snapshot_before / snapshot_after JSONB.
- **CSP** : `frame-src` autorise Stripe, Google OAuth, `www.google.com`, `maps.google.com`.
- **Middleware d'erreur global** : toute erreur sur `/api/*` renvoie du JSON `{error}` (plus de HTML `<!DOCTYPE>` qui cassait le front sur upload multer).
- **Media provider** : Cloudinary détecté auto si les 3 variables (`CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`) sont présentes, sinon `local`. Log au boot.
- **URL publique** : `publicOrigin()` strippe `commercant.` du hostname ou respecte `VITE_BOOKING_DOMAIN` (QR code et partage fonctionnels depuis un sous-domaine admin).
- **PIN employé** : UI re-demande à chaque action sensible (sessionStorage 5 min max), JWT 2 h côté serveur.
- **PIN admin** : revalidation 5 min inactivité, purge auto à la sortie de `/settings`.
- **Notifications deep-link** : backend injecte `data.url = /agenda?date=YYYY-MM-DD&appt=<id>` ; frontend ouvre directement la vue Jour + modal RDV ; strippe les params ensuite (évite ré-ouverture au remount).
- **Agenda persistance** : `ff_agenda_view_mode` survit aux F5 et redémarrages navigateur.
- **Conditions parrainage connecté** : phrase prose dynamique adaptée à la config (percent/euro, illimitée/mois/3 mois/an, validité).
- **Boucle login évitée** : grace period 15 s + double-check `/auth/me` avant purge + check local `exp` dans `getToken()` + garde `__meCheckInFlight`.
- **Design system FDS-2026** : `borderLeft 2px` accent, `borderRadius 12`, fontWeight ≤ 500, SVG inline → `I.*` Lucide, pas d'emoji in-app (conservés seulement pour push lock-screen OS).

---

## 18. Conclusion

FlowIA est un SaaS complet combinant :

- Prise de RDV en ligne publique (slug, 6 étapes, compte client optionnel ou exigé).
- Agenda multi-employés avec 4 vues (Jour, Semaine, Mois, Liste) et deep-links.
- Caisse professionnelle avec multi-paiements, multi-items, audit trail, idempotency.
- Équipe avec permissions granulaires et PINs individuels sécurisés.
- CRM complet avec fiche client, crédit, notes, blocage.
- Marketing complet : fidélité (tampons/points), parrainage anti-fraude, anniversaires 330 j, codes promo, campagnes email / SMS, marketing IA avec budget et segmentation.
- Notifications multi-canal (in-app, email, Web Push, sons) avec deep-links.
- Compte client global multi-commerces (plateforme unifiée).
- Conformité RGPD bout en bout (consentement, opt-in, désinscription, suppression, anonymisation, export).
- Sécurité : rate limiters dédiés, PIN admin sur toutes les configs financières, PIN employé sur toutes les actions sensibles, JWT multi-scope, idempotency Stripe/transactions, audit complet, anti-brute-force DB-level.
- Tâches planifiées : rappels RDV (24 h + 2 h), rappels shift employés, récap quotidien, anniversaires, campagnes email (quota Brevo), campagnes SMS (refund auto sur échec), nettoyage paiements abandonnés.

L'ensemble est déployé sur Vercel (frontend), Render (backend) et Supabase (PostgreSQL), avec gestion multi-origine CORS et sous-domaines (admin sur `commercant.*`, public sur domaine nu).
