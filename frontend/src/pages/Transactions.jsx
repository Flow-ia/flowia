import { useState, useMemo, useEffect } from 'react';

const PAGE_SIZE = 10;
import { I, ICON_MAP } from '../utils/icons';
import { disp, todayStr } from '../utils/dates';
import { TransactionForm } from '../components/Forms';
import { Confirm } from '../components/UI';
import { useTheme, BRAND } from '../hooks/useTheme';
import { useEmployeePinGate } from '../components/EmployeePinModal';

const nd = d => { if (!d) return ''; const s = typeof d === 'string' ? d : new Date(d).toISOString(); return s.substring(0,10); };
const fmt = n => Number(n||0).toFixed(2);

const PM = {
  cash:     { label:'Especes',  color:'#10b981', bg:'rgba(16,185,129,0.14)', Ic: I.Wallet },
  card:     { label:'Carte',    color:'#111827', bg:'rgba(17,24,39,0.14)', Ic: I.CreditCard },
  transfer: { label:'Virement', color:'#374151', bg:'rgba(6,182,212,0.14)',  Ic: I.Bank },
  other:    { label:'Autre',    color:'#f59e0b', bg:'rgba(245,158,11,0.14)', Ic: I.MoreH },
};

function Av({ emp, size=34 }) {
  if (!emp) return null;
  return (
    <div style={{ width:size, height:size, borderRadius:size*0.38, backgroundColor:emp.avatar_color||'#111827', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:900, fontSize:size*0.45, flexShrink:0 }}>
      {emp.name?.charAt(0)?.toUpperCase()}
    </div>
  );
}

// ─── Ligne transaction avec paiement+employé EN GRAND avant le montant ────────
function TxRow({ tx, cat, emp, isLast, theme, onEdit, onDelete }) {
  const isDark = theme.mode === 'dark';
  const isRev  = tx.type === 'revenue';
  const isRdv  = tx.source === 'rdv';
  const revColor = isRdv ? '#a5a0ff' : '#111827';
  const revBg    = isRdv ? 'rgba(17,24,39,0.14)' : 'rgba(17,24,39,0.12)';
  const pm = PM[tx.payment_method] || PM.other;
  const PmIc = pm.Ic;
  const CatIcon = ICON_MAP[cat?.icon] || null;

  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px', borderBottom: isLast?'none':`1px solid ${theme.separator}`, fontFamily:"'DM Sans', sans-serif" }}>
      {/* Icône */}
      <div style={{ width:40, height:40, borderRadius:12, background: isRev?revBg:'rgba(239,68,68,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
        {isRdv ? <span style={{ fontSize:18 }}>📅</span>
          : CatIcon ? <CatIcon style={{ width:18, height:18, color: isRev?revColor:'#ef4444' }} />
          : isRev   ? <I.ArrowUp   style={{ width:18, height:18, color:revColor }} />
                    : <I.ArrowDown style={{ width:18, height:18, color:'#ef4444' }} />}
      </div>

      {/* Corps */}
      <div style={{ flex:1, minWidth:0 }}>
        {/* Ligne 1 : Nom service + Montant */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:5 }}>
          <p style={{ fontWeight:700, fontSize:14, color:theme.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, margin:0 }}>
            {isRdv ? (tx.description || 'Encaissement RDV') : (cat?.name || tx.description || (isRev?'Revenu':'Depense'))}
          </p>
          <span style={{ fontWeight:900, fontSize:17, fontFamily:"'DM Mono', monospace", color: isRev?revColor:'#ef4444', flexShrink:0 }}>
            {isRev?'+':'-'}{fmt(tx.amount)} €
          </span>
        </div>
        {/* Ligne 2 : Date · Employé · Paiement — tous sur la même ligne */}
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ fontSize:10, color:theme.muted, fontWeight:500, flexShrink:0 }}>
            {disp(nd(tx.date),'short')}{tx.time ? ` · ${tx.time}` : ''}
          </span>
          {emp && <span style={{ fontSize:10, color:theme.dim, flexShrink:0 }}>·</span>}
          {emp && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px 2px 4px', borderRadius:99, background: isDark?'rgba(255,255,255,0.09)':'rgba(0,0,0,0.06)', fontSize:11, fontWeight:700, color:theme.text, flexShrink:0 }}>
              <Av emp={emp} size={13} />
              {emp.name}
            </span>
          )}
          {emp && <span style={{ fontSize:10, color:theme.dim, flexShrink:0 }}>·</span>}
          <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:99, background:pm.bg, color:pm.color, fontSize:11, fontWeight:700, flexShrink:0 }}>
            <PmIc style={{ width:10, height:10, flexShrink:0 }} />
            {pm.label}
          </span>
          {tx.source === 'rdv' && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:99, background:'rgba(17,24,39,0.14)', color:'#a5a0ff', fontSize:11, fontWeight:800, flexShrink:0 }}>
              📅 RDV
            </span>
          )}
        </div>
      </div>

      {/* Actions admin — visibles uniquement si isAdmin via onEdit/onDelete */}
      {(onEdit || onDelete) ? (
        <div style={{ display:'flex', gap:4, flexShrink:0, marginTop:2 }}>
          {onEdit && (
            <button onClick={()=>onEdit(tx)} title="Modifier (admin)" style={{ width:30, height:30, borderRadius:9, background: isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.05)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <I.Edit style={{ width:12, height:12, color:theme.muted }} />
            </button>
          )}
          {onDelete && (
            <button onClick={()=>onDelete(tx.id)} title="Supprimer (admin)" style={{ width:30, height:30, borderRadius:9, background:'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <I.Trash style={{ width:12, height:12, color:'#ef4444' }} />
            </button>
          )}
        </div>
      ) : (
        /* Cadenas — transaction verrouillée (lecture seule pour les non-admins) */
        <div style={{ flexShrink:0, marginTop:4, opacity:0.3 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ width:13, height:13, color:theme.dim }}>
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
      )}
    </div>
  );
}
export default function Transactions({ transactions, employees, categories, onAdd, onUpdate, onDelete, isAdmin = false }) {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const { requestPin, PinModalNode } = useEmployeePinGate();

  const [modal, setModal]   = useState(false);
  const [edit,  setEdit]    = useState(null);
  const [delId, setDelId]   = useState(null);
  const [search, setSearch] = useState('');
  const [typeF, setTypeF]   = useState('all');
  const [payF, setPayF]     = useState('all');
  const [empF, setEmpF]     = useState('all');
  const [page, setPage]     = useState(0);

  const getEmp = id => employees.find(e=>e.id===id);
  const getCat = id => categories.find(c=>c.id===id);

  const todayOnly = !isAdmin; // employés : uniquement le jour en cours

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      // Restriction employé : uniquement aujourd'hui
      if (todayOnly) {
        const ds = nd(tx.date);
        if (ds !== todayStr()) return false;
      }
      if (typeF!=='all' && tx.type!==typeF) return false;
      if (payF!=='all' && tx.payment_method!==payF) return false;
      if (empF!=='all' && (tx.employee_id||'')!==empF) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return getCat(tx.category_id)?.name?.toLowerCase().includes(q)
        || getEmp(tx.employee_id)?.name?.toLowerCase().includes(q)
        || tx.description?.toLowerCase().includes(q);
    });
  }, [transactions, typeF, payF, empF, search, todayOnly]);

  // Pagination 10/page — reset à chaque changement de filtre
  useEffect(() => { setPage(0); }, [typeF, payF, empF, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe   = Math.min(page, totalPages - 1);
  const pagedItems = useMemo(
    () => filtered.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE),
    [filtered, pageSafe]
  );

  const groups = useMemo(() => {
    const g = {};
    pagedItems.forEach(tx => { const k = nd(tx.date)||'unknown'; (g[k]||(g[k]=[])).push(tx); });
    return Object.entries(g).sort((a,b)=>b[0].localeCompare(a[0]));
  }, [pagedItems]);

  const now = new Date();
  // Stats mensuelles (admin seulement)
  const monthRevs = isAdmin ? transactions.filter(t => {
    const ds=nd(t.date); if(!ds) return false;
    return parseInt(ds.substring(0,4))===now.getFullYear() && parseInt(ds.substring(5,7))-1===now.getMonth() && t.type==='revenue';
  }) : [];
  const monthCA  = monthRevs.reduce((s,t)=>s+(parseFloat(t.amount)||0),0);

  // Stats filtrées (pour employés = déjà restreint au jour J)
  const totRev   = filtered.filter(t=>t.type==='revenue').reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
  const totExp   = filtered.filter(t=>t.type==='expense').reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
  const todayKey = todayStr();

  const handleSubmit = async data => {
    const emp = employees?.find(e => e.id === data.employee_id);
    await requestPin(
      emp || null,
      data.employee_id ? 'Enregistrer la transaction' : null,
      async () => {
        if (edit) { await onUpdate(edit.id, data); } else { await onAdd(data); }
        setEdit(null); setModal(false);
      }
    );
  };

  const chip = (active, label, pm) => ({
    display:'inline-flex', alignItems:'center', gap:5,
    padding:'7px 14px', borderRadius:99, cursor:'pointer', border:'none',
    background: active ? (pm ? pm.bg : 'rgba(17,24,39,0.15)') : theme.inputBg,
    color:       active ? (pm ? pm.color : '#111827') : theme.muted,
    fontWeight: 700, fontSize: 12, flexShrink: 0,
    outline: active ? `1px solid ${pm?pm.color:'#111827'}` : `1px solid ${theme.border}`,
  });

  return (
    <div style={{ minHeight:'100vh', paddingBottom:120, background: isDark?'#111318':'#f8f9fc' }} className="lg:pb-8">

      {/* Header */}
      <div style={{ padding:'52px 20px 18px', background: isDark?'#111318':'#f8f9fc' }} className="lg:pt-8">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div>
            <p style={{ fontSize:11, fontWeight:600, letterSpacing:'0.02em', textTransform:'uppercase', color:theme.muted, marginBottom:5 }}>
              {isAdmin ? 'Administration' : 'Mon activite'}
            </p>
            <h1 style={{ fontFamily:"'Outfit',sans-serif", fontWeight:800, fontSize:26, lineHeight:1.1, letterSpacing:'-0.025em', color:theme.text }}>
              {isAdmin ? 'Transactions' : "Aujourd'hui"}
            </h1>
          </div>
          <div style={{
            width:40, height:40, borderRadius:12,
            background:'rgba(52,211,153,0.12)', border:'1px solid rgba(52,211,153,0.22)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <I.BarCh style={{ width:18, height:18, color:'#34d399' }}/>
          </div>
        </div>

        {/* CA principal — mensuel pour admin, jour pour employé */}
        <div style={{ borderRadius:20, padding:16, marginBottom:16, background: BRAND.gradGreen, boxShadow:'0 12px 36px rgba(16,185,129,0.3)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <p style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.12em', color:'rgba(255,255,255,0.7)' }}>
                {isAdmin
                  ? `CA ${now.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}`
                  : `CA du ${now.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}`}
              </p>
              <p style={{ fontWeight:900, fontSize:32, color:'white', fontFamily:'var(--mono)', marginTop:4 }}>
                {isAdmin ? fmt(monthCA) : fmt(totRev)} €
              </p>
              <p style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.7)', marginTop:2 }}>
                {isAdmin
                  ? `${monthRevs.length} prestation${monthRevs.length!==1?'s':''}`
                  : `${filtered.filter(t=>t.type==='revenue').length} prestation${filtered.filter(t=>t.type==='revenue').length!==1?'s':''}`}
              </p>
            </div>
            <div style={{ width:56, height:56, borderRadius:18, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <I.TrendUp style={{ width:26, height:26, color:'white' }} />
            </div>
          </div>
        </div>

        {/* Stats filtrées — labels adaptés selon le profil */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
          {[
            { l: isAdmin ? 'CA filtre'  : 'CA du jour',   v:`${fmt(totRev)} €`,  c:'#10b981', bg: isDark?'rgba(16,185,129,0.12)':'rgba(16,185,129,0.08)' },
            { l: isAdmin ? 'Depenses'   : 'Depenses auj.', v:`${fmt(totExp)} €`, c:'#ef4444', bg: isDark?'rgba(239,68,68,0.12)':'rgba(239,68,68,0.08)' },
            { l: isAdmin ? 'Nb total'   : 'Operations',    v: filtered.length,   c:'#111827', bg: isDark?'rgba(17,24,39,0.12)':'rgba(17,24,39,0.08)' },
          ].map(({l,v,c,bg}) => (
            <div key={l} style={{ borderRadius:16, padding:'12px', textAlign:'center', background:bg, border:`1px solid ${c}22` }}>
              <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:c, marginBottom:4 }}>{l}</p>
              <p style={{ fontWeight:900, fontSize:13, fontFamily:'var(--mono)', color:c }}>{v}</p>
            </div>
          ))}
        </div>

        {/* Recherche */}
        <div style={{ position:'relative', marginBottom:12 }}>
          <I.Search style={{ width:15, height:15, position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:theme.muted }} />
          <input placeholder="Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{ width:'100%', padding:'14px 40px', borderRadius:16, border:`1px solid ${theme.border}`, background: isDark?'#161620':'#ffffff', color:theme.text, fontSize:14, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
          {search && (
            <button onClick={()=>setSearch('')} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer' }}>
              <I.X style={{ width:14, height:14, color:theme.muted }} />
            </button>
          )}
        </div>

        {/* Type filter — admin uniquement */}
        {isAdmin && (
        <div style={{ display:'flex', gap:4, padding:4, borderRadius:14, background:theme.inputBg, marginBottom:10 }}>
          {[['all','Tous'],['revenue','Revenus'],['expense','Depenses']].map(([v,l]) => (
            <button key={v} onClick={()=>setTypeF(v)} className="pressable"
              style={{ flex:1, padding:'10px 8px', borderRadius:10, fontSize:12, fontWeight:700, border:'none', cursor:'pointer', background: typeF===v?(isDark?'#20202e':'#ffffff'):'transparent', color: typeF===v?theme.text:theme.muted, boxShadow: typeF===v&&!isDark?'0 1px 4px rgba(0,0,0,0.1)':'none' }}>
              {l}
            </button>
          ))}
        </div>
        )}

        {/* Filtres paiement — admin uniquement */}
        {isAdmin && (
          <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:6, scrollbarWidth:'none', marginBottom:8 }}>
            {[['all','Tout',null],['cash','Especes',PM.cash],['card','Carte',PM.card],['transfer','Virement',PM.transfer],['other','Autre',PM.other]].map(([v,l,pm]) => {
              const PmIc = pm?.Ic;
              return (
                <button key={v} onClick={()=>setPayF(v)} className="pressable"
                  style={chip(payF===v, l, pm)}>
                  {PmIc && <PmIc style={{ width:11, height:11 }} />}
                  {l}
                </button>
              );
            })}
          </div>
        )}

        {/* Filtres employés — admin uniquement */}
        {isAdmin && employees.length > 0 && (
          <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4, scrollbarWidth:'none' }}>
            <button onClick={()=>setEmpF('all')} className="pressable"
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:99, background: empF==='all'?BRAND.grad:theme.inputBg, color: empF==='all'?'#ffffff':theme.muted, fontWeight:700, fontSize:12, border:'none', cursor:'pointer', flexShrink:0 }}>
              <I.Users style={{ width:11, height:11 }} /> Tous
            </button>
            {employees.map(emp => {
              const active = empF===emp.id;
              return (
                <button key={emp.id} onClick={()=>setEmpF(active?'all':emp.id)} className="pressable"
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:99, background: active?(emp.avatar_color||'#111827'):theme.inputBg, color: active?'#ffffff':theme.muted, fontWeight:700, fontSize:12, border:'none', cursor:'pointer', flexShrink:0 }}>
                  <div style={{ width:16, height:16, borderRadius:8, background: active?'rgba(255,255,255,0.3)':(emp.avatar_color||'#111827'), display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:8, fontWeight:900 }}>
                    {emp.name?.charAt(0)?.toUpperCase()}
                  </div>
                  {emp.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Liste groupée */}
      <div style={{ padding:'0 16px', display:'flex', flexDirection:'column', gap:20, marginTop:16 }}>
        {groups.length===0 ? (
          <div style={{ borderRadius:24, padding:'80px 0', textAlign:'center', background: isDark?'#161620':'#ffffff', border:`1px solid ${theme.border}` }}>
            <I.BarCh style={{ width:40, height:40, color:theme.dim, margin:'0 auto 12px' }} />
            <p style={{ fontWeight:700, color:theme.muted }}>Aucune transaction</p>
            <p style={{ fontSize:13, color:theme.dim, marginTop:4 }}>Modifiez vos filtres</p>
          </div>
        ) : groups.map(([dateKey, txs]) => {
          const dayRev = txs.filter(t=>t.type==='revenue').reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
          const dayExp = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
          const isToday = dateKey===todayKey;

          return (
            <div key={dateKey}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, padding:'0 4px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:12, fontWeight:800, color: isToday?'#111827':theme.muted }}>
                    {isToday ? "Aujourd'hui" : disp(dateKey,'long')}
                  </span>
                  {isToday && <span style={{ width:6, height:6, borderRadius:3, background:'#4ade80', flexShrink:0, display:'inline-block' }} />}
                </div>
                <div style={{ display:'flex', gap:10, fontSize:12, fontWeight:800 }}>
                  {dayRev > 0 && <span style={{ color:'#10b981', fontFamily:'var(--mono)' }}>+{fmt(dayRev)} €</span>}
                  {dayExp > 0 && <span style={{ color:'#ef4444', fontFamily:'var(--mono)' }}>-{fmt(dayExp)} €</span>}
                </div>
              </div>
              <div style={{ borderRadius:24, overflow:'hidden', background: isDark?'#161620':'#ffffff', border:`1px solid ${theme.border}`, boxShadow: isDark?'none':'0 2px 12px rgba(0,0,0,0.05)' }}>
                {txs.map((tx, i) => (
                  <TxRow key={tx.id} tx={tx} cat={getCat(tx.category_id)} emp={getEmp(tx.employee_id)} isLast={i===txs.length-1} theme={theme}
                    onEdit={isAdmin ? (t => { setEdit(t); setModal(true); }) : null}
                    onDelete={isAdmin ? (id => setDelId(id)) : null}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination 10 par page */}
      {filtered.length > PAGE_SIZE && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'24px 16px 8px' }}>
          <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={pageSafe===0}
            style={{ padding:'8px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background: isDark?'#161620':'#ffffff', color: pageSafe===0?theme.dim:theme.text, fontWeight:700, fontSize:13, cursor: pageSafe===0?'default':'pointer', opacity: pageSafe===0?0.5:1 }}>
            ‹ Préc.
          </button>
          <span style={{ fontSize:13, fontWeight:700, color:theme.muted, minWidth:80, textAlign:'center' }}>
            Page {pageSafe + 1} / {totalPages}
          </span>
          <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={pageSafe>=totalPages-1}
            style={{ padding:'8px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background: isDark?'#161620':'#ffffff', color: pageSafe>=totalPages-1?theme.dim:theme.text, fontWeight:700, fontSize:13, cursor: pageSafe>=totalPages-1?'default':'pointer', opacity: pageSafe>=totalPages-1?0.5:1 }}>
            Suiv. ›
          </button>
        </div>
      )}

      {/* FAB */}
      <button onClick={()=>{setEdit(null); setModal(true);}} className="pressable"
        style={{ position:'fixed', bottom:112, right:16, width:56, height:56, borderRadius:28, background:BRAND.grad, display:'flex', alignItems:'center', justifyContent:'center', color:'white', zIndex:20, border:'none', cursor:'pointer', boxShadow:'0 8px 28px rgba(17,24,39,0.45)' }}>
        <I.Plus style={{ width:26, height:26 }} />
      </button>

      <TransactionForm open={modal} onClose={()=>{setModal(false); setEdit(null);}} onSubmit={handleSubmit} employees={employees} categories={categories} init={edit} />
      <Confirm open={!!delId} onClose={()=>setDelId(null)} onConfirm={()=>{onDelete(delId); setDelId(null);}} title="Supprimer cette transaction ?" desc="Cette action est irréversible." theme={theme} />
      {PinModalNode}
    </div>
  );
}
