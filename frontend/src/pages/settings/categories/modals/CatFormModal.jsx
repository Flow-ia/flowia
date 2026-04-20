import { useState } from 'react';
import { I, ICON_MAP } from '../../../../utils/icons';
import { MODAL_COLORS, CAT_ICONS_LIST } from '../constants';

// Modal Categorie booking — creer/editer une categorie de services
export default function CatFormModal({ open, onClose, onSubmit, init, theme }) {
  const isDark = theme.mode === 'dark';
  const [name,  setName]  = useState(init?.name  || '');
  const [color, setColor] = useState(init?.color || '#111827');
  const [icon,  setIcon]  = useState(init?.icon  || 'Scissors');
  const [err,   setErr]   = useState('');
  if (!open) return null;

  const inp = { width:'100%',padding:'10px 12px',borderRadius:10,outline:'none',
    background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.05)',
    border:`1.5px solid ${isDark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.12)'}`,
    color:theme.text,fontSize:14,fontFamily:'inherit',boxSizing:'border-box' };

  const submit = () => {
    if (!name.trim()) { setErr('Le nom est requis.'); return; }
    onSubmit({ name:name.trim(), color, icon });
  };

  return (
    <div style={{ position:'fixed',inset:0,zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:16,
      background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)' }}
      onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ width:'100%',maxWidth:360,borderRadius:20,overflow:'hidden',
        background:theme.card,border:`1px solid ${theme.border}` }}>
        <div style={{ padding:'16px 20px',borderBottom:`1px solid ${theme.border}`,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <p style={{ fontWeight:800,fontSize:15,color:theme.text,margin:0 }}>{init?'Modifier la categorie':'Nouvelle categorie'}</p>
          <button onClick={onClose} style={{ width:30,height:30,borderRadius:8,border:'none',cursor:'pointer',
            background:isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.07)',color:theme.muted,fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:20,display:'flex',flexDirection:'column',gap:14 }}>
          {err && <p style={{ color:'#f87171',fontSize:12,margin:0 }}>{err}</p>}
          <div>
            <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:5 }}>Nom *</p>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex : Colorations, Soins…" style={inp} />
          </div>
          <div>
            <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:8 }}>Icône</p>
            <div style={{ display:'flex',gap:7,flexWrap:'wrap' }}>
              {CAT_ICONS_LIST.map(ic => {
                const Ic = ICON_MAP[ic] || I.Tag;
                const active = icon === ic;
                return (
                  <button key={ic} onClick={() => setIcon(ic)}
                    style={{ width:36,height:36,borderRadius:10,border:`2px solid ${active?color:'transparent'}`,cursor:'pointer',
                      background:active?color:(isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'),
                      display:'flex',alignItems:'center',justifyContent:'center' }}>
                    <Ic style={{ width:16,height:16,color:active?'white':theme.muted }}/>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p style={{ fontSize:11,fontWeight:700,color:theme.muted,marginBottom:8 }}>Couleur</p>
            <div style={{ display:'flex',gap:7,flexWrap:'wrap' }}>
              {MODAL_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  style={{ width:28,height:28,borderRadius:8,border:`2px solid ${color===c?'white':'transparent'}`,
                    background:c,cursor:'pointer',boxShadow:color===c?`0 0 0 2px ${c}`:'none' }}/>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding:'14px 20px',borderTop:`1px solid ${theme.border}`,display:'flex',gap:10 }}>
          <button onClick={onClose}
            style={{ flex:1,padding:'11px 0',borderRadius:12,border:`1px solid ${theme.border}`,
              background:'transparent',color:theme.muted,fontWeight:700,fontSize:13,cursor:'pointer' }}>
            Annuler
          </button>
          <button onClick={submit}
            style={{ flex:2,padding:'11px 0',borderRadius:12,border:'none',cursor:'pointer',
              background:`linear-gradient(135deg,${color},${color}bb)`,color:'white',fontWeight:800,fontSize:13 }}>
            {init?'Enregistrer':'Créer la categorie'}
          </button>
        </div>
      </div>
    </div>
  );
}
