// routes/admin/search.js — Recherche universelle superadmin.
//
// Permet au superadmin de retrouver instantanement tous les details d'un
// RDV (commercant + client + paiement) a partir de :
//   - une reference RDV (8 premiers chars UUID, ex 'DDE26904')
//   - un immatricule client (CLI-XXXXXXXX, ex 'CLI-A1B2C3D4')
//   - un email client (logged ou guest sur le RDV)
//   - un numero de telephone client
//
// Auto-detection du type via le format de la query, avec override possible
// via ?type=. Resultat : tableau plat de lignes (1 ligne = 1 RDV) avec
// toutes les jointures necessaires pour affichage tableau cote admin.
//
// Securite : adminAuth obligatoire (scope superadmin), pas de filtre
// merchant -- l'admin voit tout. Limite stricte 100 resultats par page
// pour eviter les abus.

const express = require('express');
const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');

const router = express.Router();
router.use(adminAuth);

// Detecte le type de requete depuis le format de la query.
// Ordre de priorite : RDV ref (8 hex strict) > immat (CLI- prefix) >
// email (contient @) > phone (defaut).
function detectType(q) {
  const s = String(q || '').trim();
  if (!s) return null;
  if (/^[A-Fa-f0-9]{8}$/.test(s))           return 'rdv';
  if (/^CLI-[A-Fa-f0-9]{8}$/i.test(s))      return 'immat';
  if (s.includes('@'))                       return 'email';
  // Phone : on accepte chiffres + + - espaces (valid l'idee meme si
  // saisie partielle, on fait du LIKE).
  if (/^[+0-9\s\-().]+$/.test(s))           return 'phone';
  // Fallback : on cherche en email/nom.
  return 'email';
}

// Construit le WHERE selon le type. Retourne { sql, params, paramOffset }.
// paramOffset = nombre de params utilises -- pour chainer LIMIT/OFFSET apres.
function buildWhere(type, q) {
  const s = String(q || '').trim();
  const params = [];
  let sql = '';

  if (type === 'rdv') {
    // RDV ref = 8 premiers chars UUID. On normalise en lowercase pour
    // matcher le format UUID PostgreSQL (avec dashes) via LIKE prefix.
    params.push(s.toLowerCase() + '%');
    sql = `a.id::text LIKE $${params.length}`;
  } else if (type === 'immat') {
    // CLI-XXXXXXXX -> on extrait les 8 hex et on cherche soit dans
    // global_clients.id soit dans client_accounts.id (1 immatricule peut
    // pointer sur les 2 tables).
    const hex = s.replace(/^CLI-/i, '').toLowerCase();
    params.push(hex + '%');
    sql = `(g.id::text LIKE $${params.length}
        OR  c.id::text LIKE $${params.length})`;
  } else if (type === 'email') {
    // Email : match sur les 3 endroits possibles ou stocke (RDV peut
    // avoir un client_email different de celui du compte si saisie
    // alternative au booking).
    params.push('%' + s.toLowerCase() + '%');
    sql = `(LOWER(COALESCE(a.client_email,'')) LIKE $${params.length}
        OR  LOWER(COALESCE(c.email,'')) LIKE $${params.length}
        OR  LOWER(COALESCE(g.email,'')) LIKE $${params.length})`;
  } else if (type === 'phone') {
    // Phone : LIKE strict (pas de normalisation au format E164 cote
    // recherche -- l'admin tape ce qu'il voit, on matche tel quel).
    // On strippe les espaces/separateurs cote recherche pour matcher
    // les numeros stockes avec ou sans formatage.
    const stripped = s.replace(/[\s\-().]/g, '');
    params.push('%' + stripped + '%');
    sql = `(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(a.client_phone,''),' ',''),'-',''),'(',''),')','') LIKE $${params.length}
        OR  REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(c.phone,''),       ' ',''),'-',''),'(',''),')','') LIKE $${params.length}
        OR  REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(g.phone,''),       ' ',''),'-',''),'(',''),')','') LIKE $${params.length})`;
  } else {
    sql = '1=0';
  }

  return { sql, params };
}

// ── GET /api/admin/search ──────────────────────────────────────────────────
// Query params : q (requis), type (optionnel : auto|rdv|immat|email|phone),
// limit, offset. Renvoie { type_detected, total, rows: [...] }.
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Parametre q requis.' });

  const requestedType = String(req.query.type || 'auto').toLowerCase();
  const type = (requestedType === 'auto' || !['rdv','immat','email','phone'].includes(requestedType))
    ? detectType(q)
    : requestedType;
  if (!type) return res.status(400).json({ error: 'Type de recherche indeterminable.' });

  const limit  = Math.min(parseInt(req.query.limit)  || 50, 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  const { sql: whereSql, params } = buildWhere(type, q);

  try {
    // COUNT d'abord (sans LIMIT/OFFSET) pour pagination.
    const countParams = params.slice();
    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM appointments a
         LEFT JOIN client_accounts c ON c.id = a.client_id
         LEFT JOIN global_clients  g ON g.id = c.global_client_id
        WHERE ${whereSql}`,
      countParams
    );

    // SELECT principal avec toutes les jointures pour un rendu tableau
    // direct cote frontend (1 row = 1 ligne du tableau).
    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT
         a.id                              AS appointment_id,
         UPPER(SUBSTRING(a.id::text, 1, 8)) AS appointment_ref,
         TO_CHAR(a.date,       'YYYY-MM-DD') AS date,
         TO_CHAR(a.start_time, 'HH24:MI')    AS start_time,
         TO_CHAR(a.end_time,   'HH24:MI')    AS end_time,
         a.status,
         a.payment_status,
         a.paid_amount_cents,
         a.paid_at,
         a.stripe_payment_intent_id        AS payment_intent_id,
         a.client_name                     AS appt_client_name,
         a.client_email                    AS appt_client_email,
         a.client_phone                    AS appt_client_phone,
         a.created_at                      AS appt_created_at,
         a.cancelled_by, a.cancelled_at, a.cancel_reason,

         bs.name                           AS service_name,
         bs.price                          AS service_price,

         e.name                            AS employee_name,

         c.id                              AS client_id,
         UPPER(SUBSTRING(c.id::text, 1, 8)) AS client_immatricule,
         c.first_name                      AS client_first_name,
         c.last_name                       AS client_last_name,
         c.email                           AS client_email,
         c.phone                           AS client_phone,

         g.id                              AS global_client_id,
         UPPER(SUBSTRING(g.id::text, 1, 8)) AS global_immatricule,
         g.first_name                      AS global_first_name,
         g.last_name                       AS global_last_name,
         g.email                           AS global_email,
         g.phone                           AS global_phone,

         u.id                              AS merchant_id,
         u.business_name                   AS merchant_business_name,
         u.email                           AS merchant_email,
         bset.slug                         AS merchant_slug
       FROM appointments a
       LEFT JOIN booking_services bs ON bs.id = a.service_id
       LEFT JOIN employees       e   ON e.id  = a.employee_id
       LEFT JOIN client_accounts c   ON c.id  = a.client_id
       LEFT JOIN global_clients  g   ON g.id  = c.global_client_id
       LEFT JOIN users           u   ON u.id  = a.user_id
       LEFT JOIN booking_settings bset ON bset.user_id = u.id
       WHERE ${whereSql}
       ORDER BY a.date DESC, a.start_time DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      type_detected: type,
      query:         q,
      total:         cnt[0].n,
      limit, offset,
      rows,
    });
  } catch (e) {
    console.error('[admin/search]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
