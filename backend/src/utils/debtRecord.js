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

/**
 * Restaure les dettes orphelines au moment d'un re-register (anti-fuite).
 * Si l'email du nouveau compte global_client matche un debt_record 'open',
 * on rattache la creance au nouveau compte (recree client_accounts + restore
 * client_credits avec balance negative) puis on supprime le debt_record du
 * registre (sa raison d'etre = client introuvable, or il vient de revenir).
 *
 * Empeche un client de fuir sa dette en supprimant son compte puis en se
 * recreant avec le meme email (Google OAuth ou register classique).
 *
 * @param {pg.PoolClient|pg.Pool} client - PG client (transaction OUVERTE recommandee)
 * @param {object} params
 *   - gcId  : id du nouveau global_client juste cree
 *   - email : email du compte (lowercase recommande)
 * @returns {object} { restored: number, merchants: [{merchant_id, merchant_name, amount}] }
 */
async function restoreOrphanDebts(client, { gcId, email }) {
  if (!gcId || !email) return { restored: 0, merchants: [] };

  // Trouve les dettes orphelines pour cet email (toutes merchants confondus)
  const { rows: debts } = await client.query(
    `SELECT mdr.id, mdr.user_id, mdr.debt_amount, mdr.original_credit_id,
            mdr.client_first_name, mdr.client_last_name, mdr.client_phone,
            u.business_name AS merchant_name
       FROM merchant_debt_records mdr
       JOIN users u ON u.id = mdr.user_id
      WHERE LOWER(mdr.client_email) = LOWER($1) AND mdr.status = 'open'`,
    [email]
  );
  if (!debts.length) return { restored: 0, merchants: [] };

  // Recup nom/phone depuis le nouveau compte global pour eventuel fallback
  const { rows: gc } = await client.query(
    `SELECT first_name, last_name, phone, phone_e164 FROM global_clients WHERE id=$1`,
    [gcId]
  );
  const newAccount = gc[0] || {};

  const restoredMerchants = [];
  for (const debt of debts) {
    // 1. S'assurer qu'une fiche client_accounts existe pour ce merchant + liee
    //    au nouveau gcId. Si absente : creer. Si presente mais pas liee : lier.
    const { rows: existingCa } = await client.query(
      `SELECT id FROM client_accounts WHERE user_id=$1 AND LOWER(email)=LOWER($2)`,
      [debt.user_id, email]
    );
    let clientAccountId;
    if (existingCa.length) {
      clientAccountId = existingCa[0].id;
      await client.query(
        `UPDATE client_accounts SET global_client_id=$1, updated_at=NOW()
          WHERE id=$2 AND (global_client_id IS NULL OR global_client_id<>$1)`,
        [gcId, clientAccountId]
      );
    } else {
      const { rows: newCa } = await client.query(
        `INSERT INTO client_accounts
           (user_id, email, first_name, last_name, phone, phone_e164, global_client_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [
          debt.user_id, email,
          newAccount.first_name || debt.client_first_name || null,
          newAccount.last_name  || debt.client_last_name  || null,
          newAccount.phone      || debt.client_phone      || null,
          newAccount.phone_e164 || null,
          gcId,
        ]
      );
      clientAccountId = newCa[0].id;
    }

    // 2. Restaurer la dette dans client_credits (balance negative).
    //    UPSERT : si une ligne existe deja (cas edge), on s'assure que la
    //    balance reflete bien la dette restauree.
    await client.query(
      `INSERT INTO client_credits (user_id, client_email, client_name, balance)
       VALUES ($1, LOWER($2), $3, $4)
       ON CONFLICT (user_id, client_email) DO UPDATE SET
         balance = client_credits.balance + $4,
         client_name = COALESCE(client_credits.client_name, $3),
         updated_at = NOW()`,
      [
        debt.user_id, email,
        [debt.client_first_name, debt.client_last_name].filter(Boolean).join(' ') || email,
        -Math.abs(parseFloat(debt.debt_amount)),
      ]
    );

    // 3. Supprimer le debt_record (la creance est portee par client_credits
    //    desormais, plus besoin de garder les coordonnees du snapshot).
    await client.query(
      `DELETE FROM merchant_debt_records WHERE id=$1`,
      [debt.id]
    );

    restoredMerchants.push({
      merchant_id:   debt.user_id,
      merchant_name: debt.merchant_name,
      amount:        Math.abs(parseFloat(debt.debt_amount)),
    });
  }

  return { restored: restoredMerchants.length, merchants: restoredMerchants };
}

module.exports = {
  recordDebtSnapshot,
  snapshotAllDebtsForGlobalClient,
  snapshotDebtForLocalClient,
  purgeExpiredDebtRecords,
  computeRetentionDate,
  restoreOrphanDebts,
};
