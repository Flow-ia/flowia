// Caisse > Historique du jour — refonte commit 7h, bypass admin commit 16.
//
// Page LECTURE SEULE destinée à l'employé sur tablette pour vérifier ce qui a
// été encaissé AUJOURD'HUI. Toute édition/suppression passe par /historique
// (page admin dédiée, gate PIN admin via adminRequest côté back).
//
// Gate au montage = PinAccessModal (PIN employé). Une fois validé, session
// 5 min. Les actions sensibles edit/delete ne sont JAMAIS proposées ici, on
// retire complètement les boutons d'action sur les lignes.
//
// Commit 16 : si l'utilisateur est en mode admin (isAdminMode === true), on
// bypass la gate PIN employé — un admin doit pouvoir consulter l'historique
// du jour sans saisir le PIN d'un employé en plus du sien (déjà saisi via
// la sidebar). En mode normal (employé tablette), la gate reste en place.
//
// Filtre date FORCÉ : aujourd'hui uniquement (UTC stable comme nd()). Le
// filtre employé chips reste utile pour qu'un barbier voie sa propre journée.
//
// Conserve les calculs « multi éclatés » et la grille 4 moyens pastel
// (cohérence avec /historique admin et l'audit DB).
import { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../../utils/icons';
import { todayStr } from '../../utils/dates';
import { Card, nd, PAY_KEYS } from '../settings/shared';

// Montant marche DZ : "1 500" (espace milliers, pas de decimales terminales).
const fmtDA = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
import { PinAccessModal } from '../Dashboard';
import { useAdminMode } from '../../contexts/AdminModeContext';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const PM_GRID_CFG = {
  cash:        { label: 'Espèces',  color: '#065f46', bg: '#f0fdf4' },
  card:        { label: 'Carte',    color: '#4338ca', bg: '#eef2ff' },
  card_online: { label: 'En ligne', color: '#0891b2', bg: '#cffafe' },
  transfer:    { label: 'Virement', color: '#0e7490', bg: '#ecfeff' },
  other:       { label: 'Autre',    color: '#92400e', bg: '#fffbeb' },
};

// ── SVG inline helpers (Tabler outline). Memes paths que TransactionRow.jsx
// cote /historique pour cohérence visuelle entre les deux pages.
const SVG_BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};
const SvgIcon = ({ paths, size = 14, color }) => (
  <svg {...SVG_BASE} width={size} height={size}
       style={{ color, flexShrink: 0, display: 'block' }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);

const PATH_CASH        = '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="10" x2="3" y2="10"/><line x1="21" y1="10" x2="21" y2="10"/>';
const PATH_BANK        = '<line x1="3" y1="21" x2="21" y2="21"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="5 6 12 3 19 6"/><line x1="4" y1="10" x2="4" y2="21"/><line x1="20" y1="10" x2="20" y2="21"/><line x1="8" y1="14" x2="8" y2="17"/><line x1="12" y1="14" x2="12" y2="17"/><line x1="16" y1="14" x2="16" y2="17"/>';
const PATH_CARD        = '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>';
const PATH_CARD_PAY    = '<path d="M12 19H5a2 2 0 0 1 -2 -2V7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v6"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16l3 3l-3 3"/>';
const PATH_DOTS        = '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';
const PATH_SHUFFLE     = '<path d="M18 4l3 3l-3 3"/><path d="M18 20l3 -3l-3 -3"/><path d="M3 7h3a5 5 0 0 1 5 5a5 5 0 0 0 5 5h5"/><path d="M21 7h-5a4.978 4.978 0 0 0 -3 1"/><path d="M11 16a4.978 4.978 0 0 1 -3 1h-5"/>';
const PATH_CLOCK       = '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>';
const PATH_ARROW_BACK  = '<path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/>';

const ICON_BY_METHOD = {
  cash:        PATH_CASH,
  card:        PATH_CARD,
  card_online: PATH_CARD_PAY,
  transfer:    PATH_BANK,
  other:       PATH_DOTS,
};
function methodIcon(method) {
  return ICON_BY_METHOD[method] || ICON_BY_METHOD.other;
}

// Breakpoint mobile (aligne sur TransactionRow /historique). Sous 768px la
// ligne dense 6 colonnes deborde -> layout empile 2 niveaux.
function useNarrow(bp = 768) {
  const [m, setM] = useState(
    typeof window !== 'undefined' ? window.innerWidth < bp : false
  );
  useEffect(() => {
    const onResize = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bp]);
  return m;
}

function CaisseBadge({ label, bg, color, paths }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 8,
      background: bg, color: color,
      fontSize: 10, fontWeight: 500, lineHeight: 1.4,
      whiteSpace: 'nowrap',
    }}>
      {paths && <SvgIcon paths={paths} size={10} color={color} />}
      {label}
    </span>
  );
}

export default function Historique({
  transactions = [], employees = [], categories = [], theme,
}) {
  const t = theme;
  const today = todayStr();
  const narrow = useNarrow();

  // Coercion défensive des arrays (props peuvent transiter undefined entre
  // deux renders d'App.jsx — protège PinAccessModal et tous les .filter()).
  const txs  = Array.isArray(transactions) ? transactions : [];
  const emps = Array.isArray(employees)    ? employees    : [];

  // ── Gate PIN employé au montage (commit 16 : bypass si mode admin) ────────
  // Le PIN admin saisi via la sidebar suffit ; ne pas redemander un PIN employé
  // par-dessus.
  const { isAdminMode } = useAdminMode();
  const [unlocked, setUnlocked] = useState(isAdminMode);
  const [pinOpen,  setPinOpen]  = useState(!isAdminMode);
  const successRef = useRef(isAdminMode);

  // Si aucun employé actif, on saute le gate (cohérent avec legacy Historique).
  useEffect(() => {
    if (isAdminMode || emps.filter(e => e.is_active !== false).length === 0) {
      setUnlocked(true); setPinOpen(false);
    }
  }, [emps, isAdminMode]);

  // ── Filtre employé (chips) ───────────────────────────────────────────────
  const [empF, setEmpF] = useState('all');

  // ── Toutes les recettes du jour, narrowed à 1 employé si filtré ───────────
  const todayRevs = useMemo(() => {
    let list = txs.filter(tx => nd(tx.date) === today && tx.type === 'revenue');
    if (empF !== 'all') list = list.filter(tx => tx.employee_id === empF);
    return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [txs, today, empF]);

  // ── Regroupement des multi-paiements par payment_group_id (commit C) ─────
  // Depuis le commit A, un encaissement multi crée N rows transactions liées
  // par un payment_group_id UUID partagé. Côté affichage caisse, on les
  // fusionne en 1 ligne « virtuelle » (tx représentative = la 1re par
  // created_at) avec un payments_breakdown synthétique pour les sous-lignes.
  // Les rows sans payment_group_id (paiements simples + legacy 'multi' avec
  // tx.payments) restent inchangées.
  const groupedTodayRevs = useMemo(() => {
    const buckets = new Map();
    const order = [];
    todayRevs.forEach(tx => {
      const key = tx.payment_group_id || ('single:' + tx.id);
      if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
      buckets.get(key).push(tx);
    });
    return order.map(key => {
      const rows = buckets.get(key);
      if (rows.length === 1 && !rows[0].payment_group_id) return rows[0];
      // Multi-groupe → tx synthétique avec breakdown trié chronologiquement.
      const sorted = [...rows].sort(
        (a, b) => (a.created_at || '').localeCompare(b.created_at || '')
      );
      const rep = sorted[0];
      const totalAmount = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      return {
        ...rep,
        amount: totalAmount,
        payment_method: 'multi',
        payments_breakdown: sorted.map(r => ({
          method: r.payment_method,
          amount: parseFloat(r.amount) || 0,
        })),
      };
    });
  }, [todayRevs]);

  // KPIs jour — calculs basés sur les groupes (1 multi-paiement = 1 tx).
  // dayRev = somme tous revenue (refunds negatifs subtraits) = CA NET du jour.
  const dayRev = groupedTodayRevs.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
  // prestCount + panierMoy excluent les refunds (pas une prestation).
  const todayRevsPos = groupedTodayRevs.filter(tx =>
    tx.source !== 'rdv_refund' && (parseFloat(tx.amount) || 0) >= 0);
  const prestCount = todayRevsPos.reduce((s, tx) => {
    const itemsQty = Array.isArray(tx.items)
      ? tx.items.reduce((a, i) => a + (parseInt(i.qty) || 1), 0)
      : 0;
    return s + (itemsQty || parseInt(tx.qty_total) || 1);
  }, 0);
  const panierMoy = todayRevsPos.length > 0 ? dayRev / todayRevsPos.length : 0;

  // ── 4 moyens de paiement (multi éclatés sur les vraies méthodes). ─────────
  const byPM = useMemo(() => {
    const acc = {};
    PAY_KEYS.forEach(k => { acc[k] = { count: 0, total: 0 }; });
    const addPm = (pm, amount) => {
      const key = PAY_KEYS.includes(pm) ? pm : 'other';
      acc[key].count++;
      acc[key].total += parseFloat(amount) || 0;
    };
    groupedTodayRevs.forEach(tx => {
      // Nouveau format : payments_breakdown synthétisé par le regroupement
      // (1 entrée par sous-paiement traçable, méthodes réelles).
      if (Array.isArray(tx.payments_breakdown) && tx.payments_breakdown.length) {
        tx.payments_breakdown.forEach(p => { if (parseFloat(p.amount) > 0) addPm(p.method, p.amount); });
      // Legacy format : payment_method='multi' + tx.payments (transaction_payments).
      } else if (tx.payment_method === 'multi' && Array.isArray(tx.payments) && tx.payments.length) {
        tx.payments.forEach(p => { if (parseFloat(p.amount) > 0) addPm(p.method, p.amount); });
      } else {
        addPm(tx.payment_method, tx.amount);
      }
    });
    return acc;
  }, [groupedTodayRevs]);

  // ── 1 ligne par transaction (= 1 encaissement = 1 ligne) ────────────────
  // Le titre concatène toutes les prestations au format « 3× Coupe homme,
  // 1× Coupe femme ». Pour les multi-paiement, le breakdown des moyens est
  // affiché en sous-lignes dans la colonne paiements (├─ Espèces / ├─ CB).
  // Pas de qty prefix devant le titre puisque la description contient déjà
  // les quantités item par item.
  const empById = useMemo(() => Object.fromEntries(emps.map(e => [e.id, e])), [emps]);

  // Aggregate items par (service_name + unit_price). Si la caisse stocke 3
  // rows séparées « Coupe homme qty=1 » au lieu d'1 row « qty=3 », on
  // fusionne pour un affichage propre. Renvoie aussi le label formaté
  // « 3× Coupe homme, 1× Coupe femme ».
  function formatItems(items) {
    const map = new Map();
    for (const it of items) {
      const name  = (it.service_name || 'Prestation').trim();
      const price = Math.round((parseFloat(it.unit_price) || 0) * 100);
      const key   = name + '|' + price;
      const qty   = parseInt(it.qty) || 1;
      if (map.has(key)) map.get(key).qty += qty;
      else map.set(key, { service_name: name, unit_price: price / 100, qty });
    }
    const arr   = Array.from(map.values());
    // Séparateur " · " (point milieu) — cohérent avec /historique
    // TransactionRow + drawer TxDetailDrawer pour un titre identique partout.
    const label = arr.map(it => it.qty + '× ' + it.service_name).join(' · ');
    const sum   = arr.reduce((s, it) => s + it.unit_price * it.qty, 0);
    const qty   = arr.reduce((s, it) => s + it.qty, 0);
    return { label, sum, qty };
  }

  const lines = useMemo(() => {
    const out = [];
    groupedTodayRevs.forEach(tx => {
      const emp = empById[tx.employee_id];
      const rawItems = Array.isArray(tx.items) ? tx.items : [];
      const { label: itemsLabel, qty: itemsQty } = formatItems(rawItems);
      const isMultiBreakdown = Array.isArray(tx.payments_breakdown)
                            && tx.payments_breakdown.length >= 2;
      let pmLabel;
      if (isMultiBreakdown) {
        pmLabel = 'Multi (' + tx.payments_breakdown.length + ')';
      } else if (tx.payment_method === 'multi' && Array.isArray(tx.payments) && tx.payments.length) {
        pmLabel = tx.payments.map(p => PM_GRID_CFG[p.method]?.label || p.method).join(' + ');
      } else {
        pmLabel = PM_GRID_CFG[tx.payment_method]?.label || 'Autre';
      }
      const pmCfg = (isMultiBreakdown || tx.payment_method === 'multi')
        ? { color: '#3c3489', bg: '#eeedfe' }
        : (PM_GRID_CFG[tx.payment_method] || PM_GRID_CFG.other);
      const pmKey = (isMultiBreakdown || tx.payment_method === 'multi')
        ? 'other'
        : (PM_GRID_CFG[tx.payment_method] ? tx.payment_method : 'other');
      const hour = tx.time ? String(tx.time).slice(0, 5) : '';
      const breakdownArr = isMultiBreakdown ? tx.payments_breakdown : null;
      // Total de la transaction : pour un multi, utiliser le total du groupe
      // (gross_amount_cents agrège les rows soeurs). Pour un single, amount
      // = total. Fallback sur tx.amount si gross_amount_cents absent.
      const txTotal = isMultiBreakdown && tx.gross_amount_cents
        ? (parseInt(tx.gross_amount_cents, 10) / 100)
        : (parseFloat(tx.amount) || 0);

      // 1 ligne unique par transaction. Le titre = format "Qte× Nom, Qte× Nom"
      // si items présents, sinon fallback sur description.
      out.push({
        id: tx.id,
        service: itemsLabel || tx.description || 'Prestation',
        // Pas de qty prefix devant le titre — les quantités sont déjà dans
        // le label item par item.
        qty: 1,
        amount: txTotal,
        emp, pmLabel, pmCfg, pmKey, hour,
        breakdown: breakdownArr,
      });
      // Pas de ligne d'ajustement Supplément/Remise — l'écart éventuel
      // entre somme(items) et txTotal sera visible naturellement dans le
      // drawer édition (validation business). En liste, on garde le total
      // réel encaissé qui fait foi.
      void itemsQty;
    });
    return out;
  }, [groupedTodayRevs, empById]);

  // ── Si pas unlocked → gate seul ──────────────────────────────────────────
  if (!unlocked) {
    return (
      <PinAccessModal
        open={pinOpen}
        employees={emps}
        theme={t}
        title="Historique du jour"
        actionLabel="Saisir votre PIN employé"
        onSuccess={() => { successRef.current = true; setUnlocked(true); }}
        onClose={() => { if (!successRef.current) setPinOpen(false); }}
      />
    );
  }

  const sep = `0.5px solid ${t.separator}`;
  const activeEmps = emps.filter(e => e.is_active !== false);
  const card = {
    padding:14, borderRadius:12, background:t.card,
    border:`0.5px solid ${t.border}`,
    display:'flex', flexDirection:'column', gap:10,
  };
  const chip = (active, accent) => ({
    padding:'7px 12px', borderRadius:99,
    border:`0.5px solid ${active ? (accent || t.text) : t.border}`,
    background: active ? (accent ? accent + '15' : t.cardAlt) : t.card,
    color: active ? (accent || t.text) : t.muted,
    cursor:'pointer', fontFamily:'inherit',
    fontSize:12, fontWeight:500,
    display:'inline-flex', alignItems:'center', gap:6,
    whiteSpace:'nowrap',
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* En-tête + bandeau lecture seule */}
      <div style={card}>
        <div>
          <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
            {"Historique du jour"}
          </p>
          <p style={{ margin:'3px 0 0', fontSize:11, color:t.muted }}>
            {"Lecture seule · pour modifier une transaction, demandez l'admin."}
          </p>
        </div>
      </div>

      {/* Filtre employé chips */}
      {activeEmps.length > 0 && (
        <div style={card}>
          <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>
            {"Employé"}
          </p>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button onClick={() => setEmpF('all')} style={chip(empF === 'all')}>
              {"Tous"}
            </button>
            {activeEmps.map(e => (
              <button key={e.id} onClick={() => setEmpF(e.id)}
                      style={chip(empF === e.id, e.avatar_color)}>
                <span style={{ width:14, height:14, borderRadius:99,
                               background: e.avatar_color || t.text, color:'#fff',
                               display:'inline-flex', alignItems:'center',
                               justifyContent:'center',
                               fontSize:9, fontWeight:500 }}>
                  {(e.name || '?').charAt(0).toUpperCase()}
                </span>
                {e.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KPIs jour */}
      <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',
                    gap:10 }}>
        <div style={{ ...card, gap:6 }}>
          <p style={{ margin:0, fontSize:10, color:t.muted, textTransform:'uppercase',
                      letterSpacing:'0.04em', fontWeight:500 }}>{"CA jour"}</p>
          <p style={{ margin:0, fontSize:20, fontWeight:500, color:t.text,
                      fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {fmtDA(dayRev)} DA
          </p>
          <p style={{ margin:0, fontSize:11, color:t.muted }}>
            {groupedTodayRevs.length + (groupedTodayRevs.length > 1 ? ' transactions' : ' transaction')}
          </p>
        </div>
        <div style={{ ...card, gap:6 }}>
          <p style={{ margin:0, fontSize:10, color:t.muted, textTransform:'uppercase',
                      letterSpacing:'0.04em', fontWeight:500 }}>{"Prestations"}</p>
          <p style={{ margin:0, fontSize:20, fontWeight:500, color:t.text,
                      fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {prestCount}
          </p>
        </div>
        <div style={{ ...card, gap:6 }}>
          <p style={{ margin:0, fontSize:10, color:t.muted, textTransform:'uppercase',
                      letterSpacing:'0.04em', fontWeight:500 }}>{"Panier moyen"}</p>
          <p style={{ margin:0, fontSize:20, fontWeight:500, color:t.text,
                      fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {fmtDA(panierMoy)} DA
          </p>
        </div>
      </div>

      {/* Grille 4 moyens pastel */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8 }}>
        {Object.entries(PM_GRID_CFG).map(([id, cfg]) => {
          const v = byPM[id] || { count: 0, total: 0 };
          return (
            <div key={id} style={{ padding:'12px 10px', borderRadius:10,
                                   background:cfg.bg, textAlign:'center' }}>
              <p style={{ fontSize:10, color:cfg.color, margin:'0 0 4px',
                          textTransform:'uppercase', letterSpacing:'0.04em',
                          fontWeight:500 }}>
                {cfg.label}
              </p>
              <p style={{ fontSize:15, fontWeight:500, color:cfg.color,
                          fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                          margin:'0 0 2px', lineHeight:1.1 }}>
                {fmtDA(v.total)} DA
              </p>
              <p style={{ fontSize:10, color:cfg.color, opacity:0.7, margin:0 }}>
                {v.count} tx
              </p>
            </div>
          );
        })}
      </div>

      {/* Liste lecture seule */}
      <Card theme={t}>
        <div style={{ padding:'12px 14px', borderBottom: sep,
                      display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>
            {"Encaissements ligne par ligne"}
          </p>
          <span style={{ fontSize:11, color:t.muted }}>
            {groupedTodayRevs.length + (groupedTodayRevs.length > 1 ? ' transactions' : ' transaction')}
          </span>
        </div>

        {lines.length === 0 ? (
          <div style={{ padding:'48px 16px', textAlign:'center' }}>
            <I.Wallet style={{ width:30, height:30, margin:'0 auto 10px', color:t.dim, display:'block' }}/>
            <p style={{ fontSize:13, color:t.muted, margin:0 }}>
              {"Aucune vente" + (empF !== 'all' ? " pour cet employé" : "") + " aujourd'hui"}
            </p>
          </div>
        ) : (
          lines.map((l, idx) => {
            const isMultiLine  = Array.isArray(l.breakdown) && l.breakdown.length >= 2;
            const isRefundLine = (parseFloat(l.amount) || 0) < 0;
            const totalColor   = isRefundLine ? '#E24B4A' : '#1D9E75';
            const totalSign    = isRefundLine ? '−' : '+';
            const absAmount    = Math.abs(parseFloat(l.amount) || 0);
            const pmIcon       = isMultiLine ? PATH_SHUFFLE : methodIcon(l.pmKey);

            // ── Mobile : layout empile 2 niveaux (zero chevauchement) ──────
            if (narrow) {
              return (
                <div key={l.id} style={{
                  display:'flex', flexDirection:'column', gap:8,
                  padding:'12px 14px',
                  borderBottom: idx < lines.length - 1 ? sep : 'none',
                  background: isRefundLine ? '#FCEBEB' : 'transparent',
                  opacity: isRefundLine ? 0.85 : 1,
                }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                    <div style={{
                      width:34, height:34, borderRadius:10, flexShrink:0,
                      background: l.pmCfg.bg,
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      <SvgIcon paths={pmIcon} size={17} color={l.pmCfg.color} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{
                        margin:0, fontSize:14, fontWeight:500, color:t.text,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      }}>
                        {l.qty > 1 && <span style={{ color:t.muted, marginRight:6 }}>{l.qty}×</span>}
                        {l.service}
                      </div>
                      <div style={{
                        display:'flex', flexWrap:'wrap', alignItems:'center',
                        gap:'2px 10px', marginTop:3,
                      }}>
                        {l.hour && (
                          <span style={{
                            display:'inline-flex', alignItems:'center', gap:4,
                            fontSize:12, fontWeight:500, color:t.text, whiteSpace:'nowrap',
                          }}>
                            <SvgIcon paths={PATH_CLOCK} size={13} color={t.muted} />
                            {l.hour}
                          </span>
                        )}
                        {l.emp && (
                          <span style={{
                            display:'inline-flex', alignItems:'center', gap:5,
                            fontSize:12, fontWeight:500, color:t.text, whiteSpace:'nowrap',
                          }}>
                            <span style={{
                              width:14, height:14, borderRadius:99,
                              background: l.emp.avatar_color || t.text,
                              display:'inline-flex', alignItems:'center', justifyContent:'center',
                              color:'#fff', fontSize:9, fontWeight:500, flexShrink:0,
                            }}>
                              {(l.emp.name || '?').charAt(0).toUpperCase()}
                            </span>
                            {l.emp.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{
                      flexShrink:0, textAlign:'right',
                      fontSize:15, fontWeight:500,
                      fontVariantNumeric:'tabular-nums', fontFamily: MONO,
                      color: totalColor, lineHeight:1.2,
                    }}>
                      {totalSign + fmtDA(absAmount) + ' DA'}
                    </div>
                  </div>

                  <div style={{
                    display:'flex', flexWrap:'wrap', alignItems:'center', gap:6,
                  }}>
                    {isMultiLine && (
                      <CaisseBadge label={'Multi (' + l.breakdown.length + ')'}
                                   bg="#F3F4F6" color="#4B5563" paths={PATH_SHUFFLE} />
                    )}
                    {isRefundLine && (
                      <CaisseBadge label="Remboursé"
                                   bg="#FCEBEB" color="#791F1F" paths={PATH_ARROW_BACK} />
                    )}
                    {isMultiLine ? (
                      l.breakdown.map((sub, k) => {
                        const subCfg = PM_GRID_CFG[sub.method] || PM_GRID_CFG.other;
                        return (
                          <span key={k} style={{
                            display:'inline-flex', alignItems:'center', gap:4,
                            padding:'3px 8px', borderRadius:8,
                            background: subCfg.bg, color: subCfg.color,
                            fontSize:11, fontWeight:500, whiteSpace:'nowrap',
                          }}>
                            <SvgIcon paths={methodIcon(sub.method)} size={11} color={subCfg.color} />
                            {subCfg.label || sub.method}
                            <span style={{ fontFamily: MONO, fontVariantNumeric:'tabular-nums' }}>
                              {fmtDA(sub.amount)} DA
                            </span>
                          </span>
                        );
                      })
                    ) : (
                      <span style={{
                        display:'inline-flex', alignItems:'center', gap:4,
                        padding:'3px 8px', borderRadius:8,
                        background: l.pmCfg.bg, color: l.pmCfg.color,
                        fontSize:11, fontWeight:500, whiteSpace:'nowrap',
                      }}>
                        <SvgIcon paths={methodIcon(l.pmKey)} size={11} color={l.pmCfg.color} />
                        {l.pmLabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div key={l.id} style={{
                display:'flex', alignItems:'center', gap:14,
                padding:'10px 14px',
                borderBottom: idx < lines.length - 1 ? sep : 'none',
                background: isRefundLine ? '#FCEBEB' : 'transparent',
                opacity: isRefundLine ? 0.85 : 1,
              }}>
                {/* Col 1 — Avatar 36x36 */}
                <div style={{
                  width:36, height:36, borderRadius:10, flexShrink:0,
                  background: l.pmCfg.bg,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <SvgIcon paths={pmIcon} size={18} color={l.pmCfg.color} />
                </div>

                {/* Col 2 — Titre + meta (heure, employé) */}
                <div style={{ flex:1.6, minWidth:0, display:'flex', flexDirection:'column' }}>
                  <div style={{
                    margin:0, fontSize:14, fontWeight:500, color:t.text,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    marginBottom:3,
                  }}>
                    {l.qty > 1 && <span style={{ color:t.muted, marginRight:6 }}>{l.qty}×</span>}
                    {l.service}
                  </div>
                  <div style={{
                    display:'flex', flexWrap:'wrap', alignItems:'center',
                    gap:'0 12px', rowGap:2,
                  }}>
                    {l.hour && (
                      <span style={{
                        display:'inline-flex', alignItems:'center', gap:4,
                        fontSize:13, fontWeight:500, color:t.text,
                        whiteSpace:'nowrap',
                      }}>
                        <SvgIcon paths={PATH_CLOCK} size={14} color={t.muted} />
                        {l.hour}
                      </span>
                    )}
                    {l.emp && (
                      <span style={{
                        display:'inline-flex', alignItems:'center', gap:5,
                        fontSize:13, fontWeight:500, color:t.text,
                        whiteSpace:'nowrap',
                      }}>
                        <span style={{
                          width:14, height:14, borderRadius:99,
                          background: l.emp.avatar_color || t.text,
                          display:'inline-flex', alignItems:'center', justifyContent:'center',
                          color:'#fff', fontSize:9, fontWeight:500, flexShrink:0,
                        }}>
                          {(l.emp.name || '?').charAt(0).toUpperCase()}
                        </span>
                        {l.emp.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Col 3 — Badges (multi, refund) */}
                <div style={{
                  display:'flex', flexDirection:'column', gap:2,
                  alignItems:'flex-start', flexShrink:0,
                }}>
                  {isMultiLine && (
                    <CaisseBadge label={'Multi (' + l.breakdown.length + ')'}
                                 bg="#F3F4F6" color="#4B5563" paths={PATH_SHUFFLE} />
                  )}
                  {isRefundLine && (
                    <CaisseBadge label="Remboursé"
                                 bg="#FCEBEB" color="#791F1F" paths={PATH_ARROW_BACK} />
                  )}
                </div>

                {/* Col 4 — Paiements détaillés */}
                <div style={{
                  flex:1.1, minWidth:0,
                  borderLeft:'0.5px solid rgba(0,0,0,0.08)',
                  paddingLeft:12,
                  display:'flex', flexDirection:'column', gap:2,
                }}>
                  {isMultiLine ? (
                    l.breakdown.map((sub, k) => {
                      const subCfg = PM_GRID_CFG[sub.method] || PM_GRID_CFG.other;
                      const subLabel = subCfg?.label || sub.method;
                      return (
                        <div key={k} style={{
                          display:'flex', alignItems:'center', justifyContent:'space-between',
                          gap:8, fontSize:12,
                        }}>
                          <span style={{
                            display:'inline-flex', alignItems:'center', gap:5,
                            color:t.muted, minWidth:0,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                          }}>
                            <SvgIcon paths={methodIcon(sub.method)} size={13} color={t.muted} />
                            <span style={{
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                            }}>{subLabel}</span>
                          </span>
                          <span style={{
                            fontWeight:500, color:t.text,
                            fontVariantNumeric:'tabular-nums',
                            fontFamily: MONO,
                            flexShrink:0,
                          }}>
                            {fmtDA(sub.amount)} DA
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{
                        display:'inline-flex', alignItems:'center', gap:4,
                        padding:'4px 9px', borderRadius:8,
                        background: l.pmCfg.bg, color: l.pmCfg.color,
                        fontSize:11, fontWeight:500, lineHeight:1.3,
                        whiteSpace:'nowrap',
                      }}>
                        <SvgIcon paths={methodIcon(l.pmKey)} size={11} color={l.pmCfg.color} />
                        {l.pmLabel}
                      </span>
                    </div>
                  )}
                </div>

                {/* Col 5 — Total */}
                <div style={{ minWidth:90, flexShrink:0, textAlign:'right' }}>
                  <div style={{
                    fontSize:15, fontWeight:500,
                    fontVariantNumeric:'tabular-nums',
                    fontFamily: MONO,
                    color: totalColor, lineHeight:1.2,
                  }}>
                    {totalSign + fmtDA(absAmount) + ' DA'}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
