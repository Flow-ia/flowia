# CARTOGRAPHIE — FlowIA (état actuel refonte-archi-v3)

> **Commit 0 du plan refonte FDS-2026.** Ce document est la photo du code existant au moment où la refonte démarre. Il sert de référence pendant les 14 commits pour savoir *quoi déplacer*, *quoi ne pas casser*, *où se trouve chaque morceau*.
>
> **Complément**, pas substitut, à `allOffApp.md` (prose exhaustive déjà commitée en 2591e7a) et `INVENTAIRE-FONCTIONNEL.md` (checklist à cocher). Ici, tables et chemins de fichiers bruts.
>
> Branche : `refonte-archi-v3`. Dernier commit référencé : `2591e7a`.

---

## 1. Arborescence source

### 1.1 Backend (`backend/src/`)

```
backend/src/
├── index.js                      # Bootstrap cluster, CORS, rate limiters, montage routes, cron (lignes 572-620)
├── db/
│   └── index.js                  # initDB() — CREATE TABLE IF NOT EXISTS idempotents
├── middleware/
│   ├── auth.js                   # authMiddleware — Bearer JWT, reject NON_MERCHANT_SCOPES
│   ├── pinAdmin.js               # pinAdminMiddleware — x-pin-session scope pin_session
│   ├── employeePinOptional.js    # employeePinOptional — x-employee-pin, injecte req.employee
│   ├── employee.js               # (variantes employé)
│   └── requireMerchant.js        # vérifie existence merchant en base
├── routes/
│   ├── auth.js                   # /api/auth/*
│   ├── booking.js                # /api/booking/* (merchant)
│   ├── booking/                  # sous-modules de booking.js
│   ├── public-booking/           # /api/pub/:slug/* (public via slug)
│   ├── booking-service-categories.js
│   ├── transactions.js           # /api/transactions
│   ├── employees.js              # /api/employees
│   ├── employee-pins.js          # /api/employee-pins
│   ├── categories.js             # /api/categories (caisse)
│   ├── clients.js                # /api/clients + upsertLocalClient()
│   ├── client-notes.js           # /api/client-notes
│   ├── credits.js                # /api/credits
│   ├── loyalty.js                # /api/loyalty (export: { router })
│   ├── promo.js                  # /api/promo
│   ├── referrals.js              # /api/referrals + resolveReferralForFilleul/validateReferralUse
│   ├── birthday.js               # /api/birthday-campaign
│   ├── commissions.js            # /api/commissions
│   ├── absences.js               # /api/absences
│   ├── notifications.js          # /api/notifications
│   ├── campaigns.js              # /api/campaigns (IA + envoi)
│   ├── marketing.js              # /api/marketing
│   ├── payments.js               # /api/payments (Stripe + webhook)
│   ├── stats.js                  # /api/stats
│   ├── export.js                 # /api/export (CSV + PDF)
│   ├── media.js                  # /api/media (upload + lecture publique)
│   ├── global-clients.js         # /api/global-clients
│   └── global-clients/           # sous-modules
└── utils/
    ├── email.js, emailSender.js  # Brevo SMTP
    ├── messenger.js              # SMS + sleep()
    ├── push.js                   # Web Push VAPID
    ├── unsubscribe.js            # token 1-clic RGPD
    └── loyalty-utils.js          # incrementStamps(), caps métier
```

### 1.2 Frontend (`frontend/src/`)

```
frontend/src/
├── index.jsx                     # Router racine (BrowserRouter + Routes publiques /book /__oauth)
├── App.jsx                       # 1874 lignes — routing commerçant, EncaisserSheet, FreePriceModal, NotifModal, useEmployeePinGate
├── index.css                     # Tailwind est utilisé en LEGACY sur quelques écrans (App/Settings) — à purger au commit 14
├── components/
│   ├── primitives/               # Button, Card, Input, Toggle, SegmentedControl
│   ├── UI.jsx                    # Toast, useToast, Confirm
│   ├── Forms.jsx                 # TransactionForm, EmployeeForm
│   ├── AuthFlow.jsx              # login/register/forgot/vreg/vreset/newpw + MerchantOnboarding
│   ├── PinGate.jsx               # PinEntry, PinSetup, PinAccessModal
│   ├── EmployeePinModal.jsx      # useEmployeePinGate()
│   ├── SMSRechargeModal.jsx      # Stripe PaymentIntent 3 modes
│   ├── AddressAutocomplete.jsx
│   └── ThemeToggle.jsx
├── hooks/
│   ├── useAuth.jsx
│   ├── useAdmin.jsx
│   ├── useTheme.jsx
│   ├── useNotifications.jsx
│   └── useEmployeePin.jsx
├── utils/
│   ├── api.js                    # 678 lignes — 20+ sous-APIs (voir §3)
│   ├── publicUrl.js              # publicOrigin(), bookingUrl(slug)
│   ├── icons.jsx                 # I.* (Lucide inline)
│   └── dates.js
└── pages/
    ├── Dashboard.jsx             # 1003 lignes — tuiles, NotifModal, quick entry
    ├── Historique.jsx            # KPIs jour + grille 4 paiements + liste
    ├── Transactions.jsx          # CRUD + filtres + pagination
    ├── ClientsPage.jsx           # wrapper → pages/clients/
    ├── EmployeeAgenda.jsx        # wrapper → pages/employee-agenda/
    ├── Agenda.jsx                # (2 lignes, legacy wrapper)
    ├── Settings.jsx              # 160 lignes — URL_TO_TAB + 12 tabs + routing segments
    ├── OAuthCallback.jsx         # popup Google retour
    ├── BookingPage.jsx           # entry client public /book/:slug
    ├── BookingPolitique.jsx      # /book/:slug/politique
    ├── agenda/                   # MultiColumnAgenda, WeekView, MonthView, ListView
    ├── employee-agenda/          # EmpAgendaMain + tabs ConfigTab/TeamTab + modals
    ├── clients/                  # index + Create + Fiche + tabs InfoTab/HistoryTab/CreditTab/NotesTab
    ├── settings/                 # 12 Tab*.jsx + sous-dossiers categories/ equipe/ marketing/
    ├── booking/                  # NavBar, SideCard, Services, ReferralPage, account/, my-appointments/
    └── booking-page/             # Step1..Step6, views/, ReferralBanner, index.jsx orchestrateur
```

---

## 2. Routing React

### 2.1 Public (monté dans `index.jsx`)
| Chemin | Élément | Notes |
|---|---|---|
| `/__oauth` | `OAuthCallback` | popup Google retour |
| `/j/:slug` | `QuickJoinRedirect` | QR express → `/book/:slug/auth?quick=1` |
| `/book/:slug/politique` | `BookingPolitique` | — |
| `/book/:slug/...` (10 variantes) | `BookingPage` | orchestrateur 6 steps + vues satellites |
| `/book/:slug/parrain` | `BookingPage` | ParrainView |
| `/book/:slug/client/rdv` | `BookingPage` | MyApptsView onglet RDV |
| `/book/:slug/client/passages[/:id]` | `BookingPage` | VisitsTab |
| `/book/:slug/client/profil` | `BookingPage` | ProfileTab |
| `/*` | `RootSwitch` | bascule vers app commerçant si domaine admin |

### 2.2 Privé commerçant (monté dans `App.jsx` lignes 1860-1872)
| Chemin | Élément |
|---|---|
| `/dashboard` | `Dashboard` |
| `/historique` | `Historique` (gate PIN via `PinAccessModal`) |
| `/transactions` | `Transactions` |
| `/clients` | `ClientsPage` |
| `/agenda`, `/agenda/views`, `/agenda/views/:employeeId` | `EmployeeAgenda` |
| `/settings`, `/settings/*` | `Settings` (dispatcher 12 tabs) |
| `/`, `*` | redirect `/dashboard` |

Non-authentifié : `/login`, `/register`, `/forgot-password` → `AuthFlow`.

**Impact refonte (commit 3) :** ajouter `/caisse`, `/marketing`, `/statistiques`, `/reglages` avec redirects depuis `/settings?tab=*`.

---

## 3. API Backend — Routes × middlewares × user_id

Tous les middlewares sont montés dans `backend/src/index.js` (lignes 202-252). La colonne « Filter user_id » indique si le module fait systématiquement `WHERE user_id = req.user.userId` sur ses queries métier (contrat multi-tenant).

| Base path | Router | Rate limit | Middlewares par défaut | Filter user_id |
|---|---|---|---|---|
| `/api/auth` | `routes/auth.js` | `authLimiter` (+ `registerLimiter` sur /register, `loginLimiter` sur /login) | aucun au niveau router (routes publiques) | N/A (création) |
| `/api/pub/:slug` | `routes/public-booking/` | `pubLimiter` (600/min) + `quickRegisterLimiter` sur /client/quick-register | résolution via slug → user_id | oui (via slug lookup) |
| `/api/booking` | `routes/booking.js` + `routes/booking/` | `apiLimiter` | `authMiddleware` + `employeePinOptional` + `pinAdminMiddleware` sur écritures settings/services | oui |
| `/api/booking/service-categories` | `routes/booking-service-categories.js` | `apiLimiter` | `authMiddleware` + `pinAdminMiddleware` en écriture | oui |
| `/api/transactions` | `routes/transactions.js` | `apiLimiter` | `authMiddleware` + `employeePinOptional` sur POST, `pinAdminMiddleware` sur PUT/DELETE | oui |
| `/api/categories` | `routes/categories.js` | `apiLimiter` | `authMiddleware` + `pinAdminMiddleware` en écriture | oui |
| `/api/employees` | `routes/employees.js` | `apiLimiter` | `authMiddleware` + `pinAdminMiddleware` en écriture | oui |
| `/api/employee-pins` | `routes/employee-pins.js` | `apiLimiter` (+ `employeePinVerifyLimiter` sur /verify) | `authMiddleware`, `pinAdminMiddleware` pour set/delete/toggle | oui |
| `/api/stats` | `routes/stats.js` | `statsLimiter` | `authMiddleware` | oui (cache 5 min) |
| `/api/absences` | `routes/absences.js` | `apiLimiter` | `authMiddleware` + `pinAdminMiddleware` sur PUT/PATCH | oui |
| `/api/commissions` | `routes/commissions.js` | `apiLimiter` | `authMiddleware` + `pinAdminMiddleware` en écriture | oui |
| `/api/loyalty` | `routes/loyalty.js` (router) | `apiLimiter` | `authMiddleware` + `pinAdminMiddleware` (mutations programme) | oui (caps métier) |
| `/api/promo` | `routes/promo.js` | `apiLimiter` | `authMiddleware` + `pinAdminMiddleware` en écriture | oui |
| `/api/client-notes` | `routes/client-notes.js` | `apiLimiter` | `authMiddleware` + `pinAdminMiddleware` sur DELETE | oui |
| `/api/clients` | `routes/clients.js` | `apiLimiter` | `authMiddleware` | oui |
| `/api/global-clients` | `routes/global-clients.js` | `apiLimiter` (+ limiters spécifiques sur register/login/etc.) | JWT scope `global_client` | N/A (multi-tenant) |
| `/api/export` | `routes/export.js` | `apiLimiter` | `authMiddleware` + `pinAdminMiddleware` | oui |
| `/api/credits` | `routes/credits.js` | `apiLimiter` | `authMiddleware` + `employeePinOptional` (enforce can_grant / can_repay) | oui |
| `/api/campaigns` | `routes/campaigns.js` | `apiLimiter` | `authMiddleware` + `pinAdminMiddleware` sur send/auto-send | oui |
| `/api/marketing` | `routes/marketing.js` | `apiLimiter` | `authMiddleware` | oui |
| `/api/birthday-campaign` | `routes/birthday.js` | `apiLimiter` | `authMiddleware` + `pinAdminMiddleware` sur PUT | oui |
| `/api/referrals` | `routes/referrals.js` | `apiLimiter` | `authMiddleware` + `pinAdminMiddleware` sur PUT programme | oui |
| `/api/payments` | `routes/payments.js` | `apiLimiter` (+ `paymentsIntentLimiter` sur /sms/intent, /sms/checkout) | `authMiddleware` (sauf webhook raw body) | oui |
| `/api/payments/sms/webhook` | idem | — | **raw body AVANT express.json()** (index.js:125), signature Stripe | N/A |
| `/api/notifications` | `routes/notifications.js` | `notifLimiter` | `authMiddleware` + `pinAdminMiddleware` sur PUT settings | oui |
| `/api/media` | `routes/media.js` | `apiLimiter` | `authMiddleware` sur upload, publique sur `/commercant/:userId/*` | oui (sauf routes publiques) |

**Règle #4 (`regles-absolues.md`) :** chaque écriture doit scoper `user_id`. Lors des commits 2/5/7/8, toute nouvelle route doit respecter ce contrat.

---

## 4. Tables SQL (scope `user_id`)

Source : `backend/src/db/index.js` — toutes les `CREATE TABLE IF NOT EXISTS`. FK vers `users(id)` notée ✓.

| Table | FK user_id | UNIQUE notables | Rôle |
|---|---|---|---|
| `users` | — | `email` | compte commerçant |
| `verification_codes` | — | `key` | OTP 15 min |
| `user_pins` | ✓ (PK) | — | PIN admin bcrypt |
| `categories` | ✓ | — | hiérarchie caisse (parent_id) |
| `employees` | ✓ | — | équipe + 6 permissions + show_on_booking/show_in_caisse |
| `employee_pins` | ✓ | PK employee_id | PIN employé + failed_attempts + locked_until |
| `employee_hours` | ✓ | (employee_id, day_of_week) | horaires employé |
| `employee_time_slots` | ✓ | — | plages multiples |
| `employee_availability` | ✓ | (employee_id, date) | dispos ponctuelles |
| `employee_absences` | ✓ | — | 8 types + cancel |
| `booking_settings` | ✓ (UNIQUE) | `slug` | slug public, advance_days, min_notice, cancellation_policy |
| `business_hours` | ✓ | (user_id, day_of_week) | ouverture commerce |
| `business_breaks` | ✓ | — | pauses commerce |
| `booking_services` | ✓ | — | prestations publiques |
| `booking_service_categories` | ✓ | — | groupes publics |
| `client_accounts` | ✓ | (user_id, email) | CRM scoped |
| `client_notes` | ✓ | — | notes + client_email NULL (RGPD) |
| `client_credits` | ✓ | (user_id, client_email) | balance + total_granted/repaid |
| `credit_transactions` | ✓ | — | grant/repay |
| `appointments` | ✓ | — | RDV + reminder flags |
| `appointment_items` | indirect | — | panier prestations |
| `transactions` | ✓ | `uq_tx_idempotency (user_id, idempotency_key)` | caisse (idempotent double-clic) |
| `transaction_items` | indirect | — | multi-items |
| `transaction_payments` | indirect | — | multi-paiement method='multi' |
| `transaction_audit_log` | ✓ | — | snapshot_before/after JSONB |
| `loyalty_programs` | ✓ | — | mode stamps/points + caps |
| `client_loyalty` | ✓ | — | stamps/points par client |
| `promo_codes` | ✓ | — | percent/fixed + time window |
| `promo_usage_logs` | ✓ | — | audit utilisation |
| `client_rewards` | ✓ | (user_id, client_email, reward_type, année) | anniversaire/parrainage/fidélité unifiés |
| `referral_programs` | ✓ | — | caps percent/fixed/limit |
| `referral_codes` | ✓ | (user_id, owner_client_email) | code parrain |
| `referral_uses` | ✓ | — | filleul_email + status |
| `birthday_campaigns` | ✓ | — | toggle + template |
| `campaigns` | ✓ | — | target, channel, sent/failed |
| `campaign_queue` | ✓ | — | email/sms pending/sent/failed |
| `ai_campaigns` | ✓ | — | phases JSONB |
| `ai_campaign_codes` | ✓ | — | segment, scheduled_at |
| `sms_transactions` | ✓ | `UNIQUE(sumup_checkout_id) WHERE NOT NULL` | anti double-crédit Stripe |
| `message_log` | ✓ | — | log SMS/email + coûts |
| `email_global_daily` | — (global) | `(date)` | quota Brevo 300/j cluster-safe |
| `notification_settings` | ✓ (UNIQUE) | — | toggles + delays CSV + sons |
| `notification_log` | ✓ | — | dédoublonnage type × appointment_id |
| `app_notifications` | ✓ | — | centre in-app (is_read) |
| `push_subscriptions` | ✓ | — | VAPID endpoint + keys |
| `media` | ✓ | — | type profile/cover/service/logo/employee |
| `service_commissions` | ✓ | — | % ou fixe par employé/service |
| `global_clients` | — (multi-tenant) | `email` | compte global + google_id |

**Tables à CRÉER au commit 1 :** `user_settings` (tablet_mode_enabled, employee_session_timeout_min, lock_on_tab_close, sms_low_balance_threshold). Colonnes à AJOUTER : permissions `can_*` manquantes sur `employees` + `show_on_booking` + `show_in_caisse` + `signed_by_employee_id` sur `transactions`.

---

## 5. API client (`frontend/src/utils/api.js`)

Helpers transverses :
- `getToken()`, `getPinToken()`, `getEmployeePinToken(empId)` — lecture localStorage/sessionStorage
- `request(path, options)` — joint `Authorization` + `x-employee-pin` automatiquement
- `adminRequest(path, options)` — joint en plus `x-pin-session`
- `handleMerchant401()` — purge + double-check /auth/me + dédup `__meCheckInFlight`
- `isJwtLocallyExpired(token)` — skew 10s
- `notifyLoginJustHappened()` — grace 15s post-login
- `exportApi.downloadFile()` — joint x-pin-session, parse erreur JSON
- `mediaApi._uploadImage()` — tolère réponses non-JSON

Sous-APIs (ordre alphabétique) : `absencesApi`, `authApi`, `birthdayApi`, `bookingApi`, `campaignsApi`, `clientNotesApi`, `clientsApi`, `commissionsApi`, `creditsApi`, `exportApi`, `globalClientApi`, `loyaltyApi`, `marketingApi`, `mediaApi`, `notifApi`, `paymentsApi`, `promoApi`, `pubApi`, `publicReferralApi`, `referralsApi`, `statsApi`.

**À ajouter (commit 2) :** `userSettingsApi` = { get(), update(body) }.

---

## 6. Hooks React

| Hook | Fichier | État géré | Notes |
|---|---|---|---|
| `useAuth` | `hooks/useAuth.jsx` | `user`, `loading`, `login()`, `logout()`, `updateUser()` | Écoute `storage`, `ff-auth-expired`, OAuth BroadcastChannel, grace 15s |
| `useAdmin` | `hooks/useAdmin.jsx` | `unlocked`, `hasPin`, `verifyPin()`, `changePin()`, `removePin()`, `lock()`, `checkSession()` | Purge via `storage` multi-tab, sortie `/settings` |
| `useTheme` | `hooks/useTheme.jsx` | `theme` (palette), `mode`, `toggle()` | Persistance `ff_theme` |
| `useNotifications` | `hooks/useNotifications.jsx` | `notifications[]`, `unreadCount`, `pushSupported`, `pushEnabled`, `loadNotifications()`, `markRead()`, `markAllRead()`, `deleteNotif()`, `enablePush()`, `disablePush()`, `playSound()` | Web Audio + Web Push VAPID |
| `useEmployeePin` | `hooks/useEmployeePin.jsx` | `requiresPin(empId)`, `isSessionValid(empId)`, `verifyPin(empId, pin)` | sessionStorage `ff_emp_pin_<empId>`, TTL 5 min |

---

## 7. Modales principales

| Modale | Fichier | Trigger | Scope |
|---|---|---|---|
| `FreePriceModal` | `App.jsx` local | clic catégorie prix libre dans EncaisserSheet | catégorie courante |
| `EncaisserSheet` | `App.jsx` local | FAB Dashboard, bouton « Encaisser » TopBar | merchant + optionnel PIN employé |
| `NotifModal` | `App.jsx` via `Dashboard.jsx` | cloche TopBar | merchant |
| `PinAccessModal` | `components/PinGate.jsx` | mount `/historique`, actions sensibles Clients/Transactions | admin |
| `PinEntry` / `PinSetup` | `components/PinGate.jsx` | TabCompte, reset PIN | admin |
| `EmployeePinModal` | `components/EmployeePinModal.jsx` via `useEmployeePinGate()` | avant action `can_*` | employé |
| `SMSRechargeModal` | `components/SMSRechargeModal.jsx` | TabSMS « Recharger » | merchant + Stripe |
| `QuickAddApptModal` | `pages/agenda/modals/AddApptModal.jsx` | bouton `+` agenda Jour | merchant |
| `ApptActionModal` | `pages/agenda/modals/ApptModal.jsx` | clic RDV, deep-link `?appt=` | merchant |
| `ServiceModal` | `pages/agenda/modals/ServiceModal.jsx` | édition prestation agenda | merchant |
| `CancelApptModal` | `pages/booking/my-appointments/modals/...` | action Annuler RDV client | client |
| `TooLateModal` | idem | `cancellation_policy_hours` dépassé | client |
| `ChangeEmailModal`, `ChangePwdModal`, `DeleteAccountModal` | `pages/booking/my-appointments/modals/...` | ProfileTab client | client |
| `CatFormModal` / `SvcFormModal` | `pages/settings/categories/modals/` | CaisseCategories | merchant + PIN admin |

---

## 8. Mapping 13 onglets Settings → 4 pages Réglages (commit 4)

**Source actuelle :** `frontend/src/pages/Settings.jsx` lignes 83-96 (TABS) et lignes 29-48 (URL_TO_TAB).

| # | Tab Settings actuel | URL actuelle | Fichier actuel | → Destination commit 4 |
|---|---|---|---|---|
| 1 | `stats` | `/settings` et `/settings/stats` et `/settings/ventes` | `settings/TabStats.jsx` | **Page Statistiques** (commit 6) — `/statistiques/performance` |
| 2 | `transactions` (Historique) | `/settings/historique` | `settings/TabHistorique.jsx` | **Page Caisse** (commit 7) — `/caisse/historique` |
| 3 | `agenda` | `/settings/agenda` | wrapper → `pages/Agenda.jsx` | déjà exposé via `/agenda`, **retirer de Settings** |
| 4 | `employees` (Équipe) | `/settings/equipe`, `/settings/absences`, `/settings/commissions`, `/settings/horaires` | `settings/TabEquipe.jsx` → `settings/equipe/tabs/{TabEmployees, TabHorairesEmployes, TabAbsences, TabCommissions}.jsx` | **Réglages > Équipe** — `/reglages/equipe/{membres, horaires, timeslots, commissions, absences, securite}` |
| 5 | `categories` (3 sous-onglets caisse/booking/config) | `/settings/categories`, `/settings/categories/booking`, `/settings/categories/config` | `settings/TabCategories.jsx` → `settings/categories/{index, components/CaisseCategories, components/BookingServices}` + `TabImages` + `TabBookingConfig` + `MerchantInfoCard` | **éclatement 3 destinations :** sous-onglet Caisse → `/reglages/caisse-config/categories` ; Site booking → `/reglages/reservations/{prestations, categories-booking}` ; Config (Merchant+Images+BookingConfig) → `/reglages/mon-commerce/{informations, photos}` + `/reglages/reservations/configuration` |
| 6 | `marketing` (4 sous-onglets fidelite/promotions/solde/ia) | `/settings/marketing/*` | `settings/TabMarketing.jsx` → `settings/marketing/{fidelite, promotions, solde, ia}/` | **Page Marketing** (commit 5) — `/marketing/{fidelite, promotions, sms, ia}` |
| 7 | `clients` | `/settings/clients` | `settings/TabClients.jsx` (alias/lien) | **Page Clients** (commit 8) — déjà sur `/clients`, **retirer de Settings** |
| 8 | `notifications` | `/settings/notifications` | `settings/TabNotifs.jsx` | **Réglages > Réservations** — `/reglages/reservations/notifications` |
| 9 | `export` | `/settings/export` | `settings/TabExport.jsx` | **Page Statistiques** (commit 6) — `/statistiques/export` |
| 10 | `forecast` (Prévisions) | `/settings/previsions` | `settings/TabPrevisions.jsx` | **Page Statistiques** (commit 6) — `/statistiques/forecast` |
| 11 | `heatmap` (Heures) | `/settings/heures` | `settings/TabHeures.jsx` | **Page Statistiques** (commit 6) — `/statistiques/heatmap` |
| 12 | `account` (Compte) | `/settings/compte` | `settings/TabCompte.jsx` | **Réglages > Mon commerce** — `/reglages/mon-commerce/compte` |
| 13 | (NOUVEAU) | — | — | **Réglages > Équipe > Sécurité** — `/reglages/equipe/securite` (mode tablette + session + lock, commit 11) |

**Sous-composants horaires commerce** : actuellement non listé comme tab séparé mais géré via `business_hours` + `business_breaks` dans `TabBookingConfig`. → à extraire en `/reglages/mon-commerce/horaires` (commit 4).

**Redirects legacy à prévoir au commit 4** : chaque entrée ci-dessus doit poser un `<Navigate to=... replace/>` pour que les URL existantes ne cassent pas. Garder `URL_TO_TAB` actif pendant 1-2 commits avec banner « Utilisez /reglages ».

---

## 9. Cron worker 1 — emplacements précis

Tous dans `backend/src/index.js` (fonction `startCron()` lignes 572-629), gardés par `isWorker1 = !cluster.worker || cluster.worker.id === 1` (ligne 797).

| Tâche | Intervalle | Plage horaire | Fonction |
|---|---|---|---|
| Rappels RDV (24h + 2h) | 60 s | 7-20 | `runRdvReminders()` |
| Rappels shift employés | 60 s | 7-20 | `runEmployeeReminders()` |
| Daily recaps | 5 min | = `daily_recap_time` | `runDailyRecaps()` |
| Queue emails campagnes | 60 min | — | `processCampaignQueue()` — 30 lignes/pass, throttle 500 ms, quota Brevo 300/j |
| Queue SMS | 30 min | 9-20 | `processSmsQueue()` — 50 lignes/pass, throttle 200 ms, refund auto |
| Rappels RDV email | 60 min | 7-20 | `processAppointmentReminders()` |
| Transaction cleanup | 2 h | — | UPDATE sms_transactions → expired si > 2h pending |
| Birthday promos | 60 min | guard 09:00 | `runBirthdayPromos()` — anti-fraude rolling 330j |

---

## 10. Points de risque — zones intouchables

| Zone | Fichier / commit référence | Règle |
|---|---|---|
| **OAuth Google merchant** | `routes/auth.js` → `/api/auth/google/merchant/callback` — commit c73c4cf | Aucune modification sans validation explicite |
| **OAuth Google client global** | `routes/global-clients/` → `/api/auth/google/callback` | idem |
| **Webhook Stripe SMS** | `routes/payments.js` → `/api/payments/sms/webhook` ; mount raw-body dans `index.js:125` | Idempotency `UNIQUE(sumup_checkout_id)`, ne jamais réordonner le mount |
| **PaymentIntent Stripe** | `routes/payments.js` + `SMSRechargeModal.jsx` | 3 modes (nouvelle carte + save / off_session / automatic), ne pas simplifier |
| **JWT scopes (5)** | `middleware/auth.js` — `NON_MERCHANT_SCOPES` + `routes/auth.js` signatures | Ne jamais mélanger merchant / pin_session / employee_pin_session / client / global_client |
| **PIN admin middleware** | `middleware/pinAdmin.js` | Vérifie `userId === req.user.userId`, ne pas affaiblir |
| **PIN employé lockout DB** | `routes/employee-pins.js` + `employee_pins.failed_attempts/locked_until` + `employeePinVerifyLimiter` | 5 tentatives + 30 min lockout |
| **Idempotency transactions** | `routes/transactions.js` + `uq_tx_idempotency` (db/index.js:369) | UUID par transaction, double-clic = même UUID |
| **Audit trail** | `transaction_audit_log` avec snapshot_before/after JSONB | Toute écriture tx insère une ligne |
| **Caps métier fidélité** | `utils/loyalty-utils.js` + `routes/loyalty.js` | 100 tampons / 100 % / 500 € / 100 pts/€ / 3650 j / 10 000 € |
| **Caps parrainage** | `routes/referrals.js` | percent ≤ 100 / fixed ≤ 500 / limit ≤ 10 000 |
| **Anti-fraude anniversaire** | `client_rewards` UNIQUE(user_id, client_email, reward_type, année) + `client_accounts.last_birthday_reward_at` + rolling 330 j | Ne pas passer en calendaire |
| **Quota Brevo** | `email_global_daily` atomique `ON CONFLICT` | 300/j global cluster-safe, jamais downgrade |
| **CSP frame-src** | `frontend/vercel.json` | Stripe + Google OAuth + www.google.com + maps.google.com, commit 871533d |
| **Apostrophes JSX** | tous fichiers `.jsx` | double-quote obligatoire (`{"l'offre"}`) — règle 7 `regles-absolues.md` |
| **Cron worker 1 only** | `backend/src/index.js:797-799` | `isWorker1` guard obligatoire sur toute nouvelle tâche planifiée |
| **RGPD anonymisation** | `routes/global-clients.js` → DELETE /me | SET email/name = NULL, jamais DROP COLUMN ni DELETE cascade destructif |

---

## 11. Rate limiters (10)

Déclarés dans `backend/src/index.js` lignes 131-198.

| Limiter | Fenêtre / Max | Portée |
|---|---|---|
| `authLimiter` | 2 min / 20 | `/api/auth` (hors register/login) |
| `registerLimiter` | 10 min / 5 | `/api/auth/register` + global-clients register/forgot/reset |
| `loginLimiter` | 5 min / 10 | `/api/auth/login` + global-clients login |
| `notifLimiter` | 1 min / 60 | `/api/notifications` |
| `statsLimiter` | 1 min / 60 | `/api/stats` (cache fort) |
| `apiLimiter` | 1 min / 300 | API générale |
| `pubLimiter` | 1 min / 600 | `/api/pub/:slug/*` |
| `quickRegisterLimiter` | 15 min / 30 | `/api/pub/:slug/client/quick-register` |
| `paymentsIntentLimiter` | 15 min / 15 | `/api/payments/sms/intent` + checkout |
| `employeePinVerifyLimiter` | 5 min / 5 | `/api/employee-pins/:id/verify` (+ lockout DB) |

---

## 12. localStorage / sessionStorage

| Clé | Type | Rôle |
|---|---|---|
| `ff_token` | localStorage | JWT merchant (7 j) |
| `ff_pin_token` | localStorage | JWT scope pin_session (2 h) |
| `ff_client_token` + `ff_client_info` | localStorage | JWT scope client |
| `ff_oauth_merchant` | localStorage transitoire | handoff popup OAuth |
| `ff_theme` | localStorage | clair/sombre |
| `ff_booking_theme` | localStorage | thème côté public |
| `ff_booking_ref_<slug>` | localStorage | code parrainage persisté par slug |
| `ff_agenda_view_mode` | localStorage | whitelist day/week/month/list |
| `ff_emp_pin_<empId>` | sessionStorage | TTL 5 min session employé |

---

## 13. Checklist pré-commit 1

Avant de lancer le commit 1 (migrations SQL), **vérifier** :
- [ ] Branche = `refonte-archi-v3` (`git status`)
- [ ] `docs/refronte/CARTOGRAPHIE.md` relu par l'utilisateur et validé
- [ ] Backup BDD dev Supabase (dump via interface)
- [ ] Les 6 permissions `can_*` et 2 `show_*` déjà partiellement présentes sur `employees` — ne rajouter que celles manquantes (`ADD COLUMN IF NOT EXISTS`)
- [ ] `user_settings` n'existe pas encore (grep confirme)
- [ ] `transactions.signed_by_employee_id` n'existe pas encore

---

## 14. Code mort / doublons repérés

À signaler sans supprimer (règle 7) :
- `frontend/src/components/UI.jsx.orig` — fichier `.orig` de merge ancien, candidat suppression au commit 14 si confirmé inutilisé.
- `frontend/src/pages/Agenda.jsx` — 2 lignes, wrapper qui pourrait être retiré quand `/agenda` sera nettoyé au commit 10.
- `frontend/src/pages/settings/agenda` → pas de fichier, URL_TO_TAB mappe `agenda` mais aucun handler dédié depuis le split.

---

## 15. Synthèse pour la suite

- **Commit 1** touche uniquement `backend/src/db/index.js` (fin du script). Ajoute 3 blocs SQL idempotents + seed `user_settings`.
- **Commit 2** ajoute 2 routes (`GET/PUT /api/user-settings`) et étend `GET/PUT /api/employees[:id]`. Côté front : `userSettingsApi` dans `utils/api.js`.
- **Commit 3** touche `App.jsx` (sidebar + routing) et crée `components/Icon.jsx`. 7 redirects depuis `/settings?tab=*` vers placeholders temporaires.
- **Commit 4** — le plus risqué — crée `pages/reglages/` selon §8 ci-dessus. Garder `URL_TO_TAB` pendant 1-2 commits + banner.
- **Commits 5-9** migrent un domaine fonctionnel à la fois (Marketing, Stats, Caisse, Clients, Dashboard).
- **Commits 10-14** = polish FDS-2026 + apostrophes + mode tablette.

Zéro case de `INVENTAIRE-FONCTIONNEL.md` ne doit disparaître à aucun commit. Cocher au fil de l'eau.
