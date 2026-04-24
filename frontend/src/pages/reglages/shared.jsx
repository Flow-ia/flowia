// shared.jsx — Primitives visuelles partagées par les 4 sous-pages Réglages.
// Garde le composant SubTabs unique pour que l'éclatement des tabs ne
// dédouble pas la logique de sous-navigation.
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../hooks/useTheme';

// Barre de sous-onglets FDS-2026 : fond cardAlt, capsule active sur t.card.
// `tabs` : [{ id, label, icon? }]. `active` : id courant. `onChange` : (id) => void.
export function SubTabs({ tabs, active, onChange }) {
  const { theme: t } = useTheme();
  return (
    <div style={{ display:'flex', gap:4, padding:3, borderRadius:8,
                  background:t.cardAlt, overflowX:'auto' }}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)}
                  style={{ flex:1, minWidth:'fit-content',
                           display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                           padding:'8px 12px', borderRadius:6, border:'none', cursor:'pointer',
                           transition:'all 0.15s',
                           background: isActive ? t.card : 'transparent',
                           color: isActive ? t.text : t.muted,
                           fontWeight: isActive ? 500 : 400,
                           fontSize:13, whiteSpace:'nowrap',
                           fontFamily:'inherit' }}>
            {tab.icon && <Icon name={tab.icon} size={14} color={isActive ? t.text : t.muted}/>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// Breadcrumb + titre d'une sous-page Réglages. Retour via chevron gauche.
export function PageHeader({ backTo, crumb, title, subtitle }) {
  const { theme: t } = useTheme();
  const navigate = useNavigate();
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:10 }}>
      {backTo && (
        <button onClick={() => navigate(backTo)}
                style={{ display:'inline-flex', alignItems:'center', gap:4,
                         padding:0, border:'none', background:'transparent',
                         color:t.muted, cursor:'pointer', fontSize:11,
                         fontFamily:'inherit', width:'fit-content' }}>
          <Icon name="chevronLeft" size={12} color={t.muted}/>
          {crumb || 'Retour'}
        </button>
      )}
      <h1 style={{ margin:0, fontSize:20, fontWeight:500, color:t.text, letterSpacing:'-0.01em' }}>
        {title}
      </h1>
      {subtitle && (
        <p style={{ margin:0, fontSize:12, color:t.muted }}>{subtitle}</p>
      )}
    </div>
  );
}
