// src/routes/booking/employee-permissions.js — Permissions employé (GET + PUT)
const { pool } = require('../../db');

module.exports = function attachEmployeePermissionsRoutes(router) {
  // ── Permissions employé ───────────────────────────────────────────────────────
  // GET  /booking/employee-permissions/:id
  router.get('/employee-permissions/:id', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, can_cancel, can_modify, can_encash,
                COALESCE(can_grant_credit, FALSE) AS can_grant_credit,
                COALESCE(can_repay_credit, FALSE) AS can_repay_credit
         FROM employees WHERE id=$1 AND user_id=$2`,
        [req.params.id, req.user.userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Employé introuvable.' });
      res.json(rows[0]);
    } catch(e){ res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // PUT /booking/employee-permissions/:id
  router.put('/employee-permissions/:id', async (req, res) => {
    try {
      const { can_cancel, can_modify, can_encash, can_grant_credit, can_repay_credit } = req.body;
      const { rows } = await pool.query(
        `UPDATE employees SET
           can_cancel=$1, can_modify=$2, can_encash=$3,
           can_grant_credit=$4, can_repay_credit=$5
         WHERE id=$6 AND user_id=$7
         RETURNING id, name, can_cancel, can_modify, can_encash,
           COALESCE(can_grant_credit, FALSE) AS can_grant_credit,
           COALESCE(can_repay_credit, FALSE) AS can_repay_credit`,
        [!!can_cancel, !!can_modify, !!can_encash, !!can_grant_credit, !!can_repay_credit,
         req.params.id, req.user.userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Employé introuvable.' });
      res.json(rows[0]);
    } catch(e){ res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
