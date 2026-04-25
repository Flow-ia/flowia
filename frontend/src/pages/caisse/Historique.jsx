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
import { Card, nd, fmt, PAY_KEYS } from '../settings/shared';
import { PinAccessModal } from '../Dashboard';
import { Icon } from '../../components/Icon';
import { useAdminMode } from '../../contexts/AdminModeContext';

const PM_GRID_CFG = {
  cash:     { label: 'Espèces',  color: '#065f46', bg: '#f0fdf4' },
  card:     { label: 'Carte',    color: '#4338ca', bg: '#eef2ff' },
  transfer: { label: 'Virement', color: '#0e7490', bg: '#ecfeff' },
  other:    { label: 'Autre',    color: '#92400e', bg: '#fffbeb' },
};

export default function Historique({
  transactions = [], employees = [], categories = [], theme,
}) {
  const t = theme;
  const today = todayStr();

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

  // KPIs jour
  const dayRev = todayRevs.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
  const prestCount = todayRevs.reduce((s, tx) => {
    const itemsQty = Array.isArray(tx.items)
      ? tx.items.reduce((a, i) => a + (parseInt(i.qty) || 1), 0)
      : 0;
    return s + (itemsQty || parseInt(tx.qty_total) || 1);
  }, 0);
  const panierMoy = todayRevs.length > 0 ? dayRev / todayRevs.length : 0;

  // ── 4 moyens de paiement (multi éclatés). ─────────────────────────────────
  const byPM = useMemo(() => {
    const acc = {};
    PAY_KEYS.forEach(k => { acc[k] = { count: 0, total: 0 }; });
    const addPm = (pm, amount) => {
      const key = PAY_KEYS.includes(pm) ? pm : 'other';
      acc[key].count++;
      acc[key].total += parseFloat(amount) || 0;
    };
    todayRevs.forEach(tx => {
      if (tx.payment_method === 'multi' && Array.isArray(tx.payments) && tx.payments.length) {
        tx.payments.forEach(p => { if (parseFloat(p.amount) > 0) addPm(p.method, p.amount); });
      } else {
        addPm(tx.payment_method, tx.amount);
      }
    });
    return acc;
  }, [todayRevs]);

  // ── Lignes ligne-par-ligne (une ligne par item ou par tx si pas d'items) ──
  const empById = useMemo(() => Object.fromEntries(emps.map(e => [e.id, e])), [emps]);
  const lines = useMemo(() => {
    const out = [];
    todayRevs.forEach(tx => {
      const emp = empById[tx.employee_id];
      const items = Array.isArray(tx.items) ? tx.items : [];
      let pmLabel;
      if (tx.payment_method === 'multi' && Array.isArray(tx.payments) && tx.payments.length) {
        pmLabel = tx.payments.map(p => PM_GRID_CFG[p.method]?.label || p.method).join(' + ');
      } else {
        pmLabel = PM_GRID_CFG[tx.payment_method]?.label || 'Autre';
      }
      const pmCfg = tx.payment_method === 'multi'
        ? { color: '#3c3489', bg: '#eeedfe' }
        : (PM_GRID_CFG[tx.payment_method] || PM_GRID_CFG.other);
      const hour = tx.time ? String(tx.time).slice(0, 5) : '';
      if (items.length > 0) {
        items.forEach((it, i) => {
          const qty  = parseInt(it.qty) || 1;
          const unit = parseFloat(it.unit_price) || 0;
          out.push({
            id: tx.id + '_' + i,
            service: it.service_name || 'Prestation',
            qty, amount: unit * qty, emp, pmLabel, pmCfg, hour,
          });
        });
      } else {
        out.push({
          id: tx.id,
          service: tx.description || 'Prestation',
          qty: parseInt(tx.qty_total) || 1,
          amount: parseFloat(tx.amount) || 0,
          emp, pmLabel, pmCfg, hour,
        });
      }
    });
    return out;
  }, [todayRevs, empById]);

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
            {fmt(dayRev)} €
          </p>
          <p style={{ margin:0, fontSize:11, color:t.muted }}>
            {todayRevs.length + (todayRevs.length > 1 ? ' transactions' : ' transaction')}
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
            {fmt(panierMoy)} €
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
                {fmt(v.total)} €
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
            {lines.length + (lines.length > 1 ? ' lignes' : ' ligne')}
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
          lines.map((l, idx) => (
            <div key={l.id} style={{
              display:'grid', gridTemplateColumns:'1fr auto', gap:12,
              padding:'12px 14px',
              borderBottom: idx < lines.length - 1 ? sep : 'none',
              alignItems:'center',
            }}>
              <div style={{ minWidth:0 }}>
                <p style={{ fontSize:14, fontWeight:500, color:t.text,
                            margin:'0 0 4px',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {l.qty > 1 && <span style={{ color:t.muted, marginRight:6 }}>{l.qty}×</span>}
                  {l.service}
                  {l.hour && (
                    <span style={{ marginLeft:8, fontSize:11, color:t.muted,
                                   fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                                   fontWeight:400 }}>
                      {l.hour}
                    </span>
                  )}
                </p>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  {l.emp && (
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:18, height:18, borderRadius:6,
                                    background: l.emp.avatar_color || t.text,
                                    display:'flex', alignItems:'center', justifyContent:'center',
                                    color:'#fff', fontSize:10, fontWeight:500, flexShrink:0 }}>
                        {(l.emp.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize:11, color:t.muted }}>{l.emp.name}</span>
                    </div>
                  )}
                  <span style={{
                    fontSize:11, fontWeight:500,
                    padding:'2px 7px', borderRadius:8,
                    background: l.pmCfg.bg, color: l.pmCfg.color,
                    whiteSpace:'nowrap',
                  }}>
                    {l.pmLabel}
                  </span>
                </div>
              </div>

              <div style={{
                fontSize:16, fontWeight:500, color:t.text,
                fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                whiteSpace:'nowrap',
              }}>
                {fmt(l.amount)} €
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
