import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { I } from '../../utils/icons';
import { Confirm } from '../../components/UI';
import SMSRechargeModal from '../../components/SMSRechargeModal';
import { api, loyaltyApi, promoApi, clientsApi, campaignsApi, paymentsApi, birthdayApi, referralsApi } from '../../utils/api';

export default function TabMarketing({ theme, showToast }) {
  const isDark   = theme.mode === 'dark';
  const navigate = useNavigate();
  const location = useLocation();

  const MTABS = [
    { id: 'fidelite',    label: '💎 Fidelite' },
    { id: 'promotions',  label: '% Promos' },
    { id: 'solde',       label: 'Solde' },
    { id: 'ia',          label: '✨ IA' },
  ];

  // Extrait le sous-onglet depuis l'URL : /settings/marketing/{sub}
  const parts = location.pathname.replace(/^\/settings\/marketing\/?/, '').split('/').filter(Boolean);
  const rawSub = parts[0] || 'ia';
  // Legacy : /anniversaire et /parrainage sont fusionnés dans /fidelite
  const LEGACY_TO_FIDELITE = ['anniversaire', 'parrainage'];
  const marketingTab = LEGACY_TO_FIDELITE.includes(rawSub)
    ? 'fidelite'
    : (MTABS.some(t => t.id === rawSub) ? rawSub : 'ia');

  // Redirection silencieuse vers /fidelite si URL legacy
  useEffect(() => {
    if (LEGACY_TO_FIDELITE.includes(rawSub)) {
      navigate('/settings/marketing/fidelite', { replace: true });
    }
  }, [rawSub]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMarketingTab = (id) => {
    // conserve les segments suivants (utile si sous-page imbriquée plus tard)
    navigate('/settings/marketing/' + id, { replace: false });
  };

  return (
    <div className="space-y-4">
      <div style={{ display:'flex', gap:6, marginBottom:20,
        background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', borderRadius:12, padding:4 }}>
        {MTABS.map(({ id, label }) => (
          <button key={id} onClick={() => setMarketingTab(id)}
            style={{ flex:1, padding:'9px 8px', borderRadius:9, border:'none', fontWeight:700, fontSize:12,
              cursor:'pointer', background: marketingTab === id ? theme.card : 'transparent',
              color: marketingTab === id ? theme.text : theme.muted,
              boxShadow: marketingTab === id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition:'all 0.15s', whiteSpace:'nowrap' }}>
            {label}
          </button>
        ))}
      </div>

      {marketingTab === 'fidelite'    && <TabFidelite theme={theme} showToast={showToast} />}
      {marketingTab === 'promotions'  && <TabPromo theme={theme} showToast={showToast} />}
      {marketingTab === 'solde'       && <TabSMS showToast={showToast} theme={theme} />}
      {marketingTab === 'ia'          && <TabMarketingIA theme={theme} showToast={showToast} onGoToSolde={() => navigate('/settings/marketing/solde')} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Anniversaires clients ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
function TabBirthday({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const [cfg, setCfg] = useState({ is_enabled:false, discount_type:'percent', discount_value:20, validity_days:30, message:'' });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    birthdayApi.get().then(d => {
      setCfg({
        is_enabled: !!d.is_enabled,
        discount_type: d.discount_type || 'percent',
        discount_value: Number(d.discount_value || 0),
        validity_days: Number(d.validity_days || 30),
        message: d.message || '',
      });
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await birthdayApi.update(cfg);
      showToast('Offre anniversaire enregistrée ✓');
    } catch(e) { showToast(e.message || 'Erreur', 'err'); }
    finally { setSaving(false); }
  };

  // Toggle auto-persistant : crée la ligne en BDD au premier clic.
  const toggleEnabled = async () => {
    const next = { ...cfg, is_enabled: !cfg.is_enabled };
    setCfg(next);
    try {
      await birthdayApi.update(next);
      showToast(next.is_enabled ? 'Offre anniversaire activée ✓' : 'Offre anniversaire désactivée');
    } catch(e) {
      setCfg(cfg);
      showToast(e.message || 'Erreur', 'err');
    }
  };

  const inp = { padding:'12px 14px', borderRadius:12, background: isDark?'rgba(255,255,255,0.06)':'#f1f5f9',
    border:`1px solid ${theme.border}`, color:theme.text, fontSize:14, width:'100%', outline:'none', boxSizing:'border-box' };

  if (loading) return <p className="text-sm" style={{ color:theme.muted }}>Chargement…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background:theme.card, border:`1px solid ${theme.border}` }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-bold text-sm" style={{ color:theme.text }}>Offre anniversaire activée</p>
            <p className="text-xs mt-0.5" style={{ color:theme.muted }}>Les clients avec date de naissance reçoivent une réduction le jour J.</p>
          </div>
          <button onClick={toggleEnabled}
            style={{ width:50, height:28, borderRadius:14, border:'none', cursor:'pointer', position:'relative',
              background: cfg.is_enabled ? 'linear-gradient(90deg,#f472b6,#ec4899)' : (isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.15)') }}>
            <div style={{ position:'absolute', top:3, left: cfg.is_enabled ? 25 : 3, width:22, height:22, borderRadius:11, background:'white', transition:'left .2s' }}/>
          </button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color:theme.muted }}>Type</label>
            <select value={cfg.discount_type} onChange={e=>setCfg(c=>({...c,discount_type:e.target.value}))} style={inp}>
              <option value="percent">Pourcentage (%)</option>
              <option value="fixed">Montant fixe (€)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color:theme.muted }}>
              Valeur {cfg.discount_type==='percent'?'(%)':'(€)'}
            </label>
            <input type="number" min="0" step="0.01" value={cfg.discount_value}
              onChange={e=>setCfg(c=>({...c,discount_value:e.target.value}))} style={inp}/>
          </div>
        </div>
        <div style={{ marginBottom:10 }}>
          <label className="text-xs font-bold mb-1 block" style={{ color:theme.muted }}>Validité (jours)</label>
          <input type="number" min="1" max="365" value={cfg.validity_days}
            onChange={e=>setCfg(c=>({...c,validity_days:e.target.value}))} style={inp}/>
        </div>
        <div style={{ marginBottom:10 }}>
          <label className="text-xs font-bold mb-1 block" style={{ color:theme.muted }}>Message (optionnel)</label>
          <textarea rows={2} value={cfg.message}
            onChange={e=>setCfg(c=>({...c,message:e.target.value}))}
            placeholder="Joyeux anniversaire ! Profitez de -20% sur votre prochain RDV." style={{...inp, resize:'none'}}/>
        </div>

        <button onClick={save} disabled={saving}
          style={{ width:'100%', padding:'12px', borderRadius:14, border:'none', cursor:'pointer',
            background:'linear-gradient(90deg,#f472b6,#ec4899)', color:'white', fontWeight:800, fontSize:14, opacity:saving?0.5:1 }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <div className="rounded-2xl p-3.5 flex items-start gap-2.5" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
        <span style={{ fontSize:16, flexShrink:0 }}>ℹ️</span>
        <p className="text-xs" style={{ color: theme.muted, lineHeight:1.5 }}>
          La date de naissance est renseignée par les clients lors de leur inscription (optionnel).
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Parrainage clients ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
function TabReferral({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const [cfg, setCfg] = useState({
    is_enabled:false,
    parrain_type:'percent', parrain_value:10,
    filleul_type:'percent', filleul_value:10,
    limit_count: null, limit_period: 'unlimited',
  });
  const [codes, setCodes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    Promise.all([referralsApi.getProgram(), referralsApi.listCodes().catch(()=>[])])
      .then(([prog, cs]) => {
        setCfg({
          is_enabled: !!prog.is_enabled,
          parrain_type: prog.parrain_type || 'percent',
          parrain_value: Number(prog.parrain_value || 0),
          filleul_type: prog.filleul_type || 'percent',
          filleul_value: Number(prog.filleul_value || 0),
          limit_period: prog.limit_period || 'unlimited',
          limit_count:  prog.limit_count != null ? Number(prog.limit_count) : null,
        });
        setCodes(Array.isArray(cs) ? cs : []);
      }).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await referralsApi.updateProgram(cfg);
      showToast('Programme de parrainage enregistré ✓');
    } catch(e) { showToast(e.message || 'Erreur', 'err'); }
    finally { setSaving(false); }
  };

  // Toggle auto-persistant : crée/active immédiatement la ligne en BDD pour que
  // le lien "Parrainer un ami" apparaisse sur la page de réservation sans avoir
  // à cliquer Enregistrer.
  const toggleEnabled = async () => {
    const next = { ...cfg, is_enabled: !cfg.is_enabled };
    setCfg(next);
    try {
      await referralsApi.updateProgram(next);
      showToast(next.is_enabled ? 'Programme activé ✓' : 'Programme désactivé');
    } catch(e) {
      setCfg(cfg); // rollback
      showToast(e.message || 'Erreur', 'err');
    }
  };

  const inp = { padding:'12px 14px', borderRadius:12, background: isDark?'rgba(255,255,255,0.06)':'#f1f5f9',
    border:`1px solid ${theme.border}`, color:theme.text, fontSize:14, width:'100%', outline:'none', boxSizing:'border-box' };

  if (loading) return <p className="text-sm" style={{ color:theme.muted }}>Chargement…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background:theme.card, border:`1px solid ${theme.border}` }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-bold text-sm" style={{ color:theme.text }}>Programme de parrainage activé</p>
            <p className="text-xs mt-0.5" style={{ color:theme.muted }}>Chaque client connecté dispose d'un lien unique à partager.</p>
          </div>
          <button onClick={toggleEnabled}
            style={{ width:50, height:28, borderRadius:14, border:'none', cursor:'pointer', position:'relative',
              background: cfg.is_enabled ? 'linear-gradient(90deg,#818cf8,#6366f1)' : (isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.15)') }}>
            <div style={{ position:'absolute', top:3, left: cfg.is_enabled ? 25 : 3, width:22, height:22, borderRadius:11, background:'white', transition:'left .2s' }}/>
          </button>
        </div>

        <p className="text-xs font-bold uppercase mb-2" style={{ color:theme.muted, letterSpacing:'0.08em' }}>Récompense parrain</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <select value={cfg.parrain_type} onChange={e=>setCfg(c=>({...c,parrain_type:e.target.value}))} style={inp}>
            <option value="percent">%</option>
            <option value="fixed">Montant fixe (€)</option>
          </select>
          <input type="number" min="0" step="0.01" value={cfg.parrain_value}
            onChange={e=>setCfg(c=>({...c,parrain_value:e.target.value}))} style={inp}/>
        </div>

        <p className="text-xs font-bold uppercase mb-2" style={{ color:theme.muted, letterSpacing:'0.08em' }}>Récompense filleul</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <select value={cfg.filleul_type} onChange={e=>setCfg(c=>({...c,filleul_type:e.target.value}))} style={inp}>
            <option value="percent">%</option>
            <option value="fixed">Montant fixe (€)</option>
          </select>
          <input type="number" min="0" step="0.01" value={cfg.filleul_value}
            onChange={e=>setCfg(c=>({...c,filleul_value:e.target.value}))} style={inp}/>
        </div>

        {/* Limite anti-abus : par client parrain */}
        <p className="text-xs font-bold uppercase mb-2" style={{ color:theme.muted, letterSpacing:'0.08em' }}>
          Limite par parrain
        </p>
        <div style={{
          display:'grid',
          gridTemplateColumns: (cfg.limit_period === 'unlimited' || cfg.limit_period === 'lifetime') ? '1fr' : '1fr 1fr',
          gap:10, marginBottom:14,
        }}>
          <select value={cfg.limit_period}
            onChange={e=>{
              const lp = e.target.value;
              setCfg(c => ({
                ...c,
                limit_period: lp,
                // Réinitialise limit_count selon la nouvelle période
                limit_count: lp === 'lifetime' ? 1
                          : lp === 'unlimited' ? null
                          : (c.limit_count || 3),
              }));
            }} style={inp}>
            <option value="unlimited">Illimité</option>
            <option value="lifetime">Une seule fois à vie</option>
            <option value="month">X fois par mois</option>
            <option value="3months">X fois sur 3 mois</option>
            <option value="year">X fois par an</option>
          </select>
          {(cfg.limit_period !== 'unlimited' && cfg.limit_period !== 'lifetime') && (
            <input type="number" min="1" step="1" value={cfg.limit_count ?? ''}
              onChange={e=>setCfg(c=>({...c, limit_count: e.target.value ? Number(e.target.value) : null}))}
              placeholder="Nombre" style={inp}/>
          )}
        </div>

        <button onClick={save} disabled={saving}
          style={{ width:'100%', padding:'12px', borderRadius:14, border:'none', cursor:'pointer',
            background:'linear-gradient(90deg,#818cf8,#6366f1)', color:'white', fontWeight:800, fontSize:14, opacity:saving?0.5:1 }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {codes.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background:theme.card, border:`1px solid ${theme.border}` }}>
          <p className="font-bold text-sm mb-2" style={{ color:theme.text }}>Parrains actifs ({codes.length})</p>
          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:260, overflowY:'auto' }}>
            {codes.map(c => (
              <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'8px 10px', borderRadius:10, background: isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.03)' }}>
                <div style={{ minWidth:0, flex:1 }}>
                  <p style={{ fontSize:12, fontWeight:700, color:theme.text, margin:0,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {c.owner_client_email}
                  </p>
                  <p style={{ fontSize:10, color:theme.muted, margin:0, fontFamily:'monospace' }}>{c.code}</p>
                </div>
                <span style={{ fontSize:11, fontWeight:800, color:'#6366f1',
                  padding:'2px 8px', borderRadius:99, background:'rgba(99,102,241,0.12)' }}>
                  {c.uses_count} filleul{c.uses_count>1?'s':''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl p-3.5 flex items-start gap-2.5" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
        <span style={{ fontSize:16, flexShrink:0 }}>ℹ️</span>
        <p className="text-xs" style={{ color: theme.muted, lineHeight:1.5 }}>
          Quand un filleul réserve via <code>?ref=CODE</code>, un code promo est créé automatiquement pour le parrain et le filleul (valable 60 jours).
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── TabFidelite : agrège Programme fidélité + Anniv + Parrainage ──────────
// (onboarding.md : page unique avec accordéons fermés par défaut)
// ═══════════════════════════════════════════════════════════════════════════
function FideliteAccordion({ theme, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const isDark = theme.mode === 'dark';
  return (
    <div style={{
      background: theme.card, border: `1px solid ${theme.border}`,
      borderRadius: 14, overflow: 'hidden',
    }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: theme.text }}>{title}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{
            width: 16, height: 16, color: theme.muted,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform .2s',
          }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{
          borderTop: `1px solid ${theme.border}`,
          padding: 16,
          background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

function TabFidelite({ theme, showToast }) {
  return (
    <div className="space-y-4">
      <FideliteAccordion theme={theme} title="💎 Programme de fidélité (tampons / points)">
        <TabLoyalty theme={theme} />
      </FideliteAccordion>
      <FideliteAccordion theme={theme} title="🎂 Offres anniversaire">
        <TabBirthday theme={theme} showToast={showToast} />
      </FideliteAccordion>
      <FideliteAccordion theme={theme} title="🤝 Programme de parrainage">
        <TabReferral theme={theme} showToast={showToast} />
      </FideliteAccordion>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Marketing IA — Wizard 3 étapes: Saisie → Plan → Confirmation ───────────
// ═══════════════════════════════════════════════════════════════════════════
function TabMarketingIA({ theme, showToast, onGoToSolde }) {
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

  useEffect(() => {
    paymentsApi.getSMSBalance().then(b => setBalance(parseFloat(b.balance))).catch(() => {});
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

  const parseEnvFloat = (v, fallback) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const smsCost   = parseEnvFloat(import.meta.env.VITE_SMS_COST_UNIT, 0.045);
  const smsMargin = parseEnvFloat(import.meta.env.VITE_SMS_MARGIN_PERCENT, 30);
  const pricePerSms = smsCost * (1 + smsMargin / 100);
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
      // Initialise discounts avec les % adaptatifs calculés par le backend
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
    // ── Cas limite : aucun client ciblable ─────────────────────────────────
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

        {/* Récap coût — simplifié pour éviter la confusion avec le solde */}
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

      {/* ─── Historique IA ─────────────────────────────────────────────── */}
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

function HistoryItem({ c, theme }) {
  const isDark = theme.mode === 'dark';
  const convPct = Math.round((c.conversion_rate || 0) * 100);
  const date = new Date(c.created_at).toLocaleDateString('fr-FR', {
    day:'2-digit', month:'short', year:'numeric'
  });
  const isGood = convPct >= 10 || c.roi >= 2;
  return (
    <div style={{ padding:'12px 14px', borderRadius:12, background:theme.card, border:`1px solid ${theme.border}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div>
          <p style={{ margin:0, fontSize:13, fontWeight:800, color:theme.text }}>
            Campagne {date}
          </p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:theme.muted }}>
            {c.total_sms} SMS · {c.duration_days}j · {c.total_cost.toFixed(2)}€
          </p>
        </div>
        <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:6,
          background: c.status === 'completed' ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.12)',
          color: c.status === 'completed' ? '#10b981' : '#6366f1' }}>
          {c.status === 'completed' ? 'Terminée' : 'En cours'}
        </span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
        <MiniKpi theme={theme} label="Envoyés" value={c.codes_sent} accent="#6366f1" />
        <MiniKpi theme={theme} label="Utilisés" value={c.codes_used} accent={isGood ? '#10b981' : theme.text} />
        <MiniKpi theme={theme} label="Taux" value={`${convPct}%`} accent={convPct >= 10 ? '#10b981' : theme.text} />
      </div>
      {c.real_revenue > 0 && (
        <div style={{ marginTop:10, padding:'8px 10px', borderRadius:8,
          background: isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)',
          border:'1px solid rgba(16,185,129,0.25)',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, color:theme.muted }}>CA réel généré</span>
          <span style={{ fontSize:14, fontWeight:900, color:'#10b981', fontFamily:'monospace' }}>
            +{c.real_revenue.toFixed(2)}€ {c.roi > 0 && <span style={{ fontSize:11, opacity:0.8 }}>(ROI x{c.roi})</span>}
          </span>
        </div>
      )}
    </div>
  );
}

function MiniKpi({ theme, label, value, accent }) {
  return (
    <div style={{ padding:'6px 8px', borderRadius:8, background:'rgba(0,0,0,0.03)', textAlign:'center' }}>
      <p style={{ margin:0, fontSize:9, fontWeight:700, color:theme.muted, textTransform:'uppercase' }}>{label}</p>
      <p style={{ margin:'2px 0 0', fontSize:13, fontWeight:900, color: accent || theme.text }}>{value}</p>
    </div>
  );
}

function StepIndicator({ step, theme }) {
  return (
    <div style={{ display:'flex', gap:6, padding:'0 4px 4px' }}>
      {[1,2,3].map(n => (
        <div key={n} style={{
          flex:1, height:4, borderRadius:2,
          background: n <= step ? '#6366f1' : theme.border,
          opacity: n <= step ? 1 : 0.5,
          transition:'background 0.3s',
        }} />
      ))}
    </div>
  );
}

function KpiCard({ theme, icon, label, value, accent }) {
  return (
    <div style={{ padding:'12px 10px', borderRadius:12, background:theme.card,
      border:`1px solid ${theme.border}`, textAlign:'center' }}>
      <div style={{ fontSize:18, marginBottom:4 }}>{icon}</div>
      <p style={{ margin:0, fontSize:10, fontWeight:800, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</p>
      <p style={{ margin:'4px 0 0', fontSize:16, fontWeight:900, color: accent || theme.text }}>{value}</p>
    </div>
  );
}

function MiniRow({ label, value, theme, accent }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0' }}>
      <span style={{ fontSize:13, color:theme.muted }}>{label}</span>
      <span style={{ fontSize:14, fontWeight:800, color: accent || theme.text }}>{value}</span>
    </div>
  );
}

function TabLoyalty({ theme }) {
  const isDark = theme.mode === 'dark';
  const [program, setProgram]   = useState(null);
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editProg, setEditProg] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [stampModal, setStampModal] = useState(null);
  const [stampEmail, setStampEmail] = useState('');
  const [stampName, setStampName]   = useState('');
  const [stamping, setStamping]     = useState(false);
  const [delId, setDelId] = useState(null);

  const [promoHist, setPromoHist] = useState([]);
  const [showHist,  setShowHist]  = useState(false);
  const [histLoad,  setHistLoad]  = useState(false);

  const [showAddSvc,    setShowAddSvc]    = useState(false);
  const [svcSearch,     setSvcSearch]     = useState('');
  const [svcResults,    setSvcResults]    = useState([]);
  const [svcClient,     setSvcClient]     = useState(null);
  const [svcQty,        setSvcQty]        = useState(1);
  const [svcBusy,       setSvcBusy]       = useState(false);
  const [svcMsg,        setSvcMsg]        = useState('');
  const [svcSearchLoad, setSvcSearchLoad] = useState(false);

  const [loyaltyStats, setLoyaltyStats] = useState(null);
  const [showLoyaltyStats, setShowLoyaltyStats] = useState(false);
  const [loyaltyStatsLoad, setLoyaltyStatsLoad] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, cl] = await Promise.all([loyaltyApi.getProgram(), loyaltyApi.getClients({ search })]);
      setProgram(p); setClients(cl);
    } finally { setLoading(false); }
  }, [search]);

  const loadLoyaltyStats = async () => {
    setLoyaltyStatsLoad(true);
    try { const s = await loyaltyApi.getStats(); setLoyaltyStats(s); setShowLoyaltyStats(true); }
    catch(e) { console.error(e); }
    finally { setLoyaltyStatsLoad(false); }
  };

  useEffect(() => { load(); }, [load]);

  const saveProg = async () => {
    setSaving(true);
    try { const p = await loyaltyApi.saveProgram(program); setProgram(p); setEditProg(false); }
    finally { setSaving(false); }
  };

  const loadHistory = async () => {
    setHistLoad(true);
    try { const h = await loyaltyApi.promoHistory(); setPromoHist(h); setShowHist(true); }
    catch(e) { console.error(e); }
    finally { setHistLoad(false); }
  };

  useEffect(() => {
    if (!svcSearch || svcSearch.trim().length < 2) { setSvcResults([]); return; }
    setSvcSearchLoad(true);
    const t = setTimeout(async () => {
      try { const r = await loyaltyApi.searchClients(svcSearch); setSvcResults(r); }
      catch { setSvcResults([]); }
      finally { setSvcSearchLoad(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [svcSearch]);

  const doAddService = async () => {
    if (!svcClient) return;
    setSvcBusy(true); setSvcMsg('');
    try {
      const res = await loyaltyApi.addService({
        client_email: svcClient.email,
        client_name:  svcClient.name,
        stamps_to_add: svcQty,
      });
      const msg = res.reward_triggered
        ? `Tampon(s) ajoute(s) ! Recompense declenchee - code : ${res.reward_code}`
        : `${svcQty} tampon(s) ajoute(s). Total : ${res.client?.stamps || 0}/${res.stamps_required}`;
      setSvcMsg(msg);
      setSvcClient(null); setSvcSearch(''); setSvcQty(1); setSvcResults([]);
      load();
    } catch(e) { setSvcMsg('Erreur : ' + e.message); }
    finally { setSvcBusy(false); }
  };

  const doStamp = async () => {
    if (!stampEmail) return;
    setStamping(true);
    try {
      const res = await loyaltyApi.addStamp({ client_email:stampEmail, client_name:stampName, stamps_to_add:1 });
      if (res.reward_triggered) {
        alert(`${stampName||stampEmail} a atteint ${res.stamps_required} tampons ! Recompense debloquee : ${program.reward_label}`);
      }
      setStampModal(null); setStampEmail(''); setStampName('');
      load();
    } finally { setStamping(false); }
  };

  const inp = { width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:14, outline:'none', boxSizing:'border-box' };

  return (
    <div className="space-y-4">
      <div style={{ background:theme.card, borderRadius:20, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
        <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${theme.separator}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:12, background:'rgba(245,158,11,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <I.Gift style={{ width:18, height:18, color:'#f59e0b' }} />
            </div>
            <div>
              <p style={{ fontWeight:800, fontSize:15, color:theme.text, margin:0 }}>Programme fidélité</p>
              {program && <p style={{ fontSize:12, color:theme.muted, margin:0 }}>{program.stamps_required} tampons → {program.reward_label}</p>}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {program && (
              <button onClick={()=>{ setProgram(p=>({...p,enabled:!p.enabled})); loyaltyApi.saveProgram({...program,enabled:!program.enabled}); }}
                style={{ width:40, height:24, borderRadius:12, background: program.enabled?'#f59e0b':theme.inputBg, border:`2px solid ${program.enabled?'#f59e0b':theme.border}`, position:'relative', cursor:'pointer', transition:'all 0.2s' }}>
                <div style={{ width:16, height:16, borderRadius:8, background:'white', position:'absolute', top:2, left: program.enabled?20:2, transition:'left 0.2s' }} />
              </button>
            )}
            <button onClick={()=>setEditProg(!editProg)} style={{ padding:'6px 12px', borderRadius:10, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.2)', color:'#f59e0b', fontWeight:700, fontSize:12, cursor:'pointer' }}>
              {editProg ? '✓' : '⚙️'}
            </button>
          </div>
        </div>
        {editProg && program && (
          <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Mode de fidélité</label>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setProgram(p=>({...p,loyalty_mode:'stamps'}))}
                  style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer',
                    border:`1px solid ${(program.loyalty_mode||'stamps')==='stamps'?'#f59e0b':theme.border}`,
                    background:(program.loyalty_mode||'stamps')==='stamps'?'rgba(245,158,11,0.12)':theme.inputBg,
                    color:(program.loyalty_mode||'stamps')==='stamps'?'#f59e0b':theme.muted }}>
                  🎫 Passages
                </button>
                <button onClick={()=>setProgram(p=>({...p,loyalty_mode:'points'}))}
                  style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer',
                    border:`1px solid ${(program.loyalty_mode||'stamps')==='points'?'#111827':theme.border}`,
                    background:(program.loyalty_mode||'stamps')==='points'?'rgba(17,24,39,0.12)':theme.inputBg,
                    color:(program.loyalty_mode||'stamps')==='points'?'#111827':theme.muted }}>
                  ⭐ Points
                </button>
              </div>
            </div>

            {(program.loyalty_mode||'stamps')==='points' && (
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Points gagnés par euro dépensé</label>
                <input type="number" min="0.01" step="0.1" value={program.points_per_euro||1}
                  onChange={e=>setProgram(p=>({...p,points_per_euro:parseFloat(e.target.value)||1}))} style={inp} />
                <p style={{ fontSize:11, color:theme.muted, marginTop:4 }}>Ex : 1 point = 1 € dépensé → seuil {program.stamps_required||100} points</p>
              </div>
            )}

            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>
                {(program.loyalty_mode||'stamps')==='points' ? 'Points requis pour la recompense' : 'Passages requis pour la recompense'}
              </label>
              <input type="number" min="1" max="9999" value={program.stamps_required}
                onChange={e=>setProgram(p=>({...p,stamps_required:parseInt(e.target.value)||10}))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Type de r&#233;compense</label>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setProgram(p=>({...p,reward_type:'percent'}))}
                  style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer', border:`1px solid ${program.reward_type==='percent'?'#111827':theme.border}`, background:program.reward_type==='percent'?'rgba(17,24,39,0.12)':theme.inputBg, color:program.reward_type==='percent'?'#111827':theme.muted }}>
                  % R&#233;duction
                </button>
                <button onClick={()=>setProgram(p=>({...p,reward_type:'fixed'}))}
                  style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer', border:`1px solid ${program.reward_type==='fixed'?'#10b981':theme.border}`, background:program.reward_type==='fixed'?'rgba(16,185,129,0.12)':theme.inputBg, color:program.reward_type==='fixed'?'#10b981':theme.muted }}>
                  &#8364; Montant fixe
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>
                Valeur de la r&#233;compense ({program.reward_type==='percent'?'%':'&#8364;'})
              </label>
              <div style={{ position:'relative' }}>
                <input type="number" min="1" max={program.reward_type==='percent'?100:9999} step="0.5"
                  value={program.reward_value||10}
                  onChange={e=>setProgram(p=>({...p,reward_value:parseFloat(e.target.value)||10}))}
                  style={{...inp, paddingRight:36}} />
                <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontWeight:800, color:theme.muted, fontSize:15 }}>
                  {program.reward_type==='percent'?'%':'€'}
                </span>
              </div>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Libel&#233; de la r&#233;compense</label>
              <input placeholder="ex: Prestation offerte" value={program.reward_label||''} onChange={e=>setProgram(p=>({...p,reward_label:e.target.value}))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Comptabiliser les passages</label>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {[
                  { v:'physical', l:'Physique uniquement',   d:'Caisse et prestation ajoutee sur place' },
                  { v:'online',   l:'En ligne uniquement',    d:'Reservations via le site public' },
                  { v:'both',     l:'Les deux (recommande)', d:'Physique + en ligne' },
                ].map(opt => (
                  <button key={opt.v} onClick={()=>setProgram(p=>({...p,count_trigger:opt.v}))}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:12, cursor:'pointer', textAlign:'left',
                      border:`1.5px solid ${(program.count_trigger||'both')===opt.v?'#f59e0b':theme.border}`,
                      background:(program.count_trigger||'both')===opt.v?'rgba(245,158,11,0.1)':theme.inputBg }}>
                    <div style={{ width:16, height:16, borderRadius:8, border:`2px solid ${(program.count_trigger||'both')===opt.v?'#f59e0b':theme.muted}`,
                      background:(program.count_trigger||'both')===opt.v?'#f59e0b':'transparent', flexShrink:0 }} />
                    <div>
                      <p style={{ margin:0, fontWeight:700, fontSize:13, color:theme.text }}>{opt.l}</p>
                      <p style={{ margin:0, fontSize:11, color:theme.muted }}>{opt.d}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Achat minimum (€)</label>
                <input type="number" min="0" step="0.5" value={program.min_purchase||0}
                  onChange={e=>setProgram(p=>({...p,min_purchase:parseFloat(e.target.value)||0}))}
                  style={inp} />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Validité du code (jours)</label>
                <input type="number" min="1" max="365" value={program.validity_days||90}
                  onChange={e=>setProgram(p=>({...p,validity_days:parseInt(e.target.value)||90}))}
                  style={inp} />
              </div>
            </div>
            <div style={{ background:'rgba(245,158,11,0.08)', borderRadius:12, padding:'10px 14px' }}>
              <p style={{ fontSize:12, color:'#92400e', margin:0, fontWeight:600 }}>
                {program.stamps_required} {(program.loyalty_mode||'stamps')==='points'?'points':'passages'} → {program.reward_type==='percent'?`${program.reward_value||10}%`:`${Number(program.reward_value||10).toFixed(2)} €`} · valide {program.validity_days||90}j{(program.min_purchase||0)>0?` · min ${program.min_purchase}€`:''}
              </p>
            </div>
            <button onClick={saveProg} disabled={saving} style={{ padding:'11px', borderRadius:12, background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'white', fontWeight:800, border:'none', cursor:'pointer' }}>
              {saving ? '&#9203;...' : '&#128190; Sauvegarder'}
            </button>
          </div>
        )}
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:160, position:'relative' }}>
          <I.Search style={{ width:14, height:14, position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:theme.muted }} />
          <input placeholder="Rechercher un client..." value={search} onChange={e=>setSearch(e.target.value)} style={{ width:'100%', padding:'10px 10px 10px 34px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
        </div>
        <button onClick={()=>setStampModal(true)} disabled={!program?.enabled}
          style={{ padding:'10px 14px', borderRadius:12, background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'white', fontWeight:800, fontSize:13, border:'none', cursor:'pointer', flexShrink:0, opacity:program?.enabled?1:0.4 }}>
          + Tampon
        </button>
        <button onClick={loadLoyaltyStats} disabled={loyaltyStatsLoad}
          style={{ padding:'10px 14px', borderRadius:12, background:theme.cardAlt, border:`1px solid ${theme.border}`, color:theme.text, fontWeight:700, fontSize:12, cursor:'pointer', flexShrink:0 }}>
          {loyaltyStatsLoad ? '⏳' : '📊'} Traçabilité
        </button>
      </div>

      {showLoyaltyStats && loyaltyStats && (
        <div style={{ background:isDark?'rgba(17,24,39,0.06)':'rgba(17,24,39,0.03)', border:'1px solid rgba(17,24,39,0.2)', borderRadius:18, padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p style={{ fontWeight:800, fontSize:14, color:theme.text, margin:0 }}>Traçabilité fidélité</p>
            <button onClick={()=>setShowLoyaltyStats(false)} style={{ background:'none', border:'none', cursor:'pointer', color:theme.muted, fontSize:18 }}>✕</button>
          </div>
          {(() => {
            const s = loyaltyStats.summary || {};
            const codesGeneres  = parseInt(s.total_codes   || 0);
            const mtUtilise     = parseFloat(s.montant_utilise || 0);
            const codesUtilises = parseInt(s.codes_utilises || 0);
            const codesRestants = parseInt(s.codes_restants || 0);
            return (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:16 }}>
                {[
                  { l:'Codes généres',   v: codesGeneres,              c:'#f59e0b' },
                  { l:'Remises utilisees', v: `${mtUtilise.toFixed(2)} €`, c:'#ef4444' },
                  { l:'Codes utilises',  v: codesUtilises,             c:'#10b981' },
                  { l:'Codes restants',  v: codesRestants,             c:'#111827' },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ borderRadius:12, padding:'10px 12px', textAlign:'center', background:isDark?`${c}22`:`${c}11`, border:`1px solid ${c}33` }}>
                    <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', color:c, margin:'0 0 4px' }}>{l}</p>
                    <p style={{ fontSize:16, fontWeight:900, color:c, margin:0 }}>{v}</p>
                  </div>
                ))}
              </div>
            );
          })()}
          {loyaltyStats.clients && loyaltyStats.clients.length > 0 && (
            <div>
              <p style={{ fontSize:12, fontWeight:700, color:theme.muted, margin:'0 0 10px' }}>CA par client</p>
              <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflowY:'auto' }}>
                {loyaltyStats.clients.map((cl,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:theme.card, borderRadius:12, border:`1px solid ${theme.border}` }}>
                    <div>
                      <p style={{ margin:0, fontWeight:700, fontSize:13, color:theme.text }}>{cl.client_name || cl.client_email}</p>
                      <p style={{ margin:0, fontSize:11, color:theme.muted }}>{cl.total_stamps_ever} passage{cl.total_stamps_ever>1?'s':''} · {cl.rewards_earned} recompense{cl.rewards_earned>1?'s':''}</p>
                    </div>
                    <span style={{ fontWeight:900, fontSize:14, color:'#10b981' }}>{Number(cl.ca_total).toFixed(2)} €</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? <div className="py-16 text-center"><I.Loader className="w-6 h-6 mx-auto animate-spin" style={{ color:theme.muted }} /></div>
      : clients.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', background:theme.card, borderRadius:18, border:`1px solid ${theme.border}` }}>
          <I.Gift style={{ width:36, height:36, margin:'0 auto 10px', color:theme.dim }} />
          <p style={{ color:theme.muted, fontSize:14, margin:0 }}>Aucun client fidélité</p>
        </div>
      ) : (
        <div style={{ background:theme.card, borderRadius:18, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
          {clients.map((cl,i) => {
            const isPoints = (program?.loyalty_mode||'stamps') === 'points';
            const currentVal = isPoints ? (parseFloat(cl.points)||0) : (parseInt(cl.stamps)||0);
            const pct = program ? Math.min(100, (currentVal / (program.stamps_required||10))*100) : 0;
            return (
              <div key={cl.id} style={{ padding:'14px 16px', borderBottom: i<clients.length-1?`1px solid ${theme.separator}`:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <div style={{ width:36, height:36, borderRadius:12, background:'rgba(245,158,11,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:15, color:'#f59e0b', flexShrink:0 }}>
                    {(cl.client_name||cl.client_email||'?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:14, color:theme.text, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cl.client_name||'-'}</p>
                    <p style={{ fontSize:11, color:theme.muted, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cl.client_email}</p>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    {(program?.loyalty_mode||'stamps')==='points' ? (
                      <>
                        <p style={{ fontWeight:900, fontSize:18, color:theme.text, margin:0 }}>
                          {Math.floor(cl.points||0)}<span style={{ fontSize:11, color:theme.muted, fontWeight:600 }}>pts/{program?.stamps_required||100}</span>
                        </p>
                        <p style={{ fontSize:10, color:theme.dim, margin:0 }}>{cl.total_points_ever||0} pts cumulés</p>
                      </>
                    ) : (
                      <>
                        <p style={{ fontWeight:900, fontSize:18, color:'#f59e0b', margin:0 }}>
                          {cl.stamps}<span style={{ fontSize:11, color:theme.muted, fontWeight:600 }}>/{program?.stamps_required||10}</span>
                        </p>
                        <p style={{ fontSize:10, color:theme.dim, margin:0 }}>{cl.rewards_earned} 🎁 gagnée(s)</p>
                      </>
                    )}
                  </div>
                  <button onClick={()=>setDelId(cl.id)} style={{ width:26, height:26, borderRadius:8, background:'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <I.Trash style={{ width:11, height:11, color:'#ef4444' }} />
                  </button>
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  {Array.from({length:program?.stamps_required||10}).map((_,j) => (
                    <div key={j} style={{ flex:1, height:6, borderRadius:3, background: j < cl.stamps ? '#f59e0b' : isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.08)' }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {stampModal && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={()=>setStampModal(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(12px)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:380, background: isDark?'#161620':'#fff', borderRadius:24, border:`1px solid ${theme.border}`, padding:24 }}>
            <h3 style={{ fontWeight:800, fontSize:17, color:theme.text, margin:'0 0 20px' }}>Ajouter un tampon</h3>
            <div className="space-y-3">
              <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Email client *</label><input type="email" placeholder="client@email.fr" value={stampEmail} onChange={e=>setStampEmail(e.target.value)} style={inp} /></div>
              <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Nom (optionnel)</label><input placeholder="Prénom Nom" value={stampName} onChange={e=>setStampName(e.target.value)} style={inp} /></div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={()=>setStampModal(null)} style={{ flex:1, padding:'12px', borderRadius:12, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer' }}>Annuler</button>
              <button onClick={doStamp} disabled={stamping||!stampEmail} style={{ flex:2, padding:'12px', borderRadius:12, background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'white', fontWeight:800, border:'none', cursor:'pointer', opacity:!stampEmail?0.5:1 }}>
                {stamping ? '⏳...' : '🎫 Valider le tampon'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ background:theme.card, borderRadius:20, padding:20, border:`1px solid ${theme.border}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <I.Plus style={{ width:18, height:18, color:'#10b981' }} />
            <span style={{ fontWeight:800, fontSize:15, color:theme.text }}>Ajouter une prestation client</span>
          </div>
          <button onClick={()=>{ setShowAddSvc(!showAddSvc); setSvcMsg(''); }}
            style={{ padding:'6px 14px', borderRadius:10, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', color:'#10b981', fontWeight:700, fontSize:12, cursor:'pointer' }}>
            {showAddSvc ? 'Fermer' : 'Ouvrir'}
          </button>
        </div>
        {showAddSvc && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ position:'relative' }}>
              <input placeholder="Rechercher par nom, email, téléphone..."
                value={svcSearch} onChange={e=>{ setSvcSearch(e.target.value); setSvcClient(null); }}
                style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', boxSizing:'border-box' }}
              />
              {svcSearchLoad && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:12, color:theme.muted }}>⏳</span>}
            </div>
            {svcResults.length > 0 && !svcClient && (
              <div style={{ background:theme.inputBg, border:`1px solid ${theme.border}`, borderRadius:12, overflow:'hidden' }}>
                {svcResults.map(r => (
                  <div key={r.id} onClick={()=>{ setSvcClient(r); setSvcResults([]); setSvcSearch(r.name + (r.email?' - '+r.email:'')); }}
                    style={{ padding:'10px 14px', cursor:'pointer', borderBottom:`1px solid ${theme.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <p style={{ margin:0, fontWeight:700, fontSize:13, color:theme.text }}>{r.name}</p>
                      <p style={{ margin:0, fontSize:11, color:theme.muted }}>{r.email}{r.phone?' · '+r.phone:''}</p>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:'#f59e0b', background:'rgba(245,158,11,0.1)', padding:'2px 8px', borderRadius:6 }}>{r.stamps||0} 🎫</span>
                  </div>
                ))}
              </div>
            )}
            {svcClient && (
              <div style={{ background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ margin:0, fontWeight:700, fontSize:13, color:'#10b981' }}>{svcClient.name}</p>
                  <p style={{ margin:0, fontSize:11, color:theme.muted }}>{svcClient.email} · {svcClient.stamps||0}/{program?.stamps_required||'?'} tampons</p>
                </div>
                <button onClick={()=>{ setSvcClient(null); setSvcSearch(''); }}
                  style={{ background:'none', border:'none', cursor:'pointer', color:theme.muted, fontSize:18 }}>✕</button>
              </div>
            )}
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:4 }}>Nb de tampons à ajouter</label>
                <input type="number" min="1" max="20" value={svcQty} onChange={e=>setSvcQty(parseInt(e.target.value)||1)}
                  style={{ width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <button onClick={doAddService} disabled={!svcClient||svcBusy}
                style={{ padding:'10px 18px', borderRadius:12, background:'linear-gradient(135deg,#10b981,#059669)', color:'white', fontWeight:800, fontSize:13, border:'none', cursor:'pointer', marginTop:20, opacity:!svcClient?0.4:1 }}>
                {svcBusy ? '⏳' : '+ Ajouter'}
              </button>
            </div>
            {svcMsg && (
              <p style={{ margin:0, fontSize:12, fontWeight:700, color: svcMsg.includes('Erreur') ? '#ef4444' : '#10b981', background: svcMsg.includes('Erreur')?'rgba(239,68,68,0.07)':'rgba(16,185,129,0.07)', padding:'8px 12px', borderRadius:10 }}>{svcMsg}</p>
            )}
          </div>
        )}
      </div>

      <div style={{ background:theme.card, borderRadius:20, padding:20, border:`1px solid ${theme.border}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: showHist ? 14 : 0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <I.FileText style={{ width:18, height:18, color:'#111827' }} />
            <span style={{ fontWeight:800, fontSize:15, color:theme.text }}>Historique codes fidélité</span>
          </div>
          <button onClick={()=>{ if (!showHist) loadHistory(); else setShowHist(false); }}
            style={{ padding:'6px 14px', borderRadius:10, background:theme.cardAlt, border:`1px solid ${theme.border}`, color:theme.text, fontWeight:700, fontSize:12, cursor:'pointer' }}>
            {histLoad ? '⏳' : showHist ? 'Masquer' : 'Afficher'}
          </button>
        </div>
        {showHist && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {promoHist.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px 0', color:theme.muted }}>
                <p style={{ fontSize:32, margin:'0 0 8px' }}>🎫</p>
                <p style={{ fontSize:14, fontWeight:600 }}>Aucun code fidélité généré pour l'instant</p>
              </div>
            ) : promoHist.map(row => {
              const used = row.uses_count > 0;
              const expired = !row.is_active || (row.valid_until && new Date(row.valid_until) < new Date());
              const statusColor = used ? '#10b981' : expired ? '#ef4444' : '#f59e0b';
              const statusLabel = used ? 'Utilise' : expired ? 'Expire' : 'Disponible';
              return (
                <div key={row.id} style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:16, padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                        <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:15, color:'#f59e0b', letterSpacing:'0.08em' }}>{row.code}</span>
                        <span style={{ padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:800, background:`${statusColor}18`, color:statusColor }}>{statusLabel}</span>
                      </div>
                      <p style={{ margin:0, fontSize:12, color:theme.muted }}>
                        Client : <strong style={{ color:theme.text }}>{row.owner_name || row.owner_client_email || '-'}</strong>
                      </p>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <p style={{ margin:0, fontWeight:900, fontSize:16, color:theme.text }}>
                        {row.type==='percent' ? `-${row.value}%` : `-${Number(row.value||0).toFixed(2)} €`}
                      </p>
                      {row.min_purchase > 0 && (
                        <p style={{ margin:'2px 0 0', fontSize:10, color:theme.muted }}>Min. {Number(row.min_purchase).toFixed(2)} €</p>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10, fontSize:11 }}>
                    <span style={{ color:theme.muted }}>📅 Généré le <strong>{row.created_at ? new Date(row.created_at).toLocaleDateString('fr-FR') : '-'}</strong></span>
                    <span style={{ color:row.valid_until && new Date(row.valid_until)<new Date() ? '#ef4444' : theme.muted }}>
                      ⏳ Expire le <strong>{row.valid_until ? new Date(row.valid_until).toLocaleDateString('fr-FR') : '-'}</strong>
                    </span>
                    {used && (
                      <span style={{ color:'#10b981' }}>✓ Utilise le <strong>{row.used_at ? new Date(row.used_at).toLocaleDateString('fr-FR') : '-'}</strong></span>
                    )}
                    {row.discount_applied && (
                      <span style={{ color:'#10b981', fontWeight:700 }}>Remise appliquée : <strong>-{Number(row.discount_applied).toFixed(2)} €</strong></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Confirm open={!!delId} onClose={()=>setDelId(null)} title="Supprimer ce client fidélité ?" desc="Ses tampons seront perdus." theme={theme}
        onConfirm={async()=>{ await loyaltyApi.removeClient(delId); setClients(p=>p.filter(c=>c.id!==delId)); setDelId(null); }} />
    </div>
  );
}

function PromoForm({ open, onClose, init, onSave, theme }) {
  const isDark = theme.mode === 'dark';
  const [code, setCode]       = useState('');
  const [type, setType]       = useState('percent');
  const [value, setValue]     = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [validFrom, setValidFrom]   = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState('');
  const [targetClients, setTargetClients] = useState('all');
  const [timeAllday, setTimeAllday] = useState(true);
  const [timeFrom, setTimeFrom]     = useState('10:00');
  const [timeUntil, setTimeUntil]   = useState('14:00');
  const [saving, setSaving] = useState(false);
  const [campaignChannel, setCampaignChannel] = useState('none');
  const [campaignTarget, setCampaignTarget] = useState('top50');
  const [customCount, setCustomCount] = useState('50');
  const [smsMessage, setSmsMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [smsUserEdited, setSmsUserEdited] = useState(false);
  const [merchant, setMerchant] = useState(null);
  const [resultModal, setResultModal] = useState(null);

  useEffect(() => {
    if (!open) return;
    api.me().then(r => setMerchant(r.user || r)).catch(() => {});
  }, [open]);

  // Préremplit le SMS en multi-ligne tant que l'utilisateur n'a pas édité manuellement
  useEffect(() => {
    if (smsUserEdited || !open) return;
    const fmtDate = (d) => {
      if (!d) return '';
      const [y,m,dd] = String(d).split('-');
      return `${dd}/${m}/${y}`;
    };
    const discount = type === 'percent' ? `-${value || 0}%` : `-${value || 0}€`;
    const bn   = merchant?.businessName || '';
    const tel  = merchant?.phone || '';
    const addr = merchant?.address || '';

    const lines = [];
    if (bn) lines.push(bn);
    lines.push(`Profitez de ${discount} avec le code ${code || 'XXXX'}`);

    // Validité
    if (validFrom && validUntil)      lines.push(`Valable du ${fmtDate(validFrom)} au ${fmtDate(validUntil)}`);
    else if (validFrom)               lines.push(`Valable dès le ${fmtDate(validFrom)}`);
    else if (validUntil)              lines.push(`Valable jusqu'au ${fmtDate(validUntil)}`);

    // Plage horaire
    if (!timeAllday && timeFrom && timeUntil) {
      const fmtH = (t) => String(t).substring(0,5).replace(':','h');
      lines.push(`de ${fmtH(timeFrom)} à ${fmtH(timeUntil)}`);
    }

    // Conditions: Offre limitée (si max_uses défini)
    if (maxUses && parseInt(maxUses) > 0) lines.push('Offre limitée');

    // Coordonnées
    const contact = [addr, tel].filter(Boolean).join(' - ');
    if (contact) lines.push(contact);

    let msg = lines.join('\n');
    if (msg.length > 160) msg = msg.slice(0, 157) + '...';
    setSmsMessage(msg);
  }, [code, value, type, merchant, open, smsUserEdited, validFrom, validUntil, timeAllday, timeFrom, timeUntil, maxUses]);

  useEffect(() => {
    if (init) {
      setCode(init.code||''); setType(init.type||'percent'); setValue(init.value||'');
      setMaxUses(init.max_uses||''); setValidFrom(init.valid_from||''); setValidUntil(init.valid_until||'');
      setTargetClients(init.target_clients||'all');
      setTimeAllday(init.time_allday !== false);
      setTimeFrom(init.time_from ? init.time_from.substring(0,5) : '10:00');
      setTimeUntil(init.time_until ? init.time_until.substring(0,5) : '14:00');
    } else {
      setCode(''); setType('percent'); setValue(''); setMaxUses('');
      setValidFrom(new Date().toISOString().split('T')[0]); setValidUntil('');
      setTargetClients('all'); setTimeAllday(true); setTimeFrom('10:00'); setTimeUntil('14:00');
    }
    setCampaignChannel('none'); setPreview(null); setSmsMessage('');
  }, [init, open]);

  if (!open) return null;
  const inp = { width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:14, outline:'none', boxSizing:'border-box' };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(12px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto',
        background: isDark?'#161620':'#fff', borderRadius:24, border:`1px solid ${theme.border}`, padding:24 }}>
        <h3 style={{ fontWeight:800, fontSize:17, color:theme.text, margin:'0 0 20px' }}>{init ? 'Modifier le code' : 'Nouveau code promo'}</h3>
        <div className="space-y-3">
          <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Code *</label>
            <input placeholder="BIENVENUE10" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} style={{...inp, textTransform:'uppercase', fontFamily:'monospace', fontWeight:700, fontSize:16, letterSpacing:'0.1em'}} /></div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Type de remise</label>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setType('percent')} style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer', border:`1px solid ${type==='percent'?'#1a73e8':theme.border}`, background: type==='percent'?'rgba(26,115,232,0.12)':theme.inputBg, color: type==='percent'?'#1a73e8':theme.muted }}>% Pourcentage</button>
              <button onClick={()=>setType('fixed')} style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer', border:`1px solid ${type==='fixed'?'#10b981':theme.border}`, background: type==='fixed'?'rgba(16,185,129,0.12)':theme.inputBg, color: type==='fixed'?'#10b981':theme.muted }}>€ Montant fixe</button>
            </div>
          </div>
          <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Valeur *</label>
            <div style={{ position:'relative' }}>
              <input type="number" min="0" placeholder={type==='percent'?'10':'5.00'} value={value} onChange={e=>setValue(e.target.value)} style={{...inp, paddingRight:36}} />
              <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontWeight:700, color:theme.muted, fontSize:16 }}>{type==='percent'?'%':'€'}</span>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Valide du</label><input type="date" value={validFrom} onChange={e=>setValidFrom(e.target.value)} style={inp} /></div>
            <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Jusqu&apos;au</label><input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)} style={inp} /></div>
          </div>

          <div>
            <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Plage horaire d&apos;utilisation</label>
            <div style={{ display:'flex', gap:8, marginBottom: timeAllday ? 0 : 10 }}>
              <button onClick={()=>setTimeAllday(true)}
                style={{ flex:1, padding:'9px', borderRadius:11, fontWeight:700, fontSize:12, cursor:'pointer',
                  border:`1px solid ${timeAllday?'#1a73e8':theme.border}`,
                  background:timeAllday?'rgba(26,115,232,0.12)':theme.inputBg,
                  color:timeAllday?'#1a73e8':theme.muted }}>🕐 Toute la journée</button>
              <button onClick={()=>setTimeAllday(false)}
                style={{ flex:1, padding:'9px', borderRadius:11, fontWeight:700, fontSize:12, cursor:'pointer',
                  border:`1px solid ${!timeAllday?'#f59e0b':theme.border}`,
                  background:!timeAllday?'rgba(245,158,11,0.12)':theme.inputBg,
                  color:!timeAllday?'#f59e0b':theme.muted }}>⏰ Plage horaire</button>
            </div>
            {!timeAllday && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:5 }}>De</label>
                  <input type="time" value={timeFrom} onChange={e=>setTimeFrom(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:5 }}>À</label>
                  <input type="time" value={timeUntil} onChange={e=>setTimeUntil(e.target.value)} style={inp} />
                </div>
              </div>
            )}
            {!timeAllday && timeFrom && timeUntil && (
              <div style={{ marginTop:8, padding:'7px 12px', borderRadius:10,
                background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)' }}>
                <p style={{ fontSize:11, fontWeight:700, color:'#f59e0b', margin:0 }}>
                  ⏰ Code valide de {timeFrom} à {timeUntil}
                </p>
              </div>
            )}
          </div>

          <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Utilisations max (vide = illimité)</label>
            <input type="number" min="1" placeholder="Illimité" value={maxUses} onChange={e=>setMaxUses(e.target.value)} style={inp} /></div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Applicable à</label>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setTargetClients('all')}
                style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer',
                  border:`1px solid ${targetClients==='all'?'#1a73e8':theme.border}`,
                  background:targetClients==='all'?'rgba(26,115,232,0.12)':theme.inputBg,
                  color:targetClients==='all'?'#1a73e8':theme.muted }}>
                Tous les clients
              </button>
              <button onClick={()=>setTargetClients('new')}
                style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer',
                  border:`1px solid ${targetClients==='new'?'#10b981':theme.border}`,
                  background:targetClients==='new'?'rgba(16,185,129,0.12)':theme.inputBg,
                  color:targetClients==='new'?'#10b981':theme.muted }}>
                Nouveaux clients
              </button>
            </div>
          </div>
          {!init && (
            <div style={{ padding:'14px', borderRadius:14, background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', border:`1px solid ${theme.border}` }}>
              <p style={{ fontSize:12, fontWeight:800, color:theme.muted, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Envoyer aux clients</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
                {[
                  { id:'none', label:'Ne pas envoyer', color:theme.muted },
                  { id:'email', label:'Email (gratuit)', color:'#1a73e8' },
                  { id:'sms', label:'SMS (payant)', color:'#f59e0b' },
                  { id:'both', label:'Email + SMS', color:'#8b5cf6' },
                ].map(ch => (
                  <button key={ch.id} onClick={() => { setCampaignChannel(ch.id); setPreview(null); }}
                    style={{ padding:'9px 8px', borderRadius:10, fontWeight:700, fontSize:11, cursor:'pointer',
                      border:`1px solid ${campaignChannel===ch.id ? ch.color : theme.border}`,
                      background: campaignChannel===ch.id ? `${ch.color}15` : theme.inputBg,
                      color: campaignChannel===ch.id ? ch.color : theme.muted }}>{ch.label}</button>
                ))}
              </div>
              {campaignChannel !== 'none' && (
                <>
                  <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Ciblage</label>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
                    {[{id:'top50',l:'Top 50'},{id:'top100',l:'Top 100'},{id:'top200',l:'Top 200'},{id:'all',l:'Tous'},{id:'custom',l:'Personnalise'}].map(t => (
                      <button key={t.id} onClick={() => setCampaignTarget(t.id)}
                        style={{ padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer',
                          border:`1px solid ${campaignTarget===t.id ? '#1a73e8' : theme.border}`,
                          background: campaignTarget===t.id ? 'rgba(26,115,232,0.12)' : theme.inputBg,
                          color: campaignTarget===t.id ? '#1a73e8' : theme.muted }}>{t.l}</button>
                    ))}
                  </div>
                  {campaignTarget === 'custom' && (
                    <div style={{ marginBottom:10 }}>
                      <input type="number" min="1" value={customCount} onChange={e => setCustomCount(e.target.value)}
                        placeholder="Nombre de clients" style={{...inp, fontSize:12}} />
                    </div>
                  )}
                  {(campaignChannel === 'sms' || campaignChannel === 'both') && (
                    <div style={{ marginBottom:10 }}>
                      <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:4 }}>Message SMS (160 car. max)</label>
                      <textarea value={smsMessage}
                        onChange={e => { setSmsMessage(e.target.value.slice(0,160)); setSmsUserEdited(true); }}
                        placeholder="Profitez de -10% avec le code PROMO10 !"
                        style={{...inp, height:72, resize:'none', fontSize:12}} />
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <button type="button" onClick={() => setSmsUserEdited(false)}
                          style={{ fontSize:10, padding:'3px 8px', borderRadius:6, border:`1px solid ${theme.border}`, background:'transparent', color:theme.muted, cursor:'pointer' }}>
                          ↻ Remplissage auto
                        </button>
                        <p style={{ margin:0, fontSize:10, color: smsMessage.length > 150 ? '#ef4444' : theme.muted }}>{smsMessage.length}/160</p>
                      </div>
                    </div>
                  )}
                  <button onClick={async () => {
                    setPreviewLoading(true);
                    try {
                      const p = await campaignsApi.getCampaignPreview({
                        target_type: campaignTarget, custom_count: customCount, channel: campaignChannel
                      });
                      setPreview(p);
                    } catch(e) { alert(e.message); }
                    finally { setPreviewLoading(false); }
                  }} disabled={previewLoading}
                    style={{ width:'100%', padding:'8px', borderRadius:10, fontSize:12, fontWeight:700,
                      background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.text,
                      cursor:'pointer', opacity:previewLoading?0.6:1 }}>
                    {previewLoading ? 'Calcul...' : 'Calculer le cout'}
                  </button>
                  {preview && (
                    <div style={{ marginTop:10, padding:'10px 12px', borderRadius:10, background: isDark ? 'rgba(255,255,255,0.06)' : 'white', border:`1px solid ${theme.border}`, fontSize:12 }}>
                      {preview.email && (
                        <>
                          <p style={{ margin:'3px 0', color:theme.text }}><strong>{preview.email.count} clients</strong> recevront un email</p>
                          {preview.email.plan
                            ? <p style={{ margin:'3px 0', color:'#f59e0b', fontWeight:600 }}>Envoi sur {preview.email.plan.days_needed + 1} jours automatiquement</p>
                            : <p style={{ margin:'3px 0', color:'#10b981', fontWeight:600 }}>Envoi possible aujourd'hui</p>
                          }
                        </>
                      )}
                      {preview.sms && (
                        <>
                          <p style={{ margin:'3px 0', color:theme.text }}><strong>{preview.sms.count} clients</strong> recevront un SMS</p>
                          <p style={{ margin:'3px 0', color:theme.text }}>Cout : <strong>{parseFloat(preview.sms.cost || 0).toFixed(2)} EUR</strong></p>
                          {preview.sms.sufficient
                            ? <p style={{ margin:'3px 0', color:'#10b981', fontWeight:700 }}>Solde OK ({parseFloat(preview.sms.balance || 0).toFixed(2)} EUR)</p>
                            : <p style={{ margin:'3px 0', color:'#ef4444', fontWeight:700 }}>
                                Il vous manque {parseFloat((preview.sms.cost || 0) - (preview.sms.balance || 0)).toFixed(2)} EUR
                                <button onClick={() => window.location.href='/settings/marketing?recharge=need'}
                                  style={{ marginLeft:8, padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:700,
                                    background:'rgba(99,102,241,0.12)', color:'#6366f1', border:'none', cursor:'pointer' }}>
                                  Recharger mon solde
                                </button>
                              </p>
                          }
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:12, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer' }}>Annuler</button>
          <button onClick={async () => {
            if (!code || !value) return;
            setSaving(true);
            try {
              const saved = await onSave({
                code, type, value:parseFloat(value),
                max_uses:maxUses?parseInt(maxUses):null,
                valid_from:validFrom||null, valid_until:validUntil||null,
                target_clients:targetClients,
                time_allday: timeAllday,
                time_from:  timeAllday ? null : timeFrom,
                time_until: timeAllday ? null : timeUntil,
              });
              if (campaignChannel !== 'none' && saved?.id) {
                setSendingCampaign(true);
                const wantEmail = campaignChannel === 'email' || campaignChannel === 'both';
                const wantSms   = campaignChannel === 'sms'   || campaignChannel === 'both';
                let emailResult = null, smsResult = null, error = null;
                try {
                  if (wantEmail) {
                    emailResult = await promoApi.sendEmails(saved.id, { client_ids: [] });
                  }
                  if (wantSms) {
                    smsResult = await campaignsApi.sendCampaign({
                      promo_code_id: saved.id,
                      target_type: campaignTarget,
                      custom_count: customCount,
                      channel: 'sms',
                      message_sms: smsMessage || `${code}: ${type === 'percent' ? `-${value}%` : `-${value}€`}`,
                      promo_code: code,
                    });
                  }
                } catch(e) {
                  error = e.message;
                } finally { setSendingCampaign(false); }
                setResultModal({ code, emailResult, smsResult, error, channel: campaignChannel });
              } else {
                onClose();
              }
            } catch(e) {
              setResultModal({ code, error: e.message, channel: campaignChannel });
            } finally { setSaving(false); }
          }} disabled={saving||sendingCampaign||!code||!value||(campaignChannel==='sms'&&preview&&!preview.sms?.sufficient)}
            style={{ flex:2, padding:'13px', borderRadius:12,
              background: (!code||!value) ? theme.inputBg : '#1a73e8',
              color: (!code||!value) ? theme.muted : 'white',
              fontWeight:800, fontSize:14, border:'none', cursor:(!code||!value)?'not-allowed':'pointer',
              opacity:(saving||sendingCampaign)?0.6:1, boxShadow:(!code||!value)?'none':'0 4px 14px rgba(26,115,232,0.35)' }}>
            {saving ? 'Enregistrement...' : sendingCampaign ? 'Envoi campagne...' : campaignChannel !== 'none' ? 'Creer + Envoyer' : init ? 'Modifier' : 'Creer le code'}
          </button>
        </div>
      </div>
      {resultModal && (
        <SendResultModal data={resultModal} theme={theme} onClose={() => { setResultModal(null); onClose(); }} />
      )}
    </div>
  );
}

// ── Modale de confirmation moderne (check vert) ──────────────────────────────
function SendResultModal({ data, theme, onClose }) {
  const isDark = theme.mode === 'dark';
  const emailSent = data.emailResult?.sent || 0;
  const emailFailed = data.emailResult?.failed || 0;
  const smsSent = data.smsResult?.sent_sms || 0;
  const smsFailed = data.smsResult?.failed || 0;
  const hasError = !!data.error;
  const totalSent = emailSent + smsSent;
  const success = !hasError && totalSent > 0;
  const accent = success ? '#10b981' : hasError ? '#ef4444' : '#f59e0b';
  const title = success ? 'Envoi réussi' : hasError ? 'Erreur d\'envoi' : 'Aucun destinataire';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(12px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:420, background: isDark ? '#161622' : '#fff',
        borderRadius:24, border:`1px solid ${theme.border}`, padding:'32px 28px', textAlign:'center',
        boxShadow:'0 24px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:`${accent}18`,
          display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:18,
          border:`2px solid ${accent}33` }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            {success
              ? <polyline points="20 6 9 17 4 12"/>
              : hasError
                ? <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
            }
          </svg>
        </div>
        <h2 style={{ margin:'0 0 8px', fontSize:22, fontWeight:900, color:theme.text }}>{title}</h2>
        <p style={{ margin:'0 0 22px', fontSize:13, color:theme.muted }}>
          Code <strong style={{ color:theme.text, fontFamily:'monospace' }}>{data.code}</strong>
        </p>

        {hasError ? (
          <div style={{ padding:'14px 16px', borderRadius:12, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', marginBottom:18, textAlign:'left' }}>
            <p style={{ margin:0, fontSize:13, color:'#ef4444' }}>{data.error}</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:22 }}>
            {data.emailResult && (
              <div style={{ padding:'14px 18px', borderRadius:14, background: isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)',
                border:'1px solid rgba(16,185,129,0.22)', display:'flex', alignItems:'center', gap:12, textAlign:'left' }}>
                <div style={{ width:40, height:40, borderRadius:12, background:'rgba(16,185,129,0.16)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>📧</div>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:15, fontWeight:800, color:theme.text }}>
                    {emailSent} email{emailSent > 1 ? 's' : ''} envoyé{emailSent > 1 ? 's' : ''}
                  </p>
                  {emailFailed > 0 && <p style={{ margin:'2px 0 0', fontSize:11, color:'#ef4444' }}>{emailFailed} échec{emailFailed > 1 ? 's' : ''}</p>}
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            )}
            {data.smsResult && (
              <div style={{ padding:'14px 18px', borderRadius:14, background: isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.06)',
                border:'1px solid rgba(139,92,246,0.22)', display:'flex', alignItems:'center', gap:12, textAlign:'left' }}>
                <div style={{ width:40, height:40, borderRadius:12, background:'rgba(139,92,246,0.16)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>📱</div>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:15, fontWeight:800, color:theme.text }}>
                    {smsSent} SMS envoyé{smsSent > 1 ? 's' : ''}
                  </p>
                  {smsFailed > 0 && <p style={{ margin:'2px 0 0', fontSize:11, color:'#ef4444' }}>{smsFailed} échec{smsFailed > 1 ? 's' : ''}</p>}
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            )}
            {!data.emailResult && !data.smsResult && (
              <p style={{ margin:0, fontSize:13, color:theme.muted }}>Aucun destinataire trouvé.</p>
            )}
          </div>
        )}

        <button onClick={onClose}
          style={{ width:'100%', padding:'13px', borderRadius:12, border:'none',
            background: accent, color:'white', fontWeight:800, fontSize:14, cursor:'pointer',
            boxShadow:`0 4px 14px ${accent}55` }}>
          Fermer
        </button>
      </div>
    </div>
  );
}

function SendPromoEmailModal({ promo, theme, onClose, showToast }) {
  const isDark = theme.mode === 'dark';
  const [clients, setClients]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [sending, setSending]         = useState(false);
  const [selected, setSelected]       = useState(new Set());
  const [selectAll, setSelectAll]     = useState(true);
  const [searchQ, setSearchQ]         = useState('');
  const [result, setResult]           = useState(null);

  useEffect(() => {
    clientsApi.list({ limit: 500 })
      .then(d => {
        const withEmail = (d.clients || []).filter(c => c.email);
        setClients(withEmail);
        setSelected(new Set(withEmail.map(c => c.id)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter(c =>
    !searchQ || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(searchQ.toLowerCase())
  );

  const toggleClient = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelectAll(next.size === clients.length);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectAll) { setSelected(new Set()); setSelectAll(false); }
    else { setSelected(new Set(clients.map(c => c.id))); setSelectAll(true); }
  };

  const handleSend = async () => {
    if (selected.size === 0) { showToast('Selectionnez au moins un client', 'error'); return; }
    setSending(true);
    try {
      const clientIds = selectAll ? [] : Array.from(selected);
      const res = await promoApi.sendEmails(promo.id, { client_ids: clientIds });
      setResult(res);
      showToast(`✉️ ${res.sent} email${res.sent > 1 ? 's' : ''} envoye${res.sent > 1 ? 's' : ''} !`);
    } catch(e) {
      showToast(e.message || 'Erreur lors de l\'envoi', 'error');
    } finally {
      setSending(false);
    }
  };

  const discountLabel = promo.type === 'percent'
    ? `-${promo.value}%`
    : `-${Number(promo.value).toFixed(2)} €`;

  const inp = { width:'100%', padding:'9px 12px', borderRadius:10, border:`1px solid ${theme.border}`,
    background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', boxSizing:'border-box' };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:480, maxHeight:'88vh', display:'flex',
        flexDirection:'column', background:isDark?'#161622':'#fff',
        borderRadius:24, border:`1px solid ${theme.border}`, overflow:'hidden' }}>

        <div style={{ padding:'20px 22px 16px', borderBottom:`1px solid ${theme.border}`,
          background: isDark?'rgba(6,182,212,0.06)':'rgba(6,182,212,0.04)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:38, height:38, borderRadius:12, background:'rgba(6,182,212,0.12)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>✉️</div>
              <div>
                <p style={{ fontWeight:900, fontSize:15, color:theme.text, margin:0 }}>Envoyer la promo par email</p>
                <p style={{ fontSize:12, color:theme.muted, margin:0 }}>Prévenez vos clients de cette offre</p>
              </div>
            </div>
            <button onClick={onClose} style={{ width:28, height:28, borderRadius:8, border:'none',
              background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)', color:theme.muted, cursor:'pointer', fontSize:16 }}>✕</button>
          </div>

          <div style={{ padding:'10px 14px', borderRadius:12, background:isDark?'rgba(17,24,39,0.12)':'rgba(17,24,39,0.07)',
            border:'1px solid rgba(17,24,39,0.2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:18, color:theme.text, letterSpacing:'0.1em' }}>{promo.code}</span>
            <span style={{ padding:'4px 10px', borderRadius:8, background:theme.cardAlt, color:theme.text, fontWeight:700, fontSize:13 }}>{discountLabel}</span>
          </div>
        </div>

        {result && (
          <div style={{ padding:'14px 22px', background:'rgba(16,185,129,0.08)', borderBottom:`1px solid ${theme.border}` }}>
            <p style={{ fontWeight:800, fontSize:14, color:'#10b981', margin:'0 0 4px' }}>✅ Envoi terminé</p>
            <p style={{ fontSize:13, color:theme.muted, margin:0 }}>
              {result.sent} envoyé{result.sent>1?'s':''} · {result.failed} echec{result.failed>1?'s':''}
              {result.failed > 0 && ' (adresses invalides ou SMTP non configure)'}
            </p>
          </div>
        )}

        <div style={{ padding:'12px 22px 8px', borderBottom:`1px solid ${theme.border}` }}>
          <input placeholder="Rechercher un client…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{...inp, marginBottom:10}} />
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:theme.text, fontWeight:600 }}>
              <input type="checkbox" checked={selectAll} onChange={handleSelectAll}
                style={{ width:15, height:15, accentColor:'#111827', cursor:'pointer' }} />
              Tous les clients ({clients.length} avec email)
            </label>
            <span style={{ fontSize:12, color:theme.muted }}>{selected.size} sélectionné{selected.size>1?'s':''}</span>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
          {loading ? (
            <div style={{ padding:'32px', textAlign:'center', color:theme.muted }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:theme.muted }}>
              {clients.length === 0 ? 'Aucun client avec email enregistre' : 'Aucun resultat'}
            </div>
          ) : filtered.map(c => (
            <label key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 22px', cursor:'pointer',
              background: selected.has(c.id) ? (isDark?'rgba(17,24,39,0.06)':'rgba(17,24,39,0.04)') : 'transparent',
              transition:'background 0.1s' }}>
              <input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggleClient(c.id)}
                style={{ width:15, height:15, accentColor:'#111827', cursor:'pointer', flexShrink:0 }} />
              <div style={{ width:32, height:32, borderRadius:9, background:c.avatar_color||'#111827', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:800, fontSize:13 }}>
                {(c.first_name||'?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:600, fontSize:13, color:theme.text, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.first_name} {c.last_name}
                </p>
                <p style={{ fontSize:11, color:theme.muted, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.email}
                </p>
              </div>
            </label>
          ))}
        </div>

        <div style={{ padding:'14px 22px', borderTop:`1px solid ${theme.border}`, display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:12, background:theme.inputBg,
            border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer', fontSize:13 }}>
            Fermer
          </button>
          <button onClick={handleSend} disabled={sending || selected.size === 0}
            style={{ flex:2, padding:'13px', borderRadius:12, fontWeight:800, fontSize:13, border:'none',
              cursor: selected.size===0 ? 'not-allowed' : 'pointer',
              background: selected.size===0 ? theme.inputBg : 'linear-gradient(135deg,#374151,#0891b2)',
              color: selected.size===0 ? theme.muted : 'white',
              opacity: sending ? 0.6 : 1,
              boxShadow: selected.size===0 ? 'none' : '0 4px 14px rgba(6,182,212,0.35)' }}>
            {sending
              ? 'Envoi en cours...'
              : `Envoyer a ${selected.size} client${selected.size>1?'s':''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabPromo({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [delId, setDelId] = useState(null);
  const [statsData, setStatsData] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const [statsLoad, setStatsLoad] = useState(false);
  const [sendModal, setSendModal] = useState(null);
  const [createdConfirm, setCreatedConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPromos(await promoApi.list()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadStats = async () => {
    setStatsLoad(true);
    try { setStatsData(await promoApi.getStats()); setShowStats(true); }
    catch(e) { console.error(e); }
    finally { setStatsLoad(false); }
  };

  const handleSave = async (d) => {
    if (edit) {
      const u = await promoApi.update(edit.id, {...d, is_active:edit.is_active});
      setPromos(p=>p.map(x=>x.id===edit.id?u:x));
      setEdit(null); showToast('Code modifié ✓');
      return u;
    }
    const created = await promoApi.create(d);
    setPromos(p=>[created,...p]);
    return created;
  };

  const toggleActive = async (promo) => {
    const u = await promoApi.update(promo.id, {...promo, is_active:!promo.is_active});
    setPromos(p=>p.map(x=>x.id===promo.id?u:x));
  };

  const fmt = v => {
    const d = new Date(v+'T12:00:00');
    return d.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
  };

  return (
    <div className="space-y-4">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <button onClick={loadStats} disabled={statsLoad}
          style={{ padding:'10px 14px', borderRadius:12, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)', color:'#f59e0b', fontWeight:700, fontSize:12, cursor:'pointer' }}>
          {statsLoad ? '⏳' : '📊'} Traçabilité
        </button>
        <button onClick={()=>{ setEdit(null); setModal(true); }}
          style={{ padding:'10px 16px', borderRadius:12, background:'#1a73e8', color:'white', fontWeight:800, fontSize:13, border:'none', cursor:'pointer' }}>
          + Nouveau code
        </button>
      </div>

      {showStats && (
        <div style={{ background:isDark?'rgba(245,158,11,0.08)':'rgba(245,158,11,0.04)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:18, padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p style={{ fontWeight:800, fontSize:14, color:'#f59e0b', margin:0 }}>📊 Traçabilité des codes promo</p>
            <button onClick={()=>setShowStats(false)} style={{ background:'none', border:'none', cursor:'pointer', color:theme.muted, fontSize:18 }}>✕</button>
          </div>
          {(() => {
            const totalGenere = statsData.reduce((s,p) => s + parseFloat(p.total_discount_used||0) + parseFloat(p.value||0)*(p.max_uses - (p.uses_count||0) > 0 ? (p.max_uses - (p.uses_count||0)) : 0), 0);
            const totalUtilise = statsData.reduce((s,p) => s + parseFloat(p.total_discount_used||0), 0);
            const totalCA = statsData.reduce((s,p) => s + parseFloat(p.total_revenue_generated||0), 0);
            return (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
                {[
                  { l:'CA génére', v:`${Number(totalCA).toFixed(2)} €`, c:'#10b981' },
                  { l:'Remises utilisees', v:`${Number(totalUtilise).toFixed(2)} €`, c:'#ef4444' },
                  { l:'Codes actifs', v: statsData.filter(p=>p.is_active).length, c:'#111827' },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ borderRadius:12, padding:'10px 8px', textAlign:'center', background:isDark?`${c}22`:`${c}11`, border:`1px solid ${c}33` }}>
                    <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', color:c, margin:'0 0 4px' }}>{l}</p>
                    <p style={{ fontSize:14, fontWeight:900, color:c, margin:0 }}>{v}</p>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {statsData.map(p => (
              <div key={p.id} style={{ background:theme.card, borderRadius:14, padding:'12px 14px', border:`1px solid ${theme.border}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <span style={{ fontWeight:900, fontSize:14, color:theme.text, fontFamily:'var(--mono)' }}>{p.code}</span>
                    <span style={{ marginLeft:8, fontSize:11, padding:'2px 8px', borderRadius:99, background: p.is_active?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.1)', color:p.is_active?'#10b981':'#ef4444', fontWeight:700 }}>{p.is_active?'Actif':'Expire'}</span>
                    {p.is_loyalty_reward && <span style={{ marginLeft:4, fontSize:11, padding:'2px 8px', borderRadius:99, background:'rgba(245,158,11,0.12)', color:'#f59e0b', fontWeight:700 }}>🎫 Fidélité</span>}
                  </div>
                  <span style={{ fontWeight:700, fontSize:13, color:theme.muted }}>{p.type==='percent'?`${p.value}%`:`${Number(p.value).toFixed(2)} €`}</span>
                </div>
                <div style={{ display:'flex', gap:16, marginTop:8, fontSize:12 }}>
                  <span style={{ color:'#ef4444' }}>Utilisé : <strong>{Number(p.total_discount_used||0).toFixed(2)} €</strong></span>
                  <span style={{ color:'#10b981' }}>CA : <strong>{Number(p.total_revenue_generated||0).toFixed(2)} €</strong></span>
                  <span style={{ color:theme.muted }}>{p.usage_count||0} fois{p.max_uses?` / ${p.max_uses}`:''}</span>
                </div>
                {p.owner_client_email && <p style={{ fontSize:11, color:theme.dim, margin:'4px 0 0' }}>Propriétaire : {p.owner_client_email}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <div className="py-16 text-center"><I.Loader className="w-6 h-6 mx-auto animate-spin" style={{ color:theme.muted }} /></div>
      : promos.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', background:theme.card, borderRadius:20, border:`1px solid ${theme.border}` }}>
          <I.Percent style={{ width:40, height:40, margin:'0 auto 12px', color:theme.dim }} />
          <p style={{ color:theme.muted, fontSize:14, margin:0 }}>Aucun code promo</p>
        </div>
      ) : (
        <div style={{ background:theme.card, borderRadius:20, border:`1px solid ${theme.border}`, overflow:'hidden' }}>
          {promos.map((p,i) => (
            <div key={p.id} style={{ padding:'14px 16px', borderBottom: i<promos.length-1?`1px solid ${theme.separator}`:'none', opacity: p.is_active?1:0.5 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:16, color:theme.text, letterSpacing:'0.08em' }}>{p.code}</span>
                    <span style={{ padding:'3px 8px', borderRadius:6, background: p.type==='percent'?'rgba(17,24,39,0.12)':'rgba(16,185,129,0.12)', color: p.type==='percent'?'#111827':'#10b981', fontSize:12, fontWeight:700 }}>
                      {p.type==='percent' ? `-${p.value}%` : `-${Number(p.value).toFixed(2)} €`}
                    </span>
                    {!p.is_active && <span style={{ padding:'2px 6px', borderRadius:5, background:'rgba(239,68,68,0.1)', color:'#ef4444', fontSize:10, fontWeight:700 }}>INACTIF</span>}
                  </div>
                  <p style={{ fontSize:11, color:theme.muted, margin:0 }}>
                    {p.uses_count} utilisation(s){p.max_uses ? ` / ${p.max_uses} max` : ' · illimite'}
                    {p.valid_until ? ` · exp. ${fmt(p.valid_until)}` : ''}
                  </p>
                </div>
                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                  <button onClick={()=>setSendModal(p)}
                    title="Envoyer par email aux clients"
                    style={{ width:28, height:28, borderRadius:8, background:'rgba(6,182,212,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12}}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                  </button>
                  {!p.is_loyalty_reward && (
                    <button onClick={()=>toggleActive(p)} style={{ width:28, height:28, borderRadius:8, background: p.is_active?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:13 }}>{p.is_active?'✓':'○'}</span>
                    </button>
                  )}
                  {!p.is_loyalty_reward && (
                    <button onClick={()=>{ setEdit(p); setModal(true); }} style={{ width:28, height:28, borderRadius:8, background:isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.05)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <I.Edit style={{ width:12, height:12, color:theme.muted }} />
                    </button>
                  )}
                  {!p.is_loyalty_reward && (
                    <button onClick={()=>setDelId(p.id)} style={{ width:28, height:28, borderRadius:8, background:'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <I.Trash style={{ width:12, height:12, color:'#ef4444' }} />
                    </button>
                  )}
                  {p.is_loyalty_reward && (
                    <span style={{ fontSize:10, padding:'3px 9px', borderRadius:99, background:'rgba(245,158,11,0.12)', color:'#f59e0b', fontWeight:700, display:'flex', alignItems:'center' }}>🎫 Fidélité</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PromoForm open={modal} onClose={()=>{ setModal(false); setEdit(null); }} init={edit} onSave={handleSave} theme={theme} />

      {createdConfirm && (
        <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={()=>{ setCreatedConfirm(null); setModal(false); setEdit(null); }}
            style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(8px)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:380, borderRadius:24,
            background:isDark?'#161620':'#fff', border:`1px solid ${theme.border}`, padding:28,
            boxShadow:'0 24px 64px rgba(0,0,0,0.2)', textAlign:'center' }}>
            <div style={{ width:64, height:64, borderRadius:20, background:'rgba(34,197,94,0.1)',
              display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" style={{width:32,height:32}}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p style={{ fontSize:20, fontWeight:900, color:theme.text, margin:'0 0 8px' }}>
              Code créé !
            </p>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'8px 20px',
              borderRadius:12, background:isDark?'rgba(255,255,255,0.06)':'#f3f4f6',
              border:`1px solid ${theme.border}`, marginBottom:16 }}>
              <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:20, letterSpacing:'0.1em', color:theme.text }}>
                {createdConfirm.code}
              </span>
            </div>
            {createdConfirm.sentCount !== null && (
              <div style={{ padding:'12px 16px', borderRadius:12, marginBottom:20,
                background: createdConfirm.emailError
                  ? 'rgba(239,68,68,0.06)' : 'rgba(26,115,232,0.06)',
                border: `1px solid ${createdConfirm.emailError ? 'rgba(239,68,68,0.2)' : 'rgba(26,115,232,0.2)'}` }}>
                {createdConfirm.emailError ? (
                  <p style={{ fontSize:13, color:'#ef4444', margin:0 }}>
                    Erreur envoi email : {createdConfirm.emailError}
                  </p>
                ) : (
                  <p style={{ fontSize:13, color:'#1a73e8', fontWeight:600, margin:0 }}>
                    {createdConfirm.sentCount > 0
                      ? `${createdConfirm.sentCount} email${createdConfirm.sentCount > 1 ? 's' : ''} envoyé${createdConfirm.sentCount > 1 ? 's' : ''} à vos clients`
                      : 'Aucun client avec email enregistré'}
                  </p>
                )}
              </div>
            )}
            <button onClick={()=>{ setCreatedConfirm(null); setModal(false); setEdit(null); }}
              style={{ width:'100%', padding:'13px', borderRadius:12, background:'#1a73e8',
                color:'white', fontWeight:800, fontSize:14, border:'none', cursor:'pointer',
                boxShadow:'0 4px 14px rgba(26,115,232,0.35)' }}>
              Fermer
            </button>
          </div>
        </div>
      )}
      {sendModal && <SendPromoEmailModal promo={sendModal} theme={theme} onClose={()=>setSendModal(null)} showToast={showToast} />}
      <Confirm open={!!delId} onClose={()=>setDelId(null)} title="Supprimer ce code promo ?" desc="Cette action est irréversible." theme={theme}
        onConfirm={async()=>{ await promoApi.remove(delId); setPromos(p=>p.filter(x=>x.id!==delId)); setDelId(null); showToast('Code supprime'); }} />
    </div>
  );
}

function TabSMS({ showToast, theme }) {
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
