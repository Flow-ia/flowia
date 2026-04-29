const jwt = require('jsonwebtoken');
const { pool } = require('../../db');
const { resolveReferralForFilleul } = require('../referrals');
const { getSlots, getEmployeeOpenClose } = require('./helpers');
const { extractClientToken } = require('../../utils/clientCookies');

module.exports = function attachMerchantInfoRoutes(router) {
  // ── GET /api/pub/:slug ────────────────────────────────────────────────────
  router.get('/:slug', async (req, res) => {
    try {
      // Cache 5 min (très haute fréquence)
      const _cKey = `biz:${req.params.slug}`;
      const _hit  = global.memCache?.get(_cKey);
      if (_hit) return res.json(_hit);

      const { rows } = await pool.query(
        `SELECT bs.id, bs.user_id, bs.is_enabled, bs.slug,
                bs.business_description, bs.address, bs.phone, bs.timezone,
                bs.advance_booking_days, bs.min_notice_hours, bs.require_account,
                bs.google_business_url,
                bs.created_at, bs.updated_at,
                u.business_name, u.city, u.postal_code, u.phone AS user_phone,
                u.address AS user_address, u.email AS user_email,
                u.google_business_url AS user_google_business_url
         FROM booking_settings bs
         JOIN users u ON u.id = bs.user_id
         WHERE bs.slug = $1 AND bs.is_enabled = TRUE`,
        [req.params.slug]
      );
      if (!rows.length)
        return res.status(404).json({ error: 'Commerce introuvable ou réservations désactivées.' });
      const { user_id, ...pub } = rows[0];
      // Enrichir avec les URLs media (proxy transparent)
      const { rows: mediaRows } = await pool.query(
        `SELECT id, type, sort_order FROM media WHERE user_id=$1 ORDER BY type, sort_order ASC`,
        [user_id]
      );
      const profileMedia = mediaRows.find(m => m.type === 'profile');
      const coverMedia   = mediaRows.filter(m => m.type === 'cover');
      const mediaInfo = {
        profile_url: profileMedia ? `/api/media/commercant/${user_id}/profile` : null,
        cover_urls:  coverMedia.map(m => ({
          id: m.id,
          url: `/api/media/commercant/${user_id}/cover/${m.id}`,
          sort_order: m.sort_order,
        })),
      };
      // Horaires d'ouverture (7 jours, 0=dimanche … 6=samedi)
      const { rows: hoursRows } = await pool.query(
        `SELECT day_of_week, open_time, close_time, is_open
           FROM business_hours WHERE user_id=$1 ORDER BY day_of_week`,
        [user_id]
      );
      const hoursByDay = {};
      hoursRows.forEach(h => {
        hoursByDay[h.day_of_week] = {
          is_open: h.is_open,
          open_time:  h.open_time  ? String(h.open_time).slice(0,5)  : null,
          close_time: h.close_time ? String(h.close_time).slice(0,5) : null,
        };
      });
      // Source de vérité unique : table users (section "Informations du commerce")
      // booking_settings ne sert qu'à stocker business_description et la config site.
      const mergedBiz = {
        ...pub,
        ...mediaInfo,
        phone:               pub.user_phone               || null,
        address:             pub.user_address             || null,
        postal_code:         pub.postal_code              || null,
        city:                pub.city                     || null,
        email:               pub.user_email               || null,
        google_business_url: pub.user_google_business_url || null,
        hours:               hoursByDay,
      };
      const _resp = { business: mergedBiz, userId: user_id };
      global.memCache?.set(_cKey, _resp, 5 * 60 * 1000);
      res.json(_resp);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // ── GET /api/pub/:slug/services ───────────────────────────────────────────
  router.get('/:slug/services', async (req, res) => {
    try {
      const _svKey = `services:${req.params.slug}`;
      const _svHit = global.memCache?.get(_svKey);
      if (_svHit) return res.json(_svHit);

      const { rows: biz } = await pool.query(
        'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE',
        [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const { rows } = await pool.query(
        `SELECT bs.*, c.name as category_name,
                bsc.name as booking_category_name, bsc.color as booking_category_color, bsc.icon as booking_category_icon,
                mi.id IS NOT NULL                        AS has_image,
                EXTRACT(EPOCH FROM mi.created_at)::bigint AS image_version
         FROM booking_services bs
         LEFT JOIN categories c ON c.id = bs.category_id
         LEFT JOIN booking_service_categories bsc ON bsc.id = bs.booking_category_id
         LEFT JOIN LATERAL (
           SELECT id, created_at FROM media
            WHERE ref_id=bs.id AND type='service'
            ORDER BY created_at DESC LIMIT 1
         ) mi ON TRUE
         WHERE bs.user_id=$1 AND bs.is_active=TRUE
         ORDER BY bsc.sort_order NULLS LAST, bs.sort_order, bs.name`,
        [biz[0].user_id]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // ── GET /api/pub/:slug/employees ──────────────────────────────────────────
  router.get('/:slug/employees', async (req, res) => {
    try {
      const { rows: biz } = await pool.query(
        'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE',
        [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const { rows } = await pool.query(
        `SELECT e.id, e.name, e.role, e.avatar_color,
                mi.id IS NOT NULL                        AS has_image,
                EXTRACT(EPOCH FROM mi.created_at)::bigint AS image_version
         FROM employees e
         LEFT JOIN LATERAL (
           SELECT id, created_at FROM media
            WHERE ref_id=e.id AND type='employee'
            ORDER BY created_at DESC LIMIT 1
         ) mi ON TRUE
         WHERE e.user_id=$1 AND e.is_active=TRUE AND e.show_on_booking=TRUE ORDER BY e.name`,
        [biz[0].user_id]
      );
      res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // ── GET /api/pub/:slug/slots ──────────────────────────────────────────────
  router.get('/:slug/slots', async (req, res) => {
    try {
      const { date, employee_id, service_id } = req.query;
      if (!date || !service_id)
        return res.status(400).json({ error: 'Paramètres manquants (date, service_id).' });
      // Cache 30s (chaque clic de date = plusieurs appels)
      const _sKey = `slots:${req.params.slug}:${date}:${employee_id||''}:${service_id}`;
      const _shit  = global.memCache?.get(_sKey);
      if (_shit) return res.json(_shit);

      const { rows: biz } = await pool.query(
        `SELECT user_id, min_notice_hours, COALESCE(timezone, 'Europe/Paris') AS timezone
         FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE`,
        [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const userId = biz[0].user_id;
      const minNoticeMin = (parseInt(biz[0].min_notice_hours) || 0) * 60;
      const bizTz = biz[0].timezone;

      // Vérif blocage client (si connecté) — cookie HttpOnly ou header.
      const tok = extractClientToken(req);
      if (tok) {
        try {
          const dec = jwt.verify(tok, process.env.JWT_SECRET);
          if (dec.scope === 'client' && dec.merchantId === userId && dec.clientId) {
            const { rows: blockCheck } = await pool.query(
              'SELECT is_booking_blocked FROM client_accounts WHERE id=$1 AND user_id=$2',
              [dec.clientId, userId]
            );
            if (blockCheck[0]?.is_booking_blocked) {
              return res.json({ slots: [], date, duration: 0, isFull: true, blocked: true });
            }
          }
        } catch {} // token invalide → on ignore, on continue normalement
      }

      const { rows: svc } = await pool.query(
        'SELECT duration_minutes FROM booking_services WHERE id=$1 AND user_id=$2',
        [service_id, userId]
      );
      if (!svc.length) return res.status(404).json({ error: 'Service introuvable.' });

      // Nettoyer l'employee_id (peut arriver comme string "null"/"undefined")
      const empId = employee_id && !['null','undefined',''].includes(employee_id)
        ? employee_id : null;

      const slots = await getSlots(userId, empId, date, svc[0].duration_minutes, minNoticeMin, bizTz);
      const _sresp = { slots, date, duration: svc[0].duration_minutes, isFull: slots.length === 0 };
      global.memCache?.set(_sKey, _sresp, 30 * 1000);
      res.json(_sresp);
    } catch (e) { console.error('[SLOTS ERROR]', e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // ── GET /api/pub/:slug/closed-days ────────────────────────────────────────
  router.get('/:slug/closed-days', async (req, res) => {
    try {
      const { rows: biz } = await pool.query(
        'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE',
        [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const { rows: hours } = await pool.query(
        'SELECT day_of_week, is_open FROM business_hours WHERE user_id=$1',
        [biz[0].user_id]
      );
      const closedDays = hours.filter(h => !h.is_open).map(h => h.day_of_week);
      res.json({ closedDays });
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // ── GET /:slug/month-status — statut de chaque jour du mois ───────────────
  router.get('/:slug/month-status', async (req, res) => {
    try {
      const { year, month, service_id, employee_id } = req.query;
      if (!year || !month || !service_id)
        return res.status(400).json({ error: 'year, month, service_id requis.' });

      const { rows: biz } = await pool.query(
        `SELECT user_id, min_notice_hours, COALESCE(timezone, 'Europe/Paris') AS timezone
         FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE`, [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const userId       = biz[0].user_id;
      const minNoticeMin = (parseInt(biz[0].min_notice_hours) || 0) * 60;
      const bizTz        = biz[0].timezone;

      const { rows: svc } = await pool.query(
        'SELECT duration_minutes FROM booking_services WHERE id=$1 AND user_id=$2',
        [service_id, userId]
      );
      if (!svc.length) return res.status(404).json({ error: 'Service introuvable.' });
      const dur = svc[0].duration_minutes;

      // Nettoyer employee_id
      const empId = employee_id && !['null','undefined',''].includes(employee_id)
        ? employee_id : null;

      const y = parseInt(year), mo = parseInt(month);
      const daysInMonth = new Date(y, mo, 0).getDate();

      const { rows: bizHours } = await pool.query(
        'SELECT day_of_week, is_open FROM business_hours WHERE user_id=$1', [userId]
      );
      const bizOpenMap = {};
      bizHours.forEach(h => { bizOpenMap[h.day_of_week] = h.is_open; });

      const result = {};
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${y}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dow     = new Date(y, mo - 1, day).getDay();

        // Jour fermé côté commerce
        if (bizOpenMap[dow] === false) { result[dateStr] = 'closed'; continue; }

        // Si employé spécifique sélectionné, vérifier s'il est disponible ce jour
        if (empId) {
          const range = await getEmployeeOpenClose(userId, empId, dateStr);
          if (!range) { result[dateStr] = 'closed'; continue; }
        }

        // Calculer les créneaux disponibles
        const slots = await getSlots(userId, empId, dateStr, dur, minNoticeMin, bizTz);
        result[dateStr] = slots.length === 0 ? 'full' : 'open';
      }
      res.json(result);
    } catch(e) { console.error('[MONTH-STATUS]', e); res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/pub/:slug/referral/:code — valider un code parrainage ───────
  // Query param optionnel ?email=<filleul> — si fourni, vérifie aussi
  // l'éligibilité complète (filleul nouveau, pas self-referral, quota parrain
  // OK). Sans email, retourne seulement { valid, discount_type, discount_value }.
  router.get('/:slug/referral/:code', async (req, res) => {
    try {
      const { rows: biz } = await pool.query(
        'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE',
        [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const userId = biz[0].user_id;
      const { rows: prog } = await pool.query(
        `SELECT is_enabled, filleul_type, filleul_value FROM referral_programs WHERE user_id=$1`,
        [userId]
      );
      if (!prog.length || !prog[0].is_enabled)
        return res.status(404).json({ error: "Programme non actif." });
      const { rows: rc } = await pool.query(
        'SELECT id FROM referral_codes WHERE user_id=$1 AND code=$2',
        [userId, req.params.code.toUpperCase()]
      );
      if (!rc.length) return res.status(404).json({ error: 'Code invalide.' });

      const response = {
        valid:          true,
        discount_type:  prog[0].filleul_type,
        discount_value: prog[0].filleul_value,
      };

      // Si l'email du filleul est fourni, on fait le check complet d'éligibilité
      // pour afficher un feedback IN ADVANCE (avant que l'utilisateur ne clique
      // sur Réserver).
      const email = String(req.query.email || '').trim();
      if (email && email.includes('@')) {
        const resolved = await resolveReferralForFilleul(
          userId, req.params.code, email, 0
        );
        response.eligible = resolved.ok;
        if (!resolved.ok) response.reason = resolved.reason;
      }

      res.json(response);
    } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
  });
};
