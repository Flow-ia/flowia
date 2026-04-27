// routes/admin/clients.js — Gestion des clients globaux (commit #4 admin).
// Cible exclusivement la table global_clients (identité cross-merchant FlowIA).
// client_accounts (relation client↔salon) reste géré par chaque commerçant.

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');
const { logAuditAction } = require('../../services/adminAudit');

const router = express.Router();
router.use(adminAuth);

// ── GET / — liste paginée + filtres ──────────────────────────────────────────
router.get('/', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || 'all').toLowerCase(); // all|active|blocked

  const where = [];
  const params = [];
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(LOWER(COALESCE(g.email,'')) LIKE $${params.length}
              OR LOWER(COALESCE(g.first_name,'') || ' ' || COALESCE(g.last_name,'')) LIKE $${params.length}
              OR g.phone LIKE $${params.length})`);
  }
  if (status === 'blocked')      where.push('g.is_blocked = TRUE');
  else if (status === 'active')  where.push('g.is_blocked = FALSE OR g.is_blocked IS NULL');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const { rows: total } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM global_clients g ${whereSql}`,
      params
    );

    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT g.id, g.email, g.phone, g.first_name, g.last_name,
              g.is_verified, g.is_blocked, g.blocked_at, g.blocked_reason,
              g.created_at,
              (SELECT COUNT(*)::int FROM client_accounts c WHERE c.global_client_id = g.id) AS merchants_count,
              (SELECT COUNT(*)::int FROM appointments a
                 INNER JOIN client_accounts c ON c.id = a.client_id
                WHERE c.global_client_id = g.id) AS appointments_count
         FROM global_clients g
         ${whereSql}
         ORDER BY g.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ total: total[0].n, limit, offset, rows });
  } catch (e) {
    console.error('[admin/clients list]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /:id — détail + relations cross-merchant ─────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, phone, first_name, last_name, is_verified,
              is_blocked, blocked_reason, blocked_at, blocked_by_admin_id,
              cannot_book, cannot_book_reason, cannot_book_at, cannot_book_by_admin_id,
              created_at, updated_at
         FROM global_clients
        WHERE id = $1
        LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const client = rows[0];

    // Liens vers les commerçants (un global_client peut avoir des fiches dans
    // plusieurs salons via client_accounts.global_client_id).
    const { rows: links } = await pool.query(
      `SELECT c.id              AS client_account_id,
              c.user_id          AS merchant_id,
              c.first_name       AS local_first_name,
              c.last_name        AS local_last_name,
              c.email            AS local_email,
              c.phone            AS local_phone,
              c.is_booking_blocked AS merchant_blocked,
              c.created_at       AS linked_at,
              u.business_name,
              u.email            AS merchant_email,
              u.is_frozen        AS merchant_frozen,
              (SELECT COUNT(*)::int FROM appointments a WHERE a.client_id = c.id)        AS appointments_count,
              (SELECT MAX(date)         FROM appointments a WHERE a.client_id = c.id)    AS last_appointment_date
         FROM client_accounts c
         LEFT JOIN users u ON u.id = c.user_id
        WHERE c.global_client_id = $1
        ORDER BY c.created_at DESC`,
      [req.params.id]
    );

    const { rows: blockedBy } = client.blocked_by_admin_id
      ? await pool.query(`SELECT email, name FROM admin_users WHERE id = $1`, [client.blocked_by_admin_id])
      : { rows: [] };

    return res.json({
      ...client,
      merchants: links,
      blocked_by: blockedBy[0] || null,
    });
  } catch (e) {
    console.error('[admin/clients get]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /:id/block ──────────────────────────────────────────────────────────
router.post('/:id/block', async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Motif requis.' });

  try {
    const { rows: before } = await pool.query(
      `SELECT id, is_blocked FROM global_clients WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });
    if (before[0].is_blocked) return res.status(409).json({ error: 'Client déjà bloqué.' });

    await pool.query(
      `UPDATE global_clients
          SET is_blocked = TRUE,
              blocked_reason = $2,
              blocked_at = NOW(),
              blocked_by_admin_id = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, reason.slice(0, 1000), req.admin.id]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'client.block', targetType: 'global_client', targetId: req.params.id,
      payloadBefore: { is_blocked: false },
      payloadAfter:  { is_blocked: true, reason },
      req,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/clients block]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /:id/unblock ────────────────────────────────────────────────────────
router.post('/:id/unblock', async (req, res) => {
  try {
    const { rows: before } = await pool.query(
      `SELECT id, is_blocked, blocked_reason FROM global_clients WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });
    if (!before[0].is_blocked) return res.status(409).json({ error: 'Client non bloqué.' });

    await pool.query(
      `UPDATE global_clients
          SET is_blocked = FALSE,
              blocked_reason = NULL,
              blocked_at = NULL,
              blocked_by_admin_id = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'client.unblock', targetType: 'global_client', targetId: req.params.id,
      payloadBefore: { is_blocked: true, reason: before[0].blocked_reason },
      payloadAfter:  { is_blocked: false },
      req,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/clients unblock]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /:id/restrict-booking — empeche la creation de nouveaux RDV ────────
// Different de /block (qui bloque le login total). Le client peut toujours se
// connecter, voir son historique, exporter ses donnees RGPD, mais ne peut
// plus reserver de nouveaux creneaux. Cas d'usage : sanction graduee, no-show
// repetes, abus de RDV non honores.
router.post('/:id/restrict-booking', async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Motif requis.' });

  try {
    const { rows: before } = await pool.query(
      `SELECT id, cannot_book FROM global_clients WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });
    if (before[0].cannot_book) return res.status(409).json({ error: 'Reservation deja restreinte.' });

    await pool.query(
      `UPDATE global_clients
          SET cannot_book = TRUE,
              cannot_book_reason = $2,
              cannot_book_at = NOW(),
              cannot_book_by_admin_id = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, reason.slice(0, 1000), req.admin.id]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'client.restrict_booking', targetType: 'global_client', targetId: req.params.id,
      payloadBefore: { cannot_book: false },
      payloadAfter:  { cannot_book: true, reason },
      req,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/clients restrict-booking]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /:id/allow-booking — leve la restriction de reservation ────────────
router.post('/:id/allow-booking', async (req, res) => {
  try {
    const { rows: before } = await pool.query(
      `SELECT id, cannot_book, cannot_book_reason FROM global_clients WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });
    if (!before[0].cannot_book) return res.status(409).json({ error: 'Aucune restriction active.' });

    await pool.query(
      `UPDATE global_clients
          SET cannot_book = FALSE,
              cannot_book_reason = NULL,
              cannot_book_at = NULL,
              cannot_book_by_admin_id = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'client.allow_booking', targetType: 'global_client', targetId: req.params.id,
      payloadBefore: { cannot_book: true, reason: before[0].cannot_book_reason },
      payloadAfter:  { cannot_book: false },
      req,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/clients allow-booking]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── DELETE /:id — anonymisation RGPD ─────────────────────────────────────────
// Conformément à la règle CLAUDE.md "anonymisation NULL (pas DROP)" : on
// préserve l'id et les relations FK (appointments, client_accounts) mais on
// nullifie tout le PII. Action irréversible. Audit log obligatoire.
router.delete('/:id', async (req, res) => {
  try {
    const { rows: before } = await pool.query(
      `SELECT id, email, first_name, last_name, phone FROM global_clients WHERE id = $1`,
      [req.params.id]
    );
    if (!before.length) return res.status(404).json({ error: 'Not found' });

    await pool.query(
      `UPDATE global_clients
          SET email          = NULL,
              phone          = NULL,
              first_name     = 'Supprime',
              last_name      = NULL,
              password_hash  = NULL,
              is_verified    = FALSE,
              invite_token   = NULL,
              reset_token    = NULL,
              updated_at     = NOW()
        WHERE id = $1`,
      [req.params.id]
    );

    await logAuditAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: 'client.anonymize', targetType: 'global_client', targetId: req.params.id,
      payloadBefore: before[0],
      payloadAfter:  { anonymized: true },
      req,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/clients delete]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
