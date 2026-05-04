// Réglages — refonte FDS-2026 commit 4. Point d'entrée `/reglages/*`.
// Dispatche vers les 4 sous-domaines. Chaque sous-domaine réutilise les
// composants Tab* existants (pages/settings/) pour préserver la logique
// métier à l'identique (zéro refactor profond, cf. règle #1 INVENTAIRE).
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

const DOMAINS = [
  {
    id: 'mon-commerce',
    label: 'Mon commerce',
    subtitle: 'Informations, photos, compte, sécurité',
    color: '#f97316',
    icon: 'storefront',
    items: ['Informations salon', 'Logo, photos, couverture', 'Mon compte + RGPD', 'Sécurité (PIN, tablette, mode veille)'],
  },
  {
    id: 'reservations',
    label: 'Réservations',
    subtitle: 'Config booking, prestations, notifications',
    color: '#3b82f6',
    icon: 'calendar',
    items: ['Configuration (Lien, délais)', 'Prestations sur site (image 5Mo)', 'Notifications SMS/Email'],
  },
  {
    id: 'equipe',
    label: 'Équipe',
    subtitle: 'Membres, horaires, absences, commissions',
    color: '#10b981',
    icon: 'users',
    items: ['Membres (permissions)', 'Horaires par employé', 'Commissions', 'Absences (8 types)'],
  },
  {
    id: 'caisse-config',
    label: 'Caisse · Config',
    subtitle: 'Prestations sur place, QR code inscription',
    color: '#8b5cf6',
    icon: 'cash',
    items: ['Prestations sur place (catégories hiérarchiques)', 'QR code /j/:slug'],
  },
  {
    id: 'paiements',
    label: 'Paiements en ligne',
    subtitle: 'Connectez votre Stripe · paiements RDV',
    color: '#0891b2',
    icon: 'wallet',
    items: ['Connexion Stripe (Direct charges)', 'Réception des paiements RDV', 'Configuration acompte (à venir)'],
  },
];

function Home({ onLock }) {
  const { theme: t } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'18px 16px' }}>
      {/* Topbar */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between',
                    marginBottom:18, gap:12, flexWrap:'wrap' }}>
        <div>
          <p style={{ margin:0, fontSize:11, color:t.muted, textTransform:'uppercase',
                      letterSpacing:'0.05em' }}>Réglages</p>
          <h1 style={{ margin:'2px 0 4px', fontSize:22, fontWeight:500, color:t.text,
                       letterSpacing:'-0.01em' }}>{"Paramètres"}</h1>
          <p style={{ margin:0, fontSize:12, color:t.muted }}>
            {user?.businessName || ''} · <span style={{ color:'#16a34a', fontWeight:500 }}>{"PIN admin actif"}</span>
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <ThemeToggle/>
          {onLock && (
            <button onClick={onLock}
                    style={{ display:'inline-flex', alignItems:'center', gap:6,
                             padding:'8px 12px', borderRadius:8,
                             border:`0.5px solid ${t.border}`, background:t.cardAlt,
                             color:t.text, cursor:'pointer', fontSize:12,
                             fontWeight:500, fontFamily:'inherit' }}>
              <Icon name="lock" size={13} color={t.text}/> Verrouiller
            </button>
          )}
        </div>
      </div>

      {/* 4 cartes */}
      <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))',
                    gap:14 }}>
        {DOMAINS.map(d => (
          <button key={d.id} onClick={() => navigate('/reglages/' + d.id)}
                  style={{ textAlign:'left', padding:20, borderRadius:12,
                           border:`0.5px solid ${t.border}`,
                           borderLeft:`2px solid ${d.color}`,
                           background:t.card, cursor:'pointer',
                           transition:'transform 0.15s, box-shadow 0.15s',
                           fontFamily:'inherit' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}>
            <div style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:12 }}>
              <div style={{ width:42, height:42, borderRadius:10, flexShrink:0,
                            background: d.color + '14', color: d.color,
                            display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name={d.icon} size={20} color={d.color}/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:15, fontWeight:500, color:t.text }}>{d.label}</p>
                <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>{d.subtitle}</p>
              </div>
              <Icon name="chevronRight" size={16} color={t.muted}/>
            </div>
            <div style={{ display:'grid',
                          gridTemplateColumns:'repeat(2, minmax(0,1fr))',
                          gap:6 }}>
              {d.items.map((it, i) => (
                <div key={i}
                     style={{ padding:'6px 8px', borderRadius:6,
                              background: t.cardAlt,
                              color: t.muted, fontSize:11 }}>
                  · {it}
                </div>
              ))}
            </div>
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
  else if (domain === 'paiements')     content = <Paiements    {...childProps}/>;
  else                                 content = <Home onLock={props.onLock}/>;

  return (
    <div style={{ minHeight:'100vh', background:theme.bg, paddingBottom:24 }}>
      <Toast msg={t?.msg} type={t?.type}/>
      {content}
    </div>
  );
}
