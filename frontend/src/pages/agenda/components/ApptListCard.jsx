import { STATUS_CFG } from '../constants';
import { fmtTime } from '../helpers';

export default function ApptListCard({ a, onOpen, isDark, t }) {
  const st = STATUS_CFG[a.status]||STATUS_CFG.confirmed;
  return (
    <div className="rounded-2xl p-3.5" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-1 rounded-full self-stretch flex-shrink-0" style={{ background:a.service_color||a.employee_color||'#111827', minHeight:36 }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm" style={{ color:t.text }}>{fmtTime(a.start_time)}–{fmtTime(a.end_time)}</span>
              {a.paid&&<span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background:'rgba(74,222,128,0.15)',color:'#4ade80' }}>✓ Payé</span>}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background:st.bg, color:st.color }}>{st.label}</span>
            </div>
            <p className="font-semibold text-sm mt-0.5" style={{ color:t.text }}>{a.client_name}</p>
            <p className="text-xs mt-0.5" style={{ color:t.muted }}>
              {a.items&&a.items.length>1 ? `${a.items.length} services · ${a.total_duration||a.duration_minutes}min` : `${a.service_name||'RDV'} · ${a.total_duration||a.duration_minutes}min`}
              {parseFloat(a.total_amount||a.service_price||0)>0&&` · ${parseFloat(a.total_amount||a.service_price).toFixed(2)} €`}
            </p>
            {a.employee_name&&(
              <div className="flex items-center gap-1 mt-1">
                <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white font-black flex-shrink-0" style={{ fontSize:7, backgroundColor:a.employee_color||'#111827' }}>{a.employee_name.charAt(0)}</div>
                <span className="text-[10px]" style={{ color:t.muted }}>{a.employee_name}</span>
              </div>
            )}
            {a.client_phone&&<p className="text-xs mt-0.5" style={{ color:t.muted }}>📞 {a.client_phone}</p>}
          </div>
        </div>
        <button onClick={()=>onOpen(a)} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" style={{ color:t.muted }}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
        </button>
      </div>
    </div>
  );
}
