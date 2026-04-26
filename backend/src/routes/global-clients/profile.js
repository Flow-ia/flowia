// src/routes/global-clients/profile.js — GET /me, PATCH /me, PUT /me,
// POST /change-password (LEGACY, conservé pour backcompat).
const { pool } = require('../../db');
const bcrypt   = require('bcryptjs');
const { globalClientAuth } = require('./helpers');
const { validatePhone } = require('../../utils/phone');
const { parseBirthDate } = require('../../utils/birthDate');

module.exports = function attachProfileRoutes(router) {
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
    } catch(e) { console.error('[gc]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH /me — mise à jour partielle du profil (birth_date, phone…)
  // ─────────────────────────────────────────────────────────────────────────────
  router.patch('/me', globalClientAuth, async (req, res) => {
    try {
      const { birth_date, phone, first_name, last_name, postal_code, city } = req.body;
      // RGPD commit 20 : si phone fourni, valider en E.164 (PATCH partiel).
      let phoneRawForUpdate  = undefined;
      let phoneE164ForUpdate = undefined;
      if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
        const phoneCheck = validatePhone(phone, { required: true });
        if (!phoneCheck.valid) {
          return res.status(400).json({
            error: 'Numéro de téléphone invalide pour le pays.',
            code:  phoneCheck.error,
          });
        }
        phoneRawForUpdate  = phoneCheck.raw;
        phoneE164ForUpdate = phoneCheck.e164;
      } else if (phone === '' || phone === null) {
        phoneRawForUpdate  = null;
        phoneE164ForUpdate = null;
      }
      // Commit 24a : strict YYYY-MM-01.
      // Sémantique PATCH partielle :
      //   - undefined     → ne pas toucher
      //   - null / ''     → effacer
      //   - YYYY-MM-01    → enregistrer
      //   - tout le reste → 400 BIRTH_DATE_INVALID
      let bd;
      if (birth_date === undefined) bd = undefined;
      else if (birth_date === null || birth_date === '') bd = null;
      else {
        const birthCheck = parseBirthDate(birth_date);
        if (!birthCheck.valid) {
          return res.status(400).json({ error: 'Date de naissance invalide.', code: 'BIRTH_DATE_INVALID' });
        }
        bd = birthCheck.value;
      }
      // postal_code / city : même sémantique que bd (undefined/null/''/string)
      const pc = postal_code === undefined ? undefined
               : (postal_code === null || postal_code === '' ? null : String(postal_code).trim().slice(0,20));
      const ct = city === undefined ? undefined
               : (city === null || city === '' ? null : String(city).trim().slice(0,120));

      const fields = [];
      const vals   = [];
      let i = 1;
      if (bd !== undefined) { fields.push(`birth_date=$${i++}`);  vals.push(bd); }
      if (phoneRawForUpdate !== undefined) {
        fields.push(`phone=$${i++}`);      vals.push(phoneRawForUpdate);
        fields.push(`phone_e164=$${i++}`); vals.push(phoneE164ForUpdate);
      }
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
      if (phoneRawForUpdate !== undefined) {
        await pool.query(
          `UPDATE client_accounts SET phone=$1, phone_e164=$2 WHERE global_client_id=$3`,
          [phoneRawForUpdate, phoneE164ForUpdate, gcId]
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
    } catch(e) { console.error('[GC PATCH /me]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
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
      // RGPD commit 20 : si phone fourni, valider en E.164.
      let phoneRaw  = '';
      let phoneE164 = '';
      if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
        const phoneCheck = validatePhone(phone, { required: true });
        if (!phoneCheck.valid) {
          return res.status(400).json({
            error: 'Numéro de téléphone invalide pour le pays.',
            code:  phoneCheck.error,
          });
        }
        phoneRaw  = phoneCheck.raw  || '';
        phoneE164 = phoneCheck.e164 || '';
      }

      const { rows } = await pool.query(
        `UPDATE global_clients SET
           first_name=COALESCE(NULLIF($2,''), first_name),
           last_name=COALESCE(NULLIF($3,''), last_name),
           phone=COALESCE(NULLIF($4,''), phone),
           phone_e164=COALESCE(NULLIF($5,''), phone_e164),
           updated_at=NOW()
         WHERE id=$1 RETURNING id, email, first_name, last_name, phone, phone_e164`,
        [gid, first_name||'', last_name||'', phoneRaw, phoneE164]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Compte introuvable.' });

      // Synchroniser dans toutes les fiches locales liées
      await pool.query(
        `UPDATE client_accounts SET
           first_name=$2, last_name=$3,
           phone=COALESCE(NULLIF($4,''), phone),
           phone_e164=COALESCE(NULLIF($5,''), phone_e164)
         WHERE global_client_id=$1`,
        [rows[0].id, rows[0].first_name, rows[0].last_name, rows[0].phone||'', rows[0].phone_e164||'']
      );

      res.json(rows[0]);
    } catch(e) { console.error('[gc]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
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
    } catch(e) { console.error('[gc]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
