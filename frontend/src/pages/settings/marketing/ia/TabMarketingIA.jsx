import { useState, useEffect } from 'react';
import { campaignsApi, paymentsApi } from '../../../../utils/api';
import StepIndicator from '../components/StepIndicator';
import KpiCard from '../components/KpiCard';
import MiniRow from '../components/MiniRow';
import HistoryItem from './HistoryItem';
import { I } from '../../../../utils/icons';
import { Button } from '../../../../components/primitives';

// Marketing IA — Wizard 3 etapes : Saisie → Plan → Confirmation
export default function TabMarketingIA({ theme, showToast, onGoToSolde }) {
  const t = theme;
  const [step, setStep]         = useState(1);
  const [budget, setBudget]     = useState(20);
  const [duration, setDuration] = useState(15);
  const [balance, setBalance]   = useState(null);
  const [plan, setPlan]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [launched, setLaunched] = useState(null);
  const [discounts, setDiscounts] = useState({ risque:15, perdu:25, fidele:10 });
  const [recalcing, setRecalcing] = useState(false);
  const [history, setHistory]   = useState([]);

  const [pricePerSmsBackend, setPricePerSmsBackend] = useState(null);
  useEffect(() => {
    paymentsApi.getSMSBalance().then(b => {
      setBalance(parseFloat(b.balance));
      if (b.price_per_sms) setPricePerSmsBackend(parseFloat(b.price_per_sms));
    }).catch(() => {});
    campaignsApi.getAiHistory().then(setHistory).catch(() => {});
  }, []);

  useEffect(() => {
    if (step !== 2 || !plan) return;
    let cancelled = false;
    setRecalcing(true);
    const to = setTimeout(async () => {
      try {
        const r = await campaignsApi.recalculateAutoPlan({
          budget, duration_days: duration, discounts,
        });
        if (!cancelled) {
          setPlan(prev => prev ? {
            ...prev,
            total_sms: r.total_sms,
            estimated_cost: r.estimated_cost,
            estimated_clients_min: r.estimated_clients_min,
            estimated_clients_max: r.estimated_clients_max,
            estimated_revenue_min: r.estimated_revenue_min,
            estimated_revenue_max: r.estimated_revenue_max,
            balance_sufficient: r.balance_sufficient,
            phases: prev.phases.map(p => {
              const u = r.phases.find(x => x.segment === p.segment);
              return u ? { ...p, sms_count: u.sms_count, discount: u.discount } : p;
            }),
          } : prev);
        }
      } catch {}
      finally { if (!cancelled) setRecalcing(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(to); };
  }, [discounts.risque, discounts.perdu, discounts.fidele, budget, duration]);

  const parseEnvFloat = (v, fallback) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const smsCostFallback   = parseEnvFloat(import.meta.env.VITE_SMS_COST_UNIT, 0.045);
  const smsMarginFallback = parseEnvFloat(import.meta.env.VITE_SMS_MARGIN_PERCENT, 30);
  const pricePerSms = pricePerSmsBackend ?? (smsCostFallback * (1 + smsMarginFallback / 100));
  const previewSms  = pricePerSms > 0 ? Math.floor(budget / pricePerSms) : 0;
  const insufficient = balance != null && budget > balance;
  const thirdDays = Math.max(1, Math.round(duration / 3));
  const phaseBreakdown = [
    { label: 'Clients a risque', days: `J1-J${thirdDays}`,                share: 0.40 },
    { label: 'Clients perdus',   days: `J${thirdDays + 1}-J${thirdDays * 2}`, share: 0.35 },
    { label: 'Clients fideles',  days: `J${thirdDays * 2 + 1}-J${duration}`,  share: 0.25 },
  ];

  const generate = async () => {
    setLoading(true);
    try {
      const p = await campaignsApi.getAutoPlan({ budget, duration_days: duration });
      setPlan(p);
      if (p.discounts) setDiscounts({ ...p.discounts });
      setStep(2);
    } catch (e) {
      showToast(e.message || 'Erreur generation plan', 'error');
    } finally { setLoading(false); }
  };

  const launch = async () => {
    setLoading(true);
    try {
      const r = await campaignsApi.sendAutoCampaign({ budget, duration_days: duration, discounts });
      setLaunched(r);
      setStep(3);
      paymentsApi.getSMSBalance().then(b => setBalance(parseFloat(b.balance))).catch(() => {});
      campaignsApi.getAiHistory().then(setHistory).catch(() => {});
    } catch (e) {
      showToast(e.message || 'Erreur lancement', 'error');
    } finally { setLoading(false); }
  };

  function previewSmsFor(phase) {
    const firstClient = phase.clients?.[0];
    const fn = firstClient?.first_name || 'Client';
    const code = firstClient?.personal_code || `PRENOM${phase.discount}`;
    const m = plan?.merchant || {};
    const validity = phase.validity_days || (duration + 7);
    const parts = [
      `${fn}, -${phase.discount}% avec le code ${code}`,
      `Valable ${validity}j sur place & en ligne`,
    ];
    if (m.business_name) parts.push(m.business_name);
    if (m.phone)         parts.push(`Tel: ${m.phone}`);
    if (m.address)       parts.push(m.address);
    if (m.site_url)      parts.push(m.site_url);
    let msg = parts.join('. ');
    if (msg.length > 160 && m.address) msg = parts.filter(p => p !== m.address).join('. ');
    if (msg.length > 160) msg = msg.slice(0, 157) + '...';
    return msg;
  }

  const reset = () => { setPlan(null); setLaunched(null); setStep(1); };

  // Etape 3 — Confirmation
  if (step === 3 && launched) {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ padding:'32px 22px', borderRadius:12,
                      background:t.card, border:`0.5px solid ${t.border}`, textAlign:'center' }}>
          <div style={{ width:64, height:64, borderRadius:'50%', background:'#f0fdf4',
                        display:'inline-flex', alignItems:'center', justifyContent:'center',
                        marginBottom:16 }}>
            <I.Check style={{ width:32, height:32, color:'#065f46' }}/>
          </div>
          <h3 style={{ margin:'0 0 8px', fontSize:18, fontWeight:500, color:t.text }}>
            Campagne lancee avec succes
          </h3>
          <p style={{ margin:'0 0 18px', fontSize:13, color:t.muted }}>
            Vos SMS partiront automatiquement selon le planning.
          </p>
          <div style={{ textAlign:'left', padding:'14px 16px', borderRadius:8,
                        background:t.cardAlt, border:`0.5px solid ${t.border}` }}>
            <MiniRow label="SMS planifies"  value={launched.total_sms} theme={theme}/>
            <MiniRow label="Duree"          value={`${launched.duration_days} jours`} theme={theme}/>
            <MiniRow label="Montant debite" value={`${launched.estimated_cost.toFixed(2)} €`} theme={theme}/>
            <MiniRow label="Solde restant"  value={`${(launched.new_balance || 0).toFixed(2)} €`} theme={theme}/>
          </div>
          <div style={{ marginTop:18 }}>
            <Button variant="primary" fullWidth type="button" onClick={reset}>
              Retour
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Etape 2 — Plan
  if (step === 2 && plan) {
    const canLaunch = plan.balance_sufficient && plan.total_sms > 0;
    if (plan.total_sms === 0) {
      const totalClientsAll = (plan.segment_totals?.champion || 0)
                            + (plan.segment_totals?.fidele || 0)
                            + (plan.segment_totals?.prometteur || 0)
                            + (plan.segment_totals?.risque || 0)
                            + (plan.segment_totals?.perdu || 0);
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <StepIndicator step={2} theme={theme}/>
          <div style={{ padding:'28px 22px', borderRadius:12,
                        background:t.card, border:`0.5px solid ${t.border}`, textAlign:'center' }}>
            <I.Search style={{ width:36, height:36, color:t.dim, margin:'0 auto 12px', display:'block' }}/>
            <h3 style={{ margin:'0 0 8px', fontSize:16, fontWeight:500, color:t.text }}>
              {"Aucun client ciblable pour l'instant"}
            </h3>
            <p style={{ margin:'0 0 16px', fontSize:13, color:t.muted, lineHeight:1.6 }}>
              {totalClientsAll === 0
                ? "Votre fichier client ne contient encore aucun contact avec numero de telephone. Ajoutez des clients depuis l'onglet Clients pour utiliser la campagne IA."
                : `Vos ${totalClientsAll} client(s) ont deja recu un SMS dans les 7 derniers jours (anti-spam). Revenez d'ici quelques jours pour relancer.`}
            </p>
            <Button variant="secondary" type="button" onClick={() => setStep(1)}>Retour</Button>
          </div>
        </div>
      );
    }
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <StepIndicator step={2} theme={theme}/>

        {/* 3 KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
          <KpiCard theme={theme} icon="" label="SMS envoyes"
                   value={plan.total_sms} accent="#4338ca"/>
          <KpiCard theme={theme} icon="" label="Clients attendus"
                   value={`${plan.estimated_clients_min}-${plan.estimated_clients_max}`} accent="#92400e"/>
          <KpiCard theme={theme} icon="" label="CA estime"
                   value={`${plan.estimated_revenue_min}-${plan.estimated_revenue_max}€`} accent="#065f46"/>
        </div>

        <p style={{ margin:0, fontSize:11, color:t.muted, textAlign:'center', padding:'0 8px' }}>
          Estimation basee sur votre activite reelle — taux retour 8-20%
          <br/>panier moyen : {plan.avg_price}€ (calcule sur vos transactions)
        </p>

        {/* Phases */}
        {plan.phases.map(p => (
          <div key={p.segment}
               style={{ padding:'14px 16px', borderRadius:12,
                        background:t.card, border:`0.5px solid ${t.border}`,
                        opacity: p.sms_count === 0 ? 0.55 : 1 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
              <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
                {p.label}
              </p>
              <span style={{ fontSize:11, fontWeight:500, color:t.muted }}>
                J{p.start_day}-J{p.end_day}
              </span>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
              <span style={{ fontSize:11, fontWeight:500, padding:'3px 8px', borderRadius:99,
                             background:'#eef2ff', color:'#4338ca' }}>
                {p.sms_count} SMS
              </span>
              <label style={{ fontSize:11, fontWeight:500, color:t.muted, marginLeft:4 }}>
                Remise :
              </label>
              <select value={discounts[p.segment] || p.discount}
                      onChange={e => setDiscounts(d => ({ ...d, [p.segment]: parseInt(e.target.value) }))}
                      style={{ padding:'4px 8px', borderRadius:6,
                               border:`0.5px solid ${t.border}`,
                               background:t.inputBg, color:t.text,
                               fontSize:12, fontWeight:500, cursor:'pointer',
                               fontFamily:'inherit' }}>
                {[5, 10, 15, 20, 25, 30, 35].map(v => <option key={v} value={v}>-{v}%</option>)}
              </select>
            </div>
            {p.sms_count > 0 && (
              <div style={{ padding:'10px 12px', borderRadius:8, background:t.cardAlt }}>
                <p style={{ margin:'0 0 4px', fontSize:10, color:t.muted }}>
                  Apercu SMS ({previewSmsFor(p).length}/160)
                </p>
                <p style={{ margin:0, fontSize:12, color:t.text, whiteSpace:'pre-wrap', lineHeight:1.45 }}>
                  {previewSmsFor(p)}
                </p>
              </div>
            )}
          </div>
        ))}

        {/* Recap cout */}
        <div style={{ padding:'14px 16px', borderRadius:12,
                      background:t.card, border:`0.5px solid ${t.border}` }}>
          <MiniRow label="Total SMS"          value={plan.total_sms} theme={theme}/>
          <MiniRow label="Montant debite"     value={`${plan.estimated_cost.toFixed(2)} €`} theme={theme}/>
          <MiniRow label="Chiffre estime a gagner"
                   value={`${plan.estimated_revenue_min}-${plan.estimated_revenue_max} €`}
                   theme={theme} accent="#065f46"/>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:10 }}>
          <Button variant="secondary" type="button" onClick={() => setStep(1)} style={{ flex:1 }}>
            Retour
          </Button>
          <Button variant="primary" type="button"
                  onClick={launch} disabled={!canLaunch || loading} style={{ flex:2 }}>
            {loading ? 'Lancement...' : 'Lancer la campagne'}
          </Button>
        </div>
      </div>
    );
  }

  // Etape 1 — Saisie budget + duree
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <StepIndicator step={1} theme={theme}/>

      <div style={{ padding:20, borderRadius:12,
                    background:t.card, border:`0.5px solid ${t.border}` }}>
        <div style={{ marginBottom:22 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8 }}>
            <label style={{ fontSize:12, color:t.muted }}>Budget</label>
            <span style={{ fontSize:26, fontWeight:500, color:t.text, fontFamily:'monospace' }}>
              {budget} €
            </span>
          </div>
          <input type="range" min="5" max="100" step="5" value={budget}
                 onChange={e => setBudget(parseInt(e.target.value))}
                 style={{ width:'100%', accentColor:'#4338ca' }}/>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
            <p style={{ margin:0, fontSize:11, color:t.muted }}>
              ≈ <strong style={{ color:t.text, fontWeight:500 }}>{previewSms} SMS</strong> estimes
            </p>
            <p style={{ margin:0, fontSize:11, color: insufficient ? '#991b1b' : t.muted }}>
              Solde : <strong style={{ fontWeight:500 }}>{balance != null ? balance.toFixed(2) : '—'} €</strong>
            </p>
          </div>
        </div>

        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8 }}>
            <label style={{ fontSize:12, color:t.muted }}>Duree</label>
            <span style={{ fontSize:26, fontWeight:500, color:t.text, fontFamily:'monospace' }}>
              {duration} jours
            </span>
          </div>
          <input type="range" min="3" max="30" step="1" value={duration}
                 onChange={e => setDuration(parseInt(e.target.value))}
                 style={{ width:'100%', accentColor:'#4338ca' }}/>
          <div style={{ display:'flex', gap:6, marginTop:10 }}>
            {phaseBreakdown.map((p, i) => (
              <div key={i}
                   style={{ flex:1, padding:'8px 6px', borderRadius:8,
                            background:t.cardAlt, textAlign:'center' }}>
                <p style={{ margin:0, fontSize:11, fontWeight:500, color:t.text, lineHeight:1.3 }}>
                  {p.label}
                </p>
                <p style={{ margin:'3px 0 0', fontSize:10, color:t.muted }}>{p.days}</p>
                <p style={{ margin:'2px 0 0', fontSize:10, color:'#4338ca', fontWeight:500 }}>
                  {Math.round(p.share * 100)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Apercu cout */}
      <div style={{ padding:'14px 16px', borderRadius:12,
                    background: insufficient ? '#fef2f2' : t.card,
                    border:`0.5px solid ${insufficient ? 'rgba(239,68,68,0.3)' : t.border}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <span style={{ fontSize:13, color:t.muted }}>Cout total</span>
          <span style={{ fontSize:16, fontWeight:500, color: insufficient ? '#991b1b' : t.text }}>
            {budget.toFixed(2)} €
          </span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:13, color:t.muted }}>SMS envoyes</span>
          <span style={{ fontSize:13, fontWeight:500, color:t.text }}>≈ {previewSms}</span>
        </div>
        {insufficient && (
          <div style={{ marginTop:10, padding:'10px 12px', borderRadius:8, background:'#fef2f2' }}>
            <p style={{ margin:'0 0 8px', fontSize:12, color:'#991b1b', fontWeight:500 }}>
              Solde insuffisant ({balance?.toFixed(2)} €)
            </p>
            <Button variant="danger" size="small" type="button" onClick={onGoToSolde}>
              → Recharger mon solde
            </Button>
          </div>
        )}
      </div>

      <Button variant="primary" fullWidth type="button"
              onClick={generate} disabled={insufficient || loading || budget < 1}>
        {loading ? 'Generation...' : 'Generer le plan'}
      </Button>

      {/* Historique IA */}
      {history.length > 0 && (
        <div style={{ marginTop:14 }}>
          <p style={{ margin:'0 0 10px', fontSize:12, color:t.muted }}>
            Historique des campagnes IA
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {history.map(c => <HistoryItem key={c.id} c={c} theme={theme}/>)}
          </div>
        </div>
      )}
    </div>
  );
}
