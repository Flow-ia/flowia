const { Pool } = require('pg');
require('dotenv').config();
const { applyAdminSchema } = require('./adminSchema');

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

  // ── merchant_debt_records ────────────────────────────────────────────────
  // Registre des créances orphelines : quand un client supprime son compte
  // alors qu'il a une dette (balance < 0) chez un commerçant, on prend un
  // snapshot de ses coordonnées (en clair, RGPD Art. 17.3.e) pour permettre
  // le recouvrement. Conservation 2 ans (B2C, L218-2 Code consommation),
  // purgé automatiquement par le cron.
  // SECURITE : table séparée des fiches client courantes -> isolation forte
  // des données conservées au seul motif du recouvrement (pas de marketing).
  await runMigration(`
    CREATE TABLE IF NOT EXISTS merchant_debt_records (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      -- Snapshot coordonnées EN CLAIR au moment de la suppression
      client_first_name  VARCHAR(255),
      client_last_name   VARCHAR(255),
      client_email       VARCHAR(255),
      client_phone       VARCHAR(50),
      -- Créance
      debt_amount        NUMERIC(10,2) NOT NULL CHECK (debt_amount > 0),
      debt_currency      VARCHAR(3) DEFAULT 'EUR',
      debt_origin        TEXT,
      original_credit_id UUID,
      -- Cycle de vie
      status             VARCHAR(20) NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','paid','written_off')),
      recorded_at        TIMESTAMPTZ DEFAULT NOW(),
      paid_at             TIMESTAMPTZ,
      paid_note          TEXT,
      paid_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      -- Métadonnées RGPD
      legal_basis        TEXT DEFAULT 'RGPD Art. 17.3.e — Recouvrement de creance',
      retention_until    DATE NOT NULL
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_debt_records_user_status
    ON merchant_debt_records(user_id, status, recorded_at DESC)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_debt_records_retention
    ON merchant_debt_records(retention_until) WHERE status = 'open'`);

  // ── merchant_announcement ─────────────────────────────────────────────────
  // Bandeau d'annonce affiche en haut de la page de reservation publique du
  // commercant (entre infos et section "Nos prestations"). Une seule annonce
  // par commercant (PRIMARY KEY user_id). Active uniquement si :
  //   - is_enabled = TRUE
  //   - now() entre starts_at et ends_at (si renseignes, sinon ignore)
  //   - heure courante entre daily_start_time et daily_end_time (si renseignes)
  // Couleur whitelistee cote backend pour eviter injection CSS.
  await runMigration(`
    CREATE TABLE IF NOT EXISTS merchant_announcement (
      user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      message          TEXT,
      color            VARCHAR(20) DEFAULT 'orange',
      is_enabled       BOOLEAN     DEFAULT FALSE,
      starts_at        TIMESTAMPTZ,
      ends_at          TIMESTAMPTZ,
      daily_start_time TIME,
      daily_end_time   TIME,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

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

  // ── Type de commerce (categorie marketplace) ────────────────────────────
  // Obligatoire a l'inscription. Sert au filtre marketplace + a personnaliser
  // les emails / textes UI ("votre barbier" vs "votre estheticienne").
  // Cles courtes pour eviter migrations futures sur libelle.
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS business_type VARCHAR(30)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_users_business_type
    ON users(business_type) WHERE business_type IS NOT NULL`);

  // ── RGPD soft-delete : grace period 30 jours avant purge definitive ────
  // Quand un commercant clique "Supprimer mon compte", on set ce timestamp.
  // Les donnees Google (jetons OAuth, integration calendar) sont supprimees
  // immediatement (engagement Limited Use). Le reste du compte reste en
  // grace 30 jours pour permettre une annulation par email contact@.
  // Le cron quotidien (index.js) purge les comptes au-dela de 30 jours.
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_users_deletion_pending
    ON users(deletion_requested_at) WHERE deletion_requested_at IS NOT NULL`);

  // ── Slug aliases : redirection 301 quand un commercant change de slug ────
  // Format slug : nom-ville-CP. Quand le commercant change le nom de son
  // salon, son adresse, ou edite la partie nom de son slug, l'ancien slug
  // est archive ici pour preserver les QR codes imprimes, les liens partages
  // par SMS, et l'OAuth Google (state=slug). La route publique resout les
  // alias via un middleware avant de servir 404.
  await runMigration(`
    CREATE TABLE IF NOT EXISTS booking_slug_aliases (
      old_slug   VARCHAR(100) PRIMARY KEY,
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_booking_slug_aliases_user
    ON booking_slug_aliases(user_id)`);

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

  // ── Refonte FDS-2026 commit 19 : trace l'origine du opt-in marketing ─────
  // Permet de distinguer les inscriptions email/password (= 'register'),
  // OAuth Google avec création différée (= 'oauth_google'), résa rapide
  // sans compte (= 'public_book'), import historique (= 'legacy'), etc.
  // Optionnel (NULL = avant traçage). Idempotent : IF NOT EXISTS.
  await runMigration(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS marketing_opt_in_source TEXT`);
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS marketing_opt_in_source TEXT`);

  // ── Refonte FDS-2026 commit 20 : téléphone E.164 (libphonenumber-js) ─────
  // Migration douce : on ne touche PAS le champ `phone` historique (formats
  // hétérogènes), on ajoute `phone_e164` rempli à chaque nouvelle saisie/
  // édition validée. Les SMS lisent `COALESCE(phone_e164, phone)`. Les index
  // partiels accélèrent la recherche par téléphone normalisé (Brevo attend
  // déjà du E.164 — délivrabilité améliorée au passage).
  await runMigration(`ALTER TABLE global_clients  ADD COLUMN IF NOT EXISTS phone_e164 TEXT`);
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS phone_e164 TEXT`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_global_clients_phone_e164  ON global_clients(phone_e164)  WHERE phone_e164 IS NOT NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_client_accounts_phone_e164 ON client_accounts(user_id, phone_e164) WHERE phone_e164 IS NOT NULL`);

  // ── Refonte FDS-2026 commit 1 : permissions granulaires + user_settings ────
  // Permissions employés : 5 déjà présentes dans la CREATE TABLE initiale
  // (can_cancel, can_modify, can_encash, show_on_booking, show_in_caisse).
  // On ajoute les 3 manquantes. Les IF NOT EXISTS rendent les 8 lignes
  // idempotentes — no-op en prod sur les colonnes déjà créées.
  await runMigration(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_cancel       BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_modify       BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_encash       BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_use_promo    BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_grant_credit BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_repay_credit BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS show_on_booking  BOOLEAN DEFAULT TRUE`);
  await runMigration(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS show_in_caisse   BOOLEAN DEFAULT TRUE`);

  // user_settings — mode tablette partagée, timeout session, lock on close,
  // seuil SMS bas. Types UUID pour user_id (users.id est UUID, pas SERIAL).
  await runMigration(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      tablet_mode_enabled          BOOLEAN      DEFAULT FALSE,
      employee_session_timeout_min INT          DEFAULT 15,
      lock_on_tab_close            BOOLEAN      DEFAULT TRUE,
      sms_low_balance_threshold    NUMERIC(10,2) DEFAULT 20,
      created_at                   TIMESTAMPTZ  DEFAULT NOW(),
      updated_at                   TIMESTAMPTZ  DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id)`);

  // Audit trail encaissement via PIN employé : trace quel employé a signé la
  // transaction en mode tablette partagée (commit 11). UUID pour matcher employees.id.
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS signed_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL`);

  // Seed : une ligne user_settings par merchant existant, defaults DB appliqués.
  await runMigration(`INSERT INTO user_settings (user_id) SELECT id FROM users ON CONFLICT (user_id) DO NOTHING`);

  // Commit 31 — durée de session merchant configurable + mode veille.
  // merchant_session_duration : valeurs autorisées '12h' | '24h' | '7d' | '30d' | 'never'
  //   - utilisée comme expiresIn JWT au login. 'never' = pas d'expiration côté JWT.
  // lock_screen_enabled       : active le verrouillage automatique de l'app
  //                              après inactivité. Déverrouillage par PIN
  //                              employé ou PIN admin.
  // lock_screen_idle_minutes  : 0 (désactivé) | 10 | 15 | 60 | 120 | 240
  await runMigration(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS merchant_session_duration VARCHAR(10) DEFAULT '7d'`);
  await runMigration(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS lock_screen_enabled BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS lock_screen_idle_minutes INT DEFAULT 15`);

  // Commit 25 — traçabilité création RDV. Source : 'public' (booking client),
  // 'admin' (commerçant), 'employee' (tablette PIN), 'migration' (RDV
  // historiques antérieurs à la migration). created_by_employee_id : FK
  // implicite vers employees.id si source='employee', NULL sinon. Pas de FK
  // stricte pour préserver l'audit en cas de suppression d'un employé.
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source TEXT`);
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_by_employee_id UUID`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_appointments_source ON appointments(source)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_appointments_created_by_employee_id ON appointments(created_by_employee_id)`);
  // Marque les RDV antérieurs (NULL après migration) — un seul UPDATE,
  // idempotent : si rerun, plus de rows à WHERE source IS NULL.
  await runMigration(`UPDATE appointments SET source = 'migration' WHERE source IS NULL`);

  // Commit 24d — audit trail des modifications de fiches client par un admin
  // (PIN admin). Trace la modification de champs sensibles (birth_date qui
  // contourne l'anti-fraude rolling 330j côté client). Pas de FK sur
  // client_account_id : la fiche peut être supprimée (soft delete RGPD)
  // sans perdre la trace audit.
  await runMigration(`
    CREATE TABLE IF NOT EXISTS client_audit_log (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_account_id UUID NOT NULL,
      user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action            VARCHAR(40) NOT NULL,
      field_name        VARCHAR(40),
      value_before      TEXT,
      value_after       TEXT,
      changed_by_type   VARCHAR(20) NOT NULL DEFAULT 'admin',
      reason            TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_client_audit_log_user ON client_audit_log(user_id, created_at DESC)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_client_audit_log_client ON client_audit_log(client_account_id, created_at DESC)`);

  // Commit 26 — audit RGPD désinscription marketing. Une ligne par tentative
  // de désinscription (réussie ou non), pas de dédup si l'utilisateur clique
  // plusieurs fois — chaque clic est une preuve indépendante. Pas de FK pour
  // préserver le log même après suppression RGPD du client (anonymisation).
  // Conforme CNIL : prouve qui/quand/comment pour audit en cas de plainte.
  await runMigration(`
    CREATE TABLE IF NOT EXISTS marketing_optout_log (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID,
      client_account_id UUID,
      global_client_id  UUID,
      email             VARCHAR(255),
      source            VARCHAR(20) NOT NULL DEFAULT 'email_link'
                        CHECK (source IN ('email_link','sms_link','admin_action','public_form','api')),
      ip                VARCHAR(64),
      user_agent        TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_marketing_optout_email ON marketing_optout_log(email)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_marketing_optout_created_at ON marketing_optout_log(created_at DESC)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_marketing_optout_source ON marketing_optout_log(source)`);

  // ── Indexes scaling (commit 31) ───────────────────────────────────────────
  // Préparation à l'augmentation de volume (4 employés × 2 000 commerçants
  // actifs → ~24M tx/an et 24M RDV/an). Les indexes existants couvrent les
  // hot paths actuels ; ceux-ci anticipent les requêtes qui scaleront mal
  // sans index dédié à 5M+ lignes par table. Tous CREATE IF NOT EXISTS
  // (idempotent) + clauses WHERE filtrant les NULLs (indexes partiels plus
  // compacts). Aucun gain visible aujourd'hui mais prévient les slow queries
  // futures sans avoir à passer en partition (qui reste possible plus tard).
  //
  // Pourquoi ces indexes précis :
  //   1. Stats / commissions par employé : (user_id, employee_id, date)
  //      → l'index existant (user_id, employee_id, date, status) fonctionne
  //        mais reste très large ; un index ciblé sur transactions est plus
  //        compact et sera préféré pour les agrégats sans status filter.
  //   2. Audit / recherche d'usage promo : (promo_code_id)
  //      → sans index, scan complet de transactions pour retracer un code.
  //   3. Cron rappels RDV : (user_id, status, date, start_time)
  //      → filtre WHERE status='confirmed' AND date+time entre [now+22h, now+26h].
  //        L'index existant exige employee_id non NULL filtré → pas pris pour
  //        ce cron qui parcourt tous les RDV du commerçant.
  //   4. Lookup RDV depuis transaction (refund, audit) : (transaction_id)
  //   5. Répartition CA par moyen de paiement : (user_id, payment_method, date)
  //   6. Fiche client par client_id (pas client_email — RGPD anonymisation
  //      met email à NULL mais garde client_id) : (user_id, client_id)
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_transactions_user_emp_date
    ON transactions(user_id, employee_id, date DESC) WHERE employee_id IS NOT NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_transactions_promo_code
    ON transactions(promo_code_id) WHERE promo_code_id IS NOT NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_transactions_user_pm_date
    ON transactions(user_id, payment_method, date DESC) WHERE payment_method IS NOT NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_appointments_user_status_date_time
    ON appointments(user_id, status, date, start_time)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_appointments_transaction
    ON appointments(transaction_id) WHERE transaction_id IS NOT NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_appointments_user_client_id
    ON appointments(user_id, client_id) WHERE client_id IS NOT NULL`);

  // ── Stripe Connect Standard (paiements en ligne réservations) ─────────────
  // Chaque commerçant connecte SON compte Stripe via OAuth (pattern Setmore).
  // Les clients paient directement le commerçant ; FlowIA prélève
  // optionnellement une application_fee définie par `commission_rate` (% sur
  // chaque réservation, défaut 0 % — configurable par admin/commerçant).
  // Voir routes/stripe-connect.js (commit 2) et public-booking/payment.js
  // (commit 3) pour l'implémentation. STRIPE_CONNECT_CLIENT_ID et
  // STRIPE_CONNECT_WEBHOOK_SECRET requis sur Render (cf. .env.example).
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255)`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_email VARCHAR(255)`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT FALSE`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_connected_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS online_payments_enabled BOOLEAN DEFAULT FALSE`);
  // Phase 3 — politique de paiement booking : qui paie quoi.
  // booking_payment_policy : 'optional' (client choisit) | 'mandatory' (paie obligatoire pour reserver)
  // booking_payment_percentage : % du prix prele en acompte (1-100). 100 = paie integralement, 20/50 = acompte.
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS booking_payment_policy VARCHAR(15) NOT NULL DEFAULT 'optional'`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS booking_payment_percentage INT NOT NULL DEFAULT 100`);
  await runMigration(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name='users' AND constraint_name='users_booking_payment_policy_check'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_booking_payment_policy_check
          CHECK (booking_payment_policy IN ('optional','mandatory'));
      END IF;
    END$$;
  `);
  await runMigration(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name='users' AND constraint_name='users_booking_payment_percentage_check'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_booking_payment_percentage_check
          CHECK (booking_payment_percentage >= 1 AND booking_payment_percentage <= 100);
      END IF;
    END$$;
  `);
  // commission_rate : % FlowIA prélevé via application_fee_amount sur chaque
  // PaymentIntent. 0.00 = aucune commission (le commerçant ne voit rien sur
  // ses transactions Stripe). Configurable de 0.00 à 100.00 (en pratique 0-5).
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0`);
  await runMigration(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name='users' AND constraint_name='users_commission_rate_range'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_commission_rate_range
          CHECK (commission_rate >= 0 AND commission_rate <= 100);
      END IF;
    END$$;
  `);
  // Lookup rapide par stripe_account_id (webhook account.updated, payment_intent.*)
  await runMigration(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_account_id
    ON users(stripe_account_id) WHERE stripe_account_id IS NOT NULL`);

  // Colonnes paiement sur appointments
  // payment_status : none = pas de paiement / payer sur place
  //                  pending = PaymentIntent créé, pas encore confirmé
  //                  paid = encaissé (webhook payment_intent.succeeded)
  //                  refunded = remboursé (webhook charge.refunded)
  //                  failed = échec (carte refusée, expirée, etc.)
  // Le booléen `paid` existant reste maintenu en parallèle (TRUE quand
  // payment_status='paid') pour ne pas casser les requêtes legacy.
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255)`);
  // Tracabilite Stripe : un Customer Stripe par (merchant connected account,
  // client). Stocke sur client_accounts (mapping naturel par merchant +
  // email). Permet de remplir le champ 'Client' dans le Stripe Dashboard du
  // commercant pour identifier rapidement les paiements + recherche.
  // Si NULL, on en cree un au premier paiement online. Si l'account merchant
  // change (disconnect/reconnect), le customer_id devient invalide -> on
  // detecte par retrieve fail et on recree (auto-self-healing).
  await runMigration(`ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS stripe_connected_customer_id VARCHAR(255)`);

  // Idempotence transactions 'rdv_online' : evite les doublons quand book.js
  // (sync, chemin principal) ET le webhook payment_intent.succeeded (backup,
  // race-safe) tentent tous les 2 d'inserer une row pour le meme RDV. Index
  // partiel : 1 seule transaction de type 'rdv_online' par appointment_id.
  // Les autres sources (rdv = encaissement manuel, rdv_refund) ne sont pas
  // contraintes (un meme RDV peut avoir 1 acompte rdv_online + 1 encaissement
  // solde rdv + 1 refund rdv_refund = 3 rows valides).
  await runMigration(`CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_rdv_online_appt
    ON transactions(appointment_id) WHERE source = 'rdv_online'`);

  // Idempotence transactions 'rdv_refund' : meme logique que rdv_online,
  // pour permettre 2 chemins concurrents (refundAppointment.js synchrone +
  // webhook charge.refunded asynchrone — necessaire si le merchant lance
  // un refund directement depuis le dashboard Stripe). UN SEUL row
  // 'rdv_refund' par appointment_id, ON CONFLICT DO NOTHING dans les
  // deux chemins -> dashboard /historique et /statistiques toujours
  // coherents quel que soit l'origine du refund.
  await runMigration(`CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_rdv_refund_appt
    ON transactions(appointment_id) WHERE source = 'rdv_refund'`);

  // Tracabilite des annulations : qui a annule + quand. Permet a la fois
  // l'affichage cote client ('Annule par le salon' vs 'Annule par vous') et
  // le suivi cote commercant. cancelled_by enum : 'merchant' (PUT cancel
  // depuis l'agenda), 'client' (POST /:slug/client/.../cancel), 'system'
  // (no-show automatique, futur). NULL si jamais annule.
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(20)`);
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`);
  await runMigration(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='appointments_cancelled_by_check') THEN
        ALTER TABLE appointments ADD CONSTRAINT appointments_cancelled_by_check
          CHECK (cancelled_by IS NULL OR cancelled_by IN ('merchant','client','system'));
      END IF;
    END $$;
  `);

  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'none'`);
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS paid_amount_cents INT`);
  await runMigration(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name='appointments' AND constraint_name='appointments_payment_status_check'
      ) THEN
        ALTER TABLE appointments ADD CONSTRAINT appointments_payment_status_check
          CHECK (payment_status IN ('none','pending','paid','refunded','failed'));
      END IF;
    END$$;
  `);
  // Idempotence webhook : un PaymentIntent = un seul appointment max.
  // Empêche un retry webhook d'attribuer le même paiement 2 fois.
  await runMigration(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_stripe_pi
    ON appointments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_appointments_payment_status
    ON appointments(user_id, payment_status, date) WHERE payment_status <> 'none'`);

  // AUDIT Phase 5 : registre des refunds échoués (Connect Direct Charges).
  // Si l'auto-refund SLOT_TAKEN echoue (Stripe API down, account locked,
  // PI deja refunded externe), on persist l'echec ici pour qu'un admin
  // puisse retry manuellement et notifier le client. Sans ce registre, les
  // fonds seraient bloques sans trace cote app.
  await runMigration(`
    CREATE TABLE IF NOT EXISTS failed_refunds (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_account_id    VARCHAR(255) NOT NULL,
      payment_intent_id    VARCHAR(255) NOT NULL,
      amount_cents         INT,
      slug                 VARCHAR(100),
      reason               VARCHAR(50) NOT NULL,
      stripe_error_message TEXT,
      retry_count          INT NOT NULL DEFAULT 0,
      resolved_at          TIMESTAMPTZ,
      resolved_by_admin_id UUID,
      resolution_note      TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_failed_refunds_user_unresolved
    ON failed_refunds(user_id, created_at DESC) WHERE resolved_at IS NULL`);
  await runMigration(`CREATE UNIQUE INDEX IF NOT EXISTS idx_failed_refunds_pi
    ON failed_refunds(payment_intent_id) WHERE resolved_at IS NULL`);

  // AUDIT Phase 5 : archive de l'ancien stripe_account_id apres /disconnect.
  // Permet de retrouver le compte Stripe historique pour un refund a
  // posteriori (RDV passe paye en ligne dont le client demande remboursement
  // apres deconnexion du merchant). Sans archive, refund impossible cote app.
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id_archived VARCHAR(255)`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_disconnected_at TIMESTAMPTZ`);

  // ── Escrow / hold des paiements en ligne avant reversement au commercant ──
  // Modele : Direct Charges sur compte Connect (deja en place). Au lieu de
  // payouts automatiques quotidiens vers l'IBAN du commercant, les fonds
  // restent sur le balance Connect jusqu'a appointment_date + payout_hold_days.
  // Si le RDV est annule / rembourse avant cette date, le payout n'a jamais
  // lieu et le refund se fait depuis le balance Connect intact -> protection
  // client (recoit son acompte) et protection commercant (anti-litige
  // post-prestation : il a la preuve que le RDV a eu lieu si le payout est
  // declenche). Cron quotidien (cf utils/releasePayouts.js) traite les rows
  // status='pending' AND release_at <= NOW().
  //
  // Pour activer le hold, le compte Connect doit etre en payout manuel
  // (`payout_schedule.interval='manual'`). Configure a l'onboarding pour les
  // nouveaux comptes + endpoint admin de migration pour les anciens.
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_hold_days INT NOT NULL DEFAULT 3`);
  await runMigration(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_payout_hold_days_check') THEN
        ALTER TABLE users ADD CONSTRAINT users_payout_hold_days_check
          CHECK (payout_hold_days >= 0 AND payout_hold_days <= 30);
      END IF;
    END $$;
  `);

  await runMigration(`
    CREATE TABLE IF NOT EXISTS appointment_payouts (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id      UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_account_id   VARCHAR(255) NOT NULL,
      payment_intent_id   VARCHAR(255) NOT NULL,
      amount_cents        INT NOT NULL,
      release_at          TIMESTAMPTZ NOT NULL,
      released_at         TIMESTAMPTZ,
      stripe_payout_id    VARCHAR(255),
      cancelled_reason    VARCHAR(50),
      stripe_error_message TEXT,
      retry_count         INT NOT NULL DEFAULT 0,
      status              VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','released','cancelled','failed')),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // 1 row max par appointment (idempotence sur webhook payment_intent.succeeded
  // qui peut etre delivre 2x).
  await runMigration(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appt_payouts_appt
    ON appointment_payouts(appointment_id)`);
  // Cron : recherche rapide des payouts dus.
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_appt_payouts_due
    ON appointment_payouts(release_at) WHERE status = 'pending'`);
  // Listings UI commercant : ses payouts par etat.
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_appt_payouts_user_status
    ON appointment_payouts(user_id, status, release_at DESC)`);

  // ── Sync Google Agenda (sortant FlowIA → Google) ────────────────────────
  // Le merchant connecte son compte Google via OAuth (scope calendar.events)
  // pour que les RDV crees dans FlowIA apparaissent automatiquement dans
  // son agenda Google. Tokens chiffres avec AES-256-GCM (CALENDAR_TOKEN_KEY).
  // V1 = unidirectionnel (FlowIA pousse vers Google) ; V2 future = aussi
  // lire les events Google pour bloquer les slots cote FlowIA.
  await runMigration(`
    CREATE TABLE IF NOT EXISTS merchant_calendar_integrations (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider           VARCHAR(20) NOT NULL DEFAULT 'google',
      google_account_email VARCHAR(255),
      access_token_enc   TEXT NOT NULL,
      refresh_token_enc  TEXT,
      token_expires_at   TIMESTAMPTZ,
      calendar_id        VARCHAR(255) NOT NULL DEFAULT 'primary',
      sync_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
      last_sync_at       TIMESTAMPTZ,
      last_sync_error    TEXT,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, provider)
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_calendar_integ_user
    ON merchant_calendar_integrations(user_id) WHERE sync_enabled=TRUE`);
  // Lien RDV ↔ event Google : permet update/delete idempotent + retry safe.
  // Stocke aussi un hash du dernier payload pousse pour eviter UPDATE inutiles.
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255)`);
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_calendar_id VARCHAR(255)`);
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_appointments_google_event
    ON appointments(google_event_id) WHERE google_event_id IS NOT NULL`);

  // ── Abonnement plateforme FlowIA (Stripe Billing) ────────────────────────
  // Les commerçants paient un abonnement mensuel/annuel pour accéder à FlowIA.
  // 3 plans : Decouverte (0€, gratuit limité) / Essentiel (24€mois|240€an) /
  // Equipe (49€mois|490€an). Géré côté plateforme via stripe.subscriptions —
  // SÉPARÉ de Stripe Connect qui gère les paiements clients->commerçants.
  // stripe_customer_id : déjà présent (ligne 969), partagé avec recharge SMS.
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20)`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(20)`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_period VARCHAR(10)`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_trial_ends_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE`);
  // Anti-fraude / anti-spam : tracker la derniere modification d'abonnement
  // pour appliquer un cooldown 60s + un cap quotidien (max 5/jour).
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_last_change_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_changes_count_24h INT NOT NULL DEFAULT 0`);
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_changes_window_start TIMESTAMPTZ`);

  // Anti-replay webhooks Stripe : on claim chaque event_id en DB pour
  // empêcher qu'un attaquant capture une requête webhook signée et la
  // rejoue. Stripe a déjà un timestamp dans la signature (5min), c'est
  // une defense-in-depth. INSERT échoue avec 23505 si event déjà traité
  // -> on skip le re-processing.
  await runMigration(`
    CREATE TABLE IF NOT EXISTS processed_stripe_events (
      event_id      VARCHAR(255) PRIMARY KEY,
      event_type    VARCHAR(100),
      source        VARCHAR(30),
      processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_processed_stripe_events_age
    ON processed_stripe_events(processed_at DESC)`);

  // Octroi superadmin : permet de donner un plan gratuit a un commercant
  // sans passer par Stripe. Si non null, prend le pas sur Stripe pour
  // l'effective plan + statut. JSONB pour flexibilite future.
  // Format :
  //   { plan: 'essentiel'|'equipe', period: 'monthly'|'yearly',
  //     granted_at, granted_by_id, granted_by_email,
  //     expires_at: null|ISO, reason }
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_admin_grant JSONB`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_users_admin_grant
    ON users((subscription_admin_grant IS NOT NULL)) WHERE subscription_admin_grant IS NOT NULL`);
  await runMigration(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name='users' AND constraint_name='users_subscription_status_check'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_subscription_status_check
          CHECK (subscription_status IS NULL OR subscription_status IN
            ('trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired'));
      END IF;
    END$$;
  `);
  await runMigration(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name='users' AND constraint_name='users_subscription_plan_check'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_subscription_plan_check
          CHECK (subscription_plan IS NULL OR subscription_plan IN ('decouverte','essentiel','equipe'));
      END IF;
    END$$;
  `);
  await runMigration(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name='users' AND constraint_name='users_subscription_period_check'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_subscription_period_check
          CHECK (subscription_period IS NULL OR subscription_period IN ('monthly','yearly'));
      END IF;
    END$$;
  `);
  // Idempotence webhook : un stripe_subscription_id = un seul user max.
  await runMigration(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_subscription_id
    ON users(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_users_subscription_status
    ON users(subscription_status) WHERE subscription_status IS NOT NULL`);

  // ── Cartes sauvegardees globales FlowIA (Shared Customer Stripe Connect) ──
  // 1 customer "plateforme" par global_client (sur le compte Stripe FlowIA
  // principal). Les PaymentMethods sont attaches a ce customer plateforme
  // -> source de verite. Pour payer chez un salon (compte connecte), on
  // clone le PM vers le customer du connected account a la volee.
  await runMigration(`ALTER TABLE global_clients
    ADD COLUMN IF NOT EXISTS stripe_platform_customer_id TEXT`);
  await runMigration(`
    CREATE TABLE IF NOT EXISTS client_payment_methods (
      id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      global_client_id            UUID NOT NULL REFERENCES global_clients(id) ON DELETE CASCADE,
      stripe_platform_pm_id       TEXT NOT NULL,
      stripe_platform_customer_id TEXT NOT NULL,
      brand                       TEXT,
      last4                       TEXT,
      exp_month                   INT,
      exp_year                    INT,
      is_default                  BOOLEAN NOT NULL DEFAULT FALSE,
      last_used_at                TIMESTAMPTZ,
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (global_client_id, stripe_platform_pm_id)
    )`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_cpm_client
    ON client_payment_methods(global_client_id)`);
  // Garde-fou : une seule carte par defaut par client.
  await runMigration(`CREATE UNIQUE INDEX IF NOT EXISTS uq_cpm_default_per_client
    ON client_payment_methods(global_client_id) WHERE is_default = TRUE`);

  // Mapping (global_client_id, connected_account_id) -> stripe customer id sur
  // le connected account. Evite de relancer customers.search Stripe (cache
  // stale -> ID obsolete -> 500 "No such customer") ou de creer 1 customer
  // par paiement (pollue Stripe Dashboard).
  await runMigration(`
    CREATE TABLE IF NOT EXISTS client_connected_customers (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      global_client_id      UUID NOT NULL REFERENCES global_clients(id) ON DELETE CASCADE,
      connected_account_id  TEXT NOT NULL,
      stripe_customer_id    TEXT NOT NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (global_client_id, connected_account_id)
    )`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_ccc_client
    ON client_connected_customers(global_client_id)`);

  // ── v3 Commit 1 : modèle paiement 4-sources + 6 statuts ──────────────────
  // Adapté au schéma réel FlowIA (user_id, pas de `businesses`/`clients`/
  // `services`). Les colonnes _cents sont AJOUTÉES en parallèle des NUMERIC
  // legacy ; les valeurs legacy de transactions.source ('rdv_online',
  // 'rdv_refund', 'rdv', 'manual') et appointments.source ('public', 'admin',
  // 'online', 'rdv') sont PRÉSERVÉES — on ajoute payment_source /
  // appointment_source à côté pour ne pas casser les ~10 routes qui filtrent
  // sur les valeurs legacy. Le SQL équivalent est dans
  // backend/migrations/20260509_120000_add_4_source_payment_model.sql
  // (à exécuter manuellement sur Supabase prod via l'éditeur SQL).

  // appointments
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_source VARCHAR(50)`);
  await runMigration(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='appointments_appointment_source_check') THEN
        ALTER TABLE appointments ADD CONSTRAINT appointments_appointment_source_check
          CHECK (appointment_source IS NULL OR appointment_source IN ('online_booking','phone_internal'));
      END IF;
    END $$;
  `);
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS total_price_cents INTEGER`);
  await runMigration(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(255)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_appointments_appointment_source
    ON appointments(appointment_source) WHERE appointment_source IS NOT NULL`);

  // transactions — nouvelles colonnes
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_source VARCHAR(50)`);
  await runMigration(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transactions_payment_source_check') THEN
        ALTER TABLE transactions ADD CONSTRAINT transactions_payment_source_check
          CHECK (payment_source IS NULL OR payment_source IN ('online_booking','phone_internal','cash_register_rdv','walkin'));
      END IF;
    END $$;
  `);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50)`);
  await runMigration(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transactions_payment_status_check') THEN
        ALTER TABLE transactions ADD CONSTRAINT transactions_payment_status_check
          CHECK (payment_status IS NULL OR payment_status IN ('STRIPE_100','STRIPE_ACOMPTE','NOT_PAID','CASH_PAID','REFUNDED','NO_SHOW_RETAINED'));
      END IF;
    END $$;
  `);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gross_amount_cents INTEGER`);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_fee_cents INTEGER NOT NULL DEFAULT 0`);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER NOT NULL DEFAULT 0`);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS net_amount_cents INTEGER`);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50) NOT NULL DEFAULT 'full'`);
  await runMigration(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transactions_payment_type_check') THEN
        ALTER TABLE transactions ADD CONSTRAINT transactions_payment_type_check
          CHECK (payment_type IN ('full','deposit','remaining','refund'));
      END IF;
    END $$;
  `);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255)`);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_charge_id VARCHAR(255)`);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_refund_id VARCHAR(255)`);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_payout_id VARCHAR(255)`);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ`);
  await runMigration(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payout_received_at TIMESTAMPTZ`);

  // transactions — indexes nouveaux
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_transactions_payment_status_v3
    ON transactions(payment_status) WHERE payment_status IS NOT NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_transactions_payment_source
    ON transactions(payment_source) WHERE payment_source IS NOT NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_transactions_stripe_payout
    ON transactions(stripe_payout_id) WHERE stripe_payout_id IS NOT NULL`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_transactions_payment_method_v3
    ON transactions(payment_method)`);
  // L'UNIQUE anti-double-paiement (idx_transactions_appointment_active) est
  // créé tout à la FIN, après le rétro-fill, avec un pre-flight check qui
  // skip silencieusement si des doublons résiduels (STRIPE_100 + CASH_PAID
  // sur même appointment_id) sont détectés — cf bloc DO $$ plus bas.

  // payouts (1 row par stripe_payout_id, distinct de appointment_payouts qui
  // est l'escrow par RDV de la Phase 5 Stripe Connect — voir plus haut)
  await runMigration(`
    CREATE TABLE IF NOT EXISTS payouts (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_payout_id         VARCHAR(255) UNIQUE NOT NULL,
      amount_cents             INTEGER NOT NULL,
      currency                 VARCHAR(3) NOT NULL DEFAULT 'eur',
      status                   VARCHAR(50) NOT NULL,
      bank_account_last4       VARCHAR(4),
      bank_name                VARCHAR(255),
      triggered_by             VARCHAR(50) NOT NULL DEFAULT 'manual',
      triggered_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      requested_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      arrival_date             DATE,
      completed_at             TIMESTAMPTZ,
      failed_at                TIMESTAMPTZ,
      failure_reason           TEXT,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await runMigration(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payouts_status_check') THEN
        ALTER TABLE payouts ADD CONSTRAINT payouts_status_check
          CHECK (status IN ('pending','in_transit','paid','failed','canceled'));
      END IF;
    END $$;
  `);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_payouts_user      ON payouts(user_id)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_payouts_status    ON payouts(status)`);
  await runMigration(`CREATE INDEX IF NOT EXISTS idx_payouts_requested ON payouts(requested_at)`);

  // users — commission plateforme par commerçant (0% par défaut)
  await runMigration(`ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0.0`);
  await runMigration(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_platform_fee_percent_check') THEN
        ALTER TABLE users ADD CONSTRAINT users_platform_fee_percent_check
          CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100);
      END IF;
    END $$;
  `);

  // ── Rétro-fill — idempotent (filtre WHERE <colonne> IS NULL) ────────────
  await runMigration(`
    UPDATE appointments
       SET appointment_source = CASE
         WHEN stripe_payment_intent_id IS NOT NULL THEN 'online_booking'
         WHEN source IN ('public','online') THEN 'online_booking'
         ELSE 'phone_internal'
       END
     WHERE appointment_source IS NULL
  `);
  await runMigration(`
    UPDATE appointments
       SET total_price_cents = ROUND(total_amount * 100)::INTEGER
     WHERE total_price_cents IS NULL AND total_amount IS NOT NULL
  `);
  await runMigration(`
    UPDATE appointments
       SET cancellation_reason = LEFT(cancel_reason, 255)
     WHERE cancellation_reason IS NULL AND cancel_reason IS NOT NULL AND cancel_reason <> ''
  `);
  await runMigration(`
    UPDATE transactions
       SET payment_source = 'walkin'
     WHERE payment_source IS NULL AND appointment_id IS NULL AND type = 'revenue'
  `);
  await runMigration(`
    UPDATE transactions
       SET payment_source = 'online_booking'
     WHERE payment_source IS NULL AND source IN ('rdv_online','rdv_refund') AND type = 'revenue'
  `);
  await runMigration(`
    UPDATE transactions
       SET payment_source = 'cash_register_rdv'
     WHERE payment_source IS NULL AND appointment_id IS NOT NULL
       AND source IN ('rdv','manual') AND type = 'revenue'
  `);
  // L'ordre des UPDATEs payment_status est important : on détecte d'abord
  // les couples acompte+reste (rdv_online + rdv sur même appointment_id)
  // pour les classer en STRIPE_ACOMPTE / CASH_PAID 'remaining', avant de
  // classer les rdv_online isolés en STRIPE_100. Évite les conflits sur
  // l'UNIQUE anti-double-paiement créé en fin.
  await runMigration(`
    UPDATE transactions
       SET payment_status = 'REFUNDED', payment_type = 'refund'
     WHERE payment_status IS NULL AND source = 'rdv_refund' AND type = 'revenue'
  `);
  await runMigration(`
    UPDATE transactions t
       SET payment_status = 'STRIPE_ACOMPTE', payment_type = 'deposit'
     WHERE t.payment_status IS NULL AND t.source = 'rdv_online'
       AND t.appointment_id IS NOT NULL AND t.type = 'revenue'
       AND EXISTS (
         SELECT 1 FROM transactions t2
          WHERE t2.appointment_id = t.appointment_id
            AND t2.source = 'rdv' AND t2.id <> t.id
       )
  `);
  await runMigration(`
    UPDATE transactions
       SET payment_status = 'STRIPE_100'
     WHERE payment_status IS NULL AND source = 'rdv_online' AND type = 'revenue'
  `);
  await runMigration(`
    UPDATE transactions t
       SET payment_status = 'CASH_PAID', payment_type = 'remaining'
     WHERE t.payment_status IS NULL AND t.source = 'rdv'
       AND t.appointment_id IS NOT NULL AND t.type = 'revenue'
       AND EXISTS (
         SELECT 1 FROM transactions t2
          WHERE t2.appointment_id = t.appointment_id
            AND t2.payment_status = 'STRIPE_ACOMPTE'
       )
  `);
  await runMigration(`
    WITH first_cash AS (
      SELECT DISTINCT ON (appointment_id) id
        FROM transactions
       WHERE payment_status IS NULL
         AND source IN ('rdv','manual')
         AND appointment_id IS NOT NULL
         AND type = 'revenue'
       ORDER BY appointment_id, created_at ASC NULLS LAST
    )
    UPDATE transactions
       SET payment_status = 'CASH_PAID', payment_type = 'full'
     WHERE id IN (SELECT id FROM first_cash)
  `);
  await runMigration(`
    UPDATE transactions
       SET payment_status = 'CASH_PAID', payment_type = 'full'
     WHERE payment_status IS NULL AND appointment_id IS NULL
       AND payment_source = 'walkin' AND type = 'revenue'
  `);
  await runMigration(`
    UPDATE transactions
       SET gross_amount_cents = ROUND(amount * 100)::INTEGER
     WHERE gross_amount_cents IS NULL AND amount IS NOT NULL
  `);
  await runMigration(`
    UPDATE transactions
       SET net_amount_cents = COALESCE(gross_amount_cents, ROUND(amount * 100)::INTEGER)
                              - COALESCE(stripe_fee_cents, 0)
                              - COALESCE(platform_fee_cents, 0)
     WHERE net_amount_cents IS NULL AND (gross_amount_cents IS NOT NULL OR amount IS NOT NULL)
  `);
  await runMigration(`
    UPDATE transactions
       SET paid_at = COALESCE(paid_at, created_at)
     WHERE paid_at IS NULL AND payment_status IN ('STRIPE_100','STRIPE_ACOMPTE','CASH_PAID')
  `);
  await runMigration(`
    UPDATE transactions
       SET refunded_at = COALESCE(refunded_at, created_at)
     WHERE refunded_at IS NULL AND payment_status = 'REFUNDED'
  `);

  // ── v3 Commit 5 : catch-all par payment_method ────────────────────────
  // Le rétro-fill ci-dessus filtre cash_register_rdv sur source IN ('rdv','manual').
  // Mais des rows legacy peuvent avoir source='admin' (cf book.js:121) ou autre,
  // tout en étant clairement des encaissements caisse (payment_method='cash').
  // Catch-all par payment_method pour rattraper ces edge cases résiduels,
  // sans toucher aux rows déjà classifiées (filtre WHERE payment_source IS NULL).
  await runMigration(`
    UPDATE transactions
       SET payment_source = 'cash_register_rdv',
           payment_status = COALESCE(payment_status, 'CASH_PAID'),
           payment_type   = COALESCE(payment_type, 'full'),
           gross_amount_cents = COALESCE(gross_amount_cents, ROUND(amount * 100)::INTEGER),
           net_amount_cents   = COALESCE(net_amount_cents, ROUND(amount * 100)::INTEGER)
     WHERE payment_source IS NULL
       AND appointment_id IS NOT NULL
       AND type = 'revenue'
       AND payment_method IN ('cash', 'card_local', 'transfer', 'manual', 'card', 'check')
       AND amount IS NOT NULL
       AND stripe_payment_intent_id IS NULL
  `);
  // Catch-all walk-in (appointment_id NULL) — couvre toutes les rows revenue
  // sans appointment_id qui auraient échappé au filtre type='revenue' précédent.
  await runMigration(`
    UPDATE transactions
       SET payment_source = 'walkin',
           payment_status = COALESCE(payment_status, 'CASH_PAID'),
           payment_type   = COALESCE(payment_type, 'full'),
           gross_amount_cents = COALESCE(gross_amount_cents, ROUND(amount * 100)::INTEGER),
           net_amount_cents   = COALESCE(net_amount_cents, ROUND(amount * 100)::INTEGER)
     WHERE payment_source IS NULL
       AND appointment_id IS NULL
       AND type = 'revenue'
       AND amount IS NOT NULL
  `);

  // Rétro-fill estimation des frais Stripe pour les transactions online qui
  // ont stripe_fee_cents=0 alors qu'elles devraient avoir ~1.4% + 25c.
  // Cause : sync path book.js insere avant que balance_transaction Stripe
  // soit disponible, et avant le commit 6.2 le webhook ne mettait pas a
  // jour les fees (ON CONFLICT DO NOTHING).
  // Estimation 1.4% + 25c = tarif standard Stripe FR carte EU. Pour la vraie
  // valeur il faudrait appeler l'API Stripe pour chaque PI mais c'est lourd
  // et non temps-reel. L'estimation suffit pour des KPIs corrects.
  // payment_type='refund' EXCLU : les rows refund ne paient pas de frais
  // Stripe (Stripe ne rembourse pas ses fees, mais ne les debite pas non plus
  // sur le refund row qui represente juste l'effet inverse de la charge).
  // Idempotent via WHERE stripe_fee_cents=0.
  await runMigration(`
    UPDATE transactions
       SET stripe_fee_cents = ROUND(gross_amount_cents * 0.014)::INTEGER + 25,
           net_amount_cents = gross_amount_cents
                              - (ROUND(gross_amount_cents * 0.014)::INTEGER + 25)
                              - COALESCE(platform_fee_cents, 0)
     WHERE payment_status IN ('STRIPE_100','STRIPE_ACOMPTE','REFUNDED')
       AND payment_type   IN ('full','deposit')
       AND COALESCE(stripe_fee_cents, 0) = 0
       AND COALESCE(gross_amount_cents, 0) > 0
       AND stripe_payment_intent_id IS NOT NULL
  `);

  // UNIQUE anti-double-paiement (créé après rétro-fill avec pre-flight check).
  // Si des doublons résiduels (STRIPE_100 + CASH_PAID sur même appointment_id)
  // existent, on émet une NOTICE et on saute la création — le commerçant peut
  // les nettoyer puis le prochain boot du backend recréera l'index.
  await runMigration(`
    DO $$
    DECLARE dup_count INT;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname='idx_transactions_appointment_active'
      ) THEN
        SELECT COUNT(*) INTO dup_count FROM (
          SELECT appointment_id FROM transactions
           WHERE appointment_id IS NOT NULL
             AND payment_status IN ('STRIPE_100','CASH_PAID')
           GROUP BY appointment_id HAVING COUNT(*) > 1
        ) AS dups;
        IF dup_count > 0 THEN
          RAISE NOTICE 'idx_transactions_appointment_active : % RDV avec doublons paiement, index NON cree (cleaner manuellement puis relancer)', dup_count;
        ELSE
          CREATE UNIQUE INDEX idx_transactions_appointment_active
            ON transactions(appointment_id)
            WHERE appointment_id IS NOT NULL
              AND payment_status IN ('STRIPE_100','CASH_PAID');
        END IF;
      END IF;
    END $$;
  `);

  await applyAdminSchema(pool);

  // ── Migration one-shot : reformater les slugs existants en nom-ville-CP ─
  // Idempotent : on ignore les slugs deja au format, les slugs verrouilles
  // par admin, et les commercants sans ville/CP (pas encore onboarded).
  // L'ancien slug est archive en alias pour preserver les liens partages.
  // Desactivable via DISABLE_SLUG_MIGRATION=1 si besoin de skipper en prod.
  if (process.env.DISABLE_SLUG_MIGRATION !== '1') {
    try {
      const {
        buildMerchantSlug,
        buildLocationPart,
        findUniqueSlug,
        archiveOldSlug,
      } = require('../utils/buildSlug');

      const { rows: merchants } = await pool.query(
        `SELECT bs.user_id, bs.slug, bs.slug_locked,
                u.business_name, u.city, u.postal_code
           FROM booking_settings bs
           JOIN users u ON u.id = bs.user_id
          WHERE bs.slug IS NOT NULL
            AND COALESCE(bs.slug_locked, FALSE) = FALSE
            AND u.city IS NOT NULL AND u.city <> ''
            AND u.postal_code IS NOT NULL AND u.postal_code <> ''`
      );

      let migrated = 0;
      for (const m of merchants) {
        const targetLocation = buildLocationPart(m.city, m.postal_code);
        if (!targetLocation) continue;
        // Si le slug actuel se termine deja par -ville-cp, on saute (deja
        // au bon format, meme si on aurait pu le recalculer differemment
        // — on ne touche jamais a un slug deja conforme pour eviter de
        // casser des liens existants pour rien).
        if (m.slug && m.slug.endsWith(`-${targetLocation}`)) continue;

        const newBase = buildMerchantSlug({
          name: m.business_name,
          city: m.city,
          postalCode: m.postal_code,
        });
        if (!newBase || newBase === m.slug) continue;

        const newSlug = await findUniqueSlug(pool, newBase, m.user_id);
        if (newSlug === m.slug) continue;

        if (m.slug) await archiveOldSlug(pool, m.slug, m.user_id);
        await pool.query('UPDATE booking_settings SET slug=$1 WHERE user_id=$2',
          [newSlug, m.user_id]);
        migrated += 1;
      }
      if (migrated > 0) {
        console.log(`[DB] slug migration: ${migrated} slug(s) reformates en nom-ville-CP`);
      }
    } catch (e) {
      // Best-effort : ne jamais bloquer le boot du backend a cause de la
      // migration de slugs (la prod ne doit pas etre indisponible si un
      // edge case explose ici — on log et on continue).
      console.warn('[DB slug migration]', e.message);
    }
  }

console.log('[DB] Tables initialisées');
}


module.exports = { pool, initDB };

// ── PATCH pauses commerçant & plages horaires employés ────────────────────────
// Ajouté pour gérer les pauses du commerce et les plages multiples par employé