// Réglages > Équipe — sous-tabs : membres / horaires / commissions / absences.
//
// Nettoyage :
// - 'timeslots' supprime : etait un stub d'attente sans logique metier, redondant
//   avec l'onglet 'horaires'. Aucune feature perdue.
// - 'securite' deplace dans Mon commerce (PIN/tablette/session/mode veille
//   concernent l'identite + l'acces du commerce, pas l'equipe stricto sensu).
// Les anciens liens /equipe/timeslots et /equipe/securite redirigent.
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SubTabs, PageHeader } from '../shared';
import Membres from './Membres';
import Horaires from './Horaires';
import Commissions from './Commissions';
import Absences from './Absences';

const SECTIONS = [
  { id: 'membres',     label: 'Membres',     icon: 'users'    },
  { id: 'horaires',    label: 'Horaires',    icon: 'clock'    },
  { id: 'commissions', label: 'Commissions', icon: 'award'    },
  { id: 'absences',    label: 'Absences',    icon: 'calendar' },
];

export default function Equipe(props) {
  const loc = useLocation();
  const navigate = useNavigate();
  const parts = loc.pathname.replace(/^\/reglages\/equipe\/?/, '').split('/').filter(Boolean);

  // Retro-compat : anciens liens
  useEffect(() => {
    if (parts[0] === 'timeslots') {
      // Plages = horaires en pratique aujourd'hui
      navigate('/reglages/equipe/horaires', { replace: true });
    } else if (parts[0] === 'securite') {
      navigate('/reglages/mon-commerce/securite', { replace: true });
    }
  }, [parts, navigate]);

  const section = SECTIONS.find(s => s.id === parts[0])?.id || 'membres';

  const setSection = (id) => navigate('/reglages/equipe/' + id);

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'18px 16px',
                  display:'flex', flexDirection:'column', gap:14 }}>
      <PageHeader backTo="/reglages" crumb="Réglages"
                  title="Équipe"
                  subtitle="Membres, permissions, horaires, absences, commissions"/>
      <SubTabs tabs={SECTIONS} active={section} onChange={setSection}/>

      {section === 'membres'     && <Membres     {...props}/>}
      {section === 'horaires'    && <Horaires    {...props}/>}
      {section === 'commissions' && <Commissions {...props}/>}
      {section === 'absences'    && <Absences    {...props}/>}
    </div>
  );
}
