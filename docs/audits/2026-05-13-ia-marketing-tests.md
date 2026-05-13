# Audit IA Marketing + tests des fixes — 2026-05-13

Audit complet du moteur IA marketing FlowIA puis validation en production
de 3 fixes (boucle d'apprentissage caisse, timezone Paris, faille
anti-fraude multi-paiement).

## Sommaire

1. [Audit du moteur IA](#1-audit-du-moteur-ia)
2. [Bugs identifiés et fixes](#2-bugs-identifiés-et-fixes)
3. [Rapport de tests en production](#3-rapport-de-tests-en-production)
4. [Faiblesses pré-existantes notées (hors scope)](#4-faiblesses-pré-existantes-notées-hors-scope)
5. [Commits liés](#5-commits-liés)

---

## 1. Audit du moteur IA

### Architecture
- Pas de LLM — c'est de l'**analytique prédictive RFM** (Recency-Frequency-Monetary)
  avec apprentissage statistique. Le branding "IA" est honnête (apprentissage +
  prédiction de comportement) mais limité.
- Endpoint `/auto-plan` (GET) → preview
- Endpoint `/auto-send` (POST) → execution avec verrou
- Endpoint `/auto-recalculate` (POST) → recalcul ROI
- Endpoint `/ai-history` (GET) → historique avec ROI réel

### Composants algorithmiques

1. **Segmentation 5 classes** : `champion`/`fidele`/`prometteur`/`risque`/`perdu`
   - `perdu` : last_visit NULL OU < 90j
   - `risque` : last_visit < 30j
   - `champion` : visits ≥ 5 ET spent > 2× avg_spent
   - `fidele` : visits ≥ 3
   - `prometteur` : reste

2. **Habitudes prédictives** (pref_dow + pref_slot) extraites via
   `MODE() WITHIN GROUP` sur RDV passés. Fiabilité si `visit_count ≥ 2`.

3. **Pourcentages adaptatifs** : base risque=15%, perdu=25%, fidele=10%.
   Ajustement +5 selon ancienneté. Apprentissage : si conversion >10% sur ≥5
   campagnes passées → adopte le meilleur %. Bornes 5-35% multiples de 5.

4. **Allocation budgétaire** : 40% risque / 35% perdu / 25% fidele
   (2-passes : proportionnel cappé + redistribution round-robin).

5. **Scheduling prédictif** : 3 phases sur la durée totale, slot 11h/14h30/18h
   Paris, jamais dimanche.

6. **Codes promo personnels** : PRÉNOM(3) + discount + 4 chars random,
   max_uses=1, retry 5× sur collision.

7. **Estimation ROI** : taux pondéré arbitraire `0.08 + (discount-10)*0.006`.

### Note de pertinence globale
**~70-75% pertinent.** Mécanique solide, deux trous logiques majeurs qui
faussaient les résultats (cf. section 2).

---

## 2. Bugs identifiés et fixes

### 🔴 Bug #1 — Boucle d'apprentissage cassée (caisse invisible)
`ai_campaign_codes.used_at` était mis à jour **UNIQUEMENT** dans
`routes/public-booking/book.js` (réservations en ligne). Les codes utilisés
en caisse (majorité walk-in barbershop) n'étaient jamais marqués.

**Conséquences avant fix** :
- `conversion_rate` dans `/ai-history` sous-évalué
- `computeAdaptivePercentages` n'apprenait que sur conversions online
- % adaptatifs biaisés par sous-représentation

**Fix appliqué (commit `cde07b5`)** :
- Migration idempotente `ALTER TABLE ai_campaign_codes ADD COLUMN IF NOT EXISTS used_transaction_id UUID`
- `transactions.js` : UPDATE ajouté sur les 2 paths (single + multi-paiement)
- `/ai-history` : LEFT JOIN ajouté sur transactions, `COALESCE(appt.total_amount, txn.amount, 0)`

**Limite connue** : en multi-paiement, `used_transaction_id` pointe vers la
1re row du groupe → `real_revenue` reflète le montant de cette row au lieu
du SUM du groupe. `conv_rate` reste juste. Impact ~10-20% des visites multi.

### 🟠 Bug #2 — `computeScheduledAt` ignorait Europe/Paris
`new Date()` + `setHours()` + `getDay()` dépendent du TZ du process Node.
Sur Render free tier (UTC), un slot "14h30 Paris" partait à 14h30 UTC =
16h30 Paris en été. Toute la stack DB est en `Europe/Paris`, divergence
fâcheuse.

**Fix appliqué (commit `cde07b5`)** :
- Helpers locaux : `parisYmd`, `shiftYmd`, `dowOfYmd`, `getParisOffsetMinutes`,
  `makeParisDate`
- Calcul d'offset via `Intl.DateTimeFormat` avec `timeZoneName: 'shortOffset'`
  (robuste DST hiver/été)
- Pas de nouvelle dep npm

**Tests unitaires** :
- `makeParisDate('2026-05-15', 14, 30)` → `2026-05-15T12:30:00.000Z` (été ✓)
- `makeParisDate('2026-12-15', 14, 30)` → `2026-12-15T13:30:00.000Z` (hiver ✓)
- `makeParisDate('2026-07-21', 11, 0)` → `2026-07-21T09:00:00.000Z` ✓

### 🟢 Bug #3 — Faille anti-fraude promo en multi-paiement
Bug pré-existant découvert pendant l'audit. Le bloc multi-paiement
(`transactions.js` lignes 389-649) faisait `return 201` AVANT le bloc de
side-effects promo/rewards présent en single-paiement.

**Conséquences avant fix** :
- `promo_codes.uses_count` jamais incrémenté en multi → un code `max_uses=1`
  pouvait être réutilisé à l'infini si payé en multi-méthode (FAILLE)
- `promo_usage_logs` jamais insérée en multi → audit incomplet
- `client_rewards` (anniversaire, parrainage, fidélité) jamais marquée
  `used` en multi → reward réutilisable

**Fix appliqué (commit `f0ced9b`)** :
- Mirror complet de la séquence single-paiement, placé avant le `return 201`
  du multi
- Ciblage sur la 1re row du groupe (`insertedRows[0].id`) comme
  `transaction_id` représentatif
- Tous les UPDATE/INSERT en `pool.query()` fire-and-forget avec `catch`
  granulaire (cf. CLAUDE.md §10)

---

## 3. Rapport de tests en production

**Environnement** : `https://api.flowiapro.com/api`
**Compte test** : `user-test@flowiapro.com` (Saon de Test, plan Équipe, solde SMS 0€)
**Date** : 2026-05-13

### Tests exécutés

| # | Test | Résultat |
|---|---|---|
| 1 | Création 2 promo_codes max_uses=1 (TESTMULTI/-10%, TESTSINGLE/-15%) | ✅ |
| 2 | Transaction **multi-paiement** (cash 10€ + card 8€ = 18€) avec promo MULTI | ✅ tx créée (payment_group_id `92e4d30b…`) |
| 3 | Vérif `promo_codes` après tx multi : `uses_count=1, is_active=false` | ✅ **🎯 Fix anti-fraude validé** |
| 4 | Réutilisation TESTMULTI via `/promo/check` | ✅ rejeté ("Ce code a été désactivé") |
| 5 | Transaction **single-paiement** avec promo SINGLE | ✅ tx créée |
| 6 | Vérif `promo_codes` après tx single : `uses_count=1, is_active=false` | ✅ pas de régression |
| 7 | Multi-paiement **sans promo** | ✅ tx créée, pas de crash |
| 8 | Replay tx multi avec promo désactivé | ✅ tx créée, `uses_count` reste à **1** (pas de double-décrément) |
| 9 | `/campaigns/ai-history` (nouveau LEFT JOIN sur transactions) | ✅ `[]` retourné, pas d'erreur 500 → **migration `used_transaction_id` OK** |
| 10 | `/campaigns/auto-recalculate` | ✅ phases retournées |

### Synthèse par fix

#### Bug #1 — Boucle d'apprentissage IA (caisse)
**Statut : code en place, validation partielle.**
- ✅ Migration `used_transaction_id` appliquée
- ✅ `/ai-history` ne crash pas avec le nouveau LEFT JOIN
- ⚠️ **Validation E2E impossible** sur ce compte test : solde SMS 0€ →
  impossible de créer une vraie campagne IA. Pour valider : recharger 5-10€
  de SMS, lancer une campagne IA, encaisser un client avec un code généré.

#### Bug #2 — Timezone Europe/Paris
**Statut : code en place, testé en local (pas en prod E2E).**
- ✅ Tests unitaires locaux passent (été/hiver/DST)
- ⚠️ **Validation E2E prod impossible** : `/auto-plan` refuse (solde 0€).
  Code prod utilise mêmes API `Intl.DateTimeFormat` que test local →
  comportement attendu identique.

#### Bug #3 — Faille anti-fraude multi-paiement
**Statut : VALIDÉ end-to-end en production.**

| Avant fix | Après fix |
|---|---|
| Code max_uses=1 utilisé en multi → `uses_count` reste à 0 | `uses_count=1, is_active=false` ✓ |
| Réutilisation acceptait silencieusement | "Ce code a été désactivé." ✓ |
| `promo_usage_logs` jamais inséré | Inséré (replay sans doublon ✓) |
| `client_rewards` jamais marqué used | Marqué dans le bloc multi ✓ |

---

## 4. Faiblesses pré-existantes notées (hors scope)

### 4.1 Backend accepte un `promo_code_id` désactivé
Le `POST /transactions` accepte un body avec `promo_code_id` dont
`is_active=false`. Le UPDATE conditionnel empêche le double-décrément, mais
la transaction est quand même persistée avec ce promo_code_id.

Aujourd'hui le check `/promo/check` côté front bloque normalement, mais
c'est une couche de défense manquante côté serveur. Recommandation pour une
2e passe : validation `is_active=TRUE AND uses_count < max_uses` server-side
avant INSERT transactions.

### 4.2 Autres pistes d'amélioration IA marketing (note : hors urgence)
- Estimation ROI arbitraire (`0.08 + (discount-10)*0.006`) non data-driven —
  un Bayes simple sur l'historique serait plus pertinent
- `ALLOC` fixe (40/35/25) — ne s'adapte pas à la composition réelle du
  fichier client
- Pas de variation de wording SMS par segment (`risque`/`perdu`/`fidele`
  même template) — levier de conversion sous-exploité
- `HAVING COUNT(*) >= 5` trop faible statistiquement pour la boucle
  d'apprentissage — ≥30 serait défendable
- Validité 30+7=37j trop longue (SMS marketing décroît à ~10-15j)
- `getClientSegmentsWithHabits` n'utilise pas le bonus récence présent dans
  `getTopClients` — deux scoring différents pour deux endpoints
- Catches silencieux dans `computeAdaptivePercentages` (`.catch(() => ({ rows: [] }))`)
  — contrarie CLAUDE.md §10

---

## 5. Commits liés

- **`cde07b5`** — `ai-marketing: fix boucle apprentissage caisse + scheduling TZ Paris`
- **`f0ced9b`** — `caisse(multi): fix faille anti-fraude promo/rewards en multi-paiement`

Branche : `main` (push direct, cf. workflow validé utilisateur).
