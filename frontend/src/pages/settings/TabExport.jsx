import { useState, useEffect } from 'react';
import { exportApi } from '../../utils/api';
import { Button, SegmentedControl } from '../../components/primitives';

// Popup d'erreur inline (pas d'alert() natif — FDS-2026 : toasts + modals
// uniquement, jamais la box du navigateur qui bloque l'interaction + gêne
// visuellement sur mobile).
function ErrorModal({ open, message, onClose, theme: t }) {
  if (!open) return null;
  return (
    <div onClick={onClose}
         style={{ position:'fixed', inset:0, zIndex:1000, display:'flex',
                  alignItems:'center', justifyContent:'center', padding:20,
                  background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()}
           style={{ width:'100%', maxWidth:360, borderRadius:14, padding:20,
                    background:t.elevated,
                    border:`0.5px solid ${t.border}`,
                    borderLeft:'2px solid #ef4444',
                    boxShadow:t.shadowModal }}>
        <p style={{ margin:'0 0 8px', fontSize:14, fontWeight:500, color:'#991b1b' }}>
          Export impossible
        </p>
        <p style={{ margin:'0 0 14px', fontSize:12, color:t.muted, lineHeight:1.5 }}>
          {message}
        </p>
        <Button variant="primary" type="button" onClick={onClose} style={{ width:'100%' }}>
          OK
        </Button>
      </div>
    </div>
  );
}

export default function TabExport({ employees, categories, theme }) {
  const t = theme;
  const [from,   setFrom]   = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toLocaleDateString('sv-SE'); });
  const [to,     setTo]     = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [empId,  setEmpId]  = useState('');
  const [catId,  setCatId]  = useState('');
  const [type,   setType]   = useState('all');
  const [inclPayment,   setInclPayment]   = useState(true);
  const [inclEmployees, setInclEmployees] = useState(true);
  const [summary, setSummary] = useState(null);
  const [loadSum, setLS]      = useState(false);
  const [errMsg,  setErrMsg]  = useState('');

  const fmt = n => Number(n || 0).toFixed(2);

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
    } catch (e) {
      // Popup inline (FDS-2026) — jamais alert() natif (bloquant + disgracieux).
      setErrMsg(e?.message || 'Erreur inconnue lors de l\'export.');
    }
  };

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box',
  };

  const CheckRow = ({ checked, onChange, label, sub }) => (
    <div onClick={onChange}
         style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                  borderRadius:8, cursor:'pointer',
                  background: checked ? '#eef2ff' : t.cardAlt,
                  border:`0.5px solid ${checked ? '#4338ca' : t.border}` }}>
      <div style={{ width:18, height:18, borderRadius:6, flexShrink:0,
                    background: checked ? '#4338ca' : 'transparent',
                    border:`0.5px solid ${checked ? '#4338ca' : t.borderStrong}`,
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{ width:11, height:11 }}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </div>
      <div>
        <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>{label}</p>
        {sub && <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>{sub}</p>}
      </div>
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ borderRadius:12, background:t.card,
                  border:`0.5px solid ${t.border}`, overflow:'hidden' }}>
      <div style={{ padding:'12px 16px', borderBottom:`0.5px solid ${t.separator}` }}>
        <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>{title}</p>
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      <Section title="Filtres">
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p style={{ fontSize:12, color:t.muted, marginBottom:6, margin:'0 0 6px' }}>Du</p>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp}/>
            </div>
            <div>
              <p style={{ fontSize:12, color:t.muted, margin:'0 0 6px' }}>Au</p>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp}/>
            </div>
          </div>
          <div>
            <p style={{ fontSize:12, color:t.muted, margin:'0 0 6px' }}>Employe</p>
            <select value={empId} onChange={e => setEmpId(e.target.value)}
                    style={{ ...inp, cursor:'pointer' }}>
              <option value="">Tous les employes</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <p style={{ fontSize:12, color:t.muted, margin:'0 0 6px' }}>Categorie</p>
            <select value={catId} onChange={e => setCatId(e.target.value)}
                    style={{ ...inp, cursor:'pointer' }}>
              <option value="">Toutes les categories</option>
              {categories.filter(c => !c.parent_id).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <p style={{ fontSize:12, color:t.muted, margin:'0 0 6px' }}>Type</p>
            <SegmentedControl fullWidth value={type} onChange={setType}
                              options={[
                                { value:'all',     label:'Tout'     },
                                { value:'revenue', label:'Revenus'  },
                                { value:'expense', label:'Depenses' },
                              ]}/>
          </div>
        </div>
      </Section>

      <Section title={"Inclure dans l'export"}>
        <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
          <CheckRow checked={inclPayment}
                    onChange={() => setInclPayment(v => !v)}
                    label="CA par moyen de paiement"
                    sub="Especes, Carte bancaire, Virement — classement decroissant"/>
          <CheckRow checked={inclEmployees}
                    onChange={() => setInclEmployees(v => !v)}
                    label="CA par employe"
                    sub={"Classement des employes par chiffre d'affaires decroissant"}/>
        </div>
      </Section>

      {loadSum ? (
        <div style={{ textAlign:'center', padding:24 }}>
          <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24"
               style={{ color:'#4338ca' }}>
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
            <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      ) : summary && (
        <Section title="Resume de la periode">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
            {[
              { label:'CA',             value: fmt(summary.total_revenus)  + ' €', color:'#065f46', bg:'#f0fdf4' },
              { label:'Depenses',       value: fmt(summary.total_depenses) + ' €', color:'#991b1b', bg:'#fef2f2' },
              { label:'Transactions',   value: summary.total_tx,                    color:t.text,    bg:t.cardAlt },
              { label:'Employes actifs',value: summary.nb_employes,                 color:'#4338ca', bg:'#eef2ff' },
            ].map(({ label, value, color, bg }, i) => (
              <div key={label}
                   style={{ padding:'14px 16px', background:bg,
                            borderRight: i % 2 === 0 ? `0.5px solid ${t.separator}` : 'none',
                            borderTop:   i >= 2       ? `0.5px solid ${t.separator}` : 'none' }}>
                <p style={{ fontSize:11, color, margin:'0 0 4px', opacity:0.75 }}>{label}</p>
                <p style={{ fontSize:18, fontWeight:500, color, margin:0 }}>{value}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <Button variant="secondary" type="button" onClick={() => download('csv')}>
          Exporter CSV
        </Button>
        <Button variant="primary" type="button" onClick={() => download('pdf')}>
          Exporter PDF
        </Button>
      </div>

      <p style={{ margin:0, fontSize:11, color:t.muted, textAlign:'center' }}>
        Propulse par FlowIA
      </p>

      <ErrorModal open={!!errMsg} message={errMsg} onClose={() => setErrMsg('')} theme={t}/>
    </div>
  );
}
