// Helpers purs extraits de TabEquipe.jsx

export const toMinClient = (t) => { const s = String(t||'0:0').substring(0,5); const [h,m]=s.split(':').map(Number); return h*60+m; };

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
