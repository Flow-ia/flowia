import { DAYS_FULL, MONTHS_FR } from './constants';

export const fmtTime  = t  => t ? String(t).substring(0,5) : '';

export const fmtDateL = d  => {
  if (!d) return '';
  const [y,m,day] = d.split('-').map(Number);
  return `${DAYS_FULL[new Date(y,m-1,day).getDay()]} ${day} ${MONTHS_FR[m-1]} ${y}`;
};

export const toMin = t => { const [h,m] = String(t||'0:0').split(':').map(Number); return h*60+m; };
export const fromMin = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export const svLocal = d => d.toLocaleDateString('sv-SE');

// Utilitaire horaires côté client (version tolérante pour strings "HH:MM:SS")
export const toMinClient = (t) => {
  const s = String(t||'0:0').substring(0,5);
  const [h,m] = s.split(':').map(Number);
  return h*60+m;
};

// Vérifie si une plage employé est dans les plages ouvertes du commerce (hors pauses)
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
