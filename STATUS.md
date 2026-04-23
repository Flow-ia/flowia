# FlowIA — STATUS

Dernier commit : voir `git log -1`.
Historique complet des sessions passées : `STATUS-archive.md`.

---

## État actuel (2026-04-24)

**Agenda : nouvelle vue Liste par employé + persistance localStorage**
— Ajout d'un 4e mode dans le toggle de `MultiColumnAgenda.jsx`
(Jour / Semaine / Mois / **Liste**). La vue Liste affiche les RDV du
jour en colonnes (une par employé), chaque RDV en ligne verticale
triée par heure — alternative à la grille heures pour les salons à
gros volume.

- **Composant** : nouveau `ListView.jsx` dans `employee-agenda/components/`.
  Carte RDV : heure début/fin monospace à gauche, client/service/durée,
  pill statut pastel + pill `Encaisse`, barre accent 2px à gauche
  (FDS-2026). Clic ouvre `ApptActionModal`.
- **Responsive** : CSS Grid natif `repeat(auto-fit, minmax(240px,
  1fr))` — desktop 5+ colonnes, tablette 2-3 qui wrappent, mobile 1
  colonne empilée. Aucune media query.
- **Persistance** : helper `VIEW_MODE_KEY='ff_agenda_view_mode'` +
  `readSavedView()` avec whitelist `['day','week','month','list']`.
  `useState(readSavedView)` au mount + `useEffect` qui écrit
  localStorage à chaque changement. Choix conservé après F5, nav
  interne, redémarrage navigateur.
- **Integration** : mode `list` partage le scope d'1 jour (`fromDate ==
  toDate`) avec la vue Jour — mêmes API call, même mini-semaine, mêmes
  stats (N RDV · confirmés · encaissés). `navigatePrev/Next` avancent
  d'1 jour. Header title `"Aujourd'hui"` / `"lundi 22 avril…"` comme
  en vue Jour.

Fichiers : `frontend/src/pages/employee-agenda/components/ListView.jsx`
(nouveau), `MultiColumnAgenda.jsx` (import + persistance + branchement).
Build OK (13 s, 252 modules = +1 ListView).

## État précédent (2026-04-24)

**Catégories Caisse+Booking fermées par défaut + hints format/taille
photo + erreurs inline** — UX photos harmonisée :

1. **Catégories repliées par défaut** — `CaisseCategories.jsx` et
   `BookingServices.jsx` auto-ouvraient toutes les catégories via un
   flag `didInitOpen`. Retiré → `openCats` initialisé vide. Nouvelle
   catégorie créée reste auto-ouverte (pour voir l'ajout).

2. **Format + taille max visibles partout** — Libellé `JPG, PNG, WEBP
   ou GIF · 5 Mo max` ajouté sous chaque bloc d'upload (TabImages —
   logo/profil/galerie, EmployeeForm, SvcFormModal). `accept` des
   `<input type="file">` restreint au MIME whitelist (jpeg/png/webp/gif)
   — plus de `image/*` qui laissait passer HEIC/SVG.

3. **Erreurs inline remplacent les toasts** — Format invalide ou
   fichier > 5 Mo → message rouge (11px, fontWeight 500) directement
   sous l'élément concerné + bordure rouge du bloc upload. Les erreurs
   serveur (413/401/403) passent par le même canal.
   - `TabImages.jsx` : state `errors.{logo,profile,cover}` par
     emplacement.
   - `Forms.jsx EmployeeForm` : state `imgErr`. Avant, un fichier non
     conforme était rejeté silencieusement (`return;` nu) → bug UX.
   - `SvcFormModal.jsx` : séparation `err` (nom) / `imgErr` (image).
     L'erreur image s'affiche désormais sous le bloc upload, pas en
     haut du modal.

Fichiers : `frontend/src/pages/settings/categories/components/CaisseCategories.jsx`,
`BookingServices.jsx`, `frontend/src/pages/settings/TabImages.jsx`,
`frontend/src/components/Forms.jsx`,
`frontend/src/pages/settings/categories/modals/SvcFormModal.jsx`. Build
OK (13 s, 251 modules).

## État précédent (2026-04-24)

**Fix 4 bugs onboarding — upload photo employé HTML 500, modif service
vide, stats CA à retirer de /equipe, accordion fermé par défaut** —
Batch de correctifs UI + backend :

1. **Upload photo employé : 500 HTML → "Unexpected token '<'"** —
   Aucun handler d'erreur JSON global pour `/api/*`. Quand multer
   (`LIMIT_FILE_SIZE`, fileFilter rejet) ou tout middleware appelait
   `next(err)`, Express servait une page HTML `<!DOCTYPE>` → frontend
   crashait sur `res.json()`. Ajout dans `backend/src/index.js` d'un
   middleware `(err, req, res, next)` qui n'agit que sur `/api/*` et
   renvoie toujours du JSON `{ error }` avec le bon status (400 pour
   `LIMIT_FILE_SIZE`, 500 par défaut). Côté frontend : nouveau helper
   `mediaApi._uploadImage` tolérant aux réponses non-JSON (lit
   `content-type`, fallback sur message basé sur status 413/401/403).
   Tous les `uploadProfile/Logo/Cover/ServiceImage/EmployeeImage`
   passent par ce helper. Fichiers : `backend/src/index.js`,
   `frontend/src/utils/api.js`.

2. **Modification service : champs vides** — `SvcFormModal` et
   `CatFormModal` initialisaient leurs `useState` avec `init?.name`
   etc. Mais `useState(x)` n'utilise `x` qu'au 1er mount, et ces
   modales restent montées même avec `open=false`. Changer `init`
   (nouveau service → edit service existant) → state inchangé →
   champs vides. Fix : ajout d'un `useEffect([open, init?.id])`
   qui resync tous les champs à chaque ouverture (même pattern qu'
   `EmployeeForm.jsx` qui était déjà correct). Fichiers :
   `frontend/src/pages/settings/categories/modals/SvcFormModal.jsx`,
   `CatFormModal.jsx`.

3. **Stats CA individuelles retirées de /settings/equipe** — La grille
   6 colonnes (CA total, RDV, especes/carte/virement/autre) doublonnait
   le module `/historique` et alourdissait la fiche. Retirée. La prop
   `transactions` est retirée du composant. Fichier :
   `frontend/src/pages/settings/equipe/tabs/TabEmployees.jsx`.

4. **Fiches employés : accordion fermé par défaut** — Chaque fiche
   (visibilité site/caisse + permissions agenda + permissions crédit)
   est désormais repliée au chargement. Clic sur l'en-tête (avatar +
   nom) toggle le contenu avec chevron animé. Les boutons action (PIN,
   edit, trash) gardent leurs clics isolés via `stopPropagation`.
   Fichier : `TabEmployees.jsx`. Build OK (12 s, 251 modules).

## État précédent (2026-04-24)

**Fix map booking bloquée par CSP + DELETE compte client 500** — Deux
correctifs :

1. **Iframe Google Maps bloqué par CSP** — Section Adresse du site de
   réservation : iframe vide, CSP violation `Framing
   'https://maps.google.com/' violates … frame-src`. La CSP déclarée dans
   `frontend/vercel.json` autorisait uniquement Stripe et Google OAuth.
   Ajout de `https://www.google.com https://maps.google.com` à `frame-src`.
   En complément, `Step1Home.jsx` bascule l'embed URL de `maps.google.com`
   vers `www.google.com` (évite le 301 qui fait échouer l'iframe sur
   certains navigateurs mobiles). Fichiers : `frontend/vercel.json`,
   `frontend/src/pages/booking-page/steps/Step1Home.jsx`.

2. **500 sur DELETE /api/global-clients/me (suppression RGPD)** — Le
   handler anonymise `client_credits.client_email=NULL` et
   `client_notes.client_email=NULL`, mais les 2 colonnes étaient créées
   `NOT NULL` → PostgreSQL rejette l'UPDATE dans la transaction → catch
   global → 500. Fix : 2 migrations `ALTER TABLE … ALTER COLUMN
   client_email DROP NOT NULL` ajoutées dans `backend/src/db/index.js`.
   UNIQUE(user_id, client_email) reste valide (PG autorise plusieurs NULL
   dans un unique). Au prochain boot Render, la suppression RGPD passe.
   Fichier : `backend/src/db/index.js`. Build frontend OK (16 s, 251 modules).

## État précédent (2026-04-24)

**Fix 2 bugs onboarding — upload photo employé silencieux + PIN bloque
accès /historique** — Deux correctifs chirurgicaux :

1. **Toast "Modifié" affiché malgré un 500 Cloudinary** — `TabEmployees.jsx`
   (form submit employé) catchait l'erreur d'upload image mais continuait
   le flow → `showToast('Modifié')` s'exécutait derrière, masquant
   complètement l'échec Cloudinary. Le commerçant voyait "Modifié" alors
   que la photo n'arrivait jamais sur Cloudinary. Fix : `catch (e)` capture
   `e.message` (au lieu du "Erreur upload image" générique) pour remonter
   le vrai message backend (format `Erreur upload image : <cause
   Cloudinary>`), et `return` après le toast d'erreur pour stopper le flow
   → plus de faux succès derrière un upload cassé. Même pattern corrigé
   pour la suppression d'image employé et l'upload/erreur service dans
   `BookingServices.jsx`. Fichiers : `frontend/src/pages/settings/equipe/tabs/TabEmployees.jsx`,
   `frontend/src/pages/settings/categories/components/BookingServices.jsx`.

2. **Page `/historique` inaccessible après validation PIN** — Tuile
   "Historique" du Dashboard → modal PIN → saisie correcte → retour
   immédiat sur `/dashboard` au lieu d'afficher la page. Cause :
   `PinAccessModal` appelle `onSuccess()` PUIS `onClose()` en cas de succès
   (Dashboard.jsx:262). Dans `Historique.jsx`, la prop `onClose` était
   `() => { setPinOpen(false); navigate('/dashboard'); }` → navigation
   exécutée même après succès. Fix : ajout d'un `successRef` dans
   `Historique.jsx` posé à `true` dans `onSuccess`. Le `onClose` ne
   redirige vers `/dashboard` que si `!successRef.current` (distinction
   annulation vs validation OK). L'URL dédiée `/historique` était déjà
   routée dans `App.jsx:1862` — accès direct + refresh fonctionnels, gate
   PIN normalement re-demandé au refresh. Fichier :
   `frontend/src/pages/Historique.jsx`. Build OK (22 s, 251 modules).

## État précédent (2026-04-23)

**Page /historique unifiée + fix 4 bugs (media 500, export 403, refresh crédit,
popup export)** — Refonte Stats+Historique et correctifs critiques :

1. **Page `/historique` dédiée (remplace les 2 popups Dashboard)** — Fusion de
   `StatsModal` et `HistoriqueModal` en une seule route `/historique`
   (`frontend/src/pages/Historique.jsx`). Accès gardé par `PinAccessModal`
   (exporté depuis `Dashboard.jsx`) — tant que le PIN n'est pas validé, le
   contenu est masqué et Annuler retourne au Dashboard. Filtre employé en
   tête (défaut "Tous les employés") qui recalcule en direct via `useMemo` :
   CA total, nb prestations, répartition par moyen de paiement (éclate les
   tx `multi` par sous-paiement), liste ligne-par-ligne avec heure, employé,
   moyen de paiement. La tuile Dashboard `TileHistorique` (label "Historique
   & Stats") pointe désormais vers `/historique` et la tuile `TileStats`
   séparée a été retirée (layout simplifié : 2×2 + 1 au lieu de 2×3).

2. **Fix 500 upload employé → Cloudinary** — `POST /api/media/employee/:id/image`
   plantait silencieusement en 500 car `quality:'auto'` + `fetch_format:'auto'`
   étaient passés à `cld.uploader.upload_stream` alors que ce sont des
   paramètres de DELIVERY (pas d'upload — ils requièrent `eager` pour être
   traités à l'upload). Cloudinary renvoyait 400, on catchait en 500 avec
   "Erreur serveur." générique empêchant tout diagnostic UI. Fix :
   - Options upload réduites à `{ folder, resource_type: 'image' }` (idem
     pour `persistUpload` et `uploadToProvider`).
   - Transformation `f_auto,q_auto/` appliquée à la delivery URL dans
     `fetchImageBuffer` (→ même résultat côté CDN, sans risque d'erreur).
   - Tous les `catch` media renvoient désormais le message réel de l'erreur
     (`Erreur upload image : <message Cloudinary>`) — diagnostic immédiat
     côté commerçant (credentials invalides, quota, etc.).
   Fichier : `backend/src/routes/media.js`.

3. **Fix 403 export PDF/CSV** — `exportApi.downloadFile` ne joignait que
   `Authorization`, mais `/export/csv` et `/export/pdf` exigent aussi
   `x-pin-session` (audit export #9). Résultat : 403 → message générique
   "Erreur export" → `alert()` natif bloquant. Fix : `downloadFile` lit
   `ff_pin_token` et l'envoie comme `x-pin-session`; si la réponse n'est
   pas OK, on parse le JSON d'erreur backend pour remonter le vrai message
   (403 devient "Session admin expirée. Déverrouillez avec votre PIN puis
   réessayez."). Côté UI `TabExport.jsx` : nouveau composant `ErrorModal`
   (pastel rouge + borderLeft 2px + bouton OK) remplace `alert()` — FDS-2026.
   Fichiers : `frontend/src/utils/api.js`,
   `frontend/src/pages/settings/TabExport.jsx`.

4. **Refresh Dashboard après remboursement crédit** — Après
   `creditsApi.repay()` (Clients > Crédit > Encaisser remboursement), le
   backend créait la transaction revenue mais le state React local de
   `App.jsx` (`transactions`) n'était jamais mis à jour → Historique du jour
   ne montrait rien jusqu'à F5. Fix : nouvelle fonction `reloadTxs()` dans
   App.jsx qui rafraîchit `transactions` sans toucher catégories/employés +
   event listener `window.addEventListener('ff-tx-refresh')`. Dispatch
   ajouté dans `handleRepayCredit` (`clients/index.jsx`). Bus réutilisable
   par n'importe quel code qui crée une tx hors du flow `addTx`/`updTx`.
   Fichiers : `frontend/src/App.jsx`, `frontend/src/pages/clients/index.jsx`.

Build OK (11 s, 251 modules).

## État précédent (2026-04-23)

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
