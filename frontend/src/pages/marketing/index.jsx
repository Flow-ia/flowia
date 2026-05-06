// Marketing — point d'entrée `/marketing/*`. Refonte 2026-05-06 : 2 axes
// métier (Récompenses / Campagnes), chacun avec 3 sous-onglets. Les URLs
// existantes sont préservées pour ne casser ni bookmarks ni deep-links push.
// Récompenses = mécaniques récurrentes côté client (gain automatique).
// Campagnes   = actions ponctuelles (promo créée, SMS envoyé, IA suggérée).
// Caps fidélité (100/100/500/100/3650/10000), parrainage (100/500/10000),
// quota Brevo 300/j et 3 modes Stripe restent gérés dans les composants
// source et leurs APIs (loyaltyApi, promoApi, referralsApi, birthdayApi,
// paymentsApi, campaignsApi).
import { useLocation, useNavigate } from 'react-router-dom';
import { Toast, useToast } from '../../components/UI';
import { useTheme } from '../../hooks/useTheme';
import { PageHeader, SubTabs } from '../reglages/shared';
import Loyalty from './fidelite/Loyalty';
import Birthday from './fidelite/Birthday';
import Referral from './fidelite/Referral';
import List from './promotions/List';
import Create from './promotions/Create';
import SendEmail from './promotions/SendEmail';
import Solde from './sms/Solde';
import Recharger from './sms/Recharger';
import Historique from './sms/Historique';
import Suggestions from './ia/Suggestions';
import History from './ia/History';

// Niveau 1 : 2 axes métier.
const TOP_TABS = [
  { id: 'recompenses', label: 'Récompenses', icon: 'gift'      },
  { id: 'campagnes',   label: 'Campagnes',   icon: 'megaphone' },
];

// Niveau 2 : 3 sous-onglets par axe. URLs inchangées (compat preservée).
const SUB_TABS = {
  recompenses: [
    { id: 'fidelite',  label: 'Fidélité',      path: '/marketing/fidelite/loyalty'  },
    { id: 'birthday',  label: 'Anniversaires', path: '/marketing/fidelite/birthday' },
    { id: 'referral',  label: 'Parrainage',    path: '/marketing/fidelite/referral' },
  ],
  campagnes: [
    { id: 'promotions', label: 'Promotions', path: '/marketing/promotions' },
    { id: 'sms',        label: 'SMS',        path: '/marketing/sms'        },
    { id: 'ia',         label: 'IA',         path: '/marketing/ia'         },
  ],
};

function parseRoute(pathname) {
  const parts = pathname.replace(/^\/marketing\/?/, '').split('/').filter(Boolean);
  return { section: parts[0] || '', sub: parts[1] || '' };
}

// Mappe l'URL courante vers (topId, subId).
function resolvePosition({ section, sub }) {
  if (section === 'fidelite') {
    const subId = sub === 'birthday' ? 'birthday' : sub === 'referral' ? 'referral' : 'fidelite';
    return { topId: 'recompenses', subId };
  }
  if (section === 'promotions') return { topId: 'campagnes', subId: 'promotions' };
  if (section === 'sms')        return { topId: 'campagnes', subId: 'sms'        };
  if (section === 'ia')         return { topId: 'campagnes', subId: 'ia'         };
  return { topId: 'recompenses', subId: 'fidelite' };
}

export default function Marketing(props) {
  const { theme } = useTheme();
  const [t, show] = useToast();
  const loc = useLocation();
  const navigate = useNavigate();
  const route = parseRoute(loc.pathname);
  const { topId, subId } = resolvePosition(route);

  const childProps = { ...props, theme, showToast: show };

  let content;
  if (route.section === 'fidelite') {
    if (route.sub === 'birthday')      content = <Birthday {...childProps}/>;
    else if (route.sub === 'referral') content = <Referral {...childProps}/>;
    else                               content = <Loyalty  {...childProps}/>;
  } else if (route.section === 'promotions') {
    if (route.sub === 'create')           content = <Create    {...childProps}/>;
    else if (route.sub === 'send-email')  content = <SendEmail {...childProps}/>;
    else                                  content = <List      {...childProps}/>;
  } else if (route.section === 'sms') {
    if (route.sub === 'recharger')        content = <Recharger {...childProps}/>;
    else if (route.sub === 'historique')  content = <Historique {...childProps}/>;
    else                                  content = <Solde     {...childProps}/>;
  } else if (route.section === 'ia') {
    if (route.sub === 'history')  content = <History     {...childProps}/>;
    else                          content = <Suggestions {...childProps} onGoToSolde={() => navigate('/marketing/sms')}/>;
  } else {
    // Racine /marketing → Récompenses > Fidélité par défaut.
    content = <Loyalty {...childProps}/>;
  }

  // Click sur un top-tab : on saute directement au 1er sub-tab de cet axe
  // (préserve l'URL exacte sinon l'utilisateur perdrait son fil).
  const handleTopChange = (id) => {
    const first = SUB_TABS[id]?.[0];
    if (first) navigate(first.path);
  };
  const handleSubChange = (id) => {
    const tab = SUB_TABS[topId]?.find(x => x.id === id);
    if (tab) navigate(tab.path);
  };

  return (
    <div style={{ minHeight:'100vh', background:theme.bg, paddingBottom:24 }}>
      <Toast msg={t?.msg} type={t?.type}/>
      <div style={{ maxWidth:960, margin:'0 auto', padding:'18px 16px',
                    display:'flex', flexDirection:'column', gap:14 }}>
        <PageHeader title="Marketing"
                    subtitle="Récompenses récurrentes et campagnes ponctuelles"/>
        {/* Niveau 1 : axe métier. */}
        <SubTabs tabs={TOP_TABS} active={topId} onChange={handleTopChange}/>
        {/* Niveau 2 : sous-onglets de l'axe actif. */}
        <SubTabs tabs={SUB_TABS[topId]} active={subId} onChange={handleSubChange}/>
        {content}
      </div>
    </div>
  );
}
