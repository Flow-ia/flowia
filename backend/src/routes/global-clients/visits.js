// src/routes/global-clients/visits.js — passages "sur place" (transactions sans RDV)
// GET /me/visits (paginé) + GET /me/visits/:id (détail).
//
// Cohérence avec le merchant (/api/historique) : on regroupe les rows
// multi-payment par COALESCE(payment_group_id, id) pour exposer 1 passage =
// 1 encaissement, avec un breakdown JSON par moyen de paiement. Sinon le
// client voyait 2 passages distincts ("20€ espèces" + "6€ carte") pour un
// même encaissement, ce qui ne correspond pas à ce que le commerçant voit.
//
// Les items granulaires (transaction_items) sont portés UNIQUEMENT par la
// rep_row du groupe (= la plus ancienne par created_at) — c'est le même
// contrat que historique.js. On lit donc les items via la rep_row.
const { pool } = require('../../db');
const { clientOrGlobalClientAuth } = require('./helpers');

// SELECT colonnes communes à la liste et au détail (factorisé). On
// sélectionne sur la rep_row de chaque groupe (jointure t = rep_row).
// L'`amount` exposé est le TOTAL DU GROUPE (somme des rows soeurs) et non
// la rep_row seule — sinon un multi 20€+6€ afficherait 20€ au lieu de 26€.
const TX_COLS = `
  t.id, t.user_id, t.original_amount, t.discount_amount,
  t.payment_method, t.description,
  TO_CHAR(t.date, 'YYYY-MM-DD') as date,
  TO_CHAR(t.time, 'HH24:MI')     as time,
  t.datetime_iso, t.created_at, t.qty_total,
  t.payment_group_id,
  u.business_name, biz.slug,
  biz.phone AS business_phone, biz.address AS business_address,
  e.name AS employee_name`;

// Sub-query : payment_breakdown JSON pour les rows ayant un payment_group_id.
// NULL pour les single-payment (le frontend n'affiche les sous-lignes que
// si le breakdown est non-null, exactement comme côté merchant /historique).
const BREAKDOWN_SQL = `
  CASE WHEN t.payment_group_id IS NOT NULL THEN (
    SELECT json_agg(json_build_object(
      'method',       g.payment_method,
      'amount_cents', COALESCE(g.gross_amount_cents, ROUND(g.amount * 100)::int)
    ) ORDER BY g.created_at, g.id)
    FROM transactions g
    WHERE g.user_id = t.user_id
      AND g.payment_group_id = t.payment_group_id
      AND g.deleted_at IS NULL
  ) ELSE NULL END AS payments_breakdown`;

// Sub-query : amount = SUM(group amounts) pour multi, t.amount pour single.
const AMOUNT_SQL = `
  CASE WHEN t.payment_group_id IS NOT NULL THEN (
    SELECT COALESCE(SUM(g.amount), 0)
      FROM transactions g
     WHERE g.user_id = t.user_id
       AND g.payment_group_id = t.payment_group_id
       AND g.deleted_at IS NULL
  ) ELSE t.amount END AS amount`;

// Identifie la rep_row de chaque groupe (la plus ancienne par created_at).
// Pour les single (payment_group_id IS NULL), la row est sa propre rep.
const REP_ROW_FILTER = `
  AND (
    t.payment_group_id IS NULL
    OR t.id = (
      SELECT id FROM transactions s
       WHERE s.user_id = t.user_id
         AND s.payment_group_id = t.payment_group_id
         AND s.deleted_at IS NULL
       ORDER BY s.created_at ASC, s.id ASC
       LIMIT 1
    )
  )`;

module.exports = function attachVisitsRoutes(router) {
  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/global-clients/me/visits — passages "sur place" du client (paginé)
  // ─────────────────────────────────────────────────────────────────────────────
  router.get('/me/visits', clientOrGlobalClientAuth, async (req, res) => {
    try {
      const gcId = req.globalClient.globalClientId;
      const { rows: gc } = await pool.query(
        'SELECT email FROM global_clients WHERE id=$1', [gcId]
      );
      if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });
      const email = gc[0].email;

      const page     = Math.max(1, parseInt(req.query.page, 10)  || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const offset   = (page - 1) * pageSize;
      const q        = String(req.query.q    || '').trim();
      const date     = String(req.query.date || '').trim();

      const where  = [
        `t.type IN ('income','revenue')`,
        `t.appointment_id IS NULL`,
        `t.deleted_at IS NULL`,
        `(t.global_client_id = $1 OR LOWER(t.client_email) = LOWER($2))`,
      ];
      const params = [gcId, email];

      if (q) {
        params.push('%' + q.toLowerCase() + '%');
        where.push(`LOWER(COALESCE(u.business_name,'')) LIKE $${params.length}`);
      }
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        params.push(date);
        where.push(`t.date = $${params.length}::date`);
      }
      const whereSql = 'WHERE ' + where.join(' AND ') + REP_ROW_FILTER;

      // Total (= nombre de groupes, pas de rows)
      const { rows: cRows } = await pool.query(
        `SELECT COUNT(*)::int AS total
           FROM transactions t
           LEFT JOIN users u ON u.id = t.user_id
           ${whereSql}`,
        params
      );
      const total = cRows[0]?.total || 0;
      if (total === 0) return res.json({ items: [], total: 0, page, pageSize });

      const pageParams = [...params, pageSize, offset];
      const { rows } = await pool.query(
        `SELECT ${TX_COLS},
                ${AMOUNT_SQL},
                ${BREAKDOWN_SQL}
         FROM transactions t
         LEFT JOIN users u              ON u.id        = t.user_id
         LEFT JOIN booking_settings biz ON biz.user_id = t.user_id
         LEFT JOIN employees e          ON e.id        = t.employee_id
         ${whereSql}
         ORDER BY t.date DESC, t.time DESC NULLS LAST, t.created_at DESC
         LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
        pageParams
      );

      if (!rows.length) return res.json({ items: [], total, page, pageSize });

      // Items en un round-trip — sur la rep_row du groupe (les sister rows
      // n'ont pas d'items en BDD, cohérent avec le merchant).
      const ids = rows.map(r => r.id);
      const { rows: items } = await pool.query(
        `SELECT transaction_id, service_name, qty, unit_price
           FROM transaction_items
          WHERE transaction_id = ANY($1::uuid[])
          ORDER BY created_at`,
        [ids]
      );
      const byTx = {};
      for (const it of items) {
        (byTx[it.transaction_id] = byTx[it.transaction_id] || []).push({
          service_name: it.service_name,
          qty:          it.qty,
          unit_price:   parseFloat(it.unit_price),
        });
      }
      const out = rows.map(r => ({ ...r, items: byTx[r.id] || [] }));
      res.json({ items: out, total, page, pageSize });
    } catch (e) {
      console.error('[GC VISITS]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/global-clients/me/visits/:id — détail d'un passage
  // ─────────────────────────────────────────────────────────────────────────────
  // Le client peut bookmarker /book/:slug/client/passages/:id et y retourner
  // directement. On accepte que l'id pointe soit sur la rep_row, soit sur
  // n'importe quelle row du groupe (pour des liens externes plus tolérants) ;
  // dans tous les cas, on renvoie les données AGRÉGÉES du groupe.
  router.get('/me/visits/:id', clientOrGlobalClientAuth, async (req, res) => {
    try {
      const gcId = req.globalClient.globalClientId;
      const { rows: gc } = await pool.query(
        'SELECT email FROM global_clients WHERE id=$1', [gcId]
      );
      if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });
      const email = gc[0].email;
      const txId  = req.params.id;

      // Résoudre la rep_row : si txId pointe sur une sister, on remonte au
      // groupe puis on prend la plus ancienne. Sinon txId est déjà la rep
      // (ou un single = sa propre rep).
      const { rows: resolved } = await pool.query(
        `WITH grp AS (
           SELECT payment_group_id FROM transactions
            WHERE id = $1::uuid LIMIT 1
         )
         SELECT t.id
           FROM transactions t, grp
          WHERE t.user_id IS NOT NULL
            AND ((grp.payment_group_id IS NOT NULL
                  AND t.payment_group_id = grp.payment_group_id)
                 OR (grp.payment_group_id IS NULL AND t.id = $1::uuid))
            AND t.deleted_at IS NULL
          ORDER BY t.created_at ASC, t.id ASC
          LIMIT 1`,
        [txId]
      );
      const repId = resolved[0]?.id || txId;

      const { rows } = await pool.query(
        `SELECT ${TX_COLS},
                ${AMOUNT_SQL},
                ${BREAKDOWN_SQL}
         FROM transactions t
         LEFT JOIN users u              ON u.id        = t.user_id
         LEFT JOIN booking_settings biz ON biz.user_id = t.user_id
         LEFT JOIN employees e          ON e.id        = t.employee_id
         WHERE t.id = $1::uuid
           AND t.type IN ('income','revenue')
           AND t.appointment_id IS NULL
           AND t.deleted_at IS NULL
           AND (t.global_client_id = $2 OR LOWER(t.client_email) = LOWER($3))
         LIMIT 1`,
        [repId, gcId, email]
      );
      if (!rows.length) return res.status(404).json({ error: 'Passage introuvable.' });

      const v = rows[0];
      const { rows: items } = await pool.query(
        `SELECT service_name, qty, unit_price
           FROM transaction_items
          WHERE transaction_id = $1
          ORDER BY created_at`,
        [repId]
      );
      v.items = items.map(it => ({
        service_name: it.service_name,
        qty:          it.qty,
        unit_price:   parseFloat(it.unit_price),
      }));
      res.json(v);
    } catch (e) {
      console.error('[GC VISIT DETAIL]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });
};
