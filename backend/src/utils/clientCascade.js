// src/utils/clientCascade.js
// Quand un client_global change son email ou son telephone, plusieurs tables
// referencent encore la valeur en denormalise (raison historique : le modele
// par-merchant prefixait l'email comme cle naturelle avant l'arrivee des
// global_clients). Sans cascade, le client perd ses points de fidelite,
// ses credits, ses vouchers parrainage/anniversaire, son code parrainage,
// etc.
//
// Multi-tenant : la cascade est SCOPEE aux user_id (= merchants) ou ce
// global_client a une fiche locale (client_accounts.global_client_id). On
// ne touche jamais les donnees d'un autre client meme s'il a le meme email.
//
// Toutes les fonctions PRENNENT EN PARAMETRE un `client` pg deja en
// transaction (BEGIN deja appele) — l'appelant gere COMMIT/ROLLBACK.
'use strict';

// ── Email ─────────────────────────────────────────────────────────────────────
// Tables avec UNIQUE constraint sur (user_id, client_email) ou similaire :
//   - client_loyalty  : UNIQUE(user_id, client_email)
//   - client_credits  : UNIQUE(user_id, client_email)
//   - promo_codes     : UNIQUE(user_id, owner_client_email) — codes parrainage
// Tables sans UNIQUE (juste denormalise / index) :
//   - client_rewards, client_notes, promo_usage_logs, transactions, appointments

async function getMerchantIdsForClient(client, gcId) {
  const { rows } = await client.query(
    `SELECT DISTINCT user_id FROM client_accounts WHERE global_client_id=$1`,
    [gcId]
  );
  return rows.map(r => r.user_id);
}

/**
 * Pre-check les conflits UNIQUE par-merchant avant de tenter la cascade.
 * Renvoie une liste de conflits humain-lisibles ou [] si OK.
 * Cas concret : Marie a deja une fiche fidelite chez le merchant X avec
 * marie@new.com (cree avant qu'elle lie son compte global). Si elle change
 * marie@old.com -> marie@new.com, le UPDATE client_loyalty echouera.
 */
async function checkEmailConflicts(client, { merchantIds, oldEmail, newEmail }) {
  if (!merchantIds.length) return [];
  const conflicts = [];
  // client_loyalty
  const { rows: loy } = await client.query(
    `SELECT user_id FROM client_loyalty
      WHERE user_id = ANY($1::uuid[])
        AND LOWER(client_email) = LOWER($2)
        AND LOWER(client_email) <> LOWER($3)`,
    [merchantIds, newEmail, oldEmail]
  );
  if (loy.length) conflicts.push(`fidelite (${loy.length} commerce${loy.length > 1 ? 's' : ''})`);
  // client_credits
  const { rows: cre } = await client.query(
    `SELECT user_id FROM client_credits
      WHERE user_id = ANY($1::uuid[])
        AND LOWER(client_email) = LOWER($2)
        AND LOWER(client_email) <> LOWER($3)`,
    [merchantIds, newEmail, oldEmail]
  );
  if (cre.length) conflicts.push(`credits (${cre.length} commerce${cre.length > 1 ? 's' : ''})`);
  // promo_codes (codes parrainage)
  const { rows: pc } = await client.query(
    `SELECT user_id FROM promo_codes
      WHERE user_id = ANY($1::uuid[])
        AND LOWER(owner_client_email) = LOWER($2)
        AND LOWER(owner_client_email) <> LOWER($3)`,
    [merchantIds, newEmail, oldEmail]
  );
  if (pc.length) conflicts.push(`code parrainage (${pc.length} commerce${pc.length > 1 ? 's' : ''})`);
  return conflicts;
}

/**
 * Met a jour la colonne client_email (ou owner_client_email) dans toutes les
 * tables concernees, scope multi-tenant. Renvoie un objet { table: count }
 * pour audit.
 */
async function cascadeEmailChange(client, { gcId, oldEmail, newEmail }) {
  if (!oldEmail || !newEmail) return { skipped: true };
  if (String(oldEmail).toLowerCase() === String(newEmail).toLowerCase()) {
    return { unchanged: true };
  }
  const merchantIds = await getMerchantIdsForClient(client, gcId);
  if (!merchantIds.length) return { merchants: 0 };

  // Pre-check conflits UNIQUE — refuse plutot que de planter PG.
  const conflicts = await checkEmailConflicts(client, { merchantIds, oldEmail, newEmail });
  if (conflicts.length) {
    const err = new Error(
      `Le nouvel email est deja utilise dans : ${conflicts.join(', ')}. ` +
      `Veuillez contacter le support pour fusionner les fiches.`
    );
    err.code = 'CASCADE_CONFLICT';
    err.conflicts = conflicts;
    throw err;
  }

  const counts = {};
  // Helper local pour DRY
  const upd = async (table, col) => {
    const { rowCount } = await client.query(
      `UPDATE ${table} SET ${col}=$1
        WHERE user_id = ANY($2::uuid[])
          AND LOWER(${col}) = LOWER($3)`,
      [newEmail, merchantIds, oldEmail]
    );
    counts[table] = rowCount || 0;
  };
  await upd('client_loyalty',    'client_email');
  await upd('client_credits',    'client_email');
  await upd('client_rewards',    'client_email');
  await upd('client_notes',      'client_email');
  await upd('promo_usage_logs',  'client_email');
  await upd('transactions',      'client_email');
  await upd('appointments',      'client_email');
  await upd('promo_codes',       'owner_client_email');

  return { merchants: merchantIds.length, ...counts };
}

// ── Telephone ────────────────────────────────────────────────────────────────
// Tables avec client_phone (pas de UNIQUE, denormalise cosmetique) :
//   - transactions, appointments
// Pas d'enjeu fidelite/credits/vouchers cote telephone (l'identifiant metier
// est l'email). On propage juste pour la coherence d'affichage.
async function cascadePhoneChange(client, { gcId, newPhoneRaw, newPhoneE164 }) {
  // newPhoneRaw peut etre null (effacement) ou string. On propage dans tous
  // les cas pour rester coherent. Pas de pre-check de conflit (pas de UNIQUE).
  const merchantIds = await getMerchantIdsForClient(client, gcId);
  if (!merchantIds.length) return { merchants: 0 };

  const counts = {};
  // On vise les lignes du global_client en s'appuyant sur l'email actuel
  // de la fiche locale (le plus fiable apres une eventuelle cascade email).
  // Les tables transactions/appointments n'ont pas de FK client_id, on
  // ne peut donc cibler precisement que via l'email courant.
  const { rows: emails } = await client.query(
    `SELECT user_id, LOWER(email) AS email FROM client_accounts WHERE global_client_id=$1`,
    [gcId]
  );
  if (!emails.length) return { merchants: 0 };

  // On boucle par merchant pour ne croiser que (user_id, email courant).
  for (const { user_id, email } of emails) {
    if (!email) continue;
    const t = await client.query(
      `UPDATE transactions SET client_phone=$1
        WHERE user_id=$2 AND LOWER(client_email)=$3`,
      [newPhoneRaw || null, user_id, email]
    );
    counts.transactions = (counts.transactions || 0) + (t.rowCount || 0);
    const a = await client.query(
      `UPDATE appointments SET client_phone=$1
        WHERE user_id=$2 AND LOWER(client_email)=$3`,
      [newPhoneRaw || null, user_id, email]
    );
    counts.appointments = (counts.appointments || 0) + (a.rowCount || 0);
  }
  return { merchants: merchantIds.length, ...counts };
}

module.exports = {
  cascadeEmailChange,
  cascadePhoneChange,
  // exposes pour tests / usage admin manuel
  getMerchantIdsForClient,
  checkEmailConflicts,
};
