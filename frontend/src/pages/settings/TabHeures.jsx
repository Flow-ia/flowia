import { useState, useEffect } from 'react';
import { I } from '../../utils/icons';
import { statsApi } from '../../utils/api';

export default function TabHeures({ theme }) {
  const isDark = theme.mode === 'dark';
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState('3m');

  const PERIODS = { '1m':'1 mois', '3m':'3 mois', '6m':'6 mois', '1y':'1 an' };
  const periodQuery = (p) => {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date();
    if (p==='1m') from.setMonth(from.getMonth()-1);
    else if (p==='3m') from.setMonth(from.getMonth()-3);
    else if (p==='6m') from.setMonth(from.getMonth()-6);
    else from.setFullYear(from.getFullYear()-1);
    return { from: from.toISOString().split('T')[0], to };
  };

  useEffect(() => {
    setLoading(true);
    statsApi.getHeatmap(periodQuery(period))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  const DAYS_FR = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const HOURS   = Array.from({length:13}, (_,i) => i+8);
  const getCellColor = (count) => {
    if (!count || !data?.maxCount) return isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)';
    const pct = count / data.maxCount;
    if (pct > 0.8) return '#111827';
    if (pct > 0.6) return 'rgba(17,24,39,0.7)';
    if (pct > 0.4) return 'rgba(17,24,39,0.45)';
    if (pct > 0.2) return 'rgba(17,24,39,0.25)';
    return 'rgba(17,24,39,0.1)';
  };

  return (
    <div className="space-y-4">
      <div style={{ display:'flex', gap:6 }}>
        {Object.entries(PERIODS).map(([k,l]) => (
          <button key={k} onClick={()=>setPeriod(k)} style={{ flex:1, padding:'9px 0', borderRadius:11, fontWeight:700, fontSize:12, cursor:'pointer', border:`1px solid ${period===k?'#111827':theme.border}`, background: period===k?'rgba(17,24,39,0.12)':theme.inputBg, color: period===k?'#111827':theme.muted }}>{l}</button>
        ))}
      </div>

      {loading ? <div className="py-16 text-center"><I.Loader className="w-6 h-6 mx-auto animate-spin" style={{ color:theme.muted }} /></div>
      : !data ? null
      : (
        <div style={{ background:theme.card, borderRadius:20, border:`1px solid ${theme.border}`, padding:16, overflowX:'auto' }}>
          <p style={{ fontWeight:800, fontSize:13, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 14px' }}>Activité par heure et jour</p>
          <div style={{ minWidth:340 }}>
            <div style={{ display:'flex', gap:2, marginLeft:32, marginBottom:4 }}>
              {HOURS.map(h => (
                <div key={h} style={{ width:24, textAlign:'center', fontSize:8, fontWeight:700, color:theme.dim }}>{h}h</div>
              ))}
            </div>
            {DAYS_FR.map((day,dow) => (
              <div key={dow} style={{ display:'flex', alignItems:'center', gap:2, marginBottom:2 }}>
                <span style={{ width:30, fontSize:10, fontWeight:700, color:theme.muted, textAlign:'right', paddingRight:4 }}>{day}</span>
                {HOURS.map(h => {
                  const key = `${dow}_${h}`;
                  const cell = data.grid?.[key];
                  return (
                    <div key={h} title={cell ? `${cell.count} tx · ${Number(cell.revenue).toFixed(0)} €` : '-'}
                      style={{ width:24, height:24, borderRadius:5, background: getCellColor(cell?.count||0), cursor:'default', transition:'transform 0.1s' }}
                      onMouseEnter={e=>{e.target.style.transform='scale(1.2)';}}
                      onMouseLeave={e=>{e.target.style.transform='scale(1)';}}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:12 }}>
            <span style={{ fontSize:10, color:theme.muted }}>Moins</span>
            {[0, 0.2, 0.45, 0.7, 1].map((v,i) => (
              <div key={i} style={{ width:16, height:16, borderRadius:4, background: v===0?(isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)'): `rgba(124,106,247,${v})` }} />
            ))}
            <span style={{ fontSize:10, color:theme.muted }}>Plus</span>
          </div>
        </div>
      )}

      {data?.maxCount === 0 && (
        <p style={{ textAlign:'center', color:theme.muted, fontSize:13 }}>Aucune transaction avec horaire sur cette période. Assurez-vous d&apos;enregistrer l&apos;heure lors des encaissements.</p>
      )}
    </div>
  );
}
