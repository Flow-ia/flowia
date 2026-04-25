import { useState, useEffect, useMemo } from 'react';
import { I } from '../../utils/icons';
import { Confirm } from '../../components/UI';
import { TransactionForm } from '../../components/Forms';
import { disp } from '../../utils/dates';
import { Card, nd, fmt, PAY_INFO } from './shared';
import { Button, SegmentedControl } from '../../components/primitives';

const PAGE_SIZE = 10;

export default function TabHistorique({ transactions, employees, categories, onUpdate, onDelete, showToast, theme }) {
  const t = theme;
  const [edit,   setEdit]   = useState(null);
  const [modal,  setModal]  = useState(false);
  const [delId,  setDelId]  = useState(null);
  const [search, setSearch] = useState('');
  const [typeF,  setTypeF]  = useState('all');
  const [page,   setPage]   = useState(0);

  const getEmp = id => employees.find(e => e.id === id);
  const getCat = id => categories.find(c => c.id === id);

  const filtered = useMemo(() => transactions.filter(tx => {
    if (typeF !== 'all' && tx.type !== typeF) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return getCat(tx.category_id)?.name?.toLowerCase().includes(q)
        || getEmp(tx.employee_id)?.name?.toLowerCase().includes(q)
        || tx.description?.toLowerCase().includes(q);
  }), [transactions, typeF, search, employees, categories]);

  useEffect(() => { setPage(0); }, [typeF, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe   = Math.min(page, totalPages - 1);
  const pagedItems = filtered.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Recherche */}
      <div style={{ position:'relative' }}>
        <I.Search style={{ width:14, height:14, position:'absolute', left:12, top:'50%',
                           transform:'translateY(-50%)', color:t.muted }}/>
        <input placeholder="Rechercher..." value={search}
               onChange={e => setSearch(e.target.value)}
               style={{ width:'100%', padding:'12px 36px', borderRadius:8,
                        background:t.card, border:`0.5px solid ${t.borderInput}`,
                        color:t.text, fontSize:14, fontFamily:'inherit', outline:'none',
                        boxSizing:'border-box',
                        transition:'border-color 0.15s ease, box-shadow 0.15s ease' }}
               onFocus={e => { e.currentTarget.style.borderColor = t.borderStrong;
                               e.currentTarget.style.boxShadow = `0 0 0 3px ${t.border}`; }}
               onBlur={e => { e.currentTarget.style.borderColor = t.borderInput;
                              e.currentTarget.style.boxShadow = 'none'; }}/>
        {search && (
          <button onClick={() => setSearch('')}
                  style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                           background:'none', border:'none', cursor:'pointer', padding:4,
                           fontFamily:'inherit' }}>
            <I.X style={{ width:14, height:14, color:t.muted }}/>
          </button>
        )}
      </div>

      <SegmentedControl fullWidth value={typeF} onChange={setTypeF}
                        options={[
                          { value:'all',     label:'Tout'     },
                          { value:'revenue', label:'Revenus'  },
                          { value:'expense', label:'Depenses' },
                        ]}/>

      <p style={{ fontSize:12, color:t.muted, padding:'0 4px', margin:0 }}>
        {filtered.length} transaction{filtered.length > 1 ? 's' : ''}
      </p>

      <Card theme={theme}>
        {filtered.length === 0 ? (
          <div style={{ padding:'56px 0', textAlign:'center' }}>
            <I.BarCh style={{ width:36, height:36, margin:'0 auto 10px', color:t.dim }}/>
            <p style={{ fontSize:13, color:t.muted, margin:0 }}>Aucune transaction</p>
          </div>
        ) : (
          <div>
            {pagedItems.map((tx, i) => {
              const cat = getCat(tx.category_id);
              const emp = getEmp(tx.employee_id);
              const isRev = tx.type === 'revenue';
              const pm = PAY_INFO[tx.payment_method] || PAY_INFO.other;
              const PmIc = pm.Ic;
              const hasItems    = Array.isArray(tx.items) && tx.items.length > 0;
              const hasPaySplit = Array.isArray(tx.payments) && tx.payments.length > 1;
              const iconBg      = isRev ? (tx.source === 'rdv' ? '#eef2ff' : t.cardAlt) : '#fef2f2';
              const iconColor   = isRev ? (tx.source === 'rdv' ? '#4338ca' : t.text)    : '#991b1b';
              const amountColor = isRev ? '#065f46' : '#991b1b';

              return (
                <div key={tx.id}
                     style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 16px',
                              borderBottom: i < pagedItems.length - 1 ? `0.5px solid ${t.separator}` : 'none' }}>
                  <div style={{ width:36, height:36, borderRadius:8, flexShrink:0, marginTop:2,
                                background:iconBg,
                                display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {tx.source === 'rdv'
                      ? <I.Calendar style={{ width:15, height:15, color:iconColor }}/>
                      : isRev
                        ? <I.ArrowUp style={{ width:15, height:15, color:iconColor }}/>
                        : <I.ArrowDown style={{ width:15, height:15, color:iconColor }}/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                  gap:8, marginBottom:4 }}>
                      <p style={{ fontSize:14, fontWeight:500, color:t.text, margin:0,
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                        {tx.source === 'rdv'
                          ? (tx.description || 'Encaissement RDV')
                          : (cat?.name || tx.description || 'Transaction')}
                      </p>
                      <span style={{ fontSize:15, fontWeight:500, fontFamily:"'DM Mono', monospace",
                                     color:amountColor, flexShrink:0 }}>
                        {isRev ? '+' : '-'}{fmt(tx.amount)} €
                      </span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, color:t.muted, flexShrink:0 }}>
                        {disp(nd(tx.date), 'short')}{tx.time ? ` · ${tx.time}` : ''}
                      </span>
                      {emp && <span style={{ fontSize:11, color:t.dim }}>·</span>}
                      {emp && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4,
                                       padding:'2px 8px 2px 3px', borderRadius:99,
                                       background:t.cardAlt,
                                       fontSize:11, fontWeight:500, color:t.text, flexShrink:0 }}>
                          <div style={{ width:14, height:14, borderRadius:6,
                                        backgroundColor: emp.avatar_color || t.text,
                                        display:'flex', alignItems:'center', justifyContent:'center',
                                        color:'white', fontSize:8, fontWeight:500 }}>
                            {emp.name?.charAt(0)?.toUpperCase()}
                          </div>
                          {emp.name}
                        </span>
                      )}
                      <span style={{ fontSize:11, color:t.dim }}>·</span>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:3,
                                     padding:'2px 8px', borderRadius:99,
                                     background:pm.bg, color:pm.color,
                                     fontSize:11, fontWeight:500, flexShrink:0 }}>
                        <PmIc style={{ width:10, height:10, color:pm.color, flexShrink:0 }}/>
                        {pm.label}
                      </span>
                      {tx.source === 'rdv' && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4,
                                       padding:'2px 8px', borderRadius:99,
                                       background:'#eef2ff', color:'#4338ca',
                                       fontSize:11, fontWeight:500, flexShrink:0 }}>
                          <I.Calendar style={{ width:10, height:10 }}/>
                          RDV
                        </span>
                      )}
                      {tx.client_email && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4,
                                       padding:'2px 8px', borderRadius:99,
                                       background:'#eef2ff', color:'#4338ca',
                                       fontSize:11, fontWeight:500, flexShrink:0 }}>
                          <I.User style={{ width:10, height:10 }}/>
                          {tx.client_email}
                        </span>
                      )}
                    </div>

                    {(hasItems || hasPaySplit) && (
                      <div style={{ marginTop:8, padding:'8px 10px', borderRadius:8,
                                    background:t.cardAlt,
                                    border:`0.5px solid ${t.border}` }}>
                        {hasItems && (
                          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                            {tx.items.map((it, idx) => {
                              const q  = parseInt(it.qty) || 1;
                              const up = parseFloat(it.unit_price) || 0;
                              return (
                                <div key={idx} style={{ display:'flex', justifyContent:'space-between',
                                                         fontSize:11, color:t.text, fontFamily:'monospace' }}>
                                  <span style={{ overflow:'hidden', textOverflow:'ellipsis',
                                                 whiteSpace:'nowrap' }}>
                                    {q} × {it.service_name}{' '}
                                    <span style={{ color:t.dim }}>@ {fmt(up)}€</span>
                                  </span>
                                  <span style={{ fontWeight:500, flexShrink:0, marginLeft:8 }}>
                                    {fmt(q * up)} €
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {hasPaySplit && (
                          <div style={{ marginTop: hasItems ? 6 : 0,
                                        paddingTop: hasItems ? 6 : 0,
                                        borderTop: hasItems ? `0.5px solid ${t.border}` : 'none',
                                        display:'flex', gap:6, flexWrap:'wrap' }}>
                            {tx.payments.map((p, idx) => {
                              const pi = PAY_INFO[p.method] || PAY_INFO.other;
                              return (
                                <span key={idx}
                                      style={{ display:'inline-flex', alignItems:'center', gap:3,
                                               padding:'2px 8px', borderRadius:99,
                                               background:pi.bg, color:pi.color,
                                               fontSize:11, fontWeight:500 }}>
                                  {pi.label} {fmt(p.amount)}€
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0,
                                marginTop:2, alignItems:'flex-end' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={() => { setEdit(tx); setModal(true); }} title="Modifier (admin)"
                              style={{ width:28, height:28, borderRadius:8, border:'none', cursor:'pointer',
                                       background:t.cardAlt,
                                       display:'flex', alignItems:'center', justifyContent:'center',
                                       fontFamily:'inherit' }}>
                        <I.Edit style={{ width:12, height:12, color:t.muted }}/>
                      </button>
                      <button onClick={() => setDelId(tx.id)} title="Supprimer (admin)"
                              style={{ width:28, height:28, borderRadius:8, border:'none', cursor:'pointer',
                                       background:'rgba(239,68,68,0.1)',
                                       display:'flex', alignItems:'center', justifyContent:'center',
                                       fontFamily:'inherit' }}>
                        <I.Trash style={{ width:12, height:12, color:'#991b1b' }}/>
                      </button>
                    </div>
                    <span style={{ fontSize:9, fontWeight:500,
                                   padding:'2px 7px', borderRadius:99,
                                   background:'#fffbeb', color:'#92400e' }}>
                      Audit
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {filtered.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
                      gap:10, padding:'8px 0 4px' }}>
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

      <TransactionForm open={modal} onClose={() => { setModal(false); setEdit(null); }}
                       onSubmit={async d => {
                         try {
                           if (edit) { await onUpdate(edit.id, d); showToast('Transaction modifiee'); }
                         } catch (e) {
                           if (e.code === 'ACTION_ADMIN_ONLY') showToast("Erreur d'autorisation, reconnectez-vous", 'error');
                           else showToast('Erreur lors de la modification', 'error');
                         }
                         setEdit(null); setModal(false);
                       }}
                       employees={employees} categories={categories} init={edit}/>
      <Confirm open={!!delId} onClose={() => setDelId(null)}
               onConfirm={async () => {
                 try {
                   await onDelete(delId);
                   showToast('Transaction supprimee');
                 } catch (e) {
                   if (e.code === 'ACTION_ADMIN_ONLY') showToast("Erreur d'autorisation, reconnectez-vous", 'error');
                   else showToast('Erreur lors de la suppression', 'error');
                 }
                 setDelId(null);
               }}
               title="Supprimer cette transaction ?"
               message={"Action admin irreversible — enregistree dans l'audit trail."}
               theme={theme}/>
    </div>
  );
}
