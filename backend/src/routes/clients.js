// routes/clients.js
// Badge logic :
//   global_client_id IS NOT NULL  → "Plateforme" (lecture seule pour le commerçant)
//   global_client_id IS NULL      → "Interne"   (commerçant peut tout modifier)
//
// Règles :
//   - Commerçant ne voit QUE ses client_accounts (pas les global_clients sans fiche locale)
//   - Client Plateforme  → commerçant ne peut modifier NI nom NI email NI téléphone
//   - Client Interne     → commerçant peut tout modifier
//   - DELETE             → supprime uniquement la relation (client_accounts)
//                          le global_client reste intact
//   - Si client revient via RDV → fiche locale recréée automatiquement

const express  = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { sendClientInvite } = require('../utils/email');
const crypto   = require('crypto');
const router   = express.Router();
router.use(authMiddleware);

// RFC5322-lite : suffisant pour rejeter `test@@x`, espaces, caractères exotiques
// sans tomber dans la regex cauchemardesque du standard complet.
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
function isValidEmail(e) {
  return typeof e === 'string' && e.length <= 254 && EMAIL_RE.test(e.trim());
}

// ─── Helper : upsert fiche locale ────────────────────────────────────────────
async function upsertLocalClient(userId, { email, first_name, last_name, phone, notes }) {
  if (!email && !phone && !first_name) return null;
  const emailLow = email ? email.toLowerCase().trim() : '';

  // 1. Chercher par email
  let existing = null;
  if (emailLow) {
    const r = await pool.query(
      'SELECT * FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2',
      [userId, emailLow]
    );
    existing = r.rows[0] || null;
  }
  // 2. Chercher par téléphone si pas trouvé
  if (!existing && phone) {
    const r = await pool.query(
      "SELECT * FROM client_accounts WHERE user_id=$1 AND phone=$2 AND (email IS NULL OR email='')",
      [userId, phone]
    );
    existing = r.rows[0] || null;
  }

  if (existing) {
    const isGlobal = !!existing.global_client_id;
    if (isGlobal) {
      // Plateforme → uniquement les notes
      if (notes !== undefined) {
        await pool.query(
          "UPDATE client_accounts SET notes=COALESCE(NULLIF($3,''),notes) WHERE id=$1 AND user_id=$2",
          [existing.id, userId, notes || '']
        );
      }
    } else {
      // Interne → mise à jour champs manquants
      await pool.query(
        `UPDATE client_accounts SET
           first_name = COALESCE(NULLIF($3,''), first_name),
           last_name  = COALESCE(NULLIF($4,''), last_name),
           phone      = COALESCE(NULLIF($5,''), phone),
           notes      = COALESCE(NULLIF($6,''), notes),
           email      = CASE WHEN (email IS NULL OR email='') AND $7<>'' THEN $7 ELSE email END
         WHERE id=$1 AND user_id=$2`,
        [existing.id, userId, first_name||'', last_name||'', phone||'', notes||'', emailLow]
      );
      // Tenter liaison global
      await linkToGlobal(existing.id, emailLow, phone);
    }
    const r = await pool.query('SELECT * FROM client_accounts WHERE id=$1', [existing.id]);
    return r.rows[0];
  }

  // 3. Créer
  const fn = first_name || (emailLow ? emailLow.split('@')[0] : 'Client');
  const { rows } = await pool.query(
    `INSERT INTO client_accounts (user_id, email, first_name, last_name, phone, notes)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, email) DO UPDATE SET
       first_name = COALESCE(NULLIF(EXCLUDED.first_name,''), client_accounts.first_name),
       phone      = COALESCE(NULLIF(EXCLUDED.phone,''), client_accounts.phone),
       last_name  = COALESCE(NULLIF(EXCLUDED.last_name,''), client_accounts.last_name)
     RETURNING *`,
    [userId, emailLow, fn, last_name||'', phone||null, notes||null]
  );
  const created = rows[0];
  if (created?.id) {
    await linkToGlobal(created.id, emailLow, phone);
    const r = await pool.query('SELECT * FROM client_accounts WHERE id=$1', [created.id]);
    return r.rows[0];
  }
  return created;
}

// ─── Helper : lier fiche locale → compte global ───────────────────────────────
async function linkToGlobal(localId, email, phone) {
  try {
    let gc = null;
    if (email) {
      const r = await pool.query(
        'SELECT id, first_name, last_name, phone FROM global_clients WHERE LOWER(email)=LOWER($1) AND is_verified=TRUE',
        [email]
      );
      gc = r.rows[0] || null;
    }
    if (!gc && phone) {
      const r = await pool.query(
        'SELECT id, first_name, last_name, phone FROM global_clients WHERE phone=$1 AND is_verified=TRUE',
        [phone]
      );
      gc = r.rows[0] || null;
    }
    if (gc) {
      await pool.query(
        `UPDATE client_accounts SET
           global_client_id = $1,
           first_name       = $2,
           last_name        = COALESCE(NULLIF($3,''), last_name),
           phone            = COALESCE(NULLIF($4,''), phone)
         WHERE id = $5`,
        [gc.id, gc.first_name, gc.last_name||'', gc.phone||'', localId]
      );
    }
    return gc?.id || null;
  } catch (e) {
    console.warn('[linkToGlobal]', e.message);
    return null;
  }
}

// ─── GET / — liste clients du commerçant ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search, sort = 'name' } = req.query;
    // Cap strict pour éviter OOM sur gros merchants (parseInt NaN fallback → 100).
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit)  || 100));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const uid = req.user.userId;

    // loyalty_mode vient de loyalty_programs (pas de client_loyalty)
    let q = `
      SELECT
        ca.id, ca.email, ca.first_name, ca.last_name, ca.phone,
        ca.notes AS account_notes, ca.created_at,
        ca.birth_date, ca.is_booking_blocked,
        COALESCE(ca.first_name||' '||ca.last_name, ca.email) AS full_name,
        CASE WHEN ca.global_client_id IS NOT NULL THEN 'platform' ELSE 'internal' END AS source,
        cl.id AS loyalty_id, cl.stamps, cl.points, cl.total_stamps_ever,
        cl.total_points_ever, cl.rewards_earned, cl.last_visit,
        cl.client_name AS loyalty_name,
        COALESCE(lp.loyalty_mode, 'stamps') AS loyalty_mode,
        COALESCE(
          (SELECT COUNT(*) FROM transactions t WHERE t.user_id=$1 AND t.client_email=ca.email), 0
        )::int AS tx_count,
        COALESCE(
          (SELECT SUM(t.amount) FROM transactions t WHERE t.user_id=$1 AND t.client_email=ca.email AND t.type='revenue'), 0
        )::numeric AS total_spent,
        COALESCE(
          (SELECT COUNT(*) FROM appointments a WHERE a.user_id=$1 AND a.client_email=ca.email), 0
        )::int AS apt_count,
        COALESCE(
          (SELECT COUNT(*) FROM client_notes cn WHERE cn.user_id=$1 AND cn.client_email=ca.email), 0
        )::int AS notes_count,
        -- Refonte FDS-2026 commit 8 : flag pour filtre "Avec crédit" côté front.
        EXISTS(
          SELECT 1 FROM client_credits cc
           WHERE cc.user_id=$1 AND LOWER(cc.client_email)=LOWER(ca.email) AND cc.balance > 0
        ) AS has_credit,
        ca.global_client_id,
        gc.is_verified AS has_global_account,
        gc.invite_sent_at
      FROM client_accounts ca
      LEFT JOIN client_loyalty cl ON cl.user_id=ca.user_id AND cl.client_email=ca.email
      LEFT JOIN loyalty_programs lp ON lp.user_id=ca.user_id
      LEFT JOIN global_clients gc ON gc.id=ca.global_client_id
      WHERE ca.user_id=$1
    `;
    const params = [uid];

    if (search) {
      params.push(`%${search.trim()}%`);
      q += ` AND (
        (ca.first_name||' '||ca.last_name) ILIKE $${params.length}
        OR ca.email ILIKE $${params.length}
        OR ca.phone ILIKE $${params.length}
      )`;
    }

    const orderMap = {
      name:     'full_name',
      visits:   'tx_count DESC, apt_count',
      recent:   'ca.created_at DESC',
      spending: 'total_spent DESC',
    };
    q += ` ORDER BY ${orderMap[sort]||'full_name'} LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(q, params);

    let countQ = `SELECT COUNT(*) FROM client_accounts ca WHERE ca.user_id=$1`;
    const countP = [uid];
    if (search) {
      countP.push(`%${search.trim()}%`);
      countQ += ` AND ((ca.first_name||' '||ca.last_name) ILIKE $2 OR ca.email ILIKE $2 OR ca.phone ILIKE $2)`;
    }
    const { rows: cr } = await pool.query(countQ, countP);

    res.json({ clients: rows, total: parseInt(cr[0].count) });
  } catch (e) {
    console.error('[GET /clients]', e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── GET /search — recherche rapide (caisse, agenda) ─────────────────────────
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const uid  = req.user.userId;
    const term = `%${q.trim()}%`;
    const { rows } = await pool.query(`
      SELECT
        ca.id, ca.email, ca.first_name||' '||ca.last_name AS name,
        ca.phone, ca.global_client_id,
        CASE WHEN ca.global_client_id IS NOT NULL THEN 'platform' ELSE 'internal' END AS source,
        cl.stamps, cl.points, cl.total_stamps_ever
      FROM client_accounts ca
      LEFT JOIN client_loyalty cl ON cl.user_id=ca.user_id AND cl.client_email=ca.email
      WHERE ca.user_id=$1 AND (
        (ca.first_name||' '||ca.last_name) ILIKE $2
        OR ca.email ILIKE $2
        OR ca.phone ILIKE $2
      )
      ORDER BY name LIMIT 20
    `, [uid, term]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST / — créer client interne ───────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const uid = req.user.userId;
    const { email, first_name, last_name, phone, notes } = req.body;
    if (!first_name && !email) return res.status(400).json({ error: 'Nom ou email requis.' });
    if (email && !isValidEmail(email)) return res.status(400).json({ error: 'Email invalide.' });
    const client = await upsertLocalClient(uid, { email, first_name, last_name, phone, notes });
    res.json(client);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ce client existe déjà.' });
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST /auto — auto-créer depuis encaissement/RDV ─────────────────────────
router.post('/auto', async (req, res) => {
  try {
    const uid = req.user.userId;
    const { email, name, phone } = req.body;
    if (!email && !name) return res.json({ created: false });
    const parts = (name||'').split(' ');
    const client = await upsertLocalClient(uid, {
      email, first_name: parts[0]||'', last_name: parts.slice(1).join(' ')||'', phone,
    });
    res.json({ created: true, client });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── GET /:id — fiche complète avec historique ───────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const uid = req.user.userId;
    const { rows } = await pool.query(
      `SELECT
         ca.id, ca.user_id, ca.email, ca.first_name, ca.last_name, ca.phone,
         ca.notes, ca.created_at, ca.global_client_id,
         CASE WHEN ca.global_client_id IS NOT NULL THEN 'platform' ELSE 'internal' END AS source,
         COALESCE(ca.first_name||' '||ca.last_name, ca.email) AS full_name,
         gc.is_verified AS has_global_account,
         gc.invite_sent_at,
         gc.first_name AS gc_first_name,
         gc.last_name  AS gc_last_name,
         gc.email      AS gc_email,
         gc.phone      AS gc_phone,
         cl.id AS loyalty_id, cl.stamps, cl.points,
         cl.total_stamps_ever, cl.total_points_ever,
         cl.rewards_earned, cl.last_visit
       FROM client_accounts ca
       LEFT JOIN global_clients gc ON gc.id=ca.global_client_id
       LEFT JOIN client_loyalty cl ON cl.user_id=ca.user_id AND cl.client_email=ca.email
       WHERE ca.id=$1 AND ca.user_id=$2`,
      [req.params.id, uid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Client introuvable.' });
    const client = rows[0];
    const email  = client.email;

    const txs = email ? (await pool.query(
      `SELECT t.id, t.date, t.time, t.amount, t.type, t.payment_method,
              t.description, t.client_note, t.source,
              e.name AS employee_name, c.name AS category_name
       FROM transactions t
       LEFT JOIN employees e ON e.id=t.employee_id
       LEFT JOIN categories c ON c.id=t.category_id
       WHERE t.user_id=$1 AND t.client_email=$2 AND t.type='revenue'
       ORDER BY t.date DESC, t.time DESC LIMIT 50`,
      [uid, email]
    )).rows : [];

    const apts = email ? (await pool.query(
      `SELECT a.id, a.date, a.start_time, a.end_time, a.status,
              a.total_amount, a.total_duration, a.notes,
              bs.name AS service_name, e.name AS employee_name
       FROM appointments a
       LEFT JOIN booking_services bs ON bs.id=a.service_id
       LEFT JOIN employees e ON e.id=a.employee_id
       WHERE a.user_id=$1 AND a.client_email=$2
       ORDER BY a.date DESC, a.start_time DESC LIMIT 50`,
      [uid, email]
    )).rows : [];

    const notes = email ? (await pool.query(
      `SELECT cn.*, e.name AS employee_name
       FROM client_notes cn
       LEFT JOIN employees e ON e.id=cn.created_by_employee_id
       WHERE cn.user_id=$1 AND cn.client_email=$2
       ORDER BY cn.created_at DESC`,
      [uid, email]
    )).rows : [];

    const promos = email ? (await pool.query(
      `SELECT ul.used_at, ul.discount_applied, ul.code_snapshot,
              pc.type AS promo_type, pc.value AS promo_value, pc.is_loyalty_reward
       FROM promo_usage_logs ul
       LEFT JOIN promo_codes pc ON pc.id=ul.promo_code_id
       WHERE ul.user_id=$1 AND ul.client_email=$2
       ORDER BY ul.used_at DESC LIMIT 20`,
      [uid, email]
    )).rows : [];

    const total_spent  = txs.reduce((s,t) => s+parseFloat(t.amount||0), 0);
    const total_visits = txs.length + apts.filter(a=>['completed','confirmed'].includes(a.status)).length;

    res.json({ ...client, total_spent, total_visits, transactions: txs, appointments: apts, notes_list: notes, promos });
  } catch (e) {
    console.error('[GET /clients/:id]', e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── PUT /:id — éditer fiche ──────────────────────────────────────────────────
// Plateforme : seules les notes internes sont modifiables
// Interne    : tout est modifiable
router.put('/:id', async (req, res) => {
  try {
    const uid = req.user.userId;
    const { first_name, last_name, email, phone, notes } = req.body;

    const { rows: ex } = await pool.query(
      `SELECT ca.id, ca.global_client_id,
              gc.first_name AS gc_first, gc.last_name AS gc_last,
              gc.email AS gc_email, gc.phone AS gc_phone
       FROM client_accounts ca
       LEFT JOIN global_clients gc ON gc.id=ca.global_client_id
       WHERE ca.id=$1 AND ca.user_id=$2`,
      [req.params.id, uid]
    );
    if (!ex[0]) return res.status(404).json({ error: 'Client introuvable.' });

    const isGlobal = !!ex[0].global_client_id;

    if (isGlobal) {
      // Plateforme : bloquer toute modification d'identité
      const tried = (
        (first_name !== undefined && first_name !== null && first_name !== ex[0].gc_first) ||
        (last_name  !== undefined && last_name  !== null && last_name  !== ex[0].gc_last)  ||
        (email      !== undefined && email      !== null && email      !== ex[0].gc_email)  ||
        (phone      !== undefined && phone      !== null && phone      !== ex[0].gc_phone)
      );
      if (tried) {
        return res.status(403).json({
          error: 'Ce client possède un compte plateforme. Seules les notes internes sont modifiables.',
          _readonly_identity: true,
        });
      }
      const { rows } = await pool.query(
        'UPDATE client_accounts SET notes=$3 WHERE id=$1 AND user_id=$2 RETURNING *',
        [req.params.id, uid, notes??null]
      );
      return res.json({ ...rows[0], _readonly_identity: true, source: 'platform' });
    }

    // Interne : modification complète
    if (email && !isValidEmail(email)) return res.status(400).json({ error: 'Email invalide.' });
    // Normalisation lowercase : indispensable car tous les SELECT/JOIN sur
    // email utilisent LOWER(...) → un email stocké en mixed-case est introuvable.
    const emailNorm = email ? email.toLowerCase().trim() : '';
    const { rows } = await pool.query(
      `UPDATE client_accounts SET
         first_name = COALESCE(NULLIF($3,''), first_name),
         last_name  = COALESCE(NULLIF($4,''), last_name),
         email      = COALESCE(NULLIF($5,''), email),
         phone      = COALESCE(NULLIF($6,''), phone),
         notes      = $7
       WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, uid, first_name||'', last_name||'', emailNorm, phone||'', notes??null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Client introuvable.' });

    // Tenter liaison global après modification
    if (!rows[0].global_client_id) {
      await linkToGlobal(rows[0].id, rows[0].email, rows[0].phone);
    }
    const r = await pool.query('SELECT * FROM client_accounts WHERE id=$1', [rows[0].id]);
    res.json({ ...r.rows[0], source: r.rows[0].global_client_id ? 'platform' : 'internal' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
// RÈGLE 6 : supprime UNIQUEMENT la fiche locale (relation commerçant↔client)
// Le compte global reste intact. Si le client revient via RDV, la fiche est recréée.
router.delete('/:id', async (req, res) => {
  try {
    const uid = req.user.userId;
    const { rows } = await pool.query(
      'SELECT id, global_client_id FROM client_accounts WHERE id=$1 AND user_id=$2',
      [req.params.id, uid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Client introuvable.' });

    // Supprimer uniquement la fiche locale
    await pool.query('DELETE FROM client_accounts WHERE id=$1 AND user_id=$2', [req.params.id, uid]);

    res.json({
      ok: true,
      message: rows[0].global_client_id
        ? 'Relation supprimée. Le compte plateforme du client reste intact et réapparaîtra si ce client effectue un nouveau RDV.'
        : 'Client supprimé.',
    });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST /:id/invite — inviter client interne à créer son compte ─────────────
router.post('/:id/invite', async (req, res) => {
  try {
    const uid = req.user.userId;
    const { rows } = await pool.query(
      'SELECT * FROM client_accounts WHERE id=$1 AND user_id=$2',
      [req.params.id, uid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Client introuvable.' });
    const client = rows[0];

    if (client.global_client_id) {
      return res.status(400).json({ error: 'Ce client possède déjà un compte plateforme.' });
    }
    if (!client.email) {
      return res.status(400).json({ error: 'Email requis pour envoyer une invitation.' });
    }
    if (!isValidEmail(client.email)) {
      return res.status(400).json({ error: 'Email invalide.' });
    }

    // Si un global_client vérifié existe déjà pour cet email (chez un autre
    // merchant), il ne faut pas écraser son invite_token — ce serait un vecteur
    // d'abus (spam d'invitations à des clients d'autres prestataires).
    // On lie la fiche locale au compte existant et on sort avec un message clair.
    const { rows: existingGc } = await pool.query(
      'SELECT id, is_verified FROM global_clients WHERE LOWER(email)=LOWER($1)',
      [client.email]
    );
    if (existingGc[0]?.is_verified) {
      await pool.query(
        'UPDATE client_accounts SET global_client_id=$1 WHERE id=$2 AND global_client_id IS NULL',
        [existingGc[0].id, client.id]
      );
      return res.status(400).json({
        error: 'Ce client possède déjà un compte plateforme actif. Fiche liée automatiquement.',
        _linked: true,
      });
    }

    const { rows: biz } = await pool.query('SELECT business_name, email FROM users WHERE id=$1', [uid]);
    const bizName = biz[0]?.business_name || biz[0]?.email?.split('@')[0] || 'Votre prestataire';
    const token   = crypto.randomBytes(32).toString('hex');

    await pool.query(
      `INSERT INTO global_clients (email, first_name, last_name, phone, invite_token, invite_sent_at, is_verified)
       VALUES ($1,$2,$3,$4,$5,NOW(),FALSE)
       ON CONFLICT (email) DO UPDATE SET
         invite_token   = $5,
         invite_sent_at = NOW(),
         first_name     = COALESCE(NULLIF(global_clients.first_name,''), EXCLUDED.first_name),
         last_name      = COALESCE(NULLIF(global_clients.last_name,''), EXCLUDED.last_name),
         phone          = COALESCE(NULLIF(global_clients.phone,''), EXCLUDED.phone)
       WHERE global_clients.is_verified = FALSE`,
      [client.email, client.first_name, client.last_name||'', client.phone||null, token]
    );

    const { rows: gc } = await pool.query('SELECT id FROM global_clients WHERE LOWER(email)=LOWER($1)', [client.email]);
    if (gc[0]) {
      await pool.query(
        'UPDATE client_accounts SET global_client_id=$1 WHERE id=$2 AND global_client_id IS NULL',
        [gc[0].id, client.id]
      );
    }

    const inviteUrl = `${process.env.FRONTEND_URL||'http://localhost:5173'}/register?invite=${token}&email=${encodeURIComponent(client.email)}`;
    const sent = await sendClientInvite(client.email, client.first_name, bizName, inviteUrl);

    if (sent) {
      res.json({ ok: true, message: 'Invitation envoyée avec succès.' });
    } else {
      res.status(500).json({ error: "Échec de l'envoi de l'email." });
    }
  } catch (e) {
    console.error('[POST /clients/:id/invite]', e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST /:id/note — ajouter note interne ────────────────────────────────────
router.post('/:id/note', async (req, res) => {
  try {
    const uid = req.user.userId;
    const { rows: cl } = await pool.query(
      'SELECT * FROM client_accounts WHERE id=$1 AND user_id=$2',
      [req.params.id, uid]
    );
    if (!cl[0]) return res.status(404).json({ error: 'Client introuvable.' });

    const { note_text, employee_id, employee_name } = req.body;
    const trimmed = note_text?.trim() || '';
    if (!trimmed) return res.status(400).json({ error: 'Note vide.' });
    if (trimmed.length > 5000) return res.status(400).json({ error: 'Note trop longue (5000 caractères max).' });

    const fullName = `${cl[0].first_name || ''} ${cl[0].last_name || ''}`.trim() || 'Client';
    const { rows } = await pool.query(
      `INSERT INTO client_notes (user_id, client_email, client_name, note_text, created_by_employee_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [uid, cl[0].email, fullName, trimmed, employee_id||null, employee_name||null]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('[POST /clients/:id/note]', e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
module.exports.upsertLocalClient     = upsertLocalClient;
module.exports.linkToGlobal          = linkToGlobal;
module.exports.associateGlobalClient = async (localId, email, phone) => linkToGlobal(localId, email, phone);

// ─── PATCH /:id/block — Bloquer / débloquer les réservations d'un client ───────
// body: { blocked: true | false }
router.patch('/:id/block', async (req, res) => {
  try {
    const uid     = req.user.userId;
    const blocked = req.body.blocked === true;

    const { rows } = await pool.query(
      `UPDATE client_accounts
          SET is_booking_blocked = $3,
              blocked_at         = $4
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [req.params.id, uid, blocked, blocked ? new Date() : null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Client introuvable.' });
    res.json({ ...rows[0], source: rows[0].global_client_id ? 'platform' : 'internal' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});
