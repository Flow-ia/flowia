// src/routes/global-clients/auth.js — register, login, activate, forgot/reset-password
const { pool } = require('../../db');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { sendPasswordReset } = require('../../utils/email');
const { isValidEmail, isRealDate, saveCode, getCode, deleteCode } = require('./helpers');
const { validatePhone } = require('../../utils/phone');
const { parseBirthDate } = require('../../utils/birthDate');

module.exports = function attachAuthRoutes(router) {
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
      // RGPD commit 20 : téléphone obligatoire + validé E.164.
      const phoneCheck = validatePhone(phone, { required: true });
      if (!phoneCheck.valid) {
        return res.status(400).json({
          error: phoneCheck.error === 'PHONE_REQUIRED' ? 'Téléphone requis.' : 'Numéro de téléphone invalide pour le pays.',
          code:  phoneCheck.error,
        });
      }
      const phoneRaw  = phoneCheck.raw;
      const phoneE164 = phoneCheck.e164;

      const emailLow = email.toLowerCase().trim();
      // Commit 24a : strict YYYY-MM-01 (mois 01-12, année [-100, -13]).
      const birthCheck = parseBirthDate(birth_date);
      if (!birthCheck.valid) {
        return res.status(400).json({ error: 'Date de naissance invalide.', code: 'BIRTH_DATE_INVALID' });
      }
      const bd = birthCheck.value;

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
             first_name=$2, last_name=$3, phone=$4, phone_e164=$5, password_hash=$6,
             birth_date=COALESCE($7, birth_date),
             is_verified=TRUE, invite_token=NULL, updated_at=NOW()
           WHERE LOWER(email)=$1 RETURNING *`,
          [emailLow, first_name, last_name || '', phoneRaw, phoneE164, hash, bd]
        );
        gc = rows[0];
      } else {
        // Nouveau compte global (s'inscrit sans invitation)
        const { rows } = await pool.query(
          `INSERT INTO global_clients (email, password_hash, first_name, last_name, phone, phone_e164, birth_date, is_verified)
           VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) RETURNING *`,
          [emailLow, hash, first_name, last_name || '', phoneRaw, phoneE164, bd]
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
           phone            = COALESCE(NULLIF($4,''), phone),
           phone_e164       = COALESCE(NULLIF($5,''), phone_e164)
         WHERE LOWER(email) = LOWER($6)`,
        [gc.id, gc.first_name, gc.last_name || '', gc.phone || '', gc.phone_e164 || '', emailLow]
      );

      // Lier aussi par téléphone (fiches sans email mais même téléphone E.164).
      if (phoneE164) {
        await pool.query(
          `UPDATE client_accounts SET
             global_client_id = $1,
             source           = 'platform',
             first_name       = $2,
             last_name        = COALESCE(NULLIF($3,''), last_name),
             phone_e164       = COALESCE(NULLIF($4,''), phone_e164)
           WHERE (phone_e164 = $4 OR phone = $5)
             AND global_client_id IS NULL
             AND (email IS NULL OR email = '' OR LOWER(email) != LOWER($6))`,
          [gc.id, gc.first_name, gc.last_name || '', phoneE164, phoneRaw, emailLow]
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
      res.status(500).json({ error: 'Erreur serveur.' });
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
    } catch(e) { console.error('[gc]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
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
    } catch(e) { console.error('[gc]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

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
      const code = String(crypto.randomInt(100000, 1000000));

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
};
