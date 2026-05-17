// Marketing — point d'entrée `/marketing/*`. Refonte visuelle 2026 calquée
// sur docs/maquette-marketing.html : topbar titre + 4 onglets primaires
// (Récompenses / Campagnes / IA / SMS) + sous-onglets segmentés pour
// Récompenses. Accent violet LOCAL à cette page (pas le thème global).
// Les URLs existantes sont préservées (aucun bookmark / deep-link push
// cassé) : seul le chrome change, le routing et les sous-pages sont intacts.
// Caps fidélité (100/100/500/100/3650/10000), parrainage (100/500/10000),
// quota Brevo 300/j et 3 modes Stripe restent gérés dans les composants
// source et leurs APIs (loyaltyApi, promoApi, referralsApi, birthdayApi,
// paymentsApi, campaignsApi).
import { useLocation, useNavigate } from 'react-router-dom';
import { Toast, useToast } from '../../components/UI';
import { useTheme } from '../../hooks/useTheme';
import { I } from '../../utils/icons';
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

// Accent violet local (maquette). FDS-2026 : pas d'emoji, fw<=500,
// bordures 0.5px, pas de gradient.
const VIOD  = '#534AB7';

// Niveau 1 : 4 axes (maquette). Chaque axe pointe vers une URL existante.
const TOP_TABS = [
  { id: 'recompenses', label: 'Récompenses', Icon: I.Gift,     path: '/marketing/fidelite/loyalty' },
  { id: 'campagnes',   label: 'Campagnes',   Icon: I.Send,     path: '/marketing/promotions'       },
  { id: 'ia',          label: 'IA',          Icon: I.Sparkles, path: '/marketing/ia'               },
  { id: 'sms',         label: 'SMS',         Icon: I.Mail,     path: '/marketing/sms'              },
];

// Niveau 2 : sous-onglets segmentés (uniquement Récompenses). URLs inchangées.
const SUB_TABS = {
  recompenses: [
    { id: 'fidelite', label: 'Fidélité',      path: '/marketing/fidelite/loyalty'  },
    { id: 'birthday', label: 'Anniversaires', path: '/marketing/fidelite/birthday' },
    { id: 'referral', label: 'Parrainage',    path: '/marketing/fidelite/referral' },
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
  if (section === 'promotions') return { topId: 'campagnes', subId: null };
  if (section === 'sms')        return { topId: 'sms',        subId: null };
  if (section === 'ia')         return { topId: 'ia',         subId: null };
  return { topId: 'recompenses', subId: 'fidelite' };
}

export default function Marketing(props) {
  const { theme: t } = useTheme();
  const [toast, show] = useToast();
  const loc = useLocation();
  const navigate = useNavigate();
  const route = parseRoute(loc.pathname);
  const { topId, subId } = resolvePosition(route);

  const childProps = { ...props, theme: t, showToast: show };

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
    if (route.sub === 'recharger')        content = <Recharger  {...childProps}/>;
    else if (route.sub === 'historique')  content = <Historique {...childProps}/>;
    else                                  content = <Solde      {...childProps}/>;
  } else if (route.section === 'ia') {
    if (route.sub === 'history')  content = <History     {...childProps}/>;
    else                          content = <Suggestions {...childProps} onGoToSolde={() => navigate('/marketing/sms')}/>;
  } else {
    // Racine /marketing → Récompenses > Fidélité par défaut.
    content = <Loyalty {...childProps}/>;
  }

  const subTabs = SUB_TABS[topId] || null;
  const goSub = (id) => {
    const tab = subTabs?.find(x => x.id === id);
    if (tab) navigate(tab.path);
  };

  return (
    <div style={{ minHeight:'100vh', background: t.bg, paddingBottom: 24 }}>
      <Toast msg={toast?.msg} type={toast?.type}/>

      {/* ── Topbar (maquette) ── */}
      <div style={{ background: t.card, borderBottom: "0.5px solid " + t.border,
                    padding:'14px 16px' }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 500, color: t.text,
                    letterSpacing:'-0.01em' }}>{"Marketing"}</p>
        <p style={{ margin:'2px 0 0', fontSize: 12, color: t.muted }}>
          {"Fidélité, campagnes, IA et SMS"}
        </p>
      </div>

      {/* ── Onglets primaires : scroll horizontal sur mobile ── */}
      <div style={{ display:'flex', background: t.card,
                    borderBottom: "0.5px solid " + t.border,
                    padding:'0 8px', overflowX:'auto',
                    WebkitOverflowScrolling:'touch' }}>
        {TOP_TABS.map(tab => {
          const on = topId === tab.id;
          return (
            <button key={tab.id} onClick={() => navigate(tab.path)}
                    style={{ display:'flex', alignItems:'center', gap: 6,
                             padding:'11px 16px', border:'none',
                             borderBottom:'2px solid ' + (on ? VIOD : 'transparent'),
                             background:'transparent', cursor:'pointer',
                             fontFamily:'inherit', fontSize: 13, fontWeight: 500,
                             color: on ? VIOD : t.muted, whiteSpace:'nowrap',
                             flexShrink: 0 }}>
              <tab.Icon style={{ width: 15, height: 15 }}/>
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ maxWidth: 960, margin:'0 auto', padding:'14px 16px',
                    display:'flex', flexDirection:'column', gap: 12 }}>

        {/* ── Sous-onglets segmentés (Récompenses uniquement) ── */}
        {subTabs && (
          <div style={{ display:'flex', gap: 3, padding: 3, borderRadius: 10,
                        background: t.card, border: "0.5px solid " + t.border }}>
            {subTabs.map(tab => {
              const on = subId === tab.id;
              return (
                <button key={tab.id} onClick={() => goSub(tab.id)}
                        style={{ flex: 1, padding:'7px 10px', border:'none',
                                 borderRadius: 7, cursor:'pointer',
                                 fontFamily:'inherit', fontSize: 12, fontWeight: 500,
                                 textAlign:'center', whiteSpace:'nowrap',
                                 background: on ? t.cardAlt : 'transparent',
                                 color: on ? t.text : t.muted }}>
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {content}
      </div>
    </div>
  );
}
