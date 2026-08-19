import MiniKpi from '../components/MiniKpi';

export default function HistoryItem({ c, theme }) {
  const t = theme;
  const convPct = Math.round((c.conversion_rate || 0) * 100);
  const date = new Date(c.created_at).toLocaleDateString('fr-FR', {
    day:'2-digit', month:'short', year:'numeric',
  });
  const isGood = convPct >= 10 || c.roi >= 2;
  return (
    <div style={{ padding:'12px 14px', borderRadius:12,
                  background:t.card, border:`0.5px solid ${t.border}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div>
          <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>
            Campagne {date}
          </p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
            {c.total_sms} SMS · {c.duration_days}j · {Number(c.total_cost || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DA
          </p>
        </div>
        <span style={{ fontSize:11, fontWeight:500, padding:'3px 8px', borderRadius:99,
                       background: c.status === 'completed' ? '#f0fdf4' : '#eef2ff',
                       color: c.status === 'completed' ? '#065f46' : '#4338ca' }}>
          {c.status === 'completed' ? 'Terminee' : 'En cours'}
        </span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6 }}>
        <MiniKpi theme={theme} label="Envoyes" value={c.codes_sent} accent="#4338ca"/>
        <MiniKpi theme={theme} label="Utilises" value={c.codes_used} accent={isGood ? '#065f46' : t.text}/>
        <MiniKpi theme={theme} label="Taux"    value={`${convPct}%`} accent={convPct >= 10 ? '#065f46' : t.text}/>
      </div>
      {c.real_revenue > 0 && (
        <div style={{ marginTop:10, padding:'8px 12px', borderRadius:8,
                      background:'#f0fdf4',
                      display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, color:'#065f46', opacity:0.85 }}>CA reel genere</span>
          <span style={{ fontSize:14, fontWeight:500, color:'#065f46', fontFamily:'monospace' }}>
            +{Number(c.real_revenue || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DA {c.roi > 0 && <span style={{ fontSize:11, opacity:0.8 }}>(ROI x{c.roi})</span>}
          </span>
        </div>
      )}
    </div>
  );
}
