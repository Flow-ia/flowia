// routes/global-clients.js — Compte client global (multi-commerces)
// Ce compte est indépendant des commerces. Un client peut réserver chez
// plusieurs commerçants avec le même compte global.
const express  = require('express');
const { pool } = require('../db');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { sendPasswordReset, sendVerificationEmail } = require('../utils/email');
const router   = express.Router();

// Regex email commune aux routes register/reset/invite. Rejette `a@@b`, espaces,
// caractères exotiques, emails >254 chars (RFC 5321 SMTP cap).
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
function isValidEmail(e) {
  return typeof e === 'string' && e.length <= 254 && EMAIL_RE.test(e.trim());
}
// Vérifie qu'une chaîne YYYY-MM-DD est bien une date réelle (ex: 2024-02-31 refusé)
function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

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
    if (!isValidEmail(email))
      return res.status(400).json({ error: 'Email invalide.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Mot de passe trop court (6 min).' });

    const emailLow = email.toLowerCase().trim();
    // Accepte YYYY-MM-DD et YYYY-MM (= 1er du mois). Cohérent avec
    // public-booking register et l'UI client (select mois+année).
    // Refuse les dates impossibles (ex: 2024-02-31) qui passent la regex.
    let bd = null;
    if (birth_date && typeof birth_date === 'string') {
      const s = birth_date.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s) && isRealDate(s))      bd = s;
      else if (/^\d{4}-\d{2}$/.test(s) && isRealDate(s + '-01')) bd = s + '-01';
    }

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
      `SELECT id, email, first_name, last_name, phone, birth_date,
              postal_code, city, is_verified, created_at
         FROM global_clients WHERE id=$1`,
      [req.globalClient.globalClientId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });

    // Fiches locales liées (commerces fréquentés)
    // business_name vit sur users (pas booking_settings) → JOIN users.
    const { rows: locals } = await pool.query(
      `SELECT ca.id, ca.user_id, ca.email, ca.first_name, ca.last_name,
              bs.slug, u.business_name,
              cl.stamps, cl.points, cl.last_visit
       FROM client_accounts ca
       LEFT JOIN booking_settings bs ON bs.user_id=ca.user_id
       LEFT JOIN users u              ON u.id        =ca.user_id
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
    const { birth_date, phone, first_name, last_name, postal_code, city } = req.body;
    // Accepte YYYY-MM-DD, YYYY-MM (1er du mois), '' / null (effacer), undefined (ne pas toucher)
    let bd;
    if (birth_date === '' || birth_date === null) bd = null;
    else if (typeof birth_date === 'string') {
      const s = birth_date.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s))      bd = s;
      else if (/^\d{4}-\d{2}$/.test(s))       bd = s + '-01';
      else                                    bd = undefined;
    } else bd = undefined;
    // postal_code / city : même sémantique que bd (undefined/null/''/string)
    const pc = postal_code === undefined ? undefined
             : (postal_code === null || postal_code === '' ? null : String(postal_code).trim().slice(0,20));
    const ct = city === undefined ? undefined
             : (city === null || city === '' ? null : String(city).trim().slice(0,120));

    const fields = [];
    const vals   = [];
    let i = 1;
    if (bd !== undefined) { fields.push(`birth_date=$${i++}`);  vals.push(bd); }
    if (phone     != null) { fields.push(`phone=$${i++}`);      vals.push(phone || null); }
    if (first_name!= null && first_name.trim()) { fields.push(`first_name=$${i++}`); vals.push(first_name.trim()); }
    if (last_name != null) { fields.push(`last_name=$${i++}`);  vals.push(last_name || ''); }
    if (pc !== undefined) { fields.push(`postal_code=$${i++}`); vals.push(pc); }
    if (ct !== undefined) { fields.push(`city=$${i++}`);        vals.push(ct); }
    if (!fields.length) return res.json({ ok: true, unchanged: true });
    fields.push(`updated_at=NOW()`);
    const gcId = req.globalClient.globalClientId;
    vals.push(gcId);
    const { rows } = await pool.query(
      `UPDATE global_clients SET ${fields.join(', ')} WHERE id=$${i}
         RETURNING id, email, first_name, last_name, phone, birth_date, postal_code, city`,
      vals
    );
    // Propage birth_date (et autres champs) aux fiches locales liées.
    // Sans cela, le cron anniversaire (qui lit client_accounts.birth_date)
    // ne verrait pas la mise à jour → aucune promo émise.
    if (bd !== undefined) {
      await pool.query(
        `UPDATE client_accounts SET birth_date=$1 WHERE global_client_id=$2`,
        [bd, gcId]
      ).catch(e => console.warn('[GC PATCH /me propagate birth]', e.message));
    }
    if (phone != null) {
      await pool.query(
        `UPDATE client_accounts SET phone=$1 WHERE global_client_id=$2`,
        [phone || null, gcId]
      ).catch(() => {});
    }
    if (first_name != null && first_name.trim()) {
      await pool.query(
        `UPDATE client_accounts SET first_name=$1 WHERE global_client_id=$2`,
        [first_name.trim(), gcId]
      ).catch(() => {});
    }
    if (last_name != null) {
      await pool.query(
        `UPDATE client_accounts SET last_name=$1 WHERE global_client_id=$2`,
        [last_name || '', gcId]
      ).catch(() => {});
    }
    if (pc !== undefined) {
      await pool.query(
        `UPDATE client_accounts SET postal_code=$1 WHERE global_client_id=$2`,
        [pc, gcId]
      ).catch(() => {});
    }
    if (ct !== undefined) {
      await pool.query(
        `UPDATE client_accounts SET city=$1 WHERE global_client_id=$2`,
        [ct, gcId]
      ).catch(() => {});
    }
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
// GET /api/global-clients/me/visits — passages "sur place" du client (paginé)
// ─────────────────────────────────────────────────────────────────────────────
// Query params : page (1), limit (10, max 50), q (recherche commerçant),
// date (YYYY-MM-DD filtre exact).
// Réponse : { items, total, page, pageSize }.
// Liste les transactions encaissées en caisse SANS RDV préalable. Filtrées
// via global_client_id OU email (lien non établi sur anciennes transactions).
// Auth : accepte ff_client_token (scope='client' avec globalClientId) OU
// ff_gc_token (scope='global_client').
router.get('/me/visits', clientOrGlobalClientAuth, async (req, res) => {
  try {
    const gcId = req.globalClient.globalClientId;
    const { rows: gc } = await pool.query(
      'SELECT email FROM global_clients WHERE id=$1', [gcId]
    );
    if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const email = gc[0].email;

    // Pagination + filtres
    const page     = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset   = (page - 1) * pageSize;
    const q        = String(req.query.q    || '').trim();
    const date     = String(req.query.date || '').trim();

    const where  = [
      `t.type IN ('income','revenue')`,
      `t.appointment_id IS NULL`,
      `(t.global_client_id = $1 OR LOWER(t.client_email) = LOWER($2))`,
    ];
    const params = [gcId, email];

    if (q) {
      params.push('%' + q.toLowerCase() + '%');
      where.push(`LOWER(COALESCE(u.business_name,'')) LIKE $${params.length}`);
    }
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      params.push(date);
      where.push(`t.date = $${params.length}::date`);
    }
    const whereSql = 'WHERE ' + where.join(' AND ');

    // Total (pour pagination)
    const { rows: cRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM transactions t
         LEFT JOIN users u ON u.id = t.user_id
         ${whereSql}`,
      params
    );
    const total = cRows[0]?.total || 0;

    if (total === 0) return res.json({ items: [], total: 0, page, pageSize });

    // Page de résultats
    const pageParams = [...params, pageSize, offset];
    const { rows } = await pool.query(
      `SELECT
         t.id, t.user_id, t.amount, t.original_amount, t.discount_amount,
         t.payment_method, t.description,
         TO_CHAR(t.date, 'YYYY-MM-DD') as date,
         TO_CHAR(t.time, 'HH24:MI')     as time,
         t.datetime_iso, t.created_at, t.qty_total,
         u.business_name, biz.slug,
         biz.phone AS business_phone, biz.address AS business_address,
         e.name AS employee_name
       FROM transactions t
       LEFT JOIN users u              ON u.id        = t.user_id
       LEFT JOIN booking_settings biz ON biz.user_id = t.user_id
       LEFT JOIN employees e          ON e.id        = t.employee_id
       ${whereSql}
       ORDER BY t.date DESC, t.time DESC NULLS LAST, t.created_at DESC
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );

    if (!rows.length) return res.json({ items: [], total, page, pageSize });

    // Items en un round-trip
    const ids = rows.map(r => r.id);
    const { rows: items } = await pool.query(
      `SELECT transaction_id, service_name, qty, unit_price
         FROM transaction_items
        WHERE transaction_id = ANY($1::uuid[])
        ORDER BY created_at`,
      [ids]
    );
    const byTx = {};
    for (const it of items) {
      (byTx[it.transaction_id] = byTx[it.transaction_id] || []).push({
        service_name: it.service_name,
        qty:          it.qty,
        unit_price:   parseFloat(it.unit_price),
      });
    }
    const out = rows.map(r => ({ ...r, items: byTx[r.id] || [] }));
    res.json({ items: out, total, page, pageSize });
  } catch (e) {
    console.error('[GC VISITS]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/global-clients/me/visits/:id — détail d'un passage
// ─────────────────────────────────────────────────────────────────────────────
// Permet au client d'accéder directement à la page détail via URL
// /book/:slug/client/passages/:id (bookmark/refresh).
router.get('/me/visits/:id', clientOrGlobalClientAuth, async (req, res) => {
  try {
    const gcId = req.globalClient.globalClientId;
    const { rows: gc } = await pool.query(
      'SELECT email FROM global_clients WHERE id=$1', [gcId]
    );
    if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const email = gc[0].email;
    const txId  = req.params.id;

    const { rows } = await pool.query(
      `SELECT
         t.id, t.user_id, t.amount, t.original_amount, t.discount_amount,
         t.payment_method, t.description,
         TO_CHAR(t.date, 'YYYY-MM-DD') as date,
         TO_CHAR(t.time, 'HH24:MI')     as time,
         t.datetime_iso, t.created_at, t.qty_total,
         u.business_name, biz.slug,
         biz.phone AS business_phone, biz.address AS business_address,
         e.name AS employee_name
       FROM transactions t
       LEFT JOIN users u              ON u.id        = t.user_id
       LEFT JOIN booking_settings biz ON biz.user_id = t.user_id
       LEFT JOIN employees e          ON e.id        = t.employee_id
       WHERE t.id = $1
         AND t.type IN ('income','revenue')
         AND t.appointment_id IS NULL
         AND (t.global_client_id = $2 OR LOWER(t.client_email) = LOWER($3))
       LIMIT 1`,
      [txId, gcId, email]
    );
    if (!rows.length) return res.status(404).json({ error: 'Passage introuvable.' });

    const v = rows[0];
    const { rows: items } = await pool.query(
      `SELECT service_name, qty, unit_price
         FROM transaction_items
        WHERE transaction_id = $1
        ORDER BY created_at`,
      [txId]
    );
    v.items = items.map(it => ({
      service_name: it.service_name,
      qty:          it.qty,
      unit_price:   parseFloat(it.unit_price),
    }));
    res.json(v);
  } catch (e) {
    console.error('[GC VISIT DETAIL]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/global-clients/me — mettre à jour le profil
// ─────────────────────────────────────────────────────────────────────────────
router.put('/me', globalClientAuth, async (req, res) => {
  try {
    // Email: volontairement NON géré ici. Le changement d'email passe par
    // POST /me/change-email + /confirm (code envoyé à l'email actuel).
    const { first_name, last_name, phone } = req.body;
    const gid = req.globalClient.globalClientId;

    const { rows } = await pool.query(
      `UPDATE global_clients SET
         first_name=COALESCE(NULLIF($2,''), first_name),
         last_name=COALESCE(NULLIF($3,''), last_name),
         phone=COALESCE(NULLIF($4,''), phone),
         updated_at=NOW()
       WHERE id=$1 RETURNING id, email, first_name, last_name, phone`,
      [gid, first_name||'', last_name||'', phone||'']
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
// POST /api/global-clients/change-password — LEGACY (non utilisé par le front)
// Conservé pour backcompat — les nouveaux flux utilisent /me/change-password
// avec code OTP envoyé à l'email, aligné sur "mot de passe oublié".
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
// POST /me/change-email — init avec vérification par code (aligné commerçant)
// Body: { new_email }
// Vérifie l'unicité (global_clients) + envoie un code 6 chiffres à l'email
// ACTUEL (authentifie le propriétaire). Le code est stocké 15 min.
// Accepte les deux scopes (ff_gc_token OU ff_client_token avec globalClientId).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/me/change-email', clientOrGlobalClientAuth, async (req, res) => {
  try {
    const gid = req.globalClient.globalClientId;
    const raw = String(req.body?.new_email || '').trim().toLowerCase();
    if (!raw || !raw.includes('@') || raw.length < 5) {
      return res.status(400).json({ error: 'Email invalide.' });
    }

    const { rows: u } = await pool.query('SELECT email FROM global_clients WHERE id=$1', [gid]);
    if (!u.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const currentEmail = u[0].email;
    if (currentEmail.toLowerCase() === raw) {
      return res.status(400).json({ error: "Le nouvel email doit être différent de l'actuel." });
    }

    const { rows: dup } = await pool.query(
      'SELECT id FROM global_clients WHERE LOWER(email)=LOWER($1) AND id<>$2',
      [raw, gid]
    );
    if (dup.length) return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre compte.' });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await saveCode(`gc_chg_email_${gid}`, code, { newEmail: raw }, 15);

    // Envoi asynchrone à l'ancien email — authentifie le propriétaire
    setImmediate(() => sendVerificationEmail(
      currentEmail, code,
      'Confirmez le changement de votre email — FlowIA',
      'email'
    ).catch(e => console.error('[EMAIL gc change-email]', e.message)));

    res.json({ ok: true, sent_to: currentEmail });
  } catch (e) {
    console.error('[gc change-email]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /me/change-email/confirm — valide le code + applique le changement
// Body: { code } — re-check anti-race sur l'unicité avant update.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/me/change-email/confirm', clientOrGlobalClientAuth, async (req, res) => {
  try {
    const gid  = req.globalClient.globalClientId;
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Code requis.' });

    const rec = await getCode(`gc_chg_email_${gid}`);
    if (!rec) return res.status(400).json({ error: 'Code invalide ou expiré.' });
    if (rec.code.trim() !== code) return res.status(400).json({ error: 'Code incorrect.' });

    const newEmail = rec.data.newEmail;

    // Re-vérif anti-race
    const { rows: dup } = await pool.query(
      'SELECT id FROM global_clients WHERE LOWER(email)=LOWER($1) AND id<>$2',
      [newEmail, gid]
    );
    if (dup.length) {
      await deleteCode(`gc_chg_email_${gid}`);
      return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre compte.' });
    }

    try {
      await pool.query(
        'UPDATE global_clients SET email=$1, updated_at=NOW() WHERE id=$2',
        [newEmail, gid]
      );
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre compte.' });
      throw e;
    }

    // Sync les fiches locales liées
    await pool.query(
      'UPDATE client_accounts SET email=LOWER($1) WHERE global_client_id=$2',
      [newEmail, gid]
    ).catch(() => {});

    await deleteCode(`gc_chg_email_${gid}`);
    res.json({ ok: true, new_email: newEmail });
  } catch (e) {
    console.error('[gc change-email confirm]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /me/change-password — init avec vérification par code
// Body: { current_password, new_password }
// Vérifie l'ancien password + envoie un code à l'email du compte. Le hash
// du nouveau password est stocké temporairement (avec le code) pour ne
// l'appliquer qu'après validation du code (flux aligné "mot de passe oublié").
// ─────────────────────────────────────────────────────────────────────────────
router.post('/me/change-password', clientOrGlobalClientAuth, async (req, res) => {
  try {
    const gid = req.globalClient.globalClientId;
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) return res.status(400).json({ error: 'Champs requis.' });
    if (String(new_password).length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 min).' });

    const { rows } = await pool.query(
      'SELECT email, password_hash FROM global_clients WHERE id=$1', [gid]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    if (!await bcrypt.compare(current_password, rows[0].password_hash)) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
    }

    const code    = String(Math.floor(100000 + Math.random() * 900000));
    const newHash = await bcrypt.hash(new_password, 10);
    await saveCode(`gc_chg_pwd_${gid}`, code, { newHash }, 15);

    setImmediate(() => sendVerificationEmail(
      rows[0].email, code,
      'Confirmez le changement de votre mot de passe — FlowIA',
      'password'
    ).catch(e => console.error('[EMAIL gc change-pwd]', e.message)));

    res.json({ ok: true, sent_to: rows[0].email });
  } catch (e) {
    console.error('[gc change-password]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /me/change-password/confirm — valide le code + applique le hash
// Body: { code }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/me/change-password/confirm', clientOrGlobalClientAuth, async (req, res) => {
  try {
    const gid  = req.globalClient.globalClientId;
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Code requis.' });

    const rec = await getCode(`gc_chg_pwd_${gid}`);
    if (!rec) return res.status(400).json({ error: 'Code invalide ou expiré.' });
    if (rec.code.trim() !== code) return res.status(400).json({ error: 'Code incorrect.' });
    const { newHash } = rec.data;

    await pool.query(
      'UPDATE global_clients SET password_hash=$1, updated_at=NOW() WHERE id=$2',
      [newHash, gid]
    );
    await pool.query(
      'UPDATE client_accounts SET password_hash=$1 WHERE global_client_id=$2',
      [newHash, gid]
    ).catch(() => {});

    await deleteCode(`gc_chg_pwd_${gid}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[gc change-password confirm]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/global-clients/loyalty — tous les points fidélité multi-commerces
// ─────────────────────────────────────────────────────────────────────────────
router.get('/loyalty', globalClientAuth, async (req, res) => {
  try {
    const { rows: gc } = await pool.query('SELECT email FROM global_clients WHERE id=$1', [req.globalClient.globalClientId]);
    if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });

    // business_name vit sur users (pas booking_settings) → JOIN users.
    const { rows } = await pool.query(
      `SELECT
         cl.stamps, cl.points, cl.total_stamps_ever, cl.total_points_ever,
         cl.rewards_earned, cl.last_visit,
         lp.stamps_required, lp.loyalty_mode, lp.points_per_euro,
         lp.reward_label, lp.reward_type, lp.reward_value,
         u.business_name, bs.slug
       FROM client_loyalty cl
       LEFT JOIN loyalty_programs lp ON lp.user_id=cl.user_id
       LEFT JOIN booking_settings bs ON bs.user_id=cl.user_id
       LEFT JOIN users u              ON u.id       =cl.user_id
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
  // Défense timing-attack : la branche "email inexistant" retourne en <5ms alors
  // que la branche "email trouvé" prend ~300ms (saveCode + sendPasswordReset SMTP).
  // Un attaquant énumère ainsi les comptes via la latence HTTP. On impose un
  // plancher de 400ms dans tous les cas.
  const floor = new Promise((r) => setTimeout(r, 400));
  try {
    const { email } = req.body;
    if (!email) { await floor; return res.status(400).json({ error: 'Email requis.' }); }
    const emailLow = email.trim().toLowerCase();

    const { rows } = await pool.query(
      'SELECT id, first_name, last_name FROM global_clients WHERE LOWER(email)=LOWER($1)',
      [emailLow]
    );
    if (!rows.length) { await floor; return res.json({ ok: true }); }

    const gc   = rows[0];
    const code = String(Math.floor(100000 + Math.random() * 900000));

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

    await floor;
    res.json({ ok: true });
  } catch (e) {
    console.error('[forgot-password]', e);
    await floor;
    res.status(500).json({ error: 'Erreur serveur.' });
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
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/global-clients/me — Suppression RGPD complète
// Accepte les deux scopes : ff_gc_token (scope='global_client') ET
// ff_client_token (scope='client' lié à un globalClientId). Le front écrit
// principalement ff_client_token après login sur un site réservation.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/me', clientOrGlobalClientAuth, async (req, res) => {
  // Suppression RGPD : 9 opérations sur 6 tables. Sans transaction, un échec
  // à mi-parcours (timeout, deadlock) laisse un état incohérent : compte global
  // encore visible mais fiches locales supprimées, ou inverse. On enveloppe
  // tout en BEGIN/COMMIT pour garantir l'atomicité.
  const dbClient = await pool.connect();
  try {
    const gid = req.globalClient.globalClientId;

    const { rows: gcRows } = await dbClient.query(
      'SELECT email, first_name FROM global_clients WHERE id=$1', [gid]
    );
    if (!gcRows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const { email } = gcRows[0];

    await dbClient.query('BEGIN');
    try {
      // 1. Anonymiser les RDV (liés par fiche locale OU par email) et capturer
      // les ids mis à jour. Capture critique : l'ancien code annulait ensuite
      // TOUS les RDV "Client anonyme" futurs — y compris ceux de suppressions
      // précédentes, causant des annulations en chaîne non désirées.
      const { rows: anonymized } = await dbClient.query(
        `UPDATE appointments SET
           client_id=NULL,
           client_name='Client anonyme',
           client_email=NULL,
           client_phone=NULL
         WHERE client_id IN (SELECT id FROM client_accounts WHERE global_client_id=$1)
            OR ($2::text IS NOT NULL AND LOWER(client_email)=LOWER($2))
         RETURNING id`,
        [gid, email || null]
      );

      // 2. Annuler les RDV futurs — scopé uniquement aux ids qu'on vient
      // d'anonymiser dans cette transaction.
      if (anonymized.length) {
        await dbClient.query(
          `UPDATE appointments SET status='cancelled',
             cancel_reason='Compte client supprimé',
             updated_at=NOW()
           WHERE id = ANY($1::uuid[])
             AND status IN ('confirmed','pending')
             AND date >= CURRENT_DATE`,
          [anonymized.map((r) => r.id)]
        );
      }

      if (email) {
        // Cascade parrainage : annuler les referral_uses pending de ce filleul.
        await dbClient.query(
          `UPDATE referral_uses SET status='cancelled'
            WHERE LOWER(filleul_email)=LOWER($1) AND status='pending'`,
          [email]
        );
        // Anonymiser les transactions (montants gardés pour la compta).
        await dbClient.query(
          `UPDATE transactions SET client_email=NULL, client_note=NULL
           WHERE LOWER(client_email)=LOWER($1)`,
          [email]
        );
      }

      // 3. Supprimer les fiches locales chez tous les commerçants
      await dbClient.query(
        'DELETE FROM client_accounts WHERE global_client_id=$1', [gid]
      );
      if (email) {
        await dbClient.query(
          'DELETE FROM client_accounts WHERE LOWER(email)=LOWER($1)', [email]
        );
        await dbClient.query('DELETE FROM client_loyalty WHERE LOWER(client_email)=LOWER($1)', [email]);
        await dbClient.query(
          `UPDATE client_notes SET client_email=NULL, client_name='[Compte supprimé]'
           WHERE LOWER(client_email)=LOWER($1)`, [email]
        );
        await dbClient.query(
          `UPDATE client_credits SET
             client_email=NULL,
             client_name='[Compte supprimé]'
           WHERE LOWER(client_email)=LOWER($1)`, [email]
        );
      }

      // 4. Supprimer le compte global
      await dbClient.query('DELETE FROM global_clients WHERE id=$1', [gid]);

      await dbClient.query('COMMIT');
    } catch (txErr) {
      await dbClient.query('ROLLBACK').catch(() => {});
      throw txErr;
    }

    console.log(`[RGPD] Suppression compte ${gid} — email anonymisé`);
    res.json({
      ok: true,
      message: 'Votre compte et vos données personnelles ont été supprimés. Les historiques de transactions sont conservés de façon anonyme pour la comptabilité des commerçants.',
    });
  } catch(e) {
    console.error('[DELETE ACCOUNT]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  } finally {
    dbClient.release();
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