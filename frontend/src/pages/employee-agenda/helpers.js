// src/pages/employee-agenda/helpers.js
import { DAYS_FULL, MONTHS_FR } from './constants';

export const fmtTime = t => t ? String(t).substring(0,5) : '';

export const fmtDateFull = d => {
  if (!d) return '';
  const [y,m,day] = d.split('-').map(Number);
  return `${DAYS_FULL[new Date(y,m-1,day).getDay()]} ${day} ${MONTHS_FR[m-1]} ${y}`;
};

export const svLocal = d => d.toLocaleDateString('sv-SE');
export const toMin   = t => { const [h,m] = String(t||'0:0').split(':').map(Number); return h*60+m; };
export const fromMin = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
