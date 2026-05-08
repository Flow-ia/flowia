// Statistiques > Performance — KPIs mois + 30j + CA par employé + top
// prestations (TabStats) + nouveau bloc « moyens de paiement » (pastel
// §15 INVENTAIRE) alimenté par statsApi.getByPaymentMethod(period).
import { useEffect, useState } from 'react';
import TabStats from '../settings/TabStats';
import { statsApi } from '../../utils/api';

// Palette pastel — 'card_online' = paiement Stripe Connect (distinct de
// 'card' qui est la CB au comptoir). Coherent avec PAY_INFO de shared.jsx
// et PM_GRID_CFG de Dashboard/historique/caisse (commit 8906158).
const PM_CFG = [
  { id: 'cash',        label: 'Espèces',  text: '#065f46', bg: '#f0fdf4' },
  { id: 'card',        label: 'Carte',    text: '#4338ca', bg: '#eef2ff' },
  { id: 'card_online', label: 'En ligne', text: '#0891b2', bg: '#cffafe' },
  { id: 'transfer',    label: 'Virement', text: '#0e7490', bg: '#ecfeff' },
  { id: 'other',       label: 'Autre',    text: '#92400e', bg: '#fffbeb' },
  { id: 'multi',       label: 'Multi',    text: '#3c3489', bg: '#eeedfe' },
];

const PERIODS = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'week',  label: '7 jours'     },
  { id: 'month', label: '30 jours'    },
];

function fmtEur(n) {
  const v = Number(n || 0);
  return v.toFixed(2).replace('.', ',') + ' €';
}

function PaymentMethodsBlock({ theme: t, showToast }) {
  const [period, setPeriod] = useState('today');
  const [data,   setData]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    statsApi.getByPaymentMethod(period)
      .then(r => { if (!cancelled) { setData(r); setLoading(false); } })
      .catch(e => {
        if (cancelled) return;
        setData(null); setLoading(false);
        if (showToast) showToast(e.message || 'Erreur ventilation paiements', 'error');
      });
    return () => { cancelled = true; };
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ padding:16, borderRadius:12, background:t.card,
                  border:`0.5px solid ${t.border}`,
                  display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    gap:10, flexWrap:'wrap' }}>
        <div>
          <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
            {"Moyens de paiement"}
          </p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
            {"CA ventilé par méthode d'encaissement (revenus uniquement)"}
          </p>
        </div>
        <div style={{ display:'flex', gap:3, padding:2, borderRadius:7,
                      background:t.cardAlt }}>
          {PERIODS.map(p => {
            const active = period === p.id;
            return (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                      style={{ padding:'5px 10px', borderRadius:5, border:'none',
                               background: active ? t.card : 'transparent',
                               color: active ? t.text : t.muted,
                               fontSize:11, fontWeight: active ? 500 : 400,
                               cursor:'pointer', fontFamily:'inherit' }}>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',
                    gap:8 }}>
        {PM_CFG.map(m => {
          const entry = data?.by_method?.[m.id] || { amount: 0, count: 0 };
          return (
            <div key={m.id}
                 style={{ padding:'12px 14px', borderRadius:10,
                          background: m.bg,
                          border:'0.5px solid rgba(0,0,0,0.04)' }}>
              <p style={{ margin:0, fontSize:11, fontWeight:500, color:m.text,
                          textTransform:'uppercase', letterSpacing:'0.04em' }}>
                {m.label}
              </p>
              <p style={{ margin:'4px 0 2px', fontSize:18, fontWeight:500,
                          color:m.text, fontFamily:'monospace' }}>
                {loading ? '…' : fmtEur(entry.amount)}
              </p>
              <p style={{ margin:0, fontSize:10, color:m.text, opacity:0.75 }}>
                {(entry.count || 0) + (entry.count === 1 ? ' transaction' : ' transactions')}
              </p>
            </div>
          );
        })}
      </div>

      {data && (
        <p style={{ margin:0, fontSize:11, color:t.muted, textAlign:'right' }}>
          {"Total période : "}<strong style={{ color:t.text, fontWeight:500 }}>{fmtEur(data.total)}</strong>
        </p>
      )}
    </div>
  );
}

export default function Performance({ transactions, employees, categories, theme, showToast }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <PaymentMethodsBlock theme={theme} showToast={showToast}/>
      <TabStats transactions={transactions} employees={employees} categories={categories} theme={theme}/>
    </div>
  );
}
