import { useState } from 'react';
import { I } from '../../utils/icons';
import { Confirm } from '../../components/UI';
import { TransactionForm } from '../../components/Forms';
import { disp } from '../../utils/dates';
import { Card, nd, fmt, PAY_INFO } from './shared';

export default function TabHistorique({ transactions, employees, categories, onUpdate, onDelete, showToast, theme }) {
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
                  <div className="flex-1 min-w-0">
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:4 }}>
                      <p className="text-sm font-semibold truncate flex-1" style={{ color: theme.text }}>{tx.source==='rdv' ? (tx.description || 'Encaissement RDV') : (cat?.name || tx.description || 'Transaction')}</p>
                      <span style={{ fontWeight:900, fontSize:16, fontFamily:"'DM Mono', monospace", color: isRev ? '#a5a0ff' : '#f87171', flexShrink:0 }}>
                        {isRev?'+':'-'}{fmt(tx.amount)} €
                      </span>
                    </div>
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
