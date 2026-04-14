export const p2 = n => String(n).padStart(2, '0');
export const fmtDate = d => { const x = new Date(d); return `${x.getFullYear()}-${p2(x.getMonth() + 1)}-${p2(x.getDate())}`; };
export const fmtTime = d => { const x = new Date(d); return `${p2(x.getHours())}:${p2(x.getMinutes())}`; };
export const todayStr = () => fmtDate(new Date());
export const nowStr = () => fmtTime(new Date());
export const DS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const MS = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const ML = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'decembre'];

export const disp = (ds, s) => {
  const d = new Date(ds + 'T12:00:00');
  if (s === 'short') return `${d.getDate()} ${MS[d.getMonth()]}`;
  if (s === 'day') return DS[d.getDay()];
  if (s === 'dm') return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
  if (s === 'long') return `${DL[d.getDay()]} ${d.getDate()} ${ML[d.getMonth()]} ${d.getFullYear()}`;
  return ds;
};

export const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const eod = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
export const som = d => { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; };
export const eom = d => { const x = new Date(d); x.setMonth(x.getMonth() + 1, 0); x.setHours(23, 59, 59, 999); return x; };
export const subD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() - n); return x; };
export const subM = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() - n); return x; };
export const eachDay = ({ start, end }) => {
  const r = []; let c = new Date(start);
  while (c <= end) { r.push(fmtDate(c)); c.setDate(c.getDate() + 1); }
  return r;
};
