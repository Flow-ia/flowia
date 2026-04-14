// routes/employee-pins.js
// Gestion des codes PIN des employés
//
// Architecture :
//   - employee_pins : employee_id (PK) | user_id | pin_hash | is_active | updated_at
//   - Le hash est stocké en base (bcrypt), jamais exposé
//   - La vérification retourne un token JWT court (2h) scope='employee_pin_session'
//   - L'admin peut créer / modifier / supprimer / activer-désactiver le PIN de chaque employé
//   - Les routes financières vérifient ce token si l'employé a un PIN actif

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router   = express.Router();

router.use(authMiddleware);

// ─── GET /api/employee-pins — liste l'état PIN de tous les employés ───────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.id as employee_id, e.name,
              ep.is_active, ep.updated_at,
              CASE WHEN ep.employee_id IS NOT NULL THEN true ELSE false END as has_pin
       FROM employees e
       LEFT JOIN employee_pins ep ON ep.employee_id = e.id
       WHERE e.user_id = $1
       ORDER BY e.created_at ASC`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (e) {
    console.error('[EMP-PIN GET]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── GET /api/employee-pins/:employeeId/status — état PIN d'un employé ────────
router.get('/:employeeId/status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ep.is_active,
              CASE WHEN ep.employee_id IS NOT NULL THEN true ELSE false END as has_pin
       FROM employees e
       LEFT JOIN employee_pins ep ON ep.employee_id = e.id
       WHERE e.id = $1 AND e.user_id = $2`,
      [req.params.employeeId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employé introuvable.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST /api/employee-pins/:employeeId/set — créer ou remplacer le PIN ──────
// Requiert : { pin: "1234" }  (4 chiffres)
router.post('/:employeeId/set', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(String(pin)))
      return res.status(400).json({ error: 'PIN de 4 chiffres requis.' });

    // Vérifier que l'employé appartient à ce compte
    const { rows: empRows } = await pool.query(
      'SELECT id FROM employees WHERE id=$1 AND user_id=$2',
      [req.params.employeeId, req.user.userId]
    );
    if (!empRows.length) return res.status(404).json({ error: 'Employé introuvable.' });

    const hash = await bcrypt.hash(String(pin), 12);
    await pool.query(
      `INSERT INTO employee_pins (employee_id, user_id, pin_hash, is_active, updated_at)
       VALUES ($1, $2, $3, TRUE, NOW())
       ON CONFLICT (employee_id) DO UPDATE
         SET pin_hash=$3, is_active=TRUE, updated_at=NOW()`,
      [req.params.employeeId, req.user.userId, hash]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[EMP-PIN SET]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── DELETE /api/employee-pins/:employeeId — supprimer le PIN ─────────────────
router.delete('/:employeeId', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM employee_pins
       WHERE employee_id=$1 AND user_id=$2`,
      [req.params.employeeId, req.user.userId]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── PATCH /api/employee-pins/:employeeId/toggle — activer / désactiver ───────
router.patch('/:employeeId/toggle', async (req, res) => {
  try {
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean')
      return res.status(400).json({ error: 'is_active (boolean) requis.' });

    const { rows } = await pool.query(
      `UPDATE employee_pins SET is_active=$1, updated_at=NOW()
       WHERE employee_id=$2 AND user_id=$3
       RETURNING *`,
      [is_active, req.params.employeeId, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'PIN introuvable pour cet employé.' });
    res.json({ ok: true, is_active: rows[0].is_active });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST /api/employee-pins/:employeeId/verify — vérifier le PIN saisi ───────
// Appelé par l'interface lors d'une transaction sensible
// Retourne un employeePinToken (JWT 2h) si le PIN est correct
router.post('/:employeeId/verify', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN requis.' });

    const { rows } = await pool.query(
      `SELECT ep.pin_hash, ep.is_active
       FROM employee_pins ep
       JOIN employees e ON e.id = ep.employee_id
       WHERE ep.employee_id=$1 AND e.user_id=$2`,
      [req.params.employeeId, req.user.userId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Aucun PIN configuré pour cet employé.' });
    if (!rows[0].is_active) return res.status(403).json({ error: 'PIN désactivé pour cet employé.' });

    const valid = await bcrypt.compare(String(pin), rows[0].pin_hash);
    if (!valid) return res.json({ valid: false });

    // PIN correct → session token 2h lié à l'employé ET au compte admin
    const employeePinToken = jwt.sign(
      {
        employeeId: req.params.employeeId,
        userId: req.user.userId,
        scope: 'employee_pin_session',
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({ ok: true, valid: true, employeePinToken });
  } catch (e) {
    console.error('[EMP-PIN VERIFY]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST /api/employee-pins/:employeeId/check-session ────────────────────────
// Vérifie si un employeePinToken est encore valide
router.post('/:employeeId/check-session', async (req, res) => {
  try {
    const { employeePinToken } = req.body;
    if (!employeePinToken) return res.json({ valid: false });

    let decoded;
    try {
      decoded = jwt.verify(employeePinToken, process.env.JWT_SECRET);
    } catch {
      return res.json({ valid: false });
    }

    if (
      decoded.scope !== 'employee_pin_session' ||
      decoded.userId !== req.user.userId ||
      decoded.employeeId !== req.params.employeeId
    ) {
      return res.json({ valid: false });
    }

    res.json({ valid: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
