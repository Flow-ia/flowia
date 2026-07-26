// Helpers purs extraits de TabEquipe.jsx

export const toMinClient = (t) => { const s = String(t||'0:0').substring(0,5); const [h,m]=s.split(':').map(Number); return h*60+m; };

export const minToStr = (m) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

// Plages RÉELLEMENT ouvertes du commerce pour un jour : horaires d'ouverture
// moins les pauses. Réplique exacte de getBusinessOpenRanges côté backend
// (public-booking/helpers.js) — c'est CETTE géométrie que le moteur de
// réservation utilise, la validation frontend doit s'y aligner.
export function getBizOpenRangesClient(bizHours, bizBreaks, dayOfWeek) {
  const bh = (bizHours || []).find(h => (h.day_of_week ?? 0) === dayOfWeek);
  if (!bh || bh.is_open === false) return [];
  let ranges = [{ start: toMinClient(bh.open_time || '09:00'), end: toMinClient(bh.close_time || '18:00') }];
  const dayBreaks = (bizBreaks || []).filter(b => (b.day_of_week ?? 0) === dayOfWeek);
  for (const brk of dayBreaks) {
    const bs = toMinClient(brk.break_start);
    const be = toMinClient(brk.break_end);
    const next = [];
    for (const r of ranges) {
      if (be <= r.start || bs >= r.end) { next.push(r); continue; }
      if (bs > r.start) next.push({ start: r.start, end: bs });
      if (be < r.end)   next.push({ start: be,      end: r.end });
    }
    ranges = next;
  }
  return ranges.filter(r => r.start < r.end).sort((a, b) => a.start - b.start);
}

// Intersecte une plage employé avec les plages ouvertes du commerce.
// Retourne les segments résultants (0..n) en minutes. Une plage qui chevauche
// une pause est DÉCOUPÉE autour (comportement du moteur de réservation), pas
// rejetée.
export function clampSlotToBiz(slotStart, slotEnd, bizHours, bizBreaks, dayOfWeek) {
  const sMin = toMinClient(slotStart);
  const eMin = toMinClient(slotEnd);
  if (sMin >= eMin) return [];
  const ranges = getBizOpenRangesClient(bizHours, bizBreaks, dayOfWeek);
  const out = [];
  for (const r of ranges) {
    const start = Math.max(sMin, r.start);
    const end   = Math.min(eMin, r.end);
    if (start < end) out.push({ start, end });
  }
  return out;
}

export function isSlotInBizRanges(slotStart, slotEnd, bizHours, bizBreaks, dayOfWeek) {
  const bh = bizHours.find(h=>(h.day_of_week??0)===dayOfWeek);
  if (!bh || bh.is_open===false) return false;
  const bizOpen  = toMinClient(bh.open_time||'09:00');
  const bizClose = toMinClient(bh.close_time||'18:00');
  const sMin = toMinClient(slotStart);
  const eMin = toMinClient(slotEnd);
  if (sMin < bizOpen || eMin > bizClose || sMin >= eMin) return false;
  const dayBreaks = (bizBreaks||[]).filter(b=>(b.day_of_week??0)===dayOfWeek);
  for (const brk of dayBreaks) {
    const bs = toMinClient(brk.break_start);
    const be = toMinClient(brk.break_end);
    if (sMin < be && eMin > bs) return false;
  }
  return true;
}
