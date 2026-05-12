# PRE-LIVE-CHECKLIST — FlowIA Stripe Connect

Document de référence centralisant l'architecture financière FlowIA Stripe Connect avant passage LIVE production. Destiné à :
- Onboard un futur développeur
- Comprendre toute l'architecture financière
- Gérer un incident production (rollback, debug)
- Préparer un audit financier

> Dernière mise à jour : 2026-05-12 (commit `ba65dd1`)
> Maintenu par : équipe FlowIA. Si tu modifies l'archi financière, mets ce doc à jour DANS le même PR.

---

## 1. Architecture finale

### 1.1 Vue d'ensemble

FlowIA utilise **Stripe Connect Direct Charges + Controller API** pour permettre aux merchants (salons, barbershops) d'encaisser leurs clients via une plateforme tiers (FlowIA) qui prélève une commission.

```
┌─────────┐    paiement    ┌──────────────────┐    Direct Charge    ┌──────────────────┐
│ Client  │ ────────────▶  │   FlowIA (PI)    │ ──────────────────▶ │  Merchant Connect│
│ (Stripe │                │                  │  application_fee    │  (acct_XXX)      │
│ Element)│                │  + commission %  │ ──────────────────▶ │                  │
└─────────┘                └──────────────────┘    plateforme       └────────┬─────────┘
                                                                              │
                                                              cron escrow     │ payout_hold_days
                                                                       releasePayouts
                                                                              │
                                                                              ▼
                                                                       ┌──────────────────┐
                                                                       │  IBAN Merchant   │
                                                                       └──────────────────┘
```

### 1.2 Sources de vérité

| Table / Source              | Rôle                                       | Phase    |
|-----------------------------|--------------------------------------------|----------|
| `financial_ledger`          | **Truth layer** : ledger immuable          | Phase 1  |
| `transactions`              | Caisse + historique merchant (legacy)      | Existant |
| `appointment_payouts`       | Scheduling cron release payouts (legacy)   | Existant |
| `payouts`                   | Audit log payouts Stripe (legacy)          | Existant |
| `processed_stripe_events`   | Anti-replay webhook events                 | Existant |
| Stripe API (balance, PI...) | **Execution layer** uniquement             | Existant |

**Principe** :
- `financial_ledger` = **source de vérité comptable** (immuable, audit-safe)
- Stripe API = **couche d'exécution** (paiement, refund, payout, balance live)
- Tables legacy = conservées en parallèle (dual-write) pour fallback et scheduling cron

### 1.3 Schéma `financial_ledger`

Voir `backend/src/db/index.js:1720-1789` (migration phase 1, commit `3a2bba8`).

```sql
CREATE TABLE financial_ledger (
  id                        UUID PRIMARY KEY,
  user_id                   UUID NOT NULL REFERENCES users,
  appointment_id            UUID,
  appointment_payout_id     UUID,
  entry_type                VARCHAR(20) CHECK IN (
    'payment','stripe_fee','commission','refund',
    'payout_hold','payout_release','payout_paid'
  ),
  amount_cents              BIGINT NOT NULL,    -- signé (+ entrée, - sortie)
  currency                  VARCHAR(3) DEFAULT 'EUR',
  status                    VARCHAR(20) CHECK IN (
    'pending','available','locked','paid','refunded','failed'
  ),
  stripe_payment_intent_id  VARCHAR(255),
  stripe_charge_id          VARCHAR(255),
  stripe_refund_id          VARCHAR(255),
  stripe_payout_id          VARCHAR(255),
  stripe_balance_txn_id     VARCHAR(255),
  commission_rate_snapshot  NUMERIC(5,2),       -- FIGÉ au moment du payment
  related_ledger_id         UUID,               -- chaînage refund→payment
  occurred_at               TIMESTAMPTZ,        -- date événement métier
  recorded_at               TIMESTAMPTZ,        -- date INSERT ledger
  metadata                  JSONB
);
```

**Convention amount_cents (BIGINT signé)** :

| entry_type       | signe    | sens                              |
|------------------|----------|-----------------------------------|
| `payment`        | positif  | +gross encaissé client → merchant |
| `commission`     | négatif  | -commission FlowIA (app_fee)      |
| `stripe_fee`     | négatif  | -frais Stripe Connect             |
| `refund`         | négatif  | -montant remboursé client         |
| `payout_hold`    | positif  | montant attendu en escrow (info)  |
| `payout_release` | positif  | montant payouté (informationnel)  |
| `payout_paid`    | positif  | montant confirmé Stripe (info)    |

**Indexes** :
- `idx_ledger_user_type_status` : agrégations UI
- `idx_ledger_appointment` : reverse lookup par RDV
- `idx_ledger_pi`, `idx_ledger_payout` : lookup par event Stripe
- **UNIQUE partiels** (idempotence DB-level) :
  - `uq_ledger_pi_entry` : 1 row max par (PI, entry_type) pour payment/commission/stripe_fee
  - `uq_ledger_refund_entry` : 1 row max par (refund_id, entry_type='refund')
  - `uq_ledger_payout_entry` : 1 row max par (payout_id, entry_type) pour payout_release/paid

### 1.4 Lifecycle d'une entry ledger

```
Webhook payment_intent.succeeded
    ↓
INSERT payment      (status='pending')
INSERT commission   (status='pending', related → payment.id)
INSERT stripe_fee   (status='pending', related → payment.id)
INSERT payout_hold  (via scheduleAppointmentPayout, status='locked')

    ↓ (cron releasePayouts → stripe.payouts.create)

INSERT payout_release       (status='locked')
UPDATE payment/commission/stripe_fee status='pending' → 'locked'

    ↓ (webhook payout.paid)

INSERT payout_paid          (status='paid')
UPDATE payment/commission/stripe_fee/payout_hold/payout_release status='paid'

    ⤬ (webhook charge.refunded OU refundAppointment direct)

INSERT refund               (status='refunded', related → payment.id, signé négatif)
UPDATE payment/commission/stripe_fee status='refunded'
UPDATE appointment_payouts status='cancelled' (annule l'escrow)

    ⤬ (webhook payout.failed)

UPDATE entries lifecycle status='failed'
UPDATE appointment_payouts status='failed'
```

### 1.5 Dual-write (phase 2, commit `299c161`)

Le ledger est rempli **en parallèle** des tables legacy à chaque event Stripe / action backend. Helper centralisé `utils/ledger.js` :

```javascript
recordLedgerEntry(pool, {
  userId, appointmentId, entryType,
  amountCents, status,
  stripePaymentIntentId, stripeChargeId, stripeRefundId, stripePayoutId,
  commissionRateSnapshot, relatedLedgerId, metadata,
});
```

**Best-effort** : try/catch dans tous les call-sites — si l'INSERT ledger échoue, le flow business (Stripe + tables legacy) continue. Idempotence garantie par les UNIQUE INDEX partiels (ON CONFLICT DO NOTHING).

**Call-sites instrumentés** :
- `utils/scheduleAppointmentPayout.js` → `payout_hold`
- `utils/releasePayouts.js` → `payout_release` + UPDATE status='locked'
- `utils/refundAppointment.js` → `refund` + `markRefunded`
- `routes/stripe-connect.js` webhook `payment_intent.succeeded` → `payment + commission + stripe_fee`
- `routes/stripe-connect.js` webhook `charge.refunded` → `refund` + `markRefunded`
- `routes/stripe-connect.js` webhook `payout.paid` → `payout_paid` + UPDATE status='paid'
- `routes/stripe-connect.js` webhook `payout.failed` → UPDATE status='failed'

### 1.6 Dual-read (phase 4, commits `2923900` → `75d83d6`)

Wrapper générique `utils/dualRead.js` qui :
1. Lit toujours le legacy (source courante)
2. Lit le ledger si flag `ledger_read_*` activé OU si `ledger_dual_compare !== false`
3. Compare champ par champ (paths dotted supportés)
4. Log drift en JSON structuré `[LEDGER_METRIC]`
5. Choisit source de réponse selon flag : ledger si opt-in + OK, sinon legacy
6. **Fallback auto** : si ledger throw, retombe sur legacy sans dégradation UI
7. Injecte `_ledger_debug` si admin a activé le flag visibility

**Feature flags** (sur `users.feature_flags JSONB`, sémantique opt-in) :

| Flag                          | Effet                                           |
|-------------------------------|-------------------------------------------------|
| `ledger_read_performance`     | bascule `/performance-stats` et `/stats/online-payments` |
| `ledger_read_payouts`         | bascule `/payouts` (escrow)                     |
| `ledger_read_balance`         | bascule `/balance` (informationnel)             |
| `ledger_read_historique`      | bascule `/historique` (totaux)                  |
| `ledger_read_transactions`    | réservé (non utilisé phase 4 — voir 4.5 skip)   |
| `ledger_debug_visible`        | révèle `_ledger_debug` dans les responses       |
| `ledger_dual_compare`         | active comparaison auto (default true)          |

**Sémantique** : absent ou `false` = legacy (safe par défaut). `true` = bascule ledger.

### 1.7 Drift monitoring

3 mécanismes complémentaires :

**a) Compteurs in-memory** (phase 4.2)
- Reset au boot Render (= par déploiement)
- Exposés via `GET /api/admin/ledger-metrics`
- Compteurs par `(label, user_id)` : drift / fallback / ledger_error / legacy_error

**b) Logs JSON structurés** (phase 4.2)
- Prefix `[LEDGER_METRIC]` dans stdout Render
- Format : `{type, label, user_id, ts, ...payload}`
- Types : `drift`, `fallback`, `ledger_error`, `legacy_error`
- **Grep-friendly persistent** dans Render Logs

**c) Script comparaison batch** (phase 3, commit `c3296e3`)
- `scripts/compare-ledger-vs-legacy.js`
- Compare 6 KPI par merchant sur fenêtre temporelle
- Exit code 0 / 1 (drift) / 2 (erreur)

### 1.8 Idempotency strategy

5 couches d'idempotence :

1. **Webhook anti-replay** : `processed_stripe_events` (PK = event_id). Insert APRÈS process réussi (commit `8ac60b5`).
2. **DB UNIQUE INDEX partiels** : `uq_ledger_*` empêchent les doublons ledger sur retry webhook.
3. **`appointment_payouts.appointment_id UNIQUE`** : 1 row max par RDV.
4. **`idempotencyKey` Stripe** sur `stripe.payouts.create`, `stripe.refunds.create` (commit `8ac60b5`).
5. **`ON CONFLICT DO NOTHING/UPDATE`** sur tous les INSERT critiques.

### 1.9 Webhook flow

**Endpoint** : `POST /api/stripe-connect/webhook`
**Auth** : signature Stripe vérifiée via `STRIPE_CONNECT_WEBHOOK_SECRET`
**Events écoutés** :

| Event Stripe                  | Action FlowIA                                      |
|-------------------------------|----------------------------------------------------|
| `account.updated`             | Sync `users.stripe_charges_enabled` / `payouts_enabled` |
| `payment_intent.succeeded`    | UPDATE appt + INSERT tx + scheduleAppointmentPayout + ledger entries |
| `payment_intent.payment_failed` | UPDATE appt.payment_status='failed' |
| `charge.refunded`             | UPDATE appt='refunded' + cancelPayout + INSERT refund tx + ledger refund |
| `payout.paid` (escrow)        | UPSERT payouts + UPDATE tx.payout_received_at + ledger payout_paid |
| `payout.paid` (manuel)        | Heuristique cutoff par date + ledger payout_paid + status='paid' on entries |
| `payout.failed`               | UPDATE payouts.status='failed' + appointment_payouts.status='failed' + ledger status='failed' + email alert |

> Endpoint SMS Stripe séparé : `POST /api/payments/sms/webhook` avec son propre secret `STRIPE_WEBHOOK_SECRET` — **NE JAMAIS toucher** (CLAUDE.md règle 5).

### 1.10 Payout flow (escrow)

```
Day 0 : payment_intent.succeeded
        ↓
        scheduleAppointmentPayout (release_at = appt.date + payout_hold_days)
        INSERT appointment_payouts (status='pending')
        INSERT ledger payout_hold (status='locked')

Day N (= appt.date + 3 jours par défaut) :
        cron releasePayouts (worker 1, scheduleLocked, 1×/jour)
        ↓
        stripe.payouts.create avec idempotencyKey = 'escrow_payout_{id}_attempt_{N}'
        UPDATE appointment_payouts status='released' + stripe_payout_id
        INSERT ledger payout_release (status='locked')
        UPDATE ledger payment/commission/stripe_fee status='locked'

Day N + 1-3 (Stripe banking) :
        webhook payout.paid
        ↓
        UPSERT payouts.status='paid'
        UPDATE transactions.payout_received_at
        INSERT ledger payout_paid (status='paid')
        UPDATE ledger entries status='paid'

OU :    webhook payout.failed (IBAN invalide, fonds insuffisants, etc.)
        ↓
        UPDATE payouts.status='failed' + failure_reason
        UPDATE appointment_payouts.status='failed'
        UPDATE ledger entries status='failed'
        Email alert merchant
        Admin peut retry via /api/admin/stripe-payouts/retry/:id
```

**Politique business** :
- Délai escrow `payout_hold_days` configurable par merchant (défaut 3j, cap 30j)
- Schedule Stripe = manual (FlowIA contrôle le timing via cron)
- Si refund avant release : escrow annulé, fonds restent sur balance Connect
- Si refund après payout.paid : refund déduit du balance Connect (négatif possible)

### 1.11 Refund flow

3 chemins possibles :

**(a) Client annule dans les délais** (via `/api/booking/.../cancel`)
- `cancellation_policy_hours` configurable merchant
- Si dans la fenêtre → `refundAppointment` auto

**(b) Merchant annule** (via `PUT /api/appointments/:id` status='cancelled' alors que paid)
- Trigger `refundAppointment` auto
- Politique : merchant absorbe le refund complet (commission FlowIA conservée)

**(c) Merchant lance refund directement depuis Stripe Dashboard**
- Hors flow FlowIA → SEUL le webhook `charge.refunded` tourne
- `refundAppointment` n'est PAS appelé
- Le webhook handler mirror le même effet (UPDATE appt + cancel payout + ledger refund)

**Commission FlowIA conservée** : politique business validée 2026-05-12. `refund_application_fee` est intentionnellement OMIS sur `stripe.refunds.create` en direct charges. Voir `utils/refundAppointment.js:91`.

### 1.12 Escrow flow (résumé)

```
PaymentIntent.succeeded
    ↓
1. appointment_payouts INSERT row (release_at calculé)
2. financial_ledger INSERT payout_hold

Cron releasePayouts (1×/jour, worker 1)
    ↓
3. stripe.payouts.create (idempotencyKey)
4. UPDATE appointment_payouts status='released'
5. financial_ledger INSERT payout_release

Webhook payout.paid
    ↓
6. UPSERT payouts.status='paid'
7. UPDATE transactions.payout_received_at
8. financial_ledger INSERT payout_paid + UPDATE entries lifecycle status='paid'
```

---

## 2. Historique des phases

| Phase     | Date        | Description                                            |
|-----------|-------------|--------------------------------------------------------|
| Existant  | < 2026-05   | Stripe Connect Direct Charges + Controller API. Commission `users.commission_rate`. Tables `transactions` (caisse), `appointment_payouts` (escrow), `payouts` (audit). |
| **1**     | 2026-05-12  | **Migration ledger** : `CREATE TABLE financial_ledger` + 7 indexes (4 lookup + 3 UNIQUE partiels idempotence). Aucun comportement runtime changé. |
| **2**     | 2026-05-12  | **Dual-write** : helper `utils/ledger.js` + hooks best-effort dans 6 call-sites (3 webhooks + 3 utils). Ledger rempli en parallèle du legacy. |
| **3**     | 2026-05-12  | **Script de validation** : `compare-ledger-vs-legacy.js` qui compare 6 KPI par merchant. Exit code utilisable en cron. |
| **4.0**   | 2026-05-12  | **Infra dual-read** : `utils/dualRead.js` + `utils/ledgerReader.js` + `LedgerDebugBadge.jsx` + admin endpoints flags. |
| **4.1**   | 2026-05-12  | `/api/stripe-connect/performance-stats` branché dual-read. |
| **4.2**   | 2026-05-12  | `/api/stripe-connect/payouts` + métriques in-memory + admin endpoint `/api/admin/ledger-metrics`. |
| **4.3**   | 2026-05-12  | `/api/stripe-connect/balance` (informationnel). |
| **4.4**   | 2026-05-12  | `/api/historique` totaux financiers en ligne. |
| **4.6**   | 2026-05-12  | `/api/stats/online-payments` summary + by_status.refunded. |
| **E2E**   | 2026-05-12  | `scripts/e2e-ledger-complete.js` 12 scénarios pré-LIVE. |
| **LIVE**  | À planifier | Activation production Stripe LIVE après checklist ci-dessous. |

**Skippé intentionnellement** :
- **4.5 `/api/transactions`** : retourne tableau plat sans totaux. Couvert par `/historique`.
- **4.6b `/api/stats/by-payment-method`** : shape distinct, peut être fait plus tard si besoin.

---

## 3. Liste des commits importants

| Commit    | Phase  | Rôle                                                     |
|-----------|--------|----------------------------------------------------------|
| `3a2bba8` | 1      | Migration `financial_ledger` + indexes                   |
| `299c161` | 2      | Helper `utils/ledger.js` + dual-write 6 call-sites       |
| `c3296e3` | 3      | Script `compare-ledger-vs-legacy.js`                     |
| `2923900` | 4.0+4.1| Infra dual-read + `/performance-stats` dual-read         |
| `73fa144` | 4.2    | `/payouts` dual-read + métriques in-memory               |
| `65d9e4e` | 4.3    | `/balance` dual-read (informationnel)                    |
| `75d83d6` | 4.4+4.6| `/historique` + `/stats/online-payments` dual-read       |
| `ba65dd1` | E2E    | Script `e2e-ledger-complete.js` 12 scénarios             |

**Commits adjacents critiques** (hors refactor mais essentiels) :

| Commit    | Rôle                                                                 |
|-----------|----------------------------------------------------------------------|
| `8ac60b5` | Anti-replay webhook + idempotencyKey payouts/refunds + payout sync   |
| `22dd99c` | Phases 1-5 Stripe Connect initiales (onboarding, admin, paiement)    |
| `d1cae2b` | Google Calendar sync V1                                              |

---

## 4. Variables d'environnement Stripe LIVE

À configurer dans **Render** (backend) et **Vercel** (frontend) avant le passage LIVE.

### 4.1 Backend (Render)

```bash
# Stripe LIVE keys (depuis dashboard.stripe.com Live mode)
STRIPE_SECRET_KEY=sk_live_XXXXXXXXXXXXX
STRIPE_PUBLISHABLE_KEY=pk_live_XXXXXXXXXXXXX

# Webhooks (générés dans Stripe Dashboard > Developers > Webhooks)
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_XXX   # Pour endpoint /api/stripe-connect/webhook
                                          # Events : payment_intent.*, charge.refunded,
                                          # payout.paid, payout.failed, account.updated
STRIPE_WEBHOOK_SECRET=whsec_YYY           # Pour endpoint /api/payments/sms/webhook
                                          # (SMS recharge — NE PAS TOUCHER, code legacy)

# Optionnels (Connect Controller API ne nécessite PAS STRIPE_CLIENT_ID)
# STRIPE_CLIENT_ID=ca_XXX                  # Uniquement si OAuth Standard, pas utilisé ici

# Base URL backend pour callbacks Stripe
BACKEND_PUBLIC_URL=https://api.flowia.app  # ou ton URL Render prod

# Google Calendar (déjà existant)
CALENDAR_TOKEN_KEY=<base64 32 bytes>
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...

# Admin
ADMIN_FRONTEND_URL=https://admin.flowia.app
# VERCEL_ADMIN_PREVIEW_REGEX=^https://admin-flowia-.*\\.vercel\\.app$

# DB
DATABASE_URL=postgresql://... (Supabase prod)

# Brevo (email transactionnel)
BREVO_API_KEY=xkeysib-...

# Cloudinary (photos merchant)
CLOUDINARY_URL=cloudinary://...

# Web Push
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:contact@flowia.app

# JWT
JWT_SECRET=<random 32+ chars>
```

### 4.2 Frontend (Vercel)

```bash
VITE_API_URL=https://api.flowia.app
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_XXXXXXXXXXXXX
```

### 4.3 Vérification pré-bascule

```bash
# Sur Render shell ou local avec ENV chargé :
node -e "console.log(process.env.STRIPE_SECRET_KEY.slice(0,7))"
# Doit afficher 'sk_live' (PAS 'sk_test')

# Test rapide API LIVE :
node -e "
const s = require('stripe')(process.env.STRIPE_SECRET_KEY);
s.balance.retrieve().then(b => console.log('livemode:', b.livemode));
"
# Doit afficher 'livemode: true'
```

---

## 5. Checklist Stripe Dashboard LIVE

Connecter à https://dashboard.stripe.com (mode **Live**, switch toggle en haut à droite).

### 5.1 Configuration générale

- [ ] **Activate Live mode** sur le compte plateforme (KYB validation Stripe complète)
- [ ] **Business info** complète : nom légal, SIRET, adresse, TVA
- [ ] **Tax info** : configuration TVA selon régime fiscal
- [ ] **Bank account** plateforme configuré (recevoir les commissions FlowIA)
- [ ] **Domain verified** : `flowia.app` ajouté dans Stripe Connect Settings

### 5.2 Branding

- [ ] **Logo** uploadé (recommandé 256×256 PNG)
- [ ] **Icon** uploadé
- [ ] **Brand color** : couleur principale FlowIA
- [ ] **Accent color** : couleur secondaire
- [ ] **Statement descriptor** : 4-22 caractères (apparaît sur relevés bancaires clients)
- [ ] **Public business name** : "FlowIA"

### 5.3 Apple Pay / Google Pay

- [ ] **Apple Pay domain verification** : ajouter `flowia.app` + télécharger fichier verification + upload dans `frontend/public/.well-known/apple-developer-merchantid-domain-association`
- [ ] **Google Pay** : activé par défaut sur Stripe (rien à faire)
- [ ] Test paiement Apple Pay et Google Pay sur staging avant bascule

### 5.4 Connect (Direct Charges + Controller API)

- [ ] **Connect mode** : Controller API (PAS OAuth Standard)
- [ ] **Charge type** : Direct charges activé
- [ ] **Application fee** : enabled (FlowIA prélève commission via `application_fee_amount`)
- [ ] **Dashboard access** for connected accounts : Full Express
- [ ] **Capabilities required** :
  - `card_payments`
  - `transfers`
  - (optionnel) `link_payments`
- [ ] **Controller settings** :
  - `controller.fees.payer = 'account'` (account paie les frais Stripe)
  - `controller.losses.payments = 'stripe'` (Stripe absorbe les pertes)
  - `controller.requirement_collection = 'application'` (collecte par FlowIA)
- [ ] **Branding personnalisé pour comptes connectés** : logo + couleurs FlowIA visibles sur les pages onboarding hosted Stripe

### 5.5 Payout settings (plateforme)

- [ ] **Schedule plateforme** : automatic ou manual selon politique
- [ ] **Statement descriptor** plateforme configuré
- [ ] **Bank account recevoir commissions** : IBAN FlowIA confirmé et actif

### 5.6 Webhooks LIVE

Deux endpoints à créer dans Stripe Dashboard > Developers > Webhooks :

#### A) Endpoint plateforme (compte plateforme)
- [ ] **URL** : `https://api.flowia.app/api/stripe-connect/webhook`
- [ ] **Listen to events on** : "Connected accounts" + "Your account"
- [ ] **Events** :
  - `account.updated`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `charge.refunded`
  - `payout.paid`
  - `payout.failed`
- [ ] **Signing secret** copié dans `STRIPE_CONNECT_WEBHOOK_SECRET`
- [ ] **Test event** envoyé avec succès (200 OK)

#### B) Endpoint SMS legacy (NE PAS TOUCHER)
- [ ] **URL** : `https://api.flowia.app/api/payments/sms/webhook`
- [ ] **Events** : `payment_intent.succeeded` (SMS recharge plateforme uniquement)
- [ ] **Signing secret** dans `STRIPE_WEBHOOK_SECRET` (différent de Connect)

### 5.7 Redirect URLs Connect

- [ ] **Return URL onboarding** : `https://app.flowia.app/reglages/paiements?stripe_connect=return`
- [ ] **Refresh URL onboarding** : `https://app.flowia.app/reglages/paiements?stripe_connect=refresh`
- [ ] **Test onboarding flow** end-to-end sur un compte test avant bascule

### 5.8 Tax & compliance

- [ ] **VAT collection** activée si nécessaire (Stripe Tax)
- [ ] **1099-K reporting** (US) : N/A pour FR
- [ ] **Strong Customer Authentication** (SCA) : activé par défaut sur Stripe Elements (3DS automatique)

---

## 6. Checklist Render / Infra

### 6.1 Variables d'environnement Render

Cf. section 4. Vérifier dans **Render > Service > Environment** :

- [ ] Toutes les ENV vars de §4.1 présentes et valeurs LIVE (pas test)
- [ ] **NODE_ENV=production**
- [ ] **PORT** non hardcodé (Render assigne dynamiquement)
- [ ] Aucune variable contenant `sk_test` ou `whsec_test` ou similar
- [ ] **Backup ENV** : capture screenshot ou export pour rollback rapide

### 6.2 Single worker vs multi

Le code suppose `scheduleLocked` (pg_try_advisory_lock) pour le cron `releasePayouts` :
- [ ] **Render plan** : si Starter (single instance), OK par défaut
- [ ] **Render plan** : si plus (multi-instance avec autoscale), s'assurer que `scheduleLocked` empêche bien les exécutions parallèles
- [ ] Vérifier dans `backend/src/index.js` que seul **worker 1** exécute les crons

### 6.3 Migrations

- [ ] **Au déploiement Render**, les migrations idempotentes dans `db/index.js` s'appliquent automatiquement au boot
- [ ] Vérifier en DB après deploy :
  ```sql
  \d financial_ledger      -- doit exister
  SELECT COUNT(*) FROM financial_ledger;  -- compteur réel après quelques paiements
  ```
- [ ] Backup Supabase ponctuel **avant** la bascule LIVE (Supabase > Settings > Database > Backups)

### 6.4 Cron releasePayouts

- [ ] Vérifier dans logs Render au boot :
  ```
  [CRON] releasePayouts scheduled (24h)
  ```
- [ ] Premier tick au boot puis toutes les 24h
- [ ] Si besoin de release manuel : endpoint admin existant `POST /api/admin/stripe-payouts/release-now`

### 6.5 Monitoring & Logs

- [ ] Activer **Render Log Drains** vers Datadog/Logflare/etc. si possible (sinon Render Logs UI)
- [ ] Configurer alertes sur patterns :
  - `[LEDGER_METRIC] {"type":"drift"`     → drift détecté
  - `[LEDGER_METRIC] {"type":"fallback"`  → fallback legacy après erreur ledger
  - `[CONNECT WEBHOOK]` errors             → webhook fail
  - `[releasePayouts] FAIL`                → payout fail
  - `[refundAppointment] Stripe error`     → refund fail

### 6.6 Supabase

- [ ] **Connection pooling** activé (PgBouncer) pour éviter exhaustion
- [ ] **Row Level Security** vérifiée sur toutes les tables (ledger inclus)
- [ ] **Réplication** ou backup régulier configuré
- [ ] **DATABASE_URL** pointe vers le pooler (port 6543), pas la connection directe (5432) si on a un grand nombre de connections

### 6.7 Rollback infra

- [ ] **Git tag** créé avant bascule LIVE : `git tag pre-live-2026-XX-XX && git push --tags`
- [ ] **Snapshot Supabase** pris avant LIVE (cf. 6.3)
- [ ] **Procédure rollback documentée** : voir section 11.1

---

## 7. Checklist E2E pré-LIVE (12 scénarios)

Avant bascule LIVE, run sur le compte test :

```bash
cd backend
node scripts/e2e-ledger-complete.js
```

**Critère de passage** : 12/12 PASS (exit code 0).

| # | Scénario                       | Vérifie                                                     |
|---|--------------------------------|-------------------------------------------------------------|
| 1 | `paiement_reussi`              | PI succeeded → 1 row par entry_type, no doublon idempotent  |
| 2 | `refund_complet`               | refundAppointment → ledger refund + status='refunded'       |
| 3 | `refund_partiel`               | stripe.refunds.create partial → ledger refund signé, payment reste pending |
| 4 | `no_show_auto`                 | Cancellation system → acompte conservé, escrow continue     |
| 5 | `payout_escrow_release`        | Cron releasePayouts → Stripe payout + ledger payout_release |
| 6 | `webhook_payout_paid`          | payout.paid → status='paid' sur entries lifecycle           |
| 7 | `webhook_payout_failed`        | payout.failed → status='failed' + alert email               |
| 8 | `annulation_dans_delais`       | Client cancel + refundAppointment auto                      |
| 9 | `annulation_hors_delais`       | Cancel sans refund, escrow continue                         |
| 10| `double_webhook_replay`        | Same event_id 2× → no doublon ledger/tx                     |
| 11| `retry_reseau_idempotency`     | scheduleAppointmentPayout 2× → 1 seule row + idempotencyKey |
| 12| `concurrence_release`          | Promise.all([releasePayouts, releasePayouts]) → no doublon  |

**Limites assumées** :
- Webhooks **simulés via helpers DB** (pas de HTTP signing).
- Pour vrai test signature : Stripe CLI séparé (cf. §11.4).
- Scénarios 5/6/7/12 peuvent **skip** si balance Connect TEST = 0 (settlement Stripe différé). Documenté dans les assertions, ce n'est pas un FAIL.

**Tests signature webhook (manuels avec Stripe CLI)** :

```bash
# Install : scoop install stripe (Windows) ou brew install stripe/stripe-cli/stripe (Mac)
stripe login

# Démarrer le forwarding (laisser tourner dans un terminal)
stripe listen --forward-to localhost:5000/api/stripe-connect/webhook

# Trigger event signé sur compte connecté
stripe trigger payout.paid \
  --account acct_1TUFSaRnGbDwVdTo \
  --add metadata.source=flowia_escrow_release \
  --add metadata.appointment_id=<uuid_appt>

# Pour replay un event existant
stripe events resend evt_xxx --webhook-endpoint we_xxx
```

---

## 8. Plan de rollout LIVE

### 8.1 Pré-bascule (J-1)

- [ ] Section 5 complète (Stripe Dashboard LIVE configuré)
- [ ] Section 6 complète (Render ENV vars LIVE)
- [ ] Section 7 complète (E2E 12/12 PASS)
- [ ] `compare-ledger-vs-legacy.js` retourne 0 drift critique depuis ≥ 7 jours en test
- [ ] Git tag `pre-live-2026-XX-XX` créé
- [ ] Snapshot Supabase pris
- [ ] Communication interne équipe (qui surveille les logs J0/J1)

### 8.2 J0 : Bascule LIVE (mode silencieux)

À ce stade : Stripe est en LIVE mais **AUCUN flag `ledger_read_*` n'est activé** → toute l'UI lit encore le legacy. Le ledger se remplit en parallèle (dual-write).

Étapes :
1. Bascule ENV Render → `STRIPE_SECRET_KEY=sk_live_...` (et `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...` LIVE)
2. Redeploy Render (clean)
3. Smoke test :
   - GET `/api/stripe-connect/account` sur un merchant onboardé → vérifie connexion Stripe LIVE
   - Faire un paiement test LIVE sur 1€ via le booking link
   - Vérifier dans Stripe Dashboard LIVE : PI succeeded
   - Vérifier en DB : `transactions` row 'rdv_online' + `appointment_payouts` row pending + `financial_ledger` 3 entries (payment + commission + stripe_fee si fee > 0) + `payout_hold`
4. Monitor logs 1 heure : aucun `[LEDGER_METRIC] {"type":"drift"` ni `[CONNECT WEBHOOK]` error

### 8.3 J1-J7 : Monitoring observation (legacy reste source de vérité UI)

- [ ] Run `compare-ledger-vs-legacy.js` quotidiennement : 0 drift sur les 4 KPI critiques
- [ ] Inspecter `[LEDGER_METRIC]` count via :
  ```bash
  curl https://api.flowia.app/api/admin/ledger-metrics \
    -H "Authorization: Bearer $ADMIN_JWT"
  ```
- [ ] Si drift détecté : investiguer cause avant d'activer les flags ledger_read_*

### 8.4 J7 : Merchant pilote (1 seul)

Choisir un merchant volontaire (idéalement Hair Coiff Lille = compte primaire connu) pour activer `ledger_read_*` :

```bash
# Visualisation badge debug
curl -X PATCH https://api.flowia.app/api/admin/merchants/$MERCHANT_ID/ledger-flags \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"flag":"ledger_debug_visible","enabled":true}'

# Bascule lecture performance-stats
curl -X PATCH https://api.flowia.app/api/admin/merchants/$MERCHANT_ID/ledger-flags \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"flag":"ledger_read_performance","enabled":true}'
```

- [ ] Vérifier UI : badges visibles + source=ledger sans drift
- [ ] Monitor 24h sur ce merchant : aucun ticket support
- [ ] Activer `ledger_read_payouts` puis `ledger_read_historique` (1 par jour)

### 8.5 J14 : Rollout général

Si J7-J14 = 0 incident sur le merchant pilote :

- [ ] Bascule progressive sur **5 merchants** suivants (1/jour)
- [ ] Monitor logs + métriques
- [ ] Si OK J21 : bascule **tous les merchants** :
  ```sql
  -- À exécuter en transaction Supabase
  UPDATE users
    SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                        || '{"ledger_read_performance":true,"ledger_read_payouts":true,"ledger_read_historique":true}'::jsonb
    WHERE stripe_account_id IS NOT NULL;
  ```
- [ ] Invalider cache : `POST /api/admin/ledger-metrics/reset` (puis attendre TTL 30s pour les caches dualRead)

### 8.6 Rollback strategy

**Niveau 1 — Rollback feature flag (instantané)** :
```bash
curl -X PATCH https://api.flowia.app/api/admin/merchants/$MERCHANT_ID/ledger-flags \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"flag":"ledger_read_performance","enabled":false}'
# Cache 30s -> rollback effectif en < 1 min
```

**Niveau 2 — Rollback global (1 SQL)** :
```sql
UPDATE users
  SET feature_flags = feature_flags
    - 'ledger_read_performance'
    - 'ledger_read_payouts'
    - 'ledger_read_balance'
    - 'ledger_read_historique';
```

**Niveau 3 — Rollback infrastructure (déploiement)** :
```bash
git revert <commit_problematique>
git push origin main
# Render redeploy automatique
```

**Niveau 4 — Rollback complet (avant LIVE)** :
- Restore Supabase snapshot pris en §6.3
- Restore ENV Render avec `sk_test_...` (retour mode test)
- Communication équipe

---

## 9. Critères de succès LIVE

Validation post-bascule (J+7 à J+30) :

| Critère                                       | Cible          | Vérification                                          |
|-----------------------------------------------|----------------|-------------------------------------------------------|
| 0 drift critique                              | `drift = 0`    | `compare-ledger-vs-legacy.js --tolerance 0`           |
| 0 double payout                               | unique payouts | `SELECT stripe_payout_id, COUNT(*) FROM appointment_payouts GROUP BY 1 HAVING COUNT(*) > 1` → 0 row |
| 0 double refund                               | unique refunds | `SELECT stripe_refund_id, COUNT(*) FROM transactions WHERE source='rdv_refund' GROUP BY 1 HAVING COUNT(*) > 1` → 0 row |
| 0 mismatch Stripe vs ledger                   | aligné         | Inspect Stripe Dashboard PI list vs `financial_ledger` rows payment |
| 0 mismatch ledger vs legacy                   | aligné         | Cf. compare script                                    |
| Latence webhook < 5s                          | < 5000ms       | Stripe Dashboard > Webhooks > Logs                    |
| Taux fallback < 1%                            | < 1%           | `GET /api/admin/ledger-metrics` → `totals.fallback / totals.calls` |
| Taux ledger_error < 0.1%                      | < 0.1%         | idem `totals.ledger_error`                            |
| Aucune row `failed_refunds` non résolue       | 0              | `SELECT COUNT(*) FROM failed_refunds WHERE resolved_at IS NULL` |
| Cron releasePayouts tourne chaque 24h         | OK             | `[releasePayouts]` dans Render Logs au moins 1× par 24h |

---

## 10. Plan de décommission future du legacy

> **À NE PAS exécuter avant ≥ 90 jours de stabilité LIVE complète.**

Une fois le ledger source de vérité prouvée et stable depuis longtemps (recommandation : ≥ 3 mois sans incident), on pourra dépréger les chemins legacy redondants. **Ce plan est documenté ici à titre indicatif, mais ne doit être lancé qu'après décision explicite équipe + business.**

### 10.1 Conserver intact (NE JAMAIS supprimer)

- **`appointment_payouts`** : reste critique pour le scheduling cron `releasePayouts`. Le ledger ne le remplace pas (différents lifecycle).
- **`processed_stripe_events`** : anti-replay webhook, indépendant du ledger.
- **`payouts`** : audit log payouts Stripe.
- **`transactions`** : caisse (cash, card, walkin) NON couvert par le ledger. Conservé.

### 10.2 Candidats à dépréciation (≥ 90 jours stabilité)

1. **`routes/stripe-balance.js`** (v3) : déprécier en faveur de `dualRead` sur `/balance` ledger.
2. **Écritures `transactions` source='rdv_online' / 'rdv_refund'** : la lecture est déjà sur le ledger ; on pourrait arrêter d'écrire en parallèle dans `transactions`. **MAIS** attention : la page `/historique` et `/stats/by-payment-method` consomment `transactions` pour MÉLANGER online + cash + walkin. Tant que ces pages ne sont pas refactorées pour additionner ledger + transactions cash-only, on **GARDE** l'écriture dual-write.
3. **Endpoint `transactionsApi.getTransactions`** : si la page Transactions.jsx n'est plus utilisée (ou refactorée pour lire le ledger), on peut déprégrer.

### 10.3 Procédure de dépréciation type

Pour chaque candidat :
1. Désactiver l'écriture (1 commit)
2. Garder la table 30 jours en read-only
3. Vérifier 0 lecture résiduelle (logs)
4. Backup + `DROP TABLE` ou rename `xxx_deprecated_2027` selon préférence
5. **Ne JAMAIS DROP** : préférer renommer avec suffix `_deprecated_YYYY` pour rollback possible

---

## 11. Commandes utiles, debug, rollback

### 11.1 Commandes scripts

```bash
# Comparer ledger vs legacy sur les dernières 24h
node backend/scripts/compare-ledger-vs-legacy.js

# Comparer depuis une date précise
node backend/scripts/compare-ledger-vs-legacy.js --since 2026-05-12

# Comparer 1 seul merchant
node backend/scripts/compare-ledger-vs-legacy.js --user <uuid>

# JSON output pour parsing CI/cron
node backend/scripts/compare-ledger-vs-legacy.js --json > drift-report.json

# Tolérance 5 cents (utile si Stripe fee fluctue)
node backend/scripts/compare-ledger-vs-legacy.js --tolerance 5

# Run E2E complet (12 scénarios)
node backend/scripts/e2e-ledger-complete.js

# Run 1 scénario isolé
node backend/scripts/e2e-ledger-complete.js --scenario 5

# Run sans cleanup (inspection manuelle des rows test)
node backend/scripts/e2e-ledger-complete.js --no-cleanup --scenario 2
```

### 11.2 Commandes curl admin

```bash
# Liste des flags ledger d'un merchant
curl https://api.flowia.app/api/admin/merchants/$MERCHANT_ID/ledger-flags \
  -H "Authorization: Bearer $ADMIN_JWT"

# Activer la bascule lecture sur un flag
curl -X PATCH https://api.flowia.app/api/admin/merchants/$MERCHANT_ID/ledger-flags \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"flag":"ledger_read_performance","enabled":true,"reason":"phase 4 pilot"}'

# Désactiver (rollback instantané, cache 30s)
curl -X PATCH https://api.flowia.app/api/admin/merchants/$MERCHANT_ID/ledger-flags \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"flag":"ledger_read_performance","enabled":false,"reason":"rollback drift detected"}'

# Snapshot métriques ledger (in-memory)
curl https://api.flowia.app/api/admin/ledger-metrics \
  -H "Authorization: Bearer $ADMIN_JWT"

# Reset compteurs (sans redéployer)
curl -X POST https://api.flowia.app/api/admin/ledger-metrics/reset \
  -H "Authorization: Bearer $ADMIN_JWT"

# Voir state d'un compte connecté Stripe (admin merchant)
curl https://api.flowia.app/api/stripe-connect/account \
  -H "Authorization: Bearer $MERCHANT_JWT"

# Trigger manuel release payouts (admin)
curl -X POST https://api.flowia.app/api/admin/stripe-payouts/release-now \
  -H "Authorization: Bearer $ADMIN_JWT"
```

### 11.3 Grep Render logs

```bash
# Logs Render (via Render UI ou CLI)
# Patterns clés à grep :

# Drift detecté
[LEDGER_METRIC] {"type":"drift"

# Fallback legacy après erreur ledger
[LEDGER_METRIC] {"type":"fallback"

# Webhook events
[CONNECT WEBHOOK] payment_intent.succeeded
[CONNECT WEBHOOK] charge.refunded
[CONNECT WEBHOOK] payout.paid
[CONNECT WEBHOOK] payout.failed
[CONNECT WEBHOOK] event already processed   # = anti-replay OK

# Refunds
[refundAppointment] charge_mode=direct
[refundAppointment] Stripe error            # = refund failed
[failedRefund] retry attempt

# Payouts cron
[releasePayouts] processing N due payouts
[releasePayouts] released id=xxx
[releasePayouts] FAIL id=xxx                # = payout failed

# Ledger insert errors
[ledger] insert fail entry_type=
[ledger] markRefunded fail
[ledger] updateStatusForPayout fail
```

### 11.4 Debug Stripe CLI

```bash
# Install
scoop install stripe   # Windows
brew install stripe/stripe-cli/stripe   # Mac
curl -fsSL https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg   # Linux

# Login
stripe login

# Forward webhooks vers local
stripe listen --forward-to localhost:5000/api/stripe-connect/webhook

# Trigger events
stripe trigger payment_intent.succeeded
stripe trigger payout.paid --account acct_XXX --add metadata.appointment_id=YYY
stripe trigger payout.failed

# Replay un event existant
stripe events resend evt_XXX --webhook-endpoint we_XXX

# Inspect un PI / charge / refund / payout en LIVE
stripe payment_intents retrieve pi_XXX
stripe refunds retrieve re_XXX
stripe payouts retrieve po_XXX
stripe accounts retrieve acct_XXX

# Lister les events recents (debug post-mortem)
stripe events list --limit 20
```

### 11.5 Procédures de debug courantes

#### Drift sur un merchant
```bash
# 1. Identifier le merchant
node backend/scripts/compare-ledger-vs-legacy.js --json | jq '.merchants[] | select(.status=="DRIFT")'

# 2. Inspecter ses rows
psql $DATABASE_URL -c "
  SELECT entry_type, status, COUNT(*), SUM(amount_cents)
    FROM financial_ledger
   WHERE user_id = '$MERCHANT_ID'
   GROUP BY 1,2 ORDER BY 1,2;
"

# 3. Comparer vs transactions
psql $DATABASE_URL -c "
  SELECT source, payment_status, COUNT(*), SUM(gross_amount_cents)
    FROM transactions
   WHERE user_id = '$MERCHANT_ID' AND source IN ('rdv_online','rdv_refund')
   GROUP BY 1,2 ORDER BY 1,2;
"

# 4. Rollback flag si drift > seuil
curl -X PATCH .../ledger-flags -d '{"flag":"ledger_read_performance","enabled":false}'
```

#### Refund failed (failed_refunds row)
```bash
# Lister les refunds en échec non résolus
psql $DATABASE_URL -c "
  SELECT id, payment_intent_id, amount_cents, retry_count,
         stripe_error_message, created_at, updated_at
    FROM failed_refunds
   WHERE resolved_at IS NULL
   ORDER BY updated_at DESC;
"

# Retry admin
curl -X POST https://api.flowia.app/api/admin/failed-refunds/$ID/retry \
  -H "Authorization: Bearer $ADMIN_JWT"
```

#### Payout failed (alerter merchant)
```bash
# Lister les payouts failed récents
psql $DATABASE_URL -c "
  SELECT user_id, stripe_payout_id, amount_cents, failure_reason, failed_at
    FROM payouts
   WHERE status = 'failed' AND failed_at >= NOW() - INTERVAL '30 days'
   ORDER BY failed_at DESC;
"

# Vérifier appointment_payouts associés
psql $DATABASE_URL -c "
  SELECT id, appointment_id, amount_cents, stripe_payout_id,
         stripe_error_message, retry_count, status
    FROM appointment_payouts
   WHERE status = 'failed' AND user_id = '$MERCHANT_ID';
"

# Retry (admin réinitialise retry_count + status='pending')
psql $DATABASE_URL -c "
  UPDATE appointment_payouts
     SET status='pending', retry_count=0, stripe_error_message=NULL
   WHERE id = '$AP_ID';
"
# Puis cron releasePayouts retentera dans 24h, OU declenchement manuel via /release-now
```

#### Webhook event manqué (Stripe a un event mais nous non)
```bash
# Lister derniers events Stripe pour debug
stripe events list --limit 20

# Inspecter un event précis
stripe events retrieve evt_XXX

# Replayer pour reprocess côté FlowIA
stripe events resend evt_XXX --webhook-endpoint we_XXX

# Vérifier qu'on a bien reçu
psql $DATABASE_URL -c "
  SELECT * FROM processed_stripe_events WHERE event_id = 'evt_XXX';
"
```

#### Double-write semble manquer (ledger entries absentes)
```bash
# Symptome : transaction rdv_online existe mais pas l'entry ledger payment
psql $DATABASE_URL -c "
  SELECT t.appointment_id, t.stripe_payment_intent_id, t.gross_amount_cents
    FROM transactions t
   LEFT JOIN financial_ledger fl
     ON fl.appointment_id = t.appointment_id AND fl.entry_type = 'payment'
   WHERE t.source = 'rdv_online'
     AND t.user_id = '$MERCHANT_ID'
     AND fl.id IS NULL
   LIMIT 20;
"

# Si rows orphelines : check Render logs pour [ledger] insert fail
# autour de l'event payment_intent.succeeded correspondant
```

---

## 12. Glossaire

| Terme                  | Définition                                                       |
|------------------------|------------------------------------------------------------------|
| **Direct charges**     | PaymentIntent créé sur le compte connecté du merchant (pas la plateforme). Argent va direct au merchant, FlowIA prélève `application_fee_amount`. |
| **Controller API**     | Mode Stripe Connect où la plateforme contrôle dashboard, requirements, payouts (vs OAuth Standard où le merchant a son propre Stripe). |
| **application_fee**    | Commission FlowIA prélevée sur chaque paiement. Transit vers le compte plateforme. |
| **Escrow**             | FlowIA garde l'argent du paiement client sur le balance Connect du merchant pendant `payout_hold_days` avant virement vers son IBAN. Sécurité refund. |
| **payout_hold_days**   | Délai en jours entre la date du RDV et la libération de l'argent vers l'IBAN merchant. Configurable par merchant (défaut 3, cap 30). |
| **Settlement**         | Délai Stripe entre la création du PI et le passage de `pending` à `available` sur le balance Connect. ~5-7 jours pour les CB FR. |
| **Dual-write**         | Écrire en parallèle dans le ledger ET dans les tables legacy. Permet de comparer + rollback safe. |
| **Dual-read**          | Lire en parallèle du ledger ET du legacy. Comparer drift. Choisir source selon feature flag. |
| **Drift**              | Écart numérique entre la valeur ledger et la valeur legacy. Indique un bug à investiguer. |
| **Idempotency**        | Garantie qu'une opération peut être répétée sans effet de bord (retry réseau, webhook replay). |
| **Feature flag**       | Toggle stocké dans `users.feature_flags JSONB` qui active/désactive une bascule ledger par merchant. |
| **Fallback**           | Mécanisme qui retombe automatiquement sur le legacy si la lecture ledger échoue. Garantie no-degradation UI. |
| **Snapshot**           | Valeur figée au moment d'un événement (ex: `commission_rate_snapshot` au moment du payment). Immune aux changes futurs. |

---

**Fin du document.** Mettre à jour à chaque évolution structurelle de l'architecture financière.
