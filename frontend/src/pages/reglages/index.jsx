// Réglages — refonte FDS-2026. Point d'entrée `/reglages/*`.
// 6 sous-domaines, chacun monte les composants Tab* existants de pages/settings/
// via des wrappers minces (zéro refactor profond, cf. règle #1 INVENTAIRE).
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { Toast, useToast } from '../../components/UI';
import { ThemeToggle } from '../../components/ThemeToggle';
import MonCommerce from './mon-commerce';
import Reservations from './reservations';
import Equipe from './equipe';
import CaisseConfig from './caisse-config';
import Paiements from './paiements';
import Communication from './communication';

// Une seule source de vérité par carte : subtitle court (3-5 mots-clés).
// Les détails complets vivent dans la sous-page elle-même (PageHeader subtitle).
const DOMAINS = [
  { id:'mon-commerce',  label:'Mon commerce',        subtitle:'Identité, photos, données, sécurité',  color:'#f97316', icon:'storefront' },
  { id:'reservations',  label:'Réservation en ligne', subtitle:'Lien public, prestations, agenda',  color:'#3b82f6', icon:'calendar'   },
  { id:'caisse-config', label:'Caisse',              subtitle:'Prestations en boutique, QR',       color:'#8b5cf6', icon:'cash'       },
  { id:'equipe',        label:'Équipe / Employés',   subtitle:'Membres, horaires, commissions',    color:'#10b981', icon:'users'      },
  { id:'communication', label:'Communication',       subtitle:'Rappels, recap, sons, push',        color:'#ec4899', icon:'bell'       },
  { id:'paiements',     label:'Paiements en ligne',  subtitle:'Stripe, acomptes RDV',              color:'#0891b2', icon:'wallet'     },
];

function Home({ onLock }) {
  const { theme: t } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth:980, margin:'0 auto', padding:'24px 16px' }}>
      {/* Header — titre + actions discrètes (thème, verrouillage). */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    marginBottom:24, gap:12, flexWrap:'wrap' }}>
        <div style={{ minWidth:0 }}>
          <h1 style={{ margin:0, fontSize:24, fontWeight:500, color:t.text,
                       letterSpacing:'-0.015em' }}>{"Réglages"}</h1>
          <p style={{ margin:'4px 0 0', fontSize:13, color:t.muted }}>
            {user?.businessName || 'Configurez votre salon'}
          </p>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <ThemeToggle/>
          {onLock && (
            <button onClick={onLock}
                    title="Verrouiller la session admin"
                    style={{ display:'inline-flex', alignItems:'center', gap:6,
                             padding:'8px 12px', borderRadius:8,
                             border:`0.5px solid ${t.border}`, background:t.cardAlt,
                             color:t.text, cursor:'pointer', fontSize:12,
                             fontWeight:500, fontFamily:'inherit',
                             transition:'background 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = t.card; }}
                    onMouseLeave={e => { e.currentTarget.style.background = t.cardAlt; }}>
              <Icon name="lock" size={13} color={t.text}/> Verrouiller
            </button>
          )}
        </div>
      </div>

      {/* 6 cartes domaine — grid responsive auto-fit, hauteur uniforme. */}
      <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))',
                    gap:12 }}>
        {DOMAINS.map(d => (
          <button key={d.id} onClick={() => navigate('/reglages/' + d.id)}
                  style={{ textAlign:'left', padding:'16px 18px', borderRadius:12,
                           border:`0.5px solid ${t.border}`,
                           borderLeft:`2px solid ${d.color}`,
                           background:t.card, cursor:'pointer',
                           transition:'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                           fontFamily:'inherit',
                           display:'flex', alignItems:'center', gap:14 }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px -4px rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'none';
                  }}>
            <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
                          background: d.color + '14',
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Icon name={d.icon} size={18} color={d.color}/>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {d.label}
              </p>
              <p style={{ margin:'3px 0 0', fontSize:11, color:t.muted,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {d.subtitle}
              </p>
            </div>
            <Icon name="chevronRight" size={15} color={t.muted}/>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Reglages(props) {
  const loc = useLocation();
  const { theme } = useTheme();
  const [t, show] = useToast();

  const parts = loc.pathname.replace(/^\/reglages\/?/, '').split('/').filter(Boolean);
  const domain = parts[0] || '';

  const childProps = { ...props, showToast: show, theme };

  let content;
  if      (domain === 'mon-commerce')  content = <MonCommerce  {...childProps}/>;
  else if (domain === 'reservations')  content = <Reservations {...childProps}/>;
  else if (domain === 'equipe')        content = <Equipe       {...childProps}/>;
  else if (domain === 'caisse-config') content = <CaisseConfig {...childProps}/>;
  else if (domain === 'communication') content = <Communication {...childProps}/>;
  else if (domain === 'paiements')     content = <Paiements    {...childProps}/>;
  else                                 content = <Home onLock={props.onLock}/>;

  return (
    <div style={{ minHeight:'100vh', background:theme.bg, paddingBottom:24 }}>
      <Toast msg={t?.msg} type={t?.type}/>
      {content}
    </div>
  );
}
