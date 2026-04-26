// adminSchema.js — Schéma admin panel (commit #1a admin).
// Idempotent : safe à rejouer à chaque boot Render. Pattern runMig aligné sur
// backend/src/db/index.js. Strictement additif : aucune colonne existante des
// tables merchant n'est modifiée.

async function applyAdminSchema(pool) {
  const runMig = async (sql) => {
    try { await pool.query(sql); }
    catch (e) {
      if (!e.message.includes('already exists') && !e.message.includes("n'existe pas")) {
        console.warn('[DB admin]', e.message.slice(0, 80));
      }
    }
  };

  // ── Table admin_users ──────────────────────────────────────────────────────
  await runMig(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email                 VARCHAR(255) UNIQUE NOT NULL,
      password_hash         VARCHAR(255) NOT NULL,
      name                  VARCHAR(255) NOT NULL,
      role                  VARCHAR(50)  NOT NULL DEFAULT 'super_admin',
      is_active             BOOLEAN      DEFAULT TRUE,
      totp_secret           VARCHAR(255),
      totp_enabled          BOOLEAN      DEFAULT FALSE,
      last_login_at         TIMESTAMPTZ,
      last_login_ip         VARCHAR(45),
      failed_login_attempts INT          DEFAULT 0,
      locked_until          TIMESTAMPTZ,
      created_at            TIMESTAMPTZ  DEFAULT NOW(),
      updated_at            TIMESTAMPTZ  DEFAULT NOW()
    )
  `);

  // ── Table admin_audit_log ──────────────────────────────────────────────────
  // admin_id en ON DELETE SET NULL et admin_email snapshot : on préserve les
  // logs même si l'admin est supprimé (exigence audit / traçabilité).
  await runMig(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id       UUID REFERENCES admin_users(id) ON DELETE SET NULL,
      admin_email    VARCHAR(255),
      action         VARCHAR(100) NOT NULL,
      target_type    VARCHAR(50),
      target_id      UUID,
      payload_before JSONB,
      payload_after  JSONB,
      ip_address     VARCHAR(45),
      user_agent     TEXT,
      status         VARCHAR(20)  DEFAULT 'success',
      error_message  TEXT,
      created_at     TIMESTAMPTZ  DEFAULT NOW()
    )
  `);
  await runMig(`CREATE INDEX IF NOT EXISTS idx_audit_admin   ON admin_audit_log(admin_id)`);
  await runMig(`CREATE INDEX IF NOT EXISTS idx_audit_target  ON admin_audit_log(target_type, target_id)`);
  await runMig(`CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC)`);
  await runMig(`CREATE INDEX IF NOT EXISTS idx_audit_action  ON admin_audit_log(action)`);

  // ── Gel merchant : 4 colonnes neutres sur users ────────────────────────────
  // Lues/écrites exclusivement par le backend admin (commit #3 à venir). Le
  // code merchant existant n'a aucune référence à ces colonnes.
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_frozen          BOOLEAN     DEFAULT FALSE`);
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_reason      TEXT`);
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_at          TIMESTAMPTZ`);
  await runMig(`ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL`);

  // ── Blocage client global : 4 colonnes neutres sur global_clients ──────────
  // Cross-merchant uniquement. client_accounts.is_booking_blocked (per-merchant,
  // pré-existant) reste intact — concept et table distincts.
  await runMig(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS is_blocked          BOOLEAN     DEFAULT FALSE`);
  await runMig(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS blocked_reason      TEXT`);
  await runMig(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS blocked_at          TIMESTAMPTZ`);
  await runMig(`ALTER TABLE global_clients ADD COLUMN IF NOT EXISTS blocked_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL`);
}

module.exports = { applyAdminSchema };
