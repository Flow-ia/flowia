import { useState, useEffect } from 'react';
import { I } from '../../utils/icons';
import { statsApi } from '../../utils/api';

export default function TabPrevisions({ theme }) {
  const isDark = theme.mode === 'dark';
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths]   = useState(3);

  useEffect(() => {
    setLoading(true);
    statsApi.getForecast({ months }).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [months]);

  const fmt = v => Number(v||0).toFixed(0);
  const fmtFull = v => Number(v||0).toFixed(2);
  const MONTH_FR = ['Jan','Fev','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Dec'];
  const fmtMonth = m => { if (!m) return ''; const [,mm] = m.split('-'); return MONTH_FR[parseInt(mm)-1]; };

  const allData = data ? [...(data.historical||[]).map(h=>({...h,type:'historical'})), ...(data.forecasts||[]).map(f=>({...f,revenue:f.projected,type:'forecast'}))] : [];
  const maxVal  = allData.reduce((m,d)=>Math.max(m,parseFloat(d.projected_high||d.revenue)||0),1);

  return (
    <div className="space-y-4">
      {data && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ borderRadius:16, padding:'14px 16px', background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)' }}>
            <p style={{ fontSize:10, fontWeight:800, color:'#10b981', textTransform:'uppercase', letterSpacing:'0.1em', margin:0 }}>Moyenne mensuelle</p>
            <p style={{ fontSize:22, fontWeight:900, color:'#065f46', fontFamily:'var(--mono)', margin:'6px 0 0' }}>{fmt(data.avg_monthly)} €</p>
          </div>
          <div style={{ borderRadius:16, padding:'14px 16px', background: data.slope>=0?'rgba(17,24,39,0.08)':'rgba(239,68,68,0.08)', border:`1px solid ${data.slope>=0?'rgba(17,24,39,0.2)':'rgba(239,68,68,0.2)'}` }}>
            <p style={{ fontSize:10, fontWeight:800, color: data.slope>=0?'#111827':'#ef4444', textTransform:'uppercase', letterSpacing:'0.1em', margin:0 }}>Tendance</p>
            <p style={{ fontSize:22, fontWeight:900, color: data.slope>=0?'#312e81':'#7f1d1d', fontFamily:'var(--mono)', margin:'6px 0 0' }}>
              {data.slope>=0?'↗':'↘'} {data.slope>=0?'+':''}{fmtFull(data.slope)} €/mois
            </p>
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:8 }}>
        {[1,2,3,6].map(m => (
          <button key={m} onClick={()=>setMonths(m)} style={{ flex:1, padding:'9px 0', borderRadius:11, fontWeight:700, fontSize:12, cursor:'pointer', border:`1px solid ${months===m?'#111827':theme.border}`, background: months===m?'rgba(17,24,39,0.12)':theme.inputBg, color: months===m?'#111827':theme.muted }}>
            {m} mois
          </button>
        ))}
      </div>

      {loading ? <div className="py-16 text-center"><I.Loader className="w-6 h-6 mx-auto animate-spin" style={{ color:theme.muted }} /></div>
      : !data || allData.length < 2 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', background:theme.card, borderRadius:18, border:`1px solid ${theme.border}` }}>
          <I.TrendUp style={{ width:36, height:36, margin:'0 auto 10px', color:theme.dim }} />
          <p style={{ color:theme.muted, fontSize:14 }}>Pas assez de données (min. 2 mois)</p>
        </div>
      ) : (
        <>
          <div style={{ background:theme.card, borderRadius:20, border:`1px solid ${theme.border}`, padding:16 }}>
            <p style={{ fontWeight:800, fontSize:13, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 16px' }}>Historique + Prévisions</p>
            <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:120 }}>
              {allData.map((d,i) => {
                const h = Math.max(4, ((parseFloat(d.revenue)||0)/maxVal)*100);
                const isForecast = d.type==='forecast';
                return (
                  <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                    {isForecast && (
                      <div style={{ width:'100%', height:Math.max(4,((d.projected_high-d.projected_low)/maxVal)*100), borderRadius:'4px 4px 0 0', background:'rgba(17,24,39,0.15)', border:'1px dashed rgba(17,24,39,0.3)', position:'relative', top: `${100-Math.max(4,(d.projected_high/maxVal)*100)}%` }} />
                    )}
                    <div style={{ width:'100%', height:`${h}%`, borderRadius: isForecast?'8px 8px 0 0':'6px 6px 0 0', background: isForecast?'linear-gradient(180deg,rgba(17,24,39,0.7),rgba(55,65,81,0.5))':'linear-gradient(180deg,#10b981,#059669)', marginTop:'auto' }} />
                    <span style={{ fontSize:8, fontWeight:700, color: isForecast?'#111827':theme.muted }}>{fmtMonth(d.month)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display:'flex', gap:12, marginTop:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}><div style={{ width:10, height:10, borderRadius:2, background:'#10b981' }} /><span style={{ fontSize:11, color:theme.muted }}>Réel</span></div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}><div style={{ width:10, height:10, borderRadius:2, background:'rgba(17,24,39,0.6)' }} /><span style={{ fontSize:11, color:theme.muted }}>Prévision</span></div>
            </div>
          </div>

          {data.forecasts?.length > 0 && (
            <div style={{ background:theme.card, borderRadius:18, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
              <p style={{ fontWeight:800, fontSize:12, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.08em', margin:0, padding:'12px 16px', borderBottom:`1px solid ${theme.separator}` }}>Détail des prévisions</p>
              {data.forecasts.map((f,i) => (
                <div key={i} style={{ padding:'12px 16px', borderBottom: i<data.forecasts.length-1?`1px solid ${theme.separator}`:'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontWeight:700, fontSize:14, color:theme.text }}>{MONTH_FR[parseInt(f.month.split('-')[1])-1]} {f.month.split('-')[0]}</span>
                    <span style={{ fontWeight:900, fontSize:16, fontFamily:'var(--mono)', color:'#111827' }}>{fmtFull(f.projected)} €</span>
                  </div>
                  <p style={{ fontSize:11, color:theme.muted, margin:'2px 0 0' }}>Fourchette : {fmtFull(f.projected_low)} € — {fmtFull(f.projected_high)} €</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
