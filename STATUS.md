# FlowIA — STATUS

Dernier commit : voir `git log -1`.
Historique complet des sessions passées : `STATUS-archive.md`.

---

## État actuel (2026-04-21)

**UI EmployeeAgenda redesign Google Calendar** — 3 vues (Jour / Semaine /
Mois) avec navigation libre prev/next, bouton « Aujourd'hui », toggle de
vue façon Google Calendar. Nouveaux composants `WeekView.jsx` et
`MonthView.jsx` dans `employee-agenda/components/`. La vue Jour existante
(colonnes employés) est préservée avec son mini-bar semaine. Cliquer sur
un jour (semaine ou mois) bascule en vue Jour. Build OK.

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
