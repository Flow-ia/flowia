// ============================================================
//  seed-data.js  —  Données de test FlowFinances
//  node seed-data.js
// ============================================================
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

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

// ── Helpers ──────────────────────────────────────────────────────────────────
const today     = new Date().toISOString().substring(0, 10);
const yesterday = new Date(Date.now() - 1 * 86400000).toISOString().substring(0, 10);
const lastWeek1 = new Date(Date.now() - 6 * 86400000).toISOString().substring(0, 10);
const lastWeek2 = new Date(Date.now() - 4 * 86400000).toISOString().substring(0, 10);
const tomorrow  = new Date(Date.now() + 1 * 86400000).toISOString().substring(0, 10);
const in2days   = new Date(Date.now() + 2 * 86400000).toISOString().substring(0, 10);

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function seed() {
  console.log('\n🌱  Démarrage du seed FlowFinances...\n');

  // ── 0. MIGRATIONS PRÉALABLES (sécurité si migrate.js n'a pas été relancé) ──
  const safeCols = [
    // categories
    `ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0`,
    `ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_free_price BOOLEAN NOT NULL DEFAULT FALSE`,
    // appointments
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'online'`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes INT DEFAULT 30`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS total_duration INT`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_reason TEXT`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS paid_method VARCHAR(20)`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS transaction_id UUID`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2)`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS original_amount NUMERIC(10,2)`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS promo_code_id UUID`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50)`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    // transactions
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qty_total INT DEFAULT 1`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_email VARCHAR(255)`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_note TEXT`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS promo_code_id UUID`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_amount NUMERIC(10,2)`,
    // employees
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(255)`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_grant_credit BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_repay_credit BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS can_use_promo BOOLEAN DEFAULT TRUE`,
    // notification_settings
    `ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS inapp_enabled BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS sound_caisse BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS sound_new_appt BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS sound_reminder BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS reminder_delays TEXT DEFAULT '1440'`,
    `ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS employee_reminder_enabled BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS employee_reminder_delays TEXT DEFAULT '60'`,
    // booking_settings
    `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS require_account BOOLEAN DEFAULT FALSE`,
  ];
  for (const sql of safeCols) {
    try { await q(sql); } catch (_) { /* colonne déjà présente */ }
  }
  console.log('✅  Colonnes vérifiées/ajoutées');

  // ── 1. COMMERÇANT ──────────────────────────────────────────────────────────
  const EMAIL    = 'gacinoufel@gmail.com';
  const PASSWORD = 'gacinoufel@gmail.com';
  const hash     = await bcrypt.hash(PASSWORD, 10);

  await q(`DELETE FROM users WHERE email = $1`, [EMAIL]);

  const [user] = await q(
    `INSERT INTO users (email, password_hash, business_name)
     VALUES ($1, $2, $3) RETURNING id`,
    [EMAIL, hash, 'Salon Élite Coiffure']
  );
  const uid = user.id;
  console.log(`✅  Commerçant : ${EMAIL}  /  mdp : ${PASSWORD}`);

  // ── 2. CATÉGORIES ──────────────────────────────────────────────────────────
  const catData = [
    { name: 'Coiffure Homme',  type: 'revenue', icon: 'Scissors', color: '#7c6af7', sort_order: 0 },
    { name: 'Coiffure Femme',  type: 'revenue', icon: 'Scissors', color: '#ec4899', sort_order: 1 },
    { name: 'Soins & Beauté',  type: 'revenue', icon: 'Sparkles', color: '#10b981', sort_order: 2 },
    { name: 'Charges du salon',type: 'expense', icon: 'Receipt',  color: '#ef4444', sort_order: 0 },
  ];

  const cats = {};
  for (const c of catData) {
    const [row] = await q(
      `INSERT INTO categories (user_id, name, type, icon, color, sort_order, is_free_price)
       VALUES ($1,$2,$3,$4,$5,$6,FALSE) RETURNING id`,
      [uid, c.name, c.type, c.icon, c.color, c.sort_order]
    );
    cats[c.name] = row.id;
    console.log(`   📁  Catégorie : ${c.name}`);
  }

  // ── 3. SERVICES (sous-catégories liées aux catégories) ────────────────────
  const serviceItems = [
    { name: 'Coupe simple',       parent: 'Coiffure Homme', price: 18, color: '#7c6af7', sort_order: 0 },
    { name: 'Coupe + Barbe',      parent: 'Coiffure Homme', price: 28, color: '#7c6af7', sort_order: 1 },
    { name: 'Barbe seule',        parent: 'Coiffure Homme', price: 12, color: '#7c6af7', sort_order: 2 },
    { name: 'Coupe femme',        parent: 'Coiffure Femme', price: 35, color: '#ec4899', sort_order: 0 },
    { name: 'Couleur / Mèches',   parent: 'Coiffure Femme', price: 75, color: '#ec4899', sort_order: 1 },
    { name: 'Brushing',           parent: 'Coiffure Femme', price: 25, color: '#ec4899', sort_order: 2 },
    { name: 'Soin kératine',      parent: 'Soins & Beauté', price: 95, color: '#10b981', sort_order: 0 },
    { name: 'Masque hydratant',   parent: 'Soins & Beauté', price: 20, color: '#10b981', sort_order: 1 },
  ];
  const services = {};
  for (const s of serviceItems) {
    const [row] = await q(
      `INSERT INTO categories (user_id, name, type, icon, color, parent_id, price, sort_order, is_free_price)
       VALUES ($1,$2,'revenue','Tag',$3,$4,$5,$6,FALSE) RETURNING id`,
      [uid, s.name, s.color, cats[s.parent], s.price, s.sort_order]
    );
    services[s.name] = row.id;
    console.log(`   💈  Service : ${s.name} (${s.price}€)`);
  }

  // ── 4. EMPLOYÉS ───────────────────────────────────────────────────────────
  const empData = [
    { name: 'Karim Benali',   role: 'Coiffeur senior',    color: '#7c6af7' },
    { name: 'Sophie Martin',  role: 'Coloriste',           color: '#ec4899' },
    { name: 'Léa Dubois',     role: 'Spécialiste soins',   color: '#10b981' },
    { name: 'Thomas Girard',  role: 'Apprenti coiffeur',   color: '#f59e0b' },
  ];

  const emps = {};
  for (const e of empData) {
    const [row] = await q(
      `INSERT INTO employees (user_id, name, role, avatar_color, is_active, show_on_booking, show_in_caisse)
       VALUES ($1,$2,$3,$4,TRUE,TRUE,TRUE) RETURNING id`,
      [uid, e.name, e.role, e.color]
    );
    emps[e.name] = row.id;
    console.log(`   👤  Employé : ${e.name} (${e.role})`);
  }

  // ── 5. BOOKING SETTINGS + HORAIRES ────────────────────────────────────────
  await q(
    `INSERT INTO booking_settings (user_id, is_enabled, slug, business_description, advance_booking_days, min_notice_hours)
     VALUES ($1, TRUE, 'salon-elite-coiffure', 'Salon de coiffure haut de gamme au cœur de la ville.', 30, 1)
     ON CONFLICT (user_id) DO UPDATE SET is_enabled=TRUE, slug='salon-elite-coiffure'`,
    [uid]
  );

  // Horaires lun-sam 9h-19h, dim fermé
  for (let d = 0; d <= 6; d++) {
    await q(
      `INSERT INTO business_hours (user_id, day_of_week, open_time, close_time, is_open)
       VALUES ($1,$2,'09:00','19:00',$3) ON CONFLICT (user_id, day_of_week) DO NOTHING`,
      [uid, d, d !== 0]
    );
  }
  console.log('   🕐  Horaires salon configurés (lun-sam 9h-19h)');

  // ── 6. SERVICES DE RÉSERVATION ────────────────────────────────────────────
  const bookingServices = [
    { name: 'Coupe Homme',    dur: 30,  price: 18, empKey: 'Karim Benali',   catKey: 'Coiffure Homme' },
    { name: 'Coupe + Barbe',  dur: 45,  price: 28, empKey: 'Karim Benali',   catKey: 'Coiffure Homme' },
    { name: 'Coupe Femme',    dur: 45,  price: 35, empKey: 'Sophie Martin',  catKey: 'Coiffure Femme' },
    { name: 'Couleur/Mèches', dur: 120, price: 75, empKey: 'Sophie Martin',  catKey: 'Coiffure Femme' },
    { name: 'Soin kératine',  dur: 90,  price: 95, empKey: 'Léa Dubois',     catKey: 'Soins & Beauté' },
  ];
  const bsIds = {};
  for (const s of bookingServices) {
    const [row] = await q(
      `INSERT INTO booking_services (user_id, category_id, name, duration_minutes, price, is_active)
       VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id`,
      [uid, cats[s.catKey], s.name, s.dur, s.price]
    );
    bsIds[s.name] = row.id;
    console.log(`   🗓  Service résa : ${s.name} (${s.dur}min, ${s.price}€)`);
  }

  // ── 7. RENDEZ-VOUS ────────────────────────────────────────────────────────
  const rdvData = [
    { svc:'Coupe Homme',    emp:'Karim Benali',  date:today,    start:'09:00', end:'09:30', name:'Mohamed Ait',    email:'client1@test.fr', status:'confirmed' },
    { svc:'Coupe + Barbe',  emp:'Karim Benali',  date:today,    start:'10:00', end:'10:45', name:'Yacine Boudah',  email:'client2@test.fr', status:'confirmed' },
    { svc:'Coupe Femme',    emp:'Sophie Martin', date:today,    start:'09:30', end:'10:15', name:'Marie Lambert',  email:'client3@test.fr', status:'confirmed' },
    { svc:'Couleur/Mèches', emp:'Sophie Martin', date:today,    start:'11:00', end:'13:00', name:'Julie Renard',   email:'client4@test.fr', status:'confirmed' },
    { svc:'Soin kératine',  emp:'Léa Dubois',    date:today,    start:'10:00', end:'11:30', name:'Sarah Dupont',   email:'client5@test.fr', status:'confirmed' },
    { svc:'Coupe Homme',    emp:'Karim Benali',  date:tomorrow, start:'09:00', end:'09:30', name:'Omar Hassan',    email:'client6@test.fr', status:'confirmed' },
    { svc:'Coupe Femme',    emp:'Sophie Martin', date:tomorrow, start:'10:00', end:'10:45', name:'Nadia Slimani',  email:'client7@test.fr', status:'confirmed' },
    { svc:'Coupe Homme',    emp:'Karim Benali',  date:in2days,  start:'14:00', end:'14:30', name:'Bilal Messaoud', email:'client8@test.fr', status:'confirmed' },
    { svc:'Coupe + Barbe',  emp:'Karim Benali',  date:yesterday,start:'09:00', end:'09:45', name:'Rachid Morin',   email:'client9@test.fr', status:'confirmed' },
  ];

  for (const r of rdvData) {
    await q(
      `INSERT INTO appointments
         (user_id, service_id, employee_id, client_name, client_email, date,
          start_time, end_time, duration_minutes, status, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'online')`,
      [uid, bsIds[r.svc], emps[r.emp], r.name, r.email,
       r.date, r.start, r.end,
       parseInt(r.end.split(':')[0]) * 60 + parseInt(r.end.split(':')[1])
       - parseInt(r.start.split(':')[0]) * 60 - parseInt(r.start.split(':')[1]),
       r.status]
    );
    console.log(`   📅  RDV (${r.date}) : ${r.name} → ${r.svc} avec ${r.emp}`);
  }

  // ── 8. CLIENTS ────────────────────────────────────────────────────────────
  const clientData = [
    { first: 'Mohamed', last: 'Ait',      email: 'client1@test.fr', phone: '0612345678' },
    { first: 'Marie',   last: 'Lambert',  email: 'client3@test.fr', phone: '0687654321' },
    { first: 'Julie',   last: 'Renard',   email: 'client4@test.fr', phone: '0698765432' },
    { first: 'Sarah',   last: 'Dupont',   email: 'client5@test.fr', phone: '0611223344' },
  ];
  for (const c of clientData) {
    await q(
      `INSERT INTO client_accounts (user_id, first_name, last_name, email, phone)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, email) DO NOTHING`,
      [uid, c.first, c.last, c.email, c.phone]
    );
  }
  console.log(`   👥  ${clientData.length} clients créés`);

  // ── 9. TRANSACTIONS CAISSE — aujourd'hui ──────────────────────────────────
  const txToday = [
    { type:'revenue', amount:18.00, desc:'Coupe simple',      cat:'Coiffure Homme', emp:'Karim Benali',  method:'cash',     time:'09:30', catKey: services['Coupe simple'] },
    { type:'revenue', amount:28.00, desc:'Coupe + Barbe',     cat:'Coiffure Homme', emp:'Karim Benali',  method:'card',     time:'10:45', catKey: services['Coupe + Barbe'] },
    { type:'revenue', amount:35.00, desc:'Coupe femme',       cat:'Coiffure Femme', emp:'Sophie Martin', method:'card',     time:'10:15', catKey: services['Coupe femme'] },
    { type:'revenue', amount:75.00, desc:'Couleur / Mèches',  cat:'Coiffure Femme', emp:'Sophie Martin', method:'card',     time:'13:00', catKey: services['Couleur / Mèches'] },
    { type:'revenue', amount:95.00, desc:'Soin kératine',     cat:'Soins & Beauté', emp:'Léa Dubois',    method:'transfer', time:'11:30', catKey: services['Soin kératine'] },
    { type:'revenue', amount:12.00, desc:'Barbe seule',       cat:'Coiffure Homme', emp:'Karim Benali',  method:'cash',     time:'14:00', catKey: services['Barbe seule'] },
    { type:'revenue', amount:20.00, desc:'Masque hydratant',  cat:'Soins & Beauté', emp:'Léa Dubois',    method:'cash',     time:'15:00', catKey: services['Masque hydratant'] },
    { type:'expense', amount:45.00, desc:'Fournitures salon', cat:'Charges du salon', emp:'Thomas Girard', method:'transfer', time:'08:30' },
  ];

  for (const tx of txToday) {
    await q(
      `INSERT INTO transactions
         (user_id, type, amount, description, category_id, employee_id, payment_method, date, time, source, locked)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',TRUE)`,
      [uid, tx.type, tx.amount, tx.desc,
       tx.catKey || cats[tx.cat], emps[tx.emp],
       tx.method, today, tx.time]
    );
    console.log(`   💰  TX aujourd'hui : ${tx.desc} — ${tx.amount}€ (${tx.method})`);
  }

  // ── 10. TRANSACTIONS CAISSE — semaine passée ──────────────────────────────
  const txPast = [
    { type:'revenue', amount:110.00, desc:'Mèches & Balayage',    cat:'Coiffure Femme',  emp:'Sophie Martin', method:'card',     date:lastWeek1, time:'10:00' },
    { type:'revenue', amount:28.00,  desc:'Coupe + Barbe',        cat:'Coiffure Homme',  emp:'Karim Benali',  method:'cash',     date:lastWeek1, time:'11:30' },
    { type:'revenue', amount:35.00,  desc:'Coupe femme',          cat:'Coiffure Femme',  emp:'Léa Dubois',    method:'card',     date:lastWeek2, time:'09:00' },
    { type:'revenue', amount:95.00,  desc:'Soin kératine',        cat:'Soins & Beauté',  emp:'Léa Dubois',    method:'transfer', date:lastWeek2, time:'14:30' },
    { type:'expense', amount:78.50,  desc:'Produits Schwarzkopf', cat:'Charges du salon',emp:'Thomas Girard', method:'transfer', date:lastWeek2, time:'08:00' },
    { type:'revenue', amount:18.00,  desc:'Coupe simple',         cat:'Coiffure Homme',  emp:'Karim Benali',  method:'cash',     date:yesterday, time:'10:00' },
    { type:'revenue', amount:75.00,  desc:'Couleur complète',     cat:'Coiffure Femme',  emp:'Sophie Martin', method:'card',     date:yesterday, time:'13:00' },
    { type:'expense', amount:32.00,  desc:'Café & snacks équipe', cat:'Charges du salon',emp:'Thomas Girard', method:'cash',     date:yesterday, time:'12:00' },
  ];

  for (const tx of txPast) {
    await q(
      `INSERT INTO transactions
         (user_id, type, amount, description, category_id, employee_id, payment_method, date, time, source, locked)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',TRUE)`,
      [uid, tx.type, tx.amount, tx.desc,
       cats[tx.cat], emps[tx.emp],
       tx.method, tx.date, tx.time]
    );
    console.log(`   📆  TX (${tx.date}) : ${tx.desc} — ${tx.amount}€`);
  }

  // ── 11. NOTIFICATION SETTINGS ─────────────────────────────────────────────
  await q(
    `INSERT INTO notification_settings
       (user_id, daily_recap_enabled, daily_recap_time, daily_recap_email,
        reminder_enabled, reminder_hours_before, inapp_enabled)
     VALUES ($1, TRUE, '20:00', $2, TRUE, 24, TRUE)
     ON CONFLICT (user_id) DO NOTHING`,
    [uid, EMAIL]
  );

  // ── 12. CODE PROMO EXEMPLE ────────────────────────────────────────────────
  await q(
    `INSERT INTO promo_codes (user_id, code, type, value, max_uses, valid_from, target_clients, time_allday)
     VALUES ($1, 'BIENVENUE10', 'percent', 10, 100, $2, 'all', TRUE)
     ON CONFLICT DO NOTHING`,
    [uid, today]
  );
  console.log('   🎁  Code promo : BIENVENUE10 (-10%)');

  // ── RÉSUMÉ ────────────────────────────────────────────────────────────────
  const totToday = txToday.filter(t => t.type === 'revenue').reduce((s, t) => s + t.amount, 0);
  const totWeek  = txPast.filter(t => t.type === 'revenue').reduce((s, t) => s + t.amount, 0);

  console.log('\n' + '═'.repeat(58));
  console.log('  ✅  SEED TERMINÉ AVEC SUCCÈS');
  console.log('═'.repeat(58));
  console.log('');
  console.log('  🔐  CONNEXION');
  console.log(`       Email        : ${EMAIL}`);
  console.log(`       Mot de passe : ${PASSWORD}`);
  console.log('');
  console.log('  📊  DONNÉES INSÉRÉES');
  console.log(`       👤  ${empData.length} employés`);
  console.log(`       📁  ${catData.length} catégories + ${serviceItems.length} services`);
  console.log(`       📅  ${rdvData.length} rendez-vous`);
  console.log(`       💰  ${txToday.length} tx aujourd'hui  → CA: ${totToday}€`);
  console.log(`       📆  ${txPast.length} tx semaine passée → CA: ${totWeek}€`);
  console.log(`       👥  ${clientData.length} clients`);
  console.log('');
  console.log('  🌐  BOOKING PUBLIC : /booking/salon-elite-coiffure');
  console.log('═'.repeat(58) + '\n');

  await pool.end();
}

seed().catch(err => {
  console.error('\n❌  ERREUR SEED :', err.message);
  console.error(err.stack);
  process.exit(1);
});