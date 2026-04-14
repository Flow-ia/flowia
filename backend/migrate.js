// migrate.js — Migration incrémentale (ne supprime pas les données)
// node migrate.js
require('dotenv').config();
const { Pool } = require('pg');

// ── Connexion robuste (fix SASL: password must be a string) ──────────────────
let pool;
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    if (!url.password) {
      pool = new Pool({
        host:     url.hostname || 'localhost',
        port:     parseInt(url.port) || 5432,
        database: url.pathname.replace(/^\//, '') || 'flowfinances',
        user:     url.username || 'postgres',
        password: '',
        ssl:      false,
      });
    } else {
      pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
    }
  } catch {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  }
} else {
  pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'flowfinances',
    user:     process.env.DB_USER     || 'postgres',
    password: String(process.env.DB_PASSWORD || ''),
    ssl:      false,
  });
}

const run = async (sql, desc) => {
  try {
    await pool.query(sql);
    if (desc) console.log(`  ✅  ${desc}`);
  } catch(e) {
    if (!e.message.includes('already exists') && !e.message.includes('does not exist')) {
      console.warn(`  ⚠️  ${desc || 'migration'}: ${e.message}`);
    }
  }
};

async function migrate() {
  console.log('\n🔄  Migration incrémentale FlowFinances...\n');

  // ── Tables de base ──────────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      business_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`, 'table users');

  // FIX : sort_order et is_free_price inclus dès le CREATE TABLE initial
  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'revenue',
      icon VARCHAR(50) DEFAULT 'Tag',
      color VARCHAR(20) DEFAULT '#3b82f6',
      parent_id UUID,
      price NUMERIC(10,2) DEFAULT NULL,
      sort_order INT DEFAULT 0,
      is_free_price BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`, 'table categories');

  await run(`
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
    )`, 'table employees');

  await run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      amount NUMERIC(10,2) NOT NULL,
      type VARCHAR(10) NOT NULL,
      payment_method VARCHAR(20) DEFAULT 'cash',
      description TEXT,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      time TIME,
      datetime_iso TIMESTAMPTZ,
      appointment_id UUID,
      source VARCHAR(30) DEFAULT 'manual',
      locked BOOLEAN DEFAULT FALSE,
      qty_total INT DEFAULT 1,
      client_email VARCHAR(255),
      client_note TEXT,
      promo_code_id UUID,
      discount_amount NUMERIC(10,2) DEFAULT 0,
      original_amount NUMERIC(10,2),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`, 'table transactions');

  await run(`
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
    )`, 'table notification_settings');

  await run(`
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
    )`, 'table booking_settings');

  await run(`
    CREATE TABLE IF NOT EXISTS booking_services (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      duration_minutes INT NOT NULL DEFAULT 30,
      price NUMERIC(10,2),
      color VARCHAR(20) DEFAULT '#6366f1',
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`, 'table booking_services');

  await run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_id UUID REFERENCES booking_services(id) ON DELETE SET NULL,
      employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      client_id UUID,
      client_name VARCHAR(255),
      client_email VARCHAR(255),
      client_phone VARCHAR(50),
      date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      duration_minutes INT DEFAULT 30,
      total_duration INT,
      status VARCHAR(20) DEFAULT 'confirmed',
      notes TEXT,
      cancel_reason TEXT,
      paid BOOLEAN DEFAULT FALSE,
      paid_method VARCHAR(20),
      transaction_id UUID,
      total_amount NUMERIC(10,2),
      original_amount NUMERIC(10,2),
      promo_code_id UUID,
      promo_code VARCHAR(50),
      discount_amount NUMERIC(10,2) DEFAULT 0,
      source VARCHAR(20) DEFAULT 'online',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`, 'table appointments');

  await run(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      type VARCHAR(10) NOT NULL DEFAULT 'percent',
      value NUMERIC(10,2) NOT NULL,
      max_uses INT,
      uses_count INT DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      valid_from DATE,
      valid_until DATE,
      min_purchase NUMERIC(10,2) DEFAULT 0,
      target_clients VARCHAR(20) DEFAULT 'all',
      owner_client_email VARCHAR(255),
      is_loyalty_reward BOOLEAN DEFAULT FALSE,
      client_loyalty_id UUID,
      time_allday BOOLEAN NOT NULL DEFAULT TRUE,
      time_from TIME DEFAULT NULL,
      time_until TIME DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, code)
    )`, 'table promo_codes');

  // ── Colonnes ajoutées au fil du temps ──────────────────────────────────────
  const cols = [
    // employees
    [`ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(255)`, 'employees.email'],
    [`ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_grant_credit BOOLEAN DEFAULT FALSE`, 'employees.can_grant_credit'],
    [`ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_repay_credit BOOLEAN DEFAULT FALSE`, 'employees.can_repay_credit'],
    [`ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_use_promo BOOLEAN DEFAULT TRUE`, 'employees.can_use_promo'],
    // categories — gardés pour les BDD existantes qui n'auraient pas ces colonnes
    [`ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_free_price BOOLEAN NOT NULL DEFAULT FALSE`, 'categories.is_free_price'],
    [`ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0`, 'categories.sort_order'],
    // transactions
    [`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qty_total INT DEFAULT 1`, 'transactions.qty_total'],
    [`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_email VARCHAR(255)`, 'transactions.client_email'],
    [`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_note TEXT`, 'transactions.client_note'],
    [`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS promo_code_id UUID`, 'transactions.promo_code_id'],
    [`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0`, 'transactions.discount_amount'],
    [`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_amount NUMERIC(10,2)`, 'transactions.original_amount'],
    // notification_settings
    [`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS reminder_delays TEXT DEFAULT '1440'`, 'notif.reminder_delays'],
    [`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS employee_reminder_enabled BOOLEAN DEFAULT FALSE`, 'notif.employee_reminder_enabled'],
    [`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS employee_reminder_delays TEXT DEFAULT '60'`, 'notif.employee_reminder_delays'],
    [`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS sound_caisse BOOLEAN DEFAULT TRUE`, 'notif.sound_caisse'],
    [`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS sound_new_appt BOOLEAN DEFAULT TRUE`, 'notif.sound_new_appt'],
    [`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS sound_reminder BOOLEAN DEFAULT TRUE`, 'notif.sound_reminder'],
    [`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT FALSE`, 'notif.push_enabled'],
    [`ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS inapp_enabled BOOLEAN DEFAULT TRUE`, 'notif.inapp_enabled'],
    // promo_codes
    [`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS time_allday BOOLEAN NOT NULL DEFAULT TRUE`, 'promo.time_allday'],
    [`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS time_from TIME DEFAULT NULL`, 'promo.time_from'],
    [`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS time_until TIME DEFAULT NULL`, 'promo.time_until'],
    // booking_settings
    [`ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS require_account BOOLEAN DEFAULT FALSE`, 'booking.require_account'],
  ];

  for (const [sql, desc] of cols) await run(sql, desc);

  // ── Tables secondaires ──────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS employee_absences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      type VARCHAR(30) NOT NULL DEFAULT 'autre',
      label VARCHAR(100),
      reason TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      cancelled_at TIMESTAMPTZ,
      cancelled_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`, 'table employee_absences');

  await run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth_key TEXT NOT NULL,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_used TIMESTAMPTZ DEFAULT NOW()
    )`, 'table push_subscriptions');

  await run(`
    CREATE TABLE IF NOT EXISTS app_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      data JSONB,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`, 'table app_notifications');

  await run(`
    CREATE TABLE IF NOT EXISTS employee_pins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pin_hash VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(employee_id)
    )`, 'table employee_pins');

  await run(`
    CREATE TABLE IF NOT EXISTS client_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255),
      password_hash VARCHAR(255),
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      phone VARCHAR(50),
      notes TEXT,
      global_client_id UUID,
      is_booking_blocked BOOLEAN NOT NULL DEFAULT FALSE,
      blocked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, email)
    )`, 'table client_accounts');

  await run(`
    CREATE TABLE IF NOT EXISTS business_breaks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INT NOT NULL,
      break_start TIME NOT NULL,
      break_end TIME NOT NULL
    )`, 'table business_breaks');

  await run(`
    CREATE TABLE IF NOT EXISTS employee_time_slots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INT NOT NULL,
      slot_start TIME NOT NULL,
      slot_end TIME NOT NULL
    )`, 'table employee_time_slots');

  await run(`
    CREATE TABLE IF NOT EXISTS business_hours (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      open_time TIME DEFAULT '09:00',
      close_time TIME DEFAULT '18:00',
      is_open BOOLEAN DEFAULT TRUE,
      UNIQUE(user_id, day_of_week)
    )`, 'table business_hours');

  await run(`
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
    )`, 'table employee_hours');

  // ── Indexes ─────────────────────────────────────────────────────────────────
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_app_notifs_user ON app_notifications(user_id, is_read, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_employee_pins_user_id ON employee_pins(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_business_breaks_user ON business_breaks(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_emp_slots_employee ON employee_time_slots(employee_id)`,
    `CREATE INDEX IF NOT EXISTS idx_emp_slots_user ON employee_time_slots(user_id)`,
  ];
  for (const sql of indexes) await run(sql);

  console.log('\n✅  Migration terminée avec succès !');
  await pool.end();
}

migrate().catch(err => {
  console.error('\n❌  Erreur migration:', err.message);
  process.exit(1);
});