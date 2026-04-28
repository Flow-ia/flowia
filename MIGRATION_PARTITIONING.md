# Migration partitionnement `transactions` / `appointments`

> **Statut** : script préparé, **non exécuté**. À déclencher manuellement
> **uniquement** quand le volume justifie la migration.

## TL;DR

| | Volume actuel (1 commerçant) | Seuil de bascule | Volume cible 2 000 commerçants |
|---|---|---|---|
| `transactions` | quelques milliers | **5M lignes** | ~24M / an |
| `appointments` | quelques milliers | **5M lignes** | ~24M / an |

**Aujourd'hui : ne PAS exécuter.** Les indexes ajoutés au commit 31
(scaling) suffisent. Postgres tient confortablement 10M+ lignes par table
avec les bons indexes.

**Quand exécuter** : quand `SELECT COUNT(*) FROM transactions` retourne
> 5 000 000 **ET** que les requêtes `/stats/*` dépassent 1–2 s en p95
(monitoring Render / Supabase).

## Pré-requis impératifs

1. **Fenêtre de maintenance** : 30–90 min selon le volume. L'application
   doit être **stoppée** (mode maintenance) pendant la copie pour éviter
   les writes sur l'ancienne table après son renommage.
2. **Backup full** de la base (`pg_dump` ou snapshot Supabase) effectué
   dans l'heure précédente, **vérifié restaurable**.
3. **Test sur staging** : exécuter d'abord le script sur une copie de la
   base prod (Supabase staging ou DB temporaire). Mesurer le temps réel
   sur le volume cible.
4. **Synchroniser le schéma** : avant exécution, comparer les colonnes
   actuelles de `transactions` / `appointments` avec celles listées dans
   le script SQL — les migrations cumulatives sur `db/index.js` ont pu
   ajouter des colonnes que le script ne connaît pas. **Mettre à jour le
   script** si besoin.
5. **Vérifier les FK** : lister les tables qui référencent
   `transactions(id)` ou `appointments(id)` et confirmer qu'on accepte de
   les retirer (intégrité applicative uniquement après migration).

## Architecture cible

- **DECLARATIVE PARTITIONING** natif Postgres, `RANGE BY (date)`.
- **1 partition par trimestre** (équilibre entre nombre de partitions et
  taille). À 24M lignes/an et 4 trimestres, ~6M lignes par partition →
  rapide à scanner.
- **Partition `_default`** catch-all pour les valeurs hors plage (sécurité).

```
transactions (parent, partitionnée)
├── transactions_2024_q4
├── transactions_2025_q1
├── transactions_2025_q2
├── ...
├── transactions_2026_q4
└── transactions_default
```

## Limitations à connaître

### Clé primaire

Postgres exige que la PK d'une table partitionnée **inclue la colonne de
partition**. Donc :

- Avant : `PK (id)`
- Après : `PK (id, date)`

L'`id` UUID reste pratiquement unique. Les requêtes `WHERE id = '…'` sont
légèrement plus lentes (Postgres doit scanner toutes les partitions),
**sauf** si la requête inclut aussi `date` — ce qui est presque toujours
le cas via les index `(user_id, date)`.

### Foreign keys

Postgres **interdit** de poser une FK depuis une table fille
(`transaction_items.transaction_id`) vers une PK composite
`(id, date)` si la table fille n'a que `transaction_id` simple.

**Conséquence** : ce script **retire les FK existantes** depuis :

- `transaction_items.transaction_id` → `transactions(id)`
- `transaction_payments.transaction_id`
- `credit_transactions.transaction_id`
- `referral_uses.transaction_id`
- `promo_usage_logs.transaction_id`
- `appointment_items.appointment_id` → `appointments(id)`
- `referral_uses.appointment_id`
- `client_notes.appointment_id`
- `credit_transactions.appointment_id`

L'**intégrité référentielle** devient **applicative** (le code Node doit
gérer les DELETE en cascade quand un parent est supprimé).

> Alternative pour conserver les FK : ajouter `transaction_date DATE` /
> `appointment_date DATE` dans chaque table fille et créer une FK
> composite `(transaction_id, transaction_date) → (id, date)`. **Gros
> refactor** — pas inclus dans le script. À envisager seulement si
> l'intégrité référentielle est critique pour ton cas.

### UPDATE de la colonne `date`

Si une route UPDATE la `date` d'une transaction ou d'un RDV existant,
Postgres 11+ déplace automatiquement la ligne entre partitions. Pas
d'erreur, juste une opération un peu plus coûteuse. Logger pour
diagnostic mais pas bloquant.

## Procédure d'exécution

### Étape 1 — Préparation (J-7 à J-1)

```bash
# 1. Snapshot Supabase (Dashboard → Database → Backups → Create new backup)
# 2. Cloner la prod dans staging
# 3. Sur staging :
psql $STAGING_DATABASE_URL -f backend/migrations/partition-transactions-appointments.sql
# 4. Mesurer le temps réel d'exécution.
# 5. Smoke test des routes critiques (caisse, agenda, stats) sur staging.
```

### Étape 2 — Bascule prod (jour J, créneau low-traffic)

```bash
# 1. Mode maintenance ON (côté Render : passer le service en pause OU
#    rediriger le frontend Vercel vers une page maintenance.html).
# 2. Vérifier qu'aucune écriture n'arrive plus :
psql $DATABASE_URL -c "SELECT NOW(), MAX(created_at) FROM transactions;"
# 3. Backup juste-avant (full + WAL) :
pg_dump $DATABASE_URL --schema-only > /tmp/schema-pre-partition.sql
pg_dump $DATABASE_URL > /tmp/full-pre-partition.sql
# 4. Exécuter le script :
psql $DATABASE_URL -v ON_ERROR_STOP=1 -f backend/migrations/partition-transactions-appointments.sql
# 5. Vérifier les compteurs :
psql $DATABASE_URL -c "SELECT relname, n_live_tup FROM pg_stat_user_tables
  WHERE relname LIKE 'transactions%' OR relname LIKE 'appointments%' ORDER BY 1;"
# 6. Sortie de maintenance.
```

### Étape 3 — Validation post-migration

Tests sur prod immédiatement après la bascule :

```sql
-- 1. Partition pruning : doit montrer 1 seule partition scannée
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*) FROM transactions
WHERE user_id = '<merchant_id>'
  AND date BETWEEN '2026-04-01' AND '2026-06-30';

-- 2. Insertion : doit aller dans la bonne partition
INSERT INTO transactions (user_id, amount, type, date)
VALUES ('<merchant_id>', 1.00, 'revenue', CURRENT_DATE)
RETURNING tableoid::regclass AS partition_used;

-- 3. UPDATE de date : doit migrer la ligne entre partitions
UPDATE transactions SET date = '2025-01-15'
WHERE id = '<id_test>' AND date = CURRENT_DATE
RETURNING tableoid::regclass;
```

Smoke test applicatif :

- ✅ Caisse → encaisser une transaction → apparaît dans le dashboard
- ✅ Agenda → créer un RDV → apparaît dans /book/:slug
- ✅ Stats → CA du jour / mois corrects
- ✅ Refund → le transaction_id retrouve le RDV lié

## Maintenance future

### Cron mensuel — créer la partition du trimestre N+1

À ajouter dans `backend/src/index.js` (cron protégé par
`distributedLock`) :

```js
// Le 15 de chaque mois → créer la partition du trimestre suivant si pas
// déjà existante. Évite les INSERT qui tomberaient dans _default au
// changement de trimestre.
async function ensureNextQuarterPartition() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const nextQuarterStart = new Date(year,
    Math.floor(month / 3) * 3 + 3, 1); // début trimestre N+1
  const partName = `transactions_${nextQuarterStart.getFullYear()}_q${Math.floor(nextQuarterStart.getMonth() / 3) + 1}`;
  // ... CREATE TABLE IF NOT EXISTS partName PARTITION OF transactions ...
}
```

### Archivage des partitions anciennes (> 3 ans)

```sql
-- Détacher la partition (données restent accessibles via la table elle-même)
ALTER TABLE transactions DETACH PARTITION transactions_2024_q4;

-- Optionnel : dumper puis dropper si plus utile (≥ 5 ans)
-- pg_dump $DATABASE_URL -t transactions_2024_q4 > archives/2024_q4.sql
DROP TABLE transactions_2024_q4;
```

## Rollback (si quelque chose casse)

Le script est dans une transaction `BEGIN ... COMMIT`. Si une étape lève
une exception avant `COMMIT`, tout est rollback automatiquement.

Si le `COMMIT` est passé mais que des bugs apparaissent en prod :

1. **Mode maintenance ON**
2. Restaurer le backup pré-migration :
   ```bash
   psql $DATABASE_URL -c "DROP TABLE transactions CASCADE; DROP TABLE appointments CASCADE;"
   psql $DATABASE_URL -f /tmp/full-pre-partition.sql
   ```
3. **Mode maintenance OFF**

> Le rollback fait perdre les transactions/RDV créés entre la migration
> et le rollback (si l'app a été remise en service avant le rollback).
> D'où l'importance du mode maintenance pendant la migration.

## Pourquoi pas exécuter maintenant

À 1 commerçant et quelques milliers de lignes :

| Critère | Avant migration | Après migration |
|---|---|---|
| Performance `/stats/today` | < 50 ms | < 50 ms (gain nul) |
| Performance `/stats/forecast` | < 200 ms | < 200 ms (gain nul) |
| Espace DB | minime | minime + overhead partitions |
| Complexité opérationnelle | basse | élevée (cron partitions, FK applicatives) |
| Risque migration | — | élevé (downtime + script complexe) |

Le coût/bénéfice s'inverse uniquement à grand volume. Les indexes ajoutés
au commit 31 (`scaling`) tiendront jusqu'à 10–20M lignes sans souffrir.

## Checklist avant exécution

- [ ] Volume `transactions` ≥ 5M lignes
- [ ] p95 `/stats/*` > 1.5 s sur monitoring Render
- [ ] Backup full + restauration testée
- [ ] Script testé sur staging
- [ ] Schéma du script aligné avec le `CREATE TABLE` réel actuel (toutes
      les colonnes ajoutées par migrations cumulatives copiées dans le script)
- [ ] Liste des FK à retirer validée
- [ ] Fenêtre de maintenance planifiée (créneau < 50 RPS)
- [ ] Équipe technique disponible pendant l'opération
- [ ] Plan de rollback validé
