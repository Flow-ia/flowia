import { useState, useEffect } from 'react';
import { campaignsApi, paymentsApi } from '../../../../utils/api';
import StepIndicator from '../components/StepIndicator';
import KpiCard from '../components/KpiCard';
import MiniRow from '../components/MiniRow';
import HistoryItem from './HistoryItem';

// Marketing IA — Wizard 3 étapes: Saisie → Plan → Confirmation
export default function TabMarketingIA({ theme, showToast, onGoToSolde }) {
  const isDark = theme.mode === 'dark';
  const [step, setStep] = useState(1);
  const [budget, setBudget] = useState(20);
  const [duration, setDuration] = useState(15);
  const [balance, setBalance] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [launched, setLaunched] = useState(null);
  const [discounts, setDiscounts] = useState({ risque: 15, perdu: 25, fidele: 10 });
  const [recalcing, setRecalcing] = useState(false);
  const [history, setHistory] = useState([]);

  // J2 : source unique de vérité pour SMS_PRICE = backend. Les env VITE_*
  // peuvent diverger du back si l'admin oublie de sync — on évite cette
  // classe de bug en lisant price_per_sms depuis /sms/balance.
  const [pricePerSmsBackend, setPricePerSmsBackend] = useState(null);
  useEffect(() => {
    paymentsApi.getSMSBalance().then(b => {
      setBalance(parseFloat(b.balance));
      if (b.price_per_sms) setPricePerSmsBackend(parseFloat(b.price_per_sms));
    }).catch(() => {});
    campaignsApi.getAiHistory().then(setHistory).catch(() => {});
  }, []);

  // Recalculer le plan (estimates) quand les % changent
  useEffect(() => {
    if (step !== 2 || !plan) return;
    let cancelled = false;
    setRecalcing(true);
    const t = setTimeout(async () => {
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
            phases: prev.phases.map((p, i) => {
              const u = r.phases.find(x => x.segment === p.segment);
              return u ? { ...p, sms_count: u.sms_count, discount: u.discount } : p;
            }),
          } : prev);
        }
      } catch {} finally { if (!cancelled) setRecalcing(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [discounts.risque, discounts.perdu, discounts.fidele, budget, duration]);

  // J2 : priorité au prix retourné par le backend (source unique).
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
    { label: '⚠️ Clients risque',  days: `J1-J${thirdDays}`,             share: 0.40 },
    { label: '😴 Clients perdus',  days: `J${thirdDays+1}-J${thirdDays*2}`, share: 0.35 },
    { label: '⭐ Clients fidèles',  days: `J${thirdDays*2+1}-J${duration}`,  share: 0.25 },
  ];

  const generate = async () => {
    setLoading(true);
    try {
      const p = await campaignsApi.getAutoPlan({ budget, duration_days: duration });
      setPlan(p);
      if (p.discounts) setDiscounts({ ...p.discounts });
      setStep(2);
    } catch(e) {
      showToast(e.message || 'Erreur génération plan', 'error');
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
    } catch(e) {
      showToast(e.message || 'Erreur lancement', 'error');
    } finally { setLoading(false); }
  };

  // Aperçu SMS côté client (miroir de buildPersonalizedSms)
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

  // Étape 3 — Confirmation sobre
  if (step === 3 && launched) {
    return (
      <div className="space-y-4">
        <div style={{ padding:'32px 22px', borderRadius:20, background:theme.card,
          border:`1px solid ${theme.border}`, textAlign:'center' }}>
          <div style={{ width:76, height:76, borderRadius:'50%',
            background:'rgba(16,185,129,0.12)', border:'2px solid rgba(16,185,129,0.25)',
            display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:18 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h3 style={{ margin:'0 0 8px', fontSize:22, fontWeight:900, color:theme.text }}>
            Campagne lancée avec succès
          </h3>
          <p style={{ margin:'0 0 20px', fontSize:14, color:theme.muted }}>
            Vos SMS partiront automatiquement selon le planning.
          </p>
          <div style={{ textAlign:'left', padding:'14px 16px', borderRadius:12,
            background:isDark?'rgba(255,255,255,0.04)':'#f8fafc', border:`1px solid ${theme.border}` }}>
            <MiniRow label="SMS planifiés"    value={launched.total_sms} theme={theme} />
            <MiniRow label="Durée"            value={`${launched.duration_days} jours`} theme={theme} />
            <MiniRow label="Montant débité"   value={`${launched.estimated_cost.toFixed(2)} €`} theme={theme} />
            <MiniRow label="Solde restant"    value={`${(launched.new_balance || 0).toFixed(2)} €`} theme={theme} />
          </div>
          <button onClick={reset}
            style={{ width:'100%', padding:13, marginTop:22, borderRadius:12, border:'none',
              background:'#10b981', color:'white', fontWeight:800, fontSize:14, cursor:'pointer',
              boxShadow:'0 6px 16px rgba(16,185,129,0.35)' }}>
            Retour
          </button>
        </div>
      </div>
    );
  }

  // Étape 2 — Plan
  if (step === 2 && plan) {
    const canLaunch = plan.balance_sufficient && plan.total_sms > 0;
    // Cas limite : aucun client ciblable
    if (plan.total_sms === 0) {
      const totalClientsAll = (plan.segment_totals?.champion || 0)
                            + (plan.segment_totals?.fidele || 0)
                            + (plan.segment_totals?.prometteur || 0)
                            + (plan.segment_totals?.risque || 0)
                            + (plan.segment_totals?.perdu || 0);
      return (
        <div className="space-y-4">
          <StepIndicator step={2} theme={theme} />
          <div style={{ padding:'28px 22px', borderRadius:18, background:theme.card,
            border:`1px solid ${theme.border}`, textAlign:'center' }}>
            <div style={{ fontSize:42, marginBottom:14 }}>🔍</div>
            <h3 style={{ margin:'0 0 8px', fontSize:18, fontWeight:900, color:theme.text }}>
              Aucun client ciblable pour l'instant
            </h3>
            <p style={{ margin:'0 0 16px', fontSize:13, color:theme.muted, lineHeight:1.6 }}>
              {totalClientsAll === 0
                ? 'Votre fichier client ne contient encore aucun contact avec numéro de téléphone. Ajoutez des clients depuis l\'onglet Clients pour utiliser la campagne IA.'
                : `Vos ${totalClientsAll} client(s) ont déjà reçu un SMS dans les 7 derniers jours (anti-spam). Revenez d'ici quelques jours pour relancer.`}
            </p>
            <button onClick={() => setStep(1)}
              style={{ padding:'10px 20px', borderRadius:10, border:`1px solid ${theme.border}`,
                background:theme.inputBg, color:theme.text, fontWeight:700, fontSize:13, cursor:'pointer' }}>
              Retour
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <StepIndicator step={2} theme={theme} />

        {/* 3 KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
          <KpiCard theme={theme} icon="📩" label="SMS envoyés"
            value={plan.total_sms} accent="#6366f1" />
          <KpiCard theme={theme} icon="👥" label="Clients attendus"
            value={`${plan.estimated_clients_min}-${plan.estimated_clients_max}`} accent="#f59e0b" />
          <KpiCard theme={theme} icon="💰" label="CA estimé"
            value={`${plan.estimated_revenue_min}-${plan.estimated_revenue_max}€`} accent="#10b981" />
        </div>

        <p style={{ margin:0, fontSize:11, color:theme.muted, textAlign:'center', padding:'0 8px' }}>
          Estimation basée sur votre activité réelle — taux retour 8-20%<br/>
          panier moyen : {plan.avg_price}€ (calculé sur vos transactions)
        </p>

        {/* Phases — discount éditable 5-35 par pas de 5 */}
        {plan.phases.map(p => (
          <div key={p.segment} style={{ padding:'14px 16px', borderRadius:14, background:theme.card,
            border:`1px solid ${theme.border}`, opacity: p.sms_count===0 ? 0.55 : 1 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
              <p style={{ margin:0, fontSize:15, fontWeight:800, color:theme.text }}>
                {p.emoji} {p.label}
              </p>
              <span style={{ fontSize:12, fontWeight:700, color:theme.muted }}>
                J{p.start_day}-J{p.end_day}
              </span>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
              <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:6,
                background:'rgba(99,102,241,0.12)', color:'#6366f1' }}>
                {p.sms_count} SMS
              </span>
              <label style={{ fontSize:11, fontWeight:700, color:theme.muted, marginLeft:4 }}>Remise :</label>
              <select value={discounts[p.segment] || p.discount}
                onChange={e => setDiscounts(d => ({ ...d, [p.segment]: parseInt(e.target.value) }))}
                style={{ padding:'4px 8px', borderRadius:6, border:`1px solid ${theme.border}`,
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#fff', color:theme.text,
                  fontSize:12, fontWeight:700, cursor:'pointer' }}>
                {[5,10,15,20,25,30,35].map(v => <option key={v} value={v}>-{v}%</option>)}
              </select>
            </div>
            {p.sms_count > 0 && (
              <div style={{ padding:'10px 12px', borderRadius:8,
                background:isDark?'rgba(255,255,255,0.04)':'#f8fafc',
                border:`1px dashed ${theme.border}` }}>
                <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  Aperçu SMS ({previewSmsFor(p).length}/160)
                </p>
                <p style={{ margin:0, fontSize:12, color:theme.text, whiteSpace:'pre-wrap', lineHeight:1.45 }}>
                  {previewSmsFor(p)}
                </p>
              </div>
            )}
          </div>
        ))}

        {/* Récap coût */}
        <div style={{ padding:'14px 16px', borderRadius:14, background:theme.card, border:`1px solid ${theme.border}` }}>
          <MiniRow label="Total SMS"                value={plan.total_sms} theme={theme} />
          <MiniRow label="Montant débité"           value={`${plan.estimated_cost.toFixed(2)} €`} theme={theme} />
          <MiniRow label="Chiffre estimé à gagner"  value={`${plan.estimated_revenue_min}-${plan.estimated_revenue_max} €`}
            theme={theme} accent="#10b981" />
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => setStep(1)}
            style={{ flex:1, padding:13, borderRadius:12, border:`1px solid ${theme.border}`,
              background:theme.inputBg, color:theme.muted, fontWeight:700, fontSize:13, cursor:'pointer' }}>
            Retour
          </button>
          <button onClick={launch} disabled={!canLaunch || loading}
            style={{ flex:2, padding:13, borderRadius:12, border:'none', fontWeight:800, fontSize:14,
              cursor: canLaunch ? 'pointer' : 'not-allowed',
              background: canLaunch ? 'linear-gradient(135deg,#10b981,#059669)' : theme.border,
              color: canLaunch ? 'white' : theme.muted,
              boxShadow: canLaunch ? '0 6px 16px rgba(16,185,129,0.35)' : 'none' }}>
            {loading ? 'Lancement...' : 'Lancer la campagne'}
          </button>
        </div>
      </div>
    );
  }

  // Étape 1 — Saisie budget + durée
  return (
    <div className="space-y-4">
      <StepIndicator step={1} theme={theme} />

      <div style={{ padding:'20px 20px 22px', borderRadius:16, background:theme.card, border:`1px solid ${theme.border}` }}>
        <div style={{ marginBottom:22 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8 }}>
            <label style={{ fontSize:12, fontWeight:800, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>Budget</label>
            <span style={{ fontSize:28, fontWeight:900, color:theme.text, fontFamily:'monospace' }}>{budget} €</span>
          </div>
          <input type="range" min="5" max="100" step="5" value={budget}
            onChange={e => setBudget(parseInt(e.target.value))}
            style={{ width:'100%', accentColor:'#6366f1' }} />
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
            <p style={{ margin:0, fontSize:11, color:theme.muted }}>
              ≈ <strong style={{ color:theme.text }}>{previewSms} SMS</strong> estimés
            </p>
            <p style={{ margin:0, fontSize:11, color: insufficient ? '#ef4444' : theme.muted }}>
              Solde : <strong>{balance != null ? balance.toFixed(2) : '—'} €</strong>
            </p>
          </div>
        </div>

        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8 }}>
            <label style={{ fontSize:12, fontWeight:800, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>Durée</label>
            <span style={{ fontSize:28, fontWeight:900, color:theme.text, fontFamily:'monospace' }}>{duration} jours</span>
          </div>
          <input type="range" min="3" max="30" step="1" value={duration}
            onChange={e => setDuration(parseInt(e.target.value))}
            style={{ width:'100%', accentColor:'#6366f1' }} />
          <div style={{ display:'flex', gap:6, marginTop:10 }}>
            {phaseBreakdown.map((p,i) => (
              <div key={i} style={{ flex:1, padding:'8px 6px', borderRadius:8,
                background: isDark?'rgba(255,255,255,0.04)':'#f8fafc',
                border:`1px solid ${theme.border}`, textAlign:'center' }}>
                <p style={{ margin:0, fontSize:10, fontWeight:800, color:theme.text, lineHeight:1.3 }}>{p.label}</p>
                <p style={{ margin:'3px 0 0', fontSize:9, color:theme.muted }}>{p.days}</p>
                <p style={{ margin:'2px 0 0', fontSize:9, color:'#6366f1', fontWeight:700 }}>{Math.round(p.share*100)}%</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Aperçu coût */}
      <div style={{ padding:'14px 16px', borderRadius:12,
        background: insufficient ? 'rgba(239,68,68,0.08)' : theme.card,
        border: `1px solid ${insufficient ? 'rgba(239,68,68,0.3)' : theme.border}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <span style={{ fontSize:13, color:theme.muted }}>Coût total</span>
          <span style={{ fontSize:17, fontWeight:900, color: insufficient ? '#ef4444' : theme.text }}>
            {budget.toFixed(2)} €
          </span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:13, color:theme.muted }}>SMS envoyés</span>
          <span style={{ fontSize:13, fontWeight:700, color:theme.text }}>≈ {previewSms}</span>
        </div>
        {insufficient && (
          <div style={{ marginTop:10, padding:'10px 12px', borderRadius:8,
            background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)' }}>
            <p style={{ margin:'0 0 6px', fontSize:12, color:'#ef4444', fontWeight:700 }}>
              Solde insuffisant ({balance?.toFixed(2)} €)
            </p>
            <button onClick={onGoToSolde}
              style={{ padding:'6px 12px', borderRadius:8, border:'none', fontSize:12, fontWeight:700,
                background:'#ef4444', color:'white', cursor:'pointer' }}>
              → Recharger mon solde
            </button>
          </div>
        )}
      </div>

      <button onClick={generate} disabled={insufficient || loading || budget < 1}
        style={{ width:'100%', padding:14, borderRadius:12, border:'none', fontWeight:800, fontSize:15,
          cursor: (insufficient || loading) ? 'not-allowed' : 'pointer',
          background: (insufficient || loading) ? theme.border : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          color: (insufficient || loading) ? theme.muted : 'white',
          boxShadow: (insufficient || loading) ? 'none' : '0 6px 18px rgba(99,102,241,0.4)' }}>
        {loading ? 'Génération...' : 'Générer le plan'}
      </button>

      {/* Historique IA */}
      {history.length > 0 && (
        <div style={{ marginTop:28 }}>
          <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:800, color:theme.muted,
            textTransform:'uppercase', letterSpacing:'0.06em' }}>
            Historique des campagnes IA
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {history.map(c => <HistoryItem key={c.id} c={c} theme={theme} />)}
          </div>
        </div>
      )}
    </div>
  );
}
