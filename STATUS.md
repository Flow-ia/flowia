# FlowIA — STATUS

Dernier commit : voir `git log -1`.
Historique complet des sessions passées : `STATUS-archive.md`.

---

## État actuel (2026-04-23)

**Fix 3 bugs prod — PIN admin manquant, Cloudinary local fallback, URL publique
sous-domaine commercant.** — Trois correctifs chirurgicaux :

1. **403 Forbidden sur PUT `/loyalty/program`, `/referrals/program`,
   `/birthday-campaign`** — Ces 3 routes sont gardées côté backend par
   `pinAdminMiddleware` (audit W/X/AA) mais `loyaltyApi.saveProgram`,
   `birthdayApi.update` et `referralsApi.updateProgram` appelaient
   `request()` qui n'envoie pas le header `x-pin-session`. Switch sur
   `adminRequest()` qui joint automatiquement le token PIN présent en
   `localStorage.ff_pin_token` (déjà en place dès que le commerçant a
   déverrouillé via `PinEntry` au boot). Les 3 activations/désactivations
   passent maintenant à 200. Fichier : `frontend/src/utils/api.js`.

2. **Upload Cloudinary silencieusement fallback `local` en prod** — `media.js`
   lisait `process.env.MEDIA_PROVIDER` et fallbackait sur `'local'` sans
   regarder si les credentials Cloudinary étaient fournis. Sur Render
   (disque éphémère), les images finissaient sur le FS temporaire et
   disparaissaient au redéploy → logos/couvertures/photos employés jamais
   sur Cloudinary, jamais affichés sur les sites clients après restart.
   Ajout de `resolveProvider()` : si `MEDIA_PROVIDER` non défini mais que
   les 3 `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` sont présents → provider
   auto `'cloudinary'`. Log `[MEDIA] provider = …` au boot pour vérifier
   visuellement en prod. Fichier : `backend/src/routes/media.js`.

3. **Lien public `commercant.nomdomaine.fr/book/slug` au lieu de
   `nomdomaine.fr/book/slug`** — Quand l'admin tourne sur le sous-domaine
   privé `commercant.*`, `${window.location.origin}/book/${slug}` produit
   une URL qui renvoie le client sur le dashboard au lieu de la page
   publique. Nouveau helper `frontend/src/utils/publicUrl.js` exportant
   `publicOrigin()` + `bookingUrl(slug)` : respecte `VITE_BOOKING_DOMAIN`
   en priorité, sinon strippe uniquement le premier label `commercant.`
   de `window.location.hostname` (conserve `www.`, `app.`, etc.). Branché
   dans `ConfigTab.jsx` (badge lien actif + copie presse-papier) et
   `settings/QRCard.jsx` (QR inscription rapide). Fichiers :
   `frontend/src/utils/publicUrl.js` (nouveau),
   `frontend/src/pages/agenda/tabs/ConfigTab.jsx`,
   `frontend/src/pages/settings/QRCard.jsx`. Build OK.

## État précédent (2026-04-22)

**Client /client/rdv : statut repositionné au-dessus du prix + FDS-2026**
— Carte RDV de l'onglet "Mes RDV" nettoyée selon la recommandation de
`onboarding.md`. Retrait de la pastille icône 40×40 à droite (croix
rouge / horloge / check / calendrier) qui dupliquait le statut déjà
affiché en haut de carte. Retrait aussi de la pill statut en haut (trop
redondante). Une seule indication de statut désormais, placée **au-dessus
du prix** (pill 11px fontWeight 500 avec bordure `accent33` + bg pastel),
hiérarchie visuelle plus claire.

Carte conformée FDS-2026 : `borderLeft: 2px solid st.color` pour repère
visuel du statut (annulé rouge / passé gris / futur accent), `border`
global 0.5px, `borderRadius: 12` (au lieu de 18 hors tokens), fontWeight
ramenés à 500 max (avant 600 sur commerçant et prix), SVG inline
remplacés par `I.X` (bouton Annuler) et `I.User` (ligne employé). Ref
`#ID` déplacée en bas de la colonne info, très discrète. Bouton Annuler
disparaît simplement pour les RDV non annulables (au lieu d'afficher
une pastille décorative). Fichier : `frontend/src/pages/booking/my-appointments/tabs/AppointmentsTab.jsx`.
Build OK.

## État précédent (2026-04-22)

**Notifications commerçant : FDS-2026 + employé/date/heure en grand** —
Refonte complète de la cloche `NotificationCenter` (App.jsx) et de la
popup `NotifModal` (Dashboard.jsx). Chaque notif s'affiche comme une
carte pastel + `borderLeft: 2px` accent colorée selon le type, pour
distinguer d'un coup d'œil :
- **Nouveau RDV** — palette info indigo (`#eef2ff` + `#6366f1`) +
  icône `I.Calendar`
- **Rappel RDV** — palette warning ambre (`#fffbeb` + `#f59e0b`) +
  icône `I.Clock` + chip "dans X min"
- **Caisse** — palette success vert (`#f0fdf4` + `#10b981`) + icône
  `I.Wallet`

Emojis retirés de l'UI (FDS-2026 rule #6) : icônes Lucide (`I.*`) dans
la pastille carrée à gauche, plus pictogrammes `I.User` / `I.Calendar`
/ `I.Clock` dans la ligne détail. Employé concerné affiché en
**16-18px** fontWeight 500, date lisible ("Aujourd'hui", "Demain",
"lundi 22 avril") en 14-15px, heure en **20-22px** monospace sur
l'accent du type — tout visible d'un seul coup d'œil. Nom client +
prestation en ligne secondaire 12-13px. Chip du type en pill pastel
majuscule avec border `accent33`.

Backend `push.js` enrichit `data` avec `employee_id`, `employee_name`,
`client_name`, `service_name`, `appt_date`, `start_time`,
`minutes_before` — résolution automatique du nom employé via DB si
absent du caller. Title/body in-app sans emoji (emoji conservé
uniquement pour le push lock-screen OS). Cron `notifications.js` :
`LEFT JOIN employees` ajouté au SQL pour livrer `employee_name` sans
requête séparée. Strip emoji fallback côté frontend pour les anciennes
notifs en DB. Fichiers : `backend/src/utils/push.js`,
`backend/src/routes/notifications.js`, `frontend/src/App.jsx`
(NotificationCenter + NotifCard), `frontend/src/pages/Dashboard.jsx`
(NotifModal). Build OK.

## État précédent (2026-04-22)

**Agenda employé : URL persistante + popup mutualisée + deep-link
notif** — Onboarding.md points 1/2/4 livrés.

1. **Routes paramétrées** : vue employé seul n'est plus en state local
   (`selectedEmp`/`view`). Nouvelles routes dans `App.jsx` :
   - `/agenda` (inchangé) → `MultiColumnAgenda`
   - `/agenda/views` → idem (alias)
   - `/agenda/views/:employeeId` → `EmpAgendaMain` de cet employé
   `EmployeeAgenda` (`pages/employee-agenda/index.jsx`) lit
   `useParams().employeeId` et rend la bonne vue. Clic sur un employé
   dans la vue multi → `navigate('/agenda/views/:id')`. Bouton retour →
   `navigate('/agenda')`. Refresh = état préservé, lien partageable,
   `employeeId` introuvable → redirect propre vers `/agenda`.

2. **Popup « Nouveau RDV » unifiée** : `EmpAgendaMain` utilisait son
   propre `NewApptModal` (plus limité : pas de recherche client, pas de
   prestations groupées). Remplacé par `QuickAddApptModal` (déjà en
   place dans la vue multi), avec nouvelle prop `defaultEmpId` qui
   pré-sélectionne l'employé courant. Plus de duplication. Fichier
   `NewApptModal.jsx` supprimé (code mort).

3. **Deep-link notif `?appt=<id>` branché sur la route active** :
   l'ancien `pages/agenda/index.jsx` qui gérait les params n'est pas
   monté. Logique portée dans `MultiColumnAgenda` et `EmpAgendaMain` :
   lecture de `?date=` + `?appt=` via `useLocation`, bascule vue Jour
   au bon jour/semaine, `pendingApptRef` ouvre le modal détails dès
   que les RDV sont chargés, puis `navigate(pathname, {replace:true})`
   strippe les params. Fonctionne sur `/agenda?date=…&appt=…` (déjà
   produit par le backend) et supporte aussi
   `/agenda/views/:employeeId?appt=…` pour la page employé.

Fichiers : `frontend/src/App.jsx`,
`frontend/src/pages/employee-agenda/index.jsx`,
`frontend/src/pages/employee-agenda/tabs/EmpAgendaMain.jsx`,
`frontend/src/pages/employee-agenda/components/MultiColumnAgenda.jsx`,
`frontend/src/pages/employee-agenda/modals/QuickAddApptModal.jsx`
(ajout `defaultEmpId`),
`frontend/src/pages/employee-agenda/modals/NewApptModal.jsx` (supprimé).
Build OK.

## État actuel (2026-04-22)

**Deep-link notifications popup Dashboard → RDV** — La popup
`NotifModal` du Dashboard (tuile « Notifs ») ouvrait auparavant juste la
liste : clic sur une notif marquait lue et rien d'autre. Alignée avec la
cloche `NotificationCenter` (App.jsx) : clic sur une notif de type
rappel RDV / nouveau RDV ferme la popup et deep-link vers
`/agenda?date=YYYY-MM-DD&appt=<id>` (construit par le backend dans
`push.js` — champ `data.url`). L'agenda bascule en vue Jour au bon
offset et ouvre automatiquement le modal du RDV concerné, avec tous les
détails — plus besoin de chercher manuellement après avoir cliqué la
notif. Même validation `safeInternalPath` (refuse `javascript:`, `data:`,
`//evil`, control chars, backslashes). Fallback `/agenda` si pas d'url
mais `appointment_id` présent. Curseur `pointer` partout (même sur
notifs déjà lues). Fichier : `frontend/src/pages/Dashboard.jsx`
(NotifModal + import `useNavigate`). Build OK.

## État actuel (2026-04-22)

**Fix boucle login commerçant — `.catch` api.me() ne purge plus
aveuglément** — Symptôme : sur `commercant.haircoifflille.fr`,
redirection systématique vers `/login` après authentification, 401 sur
`/api/booking/appointments`. Cause : `useAuth.useEffect` (au mount + dans
`applyMerchantLogin` OAuth) purgeait `ff_token` sur toute erreur du
`api.me()` initial — y compris timeout/500/réseau. Sur cold start Render
(10-15 s), un `/auth/me` lent juste après login → `.catch` → token
supprimé → boucle login. Fix dans `frontend/src/hooks/useAuth.jsx` :
le `.catch` ne nettoie plus que la session PIN si `handleMerchant401` a
déjà confirmé un 401 (token déjà absent). Sur erreur transitoire le
token frais est conservé → la prochaine navigation re-tentera `api.me()`.
En complément, grace period post-login bumpée de 5 s → 15 s dans
`frontend/src/utils/api.js` (couvre cold start Render + propagation).
Onboarding.md résume le bug + fix. Build OK.

## État actuel (2026-04-22)

**Gate auth client sur routes `/client/*`** — Les URLs
`/book/:slug/client/profil`, `/client/rdv`, `/client/passages`
s'affichaient même sans `ff_client_token` → la page montrait la coquille
vide et laissait partir des fetches non-authentifiés (401 silencieux,
contenu vide ou cassé). Ajout d'un gate dans `booking-page/index.jsx` :
au mount, si le path contient `/client/` ET (pas de token OU token
localement expiré via `isJwtLocallyExpired`), purge le token + info
client et redirige sur `/book/:slug/login`. Comportement net : soit
authentifié → page accessible, soit pas → panel login direct.

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
