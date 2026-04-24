// Réglages > Réservations — sous-tabs : configuration / categories / prestations / notifications.
import { useLocation, useNavigate } from 'react-router-dom';
import { SubTabs, PageHeader } from '../shared';
import Configuration from './Configuration';
import CategoriesBooking from './CategoriesBooking';
import Prestations from './Prestations';
import Notifications from './Notifications';

const SECTIONS = [
  { id: 'configuration', label: 'Configuration', icon: 'settings' },
  { id: 'categories',    label: 'Catégories',    icon: 'tag'      },
  { id: 'prestations',   label: 'Prestations',   icon: 'scissors' },
  { id: 'notifications', label: 'Notifications', icon: 'bell'     },
];

export default function Reservations(props) {
  const loc = useLocation();
  const navigate = useNavigate();
  const parts = loc.pathname.replace(/^\/reglages\/reservations\/?/, '').split('/').filter(Boolean);
  const section = SECTIONS.find(s => s.id === parts[0])?.id || 'configuration';

  const setSection = (id) => navigate('/reglages/reservations/' + id);

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'18px 16px',
                  display:'flex', flexDirection:'column', gap:14 }}>
      <PageHeader backTo="/reglages" crumb="Réglages"
                  title="Réservations"
                  subtitle="Page publique, prestations, notifications clients"/>
      <SubTabs tabs={SECTIONS} active={section} onChange={setSection}/>

      {section === 'configuration' && <Configuration     {...props}/>}
      {section === 'categories'    && <CategoriesBooking {...props}/>}
      {section === 'prestations'   && <Prestations       {...props}/>}
      {section === 'notifications' && <Notifications     {...props}/>}
    </div>
  );
}
