// routes/admin/index.js — Router principal /api/admin.
// Applique un CORS dédié strict (whitelist explicite admin.haircoifflille.fr +
// localhost:5174). Le CORS merchant global est volontairement bypassé pour ce
// namespace dans backend/src/index.js.

const express = require('express');
const cors = require('cors');

const router = express.Router();

const ADMIN_FRONTEND_URL = process.env.ADMIN_FRONTEND_URL || '';
const allowed = new Set();
ADMIN_FRONTEND_URL.split(',').map(o => o.trim()).filter(Boolean).forEach(o => allowed.add(o));
// Dev local — port distinct du frontend merchant (qui tourne sur 5173).
allowed.add('http://localhost:5174');
// Optionnel : preview Vercel admin via VERCEL_ADMIN_PREVIEW_REGEX (pattern strict).
const previewRegex = (() => {
  const env = (process.env.VERCEL_ADMIN_PREVIEW_REGEX || '').trim();
  if (env) {
    try { return new RegExp(env); } catch { /* fallback : pas de preview */ }
  }
  return null;
})();

router.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowed.has(origin)) return callback(null, true);
    if (previewRegex && previewRegex.test(origin)) return callback(null, true);
    return callback(new Error('CORS not allowed (admin): ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}));

router.use('/auth', require('./auth'));
router.use('/merchants', require('./merchants'));
router.use('/clients',   require('./clients'));
router.use('/stats',     require('./stats'));
router.use('/audit',     require('./audit'));

module.exports = router;
