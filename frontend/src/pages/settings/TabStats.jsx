import { useState, useMemo, useEffect } from 'react';
import { I, ICON_MAP } from '../../utils/icons';
import { Modal } from '../../components/UI';
import { statsApi } from '../../utils/api';
import { disp } from '../../utils/dates';
import { Card, KpiBox, nd, fmt, PAY_INFO, PAY_KEYS } from './shared';

export default function TabStats({ transactions, employees, categories, theme }) {
  const [subTab, setSubTab] = useState('caisse');
  const isDark = theme.mode === 'dark';
  const subBtnS = (active) => ({
    flex:1, padding:'9px 0', borderRadius:10, fontSize:13, fontWeight:700,
    border:'none', cursor:'pointer', transition:'all .15s',
    background: active ? (isDark?'rgba(255,255,255,0.12)':'#fff') : 'transparent',
    color: active ? (isDark?'#f1f5f9':'#111827') : theme.muted,
    boxShadow: active ? (isDark?'0 2px 8px rgba(0,0,0,0.4)':'0 2px 8px rgba(0,0,0,0.08)') : 'none',
  });

  return (
    <div className="space-y-4">
      <div style={{ display:'flex', gap:4, padding:4, background:theme.inputBg,
        borderRadius:14, border:`1px solid ${theme.border}` }}>
        <button onClick={()=>setSubTab('caisse')} style={subBtnS(subTab==='caisse')}>
          Caisse
        </button>
        <button onClick={()=>setSubTab('services')} style={subBtnS(subTab==='services')}>
          Services
        </button>
      </div>

      {subTab === 'caisse'   && <TabStatsCaisse transactions={transactions} employees={employees} categories={categories} theme={theme} />}
      {subTab === 'services' && <TabProductStats employees={employees} theme={theme} />}
    </div>
  );
}

function TabStatsCaisse({ transactions, employees, categories, theme }) {
  const isDark = theme.mode === 'dark';
  const [preset, setPr] = useState('today');
  const [cs, setCs] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [ce, setCe] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [selEmp, setSel] = useState('all');
  const [empModal, setEmpModal] = useState(null);

  const sod  = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const eod  = d => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
  const som  = d => { const x = new Date(d.getFullYear(), d.getMonth(), 1); return x; };
  const eomFn = d => { const x = new Date(d); x.setMonth(x.getMonth()+1,0); x.setHours(23,59,59,999); return x; };

  const { start, end } = useMemo(() => {
    const n = new Date();
    if (preset === 'today') return { start: sod(n), end: eod(n) };
    if (preset === 'week') {
      const s = new Date(n); s.setDate(n.getDate() - ((n.getDay()+6)%7)); s.setHours(0,0,0,0);
      const e = new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999);
      return { start: s, end: e };
    }
    if (preset === 'month') return { start: som(n), end: eomFn(n) };
    return { start: sod(new Date(cs+'T12:00')), end: eod(new Date(ce+'T12:00')) };
  }, [preset, cs, ce]);

  const filt = useMemo(() => transactions.filter(tx => {
    const ds = nd(tx.date); if (!ds) return false;
    const d = new Date(ds+'T12:00');
    if (d < start || d > end) return false;
    if (selEmp !== 'all' && tx.employee_id !== selEmp) return false;
    return true;
  }), [transactions, start, end, selEmp]);

  const revs = filt.filter(t => t.type === 'revenue');
  const exps = filt.filter(t => t.type === 'expense');
  const totR = revs.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
  const totE = exps.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
  const solde = totR - totE;

  // Répartit le montant d'une transaction par mode de paiement
  // (gère les transactions multi-paiement via tx.payments[])
  const amountByMethod = (tx, method) => {
    if (tx.payment_method === 'multi' && Array.isArray(tx.payments)) {
      return tx.payments
        .filter(p => p.method === method)
        .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    }
    return tx.payment_method === method ? (parseFloat(tx.amount) || 0) : 0;
  };
  // Compte 1 tx si elle contient cette méthode (même partiellement)
  const hasMethod = (tx, method) => {
    if (tx.payment_method === 'multi' && Array.isArray(tx.payments)) {
      return tx.payments.some(p => p.method === method && parseFloat(p.amount) > 0);
    }
    return tx.payment_method === method;
  };

  const empStats = employees.map(emp => {
    const er    = revs.filter(t => t.employee_id === emp.id);
    const rdvTx = er.filter(t => t.source === 'rdv');
    const tot   = er.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
    const caRdv = rdvTx.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
    const byPay = {};
    PAY_KEYS.forEach(k => { byPay[k] = er.reduce((s,t) => s + amountByMethod(t, k), 0); });
    return { ...emp, tot, cnt: er.length, byPay, caRdv, rdvCnt: rdvTx.length, allTx: filt.filter(t => t.employee_id===emp.id) };
  }).sort((a,b) => b.tot - a.tot);
  const maxEmp = Math.max(...empStats.map(e => e.tot), 1);

  const rdvRevs  = revs.filter(r => r.source === 'rdv');
  const caRdvTot = rdvRevs.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
  const payStats = PAY_KEYS.map(pm => ({
    pm,
    total:    revs.reduce((s,x) => s + amountByMethod(x, pm), 0),
    cnt:      revs.filter(r => hasMethod(r, pm)).length,
    rdvTotal: rdvRevs.reduce((s,x) => s + amountByMethod(x, pm), 0),
    rdvCnt:   rdvRevs.filter(r => hasMethod(r, pm)).length,
  })).filter(p => p.cnt > 0).sort((a,b) => b.total - a.total);
  const maxPay = Math.max(...payStats.map(p => p.total), 1);

  // Stats par service/produit agrégées depuis transaction_items (pas category_id)
  // → chaque unité vendue compte comme une vente réelle
  const svcMap = {};
  revs.forEach(t => {
    const items = Array.isArray(t.items) ? t.items : [];
    if (items.length > 0) {
      items.forEach(it => {
        const key  = it.service_name || 'Sans nom';
        const qty  = parseInt(it.qty) || 1;
        const unit = parseFloat(it.unit_price) || 0;
        if (!svcMap[key]) svcMap[key] = { name: key, count: 0, total: 0, unit };
        svcMap[key].count += qty;
        svcMap[key].total += unit * qty;
        svcMap[key].unit   = unit;
      });
    } else {
      const cat = categories.find(c => c.id === t.category_id);
      const key = cat?.name || t.description || 'Sans catégorie';
      const qty = parseInt(t.qty_total) || 1;
      const amt = parseFloat(t.amount) || 0;
      if (!svcMap[key]) svcMap[key] = { name: key, count: 0, total: 0, unit: qty>0 ? amt/qty : amt };
      svcMap[key].count += qty;
      svcMap[key].total += amt;
    }
  });
  const catStats = Object.values(svcMap)
    .map(s => {
      const cat = categories.find(c => c.name === s.name);
      return { ...s, id: cat?.id || s.name, icon: cat?.icon, color: cat?.color || '#6b7280' };
    })
    .filter(c => c.count > 0)
    .sort((a,b) => b.total - a.total);

  const PRES = [{v:'today',l:'Auj.'},{v:'week',l:'Semaine'},{v:'month',l:'Mois'},{v:'custom',l:'Perso.'}];
  const filterTabBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <div className="space-y-4">
      <Card theme={theme}>
        <div className="p-4 space-y-3">
          <div className="flex gap-1 p-1 rounded-2xl" style={{ background: filterTabBg }}>
            {PRES.map(p => (
              <button key={p.v} onClick={() => setPr(p.v)}
                className="flex-1 py-2.5 px-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap"
                style={{ background: preset===p.v ? '#1a73e8' : 'transparent', color: preset===p.v ? 'white' : theme.muted }}>
                {p.l}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex gap-2">
              {[['Du', cs, setCs],['Au', ce, setCe]].map(([lbl, val, set]) => (
                <div key={lbl} className="flex-1">
                  <p className="text-[10px] font-semibold mb-1" style={{ color: theme.muted }}>{lbl}</p>
                  <input type="date" value={val} onChange={e => set(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                    style={{ background: theme.inputBg, border: `1px solid ${theme.inputBorder}`, color: theme.text }} />
                </div>
              ))}
            </div>
          )}
          {employees.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setSel('all')}
                className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                style={{ background: selEmp==='all' ? '#1a73e8' : 'transparent', borderColor: selEmp==='all' ? 'transparent' : theme.border, color: selEmp==='all' ? 'white' : theme.muted }}>
                Tous
              </button>
              {employees.map(e => (
                <button key={e.id} onClick={() => setSel(e.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                  style={{ background: selEmp===e.id ? (isDark?'rgba(255,255,255,0.1)':'rgba(17,24,39,0.15)') : 'transparent', borderColor: selEmp===e.id ? '#111827' : theme.border, color: selEmp===e.id ? '#a5a0ff' : theme.muted }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: e.avatar_color || '#111827' }} />
                  {e.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <KpiBox label="Chiffre d'affaires" value={fmt(totR)} color="#4ade80" bg="rgba(74,222,128,0.08)" border="rgba(74,222,128,0.2)" />
        <KpiBox label="Dépenses" value={fmt(totE)} color="#f87171" bg="rgba(248,113,113,0.08)" border="rgba(248,113,113,0.2)" />
        {caRdvTot > 0 && (
          <div className="rounded-2xl p-3.5" style={{ background: 'rgba(17,24,39,0.08)', border: '1px solid rgba(17,24,39,0.2)' }}>
            <p className="text-[10px] font-semibold mb-1" style={{ color: '#a5a0ff' }}>CA via RDV</p>
            <p className="text-xl font-bold" style={{ color: '#a5a0ff' }}>
              {fmt(caRdvTot)} <span className="text-sm font-normal opacity-50">€</span>
            </p>
            <p className="text-[10px] mt-1" style={{ color: '#a5a0ff' }}>
              {rdvRevs.length} RDV · {totR > 0 ? ((caRdvTot/totR)*100).toFixed(1) : '0.0'}% du CA
            </p>
          </div>
        )}
        <div className={caRdvTot > 0 ? '' : 'col-span-2'} style={{ gridColumn: caRdvTot > 0 ? '' : 'span 2' }}>
          <div className="rounded-2xl p-3.5 h-full" style={{ background: solde>=0 ? 'rgba(17,24,39,0.1)' : 'rgba(248,113,113,0.08)', border: `1px solid ${solde>=0 ? 'rgba(17,24,39,0.25)' : 'rgba(248,113,113,0.2)'}` }}>
            <p className="text-[10px] font-semibold mb-1" style={{ color: solde>=0 ? '#a5a0ff' : '#f87171' }}>Solde net (CA − Dépenses)</p>
            <p className="text-2xl font-bold" style={{ color: solde>=0 ? '#a5a0ff' : '#f87171' }}>
              {solde>=0?'+':''}{fmt(solde)} <span className="text-sm font-normal opacity-50">€</span>
            </p>
          </div>
        </div>
      </div>

      {payStats.length > 0 && (
        <Card theme={theme}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.muted }}>Encaissements par mode</p>
            {caRdvTot > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold" style={{ background: 'rgba(17,24,39,0.12)', color: '#a5a0ff' }}>
                📅 RDV : {fmt(caRdvTot)} €
              </span>
            )}
          </div>
          <div className="p-4 space-y-4">
            {payStats.map(({ pm, total, cnt, rdvTotal, rdvCnt }) => {
              const p = PAY_INFO[pm]; const PmIc = p.Ic;
              return (
                <div key={pm}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: p.bg }}>
                        <PmIc className="w-3.5 h-3.5" style={{ color: p.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: theme.text }}>{p.label}</p>
                        <p className="text-[10px]" style={{ color: theme.muted }}>{cnt} transaction{cnt!==1?'s':''}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: p.color }}>{fmt(total)} €</p>
                      {rdvCnt > 0 && <p className="text-[10px]" style={{ color: theme.muted }}>dont {fmt(rdvTotal)} € RDV</p>}
                    </div>
                  </div>
                  <div className="w-full rounded-full h-1.5" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${(total/maxPay)*100}%`, background: `linear-gradient(90deg,${p.color},${p.color}aa)` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {empStats.filter(e => e.cnt > 0).length > 0 && (
        <Card theme={theme}>
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.muted }}>Performances par employé</p>
          </div>
          <div className="p-4 space-y-3">
            {empStats.filter(e => e.cnt > 0).map(emp => (
              <button key={emp.id} onClick={() => setEmpModal(emp)}
                className="w-full text-left"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: emp.avatar_color || '#111827' }}>
                    {emp.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>{emp.name}</p>
                    <p className="text-[10px]" style={{ color: theme.muted }}>
                      {emp.cnt} prestation{emp.cnt!==1?'s':''}
                      {emp.rdvCnt > 0 && ` · ${emp.rdvCnt} RDV`}
                    </p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: theme.text }}>{fmt(emp.tot)} €</span>
                </div>
                <div className="w-full rounded-full h-1.5 ml-11" style={{ background: isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)', maxWidth:'calc(100% - 2.75rem)' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${(emp.tot/maxEmp)*100}%`, background: `linear-gradient(90deg,${emp.avatar_color||'#111827'},${emp.avatar_color||'#111827'}88)` }} />
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {catStats.length > 0 && (
        <Card theme={theme}>
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.muted }}>Par service / produit</p>
          </div>
          <div className="divide-y" style={{ '--tw-divide-color': theme.border }}>
            {catStats.map((cat, i) => {
              const CatIc = ICON_MAP[cat.icon] || I.Tag;
              return (
                <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.color }}>
                    <CatIc className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: theme.text }}>{cat.name}</p>
                    <p className="text-[10px]" style={{ color: theme.muted }}>
                      {fmt(cat.unit||0)} €{cat.count>1 ? ` · ${fmt(cat.total)} € total` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#4ade80' }}>{cat.count}×</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {filt.length === 0 && (
        <Card theme={theme}>
          <div className="py-16 text-center">
            <I.BarCh className="w-12 h-12 mx-auto mb-3" style={{ color: theme.dim }} />
            <p className="font-bold" style={{ color: theme.muted }}>Aucune donnée sur cette période</p>
          </div>
        </Card>
      )}

      {empModal && <EmpModal emp={empModal} cats={categories} onClose={() => setEmpModal(null)} theme={theme} />}
    </div>
  );
}

function EmpModal({ emp, cats, onClose, theme }) {
  const getCat = id => cats.find(c => c.id === id);
  const sorted = [...emp.allTx].sort((a,b) => new Date(nd(b.date)+'T12:00') - new Date(nd(a.date)+'T12:00'));
  const totRev = emp.allTx.filter(t=>t.type==='revenue').reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
  return (
    <Modal open={true} onClose={onClose} title={`${emp.name} - Detail`} theme={theme}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: theme.inputBg }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-bold" style={{ backgroundColor: emp.avatar_color || '#111827' }}>
            {emp.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold" style={{ color: theme.text }}>{emp.name}</p>
            <p className="text-sm" style={{ color: theme.muted }}>{emp.allTx.length} transactions · CA {fmt(totRev)} €</p>
          </div>
        </div>
        {emp.caRdv > 0 && (
          <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: 'rgba(17,24,39,0.1)', border: '1px solid rgba(17,24,39,0.25)' }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 20 }}>📅</span>
              <div>
                <p className="text-[10px] font-bold" style={{ color: '#a5a0ff' }}>CA via RDV</p>
                <p className="text-xs" style={{ color: '#a5a0ff' }}>{emp.rdvCnt} rendez-vous encaissés</p>
              </div>
            </div>
            <p className="text-lg font-black" style={{ color: '#a5a0ff' }}>{fmt(emp.caRdv)} €</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {PAY_KEYS.map(k => {
            const p = PAY_INFO[k]; const PmIc = p.Ic;
            const allRevs = emp.allTx.filter(t=>t.type==='revenue'&&t.payment_method===k);
            const val    = allRevs.reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
            const rdvVal = allRevs.filter(t=>t.source==='rdv').reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
            if (!val) return null;
            return (
              <div key={k} className="rounded-xl p-3" style={{ background: p.bg, border: `1px solid ${p.border}` }}>
                <div className="flex items-center gap-2 mb-1">
                  <PmIc className="w-4 h-4 flex-shrink-0" style={{ color: p.color }} />
                  <p className="text-[10px] font-bold" style={{ color: p.color }}>{p.label}</p>
                </div>
                <p className="text-sm font-bold" style={{ color: p.color }}>{fmt(val)} €</p>
                {rdvVal > 0 && <p className="text-[10px] mt-0.5" style={{ color: '#a5a0ff' }}>dont {fmt(rdvVal)} € RDV</p>}
              </div>
            );
          })}
        </div>
        <div>
          {sorted.map((tx, i) => {
            const cat = getCat(tx.category_id);
            const isRev = tx.type === 'revenue';
            const PmIc = PAY_INFO[tx.payment_method]?.Ic || I.MoreH;
            return (
              <div key={tx.id} className="flex items-center gap-3 py-3" style={{ borderBottom: i < sorted.length-1 ? `1px solid ${theme.border}` : 'none' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: isRev ? (tx.source==='rdv'?'rgba(17,24,39,0.2)':'rgba(17,24,39,0.15)') : 'rgba(248,113,113,0.12)' }}>
                  {tx.source==='rdv' ? <span style={{ fontSize:14 }}>📅</span> : isRev ? <I.ArrowUp className="w-3.5 h-3.5" style={{ color: '#a5a0ff' }} /> : <I.ArrowDown className="w-3.5 h-3.5" style={{ color: '#f87171' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate" style={{ color: theme.text }}>{cat?.name || tx.description || 'Transaction'}</p>
                    {tx.source === 'rdv' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0" style={{ background: 'rgba(17,24,39,0.15)', color: '#a5a0ff' }}>RDV</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs" style={{ color: theme.muted }}>{disp(nd(tx.date),'short')}</span>
                    {tx.time && <><span style={{ color: theme.dim }}>·</span><span className="text-xs" style={{ color: theme.muted }}>{tx.time}</span></>}
                    <span style={{ color: theme.dim }}>·</span>
                    <PmIc className="w-3 h-3" style={{ color: theme.dim }} />
                  </div>
                </div>
                <span className="text-sm font-bold flex-shrink-0" style={{ color: isRev ? '#a5a0ff' : '#f87171' }}>
                  {isRev?'+':'-'}{fmt(tx.amount)} €
                </span>
              </div>
            );
          })}
          {sorted.length === 0 && <p className="text-center py-8 text-sm" style={{ color: theme.muted }}>Aucune transaction</p>}
        </div>
      </div>
    </Modal>
  );
}

function TabProductStats({ employees, theme }) {
  const isDark = theme.mode === 'dark';
  const [data,    setData]    = useState(null);
  const [loading, setLoad]    = useState(true);
  const [error,   setErr]     = useState('');
  const [period,  setPeriod]  = useState('30d');
  const [empId,   setEmpId]   = useState('');

  const PERIODS = [
    { v:'7d',  l:'7 jours' },
    { v:'30d', l:'30 jours' },
    { v:'90d', l:'90 jours' },
    { v:'1y',  l:'1 an' },
  ];

  const getRange = (p) => {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date();
    if (p==='7d')  from.setDate(from.getDate()-7);
    else if (p==='30d') from.setDate(from.getDate()-30);
    else if (p==='90d') from.setDate(from.getDate()-90);
    else from.setFullYear(from.getFullYear()-1);
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

  const fmtN = n => Number(n||0).toFixed(2);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', gap:6, background:theme.inputBg, borderRadius:14, padding:4, border:`1px solid ${theme.border}` }}>
        {PERIODS.map(p => (
          <button key={p.v} onClick={()=>setPeriod(p.v)}
            style={{ flex:1, padding:'8px 4px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer', border:'none',
              background: period===p.v?'#111827':'transparent',
              color: period===p.v?'white':theme.muted }}>
            {p.l}
          </button>
        ))}
      </div>

      {employees.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button onClick={()=>setEmpId('')}
            style={{ padding:'6px 12px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer',
              border:`1px solid ${!empId?'#111827':theme.border}`,
              background: !empId?'rgba(17,24,39,0.12)':'transparent',
              color: !empId?'#111827':theme.muted }}>
            Tous
          </button>
          {employees.map(e => (
            <button key={e.id} onClick={()=>setEmpId(e.id)}
              style={{ padding:'6px 12px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer',
                border:`1px solid ${empId===e.id?e.avatar_color||'#111827':theme.border}`,
                background: empId===e.id?`${e.avatar_color||'#111827'}18`:'transparent',
                color: empId===e.id?e.avatar_color||'#111827':theme.muted }}>
              {e.name}
            </button>
          ))}
        </div>
      )}

      {error && <p style={{ fontSize:12, color:'#f87171', fontWeight:600 }}>{error}</p>}

      {loading ? (
        <div style={{ padding:48, textAlign:'center' }}>
          <div style={{ width:28,height:28,borderRadius:99,border:`2px solid ${isDark?'rgba(255,255,255,0.1)':'rgba(17,24,39,0.2)'}`,borderTopColor:isDark?'#e6edf3':'#111827',animation:'spin .8s linear infinite',margin:'0 auto' }}/>
        </div>
      ) : !data ? (
        <div style={{ padding:48, textAlign:'center', color:theme.muted }}>Aucune donnée</div>
      ) : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {[
              ['CA total', fmtN(data.totals?.total_revenue)+' €', theme.text],
              ['Transactions', data.totals?.total_tx||0, '#374151'],
              ['Qte vendue', data.totals?.total_qty||0, '#4ade80'],
            ].map(([l,v,c])=>(
              <div key={l} style={{ background:theme.card, border:`1px solid ${theme.border}`,
                borderRadius:14, padding:'14px 12px', textAlign:'center' }}>
                <p style={{ fontSize:11, color:theme.muted, margin:'0 0 4px', fontWeight:700 }}>{l}</p>
                <p style={{ fontSize:18, fontWeight:900, color:c, margin:0, fontFamily:'monospace' }}>{v}</p>
              </div>
            ))}
          </div>

          {data.products?.length > 0 && (
            <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}` }}>
                <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>✂️ Top services</p>
              </div>
              {data.products.slice(0,8).map((s, i) => {
                const maxR = data.products[0]?.revenue || 1;
                return (
                  <div key={s.service_name||i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', borderTop: i>0?`1px solid ${theme.border}`:'none' }}>
                    <span style={{ fontSize:11, fontWeight:700, color:theme.dim, width:16, textAlign:'center' }}>{i+1}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:13, fontWeight:700, color:theme.text, margin:'0 0 4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {s.service_name || 'Service sans nom'}
                      </p>
                      <div style={{ height:4, borderRadius:99, background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)', overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:99, width:`${(s.revenue/maxR)*100}%`, background:'linear-gradient(90deg,#111827,#374151)' }}/>
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <p style={{ fontSize:13, fontWeight:700, color:'#111827', margin:0 }}>{fmtN(s.revenue)} €</p>
                      <p style={{ fontSize:10, color:theme.muted, margin:0 }}>{s.qty_sold||0} vente{(s.qty_sold||0)>1?'s':''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {data.categories?.filter(c=>c.category_name).length > 0 && (
            <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}` }}>
                <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>🏷️ Par catégorie</p>
              </div>
              {data.categories.filter(c=>c.category_name).slice(0,6).map((c, i) => (
                <div key={c.category_name} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderTop: i>0?`1px solid ${theme.border}`:'none' }}>
                  <div style={{ width:10, height:10, borderRadius:99, flexShrink:0, background:c.category_color||'#111827' }}/>
                  <p style={{ flex:1, fontSize:13, fontWeight:600, color:theme.text, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.category_name}</p>
                  <p style={{ fontSize:13, fontWeight:700, color:theme.muted, margin:0 }}>{fmtN(c.revenue)} €</p>
                </div>
              ))}
            </div>
          )}

          {(!data.products?.length && !data.categories?.filter(c=>c.category_name).length) && (
            <div style={{ padding:40, textAlign:'center', color:theme.muted, fontSize:14 }}>
              Aucune vente sur cette période
            </div>
          )}
        </>
      )}
    </div>
  );
}
