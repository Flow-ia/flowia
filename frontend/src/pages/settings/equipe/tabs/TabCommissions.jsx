import { useState, useEffect } from 'react';
import { commissionsApi } from '../../../../utils/api';

export default function TabCommissions({ employees, theme }) {
  const isDark = theme.mode === 'dark';
  const [data,    setData]    = useState(null);
  const [rates,   setRates]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState({});
  const [error,   setError]   = useState('');
  const today = new Date().toLocaleDateString('sv-SE');
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('sv-SE');
  const [from, setFrom] = useState(firstOfMonth);
  const [to,   setTo]   = useState(today);

  const load = () => {
    setLoading(true);
    Promise.all([
      commissionsApi.get({ from, to }),
      commissionsApi.getSettings(),
    ]).then(([d, r]) => {
      setData(d);
      setRates(Array.isArray(r) ? r : []);
    }).catch(e => setError(e.message || 'Erreur'))
    .finally(() => setLoading(false));
  };
  useEffect(load, [from, to]);

  const saveRate = async (empId, pct) => {
    setSaving(p=>({...p,[empId]:true}));
    try { await commissionsApi.saveRate(empId, { commission_pct: Number(pct) }); }
    catch(e) { setError(e.message || 'Erreur'); }
    finally { setSaving(p=>({...p,[empId]:false})); }
  };

  const fmtN = v => Number(v||0).toFixed(2);
  const inp = { padding:'9px 10px', borderRadius:9, outline:'none', border:`1px solid ${theme.border}`,
    background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.04)',
    color:theme.text, fontSize:13, fontFamily:'inherit' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {error && <p style={{ fontSize:12, color:'#f87171', fontWeight:600 }}>{error}</p>}

      <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:16, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}` }}>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>⚙️ Taux de commission</p>
        </div>
        <div>
          {rates.map(e => (
            <div key={e.id} style={{ display:'flex', alignItems:'center', gap:12,
              padding:'12px 16px', borderBottom:`1px solid ${theme.border}` }}>
              <div style={{ width:36, height:36, borderRadius:99, flexShrink:0,
                background:`${e.avatar_color||'#111827'}18`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:800, fontSize:14, color:e.avatar_color||'#111827' }}>
                {e.name.charAt(0)}
              </div>
              <p style={{ flex:1, fontSize:14, fontWeight:600, color:theme.text, margin:0 }}>{e.name}</p>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <input type="number" min={0} max={100} step={0.5}
                  defaultValue={e.commission_pct||0}
                  onBlur={ev=>saveRate(e.id, ev.target.value)}
                  style={{...inp, width:64, textAlign:'center'}}/>
                <span style={{ fontSize:13, color:theme.muted }}>%</span>
                {saving[e.id] && <div style={{ width:14,height:14,borderRadius:99,border:`2px solid ${isDark?'rgba(255,255,255,0.15)':'rgba(17,24,39,0.2)'}`,borderTopColor:isDark?'#e6edf3':'#111827',animation:'spin .7s linear infinite' }}/>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div>
          <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Du</p>
          <input type="date" value={from} onChange={e=>{setFrom(e.target.value);}} style={{...inp,width:'100%',boxSizing:'border-box'}}/>
        </div>
        <div>
          <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Au</p>
          <input type="date" value={to} onChange={e=>{setTo(e.target.value);}} style={{...inp,width:'100%',boxSizing:'border-box'}}/>
        </div>
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:'center' }}>
          <div style={{ width:28,height:28,borderRadius:99,border:`2px solid ${isDark?'rgba(255,255,255,0.1)':'rgba(17,24,39,0.2)'}`,borderTopColor:isDark?'#e6edf3':'#111827',animation:'spin .8s linear infinite',margin:'0 auto' }}/>
        </div>
      ) : data?.employees?.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:theme.muted, fontSize:14 }}>
          Aucune commission sur cette période
        </div>
      ) : (
        <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:16, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}` }}>
            <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>💰 Commissions à verser — {from} → {to}</p>
          </div>
          {(data?.employees||[]).map((e,i)=>(
            <div key={e.employee_id||i} style={{ display:'flex', alignItems:'center', gap:12,
              padding:'14px 16px',
              borderBottom:`1px solid ${theme.border}` }}>
              <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
                background:`${e.avatar_color||'#111827'}18`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:800, fontSize:15, color:e.avatar_color||'#111827' }}>
                {(e.employee_name||'?').charAt(0)}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14, fontWeight:700, color:theme.text, margin:'0 0 2px' }}>
                  {e.employee_name}
                </p>
                <p style={{ fontSize:12, color:theme.muted, margin:0 }}>
                  CA : {fmtN(e.total_revenue)} € · Taux : {e.commission_pct||0} %
                </p>
              </div>
              <p style={{ fontSize:16, fontWeight:900, color:isDark?'#e6edf3':'#111827', margin:0, fontFamily:'monospace' }}>
                {fmtN(e.commission_due)} €
              </p>
            </div>
          ))}
          {data?.employees?.length > 0 && (
            <div style={{ padding:'12px 16px', display:'flex', justifyContent:'flex-end' }}>
              <p style={{ fontSize:14, fontWeight:800, color:theme.text, margin:0 }}>
                Total : {fmtN((data.employees||[]).reduce((s,e)=>s+Number(e.commission_due||0),0))} €
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
