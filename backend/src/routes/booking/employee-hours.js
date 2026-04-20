// src/routes/booking/employee-hours.js — Horaires par employé
// ATTENTION : le fichier historique contient DEUX GET /employee-hours/:employee_id
// (lignes ~600 et ~648) — on les préserve à l'identique. Express n'évaluera que
// la PREMIÈRE (ordre d'enregistrement). On ne dédoublonne PAS sans validation user.
const { pool } = require('../../db');

module.exports = function attachEmployeeHoursRoutes(router) {
  // ── Horaires par employé ──────────────────────────────────────────────────────

  router.get('/employee-hours/:employee_id', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM employee_hours WHERE employee_id=$1 AND user_id=$2 ORDER BY day_of_week',
        [req.params.employee_id, req.user.userId]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  router.post('/employee-hours/:employee_id', async (req, res) => {
    try {
      const { hours } = req.body; // [{ day_of_week, open_time, close_time, is_open }]
      if (!Array.isArray(hours)) return res.status(400).json({ error: 'Format invalide.' });
      for (const h of hours) {
        await pool.query(
          `INSERT INTO employee_hours (employee_id, user_id, day_of_week, open_time, close_time, is_open)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (employee_id, day_of_week)
           DO UPDATE SET open_time=$4, close_time=$5, is_open=$6`,
          [req.params.employee_id, req.user.userId,
           h.day_of_week, h.open_time||'09:00', h.close_time||'18:00', h.is_open !== false]
        );
      }
      const { rows } = await pool.query(
        'SELECT * FROM employee_hours WHERE employee_id=$1 AND user_id=$2 ORDER BY day_of_week',
        [req.params.employee_id, req.user.userId]
      );
      res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // DELETE — remet l'employé sur les horaires du commerce
  router.delete('/employee-hours/:employee_id', async (req, res) => {
    try {
      await pool.query(
        'DELETE FROM employee_hours WHERE employee_id=$1 AND user_id=$2',
        [req.params.employee_id, req.user.userId]
      );
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // ══════════════════════════════════════════════════════════
  // HORAIRES PAR EMPLOYÉ
  // ══════════════════════════════════════════════════════════

  // GET /api/booking/employee-hours/:employee_id
  // NOTE : doublon apparent avec le GET ci-dessus (préservé tel quel, le user doit trancher)
  router.get('/employee-hours/:employee_id', async (req, res) => {
    try {
      // Migration auto si use_business_hours manque
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name='employee_hours' AND column_name='use_business_hours') THEN
            ALTER TABLE employee_hours ADD COLUMN use_business_hours BOOLEAN DEFAULT TRUE;
          END IF;
        END $$
      `);
      const { rows } = await pool.query(
        `SELECT * FROM employee_hours
         WHERE employee_id=$1 AND user_id=$2
         ORDER BY day_of_week`,
        [req.params.employee_id, req.user.userId]
      );
      res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // POST /api/booking/employee-hours — sauvegarder horaires d'un employé
  router.post('/employee-hours', async (req, res) => {
    try {
      const { employee_id, hours } = req.body;
      if (!employee_id || !Array.isArray(hours) || hours.length === 0)
        return res.status(400).json({ error: 'Données invalides : employee_id et hours[] requis.' });

      // Vérifier que l'employé appartient au commerçant
      const { rows: emp } = await pool.query(
        'SELECT id FROM employees WHERE id=$1 AND user_id=$2',
        [employee_id, req.user.userId]
      );
      if (!emp.length) return res.status(403).json({ error: 'Employé introuvable.' });

      // Vérifier que la colonne use_business_hours existe (migration auto si besoin)
      const { rows: colCheck } = await pool.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name='employee_hours' AND column_name='use_business_hours'
      `);
      const hasUBH = colCheck.length > 0;

      if (!hasUBH) {
        // Migration auto : ajouter la colonne manquante
        await pool.query(`ALTER TABLE employee_hours ADD COLUMN IF NOT EXISTS use_business_hours BOOLEAN DEFAULT TRUE`);
      }

      for (const h of hours) {
        const useBH = h.use_business_hours !== false; // true par défaut
        await pool.query(
          `INSERT INTO employee_hours
             (employee_id, user_id, day_of_week, open_time, close_time, is_open, use_business_hours)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (employee_id, day_of_week) DO UPDATE
             SET open_time        = EXCLUDED.open_time,
                 close_time       = EXCLUDED.close_time,
                 is_open          = EXCLUDED.is_open,
                 use_business_hours = EXCLUDED.use_business_hours`,
          [employee_id, req.user.userId, h.day_of_week,
           h.open_time  || '09:00',
           h.close_time || '18:00',
           h.is_open !== false,
           useBH]
        );
      }

      const { rows } = await pool.query(
        'SELECT * FROM employee_hours WHERE employee_id=$1 ORDER BY day_of_week',
        [employee_id]
      );
      res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
