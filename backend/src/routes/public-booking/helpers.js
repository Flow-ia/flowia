const { pool } = require('../../db');

// ── Utilitaire temps ────────────────────────────────────────────────────────
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

// ── Charger les plages horaires ouvertes du commerce pour un jour ───────────
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
        split.push(range);
      } else {
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

// ── Intersection de deux ensembles de plages ────────────────────────────────
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

// ── Plages horaires effectives d'un employé pour une date ───────────────────
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
  if (!bizRanges.length) return [];

  // 3. Vérifier nouveau système : plages multiples employee_time_slots.
  // On charge la SEMAINE entière (pas seulement le jour demandé) : un employé
  // qui utilise ce système et n'a AUCUNE plage sur un jour donné est ABSENT ce
  // jour-là ("Absent ce jour" côté réglages Équipe). Avant, la requête filtrée
  // par jour renvoyait [] et on retombait sur les horaires du commerce → un
  // employé restait réservable son jour de repos.
  const { rows: allEmpSlots } = await pool.query(
    `SELECT day_of_week, slot_start, slot_end FROM employee_time_slots
     WHERE employee_id=$1 AND user_id=$2
     ORDER BY slot_start`,
    [employeeId, userId]
  );

  if (allEmpSlots.length) {
    const empSlots = allEmpSlots.filter(s => Number(s.day_of_week) === dayOfWeek);
    if (!empSlots.length) return []; // jour de repos explicite
    const empRanges = empSlots.map(s => ({ openMin: toMin(s.slot_start), closeMin: toMin(s.slot_end) }));
    return intersectRanges(empRanges, bizRanges);
  }

  // 4. Ancien système : employee_hours (1 plage par jour)
  const { rows: empH } = await pool.query(
    `SELECT open_time, close_time, is_open, COALESCE(use_business_hours, TRUE) AS use_biz
     FROM employee_hours WHERE employee_id=$1 AND day_of_week=$2`,
    [employeeId, dayOfWeek]
  );

  // AUDIT booking #10 : is_open=FALSE doit fermer l'employé même si
  // use_business_hours=TRUE (jour off explicite prime).
  if (empH.length && empH[0].is_open === false) return [];

  if (empH.length && !empH[0].use_biz) {
    const empRange = [{ openMin: toMin(empH[0].open_time), closeMin: toMin(empH[0].close_time) }];
    return intersectRanges(empRange, bizRanges);
  }

  // 5. Pas de config spécifique → suit les horaires du commerce
  return bizRanges;
}

// ── Compatibilité avec l'ancien code ────────────────────────────────────────
async function getEmployeeOpenClose(userId, employeeId, date) {
  const ranges = await getEmployeeRanges(userId, employeeId, date);
  if (!ranges.length) return null;
  return { openMin: ranges[0].openMin, closeMin: ranges[ranges.length-1].closeMin, ranges };
}

// ── Génère les créneaux dispo — supporte plages multiples + pauses ──────────
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

async function getSlots(userId, employeeId, date, durationMin, minNoticeMin = 0, timezone = 'Europe/Paris') {
  const [y, m, d] = date.split('-').map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay();

  // AUDIT booking #6 + #7 : "today" & "now" calculés dans le fuseau du commerçant
  const { rows: tzNow } = await pool.query(
    `SELECT TO_CHAR(NOW() AT TIME ZONE $1, 'YYYY-MM-DD') AS today,
            EXTRACT(HOUR   FROM NOW() AT TIME ZONE $1)::int AS h,
            EXTRACT(MINUTE FROM NOW() AT TIME ZONE $1)::int AS mi`,
    [timezone]
  );
  const todayStr = tzNow[0].today;
  const isToday  = date === todayStr;
  const nowMin   = isToday ? (tzNow[0].h * 60 + tzNow[0].mi + minNoticeMin) : 0;

  // Vérifier que le commerce est ouvert (avec pauses intégrées)
  const bizRanges = await getBusinessOpenRanges(userId, dayOfWeek);
  if (!bizRanges.length) return [];

  if (employeeId) {
    const empRanges = await getEmployeeRanges(userId, employeeId, date);
    if (!empRanges.length) return [];

    const { rows: existing } = await pool.query(
      `SELECT start_time, end_time FROM appointments
       WHERE user_id=$1 AND date=$2 AND employee_id=$3 AND status NOT IN ('cancelled')`,
      [userId, date, employeeId]
    );
    return getSlotsForRanges(empRanges, durationMin, existing, nowMin, isToday);
  }

  // Pas d'employé : union des créneaux de tous les employés actifs
  const { rows: allEmps } = await pool.query(
    `SELECT id FROM employees WHERE user_id=$1 AND is_active=TRUE AND show_on_booking=TRUE`,
    [userId]
  );

  if (!allEmps.length) {
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

module.exports = {
  toMin,
  toStr,
  getBusinessBreaks,
  getBusinessOpenRanges,
  intersectRanges,
  getEmployeeRanges,
  getEmployeeOpenClose,
  getSlotsForRanges,
  getSlots,
};
