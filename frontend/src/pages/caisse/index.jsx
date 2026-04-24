// Caisse — refonte FDS-2026 commit 7. Point d'entrée `/caisse/*`.
// 3 sous-tabs : Encaisser / Historique / Crédit.
//
// Logique métier critique préservée (aucun refactor) :
// - Le flow 4 étapes d'encaissement vit dans EncaisserSheet (App.jsx inline)
//   qui gère idempotency_key UUID, multi-items, multi-paiements
//   transaction_payments (method='multi'), check live promo, crédit client
//   et signed_by_employee_id. `Encaisser.jsx` ne fait que l'ouvrir via le
//   callback onEncaisser (prop).
// - L'historique consommé est TabHistorique existant (stats jour + grille 4
//   paiements éclatés + liste + edit/delete gated back-side pinAdminMiddleware).
// - Le crédit utilise creditsApi (grant enforce can_grant_credit côté back,
//   repay passe via l'étape Encaisser qui crée transaction revenue source='credit').
import { useLocation, useNavigate } from 'react-router-dom';
import { Toast, useToast } from '../../components/UI';
import { useTheme } from '../../hooks/useTheme';
import { PageHeader, SubTabs } from '../reglages/shared';
import Encaisser from './Encaisser';
import Historique from './Historique';
import Credit from './Credit';

const TABS = [
  { id: 'encaisser',  label: 'Encaisser',  icon: 'zap'    },
  { id: 'historique', label: 'Historique', icon: 'chart'  },
  { id: 'credit',     label: 'Crédit',     icon: 'wallet' },
];

export default function Caisse(props) {
  const { theme } = useTheme();
  const [t, show] = useToast();
  const loc = useLocation();
  const navigate = useNavigate();

  const parts = loc.pathname.replace(/^\/caisse\/?/, '').split('/').filter(Boolean);
  const section = TABS.find(s => s.id === parts[0])?.id || 'encaisser';

  const setSection = (id) => navigate('/caisse/' + id);

  const childProps = { ...props, theme, showToast: show };

  return (
    <div style={{ minHeight:'100vh', background:theme.bg, paddingBottom:24 }}>
      <Toast msg={t?.msg} type={t?.type}/>
      <div style={{ maxWidth:960, margin:'0 auto', padding:'18px 16px',
                    display:'flex', flexDirection:'column', gap:14 }}>
        <PageHeader title="Caisse"
                    subtitle="Encaissement, historique du jour, crédits clients"/>
        <SubTabs tabs={TABS} active={section} onChange={setSection}/>

        {section === 'encaisser'  && <Encaisser  {...childProps}/>}
        {section === 'historique' && <Historique {...childProps}/>}
        {section === 'credit'     && <Credit     {...childProps}/>}
      </div>
    </div>
  );
}
