// src/routes/global-clients/visits.js — passages "sur place" (transactions sans RDV)
// GET /me/visits (paginé) + GET /me/visits/:id (détail).
const { pool } = require('../../db');
const { clientOrGlobalClientAuth } = require('./helpers');

module.exports = function attachVisitsRoutes(router) {
  // ─────────────────────────────────────────────────────────────────────────────
  // GET /api/global-clients/me/visits — passages "sur place" du client (paginé)
  // ─────────────────────────────────────────────────────────────────────────────
  // Query params : page (1), limit (10, max 50), q (recherche commerçant),
  // date (YYYY-MM-DD filtre exact).
  // Réponse : { items, total, page, pageSize }.
  // Liste les transactions encaissées en caisse SANS RDV préalable. Filtrées
  // via global_client_id OU email (lien non établi sur anciennes transactions).
  // Auth : accepte ff_client_token (scope='client' avec globalClientId) OU
  // ff_gc_token (scope='global_client').
  router.get('/me/visits', clientOrGlobalClientAuth, async (req, res) => {
    try {
      const gcId = req.globalClient.globalClientId;
      const { rows: gc } = await pool.query(
        'SELECT email FROM global_clients WHERE id=$1', [gcId]
      );
      if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });
      const email = gc[0].email;

      // Pagination + filtres
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
      const whereSql = 'WHERE ' + where.join(' AND ');

      // Total (pour pagination)
      const { rows: cRows } = await pool.query(
        `SELECT COUNT(*)::int AS total
           FROM transactions t
           LEFT JOIN users u ON u.id = t.user_id
           ${whereSql}`,
        params
      );
      const total = cRows[0]?.total || 0;

      if (total === 0) return res.json({ items: [], total: 0, page, pageSize });

      // Page de résultats
      const pageParams = [...params, pageSize, offset];
      const { rows } = await pool.query(
        `SELECT
           t.id, t.user_id, t.amount, t.original_amount, t.discount_amount,
           t.payment_method, t.description,
           TO_CHAR(t.date, 'YYYY-MM-DD') as date,
           TO_CHAR(t.time, 'HH24:MI')     as time,
           t.datetime_iso, t.created_at, t.qty_total,
           u.business_name, biz.slug,
           biz.phone AS business_phone, biz.address AS business_address,
           e.name AS employee_name
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

      // Items en un round-trip
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
  // Permet au client d'accéder directement à la page détail via URL
  // /book/:slug/client/passages/:id (bookmark/refresh).
  router.get('/me/visits/:id', clientOrGlobalClientAuth, async (req, res) => {
    try {
      const gcId = req.globalClient.globalClientId;
      const { rows: gc } = await pool.query(
        'SELECT email FROM global_clients WHERE id=$1', [gcId]
      );
      if (!gc.length) return res.status(404).json({ error: 'Compte introuvable.' });
      const email = gc[0].email;
      const txId  = req.params.id;

      const { rows } = await pool.query(
        `SELECT
           t.id, t.user_id, t.amount, t.original_amount, t.discount_amount,
           t.payment_method, t.description,
           TO_CHAR(t.date, 'YYYY-MM-DD') as date,
           TO_CHAR(t.time, 'HH24:MI')     as time,
           t.datetime_iso, t.created_at, t.qty_total,
           u.business_name, biz.slug,
           biz.phone AS business_phone, biz.address AS business_address,
           e.name AS employee_name
         FROM transactions t
         LEFT JOIN users u              ON u.id        = t.user_id
         LEFT JOIN booking_settings biz ON biz.user_id = t.user_id
         LEFT JOIN employees e          ON e.id        = t.employee_id
         WHERE t.id = $1
           AND t.type IN ('income','revenue')
           AND t.appointment_id IS NULL
           AND t.deleted_at IS NULL
           AND (t.global_client_id = $2 OR LOWER(t.client_email) = LOWER($3))
         LIMIT 1`,
        [txId, gcId, email]
      );
      if (!rows.length) return res.status(404).json({ error: 'Passage introuvable.' });

      const v = rows[0];
      const { rows: items } = await pool.query(
        `SELECT service_name, qty, unit_price
           FROM transaction_items
          WHERE transaction_id = $1
          ORDER BY created_at`,
        [txId]
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
