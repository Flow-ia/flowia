-- ─────────────────────────────────────────────────────────────────────────
-- Migration : partitionnement des tables `transactions` et `appointments`
-- ─────────────────────────────────────────────────────────────────────────
--
-- ⚠️  CE SCRIPT N'EST PAS EXÉCUTÉ AUTOMATIQUEMENT — voir MIGRATION_PARTITIONING.md
--     pour la procédure complète, les pré-requis et les checks post-migration.
--
-- À exécuter UNIQUEMENT quand :
--   - `transactions` ou `appointments` dépassent ~5M lignes,
--     ET
--   - les requêtes /stats/* tombent au-delà de 1–2 secondes en p95,
--   - la maintenance (VACUUM / ANALYZE / REINDEX) devient pénible.
--
-- Avant ces seuils, le partitionnement n'apporte aucun gain mesurable,
-- juste de la complexité opérationnelle. Préférer un audit d'indexes (déjà
-- fait dans backend/src/db/index.js).
--
-- Stratégie : partitionnement DECLARATIVE PARTITIONING natif Postgres,
-- RANGE BY (date) — 1 partition par trimestre. Conservation des données
-- existantes via copie ligne à ligne (pas de DROP).
--
-- ⚠️ Pré-requis impératifs :
--   1. Fenêtre de maintenance de 30–90 min (downtime) — l'application
--      doit être STOPPÉE le temps de la migration pour éviter les writes
--      sur l'ancienne table pendant la copie.
--   2. Backup full de la base (pg_dump --schema=public) effectué dans
--      l'heure précédente, vérifié restaurable.
--   3. Extension pgcrypto active (gen_random_uuid) — déjà OK sur Supabase.
--   4. Tester d'abord sur une COPIE de la base prod (Supabase staging ou
--      une nouvelle DB temporaire).
--
-- Limitations à connaître :
--   - PRIMARY KEY doit inclure la colonne de partition (`date`) →
--     PK passe de (id) à (id, date). Aucun impact applicatif (UUID toujours
--     unique en pratique), MAIS les FK existantes pointant vers `id`
--     simple doivent être recréées (FK vers (id, date) ou retirées).
--   - Les FK depuis transaction_items/appointment_items/credit_transactions/
--     referral_uses/promo_usage_logs vers transactions(id) ou appointments(id)
--     sont retirées dans cette migration. L'intégrité référentielle est
--     remplacée par un check applicatif côté Node (ON DELETE CASCADE
--     simulé via DELETE en cascade dans les routes admin).
--   - Les UPDATE qui changent `date` sur une ligne existante doivent
--     déplacer la ligne entre partitions (Postgres 11+ le fait
--     automatiquement). Performance OK, juste signaler.
--
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. ANALYSE PRÉ-MIGRATION ─────────────────────────────────────────────
-- Vérifie le volume actuel — si < 1M lignes, AVORTER la migration : le
-- partitionnement n'est pas justifié. À adapter selon ton seuil (5M conseillé).
DO $$
DECLARE
  tx_count BIGINT;
  apt_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO tx_count FROM transactions;
  SELECT COUNT(*) INTO apt_count FROM appointments;
  RAISE NOTICE 'transactions: % lignes, appointments: % lignes', tx_count, apt_count;
  IF tx_count < 1000000 AND apt_count < 1000000 THEN
    RAISE EXCEPTION 'Volume trop faible (tx=%, apt=%) — partitionnement inutile, ROLLBACK',
      tx_count, apt_count;
  END IF;
END $$;

-- ── 2. PARTITIONNEMENT DE `transactions` ──────────────────────────────────
-- 2.1 Renommer l'ancienne table (encore référencée par les FK existantes)
ALTER TABLE transactions RENAME TO transactions_old;

-- 2.2 Retirer temporairement les FK qui pointent vers transactions_old.id
--     (elles seront ré-ajoutées vers la nouvelle table après copie).
ALTER TABLE transaction_items
  DROP CONSTRAINT IF EXISTS transaction_items_transaction_id_fkey;
ALTER TABLE transaction_payments
  DROP CONSTRAINT IF EXISTS transaction_payments_transaction_id_fkey;
ALTER TABLE credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_transaction_id_fkey;
ALTER TABLE referral_uses
  DROP CONSTRAINT IF EXISTS referral_uses_transaction_id_fkey;
ALTER TABLE promo_usage_logs
  DROP CONSTRAINT IF EXISTS promo_usage_logs_transaction_id_fkey;

-- 2.3 Créer la table partitionnée (mêmes colonnes que l'originale).
--     PK étendue à (id, date) — exigence Postgres pour les tables partitionnées.
CREATE TABLE transactions (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount          NUMERIC(10,2) NOT NULL,
  type            VARCHAR(10) NOT NULL CHECK (type IN ('income','expense','revenue','refund','adjustment')),
  payment_method  VARCHAR(20) DEFAULT 'cash',
  description     TEXT,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  time            TIME,
  datetime_iso    TEXT,
  source          VARCHAR(50) DEFAULT 'manual',
  -- (toutes les autres colonnes ajoutées par migration sur la table originale
  --  doivent être listées ici. Si tu vois CREATE TABLE original dans
  --  backend/src/db/index.js, copier la liste complète à jour avant exécution.)
  appointment_id        UUID,
  category_id_alt       UUID, -- exemple : remplacer par les colonnes réelles
  promo_code_id         UUID,
  discount_amount       NUMERIC(10,2),
  original_amount       NUMERIC(10,2),
  client_email          VARCHAR(255),
  client_note           TEXT,
  qty_total             INT,
  global_client_id      UUID,
  idempotency_key       VARCHAR(64),
  signed_by_employee_id UUID,
  locked                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, date)
) PARTITION BY RANGE (date);

-- 2.4 Créer les partitions par trimestre. Adapter les bornes à la plage
--     réelle des données existantes (cf. RAISE NOTICE étape 1).
--     Les partitions futures seront créées par un cron mensuel séparé
--     (cf. MIGRATION_PARTITIONING.md section « maintenance »).
CREATE TABLE transactions_2024_q4 PARTITION OF transactions
  FOR VALUES FROM ('2024-10-01') TO ('2025-01-01');
CREATE TABLE transactions_2025_q1 PARTITION OF transactions
  FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
CREATE TABLE transactions_2025_q2 PARTITION OF transactions
  FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
CREATE TABLE transactions_2025_q3 PARTITION OF transactions
  FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE transactions_2025_q4 PARTITION OF transactions
  FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
CREATE TABLE transactions_2026_q1 PARTITION OF transactions
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE transactions_2026_q2 PARTITION OF transactions
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE transactions_2026_q3 PARTITION OF transactions
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE transactions_2026_q4 PARTITION OF transactions
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
-- Partition catch-all pour les valeurs hors plage (sécurité).
CREATE TABLE transactions_default PARTITION OF transactions DEFAULT;

-- 2.5 Recréer les indexes critiques (créés sur la table mère = appliqués
--     à toutes les partitions automatiquement).
CREATE INDEX idx_transactions_user_id           ON transactions(user_id);
CREATE INDEX idx_transactions_user_date_type    ON transactions(user_id, date DESC, type);
CREATE INDEX idx_transactions_user_date_time    ON transactions(user_id, date DESC, time DESC NULLS LAST);
CREATE INDEX idx_transactions_user_client_type  ON transactions(user_id, client_email, type);
CREATE INDEX idx_transactions_user_emp_date     ON transactions(user_id, employee_id, date DESC) WHERE employee_id IS NOT NULL;
CREATE INDEX idx_transactions_promo_code        ON transactions(promo_code_id) WHERE promo_code_id IS NOT NULL;
CREATE INDEX idx_transactions_user_pm_date      ON transactions(user_id, payment_method, date DESC) WHERE payment_method IS NOT NULL;
CREATE INDEX idx_transactions_global_client     ON transactions(global_client_id) WHERE global_client_id IS NOT NULL;
CREATE UNIQUE INDEX idx_transactions_user_idemp ON transactions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2.6 Copier les données. INSERT … SELECT route automatiquement chaque
--     ligne dans la bonne partition selon `date`. Sur 5M lignes, compter
--     5–15 min selon la taille de l'instance Supabase.
INSERT INTO transactions
  SELECT * FROM transactions_old;

-- 2.7 Recréer les FK depuis les tables filles vers transactions
--     ATTENTION : Postgres ne permet pas de FK vers une PK composite (id,
--     date) côté table fille qui ne porte que `transaction_id`. Solution :
--     PAS de FK, intégrité applicative uniquement. Documenté dans
--     MIGRATION_PARTITIONING.md. Si tu veux conserver une FK, il faut
--     ajouter une colonne `transaction_date` dans chaque table fille — gros
--     refactor, pas inclus ici.
--
--     Donc rien à faire — les anciennes FK ont été DROP plus haut, les
--     tables filles continuent à fonctionner avec `transaction_id` simple
--     (référence logique uniquement).

-- 2.8 Supprimer l'ancienne table une fois la copie validée
--     (commenter cette ligne pour garder un fallback le temps de vérifier).
DROP TABLE transactions_old;

-- ── 3. PARTITIONNEMENT DE `appointments` ──────────────────────────────────
-- Mêmes étapes appliquées à appointments.
ALTER TABLE appointments RENAME TO appointments_old;

ALTER TABLE appointment_items
  DROP CONSTRAINT IF EXISTS appointment_items_appointment_id_fkey;
ALTER TABLE referral_uses
  DROP CONSTRAINT IF EXISTS referral_uses_appointment_id_fkey;
ALTER TABLE client_notes
  DROP CONSTRAINT IF EXISTS client_notes_appointment_id_fkey;
ALTER TABLE credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_appointment_id_fkey;

CREATE TABLE appointments (
  id                       UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id               UUID REFERENCES booking_services(id) ON DELETE SET NULL,
  employee_id              UUID REFERENCES employees(id) ON DELETE SET NULL,
  client_id                UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  client_name              VARCHAR(255) NOT NULL,
  client_email             VARCHAR(255),
  client_phone             VARCHAR(50),
  date                     DATE NOT NULL,
  start_time               TIME NOT NULL,
  end_time                 TIME NOT NULL,
  duration_minutes         INT NOT NULL,
  status                   VARCHAR(20) DEFAULT 'pending',
  notes                    TEXT,
  cancel_reason            TEXT,
  paid                     BOOLEAN DEFAULT FALSE,
  paid_method              VARCHAR(20),
  transaction_id           UUID,
  source                   VARCHAR(50),
  created_by_employee_id   UUID,
  -- (compléter avec toutes les colonnes ajoutées par migration sur l'originale)
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, date)
) PARTITION BY RANGE (date);

CREATE TABLE appointments_2024_q4 PARTITION OF appointments
  FOR VALUES FROM ('2024-10-01') TO ('2025-01-01');
CREATE TABLE appointments_2025_q1 PARTITION OF appointments
  FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
CREATE TABLE appointments_2025_q2 PARTITION OF appointments
  FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
CREATE TABLE appointments_2025_q3 PARTITION OF appointments
  FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE appointments_2025_q4 PARTITION OF appointments
  FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
CREATE TABLE appointments_2026_q1 PARTITION OF appointments
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE appointments_2026_q2 PARTITION OF appointments
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE appointments_2026_q3 PARTITION OF appointments
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE appointments_2026_q4 PARTITION OF appointments
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
CREATE TABLE appointments_default PARTITION OF appointments DEFAULT;

CREATE INDEX idx_appointments_user_date              ON appointments(user_id, date);
CREATE INDEX idx_appointments_employee               ON appointments(employee_id);
CREATE INDEX idx_appointments_user_emp_date_status   ON appointments(user_id, employee_id, date, status);
CREATE INDEX idx_appointments_user_client            ON appointments(user_id, client_email);
CREATE INDEX idx_appointments_source                 ON appointments(source);
CREATE INDEX idx_appointments_created_by_employee_id ON appointments(created_by_employee_id);
CREATE INDEX idx_appointments_user_status_date_time  ON appointments(user_id, status, date, start_time);
CREATE INDEX idx_appointments_transaction            ON appointments(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_appointments_user_client_id         ON appointments(user_id, client_id) WHERE client_id IS NOT NULL;

INSERT INTO appointments
  SELECT * FROM appointments_old;

-- DROP TABLE appointments_old; -- décommenter une fois la copie validée

-- ── 4. ANALYSE POST-MIGRATION ─────────────────────────────────────────────
-- Met à jour les statistiques pour le query planner.
ANALYZE transactions;
ANALYZE appointments;

-- Commit final. Si une étape précédente a levé une exception, ROLLBACK.
COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- POST-MIGRATION CHECKS (à exécuter manuellement après COMMIT)
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Compter les lignes par partition
--    SELECT relname, n_live_tup
--      FROM pg_stat_user_tables
--     WHERE relname LIKE 'transactions_%' OR relname LIKE 'appointments_%'
--     ORDER BY relname;
--
-- 2. Vérifier que les requêtes utilisent partition pruning
--    EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*) FROM transactions
--      WHERE user_id = '<merchant_id>' AND date BETWEEN '2026-01-01' AND '2026-03-31';
--    → doit montrer "Append" + 1 seule partition scannée (pas toutes).
--
-- 3. Tester l'application
--    - Créer une transaction de test → vérifier qu'elle atterrit dans la
--      bonne partition (transactions_2026_q2 si avril 2026).
--    - Modifier la `date` d'une transaction → Postgres déplace la ligne
--      automatiquement vers la nouvelle partition (logguer, pas une erreur).
--
-- 4. Maintenance future
--    - Cron mensuel pour créer la partition du trimestre N+1 :
--        CREATE TABLE transactions_2027_q1 PARTITION OF transactions
--          FOR VALUES FROM ('2027-01-01') TO ('2027-04-01');
--    - Archivage des partitions anciennes (> 3 ans) :
--        ALTER TABLE transactions DETACH PARTITION transactions_2024_q4;
--        -- Puis dump + DROP la table détachée si plus utile.
