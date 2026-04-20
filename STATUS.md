# FlowIA — STATUS

Dernier commit : voir `git log -1`.
Historique complet des sessions passées : `STATUS-archive.md`.

---

## État actuel (2026-04-21)

**Audit backend clôturé** (commits K→AA). Toutes les routes backend ont été
auditées : error hygiene, PIN admin, bounds, normalisation email, IDOR,
whitelists, rate-limiting dédiés, CNIL/RGPD opt-in marketing, security
headers (CSP/HSTS/Referrer-Policy).

**Refactor frontend en cours** — décomposition des gros fichiers :
- ✅ `TabMarketing.jsx` (2553 l) → `settings/marketing/`
- ✅ `Agenda.jsx` (2386 l) → `agenda/`
- ✅ `BookingPage.jsx` (2203 l) → `booking-page/` (constants, helpers, ReferralBanner, steps/ Step1Home→Step6Confirm, views/ Blocked/MyAppts/Parrain/Success) — commit `a4ac68a`, build OK, 22 routes /book/:slug/* préservées
- ✅ `EmployeeAgenda.jsx` (2183 l) → `employee-agenda/` (commit `d8109cf`)

**Reste à décomposer (>1000 lignes)** :
- `MyAppointments.jsx` (1895)
- `TabEquipe.jsx` (1290)
- `Account.jsx` (1243)
- `ClientsPage.jsx` (1138)
- `TabCategories.jsx` (1095)

**Backend gros fichiers** (audit terminé, refactor non prioritaire) :
- `booking.js` (1337), `global-clients.js` (1273), `db/index.js` (1221),
  `campaigns.js` (1140), `auth.js` (1011)

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
