const jwt = require('jsonwebtoken');
const { pool } = require('../../db');

module.exports = function attachClientProfileRoutes(router) {
  // GET /:slug/client/appointments — liste RDV du client connecté
  router.get('/:slug/client/appointments', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Non authentifié.' });
      // AUDIT #17 : filtre is_enabled (cohérence désactivation).
      const { rows: biz } = await pool.query(
        'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE', [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const userId = biz[0].user_id;
      let decoded;
      try { decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET); }
      catch { return res.status(401).json({ error: 'Token invalide.' }); }
      if (decoded.scope !== 'client' || decoded.merchantId !== userId)
        return res.status(403).json({ error: 'Accès refusé.' });

      // Récupérer l'email du client pour filtrer les RDV
      // On cherche d'abord dans client_accounts, puis dans global_clients
      // → garantit la traçabilité même si le commerçant a supprimé la fiche locale
      let clientEmail = null;

      // 1. Chercher l'email via client_accounts (fiche locale peut encore exister)
      const { rows: localRows } = await pool.query(
        'SELECT email FROM client_accounts WHERE id=$1',
        [decoded.clientId]
      );
      if (localRows[0]?.email) {
        clientEmail = localRows[0].email;
      }

      // 2. Sinon chercher via le compte global (si fiche locale supprimée)
      if (!clientEmail && decoded.globalClientId) {
        const { rows: gcRows } = await pool.query(
          'SELECT email FROM global_clients WHERE id=$1',
          [decoded.globalClientId]
        );
        if (gcRows[0]?.email) clientEmail = gcRows[0].email;
      }

      if (!clientEmail) return res.json([]);

      const { rows } = await pool.query(
        `SELECT a.id, a.status, a.notes, a.paid, a.paid_method,
                a.client_name, a.client_email, a.client_phone, a.cancel_reason,
                a.discount_amount, a.service_id, a.employee_id, a.client_id,
                TO_CHAR(a.date,        'YYYY-MM-DD') AS date,
                TO_CHAR(a.start_time,  'HH24:MI')    AS start_time,
                TO_CHAR(a.end_time,    'HH24:MI')    AS end_time,
                a.duration_minutes, a.created_at, a.updated_at,
                bs.name  AS service_name,
                bs.color AS service_color,
                bs.price AS service_price,
                e.name   AS employee_name
         FROM appointments a
         LEFT JOIN booking_services bs ON bs.id = a.service_id
         LEFT JOIN employees e ON e.id = a.employee_id
         WHERE a.user_id=$1 AND LOWER(a.client_email)=LOWER($2)
         ORDER BY a.date DESC, a.start_time DESC`,
        [userId, clientEmail]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // PUT /:slug/client/appointments/:id/cancel
  router.put('/:slug/client/appointments/:id/cancel', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Non authentifié.' });
      let decoded;
      try { decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET); }
      catch { return res.status(401).json({ error: 'Token invalide.' }); }
      if (decoded.scope !== 'client') return res.status(403).json({ error: 'Accès refusé.' });

      // ── Résoudre le merchant + politique d'annulation + coordonnées ──────
      const { rows: bizRows } = await pool.query(
        `SELECT u.id AS user_id, u.business_name, u.phone AS merchant_phone, u.address AS merchant_address,
                COALESCE(bs.cancellation_policy_hours, 2) AS policy_hours,
                COALESCE(bs.timezone, 'Europe/Paris') AS timezone
         FROM users u
         LEFT JOIN booking_settings bs ON bs.user_id = u.id
         WHERE (bs.slug = $1 OR u.id = $2)
         LIMIT 1`,
        [req.params.slug, decoded.merchantId]
      );
      if (!bizRows.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const biz = bizRows[0];
      const policyHours = parseInt(biz.policy_hours);

      // ── Résoudre l'email du client (robuste aux suppressions de fiches) ──
      let clientEmail = null;
      const { rows: localRows } = await pool.query(
        'SELECT email FROM client_accounts WHERE id=$1', [decoded.clientId]
      );
      if (localRows[0]?.email) clientEmail = localRows[0].email;
      if (!clientEmail && decoded.globalClientId) {
        const { rows: gcRows } = await pool.query(
          'SELECT email FROM global_clients WHERE id=$1', [decoded.globalClientId]
        );
        if (gcRows[0]?.email) clientEmail = gcRows[0].email;
      }
      if (!clientEmail) return res.status(401).json({ error: 'Session client invalide.' });

      // ── Vérifier que le RDV appartient à ce client (via email, pas client_id)
      const { rows: check } = await pool.query(
        `SELECT id, date, start_time, status
         FROM appointments
         WHERE id=$1 AND user_id=$2
           AND LOWER(COALESCE(client_email,'')) = LOWER($3)`,
        [req.params.id, biz.user_id, clientEmail]
      );
      if (!check.length) return res.status(404).json({ error: 'RDV introuvable.' });
      const appt = check[0];
      if (appt.status === 'cancelled') return res.status(400).json({ error: 'Ce RDV est déjà annulé.' });
      if (appt.status !== 'confirmed' && appt.status !== 'pending')
        return res.status(400).json({ error: 'Ce RDV ne peut plus être annulé.' });

      // ── Politique d'annulation merchant-driven ──────────────────────────
      // policy_hours=0 → annulation possible à tout moment
      // sinon → doit être plus de N heures avant le RDV
      // AUDIT booking #24 : diff calculée en UTC via TZ merchant (gère DST).
      const dateStr = typeof appt.date === 'string'
        ? appt.date.substring(0, 10)
        : new Date(appt.date).toISOString().substring(0, 10);
      const timeStr = typeof appt.start_time === 'string'
        ? appt.start_time.substring(0, 5)
        : '00:00';
      const { rows: tzDiff } = await pool.query(
        `SELECT EXTRACT(EPOCH FROM (($1::date + $2::time) AT TIME ZONE $3 - NOW())) / 3600 AS diff_hours`,
        [dateStr, timeStr, biz.timezone]
      );
      const diffHours = parseFloat(tzDiff[0].diff_hours);
      if (policyHours > 0 && diffHours < policyHours) {
        const labelHours = policyHours < 24 ? `${policyHours}h`
                                            : `${Math.round(policyHours/24)} jour${policyHours>=48?'s':''}`;
        return res.status(400).json({
          error: `Annulation en ligne impossible : le rendez-vous commence dans moins de ${labelHours}.`,
          code: 'TOO_LATE',
          policy_hours:     policyHours,
          business_name:    biz.business_name || null,
          merchant_phone:   biz.merchant_phone || null,
          merchant_address: biz.merchant_address || null,
        });
      }

      // ── Annulation effective ────────────────────────────────────────────
      const { rows } = await pool.query(
        `UPDATE appointments SET status='cancelled', cancel_reason=$1, updated_at=NOW()
         WHERE id=$2 AND user_id=$3
           AND LOWER(COALESCE(client_email,'')) = LOWER($4)
         RETURNING id, client_name,
           TO_CHAR(date, 'YYYY-MM-DD') as date,
           TO_CHAR(start_time, 'HH24:MI') as start_time,
           TO_CHAR(end_time,   'HH24:MI') as end_time,
           status, cancel_reason, updated_at`,
        [req.body.reason || 'Annulé par le client', req.params.id, biz.user_id, clientEmail]
      );
      // Cascade parrainage : referral_use pending → cancelled
      if (rows.length) {
        await pool.query(
          `UPDATE referral_uses SET status='cancelled'
            WHERE user_id=$1 AND appointment_id=$2 AND status='pending'`,
          [biz.user_id, req.params.id]
        ).catch(() => {});
      }
      if (!rows.length) return res.status(404).json({ error: 'RDV introuvable ou déjà annulé.' });
      res.json(rows[0]);
    } catch (e) { console.error('[CANCEL]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // ── PUT /:slug/client/profile ── mise à jour du profil client ───────────
  router.put('/:slug/client/profile', async (req, res) => {
    try {
      // Auth via Authorization header ou x-client-token
      const rawToken = req.headers['x-client-token']
        || (req.headers.authorization || '').replace('Bearer ', '');
      if (!rawToken) return res.status(401).json({ error: 'Non authentifié.' });
      let decoded;
      try { decoded = jwt.verify(rawToken, process.env.JWT_SECRET); }
      catch { return res.status(401).json({ error: 'Token invalide.' }); }

      const { slug } = req.params;
      // Email volontairement NON modifiable ici. Le changement d'email passe
      // par POST /api/global-clients/me/change-email (code envoyé à l'email
      // actuel). On accepte le champ pour backcompat mais on l'ignore.
      const { first_name, last_name, phone, birth_date, postal_code, city, marketing_opt_in } = req.body;
      if (!first_name?.trim() || !last_name?.trim()) {
        return res.status(400).json({ error: 'Prénom et nom sont requis.' });
      }
      // Audit Z : opt-in marketing peut être basculé depuis le profil client.
      // undefined = ne pas toucher. true/false = MAJ explicite.
      const optInParam = marketing_opt_in === undefined ? undefined
                       : (marketing_opt_in === true || marketing_opt_in === 'true');

      // birth_date : accepte YYYY-MM-DD ou YYYY-MM (= 1er du mois), vide = null,
      // undefined = ne pas modifier. L'anti-fraude cron check 'last_birthday_reward_at'
      // (330 jours rolling) se charge d'empêcher la triche par changement de date.
      let bdParam; // undefined = pas de modif
      if (birth_date === '' || birth_date === null) bdParam = null;
      else if (typeof birth_date === 'string') {
        const s = birth_date.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s))      bdParam = s;
        else if (/^\d{4}-\d{2}$/.test(s))       bdParam = s + '-01';
      }

      // Le token client contient clientId (= client_accounts.id)
      // Mettre à jour directement client_accounts (email exclu volontairement)
      const sets = ['first_name = $1', 'last_name = $2', 'phone = $3'];
      const vals = [first_name.trim(), last_name.trim(), phone?.trim() || null];
      let idx = 4;
      if (bdParam !== undefined) { sets.push(`birth_date = $${idx++}`); vals.push(bdParam); }
      // postal_code / city : undefined = ne pas toucher, '' / null = effacer
      const pcParam = postal_code === undefined ? undefined
                    : (postal_code === null || postal_code === '' ? null : String(postal_code).trim().slice(0,20));
      const cityParam = city === undefined ? undefined
                      : (city === null || city === '' ? null : String(city).trim().slice(0,120));
      if (pcParam   !== undefined) { sets.push(`postal_code = $${idx++}`); vals.push(pcParam); }
      if (cityParam !== undefined) { sets.push(`city = $${idx++}`);         vals.push(cityParam); }
      if (optInParam !== undefined) {
        sets.push(`marketing_opt_in = $${idx++}`); vals.push(optInParam);
        sets.push(`marketing_opt_in_at = CASE WHEN $${idx-1} THEN NOW() ELSE NULL END`);
      }
      vals.push(decoded.clientId);
      const updated = await pool.query(
        `UPDATE client_accounts SET ${sets.join(', ')} WHERE id = $${idx}
         RETURNING id, first_name, last_name, email, phone, birth_date, postal_code, city, marketing_opt_in`,
        vals
      );
      if (!updated.rows.length) return res.status(404).json({ error: 'Compte introuvable.' });

      // Sync global_clients + TOUTES les fiches locales liées (autres commerçants).
      // Sans le fan-out, le cron anniversaire de chaque commerçant lirait une
      // birth_date obsolète → plusieurs promos manquées. Email exclu (passe par
      // /change-email).
      try {
        const { rows: gc } = await pool.query(
          'SELECT global_client_id FROM client_accounts WHERE id=$1', [decoded.clientId]
        );
        if (gc[0]?.global_client_id) {
          const gcId = gc[0].global_client_id;
          const gcSets = ['first_name=$1', 'last_name=$2', 'phone=$3'];
          const gcVals = [first_name.trim(), last_name.trim(), phone?.trim()||null];
          let gi = 4;
          if (bdParam   !== undefined) { gcSets.push(`birth_date=$${gi++}`);  gcVals.push(bdParam); }
          if (pcParam   !== undefined) { gcSets.push(`postal_code=$${gi++}`); gcVals.push(pcParam); }
          if (cityParam !== undefined) { gcSets.push(`city=$${gi++}`);        gcVals.push(cityParam); }
          gcVals.push(gcId);
          await pool.query(
            `UPDATE global_clients SET ${gcSets.join(', ')} WHERE id=$${gi}`,
            gcVals
          );
          // Fan-out vers les autres fiches locales (même global_client_id,
          // autres commerçants). Exclut la fiche actuelle déjà mise à jour.
          const faSets = ['first_name=$1', 'last_name=$2', 'phone=$3'];
          const faVals = [first_name.trim(), last_name.trim(), phone?.trim()||null];
          let fi = 4;
          if (bdParam   !== undefined) { faSets.push(`birth_date=$${fi++}`);  faVals.push(bdParam); }
          if (pcParam   !== undefined) { faSets.push(`postal_code=$${fi++}`); faVals.push(pcParam); }
          if (cityParam !== undefined) { faSets.push(`city=$${fi++}`);        faVals.push(cityParam); }
          faVals.push(gcId, decoded.clientId);
          await pool.query(
            `UPDATE client_accounts SET ${faSets.join(', ')}
              WHERE global_client_id=$${fi++} AND id<>$${fi}`,
            faVals
          );
        }
      } catch(_) {}

      res.json(updated.rows[0]);
    } catch (e) {
      console.error('PUT /client/profile:', e);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });

  // ── DELETE /:slug/client/account — suppression définitive avec anonymisation
  // Logique métier:
  // 1. Résoudre le client via son token (client_accounts + global_clients)
  // 2. Annuler tous les RDV futurs (confirmed/pending) avec raison "Compte supprimé"
  // 3. Anonymiser les RDV passés: client_name→"Client anonyme", client_email/phone→NULL
  //    Garde le lien avec appointments pour la comptabilité du merchant.
  // 4. Supprimer toutes les fiches client_accounts liées au globalClientId du token
  // 5. Supprimer le global_clients
  // 6. Les transactions restent intactes (elles ne contiennent aucune donnée personnelle)
  router.delete('/:slug/client/account', async (req, res) => {
    const client = await pool.connect();
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Non authentifié.' });
      let decoded;
      try { decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET); }
      catch { return res.status(401).json({ error: 'Token invalide.' }); }
      if (decoded.scope !== 'client') return res.status(403).json({ error: 'Accès refusé.' });

      // Résoudre email + globalClientId (robuste aux fiches locales supprimées)
      let clientEmail = null;
      let gcId = decoded.globalClientId || null;
      {
        const { rows: loc } = await client.query(
          'SELECT email, global_client_id FROM client_accounts WHERE id=$1',
          [decoded.clientId]
        );
        if (loc[0]) {
          clientEmail = loc[0].email || null;
          if (!gcId) gcId = loc[0].global_client_id;
        }
        if (!clientEmail && gcId) {
          const { rows: gc } = await client.query('SELECT email FROM global_clients WHERE id=$1', [gcId]);
          clientEmail = gc[0]?.email || null;
        }
      }
      if (!clientEmail) return res.status(400).json({ error: 'Compte introuvable.' });

      const emailLow = clientEmail.toLowerCase();

      await client.query('BEGIN');

      // 1. Annuler RDV futurs
      const { rowCount: cancelledFuture } = await client.query(
        `UPDATE appointments SET status='cancelled',
           cancel_reason='Compte client supprimé',
           updated_at=NOW()
         WHERE LOWER(client_email)=$1
           AND status IN ('confirmed','pending')
           AND date >= CURRENT_DATE`,
        [emailLow]
      );
      // Cascade parrainage : annuler les referral_uses pending du filleul
      await client.query(
        `UPDATE referral_uses SET status='cancelled'
          WHERE LOWER(filleul_email)=$1 AND status='pending'`,
        [emailLow]
      ).catch(() => {});

      // 2. Anonymiser TOUS les appointments du client (passés + futurs annulés)
      const { rowCount: anonymized } = await client.query(
        `UPDATE appointments SET
           client_id    = NULL,
           client_name  = 'Client anonyme',
           client_email = NULL,
           client_phone = NULL
         WHERE LOWER(client_email)=$1`,
        [emailLow]
      );

      // 3. Anonymiser les logs promo associés (traçabilité merchant conservée)
      await client.query(
        `UPDATE promo_usage_logs SET client_email=NULL, client_name='Client anonyme'
         WHERE LOWER(client_email)=$1`,
        [emailLow]
      ).catch(() => {});

      // 4. Supprimer toutes les fiches locales liées au compte global
      if (gcId) {
        await client.query('DELETE FROM client_accounts WHERE global_client_id=$1', [gcId]);
        await client.query('DELETE FROM global_clients WHERE id=$1', [gcId]);
      } else {
        // Fallback sans globalClientId: suppression fiche unique
        await client.query('DELETE FROM client_accounts WHERE id=$1', [decoded.clientId]);
      }

      // 5. Supprimer fiches locales restantes pour sécurité (cas rare de fiches orphelines)
      await client.query('DELETE FROM client_accounts WHERE LOWER(email)=$1', [emailLow]);

      await client.query('COMMIT');
      console.log(`[ACCOUNT DELETE] email=${emailLow} cancelledFuture=${cancelledFuture} anonymized=${anonymized}`);

      res.json({
        ok: true,
        cancelled_future_appointments: cancelledFuture,
        anonymized_appointments: anonymized,
        message: 'Compte supprimé et données anonymisées.',
      });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[ACCOUNT DELETE ERR]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    } finally { client.release(); }
  });
};
