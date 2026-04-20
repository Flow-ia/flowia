// src/routes/global-clients/referral.js — parrainage client :
// /me/referral-code/:slug, /me/referral-history/:slug, /pub/:slug/referral-program
const { pool } = require('../../db');
const { clientOrGlobalClientAuth } = require('./helpers');

module.exports = function attachReferralRoutes(router) {
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
        const { genReferralCode } = require('../referrals');
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
    } catch(e) { console.error('[REF MY-CODE]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
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
    } catch(e) { console.error('[REF HISTORY]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
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
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });
};
