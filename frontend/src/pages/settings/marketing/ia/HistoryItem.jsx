import MiniKpi from '../components/MiniKpi';

export default function HistoryItem({ c, theme }) {
  const isDark = theme.mode === 'dark';
  const convPct = Math.round((c.conversion_rate || 0) * 100);
  const date = new Date(c.created_at).toLocaleDateString('fr-FR', {
    day:'2-digit', month:'short', year:'numeric'
  });
  const isGood = convPct >= 10 || c.roi >= 2;
  return (
    <div style={{ padding:'12px 14px', borderRadius:12, background:theme.card, border:`1px solid ${theme.border}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div>
          <p style={{ margin:0, fontSize:13, fontWeight:800, color:theme.text }}>
            Campagne {date}
          </p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>
            {c.total_sms} SMS · {c.duration_days}j · {c.total_cost.toFixed(2)}€
          </p>
        </div>
        <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:6,
          background: c.status === 'completed' ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.12)',
          color: c.status === 'completed' ? '#10b981' : '#6366f1' }}>
          {c.status === 'completed' ? 'Terminée' : 'En cours'}
        </span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
        <MiniKpi theme={theme} label="Envoyés" value={c.codes_sent} accent="#6366f1" />
        <MiniKpi theme={theme} label="Utilisés" value={c.codes_used} accent={isGood ? '#10b981' : theme.text} />
        <MiniKpi theme={theme} label="Taux" value={`${convPct}%`} accent={convPct >= 10 ? '#10b981' : theme.text} />
      </div>
      {c.real_revenue > 0 && (
        <div style={{ marginTop:10, padding:'8px 10px', borderRadius:8,
          background: isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)',
          border:'1px solid rgba(16,185,129,0.25)',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, color:theme.muted }}>CA réel généré</span>
          <span style={{ fontSize:14, fontWeight:900, color:'#10b981', fontFamily:'monospace' }}>
            +{c.real_revenue.toFixed(2)}€ {c.roi > 0 && <span style={{ fontSize:11, opacity:0.8 }}>(ROI x{c.roi})</span>}
          </span>
        </div>
      )}
    </div>
  );
}
