// Statistiques — refonte FDS-2026 commit 6. Point d'entrée `/statistiques/*`.
// 5 sous-tabs : Performance / Prévisions / Heatmap / Produits / Export.
// Les Tab* existants (TabStats, TabPrevisions, TabHeures, TabExport) sont
// rendus à l'identique par des wrappers minces, seul Performance ajoute le
// bloc « moyens de paiement » pastel qui consomme le nouveau endpoint
// GET /api/stats/by-payment-method.
import { useLocation, useNavigate } from 'react-router-dom';
import { Toast, useToast } from '../../components/UI';
import { useTheme } from '../../hooks/useTheme';
import { PageHeader, SubTabs } from '../reglages/shared';
import Performance from './Performance';
import Forecast from './Forecast';
import Heatmap from './Heatmap';
import Products from './Products';
import Export from './Export';

const TABS = [
  { id: 'performance', label: 'Performance', icon: 'chart'    },
  { id: 'forecast',    label: 'Prévisions',  icon: 'zap'      },
  { id: 'heatmap',     label: 'Heatmap',     icon: 'clock'    },
  { id: 'products',    label: 'Produits',    icon: 'tag'      },
  { id: 'export',      label: 'Export',      icon: 'settings' },
];

export default function Statistiques(props) {
  const { theme } = useTheme();
  const [t, show] = useToast();
  const loc = useLocation();
  const navigate = useNavigate();

  const parts = loc.pathname.replace(/^\/statistiques\/?/, '').split('/').filter(Boolean);
  const section = TABS.find(s => s.id === parts[0])?.id || 'performance';

  const setSection = (id) => navigate('/statistiques/' + id);

  const childProps = { ...props, theme, showToast: show };

  return (
    <div style={{ minHeight:'100vh', background:theme.bg, paddingBottom:24 }}>
      <Toast msg={t?.msg} type={t?.type}/>
      <div style={{ maxWidth:960, margin:'0 auto', padding:'18px 16px',
                    display:'flex', flexDirection:'column', gap:14 }}>
        <PageHeader title="Statistiques"
                    subtitle="Performance, prévisions, heatmap, produits, export"/>
        <SubTabs tabs={TABS} active={section} onChange={setSection}/>

        {section === 'performance' && <Performance {...childProps}/>}
        {section === 'forecast'    && <Forecast    {...childProps}/>}
        {section === 'heatmap'     && <Heatmap     {...childProps}/>}
        {section === 'products'    && <Products    {...childProps}/>}
        {section === 'export'      && <Export      {...childProps}/>}
      </div>
    </div>
  );
}
