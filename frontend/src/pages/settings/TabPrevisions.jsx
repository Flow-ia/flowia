import { useState, useEffect } from 'react';
import { I } from '../../utils/icons';
import { statsApi } from '../../utils/api';
import { SegmentedControl } from '../../components/primitives';

export default function TabPrevisions({ theme }) {
  const t = theme;
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths]   = useState(3);

  useEffect(() => {
    setLoading(true);
    statsApi.getForecast({ months })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [months]);

  const fmt = v => Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const fmtFull = v => Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const MONTH_FR = ['Jan','Fev','Mar','Avr','Mai','Juin','Juil','Aou','Sep','Oct','Nov','Dec'];
  const fmtMonth = m => { if (!m) return ''; const [, mm] = m.split('-'); return MONTH_FR[parseInt(mm) - 1]; };

  const allData = data
    ? [...(data.historical || []).map(h => ({ ...h, type:'historical' })),
       ...(data.forecasts  || []).map(f => ({ ...f, revenue:f.projected, type:'forecast' }))]
    : [];
  const maxVal = allData.reduce((m, d) => Math.max(m, parseFloat(d.projected_high || d.revenue) || 0), 1);

  const positive = data && data.slope >= 0;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {data && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ borderRadius:12, padding:'14px 16px', background:'#f0fdf4' }}>
            <p style={{ fontSize:11, color:'#065f46', margin:0 }}>
              Moyenne mensuelle
            </p>
            <p style={{ fontSize:20, fontWeight:500, color:'#065f46',
                        fontFamily:'var(--mono)', margin:'6px 0 0' }}>
              {fmt(data.avg_monthly)} DA
            </p>
          </div>
          <div style={{ borderRadius:12, padding:'14px 16px',
                        background: positive ? t.cardAlt : '#fef2f2' }}>
            <p style={{ fontSize:11, color: positive ? t.muted : '#991b1b', margin:0 }}>
              Tendance
            </p>
            <p style={{ fontSize:20, fontWeight:500,
                        color: positive ? t.text : '#991b1b',
                        fontFamily:'var(--mono)', margin:'6px 0 0' }}>
              {positive ? '↗' : '↘'} {positive ? '+' : ''}{fmtFull(data.slope)} DA/mois
            </p>
          </div>
        </div>
      )}

      <SegmentedControl fullWidth value={months} onChange={setMonths}
                        options={[1, 2, 3, 6].map(m => ({ value:m, label:`${m} mois` }))}/>

      {loading ? (
        <div style={{ padding:'64px 0', textAlign:'center' }}>
          <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24"
               style={{ color:t.muted, display:'inline-block' }}>
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
            <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      ) : !data || allData.length < 2 ? (
        <div style={{ textAlign:'center', padding:'40px 20px',
                      background:t.card, borderRadius:12,
                      border:`0.5px solid ${t.border}` }}>
          <I.TrendUp style={{ width:36, height:36, margin:'0 auto 10px', color:t.dim }}/>
          <p style={{ color:t.muted, fontSize:14, margin:0 }}>
            Pas assez de donnees (min. 2 mois)
          </p>
        </div>
      ) : (
        <>
          <div style={{ background:t.card, borderRadius:12, padding:16,
                        border:`0.5px solid ${t.border}` }}>
            <p style={{ fontSize:12, color:t.muted, margin:'0 0 16px' }}>
              Historique + Previsions
            </p>
            <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:120 }}>
              {allData.map((d, i) => {
                const h = Math.max(4, ((parseFloat(d.revenue) || 0) / maxVal) * 100);
                const isForecast = d.type === 'forecast';
                return (
                  <div key={i} style={{ flex:1, display:'flex', flexDirection:'column',
                                        alignItems:'center', gap:3 }}>
                    {isForecast && (
                      <div style={{ width:'100%',
                                    height: Math.max(4, ((d.projected_high - d.projected_low) / maxVal) * 100),
                                    borderRadius:'6px 6px 0 0',
                                    background:'rgba(67,56,202,0.12)',
                                    position:'relative',
                                    top: `${100 - Math.max(4, (d.projected_high / maxVal) * 100)}%` }}/>
                    )}
                    <div style={{ width:'100%', height:`${h}%`,
                                  borderRadius: isForecast ? '8px 8px 0 0' : '6px 6px 0 0',
                                  background: isForecast ? '#4338ca' : '#065f46',
                                  marginTop:'auto' }}/>
                    <span style={{ fontSize:9, fontWeight:500,
                                   color: isForecast ? '#4338ca' : t.muted }}>
                      {fmtMonth(d.month)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ display:'flex', gap:12, marginTop:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:'#065f46' }}/>
                <span style={{ fontSize:11, color:t.muted }}>Reel</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:'#4338ca' }}/>
                <span style={{ fontSize:11, color:t.muted }}>Prevision</span>
              </div>
            </div>
          </div>

          {data.forecasts?.length > 0 && (
            <div style={{ background:t.card, borderRadius:12,
                          border:`0.5px solid ${t.border}`, overflow:'hidden' }}>
              <p style={{ fontSize:12, color:t.muted, margin:0,
                          padding:'12px 16px',
                          borderBottom:`0.5px solid ${t.separator}` }}>
                Detail des previsions
              </p>
              {data.forecasts.map((f, i) => (
                <div key={i} style={{ padding:'12px 16px',
                                       borderBottom: i < data.forecasts.length - 1
                                         ? `0.5px solid ${t.separator}` : 'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:14, fontWeight:500, color:t.text }}>
                      {MONTH_FR[parseInt(f.month.split('-')[1]) - 1]} {f.month.split('-')[0]}
                    </span>
                    <span style={{ fontSize:16, fontWeight:500,
                                   fontFamily:'var(--mono)', color:'#4338ca' }}>
                      {fmtFull(f.projected)} DA
                    </span>
                  </div>
                  <p style={{ fontSize:11, color:t.muted, margin:'2px 0 0' }}>
                    Fourchette : {fmtFull(f.projected_low)} DA — {fmtFull(f.projected_high)} DA
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
