// routes/global-clients.js — Compte client global (multi-commerces)
// Ce compte est indépendant des commerces. Un client peut réserver chez
// plusieurs commerçants avec le même compte global.
const express  = require('express');
const { pool } = require('../db');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { sendPasswordReset } = require('../utils/email');
const router   = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Middleware : authentification compte client global
// ─────────────────────────────────────────────────────────────────────────────
function globalClientAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    const dec = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    if (dec.scope !== 'global_client') return res.status(401).json({ error: 'Token invalide.' });
    req.globalClient = dec;
    next();
  } catch { res.status(401).json({ error: 'Session expirée.' }); }
}

// Auth unifié : accepte scope='global_client' OU scope='client' lié à un
// global_client (globalClientId présent). Les endpoints parrainage utilisent
// ce middleware car le client s'authentifie via ff_client_token (login
// commerçant) — ff_gc_token n'est jamais écrit côté front.
function clientOrGlobalClientAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    const dec = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    if (dec.scope === 'global_client' && dec.globalClientId) {
      req.globalClient = dec;
      return next();
    }
    if (dec.scope === 'client' && dec.globalClientId) {
      req.globalClient = { globalClientId: dec.globalClientId, email: dec.email };
      return next();
    }
    return res.status(401).json({ error: 'Token invalide.' });
  } catch { res.status(401).json({ error: 'Session expirée.' }); }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/global-clients/register
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, invite_token, birth_date } = req.body;
    if (!email || !password || !first_name)
      return res.status(400).json({ error: 'Email, mot de passe et prénom requis.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Mot de passe trop court (6 min).' });

    const emailLow = email.toLowerCase().trim();
    const bd = (birth_date && /^\d{4}-\d{2}-\d{2}$/.test(birth_date)) ? birth_date : null;

    // Vérifier si email déjà pris
    const { rows: ex } = await pool.query(
      'SELECT id, is_verified FROM global_clients WHERE LOWER(email)=$1', [emailLow]
    );
    if (ex.length && ex[0].is_verified) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });
    }

    const hash = await bcrypt.hash(password, 10);

    let gc;
    if (ex.length) {
      // Compte pré-créé par invitation → activer avec les vraies coordonnées
      const { rows } = await pool.query(
        `UPDATE global_clients SET
           first_name=$2, last_name=$3, phone=$4, password_hash=$5,
           birth_date=COALESCE($6, birth_date),
           is_verified=TRUE, invite_token=NULL, updated_at=NOW()
         WHERE LOWER(email)=$1 RETURNING *`,
        [emailLow, first_name, last_name || '', phone || null, hash, bd]
      );
      gc = rows[0];
    } else {
      // Nouveau compte global (s'inscrit sans invitation)
      const { rows } = await pool.query(
        `INSERT INTO global_clients (email, password_hash, first_name, last_name, phone, birth_date, is_verified)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING *`,
        [emailLow, hash, first_name, last_name || '', phone || null, bd]
      );
      gc = rows[0];
    }

    // RÈGLE 4+5 — Lier et mettre à jour TOUTES les fiches locales existantes par email
    // Les coordonnées du compte global font autorité sur les fiches internes
    await pool.query(
      `UPDATE client_accounts SET
         global_client_id = $1,
         source           = 'platform',
         first_name       = $2,
         last_name        = COALESCE(NULLIF($3,''), last_name),
         phone            = COALESCE(NULLIF($4,''), phone)
       WHERE LOWER(email) = LOWER($5)`,
      [gc.id, gc.first_name, gc.last_name || '', gc.phone || '', emailLow]
    );

    // Lier aussi par téléphone (fiches sans email mais même téléphone)
    if (phone) {
      await pool.query(
        `UPDATE client_accounts SET
           global_client_id = $1,
           source           = 'platform',
           first_name       = $2,
           last_name        = COALESCE(NULLIF($3,''), last_name)
         WHERE phone = $4
           AND global_client_id IS NULL
           AND (email IS NULL OR email = '' OR LOWER(email) != LOWER($5))`,
        [gc.id, gc.first_name, gc.last_name || '', phone, emailLow]
      );
    }

    const token = jwt.sign(
      { globalClientId: gc.id, email: gc.email, scope: 'global_client' },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    );

    res.status(201).json({
      ok: true, token,
      client: {
        id: gc.id, email: gc.email,
        first_name: gc.first_name, last_name: gc.last_name, phone: gc.phone,
      },
    });
  } catch (e) {
    console.error('[global-clients register]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/global-clients/login
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });

    const { rows } = await pool.query(
      'SELECT * FROM global_clients WHERE LOWER(email)=LOWER($1) AND is_verified=TRUE', [email.trim()]
    );
    if (!rows.length) return res.status(401).json({ error: 'Email introuvable ou compte non activé.' });

    const gc = rows[0];
    if (!gc.password_hash) return res.status(401).json({ error: 'Compte sans mot de passe. Utilisez l\'invitation reçue.' });

    const valid = await bcrypt.compare(password, gc.password_hash);
    if (!valid) return res.status(401).json({ error: 'Mot de passe incorrect.' });

    const token = jwt.sign(
      { globalClientId: gc.id, email: gc.email, scope: 'global_client' },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    );

    res.json({
      ok: true, token,
      client: { id: gc.id, email: gc.email, first_name: gc.first_name, last_name: gc.last_name, phone: gc.phone },
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/global-clients/activate — activation via token d'invitation
// RÈGLE 4 : le client interne devient plateforme → sync coordonnées + verrouillage
// ─────────────────────────────────────────────────────────────────────────────
router.post('/activate', async (req, res) => {
  try {
    const { invite_token, password, first_name, last_name, phone } = req.body;
    if (!invite_token || !password) return res.status(400).json({ error: 'Token et mot de passe requis.' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 min).' });

    const { rows } = await pool.query(
      'SELECT * FROM global_clients WHERE invite_token=$1', [invite_token]
    );
    if (!rows.length) return res.status(400).json({ error: 'Lien invalide ou expiré.' });

    const gc   = rows[0];
    const hash = await bcrypt.hash(password, 10);
    const { rows: updated } = await pool.query(
      `UPDATE global_clients SET
         password_hash = $1,
         is_verified   = TRUE,
         invite_token  = NULL,
         first_name    = COALESCE(NULLIF($2,''), first_name),
         last_name     = COALESCE(NULLIF($3,''), last_name),
         phone         = COALESCE(NULLIF($4,''), phone),
         updated_at    = NOW()
       WHERE id=$5 RETURNING *`,
      [hash, first_name || '', last_name || '', phone || '', gc.id]
    );
    const gcUpdated = updated[0];

    // RÈGLE 4+5 : mettre à jour TOUTES les fiches locales existantes
    // Les vraies coordonnées du compte global font autorité
    await pool.query(
      `UPDATE client_accounts SET
         global_client_id = $1,
         source           = 'platform',
         first_name       = $2,
         last_name        = COALESCE(NULLIF($3,''), last_name),
         phone            = COALESCE(NULLIF($4,''), phone)
       WHERE LOWER(email) = LOWER($5)`,
      [gcUpdated.id, gcUpdated.first_name, gcUpdated.last_name || '', gcUpdated.phone || '', gcUpdated.email]
    );
    // Lier aussi par téléphone
    if (gcUpdated.phone) {
      await pool.query(
        `UPDATE client_accounts SET
           global_client_id = $1,
           source           = 'platform',
           first_name       = $2,
           last_name        = COALESCE(NULLIF($3,''), last_name)
         WHERE phone = $4
           AND global_client_id IS NULL
           AND (email IS NULL OR email = '' OR LOWER(email) != LOWER($5))`,
        [gcUpdated.id, gcUpdated.first_name, gcUpdated.last_name || '', gcUpdated.phone, gcUpdated.email]
      );
    }

    const token = jwt.sign(
      { globalClientId: gcUpdated.id, email: gcUpdated.email, scope: 'global_client' },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    );

    res.json({
      ok: true, token,
      client: {
        id:         gcUpdated.id,
        email:      gcUpdated.email,
        first_name: gcUpdated.first_name,
        last_name:  gcUpdated.last_name,
        phone:      gcUpdated.phone,
      },
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/global-clients/me — profil du client connecté
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', globalClientAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, first_name, last_name, phone, birth_date, is_verified, created_at
         FROM global_clients WHERE id=$1`,
      [req.globalClient.globalClientId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });

    // Fiches locales liées (commerces fréquentés)
    const { rows: locals } = await pool.query(
      `SELECT ca.id, ca.user_id, ca.email, ca.first_name, ca.last_name,
              bs.slug, bs.business_name,
              cl.stamps, cl.points, cl.last_visit
       FROM client_accounts ca
       LEFT JOIN booking_settings bs ON bs.user_id=ca.user_id
       LEFT JOIN client_loyalty cl ON cl.user_id=ca.user_id AND cl.client_email=ca.email
       WHERE ca.global_client_id=$1
       ORDER BY cl.last_visit DESC NULLS LAST`,
      [req.globalClient.globalClientId]
    );

    res.json({ ...rows[0], merchants: locals });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /me — mise à jour partielle du profil (birth_date, phone…)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/me', globalClientAuth, async (req, res) => {
  try {
    const { birth_date, phone, first_name, last_name } = req.body;
    const bd = birth_date === '' || birth_date === null
      ? null
      : (birth_date && /^\d{4}-\d{2}-\d{2}$/.test(birth_date) ? birth_date : undefined);
    const fields = [];
    const vals   = [];
    let i = 1;
    if (bd !== undefined) { fields.push(`birth_date=$${i++}`);  vals.push(bd); }
    if (phone     != null) { fields.push(`phone=$${i++}`);      vals.push(phone || null); }
    if (first_name!= null && first_name.trim()) { fields.push(`first_name=$${i++}`); vals.push(first_name.trim()); }
    if (last_name != null) { fields.push(`last_name=$${i++}`);  vals.push(last_name || ''); }
    if (!fields.length) return res.json({ ok: true, unchanged: true });
    fields.push(`updated_at=NOW()`);
    vals.push(req.globalClient.globalClientId);
    const { rows } = await pool.query(
      `UPDATE global_clients SET ${fields.join(', ')} WHERE id=$${i}
         RETURNING id, email, first_name, last_name, phone, birth_date`,
      vals
    );
    res.json(rows[0]);
  } catch(e) { console.error('[GC PATCH /me]', e.message); res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /me/referral-code/:slug — récupère (ou génère) le code parrainage
// pour ce client chez ce commerçant.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me/referral-code/:slug', clientOrGlobalClientAuth, async (req, res) => {
  try {
    const { rows: biz } = await pool.query(
      'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE',
      [req.params.slug]
    );
    if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const userId = biz[0].user_id;

    const { rows: gc } = await pool.query(
      'SELECT email FROM global_clients WHERE id=$1',
      [req.globalClient.globalClientId]
    );
    if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const ownerEmail = gc[0].email;

    // Vérifier que le programme est actif
    const { rows: prog } = await pool.query(
      'SELECT is_enabled, parrain_type, parrain_value, filleul_type, filleul_value FROM referral_programs WHERE user_id=$1',
      [userId]
    );
    if (!prog.length || !prog[0].is_enabled)
      return res.status(404).json({ error: "Programme de parrainage non activé chez ce commerçant." });

    // Récupérer ou créer le code
    let { rows: rc } = await pool.query(
      'SELECT id, code, uses_count FROM referral_codes WHERE user_id=$1 AND owner_client_email=$2',
      [userId, ownerEmail.toLowerCase()]
    );
    if (!rc.length) {
      const { genReferralCode } = require('./referrals');
      let attempt = 0;
      let created = null;
      while (!created && attempt < 5) {
        const code = genReferralCode();
        try {
          const { rows } = await pool.query(
            `INSERT INTO referral_codes (user_id, owner_client_email, code)
             VALUES ($1,$2,$3) RETURNING id, code, uses_count`,
            [userId, ownerEmail.toLowerCase(), code]
          );
          created = rows[0];
        } catch (e) {
          if (!String(e.message).includes('duplicate')) throw e;
          attempt++;
        }
      }
      if (!created) return res.status(500).json({ error: 'Impossible de générer un code unique.' });
      rc = [created];
    }

    res.json({
      code: rc[0].code,
      uses_count: rc[0].uses_count,
      program: prog[0],
    });
  } catch(e) { console.error('[REF MY-CODE]', e.message); res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /me/referral-history/:slug — liste des filleuls + statut + réductions
// disponibles pour ce client chez ce commerçant (page parrainage client).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me/referral-history/:slug', clientOrGlobalClientAuth, async (req, res) => {
  try {
    const { rows: biz } = await pool.query(
      'SELECT user_id, business_name FROM booking_settings bs WHERE slug=$1 AND is_enabled=TRUE',
      [req.params.slug]
    );
    if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const userId = biz[0].user_id;
    const { rows: gc } = await pool.query(
      'SELECT email FROM global_clients WHERE id=$1',
      [req.globalClient.globalClientId]
    );
    if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const ownerEmail = gc[0].email.toLowerCase();

    // Historique des filleuls + statut de la récompense parrain associée
    // (LEFT JOIN sur client_rewards via referral_use_id : permet d'afficher
    // "Utilisée" / "Disponible" sur la fiche filleul côté page parrainage).
    const { rows: history } = await pool.query(
      `SELECT ru.id, ru.filleul_email, ru.status, ru.created_at, ru.validated_at,
              ca.first_name AS filleul_first_name,
              ca.last_name  AS filleul_last_name,
              cr.status AS reward_status,
              cr.used_at AS reward_used_at
         FROM referral_uses ru
         JOIN referral_codes rc ON rc.id = ru.referral_code_id
         LEFT JOIN client_accounts ca
           ON ca.user_id = ru.user_id
          AND LOWER(ca.email) = LOWER(ru.filleul_email)
         LEFT JOIN client_rewards cr
           ON cr.referral_use_id = ru.id
        WHERE ru.user_id=$1 AND LOWER(rc.owner_client_email)=$2
        ORDER BY ru.created_at DESC
        LIMIT 100`,
      [userId, ownerEmail]
    );

    // Réductions disponibles pour ce client
    const { rows: rewards } = await pool.query(
      `SELECT cr.id, cr.reward_type, cr.status, cr.expires_at, cr.created_at, cr.used_at,
              p.code, p.type, p.value
         FROM client_rewards cr
         LEFT JOIN promo_codes p ON p.id = cr.promo_code_id
        WHERE cr.user_id=$1 AND LOWER(cr.client_email)=$2
        ORDER BY
          CASE cr.status WHEN 'available' THEN 0 WHEN 'used' THEN 1 ELSE 2 END,
          cr.expires_at ASC NULLS LAST,
          cr.created_at DESC
        LIMIT 50`,
      [userId, ownerEmail]
    );

    res.json({ history, rewards });
  } catch(e) { console.error('[REF HISTORY]', e.message); res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /pub/:slug/referral-program — config publique du programme parrainage.
// Retourne 200 si le programme existe (même désactivé → is_enabled:false) pour
// que le frontend puisse afficher la page "programme fermé". 404 uniquement si
// aucun programme n'a jamais été créé chez ce commerçant (→ ne pas afficher le
// lien de navigation du tout).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pub/:slug/referral-program', async (req, res) => {
  try {
    // business_name vit dans users (pas dans booking_settings) → JOIN
    const { rows: biz } = await pool.query(
      `SELECT bs.user_id, u.business_name
         FROM booking_settings bs
         JOIN users u ON u.id = bs.user_id
        WHERE bs.slug=$1 AND bs.is_enabled=TRUE`,
      [req.params.slug]
    );
    if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const { rows: prog } = await pool.query(
      `SELECT is_enabled, parrain_type, parrain_value, filleul_type, filleul_value,
              limit_count, limit_period
         FROM referral_programs WHERE user_id=$1`, [biz[0].user_id]
    );
    if (!prog.length)
      return res.status(404).json({ error: 'Programme inexistant.' });
    res.json({
      business_name: biz[0].business_name,
      ...prog[0],
    });
  } catch(e) {
    console.error('[REF PROG PUB]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/global-clients/appointments — tous les RDV multi-commerces
// ─────────────────────────────────────────────────────────────────────────────
router.get('/appointments', globalClientAuth, async (req, res) => {
  try {
    const gcId = req.globalClient.globalClientId;
    const { rows: gc } = await pool.query('SELECT email FROM global_clients WHERE id=$1', [gcId]);
    if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const email = gc[0].email;

    const { rows } = await pool.query(
      `SELECT
         a.id, a.date, a.start_time, a.end_time, a.status,
         a.notes, a.total_amount, a.total_duration,
         bs.name AS service_name, e.name AS employee_name,
         biz.business_name, biz.slug
       FROM appointments a
       LEFT JOIN booking_services bs ON bs.id=a.service_id
       LEFT JOIN employees e ON e.id=a.employee_id
       LEFT JOIN booking_settings biz ON biz.user_id=a.user_id
       WHERE LOWER(a.client_email)=LOWER($1)
       ORDER BY a.date DESC, a.start_time DESC
       LIMIT 50`,
      [email]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/global-clients/me — mettre à jour le profil
// ─────────────────────────────────────────────────────────────────────────────
router.put('/me', globalClientAuth, async (req, res) => {
  try {
    const { first_name, last_name, phone, email } = req.body;
    const gid = req.globalClient.globalClientId;

    // Si changement d'email : vérifier unicité
    if (email && email.trim()) {
      const { rows: existing } = await pool.query(
        'SELECT id FROM global_clients WHERE LOWER(email)=LOWER($1) AND id!=$2',
        [email.trim(), gid]
      );
      if (existing.length) return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre compte.' });
    }

    const { rows } = await pool.query(
      `UPDATE global_clients SET
         first_name=COALESCE(NULLIF($2,''), first_name),
         last_name=COALESCE(NULLIF($3,''), last_name),
         phone=COALESCE(NULLIF($4,''), phone),
         email=COALESCE(NULLIF($5,''), email),
         updated_at=NOW()
       WHERE id=$1 RETURNING id, email, first_name, last_name, phone`,
      [gid, first_name||'', last_name||'', phone||'', email?.trim()||'']
    );
    if (!rows[0]) return res.status(404).json({ error: 'Compte introuvable.' });

    // Synchroniser dans toutes les fiches locales liées
    await pool.query(
      `UPDATE client_accounts SET
         first_name=$2, last_name=$3, phone=COALESCE(NULLIF($4,''), phone)
       WHERE global_client_id=$1`,
      [rows[0].id, rows[0].first_name, rows[0].last_name, rows[0].phone||'']
    );

    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/global-clients/change-password
// ─────────────────────────────────────────────────────────────────────────────
router.post('/change-password', globalClientAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Champs requis.' });
    if (new_password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 min).' });

    const { rows } = await pool.query('SELECT password_hash FROM global_clients WHERE id=$1', [req.globalClient.globalClientId]);
    if (!rows[0] || !await bcrypt.compare(current_password, rows[0].password_hash))
      return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE global_clients SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.globalClient.globalClientId]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/global-clients/loyalty — tous les points fidélité multi-commerces
// ─────────────────────────────────────────────────────────────────────────────
router.get('/loyalty', globalClientAuth, async (req, res) => {
  try {
    const { rows: gc } = await pool.query('SELECT email FROM global_clients WHERE id=$1', [req.globalClient.globalClientId]);
    if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });

    const { rows } = await pool.query(
      `SELECT
         cl.stamps, cl.points, cl.total_stamps_ever, cl.total_points_ever,
         cl.rewards_earned, cl.last_visit,
         lp.stamps_required, lp.loyalty_mode, lp.points_per_euro,
         lp.reward_label, lp.reward_type, lp.reward_value,
         bs.business_name, bs.slug
       FROM client_loyalty cl
       LEFT JOIN loyalty_programs lp ON lp.user_id=cl.user_id
       LEFT JOIN booking_settings bs ON bs.user_id=cl.user_id
       WHERE LOWER(cl.client_email)=LOWER($1) AND lp.enabled=TRUE
       ORDER BY cl.last_visit DESC NULLS LAST`,
      [gc[0].email]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Helpers : stockage temporaire des codes OTP (même système que auth.js)
// Utilise la table verification_codes — fiable, déjà en place, pas de migration
// ─────────────────────────────────────────────────────────────────────────────
async function saveCode(key, code, data, minutes = 15) {
  const expires = new Date(Date.now() + minutes * 60 * 1000);
  await pool.query(
    `INSERT INTO verification_codes (key, code, data, expires_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (key) DO UPDATE SET code=$2, data=$3, expires_at=$4`,
    [key, code, data, expires]
  );
}
async function getCode(key) {
  const { rows } = await pool.query('SELECT * FROM verification_codes WHERE key=$1', [key]);
  if (!rows.length) return null;
  if (new Date(rows[0].expires_at) < new Date()) {
    await pool.query('DELETE FROM verification_codes WHERE key=$1', [key]);
    return null;
  }
  return { code: rows[0].code, data: rows[0].data || {} };
}
async function deleteCode(key) {
  await pool.query('DELETE FROM verification_codes WHERE key=$1', [key]);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/global-clients/forgot-password
// Envoie un code de réinitialisation par email (6 chiffres, valide 15 min)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis.' });
    const emailLow = email.trim().toLowerCase();

    const { rows } = await pool.query(
      'SELECT id, first_name, last_name FROM global_clients WHERE LOWER(email)=LOWER($1)',
      [emailLow]
    );
    // Toujours répondre OK pour ne pas révéler si le compte existe
    if (!rows.length) return res.json({ ok: true });

    const gc   = rows[0];
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Stocker dans verification_codes (fiable, pas de dépendance de migration)
    await saveCode(`gc_rst_${emailLow}`, code, { gcId: gc.id, email: emailLow }, 15);

    try {
      await sendPasswordReset({
        to:         emailLow,
        clientName: `${gc.first_name} ${gc.last_name||''}`.trim(),
        code,
      });
    } catch (emailErr) {
      console.error('[RESET EMAIL ERR]', emailErr.message);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[forgot-password]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/global-clients/reset-password
// Vérifie le code OTP et met à jour le mot de passe
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, new_password } = req.body;
    if (!email || !code || !new_password)
      return res.status(400).json({ error: 'Email, code et nouveau mot de passe requis.' });
    if (new_password.length < 6)
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères.' });

    const emailLow = email.trim().toLowerCase();
    const key      = `gc_rst_${emailLow}`;
    const rec      = await getCode(key);

    if (!rec) {
      return res.status(400).json({ error: 'Code invalide ou expiré. Recommencez depuis "Mot de passe oublié".' });
    }
    if (rec.code.trim() !== code.trim()) {
      return res.status(400).json({ error: 'Code incorrect.' });
    }

    const hash = await bcrypt.hash(new_password, 10);

    // Mettre à jour global_clients
    await pool.query(
      'UPDATE global_clients SET password_hash=$1, updated_at=NOW() WHERE id=$2',
      [hash, rec.data.gcId]
    );

    // Synchroniser dans TOUTES les fiches locales liées — par global_client_id ET par email
    // (les fiches sans global_client_id sont aussi mises à jour pour qu'elles puissent se connecter)
    await pool.query(
      'UPDATE client_accounts SET password_hash=$1 WHERE global_client_id=$2',
      [hash, rec.data.gcId]
    ).catch(() => {});

    await pool.query(
      'UPDATE client_accounts SET password_hash=$1 WHERE LOWER(email)=LOWER($2)',
      [hash, emailLow]
    ).catch(() => {});

    await deleteCode(key);

    res.json({ ok: true, message: 'Mot de passe mis à jour avec succès.' });
  } catch (e) {
    console.error('[reset-password]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/global-clients/me — Suppression RGPD complète
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/me', globalClientAuth, async (req, res) => {
  try {
    const gid = req.globalClient.globalClientId;

    const { rows: gcRows } = await pool.query(
      'SELECT email, first_name FROM global_clients WHERE id=$1', [gid]
    );
    if (!gcRows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const { email } = gcRows[0];

    // 1. Anonymiser les RDV — garder l'historique commerçant mais effacer identité
    // appointments.client_id référence client_accounts.id (pas global_clients.id).
    // Résolution: on matche via les fiches locales liées au compte global + email.
    await pool.query(
      `UPDATE appointments SET
         client_id=NULL,
         client_name='Client anonyme',
         client_email=NULL,
         client_phone=NULL
       WHERE client_id IN (SELECT id FROM client_accounts WHERE global_client_id=$1)`,
      [gid]
    );
    if (email) {
      await pool.query(
        `UPDATE appointments SET
           client_id=NULL,
           client_name='Client anonyme',
           client_email=NULL,
           client_phone=NULL
         WHERE LOWER(client_email)=LOWER($1)`,
        [email]
      );
    }
    // Annuler les RDV futurs du client anonymisé
    if (email) {
      await pool.query(
        `UPDATE appointments SET status='cancelled',
           cancel_reason='Compte client supprimé',
           updated_at=NOW()
         WHERE client_id IS NULL AND client_name='Client anonyme'
           AND status IN ('confirmed','pending') AND date >= CURRENT_DATE`
      );
    }

    // 2. Anonymiser les transactions (garder le montant pour la comptabilité)
    if (email) {
      await pool.query(
        `UPDATE transactions SET
           client_email=NULL,
           client_note=NULL
         WHERE LOWER(client_email)=LOWER($1)`,
        [email]
      );
    }

    // 3. Supprimer les fiches locales chez tous les commerçants
    await pool.query(
      'DELETE FROM client_accounts WHERE global_client_id=$1', [gid]
    );
    if (email) {
      await pool.query(
        'DELETE FROM client_accounts WHERE LOWER(email)=LOWER($1)', [email]
      );
    }

    // 4. Supprimer fidélité, notes, crédits
    if (email) {
      await pool.query('DELETE FROM client_loyalty WHERE LOWER(client_email)=LOWER($1)', [email]);
      await pool.query(
        `UPDATE client_notes SET client_email=NULL, client_name='[Compte supprimé]'
         WHERE LOWER(client_email)=LOWER($1)`, [email]
      );
      await pool.query(
        `UPDATE client_credits SET
           client_email=NULL,
           client_name='[Compte supprimé]'
         WHERE LOWER(client_email)=LOWER($1)`, [email]
      );
    }

    // 5. Supprimer le compte global
    await pool.query('DELETE FROM global_clients WHERE id=$1', [gid]);

    console.log(`[RGPD] Suppression compte ${gid} — email anonymisé`);
    res.json({
      ok: true,
      message: 'Votre compte et vos données personnelles ont été supprimés. Les historiques de transactions sont conservés de façon anonyme pour la comptabilité des commerçants.',
    });
  } catch(e) {
    console.error('[DELETE ACCOUNT]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/global-clients/me/export — Export RGPD (portabilité des données)
router.get('/me/export', globalClientAuth, async (req, res) => {
  try {
    const gid = req.globalClient.globalClientId;

    // Données du compte
    const { rows: [gc] } = await pool.query(
      'SELECT id, email, first_name, last_name, phone, created_at FROM global_clients WHERE id=$1',
      [gid]
    );
    if (!gc) return res.status(404).json({ error: 'Compte introuvable.' });

    // RDV
    const { rows: appts } = await pool.query(
      `SELECT a.date, a.start_time, a.end_time, a.status,
              s.name as service, u.business_name as commerce
       FROM appointments a
       LEFT JOIN booking_services s ON s.id = a.service_id
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.client_id=$1
       ORDER BY a.date DESC LIMIT 200`,
      [gid]
    );

    // Fidélité
    const { rows: loyalty } = await pool.query(
      `SELECT cl.stamps_count, cl.total_rewards, lp.reward_label, u.business_name
       FROM client_loyalty cl
       JOIN loyalty_programs lp ON lp.id = cl.program_id
       JOIN users u ON u.id = cl.user_id
       WHERE LOWER(cl.client_email)=LOWER($1)`,
      [gc.email]
    );

    const exportData = {
      export_date: new Date().toISOString(),
      account: {
        email:      gc.email,
        first_name: gc.first_name,
        last_name:  gc.last_name,
        phone:      gc.phone,
        created_at: gc.created_at,
      },
      appointments: appts,
      loyalty_cards: loyalty,
      note: 'Export RGPD — Article 20 du Règlement Général sur la Protection des Données',
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="mes-donnees-flowia.json"');
    res.json(exportData);
  } catch(e) {
    console.error('[RGPD EXPORT]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.globalClientAuth = globalClientAuth;