import { useState, useMemo, useEffect } from 'react';
import { I, ICON_MAP } from '../../utils/icons';
import { Modal } from '../../components/UI';
import { statsApi } from '../../utils/api';
import { disp } from '../../utils/dates';
import { Card, KpiBox, nd, fmt, PAY_INFO, PAY_KEYS } from './shared';
import { SegmentedControl } from '../../components/primitives';

export default function TabStats({ transactions, employees, categories, theme }) {
  const [subTab, setSubTab] = useState('caisse');

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <SegmentedControl fullWidth value={subTab} onChange={setSubTab}
                        options={[
                          { value:'caisse',   label:'Caisse'   },
                          { value:'services', label:'Services' },
                        ]}/>

      {subTab === 'caisse'   && <TabStatsCaisse transactions={transactions} employees={employees} categories={categories} theme={theme}/>}
      {subTab === 'services' && <TabProductStats employees={employees} theme={theme}/>}
    </div>
  );
}

function TabStatsCaisse({ transactions, employees, categories, theme }) {
  const t = theme;
  const [preset, setPr]         = useState('today');
  const [cs, setCs]             = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [ce, setCe]             = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [selEmp, setSel]        = useState('all');
  const [empModal, setEmpModal] = useState(null);

  const sod  = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const eod  = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  const som  = d => new Date(d.getFullYear(), d.getMonth(), 1);
  const eomFn = d => { const x = new Date(d); x.setMonth(x.getMonth() + 1, 0); x.setHours(23, 59, 59, 999); return x; };

  const { start, end } = useMemo(() => {
    const n = new Date();
    if (preset === 'today') return { start: sod(n), end: eod(n) };
    if (preset === 'week') {
      const s = new Date(n); s.setDate(n.getDate() - ((n.getDay() + 6) % 7)); s.setHours(0, 0, 0, 0);
      const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
    if (preset === 'month') return { start: som(n), end: eomFn(n) };
    return { start: sod(new Date(cs + 'T12:00')), end: eod(new Date(ce + 'T12:00')) };
  }, [preset, cs, ce]);

  const filt = useMemo(() => transactions.filter(tx => {
    const ds = nd(tx.date); if (!ds) return false;
    const d = new Date(ds + 'T12:00');
    if (d < start || d > end) return false;
    if (selEmp !== 'all' && tx.employee_id !== selEmp) return false;
    return true;
  }), [transactions, start, end, selEmp]);

  const revs = filt.filter(tx => tx.type === 'revenue');
  const exps = filt.filter(tx => tx.type === 'expense');
  const totR = revs.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
  const totE = exps.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
  const solde = totR - totE;

  const amountByMethod = (tx, method) => {
    if (tx.payment_method === 'multi' && Array.isArray(tx.payments)) {
      return tx.payments
        .filter(p => p.method === method)
        .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    }
    return tx.payment_method === method ? (parseFloat(tx.amount) || 0) : 0;
  };
  const hasMethod = (tx, method) => {
    if (tx.payment_method === 'multi' && Array.isArray(tx.payments)) {
      return tx.payments.some(p => p.method === method && parseFloat(p.amount) > 0);
    }
    return tx.payment_method === method;
  };

  const empStats = employees.map(emp => {
    const er    = revs.filter(tx => tx.employee_id === emp.id);
    const rdvTx = er.filter(tx => tx.source === 'rdv');
    const tot   = er.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
    const caRdv = rdvTx.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
    const byPay = {};
    PAY_KEYS.forEach(k => { byPay[k] = er.reduce((s, tx) => s + amountByMethod(tx, k), 0); });
    return { ...emp, tot, cnt:er.length, byPay, caRdv, rdvCnt:rdvTx.length,
             allTx: filt.filter(tx => tx.employee_id === emp.id) };
  }).sort((a, b) => b.tot - a.tot);
  const maxEmp = Math.max(...empStats.map(e => e.tot), 1);

  const rdvRevs  = revs.filter(r => r.source === 'rdv');
  const caRdvTot = rdvRevs.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
  const payStats = PAY_KEYS.map(pm => ({
    pm,
    total:    revs.reduce((s, x) => s + amountByMethod(x, pm), 0),
    cnt:      revs.filter(r => hasMethod(r, pm)).length,
    rdvTotal: rdvRevs.reduce((s, x) => s + amountByMethod(x, pm), 0),
    rdvCnt:   rdvRevs.filter(r => hasMethod(r, pm)).length,
  })).filter(p => p.cnt > 0).sort((a, b) => b.total - a.total);
  const maxPay = Math.max(...payStats.map(p => p.total), 1);

  const svcMap = {};
  revs.forEach(tx => {
    const items = Array.isArray(tx.items) ? tx.items : [];
    if (items.length > 0) {
      items.forEach(it => {
        const key  = it.service_name || 'Sans nom';
        const qty  = parseInt(it.qty) || 1;
        const unit = parseFloat(it.unit_price) || 0;
        if (!svcMap[key]) svcMap[key] = { name:key, count:0, total:0, unit };
        svcMap[key].count += qty;
        svcMap[key].total += unit * qty;
        svcMap[key].unit   = unit;
      });
    } else {
      const cat = categories.find(c => c.id === tx.category_id);
      const key = cat?.name || tx.description || 'Sans categorie';
      const qty = parseInt(tx.qty_total) || 1;
      const amt = parseFloat(tx.amount) || 0;
      if (!svcMap[key]) svcMap[key] = { name:key, count:0, total:0, unit: qty > 0 ? amt / qty : amt };
      svcMap[key].count += qty;
      svcMap[key].total += amt;
    }
  });
  const catStats = Object.values(svcMap)
    .map(s => {
      const cat = categories.find(c => c.name === s.name);
      return { ...s, id: cat?.id || s.name, icon: cat?.icon, color: cat?.color || t.muted };
    })
    .filter(c => c.count > 0)
    .sort((a, b) => b.total - a.total);

  const PRES = [
    { value:'today',  label:'Auj.'    },
    { value:'week',   label:'Semaine' },
    { value:'month',  label:'Mois'    },
    { value:'custom', label:'Perso.'  },
  ];

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit', boxSizing:'border-box',
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <Card theme={theme}>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
          <SegmentedControl fullWidth value={preset} onChange={setPr} options={PRES}/>

          {preset === 'custom' && (
            <div style={{ display:'flex', gap:8 }}>
              {[['Du', cs, setCs], ['Au', ce, setCe]].map(([lbl, val, set]) => (
                <div key={lbl} style={{ flex:1 }}>
                  <p style={{ fontSize:11, color:t.muted, margin:'0 0 4px' }}>{lbl}</p>
                  <input type="date" value={val} onChange={e => set(e.target.value)} style={inp}/>
                </div>
              ))}
            </div>
          )}

          {employees.length > 0 && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <button onClick={() => setSel('all')}
                      style={{ padding:'6px 12px', borderRadius:99, fontSize:12, fontWeight:500,
                               cursor:'pointer', fontFamily:'inherit',
                               border:`0.5px solid ${selEmp === 'all' ? t.text : t.border}`,
                               background: selEmp === 'all' ? t.text : 'transparent',
                               color: selEmp === 'all' ? t.bg : t.muted }}>
                Tous
              </button>
              {employees.map(e => (
                <button key={e.id} onClick={() => setSel(e.id)}
                        style={{ display:'flex', alignItems:'center', gap:6,
                                 padding:'6px 12px', borderRadius:99, fontSize:12, fontWeight:500,
                                 cursor:'pointer', fontFamily:'inherit',
                                 border:`0.5px solid ${selEmp === e.id ? (e.avatar_color || t.text) : t.border}`,
                                 background: selEmp === e.id ? `${e.avatar_color || t.text}18` : 'transparent',
                                 color: selEmp === e.id ? (e.avatar_color || t.text) : t.muted }}>
                  <div style={{ width:8, height:8, borderRadius:'50%',
                                backgroundColor: e.avatar_color || t.text }}/>
                  {e.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <KpiBox label="Chiffre d'affaires" value={fmt(totR)}
                color="#065f46" bg="#f0fdf4" border="#f0fdf4"/>
        <KpiBox label="Depenses" value={fmt(totE)}
                color="#991b1b" bg="#fef2f2" border="#fef2f2"/>
        {caRdvTot > 0 && (
          <div style={{ borderRadius:12, padding:'14px 12px',
                        background:'#eef2ff' }}>
            <p style={{ fontSize:11, color:'#4338ca', margin:'0 0 6px' }}>CA via RDV</p>
            <p style={{ fontSize:19, fontWeight:500, color:'#4338ca', margin:0 }}>
              {fmt(caRdvTot)} <span style={{ fontSize:13, opacity:0.5 }}>DA</span>
            </p>
            <p style={{ fontSize:10, color:'#4338ca', margin:'4px 0 0', opacity:0.75 }}>
              {rdvRevs.length} RDV · {totR > 0 ? ((caRdvTot / totR) * 100).toFixed(1) : '0.0'}% du CA
            </p>
          </div>
        )}
        <div style={{ gridColumn: caRdvTot > 0 ? '' : 'span 2' }}>
          <div style={{ borderRadius:12, padding:'14px 12px', height:'100%',
                        background: solde >= 0 ? t.cardAlt : '#fef2f2' }}>
            <p style={{ fontSize:11, color: solde >= 0 ? t.muted : '#991b1b', margin:'0 0 6px' }}>
              Solde net (CA − Depenses)
            </p>
            <p style={{ fontSize:22, fontWeight:500, color: solde >= 0 ? t.text : '#991b1b', margin:0 }}>
              {solde >= 0 ? '+' : ''}{fmt(solde)} <span style={{ fontSize:13, opacity:0.5 }}>DA</span>
            </p>
          </div>
        </div>
      </div>

      {/* Encaissements par mode */}
      {payStats.length > 0 && (
        <Card theme={theme}>
          <div style={{ padding:'14px 18px', borderBottom:`0.5px solid ${t.separator}`,
                        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <p style={{ fontSize:12, color:t.muted, margin:0 }}>Encaissements par mode</p>
            {caRdvTot > 0 && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:6,
                             padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:500,
                             background:'#eef2ff', color:'#4338ca' }}>
                <I.Calendar style={{ width:10, height:10 }}/>
                RDV : {fmt(caRdvTot)} DA
              </span>
            )}
          </div>
          <div style={{ padding:16, display:'flex', flexDirection:'column', gap:16 }}>
            {payStats.map(({ pm, total, cnt, rdvTotal, rdvCnt }) => {
              const p = PAY_INFO[pm]; const PmIc = p.Ic;
              return (
                <div key={pm}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:28, height:28, borderRadius:8,
                                    background:p.bg,
                                    display:'flex', alignItems:'center', justifyContent:'center',
                                    flexShrink:0 }}>
                        <PmIc style={{ width:14, height:14, color:p.color }}/>
                      </div>
                      <div>
                        <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>{p.label}</p>
                        <p style={{ fontSize:10, color:t.muted, margin:0 }}>
                          {cnt} transaction{cnt !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <p style={{ fontSize:13, fontWeight:500, color:p.color, margin:0 }}>{fmt(total)} DA</p>
                      {rdvCnt > 0 && (
                        <p style={{ fontSize:10, color:t.muted, margin:0 }}>
                          dont {fmt(rdvTotal)} DA RDV
                        </p>
                      )}
                    </div>
                  </div>
                  <div style={{ width:'100%', borderRadius:99, height:6,
                                background:t.cardAlt, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:99,
                                  width:`${(total / maxPay) * 100}%`,
                                  background:p.color,
                                  transition:'width 0.3s ease' }}/>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Performances par employe */}
      {empStats.filter(e => e.cnt > 0).length > 0 && (
        <Card theme={theme}>
          <div style={{ padding:'14px 18px', borderBottom:`0.5px solid ${t.separator}` }}>
            <p style={{ fontSize:12, color:t.muted, margin:0 }}>Performances par employe</p>
          </div>
          <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
            {empStats.filter(e => e.cnt > 0).map(emp => (
              <button key={emp.id} onClick={() => setEmpModal(emp)}
                      style={{ width:'100%', textAlign:'left',
                               background:'none', border:'none', cursor:'pointer',
                               padding:0, fontFamily:'inherit' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
                  <div style={{ width:32, height:32, borderRadius:8,
                                backgroundColor: emp.avatar_color || t.text,
                                display:'flex', alignItems:'center', justifyContent:'center',
                                color:'white', fontSize:13, fontWeight:500, flexShrink:0 }}>
                    {emp.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0,
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {emp.name}
                    </p>
                    <p style={{ fontSize:10, color:t.muted, margin:0 }}>
                      {emp.cnt} prestation{emp.cnt !== 1 ? 's' : ''}
                      {emp.rdvCnt > 0 && ` · ${emp.rdvCnt} RDV`}
                    </p>
                  </div>
                  <span style={{ fontSize:13, fontWeight:500, color:t.text }}>{fmt(emp.tot)} DA</span>
                </div>
                <div style={{ width:'100%', maxWidth:'calc(100% - 44px)', marginLeft:44,
                              borderRadius:99, height:6, overflow:'hidden',
                              background:t.cardAlt }}>
                  <div style={{ height:'100%', borderRadius:99,
                                width:`${(emp.tot / maxEmp) * 100}%`,
                                background: emp.avatar_color || t.text,
                                transition:'width 0.3s ease' }}/>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Par service / produit */}
      {catStats.length > 0 && (
        <Card theme={theme}>
          <div style={{ padding:'14px 18px', borderBottom:`0.5px solid ${t.separator}` }}>
            <p style={{ fontSize:12, color:t.muted, margin:0 }}>Par service / produit</p>
          </div>
          <div>
            {catStats.map((cat, i) => {
              const CatIc = ICON_MAP[cat.icon] || I.Tag;
              return (
                <div key={cat.id}
                     style={{ display:'flex', alignItems:'center', gap:12,
                              padding:'12px 16px',
                              borderBottom: i < catStats.length - 1 ? `0.5px solid ${t.separator}` : 'none' }}>
                  <div style={{ width:30, height:30, borderRadius:8,
                                backgroundColor: cat.color,
                                display:'flex', alignItems:'center', justifyContent:'center',
                                flexShrink:0 }}>
                    <CatIc style={{ width:14, height:14, color:'white' }}/>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0,
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {cat.name}
                    </p>
                    <p style={{ fontSize:10, color:t.muted, margin:0 }}>
                      {fmt(cat.unit || 0)} DA{cat.count > 1 ? ` · ${fmt(cat.total)} DA total` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize:13, fontWeight:500, color:'#065f46' }}>
                    {cat.count}×
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {filt.length === 0 && (
        <Card theme={theme}>
          <div style={{ padding:'64px 0', textAlign:'center' }}>
            <I.BarCh style={{ width:40, height:40, margin:'0 auto 12px', color:t.dim, display:'block' }}/>
            <p style={{ fontWeight:500, color:t.muted, margin:0 }}>Aucune donnee sur cette periode</p>
          </div>
        </Card>
      )}

      {empModal && <EmpModal emp={empModal} cats={categories} onClose={() => setEmpModal(null)} theme={theme}/>}
    </div>
  );
}

function EmpModal({ emp, cats, onClose, theme }) {
  const t = theme;
  const getCat = id => cats.find(c => c.id === id);
  const sorted = [...emp.allTx].sort(
    (a, b) => new Date(nd(b.date) + 'T12:00') - new Date(nd(a.date) + 'T12:00')
  );
  const totRev = emp.allTx.filter(tx => tx.type === 'revenue')
    .reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);

  return (
    <Modal open={true} onClose={onClose} title={`${emp.name} - Detail`} theme={theme}>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:12,
                      borderRadius:8, background:t.cardAlt }}>
          <div style={{ width:44, height:44, borderRadius:8,
                        backgroundColor: emp.avatar_color || t.text,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        color:'white', fontSize:18, fontWeight:500 }}>
            {emp.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p style={{ fontSize:14, fontWeight:500, color:t.text, margin:0 }}>{emp.name}</p>
            <p style={{ fontSize:12, color:t.muted, margin:0 }}>
              {emp.allTx.length} transactions · CA {fmt(totRev)} DA
            </p>
          </div>
        </div>

        {emp.caRdv > 0 && (
          <div style={{ borderRadius:8, padding:12,
                        background:'#eef2ff',
                        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <I.Calendar style={{ width:18, height:18, color:'#4338ca' }}/>
              <div>
                <p style={{ fontSize:11, fontWeight:500, color:'#4338ca', margin:0 }}>CA via RDV</p>
                <p style={{ fontSize:12, color:'#4338ca', opacity:0.75, margin:0 }}>
                  {emp.rdvCnt} rendez-vous encaisses
                </p>
              </div>
            </div>
            <p style={{ fontSize:17, fontWeight:500, color:'#4338ca', margin:0 }}>
              {fmt(emp.caRdv)} DA
            </p>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {PAY_KEYS.map(k => {
            const p = PAY_INFO[k]; const PmIc = p.Ic;
            const amtFor = (tx) => {
              if (tx.payment_method === 'multi' && Array.isArray(tx.payments)) {
                return tx.payments
                  .filter(pp => pp.method === k)
                  .reduce((s, pp) => s + (parseFloat(pp.amount) || 0), 0);
              }
              return tx.payment_method === k ? (parseFloat(tx.amount) || 0) : 0;
            };
            const revs   = emp.allTx.filter(tx => tx.type === 'revenue');
            const val    = revs.reduce((s, tx) => s + amtFor(tx), 0);
            const rdvVal = revs.filter(tx => tx.source === 'rdv')
                              .reduce((s, tx) => s + amtFor(tx), 0);
            if (!val) return null;
            return (
              <div key={k} style={{ borderRadius:8, padding:12, background:p.bg }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <PmIc style={{ width:13, height:13, color:p.color, flexShrink:0 }}/>
                  <p style={{ fontSize:11, fontWeight:500, color:p.color, margin:0 }}>{p.label}</p>
                </div>
                <p style={{ fontSize:13, fontWeight:500, color:p.color, margin:0 }}>{fmt(val)} DA</p>
                {rdvVal > 0 && (
                  <p style={{ fontSize:10, color:'#4338ca', margin:'3px 0 0' }}>
                    dont {fmt(rdvVal)} DA RDV
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div>
          {sorted.map((tx, i) => {
            const cat = getCat(tx.category_id);
            const isRev = tx.type === 'revenue';
            const PmIc = PAY_INFO[tx.payment_method]?.Ic || I.MoreH;
            const iconBg    = isRev ? (tx.source === 'rdv' ? '#eef2ff' : t.cardAlt) : '#fef2f2';
            const iconColor = isRev ? (tx.source === 'rdv' ? '#4338ca' : t.text)    : '#991b1b';
            return (
              <div key={tx.id}
                   style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0',
                            borderBottom: i < sorted.length - 1 ? `0.5px solid ${t.separator}` : 'none' }}>
                <div style={{ width:30, height:30, borderRadius:8,
                              background:iconBg,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              flexShrink:0 }}>
                  {tx.source === 'rdv'
                    ? <I.Calendar style={{ width:13, height:13, color:iconColor }}/>
                    : isRev
                      ? <I.ArrowUp style={{ width:13, height:13, color:iconColor }}/>
                      : <I.ArrowDown style={{ width:13, height:13, color:iconColor }}/>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0,
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {cat?.name || tx.description || 'Transaction'}
                    </p>
                    {tx.source === 'rdv' && (
                      <span style={{ fontSize:9, padding:'2px 6px', borderRadius:99,
                                     fontWeight:500, flexShrink:0,
                                     background:'#eef2ff', color:'#4338ca' }}>
                        RDV
                      </span>
                    )}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                    <span style={{ fontSize:11, color:t.muted }}>{disp(nd(tx.date), 'short')}</span>
                    {tx.time && (
                      <>
                        <span style={{ color:t.dim }}>·</span>
                        <span style={{ fontSize:11, color:t.muted }}>{tx.time}</span>
                      </>
                    )}
                    <span style={{ color:t.dim }}>·</span>
                    <PmIc style={{ width:11, height:11, color:t.dim }}/>
                  </div>
                </div>
                <span style={{ fontSize:13, fontWeight:500, flexShrink:0,
                               color: isRev ? '#065f46' : '#991b1b' }}>
                  {isRev ? '+' : '-'}{fmt(tx.amount)} DA
                </span>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <p style={{ textAlign:'center', padding:'32px 0', fontSize:13, color:t.muted, margin:0 }}>
              Aucune transaction
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function TabProductStats({ employees, theme }) {
  const t = theme;
  const [data,    setData]    = useState(null);
  const [loading, setLoad]    = useState(true);
  const [error,   setErr]     = useState('');
  const [period,  setPeriod]  = useState('30d');
  const [empId,   setEmpId]   = useState('');

  const PERIODS = [
    { value:'7d',  label:'7 jours'  },
    { value:'30d', label:'30 jours' },
    { value:'90d', label:'90 jours' },
    { value:'1y',  label:'1 an'     },
  ];

  const getRange = (p) => {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date();
    if (p === '7d')  from.setDate(from.getDate() - 7);
    else if (p === '30d') from.setDate(from.getDate() - 30);
    else if (p === '90d') from.setDate(from.getDate() - 90);
    else from.setFullYear(from.getFullYear() - 1);
    return { from: from.toISOString().split('T')[0], to };
  };

  useEffect(() => {
    setLoad(true); setErr('');
    const q = { ...getRange(period) };
    if (empId) q.employee_id = empId;
    statsApi.getProductStats(q)
      .then(d => { setData(d); setLoad(false); })
      .catch(e => { setErr(e.message || 'Erreur'); setLoad(false); });
  }, [period, empId]);

  const fmtN = n => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <SegmentedControl fullWidth value={period} onChange={setPeriod} options={PERIODS}/>

      {employees.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button onClick={() => setEmpId('')}
                  style={{ padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:500,
                           cursor:'pointer', fontFamily:'inherit',
                           border:`0.5px solid ${!empId ? t.text : t.border}`,
                           background: !empId ? t.cardAlt : 'transparent',
                           color: !empId ? t.text : t.muted }}>
            Tous
          </button>
          {employees.map(e => (
            <button key={e.id} onClick={() => setEmpId(e.id)}
                    style={{ padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:500,
                             cursor:'pointer', fontFamily:'inherit',
                             border:`0.5px solid ${empId === e.id ? (e.avatar_color || t.text) : t.border}`,
                             background: empId === e.id ? `${e.avatar_color || t.text}18` : 'transparent',
                             color: empId === e.id ? (e.avatar_color || t.text) : t.muted }}>
              {e.name}
            </button>
          ))}
        </div>
      )}

      {error && <p style={{ fontSize:12, color:'#991b1b', margin:0 }}>{error}</p>}

      {loading ? (
        <div style={{ padding:48, textAlign:'center' }}>
          <svg className="animate-spin" width="26" height="26" viewBox="0 0 24 24"
               style={{ color:t.text, display:'inline-block' }}>
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
            <path d="M12 2 a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      ) : !data ? (
        <div style={{ padding:48, textAlign:'center', color:t.muted }}>Aucune donnee</div>
      ) : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10 }}>
            {[
              { label:'CA total',     value: fmtN(data.totals?.total_revenue) + ' DA', color:t.text,    bg:t.cardAlt },
              { label:'Transactions', value: data.totals?.total_tx || 0,               color:'#4338ca', bg:'#eef2ff' },
              { label:'Qte vendue',   value: data.totals?.total_qty || 0,              color:'#065f46', bg:'#f0fdf4' },
            ].map(({ label, value, color, bg }) => (
              <div key={label}
                   style={{ background:bg, borderRadius:8,
                            padding:'14px 12px', textAlign:'center' }}>
                <p style={{ fontSize:11, color, margin:'0 0 4px', opacity:0.75 }}>{label}</p>
                <p style={{ fontSize:17, fontWeight:500, color, margin:0, fontFamily:'monospace' }}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {data.products?.length > 0 && (
            <div style={{ background:t.card, border:`0.5px solid ${t.border}`,
                          borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:`0.5px solid ${t.separator}` }}>
                <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>Top services</p>
              </div>
              {data.products.slice(0, 8).map((s, i) => {
                const maxR = data.products[0]?.revenue || 1;
                return (
                  <div key={s.service_name || i}
                       style={{ display:'flex', alignItems:'center', gap:12,
                                padding:'10px 16px',
                                borderTop: i > 0 ? `0.5px solid ${t.separator}` : 'none' }}>
                    <span style={{ fontSize:11, fontWeight:500, color:t.dim,
                                   width:16, textAlign:'center' }}>
                      {i + 1}
                    </span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:13, fontWeight:500, color:t.text,
                                  margin:'0 0 4px',
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {s.service_name || 'Service sans nom'}
                      </p>
                      <div style={{ height:4, borderRadius:99,
                                    background:t.cardAlt, overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:99,
                                      width:`${(s.revenue / maxR) * 100}%`,
                                      background:t.text,
                                      transition:'width 0.3s ease' }}/>
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>
                        {fmtN(s.revenue)} DA
                      </p>
                      <p style={{ fontSize:10, color:t.muted, margin:0 }}>
                        {s.qty_sold || 0} vente{(s.qty_sold || 0) > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {data.categories?.filter(c => c.category_name).length > 0 && (
            <div style={{ background:t.card, border:`0.5px solid ${t.border}`,
                          borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:`0.5px solid ${t.separator}` }}>
                <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>Par categorie</p>
              </div>
              {data.categories.filter(c => c.category_name).slice(0, 6).map((c, i) => (
                <div key={c.category_name}
                     style={{ display:'flex', alignItems:'center', gap:10,
                              padding:'10px 16px',
                              borderTop: i > 0 ? `0.5px solid ${t.separator}` : 'none' }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', flexShrink:0,
                                background: c.category_color || t.text }}/>
                  <p style={{ flex:1, fontSize:13, fontWeight:500, color:t.text, margin:0,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {c.category_name}
                  </p>
                  <p style={{ fontSize:13, fontWeight:500, color:t.muted, margin:0 }}>
                    {fmtN(c.revenue)} DA
                  </p>
                </div>
              ))}
            </div>
          )}

          {(!data.products?.length && !data.categories?.filter(c => c.category_name).length) && (
            <div style={{ padding:40, textAlign:'center', color:t.muted, fontSize:14 }}>
              Aucune vente sur cette periode
            </div>
          )}
        </>
      )}
    </div>
  );
}
