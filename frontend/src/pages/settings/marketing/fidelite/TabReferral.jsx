import { useState, useEffect } from 'react';
import { referralsApi } from '../../../../utils/api';

export default function TabReferral({ theme, showToast }) {
  const isDark = theme.mode === 'dark';
  const [cfg, setCfg] = useState({
    is_enabled:false,
    parrain_type:'percent', parrain_value:10,
    filleul_type:'percent', filleul_value:10,
    limit_count: null, limit_period: 'unlimited',
  });
  const [codes, setCodes]   = useState([]);
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    Promise.all([
      referralsApi.getProgram(),
      referralsApi.listCodes().catch(()=>[]),
      referralsApi.getStats().catch(()=>null),
    ]).then(([prog, cs, st]) => {
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
      setStats(st);
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
      setCfg(cfg);
      showToast(e.message || 'Erreur', 'err');
    }
  };

  const inp = { padding:'12px 14px', borderRadius:12, background: isDark?'rgba(255,255,255,0.06)':'#f1f5f9',
    border:`1px solid ${theme.border}`, color:theme.text, fontSize:14, width:'100%', outline:'none', boxSizing:'border-box' };

  if (loading) return <p className="text-sm" style={{ color:theme.muted }}>Chargement…</p>;

  return (
    <div className="space-y-4">
      {/* Stats agrégées — visible si au moins 1 parrainage initié */}
      {stats && (stats.uses_pending + stats.uses_validated + stats.uses_cancelled) > 0 && (
        <div className="rounded-2xl p-4" style={{ background:theme.card, border:`1px solid ${theme.border}` }}>
          <p className="text-xs font-bold uppercase mb-3" style={{ color:theme.muted, letterSpacing:'0.08em' }}>
            📊 Stats parrainage
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10, marginBottom:14 }}>
            {[
              ['Codes actifs',  stats.total_codes, '#8b5cf6'],
              ['En attente',    stats.uses_pending, '#f59e0b'],
              ['Validés',       stats.uses_validated, '#10b981'],
              ['Refusés',       stats.uses_cancelled, '#ef4444'],
            ].map(([lbl, val, col]) => (
              <div key={lbl} style={{ padding:'10px 12px', borderRadius:12,
                background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                border:`1px solid ${theme.border}` }}>
                <p style={{ fontSize:10, fontWeight:700, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.05em', margin:0 }}>{lbl}</p>
                <p style={{ fontSize:20, fontWeight:900, color: col, margin:'4px 0 0', fontFamily:'var(--mono)' }}>{val}</p>
              </div>
            ))}
          </div>
          <div style={{ padding:'10px 12px', borderRadius:12,
            background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', marginBottom:14 }}>
            <p style={{ fontSize:11, color:theme.muted, margin:0 }}>
              Total des remises filleul accordées :{' '}
              <strong style={{ color:'#4f46e5', fontFamily:'var(--mono)' }}>
                {stats.filleul_discount_total.toFixed(2)} €
              </strong>
            </p>
          </div>
          {stats.top_parrains && stats.top_parrains.length > 0 && (
            <>
              <p style={{ fontSize:10, fontWeight:700, color:theme.muted, textTransform:'uppercase', letterSpacing:'0.05em', margin:'0 0 8px' }}>
                Top parrains
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {stats.top_parrains.map((p, i) => {
                  const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email;
                  return (
                    <div key={p.email} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'8px 12px', borderRadius:10,
                      background: isDark ? 'rgba(255,255,255,0.03)' : '#fafafa',
                      border:`1px solid ${theme.border}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                        <span style={{ fontSize:12, fontWeight:900, color:theme.muted, width:18 }}>#{i+1}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:theme.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {name}
                        </span>
                      </div>
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:99,
                          background:'rgba(16,185,129,0.12)', color:'#10b981' }}>{p.validated} ✓</span>
                        {p.pending > 0 && (
                          <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:99,
                            background:'rgba(245,158,11,0.12)', color:'#f59e0b' }}>{p.pending} ⏳</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

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
