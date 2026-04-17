import { I } from '../../utils/icons';

export const nd = (d) => { if (!d) return ''; const s = typeof d === 'string' ? d : new Date(d).toISOString(); return s.substring(0, 10); };
export const fmt = (n) => Number(n || 0).toFixed(2);
export const ML = ['janvier','fevrier','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','decembre'];

export const PAY_INFO = {
  cash:     { label: 'Especes',  color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.2)',  Ic: I.Wallet },
  card:     { label: 'Carte',    color: '#1a73e8', bg: 'rgba(26,115,232,0.1)', border: 'rgba(26,115,232,0.2)', Ic: I.CreditCard },
  transfer: { label: 'Virement', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.2)',  Ic: I.Bank },
  other:    { label: 'Autre',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)',  Ic: I.MoreH },
};
export const PAY_KEYS = ['cash','card','transfer','other'];

export function Card({ children, className = '', style = {}, theme }) {
  return (
    <div className={`rounded-3xl overflow-hidden ${className}`} style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.mode === 'light' ? '0 2px 12px rgba(0,0,0,0.05)' : 'none', ...style }}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, theme }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest mb-2 px-1" style={{ color: theme.muted }}>{children}</p>;
}

export function KpiBox({ label, value, unit = '€', color, bg, border }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="text-[10px] font-semibold mb-1.5" style={{ color }}>{label}</p>
      <p className="text-xl font-bold leading-none" style={{ color }}>
        {value}<span className="text-sm font-normal opacity-50 ml-0.5">{unit}</span>
      </p>
    </div>
  );
}
