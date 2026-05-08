// src/pages/Historique.jsx
// Page unifiée Stats + Historique du jour (remplace les 2 popups Dashboard).
// Accès gardé par PIN (PinAccessModal) — tant que le PIN n'est pas validé,
// le contenu est masqué et on affiche uniquement le gate.
//
// Filtre employé en tête : "Tous" par défaut. Changer le filtre recalcule
// à la volée : CA total, prestations, répartition par moyen de paiement,
// liste ligne-par-ligne (sans F5).
import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { todayStr } from '../utils/dates';
import { I } from '../utils/icons';
import { PinAccessModal } from './Dashboard';

const nd    = d => { if (!d) return ''; const s = typeof d === 'string' ? d : new Date(d).toISOString(); return s.substring(0, 10); };
const fmtN  = n => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PM_CFG = {
  cash:     { label: 'Especes',  color: '#065f46', bg: '#f0fdf4' },
  card:     { label: 'Carte',    color: '#4338ca', bg: '#eef2ff' },
  transfer: { label: 'Virement', color: '#0e7490', bg: '#ecfeff' },
  other:    { label: 'Autre',    color: '#92400e', bg: '#fffbeb' },
};

export default function Historique({ transactions, employees }) {
  const { theme: t } = useTheme();
  const navigate     = useNavigate();
  const today        = todayStr();

  // Gate PIN : page blanche tant que pas validé. Annuler = retour Dashboard.
  // PinAccessModal appelle onSuccess() PUIS onClose() à la validation — on
  // garde un flag via ref pour ne PAS rediriger vers /dashboard dans ce cas
  // (sinon l'utilisateur valide son PIN et repart aussitôt sur le dashboard).
  const [unlocked, setUnlocked] = useState(false);
  const [pinOpen,  setPinOpen]  = useState(true);
  const successRef = useRef(false);

  // Filtre employé — defaut "all" (toutes les ventes du jour)
  const [empFilter, setEmpFilter] = useState('all');

  // Si aucun employé actif, on skip le gate (cohérent avec Dashboard actuel).
  useEffect(() => {
    if (employees.filter(e => e.is_active !== false).length === 0) {
      setUnlocked(true); setPinOpen(false);
    }
  }, [employees]);

  // ── Filtre appliqué : toutes les recettes du jour, éventuellement narrowed à 1 employé.
  const todayRevsFiltered = useMemo(() => {
    let list = transactions.filter(tx => nd(tx.date) === today && tx.type === 'revenue');
    if (empFilter !== 'all') list = list.filter(tx => tx.employee_id === empFilter);
    return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [transactions, today, empFilter]);

  // ── KPIs recalculés sur le filtre ─────────────────────────────────────────
  // dayRev : SUM amount sur tous les revenue (includes negative = refunds)
  //   -> CA NET du jour (encaissements - remboursements). Comportement correct.
  // prestCount : COUNT prestations effectives. On EXCLUT les refunds
  //   (source='rdv_refund' ou amount<0) sinon le compteur s'inflate
  //   alors qu'un refund n'est pas une prestation effectuee.
  const dayRev = todayRevsFiltered.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
  const prestCount = todayRevsFiltered.reduce((s, tx) => {
    if (tx.source === 'rdv_refund' || (parseFloat(tx.amount) || 0) < 0) return s;
    return s + (parseInt(tx.qty_total) || 1);
  }, 0);

  // Par moyen de paiement — eclate les 'multi' en ligne par sous-paiement
  // pour refléter le CA réel de chaque moyen (sinon tout finissait dans 'Autre').
  const byPM = useMemo(() => {
    const acc = {};
    const addPm = (pm, amount) => {
      const key = pm || 'other';
      if (!acc[key]) acc[key] = { count: 0, total: 0 };
      acc[key].count++;
      acc[key].total += parseFloat(amount) || 0;
    };
    todayRevsFiltered.forEach(tx => {
      if (tx.payment_method === 'multi' && Array.isArray(tx.payments) && tx.payments.length) {
        tx.payments.forEach(p => { if (parseFloat(p.amount) > 0) addPm(p.method, p.amount); });
      } else {
        addPm(tx.payment_method, tx.amount);
      }
    });
    return acc;
  }, [todayRevsFiltered]);

  // ── Lignes ligne-par-ligne (une ligne par item ou par tx si pas d'items) ───
  const empById = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees]);
  const lines = useMemo(() => {
    const out = [];
    todayRevsFiltered.forEach(tx => {
      const emp = empById[tx.employee_id];
      const items = Array.isArray(tx.items) ? tx.items : [];
      let pmLabel;
      if (tx.payment_method === 'multi' && Array.isArray(tx.payments) && tx.payments.length) {
        pmLabel = tx.payments.map(p => PM_CFG[p.method]?.label || p.method).join(' + ');
      } else {
        pmLabel = PM_CFG[tx.payment_method]?.label || 'Autre';
      }
      const pmCfg = tx.payment_method === 'multi'
        ? { color: '#3c3489', bg: '#eeedfe' }
        : (PM_CFG[tx.payment_method] || PM_CFG.other);
      const hour = tx.time ? String(tx.time).slice(0, 5) : '';
      if (items.length > 0) {
        items.forEach((it, i) => {
          const qty  = parseInt(it.qty) || 1;
          const unit = parseFloat(it.unit_price) || 0;
          out.push({
            id: `${tx.id}_${i}`,
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
  }, [todayRevsFiltered, empById]);

  const sep = `0.5px solid ${t.separator}`;
  const activeEmps = employees.filter(e => e.is_active !== false);

  // ── Si PIN non validé, on affiche le gate + une coquille vide ──────────────
  if (!unlocked) {
    return (
      <div style={{ minHeight:'100vh', background:t.bg }}>
        <PinAccessModal
          open={pinOpen}
          onClose={() => {
            setPinOpen(false);
            if (!successRef.current) navigate('/dashboard');
          }}
          onSuccess={() => { successRef.current = true; setUnlocked(true); setPinOpen(false); }}
          employees={employees}
          theme={t}
          title="Historique & Stats"
          actionLabel="Voir les ventes du jour"/>
      </div>
    );
  }

  // Select stylé (utilitaire inline pour garder le fichier auto-suffisant)
  const selectStyle = {
    padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit', cursor:'pointer',
  };

  return (
    <div style={{ minHeight:'100vh', background:t.bg, paddingBottom:40 }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding:'18px 16px 10px',
                    borderBottom:sep, background:t.bg,
                    position:'sticky', top:0, zIndex:5 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, maxWidth:720, margin:'0 auto' }}>
          <button onClick={() => navigate('/dashboard')}
                  aria-label="Retour"
                  style={{ width:34, height:34, borderRadius:8,
                           background:t.cardAlt, border:`0.5px solid ${t.border}`,
                           cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                           color:t.muted, fontFamily:'inherit' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:15, height:15 }}>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:15, fontWeight:500, color:t.text }}>Historique & Stats</p>
            <p style={{ margin:0, fontSize:11, color:t.muted }}>Ventes du jour</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:720, margin:'0 auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* ── Filtre employé ────────────────────────────────────────────── */}
        <div style={{ padding:14, borderRadius:12, background:t.card,
                      border:`0.5px solid ${t.border}` }}>
          <p style={{ margin:'0 0 8px', fontSize:11, color:t.muted }}>Filtrer par employé</p>
          <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} style={{ ...selectStyle, width:'100%' }}>
            <option value="all">Tous les employés</option>
            {activeEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        {/* ── KPIs (recalculés sur le filtre) ───────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ padding:'14px 14px', borderRadius:12,
                        background:t.card, border:`0.5px solid ${t.border}` }}>
            <p style={{ fontSize:11, color:t.muted, margin:'0 0 6px' }}>CA total</p>
            <p style={{ fontSize:22, fontWeight:500, color:t.text,
                        fontFamily:'monospace', margin:0 }}>
              {fmtN(dayRev)} €
            </p>
          </div>
          <div style={{ padding:'14px 14px', borderRadius:12,
                        background:t.card, border:`0.5px solid ${t.border}` }}>
            <p style={{ fontSize:11, color:t.muted, margin:'0 0 6px' }}>Prestations</p>
            <p style={{ fontSize:22, fontWeight:500, color:t.text,
                        fontFamily:'monospace', margin:0 }}>
              {prestCount}
            </p>
          </div>
        </div>

        {/* ── CA par moyen de paiement ──────────────────────────────────── */}
        {Object.keys(byPM).length > 0 && (
          <div style={{ borderRadius:12, background:t.card,
                        border:`0.5px solid ${t.border}`, overflow:'hidden' }}>
            <div style={{ padding:'12px 14px', borderBottom:sep }}>
              <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>CA par moyen de paiement</p>
            </div>
            <div style={{ display:'grid',
                          gridTemplateColumns:`repeat(${Math.min(Object.keys(byPM).length, 4)}, 1fr)`,
                          gap:8, padding:12 }}>
              {Object.entries(byPM).map(([pm, v]) => {
                const cfg = PM_CFG[pm] || PM_CFG.other;
                return (
                  <div key={pm} style={{ padding:'10px 8px', borderRadius:8, textAlign:'center',
                                         background: cfg.bg }}>
                    <p style={{ fontSize:11, color:cfg.color, margin:'0 0 4px',
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {cfg.label}
                    </p>
                    <p style={{ fontSize:15, fontWeight:500, color:cfg.color,
                                fontFamily:'monospace', margin:'0 0 2px', lineHeight:1.1 }}>
                      {fmtN(v.total)} €
                    </p>
                    <p style={{ fontSize:10, color:cfg.color, opacity:0.65, margin:0 }}>
                      {v.count} tx
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Liste ligne-par-ligne ─────────────────────────────────────── */}
        <div style={{ borderRadius:12, background:t.card,
                      border:`0.5px solid ${t.border}`, overflow:'hidden' }}>
          <div style={{ padding:'12px 14px', borderBottom:sep,
                        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>
              Encaissements ligne par ligne
            </p>
            <span style={{ fontSize:11, color:t.muted }}>
              {lines.length} ligne{lines.length > 1 ? 's' : ''}
            </span>
          </div>

          {lines.length === 0 ? (
            <div style={{ padding:'48px 16px', textAlign:'center' }}>
              <I.Wallet style={{ width:30, height:30, margin:'0 auto 10px', color:t.dim, display:'block' }}/>
              <p style={{ fontSize:13, color:t.muted, margin:0 }}>
                Aucune vente{empFilter !== 'all' ? ' pour cet employé' : ''} aujourd'hui
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
                  <p style={{
                    fontSize:14, fontWeight:500, color:t.text,
                    margin:'0 0 4px',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  }}>
                    {l.qty > 1 && <span style={{ color:t.muted, marginRight:6 }}>{l.qty}×</span>}
                    {l.service}
                    {l.hour && (
                      <span style={{ marginLeft:8, fontSize:11, color:t.muted, fontFamily:'monospace', fontWeight:400 }}>
                        {l.hour}
                      </span>
                    )}
                  </p>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    {l.emp && (
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{
                          width:18, height:18, borderRadius:6,
                          background:l.emp.avatar_color || t.text,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          color:'#fff', fontSize:10, fontWeight:500, flexShrink:0,
                        }}>
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
                  fontFamily:'monospace', whiteSpace:'nowrap',
                }}>
                  {fmtN(l.amount)} €
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
