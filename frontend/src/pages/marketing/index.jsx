// Marketing — refonte FDS-2026 commit 5. Point d'entrée `/marketing/*`.
// 6 sous-tabs de premier niveau (Fidélité / Anniv / Parrainage / Promos /
// SMS / IA). Chaque tab monte un wrapper mince qui rend le Tab* existant
// dans pages/settings/marketing/ — zéro refactor de la logique métier.
// Caps fidélité (100/100/500/100/3650/10000), parrainage (100/500/10000),
// quota Brevo 300/j et 3 modes Stripe restent gérés dans les composants
// source et leurs APIs (loyaltyApi, promoApi, referralsApi, birthdayApi,
// paymentsApi, campaignsApi).
import { useLocation, useNavigate } from 'react-router-dom';
import { Toast, useToast } from '../../components/UI';
import { useTheme } from '../../hooks/useTheme';
import OptInBanner from '../settings/marketing/OptInBanner';
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

// Top-nav 6 items : chaque item mappe un (section, sub) pour l'URL.
const TOP_TABS = [
  { id: 'fidelite',   label: 'Fidélité',   path: '/marketing/fidelite/loyalty',   match: { section:'fidelite', sub:'loyalty'   } },
  { id: 'birthday',   label: 'Anniv.',     path: '/marketing/fidelite/birthday',  match: { section:'fidelite', sub:'birthday'  } },
  { id: 'referral',   label: 'Parrainage', path: '/marketing/fidelite/referral',  match: { section:'fidelite', sub:'referral'  } },
  { id: 'promotions', label: 'Promos',     path: '/marketing/promotions',         match: { section:'promotions' } },
  { id: 'sms',        label: 'SMS',        path: '/marketing/sms',                match: { section:'sms'        } },
  { id: 'ia',         label: 'IA',         path: '/marketing/ia',                 match: { section:'ia'         } },
];

function parseRoute(pathname) {
  const parts = pathname.replace(/^\/marketing\/?/, '').split('/').filter(Boolean);
  return { section: parts[0] || '', sub: parts[1] || '' };
}

function resolveTopId({ section, sub }) {
  if (section === 'fidelite') {
    if (sub === 'birthday') return 'birthday';
    if (sub === 'referral') return 'referral';
    return 'fidelite';
  }
  if (section === 'promotions') return 'promotions';
  if (section === 'sms')        return 'sms';
  if (section === 'ia')         return 'ia';
  return 'fidelite'; // racine /marketing → Fidélité par défaut
}

export default function Marketing(props) {
  const { theme } = useTheme();
  const [t, show] = useToast();
  const loc = useLocation();
  const navigate = useNavigate();
  const route = parseRoute(loc.pathname);
  const topId = resolveTopId(route);

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
    // Racine /marketing → Loyalty par défaut.
    content = <Loyalty {...childProps}/>;
  }

  return (
    <div style={{ minHeight:'100vh', background:theme.bg, paddingBottom:24 }}>
      <Toast msg={t?.msg} type={t?.type}/>
      <div style={{ maxWidth:960, margin:'0 auto', padding:'18px 16px',
                    display:'flex', flexDirection:'column', gap:14 }}>
        <PageHeader title="Marketing"
                    subtitle="Fidélité, promotions, SMS, campagnes IA"/>
        <OptInBanner theme={theme} showToast={show}/>
        <SubTabs tabs={TOP_TABS} active={topId}
                 onChange={id => {
                   const tab = TOP_TABS.find(x => x.id === id);
                   if (tab) navigate(tab.path);
                 }}/>
        {content}
      </div>
    </div>
  );
}
