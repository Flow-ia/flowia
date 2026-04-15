import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { I, ICON_MAP, PAL, PAL2 } from '../utils/icons';
import { Toast, useToast, CodeInput, Confirm, Modal } from '../components/UI';
import { notifApi, exportApi, absencesApi, commissionsApi, loyaltyApi, promoApi, statsApi, clientsApi, bookingApi, mediaApi } from '../utils/api';
import { CategoryForm, EmployeeForm, TransactionForm } from '../components/Forms';
import { PinSetup } from '../components/PinGate';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme, BRAND } from '../hooks/useTheme';
import { api } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { fmtDate, sod, eod, som, eom, disp } from '../utils/dates';
import Agenda from './Agenda';

const nd = (d) => { if (!d) return ''; const s = typeof d === 'string' ? d : new Date(d).toISOString(); return s.substring(0, 10); };
const fmt = (n) => Number(n || 0).toFixed(2);
const ML = ['janvier','fevrier','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','decembre'];

const PAY_INFO = {
  cash:     { label: 'Especes',  color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.2)',  Ic: I.Wallet },
  card:     { label: 'Carte',    color: '#1a73e8', bg: 'rgba(26,115,232,0.1)', border: 'rgba(26,115,232,0.2)', Ic: I.CreditCard },
  transfer: { label: 'Virement', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.2)',  Ic: I.Bank },
  other:    { label: 'Autre',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)',  Ic: I.MoreH },
};
const PAY_KEYS = ['cash','card','transfer','other'];

// ── Themed Card ───────────────────────────────────────────────────────────────
function Card({ children, className = '', style = {}, theme }) {
  return (
    <div className={`rounded-3xl overflow-hidden ${className}`} style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.mode === 'light' ? '0 2px 12px rgba(0,0,0,0.05)' : 'none', ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children, theme }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest mb-2 px-1" style={{ color: theme.muted }}>{children}</p>;
}

function KpiBox({ label, value, unit = '€', color, bg, border }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="text-[10px] font-semibold mb-1.5" style={{ color }}>{label}</p>
      <p className="text-xl font-bold leading-none" style={{ color }}>
        {value}<span className="text-sm font-normal opacity-50 ml-0.5">{unit}</span>
      </p>
    </div>
  );
}

// ── TAB STATS ─────────────────────────────────────────────────────────────────
function TabStats({ transactions, employees, categories, theme }) {
  const [subTab, setSubTab] = useState('caisse'); // 'caisse' | 'services'
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
      {/* Sous-navigation Caisse / Services */}
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

// ── Stats Caisse (anciennement TabStats) ─────────────────────────────────────
function TabStatsCaisse({ transactions, employees, categories, theme }) {
  const isDark = theme.mode === 'dark';
  const [preset, setPr] = useState('today');
  const [cs, setCs] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [ce, setCe] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [selEmp, setSel] = useState('all');
  const [empModal, setEmpModal] = useState(null);

  // Helpers date
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

  const empStats = employees.map(emp => {
    const er    = revs.filter(t => t.employee_id === emp.id);
    const rdvTx = er.filter(t => t.source === 'rdv');
    const tot   = er.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
    const caRdv = rdvTx.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
    const byPay = {};
    PAY_KEYS.forEach(k => { byPay[k] = er.filter(t => t.payment_method===k).reduce((s,t) => s+(parseFloat(t.amount)||0), 0); });
    return { ...emp, tot, cnt: er.length, byPay, caRdv, rdvCnt: rdvTx.length, allTx: filt.filter(t => t.employee_id===emp.id) };
  }).sort((a,b) => b.tot - a.tot);
  const maxEmp = Math.max(...empStats.map(e => e.tot), 1);

  const rdvRevs  = revs.filter(r => r.source === 'rdv');
  const caRdvTot = rdvRevs.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
  const payStats = PAY_KEYS.map(pm => ({
    pm,
    total:    revs.filter(r => r.payment_method===pm).reduce((s,x) => s+(parseFloat(x.amount)||0), 0),
    cnt:      revs.filter(r => r.payment_method===pm).length,
    rdvTotal: rdvRevs.filter(r => r.payment_method===pm).reduce((s,x) => s+(parseFloat(x.amount)||0), 0),
    rdvCnt:   rdvRevs.filter(r => r.payment_method===pm).length,
  })).filter(p => p.cnt > 0).sort((a,b) => b.total - a.total);
  const maxPay = Math.max(...payStats.map(p => p.total), 1);

  // Stats par catégorie
  const catStats = categories.filter(c => c.type==='revenue').map(cat => ({
    ...cat,
    count: revs.filter(t => t.category_id===cat.id).length,
    total: revs.filter(t => t.category_id===cat.id).reduce((s,t) => s+(parseFloat(t.amount)||0), 0),
  })).filter(c => c.count > 0).sort((a,b) => b.total - a.total);

  const PRES = [{v:'today',l:'Auj.'},{v:'week',l:'Semaine'},{v:'month',l:'Mois'},{v:'custom',l:'Perso.'}];
  const filterTabBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <div className="space-y-4">
      {/* Filtres */}
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
                  style={{ background: selEmp===e.id ? 'rgba(17,24,39,0.15)' : 'transparent', borderColor: selEmp===e.id ? '#111827' : theme.border, color: selEmp===e.id ? '#a5a0ff' : theme.muted }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: e.avatar_color || '#111827' }} />
                  {e.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* KPIs */}
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

      {/* Encaissements par mode de paiement */}
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

      {/* Performances par employé */}
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

      {/* Stats par catégorie/service */}
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
                    <p className="text-[10px]" style={{ color: theme.muted }}>{cat.count} vente{cat.count!==1?'s':''}</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#4ade80' }}>{fmt(cat.total)} €</span>
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
        {/* Bloc RDV si applicable */}
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

// ── TAB TRANSACTIONS ──────────────────────────────────────────────────────────
function TabTransactions({ transactions, employees, categories, onUpdate, onDelete, showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const [edit, setEdit] = useState(null);
  const [modal, setModal] = useState(false);
  const [delId, setDelId] = useState(null);
  const [search, setSearch] = useState('');
  const [typeF, setTypeF] = useState('all');

  const getEmp = id => employees.find(e=>e.id===id);
  const getCat = id => categories.find(c=>c.id===id);

  const filtered = transactions.filter(tx => {
    if (typeF !== 'all' && tx.type !== typeF) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return getCat(tx.category_id)?.name?.toLowerCase().includes(q)
      || getEmp(tx.employee_id)?.name?.toLowerCase().includes(q)
      || tx.description?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-3.5 flex items-start gap-2.5" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
        <I.Key className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
        <p className="text-xs font-semibold" style={{ color: '#fbbf24' }}>Zone admin — modification et suppression des transactions</p>
      </div>

      <div className="relative">
        <I.Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: theme.muted }} />
        <input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-3.5 rounded-2xl text-sm focus:outline-none"
          style={{ background: theme.card, border: `1px solid ${theme.border}`, color: theme.text }} />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><I.X className="w-4 h-4" style={{ color: theme.muted }} /></button>}
      </div>

      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>
        {[['all','Tout'],['revenue','Revenus'],['expense','Depenses']].map(([v,l]) => (
          <button key={v} onClick={() => setTypeF(v)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
            style={{ background: typeF===v ? '#1a73e8' : 'transparent', color: typeF===v ? 'white' : theme.muted }}>
            {l}
          </button>
        ))}
      </div>

      <p className="text-xs px-1" style={{ color: theme.muted }}>{filtered.length} transaction{filtered.length>1?'s':''}</p>

      <Card theme={theme}>
        {filtered.length === 0 ? (
          <div className="py-14 text-center">
            <I.BarCh className="w-10 h-10 mx-auto mb-3" style={{ color: theme.dim }} />
            <p className="text-sm" style={{ color: theme.muted }}>Aucune transaction</p>
          </div>
        ) : (
          <div>
            {filtered.slice(0,100).map((tx, i) => {
              const cat = getCat(tx.category_id);
              const emp = getEmp(tx.employee_id);
              const isRev = tx.type === 'revenue';
              const pm = PAY_INFO[tx.payment_method] || PAY_INFO.other;
              const PmIc = pm.Ic;
              return (
                <div key={tx.id} className="flex items-start gap-3 px-4 py-3"
                  style={{ borderBottom: i < Math.min(filtered.length,100)-1 ? `1px solid ${theme.border}` : 'none', fontFamily:"'DM Sans', sans-serif" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: isRev ? (tx.source==='rdv'?'rgba(17,24,39,0.15)':'rgba(17,24,39,0.12)') : 'rgba(248,113,113,0.1)' }}>
                    {tx.source==='rdv' ? <span style={{ fontSize:16 }}>📅</span> : isRev ? <I.ArrowUp className="w-4 h-4" style={{ color:'#a5a0ff' }} /> : <I.ArrowDown className="w-4 h-4" style={{ color: '#f87171' }} />}
                  </div>
                  {/* Corps : 2 lignes */}
                  <div className="flex-1 min-w-0">
                    {/* Ligne 1 : Nom + Montant */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:4 }}>
                      <p className="text-sm font-semibold truncate flex-1" style={{ color: theme.text }}>{tx.source==='rdv' ? (tx.description || 'Encaissement RDV') : (cat?.name || tx.description || 'Transaction')}</p>
                      <span style={{ fontWeight:900, fontSize:16, fontFamily:"'DM Mono', monospace", color: isRev ? '#a5a0ff' : '#f87171', flexShrink:0 }}>
                        {isRev?'+':'-'}{fmt(tx.amount)} €
                      </span>
                    </div>
                    {/* Ligne 2 : Date, Employe, Paiement */}
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ fontSize:10, color: theme.muted, flexShrink:0 }}>{disp(nd(tx.date),'short')}{tx.time ? ` · ${tx.time}` : ''}</span>
                      {emp && <span style={{ fontSize:10, color:theme.dim }}>·</span>}
                      {emp && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 6px 2px 3px', borderRadius:99, background: isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)', fontSize:10, fontWeight:700, color:theme.text, flexShrink:0 }}>
                          <div style={{ width:12, height:12, borderRadius:6, backgroundColor:emp.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:6, fontWeight:900 }}>
                            {emp.name?.charAt(0)?.toUpperCase()}
                          </div>
                          {emp.name}
                        </span>
                      )}
                      {<span style={{ fontSize:10, color:theme.dim }}>·</span>}
                      <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 6px', borderRadius:99, background:pm.bg, color:pm.color, fontSize:10, fontWeight:700, flexShrink:0 }}>
                        <PmIc className="w-2.5 h-2.5" style={{ color: pm.color, flexShrink:0 }} />
                        {pm.label}
                      </span>
                      {tx.source === 'rdv' && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:2, padding:'2px 6px', borderRadius:99, background:'rgba(17,24,39,0.13)', color:'#a5a0ff', fontSize:10, fontWeight:800, flexShrink:0 }}>
                          📅 RDV
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5 items-end">
                    <div className="flex gap-1">
                      <button onClick={() => { setEdit(tx); setModal(true); }} title="Modifier (admin)" className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)' }}>
                        <I.Edit className="w-3 h-3" style={{ color: theme.muted }} />
                      </button>
                      <button onClick={() => setDelId(tx.id)} title="Supprimer (admin)" className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'rgba(248,113,113,0.1)' }}>
                        <I.Trash className="w-3 h-3" style={{ color: '#f87171' }} />
                      </button>
                    </div>
                    {/* Badge audit - transaction verrouillée */}
                    <span style={{ fontSize:8, fontWeight:700, letterSpacing:'0.05em', padding:'1px 5px', borderRadius:4, background:'rgba(251,191,36,0.1)', color:'#fbbf24', border:'1px solid rgba(251,191,36,0.2)' }}>
                      🔒 AUDIT
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <TransactionForm open={modal} onClose={() => { setModal(false); setEdit(null); }}
        onSubmit={async d => {
          try {
            if (edit) { await onUpdate(edit.id, d); showToast('Transaction modifiee ✓'); }
          } catch(e) {
            if (e.code === 'ACTION_ADMIN_ONLY') showToast('Session admin expiree - re-saisissez votre PIN', 'error');
            else showToast('Erreur lors de la modification', 'error');
          }
          setEdit(null); setModal(false);
        }}
        employees={employees} categories={categories} init={edit} />
      <Confirm open={!!delId} onClose={() => setDelId(null)}
        onConfirm={async () => {
          try {
            await onDelete(delId);
            showToast('Transaction supprimee ✓');
          } catch(e) {
            if (e.code === 'ACTION_ADMIN_ONLY') showToast('Session admin expiree - re-saisissez votre PIN', 'error');
            else showToast('Erreur lors de la suppression', 'error');
          }
          setDelId(null);
        }}
        title="Supprimer cette transaction ?" desc="Action admin irréversible — enregistrée dans l'audit trail." theme={theme} />
    </div>
  );
}

// ── TAB EMPLOYÉS ──────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
// PAGE EMPLOYÉS — sous-onglets : Équipe | Absences | Commissions
// ════════════════════════════════════════════════════════════════════════════
function TabEmployeesMain({ employees, transactions, onAdd, onUpd, onDel, showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const navigate = useNavigate();
  const location = useLocation();

  // Dériver le sous-onglet depuis l'URL
  const segment = location.pathname.replace(/^\/settings\/?/, '').split('/')[0] || '';
  const sub = segment === 'absences'    ? 'absences'
            : segment === 'commissions' ? 'commissions'
            : segment === 'horaires'    ? 'horaires'
            : 'team';

  const setSub = (id) => {
    const target = id === 'absences'    ? '/settings/absences'
                 : id === 'commissions' ? '/settings/commissions'
                 : id === 'horaires'    ? '/settings/horaires'
                 : '/settings/equipe';
    navigate(target, { replace: false });
  };

  const SUB_TABS = [
    { id: 'team',        label: "Équipe",               icon: I.Users },
    { id: 'horaires',    label: 'Horaires',              icon: I.Clock },
    { id: 'absences',    label: 'Absences',              icon: I.Calendar },
    { id: 'commissions', label: 'Commissions',           icon: I.Award },
  ];

  return (
    <div className="space-y-4">
      {/* Sous-navigation */}
      <div style={{ display:'flex', gap:6, background:theme.inputBg, borderRadius:16, padding:4, border:`1px solid ${theme.border}` }}>
        {SUB_TABS.map(({ id, label, icon: Ic }) => {
          const active = sub === id;
          return (
            <button key={id} onClick={() => setSub(id)}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                padding:'9px 8px', borderRadius:12, border:'none', cursor:'pointer', transition:'all .15s',
                background: active ? (isDark ? 'rgba(17,24,39,0.25)' : '#fff') : 'transparent',
                color: active ? '#111827' : theme.muted,
                fontWeight: active ? 800 : 600, fontSize:13,
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
              <Ic style={{ width:15, height:15 }} />
              {label}
            </button>
          );
        })}
      </div>

      {sub === 'team'        && <TabEmployees employees={employees} transactions={transactions} onAdd={onAdd} onUpd={onUpd} onDel={onDel} showToast={showToast} theme={theme} />}
      {sub === 'horaires'    && <TabHorairesEmployes employees={employees} theme={theme} showToast={showToast} />}
      {sub === 'absences'    && <TabAbsences employees={employees} theme={theme} />}
      {sub === 'commissions' && <TabCommissions employees={employees} theme={theme} />}
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════════════════
   TAB HORAIRES EMPLOYÉS — Wrapper vers les horaires personnalisés
   (réutilise le TeamTab d'Agenda.jsx via une iframe de données)
   ════════════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════════
   TAB HORAIRES EMPLOYÉS — Wrapper complet avec TeamTab intégré
   ════════════════════════════════════════════════════════════════════════════ */
// Utilitaires horaires (côté client)
const toMinClient = (t) => { const s = String(t||'0:0').substring(0,5); const [h,m]=s.split(':').map(Number); return h*60+m; };

// Vérifie si une plage employé est dans les plages ouvertes du commerce (hors pauses)
function isSlotInBizRanges(slotStart, slotEnd, bizHours, bizBreaks, dayOfWeek) {
  const bh = bizHours.find(h=>(h.day_of_week??0)===dayOfWeek);
  if (!bh || bh.is_open===false) return false;
  const bizOpen  = toMinClient(bh.open_time||'09:00');
  const bizClose = toMinClient(bh.close_time||'18:00');
  const sMin = toMinClient(slotStart);
  const eMin = toMinClient(slotEnd);
  if (sMin < bizOpen || eMin > bizClose || sMin >= eMin) return false;
  // Vérifier que la plage ne chevauche pas une pause
  const dayBreaks = (bizBreaks||[]).filter(b=>(b.day_of_week??0)===dayOfWeek);
  for (const brk of dayBreaks) {
    const bs = toMinClient(brk.break_start);
    const be = toMinClient(brk.break_end);
    if (sMin < be && eMin > bs) return false; // chevauchement avec une pause
  }
  return true;
}

function TeamTab({ employees, businessHours, bizBreaks, showToast, theme: t }) {
  const isDark = t.mode === 'dark';
  const [selId, setSelId]         = useState(null);
  const [empSlots, setEmpSlots]   = useState({}); // { empId: [{ day_of_week, slot_start, slot_end }] }
  const [useCustom, setUseCustom] = useState({});
  const [loading, setLoading]     = useState({});
  const [saving, setSaving]       = useState(false);

  // Construit des plages par défaut depuis les horaires commerce
  const buildDefaultSlots = useCallback((empId) => {
    const slots = [];
    businessHours.forEach(bh => {
      if (bh.is_open!==false) {
        slots.push({
          day_of_week: bh.day_of_week??0,
          slot_start:  String(bh.open_time||'09:00').substring(0,5),
          slot_end:    String(bh.close_time||'18:00').substring(0,5),
        });
      }
    });
    return slots;
  }, [businessHours]);

  const loadEmp = async (empId) => {
    if (empSlots[empId] !== undefined) return;
    setLoading(p=>({...p,[empId]:true}));
    try {
      // Charger nouveau système (plages multiples)
      const slots = await bookingApi.getEmpSlots(empId);
      if (slots && slots.length > 0) {
        setEmpSlots(p=>({...p,[empId]: slots.map(s=>({
          day_of_week: s.day_of_week,
          slot_start:  String(s.slot_start).substring(0,5),
          slot_end:    String(s.slot_end).substring(0,5),
        }))}));
        setUseCustom(p=>({...p,[empId]:true}));
      } else {
        // Fallback : ancien système employee_hours
        const rows = await bookingApi.getEmpHours(empId);
        const hasCustom = rows.length>0 && rows.some(r=>!r.use_business_hours);
        if (hasCustom) {
          // Convertir ancien format → nouveau
          const converted = rows
            .filter(r=>r.is_open!==false)
            .map(r=>({ day_of_week:r.day_of_week, slot_start:String(r.open_time).substring(0,5), slot_end:String(r.close_time).substring(0,5) }));
          setEmpSlots(p=>({...p,[empId]:converted}));
          setUseCustom(p=>({...p,[empId]:true}));
        } else {
          setEmpSlots(p=>({...p,[empId]:[]}));
          setUseCustom(p=>({...p,[empId]:false}));
        }
      }
    } catch {
      setEmpSlots(p=>({...p,[empId]:[]}));
      setUseCustom(p=>({...p,[empId]:false}));
    } finally { setLoading(p=>({...p,[empId]:false})); }
  };

  const getSlots = id => empSlots[id] || [];

  const addSlot = (empId, dayOfWeek) => {
    const bh = businessHours.find(h=>(h.day_of_week??0)===dayOfWeek);
    const defStart = bh ? String(bh.open_time||'09:00').substring(0,5) : '09:00';
    const defEnd   = bh ? String(bh.close_time||'18:00').substring(0,5) : '18:00';
    setEmpSlots(p=>({...p,[empId]:[...getSlots(empId), { day_of_week:dayOfWeek, slot_start:defStart, slot_end:defEnd }]}));
  };

  const removeSlot = (empId, idx) =>
    setEmpSlots(p=>({...p,[empId]:getSlots(empId).filter((_,i)=>i!==idx)}));

  const updateSlot = (empId, idx, key, val) =>
    setEmpSlots(p=>({...p,[empId]:getSlots(empId).map((s,i)=>i===idx?{...s,[key]:val}:s)}));

  const save = async (empId) => {
    setSaving(true);
    try {
      if (useCustom[empId]) {
        const slots = getSlots(empId);
        // Validation : toutes les plages doivent être dans les horaires commerce
        const invalid = slots.filter(s => !isSlotInBizRanges(s.slot_start, s.slot_end, businessHours, bizBreaks, s.day_of_week));
        if (invalid.length) {
          showToast('Certaines plages sont hors des horaires du commerce ou chevauchent une pause.','err');
          setSaving(false); return;
        }
        await bookingApi.saveEmpSlots({ employee_id:empId, slots });
        // Mettre aussi employee_hours en mode "use_business_hours=true" pour compatibilité
        await bookingApi.saveEmpHours({ employee_id:empId, hours: Array.from({length:7},(_,i)=>({
          day_of_week:i, open_time:'09:00', close_time:'18:00', is_open:true, use_business_hours:true
        }))});
      } else {
        // Remet sur horaires commerce : supprimer les plages perso
        await bookingApi.deleteEmpSlots(empId);
        await bookingApi.saveEmpHours({ employee_id:empId, hours: Array.from({length:7},(_,i)=>({
          day_of_week:i, open_time:'09:00', close_time:'18:00', is_open:true, use_business_hours:true
        }))});
      }
      showToast('Horaires sauvegardes !');
      setEmpSlots(p=>({...p,[empId]:undefined}));
      await loadEmp(empId);
    } catch(e){ showToast(e.message||'Erreur','err'); }
    finally { setSaving(false); }
  };

  const DAYS_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

  return (
    <div className="space-y-3 pb-8">
      <div className="rounded-2xl p-3 flex gap-2" style={{ background:'rgba(17,24,39,0.08)', border:'1px solid rgba(17,24,39,0.2)' }}>
        <span>ℹ️</span>
        <p className="text-xs" style={{ color:t.muted }}>
          Par défaut chaque employé suit les horaires du commerce (pauses comprises).
          Activez <strong style={{ color:t.text }}>Horaires personnalisés</strong> pour définir
          des plages spécifiques — elles doivent rester dans les horaires d'ouverture.
        </p>
      </div>
      {employees.length===0 ? (
        <div className="rounded-2xl py-12 text-center" style={{ border:`1px dashed ${t.border}` }}>
          <p className="text-sm" style={{ color:t.muted }}>Aucun employé — ajoutez-en depuis les Réglages</p>
        </div>
      ) : employees.map(emp => {
        const open = selId===emp.id;
        const slots = getSlots(emp.id);
        const hasCustom = !!useCustom[emp.id];
        return (
          <div key={emp.id} className="rounded-2xl overflow-hidden" style={{ border:`1px solid ${open?'rgba(17,24,39,0.4)':t.border}` }}>
            {/* ── En-tête employé ── */}
            <button onClick={()=>{ if(open){setSelId(null)}else{setSelId(emp.id);loadEmp(emp.id);} }}
              className="w-full p-4 flex items-center gap-3 text-left"
              style={{ background:open?(isDark?'rgba(17,24,39,0.12)':'rgba(17,24,39,0.06)'):(isDark?'rgba(255,255,255,0.03)':'white') }}>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-lg flex-shrink-0"
                style={{ backgroundColor:emp.avatar_color||'#111827' }}>{emp.name.charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm" style={{ color:t.text }}>{emp.name}</p>
                <p className="text-xs mt-0.5" style={{ color:t.muted }}>
                  {emp.role&&<>{emp.role} · </>}
                  {hasCustom ? `🕐 ${slots.length} plage${slots.length>1?'s':''} personnalisee${slots.length>1?'s':''}` : '📋 Suit le commerce'}
                </p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"
                style={{ color:t.muted, transform:open?'rotate(90deg)':'none', transition:'transform .2s' }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            {/* ── Panneau d'édition ── */}
            {open && (
              <div className="p-4 space-y-4" style={{ borderTop:`1px solid ${t.border}` }}>
                {loading[emp.id] ? (
                  <div className="flex justify-center py-6">
                    <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor:'rgba(17,24,39,0.2)', borderTopColor:'#111827' }} />
                  </div>
                ) : (
                  <>
                    {/* Toggle horaires perso */}
                    <div className="flex items-center justify-between p-3 rounded-xl"
                      style={{ background:hasCustom?'rgba(17,24,39,0.08)':t.inputBg }}>
                      <div>
                        <p className="text-sm font-bold" style={{ color:t.text }}>Horaires personnalisés</p>
                        <p className="text-xs" style={{ color:t.muted }}>
                          {hasCustom ? 'Prioritaires sur le commerce' : 'Suit les horaires du commerce'}
                        </p>
                      </div>
                      <Toggle on={hasCustom} onChange={()=>{
                        const n = !hasCustom;
                        setUseCustom(p=>({...p,[emp.id]:n}));
                        if (n && !empSlots[emp.id]) loadEmp(emp.id);
                        if (n && empSlots[emp.id]?.length===0) setEmpSlots(p=>({...p,[emp.id]:buildDefaultSlots(emp.id)}));
                      }} />
                    </div>

                    {/* Plages par jour */}
                    {hasCustom && (
                      <div className="space-y-3">
                        {DAYS_SHORT.map((dayLabel, dayIdx) => {
                          const bh = businessHours.find(h=>(h.day_of_week??0)===dayIdx);
                          const bizOpen  = bh && bh.is_open!==false;
                          const daySlots = slots.map((s,i)=>({...s,_idx:i})).filter(s=>s.day_of_week===dayIdx);

                          return (
                            <div key={dayIdx} className="rounded-xl overflow-hidden"
                              style={{ border:`1px solid ${bizOpen ? t.border : 'rgba(239,68,68,0.15)'}`,
                                       background: bizOpen ? (isDark?'rgba(255,255,255,0.02)':'rgba(17,24,39,0.02)') : (isDark?'rgba(239,68,68,0.04)':'rgba(239,68,68,0.02)') }}>
                              {/* En-tête du jour */}
                              <div className="flex items-center justify-between px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black w-8" style={{ color: bizOpen ? t.text : '#ef4444' }}>
                                    {dayLabel}
                                  </span>
                                  {!bizOpen && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                                      style={{ background:'rgba(239,68,68,0.1)', color:'#ef4444' }}>Commerce fermé</span>
                                  )}
                                  {bizOpen && bh && (
                                    <span className="text-[10px]" style={{ color:t.dim }}>
                                      {String(bh.open_time||'09:00').substring(0,5)}-{String(bh.close_time||'18:00').substring(0,5)}
                                    </span>
                                  )}
                                </div>
                                {bizOpen && (
                                  <button onClick={()=>addSlot(emp.id, dayIdx)}
                                    style={{ fontSize:11, color:'#111827', background:'rgba(17,24,39,0.1)',
                                             border:'none', borderRadius:8, padding:'3px 8px', cursor:'pointer', fontWeight:700 }}>
                                    + Plage
                                  </button>
                                )}
                              </div>

                              {/* Plages du jour */}
                              {bizOpen && (
                                <div className="px-3 pb-3 space-y-2">
                                  {daySlots.length === 0 ? (
                                    <p className="text-xs italic py-1" style={{ color:t.dim }}>
                                      Absent ce jour — cliquez "+ Plage" pour ajouter
                                    </p>
                                  ) : daySlots.map(s => {
                                    const valid = isSlotInBizRanges(s.slot_start, s.slot_end, businessHours, bizBreaks, dayIdx);
                                    return (
                                      <div key={s._idx} className="flex items-center gap-2 p-2 rounded-xl"
                                        style={{ background: valid
                                          ? (isDark?'rgba(74,222,128,0.06)':'rgba(74,222,128,0.05)')
                                          : (isDark?'rgba(239,68,68,0.08)':'rgba(239,68,68,0.06)'),
                                          border:`1px solid ${valid ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.3)'}` }}>
                                        <span style={{ fontSize:12, flexShrink:0 }}>{valid ? '✅' : '⚠️'}</span>
                                        <input type="time" value={s.slot_start}
                                          onChange={e=>updateSlot(emp.id,s._idx,'slot_start',e.target.value)}
                                          className="flex-1 px-2 py-1.5 rounded-lg text-xs focus:outline-none"
                                          style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
                                        <span className="text-xs" style={{ color:t.muted }}>→</span>
                                        <input type="time" value={s.slot_end}
                                          onChange={e=>updateSlot(emp.id,s._idx,'slot_end',e.target.value)}
                                          className="flex-1 px-2 py-1.5 rounded-lg text-xs focus:outline-none"
                                          style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text }} />
                                        <button onClick={()=>removeSlot(emp.id,s._idx)}
                                          style={{ width:26, height:26, borderRadius:8, background:'rgba(239,68,68,0.1)',
                                                   border:'none', cursor:'pointer', color:'#ef4444', fontSize:14,
                                                   display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
                                      </div>
                                    );
                                  })}
                                  {/* Afficher les pauses du jour pour info */}
                                  {(bizBreaks||[]).filter(b=>b.day_of_week===dayIdx).map((brk,bi)=>(
                                    <div key={bi} className="flex items-center gap-2 px-2 py-1 rounded-lg"
                                      style={{ background:'rgba(251,146,60,0.06)', border:'1px solid rgba(251,146,60,0.15)' }}>
                                      <span style={{ fontSize:11 }}>☕</span>
                                      <span className="text-[11px] font-semibold" style={{ color:'#f97316' }}>
                                        Pause commerce : {String(brk.break_start).substring(0,5)} – {String(brk.break_end).substring(0,5)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <p className="text-[11px] px-1" style={{ color:t.dim }}>
                          ✅ = plage valide · ⚠️ = hors horaires commerce ou chevauchement pause
                        </p>
                      </div>
                    )}

                    <button onClick={()=>save(emp.id)} disabled={saving}
                      className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40"
                      style={{ background:'#111827' }}>
                      {saving ? 'Enregistrement...' : `Sauvegarder - ${emp.name}`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TabHorairesEmployes({ employees, theme, showToast }) {
  const [businessHours, setBusinessHours] = useState([]);
  const [bizBreaks,     setBizBreaks]     = useState([]);
  const [loaded,        setLoaded]        = useState(false);

  useEffect(() => {
    Promise.all([
      bookingApi.getHours().catch(()=>[]),
      bookingApi.getBreaks().catch(()=>[]),
    ]).then(([hrs, brks]) => {
      setBusinessHours(Array.isArray(hrs)?hrs:[]);
      setBizBreaks(Array.isArray(brks)?brks:[]);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return (
    <div style={{ padding:48, textAlign:'center' }}>
      <div style={{ width:28,height:28,borderRadius:99,border:'2px solid rgba(17,24,39,0.2)',
        borderTopColor:'#1a73e8',animation:'spin .8s linear infinite',margin:'0 auto' }}/>
    </div>
  );

  return (
    <TeamTab
      employees={employees.filter(e=>e.is_active!==false)}
      businessHours={businessHours}
      bizBreaks={bizBreaks}
      showToast={showToast}
      theme={theme}
    />
  );
}


// ── Modal de gestion PIN employé (admin) ───────────────────────────────────────
function EmployeePinManager({ emp, onClose, showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const [pinStatus, setPinStatus] = useState(null); // { has_pin, is_active }
  const [step, setStep] = useState('status'); // 'status' | 'set_pin' | 'confirm_pin' | 'confirm_delete'
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [newPin, setNewPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getEmployeePinStatus(emp.id);
        if (!cancelled) setPinStatus(s);
      } catch { if (!cancelled) setPinStatus({ has_pin: false, is_active: false }); }
    })();
    return () => { cancelled = true; };
  }, [emp.id]);

  const pressPin = (k, cur, setCur, onFull) => {
    if (k === '⌫') { setCur(p => p.slice(0,-1)); setErr(''); return; }
    if (cur.length >= 4) return;
    const next = cur + k; setCur(next); setErr('');
    if (next.length === 4) setTimeout(() => onFull(next), 200);
  };

  const handleSetPin = async () => {
    setLoading(true); setErr('');
    try {
      await api.setEmployeePin(emp.id, { pin: newPin });
      setPinStatus({ has_pin: true, is_active: true });
      showToast('Code PIN crée !');
      setStep('status'); setPin1(''); setPin2(''); setNewPin('');
    } catch (e) { setErr(e.message || 'Erreur serveur'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await api.deleteEmployeePin(emp.id);
      setPinStatus({ has_pin: false, is_active: false });
      showToast('Code PIN supprime');
      setStep('status');
    } catch (e) { showToast('Erreur : ' + e.message); }
    finally { setLoading(false); }
  };

  const handleToggle = async () => {
    if (!pinStatus?.has_pin) return;
    setLoading(true);
    try {
      const res = await api.toggleEmployeePin(emp.id, { is_active: !pinStatus.is_active });
      setPinStatus(s => ({ ...s, is_active: res.is_active }));
      showToast(res.is_active ? 'PIN active' : 'PIN désactive');
    } catch (e) { showToast('Erreur : ' + e.message); }
    finally { setLoading(false); }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  const PinKeypad = ({ cur, setCur, onFull }) => (
    <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto mt-4">
      {keys.map((k, i) => (
        k === '' ? <div key={i}/> : (
          <button key={k+i} onClick={() => pressPin(k, cur, setCur, onFull)}
            className="h-[52px] rounded-xl text-lg font-medium select-none active:scale-90 transition-all"
            style={{
              background: k==='⌫' ? (isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)') : (isDark?'rgba(255,255,255,0.07)':'#fff'),
              border: `1px solid ${theme.border}`, color: k==='⌫'?theme.muted:theme.text,
              boxShadow: isDark?'none':'0 1px 4px rgba(0,0,0,0.06)',
            }}>{k}</button>
        )
      ))}
    </div>
  );

  const PinDots = ({ count }) => (
    <div className={`flex justify-center gap-4 my-4 ${shake ? 'animate-bounce' : ''}`}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{
          width:12, height:12, borderRadius:'50%',
          background: i<count ? '#111827' : 'transparent',
          border: i<count ? 'none' : `2px solid ${isDark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.15)'}`,
          transform: i<count?'scale(1.2)':'scale(1)',
          transition: 'all 0.15s',
          boxShadow: i<count?'0 0 8px rgba(17,24,39,0.5)':'none',
        }}/>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl pb-8 pt-5 px-5 relative"
        style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow:'0 -8px 40px rgba(0,0,0,0.25)' }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4 sm:hidden" style={{ background: isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.1)' }}/>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-sm"
          style={{ background: isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)', color: theme.muted }}>✕</button>

        {/* En-tête employé */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
            style={{ backgroundColor: emp.avatar_color||'#111827', boxShadow:`0 4px 14px ${emp.avatar_color||'#111827'}44` }}>
            {emp.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color:theme.text }}>{emp.name}</p>
            <p className="text-xs" style={{ color:theme.muted }}>Code PIN de sécurité</p>
          </div>
        </div>

        {/* ── Écran status ── */}
        {step === 'status' && (
          <div className="space-y-3">
            {/* Badge statut */}
            <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
              style={{ background: isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)', border:`1px solid ${theme.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: pinStatus?.has_pin ? (pinStatus?.is_active ? 'rgba(74,222,128,0.12)' : 'rgba(251,191,36,0.12)') : 'rgba(148,163,184,0.12)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={pinStatus?.has_pin ? (pinStatus?.is_active ? '#4ade80' : '#fbbf24') : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color:theme.text }}>
                    {pinStatus === null ? 'Chargement...' : pinStatus.has_pin ? 'Code PIN configure' : 'Aucun code PIN'}
                  </p>
                  <p className="text-xs" style={{ color: pinStatus?.has_pin ? (pinStatus?.is_active ? '#4ade80' : '#fbbf24') : theme.muted }}>
                    {pinStatus === null ? '' : pinStatus.has_pin ? (pinStatus.is_active ? '● Actif - requis pour chaque transaction' : '● Désactive') : 'Transactions sans validation'}
                  </p>
                </div>
              </div>
              {pinStatus?.has_pin && (
                <button onClick={handleToggle} disabled={loading}
                  className="w-11 h-6 rounded-full relative flex-shrink-0"
                  style={{ background: pinStatus.is_active ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: pinStatus.is_active ? '24px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }}/>
                </button>
              )}
            </div>

            {/* Bouton créer / modifier PIN */}
            <button onClick={() => { setStep('set_pin'); setPin1(''); setPin2(''); setNewPin(''); setErr(''); }}
              className="w-full py-3.5 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2"
              style={{ background: '#111827', boxShadow:'0 6px 20px rgba(17,24,39,0.3)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              {pinStatus?.has_pin ? 'Modifier le code PIN' : 'Creer un code PIN'}
            </button>

            {/* Bouton supprimer PIN */}
            {pinStatus?.has_pin && (
              <button onClick={() => setStep('confirm_delete')}
                className="w-full py-3 rounded-2xl text-sm font-medium"
                style={{ background:'rgba(248,113,113,0.08)', color:'#f87171', border:'1px solid rgba(248,113,113,0.2)' }}>
                Supprimer le code PIN
              </button>
            )}
          </div>
        )}

        {/* ── Saisie nouveau PIN ── */}
        {step === 'set_pin' && (
          <div className="text-center">
            <p className="font-bold text-base mb-1" style={{ color:theme.text }}>Nouveau code PIN</p>
            <p className="text-xs mb-2" style={{ color:theme.muted }}>Choisissez 4 chiffres pour {emp.name}</p>
            <PinDots count={pin1.length}/>
            {err && <p className="text-xs text-red-400 font-medium mb-1">{err}</p>}
            <PinKeypad cur={pin1} setCur={setPin1} onFull={(v) => { setNewPin(v); setStep('confirm_pin'); setPin2(''); }}/>
            <button onClick={() => { setStep('status'); setPin1(''); setErr(''); }} className="mt-4 text-xs underline" style={{ color:theme.muted }}>Annuler</button>
          </div>
        )}

        {/* ── Confirmation PIN ── */}
        {step === 'confirm_pin' && (
          <div className="text-center">
            <p className="font-bold text-base mb-1" style={{ color:theme.text }}>Confirmer le code</p>
            <p className="text-xs mb-2" style={{ color:theme.muted }}>Entrez à nouveau le code PIN</p>
            <PinDots count={pin2.length}/>
            {err && <p className="text-xs text-red-400 font-medium mb-1">{err}</p>}
            <PinKeypad cur={pin2} setCur={setPin2} onFull={async (v) => {
              if (v === newPin) {
                await handleSetPin();
              } else {
                setShake(true);
                setErr('Les codes ne correspondent pas');
                setTimeout(() => { setPin2(''); setStep('confirm_pin'); setShake(false); setErr(''); }, 800);
              }
            }}/>
            <button onClick={() => { setStep('set_pin'); setPin1(''); setPin2(''); setErr(''); }} className="mt-4 text-xs underline" style={{ color:theme.muted }}>Recommencer</button>
          </div>
        )}

        {/* ── Confirmation suppression ── */}
        {step === 'confirm_delete' && (
          <div className="text-center py-2">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.2)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <p className="font-bold text-base mb-2" style={{ color:theme.text }}>Supprimer le PIN ?</p>
            <p className="text-sm mb-5" style={{ color:theme.muted }}>{emp.name} pourra effectuer des transactions sans validation.</p>
            <div className="flex gap-2">
              <button onClick={() => setStep('status')} className="flex-1 py-3 rounded-2xl text-sm font-medium"
                style={{ background: isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)', color:theme.muted, border:`1px solid ${theme.border}` }}>
                Annuler
              </button>
              <button onClick={handleDelete} disabled={loading} className="flex-1 py-3 rounded-2xl text-sm font-bold text-white"
                style={{ background:'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                {loading ? '...' : 'Supprimer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TAB EMPLOYÉS ──────────────────────────────────────────────────────────────
function TabEmployees({ employees, transactions, onAdd, onUpd, onDel, showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const [form, setForm] = useState({ open: false, init: null });
  const [delId, setDelId] = useState(null);
  const [pinModal, setPinModal] = useState(null);
  // Smart delete state
  const [smartDelModal, setSmartDelModal] = useState(null); // emp | null
  const [futureAppts, setFutureAppts]     = useState([]);
  const [smartDelLoading, setSmartDelLoading] = useState(false);
  const [smartDelResult, setSmartDelResult]   = useState(null); // { reassigned, cancelled }

  const openSmartDelete = async (emp) => {
    setSmartDelModal(emp);
    setSmartDelResult(null);
    setSmartDelLoading(true);
    try {
      const appts = await api.getEmployeeFutureAppts(emp.id);
      setFutureAppts(appts);
    } catch { setFutureAppts([]); }
    finally { setSmartDelLoading(false); }
  };

  const doSmartDelete = async () => {
    if (!smartDelModal) return;
    setSmartDelLoading(true);
    try {
      const result = await api.smartDeleteEmployee(smartDelModal.id);
      setSmartDelResult(result);
      onDel(smartDelModal.id);
      showToast('Employé supprime avec succes');
    } catch (e) {
      showToast('Erreur : ' + (e.message || 'impossible de supprimer'), 'error');
    } finally {
      setSmartDelLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button onClick={() => setForm({ open: true, init: null })}
        className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        style={{ background: '#111827' }}>
        <I.Plus className="w-5 h-5" /> Ajouter un employé
      </button>

      {employees.length === 0 ? (
        <Card theme={theme}><div className="py-16 text-center"><I.Users className="w-12 h-12 mx-auto mb-3" style={{ color: theme.dim }} /><p className="text-sm" style={{ color: theme.muted }}>Aucun employé</p></div></Card>
      ) : employees.map(emp => {
        const er = transactions.filter(t => t.employee_id === emp.id && t.type === 'revenue');
        const tot = er.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
        const byPay = {};
        PAY_KEYS.forEach(k => { byPay[k] = er.filter(t => t.payment_method === k).reduce((s,t) => s+(parseFloat(t.amount)||0), 0); });
        return (
          <Card key={emp.id} theme={theme}>
            <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                style={{ backgroundColor: emp.avatar_color || '#111827' }}>
                {emp.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold" style={{ color: theme.text }}>{emp.name}</p>
                {emp.role && <p className="text-xs" style={{ color: theme.muted }}>{emp.role}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setPinModal(emp)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: isDark ? 'rgba(17,24,39,0.12)' : 'rgba(17,24,39,0.08)' }} title="Gérer le code PIN">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </button>
                <button onClick={() => setForm({ open: true, init: emp })} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)' }}>
                  <I.Edit className="w-4 h-4" style={{ color: theme.muted }} />
                </button>
                <button onClick={() => openSmartDelete(emp)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(248,113,113,0.1)' }} title="Supprimer l'employé">
                  <I.Trash className="w-4 h-4" style={{ color: '#f87171' }} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-6" style={{ borderTop: `1px solid ${theme.border}` }}>
              <div className="px-2 py-3 text-center" style={{ borderRight: `1px solid ${theme.border}` }}>
                <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#4ade80' }}>CA</p>
                <p className="text-sm font-bold" style={{ color: '#4ade80' }}>{fmt(tot)} €</p>
              </div>
              <div className="px-2 py-3 text-center" style={{ borderRight: `1px solid ${theme.border}` }}>
                <p className="text-[10px] mb-0.5" style={{ color: '#a5a0ff' }}>📅</p>
                {(() => { const rv = er.filter(t=>t.source==='rdv').reduce((s,t)=>s+(parseFloat(t.amount)||0),0); return rv > 0 ? <p className="text-sm font-bold" style={{ color: '#a5a0ff' }}>{fmt(rv)} €</p> : <p className="text-sm" style={{ color: theme.dim }}>—</p>; })()}
              </div>
              {PAY_KEYS.map(k => {
                const p = PAY_INFO[k]; const PmIc = p.Ic;
                return (
                  <div key={k} className="px-2 py-3 text-center" style={{ borderRight: k !== 'other' ? `1px solid ${theme.border}` : 'none' }}>
                    <div className="flex items-center justify-center mb-1"><PmIc className="w-3 h-3" style={{ color: p.color }} /></div>
                    <p className="text-sm font-bold" style={{ color: p.color }}>{fmt(byPay[k])} €</p>
                  </div>
                );
              })}
            </div>
            {/* Visibilité employé */}
            <div className="grid grid-cols-2 divide-x" style={{ borderTop: `1px solid ${theme.border}`, borderColor: theme.border }}>
              <div className="px-3 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold" style={{ color: theme.text }}>Site réservation</p>
                  <p className="text-[10px]" style={{ color: emp.show_on_booking!==false ? '#4ade80' : '#f87171' }}>{emp.show_on_booking!==false ? '✓ Visible' : '✗ Masque'}</p>
                </div>
                <button onClick={async () => { const upd = await onUpd(emp.id, { ...emp, show_on_booking: emp.show_on_booking===false }); if (upd) showToast('Visibilite mise a jour'); }}
                  className="w-10 h-5 rounded-full relative flex-shrink-0"
                  style={{ background: emp.show_on_booking!==false ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: emp.show_on_booking!==false ? '22px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="px-3 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold" style={{ color: theme.text }}>Caisse</p>
                  <p className="text-[10px]" style={{ color: emp.show_in_caisse!==false ? '#4ade80' : '#f87171' }}>{emp.show_in_caisse!==false ? '✓ Visible' : '✗ Masque'}</p>
                </div>
                <button onClick={async () => { const upd = await onUpd(emp.id, { ...emp, show_in_caisse: emp.show_in_caisse===false }); if (upd) showToast('Visibilite mise a jour'); }}
                  className="w-10 h-5 rounded-full relative flex-shrink-0"
                  style={{ background: emp.show_in_caisse!==false ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: emp.show_in_caisse!==false ? '22px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
            </div>
            {/* Permissions agenda employé */}
            <div className="px-4 py-3 space-y-2" style={{ borderTop: `1px solid ${theme.border}` }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.muted }}>Permissions Agenda</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut annuler ses RDV</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Annulation + email client automatique</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_cancel: !emp.can_cancel });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_cancel ? 'linear-gradient(90deg,#111827,#374151)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_cancel ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut modifier ses RDV</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Changer date, heure, coordonnées</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_modify: !emp.can_modify });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_modify ? 'linear-gradient(90deg,#111827,#374151)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_modify ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut encaisser les RDV</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Valider paiement → ajout auto en caisse</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_encash: !emp.can_encash });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_encash ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_encash ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              {/* Toggle can_use_promo */}
              <div className="flex items-center justify-between py-2" style={{ borderTop:`1px solid ${theme.border}`, marginTop:6, paddingTop:10 }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut utiliser les codes promo</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Saisir un code promo ou fidélité à la caisse</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_use_promo: !(emp.can_use_promo !== false) });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: (emp.can_use_promo !== false) ? 'linear-gradient(90deg,#111827,#8b5cf6)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: (emp.can_use_promo !== false) ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
            </div>
            {/* Permissions crédit */}
            <div className="px-4 py-3 space-y-2" style={{ borderTop: `1px solid ${theme.border}` }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.muted }}>Permissions Crédit</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut accorder un crédit</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Créer une dette client dans le module crédit</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_grant_credit: !emp.can_grant_credit });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_grant_credit ? 'linear-gradient(90deg,#f59e0b,#f97316)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_grant_credit ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>Peut encaisser un remboursement crédit</p>
                  <p className="text-xs" style={{ color: theme.muted }}>Recevoir un paiement et solder le crédit d'un client</p>
                </div>
                <button onClick={async () => {
                  const updated = await onUpd(emp.id, { ...emp, can_repay_credit: !emp.can_repay_credit });
                  if (updated) showToast('Permission mise a jour');
                }}
                  className="w-12 h-6 rounded-full relative flex-shrink-0 ml-3"
                  style={{ background: emp.can_repay_credit ? 'linear-gradient(90deg,#4ade80,#22c55e)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)') }}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: emp.can_repay_credit ? '26px' : '2px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
                </button>
              </div>
              </div>
          </Card>
        );
      })}

      <EmployeeForm open={form.open} onClose={() => setForm({ open: false, init: null })}
        onSubmit={async d => { form.init ? await onUpd(form.init.id, d) : await onAdd(d); showToast(form.init ? 'Modifie !' : 'Ajoute !'); }}
        init={form.init} />
      {/* Modal Smart Delete Employé */}
      {smartDelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-lg rounded-3xl overflow-hidden animate-scaleIn"
            style={{ background: theme.card, border: `1px solid ${theme.border}`, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
              style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: smartDelModal.avatar_color || '#111827' }}>
                  {smartDelModal.name?.charAt(0)}
                </div>
                <div>
                  <p className="font-bold" style={{ color: theme.text }}>Supprimer {smartDelModal.name}</p>
                  <p className="text-xs" style={{ color: '#f87171' }}>Action irréversible</p>
                </div>
              </div>
              {!smartDelResult && (
                <button onClick={() => { setSmartDelModal(null); setFutureAppts([]); }}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
                  style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', color: theme.muted }}>✕</button>
              )}
            </div>

            {/* Corps */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {smartDelLoading && !smartDelResult && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-8 h-8 rounded-full border-2 animate-spin"
                    style={{ borderColor: 'rgba(17,24,39,0.2)', borderTopColor: '#111827' }} />
                  <p className="text-sm" style={{ color: theme.muted }}>Analyse des rendez-vous…</p>
                </div>
              )}

              {/* Résultat après suppression */}
              {smartDelResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-2xl"
                    style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
                    <span className="text-2xl">✅</span>
                    <div>
                      <p className="font-bold text-sm" style={{ color: '#4ade80' }}>Employé supprimé avec succès</p>
                      <p className="text-xs mt-0.5" style={{ color: theme.muted }}>
                        {smartDelResult.reassigned?.length || 0} RDV réaffecté(s) · {smartDelResult.cancelled?.length || 0} RDV annulé(s)
                      </p>
                    </div>
                  </div>
                  {smartDelResult.reassigned?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase mb-2" style={{ color: '#4ade80' }}>✓ RDV réaffectés automatiquement</p>
                      {smartDelResult.reassigned.map((a, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl mb-1"
                          style={{ background: isDark ? 'rgba(74,222,128,0.06)' : 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.15)' }}>
                          <div>
                            <p className="text-sm font-medium" style={{ color: theme.text }}>{a.client_name}</p>
                            <p className="text-xs" style={{ color: theme.muted }}>{String(a.date).substring(0,10)} à {String(a.start_time).substring(0,5)}</p>
                          </div>
                          <span className="text-xs font-bold px-2 py-1 rounded-lg"
                            style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>→ {a.new_employee}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {smartDelResult.cancelled?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase mb-2" style={{ color: '#f87171' }}>✗ RDV annulés (client notifié)</p>
                      {smartDelResult.cancelled.map((a, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl mb-1"
                          style={{ background: isDark ? 'rgba(248,113,113,0.06)' : 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)' }}>
                          <div>
                            <p className="text-sm font-medium" style={{ color: theme.text }}>{a.client_name}</p>
                            <p className="text-xs" style={{ color: theme.muted }}>{String(a.date).substring(0,10)} à {String(a.start_time).substring(0,5)}</p>
                          </div>
                          {a.client_email && <span className="text-xs" style={{ color: theme.dim }}>📧 notifié</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => { setSmartDelModal(null); setFutureAppts([]); setSmartDelResult(null); }}
                    className="w-full py-3 rounded-2xl font-bold text-white"
                    style={{ background: '#111827' }}>
                    Fermer
                  </button>
                </div>
              )}

              {/* Aperçu avant suppression */}
              {!smartDelLoading && !smartDelResult && (
                <div className="space-y-4">
                  {futureAppts.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-3xl mb-2">✅</p>
                      <p className="font-semibold text-sm" style={{ color: theme.text }}>Aucun rendez-vous futur</p>
                      <p className="text-xs mt-1" style={{ color: theme.muted }}>Cet employé peut être supprimé immédiatement.</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold mb-3" style={{ color: theme.text }}>
                        {futureAppts.length} rendez-vous futur{futureAppts.length > 1 ? 's' : ''} seront traités :
                      </p>
                      <div className="space-y-2 mb-4">
                        {futureAppts.map((a, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl"
                            style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa', border: `1px solid ${theme.border}` }}>
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                              style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>📅</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>{a.client_name}</p>
                              <p className="text-xs" style={{ color: theme.muted }}>
                                {String(a.date).substring(0,10)} · {String(a.start_time).substring(0,5)} · {a.service_name || 'Prestation'}
                              </p>
                            </div>
                            {a.client_email && <span style={{ fontSize:10, color: theme.dim }}>📧</span>}
                          </div>
                        ))}
                      </div>
                      <div className="p-3 rounded-xl text-sm"
                        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#d97706' }}>
                        ⚡ Les RDV seront réaffectés automatiquement si possible, sinon annulés avec notification client.
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => { setSmartDelModal(null); setFutureAppts([]); }}
                      className="flex-1 py-3 rounded-2xl font-bold text-sm"
                      style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6', color: theme.muted }}>
                      Annuler
                    </button>
                    <button onClick={doSmartDelete} disabled={smartDelLoading}
                      className="flex-1 py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                      {smartDelLoading ? 'Traitement...' : '🗑 Confirmer la suppression'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {pinModal && (
        <EmployeePinManager
          emp={pinModal}
          onClose={() => setPinModal(null)}
          showToast={showToast}
          theme={theme}
        />
      )}
    </div>
  );
}

// ── TAB ABSENCES ────────────────────────────────────────────────────────────
function TabAbsences({ employees, theme }) {
  const isDark = theme.mode === 'dark';
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm] = useState({
    employee_id: '', type: 'conges', start_date: '', end_date: '', reason: '',
  });
  const today = new Date().toLocaleDateString('sv-SE');

  const TYPES = {
    conges:'Conges', maladie:'Maladie', formation:'Formation',
    autre:'Autre', maternite:'Maternite', paternite:'Paternite',
    sans_solde:'Sans solde', accident_travail:'Accident travail',
  };

  const load = () => {
    setLoading(true);
    absencesApi.list({})
      .then(rows => setAbsences(Array.isArray(rows) ? rows : []))
      .catch(e => setError(e.message || 'Erreur chargement'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submit = async () => {
    if (!form.employee_id || !form.start_date || !form.end_date) {
      setError('Employé, date debut et date fin requis.'); return;
    }
    setSaving(true); setError('');
    try {
      await absencesApi.create(form);
      setShowForm(false);
      setForm({ employee_id:'', type:'conges', start_date:'', end_date:'', reason:'' });
      load();
    } catch(e) { setError(e.message || 'Erreur'); }
    finally { setSaving(false); }
  };

  const cancel = async (id) => {
    if (!window.confirm('Annuler cette absence ?')) return;
    try { await absencesApi.cancel(id); load(); }
    catch(e) { setError(e.message || 'Erreur'); }
  };

  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, outline:'none',
    background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.04)',
    border:`1px solid ${theme.border}`, color:theme.text,
    fontSize:13, fontFamily:'inherit', boxSizing:'border-box' };

  const fmtDate = d => { if(!d) return '-'; const s=String(d).substring(0,10); return new Date(s+'T12:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}); };
  const nbJours = (s,e) => { if(!s||!e) return 0; return Math.max(1,Math.round((new Date(e+'T12:00')-new Date(s+'T12:00'))/(86400000))+1); };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {error && <p style={{ fontSize:12, color:'#f87171', fontWeight:600 }}>{error}</p>}

      <button onClick={()=>setShowForm(p=>!p)}
        style={{ alignSelf:'flex-end', padding:'9px 16px', borderRadius:10, border:'none',
          background:'#1a73e8', color:'white', fontWeight:700, fontSize:13, cursor:'pointer' }}>
        {showForm ? 'Annuler' : '+ Declarer une absence'}
      </button>

      {showForm && (
        <div style={{ background:theme.card, border:`1px solid ${theme.border}`,
          borderRadius:16, padding:18, display:'flex', flexDirection:'column', gap:10 }}>
          <p style={{ fontWeight:800, fontSize:14, color:theme.text, margin:0 }}>Nouvelle absence</p>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Employé *</p>
            <select value={form.employee_id} onChange={e=>setForm(f=>({...f,employee_id:e.target.value}))} style={{...inp,cursor:'pointer'}}>
              <option value="">Choisir…</option>
              {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Type</p>
            <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={{...inp,cursor:'pointer'}}>
              {Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Du *</p>
              <input type="date" value={form.start_date} min={today}
                onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} style={inp}/>
            </div>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Au *</p>
              <input type="date" value={form.end_date} min={form.start_date||today}
                onChange={e=>setForm(f=>({...f,end_date:e.target.value}))} style={inp}/>
            </div>
          </div>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5, textTransform:'uppercase' }}>Motif (optionnel)</p>
            <input value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}
              placeholder="Motif de l'absence" style={inp}/>
          </div>
          <button onClick={submit} disabled={saving}
            style={{ padding:'12px', borderRadius:11, border:'none', cursor:'pointer',
              background:'#1a73e8', color:'white', fontWeight:800, fontSize:13, opacity:saving?0.7:1 }}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding:40, textAlign:'center' }}>
          <div style={{ width:28,height:28,borderRadius:99,border:'2px solid rgba(17,24,39,0.2)',borderTopColor:'#111827',animation:'spin .8s linear infinite',margin:'0 auto' }}/>
        </div>
      ) : absences.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:theme.muted, fontSize:14 }}>
          Aucune absence déclarée
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {absences.map(a => {
            const emp = employees.find(e=>e.id===a.employee_id);
            return (
              <div key={a.id} style={{ background:theme.card, border:`1px solid ${theme.border}`,
                borderRadius:14, padding:'14px 16px',
                display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
                  background:`${emp?.avatar_color||'#111827'}18`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontWeight:800, fontSize:15, color:emp?.avatar_color||'#111827' }}>
                  {emp?.name?.charAt(0)||'?'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:700, color:theme.text, margin:'0 0 2px' }}>
                    {emp?.name||'Employe'} — {TYPES[a.type]||a.type}
                  </p>
                  <p style={{ fontSize:12, color:theme.muted, margin:0 }}>
                    {fmtDate(a.start_date)} → {fmtDate(a.end_date)} · {nbJours(String(a.start_date).substring(0,10), String(a.end_date).substring(0,10))} jour(s)
                  </p>
                  {a.reason && <p style={{ fontSize:11, color:theme.dim, margin:'2px 0 0' }}>{a.reason}</p>}
                </div>
                {!a.cancelled_at && (
                  <button onClick={()=>cancel(a.id)}
                    style={{ padding:'6px 12px', borderRadius:9, border:'none', cursor:'pointer',
                      background:'rgba(248,113,113,0.1)', color:'#f87171',
                      fontWeight:700, fontSize:12 }}>
                    Annuler
                  </button>
                )}
                {a.cancelled_at && (
                  <span style={{ fontSize:11, color:'#f87171', fontWeight:700 }}>Annulé</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── TAB COMMISSIONS ──────────────────────────────────────────────────────────
function TabCommissions({ employees, theme }) {
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

  const fmt = v => Number(v||0).toFixed(2);
  const inp = { padding:'9px 10px', borderRadius:9, outline:'none', border:`1px solid ${theme.border}`,
    background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.04)',
    color:theme.text, fontSize:13, fontFamily:'inherit' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {error && <p style={{ fontSize:12, color:'#f87171', fontWeight:600 }}>{error}</p>}

      {/* Taux de commission */}
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
                {saving[e.id] && <div style={{ width:14,height:14,borderRadius:99,border:'2px solid rgba(17,24,39,0.2)',borderTopColor:'#111827',animation:'spin .7s linear infinite' }}/>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtres période */}
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

      {/* Résultats */}
      {loading ? (
        <div style={{ padding:40, textAlign:'center' }}>
          <div style={{ width:28,height:28,borderRadius:99,border:'2px solid rgba(17,24,39,0.2)',borderTopColor:'#111827',animation:'spin .8s linear infinite',margin:'0 auto' }}/>
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
                  CA : {fmt(e.total_revenue)} € · Taux : {e.commission_pct||0} %
                </p>
              </div>
              <p style={{ fontSize:16, fontWeight:900, color:'#111827', margin:0, fontFamily:'monospace' }}>
                {fmt(e.commission_due)} €
              </p>
            </div>
          ))}
          {data?.employees?.length > 0 && (
            <div style={{ padding:'12px 16px', display:'flex', justifyContent:'flex-end' }}>
              <p style={{ fontSize:14, fontWeight:800, color:theme.text, margin:0 }}>
                Total : {fmt((data.employees||[]).reduce((s,e)=>s+Number(e.commission_due||0),0))} €
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── TAB CATÉGORIES — Caisse & Site de réservation ───────────────────────────
// Navigation interne : Caisse | Site de réservation
// Logique, composants UI et drag&drop partagés — données distinctes
function TabCategories({ categories, transactions, onAdd, onUpd, onDel, onReorder, showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const [section, setSection] = useState('caisse'); // 'caisse' | 'booking'

  // ── Sous-navigation ────────────────────────────────────────────────────────
  const SUB_TABS = [
    { id: 'caisse',  label: 'Caisse',             icon: I.Tag },
    { id: 'booking', label: 'Site de reservation', icon: I.Scissors },
  ];

  return (
    <div className="space-y-4">
      {/* Sous-navigation */}
      <div style={{ display:'flex', gap:6, background:theme.inputBg, borderRadius:16, padding:4,
        border:`1px solid ${theme.border}` }}>
        {SUB_TABS.map(({ id, label, icon: Ic }) => {
          const active = section === id;
          return (
            <button key={id} onClick={() => setSection(id)}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                padding:'9px 8px', borderRadius:12, border:'none', cursor:'pointer', transition:'all .15s',
                background: active ? (isDark ? 'rgba(17,24,39,0.25)' : '#fff') : 'transparent',
                color: active ? '#111827' : theme.muted,
                fontWeight: active ? 800 : 600, fontSize:13,
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
              <Ic style={{ width:15, height:15 }} />
              {label}
            </button>
          );
        })}
      </div>

      {section === 'caisse'  && (
        <CaisseCategories
          categories={categories}
          transactions={transactions}
          onAdd={onAdd}
          onUpd={onUpd}
          onDel={onDel}
          onReorder={onReorder}
          showToast={showToast}
          theme={theme}
        />
      )}
      {section === 'booking' && (
        <BookingServices theme={theme} showToast={showToast} />
      )}
    </div>
  );
}

// ── CAISSE : catégories + produits/services ────────────────────────────────
function CaisseCategories({ categories, transactions, onAdd, onUpd, onDel, onReorder, showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const [formOpen,   setFormOpen]   = useState(false);
  const [formInit,   setFormInit]   = useState(null);
  const [formMode,   setFormMode]   = useState('product');
  const [formParent, setFormParent] = useState(null);
  const [delId,      setDelId]      = useState(null);

  // Accordéon
  const [openCats,   setOpenCats]   = useState(new Set());
  const didInitOpen = useState(false);
  useEffect(() => {
    if (!didInitOpen[0] && categories.length > 0) {
      didInitOpen[1](true);
      setOpenCats(new Set(categories.filter(c => !c.parent_id).map(c => c.id)));
    }
  }, [categories]);

  const toggleCat = (id) => setOpenCats(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Drag & drop
  const [dragOver,  setDragOver]  = useState(null);
  const dragId     = useRef(null);
  const [dragIdVis, setDragIdVis] = useState(null);

  const openCreate = (mode, parentId = null) => { setFormInit(null); setFormMode(mode); setFormParent(parentId); setFormOpen(true); };
  const openEdit   = (cat) => { setFormInit(cat); setFormMode(cat.parent_id ? 'product' : 'category'); setFormParent(null); setFormOpen(true); };

  const handleSubmit = async (data) => {
    const payload = formParent && !data.parent_id ? { ...data, parent_id: formParent } : data;
    formInit ? await onUpd(formInit.id, payload) : await onAdd(payload);
    showToast(formInit ? 'Modifie !' : 'Ajoute !');
  };

  const saveOrder = async (reordered) => {
    if (onReorder) onReorder(reordered.map((it, i) => ({ ...it, sort_order: i })));
    try {
      await api.reorderCategories(reordered.map((it, i) => ({ id: it.id, sort_order: i })));
    } catch { showToast('Erreur sauvegarde ordre', 'error'); }
  };

  const onDragStartCat = (e, id) => { dragId.current = id; setDragIdVis(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOverCat  = (e, id) => { e.preventDefault(); setDragOver(id); };
  const onDropCat      = (e, targetId, typeCats) => {
    e.preventDefault();
    const srcId = dragId.current;
    if (!srcId || srcId === targetId) { dragId.current = null; setDragIdVis(null); setDragOver(null); return; }
    const cats = typeCats.filter(c => !c.parent_id);
    const from = cats.findIndex(c => c.id === srcId);
    const to   = cats.findIndex(c => c.id === targetId);
    dragId.current = null; setDragIdVis(null); setDragOver(null);
    if (from < 0 || to < 0) return;
    const reordered = [...cats];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    saveOrder(reordered);
    showToast('Ordre mis a jour ✓');
  };

  const onDragStartProd = (e, id) => { dragId.current = id; setDragIdVis(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDropProd      = (e, targetId, products) => {
    e.preventDefault();
    const srcId = dragId.current;
    if (!srcId || srcId === targetId) { dragId.current = null; setDragIdVis(null); setDragOver(null); return; }
    const from = products.findIndex(p => p.id === srcId);
    const to   = products.findIndex(p => p.id === targetId);
    dragId.current = null; setDragIdVis(null); setDragOver(null);
    if (from < 0 || to < 0) return;
    const reordered = [...products];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    saveOrder(reordered);
    showToast('Ordre mis a jour ✓');
  };

  const renderType = (type) => {
    const typeCats  = categories.filter(c => c.type === type);
    const catGroups = typeCats.filter(c => !c.parent_id);
    const products  = typeCats.filter(c => !!c.parent_id);
    if (typeCats.length === 0) return null;

    return (
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest px-1"
          style={{ color: type==='revenue'?'#10b981':'#ef4444' }}>
          {type === 'revenue' ? '↑ Revenus' : '↓ Depenses'}
        </p>

        {catGroups.map(cat => {
          const CatIcon     = ICON_MAP[cat.icon] || I.Tag;
          const catProducts = products.filter(p => p.parent_id === cat.id);
          const catTot      = transactions
            .filter(t => t.category_id === cat.id || catProducts.some(p => p.id === t.category_id))
            .reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
          const catCnt      = transactions
            .filter(t => t.category_id === cat.id || catProducts.some(p => p.id === t.category_id)).length;
          const isOpen      = openCats.has(cat.id);
          const isDragOver  = dragOver === cat.id && dragIdVis !== cat.id;
          const isDragging  = dragIdVis === cat.id;

          return (
            <div key={cat.id}
              draggable
              onDragStart={e => onDragStartCat(e, cat.id)}
              onDragOver={e => onDragOverCat(e, cat.id)}
              onDrop={e => onDropCat(e, cat.id, typeCats)}
              onDragLeave={() => setDragOver(null)}
              style={{ borderRadius:16, overflow:'hidden',
                border: isDragOver ? '2px dashed #111827' : `1px solid ${theme.border}`,
                background: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
                opacity: isDragging ? 0.45 : 1,
                transition:'opacity 0.15s,border 0.15s',
                boxShadow: isDark ? 'none' : '0 1px 6px rgba(0,0,0,0.06)' }}>

              {/* En-tête catégorie */}
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
                background: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.018)',
                cursor:'pointer', userSelect:'none' }}
                onClick={() => toggleCat(cat.id)}>

                {/* Handle drag */}
                <div style={{ display:'flex',flexDirection:'column',gap:2.5,flexShrink:0,
                  cursor:'grab',opacity:0.28,padding:'3px 2px' }}
                  onClick={e => e.stopPropagation()}>
                  {[0,1,2].map(i=><div key={i} style={{width:14,height:2,borderRadius:1,background:theme.muted}}/>)}
                </div>

                {/* Icône */}
                <div style={{ width:36,height:36,borderRadius:11,flexShrink:0,
                  background:cat.color||'#111827',
                  display:'flex',alignItems:'center',justifyContent:'center' }}>
                  <CatIcon style={{ width:17,height:17,color:'white' }}/>
                </div>

                {/* Infos */}
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                    <p style={{ fontWeight:800,fontSize:13,color:theme.text,margin:0,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{cat.name}</p>
                    <span style={{ fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:99,flexShrink:0,
                      background:'rgba(6,182,212,0.12)',color:'#374151',border:'1px solid rgba(6,182,212,0.2)' }}>
                      CATÉGORIE
                    </span>
                  </div>
                  <p style={{ fontSize:11,color:theme.muted,margin:0 }}>
                    {catProducts.length} produit{catProducts.length!==1?'s':''} · {catCnt} tx · {fmt(catTot)} €
                  </p>
                </div>

                {/* Actions */}
                <div style={{ display:'flex',alignItems:'center',gap:4,flexShrink:0 }}
                  onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(cat)}
                    style={{ width:30,height:30,borderRadius:8,border:'none',cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
                    <I.Edit style={{ width:12,height:12,color:theme.muted }}/>
                  </button>
                  <button onClick={() => setDelId(cat.id)}
                    style={{ width:30,height:30,borderRadius:8,border:'none',cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      background:'rgba(239,68,68,0.1)' }}>
                    <I.Trash style={{ width:12,height:12,color:'#ef4444' }}/>
                  </button>
                </div>

                {/* Chevron */}
                <svg viewBox="0 0 24 24" fill="none" stroke={theme.muted} strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ width:14,height:14,flexShrink:0,
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition:'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              {/* Corps accordéon */}
              {isOpen && (
                <div>
                  {catProducts.length === 0 && (
                    <div style={{ padding:'14px 16px',textAlign:'center' }}>
                      <p style={{ fontSize:12,color:theme.dim,margin:0 }}>Aucun produit dans cette catégorie</p>
                    </div>
                  )}

                  {catProducts.map((prod) => {
                    const ProdIcon  = ICON_MAP[prod.icon] || I.Tag;
                    const prodTot   = transactions.filter(t=>t.category_id===prod.id).reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
                    const prodCnt   = transactions.filter(t=>t.category_id===prod.id).length;
                    const isProdOver= dragOver === prod.id && dragIdVis !== prod.id;

                    return (
                      <div key={prod.id}
                        draggable
                        onDragStart={e => { e.stopPropagation(); onDragStartProd(e, prod.id); }}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(prod.id); }}
                        onDrop={e => { e.stopPropagation(); onDropProd(e, prod.id, catProducts); }}
                        onDragLeave={() => setDragOver(null)}
                        style={{ display:'flex',alignItems:'center',gap:10,
                          padding:'10px 14px 10px 18px',
                          borderTop:`1px solid ${theme.border}`,
                          opacity: dragIdVis===prod.id ? 0.45 : 1,
                          borderLeft: isProdOver ? '3px solid #111827' : '3px solid transparent',
                          cursor:'grab', transition:'opacity 0.12s,border-left 0.1s',
                          background: isProdOver ? (isDark?'rgba(17,24,39,0.05)':'rgba(17,24,39,0.03)') : 'transparent' }}>

                        <div style={{ display:'flex',flexDirection:'column',gap:2,flexShrink:0,cursor:'grab',opacity:0.25 }}>
                          {[0,1].map(i=><div key={i} style={{width:10,height:2,borderRadius:1,background:theme.muted}}/>)}
                        </div>

                        <div style={{ width:3,height:22,borderRadius:99,flexShrink:0,
                          background:prod.color||cat.color||'#111827',opacity:0.55 }}/>

                        <div style={{ width:32,height:32,borderRadius:9,flexShrink:0,
                          background:prod.color||'#111827',
                          display:'flex',alignItems:'center',justifyContent:'center' }}>
                          <ProdIcon style={{ width:14,height:14,color:'white' }}/>
                        </div>

                        <div style={{ flex:1,minWidth:0 }}>
                          <p style={{ fontWeight:600,fontSize:13,color:theme.text,margin:0,
                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{prod.name}</p>
                          <p style={{ fontSize:11,color:theme.muted,margin:0 }}>
                            {prod.price != null ? `${fmt(prod.price)} €` : 'Prix libre'} · {prodCnt} tx
                          </p>
                        </div>

                        <span style={{ fontSize:12,fontWeight:700,color:theme.muted,
                          fontFamily:'monospace',flexShrink:0,marginRight:6 }}>
                          {fmt(prodTot)} €
                        </span>

                        <div style={{ display:'flex',gap:4,flexShrink:0 }}>
                          <button onClick={() => openEdit(prod)}
                            style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                              display:'flex',alignItems:'center',justifyContent:'center',
                              background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
                            <I.Edit style={{ width:11,height:11,color:theme.muted }}/>
                          </button>
                          <button onClick={() => setDelId(prod.id)}
                            style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                              display:'flex',alignItems:'center',justifyContent:'center',
                              background:'rgba(239,68,68,0.1)' }}>
                            <I.Trash style={{ width:11,height:11,color:'#ef4444' }}/>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <button onClick={() => openCreate('product', cat.id)}
                    style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,
                      padding:'10px 14px',border:'none',cursor:'pointer',
                      borderTop:`1px dashed ${isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'}`,
                      background:'transparent',color:theme.muted,fontSize:12,fontWeight:600,
                      transition:'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background=isDark?'rgba(17,24,39,0.06)':'rgba(17,24,39,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <I.Plus style={{ width:12,height:12 }}/>
                    Ajouter un produit dans « {cat.name} »
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Produits orphelins */}
        {(() => {
          const orphans = typeCats.filter(c => c.parent_id && !categories.find(g => g.id === c.parent_id));
          if (orphans.length === 0) return null;
          return (
            <div style={{ borderRadius:16,overflow:'hidden',
              border:`1px solid ${theme.border}`,
              background:isDark?'rgba(255,255,255,0.02)':'#fafafa' }}>
              <div style={{ padding:'10px 14px',
                background:isDark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)',
                borderBottom:`1px solid ${theme.border}` }}>
                <p style={{ fontSize:11,fontWeight:700,color:theme.muted,margin:0 }}>Sans catégorie</p>
              </div>
              {orphans.map((prod, i) => {
                const ProdIcon = ICON_MAP[prod.icon] || I.Tag;
                const prodTot  = transactions.filter(t=>t.category_id===prod.id).reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
                return (
                  <div key={prod.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',
                    borderTop: i>0?`1px solid ${theme.border}`:'none' }}>
                    <div style={{ width:32,height:32,borderRadius:9,flexShrink:0,
                      background:prod.color||'#111827',
                      display:'flex',alignItems:'center',justifyContent:'center' }}>
                      <ProdIcon style={{ width:14,height:14,color:'white' }}/>
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <p style={{ fontWeight:600,fontSize:13,color:theme.text,margin:0,
                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{prod.name}</p>
                      <p style={{ fontSize:11,color:theme.muted,margin:0 }}>
                        {transactions.filter(t=>t.category_id===prod.id).length} tx · {fmt(prodTot)} €
                      </p>
                    </div>
                    <div style={{ display:'flex',gap:4 }}>
                      <button onClick={() => openEdit(prod)}
                        style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
                        <I.Edit style={{ width:11,height:11,color:theme.muted }}/>
                      </button>
                      <button onClick={() => setDelId(prod.id)}
                        style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          background:'rgba(239,68,68,0.1)' }}>
                        <I.Trash style={{ width:11,height:11,color:'#ef4444' }}/>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Info */}
      <div style={{ borderRadius:16,padding:'12px 16px',
        background:isDark?'rgba(17,24,39,0.08)':'rgba(17,24,39,0.05)',
        border:'1px solid rgba(17,24,39,0.18)' }}>
        <p style={{ fontSize:12,fontWeight:800,color:'#111827',margin:'0 0 4px' }}>💡 Organisation caisse</p>
        <p style={{ fontSize:12,color:theme.muted,margin:0,lineHeight:1.6 }}>
          Cliquez sur une <strong style={{ color:theme.text }}>catégorie</strong> pour l'ouvrir / fermer.
          Glissez <strong style={{ color:theme.text }}>⠿</strong> pour réorganiser l'ordre d'affichage en caisse.
        </p>
      </div>

      {/* Boutons créer */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => openCreate('category')}
          className="py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
          style={{ background:'linear-gradient(135deg,#374151,#0891b2)', color:'white', boxShadow:'0 4px 16px rgba(6,182,212,0.3)' }}>
          <I.Plus className="w-4 h-4"/> Catégorie
        </button>
        <button onClick={() => openCreate('product')}
          className="py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
          style={{ background:'#1a73e8', color:'white', boxShadow:'0 4px 16px rgba(17,24,39,0.3)' }}>
          <I.Plus className="w-4 h-4"/> Produit / Service
        </button>
      </div>

      {categories.length === 0 && (
        <Card theme={theme}>
          <div className="py-16 text-center">
            <I.Tag className="w-12 h-12 mx-auto mb-3" style={{ color:theme.dim }}/>
            <p className="font-bold" style={{ color:theme.muted }}>Aucun élément</p>
            <p className="text-sm mt-1" style={{ color:theme.dim }}>Commencez par créer une catégorie</p>
          </div>
        </Card>
      )}

      {renderType('revenue')}
      {renderType('expense')}

      <CategoryForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setFormInit(null); setFormParent(null); }}
        onSubmit={handleSubmit}
        init={formInit}
        allCategories={categories}
        defaultMode={formMode}
      />
      <Confirm open={!!delId} onClose={() => setDelId(null)}
        onConfirm={() => { onDel(delId); setDelId(null); showToast('Supprime'); }}
        title="Supprimer cet élément ?" desc="Les transactions associées seront conservées." theme={theme} />
    </div>
  );
}

// ── RÉSERVATION : catégories + services ────────────────────────────────────
function BookingServices({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const [cats,     setCats]    = useState([]);
  const [services, setServices]= useState([]);
  const [loading,  setLoading] = useState(true);

  const [catForm,  setCatForm] = useState({ open: false, init: null });
  const [svcForm,  setSvcForm] = useState({ open: false, init: null, parentId: null });
  const [delCatId, setDelCatId]= useState(null);
  const [delSvcId, setDelSvcId]= useState(null);
  const [openCats, setOpenCats]= useState(new Set());
  const didInitOpen= useRef(false);
  const dragId     = useRef(null);
  const [dragIdVis,setDragIdVis]=useState(null);
  const [dragOver, setDragOver]= useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        bookingApi.getServiceCategories(),
        bookingApi.getServices(),
      ]);
      setCats(c);
      setServices(s);
      if (!didInitOpen.current && c.length > 0) {
        didInitOpen.current = true;
        setOpenCats(new Set(c.map(x => x.id)));
      }
    } catch { showToast('Erreur de chargement', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleCat = (id) => setOpenCats(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSaveCat = async (data) => {
    try {
      if (catForm.init) {
        const updated = await bookingApi.updateServiceCategory(catForm.init.id, data);
        setCats(prev => prev.map(c => c.id === updated.id ? updated : c));
        showToast('Catégorie modifiee ✓');
      } else {
        const created = await bookingApi.createServiceCategory(data);
        setCats(prev => [...prev, created]);
        setOpenCats(prev => new Set([...prev, created.id]));
        showToast('Catégorie créee ✓');
      }
    } catch { showToast('Erreur', 'error'); }
    setCatForm({ open: false, init: null });
  };

  const handleDelCat = async () => {
    try {
      await bookingApi.deleteServiceCategory(delCatId);
      setCats(prev => prev.filter(c => c.id !== delCatId));
      setServices(prev => prev.map(s => s.booking_category_id === delCatId ? { ...s, booking_category_id: null } : s));
      showToast('Catégorie supprimee');
    } catch { showToast('Erreur', 'error'); }
    setDelCatId(null);
  };

  const handleSaveSvc = async (data) => {
    const payload = svcForm.parentId && !data.booking_category_id
      ? { ...data, booking_category_id: svcForm.parentId } : data;
    try {
      if (svcForm.init) {
        const updated = await bookingApi.updateService(svcForm.init.id, payload);
        setServices(prev => prev.map(s => s.id === updated.id ? updated : s));
        showToast('Service modifie ✓');
      } else {
        const created = await bookingApi.createService(payload);
        setServices(prev => [...prev, created]);
        showToast('Service crée ✓');
      }
    } catch { showToast('Erreur', 'error'); }
    setSvcForm({ open: false, init: null, parentId: null });
  };

  const handleDelSvc = async () => {
    try {
      await bookingApi.deleteService(delSvcId);
      setServices(prev => prev.filter(s => s.id !== delSvcId));
      showToast('Service supprime');
    } catch { showToast('Erreur', 'error'); }
    setDelSvcId(null);
  };

  const saveOrderCats = async (reordered) => {
    setCats(reordered);
    try {
      await bookingApi.reorderServiceCategories(reordered.map((c, i) => ({ id: c.id, sort_order: i })));
    } catch { showToast('Erreur sauvegarde ordre', 'error'); }
  };

  const onDragStartCat = (e, id) => { dragId.current = id; setDragIdVis(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOverCat  = (e, id) => { e.preventDefault(); setDragOver(id); };
  const onDropCat      = (e, targetId) => {
    e.preventDefault();
    const srcId = dragId.current;
    dragId.current = null; setDragIdVis(null); setDragOver(null);
    if (!srcId || srcId === targetId) return;
    const from = cats.findIndex(c => c.id === srcId);
    const to   = cats.findIndex(c => c.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...cats];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    saveOrderCats(reordered);
    showToast('Ordre mis a jour ✓');
  };

  // ── Formulaire service ──────────────────────────────────────────────────
  const SvcFormModal = ({ open, onClose, onSubmit, init, parentId, cats: catList }) => {
    const COLORS = ['#111827','#374151','#4ade80','#f87171','#fbbf24','#f97316','#ec4899','#374151','#8b5cf6','#10b981'];
    const [name,      setName]     = useState(init?.name || '');
    const [desc,      setDesc]     = useState(init?.description || '');
    const [duration,  setDuration] = useState(init?.duration_minutes || 30);
    const [price,     setPrice]    = useState(init?.price != null ? String(init.price) : '');
    const [freePrice, setFreePrice]= useState(init?.is_free_price || false);
    const [color,     setColor]    = useState(init?.color || '#111827');
    const [catId,     setCatId]    = useState(init?.booking_category_id || parentId || '');
    const [visible,   setVisible]  = useState(init ? (init.is_active !== false) : true);
    const [err,       setErr]      = useState('');
    if (!open) return null;

    const inp = { width:'100%', padding:'10px 12px', borderRadius:10, outline:'none',
      background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.05)',
      border:`1.5px solid ${isDark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.12)'}`,
      color:theme.text, fontSize:14, fontFamily:'inherit', boxSizing:'border-box' };

    const submit = () => {
      if (!name.trim()) { setErr('Le nom est requis.'); return; }
      onSubmit({ name:name.trim(), description:desc.trim()||null, duration_minutes:parseInt(duration)||30,
        price:freePrice?null:(price!==''?parseFloat(price):null), is_free_price:freePrice,
        color, booking_category_id:catId||null, is_active:visible });
    };

    return (
      <div style={{ position:'fixed',inset:0,zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:16,
        background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)' }}
        onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
        <div style={{ width:'100%',maxWidth:400,borderRadius:20,overflow:'hidden',
          background:theme.card,border:`1px solid ${theme.border}`,maxHeight:'90vh',display:'flex',flexDirection:'column' }}>
          <div style={{ padding:'16px 20px',borderBottom:`1px solid ${theme.border}`,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
            <p style={{ fontWeight:800,fontSize:15,color:theme.text,margin:0 }}>{init?'Modifier le service':'Nouveau service'}</p>
            <button onClick={onClose} style={{ width:30,height:30,borderRadius:8,border:'none',cursor:'pointer',
              background:isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.07)',color:theme.muted,fontSize:16 }}>✕</button>
          </div>
          <div style={{ overflowY:'auto',flex:1,padding:20,display:'flex',flexDirection:'column',gap:14 }}>
            {err && <p style={{ color:'#f87171',fontSize:12,margin:0 }}>{err}</p>}
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Nom *</p>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex : Coupe femme" style={inp} />
            </div>
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Description</p>
              <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2}
                placeholder="Visible par le client…" style={{ ...inp,resize:'none',lineHeight:1.5 }} />
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
              <div>
                <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Durée (min)</p>
                <input type="number" value={duration} onChange={e=>setDuration(e.target.value)} min={5} step={5} style={inp} />
              </div>
              <div>
                <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Prix (€)</p>
                {freePrice
                  ? <div style={{ ...inp,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.5 }}>Prix libre</div>
                  : <input type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00" step="0.01" style={inp} />
                }
              </div>
            </div>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
              <div>
                <p style={{ fontSize:13,fontWeight:600,color:theme.text,margin:0 }}>Prix libre</p>
                <p style={{ fontSize:11,color:theme.muted,margin:0 }}>Défini à la caisse</p>
              </div>
              <button onClick={() => setFreePrice(p=>!p)}
                style={{ width:40,height:22,borderRadius:99,border:'none',cursor:'pointer',position:'relative',flexShrink:0,
                  background:freePrice?'linear-gradient(90deg,#fbbf24,#f97316)':'rgba(0,0,0,0.1)' }}>
                <div style={{ width:18,height:18,borderRadius:99,background:'white',position:'absolute',top:2,
                  left:freePrice?20:2,transition:'left .15s',boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
              </button>
            </div>
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Catégorie</p>
              <select value={catId} onChange={e=>setCatId(e.target.value)} style={{ ...inp,cursor:'pointer' }}>
                <option value="">— Sans catégorie —</option>
                {catList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:8 }}>Couleur</p>
              <div style={{ display:'flex',gap:7,flexWrap:'wrap' }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    style={{ width:28,height:28,borderRadius:8,border:`2px solid ${color===c?'white':'transparent'}`,
                      background:c,cursor:'pointer',boxShadow:color===c?`0 0 0 2px ${c}`:'none' }}/>
                ))}
              </div>
            </div>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
              <div>
                <p style={{ fontSize:13,fontWeight:600,color:theme.text,margin:0 }}>Visible sur le site</p>
                <p style={{ fontSize:11,color:theme.muted,margin:0 }}>Clients peuvent réserver</p>
              </div>
              <button onClick={() => setVisible(p=>!p)}
                style={{ width:40,height:22,borderRadius:99,border:'none',cursor:'pointer',position:'relative',flexShrink:0,
                  background:visible?'linear-gradient(90deg,#4ade80,#22c55e)':'rgba(0,0,0,0.1)' }}>
                <div style={{ width:18,height:18,borderRadius:99,background:'white',position:'absolute',top:2,
                  left:visible?20:2,transition:'left .15s',boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
              </button>
            </div>
          </div>
          <div style={{ padding:'14px 20px',borderTop:`1px solid ${theme.border}`,display:'flex',gap:10 }}>
            <button onClick={onClose}
              style={{ flex:1,padding:'11px 0',borderRadius:12,border:`1px solid ${theme.border}`,
                background:'transparent',color:theme.muted,fontWeight:700,fontSize:13,cursor:'pointer' }}>
              Annuler
            </button>
            <button onClick={submit}
              style={{ flex:2,padding:'11px 0',borderRadius:12,border:'none',cursor:'pointer',
                background:'#1a73e8', color:'white', fontWeight:800,fontSize:13 }}>
              {init?'Enregistrer':'Creer le service'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Formulaire catégorie ───────────────────────────────────────────────────
  const CatFormModal = ({ open, onClose, onSubmit, init }) => {
    const COLORS = ['#111827','#374151','#4ade80','#f87171','#fbbf24','#f97316','#ec4899','#374151','#8b5cf6','#10b981'];
    const ICONS_LIST = ['Tag','Scissors','Spa','Star','Heart','Bolt','Gem','Crown','Brush','Smile'];
    const [name,  setName]  = useState(init?.name  || '');
    const [color, setColor] = useState(init?.color || '#111827');
    const [icon,  setIcon]  = useState(init?.icon  || 'Scissors');
    const [err,   setErr]   = useState('');
    if (!open) return null;

    const inp = { width:'100%',padding:'10px 12px',borderRadius:10,outline:'none',
      background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.05)',
      border:`1.5px solid ${isDark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.12)'}`,
      color:theme.text,fontSize:14,fontFamily:'inherit',boxSizing:'border-box' };

    const submit = () => {
      if (!name.trim()) { setErr('Le nom est requis.'); return; }
      onSubmit({ name:name.trim(), color, icon });
    };

    return (
      <div style={{ position:'fixed',inset:0,zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:16,
        background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)' }}
        onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
        <div style={{ width:'100%',maxWidth:360,borderRadius:20,overflow:'hidden',
          background:theme.card,border:`1px solid ${theme.border}` }}>
          <div style={{ padding:'16px 20px',borderBottom:`1px solid ${theme.border}`,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
            <p style={{ fontWeight:800,fontSize:15,color:theme.text,margin:0 }}>{init?'Modifier la categorie':'Nouvelle categorie'}</p>
            <button onClick={onClose} style={{ width:30,height:30,borderRadius:8,border:'none',cursor:'pointer',
              background:isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.07)',color:theme.muted,fontSize:16 }}>✕</button>
          </div>
          <div style={{ padding:20,display:'flex',flexDirection:'column',gap:14 }}>
            {err && <p style={{ color:'#f87171',fontSize:12,margin:0 }}>{err}</p>}
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Nom *</p>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex : Colorations, Soins…" style={inp} />
            </div>
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:8 }}>Icône</p>
              <div style={{ display:'flex',gap:7,flexWrap:'wrap' }}>
                {ICONS_LIST.map(ic => {
                  const Ic = ICON_MAP[ic] || I.Tag;
                  const active = icon === ic;
                  return (
                    <button key={ic} onClick={() => setIcon(ic)}
                      style={{ width:36,height:36,borderRadius:10,border:`2px solid ${active?color:'transparent'}`,cursor:'pointer',
                        background:active?color:(isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'),
                        display:'flex',alignItems:'center',justifyContent:'center' }}>
                      <Ic style={{ width:16,height:16,color:active?'white':theme.muted }}/>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:8 }}>Couleur</p>
              <div style={{ display:'flex',gap:7,flexWrap:'wrap' }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    style={{ width:28,height:28,borderRadius:8,border:`2px solid ${color===c?'white':'transparent'}`,
                      background:c,cursor:'pointer',boxShadow:color===c?`0 0 0 2px ${c}`:'none' }}/>
                ))}
              </div>
            </div>
          </div>
          <div style={{ padding:'14px 20px',borderTop:`1px solid ${theme.border}`,display:'flex',gap:10 }}>
            <button onClick={onClose}
              style={{ flex:1,padding:'11px 0',borderRadius:12,border:`1px solid ${theme.border}`,
                background:'transparent',color:theme.muted,fontWeight:700,fontSize:13,cursor:'pointer' }}>
              Annuler
            </button>
            <button onClick={submit}
              style={{ flex:2,padding:'11px 0',borderRadius:12,border:'none',cursor:'pointer',
                background:`linear-gradient(135deg,${color},${color}bb)`,color:'white',fontWeight:800,fontSize:13 }}>
              {init?'Enregistrer':'Créer la categorie'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',padding:48 }}>
      <div style={{ width:32,height:32,borderRadius:99,border:'2px solid rgba(17,24,39,0.2)',
        borderTopColor:'#111827',animation:'spin 0.8s linear infinite' }}/>
    </div>
  );

  const orphanSvcs = services.filter(s => !s.booking_category_id || !cats.find(c => c.id === s.booking_category_id));

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
      {/* Info */}
      <div style={{ borderRadius:16,padding:'12px 16px',
        background:isDark?'rgba(55,65,81,0.07)':'rgba(55,65,81,0.06)',
        border:'1px solid rgba(55,65,81,0.2)' }}>
        <p style={{ fontSize:12,fontWeight:800,color:'#374151',margin:'0 0 4px' }}>🌐 Catalogue de réservation</p>
        <p style={{ fontSize:12,color:theme.muted,margin:0,lineHeight:1.6 }}>
          Organisez vos <strong style={{ color:theme.text }}>catégories</strong> et <strong style={{ color:theme.text }}>services</strong> affichés sur le site de réservation.
          Glissez <strong style={{ color:theme.text }}>⠿</strong> pour un ordre indépendant de la caisse.
        </p>
      </div>

      {/* Boutons créer */}
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
        <button onClick={() => setCatForm({ open:true, init:null })}
          style={{ padding:'12px 0',borderRadius:16,border:'none',cursor:'pointer',fontWeight:800,fontSize:13,color:'white',
            background:'linear-gradient(135deg,#374151,#0891b2)',boxShadow:'0 4px 16px rgba(6,182,212,0.3)',
            display:'flex',alignItems:'center',justifyContent:'center',gap:7 }}>
          <I.Plus style={{ width:15,height:15 }}/> Catégorie
        </button>
        <button onClick={() => setSvcForm({ open:true, init:null, parentId:null })}
          style={{ padding:'12px 0',borderRadius:16,border:'none',cursor:'pointer',fontWeight:800,fontSize:13,color:'white',
            background:'#1a73e8',boxShadow:'0 4px 16px rgba(17,24,39,0.3)',
            display:'flex',alignItems:'center',justifyContent:'center',gap:7 }}>
          <I.Plus style={{ width:15,height:15 }}/> Service
        </button>
      </div>

      {cats.length === 0 && services.length === 0 && (
        <div style={{ borderRadius:20,padding:'48px 24px',textAlign:'center',
          background:theme.card,border:`1px solid ${theme.border}` }}>
          <I.Scissors style={{ width:44,height:44,color:theme.dim,margin:'0 auto 12px' }}/>
          <p style={{ fontWeight:700,color:theme.muted,margin:'0 0 4px' }}>Aucun service</p>
          <p style={{ fontSize:13,color:theme.dim,margin:0 }}>Commencez par créer une catégorie ou un service</p>
        </div>
      )}

      {/* Catégories + services */}
      {cats.map(cat => {
        const CatIcon    = ICON_MAP[cat.icon] || I.Scissors;
        const catSvcs    = services.filter(s => s.booking_category_id === cat.id);
        const isOpen     = openCats.has(cat.id);
        const isDragOver = dragOver === cat.id && dragIdVis !== cat.id;
        const isDragging = dragIdVis === cat.id;

        return (
          <div key={cat.id}
            draggable
            onDragStart={e => onDragStartCat(e, cat.id)}
            onDragOver={e  => onDragOverCat(e, cat.id)}
            onDrop={e      => onDropCat(e, cat.id)}
            onDragLeave={() => setDragOver(null)}
            style={{ borderRadius:16,overflow:'hidden',
              border: isDragOver ? '2px dashed #374151' : `1px solid ${theme.border}`,
              background:isDark?'rgba(255,255,255,0.03)':'#ffffff',
              opacity:isDragging?0.45:1,
              transition:'opacity 0.15s,border 0.15s',
              boxShadow:isDark?'none':'0 1px 6px rgba(0,0,0,0.06)' }}>

            <div style={{ display:'flex',alignItems:'center',gap:10,padding:'12px 14px',
              background:isDark?'rgba(255,255,255,0.025)':'rgba(0,0,0,0.018)',
              cursor:'pointer',userSelect:'none' }}
              onClick={() => toggleCat(cat.id)}>

              <div style={{ display:'flex',flexDirection:'column',gap:2.5,flexShrink:0,
                cursor:'grab',opacity:0.28,padding:'3px 2px' }}
                onClick={e => e.stopPropagation()}>
                {[0,1,2].map(i => <div key={i} style={{ width:14,height:2,borderRadius:1,background:theme.muted }}/>)}
              </div>

              <div style={{ width:36,height:36,borderRadius:11,flexShrink:0,
                background:cat.color||'#111827',
                display:'flex',alignItems:'center',justifyContent:'center' }}>
                <CatIcon style={{ width:18,height:18,color:'white' }}/>
              </div>

              <div style={{ flex:1,minWidth:0 }}>
                <p style={{ fontWeight:800,fontSize:14,color:theme.text,margin:0,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{cat.name}</p>
                <p style={{ fontSize:11,color:theme.muted,margin:0 }}>
                  {catSvcs.length} service{catSvcs.length!==1?'s':''}
                </p>
              </div>

              <div style={{ display:'flex',gap:5,flexShrink:0 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => setSvcForm({ open:true, init:null, parentId:cat.id })}
                  style={{ width:28,height:28,borderRadius:8,border:'none',cursor:'pointer',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    background:'rgba(55,65,81,0.12)',color:'#374151',fontSize:16,fontWeight:900 }}
                  title="Ajouter un service">+</button>
                <button onClick={() => setCatForm({ open:true, init:cat })}
                  style={{ width:28,height:28,borderRadius:8,border:'none',cursor:'pointer',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    background:isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)' }}>
                  <I.Edit style={{ width:12,height:12,color:theme.muted }}/>
                </button>
                <button onClick={() => setDelCatId(cat.id)}
                  style={{ width:28,height:28,borderRadius:8,border:'none',cursor:'pointer',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    background:'rgba(239,68,68,0.1)' }}>
                  <I.Trash style={{ width:12,height:12,color:'#ef4444' }}/>
                </button>
              </div>

              <div style={{ width:20,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',
                transition:'transform 0.2s',transform:isOpen?'rotate(180deg)':'rotate(0deg)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={theme.muted} strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" style={{ width:14,height:14 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </div>

            {isOpen && (
              <div>
                {catSvcs.length === 0 ? (
                  <div style={{ padding:'14px 20px',textAlign:'center' }}>
                    <p style={{ fontSize:12,color:theme.dim,margin:0 }}>Aucun service — cliquez sur + pour en ajouter</p>
                  </div>
                ) : catSvcs.map((svc) => {
                  const dMin = svc.duration_minutes;
                  const durLabel = dMin >= 60
                    ? `${Math.floor(dMin/60)}h${dMin%60>0?String(dMin%60).padStart(2,'0'):''}`
                    : `${dMin} min`;
                  return (
                    <div key={svc.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',
                      borderTop:`1px solid ${theme.border}` }}>
                      <div style={{ width:3,height:22,borderRadius:99,flexShrink:0,
                        background:svc.color||cat.color||'#111827',opacity:0.6 }}/>
                      <div style={{ width:32,height:32,borderRadius:9,flexShrink:0,
                        background:svc.color||cat.color||'#111827',
                        display:'flex',alignItems:'center',justifyContent:'center' }}>
                        <I.Scissors style={{ width:13,height:13,color:'white' }}/>
                      </div>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ display:'flex',alignItems:'center',gap:5 }}>
                          <p style={{ fontWeight:600,fontSize:13,color:theme.text,margin:0,
                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{svc.name}</p>
                          {svc.is_active === false && (
                            <span style={{ fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:99,
                              background:'rgba(248,113,113,0.12)',color:'#f87171',flexShrink:0 }}>Masqué</span>
                          )}
                        </div>
                        <p style={{ fontSize:11,color:theme.muted,margin:0 }}>
                          ⏱ {durLabel}{svc.price!=null&&!svc.is_free_price?` · ${fmt(svc.price)} €`:svc.is_free_price?' · Prix libre':''}
                        </p>
                      </div>
                      <div style={{ display:'flex',gap:4,flexShrink:0 }}>
                        <button onClick={() => setSvcForm({ open:true,init:svc,parentId:cat.id })}
                          style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                            display:'flex',alignItems:'center',justifyContent:'center',
                            background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
                          <I.Edit style={{ width:11,height:11,color:theme.muted }}/>
                        </button>
                        <button onClick={() => setDelSvcId(svc.id)}
                          style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                            display:'flex',alignItems:'center',justifyContent:'center',
                            background:'rgba(239,68,68,0.1)' }}>
                          <I.Trash style={{ width:11,height:11,color:'#ef4444' }}/>
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => setSvcForm({ open:true,init:null,parentId:cat.id })}
                  style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,
                    padding:'10px 14px',border:'none',cursor:'pointer',
                    borderTop:`1px dashed ${isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.08)'}`,
                    background:'transparent',color:theme.muted,fontSize:12,fontWeight:600 }}
                  onMouseEnter={e=>e.currentTarget.style.background=isDark?'rgba(55,65,81,0.05)':'rgba(55,65,81,0.04)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <I.Plus style={{ width:12,height:12 }}/> Ajouter dans « {cat.name} »
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Services sans catégorie */}
      {orphanSvcs.length > 0 && (
        <div style={{ borderRadius:16,overflow:'hidden',
          border:`1px solid ${theme.border}`,
          background:isDark?'rgba(255,255,255,0.02)':'#fafafa' }}>
          <div style={{ padding:'10px 14px',borderBottom:`1px solid ${theme.border}`,
            background:isDark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)' }}>
            <p style={{ fontSize:11,fontWeight:700,color:theme.muted,margin:0 }}>Sans catégorie</p>
          </div>
          {orphanSvcs.map((svc, idx) => {
            const dMin = svc.duration_minutes;
            const durLabel = dMin>=60?`${Math.floor(dMin/60)}h${dMin%60>0?String(dMin%60).padStart(2,'0'):''}` :`${dMin} min`;
            return (
              <div key={svc.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 14px',
                borderTop:idx>0?`1px solid ${theme.border}`:'none' }}>
                <div style={{ width:32,height:32,borderRadius:9,flexShrink:0,
                  background:svc.color||'#111827',
                  display:'flex',alignItems:'center',justifyContent:'center' }}>
                  <I.Scissors style={{ width:13,height:13,color:'white' }}/>
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <p style={{ fontWeight:600,fontSize:13,color:theme.text,margin:0,
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{svc.name}</p>
                  <p style={{ fontSize:11,color:theme.muted,margin:0 }}>
                    ⏱ {durLabel}{svc.price!=null&&!svc.is_free_price?` · ${fmt(svc.price)} €`:svc.is_free_price?' · Prix libre':''}
                  </p>
                </div>
                <div style={{ display:'flex',gap:4 }}>
                  <button onClick={() => setSvcForm({ open:true,init:svc,parentId:null })}
                    style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.05)' }}>
                    <I.Edit style={{ width:11,height:11,color:theme.muted }}/>
                  </button>
                  <button onClick={() => setDelSvcId(svc.id)}
                    style={{ width:28,height:28,borderRadius:7,border:'none',cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      background:'rgba(239,68,68,0.1)' }}>
                    <I.Trash style={{ width:11,height:11,color:'#ef4444' }}/>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CatFormModal open={catForm.open} onClose={() => setCatForm({ open:false,init:null })}
        onSubmit={handleSaveCat} init={catForm.init} />
      <SvcFormModal open={svcForm.open} onClose={() => setSvcForm({ open:false,init:null,parentId:null })}
        onSubmit={handleSaveSvc} init={svcForm.init} parentId={svcForm.parentId} cats={cats} />
      <Confirm open={!!delCatId} onClose={() => setDelCatId(null)} onConfirm={handleDelCat}
        title="Supprimer cette catégorie ?"
        desc="Les services de cette catégorie seront conservés (sans catégorie)." theme={theme} />
      <Confirm open={!!delSvcId} onClose={() => setDelSvcId(null)} onConfirm={handleDelSvc}
        title="Supprimer ce service ?"
        desc="Les rendez-vous existants ne seront pas affectés." theme={theme} />
    </div>
  );
}

// ── TAB PROFIL COMMERÇANT ────────────────────────────────────────────────────
// Photo de profil + galerie (jusqu'à 4 photos) + coordonnées visuelles
function TabProfil({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const { user } = useAuth();
  const [meta,    setMeta]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.userId) return;
    setLoading(true);
    try {
      const m = await mediaApi.getMeta(user.userId);
      setMeta(m);
    } catch { /* pas d'images → meta null */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleUploadProfile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await mediaApi.uploadProfile(file);
      await load();
      showToast('Photo de profil mise a jour ✓');
    } catch (err) { showToast(err.message || 'Erreur upload', 'error'); }
    finally { setUploading(false); }
  };

  const handleUploadCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await mediaApi.uploadCover(file);
      await load();
      showToast('Photo ajoutee ✓');
    } catch (err) { showToast(err.message || 'Erreur upload', 'error'); }
    finally { setUploading(false); }
  };

  const handleDeleteMedia = async (id) => {
    try {
      await mediaApi.deleteMedia(id);
      await load();
      showToast('Photo supprimee');
    } catch { showToast('Erreur suppression', 'error'); }
  };

  const cardStyle = { borderRadius:16, overflow:'hidden', background:theme.card, border:`1px solid ${theme.border}` };
  const sectionHeader = { padding:'14px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:48 }}>
      <div style={{ width:32, height:32, borderRadius:99, border:'2px solid rgba(17,24,39,0.2)', borderTopColor:'#111827', animation:'spin 0.8s linear infinite' }}/>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Info */}
      <div style={{ borderRadius:16, padding:'12px 16px', background:isDark?'rgba(17,24,39,0.08)':'rgba(17,24,39,0.05)', border:'1px solid rgba(17,24,39,0.18)' }}>
        <p style={{ fontSize:12, fontWeight:800, color:theme.text, margin:'0 0 4px' }}>Profil visible côté réservation</p>
        <p style={{ fontSize:12, color:theme.muted, margin:0, lineHeight:1.6 }}>
          Ces images sont affichées sur votre site de réservation public. 1 logo + jusqu'à 4 photos.
        </p>
      </div>

      {/* Photo de profil */}
      <div style={cardStyle}>
        <div style={sectionHeader}>
          <p style={{ fontSize:13, fontWeight:800, color:theme.text, margin:0 }}>Logo / Photo de profil</p>
          <label style={{ padding:'6px 14px', borderRadius:10, background:'#1a73e8', color:'white', fontWeight:700, fontSize:12, cursor:'pointer', userSelect:'none' }}>
            {uploading ? '...' : 'Modifier'}
            <input type="file" accept="image/*" onChange={handleUploadProfile} style={{ display:'none' }}/>
          </label>
        </div>
        <div style={{ padding:16, display:'flex', alignItems:'center', gap:14 }}>
          {meta?.profile_url ? (
            <div style={{ position:'relative', flexShrink:0 }}>
              <img src={`${meta.profile_url}?t=${Date.now()}`} alt="Profil"
                style={{ width:80, height:80, borderRadius:20, objectFit:'cover', border:`2px solid ${theme.border}` }}/>
              <button onClick={() => { const id = meta?.profile_id; if (id) handleDeleteMedia(id); }}
                style={{ position:'absolute', top:-6, right:-6, width:22, height:22, borderRadius:99,
                  background:'#ef4444', border:'2px solid white', color:'white', fontSize:12,
                  display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', lineHeight:1 }}>✕</button>
            </div>
          ) : (
            <label style={{ width:80, height:80, borderRadius:20, flexShrink:0, cursor:'pointer',
              background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)',
              border:`2px dashed ${theme.border}`,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
              <span style={{ fontSize:24 }}>📷</span>
              <span style={{ fontSize:10, fontWeight:600, color:theme.muted }}>Ajouter</span>
              <input type="file" accept="image/*" onChange={handleUploadProfile} style={{ display:'none' }}/>
            </label>
          )}
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:theme.text, margin:'0 0 3px' }}>
              {user?.businessName || 'Votre salon'}
            </p>
            <p style={{ fontSize:11, color:theme.muted, margin:0 }}>Format recommandé : 400×400 px, JPG ou PNG</p>
          </div>
        </div>
      </div>

      {/* Galerie photos */}
      <div style={cardStyle}>
        <div style={sectionHeader}>
          <div>
            <p style={{ fontSize:13, fontWeight:800, color:theme.text, margin:0 }}>Photos du salon</p>
            <p style={{ fontSize:11, color:theme.muted, margin:'2px 0 0' }}>
              {(meta?.cover_urls || []).length}/4 photos
            </p>
          </div>
          {(meta?.cover_urls || []).length < 4 && (
            <label style={{ padding:'6px 14px', borderRadius:10, background:'linear-gradient(135deg,#374151,#0891b2)',
              color:'white', fontWeight:700, fontSize:12, cursor:'pointer', userSelect:'none' }}>
              {uploading ? '...' : '+ Ajouter'}
              <input type="file" accept="image/*" onChange={handleUploadCover} style={{ display:'none' }}/>
            </label>
          )}
        </div>
        <div style={{ padding:16 }}>
          {(meta?.cover_urls || []).length === 0 ? (
            <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              padding:'32px 0', borderRadius:14, cursor:'pointer',
              background:isDark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)',
              border:`2px dashed ${theme.border}` }}>
              <span style={{ fontSize:32, marginBottom:8 }}>🖼️</span>
              <p style={{ fontSize:13, fontWeight:700, color:theme.muted, margin:'0 0 2px' }}>Aucune photo</p>
              <p style={{ fontSize:11, color:theme.dim, margin:0 }}>Cliquez pour ajouter jusqu'à 4 photos</p>
              <input type="file" accept="image/*" onChange={handleUploadCover} style={{ display:'none' }}/>
            </label>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {meta.cover_urls.map((cover) => (
                <div key={cover.id} style={{ position:'relative', borderRadius:14, overflow:'hidden',
                  aspectRatio:'4/3', background:isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)' }}>
                  <img src={`${cover.url}?t=${Date.now()}`} alt="Galerie"
                    style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  <button onClick={() => handleDeleteMedia(cover.id)}
                    style={{ position:'absolute', top:6, right:6, width:26, height:26, borderRadius:99,
                      background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)',
                      border:'1px solid rgba(255,255,255,0.2)', color:'white', fontSize:13,
                      display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', lineHeight:1 }}>✕</button>
                </div>
              ))}
              {(meta?.cover_urls || []).length < 4 && (
                <label style={{ borderRadius:14, cursor:'pointer', aspectRatio:'4/3',
                  background:isDark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)',
                  border:`2px dashed ${theme.border}`,
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
                  <span style={{ fontSize:24 }}>+</span>
                  <span style={{ fontSize:11, fontWeight:600, color:theme.muted }}>Ajouter</span>
                  <input type="file" accept="image/*" onChange={handleUploadCover} style={{ display:'none' }}/>
                </label>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function TabMarketing({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const [sub, setSub] = useState('loyalty');

  const SUB_TABS = [
    { id: 'loyalty', label: "Fidélité",   icon: I.Gift },
    { id: 'promo',   label: 'Promotions', icon: I.Percent },
  ];

  return (
    <div className="space-y-4">
      {/* Sous-navigation */}
      <div style={{ display:'flex', gap:6, background:theme.inputBg, borderRadius:16, padding:4, border:`1px solid ${theme.border}` }}>
        {SUB_TABS.map(({ id, label, icon: Ic }) => {
          const active = sub === id;
          return (
            <button key={id} onClick={() => setSub(id)}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                padding:'9px 8px', borderRadius:12, border:'none', cursor:'pointer', transition:'all .15s',
                background: active ? (isDark ? 'rgba(17,24,39,0.25)' : '#fff') : 'transparent',
                color: active ? '#111827' : theme.muted,
                fontWeight: active ? 800 : 600, fontSize:13,
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
              <Ic style={{ width:15, height:15 }} />
              {label}
            </button>
          );
        })}
      </div>

      {sub === 'loyalty' && <TabLoyalty theme={theme} />}
      {sub === 'promo'   && <TabPromo theme={theme} showToast={showToast} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 9 : Fidélité clients (tampons)
// ════════════════════════════════════════════════════════════════════════════
function TabLoyalty({ theme }) {
  const isDark = theme.mode === 'dark';
  const [program, setProgram]   = useState(null);
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editProg, setEditProg] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [stampModal, setStampModal] = useState(null);
  const [stampEmail, setStampEmail] = useState('');
  const [stampName, setStampName]   = useState('');
  const [stamping, setStamping]     = useState(false);
  const [delId, setDelId] = useState(null);

  // Historique codes fidélité
  const [promoHist, setPromoHist] = useState([]);
  const [showHist,  setShowHist]  = useState(false);
  const [histLoad,  setHistLoad]  = useState(false);

  // Ajout prestation client
  const [showAddSvc,    setShowAddSvc]    = useState(false);
  const [svcSearch,     setSvcSearch]     = useState('');
  const [svcResults,    setSvcResults]    = useState([]);
  const [svcClient,     setSvcClient]     = useState(null);
  const [svcQty,        setSvcQty]        = useState(1);
  const [svcBusy,       setSvcBusy]       = useState(false);
  const [svcMsg,        setSvcMsg]        = useState('');
  const [svcSearchLoad, setSvcSearchLoad] = useState(false);

  // Traçabilité fidélité
  const [loyaltyStats, setLoyaltyStats] = useState(null);
  const [showLoyaltyStats, setShowLoyaltyStats] = useState(false);
  const [loyaltyStatsLoad, setLoyaltyStatsLoad] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, cl] = await Promise.all([loyaltyApi.getProgram(), loyaltyApi.getClients({ search })]);
      setProgram(p); setClients(cl);
    } finally { setLoading(false); }
  }, [search]);

  const loadLoyaltyStats = async () => {
    setLoyaltyStatsLoad(true);
    try { const s = await loyaltyApi.getStats(); setLoyaltyStats(s); setShowLoyaltyStats(true); }
    catch(e) { console.error(e); }
    finally { setLoyaltyStatsLoad(false); }
  };

  useEffect(() => { load(); }, [load]);

  const saveProg = async () => {
    setSaving(true);
    try { const p = await loyaltyApi.saveProgram(program); setProgram(p); setEditProg(false); }
    finally { setSaving(false); }
  };

  const loadHistory = async () => {
    setHistLoad(true);
    try { const h = await loyaltyApi.promoHistory(); setPromoHist(h); setShowHist(true); }
    catch(e) { console.error(e); }
    finally { setHistLoad(false); }
  };

  // Recherche client pour ajout prestation
  useEffect(() => {
    if (!svcSearch || svcSearch.trim().length < 2) { setSvcResults([]); return; }
    setSvcSearchLoad(true);
    const t = setTimeout(async () => {
      try { const r = await loyaltyApi.searchClients(svcSearch); setSvcResults(r); }
      catch { setSvcResults([]); }
      finally { setSvcSearchLoad(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [svcSearch]);

  const doAddService = async () => {
    if (!svcClient) return;
    setSvcBusy(true); setSvcMsg('');
    try {
      const res = await loyaltyApi.addService({
        client_email: svcClient.email,
        client_name:  svcClient.name,
        stamps_to_add: svcQty,
      });
      const msg = res.reward_triggered
        ? `Tampon(s) ajoute(s) ! Recompense declenchee - code : ${res.reward_code}`
        : `${svcQty} tampon(s) ajoute(s). Total : ${res.client?.stamps || 0}/${res.stamps_required}`;
      setSvcMsg(msg);
      setSvcClient(null); setSvcSearch(''); setSvcQty(1); setSvcResults([]);
      load();
    } catch(e) { setSvcMsg('Erreur : ' + e.message); }
    finally { setSvcBusy(false); }
  };

  const doStamp = async () => {
    if (!stampEmail) return;
    setStamping(true);
    try {
      const res = await loyaltyApi.addStamp({ client_email:stampEmail, client_name:stampName, stamps_to_add:1 });
      if (res.reward_triggered) {
        alert(`${stampName||stampEmail} a atteint ${res.stamps_required} tampons ! Recompense debloquee : ${program.reward_label}`);
      }
      setStampModal(null); setStampEmail(''); setStampName('');
      load();
    } finally { setStamping(false); }
  };

  const inp = { width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:14, outline:'none', boxSizing:'border-box' };

  return (
    <div className="space-y-4">
      {/* Programme */}
      <div style={{ background:theme.card, borderRadius:20, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
        <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${theme.separator}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:12, background:'rgba(245,158,11,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <I.Gift style={{ width:18, height:18, color:'#f59e0b' }} />
            </div>
            <div>
              <p style={{ fontWeight:800, fontSize:15, color:theme.text, margin:0 }}>Programme fidélité</p>
              {program && <p style={{ fontSize:12, color:theme.muted, margin:0 }}>{program.stamps_required} tampons → {program.reward_label}</p>}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {program && (
              <button onClick={()=>{ setProgram(p=>({...p,enabled:!p.enabled})); loyaltyApi.saveProgram({...program,enabled:!program.enabled}); }}
                style={{ width:40, height:24, borderRadius:12, background: program.enabled?'#f59e0b':theme.inputBg, border:`2px solid ${program.enabled?'#f59e0b':theme.border}`, position:'relative', cursor:'pointer', transition:'all 0.2s' }}>
                <div style={{ width:16, height:16, borderRadius:8, background:'white', position:'absolute', top:2, left: program.enabled?20:2, transition:'left 0.2s' }} />
              </button>
            )}
            <button onClick={()=>setEditProg(!editProg)} style={{ padding:'6px 12px', borderRadius:10, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.2)', color:'#f59e0b', fontWeight:700, fontSize:12, cursor:'pointer' }}>
              {editProg ? '✓' : '⚙️'}
            </button>
          </div>
        </div>
        {editProg && program && (
          <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
            {/* Mode fidélité */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Mode de fidélité</label>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setProgram(p=>({...p,loyalty_mode:'stamps'}))}
                  style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer',
                    border:`1px solid ${(program.loyalty_mode||'stamps')==='stamps'?'#f59e0b':theme.border}`,
                    background:(program.loyalty_mode||'stamps')==='stamps'?'rgba(245,158,11,0.12)':theme.inputBg,
                    color:(program.loyalty_mode||'stamps')==='stamps'?'#f59e0b':theme.muted }}>
                  🎫 Passages
                </button>
                <button onClick={()=>setProgram(p=>({...p,loyalty_mode:'points'}))}
                  style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer',
                    border:`1px solid ${(program.loyalty_mode||'stamps')==='points'?'#111827':theme.border}`,
                    background:(program.loyalty_mode||'stamps')==='points'?'rgba(17,24,39,0.12)':theme.inputBg,
                    color:(program.loyalty_mode||'stamps')==='points'?'#111827':theme.muted }}>
                  ⭐ Points
                </button>
              </div>
            </div>

            {(program.loyalty_mode||'stamps')==='points' && (
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Points gagnés par euro dépensé</label>
                <input type="number" min="0.01" step="0.1" value={program.points_per_euro||1}
                  onChange={e=>setProgram(p=>({...p,points_per_euro:parseFloat(e.target.value)||1}))} style={inp} />
                <p style={{ fontSize:11, color:theme.muted, marginTop:4 }}>Ex : 1 point = 1 € dépensé → seuil {program.stamps_required||100} points</p>
              </div>
            )}

            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>
                {(program.loyalty_mode||'stamps')==='points' ? 'Points requis pour la recompense' : 'Passages requis pour la recompense'}
              </label>
              <input type="number" min="1" max="9999" value={program.stamps_required}
                onChange={e=>setProgram(p=>({...p,stamps_required:parseInt(e.target.value)||10}))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Type de r&#233;compense</label>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setProgram(p=>({...p,reward_type:'percent'}))}
                  style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer', border:`1px solid ${program.reward_type==='percent'?'#111827':theme.border}`, background:program.reward_type==='percent'?'rgba(17,24,39,0.12)':theme.inputBg, color:program.reward_type==='percent'?'#111827':theme.muted }}>
                  % R&#233;duction
                </button>
                <button onClick={()=>setProgram(p=>({...p,reward_type:'fixed'}))}
                  style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer', border:`1px solid ${program.reward_type==='fixed'?'#10b981':theme.border}`, background:program.reward_type==='fixed'?'rgba(16,185,129,0.12)':theme.inputBg, color:program.reward_type==='fixed'?'#10b981':theme.muted }}>
                  &#8364; Montant fixe
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>
                Valeur de la r&#233;compense ({program.reward_type==='percent'?'%':'&#8364;'})
              </label>
              <div style={{ position:'relative' }}>
                <input type="number" min="1" max={program.reward_type==='percent'?100:9999} step="0.5"
                  value={program.reward_value||10}
                  onChange={e=>setProgram(p=>({...p,reward_value:parseFloat(e.target.value)||10}))}
                  style={{...inp, paddingRight:36}} />
                <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontWeight:800, color:theme.muted, fontSize:15 }}>
                  {program.reward_type==='percent'?'%':'€'}
                </span>
              </div>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Libel&#233; de la r&#233;compense</label>
              <input placeholder="ex: Prestation offerte" value={program.reward_label||''} onChange={e=>setProgram(p=>({...p,reward_label:e.target.value}))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Comptabiliser les passages</label>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {[
                  { v:'physical', l:'Physique uniquement',   d:'Caisse et prestation ajoutee sur place' },
                  { v:'online',   l:'En ligne uniquement',    d:'Reservations via le site public' },
                  { v:'both',     l:'Les deux (recommande)', d:'Physique + en ligne' },
                ].map(opt => (
                  <button key={opt.v} onClick={()=>setProgram(p=>({...p,count_trigger:opt.v}))}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:12, cursor:'pointer', textAlign:'left',
                      border:`1.5px solid ${(program.count_trigger||'both')===opt.v?'#f59e0b':theme.border}`,
                      background:(program.count_trigger||'both')===opt.v?'rgba(245,158,11,0.1)':theme.inputBg }}>
                    <div style={{ width:16, height:16, borderRadius:8, border:`2px solid ${(program.count_trigger||'both')===opt.v?'#f59e0b':theme.muted}`,
                      background:(program.count_trigger||'both')===opt.v?'#f59e0b':'transparent', flexShrink:0 }} />
                    <div>
                      <p style={{ margin:0, fontWeight:700, fontSize:13, color:theme.text }}>{opt.l}</p>
                      <p style={{ margin:0, fontSize:11, color:theme.muted }}>{opt.d}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Achat minimum (€)</label>
                <input type="number" min="0" step="0.5" value={program.min_purchase||0}
                  onChange={e=>setProgram(p=>({...p,min_purchase:parseFloat(e.target.value)||0}))}
                  style={inp} />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Validité du code (jours)</label>
                <input type="number" min="1" max="365" value={program.validity_days||90}
                  onChange={e=>setProgram(p=>({...p,validity_days:parseInt(e.target.value)||90}))}
                  style={inp} />
              </div>
            </div>
            <div style={{ background:'rgba(245,158,11,0.08)', borderRadius:12, padding:'10px 14px' }}>
              <p style={{ fontSize:12, color:'#92400e', margin:0, fontWeight:600 }}>
                {program.stamps_required} {(program.loyalty_mode||'stamps')==='points'?'points':'passages'} → {program.reward_type==='percent'?`${program.reward_value||10}%`:`${Number(program.reward_value||10).toFixed(2)} €`} · valide {program.validity_days||90}j{(program.min_purchase||0)>0?` · min ${program.min_purchase}€`:''}
              </p>
            </div>
            <button onClick={saveProg} disabled={saving} style={{ padding:'11px', borderRadius:12, background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'white', fontWeight:800, border:'none', cursor:'pointer' }}>
              {saving ? '&#9203;...' : '&#128190; Sauvegarder'}
            </button>
          </div>
        )}
      </div>

      {/* Barre d'actions : recherche + tampon + traçabilité */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:160, position:'relative' }}>
          <I.Search style={{ width:14, height:14, position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:theme.muted }} />
          <input placeholder="Rechercher un client..." value={search} onChange={e=>setSearch(e.target.value)} style={{ width:'100%', padding:'10px 10px 10px 34px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
        </div>
        <button onClick={()=>setStampModal(true)} disabled={!program?.enabled}
          style={{ padding:'10px 14px', borderRadius:12, background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'white', fontWeight:800, fontSize:13, border:'none', cursor:'pointer', flexShrink:0, opacity:program?.enabled?1:0.4 }}>
          + Tampon
        </button>
        <button onClick={loadLoyaltyStats} disabled={loyaltyStatsLoad}
          style={{ padding:'10px 14px', borderRadius:12, background:theme.cardAlt, border:`1px solid ${theme.border}`, color:theme.text, fontWeight:700, fontSize:12, cursor:'pointer', flexShrink:0 }}>
          {loyaltyStatsLoad ? '⏳' : '📊'} Traçabilité
        </button>
      </div>

      {/* Section traçabilité fidélité */}
      {showLoyaltyStats && loyaltyStats && (
        <div style={{ background:isDark?'rgba(17,24,39,0.06)':'rgba(17,24,39,0.03)', border:'1px solid rgba(17,24,39,0.2)', borderRadius:18, padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p style={{ fontWeight:800, fontSize:14, color:theme.text, margin:0 }}>Traçabilité fidélité</p>
            <button onClick={()=>setShowLoyaltyStats(false)} style={{ background:'none', border:'none', cursor:'pointer', color:theme.muted, fontSize:18 }}>✕</button>
          </div>
          {/* KPIs résumés */}
          {(() => {
            const s = loyaltyStats.summary || {};
            const codesGeneres  = parseInt(s.total_codes   || 0);
            const mtUtilise     = parseFloat(s.montant_utilise || 0);
            const codesUtilises = parseInt(s.codes_utilises || 0);
            const codesRestants = parseInt(s.codes_restants || 0);
            return (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:16 }}>
                {[
                  { l:'Codes généres',   v: codesGeneres,              c:'#f59e0b' },
                  { l:'Remises utilisees', v: `${mtUtilise.toFixed(2)} €`, c:'#ef4444' },
                  { l:'Codes utilises',  v: codesUtilises,             c:'#10b981' },
                  { l:'Codes restants',  v: codesRestants,             c:'#111827' },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ borderRadius:12, padding:'10px 12px', textAlign:'center', background:isDark?`${c}22`:`${c}11`, border:`1px solid ${c}33` }}>
                    <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', color:c, margin:'0 0 4px' }}>{l}</p>
                    <p style={{ fontSize:16, fontWeight:900, color:c, margin:0 }}>{v}</p>
                  </div>
                ))}
              </div>
            );
          })()}
          {/* CA par client fidélité */}
          {loyaltyStats.clients && loyaltyStats.clients.length > 0 && (
            <div>
              <p style={{ fontSize:12, fontWeight:700, color:theme.muted, margin:'0 0 10px' }}>CA par client</p>
              <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflowY:'auto' }}>
                {loyaltyStats.clients.map((cl,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:theme.card, borderRadius:12, border:`1px solid ${theme.border}` }}>
                    <div>
                      <p style={{ margin:0, fontWeight:700, fontSize:13, color:theme.text }}>{cl.client_name || cl.client_email}</p>
                      <p style={{ margin:0, fontSize:11, color:theme.muted }}>{cl.total_stamps_ever} passage{cl.total_stamps_ever>1?'s':''} · {cl.rewards_earned} recompense{cl.rewards_earned>1?'s':''}</p>
                    </div>
                    <span style={{ fontWeight:900, fontSize:14, color:'#10b981' }}>{Number(cl.ca_total).toFixed(2)} €</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Liste clients */}
      {loading ? <div className="py-16 text-center"><I.Loader className="w-6 h-6 mx-auto animate-spin" style={{ color:theme.muted }} /></div>
      : clients.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', background:theme.card, borderRadius:18, border:`1px solid ${theme.border}` }}>
          <I.Gift style={{ width:36, height:36, margin:'0 auto 10px', color:theme.dim }} />
          <p style={{ color:theme.muted, fontSize:14, margin:0 }}>Aucun client fidélité</p>
        </div>
      ) : (
        <div style={{ background:theme.card, borderRadius:18, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
          {clients.map((cl,i) => {
            const isPoints = (program?.loyalty_mode||'stamps') === 'points';
            const currentVal = isPoints ? (parseFloat(cl.points)||0) : (parseInt(cl.stamps)||0);
            const pct = program ? Math.min(100, (currentVal / (program.stamps_required||10))*100) : 0;
            return (
              <div key={cl.id} style={{ padding:'14px 16px', borderBottom: i<clients.length-1?`1px solid ${theme.separator}`:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <div style={{ width:36, height:36, borderRadius:12, background:'rgba(245,158,11,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:15, color:'#f59e0b', flexShrink:0 }}>
                    {(cl.client_name||cl.client_email||'?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:14, color:theme.text, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cl.client_name||'-'}</p>
                    <p style={{ fontSize:11, color:theme.muted, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cl.client_email}</p>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    {(program?.loyalty_mode||'stamps')==='points' ? (
                      <>
                        <p style={{ fontWeight:900, fontSize:18, color:theme.text, margin:0 }}>
                          {Math.floor(cl.points||0)}<span style={{ fontSize:11, color:theme.muted, fontWeight:600 }}>pts/{program?.stamps_required||100}</span>
                        </p>
                        <p style={{ fontSize:10, color:theme.dim, margin:0 }}>{cl.total_points_ever||0} pts cumulés</p>
                      </>
                    ) : (
                      <>
                        <p style={{ fontWeight:900, fontSize:18, color:'#f59e0b', margin:0 }}>
                          {cl.stamps}<span style={{ fontSize:11, color:theme.muted, fontWeight:600 }}>/{program?.stamps_required||10}</span>
                        </p>
                        <p style={{ fontSize:10, color:theme.dim, margin:0 }}>{cl.rewards_earned} 🎁 gagnée(s)</p>
                      </>
                    )}
                  </div>
                  <button onClick={()=>setDelId(cl.id)} style={{ width:26, height:26, borderRadius:8, background:'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <I.Trash style={{ width:11, height:11, color:'#ef4444' }} />
                  </button>
                </div>
                {/* Barre tampons */}
                <div style={{ display:'flex', gap:4 }}>
                  {Array.from({length:program?.stamps_required||10}).map((_,j) => (
                    <div key={j} style={{ flex:1, height:6, borderRadius:3, background: j < cl.stamps ? '#f59e0b' : isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.08)' }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal ajout tampon */}
      {stampModal && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={()=>setStampModal(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(12px)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:380, background: isDark?'#161620':'#fff', borderRadius:24, border:`1px solid ${theme.border}`, padding:24 }}>
            <h3 style={{ fontWeight:800, fontSize:17, color:theme.text, margin:'0 0 20px' }}>Ajouter un tampon</h3>
            <div className="space-y-3">
              <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Email client *</label><input type="email" placeholder="client@email.fr" value={stampEmail} onChange={e=>setStampEmail(e.target.value)} style={inp} /></div>
              <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Nom (optionnel)</label><input placeholder="Prénom Nom" value={stampName} onChange={e=>setStampName(e.target.value)} style={inp} /></div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={()=>setStampModal(null)} style={{ flex:1, padding:'12px', borderRadius:12, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer' }}>Annuler</button>
              <button onClick={doStamp} disabled={stamping||!stampEmail} style={{ flex:2, padding:'12px', borderRadius:12, background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'white', fontWeight:800, border:'none', cursor:'pointer', opacity:!stampEmail?0.5:1 }}>
                {stamping ? '⏳...' : '🎫 Valider le tampon'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Ajout prestation client ──────────────────────────────── */}
      <div style={{ background:theme.card, borderRadius:20, padding:20, border:`1px solid ${theme.border}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <I.Plus style={{ width:18, height:18, color:'#10b981' }} />
            <span style={{ fontWeight:800, fontSize:15, color:theme.text }}>Ajouter une prestation client</span>
          </div>
          <button onClick={()=>{ setShowAddSvc(!showAddSvc); setSvcMsg(''); }}
            style={{ padding:'6px 14px', borderRadius:10, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', color:'#10b981', fontWeight:700, fontSize:12, cursor:'pointer' }}>
            {showAddSvc ? 'Fermer' : 'Ouvrir'}
          </button>
        </div>
        {showAddSvc && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ position:'relative' }}>
              <input placeholder="Rechercher par nom, email, téléphone..."
                value={svcSearch} onChange={e=>{ setSvcSearch(e.target.value); setSvcClient(null); }}
                style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', boxSizing:'border-box' }}
              />
              {svcSearchLoad && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:12, color:theme.muted }}>⏳</span>}
            </div>
            {svcResults.length > 0 && !svcClient && (
              <div style={{ background:theme.inputBg, border:`1px solid ${theme.border}`, borderRadius:12, overflow:'hidden' }}>
                {svcResults.map(r => (
                  <div key={r.id} onClick={()=>{ setSvcClient(r); setSvcResults([]); setSvcSearch(r.name + (r.email?' - '+r.email:'')); }}
                    style={{ padding:'10px 14px', cursor:'pointer', borderBottom:`1px solid ${theme.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <p style={{ margin:0, fontWeight:700, fontSize:13, color:theme.text }}>{r.name}</p>
                      <p style={{ margin:0, fontSize:11, color:theme.muted }}>{r.email}{r.phone?' · '+r.phone:''}</p>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:'#f59e0b', background:'rgba(245,158,11,0.1)', padding:'2px 8px', borderRadius:6 }}>{r.stamps||0} 🎫</span>
                  </div>
                ))}
              </div>
            )}
            {svcClient && (
              <div style={{ background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ margin:0, fontWeight:700, fontSize:13, color:'#10b981' }}>{svcClient.name}</p>
                  <p style={{ margin:0, fontSize:11, color:theme.muted }}>{svcClient.email} · {svcClient.stamps||0}/{program?.stamps_required||'?'} tampons</p>
                </div>
                <button onClick={()=>{ setSvcClient(null); setSvcSearch(''); }}
                  style={{ background:'none', border:'none', cursor:'pointer', color:theme.muted, fontSize:18 }}>✕</button>
              </div>
            )}
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:4 }}>Nb de tampons à ajouter</label>
                <input type="number" min="1" max="20" value={svcQty} onChange={e=>setSvcQty(parseInt(e.target.value)||1)}
                  style={{ width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <button onClick={doAddService} disabled={!svcClient||svcBusy}
                style={{ padding:'10px 18px', borderRadius:12, background:'linear-gradient(135deg,#10b981,#059669)', color:'white', fontWeight:800, fontSize:13, border:'none', cursor:'pointer', marginTop:20, opacity:!svcClient?0.4:1 }}>
                {svcBusy ? '⏳' : '+ Ajouter'}
              </button>
            </div>
            {svcMsg && (
              <p style={{ margin:0, fontSize:12, fontWeight:700, color: svcMsg.includes('Erreur') ? '#ef4444' : '#10b981', background: svcMsg.includes('Erreur')?'rgba(239,68,68,0.07)':'rgba(16,185,129,0.07)', padding:'8px 12px', borderRadius:10 }}>{svcMsg}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Historique codes fidélité générés ─────────────────────── */}
      <div style={{ background:theme.card, borderRadius:20, padding:20, border:`1px solid ${theme.border}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: showHist ? 14 : 0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <I.FileText style={{ width:18, height:18, color:'#111827' }} />
            <span style={{ fontWeight:800, fontSize:15, color:theme.text }}>Historique codes fidélité</span>
          </div>
          <button onClick={()=>{ if (!showHist) loadHistory(); else setShowHist(false); }}
            style={{ padding:'6px 14px', borderRadius:10, background:theme.cardAlt, border:`1px solid ${theme.border}`, color:theme.text, fontWeight:700, fontSize:12, cursor:'pointer' }}>
            {histLoad ? '⏳' : showHist ? 'Masquer' : 'Afficher'}
          </button>
        </div>
        {showHist && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {promoHist.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px 0', color:theme.muted }}>
                <p style={{ fontSize:32, margin:'0 0 8px' }}>🎫</p>
                <p style={{ fontSize:14, fontWeight:600 }}>Aucun code fidélité généré pour l'instant</p>
              </div>
            ) : promoHist.map(row => {
              const used = row.uses_count > 0;
              const expired = !row.is_active || (row.valid_until && new Date(row.valid_until) < new Date());
              const statusColor = used ? '#10b981' : expired ? '#ef4444' : '#f59e0b';
              const statusLabel = used ? 'Utilise' : expired ? 'Expire' : 'Disponible';
              return (
                <div key={row.id} style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:16, padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                        <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:15, color:'#f59e0b', letterSpacing:'0.08em' }}>{row.code}</span>
                        <span style={{ padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:800, background:`${statusColor}18`, color:statusColor }}>{statusLabel}</span>
                      </div>
                      <p style={{ margin:0, fontSize:12, color:theme.muted }}>
                        Client : <strong style={{ color:theme.text }}>{row.owner_name || row.owner_client_email || '-'}</strong>
                      </p>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <p style={{ margin:0, fontWeight:900, fontSize:16, color:theme.text }}>
                        {row.type==='percent' ? `-${row.value}%` : `-${Number(row.value||0).toFixed(2)} €`}
                      </p>
                      {row.min_purchase > 0 && (
                        <p style={{ margin:'2px 0 0', fontSize:10, color:theme.muted }}>Min. {Number(row.min_purchase).toFixed(2)} €</p>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10, fontSize:11 }}>
                    <span style={{ color:theme.muted }}>📅 Généré le <strong>{row.created_at ? new Date(row.created_at).toLocaleDateString('fr-FR') : '-'}</strong></span>
                    <span style={{ color:row.valid_until && new Date(row.valid_until)<new Date() ? '#ef4444' : theme.muted }}>
                      ⏳ Expire le <strong>{row.valid_until ? new Date(row.valid_until).toLocaleDateString('fr-FR') : '-'}</strong>
                    </span>
                    {used && (
                      <span style={{ color:'#10b981' }}>✓ Utilise le <strong>{row.used_at ? new Date(row.used_at).toLocaleDateString('fr-FR') : '-'}</strong></span>
                    )}
                    {row.discount_applied && (
                      <span style={{ color:'#10b981', fontWeight:700 }}>Remise appliquée : <strong>-{Number(row.discount_applied).toFixed(2)} €</strong></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Confirm open={!!delId} onClose={()=>setDelId(null)} title="Supprimer ce client fidélité ?" desc="Ses tampons seront perdus." theme={theme}
        onConfirm={async()=>{ await loyaltyApi.removeClient(delId); setClients(p=>p.filter(c=>c.id!==delId)); setDelId(null); }} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 10 : Codes promo / remises
// ════════════════════════════════════════════════════════════════════════════
function PromoForm({ open, onClose, init, onSave, theme }) {
  const isDark = theme.mode === 'dark';
  const [code, setCode]       = useState('');
  const [type, setType]       = useState('percent');
  const [value, setValue]     = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [validFrom, setValidFrom]   = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState('');
  const [targetClients, setTargetClients] = useState('all');
  const [timeAllday, setTimeAllday] = useState(true);
  const [timeFrom, setTimeFrom]     = useState('10:00');
  const [timeUntil, setTimeUntil]   = useState('14:00');
  const [saving, setSaving] = useState(false);
  const [sendEmail, setSendEmail] = useState(false); // option envoi auto email

  useEffect(() => {
    if (init) {
      setCode(init.code||''); setType(init.type||'percent'); setValue(init.value||'');
      setMaxUses(init.max_uses||''); setValidFrom(init.valid_from||''); setValidUntil(init.valid_until||'');
      setTargetClients(init.target_clients||'all');
      setTimeAllday(init.time_allday !== false);
      setTimeFrom(init.time_from ? init.time_from.substring(0,5) : '10:00');
      setTimeUntil(init.time_until ? init.time_until.substring(0,5) : '14:00');
    } else {
      setCode(''); setType('percent'); setValue(''); setMaxUses('');
      setValidFrom(new Date().toISOString().split('T')[0]); setValidUntil('');
      setTargetClients('all'); setTimeAllday(true); setTimeFrom('10:00'); setTimeUntil('14:00');
    }
  }, [init, open]);

  if (!open) return null;
  const inp = { width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:14, outline:'none', boxSizing:'border-box' };

  const handleSave = async () => {
    if (!code || !value) return;
    setSaving(true);
    try {
      const saved = await onSave({
        code, type, value:parseFloat(value),
        max_uses:maxUses?parseInt(maxUses):null,
        valid_from:validFrom||null, valid_until:validUntil||null,
        target_clients:targetClients,
        time_allday: timeAllday,
        time_from:  timeAllday ? null : timeFrom,
        time_until: timeAllday ? null : timeUntil,
        send_email: sendEmail && targetClients === 'all' && !init,
      });
      onClose();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(12px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto',
        background: isDark?'#161620':'#fff', borderRadius:24, border:`1px solid ${theme.border}`, padding:24 }}>
        <h3 style={{ fontWeight:800, fontSize:17, color:theme.text, margin:'0 0 20px' }}>{init ? 'Modifier le code' : 'Nouveau code promo'}</h3>
        <div className="space-y-3">
          <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Code *</label>
            <input placeholder="BIENVENUE10" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} style={{...inp, textTransform:'uppercase', fontFamily:'monospace', fontWeight:700, fontSize:16, letterSpacing:'0.1em'}} /></div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Type de remise</label>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setType('percent')} style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer', border:`1px solid ${type==='percent'?'#1a73e8':theme.border}`, background: type==='percent'?'rgba(26,115,232,0.12)':theme.inputBg, color: type==='percent'?'#1a73e8':theme.muted }}>% Pourcentage</button>
              <button onClick={()=>setType('fixed')} style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer', border:`1px solid ${type==='fixed'?'#10b981':theme.border}`, background: type==='fixed'?'rgba(16,185,129,0.12)':theme.inputBg, color: type==='fixed'?'#10b981':theme.muted }}>€ Montant fixe</button>
            </div>
          </div>
          <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Valeur *</label>
            <div style={{ position:'relative' }}>
              <input type="number" min="0" placeholder={type==='percent'?'10':'5.00'} value={value} onChange={e=>setValue(e.target.value)} style={{...inp, paddingRight:36}} />
              <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontWeight:700, color:theme.muted, fontSize:16 }}>{type==='percent'?'%':'€'}</span>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Valide du</label><input type="date" value={validFrom} onChange={e=>setValidFrom(e.target.value)} style={inp} /></div>
            <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Jusqu&apos;au</label><input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)} style={inp} /></div>
          </div>

          {/* ── Plages horaires ── */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Plage horaire d&apos;utilisation</label>
            <div style={{ display:'flex', gap:8, marginBottom: timeAllday ? 0 : 10 }}>
              <button onClick={()=>setTimeAllday(true)}
                style={{ flex:1, padding:'9px', borderRadius:11, fontWeight:700, fontSize:12, cursor:'pointer',
                  border:`1px solid ${timeAllday?'#1a73e8':theme.border}`,
                  background:timeAllday?'rgba(26,115,232,0.12)':theme.inputBg,
                  color:timeAllday?'#1a73e8':theme.muted }}>🕐 Toute la journée</button>
              <button onClick={()=>setTimeAllday(false)}
                style={{ flex:1, padding:'9px', borderRadius:11, fontWeight:700, fontSize:12, cursor:'pointer',
                  border:`1px solid ${!timeAllday?'#f59e0b':theme.border}`,
                  background:!timeAllday?'rgba(245,158,11,0.12)':theme.inputBg,
                  color:!timeAllday?'#f59e0b':theme.muted }}>⏰ Plage horaire</button>
            </div>
            {!timeAllday && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:5 }}>De</label>
                  <input type="time" value={timeFrom} onChange={e=>setTimeFrom(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:5 }}>À</label>
                  <input type="time" value={timeUntil} onChange={e=>setTimeUntil(e.target.value)} style={inp} />
                </div>
              </div>
            )}
            {!timeAllday && timeFrom && timeUntil && (
              <div style={{ marginTop:8, padding:'7px 12px', borderRadius:10,
                background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)' }}>
                <p style={{ fontSize:11, fontWeight:700, color:'#f59e0b', margin:0 }}>
                  ⏰ Code valide de {timeFrom} à {timeUntil}
                </p>
              </div>
            )}
          </div>

          <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Utilisations max (vide = illimité)</label>
            <input type="number" min="1" placeholder="Illimité" value={maxUses} onChange={e=>setMaxUses(e.target.value)} style={inp} /></div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Applicable à</label>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setTargetClients('all')}
                style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer',
                  border:`1px solid ${targetClients==='all'?'#1a73e8':theme.border}`,
                  background:targetClients==='all'?'rgba(26,115,232,0.12)':theme.inputBg,
                  color:targetClients==='all'?'#1a73e8':theme.muted }}>
                Tous les clients
              </button>
              <button onClick={()=>setTargetClients('new')}
                style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer',
                  border:`1px solid ${targetClients==='new'?'#10b981':theme.border}`,
                  background:targetClients==='new'?'rgba(16,185,129,0.12)':theme.inputBg,
                  color:targetClients==='new'?'#10b981':theme.muted }}>
                Nouveaux clients
              </button>
            </div>
          </div>
          {/* Option envoi email : visible si tous les clients selectionnes */}
          {targetClients === 'all' && !init && (
            <div style={{ padding:'12px 14px', borderRadius:12,
              background: sendEmail
                ? 'rgba(26,115,232,0.08)'
                : (isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'),
              border: `1px solid ${sendEmail ? 'rgba(26,115,232,0.3)' : theme.border}`,
              cursor:'pointer' }}
              onClick={()=>setSendEmail(v=>!v)}>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                <div style={{ width:18, height:18, borderRadius:5, flexShrink:0,
                  background: sendEmail ? '#1a73e8' : 'transparent',
                  border: `2px solid ${sendEmail ? '#1a73e8' : theme.border}`,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {sendEmail && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"
                      style={{width:11,height:11}}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                <div>
                  <p style={{ fontSize:13, fontWeight:700, color:theme.text, margin:0 }}>
                    Envoyer le code par email aux clients
                  </p>
                  <p style={{ fontSize:11, color:theme.muted, margin:'2px 0 0' }}>
                    Un email marketing sera envoyé à tous vos clients
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:12, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving||!code||!value}
            style={{ flex:2, padding:'13px', borderRadius:12,
              background: (!code||!value) ? theme.inputBg : '#1a73e8',
              color: (!code||!value) ? theme.muted : 'white',
              fontWeight:800, fontSize:14, border:'none', cursor:(!code||!value)?'not-allowed':'pointer',
              opacity:saving?0.6:1, boxShadow:(!code||!value)?'none':'0 4px 14px rgba(26,115,232,0.35)' }}>
            {saving ? 'Enregistrement...' : init ? 'Modifier' : sendEmail ? 'Créer et envoyer' : 'Créer le code'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal envoi email campagne promo ──────────────────────────────────────────
function SendPromoEmailModal({ promo, theme, onClose, showToast }) {
  const isDark = theme.mode === 'dark';
  const [clients, setClients]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [sending, setSending]         = useState(false);
  const [selected, setSelected]       = useState(new Set()); // Set of client IDs
  const [selectAll, setSelectAll]     = useState(true);
  const [searchQ, setSearchQ]         = useState('');
  const [result, setResult]           = useState(null); // { sent, failed, total }

  useEffect(() => {
    clientsApi.list({ limit: 500 })
      .then(d => {
        const withEmail = (d.clients || []).filter(c => c.email);
        setClients(withEmail);
        setSelected(new Set(withEmail.map(c => c.id)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter(c =>
    !searchQ || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(searchQ.toLowerCase())
  );

  const toggleClient = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelectAll(next.size === clients.length);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectAll) { setSelected(new Set()); setSelectAll(false); }
    else { setSelected(new Set(clients.map(c => c.id))); setSelectAll(true); }
  };

  const handleSend = async () => {
    if (selected.size === 0) { showToast('Selectionnez au moins un client', 'error'); return; }
    setSending(true);
    try {
      const clientIds = selectAll ? [] : Array.from(selected); // [] = tous
      const res = await promoApi.sendEmails(promo.id, { client_ids: clientIds });
      setResult(res);
      showToast(`✉️ ${res.sent} email${res.sent > 1 ? 's' : ''} envoye${res.sent > 1 ? 's' : ''} !`);
    } catch(e) {
      showToast(e.message || 'Erreur lors de l\'envoi', 'error');
    } finally {
      setSending(false);
    }
  };

  const discountLabel = promo.type === 'percent'
    ? `-${promo.value}%`
    : `-${Number(promo.value).toFixed(2)} €`;

  const inp = { width:'100%', padding:'9px 12px', borderRadius:10, border:`1px solid ${theme.border}`,
    background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', boxSizing:'border-box' };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:480, maxHeight:'88vh', display:'flex',
        flexDirection:'column', background:isDark?'#161622':'#fff',
        borderRadius:24, border:`1px solid ${theme.border}`, overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'20px 22px 16px', borderBottom:`1px solid ${theme.border}`,
          background: isDark?'rgba(6,182,212,0.06)':'rgba(6,182,212,0.04)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:38, height:38, borderRadius:12, background:'rgba(6,182,212,0.12)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>✉️</div>
              <div>
                <p style={{ fontWeight:900, fontSize:15, color:theme.text, margin:0 }}>Envoyer la promo par email</p>
                <p style={{ fontSize:12, color:theme.muted, margin:0 }}>Prévenez vos clients de cette offre</p>
              </div>
            </div>
            <button onClick={onClose} style={{ width:28, height:28, borderRadius:8, border:'none',
              background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)', color:theme.muted, cursor:'pointer', fontSize:16 }}>✕</button>
          </div>

          {/* Aperçu du code */}
          <div style={{ padding:'10px 14px', borderRadius:12, background:isDark?'rgba(17,24,39,0.12)':'rgba(17,24,39,0.07)',
            border:'1px solid rgba(17,24,39,0.2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:18, color:theme.text, letterSpacing:'0.1em' }}>{promo.code}</span>
            <span style={{ padding:'4px 10px', borderRadius:8, background:theme.cardAlt, color:theme.text, fontWeight:700, fontSize:13 }}>{discountLabel}</span>
          </div>
        </div>

        {/* Résultat envoi */}
        {result && (
          <div style={{ padding:'14px 22px', background:'rgba(16,185,129,0.08)', borderBottom:`1px solid ${theme.border}` }}>
            <p style={{ fontWeight:800, fontSize:14, color:'#10b981', margin:'0 0 4px' }}>✅ Envoi terminé</p>
            <p style={{ fontSize:13, color:theme.muted, margin:0 }}>
              {result.sent} envoyé{result.sent>1?'s':''} · {result.failed} echec{result.failed>1?'s':''}
              {result.failed > 0 && ' (adresses invalides ou SMTP non configure)'}
            </p>
          </div>
        )}

        {/* Recherche + select all */}
        <div style={{ padding:'12px 22px 8px', borderBottom:`1px solid ${theme.border}` }}>
          <input placeholder="Rechercher un client…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{...inp, marginBottom:10}} />
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:theme.text, fontWeight:600 }}>
              <input type="checkbox" checked={selectAll} onChange={handleSelectAll}
                style={{ width:15, height:15, accentColor:'#111827', cursor:'pointer' }} />
              Tous les clients ({clients.length} avec email)
            </label>
            <span style={{ fontSize:12, color:theme.muted }}>{selected.size} sélectionné{selected.size>1?'s':''}</span>
          </div>
        </div>

        {/* Liste clients */}
        <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
          {loading ? (
            <div style={{ padding:'32px', textAlign:'center', color:theme.muted }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:theme.muted }}>
              {clients.length === 0 ? 'Aucun client avec email enregistre' : 'Aucun resultat'}
            </div>
          ) : filtered.map(c => (
            <label key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 22px', cursor:'pointer',
              background: selected.has(c.id) ? (isDark?'rgba(17,24,39,0.06)':'rgba(17,24,39,0.04)') : 'transparent',
              transition:'background 0.1s' }}>
              <input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggleClient(c.id)}
                style={{ width:15, height:15, accentColor:'#111827', cursor:'pointer', flexShrink:0 }} />
              <div style={{ width:32, height:32, borderRadius:9, background:c.avatar_color||'#111827', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:800, fontSize:13 }}>
                {(c.first_name||'?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:600, fontSize:13, color:theme.text, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.first_name} {c.last_name}
                </p>
                <p style={{ fontSize:11, color:theme.muted, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.email}
                </p>
              </div>
            </label>
          ))}
        </div>

        {/* Footer actions */}
        <div style={{ padding:'14px 22px', borderTop:`1px solid ${theme.border}`, display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:12, background:theme.inputBg,
            border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer', fontSize:13 }}>
            Fermer
          </button>
          <button onClick={handleSend} disabled={sending || selected.size === 0}
            style={{ flex:2, padding:'13px', borderRadius:12, fontWeight:800, fontSize:13, border:'none',
              cursor: selected.size===0 ? 'not-allowed' : 'pointer',
              background: selected.size===0 ? theme.inputBg : 'linear-gradient(135deg,#374151,#0891b2)',
              color: selected.size===0 ? theme.muted : 'white',
              opacity: sending ? 0.6 : 1,
              boxShadow: selected.size===0 ? 'none' : '0 4px 14px rgba(6,182,212,0.35)' }}>
            {sending
              ? 'Envoi en cours...'
              : `Envoyer a ${selected.size} client${selected.size>1?'s':''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabPromo({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [statsData, setStatsData] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const [statsLoad, setStatsLoad] = useState(false);
  // Email campagne
  const [sendModal, setSendModal] = useState(null); // null | promo object
  // Confirmation après création
  const [createdConfirm, setCreatedConfirm] = useState(null); // null | { code, sentCount }

  const load = useCallback(async () => {
    setLoading(true);
    try { setPromos(await promoApi.list()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadStats = async () => {
    setStatsLoad(true);
    try { setStatsData(await promoApi.getStats()); setShowStats(true); }
    catch(e) { console.error(e); }
    finally { setStatsLoad(false); }
  };

  const handleSave = async (d) => {
    const { send_email, ...promoData } = d;
    if (edit) {
      const u = await promoApi.update(edit.id, {...promoData, is_active:edit.is_active});
      setPromos(p=>p.map(x=>x.id===edit.id?u:x));
      setEdit(null); showToast('Code modifié ✓');
    } else {
      const created = await promoApi.create(promoData);
      setPromos(p=>[created,...p]);
      if (send_email && created?.id) {
        try {
          const res = await promoApi.sendEmails(created.id, { client_ids: [] });
          setCreatedConfirm({ code: created.code, sentCount: res.sent || 0 });
        } catch(e) {
          setCreatedConfirm({ code: created.code, sentCount: 0, emailError: e.message });
        }
      } else {
        setCreatedConfirm({ code: created.code, sentCount: null });
      }
    }
  };

  const toggleActive = async (promo) => {
    const u = await promoApi.update(promo.id, {...promo, is_active:!promo.is_active});
    setPromos(p=>p.map(x=>x.id===promo.id?u:x));
  };

  const fmt = v => {
    const d = new Date(v+'T12:00:00');
    return d.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
  };

  return (
    <div className="space-y-4">
      {/* En-tête avec boutons action */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <button onClick={loadStats} disabled={statsLoad}
          style={{ padding:'10px 14px', borderRadius:12, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)', color:'#f59e0b', fontWeight:700, fontSize:12, cursor:'pointer' }}>
          {statsLoad ? '⏳' : '📊'} Traçabilité
        </button>
        <button onClick={()=>{ setEdit(null); setModal(true); }}
          style={{ padding:'10px 16px', borderRadius:12, background:'#1a73e8', color:'white', fontWeight:800, fontSize:13, border:'none', cursor:'pointer' }}>
          + Nouveau code
        </button>
      </div>

      {/* Section traçabilité */}
      {showStats && (
        <div style={{ background:isDark?'rgba(245,158,11,0.08)':'rgba(245,158,11,0.04)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:18, padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p style={{ fontWeight:800, fontSize:14, color:'#f59e0b', margin:0 }}>📊 Traçabilité des codes promo</p>
            <button onClick={()=>setShowStats(false)} style={{ background:'none', border:'none', cursor:'pointer', color:theme.muted, fontSize:18 }}>✕</button>
          </div>
          {/* Résumé global */}
          {(() => {
            const totalGenere = statsData.reduce((s,p) => s + parseFloat(p.total_discount_used||0) + parseFloat(p.value||0)*(p.max_uses - (p.uses_count||0) > 0 ? (p.max_uses - (p.uses_count||0)) : 0), 0);
            const totalUtilise = statsData.reduce((s,p) => s + parseFloat(p.total_discount_used||0), 0);
            const totalCA = statsData.reduce((s,p) => s + parseFloat(p.total_revenue_generated||0), 0);
            return (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
                {[
                  { l:'CA génére', v:`${Number(totalCA).toFixed(2)} €`, c:'#10b981' },
                  { l:'Remises utilisees', v:`${Number(totalUtilise).toFixed(2)} €`, c:'#ef4444' },
                  { l:'Codes actifs', v: statsData.filter(p=>p.is_active).length, c:'#111827' },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ borderRadius:12, padding:'10px 8px', textAlign:'center', background:isDark?`${c}22`:`${c}11`, border:`1px solid ${c}33` }}>
                    <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', color:c, margin:'0 0 4px' }}>{l}</p>
                    <p style={{ fontSize:14, fontWeight:900, color:c, margin:0 }}>{v}</p>
                  </div>
                ))}
              </div>
            );
          })()}
          {/* Détail par code */}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {statsData.map(p => (
              <div key={p.id} style={{ background:theme.card, borderRadius:14, padding:'12px 14px', border:`1px solid ${theme.border}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <span style={{ fontWeight:900, fontSize:14, color:theme.text, fontFamily:'var(--mono)' }}>{p.code}</span>
                    <span style={{ marginLeft:8, fontSize:11, padding:'2px 8px', borderRadius:99, background: p.is_active?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.1)', color:p.is_active?'#10b981':'#ef4444', fontWeight:700 }}>{p.is_active?'Actif':'Expire'}</span>
                    {p.is_loyalty_reward && <span style={{ marginLeft:4, fontSize:11, padding:'2px 8px', borderRadius:99, background:'rgba(245,158,11,0.12)', color:'#f59e0b', fontWeight:700 }}>🎫 Fidélité</span>}
                  </div>
                  <span style={{ fontWeight:700, fontSize:13, color:theme.muted }}>{p.type==='percent'?`${p.value}%`:`${Number(p.value).toFixed(2)} €`}</span>
                </div>
                <div style={{ display:'flex', gap:16, marginTop:8, fontSize:12 }}>
                  <span style={{ color:'#ef4444' }}>Utilisé : <strong>{Number(p.total_discount_used||0).toFixed(2)} €</strong></span>
                  <span style={{ color:'#10b981' }}>CA : <strong>{Number(p.total_revenue_generated||0).toFixed(2)} €</strong></span>
                  <span style={{ color:theme.muted }}>{p.usage_count||0} fois{p.max_uses?` / ${p.max_uses}`:''}</span>
                </div>
                {p.owner_client_email && <p style={{ fontSize:11, color:theme.dim, margin:'4px 0 0' }}>Propriétaire : {p.owner_client_email}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <div className="py-16 text-center"><I.Loader className="w-6 h-6 mx-auto animate-spin" style={{ color:theme.muted }} /></div>
      : promos.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', background:theme.card, borderRadius:20, border:`1px solid ${theme.border}` }}>
          <I.Percent style={{ width:40, height:40, margin:'0 auto 12px', color:theme.dim }} />
          <p style={{ color:theme.muted, fontSize:14, margin:0 }}>Aucun code promo</p>
        </div>
      ) : (
        <div style={{ background:theme.card, borderRadius:20, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
          {promos.map((p,i) => (
            <div key={p.id} style={{ padding:'14px 16px', borderBottom: i<promos.length-1?`1px solid ${theme.separator}`:'none', opacity: p.is_active?1:0.5 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:16, color:theme.text, letterSpacing:'0.08em' }}>{p.code}</span>
                    <span style={{ padding:'3px 8px', borderRadius:6, background: p.type==='percent'?'rgba(17,24,39,0.12)':'rgba(16,185,129,0.12)', color: p.type==='percent'?'#111827':'#10b981', fontSize:12, fontWeight:700 }}>
                      {p.type==='percent' ? `-${p.value}%` : `-${Number(p.value).toFixed(2)} €`}
                    </span>
                    {!p.is_active && <span style={{ padding:'2px 6px', borderRadius:5, background:'rgba(239,68,68,0.1)', color:'#ef4444', fontSize:10, fontWeight:700 }}>INACTIF</span>}
                  </div>
                  <p style={{ fontSize:11, color:theme.muted, margin:0 }}>
                    {p.uses_count} utilisation(s){p.max_uses ? ` / ${p.max_uses} max` : ' · illimite'}
                    {p.valid_until ? ` · exp. ${fmt(p.valid_until)}` : ''}
                  </p>
                </div>
                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                  {/* Bouton envoi email campagne */}
                  <button onClick={()=>setSendModal(p)}
                    title="Envoyer par email aux clients"
                    style={{ width:28, height:28, borderRadius:8, background:'rgba(6,182,212,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12}}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                  </button>
                  {!p.is_loyalty_reward && (
                    <button onClick={()=>toggleActive(p)} style={{ width:28, height:28, borderRadius:8, background: p.is_active?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:13 }}>{p.is_active?'✓':'○'}</span>
                    </button>
                  )}
                  {!p.is_loyalty_reward && (
                    <button onClick={()=>{ setEdit(p); setModal(true); }} style={{ width:28, height:28, borderRadius:8, background:isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.05)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <I.Edit style={{ width:12, height:12, color:theme.muted }} />
                    </button>
                  )}
                  {!p.is_loyalty_reward && (
                    <button onClick={()=>setDelId(p.id)} style={{ width:28, height:28, borderRadius:8, background:'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <I.Trash style={{ width:12, height:12, color:'#ef4444' }} />
                    </button>
                  )}
                  {p.is_loyalty_reward && (
                    <span style={{ fontSize:10, padding:'3px 9px', borderRadius:99, background:'rgba(245,158,11,0.12)', color:'#f59e0b', fontWeight:700, display:'flex', alignItems:'center' }}>🎫 Fidélité</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PromoForm open={modal} onClose={()=>{ setModal(false); setEdit(null); }} init={edit} onSave={handleSave} theme={theme} />

      {/* ── Popup confirmation création code promo ── */}
      {createdConfirm && (
        <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={()=>{ setCreatedConfirm(null); setModal(false); setEdit(null); }}
            style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(8px)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:380, borderRadius:24,
            background:isDark?'#161620':'#fff', border:`1px solid ${theme.border}`, padding:28,
            boxShadow:'0 24px 64px rgba(0,0,0,0.2)', textAlign:'center' }}>
            {/* Icône succès */}
            <div style={{ width:64, height:64, borderRadius:20, background:'rgba(34,197,94,0.1)',
              display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" style={{width:32,height:32}}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p style={{ fontSize:20, fontWeight:900, color:theme.text, margin:'0 0 8px' }}>
              Code créé !
            </p>
            {/* Badge code */}
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'8px 20px',
              borderRadius:12, background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6',
              border:`1px solid ${theme.border}`, marginBottom:16 }}>
              <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:20, letterSpacing:'0.1em', color:theme.text }}>
                {createdConfirm.code}
              </span>
            </div>
            {/* Infos email */}
            {createdConfirm.sentCount !== null && (
              <div style={{ padding:'12px 16px', borderRadius:12, marginBottom:20,
                background: createdConfirm.emailError
                  ? 'rgba(239,68,68,0.06)' : 'rgba(26,115,232,0.06)',
                border: `1px solid ${createdConfirm.emailError ? 'rgba(239,68,68,0.2)' : 'rgba(26,115,232,0.2)'}` }}>
                {createdConfirm.emailError ? (
                  <p style={{ fontSize:13, color:'#ef4444', margin:0 }}>
                    Erreur envoi email : {createdConfirm.emailError}
                  </p>
                ) : (
                  <p style={{ fontSize:13, color:'#1a73e8', fontWeight:600, margin:0 }}>
                    {createdConfirm.sentCount > 0
                      ? `${createdConfirm.sentCount} email${createdConfirm.sentCount > 1 ? 's' : ''} envoyé${createdConfirm.sentCount > 1 ? 's' : ''} à vos clients`
                      : 'Aucun client avec email enregistré'}
                  </p>
                )}
              </div>
            )}
            <button onClick={()=>{ setCreatedConfirm(null); setModal(false); setEdit(null); }}
              style={{ width:'100%', padding:'13px', borderRadius:12, background:'#1a73e8',
                color:'white', fontWeight:800, fontSize:14, border:'none', cursor:'pointer',
                boxShadow:'0 4px 14px rgba(26,115,232,0.35)' }}>
              Fermer
            </button>
          </div>
        </div>
      )}
      {sendModal && <SendPromoEmailModal promo={sendModal} theme={theme} onClose={()=>setSendModal(null)} showToast={showToast} />}
      <Confirm open={!!delId} onClose={()=>setDelId(null)} title="Supprimer ce code promo ?" desc="Cette action est irréversible." theme={theme}
        onConfirm={async()=>{ await promoApi.remove(delId); setPromos(p=>p.filter(x=>x.id!==delId)); setDelId(null); showToast('Code supprime'); }} />
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// FEATURE 11 : Prévisions de CA
// ════════════════════════════════════════════════════════════════════════════
function TabForecastStats({ theme }) {
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
      {/* KPIs */}
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

      {/* Horizons */}
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
          {/* Graphique en barres */}
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

          {/* Prévisions détaillées */}
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

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 12 : Heatmap heures de pointe
// ════════════════════════════════════════════════════════════════════════════

// ── TAB CLIENTS ──────────────────────────────────────────────────────────────
function TabClients({ theme, showToast }) {
  const isDark = theme.mode === 'dark';

  const [clients,    setClients]    = useState([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [sort,       setSort]       = useState('name');
  const [selected,   setSelected]   = useState(null); // fiche ouverte
  const [fiche,      setFiche]      = useState(null); // données fiche détaillée
  const [ficheLoad,  setFicheLoad]  = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editMode,   setEditMode]   = useState(false);
  const [form,       setForm]       = useState({ first_name:'', last_name:'', email:'', phone:'', notes:'' });
  const [noteText,   setNoteText]   = useState('');
  const [noteLoad,   setNoteLoad]   = useState(false);
  const [inviting,   setInviting]   = useState(false);
  const [busy,       setBusy]       = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await clientsApi.list({ search, sort, limit: 100 });
      setClients(r.clients || []);
      setTotal(r.total || 0);
    } catch { showToast('Erreur chargement clients', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search, sort]);

  const openFiche = async (cl) => {
    setSelected(cl);
    setFiche(null);
    setFicheLoad(true);
    try {
      const r = await clientsApi.get(cl.id);
      setFiche(r);
    } catch { showToast('Erreur chargement fiche', 'error'); }
    finally { setFicheLoad(false); }
  };

  const handleCreate = async () => {
    if (!form.first_name.trim() && !form.email.trim()) return showToast('Nom ou email requis', 'error');
    setBusy(true);
    try {
      await clientsApi.create(form);
      showToast('Client crée ✓', 'success');
      setShowCreate(false);
      setForm({ first_name:'', last_name:'', email:'', phone:'', notes:'' });
      load();
    } catch(e) { showToast(e.message || 'Erreur', 'error'); }
    finally { setBusy(false); }
  };

  const handleUpdate = async () => {
    if (!fiche) return;
    setBusy(true);
    try {
      const r = await clientsApi.update(fiche.id, form);
      setFiche(f => ({ ...f, ...r }));
      setEditMode(false);
      showToast('Client mis a jour ✓', 'success');
      load();
    } catch { showToast('Erreur mise a jour', 'error'); }
    finally { setBusy(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette fiche client ?')) return;
    try {
      await clientsApi.remove(id);
      setSelected(null); setFiche(null);
      showToast('Fiche supprimee', 'success');
      load();
    } catch { showToast('Erreur suppression', 'error'); }
  };

  const handleInvite = async () => {
    if (!fiche?.email) return showToast('Email client requis pour inviter', 'error');
    setInviting(true);
    try {
      await clientsApi.invite(fiche.id);
      showToast('Invitation envoyee ✓', 'success');
      openFiche(fiche);
    } catch { showToast('Erreur envoi invitation', 'error'); }
    finally { setInviting(false); }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !fiche) return;
    setNoteLoad(true);
    try {
      const r = await clientsApi.addNote(fiche.id, { note_text: noteText });
      setFiche(f => ({ ...f, notes: [r, ...(f.notes||[])] }));
      setNoteText('');
      showToast('Note ajoutee ✓', 'success');
    } catch { showToast('Erreur ajout note', 'error'); }
    finally { setNoteLoad(false); }
  };

  // ── Helpers UI ──────────────────────────────────────────────────────────────
  const Avatar = ({ name, size = 44 }) => {
    const initials = name ? name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase() : '?';
    const colors   = ['#111827','#10b981','#f59e0b','#ef4444','#374151','#8b5cf6','#ec4899'];
    const color    = colors[(name||'A').charCodeAt(0) % colors.length];
    return (
      <div style={{ width:size, height:size, borderRadius:size*0.33, background:color, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:900, fontSize:size*0.38, flexShrink:0 }}>
        {initials}
      </div>
    );
  };

  const fmt = n => Number(n||0).toFixed(2);
  const fmtDate = s => s ? new Date(s).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }) : '-';
  const statusLabel = { pending:'En attente', confirmed:'Confirme', cancelled:'Annule', completed:'Termine', no_show:'Absent' };
  const statusColor = { pending:'#f59e0b', confirmed:'#10b981', cancelled:'#ef4444', completed:'#111827', no_show:'#94a3b8' };

  // ── Rendu liste ──────────────────────────────────────────────────────────────
  if (selected) {
    // ── VUE FICHE CLIENT ───────────────────────────────────────────────────────
    return (
      <div style={{ maxWidth:700, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <button onClick={()=>{ setSelected(null); setFiche(null); setEditMode(false); }}
            style={{ padding:'8px 16px', borderRadius:12, background:'none', border:`1px solid ${theme.border}`, color:theme.muted, cursor:'pointer', fontWeight:600, fontSize:13 }}>
            ← Retour
          </button>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:theme.text, flex:1 }}>
            {fiche ? (fiche.first_name+' '+fiche.last_name).trim() || fiche.email : selected.full_name || '...'}
          </h2>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>{ setEditMode(true); setForm({ first_name:fiche?.first_name||'', last_name:fiche?.last_name||'', email:fiche?.email||'', phone:fiche?.phone||'', notes:fiche?.account_notes||'' }); }}
              style={{ padding:'8px 14px', borderRadius:12, background:theme.cardAlt, border:`1px solid ${theme.border}`, color:theme.text, cursor:'pointer', fontWeight:700, fontSize:12 }}>
              ✏️ Éditer
            </button>
            <button onClick={()=>handleDelete(fiche?.id||selected.id)}
              style={{ padding:'8px 14px', borderRadius:12, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', color:'#ef4444', cursor:'pointer', fontWeight:700, fontSize:12 }}>
              🗑 Supprimer
            </button>
          </div>
        </div>

        {ficheLoad && <div style={{ textAlign:'center', padding:40, color:theme.muted }}>Chargement...</div>}

        {fiche && !editMode && (<>
          {/* Carte identité */}
          <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:24, border:`1px solid ${theme.border}`, marginBottom:16 }}>
            <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
              <Avatar name={fiche.full_name||fiche.email} size={56} />
              <div style={{ flex:1 }}>
                <h3 style={{ margin:'0 0 4px', fontSize:18, fontWeight:800, color:theme.text }}>
                  {(fiche.first_name+' '+fiche.last_name).trim() || '-'}
                </h3>
                <p style={{ margin:'0 0 2px', fontSize:13, color:theme.muted }}>{fiche.email || '-'}</p>
                <p style={{ margin:'0', fontSize:13, color:theme.muted }}>{fiche.phone || 'Pas de télephone'}</p>
                {fiche.account_notes && <p style={{ margin:'8px 0 0', fontSize:12, color:theme.muted, fontStyle:'italic' }}>"{fiche.account_notes}"</p>}
              </div>
              <div style={{ textAlign:'right' }}>
                {fiche.has_global_account
                  ? <span style={{ fontSize:11, fontWeight:700, color:'#10b981', background:'rgba(16,185,129,0.1)', padding:'4px 10px', borderRadius:99 }}>✓ Compte plateforme</span>
                  : <button onClick={handleInvite} disabled={inviting||!fiche.email}
                      style={{ fontSize:11, fontWeight:700, color:theme.text, background:theme.cardAlt, padding:'4px 10px', borderRadius:99, border:`1px solid ${theme.border}`, cursor:fiche.email?'pointer':'not-allowed' }}>
                      {inviting ? '⏳ Envoi...' : '✉️ Inviter'}
                    </button>
                }
                {fiche.invite_sent_at && !fiche.has_global_account && (
                  <p style={{ fontSize:10, color:theme.muted, margin:'4px 0 0' }}>Invité le {fmtDate(fiche.invite_sent_at)}</p>
                )}
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
            {[
              { label:'Visites',          value: fiche.total_visits, icon:'📅', color:'#111827' },
              { label:'Total dépense',    value: fmt(fiche.total_spent)+' €', icon:'💶', color:'#10b981' },
              { label:'Tampons/Points',   value: fiche.stamps||fiche.points||0, icon:'🎫', color:'#f59e0b' },
              { label:'Recompenses',      value: fiche.rewards_earned||0, icon:'🎁', color:'#8b5cf6' },
            ].map(k => (
              <div key={k.label} style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:16, padding:'14px 12px', border:`1px solid ${theme.border}`, textAlign:'center' }}>
                <div style={{ fontSize:22 }}>{k.icon}</div>
                <div style={{ fontSize:18, fontWeight:900, color:k.color, margin:'4px 0 2px', fontFamily:'monospace' }}>{k.value}</div>
                <div style={{ fontSize:10, color:theme.muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Notes internes */}
          <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:20, border:`1px solid ${theme.border}`, marginBottom:16 }}>
            <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:800, color:theme.text }}>📝 Notes internes</h4>
            {/* Ajouter une note */}
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <input
                placeholder="Ajouter une note interne..."
                value={noteText}
                onChange={e=>setNoteText(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&handleAddNote()}
                style={{ flex:1, padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none' }}
              />
              <button onClick={handleAddNote} disabled={!noteText.trim()||noteLoad}
                style={{ padding:'0 16px', borderRadius:12, background:'rgba(17,24,39,0.12)', border:'1px solid rgba(17,24,39,0.25)', color:'#111827', fontWeight:700, cursor:'pointer' }}>
                {noteLoad ? '...' : '+'}
              </button>
            </div>
            {(fiche.notes_list||[]).length === 0 && <p style={{ color:theme.muted, fontSize:13, margin:0 }}>Aucune note pour ce client.</p>}
            {(fiche.notes_list||[]).map((n,i) => (
              <div key={i} style={{ padding:'10px 14px', borderRadius:12, background:isDark?'rgba(255,255,255,0.04)':'#f8fafc', marginBottom:8, borderLeft:'3px solid rgba(17,24,39,0.4)' }}>
                <p style={{ margin:'0 0 4px', fontSize:13, color:theme.text, lineHeight:1.5 }}>{n.note_text}</p>
                <p style={{ margin:0, fontSize:10, color:theme.muted }}>{n.employee_name ? `Par ${n.employee_name} · ` : ''}{fmtDate(n.created_at)}</p>
              </div>
            ))}
          </div>

          {/* Historique transactions */}
          <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:20, border:`1px solid ${theme.border}`, marginBottom:16 }}>
            <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:800, color:theme.text }}>💳 Transactions ({(fiche.transactions||[]).length})</h4>
            {(fiche.transactions||[]).length === 0 && <p style={{ color:theme.muted, fontSize:13, margin:0 }}>Aucune transaction.</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(fiche.transactions||[]).map((t,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, background:isDark?'rgba(255,255,255,0.03)':'#f8fafc' }}>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:700, color:theme.text }}>{t.description||t.category_name||'-'}</p>
                    <p style={{ margin:0, fontSize:11, color:theme.muted }}>{fmtDate(t.date)} {t.time ? '· '+t.time.slice(0,5) : ''} {t.employee_name ? '· '+t.employee_name : ''}</p>
                    {t.client_note && <p style={{ margin:'3px 0 0', fontSize:11, color:'#111827', fontStyle:'italic' }}>"{t.client_note}"</p>}
                  </div>
                  <span style={{ fontWeight:900, fontSize:15, color:'#10b981', fontFamily:'monospace' }}>{fmt(t.amount)} €</span>
                </div>
              ))}
            </div>
          </div>

          {/* Historique rendez-vous */}
          <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:20, border:`1px solid ${theme.border}`, marginBottom:16 }}>
            <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:800, color:theme.text }}>📅 Rendez-vous ({(fiche.appointments||[]).length})</h4>
            {(fiche.appointments||[]).length === 0 && <p style={{ color:theme.muted, fontSize:13, margin:0 }}>Aucun rendez-vous.</p>}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(fiche.appointments||[]).map((a,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, background:isDark?'rgba(255,255,255,0.03)':'#f8fafc' }}>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:700, color:theme.text }}>{a.service_name||'Rendez-vous'}</p>
                    <p style={{ margin:0, fontSize:11, color:theme.muted }}>{fmtDate(a.date)} {a.start_time?.slice(0,5)||''} {a.employee_name?'· '+a.employee_name:''}</p>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:statusColor[a.status]||'#94a3b8', background:`${statusColor[a.status]||'#94a3b8'}18`, padding:'3px 10px', borderRadius:99 }}>
                    {statusLabel[a.status]||a.status}
                  </span>
                  {a.total_amount && <span style={{ fontWeight:900, fontSize:14, color:'#10b981', fontFamily:'monospace' }}>{fmt(a.total_amount)} €</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Codes promo utilisés */}
          {(fiche.promos||[]).length > 0 && (
            <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:20, border:`1px solid ${theme.border}`, marginBottom:16 }}>
              <h4 style={{ margin:'0 0 14px', fontSize:14, fontWeight:800, color:theme.text }}>🎁 Codes promo utilisés</h4>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(fiche.promos||[]).map((p,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, background:isDark?'rgba(255,255,255,0.03)':'#f8fafc' }}>
                    <div style={{ flex:1 }}>
                      <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:13, color:'#111827' }}>{p.code_snapshot}</span>
                      {p.is_loyalty_reward && <span style={{ marginLeft:8, fontSize:10, color:'#f59e0b', fontWeight:700 }}>FIDÉLITÉ</span>}
                    </div>
                    <span style={{ fontWeight:700, fontSize:13, color:'#ef4444' }}>-{fmt(p.discount_applied)} €</span>
                    <span style={{ fontSize:11, color:theme.muted }}>{fmtDate(p.used_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>)}

        {/* Mode édition */}
        {fiche && editMode && (
          <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:24, border:`1px solid ${theme.border}` }}>
            <h4 style={{ margin:'0 0 20px', fontSize:16, fontWeight:800, color:theme.text }}>Modifier la fiche client</h4>
            {[
              { key:'first_name', label:'Prenom' },
              { key:'last_name',  label:'Nom' },
              { key:'email',      label:'Email' },
              { key:'phone',      label:'Télephone' },
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>{label}</label>
                <input value={form[key]||''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
                  style={{ width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:14, outline:'none', boxSizing:'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Notes internes (fiche)</label>
              <textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3}
                style={{ width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:14, outline:'none', resize:'vertical', boxSizing:'border-box' }} />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={handleUpdate} disabled={busy}
                style={{ flex:1, padding:'13px', borderRadius:14, background:'#1a73e8', color:'white', border:'none', fontWeight:800, cursor:'pointer' }}>
                {busy ? 'Enregistrement...' : '✓ Enregistrer'}
              </button>
              <button onClick={()=>setEditMode(false)}
                style={{ padding:'13px 20px', borderRadius:14, background:'none', border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer' }}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── VUE LISTE CLIENTS ────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:theme.text, flex:1 }}>
          👥 Clients ({total})
        </h2>
        <button onClick={()=>setShowCreate(true)}
          style={{ padding:'10px 18px', borderRadius:14, background:'#1a73e8', color:'white', border:'none', fontWeight:800, fontSize:13, cursor:'pointer' }}>
          + Nouveau client
        </button>
      </div>

      {/* Filtres */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <input
          placeholder="🔍 Rechercher par nom, email, téléphone..."
          value={search}
          onChange={e=>setSearch(e.target.value)}
          style={{ flex:1, minWidth:200, padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none' }}
        />
        <select value={sort} onChange={e=>setSort(e.target.value)}
          style={{ padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', cursor:'pointer' }}>
          <option value="name">Trier : Nom A→Z</option>
          <option value="visits">Trier : Visites</option>
          <option value="spending">Trier : Dépenses</option>
          <option value="recent">Trier : Récents</option>
        </select>
      </div>

      {/* Formulaire création */}
      {showCreate && (
        <div style={{ background:isDark?'rgba(255,255,255,0.04)':'white', borderRadius:20, padding:20, border:`1px solid ${theme.border}`, marginBottom:16 }}>
          <h4 style={{ margin:'0 0 16px', fontSize:15, fontWeight:800, color:theme.text }}>Nouveau client</h4>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
            {[['first_name','Prenom *'],['last_name','Nom'],['email','Email'],['phone','Télephone']].map(([k,lbl]) => (
              <input key={k} placeholder={lbl} value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                style={{ padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none' }} />
            ))}
          </div>
          <textarea placeholder="Notes internes (optionnel)" value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}
            style={{ width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box', marginBottom:12 }} />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handleCreate} disabled={busy}
              style={{ padding:'10px 20px', borderRadius:12, background:'#1a73e8', color:'white', border:'none', fontWeight:800, cursor:'pointer', fontSize:13 }}>
              {busy ? 'Creation...' : 'Creer le client'}
            </button>
            <button onClick={()=>{setShowCreate(false);setForm({first_name:'',last_name:'',email:'',phone:'',notes:''}); }}
              style={{ padding:'10px 16px', borderRadius:12, background:'none', border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer', fontSize:13 }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading && <div style={{ textAlign:'center', padding:40, color:theme.muted }}>Chargement...</div>}
      {!loading && clients.length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:theme.muted }}>
          <div style={{ fontSize:40, marginBottom:12 }}>👥</div>
          <p style={{ fontWeight:700 }}>Aucun client trouvé</p>
          <p style={{ fontSize:13 }}>Les clients apparaissent automatiquement après un encaissement avec email, ou vous pouvez en créer manuellement.</p>
        </div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {clients.map(cl => (
          <div key={cl.id} onClick={()=>openFiche(cl)}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', borderRadius:18, background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${theme.border}`, cursor:'pointer', transition:'all 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(17,24,39,0.4)'}
            onMouseLeave={e=>e.currentTarget.style.borderColor=theme.border}>
            {/* Avatar */}
            <div style={{ width:44, height:44, borderRadius:14, background: ['#111827','#10b981','#f59e0b','#8b5cf6','#ef4444','#374151'][cl.full_name?.charCodeAt(0)%6||0], display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:900, fontSize:17, flexShrink:0 }}>
              {(cl.full_name||cl.email||'?').charAt(0).toUpperCase()}
            </div>
            {/* Infos */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                <span style={{ fontWeight:800, fontSize:15, color:theme.text }}>{cl.full_name||'-'}</span>
                {cl.has_global_account && <span style={{ fontSize:10, color:'#10b981', background:'rgba(16,185,129,0.1)', padding:'2px 8px', borderRadius:99, fontWeight:700 }}>✓ Compte</span>}
              </div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                {cl.email && <span style={{ fontSize:12, color:theme.muted }}>{cl.email}</span>}
                {cl.phone && <span style={{ fontSize:12, color:theme.muted }}>📱 {cl.phone}</span>}
              </div>
            </div>
            {/* Stats */}
            <div style={{ display:'flex', gap:16, alignItems:'center', flexShrink:0 }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:800, color:'#111827' }}>{(cl.tx_count||0)+(cl.apt_count||0)}</div>
                <div style={{ fontSize:10, color:theme.muted }}>visites</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:800, color:'#10b981', fontFamily:'monospace' }}>{Number(cl.total_spent||0).toFixed(0)}€</div>
                <div style={{ fontSize:10, color:theme.muted }}>dépensé</div>
              </div>
              {(cl.stamps||cl.points) ? (
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:14, fontWeight:800, color:'#f59e0b' }}>{cl.stamps||Math.floor(cl.points)||0}</div>
                  <div style={{ fontSize:10, color:theme.muted }}>pts</div>
                </div>
              ) : null}
              {cl.notes_count > 0 && (
                <div style={{ fontSize:11, color:'#111827', background:'rgba(17,24,39,0.08)', padding:'3px 8px', borderRadius:8 }}>
                  📝 {cl.notes_count}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabHeatmap({ theme }) {
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
  const HOURS   = Array.from({length:13}, (_,i) => i+8); // 8h → 20h
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
            {/* En-têtes heures */}
            <div style={{ display:'flex', gap:2, marginLeft:32, marginBottom:4 }}>
              {HOURS.map(h => (
                <div key={h} style={{ width:24, textAlign:'center', fontSize:8, fontWeight:700, color:theme.dim }}>{h}h</div>
              ))}
            </div>
            {/* Grille */}
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
          {/* Légende */}
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

// ── Wrapper Analytics (onglet Ventes enrichi) ────────────────────────────────
// On enrichit TabProductStats en lui ajoutant des sous-onglets analytics

// ═══════════════════════════════════════════════════════════════════════════
//  ONGLET RGPD
// ═══════════════════════════════════════════════════════════════════════════
function TabRGPD({ showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const [retention, setRetention] = useState(24); // mois
  const [saving, setSaving] = useState(false);
  const inp = {
    padding: '10px 12px', borderRadius: 10, outline: 'none',
    background: theme.inputBg, border: `1px solid ${theme.inputBorder}`,
    color: theme.text, fontSize: 13, width: '100%', boxSizing: 'border-box',
  };

  const RIGHTS = [
    ['📋 Art. 13 — Information', 'Les clients sont informés de la collecte lors de leur inscription via une case à cocher obligatoire.'],
    ['✅ Art. 6 — Licéité', 'Traitement basé sur le consentement explicite (réservations) et l'exécution du contrat.'],
    ['🗑 Art. 17 — Effacement', 'Les clients peuvent supprimer leur compte depuis leur profil. Suppression en cascade de toutes les données personnelles.'],
    ['📦 Art. 20 — Portabilité', 'Les clients peuvent exporter leurs données en JSON depuis leur profil (compte, RDV, fidélité).'],
    ['🔐 Art. 32 — Sécurité', 'Mots de passe hashés bcrypt, communications TLS, accès par JWT, audit trail sur les transactions.'],
    ['⏱ Art. 5 — Conservation', 'Données personnelles conservées le temps de l'inscription. Historiques comptables anonymisés.'],
  ];

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* En-tête */}
      <div style={{ background: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.05)',
        borderRadius: 20, padding: 20, border: '1px solid rgba(99,102,241,0.2)' }}>
        <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: 16, color: theme.text }}>
          🔒 Conformité RGPD
        </p>
        <p style={{ margin: 0, fontSize: 13, color: theme.muted, lineHeight: 1.6 }}>
          FlowIA intègre nativement les exigences du Règlement Général sur la Protection des Données.
          Voici le récapitulatif des mesures en place pour votre application.
        </p>
      </div>

      {/* Mesures en place */}
      <div style={{ background: theme.card, borderRadius: 20, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${theme.border}` }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: theme.text }}>✅ Mesures appliquées</p>
        </div>
        {RIGHTS.map(([title, desc]) => (
          <div key={title} style={{ padding: '12px 18px', borderBottom: `1px solid ${theme.border}` }}>
            <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 13, color: theme.text }}>{title}</p>
            <p style={{ margin: 0, fontSize: 12, color: theme.muted, lineHeight: 1.5 }}>{desc}</p>
          </div>
        ))}
      </div>

      {/* Durée de conservation */}
      <div style={{ background: theme.card, borderRadius: 20, border: `1px solid ${theme.border}`, padding: 20 }}>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 14, color: theme.text }}>
          ⏱ Durée de conservation des données inactives
        </p>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: theme.muted, lineHeight: 1.5 }}>
          Information indicative — les clients inactifs depuis plus de {retention} mois
          peuvent être supprimés manuellement depuis la liste clients.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="number" min="6" max="60" value={retention}
            onChange={e => setRetention(parseInt(e.target.value) || 24)}
            style={{ ...inp, width: 80 }} />
          <span style={{ fontSize: 13, color: theme.muted }}>mois d'inactivité</span>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11, color: theme.dim }}>
          💡 La suppression automatique n'est pas activée — vous gardez le contrôle total.
        </p>
      </div>

      {/* Données collectées */}
      <div style={{ background: theme.card, borderRadius: 20, border: `1px solid ${theme.border}`, padding: 20 }}>
        <p style={{ margin: '0 0 14px', fontWeight: 800, fontSize: 14, color: theme.text }}>
          📊 Données collectées sur vos clients
        </p>
        {[
          ['Identité', 'Prénom, nom (obligatoire)', '✅ Nécessaire'],
          ['Contact', 'Email, téléphone', '✅ Nécessaire'],
          ['Réservations', 'Historique des RDV, services', '✅ Nécessaire'],
          ['Fidélité', 'Tampons, récompenses', '✅ Nécessaire'],
          ['Paiement', 'Montant (pas de CB)', '✅ Comptabilité'],
          ['Tracking', 'Aucun cookie tiers, aucune pub', '✅ Aucun'],
        ].map(([cat, data, status]) => (
          <div key={cat} style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', padding: '8px 0',
            borderBottom: `1px solid ${theme.border}` }}>
            <div>
              <p style={{ margin: '0 0 1px', fontSize: 13, fontWeight: 600, color: theme.text }}>{cat}</p>
              <p style={{ margin: 0, fontSize: 11, color: theme.muted }}>{data}</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981',
              background: 'rgba(16,185,129,0.1)', padding: '3px 8px', borderRadius: 99 }}>
              {status}
            </span>
          </div>
        ))}
      </div>

      {/* Mentions légales à ajouter */}
      <div style={{ background: 'rgba(245,158,11,0.05)', borderRadius: 20,
        border: '1px solid rgba(245,158,11,0.2)', padding: 20 }}>
        <p style={{ margin: '0 0 10px', fontWeight: 800, fontSize: 14, color: '#d97706' }}>
          ⚠️ À faire de votre côté
        </p>
        {[
          'Désigner un responsable de traitement (vous, en tant que commerçant)',
          'Mentionner votre activité dans votre politique de confidentialité',
          'En cas de violation de données, notifier la CNIL sous 72h',
          'Pour plus de 250 salariés : tenir un registre de traitement',
        ].map(item => (
          <div key={item} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <span style={{ color: '#d97706', flexShrink: 0 }}>→</span>
            <p style={{ margin: 0, fontSize: 12, color: theme.muted }}>{item}</p>
          </div>
        ))}
        <a href="https://www.cnil.fr/fr/rgpd-de-quoi-parle-t-on" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: '#6366f1',
            textDecoration: 'underline' }}>
          📖 Guide CNIL — RGPD pour les TPE/PME
        </a>
      </div>

    </div>
  );
}

export default function Settings({ transactions, employees, categories, onAddCat, onUpdCat, onDelCat, onReorderCat, onAddEmp, onUpdEmp, onDelEmp, onUpdTx, onDelTx, onLock }) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const [t, show] = useToast();
  const navigate  = useNavigate();
  const location  = useLocation();

  // Mapping URL segment → id d'onglet
  const URL_TO_TAB = {
    '':             'stats',
    'stats':        'stats',
    'ventes':       'stats',
    'agenda':       'agenda',
    'historique':   'transactions',
    'equipe':       'employees',
    'categories':   'categories',
    'profil':       'profil',
    'marketing':    'marketing',
    'clients':      'clients',
    'export':       'export',
    'previsions':   'forecast',
    'heures':       'heatmap',
    'notifications':'notifications',
    'compte':       'account',
    // Sous-onglets employés — mappés sur 'employees' (sous-tab géré par URL)
    'absences':     'employees',
    'commissions':  'employees',
    'horaires':     'employees',
  };

  const TAB_TO_URL = {
    'stats':        '/settings',

    'agenda':       '/settings/agenda/config',
    'transactions': '/settings/historique',
    'employees':    '/settings/equipe',
    'categories':   '/settings/categories',
    'profil':       '/settings/profil',
    'marketing':    '/settings/marketing',
    'clients':      '/settings/clients',
    'export':       '/settings/export',
    'forecast':     '/settings/previsions',
    'heatmap':      '/settings/heures',
    'notifications':'/settings/notifications',
    'account':      '/settings/compte',
  };

  // Extraire le segment de chemin après /settings/
  const pathSegments = location.pathname.replace(/^\/settings\/?/, '').split('/').filter(Boolean);
  const segment = pathSegments[0] || '';
  const tab = URL_TO_TAB[segment] ?? 'stats';

  const setTab = (id) => navigate(TAB_TO_URL[id] || '/settings', { replace: false });

  const TABS = [
    { id: 'stats',        label: 'Stats',      icon: I.BarCh },
    { id: 'transactions', label: 'Historique', icon: I.Edit },
    { id: 'agenda',       label: 'Config',        icon: I.Calendar },
    { id: 'employees',    label: 'Équipe',     icon: I.Users },
    { id: 'categories',   label: 'Categories', icon: I.Tag },
    { id: 'profil',       label: 'Images',     icon: I.Camera },
    { id: 'marketing',    label: 'Marketing',  icon: I.Gift },
    { id: 'clients',      label: 'Clients',    icon: I.UserCheck },
    { id: 'notifications',label: 'Notifs',     icon: I.Bell },
    { id: 'export',       label: 'Export',     icon: I.Download },

    { id: 'forecast',     label: 'Previsions', icon: I.TrendUp },
    { id: 'heatmap',      label: 'Heures',     icon: I.Flame },
    { id: 'account',      label: 'Compte',     icon: I.User },
    { id: 'rgpd',         label: 'RGPD',       icon: I.Shield },
  ];

  return (
    <div className="min-h-screen pb-24 lg:pb-8" style={{ background: theme.bg }}>
      <Toast msg={t?.msg} type={t?.type} />

      {/* Header */}
      <div className="px-5 pt-12 pb-5" style={{ background: theme.headerGrad }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Admin</h1>
              <span className="text-[11px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1"
                style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80' }}>
                <I.Check className="w-3 h-3" /> Accès accordé
              </span>
            </div>
            <p className="text-sm" style={{ color: theme.muted }}>{user?.businessName}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={onLock} title="Verrouiller"
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
              style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', border: `1px solid ${theme.border}` }}>
              <I.LogOut className="w-5 h-5" style={{ color: theme.muted }} />
            </button>
          </div>
        </div>
      </div>

      {/* Onglets sticky */}
      <div className="sticky top-0 z-10" style={{ background: theme.stickyBg, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${theme.border}` }}>
        <div className="flex max-w-screen-sm mx-auto overflow-x-auto">
          {TABS.map(({ id, label, icon: TabIcon }) => {
            const active = tab === id;
            const activeColor = isDark ? '#a5a0ff' : '#6c63ff';
            const inactiveColor = theme.muted;
            return (
              <button key={id} onClick={() => setTab(id)}
                className="flex-none flex flex-col items-center px-4 py-3 gap-0.5 text-[10px] font-bold min-w-max transition-all relative"
                style={{ color: active ? activeColor : inactiveColor }}>
                {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{ background: 'linear-gradient(90deg,#111827,#374151)' }} />}
                <TabIcon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-4 max-w-screen-sm mx-auto">
        {tab === 'stats'        && <TabStats transactions={transactions} employees={employees} categories={categories} theme={theme} />}

        {tab === 'agenda'       && <Agenda employees={employees} categories={categories} theme={theme} />}
        {tab === 'transactions' && <TabTransactions transactions={transactions} employees={employees} categories={categories} onUpdate={onUpdTx} onDelete={onDelTx} showToast={show} theme={theme} />}
        {tab === 'employees'    && <TabEmployeesMain employees={employees} transactions={transactions} onAdd={onAddEmp} onUpd={onUpdEmp} onDel={onDelEmp} showToast={show} theme={theme} />}
        {tab === 'categories'   && <TabCategories categories={categories} transactions={transactions} onAdd={onAddCat} onUpd={onUpdCat} onDel={onDelCat} onReorder={onReorderCat} showToast={show} theme={theme} />}
        {tab === 'profil'       && <TabProfil theme={theme} showToast={show} />}
        {tab === 'clients'       && <TabClients theme={theme} showToast={show} />}
        {tab === 'marketing'    && <TabMarketing theme={theme} showToast={show} />}
        {tab === 'export'       && <TabExport employees={employees} categories={categories} theme={theme} />}
        {tab === 'forecast'     && <TabForecastStats theme={theme} />}
        {tab === 'heatmap'      && <TabHeatmap theme={theme} />}
        {tab === 'notifications'&& <TabNotifications theme={theme} showToast={show} />}
        {tab === 'account'      && <TabAccount showToast={show} theme={theme} onLock={onLock} />}
        {tab === 'rgpd'         && <TabRGPD showToast={show} theme={theme} />}
      </div>
    </div>
  );
}
// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANTS MANQUANTS — reconstruits
// ═══════════════════════════════════════════════════════════════════════════════

// ── TAB NOTIFICATIONS ────────────────────────────────────────────────────────
function TabNotifications({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const [cfg, setCfg]       = useState(null);
  const [loading, setLoad]  = useState(true);
  const [saving, setSaving] = useState(false);

  const DELAY_OPTS = [
    { v:'60',   l:'1 heure avant' },
    { v:'120',  l:'2 heures avant' },
    { v:'360',  l:'6 heures avant' },
    { v:'720',  l:'12 heures avant' },
    { v:'1440', l:'24 heures avant' },
    { v:'2880', l:'48 heures avant' },
  ];

  const SOUND_REPEAT_OPTS = [
    { v: 1, l: '1 fois' },
    { v: 2, l: '2 fois' },
    { v: 3, l: '3 fois' },
    { v: 5, l: '5 fois' },
  ];

  const SOUND_RDV_OPTS = [
    { v: 10, l: '10 min avant' },
    { v: 15, l: '15 min avant' },
    { v: 30, l: '30 min avant' },
    { v: 60, l: '1h avant' },
  ];

  const testSound = (type) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      const configs = {
        caisse:          [{ freq:880,start:0,dur:.10,gain:.8 },{ freq:1100,start:.07,dur:.14,gain:.7 },{ freq:1320,start:.15,dur:.22,gain:.9 }],
        new_appointment: [{ freq:523,start:0,dur:.18,gain:.7 },{ freq:659,start:.14,dur:.18,gain:.7 },{ freq:784,start:.28,dur:.30,gain:.8 },{ freq:1047,start:.42,dur:.35,gain:.9 }],
        reminder:        [{ freq:880,start:0,dur:.12,gain:.6 },{ freq:880,start:.20,dur:.12,gain:.6 },{ freq:880,start:.40,dur:.15,gain:.8 }],
      };
      const repeat = cfg.sound_repeat || 2;
      const notes  = configs[type] || configs.caisse;
      const lastN  = notes[notes.length-1];
      const singleDur = lastN.start + lastN.dur + 0.08;
      const gap    = 0.35;
      for (let r = 0; r < repeat; r++) {
        const off = r * (singleDur + gap);
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.55, now+off);
        master.connect(ctx.destination);
        notes.forEach(({freq, start, dur, gain}) => {
          const osc = ctx.createOscillator(); const gn = ctx.createGain();
          osc.type = type==='reminder'?'square':'sine';
          osc.frequency.setValueAtTime(freq, now+off+start);
          gn.gain.setValueAtTime(gain, now+off+start);
          gn.gain.exponentialRampToValueAtTime(0.001, now+off+start+dur);
          osc.connect(gn); gn.connect(master);
          osc.start(now+off+start); osc.stop(now+off+start+dur+0.05);
        });
      }
      setTimeout(() => { try { ctx.close(); } catch {} }, ((repeat-1)*(singleDur+gap)+singleDur+.2)*1000);
    } catch {}
  };

  useEffect(() => {
    notifApi.getSettings()
      .then(s => setCfg(s))
      .catch(() => showToast('Erreur chargement', 'error'))
      .finally(() => setLoad(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await notifApi.saveSettings(cfg);
      showToast('Parametres sauvegardes ✓');
    } catch { showToast('Erreur sauvegarde', 'error'); }
    finally { setSaving(false); }
  };

  const toggle = (key) => setCfg(p => ({ ...p, [key]: !p[key] }));
  const set    = (key, val) => setCfg(p => ({ ...p, [key]: val }));

  const cardS = { borderRadius:16, overflow:'hidden', background:theme.card, border:`1px solid ${theme.border}`, marginBottom:12 };
  const rowS  = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px' };
  const labelS = { fontSize:13, fontWeight:700, color:theme.text, margin:0 };
  const subS   = { fontSize:11, color:theme.muted, margin:'2px 0 0' };
  const Tog = ({ on, onChange }) => (
    <button onClick={onChange}
      style={{ width:44, height:24, borderRadius:99, border:'none', cursor:'pointer',
        position:'relative', flexShrink:0,
        background: on ? 'linear-gradient(90deg,#111827,#374151)' : (isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'),
        transition:'background .2s' }}>
      <div style={{ width:20, height:20, borderRadius:99, background:'white',
        position:'absolute', top:2, left:on?22:2, transition:'left .15s',
        boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }}/>
    </button>
  );
  const inp = { width:'100%', padding:'10px 12px', borderRadius:10, outline:'none',
    background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.05)',
    border:`1px solid ${theme.border}`, color:theme.text, fontSize:13, fontFamily:'inherit' };

  if (loading) return <div style={{ padding:48, textAlign:'center' }}><div style={{ width:28,height:28,borderRadius:99,border:'2px solid rgba(17,24,39,0.2)',borderTopColor:'#111827',animation:'spin .8s linear infinite',margin:'0 auto' }}/></div>;
  if (!cfg) return null;

  return (
    <div>
      {/* Récap journalier */}
      <div style={cardS}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>📊</span>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>Récap journalier</p>
        </div>
        <div style={rowS}>
          <div><p style={labelS}>Activer le récap journalier</p><p style={subS}>Reçois un email de synthèse chaque soir</p></div>
          <Tog on={cfg.daily_recap_enabled} onChange={() => toggle('daily_recap_enabled')} />
        </div>
        {cfg.daily_recap_enabled && (
          <div style={{ padding:'0 16px 14px', display:'flex', flexDirection:'column', gap:10 }}>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5 }}>Heure d&apos;envoi</p>
              <input type="time" value={cfg.daily_recap_time || '20:00'} onChange={e => set('daily_recap_time', e.target.value)} style={inp}/>
            </div>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:5 }}>Email de réception</p>
              <input type="email" placeholder="ton@email.com" value={cfg.daily_recap_email || ''} onChange={e => set('daily_recap_email', e.target.value)} style={inp}/>
            </div>
            <button onClick={() => notifApi.testRecap().then(()=>showToast('Email test envoye ✓')).catch(()=>showToast('Erreur', 'error'))}
              style={{ padding:'9px 0', borderRadius:10, border:`1px solid ${theme.border}`, background:'transparent', color:theme.muted, fontSize:12, fontWeight:700, cursor:'pointer' }}>
              📨 Envoyer un récap test
            </button>
          </div>
        )}
      </div>

      {/* Rappels RDV clients */}
      <div style={cardS}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>📅</span>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>Rappels RDV clients</p>
        </div>
        <div style={rowS}>
          <div><p style={labelS}>Activer les rappels</p><p style={subS}>Email automatique avant chaque RDV</p></div>
          <Tog on={cfg.reminder_enabled} onChange={() => toggle('reminder_enabled')} />
        </div>
        {cfg.reminder_enabled && (
          <div style={{ padding:'0 16px 14px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:8 }}>Délai avant le RDV</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {DELAY_OPTS.map(d => (
                <button key={d.v} onClick={() => set('reminder_delays', d.v)}
                  style={{ padding:'7px 12px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer',
                    border:`1px solid ${cfg.reminder_delays===d.v?'#111827':theme.border}`,
                    background: cfg.reminder_delays===d.v?'rgba(17,24,39,0.12)':'transparent',
                    color: cfg.reminder_delays===d.v?'#111827':theme.muted }}>
                  {d.l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rappels employés */}
      <div style={cardS}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>👥</span>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>Rappels employés</p>
        </div>
        <div style={rowS}>
          <div><p style={labelS}>Rappels pour les employés</p><p style={subS}>Email pour préparer leur journée</p></div>
          <Tog on={cfg.employee_reminder_enabled} onChange={() => toggle('employee_reminder_enabled')} />
        </div>
        {cfg.employee_reminder_enabled && (
          <div style={{ padding:'0 16px 14px' }}>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:8 }}>Délai avant le RDV</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {DELAY_OPTS.slice(0,4).map(d => (
                <button key={d.v} onClick={() => set('employee_reminder_delays', d.v)}
                  style={{ padding:'7px 12px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer',
                    border:`1px solid ${cfg.employee_reminder_delays===d.v?'#374151':theme.border}`,
                    background: cfg.employee_reminder_delays===d.v?'rgba(55,65,81,0.12)':'transparent',
                    color: cfg.employee_reminder_delays===d.v?'#374151':theme.muted }}>
                  {d.l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Sons & alertes ── */}
      <div style={cardS}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}`, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>🔊</span>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>Sons & alertes</p>
        </div>

        {/* Validation transaction */}
        <div style={{ ...rowS, borderBottom:`1px solid ${theme.border}` }}>
          <div style={{ flex:1 }}>
            <p style={labelS}>Son validation encaissement</p>
            <p style={subS}>Joué après validation du paiement (caisse + PIN)</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <button onClick={()=>testSound('caisse')}
              style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer',
                border:`1px solid ${theme.border}`, background:theme.cardAlt, color:theme.muted }}>
              ▶ Tester
            </button>
            <Tog on={cfg.sound_caisse ?? true} onChange={()=>setCfg(p=>({...p, sound_caisse:!(p.sound_caisse??true)}))} />
          </div>
        </div>

        {/* Nouveau RDV */}
        <div style={{ ...rowS, borderBottom:`1px solid ${theme.border}` }}>
          <div style={{ flex:1 }}>
            <p style={labelS}>Son nouveau rendez-vous</p>
            <p style={subS}>Joué dès réception d'un nouveau RDV</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <button onClick={()=>testSound('new_appointment')}
              style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer',
                border:`1px solid ${theme.border}`, background:theme.cardAlt, color:theme.muted }}>
              ▶ Tester
            </button>
            <Tog on={cfg.sound_new_appt ?? true} onChange={()=>setCfg(p=>({...p, sound_new_appt:!(p.sound_new_appt??true)}))} />
          </div>
        </div>

        {/* Rappel RDV proche */}
        <div style={{ ...rowS, borderBottom:`1px solid ${theme.border}` }}>
          <div style={{ flex:1 }}>
            <p style={labelS}>Son rappel de rendez-vous</p>
            <p style={subS}>Alerte sonore quand un RDV approche</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <button onClick={()=>testSound('reminder')}
              style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer',
                border:`1px solid ${theme.border}`, background:theme.cardAlt, color:theme.muted }}>
              ▶ Tester
            </button>
            <Tog on={cfg.sound_reminder ?? true} onChange={()=>setCfg(p=>({...p, sound_reminder:!(p.sound_reminder??true)}))} />
          </div>
        </div>

        {/* Timing rappel */}
        {(cfg.sound_reminder ?? true) && (
          <div style={{ padding:'10px 16px', borderBottom:`1px solid ${theme.border}` }}>
            <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:8 }}>⏱ Alerte RDV avant :</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {SOUND_RDV_OPTS.map(d => (
                <button key={d.v} onClick={()=>setCfg(p=>({...p, sound_rdv_before:d.v}))}
                  style={{ padding:'7px 12px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer',
                    border:`1px solid ${(cfg.sound_rdv_before||15)===d.v?'#1a73e8':theme.border}`,
                    background:(cfg.sound_rdv_before||15)===d.v?'rgba(26,115,232,0.1)':'transparent',
                    color:(cfg.sound_rdv_before||15)===d.v?'#1a73e8':theme.muted }}>
                  {d.l}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Répétitions */}
        <div style={{ padding:'10px 16px' }}>
          <p style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:8 }}>🔁 Répéter les sons :</p>
          <div style={{ display:'flex', gap:6 }}>
            {SOUND_REPEAT_OPTS.map(d => (
              <button key={d.v} onClick={()=>setCfg(p=>({...p, sound_repeat:d.v}))}
                style={{ padding:'7px 12px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer',
                  border:`1px solid ${(cfg.sound_repeat||2)===d.v?'#1a73e8':theme.border}`,
                  background:(cfg.sound_repeat||2)===d.v?'rgba(26,115,232,0.1)':'transparent',
                  color:(cfg.sound_repeat||2)===d.v?'#1a73e8':theme.muted }}>
                {d.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        style={{ width:'100%', padding:'14px', borderRadius:16, border:'none', cursor:'pointer',
          background:'#1a73e8', color:'white', fontWeight:800, fontSize:14,
          boxShadow:'0 4px 16px rgba(17,24,39,0.3)', opacity:saving?0.7:1 }}>
        {saving ? 'Sauvegarde...' : 'Enregistrer les parametres'}
      </button>
    </div>
  );
}

// ── TAB EXPORT ───────────────────────────────────────────────────────────────
function TabExport({ employees, categories, theme }) {
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

      {/* Filtres */}
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

      {/* Options analytiques */}
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

      {/* Résumé */}
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

      {/* Boutons export */}
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

// ── TAB PRODUCT STATS ────────────────────────────────────────────────────────
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

  const fmt = n => Number(n||0).toFixed(2);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Filtres période */}
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

      {/* Filtre employé */}
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
          <div style={{ width:28,height:28,borderRadius:99,border:'2px solid rgba(17,24,39,0.2)',borderTopColor:'#111827',animation:'spin .8s linear infinite',margin:'0 auto' }}/>
        </div>
      ) : !data ? (
        <div style={{ padding:48, textAlign:'center', color:theme.muted }}>Aucune donnée</div>
      ) : (
        <>
          {/* KPIs globaux */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {[
              ['CA total', fmt(data.totals?.total_revenue)+' €', theme.text],
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

          {/* Top services */}
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
                      <p style={{ fontSize:13, fontWeight:700, color:'#111827', margin:0 }}>{fmt(s.revenue)} €</p>
                      <p style={{ fontSize:10, color:theme.muted, margin:0 }}>{s.qty_sold||0} vente{(s.qty_sold||0)>1?'s':''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Top catégories */}
          {data.categories?.filter(c=>c.category_name).length > 0 && (
            <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:`1px solid ${theme.border}` }}>
                <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>🏷️ Par catégorie</p>
              </div>
              {data.categories.filter(c=>c.category_name).slice(0,6).map((c, i) => (
                <div key={c.category_name} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderTop: i>0?`1px solid ${theme.border}`:'none' }}>
                  <div style={{ width:10, height:10, borderRadius:99, flexShrink:0, background:c.category_color||'#111827' }}/>
                  <p style={{ flex:1, fontSize:13, fontWeight:600, color:theme.text, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.category_name}</p>
                  <p style={{ fontSize:13, fontWeight:700, color:theme.muted, margin:0 }}>{fmt(c.revenue)} €</p>
                </div>
              ))}
            </div>
          )}

          {/* Message si pas de données */}
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

// ── TAB ACCOUNT ──────────────────────────────────────────────────────────────
function TabAccount({ showToast, theme, onLock }) {
  const isDark = theme.mode === 'dark';
  const { user, updateUser, logout } = useAuth();

  // ── Section Informations du commerce ──────────────────────────────────
  const [editing,  setEditing]  = useState(false);
  const [profLoad, setProfLoad] = useState(false);
  const [profErr,  setProfErr]  = useState('');
  const [profOk,   setProfOk]   = useState('');
  const [form, setForm] = useState({
    businessName:      user?.businessName      || '',
    address:           user?.address           || '',
    city:              user?.city              || '',
    postalCode:        user?.postalCode        || '',
    phone:             user?.phone             || '',
    googleBusinessUrl: user?.googleBusinessUrl || '',
  });

  // Recharger depuis user si user change
  useEffect(() => {
    if (!editing) {
      setForm({
        businessName:      user?.businessName      || '',
        address:           user?.address           || '',
        city:              user?.city              || '',
        postalCode:        user?.postalCode        || '',
        phone:             user?.phone             || '',
        googleBusinessUrl: user?.googleBusinessUrl || '',
      });
    }
  }, [user, editing]);

  const saveProfile = async () => {
    if (!form.businessName.trim()) { setProfErr('Le nom du commerce est requis.'); return; }
    setProfLoad(true); setProfErr(''); setProfOk('');
    try {
      const r = await api.updateProfile({
        businessName:      form.businessName.trim(),
        phone:             form.phone.trim()             || undefined,
        address:           form.address.trim()           || undefined,
        city:              form.city.trim()              || undefined,
        postalCode:        form.postalCode.trim()        || undefined,
        googleBusinessUrl: form.googleBusinessUrl.trim() || undefined,
      });
      updateUser({
        businessName:      form.businessName.trim(),
        phone:             form.phone.trim(),
        address:           form.address.trim(),
        city:              form.city.trim(),
        postalCode:        form.postalCode.trim(),
        googleBusinessUrl: form.googleBusinessUrl.trim(),
      });
      setEditing(false);
      setProfOk('Informations mises a jour ✓');
      setTimeout(() => setProfOk(''), 3500);
      showToast('Informations mises a jour ✓');
    } catch(e) { setProfErr(e.message || 'Erreur lors de la sauvegarde'); }
    finally { setProfLoad(false); }
  };

  // ── Changement de mot de passe ─────────────────────────────────────────
  const [pwdForm, setPwdForm] = useState({ old:'', new1:'', new2:'' });
  const [pwdErr,  setPwdErr]  = useState('');
  const [pwdOk,   setPwdOk]   = useState(false);
  const [pwdLoad, setPwdLoad] = useState(false);

  const changePassword = async () => {
    if (!pwdForm.old || !pwdForm.new1) { setPwdErr('Tous les champs sont requis.'); return; }
    if (pwdForm.new1 !== pwdForm.new2) { setPwdErr('Les mots de passe ne correspondent pas.'); return; }
    if (pwdForm.new1.length < 6) { setPwdErr('Minimum 6 caracteres.'); return; }
    setPwdLoad(true); setPwdErr('');
    try {
      await api.changePassword({ oldPassword: pwdForm.old, newPassword: pwdForm.new1 });
      setPwdOk(true); setPwdForm({ old:'', new1:'', new2:'' });
      showToast('Mot de passe mis a jour ✓');
    } catch(e) { setPwdErr(e.message || 'Erreur'); }
    finally { setPwdLoad(false); }
  };

  // ── Changement email ────────────────────────────────────────────────────
  const [emailStep, setEmailStep] = useState('idle');
  const [newEmail,  setNewEmail]  = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailErr,  setEmailErr]  = useState('');
  const [emailLoad, setEmailLoad] = useState(false);

  const requestEmailChange = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) { setEmailErr('Email invalide.'); return; }
    setEmailLoad(true); setEmailErr('');
    try {
      await api.changeEmail({ newEmail: newEmail.trim() });
      setEmailStep('sent');
    } catch(e) { setEmailErr(e.message || 'Erreur'); }
    finally { setEmailLoad(false); }
  };

  const confirmEmailChange = async () => {
    if (!emailCode.trim()) { setEmailErr('Code requis.'); return; }
    setEmailLoad(true); setEmailErr('');
    try {
      await api.confirmChangeEmail({ code: emailCode.trim() });
      updateUser({ email: newEmail });
      setEmailStep('idle'); setNewEmail(''); setEmailCode('');
      showToast('Email mis a jour ✓');
    } catch(e) { setEmailErr(e.message || 'Code invalide'); }
    finally { setEmailLoad(false); }
  };

  const cardS = {
    borderRadius:16, background:theme.card,
    border:`1px solid ${theme.border}`, overflow:'hidden', marginBottom:12,
  };
  const sectionHead = {
    padding:'13px 18px', borderBottom:`1px solid ${theme.border}`,
    display:'flex', alignItems:'center', justifyContent:'space-between',
  };
  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:10, outline:'none',
    background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.04)',
    border:`1px solid ${theme.border}`, color:theme.text, fontSize:13,
    fontFamily:'inherit', boxSizing:'border-box',
  };
  const label = { display:'block', fontSize:11, fontWeight:700, color:theme.muted,
    marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em' };

  return (
    <div>

      {/* ── MON COMMERCE ── */}
      <div style={cardS}>
        <div style={sectionHead}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:42, height:42, borderRadius:12, flexShrink:0,
              background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontWeight:900, fontSize:17, color:theme.text }}>
              {(user?.businessName||'B').charAt(0).toUpperCase()}
            </div>
            <div>
              <p style={{ fontWeight:800, fontSize:14, color:theme.text, margin:'0 0 1px' }}>
                {user?.businessName}
              </p>
              <p style={{ fontSize:12, color:theme.muted, margin:0 }}>{user?.email}</p>
            </div>
          </div>
          {!editing && (
            <button onClick={()=>setEditing(true)}
              style={{ padding:'7px 14px', borderRadius:9, cursor:'pointer',
                background:'transparent', border:`1px solid ${theme.border}`,
                color:theme.muted, fontWeight:700, fontSize:12,
                display:'flex', alignItems:'center', gap:5 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{width:12,height:12}}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Modifier
            </button>
          )}
        </div>

        {editing ? (
          /* ── Formulaire édition ── */
          <div style={{ padding:18, display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <p style={label}>Nom du commerce *</p>
              <input value={form.businessName}
                onChange={e=>setForm(f=>({...f,businessName:e.target.value}))}
                placeholder="Nom de votre salon" style={inp}/>
            </div>
            <div>
              <p style={label}>Téléphone</p>
              <input type="tel" value={form.phone}
                onChange={e=>setForm(f=>({...f,phone:e.target.value}))}
                placeholder="06 00 00 00 00" style={inp}/>
            </div>
            <div>
              <p style={label}>Adresse (numéro + rue)</p>
              <input value={form.address}
                onChange={e=>setForm(f=>({...f,address:e.target.value}))}
                placeholder="12 rue de la Paix" style={inp}/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:10 }}>
              <div>
                <p style={label}>Code postal</p>
                <input value={form.postalCode}
                  onChange={e=>setForm(f=>({...f,postalCode:e.target.value}))}
                  placeholder="75001" style={inp}/>
              </div>
              <div>
                <p style={label}>Ville</p>
                <input value={form.city}
                  onChange={e=>setForm(f=>({...f,city:e.target.value}))}
                  placeholder="Paris" style={inp}/>
              </div>
            </div>
            <div>
              <p style={label}>Lien Google Business (avis)</p>
              <input type="url" value={form.googleBusinessUrl}
                onChange={e=>setForm(f=>({...f,googleBusinessUrl:e.target.value}))}
                placeholder="https://g.page/votre-salon" style={inp}/>
              <p style={{ fontSize:11, color:theme.dim, margin:'4px 0 0' }}>
                Affiché sur votre page de réservation pour rediriger vers vos avis Google.
              </p>
            </div>
            {profErr && <p style={{ fontSize:12, color:'#f87171', fontWeight:600, margin:0 }}>{profErr}</p>}
            <div style={{ display:'flex', gap:10, marginTop:4 }}>
              <button onClick={()=>{ setEditing(false); setProfErr(''); }}
                style={{ flex:1, padding:'11px', borderRadius:10, cursor:'pointer',
                  background:'transparent', border:`1px solid ${theme.border}`,
                  color:theme.muted, fontWeight:700, fontSize:13 }}>
                Annuler
              </button>
              <button onClick={saveProfile} disabled={profLoad}
                style={{ flex:2, padding:'11px', borderRadius:10, cursor:'pointer',
                  background:'#1a73e8',
                  color:'white', fontWeight:800, fontSize:13,
                  border:'none', opacity:profLoad?0.7:1 }}>
                {profLoad ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Affichage des infos ── */
          <div>
            {profOk && (
              <div style={{ margin:'12px 18px 0', padding:'10px 14px', borderRadius:9,
                background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)',
                color:'#16a34a', fontSize:13, fontWeight:700 }}>✓ {profOk}</div>
            )}
            {[
              ['Nom du commerce', user?.businessName || '-'],
              ['Télephone',       user?.phone        || '-'],
              ['Adresse',         user?.address      || '-'],
              ['Code postal',     user?.postalCode   || '-'],
              ['Ville',           user?.city         || '-'],
              ['Google Business', user?.googleBusinessUrl || '-'],
            ].map(([lbl, val], i) => (
              <div key={lbl} style={{ display:'flex', justifyContent:'space-between',
                alignItems:'center', padding:'11px 18px',
                borderTop:`1px solid ${theme.border}` }}>
                <span style={{ fontSize:12, color:theme.muted, fontWeight:600 }}>{lbl}</span>
                <span style={{ fontSize:13, fontWeight:700, color:theme.text,
                  maxWidth:200, overflow:'hidden', textOverflow:'ellipsis',
                  whiteSpace:'nowrap', textAlign:'right' }}>{val}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SÉCURITÉ : Mot de passe ── */}
      <div style={cardS}>
        <div style={{...sectionHead, justifyContent:'flex-start', gap:8 }}>
          <span style={{ fontSize:15 }}>🔑</span>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>Mot de passe</p>
        </div>
        <div style={{ padding:18, display:'flex', flexDirection:'column', gap:10 }}>
          {pwdOk && <p style={{ fontSize:12, color:'#4ade80', fontWeight:700 }}>✓ Mot de passe mis à jour</p>}
          {pwdErr && <p style={{ fontSize:12, color:'#f87171', fontWeight:700 }}>{pwdErr}</p>}
          {[
            ['Mot de passe actuel', 'old', 'password'],
            ['Nouveau mot de passe', 'new1', 'password'],
            ['Confirmer le nouveau', 'new2', 'password'],
          ].map(([lbl, key, type]) => (
            <div key={key}>
              <p style={label}>{lbl}</p>
              <input type={type} value={pwdForm[key]}
                onChange={e=>setPwdForm(p=>({...p,[key]:e.target.value}))}
                style={inp} placeholder="••••••••"/>
            </div>
          ))}
          <button onClick={changePassword} disabled={pwdLoad}
            style={{ padding:'11px 0', borderRadius:10, border:'none', cursor:'pointer',
              background:'#1a73e8', color:'white',
              fontWeight:800, fontSize:13, opacity:pwdLoad?0.7:1, marginTop:4 }}>
            {pwdLoad ? 'Mise a jour...' : 'Changer le mot de passe'}
          </button>
        </div>
      </div>

      {/* ── Email ── */}
      <div style={cardS}>
        <div style={{...sectionHead, justifyContent:'flex-start', gap:8 }}>
          <span style={{ fontSize:15 }}>📧</span>
          <p style={{ fontWeight:800, fontSize:13, color:theme.text, margin:0 }}>Adresse email</p>
        </div>
        <div style={{ padding:18, display:'flex', flexDirection:'column', gap:10 }}>
          <p style={{ fontSize:12, color:theme.muted, margin:0 }}>
            Actuel : <strong style={{ color:theme.text }}>{user?.email}</strong>
          </p>
          {emailErr && <p style={{ fontSize:12, color:'#f87171', fontWeight:700 }}>{emailErr}</p>}
          {emailStep === 'idle' && (
            <>
              <div>
                <p style={label}>Nouvel email</p>
                <input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)}
                  style={inp} placeholder="nouveau@email.com"/>
              </div>
              <button onClick={requestEmailChange} disabled={emailLoad}
                style={{ padding:'11px 0', borderRadius:10, border:`1px solid ${theme.border}`,
                  cursor:'pointer', background:'transparent', color:theme.text,
                  fontWeight:700, fontSize:13 }}>
                {emailLoad ? 'Envoi...' : 'Recevoir le code de confirmation'}
              </button>
            </>
          )}
          {emailStep === 'sent' && (
            <>
              <p style={{ fontSize:12, color:'#4ade80', fontWeight:700 }}>
                ✓ Code envoyé à {newEmail}
              </p>
              <div>
                <p style={label}>Code de confirmation</p>
                <input value={emailCode} onChange={e=>setEmailCode(e.target.value)}
                  style={inp} placeholder="000000"/>
              </div>
              <button onClick={confirmEmailChange} disabled={emailLoad}
                style={{ padding:'11px 0', borderRadius:10, border:'none', cursor:'pointer',
                  background:'#16a34a', color:'white', fontWeight:800, fontSize:13 }}>
                {emailLoad ? 'Verification...' : 'Confirmer'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Déconnexion ── */}
      <button onClick={() => { logout(); if(onLock) onLock(); }}
        style={{ width:'100%', padding:'14px', borderRadius:14,
          border:'1px solid rgba(248,113,113,0.25)',
          background:'rgba(248,113,113,0.07)', color:'#f87171',
          fontWeight:800, fontSize:14, cursor:'pointer' }}>
        Se déconnecter
      </button>
    </div>
  );
}