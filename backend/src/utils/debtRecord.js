// src/utils/debtRecord.js
// Gestion du registre de creances pour le recouvrement RGPD-conforme
// (Art. 17.3.e : conservation des donnees necessaires a la defense de droits
// en justice, meme apres une demande d'effacement).
//
// 2 ans de retention par defaut (delai de prescription L218-2 Code de la
// consommation pour creance pro -> particulier en France).
'use strict';

const RETENTION_YEARS = 2;

/**
 * Calcule la date au-dela de laquelle un debt_record peut etre purge.
 */
function computeRetentionDate(years = RETENTION_YEARS) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  // YYYY-MM-DD pour colonne DATE
  return d.toISOString().slice(0, 10);
}

/**
 * Snapshot une dette dans merchant_debt_records.
 * @param {pg.PoolClient} client - client PG dans une transaction OUVERTE
 * @param {object} params
 *   - merchantId : user_id (commercant)
 *   - person     : { first_name, last_name, email, phone }
 *   - amount     : montant positif de la dette (Math.abs si balance negative)
 *   - origin     : raison ('Crédit non remboursé...' / 'Suppression fiche par commercant')
 *   - originCreditId : optionnel, lien soft vers client_credits.id
 */
async function recordDebtSnapshot(client, { merchantId, person, amount, origin, originCreditId }) {
  if (!merchantId)               throw new Error('merchantId requis');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount > 0 requis');
  const retention = computeRetentionDate();
  const { rows } = await client.query(
    `INSERT INTO merchant_debt_records
       (user_id, client_first_name, client_last_name, client_email, client_phone,
        debt_amount, debt_origin, original_credit_id, retention_until)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, recorded_at, retention_until`,
    [
      merchantId,
      person?.first_name || null,
      person?.last_name  || null,
      person?.email      || null,
      person?.phone      || null,
      Math.abs(amount),
      origin || 'Dette client non soldée',
      originCreditId || null,
      retention,
    ]
  );
  return rows[0];
}

/**
 * Pour un global_client donné, parcourt tous ses client_credits avec balance < 0
 * et snapshote chaque dette. Renvoie le nombre de records crees.
 * Utilise par DELETE /api/global-clients/me.
 */
async function snapshotAllDebtsForGlobalClient(client, { gcId, person }) {
  if (!gcId) return { snapshotted: 0 };
  if (!person?.email) return { snapshotted: 0 };
  // On cible les credits chez les merchants ou ce global_client a une fiche
  // (multi-tenant : on ne touche pas a un merchant ou il n'aurait jamais eu
  // de fiche, meme si l'email apparait par hasard).
  const { rows } = await client.query(
    `SELECT cc.id, cc.user_id, cc.balance
       FROM client_credits cc
      WHERE LOWER(cc.client_email) = LOWER($1)
        AND cc.balance < 0
        AND cc.user_id IN (
          SELECT user_id FROM client_accounts WHERE global_client_id = $2
        )`,
    [person.email, gcId]
  );
  let count = 0;
  for (const row of rows) {
    await recordDebtSnapshot(client, {
      merchantId: row.user_id,
      person,
      amount: Math.abs(parseFloat(row.balance)),
      origin: "Crédit non remboursé au moment de la suppression du compte client (RGPD)",
      originCreditId: row.id,
    });
    count++;
  }
  return { snapshotted: count };
}

/**
 * Snapshot la dette d'un client local (client_account) chez UN merchant donné.
 * Utilise par DELETE /api/clients/:id (cote commercant).
 */
async function snapshotDebtForLocalClient(client, { merchantId, clientAccountId }) {
  // Recupere les coordonnees du client local + son credit eventuel
  const { rows: rows1 } = await client.query(
    `SELECT first_name, last_name, email, phone
       FROM client_accounts
      WHERE id = $1 AND user_id = $2`,
    [clientAccountId, merchantId]
  );
  if (!rows1.length) return { snapshotted: 0 };
  const person = rows1[0];
  if (!person.email) return { snapshotted: 0 }; // pas d'email -> pas de credit traceable
  const { rows: rows2 } = await client.query(
    `SELECT id, balance FROM client_credits
      WHERE user_id = $1 AND LOWER(client_email) = LOWER($2) AND balance < 0`,
    [merchantId, person.email]
  );
  if (!rows2.length) return { snapshotted: 0 };
  let count = 0;
  for (const row of rows2) {
    await recordDebtSnapshot(client, {
      merchantId,
      person,
      amount: Math.abs(parseFloat(row.balance)),
      origin: "Suppression de fiche par le commerçant — dette à recouvrer",
      originCreditId: row.id,
    });
    count++;
  }
  return { snapshotted: count };
}

/**
 * Purge auto : supprime les records 'open' dont retention_until est depassee.
 * Les records 'paid' sont conservés plus longtemps (preuve du paiement) -- le
 * commercant peut les effacer manuellement via DELETE /debt-records/:id.
 */
async function purgeExpiredDebtRecords(pool) {
  const { rowCount } = await pool.query(
    `DELETE FROM merchant_debt_records
      WHERE status = 'open' AND retention_until < CURRENT_DATE`
  );
  return rowCount || 0;
}

module.exports = {
  recordDebtSnapshot,
  snapshotAllDebtsForGlobalClient,
  snapshotDebtForLocalClient,
  purgeExpiredDebtRecords,
  computeRetentionDate,
};
