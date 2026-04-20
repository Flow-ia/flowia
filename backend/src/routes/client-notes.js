// routes/client-notes.js — Notes internes clients + recherche clients (accès employés)
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

// ── GET /api/client-notes/search?q=xxx ─ recherche client (nom/email/tel) ────
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const term = '%' + q.trim() + '%';

    // Chercher dans client_loyalty (clients connus) + client_accounts
    const { rows } = await pool.query(
      `SELECT DISTINCT
         COALESCE(ca.email, cl.client_email) AS email,
         COALESCE(ca.first_name||' '||ca.last_name, cl.client_name) AS name,
         COALESCE(ca.phone, '') AS phone,
         cl.stamps,
         cl.total_stamps_ever,
         cl.last_visit,
         (SELECT COUNT(*) FROM appointments ap
            WHERE ap.user_id = $1
              AND ap.client_email = COALESCE(ca.email, cl.client_email)
              AND ap.status = 'done') AS appt_count
       FROM client_loyalty cl
       LEFT JOIN client_accounts ca
         ON ca.user_id = cl.user_id AND ca.email = cl.client_email
       WHERE cl.user_id = $1
         AND (
           COALESCE(ca.first_name||' '||ca.last_name, cl.client_name) ILIKE $2
           OR cl.client_email ILIKE $2
           OR COALESCE(ca.phone,'') ILIKE $2
         )
       UNION
       SELECT
         ca.email, ca.first_name||' '||ca.last_name AS name,
         COALESCE(ca.phone,'') AS phone,
         0 AS stamps, 0 AS total_stamps_ever, NULL AS last_visit,
         (SELECT COUNT(*) FROM appointments ap
            WHERE ap.user_id = $1 AND ap.client_email = ca.email
              AND ap.status = 'done') AS appt_count
       FROM client_accounts ca
       LEFT JOIN client_loyalty cl ON cl.user_id=ca.user_id AND cl.client_email=ca.email
       WHERE ca.user_id = $1 AND cl.id IS NULL
         AND (ca.first_name||' '||ca.last_name ILIKE $2 OR ca.email ILIKE $2 OR ca.phone ILIKE $2)
       ORDER BY name
       LIMIT 20`,
      [req.user.userId, term]
    );
    res.json(rows);
  } catch(e) { console.error('[client-notes]', e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/client-notes/history?email=xxx[&employee_id=yyy] ──────────────
// employee_id optionnel : si fourni, filtre uniquement ses prestations
router.get('/history', async (req, res) => {
  try {
    const { email, employee_id } = req.query;
    if (!email) return res.status(400).json({ error: 'Email requis.' });

    const params = [req.user.userId, email];
    let empFilter = '';
    if (employee_id) {
      params.push(employee_id);
      empFilter = `AND a.employee_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT
         a.id, a.date, a.start_time, a.end_time,
         a.status, a.client_name, a.total_amount,
         a.notes AS appt_notes,
         e.name AS employee_name, e.avatar_color,
         json_agg(json_build_object(
           'service_name', ai.service_name,
           'qty', ai.qty,
           'unit_price', ai.unit_price
         ) ORDER BY ai.id) AS services
       FROM appointments a
       LEFT JOIN employees e ON e.id = a.employee_id
       LEFT JOIN appointment_items ai ON ai.appointment_id = a.id
       WHERE a.user_id = $1
         AND a.client_email = $2
         AND a.status = 'done'
         ${empFilter}
       GROUP BY a.id, e.name, e.avatar_color
       ORDER BY a.date DESC, a.start_time DESC
       LIMIT 50`,
      params
    );
    res.json(rows);
  } catch(e) { console.error('[client-notes]', e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/client-notes?email=xxx ─ notes internes client ──────────────────
router.get('/', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email requis.' });
    // Audit AA : normalisation email (aligné V/X) — empêche la fragmentation
    // 'John@X.com' vs 'john@x.com' qui séparerait les notes d'un même client.
    const emailNorm = String(email).trim().toLowerCase();
    const { rows } = await pool.query(
      `SELECT * FROM client_notes
       WHERE user_id=$1 AND LOWER(client_email)=$2
       ORDER BY created_at DESC`,
      [req.user.userId, emailNorm]
    );
    res.json(rows);
  } catch(e) { console.error('[client-notes]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── POST /api/client-notes ─ créer une note ───────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { client_email, client_name, note_text, appointment_id,
            employee_id, employee_name } = req.body;
    const trimmed = note_text?.trim() || '';
    if (!client_email || !trimmed)
      return res.status(400).json({ error: 'Email et note requis.' });
    // Audit AA : regex email + normalisation (aligné V/X).
    const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
    const emailNorm = String(client_email).trim().toLowerCase();
    if (!EMAIL_RE.test(emailNorm) || emailNorm.length > 254)
      return res.status(400).json({ error: 'Email invalide.' });
    if (trimmed.length > 5000)
      return res.status(400).json({ error: 'Note trop longue (5000 caractères max).' });
    if (typeof client_name === 'string' && client_name.length > 200)
      return res.status(400).json({ error: 'Nom client trop long.' });

    const { rows } = await pool.query(
      `INSERT INTO client_notes
         (user_id, client_email, client_name, note_text, appointment_id,
          created_by_employee_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.userId, emailNorm, client_name||null, trimmed,
       appointment_id||null, employee_id||null, employee_name||null]
    );
    res.status(201).json(rows[0]);
  } catch(e) { console.error('[POST /client-notes]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── PUT /api/client-notes/:id ─ modifier une note ────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { note_text } = req.body;
    const trimmed = note_text?.trim() || '';
    if (!trimmed) return res.status(400).json({ error: 'Note vide.' });
    if (trimmed.length > 5000)
      return res.status(400).json({ error: 'Note trop longue (5000 caractères max).' });
    const { rows } = await pool.query(
      `UPDATE client_notes SET note_text=$1, updated_at=NOW()
       WHERE id=$2 AND user_id=$3 RETURNING *`,
      [trimmed, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Introuvable.' });
    res.json(rows[0]);
  } catch(e) { console.error('[PUT /client-notes]', e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── DELETE /api/client-notes/:id ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM client_notes WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch(e) { console.error('[DELETE /client-notes]', e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;
