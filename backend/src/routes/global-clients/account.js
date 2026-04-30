// src/routes/global-clients/account.js — RGPD :
// DELETE /me (suppression complète) + GET /me/export (portabilité)
const { pool } = require('../../db');
const { globalClientAuth, clientOrGlobalClientAuth } = require('./helpers');
const { snapshotAllDebtsForGlobalClient } = require('../../utils/debtRecord');

module.exports = function attachAccountRoutes(router) {
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
        'SELECT email, first_name, last_name, phone FROM global_clients WHERE id=$1', [gid]
      );
      if (!gcRows.length) return res.status(404).json({ error: 'Compte introuvable.' });
      const { email, first_name, last_name, phone } = gcRows[0];

      let snapshotReport = { snapshotted: 0 };
      await dbClient.query('BEGIN');
      try {
        // 0. AVANT toute anonymisation : snapshot des dettes (balance < 0)
        // dans merchant_debt_records pour permettre le recouvrement legal
        // (Art. 17.3.e RGPD). Coordonnees conservees EN CLAIR 2 ans.
        snapshotReport = await snapshotAllDebtsForGlobalClient(dbClient, {
          gcId: gid,
          person: { first_name, last_name, email, phone },
        });
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

      console.log(`[RGPD] Suppression compte ${gid} — email anonymisé, ${snapshotReport.snapshotted} dette(s) archivee(s)`);
      res.json({
        ok: true,
        message: snapshotReport.snapshotted > 0
          ? `Votre compte et vos données personnelles ont été supprimés. ${snapshotReport.snapshotted} créance(s) (dette(s)) en cours ont été archivées chez le(s) commerçant(s) concerné(s) à des fins de recouvrement (RGPD Art. 17.3.e — conservation 2 ans).`
          : 'Votre compte et vos données personnelles ont été supprimés. Les historiques de transactions sont conservés de façon anonyme pour la comptabilité des commerçants.',
        debts_recorded: snapshotReport.snapshotted,
      });
    } catch(e) {
      console.error('[DELETE ACCOUNT]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    } finally {
      dbClient.release();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/global-clients/me/credits-summary — Resume credits/dettes par
  // commercant. Utilise par le frontend AVANT DELETE /me pour afficher un
  // avertissement clair :
  //   - credits positifs : "vous avez X € chez Y, ce credit sera abandonne"
  //   - dettes negatives : "vous avez -X € chez Y, vos coordonnees seront
  //     conservees 2 ans pour le recouvrement"
  // Accepte les deux scopes (global_client + client).
  // ─────────────────────────────────────────────────────────────────────────────
  router.get('/me/credits-summary', clientOrGlobalClientAuth, async (req, res) => {
    try {
      const gid = req.globalClient.globalClientId;
      const { rows: gc } = await pool.query(
        'SELECT email FROM global_clients WHERE id=$1', [gid]
      );
      const email = gc[0]?.email;
      if (!email) return res.json({ credits: [], debts: [] });

      // Multi-tenant scope : seuls les merchants ou ce global_client a une fiche.
      const { rows } = await pool.query(
        `SELECT cc.balance, u.business_name AS merchant_name, u.id AS merchant_id
           FROM client_credits cc
           JOIN users u ON u.id = cc.user_id
          WHERE LOWER(cc.client_email) = LOWER($1)
            AND cc.balance <> 0
            AND cc.user_id IN (
              SELECT user_id FROM client_accounts WHERE global_client_id = $2
            )`,
        [email, gid]
      );

      const credits = rows
        .filter(r => parseFloat(r.balance) > 0)
        .map(r => ({
          merchant_id:   r.merchant_id,
          merchant_name: r.merchant_name,
          amount:        parseFloat(r.balance),
        }));
      const debts = rows
        .filter(r => parseFloat(r.balance) < 0)
        .map(r => ({
          merchant_id:   r.merchant_id,
          merchant_name: r.merchant_name,
          amount:        Math.abs(parseFloat(r.balance)),
        }));
      res.json({ credits, debts });
    } catch (e) {
      console.error('[GET /me/credits-summary]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
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
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });
};
