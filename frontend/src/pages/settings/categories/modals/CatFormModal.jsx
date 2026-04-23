import { useState, useEffect } from 'react';
import { I, ICON_MAP } from '../../../../utils/icons';
import { MODAL_COLORS, CAT_ICONS_LIST } from '../constants';
import { Button, Label } from '../../../../components/primitives';

// Modal Categorie booking — creer/editer une categorie de services
export default function CatFormModal({ open, onClose, onSubmit, init, theme }) {
  const t = theme;
  const [name,  setName]  = useState('');
  const [color, setColor] = useState('#111827');
  const [icon,  setIcon]  = useState('Scissors');
  const [err,   setErr]   = useState('');

  // Sync state avec init à chaque réouverture — sinon la modale réutilisée
  // pour éditer garde les valeurs du 1er mount.
  useEffect(() => {
    if (open) {
      setName(init?.name   || '');
      setColor(init?.color || '#111827');
      setIcon(init?.icon   || 'Scissors');
      setErr('');
    }
  }, [open, init?.id]);

  if (!open) return null;

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:14, fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  const submit = () => {
    if (!name.trim()) { setErr('Le nom est requis.'); return; }
    onSubmit({ name:name.trim(), color, icon });
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:60,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:16,
                  background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:'100%', maxWidth:360, borderRadius:16, overflow:'hidden',
                    background:t.elevated, border:`0.5px solid ${t.border}`,
                    boxShadow:t.shadowModal }}>
        <div style={{ padding:'14px 18px', borderBottom:`0.5px solid ${t.separator}`,
                      display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <p style={{ fontWeight:500, fontSize:15, color:t.text, margin:0 }}>
            {init ? 'Modifier la categorie' : 'Nouvelle categorie'}
          </p>
          <button onClick={onClose}
                  style={{ width:28, height:28, borderRadius:8, border:'none', cursor:'pointer',
                           background:t.cardAlt, color:t.muted, fontSize:15,
                           display:'flex', alignItems:'center', justifyContent:'center',
                           fontFamily:'inherit' }}>
            ×
          </button>
        </div>
        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
          {err && <p style={{ color:'#991b1b', fontSize:12, margin:0 }}>{err}</p>}
          <div>
            <Label>Nom *</Label>
            <input value={name} onChange={e => setName(e.target.value)}
                   placeholder="Ex : Colorations, Soins…" style={inp}/>
          </div>
          <div>
            <Label>Icone</Label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {CAT_ICONS_LIST.map(ic => {
                const Ic = ICON_MAP[ic] || I.Tag;
                const active = icon === ic;
                return (
                  <button key={ic} onClick={() => setIcon(ic)}
                          style={{ width:34, height:34, borderRadius:8, cursor:'pointer',
                                   border:`0.5px solid ${active ? color : t.border}`,
                                   background: active ? color : t.cardAlt,
                                   display:'flex', alignItems:'center', justifyContent:'center',
                                   fontFamily:'inherit' }}>
                    <Ic style={{ width:15, height:15, color: active ? 'white' : t.muted }}/>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Couleur</Label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {MODAL_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                        style={{ width:28, height:28, borderRadius:8, background:c, cursor:'pointer',
                                 border: color === c ? `0.5px solid ${t.text}` : `0.5px solid ${t.border}`,
                                 transform: color === c ? 'scale(1.1)' : 'scale(1)',
                                 transition:'transform 0.15s ease',
                                 fontFamily:'inherit' }}/>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding:'14px 18px', borderTop:`0.5px solid ${t.separator}`,
                      display:'flex', gap:10 }}>
          <Button variant="secondary" type="button" onClick={onClose} style={{ flex:1 }}>
            Annuler
          </Button>
          <Button variant="primary" type="button" onClick={submit} style={{ flex:2 }}>
            {init ? 'Enregistrer' : 'Creer la categorie'}
          </Button>
        </div>
      </div>
    </div>
  );
}
