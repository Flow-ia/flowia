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
const { pinAdminMiddleware } = require('../middleware/pinAdmin');
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
// AUDIT perms #4 : PIN admin requis — sans ça, n'importe qui avec le JWT
// merchant pouvait réécrire le PIN d'un autre employé et l'usurper.
router.post('/:employeeId/set', pinAdminMiddleware, async (req, res) => {
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
    // Reset failed_attempts + locked_until au changement de PIN (le PIN est
    // neuf, la tentative historique n'a plus de sens).
    await pool.query(
      `INSERT INTO employee_pins (employee_id, user_id, pin_hash, is_active, updated_at, failed_attempts, locked_until)
       VALUES ($1, $2, $3, TRUE, NOW(), 0, NULL)
       ON CONFLICT (employee_id) DO UPDATE
         SET pin_hash=$3, is_active=TRUE, updated_at=NOW(),
             failed_attempts=0, locked_until=NULL`,
      [req.params.employeeId, req.user.userId, hash]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[EMP-PIN SET]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── DELETE /api/employee-pins/:employeeId — supprimer le PIN ─────────────────
router.delete('/:employeeId', pinAdminMiddleware, async (req, res) => {
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
router.patch('/:employeeId/toggle', pinAdminMiddleware, async (req, res) => {
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
// Appelé par l'interface lors d'une transaction sensible.
// Retourne un employeePinToken (JWT 2h) si le PIN est correct.
// AUDIT perms commit B : anti-brute-force DB-level :
//  - lockout 30 min après 5 échecs consécutifs pour le même employeeId
//  - complémentaire du rate-limit IP côté index.js (couvre le cas distribué)
//  - reset des compteurs sur PIN correct OU sur changement de PIN (/set)
const LOCKOUT_MAX_FAILS   = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 min
router.post('/:employeeId/verify', async (req, res) => {
  try {
    const { pin } = req.body;
    // Validation format strict (cohérent avec /set) : avant, un PIN non
    // 4-chiffres consommait une tentative via bcrypt.compare (inutile et
    // surcharge CPU) et pouvait déclencher le lockout sur des inputs
    // manifestement invalides.
    if (!pin || !/^\d{4}$/.test(String(pin)))
      return res.status(400).json({ error: 'PIN de 4 chiffres requis.' });

    const { rows } = await pool.query(
      `SELECT ep.pin_hash, ep.is_active, ep.failed_attempts, ep.locked_until
       FROM employee_pins ep
       JOIN employees e ON e.id = ep.employee_id
       WHERE ep.employee_id=$1 AND e.user_id=$2`,
      [req.params.employeeId, req.user.userId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Aucun PIN configuré pour cet employé.' });
    if (!rows[0].is_active) return res.status(403).json({ error: 'PIN désactivé pour cet employé.' });

    // Check lockout DB-level
    const lockedUntil = rows[0].locked_until ? new Date(rows[0].locked_until) : null;
    if (lockedUntil && lockedUntil > new Date()) {
      const secsLeft = Math.ceil((lockedUntil - new Date()) / 1000);
      const minsLeft = Math.ceil(secsLeft / 60);
      return res.status(429).json({
        error: `Trop de tentatives. PIN verrouillé ${minsLeft} min.`,
        code: 'PIN_LOCKED',
        locked_until: lockedUntil.toISOString(),
      });
    }

    const valid = await bcrypt.compare(String(pin), rows[0].pin_hash);

    if (!valid) {
      // Increment failed_attempts. Si >= MAX, set locked_until + reset counter.
      const newFails = (rows[0].failed_attempts || 0) + 1;
      if (newFails >= LOCKOUT_MAX_FAILS) {
        const lockTill = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await pool.query(
          `UPDATE employee_pins SET failed_attempts=0, locked_until=$2 WHERE employee_id=$1`,
          [req.params.employeeId, lockTill]
        );
        return res.status(429).json({
          error: 'Trop d\'echecs — PIN verrouille 30 min.',
          code: 'PIN_LOCKED',
          locked_until: lockTill.toISOString(),
        });
      }
      await pool.query(
        `UPDATE employee_pins SET failed_attempts=$2 WHERE employee_id=$1`,
        [req.params.employeeId, newFails]
      );
      return res.json({ valid: false, attempts_left: LOCKOUT_MAX_FAILS - newFails });
    }

    // PIN correct → reset compteurs + émettre token session 2h
    await pool.query(
      `UPDATE employee_pins SET failed_attempts=0, locked_until=NULL WHERE employee_id=$1`,
      [req.params.employeeId]
    ).catch(() => {});

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
