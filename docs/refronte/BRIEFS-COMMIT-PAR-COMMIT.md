# Briefs prêts-à-coller · commit par commit

> Chaque bloc ci-dessous est à copier-coller **tel quel** dans Claude Code au moment d'exécuter le commit correspondant. Ne les mélange pas. Un brief = un commit.

---

## BRIEF · COMMIT 0 · Cartographie exhaustive

```
Commit 0 · Cartographie exhaustive. Ne code rien. Produis un document.

1. git status → doit être sur refonte-archi-v3
2. Lis ces fichiers SANS les modifier (liste non exhaustive, explore le repo) :
   - backend/index.js (routes, migrations, cron)
   - backend/routes/*.js si présents
   - src/api.js (toutes les sous-APIs : auth/booking/pub/global/loyalty/promo/referrals/credits/clients/absences/commissions/notif/stats/export/campaigns/payments/media/clientNotes)
   - src/App.jsx
   - src/Dashboard.jsx
   - src/Agenda.jsx, src/pages/employee-agenda/
   - src/Settings.jsx (tous les tabs : Stats, Historique, Employees, Horaires, Absences, Commissions, CaisseCategories, BookingServices, Marketing, Promo, SMS, IA, Notifs, Export, Previsions, Heures, Compte, QR)
   - src/pages/clients/
   - src/pages/booking-page/ (index + steps 1-6 + views)
   - src/pages/booking/ (account, my-appointments, ReferralPage)
   - src/hooks/ (useAuth, useAdmin, useNotifications, useTheme, useEmployeePin)
   - src/utils/ (api, publicUrl)
   - src/components/ (AuthFlow, MerchantOnboarding, PinEntry, PinSetup, PinAccessModal, EmployeePinModal, NotificationCenter, Forms, UI, Button, Card, etc.)

3. Produis `docs/refonte/CARTOGRAPHIE.md` avec les sections :
   - Composants React (chemin + rôle + dépendances)
   - Routes API (méthode, chemin, middleware, filtre user_id)
   - Tables SQL (nom + colonnes + FK)
   - Hooks (signature + état)
   - Modales (nom + trigger + scope)
   - Mapping 13 tabs Settings → 4 cartes Réglages
   - Points de risque (OAuth, Stripe, PIN, webhooks, idempotency)

4. git add docs/refonte/CARTOGRAPHIE.md
5. git commit -m "[commit 0] Cartographie exhaustive du code existant"
6. git push

Puis ARRÊTE-TOI. Résume en 5 lignes max ce que tu as trouvé. Attends mon feu vert.
```

---

## BRIEF · COMMIT 1 · Migrations SQL

```
Commit 1 · Migrations SQL additives idempotentes.

AVANT : backup BDD Supabase dev (je l'ai fait).

AJOUTE ces migrations À LA FIN du script existant (backend/index.js ou backend/migrations.js), ne touche pas à l'ordre existant :

-- 1. Permissions granulaires employés
ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_cancel BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_modify BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_encash BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_use_promo BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_grant_credit BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_repay_credit BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS show_on_booking BOOLEAN DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS show_in_caisse BOOLEAN DEFAULT TRUE;

-- 2. user_settings (mode tablette)
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  tablet_mode_enabled BOOLEAN DEFAULT FALSE,
  employee_session_timeout_min INTEGER DEFAULT 15,
  lock_on_tab_close BOOLEAN DEFAULT TRUE,
  sms_low_balance_threshold DECIMAL DEFAULT 20,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- 3. Audit trail encaissement via PIN employé
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS signed_by_employee_id INTEGER REFERENCES employees(id);

-- 4. Seed initial
INSERT INTO user_settings (user_id) SELECT id FROM users ON CONFLICT (user_id) DO NOTHING;

INTERDIT : DROP, RENAME, TRUNCATE, DELETE FROM sans user_id.

Redémarre le backend dev. Vérifie dans Supabase :
- Les colonnes existent sur employees et transactions
- La table user_settings existe avec une ligne par utilisateur

git add . && git commit -m "[commit 1] Migrations SQL permissions employés et user_settings" && git push

Arrête-toi. Confirme ce qui est en base.
```

---

## BRIEF · COMMIT 2 · Routes API user-settings

```
Commit 2 · Routes API user-settings + permissions employés étendues.

1. Backend : crée `backend/routes/user-settings.js` (ou dans index.js au plus simple) :
   - GET /api/user-settings → authMiddleware, filtre user_id, retourne la ligne user_settings
   - PUT /api/user-settings → authMiddleware + pinAdminMiddleware, update user_settings (filtre user_id)

2. Backend : étends GET /api/employees pour inclure TOUTES les permissions dans le SELECT (can_cancel, can_modify, can_encash, can_use_promo, can_grant_credit, can_repay_credit, show_on_booking, show_in_caisse).

3. Backend : étends PUT /api/employees/:id pour accepter tous ces flags (avec pinAdminMiddleware).

4. Frontend : ajoute `userSettingsApi` dans src/api.js :
```js
export const userSettingsApi = {
  get: () => request('/user-settings'),
  update: (body) => adminRequest('/user-settings', { method: 'PUT', body: JSON.stringify(body) }),
};
```

5. Test manuel : GET puis PUT avec un header x-pin-session valide. Vérifie que la réponse renvoie bien les valeurs mises à jour.

6. git add . && git commit -m "[commit 2] Routes API user-settings et permissions employés étendues" && git push

Arrête-toi.
```

---

## BRIEF · COMMIT 3 · Sidebar 7 items

```
Commit 3 · Refonte sidebar en 7 items / 3 sections.

Référence : docs/refonte/maquettes/08-sidebar-navigation.html

1. Crée src/components/Icon.jsx avec SVG Lucide inline (copier depuis docs/refonte/maquettes/icons.js).

2. Modifie src/App.jsx (ou src/components/DesktopSidebar.jsx si présent) :

Structure :
- Header : logo + nom salon
- Section "PRINCIPAL" : Dashboard · Agenda · Caisse · Clients
- Section "CROISSANCE" : Marketing · Statistiques
- Section "PARAMÉTRAGE" : Réglages
- Footer : Toggle dark/light + Déconnexion

Labels sections : font-size:10px, text-transform:uppercase, letter-spacing:0.05em, color:#9ca3af

3. Routing React (redirects temporaires pour ne pas casser l'app) :
   - /dashboard → page existante
   - /agenda → page existante
   - /caisse → redirige vers /settings?tab=transactions (temporaire)
   - /clients → existant
   - /marketing → redirige /settings?tab=marketing
   - /statistiques → redirige /settings?tab=stats
   - /reglages → redirige /settings

4. Mobile bottom nav 5 items : Home, Agenda, Caisse, Clients, Plus. Menu "Plus" avec Marketing / Stats / Réglages / Dark / Déconnexion.

5. Test : clique chaque item, vérifie que rien ne casse. Mode dark toujours fonctionnel.

6. git add . && git commit -m "[commit 3] Refonte sidebar 7 items en 3 sections + routing" && git push

Arrête-toi.
```

---

## BRIEF · COMMIT 4 · Éclatement Settings

```
Commit 4 · CRITIQUE. Éclate Settings.jsx (13 tabs) en 4 pages Réglages.

Référence : docs/refonte/maquettes/07-reglages.html

git branch backup-avant-commit-4

Crée cette structure EXACTE :

src/pages/reglages/
├── index.jsx                    # 4 cartes accueil
├── mon-commerce/
│   ├── index.jsx                # sous-tabs
│   ├── Informations.jsx         # ex-TabInfos (MerchantInfoCard)
│   ├── Horaires.jsx             # ex-TabHorairesCommerce (business_hours + breaks)
│   ├── Photos.jsx               # ex-TabImages (logo, cover, profil)
│   └── Compte.jsx               # ex-TabCompte (email, password, PIN admin, supprimer, RGPD, verrouiller)
├── reservations/
│   ├── index.jsx
│   ├── Configuration.jsx        # ex-TabBookingConfig (slug, advance_days, etc.)
│   ├── CategoriesBooking.jsx    # ex-BookingServiceCategories
│   ├── Prestations.jsx          # ex-BookingServices (upload image 5Mo)
│   └── Notifications.jsx        # ex-TabNotifs (templates, delays, sons, push, testRecap)
├── equipe/
│   ├── index.jsx
│   ├── Membres.jsx              # ex-TabEmployees (EmployeeForm + permissions + EmployeePinManager)
│   ├── Horaires.jsx             # ex-TabHorairesEmployes
│   ├── TimeSlots.jsx            # employee_time_slots (plages multiples)
│   ├── Commissions.jsx          # ex-TabCommissions
│   ├── Absences.jsx             # ex-TabAbsences (8 types + Confirm pastel)
│   └── Securite.jsx             # NOUVEAU : mode tablette, session timeout, lock on close, reset PIN
└── caisse-config/
    ├── index.jsx
    ├── Categories.jsx           # ex-CaisseCategories (hiérarchie drag-reorder)
    └── QR.jsx                   # ex-QRCard

Pour chaque fichier : extrais le code du tab correspondant dans Settings.jsx actuel. GARDE LA LOGIQUE MÉTIER IDENTIQUE (pas de refactor en profondeur).

Routing React Router :
- /reglages → index.jsx
- /reglages/mon-commerce/:section? → mon-commerce/index.jsx
- /reglages/reservations/:section?
- /reglages/equipe/:section?
- /reglages/caisse-config/:section?

Redirects pour anciennes URLs (ne pas casser les bookmarks) :
- /settings?tab=employees → /reglages/equipe/membres
- /settings?tab=horaires → /reglages/equipe/horaires
- /settings?tab=absences → /reglages/equipe/absences
- /settings?tab=commissions → /reglages/equipe/commissions
- /settings?tab=categories → /reglages/caisse-config/categories
- /settings?tab=booking-services → /reglages/reservations/prestations
- /settings?tab=booking-config → /reglages/reservations/configuration
- /settings?tab=notifs → /reglages/reservations/notifications
- /settings?tab=compte → /reglages/mon-commerce/compte
- /settings?tab=images → /reglages/mon-commerce/photos
- /settings?tab=qr → /reglages/caisse-config/qr

L'ancien /settings garde un banner "Utilisez la nouvelle interface /reglages" pendant 1-2 commits.

ATTENTION :
- Chaque sous-page DOIT fonctionner exactement comme avant (CRUD, gate PIN, etc.)
- Les composants EmployeeForm, EmployeePinManager, CatFormModal, etc. doivent garder leur comportement (round-trip permissions `{...init, ...f}`, resync useEffect([open, init?.id]))
- Pas de régression sur l'upload image (whitelist jpeg|png|webp|gif, 5Mo max, err inline séparé de imgErr)

Tests exhaustifs après chaque sous-page. Smoke test complet avant commit.

git add . && git commit -m "[commit 4] Éclatement Settings en 4 pages Réglages + Securite" && git push

Arrête-toi. Smoke test obligatoire.
```

---

## BRIEF · COMMIT 5 · Page Marketing

```
Commit 5 · Page Marketing complète.

Référence : docs/refonte/maquettes/05-marketing.html

Structure :

src/pages/marketing/
├── index.jsx                    # sous-tabs Fidélité / Anniv. / Parrainage / Promos / SMS / IA
├── fidelite/
│   ├── Loyalty.jsx              # programme tampons/points + KPIs + top fidèles + historique récompenses
│   ├── Birthday.jsx             # campagne anniversaire
│   └── Referral.jsx             # parrainage + phrase dynamique + pending à valider
├── promotions/
│   ├── List.jsx                 # liste codes avec stats (actifs/expirés/auto)
│   ├── Create.jsx               # form complet avec plage horaire
│   └── SendEmail.jsx            # envoi email groupé (promoApi.sendEmails)
├── sms/
│   ├── Solde.jsx                # balance + consommation + préférences
│   ├── Recharger.jsx            # Stripe PaymentIntent (3 modes)
│   └── Historique.jsx           # sms_transactions (recharge/refund/débit)
└── ia/
    ├── Suggestions.jsx          # campaignsApi.auto-plan (IA suggère)
    └── History.jsx              # campaignsApi.ai-history

Règles strictes :
- Préserver toutes les APIs existantes (loyaltyApi, promoApi, referralsApi, birthdayApi, paymentsApi SMS, campaignsApi IA)
- Caps métier : 100 tampons max, 100% max, 500€ max fixed, 100 pts/€ max, 3650j max, 10 000€ min_purchase max
- Parrainage caps : percent ≤ 100, fixed ≤ 500€, limit_count ≤ 10 000
- Anniversaire rolling 330 j
- Brevo 300/j global
- Prix SMS ≈ 0,0585€ · refund auto sur échec
- Idempotency Stripe UNIQUE(sumup_checkout_id)
- 3 modes Stripe : nouvelle carte + save / carte enregistrée off_session / automatic_payment_methods

Routing :
- /marketing → sous-tabs
- /marketing/fidelite/:section?
- /marketing/promotions/:section?
- /marketing/sms/:section?
- /marketing/ia/:section?
- Redirect /settings?tab=marketing → /marketing

Historique récompenses fidélité via loyaltyApi.getPromoHistory()
Liste parrainages pending via referralsApi.getRewards({email})

git add . && git commit -m "[commit 5] Page Marketing complète (fidélité + promos + SMS + IA)" && git push

Arrête-toi.
```

---

## BRIEF · COMMIT 6 · Page Statistiques

```
Commit 6 · Page Statistiques.

Référence : docs/refonte/maquettes/06-statistiques.html

Structure :

src/pages/statistiques/
├── index.jsx                    # sous-tabs
├── Performance.jsx              # KPIs mois + 30j + par paiement + par employé + top prestations + évolution CA
├── Forecast.jsx                 # statsApi.forecast IA 7j + alertes proactives (SMS, remplissage)
├── Heatmap.jsx                  # statsApi.heatmap jour × heure
├── Products.jsx                 # statsApi.products (ventes produits hors prestations)
└── Export.jsx                   # exportApi CSV/PDF (gate PIN admin)

Nouveau endpoint backend à créer :
GET /api/stats/by-payment-method?period=today → ventilation espèces/carte/virement/autre/multi avec couleurs pastel doc §15.

Couleurs pastel moyens paiement (à RESPECTER) :
- Espèces : text #065f46 bg #f0fdf4
- Carte : text #4338ca bg #eef2ff
- Virement : text #0e7490 bg #ecfeff
- Autre : text #92400e bg #fffbeb
- Multi : text #3c3489 bg #eeedfe

Export avec x-pin-session auto via adminRequest. ErrorModal pastel rouge sur échec. Handler 403 → "Session admin expirée".

Redirects /settings?tab=stats → /statistiques et /settings?tab=previsions → /statistiques/forecast

git add . && git commit -m "[commit 6] Page Statistiques (perf + prévisions + heatmap + produits + export)" && git push

Arrête-toi.
```

---

## BRIEF · COMMIT 7 · Caisse refondue

```
Commit 7 · CRITIQUE. Caisse /caisse avec 3 onglets.

Référence : docs/refonte/maquettes/03-caisse.html

Structure :

src/pages/caisse/
├── index.jsx                    # Encaisser / Historique / Crédit
├── Encaisser.jsx                # flow 4 étapes (refonte EncaisserSheet)
├── Historique.jsx               # ex-TabHistorique (stats jour + grille 4 paiements + ligne par ligne)
├── Credit.jsx                   # gestion crédit avec permissions
└── components/
    ├── Step1Panier.jsx          # catégories hiérarchiques + prix libre
    ├── Step2Client.jsx          # recherche/création/anonyme + affiche crédit dispo
    ├── Step3Payment.jsx         # simple ou multi, code promo check live, cartes réductions (anniv/parrainage)
    └── Step4Confirm.jsx         # confirmation + ticket

Règles strictes :
- Idempotency idempotency_key UUID par transaction (UNIQUE(user_id, idempotency_key))
- Multi-paiements via transaction_payments (method='multi')
- Multi-items via transaction_items
- Validation whitelist stricte : type ∈ {income, expense, revenue, refund, adjustment}, payment_method ∈ {cash, card, transfer, check, multi, other}, amount ≥ 0
- Check live code promo/parrainage (POST /api/promo/check)
- Affichage crédit client disponible (creditsApi.getByClient)
- Audit trail transaction_audit_log (snapshot_before/after)
- Événement `ff-tx-refresh` après chaque écriture
- Historique : grille 4 paiements avec multi éclatés par sous-paiement
- Crédit : gate permissions can_grant_credit, can_repay_credit
- Edit/suppr transaction : gate PIN admin (pinAdminMiddleware)
- signed_by_employee_id enregistré quand PIN employé utilisé

Redirects :
- /settings?tab=transactions → /caisse/historique
- /transactions → /caisse/historique
- /historique → /caisse/historique

ATTENTION particulière sur :
- employeePinOptional injecte req.employee avec flags can_*
- req.isEmployee et req.isMerchant pour distinguer le signataire

git add . && git commit -m "[commit 7] Caisse refondue (4 étapes + historique + crédit)" && git push

Arrête-toi. Smoke test complet encaissement.
```

---

## BRIEF · COMMIT 8 · Page Clients

```
Commit 8 · Page Clients /clients avec 4 onglets fiche.

Référence : docs/refonte/maquettes/04-clients.html

Structure :

src/pages/clients/
├── index.jsx                    # liste
├── Create.jsx                   # création
├── Fiche.jsx                    # orchestrateur 4 onglets
├── tabs/
│   ├── InfoTab.jsx
│   ├── HistoryTab.jsx
│   ├── CreditTab.jsx
│   └── NotesTab.jsx

Règles :
- Liste : recherche debounce 350ms, tri (Nom/Email/Téléphone/Création ASC/DESC), pagination 10/page
- Filtres : Tous / Fidèles / Anniv. mois / Avec crédit / Nouveaux / Inactifs / Bloqués
- CreateView : Prénom OU email obligatoire (validation)
- Source 'manual' enregistrée à la création
- consent_at + consent_ip horodatés (RGPD)
- InfoTab : boutons Éditer / Supprimer / Bloquer (is_booking_blocked) / Inviter (clientsApi.invite)
- Si client global : email/téléphone readonly (compte multi-commerces)
- HistoryTab : RDV + transactions, tri date desc, filtre service
- CreditTab : solde, historique grant/repay, forms
  - Grant : montant + note + employé (filtre can_grant_credit)
  - Repay : montant + méthode + note → crée transaction revenue source='credit'
  - Event ff-tx-refresh
- NotesTab : auto-save 2s + auteur + timestamp (clientNotesApi)
- Gate PIN admin sur édition / suppression / blocage

APIs à préserver : clientsApi (list, search, get, create, update, remove, invite, addNote, block), clientNotesApi (CRUD + search + history)

git add . && git commit -m "[commit 8] Page Clients (liste + 4 onglets fiche + invite/block/credit/notes)" && git push

Arrête-toi.
```

---

## BRIEF · COMMIT 9 · Dashboard FDS-2026

```
Commit 9 · Dashboard FDS-2026.

Référence : docs/refonte/maquettes/01-dashboard.html

Refonte chirurgicale de src/Dashboard.jsx :

- TopBar : "Hair Coiff Lille · Mercredi 22 avril" + bouton "Encaisser" (ouvre EncaisserSheet)
- 4 KPIs : CA jour, RDV, ventes caisse, SMS restants
- Alertes proactives (warn-banner) : récompenses fidélité à réclamer, SMS solde bas, stock
- 2 colonnes : Prochains RDV aujourd'hui + Activité équipe temps réel
- 2 colonnes : Encaissements par moyen paiement (couleurs pastel §15) + Évolution CA 7j (bars)
- Raccourcis 4 : Encaisser, Nouveau RDV, Créer promo, Nouveau client
- NotifModal (cloche TopBar) preserve : pastel par type, deep-link /agenda?date=&appt=, marquer tout lu
- Mobile : version simplifiée (2 KPIs, liste courte)

Preserve ABSOLUMENT :
- useNotifications hook (loadNotifications, markRead, playSound, enablePush)
- safeInternalPath pour deep-links
- Event storage multi-tab

git add . && git commit -m "[commit 9] Dashboard FDS-2026 (KPIs + alertes + activité équipe)" && git push

Arrête-toi.
```

---

## BRIEF · COMMIT 10 · Agenda polish

```
Commit 10 · Agenda 4 vues polish FDS-2026.

Référence : docs/refonte/maquettes/02-agenda.html

Les 4 vues existent déjà (MultiColumnAgenda, WeekView, MonthView, ListView). Applique seulement le design FDS-2026.

Ne CASSE JAMAIS :
- localStorage.ff_agenda_view_mode (whitelist day|week|month|list)
- Deep-link ?appt=<id>&date=YYYY-MM-DD (ouvre vue Jour + ApptActionModal)
- navigate(pathname, {replace:true}) après ouverture modal
- Persistance survit F5

Polish :
- Cards RDV : borderLeft 2px accent, borderRadius 12, fw≤500
- Pills statut pastel (success/warn/info/neutral)
- Heure en monospace
- CSS Grid auto-fit minmax(240px,1fr) pour ListView
- QuickAddApptModal : design FDS-2026 (prop defaultEmpId preserve)
- ApptActionModal : boutons Modifier / Annuler (gate can_cancel) / Encaisser (gate can_encash) / Supprimer (PIN admin)
- Stats header : N RDV · confirmés · encaissés

Icônes Lucide SVG inline (I.*), pas d'emoji.

git add . && git commit -m "[commit 10] Agenda 4 vues polish FDS-2026" && git push

Arrête-toi.
```

---

## BRIEF · COMMIT 11 · Mode tablette

```
Commit 11 · Mode tablette partagée complet.

Référence : docs/refonte/maquettes/09-tablette-partagee.html

1. Détection : userSettingsApi.get().tablet_mode_enabled === true

2. Crée src/contexts/TabletModeProvider.jsx qui englobe l'app :
   - Détecte le mode tablette au mount
   - Fournit isTabletMode, currentEmployee, login(empId, pin), logout(), isSessionValid()
   - Timeout automatique selon employee_session_timeout_min
   - lock_on_tab_close via beforeunload si activé

3. Sidebar en mode tablette : 3 items neutres (Agenda global, Encaisser, Clients) + bouton "Accès admin" (PIN).

4. Composant src/components/WhoEncashesModal.jsx :
   - S'affiche avant chaque action sensible
   - Liste employés avec can_encash=true et is_active=true
   - Cards cliquables par employé

5. PinEntry employé après choix :
   - 4 chiffres, anti-brute-force (5 tentatives)
   - Affiche "Tentative X/5"
   - Si lockout DB (employee_pins.locked_until > NOW()) : écran "Compte verrouillé" avec timer countdown

6. Bascule admin :
   - Bouton "Accès admin" ouvre PIN admin
   - Session temporaire de employee_session_timeout_min
   - TopBar orange (#fff7ed, #fed7aa border) avec timer 12:48 en monospace
   - Sidebar passe en 7 items complète
   - Bouton "Quitter mode admin" disponible
   - Timeout auto retour au mode neutre

7. Enregistrer signed_by_employee_id sur chaque transaction créée via PIN employé.

8. PIN à chaque action sensible (selon perm) :
   - can_encash : Encaisser
   - can_cancel : Annuler RDV
   - can_modify : Modifier RDV
   - can_use_promo : Appliquer code promo
   - can_grant_credit / can_repay_credit : crédit

Hook useEmployeePin existant : TTL 5 min sessionStorage `ff_emp_pin_<empId>`. Preserve.

git add . && git commit -m "[commit 11] Mode tablette partagée complet" && git push

Arrête-toi. Test exhaustif.
```

---

## BRIEF · COMMIT 12 · Booking public polish

```
Commit 12 · Booking public polish FDS-2026.

Référence : docs/refonte/maquettes/10-login-onboarding.html

NE CASSE PAS :
- Routes /book/:slug/... existantes
- /j/:slug (QR code express)
- /oauth/callback
- Gate /client/* avec ff_client_token et isJwtLocallyExpired

Applique design FDS-2026 (cards, bordures 0.5px, fw≤500, icônes Lucide) sur :
- Step1Home : logo, identité, horaires compacts, sections Prestations/Équipe/Avis, iframe Maps, ReferralBanner
- Step2-6 : cards, progression 6 étapes, boutons
- AppointmentsTab : card borderLeft 2px, 1 pill statut pastel, prix, Annuler conditionnel (cancellation_policy_hours), ref #ID discrète en bas
- VisitsTab : historique passages multi-commerces (VisitDetailCard)
- ProfileTab : Prénom/Nom/Email/Téléphone/Birthdate/CP/Ville, toggle opt-in marketing
- ChangeEmailModal : saisie → OTP
- ChangePwdModal : current OU forgot
- DeleteAccountModal : phrase "SUPPRIMER" à saisir, soft 30j, anonymisation NULL
- ReferralTab : code + copier, partage SMS/email/réseaux, stats, historique uses
- ReferralPage : non-auth tableau / connecté phrase prose dynamique (percent/euro, limite, validité)

**ATTENTION APOSTROPHES JSX** : chaque string contenant `'` française doit être en double-quote ou échappée. Fais un sweep complet.

Respect :
- require_account
- cancellation_policy_hours (TooLateModal)
- consent_at, consent_ip au register
- marketing_opt_in horodaté
- unsubscribe_token 1-clic

git add . && git commit -m "[commit 12] Booking public polish FDS-2026 + sweep apostrophes" && git push

Arrête-toi.
```

---

## BRIEF · COMMIT 13 · Notifications polish

```
Commit 13 · NotificationCenter polish FDS-2026.

Référence : voir scène 2 de docs/refonte/maquettes/01-dashboard.html (NotifModal)

Preserve useNotifications (loadNotifications, markRead, markAllRead, deleteNotif, enablePush, disablePush, playSound).

Polish :
- Cards pastel par type (new_appointment=bleu, reminder=ambre, caisse=vert, daily_recap=neutre)
- Emojis retirés → icônes Lucide I.*
- Chip type en majuscule (font-size:10px, letter-spacing:0.05em)
- Libellé client 13-15px
- Date lisible ("il y a 5 min", "hier", "12 avril")
- Heure RDV en monospace 20-22px
- Bouton "Tout marquer lu"
- "Voir tout l'historique" en pied de modal

Deep-link preserve : data.url = /agenda?date=YYYY-MM-DD&appt=<id> → vue Jour + ApptActionModal, puis strippe params.

Sons Web Audio API (oscillators) preserves : types caisse / new_appointment / reminder, volume configurable, sound_repeat, sound_rdv_before (X min avant RDV).

Web Push VAPID preserve : GET /vapid-public-key, Service Worker, POST /push-subscribe.

In-app :
- GET /api/notifications/inapp
- PATCH /api/notifications/inapp/read (id, ids[], _all)
- DELETE /api/notifications/inapp/:id

git add . && git commit -m "[commit 13] NotificationCenter polish FDS-2026" && git push

Arrête-toi.
```

---

## BRIEF · COMMIT 14 · Polish global

```
Commit 14 · Polish visuel FDS-2026 global + sweep apostrophes.

1. Crée src/theme/fds2026.js avec les tokens :
```js
export const FDS = {
  colors: {
    bg: '#fafafa',
    card: '#fff',
    border: '#e5e7eb',
    text: '#111827',
    muted: '#6b7280',
    // payment methods
    cashText: '#065f46', cashBg: '#f0fdf4',
    cardText: '#4338ca', cardBg: '#eef2ff',
    transferText: '#0e7490', transferBg: '#ecfeff',
    otherText: '#92400e', otherBg: '#fffbeb',
    multiText: '#3c3489', multiBg: '#eeedfe',
  },
  radius: { sm: 6, md: 8, lg: 10, xl: 12 },
  border: '0.5px solid #e5e7eb',
  fw: { normal: 400, medium: 500 },
};
```

2. Sweep global tous composants :
   - `border: '1px solid'` → `'0.5px solid #e5e7eb'`
   - fontWeight 600, 700, 800 → 500 max (sauf cas très rares documentés)
   - Emojis UI → icônes Lucide I.* (sauf push lock-screen OS et SMS templates existants)
   - Uniformiser radius : 8 boutons, 10 cards, 12 cards reglages

3. **SWEEP APOSTROPHES JSX CRITIQUE** :
   - Chercher dans tout le code JSX les strings avec `'` française
   - Exemples : `{"l'offre"}`, `{"aujourd'hui"}`, `{"s'inscrire"}`, `{"n'avez"}`
   - Toujours en double-quote ou &apos; pour éviter fail Vercel build
   - Commande utile : `grep -rn "[a-zA-Z]'[a-zA-Z]" src/ --include="*.jsx"`

4. Mode dark : tester TOUTES les pages (Dashboard, Agenda, Caisse, Clients, Marketing, Stats, Réglages 4 pages, Booking public).

5. Build local obligatoire : `npm run build` AVANT push. Fix toute erreur Vercel.

6. Retirer console.log de debug (sauf ceux utiles pour prod).

7. Smoke test complet via checklist `INVENTAIRE-FONCTIONNEL.md` section 17 : cocher toutes les cases.

git add . && git commit -m "[commit 14] Polish visuel FDS-2026 global + sweep apostrophes JSX" && git push

Arrête-toi. Avant merge main : smoke test complet obligatoire.
```

---

## Aide · comment gérer un imprévu

Si Claude Code déclenche un problème, colle l'un de ces messages :

### Refuse de faire un rollback sauvage
```
Ne fais PAS git reset, git revert ou git push --force.
Explique :
1. Le problème rencontré
2. Les fichiers modifiés
3. 2 options de fix (sans coder)
4. Attends ma validation
```

### Si un commit a fait planter le preview
```
Le preview Vercel est cassé. N'essaye pas de fix immédiatement.
1. Identifie la cause (logs Vercel Build + browser console)
2. Propose un fix minimal OU un revert du commit en cours (git revert HEAD)
3. Attends ma validation avant de toucher quoi que ce soit
```

### Si Claude Code a trouvé un bug dans le code existant
```
Prends note dans docs/refonte/BUGS-DECOUVERTS.md avec :
- Description
- Fichier + ligne
- Impact
- Proposition de fix

NE FIX PAS MAINTENANT. Continue le commit en cours. On traitera ces bugs dans un commit séparé après la refonte.
```

### Après merge main
```
Merge OK. Surveille les 10 premières minutes :
- logs Render (backend)
- Vercel deployment status
- Sentry ou équivalent si configuré
- Test smoke en prod : login + Dashboard + Agenda + Caisse

Si incident : git revert HEAD && git push. Rollback immédiat sans discussion.
```
