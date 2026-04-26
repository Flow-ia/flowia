// routes/user-settings.js — Préférences compte commerçant (mode tablette,
// timeout session employé, lock on close, seuil SMS bas, durée session
// merchant, mode veille). Une ligne par user_id (UNIQUE), seed posé au
// commit 1, colonnes session/lock ajoutées commit 31.
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { pinAdminMiddleware } = require('../middleware/pinAdmin');
const router = express.Router();

router.use(authMiddleware);

// Defaults alignés sur la migration commit 1 + 31 (backend/src/db/index.js)
const DEFAULTS = {
  tablet_mode_enabled:          false,
  employee_session_timeout_min: 15,
  lock_on_tab_close:            true,
  sms_low_balance_threshold:    20,
  merchant_session_duration:    '7d',
  lock_screen_enabled:          false,
  lock_screen_idle_minutes:     15,
};

// Whitelist des durées de session merchant (cf. auth.js).
const ALLOWED_SESSION_DURATIONS = ['12h', '24h', '7d', '30d', 'never'];
// Whitelist des durées d'inactivité avant verrouillage (en minutes).
// 0 = désactivé. Les autres valeurs : 10, 15, 60, 120, 240 (UI).
const ALLOWED_IDLE_MINUTES = [0, 10, 15, 60, 120, 240];

// ── GET /api/user-settings ──────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tablet_mode_enabled, employee_session_timeout_min,
              lock_on_tab_close, sms_low_balance_threshold,
              merchant_session_duration, lock_screen_enabled, lock_screen_idle_minutes,
              created_at, updated_at
         FROM user_settings WHERE user_id=$1`,
      [req.user.userId]
    );
    const s = rows[0] || {};
    res.json({
      tablet_mode_enabled:          s.tablet_mode_enabled          ?? DEFAULTS.tablet_mode_enabled,
      employee_session_timeout_min: s.employee_session_timeout_min ?? DEFAULTS.employee_session_timeout_min,
      lock_on_tab_close:            s.lock_on_tab_close            ?? DEFAULTS.lock_on_tab_close,
      sms_low_balance_threshold:    Number(s.sms_low_balance_threshold ?? DEFAULTS.sms_low_balance_threshold),
      merchant_session_duration:    s.merchant_session_duration    ?? DEFAULTS.merchant_session_duration,
      lock_screen_enabled:          s.lock_screen_enabled          ?? DEFAULTS.lock_screen_enabled,
      lock_screen_idle_minutes:     s.lock_screen_idle_minutes     ?? DEFAULTS.lock_screen_idle_minutes,
      created_at: s.created_at || null,
      updated_at: s.updated_at || null,
    });
  } catch (e) {
    console.error('[USER-SETTINGS GET]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── PUT /api/user-settings ──────────────────────────────────────────────────
// Whitelist stricte + bornes. UPSERT ON CONFLICT (user_id) pour couvrir le
// cas rare où le seed commit 1 n'aurait pas posé de ligne (user créé entre
// deux boots).
router.put('/', pinAdminMiddleware, async (req, res) => {
  try {
    const {
      tablet_mode_enabled,
      employee_session_timeout_min,
      lock_on_tab_close,
      sms_low_balance_threshold,
      merchant_session_duration,
      lock_screen_enabled,
      lock_screen_idle_minutes,
    } = req.body || {};

    // Caps : timeout 1..180 min (3h max), seuil SMS 0..10000 €
    const timeoutMin = Math.min(180, Math.max(1,
      parseInt(employee_session_timeout_min, 10) || DEFAULTS.employee_session_timeout_min
    ));
    const rawThreshold = parseFloat(sms_low_balance_threshold);
    const threshold = Number.isFinite(rawThreshold) && rawThreshold >= 0 && rawThreshold <= 10000
      ? rawThreshold
      : DEFAULTS.sms_low_balance_threshold;

    // Commit 31 — durée session whitelist + lock screen idle whitelist.
    const sessionDuration = ALLOWED_SESSION_DURATIONS.includes(merchant_session_duration)
      ? merchant_session_duration
      : DEFAULTS.merchant_session_duration;
    const idleMin = ALLOWED_IDLE_MINUTES.includes(parseInt(lock_screen_idle_minutes, 10))
      ? parseInt(lock_screen_idle_minutes, 10)
      : DEFAULTS.lock_screen_idle_minutes;

    const { rows } = await pool.query(
      `INSERT INTO user_settings
         (user_id, tablet_mode_enabled, employee_session_timeout_min,
          lock_on_tab_close, sms_low_balance_threshold,
          merchant_session_duration, lock_screen_enabled, lock_screen_idle_minutes,
          updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         tablet_mode_enabled          = $2,
         employee_session_timeout_min = $3,
         lock_on_tab_close            = $4,
         sms_low_balance_threshold    = $5,
         merchant_session_duration    = $6,
         lock_screen_enabled          = $7,
         lock_screen_idle_minutes     = $8,
         updated_at                   = NOW()
       RETURNING tablet_mode_enabled, employee_session_timeout_min,
                 lock_on_tab_close, sms_low_balance_threshold,
                 merchant_session_duration, lock_screen_enabled, lock_screen_idle_minutes,
                 updated_at`,
      [
        req.user.userId,
        !!tablet_mode_enabled,
        timeoutMin,
        lock_on_tab_close !== false,
        threshold,
        sessionDuration,
        !!lock_screen_enabled,
        idleMin,
      ]
    );
    const s = rows[0];
    res.json({
      tablet_mode_enabled:          s.tablet_mode_enabled,
      employee_session_timeout_min: s.employee_session_timeout_min,
      lock_on_tab_close:            s.lock_on_tab_close,
      sms_low_balance_threshold:    Number(s.sms_low_balance_threshold),
      merchant_session_duration:    s.merchant_session_duration,
      lock_screen_enabled:          s.lock_screen_enabled,
      lock_screen_idle_minutes:     s.lock_screen_idle_minutes,
      updated_at:                   s.updated_at,
    });
  } catch (e) {
    console.error('[USER-SETTINGS PUT]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
