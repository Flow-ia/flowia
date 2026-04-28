# Plan d'action — Refonte FlowIA FDS-2026

> **Document central.** 14 commits ordonnés. Claude Code les exécute **un par un**, avec validation entre chaque.

---

## Vue d'ensemble

| # | Commit | Complexité | Durée | Risque |
|---|--------|------------|-------|--------|
| 0 | Cartographie exhaustive | Faible | 45 min | Nul |
| 1 | Migrations SQL (permissions + user_settings) | Faible | 30 min | Faible |
| 2 | Routes API user_settings + permissions étendues | Faible | 30 min | Faible |
| 3 | Sidebar 7 items en 3 sections | Moyen | 1h30 | Moyen |
| 4 | Éclatement Settings → 4 pages Réglages | Fort | 2h30 | Fort |
| 5 | Page Marketing (Fidélité + Promos + IA + SMS) | Fort | 2h | Moyen |
| 6 | Page Statistiques (perf + prévisions + heatmap + export) | Moyen | 1h30 | Faible |
| 7 | Caisse refondue (4 étapes + split + historique + crédit) | Fort | 2h30 | Fort |
| 8 | Page Clients (liste + 4 onglets fiche + actions) | Moyen | 1h30 | Moyen |
| 9 | Dashboard FDS-2026 (KPIs + alertes + activité équipe) | Moyen | 1h30 | Faible |
| 10 | Agenda 4 vues + deep-links (polish FDS-2026) | Moyen | 1h30 | Moyen |
| 11 | Mode tablette partagée complet | Fort | 2h | Moyen |
| 12 | Booking public 6 étapes + mes RDV + parrainage | Moyen | 2h | Faible |
| 13 | Notifications + push + sons (polish) | Faible | 1h | Faible |
| 14 | Polish visuel FDS-2026 global + apostrophes | Fort | 2h | Faible |

**Total : environ 22 heures sur plusieurs sessions.**

---

## COMMIT 0 · Cartographie exhaustive

### Objectif
Comprendre 100% du code actuel avant toute modification.

### Ce que Claude Code fait

1. Vérifier branche : `git status` → doit être `refonte-archi-v3`
2. Lire dans l'ordre (sans modifier) :
   - `backend/index.js` (routes, migrations SQL, cron)
   - `backend/routes/*.js` si fichiers séparés
   - `src/api.js` (toutes les sous-APIs)
   - `src/App.jsx`
   - `src/Dashboard.jsx`
   - `src/Agenda.jsx`
   - `src/Settings.jsx` (13+ onglets monolithiques)
   - `src/pages/booking-page/` (steps 1-6)
   - `src/pages/booking/` (account, my-appointments)
   - `src/hooks/` (useAuth, useAdmin, useNotifications, useTheme, useEmployeePin)
   - `src/utils/` (api, publicUrl)
3. Produire `docs/refonte/CARTOGRAPHIE.md` avec :
   - **Composants React** : chemin + rôle + dépendances
   - **Routes API** : méthode + chemin + middleware + filtre user_id
   - **Tables SQL** : nom + colonnes + FK
   - **Hooks** : signature + état géré
   - **Modales** : nom + trigger + scope
   - **Mapping 13 tabs Settings → 4 cartes Réglages**
   - **Points de risque** (OAuth, Stripe, PIN, webhooks)

### Commit
```
git add docs/refonte/CARTOGRAPHIE.md
git commit -m "[commit 0] Cartographie exhaustive du code existant"
git push
```

### Validation
L'utilisateur relit CARTOGRAPHIE.md et confirme que Claude Code a compris.

---

## COMMIT 1 · Migrations SQL

### Objectif
Ajouter les colonnes et tables nécessaires, **sans rien supprimer**.

### SQL à ajouter (à la fin des migrations backend)

```sql
-- 1. Permissions granulaires employés (certaines existent déjà)
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

-- 3. Audit trail encaissement via PIN
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS signed_by_employee_id INTEGER REFERENCES employees(id);

-- 4. Seed
INSERT INTO user_settings (user_id) SELECT id FROM users ON CONFLICT (user_id) DO NOTHING;
```

### Étapes Claude Code
1. Backup BDD dev Supabase (manuel via interface)
2. Ajouter migrations **à la fin** du script existant, ne pas toucher l'ordre
3. Redémarrer backend dev, vérifier logs OK
4. Vérifier colonnes/tables dans Supabase
5. Commit + push

```bash
git add .
git commit -m "[commit 1] Migrations SQL permissions employés et user_settings"
git push
```

---

## COMMIT 2 · Routes API étendues

### Objectif
Exposer permissions + user_settings via l'API.

### Étapes
1. Nouvelles routes backend :
   - `GET /api/user-settings` (authMiddleware, filtre user_id)
   - `PUT /api/user-settings` (pinAdminMiddleware)
2. Étendre `GET /api/employees` pour inclure toutes les permissions dans le SELECT
3. Étendre `PUT /api/employees/:id` pour accepter tous les flags permissions
4. Ajouter `userSettingsApi` dans `src/api.js` :
```js
export const userSettingsApi = {
  get: () => request('/user-settings'),
  update: (body) => adminRequest('/user-settings', { method: 'PUT', body: JSON.stringify(body) }),
};
```
5. Tester manuellement via curl ou console
6. Commit : `[commit 2] Routes API user-settings et permissions employés étendues`

---

## COMMIT 3 · Sidebar 7 items en 3 sections

### Objectif
Remplacer la sidebar minimale par la nouvelle structure.

### Référence
Maquette `docs/refonte/maquettes/08-sidebar-navigation.html`

### Structure
**PRINCIPAL** : Dashboard · Agenda · Caisse · Clients
**CROISSANCE** : Marketing · Statistiques
**PARAMÉTRAGE** : Réglages

Footer sidebar : Toggle dark/light · Déconnexion

### Étapes
1. Modifier `App.jsx` ou `components/DesktopSidebar.jsx`
2. Créer `components/Icon.jsx` pour SVG Lucide inline (copier depuis `maquettes/icons.js`)
3. Routing React :
   - `/dashboard` (existant)
   - `/agenda` (existant)
   - `/caisse` → placeholder redirige `/settings?tab=transactions` (temporaire)
   - `/clients` → placeholder redirige `/clients` existant
   - `/marketing` → placeholder redirige `/settings?tab=marketing`
   - `/statistiques` → placeholder redirige `/settings?tab=stats`
   - `/reglages` → placeholder redirige `/settings`
4. Mobile bottom nav 5 items (Home, Agenda, Caisse, Clients, Plus) + menu "Plus" avec Marketing/Stats/Réglages
5. Test : cliquer chaque item ne casse rien, mode dark OK
6. Commit : `[commit 3] Refonte sidebar 7 items en 3 sections + routing`

---

## COMMIT 4 · Éclatement Settings → 4 pages Réglages

### Objectif (LE PLUS RISQUÉ)
Décomposer `Settings.jsx` (13+ onglets monolithiques) en 4 pages thématiques.

### Référence
Maquette `docs/refonte/maquettes/07-reglages.html`

### Structure cible

```
src/pages/reglages/
├── index.jsx                    # 4 cartes accueil
├── mon-commerce/
│   ├── index.jsx                # sous-tabs
│   ├── Informations.jsx         # ex-TabInfos (MerchantInfoCard)
│   ├── Horaires.jsx             # ex-TabHorairesCommerce (business_hours + breaks)
│   ├── Photos.jsx               # ex-TabImages (logo, cover, profil)
│   └── Compte.jsx               # ex-TabCompte (email, password, PIN admin, supprimer, RGPD)
├── reservations/
│   ├── index.jsx
│   ├── Configuration.jsx        # ex-TabBookingConfig (slug, advance_days, etc.)
│   ├── CategoriesBooking.jsx    # ex-BookingServiceCategories
│   ├── Prestations.jsx          # ex-BookingServices (image upload 5Mo)
│   └── Notifications.jsx        # ex-TabNotifs (templates, delays, sons, push, testRecap)
├── equipe/
│   ├── index.jsx
│   ├── Membres.jsx              # ex-TabEmployees (EmployeeForm, EmployeePinManager, toutes permissions)
│   ├── Horaires.jsx             # ex-TabHorairesEmployes
│   ├── TimeSlots.jsx            # employee_time_slots (plages multiples)
│   ├── Commissions.jsx          # ex-TabCommissions
│   ├── Absences.jsx             # ex-TabAbsences (8 types + Confirm pastel)
│   └── Securite.jsx             # NOUVEAU : mode tablette, session, lock on close, reset PIN
└── caisse-config/
    ├── index.jsx
    ├── Categories.jsx           # ex-CaisseCategories (hiérarchie drag-reorder, repliés défaut)
    └── QR.jsx                   # ex-QRCard (inscription express /j/:slug)
```

### Étapes
1. `git branch backup-avant-commit-4`
2. Pour chaque tab existant dans `Settings.jsx`, extraire le code vers son nouveau fichier. **Garder la logique métier identique**, seule l'organisation change.
3. Routing : `/reglages`, `/reglages/mon-commerce/:section`, etc.
4. Redirects pour anciennes URLs : `/settings?tab=employees` → `/reglages/equipe/membres`, etc.
5. Ancien `/settings` garde un banner "Utilisez /reglages" pendant 1-2 commits.
6. Tests exhaustifs : chaque sous-page fonctionne exactement comme avant.
7. Commit : `[commit 4] Éclatement Settings en 4 pages Réglages + Securite`

---

## COMMIT 5 · Page Marketing complète

### Objectif
Sortir Fidélité/Promos/SMS/IA des Réglages vers `/marketing`.

### Référence
Maquette `docs/refonte/maquettes/05-marketing.html`

### Structure
```
src/pages/marketing/
├── index.jsx                    # sous-tabs Fidélité / Promos / Solde SMS / IA
├── fidelite/
│   ├── Loyalty.jsx              # programme tampons/points + KPIs + historique récompenses
│   ├── Birthday.jsx             # campagne anniversaire
│   └── Referral.jsx             # parrainage + phrase dynamique
├── promotions/
│   ├── List.jsx                 # liste codes avec stats
│   ├── Create.jsx               # form complet avec plage horaire
│   └── SendEmail.jsx            # envoi email groupé (promoApi.sendEmails)
├── sms/
│   ├── Solde.jsx                # balance + consommation + préférences
│   ├── Recharger.jsx            # Stripe PaymentIntent (3 modes : nouvelle carte / save / off_session)
│   └── Historique.jsx           # sms_transactions (recharge/refund/débit)
└── ia/
    ├── Suggestions.jsx          # campaignsApi.auto-plan (IA suggère)
    └── History.jsx              # campaignsApi.ai-history (appliquées)
```

### Étapes
1. Extraire code des tabs marketing existants depuis Settings
2. Préserver toutes les APIs : `loyaltyApi`, `promoApi`, `referralsApi`, `birthdayApi`, `paymentsApi` (SMS), `campaignsApi` (IA)
3. Préserver caps métier (100 tampons max, etc.)
4. KPIs Fidélité : tampons distribués jour, récompenses réclamées, clients fidèles actifs, CA 30j
5. Historique récompenses via `loyaltyApi.getPromoHistory()`
6. Solde SMS : balance en DECIMAL, bouton Recharger, historique
7. IA : suggestions auto-plan, Appliquer/Ignorer, historique appliqué
8. Routing : `/marketing`, `/marketing/:section/:sub?`
9. Commit : `[commit 5] Page Marketing complète (fidélité + promos + SMS + IA)`

---

## COMMIT 6 · Page Statistiques

### Objectif
Sortir Stats/Prévisions/Heatmap/Export vers `/statistiques`.

### Référence
Maquette `docs/refonte/maquettes/06-statistiques.html`

### Structure
```
src/pages/statistiques/
├── index.jsx                    # sous-tabs
├── Performance.jsx              # stats jour + 30j + par paiement + par employé + top prestations
├── Forecast.jsx                 # statsApi.forecast (IA 7j)
├── Heatmap.jsx                  # statsApi.heatmap (jour × heure)
├── Products.jsx                 # statsApi.products (ventes produits)
└── Export.jsx                   # exportApi CSV/PDF (gate PIN admin)
```

### Étapes
1. Nouveau endpoint backend `GET /api/stats/by-payment-method?period=today`
2. Afficher ventilation espèces/carte/virement/autre/multi avec couleurs pastel de la doc (§15 règles UI)
3. Export avec `x-pin-session` auto (via `adminRequest`)
4. Redirects `/settings?tab=stats` → `/statistiques`
5. Commit : `[commit 6] Page Statistiques (perf + prévisions + heatmap + produits + export)`

---

## COMMIT 7 · Caisse refondue

### Objectif
Nouvelle page `/caisse` avec 3 onglets.

### Référence
Maquette `docs/refonte/maquettes/03-caisse.html`

### Structure
```
src/pages/caisse/
├── index.jsx                    # Encaisser / Historique / Crédit
├── Encaisser.jsx                # flow 4 étapes (refonte EncaisserSheet)
├── Historique.jsx               # ex-TabHistorique (stats jour + grille 4 paiements + ligne par ligne)
├── Credit.jsx                   # gestion crédit avec permissions
└── components/
    ├── Step1Panier.jsx          # catégories hiérarchiques + prix libre
    ├── Step2Client.jsx          # recherche/création/anonyme + affiche crédit dispo
    ├── Step3Payment.jsx         # simple ou multi, code promo check live, cartes réductions
    └── Step4Confirm.jsx         # confirmation + ticket
```

### Étapes importantes
1. Préserver idempotency (`idempotency_key` UUID par transaction)
2. Multi-paiements via `transaction_payments` (method='multi')
3. Multi-items via `transaction_items`
4. Check live code promo/parrainage
5. Affichage crédit client disponible pendant l'encaissement
6. Audit trail `transaction_audit_log` preserve
7. Historique : grille 4 paiements avec multi éclatés
8. Crédit : gate permissions `can_grant_credit`, `can_repay_credit`
9. Edit/suppr transaction : gate PIN admin
10. Event `ff-tx-refresh` après chaque écriture
11. Redirects `/settings?tab=transactions` → `/caisse/historique`
12. Commit : `[commit 7] Caisse refondue (4 étapes + historique + crédit)`

---

## COMMIT 8 · Page Clients

### Objectif
`/clients` avec 4 onglets fiche.

### Référence
Maquette `docs/refonte/maquettes/04-clients.html`

### Structure
```
src/pages/clients/
├── index.jsx                    # liste + recherche debounce 350ms + tri + pagination 10/page
├── Create.jsx                   # Prénom OU email obligatoire
├── Fiche.jsx                    # orchestrateur 4 onglets
├── tabs/
│   ├── InfoTab.jsx              # édition + Supprimer + Bloquer (is_booking_blocked) + Inviter (clientsApi.invite)
│   ├── HistoryTab.jsx           # RDVs + transactions tri date desc + filtre service
│   ├── CreditTab.jsx            # solde + historique grant/repay + forms
│   └── NotesTab.jsx             # auto-save + auteur + timestamp (clientNotesApi)
```

### Étapes
1. Préserver `clientsApi` (list, search, get, create, update, remove, invite, addNote, block)
2. Préserver `clientNotesApi` (CRUD + search + history)
3. Si client global : email/téléphone readonly
4. Gate PIN sur édition/suppression/blocage
5. Grant crédit → utilise `can_grant_credit` employé
6. Repay crédit → crée transaction revenue source='credit' + event `ff-tx-refresh`
7. Commit : `[commit 8] Page Clients (liste + 4 onglets fiche + actions invite/block/credit/notes)`

---

## COMMIT 9 · Dashboard FDS-2026

### Objectif
Moderniser Dashboard avec KPIs + alertes + activité équipe.

### Référence
Maquette `docs/refonte/maquettes/01-dashboard.html`

### Structure (refonte de `Dashboard.jsx`)
- TopBar : "Hair Coiff Lille · Mercredi 22 avril" + bouton "Encaisser" (ouvre EncaisserSheet)
- 4 KPIs (CA jour, RDV, ventes caisse, SMS restants)
- Alertes proactives (récompenses fidélité à réclamer, SMS solde bas, stock)
- 2 colonnes : Prochains RDV + Activité équipe temps réel
- 2 colonnes : Encaissements par moyen paiement + Évolution CA 7j
- Raccourcis : Encaisser, Nouveau RDV, Créer promo, Nouveau client
- NotifModal (cloche TopBar) preserve

### Étapes
1. Refonte chirurgicale de `Dashboard.jsx`
2. Garder NotifModal existante (elle est critique)
3. Mobile : version simplifiée
4. Commit : `[commit 9] Dashboard FDS-2026 (KPIs + alertes + activité équipe)`

---

## COMMIT 10 · Agenda 4 vues polish FDS-2026

### Objectif
Appliquer FDS-2026 à l'agenda (4 vues existent : Jour/Semaine/Mois/Liste).

### Référence
Maquette `docs/refonte/maquettes/02-agenda.html`

### Étapes
1. Ne pas casser `localStorage.ff_agenda_view_mode` (whitelist day|week|month|list)
2. Ne pas casser deep-link `?appt=<id>&date=YYYY-MM-DD`
3. Refaire le style des cards RDV : borderLeft 2px accent, borderRadius 12, fw≤500
4. Modales QuickAddApptModal + ApptActionModal : design FDS-2026
5. Commit : `[commit 10] Agenda 4 vues polish FDS-2026`

---

## COMMIT 11 · Mode tablette partagée

### Objectif
Mode tablette avec PIN à chaque action sensible.

### Référence
Maquette `docs/refonte/maquettes/09-tablette-partagee.html`

### Étapes
1. Détection : `userSettingsApi.get().tablet_mode_enabled === true`
2. Context `TabletModeProvider` qui englobe l'app
3. Sidebar neutre 3 items (Agenda global, Encaisser, Clients) + bouton "Accès admin"
4. Modale "Qui encaisse ?" avant PIN (employés `can_encash=true`)
5. PIN à chaque : encaisser, annuler RDV, modifier RDV, suppr transaction, promo, crédit (selon perms)
6. Bascule admin : bouton → PIN admin → session employee_session_timeout_min → TopBar orange + sidebar 7 items
7. Timeout auto retour mode neutre
8. Lock on tab close si activé (beforeunload)
9. Enregistrer `signed_by_employee_id` sur chaque transaction créée via PIN
10. Commit : `[commit 11] Mode tablette partagée complet`

---

## COMMIT 12 · Booking public polish

### Objectif
Appliquer FDS-2026 au flow public 6 étapes et Mes RDV.

### Référence
Maquette `docs/refonte/maquettes/10-login-onboarding.html`

### Étapes
1. Ne pas casser les routes `/book/:slug/...` existantes
2. Ne pas casser `/j/:slug` (QR express)
3. Steps 1-6 : appliquer design FDS-2026 (cards, bordures, fw)
4. My-appointments : 4 onglets RDV/Passages/Profil/Parrainage polish
5. AppointmentsTab card : borderLeft 2px, 1 pill statut, prix, Annuler conditionnel, ref #ID discrète
6. ChangeEmailModal/ChangePwdModal/DeleteAccountModal : polish
7. CancelApptModal + TooLateModal : polish
8. ReferralPage : phrase prose dynamique connecté vs tableau non-connecté
9. **ATTENTION APOSTROPHES** : vérifier chaque string JSX
10. Commit : `[commit 12] Booking public polish FDS-2026`

---

## COMMIT 13 · Notifications polish

### Objectif
NotificationCenter FDS-2026.

### Étapes
1. Préserver useNotifications (loadNotifications, markRead, enablePush, playSound...)
2. Cards pastel par type (new_appointment=bleu, reminder=ambre, caisse=vert)
3. Emojis retirés → icônes Lucide I.*
4. Libellé employé 16-18px, date lisible, heure 20-22px monospace, chip type majuscule
5. Deep-link preserve : `data.url = /agenda?date=&appt=`
6. Sons preserves (Web Audio oscillators)
7. Web Push VAPID preserve
8. Commit : `[commit 13] NotificationCenter polish FDS-2026`

---

## COMMIT 14 · Polish global + apostrophes

### Objectif
Dernier commit : uniformisation complète.

### Étapes
1. Créer `src/theme/fds2026.js` (palette, radius, borders, fw)
2. Sweep tous composants :
   - `border: 1px solid` → `0.5px solid #e5e7eb`
   - `fontWeight: 600+` → 500 max
   - Emojis UI → icônes Lucide `I.*`
   - Uniformiser radius (8 boutons, 10 cards, 12 reglages-cards)
3. **Sweep APOSTROPHES JSX** : chercher `'` dans les strings JSX, échapper ou double-quote
4. Mode dark : tester toutes les pages
5. Build local `npm run build` avant push final
6. Retirer console.log de debug
7. Commit : `[commit 14] Polish visuel FDS-2026 global + sweep apostrophes JSX`

---

## Validation finale avant merge main

### Smoke test complet
Suivre la checklist de `INVENTAIRE-FONCTIONNEL.md` section 17. Si 1 seule case non cochée, merge bloqué.

### Merge
```bash
git checkout main
git pull
git merge refonte-archi-v3
git push
```
Monitor 10 min post-déploiement.

### Rollback
```bash
git revert HEAD
git push
```

---

## FAQ

**Q : Si je trouve du code mort ?**
R : Signaler en commentaire dans `CARTOGRAPHIE.md`, ne pas supprimer sans validation.

**Q : Si une maquette ajoute une feature pas dans le code ?**
R : L'ajouter est obligatoire (elle est intentionnelle).

**Q : Si j'ai besoin d'une lib npm ?**
R : Demander d'abord.

**Q : Tests auto ?**
R : Pas dans ce scope.

**Q : Bug rencontré dans un fichier non lié ?**
R : Signaler, corriger plus tard sauf si ça bloque.

---

**Objectif : 14 commits propres, zéro régression, UX moderne FDS-2026.**
