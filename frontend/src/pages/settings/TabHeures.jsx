import { useState, useEffect } from 'react';
import { I } from '../../utils/icons';
import { statsApi } from '../../utils/api';
import { SegmentedControl } from '../../components/primitives';

export default function TabHeures({ theme }) {
  const t = theme;
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState('3m');

  const PERIODS = { '1m':'1 mois', '3m':'3 mois', '6m':'6 mois', '1y':'1 an' };
  const periodQuery = (p) => {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date();
    if (p === '1m') from.setMonth(from.getMonth() - 1);
    else if (p === '3m') from.setMonth(from.getMonth() - 3);
    else if (p === '6m') from.setMonth(from.getMonth() - 6);
    else from.setFullYear(from.getFullYear() - 1);
    return { from: from.toISOString().split('T')[0], to };
  };

  useEffect(() => {
    setLoading(true);
    statsApi.getHeatmap(periodQuery(period))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  const DAYS_FR = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const HOURS   = Array.from({ length:13 }, (_, i) => i + 8);
  const getCellColor = (count) => {
    if (!count || !data?.maxCount) return t.cardAlt;
    const pct = count / data.maxCount;
    // Pastel indigo gradient (cf palette info onboarding)
    if (pct > 0.8) return '#4338ca';
    if (pct > 0.6) return 'rgba(67,56,202,0.7)';
    if (pct > 0.4) return 'rgba(67,56,202,0.45)';
    if (pct > 0.2) return 'rgba(67,56,202,0.25)';
    return 'rgba(67,56,202,0.1)';
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <SegmentedControl fullWidth value={period} onChange={setPeriod}
                        options={Object.entries(PERIODS).map(([k, l]) => ({ value:k, label:l }))}/>

      {loading ? (
        <div style={{ padding:'64px 0', textAlign:'center' }}>
          <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24"
               style={{ color:t.muted, display:'inline-block' }}>
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
            <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      ) : !data ? null : (
        <div style={{ background:t.card, borderRadius:12, padding:16, overflowX:'auto',
                      border:`0.5px solid ${t.border}` }}>
          <p style={{ fontSize:12, color:t.muted, margin:'0 0 14px' }}>
            Activite par heure et jour
          </p>
          <div style={{ minWidth:340 }}>
            <div style={{ display:'flex', gap:2, marginLeft:32, marginBottom:4 }}>
              {HOURS.map(h => (
                <div key={h} style={{ width:24, textAlign:'center',
                                      fontSize:9, fontWeight:500, color:t.dim }}>
                  {h}h
                </div>
              ))}
            </div>
            {DAYS_FR.map((day, dow) => (
              <div key={dow} style={{ display:'flex', alignItems:'center', gap:2, marginBottom:2 }}>
                <span style={{ width:30, fontSize:10, fontWeight:500, color:t.muted,
                               textAlign:'right', paddingRight:4 }}>
                  {day}
                </span>
                {HOURS.map(h => {
                  const key = `${dow}_${h}`;
                  const cell = data.grid?.[key];
                  return (
                    <div key={h}
                         title={cell ? `${cell.count} tx · ${Number(cell.revenue).toFixed(0)} €` : '-'}
                         style={{ width:24, height:24, borderRadius:6,
                                  background: getCellColor(cell?.count || 0),
                                  cursor:'default', transition:'transform 0.1s' }}
                         onMouseEnter={e => { e.target.style.transform = 'scale(1.2)'; }}
                         onMouseLeave={e => { e.target.style.transform = 'scale(1)'; }}/>
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:12 }}>
            <span style={{ fontSize:10, color:t.muted }}>Moins</span>
            {[0, 0.2, 0.45, 0.7, 1].map((v, i) => (
              <div key={i} style={{ width:16, height:16, borderRadius:6,
                                    background: v === 0 ? t.cardAlt : `rgba(67,56,202,${v})` }}/>
            ))}
            <span style={{ fontSize:10, color:t.muted }}>Plus</span>
          </div>
        </div>
      )}

      {data?.maxCount === 0 && (
        <p style={{ textAlign:'center', color:t.muted, fontSize:13 }}>
          {"Aucune transaction avec horaire sur cette periode. Assurez-vous d'enregistrer l'heure lors des encaissements."}
        </p>
      )}
    </div>
  );
}
