// routes/admin/ledger-metrics.js — phase 4 du refactor ledger.
//
// Endpoint admin pour visualiser les metriques in-memory du dualRead :
//   - calls par label
//   - drift count par (label, merchant)
//   - fallback count
//   - ledger_error / legacy_error count
//
// Compteurs reset au boot Render (= chaque deploy). Pour persistence
// long-terme, grep les Render Logs sur `[LEDGER_METRIC]` (JSON ligne par
// event).

const express = require('express');
const router = express.Router();

const { adminAuth } = require('../../middleware/adminAuth');
const { getMetricsSnapshot, resetMetrics } = require('../../utils/dualRead');

router.use(adminAuth);

// GET /api/admin/ledger-metrics — snapshot complet
router.get('/', async (req, res) => {
  try {
    return res.json(getMetricsSnapshot());
  } catch (e) {
    console.error('[admin/ledger-metrics get]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/admin/ledger-metrics/reset — reset des compteurs in-memory
// Utile apres une periode d'observation pour repartir a 0 sans attendre un deploy.
router.post('/reset', async (req, res) => {
  try {
    resetMetrics();
    return res.json({ ok: true, reset_at: new Date().toISOString() });
  } catch (e) {
    console.error('[admin/ledger-metrics reset]', e.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
