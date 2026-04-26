// adminAuth.js — Vérif JWT admin. Politique anti-leak : 404 systématique sur
// échec (jamais 401), pour ne pas révéler l'existence du namespace admin à un
// scanner externe.

const { verifyAccess } = require('../utils/adminJwt');
const { pool } = require('../db');

function notFound(res) {
  return res.status(404).json({ error: 'Not found' });
}

async function adminAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return notFound(res);

  let payload;
  try { payload = verifyAccess(m[1]); }
  catch { return notFound(res); }

  if (!payload || !payload.adminId) return notFound(res);

  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, role
         FROM admin_users
        WHERE id = $1 AND is_active = TRUE
        LIMIT 1`,
      [payload.adminId]
    );
    if (!rows.length) return notFound(res);
    req.admin = rows[0];
    return next();
  } catch (e) {
    console.error('[adminAuth]', e.message);
    return notFound(res);
  }
}

module.exports = { adminAuth };
