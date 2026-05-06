// Réglages > Réservations — sous-tabs : configuration / prestations / agenda-google.
// Notifications déplacées vers /reglages/communication (refonte 2026-05-06).
// 'categories' et 'notifications' redirigent pour préserver bookmarks/raccourcis.
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SubTabs, PageHeader } from '../shared';
import Configuration from './Configuration';
import Prestations from './Prestations';
import GoogleCalendarSync from './GoogleCalendarSync';

const SECTIONS = [
  { id: 'configuration', label: 'Configuration',        icon: 'settings' },
  { id: 'prestations',   label: 'Prestations en ligne', icon: 'scissors' },
  { id: 'agenda-google', label: 'Synchronisation',      icon: 'calendar' },
];

export default function Reservations(props) {
  const loc = useLocation();
  const navigate = useNavigate();
  const parts = loc.pathname.replace(/^\/reglages\/reservations\/?/, '').split('/').filter(Boolean);

  // Retro-compat : ancien lien /reservations/categories -> /prestations,
  // ancien lien /reservations/notifications -> /reglages/communication.
  useEffect(() => {
    if (parts[0] === 'categories') {
      navigate('/reglages/reservations/prestations', { replace: true });
    } else if (parts[0] === 'notifications') {
      navigate('/reglages/communication', { replace: true });
    }
  }, [parts, navigate]);

  const section = SECTIONS.find(s => s.id === parts[0])?.id || 'configuration';

  const setSection = (id) => navigate('/reglages/reservations/' + id);

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'18px 16px',
                  display:'flex', flexDirection:'column', gap:14 }}>
      <PageHeader backTo="/reglages" crumb="Réglages"
                  title="Réservation en ligne"
                  subtitle="Page publique, prestations, synchronisation Google Calendar"/>
      <SubTabs tabs={SECTIONS} active={section} onChange={setSection}/>

      {section === 'configuration' && <Configuration {...props}/>}
      {section === 'prestations'   && <Prestations   {...props}/>}
      {section === 'agenda-google' && <GoogleCalendarSync {...props}/>}
    </div>
  );
}
