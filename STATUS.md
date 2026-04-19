# FlowIA — STATUS (2026-04-19)

Dernier commit : voir `git log -1`. Historique complet des sessions précédentes
dans `git log` (le fichier a été réinitialisé).

---

## 🆕 Session 2026-04-19 (suite 13) : Réservation publique — responsivité mobile complète

### Demande (onboarding.md)
Rendre le site de réservation **parfaitement responsive** sur tous types d'écrans
sans casser aucune fonctionnalité.

### Approche
Plutôt que d'injecter des inline styles avec des `isMobile` partout (risque de
régression desktop, diffs lourds), extension **chirurgicale** de la feuille
`<style>` globale déjà présente dans `BookingPage.jsx` (ligne 748) avec des
règles `@media` ciblées + ajout de `className` aux éléments problématiques.

Breakpoints utilisés : `767px` (mobile+tablet portrait), `480px` (smartphones),
`360px` (très petits écrans type iPhone SE).

### BookingPage.jsx — Feuille styles étendue
Nouvelles règles ajoutées :
- `@media(max-width:767px)` :
  - `.bk-sb` passe en `width:100%`, `position:static`, `padding-top:12px`
    (sidebar full-width au lieu d'être sticky 290px).
  - `.bk-nav-title` ellipsis 160px max (business name long ne déborde plus).
  - `.bk-footer-grid` → 1 colonne + gap réduit 16px.
  - `.bk-iframe` height 180px (au lieu de 240px).
  - `.bk-slots` 2 colonnes (au lieu de 3) pour créneaux.
  - `.bk-grid2` → 1 colonne pour prénom/nom et mois/année.
  - `.bk-share-btns` row-gap 8px (boutons partage parrainage).
  - `.bk-ref-code` font-size 16px + letter-spacing 1px.
  - `.bk-side-logo` 64×64 (au lieu de 80×80).
  - `.bk-emp-grid` 1 colonne (au lieu de auto-fill 200px).
  - `.bk-tabs button` padding + font réduits.
- `@media(max-width:480px)` :
  - `.bk-steps` padding 0 4px (existait déjà).
  - `.bk-slots` gap 8px.
  - `.bk-hours-row` padding 7px 12px (horaires plus compacts).
  - `.bk-nav-pad` padding 0 12px (navbar plus étroite).
- `@media(max-width:360px)` :
  - `.bk-slots` 1 colonne (créneaux pleine largeur).
  - `.bk-share-btns button` flex 1 1 100% (partage full-width).
- `.bk-modal-inner` → `max-height:90vh; overflow-y:auto` (tous les modals).
- `.bk-touch` → `min-height:44px` (utilitaire cible tactile).

### Classes appliquées

#### BookingPage.jsx
- Step 2 grid employés : ajout `bk-emp-grid`.
- Step 4 grid créneaux : ajout `bk-slots` + `minHeight:48` sur les boutons.
- Section adresse iframe : ajout `bk-iframe`.
- Footer "Nous contacter / Bon à savoir" : ajout `bk-footer-grid`.

#### booking/NavBar.jsx
- Container NavBar : `bk-nav-pad` (padding réduit mobile).
- Span business name : `bk-nav-title` (ellipsis mobile).

#### booking/SideCard.jsx
- Logo avatar rond : `bk-side-logo` (64×64 mobile).
- Lignes horaires : `bk-hours-row` (padding réduit).

#### booking/Account.jsx
- Grid prénom/nom (x2) + grid mois/année + grid profil : tous `bk-grid2`.

#### booking/MyAppointments.jsx
- 2 modals (annulation + info commerçant) : ajout `bk-modal-inner` + `maxHeight:90vh; overflowY:auto`.
- Tabs RDV/Fidélité/Profil : `bk-tabs bk-nav-pad`.

#### booking/ReferralPage.jsx
- Code parrainage monospace : `bk-ref-code`.
- Boutons partage SMS/WhatsApp/lien : `bk-share-btns`.

### Build
- `npx vite build` : OK (11.78s, 87 modules). `page-booking` +1.77 kB pour
  la feuille de styles étendue et les classNames.

### Compatibilité préservée
- Zéro modification de logique métier ou de handlers.
- Aucune prop supplémentaire, aucun import `useMediaQuery`/`useWindowSize`.
- Les styles desktop existants sont conservés (les `@media` ne s'activent que
  sous le breakpoint).
- Les classes existantes (`bk-do`, `bk-mo`, `bk-steps`, `bk-2c`, `bk-sb`,
  `rp-grid3`, `rp-code-row`) continuent de fonctionner normalement.
- Les modals restent visibles et fonctionnels desktop ; seul ajout mobile =
  scroll interne si le contenu dépasse 90vh.
- Les breakpoints progressifs (767 → 480 → 360) évitent les sauts brusques.

### Test visuel recommandé
- iPhone SE (375×667), iPhone 14 (390×844), Galaxy S21 (360×800).
- Pixel 4 (411×869), iPad Mini portrait (768×1024, reste desktop).
- Rotation portrait/paysage : sidebar passe order:-1 en portrait, flex desktop
  en paysage large (>767px).

---

## Session 2026-04-19 (suite 12) : Parrainage — fix réduction filleul + traçabilité agenda + refus caisse

### Demande (onboarding.md)
Programme parrainage cassé. Fix complet à faire :
1. Parcours utilisateur + validation parrainages + suivi côté client
2. Réduction prix sur site de réservation ET en caisse
3. Traçabilité agenda : « ce client est parrainé par … · réduction parrainage -…€ »
4. Possibilité pour l'employé d'annuler un parrainage à la caisse
5. Accréditer le parrain et voir cela sur sa page parrainage
6. Tous côtés : commerçant, site de réservation, client

### Bugs identifiés avant correction
- **BUG 1 (CRITIQUE)** : La réduction filleul n'était **jamais appliquée** au RDV.
  Le code acceptait `referral_code` mais créait seulement `referral_uses` status=pending,
  sans jamais modifier `discount_amount`/`total_amount`. Le filleul pensait bénéficier
  d'une réduction mais payait plein prix.
- **BUG 2** : Aucun affichage « Parrainé par X » sur l'agenda commerçant/employé.
  Impossible de savoir en un coup d'œil qu'un RDV est issu d'un parrainage.
- **BUG 4** : Aucun bouton « Refuser » en caisse. L'employé pouvait seulement valider.
  Si parrainage suspect (ex : filleul déjà connu), seule option = ignorer → reste « pending ».

### Backend — `routes/public-booking.js` (POST /:slug/book)
- **Bloc parrainage déplacé AVANT l'INSERT appointment** (nouveau bloc lignes ~711-781).
  Le bloc ancien (après INSERT, lignes ~846-922) est remplacé par un simple INSERT
  `referral_uses` qui utilise le contexte `referralCtx` calculé en amont.
- Ajout var `let referralCtx = null` à côté de `discountAmt`/`finalPrice` pour
  remonter le contexte sans dupliquer la requête code parrainage.
- Nouveau bloc : vérifie `!promoCodeId && incomingRef && client_email` (priorité au
  code promo classique si les deux sont fournis).
- Vérifie programme actif + code valide + parrain ≠ filleul + filleul nouveau
  (pas de RDV antérieur) + pas de parrainage pending/validated existant + quota
  parrain OK (réutilise la logique `limit_period`/`limit_count`).
- Si tout OK : calcule la réduction filleul (`percent` ou `fixed` depuis
  `referral_programs.filleul_type`/`filleul_value`) et l'applique à `discountAmt`
  + `finalPrice` avant l'INSERT. Le RDV est créé avec les bonnes valeurs
  `original_amount`/`discount_amount`/`total_amount`.
- Après INSERT : `INSERT INTO referral_uses` avec appt.id, status='pending'.
  La validation en caisse reste nécessaire pour émettre la récompense parrain.

### Backend — `routes/referrals.js`
- Nouveau endpoint **POST /api/referrals/uses/:id/cancel** (commerçant) :
  - UPDATE status='pending' → 'cancelled'
  - Aucune récompense émise
  - La réduction filleul déjà appliquée au RDV n'est PAS restituée (le filleul
    garde son prix réduit, le parrain ne reçoit rien). Cohérent avec le fait que
    le filleul est venu.
  - 404 si parrainage introuvable ou déjà traité (validated/cancelled).

### Backend — `routes/booking.js` (listing agenda commerçant + agenda employé)
- GET `/api/booking/appointments` : LEFT JOIN `referral_uses` + `referral_codes`
  + `client_accounts` (parrain). Colonnes exposées :
  `referral_use_id`, `referral_status`, `referral_code`, `referral_parrain_email`,
  `referral_parrain_first_name`, `referral_parrain_last_name`.
- GET `/api/booking/employee-agenda` : mêmes jointures, mêmes colonnes exposées.
- LEFT JOIN → zéro impact sur les RDV sans parrainage (colonnes NULL).

### Frontend — `utils/api.js`
- `referralsApi.cancelUse(id)` : POST `/referrals/uses/:id/cancel`.

### Frontend — `App.jsx` (caisse commerçant)
- Nouvelle fonction `cancelReferral(useId)` : confirme via `window.confirm`,
  appelle `referralsApi.cancelUse`, rafraîchit le contexte.
- Bloc `pendingRefs.map` : ajout d'un **bouton « Refuser »** (rouge, outlined)
  à côté de « Valider ». Même état `refValidating` pour désactiver les deux
  pendant l'appel.

### Frontend — `pages/Agenda.jsx` (modal détail RDV)
- Nouveau bloc **« Parrainage »** rendu conditionnellement si `appt.referral_use_id`
  existe. Affiche :
  - Badge statut coloré (Validé=vert / Refusé=rouge / À valider en caisse=orange).
  - « Parrainé par {prénom nom|email} » en titre.
  - Code parrainage + montant de la réduction si > 0.
- Label du total dynamique : `Total après parrainage` si `referral_use_id` présent,
  sinon `Total après remise` pour les promos classiques (fallback `Total`).

### Frontend — `pages/EmployeeAgenda.jsx` (modal détail côté employé)
- Section « Code promo » devient dynamique : si `referral_use_id`, affiche
  « 🤝 Réduction parrainage » avec le code parrainage au lieu de « 🎉 Code promo ».
- Nouveau bloc « Parrainage » identique à Agenda.jsx (badge statut + parrain + code).

### Parcours utilisateur corrigé (scénarios validés)

**Scénario A — Filleul réserve avec code parrainage valide :**
1. Site réservation : client saisit code `REF-XXXXXX` à l'étape 5.
2. POST `/book` valide le code, applique la réduction filleul au RDV.
3. RDV créé avec `discount_amount` > 0, `total_amount` = prix réduit, + ligne
   `referral_uses` status='pending' liée à appt.id.
4. Email de confirmation envoie déjà `finalPrice`/`discountAmount` (code promo
   existant → non modifié, mais la réduction parrainage n'apparaît pas encore
   dans l'email. Acceptable à la v1, à suivre).

**Scénario B — Commerçant consulte l'agenda :**
- Modal RDV affiche « 🤝 Parrainage · À valider en caisse · Parrainé par X · Code REF-… · Réduction -Y€ ».
- Total affiche prix barré + prix réduit, label « Total après parrainage ».

**Scénario C — Employé encaisse le filleul en caisse :**
- Bloc « Filleul de X — Valider · Refuser » s'affiche dès que l'email client est renseigné.
- Clic « Valider » → code promo parrain généré (PARRAIN-XXXXXX) + client_rewards
  créé pour le parrain + email envoyé au parrain. Le parrainage passe en 'validated'.
- Clic « Refuser » → status='cancelled', aucun code parrain émis. La réduction
  filleul reste acquise (déjà appliquée au RDV).

**Scénario D — Parrain consulte sa page /parrain :**
- Historique filleuls : affiche 4 états (En attente / Validé / Utilisée / Refusé).
  Déjà fonctionnel depuis suite 9 (référence `reward_status`).
- Récompenses disponibles : codes PARRAIN-XXXXXX apparaissent dès validation en caisse.

### Build
- `node --check` × 3 backend : OK
- `npx vite build` : OK (14.82s, 87 modules)

### Compatibilité préservée
- Priorité au `promo_code_id` si présent → les clients qui utilisent un code promo
  classique voient ce code appliqué, pas la réduction parrainage (comportement
  attendu, on ne cumule pas).
- RDV existants sans parrainage : LEFT JOIN renvoie NULL partout → aucun changement
  d'affichage.
- Parrainages déjà `pending` avant cette session : la réduction filleul n'est
  pas rétroactive (RDV existant garde son prix d'origine). Seuls les nouveaux
  RDV bénéficient de la réduction automatique.
- Endpoint `/cancel` rejette les parrainages non-pending → aucun risque de
  casser un parrainage déjà validé.

---

## Session 2026-04-19 (suite 11) : Programme anniversaire — anti-fraude + birth_date optionnelle + popup

### Demande (onboarding.md)
1. Birth_date obligatoire pour bénéficier du programme anniversaire (sinon
   client exclu).
2. Inscription : **phone + mois/année de naissance optionnels**. Popup
   post-1re-inscription pour demander ces champs.
3. Programme anniversaire : **1 seule fois par an** par client.
4. Anti-fraude : si le client a déjà bénéficié puis change sa birth_date,
   il ne doit pas pouvoir recevoir un second cadeau avant son prochain
   anniversaire (année suivante).

### Backend — `db/index.js`
- 2 nouvelles colonnes idempotentes (ADD COLUMN IF NOT EXISTS) :
  - `global_clients.last_birthday_reward_at  TIMESTAMPTZ`
  - `client_accounts.last_birthday_reward_at TIMESTAMPTZ`
- Sert à bloquer un second reward dans les 330 jours même si birth_date change.

### Backend — `index.js` (cron `runBirthdayPromos`)
- Requête des candidats étendue : rejette les clients dont
  `last_birthday_reward_at IS NULL OR last_birthday_reward_at < NOW() -
  INTERVAL '330 days'` (jointure `global_clients` ajoutée pour vérifier
  les deux tables en parallèle).
- Après création du reward : UPDATE `last_birthday_reward_at = NOW()` sur
  `client_accounts` (user_id+email) ET `global_clients` (email).
- Le garde-fou existant `EXTRACT(YEAR FROM created_at) = currentYear` sur
  `client_rewards` reste en place (double protection année calendaire).

### Backend — `routes/public-booking.js`
- POST `/:slug/client/register` : accepte `birth_date` optionnel au format
  `YYYY-MM-DD` ou `YYYY-MM` (→ `YYYY-MM-01`). Saved sur `global_clients` +
  `client_accounts` (INSERT ou ON CONFLICT update via COALESCE).
- PUT `/:slug/client/profile` : accepte `birth_date` optionnel (même format).
  SET dynamique : si le champ n'est pas présent dans le body, pas de modif.
  Si `birth_date === ''` ou `null`, reset à NULL. Sync global_clients.

### Frontend — `pages/booking/Account.jsx`
- `AuthPanel.submit()` : après register/login réussi, appelle
  `onAuth(client, { justRegistered: mode === 'register' })` pour que le
  parent sache si c'est la 1re inscription.
- Nouveau composant `PostRegisterPopup` (overlay modal 3000 z-index) :
  - Champs **Mois** (select 1→12) + **Année** (input 4 chiffres).
  - Champ **Téléphone** optionnel si manquant.
  - Boutons **Plus tard** (skip) / **Enregistrer** (appel updateClientProfile
    avec body `{ birth_date: 'YYYY-MM' }` → backend convertit en YYYY-MM-01).
  - Mention "Sans date de naissance, vous ne participerez pas au programme
    anniversaire." pour informer du trade-off.
  - Validation : si l'un des 2 champs (mois/année) est rempli, l'autre est
    requis ; année entre 1900 et année courante.

### Frontend — `pages/BookingPage.jsx`
- Import `PostRegisterPopup`.
- Nouveau state `showPostRegister`.
- `handleAuth(client, meta)` :
  - Ouvre le popup uniquement si `meta.justRegistered` ET `client.birth_date`
    vide ET aucun flag `ff_post_register_shown_<email>` en localStorage.
  - Flag persistant par email (écrit au premier affichage, même si skip)
    pour ne jamais ré-afficher le popup à ce même client.
- `onAuth={(u, meta) => handleAuth(u, meta)}` propagé dans AuthPanel wrapper +
  `onAuthSuccess` (ReferralPage).
- Overlay rendu via variable locale `postRegOverlay` inclus en Fragment à
  la fin de chaque branche de retour (myAppts / parrain / success / default).

### Anti-fraude — démonstration
Scenario : Marie reçoit un reward le 15/03/2026 (DOB = 15/03).
- Elle change sa DOB en 10/06 le 20/03/2026.
- 10/06/2026 : cron check → `last_birthday_reward_at = 15/03/2026`, NOW() -
  last = 87 jours < 330 → **skip**. Pas de reward.
- 05/03/2027 (prochain vrai anniversaire) : cron → last = 15/03/2026,
  NOW() - last = 355 jours > 330 → reward autorisé.
- Résultat : 1 reward/an garanti, même si le client manipule birth_date.

### Build
- `node --check` × 4 backend : OK
- `npx vite build` : OK (14.22s, 87 modules, page-booking +4.7 kB pour le
  popup + wrapping fragments).

### Compatibilité préservée
- Colonnes ajoutées avec `IF NOT EXISTS` → idempotent.
- `last_birthday_reward_at` NULL pour les clients existants → aucun blocage
  rétroactif (ils bénéficient du prochain anniversaire normalement).
- Route register : `birth_date` ignoré si absent/invalide (pas d'erreur 400).
- Route PUT profile : `birth_date === undefined` = pas de modification (les
  anciens clients qui update sans envoyer ce champ ne perdent pas leur DOB).
- Popup : localStorage flag évite l'affichage répété ; bouton "Plus tard"
  ferme sans sauver (le flag reste écrit, car la 1re occasion de proposer
  la saisie a eu lieu).

---

## Session 2026-04-19 (suite 10) : Fix parrainage — détection client connecté + bloc auth unifié

### Bug rapporté (onboarding.md)
1. Client **authentifié** sur le site du commerçant → la page `/parrain`
   affichait quand même la vue "Non connecté" (Les conditions chez … + Se
   connecter / Créer un compte).
2. Le bloc d'auth non connecté (simple bannière bleue avec 2 boutons) n'était
   pas cohérent avec celui de l'étape 5 `/info` (Déjà un compte ? + 3 boutons
   + Continuer avec Google).

### Cause racine
- `gcConnected={!!localStorage.getItem('ff_gc_token')}` dans `BookingPage.jsx`
  référençait une clé (`ff_gc_token`) qui n'est **jamais écrite** côté front
  (grep confirme : seulement lue, jamais `setItem`).
- Le vrai jeton après login commerçant est `ff_client_token` (scope='client'
  avec `globalClientId`). Résultat : `gcConnected` toujours `false`, vue
  "Non connecté" affichée même pour un client authentifié.
- Les endpoints `/me/referral-code/:slug` et `/me/referral-history/:slug`
  exigeaient `scope='global_client'` → impossible d'y accéder avec le jeton
  commerçant.

### Backend — `routes/global-clients.js`
- Nouveau middleware `clientOrGlobalClientAuth` qui accepte les deux scopes :
  - `scope='global_client'` avec `globalClientId` → `req.globalClient = dec`
  - `scope='client'` avec `globalClientId`        → `req.globalClient = { globalClientId, email }`
- Appliqué à `/me/referral-code/:slug` et `/me/referral-history/:slug`
  (remplace `globalClientAuth`). `globalClientAuth` reste intact pour les
  routes compte plateforme (`/me`, `/appointments`, `/loyalty`, etc.).

### Frontend — `utils/api.js`
- `gcRequest` fait désormais un fallback automatique :
  `token` paramétré → `ff_gc_token` → `ff_client_token`. Permet aux méthodes
  `myReferralCode` / `myReferralHistory` (sans token explicite) de fonctionner
  avec le jeton commerçant.

### Frontend — `BookingPage.jsx`
- `gcConnected={!!clientUser}` (état React réactif, mis à jour par handleAuth
  après login/register/Google OAuth).
- Le useEffect de chargement parrainage accepte `ff_client_token` OU
  `ff_gc_token` comme déclencheur.
- Nouveau prop `onAuthSuccess={handleAuth}` passé à `ReferralPage` → le
  client reste sur /parrain après Google OAuth, le useEffect recharge
  automatiquement code + historique.

### Frontend — `pages/booking/ReferralPage.jsx`
- Import `pubApi` pour le Google OAuth inline.
- Nouveau prop `onAuthSuccess(client)`.
- Bloc "CTA connexion" (bannière bleue) remplacé par un bloc cohérent avec
  `/info` :
  - Titre **"Déjà un compte ? Connectez-vous"** + sous-titre explicatif
  - Grille 2 colonnes : **Se connecter** (accent) / **Créer un compte**
  - Bouton **Continuer avec Google** pleine largeur (popup OAuth → handler
    postMessage → écrit `ff_client_token` + `ff_client_info` → appelle
    `onAuthSuccess(client)` → retour direct sur la vue connectée du parrain).

### Build
- `node --check` backend global-clients.js : OK
- `npx vite build` : OK (12.67s, 87 modules, page-booking stable)

### Compatibilité préservée
- Les clients avec un `ff_gc_token` existant (ancien flow) continuent de
  fonctionner via le fallback dans `gcRequest`.
- Les routes compte plateforme (`/me`, `/appointments`, `/loyalty`)
  continuent à exiger strictement `scope='global_client'`.
- Aucune migration DB nécessaire (pure logique auth/frontend).

---

## Session 2026-04-19 (suite 9) : Page parrainage connectée — statut "Utilisée" + maquette stricte

### Demande (onboarding.md)
Reproduire **exactement** la maquette client connecté de `/parrainage` avec
les **4 statuts filleul** : Validé / Utilisée / En attente / Refusé.

### Backend
- `db/index.js` : nouvelle colonne `client_rewards.referral_use_id UUID` avec
  FK douce vers `referral_uses(id) ON DELETE SET NULL` + index partiel
  `idx_client_rewards_ref_use WHERE referral_use_id IS NOT NULL`. Migration
  idempotente.
- `routes/referrals.js validate` : INSERT client_rewards passe maintenant
  `use.id` dans `referral_use_id` → lien direct entre le filleul validé
  et la récompense parrain émise.
- `routes/global-clients.js` GET `/me/referral-history/:slug` : LEFT JOIN
  sur `client_rewards` via `referral_use_id`. Chaque ligne `history`
  expose désormais `reward_status` ('available'|'used'|null) et
  `reward_used_at`.

### Frontend — `pages/booking/ReferralPage.jsx`
- **Helper `filleulVisualState(h)`** : retourne `validated|used|pending|cancelled`.
  - `validated + reward_status='used'`  → "used"      → badge gris + montant barré
  - `validated + reward_status='available'` → "validated" → badge vert + +montant
  - `pending`   → "pending"  → badge orange + tiret
  - `cancelled` → "cancelled" → badge rouge anonymisé
- `renderFilleulStatus()` retravaillé : 4 branches, surface neutre `neutralBg`
  pour le badge "Utilisée".
- `filleulAvatarColor()` : la pastille reste verte pour "used" (contexte
  positif : parrainage validé qui a porté ses fruits).
- `filleulSubtitle()` : pending affiche "RDV prévu le …" (cohérent maquette).
- Filtre rewards harmonisé : `reward_type IN ('referral', 'referral_parrain')`
  pour compat legacy (la route validate insère 'referral_parrain').

### Build
- `node --check` × 3 backend : OK
- `npx vite build` : OK (14.84s, 87 modules, page-booking +0.5 kB)

### Préservation
- Anciennes lignes `client_rewards` sans `referral_use_id` restent affichées
  comme "Validé" (LEFT JOIN renvoie NULL → tombe dans le cas par défaut).
- Aucune migration de données nécessaire ; les futures validations utilisent
  la nouvelle colonne automatiquement.

---

## 🆕 Session 2026-04-19 (suite 8) : Page Fidélité unifiée + limite anti-abus parrainage

### Demande (onboarding.md)
1. Fusionner `/settings/marketing/parrainage` et `/anniversaire` dans une
   seule page `/fidelite` avec des **accordéons fermés par défaut**.
2. Ajouter une limite de parrainages par client : 1 fois à vie, X fois par
   mois, X fois sur 3 mois, X fois par an, illimité.
3. Bien distinguer **montant fixe** vs **pourcentage** indépendamment pour
   parrain et filleul (déjà géré, validé).
4. Ne rien casser, éviter la duplication, logique claire parrain/filleul.

### Backend
- `db/index.js` : 2 nouvelles colonnes sur `referral_programs` :
  - `limit_count` INT (NULL = illimité ; 1 forcé pour 'lifetime')
  - `limit_period` VARCHAR(16) DEFAULT 'unlimited'
    (valeurs : `unlimited` | `lifetime` | `month` | `3months` | `year`)
  - Migration idempotente via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `routes/referrals.js` GET+PUT `/program` : expose et persiste les 2 nouveaux
  champs. Validation : `limit_period` whitelisté, `limit_count` ≥ 1, et
  forcé à 1 si période = 'lifetime'.
- `routes/global-clients.js` GET `/pub/:slug/referral-program` : ajoute
  `limit_count` + `limit_period` dans la réponse publique.
- `routes/public-booking.js` POST `/:slug/book` : **garde anti-abus**.
  Avant de créer une ligne `referral_uses`, on compte les parrainages
  pending+validated du parrain sur la fenêtre concernée :
  - `lifetime`  → COUNT total
  - `month`     → `created_at >= date_trunc('month', NOW())`
  - `3months`   → `created_at >= NOW() - INTERVAL '90 days'`
  - `year`      → `created_at >= date_trunc('year', NOW())`
  Si compteur ≥ `limit_count` → on n'insère pas `referral_uses` (silencieux,
  le RDV passe quand même).

### Frontend — `pages/settings/TabMarketing.jsx`
- **Onglets nettoyés** : suppression de `🎂 Anniv.` et `🤝 Parrain.` séparés.
  La nav top a maintenant `💎 Fidelite | % Promos | Solde | ✨ IA`.
- **Nouveau composant `TabFidelite`** : 3 accordéons fermés par défaut :
  1. 💎 Programme de fidélité (tampons / points) — wraps `<TabLoyalty>`
  2. 🎂 Offres anniversaire — wraps `<TabBirthday>`
  3. 🤝 Programme de parrainage — wraps `<TabReferral>`
  Chaque accordéon est un sous-composant `<FideliteAccordion>` réutilisable.
- **Redirection legacy** : un `useEffect` détecte les URLs
  `/settings/marketing/anniversaire` et `/parrainage` et redirige
  silencieusement vers `/fidelite` (pas de 404 sur les anciens liens).
- **`TabReferral`** : nouvelle section "Limite par parrain" avec sélecteur
  période (illimité / 1× à vie / X par mois / X sur 3 mois / X par an) +
  champ nombre conditionnel (caché si Illimité ou À vie).

### Frontend — `pages/booking/ReferralPage.jsx`
- **Maquette 1 (non connecté)** : section Conditions affiche désormais le
  vrai libellé de la limite via `limitPeriodLabel(refProgram)` au lieu de
  l'ancien fallback `monthly_limit`.
- **Maquette 2 (connecté)** : bandeau quota orange recalculé en fonction de
  `limit_period` :
  - `lifetime` → "à vie", pas de date de recharge
  - `month`    → "ce mois-ci", recharge fin de mois
  - `3months`  → "sur 3 mois", recharge dans 90j
  - `year`     → "cette année", recharge 31 décembre
  Calcul local : compte les `pending`+`validated` de `refMyHistory` sur la
  fenêtre courante côté client (cohérent avec la garde backend).

### Build
- `node --check` backend × 4 : OK
- `npx vite build` : OK (13.30s, 87 modules, page-settings +2.5 kB pour
  TabFidelite + UI limite, page-booking +0.8 kB pour le calcul quota
  multi-période)

### Compatibilité préservée
- Anciens parrainages déjà créés : `limit_period` = 'unlimited' par défaut,
  donc aucun blocage rétroactif.
- URLs `/settings/marketing/anniversaire` et `/parrainage` redirigent vers
  `/fidelite` (pas de bookmark cassé).
- Logique paiement caisse / stats / commissions : inchangée (la limite
  n'affecte que l'INSERT dans `referral_uses`, le RDV est toujours créé).

---

## 🆕 Session 2026-04-19 (suite 7) : Fix route /parrain manquante + rename bouton

### Bug
Quand l'utilisateur cliquait sur « Parrainer un ami » (nav ou bouton mobile),
la page semblait clignoter puis redirigeait vers `/book/<commerçant>`.

### Cause
La route `/book/:slug/parrain` **n'était pas déclarée** dans `index.jsx`.
- React Router tombait dans le catch-all `<Route path="/*" element={<RootSwitch/>}>`.
- Sur le domaine commerçant : `<App />` se montait à la place (puis redirigeait).
- Sur le domaine booking public : `<Navigate to="/book/<slug>" replace />` →
  retour à l'accueil.

`navigate('/book/${slug}/parrain')` changeait bien l'URL et `setView('parrain')`
le state local, mais le routeur démontait `BookingPage` au profit du catch-all
→ effet « page qui clignote puis redirige ».

### Fix — `frontend/src/index.jsx`
Ajout de la route manquante :
```jsx
<Route path="/book/:slug/parrain" element={<BookingPageWrapper />} />
```

### Renommage du bouton (demande utilisateur)
- NavBar desktop (`pages/booking/NavBar.jsx`) :
  « Parrainer un ami » → **« Programme parrainage »**
- Bouton mobile bk-mo (`pages/BookingPage.jsx`) :
  « 🤝 Parrainer un ami » → **« 🤝 Programme parrainage »**
- `whiteSpace:'nowrap'` ajouté sur les boutons de nav pour garantir l'affichage
  sur une seule ligne (évite les retours à la ligne sur écrans étroits).

### Build
- `npx vite build` : OK (22.17s, 87 modules)
