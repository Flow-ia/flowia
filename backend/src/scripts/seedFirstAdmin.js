// seedFirstAdmin.js — Crée le premier compte admin si aucun n'existe pour cet
// email. Usage : node backend/src/scripts/seedFirstAdmin.js
// Variables requises : SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME.
//
// Exécutable en local (.env local) ou via Render Shell (one-shot, env Render).

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { applyAdminSchema } = require('../db/adminSchema');

async function main() {
  const email    = (process.env.SEED_ADMIN_EMAIL    || '').trim();
  const password = process.env.SEED_ADMIN_PASSWORD  || '';
  const name     = (process.env.SEED_ADMIN_NAME     || '').trim();

  if (!email || !password || !name) {
    console.error('❌ Variables manquantes : SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('❌ SEED_ADMIN_PASSWORD doit faire au moins 12 caractères.');
    process.exit(1);
  }

  // Garantit que admin_users existe même si initDB n'a jamais tourné sur cette
  // base (ex : seed avant le premier déploiement).
  await applyAdminSchema(pool);

  const { rows } = await pool.query(
    `SELECT id FROM admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );
  if (rows.length) {
    console.log(`ℹ️  Admin déjà existant : ${email}`);
    process.exit(0);
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admin_users (email, password_hash, name, role, is_active)
     VALUES ($1, $2, $3, 'super_admin', TRUE)`,
    [email, hash, name]
  );

  console.log(`✅ Admin créé : ${email}`);
  process.exit(0);
}

main().catch(e => {
  console.error('❌ Erreur seed :', e.message);
  process.exit(1);
});
