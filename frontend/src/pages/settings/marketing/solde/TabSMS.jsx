import { useState, useEffect, useCallback } from 'react';
import SMSRechargeModal from '../../../../components/SMSRechargeModal';
import { paymentsApi, campaignsApi } from '../../../../utils/api';

export default function TabSMS({ showToast, theme }) {
  const isDark = theme.mode === 'dark';
  const [balance, setBalance]       = useState(null);
  const [quota, setQuota]           = useState(null);
  const [history, setHistory]       = useState([]);
  const [smsTx, setSmsTx]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [rechargeOpen, setRechargeOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [b, q, h, t] = await Promise.all([
        paymentsApi.getSMSBalance(),
        campaignsApi.getCampaignQuota(),
        campaignsApi.getCampaignHistory(),
        paymentsApi.getSMSTransactions(),
      ]);
      setBalance(b); setQuota(q); setHistory(h); setSmsTx(t);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const recharge  = params.get('recharge');
    // Compatibilité : si on revient d'une ancienne redirection Stripe Checkout
    if (recharge && sessionId) {
      window.history.replaceState({}, '', window.location.pathname);
      if (recharge === 'success') {
        paymentsApi.verifySMSCheckout(sessionId)
          .then(r => {
            if (r.credited) showToast(`+${r.sms_count} SMS credites !`, 'success');
            else if (r.already_credited) showToast('Recharge deja effectuee', 'info');
            loadData();
          })
          .catch(() => loadData());
      } else if (recharge === 'cancelled') {
        showToast('Paiement annule', 'info');
        loadData();
      }
    } else {
      if (recharge) window.history.replaceState({}, '', window.location.pathname);
      loadData();
    }
  }, []);

  if (loading) return <div style={{ textAlign:'center', padding:40, color:theme.muted }}>Chargement...</div>;

  const barColor = (sent, max) => {
    const pct = sent / max;
    if (pct > 0.9) return '#ef4444';
    if (pct > 0.7) return '#f59e0b';
    return '#10b981';
  };

  return (
    <div className="space-y-4">
      <div style={{ background:theme.card, borderRadius:16, border:`1px solid ${theme.border}`, padding:20 }}>
        <p style={{ fontSize:12, fontWeight:800, color:theme.muted, marginBottom:16, textTransform:'uppercase', letterSpacing:'0.05em' }}>Solde SMS</p>
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <span style={{ fontSize:40, fontWeight:900, color:theme.text }}>{parseFloat(balance?.balance || 0).toFixed(2)} EUR</span>
          <p style={{ fontSize:14, color:theme.muted, margin:'6px 0 0' }}>Environ {balance?.estimated_sms || 0} SMS disponibles</p>
        </div>

        <button onClick={() => setRechargeOpen(true)}
          style={{
            width:'100%', padding:14, borderRadius:12, border:'none',
            background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'white',
            fontWeight:800, fontSize:14, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow:'0 6px 18px rgba(99,102,241,0.35)',
          }}>
          ⚡ Recharger mon solde SMS
        </button>
      </div>

      <SMSRechargeModal
        open={rechargeOpen}
        theme={theme}
        onClose={() => setRechargeOpen(false)}
        onSuccess={() => { loadData(); }}
        showToast={showToast}
      />

      <div style={{ background:theme.card, borderRadius:16, border:`1px solid ${theme.border}`, padding:20 }}>
        <p style={{ fontSize:12, fontWeight:800, color:theme.muted, marginBottom:16, textTransform:'uppercase', letterSpacing:'0.05em' }}>Emails marketing disponibles</p>
        {quota?.email && (
          <>
            <div style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4, color:theme.text }}>
                <span>Aujourd'hui</span>
                <span style={{ fontWeight:700 }}>{quota.email.sent_today} / {quota.email.daily_limit}</span>
              </div>
              <div style={{ height:8, borderRadius:4, background: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0' }}>
                <div style={{ height:8, borderRadius:4, width:`${Math.min(100, (quota.email.sent_today / quota.email.daily_limit) * 100)}%`,
                  background: barColor(quota.email.sent_today, quota.email.daily_limit), transition:'width 0.3s' }} />
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4, color:theme.text }}>
                <span>Ce mois</span>
                <span style={{ fontWeight:700 }}>{quota.email.sent_month} / {quota.email.monthly_limit}</span>
              </div>
              <div style={{ height:8, borderRadius:4, background: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0' }}>
                <div style={{ height:8, borderRadius:4, width:`${Math.min(100, (quota.email.sent_month / quota.email.monthly_limit) * 100)}%`,
                  background: barColor(quota.email.sent_month, quota.email.monthly_limit), transition:'width 0.3s' }} />
              </div>
            </div>
            {quota.email.month_reset && (
              <p style={{ fontSize:11, color:theme.dim }}>
                Reset le {new Date(new Date(quota.email.month_reset).getFullYear(), new Date(quota.email.month_reset).getMonth() + 1, 1).toLocaleDateString('fr-FR')}
              </p>
            )}
          </>
        )}
      </div>

      <div style={{ background:theme.card, borderRadius:16, border:`1px solid ${theme.border}`, padding:20 }}>
        <p style={{ fontSize:12, fontWeight:800, color:theme.muted, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>Historique</p>
        {!history.length ? (
          <p style={{ fontSize:13, color:theme.dim, textAlign:'center', padding:16 }}>Aucune campagne</p>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${theme.border}` }}>
                  {['Date','Canal','Envoyes','Cout','Statut'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'7px 6px', fontWeight:700, color:theme.muted, fontSize:11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 10).map(c => (
                  <tr key={c.id} style={{ borderBottom:`1px solid ${theme.border}` }}>
                    <td style={{ padding:'7px 6px', color:theme.text }}>{c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '-'}</td>
                    <td style={{ padding:'7px 6px', color:theme.text }}>{c.channel}</td>
                    <td style={{ padding:'7px 6px', color:theme.text }}>{(c.sent_sms||0)+(c.sent_email||0)}</td>
                    <td style={{ padding:'7px 6px', color:theme.text }}>{Number(c.sms_cost||0).toFixed(2)}EUR</td>
                    <td style={{ padding:'7px 6px' }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6,
                        background: c.status === 'completed' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                        color: c.status === 'completed' ? '#10b981' : '#f59e0b' }}>{c.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ background:theme.card, borderRadius:16, border:`1px solid ${theme.border}`, padding:20 }}>
        <p style={{ fontSize:12, fontWeight:800, color:theme.muted, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>Transactions</p>
        {!smsTx.length ? (
          <p style={{ fontSize:13, color:theme.dim, textAlign:'center', padding:16 }}>Aucune transaction</p>
        ) : (
          <div className="space-y-2">
            {smsTx.slice(0, 10).map(tx => (
              <div key={tx.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'8px 10px', borderRadius:10, background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc' }}>
                <div>
                  <p style={{ fontSize:12, fontWeight:600, color:theme.text, margin:0 }}>{tx.description || tx.type}</p>
                  <p style={{ fontSize:10, color:theme.muted, margin:'2px 0 0' }}>{tx.created_at ? new Date(tx.created_at).toLocaleDateString('fr-FR') : ''}</p>
                </div>
                <span style={{ fontSize:13, fontWeight:800, color: tx.type === 'credit' ? '#10b981' : '#ef4444' }}>
                  {tx.type === 'credit' ? '+' : '-'}{Number(tx.amount||0).toFixed(2)} EUR
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
