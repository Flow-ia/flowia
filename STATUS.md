# FlowIA — STATUS

Dernier commit : voir `git log -1`.
Historique complet des sessions passées : `STATUS-archive.md`.

---

## État actuel (2026-04-22)

**Hardening auth merchant — 4 couches défensives** — Renforcement
complet de la chaîne d'auth pour éliminer les 401 parasites en console
et garantir zéro boucle login :
1. **Check local JWT `exp` dans `getToken()`** : `isJwtLocallyExpired()`
   décode le payload JWT sans vérifier la signature (claim `exp` + 10s
   skew). Si expiré localement, on purge et on renvoie null
   immédiatement — évite un round-trip 401 "Token manquant" inutile.
2. **Check local dans `useAuth` au mount** : avant d'appeler `api.me()`,
   même vérif d'expiry. Évite le 401 parasite à l'ouverture de l'app
   avec un vieux token zombie dans le localStorage.
3. **Grace period post-login 5s** (augmentée de 3s → 5s) : couvre le
   temps max d'un cold start Render + propagation React.
4. **Double-check `/auth/me` avant purge** (déjà en place) : évite de
   déconnecter sur un 401 transitoire. Garde anti-concurrence
   `__meCheckInFlight` pour un seul check par burst.
`isJwtLocallyExpired` exporté depuis api.js et consommé par useAuth.
Fichiers : `frontend/src/utils/api.js`, `frontend/src/hooks/useAuth.jsx`.

**Fix boucle login Google commerçant** — Régression du commit précédent
(`436aa06`) : l'intercepteur 401 purgeait le token trop agressivement →
après un login Google OAuth, si UNE requête dans le Promise.all de
chargement initial (categories/employees/transactions) tombait en 401
pour une raison transitoire, tous les autres tokens frais étaient
purgés et l'utilisateur renvoyé immédiatement sur `/login`, boucle
infinie. Fix à 3 niveaux dans `handleMerchant401()` :
1. **Grace period post-login** : `notifyLoginJustHappened()` exporté
   depuis `api.js`, appelé par `useAuth.login()` et
   `applyMerchantLogin()`. Pendant 3s après login, les 401 sont
   ignorés (laisse le temps au nouveau token de se propager).
2. **Double-check via `/auth/me`** : avant de purger sur 401, on
   vérifie si le token est RÉELLEMENT invalide en interrogeant
   `/auth/me`. Si cette route répond 200, c'est un 401 transitoire
   (backend hiccup, latence DB) → on n'y touche pas. Si 401 aussi →
   purge confirmée.
3. **Déduplication concurrence** : garde `__meCheckInFlight` pour
   qu'un burst de 401 parallèles ne déclenche qu'un seul check.
Fichiers : `frontend/src/utils/api.js`, `frontend/src/hooks/useAuth.jsx`.

**Fix 401 silencieux commerçant** — Symptôme observé : clic sur la
cloche notif du dashboard commerçant, rien ne s'affiche, console crache
401 sur `/api/notifications/inapp`, `/api/booking/appointments` et
`/api/employee-pins/:id/status`. Cause : quand le JWT commerçant expire
pendant qu'un onglet reste ouvert, `useAuth` n'est plus rappelé
(seulement au mount), `user` reste défini en state React, mais tous les
`request()` échouent en 401 et les `.catch(()=>{})` swallow l'erreur →
bell/agenda/etc. affichent vide. Fix : ajouté `handleMerchant401(res)`
dans `api.js` (appelé par `request()` et `adminRequest()`) qui purge
`ff_token` + `ff_pin_token`, dispatch `window.dispatchEvent(new
Event('ff-auth-expired'))` (avec garde anti-dispatch multiple pour
requêtes parallèles). `useAuth` écoute l'event et `setUser(null)` →
l'app retombe sur `/login` via les routes d'auth. Comportement propre
quel que soit l'endpoint qui détecte l'expiration en premier. Fichiers :
`frontend/src/utils/api.js`, `frontend/src/hooks/useAuth.jsx`.

**URLs login/register partagées (merchant + client)** — Refresh sur
l'écran d'inscription ou de connexion ne renvoie plus vers login par
défaut. Côté commerçant : `/login`, `/register`, `/forgot-password` sont
désormais des routes explicites ; `App.jsx` monte `<AuthFlow
initialScreen=…>` selon la route, `AuthFlow` synchronise son `screen`
interne avec le prop et push dans l'URL via `useNavigate` quand
l'utilisateur bascule entre écrans routables (login/register/forgot).
Les écrans transitoires (vreg/vreset/newpw) restent en state local (le
code de vérif n'est pas persistant, refresh = retour login acceptable).
Côté client : `/book/:slug/login` et `/book/:slug/register` ajoutées à
`index.jsx`, `booking-page/index.jsx` lit le path au montage pour
initialiser `authInitMode`, `AuthPanel` expose un callback
`onModeChange(m)` que BookingPage relie à `navigate('/book/:slug/login|register', {replace:true})`
quand l'utilisateur tape sur les tabs Se connecter / Créer un compte.
`/book/:slug/auth` legacy préservé (redirige vers login). NavBar et
ParrainView adaptés pour pointer vers `/login` ou `/register`
explicitement selon le bouton. Fichiers : `frontend/components/AuthFlow.jsx`,
`frontend/App.jsx`, `frontend/index.jsx`, `frontend/pages/booking-page/index.jsx`,
`frontend/pages/booking-page/views/ParrainView.jsx`,
`frontend/pages/booking/account/components/AuthPanel.jsx`.

**Deep-link notifications → RDV** — Clic sur une notification (push
lock-screen ou cloche in-app) commerçant : on arrive directement sur
l'agenda au bon jour avec le modal du RDV concerné ouvert, au lieu du
`/agenda` générique. Backend `push.js` (`notifyNewAppointment` et
`notifyAppointmentReminder`) construit `url=/agenda?date=YYYY-MM-DD&appt=<id>`
et l'inclut aussi dans `data` in-app. Frontend `pages/agenda/index.jsx` lit
`?date=` et `?appt=` (effect dépendant de `location.search` pour gérer un
deuxième clic sans remount), bascule en vue Jour au bon offset, puis ouvre
`editAppt` dès que les RDV sont chargés. Params strippés après usage pour
éviter une ré-ouverture au remount suivant. Dans `App.jsx`, le handler de
clic de la cloche (`NotificationCenter`) utilise maintenant `useNavigate`
avec la même validation `safeInternalPath` que le SW. Fichiers touchés :
`backend/src/utils/push.js`, `frontend/src/pages/agenda/index.jsx`,
`frontend/src/App.jsx`.

## État précédent (2026-04-21)

**Fix Google OAuth (commerçant + client)** — 2 bugs cumulés empêchaient la
connexion Google en prod : (1) backend envoyait le postMessage avec
`TARGET = FRONTEND_URL[0]` hardcodé → le navigateur bloquait silencieusement
le message dès que l'opener venait d'un autre sous-domaine allowlisté
(ex: `commercant.haircoifflille.fr` alors que `FRONTEND_URL[0]` =
`haircoifflille.fr`) ; (2) frontend comparait `e.origin !==
window.location.origin`, mais `e.origin` est l'origine de l'émetteur (la
popup servie par le BACKEND), qui ne matche jamais l'origine frontend en
prod → le handler ignorait systématiquement le message, popup fermée sans
connexion. Correctifs : l'opener transmet son `window.location.origin` via
le paramètre `state` OAuth, backend valide contre l'allowlist `FRONTEND_URL`
et l'utilise comme `TARGET`. Côté frontend, `api.oauthPopupOrigin()` retourne
l'origine BACKEND pour la validation `e.origin`. Fallback ajouté : si la
popup ne peut pas `postMessage` (COOP / mobile), backend redirige avec
`?mg_token=…` que `useAuth` capture au mount. Fichiers touchés :
`backend/routes/auth.js`, `backend/routes/public-booking/client-auth.js`,
`frontend/utils/api.js`, `frontend/hooks/useAuth.jsx`,
`frontend/components/AuthFlow.jsx`,
`frontend/pages/booking/account/components/AuthPanel.jsx`,
`frontend/pages/booking-page/steps/Step5Info.jsx`,
`frontend/pages/booking/ReferralPage.jsx`. Le flow nouveau commerçant Google
→ `MerchantOnboarding` pré-rempli (firstName/lastName/email) était déjà
câblé côté App.jsx : il fonctionne désormais que OAuth délivre le token.

**UI EmployeeAgenda redesign Google Calendar** — 3 vues (Jour / Semaine /
Mois) avec navigation libre prev/next, bouton « Aujourd'hui », toggle de
vue façon Google Calendar. Nouveaux composants `WeekView.jsx` et
`MonthView.jsx` dans `employee-agenda/components/`. La vue Jour existante
(colonnes employés) est préservée avec son mini-bar semaine. Cliquer sur
un jour (semaine ou mois) bascule en vue Jour. Build OK.

**PIN employé : re-saisie systématique** — `useEmployeePinGate` ne
réutilise plus la session 5 min. Le modal PIN s'affiche pour CHAQUE action
sensible (stats, encaissement, crédit, remboursement, notes, etc.) et le
token est invalidé après chaque action via `clearToken`. Le backend reste
inchangé (JWT 2h côté serveur, plus envoyé côté client).

**Dashboard & StatsModal** — retrait des cards « Dépenses » et « Transactions »
dans les stats du jour (ne reste que CA total + Prestations). Ajout d'une
tuile « Historique » (PIN-protégée) qui ouvre un modal listant les ventes
du jour ligne par ligne : prestation (× qty) | employé | moyen de paiement
| montant, typographie agrandie. `StatsAccessModal` renommé en
`PinAccessModal` (réutilisable : title + actionLabel).

**Audit backend clôturé** (commits K→AA). Toutes les routes backend ont été
auditées : error hygiene, PIN admin, bounds, normalisation email, IDOR,
whitelists, rate-limiting dédiés, CNIL/RGPD opt-in marketing, security
headers (CSP/HSTS/Referrer-Policy).

**Refactor frontend TERMINÉ** — tous les fichiers >1000 lignes ont été
décomposés :
- ✅ `TabMarketing.jsx` (2553 l) → `settings/marketing/` (`251c624`)
- ✅ `Agenda.jsx` (2386 l) → `agenda/` (`d4346b3`)
- ✅ `EmployeeAgenda.jsx` (2183 l) → `employee-agenda/` (`d8109cf`)
- ✅ `BookingPage.jsx` (2203 l) → `booking-page/` (`a4ac68a`)
- ✅ `MyAppointments.jsx` (1895 l) → `booking/my-appointments/` (`80bc366`)
- ✅ `TabEquipe.jsx` (1290 l) → `Settings/equipe/` (`b928814`)
- ✅ `Account.jsx` (1243 l) → `booking/account/` (`a4a65bc`)
- ✅ `ClientsPage.jsx` (1138 l) → `clients/` (`067fed3`)
- ✅ `TabCategories.jsx` (1095 l) → `Settings/categories/` (`bb79dac`)

Plus aucun fichier frontend > 1000 lignes. Le plus gros restant est
`booking-page/index.jsx` (936 l, orchestrateur inévitable).

**Refactor backend en cours** — décomposition des gros routers :
- ✅ `booking.js` (1337 l) → `routes/booking/` (slug, settings, services,
  appointments, clients, availability, employee-hours, employee-agenda,
  employee-permissions, checkout, breaks, employee-slots) — 32 routes
  préservées, boot OK (`7155540`)
- ✅ `global-clients.js` (1273 l) → `routes/global-clients/` (auth, profile,
  change-credentials, referral, appointments, visits, loyalty, account) —
  22 routes préservées, boot OK (`c340fe1`)

**Reste à décomposer (optionnel, non prioritaire)** :
- `db/index.js` (1221) — schéma SQL inline, refactor sensible
- `campaigns.js` (1140) — router marketing campagnes
- `auth.js` (1011) — router auth merchant

## Bugs / dette non traités

- **Tokens clients en `localStorage`** (audit CRITIQUE) — fix propre =
  cookie HttpOnly côté backend, change majeur, à planifier.
- **`console.error(e)` en clair dev** — Terser drop en prod, dev-only.
- **PII en URL** (`/client/passages/:visitId`) — backend déjà isolé par
  token, risque réel faible.

## Règles persistantes

- Commits sans Co-Authored-By Claude / mention Anthropic.
- Changements chirurgicaux. Auto `git add/commit/push` après chaque fix.
- Lire STATUS.md + CLAUDE.md + `git log` avant toute exploration.
