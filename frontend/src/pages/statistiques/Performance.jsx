// Statistiques > Performance — KPIs mois + 30j + CA par employé + top
// prestations (TabStats) + bloc « Totaux par méthode de paiement » (refonte
// commit C : 7 cards, alimenté par statsApi.getByPaymentMethod → consomme
// le nouveau champ `by_payment_method` qui éclate les multi traçables en
// vraies méthodes et isole les 4 rows multi legacy sous `multi_legacy`).
import { useEffect, useState } from 'react';
import TabStats from '../settings/TabStats';
import { statsApi } from '../../utils/api';

// Palette pastel par méthode + path SVG d'icône (Tabler outline). Pas
// d'emoji UI (FDS-2026 §6).
const SVG_BASE = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
};
const PMIcon = ({ paths, size = 28, color }) => (
  <svg {...SVG_BASE} width={size} height={size} style={{ color, flexShrink: 0 }}
       dangerouslySetInnerHTML={{ __html: paths }} />
);
const PATH_CASH       = '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>';
const PATH_BANK       = '<line x1="3" y1="21" x2="21" y2="21"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="5 6 12 3 19 6"/><line x1="4" y1="10" x2="4" y2="21"/><line x1="20" y1="10" x2="20" y2="21"/><line x1="8" y1="14" x2="8" y2="17"/><line x1="12" y1="14" x2="12" y2="17"/><line x1="16" y1="14" x2="16" y2="17"/>';
const PATH_CARD       = '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>';
const PATH_GIFT       = '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>';
const PATH_GLOBE      = '<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0 -18"/>';
const PATH_DOTS       = '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';

// Ordre + style par méthode (label/icon viennent du backend, palette ici).
const PM_CFG = [
  { id: 'cash',         text: '#065f46', bg: '#f0fdf4', paths: PATH_CASH  },
  { id: 'transfer',     text: '#0e7490', bg: '#ecfeff', paths: PATH_BANK  },
  { id: 'card',         text: '#4338ca', bg: '#eef2ff', paths: PATH_CARD  },
  { id: 'gift_card',    text: '#9a3412', bg: '#fff7ed', paths: PATH_GIFT  },
  { id: 'card_online',  text: '#0891b2', bg: '#cffafe', paths: PATH_GLOBE },
  { id: 'other',        text: '#92400e', bg: '#fffbeb', paths: PATH_DOTS  },
  { id: 'multi_legacy', text: '#3c3489', bg: '#eeedfe', paths: PATH_DOTS  },
];

const PERIODS = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'week',  label: '7 jours'     },
  { id: 'month', label: '30 jours'    },
];

function fmtEur(n) {
  const v = Number(n || 0);
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' DA';
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
          <p style={{ margin:0, fontSize:11, fontWeight:500, color:t.muted,
                      textTransform:'uppercase', letterSpacing:'0.04em' }}>
            {"Totaux par méthode de paiement"}
          </p>
          <p style={{ margin:'4px 0 0', fontSize:11, color:t.muted }}>
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
                    gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',
                    gap:8 }}>
        {PM_CFG.map(m => {
          // Nouveau format `by_payment_method` (commit C) : { label, icon,
          // total_cents, count }. Fallback sur ancien `by_method` pour
          // compat si réponse API en cache antérieure au déploiement.
          const newFmt = data?.by_payment_method?.[m.id];
          const oldFmt = data?.by_method?.[m.id];
          const totalCents = newFmt
            ? (newFmt.total_cents || 0)
            : Math.round((oldFmt?.amount || 0) * 100);
          const count = newFmt
            ? (newFmt.count || 0)
            : (oldFmt?.count || 0);
          const label = newFmt?.label || m.id;
          return (
            <div key={m.id}
                 style={{ padding:'14px 14px', borderRadius:10,
                          background: m.bg,
                          border:'0.5px solid rgba(0,0,0,0.04)',
                          display:'flex', alignItems:'flex-start', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:10,
                            background:'rgba(255,255,255,0.55)',
                            display:'flex', alignItems:'center',
                            justifyContent:'center', flexShrink:0 }}>
                <PMIcon paths={m.paths} size={22} color={m.text} />
              </div>
              <div style={{ minWidth:0, flex:1 }}>
                <p style={{ margin:0, fontSize:11, fontWeight:500, color:m.text,
                            textTransform:'uppercase', letterSpacing:'0.04em',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {label}
                </p>
                <p style={{ margin:'4px 0 2px', fontSize:18, fontWeight:500,
                            color:m.text, fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {loading ? "…" : fmtEur(totalCents / 100)}
                </p>
                <p style={{ margin:0, fontSize:10, color:m.text, opacity:0.75 }}>
                  {count + (count === 1 ? " transaction" : " transactions")}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {data && (
        <p style={{ margin:0, fontSize:11, color:t.muted, textAlign:'right' }}>
          {"Total période : "}
          <strong style={{ color:t.text, fontWeight:500 }}>
            {fmtEur((data.total_by_period_cents != null ? data.total_by_period_cents / 100 : data.total) || 0)}
          </strong>
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
