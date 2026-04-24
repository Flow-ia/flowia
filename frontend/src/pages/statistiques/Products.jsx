// Statistiques > Produits — ventes par prestation (transaction_items) et
// par catégorie. Consomme statsApi.getProductStats({from, to, employee_id}).
// Pas de composant source existant : UI minimale, listes triées par CA.
import { useEffect, useState } from 'react';
import { statsApi } from '../../utils/api';

function fmtEur(n) {
  const v = Number(n || 0);
  return v.toFixed(2).replace('.', ',') + ' €';
}

const PERIODS = [
  { id: '30',  label: '30 jours',  days: 30  },
  { id: '90',  label: '90 jours',  days: 90  },
  { id: '365', label: '12 mois',   days: 365 },
];

function toIso(d) { return d.toISOString().slice(0, 10); }

function buildRange(days) {
  const to   = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: toIso(from), to: toIso(to) };
}

export default function Products({ employees = [], theme, showToast }) {
  const t = theme;
  const [period, setPeriod] = useState('30');
  const [empId,  setEmpId]  = useState('all');
  const [data,   setData]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = buildRange(PERIODS.find(p => p.id === period)?.days || 30);
    setLoading(true);
    const q = { from, to };
    if (empId && empId !== 'all') q.employee_id = empId;
    statsApi.getProductStats(q)
      .then(r => { setData(r); setLoading(false); })
      .catch(e => {
        setData(null); setLoading(false);
        if (showToast) showToast(e.message || 'Erreur stats produits', 'error');
      });
  }, [period, empId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cardStyle = {
    padding: 16, borderRadius: 12, background: t.card,
    border: `0.5px solid ${t.border}`,
    display: 'flex', flexDirection: 'column', gap: 12,
  };

  const rowStyle = {
    display:'grid', gridTemplateColumns:'1fr auto auto auto',
    gap:10, padding:'10px 0', borderBottom:`0.5px solid ${t.separator}`,
    alignItems:'center',
  };

  const products = data?.products || [];
  const cats     = data?.categories || [];
  const totals   = data?.totals || {};

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Filtres */}
      <div style={{ ...cardStyle, flexDirection:'row', alignItems:'center',
                    justifyContent:'space-between', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:3, padding:2, borderRadius:7,
                      background:t.cardAlt }}>
          {PERIODS.map(p => {
            const active = period === p.id;
            return (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                      style={{ padding:'6px 10px', borderRadius:5, border:'none',
                               background: active ? t.card : 'transparent',
                               color: active ? t.text : t.muted,
                               fontSize:12, fontWeight: active ? 500 : 400,
                               cursor:'pointer', fontFamily:'inherit' }}>
                {p.label}
              </button>
            );
          })}
        </div>

        <select value={empId} onChange={e => setEmpId(e.target.value)}
                style={{ padding:'7px 10px', borderRadius:7,
                         background:t.inputBg, color:t.text,
                         border:`0.5px solid ${t.borderInput}`,
                         fontSize:12, fontFamily:'inherit', outline:'none' }}>
          <option value="all">{"Tous les employés"}</option>
          {employees.filter(e => e.is_active !== false).map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {/* Totaux */}
      <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',
                    gap:8 }}>
        <div style={{ ...cardStyle, gap:2 }}>
          <p style={{ margin:0, fontSize:11, color:t.muted, textTransform:'uppercase',
                      letterSpacing:'0.04em', fontWeight:500 }}>{"CA total"}</p>
          <p style={{ margin:'4px 0 0', fontSize:20, fontWeight:500, color:t.text,
                      fontFamily:'monospace' }}>
            {loading ? '…' : fmtEur(totals.total_revenue)}
          </p>
        </div>
        <div style={{ ...cardStyle, gap:2 }}>
          <p style={{ margin:0, fontSize:11, color:t.muted, textTransform:'uppercase',
                      letterSpacing:'0.04em', fontWeight:500 }}>{"Transactions"}</p>
          <p style={{ margin:'4px 0 0', fontSize:20, fontWeight:500, color:t.text }}>
            {loading ? '…' : (totals.total_tx || 0)}
          </p>
        </div>
        <div style={{ ...cardStyle, gap:2 }}>
          <p style={{ margin:0, fontSize:11, color:t.muted, textTransform:'uppercase',
                      letterSpacing:'0.04em', fontWeight:500 }}>{"Quantité vendue"}</p>
          <p style={{ margin:'4px 0 0', fontSize:20, fontWeight:500, color:t.text }}>
            {loading ? '…' : (parseInt(totals.total_qty, 10) || 0)}
          </p>
        </div>
      </div>

      {/* Produits */}
      <div style={cardStyle}>
        <div>
          <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
            {"Top prestations"}
          </p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
            {"Tri par CA décroissant"}
          </p>
        </div>
        {loading ? (
          <p style={{ fontSize:12, color:t.muted, margin:0 }}>{"Chargement…"}</p>
        ) : products.length === 0 ? (
          <p style={{ fontSize:12, color:t.muted, margin:0 }}>
            {"Aucune prestation vendue sur la période."}
          </p>
        ) : (
          <div>
            <div style={{ ...rowStyle, fontSize:10, color:t.muted,
                          textTransform:'uppercase', letterSpacing:'0.04em',
                          fontWeight:500, paddingTop:0 }}>
              <div>{"Prestation"}</div>
              <div style={{ textAlign:'right' }}>{"Qté"}</div>
              <div style={{ textAlign:'right' }}>{"Prix moyen"}</div>
              <div style={{ textAlign:'right' }}>{"CA"}</div>
            </div>
            {products.slice(0, 30).map((p, i) => (
              <div key={i} style={rowStyle}>
                <div style={{ fontSize:13, color:t.text,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {p.service_name || 'Sans nom'}
                </div>
                <div style={{ fontSize:13, color:t.text, textAlign:'right', fontFamily:'monospace' }}>
                  {parseInt(p.qty_sold, 10) || 0}
                </div>
                <div style={{ fontSize:12, color:t.muted, textAlign:'right', fontFamily:'monospace' }}>
                  {fmtEur(p.avg_price)}
                </div>
                <div style={{ fontSize:13, color:t.text, textAlign:'right',
                              fontFamily:'monospace', fontWeight:500 }}>
                  {fmtEur(p.revenue)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Catégories */}
      <div style={cardStyle}>
        <div>
          <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
            {"Ventilation par catégorie"}
          </p>
        </div>
        {loading ? (
          <p style={{ fontSize:12, color:t.muted, margin:0 }}>{"Chargement…"}</p>
        ) : cats.length === 0 ? (
          <p style={{ fontSize:12, color:t.muted, margin:0 }}>
            {"Aucune catégorie sur la période."}
          </p>
        ) : (
          <div>
            {cats.slice(0, 20).map((c, i) => {
              const color = c.category_color || '#6b7280';
              return (
                <div key={i} style={rowStyle}>
                  <div style={{ display:'flex', alignItems:'center', gap:8,
                                fontSize:13, color:t.text }}>
                    <span style={{ width:8, height:8, borderRadius:99,
                                   background: color, flexShrink:0 }}/>
                    {c.category_name || 'Sans catégorie'}
                  </div>
                  <div style={{ fontSize:13, color:t.text, textAlign:'right', fontFamily:'monospace' }}>
                    {parseInt(c.qty_sold, 10) || 0}
                  </div>
                  <div style={{ fontSize:12, color:t.muted, textAlign:'right' }}>
                    {(parseInt(c.tx_count, 10) || 0) + ' tx'}
                  </div>
                  <div style={{ fontSize:13, color:t.text, textAlign:'right',
                                fontFamily:'monospace', fontWeight:500 }}>
                    {fmtEur(c.revenue)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
