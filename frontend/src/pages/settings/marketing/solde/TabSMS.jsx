import { useState, useEffect, useCallback } from 'react';
import SMSRechargeModal from '../../../../components/SMSRechargeModal';
import PlanGateBanner from '../../../../components/PlanGateBanner';
import { paymentsApi, campaignsApi } from '../../../../utils/api';
import { Button } from '../../../../components/primitives';
import { useAuth } from '../../../../hooks/useAuth';

export default function TabSMS({ showToast, theme }) {
  const t = theme;
  const { user } = useAuth();
  const effectivePlan = user?.subscription?.effectivePlan || 'decouverte';
  const isDecouverte = effectivePlan === 'decouverte';
  const [balance, setBalance]           = useState(null);
  const [quota, setQuota]               = useState(null);
  const [history, setHistory]           = useState([]);
  const [smsTx, setSmsTx]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [rechargeOpen, setRechargeOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [b, q, h, tx] = await Promise.all([
        paymentsApi.getSMSBalance(),
        campaignsApi.getCampaignQuota(),
        campaignsApi.getCampaignHistory(),
        paymentsApi.getSMSTransactions(),
      ]);
      setBalance(b); setQuota(q); setHistory(h); setSmsTx(tx);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const recharge  = params.get('recharge');
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

  if (loading) return (
    <div style={{ textAlign:'center', padding:40, color:t.muted }}>Chargement...</div>
  );

  // Couleur barre progression : success -> warning -> danger
  const barColor = (sent, max) => {
    const pct = sent / max;
    if (pct > 0.9) return '#991b1b';
    if (pct > 0.7) return '#92400e';
    return '#065f46';
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Bandeau gating Decouverte : SMS necessite Essentiel ou Equipe.
          Composant reutilise sur toutes les pages gated. */}
      <PlanGateBanner requiredPlan="essentiel"
                      feature="Les SMS clients (rappels, marketing)"
                      extraBenefits="fidélité, parrainage et IA marketing"/>

      {/* Solde SMS */}
      <div style={{ background:t.card, borderRadius:12,
                    border:`0.5px solid ${t.border}`, padding:20 }}>
        <p style={{ fontSize:12, color:t.muted, margin:'0 0 14px' }}>Solde SMS</p>
        <div style={{ textAlign:'center', marginBottom:18 }}>
          <span style={{ fontSize:34, fontWeight:500, color:t.text, fontFamily:'var(--mono)' }}>
            {parseFloat(balance?.balance || 0).toFixed(2)} €
          </span>
          <p style={{ fontSize:13, color:t.muted, margin:'6px 0 0' }}>
            Environ {balance?.estimated_sms || 0} SMS disponibles
          </p>
        </div>
        {isDecouverte ? (
          <Button variant="ghost" fullWidth type="button" disabled>
            {"Recharge indisponible — passez à Essentiel"}
          </Button>
        ) : (
          <Button variant="primary" fullWidth type="button" onClick={() => setRechargeOpen(true)}>
            Recharger mon solde SMS
          </Button>
        )}
      </div>

      <SMSRechargeModal open={rechargeOpen} theme={theme}
                        onClose={() => setRechargeOpen(false)}
                        onSuccess={() => { loadData(); }}
                        showToast={showToast}/>

      {/* Quota emails */}
      <div style={{ background:t.card, borderRadius:12,
                    border:`0.5px solid ${t.border}`, padding:20 }}>
        <p style={{ fontSize:12, color:t.muted, margin:'0 0 14px' }}>Emails marketing disponibles</p>
        {quota?.email && (
          <>
            <div style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12,
                            marginBottom:4, color:t.text }}>
                <span>{"Aujourd'hui"}</span>
                <span style={{ fontWeight:500 }}>
                  {quota.email.sent_today} / {quota.email.daily_limit}
                </span>
              </div>
              <div style={{ height:6, borderRadius:99, background:t.cardAlt }}>
                <div style={{ height:6, borderRadius:99,
                              width:`${Math.min(100, (quota.email.sent_today / quota.email.daily_limit) * 100)}%`,
                              background: barColor(quota.email.sent_today, quota.email.daily_limit),
                              transition:'width 0.3s' }}/>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12,
                            marginBottom:4, color:t.text }}>
                <span>Ce mois</span>
                <span style={{ fontWeight:500 }}>
                  {quota.email.sent_month} / {quota.email.monthly_limit}
                </span>
              </div>
              <div style={{ height:6, borderRadius:99, background:t.cardAlt }}>
                <div style={{ height:6, borderRadius:99,
                              width:`${Math.min(100, (quota.email.sent_month / quota.email.monthly_limit) * 100)}%`,
                              background: barColor(quota.email.sent_month, quota.email.monthly_limit),
                              transition:'width 0.3s' }}/>
              </div>
            </div>
            {quota.email.month_reset && (
              <p style={{ fontSize:11, color:t.dim, margin:0 }}>
                Reset le {new Date(new Date(quota.email.month_reset).getFullYear(), new Date(quota.email.month_reset).getMonth() + 1, 1).toLocaleDateString('fr-FR')}
              </p>
            )}
          </>
        )}
      </div>

      {/* Historique campagnes */}
      <div style={{ background:t.card, borderRadius:12,
                    border:`0.5px solid ${t.border}`, padding:20 }}>
        <p style={{ fontSize:12, color:t.muted, margin:'0 0 12px' }}>Historique</p>
        {!history.length ? (
          <p style={{ fontSize:13, color:t.dim, textAlign:'center', padding:16, margin:0 }}>
            Aucune campagne
          </p>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:`0.5px solid ${t.separator}` }}>
                  {['Date','Canal','Envoyes','Cout','Statut'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'7px 6px',
                                         fontWeight:500, color:t.muted, fontSize:11 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 10).map(c => (
                  <tr key={c.id} style={{ borderBottom:`0.5px solid ${t.separator}` }}>
                    <td style={{ padding:'7px 6px', color:t.text }}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '-'}
                    </td>
                    <td style={{ padding:'7px 6px', color:t.text }}>{c.channel}</td>
                    <td style={{ padding:'7px 6px', color:t.text }}>
                      {(c.sent_sms || 0) + (c.sent_email || 0)}
                    </td>
                    <td style={{ padding:'7px 6px', color:t.text }}>
                      {Number(c.sms_cost || 0).toFixed(2)} €
                    </td>
                    <td style={{ padding:'7px 6px' }}>
                      <span style={{ fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:99,
                                     background: c.status === 'completed' ? '#f0fdf4' : '#fffbeb',
                                     color: c.status === 'completed' ? '#065f46' : '#92400e' }}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transactions SMS */}
      <div style={{ background:t.card, borderRadius:12,
                    border:`0.5px solid ${t.border}`, padding:20 }}>
        <p style={{ fontSize:12, color:t.muted, margin:'0 0 12px' }}>Transactions</p>
        {!smsTx.length ? (
          <p style={{ fontSize:13, color:t.dim, textAlign:'center', padding:16, margin:0 }}>
            Aucune transaction
          </p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {smsTx.slice(0, 10).map(tx => (
              <div key={tx.id}
                   style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                            padding:'8px 10px', borderRadius:8,
                            background:t.cardAlt }}>
                <div>
                  <p style={{ fontSize:12, fontWeight:500, color:t.text, margin:0 }}>
                    {tx.description || tx.type}
                  </p>
                  <p style={{ fontSize:10, color:t.muted, margin:'2px 0 0' }}>
                    {tx.created_at ? new Date(tx.created_at).toLocaleDateString('fr-FR') : ''}
                  </p>
                </div>
                <span style={{ fontSize:13, fontWeight:500,
                               color: tx.type === 'credit' ? '#065f46' : '#991b1b' }}>
                  {tx.type === 'credit' ? '+' : '-'}{Number(tx.amount || 0).toFixed(2)} €
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
