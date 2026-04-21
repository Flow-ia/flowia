import { useState, useMemo, useEffect } from 'react';

const PAGE_SIZE = 10;
import { I, ICON_MAP } from '../utils/icons';
import { disp, todayStr } from '../utils/dates';
import { TransactionForm } from '../components/Forms';
import { Confirm } from '../components/UI';
import { useTheme } from '../hooks/useTheme';
import { useEmployeePinGate } from '../components/EmployeePinModal';
import { Button, SegmentedControl, StatusBadge } from '../components/primitives';

const nd  = d => { if (!d) return ''; const s = typeof d === 'string' ? d : new Date(d).toISOString(); return s.substring(0, 10); };
const fmt = n => Number(n || 0).toFixed(2);

// Moyens de paiement — pastels sobres (bg + accent meme famille)
const PM = {
  cash:     { label:'Especes',  color:'#065f46', bg:'#f0fdf4', Ic:I.Wallet     },
  card:     { label:'Carte',    color:'#4338ca', bg:'#eef2ff', Ic:I.CreditCard },
  transfer: { label:'Virement', color:'#0e7490', bg:'#ecfeff', Ic:I.Bank       },
  other:    { label:'Autre',    color:'#92400e', bg:'#fffbeb', Ic:I.MoreH      },
  multi:    { label:'Mixte',    color:'#3c3489', bg:'#eeedfe', Ic:I.MoreH      },
};

function Av({ emp, size = 34 }) {
  if (!emp) return null;
  return (
    <div style={{ width:size, height:size, borderRadius: Math.max(6, Math.round(size * 0.28)),
                  backgroundColor:emp.avatar_color || '#111827',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:'white', fontWeight:500, fontSize:Math.round(size * 0.42),
                  flexShrink:0 }}>
      {emp.name?.charAt(0)?.toUpperCase()}
    </div>
  );
}

// ─── Ligne transaction ────────────────────────────────────────────────────────
function TxRow({ tx, cat, emp, isLast, theme: t, onEdit, onDelete }) {
  const isRev    = tx.type === 'revenue';
  const isRdv    = tx.source === 'rdv';
  const pm       = PM[tx.payment_method] || PM.other;
  const PmIc     = pm.Ic;
  const CatIcon  = ICON_MAP[cat?.icon] || null;

  const iconBg    = isRev ? (isRdv ? '#eef2ff' : t.cardAlt) : '#fef2f2';
  const iconColor = isRev ? (isRdv ? '#4338ca' : t.text)    : '#991b1b';
  const amountColor = isRev ? '#065f46' : '#991b1b';

  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10,
                  padding:'12px 16px',
                  borderBottom: isLast ? 'none' : `0.5px solid ${t.separator}` }}>
      {/* Icone categorie / type */}
      <div style={{ width:40, height:40, borderRadius:8, background:iconBg,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    flexShrink:0, marginTop:2 }}>
        {isRdv ? <I.Calendar style={{ width:18, height:18, color:iconColor }}/>
          : CatIcon ? <CatIcon style={{ width:18, height:18, color:iconColor }}/>
          : isRev   ? <I.ArrowUp   style={{ width:18, height:18, color:iconColor }}/>
                    : <I.ArrowDown style={{ width:18, height:18, color:iconColor }}/>}
      </div>

      {/* Corps */}
      <div style={{ flex:1, minWidth:0 }}>
        {/* Ligne 1 : nom + montant */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:5 }}>
          <p style={{ fontWeight:500, fontSize:14, color:t.text,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      flex:1, margin:0 }}>
            {isRdv ? (tx.description || 'Encaissement RDV')
                   : (cat?.name || tx.description || (isRev ? 'Revenu' : 'Depense'))}
          </p>
          <span style={{ fontWeight:500, fontSize:16, fontFamily:"'DM Mono', monospace",
                         color:amountColor, flexShrink:0 }}>
            {isRev ? '+' : '-'}{fmt(tx.amount)} €
          </span>
        </div>

        {/* Details items (chaque unite = ligne) */}
        {Array.isArray(tx.items) && tx.items.length > 0 && (tx.items.length > 1 || (tx.items[0].qty || 1) > 1) && (
          <div style={{ display:'flex', flexDirection:'column', gap:2, marginBottom:5, paddingLeft:2 }}>
            {tx.items.flatMap((it, i) =>
              Array.from({ length: Math.max(1, parseInt(it.qty) || 1) }, (_, k) => (
                <div key={`${i}-${k}`} style={{ fontSize:11, color:t.muted,
                                                display:'flex', gap:6, alignItems:'baseline' }}>
                  <span style={{ color:t.dim }}>•</span>
                  <span style={{ fontWeight:500 }}>{it.service_name}</span>
                  <span style={{ color:t.dim, fontFamily:'var(--mono)' }}>— {fmt(it.unit_price)} €</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Ligne 2 : date · employe · paiement · flags */}
        <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:t.muted, flexShrink:0 }}>
            {disp(nd(tx.date), 'short')}{tx.time ? ` · ${tx.time}` : ''}
          </span>
          {emp && <span style={{ fontSize:11, color:t.dim, flexShrink:0 }}>·</span>}
          {emp && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:5,
                           padding:'2px 8px 2px 3px', borderRadius:99,
                           background:t.cardAlt,
                           fontSize:11, fontWeight:500, color:t.text, flexShrink:0 }}>
              <Av emp={emp} size={14}/>
              {emp.name}
            </span>
          )}
          {emp && <span style={{ fontSize:11, color:t.dim, flexShrink:0 }}>·</span>}
          {tx.payment_method === 'multi' && Array.isArray(tx.payments) && tx.payments.length > 0 ? (
            <div style={{ display:'inline-flex', flexWrap:'wrap', gap:3, alignItems:'center', minWidth:0 }}>
              {tx.payments.map((p, i) => {
                const sub = PM[p.method] || PM.other;
                const SIc = sub.Ic;
                return (
                  <span key={i} title={`${sub.label} : ${fmt(p.amount)} €`}
                        style={{ display:'inline-flex', alignItems:'center', gap:3,
                                 padding:'2px 7px', borderRadius:99,
                                 background:sub.bg, color:sub.color,
                                 fontSize:10, fontWeight:500, flexShrink:0 }}>
                    <SIc style={{ width:9, height:9, flexShrink:0 }}/>
                    {fmt(p.amount)} €
                  </span>
                );
              })}
            </div>
          ) : (
            <span style={{ display:'inline-flex', alignItems:'center', gap:4,
                           padding:'2px 8px', borderRadius:99,
                           background:pm.bg, color:pm.color,
                           fontSize:11, fontWeight:500, flexShrink:0 }}>
              <PmIc style={{ width:10, height:10, flexShrink:0 }}/>
              {pm.label}
            </span>
          )}
          {tx.source === 'rdv' && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:4,
                           padding:'2px 8px', borderRadius:99,
                           background:'#eef2ff', color:'#4338ca',
                           fontSize:11, fontWeight:500, flexShrink:0 }}>
              <I.Calendar style={{ width:10, height:10, flexShrink:0 }}/>
              RDV
            </span>
          )}
          {tx.referral_use_id && (() => {
            const parrain = [tx.referral_parrain_first_name, tx.referral_parrain_last_name].filter(Boolean).join(' ')
                         || tx.referral_parrain_email || 'parrain';
            const st = tx.referral_status || 'pending';
            const palette = st === 'validated'
              ? { bg:'#f0fdf4', fg:'#065f46' }
              : st === 'cancelled'
                ? { bg:'#fef2f2', fg:'#991b1b' }
                : { bg:'#eeedfe', fg:'#3c3489' };
            return (
              <span title={`Parrainage par ${parrain}`}
                    style={{ display:'inline-flex', alignItems:'center', gap:4,
                             padding:'2px 8px', borderRadius:99,
                             background:palette.bg, color:palette.fg,
                             fontSize:11, fontWeight:500, flexShrink:0 }}>
                <I.Heart style={{ width:10, height:10, flexShrink:0 }}/>
                Parrainage · {parrain}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Actions admin (edit/delete) ou cadenas */}
      {(onEdit || onDelete) ? (
        <div style={{ display:'flex', gap:4, flexShrink:0, marginTop:2 }}>
          {onEdit && (
            <button onClick={() => onEdit(tx)} title="Modifier (admin)"
                    style={{ width:30, height:30, borderRadius:8, border:'none', cursor:'pointer',
                             background:t.cardAlt, display:'flex', alignItems:'center', justifyContent:'center',
                             fontFamily:'inherit' }}>
              <I.Edit style={{ width:12, height:12, color:t.muted }}/>
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(tx.id)} title="Supprimer (admin)"
                    style={{ width:30, height:30, borderRadius:8, border:'none', cursor:'pointer',
                             background:'rgba(239,68,68,0.1)',
                             display:'flex', alignItems:'center', justifyContent:'center',
                             fontFamily:'inherit' }}>
              <I.Trash style={{ width:12, height:12, color:'#991b1b' }}/>
            </button>
          )}
        </div>
      ) : (
        <div style={{ flexShrink:0, marginTop:4, opacity:0.35 }}>
          <I.Lock style={{ width:13, height:13, color:t.dim }}/>
        </div>
      )}
    </div>
  );
}

export default function Transactions({ transactions, employees, categories, onAdd, onUpdate, onDelete, isAdmin = false }) {
  const { theme } = useTheme();
  const t = theme;
  const { requestPin, PinModalNode } = useEmployeePinGate();

  const [modal,  setModal]  = useState(false);
  const [edit,   setEdit]   = useState(null);
  const [delId,  setDelId]  = useState(null);
  const [search, setSearch] = useState('');
  const [typeF,  setTypeF]  = useState('all');
  const [payF,   setPayF]   = useState('all');
  const [empF,   setEmpF]   = useState('all');
  const [page,   setPage]   = useState(0);

  const getEmp = id => employees.find(e => e.id === id);
  const getCat = id => categories.find(c => c.id === id);

  const todayOnly = !isAdmin;

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (todayOnly) {
        const ds = nd(tx.date);
        if (ds !== todayStr()) return false;
      }
      if (typeF !== 'all' && tx.type !== typeF) return false;
      if (payF !== 'all') {
        if (tx.payment_method === 'multi') {
          if (payF === 'multi') { /* ok */ }
          else if (!Array.isArray(tx.payments) || !tx.payments.some(p => p.method === payF)) return false;
        } else if (tx.payment_method !== payF) return false;
      }
      if (empF !== 'all' && (tx.employee_id || '') !== empF) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return getCat(tx.category_id)?.name?.toLowerCase().includes(q)
          || getEmp(tx.employee_id)?.name?.toLowerCase().includes(q)
          || tx.description?.toLowerCase().includes(q);
    });
  }, [transactions, typeF, payF, empF, search, todayOnly]);

  useEffect(() => { setPage(0); }, [typeF, payF, empF, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe   = Math.min(page, totalPages - 1);
  const pagedItems = useMemo(
    () => filtered.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE),
    [filtered, pageSafe]
  );

  const groups = useMemo(() => {
    const g = {};
    pagedItems.forEach(tx => { const k = nd(tx.date) || 'unknown'; (g[k] || (g[k] = [])).push(tx); });
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [pagedItems]);

  const now = new Date();
  const monthRevs = isAdmin ? transactions.filter(tx => {
    const ds = nd(tx.date); if (!ds) return false;
    return parseInt(ds.substring(0,4)) === now.getFullYear()
        && parseInt(ds.substring(5,7)) - 1 === now.getMonth()
        && tx.type === 'revenue';
  }) : [];
  const monthCA = monthRevs.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);

  const totRev   = filtered.filter(tx => tx.type === 'revenue').reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
  const totExp   = filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
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

  // Chip helper pour filtres paiement (pastel actif)
  const chipStyle = (active, pm) => ({
    display:'inline-flex', alignItems:'center', gap:5,
    padding:'7px 14px', borderRadius:99, cursor:'pointer',
    fontWeight:500, fontSize:12, flexShrink:0, fontFamily:'inherit',
    background: active ? (pm ? pm.bg : t.cardAlt) : 'transparent',
    color:      active ? (pm ? pm.color : t.text) : t.muted,
    border: `0.5px solid ${active ? (pm ? pm.bg : t.borderStrong) : t.border}`,
  });

  return (
    <div style={{ minHeight:'100vh', paddingBottom:120, background:t.bg }} className="lg:pb-8">

      {/* Header */}
      <div style={{ padding:'52px 20px 18px' }} className="lg:pt-8">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div>
            <p style={{ fontSize:12, color:t.muted, margin:'0 0 4px' }}>
              {isAdmin ? 'Administration' : 'Mon activite'}
            </p>
            <h1 style={{ fontSize:22, fontWeight:500, color:t.text, margin:0 }}>
              {isAdmin ? 'Transactions' : "Aujourd'hui"}
            </h1>
          </div>
          <div style={{ width:40, height:40, borderRadius:8,
                        background:'#f0fdf4',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
            <I.BarCh style={{ width:18, height:18, color:'#065f46' }}/>
          </div>
        </div>

        {/* CA principal — carte sobre, accent pastel */}
        <div style={{ borderRadius:12, padding:18, marginBottom:16,
                      background:'#f0fdf4',
                      border:'0.5px solid rgba(16,185,129,0.25)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <p style={{ fontSize:12, color:'#065f46', opacity:0.75, margin:'0 0 4px' }}>
                {isAdmin
                  ? `CA ${now.toLocaleDateString('fr-FR', { month:'long', year:'numeric' })}`
                  : `CA du ${now.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}`}
              </p>
              <p style={{ fontWeight:500, fontSize:30, color:'#065f46',
                          fontFamily:'var(--mono)', margin:'0 0 4px', letterSpacing:'-0.01em' }}>
                {isAdmin ? fmt(monthCA) : fmt(totRev)} €
              </p>
              <p style={{ fontSize:12, color:'#065f46', opacity:0.75, margin:0 }}>
                {isAdmin
                  ? `${monthRevs.length} prestation${monthRevs.length !== 1 ? 's' : ''}`
                  : `${filtered.filter(tx => tx.type === 'revenue').length} prestation${filtered.filter(tx => tx.type === 'revenue').length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div style={{ width:48, height:48, borderRadius:12,
                          background:'rgba(16,185,129,0.15)',
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
              <I.TrendUp style={{ width:22, height:22, color:'#065f46' }}/>
            </div>
          </div>
        </div>

        {/* Stats filtrees */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
          {[
            { l: isAdmin ? 'CA filtre'  : 'CA du jour',    v:`${fmt(totRev)} €`, bg:'#f0fdf4', c:'#065f46' },
            { l: isAdmin ? 'Depenses'   : 'Depenses auj.', v:`${fmt(totExp)} €`, bg:'#fef2f2', c:'#991b1b' },
            { l: isAdmin ? 'Nb total'   : 'Operations',    v: filtered.length,    bg:t.cardAlt, c:t.text   },
          ].map(({ l, v, bg, c }) => (
            <div key={l} style={{ borderRadius:8, padding:12, textAlign:'center', background:bg }}>
              <p style={{ fontSize:11, color:c, opacity:0.75, margin:'0 0 4px' }}>{l}</p>
              <p style={{ fontWeight:500, fontSize:14, fontFamily:'var(--mono)', color:c, margin:0 }}>
                {v}
              </p>
            </div>
          ))}
        </div>

        {/* Recherche */}
        <div style={{ position:'relative', marginBottom:12 }}>
          <I.Search style={{ width:15, height:15, position:'absolute', left:12, top:'50%',
                             transform:'translateY(-50%)', color:t.muted }}/>
          <input placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
                 style={{ width:'100%', padding:'12px 40px', borderRadius:8,
                          border:`0.5px solid ${t.borderInput}`,
                          background:t.inputBg, color:t.text, fontSize:14,
                          fontFamily:'inherit', outline:'none', boxSizing:'border-box',
                          transition:'border-color 0.15s ease, box-shadow 0.15s ease' }}
                 onFocus={e => { e.currentTarget.style.borderColor = t.borderStrong;
                                 e.currentTarget.style.boxShadow = `0 0 0 3px ${t.border}`; }}
                 onBlur={e  => { e.currentTarget.style.borderColor = t.borderInput;
                                 e.currentTarget.style.boxShadow = 'none'; }}/>
          {search && (
            <button onClick={() => setSearch('')}
                    style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                             background:'none', border:'none', cursor:'pointer', padding:4, fontFamily:'inherit' }}>
              <I.X style={{ width:14, height:14, color:t.muted }}/>
            </button>
          )}
        </div>

        {/* Filtre type — admin uniquement */}
        {isAdmin && (
          <div style={{ marginBottom:10 }}>
            <SegmentedControl fullWidth value={typeF} onChange={setTypeF}
                              options={[
                                { value:'all',     label:'Tous'     },
                                { value:'revenue', label:'Revenus'  },
                                { value:'expense', label:'Depenses' },
                              ]}/>
          </div>
        )}

        {/* Filtres paiement — admin uniquement */}
        {isAdmin && (
          <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:6,
                        scrollbarWidth:'none', marginBottom:8 }}>
            {[
              ['all',      'Tout',     null],
              ['cash',     'Especes',  PM.cash    ],
              ['card',     'Carte',    PM.card    ],
              ['transfer', 'Virement', PM.transfer],
              ['multi',    'Mixte',    PM.multi   ],
              ['other',    'Autre',    PM.other   ],
            ].map(([v, l, pm]) => {
              const PmIc = pm?.Ic;
              return (
                <button key={v} onClick={() => setPayF(v)} className="pressable"
                        style={chipStyle(payF === v, pm)}>
                  {PmIc && <PmIc style={{ width:11, height:11 }}/>}
                  {l}
                </button>
              );
            })}
          </div>
        )}

        {/* Filtres employes — admin uniquement */}
        {isAdmin && employees.length > 0 && (
          <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4, scrollbarWidth:'none' }}>
            <button onClick={() => setEmpF('all')} className="pressable"
                    style={{ display:'flex', alignItems:'center', gap:6,
                             padding:'7px 14px', borderRadius:99,
                             background: empF === 'all' ? t.text : 'transparent',
                             color:      empF === 'all' ? t.bg   : t.muted,
                             fontWeight:500, fontSize:12, flexShrink:0,
                             border:`0.5px solid ${empF === 'all' ? t.text : t.border}`,
                             cursor:'pointer', fontFamily:'inherit' }}>
              <I.Users style={{ width:11, height:11 }}/>
              Tous
            </button>
            {employees.map(emp => {
              const active = empF === emp.id;
              return (
                <button key={emp.id} onClick={() => setEmpF(active ? 'all' : emp.id)} className="pressable"
                        style={{ display:'flex', alignItems:'center', gap:6,
                                 padding:'7px 12px 7px 6px', borderRadius:99,
                                 background: active ? (emp.avatar_color || t.text) : 'transparent',
                                 color:      active ? '#ffffff' : t.muted,
                                 fontWeight:500, fontSize:12, flexShrink:0,
                                 border:`0.5px solid ${active ? (emp.avatar_color || t.text) : t.border}`,
                                 cursor:'pointer', fontFamily:'inherit' }}>
                  <div style={{ width:16, height:16, borderRadius:6,
                                background: active ? 'rgba(255,255,255,0.3)' : (emp.avatar_color || t.text),
                                display:'flex', alignItems:'center', justifyContent:'center',
                                color:'white', fontSize:9, fontWeight:500 }}>
                    {emp.name?.charAt(0)?.toUpperCase()}
                  </div>
                  {emp.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Liste groupee */}
      <div style={{ padding:'0 16px', display:'flex', flexDirection:'column', gap:20, marginTop:16 }}>
        {groups.length === 0 ? (
          <div style={{ borderRadius:12, padding:'64px 0', textAlign:'center',
                        background:t.card, border:`0.5px solid ${t.border}` }}>
            <I.BarCh style={{ width:36, height:36, color:t.dim, display:'block', margin:'0 auto 10px' }}/>
            <p style={{ fontWeight:500, color:t.muted, margin:0 }}>Aucune transaction</p>
            <p style={{ fontSize:13, color:t.dim, margin:'4px 0 0' }}>Modifiez vos filtres</p>
          </div>
        ) : groups.map(([dateKey, txs]) => {
          const dayRev  = txs.filter(tx => tx.type === 'revenue').reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
          const dayExp  = txs.filter(tx => tx.type === 'expense').reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
          const isToday = dateKey === todayKey;

          return (
            <div key={dateKey}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                            marginBottom:8, padding:'0 4px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:12, fontWeight:500, color: isToday ? t.text : t.muted }}>
                    {isToday ? "Aujourd'hui" : disp(dateKey, 'long')}
                  </span>
                  {isToday && <span style={{ width:6, height:6, borderRadius:'50%', background:'#10b981', flexShrink:0, display:'inline-block' }}/>}
                </div>
                <div style={{ display:'flex', gap:10, fontSize:12, fontWeight:500 }}>
                  {dayRev > 0 && <span style={{ color:'#065f46', fontFamily:'var(--mono)' }}>+{fmt(dayRev)} €</span>}
                  {dayExp > 0 && <span style={{ color:'#991b1b', fontFamily:'var(--mono)' }}>-{fmt(dayExp)} €</span>}
                </div>
              </div>
              <div style={{ borderRadius:12, overflow:'hidden',
                            background:t.card, border:`0.5px solid ${t.border}` }}>
                {txs.map((tx, i) => (
                  <TxRow key={tx.id} tx={tx}
                         cat={getCat(tx.category_id)} emp={getEmp(tx.employee_id)}
                         isLast={i === txs.length - 1} theme={t}
                         onEdit={isAdmin ? (tr => { setEdit(tr); setModal(true); }) : null}
                         onDelete={isAdmin ? (id => setDelId(id)) : null}/>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {filtered.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                      padding:'24px 16px 8px' }}>
          <Button variant="secondary" size="small" type="button"
                  disabled={pageSafe === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}>
            ‹ Prec.
          </Button>
          <span style={{ fontSize:13, fontWeight:500, color:t.muted,
                         minWidth:80, textAlign:'center' }}>
            Page {pageSafe + 1} / {totalPages}
          </span>
          <Button variant="secondary" size="small" type="button"
                  disabled={pageSafe >= totalPages - 1}
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>
            Suiv. ›
          </Button>
        </div>
      )}

      {/* FAB — CTA primary sobre */}
      <button onClick={() => { setEdit(null); setModal(true); }} className="pressable"
              title="Nouvelle transaction"
              style={{ position:'fixed', bottom:112, right:16,
                       width:56, height:56, borderRadius:'50%',
                       background:t.text, color:t.bg,
                       display:'flex', alignItems:'center', justifyContent:'center',
                       zIndex:20, border:'none', cursor:'pointer',
                       boxShadow:t.shadowLg, fontFamily:'inherit' }}>
        <I.Plus style={{ width:24, height:24 }}/>
      </button>

      <TransactionForm open={modal} onClose={() => { setModal(false); setEdit(null); }}
                       onSubmit={handleSubmit} employees={employees} categories={categories} init={edit}/>
      <Confirm open={!!delId} onClose={() => setDelId(null)}
               onConfirm={() => { onDelete(delId); setDelId(null); }}
               title="Supprimer cette transaction ?"
               message="Cette action est irreversible."
               theme={theme}/>
      {PinModalNode}
    </div>
  );
}
