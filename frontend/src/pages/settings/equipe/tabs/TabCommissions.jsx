import { useState, useEffect } from 'react';
import { commissionsApi } from '../../../../utils/api';

export default function TabCommissions({ employees, theme }) {
  const t = theme;
  const [data,    setData]    = useState(null);
  const [rates,   setRates]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState({});
  const [error,   setError]   = useState('');
  const today        = new Date().toLocaleDateString('sv-SE');
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
    setSaving(p => ({ ...p, [empId]: true }));
    try { await commissionsApi.saveRate(empId, { commission_pct: Number(pct) }); }
    catch (e) { setError(e.message || 'Erreur'); }
    finally { setSaving(p => ({ ...p, [empId]: false })); }
  };

  const fmtN = v => Number(v || 0).toFixed(2);
  const inp = {
    padding:'9px 12px', borderRadius:8, outline:'none',
    border:`0.5px solid ${t.borderInput}`,
    background:t.inputBg, color:t.text,
    fontSize:13, fontFamily:'inherit',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  const Spinner = ({ size = 26 }) => (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24"
         style={{ color:t.text, display:'inline-block' }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
      <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {error && <p style={{ fontSize:12, color:'#991b1b', margin:0 }}>{error}</p>}

      <div style={{ background:t.card, border:`0.5px solid ${t.border}`,
                    borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:`0.5px solid ${t.separator}` }}>
          <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>Taux de commission</p>
        </div>
        <div>
          {rates.map(e => (
            <div key={e.id}
                 style={{ display:'flex', alignItems:'center', gap:12,
                          padding:'12px 16px',
                          borderBottom:`0.5px solid ${t.separator}` }}>
              <div style={{ width:34, height:34, borderRadius:'50%', flexShrink:0,
                            background:`${e.avatar_color || t.text}18`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontWeight:500, fontSize:14, color: e.avatar_color || t.text }}>
                {e.name.charAt(0)}
              </div>
              <p style={{ flex:1, fontSize:14, fontWeight:500, color:t.text, margin:0 }}>
                {e.name}
              </p>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <input type="number" min={0} max={100} step={0.5}
                       defaultValue={e.commission_pct || 0}
                       onBlur={ev => saveRate(e.id, ev.target.value)}
                       style={{ ...inp, width:68, textAlign:'center' }}/>
                <span style={{ fontSize:13, color:t.muted }}>%</span>
                {saving[e.id] && <Spinner size={14}/>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div>
          <p style={{ fontSize:12, color:t.muted, margin:'0 0 6px' }}>Du</p>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                 style={{ ...inp, width:'100%', boxSizing:'border-box' }}/>
        </div>
        <div>
          <p style={{ fontSize:12, color:t.muted, margin:'0 0 6px' }}>Au</p>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
                 style={{ ...inp, width:'100%', boxSizing:'border-box' }}/>
        </div>
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:'center' }}><Spinner/></div>
      ) : data?.employees?.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:t.muted, fontSize:14 }}>
          Aucune commission sur cette periode
        </div>
      ) : (
        <div style={{ background:t.card, border:`0.5px solid ${t.border}`,
                      borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:`0.5px solid ${t.separator}` }}>
            <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>
              Commissions a verser — {from} → {to}
            </p>
          </div>
          {(data?.employees || []).map((e, i) => (
            <div key={e.employee_id || i}
                 style={{ display:'flex', alignItems:'center', gap:12,
                          padding:'14px 16px',
                          borderBottom:`0.5px solid ${t.separator}` }}>
              <div style={{ width:38, height:38, borderRadius:8, flexShrink:0,
                            background:`${e.avatar_color || t.text}18`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontWeight:500, fontSize:15, color: e.avatar_color || t.text }}>
                {(e.employee_name || '?').charAt(0)}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14, fontWeight:500, color:t.text, margin:'0 0 2px' }}>
                  {e.employee_name}
                </p>
                <p style={{ fontSize:12, color:t.muted, margin:0 }}>
                  CA : {fmtN(e.total_revenue)} € · Taux : {e.commission_pct || 0} %
                </p>
              </div>
              <p style={{ fontSize:16, fontWeight:500, color:t.text, margin:0, fontFamily:'monospace' }}>
                {fmtN(e.commission_due)} €
              </p>
            </div>
          ))}
          {data?.employees?.length > 0 && (
            <div style={{ padding:'12px 16px', display:'flex', justifyContent:'flex-end' }}>
              <p style={{ fontSize:14, fontWeight:500, color:t.text, margin:0 }}>
                Total : {fmtN((data.employees || []).reduce((s, e) => s + Number(e.commission_due || 0), 0))} €
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
