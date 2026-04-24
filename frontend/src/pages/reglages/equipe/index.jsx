// Réglages > Équipe — sous-tabs : membres / horaires / timeslots / commissions / absences / securite.
import { useLocation, useNavigate } from 'react-router-dom';
import { SubTabs, PageHeader } from '../shared';
import Membres from './Membres';
import Horaires from './Horaires';
import TimeSlots from './TimeSlots';
import Commissions from './Commissions';
import Absences from './Absences';
import Securite from './Securite';

const SECTIONS = [
  { id: 'membres',     label: 'Membres',     icon: 'users'    },
  { id: 'horaires',    label: 'Horaires',    icon: 'clock'    },
  { id: 'timeslots',   label: 'Plages',      icon: 'clock'    },
  { id: 'commissions', label: 'Commissions', icon: 'award'    },
  { id: 'absences',    label: 'Absences',    icon: 'calendar' },
  { id: 'securite',    label: 'Sécurité',    icon: 'lock'     },
];

export default function Equipe(props) {
  const loc = useLocation();
  const navigate = useNavigate();
  const parts = loc.pathname.replace(/^\/reglages\/equipe\/?/, '').split('/').filter(Boolean);
  const section = SECTIONS.find(s => s.id === parts[0])?.id || 'membres';

  const setSection = (id) => navigate('/reglages/equipe/' + id);

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'18px 16px',
                  display:'flex', flexDirection:'column', gap:14 }}>
      <PageHeader backTo="/reglages" crumb="Réglages"
                  title="Équipe"
                  subtitle="Membres, permissions, horaires, absences, commissions, sécurité"/>
      <SubTabs tabs={SECTIONS} active={section} onChange={setSection}/>

      {section === 'membres'     && <Membres     {...props}/>}
      {section === 'horaires'    && <Horaires    {...props}/>}
      {section === 'timeslots'   && <TimeSlots   {...props}/>}
      {section === 'commissions' && <Commissions {...props}/>}
      {section === 'absences'    && <Absences    {...props}/>}
      {section === 'securite'    && <Securite    {...props}/>}
    </div>
  );
}
