const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { pool } = require('../db');
const { notifyNewAppointment } = require('../utils/push');
const { sendAppointmentConfirmation } = require('../utils/email');
const { incrementStamps } = require('../utils/loyalty-utils');
const router  = express.Router();

// ── Utilitaire temps ──────────────────────────────────────────────────────────
const toMin = (t) => { const s = String(t).substring(0, 5); const [hh,mm]=s.split(':').map(Number); return hh*60+mm; };
const toStr = (min) => `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;

// ── Charger les pauses commerçant pour un jour donné ─────────────────────────
async function getBusinessBreaks(userId, dayOfWeek) {
  const { rows } = await pool.query(
    'SELECT break_start, break_end FROM business_breaks WHERE user_id=$1 AND day_of_week=$2 ORDER BY break_start',
    [userId, dayOfWeek]
  );
  return rows.map(r => ({ startMin: toMin(r.break_start), endMin: toMin(r.break_end) }));
}

// ── Charger les plages horaires ouvertes du commerce pour un jour ─────────────
// Retourne tableau de plages: [{ openMin, closeMin }]
// Tient compte des pauses (soustrait les pauses des plages d'ouverture)
async function getBusinessOpenRanges(userId, dayOfWeek) {
  const { rows: bizH } = await pool.query(
    'SELECT open_time, close_time, is_open FROM business_hours WHERE user_id=$1 AND day_of_week=$2',
    [userId, dayOfWeek]
  );

  let baseRanges;
  if (!bizH.length) {
    if (dayOfWeek === 0) return []; // dimanche fermé par défaut
    baseRanges = [{ openMin: 9*60, closeMin: 18*60 }];
  } else if (!bizH[0].is_open) {
    return [];
  } else {
    baseRanges = [{ openMin: toMin(bizH[0].open_time), closeMin: toMin(bizH[0].close_time) }];
  }

  // Soustraire les pauses
  const breaks = await getBusinessBreaks(userId, dayOfWeek);
  if (!breaks.length) return baseRanges;

  let result = baseRanges;
  for (const brk of breaks) {
    const split = [];
    for (const range of result) {
      if (brk.endMin <= range.openMin || brk.startMin >= range.closeMin) {
        // Pause hors de la plage → garder intact
        split.push(range);
      } else {
        // La pause coupe la plage
        if (brk.startMin > range.openMin) {
          split.push({ openMin: range.openMin, closeMin: brk.startMin });
        }
        if (brk.endMin < range.closeMin) {
          split.push({ openMin: brk.endMin, closeMin: range.closeMin });
        }
      }
    }
    result = split;
  }
  return result;
}

// ── Plages horaires effectives d'un employé pour une date ────────────────────
// Retourne tableau de plages [{ openMin, closeMin }] ou [] si absent/fermé
// Prend en compte : absences, plages multiples (employee_time_slots),
//                   ancien système employee_hours, pauses commerçant
async function getEmployeeRanges(userId, employeeId, date) {
  const [y, m, d] = date.split('-').map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay();

  // 1. Vérifier absences ponctuelles (uniquement les non-annulées)
  const { rows: abs } = await pool.query(
    `SELECT id FROM employee_absences
     WHERE employee_id=$1
       AND $2::date BETWEEN start_date AND end_date
       AND cancelled_at IS NULL`,
    [employeeId, date]
  );
  if (abs.length) return [];

  const { rows: avail } = await pool.query(
    `SELECT is_available FROM employee_availability WHERE employee_id=$1 AND date=$2`,
    [employeeId, date]
  );
  if (avail.length && !avail[0].is_available) return [];

  // 2. Plages horaires ouvertes du commerce (avec pauses déjà soustraites)
  const bizRanges = await getBusinessOpenRanges(userId, dayOfWeek);
  if (!bizRanges.length) return []; // Commerce fermé ce jour

  // 3. Vérifier nouveau système : plages multiples employee_time_slots
  const { rows: empSlots } = await pool.query(
    `SELECT slot_start, slot_end FROM employee_time_slots
     WHERE employee_id=$1 AND user_id=$2 AND day_of_week=$3
     ORDER BY slot_start`,
    [employeeId, userId, dayOfWeek]
  );

  if (empSlots.length) {
    // L'employé a des plages personnalisées multiples
    // Intersectionner avec les plages ouvertes du commerce
    const empRanges = empSlots.map(s => ({ openMin: toMin(s.slot_start), closeMin: toMin(s.slot_end) }));
    return intersectRanges(empRanges, bizRanges);
  }

  // 4. Ancien système : employee_hours (1 plage par jour)
  const { rows: empH } = await pool.query(
    `SELECT open_time, close_time, is_open, COALESCE(use_business_hours, TRUE) AS use_biz
     FROM employee_hours WHERE employee_id=$1 AND day_of_week=$2`,
    [employeeId, dayOfWeek]
  );

  if (empH.length && !empH[0].use_biz) {
    if (!empH[0].is_open) return [];
    const empRange = [{ openMin: toMin(empH[0].open_time), closeMin: toMin(empH[0].close_time) }];
    return intersectRanges(empRange, bizRanges);
  }

  // 5. Pas de config spécifique → suit les horaires du commerce
  return bizRanges;
}

// ── Intersection de deux ensembles de plages ──────────────────────────────────
function intersectRanges(rangesA, rangesB) {
  const result = [];
  for (const a of rangesA) {
    for (const b of rangesB) {
      const start = Math.max(a.openMin, b.openMin);
      const end   = Math.min(a.closeMin, b.closeMin);
      if (start < end) result.push({ openMin: start, closeMin: end });
    }
  }
  return result.sort((a,b) => a.openMin - b.openMin);
}

// ── Compatibilité avec l'ancien code ─────────────────────────────────────────
// Retourne { openMin, closeMin } de la première plage ou null
async function getEmployeeOpenClose(userId, employeeId, date) {
  const ranges = await getEmployeeRanges(userId, employeeId, date);
  if (!ranges.length) return null;
  return { openMin: ranges[0].openMin, closeMin: ranges[ranges.length-1].closeMin, ranges };
}


const { associateGlobalClient } = require('./clients');

// ── Refactorisé — voir getEmployeeRanges/getBusinessOpenRanges ci-dessus ────

// ── Génère les créneaux dispo — supporte plages multiples + pauses ───────────
async function getSlotsForRanges(ranges, durationMin, existing, nowMin, isToday) {
  const slots = [];
  for (const { openMin, closeMin } of ranges) {
    for (let s = openMin; s + durationMin <= closeMin; s += 15) {
      if (isToday && s < nowMin) continue;
      const e = s + durationMin;
      const busy = existing.some(r => { const rs=toMin(r.start_time), re=toMin(r.end_time); return s < re && e > rs; });
      if (!busy) slots.push(toStr(s));
    }
  }
  return slots;
}

async function getSlots(userId, employeeId, date, durationMin, minNoticeMin = 0) {
  const [y, m, d] = date.split('-').map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay();

  const todayStr = new Date().toLocaleDateString('sv-SE');
  const isToday  = date === todayStr;
  const nowMin   = isToday ? (new Date().getHours()*60 + new Date().getMinutes() + minNoticeMin) : 0;

  // Vérifier que le commerce est ouvert (avec pauses intégrées)
  const bizRanges = await getBusinessOpenRanges(userId, dayOfWeek);
  if (!bizRanges.length) return [];

  if (employeeId) {
    // ── Créneaux pour UN employé ──────────────────────────────────────────────
    const empRanges = await getEmployeeRanges(userId, employeeId, date);
    if (!empRanges.length) return [];

    const { rows: existing } = await pool.query(
      `SELECT start_time, end_time FROM appointments
       WHERE user_id=$1 AND date=$2 AND employee_id=$3 AND status NOT IN ('cancelled')`,
      [userId, date, employeeId]
    );
    return getSlotsForRanges(empRanges, durationMin, existing, nowMin, isToday);
  }

  // ── Pas d'employé : union des créneaux de tous les employés actifs ────────
  const { rows: allEmps } = await pool.query(
    `SELECT id FROM employees WHERE user_id=$1 AND is_active=TRUE AND show_on_booking=TRUE`,
    [userId]
  );

  if (!allEmps.length) {
    // Pas d'employés → utiliser les plages ouvertes du commerce
    const { rows: existing } = await pool.query(
      `SELECT start_time, end_time FROM appointments
       WHERE user_id=$1 AND date=$2 AND status NOT IN ('cancelled')`,
      [userId, date]
    );
    return getSlotsForRanges(bizRanges, durationMin, existing, nowMin, isToday);
  }

  const slotsSet = new Set();
  for (const emp of allEmps) {
    const empRanges = await getEmployeeRanges(userId, emp.id, date);
    if (!empRanges.length) continue;
    const { rows: existing } = await pool.query(
      `SELECT start_time, end_time FROM appointments
       WHERE user_id=$1 AND date=$2 AND employee_id=$3 AND status NOT IN ('cancelled')`,
      [userId, date, emp.id]
    );
    const s = await getSlotsForRanges(empRanges, durationMin, existing, nowMin, isToday);
    s.forEach(sl => slotsSet.add(sl));
  }
  return Array.from(slotsSet).sort();
}

// ── GET /api/pub/
// ── GET /api/pub/:slug ────────────────────────────────────────────────────────
router.get('/:slug', async (req, res) => {
  try {
    // ── Cache 5 min (très haute fréquence) ─────────────────────────────────
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
              u.address AS user_address,
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
    // Source de vérité unique : table users (section "Informations du commerce")
    // booking_settings ne sert qu'à stocker business_description et la config site
    // (slug, horaires, délai annulation...). Pas de duplication.
    const mergedBiz = {
      ...pub,
      ...mediaInfo,
      phone:               pub.user_phone               || null,
      address:             pub.user_address             || null,
      postal_code:         pub.postal_code              || null,
      city:                pub.city                     || null,
      google_business_url: pub.user_google_business_url || null,
    };
    const _resp = { business: mergedBiz, userId: user_id };
    global.memCache?.set(_cKey, _resp, 5 * 60 * 1000);
    res.json(_resp);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/pub/:slug/services ───────────────────────────────────────────────
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
              EXISTS(SELECT 1 FROM media m WHERE m.ref_id=bs.id AND m.type='service') AS has_image
       FROM booking_services bs
       LEFT JOIN categories c ON c.id = bs.category_id
       LEFT JOIN booking_service_categories bsc ON bsc.id = bs.booking_category_id
       WHERE bs.user_id=$1 AND bs.is_active=TRUE
       ORDER BY bsc.sort_order NULLS LAST, bs.sort_order, bs.name`,
      [biz[0].user_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/pub/:slug/employees ──────────────────────────────────────────────
router.get('/:slug/employees', async (req, res) => {
  try {
    const { rows: biz } = await pool.query(
      'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE',
      [req.params.slug]
    );
    if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const { rows } = await pool.query(
      `SELECT e.id, e.name, e.role, e.avatar_color,
              EXISTS(SELECT 1 FROM media m WHERE m.ref_id=e.id AND m.type='employee') AS has_image
       FROM employees e
       WHERE e.user_id=$1 AND e.is_active=TRUE AND e.show_on_booking=TRUE ORDER BY e.name`,
      [biz[0].user_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/pub/:slug/slots ──────────────────────────────────────────────────
router.get('/:slug/slots', async (req, res) => {
  try {
    const { date, employee_id, service_id } = req.query;
    if (!date || !service_id)
      return res.status(400).json({ error: 'Paramètres manquants (date, service_id).' });
    // ── Cache 30s (chaque clic de date = plusieurs appels) ──────────────────
    const _sKey = `slots:${req.params.slug}:${date}:${employee_id||''}:${service_id}`;
    const _shit  = global.memCache?.get(_sKey);
    if (_shit) return res.json(_shit);

    const { rows: biz } = await pool.query(
      'SELECT user_id, min_notice_hours FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE',
      [req.params.slug]
    );
    if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const userId = biz[0].user_id;
    const minNoticeMin = (parseInt(biz[0].min_notice_hours) || 0) * 60;

    // ── Vérif blocage client (si connecté) ──────────────────────────────────
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const dec = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
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

    const slots = await getSlots(userId, empId, date, svc[0].duration_minutes, minNoticeMin);
    const _sresp = { slots, date, duration: svc[0].duration_minutes, isFull: slots.length === 0 };
    global.memCache?.set(_sKey, _sresp, 30 * 1000);
    res.json(_sresp);
  } catch (e) { console.error('[SLOTS ERROR]', e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── GET /api/pub/:slug/closed-days ────────────────────────────────────────────
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

// ── GET /:slug/month-status — statut de chaque jour du mois ─────────────────
router.get('/:slug/month-status', async (req, res) => {
  try {
    const { year, month, service_id, employee_id } = req.query;
    if (!year || !month || !service_id)
      return res.status(400).json({ error: 'year, month, service_id requis.' });

    const { rows: biz } = await pool.query(
      'SELECT user_id, min_notice_hours FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE', [req.params.slug]
    );
    if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const userId       = biz[0].user_id;
    const minNoticeMin = (parseInt(biz[0].min_notice_hours) || 0) * 60;

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

      // Calculer les créneaux disponibles (avec min_notice et employee_id si fourni)
      const slots = await getSlots(userId, empId, dateStr, dur, minNoticeMin);
      result[dateStr] = slots.length === 0 ? 'full' : 'open';
    }
    res.json(result);
  } catch(e) { console.error('[MONTH-STATUS]', e); res.status(500).json({ error: e.message }); }
});

// ── POST /api/pub/:slug/book ──────────────────────────────────────────────────
router.post('/:slug/book', async (req, res) => {
  try {
    const { rows: biz } = await pool.query(
      `SELECT bs.user_id, bs.min_notice_hours, bs.require_account, u.business_name
       FROM booking_settings bs
       JOIN users u ON u.id = bs.user_id
       WHERE bs.slug=$1 AND bs.is_enabled=TRUE`,
      [req.params.slug]
    );
    if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const { user_id: userId, min_notice_hours, require_account, business_name } = biz[0];

    const { service_id, employee_id, date, start_time,
            client_name, client_email, client_phone, notes, client_token } = req.body;
    if (!service_id || !date || !start_time || !client_name || !client_phone)
      return res.status(400).json({ error: 'Données manquantes (nom et téléphone obligatoires).' });

    // Vérif compte obligatoire
    let clientId = null;
    let tokenGlobalClientId = null;
    if (client_token) {
      try {
        const dec = jwt.verify(client_token, process.env.JWT_SECRET);
        if (dec.scope === 'client' && dec.merchantId === userId) {
          clientId = dec.clientId || null;
          tokenGlobalClientId = dec.globalClientId || null;
        }
      } catch {}
    }
    if (require_account && !clientId)
      return res.status(403).json({ error: 'Un compte client est requis.', requireAccount: true });

    // ── Validation FK : le clientId du token pointe-t-il vers un client_accounts existant ?
    // Le merchant peut avoir supprimé la fiche locale (bouton "Supprimer client"),
    // auquel cas le token est obsolète. On recrée la fiche via globalClientId si possible,
    // sinon on passe en booking invité (clientId=null).
    if (clientId) {
      const { rows: chkLocal } = await pool.query(
        'SELECT id FROM client_accounts WHERE id=$1 AND user_id=$2',
        [clientId, userId]
      );
      if (!chkLocal.length) {
        console.warn('[BOOKING] client_token clientId obsolète:', clientId, '— tentative de re-création locale');
        clientId = null;
        // Tenter de recréer la fiche locale à partir du compte global
        if (tokenGlobalClientId) {
          try {
            const { rows: gc } = await pool.query(
              'SELECT id, email, password_hash, first_name, last_name, phone FROM global_clients WHERE id=$1',
              [tokenGlobalClientId]
            );
            if (gc.length) {
              const g = gc[0];
              const { rows: created } = await pool.query(
                `INSERT INTO client_accounts (user_id, email, password_hash, first_name, last_name, phone, global_client_id, source)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'platform')
                 ON CONFLICT (user_id, email) DO UPDATE SET global_client_id = EXCLUDED.global_client_id
                 RETURNING id`,
                [userId, g.email, g.password_hash, g.first_name, g.last_name, g.phone, g.id]
              );
              if (created.length) clientId = created[0].id;
            }
          } catch (e) {
            console.error('[BOOKING] échec re-création locale:', e.message);
          }
        }
      }
    }

    // ── Vérif blocage client ────────────────────────────────────────────────────
    // Vérifie si ce client (identifié par email ou clientId) est bloqué chez ce commerçant
    const emailToCheck = (client_email || '').toLowerCase().trim();
    if (clientId || emailToCheck) {
      const blockQ = clientId
        ? await pool.query('SELECT is_booking_blocked FROM client_accounts WHERE id=$1 AND user_id=$2', [clientId, userId])
        : await pool.query('SELECT is_booking_blocked FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2', [userId, emailToCheck]);
      if (blockQ.rows[0]?.is_booking_blocked) {
        return res.status(403).json({
          error: 'Ce commerçant n\'accepte plus de réservation pour vous, merci de prendre contact avec le commerçant directement.',
          blocked: true,
        });
      }
    }

    // Vérif délai minimum
    const apptDt = new Date(`${date}T${start_time}`);
    const minDt  = new Date(Date.now() + (min_notice_hours || 1) * 3600000);
    if (apptDt < minDt)
      return res.status(400).json({ error: `Réservation impossible moins de ${min_notice_hours}h à l'avance.` });

    // Infos service
    const { rows: svc } = await pool.query(
      'SELECT duration_minutes, name, price FROM booking_services WHERE id=$1 AND user_id=$2',
      [service_id, userId]
    );
    if (!svc.length) return res.status(404).json({ error: 'Service introuvable.' });
    const { duration_minutes: duration, name: svcName, price } = svc[0];

    // Normaliser start_time : on ne garde que "HH:MM" (toStr retourne "HH:MM")
    const normalizedStartTime = String(start_time).trim().substring(0, 5);

    // Vérif créneau encore libre
    const empId = employee_id && !['null','undefined',''].includes(String(employee_id))
      ? employee_id : null;
    // Récupérer min_notice_hours pour valider le créneau
    const { rows: bsR } = await pool.query(
      'SELECT min_notice_hours FROM booking_settings WHERE user_id=$1', [userId]
    );
    const minNoticeMinBook = (parseInt(bsR[0]?.min_notice_hours) || 0) * 60;

    const availSlots = await getSlots(userId, empId, date, duration, minNoticeMinBook);
    if (!availSlots.includes(normalizedStartTime))
      return res.status(409).json({ error: 'Ce créneau n\'est plus disponible ou trop proche.' });

    // Si "au premier disponible" (empId=null) → choisir le premier employé libre à ce créneau
    let finalEmpId = empId;
    if (!finalEmpId) {
      const { rows: allEmps } = await pool.query(
        'SELECT id FROM employees WHERE user_id=$1 AND is_active=TRUE AND show_on_booking=TRUE', [userId]
      );
      const slotMin = toMin(normalizedStartTime);
      const endSlotMin = slotMin + duration;
      const endSlotStr = toStr(endSlotMin);
      for (const emp of allEmps) {
        // Vérifier que le créneau est dans les plages de l'employé (pauses incluses)
        const empRanges = await getEmployeeRanges(userId, emp.id, date);
        if (!empRanges.length) continue;
        const inRange = empRanges.some(r => slotMin >= r.openMin && endSlotMin <= r.closeMin);
        if (!inRange) continue;
        const { rows: busy } = await pool.query(
          `SELECT id FROM appointments WHERE user_id=$1 AND date=$2 AND employee_id=$3
           AND status NOT IN ('cancelled')
           AND NOT (end_time <= $4::time OR start_time >= $5::time)`,
          [userId, date, emp.id, normalizedStartTime, endSlotStr]
        );
        if (!busy.length) { finalEmpId = emp.id; break; }
      }
      if (!finalEmpId) return res.status(409).json({ error: 'Ce créneau n\'est plus disponible (tous les employés complets).' });
    }

    // Calcul end_time
    const [h, mn] = normalizedStartTime.split(':').map(Number);
    const endMin  = h * 60 + mn + duration;
    const end_time = `${String(Math.floor(endMin / 60)).padStart(2,'0')}:${String(endMin % 60).padStart(2,'0')}`;

    // Promo : revalider entièrement le code côté serveur avant l'INSERT
    const promoCodeId  = req.body.promo_code_id || null;
    const promoCodeStr = req.body.promo_code    || null;
    const originalAmt  = parseFloat(price || 0);
    let discountAmt    = 0;
    let finalPrice     = originalAmt;

    if (promoCodeId) {
      // Revalider le code en base : est-il encore actif, non expiré, non épuisé ?
      const { rows: promoRows } = await pool.query(
        `SELECT id, code, type, value, max_uses, uses_count, is_active,
                valid_from, valid_until, min_purchase, target_clients,
                is_loyalty_reward, owner_client_email
         FROM promo_codes
         WHERE id=$1 AND user_id=$2`,
        [promoCodeId, userId]
      );
      if (!promoRows.length) {
        return res.status(400).json({ error: 'Code promo introuvable.' });
      }
      const promo = promoRows[0];
      const today = new Date();

      // Vérifications séquentielles avec messages clairs
      if (!promo.is_active) {
        return res.status(400).json({ error: 'Ce code promo a déjà été utilisé ou a été désactivé.' });
      }
      if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
        return res.status(400).json({ error: 'Ce code a déjà été utilisé le nombre maximum de fois.' });
      }
      if (promo.valid_from && new Date(promo.valid_from) > today) {
        return res.status(400).json({ error: 'Ce code promo n\'est pas encore valide.' });
      }
      if (promo.valid_until && new Date(promo.valid_until) < today) {
        return res.status(400).json({ error: `Ce code promo a expiré le ${new Date(promo.valid_until).toLocaleDateString('fr-FR')}.` });
      }
      const minPurchase = parseFloat(promo.min_purchase || 0);
      if (minPurchase > 0 && originalAmt < minPurchase) {
        return res.status(400).json({ error: `Ce code nécessite un minimum de ${minPurchase.toFixed(2)} €.` });
      }
      // Code fidélité : vérifier que c'est bien le bon client
      if (promo.is_loyalty_reward && promo.owner_client_email && client_email) {
        if (promo.owner_client_email.toLowerCase() !== client_email.toLowerCase()) {
          return res.status(400).json({ error: 'Ce code de fidélité ne vous appartient pas.' });
        }
      }

      // Recalculer la remise côté serveur (ne pas faire confiance au client)
      discountAmt = promo.type === 'percent'
        ? Math.min(originalAmt, originalAmt * parseFloat(promo.value) / 100)
        : Math.min(originalAmt, parseFloat(promo.value));
      discountAmt = Math.round(discountAmt * 100) / 100;
      finalPrice  = Math.max(0, originalAmt - discountAmt);
    }

    // Insertion
    const { rows } = await pool.query(
      `INSERT INTO appointments
         (user_id, service_id, employee_id, client_id, client_name, client_email,
          client_phone, date, start_time, end_time, duration_minutes, notes, status,
          total_amount, original_amount, promo_code_id, promo_code, discount_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'confirmed',$13,$14,$15,$16,$17)
       RETURNING id, user_id, service_id, employee_id, client_id,
         client_name, client_email, client_phone,
         TO_CHAR(date, 'YYYY-MM-DD') as date,
         TO_CHAR(start_time, 'HH24:MI') as start_time,
         TO_CHAR(end_time,   'HH24:MI') as end_time,
         duration_minutes, status, notes, created_at,
         total_amount, original_amount, promo_code_id, promo_code, discount_amount`,
      [userId, service_id, finalEmpId, clientId, client_name, client_email||null,
       client_phone||null, date, start_time, end_time, duration, notes||null,
       finalPrice, originalAmt, promoCodeId, promoCodeStr, discountAmt]
    );
    const appt = rows[0];

    // Marquer le code promo comme utilisé (uses_count + is_active si max_uses atteint)
    if (promoCodeId) {
      try {
        await pool.query(
          `UPDATE promo_codes
             SET uses_count = uses_count + 1,
                 is_active  = CASE
                   WHEN max_uses IS NOT NULL AND (uses_count + 1) >= max_uses THEN FALSE
                   ELSE is_active
                 END
           WHERE id=$1`,
          [promoCodeId]
        );
        // Log traçabilité
        await pool.query(
          `INSERT INTO promo_usage_logs
             (user_id, promo_code_id, code_snapshot, client_email, client_name,
              appointment_id, discount_applied, transaction_amount)
           VALUES ($1,$2,(SELECT code FROM promo_codes WHERE id=$2),$3,$4,$5,$6,$7)`,
          [userId, promoCodeId, client_email||null, client_name||null,
           appt.id, discountAmt, finalPrice]
        );
        // Traçabilité IA — marquer le code comme utilisé (conversion)
        await pool.query(
          `UPDATE ai_campaign_codes
             SET used_at = NOW(),
                 used_appointment_id = $1,
                 status = 'used'
           WHERE promo_code_id = $2 AND used_at IS NULL`,
          [appt.id, promoCodeId]
        ).catch(() => {});
      } catch(promoErr) { console.error('[PROMO USE ERR]', promoErr.message); }
    }

    // Email de confirmation
    if (client_email) {
      let empName = null;
      if (finalEmpId) {
        const { rows: emp } = await pool.query('SELECT name FROM employees WHERE id=$1', [finalEmpId]);
        empName = emp[0]?.name || null;
      }
      const bookingUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/book/${req.params.slug}`;
      await sendAppointmentConfirmation({
        to: client_email, clientName: client_name, businessName: business_name,
        serviceName: svcName, employeeName: empName,
        date, startTime: start_time, endTime: end_time,
        durationMinutes: duration,
        price: originalAmt || null,
        finalPrice: promoCodeId ? finalPrice : null,
        discountAmount: promoCodeId ? discountAmt : null,
        promoCode: promoCodeStr,
        notes: notes||null,
        appointmentId: appt.id, bookingUrl,
      });
    }

    // ── ÉTAPE 5 : Upsert fiche locale + liaison compte global ──────────────────
    // Que le client soit connecté ou guest, on s'assure qu'une fiche locale existe
    // et qu'elle est liée à son compte global si disponible.
    if (client_email || client_phone || client_name) {
      try {
        const nameParts  = (client_name || '').trim().split(/\s+/);
        const firstName  = nameParts[0] || 'Client';
        const lastName   = nameParts.slice(1).join(' ') || '';
        const emailLow   = client_email ? client_email.toLowerCase().trim() : '';

        // 1. Chercher fiche locale existante par email puis téléphone
        let localClient = null;
        if (emailLow) {
          const r = await pool.query(
            'SELECT * FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2',
            [userId, emailLow]
          );
          localClient = r.rows[0] || null;
        }
        if (!localClient && client_phone) {
          const r = await pool.query(
            'SELECT * FROM client_accounts WHERE user_id=$1 AND phone=$2',
            [userId, client_phone]
          );
          localClient = r.rows[0] || null;
        }

        if (!localClient) {
          // 2. Créer la fiche locale (premier RDV de ce client chez ce commerçant)
          const { rows: created } = await pool.query(
            `INSERT INTO client_accounts (user_id, email, first_name, last_name, phone)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (user_id, email) DO UPDATE SET
               first_name = COALESCE(NULLIF(EXCLUDED.first_name,''), client_accounts.first_name),
               phone      = COALESCE(NULLIF(EXCLUDED.phone,''), client_accounts.phone)
             RETURNING *`,
            [userId, emailLow, firstName, lastName, client_phone || null]
          );
          localClient = created[0] || null;
        }

        // 3. Si fiche locale sans compte global → tenter liaison (étapes 3+4)
        if (localClient && !localClient.global_client_id) {
          await associateGlobalClient(localClient.id, emailLow, client_phone);
        }

        // 4. Si client connecté (clientId) → mettre à jour l'appointment avec son client_id local
        if (localClient && !appt.client_id) {
          await pool.query(
            'UPDATE appointments SET client_id=$1 WHERE id=$2',
            [localClient.id, appt.id]
          );
        }
      } catch (upsertErr) {
        // Non bloquant : le RDV est créé, on log juste l'erreur
        console.warn('[book upsert client]', upsertErr.message);
      }
    }

    res.status(201).json(appt);

    // Notification in-app + push au commerçant (non-bloquant)
    notifyNewAppointment(userId, { ...appt, service_name: svcName }).catch(err =>
      console.warn('[push new appt]', err.message)
    );
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ── Auth client ───────────────────────────────────────────────────────────────

// GET /:slug/client/check-email?email=xx
// Vérifie si un email existe dans client_accounts (local) OU global_clients
// Retourne : { exists, type: 'local'|'global'|'both'|null }
router.get('/:slug/client/check-email', async (req, res) => {
  try {
    const { rows: biz } = await pool.query(
      'SELECT user_id FROM booking_settings WHERE slug=$1', [req.params.slug]
    );
    if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const userId = biz[0].user_id;
    const { email } = req.query;
    if (!email || !email.includes('@')) return res.json({ exists: false, type: null });

    const emailLow = email.trim().toLowerCase();

    const [localR, globalR] = await Promise.all([
      pool.query('SELECT id FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2', [userId, emailLow]),
      pool.query('SELECT id, is_verified FROM global_clients WHERE LOWER(email)=$1', [emailLow]),
    ]);

    const hasLocal  = localR.rows.length > 0;
    const hasGlobal = globalR.rows.length > 0 && globalR.rows[0].is_verified;

    if (!hasLocal && !hasGlobal) return res.json({ exists: false, type: null });

    let type = hasLocal && hasGlobal ? 'both' : hasGlobal ? 'global' : 'local';
    res.json({ exists: true, type });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});


router.post('/:slug/client/register', async (req, res) => {
  try {
    const { rows: biz } = await pool.query(
      'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE', [req.params.slug]
    );
    if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const userId   = biz[0].user_id;
    const { email, password, first_name, last_name, phone } = req.body;
    if (!email || !password || !first_name || !last_name)
      return res.status(400).json({ error: 'Champs requis.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Mot de passe trop court (6 min).' });

    const emailLow = email.toLowerCase().trim();

    // 1. Vérifier si compte global existe déjà avec cet email
    const { rows: gcEx } = await pool.query(
      'SELECT * FROM global_clients WHERE LOWER(email)=$1', [emailLow]
    );
    if (gcEx.length && gcEx[0].is_verified) {
      // Compte global existant vérifié → refuser la création, demander connexion
      return res.status(409).json({
        error: 'Un compte existe déjà avec cet email. Veuillez vous connecter.',
        code:  'USE_LOGIN',
      });
    }

    // 2. Vérifier si fiche locale existe déjà chez ce commerçant
    const { rows: localEx } = await pool.query(
      'SELECT id FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2', [userId, emailLow]
    );
    if (localEx.length) return res.status(409).json({ error: 'Email déjà utilisé.', code: 'USE_LOGIN' });

    const hash = await bcrypt.hash(password, 10);

    // 3. Créer ou mettre à jour le compte global
    let gcId;
    if (gcEx.length) {
      // Compte global non vérifié (invitation) → activer
      const { rows: updated } = await pool.query(
        `UPDATE global_clients SET
           password_hash=$2, is_verified=TRUE, invite_token=NULL,
           first_name=COALESCE(NULLIF($3,''), first_name),
           last_name=COALESCE(NULLIF($4,''), last_name),
           phone=COALESCE(NULLIF($5,''), phone), updated_at=NOW()
         WHERE LOWER(email)=$1 RETURNING id`,
        [emailLow, hash, first_name, last_name||'', phone||'']
      );
      gcId = updated[0].id;
    } else {
      // Nouveau compte global
      const consentIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
      const { rows: newGc } = await pool.query(
        `INSERT INTO global_clients
           (email, password_hash, first_name, last_name, phone, is_verified, consent_at, consent_ip)
         VALUES ($1,$2,$3,$4,$5,TRUE,NOW(),$6) RETURNING id`,
        [emailLow, hash, first_name, last_name||'', phone||null, consentIp]
      );
      gcId = newGc[0].id;
    }

    // 4. Créer la fiche locale liée au compte global
    const { rows } = await pool.query(
      `INSERT INTO client_accounts (user_id, email, password_hash, first_name, last_name, phone, global_client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, email) DO UPDATE SET
         global_client_id = EXCLUDED.global_client_id,
         password_hash    = EXCLUDED.password_hash
       RETURNING id, email, first_name, last_name, phone, global_client_id`,
      [userId, emailLow, hash, first_name, last_name||'', phone||null, gcId]
    );
    const client = rows[0];

    // 5. Lier toutes les fiches locales existantes (autres commerçants) au même compte global
    await pool.query(
      'UPDATE client_accounts SET global_client_id=$1 WHERE LOWER(email)=$2 AND global_client_id IS NULL',
      [gcId, emailLow]
    );

    const token = jwt.sign(
      { clientId: client.id, merchantId: userId, globalClientId: gcId, scope: 'client' },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    );
    res.json({ ok: true, token, client: { ...client, has_global_account: true } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.post('/:slug/client/login', async (req, res) => {
  try {
    const { rows: biz } = await pool.query(
      'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE', [req.params.slug]
    );
    if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const userId  = biz[0].user_id;
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });

    const emailLow = email.toLowerCase().trim();

    // 1. Chercher le compte global — source de vérité pour le mot de passe
    //    Pas de filtre sur is_verified ni password_hash pour toujours avoir le hash le plus frais
    const { rows: gcRows } = await pool.query(
      'SELECT * FROM global_clients WHERE LOWER(email)=$1', [emailLow]
    );

    // 2. Chercher la fiche locale
    const { rows: localRows } = await pool.query(
      'SELECT * FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2', [userId, emailLow]
    );

    if (!gcRows.length && !localRows.length)
      return res.status(401).json({ error: 'Email introuvable.' });

    let valid = false;
    let gc    = gcRows[0] || null;
    let local = localRows[0] || null;

    // 3. Vérifier le mot de passe — global en priorité (hash toujours à jour après reset)
    if (gc?.password_hash) {
      valid = await bcrypt.compare(password, gc.password_hash);
    }
    // Fallback : mot de passe local (ancien compte sans compte global)
    if (!valid && local?.password_hash) {
      valid = await bcrypt.compare(password, local.password_hash);
      // Si valide depuis local → synchroniser vers global
      if (valid && gc) {
        await pool.query(
          'UPDATE global_clients SET password_hash=$1, updated_at=NOW() WHERE id=$2',
          [local.password_hash, gc.id]
        ).catch(e => console.warn('[sync gc hash]', e.message));
      }
    }

    if (!valid) return res.status(401).json({ error: 'Mot de passe incorrect.' });

    // 4. Si fiche locale absente mais compte global existe → créer la fiche locale automatiquement
    if (!local && gc) {
      const { rows: created } = await pool.query(
        `INSERT INTO client_accounts (user_id, email, password_hash, first_name, last_name, phone, global_client_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id, email) DO UPDATE SET
           global_client_id = EXCLUDED.global_client_id,
           first_name = EXCLUDED.first_name,
           last_name  = EXCLUDED.last_name
         RETURNING *`,
        [userId, emailLow, gc.password_hash, gc.first_name, gc.last_name||'', gc.phone||null, gc.id]
      );
      local = created[0];
    }

    // 5. Lier fiche locale au compte global si pas encore fait
    if (local && gc && !local.global_client_id) {
      await pool.query(
        'UPDATE client_accounts SET global_client_id=$1 WHERE id=$2',
        [gc.id, local.id]
      ).catch(() => {});
      local.global_client_id = gc.id;
    }

    // 6. Synchroniser le mot de passe dans global si login par compte local
    if (gc && local?.password_hash && !gc.password_hash) {
      await pool.query(
        'UPDATE global_clients SET password_hash=$1, is_verified=TRUE WHERE id=$2',
        [local.password_hash, gc.id]
      ).catch(() => {});
    }

    const token = jwt.sign(
      {
        clientId:       local.id,
        merchantId:     userId,
        globalClientId: gc?.id || null,
        scope:          'client',
      },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    );

    res.json({
      ok: true, token,
      client: {
        id:               local.id,
        email:            local.email,
        first_name:       local.first_name,
        last_name:        local.last_name,
        phone:            local.phone,
        global_client_id: local.global_client_id,
        has_global_account: !!local.global_client_id,
      },
    });
  } catch (e) { console.error('[login]', e); res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.get('/:slug/client/appointments', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Non authentifié.' });
    const { rows: biz } = await pool.query(
      'SELECT user_id FROM booking_settings WHERE slug=$1', [req.params.slug]
    );
    if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const userId = biz[0].user_id;
    let decoded;
    try { decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Token invalide.' }); }
    if (decoded.scope !== 'client' || decoded.merchantId !== userId)
      return res.status(403).json({ error: 'Accès refusé.' });

    // Récupérer l'email du client pour filtrer les RDV
    // On cherche d'abord dans client_accounts, puis dans global_clients
    // → garantit la traçabilité même si le commerçant a supprimé la fiche locale
    let clientEmail = null;

    // 1. Chercher l'email via client_accounts (fiche locale peut encore exister)
    const { rows: localRows } = await pool.query(
      'SELECT email FROM client_accounts WHERE id=$1',
      [decoded.clientId]
    );
    if (localRows[0]?.email) {
      clientEmail = localRows[0].email;
    }

    // 2. Sinon chercher via le compte global (si fiche locale supprimée)
    if (!clientEmail && decoded.globalClientId) {
      const { rows: gcRows } = await pool.query(
        'SELECT email FROM global_clients WHERE id=$1',
        [decoded.globalClientId]
      );
      if (gcRows[0]?.email) clientEmail = gcRows[0].email;
    }

    if (!clientEmail) return res.json([]);

    const { rows } = await pool.query(
      `SELECT a.id, a.status, a.notes, a.paid, a.paid_method,
              a.client_name, a.client_email, a.client_phone, a.cancel_reason,
              a.discount_amount, a.service_id, a.employee_id, a.client_id,
              TO_CHAR(a.date,        'YYYY-MM-DD') AS date,
              TO_CHAR(a.start_time,  'HH24:MI')    AS start_time,
              TO_CHAR(a.end_time,    'HH24:MI')    AS end_time,
              a.duration_minutes, a.created_at, a.updated_at,
              bs.name  AS service_name,
              bs.color AS service_color,
              bs.price AS service_price,
              e.name   AS employee_name
       FROM appointments a
       LEFT JOIN booking_services bs ON bs.id = a.service_id
       LEFT JOIN employees e ON e.id = a.employee_id
       WHERE a.user_id=$1 AND LOWER(a.client_email)=LOWER($2)
       ORDER BY a.date DESC, a.start_time DESC`,
      [userId, clientEmail]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

router.put('/:slug/client/appointments/:id/cancel', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Non authentifié.' });
    let decoded;
    try { decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Token invalide.' }); }
    if (decoded.scope !== 'client') return res.status(403).json({ error: 'Accès refusé.' });

    // ── Résoudre le merchant + politique d'annulation + coordonnées ──────────
    const { rows: bizRows } = await pool.query(
      `SELECT u.id AS user_id, u.business_name, u.phone AS merchant_phone, u.address AS merchant_address,
              COALESCE(bs.cancellation_policy_hours, 2) AS policy_hours
       FROM users u
       LEFT JOIN booking_settings bs ON bs.user_id = u.id
       WHERE (bs.slug = $1 OR u.id = $2)
       LIMIT 1`,
      [req.params.slug, decoded.merchantId]
    );
    if (!bizRows.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const biz = bizRows[0];
    const policyHours = parseInt(biz.policy_hours);

    // ── Résoudre l'email du client (robuste aux suppressions de fiches) ─────
    let clientEmail = null;
    const { rows: localRows } = await pool.query(
      'SELECT email FROM client_accounts WHERE id=$1', [decoded.clientId]
    );
    if (localRows[0]?.email) clientEmail = localRows[0].email;
    if (!clientEmail && decoded.globalClientId) {
      const { rows: gcRows } = await pool.query(
        'SELECT email FROM global_clients WHERE id=$1', [decoded.globalClientId]
      );
      if (gcRows[0]?.email) clientEmail = gcRows[0].email;
    }
    if (!clientEmail) return res.status(401).json({ error: 'Session client invalide.' });

    // ── Vérifier que le RDV appartient à ce client (via email, pas client_id) ─
    const { rows: check } = await pool.query(
      `SELECT id, date, start_time, status
       FROM appointments
       WHERE id=$1 AND user_id=$2
         AND LOWER(COALESCE(client_email,'')) = LOWER($3)`,
      [req.params.id, biz.user_id, clientEmail]
    );
    if (!check.length) return res.status(404).json({ error: 'RDV introuvable.' });
    const appt = check[0];
    if (appt.status === 'cancelled') return res.status(400).json({ error: 'Ce RDV est déjà annulé.' });
    if (appt.status !== 'confirmed' && appt.status !== 'pending')
      return res.status(400).json({ error: 'Ce RDV ne peut plus être annulé.' });

    // ── Politique d'annulation merchant-driven ──────────────────────────────
    // policy_hours=0 → annulation possible à tout moment
    // sinon → doit être plus de N heures avant le RDV
    const dateStr = typeof appt.date === 'string'
      ? appt.date.substring(0, 10)
      : new Date(appt.date).toISOString().substring(0, 10);
    const timeStr = typeof appt.start_time === 'string'
      ? appt.start_time.substring(0, 5)
      : '00:00';
    const apptStart = new Date(`${dateStr}T${timeStr}:00`);
    const now       = new Date();
    const diffHours = (apptStart - now) / (1000 * 60 * 60);
    if (policyHours > 0 && diffHours < policyHours) {
      const labelHours = policyHours < 24 ? `${policyHours}h`
                                          : `${Math.round(policyHours/24)} jour${policyHours>=48?'s':''}`;
      return res.status(400).json({
        error: `Annulation en ligne impossible : le rendez-vous commence dans moins de ${labelHours}.`,
        code: 'TOO_LATE',
        policy_hours:     policyHours,
        business_name:    biz.business_name || null,
        merchant_phone:   biz.merchant_phone || null,
        merchant_address: biz.merchant_address || null,
      });
    }

    // ── Annulation effective ────────────────────────────────────────────────
    const { rows } = await pool.query(
      `UPDATE appointments SET status='cancelled', cancel_reason=$1, updated_at=NOW()
       WHERE id=$2 AND user_id=$3
         AND LOWER(COALESCE(client_email,'')) = LOWER($4)
       RETURNING id, client_name,
         TO_CHAR(date, 'YYYY-MM-DD') as date,
         TO_CHAR(start_time, 'HH24:MI') as start_time,
         TO_CHAR(end_time,   'HH24:MI') as end_time,
         status, cancel_reason, updated_at`,
      [req.body.reason || 'Annulé par le client', req.params.id, biz.user_id, clientEmail]
    );
    if (!rows.length) return res.status(404).json({ error: 'RDV introuvable ou déjà annulé.' });
    res.json(rows[0]);
  } catch (e) { console.error('[CANCEL]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});


// ── PUT /:slug/client/profile ── mise à jour du profil client ───────────────
router.put('/:slug/client/profile', async (req, res) => {
  try {
    // Auth via Authorization header ou x-client-token
    const rawToken = req.headers['x-client-token']
      || (req.headers.authorization || '').replace('Bearer ', '');
    if (!rawToken) return res.status(401).json({ error: 'Non authentifié.' });
    let decoded;
    try { decoded = jwt.verify(rawToken, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Token invalide.' }); }

    const { slug } = req.params;
    const { first_name, last_name, email, phone } = req.body;
    if (!first_name?.trim() || !last_name?.trim() || !email?.trim()) {
      return res.status(400).json({ error: 'Prénom, nom et email sont requis.' });
    }

    // Le token client contient clientId (= client_accounts.id)
    // Mettre à jour directement client_accounts
    const updated = await pool.query(
      `UPDATE client_accounts
       SET first_name = $1, last_name = $2, email = LOWER($3), phone = $4
       WHERE id = $5
       RETURNING id, first_name, last_name, email, phone`,
      [first_name.trim(), last_name.trim(), email.trim(), phone?.trim() || null,
       decoded.clientId]
    );
    if (!updated.rows.length) return res.status(404).json({ error: 'Compte introuvable.' });

    // Sync global_clients si lié
    try {
      const { rows: gc } = await pool.query(
        'SELECT global_client_id FROM client_accounts WHERE id=$1', [decoded.clientId]
      );
      if (gc[0]?.global_client_id) {
        await pool.query(
          `UPDATE global_clients SET first_name=$1,last_name=$2,email=LOWER($3),phone=$4 WHERE id=$5`,
          [first_name.trim(), last_name.trim(), email.trim(), phone?.trim()||null, gc[0].global_client_id]
        );
      }
    } catch(_) {}

    res.json(updated.rows[0]);
  } catch (e) {
    console.error('PUT /client/profile:', e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /:slug/promo/check?code=XXX&amount=YYY ── validation publique ─────────
router.get('/:slug/promo/check', async (req, res) => {
  try {
    const { code, amount } = req.query;
    if (!code) return res.json({ valid: false, error: 'Code requis.' });

    // Récupérer user_id du commerce
    const { rows: biz } = await pool.query(
      `SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE`,
      [req.params.slug]
    );
    if (!biz.length) return res.json({ valid: false, error: 'Commerce introuvable.' });
    const userId = biz[0].user_id;

    const { rows } = await pool.query(
      `SELECT * FROM promo_codes
       WHERE user_id=$1 AND UPPER(code)=UPPER($2) AND is_active=TRUE
         AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
         AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
         AND (max_uses IS NULL OR uses_count < max_uses)`,
      [userId, code.trim()]
    );
    if (!rows.length) return res.json({ valid: false, error: 'Code invalide ou expiré.' });

    const promo     = rows[0];
    const baseAmt   = parseFloat(amount) || 0;
    const discount  = promo.type === 'percent'
      ? Math.min(baseAmt, baseAmt * parseFloat(promo.value) / 100)
      : Math.min(baseAmt, parseFloat(promo.value));

    res.json({
      valid:    true,
      promo_id: promo.id,
      type:     promo.type,
      value:    parseFloat(promo.value),
      discount: Math.round(discount * 100) / 100,
    });
  } catch(e) { res.status(500).json({ valid: false, error: e.message }); }
});


// ── POST /:slug/check-promo ── Valider un code promo côté public ─────────────
router.post('/:slug/check-promo', async (req, res) => {
  try {
    const { rows: biz } = await pool.query(
      `SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE`,
      [req.params.slug]
    );
    if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
    const userId = biz[0].user_id;

    const { code, amount } = req.body;
    if (!code) return res.status(400).json({ valid: false, error: 'Code requis.' });

    const { rows } = await pool.query(
      `SELECT * FROM promo_codes
       WHERE user_id=$1 AND UPPER(code)=UPPER($2) AND is_active=TRUE
         AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
         AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
         AND (max_uses IS NULL OR uses_count < max_uses)`,
      [userId, code.trim()]
    );
    if (!rows.length) {
      const { rows: expired } = await pool.query(
        `SELECT is_active, valid_until, uses_count, max_uses FROM promo_codes WHERE user_id=$1 AND UPPER(code)=UPPER($2)`,
        [userId, code.trim()]
      );
      if (expired.length) {
        const e = expired[0];
        if (!e.is_active) return res.json({ valid: false, error: 'Ce code a été désactivé.' });
        if (e.valid_until && new Date(e.valid_until) < new Date()) return res.json({ valid: false, error: `Ce code a expiré le ${new Date(e.valid_until).toLocaleDateString('fr-FR')}.` });
        if (e.max_uses && e.uses_count >= e.max_uses) return res.json({ valid: false, error: 'Ce code a déjà été utilisé le nombre maximum de fois.' });
      }
      return res.json({ valid: false, error: 'Code invalide ou inconnu.' });
    }

    const promo = rows[0];
    const { client_email } = req.body;
    const baseAmt = parseFloat(amount) || 0;

    // Vérifier owner pour codes fidélité
    if (promo.is_loyalty_reward && promo.owner_client_email && client_email) {
      if (promo.owner_client_email.toLowerCase() !== client_email.toLowerCase()) {
        return res.json({ valid: false, error: `Ce code de fidélité appartient à un autre client et ne peut pas être utilisé ici.` });
      }
    }

    // Vérifier montant minimum d'achat
    const minPurchase = parseFloat(promo.min_purchase) || 0;
    if (minPurchase > 0 && baseAmt > 0 && baseAmt < minPurchase) {
      return res.json({ valid: false, error: `Ce code nécessite un minimum d'achat de ${minPurchase.toFixed(2)} €. Montant actuel : ${baseAmt.toFixed(2)} €.` });
    }

    const discount = promo.type === 'percent'
      ? Math.min(baseAmt, baseAmt * parseFloat(promo.value) / 100)
      : Math.min(baseAmt, parseFloat(promo.value));

    res.json({
      valid:    true,
      promo_id: promo.id,
      type:     promo.type,
      value:    parseFloat(promo.value),
      min_purchase: minPurchase,
      discount: Math.round(discount * 100) / 100,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  GOOGLE OAUTH — Connexion client via compte Google
//  Callback générique — le slug est passé dans le state OAuth
// ═══════════════════════════════════════════════════════════════════════════

// GET /:slug/client/auth/google — redirige vers Google
router.get('/:slug/client/auth/google', (req, res) => {
  const { slug } = req.params;
  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const BACKEND_URL = process.env.BACKEND_URL || 'https://flowia-backend.onrender.com';
  // Callback générique — 1 seule URL enregistrée chez Google
  const redirectUri = `${BACKEND_URL}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    prompt:        'select_account',
    state:         slug,   // slug transmis via state OAuth
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// NOTE : Callback générique dans backend/src/routes/auth.js → GET /api/auth/google/callback

// ── DELETE /:slug/client/account — suppression définitive avec anonymisation ─
// Logique métier:
// 1. Résoudre le client via son token (client_accounts + global_clients)
// 2. Annuler tous les RDV futurs (confirmed/pending) avec raison "Compte supprimé"
// 3. Anonymiser les RDV passés: client_name→"Client anonyme", client_email/phone→NULL
//    Garde le lien avec appointments pour la comptabilité du merchant.
// 4. Supprimer toutes les fiches client_accounts liées au globalClientId du token
// 5. Supprimer le global_clients
// 6. Les transactions restent intactes (elles ne contiennent aucune donnée personnelle)
router.delete('/:slug/client/account', async (req, res) => {
  const client = await pool.connect();
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Non authentifié.' });
    let decoded;
    try { decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Token invalide.' }); }
    if (decoded.scope !== 'client') return res.status(403).json({ error: 'Accès refusé.' });

    // Résoudre email + globalClientId (robuste aux fiches locales supprimées)
    let clientEmail = null;
    let gcId = decoded.globalClientId || null;
    {
      const { rows: loc } = await client.query(
        'SELECT email, global_client_id FROM client_accounts WHERE id=$1',
        [decoded.clientId]
      );
      if (loc[0]) {
        clientEmail = loc[0].email || null;
        if (!gcId) gcId = loc[0].global_client_id;
      }
      if (!clientEmail && gcId) {
        const { rows: gc } = await client.query('SELECT email FROM global_clients WHERE id=$1', [gcId]);
        clientEmail = gc[0]?.email || null;
      }
    }
    if (!clientEmail) return res.status(400).json({ error: 'Compte introuvable.' });

    const emailLow = clientEmail.toLowerCase();

    await client.query('BEGIN');

    // 1. Annuler RDV futurs
    const { rowCount: cancelledFuture } = await client.query(
      `UPDATE appointments SET status='cancelled',
         cancel_reason='Compte client supprimé',
         updated_at=NOW()
       WHERE LOWER(client_email)=$1
         AND status IN ('confirmed','pending')
         AND date >= CURRENT_DATE`,
      [emailLow]
    );

    // 2. Anonymiser TOUS les appointments du client (passés + futurs annulés)
    const { rowCount: anonymized } = await client.query(
      `UPDATE appointments SET
         client_id    = NULL,
         client_name  = 'Client anonyme',
         client_email = NULL,
         client_phone = NULL
       WHERE LOWER(client_email)=$1`,
      [emailLow]
    );

    // 3. Anonymiser les logs promo associés (traçabilité merchant conservée)
    await client.query(
      `UPDATE promo_usage_logs SET client_email=NULL, client_name='Client anonyme'
       WHERE LOWER(client_email)=$1`,
      [emailLow]
    ).catch(() => {});

    // 4. Supprimer toutes les fiches locales liées au compte global
    if (gcId) {
      await client.query('DELETE FROM client_accounts WHERE global_client_id=$1', [gcId]);
      await client.query('DELETE FROM global_clients WHERE id=$1', [gcId]);
    } else {
      // Fallback sans globalClientId: suppression fiche unique
      await client.query('DELETE FROM client_accounts WHERE id=$1', [decoded.clientId]);
    }

    // 5. Supprimer fiches locales restantes pour sécurité (cas rare de fiches orphelines)
    await client.query('DELETE FROM client_accounts WHERE LOWER(email)=$1', [emailLow]);

    await client.query('COMMIT');
    console.log(`[ACCOUNT DELETE] email=${emailLow} cancelledFuture=${cancelledFuture} anonymized=${anonymized}`);

    res.json({
      ok: true,
      cancelled_future_appointments: cancelledFuture,
      anonymized_appointments: anonymized,
      message: 'Compte supprimé et données anonymisées.',
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[ACCOUNT DELETE ERR]', e.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  } finally { client.release(); }
});

module.exports = router;