const { Pool } = require('pg');
require('dotenv').config();

// Supporte DATABASE_URL ou variables séparées DB_HOST/DB_USER/DB_PASSWORD
let pool;
if (process.env.DATABASE_URL) {
  // Forcer ssl: false et password string pour les URLs sans credentials
  const connConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl:              process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max:              parseInt(process.env.DB_POOL_MAX)  || 50,
    min:              parseInt(process.env.DB_POOL_MIN)  || 5,
    idleTimeoutMillis:       parseInt(process.env.DB_IDLE_TIMEOUT)  || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT)  || 5000,
    statement_timeout:       parseInt(process.env.DB_STMT_TIMEOUT)  || 15000,
  };
  // Si l'URL ne contient pas de password, pg peut planter → on force via URL parsing
  try {
    const url = new URL(process.env.DATABASE_URL);
    if (!url.password) {
      // Reconstruire la config sans passer par connectionString
      pool = new Pool({
        host:     url.hostname || 'localhost',
        port:     parseInt(url.port) || 5432,
        database: url.pathname.replace(/^\//, '') || 'flowfinances',
        user:     url.username || 'postgres',
        password: '',
        ssl:      false,
      });
    } else {
      pool = new Pool(connConfig);
    }
  } catch {
    pool = new Pool(connConfig);
  }
} else {
  pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'flowfinances',
    user:     process.env.DB_USER     || 'postgres',
    password: String(process.env.DB_PASSWORD || ''),
    ssl:      false,
    max:              parseInt(process.env.DB_POOL_MAX)  || 50,
    min:              parseInt(process.env.DB_POOL_MIN)  || 5,
    idleTimeoutMillis:       30000,
    connectionTimeoutMillis: 5000,
    statement_timeout:       15000,
  });
}

async function initDB() {
  // Helpers migration — déclarés en tête pour éviter TDZ (utilisés dès les
  // CREATE INDEX/ALTER COLUMN plus bas, avant les déclarations historiques).
  const runMigration = async (sql) => {
    try { await pool.query(sql); }
    catch (e) { if (!e.message.includes('already exists')) console.warn('[DB migration]', e.message); }
  };
  const runMig = async (sql) => {
    try { await pool.query(sql); }
    catch (e) { if (!e.message.includes('already exists') && !e.message.includes("n'existe pas")) console.warn('[DB mig]', e.message.slice(0, 80)); }
  };

  await pool.query(`
    -- ── Tables de base ──────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      business_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS verification_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key VARCHAR(255) UNIQUE NOT NULL,
      code VARCHAR(10) NOT NULL,
      data JSONB,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_pins (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      pin_hash VARCHAR(255) NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'revenue' CHECK (type IN ('revenue','expense')),
      icon VARCHAR(50) DEFAULT 'Tag',
      color VARCHAR(20) DEFAULT '#3b82f6',
      parent_id UUID,
      price NUMERIC(10,2) DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS employees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      role VARCHAR(100),
      phone VARCHAR(50),
      avatar_color VARCHAR(20) DEFAULT '#3b82f6',
      is_active BOOLEAN DEFAULT TRUE,
      can_cancel BOOLEAN DEFAULT FALSE,
      can_modify BOOLEAN DEFAULT FALSE,
      can_encash BOOLEAN DEFAULT FALSE,
      show_on_booking BOOLEAN DEFAULT TRUE,
      show_in_caisse BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      amount NUMERIC(10,2) NOT NULL,
      type VARCHAR(10) NOT NULL CHECK (type IN ('income','expense','revenue')),
      payment_method VARCHAR(20) DEFAULT 'cash',
      description TEXT,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      time TIME,
      datetime_iso TEXT,
      source VARCHAR(50) DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Système de réservation ───────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS booking_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_enabled BOOLEAN DEFAULT FALSE,
      slug VARCHAR(100) UNIQUE,
      business_description TEXT,
      address TEXT,
      phone VARCHAR(50),
      timezone VARCHAR(50) DEFAULT 'Europe/Paris',
      advance_booking_days INT DEFAULT 30,
      min_notice_hours INT DEFAULT 1,
      require_account BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS business_hours (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      open_time TIME DEFAULT '09:00',
      close_time TIME DEFAULT '18:00',
      is_open BOOLEAN DEFAULT TRUE,
      UNIQUE(user_id, day_of_week)
    );

    CREATE TABLE IF NOT EXISTS booking_services (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      duration_minutes INT NOT NULL DEFAULT 30,
      price NUMERIC(10,2),
      color VARCHAR(20) DEFAULT '#7c6af7',
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Horaires propres à chaque employé (1 ligne par jour)
    CREATE TABLE IF NOT EXISTS employee_hours (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      open_time TIME DEFAULT '09:00',
      close_time TIME DEFAULT '18:00',
      is_open BOOLEAN DEFAULT TRUE,
      use_business_hours BOOLEAN DEFAULT TRUE,
      UNIQUE(employee_id, day_of_week)
    );

    CREATE TABLE IF NOT EXISTS employee_availability (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      is_available BOOLEAN DEFAULT FALSE,
      note TEXT,
      UNIQUE(employee_id, date)
    );

    CREATE TABLE IF NOT EXISTS client_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255),
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      phone VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, email)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_id UUID REFERENCES booking_services(id) ON DELETE SET NULL,
      employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      client_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
      client_name VARCHAR(255) NOT NULL,
      client_email VARCHAR(255),
      client_phone VARCHAR(50),
      date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      duration_minutes INT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),
      notes TEXT,
      cancel_reason TEXT,
      paid BOOLEAN DEFAULT FALSE,
      paid_method VARCHAR(20),
      transaction_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Lignes de RDV (multi-services) ──────────────────────────────────────
    CREATE TABLE IF NOT EXISTS appointment_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      service_id UUID REFERENCES booking_services(id) ON DELETE SET NULL,
      service_name VARCHAR(255) NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      unit_price NUMERIC(10,2) DEFAULT 0,
      duration_minutes INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Lignes de transaction (détail prestations) ──────────────────────────
    CREATE TABLE IF NOT EXISTS transaction_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      service_id UUID REFERENCES booking_services(id) ON DELETE SET NULL,
      service_name VARCHAR(255) NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      unit_price NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Index ────────────────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id   ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date      ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_categories_user_id     ON categories(user_id);
    CREATE INDEX IF NOT EXISTS idx_employees_user_id      ON employees(user_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON appointments(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_appointments_employee  ON appointments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_employee_hours_emp     ON employee_hours(employee_id);

    -- ── Migrations pour bases existantes ─────────────────────────────────────
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name='booking_settings' AND column_name='require_account') THEN
        ALTER TABLE booking_settings ADD COLUMN require_account BOOLEAN DEFAULT FALSE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name='booking_settings' AND column_name='google_business_url') THEN
        ALTER TABLE booking_settings ADD COLUMN google_business_url TEXT;
      END IF;
    END $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name='employee_hours' AND column_name='use_business_hours') THEN
        ALTER TABLE employee_hours ADD COLUMN use_business_hours BOOLEAN DEFAULT TRUE;
      END IF;
    END $$;


    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
    DO $x$ BEGIN
      ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
        CHECK (type IN ('income','expense','revenue'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $x$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='show_on_booking') THEN
        ALTER TABLE employees ADD COLUMN show_on_booking BOOLEAN DEFAULT TRUE;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='show_in_caisse') THEN
        ALTER TABLE employees ADD COLUMN show_in_caisse BOOLEAN DEFAULT TRUE;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='can_cancel') THEN
        ALTER TABLE employees ADD COLUMN can_cancel BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='can_modify') THEN
        ALTER TABLE employees ADD COLUMN can_modify BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='can_encash') THEN
        ALTER TABLE employees ADD COLUMN can_encash BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='source') THEN
        ALTER TABLE transactions ADD COLUMN source VARCHAR(50) DEFAULT 'manual';
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='appointment_id') THEN
        ALTER TABLE transactions ADD COLUMN appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='paid') THEN
        ALTER TABLE appointments ADD COLUMN paid BOOLEAN DEFAULT FALSE;
        ALTER TABLE appointments ADD COLUMN paid_method VARCHAR(20);
        ALTER TABLE appointments ADD COLUMN transaction_id UUID;
      END IF;
    END $$;
  `);
  // Migration : colonnes total_amount + total_duration sur appointments
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='total_amount') THEN
        ALTER TABLE appointments ADD COLUMN total_amount NUMERIC(10,2) DEFAULT 0;
        ALTER TABLE appointments ADD COLUMN total_duration INT DEFAULT 0;
      END IF;
    END $$;
  `);
  // Migration : table appointment_items
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointment_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      service_id UUID REFERENCES booking_services(id) ON DELETE SET NULL,
      service_name VARCHAR(255) NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      unit_price NUMERIC(10,2) DEFAULT 0,
      duration_minutes INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Migration : categories.price
  await pool.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT NULL`);
  // Migration : transactions.qty_total
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qty_total INT DEFAULT 1`);
  // Audit caisse R1 : idempotency_key pour protéger POST /transactions du
  // double-clic (même UUID client = même transaction, pas de doublon).
  // NULLS DISTINCT (défaut PG) → les lignes sans idempotency_key ne
  // conflictent pas entre elles. Pas de WHERE partial → ON CONFLICT
  // (user_id, idempotency_key) fonctionne en PG 12+.
  await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_idempotency
    ON transactions(user_id, idempotency_key)`);
  // Audit caisse : CHECK amount >= 0 (normalise les eventuels negatifs d'abord).
  await pool.query(`UPDATE transactions SET amount=0 WHERE amount < 0`).catch(() => {});
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name='transactions' AND constraint_name='transactions_amount_nonneg'
      ) THEN
        ALTER TABLE transactions ADD CONSTRAINT transactions_amount_nonneg
          CHECK (amount >= 0);
      END IF;
    END$$;
  `).catch(e => console.warn('[MIG transactions_amount_nonneg]', e.message));
  // Migration : table transaction_items
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transaction_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      service_id UUID REFERENCES booking_services(id) ON DELETE SET NULL,
      service_name VARCHAR(255) NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      unit_price NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Migration : table transaction_payments — multi-paiement (split)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transaction_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      method VARCHAR(20) NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tx_payments_tx ON transaction_payments(transaction_id);
  `);
  // ── Migrations audit trail ──────────────────────────────────────────────────
  await pool.query(`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT TRUE;

    CREATE TABLE IF NOT EXISTS transaction_audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id UUID NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action VARCHAR(20) NOT NULL CHECK (action IN ('create','update','delete')),
      changed_by_type VARCHAR(20) NOT NULL DEFAULT 'admin',
      snapshot_before JSONB,
      snapshot_after  JSONB,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_tx ON transaction_audit_log(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON transaction_audit_log(user_id, created_at DESC);
  `);


  // ── Feature 3 : Notifications journalières ─────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      daily_recap_enabled BOOLEAN DEFAULT FALSE,
      daily_recap_time TIME DEFAULT '20:00',
      daily_recap_email VARCHAR(255),
      reminder_enabled BOOLEAN DEFAULT FALSE,
      reminder_hours_before INT DEFAULT 24,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS notification_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      status VARCHAR(20) DEFAULT 'sent',
      meta JSONB
    );
  `);
  // Index pour accélérer les lookups dedup des crons reminder (le NOT EXISTS
  // scannait la table en full avant). (user_id, type) couvre les 2 SELECT.
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_notif_log_user_type
    ON notification_log(user_id, type)`);
  // Index GIN pour les filtres sur meta->>'appointment_id'
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_notif_log_appt
    ON notification_log((meta->>'appointment_id'))
    WHERE meta ? 'appointment_id'`);

  // ── Feature 5 : Absences / congés employés ──────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_absences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      type VARCHAR(30) DEFAULT 'conges' CHECK (type IN ('conges','maladie','formation','autre')),
      label VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_absences_employee ON employee_absences(employee_id, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_absences_user ON employee_absences(user_id, start_date);
  `);

  // ── Feature 6 : Commissions employés ────────────────────────────────────────
  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) DEFAULT 0;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_use_promo BOOLEAN DEFAULT TRUE;
    CREATE TABLE IF NOT EXISTS service_commissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_id UUID REFERENCES booking_services(id) ON DELETE CASCADE,
      category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
      employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
      commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(employee_id, service_id),
      UNIQUE(employee_id, category_id)
    );
  `);


  // ── Feature 8b : Comptes clients globaux (multi-commerces) ───────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS global_clients (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email        VARCHAR(255) UNIQUE,
      phone        VARCHAR(50),
      first_name   VARCHAR(100) NOT NULL,
      last_name    VARCHAR(100),
      password_hash VARCHAR(255),
      is_verified  BOOLEAN DEFAULT FALSE,
      invite_token VARCHAR(100),
      invite_sent_at TIMESTAMPTZ,
      reset_token        VARCHAR(6),
      reset_token_expires TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_global_clients_email ON global_clients(email);
    CREATE INDEX IF NOT EXISTS idx_global_clients_phone ON global_clients(phone);
  `);

  // ── Feature 9 : Fidélité clients ────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS loyalty_programs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      enabled BOOLEAN DEFAULT FALSE,
      stamps_required INT DEFAULT 10,
      reward_label VARCHAR(255) DEFAULT 'Prestation offerte',
      reward_type VARCHAR(20) DEFAULT 'percent' CHECK (reward_type IN ('percent','fixed')),
      reward_value NUMERIC(10,2) DEFAULT 10,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS client_loyalty (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id UUID REFERENCES client_accounts(id) ON DELETE CASCADE,
      client_email VARCHAR(255),
      client_name VARCHAR(255),
      stamps INT DEFAULT 0,
      total_stamps_ever INT DEFAULT 0,
      rewards_earned INT DEFAULT 0,
      last_visit DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, client_email)
    );
    CREATE INDEX IF NOT EXISTS idx_loyalty_user ON client_loyalty(user_id);
    CREATE INDEX IF NOT EXISTS idx_loyalty_email ON client_loyalty(user_id, client_email);
  `);

  // ── Feature 10 : Codes promo / remises ──────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      type VARCHAR(20) NOT NULL CHECK (type IN ('percent','fixed')),
      value NUMERIC(10,2) NOT NULL,
      max_uses INT DEFAULT NULL,
      uses_count INT DEFAULT 0,
      valid_from DATE DEFAULT CURRENT_DATE,
      valid_until DATE DEFAULT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      target_clients VARCHAR(20) DEFAULT 'all',
      owner_client_email VARCHAR(255),
      is_loyalty_reward BOOLEAN DEFAULT FALSE,
      client_loyalty_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, code)
    );
    ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS target_clients VARCHAR(20) DEFAULT 'all';
    ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS owner_client_email VARCHAR(255);
    ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_loyalty_reward BOOLEAN DEFAULT FALSE;
    ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS client_loyalty_id UUID;

    -- Colonnes promo sur appointments (ici APRÈS promo_codes pour respecter la FK)
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL;
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50);
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS original_amount NUMERIC(10,2) DEFAULT 0;

    CREATE TABLE IF NOT EXISTS client_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_email VARCHAR(255) NOT NULL,
      client_name  VARCHAR(255),
      note_text    TEXT NOT NULL,
      appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
      created_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      created_by_name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_client_notes_user_email
      ON client_notes(user_id, client_email);

        CREATE TABLE IF NOT EXISTS promo_usage_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      promo_code_id UUID,
      code_snapshot VARCHAR(50),
      client_email VARCHAR(255),
      client_name VARCHAR(255),
      transaction_id UUID,
      appointment_id UUID,
      discount_applied NUMERIC(10,2) DEFAULT 0,
      used_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_amount NUMERIC(10,2) DEFAULT NULL;
  `);

  // ── Migrations client_accounts + client_loyalty enrichis ───────────────────
  // (runMig est déclaré en tête de initDB)
  await runMig(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS global_client_id UUID REFERENCES global_clients(id) ON DELETE SET NULL`);
  await runMig(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`);
  await runMig(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS notes TEXT`);
  await runMig(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS total_visits INT DEFAULT 0`);
  await runMig(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS total_spent NUMERIC(10,2) DEFAULT 0`);
  await runMig(`ALTER TABLE client_loyalty  ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`);
  await runMig(`CREATE INDEX IF NOT EXISTS idx_client_accounts_user_email ON client_accounts(user_id, email)`);
  await runMig(`CREATE INDEX IF NOT EXISTS idx_client_accounts_global ON client_accounts(global_client_id)`);
  // Users : adresse et téléphone commerçant
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30)`);
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT`);
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'FR'`);
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)`);
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`);
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT`);
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_business_url TEXT`);
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lat NUMERIC(10,7)`);
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lng NUMERIC(10,7)`);
  // Rappels multiples
  await runMig(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS reminder_delays TEXT DEFAULT '1440'`);
  await runMig(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS employee_reminder_enabled BOOLEAN DEFAULT FALSE`);
  await runMig(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS employee_reminder_delays TEXT DEFAULT '60'`);
  // employees: email pour recevoir rappels
  await runMig(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);

    // ── Migrations colonnes (séparées pour résistance aux erreurs) ────────────
  // (runMigration est déclaré en tête de initDB)
  await runMigration(`ALTER TABLE loyalty_programs ADD COLUMN IF NOT EXISTS reward_type VARCHAR(20) DEFAULT 'percent'`);
  await runMigration(`ALTER TABLE loyalty_programs ADD COLUMN IF NOT EXISTS count_trigger VARCHAR(20) DEFAULT 'both'`);
  await runMigration(`ALTER TABLE loyalty_programs ADD COLUMN IF NOT EXISTS reward_value NUMERIC(10,2) DEFAULT 10`);
  await runMigration(`ALTER TABLE loyalty_programs ADD COLUMN IF NOT EXISTS loyalty_mode VARCHAR(20) DEFAULT 'stamps'`);
  await runMigration(`ALTER TABLE loyalty_programs ADD COLUMN IF NOT EXISTS points_per_euro NUMERIC(10,2) DEFAULT 1`);
  await runMigration(`ALTER TABLE loyalty_programs ADD COLUMN IF NOT EXISTS min_purchase NUMERIC(10,2) DEFAULT 0`);
  await runMigration(`ALTER TABLE loyalty_programs ADD COLUMN IF NOT EXISTS validity_days INT DEFAULT 90`);
  await runMigration(`ALTER TABLE client_loyalty ADD COLUMN IF NOT EXISTS points NUMERIC(10,2) DEFAULT 0`);
  await runMigration(`ALTER TABLE client_loyalty ADD COLUMN IF NOT EXISTS total_points_ever NUMERIC(10,2) DEFAULT 0`);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_note TEXT`);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_email VARCHAR(255)`);
  // Passages sur place : lien transaction → compte global du client (cross-commerçant)
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS global_client_id UUID REFERENCES global_clients(id) ON DELETE SET NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_transactions_global_client ON transactions(global_client_id) WHERE global_client_id IS NOT NULL`);
  await runMigration(`ALTER TABLE promo_usage_logs ADD COLUMN IF NOT EXISTS transaction_amount NUMERIC(10,2) DEFAULT 0`);
  await runMigration(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_use_promo BOOLEAN DEFAULT TRUE`);
  await runMigration(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS target_clients VARCHAR(20) DEFAULT 'all'`);
  await runMigration(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS owner_client_email VARCHAR(255)`);
  await runMigration(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_loyalty_reward BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS client_loyalty_id UUID`);
  await runMigration(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS min_purchase NUMERIC(10,2) DEFAULT 0`);

  // Réinitialisation de mot de passe client
  await runMigration(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS reset_token VARCHAR(6)`);
  await runMigration(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ`);

  // ── Gestion source client (règles client interne vs plateforme) ──────────────
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'internal'`);
  await runMigration(`UPDATE client_accounts SET source='platform' WHERE global_client_id IS NOT NULL AND source='internal'`);

  // ── Système de crédit client ─────────────────────────────────────────────────
  await runMigration(`
    CREATE TABLE IF NOT EXISTS client_credits (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_email  VARCHAR(255) NOT NULL,
      client_name   VARCHAR(255),
      balance       NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_granted NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_repaid  NUMERIC(10,2) NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, client_email)
    )
  `);
  await runMigration(`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credit_id      UUID NOT NULL REFERENCES client_credits(id) ON DELETE CASCADE,
      client_email   VARCHAR(255) NOT NULL,
      employee_id    UUID REFERENCES employees(id) ON DELETE SET NULL,
      employee_name  VARCHAR(255),
      type           VARCHAR(20) NOT NULL CHECK (type IN ('grant','repay')),
      amount         NUMERIC(10,2) NOT NULL,
      note           TEXT,
      payment_method VARCHAR(20),
      transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
      appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_client_credits_user_email ON client_credits(user_id, client_email)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_credit_tx_credit_id ON credit_transactions(credit_id)`);
  // RGPD : la suppression de compte client (DELETE /global-clients/me)
  // anonymise client_email/client_name en les mettant à NULL pour garder
  // l'historique financier sans données personnelles. Les colonnes étaient
  // NOT NULL à la création → l'anonymisation plantait (violation contrainte)
  // → 500 côté client. On relâche la contrainte sur les 2 tables concernées.
  // UNIQUE(user_id, client_email) reste valide (PG autorise plusieurs NULL).
  await runMigration(`ALTER TABLE client_credits ALTER COLUMN client_email DROP NOT NULL`);
  await runMigration(`ALTER TABLE client_notes   ALTER COLUMN client_email DROP NOT NULL`);
  // Permissions crédit sur les employés
  await runMigration(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_grant_credit BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_repay_credit BOOLEAN DEFAULT FALSE`);
  // Colonnes compatibilité credit_transactions (si table existait déjà sans ces colonnes)
  await runMigration(`ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)`);
  await runMigration(`ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL`);

  // ── Système de code PIN employé ──────────────────────────────────────────────
  await runMigration(`
    CREATE TABLE IF NOT EXISTS employee_pins (
      employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pin_hash    VARCHAR(255) NOT NULL,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_employee_pins_user_id ON employee_pins(user_id)`);
  // AUDIT perms commit B : anti-brute-force. Compteur d'echecs + lockout
  // temporaire. Reset sur verify OK. Reset sur PIN change (set).
  await runMigration(`ALTER TABLE employee_pins ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0`);
  await runMigration(`ALTER TABLE employee_pins ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`);

  // ── Web Push — abonnements navigateur/mobile ─────────────────────────────────
  await runMigration(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint    TEXT NOT NULL UNIQUE,
      p256dh      TEXT NOT NULL,
      auth_key    TEXT NOT NULL,
      user_agent  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      last_used   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)`);

  // ── Notifications in-app (centre de notifications) ────────────────────────────
  await runMigration(`
    CREATE TABLE IF NOT EXISTS app_notifications (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        VARCHAR(50) NOT NULL, -- 'new_appointment' | 'appointment_reminder' | 'caisse'
      title       TEXT NOT NULL,
      body        TEXT,
      data        JSONB,
      is_read     BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_app_notifs_user ON app_notifications(user_id, is_read, created_at DESC)`);

  // ── Paramètres sons & notifs in-app ──────────────────────────────────────────
  await runMigration(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS sound_caisse BOOLEAN DEFAULT TRUE`);
  await runMigration(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS sound_new_appt BOOLEAN DEFAULT TRUE`);
  await runMigration(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS sound_reminder BOOLEAN DEFAULT TRUE`);
  await runMigration(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS sound_repeat INTEGER DEFAULT 2`);
  await runMigration(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS sound_rdv_before INTEGER DEFAULT 15`);
  await runMigration(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS inapp_enabled BOOLEAN DEFAULT TRUE`);

  // ── Absences employés — colonnes supplémentaires ─────────────────────────────
  await runMigration(`ALTER TABLE employee_absences ADD COLUMN IF NOT EXISTS reason TEXT`);
  await runMigration(`ALTER TABLE employee_absences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  await runMigration(`ALTER TABLE employee_absences ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE employee_absences ADD COLUMN IF NOT EXISTS cancelled_reason TEXT`);
  // Nouveaux types d'absence
  await runMigration(`ALTER TABLE employee_absences DROP CONSTRAINT IF EXISTS employee_absences_type_check`);
  await runMigration(`ALTER TABLE employee_absences ADD CONSTRAINT employee_absences_type_check CHECK (type IN ('conges','maladie','formation','autre','accident_travail','maternite','paternite','sans_solde'))`);

  await runMigration(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS time_from TIME DEFAULT NULL`);
  await runMigration(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS time_until TIME DEFAULT NULL`);
  await runMigration(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS time_allday BOOLEAN NOT NULL DEFAULT TRUE`);

  // ── Catégories : montant libre ────────────────────────────────────────────────
  await runMigration(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_free_price BOOLEAN NOT NULL DEFAULT FALSE`);

  // ── Blocage réservation client par le commerçant ──────────────────────────────
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS is_booking_blocked BOOLEAN NOT NULL DEFAULT FALSE`);
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ`);


  // ── Pauses commerçant (ex: pause déjeuner 13h-15h) ──────────────────────────
  await runMigration(`
    CREATE TABLE IF NOT EXISTS business_breaks (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week  INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      break_start  TIME NOT NULL,
      break_end    TIME NOT NULL
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_business_breaks_user ON business_breaks(user_id)`);

  // ── Plages horaires multiples par employé par jour ────────────────────────────
  await runMigration(`
    CREATE TABLE IF NOT EXISTS employee_time_slots (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      slot_start  TIME NOT NULL,
      slot_end    TIME NOT NULL
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_emp_slots_employee ON employee_time_slots(employee_id)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_emp_slots_user ON employee_time_slots(user_id)`);

  
  // ── Table media (images profil, galerie, services, logo, employés) ─────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        VARCHAR(30) NOT NULL CHECK (type IN ('profile','cover','service','logo','employee')),
      ref_id      UUID,
      path        TEXT NOT NULL,
      provider    VARCHAR(30) NOT NULL DEFAULT 'local',
      sort_order  INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Migration idempotente : si la table existe deja avec un ancien CHECK sans
  // 'logo'/'employee', on recree la contrainte pour supporter tous les types.
  try {
    await pool.query(`ALTER TABLE media DROP CONSTRAINT IF EXISTS media_type_check`);
    await pool.query(`
      ALTER TABLE media ADD CONSTRAINT media_type_check
      CHECK (type IN ('profile','cover','service','logo','employee'))
    `);
  } catch (e) {
    console.warn('[DB mig media_type_check]', e.message);
  }
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_media_user ON media(user_id, type)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_media_ref  ON media(ref_id, type)`);

  // ── Catégories de services réservation ───────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_service_categories (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        VARCHAR(120) NOT NULL,
      icon        VARCHAR(60)  NOT NULL DEFAULT 'Scissors',
      color       VARCHAR(30)  NOT NULL DEFAULT '#7c6af7',
      sort_order  INT          NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bsc_user ON booking_service_categories(user_id)`);
  // Ajouter booking_category_id sur booking_services (distinct du category_id caisse)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'booking_services' AND column_name = 'booking_category_id'
      ) THEN
        ALTER TABLE booking_services
          ADD COLUMN booking_category_id UUID
          REFERENCES booking_service_categories(id) ON DELETE SET NULL;
        CREATE INDEX idx_bs_booking_cat ON booking_services(booking_category_id);
      END IF;
    END $$
  `);

  // ── Index performance critique ────────────────────────────────────────────
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_booking_settings_slug
    ON booking_settings(slug) WHERE slug IS NOT NULL`).catch(()=>{});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_user_date_type
    ON transactions(user_id, date DESC, type)`).catch(()=>{});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_appointments_user_emp_date_status
    ON appointments(user_id, employee_id, date, status)`).catch(()=>{});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_biz_hours_user_day
    ON business_hours(user_id, day_of_week)`).catch(()=>{});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_biz_breaks_user_day
    ON business_breaks(user_id, day_of_week)`).catch(()=>{});

// ── Google OAuth : colonne google_id sur global_clients ─────────────────────
  await runMigration(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE`);
  await runMigration(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS avatar_url TEXT`);

// ── RGPD : consentement et données personnelles ─────────────────────────────
  await runMigration(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS consent_ip VARCHAR(60)`);
  await runMigration(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ`);

  // ── Google OAuth commerçant + onboarding obligatoire ─────────────────────────
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT TRUE`);
  // Les comptes existants ont TRUE par défaut ; seuls les nouveaux comptes Google auront FALSE

  // ── Feature SMS Campaigns + Email Marketing ──────────────────────────────────
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_payment_method VARCHAR(255)`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_balance DECIMAL(10,2) DEFAULT 0`);
  // J7 : normaliser tout solde négatif résiduel (bug historique pré-R1)
  // avant d'ajouter le CHECK qui sinon ferait échouer la migration.
  await runMigration(`UPDATE users SET sms_balance = 0 WHERE sms_balance < 0`);
  // CHECK ≥ 0 : belt-and-suspenders avec le débit atomique (R1). Garantit
  // qu'un UPDATE direct en BDD ou un bug futur ne puisse pas passer en
  // négatif. Ignore l'erreur si la contrainte existe déjà (IF NOT EXISTS
  // pas supporté sur ADD CONSTRAINT → check via information_schema).
  await runMigration(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name='users' AND constraint_name='users_sms_balance_nonneg'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_sms_balance_nonneg
          CHECK (sms_balance >= 0);
      END IF;
    END$$;
  `);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_sent_today INT DEFAULT 0`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_sent_month INT DEFAULT 0`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_day_reset DATE DEFAULT CURRENT_DATE`);
  // J3 : compteur email GLOBAL cluster-safe. Remplace global.emailsToday qui
  // vivait en mémoire par worker (multiplié par N workers en cluster Render).
  // Une ligne par jour, INSERT ... ON CONFLICT ... DO UPDATE SET count+=1.
  // Les lignes anciennes ne sont pas purgées (historique compact, 365 lignes/an).
  await runMigration(`
    CREATE TABLE IF NOT EXISTS email_global_daily (
      date  DATE PRIMARY KEY,
      count INT  NOT NULL DEFAULT 0
    )
  `);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_month_reset DATE DEFAULT DATE_TRUNC('month',CURRENT_DATE)`);

  await runMigration(`
    CREATE TABLE IF NOT EXISTS campaign_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      campaign_id UUID,
      client_id UUID,
      client_email VARCHAR(255),
      client_phone VARCHAR(50),
      client_name VARCHAR(255),
      message TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      scheduled_date DATE DEFAULT CURRENT_DATE,
      sent_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_queue_pending ON campaign_queue(status, scheduled_date)`);
  await runMigration(`ALTER TABLE campaign_queue ADD COLUMN IF NOT EXISTS channel VARCHAR(10) DEFAULT 'email'`);
  // Politique d'annulation côté client (en heures avant RDV)
  // 0 = à tout moment · 1 = 1h avant · 2 = 2h · 6 · 24 · 48 avant RDV
  await runMigration(`ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS cancellation_policy_hours INT DEFAULT 2`);

  // ── Limite anti-abus parrainage ───────────────────────────────────────────
  // limit_count  : nombre max de parrainages autorisés sur la période
  //                (NULL = illimité, 1 pour le mode "lifetime", entier sinon)
  // limit_period : 'unlimited' | 'lifetime' | 'month' | '3months' | 'year'
  //                (lifetime = une seule fois à vie ; month = par mois calendaire ;
  //                 3months = sur les 90 derniers jours ; year = par année calendaire)
  await runMigration(`ALTER TABLE referral_programs ADD COLUMN IF NOT EXISTS limit_count INT`);
  await runMigration(`ALTER TABLE referral_programs ADD COLUMN IF NOT EXISTS limit_period VARCHAR(16) DEFAULT 'unlimited'`);

  // FK douce client_rewards → referral_uses : permet d'afficher le statut
  // « Utilisée » sur la fiche filleul du parrain quand sa récompense a été
  // consommée en caisse. NULLABLE car les rewards anniv n'ont pas de filleul.
  await runMigration(`ALTER TABLE client_rewards ADD COLUMN IF NOT EXISTS referral_use_id UUID REFERENCES referral_uses(id) ON DELETE SET NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_client_rewards_ref_use ON client_rewards(referral_use_id) WHERE referral_use_id IS NOT NULL`);

  // ── Marketing IA : envoi prédictif avec codes personnels ──────────────────
  await runMigration(`
    CREATE TABLE IF NOT EXISTS ai_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      budget NUMERIC(10,2) NOT NULL,
      duration_days INT NOT NULL,
      status VARCHAR(20) DEFAULT 'scheduled',
      phases JSONB,
      estimates JSONB,
      total_sms INT DEFAULT 0,
      total_cost NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_ai_campaigns_user ON ai_campaigns(user_id, created_at DESC)`);

  await runMigration(`
    CREATE TABLE IF NOT EXISTS ai_campaign_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ai_campaign_id UUID REFERENCES ai_campaigns(id) ON DELETE CASCADE,
      client_id UUID,
      promo_code_id UUID,
      personal_code VARCHAR(30) UNIQUE,
      segment VARCHAR(20),
      discount_percent INT,
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      used_at TIMESTAMPTZ,
      used_appointment_id UUID,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_ai_codes_campaign ON ai_campaign_codes(ai_campaign_id)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_ai_codes_promo ON ai_campaign_codes(promo_code_id)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_ai_codes_status ON ai_campaign_codes(status, scheduled_at)`);

  // Ajouter scheduled_at à campaign_queue pour scheduling précis à l'heure
  await runMigration(`ALTER TABLE campaign_queue ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE campaign_queue ADD COLUMN IF NOT EXISTS ai_code_id UUID`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_queue_scheduled_at ON campaign_queue(status, channel, scheduled_at)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_queue_channel ON campaign_queue(status, channel, scheduled_date)`);

  await runMigration(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      promo_code_id UUID REFERENCES promo_codes(id),
      channel VARCHAR(10) NOT NULL,
      target_type VARCHAR(20) NOT NULL,
      target_count INT DEFAULT 0,
      sent_sms INT DEFAULT 0,
      sent_email INT DEFAULT 0,
      failed_count INT DEFAULT 0,
      sms_cost DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);

  await runMigration(`
    CREATE TABLE IF NOT EXISTS sms_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(10) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      sms_count INT DEFAULT 0,
      description TEXT,
      sumup_checkout_id VARCHAR(255),
      status VARCHAR(20) DEFAULT 'completed',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_sms_tx_user ON sms_transactions(user_id, created_at DESC)`);
  // Idempotency strict : un checkout_id (session Stripe ou intent_id) ne peut
  // correspondre qu'à UNE SEULE ligne. Protège contre le double-crédit lors
  // des race conditions webhook + verify-intent + checkout verify.
  // Partial unique : les transactions sans checkout_id (débits manuels) ne
  // sont pas concernées.
  await runMigration(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_tx_checkout
    ON sms_transactions(sumup_checkout_id)
    WHERE sumup_checkout_id IS NOT NULL`);

  await runMigration(`
    CREATE TABLE IF NOT EXISTS message_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      campaign_id UUID,
      phone VARCHAR(50),
      email VARCHAR(255),
      channel VARCHAR(20),
      cost DECIMAL(10,4) DEFAULT 0,
      status VARCHAR(20),
      sent_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── Rappels email automatiques avant RDV ────────────────────────────────────
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_2h_sent BOOLEAN DEFAULT FALSE`);

  // ── Index pagination clients + historique transactions ──────────────────────
  // Accélère les subqueries tx_count / total_spent / apt_count dans GET /clients
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_transactions_user_client_type
    ON transactions(user_id, client_email, type)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_appointments_user_client
    ON appointments(user_id, client_email)`);
  // ORDER BY date DESC, time DESC NULLS LAST dans GET /transactions
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_transactions_user_date_time
    ON transactions(user_id, date DESC, time DESC NULLS LAST)`);

  // ── Anniversaires clients (onboarding.md) ───────────────────────────────────
  // Date de naissance optionnelle sur les deux tables clients.
  await runMigration(`ALTER TABLE global_clients  ADD COLUMN IF NOT EXISTS birth_date DATE`);
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS birth_date DATE`);
  // Code postal + ville optionnels — utilisés pour segmentation marketing
  // (IA, campagnes géolocalisées) et anniversaire/parrainage secondaire.
  await runMigration(`ALTER TABLE global_clients  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)`);
  await runMigration(`ALTER TABLE global_clients  ADD COLUMN IF NOT EXISTS city VARCHAR(120)`);
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)`);
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS city VARCHAR(120)`);
  // Anti-fraude : date/heure du dernier reward anniversaire émis pour ce client.
  // Empêche qu'un client qui change sa date de naissance après avoir reçu une
  // offre ne puisse en recevoir une seconde avant ~330 jours (rolling window
  // robuste face au changement de date côté profil).
  await runMigration(`ALTER TABLE global_clients  ADD COLUMN IF NOT EXISTS last_birthday_reward_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS last_birthday_reward_at TIMESTAMPTZ`);
  // Config offre anniversaire par commerçant (1 ligne par user_id).
  await runMigration(`
    CREATE TABLE IF NOT EXISTS birthday_campaigns (
      user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      is_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
      discount_type  VARCHAR(10) NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
      discount_value NUMERIC(10,2) NOT NULL DEFAULT 20,
      validity_days  INT NOT NULL DEFAULT 30,
      message        TEXT,
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── Parrainage clients (onboarding.md) ──────────────────────────────────────
  // Config programme par commerçant (réductions parrain + filleul).
  await runMigration(`
    CREATE TABLE IF NOT EXISTS referral_programs (
      user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      is_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
      parrain_type        VARCHAR(10) NOT NULL DEFAULT 'percent' CHECK (parrain_type IN ('percent','fixed')),
      parrain_value       NUMERIC(10,2) NOT NULL DEFAULT 10,
      filleul_type        VARCHAR(10) NOT NULL DEFAULT 'percent' CHECK (filleul_type IN ('percent','fixed')),
      filleul_value       NUMERIC(10,2) NOT NULL DEFAULT 10,
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Code unique par couple (commerçant, client parrain).
  await runMigration(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      owner_client_email VARCHAR(255) NOT NULL,
      code               VARCHAR(32)  NOT NULL,
      uses_count         INT NOT NULL DEFAULT 0,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, code),
      UNIQUE(user_id, owner_client_email)
    )
  `);
  // Trace de chaque conversion : qui a été parrainé + transactions liées.
  // status: 'pending' (RDV pris, en attente validation en caisse)
  //       | 'validated' (employé a validé en caisse → promo parrain émise)
  //       | 'cancelled' (RDV annulé, parrainage invalidé)
  await runMigration(`
    CREATE TABLE IF NOT EXISTS referral_uses (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referral_code_id     UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
      filleul_email        VARCHAR(255) NOT NULL,
      parrain_promo_id     UUID REFERENCES promo_codes(id) ON DELETE SET NULL,
      filleul_promo_id     UUID REFERENCES promo_codes(id) ON DELETE SET NULL,
      appointment_id       UUID REFERENCES appointments(id) ON DELETE SET NULL,
      status               VARCHAR(16) NOT NULL DEFAULT 'pending',
      validated_at         TIMESTAMPTZ,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await runMigration(`ALTER TABLE referral_uses ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'pending'`);
  await runMigration(`ALTER TABLE referral_uses ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ`);
  // Support encaissement caisse (transaction directe sans RDV préalable) —
  // le parrainage s'attache à la transaction au lieu de appointment_id.
  await runMigration(`ALTER TABLE referral_uses ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_referral_uses_tx ON referral_uses(transaction_id) WHERE transaction_id IS NOT NULL`);
  // Les parrainages créés avant ce refactor ont déjà émis les promos → marquer validés.
  await runMigration(`UPDATE referral_uses SET status='validated', validated_at=COALESCE(validated_at, created_at)
    WHERE parrain_promo_id IS NOT NULL AND status='pending'`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_referral_uses_user  ON referral_uses(user_id)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_referral_uses_filleul ON referral_uses(user_id, LOWER(filleul_email), status)`);

  // ── Réductions client unifiées (anniv + parrainage) ─────────────────────────
  // Une ligne par réduction disponible/utilisée pour un client chez un commerçant.
  // Permet à la caisse d'afficher d'un coup toutes les réductions utilisables.
  await runMigration(`
    CREATE TABLE IF NOT EXISTS client_rewards (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_email   VARCHAR(255) NOT NULL,
      reward_type    VARCHAR(20) NOT NULL,
      status         VARCHAR(16) NOT NULL DEFAULT 'available',
      promo_code_id  UUID REFERENCES promo_codes(id) ON DELETE CASCADE,
      expires_at     TIMESTAMPTZ,
      used_at        TIMESTAMPTZ,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_client_rewards_lookup
    ON client_rewards(user_id, LOWER(client_email), status)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_client_rewards_promo
    ON client_rewards(promo_code_id)`);

  // ── Audit Z (RGPD) : opt-in marketing explicite ─────────────────────────────
  // Sans ces colonnes, les SMS/emails marketing partaient à tous les clients
  // ayant renseigné tel/email (consentement implicite) — non conforme CNIL.
  // Défaut FALSE : opt-in explicite requis (checkbox à l'inscription + lien
  // de désabonnement 1-clic dans chaque message via unsubscribe_token).
  // IMPORTANT prod : les clients existants sont migrés en `FALSE`. Le marchand
  // doit les inviter à opter-in via une campagne de transition (mentionne-le
  // dans l'UI admin).
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE`);
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS unsubscribe_token UUID UNIQUE DEFAULT gen_random_uuid()`);
  await runMigration(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE`);
  await runMigration(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS unsubscribe_token UUID UNIQUE DEFAULT gen_random_uuid()`);
  // Backfill : tokens manquants sur lignes existantes (ajoutées AVANT la
  // migration de la colonne) — sinon le UNIQUE échoue à l'insert-time.
  await runMigration(`UPDATE client_accounts SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL`);
  await runMigration(`UPDATE global_clients  SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_client_accounts_optin ON client_accounts(user_id, marketing_opt_in) WHERE marketing_opt_in = TRUE`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_global_clients_optin ON global_clients(marketing_opt_in) WHERE marketing_opt_in = TRUE`);

console.log('[DB] Tables initialisées');
}


module.exports = { pool, initDB };

// ── PATCH pauses commerçant & plages horaires employés ────────────────────────
// Ajouté pour gérer les pauses du commerce et les plages multiples par employé