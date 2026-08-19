// src/routes/global-clients/change-credentials.js — nouveaux flows OTP :
// /me/change-email[+/confirm], /me/change-password[+/confirm]
const { pool } = require('../../db');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const { sendVerificationEmail } = require('../../utils/email');
const { clientOrGlobalClientAuth, saveCode, getCode, deleteCode } = require('./helpers');
const { cascadeEmailChange } = require('../../utils/clientCascade');

module.exports = function attachChangeCredentialsRoutes(router) {
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

      const code = String(crypto.randomInt(100000, 1000000));
      await saveCode(`gc_chg_email_${gid}`, code, { newEmail: raw }, 15);

      // Envoi asynchrone à l'ancien email — authentifie le propriétaire
      setImmediate(() => sendVerificationEmail(
        currentEmail, code,
        'Confirmez le changement de votre email — Salon DZ',
        'email'
      ).catch(e => console.error('[EMAIL gc change-email]', e.message)));

      res.json({ ok: true, sent_to: currentEmail });
    } catch (e) {
      console.error('[gc change-email]', e);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /me/change-email/confirm — valide le code + applique le changement
  // Body: { code } — re-check anti-race sur l'unicité avant update.
  // ─────────────────────────────────────────────────────────────────────────────
  router.post('/me/change-email/confirm', clientOrGlobalClientAuth, async (req, res) => {
    const gid  = req.globalClient.globalClientId;
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Code requis.' });

    const rec = await getCode(`gc_chg_email_${gid}`);
    if (!rec) return res.status(400).json({ error: 'Code invalide ou expiré.' });
    if (rec.code.trim() !== code) return res.status(400).json({ error: 'Code incorrect.' });

    const newEmail = rec.data.newEmail;

    // Toute l'operation tourne dans une seule transaction SQL atomique :
    // si la cascade echoue (ex: conflit UNIQUE par-merchant), on rollback
    // global_clients/client_accounts pour eviter un etat incoherent.
    const client = await pool.connect();
    try {
      // Re-verif anti-race AVANT BEGIN (lecture simple)
      const { rows: dup } = await client.query(
        'SELECT id FROM global_clients WHERE LOWER(email)=LOWER($1) AND id<>$2',
        [newEmail, gid]
      );
      if (dup.length) {
        await deleteCode(`gc_chg_email_${gid}`);
        return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre compte.' });
      }

      // Recupere l'email courant pour cibler la cascade
      const { rows: cur } = await client.query(
        'SELECT email FROM global_clients WHERE id=$1', [gid]
      );
      if (!cur.length) return res.status(404).json({ error: 'Compte introuvable.' });
      const oldEmail = cur[0].email;

      await client.query('BEGIN');
      try {
        // 1. Compte global
        await client.query(
          'UPDATE global_clients SET email=$1, updated_at=NOW() WHERE id=$2',
          [newEmail, gid]
        );
        // 2. Fiches par-merchant
        await client.query(
          'UPDATE client_accounts SET email=LOWER($1) WHERE global_client_id=$2',
          [newEmail, gid]
        );
        // 3. Cascade : fidelite, credits, vouchers, codes parrainage,
        //    historique transactions/RDV/notes/usages promo. Multi-tenant
        //    scope les UPDATE aux user_id ou ce global_client a un compte.
        const cascadeReport = await cascadeEmailChange(client, { gcId: gid, oldEmail, newEmail });
        await client.query('COMMIT');

        await deleteCode(`gc_chg_email_${gid}`);
        return res.json({ ok: true, new_email: newEmail, cascade: cascadeReport });
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        // Conflit UNIQUE detecte par le helper : message clair + 409
        if (txErr.code === 'CASCADE_CONFLICT') {
          return res.status(409).json({
            error: txErr.message,
            code: 'CASCADE_CONFLICT',
            conflicts: txErr.conflicts || [],
          });
        }
        // Conflit UNIQUE PG natif (cas extreme) -> 409
        if (txErr.code === '23505') {
          return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre compte.' });
        }
        throw txErr;
      }
    } catch (e) {
      console.error('[gc change-email confirm]', e);
      return res.status(500).json({ error: 'Erreur serveur.' });
    } finally {
      client.release();
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

      const code    = String(crypto.randomInt(100000, 1000000));
      const newHash = await bcrypt.hash(new_password, 10);
      await saveCode(`gc_chg_pwd_${gid}`, code, { newHash }, 15);

      setImmediate(() => sendVerificationEmail(
        rows[0].email, code,
        'Confirmez le changement de votre mot de passe — Salon DZ',
        'password'
      ).catch(e => console.error('[EMAIL gc change-pwd]', e.message)));

      res.json({ ok: true, sent_to: rows[0].email });
    } catch (e) {
      console.error('[gc change-password]', e);
      res.status(500).json({ error: 'Erreur serveur.' });
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
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });
};
