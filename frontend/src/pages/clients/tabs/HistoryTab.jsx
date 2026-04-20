// src/pages/clients/tabs/HistoryTab.jsx
import { fmtDate } from '../helpers';
import { STATUS_COLOR, STATUS_LABEL } from '../constants';

// ─── Onglet Historique ────────────────────────────────────────────────────────
export default function HistoryTab({ theme, card, fiche }) {
  return (
    <div style={{ marginBottom:12 }}>
      {(fiche.transactions||[]).length > 0 && (
        <div style={{ marginBottom:16 }}>
          <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:800, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.07em' }}>Encaissements</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {fiche.transactions.map((tx,i) => (
              <div key={i} style={{ ...card, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ minWidth:0 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:700, color:theme.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.description||'Encaissement'}</p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>{fmtDate(tx.date)}{tx.employee_name?` · ${tx.employee_name}`:''}</p>
                </div>
                <div style={{ textAlign:'right', flexShrink:0, marginLeft:10 }}>
                  {tx.original_amount && tx.original_amount !== tx.amount && (
                    <p style={{ margin:0, fontSize:11, color:theme.muted, textDecoration:'line-through' }}>{Number(tx.original_amount).toFixed(2)} €</p>
                  )}
                  <span style={{ fontSize:15, fontWeight:900, color:'#10b981' }}>{Number(tx.amount||0).toFixed(2)} €</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {(fiche.appointments||[]).length > 0 && (
        <div style={{ marginBottom:16 }}>
          <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:800, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.07em' }}>Rendez-vous</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {fiche.appointments.map((a,i) => (
              <div key={i} style={{ ...card, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ minWidth:0 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:700, color:theme.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.service_name||'Rendez-vous'}</p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>{fmtDate(a.date)}{a.start_time?` · ${String(a.start_time).slice(0,5)}`:''}</p>
                </div>
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99, flexShrink:0, marginLeft:8, color:STATUS_COLOR[a.status]||'#94a3b8', background:`${STATUS_COLOR[a.status]||'#94a3b8'}18` }}>
                  {STATUS_LABEL[a.status]||a.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {(fiche.transactions||[]).length===0 && (fiche.appointments||[]).length===0 && (
        <div style={{ textAlign:'center', padding:'40px 0', color:theme.muted }}>
          <p style={{ fontSize:32, margin:'0 0 8px' }}>📭</p>
          <p style={{ fontSize:14, fontWeight:600 }}>Aucun historique disponible</p>
        </div>
      )}
    </div>
  );
}
