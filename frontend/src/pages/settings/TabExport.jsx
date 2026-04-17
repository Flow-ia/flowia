import { useState, useEffect } from 'react';
import { exportApi } from '../../utils/api';

export default function TabExport({ employees, categories, theme }) {
  const isDark = theme.mode === 'dark';
  const [from,   setFrom]   = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toLocaleDateString('sv-SE'); });
  const [to,     setTo]     = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [empId,  setEmpId]  = useState('');
  const [catId,  setCatId]  = useState('');
  const [type,   setType]   = useState('all');
  const [inclPayment,  setInclPayment]  = useState(true);
  const [inclEmployees, setInclEmployees] = useState(true);
  const [summary, setSummary] = useState(null);
  const [loadSum, setLS]    = useState(false);

  const fmt = n => Number(n||0).toFixed(2);

  const buildQuery = () => {
    const q = { from, to };
    if (empId) q.employee_id = empId;
    if (catId) q.category_id = catId;
    if (type !== 'all') q.type = type;
    if (inclPayment)   q.include_payment   = '1';
    if (inclEmployees) q.include_employees = '1';
    return q;
  };

  const loadSummary = async () => {
    setLS(true);
    try { setSummary(await exportApi.getSummary(buildQuery())); }
    catch { setSummary(null); }
    finally { setLS(false); }
  };

  useEffect(() => { loadSummary(); }, [from, to, empId, catId, type]);

  const download = async (fmt_) => {
    try {
      const q = buildQuery();
      const url = fmt_ === 'csv' ? exportApi.getCsvUrl(q) : exportApi.getPdfUrl(q);
      await exportApi.downloadFile(url, `export-FlowIA-${from}-${to}.${fmt_}`);
    } catch (e) { alert('Erreur export : ' + e.message); }
  };

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, outline:'none',
    background:isDark?'rgba(255,255,255,0.08)':'#fff',
    border:`1px solid ${theme.border}`, color:theme.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box' };

  const CheckRow = ({ checked, onChange, label, sub }) => (
    <div onClick={onChange} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
      borderRadius:10, cursor:'pointer',
      background: checked ? (isDark?'rgba(26,115,232,0.08)':'rgba(26,115,232,0.05)') : (isDark?'rgba(255,255,255,0.02)':'#fafafa'),
      border:`1px solid ${checked?'rgba(26,115,232,0.3)':theme.border}` }}>
      <div style={{ width:18, height:18, borderRadius:5, flexShrink:0,
        background: checked?'#1a73e8':'transparent',
        border:`2px solid ${checked?'#1a73e8':theme.border}`,
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        {checked && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{width:11,height:11}}><polyline points="20 6 9 17 4 12"/></svg>}
      </div>
      <div>
        <p style={{ margin:0, fontSize:13, fontWeight:700, color:theme.text }}>{label}</p>
        {sub && <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>{sub}</p>}
      </div>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      <div style={{ borderRadius:16, background:theme.card, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}` }}>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>🔍 Filtres</p>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5 }}>Du</p>
              <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={inp}/>
            </div>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5 }}>Au</p>
              <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={inp}/>
            </div>
          </div>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5 }}>Employé</p>
            <select value={empId} onChange={e=>setEmpId(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
              <option value="">Tous les employés</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5 }}>Catégorie</p>
            <select value={catId} onChange={e=>setCatId(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
              <option value="">Toutes les catégories</option>
              {categories.filter(c=>!c.parent_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5 }}>Type</p>
            <div style={{ display:'flex', gap:6 }}>
              {[['all','Tout'],['revenue','Revenus'],['expense','Dépenses']].map(([v,l]) => (
                <button key={v} onClick={()=>setType(v)}
                  style={{ flex:1, padding:'8px 0', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer',
                    border:`1px solid ${type===v?'#1a73e8':theme.border}`,
                    background: type===v?'rgba(26,115,232,0.12)':'transparent',
                    color: type===v?'#1a73e8':theme.muted }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ borderRadius:16, background:theme.card, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}` }}>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>📊 Inclure dans l'export</p>
        </div>
        <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
          <CheckRow
            checked={inclPayment}
            onChange={() => setInclPayment(v => !v)}
            label="CA par moyen de paiement"
            sub="Espèces, Carte bancaire, Virement — classement décroissant"
          />
          <CheckRow
            checked={inclEmployees}
            onChange={() => setInclEmployees(v => !v)}
            label="CA par employé"
            sub="Classement des employés par chiffre d'affaires décroissant"
          />
        </div>
      </div>

      {loadSum ? (
        <div style={{ textAlign:'center', padding:24 }}>
          <div style={{ width:24,height:24,borderRadius:99,border:'2px solid rgba(26,115,232,0.2)',borderTopColor:'#1a73e8',animation:'spin .8s linear infinite',margin:'0 auto' }}/>
        </div>
      ) : summary && (
        <div style={{ borderRadius:16, background:theme.card, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}` }}>
            <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>📈 Résumé de la période</p>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
            {[
              ['CA', fmt(summary.total_revenus) + ' €', '#4ade80', 'rgba(74,222,128,0.08)'],
              ['Dépenses', fmt(summary.total_depenses) + ' €', '#f87171', 'rgba(248,113,113,0.08)'],
              ['Transactions', summary.total_tx, theme.text, isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'],
              ['Employés actifs', summary.nb_employes, '#1a73e8', 'rgba(26,115,232,0.04)'],
            ].map(([label, value, color, bg], i) => (
              <div key={label} style={{ padding:'14px 16px', background:bg,
                borderRight: i%2===0?`1px solid ${theme.border}`:'none',
                borderTop: i>=2?`1px solid ${theme.border}`:'none' }}>
                <p style={{ fontSize:11, fontWeight:700, color, marginBottom:4 }}>{label}</p>
                <p style={{ fontSize:18, fontWeight:900, color, margin:0 }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <button onClick={() => download('csv')}
          style={{ padding:'13px 0', borderRadius:14, border:`1px solid ${theme.border}`,
            background:theme.card, color:theme.text, fontWeight:700, fontSize:13, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
          📄 Exporter CSV
        </button>
        <button onClick={() => download('pdf')}
          style={{ padding:'13px 0', borderRadius:14, border:'none',
            background:'#1a73e8', color:'white', fontWeight:800, fontSize:13, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:7,
            boxShadow:'0 4px 14px rgba(26,115,232,0.35)' }}>
          📑 Exporter PDF
        </button>
      </div>

      <p style={{ margin:0, fontSize:11, color:theme.muted, textAlign:'center' }}>
        Propulsé par FlowIA
      </p>
    </div>
  );
}
