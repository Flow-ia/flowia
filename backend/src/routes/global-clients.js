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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/global-clients/register
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, invite_token } = req.body;
    if (!email || !password || !first_name)
      return res.status(400).json({ error: 'Email, mot de passe et prénom requis.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Mot de passe trop court (6 min).' });

    const emailLow = email.toLowerCase().trim();

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
           is_verified=TRUE, invite_token=NULL, updated_at=NOW()
         WHERE LOWER(email)=$1 RETURNING *`,
        [emailLow, first_name, last_name || '', phone || null, hash]
      );
      gc = rows[0];
    } else {
      // Nouveau compte global (s'inscrit sans invitation)
      const { rows } = await pool.query(
        `INSERT INTO global_clients (email, password_hash, first_name, last_name, phone, is_verified)
         VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING *`,
        [emailLow, hash, first_name, last_name || '', phone || null]
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
      'SELECT id, email, first_name, last_name, phone, is_verified, created_at FROM global_clients WHERE id=$1',
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
// DELETE /api/global-clients/me — Suppression de compte (anonymisation RGPD)
// Les transactions et statistiques sont conservées côté commerçant
// Seules les données nominatives sont effacées
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/me', globalClientAuth, async (req, res) => {
  try {
    const gid = req.globalClient.globalClientId;

    // Récupérer l'email actuel pour anonymiser les données liées
    const { rows: gcRows } = await pool.query(
      'SELECT email FROM global_clients WHERE id=$1',
      [gid]
    );
    if (!gcRows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    const email = gcRows[0].email;

    // 1. Détacher les rendez-vous (garder l'historique mais effacer le lien client_id)
    await pool.query(
      'UPDATE appointments SET client_id=NULL WHERE client_id=$1',
      [gid]
    );

    // 2. Supprimer les fiches locales (client_accounts) — les transactions gardent
    //    leur client_email historique mais la fiche est supprimée
    await pool.query(
      'DELETE FROM client_accounts WHERE global_client_id=$1',
      [gid]
    );

    // 3. Supprimer les tokens JWT actifs (loyal, etc.) en supprimant le compte
    //    Les promo_usage_logs, transaction_audit_log, transactions → conservés
    //    Les client_loyalty → supprimés (données propres au client)
    if (email) {
      await pool.query(
        'DELETE FROM client_loyalty WHERE client_email=LOWER($1)',
        [email]
      );
      // Anonymiser les notes clients (garder le texte, effacer l'identité)
      await pool.query(
        `UPDATE client_notes SET client_email=NULL, client_name='[Compte supprimé]'
         WHERE LOWER(client_email)=LOWER($1)`,
        [email]
      );
    }

    // 4. Supprimer le compte global (données nominatives effacées)
    await pool.query('DELETE FROM global_clients WHERE id=$1', [gid]);

    res.json({ ok: true, message: 'Votre compte a été supprimé. Vos données de transaction sont conservées par les commerçants.' });
  } catch(e) {
    console.error('[DELETE ACCOUNT]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.globalClientAuth = globalClientAuth;
