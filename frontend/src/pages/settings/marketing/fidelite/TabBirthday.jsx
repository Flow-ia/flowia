import { useState, useEffect } from 'react';
import { birthdayApi } from '../../../../utils/api';

export default function TabBirthday({ theme, showToast }) {
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
