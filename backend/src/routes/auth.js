// src/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { getMaintenanceState, isBypassedUser } = require('../utils/platformSettings');

// Helper : bloque l'access si maintenance ACTIVE sur merchant_portal et user
// PAS dans la whitelist bypass. Utilise apres auth reussie (login form +
// Google OAuth callback) pour empecher les non-whitelisted de se connecter.
// Retourne true si bloque (caller doit return), false sinon.
async function checkMaintenanceBlock(userId, email) {
  try {
    const state = await getMaintenanceState();
    if (!state.merchant_portal?.enabled) return null;
    if (isBypassedUser(state, userId, email)) return null;
    return {
      message: state.merchant_portal.message
        || "Notre plateforme est en cours de maintenance. Merci de reessayer plus tard ou de contacter directement le support.",
    };
  } catch {
    // Fail-open : si on ne peut pas lire l'etat, on laisse passer.
    return null;
  }
}
const { sendVerificationEmail } = require('../utils/email');
const { authMiddleware } = require('../middleware/auth');
const { setClientCookie } = require('../utils/clientCookies');
const {
  buildMerchantSlug,
  findUniqueSlug,
  archiveOldSlug,
} = require('../utils/buildSlug');
const { isValidBusinessType } = require('../utils/businessTypes');
const { validatePhone: validatePhoneE164 } = require('../utils/phone');
const { seedMerchantDefaults, seedBusinessHours } = require('../utils/seedMerchantDefaults');
const { exportAllUserData } = require('../utils/exportUserData');
const router = express.Router();

// Adresse complete obligatoire a l'inscription / onboarding. On exige au
// minimum 6 caracteres apres trim pour eviter qu'un commercant valide en
// tapant "x" ou "rue". La verification fine (autocompletion BAN, lat/lng)
// reste cote frontend ; le backend bloque uniquement le clairement invalide.
function isValidAddress(raw) {
  return typeof raw === 'string' && raw.trim().length >= 6;
}

// Numero de rue obligatoire (donnee precise demandee par l'exploitant). On
// accepte les formats reels : "12", "12B", "1 bis", "12-14". Doit contenir au
// moins un chiffre et tenir en 20 caracteres (cf. colonne users.street_number).
function isValidStreetNumber(raw) {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  return s.length >= 1 && s.length <= 20 && /\d/.test(s);
}

const SEED_CATS = [
  { name: 'Coupe homme',  type: 'revenue', icon: 'Scissors',    color: '#3b82f6' },
  { name: 'Coupe femme',  type: 'revenue', icon: 'Sparkles',    color: '#ec4899' },
  { name: 'Barbe',        type: 'revenue', icon: 'Scissors',    color: '#10b981' },
  { name: 'Coloration',   type: 'revenue', icon: 'Sparkles',    color: '#8b5cf6' },
  { name: 'Loyer',        type: 'expense', icon: 'Home',        color: '#ef4444' },
  { name: 'Fournitures',  type: 'expense', icon: 'ShoppingBag', color: '#f59e0b' },
];

// Regex RFC5322-lite partagée (cf. clients.js / global-clients.js / referrals.js).
// Avant, .includes('@') laissait passer "a@b@c", "@x", etc.
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
function isValidEmail(e) {
  return typeof e === 'string' && EMAIL_RE.test(e) && e.length <= 254;
}

// Commit 31 — durée de session JWT merchant configurable par compte.
// Lit user_settings.merchant_session_duration ('12h'|'24h'|'7d'|'30d'|'never').
// 'never' → on n'inclut PAS expiresIn → JWT sans expiration côté serveur.
// Fallback : env JWT_EXPIRES_IN ou '7d'. Best-effort : tout échec retourne
// la valeur par défaut, on ne bloque jamais le login.
const ALLOWED_DURATIONS = new Set(['12h', '24h', '7d', '30d', 'never']);
async function getMerchantSessionDuration(userId) {
  if (!userId) return process.env.JWT_EXPIRES_IN || '7d';
  try {
    const { rows } = await pool.query(
      `SELECT merchant_session_duration FROM user_settings WHERE user_id=$1`,
      [userId]
    );
    const d = rows[0]?.merchant_session_duration;
    if (d && ALLOWED_DURATIONS.has(d)) return d;
  } catch (e) {
    console.warn('[AUTH session-duration]', e.message);
  }
  return process.env.JWT_EXPIRES_IN || '7d';
}

// Wrapper jwt.sign qui gère le cas 'never' (pas d'expiresIn).
function signMerchantJwt(payload, expiresIn) {
  if (expiresIn === 'never') {
    return jwt.sign(payload, process.env.JWT_SECRET);
  }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

// Hash bcrypt "dummy" pour enforcer un temps constant sur /login quand
// l'email n'existe pas (empêche l'énumération par timing attack bcrypt).
const DUMMY_BCRYPT = bcrypt.hashSync('dummy_' + process.pid + '_' + Date.now(), 12);

// Allowlist d'origines frontend acceptées pour le redirect OAuth (popup
// retour Google → /__oauth). Aligné avec le CORS dans index.js : pour
// chaque FRONTEND_URL, on ajoute aussi automatiquement www.* et
// commercant.* afin de couvrir les multi-sous-domaines (ex:
// haircoifflille.fr → haircoifflille.fr + www. + commercant.). Sans cette
// expansion, le callback renvoyait la popup sur le mauvais sous-domaine
// et BroadcastChannel (same-origin only) ne pouvait pas réveiller
// l'opener.
function buildOAuthOriginAllowlist() {
  const raw = (process.env.FRONTEND_URL || 'https://haircoifflille.fr')
    .split(',').map(s => s.trim()).filter(Boolean);
  const set = new Set();
  for (const o of raw) {
    set.add(o);
    try {
      const u = new URL(o);
      if (!u.hostname.startsWith('www.') && !u.hostname.startsWith('commercant.')) {
        set.add(`${u.protocol}//www.${u.hostname}`);
        set.add(`${u.protocol}//commercant.${u.hostname}`);
      }
    } catch { /* ignore invalid URL */ }
  }
  return { list: Array.from(set), primary: raw[0] };
}

function resolveOAuthTarget(requestedOrigin) {
  const { list, primary } = buildOAuthOriginAllowlist();
  return list.includes(requestedOrigin) ? requestedOrigin : primary;
}

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
    const { email, password, businessName, businessType, phone, address, streetNumber, country, city, postalCode, lat, lng } = req.body;
    if (!email || !password || !businessName)
      return res.status(400).json({ error: 'Tous les champs sont requis.' });
    if (!isValidEmail(String(email).trim().toLowerCase()))
      return res.status(400).json({ error: 'Email invalide.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Mot de passe trop court (6 min).' });
    // Type de commerce obligatoire pour le filtre marketplace.
    if (!isValidBusinessType(businessType))
      return res.status(400).json({ error: 'Type de commerce invalide ou manquant.', code: 'BUSINESS_TYPE_REQUIRED' });
    // Telephone obligatoire + format valide (libphonenumber-js E.164).
    const phoneCheck = validatePhoneE164(phone, { required: true, defaultCountry: country || 'FR' });
    if (!phoneCheck.valid) {
      const msg = phoneCheck.error === 'PHONE_REQUIRED' ? 'Numero de telephone obligatoire.' : 'Numero de telephone invalide.';
      return res.status(400).json({ error: msg, code: phoneCheck.error });
    }
    // Adresse complete obligatoire.
    if (!isValidAddress(address))
      return res.status(400).json({ error: 'Adresse du commerce obligatoire.', code: 'ADDRESS_REQUIRED' });
    // Numero de rue obligatoire (donnee precise et requetable).
    if (!isValidStreetNumber(streetNumber))
      return res.status(400).json({ error: 'Numero de rue obligatoire.', code: 'STREET_NUMBER_REQUIRED' });
    const { rows } = await pool.query('SELECT id FROM users WHERE email=LOWER($1)', [email]);
    if (rows.length) return res.status(409).json({ error: 'Email déjà existant, merci de changer de mail et réessayer !' });
    const code = genCode();
    await saveCode(`reg_${email.toLowerCase()}`, code, { email, password, businessName, businessType, phone: phoneCheck.e164, address: address.trim(), streetNumber: String(streetNumber).trim(), country: country||'FR', city: city||'', postalCode: postalCode||'', lat: lat||null, lng: lng||null });
    // Répondre immédiatement au client, puis envoyer l'email en arrière-plan
    res.json({ ok: true });
    setImmediate(() => sendVerificationEmail(email, code, 'Confirmez votre inscription FlowIA', 'register').catch(e => console.error('[EMAIL register]', e.message)));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/register/confirm', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code?.trim()) return res.status(400).json({ error: 'Email et code requis.' });
    const rec = await getCode(`reg_${email.toLowerCase()}`);
    if (!rec) return res.status(400).json({ error: 'Code invalide ou expiré.' });
    if (rec.code !== code.trim()) return res.status(400).json({ error: 'Code incorrect.' });
    const { email: em, password, businessName, businessType, phone, address, streetNumber, country, city, postalCode, lat, lng } = rec.data;
    const hash = await bcrypt.hash(password, 12);
    // Defense-in-depth : on revalide le businessType cote /confirm aussi.
    // Theoriquement deja valide cote /register, mais le payload de saveCode
    // pourrait etre altere par un acteur malveillant ayant l'access cache.
    if (!isValidBusinessType(businessType)) {
      await deleteCode(`reg_${email.toLowerCase()}`);
      return res.status(400).json({ error: 'Type de commerce invalide.', code: 'BUSINESS_TYPE_REQUIRED' });
    }
    const phoneCheck = validatePhoneE164(phone, { required: true, defaultCountry: country || 'FR' });
    if (!phoneCheck.valid) {
      await deleteCode(`reg_${email.toLowerCase()}`);
      const msg = phoneCheck.error === 'PHONE_REQUIRED' ? 'Numero de telephone obligatoire.' : 'Numero de telephone invalide.';
      return res.status(400).json({ error: msg, code: phoneCheck.error });
    }
    if (!isValidAddress(address)) {
      await deleteCode(`reg_${email.toLowerCase()}`);
      return res.status(400).json({ error: 'Adresse du commerce obligatoire.', code: 'ADDRESS_REQUIRED' });
    }
    if (!isValidStreetNumber(streetNumber)) {
      await deleteCode(`reg_${email.toLowerCase()}`);
      return res.status(400).json({ error: 'Numero de rue obligatoire.', code: 'STREET_NUMBER_REQUIRED' });
    }
    let rows;
    try {
      ({ rows } = await pool.query(
        `INSERT INTO users (email,password_hash,business_name,business_type,phone,address,street_number,country,city,postal_code,lat,lng) VALUES (LOWER($1),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,email,business_name,business_type,phone,address,street_number,country,city,postal_code`,
        [em, hash, businessName, businessType, phoneCheck.e164, address.trim(), String(streetNumber).trim(), country||'FR', city||null, postalCode||null, lat||null, lng||null]
      ));
    } catch (e) {
      if (e.code === '23505') {
        await deleteCode(`reg_${email.toLowerCase()}`);
        return res.status(409).json({ error: 'Email déjà existant, merci de changer de mail et réessayer !' });
      }
      throw e;
    }
    const user = rows[0];
    for (const cat of SEED_CATS) {
      await pool.query('INSERT INTO categories (user_id,name,type,icon,color) VALUES ($1,$2,$3,$4,$5)',
        [user.id, cat.name, cat.type, cat.icon, cat.color]);
    }

    // Seed horaires (Lun-Ven 9h-19h, Sam 9h-17h, Dim ferme) + services
    // suggeres selon business_type (is_active=FALSE pour ne pas exposer dans
    // le booking public avant validation par le wizard FirstRunSetup).
    await seedMerchantDefaults(pool, user.id, businessType);

    // Creer automatiquement booking_settings avec un slug unique au format
    // nom-ville-CP. Si city/postalCode manquent encore (cas rare a ce stade),
    // le helper retombe sur le nom seul ; le slug sera reconstruit lors de
    // l'onboarding (POST /onboarding) ou du premier PUT /profile.
    const baseSlug = buildMerchantSlug({ name: businessName, city, postalCode });
    const finalSlug = await findUniqueSlug(pool, baseSlug);
    await pool.query(
      `INSERT INTO booking_settings (user_id, is_enabled, slug, advance_booking_days, min_notice_hours)
       VALUES ($1, false, $2, 30, 1)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id, finalSlug]
    );
    await deleteCode(`reg_${email.toLowerCase()}`);
    const tokenExpiry = await getMerchantSessionDuration(user.id);
    const token = signMerchantJwt(
      { userId: user.id, email: user.email, businessName: user.business_name },
      tokenExpiry
    );
    res.json({ ok: true, token, user: {
      id:                user.id,
      email:             user.email,
      businessName:      user.business_name,
      phone:             user.phone,
      address:           user.address,
      country:           user.country,
      city:              user.city,
      postalCode:        user.postal_code,
      googleBusinessUrl: null,
      onboardingCompleted: true,
      setupCompleted:    false,
      tourCompleted:     false,
    }});
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
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
    // Message unifié + bcrypt.compare systématique pour empêcher
    // l'énumération des emails (avant: "Email introuvable" vs "Mot de passe
    // incorrect" + différence de temps bcrypt révélait l'existence du compte).
    const INVALID = 'Email ou mot de passe incorrect.';
    const { rows } = await pool.query('SELECT * FROM users WHERE email=LOWER($1)', [email]);
    const user = rows[0] || null;
    const valid = await bcrypt.compare(String(password), user?.password_hash || DUMMY_BCRYPT);
    if (!user || !valid) return res.status(401).json({ error: INVALID });
    if (user.is_frozen) return res.status(403).json({
      error: 'Votre compte est bloque. Merci de contacter notre equipe administrateurs FlowIA pour plus de details.',
      code: 'ACCOUNT_FROZEN',
    });
    if (user.deletion_requested_at) return res.status(403).json({
      error: 'Votre compte est en cours de suppression. Pour annuler dans les 30 jours, contactez contact@flowiapro.com.',
      code: 'ACCOUNT_DELETION_PENDING',
      deletionRequestedAt: user.deletion_requested_at,
    });
    // Maintenance kill-switch : si merchant_portal est ON et l'user n'est PAS
    // whitelisted, on refuse la connexion avec un 503 dedie. Le frontend
    // detecte le code 'maintenance' et affiche l'overlay au lieu de creer
    // une session. Whitelisted passe normalement.
    const block = await checkMaintenanceBlock(user.id, user.email);
    if (block) {
      res.setHeader('X-Maintenance', '1');
      res.setHeader('X-Maintenance-Scope', 'merchant_portal');
      return res.status(503).json({
        error:   'maintenance',
        scope:   'merchant_portal',
        message: block.message,
      });
    }
    const tokenExpiry = await getMerchantSessionDuration(user.id);
    const token = signMerchantJwt(
      { userId: user.id, email: user.email, businessName: user.business_name },
      tokenExpiry
    );
    res.json({ ok: true, token, user: {
      id:                user.id,
      email:             user.email,
      businessName:      user.business_name,
      phone:             user.phone,
      address:           user.address,
      country:           user.country,
      city:              user.city,
      postalCode:        user.postal_code,
      googleBusinessUrl: user.google_business_url,
      firstName:         user.first_name,
      lastName:          user.last_name,
      avatarUrl:         user.avatar_url,
      onboardingCompleted: user.onboarding_completed,
      setupCompleted:    user.setup_completed,
      tourCompleted:     user.tour_completed,
      hasGoogle:         !!user.google_id,
    }});
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ═══════════════════ MOT DE PASSE OUBLIÉ ═════════════════════════════════════

router.post('/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    const em = String(email || '').trim().toLowerCase();
    // Toujours renvoyer ok:true pour ne pas révéler l'existence du compte
    // (anti-énumération). Aligné avec /pin-forgot-request.
    if (!isValidEmail(em)) return res.json({ ok: true });
    const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [em]);
    if (!rows.length) return res.json({ ok: true });
    const code = genCode();
    await saveCode(`rst_${em}`, code, { userId: rows[0].id });
    res.json({ ok: true });
    setImmediate(() => sendVerificationEmail(em, code, 'Réinitialisez votre mot de passe FlowIA').catch(e => console.error('[EMAIL forgot]', e.message)));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/forgot/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code?.trim()) return res.status(400).json({ error: 'Email et code requis.' });
    const rec = await getCode(`rst_${email.toLowerCase()}`);
    if (!rec) return res.status(400).json({ error: 'Code invalide ou expiré.' });
    if (rec.code !== code.trim()) return res.status(400).json({ error: 'Code incorrect.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/forgot/reset', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code?.trim()) return res.status(400).json({ error: 'Email et code requis.' });
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

// Message d'unicité d'email — un compte = un email unique côté commerçant.
const EMAIL_TAKEN_MSG = 'Email déjà existant, merci de changer de mail et réessayer !';

router.post('/change-email', authMiddleware, async (req, res) => {
  try {
    const raw = (req.body?.newEmail || '').trim().toLowerCase();
    // Regex stricte : avant, .includes('@') laissait passer "a@b@c" ou "@x".
    if (!isValidEmail(raw)) return res.status(400).json({ error: 'Email invalide.' });
    // 1. Vérifier que le nouvel email n'est pas déjà utilisé par un autre compte
    const { rows: exists } = await pool.query(
      'SELECT id FROM users WHERE email=$1 AND id<>$2',
      [raw, req.user.userId]
    );
    if (exists.length) return res.status(409).json({ error: EMAIL_TAKEN_MSG });
    // 2. Récupérer l'adresse ACTUELLE du compte (pour sécurité — le code est envoyé à l'ancienne adresse)
    const { rows: u } = await pool.query('SELECT email FROM users WHERE id=$1', [req.user.userId]);
    if (!u.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const currentEmail = u[0].email;
    if (currentEmail.toLowerCase() === raw) {
      return res.status(400).json({ error: 'Le nouvel email doit être différent.' });
    }
    const code = genCode();
    await saveCode(`chg_email_${req.user.userId}`, code, { newEmail: raw });
    res.json({ ok: true, sentTo: currentEmail });
    // 3. Envoyer le code à l'ANCIEN email (authentifie le propriétaire du compte)
    setImmediate(() => sendVerificationEmail(
      currentEmail, code,
      'Autorisez le changement de votre email — FlowIA',
      'email'
    ).catch(e => console.error('[EMAIL change-email]', e.message)));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/change-email/confirm', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: 'Code requis.' });
    const rec = await getCode(`chg_email_${req.user.userId}`);
    if (!rec) return res.status(400).json({ error: 'Code invalide ou expiré.' });
    if (rec.code !== code.trim()) return res.status(400).json({ error: 'Code incorrect.' });
    const { newEmail } = rec.data;
    // Re-vérif anti-race : un autre commerçant a pu s'inscrire avec ce mail
    // entre la demande et la confirmation. La contrainte UNIQUE de users.email
    // est la garantie ultime, mais on renvoie un message friendly avant.
    const { rows: dup } = await pool.query(
      'SELECT id FROM users WHERE email=$1 AND id<>$2',
      [newEmail, req.user.userId]
    );
    if (dup.length) {
      await deleteCode(`chg_email_${req.user.userId}`);
      return res.status(409).json({ error: EMAIL_TAKEN_MSG });
    }
    try {
      await pool.query('UPDATE users SET email=$1 WHERE id=$2', [newEmail, req.user.userId]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: EMAIL_TAKEN_MSG });
      throw e;
    }
    await deleteCode(`chg_email_${req.user.userId}`);
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.userId]);
    const user = rows[0];
    const tokenExpiry = await getMerchantSessionDuration(user.id);
    const token = signMerchantJwt(
      { userId: user.id, email: user.email, businessName: user.business_name },
      tokenExpiry
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
    const em = String(email).trim().toLowerCase();
    if (!isValidEmail(em)) return res.json({ ok: true, emailMasked: maskEmail(em) });
    const { rows } = await pool.query('SELECT id,email FROM users WHERE email=$1', [em]);
    if (!rows.length) return res.json({ ok: true, emailMasked: maskEmail(em) }); // sécurité
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
    if (!email || !code?.trim()) return res.status(400).json({ error: 'Email et code requis.' });
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
    const em = String(email || '').trim().toLowerCase();
    // Endpoint non authentifié — on ne notifie QUE si l'email existe en BDD,
    // sinon un attaquant pourrait spammer des emails arbitraires via ce relai.
    if (isValidEmail(em)) {
      const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [em]);
      if (rows.length) {
        const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
        await sendVerificationEmail(em, '3 tentatives échouées à ' + now,
          '⚠️ Alerte sécurité — Tentatives PIN FlowIA', 'lockout_alert');
      }
    }
    res.json({ ok: true }); // réponse uniforme anti-énumération
  } catch (err) { console.error(err); res.json({ ok: true }); }
});

// ═══════════════════ EXPORT RGPD (Article 20 portabilite) ═══════════════════
// GET /api/auth/export-data — retourne un JSON exhaustif avec toutes les
// donnees du commerçant (profile, equipe, catalogue, clients, RDV,
// transactions, marketing, finance, audit). Hashes / tokens techniques
// exclus. Format machine-readable, structure, decodable hors FlowIA.
//
// Pour l'utilisateur : "Telecharger mes donnees" dans Reglages > Mon compte
// (TabCompte.jsx). Conseille avant suppression de compte.
router.get('/export-data', authMiddleware, async (req, res) => {
  try {
    const data = await exportAllUserData(pool, req.user.userId);
    const today = new Date().toISOString().slice(0, 10);
    const filename = `flowia-export-${today}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[EXPORT DATA]', e.message);
    res.status(500).json({ error: 'Impossible de generer l export. Reessayez ou contactez le support.' });
  }
});

// ═══════════════════ SUPPRESSION COMPTE COMMERÇANT ══════════════════════════
// DELETE /api/auth/account — RGPD : suppression soft du compte commerçant.
//
// Pourquoi soft-delete :
//   - Annulation possible sous 30 jours via email contact@ (en cas de clic
//     accidentel — sinon perte definitive d'historique)
//   - Le commercant reste bloque immediatement (deletion_requested_at lu
//     par authMiddleware)
//
// Donnees Google (Limited Use) : on les supprime IMMEDIATEMENT — jetons
// OAuth revoques et integration calendar effacee, identite Google
// (google_id, avatar_url) clear. Aucune donnee Google ne reste en DB.
//
// Le reste (employees, services, RDV anonymises, etc.) est conserve 30
// jours puis purge par le cron quotidien (index.js → schedulePurgeAccounts).
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 1. Donnees Google : revocation + suppression IMMEDIATE (Limited Use)
    try {
      const { rows: integ } = await pool.query(
        `SELECT access_token_enc FROM merchant_calendar_integrations
          WHERE user_id=$1 AND provider='google' LIMIT 1`,
        [userId]
      );
      if (integ.length) {
        try {
          const { decrypt } = require('../utils/tokenCrypto');
          const at = decrypt(integ[0].access_token_enc);
          await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: at }),
          }).catch(() => {});
        } catch { /* token deja invalide cote Google : on supprime quand meme */ }
      }
      await pool.query(
        `DELETE FROM merchant_calendar_integrations WHERE user_id=$1`,
        [userId]
      );
    } catch (e) { console.warn('[DELETE ACCOUNT google cleanup]', e.message); }

    // 2. Anonymiser les RDV (garder l'historique pour les clients finaux,
    //    qui peuvent vouloir consulter leurs anciens RDV).
    await pool.query(
      `UPDATE appointments SET
         client_name='[Commerçant supprimé]',
         client_email=NULL, client_phone=NULL
       WHERE user_id=$1`, [userId]
    );

    // 3. Anonymiser les transactions (garder montants pour comptabilité).
    await pool.query(
      `UPDATE transactions SET
         description=COALESCE(description,'Transaction'),
         client_email=NULL, client_note=NULL
       WHERE user_id=$1`, [userId]
    );

    // 4. Marquer le compte comme en attente de purge + clear identite Google.
    //    Le compte reste ferme (authMiddleware le rejette via
    //    deletion_requested_at), les donnees liees seront purgees par le
    //    cron quotidien apres 30 jours.
    await pool.query(
      `UPDATE users SET
         deletion_requested_at = NOW(),
         google_id   = NULL,
         avatar_url  = NULL
       WHERE id=$1`,
      [userId]
    );

    console.log(`[RGPD] Soft-delete compte commercant ${userId} (purge dans 30j)`);
    res.json({
      ok: true,
      message: 'Votre compte est supprime. Il sera definitivement purge dans 30 jours. Pour annuler la suppression dans ce delai, contactez-nous a contact@flowiapro.com.',
    });
  } catch(e) {
    console.error('[DELETE MERCHANT ACCOUNT]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/auth/me — retourne les infos complètes du commerçant depuis la BDD
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, business_name, phone, address, city, postal_code,
              google_business_url, created_at, first_name, last_name,
              onboarding_completed, setup_completed, tour_completed, google_id, avatar_url,
              subscription_status, subscription_plan, subscription_period,
              subscription_current_period_end, subscription_trial_ends_at,
              subscription_cancel_at_period_end, subscription_admin_grant
       FROM users WHERE id=$1`,
      [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const u = rows[0];

    // Plan effectif : ordre de priorite octroi superadmin > Stripe > Decouverte.
    // (alignement avec middleware/subscription.js getEffectivePlan() et
    // /api/subscriptions/me — sans cette logique, le frontend pensait que
    // les comptes en plan offert etaient sur Decouverte et affichait des
    // bannieres 'Plan Essentiel requis' a tort.)
    const grant = u.subscription_admin_grant;
    const grantActive = grant && (!grant.expires_at || new Date(grant.expires_at) > new Date());
    const stripeActive = ['active', 'trialing'].includes(u.subscription_status);

    const effectivePlan = grantActive && grant.plan
      ? grant.plan
      : (stripeActive && u.subscription_plan ? u.subscription_plan : 'decouverte');
    const isActive = grantActive || stripeActive;

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
      setupCompleted:     u.setup_completed,
      tourCompleted:      u.tour_completed,
      hasGoogle:          !!u.google_id,
      avatarUrl:          u.avatar_url,
      subscription: grantActive ? {
        // Source d'autorite : octroi admin. On expose l'etat synthetique
        // pour que le frontend traite ces comptes comme actifs payes.
        status:             'active',
        plan:               grant.plan,
        period:             grant.period || 'monthly',
        currentPeriodEnd:   grant.expires_at || null,
        trialEndsAt:        null,
        cancelAtPeriodEnd:  false,
        isActive:           true,
        isPastDue:          false,
        isAdminGranted:     true,
        adminGrant: {
          plan:       grant.plan,
          period:     grant.period || 'monthly',
          grantedAt:  grant.granted_at,
          expiresAt:  grant.expires_at || null,
          reason:     grant.reason || '',
        },
        effectivePlan,
      } : {
        status:             u.subscription_status,
        plan:               u.subscription_plan,
        period:             u.subscription_period,
        currentPeriodEnd:   u.subscription_current_period_end,
        trialEndsAt:        u.subscription_trial_ends_at,
        cancelAtPeriodEnd:  !!u.subscription_cancel_at_period_end,
        isActive,
        isPastDue:          u.subscription_status === 'past_due',
        isAdminGranted:     false,
        adminGrant:         null,
        effectivePlan,
      },
    }});
  } catch(e) { console.error('[AUTH ME]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
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
  } catch (e) { console.error('[CHANGE PWD]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── PUT /api/auth/profile — mise à jour infos commerçant ────────────────────
// Si city ou postal_code (ou businessName, qui forme la partie nom du slug)
// changent, on recalcule le slug au format nom-ville-CP, on archive l'ancien
// slug dans booking_slug_aliases et on retourne les deux slugs dans la
// reponse pour que le frontend puisse afficher l'alerte de redirection.
// Respecte slug_locked : si admin a verrouille, le slug n'est jamais touche.
// Note : on ne regenere PAS la partie nom si l'utilisateur a edite manuellement
//        son slug (ex : "chez-paul-lille-59000" alors que businessName="Hair Coiff")
//        — pour detecter ce cas, on conserve la partie nom actuelle si elle
//        ne correspond pas au businessName slugifie.
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { businessName, phone, address, city, postalCode, googleBusinessUrl } = req.body;

    // Snapshot AVANT update pour detecter les changements pertinents.
    const { rows: beforeRows } = await pool.query(
      'SELECT business_name, phone, address, city, postal_code, country FROM users WHERE id=$1',
      [req.user.userId]
    );
    if (!beforeRows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const before = beforeRows[0];

    // ─── Telephone : INTERDIT de supprimer apres inscription ──────────────
    // Si le compte a deja un numero (cas attendu depuis register/onboarding
    // obligatoires), on n'accepte qu'un remplacement par un autre numero
    // valide. `phone` absent du body = pas de changement (COALESCE).
    // `phone` present mais vide/null = tentative de suppression = 400.
    let phoneNext = null; // null = COALESCE → garde l'existant
    if (phone !== undefined) {
      const raw = typeof phone === 'string' ? phone.trim() : '';
      if (!raw) {
        if (before.phone) {
          return res.status(400).json({
            error: 'Le numero de telephone est obligatoire et ne peut pas etre supprime. Vous pouvez le modifier mais pas le retirer.',
            code: 'PHONE_REQUIRED',
          });
        }
        // Pas de phone existant ET vide → on laisse passer null (COALESCE).
      } else {
        const phoneCheck = validatePhoneE164(raw, { required: true, defaultCountry: before.country || 'FR' });
        if (!phoneCheck.valid) {
          return res.status(400).json({ error: 'Numero de telephone invalide.', code: phoneCheck.error });
        }
        phoneNext = phoneCheck.e164;
      }
    }

    // ─── Adresse : INTERDIT de supprimer apres inscription ────────────────
    let addressNext = null;
    if (address !== undefined) {
      const raw = typeof address === 'string' ? address.trim() : '';
      if (!raw) {
        if (before.address) {
          return res.status(400).json({
            error: 'L\'adresse du commerce est obligatoire et ne peut pas etre supprimee. Vous pouvez la modifier mais pas la retirer.',
            code: 'ADDRESS_REQUIRED',
          });
        }
      } else {
        if (!isValidAddress(raw)) {
          return res.status(400).json({ error: 'Adresse trop courte.', code: 'ADDRESS_INVALID' });
        }
        addressNext = raw;
      }
    }

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
      [businessName||null, phoneNext, addressNext,
       city||null, postalCode||null, googleBusinessUrl||null,
       req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const after = rows[0];

    // ─ Slug : recalcul si business_name OU city OU postal_code ont change,
    //   ET que slug_locked=FALSE.
    let slugChange = null; // { oldSlug, newSlug } pour reponse frontend
    const businessNameChanged = before.business_name !== after.business_name;
    const cityChanged         = (before.city || '')        !== (after.city || '');
    const postalChanged       = (before.postal_code || '') !== (after.postal_code || '');

    if (businessNameChanged || cityChanged || postalChanged) {
      try {
        const { rows: bsCur } = await pool.query(
          'SELECT slug, slug_locked FROM booking_settings WHERE user_id=$1',
          [req.user.userId]
        );
        const oldSlug = bsCur[0]?.slug || null;
        const isSlugLocked = bsCur[0]?.slug_locked === true;

        if (!isSlugLocked && oldSlug) {
          // Determiner la partie nom a conserver :
          //  - si l'ancien slug se terminait bien par -<oldVille>-<oldCP>,
          //    on extrait la partie nom actuelle (ce qui preserve une edition
          //    manuelle precedente)
          //  - sinon (slug ancien format mono-segment), on repart du business_name
          const { extractNamePart } = require('../utils/buildSlug');
          const currentNamePart = extractNamePart(oldSlug, before.city, before.postal_code);
          const baseSlug = buildMerchantSlug({
            // Si businessName a change, on prend le nouveau ; sinon on garde
            // la partie nom (potentiellement editee manuellement par le user).
            customNamePart: businessNameChanged ? null : currentNamePart,
            name: after.business_name,
            city: after.city,
            postalCode: after.postal_code,
          });
          const newSlug = await findUniqueSlug(pool, baseSlug, req.user.userId);

          if (newSlug !== oldSlug) {
            await archiveOldSlug(pool, oldSlug, req.user.userId);
            await pool.query('UPDATE booking_settings SET slug=$1 WHERE user_id=$2',
              [newSlug, req.user.userId]);
            slugChange = { oldSlug, newSlug };
          }
        }
      } catch (slugErr) {
        // Ne pas faire echouer la mise a jour de profil si le recalcul de
        // slug echoue (best-effort). Le commercant peut retenter via le
        // bouton dedie dans Reglages.
        console.warn('[PROFILE slug recalc]', slugErr.message);
      }
    }

    // Invalider le cache du site de reservation public pour que la modification
    // soit immediatement visible cote clients (source unique : table users).
    try {
      const { rows: bs } = await pool.query(
        'SELECT slug FROM booking_settings WHERE user_id=$1',
        [req.user.userId]
      );
      for (const r of bs) {
        if (r.slug) global.memCache?.del(`biz:${r.slug}`);
      }
      if (slugChange?.oldSlug) global.memCache?.del(`biz:${slugChange.oldSlug}`);
    } catch { /* cache best-effort */ }

    res.json({ ok: true, user: after, slugChange });
  } catch (e) { console.error('[PROFILE PUT]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  GOOGLE OAUTH — Commerçant (inscription / connexion)
//  URL enregistrée chez Google : /api/auth/google/merchant/callback
//  state = "merchant" pour distinguer du flow client
// ═══════════════════════════════════════════════════════════════════════════
router.get('/google/merchant/callback', async (req, res) => {
  const { code, state: stateRaw, error } = req.query;
  const BACKEND_URL  = process.env.BACKEND_URL  || 'https://flowia-backend.onrender.com';
  const redirectUri  = `${BACKEND_URL}/api/auth/google/merchant/callback`;

  // state = "merchant" OU "merchant|<origin-opener-encoded>"
  // L'origin opener doit être validé contre l'allowlist expansée (incluant
  // www.* et commercant.*), sinon le TARGET fallback envoie la popup sur le
  // mauvais sous-domaine et casse le BroadcastChannel (same-origin only).
  const stateParts = String(stateRaw || '').split('|');
  const requestedOriginRaw = stateParts[1] ? decodeURIComponent(stateParts[1]) : '';
  const TARGET_ORIGIN = resolveOAuthTarget(requestedOriginRaw);

  if (error || !code) {
    return res.redirect(`${TARGET_ORIGIN}?auth_error=google_denied`);
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
    if (!tokenData.access_token) {
      // Log Google's raw error for Render-side diagnosis (redirect_uri_mismatch,
      // invalid_grant, invalid_client, etc.) — without logging client_secret.
      console.error('[GOOGLE OAUTH] echange code echoue, status=' + tokenRes.status,
        '- redirect_uri_envoye=' + redirectUri,
        '- google_response=', JSON.stringify(tokenData));
      throw new Error(tokenData.error_description || tokenData.error || 'Token Google invalide');
    }

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
        // Refus si le compte est en grace post-suppression. Sinon on
        // re-lierait l'identite Google a un compte qu'on s'est engage a
        // purger sous 30j (engagement Limited Use). Le merchant doit
        // contacter le support pour annuler la suppression d'abord.
        if (byEmail[0].deletion_requested_at) {
          return res.redirect(`${TARGET_ORIGIN}/__oauth#error=ACCOUNT_DELETION_PENDING`);
        }
        // Lier le compte Google à un compte email existant
        user = byEmail[0];
        await pool.query('UPDATE users SET google_id=$1, avatar_url=$2 WHERE id=$3',
          [googleId, picture || null, user.id]);
      } else {
        // 4. Créer un nouveau commerçant (onboarding NON complété)
        // business_name reste VIDE volontairement : on n'invente JAMAIS un nom
        // predefini type "Commerce de X". Le commercant DOIT saisir lui-meme
        // le vrai nom de son etablissement a l'etape onboarding obligatoire
        // (MerchantOnboarding -> POST /onboarding, qui valide name non vide).
        // Tant que l'onboarding n'est pas fini, l'app est gatee cote front et
        // le booking public est desactive (is_enabled=false). Cote admin, un
        // nom vide s'affiche en "—" (onboarding "En cours"), ce qui est plus
        // honnete et professionnel qu'un faux nom.
        const { rows: created } = await pool.query(
          `INSERT INTO users (email, password_hash, business_name, google_id, first_name, last_name, avatar_url, onboarding_completed)
           VALUES (LOWER($1), '', '', $2, $3, $4, $5, FALSE) RETURNING *`,
          [emailLow, googleId, given_name || '', family_name || '', picture || null]
        );
        user = created[0];

        // Seed catégories par défaut
        for (const cat of SEED_CATS) {
          await pool.query('INSERT INTO categories (user_id,name,type,icon,color) VALUES ($1,$2,$3,$4,$5)',
            [user.id, cat.name, cat.type, cat.icon, cat.color]);
        }

        // Seed horaires d'ouverture par defaut (Lun-Ven 9h-19h, Sam 9h-17h,
        // Dim ferme). business_type n'est pas encore connu a ce stade :
        // les services suggeres seront seedes plus tard dans POST /onboarding
        // quand le commercant aura choisi son type de commerce.
        try { await seedBusinessHours(pool, user.id); }
        catch (e) { console.error('[SEED business_hours google_oauth]', e.message); }

        // Creer booking_settings avec slug unique. A ce stade le compte n'a
        // ni ville ni CP : le helper retombe sur le nom seul, le slug sera
        // recalcule au format nom-ville-CP lors de l'onboarding obligatoire.
        const baseSlug = buildMerchantSlug({ name: given_name || 'commerce' });
        const finalSlug = await findUniqueSlug(pool, baseSlug);
        await pool.query(
          `INSERT INTO booking_settings (user_id, is_enabled, slug, advance_booking_days, min_notice_hours)
           VALUES ($1, false, $2, 30, 1) ON CONFLICT (user_id) DO NOTHING`,
          [user.id, finalSlug]
        );
      }
    }

    // Admin commit 7 — refus immediat sans emission de token si compte gele.
    // Le flow OAuth Google lui-meme (echange code, fetch profile, lien
    // google_id) est volontairement preserve : ce check est un veto metier
    // applique a la fin du flow, juste avant la signature du JWT.
    // Redirection vers /__oauth (PAS la page racine) pour que la popup se
    // ferme proprement via OAuthCallback.jsx qui detecte error=... dans le
    // hash, signale l'opener via BroadcastChannel puis close() la popup.
    if (user.is_frozen) {
      return res.redirect(`${TARGET_ORIGIN}/__oauth#error=ACCOUNT_FROZEN`);
    }
    // Si compte en grace post-suppression, on refuse aussi le login Google.
    if (user.deletion_requested_at) {
      return res.redirect(`${TARGET_ORIGIN}/__oauth#error=ACCOUNT_DELETION_PENDING`);
    }
    // Maintenance kill-switch : si merchant_portal ON + user PAS whitelisted,
    // on redirige vers /__oauth avec error=MAINTENANCE. OAuthCallback.jsx
    // detecte ce code et dispatch ff-maintenance-on pour afficher l'overlay
    // (au lieu d'afficher du JSON brut au visiteur).
    const maintBlock = await checkMaintenanceBlock(user.id, user.email);
    if (maintBlock) {
      const hash = new URLSearchParams();
      hash.set('type', 'merchant');
      hash.set('error', 'MAINTENANCE');
      hash.set('maintenance_scope', 'merchant_portal');
      hash.set('maintenance_message', maintBlock.message);
      return res.redirect(`${TARGET_ORIGIN}/__oauth#${hash.toString()}`);
    }

    // 5. Générer le JWT commerçant — durée configurable via user_settings.
    const tokenExpiry = await getMerchantSessionDuration(user.id);
    const token = signMerchantJwt(
      { userId: user.id, email: user.email, businessName: user.business_name },
      tokenExpiry
    );

    const userObj = {
      id: user.id, email: user.email, businessName: user.business_name,
      firstName: user.first_name, lastName: user.last_name,
      onboardingCompleted: user.onboarding_completed,
      setupCompleted: user.setup_completed,
      tourCompleted: user.tour_completed,
      avatarUrl: user.avatar_url,
    };

    // 6. Redirection popup → /__oauth côté frontend. On ne tente plus de
    //    postMessage depuis la page servie par le backend : Google impose
    //    COOP:same-origin sur sa page d'auth, ce qui détache window.opener
    //    (= null) dans la popup. La route frontend /__oauth écrit le token
    //    en localStorage, signale l'opener via BroadcastChannel (qui
    //    fonctionne indépendamment de window.opener), puis ferme la popup.
    const hashParams = new URLSearchParams();
    hashParams.set('type', 'merchant');
    hashParams.set('token', token);
    hashParams.set('user', JSON.stringify(userObj));
    res.redirect(`${TARGET_ORIGIN}/__oauth#${hashParams.toString()}`);

    console.log(`[GOOGLE OAUTH MERCHANT] ${emailLow} connecté`);

  } catch(e) {
    console.error('[GOOGLE OAUTH MERCHANT]', e.message);
    const hashParams = new URLSearchParams();
    hashParams.set('type', 'merchant');
    hashParams.set('error', e.message);
    res.redirect(`${TARGET_ORIGIN}/__oauth#${hashParams.toString()}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/auth/onboarding — Complétion obligatoire du profil commerçant
// ═══════════════════════════════════════════════════════════════════════════
router.post('/onboarding', authMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, businessName, businessType, phone, address, streetNumber, city, postalCode, country, lat, lng } = req.body;
    if (!firstName?.trim() || !lastName?.trim() || !businessName?.trim() || !city?.trim() || !postalCode?.trim()) {
      return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
    }
    if (!isValidBusinessType(businessType)) {
      return res.status(400).json({ error: 'Type de commerce invalide ou manquant.', code: 'BUSINESS_TYPE_REQUIRED' });
    }
    const phoneCheck = validatePhoneE164(phone, { required: true, defaultCountry: country || 'FR' });
    if (!phoneCheck.valid) {
      const msg = phoneCheck.error === 'PHONE_REQUIRED' ? 'Numero de telephone obligatoire.' : 'Numero de telephone invalide.';
      return res.status(400).json({ error: msg, code: phoneCheck.error });
    }
    if (!isValidAddress(address)) {
      return res.status(400).json({ error: 'Adresse du commerce obligatoire.', code: 'ADDRESS_REQUIRED' });
    }
    if (!isValidStreetNumber(streetNumber)) {
      return res.status(400).json({ error: 'Numero de rue obligatoire.', code: 'STREET_NUMBER_REQUIRED' });
    }

    const { rows } = await pool.query(
      `UPDATE users SET
         first_name = $1, last_name = $2, business_name = $3,
         phone = $4, address = $5, city = $6, postal_code = $7,
         country = COALESCE($8, 'FR'), lat = $9, lng = $10,
         business_type = $11, street_number = $13,
         onboarding_completed = TRUE
       WHERE id = $12
       RETURNING id, email, business_name, business_type, first_name, last_name, phone, address, street_number, city, postal_code, onboarding_completed`,
      [firstName.trim(), lastName.trim(), businessName.trim(), phoneCheck.e164, address.trim(), city.trim(), postalCode.trim(), country || 'FR', lat || null, lng || null, businessType, req.user.userId, String(streetNumber).trim()]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const u = rows[0];

    // Seed services suggeres selon business_type. Idempotent : no-op si le
    // commercant a deja des services (compte recree via flow email/password
    // ou seed deja joue). business_hours peuvent avoir ete seedees dans le
    // callback Google : seedMerchantDefaults rejoue mais ON CONFLICT DO NOTHING.
    await seedMerchantDefaults(pool, u.id, u.business_type);

    // Recalculer le slug au format nom-ville-CP. C'est l'onboarding qui
    // garantit pour la premiere fois la presence de city + postal_code,
    // donc le slug initial complet est forme ici. Si admin a verrouille
    // le slug (slug_locked=TRUE), on ne touche a rien. L'ancien slug est
    // archive dans booking_slug_aliases pour preserver les liens deja
    // partages.
    const { rows: bsCur } = await pool.query(
      'SELECT slug, slug_locked FROM booking_settings WHERE user_id=$1',
      [req.user.userId]
    );
    const oldSlug = bsCur[0]?.slug || null;
    const isSlugLocked = bsCur[0]?.slug_locked === true;
    let finalSlug = oldSlug;
    if (!isSlugLocked) {
      const baseSlug = buildMerchantSlug({
        name: businessName.trim(),
        city: city.trim(),
        postalCode: postalCode.trim(),
      });
      finalSlug = await findUniqueSlug(pool, baseSlug, req.user.userId);
      if (oldSlug && oldSlug !== finalSlug) {
        await archiveOldSlug(pool, oldSlug, req.user.userId);
      }
      await pool.query('UPDATE booking_settings SET slug=$1 WHERE user_id=$2', [finalSlug, req.user.userId]);
      try { global.memCache?.del(`biz:${oldSlug}`); } catch {}
      try { global.memCache?.del(`biz:${finalSlug}`); } catch {}
    }

    // Nouveau token avec le bon businessName — durée configurable.
    const tokenExpiry = await getMerchantSessionDuration(u.id);
    const token = signMerchantJwt(
      { userId: u.id, email: u.email, businessName: u.business_name },
      tokenExpiry
    );

    res.json({
      ok: true, token,
      user: {
        id: u.id, email: u.email, businessName: u.business_name,
        firstName: u.first_name, lastName: u.last_name,
        onboardingCompleted: true,
        setupCompleted: false,
        tourCompleted: false,
      }
    });
  } catch (e) {
    console.error('[ONBOARDING]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/auth/setup-complete — marque le wizard FirstRunSetup termine
//  PATCH partiel /skip pour passer le wizard sans tout configurer (le flag
//  passe quand meme a TRUE puisque le commercant a vu le wizard).
// ═══════════════════════════════════════════════════════════════════════════
router.post('/setup-complete', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET setup_completed = TRUE WHERE id = $1
       RETURNING id, setup_completed`,
      [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    res.json({ ok: true, setupCompleted: rows[0].setup_completed });
  } catch (e) {
    console.error('[SETUP COMPLETE]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/auth/setup-restart — re-declenche le wizard depuis Reglages.
// Repasse setup_completed=FALSE sans toucher aux donnees deja configurees.
router.post('/setup-restart', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET setup_completed = FALSE WHERE id = $1
       RETURNING id, setup_completed`,
      [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    res.json({ ok: true, setupCompleted: rows[0].setup_completed });
  } catch (e) {
    console.error('[SETUP RESTART]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/auth/tour-complete — marque le product tour vu (skip ou fini)
//  POST /api/auth/tour-restart  — re-declenche le tour depuis Reglages
// ═══════════════════════════════════════════════════════════════════════════
router.post('/tour-complete', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET tour_completed = TRUE WHERE id = $1
       RETURNING id, tour_completed`,
      [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    res.json({ ok: true, tourCompleted: rows[0].tour_completed });
  } catch (e) {
    console.error('[TOUR COMPLETE]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/tour-restart', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET tour_completed = FALSE WHERE id = $1
       RETURNING id, tour_completed`,
      [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    res.json({ ok: true, tourCompleted: rows[0].tour_completed });
  } catch (e) {
    console.error('[TOUR RESTART]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  GOOGLE OAUTH — Callback générique (1 seule URL pour tous les commerçants)
//  URL enregistrée chez Google : /api/auth/google/callback
//  Le slug du commerçant est récupéré via le paramètre `state`
// ═══════════════════════════════════════════════════════════════════════════
router.get('/google/callback', async (req, res) => {
  const { code, state: stateRaw, error } = req.query;
  const BACKEND_URL  = process.env.BACKEND_URL  || 'https://flowia-backend.onrender.com';
  const redirectUri  = `${BACKEND_URL}/api/auth/google/callback`;

  // state = "slug" OU "slug|REFCODE" OU "slug|REFCODE|<origin>" OU "slug|REFCODE|<origin>|m1|m0"
  // L'origin (3e champ optionnel) est validé contre l'allowlist expansée
  // (cf. callback merchant) — indispensable pour le BroadcastChannel.
  // RGPD commit 17 : 4e champ optionnel (m1 = opt-in marketing, m0 = refus,
  // absent = m0 par défaut safe pour anciens tokens en cache).
  const stateParts = String(stateRaw || '').split('|');
  const slug = stateParts[0];
  const incomingRef = (stateParts[1] || '').trim().toUpperCase();
  const requestedOriginRaw = stateParts[2] ? decodeURIComponent(stateParts[2]) : '';
  const marketingOptIn = (stateParts[3] || '').trim() === 'm1';
  const TARGET_ORIGIN = resolveOAuthTarget(requestedOriginRaw);

  if (error || !code || !slug) {
    return res.redirect(`${TARGET_ORIGIN}?auth_error=google_denied`);
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
    if (!tokenData.access_token) {
      // Log Google's raw error for Render-side diagnosis (redirect_uri_mismatch,
      // invalid_grant, invalid_client, etc.) — without logging client_secret.
      console.error('[GOOGLE OAUTH] echange code echoue, status=' + tokenRes.status,
        '- redirect_uri_envoye=' + redirectUri,
        '- google_response=', JSON.stringify(tokenData));
      throw new Error(tokenData.error_description || tokenData.error || 'Token Google invalide');
    }

    // 2. Récupérer les infos du profil Google
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    const { id: googleId, email, given_name, family_name, picture } = profile;
    if (!email) throw new Error('Email non fourni par Google');

    // RGPD commit 19 : refuser un email Google non vérifié — l'identité ne
    // serait pas garantie côté Google, on ne crée pas de compte sur ce signal.
    if (profile.verified_email === false) {
      return res.redirect(`${TARGET_ORIGIN}?auth_error=oauth_email_not_verified`);
    }

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
        // RGPD commit 19 : NOUVEAU client (ni google_id ni email match) →
        // création différée. On ne touche PAS la BDD ; on encode le profil
        // Google + le contexte (slug, ref, origin) dans un JWT temporaire
        // (10 min, scope=oauth_pending) et on redirige vers la page de
        // confirmation où le user choisira explicitement ses cases CGU +
        // marketing. Le m1/m0 du state OAuth est ignoré ici (commit 17) : on
        // redemande le consentement de manière explicite côté UI.
        const preToken = jwt.sign({
          scope:      'oauth_pending',
          google_id:  googleId,
          email:      emailLow,
          first_name: given_name  || '',
          last_name:  family_name || '',
          picture:    picture || null,
          slug,
          ref_code:   incomingRef || null,
          origin:     requestedOriginRaw || null,
        }, process.env.JWT_SECRET, { expiresIn: '10m' });

        const hashParams = new URLSearchParams();
        hashParams.set('type',      'oauth_pending');
        hashParams.set('pre_token', preToken);
        hashParams.set('slug',      slug);
        res.redirect(`${TARGET_ORIGIN}/__oauth#${hashParams.toString()}`);
        console.log(`[GOOGLE OAUTH] ${emailLow} pre-register pending sur slug=${slug}`);
        return;
      }
    }

    // Admin commit 7 — refus immediat si compte global bloque (cross-merchant).
    // Symetrique au check du login formulaire (client-auth.js l339) et du
    // OAuth merchant callback. Aucun token n'est emis, popup se ferme via
    // OAuthCallback.jsx qui detecte error=... dans le hash.
    if (gc.is_blocked) {
      return res.redirect(`${TARGET_ORIGIN}/__oauth#error=ACCOUNT_BLOCKED`);
    }

    // 5. Créer/mettre à jour la fiche locale chez ce commerçant.
    // RGPD commit 19 : on récupère l'opt-in marketing du compte global
    // (déjà existant ici car CAS 1 — login). Le m1/m0 du state OAuth n'est
    // plus utilisé ; le consentement marketing est posé une fois pour toutes
    // à la création du compte et géré ensuite via le profil client/admin.
    const localOptIn = gc.marketing_opt_in === true;
    const { rows: localRows } = await pool.query(
      `INSERT INTO client_accounts
         (user_id, email, first_name, last_name, global_client_id, source,
          marketing_opt_in, marketing_opt_in_at)
       VALUES ($1,$2,$3,$4,$5,'google',$6,
               CASE WHEN $6 THEN NOW() ELSE NULL END)
       ON CONFLICT (user_id, email) DO UPDATE SET
         global_client_id = EXCLUDED.global_client_id,
         first_name = COALESCE(NULLIF(client_accounts.first_name,''), EXCLUDED.first_name),
         last_name  = COALESCE(NULLIF(client_accounts.last_name,''),  EXCLUDED.last_name)
       RETURNING *`,
      [userId, emailLow, gc.first_name, gc.last_name || '', gc.id, localOptIn]
    );
    const local = localRows[0];

    // 5bis. Fan-out : lier toutes les autres fiches locales du même email
    // au compte global. Aligne la cohérence avec /client/register classique
    // (sans ça, un user Google pourrait avoir des fiches pré-existantes
    // chez d'autres commerçants non liées, sans propagation profil).
    await pool.query(
      `UPDATE client_accounts SET global_client_id=$1, source='platform'
        WHERE LOWER(email)=LOWER($2) AND global_client_id IS NULL`,
      [gc.id, emailLow]
    ).catch(e => console.warn('[google fan-out]', e.message));

    // 5ter. Si l'inscription Google vient d'un lien ?ref=CODE, déclencher
    // l'email welcome parrainage (après check d'éligibilité). Aligné avec
    // /client/register classique. Non-bloquant : setImmediate + try/catch.
    if (incomingRef) {
      setImmediate(async () => {
        try {
          const { resolveReferralForFilleul } = require('./referrals');
          const resolved = await resolveReferralForFilleul(userId, incomingRef, emailLow, 0);
          if (!resolved.ok) return;
          const { rows: biz } = await pool.query(
            'SELECT business_name FROM users WHERE id=$1', [userId]
          );
          const { sendReferralWelcome } = require('../utils/email');
          await sendReferralWelcome({
            to:           emailLow,
            filleulName:  gc.first_name,
            businessName: biz[0]?.business_name || 'votre commerçant',
            code:         incomingRef,
            type:         resolved.filleul_type,
            value:        resolved.filleul_value,
          });
        } catch (e) { console.warn('[google referral welcome]', e.message); }
      });
    }

    // 6. Générer le JWT
    const token = jwt.sign(
      { clientId: local.id, merchantId: userId, globalClientId: gc.id, scope: 'client' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    // Cookie HttpOnly attaché au domaine backend ; le parent (frontend) le
    // recevra à la prochaine requête fetch credentials:'include'. Le hash
    // (#token=…) reste en place pour la rétro-compat tant que le frontend
    // lit encore localStorage.ff_client_token.
    setClientCookie(res, token);

    const clientObj = {
      id: local.id, email: gc.email,
      first_name: gc.first_name, last_name: gc.last_name,
      phone: local.phone || null,
      birth_date: local.birth_date || gc.birth_date || null,
      postal_code: local.postal_code || gc.postal_code || null,
      city:        local.city        || gc.city        || null,
      avatar_url: gc.avatar_url || null,
      global_client_id: gc.id, has_global_account: true,
    };

    // 7. Redirection popup → /__oauth côté frontend (cf. callback merchant).
    //    Google impose COOP:same-origin → window.opener = null dans la popup,
    //    postMessage inutilisable. BroadcastChannel via /__oauth réveille
    //    l'onglet parent indépendamment de window.opener.
    const hashParams = new URLSearchParams();
    hashParams.set('type', 'client');
    hashParams.set('token', token);
    hashParams.set('client', JSON.stringify(clientObj));
    hashParams.set('slug', slug);
    res.redirect(`${TARGET_ORIGIN}/__oauth#${hashParams.toString()}`);

    console.log(`[GOOGLE OAUTH] ${emailLow} connecté sur slug=${slug}`);

  } catch(e) {
    console.error('[GOOGLE OAUTH]', e.message);
    const hashParams = new URLSearchParams();
    hashParams.set('type', 'client');
    hashParams.set('slug', slug || '');
    hashParams.set('error', e.message);
    res.redirect(`${TARGET_ORIGIN}/__oauth#${hashParams.toString()}`);
  }
});

module.exports = router;