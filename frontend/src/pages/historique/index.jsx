// Historique admin — refonte FDS-2026 commit 7h, simplifié au commit 16,
// affiné UX au commit 21.
//
// Page dédiée à la consultation/édition/suppression de TOUTES les transactions,
// toutes dates. Accessible depuis la sidebar Principal (entre Caisse et Clients).
//
// Commit 21 :
//   - Filtre période par défaut : Aujourd'hui (au lieu de 30 jours)
//   - Présets "Aujourd'hui / Cette semaine / Ce mois / Personnaliser"
//   - Filtres "Moyen de paiement" + "Employé" regroupés dans 1 carte 2 colonnes
//   - Renommage textes "tx" → "Transaction" / "Réf : T-…"
//   - Snapshot pastel en haut de la modale Modifier (figé à l'ouverture)
import { useEffect, useMemo, useState } from 'react';
import { I } from '../../utils/icons';
import { Confirm } from '../../components/UI';
import { TransactionForm } from '../../components/Forms';
import { disp } from '../../utils/dates';
import { Card, nd, fmt, PAY_INFO, PAY_KEYS } from '../settings/shared';
import { Button, SegmentedControl } from '../../components/primitives';
import { PageHeader } from '../reglages/shared';
import { useTheme } from '../../hooks/useTheme';
import { Toast, useToast } from '../../components/UI';

const PAGE_SIZE = 10;

const PM_GRID_CFG = {
  cash:     { label: 'Espèces',  color: '#065f46', bg: '#f0fdf4' },
  card:     { label: 'Carte',    color: '#4338ca', bg: '#eef2ff' },
  transfer: { label: 'Virement', color: '#0e7490', bg: '#ecfeff' },
  other:    { label: 'Autre',    color: '#92400e', bg: '#fffbeb' },
};

// Date ISO yyyy-mm-dd à n jours avant aujourd'hui (locale UTC-stable).
function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().substring(0, 10);
}
function isoToday() { return new Date().toISOString().substring(0, 10); }
function isoFirstOfMonth() {
  const d = new Date();
  d.setUTCDate(1);
  return d.toISOString().substring(0, 10);
}

export default function HistoriqueAdmin({
  transactions = [], employees = [], categories = [],
  onUpdTx, onDelTx,
}) {
  const { theme } = useTheme();
  const t = theme;
  const [toast, showToast] = useToast();

  // Commit 16 : plus de gate PIN au montage. Accès gardé par RequireAdminMode
  // (mode admin ⇒ PIN admin déjà saisi via sidebar). Les boutons Éditer /
  // Supprimer continuent d'utiliser onUpdTx/onDelTx → adminRequest qui joint
  // x-pin-session, et retry auto sur 403 ACTION_ADMIN_ONLY.

  // ── Filtres ───────────────────────────────────────────────────────────────
  // Défaut au mount : "Aujourd'hui". Pas de mémorisation localStorage : on
  // retombe toujours sur Aujourd'hui à chaque entrée sur /historique.
  const [from,    setFrom]    = useState(isoToday());
  const [to,      setTo]      = useState(isoToday());
  const [preset,  setPreset]  = useState('today'); // 'today' | 'week' | 'month' | 'custom'
  const [customFrom, setCustomFrom] = useState(isoToday());
  const [customTo,   setCustomTo]   = useState(isoToday());
  const [empF,    setEmpF]    = useState('all');
  const [pmF,     setPmF]     = useState('all'); // 'all' | 'cash' | 'card' | 'transfer' | 'other' | 'multi'
  const [search,  setSearch]  = useState('');
  const [typeF,   setTypeF]   = useState('all');
  const [page,    setPage]    = useState(0);

  const [edit,  setEdit]  = useState(null);
  const [modal, setModal] = useState(false);
  const [delId, setDelId] = useState(null);

  const getEmp = id => employees.find(e => e.id === id);
  const getCat = id => categories.find(c => c.id === id);

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      const d = nd(tx.date);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      if (typeF !== 'all' && tx.type !== typeF) return false;
      if (empF  !== 'all' && tx.employee_id !== empF) return false;
      if (pmF   !== 'all') {
        // Pour 'multi', on ne filtre que les transactions explicitement multi.
        // Pour les méthodes simples, on inclut les multi qui contiennent cette
        // méthode dans leur breakdown (cohérent avec la grille 4 pastel).
        if (pmF === 'multi') {
          if (tx.payment_method !== 'multi') return false;
        } else {
          const isSimple = tx.payment_method === pmF;
          const inMulti  = tx.payment_method === 'multi'
                        && Array.isArray(tx.payments)
                        && tx.payments.some(p => p.method === pmF && parseFloat(p.amount) > 0);
          if (!isSimple && !inMulti) return false;
        }
      }
      if (!search) return true;
      const q = search.toLowerCase();
      return getCat(tx.category_id)?.name?.toLowerCase().includes(q)
          || getEmp(tx.employee_id)?.name?.toLowerCase().includes(q)
          || tx.description?.toLowerCase().includes(q);
    });
  }, [transactions, from, to, empF, pmF, typeF, search, employees, categories]);

  useEffect(() => { setPage(0); }, [from, to, empF, pmF, typeF, search]);

  // ── KPIs (basés sur les revenus filtrés). ─────────────────────────────────
  const revs = filtered.filter(tx => tx.type === 'revenue');
  // kpiCA = somme totale (positifs - refunds negatifs) -> CA NET periode.
  const kpiCA = revs.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
  // kpiPrest exclut les refunds (source rdv_refund ou amount<0). Idem
  // kpiPanier : ne compte que les prestations effectives, pas les refunds.
  const revsPos = revs.filter(tx =>
    tx.source !== 'rdv_refund' && (parseFloat(tx.amount) || 0) >= 0);
  const kpiPrest = revsPos.reduce((s, tx) => {
    const itemsQty = Array.isArray(tx.items)
      ? tx.items.reduce((a, i) => a + (parseInt(i.qty) || 1), 0)
      : 0;
    return s + (itemsQty || parseInt(tx.qty_total) || 1);
  }, 0);
  const kpiPanier = revsPos.length > 0 ? kpiCA / revsPos.length : 0;

  // ── 4 moyens de paiement (multi éclatés). ─────────────────────────────────
  const byPM = useMemo(() => {
    const acc = {};
    PAY_KEYS.forEach(k => { acc[k] = { count: 0, total: 0 }; });
    const addPm = (pm, amount) => {
      const key = PAY_KEYS.includes(pm) ? pm : 'other';
      acc[key].count++;
      acc[key].total += parseFloat(amount) || 0;
    };
    revs.forEach(tx => {
      if (tx.payment_method === 'multi' && Array.isArray(tx.payments) && tx.payments.length) {
        tx.payments.forEach(p => { if (parseFloat(p.amount) > 0) addPm(p.method, p.amount); });
      } else {
        addPm(tx.payment_method, tx.amount);
      }
    });
    return acc;
  }, [revs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe   = Math.min(page, totalPages - 1);
  const pagedItems = filtered.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE);

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit',
    boxSizing:'border-box',
  };
  const sel = {
    width:'100%', padding:'9px 30px 9px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit',
    boxSizing:'border-box', cursor:'pointer',
    appearance:'none', WebkitAppearance:'none', MozAppearance:'none',
  };
  const card = {
    padding:14, borderRadius:12, background:t.card,
    border:`0.5px solid ${t.border}`,
    display:'flex', flexDirection:'column', gap:10,
  };
  const lblFilter = {
    margin:'0 0 6px', fontSize:10, color:t.muted, fontWeight:500,
    textTransform:'uppercase', letterSpacing:'0.04em',
  };
  const optBg    = t.mode === 'dark' ? '#1e1e30' : '#f8f8ff';
  const optColor = t.mode === 'dark' ? 'rgba(255,255,255,0.9)' : '#0c0c10';
  const SelectWrap = ({ children, value, onChange }) => (
    <div style={{ position:'relative' }}>
      <select value={value} onChange={onChange} style={sel}>
        {children}
      </select>
      <I.ChevD style={{ width:14, height:14, position:'absolute', right:10,
                        top:'50%', transform:'translateY(-50%)',
                        pointerEvents:'none', color:t.muted }}/>
    </div>
  );

  const activeEmps = employees.filter(e => e.is_active !== false);

  // Présets période : applique IMMÉDIATEMENT pour today/week/month.
  // Pour 'custom', on déplie une rangée avec inputs Du/Au + bouton Appliquer
  // (le filtre ne change qu'au clic Appliquer).
  const applyPreset = (kind) => {
    setPreset(kind);
    if (kind === 'today') { const d = isoToday(); setFrom(d); setTo(d); }
    else if (kind === 'week')  { setFrom(isoDaysAgo(7)); setTo(isoToday()); }
    else if (kind === 'month') { setFrom(isoFirstOfMonth()); setTo(isoToday()); }
    else if (kind === 'custom') {
      // initialise les inputs custom à la plage active actuelle
      setCustomFrom(from || isoToday());
      setCustomTo(to || isoToday());
    }
  };

  const applyCustomRange = () => {
    setFrom(customFrom);
    setTo(customTo);
  };

  return (
    <div style={{ minHeight:'100vh', background: t.bg, paddingBottom:24 }}>
      <Toast msg={toast?.msg} type={toast?.type}/>

      <div style={{ maxWidth: 960, margin:'0 auto', padding:'18px 16px',
                    display:'flex', flexDirection:'column', gap:14 }}>
        <PageHeader title="Historique"/>

        {/* ── Filtres compacts : 3 selects côte à côte (Période/Paiement/Employé)
              + ligne custom (Du/Au) seulement si "Personnaliser" ──────────── */}
        <div style={card}>
          <div style={{ display:'grid',
                        gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',
                        gap:10 }}>
            <div>
              <p style={lblFilter}>{"Période"}</p>
              <SelectWrap value={preset}
                          onChange={e => applyPreset(e.target.value)}>
                <option value="today"  style={{ background:optBg, color:optColor }}>{"Aujourd'hui"}</option>
                <option value="week"   style={{ background:optBg, color:optColor }}>{"Cette semaine"}</option>
                <option value="month"  style={{ background:optBg, color:optColor }}>{"Ce mois"}</option>
                <option value="custom" style={{ background:optBg, color:optColor }}>{"Personnaliser…"}</option>
              </SelectWrap>
            </div>
            <div>
              <p style={lblFilter}>{"Moyen de paiement"}</p>
              <SelectWrap value={pmF} onChange={e => setPmF(e.target.value)}>
                <option value="all"      style={{ background:optBg, color:optColor }}>{"Tous"}</option>
                <option value="cash"     style={{ background:optBg, color:optColor }}>{"Espèces"}</option>
                <option value="card"     style={{ background:optBg, color:optColor }}>{"Carte"}</option>
                <option value="transfer" style={{ background:optBg, color:optColor }}>{"Virement"}</option>
                <option value="other"    style={{ background:optBg, color:optColor }}>{"Autre"}</option>
                <option value="multi"    style={{ background:optBg, color:optColor }}>{"Mixte"}</option>
              </SelectWrap>
            </div>
            {activeEmps.length > 0 && (
              <div>
                <p style={lblFilter}>{"Employé"}</p>
                <SelectWrap value={empF} onChange={e => setEmpF(e.target.value)}>
                  <option value="all" style={{ background:optBg, color:optColor }}>{"Tous"}</option>
                  {activeEmps.map(e => (
                    <option key={e.id} value={e.id}
                            style={{ background:optBg, color:optColor }}>
                      {e.name}
                    </option>
                  ))}
                </SelectWrap>
              </div>
            )}
          </div>
          {preset === 'custom' && (
            <div style={{ display:'grid',
                          gridTemplateColumns:'1fr 1fr auto', gap:8, alignItems:'end' }}>
              <div>
                <p style={{ ...lblFilter, margin:'0 0 4px' }}>{"Du"}</p>
                <input type="date" value={customFrom}
                       onChange={e => setCustomFrom(e.target.value)} style={inp}/>
              </div>
              <div>
                <p style={{ ...lblFilter, margin:'0 0 4px' }}>{"Au"}</p>
                <input type="date" value={customTo}
                       onChange={e => setCustomTo(e.target.value)} style={inp}/>
              </div>
              <Button variant="primary" size="small" type="button"
                      onClick={applyCustomRange}>
                {"Appliquer"}
              </Button>
            </div>
          )}
        </div>

        {/* ── Résumé compact : KPIs inline + chips paiement pastel (2 lignes) */}
        <div style={{ ...card, gap:12 }}>
          <div style={{ display:'flex', alignItems:'baseline',
                        flexWrap:'wrap', gap:'6px 16px' }}>
            <span style={{ fontSize:24, fontWeight:500, color:t.text,
                           fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {fmt(kpiCA)} €
            </span>
            <span style={{ fontSize:11, color:t.muted, fontWeight:500,
                           textTransform:'uppercase', letterSpacing:'0.04em' }}>
              {"CA · " + revs.length + (revs.length > 1 ? ' transactions' : ' transaction')}
            </span>
            <span style={{ color:t.dim, fontSize:14 }}>{"·"}</span>
            <span style={{ fontSize:14, color:t.text, fontWeight:500 }}>
              <span style={{ color:t.muted, fontWeight:500 }}>{"Prestations "}</span>
              <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                             fontWeight:500 }}>{kpiPrest}</span>
            </span>
            <span style={{ color:t.dim, fontSize:14 }}>{"·"}</span>
            <span style={{ fontSize:14, color:t.text, fontWeight:500 }}>
              <span style={{ color:t.muted, fontWeight:500 }}>{"Panier "}</span>
              <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                             fontWeight:500 }}>{fmt(kpiPanier)} €</span>
            </span>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {Object.entries(PM_GRID_CFG).map(([id, cfg]) => {
              const v = byPM[id] || { count: 0, total: 0 };
              return (
                <span key={id}
                      style={{ display:'inline-flex', alignItems:'center', gap:8,
                               padding:'7px 14px', borderRadius:99,
                               background:cfg.bg, color:cfg.color,
                               fontSize:13, fontWeight:500 }}>
                  {cfg.label}
                  <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                                 fontWeight:500 }}>
                    {fmt(v.total)} €
                  </span>
                  <span style={{ opacity:0.75, fontSize:12 }}>{"· " + v.count}</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* ── Recherche + segment type ───────────────────────────────────── */}
        <div style={{ position:'relative' }}>
          <I.Search style={{ width:14, height:14, position:'absolute', left:12, top:'50%',
                             transform:'translateY(-50%)', color:t.muted }}/>
          <input placeholder="Rechercher dans description / catégorie / employé…"
                 value={search} onChange={e => setSearch(e.target.value)}
                 style={{ width:'100%', padding:'12px 36px', borderRadius:8,
                          background:t.card, border:`0.5px solid ${t.borderInput}`,
                          color:t.text, fontSize:14, fontFamily:'inherit', outline:'none',
                          boxSizing:'border-box' }}/>
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
                            { value:'expense', label:'Dépenses' },
                          ]}/>

        <p style={{ fontSize:12, color:t.muted, padding:'0 4px', margin:0 }}>
          {filtered.length} transaction{filtered.length > 1 ? 's' : ''}
        </p>

        {/* ── Liste ──────────────────────────────────────────────────────── */}
        <Card theme={t}>
          {filtered.length === 0 ? (
            <div style={{ padding:'56px 0', textAlign:'center' }}>
              <I.BarCh style={{ width:36, height:36, margin:'0 auto 10px', color:t.dim }}/>
              <p style={{ fontSize:13, color:t.muted, margin:0 }}>
                {"Aucune transaction sur cette période"}
              </p>
            </div>
          ) : (
            <div>
              {pagedItems.map((tx, i) => {
                const cat = getCat(tx.category_id);
                const emp = getEmp(tx.employee_id);
                const isRev = tx.type === 'revenue';
                // 3 sous-types de revenue lies aux RDV :
                //   source='rdv'         -> encaissement manuel au comptoir
                //   source='rdv_online'  -> paiement client via Stripe (acompte/integral)
                //   source='rdv_refund'  -> remboursement Stripe (amount < 0)
                const isRefund = tx.source === 'rdv_refund' || (isRev && Number(tx.amount) < 0);
                const isOnline = tx.source === 'rdv_online';
                const isRdvLike = tx.source === 'rdv' || isOnline;
                const pm   = PAY_INFO[tx.payment_method] || PAY_INFO.other;
                const PmIc = pm.Ic;
                const hasItems    = Array.isArray(tx.items) && tx.items.length > 0;
                const hasPaySplit = Array.isArray(tx.payments) && tx.payments.length > 1;
                const iconBg     = isRefund ? '#fef2f2' : (isRev ? (isRdvLike ? '#eef2ff' : t.cardAlt) : '#fef2f2');
                const iconColor  = isRefund ? '#991b1b' : (isRev ? (isRdvLike ? '#4338ca' : t.text)    : '#991b1b');
                const amountColor = isRefund ? '#991b1b' : (isRev ? '#065f46' : '#991b1b');

                return (
                  <div key={tx.id}
                       style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 16px',
                                borderBottom: i < pagedItems.length - 1 ? `0.5px solid ${t.separator}` : 'none' }}>
                    <div style={{ width:36, height:36, borderRadius:8, flexShrink:0, marginTop:2,
                                  background:iconBg,
                                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {isRefund
                        ? <I.ArrowDown style={{ width:15, height:15, color:iconColor }}/>
                        : isRdvLike
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
                          {isRefund
                            ? (tx.description || 'Remboursement RDV')
                            : isRdvLike
                              ? (tx.description || (isOnline ? 'Paiement en ligne RDV' : 'Encaissement RDV'))
                              : (cat?.name || tx.description || 'Transaction')}
                        </p>
                        <span style={{ fontSize:15, fontWeight:500,
                                       fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace",
                                       color:amountColor, flexShrink:0 }}>
                          {isRefund ? '-' : (isRev ? '+' : '-')}{fmt(Math.abs(Number(tx.amount)))} €
                        </span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                        <span style={{ fontSize:11, color:t.muted, flexShrink:0 }}>
                          {disp(nd(tx.date), 'short')}{tx.time ? ' · ' + tx.time : ''}
                        </span>
                        {emp && <span style={{ fontSize:11, color:t.dim }}>·</span>}
                        {emp && (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:4,
                                         padding:'2px 8px 2px 3px', borderRadius:99,
                                         background:t.cardAlt,
                                         fontSize:11, fontWeight:500, color:t.text, flexShrink:0 }}>
                            <span style={{ width:14, height:14, borderRadius:6,
                                           background: emp.avatar_color || t.text,
                                           display:'inline-flex', alignItems:'center',
                                           justifyContent:'center',
                                           color:'#fff', fontSize:8, fontWeight:500 }}>
                              {emp.name?.charAt(0)?.toUpperCase()}
                            </span>
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
                        {isRdvLike && !isRefund && (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:4,
                                         padding:'2px 8px', borderRadius:99,
                                         background: isOnline ? '#ecfeff' : '#eef2ff',
                                         color:    isOnline ? '#0e7490' : '#4338ca',
                                         fontSize:11, fontWeight:500, flexShrink:0 }}>
                            <I.Calendar style={{ width:10, height:10 }}/>
                            {isOnline ? 'RDV en ligne' : 'RDV'}
                          </span>
                        )}
                        {isRefund && (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:4,
                                         padding:'2px 8px', borderRadius:99,
                                         background:'#fef2f2', color:'#991b1b',
                                         fontSize:11, fontWeight:500, flexShrink:0 }}>
                            <I.ArrowDown style={{ width:10, height:10 }}/>
                            Remboursement
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
                                                           fontSize:11, color:t.text,
                                                           fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                                    <span style={{ overflow:'hidden', textOverflow:'ellipsis',
                                                   whiteSpace:'nowrap' }}>
                                      {q + ' × ' + it.service_name + ' '}
                                      <span style={{ color:t.dim }}>{'@ ' + fmt(up) + '€'}</span>
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
                                style={{ width:30, height:30, borderRadius:8, border:'none', cursor:'pointer',
                                         background:t.cardAlt,
                                         display:'flex', alignItems:'center', justifyContent:'center',
                                         fontFamily:'inherit' }}>
                          <I.Edit style={{ width:13, height:13, color:t.muted }}/>
                        </button>
                        <button onClick={() => setDelId(tx.id)} title="Supprimer (admin)"
                                style={{ width:30, height:30, borderRadius:8, border:'none', cursor:'pointer',
                                         background:'rgba(239,68,68,0.1)',
                                         display:'flex', alignItems:'center', justifyContent:'center',
                                         fontFamily:'inherit' }}>
                          <I.Trash style={{ width:13, height:13, color:'#991b1b' }}/>
                        </button>
                      </div>
                      <span style={{ fontSize:9, fontWeight:500,
                                     padding:'2px 7px', borderRadius:99,
                                     background:'#fffbeb', color:'#92400e' }}>
                        {"Audit"}
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
              {"‹ Préc."}
            </Button>
            <span style={{ fontSize:13, fontWeight:500, color:t.muted,
                           minWidth:80, textAlign:'center' }}>
              {"Page " + (pageSafe + 1) + " / " + totalPages}
            </span>
            <Button variant="secondary" size="small" type="button"
                    disabled={pageSafe >= totalPages - 1}
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>
              {"Suiv. ›"}
            </Button>
          </div>
        )}

        <TransactionForm open={modal} onClose={() => { setModal(false); setEdit(null); }}
                         onSubmit={async d => {
                           try {
                             if (edit) { await onUpdTx(edit.id, d); showToast('Transaction modifiée'); }
                           } catch (e) {
                             // Le retry automatique 403 est géré par adminRequest ;
                             // si on arrive ici c'est une erreur effective.
                             if (e.code === 'ACTION_ADMIN_ONLY')
                               showToast("Erreur d'autorisation, reconnectez-vous", 'error');
                             else showToast('Erreur lors de la modification', 'error');
                           }
                           setEdit(null); setModal(false);
                         }}
                         employees={employees} categories={categories} init={edit}
                         snapshot/>
        <Confirm open={!!delId} onClose={() => setDelId(null)}
                 onConfirm={async () => {
                   try {
                     await onDelTx(delId);
                     showToast('Transaction supprimée');
                   } catch (e) {
                     if (e.code === 'ACTION_ADMIN_ONLY')
                       showToast("Erreur d'autorisation, reconnectez-vous", 'error');
                     else showToast('Erreur lors de la suppression', 'error');
                   }
                   setDelId(null);
                 }}
                 title="Supprimer cette transaction ?"
                 message="Confirmer la suppression — action enregistrée dans l'audit trail."
                 theme={t}/>
      </div>
    </div>
  );
}
