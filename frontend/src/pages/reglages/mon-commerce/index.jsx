// Réglages > Mon commerce — sous-tabs : informations / horaires / photos / compte.
import { useLocation, useNavigate } from 'react-router-dom';
import { SubTabs, PageHeader } from '../shared';
import Informations from './Informations';
import Horaires from './Horaires';
import Photos from './Photos';
import Compte from './Compte';

const SECTIONS = [
  { id: 'informations', label: 'Informations', icon: 'storefront' },
  { id: 'horaires',     label: 'Horaires',     icon: 'clock'      },
  { id: 'photos',       label: 'Photos',       icon: 'image'      },
  { id: 'compte',       label: 'Compte',       icon: 'lock'       },
];

export default function MonCommerce(props) {
  const loc = useLocation();
  const navigate = useNavigate();
  const parts = loc.pathname.replace(/^\/reglages\/mon-commerce\/?/, '').split('/').filter(Boolean);
  const section = SECTIONS.find(s => s.id === parts[0])?.id || 'informations';

  const setSection = (id) => navigate('/reglages/mon-commerce/' + id);

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'18px 16px',
                  display:'flex', flexDirection:'column', gap:14 }}>
      <PageHeader backTo="/reglages" crumb="Réglages"
                  title="Mon commerce"
                  subtitle="Identité du salon, horaires, photos, compte"/>
      <SubTabs tabs={SECTIONS} active={section} onChange={setSection}/>

      {section === 'informations' && <Informations {...props}/>}
      {section === 'horaires'     && <Horaires     {...props}/>}
      {section === 'photos'       && <Photos       {...props}/>}
      {section === 'compte'       && <Compte       {...props}/>}
    </div>
  );
}
