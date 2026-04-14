// reset-db.js — Réinitialisation complète (dev uniquement)
// node reset-db.js
require('dotenv').config();
const { Pool } = require('pg');

// ── Connexion robuste (fix SASL: password must be a string) ─────────────────
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

const { initDB } = require('./src/db');

async function resetDB() {
  const client = await pool.connect();
  try {
    console.log('\n⚠️   Suppression de toutes les tables...');
    await client.query('SET session_replication_role = replica;');
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    for (const { tablename } of rows) {
      await client.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
      console.log(`   🗑   Table supprimée : ${tablename}`);
    }
    await client.query('SET session_replication_role = DEFAULT;');
    console.log('\n✅  Toutes les tables supprimées.');
  } finally {
    client.release();
  }

  console.log('\n🔄  Recréation des tables via initDB()...');
  await initDB();
  console.log('\n✅  Base de données réinitialisée avec succès !');
  await pool.end();
}

resetDB().catch(err => {
  console.error('\n❌  Échec :', err.message);
  process.exit(1);
});
