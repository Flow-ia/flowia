import { useState, useEffect } from 'react';
import { birthdayApi } from '../../../../utils/api';
import { Button, Label, SegmentedControl } from '../../../../components/primitives';

export default function TabBirthday({ theme, showToast }) {
  const t = theme;
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
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await birthdayApi.update(cfg);
      showToast('Offre anniversaire enregistree');
    } catch (e) { showToast(e.message || 'Erreur', 'err'); }
    finally { setSaving(false); }
  };

  const toggleEnabled = async () => {
    const next = { ...cfg, is_enabled: !cfg.is_enabled };
    setCfg(next);
    try {
      await birthdayApi.update(next);
      showToast(next.is_enabled ? 'Offre anniversaire activee' : 'Offre anniversaire desactivee');
    } catch (e) {
      setCfg(cfg);
      showToast(e.message || 'Erreur', 'err');
    }
  };

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:14, fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  // Toggle sober
  const Tog = ({ on, onChange, colorOn }) => (
    <button onClick={onChange}
            style={{ width:40, height:22, borderRadius:99, border:'none', cursor:'pointer',
                     position:'relative', flexShrink:0,
                     background: on ? (colorOn || t.text) : t.cardAlt,
                     transition:'background 0.2s', fontFamily:'inherit' }}>
      <div style={{ width:18, height:18, borderRadius:'50%', background:'white',
                    position:'absolute', top:2, left: on ? 20 : 2,
                    transition:'left 0.15s', boxShadow:t.shadowSm }}/>
    </button>
  );

  if (loading) return <p style={{ fontSize:13, color:t.muted, margin:0 }}>Chargement…</p>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ padding:16, borderRadius:12,
                    background:t.card, border:`0.5px solid ${t.border}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div>
            <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>Offre anniversaire activee</p>
            <p style={{ fontSize:11, color:t.muted, margin:'2px 0 0' }}>
              Les clients avec date de naissance recoivent une reduction le jour J.
            </p>
          </div>
          <Tog on={cfg.is_enabled} onChange={toggleEnabled} colorOn="#3c3489"/>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <div>
            <Label>Type</Label>
            <select value={cfg.discount_type}
                    onChange={e => setCfg(c => ({ ...c, discount_type:e.target.value }))}
                    style={{ ...inp, cursor:'pointer' }}>
              <option value="percent">Pourcentage (%)</option>
              <option value="fixed">Montant fixe (€)</option>
            </select>
          </div>
          <div>
            <Label>Valeur {cfg.discount_type === 'percent' ? '(%)' : '(€)'}</Label>
            <input type="number" min="0" step="0.01" value={cfg.discount_value}
                   onChange={e => setCfg(c => ({ ...c, discount_value:e.target.value }))} style={inp}/>
          </div>
        </div>
        <div style={{ marginBottom:10 }}>
          <Label>Validite (jours)</Label>
          <input type="number" min="1" max="365" value={cfg.validity_days}
                 onChange={e => setCfg(c => ({ ...c, validity_days:e.target.value }))} style={inp}/>
        </div>
        <div style={{ marginBottom:14 }}>
          <Label>Message (optionnel)</Label>
          <textarea rows={2} value={cfg.message}
                    onChange={e => setCfg(c => ({ ...c, message:e.target.value }))}
                    placeholder="Joyeux anniversaire ! Profitez de -20% sur votre prochain RDV."
                    style={{ ...inp, resize:'none' }}/>
        </div>

        <Button variant="primary" fullWidth type="button" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      <div style={{ padding:'10px 14px', borderRadius:8, background:'#eef2ff' }}>
        <p style={{ fontSize:12, color:'#4338ca', lineHeight:1.5, margin:0 }}>
          La date de naissance est renseignee par les clients lors de leur inscription (optionnel).
        </p>
      </div>
    </div>
  );
}
