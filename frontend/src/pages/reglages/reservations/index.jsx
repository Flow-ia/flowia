// Réglages > Réservations — sous-tabs : configuration / prestations / notifications.
// Note historique : 'categories' et 'prestations' rendaient le MEME composant
// (BookingServices). On a fusionne les deux en 'Prestations sur site' et on
// redirige l'ancien lien /reservations/categories pour ne pas casser les
// bookmarks/raccourcis.
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SubTabs, PageHeader } from '../shared';
import Configuration from './Configuration';
import Prestations from './Prestations';
import Notifications from './Notifications';
import GoogleCalendarSync from './GoogleCalendarSync';

const SECTIONS = [
  { id: 'configuration', label: 'Configuration',        icon: 'settings' },
  { id: 'prestations',   label: 'Prestations sur site', icon: 'scissors' },
  { id: 'notifications', label: 'Notifications',        icon: 'bell'     },
  { id: 'agenda-google', label: 'Synchronisation',      icon: 'calendar' },
];

export default function Reservations(props) {
  const loc = useLocation();
  const navigate = useNavigate();
  const parts = loc.pathname.replace(/^\/reglages\/reservations\/?/, '').split('/').filter(Boolean);

  // Retro-compat : ancienne URL /reglages/reservations/categories -> /prestations
  useEffect(() => {
    if (parts[0] === 'categories') {
      navigate('/reglages/reservations/prestations', { replace: true });
    }
  }, [parts, navigate]);

  const section = SECTIONS.find(s => s.id === parts[0])?.id || 'configuration';

  const setSection = (id) => navigate('/reglages/reservations/' + id);

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'18px 16px',
                  display:'flex', flexDirection:'column', gap:14 }}>
      <PageHeader backTo="/reglages" crumb="Réglages"
                  title="Réservations"
                  subtitle="Page publique, prestations, notifications clients"/>
      <SubTabs tabs={SECTIONS} active={section} onChange={setSection}/>

      {section === 'configuration' && <Configuration {...props}/>}
      {section === 'prestations'   && <Prestations   {...props}/>}
      {section === 'notifications' && <Notifications {...props}/>}
      {section === 'agenda-google' && <GoogleCalendarSync {...props}/>}
    </div>
  );
}
