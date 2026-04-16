// src/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { sendVerificationEmail } = require('../utils/email');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

const SEED_CATS = [
  { name: 'Coupe homme',  type: 'revenue', icon: 'Scissors',    color: '#3b82f6' },
  { name: 'Coupe femme',  type: 'revenue', icon: 'Sparkles',    color: '#ec4899' },
  { name: 'Barbe',        type: 'revenue', icon: 'Scissors',    color: '#10b981' },
  { name: 'Coloration',   type: 'revenue', icon: 'Sparkles',    color: '#8b5cf6' },
  { name: 'Loyer',        type: 'expense', icon: 'Home',        color: '#ef4444' },
  { name: 'Fournitures',  type: 'expense', icon: 'ShoppingBag', color: '#f59e0b' },
];

function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
async function saveCode(key, code, data, minutes = 15) {
  const expires = new Date(Date.now() + minutes * 60 * 1000);
  await pool.query(
    `INSERT INTO verification_codes (key, code, data, expires_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (key) DO UPDATE SET code=$2, data=$3, expires_at=$4, created_at=NOW()`,
    [key, code, JSON.stringify(data), expires]
  );
}
async function getCode(key) {
  const { rows } = await pool.query('SELECT * FROM verification_codes WHERE key=$1', [key]);
  if (!rows.length) return null;
  if (new Date() > rows[0].expires_at) {
    await pool.query('DELETE FROM verification_codes WHERE key=$1', [key]);
    return null;
  }
  return rows[0];
}
async function deleteCode(key) {
  await pool.query('DELETE FROM verification_codes WHERE key=$1', [key]);
}
function maskEmail(email) {
  return email.replace(/^(.{2})(.*)(@.+)$/, (_, a, b, c) =>
    a + '•'.repeat(Math.max(1, b.length)) + c
  );
}

// ═══════════════════ INSCRIPTION ════════════════════════════════════════════

router.post('/register', async (req, res) => {
  try {
    const { email, password, businessName, phone, address, country, city, lat, lng } = req.body;
    if (!email || !password || !businessName)
      return res.status(400).json({ error: 'Tous les champs sont requis.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Mot de passe trop court (6 min).' });
    const { rows } = await pool.query('SELECT id FROM users WHERE email=LOWER($1)', [email]);
    if (rows.length) return res.status(409).json({ error: 'Cet email est déjà utilisé.' });
    const code = genCode();
    await saveCode(`reg_${email.toLowerCase()}`, code, { email, password, businessName, phone: phone||'', address: address||'', country: country||'FR', city: city||'', lat: lat||null, lng: lng||null });
    // Répondre immédiatement au client, puis envoyer l'email en arrière-plan
    res.json({ ok: true });
    setImmediate(() => sendVerificationEmail(email, code, 'Confirmez votre inscription FlowIA', 'register').catch(e => console.error('[EMAIL register]', e.message)));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/register/confirm', async (req, res) => {
  try {
    const { email, code } = req.body;
    const rec = await getCode(`reg_${email.toLowerCase()}`);
    if (!rec) return res.status(400).json({ error: 'Code invalide ou expiré.' });
    if (rec.code !== code.trim()) return res.status(400).json({ error: 'Code incorrect.' });
    const { email: em, password, businessName, phone, address, country, city, lat, lng } = rec.data;
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email,password_hash,business_name,phone,address,country,city,lat,lng) VALUES (LOWER($1),$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,email,business_name,phone,address,country,city`,
      [em, hash, businessName, phone||null, address||null, country||'FR', city||null, lat||null, lng||null]
    );
    const user = rows[0];
    for (const cat of SEED_CATS) {
      await pool.query('INSERT INTO categories (user_id,name,type,icon,color) VALUES ($1,$2,$3,$4,$5)',
        [user.id, cat.name, cat.type, cat.icon, cat.color]);
    }

    // Créer automatiquement booking_settings avec un slug unique basé sur le nom du commerce
    // Les réservations en ligne sont désactivées par défaut
    const baseSlug = businessName
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // supprimer accents
      .replace(/[^a-z0-9\s-]/g, '')                     // garder lettres, chiffres, espaces, tirets
      .trim()
      .replace(/\s+/g, '-')                              // espaces → tirets
      .replace(/-+/g, '-')                               // tirets multiples → 1
      .substring(0, 30)                                  // max 30 chars
      || 'mon-commerce';
    // S'assurer que le slug est unique en ajoutant un suffixe si nécessaire
    let finalSlug = baseSlug;
    let attempt = 0;
    while (true) {
      const { rows: existing } = await pool.query('SELECT id FROM booking_settings WHERE slug=$1', [finalSlug]);
      if (!existing.length) break;
      attempt++;
      finalSlug = `${baseSlug}-${attempt}`;
    }
    await pool.query(
      `INSERT INTO booking_settings (user_id, is_enabled, slug, advance_booking_days, min_notice_hours)
       VALUES ($1, false, $2, 30, 1)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id, finalSlug]
    );
    await deleteCode(`reg_${email.toLowerCase()}`);
    const token = jwt.sign(
      { userId: user.id, email: user.email, businessName: user.business_name },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({ ok: true, token, user: { id: user.id, email: user.email, businessName: user.business_name } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ═══════════════════ RENVOI CODE ════════════════════════════════════════════
// POST /api/auth/resend-code — renvoi du code d'inscription sans resaisir tous les champs
router.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis.' });

    const key = `reg_${email.toLowerCase()}`;
    const rec = await getCode(key);
    if (!rec) return res.status(404).json({
      error: "Session expirée. Veuillez recommencer l'inscription.",
      code: 'SESSION_EXPIRED',
    });

    // Générer un nouveau code et mettre à jour le même enregistrement
    const newCode = genCode();
    await saveCode(key, newCode, rec.data);

    // Envoyer en arrière-plan
    res.json({ ok: true });
    setImmediate(() =>
      sendVerificationEmail(email, newCode, 'Confirmez votre inscription FlowIA', 'register')
        .catch(e => console.error('[EMAIL resend-code]', e.message))
    );
  } catch (err) {
    console.error('[RESEND CODE]', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ═══════════════════ CONNEXION ═══════════════════════════════════════════════

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE email=LOWER($1)', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Email introuvable.' });
    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Mot de passe incorrect.' });
    const user = rows[0];
    const token = jwt.sign(
      { userId: user.id, email: user.email, businessName: user.business_name },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({ ok: true, token, user: { id: user.id, email: user.email, businessName: user.business_name } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ═══════════════════ MOT DE PASSE OUBLIÉ ═════════════════════════════════════

router.post('/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    const { rows } = await pool.query('SELECT id FROM users WHERE email=LOWER($1)', [email]);
    if (!rows.length) return res.status(404).json({ error: 'Aucun compte avec cet email.' });
    const code = genCode();
    await saveCode(`rst_${email.toLowerCase()}`, code, { userId: rows[0].id });
    res.json({ ok: true });
    setImmediate(() => sendVerificationEmail(email, code, 'Réinitialisez votre mot de passe FlowIA').catch(e => console.error('[EMAIL forgot]', e.message)));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/forgot/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    const rec = await getCode(`rst_${email.toLowerCase()}`);
    if (!rec) return res.status(400).json({ error: 'Code invalide ou expiré.' });
    if (rec.code !== code.trim()) return res.status(400).json({ error: 'Code incorrect.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/forgot/reset', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ error: 'Mot de passe trop court.' });
    const rec = await getCode(`rst_${email.toLowerCase()}`);
    if (!rec) return res.status(400).json({ error: 'Code invalide ou expiré.' });
    if (rec.code !== code.trim()) return res.status(400).json({ error: 'Code incorrect.' });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash=$1 WHERE email=LOWER($2)', [hash, email]);
    await deleteCode(`rst_${email.toLowerCase()}`);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ═══════════════════ CHANGEMENT EMAIL ════════════════════════════════════════

router.post('/change-email', authMiddleware, async (req, res) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail) return res.status(400).json({ error: 'Email requis.' });
    const { rows } = await pool.query('SELECT id FROM users WHERE email=LOWER($1)', [newEmail]);
    if (rows.length) return res.status(409).json({ error: 'Email déjà utilisé.' });
    const code = genCode();
    await saveCode(`chg_email_${req.user.userId}`, code, { newEmail: newEmail.toLowerCase() });
    res.json({ ok: true });
    setImmediate(() => sendVerificationEmail(newEmail, code, 'Confirmez votre nouvel email — FlowIA', 'email').catch(e => console.error('[EMAIL change-email]', e.message)));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/change-email/confirm', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    const rec = await getCode(`chg_email_${req.user.userId}`);
    if (!rec) return res.status(400).json({ error: 'Code invalide ou expiré.' });
    if (rec.code !== code.trim()) return res.status(400).json({ error: 'Code incorrect.' });
    const { newEmail } = rec.data;
    await pool.query('UPDATE users SET email=$1 WHERE id=$2', [newEmail, req.user.userId]);
    await deleteCode(`chg_email_${req.user.userId}`);
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.userId]);
    const user = rows[0];
    const token = jwt.sign(
      { userId: user.id, email: user.email, businessName: user.business_name },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({ ok: true, token, newEmail });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ═══════════════════ PIN ADMIN — ENTIÈREMENT EN BASE ══════════════════════════
//
// user_pins : user_id (PK, FK → users) | pin_hash | updated_at
// → 1 PIN par compte, lié au user_id, hashé bcrypt
// → Jamais de hash en localStorage, uniquement un pinSessionToken JWT

// GET /api/auth/pin/status → ce compte a-t-il un PIN ?
router.get('/pin/status', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT user_id FROM user_pins WHERE user_id=$1', [req.user.userId]);
    res.json({ ok: true, hasPin: rows.length > 0 });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/auth/pin/verify
// → Compare le PIN saisi avec le hash en BDD (bcrypt)
// → Si correct : génère un pinSessionToken (JWT 8h) lié au userId
// → Le frontend stocke ce token, PAS le hash
router.post('/pin/verify', authMiddleware, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN requis.' });
    const { rows } = await pool.query('SELECT pin_hash FROM user_pins WHERE user_id=$1', [req.user.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Aucun PIN configuré pour ce compte.' });
    const valid = await bcrypt.compare(String(pin), rows[0].pin_hash);
    if (!valid) return res.json({ ok: true, valid: false });
    // PIN correct → session token 8h lié au userId
    const pinSessionToken = jwt.sign(
      { userId: req.user.userId, scope: 'pin_session' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ ok: true, valid: true, pinSessionToken });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/auth/pin/check-session
// → Vérifie que le pinSessionToken est valide ET appartient au compte connecté
// → Appelé au chargement de la page admin pour savoir si la session PIN est active
// → Si l'utilisateur change de compte, userId différent → valid: false automatiquement
router.post('/pin/check-session', authMiddleware, async (req, res) => {
  try {
    const { pinSessionToken } = req.body;
    if (!pinSessionToken) return res.json({ ok: true, valid: false });
    let decoded;
    try { decoded = jwt.verify(pinSessionToken, process.env.JWT_SECRET); }
    catch { return res.json({ ok: true, valid: false }); }
    // VÉRIFICATION CRITIQUE : userId du token PIN === userId du compte connecté
    if (decoded.scope !== 'pin_session' || decoded.userId !== req.user.userId) {
      return res.json({ ok: true, valid: false });
    }
    res.json({ ok: true, valid: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/auth/pin/set → créer ou remplacer le PIN en BDD
router.post('/pin/set', authMiddleware, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(String(pin)))
      return res.status(400).json({ error: 'PIN de 4 chiffres requis.' });
    const hash = await bcrypt.hash(String(pin), 12);
    await pool.query(
      `INSERT INTO user_pins (user_id,pin_hash,updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (user_id) DO UPDATE SET pin_hash=$2, updated_at=NOW()`,
      [req.user.userId, hash]
    );
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// DELETE /api/auth/pin → supprimer le PIN du compte
router.delete('/pin', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM user_pins WHERE user_id=$1', [req.user.userId]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/auth/pin-change-request → OTP email pour autoriser changement PIN
router.post('/pin-change-request', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT email FROM users WHERE id=$1', [req.user.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const { email } = rows[0];
    const code = genCode();
    await saveCode(`pin_chg_${req.user.userId}`, code, { userId: req.user.userId }, 10);
    await sendVerificationEmail(email, code, '🔐 Autorisation changement PIN — FlowIA', 'pin_change');
    res.json({ ok: true, emailMasked: maskEmail(email) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/auth/pin-change-confirm → vérifie l'OTP, retourne authToken 5min
router.post('/pin-change-confirm', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: 'Code requis.' });
    const rec = await getCode(`pin_chg_${req.user.userId}`);
    if (!rec) return res.status(400).json({ error: 'Code invalide ou expiré (10 min max).' });
    if (rec.code !== code.trim()) return res.status(400).json({ error: 'Code incorrect.' });
    await deleteCode(`pin_chg_${req.user.userId}`);
    const authToken = jwt.sign(
      { userId: req.user.userId, scope: 'pin_change_authorized' },
      process.env.JWT_SECRET, { expiresIn: '5m' }
    );
    res.json({ ok: true, authToken });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/auth/pin-forgot-request → OTP email sans être connecté
router.post('/pin-forgot-request', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis.' });
    const { rows } = await pool.query('SELECT id,email FROM users WHERE email=LOWER($1)', [email.toLowerCase()]);
    if (!rows.length) return res.json({ ok: true, emailMasked: maskEmail(email) }); // sécurité
    const user = rows[0];
    const code = genCode();
    await saveCode(`pin_forgot_${user.id}`, code, { userId: user.id }, 15);
    await sendVerificationEmail(user.email, code, 'Réinitialisation PIN — FlowIA', 'pin_change');
    res.json({ ok: true, emailMasked: maskEmail(user.email) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/auth/pin-forgot-verify
router.post('/pin-forgot-verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email et code requis.' });
    const { rows } = await pool.query('SELECT id FROM users WHERE email=LOWER($1)', [email.toLowerCase()]);
    if (!rows.length) return res.status(400).json({ error: 'Code invalide.' });
    const userId = rows[0].id;
    const rec = await getCode(`pin_forgot_${userId}`);
    if (!rec) return res.status(400).json({ error: 'Code invalide ou expiré (15 min max).' });
    if (rec.code !== code.trim()) return res.status(400).json({ error: 'Code incorrect.' });
    await deleteCode(`pin_forgot_${userId}`);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/auth/pin-lockout-notify
router.post('/pin-lockout-notify', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (email) {
      const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
      await sendVerificationEmail(email, '3 tentatives échouées à ' + now,
        '⚠️ Alerte sécurité — Tentatives PIN FlowIA', 'lockout_alert');
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.json({ ok: true }); }
});

// ═══════════════════ SUPPRESSION COMPTE COMMERÇANT ══════════════════════════
// DELETE /api/auth/account — RGPD : suppression du compte commerçant
// Règles : anonymiser les RDV/transactions, supprimer les données perso
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 1. Anonymiser les RDV (garder l'historique pour les clients)
    await pool.query(
      `UPDATE appointments SET
         client_name='[Commerçant supprimé]',
         client_email=NULL, client_phone=NULL
       WHERE user_id=$1`, [userId]
    );

    // 2. Anonymiser les transactions (garder montants pour comptabilité)
    await pool.query(
      `UPDATE transactions SET
         description=COALESCE(description,'Transaction'),
         client_email=NULL, client_note=NULL
       WHERE user_id=$1`, [userId]
    );

    // 3. Supprimer les données liées (en cascade ou manuellement)
    const cascadeTables = [
      'push_subscriptions', 'notification_settings', 'notification_log',
      'app_notifications', 'employee_pins', 'user_pins',
      'verification_codes', 'booking_settings',
      'business_hours', 'business_breaks',
      'booking_services', 'booking_service_categories',
      'employee_time_slots', 'employee_hours', 'employee_availability',
      'employee_absences', 'service_commissions', 'employee_commissions',
      'promo_codes', 'loyalty_programs',
      'client_accounts', 'client_notes', 'client_credits',
      'credit_transactions', 'media',
      'categories', 'employees',
    ];
    for (const table of cascadeTables) {
      await pool.query(`DELETE FROM ${table} WHERE user_id=$1`, [userId])
        .catch(() => {}); // Ignorer si table n'a pas user_id
    }

    // 4. Supprimer le compte utilisateur (déclenche ON DELETE CASCADE)
    await pool.query('DELETE FROM users WHERE id=$1', [userId]);

    console.log(`[RGPD] Suppression compte commerçant ${userId}`);
    res.json({ ok: true, message: 'Votre compte a été supprimé définitivement.' });
  } catch(e) {
    console.error('[DELETE MERCHANT ACCOUNT]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/me — retourne les infos complètes du commerçant depuis la BDD
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, business_name, phone, address, city, postal_code,
              google_business_url, created_at, first_name, last_name,
              onboarding_completed, google_id, avatar_url
       FROM users WHERE id=$1`,
      [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const u = rows[0];
    res.json({ user: {
      ...req.user,
      email:              u.email,
      businessName:       u.business_name,
      firstName:          u.first_name,
      lastName:           u.last_name,
      phone:              u.phone,
      address:            u.address,
      city:               u.city,
      postalCode:         u.postal_code,
      googleBusinessUrl:  u.google_business_url,
      onboardingCompleted: u.onboarding_completed,
      hasGoogle:          !!u.google_id,
      avatarUrl:          u.avatar_url,
    }});
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── POST /api/auth/change-password ───────────────────────────────────────────
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Champs requis.' });
    if (newPassword.length < 6)       return res.status(400).json({ error: 'Minimum 6 caractères.' });
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const valid = await bcrypt.compare(oldPassword, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.userId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/auth/profile — mise à jour infos commerçant ────────────────────
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { businessName, phone, address, city, postalCode, googleBusinessUrl } = req.body;
    const { rows } = await pool.query(
      `UPDATE users SET
         business_name       = COALESCE($1, business_name),
         phone               = COALESCE($2, phone),
         address             = COALESCE($3, address),
         city                = COALESCE($4, city),
         postal_code         = COALESCE($5, postal_code),
         google_business_url = COALESCE($6, google_business_url)
       WHERE id=$7
       RETURNING id, email, business_name, phone, address, city, postal_code, google_business_url`,
      [businessName||null, phone||null, address||null,
       city||null, postalCode||null, googleBusinessUrl||null,
       req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    res.json({ ok: true, user: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  GOOGLE OAUTH — Commerçant (inscription / connexion)
//  URL enregistrée chez Google : /api/auth/google/merchant/callback
//  state = "merchant" pour distinguer du flow client
// ═══════════════════════════════════════════════════════════════════════════
router.get('/google/merchant/callback', async (req, res) => {
  const { code, error } = req.query;
  const BACKEND_URL  = process.env.BACKEND_URL  || 'https://flowia-backend.onrender.com';
  const FRONTEND_URL = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'https://haircoifflille.fr';
  const redirectUri  = `${BACKEND_URL}/api/auth/google/merchant/callback`;

  if (error || !code) {
    return res.redirect(`${FRONTEND_URL}?auth_error=google_denied`);
  }

  try {
    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // 1. Échanger le code contre un access_token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('Token Google invalide');

    // 2. Récupérer les infos du profil Google
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    const { id: googleId, email, given_name, family_name, picture } = profile;
    if (!email) throw new Error('Email non fourni par Google');

    const emailLow = email.toLowerCase().trim();

    // 3. Chercher un commerçant existant par google_id OU email
    let user;
    const { rows: byGoogle } = await pool.query('SELECT * FROM users WHERE google_id=$1', [googleId]);
    if (byGoogle.length) {
      user = byGoogle[0];
      // Mettre à jour l'avatar
      await pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [picture || null, user.id]);
    } else {
      const { rows: byEmail } = await pool.query('SELECT * FROM users WHERE email=LOWER($1)', [emailLow]);
      if (byEmail.length) {
        // Lier le compte Google à un compte email existant
        user = byEmail[0];
        await pool.query('UPDATE users SET google_id=$1, avatar_url=$2 WHERE id=$3',
          [googleId, picture || null, user.id]);
      } else {
        // 4. Créer un nouveau commerçant (onboarding NON complété)
        const { rows: created } = await pool.query(
          `INSERT INTO users (email, password_hash, business_name, google_id, first_name, last_name, avatar_url, onboarding_completed)
           VALUES (LOWER($1), '', $2, $3, $4, $5, $6, FALSE) RETURNING *`,
          [emailLow, `Commerce de ${given_name || 'Nouveau'}`, googleId, given_name || '', family_name || '', picture || null]
        );
        user = created[0];

        // Seed catégories par défaut
        for (const cat of SEED_CATS) {
          await pool.query('INSERT INTO categories (user_id,name,type,icon,color) VALUES ($1,$2,$3,$4,$5)',
            [user.id, cat.name, cat.type, cat.icon, cat.color]);
        }

        // Créer booking_settings avec slug unique
        const baseSlug = (given_name || 'commerce')
          .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 30) || 'mon-commerce';
        let finalSlug = baseSlug;
        let attempt = 0;
        while (true) {
          const { rows: existing } = await pool.query('SELECT id FROM booking_settings WHERE slug=$1', [finalSlug]);
          if (!existing.length) break;
          attempt++;
          finalSlug = `${baseSlug}-${attempt}`;
        }
        await pool.query(
          `INSERT INTO booking_settings (user_id, is_enabled, slug, advance_booking_days, min_notice_hours)
           VALUES ($1, false, $2, 30, 1) ON CONFLICT (user_id) DO NOTHING`,
          [user.id, finalSlug]
        );
      }
    }

    // 5. Générer le JWT commerçant
    const token = jwt.sign(
      { userId: user.id, email: user.email, businessName: user.business_name },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const userObj = {
      id: user.id, email: user.email, businessName: user.business_name,
      firstName: user.first_name, lastName: user.last_name,
      onboardingCompleted: user.onboarding_completed,
      avatarUrl: user.avatar_url,
    };

    // 6. Page HTML qui ferme la popup et envoie le token au parent
    res.send(`<!DOCTYPE html><html><head><title>Connexion...</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#fff}</style>
    </head><body>
      <div style="text-align:center">
        <div style="font-size:32px;margin-bottom:12px">&#10003;</div>
        <p style="font-size:15px;font-weight:600">Connexion reussie</p>
        <p style="font-size:12px;opacity:0.6">Fermeture en cours...</p>
      </div>
      <script>
        const token = ${JSON.stringify(token)};
        const user  = ${JSON.stringify(userObj)};
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'MERCHANT_GOOGLE_AUTH_SUCCESS', token, user }, '*');
          setTimeout(() => window.close(), 400);
        } else {
          localStorage.setItem('ff_token', token);
          window.location.href = '/';
        }
      </script>
    </body></html>`);

    console.log(`[GOOGLE OAUTH MERCHANT] ${emailLow} connecté`);

  } catch(e) {
    console.error('[GOOGLE OAUTH MERCHANT]', e.message);
    res.redirect(`${FRONTEND_URL}?auth_error=${encodeURIComponent(e.message)}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/auth/onboarding — Complétion obligatoire du profil commerçant
// ═══════════════════════════════════════════════════════════════════════════
router.post('/onboarding', authMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, businessName, phone, address, city, postalCode, country, lat, lng } = req.body;
    if (!firstName?.trim() || !lastName?.trim() || !businessName?.trim() || !phone?.trim() || !address?.trim() || !city?.trim() || !postalCode?.trim()) {
      return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
    }

    const { rows } = await pool.query(
      `UPDATE users SET
         first_name = $1, last_name = $2, business_name = $3,
         phone = $4, address = $5, city = $6, postal_code = $7,
         country = COALESCE($8, 'FR'), lat = $9, lng = $10,
         onboarding_completed = TRUE
       WHERE id = $11
       RETURNING id, email, business_name, first_name, last_name, phone, address, city, postal_code, onboarding_completed`,
      [firstName.trim(), lastName.trim(), businessName.trim(), phone.trim(), address.trim(), city.trim(), postalCode.trim(), country || 'FR', lat || null, lng || null, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const u = rows[0];

    // Mettre à jour le slug si le nom du commerce a changé
    const baseSlug = businessName.trim()
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 30) || 'mon-commerce';
    let finalSlug = baseSlug;
    let attempt = 0;
    while (true) {
      const { rows: existing } = await pool.query('SELECT id FROM booking_settings WHERE slug=$1 AND user_id!=$2', [finalSlug, req.user.userId]);
      if (!existing.length) break;
      attempt++;
      finalSlug = `${baseSlug}-${attempt}`;
    }
    await pool.query('UPDATE booking_settings SET slug=$1 WHERE user_id=$2', [finalSlug, req.user.userId]);

    // Nouveau token avec le bon businessName
    const token = jwt.sign(
      { userId: u.id, email: u.email, businessName: u.business_name },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      ok: true, token,
      user: {
        id: u.id, email: u.email, businessName: u.business_name,
        firstName: u.first_name, lastName: u.last_name,
        onboardingCompleted: true,
      }
    });
  } catch (e) {
    console.error('[ONBOARDING]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  GOOGLE OAUTH — Callback générique (1 seule URL pour tous les commerçants)
//  URL enregistrée chez Google : /api/auth/google/callback
//  Le slug du commerçant est récupéré via le paramètre `state`
// ═══════════════════════════════════════════════════════════════════════════
router.get('/google/callback', async (req, res) => {
  const { code, state: slug, error } = req.query;
  const BACKEND_URL  = process.env.BACKEND_URL  || 'https://flowia-backend.onrender.com';
  const FRONTEND_URL = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'https://haircoifflille.fr';
  const redirectUri  = `${BACKEND_URL}/api/auth/google/callback`;

  if (error || !code || !slug) {
    return res.redirect(`${FRONTEND_URL}?auth_error=google_denied`);
  }

  try {
    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // 1. Échanger le code contre un access_token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('Token Google invalide');

    // 2. Récupérer les infos du profil Google
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    const { id: googleId, email, given_name, family_name, picture } = profile;
    if (!email) throw new Error('Email non fourni par Google');

    const emailLow = email.toLowerCase().trim();

    // 3. Récupérer le user_id du commerçant via le slug
    const { rows: biz } = await pool.query(
      'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE', [slug]
    );
    if (!biz.length) throw new Error('Commerce introuvable');
    const userId = biz[0].user_id;

    // 4. Trouver ou créer le compte global_clients
    let gc;
    const { rows: byGoogle } = await pool.query(
      'SELECT * FROM global_clients WHERE google_id=$1', [googleId]
    );
    if (byGoogle.length) {
      gc = byGoogle[0];
      await pool.query(
        'UPDATE global_clients SET avatar_url=$1, updated_at=NOW() WHERE id=$2',
        [picture || null, gc.id]
      );
    } else {
      const { rows: byEmail } = await pool.query(
        'SELECT * FROM global_clients WHERE LOWER(email)=$1', [emailLow]
      );
      if (byEmail.length) {
        await pool.query(
          'UPDATE global_clients SET google_id=$1, avatar_url=$2, is_verified=TRUE, updated_at=NOW() WHERE id=$3',
          [googleId, picture || null, byEmail[0].id]
        );
        gc = { ...byEmail[0], google_id: googleId, avatar_url: picture };
      } else {
        const consentIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
        const { rows: created } = await pool.query(
          `INSERT INTO global_clients
             (email, google_id, first_name, last_name, avatar_url, is_verified, consent_at, consent_ip)
           VALUES ($1,$2,$3,$4,$5,TRUE,NOW(),$6) RETURNING *`,
          [emailLow, googleId, given_name || '', family_name || '', picture || null, consentIp]
        );
        gc = created[0];
      }
    }

    // 5. Créer/mettre à jour la fiche locale chez ce commerçant
    const { rows: localRows } = await pool.query(
      `INSERT INTO client_accounts
         (user_id, email, first_name, last_name, global_client_id, source)
       VALUES ($1,$2,$3,$4,$5,'google')
       ON CONFLICT (user_id, email) DO UPDATE SET
         global_client_id = EXCLUDED.global_client_id,
         first_name = COALESCE(NULLIF(client_accounts.first_name,''), EXCLUDED.first_name),
         last_name  = COALESCE(NULLIF(client_accounts.last_name,''),  EXCLUDED.last_name)
       RETURNING *`,
      [userId, emailLow, gc.first_name, gc.last_name || '', gc.id]
    );
    const local = localRows[0];

    // 6. Générer le JWT
    const token = jwt.sign(
      { clientId: local.id, merchantId: userId, globalClientId: gc.id, scope: 'client' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    const clientObj = {
      id: local.id, email: gc.email,
      first_name: gc.first_name, last_name: gc.last_name,
      avatar_url: gc.avatar_url || null,
      global_client_id: gc.id, has_global_account: true,
    };

    // 7. Page HTML qui ferme la popup ou redirige
    res.send(`<!DOCTYPE html><html><head><title>Connexion...</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f0f0f;color:#fff}</style>
    </head><body>
      <div style="text-align:center">
        <div style="font-size:32px;margin-bottom:12px">✅</div>
        <p style="font-size:15px;font-weight:600">Connexion réussie</p>
        <p style="font-size:12px;opacity:0.6">Fermeture en cours...</p>
      </div>
      <script>
        const token  = ${JSON.stringify(token)};
        const client = ${JSON.stringify(clientObj)};
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', token, client }, '*');
          setTimeout(() => window.close(), 400);
        } else {
          // Fallback : redirection directe (mobile / no-popup)
          const p = encodeURIComponent(JSON.stringify(client));
          window.location.href = ${JSON.stringify(`${FRONTEND_URL}/book/${slug}`)} +
            '?gc_token=' + encodeURIComponent(token) + '&gc_client=' + p;
        }
      </script>
    </body></html>`);

    console.log(`[GOOGLE OAUTH] ${emailLow} connecté sur slug=${slug}`);

  } catch(e) {
    console.error('[GOOGLE OAUTH]', e.message);
    res.redirect(`${FRONTEND_URL}/book/${slug || ''}?auth_error=${encodeURIComponent(e.message)}`);
  }
});

module.exports = router;